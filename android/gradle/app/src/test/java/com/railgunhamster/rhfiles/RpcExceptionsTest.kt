package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import java.io.IOException

class RpcExceptionsTest {
  @Test fun codecExceptionsPreserveJvmConstructorsAndIoCauseSemantics(){
    val cause=IOException("fixture")
    for(type in listOf(RpcMarshalException::class.java,RpcUnmarshalException::class.java)){
      assertTrue(IOException::class.java.isAssignableFrom(type))
      assertEquals("invalid packet",type.getConstructor(String::class.java).newInstance("invalid packet").message)
      assertSame(cause,type.getConstructor(String::class.java,Exception::class.java).newInstance("invalid packet",cause).cause)
    }
  }
}
