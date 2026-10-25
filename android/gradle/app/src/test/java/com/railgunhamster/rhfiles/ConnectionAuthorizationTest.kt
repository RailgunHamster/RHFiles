package com.railgunhamster.rhfiles

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import javax.crypto.spec.SecretKeySpec

@RunWith(RobolectricTestRunner::class) @Config(manifest=Config.NONE,sdk=[28])
class ConnectionAuthorizationTest {
  @Test fun connectionSummariesDistinguishGroupsWithoutReturningCredentials(){
    val context=RuntimeEnvironment.getApplication()
    context.getSharedPreferences("remote-v1",0).edit().clear().commit()
    val remote=RemoteStorage(context,{SecretKeySpec(ByteArray(32){7},"AES")})
    fun profile(name:String)=JSONObject().put("type","rhfiles").put("name",name).put("url","https://192.168.1.10:39128").put("fingerprint","ab".repeat(32))
    try{remote.save(profile("Independent").put("username","paired-phone").put("password","private-secret"));fail("Legacy pairing accepted")}catch(_:IllegalArgumentException){}
    val group=remote.save(profile("Group").put("groupId","a".repeat(64)).put("groupPeerId","b".repeat(64)))
    val list=remote.connections();assertEquals(1,list.length())
    val records=(0 until list.length()).map{list.getJSONObject(it)}.associateBy{it.getString("id")}
    assertEquals("device-group",records[group]!!.getString("authorization"))
    for(item in records.values){assertFalse(item.has("password"));assertFalse(item.has("username"));assertFalse(item.has("groupId"))}
  }
}
