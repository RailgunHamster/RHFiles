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
import okio.buffer

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoClientTest {
  private fun favoriteWindow(ticket:String,preview:String="favorite-preview",child:String="child-$ticket",id:String="one"):RhVideoClient.Window{
    val options=JSONObject().put("fullLength",true).put("origin","favorite").put("parentKey","video:$id").put("parentPreview",preview).put("parentPlayback",child).put("parentIndex",2).put("parentTotal",5).put("deferPreviewCommit",true)
    client.request("playlist.prepare",JSONObject().put("ticket",ticket).put("reset",true).put("items",JSONArray().put(JSONObject().put("id",id))).put("options",options));client.playback(JSONObject().put("playlist",ticket).put("id",id));return client.playbackWindow(ticket,0)
  }
  @Test fun favoriteCollectionSeekAndBackUseDifferentReturnSemanticsWithoutPrematureCommit(){
    login();val events=java.util.concurrent.CopyOnWriteArrayList<JSONObject>();client.listen{name,value->if(name=="rhvideo-parent-preview")events.add(value)}
    val first=favoriteWindow("favorite-first");client.request("preview.mark",JSONObject().put("kind","video").put("id","one").put("title","一"))
    try{client.closePlayback("favorite-first",first.lease,0,false,5);fail("Invalid target closed the active input")}catch(_:IllegalArgumentException){};client.checkPlayback("favorite-first",first.lease)
    client.closePlayback("favorite-first",first.lease,0,false,0);assertEquals(0,events.single().getInt("targetIndex"));assertFalse(events.single().getBoolean("close"));assertEquals("child-favorite-first",events.single().getString("parentPlayback"))
    val next=favoriteWindow("favorite-back");client.closePlayback("favorite-back",next.lease,0,false);assertTrue(events.last().getBoolean("close"));assertFalse(events.last().has("targetIndex"));assertEquals(1,server.requestCount);assertEquals(1,(client.request("preview.pending",JSONObject()) as JSONObject).getJSONArray("items").length())
  }
  @Test fun retiringAnOldParentCannotCloseANewerInputOrAuthorizeAnOldQueuedLaunch(){
    login();val old=favoriteWindow("same-ticket","old-preview","old-child")
    assertTrue(client.retireParent(JSONObject().put("parentPreview","old-preview").put("parentPlayback","old-child")).getBoolean("closed"))
    val current=favoriteWindow("same-ticket","new-preview","new-child","two")
    assertFalse(client.playbackActive("same-ticket",old.lease));assertTrue(client.playbackActive("same-ticket",current.lease))
    assertFalse(client.retireParent(JSONObject().put("parentPreview","old-preview")).getBoolean("closed"));assertFalse(client.retireParent(JSONObject().put("parentPreview","new-preview").put("parentPlayback","old-child")).getBoolean("closed"));client.checkPlayback("same-ticket",current.lease)
    val closed=client.retireParent(JSONObject().put("parentPreview","new-preview").put("parentPlayback","new-child"));assertTrue(closed.getBoolean("closed"));assertEquals(current.lease,closed.getString("lease"));assertFalse(client.playbackActive("same-ticket",current.lease));assertFalse(client.retireParent(JSONObject().put("parentPreview","new-preview")).getBoolean("closed"));assertEquals(1,server.requestCount)
  }
  @Test fun taskImagePathsDoNotExposeArbitraryAuthenticatedApis(){
    assertEquals("api/v1/videos/video_123/thumbnail",RhVideoClient.imagePath("/api/v1/videos/video_123/thumbnail"))
    for(value in listOf("/api/v1/auth/login","/api/v1/videos/../thumbnail","/api/v1/videos/a/thumbnail?x=1","/api/v1/videos/a%2fb/thumbnail","https://evil.invalid/a","/storage/../secret"))try{RhVideoClient.imagePath(value);fail(value)}catch(_:IllegalArgumentException){}
  }
  private lateinit var server:MockWebServer
  private lateinit var client:RhVideoClient
  @Before fun setup(){server=MockWebServer();server.start();val context=RuntimeEnvironment.getApplication();context.getSharedPreferences("rhvideo-client-v1",0).edit().clear().commit();client=RhVideoClient(context)}
  @After fun cleanup(){client.logout();server.shutdown()}
  private fun json(value:String)=server.enqueue(MockResponse().setHeader("Content-Type","application/json").setBody(value))
  private fun awaitState(check:()->Boolean){val end=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(5);while(!check()){assertTrue("Native operation did not finish",System.nanoTime()<end);Thread.sleep(10)}}
  private fun login(){json("""{"access_token":"test-native-token"}""");client.connect(JSONObject().put("server",server.url("/").toString()).put("username","demo").put("password","test-only"));assertEquals("/api/v1/auth/login",server.takeRequest().path)}
  @Test fun configurationUsesAuthenticatedFixedRoutesAndNeverReplaysConsumedRestore(){
    login();val document=JSONObject("""{"format":"RHVideo.config-backup","version":1,"created_at":"2026-10-28T00:00:00Z","favorites":[],"watch_folders":[],"reading_progress":[],"ui_preferences":{"page_volume":"0.2"}}""")
    json(document.toString());val exported=client.request("configuration.export",JSONObject().put("preferences",document.getJSONObject("ui_preferences"))) as JSONObject
    val download=server.takeRequest();assertEquals("/api/v1/config-backups/export",download.path);assertEquals("Bearer test-native-token",download.getHeader("Authorization"));assertFalse(exported.toString().contains("test-native-token"))
    json("""{"applied":false,"favorites":{"total":0,"add":0,"existing":0,"unmatched":0},"watch_folders":{"total":0,"add":0,"existing":0,"skipped":0},"reading_progress":{"total":0,"update":0,"kept":0,"unmatched":0},"preferences":1,"issues":[],"ui_preferences":{"page_volume":"0.2"}}""")
    val preview=client.request("configuration.preview",JSONObject().put("document",document)) as JSONObject;assertEquals("/api/v1/config-backups/preview",server.takeRequest().path)
    json("""{"applied":true,"favorites":{"total":0,"add":0,"existing":0,"unmatched":0},"watch_folders":{"total":0,"add":0,"existing":0,"skipped":0},"reading_progress":{"total":0,"update":0,"kept":0,"unmatched":0},"preferences":1,"issues":[],"ui_preferences":{"page_volume":"0.2"}}""");json("""{"video_ids":[],"picture_ids":[],"novel_ids":[]}""")
    assertTrue((client.request("configuration.restore",JSONObject().put("ticket",preview.getString("ticket"))) as JSONObject).getBoolean("applied"));assertEquals("/api/v1/config-backups/restore",server.takeRequest().path);assertEquals("/api/v1/favorites/ids",server.takeRequest().path)
    val count=server.requestCount;try{client.request("configuration.restore",JSONObject().put("ticket",preview.getString("ticket")));fail("Consumed restore replayed")}catch(_:IllegalStateException){};assertEquals(count,server.requestCount)
  }
  @Test fun rotationIsAccountScopedAndStalePreferenceSnapshotsCannotUndoThePlayer(){
    login();val generation=client.sessionGeneration();val old=client.request("preferences",JSONObject()) as JSONObject;assertFalse(old.getBoolean("autoRotate"))
    assertTrue(client.rotationPreference(generation,true));client.request("preferences",JSONObject().put("value",old));assertTrue((client.request("preferences",JSONObject()) as JSONObject).getBoolean("autoRotate"))
    client.logout();login();assertTrue(client.rotationPreference(client.sessionGeneration()));try{client.rotationPreference(generation,false);fail("Old account changed rotation")}catch(_:IllegalStateException){};assertTrue(client.rotationPreference(client.sessionGeneration()))
    client.logout();json("""{"access_token":"other-test-token"}""");client.connect(JSONObject().put("server",server.url("/").toString()).put("username","other").put("password","test-only"));server.takeRequest();assertFalse(client.rotationPreference(client.sessionGeneration()))
  }
  private fun draft(ticket:String,reset:Boolean,vararg ids:String)=client.request("playlist.prepare",JSONObject().put("ticket",ticket).put("reset",reset).put("items",JSONArray(ids.map{id->JSONObject().put("id",id).put("title",id).put("duration",20)})).put("options",JSONObject().put("fullLength",true))) as JSONObject
  @Test fun gridMarksWaitForViewerClosureAndCommitExactlyOnce(){
    login();draft("grid",true,"one","two","three");val first=client.openGrid("grid",2,false)
    client.request("preview.mark",JSONObject().put("kind","video").put("id","one").put("title","一"));client.gridWindow("grid",2,2,false)
    assertEquals(1,server.requestCount);assertEquals(1,(client.request("preview.pending",JSONObject()) as JSONObject).getJSONArray("items").length())
    json("{}");client.closeGrid("grid",first.getString("lease"));client.closeGrid("grid",first.getString("lease"))
    awaitState{(client.request("preview.result",JSONObject()) as JSONObject).optInt("completed")==1}
    assertEquals("/api/v1/trash/video/one",server.takeRequest().path);assertEquals(2,server.requestCount)
    try{client.checkGrid("grid",first.getString("lease"));fail("Closed grid retained authority")}catch(_:IllegalStateException){}
  }
  @Test fun anOldGridCloseCannotCommitMarksOrRevokeANewerViewer(){
    login();draft("old",true,"one","two");val old=client.openGrid("old",2,false);draft("new",true,"three","four");val current=client.openGrid("new",2,false)
    client.request("preview.mark",JSONObject().put("kind","video").put("id","three").put("title","三"));client.closeGrid("old",old.getString("lease"))
    client.checkGrid("new",current.getString("lease"));assertEquals(1,server.requestCount);assertEquals(1,(client.request("preview.pending",JSONObject()) as JSONObject).getJSONArray("items").length())
    json("{}");client.closeGrid("new",current.getString("lease"));awaitState{(client.request("preview.result",JSONObject()) as JSONObject).optInt("completed")==1};assertEquals("/api/v1/trash/video/three",server.takeRequest().path)
  }
  @Test fun failedGridCloseWritesAreTerminalAndNeverReplayedByAnotherClose(){
    login();draft("grid",true,"one","two");val grid=client.openGrid("grid",2,false);client.request("preview.mark",JSONObject().put("kind","video").put("id","one").put("title","一"))
    server.enqueue(MockResponse().setResponseCode(500).setBody("failed"));client.closeGrid("grid",grid.getString("lease"));awaitState{(client.request("preview.result",JSONObject()) as JSONObject).optInt("completed")==1}
    assertFalse((client.request("preview.result",JSONObject()) as JSONObject).getJSONArray("items").getJSONObject(0).getBoolean("success"));client.closeGrid("grid",grid.getString("lease"));assertEquals(2,server.requestCount)
  }
  @Test fun forcedSessionDismissalNeverSubmitsUncommittedGridMarks(){
    login();draft("grid",true,"one","two");val grid=client.openGrid("grid",2,false);client.request("preview.mark",JSONObject().put("kind","video").put("id","one").put("title","一"))
    client.closeGrid("grid",grid.getString("lease"),commit=false);client.closeGrid("grid",grid.getString("lease"))
    assertEquals(1,server.requestCount);assertEquals(1,(client.request("preview.pending",JSONObject()) as JSONObject).getJSONArray("items").length());client.logout();login()
    assertEquals(0,(client.request("preview.pending",JSONObject()) as JSONObject).getJSONArray("items").length());assertEquals(2,server.requestCount)
  }
  @Test fun preparedTicketsCanInterleaveAndDiscardDoesNotCloseAnActiveInput(){
    login();draft("a",true,"one");draft("b",true,"two");assertEquals(2,draft("a",false,"three").getInt("count"))
    client.playback(JSONObject().put("playlist","b").put("id","two"));val b=client.playbackWindow("b",0);assertEquals(listOf("two"),b.ids)
    draft("c",true,"four");assertTrue((client.request("playlist.discard",JSONObject().put("ticket","c")) as JSONObject).getBoolean("removed"));assertFalse((client.request("playlist.discard",JSONObject().put("ticket","c")) as JSONObject).getBoolean("removed"));client.checkPlayback("b",b.lease)
    client.playback(JSONObject().put("playlist","a").put("id","three"));val a=client.playbackWindow("a",1);assertEquals(listOf("one","three"),a.ids)
    try{client.playback(JSONObject().put("playlist","c").put("id","four"));fail("Discarded draft played")}catch(_:IllegalStateException){};client.checkPlayback("a",a.lease)
  }
  @Test fun preparedTicketQuotaAndInvalidResetPreserveOtherDrafts(){
    login();for(n in 0..7)draft("draft-$n",true,"one")
    try{draft("overflow",true,"two");fail("Unbounded drafts")}catch(_:IllegalArgumentException){}
    try{draft("draft-0",true,"bad/id");fail("Invalid reset accepted")}catch(_:IllegalArgumentException){}
    client.playback(JSONObject().put("playlist","draft-0").put("id","one"));assertEquals(listOf("one"),client.playbackWindow("draft-0",0).ids)
    draft("now-has-room",true,"two")
  }
  @Test fun preparedItemsHaveAnAggregateBudgetAndDiscardReleasesIt(){
    login();val block=Array(200){"item-$it"};for(n in 0 until 499)draft("large",n==0,*block);draft("other",true,*block)
    try{draft("other",false,"overflow");fail("Aggregate item budget exceeded")}catch(_:IllegalArgumentException){}
    assertTrue((client.request("playlist.discard",JSONObject().put("ticket","large")) as JSONObject).getBoolean("removed"));assertEquals(201,draft("other",false,"last").getInt("count"))
  }
  @Test fun aPreviousGenerationCannotDiscardANewAccountsTicket(){
    login();val generation=client.sessionGeneration();draft("reused",true,"old");client.logout();login();draft("reused",true,"new")
    try{client.request("playlist.discard",JSONObject().put("ticket","reused").put("_sessionGeneration",generation));fail("Old account discarded new draft")}catch(_:IllegalStateException){}
    client.playback(JSONObject().put("playlist","reused").put("id","new"));assertEquals(listOf("new"),client.playbackWindow("reused",0).ids)
  }
  @Test fun orphanDraftsExpireLazilyWithoutExpiringAnActivePlayback(){
    login();draft("orphan",true,"old");draft("live",true,"current");client.playback(JSONObject().put("playlist","live").put("id","current"));val live=client.playbackWindow("live",0)
    org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMinutes(6))
    try{client.playback(JSONObject().put("playlist","orphan").put("id","old"));fail("Expired draft played")}catch(_:IllegalStateException){};client.checkPlayback("live",live.lease)
    draft("new",true,"fresh");client.playback(JSONObject().put("playlist","new").put("id","fresh"));assertEquals(listOf("fresh"),client.playbackWindow("new",0).ids)
  }
  @Test fun singleControlsAreTransientAndIndependentOfReferenceQueueMemories(){
    login()
    fun open(ticket:String,reference:Boolean=false):RhVideoClient.Window {
      val row=JSONObject().put("id","one").put("duration",20).put("segmentStart",0).put("segmentLength",20)
      val options=JSONObject().put("fullLength",true);if(reference)options.put("reference",true).put("mode","segments").put("loop",false).put("rate",1.0)
      client.request("playlist.prepare",JSONObject().put("ticket",ticket).put("reset",true).put("items",JSONArray().put(row)).put("options",options));client.playback(JSONObject().put("playlist",ticket).put("id","one"));return client.playbackWindow(ticket,0)
    }
    var window=open("single-one");client.playbackOptions("single-one",window.lease,0,JSONObject().put("loop",true).put("rate",1.5));client.closePlayback("single-one",window.lease,0,true)
    window=open("single-two");assertTrue(window.options.getBoolean("loop"));assertEquals(1.5,window.options.getDouble("rate"),.001);client.closePlayback("single-two",window.lease,0,true)
    window=open("independent-playlist",true);assertFalse(window.options.getBoolean("loop"));assertEquals(1.0,window.options.getDouble("rate"),.001);client.closePlayback("independent-playlist",window.lease,0,true)
    window=open("single-again");assertTrue(window.options.getBoolean("loop"));assertEquals(1.5,window.options.getDouble("rate"),.001)
    client.logout();login();window=open("new-account-session");assertFalse(window.options.getBoolean("loop"));assertEquals(1.0,window.options.getDouble("rate"),.001)
  }
  @Test fun staleSessionCannotWriteOrRevokeANewerLogin(){
    login();val old=client.state().getLong("generation");login();val active=client.state().getLong("generation");assertNotEquals(old,active)
    for(action in listOf("preferences","operation"))try{
      client.request(action,JSONObject().put("_sessionGeneration",old).put("value",JSONObject().put("sort","nameAsc")).put("name","watch.add").put("body",JSONObject().put("path","D:\\OldAccount")))
      fail("Old account operation accepted")
    }catch(_:IllegalStateException){}
    try{client.logout(old);fail("Old logout accepted")}catch(_:IllegalStateException){}
    assertEquals(active,client.state().getLong("generation"));assertTrue(client.state().getBoolean("connected"));assertEquals(2,server.requestCount)
  }
  @Test fun catalogCapabilitiesStreamJsonWithoutBridgeTokensAndRevokeOnLogout(){
    login();val resource=client.request("catalog.resource",JSONObject().put("kind","video")) as JSONObject
    val url=resource.getString("url");assertTrue(url.startsWith("https://appassets.androidplatform.net/rhvideo-catalog/"));assertFalse(resource.toString().contains("test-native-token"))
    json("""[{"id":"one","original_filename":"中文视频.mp4"}]""")
    val key=url.substringAfterLast('/');val stream=client.catalogResource(key)
    assertEquals("/api/v1/videos?summary=true",server.takeRequest().path)
    assertEquals(1,JSONArray(stream.readBytes().toString(Charsets.UTF_8)).length())
    client.logout();try{stream.read();fail("Existing streams must reject the revoked session")}catch(_:java.io.IOException){}
    stream.close();try{client.catalogResource(key);fail("Old capabilities cannot be reopened")}catch(_:Exception){}
  }
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
    val other=client.request("preferences",JSONObject()) as JSONObject;assertEquals(1,other.length());assertFalse(other.getBoolean("autoRotate"));assertFalse(other.has("sort"))
    val stored=RuntimeEnvironment.getApplication().getSharedPreferences("rhvideo-client-v1",0).all.toString();assertFalse(stored.contains("test-native-token"));assertFalse(stored.contains("different-account-token"));assertFalse(stored.contains("other-password"))
  }
  @Test fun preparedReferenceSegmentsAreNotRandomizedOrExtendedByTheNativeWindow(){
    login()
    val rows=JSONArray().put(JSONObject().put("id","planned").put("duration",20).put("segmentStart",7.2).put("segmentLength",3))
      .put(JSONObject().put("id","short").put("duration",1.5).put("segmentStart",0).put("segmentLength",1.5))
      .put(JSONObject().put("id","unknown").put("duration",0).put("segmentStart",0).put("segmentLength",86400))
    client.request("playlist.prepare",JSONObject().put("ticket","exact-plan").put("reset",true).put("items",rows).put("options",JSONObject().put("reference",true).put("fullLength",false).put("segment",3)))
    client.playback(JSONObject().put("playlist","exact-plan").put("id","planned"))
    val w=client.playbackWindow("exact-plan",0)
    assertEquals(listOf(7200L,0L,0L),w.starts)
    assertEquals(listOf(10200L,1500L,86400000L),w.ends)
    assertEquals(7200L,client.playback(JSONObject().put("playlist","exact-plan").put("id","planned")).position)
  }
  @Test fun activePlaylistIsIndependentOfLaterPreparedQueues(){
    login()
    client.request("playlist.prepare",JSONObject().put("ticket","playing").put("reset",true).put("items",JSONArray().put(JSONObject().put("id","one"))).put("options",JSONObject().put("fullLength",true)))
    client.playback(JSONObject().put("playlist","playing").put("id","one"))
    client.request("playlist.prepare",JSONObject().put("ticket","later-grid").put("reset",true).put("items",JSONArray().put(JSONObject().put("id","other"))).put("options",JSONObject().put("grid",true)))
    assertEquals(1,client.playbackWindow("playing",0).total)
    assertEquals(7500L,client.playback(JSONObject().put("playlist","playing").put("id","one").put("seconds",7.5)).position)
    assertEquals(0L,client.playback(JSONObject().put("playlist","playing").put("id","one").put("seconds",0).put("resume",true)).position)
  }
  @Test fun invalidNewPlaybackDoesNotReplaceTheActiveLease(){
    login()
    fun prepare(ticket:String,id:String){client.request("playlist.prepare",JSONObject().put("ticket",ticket).put("reset",true).put("items",JSONArray().put(JSONObject().put("id",id))).put("options",JSONObject().put("fullLength",true)))}
    prepare("active","one");client.playback(JSONObject().put("playlist","active").put("id","one"));val lease=client.playbackWindow("active",0).lease
    prepare("invalid","two")
    try{client.playback(JSONObject().put("playlist","invalid").put("id","absent"));fail("Unknown item accepted")}catch(_:IllegalArgumentException){}
    client.checkPlayback("active",lease)
    try{client.playback(JSONObject().put("playlist","invalid").put("id","two").put("seconds",-1));fail("Invalid seek accepted")}catch(_:IllegalArgumentException){}
    client.checkPlayback("active",lease)
    client.playback(JSONObject().put("id","presentation-video"),track=false);client.checkPlayback("active",lease)
  }
  @Test fun parentReturnsAreBoundToTheOriginalPreviewAndBackDefersTheCommit(){
    login();val returns=java.util.concurrent.CopyOnWriteArrayList<JSONObject>();client.listen{name,value->if(name=="rhvideo-parent-preview")returns.add(value)}
    fun open(ticket:String){client.request("playlist.prepare",JSONObject().put("ticket",ticket).put("reset",true).put("items",JSONArray().put(JSONObject().put("id","one"))).put("options",JSONObject().put("fullLength",true).put("origin","frame").put("parentKey","frame:one:2").put("parentPreview","preview-snapshot").put("parentPlayback","child-"+ticket).put("parentTotal",8).put("deferPreviewCommit",true)));client.playback(JSONObject().put("playlist",ticket).put("id","one"))}
    open("parent");val w=client.playbackWindow("parent",0);client.request("preview.mark",JSONObject().put("kind","video").put("id","one").put("title","一"))
    client.closePlayback("parent",w.lease,-1,false)
    assertEquals("child-parent",returns.single().getString("parentPlayback"))
    assertEquals(1,returns.size);assertEquals(-1,returns.single().getInt("direction"));assertFalse(returns.single().getBoolean("close"));assertEquals("preview-snapshot",returns.single().getString("parentPreview"));assertEquals(1,(client.request("preview.pending",JSONObject()) as JSONObject).getJSONArray("items").length());assertEquals(1,server.requestCount)
    try{client.closePlayback("parent",w.lease,0,true);fail("Old closure accepted")}catch(_:IllegalStateException){}
    open("reopened");json("{}");client.closePlayback("reopened",client.playbackWindow("reopened",0).lease,0,true)
    awaitState{(client.request("preview.result",JSONObject()) as JSONObject).optInt("completed")==1};assertTrue(returns.last().getBoolean("close"));assertEquals("child-reopened",returns.last().getString("parentPlayback"));assertEquals(2,server.requestCount)
  }
  @Test fun previewMarksConsumeOnceAndFailuresRemainTerminalWithVisibleResults(){
    login();val events=java.util.concurrent.CopyOnWriteArrayList<JSONObject>();client.listen{name,value->if(name=="rhvideo-preview-result")events.add(value)}
    for(id in listOf("one","two"))client.request("preview.mark",JSONObject().put("kind","video").put("id",id).put("title",id))
    json("{}");server.enqueue(MockResponse().setResponseCode(500).setBody("failed"))
    val first=client.request("preview.commit",JSONObject()) as JSONObject;client.request("preview.commit",JSONObject())
    awaitState{(client.request("preview.result",JSONObject()) as JSONObject).optInt("completed")==2}
    val result=client.request("preview.result",JSONObject()) as JSONObject;assertEquals(first.getLong("run"),result.getLong("run"));assertFalse(result.getBoolean("running"));assertTrue(result.getJSONArray("items").getJSONObject(0).getBoolean("success"));assertFalse(result.getJSONArray("items").getJSONObject(1).getBoolean("success"))
    assertEquals("/api/v1/trash/video/one",server.takeRequest().path);assertEquals("/api/v1/trash/video/two",server.takeRequest().path)
    assertEquals(0,(client.request("preview.pending",JSONObject()) as JSONObject).getJSONArray("items").length());client.request("preview.commit",JSONObject());assertEquals(3,server.requestCount)
    assertTrue(events.any{it.getJSONObject("result").optInt("completed")==2})
  }
  @Test fun switchingAccountsDuringPreviewCommitDoesNotPublishIntoOrWriteAsTheNewAccount(){
    login();val generation=client.sessionGeneration();val finished=java.util.concurrent.CountDownLatch(1)
    client.listen{name,value->if(name=="rhvideo-preview-result"&&value.getLong("generation")==generation&&value.getJSONObject("result").optInt("completed")==2)finished.countDown()}
    for(id in listOf("one","two"))client.request("preview.mark",JSONObject().put("kind","video").put("id",id).put("title",id))
    server.enqueue(MockResponse().setHeader("Content-Type","application/json").setBody("{}").setBodyDelay(500,java.util.concurrent.TimeUnit.MILLISECONDS));client.request("preview.commit",JSONObject());assertEquals("/api/v1/trash/video/one",server.takeRequest(3,java.util.concurrent.TimeUnit.SECONDS)?.path)
    client.logout();json("""{"access_token":"new-account"}""");client.connect(JSONObject().put("server",server.url("/").toString()).put("username","other").put("password","test"));server.takeRequest()
    client.request("preview.mark",JSONObject().put("kind","picture").put("id","new").put("title","新账户"))
    assertTrue(finished.await(5,java.util.concurrent.TimeUnit.SECONDS));assertEquals(3,server.requestCount)
    assertEquals(0,(client.request("preview.result",JSONObject()) as JSONObject).length());assertEquals("new",(client.request("preview.pending",JSONObject()) as JSONObject).getJSONArray("items").getJSONObject(0).getString("id"))
  }
  @Test fun nativeFavoritesShareTheCacheAndReportFailureWithoutReplayingAWrite(){
    login();json("""{"video_ids":[],"picture_ids":[],"novel_ids":[]}""");client.request("favorites",JSONObject());server.takeRequest()
    json("{}");val generation=client.sessionGeneration();client.toggleFavorite("video","one",generation){true};awaitState{!client.favoriteState("video","one",generation).getBoolean("favoriteBusy")}
    assertTrue(client.favoriteState("video","one",generation).getBoolean("favorite"));assertEquals("PUT",server.takeRequest().method)
    server.enqueue(MockResponse().setResponseCode(500).setBody("failed"));client.toggleFavorite("video","one",generation){true};awaitState{!client.favoriteState("video","one",generation).getBoolean("favoriteBusy")}
    val failed=client.favoriteState("video","one",generation);assertTrue(failed.getBoolean("favorite"));assertFalse(failed.isNull("favoriteError"));assertEquals("DELETE",server.takeRequest().method);assertEquals(4,server.requestCount)
  }
  @Test fun writesDoNotReuseIdleReadConnectionsOrReplayAnAmbiguousResponse(){
    login();json("""{"video_ids":[],"picture_ids":[],"novel_ids":[]}""");client.request("favorites",JSONObject());assertEquals(0,server.takeRequest().sequenceNumber)
    json("{}");client.request("favorite",JSONObject().put("kind","video").put("id","one").put("enabled",true));val first=server.takeRequest();assertEquals("PUT",first.method);assertEquals(0,first.sequenceNumber)
    json("{}");client.request("favorite",JSONObject().put("kind","video").put("id","one").put("enabled",false));val second=server.takeRequest();assertEquals("DELETE",second.method);assertEquals(0,second.sequenceNumber)
    server.enqueue(MockResponse().setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.DISCONNECT_AFTER_REQUEST))
    try{client.request("favorite",JSONObject().put("kind","video").put("id","one").put("enabled",true));fail("A lost response cannot be treated as success")}catch(_:java.io.IOException){}
    assertEquals("PUT",server.takeRequest().method);assertEquals(5,server.requestCount);assertNull(server.takeRequest(200,java.util.concurrent.TimeUnit.MILLISECONDS))
  }
  @Test fun safeReadsCanReconnectWithoutGivingWritesTheSameReplayPolicy(){
    login();json("""{"video_ids":[],"picture_ids":[],"novel_ids":[]}""");client.request("favorites",JSONObject());server.takeRequest()
    server.enqueue(MockResponse().setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.DISCONNECT_AFTER_REQUEST));json("""{"video_ids":["one"],"picture_ids":[],"novel_ids":[]}""")
    assertEquals("one",(client.request("favorites",JSONObject()) as JSONObject).getJSONArray("video_ids").getString(0));assertEquals("GET",server.takeRequest().method);assertEquals("GET",server.takeRequest().method);assertEquals(4,server.requestCount)
  }
  @Test fun anAcceptedNativeFavoriteKeepsItsCapturedTargetAfterViewerNavigation(){
    login();val current=java.util.concurrent.atomic.AtomicBoolean(true);val generation=client.sessionGeneration()
    server.enqueue(MockResponse().setHeader("Content-Type","application/json").setBody("""{"video_ids":[],"picture_ids":[],"novel_ids":[]}""").setBodyDelay(500,java.util.concurrent.TimeUnit.MILLISECONDS))
    client.toggleFavorite("video","one",generation){current.get()};assertEquals("/api/v1/favorites/ids",server.takeRequest(3,java.util.concurrent.TimeUnit.SECONDS)?.path);current.set(false)
    json("{}");awaitState{!client.favoriteState("video","one",generation).getBoolean("favoriteBusy")};assertTrue(client.favoriteState("video","one",generation).getBoolean("favorite"));assertTrue(client.favoriteState("video","one",generation).isNull("favoriteError"));assertEquals("/api/v1/favorites/video/one",server.takeRequest().path);assertEquals(3,server.requestCount)
  }
  @Test fun aStaleFavoriteRejectedBeforeAdmissionCannotIssueAnyRequest(){
    login();try{client.toggleFavorite("video","one",client.sessionGeneration()){false};fail("Late input accepted")}catch(_:IllegalStateException){};assertEquals(1,server.requestCount)
  }
  @Test fun accountRevocationStillStopsAnAcceptedFavoriteBeforeSubmission(){
    login();val finished=java.util.concurrent.CountDownLatch(1);val old=client.sessionGeneration();client.listen{name,value->if(name=="rhvideo-media-action"&&value.optString("id")=="one"&&value.optLong("generation")==old)finished.countDown()}
    server.enqueue(MockResponse().setHeader("Content-Type","application/json").setBody("""{"video_ids":[],"picture_ids":[],"novel_ids":[]}""").setBodyDelay(500,java.util.concurrent.TimeUnit.MILLISECONDS))
    client.toggleFavorite("video","one",old){true};assertEquals("/api/v1/favorites/ids",server.takeRequest(3,java.util.concurrent.TimeUnit.SECONDS)?.path);client.logout();login()
    assertTrue("Old native job must settle without writing",finished.await(5,java.util.concurrent.TimeUnit.SECONDS));assertEquals(3,server.requestCount);assertFalse(client.favoriteState("video","one",client.sessionGeneration()).getBoolean("favorite"))
  }
  @Test fun playlistModesHaveIndependentAccountScopedMemoriesAndLeases(){
    login()
    fun prepare(ticket:String,mode:String){client.request("playlist.prepare",JSONObject().put("ticket",ticket).put("reset",true).put("items",JSONArray().put(JSONObject().put("id","one").put("duration",20).put("segmentStart",2).put("segmentLength",3))).put("options",JSONObject().put("reference",true).put("mode",mode).put("fullLength",false).put("segment",3)))}
    prepare("segments","segments");client.playback(JSONObject().put("playlist","segments").put("id","one"));val segment=client.playbackWindow("segments",0)
    client.playbackOptions("segments",segment.lease,0,JSONObject().put("loop",true).put("rate",1.5));client.rememberPlaylist("segments",segment.lease,0)
    val saved=client.request("playlist.state",JSONObject().put("mode","segments")) as JSONObject;assertTrue(saved.getBoolean("loop"));assertEquals(1.5,saved.getDouble("rate"),0.0)
    assertEquals(0,(client.request("playlist.state",JSONObject().put("mode","sequential")) as JSONObject).length())
    prepare("sequential","sequential");client.playback(JSONObject().put("playlist","sequential").put("id","one"))
    try{client.playbackTarget("segments",segment.lease,.5);fail("Old playback lease accepted")}catch(_:IllegalStateException){}
    assertEquals(saved.toString(),client.request("playlist.state",JSONObject().put("mode","segments")).toString())
    client.logout();json("""{"access_token":"other"}""");client.connect(JSONObject().put("server",server.url("/").toString()).put("username","other").put("password","test"));server.takeRequest()
    assertEquals(0,(client.request("playlist.state",JSONObject().put("mode","segments")) as JSONObject).length())
  }
  @Test fun gridResolvesOnlyOneBoundedGroupAndRevokesItsCapabilitiesOnLogout(){
    login();val rows=JSONArray();for(i in 0 until 10)rows.put(JSONObject().put("id","video-$i").put("title","视频 $i"))
    client.request("playlist.prepare",JSONObject().put("ticket","grid-qa").put("reset",true).put("items",rows).put("options",JSONObject()))
    val page=client.gridWindow("grid-qa",8,4,true);assertEquals(2,page.getJSONArray("items").length());assertEquals(10,page.getInt("total"));assertEquals(8,page.getInt("offset"))
    try{client.gridWindow("grid-qa",9,4,false);fail("Misaligned grid page accepted")}catch(_:IllegalArgumentException){}
    client.logout();try{client.gridWindow("grid-qa",0,4,false);fail("Old grid accepted")}catch(_:Exception){}
  }
  @Test fun nativeGridRetainsItsOwnPlanAndRestoresOnlyTheSameOrderedGroup(){
    login()
    val rows=JSONArray();for(i in 0..4)rows.put(JSONObject().put("id","video-$i").put("title","视频 $i").put("gridEnd",i==2||i==4).put("gridRect",JSONArray(listOf(0,0,1,1))))
    fun prepare(ticket:String,items:JSONArray=rows){client.request("playlist.prepare",JSONObject().put("ticket",ticket).put("reset",true).put("items",items).put("options",JSONObject().put("grid",true)))}
    prepare("first");val first=client.openGrid("first",4,false);assertEquals(3,first.getInt("count"));assertEquals(2,first.getInt("groupTotal"));assertEquals(3,first.getInt("nextOffset"))
    val next=client.gridWindow("first",3,4,false);assertEquals(2,next.getInt("count"));assertEquals("video-3",next.getJSONArray("items").getJSONObject(0).getString("id"))
    client.rememberGrid("first",first.getString("lease"),3)
    prepare("single",JSONArray().put(JSONObject().put("id","other")))
    assertEquals(2,client.gridWindow("first",3,4,false).getInt("count"));client.checkGrid("first",first.getString("lease"))
    prepare("second");val second=client.openGrid("second",4,true);assertEquals(3,second.getInt("offset"));assertNotEquals(first.getString("lease"),second.getString("lease"))
    try{client.checkGrid("first",first.getString("lease"));fail("Old viewer accepted")}catch(_:IllegalStateException){}
    val reversed=JSONArray();for(i in listOf(0,1,2,4,3))reversed.put(JSONObject(rows.getJSONObject(i).toString()).put("gridEnd",reversed.length()==2||reversed.length()==4))
    prepare("third",reversed);assertEquals(0,client.openGrid("third",4,false).getInt("offset"))
    client.logout();try{client.checkGrid("third",second.getString("lease"));fail("Logged-out viewer accepted")}catch(_:IllegalStateException){}
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
  @Test fun successfulSourceWritesInvalidateTheNativeVideoCatalogImmediately(){
    client=RhVideoClient(RuntimeEnvironment.getApplication(),JSONObject(java.io.File("src/main/assets/rhvideo/rhvideo-operations.json").readText()))
    login();json("""[{"id":"1","original_filename":"需要暂存.mp4"}]""");assertEquals(1,(client.request("catalog",JSONObject()) as JSONObject).getInt("total"));server.takeRequest()
    json("{}");client.request("operation",JSONObject().put("name","trash.stage").put("params",JSONObject().put("kind","video").put("id","1")).put("confirmation","RHVIDEO:trash.stage"));assertEquals("/api/v1/trash/video/1",server.takeRequest().path)
    json("[]");assertEquals(0,(client.request("catalog",JSONObject()) as JSONObject).getInt("total"));assertEquals("/api/v1/videos?summary=true",server.takeRequest().path)
  }
  @Test fun loginKeepsOnlyServerAndUserInOrdinarySettingsAndNewClientsDoNotAssumeAuthentication(){
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
  private fun thumbnailKey():String=(client.request("images",JSONObject().put("paths",JSONArray().put("/api/v1/videos/one/thumbnail"))) as JSONArray).getString(0).substringAfterLast('/')
  // Deterministically revoke AFTER the real HTTP response headers were accepted,
  // inside the next body read. This is a network-boundary unit test, not an
  // Activity/rendering acceptance test; no sleeps or production injection hooks.
  private fun revokeInsideBodyRead(field:String):()->Boolean {
    var revoked=false
    val original=org.robolectric.util.ReflectionHelpers.getField<okhttp3.OkHttpClient>(client,field)
    val observed=original.newBuilder().addNetworkInterceptor { chain->
      val response=chain.proceed(chain.request());val body=response.body!!
      val source=object:okio.ForwardingSource(body.source()) {
        override fun read(sink:okio.Buffer,byteCount:Long):Long {
          val size=super.read(sink,byteCount)
          if(size>0&&!revoked){revoked=true;client.logout()}
          return size
        }
      }.buffer()
      response.newBuilder().body(object:okhttp3.ResponseBody(){
        override fun contentType()=body.contentType()
        override fun contentLength()=body.contentLength()
        override fun source()=source
      }).build()
    }.build()
    org.robolectric.util.ReflectionHelpers.setField(client,field,observed)
    return {revoked}
  }
  @Test fun logoutDuringImageSniffRejectsTheOldImageMetadata(){
    login();val key=thumbnailKey();val revoked=revokeInsideBodyRead("mediaHttp")
    server.enqueue(MockResponse().setHeader("Content-Type","application/octet-stream").setBody(okio.Buffer().write("\u0089PNG\r\n\u001a\nold-image".toByteArray(Charsets.ISO_8859_1))))
    try{client.media(key,image=true).use{};fail("Old image MIME/length escaped after logout during sniff")}catch(e:IllegalStateException){assertEquals("RHVideo 登录已结束",e.message)}
    assertTrue(revoked());assertFalse(client.state().getBoolean("connected"));assertEquals(2,server.requestCount)
  }
  private fun mediaReadRevokedInsideNetworkRead(bulk:Boolean){
    login();val key=client.playback(JSONObject().put("id","one")).path.removePrefix("rhvideo://");val revoked=revokeInsideBodyRead("mediaHttp")
    server.enqueue(MockResponse().setHeader("Content-Type","video/mp4").setBody("private-old-video"))
    client.media(key,image=false).use{media->
      assertFalse(revoked())
      try{if(bulk)media.stream.read(ByteArray(32),0,32)else media.stream.read();fail("The pending read exposed bytes after logout")}catch(e:java.io.IOException){assertEquals("RHVideo 登录已结束",e.message)}
    }
    assertTrue(revoked());assertEquals(2,server.requestCount)
  }
  @Test fun logoutDuringSingleByteMediaReadRejectsTheReturnedByte(){mediaReadRevokedInsideNetworkRead(false)}
  @Test fun logoutDuringBulkMediaReadRejectsTheReturnedBytes(){mediaReadRevokedInsideNetworkRead(true)}
  private fun catalogReadRevokedInsideNetworkRead(bulk:Boolean){
    login();val key=(client.request("catalog.resource",JSONObject().put("kind","video")) as JSONObject).getString("url").substringAfterLast('/');val revoked=revokeInsideBodyRead("http")
    json("""[{"id":"private-old-catalog"}]""")
    client.catalogResource(key).use{stream->
      assertFalse(revoked())
      try{if(bulk)stream.read(ByteArray(64),0,64)else stream.read();fail("The pending read exposed old catalog data")}catch(e:java.io.IOException){assertEquals("RHVideo 登录已结束",e.message)}
    }
    assertTrue(revoked());assertEquals(2,server.requestCount)
  }
  @Test fun logoutDuringSingleByteCatalogReadRejectsTheReturnedByte(){catalogReadRevokedInsideNetworkRead(false)}
  @Test fun logoutDuringBulkCatalogReadRejectsTheReturnedBytes(){catalogReadRevokedInsideNetworkRead(true)}
  @Test fun imageContentOverridesAnIncorrectServerMimeWithoutLosingThePrefix(){
    login();val key=thumbnailKey();val bytes="RIFF\u0010\u0000\u0000\u0000WEBPVP8 body-图片".toByteArray()
    server.enqueue(MockResponse().setHeader("Content-Type","application/octet-stream").setChunkedBody(okio.Buffer().write(bytes),3))
    client.media(key,image=true).use{assertEquals("image/webp",it.type);assertArrayEquals(bytes,it.stream.readBytes())};server.takeRequest()
  }
  @Test fun anHtmlErrorCannotBecomeAnImageJustBecauseTheServerLabelsItAsOne(){
    login();val key=thumbnailKey()
    for(type in listOf("image/png","image/svg+xml","application/octet-stream")){
      server.enqueue(MockResponse().setHeader("Content-Type",type).setBody("<!DOCTYPE html><html>upstream login failed</html>"))
      try{client.media(key,image=true).use{};fail("Accepted an HTML error as $type")}catch(_:IllegalArgumentException){};server.takeRequest()
    }
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
