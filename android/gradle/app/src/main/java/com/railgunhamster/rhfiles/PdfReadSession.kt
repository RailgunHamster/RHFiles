package com.railgunhamster.rhfiles

import android.util.Base64
import org.json.JSONObject
import java.io.InputStream
import java.io.FileInputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Read-only, expiring capabilities. A PDF preview never creates a download or
 * a working copy. RemoteStorage supplies actual seek/range reads for each protocol. */
internal class PdfReadSession(private val storage:NativeStorage,private val remote:RemoteStorage=storage.remote):AutoCloseable {
  private fun stat(path:String)=if(storage.isRemote(path))remote.stat(path)else storage.stat(path)
  private class Source(val entry:NativeEntry) {
    val closed=AtomicBoolean(false)
    @Volatile var touched=System.nanoTime()
    val streams=ConcurrentHashMap.newKeySet<InputStream>()
    fun close(){closed.set(true);for(stream in streams)try{stream.close()}catch(_:Exception){};streams.clear()}
  }
  private val sources=ConcurrentHashMap<String,Source>()
  private val timer=Executors.newSingleThreadScheduledExecutor{r->Thread(r,"RHFiles-PDF-read-timeout").apply{isDaemon=true}}
  @Synchronized fun open(path:String):JSONObject {
    for((id,source)in sources)if(source.closed.get()||System.nanoTime()-source.touched>TimeUnit.MINUTES.toNanos(30)){sources.remove(id,source);source.close()}
    require(sources.size<4){"请先关闭其他 PDF 阅读窗口"}
    val entry=stat(path)
    require(!entry.isDir&&entry.name.endsWith(".pdf",true)){"不是 PDF 文件"}
    require(entry.size in 1..1024L*1024*1024){"PDF 大小未知、为空或超过 1 GB，无法按需预览"}
    val id=UUID.randomUUID().toString();sources[id]=Source(entry)
    return JSONObject().put("id",id).put("length",entry.size).put("name",entry.name)
  }
  fun release(id:String):Boolean {sources.remove(id)?.close();return true}
  fun read(id:String,offset:Long,length:Int):JSONObject {
    val source=sources[id]?:error("PDF 阅读请求已结束")
    require(!source.closed.get()&&System.nanoTime()-source.touched<=TimeUnit.MINUTES.toNanos(30)){"PDF 阅读请求已过期，请重新打开"}
    source.touched=System.nanoTime()
    val entry=source.entry
    require(length in 1..1024*1024&&offset>=0&&offset<entry.size&&length.toLong()<=entry.size-offset){"PDF 分段范围无效"}
    fun unchanged(){val actual=stat(entry.path);require(!actual.isDir&&actual.size==entry.size&&actual.modified==entry.modified){"PDF 在阅读期间发生改变，请重新打开"}}
    unchanged()
    val input=if(storage.isRemote(entry.path)){
      val media=remote.mediaInput(entry.path,offset)
      if(media.totalLength>=0&&media.totalLength!=entry.size){media.close();error("PDF 长度在阅读期间发生改变")};media.stream
    }else{
      val stream=storage.input(entry.path)
      try{if(stream is FileInputStream)stream.channel.position(offset)else skip(stream,offset);stream}catch(e:Exception){stream.close();throw e}
    }
    source.streams.add(input)
    val expired=AtomicBoolean(false)
    val timeout=timer.schedule({expired.set(true);try{input.close()}catch(_:Exception){}},20,TimeUnit.SECONDS)
    try{
      check(!source.closed.get()){"PDF 已关闭"}
      val bytes=input.use{bounded(it,length)}
      check(!expired.get()&&!source.closed.get()){"PDF 已关闭或读取超时"};unchanged()
      return JSONObject().put("data",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("offset",offset)
    }finally{timeout.cancel(false);source.streams.remove(input);try{input.close()}catch(_:Exception){}}
  }
  override fun close(){for(source in sources.values)source.close();sources.clear();timer.shutdownNow()}
  companion object {
    internal fun bounded(input:InputStream,length:Int):ByteArray {
      require(length in 1..1024*1024)
      val bytes=ByteArray(length);var at=0
      while(at<length){val count=input.read(bytes,at,length-at);require(count>0){"PDF 分段读取提前结束"};at+=count}
      return bytes
    }
    internal fun skip(input:InputStream,offset:Long){var left=offset;while(left>0){val n=input.skip(left);if(n>0)left-=n else {require(input.read()!=-1){"PDF 偏移超出文件"};left--}}}
  }
}
