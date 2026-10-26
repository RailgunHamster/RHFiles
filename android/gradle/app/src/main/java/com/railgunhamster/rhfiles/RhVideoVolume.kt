package com.railgunhamster.rhfiles

import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import java.util.WeakHashMap
import org.json.JSONObject

/** RHVideo-only master gain. Local file playback and system volume are untouched.
 * Logical per-player gains survive master mute and unmute. Calls run on UI thread. */
@UnstableApi
internal object RhVideoVolume {
  private val players=WeakHashMap<ExoPlayer,Float>()
  private var master=20
  fun track(player:ExoPlayer,local:Float=1f){players[player]=local.coerceIn(0f,1f);apply(player)}
  fun tracked(player:ExoPlayer)=players.containsKey(player)
  fun local(player:ExoPlayer)=players[player]?:player.volume
  fun setLocal(player:ExoPlayer,value:Float){if(tracked(player)){players[player]=value.coerceIn(0f,1f);apply(player)}else player.volume=value}
  fun untrack(player:ExoPlayer){players.remove(player)}
  private fun apply(player:ExoPlayer){player.volume=(players[player]?:1f)*master/100f}
  fun set(value:Int):JSONObject {require(value in 0..100){"页面音量范围是 0–100"};master=value;players.keys.toList().forEach(::apply);return JSONObject().put("volume",master)}
}
