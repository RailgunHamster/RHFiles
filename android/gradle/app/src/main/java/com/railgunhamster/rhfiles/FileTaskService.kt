package com.railgunhamster.rhfiles

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/** Foreground lifetime is owned by the service, not by a visible WebView or a JS timer. */
class FileTaskService : Service() {
  private var wake: PowerManager.WakeLock? = null
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager::class.java)
      .createNotificationChannel(NotificationChannel("file-tasks","文件任务",NotificationManager.IMPORTANCE_LOW))
    startForeground(42,notification("准备文件任务…"))
    wake=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"RHFiles:file-tasks").apply { acquire(6*60*60*1000L) }
    FileTasks.service=this
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == "cancel") FileTasks.cancelAll()
    FileTasks.runQueued(this)
    finishIfIdle()
    return START_NOT_STICKY // Never replay a destructive operation after process death.
  }
  private fun notification(text: String): Notification {
    val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val cancel=PendingIntent.getService(this,1,Intent(this,FileTaskService::class.java).setAction("cancel"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this,"file-tasks").setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle("RHFiles 文件任务").setContentText(text).setContentIntent(open).setOnlyAlertOnce(true)
      .setOngoing(true).addAction(android.R.drawable.ic_menu_close_clear_cancel,"取消任务",cancel).build()
  }
  fun update(text: String) { getSystemService(NotificationManager::class.java).notify(42,notification(text)) }
  fun finishIfIdle() { if (!FileTasks.hasActive()) { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() } }
  override fun onTimeout(startId: Int, fgsType: Int) {
    FileTasks.cancelAll("系统限制后台任务运行时间，请回到应用重试未完成项")
    stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
  }
  override fun onDestroy() {
    if (wake?.isHeld == true) wake?.release()
    FileTasks.service=null; super.onDestroy()
  }
}

