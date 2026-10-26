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
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.concurrent.Executors

/** Packaged RHFiles UI, not an embedded RHVideo website. Native I/O and Media3. */
class RhVideoActivity:AppCompatActivity() {
  private lateinit var web:WebView
  private val io=Executors.newFixedThreadPool(4)
  private val client by lazy{RhVideoClient.get(this)}
  override fun onCreate(savedInstanceState:Bundle?){
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window,false)
    window.statusBarColor=Color.rgb(247,249,253);window.navigationBarColor=Color.rgb(247,249,253)
    WindowCompat.getInsetsController(window,window.decorView).apply{isAppearanceLightStatusBars=true;isAppearanceLightNavigationBars=true}
    NativeAutomation.install(this);NativeAutomation.debugging(this)
    val root=android.widget.FrameLayout(this)
    web=WebView(this);root.addView(web,android.widget.FrameLayout.LayoutParams(-1,-1));setContentView(root)
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
          if(path.startsWith("/rhvideo-media/")&&!request.isForMainFrame){
            val key=path.removePrefix("/rhvideo-media/");require(key.matches(Regex("[a-f0-9-]{36}")))
            val media=client.media(key,image=true)
            WebResourceResponse(media.type.substringBefore(';'),null,200,"OK",mapOf("Cache-Control" to "no-store","X-Content-Type-Options" to "nosniff"),media.stream)
          }else{
            require(path in setOf("/rhvideo/rhvideo.html","/rhvideo/css/rhvideo.css","/rhvideo/css/rhvideo-mobile.css","/rhvideo/js/automation-core.js","/rhvideo/js/rhvideo-model.js","/rhvideo/js/rhvideo-client.js","/rhvideo/js/rhvideo-mobile.js"))
            val mime=when{path.endsWith(".html")->"text/html";path.endsWith(".css")->"text/css";else->"application/javascript"}
            val input=if(path.endsWith(".html")){
              val html=assets.open(path.removePrefix("/")).bufferedReader().use{it.readText()}
                .replace("http://127.0.0.1:*","https://appassets.androidplatform.net")
                .replace("</head>","<link rel=\"stylesheet\" href=\"css/rhvideo-mobile.css\"></head>")
                .replace("<script src=\"js/automation-core.js\">","<script src=\"js/rhvideo-mobile.js\"></script><script src=\"js/automation-core.js\">")
              ByteArrayInputStream(html.toByteArray(Charsets.UTF_8))
            }else assets.open(path.removePrefix("/"))
            WebResourceResponse(mime,"UTF-8",200,"OK",mapOf("Cache-Control" to "no-store","X-Content-Type-Options" to "nosniff"),input)
          }
        }catch(_:Exception){denied()}
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
            val value=when(action){
              "close"->{runOnUiThread{finish()};true}
              "play"->{val playback=client.playback(args);runOnUiThread{if(!isFinishing)startActivity(Intent(this,PlaybackActivity::class.java).putExtra("path",playback.path).putExtra("name",args.optString("title","视频")).putExtra("kind","video").putExtra("positionMs",playback.position).putExtra("queue",PlaybackQueue.json(playback.items)))};JSONObject().put("opened",true)}
              else->client.request(action,args)
            }
            response.put("result",value)
          }catch(e:Exception){response.put("error",e.message?:"RHVideo 操作失败")}
          runOnUiThread{if(!isDestroyed)try{reply.postMessage(response.toString())}catch(_:Exception){}}
        }
      }
    }
    onBackPressedDispatcher.addCallback(this){web.evaluateJavascript("window.RHVideoBack ? (window.RHVideoBack(),true) : false"){result->if(result!="true")finish()}}
    web.loadUrl("https://appassets.androidplatform.net/rhvideo/rhvideo.html")
  }
  private fun denied()=WebResourceResponse("text/plain","UTF-8",403,"Forbidden",mapOf("Cache-Control" to "no-store"),ByteArrayInputStream(ByteArray(0)))
  override fun onDestroy(){io.shutdownNow();if(::web.isInitialized){web.stopLoading();web.destroy()};super.onDestroy()}
}
