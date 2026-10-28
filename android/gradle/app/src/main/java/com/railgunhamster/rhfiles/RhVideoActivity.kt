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
  private data class ExportBuffer(val ticket:String,val generation:Long,val text:StringBuilder=StringBuilder(),var index:Int=0,var bytes:Int=0,var touched:Long=android.os.SystemClock.elapsedRealtime())
  private var exportBuffer:ExportBuffer?=null
  private var presentation:RhVideoPresentation?=null
  private var mediaEvents:java.io.Closeable?=null
  private val exportDocument=registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")){uri->
    val text=exportText;exportText=null
    if(uri!=null&&text!=null)io.execute{try{contentResolver.openOutputStream(uri,"wt")?.use{it.write(text.toByteArray(Charsets.UTF_8))}?:error("无法写入文件");runOnUiThread{android.widget.Toast.makeText(this,"已导出",android.widget.Toast.LENGTH_SHORT).show()}}catch(e:Exception){runOnUiThread{android.widget.Toast.makeText(this,"导出失败：${e.message}",android.widget.Toast.LENGTH_LONG).show()}}}
  }
  override fun onCreate(savedInstanceState:Bundle?){
    super.onCreate(savedInstanceState)
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
            require(path in setOf("/rhvideo/rhvideo.html","/rhvideo/rhvideo-operations.json","/rhvideo/css/rhvideo.css","/rhvideo/css/rhvideo-mobile.css","/rhvideo/css/rhvideo-workbench.css","/rhvideo/js/automation-core.js","/rhvideo/js/rhvideo-model.js","/rhvideo/js/rhvideo-client.js","/rhvideo/js/rhvideo-mobile.js","/rhvideo/js/rhvideo-workbench.js","/rhvideo/js/rhvideo-index.js","/rhvideo/js/rhvideo-refresh.js","/rhvideo/js/rhvideo-worker.js","/rhvideo/js/rhvideo-search.js","/rhvideo/js/rhvideo-tags.js","/rhvideo/vendor/pinyin-pro/pinyin-pro.js"))
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
            client.validateContext(args,action=="logout")
            val contextArgs=JSONObject(args.toString())
            val outgoingGridGeneration=if(action in listOf("connect","register","logout"))runCatching{client.sessionGeneration()}.getOrNull()else null
            if(action in listOf("connect","register","logout")){synchronized(this){exportBuffer=null};runOnUiThread{if(client.contextMatches(contextArgs,true)){presentation?.close();PlaybackActivity.closeRhVideo()};outgoingGridGeneration?.let{RhVideoGridActivity.dismiss(it)}}}
            val value=when(action){
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
              "player.state","player.control"->{val result=java.util.concurrent.CompletableFuture<JSONObject>();runOnUiThread{try{check(client.contextMatches(contextArgs,true)){"媒体账户已改变"};result.complete(if(action=="player.state")PlaybackActivity.rhState()else PlaybackActivity.rhControl(JSONObject(args.toString()).also{if(it.optString("command")=="resume")it.put("command","play")}))}catch(e:Exception){result.completeExceptionally(e)}};result.get(10,java.util.concurrent.TimeUnit.SECONDS)}
              "close"->{runOnUiThread{finish()};true}
              "play"->{val playback=client.playback(args);runOnUiThread{if(!isFinishing)PlaybackActivity.launchRhVideo(this,Intent(this,PlaybackActivity::class.java).putExtra("path",playback.path).putExtra("name",args.optString("title","视频")).putExtra("kind","video").putExtra("positionMs",playback.position).putExtra("queue",PlaybackQueue.json(playback.items)).putExtra("rhvideoPlaylist",playback.ticket).putExtra("rhvideoIndex",playback.globalIndex))};JSONObject().put("opened",true)}
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
  override fun onStop(){presentation?.pause();super.onStop()}
  override fun onDestroy(){mediaEvents?.close();mediaEvents=null;presentation?.close();presentation=null;io.shutdownNow();if(::web.isInitialized){web.stopLoading();web.destroy()};super.onDestroy()}
}