object FileTasks {
  class Job(val id: String, val op: String, val args: JSONObject) {
    @Volatile var submitted=false
    @Volatile var state="queued"
    @Volatile var paused=false
    @Volatile var canceled=false
    @Volatile var bytes=0L
    @Volatile var total=0L
    @Volatile var files=0L
    @Volatile var done=0L
    @Volatile var current=""
    @Volatile var message=""
    @Volatile var started=0L
    @Volatile var finished=0L
    @Volatile var notified=0L
    val completed=java.util.concurrent.CopyOnWriteArrayList<String>()
    val failures=java.util.concurrent.CopyOnWriteArrayList<Pair<String,String>>()
    val outputs=java.util.concurrent.CopyOnWriteArrayList<String>()
    @Synchronized fun json()=JSONObject().put("id",id).put("op",op).put("args",args).put("state",state)
      .put("bytes",bytes).put("total",total).put("files",files).put("done",done).put("current",current).put("message",message)
      .put("started",started).put("finished",finished).put("completed",JSONArray(completed)).put("outputs",JSONArray(outputs))
      .put("failures",JSONArray(failures.map { JSONObject().put("path",it.first).put("message",it.second) }))
  }
  private val jobs=ConcurrentHashMap<String,Job>()
  private val worker=Executors.newSingleThreadExecutor()
  @Volatile var service: FileTaskService?=null
  private var initialized=false
  private fun directory(context: Context)=File(context.filesDir,"tasks-v1").apply { mkdirs() }
  @Synchronized fun load(context: Context) {
    if (initialized) return
    directory(context).listFiles()?.filter { it.extension=="json" }?.sortedByDescending { it.lastModified() }?.take(100)?.forEach { f ->
      try {
        val j=JSONObject(f.readText()); val job=Job(j.getString("id"),j.getString("op"),j.getJSONObject("args"))
        job.state=j.getString("state"); if (job.state in listOf("queued","running","paused","scanning")) job.state="interrupted"
        job.bytes=j.optLong("bytes");job.total=j.optLong("total");job.files=j.optLong("files");job.done=j.optLong("done")
        job.started=j.optLong("started");job.finished=j.optLong("finished");job.message=j.optString("message")
        fun strings(key:String)=j.optJSONArray(key)?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
        job.completed.addAll(strings("completed"));job.outputs.addAll(strings("outputs"))
        j.optJSONArray("failures")?.let { a -> for (i in 0 until a.length()) { val e=a.getJSONObject(i);job.failures.add(e.getString("path") to e.getString("message")) } }
        jobs[job.id]=job
      } catch (_: Exception) { /* A damaged journal never triggers file operations. */ }
    }; initialized=true
  }
  private fun persist(context:Context,j:Job) {
    synchronized(j) {
      val file=android.util.AtomicFile(File(directory(context),j.id+".json"))
      val stream=file.startWrite()
      try { stream.write(j.json().toString().toByteArray());file.finishWrite(stream) } catch(e:Exception) { file.failWrite(stream);throw e }
    }
  }
  fun list(context:Context):JSONArray { load(context);return JSONArray(jobs.values.sortedByDescending { it.started }.map { it.json() }) }
  fun status(context:Context,id:String):JSONObject { load(context);return jobs[id]?.json() ?: error("任务不存在") }
  fun hasActive()=jobs.values.any { it.state in listOf("queued","running","paused","scanning") }
  @Synchronized fun start(context:Context,op:String,args:JSONObject):String {
    load(context);require(op in listOf("copy","move","delete","zip","extract","trash","restore","backup")) { "未知文件操作" }
    require(jobs.values.count { it.state in listOf("queued","running","paused","scanning") }<20) { "任务队列已满" }
    val job=Job(UUID.randomUUID().toString(),op,JSONObject(args.toString()));job.started=System.currentTimeMillis()
    persist(context,job);jobs[job.id]=job
    try { ContextCompat.startForegroundService(context,Intent(context,FileTaskService::class.java)) }
    catch(e:Exception) {job.state="failed";job.message="无法启动后台任务：${e.message}";persist(context,job);throw e}
    return job.id
  }
  @Synchronized fun runQueued(context:Context) {
    for(job in jobs.values.filter { !it.submitted && it.state in listOf("queued","running","paused") }.sortedBy { it.started }) {
      job.submitted=true
      worker.execute {
        try { checkpoint(job);job.state="scanning";execute(context,job);job.state=if(job.failures.isEmpty()) "completed" else "failed" }
        catch(e:Exception) {job.state=if(job.canceled) "canceled" else "failed";job.message=job.message.ifBlank { e.message ?: e.javaClass.simpleName }}
        finally {
          job.finished=System.currentTimeMillis();try {persist(context,job)}catch(_:Exception){}
          try {
            val local=job.outputs.filter{File(it).isAbsolute}.flatMap{path->File(path).walkTopDown().onEnter{!SafeFiles.isLink(it)}.filter{it.isFile}.take(5000).map{it.path}.toList()}
            if(local.isNotEmpty())android.media.MediaScannerConnection.scanFile(context,local.toTypedArray(),null,null)
          }catch(_:Exception){}
          service?.finishIfIdle()
        }
      }
    }
  }
  fun control(context:Context,id:String,action:String) {
    val j=jobs[id] ?: error("任务不存在")
    require(j.state in listOf("queued","scanning","running","paused")) { "任务已结束" }
    when(action) {"pause"->{j.paused=true;j.state="paused"};"resume"->{j.paused=false;j.state="running"};"cancel"->{j.canceled=true;j.paused=false};else->error("未知任务控制")}
    persist(context,j)
  }
  fun cancelAll(reason:String="用户取消") { jobs.values.filter { it.state in listOf("queued","scanning","running","paused") }.forEach { it.message=reason;it.canceled=true;it.paused=false } }
  private fun checkpoint(j:Job,amount:Int=0) {
    while(j.paused && !j.canceled) Thread.sleep(120)
    check(!j.canceled) { "用户取消；已完成的文件保留，未完成来源未删除" }
    j.bytes+=amount
    val now=System.currentTimeMillis()
    if(now-j.notified>750) {j.notified=now;service?.update("${j.current} · ${j.bytes/1024} KB · ${j.done}/${j.files} 项")}
  }
  internal fun execute(context:Context,j:Job) {
    val storage=NativeStorage(context)
    val paths=j.args.optJSONArray("sources") ?: JSONArray()
    val sources=(0 until paths.length()).map {paths.getString(it)}.distinct()
    val destination=j.args.optString("destination")
    if(j.op=="backup") {
      val pkg=j.args.getString("package");val app=context.packageManager.getApplicationInfo(pkg,0)
      val files=(listOf(app.sourceDir)+(app.splitSourceDirs?.toList() ?: emptyList())).map{File(it)}
      j.total=files.sumOf{it.length()};j.files=files.size.toLong();j.state="running";j.current=pkg
      val output=File(storage.local(destination),SafeFiles.name(pkg + if(files.size==1) ".apk" else "-split-apks.zip"))
      if(files.size>1) Archives.zip(files,output,0){checkpoint(j,it)} else {
        val stage=File.createTempFile(".rhfiles-apk-",".part",output.parentFile)
        try{stage.outputStream().use{out->files.first().inputStream().use{SafeFiles.pump(it,out){checkpoint(j,it)}}};SafeFiles.publish(stage,output)}finally{stage.delete()}
      }
      j.outputs.add(output.path);j.completed.add(pkg);j.done=j.files;persist(context,j);return
    }
    var count=0
    fun measure(path:String,depth:Int=0) {
      checkpoint(j);require(depth<128 && ++count<=100000) { "目录过深或文件过多" }
      val e=storage.stat(path);j.files++
      if(e.isDir) {val children=storage.list(path);require(children.size<50000){"单目录超过安全上限，未开始操作"};children.forEach {measure(it.path,depth+1)}} else j.total+=e.size
    }
    fun erase(path:String,depth:Int=0,report:Boolean=true) {
      checkpoint(j);require(depth<128) { "目录过深" }
      val e=storage.stat(path)
      if(e.isDir) storage.list(path).forEach {erase(it.path,depth+1,report)}
      storage.delete(path);if(report) {j.done++;j.bytes+=e.size}
    }
    fun cleanup(path:String) {
      // Cleanup only the staging node created by this task, never any source.
      fun remove(p:String,depth:Int) { require(depth<128); if(storage.stat(p).isDir) storage.list(p).forEach{remove(it.path,depth+1)};storage.delete(p) }
      try {remove(path,0)} catch(_:Exception) {j.message="留下未完成临时文件：$path；可检查后删除"}
    }
    data class Captured(val entry:NativeEntry,val digest:String?)
    val captured=mutableListOf<Captured>()
    fun copyTree(source:String,parent:String,name:String,depth:Int=0):String {
      checkpoint(j);require(depth<128);val entry=storage.stat(source)
      val output=storage.create(parent,name,entry.isDir)
      try {
        if(entry.isDir) {captured.add(Captured(entry,null));val children=storage.list(source);require(children.size<50000){"单目录超过安全上限"};children.forEach {copyTree(it.path,output,it.name,depth+1)}}
        else {
          val digest=java.security.MessageDigest.getInstance("SHA-256")
          storage.input(source).use {input->java.security.DigestInputStream(input,digest).use{storage.write(output,it){amount->checkpoint(j,amount)}}}
          val after=storage.stat(source);require(after.size==entry.size && after.modified==entry.modified){"复制期间来源发生变化，保留来源并停止"}
          captured.add(Captured(entry,digest.digest().joinToString(""){"%02x".format(it)}))
        }
        j.done++;return output
      } catch(e:Exception) {cleanup(output);throw e}
    }
    if(j.op in listOf("copy","move","delete","zip")) {
      for(p in sources) try {measure(p)} catch(e:Exception) {j.failures.add(p to (e.message ?: "扫描失败"))}
      require(j.files>0 || sources.isNotEmpty()) { "未选择文件" }
    }
    j.state="running"
    if(j.op=="extract") {
      val file=storage.local(j.args.getString("path")); j.current=file.name
      val output=Archives.extract(file,storage.local(destination),j.args.getString("name")){checkpoint(j,it)}
      j.outputs.add(output.path);j.completed.add(file.path);persist(context,j);return
    }
    if(j.op=="zip") {
      require(j.failures.isEmpty()) { "无法读取全部来源，未创建压缩包" }
      val target=File(storage.local(destination),SafeFiles.name(j.args.getString("name")))
      Archives.zip(sources.map{storage.local(it)},target,j.args.optInt("level",6)){checkpoint(j,it)}
      j.outputs.add(target.path);j.completed.addAll(sources);j.done=j.files;persist(context,j);return
    }
    if(j.op=="restore") {j.outputs.add(Trash.restore(context,j.args.getString("id")));return}
    for(source in sources) {
      checkpoint(j);if(j.failures.any{it.first==source}) continue
      j.current=source
      try {
        when(j.op) {
          "trash" -> Trash.put(context,storage.local(source))
          "delete" -> erase(source)
          else -> {
            val e=storage.stat(source)
            if(e.isDir) {
              require(destination!=source && !destination.startsWith(source.trimEnd('/')+"/")) { "不能复制到自身或子目录" }
              if(!storage.isDocument(source) && !storage.isRemote(source) && !storage.isDocument(destination) && !storage.isRemote(destination))
                require(!storage.local(destination).path.startsWith(storage.local(source).path+File.separator)) { "不能复制到自身或子目录" }
              if(storage.isDocument(source) && storage.isDocument(destination)) {
                val s=storage.document(source);val d=storage.document(destination)
                if(s.authority==d.authority) {val sid=android.provider.DocumentsContract.getDocumentId(s);val did=android.provider.DocumentsContract.getDocumentId(d)
                  require(did!=sid && !did.startsWith(sid+"/")) { "不能复制到自身或子目录" }}
              }
            }
            val existing=storage.list(destination).map{it.name}.toSet()
            var name=e.name
            if(name in existing) {
              if(j.args.optString("conflict","rename")=="skip") {j.completed.add(source);persist(context,j);continue}
              var suffix=1;val stem=e.name.substringBeforeLast('.',e.name);val ext=if(!e.isDir && '.' in e.name) "."+e.name.substringAfterLast('.') else ""
              while(name in existing) {name="${if(e.isDir) e.name else stem} (${suffix++})$ext";require(suffix<10000)}
            }
            captured.clear()
            val temp=copyTree(source,destination,".rhfiles-part-${j.id}-${UUID.randomUUID()}")
            val output=try {storage.rename(temp,name)} catch(e:Exception){cleanup(temp);throw e}
            j.outputs.add(output)
            // Persist before deleting the source. After interruption a user sees the committed output.
            persist(context,j)
            if(j.op=="move") {
              try {
                j.current="正在核验来源并完成移动：$source"
                // Verify source bytes again before removing anything. Never recursively
                // delete a fresh enumeration: it may contain files created after copying.
                for(c in captured.filter{!it.entry.isDir}) {
                  checkpoint(j);val digest=java.security.MessageDigest.getInstance("SHA-256")
                  storage.input(c.entry.path).use {input->val buffer=ByteArray(256*1024);while(true){checkpoint(j);val n=input.read(buffer);if(n<0)break;digest.update(buffer,0,n)}}
                  require(digest.digest().joinToString(""){"%02x".format(it)}==c.digest){"来源已修改，未删除：${c.entry.name}"}
                }
                for(c in captured.asReversed()) {
                  checkpoint(j);val now=storage.stat(c.entry.path)
                  require(now.isDir || (now.size==c.entry.size && now.modified==c.entry.modified)){"来源已修改，未删除：${c.entry.name}"}
                  storage.delete(c.entry.path)
                }
              } catch(e:Exception) {throw IOException("副本已完成：$output；原文件未完全移除：${e.message}")}
            }
          }
        }
        j.completed.add(source)
      } catch(e:Exception) {if(j.canceled) throw e;j.failures.add(source to (e.message ?: e.javaClass.simpleName))}
      persist(context,j)
    }
  }
}

