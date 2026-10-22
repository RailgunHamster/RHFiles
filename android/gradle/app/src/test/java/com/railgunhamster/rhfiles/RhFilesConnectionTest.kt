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
  private fun https(block:(MockWebServer,JSONObject)->Unit){
    val cert=HeldCertificate.Builder().commonName("paired-pc").build()
    val tls=HandshakeCertificates.Builder().heldCertificate(cert).build()
    MockWebServer().use{server->server.useHttps(tls.sslSocketFactory(),false);server.start();
      val fingerprint=MessageDigest.getInstance("SHA-256").digest(cert.certificate.encoded).joinToString(""){"%02x".format(it)}
      block(server,JSONObject().put("url",server.url("/").toString()).put("fingerprint",fingerprint).put("username","device").put("password","private-secret"))
    }
  }
  @Test fun pairedSelfSignedCertificateAndUnicodeListingUseNativeApi(){https{server,c->
    val item=JSONObject().put("name","中文 a.txt").put("path","/Files/中文 a.txt").put("isDir",false).put("size",3).put("modifiedMs",1)
    server.enqueue(MockResponse().setBody(JSONObject().put("revision","r1").put("total",1).put("entries",org.json.JSONArray().put(item)).toString()))
    val entries=RhFilesConnection(c).list("Files","remote://test/Files");assertEquals("中文 a.txt",entries.single().name);assertTrue(entries.single().path.contains("%E4%B8%AD"))
    val request=server.takeRequest(5,TimeUnit.SECONDS)!!;assertTrue(request.path!!.startsWith("/api/v1/list?"));assertTrue(request.getHeader("Authorization")!!.startsWith("Basic "));assertFalse(request.path!!.contains("private-secret"))
  }}
  @Test fun wrongCertificateIsRejectedBeforeHttpCredentialsAreSent(){https{server,c->
    c.put("fingerprint","0".repeat(64));server.enqueue(MockResponse().setBody("should not read"))
    try{RhFilesConnection(c).stat("Files","remote://test/Files");fail("Wrong certificate accepted")}catch(e:javax.net.ssl.SSLException){assertEquals(0,server.requestCount)}
  }}
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
    try{RhFilesConnection(c).stat("Files","remote://test/Files");fail("Redirect followed")}catch(e:RhFilesConnection.HttpFailure){assertEquals(302,e.status);assertEquals(1,server.requestCount)}
  }}
  @Test fun invalidEndpointsAreRejected(){
    for(url in listOf("http://localhost:39128/","https://user:pass@localhost/","https://localhost/dav/","https://localhost/?secret=1")){
      try{RhFilesConnection.valid(JSONObject().put("url",url).put("fingerprint","0".repeat(64)));fail(url)}catch(_:IllegalArgumentException){}
    }
  }
}
