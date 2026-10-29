package com.railgunhamster.rhfiles

import androidx.lifecycle.ViewModel
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.common.util.UnstableApi

/** One viewer's immutable track choices, not account/global preferences. Keep
 * them across stopped decoder replacement and Activity recreation without
 * serializing track groups or an entire queue into a size-limited Bundle. */
@UnstableApi
internal class PlaybackSelectionMemory:ViewModel(){
  private var parameters:TrackSelectionParameters?=null
  fun remember(player:Player){parameters=player.trackSelectionParameters}
  fun restore(player:Player){parameters?.let{player.trackSelectionParameters=it}}
}
