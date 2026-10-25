package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.json.JSONObject
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.MockResponse
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)@Config(manifest=Config.NONE,sdk=[28])
class RhFilesConnectionTest {
  private var baseline=0
  private fun https(block:(MockWebServer,JSONObject)->Unit){
    GroupConnectionsTest().fixture{f->
      val c=f.config();RhFilesConnection(c).stat("Files/file.txt","remote://test/Files/file.txt")
      baseline=f.server.requestCount;repeat(baseline){f.server.takeRequest(5,TimeUnit.SECONDS)}
      f.server.dispatcher=okhttp3.mockwebserver.QueueDispatcher()
      block(f.server,c)
    }
  }
  @Test fun groupPinnedSelfSignedCertificateAndUnicodeListingUseNativeApi(){https{server,c->
    val item=JSONObject().put("name","中文 a.txt").put("path","/Files/中文 a.txt").put("isDir",false).put("size",3).put("modifiedMs",1)
    server.enqueue(MockResponse().setBody(JSONObject().put("revision","r1").put("total",1).put("entries",org.json.JSONArray().put(item)).toString()))
    val entries=RhFilesConnection(c).list("Files","remote://test/Files");assertEquals("中文 a.txt",entries.single().name);assertTrue(entries.single().path.contains("%E4%B8%AD"))
    val request=server.takeRequest(5,TimeUnit.SECONDS)!!;assertTrue(request.path!!.startsWith("/api/v1/list?"));assertTrue(request.getHeader("Authorization")!!.startsWith("Basic "));assertFalse(request.path!!.contains("private-secret"))
  }}
  @Test fun wrongCertificateIsRejectedBeforeHttpCredentialsAreSent(){https{server,c->
    c.put("fingerprint","0".repeat(64));server.enqueue(MockResponse().setBody("should not read"))
    try{RhFilesConnection(c).stat("Files","remote://test/Files");fail("Wrong certificate accepted")}catch(e:GroupIdentityFailure){assertEquals(baseline,server.requestCount)}
  }}
  @Test fun independentProfilesCannotSendStoredPasswords(){
    MockWebServer().use{server->server.start();val c=JSONObject().put("url","https://127.0.0.1:"+server.port).put("fingerprint","0".repeat(64)).put("username","old-phone").put("password","old-private-secret")
      try{RhFilesConnection(c).stat("Files/file.txt","remote://old/Files/file.txt");fail("Independent profile accepted")}catch(e:IllegalArgumentException){assertTrue(e.message!!.contains("设备组"))}
      assertEquals(0,server.requestCount)
    }
  }
  @Test fun uploadUsesTusAndRecoversAnOffsetConflictWithoutWholeFilePut(){https{server,c->
    val target="/api/v1/uploads/"+"x".repeat(43)
    server.enqueue(MockResponse().setResponseCode(201).addHeader("Location",target))
    server.enqueue(MockResponse().setResponseCode(409))
    server.enqueue(MockResponse().setResponseCode(200).addHeader("Upload-Offset","2"))
    server.enqueue(MockResponse().setResponseCode(204).addHeader("Upload-Offset","5"))
    server.enqueue(MockResponse().setResponseCode(204))
    var progress=0;RhFilesConnection(c).upload("Files/new.txt","hello".byteInputStream(),5){progress+=it};assertEquals(5,progress)
    val requests=(0..4).map{server.takeRequest(5,TimeUnit.SECONDS)!!};assertEquals(listOf("POST","PATCH","HEAD","PATCH","DELETE"),requests.map{it.method});assertEquals("2",requests[3].getHeader("Upload-Offset"));assertEquals("llo",requests[3].body.readUtf8())
  }}
  @Test fun redirectsNeverLeakDeviceAuthorization(){https{server,c->
    server.enqueue(MockResponse().setResponseCode(302).addHeader("Location","https://example.com/steal"))
    try{RhFilesConnection(c).stat("Files","remote://test/Files");fail("Redirect followed")}catch(e:RhFilesConnection.HttpFailure){assertEquals(302,e.status);assertEquals(baseline+1,server.requestCount)}
  }}
  @Test fun emptyFilesAreReadWithoutAnUnsatisfiableRange(){https{server,c->
    server.dispatcher=object:okhttp3.mockwebserver.Dispatcher(){
      override fun dispatch(request:okhttp3.mockwebserver.RecordedRequest)=
        if(request.getHeader("Range")!=null)MockResponse().setResponseCode(416)
        else MockResponse().setBody("")
    }
    RhFilesConnection(c).content("Files/empty.txt").use{response->
      assertEquals(200,response.code);assertEquals(0L,response.body!!.contentLength());assertEquals(-1,response.body!!.byteStream().read())
    }
    assertNull(server.takeRequest(5,TimeUnit.SECONDS)!!.getHeader("Range"))
  }}
  @Test fun wholeFileReadsDoNotRequireRangeSupport(){https{server,c->
    server.enqueue(MockResponse().setBody("whole file"))
    RhFilesConnection(c).content("Files/full.txt").use{assertEquals("whole file",it.body!!.string())}
    val request=server.takeRequest(5,TimeUnit.SECONDS)!!
    assertNull(request.getHeader("Range"));assertEquals("identity",request.getHeader("Accept-Encoding"))
  }}
  @Test fun positiveOffsetsStillRequestPartialContentAndNegativeOffsetsNeverReachTheNetwork(){https{server,c->
    server.enqueue(MockResponse().setResponseCode(206).addHeader("Content-Range","bytes 2-4/5").setBody("llo"))
    RhFilesConnection(c).content("Files/full.txt",2).use{assertEquals(206,it.code);assertEquals("llo",it.body!!.string())}
    assertEquals("bytes=2-",server.takeRequest(5,TimeUnit.SECONDS)!!.getHeader("Range"))
    server.enqueue(MockResponse().setBody("must not be requested"))
    try{RhFilesConnection(c).content("Files/full.txt",-1);fail("Negative offset accepted")}catch(_:IllegalArgumentException){}
    assertEquals(baseline+1,server.requestCount)
  }}
  @Test fun invalidEndpointsAreRejected(){
    for(url in listOf("http://localhost:39128/","https://user:pass@localhost/","https://localhost/dav/","https://localhost/?secret=1","https://8.8.8.8/","https://example.com/","https://100.128.0.1/")){
      try{RhFilesConnection.valid(JSONObject().put("url",url).put("fingerprint","0".repeat(64)));fail(url)}catch(_:IllegalArgumentException){}
    }
  }
  @Test fun sharedRootsRejectDestructiveOperationsWithoutNetworkAccess(){
    val store=RemoteStorage(org.robolectric.RuntimeEnvironment.getApplication(),profileLookup={JSONObject().put("type","rhfiles").put("name","QA").put("url","https://127.0.0.1:1/").put("fingerprint","0".repeat(64)).put("groupId","a".repeat(64)).put("groupPeerId","b".repeat(64))})
    assertTrue(store.isRhFilesRoot("remote://qa/Files/"));assertFalse(store.isRhFilesRoot("remote://qa/Files/child"))
    for(path in listOf("remote://qa/","remote://qa/Files")){
      try{store.delete(path);fail("Shared root deleted")}catch(e:IllegalArgumentException){assertTrue(e.message!!.contains("共享入口"))}
      try{store.rename(path,"new");fail("Shared root renamed")}catch(e:IllegalArgumentException){assertTrue(e.message!!.contains("共享入口"))}
    }
  }
}
