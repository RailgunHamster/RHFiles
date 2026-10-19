package com.railgunhamster.rhfiles

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

/** At most one active scan per pane; keep four private, disk-backed reports. */
internal class UsageAnalysis private constructor(private val context:Context) {
  companion object {
    @Volatile private var instance:UsageAnalysis?=null
    fun get(context:Context)=instance?:synchronized(this){instance?:UsageAnalysis(context.applicationContext).also{instance=it}}
    fun requireConnectionsIdle(id:String?=null){instance?.checkConnections(id)}
  }
  private val directory=File(context.cacheDir,"usage-reports").apply{check(mkdirs()||isDirectory)}
  private val source=DeviceUsageSource(NativeStorage(context))
  private val reports=linkedMapOf<String,UsageReport>()
  private val submitted=hashSetOf<String>()
  private val workers=Executors.newFixedThreadPool(2)
  @Volatile var service:UsageAnalysisService?=null
  init {
    directory.listFiles()?.filter{it.extension=="db"}?.sortedByDescending{it.lastModified()}?.take(4)?.forEach{file->
      try{val id=UUID.fromString(file.nameWithoutExtension).toString();reports[id]=UsageReport(file,id,source,"","",restore=true)}catch(_:Exception){}
    }
  }
  private fun report(id:String):UsageReport {require(UUID.fromString(id).toString()==id){"分析 ID 无效"};return reports[id]?:error("这份分析报告已过期，请重新分析")}
  @Synchronized fun latest(owner:String,root:String):Any=reports.values.filter{it.pane==owner&&it.status().optString("root")==root}.maxByOrNull{it.status().optLong("started")}?.status()?:JSONObject.NULL
  @Synchronized fun status(id:String)=report(id).status()
  @Synchronized fun page(args:JSONObject)=report(args.getString("id")).page(args.optLong("parentId",1),args.optString("view","folders"),args.optInt("offset",0),args.optInt("limit",100))
  @Synchronized fun start(root:String,owner:String):JSONObject {
    require(root.length in 1..8192&&owner in listOf("first","second")){"分析位置或窗格无效"}
    require(reports.values.none{it.pane==owner&&it.status().optString("state") in UsageReport.ACTIVE}){"此窗格还有分析任务，请先取消或等待完成"}
    require(reports.values.count{it.status().optString("state") in UsageReport.ACTIVE}<2){"已有两份报告正在分析，请稍后再试"}
    require(directory.usableSpace>32L*1024*1024){"可用空间不足 32 MB，无法创建分析缓存"}
    if(root.startsWith('/'))NativeStorage(context).local(root)else require(root.startsWith("remote://")||root.startsWith("content://")){"不是支持的存储位置"}
    while(reports.size>=4){
      val oldest=reports.entries.filter{it.value.status().optString("state") !in UsageReport.ACTIVE}.minByOrNull{it.value.status().optLong("started")}?:break
      reports.remove(oldest.key);oldest.value.close();android.database.sqlite.SQLiteDatabase.deleteDatabase(oldest.value.file)
    }
    // Remove abandoned report files only within this app-private UUID cache.
    directory.listFiles()?.filter{it.extension=="db"&&it.nameWithoutExtension !in reports}?.forEach{file->
      if(runCatching{UUID.fromString(file.nameWithoutExtension).toString()==file.nameWithoutExtension}.getOrDefault(false))android.database.sqlite.SQLiteDatabase.deleteDatabase(file)
    }
    val id=UUID.randomUUID().toString();val report=UsageReport(File(directory,"$id.db"),id,source,root,owner);reports[id]=report
    try{ContextCompat.startForegroundService(context,Intent(context,UsageAnalysisService::class.java).putExtra("id",id))}catch(e:Exception){report.fail("无法启动后台分析：${e.message}");throw e}
    return report.status()
  }
  @Synchronized fun begin(id:String){
    val report=report(id);if(!submitted.add(id))return
    workers.execute{try{report.run{service?.progress(it)}}finally{service?.finishIfIdle()}}
  }
  @Synchronized fun cancel(id:String)=report(id).cancel()
  @Synchronized fun cancelAll(){reports.values.filter{it.status().optString("state") in UsageReport.ACTIVE}.forEach{it.cancel()}}
  @Synchronized fun active()=reports.values.any{it.status().optString("state") in UsageReport.ACTIVE}
  @Synchronized private fun checkConnections(id:String?){require(reports.values.none{val s=it.status();s.optString("state") in UsageReport.ACTIVE&&s.optString("root").startsWith(if(id==null)"remote://"else"remote://$id/")}){"此网络位置正在分析空间，请先取消分析或等待完成，再修改连接或应用同步配置"}}
}
