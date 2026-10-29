package com.railgunhamster.rhfiles

import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import java.lang.reflect.Proxy
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoGridMemoryTest {
  private fun player(read:()->TrackSelectionParameters={error("Unexpected read")},write:(TrackSelectionParameters)->Unit={error("Unexpected write")}):Player =
    Proxy.newProxyInstance(Player::class.java.classLoader,arrayOf(Player::class.java)){_,method,args->when(method.name){
      "getTrackSelectionParameters"->read()
      "setTrackSelectionParameters"->{write(args!![0] as TrackSelectionParameters);null}
      else->error("Unexpected player call: ${method.name}")
    }} as Player
  private fun parameters()=TrackSelectionParameters.Builder(RuntimeEnvironment.getApplication()).build()
  private fun restored(memory:RhVideoGridMemory,id:String):TrackSelectionParameters? {var value:TrackSelectionParameters?=null;memory.restoreTracks(id,player(write={value=it}));return value}
  @Test fun cellsKeepIndependentTrackChoicesAcrossReordering(){
    val memory=RhVideoGridMemory();memory.begin("viewer-a")
    val disabled=parameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT,true).build();val other=parameters().buildUpon().setPreferredAudioLanguage("zh").build()
    memory.rememberTracks("video-a",player(read={disabled}));memory.rememberTracks("video-b",player(read={other}))
    assertSame(other,restored(memory,"video-b"));assertSame(disabled,restored(memory,"video-a"));memory.restoreTracks("unseen-video",player())
  }
  @Test fun theSameViewerRetainsItsCellStateAndLatestChoice(){
    val memory=RhVideoGridMemory();memory.begin("viewer-a");memory.cells["video-a"]=JSONObject().put("positionMs",5000)
    memory.rememberTracks("video-a",player(read={parameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT,true).build()}));val latest=parameters();memory.rememberTracks("video-a",player(read={latest}));memory.begin("viewer-a")
    assertSame(latest,restored(memory,"video-a"));assertEquals(5000,memory.cells["video-a"]!!.getInt("positionMs"))
  }
  @Test fun aDifferentViewerClearsCellAndTrackMemoryAndStartsOpen(){
    val memory=RhVideoGridMemory();memory.begin("viewer-a");memory.closed=true;memory.cells["video-a"]=JSONObject();memory.rememberTracks("video-a",player(read={parameters()}));memory.begin("viewer-b")
    assertEquals("viewer-b",memory.lease);assertFalse(memory.closed);assertTrue(memory.cells.isEmpty());memory.restoreTracks("video-a",player())
  }
  @Test fun anIndependentGridCannotInheritAnotherViewersChoices(){
    val old=RhVideoGridMemory();old.begin("viewer-a");old.rememberTracks("video-a",player(read={parameters()}));val next=RhVideoGridMemory();next.begin("viewer-a");next.restoreTracks("video-a",player())
  }
}
