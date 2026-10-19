package com.railgunhamster.rhfiles

import com.hierynomus.smbj.common.SMBRuntimeException
import java.io.IOException
import org.junit.Test
import org.junit.Assert.*

class SmbReadRecoveryTest {
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
