package com.railgunhamster.rhfiles

import android.os.Build
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.util.Util
import androidx.media3.exoplayer.audio.AudioOutput
import androidx.media3.exoplayer.audio.AudioOutputProvider
import androidx.media3.exoplayer.audio.AudioTrackAudioOutput
import androidx.media3.exoplayer.audio.ForwardingAudioOutputProvider

/** QA build only: vary the initial PCM waterline without changing buffer
 * capacity, samples, codecs, volume, clocks, retry policy or video scheduling.
 * Uses Media3's public AudioTrack access, not reflection or a deprecated sink.
 * The normal build never constructs this provider. */
@UnstableApi
internal class RhVideoAudioStartProbe(provider:AudioOutputProvider,private val milliseconds:Int,private val diagnostics:RhVideoInputDiagnostics):ForwardingAudioOutputProvider(provider) {
  companion object {
    fun thresholdFrames(sampleRate:Int,capacity:Int,milliseconds:Int):Int {
      require(sampleRate>0&&capacity>0&&milliseconds in 1..100)
      return (sampleRate.toLong()*milliseconds/1000).coerceIn(1,capacity.toLong()).toInt()
    }
  }
  override fun getAudioOutput(config:AudioOutputProvider.OutputConfig):AudioOutput {
    check(Build.VERSION.SDK_INT>=31){"Audio start experiment requires Android 12 or newer"}
    val output=super.getAudioOutput(config)
    try {
      check(Util.isEncodingLinearPcm(config.encoding)){"Audio start experiment requires decoded PCM"}
      check(output is AudioTrackAudioOutput){"Audio start experiment requires platform AudioTrack output"}
      val track=output.audioTrack
      val capacity=track.bufferCapacityInFrames
      val before=track.startThresholdInFrames
      val requested=thresholdFrames(track.sampleRate,capacity,milliseconds)
      val after=track.setStartThresholdInFrames(requested)
      diagnostics.recordAudioStartExperiment(before,after,requested,capacity,track.bufferSizeInFrames,track.sampleRate,milliseconds)
      return output
    } catch(error:Exception){output.release();throw error}
  }
}
