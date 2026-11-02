package com.railgunhamster.rhfiles

import okhttp3.Call
import java.io.*
import java.net.SocketTimeoutException
import java.security.MessageDigest
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.SSLException

/** File-task reader only. Media seeks/thumbnail loading keep their streaming
 * transport. At most two jobs and four range workers exist in this process. */
internal class RhFilesRangeInput(
  private val size:Long, private val revision:String, private val parallelism:Int=2,
  private val bytesPerSecond:Long=0,
  private val createCall:(Long,Long)->Call,
  private val checkLease:()->Unit,
  private val verifyFinal:()->Unit,
  private val diagnostic:(String,Int)->Unit={_,_->}
):InputStream() {
  companion object {
    const val SEGMENT=8*1024*1024
    private val jobs=Semaphore(2,true)
    private val workers=Executors.newFixedThreadPool(4){r->Thread(r,"RHFiles-range").apply{isDaemon=true}}
  }
  private class InvalidRange(message:String):IOException(message)
  private class InvalidDigest:IOException("分段 SHA-256 校验失败")
  private val closed=AtomicBoolean(false)
  private val calls=ConcurrentHashMap.newKeySet<Call>()
  private val repairs=AtomicInteger()
  private val queue=ArrayDeque<Future<ByteArray>>()
  private val waiting=java.util.concurrent.atomic.AtomicReference<Future<ByteArray>?>()
  private var nextOffset=0L
  private var current=byteArrayOf()
  private var position=0
  private var delivered=0L
  private var eof=false
  private var acquired=false
  private val began=System.nanoTime()
  init {
    require(size in 1..1099511627776L&&parallelism in 1..4&&bytesPerSecond in 0..10_000_000_000L)
    try {
      while(!jobs.tryAcquire(100,TimeUnit.MILLISECONDS))check()
      acquired=true;check();fill()
    }catch(e:Exception){close();throw e}
  }
  private fun check(){
    if(closed.get()||Thread.currentThread().isInterrupted)throw InterruptedIOException("文件下载已停止")
    checkLease()
  }
  @Synchronized private fun fill(){while(!closed.get()&&queue.size<parallelism&&nextOffset<size){val start=nextOffset;val length=minOf(SEGMENT.toLong(),size-start);queue.addLast(workers.submit<ByteArray>{part(start,length)});nextOffset+=length}}
  private fun part(start:Long,length:Long):ByteArray {
    for(attempt in 0..2){
      check()
      try{return fetch(start,length)}catch(e:IOException){
        check()
        val repairable=e is InvalidDigest || e !is InvalidRange&&e !is RhFilesConnection.HttpFailure&&e !is SSLException&&(e !is InterruptedIOException||e is SocketTimeoutException)
        if(!repairable||attempt==2||!claimRepair())throw e
        diagnostic(if(e is InvalidDigest)"checksum_mismatch"else if(e is SocketTimeoutException)"read_timeout"else"response_interrupted",attempt+1)
        Thread.sleep(100L*(attempt+1))
      }
    }
    throw IOException("分段补传已达到上限")
  }
  private fun claimRepair():Boolean {while(true){val old=repairs.get();if(old>=8)return false;if(repairs.compareAndSet(old,old+1))return true}}
  private fun fetch(start:Long,length:Long):ByteArray {
    val end=start+length-1
    val call=createCall(start,end);calls.add(call)
    try {
      check()
      call.execute().use {r->
        if(!r.isSuccessful)throw RhFilesConnection.HttpFailure(r.code,"下载失败：HTTP ${r.code}")
        if(r.code!=206||r.header("Content-Range")!="bytes $start-$end/$size"||r.header("ETag")!="\"$revision\""||r.header("Content-Length")?.toLongOrNull()!=length||r.header("Content-Encoding").let{it!=null&&!it.equals("identity",true)})throw InvalidRange("分段范围、版本、长度或编码不一致，未拼接")
        val expected=r.header("X-RHFiles-Chunk-SHA256")?.takeIf{it.matches(Regex("[0-9a-fA-F]{64}"))}?:throw InvalidRange("分段缺少 SHA-256 校验值")
        val output=ByteArray(length.toInt());val input=r.body?.byteStream()?:throw IOException("缺少文件正文");var at=0
        while(at<output.size){check();val n=input.read(output,at,minOf(256*1024,output.size-at));if(n<=0)throw EOFException("分段提前结束");at+=n}
        if(input.read()!=-1)throw InvalidRange("分段超过请求长度")
        check()
        val actual=MessageDigest.getInstance("SHA-256").digest(output)
        val digest=expected.chunked(2).map{it.toInt(16).toByte()}.toByteArray()
        if(!MessageDigest.isEqual(actual,digest))throw InvalidDigest()
        return output
      }
    }finally{calls.remove(call);if(closed.get())call.cancel()}
  }
  override fun read():Int {val b=ByteArray(1);return if(read(b,0,1)==-1)-1 else b[0].toInt() and 255}
  override fun read(buffer:ByteArray,offset:Int,length:Int):Int {
    require(offset>=0&&length>=0&&offset<=buffer.size-length)
    try {
      check();if(length==0)return 0;if(eof)return -1
      if(position==current.size){
        current=byteArrayOf();position=0
        val future=synchronized(this){if(queue.isEmpty())null else queue.removeFirst().also{waiting.set(it)}}
        if(future==null){
          check(delivered==size){"下载长度不完整"};verifyFinal();check();eof=true
          diagnostic("completed",repairs.get());releaseJob();return -1
        }
        while(true){check();try{current=future.get(100,TimeUnit.MILLISECONDS);break}catch(_:TimeoutException){}}
        waiting.set(null)
        fill()
      }
      val n=minOf(length,current.size-position)
      if(bytesPerSecond>0){
        val target=((delivered+n).toDouble()/bytesPerSecond*1e9).toLong()
        while(target-(System.nanoTime()-began)>0){check();Thread.sleep(minOf(100L,TimeUnit.NANOSECONDS.toMillis(target-(System.nanoTime()-began)).coerceAtLeast(1)))}
      }
      current.copyInto(buffer,offset,position,position+n);position+=n;delivered+=n;return n
    }catch(e:Exception){
      close()
      val cause=if(e is ExecutionException)e.cause?:e else e
      if(cause is IOException)throw cause
      if(cause is SecurityException)throw cause
      throw IOException(cause.message?:"分段下载失败",cause)
    }
  }
  @Synchronized private fun releaseJob(){if(acquired){acquired=false;jobs.release()}}
  override fun close(){if(closed.compareAndSet(false,true)){calls.forEach{it.cancel()};waiting.getAndSet(null)?.cancel(true);synchronized(this){queue.forEach{it.cancel(true)};queue.clear()};releaseJob()}}
}
