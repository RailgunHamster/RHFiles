package com.railgunhamster.rhfiles
import org.junit.Test
import org.junit.Assert.*
import java.nio.ByteBuffer

class SmbHostsTest {
  @Test fun windowsUsernamesSplitDomainWithoutLosingUser(){
    assertEquals("Administrator" to "SERVER-HOME",SmbHosts.credentials("SERVER-HOME\\Administrator",""))
    assertEquals("Administrator" to "SERVER-HOME",SmbHosts.credentials("SERVER-HOME\\Administrator","server-home"))
    assertEquals("user@example.com" to "",SmbHosts.credentials("user@example.com",""))
    try{SmbHosts.credentials("A\\user","B");fail("Conflicting domains accepted")}catch(_:IllegalArgumentException){}
  }
  @Test fun encodesFileServerNameQuery(){val query=SmbHosts.query("server-home",0x1234);assertEquals(50,query.size);assertEquals(0x1234,ByteBuffer.wrap(query).short.toInt());assertEquals(32,query[12].toInt());assertEquals(0x20,query[47].toInt());assertEquals(1,query[49].toInt())}
  private fun response(id:Int):ByteArray {val b=ByteBuffer.allocate(30);b.putShort(id.toShort()).putShort(0x8500.toShort()).putShort(0).putShort(1).putShort(0).putShort(0).putShort(0xc00c.toShort()).putShort(0x20).putShort(1).putInt(30).putShort(6).putShort(0).put(byteArrayOf(192.toByte(),168.toByte(),0,2));return b.array()}
  @Test fun validatesNameServiceTransactionAndBounds(){
    assertEquals("192.168.0.2",SmbHosts.answers(response(123),123).single().hostAddress)
    assertTrue(SmbHosts.answers(response(123),124).isEmpty())
    val response=response(123);for(size in response.indices)assertTrue(SmbHosts.answers(response.copyOf(size),123).isEmpty())
    assertTrue(SmbHosts.answers(response.apply{this[3]=3},123).isEmpty())
  }
  @Test fun reportsEmptyAndNestedFailures(){
    assertTrue(updateFailure(Exception("")).contains("Exception"))
    assertTrue(updateFailure(Exception("",java.net.UnknownHostException("SERVER-HOME"))).contains("局域网 IP"))
    assertTrue(updateFailure(Exception("STATUS_LOGON_FAILURE")).contains("登录"))
    assertTrue(updateFailure(java.net.SocketTimeoutException()).contains("超时"))
  }
}
