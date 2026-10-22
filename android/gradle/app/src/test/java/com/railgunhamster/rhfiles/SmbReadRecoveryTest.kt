package com.railgunhamster.rhfiles

import com.hierynomus.smbj.common.SMBRuntimeException
import java.io.IOException
import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject

class SmbReadRecoveryTest {
  private fun profile()=JSONObject().put("host","server-home").put("username","SERVER-HOME\\user").put("password","fixture-secret")
  @Test fun serverRootAndDifferentSharesReuseOneAuthenticationIdentity(){
    val c=profile();val key=RemoteStorage.readFingerprint(c)
    assertEquals(key,RemoteStorage.readFingerprint(c.put("share","Public").put("name","标签")))
    assertEquals(key,RemoteStorage.readFingerprint(c.put("share","Other").put("host","SERVER-HOME")))
    assertEquals(key,RemoteStorage.readFingerprint(c.put("username","user").put("domain","server-home")))
    assertFalse(key.contains("fixture-secret"))
  }
  @Test fun credentialsHostAndPortChangesCannotReuseOldSessions(){
    val key=RemoteStorage.readFingerprint(profile())
    for((field,value) in listOf("host" to "other","port" to 1445,"password" to "new-secret","username" to "other")){
      assertNotEquals(field,key,RemoteStorage.readFingerprint(profile().put(field,value)))
    }
  }
  @Test fun wrappedTransportFailuresRemainRetryableForReadOnlyCallers(){
    val original=SMBRuntimeException(IOException("socket lost"))
    val translated=RemoteStorage.readFailure(original,true)
    assertTrue(translated is IOException);assertSame(original,translated.cause)
  }
  @Test fun closedShareWithoutACauseIsRetryable(){
    assertTrue(RemoteStorage.readFailure(SMBRuntimeException("DiskShare has already been closed"),false) is IOException)
  }
  @Test fun permissionAndProtocolErrorsOnLiveResourcesAreNotRetried(){
    val denied=SMBRuntimeException("STATUS_ACCESS_DENIED")
    assertSame(denied,RemoteStorage.readFailure(denied,true))
  }
}
