package com.railgunhamster.rhfiles

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.security.*
import java.security.spec.ECGenParameterSpec

@RunWith(RobolectricTestRunner::class)@Config(manifest=Config.NONE,sdk=[28])
class DeviceGroupModelTest {
  private class Key:DeviceGroupModel.Identity {
    private val pair=KeyPairGenerator.getInstance("EC").apply{initialize(ECGenParameterSpec("secp256r1"))}.generateKeyPair()
    override val publicKey=DeviceGroupModel.publicKey(pair.public)
    override fun sign(bytes:ByteArray)=Signature.getInstance("SHA256withECDSA").run{initSign(pair.private);update(bytes);sign()}
  }
  private class Node {val key=Key();var disk:String?=null;var model=DeviceGroupModel(key,null){disk=it};fun restart(){model=DeviceGroupModel(key,disk){disk=it}}}
  private fun args(vararg pairs:Pair<String,Any>)=JSONObject().also{v->pairs.forEach{v.put(it.first,it.second)}}
  private fun create(a:Node)=a.model.run("create",args("name" to "Home","deviceName" to "A")) as String
  private fun add(a:Node,b:Node,id:String,invite:Boolean=false):JSONObject {val request=b.model.run("request",args("deviceName" to "B")) as JSONObject;val response=a.model.run("approve",args("id" to id,"uri" to request.getString("uri"),"canInvite" to invite)) as JSONObject;b.model.run("join",args("uri" to response.getString("uri"),"confirmed" to true));return response}
  private fun denied(block:()->Unit){try{block();fail("Forbidden operation accepted")}catch(_:IllegalArgumentException){}catch(_:IllegalStateException){} }
  @Test fun offlineIntroductionWorksWithoutAnOnlineIntroducer(){val a=Node();val b=Node();val c=Node();val id=create(a);add(a,b,id,true);add(b,c,id);denied{a.model.requirePeer(id,c.model.deviceId)};a.model.importPacket(id,c.model.packet(id));a.model.requirePeer(id,c.model.deviceId);val request=a.model.run("request",args("deviceName" to "A")) as JSONObject;denied{c.model.run("approve",args("id" to id,"uri" to request.getString("uri")))}}
  @Test fun refusalAppliesAcrossAllLocalGroups(){val a=Node();val b=Node();val first=create(a);val second=create(a);add(a,b,first);add(a,b,second);a.model.run("remove",args("id" to first,"peer" to b.model.deviceId));denied{a.model.requirePeer(second,b.model.deviceId)};val third=create(a);val request=b.model.run("request",args("deviceName" to "renamed")) as JSONObject;denied{a.model.run("approve",args("id" to third,"uri" to request.getString("uri")))};a.restart();denied{a.model.requirePeer(second,b.model.deviceId)}}
  @Test fun removalSurvivesPacketReplayRejoinRestartAndClockSkew(){val a=Node();val b=Node();val id=create(a);add(a,b,id,true);val p=b.model.packet(id);a.model.run("remove",args("id" to id,"peer" to b.model.deviceId));repeat(3){a.model.importPacket(id,p)};a.restart();denied{a.model.requirePeer(id,b.model.deviceId)};a.model.run("join",args("uri" to DeviceGroupModel.uri("rhfiles-group-approval:v1:",p),"confirmed" to true));denied{a.model.requirePeer(id,b.model.deviceId)};denied{a.model.run("restore",args("id" to id,"peer" to b.model.deviceId,"confirmed" to false))};a.model.run("restore",args("id" to id,"peer" to b.model.deviceId,"confirmed" to true));a.model.requirePeer(id,b.model.deviceId)}
  @Test fun removingInviterStopsNewNotPreviouslyAcceptedIntroductions(){val a=Node();val b=Node();val c=Node();val d=Node();val id=create(a);add(a,b,id,true);add(b,c,id);a.model.importPacket(id,c.model.packet(id));a.model.run("remove",args("id" to id,"peer" to b.model.deviceId));add(b,d,id);a.model.importPacket(id,d.model.packet(id));a.model.requirePeer(id,c.model.deviceId);denied{a.model.requirePeer(id,d.model.deviceId)}}
  @Test fun requestBoundApprovalCannotBeInstalledOnAnotherDevice(){val a=Node();val b=Node();val c=Node();val id=create(a);val request=b.model.run("request",args("deviceName" to "B")) as JSONObject;val approval=a.model.run("approve",args("id" to id,"uri" to request.getString("uri"))) as JSONObject;denied{c.model.run("join",args("uri" to approval.getString("uri"),"confirmed" to true))};b.model.run("request",args("deviceName" to "B"));denied{b.model.run("join",args("uri" to approval.getString("uri"),"confirmed" to true))};add(a,b,id);assertFalse(b.model.state().toString().contains("password"))}
  @Test fun tamperedProofAndCorruptLocalStateAreRejected(){val a=Node();val id=create(a);val p=a.model.packet(id);p.getJSONObject("root").put("signature","AA");denied{DeviceGroupModel.packetId(p)};try{DeviceGroupModel(a.key,"broken"){};fail()}catch(_:Exception){} }
  @Test fun alternateBase64SpellingsCannotCreateANewIdentityForTheSameKey(){assertArrayEquals(byteArrayOf(0),DeviceGroupModel.decode("AA"));for(value in listOf("AB","AA=","AA\n","A"))denied{DeviceGroupModel.decode(value)}}
  @Test fun serverMustProveExpectedGroupKeyNotOnlyTheAdvertisedTlsPin(){val server=Key();val other=Key();val nonce="a".repeat(43);val fp="ab".repeat(32);val c=JSONObject().put("v",1).put("kind","server-auth").put("group","group").put("key",server.publicKey).put("issuer",server.publicKey).put("name","").put("label",fp).put("invite",false).put("nonce",nonce).put("seq",0).put("server",JSONObject.NULL);val bytes=c.toString().toByteArray();val proof=JSONObject().put("payload",DeviceGroupModel.encode(bytes)).put("signature",DeviceGroupModel.encode(server.sign("RHFiles-Group-v1\u0000".toByteArray()+bytes)));DeviceGroupModel.verifyServerProof(proof,"group",nonce,fp,DeviceGroupModel.id(server.publicKey));denied{DeviceGroupModel.verifyServerProof(proof,"group",nonce,fp,DeviceGroupModel.id(other.publicKey))};denied{DeviceGroupModel.verifyServerProof(proof,"group",nonce,"cd".repeat(32),DeviceGroupModel.id(server.publicKey))}}
  @Test fun failedPersistenceCannotForgetARefusal(){val a=Node();val b=Node();val id=create(a);add(a,b,id);a.model.run("remove",args("id" to id,"peer" to b.model.deviceId));val g=DeviceGroupModel(a.key,a.disk){error("disk full")};denied{g.run("restore",args("id" to id,"peer" to b.model.deviceId,"confirmed" to true))};denied{g.requirePeer(id,b.model.deviceId)}}
  @Test fun publicPacketsCannotClearLocalPermissionsOrExportRefusals(){val a=Node();val b=Node();val id=create(a);add(a,b,id);a.model.run("configure",args("id" to id,"enabled" to false,"permissions" to args("write" to true)));a.model.run("remove",args("id" to id,"peer" to b.model.deviceId));val wire=a.model.packet(id).toString();for(secret in listOf("blocked","removedAt","permissions","password","private"))assertFalse(wire.contains(secret));a.model.importPacket(id,b.model.packet(id));assertFalse(a.model.state().getJSONArray("groups").getJSONObject(0).getBoolean("enabled"))}
  @Test fun forgetRequiresConfirmationAndSurvivesRestartWithoutAUiStub(){
    val a=Node();val b=Node();val id=create(a);val other=create(a);add(a,b,id,true);val packet=b.model.packet(id);val identity=a.model.deviceId;val before=a.model.state().toString()
    denied{a.model.run("forget",args("id" to id,"confirmed" to false))};assertEquals(before,a.model.state().toString())
    denied{a.model.run("forget",args("id" to id,"confirmed" to "true"))};assertEquals(before,a.model.state().toString())
    a.model.run("forget",args("id" to id,"confirmed" to true));a.restart();assertEquals(identity,a.model.deviceId)
    assertEquals(1,a.model.state().getJSONArray("groups").length());assertEquals(other,a.model.state().getJSONArray("groups").getJSONObject(0).getString("id"))
    denied{a.model.packet(id)};denied{a.model.importPacket(id,packet)};denied{a.model.run("join",args("uri" to DeviceGroupModel.uri("rhfiles-group-approval:v1:",packet),"confirmed" to true))}
    b.model.packet(id);add(b,a,id,true);a.model.requirePeer(id,b.model.deviceId)
  }
  @Test fun forgettingLastGroupNeverErasesOtherDeviceRefusals(){
    val a=Node();val b=Node();val id=create(a);add(a,b,id);a.model.run("remove",args("id" to id,"peer" to b.model.deviceId));a.model.run("forget",args("id" to id,"confirmed" to true));a.restart()
    assertEquals(0,a.model.state().getJSONArray("groups").length());val next=create(a);val request=b.model.run("request",args("deviceName" to "B")) as JSONObject
    denied{a.model.run("approve",args("id" to next,"uri" to request.getString("uri")))}
  }
  @Test fun selfRemovedGroupCanBeForgottenAndFreshlyRejoinedWithoutRestoringOtherGroups(){
    val a=Node();val b=Node();val id=create(a);val other=create(a);add(a,b,id,true);a.model.run("remove",args("id" to id,"peer" to a.model.deviceId));a.model.run("forget",args("id" to id,"confirmed" to true))
    add(b,a,id,true);a.model.requirePeer(id,b.model.deviceId);denied{a.model.requirePeer(other,a.model.deviceId)};a.restart();denied{a.model.requirePeer(other,a.model.deviceId)}
  }
  @Test fun failedForgetPersistenceRetainsTheGroupAndVersion(){
    val a=Node();val id=create(a);val g=DeviceGroupModel(a.key,a.disk){error("disk full")};val before=g.state().toString()
    denied{g.run("forget",args("id" to id,"confirmed" to true))};assertEquals(before,g.state().toString());g.requirePeer(id,g.deviceId)
  }
}
