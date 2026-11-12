package com.railgunhamster.rhfiles

import android.os.SystemClock
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import kotlin.math.abs

/** Resolves taps only on the video surface. Timeline and button touches stay with Media3. */
internal class FilePlaybackTouch(
  private val surface: View,
  private val paging: MediaPageTouch,
  private val identity: () -> Any?,
  private val jump: (Int) -> Unit,
) : View.OnTouchListener {
  private val slop = ViewConfiguration.get(surface.context).scaledTouchSlop
  private var input: Any? = null
  private var firstTapInput: Any? = null
  private var doubleTapSide: Int? = null
  private var downX = 0f
  private var downY = 0f
  private var canceled = false

  private fun side(x: Float) = when {
    x < surface.width * .35f -> -1
    x > surface.width * .65f -> 1
    else -> 0
  }

  private val detector = GestureDetector(surface.context, object : GestureDetector.SimpleOnGestureListener() {
    override fun onDown(event: MotionEvent) = true

    override fun onSingleTapUp(event: MotionEvent): Boolean {
      firstTapInput = input
      return true
    }

    override fun onSingleTapConfirmed(event: MotionEvent): Boolean {
      if (input != null && input == identity()) surface.performClick()
      return true
    }

    override fun onDoubleTap(event: MotionEvent): Boolean {
      doubleTapSide = side(downX).takeIf { it == side(event.x) && firstTapInput == input }
      return true
    }

    override fun onDoubleTapEvent(event: MotionEvent): Boolean {
      if (abs(event.x - downX) > slop || abs(event.y - downY) > slop) doubleTapSide = null
      if (event.actionMasked == MotionEvent.ACTION_UP && input != null && input == identity()) {
        doubleTapSide?.let { if (it == 0) surface.performClick() else jump(it) }
      }
      return true
    }
  }).apply { setIsLongpressEnabled(false) }

  override fun onTouch(view: View, event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      input = identity()
      downX = event.x
      downY = event.y
      canceled = false
    }
    val paged = paging.onTouch(view, event)
    if (paged || event.pointerCount != 1 || event.actionMasked == MotionEvent.ACTION_CANCEL) cancelTaps()
    if (!canceled) detector.onTouchEvent(event)
    return true
  }

  private fun cancelTaps() {
    if (canceled) return
    canceled = true
    input = null
    firstTapInput = null
    doubleTapSide = null
    val now = SystemClock.uptimeMillis()
    val event = MotionEvent.obtain(now, now, MotionEvent.ACTION_CANCEL, 0f, 0f, 0)
    try { detector.onTouchEvent(event) } finally { event.recycle() }
  }

  fun cancel() {
    paging.cancel()
    cancelTaps()
  }
}
