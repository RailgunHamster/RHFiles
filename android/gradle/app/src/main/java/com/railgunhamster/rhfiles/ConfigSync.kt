package com.railgunhamster.rhfiles

import android.content.Context
import android.util.AtomicFile
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit
import com.railgunhamster.rhfiles.SafeFiles.readBytesBounded

/** WebDAV I/O is off the UI thread. Local application is separately journaled/acked. */
class ConfigSync(private val context:Context,private val remotes:RemoteStorage,private val settingsLock:Any=Any()) {
  companion object {
    const val PREFS="settings-sync-v1"
    fun rawConfig(context:Context,remotes:RemoteStorage):JSONObject=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString("config",null)?.let(remotes::unsealLocal)?:JSONObject().put("enabled",false).put("url","").put("username","").put("password","").put("insecure",false)
    internal fun validateConfig(value:JSONObject,allowEmpty:Boolean=false){
      require(value.toString().length<=16384&&value.opt("enabled") is Boolean&&value.opt("insecure") is Boolean){"同步选项无效"}
      for(key in listOf("url","username","password"))require(value.opt(key) is String&&value.getString(key).length<=8192){"同步设置字段无效"}
      if(allowEmpty&&value.getString("url").isEmpty()&&!value.getBoolean("enabled"))return
      val u=value.getString("url").toHttpUrl();require(u.username.isEmpty()&&u.password.isEmpty()&&u.query==null&&u.fragment==null){"WebDAV 地址不能包含账号、密码或查询参数"}
      require(u.isHttps||value.getBoolean("insecure")){"请使用 HTTPS，或明确允许可信局域网的明文 HTTP"}
    }
    internal fun restoredPrefs(context:Context,remotes:RemoteStorage,value:JSONObject):JSONObject {validateConfig(value,true);return JSONObject().put("config",remotes.sealLocal(JSONObject(value.toString()).put("enabled",false)))}
  }
  private val prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
  private val journal=AtomicFile(File(context.filesDir,"shared-config-apply.json"))
  private val http=OkHttpClient.Builder().connectTimeout(5,TimeUnit.SECONDS).readTimeout(10,TimeUnit.SECONDS).writeTimeout(10,TimeUnit.SECONDS).callTimeout(15,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()
  @Volatile var busy=false;private set
  @Volatile private var phase="idle"
  @Volatile private var message=""
  private var proposal:JSONObject?=null
  private var conflict:JSONObject?=null
  private var call:Call?=null
  private fun raw(name:String)=JSONObject(context.getSharedPreferences(name,Context.MODE_PRIVATE).all)
  private fun replace(name:String,value:JSONObject){val e=context.getSharedPreferences(name,Context.MODE_PRIVATE).edit().clear();for(key in value.keys())when(val v=value.get(key)){is String->e.putString(key,v);is Boolean->e.putBoolean(key,v);is Number->e.putLong(key,v.toLong());else->error("配置类型无效")};check(e.commit()){"配置保存失败"}}
  fun config():JSONObject=rawConfig(context,remotes).also{it.put("hasPassword",it.optString("password").isNotEmpty());it.remove("password")}
  fun status():JSONObject=synchronized(settingsLock){JSONObject().put("config",config()).put("state",phase).put("message",message).put("lastSuccess",prefs.getLong("lastSuccess",0)).put("conflicts",conflict?.getJSONArray("items")?:JSONArray()).put("conflictToken",conflict?.getString("token")?:"")}
  fun save(args:JSONObject):JSONObject=synchronized(settingsLock){
    require(!busy&&!journal.baseFile.exists()){"请等待当前同步完成"};val old=rawConfig(context,remotes)
    val next=JSONObject().put("enabled",args.optBoolean("enabled")).put("url",args.optString("url").trim()).put("username",args.optString("username")).put("insecure",args.optBoolean("insecure")).put("password",args.optString("password"))
    val same=old.optString("url")==next.getString("url")&&old.optString("username")==next.getString("username")
    if(args.optBoolean("clearPassword"))next.put("password","")else if(next.getString("password").isEmpty()){
      require(same||old.optString("password").isEmpty()){"更换 WebDAV 地址或账号时请重填密码，或选择清除密码"};next.put("password",if(same)old.optString("password")else"")
    }
    validateConfig(next,true);val edit=prefs.edit().putString("config",remotes.sealLocal(next));if(!same)edit.remove("base").remove("lastSuccess");check(edit.commit()){"同步设置保存失败"};proposal=null;conflict=null;phase="idle";message="";status()
  }
  private fun fail(code:Int):Nothing=error(when(code){401->"WebDAV 登录失败（401），请检查用户名和密码";403->"WebDAV 拒绝访问（403），请检查目录读写权限";404,409->"WebDAV 目录不存在，请先创建配置中填写的文件夹";in 300..399->"WebDAV 返回重定向，请填写最终 HTTPS 地址；未向其他地址发送密码";else->"WebDAV 请求失败（HTTP $code）"})
  private fun request(c:JSONObject,etag:String?=null,bytes:ByteArray?=null):Response {
    val folder=c.getString("url").toHttpUrl();val url=folder.newBuilder().apply{if(!folder.encodedPath.endsWith('/'))addPathSegment("")}.addPathSegment("rhfiles-settings-v1.json").build()
    val b=Request.Builder().url(url).header("Accept","application/json")
    if(c.getString("username").isNotEmpty()||c.getString("password").isNotEmpty())b.header("Authorization",Credentials.basic(c.getString("username"),c.getString("password")))
    if(bytes!=null){if(etag==null)b.header("If-None-Match","*")else b.header("If-Match",etag);b.put(bytes.toRequestBody("application/json; charset=utf-8".toMediaType()))}
    return http.newCall(b.build()).also{call=it}.execute()
  }
  private fun readBody(response:Response):JSONObject {
    val body=response.body?:error("WebDAV 未返回配置内容");require(body.contentLength()<=SharedConfig.LIMIT){"同步配置超过 1 MB 上限"}
    val bytes=body.byteStream().use{it.readBytesBounded(SharedConfig.LIMIT)}
    return try{SharedConfig.parse(String(bytes,Charsets.UTF_8)).also{SharedConfig.validate(it,remotes::validate)}}catch(e:Exception){throw IllegalArgumentException("WebDAV 同步文件无效，未更改本机配置：${e.message}")}
  }
  private fun local(web:JSONObject):JSONObject {SettingsBackup.validateWeb(web);val f=JSONArray(web.optString("rhfiles.favorites","[]"));return SharedConfig.snapshot(remotes.backupProfiles(),f).also{SharedConfig.validate(it,remotes::validate)}}
  fun run(web:JSONObject,manual:Boolean,token:String="",choice:String=""):JSONObject {
    val c:JSONObject;val local:JSONObject;val base:JSONObject;val resolution:JSONObject?
    synchronized(settingsLock){
      require(!busy&&!journal.baseFile.exists()&&!prefs.contains("rollback")){"上一次配置同步尚未完成，请重新打开应用"}
      c=rawConfig(context,remotes);if(!manual&&!c.getBoolean("enabled"))return status();validateConfig(c)
      local=local(web);base=JSONObject(prefs.getString("base",null)?:SharedConfig.empty().toString());resolution=conflict
      if(choice.isNotEmpty())require(choice in listOf("local","remote")&&resolution?.optString("token")==token&&SharedConfig.same(local,resolution.getJSONObject("local"))){"配置已经变化，请重新同步并确认冲突"}
      busy=true;phase="syncing";message="正在同步配置…";proposal=null
    }
    try{
      repeat(3){
        var etag:String?=null;var missing=false
        val remote=request(c).use{r->if(r.code==404){missing=true;SharedConfig.empty()}else{if(!r.isSuccessful)fail(r.code);etag=r.header("ETag");readBody(r)}}
        if(choice.isNotEmpty())require(etag==resolution?.optString("etag")&&missing==resolution?.optBoolean("missing")){"云端配置已变化，请重新同步并确认冲突"}
        val merged=SharedConfig.merge(if(missing)SharedConfig.empty()else base,local,remote,choice.takeIf{it.isNotEmpty()})
        if(merged.conflicts.length()>0&&choice.isEmpty())return synchronized(settingsLock){conflict=JSONObject().put("token",UUID.randomUUID().toString()).put("etag",etag?:"").put("missing",missing).put("local",local).put("items",merged.conflicts);phase="conflict";message="两端修改了相同项目，请选择冲突处理方式";status()}
        SharedConfig.validate(merged.document,remotes::validate)
        if(!SharedConfig.same(remote,merged.document)||missing){
          require(missing||(!etag.isNullOrBlank()&&!etag!!.startsWith("W/"))){"服务器没有提供强 ETag，已停止上传以防覆盖其他设备的更改"}
          val result=request(c,etag,SharedConfig.canonical(merged.document).toByteArray()).use{r->if(r.code==412)false else {if(!r.isSuccessful)fail(r.code);true}}
          if(!result){if(choice.isNotEmpty())error("云端配置已变化，请重新确认冲突");return@repeat}
        }
        return synchronized(settingsLock){
          require(SharedConfig.same(local,local(web))){"同步期间网络位置发生变化，请重试"}
          check(prefs.edit().putString("base",SharedConfig.receipt(if(missing)SharedConfig.empty()else base,local,merged.document).toString()).commit()){"上传回执保存失败"}
          val id=UUID.randomUUID().toString();proposal=JSONObject().put("id",id).put("document",merged.document).put("local",local).put("web",web)
          conflict=null;phase="ready";message="配置已合并，正在应用到本机";status().put("proposalId",id)
        }
      }
      error("其他设备正在修改云端配置，请稍后重试")
    }catch(e:Exception){synchronized(settingsLock){phase="failed";message=e.message?:"配置同步失败"};throw e}
    finally{synchronized(settingsLock){busy=false;call=null}}
  }
  fun apply(id:String,web:JSONObject):JSONObject=synchronized(settingsLock){
    try{
    val p=proposal?:error("同步结果已过期，请重新同步");require(p.getString("id")==id&&!busy&&!journal.baseFile.exists()){"配置同步尚未完成"}
    require(SharedConfig.same(local(web),p.getJSONObject("local"))&&SharedConfig.same(JSONArray(web.optString("rhfiles.favorites","[]")),JSONArray(p.getJSONObject("web").optString("rhfiles.favorites","[]")))){"同步期间收藏或网络位置已改变，已保留更改，请重新同步"}
    val doc=p.getJSONObject("document");val incoming=doc.getJSONArray("profiles");val old=remotes.backupProfiles();val secrets=(0 until old.length()).associate{old.getJSONObject(it).getString("id") to old.getJSONObject(it).getJSONObject("config")}
    val prepared=JSONArray();for(i in 0 until incoming.length()){
      val item=incoming.getJSONObject(i);val config=JSONObject(item.getJSONObject("config").toString());val prior=secrets[item.getString("id")]
      fun identity(c:JSONObject)=listOf(c.optString("type"),c.optString("host").lowercase(),c.optInt("port",if(c.optString("type")=="smb")445 else 21).toString(),c.optString("url"),c.optString("username"),c.optString("domain"))
      config.put("password",if(prior!=null&&identity(prior)==identity(config))prior.optString("password")else"");prepared.put(JSONObject().put("id",item.getString("id")).put("config",config))
    }
    val favorites=SharedConfig.localFavorites(JSONArray(web.optString("rhfiles.favorites","[]")),doc.getJSONArray("favorites"));val encrypted=remotes.prepareProfiles(prepared)
    val before=JSONObject().put("remote",raw("remote-v1")).put("sync",raw(PREFS)).put("favorites",web.optString("rhfiles.favorites","[]")).put("after",favorites.toString())
    val output=journal.startWrite();try{output.write(before.toString().toByteArray());journal.finishWrite(output)}catch(e:Exception){journal.failWrite(output);throw e}
    try{replace("remote-v1",encrypted);RemoteStorage.discardReadSessions();busy=true;phase="applying";JSONObject().put("id",id).put("favorites",favorites)}catch(e:Exception){recover();throw e}
    }catch(e:Exception){phase="failed";message=e.message?:"同步配置未应用";throw e}
  }
  fun acknowledge(id:String):JSONObject=synchronized(settingsLock){
    val p=proposal?:error("同步结果已过期");require(p.getString("id")==id&&journal.baseFile.exists()){"同步事务无效"}
    check(prefs.edit().putString("base",p.getJSONObject("document").toString()).putLong("lastSuccess",System.currentTimeMillis()).commit()){"同步记录保存失败"};journal.delete();require(!journal.baseFile.exists()){"无法确认同步，请重试"};busy=false;proposal=null;phase="success";message="已同步网络位置和网络收藏（不包含密码）";status()
  }
  fun recover():JSONObject?=synchronized(settingsLock){
    if(journal.baseFile.exists()||File(journal.baseFile.path+".bak").exists()){
      val before=JSONObject(journal.openRead().use{String(it.readBytesBounded(8*1024*1024),Charsets.UTF_8)})
      replace("remote-v1",before.getJSONObject("remote"));replace(PREFS,before.getJSONObject("sync"));check(prefs.edit().putString("rollback",JSONObject().put("favorites",before.getString("favorites")).put("after",before.getString("after")).toString()).commit());journal.delete();RemoteStorage.discardReadSessions();phase="failed";message="上次配置同步未确认，已恢复原配置"
    }
    busy=false;proposal=null;prefs.getString("rollback",null)?.let(::JSONObject)
  }
  fun rollbackWeb():JSONObject?=prefs.getString("rollback",null)?.let(::JSONObject)
  fun clearRollback(){check(prefs.edit().remove("rollback").commit())}
  fun isApplying()=phase=="applying"
  fun invalidate(){synchronized(settingsLock){require(!busy&&!journal.baseFile.exists()){"请等待当前配置同步完成"};proposal=null;conflict=null;phase="idle";message=""}}
  fun close(){call?.cancel();http.dispatcher.executorService.shutdown()}
}
