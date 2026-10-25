package com.railgunhamster.rhfiles

import android.content.Context
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)@Config(manifest=Config.NONE,sdk=[28])
class GroupPortableConfigTest {
  @Test fun groupGeneratedLocationsAndTheirFavoritesCannotTravelInBackupOrSync(){
    val context=RuntimeEnvironment.getApplication() as Context;val a="00000000-0000-0000-0000-000000000001";val b="00000000-0000-0000-0000-000000000002"
    context.getSharedPreferences("remote-v1",0).edit().clear().putString(a,"fixture").putString(b,"fixture").commit()
    val remote=RemoteStorage(context,profileLookup={id->if(id==a)JSONObject().put("name","Group PC").put("type","rhfiles").put("groupId","a".repeat(64)).put("groupPeerId","b".repeat(64))else JSONObject().put("name","SMB").put("type","smb").put("host","192.168.1.1")})
    val favorites=JSONArray().put(JSONObject().put("name","group").put("path","remote://$a/Files")).put(JSONObject().put("name","smb").put("path","remote://$b/Photos"))
    val profiles=remote.backupProfiles();assertEquals(1,profiles.length());assertEquals(b,profiles.getJSONObject(0).getString("id"))
    val web=JSONObject().put("rhfiles.favorites",favorites.toString());assertEquals(1,JSONArray(remote.portableWeb(web).getString("rhfiles.favorites")).length());assertEquals(2,JSONArray(web.getString("rhfiles.favorites")).length())
    val shared=SharedConfig.snapshot(profiles,favorites);assertEquals(1,shared.getJSONArray("favorites").length());assertEquals("remote://$b/Photos",shared.getJSONArray("favorites").getJSONObject(0).getString("path"))
  }
}
