package com.railgunhamster.rhfiles

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import org.json.JSONArray
import java.io.ByteArrayInputStream
import java.util.concurrent.Executors

/** Packaged RHFiles UI, not an embedded RHVideo website. Native I/O and Media3. */
class RhVideoActivity:AppCompatActivity() {
  private lateinit var web:WebView
  private val io=Executors.newFixedThreadPool(4)
  private val client by lazy{RhVideoClient.get(this)}
  private var exportText:String?=null
  private var exportConfiguration:JSONObject?=null
  private var configurationPick:JSONObject?=null
  private var zipPick:JSONObject?=null
  private data class ExportBuffer(val ticket:String,val generation:Long,val text:StringBuilder=StringBuilder(),var index:Int=0,var bytes:Int=0,var touched:Long=android.os.SystemClock.elapsedRealtime())
  private var exportBuffer:ExportBuffer?=null
  private var presentation:RhVideoPresentation?=null
  private var mediaEvents:java.io.Closeable?=null
  private var closeReceipt:RhVideoCloseReceiptStore.Ticket?=null
  private val exportDocument=registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")){uri->
    val text=exportText;val context=exportConfiguration;exportText=null;exportConfiguration=null
    if(uri==null){if(context!=null)configurationEvent("export",context,JSONObject().put("saved",false));return@registerForActivityResult}
    if(text!=null)io.execute{try{
      if(context!=null)check(client.contextMatches(context,true)){"媒体账户已改变，备份未保存"}
      contentResolver.openOutputStream(uri,"wt")?.use{it.write(text.toByteArray(Charsets.UTF_8))}?:error("无法写入文件")
      if(context!=null)configurationEvent("export",context,JSONObject().put("saved",true).put("path",uri.toString()))
      else runOnUiThread{android.widget.Toast.makeText(this,"已导出",android.widget.Toast.LENGTH_SHORT).show()}
    }catch(e:Exception){if(context!=null)configurationEvent("export",context,JSONObject().put("error",e.message?:"备份写入失败"))else runOnUiThread{android.widget.Toast.makeText(this,"导出失败：${e.message}",android.widget.Toast.LENGTH_LONG).show()}}}
  }
  private val configurationDocument=registerForActivityResult(ActivityResultContracts.OpenDocument()){uri->
    val context=configurationPick;configurationPick=null
    if(context!=null){if(uri==null)configurationEvent("preview",context,JSONObject().put("picked",false))else io.execute{try{configurationEvent("preview",context,previewConfiguration(uri,context))}catch(e:Exception){configurationEvent("preview",context,JSONObject().put("error",e.message?:"配置备份读取失败"))}}}
  }
  private val zipDocument=registerForActivityResult(ActivityResultContracts.CreateDocument("application/zip")){uri->
    val pending=synchronized(this){zipPick.also{zipPick=null}}
    if(pending==null){if(uri!=null)RhVideoZipDestination.document(applicationContext,uri).failed();return@registerForActivityResult}
    if(uri==null){client.discardZipPick(pending.optString("ticket"));zipEvent(pending,JSONObject().put("picked",false));return@registerForActivityResult}
    val app=applicationContext;val destination=RhVideoZipDestination.document(app,uri);val downloads=RhVideoDownloads.get(app)
    try{downloads.prepare{
      try{zipEvent(pending,client.startPreparedZip(pending,destination))}
      catch(e:Exception){val cleanup=destination.failed();val text=(e.message?:"ZIP 下载未启动")+if(cleanup.isEmpty())"" else "；$cleanup";downloads.reportWarning(text);zipEvent(pending,JSONObject().put("error",text))}
    }}catch(e:Exception){client.discardZipPick(pending.optString("ticket"));val cleanup=destination.failed();val text="保存准备队列已满：${e.message}"+if(cleanup.isEmpty())"" else "；$cleanup";downloads.reportWarning(text);zipEvent(pending,JSONObject().put("error",text))}
  }
  private fun zipEvent(pending:JSONObject,result:JSONObject){runOnUiThread{if(!isDestroyed&&::web.isInitialized)web.evaluateJavascript("window.RHVideoNative?.dispatch('rhvideo-download-picker',${JSONObject().put("generation",pending.optLong("_sessionGeneration",-1)).put("pickId",pending.optString("pickId")).put("result",result)})",null)}}
  private fun configurationEvent(kind:String,context:JSONObject,value:JSONObject){
    runOnUiThread{if(!isDestroyed&&client.contextMatches(context,true))web.evaluateJavascript("window.RHVideoNative?.dispatch(${JSONObject.quote("rhvideo-configuration-$kind")},${JSONObject().put("generation",client.sessionGeneration()).put("result",value)})",null)}
  }
  private fun configurationUri(value:String)=Uri.parse(value).also{require(it.scheme=="content"&&!it.authority.isNullOrEmpty()){ "请选择系统文件选择器提供的配置文件位置" }}
  private fun previewConfiguration(uri:Uri,context:JSONObject):JSONObject{
    check(client.contextMatches(context,true)){"媒体账户已改变，未读取备份"}
    val bytes=contentResolver.openInputStream(uri)?.use{input->val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(16384);while(true){val size=input.read(buffer);if(size<0)break;require(out.size()+size<=RhVideoBackups.LIMIT){"配置备份不能超过 20 MB"};out.write(buffer,0,size)};out.toByteArray()}?:error("无法读取配置文件")
    val document=try{JSONObject(bytes.toString(Charsets.UTF_8))}catch(_:Exception){error("文件不是有效的 JSON 配置备份")}
    check(client.contextMatches(context,true)){"媒体账户已改变，未预览备份"}
    return client.request("configuration.preview",JSONObject(context.toString()).put("document",document)) as JSONObject
  }
  override fun onCreate(savedInstanceState:Bundle?){
    super.onCreate(savedInstanceState)
    zipPick=savedInstanceState?.getString("rhvideo-zip-pick")?.let{runCatching{JSONObject(it)}.getOrNull()}
    WindowCompat.setDecorFitsSystemWindows(window,false)
    window.statusBarColor=Color.rgb(247,249,253);window.navigationBarColor=Color.rgb(247,249,253)
    WindowCompat.getInsetsController(window,window.decorView).apply{isAppearanceLightStatusBars=true;isAppearanceLightNavigationBars=true}
    NativeAutomation.install(this);NativeAutomation.debugging(this)
    val root=android.widget.FrameLayout(this)
    web=WebView(this);root.addView(web,android.widget.FrameLayout.LayoutParams(-1,-1));setContentView(root)
    mediaEvents=client.listen{name,payload->runOnUiThread{if(!isDestroyed)web.evaluateJavascript("window.RHVideoNative?.dispatch(${JSONObject.quote(name)},$payload)",null)}}
    presentation=RhVideoPresentation(this,root,web)
    // WebView padding does not reliably inset its HTML viewport. Pad its native
    // container so status/navigation bars, cutouts and IME cannot cover content.
    ViewCompat.setOnApplyWindowInsetsListener(root){v,insets->val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime() or WindowInsetsCompat.Type.displayCutout());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);insets}
    web.settings.apply{javaScriptEnabled=true;allowFileAccess=false;allowContentAccess=false;domStorageEnabled=false;useWideViewPort=true;setSupportMultipleWindows(false);mediaPlaybackRequiresUserGesture=true;mixedContentMode=android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW}
    web.webViewClient=object:WebViewClient(){
      override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest)=true
      override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse {
        val uri=request.url
        if(request.method!="GET"||uri.scheme!="https"||uri.host!="appassets.androidplatform.net"||uri.port!=-1||uri.query!=null)return denied()
        val path=uri.path?:return denied()
        return try{
          if(path.startsWith("/rhvideo-catalog/")&&!request.isForMainFrame){
            WebResourceResponse("application/json","UTF-8",200,"OK",mapOf("Cache-Control" to "no-store","X-Content-Type-Options" to "nosniff"),client.catalogResource(path.removePrefix("/rhvideo-catalog/")))
          }else if(path.startsWith("/rhvideo-media/")&&!request.isForMainFrame){
            val key=path.removePrefix("/rhvideo-media/");require(key.matches(Regex("[a-f0-9-]{36}")))
            val media=client.media(key,image=true)
            WebResourceResponse(media.type.substringBefore(';'),null,200,"OK",mapOf("Cache-Control" to "no-store","X-Content-Type-Options" to "nosniff","Content-Security-Policy" to "sandbox; default-src 'none'; style-src 'unsafe-inline'"),media.stream)
          }else{
require(path in setOf("/rhvideo/rhvideo.html","/rhvideo/rhvideo-operations.json","/rhvideo/css/rhvideo.css","/rhvideo/css/rhvideo-mobile.css","/rhvideo/css/rhvideo-workbench.css","/rhvideo/js/automation-core.js","/rhvideo/js/rhvideo-model.js","/rhvideo/js/rhvideo-client.js","/rhvideo/js/rhvideo-mobile.js","/rhvideo/js/rhvideo-configuration.js","/rhvideo/js/rhvideo-exports.js","/rhvideo/js/rhvideo-duplicates.js","/rhvideo/js/rhvideo-task-priority.js","/rhvideo/js/rhvideo-task-presentation.js","/rhvideo/js/rhvideo-task-center.js","/rhvideo/js/rhvideo-rules-model.js","/rhvideo/js/rhvideo-rules.js","/rhvideo/js/rhvideo-workbench.js","/rhvideo/js/rhvideo-index.js","/rhvideo/js/rhvideo-refresh.js","/rhvideo/js/rhvideo-worker.js","/rhvideo/js/rhvideo-search.js","/rhvideo/js/rhvideo-tags.js","/rhvideo/vendor/pinyin-pro/pinyin-pro.js"))
            val mime=when{path.endsWith(".html")->"text/html";path.endsWith(".css")->"text/css";path.endsWith(".json")->"application/json";else->"application/javascript"}
            val input=if(path.endsWith(".html")){
              val html=assets.open(path.removePrefix("/")).bufferedReader().use{it.readText()}
                .replace("http://127.0.0.1:*","https://appassets.androidplatform.net")
                .replace("</head>","<link rel=\"stylesheet\" href=\"css/rhvideo-mobile.css\"></head>")
                .replace("<script src=\"js/automation-core.js\">","<script src=\"js/rhvideo-mobile.js\"></script><script src=\"js/automation-core.js\">")
              ByteArrayInputStream(html.toByteArray(Charsets.UTF_8))
            }else assets.open(path.removePrefix("/"))
            WebResourceResponse(mime,"UTF-8",200,"OK",mapOf("Cache-Control" to "no-store","X-Content-Type-Options" to "nosniff"),input)
          }
        }catch(error:Exception){
          if(path.startsWith("/rhvideo-catalog/"))WebResourceResponse("application/json","UTF-8",502,"Bad Gateway",mapOf("Cache-Control" to "no-store"),ByteArrayInputStream(JSONObject().put("error",error.message?:"清单读取失败").toString().toByteArray(Charsets.UTF_8))) else denied()
        }
      }
    }
    if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
      android.widget.Toast.makeText(this,"请先更新 Android System WebView",android.widget.Toast.LENGTH_LONG).show();finish();return
    }
    WebViewCompat.addWebMessageListener(web,"RHVideoBridge",setOf("https://appassets.androidplatform.net")){source,message,origin,main,reply->
      if(main&&source===web&&origin.host=="appassets.androidplatform.net"&&!io.isShutdown){
        val request=try{val raw=message.data?:"";require(raw.length<=256*1024);JSONObject(raw)}catch(_:Exception){null}
        if(request!=null)io.execute{
          val response=JSONObject().put("id",request.optInt("id"))
          try{
            val action=request.getString("action");val args=request.optJSONObject("args")?:JSONObject()
            if(action=="automation.receipt"){
              check(NativeAutomation.enabled(this)){"请先开启 ADB 自动化"}
              response.put("result",RhVideoCloseReceipts.read(args)?:JSONObject.NULL)
              runOnUiThread{if(!isDestroyed)try{reply.postMessage(response.toString())}catch(_:Exception){}}
              return@execute
            }
            client.validateContext(args,action=="logout")
            val contextArgs=JSONObject(args.toString())
            val outgoingGridGeneration=if(action in listOf("connect","logout"))runCatching{client.sessionGeneration()}.getOrNull()else null
            if(action in listOf("connect","logout")){synchronized(this){exportBuffer=null};runOnUiThread{if(client.contextMatches(contextArgs,true)){presentation?.close();PlaybackActivity.closeRhVideo()};outgoingGridGeneration?.let{RhVideoGridActivity.dismiss(it)}}}
            val value=when(action){
              "exports.uiReady"->{val open=intent.getBooleanExtra("rhvideoExportPanel",false);intent.removeExtra("rhvideoExportPanel");JSONObject().put("open",open).put("pending",synchronized(this){zipPick?.takeIf{it.optString("process")==client.processIdentity()}?.let{JSONObject(it.toString())}?:JSONObject.NULL})}
              "exports.download"->{
                if(args.has("path"))client.startZip(args,RhVideoZipDestination.local(applicationContext,args.getString("path")))
                else{
                  val meta=client.prepareZip(args);val pending=JSONObject().put("id",meta.getString("id")).put("ticket",meta.getString("ticket")).put("pickId",java.util.UUID.randomUUID().toString()).put("process",client.processIdentity()).put("_sessionGeneration",meta.getLong("generation"))
                  try{synchronized(this){check(zipPick==null){"已有 ZIP 保存选择器打开"};zipPick=pending}}catch(e:Exception){client.discardZipPick(meta.getString("ticket"));throw e}
                  runOnUiThread{try{zipDocument.launch(meta.getString("name"))}catch(e:Exception){client.discardZipPick(meta.getString("ticket"));synchronized(this){if(zipPick===pending)zipPick=null};zipEvent(pending,JSONObject().put("error",e.message?:"无法打开系统保存选择器"))}}
                  JSONObject().put("requested",true).put("pickId",pending.getString("pickId"))
                }
              }
              "configuration.preview"->{
                if(args.has("path"))previewConfiguration(configurationUri(args.getString("path")),contextArgs)
                else{check(configurationPick==null){"已有配置文件选择器打开"};configurationPick=contextArgs;runOnUiThread{try{configurationDocument.launch(arrayOf("application/json","text/plain","application/octet-stream"))}catch(e:Exception){configurationPick=null;configurationEvent("preview",contextArgs,JSONObject().put("error",e.message?:"无法打开系统文件选择器"))}};JSONObject().put("requested",true)}
              }
              "configuration.export"->{
                val backup=client.request(action,args) as JSONObject;val text=backup.toString(2);require(text.toByteArray(Charsets.UTF_8).size<=RhVideoBackups.LIMIT){"配置备份超过 20 MB"}
                if(args.has("path")){
                  val uri=configurationUri(args.getString("path"));check(client.contextMatches(contextArgs,true)){"媒体账户已改变，未保存备份"}
                  contentResolver.openOutputStream(uri,"wt")?.use{it.write(text.toByteArray(Charsets.UTF_8))}?:error("无法写入配置文件");JSONObject().put("saved",true).put("path",uri.toString())
                }else{check(exportText==null){"已有导出操作"};exportText=text;exportConfiguration=contextArgs;runOnUiThread{try{exportDocument.launch("RHVideo-configuration.json")}catch(e:Exception){exportText=null;exportConfiguration=null;configurationEvent("export",contextArgs,JSONObject().put("error",e.message?:"无法打开系统保存选择器"))}};JSONObject().put("requested",true)}
              }
              "player.close","player.back"->{val result=java.util.concurrent.CompletableFuture<JSONObject>();runOnUiThread{try{check(client.contextMatches(contextArgs,true)){"媒体账户已改变"};result.complete(PlaybackActivity.rhControl(JSONObject().put("command",if(action=="player.back")"back"else"close")))}catch(e:Exception){result.completeExceptionally(e)}};result.get(10,java.util.concurrent.TimeUnit.SECONDS)}
              "page.volume"->{val value=args.getInt("value");require(value in 0..100);val result=java.util.concurrent.CompletableFuture<JSONObject>();runOnUiThread{try{check(client.contextMatches(contextArgs,true)){"媒体账户已改变"};result.complete(RhVideoVolume.set(value))}catch(e:Exception){result.completeExceptionally(e)}};result.get(10,java.util.concurrent.TimeUnit.SECONDS)}
              "export.chunk"->{
                val ticket=args.getString("ticket");require(ticket.matches(Regex("[A-Za-z0-9_-]{1,128}")))
                val index=args.getInt("index");val text=args.getString("text");require(text.length<=64000)
                synchronized(this){
                  if(args.optBoolean("reset")){require(index==0);exportBuffer=ExportBuffer(ticket,client.sessionGeneration())}
                  val buffer=exportBuffer?.takeIf{it.ticket==ticket&&it.generation==client.sessionGeneration()&&android.os.SystemClock.elapsedRealtime()-it.touched<120000}?:error("导出准备已失效")
                  require(buffer.index==index){"导出分片顺序无效，不会重复追加"}
                  // Conservative at a split surrogate pair: never undercount
                  // UTF-8 bytes or let multibyte names bypass the desktop limit.
                  val bytes=text.toByteArray(Charsets.UTF_8).size+
                    (if(text.isNotEmpty()&&Character.isHighSurrogate(text.last()))2 else 0)+
                    (if(text.isNotEmpty()&&Character.isLowSurrogate(text.first()))2 else 0)
                  require(buffer.bytes+bytes<=32*1024*1024){"导出超过 32 MiB"}
                  buffer.text.append(text);buffer.bytes+=bytes;buffer.index++;buffer.touched=android.os.SystemClock.elapsedRealtime();JSONObject().put("characters",buffer.text.length)
                }
              }
              "export.finish"->{
                val text=synchronized(this){val buffer=exportBuffer?.takeIf{it.ticket==args.getString("ticket")&&it.generation==client.sessionGeneration()&&android.os.SystemClock.elapsedRealtime()-it.touched<120000}?:error("导出准备已失效");exportBuffer=null;buffer.text.toString()}
                JSONArray(text);check(exportText==null){"已有导出操作"};exportText=text;runOnUiThread{exportDocument.launch("RHVideo-selection.json")};JSONObject().put("requested",true)
              }
              "presentation.open","presentation.close","presentation.state","presentation.control","presentation.bounds"->{
                val result=java.util.concurrent.CompletableFuture<JSONObject>();runOnUiThread{try{val p=presentation?:error("放映窗口已关闭");result.complete(when(action){"presentation.open"->p.open(args);"presentation.close"->p.close();"presentation.state"->p.state();"presentation.control"->p.control(args);else->p.bounds(args)})}catch(e:Exception){result.completeExceptionally(e)}};result.get(10,java.util.concurrent.TimeUnit.SECONDS)
              }
              "grid.open"->{
                var ticket=args.optString("playlist");val count=args.optInt("count",4);val low=args.optBoolean("super")
                if(ticket.isEmpty()){ticket=java.util.UUID.randomUUID().toString();client.request("playlist.prepare",JSONObject().put("ticket",ticket).put("reset",true).put("items",args.getJSONArray("items")).put("options",JSONObject().put("grid",true)))}
                val data=client.openGrid(ticket,count,low)
                runOnUiThread{startActivity(Intent(this,RhVideoGridActivity::class.java).putExtra("grid",data.toString()).putExtra("playlist",ticket).putExtra("count",count).putExtra("super",low))};JSONObject().put("opened",true).put("offset",data.getInt("offset"))
              }
              "grid.state","grid.control","grid.expand","grid.page","grid.seekGroup","grid.favorite","grid.mark"->{val result=java.util.concurrent.CompletableFuture<JSONObject>();runOnUiThread{try{check(client.contextMatches(contextArgs,true)){"媒体账户已改变"};result.complete(if(action=="grid.state")RhVideoGridActivity.state()else RhVideoGridActivity.control(JSONObject(args.toString()).also{if(action=="grid.expand")it.put("command","expand");if(action=="grid.page")it.put("command","page").put("value",args.getInt("direction"));if(action=="grid.seekGroup")it.put("command","seekGroup").put("value",args.getDouble("ratio"));if(action=="grid.favorite")it.put("command","favorite");if(action=="grid.mark")it.put("command","mark")}))}catch(e:Exception){result.completeExceptionally(e)}};result.get(10,java.util.concurrent.TimeUnit.SECONDS)}
              "grid.close"->{val result=java.util.concurrent.CompletableFuture<JSONObject>();runOnUiThread{try{check(client.contextMatches(contextArgs,true)){"媒体账户已改变"};result.complete(RhVideoGridActivity.close())}catch(e:Exception){result.completeExceptionally(e)}};result.get(10,java.util.concurrent.TimeUnit.SECONDS)}
              "player.closeParent"->{val result=java.util.concurrent.CompletableFuture<JSONObject>();runOnUiThread{try{check(client.contextMatches(contextArgs,true)){"媒体账户已改变"};result.complete(PlaybackActivity.retireRhParent(this,args))}catch(e:Exception){result.completeExceptionally(e)}};result.get(10,java.util.concurrent.TimeUnit.SECONDS)}
              "player.state","player.control"->{val result=java.util.concurrent.CompletableFuture<JSONObject>();runOnUiThread{try{check(client.contextMatches(contextArgs,true)){"媒体账户已改变"};result.complete(if(action=="player.state")PlaybackActivity.rhState()else PlaybackActivity.rhControl(JSONObject(args.toString()).also{if(it.optString("command")=="resume")it.put("command","play")}))}catch(e:Exception){result.completeExceptionally(e)}};result.get(10,java.util.concurrent.TimeUnit.SECONDS)}
              "close"->{
                if(!args.has("_automationRun")){runOnUiThread{finish()};true}
                else when(val admitted=RhVideoCloseReceipts.begin(args.getJSONObject("_automationRun"))){
                  is RhVideoCloseReceiptStore.Admission.Confirmed->admitted.result
                  is RhVideoCloseReceiptStore.Admission.Start->{
                    runOnUiThread{
                      try{check(!isDestroyed&&closeReceipt==null){"媒体库已在关闭"};closeReceipt=admitted.ticket;finish()}
                      catch(_:Exception){admitted.ticket.finish(false);if(closeReceipt===admitted.ticket)closeReceipt=null;if(!isDestroyed)try{reply.postMessage(response.put("error","未能关闭媒体库；没有自动重试").toString())}catch(_:Exception){}}
                    }
                    // This producer is about to disappear. Only onDestroy can
                    // confirm completion; a surviving file pane reads it.
                    return@execute
                  }
                }
              }
              "play"->{val playback=client.playback(args);runOnUiThread{if(!isFinishing&&(playback.ticket==null||client.playbackActive(playback.ticket,playback.lease)))PlaybackActivity.launchRhVideo(this,Intent(this,PlaybackActivity::class.java).putExtra("path",playback.path).putExtra("name",args.optString("title","视频")).putExtra("kind","video").putExtra("positionMs",playback.position).putExtra("queue",PlaybackQueue.json(playback.items)).putExtra("rhvideoPlaylist",playback.ticket).putExtra("rhvideoIndex",playback.globalIndex).putExtra("rhvideoLease",playback.lease))};JSONObject().put("opened",true)}
              "export"->{val text=args.getString("text");require(text.length<=256*1024){"请分批导出所选媒体"};check(exportText==null){"已有导出操作"};exportText=text;runOnUiThread{exportDocument.launch("RHVideo-selection.json")};JSONObject().put("requested",true)}
              else->client.request(action,args)
            }
            response.put("result",value)
            if(action=="logout")runOnUiThread{if(client.contextMatches(contextArgs,true)){presentation?.close();PlaybackActivity.closeRhVideo()};outgoingGridGeneration?.let{RhVideoGridActivity.dismiss(it)}}
          }catch(e:Exception){response.put("error",e.message?:"RHVideo 操作失败")}
          runOnUiThread{if(!isDestroyed)try{reply.postMessage(response.toString())}catch(_:Exception){}}
        }
      }
    }
    onBackPressedDispatcher.addCallback(this){web.evaluateJavascript("window.RHVideoBack ? (window.RHVideoBack(),true) : false"){result->if(result!="true")finish()}}
    web.loadUrl("https://appassets.androidplatform.net/rhvideo/rhvideo.html")
  }
  private fun denied()=WebResourceResponse("text/plain","UTF-8",403,"Forbidden",mapOf("Cache-Control" to "no-store"),ByteArrayInputStream(ByteArray(0)))
  override fun onSaveInstanceState(outState:Bundle){synchronized(this){zipPick?.let{outState.putString("rhvideo-zip-pick",it.toString())}};super.onSaveInstanceState(outState)}
  override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);if(intent.getBooleanExtra("rhvideoExportPanel",false)&&::web.isInitialized)web.evaluateJavascript("window.RHVideoNative?.dispatch('rhvideo-export-open',{})",null)}
  override fun onStop(){presentation?.pause();super.onStop()}
  override fun onDestroy(){
    val receipt=closeReceipt;closeReceipt=null;var cleaned=false;var destroyed=false
    try{mediaEvents?.close();mediaEvents=null;presentation?.close();presentation=null;io.shutdownNow();if(::web.isInitialized){web.stopLoading();web.destroy()};cleaned=true}
    finally{try{super.onDestroy();destroyed=true}finally{receipt?.finish(cleaned&&destroyed&&isFinishing&&!isChangingConfigurations)}}
  }
}
