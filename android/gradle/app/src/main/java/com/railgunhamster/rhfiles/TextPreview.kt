package com.railgunhamster.rhfiles

import java.io.InputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject

/** Bounded, read-only previews. A viewing stream never starts a transfer task. */
object TextPreview {
  const val LIMIT=1024*1024
  data class Content(val text:String,val encoding:String,val truncated:Boolean,val bytesRead:Int)
  internal fun decode(bytes:ByteArray,truncated:Boolean):Content {
    val signature=bytes.take(4).map{it.toInt() and 255}
    require(!(signature in listOf(listOf(0x50,0x4b,3,4),listOf(0x50,0x4b,5,6),listOf(0x50,0x4b,7,8),listOf(0x7f,0x45,0x4c,0x46),listOf(0x25,0x50,0x44,0x46)))) {"这是二进制文件，不能作为文本预览"}
    var skip=0
    val encoding=when {
      bytes.size>=3&&bytes[0]==0xef.toByte()&&bytes[1]==0xbb.toByte()&&bytes[2]==0xbf.toByte()->{skip=3;"UTF-8"}
      bytes.size>=2&&bytes[0]==0xff.toByte()&&bytes[1]==0xfe.toByte()->{skip=2;"UTF-16LE"}
      bytes.size>=2&&bytes[0]==0xfe.toByte()&&bytes[1]==0xff.toByte()->{skip=2;"UTF-16BE"}
      else->"UTF-8"
    }
    if(encoding=="UTF-8")require(bytes.none{it==0.toByte()}){"这是二进制文件，不能作为文本预览"}
    fun convert(name:String):String? {
      val decoder=Charset.forName(name).newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
      for(trim in 0..if(truncated)3 else 0) {
        if(bytes.size-skip-trim<0)continue
        try{return decoder.reset().decode(ByteBuffer.wrap(bytes,skip,bytes.size-skip-trim)).toString()}catch(_:java.nio.charset.CharacterCodingException){}
      }
      return null
    }
    var actual=encoding
    val text=convert(encoding)?:if(encoding=="UTF-8")convert("GB18030")?.also{actual="GB18030"}else null
    require(text!=null){"无法识别文本编码（支持 UTF-8、带 BOM 的 UTF-16、GB18030）"}
    require(text.none{it=='\u0000'}&&text.count{it<' '&&it !in "\n\r\t\u000c"}<=maxOf(0,text.length/100)){"文件内容包含二进制数据，未作为文本显示"}
    return Content(text,actual,truncated,bytes.size)
  }
  internal fun read(input:InputStream,maxBytes:Int):Content {
    require(maxBytes in 1..LIMIT){"预览读取上限无效"}
    val output=ByteArrayOutputStream(minOf(maxBytes,8192));val buffer=ByteArray(8192)
    while(output.size()<maxBytes){val count=input.read(buffer,0,minOf(buffer.size,maxBytes-output.size()));if(count<0)return decode(output.toByteArray(),false);check(count>0){"文本读取没有进展"};output.write(buffer,0,count)}
    return decode(output.toByteArray(),input.read()!=-1)
  }
  private class Request {val cancelled=AtomicBoolean();val stream=AtomicReference<InputStream?>();fun close(){cancelled.set(true);try{stream.getAndSet(null)?.close()}catch(_:Exception){}}}
  private val requests=ConcurrentHashMap<String,Request>()
  private val timer=Executors.newSingleThreadScheduledExecutor {r->Thread(r,"RHFiles-text-timeout").apply{isDaemon=true}}
  fun cancel(id:String):Boolean {requests[id]?.close();return true}
  fun preview(storage:NativeStorage,path:String,id:String,maxBytes:Int):JSONObject {
    require(id.length in 1..100){"预览请求标识无效"};require(maxBytes in 1..LIMIT){"预览读取上限无效"}
    val request=Request();require(requests.putIfAbsent(id,request)==null){"预览请求正在执行"}
    val timeout=timer.schedule({request.close()},20,TimeUnit.SECONDS)
    try {
      // mediaInput closes partially-read FTP/SMB/HTTP streams without requiring
      // the remainder of a large remote file to be transferred first.
      val stream=if(storage.isRemote(path))storage.remote.mediaInput(path).stream else storage.input(path)
      request.stream.set(stream);if(request.cancelled.get()){request.close();error("预览已取消或读取超时")}
      val result=stream.use{read(it,maxBytes)}
      check(!request.cancelled.get()){"预览已取消或读取超时"}
      return JSONObject().put("text",result.text).put("encoding",result.encoding).put("truncated",result.truncated).put("bytesRead",result.bytesRead).put("maxBytes",maxBytes)
    }finally{timeout.cancel(false);request.close();requests.remove(id,request)}
  }
}
