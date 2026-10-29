package com.railgunhamster.rhfiles

import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import java.lang.reflect.Proxy
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class PlaybackSelectionMemoryTest {
  private fun player(read:()->TrackSelectionParameters={error("Unexpected read")},write:(TrackSelectionParameters)->Unit={error("Unexpected write")}):Player =
    Proxy.newProxyInstance(Player::class.java.classLoader,arrayOf(Player::class.java)){_,method,args->when(method.name){
      "getTrackSelectionParameters"->read()
      "setTrackSelectionParameters"->{write(args!![0] as TrackSelectionParameters);null}
      else->error("Unexpected player call: ${method.name}")
    }} as Player
  private fun parameters()=TrackSelectionParameters.Builder(RuntimeEnvironment.getApplication()).build()
  @Test fun aFreshViewerDoesNotOverrideSystemCaptionOrTrackDefaults(){PlaybackSelectionMemory().restore(player())}
  @Test fun remembersCompleteImmutableOverridesAndSubtitleChoiceForTheReplacementDecoder(){
    val group=TrackGroup("audio",Format.Builder().setId("zh").setLanguage("zh").setSampleMimeType("audio/mp4a-latm").build(),Format.Builder().setId("en").setLanguage("en").setSampleMimeType("audio/mp4a-latm").build())
    val choice=parameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT,true).addOverride(TrackSelectionOverride(group,listOf(1))).build()
    val memory=PlaybackSelectionMemory();memory.remember(player(read={choice}));var restored:TrackSelectionParameters?=null;memory.restore(player(write={restored=it}))
    assertSame(choice,restored);assertTrue(restored!!.disabledTrackTypes.contains(C.TRACK_TYPE_TEXT));assertEquals(listOf(1),restored!!.overrides[group]!!.trackIndices)
  }
  @Test fun aLaterAcceptedTrackChoiceSupersedesTheEarlierSnapshot(){
    val first=parameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT,true).build();val latest=parameters();val memory=PlaybackSelectionMemory()
    memory.remember(player(read={first}));memory.remember(player(read={latest}));var restored:TrackSelectionParameters?=null;memory.restore(player(write={restored=it}));assertSame(latest,restored)
  }
  @Test fun independentViewerStoresCannotLeakTrackChoicesToAnotherWindowOrAccount(){
    val memory=PlaybackSelectionMemory();memory.remember(player(read={parameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT,true).build()}));PlaybackSelectionMemory().restore(player())
  }
}
