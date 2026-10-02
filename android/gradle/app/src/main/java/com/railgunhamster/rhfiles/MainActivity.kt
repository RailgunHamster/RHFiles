package com.railgunhamster.rhfiles

import android.Manifest
import android.app.usage.StorageStatsManager
import android.app.AppOpsManager
import android.content.ClipData
import android.content.Intent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.*
import android.os.storage.StorageManager
import android.provider.Settings
import android.provider.MediaStore
import android.provider.DocumentsContract
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/** Only the trusted main frame gets this bridge. I/O never runs on Android's UI thread. */
class MainActivity : TauriActivity() {
  private val io=Executors.newFixedThreadPool(3)
  private val storage by lazy {NativeStorage(applicationContext)}
  private var picker:((Any?,String?)->Unit)?=null
  private var shared=JSONArray()
  private var appWebView:WebView?=null
  private var watching=false
  private val mainHandler=Handler(Looper.getMainLooper())
  private val changed=Runnable {appWebView?.evaluateJavascript("window.dispatchEvent(new Event('rhfiles-storage-changed'))",null)}
  private val storageReceiver=object:BroadcastReceiver(){override fun onReceive(context:Context?,intent:Intent?){mainHandler.removeCallbacks(changed);mainHandler.postDelayed(changed,400)}}
  private val mediaObserver=object:android.database.ContentObserver(mainHandler){override fun onChange(selfChange:Boolean){mainHandler.removeCallbacks(changed);mainHandler.postDelayed(changed,800)}}
  override fun onCreate(savedInstanceState:Bundle?) {
    super.onCreate(savedInstanceState)
    if(BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
    setSystemTheme(false);receive(intent)
    val filter=IntentFilter().apply{addAction(Intent.ACTION_MEDIA_MOUNTED);addAction(Intent.ACTION_MEDIA_UNMOUNTED);addAction(Intent.ACTION_MEDIA_REMOVED);addAction(Intent.ACTION_MEDIA_BAD_REMOVAL);addDataScheme("file")}
    if(Build.VERSION.SDK_INT>=33)registerReceiver(storageReceiver,filter,Context.RECEIVER_NOT_EXPORTED)else registerReceiver(storageReceiver,filter)
    watching=true
    try{contentResolver.registerContentObserver(MediaStore.Files.getContentUri("external"),true,mediaObserver)}catch(_:Exception){}
  }
  override fun onDestroy(){if(watching)unregisterReceiver(storageReceiver);contentResolver.unregisterContentObserver(mediaObserver);mainHandler.removeCallbacks(changed);appWebView=null;super.onDestroy()}
  override fun onNewIntent(intent:Intent) {super.onNewIntent(intent);setIntent(intent);receive(intent);mainHandler.post(changed)}
  private fun <T> onUi(block:()->T):T {
    if(Looper.myLooper()==Looper.getMainLooper())return block()
    val task=java.util.concurrent.FutureTask<T>{block()};runOnUiThread(task);return task.get()
  }
  @Suppress("DEPRECATION") private fun receive(intent:Intent?) {
    if(intent?.action !in listOf(Intent.ACTION_SEND,Intent.ACTION_SEND_MULTIPLE,Intent.ACTION_VIEW)) return
    val uris=mutableListOf<Uri>()
    intent?.clipData?.let {c->for(i in 0 until c.itemCount.coerceAtMost(1000)) c.getItemAt(i).uri?.let{uris.add(it)}}
    intent?.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let{uris.add(it)}
    intent?.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let{uris.addAll(it)}
    if(intent?.action==Intent.ACTION_VIEW) intent.data?.let{uris.add(it)}
    shared=JSONArray(uris.distinct().filter{it.scheme=="content"}.take(1000).map{it.toString()})
  }
  @Suppress("DEPRECATION") private fun setSystemTheme(dark:Boolean) {
    val color=if(dark) Color.rgb(28,32,38) else Color.WHITE
    window.statusBarColor=color;window.navigationBarColor=color
    WindowCompat.getInsetsController(window,window.decorView).apply{isAppearanceLightStatusBars=!dark;isAppearanceLightNavigationBars=!dark}
  }
  override fun onWebViewCreate(webView:WebView) {
    super.onWebViewCreate(webView)
    appWebView=webView
    if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
    WebViewCompat.addWebMessageListener(webView,"RHFilesNative",setOf("http://tauri.localhost","https://tauri.localhost")) {_,message,_,mainFrame,reply->
      if(mainFrame) {
        val request=try{JSONObject(message.data ?: "{}")}catch(_:Exception){null}
        if(request!=null) {
          val id=request.optInt("id");val command=request.optString("command");val args=request.optJSONObject("args") ?: JSONObject()
          val respond:(Any?,String?)->Unit={value,error->runOnUiThread {
            val response=JSONObject().put("id",id)
            if(error!=null) response.put("error",error) else response.put("result",value ?: JSONObject.NULL)
            try{reply.postMessage(response.toString())}catch(_:Exception){}
          }}
          val uiCommands=setOf("theme","settings","tree.pick","document.pick","usage.settings","shares","shares.clear")
          val work={try{if(command=="tree.pick" || command=="document.pick")pick(command=="tree.pick",respond) else respond(dispatch(command,args),null)}catch(e:Exception){respond(null,e.message ?: "系统操作失败")}}
          if(command in uiCommands) work() else io.execute(work)
        }
      }
    }
  }
  @Suppress("DEPRECATION") private fun pick(tree:Boolean,respond:(Any?,String?)->Unit) {
    require(picker==null){"已有存储选择器打开"};picker=respond
    val intent=Intent(if(tree) Intent.ACTION_OPEN_DOCUMENT_TREE else Intent.ACTION_OPEN_DOCUMENT).apply {
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      if(!tree) {type="*/*";addCategory(Intent.CATEGORY_OPENABLE);putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true)}
    }
    try{startActivityForResult(intent,if(tree) 101 else 102)}catch(e:Exception){picker=null;throw e}
  }
  @Deprecated("Android result bridge") override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?) {
    super.onActivityResult(requestCode,resultCode,data)
    if(requestCode !in listOf(101,102))return
    val callback=picker;picker=null
    if(resultCode!=RESULT_OK || data==null){callback?.invoke(null,null);return}
    try {
      val uris=mutableListOf<Uri>();data.data?.let{uris.add(it)};data.clipData?.let{c->for(i in 0 until c.itemCount)uris.add(c.getItemAt(i).uri)}
      for(uri in uris)try{contentResolver.takePersistableUriPermission(uri,data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION))}catch(_:SecurityException){}
      callback?.invoke(JSONArray(uris.map{if(requestCode==101) storage.document(it.toString()).toString() else it.toString()}),null)
    }catch(e:Exception){callback?.invoke(null,e.message)}
  }
  private fun shareUri(path:String):Uri = if(storage.isDocument(path)) storage.docUri(path) else {
    val f=storage.local(path);require(f.isFile && f.canRead()){"文件不可读取"};FileProvider.getUriForFile(this,"$packageName.fileprovider",f)
  }
  private fun dispatch(command:String,args:JSONObject):Any = when(command) {
    "capabilities" -> JSONObject().put("version",2)
    "theme" -> {setSystemTheme(args.optBoolean("dark"));true}
    "permission" -> if(Build.VERSION.SDK_INT>=30) Environment.isExternalStorageManager() else checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE)==PackageManager.PERMISSION_GRANTED
    "settings" -> {
      if(Build.VERSION.SDK_INT<30)requestPermissions(arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE,Manifest.permission.WRITE_EXTERNAL_STORAGE),10)
      else try{startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,Uri.parse("package:$packageName")))}catch(_:android.content.ActivityNotFoundException){startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))}
      true
    }
    "roots" -> storage.roots()
    "tree.forget" -> {
      val uri=storage.docUri(args.getString("path"));val tree=DocumentsContract.getTreeDocumentId(uri)
      contentResolver.persistedUriPermissions.filter{DocumentsContract.isTreeUri(it.uri) && it.uri.authority==uri.authority && DocumentsContract.getTreeDocumentId(it.uri)==tree}.forEach{
        contentResolver.releasePersistableUriPermission(it.uri,(if(it.isReadPermission)Intent.FLAG_GRANT_READ_URI_PERMISSION else 0) or (if(it.isWritePermission)Intent.FLAG_GRANT_WRITE_URI_PERMISSION else 0))
      };true
    }
    "list" -> {
      val path=args.getString("path");val entries=storage.list(path)
      JSONObject().put("path",path).put("entries",JSONArray(entries.map{it.json()})).put("truncated",entries.size>=50000)
    }
    "create" -> storage.create(args.getString("parent"),args.getString("name"),args.optBoolean("directory"))
    "rename" -> storage.rename(args.getString("path"),args.getString("name"))
    "connections" -> storage.remote.connections()
    "connection.save" -> storage.remote.save(args)
    "connection.delete" -> {storage.remote.remove(args.getString("id"));true}
    "open","share" -> {
      val paths=args.optJSONArray("paths") ?: JSONArray().put(args.getString("path"))
      require(paths.length() in 1..1000){"分享数量无效"}
      val uris=ArrayList<Uri>((0 until paths.length()).map{shareUri(paths.getString(it))})
      val share=command=="share"
      val mime=if(uris.size==1) contentResolver.getType(uris.first()) ?: "application/octet-stream" else "*/*"
      if(!share && mime=="application/vnd.android.package-archive" && Build.VERSION.SDK_INT>=26 && !packageManager.canRequestPackageInstalls()) {
        onUi{startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:$packageName")))}
        error("请允许 RHFiles 安装未知来源应用，再次点击 APK；安装仍需系统确认")
      }
      val intent=if(share) Intent(if(uris.size==1)Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply{
        type=mime;if(uris.size==1)putExtra(Intent.EXTRA_STREAM,uris.first()) else putParcelableArrayListExtra(Intent.EXTRA_STREAM,uris)
      } else Intent(Intent.ACTION_VIEW).setDataAndType(uris.first(),mime)
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      intent.clipData=ClipData.newRawUri("RHFiles",uris.first()).also{c->uris.drop(1).forEach{c.addItem(ClipData.Item(it))}}
      onUi{startActivity(Intent.createChooser(intent,if(share) "分享文件" else "打开方式"))};true
    }
    "shares" -> JSONArray(shared.toString())
    "shares.clear" -> {shared=JSONArray();true}
    "job.start" -> {
      if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
        onUi{requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),11)}
      FileTasks.start(this,args.getString("op"),args.getJSONObject("args"))
    }
    "jobs" -> FileTasks.list(this)
    "job.status" -> FileTasks.status(this,args.getString("id"))
    "job.control" -> {FileTasks.control(this,args.getString("id"),args.getString("action"));true}
    "archive.list" -> JSONArray(Archives.list(storage.local(args.getString("path"))).map{JSONObject().put("name",it.name).put("size",it.size).put("isDir",it.directory)})
    "text.read" -> {
      val result=SafeFiles.readText(storage.local(args.getString("path")))
      JSONObject().put("text",result.first).put("revision",result.second)
    }
    "text.save" -> {SafeFiles.saveText(storage.local(args.getString("path")),args.getString("text"),args.getString("revision"));true}
    "trash.list" -> Trash.list(this)
    "apps" -> apps()
    "app.action" -> {
      val pkg=args.getString("package");packageManager.getApplicationInfo(pkg,0)
      onUi {when(args.getString("action")) {
        "launch" -> startActivity(packageManager.getLaunchIntentForPackage(pkg) ?: error("此应用没有可启动界面"))
        "uninstall" -> startActivity(Intent(Intent.ACTION_DELETE,Uri.parse("package:$pkg")))
        "settings" -> startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$pkg")))
        else -> error("未知应用操作")
      }};true
    }
    "usage.settings" -> {startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));true}
    "media.library" -> media(args.getString("category"))
    else -> error("未知系统操作：$command")
  }
  @Suppress("DEPRECATION") private fun apps():JSONArray {
    val array=JSONArray();val ops=getSystemService(APP_OPS_SERVICE) as AppOpsManager
    val usage=ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,android.os.Process.myUid(),packageName)==AppOpsManager.MODE_ALLOWED
    packageManager.getInstalledApplications(0).forEach{app->
      val info=packageManager.getPackageInfo(app.packageName,0)
      val apkBytes=(listOf(app.sourceDir)+ (app.splitSourceDirs?.toList() ?: emptyList())).sumOf{File(it).length()}
      val item=JSONObject().put("package",app.packageName).put("name",app.loadLabel(packageManager).toString())
        .put("version",info.versionName ?: "").put("system",app.flags and ApplicationInfo.FLAG_SYSTEM != 0).put("apkBytes",apkBytes)
        .put("split",app.splitSourceDirs?.isNotEmpty()==true)
      if(usage && Build.VERSION.SDK_INT>=26)try{
        val stats=getSystemService(StorageStatsManager::class.java).queryStatsForPackage(StorageManager.UUID_DEFAULT,app.packageName,android.os.Process.myUserHandle())
        item.put("appBytes",stats.appBytes).put("dataBytes",stats.dataBytes).put("cacheBytes",stats.cacheBytes)
      }catch(_:Exception){}
      array.put(item)
    };return array
  }
  private fun media(category:String):JSONObject {
    require(category in listOf("image","video","audio"))
    val type=when(category){"image"->MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE;"audio"->MediaStore.Files.FileColumns.MEDIA_TYPE_AUDIO;else->MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO}
    val entries=JSONArray();var total=0;var bytes=0L
    contentResolver.query(MediaStore.Files.getContentUri("external"),arrayOf(MediaStore.MediaColumns.DATA,MediaStore.MediaColumns.DISPLAY_NAME,MediaStore.MediaColumns.SIZE,MediaStore.MediaColumns.DATE_MODIFIED),
      "${MediaStore.Files.FileColumns.MEDIA_TYPE}=?",arrayOf(type.toString()),"${MediaStore.MediaColumns.DATE_MODIFIED} DESC")?.use{cursor->
      while(cursor.moveToNext()){
        val path=cursor.getString(0) ?: continue;if(path.split('/').any{it.startsWith('.')})continue
        val size=cursor.getLong(2);total++;bytes+=size
        if(entries.length()<2000)entries.put(NativeEntry(path,cursor.getString(1),false,size,cursor.getLong(3)*1000).json())
      }
    };return JSONObject().put("entries",entries).put("total",total).put("totalBytes",bytes).put("truncated",total>2000)
  }
}
