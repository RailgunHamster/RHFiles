package com.railgunhamster.rhfiles

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoExportClientTest {
  private val ticket="c8f17f3e-28c5-4fca-9fb2-204fb8713980"
  private val request="dafcc457-e7ac-42f6-a808-53841219d5ec"
  private lateinit var server:MockWebServer
  private lateinit var client:RhVideoClient
  @Before fun setup(){server=MockWebServer();server.start();client=RhVideoClient(RuntimeEnvironment.getApplication())}
  @After fun cleanup(){client.logout();server.shutdown()}
  private fun response(value:JSONObject,code:Int=200){server.enqueue(MockResponse().setResponseCode(code).setHeader("Content-Type","application/json").setBody(value.toString()))}
  private fun job()=JSONObject("""{"id":"$ticket","request_id":"$request","status":"queued","total":1,"archive_bytes":0,"cancel_requested":false,"can_download":false,"created_at":"2026-10-29T00:00:00Z","progress":{}}""")
  private fun login(){response(JSONObject().put("access_token","zip-native-token"));client.connect(JSONObject().put("server",server.url("/").toString()).put("username","demo").put("password","test-only"));server.takeRequest()}
  private fun prepare(){client.request("exports.prepare",JSONObject().put("ticket",ticket).put("offset",0).put("total",1).put("items",JSONArray().put(JSONObject().put("type","novel").put("id","book"))))}
  @Test fun serverJobsUseNativeOwnerBearerAndFixedRoutesWithoutSourceDeletion(){
    login();prepare();response(job(),202)
    val result=client.request("exports.create",JSONObject().put("requestId",request).put("ticket",ticket)) as JSONObject
    val create=server.takeRequest();assertEquals("POST",create.method);assertEquals("/api/v1/favorite-exports",create.path);assertEquals("Bearer zip-native-token",create.getHeader("Authorization"))
    val body=JSONObject(create.body.readUtf8());assertEquals(request,body.getString("request_id"));assertEquals("novel",body.getJSONArray("selection").getJSONObject(0).getString("type"));assertFalse(result.toString().contains("zip-native-token"))
    // Inject the packaged contract, not an ad-hoc endpoint implementation.
    val contractFile=listOf(java.io.File("src/main/assets/rhvideo/rhvideo-operations.json"),java.io.File("app/src/main/assets/rhvideo/rhvideo-operations.json")).first{it.isFile}
    val contract=RhVideoContract(JSONObject(contractFile.readText()))
    val cancel=contract.request(JSONObject().put("name","exports.cancel").put("params",JSONObject().put("id",ticket)))
    assertEquals("DELETE",cancel.method);assertEquals("api/v1/favorite-exports/$ticket",cancel.path);assertFalse(cancel.invalidatesCatalog)
    response(job().put("status","cancelled").put("cancel_requested",true))
    client.request("operation",JSONObject().put("name","exports.cancel").put("params",JSONObject().put("id",ticket)))
    assertEquals("/api/v1/favorite-exports/$ticket",server.takeRequest().path)
  }
  @Test fun ambiguousWriteFailureConsumesSelectionAndNeverAutomaticallyReplays(){
    login();prepare();response(JSONObject().put("detail","test error"),503)
    try{client.request("exports.create",JSONObject().put("requestId",request).put("ticket",ticket));fail("Write failed but UI reported success")}catch(_:IllegalStateException){}
    server.takeRequest()
    try{client.request("exports.create",JSONObject().put("requestId",request).put("ticket",ticket));fail("Consumed selection was replayed")}catch(_:IllegalStateException){}
    assertEquals(2,server.requestCount)
    response(JSONObject().put("items",JSONArray().put(job())))
    val list=client.request("operation",JSONObject().put("name","exports.list")) as JSONObject
    assertEquals(1,list.getJSONArray("items").length());assertEquals("GET",server.takeRequest().method)
  }
  @Test fun oldAccountCannotCreateWithAnEarlierPreparedSelection(){
    login();prepare();val generation=client.sessionGeneration();client.logout();login()
    try{client.request("exports.create",JSONObject().put("requestId",request).put("ticket",ticket).put("_sessionGeneration",generation));fail("Stale account submitted a ZIP")}catch(_:IllegalStateException){}
    assertEquals(2,server.requestCount)
  }
  @Test fun serverExplainsAnExportConflictInsteadOfOnlyShowingGenericConnectionFailure(){
    login();response(JSONObject().put("detail","已有两个导出任务，请等待完成或取消后再提交"),409)
    try{client.request("exports.create",JSONObject().put("requestId",request));fail("Rejected export reported success")}catch(e:IllegalStateException){assertTrue(e.message.orEmpty().contains("已有两个导出任务"))}
    assertEquals(2,server.requestCount)
  }
  @Test fun aValidButDifferentJobIsNotAcceptedAsThisRequestOrAsThisCancelTarget(){
    login();response(job().put("request_id",ticket),202)
    try{client.request("exports.create",JSONObject().put("requestId",request));fail("Different job was accepted")}catch(e:IllegalStateException){assertTrue(e.message.orEmpty().contains("不匹配"))}
    response(job().put("id",request))
    try{client.request("operation",JSONObject().put("name","exports.cancel").put("params",JSONObject().put("id",ticket)));fail("Different cancellation target was accepted")}catch(e:IllegalStateException){assertTrue(e.message.orEmpty().contains("不匹配"))}
    assertEquals(3,server.requestCount)
  }
}
