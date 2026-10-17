package com.railgunhamster.rhfiles

import com.rapid7.client.dcerpc.messages.RequestCall
import com.rapid7.client.dcerpc.messages.RequestResponse
import com.rapid7.client.dcerpc.mssrvs.messages.NetrShareEnumResponse
import com.rapid7.client.dcerpc.mssrvs.objects.ShareEnumStruct
import com.rapid7.client.dcerpc.mssrvs.objects.ShareInfoContainer
import com.rapid7.client.dcerpc.mssrvs.objects.ShareInfo1
import com.rapid7.client.dcerpc.objects.WChar
import com.rapid7.client.dcerpc.transport.RPCTransport
import org.junit.Test
import org.junit.Assert.*
import java.io.IOException

class SmbSharesTest {
  private data class Page(val names:List<String>,val code:Int=0,val resume:Long?=null)
  private class Transport(val page:(Int)->Page):RPCTransport(){
    var calls=0
    private fun field(owner:Class<*>,target:Any,name:String,value:Any?){owner.getDeclaredField(name).apply{isAccessible=true}.set(target,value)}
    override fun <T:RequestResponse> call(request:RequestCall<T>):T {
      val page=page(calls++);val response=request.responseObject
      val container=ShareInfoContainer.ShareInfo1Container()
      val entries=page.names.map{ShareInfo1().apply{netName=WChar.NullTerminated.of(it);type=0}}.toTypedArray()
      field(ShareInfoContainer::class.java,container,"buffer",entries)
      val struct=ShareEnumStruct.ShareEnumStruct1();field(ShareEnumStruct::class.java,struct,"shareInfoContainer",container)
      field(NetrShareEnumResponse::class.java,response,"shareEnumStruct",struct);field(NetrShareEnumResponse::class.java,response,"resumeHandle",page.resume)
      field(RequestResponse::class.java,response,"returnValue",page.code);return response
    }
    override fun transact(input:ByteArray,output:ByteArray):Int=error("Unexpected network call")
    override fun read(output:ByteArray):Int=error("Unexpected network call")
    override fun write(input:ByteArray){error("Unexpected network call")}
  }
  @Test fun paginatedUnicodeSharesUseTheReturnedContinuationHandle(){
    val transport=Transport{if(it==0)Page(listOf("Public"),234,7)else Page(listOf("中文 #共享"))}
    assertEquals(listOf("Public","中文 #共享"),SmbShares(transport).list().map{it.name});assertEquals(2,transport.calls)
  }
  @Test fun emptySuccessAndAccessDeniedAreDifferentResults(){
    assertTrue(SmbShares(Transport{Page(emptyList())}).list().isEmpty())
    try{SmbShares(Transport{Page(emptyList(),5)}).list();fail()}catch(_:IOException){}
  }
  @Test fun stuckMissingAndCyclicContinuationHandlesFailWithoutPartialSuccess(){
    for(transport in listOf(Transport{Page(listOf("a"),234,0)},Transport{Page(listOf("a"),234,null)},Transport{Page(listOf("a"),234,if(it%2==0)7 else 8)})){
      try{SmbShares(transport).list();fail()}catch(_:IOException){};assertTrue(transport.calls<=3)
    }
  }
  @Test fun totalShareAndPageLimitsBoundEnumeration(){
    val oversized=Transport{Page(List(4097){"share$it"})};try{SmbShares(oversized).list();fail()}catch(_:IOException){}
    val endless=Transport{Page(emptyList(),234,it.toLong()+1)};try{SmbShares(endless).list();fail()}catch(_:IOException){};assertEquals(64,endless.calls)
  }
}
