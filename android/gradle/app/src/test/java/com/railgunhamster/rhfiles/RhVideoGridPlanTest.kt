package com.railgunhamster.rhfiles

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoGridPlanTest {
  private fun entry(i:Int,end:Boolean,rect:List<Double> = listOf(0.0,0.0,1.0,1.0))=JSONObject().put("id","video-$i").put("gridEnd",end).put("gridRect",JSONArray(rect))
  @Test fun usesVariableBoundariesAndReferenceProportionsWithoutRegrouping(){
    val rows=listOf(entry(0,false,listOf(0.0,0.0,.3,.5)),entry(1,false,listOf(.3,0.0,.7,.5)),entry(2,true,listOf(0.0,.5,1.0,.5)),entry(3,false),entry(4,true))
    val plan=RhVideoGridPlan(rows,4)
    assertEquals(listOf(0..2,3..4),plan.groups);assertEquals(1,plan.groupAt(3));assertEquals(listOf(.3,0.0,.7,.5),plan.rects[1])
    assertEquals(3,plan.restore(rows,JSONArray(listOf("video-3","video-4"))))
    assertEquals(0,plan.restore(rows,JSONArray(listOf("video-4","video-3"))))
    assertEquals(0,plan.restore(rows,JSONArray(listOf("video-2","video-3"))))
  }
  @Test fun rejectsPartialInvalidAndDuplicatePlans(){
    val invalid=listOf(listOf(entry(0,false)),listOf(entry(0,true),entry(0,true)),listOf(entry(0,true,listOf(.5,0.0,.6,1.0))),listOf(entry(0,true).put("gridEnd",1)),listOf(entry(0,true),JSONObject().put("id","other")),(0..9).map{entry(it,it==9)})
    for(rows in invalid)try{RhVideoGridPlan(rows,4);fail("Invalid grid accepted: $rows")}catch(_:Exception){}
  }
  @Test fun legacyManualGroupsRemainBoundedAndRequireAnExactStart(){
    val rows=(0..9).map{JSONObject().put("id","v$it")};val plan=RhVideoGridPlan(rows,4)
    assertEquals(listOf(0..3,4..7,8..9),plan.groups);assertEquals(2,plan.groupAt(8))
    try{plan.groupAt(9);fail()}catch(_:IllegalArgumentException){}
  }
}
