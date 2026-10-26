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
  private fun decoded(encoded:String):JSONObject {
    val value=JSONObject(encoded)
    require(!value.has("error")){value.optString("error","文件服务失败")}
    return value.getJSONObject("result")
  }
  @Synchronized fun state()=decoded(GroupServiceNative.state()).put("announcementError",announcementError?:JSONObject.NULL)
  @Synchronized fun membershipChanged(){try{decoded(GroupServiceNative.advertise());announcementError=null}catch(error:Exception){announcementError=error.message?:"文件服务地址尚未发布，请停止后重新启动服务"}}
  @Synchronized fun start(context:Context,args:JSONObject):JSONObject {
    require(!state().optBoolean("running")){"文件服务已经启动"}
    val storage=NativeStorage(context.applicationContext)
    val roots=args.getJSONArray("roots");require(roots.length() in 1..8){"请选择 1 至 8 个本地共享目录"}
    val seen=hashSetOf<String>();val names=hashSetOf<String>();val shares=JSONArray()
    for(i in 0 until roots.length()){
      val root=roots.getJSONObject(i);val file=storage.local(root.getString("path"))
      require(file.isDirectory&&file.canRead()){"共享目录无法读取，请先授予存储权限"}
      require(seen.add(file.path)){"共享目录重复"}
      val name=root.getString("name").trim()
      require(name.length in 1..64&&name !in listOf(".","..")&&name.none{it<' '||it in "/\\%:#?"}&&names.add(name.lowercase())){"共享名称无效或重复"}
      shares.put(JSONObject().put("name",name).put("path",file.path))
    }
    val port=args.optInt("port",39128);require(port in 1024..65535){"端口必须在 1024–65535 之间"}
    DeviceGroups.install(context)
    val config=JSONObject().put("directory",File(context.filesDir,"group-file-service-v1").path).put("shares",shares).put("port",port)
    val result=decoded(GroupServiceNative.start(config.toString(),GroupServiceAuthority()))
    announcementError=null
    try{ContextCompat.startForegroundService(context,Intent(context,DeviceFileService::class.java))}
    catch(error:Exception){GroupServiceNative.stop();throw error}
    return result
  }
  @Synchronized fun stop(context:Context):JSONObject {
    val result=decoded(GroupServiceNative.stop());context.stopService(Intent(context,DeviceFileService::class.java));return result
  }
  internal fun release(){GroupServiceNative.stop()}
}

/** connectedDevice foreground lifetime is user-visible and independent of panes.
 * Multicast is held only while explicitly serving; idle service holds no CPU lock. */
class DeviceFileService:Service(){
  private var multicast:WifiManager.MulticastLock?=null
  private val worker=Executors.newSingleThreadExecutor()
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
    if(intent?.action=="stop")worker.execute{DeviceFileServer.stop(this)}
    return START_NOT_STICKY
  }
  override fun onDestroy(){worker.shutdown();DeviceFileServer.release();if(multicast?.isHeld==true)multicast?.release();super.onDestroy()}
}
