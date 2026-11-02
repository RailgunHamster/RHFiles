package com.railgunhamster.rhfiles

import okhttp3.*
import okhttp3.mockwebserver.*
import okio.Buffer
import org.junit.*
import org.junit.Assert.*
import java.io.*
import java.security.MessageDigest
import java.util.concurrent.*
import java.util.concurrent.atomic.*

class RhFilesRangeInputTest {
  private val server=MockWebServer()
  private val client=OkHttpClient.Builder().retryOnConnectionFailure(false).readTimeout(2,TimeUnit.SECONDS).build()
  private val revision="v2-a-b-c-d-e-0"
  private val active=AtomicBoolean(true)
  private val counts=ConcurrentHashMap<Long,AtomicInteger>()
  private val diagnostics=CopyOnWriteArrayList<String>()
  private var bytes=ByteArray(2*RhFilesRangeInput.SEGMENT+713){((it*13+it/65536)%251).toByte()}
  private var fault:(Long,Int,MockResponse)->MockResponse={_,_,r->r}
  @Before fun setup(){
    server.dispatcher=object:okhttp3.mockwebserver.Dispatcher(){override fun dispatch(request:RecordedRequest):MockResponse {
      val match=Regex("bytes=(\\d+)-(\\d+)").matchEntire(request.getHeader("Range")!!)!!
      val start=match.groupValues[1].toLong();val end=match.groupValues[2].toLong()
      val n=counts.computeIfAbsent(start){AtomicInteger()}.incrementAndGet()
      assertEquals("\"$revision\"",request.getHeader("If-Match"))
      val part=bytes.copyOfRange(start.toInt(),end.toInt()+1)
      val hash=MessageDigest.getInstance("SHA-256").digest(part).joinToString(""){"%02x".format(it)}
      return fault(start,n,MockResponse().setResponseCode(206).setHeader("ETag","\"$revision\"").setHeader("Content-Range","bytes $start-$end/${bytes.size}").setHeader("X-RHFiles-Chunk-SHA256",hash).setBody(Buffer().write(part)))
    }};server.start()
  }
  @After fun stop(){server.shutdown();client.dispatcher.executorService.shutdownNow();client.connectionPool.evictAll()}
  private fun input(final:()->Unit={}):RhFilesRangeInput=RhFilesRangeInput(bytes.size.toLong(),revision,
    createCall={start,end->client.newCall(Request.Builder().url(server.url("/content")).header("Range","bytes=$start-$end").header("If-Match","\"$revision\"").build())},
    checkLease={if(!active.get())throw SecurityException("revoked")},verifyFinal=final,diagnostic={code,_->diagnostics.add(code)})
  @Test fun concurrentSegmentsKeepOrderAndShortTailAndOnlyVerifyAtEof(){
    val verified=AtomicInteger();fault={start,_,r->if(start==0L)r.setHeadersDelay(100,TimeUnit.MILLISECONDS)else r}
    input{verified.incrementAndGet()}.use{stream->assertArrayEquals(bytes,stream.readBytes());assertEquals(-1,stream.read());assertEquals(1,verified.get())}
    assertEquals(3,server.requestCount);assertTrue(counts.values.all{it.get()==1});assertTrue(diagnostics.contains("completed"))
  }
  @Test fun interruptedSegmentOnlyRepairsThatSegment(){
    fault={start,n,r->if(start==0L&&n==1)r.setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY)else r}
    input().use{assertArrayEquals(bytes,it.readBytes())}
    assertEquals(2,counts[0L]!!.get());assertEquals(1,counts[RhFilesRangeInput.SEGMENT.toLong()]!!.get());assertEquals(1,counts[(2L*RhFilesRangeInput.SEGMENT)]!!.get());assertTrue(diagnostics.contains("response_interrupted"))
  }
  @Test fun checksumFailureHasAFiniteRepairBudget(){
    bytes=ByteArray(1024){it.toByte()};fault={_,_,r->r.setHeader("X-RHFiles-Chunk-SHA256","0".repeat(64))}
    try{input().use{it.readBytes()};fail("Bad bytes accepted")}catch(_:IOException){}
    assertEquals(3,server.requestCount);assertFalse(diagnostics.contains("completed"))
  }
  @Test fun aFullResponseToRangeOrWrongVersionIsNeverSplicedOrRetried(){
    bytes=ByteArray(1024)
    for(kind in listOf("status","etag","range")){
      val before=server.requestCount
      fault={_,_,r->when(kind){"status"->r.setResponseCode(200);"etag"->r.setHeader("ETag","\"other\"");else->r.setHeader("Content-Range","bytes 1-1024/1025")}}
      try{input().use{it.readBytes()};fail("Invalid range accepted")}catch(_:IOException){}
      assertEquals(before+1,server.requestCount)
    }
  }
  @Test fun permissionFailureNeverRepairsAndBufferedBytesAreDiscardedAfterRevocation(){
    bytes=ByteArray(1024);fault={_,_,r->r.setResponseCode(403)}
    try{input().use{it.readBytes()};fail("403 accepted")}catch(_:IOException){}
    assertEquals(1,server.requestCount)
    fault={_,_,r->r};input().use{stream->assertTrue(stream.read(ByteArray(1))>0);active.set(false);try{stream.read();fail("Revoked buffer delivered")}catch(_:SecurityException){}}
    assertFalse(diagnostics.contains("completed"))
  }
  @Test fun finalRevisionCheckFailureNeverReportsSuccess(){
    bytes=ByteArray(1024)
    try{input{throw IOException("source replaced")}.use{it.readBytes()};fail("Stale source accepted")}catch(_:IOException){}
    assertFalse(diagnostics.contains("completed"))
  }
  @Test fun closingCancelsBlockedHttpWithoutLeavingAWorkerOrJobLease(){
    bytes=ByteArray(1024);fault={_,_,_->MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE)}
    val stream=input();assertNotNull(server.takeRequest(5,TimeUnit.SECONDS));stream.close()
    val executor=Executors.newSingleThreadExecutor()
    try{fault={_,_,r->r};val result=executor.submit<ByteArray>{input().use{it.readBytes()}};assertArrayEquals(bytes,result.get(5,TimeUnit.SECONDS))}finally{executor.shutdownNow()}
  }
}
