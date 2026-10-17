package com.railgunhamster.rhfiles

import com.rapid7.client.dcerpc.mssrvs.ServerService
import com.rapid7.client.dcerpc.mssrvs.messages.NetrShareEnumRequest
import com.rapid7.client.dcerpc.mserref.SystemErrorCode
import com.rapid7.client.dcerpc.transport.RPCTransport
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Bound untrusted SRVSVC pagination instead of accumulating unlimited pages. */
internal class SmbShares(transport:RPCTransport):ServerService(transport) {
  fun list():List<RemoteStorage.SmbShare> {
    val result=mutableListOf<RemoteStorage.SmbShare>();var resume=0L;val seen=hashSetOf(0L)
    val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15)
    repeat(64){
      if(System.nanoTime()>deadline)throw IOException("列出共享超时")
      val response=callExpect(NetrShareEnumRequest.NetShareEnumRequest1(65536,resume),"NetrShareEnum[1]",SystemErrorCode.ERROR_SUCCESS,SystemErrorCode.ERROR_MORE_DATA)
      val entries=response.shareEnumStruct?.shareInfoContainer?.buffer?:emptyArray()
      if(result.size+entries.size>4096)throw IOException("服务器共享超过 4096 项，请指定共享名")
      for(entry in entries)result.add(RemoteStorage.SmbShare(parseWChar(entry.netName)?:throw IOException("共享名称无效"),entry.type))
      if(SystemErrorCode.ERROR_SUCCESS.`is`(response.returnValue))return result
      resume=response.resumeHandle?:throw IOException("共享分页缺少继续标识")
      if(!seen.add(resume))throw IOException("共享分页没有前进，已停止")
    }
    throw IOException("共享分页过多，请指定共享名")
  }
}
