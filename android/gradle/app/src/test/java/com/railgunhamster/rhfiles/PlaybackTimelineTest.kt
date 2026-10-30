package com.railgunhamster.rhfiles

import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import java.lang.reflect.Proxy
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class PlaybackTimelineTest {
  // Execute the Activity's production mapping, not a second test formula.
  // The engine boundary permits only a duration read, never seek/control.
  private fun position(position:Long,start:Long=0,end:Long=-1,before:Long=0,duration:Long?=20000):Long {
    val activity=PlaybackActivity()
    if(duration!=null){
      val engine=Proxy.newProxyInstance(ExoPlayer::class.java.classLoader,arrayOf(ExoPlayer::class.java)){_,method,_->
        when(method.name){"getDuration"->duration;else->error("Progress reads cannot call ${method.name}")}
      }
      PlaybackActivity::class.java.getDeclaredField("player").apply{isAccessible=true}.set(activity,engine)
    }
    val window=RhVideoClient.Window(listOf(PlaybackQueue.Item("rhvideo://owned-timeline","test")),0,0,1,
      JSONObject().put("fullLength",true),listOf(start),listOf(end),listOf("test"),listOf(before),20000,"lease",1)
    val method=PlaybackActivity::class.java.getDeclaredMethod("rhQueuePosition",RhVideoClient.Window::class.java,Int::class.javaPrimitiveType,Long::class.javaPrimitiveType).apply{isAccessible=true}
    return method.invoke(activity,window,0,position) as Long
  }
  @Test fun ordinaryFullLengthPositionIsNotClampedToAnUnknownMinusOneEnd(){
    assertEquals(3929L,position(3929))
    assertEquals(20000L,position(21000))
  }
  @Test fun unknownDecoderDurationStillReportsAnObservedPosition(){
    assertEquals(3172L,position(3172,duration=C.TIME_UNSET))
    assertEquals(3172L,position(3172,duration=null))
    assertEquals(0L,position(-100,duration=C.TIME_UNSET))
  }
  @Test fun actualFullLengthDurationWinsOverTheCatalogEstimate(){
    assertEquals(27000L,position(27000,duration=30000))
    assertEquals(30000L,position(32000,duration=30000))
  }
  @Test fun precedingQueueTimeIsPreservedForAnOpenEndedInput(){
    assertEquals(20672L,position(3172,before=17500))
    assertEquals(17500L,position(-1,before=17500))
  }
  @Test fun explicitReferenceSegmentsRetainTheirWholeFileOffsetAndBounds(){
    assertEquals(3500L,position(8500,start=8000,end=11000,before=3000,duration=20000))
    assertEquals(3000L,position(100,start=8000,end=11000,before=3000,duration=C.TIME_UNSET))
    assertEquals(6000L,position(18000,start=8000,end=11000,before=3000,duration=20000))
  }
  @Test fun aKnownZeroLengthIsNotAnUnknownEnd(){
    assertEquals(0L,position(500,end=0))
    assertEquals(0L,position(500,duration=0))
  }
}
