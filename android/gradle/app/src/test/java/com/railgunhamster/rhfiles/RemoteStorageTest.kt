package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.json.JSONObject
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.MockResponse
import org.apache.ftpserver.FtpServerFactory
import org.apache.ftpserver.listener.ListenerFactory
import org.apache.ftpserver.usermanager.impl.BaseUser
import org.apache.ftpserver.usermanager.impl.WritePermission
import java.io.ByteArrayInputStream
import java.nio.file.Files
import java.io.File
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@Config(manifest=Config.NONE,sdk=[28])
class RemoteStorageTest {
  @Test fun closingAReadOnlyHttpStreamInterruptsItsPendingSocketRead(){
    MockWebServer().use{server->
      server.start();server.enqueue(MockResponse().setBody("x".repeat(64)).setHeader("Content-Length",1024*1024))
      val store=RemoteStorage(context){JSONObject().put("type","webdav").put("url",server.url("/dav/").toString())}
      val stream=store.mediaInput("remote://test/slow.txt").stream
      val started=java.util.concurrent.CountDownLatch(1)
      val reader=Thread{try{val buffer=ByteArray(8192);stream.read(buffer);started.countDown();stream.read(buffer)}catch(_:java.io.IOException){}finally{stream.close()}}.apply{isDaemon=true;start()}
      assertTrue("First bytes arrived",started.await(2,TimeUnit.SECONDS));val start=System.nanoTime();stream.close();reader.join(2000)
      assertFalse("Close interrupts the read instead of waiting ten seconds",reader.isAlive);assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<2000)
    }
  }
  private val context get()=RuntimeEnvironment.getApplication()
  private fun xml(vararg names:String)= """<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${names.joinToString(""){"<d:response><d:href>/dav/$it</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>5</d:getcontentlength></d:prop></d:propstat></d:response>"}}</d:multistatus>"""
  @Test fun webdavUsesEncodedNamesAndAuthorizationHeader() {
    MockWebServer().use { server->server.start();server.enqueue(MockResponse().setResponseCode(207).setBody(xml("%E4%B8%AD%E6%96%87%20a.txt","a%26b.txt")))
      val store=RemoteStorage(context){JSONObject().put("type","webdav").put("url",server.url("/dav/").toString()).put("username","user").put("password","secret")}
      val entries=store.list("remote://test/");assertEquals(listOf("中文 a.txt","a&b.txt"),entries.map{it.name})
      val request=server.takeRequest(5,TimeUnit.SECONDS)!!;assertEquals("PROPFIND",request.method);assertEquals("1",request.getHeader("Depth"));assertEquals("/dav/",request.path);assertTrue(request.getHeader("Authorization")!!.startsWith("Basic "));assertFalse(request.path!!.contains("secret"))
      server.enqueue(MockResponse().setBody("hello"));assertEquals("hello",store.input(entries[0].path).bufferedReader().use{it.readText()})
      assertEquals("/dav/%E4%B8%AD%E6%96%87%20a.txt",server.takeRequest(5,TimeUnit.SECONDS)!!.path)
    }
  }
  @Test fun webdavRejectsExternalEntitiesAndDoesNotFollowRedirects() {
    MockWebServer().use {server->server.start();val store=RemoteStorage(context){JSONObject().put("type","webdav").put("url",server.url("/dav/").toString())}
      server.enqueue(MockResponse().setResponseCode(207).setBody("<!DOCTYPE x [<!ENTITY leak SYSTEM 'file:///private'>]><x>&leak;</x>"))
      try{store.list("remote://test/");fail("XXE accepted")}catch(_:Exception){}
      server.enqueue(MockResponse().setResponseCode(302).addHeader("Location","http://127.0.0.1:1/secret"))
      try{store.input("remote://test/file");fail("Redirect accepted")}catch(e:Exception){assertTrue(e.message!!.contains("302"))}
      assertEquals(2,server.requestCount)
    }
  }
  @Test fun webdavUploadStreamsProgressAndCreateIsConditional() {
    MockWebServer().use {server->server.start();val store=RemoteStorage(context){JSONObject().put("type","webdav").put("url",server.url("/dav/").toString())}
      server.enqueue(MockResponse().setResponseCode(201));val path=store.create("remote://test/","empty.txt",false)
      assertEquals("*",server.takeRequest(5,TimeUnit.SECONDS)!!.getHeader("If-None-Match"))
      server.enqueue(MockResponse().setResponseCode(204));var bytes=0L;store.write(path,ByteArrayInputStream("你好".toByteArray())){bytes+=it}
      assertEquals(6,bytes);assertEquals("你好",server.takeRequest(5,TimeUnit.SECONDS)!!.body.readUtf8())
    }
  }
  @Test fun webdavDirectoryCreationUsesEncodedConditionalMkcolAndKeepsPermissionErrors(){
    MockWebServer().use{server->server.start();val store=RemoteStorage(context){JSONObject().put("type","webdav").put("url",server.url("/dav/").toString())}
      server.enqueue(MockResponse().setResponseCode(201));assertTrue(store.create("remote://test/","新建 中文",true).contains("%"));val request=server.takeRequest(5,TimeUnit.SECONDS)!!;assertEquals("MKCOL",request.method);assertEquals("*",request.getHeader("If-None-Match"));assertTrue(request.path!!.contains("%20"))
      for(status in listOf(403,405)){server.enqueue(MockResponse().setResponseCode(status));try{store.create("remote://test/","新建 中文",true);fail("Rejected MKCOL succeeded")}catch(e:Exception){assertTrue(e.message!!.contains(status.toString()))};assertEquals("MKCOL",server.takeRequest(5,TimeUnit.SECONDS)!!.method)}
      assertEquals(3,server.requestCount)
    }
  }
  @Test fun ftpListsStreamsRenamesAndDeletesAgainstRealLocalServer() {
    val root=Files.createTempDirectory("rhfiles-ftp-test-").toFile()
    val factory=FtpServerFactory();val listener=ListenerFactory().apply{port=0}.createListener();factory.addListener("default",listener)
    factory.userManager.save(BaseUser().apply{name="test";password="test";homeDirectory=root.path;authorities=listOf(WritePermission())})
    val server=factory.createServer()
    try {
      server.start();val port=listener.port
      File(root,"existing.txt").writeText("original")
      val store=RemoteStorage(context){JSONObject().put("type","ftp").put("host","127.0.0.1").put("port",port).put("username","test").put("password","test")}
      assertEquals("existing.txt",store.list("remote://test/").single().name)
      val folder=store.create("remote://test/","新建 中文",true);assertTrue(File(root,"新建 中文").isDirectory);File(root,"新建 中文/marker.txt").writeText("keep")
      try{store.create("remote://test/","新建 中文",true);fail("Duplicate directory accepted")}catch(_:Exception){};assertEquals("keep",File(root,"新建 中文/marker.txt").readText())
      val file=store.create("remote://test/","copy.txt",false);var bytes=0L
      store.write(file,ByteArrayInputStream("copied".toByteArray())){bytes+=it}
      assertEquals(6,bytes);assertEquals("copied",store.input(file).bufferedReader().use{it.readText()})
      val renamed=store.rename(file,"renamed.txt");assertTrue(File(root,"renamed.txt").exists());store.delete(renamed);assertFalse(File(root,"renamed.txt").exists())
      assertEquals("original",File(root,"existing.txt").readText())
    } finally {server.stop();root.deleteRecursively()}
  }
}
