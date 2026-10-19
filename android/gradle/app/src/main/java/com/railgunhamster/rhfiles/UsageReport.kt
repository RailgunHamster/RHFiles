package com.railgunhamster.rhfiles

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CancellationException

/** Disk-backed tree: no million-file Java object graph or unbounded WebView payload. */
internal class UsageReport(val file:File,val id:String,private val source:UsageSource,root:String,owner:String,
  private val maxEntries:Long=1_000_000,private val maxCacheBytes:Long=96L*1024*1024,restore:Boolean=false):AutoCloseable {
  private val db=SQLiteDatabase.openOrCreateDatabase(file,null).apply{enableWriteAheadLogging()}
  @Volatile var cancelRequested=false
  @Volatile private var snapshot=JSONObject()
  private var discovered=0L;private var processed=0L;private var issues=0L
  private var started=System.currentTimeMillis();private var indexed=0L;private var total=0L;private var lastSave=0L
  private var truncated=false;private var ready=false;private var phase="queued";private var current="";private var message=""
  private val rootPath:String;val pane:String
  init {
    if(restore){
      val stored=db.rawQuery("SELECT value FROM meta WHERE key='status'",null).use{check(it.moveToFirst());JSONObject(it.getString(0))}
      rootPath=stored.getString("root");pane=stored.getString("owner");started=stored.getLong("started")
      discovered=stored.optLong("discovered");processed=stored.optLong("processed");total=stored.optLong("total");issues=stored.optLong("issues");truncated=stored.optBoolean("truncated")
      phase=stored.getString("state");ready=stored.optBoolean("ready");message=stored.optString("message")
      if(phase in ACTIVE){phase="interrupted";ready=false;message="上次分析被系统中断，请重新分析；未完成的汇总不作为完整结果"}
      publish(true)
    }else{
      rootPath=root;pane=owner
      db.execSQL("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
      db.execSQL("CREATE TABLE nodes(id INTEGER PRIMARY KEY,parent INTEGER NOT NULL,path TEXT NOT NULL UNIQUE,name TEXT NOT NULL,folder INTEGER NOT NULL,own_bytes INTEGER NOT NULL,modified INTEGER NOT NULL,depth INTEGER NOT NULL,indexed INTEGER NOT NULL DEFAULT 0,bytes INTEGER NOT NULL DEFAULT 0,files INTEGER NOT NULL DEFAULT 0,dirs INTEGER NOT NULL DEFAULT 0,issues INTEGER NOT NULL DEFAULT 0,issue TEXT,kind TEXT NOT NULL)")
      db.execSQL("CREATE INDEX pending ON nodes(folder,indexed,id)")
      db.execSQL("CREATE INDEX children ON nodes(parent,bytes DESC,id)")
      db.execSQL("CREATE INDEX largest ON nodes(folder,bytes DESC,id)")
      publish(true)
    }
  }
  companion object {
    val ACTIVE=setOf("queued","indexing","analyzing","canceling")
    fun kind(name:String):String=when(name.substringAfterLast('.',"").lowercase()){
      "jpg","jpeg","png","gif","webp","bmp","heic","heif","avif","svg","tiff","raw","dng"->"image"
      "mp4","mkv","avi","mov","webm","3gp","m4v","wmv","flv","ts","mpg","mpeg"->"video"
      "mp3","flac","wav","aac","ogg","opus","m4a","ape","amr","wma"->"audio"
      "apk","apks","xapk","apkm"->"apps"
      "zip","rar","7z","tar","gz","xz","bz2","zst","iso","tgz"->"archive"
      "pdf","doc","docx","xls","xlsx","ppt","pptx","txt","md","epub","mobi","azw","azw3","rtf","csv"->"document"
      else->"other"
    }
  }
  fun status():JSONObject=JSONObject(snapshot.toString())
  fun cancel():JSONObject {cancelRequested=true;val next=status();if(next.optString("state") in ACTIVE)next.put("state","canceling");snapshot=next;return status()}
  private fun publish(save:Boolean=false) {
    val state=if(cancelRequested&&phase in ACTIVE)"canceling"else phase
    val value=JSONObject().put("id",id).put("owner",pane).put("root",rootPath).put("state",state).put("phase",phase)
      .put("started",started).put("updated",System.currentTimeMillis()).put("discovered",discovered).put("indexedFolders",indexed)
      .put("processed",processed).put("total",total).put("percent",if(total>0)(processed*100/total).coerceIn(0,100)else JSONObject.NULL)
      .put("issues",issues).put("truncated",truncated).put("ready",ready).put("current",current).put("message",message)
    snapshot=value
    val now=System.currentTimeMillis()
    if(save||now-lastSave>=1000){lastSave=now;try{db.execSQL("INSERT OR REPLACE INTO meta(key,value) VALUES('status',?)",arrayOf(value.toString()))}catch(_:Exception){/* Keep the final error/cancellation visible even if the cache volume is full. */}}
  }
  private fun insert(item:UsageItem,parent:Long,depth:Int):Long {
    SafeFiles.name(item.name)
    val values=ContentValues().apply{
      put("parent",parent);put("path",item.path);put("name",item.name);put("folder",if(item.directory)1 else 0)
      put("own_bytes",item.bytes);put("modified",item.modified);put("depth",depth);put("kind",if(item.directory)"folder"else kind(item.name))
      put("issue",item.issue);put("issues",if(item.issue==null)0 else 1)
    }
    val result=db.insertWithOnConflict("nodes",null,values,SQLiteDatabase.CONFLICT_IGNORE)
    if(result>=0){discovered++;if(item.issue!=null)issues++}
    return result
  }
  private fun issue(id:Long,text:String) {
    val previous=db.rawQuery("SELECT issue FROM nodes WHERE id=?",arrayOf(id.toString())).use{check(it.moveToFirst());if(it.isNull(0))null else it.getString(0)}
    if(previous==null){issues++;db.execSQL("UPDATE nodes SET issue=?,issues=issues+1 WHERE id=?",arrayOf<Any>(text.take(2048),id))}
  }
  private fun checkpoint(){if(cancelRequested)throw CancellationException("用户取消")}
  fun fail(text:String){phase="failed";message=text;publish(true)}
  fun run(notify:(JSONObject)->Unit={}) {
    try {
      if(cancelRequested){phase="canceled";publish(true);notify(status());return}
      phase="indexing";publish(true);notify(status())
      val root=source.root(rootPath);require(root.directory){"请选择文件夹进行分析"}
      insert(root.copy(name=root.name.ifBlank{"存储位置"}),0,0)
      try {
        while(true){
          checkpoint()
          if(file.length()+File(file.path+"-wal").length()>maxCacheBytes)throw ReportLimit()
          val next=db.rawQuery("SELECT id,path,depth FROM nodes WHERE folder=1 AND indexed=0 ORDER BY id LIMIT 1",null).use{if(!it.moveToFirst())null else Triple(it.getLong(0),it.getString(1),it.getInt(2))}?:break
          current=next.second
          if(next.third>=256)issue(next.first,"目录超过 256 层，未继续展开")
          else try {
            var batch=0;db.beginTransaction()
            try {source.children(next.second){child->
              checkpoint()
              if(discovered>=maxEntries)throw ReportLimit()
              if(insert(child,next.first,next.third+1)<0)issue(next.first,"目录中出现重复或循环条目，未重复展开")
              if(++batch%256==0){db.setTransactionSuccessful();db.endTransaction();db.beginTransaction();publish();notify(status());if(file.length()+File(file.path+"-wal").length()>maxCacheBytes)throw ReportLimit()}
            }}finally{db.setTransactionSuccessful();db.endTransaction()}
          }catch(e:CancellationException){throw e}catch(e:ReportLimit){throw e}catch(e:Exception){issue(next.first,e.message?:"目录读取失败")}
          db.execSQL("UPDATE nodes SET indexed=1 WHERE id=?",arrayOf(next.first));indexed++;publish();notify(status())
        }
      }catch(_:CancellationException){issue(1,"用户取消：结果仅包含已发现的项目")}
      catch(_:ReportLimit){truncated=true;issue(1,"达到报告安全上限，结果不完整；可进入子目录单独分析")}
      aggregate(notify)
      ready=true;phase=if(cancelRequested)"canceled"else"completed";current="";message=if(truncated)"达到安全上限，仅显示已分析部分"else if(issues>0)"部分项目未完整读取，请查看异常明细"else""
      publish(true);notify(status())
    }catch(e:Exception){fail(e.message?:"分析失败");notify(status())}
  }
  private class ReportLimit:RuntimeException()
  private data class Node(val id:Long,val parent:Long,val item:UsageItem,val bytes:Long,val files:Long,val dirs:Long,val issues:Long)
  private fun node(id:Long):Node=db.rawQuery("SELECT id,parent,path,name,folder,own_bytes,modified,issue,bytes,files,dirs,issues FROM nodes WHERE id=?",arrayOf(id.toString())).use{c->
    require(c.moveToFirst()){"报告目录不存在，请重新分析"}
    Node(c.getLong(0),c.getLong(1),UsageItem(c.getString(2),c.getString(3),c.getInt(4)==1,c.getLong(5),c.getLong(6),if(c.isNull(7))null else c.getString(7)),c.getLong(8),c.getLong(9),c.getLong(10),c.getLong(11))
  }
  private fun aggregate(notify:(JSONObject)->Unit) {
    phase="analyzing";total=discovered;publish(true);notify(status())
    var ceiling=Long.MAX_VALUE
    while(true){
      val ids=db.rawQuery("SELECT id FROM nodes WHERE id<? ORDER BY id DESC LIMIT 128",arrayOf(ceiling.toString())).use{c->buildList{while(c.moveToNext())add(c.getLong(0))}}
      if(ids.isEmpty())break
      db.beginTransaction()
      try {
        for(id in ids){
          val n=node(id);current=n.item.path
          if(n.item.directory)db.execSQL("UPDATE nodes SET dirs=dirs+1 WHERE id=?",arrayOf(id))
          else {
            var size=n.item.bytes;var modified=n.item.modified
            if(!cancelRequested&&n.item.issue==null)try{val measured=source.measure(n.item);check(measured.issue==null){measured.issue?:"无法读取"};require(measured.bytes>=0){"提供者未报告文件大小"};size=measured.bytes;modified=measured.modified}catch(e:Exception){size=0;issue(id,e.message?:"无法读取文件信息")}
            if(size<0){size=0;issue(id,"提供者未报告文件大小")}
            if(n.item.issue!=null)size=0
            db.execSQL("UPDATE nodes SET bytes=?,files=1,modified=? WHERE id=?",arrayOf(size,modified,id))
          }
          val measured=node(id)
          if(measured.parent!=0L){
            val parent=node(measured.parent);val size=try{Math.addExact(parent.bytes,measured.bytes)}catch(_:ArithmeticException){error("累计大小超出支持范围，未生成完整结果")}
            db.execSQL("UPDATE nodes SET bytes=?,files=files+?,dirs=dirs+?,issues=issues+? WHERE id=?",arrayOf(size,measured.files,measured.dirs,measured.issues,measured.parent))
          }
          processed++
        }
        db.setTransactionSuccessful()
      }finally{db.endTransaction()}
      ceiling=ids.last();publish();notify(status())
      require(file.length()+File(file.path+"-wal").length()<=maxCacheBytes){"分析缓存达到安全上限，汇总未完成；请按子目录重新分析"}
    }
  }
  private fun json(n:Node)=JSONObject().put("id",n.id).put("parentId",n.parent).put("path",n.item.path).put("name",n.item.name).put("isDir",n.item.directory)
    .put("parentPath",if(n.parent>0)node(n.parent).item.path else JSONObject.NULL)
    .put("kind",if(n.item.directory)"folder"else kind(n.item.name)).put("size",n.bytes).put("modifiedMs",n.item.modified)
    .put("files",n.files).put("directories",(n.dirs-if(n.item.directory)1 else 0).coerceAtLeast(0)).put("issues",n.issues).put("issue",n.item.issue?:JSONObject.NULL)
  fun page(parent:Long,view:String,offset:Int,limit:Int):JSONObject {
    require(ready){"分析尚未完成，或上次汇总被中断；请等待完成或重新分析"}
    require(parent>0&&offset>=0&&limit in 1..200&&view in listOf("folders","largest","types","issues")){"分析查询参数无效"}
    val current=node(parent);require(current.item.directory){"请选择报告中的文件夹"}
    val root=node(1);val result=JSONObject().put("status",status()).put("root",json(root)).put("folder",json(current))
    val breadcrumbs=JSONArray();val ancestors=mutableListOf<Node>();var ancestor=current
    while(true){ancestors.add(ancestor);if(ancestor.parent==0L)break;ancestor=node(ancestor.parent)}
    ancestors.asReversed().forEach{breadcrumbs.put(json(it))};result.put("breadcrumbs",breadcrumbs)
    // Subtree membership uses IDs, not string-prefix matching (SAF paths are not filesystem paths).
    val cte="WITH RECURSIVE subtree(id) AS (SELECT ? UNION ALL SELECT n.id FROM nodes n JOIN subtree s ON n.parent=s.id) "
    if(view=="types"){
      val groups=JSONArray();db.rawQuery(cte+"SELECT kind,SUM(bytes),COUNT(*) FROM nodes WHERE folder=0 AND id IN (SELECT id FROM subtree) GROUP BY kind ORDER BY SUM(bytes) DESC,kind",arrayOf(parent.toString())).use{c->while(c.moveToNext())groups.put(JSONObject().put("kind",c.getString(0)).put("bytes",c.getLong(1)).put("files",c.getLong(2)))}
      return result.put("groups",groups).put("entries",JSONArray()).put("hasMore",false)
    }
    val query=when(view){"folders"->"SELECT id FROM nodes WHERE parent=? ORDER BY bytes DESC,folder DESC,name COLLATE NOCASE,id LIMIT ? OFFSET ?";"largest"->cte+"SELECT id FROM nodes WHERE folder=0 AND id IN (SELECT id FROM subtree) ORDER BY bytes DESC,name COLLATE NOCASE,id LIMIT ? OFFSET ?";else->cte+"SELECT id FROM nodes WHERE issue IS NOT NULL AND id IN (SELECT id FROM subtree) ORDER BY id LIMIT ? OFFSET ?"}
    val ids=db.rawQuery(query,arrayOf(parent.toString(),(limit+1).toString(),offset.toString())).use{c->buildList{while(c.moveToNext())add(c.getLong(0))}}
    val entries=JSONArray();ids.take(limit).forEach{entries.put(json(node(it)))}
    return result.put("entries",entries).put("hasMore",ids.size>limit).put("offset",offset)
  }
  override fun close(){db.close()}
}
