package com.railgunhamster.rhfiles
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.InputStream

class PdfReadSessionTest {
  @Test fun readsOnlyRequestedBytes(){var consumed=0;val source=object:InputStream(){override fun read():Int{consumed++;return 65}};assertEquals(1024,PdfReadSession.bounded(source,1024).size);assertEquals(1024,consumed)}
  @Test fun rejectsShortAndStalledReads(){for(source in listOf(ByteArrayInputStream(byteArrayOf(1)),object:InputStream(){override fun read()=0;override fun read(b:ByteArray,o:Int,n:Int)=0})){try{PdfReadSession.bounded(source,3);fail("Incomplete range accepted")}catch(_:IllegalArgumentException){}}}
  @Test fun rejectsUnboundedAllocations(){for(size in listOf(0,-1,1024*1024+1)){try{PdfReadSession.bounded(ByteArrayInputStream(byteArrayOf()),size);fail("Unbounded allocation accepted")}catch(_:IllegalArgumentException){}}}
  @Test fun fallbackSkipHandlesProvidersThatCannotSkip(){val source=object:ByteArrayInputStream(byteArrayOf(1,2,3,4)){override fun skip(n:Long)=0L};PdfReadSession.skip(source,2);assertEquals(3,source.read())}
  @Test fun skipFailsInsteadOfLoopingAtEof(){try{PdfReadSession.skip(ByteArrayInputStream(byteArrayOf(1)),5);fail("Offset past EOF accepted")}catch(_:IllegalArgumentException){}}
}
