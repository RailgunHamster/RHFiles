package com.railgunhamster.rhfiles

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.net.InetSocketAddress
import java.net.Proxy
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import com.railgunhamster.rhfiles.SafeFiles.readBytesBounded

internal const val UPDATE_FEED = "releases.android.json"
internal const val MAX_APK_BYTES = 1024L * 1024 * 1024
internal const val APP_PACKAGE = "com.railgunhamster.rhfiles"

internal data class AndroidRelease(val version: String, val code: Long, val notes: String,
  val abi: String, val fileName: String, val size: Long, val sha256: String, val location: String) {
  fun json() = JSONObject().put("version",version).put("versionCode",code).put("notes",notes)
    .put("abi",abi).put("fileName",fileName).put("size",size).put("sha256",sha256).put("location",location)
}

/** Android feeds are deliberately unrelated to Velopack/desktop versions. */
internal object AndroidUpdateFeed {
  fun fileName(value: String): String {
    require(value.isNotBlank() && value.length<=180 && value !in listOf(".","..") && value.none { it in "/\\:\u0000" || it.isISOControl() }) { "更新包文件名无效" }
    return value
  }
  fun githubRepository(value: String): String {
    val url=value.trim().trimEnd('/').toHttpUrl()
    require(url.isHttps && url.host=="github.com" && url.username.isEmpty() && url.password.isEmpty() && url.query==null && url.fragment==null) { "请填写 https://github.com/所有者/仓库" }
    val parts=url.pathSegments.filter{it.isNotEmpty()}
    require(parts.size==2 && parts.all{it.matches(Regex("[A-Za-z0-9_.-]+"))}) { "请填写 GitHub 仓库地址，不要填写发行页或安装包地址" }
    return parts[0]+"/"+parts[1].removeSuffix(".git")
  }
  fun select(json: String, abis: List<String>, sdk: Int, installed: Long, resolve: (String)->String): AndroidRelease? {
    require(json.toByteArray().size<=2*1024*1024) { "更新清单过大" }
    val doc=JSONObject(json)
    require(doc.getInt("schemaVersion")==1 && doc.getString("packageId")==APP_PACKAGE) { "不是受支持的 RHFiles Android 更新清单" }
    val releases=doc.getJSONArray("releases");require(releases.length()<=500) { "更新清单条目过多" }
    val candidates=mutableListOf<AndroidRelease>()
    for(i in 0 until releases.length()) {
      val r=releases.getJSONObject(i);val code=r.getLong("versionCode")
      if(code<=installed || r.optInt("minSdk",24)>sdk)continue
      val assets=r.getJSONArray("assets")
      val eligible=(0 until assets.length()).map{assets.getJSONObject(it)}.filter{it.optString("abi") in abis || it.optString("abi")=="universal"}
      val asset=eligible.minByOrNull { val index=abis.indexOf(it.optString("abi"));if(index<0)1000 else index } ?: continue
      val name=fileName(asset.getString("fileName"));require(name.endsWith(".apk",true)) { "Android 更新包必须是 APK" }
      val size=asset.getLong("size");require(size in 1..MAX_APK_BYTES) { "APK 大小无效" }
      val sha=asset.getString("sha256").lowercase();require(sha.matches(Regex("[0-9a-f]{64}"))) { "缺少 APK 的 SHA-256 校验值" }
      val version=r.getString("version");require(version.isNotBlank() && version.length<=80) { "版本号无效" }
      candidates.add(AndroidRelease(version,code,r.optString("notes").take(100000),asset.getString("abi"),name,size,sha,name))
    }
    // A cumulative feed may mention older APKs not attached to this GitHub
    // release. Only resolve the selected candidate, never every historical APK.
    return candidates.maxByOrNull{it.code}?.let{it.copy(location=resolve(it.fileName))}
  }
  fun copy(input: InputStream, output: File, expected: AndroidRelease, canceled: ()->Boolean, progress: (Long)->Unit) {
    val digest=MessageDigest.getInstance("SHA-256");var bytes=0L
    try {
      FileOutputStream(output).use { sink ->
        val buffer=ByteArray(128*1024)
        while(true) {
          check(!canceled()) { "下载已取消" }
          val n=input.read(buffer);if(n<0)break
          bytes+=n;require(bytes<=expected.size) { "APK 大小超出更新清单，已拒绝安装" }
          sink.write(buffer,0,n);digest.update(buffer,0,n);progress(bytes)
        }
        sink.fd.sync()
      }
      require(bytes==expected.size) { "APK 下载不完整：$bytes / ${expected.size} 字节" }
      require(digest.digest().joinToString(""){"%02x".format(it)}==expected.sha256) { "APK SHA-256 校验失败，已拒绝安装" }
    } catch(e:Exception) { output.delete();throw e }
  }
}

