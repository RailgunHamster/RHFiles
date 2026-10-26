package com.railgunhamster.rhfiles

import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.common.util.UnstableApi
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoVolumeTest {
  @Test fun masterGainPreservesIndividualGainsAndDoesNotAffectLocalFilePlayers(){
    val context=RuntimeEnvironment.getApplication()
    val first=ExoPlayer.Builder(context).build();val muted=ExoPlayer.Builder(context).build();val local=ExoPlayer.Builder(context).build()
    try {
      local.volume=.8f;RhVideoVolume.set(20);RhVideoVolume.track(first,1f);RhVideoVolume.track(muted,0f)
      assertEquals(.2f,first.volume,.001f);RhVideoVolume.setLocal(first,.5f);assertEquals(.1f,first.volume,.001f)
      RhVideoVolume.set(0);assertEquals(0f,first.volume,.001f);assertEquals(.5f,RhVideoVolume.local(first),.001f)
      RhVideoVolume.set(100);assertEquals(.5f,first.volume,.001f);assertEquals(0f,muted.volume,.001f);assertEquals(.8f,local.volume,.001f)
      for(invalid in listOf(-1,101))try{RhVideoVolume.set(invalid);fail("Invalid volume accepted")}catch(_:IllegalArgumentException){}
    }finally{listOf(first,muted,local).forEach{RhVideoVolume.untrack(it);it.release()};RhVideoVolume.set(20)}
  }
}
