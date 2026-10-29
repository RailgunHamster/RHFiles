package com.railgunhamster.rhfiles

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoContractTest {
  private fun contract():RhVideoContract {
    val file=listOf(java.io.File("src/main/assets/rhvideo/rhvideo-operations.json"),java.io.File("app/src/main/assets/rhvideo/rhvideo-operations.json")).firstOrNull{it.isFile}?:error("实际打包的 RHVideo 操作契约缺失")
    return RhVideoContract(JSONObject(file.readText()))
  }
  @Test fun rejectsEscapesUnknownFieldsAndImplicitDestruction(){
    val c=contract()
    for(text in listOf("""{"name":"evil"}""","""{"name":"video.info","params":{"id":"../auth/me"}}""","""{"name":"trash.stage","params":{"kind":"video","id":"a"}}""","""{"name":"account.refresh"}""","""{"name":"tasks.list","query":{"limit":51}}""","""{"name":"video.info","params":{"id":"a"},"method":"DELETE"}"""))try{c.request(JSONObject(text));fail(text)}catch(_:Exception){}
    val call=c.request(JSONObject("""{"name":"trash.stage","params":{"kind":"video","id":"a"},"confirmation":"RHVIDEO:trash.stage"}"""));assertEquals("POST",call.method);assertEquals("api/v1/trash/video/a",call.path)
  }
  @Test fun detailsAndUnicodeUseEncodedStructuredQuery(){
    val call=contract().request(JSONObject("""{"name":"tasks.detail","params":{"queue":"replacement","entry":"replace:42"}}"""));assertEquals("api/v1/processing-tasks/replacement/replace:42",call.path)
    val q=contract().request(JSONObject("""{"name":"tasks.list","query":{"q":"中文 & + / ?","limit":25}}"""));assertEquals("中文 & + / ?",q.query["q"])
  }
  @Test fun duplicatesRequireSnapshotsExplicitConfirmationAndBoundedRoutes(){
    val c=contract();val id="c8f17f3e-28c5-4fca-9fb2-204fb8713980"
    val args=JSONObject().put("name","duplicates.confirm").put("confirmation","RHVIDEO:duplicates.confirm").put("body",JSONObject().put("request_id",id).put("group_id",id).put("scan_id",id).put("keeper_key","picture:sample"))
    val accepted=c.request(args);assertEquals("api/v1/duplicates/reviews",accepted.path);assertTrue(accepted.invalidatesCatalog)
    for(key in listOf("request_id","group_id","scan_id","keeper_key")){val bad=JSONObject(args.toString());bad.getJSONObject("body").remove(key);assertRejected(c,bad)}
    for(key in listOf("","other:sample","picture:../x","video:x?url","video:a:b")){val bad=JSONObject(args.toString());bad.getJSONObject("body").put("keeper_key",key);assertRejected(c,bad)}
    val bad=JSONObject(args.toString());bad.remove("confirmation");assertRejected(c,bad)
    assertRejected(c,JSONObject().put("name","duplicates.scan"))
    assertRejected(c,JSONObject().put("name","duplicates.groups").put("query",JSONObject().put("kind","novel")))
    val cancelled=c.request(JSONObject().put("name","duplicates.cancel").put("params",JSONObject().put("id",id)));assertEquals("DELETE",cancelled.method);assertFalse(cancelled.invalidatesCatalog)
  }
  @Test fun duplicatePreviewsCannotBecomeArbitraryCredentialledRequests(){
    for(kind in listOf("picture","video")){val path="api/v1/duplicates/preview/$kind/sample?v="+"ab".repeat(32);assertEquals(path,RhVideoClient.imagePath("/$path"))}
    for(path in listOf("/api/v1/duplicates/scans","/api/v1/duplicates/preview/novel/a","/api/v1/duplicates/preview/video/a%2fb","/api/v1/duplicates/preview/video/../a","/api/v1/duplicates/preview/video/a?v=x","/api/v1/duplicates/preview/video/a?url=https://evil.invalid"))try{RhVideoClient.imagePath(path);fail(path)}catch(_:IllegalArgumentException){}
  }
  private fun assertRejected(c:RhVideoContract,args:JSONObject){try{c.request(args);fail(args.toString())}catch(_:IllegalArgumentException){}catch(_:IllegalStateException){}}
}