/** One process-wide worker. Downloads survive Activity recreation, never block WebView/UI. */
class AppUpdates private constructor(private val context: Context) {
  companion object {
    @Volatile private var instance: AppUpdates?=null
    fun get(context: Context): AppUpdates = instance ?: synchronized(this) { instance ?: AppUpdates(context.applicationContext).also{instance=it} }
  }
  private val prefs=context.getSharedPreferences("updates-v1",Context.MODE_PRIVATE)
  private val remote=RemoteStorage(context)
  private val worker=Executors.newSingleThreadExecutor()
  private val directory=File(context.filesDir,"updates").apply{mkdirs()}
  private val apk=File(directory,"update.apk")
  private val receipt=File(directory,"ready.json")
  private var available: AndroidRelease?=null
  private var state="idle"
  private var message=""
  private var bytes=0L
  private var started=0L
  private var lastCheck=0L
  @Volatile private var canceled=false
  @Volatile private var call: Call?=null
  @Volatile var service: AppUpdateService?=null
  init {
    // A killed process never offers a partial APK as installable.
    File(directory,"download.part").delete()
    try {
      val r=JSONObject(receipt.readText());val release=AndroidRelease(r.getString("version"),r.getLong("versionCode"),r.optString("notes"),r.getString("abi"),r.getString("fileName"),r.getLong("size"),r.getString("sha256"),r.getString("location"))
      if(release.code>installedCode() && apk.length()==release.size) {available=release;state="ready"}
      else {receipt.delete();apk.delete()}
    }catch(_:Exception){receipt.delete();apk.delete()}
  }
  @Suppress("DEPRECATION") private fun installedCode(): Long {
    val info=context.packageManager.getPackageInfo(context.packageName,0)
    return if(Build.VERSION.SDK_INT>=28)info.longVersionCode else info.versionCode.toLong()
  }
  @Synchronized fun config(): JSONObject = JSONObject()
    .put("source",prefs.getString("source","github"))
    .put("github",prefs.getString("github","https://github.com/RailgunHamster/RHFiles"))
    .put("family",prefs.getString("family","\\\\SERVER-HOME\\Public\\Software\\RHFiles-Releases"))
    .put("connectionId",prefs.getString("connectionId",""))
    .put("autoCheck",prefs.getBoolean("autoCheck",true))
    .put("proxyEnabled",prefs.getBoolean("proxyEnabled",false)).put("proxy",prefs.getString("proxy",""))
  @Synchronized fun save(value: JSONObject): JSONObject {
    require(state !in listOf("checking","downloading","verifying")) { "请等待当前更新任务结束或取消后再修改配置" }
    require(value.getString("source") in listOf("github","family")) { "更新源无效" }
    AndroidUpdateFeed.githubRepository(value.getString("github"))
    val inline=value.getString("source")=="family"&&(value.optString("smbUsername").isNotBlank()||value.optString("smbPassword").isNotEmpty())
    familyInput(value.getString("family"),if(inline)"" else value.optString("connectionId"),UPDATE_FEED,false)
    proxy(value)
    if(inline){val unc=RemoteStorage.parseUnc(value.getString("family"));SmbHosts.credentials(value.optString("smbUsername"),value.optString("smbDomain"))
      value.put("connectionId",remote.save(JSONObject().put("type","smb").put("name","更新 · "+unc.host).put("host",unc.host).put("share",unc.share).put("port",445)
        .put("username",value.optString("smbUsername")).put("password",value.optString("smbPassword")).put("domain",value.optString("smbDomain"))))}
    val editor=prefs.edit()
    for(key in listOf("source","github","family","connectionId","proxy"))editor.putString(key,value.optString(key).trim())
    editor.putBoolean("autoCheck",value.optBoolean("autoCheck",true)).putBoolean("proxyEnabled",value.optBoolean("proxyEnabled")).putBoolean("pendingInstall",false)
    require(editor.commit()) { "更新配置保存失败" }
    available=null;state="idle";message="";lastCheck=0;receipt.delete();apk.delete()
    return status()
  }
  @Synchronized fun status(): JSONObject = JSONObject().put("state",state).put("message",message).put("bytes",bytes)
    .put("started",started).put("lastCheck",lastCheck).put("currentCode",installedCode())
    .put("release",available?.json() ?: JSONObject.NULL).put("config",config())
  @Synchronized fun check(manual: Boolean, reason: String): JSONObject {
    val config=config()
    if(!manual && !config.getBoolean("autoCheck"))return status()
    if(state in listOf("checking","downloading","verifying","ready"))return status()
    if(!manual && lastCheck>0 && System.currentTimeMillis()-lastCheck<(if(reason=="hour")3600000 else 10000))return status()
    state="checking";message="";lastCheck=System.currentTimeMillis();available=null;canceled=false
    worker.execute {
      try {
        val r=loadFeed(config)
        synchronized(this) {check(!canceled){"检查已取消"};available=r;state=if(r==null)"latest" else "available"}
      }catch(e:Exception){failed(e)}
    }
    return status()
  }
  private fun proxy(config: JSONObject): Proxy? {
    if(!config.optBoolean("proxyEnabled"))return null
    val value=config.optString("proxy").trim();val url=(if("://" in value)value else "http://$value").toHttpUrl()
    require(url.scheme=="http" && url.username.isEmpty() && url.password.isEmpty() && url.encodedPath=="/" && url.query==null && url.fragment==null) { "代理请填写 HTTP 代理地址，例如 http://192.168.0.10:7890" }
    return Proxy(Proxy.Type.HTTP,InetSocketAddress(url.host,url.port))
  }
  private fun http(config: JSONObject, metadata: Boolean)=OkHttpClient.Builder()
    .connectTimeout(10,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS)
    .callTimeout(if(metadata)45 else 1800,TimeUnit.SECONDS).proxy(proxy(config)).build()
  private fun request(config: JSONObject, url: String, metadata: Boolean): Response {
    val target=url.toHttpUrl();require(target.username.isEmpty() && target.password.isEmpty()) { "更新地址不能包含用户名或密码" }
    val client=http(config,metadata).newBuilder().addNetworkInterceptor { chain ->
      require(!target.isHttps || chain.request().url.isHttps) { "拒绝将 HTTPS 更新降级到 HTTP" };chain.proceed(chain.request())
    }.build()
    val c=client.newCall(Request.Builder().url(target).header("Accept",if(metadata)"application/json" else "application/octet-stream")
      .header("User-Agent","RHFiles-Android").header("Cache-Control","no-cache").build());call=c
    val response=c.execute()
    if(!response.isSuccessful){response.close();error(if(response.code==404)"服务器没有 Android 更新清单或安装包（HTTP 404）" else "更新服务器返回 HTTP ${response.code}")}
    return response
  }
  // Ownership belongs to the surrounding response/stream.use. SMB sessions
  // cannot be closed twice; a successful read must not become a close error.
  private fun readJson(input: InputStream): String = input.readBytesBounded(2*1024*1024).toString(Charsets.UTF_8)
  private fun loadFeed(config: JSONObject): AndroidRelease? {
    if(config.getString("source")=="github") {
      val repository=AndroidUpdateFeed.githubRepository(config.getString("github"))
      // Don't use /releases/latest: a newer Windows-only release is not an Android update.
      val releases=JSONArray(request(config,"https://api.github.com/repos/$repository/releases?per_page=100",true).use{readJson(it.body!!.byteStream())})
      for(i in 0 until releases.length()) {
        val release=releases.getJSONObject(i);if(release.optBoolean("draft") || release.optBoolean("prerelease"))continue
        val assets=release.getJSONArray("assets")
        val byName=(0 until assets.length()).map{assets.getJSONObject(it)}.associateBy{it.getString("name")}
        val feed=byName[UPDATE_FEED] ?: continue
        fun location(asset: JSONObject): String {
          val url=asset.getString("browser_download_url").toHttpUrl()
          require(url.isHttps && url.host=="github.com" && url.encodedPath.startsWith("/$repository/releases/download/")) { "GitHub 更新资源地址无效" }
          return url.toString()
        }
        val text=request(config,location(feed),true).use{readJson(it.body!!.byteStream())}
        return AndroidUpdateFeed.select(text,Build.SUPPORTED_ABIS.toList(),Build.VERSION.SDK_INT,installedCode()) {name -> location(byName[name] ?: error("GitHub 发行中缺少 $name"))}
      }
      error("GitHub 最近 100 个正式发行中没有 Android 更新清单；请检查仓库或改用家庭服务器")
    }
    val root=config.getString("family");val connection=config.optString("connectionId")
    val text=familyInput(root,connection,UPDATE_FEED,true,config)!!.use{readJson(it)}
    return AndroidUpdateFeed.select(text,Build.SUPPORTED_ABIS.toList(),Build.VERSION.SDK_INT,installedCode()) {name -> name}
  }
  private fun familyInput(root: String, connection: String, name: String, open: Boolean, config: JSONObject?=null): InputStream? {
    AndroidUpdateFeed.fileName(name)
    if(root.startsWith("http://") || root.startsWith("https://")) {
      val base=root.trimEnd('/').toHttpUrl();require(base.username.isEmpty() && base.password.isEmpty() && base.query==null && base.fragment==null) { "家庭服务器请填写目录，不要包含密码或查询参数" }
      return if(open)request(config!!,base.newBuilder().addPathSegment(name).build().toString(),name==UPDATE_FEED).body!!.byteStream() else null
    }
    val unc=RemoteStorage.parseUnc(root)
    val path=unc.parts.plus(name).joinToString("/"){android.net.Uri.encode(it)}
    if(connection.isNotBlank()) {
      remote.requireSmbConnection(connection,unc.host,unc.share)
      return if(open)remote.input("remote://$connection/$path") else null
    }
    val store=RemoteStorage(context) {JSONObject().put("type","smb").put("host",unc.host).put("share",unc.share)}
    return if(open)store.input("remote://update/$path") else null
  }
  @Synchronized fun download(): JSONObject {
    require(state=="available" || state in listOf("failed","canceled") && available!=null) { "请先检查并选择新版本" }
    require(available!!.code>installedCode()) { "该版本已经安装" }
    state="downloading";message="";bytes=0;started=System.currentTimeMillis();canceled=false
    try {ContextCompat.startForegroundService(context,Intent(context,AppUpdateService::class.java))}
    catch(e:Exception){failed(e);throw e}
    return status()
  }
  @Synchronized fun runDownload() {
    if(state!="downloading") {service?.done();return}
    val release=available!!;val config=config()
    // Service may receive another start before the worker starts; only enqueue once.
    state="verifying"
    worker.execute {
      val partial=File(directory,"download.part")
      try {
        synchronized(this){state="downloading"}
        require(directory.usableSpace>release.size+16*1024*1024) { "手机可用空间不足，无法下载 APK" }
        val input=if(config.getString("source")=="github") request(config,release.location,false).body!!.byteStream()
          else familyInput(config.getString("family"),config.optString("connectionId"),release.fileName,true,config)!!
        var notified=0L
        input.use {AndroidUpdateFeed.copy(it,partial,release,{canceled}) {n -> synchronized(this){bytes=n}
          if(System.currentTimeMillis()-notified>750){notified=System.currentTimeMillis();service?.progress("下载更新 ${n*100/release.size}% · $n / ${release.size} 字节")}
        }}
        synchronized(this){check(!canceled){"下载已取消"};state="verifying"}
        verifyApk(partial,release)
        synchronized(this){
          check(!canceled){"下载已取消"}
          apk.delete();require(partial.renameTo(apk)){"无法保存已校验的 APK"}
          receipt.writeText(release.json().toString());state="ready"
        }
      }catch(e:Exception){partial.delete();failed(e)}finally{call=null;service?.done()}
    }
  }
  @Synchronized fun cancel(): JSONObject {canceled=true;call?.cancel();return status()}
  @Synchronized private fun failed(e:Exception) {state=if(canceled)"canceled" else "failed";message=updateFailure(e)}
  @Suppress("DEPRECATION") internal fun verifyApk(file: File, release: AndroidRelease) {
    require(file.isFile && file.length()==release.size) { "已下载的 APK 不完整，请重新下载" }
    val hash=file.inputStream().use {input->val md=MessageDigest.getInstance("SHA-256");val buffer=ByteArray(128*1024);while(true){val n=input.read(buffer);if(n<0)break;md.update(buffer,0,n)};md.digest().joinToString(""){"%02x".format(it)}}
    require(hash==release.sha256) { "APK 校验失败，请重新下载" }
    val pm=context.packageManager
    val flags=if(Build.VERSION.SDK_INT>=28)PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
    val candidate=pm.getPackageArchiveInfo(file.path,flags) ?: error("APK 无法解析或签名损坏")
    val current=pm.getPackageInfo(context.packageName,flags)
    require(candidate.packageName==context.packageName && candidate.packageName==APP_PACKAGE) { "APK 包名不匹配，已拒绝安装" }
    val code=if(Build.VERSION.SDK_INT>=28)candidate.longVersionCode else candidate.versionCode.toLong()
    require(code==release.code && code>installedCode() && candidate.versionName==release.version) { "APK 版本不匹配或不是新版本，已拒绝安装" }
    require(Build.VERSION.SDK_INT<24 || candidate.applicationInfo!!.minSdkVersion<=Build.VERSION.SDK_INT) { "新版本不支持当前 Android 系统" }
    val expected=if(Build.VERSION.SDK_INT>=28)current.signingInfo?.apkContentsSigners else current.signatures
    val actual=if(Build.VERSION.SDK_INT>=28)candidate.signingInfo?.apkContentsSigners else candidate.signatures
    require(!expected.isNullOrEmpty() && !actual.isNullOrEmpty() && expected.toSet()==actual.toSet()) { "APK 签名与已安装的 RHFiles 不一致，不能覆盖安装；不会卸载或清空数据" }
    java.util.zip.ZipFile(file).use {zip ->
      val nativeAbis=zip.entries().asSequence().map{it.name}.filter{it.startsWith("lib/")&&it.endsWith(".so")}.map{it.split('/')[1]}.toSet()
      require(nativeAbis.isNotEmpty() && Build.SUPPORTED_ABIS.any{it in nativeAbis}) { "APK 不支持本机 CPU 架构" }
    }
  }
  @Synchronized fun installFile(): File {
    require(state=="ready" && available!=null) { "请先完成 APK 下载" }
    verifyApk(apk,available!!);return apk
  }
}

