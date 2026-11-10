package com.railgunhamster.rhfiles

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PlaybackQueueTest {
  @Test fun remoteFileRevisionsSurviveTheIntentAndRotationQueueRoundTrip(){
    val selected="remote://qa/Files/movie.mp4";val input=JSONObject().put("path",selected).put("queue",JSONArray().put(JSONObject().put("path",selected).put("name","视频").put("revision","original-selected-revision")))
    val queue=PlaybackQueue.parse(input);assertEquals("original-selected-revision",queue.single().revision)
    assertEquals(queue,PlaybackQueue.parse(input.put("queue",JSONArray(PlaybackQueue.json(queue)))))
  }
  @Test fun deletionSelectsTheFollowingItemWrapsAtTheEndAndClosesAnEmptyQueue(){
    val items=listOf("a","b","c").map{PlaybackQueue.Item("/storage/$it.mp4",it)}
    val middle=PlaybackQueue.afterDelete(items,items[1].path);assertEquals(listOf("a","c"),middle.first.map{it.name});assertEquals(1,middle.second)
    val last=PlaybackQueue.afterDelete(items,items.last().path);assertEquals(0,last.second)
    assertTrue(PlaybackQueue.afterDelete(items.take(1),items[0].path).first.isEmpty())
    try{PlaybackQueue.afterDelete(items,"/new-occupant.mp4");fail()}catch(_:IllegalArgumentException){}
  }
  @Test fun singleFileAndVisiblePlaylistPreserveOrderAndNames(){
    assertEquals("/storage/test.mp4",PlaybackQueue.parse(JSONObject().put("path","/storage/test.mp4")).single().path)
    val input=JSONObject().put("path","remote://id/Share/b.mp4").put("queue",JSONArray().put(JSONObject().put("path","remote://id/Share/a.mp4").put("name","第一集")).put(JSONObject().put("path","remote://id/Share/b.mp4").put("name","第二集")))
    val items=PlaybackQueue.parse(input);assertEquals(listOf("第一集","第二集"),items.map{it.name});assertEquals(items,PlaybackQueue.parse(input.put("queue",JSONArray(PlaybackQueue.json(items)))))
  }
  @Test fun duplicateEntriesAndUntrustedUrlsCannotEnterPlayer(){
    val items=PlaybackQueue.parse(JSONObject().put("path","content://provider/a").put("queue",JSONArray().put(JSONObject().put("path","https://evil.invalid/a.mp4")).put(JSONObject().put("path","content://provider/a")).put(JSONObject().put("path","content://provider/a"))))
    assertEquals(1,items.size)
    try{PlaybackQueue.parse(JSONObject().put("path","https://evil.invalid/a"));fail()}catch(_:IllegalArgumentException){}
  }
  @Test fun oversizedQueueFailsBeforeBinderOrPlayback(){
    val queue=JSONArray();repeat(1001){queue.put(JSONObject().put("path","/storage/$it.mp4"))}
    try{PlaybackQueue.parse(JSONObject().put("path","/storage/0.mp4").put("queue",queue));fail()}catch(_:IllegalArgumentException){}
  }
}
