package com.railgunhamster.rhfiles

import org.json.JSONObject

/** Same five-percent fit rule as RHVideo's shouldRotate, not device orientation. */
internal object RhVideoRotation {
  fun angle(aspect:Double,width:Int,height:Int,enabled:Boolean):Int {
    if(!enabled||!aspect.isFinite()||aspect<=0||width<=0||height<=0)return 0
    val container=width.toDouble()/height
    val normal=minOf(container/aspect,aspect/container);val rotated=minOf(container*aspect,1/(container*aspect))
    return if(rotated>normal*1.05)90 else 0
  }
  fun available(aspect:Double,width:Int,height:Int,enabled:Boolean):Boolean {
    if(enabled||!aspect.isFinite()||aspect<=0||width<=0||height<=0)return true
    val container=width.toDouble()/height;val normal=minOf(container/aspect,aspect/container);val rotated=minOf(container*aspect,1/(container*aspect))
    return !(aspect>.9&&aspect<1.1)&&kotlin.math.abs(normal-rotated)>=.05
  }
  fun preference(value:JSONObject)=if(value.opt("autoRotate") is Boolean)value.getBoolean("autoRotate") else (value.opt("rotation") as? Number)?.toDouble() in listOf(90.0,180.0,270.0)
}
