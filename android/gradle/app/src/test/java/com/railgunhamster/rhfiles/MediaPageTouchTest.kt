package com.railgunhamster.rhfiles

import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[34])
class MediaPageTouchTest {
  @Test fun nativeSwipeCancelsThePlayerTapAndCannotActOnAReplacedInput(){
    var input=1;val pages=mutableListOf<Int>();var canceled=0
    val view=object:View(RuntimeEnvironment.getApplication()){
      override fun onTouchEvent(event:MotionEvent):Boolean {if(event.actionMasked==MotionEvent.ACTION_CANCEL)canceled++;return true}
    }.apply{layout(0,0,1200,900)}
    val swipe=MediaPageTouch({input},{},{pages.add(it)})
    val density=view.resources.displayMetrics.density
    fun send(action:Int,x:Float,y:Float,time:Long):Boolean {
      val event=MotionEvent.obtain(0,time,action,x*density,y*density,0)
      return try{swipe.onTouch(view,event)}finally{event.recycle()}
    }
    assertFalse(send(MotionEvent.ACTION_DOWN,200f,200f,0))
    assertTrue(send(MotionEvent.ACTION_MOVE,152f,200f,200))
    assertTrue(send(MotionEvent.ACTION_UP,152f,200f,400))
    assertEquals(listOf(1),pages);assertEquals(1,canceled)
    send(MotionEvent.ACTION_DOWN,200f,200f,1000);send(MotionEvent.ACTION_MOVE,152f,200f,1200)
    input=2;input=3 // The path may be the same again, but the input revision is new.
    send(MotionEvent.ACTION_UP,152f,200f,1400);assertEquals(listOf(1),pages)
    send(MotionEvent.ACTION_DOWN,200f,200f,2000);send(MotionEvent.ACTION_MOVE,152f,200f,2200)
    send(MotionEvent.ACTION_CANCEL,152f,200f,2300);assertEquals(listOf(1),pages)
    send(MotionEvent.ACTION_DOWN,200f,200f,3000);send(MotionEvent.ACTION_MOVE,198f,280f,3200)
    send(MotionEvent.ACTION_MOVE,140f,280f,3300);send(MotionEvent.ACTION_UP,140f,280f,3400);assertEquals(listOf(1),pages)
    assertFalse(send(MotionEvent.ACTION_DOWN,200f,200f,4000));assertFalse(send(MotionEvent.ACTION_UP,201f,200f,4100))
  }

  @Test fun fileVideoSeparatesSingleTapsDoubleTapsAndQueueSwipes(){
    val clock=shadowOf(Looper.getMainLooper())
    val pages=mutableListOf<Int>();val jumps=mutableListOf<Int>();var taps=0;var input=1
    val view=object:View(RuntimeEnvironment.getApplication()){
      override fun performClick():Boolean {taps++;return true}
    }.apply{layout(0,0,1000,800)}
    val touch=FilePlaybackTouch(view,MediaPageTouch({input},{},pages::add),{input},jumps::add)
    fun advance(ms:Long)=clock.idleFor(Duration.ofMillis(ms))
    fun send(action:Int,x:Float,down:Long){
      val event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,x,400f,0)
      try{touch.onTouch(view,event)}finally{event.recycle()}
    }
    fun tap(x:Float){val down=SystemClock.uptimeMillis();send(MotionEvent.ACTION_DOWN,x,down);advance(50);send(MotionEvent.ACTION_UP,x,down)}

    tap(500f);advance(350)
    assertEquals(1,taps)
    tap(850f);advance(75);tap(850f);advance(350)
    assertEquals(listOf(1),jumps);assertEquals(1,taps)
    tap(150f);advance(75);tap(150f);advance(350)
    assertEquals(listOf(1,-1),jumps);assertEquals(1,taps)

    tap(850f);advance(75)
    val down=SystemClock.uptimeMillis()
    send(MotionEvent.ACTION_DOWN,850f,down);advance(60);send(MotionEvent.ACTION_MOVE,500f,down)
    advance(120);send(MotionEvent.ACTION_UP,450f,down);advance(350)
    assertEquals(listOf(1),pages);assertEquals(listOf(1,-1),jumps);assertEquals(1,taps)

    tap(850f);advance(75);input++;tap(850f);advance(350)
    assertEquals(listOf(1,-1),jumps)
    tap(500f);touch.cancel();advance(350)
    assertEquals(1,taps)
  }
}
