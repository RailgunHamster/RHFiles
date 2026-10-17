package com.railgunhamster.rhfiles

/** Geometry of the full active display, never of an individual file pane. */
internal object ScreenLayoutProfile {
  fun key(width:Int,height:Int):String? {
    if(width !in 10..99999 || height !in 10..99999)return null
    return "screen-${minOf(width,height)}x${maxOf(width,height)}"
  }
  fun orientation(width:Int,height:Int,rotation:Int):String? {
    if(key(width,height)==null)return null
    // Full-display aspect, NOT the app window or a file pane. Square displays
    // have no long edge: rotation parity gives them two stable directions too.
    return if(width>height || width==height && rotation in listOf(1,3))"landscape" else "portrait"
  }
}
