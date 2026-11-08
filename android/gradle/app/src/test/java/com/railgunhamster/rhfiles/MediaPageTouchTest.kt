package com.railgunhamster.rhfiles

import android.view.MotionEvent
import android.view.View
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

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
}
