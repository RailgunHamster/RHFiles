package com.railgunhamster.rhfiles

import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

/** UI-thread ownership for one native slideshow input. IDs outlive an Activity
 * so close/reopen cannot make an old acknowledgement current again. */
internal class RhVideoPresentationInput {
  companion object {private val sequence=AtomicLong()}
  var current:Long?=null;private set
  fun activate():Long=sequence.incrementAndGet().also{check(it in 1..9007199254740991L);current=it}
  fun retire(){current=null}
  fun owns(input:Long)=current==input
  fun matches(args:JSONObject):Boolean{
    if(!args.has("expectedInput"))return true
    val expected=args.get("expectedInput")
    require(expected is Number&&expected.toDouble().isFinite()&&expected.toDouble() in 1.0..9007199254740991.0&&expected.toDouble()==expected.toLong().toDouble()){"放映输入标识无效"}
    return current==expected.toLong()
  }
}
