package com.railgunhamster.rhfiles

import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import kotlin.math.abs

internal object MediaPageSwipe {
  fun direction(dx:Float,dy:Float,width:Float,velocity:Float):Int {
    val distance=abs(dx);val threshold=(width*.08f).coerceIn(24f,48f)
    val flick=distance>=16f&&dx*velocity>0f&&abs(velocity)>=.3f
    return if(distance>abs(dy)*1.25f&&(distance>=threshold||flick))if(dx<0)1 else -1 else 0
  }
}

/** Attached to the video surface's PlayerView, never to its buttons or time bar. */
internal class MediaPageTouch(
  private val identity:()->Any?,private val preview:(Int?)->Unit,private val page:(Int)->Unit
):View.OnTouchListener {
  private var startX=0f;private var startY=0f;private var input:Any?=null
  private var active=false;private var claimed=false;private var blocked=false
  private var tracker:VelocityTracker?=null
  fun cancel(){tracker?.recycle();tracker=null;active=false;claimed=false;blocked=false;input=null;preview(null)}
  override fun onTouch(view:View,event:MotionEvent):Boolean {
    val density=view.resources.displayMetrics.density
    if(event.actionMasked==MotionEvent.ACTION_DOWN){
      cancel();active=true;startX=event.x;startY=event.y;input=identity();blocked=input==null
      tracker=VelocityTracker.obtain().also{it.addMovement(event)};return false
    }
    if(!active)return false
    tracker?.addMovement(event)
    if(event.actionMasked==MotionEvent.ACTION_CANCEL){val consumed=claimed;cancel();return consumed}
    if(event.pointerCount!=1||event.actionMasked==MotionEvent.ACTION_POINTER_DOWN){blocked=true;preview(null);return claimed}
    val dx=event.x-startX;val dy=event.y-startY
    if(event.actionMasked==MotionEvent.ACTION_MOVE){
      val slop=ViewConfiguration.get(view.context).scaledTouchSlop
      if(!claimed&&abs(dy)>slop&&abs(dy)>abs(dx))blocked=true
      if(!blocked&&!claimed&&abs(dx)>slop&&abs(dx)>abs(dy)*1.25f){
        claimed=true
        val canceled=MotionEvent.obtain(event);canceled.action=MotionEvent.ACTION_CANCEL
        try{view.onTouchEvent(canceled)}finally{canceled.recycle()}
      }
      if(claimed&&!blocked)preview(if(dx<0)1 else -1)
      return claimed
    }
    if(event.actionMasked==MotionEvent.ACTION_UP){
      val consumed=claimed;tracker?.computeCurrentVelocity(1000)
      val direction=if(claimed&&!blocked&&input==identity())MediaPageSwipe.direction(dx/density,dy/density,view.width/density,(tracker?.xVelocity?:0f)/density/1000f)else 0
      cancel();if(direction!=0)page(direction);return consumed
    }
    return claimed
  }
}
