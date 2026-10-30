package com.railgunhamster.rhfiles

import android.os.SystemClock
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.PlaybackException
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import androidx.media3.exoplayer.DecoderCounters
import androidx.media3.exoplayer.ExoTimeoutException
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.source.LoadEventInfo
import androidx.media3.exoplayer.source.MediaLoadData
import org.json.JSONObject
import org.json.JSONArray
import java.io.IOException
import java.util.concurrent.atomic.AtomicLong

/** One decoder incarnation only. No media addresses, headers, exception
 * messages, retained event queues, file I/O, playback changes or retries.
 * Transfer callbacks can run on loaders; analytics callbacks use the player's
 * application thread, where snapshot is read as well. */
@UnstableApi
internal class RhVideoInputDiagnostics(val enabled:Boolean,private val now:()->Long={SystemClock.elapsedRealtime()}):AnalyticsListener,TransferListener {
  companion object {private val sequence=AtomicLong()}
  private val epoch=sequence.incrementAndGet()
  private val created=if(enabled)now()else 0
  private val initializations=AtomicLong();private val starts=AtomicLong();private val ends=AtomicLong();private val bytes=AtomicLong()
  private val firstByte=AtomicLong(-1);private val lastByte=AtomicLong(-1);private val openPosition=AtomicLong(-1)
  private var video:JSONObject?=null;private var audio:JSONObject?=null
  private var underruns=0L;private var loadErrors=0L;private var lastLoadError:String?=null
  private var lastPlaybackError:JSONObject?=null
  @Volatile private var audioStartExperiment:String?=null
  @Volatile private var audioAdapter:String?=null
  @Volatile private var videoAdapter:String?=null
  fun recordCodecAdapter(mime:String?,name:String){
    if(!enabled)return
    val value=if(name.matches(Regex("[A-Za-z0-9_.$]{1,192}")))name else "unrecognized-adapter"
    when{mime?.startsWith("audio/")==true->audioAdapter=value;mime?.startsWith("video/")==true->videoAdapter=value}
  }
  fun recordAudioStartExperiment(before:Int,after:Int,requested:Int,capacity:Int,bufferSize:Int,sampleRate:Int,milliseconds:Int){
    if(enabled)audioStartExperiment=JSONObject().put("beforeFrames",before).put("afterFrames",after).put("requestedFrames",requested)
      .put("capacityFrames",capacity).put("bufferSizeFrames",bufferSize).put("sampleRate",sampleRate).put("requestedMs",milliseconds).toString()
  }
  private fun elapsed()=(now()-created).coerceAtLeast(0)
  private fun value(time:Long):Any=if(time<0)JSONObject.NULL else time
  private fun decoder(name:String,at:Long,duration:Long)=JSONObject()
    .put("name",if(name.matches(Regex("[A-Za-z0-9_.-]{1,96}")))name else "unrecognized-codec")
    .put("initializedAtMs",(at-created).coerceAtLeast(0)).put("callbackAtMs",elapsed()).put("initializationDurationMs",duration)
  override fun onVideoDecoderInitialized(eventTime:AnalyticsListener.EventTime,decoderName:String,initializedTimestampMs:Long,initializationDurationMs:Long){if(enabled)video=decoder(decoderName,initializedTimestampMs,initializationDurationMs)}
  override fun onAudioDecoderInitialized(eventTime:AnalyticsListener.EventTime,decoderName:String,initializedTimestampMs:Long,initializationDurationMs:Long){if(enabled)audio=decoder(decoderName,initializedTimestampMs,initializationDurationMs)}
  override fun onAudioUnderrun(eventTime:AnalyticsListener.EventTime,bufferSize:Int,bufferSizeMs:Long,elapsedSinceLastFeedMs:Long){if(enabled)underruns++}
  override fun onLoadError(eventTime:AnalyticsListener.EventTime,loadEventInfo:LoadEventInfo,mediaLoadData:MediaLoadData,error:IOException,wasCanceled:Boolean){if(enabled){loadErrors++;lastLoadError=error.javaClass.simpleName.take(80)}}
  override fun onPlayerError(eventTime:AnalyticsListener.EventTime,error:PlaybackException){
    if(!enabled)return
    val classes=JSONArray();var cause:Throwable?=error;var timeout:Int?=null
    // Retain one bounded, sanitized receipt, never messages/stack traces or
    // the Throwable (which can retain private addresses and player graphs).
    repeat(5){
      val current=cause?:return@repeat
      val name=current.javaClass.name
      classes.put(if(name.matches(Regex("[A-Za-z0-9_.$]{1,192}")))name else "unrecognized-error")
      if(timeout==null&&current is ExoTimeoutException)timeout=current.timeoutOperation
      cause=current.cause
    }
    lastPlaybackError=JSONObject().put("atMs",elapsed()).put("code",error.errorCode)
      .put("causeClasses",classes).put("timeoutOperation",timeout?:JSONObject.NULL)
  }
  override fun onTransferInitializing(source:DataSource,dataSpec:DataSpec,isNetwork:Boolean){if(enabled){initializations.incrementAndGet();openPosition.set(dataSpec.position)}}
  override fun onTransferStart(source:DataSource,dataSpec:DataSpec,isNetwork:Boolean){if(enabled)starts.incrementAndGet()}
  override fun onBytesTransferred(source:DataSource,dataSpec:DataSpec,isNetwork:Boolean,bytesTransferred:Int){if(enabled&&bytesTransferred>0){bytes.addAndGet(bytesTransferred.toLong());val time=elapsed();firstByte.updateAndGet{if(it<0)time else minOf(it,time)};lastByte.updateAndGet{maxOf(it,time)}}}
  override fun onTransferEnd(source:DataSource,dataSpec:DataSpec,isNetwork:Boolean){if(enabled)ends.incrementAndGet()}
  private fun counters(value:DecoderCounters?):Any {
    if(value==null)return JSONObject.NULL
    value.ensureUpdated()
    return JSONObject().put("initialized",value.decoderInitCount).put("released",value.decoderReleaseCount)
      .put("queuedInput",value.queuedInputBufferCount).put("skippedInput",value.skippedInputBufferCount)
      .put("renderedOutput",value.renderedOutputBufferCount).put("skippedOutput",value.skippedOutputBufferCount)
      .put("droppedInput",value.droppedInputBufferCount).put("droppedTotal",value.droppedBufferCount)
  }
  fun snapshot(videoCounters:DecoderCounters?,audioCounters:DecoderCounters?):JSONObject? {
    if(!enabled)return null
    return JSONObject().put("epoch",epoch).put("elapsedMs",elapsed())
      .put("transferInitializations",initializations.get()).put("transfersStarted",starts.get()).put("transfersEnded",ends.get()).put("bytesRead",bytes.get())
      .put("firstByteAtMs",value(firstByte.get())).put("lastByteAtMs",value(lastByte.get())).put("lastOpenPosition",value(openPosition.get()))
      .put("videoDecoder",video?.let{JSONObject(it.toString())}?:JSONObject.NULL).put("audioDecoder",audio?.let{JSONObject(it.toString())}?:JSONObject.NULL)
      .put("videoCounters",counters(videoCounters)).put("audioCounters",counters(audioCounters)).put("audioUnderruns",underruns)
      .put("loadErrors",loadErrors).put("lastLoadErrorClass",lastLoadError?:JSONObject.NULL)
      .put("lastPlaybackError",lastPlaybackError?.let{JSONObject(it.toString())}?:JSONObject.NULL)
      .put("audioStartExperiment",audioStartExperiment?.let{JSONObject(it)}?:JSONObject.NULL)
      .put("codecAdapters",if(audioAdapter==null&&videoAdapter==null)JSONObject.NULL else JSONObject().put("audio",audioAdapter?:JSONObject.NULL).put("video",videoAdapter?:JSONObject.NULL))
  }
}
