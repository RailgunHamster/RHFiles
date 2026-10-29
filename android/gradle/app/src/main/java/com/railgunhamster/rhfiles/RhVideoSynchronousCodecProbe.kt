package com.railgunhamster.rhfiles

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.mediacodec.MediaCodecAdapter

/** Explicit QA build only. Vary codec queueing, not codecs, samples, surfaces,
 * audio startup, buffer capacity, retry policy or user playback semantics.
 * Uses the maintained public DefaultRenderersFactory switch; no reflection
 * into the platform or private codec fields. Default builds never construct it. */
@UnstableApi
internal class RhVideoSynchronousCodecProbe(context:Context,private val diagnostics:RhVideoInputDiagnostics):DefaultRenderersFactory(context){
  init{forceDisableMediaCodecAsynchronousQueueing()}
  override fun getCodecAdapterFactory():MediaCodecAdapter.Factory=observe(super.getCodecAdapterFactory(),diagnostics)
  companion object {
    fun observe(delegate:MediaCodecAdapter.Factory,diagnostics:RhVideoInputDiagnostics):MediaCodecAdapter.Factory {
      if(!diagnostics.enabled)return delegate
      return MediaCodecAdapter.Factory{configuration->
        val adapter=delegate.createAdapter(configuration)
        diagnostics.recordCodecAdapter(configuration.format.sampleMimeType,adapter.javaClass.name)
        adapter
      }
    }
  }
}
