package com.railgunhamster.rhfiles

import android.content.Context
import android.content.Intent
import android.net.Uri
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.android.controller.ServiceController
import org.robolectric.annotation.Config
import java.io.File
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoDownloadsTest {
  private lateinit var context:Context
  private lateinit var client:RhVideoClient
  private lateinit var server:MockWebServer
  private var service:ServiceController<RhVideoDownloadService>?=null
  private val exportId="c8f17f3e-28c5-4fca-9fb2-204fb8713980"
  private val zip="PK\u0003\u0004zip-data"
  @Before fun setup(){context=RuntimeEnvironment.getApplication();server=MockWebServer();server.start();client=RhVideoClient(context);server.enqueue(MockResponse().setHeader("Content-Type","application/json").setBody("""{"access_token":"download-native-only"}"""));client.connect(JSONObject().put("server",server.url("/").toString()).put("username","demo").put("password","test-only"));server.takeRequest()}
  @After fun close(){client.logout();service?.destroy();server.shutdown()}
  private fun output(name:String)=File(File(context.cacheDir,"exports").apply{mkdirs()},name)
  private fun ready(){server.enqueue(MockResponse().setHeader("Content-Type","application/json").setBody("""{"id":"$exportId","request_id":"dafcc457-e7ac-42f6-a808-53841219d5ec","status":"completed","total":1,"archive_bytes":12,"cancel_requested":false,"can_download":true,"created_at":"2026-10-29T00:00:00Z","finished_at":"2026-10-29T00:00:01Z","expires_at":"2026-10-30T00:00:00Z","progress":{"percent":100}}"""))}
  private fun start(file:File):String{
    val reply=client.startZip(JSONObject().put("id",exportId),RhVideoZipDestination.local(context,file.path));val id=reply.getJSONObject("task").getString("id")
    service=Robolectric.buildService(RhVideoDownloadService::class.java).create().also{it.get().onStartCommand(null,0,1)};return id
  }
  private fun task(id:String):JSONObject {val list=(client.request("exports.downloads",JSONObject())as JSONObject).getJSONArray("items");return (0 until list.length()).map{list.getJSONObject(it)}.first{it.getString("id")==id}}
  private fun awaitTerminal(id:String):JSONObject {val end=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);while(System.nanoTime()<end){val value=task(id);if(value.getString("state") in setOf("saved","failed","cancelled"))return value;Thread.sleep(10)};error("Download did not reach a terminal state: ${task(id)}")}
  @Test fun foregroundDownloadStreamsToANewFileAndKeepsTokensOutOfTasksAndJournal(){
    ready();server.enqueue(MockResponse().setHeader("Content-Type","application/zip").setBody(zip));val file=output("native.zip");val id=start(file)
    val result=awaitTerminal(id);assertEquals("saved",result.getString("state"));assertEquals(file.name,result.getString("name"));assertEquals(zip,file.readText());assertEquals(12,result.getLong("bytes"));assertFalse(result.toString().contains("download-native-only"))
    val metadata=server.takeRequest(5,TimeUnit.SECONDS)!!;assertEquals("/api/v1/favorite-exports/$exportId",metadata.path)
    val download=server.takeRequest(5,TimeUnit.SECONDS)!!;assertEquals("/api/v1/favorite-exports/$exportId/download",download.path);assertEquals("Bearer download-native-only",download.getHeader("Authorization"));assertFalse(download.path!!.contains("token"));assertEquals("ZIP saves must not borrow an idle metadata/thumbnail socket",0,download.sequenceNumber)
    assertFalse(File(context.filesDir,"rhvideo-downloads.json").readText().contains("download-native-only"))
    try{client.request("exports.download.cancel",JSONObject().put("taskId",id));fail("A completed file was cancelled")}catch(_:IllegalStateException){};assertEquals(zip,file.readText())
  }
  @Test fun aPreexistingPathIsNeverTruncatedAndErrorPagesCannotBecomeZipFiles(){
    val file=output("existing.zip");file.writeText("user data");ready();server.enqueue(MockResponse().setHeader("Content-Type","application/zip").setBody(zip));val id=start(file);assertEquals("failed",awaitTerminal(id).getString("state"));assertEquals("user data",file.readText())
    service?.destroy();service=null;ready();server.enqueue(MockResponse().setHeader("Content-Type","text/html").setBody("login screen"));val other=output("not-html.zip");val failed=start(other);assertEquals("failed",awaitTerminal(failed).getString("state"));assertFalse(other.exists())
  }
  @Test fun explicitCancellationStopsTheExactTaskWithoutReplayingTheRequest(){
    ready();server.enqueue(MockResponse().setHeader("Content-Type","application/zip").setBody(zip).throttleBody(2,250,TimeUnit.MILLISECONDS));val file=output("cancel.zip");val id=start(file)
    val end=System.nanoTime()+TimeUnit.SECONDS.toNanos(8);while(task(id).getLong("bytes")<4&&System.nanoTime()<end)Thread.sleep(10)
    client.request("exports.download.cancel",JSONObject().put("taskId",id));assertEquals("cancelled",awaitTerminal(id).getString("state"));assertEquals(3,server.requestCount)
  }
  @Test fun cancellingBeforeServiceAdmissionFinishesImmediatelyAndCannotLeaveAnActiveGhost(){
    ready();val file=output("not-started.zip");val reply=client.startZip(JSONObject().put("id",exportId),RhVideoZipDestination.local(context,file.path));val id=reply.getJSONObject("task").getString("id")
    assertEquals("cancelled",(client.request("exports.download.cancel",JSONObject().put("taskId",id))as JSONObject).getString("state"))
    service=Robolectric.buildService(RhVideoDownloadService::class.java).create().also{it.get().onStartCommand(null,0,1)}
    assertEquals("cancelled",task(id).getString("state"));assertFalse(RhVideoDownloads.get(context).hasActive());assertFalse(file.exists());assertEquals(2,server.requestCount)
  }
  private fun pending(metadata:JSONObject)=JSONObject().put("id",exportId).put("ticket",metadata.getString("ticket")).put("process",client.processIdentity()).put("_sessionGeneration",metadata.getLong("generation"))
  @Test fun pickerPreparationIsConsumedOnceAndStartsForegroundWorkWithoutASecondMetadataRequest(){
    ready();val pick=pending(client.prepareZip(JSONObject().put("id",exportId)));server.enqueue(MockResponse().setHeader("Content-Type","application/zip").setBody(zip))
    val file=output("from-picker.zip");val reply=client.startPreparedZip(pick,RhVideoZipDestination.local(context,file.path));val id=reply.getJSONObject("task").getString("id")
    assertEquals("queued",reply.getJSONObject("task").getString("state"));assertEquals(2,server.requestCount)
    try{client.startPreparedZip(pick,RhVideoZipDestination.local(context,output("replayed.zip").path));fail("Picker preparation replayed")}catch(_:java.io.IOException){}
    service=Robolectric.buildService(RhVideoDownloadService::class.java).create().also{it.get().onStartCommand(null,0,1)}
    assertEquals("saved",awaitTerminal(id).getString("state"));assertEquals(zip,file.readText());assertEquals(3,server.requestCount);assertFalse(output("replayed.zip").exists())
    assertEquals("/api/v1/favorite-exports/$exportId",server.takeRequest(5,TimeUnit.SECONDS)!!.path);assertEquals("/api/v1/favorite-exports/$exportId/download",server.takeRequest(5,TimeUnit.SECONDS)!!.path)
  }
  @Test fun anExpiredCancelledOrOldProcessPickerCannotStartAnyDownload(){
    ready();val expired=pending(client.prepareZip(JSONObject().put("id",exportId)));org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMinutes(6))
    try{client.startPreparedZip(expired,RhVideoZipDestination.local(context,output("expired.zip").path));fail("Expired preparation accepted")}catch(_:java.io.IOException){}
    ready();val cancelled=pending(client.prepareZip(JSONObject().put("id",exportId)));client.discardZipPick(cancelled.getString("ticket"))
    try{client.startPreparedZip(cancelled,RhVideoZipDestination.local(context,output("discarded.zip").path));fail("Discarded preparation accepted")}catch(_:java.io.IOException){}
    ready();val old=pending(client.prepareZip(JSONObject().put("id",exportId))).put("process","old-process")
    try{client.startPreparedZip(old,RhVideoZipDestination.local(context,output("old-process.zip").path));fail("Old process preparation accepted")}catch(_:java.io.IOException){}
    assertEquals(4,server.requestCount);assertFalse(RhVideoDownloads.get(context).hasActive());assertFalse(output("expired.zip").exists());assertFalse(output("discarded.zip").exists());assertFalse(output("old-process.zip").exists())
  }
  @Test fun accountChangeInvalidatesPreparedPickerWithoutRetainingItsAuthority(){
    ready();val pick=pending(client.prepareZip(JSONObject().put("id",exportId)));client.logout()
    try{client.startPreparedZip(pick,RhVideoZipDestination.local(context,output("old-account.zip").path));fail("An old account picker started a download")}catch(_:java.io.IOException){}
    assertEquals(2,server.requestCount);assertFalse(output("old-account.zip").exists());assertFalse(RhVideoDownloads.get(context).hasActive())
  }
  @Test fun anInterruptedZipBodyFailsWithoutReplayingOrPublishingThePartialFile(){
    ready();server.enqueue(MockResponse().setHeader("Content-Type","application/zip").setBody(zip).setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY))
    val file=output("interrupted-body.zip");val id=start(file);val result=awaitTerminal(id)
    assertEquals("failed",result.getString("state"));assertTrue(result.getString("error").isNotEmpty());assertTrue(!file.exists()||file.length()<zip.length)
    server.takeRequest(5,TimeUnit.SECONDS)!!;val stream=server.takeRequest(5,TimeUnit.SECONDS)!!;assertEquals("/api/v1/favorite-exports/$exportId/download",stream.path);assertEquals(0,stream.sequenceNumber)
    assertEquals(3,server.requestCount);assertNull(server.takeRequest(200,TimeUnit.MILLISECONDS))
  }
  @Test fun selectedDocumentRetainsReadWriteAccessAndCleanupReleasesOnlyOwnedPermissionBits(){
    val uri=Uri.parse("content://owned.documents/document/new-zip")
    val destination=RhVideoZipDestination.document(context,uri);assertEquals(3,destination.grantFlags);assertTrue(destination.grantWarning.isEmpty())
    assertTrue(context.contentResolver.persistedUriPermissions.any{it.uri==uri&&it.isReadPermission&&it.isWritePermission})
    val duplicate=RhVideoZipDestination.document(context,uri);assertEquals(0,duplicate.grantFlags);duplicate.failed()
    assertTrue(context.contentResolver.persistedUriPermissions.any{it.uri==uri&&it.isReadPermission&&it.isWritePermission})
    destination.failed();assertFalse(context.contentResolver.persistedUriPermissions.any{it.uri==uri});destination.failed()
  }
  @Test fun aPreexistingReadGrantIsNotRevokedByDownloadCleanup(){
    val uri=Uri.parse("content://owned.documents/document/shared-read")
    context.contentResolver.takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION)
    val destination=RhVideoZipDestination.document(context,uri);assertEquals(Intent.FLAG_GRANT_WRITE_URI_PERMISSION,destination.grantFlags);destination.failed()
    assertTrue(context.contentResolver.persistedUriPermissions.any{it.uri==uri&&it.isReadPermission&&!it.isWritePermission})
  }
  @Test fun boundedHistoryTransfersSharedGrantOwnershipAndReleasesItOnlyAfterTheLastReferenceIsEvicted(){
    val uri=Uri.parse("content://owned.documents/document/old-save");context.contentResolver.takePersistableUriPermission(uri,3)
    // This fixture models a fresh process loading its private journal, not a
    // production reset command or permission to delete any referenced file.
    RhVideoDownloads::class.java.getDeclaredField("instance").apply{isAccessible=true;set(null,null)}
    val records=org.json.JSONArray()
    for(i in 0 until 64){val task=JSONObject().put("id",java.util.UUID.randomUUID().toString()).put("exportId",exportId).put("state","saved").put("path",if(i<2)uri.toString() else output("old-$i.zip").path).put("name","old-$i.zip").put("bytes",12).put("total",12).put("started",i).put("finished",i).put("speed",0).put("error","").put("revision",1);records.put(JSONObject().put("owner","0".repeat(64)).put("task",task).put("grantFlags",if(i==0)3 else 0))}
    File(context.filesDir,"rhvideo-downloads.json").writeText(records.toString())
    ready();val first=client.startZip(JSONObject().put("id",exportId),RhVideoZipDestination.local(context,output("trim-first.zip").path)).getJSONObject("task").getString("id");client.request("exports.download.cancel",JSONObject().put("taskId",first))
    assertTrue(context.contentResolver.persistedUriPermissions.any{it.uri==uri&&it.isReadPermission&&it.isWritePermission})
    ready();val second=client.startZip(JSONObject().put("id",exportId),RhVideoZipDestination.local(context,output("trim-second.zip").path)).getJSONObject("task").getString("id");client.request("exports.download.cancel",JSONObject().put("taskId",second))
    assertFalse(context.contentResolver.persistedUriPermissions.any{it.uri==uri});assertFalse(RhVideoDownloads.get(context).hasActive());assertEquals(3,server.requestCount)
  }
}
