package com.railgunhamster.rhfiles

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import android.content.Context
import android.content.ContextWrapper
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.json.JSONArray
import java.util.UUID
import javax.crypto.spec.SecretKeySpec

@RunWith(RobolectricTestRunner::class) @Config(manifest=Config.NONE,sdk=[28])
class SharedConfigContractTest {
  private fun document():JSONObject {
    val file=generateSequence(File(System.getProperty("user.dir")).canonicalFile){it.parentFile}
      .take(8).map{File(it,"scripts/fixtures/shared-config.contract.json")}.firstOrNull{it.isFile}
      ?:error("Shared Windows/Android contract fixture missing from source tree")
    return JSONObject(file.readText())
  }
  @Test fun windowsAndAndroidValidateTheSamePortableDocumentAndPreserveEveryProtocol() {
    val doc=document()
    val storage=RemoteStorage(RuntimeEnvironment.getApplication(),credentialKey={SecretKeySpec(ByteArray(32){7},"AES")})
    SharedConfig.validate(doc,storage::validate)
    val stripped=SharedConfig.snapshot(doc.getJSONArray("profiles"),doc.getJSONArray("favorites"))
    SharedConfig.media(stripped,doc.getJSONObject("rhvideo"))
    assertEquals(SharedConfig.canonical(doc),SharedConfig.canonical(stripped))
    val merged=SharedConfig.merge(SharedConfig.empty(),SharedConfig.empty(),doc)
    assertEquals(0,merged.conflicts.length())
    assertEquals(SharedConfig.canonical(doc),SharedConfig.canonical(merged.document))
    assertFalse(stripped.toString().contains("password"))
    assertEquals(5,stripped.getJSONArray("profiles").length())
  }
  @Test fun actualWebdavSyncPreservesPcProfilesLabelsOrderAndMediaWhileSecretsRemainLocal() {
    val prefix=UUID.randomUUID().toString()
    val context=object:ContextWrapper(RuntimeEnvironment.getApplication()){
      override fun getSharedPreferences(name:String,mode:Int)=super.getSharedPreferences("$prefix-$name",mode)
      override fun getFilesDir()=File(super.getFilesDir(),prefix).apply{mkdirs()}
    }
    var cloud=document();var revision=1;var writes=0
    MockWebServer().use{server->
      server.dispatcher=object:Dispatcher(){override fun dispatch(request:RecordedRequest):MockResponse {
        if(request.path!="/shared/rhfiles-settings-v1.json")return MockResponse().setResponseCode(404)
        if(request.method=="GET")return MockResponse().setBody(cloud.toString()).addHeader("ETag","\"r$revision\"")
        if(request.method!="PUT")return MockResponse().setResponseCode(405)
        if(request.getHeader("If-Match")!="\"r$revision\"")return MockResponse().setResponseCode(412)
        cloud=JSONObject(request.body.readUtf8());revision++;writes++;return MockResponse().setResponseCode(204)
      }};server.start()
      val storage=RemoteStorage(context,credentialKey={SecretKeySpec(ByteArray(32){7},"AES")});val sync=ConfigSync(context,storage)
      try{
        sync.save(JSONObject().put("enabled",false).put("insecure",true).put("url",server.url("/shared").toString()).put("username","").put("password",""))
        val web=JSONObject().put("rhfiles.favorites","[]")
        fun finish(){val result=sync.run(web,true);assertEquals("ready",result.getString("state"));val applied=sync.apply(result.getString("proposalId"),web);web.put("rhfiles.favorites",applied.getJSONArray("favorites").toString());sync.acknowledge(applied.getString("id"))}
        finish();val favorites=JSONArray(web.getString("rhfiles.favorites"));assertEquals(SharedConfig.canonical(cloud.getJSONArray("favorites")),SharedConfig.canonical(favorites))
        assertEquals(5,storage.connections().length());assertEquals(cloud.getJSONObject("rhvideo").toString(),ConfigSync.rhvideoPrefill(context).toString())
        for(i in 0 until storage.connections().length())assertFalse(storage.editable(storage.connections().getJSONObject(i).getString("id")).getBoolean("hasPassword"))
        finish();assertEquals(0,writes)
        favorites.getJSONObject(0).put("label","Android 改名: 保持路径");web.put("rhfiles.favorites",favorites.toString());finish()
        assertEquals("Android 改名: 保持路径",cloud.getJSONArray("favorites").getJSONObject(0).getString("label"))
        assertEquals(5,cloud.getJSONArray("profiles").length());assertFalse(cloud.toString().contains("password"))
        assertEquals("/shared/rhfiles-settings-v1.json",server.takeRequest().path)
      }finally{sync.close()}
    }
  }
}
