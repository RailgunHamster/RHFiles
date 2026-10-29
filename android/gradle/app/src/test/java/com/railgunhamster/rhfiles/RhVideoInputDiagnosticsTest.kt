package com.railgunhamster.rhfiles

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.Timeline
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.ByteArrayDataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.exoplayer.DecoderCounters
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.source.LoadEventInfo
import androidx.media3.exoplayer.source.MediaLoadData
import java.io.IOException
import java.util.concurrent.atomic.AtomicLong
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoInputDiagnosticsTest {
  private val source=ByteArrayDataSource(byteArrayOf(1))
  private val spec=DataSpec.Builder().setUri(Uri.parse("https://private.invalid/private-name.mp4?token=secret-capability")).setPosition(1536).setHttpRequestHeaders(mapOf("Authorization" to "Bearer secret-bearer")).build()
  private fun event()=AnalyticsListener.EventTime(0,Timeline.EMPTY,0,null,0,Timeline.EMPTY,0,null,0,0)
  @Test fun disabledDiagnosticsDoNotReadTheClockOrProduceAReceipt(){
    val diagnostic=RhVideoInputDiagnostics(false){error("Disabled diagnostics must not sample")}
    diagnostic.onTransferInitializing(source,spec,true);diagnostic.onTransferStart(source,spec,true);diagnostic.onBytesTransferred(source,spec,true,42);diagnostic.onTransferEnd(source,spec,true)
    diagnostic.onVideoDecoderInitialized(event(),"c2.android.avc.decoder",100,90);assertNull(diagnostic.snapshot(null,null))
  }
  @Test fun tracksRealTransferredBytesAndUnknownStagesWithoutKeepingAddresses(){
    val clock=AtomicLong(1000);val diagnostic=RhVideoInputDiagnostics(true){clock.get()}
    val initial=diagnostic.snapshot(null,null)!!;assertTrue(initial.isNull("firstByteAtMs"));assertTrue(initial.isNull("videoDecoder"));assertTrue(initial.isNull("videoCounters"))
    diagnostic.onTransferInitializing(source,spec,true);diagnostic.onTransferStart(source,spec,true);clock.set(1123);diagnostic.onBytesTransferred(source,spec,true,7);clock.set(1190);diagnostic.onBytesTransferred(source,spec,true,11);diagnostic.onTransferEnd(source,spec,true)
    val result=diagnostic.snapshot(null,null)!!;assertEquals(18,result.getLong("bytesRead"));assertEquals(123,result.getLong("firstByteAtMs"));assertEquals(190,result.getLong("lastByteAtMs"));assertEquals(1536,result.getLong("lastOpenPosition"));assertEquals(1,result.getLong("transfersStarted"));assertEquals(1,result.getLong("transfersEnded"))
    for(secret in listOf("private.invalid","private-name","secret-capability","secret-bearer","Authorization"))assertFalse(result.toString().contains(secret))
  }
  @Test fun retainsProducerDecoderTimingSeparatelyFromDelayedCallbackDelivery(){
    val clock=AtomicLong(1000);val diagnostic=RhVideoInputDiagnostics(true){clock.get()};clock.set(1600)
    diagnostic.onVideoDecoderInitialized(event(),"c2.android.avc.decoder",1300,97);diagnostic.onAudioDecoderInitialized(event(),"c2.android.aac.decoder",1400,81)
    diagnostic.onAudioUnderrun(event(),8192,100,50);val result=diagnostic.snapshot(null,null)!!;val video=result.getJSONObject("videoDecoder")
    assertEquals("c2.android.avc.decoder",video.getString("name"));assertEquals(300,video.getLong("initializedAtMs"));assertEquals(600,video.getLong("callbackAtMs"));assertEquals(97,video.getLong("initializationDurationMs"));assertEquals(400,result.getJSONObject("audioDecoder").getLong("initializedAtMs"));assertEquals(1,result.getLong("audioUnderruns"))
    video.put("name","mutated copy");assertEquals("c2.android.avc.decoder",diagnostic.snapshot(null,null)!!.getJSONObject("videoDecoder").getString("name"))
  }
  @Test fun countersAreActualMedia3NumbersAndMissingDecodersAreNotReportedAsZero(){
    val diagnostic=RhVideoInputDiagnostics(true){1000};val counters=DecoderCounters().apply{decoderInitCount=1;decoderReleaseCount=0;queuedInputBufferCount=123;skippedInputBufferCount=17;renderedOutputBufferCount=2;skippedOutputBufferCount=101;droppedInputBufferCount=3;droppedBufferCount=4}
    val result=diagnostic.snapshot(counters,null)!!;val video=result.getJSONObject("videoCounters")
    assertEquals(123,video.getInt("queuedInput"));assertEquals(2,video.getInt("renderedOutput"));assertEquals(101,video.getInt("skippedOutput"));assertEquals(3,video.getInt("droppedInput"));assertEquals(4,video.getInt("droppedTotal"));assertTrue(result.isNull("audioCounters"))
  }
  @Test fun concurrentLoaderCallbacksCannotLoseTransferredBytes(){
    val clock=AtomicLong(1000);val diagnostic=RhVideoInputDiagnostics(true){clock.getAndIncrement()};val workers=List(4){Thread{repeat(1000){diagnostic.onBytesTransferred(source,spec,true,64)}}}
    workers.forEach{it.start()};workers.forEach{it.join()};val result=diagnostic.snapshot(null,null)!!;assertEquals(256000,result.getLong("bytesRead"));assertEquals(1,result.getLong("firstByteAtMs"));assertEquals(4000,result.getLong("lastByteAtMs"))
  }
  @Test fun lateEventsFromARetiredDecoderCannotPolluteAnotherIncarnation(){
    val old=RhVideoInputDiagnostics(true){1000};val next=RhVideoInputDiagnostics(true){1000};old.onBytesTransferred(source,spec,true,999);old.onAudioDecoderInitialized(event(),"old.decoder",1000,1)
    val result=next.snapshot(null,null)!!;assertEquals(0,result.getLong("bytesRead"));assertTrue(result.isNull("audioDecoder"));assertNotEquals(old.snapshot(null,null)!!.getLong("epoch"),result.getLong("epoch"))
  }
  @Test fun diagnosticSizeIsBoundedAndLoadErrorsCannotRetainServerMessages(){
    val diagnostic=RhVideoInputDiagnostics(true){1000};val load=LoadEventInfo(1,spec,0);val data=MediaLoadData(C.DATA_TYPE_MEDIA)
    repeat(10000){diagnostic.onLoadError(event(),load,data,IOException("https://private.invalid/secret-capability Bearer secret-bearer"),false)}
    diagnostic.onVideoDecoderInitialized(event(),"https://private.invalid/"+"secret-capability".repeat(100),1000,1)
    val result=diagnostic.snapshot(null,null)!!;assertEquals(10000,result.getLong("loadErrors"));assertEquals("IOException",result.getString("lastLoadErrorClass"));assertEquals("unrecognized-codec",result.getJSONObject("videoDecoder").getString("name"));assertTrue(result.toString().length<2048)
    for(secret in listOf("private.invalid","secret-capability","secret-bearer"))assertFalse(result.toString().contains(secret))
  }
}
