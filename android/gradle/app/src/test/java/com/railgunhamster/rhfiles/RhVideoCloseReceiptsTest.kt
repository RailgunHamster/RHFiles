package com.railgunhamster.rhfiles

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoCloseReceiptsTest {
  private fun run(id:String="library:1",key:String="once",started:Long=10000)=JSONObject().put("id",id).put("action","rhvideo.back").put("key",key).put("fingerprint","rhvideo.back:{}").put("startedAt",started)
  private fun store()=RhVideoCloseReceiptStore(wall={10000})
  private fun ticket(store:RhVideoCloseReceiptStore,run:JSONObject=run())=(store.begin(run) as RhVideoCloseReceiptStore.Admission.Start).ticket
  private fun rejected(work:()->Unit){try{work();fail("Expected rejection without repeating close")}catch(expected:IllegalArgumentException){}catch(expected:IllegalStateException){}}

  @Test fun queuingCloseIsRunningUntilDestructionAndReadsCannotMutateTheStore(){
    val store=store();val ticket=ticket(store)
    val running=store.read(JSONObject().put("key","once"))!!;assertEquals("running",running.getString("state"));assertTrue(running.isNull("finishedAt"));assertFalse(running.has("result"))
    running.put("state","succeeded");assertEquals("running",store.read(JSONObject().put("runId","library:1"))!!.getString("state"))
    ticket.finish(true);val receipt=store.read(JSONObject().put("runId","library:1"))!!
    assertEquals("succeeded",receipt.getString("state"));assertTrue(receipt.getBoolean("result"));assertEquals(10000L,receipt.getLong("finishedAt"));assertFalse(receipt.toString().contains("fingerprint"));assertFalse(receipt.has("key"))
    ticket.finish(false);assertEquals("succeeded",store.read(JSONObject().put("key","once"))!!.getString("state"))
  }
  @Test fun failedOrConflictingRequestsNeverProduceAnotherCloseTicket(){
    val store=store();val ticket=ticket(store)
    rejected{store.begin(run())};rejected{store.begin(run("other","once").put("fingerprint","different"))}
    ticket.finish(false);val receipt=store.read(JSONObject().put("key","once"))!!
    assertEquals("failed",receipt.getString("state"));assertEquals("ACTION_FAILED",receipt.getJSONObject("error").getString("code"));assertFalse(receipt.has("result"));rejected{store.begin(run())}
  }
  @Test fun completedDuplicateReturnsOnlyTheKnownResultWithoutARepeatTicket(){
    val store=store();ticket(store).finish(true)
    val result=store.begin(run("new-page:1")) as RhVideoCloseReceiptStore.Admission.Confirmed
    assertEquals(true,result.result)
  }
  @Test fun uiInvocationReturnsOnlyItsSmallConfirmedUiResultAndNotItsArguments(){
    val store=store();val run=run().put("action","ui.invoke").put("fingerprint","ui.invoke:{password:private-fixture}")
      .put("completionResult",JSONObject().put("controlId","ui-17").put("event","click"))
    ticket(store,run).finish(true);val receipt=store.read(JSONObject().put("key","once"))!!
    assertEquals("ui-17",receipt.getJSONObject("result").getString("controlId"));assertFalse(receipt.toString().contains("private-fixture"))
    receipt.getJSONObject("result").put("controlId","changed");assertEquals("ui-17",store.read(JSONObject().put("key","once"))!!.getJSONObject("result").getString("controlId"))
  }
  @Test fun malformedMetadataCannotAcquireATicket(){
    for(invalid in listOf(run().put("action","files.delete"),run().put("id",""),run().put("fingerprint","x".repeat(262145)),run().put("startedAt",1.5),run().put("startedAt","10000"),run().put("startedAt",100001),run().put("extra",true),run().put("completionResult",true),run().put("action","ui.invoke"),run().put("action","ui.invoke").put("completionResult",JSONObject().put("controlId","x").put("event","click").put("secret","no"))))rejected{store().begin(invalid)}
  }
  @Test fun lookupIsStrictAndUnknownRequestsDoNotInventSuccess(){
    val store=store();assertNull(store.read(JSONObject().put("runId","unknown")))
    for(invalid in listOf(JSONObject(),JSONObject().put("key","once").put("runId","library:1"),JSONObject().put("key",""),JSONObject().put("runId","library:1").put("timeoutMs",30001),JSONObject().put("runId","library:1").put("timeoutMs",-1),JSONObject().put("runId","library:1").put("extra",true)))rejected{store.read(invalid)}
  }
  @Test fun aWaitingReaderReleasesTheLockUntilRealDestruction(){
    val ready=CountDownLatch(1);var observe=false
    val store=RhVideoCloseReceiptStore(elapsed={if(observe)ready.countDown();System.nanoTime()/1_000_000},wall={10000})
    val ticket=ticket(store);val executor=Executors.newSingleThreadExecutor();observe=true
    try{
      val waiting=executor.submit<JSONObject>{store.read(JSONObject().put("runId","library:1").put("timeoutMs",2000))!!}
      assertTrue(ready.await(1,TimeUnit.SECONDS));val start=System.nanoTime();ticket.finish(true)
      assertTrue("A reader must not hold the completion lock while waiting",TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<1000)
      assertEquals("succeeded",waiting.get(1,TimeUnit.SECONDS).getString("state"))
    }finally{executor.shutdownNow()}
  }
  @Test fun capacityNeverEvictsActiveRequestsAndRetiredKeysCannotRepeatTheirOperation(){
    val store=RhVideoCloseReceiptStore(wall={10000},capacity=2,activeLimit=1,retiredLimit=2)
    val first=ticket(store);rejected{store.begin(run("second","second"))};first.finish(true)
    ticket(store,run("second","second")).finish(true);ticket(store,run("third","third")).finish(true)
    rejected{store.begin(run())};rejected{store.read(JSONObject().put("key","once"))}
    assertEquals("succeeded",store.read(JSONObject().put("key","third"))!!.getString("state"))
  }
  @Test fun anOldTicketCannotCompleteANewAttemptAfterExpiryEvenWithTheSameId(){
    var now=10000L;val store=RhVideoCloseReceiptStore(elapsed={now},wall={now},ttlMs=100)
    val old=ticket(store);old.finish(true);now+=101
    val current=ticket(store,run(started=now));old.finish(true)
    assertEquals("running",store.read(JSONObject().put("key","once"))!!.getString("state"));current.finish(false)
    assertEquals("failed",store.read(JSONObject().put("key","once"))!!.getString("state"));now+=101
    rejected{store.begin(run())};assertNull(store.read(JSONObject().put("key","once")))
  }
}
