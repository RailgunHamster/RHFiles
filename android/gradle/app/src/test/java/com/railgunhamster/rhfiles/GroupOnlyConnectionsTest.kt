package com.railgunhamster.rhfiles

import android.content.Context
import org.json.*
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import javax.crypto.spec.SecretKeySpec
import java.util.UUID

@RunWith(RobolectricTestRunner::class)@Config(manifest=Config.NONE,sdk=[28])
class GroupOnlyConnectionsTest {
  private fun old()=JSONObject().put("type","rhfiles").put("name","Old phone pairing").put("url","https://127.0.0.1:39128").put("fingerprint","ab".repeat(32)).put("username","old-user").put("password","retired-secret")
  @Test fun startupClearsOnlyLegacyRhFilesProfilesAndKeepsGroupsAndOtherProtocols(){
    val context=RuntimeEnvironment.getApplication();context.getSharedPreferences("remote-v1",0).edit().clear().commit()
    val key=SecretKeySpec(ByteArray(32){7},"AES");val first=RemoteStorage(context,{key})
    val id=UUID.randomUUID().toString();context.getSharedPreferences("remote-v1",0).edit().putString(id,first.sealLocal(old())).commit()
    val group=first.save(old().put("groupId","a".repeat(64)).put("groupPeerId","b".repeat(64)).apply{remove("username");remove("password")})
    val smb=first.save(JSONObject().put("type","smb").put("name","SMB").put("host","pc").put("share","Public"))
    val webdav=first.save(JSONObject().put("type","webdav").put("name","WebDAV").put("url","https://example.com/dav/"))
    val upgraded=RemoteStorage(context,{key});assertFalse(context.getSharedPreferences("remote-v1",0).contains(id));assertEquals(3,upgraded.connections().length())
    assertTrue(upgraded.editable(group).has("groupId"));assertEquals("smb",upgraded.editable(smb).getString("type"));assertEquals("webdav",upgraded.editable(webdav).getString("type"))
    try{upgraded.save(old());fail("Independent connection recreated")}catch(e:IllegalArgumentException){assertTrue(e.message!!.contains("设备组"))}
    // A rollback or a second old backup must not resurrect a retired grant.
    context.getSharedPreferences("remote-v1",0).edit().putString(id,first.sealLocal(old())).commit();upgraded.connections();assertFalse(context.getSharedPreferences("remote-v1",0).contains(id))
  }
  @Test fun cloudSanitizationRemovesOldPairingsAndBookmarksButNotOtherConnections(){
    val retired=UUID.randomUUID().toString();val kept=UUID.randomUUID().toString()
    fun item(id:String,c:JSONObject)=JSONObject().put("id",id).put("config",c)
    fun favorite(id:String)=JSONObject().put("name","Folder").put("path","remote://$id/Files")
    val before=SharedConfig.empty().put("profiles",JSONArray().put(item(retired,SharedConfig.profile(old()))).put(item(kept,JSONObject().put("type","smb").put("name","PC").put("host","pc")))).put("favorites",JSONArray().put(favorite(retired)).put(favorite(kept)))
    val after=SharedConfig.withoutRhFiles(before);assertEquals(1,after.getJSONArray("profiles").length());assertEquals(1,after.getJSONArray("favorites").length());assertEquals(kept,after.getJSONArray("profiles").getJSONObject(0).getString("id"));assertEquals(2,before.getJSONArray("profiles").length())
    assertTrue(SharedConfig.same(after,SharedConfig.withoutRhFiles(after)))
  }
}
