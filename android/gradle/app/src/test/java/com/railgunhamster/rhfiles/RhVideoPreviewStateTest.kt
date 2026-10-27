package com.railgunhamster.rhfiles

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoPreviewStateTest {
  @Test fun consumeBeforeIoAndNeverReplayFailuresOrDuplicateClose(){
    val state=RhVideoPreviewState();state.mark("video","one","一");state.mark("picture","one","同编号图片")
    val run=state.take()!!;assertEquals(0,state.pending().getJSONArray("items").length());assertNull(state.take())
    state.publish(run,JSONObject(run.targets[0].toString()).put("success",false).put("error","连接中断，结果未知"))
    state.publish(run,JSONObject(run.targets[1].toString()).put("success",true))
    assertFalse(state.result().getBoolean("running"));assertEquals(2,state.result().getInt("completed"));assertNull(state.take())
    assertEquals(0,state.pending().getJSONArray("items").length())
    try{state.publish(run,JSONObject(run.targets[0].toString()).put("success",true));fail()}catch(_:IllegalStateException){}
  }
  @Test fun marksAddedDuringARunAreIndependentAndOutputsAreSnapshots(){
    val state=RhVideoPreviewState();state.mark("video","one","一");val run=state.take()!!
    state.mark("video","two","二");state.publish(run,JSONObject(run.targets[0].toString()).put("success",true))
    val snapshot=state.result();snapshot.put("completed",100);assertEquals(1,state.result().getInt("completed"))
    val next=state.take()!!;assertTrue(next.id>run.id);assertEquals("two",next.targets.single().getString("id"))
  }
  @Test fun updateKeepsOrderToggleIsPerMediaTypeAndCapacityIsBounded(){
    val state=RhVideoPreviewState();state.mark("video","one","旧标题");state.mark("picture","one","图片");state.mark("video","one","新标题",true)
    val rows=state.pending().getJSONArray("items");assertEquals("新标题",rows.getJSONObject(0).getString("title"));assertTrue(state.marked("video","one"));state.mark("video","one","一")
    assertFalse(state.marked("video","one"));assertTrue(state.marked("picture","one"))
    for(i in 0 until 999)state.mark("video","v-$i","$i",true)
    try{state.mark("video","overflow","超出",true);fail()}catch(_:IllegalArgumentException){}
    for((kind,id) in listOf("favorite" to "one","video" to "../escape"))try{state.mark(kind,id,"无效");fail()}catch(_:IllegalArgumentException){}
  }
}
