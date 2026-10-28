package com.railgunhamster.rhfiles

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class RhVideoExportsTest {
  private val ticket="c8f17f3e-28c5-4fca-9fb2-204fb8713980"
  private val request="dafcc457-e7ac-42f6-a808-53841219d5ec"
  private fun row(id:String,type:String="picture")=JSONObject().put("id",id).put("type",type)
  private fun chunk(offset:Int,total:Int,vararg items:JSONObject)=JSONObject().put("ticket",ticket).put("offset",offset).put("total",total).put("items",JSONArray(items.toList()))
  private fun submit()=JSONObject().put("requestId",request).put("ticket",ticket)
  private fun reject(block:()->Any?){try{block();fail("Invalid ZIP operation accepted")}catch(_:IllegalArgumentException){}catch(_:IllegalStateException){}}
  private fun sample()=JSONObject("""{"id":"$ticket","request_id":"$request","status":"queued","total":3,"archive_bytes":0,"cancel_requested":false,"can_download":false,"created_at":"2026-10-29T00:00:00.123456Z","finished_at":null,"expires_at":null,"error_message":null,"progress":{}}""")
  @Test fun entireFiftyThousandItemSnapshotIncludesNovelsAndEachChunkFitsTheActualBridge(){
    val exports=RhVideoExports{0}
    for(offset in 0 until RhVideoExports.MAX_ITEMS step 200){
      val args=chunk(offset,RhVideoExports.MAX_ITEMS,*(offset until offset+200).map{row(it.toString(),if(it%3==0)"novel" else "picture")}.toTypedArray())
      assertTrue(args.toString().toByteArray().size<256*1024)
      assertEquals(offset+200==RhVideoExports.MAX_ITEMS,exports.prepare(7,args).getBoolean("ready"))
    }
    val body=exports.consume(7,submit());assertEquals(50_000,body.getJSONArray("selection").length());assertEquals("novel",body.getJSONArray("selection").getJSONObject(0).getString("type"));reject{exports.consume(7,submit())}
  }
  @Test fun invalidRepeatedAndDuplicateChunksDoNotMutatePreparedContent(){
    val exports=RhVideoExports{0};val first=row("一");exports.prepare(7,chunk(0,3,first));first.put("id","changed-after-preparation")
    reject{exports.prepare(7,chunk(0,3,row("一")))}
    reject{exports.prepare(7,chunk(1,3,row("一")))}
    reject{exports.prepare(7,chunk(1,3,row("二","novel"),row("bad","file")))}
    exports.prepare(7,chunk(1,3,row("二","novel"),row("三","video")))
    reject{exports.consume(7,submit().put("requestId","bad"))}
    val selection=exports.consume(7,submit()).getJSONArray("selection");assertEquals(3,selection.length());assertEquals("一",selection.getJSONObject(0).getString("id"))
  }
  @Test fun allScopeOmitsSelectionAndIncompleteExpiredOrPreviousAccountDraftsCannotSubmit(){
    var time=0L;val exports=RhVideoExports{time}
    assertFalse(exports.consume(7,JSONObject().put("requestId",request)).has("selection"))
    reject{exports.consume(7,JSONObject().put("requestId",request).put("ticket",JSONObject.NULL))}
    exports.prepare(7,chunk(0,2,row("one")));reject{exports.consume(7,submit())}
    time=300_000;reject{exports.consume(7,submit())}
    exports.prepare(7,chunk(0,1,row("one")));reject{exports.consume(8,submit())}
  }
  @Test fun badOffsetsTotalsKindsExtraFieldsAndUnboundedDraftsAreRejected(){
    val exports=RhVideoExports{0}
    for(args in listOf(chunk(-1,1,row("x")),chunk(0,50_001,row("x")),chunk(0,1,row("x")).put("url","https://evil.invalid"),chunk(0,2,row("x"),row("x")),chunk(0,1,row("x".repeat(37)))))reject{exports.prepare(7,args)}
    for(i in 0..3)exports.prepare(7,chunk(0,1,row("x")).put("ticket","00000000-0000-0000-0000-00000000000$i"))
    reject{exports.prepare(7,chunk(0,1,row("x")))}
    assertFalse(exports.discard(8,JSONObject().put("ticket","00000000-0000-0000-0000-000000000000")).getBoolean("removed"))
    assertTrue(exports.discard(7,JSONObject().put("ticket","00000000-0000-0000-0000-000000000000")).getBoolean("removed"))
    exports.prepare(7,chunk(0,1,row("x")))
  }
  @Test fun serverRepliesValidateDatesCountsProgressAndReadinessWithoutManufacturingSuccess(){
    RhVideoExports.job(sample())
    for((key,value)in listOf("status" to "unknown","id" to "../download","total" to 50_001,"can_download" to true,"created_at" to "yesterday","progress" to JSONObject().put("percent",101),"progress" to JSONObject().put("bytes_done",-1)))reject{RhVideoExports.job(sample().put(key,value))}
    RhVideoExports.response("exports.list",JSONObject().put("items",JSONArray().put(sample())))
    reject{RhVideoExports.response("exports.list",JSONObject().put("items",JSONArray().put(sample()).put(sample())))}
  }
}
