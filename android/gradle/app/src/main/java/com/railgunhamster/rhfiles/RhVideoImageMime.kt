package com.railgunhamster.rhfiles

import okio.BufferedSource
import java.util.concurrent.TimeUnit

/** The upstream filename/MIME registry is not an image decoder. Inspect a
 * bounded prefix, without consuming it, before exposing a local image URL. */
internal object RhVideoImageMime {
  private const val MAX_PREFIX=64
  fun detect(bytes:ByteArray,count:Int=bytes.size,claimed:String=""):String? {
    fun at(offset:Int,text:String):Boolean {
      if(offset+text.length>count)return false
      return text.indices.all{bytes[offset+it].toInt() and 255==text[it].code}
    }
    return when {
      at(0,"\u0089PNG\r\n\u001a\n")->"image/png"
      at(0,"\u00ff\u00d8\u00ff")->"image/jpeg"
      at(0,"RIFF")&&at(8,"WEBP")->"image/webp"
      at(0,"GIF87a")||at(0,"GIF89a")->"image/gif"
      at(0,"BM")->"image/bmp"
      at(0,"\u0000\u0000\u0001\u0000")->"image/x-icon"
      at(0,"II*\u0000")||at(0,"MM\u0000*")->"image/tiff"
      count>=12&&at(4,"ftyp")&&(at(8,"avif")||at(8,"avis")||(16..count-4 step 4).any{at(it,"avif")||at(it,"avis")})->"image/avif"
      claimed.substringBefore(';').trim().equals("image/svg+xml",true)->{
        val prefix=String(bytes,0,count,Charsets.UTF_8).removePrefix("\uFEFF").trimStart()
        if(Regex("^<svg(?:\\s|>|/)|^<\\?xml(?:\\s|\\?)").containsMatchIn(prefix))"image/svg+xml"else null
      }
      else->null
    }
  }
  fun sniff(source:BufferedSource,claimed:String):String {
    val timeout=source.timeout();val deadline=if(timeout.hasDeadline())timeout.deadlineNanoTime()else null
    val limit=System.nanoTime()+TimeUnit.SECONDS.toNanos(5)
    timeout.deadlineNanoTime(if(deadline==null)limit else minOf(deadline,limit))
    try {
      val peek=source.peek();val bytes=ByteArray(MAX_PREFIX);var count=0
      while(count<bytes.size){
        val n=peek.read(bytes,count,bytes.size-count);if(n<0)break;count+=n
        detect(bytes,count,claimed)?.let{return it}
      }
      return detect(bytes,count,claimed)?:throw IllegalArgumentException("图片内容无效或格式不支持")
    }finally{if(deadline==null)timeout.clearDeadline()else timeout.deadlineNanoTime(deadline)}
  }
}
