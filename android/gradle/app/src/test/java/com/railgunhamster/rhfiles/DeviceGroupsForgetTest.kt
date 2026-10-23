package com.railgunhamster.rhfiles

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.security.*
import java.security.spec.ECGenParameterSpec
import javax.crypto.spec.SecretKeySpec

@RunWith(RobolectricTestRunner::class) @Config(manifest=Config.NONE,sdk=[28])
class DeviceGroupsForgetTest {
  private val context get()=RuntimeEnvironment.getApplication()
  private val modelField get()=DeviceGroups::class.java.getDeclaredField("model").apply{isAccessible=true}
  private lateinit var model:DeviceGroupModel
  private lateinit var remote:RemoteStorage
  private var saved:String?=null
  private val identity=object:DeviceGroupModel.Identity {
    private val key=KeyPairGenerator.getInstance("EC").apply{initialize(ECGenParameterSpec("secp256r1"))}.generateKeyPair()
    override val publicKey=DeviceGroupModel.publicKey(key.public)
    override fun sign(bytes:ByteArray)=Signature.getInstance("SHA256withECDSA").run{initSign(key.private);update(bytes);sign()}
  }
  private fun args(vararg pairs:Pair<String,Any>)=JSONObject().also{v->pairs.forEach{v.put(it.first,it.second)}}
  private fun group()=model.run("create",args("name" to "Home","deviceName" to "Test phone")) as String
  private fun profile(group:String)=remote.save(args("type" to "rhfiles","name" to "Group PC","groupId" to group,"groupPeerId" to model.deviceId,"url" to "https://192.168.1.10:39128","fingerprint" to "ab".repeat(32)))
  @Before fun installPrivateFixture(){
    context.getSharedPreferences("remote-v1",0).edit().clear().commit()
    model=DeviceGroupModel(identity,null){saved=it};modelField.set(DeviceGroups,model)
    remote=RemoteStorage(context,{SecretKeySpec(ByteArray(32){7},"AES")})
  }
  @After fun resetSingleton(){modelField.set(DeviceGroups,null)}
  @Test fun forgetRemovesOnlyItsGeneratedLocationsAndDoesNotBlockPeersInOtherGroups(){
    val first=group();val second=group();val a=profile(first);val b=profile(second)
    val independent=remote.save(args("type" to "smb","name" to "Independent SMB","host" to "192.168.1.12"))
    val result=DeviceGroups.run("forget",args("id" to first,"confirmed" to true),remote) as JSONObject
    assertEquals(a,result.getJSONArray("removedLocations").getString(0));assertEquals(1,result.getJSONArray("removedLocations").length())
    val remaining=remote.backupProfiles(true);assertEquals(2,remaining.length());assertEquals(setOf(b,independent),(0 until remaining.length()).map{remaining.getJSONObject(it).getString("id")}.toSet())
    model.requirePeer(second,model.deviceId);assertFalse(JSONObject(saved!!).getJSONObject("refusals").has(model.deviceId))
    assertEquals(1,(DeviceGroups.run("state",JSONObject(),remote) as JSONObject).getJSONArray("groups").length())
  }
  @Test fun cancellationOrPersistenceFailureNeverRemovesConnections(){
    val id=group();val location=profile(id)
    try{DeviceGroups.run("forget",args("id" to id,"confirmed" to false),remote);fail()}catch(_:IllegalArgumentException){}
    modelField.set(DeviceGroups,DeviceGroupModel(identity,saved){error("disk full")})
    try{DeviceGroups.run("forget",args("id" to id,"confirmed" to true),remote);fail()}catch(_:IllegalStateException){}
    assertEquals(location,remote.backupProfiles(true).getJSONObject(0).getString("id"));assertEquals(1,model.state().getJSONArray("groups").length())
  }
  @Test fun stateIsReadOnlyAndRefreshRetriesInterruptedCleanupWithoutRestoringTheGroup(){
    val id=group();val location=profile(id);model.run("forget",args("id" to id,"confirmed" to true))
    model=DeviceGroupModel(identity,saved){saved=it};modelField.set(DeviceGroups,model)
    val state=DeviceGroups.run("state",JSONObject(),remote) as JSONObject
    assertEquals(0,state.getJSONArray("groups").length());assertEquals(1,remote.connections().length())
    val refresh=DeviceGroups.run("refresh",JSONObject(),remote) as JSONObject
    assertEquals(location,refresh.getJSONArray("removedLocations").getString(0));assertEquals(0,refresh.getInt("locations"));assertEquals(0,remote.connections().length())
  }
  @Test fun unreadableConnectionCannotHideGroupsOrPretendACommittedDeletionFailed(){
    val id=group();context.getSharedPreferences("remote-v1",0).edit().putString("00000000-0000-0000-0000-000000000001","broken").commit()
    val corrupt=RemoteStorage(context,profileLookup={error("bad local profile")})
    val state=DeviceGroups.run("state",JSONObject(),corrupt) as JSONObject
    assertEquals(1,state.getJSONArray("groups").length());assertFalse(state.has("cleanupErrors"))
    val result=DeviceGroups.run("forget",args("id" to id,"confirmed" to true),corrupt) as JSONObject
    assertEquals(0,model.state().getJSONArray("groups").length());assertEquals(1,result.getJSONArray("cleanupErrors").length())
  }
}