/** Local trash stays on the original volume; no cross-volume delete disguised as a recycle operation. */
object Trash {
  private fun journal(c:Context)=File(c.filesDir,"trash-v1").apply{mkdirs()}
  @Synchronized fun put(c:Context,source:File) {
    SafeFiles.noLink(source)
    require(source.exists() && source.parentFile!=null && source.name!=".rhfiles-trash" && !source.path.contains("/.rhfiles-trash/")) { "不能移入回收站" }
    val storage=NativeStorage(c);storage.local(source.path)
    require(source.toPath().nameCount>2 && source!=android.os.Environment.getExternalStorageDirectory().canonicalFile) { "不能删除存储根目录" }
    val id=UUID.randomUUID().toString();val root=File(source.parentFile,".rhfiles-trash")
    require(!SafeFiles.isLink(root) && (root.mkdir() || root.isDirectory)) { "无法创建本卷回收站" }
    val target=File(root,id);val record=File(journal(c),"$id.json")
    val atomic=android.util.AtomicFile(record);val stream=atomic.startWrite()
    try{stream.write(JSONObject().put("id",id).put("original",source.path).put("path",target.path).put("name",source.name).put("at",System.currentTimeMillis()).toString().toByteArray());atomic.finishWrite(stream)}catch(e:Exception){atomic.failWrite(stream);throw e}
    try {SafeFiles.publish(source,target)} catch(e:Exception){record.delete();throw e}
  }
  fun list(c:Context)=JSONArray().also { a ->journal(c).listFiles()?.filter{it.extension=="json"}?.forEach {f->try {val j=JSONObject(f.readText());if(File(j.getString("path")).exists())a.put(j)}catch(_:Exception){}} }
  @Synchronized fun restore(c:Context,id:String):String {
    require(Regex("[0-9a-f-]{36}").matches(id))
    val record=File(journal(c),"$id.json");val j=JSONObject(record.readText());val storage=NativeStorage(c)
    val source=storage.local(j.getString("path"));val target=storage.local(j.getString("original"))
    SafeFiles.publish(source,target);record.delete();return target.path
  }
}
