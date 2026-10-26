package com.railgunhamster.rhfiles

import org.robolectric.RuntimeEnvironment
import android.content.Context
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoClientTest {
  private lateinit var server:MockWebServer
  private lateinit var client:RhVideoClient
  @Before fun setup(){server=MockWebServer();server.start();val context=RuntimeEnvironment.getApplication();context.getSharedPreferences("rhvideo-client-v1",0).edit().clear().commit();client=RhVideoClient(context)}
  @After fun cleanup(){client.logout();server.shutdown()}
  private fun json(value:String)=server.enqueue(MockResponse().setHeader("Content-Type","application/json").setBody(value))
  private fun login(){json("""{"access_token":"test-native-token"}""");client.connect(JSONObject().put("server",server.url("/").toString()).put("username","demo").put("password","test-only"));assertEquals("/api/v1/auth/login",server.takeRequest().path)}
  @Test fun fullLibraryPlaylistOnlyCreatesABoundedNativePlaybackWindow(){
    login();val rows=JSONArray();for(i in 0 until 200)rows.put(JSONObject().put("id","video-$i").put("title","测试 $i").put("duration",200))
    client.request("playlist.prepare",JSONObject().put("ticket","queue-test").put("reset",true).put("items",rows).put("options",JSONObject().put("fullLength",false).put("segment",15).put("super",true)))
    val selected=client.playback(JSONObject().put("playlist","queue-test").put("id","video-100").put("title","测试 100"));assertEquals(100,selected.globalIndex);assertEquals(21,selected.items.size)
    val w=client.playbackWindow("queue-test",100);assertEquals(90,w.offset);assertEquals(10,w.index);assertEquals(200,w.total);assertTrue(w.items.all{it.path.startsWith("rhvideo://")});assertTrue(w.ends.zip(w.starts).all{it.first-it.second==15000L})
    client.logout();try{client.playbackWindow("queue-test",100);fail()}catch(_:Exception){}
  }
  @Test fun accountPreferencesAreNativeAndPartitionedWithoutTokens(){
    login();client.request("preferences",JSONObject().put("value",JSONObject().put("sort","nameDesc")))
    assertEquals("nameDesc",(client.request("preferences",JSONObject()) as JSONObject).getString("sort"));client.logout()
    json("""{"access_token":"different-account-token"}""");client.connect(JSONObject().put("server",server.url("/").toString()).put("username","other").put("password","other-password"));server.takeRequest()
    assertEquals(0,(client.request("preferences",JSONObject()) as JSONObject).length())
    val stored=RuntimeEnvironment.getApplication().getSharedPreferences("rhvideo-client-v1",0).all.toString();assertFalse(stored.contains("test-native-token"));assertFalse(stored.contains("different-account-token"));assertFalse(stored.contains("other-password"))
  }
  @Test fun gridResolvesOnlyOneBoundedGroupAndRevokesItsCapabilitiesOnLogout(){
    login();val rows=JSONArray();for(i in 0 until 10)rows.put(JSONObject().put("id","video-$i").put("title","视频 $i"))
    client.request("playlist.prepare",JSONObject().put("ticket","grid-qa").put("reset",true).put("items",rows).put("options",JSONObject()))
    val page=client.gridWindow("grid-qa",8,4,true);assertEquals(2,page.getJSONArray("items").length());assertEquals(10,page.getInt("total"));assertEquals(8,page.getInt("offset"))
    try{client.gridWindow("grid-qa",9,4,false);fail("Misaligned grid page accepted")}catch(_:IllegalArgumentException){}
    client.logout();try{client.gridWindow("grid-qa",0,4,false);fail("Old grid accepted")}catch(_:Exception){}
  }
  @Test fun nativePlaybackHistoryIsAccountScopedAndNearEndDoesNotResumeAtEnd(){
    login();val rows=JSONArray().put(JSONObject().put("id","video-0").put("title","播放记录"))
    client.request("playlist.prepare",JSONObject().put("ticket","history-qa").put("reset",true).put("items",rows).put("options",JSONObject().put("fullLength",true)))
    client.rememberPlayback("history-qa",0,5000,20000)
    assertEquals(5000L,client.playback(JSONObject().put("playlist","history-qa").put("id","video-0").put("resume",true)).position)
    client.rememberPlayback("history-qa",0,19500,20000)
    assertEquals(0L,client.playback(JSONObject().put("playlist","history-qa").put("id","video-0").put("resume",true)).position)
    client.logout();json("""{"access_token":"other-token"}""");client.connect(JSONObject().put("server",server.url("/").toString()).put("username","other").put("password","other-password"));server.takeRequest()
    assertEquals(0,(client.request("playback.history",JSONObject()) as JSONObject).length())
  }
  @Test fun loginIsNativeAndOnlyServerAndUserPersist(){
    login();assertTrue(client.state().getBoolean("connected"))
    val prefs=RuntimeEnvironment.getApplication().getSharedPreferences("rhvideo-client-v1",0)
    assertEquals(setOf("server","username"),prefs.all.keys);assertFalse(prefs.all.toString().contains("test-native-token"))
    assertFalse(RhVideoClient(RuntimeEnvironment.getApplication()).state().getBoolean("connected"))
  }
  @Test fun rejectsCredentialsInUrlsTraversalAndArbitraryMedia(){
    for(value in listOf("https://user:password@example.com","https://example.com/?token=x","file:///tmp/test","https://example.com/#x"))try{RhVideoClient.base(value);fail(value)}catch(_:IllegalArgumentException){}
    for(value in listOf("../secret","/storage/../secret","pictures/%2e%2e/secret","https://evil.invalid/a","pictures/a?token=x","pictures/a\\b"))try{RhVideoClient.storagePath(value);fail(value)}catch(_:IllegalArgumentException){}
    try{client.media("not-registered",image=true);fail()}catch(_:Exception){}
    assertEquals("http://example.com/prefix/",RhVideoClient.base("http://example.com/prefix/api/v1").toString())
  }
  @Test fun catalogsAreFilteredPagedCachedAndTokenNeverAppearsInUi(){
    login();json("""[{"id":"a12b-345_c","original_filename":"第一集.mp4","folder_label":"剧集"},{"id":"2","original_filename":"别的.mp4","folder_label":"电影"}]""")
    val result=client.request("catalog",JSONObject().put("folder","剧集")) as JSONObject
    assertEquals(1,result.getInt("total"));assertEquals("第一集.mp4",result.getJSONArray("items").getJSONObject(0).getString("title"))
    assertFalse(result.toString().contains("test-native-token"));assertTrue(result.getJSONArray("items").getJSONObject(0).getString("cover").startsWith("https://appassets.androidplatform.net/rhvideo-media/"))
    val request=server.takeRequest();assertEquals("Bearer test-native-token",request.getHeader("Authorization"))
    client.request("catalog",JSONObject());assertEquals(2,server.requestCount)
  }
  @Test fun favoritesUsePutAndKeepTheirMediaType(){
    login();json("{}");client.request("favorite",JSONObject().put("kind","picture").put("id","2").put("enabled",true))
    val request=server.takeRequest();assertEquals("PUT",request.method);assertEquals("/api/v1/favorites/picture/2",request.path)
    json("{}");client.request("favorite",JSONObject().put("kind","picture").put("id","2").put("enabled",false));assertEquals("DELETE",server.takeRequest().method)
  }
  @Test fun nativeMediaRangesAndLogoutRevokeOldMedia(){
    login();val playlist=client.playback(JSONObject().put("id","2").put("seconds",3).put("queue",JSONArray("""[{"id":"1","title":"一"},{"id":"2","title":"二"},{"id":"3","title":"三"}]""")))
    assertEquals(listOf("一","二","三"),playlist.items.map{it.name});assertEquals(playlist.items[1].path,playlist.path);assertEquals(3000L,playlist.position)
    val key=playlist.path.removePrefix("rhvideo://")
    server.enqueue(MockResponse().setResponseCode(206).setHeader("Content-Range","bytes 5-9/10").setHeader("Content-Type","video/mp4").setBody("56789"))
    client.media(key,5,false).use{assertEquals("56789",it.stream.bufferedReader().readText())}
    assertEquals("bytes=5-",server.takeRequest().getHeader("Range"))
    client.logout();try{client.media(key,0,false);fail()}catch(_:Exception){}
    try{client.request("catalog",JSONObject());fail()}catch(_:Exception){}
  }
  @Test fun ignoresNeitherWrongRangeNorRedirectNorFailedLogin(){
    server.enqueue(MockResponse().setResponseCode(401));try{client.connect(JSONObject().put("server",server.url("/").toString()).put("username","x").put("password","y"));fail()}catch(_:Exception){}
    assertFalse(client.state().getBoolean("connected"));server.takeRequest()
    login();val key=client.playback(JSONObject().put("id","1")).path.removePrefix("rhvideo://")
    server.enqueue(MockResponse().setHeader("Content-Type","video/mp4").setBody("0123456789"))
    try{client.media(key,5,false);fail()}catch(_:IllegalArgumentException){};server.takeRequest()
    server.enqueue(MockResponse().setResponseCode(302).setHeader("Location",server.url("/unexpected")))
    try{client.request("favorites",JSONObject());fail()}catch(_:IllegalStateException){};server.takeRequest();assertEquals(4,server.requestCount)
  }
  @Test fun chapterProgressUsesServerContractAndValidatesRatio(){
    login();json("{}");client.request("progress",JSONObject().put("id","3").put("chapter",2).put("ratio",0.5))
    val request=server.takeRequest();assertEquals("PUT",request.method);val body=JSONObject(request.body.readUtf8());assertEquals(2,body.getInt("chapter_index"));assertEquals(.5,body.getDouble("scroll_ratio"),0.0)
    try{client.request("progress",JSONObject().put("id","3").put("chapter",0).put("ratio",2));fail()}catch(_:IllegalArgumentException){}
  }
  @Test fun catalogRevalidationUsesEtagsAndNeverTransfersOrParsesAnUnchangedLibrary(){
    login()
    server.enqueue(MockResponse().setHeader("ETag","\"v1\"").setBody("""[{"id":"1","original_filename":"旧片.mp4","folder_label":"电影, 剧集"}]"""))
    val first=client.request("catalog",JSONObject().put("folder","剧集")) as JSONObject
    assertEquals(1,first.getInt("total"));assertNull(server.takeRequest().getHeader("If-None-Match"))
    server.enqueue(MockResponse().setResponseCode(304).setHeader("ETag","\"v1\""))
    val unchanged=client.request("catalog",JSONObject().put("refresh",true)) as JSONObject
    assertEquals(1,unchanged.getInt("total"));assertEquals("\"v1\"",server.takeRequest().getHeader("If-None-Match"))
    server.enqueue(MockResponse().setBody("""[{"id":"2","original_filename":"新片.mp4"}]"""))
    val changed=client.request("catalog",JSONObject().put("refresh",true)) as JSONObject
    assertEquals("新片.mp4",changed.getJSONArray("items").getJSONObject(0).getString("title"));server.takeRequest()
    server.enqueue(MockResponse().setBody("[]"))
    client.request("catalog",JSONObject().put("refresh",true))
    assertNull(server.takeRequest().getHeader("If-None-Match"))
  }
  @Test fun expiredCatalogLoginRevokesNativeMediaAndDoesNotKeepPretendingToBeConnected(){
    login();val key=client.playback(JSONObject().put("id","1")).path.removePrefix("rhvideo://")
    server.enqueue(MockResponse().setResponseCode(401))
    try{client.request("catalog",JSONObject());fail("Expired session accepted")}catch(_:IllegalStateException){}
    assertFalse(client.state().getBoolean("connected"))
    try{client.media(key,0,false);fail("Old media still available")}catch(_:Exception){}
  }
}
