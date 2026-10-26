package com.railgunhamster.rhfiles

import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
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
class PlayerTracksTest {
  private fun parameters()=TrackSelectionParameters.Builder(RuntimeEnvironment.getApplication()).build()
  private fun tracks():Tracks {
    val first=Format.Builder().setId("zh").setLanguage("zh").setLabel("中文").setSampleMimeType("audio/mp4a-latm").build()
    val second=Format.Builder().setId("en").setLanguage("en").setLabel("English").setSampleMimeType("audio/mp4a-latm").build()
    return Tracks(listOf(Tracks.Group(TrackGroup("languages",first,second),false,intArrayOf(C.FORMAT_HANDLED,C.FORMAT_UNSUPPORTED_TYPE),booleanArrayOf(true,false))))
  }
  @Test fun enumeratesActualNativeGroupsFormatsSupportAndSelection(){
    val value=PlayerTracks.state(tracks(),parameters());val group=value.getJSONArray("groups").getJSONObject(0)
    assertEquals("audio",group.getString("type"));assertEquals(0,group.getInt("index"))
    val items=group.getJSONArray("tracks");assertEquals("中文",items.getJSONObject(0).getString("label"));assertTrue(items.getJSONObject(0).getBoolean("selected"));assertFalse(items.getJSONObject(1).getBoolean("supported"))
  }
  @Test fun selectingAnUnsupportedOrStaleTrackNeverChangesParameters(){
    val tracks=tracks();val original=parameters()
    for((group,index) in listOf(0 to 1,0 to 2,1 to 0,-1 to 0)){
      try{PlayerTracks.change(tracks,original,JSONObject().put("command","track.select").put("trackGroup",group).put("trackIndex",index));fail("Invalid track accepted")}catch(_:IllegalArgumentException){}
    }
    assertTrue(original.overrides.isEmpty())
  }
  @Test fun selectionAutoAndSubtitleToggleUseMedia3ParametersDirectly(){
    val tracks=tracks();val selected=PlayerTracks.change(tracks,parameters(),JSONObject().put("command","track.select").put("trackGroup",0).put("trackIndex",0))
    assertEquals(listOf(0),selected.overrides[tracks.groups[0].mediaTrackGroup]?.trackIndices)
    val automatic=PlayerTracks.change(tracks,selected,JSONObject().put("command","track.auto").put("trackType","audio"));assertTrue(automatic.overrides.isEmpty())
    val disabled=PlayerTracks.change(tracks,automatic,JSONObject().put("command","subtitles").put("enabled",false));assertFalse(PlayerTracks.state(tracks,disabled).getBoolean("subtitlesEnabled"))
    val enabled=PlayerTracks.change(tracks,disabled,JSONObject().put("command","subtitles").put("enabled",true));assertTrue(PlayerTracks.state(tracks,enabled).getBoolean("subtitlesEnabled"))
  }
}
