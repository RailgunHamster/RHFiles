package com.railgunhamster.rhfiles

import android.Manifest
import android.app.usage.StorageStatsManager
import android.app.AppOpsManager
import android.content.ClipData
import android.content.Intent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.res.Configuration
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
import androidx.activity.OnBackPressedCallback
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/** Only the trusted main frame gets this bridge. I/O never runs on Android's UI thread. */
class MainActivity : TauriActivity() {
  private val io=Executors.newFixedThreadPool(3)
  private val mediaIo=Executors.newFixedThreadPool(2)
  private val storage by lazy {NativeStorage(applicationContext)}
  private val updates by lazy {AppUpdates.get(this)}
  private val thumbnailDelegate=lazy {MediaThumbnails(storage)}
  private val thumbnails by thumbnailDelegate
  private val appIcons by lazy {AppIcons(applicationContext)}
  private val remoteImages by lazy {RemoteImages(storage.remote)}
  private val adaptiveWindow by lazy {AdaptiveWindow(this){appWebView}}
  private val lanDiscovery by lazy {LanDiscovery(applicationContext)}
  private var pendingUpdateInstall:Boolean
    get()=getSharedPreferences("updates-v1",Context.MODE_PRIVATE).getBoolean("pendingInstall",false)
    set(value){getSharedPreferences("updates-v1",Context.MODE_PRIVATE).edit().putBoolean("pendingInstall",value).commit()}
  private var picker:((Any?,String?)->Unit)?=null
  private var scanResult:((Any?,String?)->Unit)?=null
  private var shared=JSONArray()
  private var appWebView:WebView?=null
  private var restoreNavigation=false
  private val paneTouch=PaneTouchRelay()
  private val settingsLock=Any()
  private val sharedConfig by lazy {ConfigSync(applicationContext,storage.remote,settingsLock)}
  private val backup by lazy {SettingsBackup(applicationContext,storage.remote){updates.validateBackup(it)}}
  private val backupUi by lazy {SettingsBackupUi(this,io,backup,{updates.config()}){payload,currentWeb->synchronized(settingsLock){
    UsageAnalysis.requireConnectionsIdle()
    val jobs=FileTasks.list(this);require((0 until jobs.length()).none{jobs.getJSONObject(it).optString("state") in listOf("queued","scanning","running","paused")}){"请先结束当前文件任务再导入配置"}
    sharedConfig.invalidate()
    updates.restoreSettings{val result=backup.apply(payload,currentWeb);RemoteStorage.discardReadSessions();result}
  }}}
  private var watching=false
  private val mainHandler=Handler(Looper.getMainLooper())
  private val changed=Runnable {appWebView?.evaluateJavascript("window.dispatchEvent(new Event('rhfiles-storage-changed'))",null)}
  private fun locationsChanged(){mainHandler.post{appWebView?.evaluateJavascript("window.dispatchEvent(new Event('rhfiles-locations-changed'))",null)}}
  private val storageReceiver=object:BroadcastReceiver(){override fun onReceive(context:Context?,intent:Intent?){mainHandler.removeCallbacks(changed);mainHandler.postDelayed(changed,400)}}
  private val mediaObserver=object:android.database.ContentObserver(mainHandler){override fun onChange(selfChange:Boolean){mainHandler.removeCallbacks(changed);mainHandler.postDelayed(changed,800)}}
  private val backNavigation by lazy {
    AppBackNavigation({ script, reply ->
      val webView=appWebView
      if(webView==null) reply("true") else webView.evaluateJavascript(script) { result -> reply(result) }
    }, { moveTaskToBack(true) })
  }
  override fun onCreate(savedInstanceState:Bundle?) {
    restoreNavigation=savedInstanceState?.getBoolean("rhfilesRestoreNavigation",false)==true
    super.onCreate(savedInstanceState)
    backup.recover()
    sharedConfig.recover()
    onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){
      override fun handleOnBackPressed(){backNavigation.back()}
    })
    NativeAutomation.install(this);NativeAutomation.debugging(this)
    setSystemTheme(false);receive(intent)
    val filter=IntentFilter().apply{addAction(Intent.ACTION_MEDIA_MOUNTED);addAction(Intent.ACTION_MEDIA_UNMOUNTED);addAction(Intent.ACTION_MEDIA_REMOVED);addAction(Intent.ACTION_MEDIA_BAD_REMOVAL);addDataScheme("file")}
    if(Build.VERSION.SDK_INT>=33)registerReceiver(storageReceiver,filter,Context.RECEIVER_NOT_EXPORTED)else registerReceiver(storageReceiver,filter)
    watching=true
    try{contentResolver.registerContentObserver(MediaStore.Files.getContentUri("external"),true,mediaObserver)}catch(_:Exception){}
  }
  override fun onDestroy(){if(watching)unregisterReceiver(storageReceiver);contentResolver.unregisterContentObserver(mediaObserver);mainHandler.removeCallbacks(changed);if(thumbnailDelegate.isInitialized())thumbnails.close();RemoteStorage.discardReadSessions();sharedConfig.close();lanDiscovery.close();io.shutdown();mediaIo.shutdown();appWebView=null;super.onDestroy()}
  override fun onSaveInstanceState(outState:Bundle){outState.putBoolean("rhfilesRestoreNavigation",true);super.onSaveInstanceState(outState)}
  override fun onStart(){super.onStart();adaptiveWindow.start()}
  override fun onStop(){adaptiveWindow.stop();super.onStop()}
  override fun onConfigurationChanged(newConfig:Configuration){
    super.onConfigurationChanged(newConfig)
    appWebView?.post{adaptiveWindow.publish()}
  }
  override fun onNewIntent(intent:Intent) {super.onNewIntent(intent);setIntent(intent);receive(intent);mainHandler.post(changed)}
  override fun onResume() {
    super.onResume()
    if(pendingUpdateInstall && (Build.VERSION.SDK_INT<26 || packageManager.canRequestPackageInstalls())) {
      pendingUpdateInstall=false
      mainHandler.post {if(!io.isShutdown)io.execute {try{installUpdate()}catch(e:Exception){runOnUiThread{android.widget.Toast.makeText(this,e.message ?: "安装更新失败",android.widget.Toast.LENGTH_LONG).show()}}}}
    }
  }
  private fun installUpdate():String = try {
    val file=updates.installFile()
    onUi {
      if(Build.VERSION.SDK_INT>=26 && !packageManager.canRequestPackageInstalls()) {
        pendingUpdateInstall=true
        try{startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:$packageName")))}catch(e:Exception){pendingUpdateInstall=false;throw e}
        "permission"
      } else {
        pendingUpdateInstall=false
        val uri=FileProvider.getUriForFile(this,"$packageName.fileprovider",file)
        startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply {clipData=ClipData.newRawUri("RHFiles 更新",uri)})
        "installer"
      }
    }
  }catch(e:Exception){updates.installationFailed(e);throw e}
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
    val color=if(dark) Color.rgb(23,29,41) else Color.rgb(244,247,252)
    window.statusBarColor=color;window.navigationBarColor=color
    WindowCompat.getInsetsController(window,window.decorView).apply{isAppearanceLightStatusBars=!dark;isAppearanceLightNavigationBars=!dark}
  }
  override fun onWebViewCreate(webView:WebView) {
    super.onWebViewCreate(webView)
    appWebView=webView
    webView.setOnTouchListener{_,event->paneTouch.sample(event,webView.width,webView.height)?.let{webView.evaluateJavascript("window.RHFilesWorkbench?.touch($it)",null)};false}
    // Honor the responsive viewport instead of WebView's fixed layout width.
    webView.settings.useWideViewPort=true
    webView.addOnLayoutChangeListener{_,_,_,_,_,_,_,_,_->adaptiveWindow.publish()}
    ViewCompat.setOnApplyWindowInsetsListener(webView){_,insets->webView.post{if(appWebView===webView)adaptiveWindow.publish(insets)};insets}
    ViewCompat.setWindowInsetsAnimationCallback(webView,object:androidx.core.view.WindowInsetsAnimationCompat.Callback(androidx.core.view.WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE){
      override fun onProgress(insets:androidx.core.view.WindowInsetsCompat,running:MutableList<androidx.core.view.WindowInsetsAnimationCompat>):androidx.core.view.WindowInsetsCompat {if(appWebView===webView)adaptiveWindow.publish(insets);return insets}
    })
    if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
    WebViewCompat.addWebMessageListener(webView,"RHFilesNative",setOf("http://tauri.localhost","https://tauri.localhost")) {sourceView,message,_,mainFrame,reply->
      if(mainFrame && appWebView===sourceView && !io.isShutdown) {
        val request=try{JSONObject(message.data ?: "{}")}catch(_:Exception){null}
        if(request!=null) {
          val id=request.optInt("id");val command=request.optString("command");val args=request.optJSONObject("args") ?: JSONObject()
          val respond:(Any?,String?)->Unit={value,error->runOnUiThread {
            val response=JSONObject().put("id",id)
            if(error!=null) response.put("error",error) else response.put("result",value ?: JSONObject.NULL)
            try{reply.postMessage(response.toString())}catch(_:Exception){}
          }}
          val uiCommands=setOf("theme","settings","tree.pick","document.pick","usage.settings","shares","shares.clear","panes.touch","config.export.pick","config.import.pick","connection.scan")
          val work={try{if(command=="connection.scan"){require(scanResult==null){"扫码窗口已打开"};scanResult=respond;try{startActivityForResult(Intent(this@MainActivity,PairingScanActivity::class.java),103)}catch(e:Exception){scanResult=null;throw e}}else if(command in listOf("config.export.pick","config.import.pick")){require(picker==null){"已有系统选择器打开"};backupUi.begin(command=="config.export.pick",args.optJSONObject("web")?:JSONObject(),respond)}else if(command=="tree.pick" || command=="document.pick")pick(command=="tree.pick",respond) else respond(dispatch(command,args),null)}catch(e:Exception){respond(null,e.message ?: "系统操作失败")}}
          if(command in uiCommands) work() else if(command in setOf("media.thumbnail","media.image","app.icon"))mediaIo.execute(work) else io.execute(work)
        }
      }
    }
  }
  @Suppress("DEPRECATION") private fun pick(tree:Boolean,respond:(Any?,String?)->Unit) {
    require(picker==null&&!backupUi.busy){"已有系统选择器打开"};picker=respond
    val intent=Intent(if(tree) Intent.ACTION_OPEN_DOCUMENT_TREE else Intent.ACTION_OPEN_DOCUMENT).apply {
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      if(!tree) {type="*/*";addCategory(Intent.CATEGORY_OPENABLE);putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true)}
    }
    try{startActivityForResult(intent,if(tree) 101 else 102)}catch(e:Exception){picker=null;throw e}
  }
  @Deprecated("Android result bridge") override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?) {
    super.onActivityResult(requestCode,resultCode,data)
    if(requestCode==103){val callback=scanResult;scanResult=null;try{callback?.invoke(if(resultCode==RESULT_OK)PairingData.describe(data?.getStringExtra("uri")?:"")else JSONObject.NULL,null)}catch(e:Exception){callback?.invoke(null,e.message)};return}
    if(backupUi.result(requestCode,resultCode,data))return
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
    "automation.status" -> onUi{NativeAutomation.status(this)}
    "automation.enable" -> onUi{NativeAutomation.setEnabled(this,args.getBoolean("enabled"))}
    "automation.ui.list","automation.ui.invoke","automation.ui.set","automation.ui.scroll","automation.back","automation.media.state","automation.media.control" -> onUi{NativeAutomation.dispatch(this,command,args)}
    "nearby.keepAlive"->{onUi{
      val intent=Intent(this,NearbyService::class.java)
      if(args.optBoolean("enabled")){
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),11)
        androidx.core.content.ContextCompat.startForegroundService(this,intent)
      }else stopService(intent)
      true
    }}
    "capabilities" -> JSONObject().put("version",3).put("automation",true).put("nativeBack",true).put("appUpdates",true).put("nativePlayback",true).put("nativeThumbnails",true).put("adaptiveLayout",true).put("restoreNavigation",restoreNavigation).put("nativeEbooks",true).put("dualPane",true).put("nearby",true).put("paneTouch",true).put("configBackup",true).put("configSync",true).put("storageAnalysis",true)
    "analysis.start" -> synchronized(settingsLock){require(!sharedConfig.isApplying()){"正在应用同步配置，请稍后再分析"};UsageAnalysis.get(this).start(args.getString("root"),args.optString("owner","first"))}
    "analysis.latest" -> UsageAnalysis.get(this).latest(args.optString("owner","first"),args.getString("root"))
    "analysis.status" -> UsageAnalysis.get(this).status(args.getString("id"))
    "analysis.page" -> UsageAnalysis.get(this).page(args)
    "analysis.cancel" -> UsageAnalysis.get(this).cancel(args.getString("id"))
    "sync.status" -> sharedConfig.status()
    "sync.save" -> sharedConfig.save(args).also{mainHandler.post{appWebView?.evaluateJavascript("window.dispatchEvent(new Event('rhfiles-sync-changed'))",null)}}
    "sync.run" -> {require(backup.pending()==null){"请先完成配置导入"};sharedConfig.run(args.getJSONObject("web"),args.optBoolean("manual"),args.optString("token"),args.optString("choice"))}
    "sync.apply" -> synchronized(settingsLock){
      UsageAnalysis.requireConnectionsIdle()
      val jobs=FileTasks.list(this);require((0 until jobs.length()).none{jobs.getJSONObject(it).optString("state") in listOf("queued","scanning","running","paused")}){"请先结束文件任务，再应用同步配置"}
      sharedConfig.apply(args.getString("id"),args.getJSONObject("web")).also{locationsChanged()}
    }
    "sync.ack" -> sharedConfig.acknowledge(args.getString("id"))
    "sync.rollback" -> sharedConfig.recover()?:JSONObject.NULL
    "sync.rollbackWeb" -> sharedConfig.rollbackWeb()?:JSONObject.NULL
    "sync.rollbackAck" -> {sharedConfig.clearRollback();true}
    "panes.touch" -> {paneTouch.enabled=args.optBoolean("enabled");true}
    "config.pending" -> backup.pending() ?: JSONObject.NULL
    "config.ack" -> {backup.acknowledge(args.getString("id"));true}
    "config.rollback" -> synchronized(settingsLock){updates.restoreSettings{backup.recover()};true}
    "ebook.open" -> {
      val path=args.getString("path");require(!storage.isRemote(path)){"网络电子书请先下载到本机"}
      if(storage.isDocument(path))storage.docUri(path)else require(storage.local(path).let{it.isFile&&it.canRead()}){"电子书不存在或无法读取"}
      require(EbookSource.supported(args.getString("name"))){"不支持的电子书格式"}
      onUi{startActivity(Intent(this,EbookActivity::class.java).putExtra("path",path).putExtra("name",args.getString("name")).putExtra("theme",args.optString("theme","light")));true}
    }
    "media.thumbnail" -> thumbnails.read(args.getString("path"),args.optInt("maxEdge",160))
    "media.image" -> remoteImages.read(args.getString("path"),args.optInt("maxEdge",1920))
    "image.wallpaper" -> {
      val uri=ImageWallpaper.prepare(this,storage,args.getString("path"))
      onUi{try{startActivity(ImageWallpaper.intent(this,uri))}catch(_:android.content.ActivityNotFoundException){error("当前系统没有可用的壁纸设置界面，请用系统图库设置")};true}
    }
    "window.layout" -> onUi{adaptiveWindow.current()}
    "media.play" -> {
      val path=args.getString("path")
      if(storage.isRemote(path))require(!storage.remote.stat(path).isDir){"不是媒体文件"}
      else if(storage.isDocument(path))storage.docUri(path)else require(storage.local(path).let{it.isFile && it.canRead()}){"媒体文件不存在或无法读取"}
      val queue=PlaybackQueue.parse(args).filter{item->try{if(storage.isDocument(item.path))storage.docUri(item.path)else if(!storage.isRemote(item.path))storage.local(item.path);true}catch(_:Exception){false}}
      onUi{startActivity(Intent(this,PlaybackActivity::class.java).putExtra("path",path).putExtra("name",args.optString("name")).putExtra("kind",args.optString("kind","video")).putExtra("queue",PlaybackQueue.json(queue)))};true
    }
    "update.status" -> updates.status()
    "update.save" -> synchronized(settingsLock){updates.save(args)}
    "update.check" -> updates.check(args.optBoolean("manual"),args.optString("reason","manual"))
    "update.download" -> onUi{updates.download()}
    "update.cancel" -> updates.cancel()
    "update.install" -> installUpdate()
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
    "app.icon" -> appIcons.read(args.getString("package"),args.optInt("maxEdge",64))
    "connection.get" -> storage.remote.editable(args.getString("id"))
    "lan.start" -> lanDiscovery.start(args.optString("protocol","smb"))
    "connection.describe" -> PairingData.describe(args.getString("uri"))
    "connection.compose" -> PairingData.compose(args.getString("url"),args.getString("fingerprint"),args.getString("code"),args.optBoolean("verified"))
    "lan.state" -> lanDiscovery.state(args.getString("id"))
    "lan.stop" -> {lanDiscovery.stop(args.getString("id"));true}
    "ftp.status" -> FtpAccess.status()
    "ftp.start" -> {
      if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)onUi{requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),11)}
      FtpAccess.start(applicationContext,args)
    }
    "ftp.stop" -> FtpAccess.stop()
    "connection.save" -> synchronized(settingsLock){require(!sharedConfig.busy){"请等待配置同步完成"};if(args.optString("id").isNotBlank()){UsageAnalysis.requireConnectionsIdle(args.getString("id"));RemoteStorage.requireIdle(FileTasks.list(this),args.getString("id"))};storage.remote.save(args).also{locationsChanged()}}
    "connection.pair" -> synchronized(settingsLock){require(!sharedConfig.busy){"请等待配置同步完成"};storage.remote.save(RhFilesConnection.pair(args.getString("uri"),args.getString("name"))).also{locationsChanged()}}
    "connection.delete" -> synchronized(settingsLock){require(!sharedConfig.busy){"请等待配置同步完成"};UsageAnalysis.requireConnectionsIdle(args.getString("id"));RemoteStorage.requireIdle(FileTasks.list(this),args.getString("id"));storage.remote.remove(args.getString("id"));locationsChanged();true}
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
      synchronized(settingsLock){require(!sharedConfig.isApplying()){"正在应用同步配置，请稍后再启动文件任务"};FileTasks.start(this,args.getString("op"),args.getJSONObject("args"))}
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
    "media.library" -> media(args)
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
        .put("split",app.splitSourceDirs?.isNotEmpty()==true).put("updatedMs",info.lastUpdateTime)
      if(usage && Build.VERSION.SDK_INT>=26)try{
        val stats=getSystemService(StorageStatsManager::class.java).queryStatsForPackage(StorageManager.UUID_DEFAULT,app.packageName,android.os.Process.myUserHandle())
        item.put("appBytes",stats.appBytes).put("dataBytes",stats.dataBytes).put("cacheBytes",stats.cacheBytes)
      }catch(_:Exception){}
      array.put(item)
    };return array
  }
  private fun media(args:JSONObject):JSONObject {
    val category=args.getString("category");val folder=args.optString("folder");val albums=args.optBoolean("albums");val groups=linkedMapOf<String,JSONObject>()
    require(category in listOf("image","video","audio"))
    val type=when(category){"image"->MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE;"audio"->MediaStore.Files.FileColumns.MEDIA_TYPE_AUDIO;else->MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO}
    val entries=JSONArray();var total=0;var bytes=0L
    contentResolver.query(MediaStore.Files.getContentUri("external"),arrayOf(MediaStore.MediaColumns.DATA,MediaStore.MediaColumns.DISPLAY_NAME,MediaStore.MediaColumns.SIZE,MediaStore.MediaColumns.DATE_MODIFIED),
      "${MediaStore.Files.FileColumns.MEDIA_TYPE}=?",arrayOf(type.toString()),"${MediaStore.MediaColumns.DATE_MODIFIED} DESC")?.use{cursor->
      while(cursor.moveToNext()){
        val path=cursor.getString(0) ?: continue;if(!args.optBoolean("showHidden")&&path.split('/').any{it.startsWith('.')})continue
        val parent=File(path).parent?:continue;if(folder.isNotBlank()&&parent!=folder)continue
        val size=cursor.getLong(2);total++;bytes+=size
        val entry=NativeEntry(path,cursor.getString(1),false,size,cursor.getLong(3)*1000).json()
        if(albums){val group=groups[parent];if(group!=null){group.put("count",group.getInt("count")+1);group.put("size",group.getLong("size")+size)}else groups[parent]=NativeEntry(parent,File(parent).name,true,size,cursor.getLong(3)*1000).json().put("libraryAlbum",true).put("count",1).put("cover",entry)}
        else if(entries.length()<2000)entries.put(entry)
      }
    };val result=if(albums)JSONArray(groups.values.take(2000))else entries
    return JSONObject().put("entries",result).put("total",if(albums)groups.size else total).put("totalBytes",bytes).put("truncated",if(albums)groups.size>2000 else total>2000)
  }
}
