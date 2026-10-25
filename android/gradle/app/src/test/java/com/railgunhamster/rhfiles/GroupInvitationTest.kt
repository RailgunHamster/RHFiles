package com.railgunhamster.rhfiles

import org.json.*
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import okhttp3.mockwebserver.*
import okhttp3.tls.*
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)@Config(manifest=Config.NONE,sdk=[28])
class GroupInvitationTest {
  private fun args(vararg values:Pair<String,Any>)=JSONObject().also{v->values.forEach{v.put(it.first,it.second)}}
  @Test fun freshPhoneScansAndRedeemsComputerInvitationWithoutIndependentCredentials(){
    val hostKey=GroupConnectionsTest.Key();val phoneKey=GroupConnectionsTest.Key()
    val host=DeviceGroupModel(hostKey,null){};val phone=DeviceGroupModel(phoneKey,null){}
    val id=host.run("create",args("name" to "RH","deviceName" to "Host"))as String
    val context=RuntimeEnvironment.getApplication()
    DeviceGroups.install(context);val model=DeviceGroups::class.java.getDeclaredField("model").apply{isAccessible=true};val old=model.get(null);model.set(null,phone)
    val cert=HeldCertificate.Builder().commonName("Computer").build();val tls=HandshakeCertificates.Builder().heldCertificate(cert).build()
    try{MockWebServer().use{server->
      server.useHttps(tls.sslSocketFactory(),false);server.start(java.net.InetAddress.getByAddress(byteArrayOf(127,0,0,1)),0)
      val pin=MessageDigest.getInstance("SHA-256").digest(cert.certificate.encoded).joinToString(""){"%02x".format(it)}
      val data=args("version" to 1,"groupId" to id,"deviceId" to host.deviceId,"deviceName" to "Computer","token" to "A".repeat(43),"fingerprint" to pin,"endpoints" to JSONArray().put("https://127.0.0.1:${server.port}"),"expiresMs" to 1L)
      val uri=GroupInvitation.PREFIX+DeviceGroupModel.encode(data.toString().toByteArray())
      val public=host.run("export",args("id" to id))as JSONObject;assertFalse(phone.inspectIncoming(public.getString("uri")).getBoolean("joinable"))
      server.dispatcher=object:Dispatcher(){override fun dispatch(request:RecordedRequest):MockResponse{
        assertEquals("/api/v1/groups/invitations/redeem",request.path);assertNull(request.getHeader("Authorization"))
        val body=JSONObject(request.body.readUtf8());assertEquals("A".repeat(43),body.getString("token"))
        val approved=host.run("approve",args("id" to id,"uri" to DeviceGroupModel.uri("rhfiles-group-request:v1:",body.getJSONObject("request")),"canInvite" to false))as JSONObject
        return MockResponse().setBody(DeviceGroupModel.parse(approved.getString("uri"),"rhfiles-group-approval:v1:").toString())
      }}
      val remote=RemoteStorage(context);assertEquals("invitation",DeviceGroups.describe(uri).getString("kind"))
      try{DeviceGroups.joinInvitation(uri,false,remote);fail("Unconfirmed scan joined")}catch(_:IllegalArgumentException){};assertEquals(0,server.requestCount)
      DeviceGroups.joinInvitation(uri,true,remote);assertEquals(1,server.requestCount);phone.requirePeer(id,host.deviceId)
      val group=phone.state().getJSONArray("groups").getJSONObject(0);assertEquals(2,group.getJSONArray("members").length());assertEquals(id,group.getString("id"))
      assertFalse(phone.packet(id).toString().contains("password"));assertEquals(0,remote.backupProfiles().length())
    }}finally{model.set(null,old);GroupConnections.invalidate()}
  }
  @Test fun generalAndInvalidQrAreOnlyReadableContent(){
    for(value in listOf("https://example.com/?hello=中文","hello\n世界","javascript:alert(1)","rhfiles-connect:v1:old","rhfiles-group-invite:v1:invalid")){
      val data=QrContents.describe(value);assertEquals("content",data.getString("kind"));assertEquals(value,data.getString("uri"))
    }
  }
  @Test fun untrustedPublicEndpointsAndMalformedInvitationIdsAreRejected(){
    val data=args("version" to 1,"groupId" to "a".repeat(64),"deviceId" to "b".repeat(64),"fingerprint" to "c".repeat(64),"token" to "A".repeat(43),"endpoints" to JSONArray().put("https://8.8.8.8:39128"),"expiresMs" to 0)
    try{GroupInvitation.parse(GroupInvitation.PREFIX+DeviceGroupModel.encode(data.toString().toByteArray()));fail("Public endpoint accepted")}catch(_:IllegalArgumentException){}
  }
}
