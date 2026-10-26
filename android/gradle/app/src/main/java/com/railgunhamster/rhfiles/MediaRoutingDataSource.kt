package com.railgunhamster.rhfiles

import android.content.Context
import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener

@UnstableApi
internal class MediaRoutingDataSource(private val context:Context,private val remote:RemoteStorage):DataSource {
  private var delegate:DataSource?=null
  private val listeners=mutableListOf<TransferListener>()
  override fun addTransferListener(listener:TransferListener){listeners.add(listener);delegate?.addTransferListener(listener)}
  override fun open(spec:DataSpec):Long {
    val input=when(spec.uri.scheme){"remote"->RemoteMediaDataSource(remote);"rhvideo"->RhVideoDataSource(RhVideoClient.get(context));else->throw java.io.IOException("不支持的媒体来源")}
    delegate=input;listeners.forEach{input.addTransferListener(it)};return input.open(spec)
  }
  override fun getUri():Uri?=delegate?.uri
  override fun getResponseHeaders():Map<String,List<String>> = delegate?.responseHeaders?:emptyMap()
  override fun read(buffer:ByteArray,offset:Int,length:Int)=delegate?.read(buffer,offset,length)?:throw java.io.IOException("媒体未打开")
  override fun close(){val old=delegate;delegate=null;old?.close()}
}
