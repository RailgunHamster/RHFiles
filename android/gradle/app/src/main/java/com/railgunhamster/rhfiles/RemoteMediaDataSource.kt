package com.railgunhamster.rhfiles

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSpec
import java.io.IOException

/** Credentials stay in RemoteStorage. Only opaque remote:// IDs reach Media3. */
@UnstableApi
internal class RemoteMediaDataSource(private val storage:RemoteStorage):BaseDataSource(true) {
  private var input:RemoteStorage.MediaInput?=null;private var uri:Uri?=null;private var remaining=C.LENGTH_UNSET.toLong();private var opened=false
  override fun open(dataSpec:DataSpec):Long {
    transferInitializing(dataSpec)
    try {
      uri=dataSpec.uri;require(uri?.scheme=="remote"){"无效的网络媒体路径"}
      val media=storage.mediaInput(dataSpec.uri.toString(),dataSpec.position);input=media
      remaining=if(dataSpec.length!=C.LENGTH_UNSET.toLong())dataSpec.length else if(media.totalLength>=0)media.totalLength-dataSpec.position else C.LENGTH_UNSET.toLong()
      opened=true;transferStarted(dataSpec);return remaining
    }catch(error:Exception){try{close()}catch(_:Exception){};throw if(error is IOException)error else IOException(error.message,error)}
  }
  override fun getUri():Uri?=uri
  override fun read(buffer:ByteArray,offset:Int,length:Int):Int {
    if(length==0)return 0;if(remaining==0L)return C.RESULT_END_OF_INPUT
    try {
      val count=input?.stream?.read(buffer,offset,if(remaining<0)length else minOf(length.toLong(),remaining).toInt())?:throw IOException("媒体流未打开")
      if(count<0){if(remaining>0)throw java.io.EOFException("远程媒体提前结束");return C.RESULT_END_OF_INPUT}
      if(remaining>0)remaining-=count;bytesTransferred(count);return count
    }catch(error:Exception){throw if(error is IOException)error else IOException(error.message,error)}
  }
  override fun close(){val media=input;input=null;uri=null;try{media?.close()}finally{if(opened){opened=false;transferEnded()}}}
}