/** A separate, bounded download notification; never steals file-task progress. */
class AppUpdateService: Service() {
  override fun onBind(intent: Intent?): IBinder?=null
  override fun onCreate() {
    super.onCreate()
    if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("app-updates","应用更新",NotificationManager.IMPORTANCE_LOW))
    startForeground(43,notification("正在下载 RHFiles 更新…"));AppUpdates.get(this).service=this
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if(intent?.action=="cancel")AppUpdates.get(this).cancel() else AppUpdates.get(this).runDownload()
    return START_NOT_STICKY
  }
  private fun notification(text: String): Notification {
    val open=PendingIntent.getActivity(this,2,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val cancel=PendingIntent.getService(this,3,Intent(this,AppUpdateService::class.java).setAction("cancel"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this,"app-updates").setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("RHFiles 应用更新")
      .setContentText(text).setContentIntent(open).setOnlyAlertOnce(true).setOngoing(true).addAction(android.R.drawable.ic_menu_close_clear_cancel,"取消下载",cancel).build()
  }
  fun progress(text: String) {getSystemService(NotificationManager::class.java).notify(43,notification(text))}
  fun done() {stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}
  override fun onTimeout(startId: Int, fgsType: Int) {AppUpdates.get(this).cancel();done()}
  override fun onDestroy() {if(AppUpdates.get(this).service===this)AppUpdates.get(this).service=null;super.onDestroy()}
}
