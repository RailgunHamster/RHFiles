package com.railgunhamster.rhfiles

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoPlaybackPlanTest {
  private fun row(id:String,start:Double,length:Double,portrait:Boolean=false)=JSONObject().put("id",id).put("duration",20).put("segmentStart",start).put("segmentLength",length).put("portrait",portrait)
  private fun options()=JSONObject().put("reference",true).put("fullLength",false).put("segment",3)
  @Test fun queueSeekUsesWeightedSegmentsAndWholeFilePositions(){
    val plan=RhVideoPlaybackPlan(listOf(row("one",7.2,3.0),row("two",4.0,10.0)),options())
    assertEquals(13000L,plan.totalMs);assertEquals(listOf(0L,3000L,13000L),plan.beforeMs.toList())
    assertEquals(RhVideoPlaybackPlan.Target(0,7200),plan.seek(0.0))
    assertEquals(RhVideoPlaybackPlan.Target(1,7500),plan.seek(.5))
    assertEquals(RhVideoPlaybackPlan.Target(1,4000),plan.seek(1.0))
    assertEquals(6500L,plan.progress(1,7500));assertEquals(3000L,plan.progress(1,0))
    for(value in listOf(Double.NaN,Double.POSITIVE_INFINITY,-.1,1.1))try{plan.seek(value);fail()}catch(_:IllegalArgumentException){}
  }
  @Test fun windowChangesCannotAlterTheSubmittedPlanOrSettings(){
    val row=row("one",8.0,3.0);val options=options();val plan=RhVideoPlaybackPlan(listOf(row),options)
    row.put("segmentStart",2);options.put("fullLength",true)
    assertEquals(8000L,plan.entries.single().startMs);assertFalse(plan.options.getBoolean("fullLength"))
  }
  @Test fun portraitProjectionPreservesTheOriginalPoolAndRejectsTooFewWithoutMutation(){
    val plan=RhVideoPlaybackPlan(listOf(row("one",1.0,3.0,true),row("two",2.0,3.0),row("three",3.0,3.0,true)),options())
    val portrait=plan.changed(JSONObject().put("portraitOnly",true))
    assertEquals(listOf("one","three"),portrait.entries.map{it.id});assertTrue(portrait.options.getBoolean("fullLength"));assertTrue(portrait.entries.all{it.startMs==0L&&it.lengthMs==20000L})
    val restored=portrait.changed(JSONObject().put("portraitOnly",false))
    assertEquals(listOf("one","two","three"),restored.entries.map{it.id});assertFalse(restored.options.getBoolean("fullLength"))
    try{RhVideoPlaybackPlan(listOf(row("one",1.0,3.0,true),row("two",2.0,3.0)),options()).changed(JSONObject().put("portraitOnly",true));fail()}catch(_:IllegalArgumentException){}
    assertEquals(3,plan.entries.size);assertEquals(1000L,plan.entries.first().startMs)
  }
  @Test fun unknownFullLengthUsesReferenceProtectionAndShortVideosAreNotExtended(){
    val rows=listOf(JSONObject().put("id","unknown").put("duration",0).put("segmentStart",0).put("segmentLength",86400),JSONObject().put("id","short").put("duration",1.2).put("segmentStart",0).put("segmentLength",1.2))
    val plan=RhVideoPlaybackPlan(rows,options());assertEquals(listOf(86400000L,1200L),plan.entries.map{it.lengthMs})
    assertEquals(1200L,plan.changed(JSONObject().put("segment",300)).entries.last().lengthMs)
  }
  @Test fun invalidPlansFailBeforeTheyCanReplaceALiveQueue(){
    for(row in listOf(row("bad",-1.0,3.0),row("bad",19.0,3.0),row("bad",1.0,0.0),JSONObject().put("id","missing"))){
      try{RhVideoPlaybackPlan(listOf(row),options());fail(row.toString())}catch(_:Exception){}
    }
    val plan=RhVideoPlaybackPlan(listOf(row("one",1.0,3.0)),options())
    for(patch in listOf(JSONObject().put("segment",0),JSONObject().put("rate",100),JSONObject().put("loop","true"),JSONObject().put("unexpected",true)))try{plan.changed(patch);fail()}catch(_:IllegalArgumentException){}
  }
}
