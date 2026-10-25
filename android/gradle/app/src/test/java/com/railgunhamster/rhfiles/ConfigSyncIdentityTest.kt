package com.railgunhamster.rhfiles

import android.content.Context
import android.content.ContextWrapper
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.util.UUID
import javax.crypto.spec.SecretKeySpec

/** Exercise the real conditional WebDAV sync, not only the export allowlist. */
@RunWith(RobolectricTestRunner::class) @Config(manifest=Config.NONE,sdk=[28])
class ConfigSyncIdentityTest {
  private class Device(base:Context,val id:String):ContextWrapper(base){
    override fun getSharedPreferences(name:String,mode:Int)=super.getSharedPreferences("$id-$name",mode)
    override fun getFilesDir()=File(super.getFilesDir(),id).apply{mkdirs()}
  }
  private fun device()=Device(RuntimeEnvironment.getApplication(),UUID.randomUUID().toString())
  private fun remotes(c:Context)=RemoteStorage(c,credentialKey={SecretKeySpec(ByteArray(32){19},"AES")})
  private val pin="ab".repeat(32)
  private fun computer()=JSONObject().put("type","rhfiles").put("name","已配对电脑")
    .put("url","https://192.168.0.2:39128/").put("fingerprint",pin)
    .put("username","computer-account").put("password","computer-secret")
  private fun smb()=JSONObject().put("type","smb").put("name","NAS").put("host","nas")
    .put("username","nas-user").put("password","nas-secret")
  private fun favorite(id:String)=JSONObject().put("name","图片").put("label","我的图片")
    .put("path","remote://$id/Pictures").put("isDir",true)
  private fun web(vararg favorites:JSONObject)=JSONObject().put("rhfiles.favorites",JSONArray(favorites.toList()).toString())
  private fun configure(sync:ConfigSync,server:MockWebServer){
    sync.save(JSONObject().put("enabled",false).put("insecure",true)
      .put("url",server.url("/dav/settings/").toString()).put("username","sync-user").put("password","sync-secret"))
  }
  private class Cloud:Dispatcher(){
    var doc:JSONObject?=null;var revision=0;var writes=0
    override fun dispatch(request:RecordedRequest):MockResponse {
      if(request.method=="GET")return if(doc==null)MockResponse().setResponseCode(404)
        else MockResponse().setBody(doc.toString()).addHeader("ETag","\"$revision\"")
      if(request.method=="PUT"){
        if(doc==null&&request.getHeader("If-None-Match")!="*"||doc!=null&&request.getHeader("If-Match")!="\"$revision\"")return MockResponse().setResponseCode(412)
        doc=JSONObject(request.body.readUtf8());revision++;writes++;return MockResponse().setResponseCode(204)
      }
      return MockResponse().setResponseCode(405)
    }
  }
  private fun finish(sync:ConfigSync,web:JSONObject){
    val result=sync.run(web,true);assertEquals("ready",result.getString("state"))
    val applied=sync.apply(result.getString("proposalId"),web)
    web.put("rhfiles.favorites",applied.getJSONArray("favorites").toString())
    assertEquals("success",sync.acknowledge(applied.getString("id")).getString("state"))
  }
  @Test fun pairedComputerFingerprintSurvivesTwoWaySyncWithoutPasswords(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start()
      val a=device();val b=device();val ra=remotes(a);val rb=remotes(b)
      val sa=ConfigSync(a,ra);val sb=ConfigSync(b,rb);configure(sa,server);configure(sb,server)
      val id=ra.save(computer());val wa=web(favorite(id));val wb=web()
      finish(sa,wa)
      val exported=cloud.doc!!.getJSONArray("profiles").getJSONObject(0).getJSONObject("config")
      assertEquals(pin,exported.getString("fingerprint"))
      for(secret in listOf("computer-secret","sync-secret","password","groupId","privateKey"))assertFalse(cloud.doc.toString().contains(secret))
      finish(sb,wb);assertEquals(pin,rb.editable(id).getString("fingerprint"))
      assertTrue(rb.editable(id).getBoolean("needsPassword"));assertFalse(rb.editable(id).getBoolean("hasPassword"))
      rb.save(rb.editable(id).put("password","phone-b-secret"))
      val renamed=JSONArray(wb.getString("rhfiles.favorites")).getJSONObject(0).put("label","B 的图片")
      wb.put("rhfiles.favorites",JSONArray().put(renamed).toString());finish(sb,wb);finish(sa,wa)
      assertEquals("computer-secret",ra.backupProfiles().getJSONObject(0).getJSONObject("config").getString("password"))
      assertEquals("phone-b-secret",rb.backupProfiles().getJSONObject(0).getJSONObject("config").getString("password"))
      assertEquals("B 的图片",JSONArray(wa.getString("rhfiles.favorites")).getJSONObject(0).getString("label"))
      assertFalse(cloud.doc.toString().contains("phone-b-secret"))
      // Changing the public identity must never carry the old local credential.
      cloud.doc!!.getJSONArray("profiles").getJSONObject(0).getJSONObject("config").put("fingerprint","cd".repeat(32));cloud.revision++
      finish(sa,wa);assertEquals("cd".repeat(32),ra.editable(id).getString("fingerprint"))
      assertFalse(ra.editable(id).getBoolean("hasPassword"));assertTrue(ra.editable(id).getBoolean("needsPassword"))
    }
  }
  @Test fun malformedOrMissingCloudPinsAreRejectedWithoutLearningAnIdentityOrMutatingLocalData(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start()
      val c=device();val r=remotes(c);val sync=ConfigSync(c,r);configure(sync,server)
      val id=r.save(computer());val w=web(favorite(id));finish(sync,w)
      val valid=cloud.doc!!.toString();val before=c.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).all.toMap();val writes=cloud.writes
      for(badPin in listOf("","abc","gg".repeat(32),"ab".repeat(31))){
        cloud.doc=JSONObject(valid);cloud.doc!!.getJSONArray("profiles").getJSONObject(0).getJSONObject("config").put("fingerprint",badPin)
        try{sync.run(w,true);fail("Invalid fingerprint accepted")}catch(e:IllegalArgumentException){assertTrue(e.message!!.contains("指纹"))}
        assertEquals(before,c.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).all);assertEquals(writes,cloud.writes)
      }
      cloud.doc=JSONObject(valid);cloud.doc!!.getJSONArray("profiles").getJSONObject(0).getJSONObject("config").remove("fingerprint")
      try{sync.run(w,true);fail("Missing fingerprint accepted")}catch(e:IllegalArgumentException){assertTrue(e.message!!.contains("指纹"))}
      assertEquals(before,c.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).all);assertEquals(writes,cloud.writes)
    }
  }
  @Test fun syncingPortableProfilesNeverDeletesOrExportsLocalDeviceGroupsOrTheirBookmarks(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start()
      val a=device();val b=device();val ra=remotes(a);val rb=remotes(b)
      val groupId=ra.save(computer().put("groupId","local-group").put("groupPeerId","local-peer"))
      val groupBefore=a.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).getString(groupId,null)
      val portableId=ra.save(smb());val groupFavorite=favorite(groupId).put("label","仅本机设备组收藏")
      val wa=web(groupFavorite,favorite(portableId));val wb=web()
      val sa=ConfigSync(a,ra);val sb=ConfigSync(b,rb);configure(sa,server);configure(sb,server)
      finish(sa,wa);finish(sb,wb)
      assertEquals(groupBefore,a.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).getString(groupId,null))
      assertEquals(2,ra.connections().length());assertEquals(1,rb.connections().length())
      assertEquals("local-group",ra.editable(groupId).getString("groupId"))
      assertEquals(groupFavorite.toString(),JSONArray(wa.getString("rhfiles.favorites")).getJSONObject(0).toString())
      assertEquals(2,JSONArray(wa.getString("rhfiles.favorites")).length())
      for(localOnly in listOf(groupId,"local-group","local-peer","仅本机设备组收藏","computer-secret"))assertFalse(cloud.doc.toString().contains(localOnly))
      finish(sa,wa);assertEquals(groupBefore,a.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).getString(groupId,null))
    }
  }
  @Test fun aCloudProfileCannotReplaceALocalGroupUsingTheSameProfileId(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start()
      val c=device();val r=remotes(c);val sync=ConfigSync(c,r);configure(sync,server)
      val id=r.save(computer().put("groupId","local-group").put("groupPeerId","local-peer"))
      val before=c.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).all.toMap()
      cloud.doc=SharedConfig.empty().put("profiles",JSONArray().put(JSONObject().put("id",id).put("config",SharedConfig.profile(smb()))))
      val w=web(favorite(id))
      try{val result=sync.run(w,true);sync.apply(result.getString("proposalId"),w);fail("Cloud replaced local group")}catch(e:IllegalArgumentException){assertTrue(e.message!!.contains("设备组"))}
      assertEquals(before,c.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).all)
    }
  }
}
