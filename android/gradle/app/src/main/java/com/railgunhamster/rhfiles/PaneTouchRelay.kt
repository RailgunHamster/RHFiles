package com.railgunhamster.rhfiles

import android.view.MotionEvent
import org.json.JSONArray
import org.json.JSONObject

/** Capture all Android contacts before Chromium filters touches outside the
 * first iframe's touch-active document. Does not consume normal clicks/pinch. */
class PaneTouchRelay {
  var enabled=false
  private var primary=-1
  fun sample(event:MotionEvent,width:Int,height:Int):JSONObject? {
    if(!enabled||width<=0||height<=0)return null
    val action=event.actionMasked
    if(action==MotionEvent.ACTION_DOWN)primary=event.getPointerId(0)
    val phase=when(action){MotionEvent.ACTION_DOWN,MotionEvent.ACTION_POINTER_DOWN->"start";MotionEvent.ACTION_MOVE->"move";MotionEvent.ACTION_UP,MotionEvent.ACTION_POINTER_UP->"end";MotionEvent.ACTION_CANCEL->"cancel";else->return null}
    val points=JSONArray()
    val indices=if(action==MotionEvent.ACTION_MOVE||action==MotionEvent.ACTION_CANCEL)(0 until event.pointerCount).toList()else listOf(event.actionIndex)
    for(i in indices)points.put(JSONObject().put("id",event.getPointerId(i)).put("secondary",event.getPointerId(i)!=primary).put("x",event.getX(i)/width).put("y",event.getY(i)/height))
    if(action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL)primary=-1
    return JSONObject().put("phase",phase).put("points",points)
  }
}
