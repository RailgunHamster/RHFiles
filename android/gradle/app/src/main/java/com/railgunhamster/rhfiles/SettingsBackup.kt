package com.railgunhamster.rhfiles

import android.content.Context
import android.util.AtomicFile
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/** Authenticated password-encrypted portable settings. Credentials only exist
 * inside the native process and authenticated ciphertext, never WebView JSON. */
class SettingsBackup(private val context:Context,private val remotes:RemoteStorage=RemoteStorage(context),private val validateUpdates:(JSONObject)->Unit={}) {
  companion object {
    const val LIMIT=8*1024*1024
    private const val ITERATIONS=1_300_000 // HMAC-SHA1 PBKDF2 is available on Android 7+.
    private const val HEADER="RHFiles-Android-Config:1:PBKDF2-HMAC-SHA1:1300000:AES-256-GCM"
    private val random=SecureRandom()
    private fun cipher(mode:Int,password:CharArray,salt:ByteArray,iv:ByteArray):Cipher {
      require(password.size in 8..1024){"备份密码至少 8 个字符，最多 1024 个字符"}
      val spec=PBEKeySpec(password,salt,ITERATIONS,256)
      val derived=try{SecretKeyFactory.getInstance("PBKDF2WithHmacSHA1").generateSecret(spec).encoded}finally{spec.clearPassword()}
      return try{Cipher.getInstance("AES/GCM/NoPadding").apply{init(mode,SecretKeySpec(derived,"AES"),GCMParameterSpec(128,iv));updateAAD(HEADER.toByteArray())}}finally{derived.fill(0)}
    }
    internal fun seal(payload:JSONObject,password:CharArray):ByteArray {
      val plain=payload.toString().toByteArray();require(plain.size<=4*1024*1024){"配置过大"}
      val salt=ByteArray(16).also(random::nextBytes);val iv=ByteArray(12).also(random::nextBytes)
      val encrypted=try{cipher(Cipher.ENCRYPT_MODE,password,salt,iv).doFinal(plain)}finally{plain.fill(0)}
      fun b(bytes:ByteArray)=Base64.encodeToString(bytes,Base64.NO_WRAP)
      return JSONObject().put("format",HEADER).put("salt",b(salt)).put("iv",b(iv)).put("data",b(encrypted)).toString().toByteArray()
    }
    internal fun unseal(bytes:ByteArray,password:CharArray):JSONObject {
      require(bytes.size<=LIMIT){"配置文件超过 8 MB 上限"};val envelope=try{JSONObject(String(bytes,Charsets.UTF_8))}catch(_:Exception){error("不是有效的 RHFiles 配置备份")}
      require(envelope.getString("format")==HEADER){"不支持的配置备份版本"}
      fun b(key:String)=Base64.decode(envelope.getString(key),Base64.NO_WRAP)
      val salt=b("salt");val iv=b("iv");val data=b("data");require(salt.size==16&&iv.size==12&&data.size in 16..4*1024*1024+16){"配置文件已损坏"}
      val plain=try{cipher(Cipher.DECRYPT_MODE,password,salt,iv).doFinal(data)}catch(_:Exception){error("备份密码错误或文件已损坏；当前配置未改变")}
      return try{JSONObject(String(plain,Charsets.UTF_8))}finally{plain.fill(0)}
    }
    internal fun validateWeb(web:JSONObject) {
      val enums=mapOf("rhfiles.theme" to listOf("light","dark"),"rhfiles.view" to listOf("list","grid"),"rhfiles.sort" to listOf("name","date","size","kind"),"rhfiles.hidden" to listOf("0","1"),"rhfiles.panes" to listOf("auto","single","columns","rows"))
      web.keys().forEach{key->val text=web.getString(key);require(text.length<=65536){"配置字段过长"};when(key){
        in enums->require(text in enums.getValue(key)){"配置选项无效"}
        "rhfiles.panes.screens"->{
          val value=JSONObject(text);val version=value.get("version");require(value.length()==2&&version is Number&&version.toDouble() in listOf(1.0,2.0)){"屏幕分屏配置无效"}
          val screens=value.getJSONObject("screens");require(screens.length()<=32){"屏幕分屏配置过多"}
          screens.keys().forEach{screen->
            require(Regex("^(default|screen-[1-9][0-9]{1,4}x[1-9][0-9]{1,4})$").matches(screen)){"屏幕分屏配置无效"}
            if((version as Number).toDouble()==1.0)require(screens.get(screen) in enums.getValue("rhfiles.panes")){"屏幕分屏配置无效"}
            else {
              val profile=screens.getJSONObject(screen);require(profile.length() in 1..2){"屏幕方向配置无效"}
              profile.keys().forEach{direction->require(direction in listOf("portrait","landscape")&&profile.get(direction) in enums.getValue("rhfiles.panes")){"屏幕方向配置无效"}}
            }
          }
        }
        "rhfiles.nearby.alias"->require(text.length<=80){"设备名称过长"}
        "rhfiles.favorites"->{val items=JSONArray(text);require(items.length()<=100){"收藏夹过大"};for(i in 0 until items.length()){val item=items.getJSONObject(i);require(item.getString("name").length<=1024&&item.getString("path").length<=8192){"收藏夹项目无效"};if(item.has("label"))require(item.get("label") is String&&item.getString("label").isNotBlank()&&item.getString("label").length<=1024){"收藏名称无效"}}}
        else->error("配置包含未知字段")
      }}
    }
  }
  private val journal=AtomicFile(File(context.filesDir,"settings-restore-journal.json"))
  private val pending get()=context.getSharedPreferences("config-restore-v1",Context.MODE_PRIVATE)
  fun snapshot(web:JSONObject,updates:JSONObject):JSONObject {
    validateWeb(web)
    return JSONObject().put("schemaVersion",1).put("platform","android").put("web",web).put("updates",updates).put("profiles",remotes.backupProfiles()).put("reader",ReaderSettings.state(context).getJSONObject("values"))
  }
  fun validate(payload:JSONObject) {
    require(payload.getInt("schemaVersion")==1&&payload.getString("platform")=="android"){"配置版本或平台不兼容"}
    validateWeb(payload.getJSONObject("web"));ReaderSettings.validate(payload.getJSONObject("reader"))
    val profiles=payload.getJSONArray("profiles");require(profiles.length()<=200){"网络位置过多"};val ids=mutableSetOf<String>()
    for(i in 0 until profiles.length()){val item=profiles.getJSONObject(i);val id=item.getString("id");require(UUID.fromString(id).toString()==id&&ids.add(id)){"网络位置 ID 无效或重复"};remotes.validate(item.getJSONObject("config"))}
    val updates=payload.getJSONObject("updates");validateUpdates(updates)
    val connection=updates.optString("connectionId");require(connection.isEmpty()||connection in ids){"更新配置引用了缺失的网络位置"}
    if(connection.isNotEmpty()&&!updates.getString("family").startsWith("http")){
      val unc=RemoteStorage.parseUnc(updates.getString("family"));val c=(0 until profiles.length()).map{profiles.getJSONObject(it)}.first{it.getString("id")==connection}.getJSONObject("config")
      require(c.getString("type")=="smb"&&c.getString("host").equals(unc.host,true)&&c.getString("share").equals(unc.share,true)){"更新登录配置与服务器不一致"}
    }
  }
  private fun rawPrefs(name:String)=JSONObject(context.getSharedPreferences(name,Context.MODE_PRIVATE).all)
  private fun prefs(name:String,value:JSONObject){val editor=context.getSharedPreferences(name,Context.MODE_PRIVATE).edit().clear();value.keys().forEach{key->when(val v=value.get(key)){is String->editor.putString(key,v);is Boolean->editor.putBoolean(key,v);is Number->editor.putLong(key,v.toLong());else->error("内部配置类型无效")}};require(editor.commit()){"配置写入失败"}}
  private fun current()=JSONObject().put("remote",rawPrefs("remote-v1")).put("updates",rawPrefs("updates-v1")).put("pending",rawPrefs("config-restore-v1")).put("reader",ReaderSettings.state(context).getJSONObject("values"))
  private fun restore(snapshot:JSONObject){prefs("remote-v1",snapshot.getJSONObject("remote"));prefs("updates-v1",snapshot.getJSONObject("updates"));ReaderSettings.replace(context,snapshot.getJSONObject("reader"));prefs("config-restore-v1",snapshot.getJSONObject("pending"))}
  private fun hasJournal()=journal.baseFile.exists()||File(journal.baseFile.path+".bak").exists()
  @Synchronized fun recover(){if(hasJournal()){
    val before=JSONObject(journal.openRead().bufferedReader().use{it.readText()});restore(before)
    if(before.has("web"))prefs("config-restore-v1",JSONObject().put("id",UUID.randomUUID().toString()).put("web",before.getJSONObject("web").toString()))
    journal.delete();require(!hasJournal()){"无法完成配置恢复，请重试"}
  }}
  @Synchronized fun apply(payload:JSONObject,currentWeb:JSONObject=JSONObject()){
    require(!hasJournal()){"上一次配置导入尚未确认，请重新打开应用"}
    validate(payload);validateWeb(currentWeb);val prepared=remotes.prepareProfiles(payload.getJSONArray("profiles"));val before=current().put("web",currentWeb)
    val stream=journal.startWrite();try{stream.write(before.toString().toByteArray());journal.finishWrite(stream)}catch(e:Exception){journal.failWrite(stream);throw e}
    try{
      prefs("remote-v1",prepared);prefs("updates-v1",JSONObject(payload.getJSONObject("updates").toString()).put("pendingInstall",false));ReaderSettings.replace(context,payload.getJSONObject("reader"))
      prefs("config-restore-v1",JSONObject().put("id",UUID.randomUUID().toString()).put("web",payload.getJSONObject("web").toString()))
    }catch(e:Exception){restore(before);journal.delete();throw e}
  }
  fun pending():JSONObject?=pending.getString("id",null)?.let{JSONObject().put("id",it).put("web",JSONObject(pending.getString("web","{}")!!))}
  @Synchronized fun acknowledge(id:String){if(pending.getString("id",null)==id){journal.delete();require(!hasJournal()){"无法确认配置，请重试"};require(pending.edit().clear().commit()){"配置确认失败"}}}
}
