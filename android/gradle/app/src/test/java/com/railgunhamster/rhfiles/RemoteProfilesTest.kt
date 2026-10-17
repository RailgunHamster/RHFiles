package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Before
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.json.JSONObject
import org.json.JSONArray
import java.io.ByteArrayInputStream
import javax.crypto.spec.SecretKeySpec

@RunWith(RobolectricTestRunner::class) @Config(manifest=Config.NONE,sdk=[28])
class RemoteProfilesTest {
  private val context get()=RuntimeEnvironment.getApplication()
  private fun store()=RemoteStorage(context,{SecretKeySpec(ByteArray(32){7},"AES")})
  private fun profile(share:String="")=JSONObject().put("name","服务器").put("type","smb").put("host","server-home").put("username","user").put("password","fixture-secret").put("share",share)
  @Before fun clean(){context.getSharedPreferences("remote-v1",0).edit().clear().commit()}
  @Test fun serverOnlyProfilesAndExplicitSharesBothRemainValid(){
    val store=store();val id=store.save(profile());val pinned=store.save(profile("中文 共享"))
    assertTrue(store.requireSmbConnection(id,"SERVER-HOME","Public"));assertFalse(store.requireSmbConnection(pinned,"server-home","中文 共享"))
    try{store.requireSmbConnection(id,"another-server","Public");fail()}catch(_:IllegalArgumentException){}
    try{store.save(profile("../bad"));fail()}catch(_:IllegalArgumentException){}
    for(host in listOf("server\\Public","smb://server","server@evil","server?x"))try{store.save(profile().put("host",host));fail()}catch(_:IllegalArgumentException){}
  }
  @Test fun editingPreservesIdAndPasswordButNeverReturnsPasswordToUi(){
    val store=store();val id=store.save(profile());val edit=store.editable(id)
    assertFalse(edit.has("password"));assertTrue(edit.getBoolean("hasPassword"));edit.put("name","新名称").put("password","")
    assertEquals(id,store.save(edit));assertEquals(1,store.connections().length())
    assertEquals("fixture-secret",store.backupProfiles().getJSONObject(0).getJSONObject("config").getString("password"))
    assertFalse(store.connections().toString().contains("fixture-secret"))
    edit.put("clearPassword",true);store.save(edit);assertFalse(store.editable(id).getBoolean("hasPassword"))
  }
  @Test fun changingServerOrAccountCannotSilentlyForwardStoredCredentials(){
    val store=store();val id=store.save(profile());val edit=store.editable(id).put("host","different-server")
    try{store.save(edit);fail()}catch(_:IllegalArgumentException){}
    assertEquals("server-home",store.editable(id).getString("host"))
    edit.put("password","new-fixture-password");assertEquals(id,store.save(edit))
    store.remove(id);try{store.save(edit);fail()}catch(_:IllegalArgumentException){}
    assertEquals(0,store.connections().length())
  }
  @Test fun enumeratesDiskSharesWithoutCreatingConnectionRecordsOrLosingUnicodePaths(){
    val store=store();val id=store.save(profile())
    store.shareReader={listOf(RemoteStorage.SmbShare("Public",0),RemoteStorage.SmbShare("中文 #目录",0),RemoteStorage.SmbShare("C$",Int.MIN_VALUE),RemoteStorage.SmbShare("IPC$",3),RemoteStorage.SmbShare("Printer",1),RemoteStorage.SmbShare("public",0))}
    val entries=store.list("remote://$id/");assertEquals(3,entries.size);assertTrue(entries.all{it.isDir})
    val name=entries.first{it.name=="中文 #目录"};assertEquals("中文 #目录",store.stat(name.path).name)
    assertTrue(name.path.contains("%23"));assertEquals(1,store.connections().length())
    try{store.create("remote://$id/","not-a-share",true);fail()}catch(_:IllegalArgumentException){}
    try{store.delete(name.path);fail()}catch(_:IllegalArgumentException){}
    try{store.rename(name.path,"new-share");fail()}catch(_:IllegalArgumentException){}
    try{store.write(name.path,ByteArrayInputStream(byteArrayOf())){};fail()}catch(_:IllegalArgumentException){}
  }
  @Test fun accessDeniedIsAnErrorNotAnEmptyServer(){
    val store=store();val id=store.save(profile());store.shareReader={throw java.io.IOException("STATUS_ACCESS_DENIED")}
    try{store.list("remote://$id/");fail()}catch(e:java.io.IOException){assertTrue(e.message!!.contains("STATUS_ACCESS_DENIED"));assertTrue(e.message!!.contains("编辑"))}
    store.shareReader={emptyList()};assertTrue(store.list("remote://$id/").isEmpty())
    store.shareReader={throw NoSuchMethodError("fixture")};try{store.list("remote://$id/");fail()}catch(e:java.io.IOException){assertTrue(e.message!!.contains("组件不兼容"))}
  }
  @Test fun inFlightReferencesPreventEditingButFinishedTasksDoNot(){
    val id="fixture";val jobs=JSONArray().put(JSONObject().put("state","running").put("args",JSONObject().put("sources",JSONArray().put("remote://$id/Public/file"))))
    try{RemoteStorage.requireIdle(jobs,id);fail()}catch(_:IllegalArgumentException){}
    RemoteStorage.requireIdle(jobs,"other");jobs.getJSONObject(0).put("state","completed");RemoteStorage.requireIdle(jobs,id)
    jobs.getJSONObject(0).put("state","paused").put("args",JSONObject().put("destination","remote://$id/Public"))
    try{RemoteStorage.requireIdle(jobs,id);fail()}catch(_:IllegalArgumentException){}
  }
}
