package com.railgunhamster.rhfiles

/** Only reserve occlusion still inside the WebView, not space already resized by Android. */
internal object ViewportInsets {
  fun bottom(windowHeight:Int,viewTop:Int,viewHeight:Int,bars:Int,ime:Int):Int {
    if(windowHeight<=0||viewHeight<=0)return 0
    val outside=(windowHeight.toLong()-viewTop.toLong()-viewHeight.toLong()).coerceAtLeast(0)
    return (maxOf(bars,ime).coerceAtLeast(0).toLong()-outside).coerceIn(0,viewHeight.toLong()).toInt()
  }
}
