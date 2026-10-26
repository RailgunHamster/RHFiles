package com.railgunhamster.rhfiles

import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.security.*
import java.security.spec.ECGenParameterSpec

@RunWith(RobolectricTestRunner::class)@Config(manifest=Config.NONE,sdk=[28])
class DeviceGroupServiceModelTest {
  private class Identity:DeviceGroupModel.Identity {
    val pair=KeyPairGenerator.getInstance("EC").apply{initialize(ECGenParameterSpec("secp256r1"))}.generateKeyPair()
    override val publicKey=DeviceGroupModel.publicKey(pair.public)
    override fun sign(bytes:ByteArray)=Signature.getInstance("SHA256withECDSA").run{initSign(pair.private);update(bytes);sign()}
  }
  private class Node {val key=Identity();val model=DeviceGroupModel(key,null){}}
  private fun args(vararg pairs:Pair<String,Any>)=JSONObject().also{v->pairs.forEach{v.put(it.first,it.second)}}
  private fun add(a:Node,b:Node,id:String){val r=a.model.run("approve",args("id" to id,"uri" to (b.model.run("request",args("deviceName" to "Phone")) as JSONObject).getString("uri"),"canInvite" to true)) as JSONObject;b.model.run("join",args("uri" to r.getString("uri"),"confirmed" to true))}
  private fun denied(fn:()->Unit){try{fn();fail("Denied operation was accepted")}catch(_:IllegalArgumentException){}catch(_:IllegalStateException){}}
  @Test fun serviceUsesLiveGrantsLocalRefusalsAndNewIncarnationAfterForget(){
    val desktop=Node();val phone=Node();val id=desktop.model.run("create",args("name" to "RH","deviceName" to "Desktop")) as String;add(desktop,phone,id)
    val first=phone.model.serviceAccess(id,desktop.model.deviceId,true).getString("epoch")
    phone.model.run("configure",args("id" to id,"enabled" to true,"permissions" to args("write" to true,"delete" to true)))
    assertTrue(phone.model.serviceAccess(id,desktop.model.deviceId,true).getJSONObject("permissions").getBoolean("write"));assertEquals(first,phone.model.serviceAccess(id,desktop.model.deviceId,true).getString("epoch"))
    phone.model.run("configure",args("id" to id,"enabled" to false));denied{phone.model.serviceAccess(id,desktop.model.deviceId,true)};val revoked=phone.model.serviceAccess(id,desktop.model.deviceId,false).getString("epoch");assertNotEquals(first,revoked)
    phone.model.run("configure",args("id" to id,"enabled" to true,"permissions" to args("write" to true,"delete" to true)));assertEquals(revoked,phone.model.serviceAccess(id,desktop.model.deviceId,true).getString("epoch"))
    phone.model.run("remove",args("id" to id,"peer" to desktop.model.deviceId));denied{phone.model.serviceAccess(id,desktop.model.deviceId,false)}
    phone.model.run("restore",args("id" to id,"peer" to desktop.model.deviceId,"confirmed" to true));assertNotEquals(revoked,phone.model.serviceAccess(id,desktop.model.deviceId,true).getString("epoch"));phone.model.run("forget",args("id" to id,"confirmed" to true));denied{phone.model.serviceAccess(id,desktop.model.deviceId,false)}
    add(desktop,phone,id);assertNotEquals(first,phone.model.serviceAccess(id,desktop.model.deviceId,true).getString("epoch"))
  }
  @Test fun serviceAdvertisementsAndNativeServerProofsUseTheExistingDeviceIdentity(){
    val phone=Node();val id=phone.model.run("create",args("name" to "RH","deviceName" to "Phone")) as String
    val server=args("endpoints" to org.json.JSONArray().put("https://192.168.0.10:39128"),"fingerprint" to "a".repeat(64))
    phone.model.serviceAdvertise(server);phone.model.serviceAdvertise(server)
    val ad=DeviceGroupModel.read(phone.model.packet(id).getJSONArray("servers").getJSONObject(0));assertEquals(phone.key.publicKey,ad.getString("key"));assertEquals(2L,ad.getLong("seq"))
    val nonce=DeviceGroupModel.encode(ByteArray(32){7});val c=args("v" to 1,"kind" to "server-auth","group" to id,"key" to phone.key.publicKey,"issuer" to phone.key.publicKey,"name" to "","label" to "a".repeat(64),"invite" to false,"nonce" to nonce,"seq" to 0,"server" to JSONObject.NULL)
    val payload=c.toString().toByteArray();val message="RHFiles-Group-v1\u0000".toByteArray()+payload
    val signed=args("payload" to DeviceGroupModel.encode(payload),"signature" to DeviceGroupModel.encode(phone.model.serviceSign(message)))
    DeviceGroupModel.verifyServerProof(signed,id,nonce,"a".repeat(64),phone.model.deviceId)
    denied{phone.model.serviceSign("OtherDomain".toByteArray()+payload)}
    denied{phone.model.serviceSign("RHFiles-Group-v1\u0000".toByteArray()+c.put("kind","root").toString().toByteArray())}
  }
}
