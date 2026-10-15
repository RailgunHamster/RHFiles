package com.railgunhamster.rhfiles

import android.app.*
import android.content.*
import android.os.*
import android.net.wifi.WifiManager
import androidx.core.app.NotificationCompat

/** Owns discovery/transfer lifetime independently of either pane or Activity. */
class NearbyService:Service(){
  private var multicast:WifiManager.MulticastLock?=null
  private var wake:PowerManager.WakeLock?=null
  private external fun stopNative()
  companion object {init{System.loadLibrary("rhfiles_android_lib")}}
  override fun onBind(intent:Intent?):IBinder?=null
  override fun onCreate(){super.onCreate()
    if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("nearby","附近互传",NotificationManager.IMPORTANCE_LOW))
    val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val stop=PendingIntent.getService(this,0,Intent(this,NearbyService::class.java).setAction("stop"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    startForeground(44,NotificationCompat.Builder(this,"nearby").setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("RHFiles 附近互传已开启").setContentText("接收文件仍需在应用中确认；点击返回，或点停止关闭连接").setContentIntent(open).setOngoing(true).addAction(android.R.drawable.ic_menu_close_clear_cancel,"停止互传",stop).build())
    multicast=(applicationContext.getSystemService(WIFI_SERVICE) as? WifiManager)?.createMulticastLock("RHFiles:nearby")?.apply{setReferenceCounted(false);acquire()}
    wake=(getSystemService(POWER_SERVICE)as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"RHFiles:nearby").apply{acquire(6*60*60*1000L)}
  }
  override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{if(intent?.action=="stop"){stopNative();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()};return START_NOT_STICKY}
  override fun onTimeout(startId:Int,fgsType:Int){stopNative();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}
  override fun onDestroy(){stopNative();if(multicast?.isHeld==true)multicast?.release();if(wake?.isHeld==true)wake?.release();super.onDestroy()}
}
