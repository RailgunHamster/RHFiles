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
  @Test fun oldCloudPairingsAreRemovedConditionallyWithoutRestoringTheirPasswords(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start()
      val c=device();val r=remotes(c);val sync=ConfigSync(c,r);configure(sync,server)
      val retired=UUID.randomUUID().toString();val kept=r.save(smb());val w=web(favorite(kept))
      cloud.doc=SharedConfig.empty().put("profiles",JSONArray().put(JSONObject().put("id",retired).put("config",SharedConfig.profile(computer())))).put("favorites",JSONArray().put(favorite(retired)))
      finish(sync,w);assertEquals(1,r.connections().length());assertEquals(kept,r.connections().getJSONObject(0).getString("id"));assertFalse(cloud.doc.toString().contains(retired));assertFalse(cloud.doc.toString().contains("rhfiles"));assertEquals(1,cloud.writes)
    }
  }
  @Test fun malformedOldPinsCannotRestoreAnyIndependentConnection(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start()
      val c=device();val r=remotes(c);val sync=ConfigSync(c,r);configure(sync,server)
      for(pin in listOf("","abc","gg".repeat(32))){
        val retired=UUID.randomUUID().toString();cloud.doc=SharedConfig.empty().put("profiles",JSONArray().put(JSONObject().put("id",retired).put("config",SharedConfig.profile(computer().put("fingerprint",pin)))))
        cloud.revision++;finish(sync,web());assertEquals(0,r.connections().length());assertEquals(0,cloud.doc!!.getJSONArray("profiles").length())
      }
    }
  }
  @Test fun syncingPortableProfilesNeverDeletesOrExportsLocalDeviceGroupsOrTheirBookmarks(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start()
      val a=device();val b=device();val ra=remotes(a);val rb=remotes(b)
      val groupId=ra.save(computer().put("groupId","a".repeat(64)).put("groupPeerId","b".repeat(64)))
      val groupBefore=a.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).getString(groupId,null)
      val portableId=ra.save(smb());val groupFavorite=favorite(groupId).put("label","仅本机设备组收藏")
      val wa=web(groupFavorite,favorite(portableId));val wb=web()
      val sa=ConfigSync(a,ra);val sb=ConfigSync(b,rb);configure(sa,server);configure(sb,server)
      finish(sa,wa);finish(sb,wb)
      assertEquals(groupBefore,a.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).getString(groupId,null))
      assertEquals(2,ra.connections().length());assertEquals(1,rb.connections().length())
      assertEquals("a".repeat(64),ra.editable(groupId).getString("groupId"))
      assertEquals(groupFavorite.toString(),JSONArray(wa.getString("rhfiles.favorites")).getJSONObject(0).toString())
      assertEquals(2,JSONArray(wa.getString("rhfiles.favorites")).length())
      for(localOnly in listOf(groupId,"local-group","local-peer","仅本机设备组收藏","computer-secret"))assertFalse(cloud.doc.toString().contains(localOnly))
      finish(sa,wa);assertEquals(groupBefore,a.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).getString(groupId,null))
    }
  }
  @Test fun aCloudProfileCannotReplaceALocalGroupUsingTheSameProfileId(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start()
      val c=device();val r=remotes(c);val sync=ConfigSync(c,r);configure(sync,server)
      val id=r.save(computer().put("groupId","a".repeat(64)).put("groupPeerId","b".repeat(64)))
      val before=c.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).all.toMap()
      cloud.doc=SharedConfig.empty().put("profiles",JSONArray().put(JSONObject().put("id",id).put("config",SharedConfig.profile(smb()))))
      val w=web(favorite(id))
      try{val result=sync.run(w,true);sync.apply(result.getString("proposalId"),w);fail("Cloud replaced local group")}catch(e:IllegalArgumentException){assertTrue(e.message!!.contains("设备组"))}
      assertEquals(before,c.getSharedPreferences("remote-v1",Context.MODE_PRIVATE).all)
    }
  }
}
