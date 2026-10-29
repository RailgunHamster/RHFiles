package com.railgunhamster.rhfiles

import android.app.*
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.IBinder
import android.provider.DocumentsContract
import android.system.Os
import android.system.OsConstants
import android.util.AtomicFile
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Executors

/** A picker result is a NEW document, not permission to truncate an arbitrary URI. */
internal class RhVideoZipDestination private constructor(val path:String,private val readName:()->String?,private val opener:()->OutputStream,private val cleanup:()->String,val grantFlags:Int=0,val grantWarning:String="") {
  var opened=false;private set
  private var cleaned=false
  fun open():OutputStream=opener().also{opened=true}
  fun displayName():String?=readName()?.take(512)
  @Synchronized fun failed():String{if(cleaned)return "";cleaned=true;return cleanup()}
  companion object {
    private fun permissionFlags(context:Context,uri:Uri):Int=context.contentResolver.persistedUriPermissions.filter{it.uri==uri}.fold(0){flags,p->flags or (if(p.isReadPermission)Intent.FLAG_GRANT_READ_URI_PERMISSION else 0) or (if(p.isWritePermission)Intent.FLAG_GRANT_WRITE_URI_PERMISSION else 0)}
    fun releasePersisted(context:Context,path:String,flags:Int):String {
      if(flags==0)return ""
      return try{require(flags in 1..3);val uri=Uri.parse(path);require(uri.scheme=="content");val owned=permissionFlags(context,uri)and flags;if(owned!=0)context.contentResolver.releasePersistableUriPermission(uri,owned);""}catch(e:Exception){"保存位置的持久授权未能释放：${e.message}"}
    }
    fun document(context:Context,uri:Uri):RhVideoZipDestination {
      require(uri.scheme=="content"){"保存位置不是系统文档"}
      var owned=0;var warning=""
      try{val missing=(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)and permissionFlags(context,uri).inv();if(missing!=0){context.contentResolver.takePersistableUriPermission(uri,missing);owned=missing}}
      catch(e:Exception){warning="文件提供方未授予持久访问，关闭页面或重启后可能需要重新选择保存位置：${e.message}"}
      return RhVideoZipDestination(uri.toString(),{context.contentResolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),null,null,null)?.use{cursor->if(cursor.moveToFirst())cursor.getString(0)else null}},{context.contentResolver.openOutputStream(uri,"wt")?:error("无法打开新建文档")},{
        val cleanup=try{if(DocumentsContract.deleteDocument(context.contentResolver,uri))"" else "未完成的新文档未能清理，请手动删除"}catch(_:Exception){"未完成的新文档未能清理，请手动删除"}
        listOf(cleanup,releasePersisted(context,uri.toString(),owned)).filter{it.isNotEmpty()}.joinToString("；")
      },owned,warning)
    }
    fun local(context:Context,path:String):RhVideoZipDestination {
      val file=NativeStorage(context).local(path);require(file.parentFile?.isDirectory==true){"保存目录不存在"}
      var created=false
      return RhVideoZipDestination(file.path,{file.name},{
        check(!file.exists()){ "目标已经存在，未覆盖；请选择新的文件名" }
        // Atomic O_EXCL admission: never truncate a file created by another task.
        FileOutputStream(Os.open(file.path,OsConstants.O_WRONLY or OsConstants.O_CREAT or OsConstants.O_EXCL,0x180)).also{created=true}
      },{if(created)"未完成的新文件保留在 $path，请核对后手动清理" else ""})
    }
  }
}

