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
}
