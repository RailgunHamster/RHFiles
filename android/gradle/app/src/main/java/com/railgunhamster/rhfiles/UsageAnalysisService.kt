package com.railgunhamster.rhfiles

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import org.json.JSONObject

class UsageAnalysisService:Service() {
  private var wake:PowerManager.WakeLock?=null
  private val analysis by lazy{UsageAnalysis.get(this)}
  private var lastNotification=0L
  override fun onBind(intent:Intent?):IBinder?=null
  override fun onCreate(){
    super.onCreate()
    if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("storage-analysis","空间分析",NotificationManager.IMPORTANCE_LOW))
    startForeground(44,notification(JSONObject()))
    analysis.service=this
    wake=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"RHFiles:storage-analysis").apply{acquire(6*60*60*1000L)}
  }
  override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
    try{if(intent?.action=="cancel")analysis.cancel(intent.getStringExtra("id")?:"")else intent?.getStringExtra("id")?.let{analysis.begin(it)}}catch(_:Exception){}
    finishIfIdle();return START_NOT_STICKY
  }
  private fun notification(status:JSONObject):Notification {
    val open=PendingIntent.getActivity(this,44,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val percent=status.optInt("percent",-1)
    val phase=status.optString("state")
    val text=when(phase){"indexing"->"预扫描：发现 ${status.optLong("discovered")} 项，总量尚未确定";"analyzing"->"正在汇总 ${percent.coerceAtLeast(0)}% · ${status.optLong("processed")}/${status.optLong("total")} 项";"canceling"->"正在停止并整理已读取项目…";else->"准备文件夹空间分析…"}
    val builder=NotificationCompat.Builder(this,"storage-analysis").setSmallIcon(android.R.drawable.ic_menu_sort_by_size).setContentTitle("RHFiles 空间分析").setContentText(text).setContentIntent(open).setOnlyAlertOnce(true).setOngoing(true)
      .setProgress(100,percent.coerceIn(0,100),percent<0)
    if(status.has("id")){
      val cancel=PendingIntent.getService(this,44,Intent(this,UsageAnalysisService::class.java).setAction("cancel").putExtra("id",status.getString("id")),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      builder.addAction(android.R.drawable.ic_menu_close_clear_cancel,"取消分析",cancel)
    }
    return builder.build()
  }
  @Synchronized internal fun progress(status:JSONObject){if(System.currentTimeMillis()-lastNotification<900)return;lastNotification=System.currentTimeMillis();getSystemService(NotificationManager::class.java).notify(44,notification(status))}
  internal fun finishIfIdle(){if(!analysis.active()){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}}
  override fun onTimeout(startId:Int,fgsType:Int){analysis.cancelAll();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}
  override fun onDestroy(){if(wake?.isHeld==true)wake?.release();if(analysis.service===this)analysis.service=null;super.onDestroy()}
}
