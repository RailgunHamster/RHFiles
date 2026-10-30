package com.railgunhamster.rhfiles

import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.util.ReflectionHelpers
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoDataSourceTest {
  private lateinit var server:MockWebServer
  private lateinit var client:RhVideoClient
  @Before fun setup(){
    server=MockWebServer();server.start()
    val context=RuntimeEnvironment.getApplication()
    context.getSharedPreferences("rhvideo-client-v1",0).edit().clear().commit()
    client=RhVideoClient(context)
    server.enqueue(MockResponse().setHeader("Content-Type","application/json").setBody("""{"access_token":"test-source-token"}"""))
    client.connect(JSONObject().put("server",server.url("/").toString()).put("username","source-qa").put("password","fixture-only"))
    assertEquals("/api/v1/auth/login",server.takeRequest(5,TimeUnit.SECONDS)?.path)
  }
  @After fun cleanup(){client.logout();server.shutdown()}
  private fun spec(position:Long=0):DataSpec {
    val path=client.playback(JSONObject().put("id","one")).path
    return DataSpec.Builder().setUri(path).setPosition(position).build()
  }
  @Test fun interruptingAnOpenWaitingForResponseHeadersCancelsWithoutWaitingForTheReadTimeout(){
    val source=RhVideoDataSource(client);val request=spec()
    server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
    val done=CountDownLatch(1);val result=AtomicReference<Throwable?>()
    val worker=Thread({
      try{source.open(request);result.set(AssertionError("An interrupted open unexpectedly succeeded"))}
      catch(error:Throwable){result.set(error)}
      finally{source.close();done.countDown()}
    },"rhvideo-open-cancellation-qa")
    worker.start()
    try{
      assertEquals("/api/v1/videos/one/play",server.takeRequest(5,TimeUnit.SECONDS)?.path)
      worker.interrupt()
      assertTrue("A cancelled native input still waits for response headers",done.await(2,TimeUnit.SECONDS))
      assertTrue("Interrupted open must fail as I/O",result.get() is java.io.IOException)
      assertEquals(2,server.requestCount)
    }finally{
      // On a red run cancel only this fixture client's calls; do not leave its
      // deliberately silent socket/thread alive or alter a product timeout.
      ReflectionHelpers.getField<OkHttpClient>(client,"mediaHttp").dispatcher.cancelAll()
      worker.interrupt();worker.join(3000);assertFalse("Fixture worker leaked",worker.isAlive)
    }
  }
  @Test fun anExactEndOfResourceProbeIsAnEmptyInputRatherThanAPlaybackError(){
    val source=RhVideoDataSource(client)
    server.enqueue(MockResponse().setResponseCode(416).setHeader("Content-Range","bytes */10").setBody("private upstream error"))
    try{
      assertEquals(0L,source.open(spec(10)))
      assertEquals(C.RESULT_END_OF_INPUT,source.read(ByteArray(1),0,1))
    }finally{source.close()}
    assertEquals("bytes=10-",server.takeRequest(5,TimeUnit.SECONDS)?.getHeader("Range"))
    assertEquals(2,server.requestCount)
  }
  @Test fun anExactEndProbeWithAnExplicitLengthStillReadsImmediateEof(){
    val source=RhVideoDataSource(client)
    server.enqueue(MockResponse().setResponseCode(416).setHeader("Content-Range","BYTES */00010").setBody("private upstream error"))
    try{
      assertEquals(5L,source.open(spec(10).buildUpon().setLength(5).build()))
      assertEquals(C.RESULT_END_OF_INPUT,source.read(ByteArray(5),0,5))
    }finally{source.close()}
    assertEquals("bytes=10-",server.takeRequest(5,TimeUnit.SECONDS)?.getHeader("Range"))
    assertEquals(2,server.requestCount)
  }
  @Test fun anUnrelatedOrInvalid416CannotMasqueradeAsTheEndOfThisInput(){
    val headers=listOf("bytes */9","bytes */11","bytes */secret","bytes */+10","bytes */9223372036854775808","bytes 0-9/10","items */10","bytes */10 private")
    for(header in headers){
      val source=RhVideoDataSource(client)
      server.enqueue(MockResponse().setResponseCode(416).setHeader("Content-Range",header).setBody("private upstream error"))
      try{source.open(spec(10));fail("Invalid/out-of-range probe succeeded: $header")}
      catch(error:java.io.IOException){assertFalse(error.message.orEmpty().contains("private upstream error"))}
      finally{source.close()}
      assertEquals("bytes=10-",server.takeRequest(5,TimeUnit.SECONDS)?.getHeader("Range"))
    }
    assertEquals(1+headers.size,server.requestCount)
  }
  @Test fun anAlreadyInterruptedLoaderDoesNotSendTheNativeRequest(){
    val source=RhVideoDataSource(client);val request=spec();val done=CountDownLatch(1)
    val result=AtomicReference<Throwable?>();val interrupted=java.util.concurrent.atomic.AtomicBoolean()
    val worker=Thread({
      Thread.currentThread().interrupt()
      try{source.open(request);result.set(AssertionError("A pre-cancelled input opened"))}
      catch(error:Throwable){result.set(error)}
      finally{interrupted.set(Thread.currentThread().isInterrupted);source.close();done.countDown()}
    },"rhvideo-pre-cancelled-loader-qa")
    worker.start()
    try{
      assertTrue("A pre-cancelled loader blocked",done.await(2,TimeUnit.SECONDS))
      assertTrue(result.get() is java.io.IOException);assertTrue(interrupted.get())
      assertEquals("Cancellation cannot send or replay a GET",1,server.requestCount)
    }finally{
      ReflectionHelpers.getField<OkHttpClient>(client,"mediaHttp").dispatcher.cancelAll()
      worker.interrupt();worker.join(3000);assertFalse("Fixture worker leaked",worker.isAlive)
    }
  }
}
