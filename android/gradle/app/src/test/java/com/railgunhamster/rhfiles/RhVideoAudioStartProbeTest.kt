package com.railgunhamster.rhfiles

import androidx.media3.common.util.UnstableApi
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoAudioStartProbeTest {
  @Test fun thresholdIsPcmFramesNotBytesOrCapacity(){
    assertEquals(960,RhVideoAudioStartProbe.thresholdFrames(48000,24000,20))
    assertEquals(882,RhVideoAudioStartProbe.thresholdFrames(44100,22050,20))
  }
  @Test fun thresholdNeverExceedsPlatformCapacityOrRoundsToZero(){
    assertEquals(100,RhVideoAudioStartProbe.thresholdFrames(48000,100,20))
    assertEquals(1,RhVideoAudioStartProbe.thresholdFrames(1,24000,1))
    assertEquals(214748364,RhVideoAudioStartProbe.thresholdFrames(Int.MAX_VALUE,Int.MAX_VALUE,100))
  }
  @Test fun invalidExperimentCannotSilentlyProduceAThreshold(){
    for(args in listOf(listOf(0,24000,20),listOf(48000,0,20),listOf(48000,24000,0),listOf(48000,24000,101))) {
      assertThrows(IllegalArgumentException::class.java){RhVideoAudioStartProbe.thresholdFrames(args[0],args[1],args[2])}
    }
  }
  @Test fun receiptKeepsRequestedAndActualThresholdAndOriginalCapacitySeparate(){
    val diagnostic=RhVideoInputDiagnostics(true){0}
    assertTrue(diagnostic.snapshot(null,null)!!.isNull("audioStartExperiment"))
    diagnostic.recordAudioStartExperiment(24000,1024,960,24000,24000,48000,20)
    val receipt=diagnostic.snapshot(null,null)!!.getJSONObject("audioStartExperiment")
    assertEquals(24000,receipt.getInt("beforeFrames"));assertEquals(1024,receipt.getInt("afterFrames"));assertEquals(960,receipt.getInt("requestedFrames"))
    assertEquals(24000,receipt.getInt("capacityFrames"));assertEquals(24000,receipt.getInt("bufferSizeFrames"));assertEquals(48000,receipt.getInt("sampleRate"));assertEquals(20,receipt.getInt("requestedMs"))
    receipt.put("afterFrames",1);assertEquals(1024,diagnostic.snapshot(null,null)!!.getJSONObject("audioStartExperiment").getInt("afterFrames"))
    val disabled=RhVideoInputDiagnostics(false){error("Disabled diagnostic must not read clock")};disabled.recordAudioStartExperiment(1,1,1,1,1,1,1);assertNull(disabled.snapshot(null,null))
  }
}