internal class RhVideoDownloads private constructor(private val context:Context) {
  companion object {
    @Volatile private var instance:RhVideoDownloads?=null
    fun get(context:Context)=instance?:synchronized(this){instance?:RhVideoDownloads(context.applicationContext).also{instance=it}}
    private val active=setOf("queued","downloading","cancelling","publishing")
  }
  internal class Job(val owner:String,val generation:Long,val data:JSONObject,var grantFlags:Int=0) {
    val id:String get()=data.getString("id")
    @Volatile var submitted=false
    @Volatile var abort=""
    @Volatile var userCancel=false
    @Volatile var interrupt:(()->Unit)?=null
    var serviceId:String?=null
    var transfer:((Job)->Unit)?=null
    var notify:((JSONObject)->Unit)?=null
    var discard:(()->String)?=null
  }
  private val lock=Any()
  private val jobs=linkedMapOf<String,Job>()
  private val worker=Executors.newFixedThreadPool(2)
  private val preparer=java.util.concurrent.ThreadPoolExecutor(1,1,0,java.util.concurrent.TimeUnit.MILLISECONDS,java.util.concurrent.ArrayBlockingQueue<Runnable>(4),java.util.concurrent.ThreadPoolExecutor.AbortPolicy())
  private val journal=AtomicFile(File(context.filesDir,"rhvideo-downloads.json"))
  private var loaded=false
  private var warning=""
  @Volatile var service:RhVideoDownloadService?=null
  private fun load(){
    if(loaded)return;loaded=true
    if(!journal.baseFile.exists())return
    try{
      require(journal.baseFile.length()<=8*1024*1024){"下载记录过大"};val rows=JSONArray(journal.readFully().toString(Charsets.UTF_8));require(rows.length()<=64)
      for(i in 0 until rows.length()){
        val row=rows.getJSONObject(i);val data=row.getJSONObject("task");val owner=row.getString("owner");val grantFlags=row.optInt("grantFlags")
        data.put("revision",data.optLong("revision"))
        require(owner.matches(Regex("[a-f0-9]{64}"))&&RhVideoExports.uuid(data.getString("id"))&&RhVideoExports.uuid(data.getString("exportId"))&&grantFlags in 0..3)
        if(data.getString("state") in active)data.put("state","failed").put("error","上次运行中断，未自动重试；请核对保存位置的未完成文件").put("finished",System.currentTimeMillis()).put("speed",0)
        jobs[data.getString("id")]=Job(owner,-1,data,grantFlags)
      }
    }catch(e:Exception){warning="旧下载记录无法读取：${e.message}；没有恢复旧任务"}
  }
  private fun persist(){
    var output:FileOutputStream?=null
    try{output=journal.startWrite();val rows=JSONArray();for(job in jobs.values)rows.put(JSONObject().put("owner",job.owner).put("task",job.data).put("grantFlags",job.grantFlags));output.write(rows.toString().toByteArray(Charsets.UTF_8));journal.finishWrite(output)}
    catch(e:Exception){journal.failWrite(output);warning="下载状态未能保存：${e.message}"}
  }
  fun list(owner:String):JSONObject=synchronized(lock){load();JSONObject().put("items",JSONArray(jobs.values.toList().asReversed().filter{it.owner==owner}.map{JSONObject(it.data.toString())})).put("warning",warning)}
  fun prepare(work:()->Unit){preparer.execute(work)}
  fun reportWarning(message:String){synchronized(lock){warning=message}}
  fun hasActive():Boolean=synchronized(lock){jobs.values.any{it.data.optString("state") in active}}
  fun start(owner:String,generation:Long,id:String,name:String,total:Long,destination:RhVideoZipDestination,notify:(JSONObject)->Unit,transfer:(Job)->Unit):JSONObject {
    val job=synchronized(lock){
      load();check(jobs.values.count{it.data.optString("state") in active}<2){"已有两个本机 ZIP 下载，请等待完成"}
      while(jobs.size>=64){
        val old=jobs.values.firstOrNull{it.data.optString("state") !in active}?:error("下载记录已满")
        val other=jobs.values.firstOrNull{it.id!=old.id&&it.data.optString("path")==old.data.optString("path")}
        if(other!=null)other.grantFlags=other.grantFlags or old.grantFlags
        else{val released=RhVideoZipDestination.releasePersisted(context,old.data.optString("path"),old.grantFlags);if(released.isNotEmpty())warning=released}
        jobs.remove(old.id)
      }
      if(destination.grantWarning.isNotEmpty())warning=destination.grantWarning
      val data=JSONObject().put("id",UUID.randomUUID().toString()).put("exportId",id).put("name",name).put("path",destination.path).put("state","queued").put("bytes",0).put("total",total).put("speed",0).put("error","").put("started",System.currentTimeMillis()).put("finished",JSONObject.NULL).put("revision",0)
      Job(owner,generation,data,destination.grantFlags).also{it.notify=notify;it.transfer=transfer;it.discard={destination.failed()};jobs[it.id]=it;persist()}
    }
    try{ContextCompat.startForegroundService(context,Intent(context,RhVideoDownloadService::class.java))}
    catch(e:Exception){job.abort="无法启动下载服务";job.interrupt?.invoke();fail(job,"无法启动下载服务：${e.message}");service?.finishIfIdle()}
    return JSONObject().put("task",synchronized(lock){JSONObject(job.data.toString())})
  }
  fun checkpoint(job:Job){check(job.abort.isEmpty()){job.abort}}
  fun progress(job:Job,bytes:Long,speed:Double){
    synchronized(lock){checkpoint(job);job.data.put("bytes",bytes).put("speed",speed)};publish(job)
  }
  fun name(job:Job,name:String){synchronized(lock){checkpoint(job);job.data.put("name",name)};publish(job)}
  fun committing(job:Job){synchronized(lock){checkpoint(job);job.data.put("state","publishing")};publish(job)}
  private fun publish(job:Job){
    val snapshot=synchronized(lock){job.data.put("revision",job.data.optLong("revision")+1);persist();JSONObject(job.data.toString())}
    try{job.notify?.invoke(snapshot)}catch(e:Exception){reportWarning("下载状态已记录，但界面更新失败：${e.message}")}
    try{service?.update(snapshot)}catch(e:Exception){reportWarning("下载状态已记录，但通知更新失败：${e.message}")}
  }
  private fun fail(job:Job,error:String){
    val cleanup=job.discard?.invoke().orEmpty()
    synchronized(lock){job.data.put("state",if(job.userCancel)"cancelled" else "failed").put("error",error+if(cleanup.isEmpty())"" else "；$cleanup").put("finished",System.currentTimeMillis()).put("speed",0)};publish(job)
    job.transfer=null;job.interrupt=null;job.notify=null;job.discard=null
  }
  fun runQueued(serviceId:String){
    val admitted=synchronized(lock){jobs.values.filter{it.data.optString("state")=="queued"&&!it.submitted}.onEach{it.submitted=true;it.serviceId=serviceId}}
    for(job in admitted)worker.execute{
      try{
        checkpoint(job);synchronized(lock){job.data.put("state","downloading")};publish(job)
        val transfer=job.transfer?:error("进程已重启，下载未自动恢复");transfer(job)
        synchronized(lock){check(job.data.optString("state")=="publishing"){"下载没有完成文件提交"};job.data.put("state","saved").put("finished",System.currentTimeMillis()).put("speed",0)};publish(job)
      }catch(e:Exception){fail(job,e.message?:"ZIP 下载失败，未自动重试")}
      finally{job.transfer=null;job.interrupt=null;job.notify=null;job.discard=null;service?.finishIfIdle()}
    }
  }
  fun cancel(owner:String,id:String):JSONObject {
    val(job,queued)=synchronized(lock){load();val j=jobs[id]?.takeIf{it.owner==owner}?:error("下载任务不存在");check(j.data.optString("state") in setOf("queued","downloading","cancelling")){"下载已结束或正在提交，旧取消操作未执行"};j.userCancel=true;j.abort="已取消下载";val queued=!j.submitted;j.data.put("state",if(queued)"cancelled" else "cancelling");j to queued}
    job.interrupt?.invoke()
    if(queued)fail(job,"已取消下载")else publish(job)
    service?.finishIfIdle();return synchronized(lock){JSONObject(job.data.toString())}
  }
  fun abortAll(reason:String,serviceId:String){val current=synchronized(lock){jobs.values.filter{it.data.optString("state") in active&&it.serviceId==serviceId}.onEach{it.abort=reason}};for(job in current)job.interrupt?.invoke()}
}

