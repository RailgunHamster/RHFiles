package com.railgunhamster.rhfiles

import android.content.Context
import okhttp3.HttpUrl
import okhttp3.ConnectionPool
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
    internal fun imagePath(value:String):String {
      val path=value.trimStart('/')
      if(path.startsWith("api/")){
        require(path.matches(Regex("api/v1/videos/[A-Za-z0-9_-]{1,128}/thumbnail"))){"不支持的缩略图接口"}
        return path
      }
      return storagePath(value)
    }
  }
  private data class Session(val base:HttpUrl,val username:String,@Volatile var token:String,val generation:Long,@Volatile var refreshAt:Long)
  private data class Asset(val session:Session,val path:String,val image:Boolean)
  private val lock=Any()
  private val prefs=context.getSharedPreferences("rhvideo-client-v1",Context.MODE_PRIVATE)
  private val contract by lazy{RhVideoContract(operationManifest?:JSONObject(context.assets.open("rhvideo/rhvideo-operations.json").bufferedReader().use{it.readText()}))}
  private val refreshLock=Any()
  private val http=OkHttpClient.Builder().proxy(Proxy.NO_PROXY).followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(true)
    .connectTimeout(8,TimeUnit.SECONDS).readTimeout(25,TimeUnit.SECONDS).callTimeout(45,TimeUnit.SECONDS).build()
  private val mediaHttp=http.newBuilder().callTimeout(0,TimeUnit.SECONDS).eventListenerFactory(RhVideoMediaTrace(context.applicationContext)).build()
  // Non-replayable writes must not reuse an idle socket that the server may
  // already have closed. Use a fresh connection, not a hidden retry after an
  // ambiguous response. Read/media traffic keeps its independent pooled path.
  private val writeHttp=http.newBuilder().retryOnConnectionFailure(false).connectionPool(ConnectionPool(0,1,TimeUnit.SECONDS)).build()
  private var session:Session?=null
  private var generation=0L
  private var assetRevision=0L
  private val assets=linkedMapOf<String,Asset>()
  private data class VideoCatalog(val checked:Long,val etag:String?,val rows:JSONArray)
  private val catalogLock=Any()
  private var videoCache:VideoCatalog?=null
  private data class Prepared(val ticket:String,val generation:Long,val entries:MutableList<JSONObject>,val options:JSONObject,var touched:Long=android.os.SystemClock.elapsedRealtime())
  private val prepared=linkedMapOf<String,Prepared>()
  private fun preparedDraft(ticket:String,s:Session)=prepared[ticket]?.takeIf{it.generation==s.generation&&android.os.SystemClock.elapsedRealtime()-it.touched<300000}
  private data class GridSession(val queue:Prepared,val plan:RhVideoGridPlan,val lease:String)
  private var gridSession:GridSession?=null
  private data class PlaybackSession(val ticket:String,val generation:Long,val plan:RhVideoPlaybackPlan,val lease:String)
  private var playbackSession:PlaybackSession?=null
  private var preview=RhVideoPreviewState()
  private val favoriteIds=HashSet<String>()
  private var favoriteLoaded=false
  private var favoriteRevision=0L
  private var singleLoop=false
  private var singleRate=1.0
  private val favoriteJobs=linkedMapOf<String,JSONObject>()
  private val listeners=java.util.concurrent.CopyOnWriteArraySet<(String,JSONObject)->Unit>()
  private val writes=java.util.concurrent.ThreadPoolExecutor(2,2,0,TimeUnit.MILLISECONDS,java.util.concurrent.ArrayBlockingQueue<Runnable>(32),{job->Thread(job,"RHVideo-write").apply{isDaemon=true}},java.util.concurrent.ThreadPoolExecutor.AbortPolicy())
  fun listen(listener:(String,JSONObject)->Unit):java.io.Closeable {listeners.add(listener);return java.io.Closeable{listeners.remove(listener)}}
  private fun emit(name:String,payload:JSONObject){listeners.forEach{listener->runCatching{listener(name,JSONObject(payload.toString()))}}}
  private fun resetMediaState(){preview=RhVideoPreviewState();favoriteIds.clear();favoriteLoaded=false;favoriteRevision++;favoriteJobs.clear();singleLoop=false;singleRate=1.0}
  fun checkGrid(ticket:String,lease:String){val s=current();synchronized(lock){check(gridSession?.let{it.queue.ticket==ticket&&it.lease==lease&&it.queue.generation==s.generation}==true){"同屏会话已改变，请重新打开"}}}
  fun closeGrid(ticket:String,lease:String,commit:Boolean=true):JSONObject {
    val owner=synchronized(lock){
      val s=session?:return JSONObject().put("closed",true)
      if(gridSession?.let{it.queue.ticket==ticket&&it.lease==lease&&it.queue.generation==s.generation}!=true)return JSONObject().put("closed",true)
      gridSession=null;s
    }
    return JSONObject().put("closed",true).also{if(commit)it.put("preview",commitPreview(owner))}
  }
  fun gridGroupOffset(ticket:String,lease:String,index:Int):Int {val s=current();return synchronized(lock){val grid=gridSession?.takeIf{it.queue.ticket==ticket&&it.lease==lease&&it.queue.generation==s.generation}?:error("同屏会话已改变");require(index in grid.plan.groups.indices){"同屏组号无效"};grid.plan.groups[index].first}}
  data class Window(val items:List<PlaybackQueue.Item>,val offset:Int,val index:Int,val total:Int,val options:JSONObject,val starts:List<Long>,val ends:List<Long>,val ids:List<String>,val beforeMs:List<Long>,val totalMs:Long,val lease:String,val generation:Long)
  fun openGrid(ticket:String,count:Int,lowBandwidth:Boolean):JSONObject {
    val s=current();return synchronized(lock){
      val source=preparedDraft(ticket,s)?:error("同屏队列已失效")
      val q=source.copy(entries=source.entries.map{JSONObject(it.toString())}.toMutableList(),options=JSONObject(source.options.toString()))
      val plan=RhVideoGridPlan(q.entries,count);val candidate=GridSession(q,plan,UUID.randomUUID().toString())
      val saved=runCatching{JSONArray(prefs.getString(accountKey(s)+"-grid-group","[]"))}.getOrNull()
      val offset=plan.restore(q.entries,saved)
      gridSession=candidate
      val window=gridWindow(ticket,offset,count,lowBandwidth);prepared.remove(ticket);window
    }
  }
  fun rememberGrid(ticket:String,lease:String,offset:Int){
    val s=current();synchronized(lock){
      val grid=gridSession?.takeIf{it.queue.ticket==ticket&&it.lease==lease&&it.queue.generation==s.generation}?:error("同屏会话已改变")
      val range=grid.plan.groups[grid.plan.groupAt(offset)]
      prefs.edit().putString(accountKey(s)+"-grid-group",JSONArray(range.map{grid.queue.entries[it].getString("id")}).toString()).apply()
    }
  }
  fun gridWindow(ticket:String,offset:Int,count:Int,lowBandwidth:Boolean):JSONObject {
    val s=current();require(count in 1..9)
    return synchronized(lock){
      val active=gridSession?.takeIf{it.queue.ticket==ticket&&it.queue.generation==s.generation}
      val q=active?.queue?:preparedDraft(ticket,s)?.takeIf{it.entries.isNotEmpty()}?:error("网格队列已失效")
      val plan=active?.plan?:RhVideoGridPlan(q.entries,count);val group=plan.groupAt(offset);val range=plan.groups[group]
      val items=JSONArray();for(n in range){val entry=q.entries[n];items.put(JSONObject().put("id",id(entry)).put("name",entry.optString("title","视频")).put("path",asset(s,"api/v1/videos/${id(entry)}/play"+(if(lowBandwidth)"?super=true"else""),false)).put("rect",JSONArray(plan.rects[n])))}
      JSONObject().put("items",items).put("offset",offset).put("total",q.entries.size).put("count",range.count()).put("groupIndex",group).put("groupTotal",plan.groups.size)
        .put("previousOffset",if(group>0)plan.groups[group-1].first else JSONObject.NULL).put("nextOffset",if(group+1<plan.groups.size)plan.groups[group+1].first else JSONObject.NULL)
        .put("generation",s.generation).put("lease",active?.lease?:"")
    }
  }
  private fun playbackPlan(s:Session,ticket:String,lease:String?=null,expectedIndex:Int?=null,selected:String?=null):PlaybackSession {
    val active=playbackSession?.takeIf{it.ticket==ticket&&it.generation==s.generation}
    if(lease!=null)check(active?.lease==lease){"播放会话已改变，请重新读取状态"}
    val candidate=active?:run{val q=preparedDraft(ticket,s)?:error("播放列表已结束");val options=JSONObject(q.options.toString());if(!options.optBoolean("reference")){if(!options.has("loop"))options.put("loop",singleLoop);if(!options.has("rate"))options.put("rate",singleRate)};PlaybackSession(ticket,s.generation,RhVideoPlaybackPlan(q.entries,options),UUID.randomUUID().toString())}
    require(expectedIndex==null||expectedIndex in candidate.plan.entries.indices){"播放序号无效"}
    require(selected==null||candidate.plan.entries.any{it.id==selected}){"视频不在准备好的队列中"}
    if(active==null){playbackSession=candidate;prepared.remove(ticket);if(!candidate.plan.reference){singleLoop=candidate.plan.options.optBoolean("loop");singleRate=candidate.plan.options.optDouble("rate",1.0)}}
    return candidate
  }
  fun playbackWindow(ticket:String,index:Int,lease:String?=null):Window {
    val s=current();return synchronized(lock){
      val active=playbackPlan(s,ticket,lease,expectedIndex=index);val plan=active.plan
      require(index in plan.entries.indices);val offset=(index-10).coerceAtLeast(0);val last=(offset+21).coerceAtMost(plan.entries.size);val options=plan.options
      val starts=mutableListOf<Long>();val ends=mutableListOf<Long>()
      val items=(offset until last).map{n->val entry=plan.entries[n];starts.add(entry.startMs);ends.add(if(!plan.reference&&options.optBoolean("fullLength",true))-1 else entry.startMs+entry.lengthMs)
        PlaybackQueue.Item(asset(s,"api/v1/videos/${entry.id}/play"+(if(options.optBoolean("super"))"?super=true"else""),false),entry.title)}
      Window(items,offset,index-offset,plan.entries.size,JSONObject(options.toString()),starts,ends,(offset until last).map{plan.entries[it].id},(offset until last).map{plan.beforeMs[it]},plan.totalMs,active.lease,s.generation)
    }
  }
  fun playbackTarget(ticket:String,lease:String,ratio:Double):RhVideoPlaybackPlan.Target {val s=current();return synchronized(lock){playbackPlan(s,ticket,lease).plan.seek(ratio)}}
  fun checkPlayback(ticket:String,lease:String){val s=current();synchronized(lock){playbackPlan(s,ticket,lease)}}
  fun playbackOptions(ticket:String,lease:String,index:Int,patch:JSONObject):Int {
    val s=current();return synchronized(lock){val active=playbackPlan(s,ticket,lease);val old=active.plan.entries[index].id;val next=active.plan.changed(patch);playbackSession=active.copy(plan=next);if(!next.reference){singleLoop=next.options.optBoolean("loop");singleRate=next.options.optDouble("rate",1.0)};next.entries.indexOfFirst{it.id==old}.coerceAtLeast(0)}
  }
  fun rememberPlaylist(ticket:String,lease:String,index:Int){
    val s=current();synchronized(lock){val active=playbackPlan(s,ticket,lease);val plan=active.plan;require(index in plan.entries.indices)
      val mode=plan.options.optString("mode","segments");require(mode in listOf("segments","sequential","sequential-super"))
      prefs.edit().putString(accountKey(s)+"-playlist-"+mode,JSONObject(plan.options.toString()).put("signature",plan.signature).put("index",index).toString()).apply()
    }
  }
  fun closePlayback(ticket:String,lease:String,direction:Int,whole:Boolean):JSONObject {
    require(direction in -1..1)
    val s=current();val options=synchronized(lock){val active=playbackPlan(s,ticket,lease);val options=JSONObject(active.plan.options.toString());playbackSession=null;options}
    if(options.optString("origin")=="frame")emit("rhvideo-parent-preview",JSONObject().put("generation",s.generation).put("parentKey",options.getString("parentKey")).put("parentPreview",options.getString("parentPreview")).put("direction",direction).put("close",whole).also{if(options.has("parentPlayback"))it.put("parentPlayback",options.getString("parentPlayback"))})
    if(whole||!options.optBoolean("deferPreviewCommit"))commitPreview(s)
    return JSONObject().put("closed",true)
  }
  fun previewMarked(kind:String,id:String,generation:Long):Boolean=synchronized(lock){session?.generation==generation&&preview.marked(kind,id)}
  fun favoriteState(kind:String,id:String,generation:Long):JSONObject=synchronized(lock){
    val key="$kind:$id";val job=favoriteJobs[key]?.takeIf{session?.generation==generation}
    JSONObject().put("favorite",session?.generation==generation&&favoriteIds.contains(key)).put("favoriteBusy",job?.optBoolean("running")?:false).put("favoriteError",job?.optString("error")?.takeIf{it.isNotEmpty()}?:JSONObject.NULL).put("favoriteOperation",job?.optString("operation")?:JSONObject.NULL)
  }
  private fun readFavorites(s:Session):JSONObject {
    val revision=synchronized(lock){favoriteRevision};val value=json(s,"api/v1/favorites/ids") as JSONObject
    synchronized(lock){check(live(s)){"媒体账户已改变"};if(revision==favoriteRevision){favoriteIds.clear();for(kind in listOf("video","picture","novel")){val ids=value.optJSONArray("${kind}_ids")?:continue;for(i in 0 until ids.length()){val id=ids.getString(i);if(id.matches(Regex("[A-Za-z0-9_-]{1,128}")))favoriteIds.add("$kind:$id")}};favoriteLoaded=true}}
    return value
  }
  private fun updateFavorite(s:Session,kind:String,id:String,enabled:Boolean):Any {
    require(kind in listOf("video","picture","novel")&&id.matches(Regex("[A-Za-z0-9_-]{1,128}"))){"收藏目标无效"}
    val value=json(s,"api/v1/favorites/$kind/$id",if(enabled)"PUT"else"DELETE")
    synchronized(lock){check(live(s)){"媒体账户已改变"};if(enabled)favoriteIds.add("$kind:$id")else favoriteIds.remove("$kind:$id");favoriteRevision++}
    emit("rhvideo-favorite",JSONObject().put("generation",s.generation).put("kind",kind).put("id",id).put("enabled",enabled));return value
  }
  fun toggleFavorite(kind:String,id:String,generation:Long,guard:()->Boolean):JSONObject {
    require(kind in listOf("video","picture","novel")&&id.matches(Regex("[A-Za-z0-9_-]{1,128}"))){"收藏目标无效"}
    val s=current();check(s.generation==generation&&guard()){"播放目标已改变，收藏未执行"};val key="$kind:$id";val operation=UUID.randomUUID().toString()
    val job=JSONObject().put("operation",operation).put("running",true)
    val acceptedEnabled=synchronized(lock){check(live(s)&&guard()){"播放目标已改变，收藏未执行"};check(favoriteJobs[key]?.optBoolean("running")!=true){"收藏操作正在处理"};while(favoriteJobs.size>=128){val old=favoriteJobs.entries.firstOrNull{!it.value.optBoolean("running") }?.key?:error("收藏操作过多");favoriteJobs.remove(old)};favoriteJobs[key]=job;if(favoriteLoaded)!favoriteIds.contains(key)else null}
    val work=Runnable{
      var error:String?=null
      // Admission owns an immutable media ID, not the future visible decoder.
      // Reject stale UI before admission; after acceptance navigation must not
      // silently cancel that explicit favorite. Account revocation still wins.
      try{check(live(s)){"媒体账户已改变，收藏未执行"};if(acceptedEnabled==null&&!synchronized(lock){favoriteLoaded})readFavorites(s);check(live(s)){"媒体账户已改变，收藏未执行"};val enabled=acceptedEnabled?:synchronized(lock){check(favoriteLoaded){"收藏状态已改变，请重新读取后再操作"};!favoriteIds.contains(key)};updateFavorite(s,kind,id,enabled)}catch(e:Exception){error=e.message?:"收藏失败"}
      synchronized(lock){if(live(s)&&favoriteJobs[key]?.optString("operation")==operation){job.put("running",false);if(error!=null)job.put("error",error)}}
      emit("rhvideo-media-action",JSONObject().put("generation",s.generation).put("kind",kind).put("id",id).put("operation",operation).put("error",error?:JSONObject.NULL))
    }
    val initial=JSONObject(job.toString())
    try{writes.execute(work)}catch(e:java.util.concurrent.RejectedExecutionException){synchronized(lock){job.put("running",false).put("error","后台操作队列已满，收藏未执行")};throw IllegalStateException("后台操作队列已满，收藏未执行",e)}
    return initial
  }
  private fun commitPreview(s:Session):JSONObject {
    val marks=synchronized(lock){check(live(s)){"媒体账户已改变"};preview};val run=marks.take()?:return marks.result()
    val initial=marks.result();emit("rhvideo-preview-result",JSONObject().put("generation",s.generation).put("result",initial))
    var completed=0;var published=System.nanoTime()
    fun publish(target:JSONObject,error:String?){val item=JSONObject(target.toString()).put("success",error==null);if(error!=null)item.put("error",error);marks.publish(run,item);completed++;val now=System.nanoTime();if(completed==run.targets.size||now-published>=250000000){published=now;emit("rhvideo-preview-result",JSONObject().put("generation",s.generation).put("result",marks.result()))}}
    try{writes.execute{
      for(target in run.targets){var error:String?=null
        try{check(live(s)){"媒体账户已改变；此项未提交，不会自动恢复"};json(s,"api/v1/trash/${target.getString("kind")}/${target.getString("id")}","POST");synchronized(catalogLock){synchronized(lock){if(live(s))videoCache=null}}}catch(e:Exception){error=e.message?:"暂存失败，未自动重试"}
        publish(target,error)
      }
    }}catch(_:java.util.concurrent.RejectedExecutionException){for(target in run.targets)publish(target,"后台操作队列已满，暂存未执行")}
    return initial
  }
  private fun current()=synchronized(lock){session?:error("请先连接并登录 RHVideo")}
  fun sessionGeneration():Long=current().generation
  private fun accountKey(s:Session)="account-"+java.security.MessageDigest.getInstance("SHA-256").digest("${s.base}\n${s.username}".toByteArray()).joinToString(""){"%02x".format(it)}
  fun rotationPreference(generation:Long,enabled:Boolean?=null):Boolean {
    val s=current();val value=synchronized(lock){check(live(s)&&s.generation==generation){"媒体账户已改变，旋转未应用"};val key=accountKey(s);val value=JSONObject(prefs.getString(key,"{}")?:"{}");val choice=enabled?:RhVideoRotation.preference(value);if(enabled!=null){value.put("autoRotate",enabled);check(prefs.edit().putString(key,value.toString()).commit()){"无法保存旋转偏好"}};choice}
    if(enabled!=null)emit("rhvideo-rotation-preference",JSONObject().put("generation",s.generation).put("enabled",value))
    return value
  }
  fun rememberPlayback(ticket:String,index:Int,position:Long,duration:Long){
    try{val s=current();synchronized(lock){val active=playbackSession?.takeIf{it.ticket==ticket&&it.generation==s.generation};val entry=active?.plan?.entries?.getOrNull(index)?.let{JSONObject().put("id",it.id).put("title",it.title)}?:prepared[ticket]?.takeIf{it.generation==s.generation}?.entries?.getOrNull(index)?:return;val key=accountKey(s)+"-playback";val data=JSONObject(prefs.getString(key,"{}")?:"{}");data.put(id(entry),JSONObject().put("title",entry.optString("title")).put("seconds",if(duration>0&&position>=duration-1000)0 else position.coerceAtLeast(0)/1000.0).put("savedAt",System.currentTimeMillis()));while(data.length()>1000){val oldest=data.keys().asSequence().minByOrNull{data.optJSONObject(it)?.optLong("savedAt")?:0}?:break;data.remove(oldest)};prefs.edit().putString(key,data.toString()).apply()}}
    catch(_:Exception){}
  }
  private fun resume(s:Session,id:String)=JSONObject(prefs.getString(accountKey(s)+"-playback","{}")?:"{}").optJSONObject(id)?.optDouble("seconds",0.0)?.takeIf{it.isFinite()&&it in 0.0..604800.0}?:0.0
  private fun live(value:Session)=synchronized(lock){session?.generation==value.generation}
  private fun token(s:Session):String=synchronized(refreshLock){
    check(live(s)){"登录已结束"}
    if(System.currentTimeMillis()<s.refreshAt)return@synchronized s.token
    val request=Request.Builder().url(s.base.resolve("api/v1/auth/refresh")!!).header("Authorization","Bearer ${s.token}").post("{}".toRequestBody("application/json".toMediaType())).build()
    writeHttp.newCall(request).execute().use{r->
      expire(s,r.code);check(r.isSuccessful){"刷新登录失败（HTTP ${r.code}）"}
      val value=readJson(r) as JSONObject;val next=value.getString("access_token")
      require(next.isNotEmpty()&&next.length<=32768&&!next.any{it.code<32}){"登录令牌无效"}
      check(live(s)){"登录已结束"};s.token=next;s.refreshAt=System.currentTimeMillis()+(value.optLong("expires_in",1800)-60).coerceAtLeast(1)*1000;next
    }
  }
  private fun expire(s:Session,code:Int){
    if(code==401)synchronized(lock){if(session?.generation==s.generation){++generation;session=null;assets.clear();videoCache=null;prepared.clear();gridSession=null;playbackSession=null;resetMediaState()}}
  }
  fun state():JSONObject=synchronized(lock){JSONObject().put("connected",session!=null).put("server",session?.base?.toString()?:prefs.getString("server","")).put("username",session?.username?:prefs.getString("username","")).put("nativePlayback",true).put("credentialsPersisted",false).put("generation",generation).put("assetRevision",assetRevision)}
  private fun json(s:Session,path:String,method:String="GET",body:JSONObject?=null):Any {
    val url=s.base.resolve(path)?:error("无效的 API 路径")
    val builder=Request.Builder().url(url).header("Authorization","Bearer ${token(s)}").header("Accept","application/json")
    if(method!="GET")builder.method(method,if(method=="DELETE")null else (body?:JSONObject()).toString().toRequestBody("application/json".toMediaType()))
    (if(method=="GET")http else writeHttp).newCall(builder.build()).execute().use{response->
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
    val ticket=synchronized(lock){++generation;session=null;assets.clear();videoCache=null;prepared.clear();gridSession=null;playbackSession=null;resetMediaState();generation}
    if(register){
      val body=JSONObject().put("username",user).put("password",password).put("email",args.getString("email"))
      writeHttp.newCall(Request.Builder().url(base.resolve("api/v1/auth/register")!!).post(body.toString().toRequestBody("application/json".toMediaType())).build()).execute().use{r->check(r.isSuccessful){"注册失败（HTTP ${r.code}）"}}
    }
    val request=Request.Builder().url(base.resolve("api/v1/auth/login")!!).post(JSONObject().put("username",user).put("password",password).toString().toRequestBody("application/json".toMediaType())).build()
    var expires=1800L
    val token=writeHttp.newCall(request).execute().use{r->check(r.isSuccessful){if(r.code==401)"用户名或密码不正确"else "登录失败（HTTP ${r.code}）"};val value=readJson(r) as JSONObject;expires=value.optLong("expires_in",1800);value.getString("access_token")}
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
    ++generation;session=null;assets.clear();videoCache=null;prepared.clear();gridSession=null;playbackSession=null;resetMediaState()};return state()}
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
        val chunk=(0 until values.length()).map{val v=values.getJSONObject(it);id(v);require(v.optString("title").length<=1024);JSONObject(v.toString())}
        synchronized(lock){
          check(live(s)){"媒体账户已改变"}
          val now=android.os.SystemClock.elapsedRealtime();prepared.values.removeAll{now-it.touched>=300000}
          val reset=args.optBoolean("reset");val existing=prepared[ticket]?.takeIf{it.generation==s.generation}
          require(!reset||existing!=null||prepared.size<8){"准备中的播放队列过多，请先释放不用的票据"}
          require(prepared.values.sumOf{if(reset&&it.ticket==ticket)0 else it.entries.size}+chunk.size<=100000){"准备中的播放列表合计超出 10 万项"}
          val q=if(reset){val options=JSONObject(args.getJSONObject("options").toString());require(options.toString().toByteArray(Charsets.UTF_8).size<=256*1024){"播放设置过大"};Prepared(ticket,s.generation,mutableListOf(),options)}else existing?:error("播放列表准备已失效")
          q.entries.addAll(chunk);q.touched=now;if(reset)prepared[ticket]=q
          JSONObject().put("count",q.entries.size)
        }
      }
      "playlist.discard"->{val ticket=id(JSONObject().put("id",args.getString("ticket")));synchronized(lock){check(live(s)){"媒体账户已改变"};val removed=prepared[ticket]?.takeIf{it.generation==s.generation}?.let{prepared.remove(ticket);true}?:false;JSONObject().put("removed",removed)}}
      "playlist.state"->{val mode=args.optString("mode","segments");require(mode in listOf("segments","sequential","sequential-super"));JSONObject(prefs.getString(accountKey(s)+"-playlist-"+mode,"{}")?:"{}")}
      "preview.mark"->{val marked=synchronized(lock){check(live(s)){"媒体账户已改变"};if(args.has("enabled"))require(args.get("enabled") is Boolean);preview.mark(kind(args),id(args),args.getString("title"),if(args.has("enabled"))args.getBoolean("enabled")else null)};emit("rhvideo-preview-mark",JSONObject(marked.toString()).put("generation",s.generation));marked}
      "preview.pending"->synchronized(lock){check(live(s)){"媒体账户已改变"};preview.pending()}
      "preview.result"->synchronized(lock){check(live(s)){"媒体账户已改变"};preview.result()}
      "preview.commit"->commitPreview(s)
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
      "images"->{val paths=args.getJSONArray("paths");require(paths.length()<=100);JSONArray().also{out->for(i in 0 until paths.length())out.put(asset(s,imagePath(paths.getString(i)),true))}}
      "preferences"->{
        synchronized(lock){check(live(s)){"媒体账户已改变"};val key=accountKey(s);val previous=JSONObject(prefs.getString(key,"{}")?:"{}")
          if(args.has("value")){val value=JSONObject(args.getJSONObject("value").toString());require(value.toString().length<=256*1024);value.put("autoRotate",RhVideoRotation.preference(previous));check(prefs.edit().putString(key,value.toString()).commit()){"无法保存偏好"};JSONObject().put("saved",true)}else previous.put("autoRotate",RhVideoRotation.preference(previous))}
      }
      "rotation.preference"->{val enabled=if(args.has("enabled")){require(args.get("enabled") is Boolean){"旋转开关无效"};args.getBoolean("enabled")}else null;JSONObject().put("enabled",rotationPreference(s.generation,enabled))}
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
      "favorites"->readFavorites(s)
      "favorite"->{val type=kind(args);require(type!="favorite");updateFavorite(s,type,id(args),args.getBoolean("enabled"))}
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
  fun playback(args:JSONObject,track:Boolean=true):Playlist {
    val s=current();check(!args.has("_sessionGeneration")||args.getLong("_sessionGeneration")==s.generation){"媒体账户已改变，操作未执行"};val selected=id(args);val queue=args.optJSONArray("queue")?:JSONArray();require(queue.length()<=500){"播放列表过大"}
    if(args.has("seconds")){val seconds=args.getDouble("seconds");require(seconds.isFinite()&&seconds in 0.0..604800.0)}
    if(args.has("playlist")){
      require(track){"放映不能替换独立播放器的队列"}
      val ticket=args.getString("playlist");val index=synchronized(lock){playbackPlan(s,ticket,selected=selected).plan.entries.indexOfFirst{it.id==selected}}
      require(index>=0);val window=playbackWindow(ticket,index)
      val position=if(args.has("seconds")){val seconds=args.getDouble("seconds");require(seconds.isFinite()&&seconds in 0.0..604800.0);(seconds*1000).toLong()}else if(args.optBoolean("resume")&&window.options.optBoolean("fullLength",true))(resume(s,selected)*1000).toLong()else if(window.options.optBoolean("reference"))window.starts[window.index]else 0
      return Playlist(window.items,window.items[window.index].path,position,ticket,index)
    }
    val entries=linkedMapOf<String,String>()
    for(i in 0 until queue.length()){val item=queue.getJSONObject(i);entries[id(item)]=item.optString("title","视频").take(512)}
    if(!entries.containsKey(selected))entries[selected]=args.optString("title","视频").take(512)
    val seconds=if(!args.has("seconds")&&args.optBoolean("resume"))resume(s,selected)else args.optDouble("seconds",0.0);require(seconds.isFinite()&&seconds in 0.0..604800.0)
    if(!track){val suffix=if(args.optBoolean("super"))"?super=true"else"";val ordered=entries.map{(id,title)->PlaybackQueue.Item(asset(s,"api/v1/videos/$id/play$suffix",false),title)};return Playlist(ordered,asset(s,"api/v1/videos/$selected/play$suffix",false),(seconds*1000).toLong())}
    val ticket=UUID.randomUUID().toString();val rows=entries.map{(id,title)->JSONObject().put("id",id).put("title",title)}
    val options=synchronized(lock){JSONObject().put("fullLength",true).put("super",args.optBoolean("super")).put("loop",singleLoop).put("rate",singleRate)}
    val plan=RhVideoPlaybackPlan(rows,options);val index=plan.entries.indexOfFirst{it.id==selected}
    synchronized(lock){check(live(s)){"媒体账户已改变"};playbackSession=PlaybackSession(ticket,s.generation,plan,UUID.randomUUID().toString())}
    val window=playbackWindow(ticket,index)
    return Playlist(window.items,window.items[window.index].path,(seconds*1000).toLong(),ticket,index)
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
