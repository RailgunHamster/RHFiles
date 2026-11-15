package com.railgunhamster.rhfiles

import android.app.*
import android.content.*
import android.os.*
import android.net.wifi.WifiManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/** One explicit phone service, using the same group authority as outbound access.
 * No standalone pairing/password server, no auto-start, no silent restart. */
internal object DeviceFileServer {
  init { System.loadLibrary("rhfiles_android_lib") }
  private var announcementError:String?=null
  private var generation=0L
  private var activeGeneration:Long?=null
  private fun decoded(encoded:String):JSONObject {
    val value=JSONObject(encoded)
    require(!value.has("error")){value.optString("error","文件服务失败")}
    return value.getJSONObject("result")
  }
  @Synchronized fun state()=decoded(GroupServiceNative.state()).put("announcementError",announcementError?:JSONObject.NULL)
  @Synchronized fun membershipChanged(){try{decoded(GroupServiceNative.advertise());announcementError=null;if(state().optBoolean("running"))DeviceGroups.publishServiceRecords()}catch(error:Exception){announcementError=error.message?:"文件服务地址尚未发布，请停止后重新启动服务"}}
  fun validateShare(storage:NativeStorage,root:JSONObject):JSONObject {
    val path=root.getString("path")
    require(!storage.isDocument(path)&&!storage.isRemote(path)){"请选择手机可直接访问的存储目录"}
    val file=storage.local(path)
    require(storage.localVolumes().any{volume->
      val base=volume.canonicalPath
      file.path==base||file.path.startsWith(base+File.separator)
    }){"请选择内部存储或已挂载的外部存储目录"}
    require(file.isDirectory&&file.canRead()){"共享目录无法读取，请检查存储权限或外置存储是否仍已连接"}
    val name=root.getString("name").trim()
    val reserved=name.substringBefore('.').matches(Regex("(?i)CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]"))
    require(name.length in 1..64&&!name.endsWith('.')&&!reserved&&!name.equals("lan-service-v1",true)&&
      !name.startsWith(".rhfiles-service-",true)&&name.none{it.isISOControl()||it in "/\\%:#?\"<>|"}){"共享名称包含保留字符或不是有效名称"}
    return JSONObject().put("name",name).put("path",file.path)
  }
  @Synchronized fun start(context:Context,args:JSONObject):JSONObject {
    require(!state().optBoolean("running")){"文件服务已经启动"}
    val storage=NativeStorage(context.applicationContext)
    val roots=args.getJSONArray("roots");require(roots.length() in 1..8){"请选择 1 至 8 个本地共享目录"}
    val paths=mutableListOf<String>();val names=hashSetOf<String>();val shares=JSONArray()
    for(i in 0 until roots.length()){
      val share=validateShare(storage,roots.getJSONObject(i))
      val path=share.getString("path")
      require(paths.none{it==path||it.startsWith(path+File.separator)||path.startsWith(it+File.separator)}){"共享目录不能与已有目录相同或互相包含"}
      require(names.add(share.getString("name").lowercase())){"共享名称重复"}
      paths.add(path)
      shares.put(share)
    }
    val port=args.optInt("port",39128);require(port in 1024..65535){"端口必须在 1024–65535 之间"}
    DeviceGroups.install(context)
    val config=JSONObject().put("directory",File(context.filesDir,"group-file-service-v1").path).put("shares",shares).put("port",port)
    val result=decoded(GroupServiceNative.start(config.toString(),GroupServiceAuthority()))
    announcementError=null
    val session=++generation
    activeGeneration=session
    try{ContextCompat.startForegroundService(context,Intent(context,DeviceFileService::class.java).putExtra("session",session))}
    catch(error:Exception){release(session);throw error}
    DeviceGroups.publishServiceRecords()
    return result
  }
  @Synchronized fun stop(context:Context,expected:Long?=null):JSONObject {
    if(expected!=null&&expected!=activeGeneration)return state()
    val result=decoded(GroupServiceNative.stop())
    activeGeneration=null
    announcementError=null
    context.stopService(Intent(context,DeviceFileService::class.java))
    return result
  }
  @Synchronized fun release(session:Long){
    if(session!=activeGeneration)return
    activeGeneration=null
    announcementError=null
    GroupServiceNative.stop()
  }
}

/** connectedDevice foreground lifetime is user-visible and independent of panes.
 * Multicast is held only while explicitly serving; idle service holds no CPU lock. */
class DeviceFileService:Service(){
  private var multicast:WifiManager.MulticastLock?=null
  private val worker=Executors.newSingleThreadExecutor()
  private var session=0L
  override fun onBind(intent:Intent?):IBinder?=null
  override fun onCreate(){
    super.onCreate()
    val manager=getSystemService(NotificationManager::class.java)
    if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel("group-file-service","设备组文件服务",NotificationManager.IMPORTANCE_LOW))
    val open=PendingIntent.getActivity(this,47,Intent(this,MainActivity::class.java).setAction("com.railgunhamster.rhfiles.FILE_SERVER"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val stop=PendingIntent.getService(this,47,Intent(this,DeviceFileService::class.java).setAction("stop"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification=NotificationCompat.Builder(this,"group-file-service").setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle("RHFiles · 设备组文件服务").setContentText("仅设备组成员可访问，点击管理共享目录")
      .setContentIntent(open).setOnlyAlertOnce(true).setOngoing(true).addAction(android.R.drawable.ic_menu_close_clear_cancel,"停止服务",stop).build()
    if(Build.VERSION.SDK_INT>=29)startForeground(47,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)else startForeground(47,notification)
    multicast=(applicationContext.getSystemService(WIFI_SERVICE)as? WifiManager)?.createMulticastLock("RHFiles:device-file-service")?.apply{setReferenceCounted(false);acquire()}
  }
  override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
    if(intent?.action=="stop"){
      val expected=session
      worker.execute{DeviceFileServer.stop(this,expected)}
    }else session=intent?.getLongExtra("session",0L)?:0L
    return START_NOT_STICKY
  }
  override fun onDestroy(){worker.shutdown();DeviceFileServer.release(session);if(multicast?.isHeld==true)multicast?.release();super.onDestroy()}
}