/** Foreground lifetime and notification survive closing the media library. */
class RhVideoDownloadService:Service(){
  private val downloads by lazy{RhVideoDownloads.get(this)}
  private val serviceId=UUID.randomUUID().toString()
  private var wake:android.os.PowerManager.WakeLock?=null
  override fun onBind(intent:Intent?):IBinder?=null
  override fun onCreate(){super.onCreate();getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("rhvideo-downloads","媒体库 ZIP 下载",NotificationManager.IMPORTANCE_LOW));startForeground(604,notification(null));downloads.service=this;wake=(getSystemService(POWER_SERVICE)as android.os.PowerManager).newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK,"RHFiles:rhvideo-downloads").apply{acquire(6*60*60*1000L)}}
  override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{downloads.runQueued(serviceId);finishIfIdle();return START_NOT_STICKY}
  private fun notification(task:JSONObject?):Notification{
    val open=PendingIntent.getActivity(this,604,Intent(this,RhVideoActivity::class.java).putExtra("rhvideoExportPanel",true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val total=task?.optLong("total")?:0;val bytes=task?.optLong("bytes")?:0;val percent=if(total>0)(bytes*100/total).toInt().coerceIn(0,99)else 0
    return NotificationCompat.Builder(this,"rhvideo-downloads").setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("RHFiles · 喜爱文件下载").setContentText(task?.optString("name")?:"正在准备 ZIP 下载…").setSubText(if(task==null)"点击查看下载进度" else "$percent% · $bytes / $total B").setProgress(100,percent,total<=0).setContentIntent(open).setOnlyAlertOnce(true).setOngoing(true).build()
  }
  fun update(task:JSONObject){getSystemService(NotificationManager::class.java).notify(604,notification(task))}
  fun finishIfIdle(){if(!downloads.hasActive()){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}}
  override fun onTimeout(startId:Int,fgsType:Int){downloads.abortAll("系统限制后台下载时间，任务停止；未自动重试",serviceId);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}
  override fun onDestroy(){downloads.abortAll("下载服务已停止，任务未自动重试",serviceId);if(downloads.service===this)downloads.service=null;if(wake?.isHeld==true)wake?.release();super.onDestroy()}
}
