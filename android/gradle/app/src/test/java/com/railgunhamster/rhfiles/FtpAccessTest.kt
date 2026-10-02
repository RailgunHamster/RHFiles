package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.json.JSONObject
import org.apache.commons.net.ftp.FTPClient
import org.apache.commons.net.ftp.FTP
import java.io.File
import java.io.ByteArrayInputStream
import java.nio.file.Files
import java.net.ServerSocket

@RunWith(RobolectricTestRunner::class)
@Config(manifest=Config.NONE,sdk=[28])
class FtpAccessTest {
  private fun serve(readOnly:Boolean,block:(File,FTPClient,Int)->Unit) {
    val fixture=Files.createTempDirectory("rhfiles-ftp-access-").toFile();val root=File(fixture,"shared").apply{mkdir()};val port=ServerSocket(0).use{it.localPort}
    File(fixture,"outside-secret.txt").writeText("must not be exposed")
    File(root,"existing.txt").writeText("original")
    val server=FtpAccess.create(root,port,"test-password",readOnly,"127.0.0.1");val client=FTPClient().apply{connectTimeout=5000;defaultTimeout=5000}
    try {
      server.start();client.connect("127.0.0.1",port);assertTrue(client.login("rhfiles","test-password"));client.enterLocalPassiveMode();client.setFileType(FTP.BINARY_FILE_TYPE)
      block(root,client,port)
    }finally{if(client.isConnected)client.disconnect();server.stop();fixture.deleteRecursively()}
  }
  @Test fun readOnlyServerRejectsWritesAndAnonymousAccess()=serve(true){root,client,port->
    assertEquals("existing.txt",client.listFiles().single().name)
    val stream=client.retrieveFileStream("existing.txt")!!;assertEquals("original",stream.bufferedReader().use{it.readText()});assertTrue(client.completePendingCommand())
    assertFalse(client.storeFile("new.txt",ByteArrayInputStream("new".toByteArray())));assertFalse(File(root,"new.txt").exists())
    val anonymous=FTPClient();try{anonymous.connect("127.0.0.1",port);assertFalse(anonymous.login("anonymous",""))}finally{anonymous.disconnect()}
    val wrongPassword=FTPClient();try{wrongPassword.connect("127.0.0.1",port);assertFalse(wrongPassword.login("rhfiles","wrong-password"))}finally{wrongPassword.disconnect()}
  }
  @Test fun uploadModeCannotOverwriteRenameOrDeleteExistingFiles()=serve(false){root,client,_->
    assertTrue(client.storeFile("new.txt",ByteArrayInputStream("new".toByteArray())));assertEquals("new",File(root,"new.txt").readText())
    assertFalse(client.storeFile("existing.txt",ByteArrayInputStream("overwrite".toByteArray())))
    assertFalse(client.deleteFile("existing.txt"));assertFalse(client.rename("existing.txt","renamed.txt"));assertEquals("original",File(root,"existing.txt").readText())
  }
  @Test fun serverJailCannotReadOutsideRoot()=serve(true){root,client,_->
    assertTrue(File(root.parentFile,"outside-secret.txt").exists())
    assertNull(client.retrieveFileStream("../outside-secret.txt"));assertTrue(client.replyCode>=400)
    assertNull(client.retrieveFileStream(File(root.parentFile,"outside-secret.txt").absolutePath));assertTrue(client.replyCode>=400)
  }
  @Test fun serverLimitsConcurrentLogins()=serve(true){_,_,port->
    val extra=mutableListOf<FTPClient>()
    try {
      repeat(3){val client=FTPClient();extra.add(client);client.connect("127.0.0.1",port);assertTrue(client.login("rhfiles","test-password"))}
      val fifth=FTPClient();extra.add(fifth);fifth.connect("127.0.0.1",port)
      try{assertFalse(fifth.login("rhfiles","test-password"))}catch(_:org.apache.commons.net.ftp.FTPConnectionClosedException){}
      assertEquals(421,fifth.replyCode)
    }finally{extra.forEach{if(it.isConnected)it.disconnect()}}
  }
  @Test fun delayedServiceCleanupDoesNotStopReplacementServer() {
    val context=RuntimeEnvironment.getApplication()
    val root=File(context.cacheDir,"exports/ftp-lifecycle-${java.util.UUID.randomUUID()}").apply{mkdirs()}
    fun start()=FtpAccess.start(context,JSONObject().put("root",root.path).put("port",ServerSocket(0).use{it.localPort}).put("trustedNetwork",true))
    try {
      start();val old=FtpAccess.instanceToken!!;FtpAccess.stop();val current=start()
      FtpAccess.stopAsync(old)!!.join(5000)
      assertTrue(FtpAccess.running);assertEquals(current.getInt("port"),FtpAccess.status().getInt("port"))
      FtpAccess.stopAsync(FtpAccess.instanceToken)!!.join(5000);assertFalse(FtpAccess.running)
    }finally{FtpAccess.stop();root.deleteRecursively()}
  }
}
