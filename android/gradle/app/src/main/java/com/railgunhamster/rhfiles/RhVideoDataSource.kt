package com.railgunhamster.rhfiles

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSpec
import java.io.IOException

/** Range-based native playback; opaque IDs only, bearer never reaches Media3. */
@UnstableApi
internal class RhVideoDataSource(private val client:RhVideoClient):BaseDataSource(true){
  private var media:RhVideoClient.Media?=null
  private var uri:Uri?=null
  private var remaining=C.LENGTH_UNSET.toLong()
  private var opened=false
  override fun open(spec:DataSpec):Long {
    transferInitializing(spec)
    try{
      require(spec.uri.scheme=="rhvideo"&&spec.uri.host?.matches(Regex("[a-f0-9-]{36}"))==true&&spec.uri.path.isNullOrEmpty()&&spec.uri.query==null){"无效的 RHVideo 媒体连接"}
      uri=spec.uri;val input=client.media(spec.uri.host!!,spec.position,false);media=input
      remaining=if(spec.length!=C.LENGTH_UNSET.toLong())spec.length else input.length
      opened=true;transferStarted(spec);return remaining
    }catch(e:Exception){close();throw IOException(e.message,e)}
  }
  override fun getUri():Uri?=uri
  override fun read(buffer:ByteArray,offset:Int,length:Int):Int {
    if(length==0)return 0;if(remaining==0L)return C.RESULT_END_OF_INPUT
    val size=media?.stream?.read(buffer,offset,if(remaining<0)length else minOf(length.toLong(),remaining).toInt())?:throw IOException("媒体未打开")
    if(size<0){if(remaining>0)throw java.io.EOFException("视频读取中断");return C.RESULT_END_OF_INPUT}
    if(remaining>0)remaining-=size;bytesTransferred(size);return size
  }
  override fun close(){val old=media;media=null;uri=null;try{old?.close()}finally{if(opened){opened=false;transferEnded()}}}
}
