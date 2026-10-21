package com.railgunhamster.rhfiles

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.*
import android.view.*
import android.webkit.*
import android.widget.*
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** A separate, read-only origin/process. Books never get the file-manager IPC. */
class EbookActivity:AppCompatActivity(){
  companion object {private const val DOMAIN="ebook.rhfiles.local";private var dataDirectoryReady=false
    const val CSP="default-src 'none'; script-src 'self'; style-src 'self' blob: 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self' blob:; frame-src blob:; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'"
  }
  private val worker=Executors.newSingleThreadExecutor()
  private val closing=AtomicBoolean(false)
  private var web:WebView?=null
  @Volatile private var source:EbookSource?=null
  private lateinit var future:Future<EbookSource>
  private lateinit var root:LinearLayout
  private lateinit var content:FrameLayout
  private lateinit var title:TextView
  private lateinit var header:LinearLayout
  private var path=""
  private var theme="light"
  private var settingsOnly=false
  private fun dp(value:Int)=(value*resources.displayMetrics.density+.5f).toInt()
  private fun closeReader(){setResult(if(settingsOnly)RESULT_CANCELED else RESULT_OK);finish()}
  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState:Bundle?){
    if(Build.VERSION.SDK_INT>=28&&!dataDirectoryReady){WebView.setDataDirectorySuffix("ebook");dataDirectoryReady=true}
    super.onCreate(savedInstanceState)
    settingsOnly=intent.getBooleanExtra("settingsOnly",false)
    path=intent.getStringExtra("path")?:if(settingsOnly)""else run{finish();return};theme=intent.getStringExtra("theme")?:"light"
    root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
    header=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(4),0,dp(4),0)}
    val close=ImageButton(this).apply{setImageResource(android.R.drawable.ic_menu_close_clear_cancel);contentDescription="关闭电子书";setBackgroundColor(Color.TRANSPARENT);setOnClickListener{closeReader()}}
    title=TextView(this).apply{text=intent.getStringExtra("name")?:"电子书";textSize=17f;maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END;setPadding(dp(8),0,dp(8),0)}
    val more=ImageButton(this).apply{setImageResource(android.R.drawable.ic_menu_more);contentDescription="电子书更多选项";setBackgroundColor(Color.TRANSPARENT);setOnClickListener{anchor->PopupMenu(this@EbookActivity,anchor).apply{menu.add("使用其他应用打开").setOnMenuItemClickListener{openOther();true};menu.add("关闭阅读器").setOnMenuItemClickListener{closeReader();true};show()}}}
    header.addView(close,LinearLayout.LayoutParams(dp(48),dp(48)));header.addView(title,LinearLayout.LayoutParams(0,dp(48),1f));header.addView(more,LinearLayout.LayoutParams(dp(48),dp(48)))
    content=FrameLayout(this);root.addView(header,LinearLayout.LayoutParams(-1,dp(56)));root.addView(content,LinearLayout.LayoutParams(-1,0,1f));setContentView(root)
    ViewCompat.setOnApplyWindowInsetsListener(root){view,insets->val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);insets}
    setThemeColors(theme)
    if(!settingsOnly)future=worker.submit<EbookSource>{
      val book=EbookSource(applicationContext,path){closing.get()}
      synchronized(closing){if(closing.get()){book.close();error("阅读已关闭")};source=book};book
    }
    val assets=WebViewAssetLoader.Builder().setDomain(DOMAIN).addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).build()
    val view=WebView(this);web=view
    view.settings.apply{javaScriptEnabled=true;domStorageEnabled=true;allowFileAccess=false;allowContentAccess=false;javaScriptCanOpenWindowsAutomatically=false;setSupportMultipleWindows(false);mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW;useWideViewPort=true}
    view.webChromeClient=object:WebChromeClient(){override fun onConsoleMessage(message:ConsoleMessage)=true}
    view.webViewClient=object:WebViewClient(){
      override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest)=request.isForMainFrame||request.url.scheme !in setOf("blob","about")
      override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse {
        val uri=request.url
        if(request.method!="GET"||uri.scheme!="https"||uri.authority!=DOMAIN)return response(403,"禁止的阅读请求")
        return try{
          when(uri.path){
            "/book/settings"->jsonResponse(200,ReaderSettings.state(applicationContext).toString())
            "/book/meta"->{val data=future.get(25,TimeUnit.SECONDS).metadata(theme).toString();jsonResponse(200,data)}
            "/book/raw"->WebResourceResponse("application/octet-stream",null,future.get(25,TimeUnit.SECONDS).raw()).apply{responseHeaders=mapOf("Cache-Control" to "no-store","X-Content-Type-Options" to "nosniff")}
            "/book/resource"->WebResourceResponse("application/octet-stream",null,future.get(25,TimeUnit.SECONDS).resource(uri.getQueryParameter("name")?:"",uri.getQueryParameter("text")=="1")).apply{responseHeaders=mapOf("Cache-Control" to "no-store","X-Content-Type-Options" to "nosniff")}
            else->assets.shouldInterceptRequest(uri)?.apply{responseHeaders=(responseHeaders?:emptyMap())+mapOf("Content-Security-Policy" to CSP,"X-Content-Type-Options" to "nosniff")}?:response(404,"阅读资源不存在")
          }
        }catch(error:Exception){response(422,(error.cause?:error).message?:"无法读取电子书")}
      }
      override fun onRenderProcessGone(view:WebView,detail:RenderProcessGoneDetail):Boolean {
        content.removeView(view);view.destroy();web=null;showFailure("阅读页面已停止，可能是文件损坏或内存不足。文件管理器和原文件不受影响。");return true
      }
    }
    NativeAutomation.install(this);NativeAutomation.debugging(this)
    if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))WebViewCompat.addWebMessageListener(view,"RHFilesReader",setOf("https://$DOMAIN")){owner,message,origin,mainFrame,reply->
      if(owner===web&&mainFrame&&origin.host==DOMAIN&&!closing.get())try{val command=JSONObject(message.data?:"{}");when(command.optString("action")){
        "close"->closeReader();"other"->openOther();"theme"->setThemeColors(command.optString("theme"));"title"->title.text=command.optString("title").take(150)
        "automation"->{val response=JSONObject().put("id",command.optInt("id"));try{response.put("result",NativeAutomation.dispatch(this,command.getString("command"),command.optJSONObject("args")?:JSONObject()))}catch(e:Exception){response.put("error",e.message?:"原生自动化操作失败")};reply.postMessage(response.toString())}
        "settings"->worker.execute{val response=JSONObject().put("id",command.optInt("id"));try{
          if(command.has("values"))ReaderSettings.replace(applicationContext,command.getJSONObject("values"))else ReaderSettings.update(applicationContext,command.getString("key"),command.getString("value"))
          response.put("saved",true)
        }catch(e:Exception){response.put("error",e.message?:"阅读配置保存失败")}
          runOnUiThread{try{reply.postMessage(response.toString());if(settingsOnly&&command.optBoolean("finish")&&!response.has("error")){setResult(RESULT_OK);finish()}}catch(_:Exception){}}
        }
        "settingsFailed"->if(settingsOnly){setResult(RESULT_CANCELED,Intent().putExtra("error",command.optString("message")));finish()}
      }}catch(_:Exception){}
    }
    content.addView(view,FrameLayout.LayoutParams(-1,-1));view.loadUrl("https://$DOMAIN/assets/"+if(settingsOnly)"settings.html"else "index.html")
    onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){override fun handleOnBackPressed(){
      val current=web?:run{closeReader();return};var replied=false
      val fallback=Runnable{if(!replied&&!isFinishing)closeReader()};root.postDelayed(fallback,500)
      current.evaluateJavascript("window.rhfilesReaderBack?.()===true"){handled->replied=true;root.removeCallbacks(fallback);if(handled!="true")closeReader()}
    }})
  }
  private fun jsonResponse(status:Int,data:String)=WebResourceResponse("application/json","utf-8",status,if(status==200)"OK" else "Error",mapOf("Cache-Control" to "no-store","Content-Security-Policy" to CSP),ByteArrayInputStream(data.toByteArray()))
  private fun response(status:Int,message:String)=jsonResponse(status,JSONObject().put("error",message.take(2000)).toString())
  private fun setThemeColors(value:String){
    theme=if(value in setOf("light","sepia","dark"))value else "light"
    val dark=theme=="dark";val background=when(theme){"dark"->Color.rgb(28,32,38);"sepia"->Color.rgb(248,241,226);else->Color.WHITE};val foreground=if(dark)Color.rgb(232,236,241) else Color.rgb(37,41,48)
    root.setBackgroundColor(background);header.setBackgroundColor(background);title.setTextColor(foreground);for(i in 0 until header.childCount)(header.getChildAt(i) as? ImageButton)?.setColorFilter(foreground)
    WindowCompat.getInsetsController(window,root).apply{isAppearanceLightStatusBars=!dark;isAppearanceLightNavigationBars=!dark}
  }
  private fun showFailure(message:String){content.removeAllViews();content.addView(LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(24),dp(32),dp(24),0);addView(TextView(this@EbookActivity).apply{text=message;textSize=16f});addView(Button(this@EbookActivity).apply{text="使用其他应用打开";setOnClickListener{openOther()}});addView(Button(this@EbookActivity).apply{text="关闭阅读器";setOnClickListener{closeReader()}})})}
  private fun openOther(){try{val storage=NativeStorage(this);val uri=if(storage.isDocument(path))storage.docUri(path)else FileProvider.getUriForFile(this,"$packageName.fileprovider",storage.local(path));val name=intent.getStringExtra("name")?:"book.epub";val mime=when(name.substringAfterLast('.').lowercase()){ "epub"->"application/epub+zip";"mobi","prc"->"application/x-mobipocket-ebook";"azw","azw3"->"application/vnd.amazon.ebook";else->"application/octet-stream"};startActivity(Intent.createChooser(Intent(Intent.ACTION_VIEW).setDataAndType(uri,mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),"选择其他阅读器"))}catch(error:Exception){Toast.makeText(this,error.message?:"没有可用的阅读器",Toast.LENGTH_LONG).show()}}
  override fun onPause(){web?.onPause();super.onPause()}
  override fun onResume(){super.onResume();web?.onResume()}
  override fun onDestroy(){
    synchronized(closing){closing.set(true);try{source?.close()}catch(_:Exception){}}
    worker.shutdownNow();web?.let{content.removeView(it);it.stopLoading();it.destroy()};web=null;super.onDestroy()
  }
}
