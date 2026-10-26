package com.railgunhamster.rhfiles

import android.content.Context
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.net.Proxy
import java.util.UUID
import java.util.concurrent.TimeUnit

/** RHFiles client of RHVideo's API. No database access, persisted password or
 * bearer in the WebView/Intent. Only registered opaque media IDs can be read. */
internal class RhVideoClient(context:Context,operationManifest:JSONObject?=null) {
  companion object {
    @Volatile private var instance:RhVideoClient?=null
    fun get(context:Context):RhVideoClient=instance?:synchronized(this){instance?:RhVideoClient(context.applicationContext).also{instance=it}}
    fun base(value:String):HttpUrl {
      require(value.length<=4096&&!value.any{it.code<32}){"服务器地址无效"}
      val input=value.trim().toHttpUrl()
      require(input.username.isEmpty()&&input.password.isEmpty()&&input.query==null&&input.fragment==null){"地址不能包含账号、查询或片段"}
      var path=input.encodedPath.trimEnd('/')
      for(suffix in listOf("/static/index.html","/api/v1"))if(path.endsWith(suffix))path=path.removeSuffix(suffix)
      return input.newBuilder().encodedPath("$path/").build()
    }
    private fun id(args:JSONObject):String=args.getString("id").also{require(it.matches(Regex("[A-Za-z0-9_-]{1,128}"))){"媒体编号无效"}}
    private fun kind(args:JSONObject):String=args.optString("kind","video").also{require(it in listOf("video","picture","novel","favorite")){"媒体分类无效"}}
    internal fun storagePath(value:String):String {
      val decoded=java.net.URLDecoder.decode(value.replace("+","%2B"),"UTF-8")
      val path=decoded.removePrefix("/").let{if(it.startsWith("storage/"))it else "storage/$it"}
      require(path.length<=8192&&!path.contains(Regex("[%\\\\?#\\x00-\\x1f]"))&&path.split('/').none{it=="."||it==".."||it.isEmpty()}){"服务器返回了无效的媒体地址"}
      return path
    }
  }
  private data class Session(val base:HttpUrl,val username:String,@Volatile var token:String,val generation:Long,@Volatile var refreshAt:Long)
  private data class Asset(val session:Session,val path:String,val image:Boolean)
  private val lock=Any()
  private val prefs=context.getSharedPreferences("rhvideo-client-v1",Context.MODE_PRIVATE)
  private val contract by lazy{RhVideoContract(operationManifest?:JSONObject(context.assets.open("rhvideo/rhvideo-operations.json").bufferedReader().use{it.readText()}))}
  private val refreshLock=Any()
  private val http=OkHttpClient.Builder().proxy(Proxy.NO_PROXY).followRedirects(false).followSslRedirects(false)
    .connectTimeout(8,TimeUnit.SECONDS).readTimeout(25,TimeUnit.SECONDS).callTimeout(45,TimeUnit.SECONDS).build()
  private val mediaHttp=http.newBuilder().callTimeout(0,TimeUnit.SECONDS).build()
  private var session:Session?=null
  private var generation=0L
  private var assetRevision=0L
  private val assets=linkedMapOf<String,Asset>()
  private data class VideoCatalog(val checked:Long,val etag:String?,val rows:JSONArray)
  private val catalogLock=Any()
  private var videoCache:VideoCatalog?=null
  private data class Prepared(val ticket:String,val generation:Long,val entries:MutableList<JSONObject>,val options:JSONObject)
  private var prepared:Prepared?=null
  data class Window(val items:List<PlaybackQueue.Item>,val offset:Int,val index:Int,val total:Int,val options:JSONObject,val starts:List<Long>,val ends:List<Long>)
  fun gridWindow(ticket:String,offset:Int,count:Int,lowBandwidth:Boolean):JSONObject {
    val s=current();require(count in 1..9)
    return synchronized(lock){
      val q=prepared?.takeIf{it.ticket==ticket&&it.generation==s.generation&&it.entries.isNotEmpty()}?:error("网格队列已失效")
      require(offset>=0&&offset<q.entries.size&&offset%count==0){"网格位置无效"}
      val items=(offset until (offset+count).coerceAtMost(q.entries.size)).map{n->val entry=q.entries[n];PlaybackQueue.Item(asset(s,"api/v1/videos/${id(entry)}/play"+(if(lowBandwidth)"?super=true"else""),false),entry.optString("title","视频"))}
      JSONObject().put("items",JSONArray(PlaybackQueue.json(items))).put("offset",offset).put("total",q.entries.size).put("count",count)
    }
  }
  fun playbackWindow(ticket:String,index:Int):Window {
    val s=current();return synchronized(lock){
      val q=prepared?.takeIf{it.ticket==ticket&&it.generation==s.generation}?:error("播放列表已结束")
      require(index in q.entries.indices);val offset=(index-10).coerceAtLeast(0);val last=(offset+21).coerceAtMost(q.entries.size);val options=q.options
      val starts=mutableListOf<Long>();val ends=mutableListOf<Long>()
      val items=(offset until last).map{n->val entry=q.entries[n];val duration=entry.optDouble("duration",0.0);val full=options.optBoolean("fullLength",true);val segment=options.optDouble("segment",15.0).coerceIn(.1,3600.0)
        val start=if(full||duration<=segment+1)0L else (1000*(1+java.util.Random(RhVideoClient::class.java.name.hashCode().toLong()+n).nextDouble()*(duration-segment-1))).toLong();starts.add(start);ends.add(if(full)-1 else start+(segment*1000).toLong())
        PlaybackQueue.Item(asset(s,"api/v1/videos/${id(entry)}/play"+(if(options.optBoolean("super"))"?super=true"else""),false),entry.optString("title","视频"))}
      Window(items,offset,index-offset,q.entries.size,JSONObject(options.toString()),starts,ends)
    }
  }
  private fun current()=synchronized(lock){session?:error("请先连接并登录 RHVideo")}
  fun sessionGeneration():Long=current().generation
  private fun accountKey(s:Session)="account-"+java.security.MessageDigest.getInstance("SHA-256").digest("${s.base}\n${s.username}".toByteArray()).joinToString(""){"%02x".format(it)}
  fun rememberPlayback(ticket:String,index:Int,position:Long,duration:Long){
    try{val s=current();synchronized(lock){val q=prepared?.takeIf{it.ticket==ticket&&it.generation==s.generation}?:return;val entry=q.entries.getOrNull(index)?:return;val key=accountKey(s)+"-playback";val data=JSONObject(prefs.getString(key,"{}")?:"{}");data.put(id(entry),JSONObject().put("title",entry.optString("title")).put("seconds",if(duration>0&&position>=duration-1000)0 else position.coerceAtLeast(0)/1000.0).put("savedAt",System.currentTimeMillis()));while(data.length()>1000){val oldest=data.keys().asSequence().minByOrNull{data.optJSONObject(it)?.optLong("savedAt")?:0}?:break;data.remove(oldest)};prefs.edit().putString(key,data.toString()).apply()}}
    catch(_:Exception){}
  }
  private fun resume(s:Session,id:String)=JSONObject(prefs.getString(accountKey(s)+"-playback","{}")?:"{}").optJSONObject(id)?.optDouble("seconds",0.0)?.takeIf{it.isFinite()&&it in 0.0..604800.0}?:0.0
  private fun live(value:Session)=synchronized(lock){session?.generation==value.generation}
  private fun token(s:Session):String=synchronized(refreshLock){
    check(live(s)){"登录已结束"}
    if(System.currentTimeMillis()<s.refreshAt)return@synchronized s.token
    val request=Request.Builder().url(s.base.resolve("api/v1/auth/refresh")!!).header("Authorization","Bearer ${s.token}").post("{}".toRequestBody("application/json".toMediaType())).build()
    http.newCall(request).execute().use{r->
      expire(s,r.code);check(r.isSuccessful){"刷新登录失败（HTTP ${r.code}）"}
      val value=readJson(r) as JSONObject;val next=value.getString("access_token")
      require(next.isNotEmpty()&&next.length<=32768&&!next.any{it.code<32}){"登录令牌无效"}
      check(live(s)){"登录已结束"};s.token=next;s.refreshAt=System.currentTimeMillis()+(value.optLong("expires_in",1800)-60).coerceAtLeast(1)*1000;next
    }
  }
  private fun expire(s:Session,code:Int){
    if(code==401)synchronized(lock){if(session?.generation==s.generation){++generation;session=null;assets.clear();videoCache=null}}
  }
  fun state():JSONObject=synchronized(lock){JSONObject().put("connected",session!=null).put("server",session?.base?.toString()?:prefs.getString("server","")).put("username",session?.username?:prefs.getString("username","")).put("nativePlayback",true).put("credentialsPersisted",false).put("generation",generation).put("assetRevision",assetRevision)}
  private fun json(s:Session,path:String,method:String="GET",body:JSONObject?=null):Any {
    val url=s.base.resolve(path)?:error("无效的 API 路径")
    val builder=Request.Builder().url(url).header("Authorization","Bearer ${token(s)}").header("Accept","application/json")
    if(method!="GET")builder.method(method,if(method=="DELETE")null else (body?:JSONObject()).toString().toRequestBody("application/json".toMediaType()))
    http.newCall(builder.build()).execute().use{response->
      expire(s,response.code)
      check(response.isSuccessful){if(response.code==401)"登录已过期，请重新登录"else "RHVideo 请求失败（HTTP ${response.code}）"}
      val result=readJson(response)
      check(live(s)){"连接已经更改，请重试"}
      return result
    }
  }
  private fun videoCatalog(s:Session,refresh:Boolean):JSONArray {
    val started=android.os.SystemClock.elapsedRealtime()
    return synchronized(catalogLock){
      check(live(s)){"媒体库连接已失效"}
      val now=android.os.SystemClock.elapsedRealtime()
      val cached=synchronized(lock){videoCache}
      if(cached!=null&&(!refresh&&now-cached.checked<30000||cached.checked>started))return@synchronized cached.rows
      val url=s.base.resolve("api/v1/videos")!!.newBuilder().addQueryParameter("summary","true").build()
      val request=Request.Builder().url(url).header("Authorization","Bearer ${token(s)}").header("Accept","application/json")
      cached?.etag?.let{request.header("If-None-Match",it)}
      http.newCall(request.build()).execute().use{response->
        expire(s,response.code)
        val unchanged=response.code==304
        check(response.isSuccessful||unchanged) {if(response.code==401)"登录已过期，请重新登录"else "RHVideo 请求失败（HTTP ${response.code}）"}
        val rows=if(unchanged)cached?.rows?:error("服务器返回 304，但本机没有可用清单") else readJson(response) as? JSONArray?:error("视频清单格式不兼容")
        val etag=response.header("ETag")?.takeIf{it.length<=1024}?:if(unchanged)cached?.etag else null
        synchronized(lock){check(live(s)){"连接已经更改，请重试"};videoCache=VideoCatalog(android.os.SystemClock.elapsedRealtime(),etag,rows)}
        rows
      }
    }
  }
  private fun readJson(response:Response):Any {
    val body=response.body?:error("服务器没有返回内容")
    require(body.contentLength()<=32*1024*1024){"服务器清单过大"}
    val bytes=body.byteStream().use{it.readBounded(32*1024*1024)}
    return JSONTokener(bytes.toString(Charsets.UTF_8)).nextValue().also{require(it is JSONObject||it is JSONArray){"服务器没有返回有效的 JSON 清单"}}
  }
  private fun InputStream.readBounded(limit:Int):ByteArray {
    val out=java.io.ByteArrayOutputStream();val buf=ByteArray(16384)
    while(true){val size=read(buf);if(size<0)break;require(out.size()+size<=limit){"服务器响应过大"};out.write(buf,0,size)};return out.toByteArray()
  }
  fun connect(args:JSONObject,register:Boolean=false):JSONObject {
    val base=base(args.getString("server"));val user=args.getString("username").trim();val password=args.getString("password")
    require(user.isNotEmpty()&&user.length<=256&&password.isNotEmpty()&&password.length<=4096){"请填写有效的用户名和密码"}
    val ticket=synchronized(lock){++generation;session=null;assets.clear();videoCache=null;generation}
    if(register){
      val body=JSONObject().put("username",user).put("password",password).put("email",args.getString("email"))
      http.newCall(Request.Builder().url(base.resolve("api/v1/auth/register")!!).post(body.toString().toRequestBody("application/json".toMediaType())).build()).execute().use{r->check(r.isSuccessful){"注册失败（HTTP ${r.code}）"}}
    }
    val request=Request.Builder().url(base.resolve("api/v1/auth/login")!!).post(JSONObject().put("username",user).put("password",password).toString().toRequestBody("application/json".toMediaType())).build()
    var expires=1800L
    val token=http.newCall(request).execute().use{r->check(r.isSuccessful){if(r.code==401)"用户名或密码不正确"else "登录失败（HTTP ${r.code}）"};val value=readJson(r) as JSONObject;expires=value.optLong("expires_in",1800);value.getString("access_token")}
    require(token.isNotBlank()&&token.length<=32768&&!token.any{it.code<32}){"服务器返回了无效的登录令牌"}
    synchronized(lock){check(ticket==generation){"登录已取消"};session=Session(base,user,token,ticket,System.currentTimeMillis()+(expires-60).coerceAtLeast(1)*1000);prefs.edit().putString("server",base.toString()).putString("username",user).apply()}
    return state()
  }
  fun contextMatches(args:JSONObject,allowDisconnected:Boolean=false):Boolean=synchronized(lock){
    if(!args.has("_sessionGeneration"))true else session?.generation==args.getLong("_sessionGeneration")||(allowDisconnected&&session==null)
  }
  fun validateContext(args:JSONObject,allowDisconnected:Boolean=false){check(contextMatches(args,allowDisconnected)){"媒体账户已改变，操作未执行，请刷新后重新操作"}}
  fun logout(expected:Long?=null):JSONObject {synchronized(lock){
    if(expected!=null&&expected!=generation){check(session==null){"媒体账户已改变，退出操作未执行"};return state()}
    ++generation;session=null;assets.clear();videoCache=null;prepared=null};return state()}
  private fun asset(s:Session,path:String,image:Boolean):String=synchronized(lock){
    check(live(s)){"连接已结束"}
    val key=assets.entries.firstOrNull{it.value.session.generation==s.generation&&it.value.path==path&&it.value.image==image}?.key?:UUID.randomUUID().toString().also{key->
      if(assets.size>=4096){val oldest=assets.entries.firstOrNull{it.value.image}?:assets.entries.first();assets.remove(oldest.key);assetRevision++}
      assets[key]=Asset(s,path,image)
    }
    if(image)"https://appassets.androidplatform.net/rhvideo-media/$key"else "rhvideo://$key"
  }
  private fun normalized(s:Session,v:JSONObject,type:String):JSONObject {
    val id=id(v)
    val cover=if(type=="video")asset(s,"api/v1/videos/$id/thumbnail",true)else if(type=="picture"){
      val raw=v.optString("webp_path",v.optString("thumbnail_url"));if(raw.isBlank())""else asset(s,storagePath(raw),true)
    }else ""
    return JSONObject().put("id",id).put("kind",type).put("title",v.optString("title",v.optString("original_filename","未命名"))).put("folder",v.optString("folder_label",""))
      .put("cover",cover).put("duration",v.optDouble("duration_seconds",0.0)).put("resolution",v.optString("original_resolution","")).put("status",v.optString("status",""))
      .put("progress",v.optJSONObject("progress")?:JSONObject.NULL).put("wordCount",v.optInt("word_count")).put("chapters",v.optInt("chapter_count"))
  }
  fun request(action:String,args:JSONObject):Any {
    val expected=if(args.has("_sessionGeneration"))args.getLong("_sessionGeneration").also{args.remove("_sessionGeneration")}else null
    when(action){"state"->return state();"connect"->return connect(args);"register"->return connect(args,true);"logout"->return logout(expected)}
    val s=current()
    check(expected==null||expected==s.generation){"媒体账户已改变，操作未执行，请刷新后重新操作"}
    return when(action){
      "catalog.resource"->{
        val type=kind(args);require(type!="favorite"){"收藏需要分页读取"}
        val path="@catalog:$type"+if(type=="video"&&args.optBoolean("refresh"))":refresh"else ""
        val key=asset(s,path,false).removePrefix("rhvideo://")
        JSONObject().put("url","https://appassets.androidplatform.net/rhvideo-catalog/$key").put("generation",s.generation)
      }
      "playlist.prepare"->{
        val ticket=id(JSONObject().put("id",args.getString("ticket")));val values=args.getJSONArray("items");require(values.length() in 1..200)
        synchronized(lock){
          if(args.optBoolean("reset"))prepared=Prepared(ticket,s.generation,mutableListOf(),args.getJSONObject("options"))
          val q=prepared?.takeIf{it.ticket==ticket&&it.generation==s.generation}?:error("播放列表准备已失效")
          require(q.entries.size+values.length()<=100000)
          for(i in 0 until values.length()){val v=values.getJSONObject(i);id(v);require(v.optString("title").length<=1024);q.entries.add(JSONObject(v.toString()))}
          JSONObject().put("count",q.entries.size)
        }
      }
      "operation"->{
        val call=contract.request(args)
        if(args.getString("name")=="index.video")videoCatalog(s,args.optJSONObject("query")?.optBoolean("refresh")?:false) else {
          val url=s.base.resolve(call.path)!!.newBuilder();call.query.forEach{(key,value)->url.addQueryParameter(key,value)}
          val value=json(s,url.build().toString(),call.method,call.body)
          if(call.invalidatesCatalog)synchronized(catalogLock){synchronized(lock){if(live(s))videoCache=null}}
          value
        }
      }
      "resolve"->{
        val rows=args.getJSONArray("items");require(rows.length()<=100){"每次最多解析 100 个媒体"};val items=JSONArray()
        for(i in 0 until rows.length()){val v=rows.getJSONObject(i);items.put(normalized(s,v,v.optString("kind","video")))}
        JSONObject().put("items",items).put("generation",s.generation)
      }
      "images"->{val paths=args.getJSONArray("paths");require(paths.length()<=100);JSONArray().also{out->for(i in 0 until paths.length())out.put(asset(s,storagePath(paths.getString(i)),true))}}
      "preferences"->{
        val key=accountKey(s)
        if(args.has("value")){val value=args.getJSONObject("value");require(value.toString().length<=256*1024);check(prefs.edit().putString(key,value.toString()).commit()){"无法保存偏好"};JSONObject().put("saved",true)}else JSONObject(prefs.getString(key,"{}")?:"{}")
      }
      "playback.history"->JSONObject(prefs.getString(accountKey(s)+"-playback","{}")?:"{}")
      "playback.clear"->{prefs.edit().remove(accountKey(s)+"-playback").apply();JSONObject()}
      "catalog"->{
        val type=kind(args);val offset=args.optInt("offset",0).coerceIn(0,10000000);val limit=args.optInt("limit",36).coerceIn(1,72)
        val search=args.optString("search","").take(256);val folder=args.optString("folder","").take(1024)
        val items=JSONArray();val total:Int
        if(type=="video"){
          val rows=videoCatalog(s,args.optBoolean("refresh"));var matches=0
          for(i in 0 until rows.length()){
            val v=rows.getJSONObject(i);val labels=v.optString("folder_label")
            if((search.isBlank()||v.optString("original_filename").contains(search,true)||labels.contains(search,true))&&(folder.isEmpty()||labels.split(',').any{it.trim()==folder})){
              if(matches>=offset&&items.length()<limit)items.put(normalized(s,v,"video"));matches++
            }
          }
          total=matches
        }else{
          val path=if(type=="favorite")"api/v1/favorites"else "api/v1/${type}s"
          val url=s.base.resolve(path)!!.newBuilder().addQueryParameter("skip",offset.toString()).addQueryParameter("limit",limit.toString()).addQueryParameter("search",search)
          if(type=="favorite")url.addQueryParameter("media_type","all")else if(folder.isNotEmpty())url.addQueryParameter("folder",folder)
          val data=json(s,url.build().toString()) as? JSONObject?:error("媒体清单格式不兼容")
          total=data.getInt("total");val rows=data.getJSONArray("items");require(rows.length()<=72&&total>=0){"媒体清单格式不兼容"}
          for(i in 0 until rows.length()){val v=rows.getJSONObject(i);val t=if(type=="favorite")v.getString("type")else type;require(t in listOf("video","picture","novel"));items.put(normalized(s,v,t))}
        }
        JSONObject().put("items",items).put("total",total).put("generation",s.generation)
      }
      "folders"->{val type=kind(args);require(type!="favorite");json(s,"api/v1/${type}s/folders")}
      "favorites"->json(s,"api/v1/favorites/ids")
      "favorite"->{val type=kind(args);require(type!="favorite");json(s,"api/v1/favorites/$type/${id(args)}",if(args.getBoolean("enabled"))"PUT"else "DELETE")}
      "novel"->json(s,"api/v1/novels/${id(args)}")
      "chapter"->{val chapter=args.getInt("chapter");require(chapter in 0..100000);json(s,"api/v1/novels/${id(args)}/chapters/$chapter")}
      "progress"->{val ratio=args.getDouble("ratio");val chapter=args.getInt("chapter");require(ratio.isFinite()&&ratio in 0.0..1.0&&chapter in 0..100000);json(s,"api/v1/novels/${id(args)}/progress","PUT",JSONObject().put("chapter_index",chapter).put("scroll_ratio",ratio))}
      "frames"->{
        val data=json(s,"api/v1/screenshots/video/${id(args)}?per_video=40") as JSONObject;val values=data.getJSONArray("screenshots");val frames=JSONArray()
        for(i in 0 until minOf(values.length(),40)){val f=values.getJSONObject(i);frames.put(JSONObject().put("url",asset(s,storagePath(f.getString("url")),true)).put("seconds",f.optDouble("time_seconds",0.0)))}
        JSONObject().put("frames",frames)
      }
      else->error("未知的 RHVideo 操作")
    }
  }
  data class Playlist(val items:List<PlaybackQueue.Item>,val path:String,val position:Long,val ticket:String?=null,val globalIndex:Int=0)
  fun playback(args:JSONObject):Playlist {
    val s=current();check(!args.has("_sessionGeneration")||args.getLong("_sessionGeneration")==s.generation){"媒体账户已改变，操作未执行"};val selected=id(args);val queue=args.optJSONArray("queue")?:JSONArray();require(queue.length()<=500){"播放列表过大"}
    if(args.has("playlist")){
      val ticket=args.getString("playlist");val index=synchronized(lock){val q=prepared?.takeIf{it.ticket==ticket&&it.generation==s.generation}?:error("播放列表准备已失效");q.entries.indexOfFirst{it.optString("id")==selected}}
      require(index>=0);val window=playbackWindow(ticket,index);return Playlist(window.items,window.items[window.index].path,if(args.optBoolean("resume")&&window.options.optBoolean("fullLength",true))(resume(s,selected)*1000).toLong()else 0,ticket,index)
    }
    val entries=linkedMapOf<String,String>()
    for(i in 0 until queue.length()){val item=queue.getJSONObject(i);entries[id(item)]=item.optString("title","视频").take(512)}
    if(!entries.containsKey(selected))entries[selected]=args.optString("title","视频").take(512)
    val suffix=if(args.optBoolean("super"))"?super=true"else""
    val selectedPath=asset(s,"api/v1/videos/$selected/play$suffix",false)
    val ordered=entries.map{(id,title)->PlaybackQueue.Item(asset(s,"api/v1/videos/$id/play$suffix",false),title)}
    val seconds=if(!args.has("seconds")&&args.optBoolean("resume"))resume(s,selected)else args.optDouble("seconds",0.0);require(seconds.isFinite()&&seconds in 0.0..604800.0)
    return Playlist(ordered,selectedPath,(seconds*1000).toLong())
  }
  class Media(val stream:InputStream,val length:Long,val type:String,private val response:Response):java.io.Closeable {override fun close(){response.close()}}
  fun catalogResource(key:String):InputStream {
    require(key.matches(Regex("[a-f0-9-]{36}")))
    val entry=synchronized(lock){assets[key]}?:error("清单连接已失效")
    check(!entry.image&&live(entry.session)){"清单连接已失效"}
    val path=when(entry.path){
      "@catalog:video","@catalog:video:refresh"->"api/v1/videos?summary=true"
      "@catalog:picture"->"api/v1/pictures/catalog"
      "@catalog:novel"->"api/v1/novels?summary=true"
      else->error("未知清单")
    }
    val request=Request.Builder().url(entry.session.base.resolve(path)!!).header("Authorization","Bearer ${token(entry.session)}").header("Accept","application/json").build()
    val response=http.newCall(request).execute()
    try{
      expire(entry.session,response.code);check(response.isSuccessful&&live(entry.session)){"清单读取失败（HTTP ${response.code}）"}
      val body=response.body?:error("清单为空")
      require(body.contentType()?.subtype?.endsWith("json")==true&&body.contentLength()<=32*1024*1024){"清单无效或超过 32 MiB"}
      // Parse once, in the worker: no JSONArray/toString/bridge copy on the UI
      // path, and no second whole catalog retained in the Java heap.
      return object:FilterInputStream(body.byteStream()){
        var count=0L
        private fun checkSession(){if(!live(entry.session))throw IOException("RHVideo 登录已结束")}
        private fun counted(n:Int):Int{if(n>0)count+=n;if(count>32*1024*1024)throw IOException("清单超过 32 MiB");return n}
        override fun read():Int{checkSession();val n=`in`.read();if(n>=0)counted(1);return n}
        override fun read(b:ByteArray,off:Int,len:Int):Int{checkSession();return counted(`in`.read(b,off,len))}
        override fun close(){response.close()}
      }
    }catch(error:Exception){response.close();throw error}
  }
  fun media(key:String,position:Long=0,image:Boolean):Media {
    require(position>=0)
    val value=synchronized(lock){assets[key]}?:error("媒体连接已失效，请重新打开")
    require(value.image==image&&live(value.session)){"媒体连接已失效"}
    val request=Request.Builder().url(value.session.base.resolve(value.path)!!).header("Authorization","Bearer ${token(value.session)}")
    if(position>0)request.header("Range","bytes=$position-")
    val response=mediaHttp.newCall(request.build()).execute()
    try{
      expire(value.session,response.code)
      check(response.isSuccessful&&live(value.session)){"媒体读取失败（HTTP ${response.code}）"}
      if(position>0)require(response.code==206&&response.header("Content-Range")?.startsWith("bytes $position-")==true){"服务器未正确支持视频跳转"}
      val body=response.body?:error("媒体为空");val type=body.contentType()?.toString()?:"application/octet-stream"
      if(image)require(type.startsWith("image/")&&body.contentLength()<=32*1024*1024){"无效或过大的图片"}
      val stream=object:FilterInputStream(body.byteStream()){
        var read=0L
        private fun checkSession(){if(!live(value.session))throw IOException("RHVideo 登录已结束")}
        override fun read():Int{checkSession();val n=super.read();if(n>=0)read++;if(image&&read>32*1024*1024)throw IOException("图片过大");return n}
        override fun read(b:ByteArray,off:Int,len:Int):Int{checkSession();val n=`in`.read(b,off,len);if(n>0)read+=n;if(image&&read>32*1024*1024)throw IOException("图片过大");return n}
        override fun close(){response.close()}
      }
      return Media(stream,body.contentLength(),type,response)
    }catch(e:Exception){response.close();throw e}
  }
}
