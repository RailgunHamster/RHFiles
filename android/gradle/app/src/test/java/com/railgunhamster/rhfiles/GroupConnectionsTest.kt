package com.railgunhamster.rhfiles

import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.json.*
import okhttp3.mockwebserver.*
import okhttp3.tls.*
import java.security.*
import java.security.spec.ECGenParameterSpec
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicInteger

@RunWith(RobolectricTestRunner::class)@Config(manifest=Config.NONE,sdk=[28])
class GroupConnectionsTest {
  private class Key:DeviceGroupModel.Identity {
    private val pair=KeyPairGenerator.getInstance("EC").apply{initialize(ECGenParameterSpec("secp256r1"))}.generateKeyPair()
    override val publicKey=DeviceGroupModel.publicKey(pair.public)
    override fun sign(bytes:ByteArray)=Signature.getInstance("SHA256withECDSA").run{initSign(pair.private);update(bytes);sign()}
  }
  private fun obj(vararg pairs:Pair<String,Any>)=JSONObject().also{v->pairs.forEach{v.put(it.first,it.second)}}
  private fun claims(key:Key,kind:String,id:String,fp:String,nonce:String="",server:JSONObject?=null)=obj("v" to 1,"kind" to kind,"group" to id,"key" to key.publicKey,"issuer" to key.publicKey,"name" to "","label" to if(kind=="server-auth")fp else "","invite" to false,"nonce" to nonce,"seq" to if(kind=="server")1 else 0,"server" to (server?:JSONObject.NULL))
  private fun sign(key:Key,value:JSONObject):JSONObject {val bytes=value.toString().toByteArray();return obj("payload" to DeviceGroupModel.encode(bytes),"signature" to DeviceGroupModel.encode(key.sign("RHFiles-Group-v1\u0000".toByteArray()+bytes)))}
  private class Fixture:java.io.Closeable {
    val cert=HeldCertificate.Builder().commonName("group-host").build()
    val server=MockWebServer()
    val hostKey=Key();val phoneKey=Key()
    val host=DeviceGroupModel(hostKey,null){}
    val phone=DeviceGroupModel(phoneKey,null){}
    val id:String;val url:String;val fp:String;val peer=host.deviceId
    val mutations=AtomicInteger()
    var onRequest:((RecordedRequest)->MockResponse?)?=null
    init {
      server.useHttps(HandshakeCertificates.Builder().heldCertificate(cert).build().sslSocketFactory(),false)
      server.start(java.net.InetAddress.getByAddress(byteArrayOf(127,0,0,1)),0)
      url="https://127.0.0.1:${server.port}"
      fp=MessageDigest.getInstance("SHA-256").digest(cert.certificate.encoded).joinToString(""){"%02x".format(it)}
      id=host.run("create",JSONObject().put("name","QA").put("deviceName","Host"))as String
      val request=phone.run("request",JSONObject().put("deviceName","Phone"))as JSONObject
      val approved=host.run("approve",JSONObject().put("id",id).put("uri",request.getString("uri")))as JSONObject
      phone.run("join",JSONObject().put("uri",approved.getString("uri")).put("confirmed",true))
    }
    fun config(saved:String=url)=JSONObject().put("type","rhfiles").put("url",saved).put("fingerprint",fp).put("groupId",id).put("groupPeerId",peer)
    override fun close(){server.close();GroupConnections.invalidate()}
  }
  private fun fixture(block:(Fixture)->Unit){Fixture().use{f->
    fun advertise(addresses:List<String>){val packet=f.host.packet(f.id);packet.getJSONArray("servers").put(sign(f.hostKey,claims(f.hostKey,"server",f.id,f.fp,server=obj("endpoints" to JSONArray(addresses),"fingerprint" to f.fp))));f.host.importPacket(f.id,packet);f.phone.importPacket(f.id,f.host.packet(f.id))}
    advertise(listOf(f.url,"https://127.0.0.1:1"))
    val context=org.robolectric.RuntimeEnvironment.getApplication()
    DeviceGroups::class.java.getDeclaredField("model").apply{isAccessible=true;set(null,f.phone)}
    DeviceGroups::class.java.getDeclaredField("owner").apply{isAccessible=true;set(null,context)}
    GroupConnections.install(context);GroupConnections.invalidate()
    f.server.dispatcher=object:Dispatcher(){override fun dispatch(request:RecordedRequest):MockResponse{
      f.onRequest?.invoke(request)?.let{return it}
      return when(request.requestUrl!!.encodedPath){
        "/api/v1/groups/challenge"->MockResponse().setBody(obj("nonce" to "A".repeat(43)).toString())
        "/api/v1/groups/session"->{val body=JSONObject(request.body.readUtf8());assertEquals("auth",DeviceGroupModel.read(body.getJSONObject("proof")).getString("kind"));MockResponse().setBody(obj("credential" to obj("username" to "test-user","password" to "fixture-private-secret"),"packet" to f.host.packet(f.id),"serverProof" to sign(f.hostKey,claims(f.hostKey,"server-auth",f.id,f.fp,body.getString("nonce")))).toString())}
        "/api/v1/capabilities"->MockResponse().setBody("{}")
        "/api/v1/stat"->MockResponse().setBody(obj("name" to "file.txt","isDir" to false,"size" to 3,"modifiedMs" to 1).toString())
        "/api/v1/rename"->{f.mutations.incrementAndGet();MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)}
        else->MockResponse().setResponseCode(404)
      }
    }}
    try{block(f)}finally{DeviceGroups::class.java.getDeclaredField("model").apply{isAccessible=true;set(null,null)}}
  }}
  private fun latest(f:Fixture):JSONObject {val all=GroupConnections.diagnostics();return (0 until all.length()).map{all.getJSONObject(it)}.first{it.optString("group")==f.id}}
  @Test fun ordinaryFileReadRecoversFromOldIpAndReusesTheConnection(){fixture{f->
    val c=f.config("https://127.0.0.1:1")
    assertEquals("file.txt",RhFilesConnection(c).stat("Files/file.txt","remote://qa/Files/file.txt").name)
    val report=latest(f);assertEquals("connected",report.getString("outcome"));assertEquals(f.url,report.getString("endpoint"));assertTrue(report.toString().contains("address_changed_verified"))
    val count=f.server.requestCount;RhFilesConnection(c).stat("Files/file.txt","remote://qa/Files/file.txt");assertEquals(count+1,f.server.requestCount)
    assertFalse(GroupConnections.diagnostics().toString().contains("fixture-private-secret"))
  }}
  @Test fun remotePermissionDenialIsNotTreatedAsOfflineOrRetried(){fixture{f->
    f.onRequest={if(it.path=="/api/v1/capabilities")MockResponse().setResponseCode(403)else null}
    try{GroupConnections.resolve(f.config(),force=true);fail()}catch(e:RhFilesConnection.HttpFailure){assertEquals(403,e.status)}
    assertEquals("authorization_rejected",latest(f).getString("outcome"));assertFalse(latest(f).toString().contains("no_matching_announcement"))
  }}
  @Test fun invalidManualAddressNeverAppearsInDiagnostics(){fixture{f->
    try{GroupConnections.resolve(f.config(),force=true,manual="https://user:topsecret@8.8.8.8/?token=secret");fail()}catch(_:java.io.IOException){}
    val text=latest(f).toString();assertTrue(text.contains("invalid_endpoint"));assertFalse(text.contains("topsecret"));assertFalse(text.contains("token="));assertEquals(0,f.server.requestCount)
  }}
  @Test fun uncertainRenameIsNeverReplayed(){fixture{f->
    try{RhFilesConnection(f.config()).mutate("rename","Files/old","Files/new");fail()}catch(e:java.io.IOException){assertTrue(e.message!!.contains("操作结果未确认"))}
    assertEquals(1,f.mutations.get());assertEquals("operation_unconfirmed",latest(f).getString("outcome"))
  }}
  @Test fun aLocalNetworkChangeGetsOneBoundedContinuation(){fixture{f->
    val changed=java.util.concurrent.atomic.AtomicBoolean(false)
    f.onRequest={if(it.path=="/api/v1/groups/challenge"&&changed.compareAndSet(false,true))ConnectionNetwork.generation.incrementAndGet();null}
    assertEquals(f.url,GroupConnections.resolve(f.config(),force=true).getString("url"))
    assertTrue(latest(f).toString().contains("local_network_changed"));assertTrue(latest(f).getLong("durationMs")<15000)
  }}
  @Test fun cancellationStopsInFlightIoWithoutWaitingForTheFullTimeout(){fixture{f->
    val entered=CountDownLatch(1);f.onRequest={if(it.path=="/api/v1/groups/challenge"){entered.countDown();MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE)}else null}
    val pool=Executors.newSingleThreadExecutor();val future=pool.submit<Boolean>{try{GroupConnections.resolve(f.config(),trigger="manual",force=true);false}catch(_:java.io.IOException){true}}
    try{assertTrue(entered.await(5,TimeUnit.SECONDS));assertTrue(GroupConnections.cancel(f.id,f.peer));assertTrue(future.get(3,TimeUnit.SECONDS));assertEquals("cancelled",latest(f).getString("outcome"))}finally{pool.shutdownNow()}
  }}
  @Test fun aSlowActualResponseIsNotTreatedAsOfflineOrRediscovered(){fixture{f->
    // Robolectric deliberately freezes Android's elapsed clock while real
    // socket I/O waits. Advance that test clock as well as delaying real TLS.
    f.onRequest={if(it.requestUrl!!.encodedPath=="/api/v1/stat"){org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMillis(2100));MockResponse().setHeadersDelay(2100,TimeUnit.MILLISECONDS).setBody(obj("name" to "file.txt","isDir" to false,"size" to 3,"modifiedMs" to 1).toString())}else null}
    assertEquals("file.txt",RhFilesConnection(f.config()).stat("Files/file.txt","remote://qa/Files/file.txt").name)
    assertEquals(4,f.server.requestCount);val report=latest(f);assertEquals("connected",report.getString("outcome"));assertTrue(report.toString().contains("response_slow"));assertFalse(report.toString().contains("mdns"))
  }}
  @Test fun serverBusinessErrorsNeverStartAddressDiscovery(){fixture{f->
    f.onRequest={if(it.requestUrl!!.encodedPath=="/api/v1/stat")MockResponse().setResponseCode(500)else null}
    try{RhFilesConnection(f.config()).stat("Files/file.txt","remote://qa/Files/file.txt");fail()}catch(e:RhFilesConnection.HttpFailure){assertEquals(500,e.status)}
    assertEquals(4,f.server.requestCount);assertEquals("server_response_error",latest(f).getString("outcome"))
  }}
  @Test fun closingAManualConnectionNeverCancelsABackgroundFileOwner(){fixture{f->
    val entered=CountDownLatch(1);val release=CountDownLatch(1)
    f.onRequest={if(it.path=="/api/v1/groups/challenge"){entered.countDown();check(release.await(3,TimeUnit.SECONDS))};null}
    val pool=Executors.newFixedThreadPool(2)
    val file=pool.submit<String>{GroupConnections.resolve(f.config()).getString("url")}
    try{
      assertTrue(entered.await(3,TimeUnit.SECONDS))
      val manual=pool.submit<Boolean>{try{GroupConnections.resolve(f.config(),trigger="manual",force=true);false}catch(_:java.io.InterruptedIOException){true}}
      val end=System.nanoTime()+TimeUnit.SECONDS.toNanos(2);var cancelled=false
      while(!cancelled&&System.nanoTime()<end){cancelled=GroupConnections.cancel(f.id,f.peer);if(!cancelled)Thread.sleep(10)}
      assertTrue(cancelled);release.countDown();assertEquals(f.url,file.get(3,TimeUnit.SECONDS));assertTrue(manual.get(3,TimeUnit.SECONDS));assertEquals(3,f.server.requestCount)
    }finally{release.countDown();pool.shutdownNow()}
  }}
  @Test fun exhaustedHandshakeAttemptIsATimeoutNotRevocationAndAnotherAddressCanSucceed(){fixture{f->
    MockWebServer().use{alternate->
      alternate.useHttps(HandshakeCertificates.Builder().heldCertificate(f.cert).build().sslSocketFactory(),false);alternate.start(java.net.InetAddress.getByAddress(byteArrayOf(127,0,0,1)),0)
      val next="https://127.0.0.1:${alternate.port}"
      val packet=f.host.packet(f.id);packet.getJSONArray("servers").put(0,sign(f.hostKey,claims(f.hostKey,"server",f.id,f.fp,server=obj("endpoints" to JSONArray(listOf(f.url,next)),"fingerprint" to f.fp)).put("seq",2)))
      f.host.importPacket(f.id,packet);f.phone.importPacket(f.id,f.host.packet(f.id));alternate.dispatcher=f.server.dispatcher
      val once=java.util.concurrent.atomic.AtomicBoolean(false)
      // Simulate time spent in Keystore/CPU work after a challenge arrives.
      f.onRequest={if(it.path=="/api/v1/groups/challenge"&&once.compareAndSet(false,true))org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMillis(3100));null}
      assertEquals(next,GroupConnections.resolve(f.config(),force=true).getString("url"))
      val report=latest(f);assertEquals("connected",report.getString("outcome"));assertTrue(report.toString().contains("timeout"));assertFalse(report.toString().contains("authorization_revoked"))
    }
  }}
  @Test fun aLongFailedRunDoesNotConsumeItsOwnCooldown(){fixture{f->
    f.onRequest={if(it.path=="/api/v1/groups/challenge"){org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMillis(16000));MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)}else null}
    try{GroupConnections.resolve(f.config(),force=true);fail()}catch(_:java.io.IOException){}
    val count=f.server.requestCount
    try{GroupConnections.resolve(f.config(),force=true);fail()}catch(_:java.io.IOException){}
    assertEquals(count,f.server.requestCount);assertEquals("cooldown",latest(f).getString("outcome"))
  }}
}
