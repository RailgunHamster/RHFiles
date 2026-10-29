package com.railgunhamster.rhfiles

import android.media.MediaFormat
import androidx.media3.common.Format
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.mediacodec.MediaCodecAdapter
import androidx.media3.exoplayer.mediacodec.MediaCodecInfo
import java.io.IOException
import java.lang.reflect.Proxy
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoSynchronousCodecProbeTest {
  private fun configuration():MediaCodecAdapter.Configuration {
    val mime="audio/mp4a-latm";val info=MediaCodecInfo.newInstance("fixture.aac",mime,mime,null,false,true,false,false,false)
    return MediaCodecAdapter.Configuration.createForAudioDecoding(info,MediaFormat.createAudioFormat(mime,48000,2),Format.Builder().setSampleMimeType(mime).build(),null,null)
  }
  @Test fun observerReturnsTheActualAdapterAndPassesTheUnmodifiedConfigurationExactlyOnce(){
    val configuration=configuration();val adapter=Proxy.newProxyInstance(MediaCodecAdapter::class.java.classLoader,arrayOf(MediaCodecAdapter::class.java)){_,method,_->error("No codec operation should be performed by an observer: ${method.name}")} as MediaCodecAdapter
    var calls=0;val diagnostic=RhVideoInputDiagnostics(true){1000}
    val wrapped=RhVideoSynchronousCodecProbe.observe(MediaCodecAdapter.Factory{received->calls++;assertSame(configuration,received);adapter},diagnostic)
    assertSame(adapter,wrapped.createAdapter(configuration));assertEquals(1,calls)
    assertEquals(adapter.javaClass.name,diagnostic.snapshot(null,null)!!.getJSONObject("codecAdapters").getString("audio"));assertTrue(diagnostic.snapshot(null,null)!!.getJSONObject("codecAdapters").isNull("video"))
  }
  @Test fun failedCreationIsNotReplayedAndCannotInventAnAdapterReceipt(){
    val diagnostic=RhVideoInputDiagnostics(true){1000};val error=IOException("fixture creation failure");var calls=0
    val wrapped=RhVideoSynchronousCodecProbe.observe(MediaCodecAdapter.Factory{calls++;throw error},diagnostic)
    try{wrapped.createAdapter(configuration());fail("Expected the real factory error")}catch(actual:IOException){assertSame(error,actual)}
    assertEquals(1,calls);assertTrue(diagnostic.snapshot(null,null)!!.isNull("codecAdapters"))
  }
  @Test fun disabledObserverRetainsTheOriginalFactoryWithoutCreatingAnything(){
    val delegate=MediaCodecAdapter.Factory{error("No creation expected")};assertSame(delegate,RhVideoSynchronousCodecProbe.observe(delegate,RhVideoInputDiagnostics(false){error("No clock sampling expected")}))
  }
  @Test fun separateAdaptersRemainBoundedAndDoNotRetainUntrustedNames(){
    val diagnostic=RhVideoInputDiagnostics(true){1000};diagnostic.recordCodecAdapter("video/avc","actual.VideoAdapter");diagnostic.recordCodecAdapter("audio/mp4a-latm","https://secret.invalid/"+"token".repeat(1000));diagnostic.recordCodecAdapter("text/plain","ignored.Adapter")
    val state=diagnostic.snapshot(null,null)!!;val adapters=state.getJSONObject("codecAdapters");assertEquals("actual.VideoAdapter",adapters.getString("video"));assertEquals("unrecognized-adapter",adapters.getString("audio"));assertFalse(state.toString().contains("secret.invalid"));assertTrue(state.toString().length<2048)
    assertTrue(RhVideoInputDiagnostics(true){1000}.snapshot(null,null)!!.isNull("codecAdapters"))
  }
}
