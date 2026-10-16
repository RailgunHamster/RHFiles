package com.railgunhamster.rhfiles

/** Geometry of the full active display, never of an individual file pane. */
internal object ScreenLayoutProfile {
  fun key(width:Int,height:Int):String? {
    if(width !in 10..99999 || height !in 10..99999)return null
    return "screen-${minOf(width,height)}x${maxOf(width,height)}"
  }
}
