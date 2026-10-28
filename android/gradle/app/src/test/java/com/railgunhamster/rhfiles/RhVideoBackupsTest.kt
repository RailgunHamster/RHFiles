package com.railgunhamster.rhfiles
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
@RunWith(RobolectricTestRunner::class) @Config(sdk=[28])
class RhVideoBackupsTest {
  private fun sample()=JSONObject("""{"format":"RHVideo.config-backup","version":1,"created_at":"2026-10-28T00:00:00Z","favorites":[],"watch_folders":[],"reading_progress":[],"ui_preferences":{"page_volume":"0.2"}}""")
  private fun preview()=JSONObject("""{"applied":false,"favorites":{"total":0,"add":0,"existing":0,"unmatched":0},"watch_folders":{"total":0,"add":0,"existing":0,"skipped":0},"reading_progress":{"total":0,"update":0,"kept":0,"unmatched":0},"preferences":1,"issues":[]}""")
  @Test fun onlyVersionedMetadataAndReferencePreferenceNamesAreAllowed(){
    RhVideoBackups.document(sample());for((key,value)in listOf("password" to "never","version" to 2,"favorites" to JSONObject()))try{RhVideoBackups.document(sample().put(key,value));fail(key)}catch(_:IllegalArgumentException){}
    try{RhVideoBackups.preferences(JSONObject().put("token","never"));fail("Token exported")}catch(_:IllegalArgumentException){}
  }
  @Test fun ticketsAreScopedReplacedAndConsumedOnce(){
    val store=RhVideoBackups{1000};val first=store.stage(3,sample(),preview()).getString("ticket")
    try{store.consume(4,first);fail("Old account ticket accepted")}catch(_:IllegalStateException){}
    val next=store.stage(3,sample(),preview()).getString("ticket");try{store.consume(3,first);fail("Replaced ticket accepted")}catch(_:IllegalStateException){}
    assertEquals("RHVideo.config-backup",store.consume(3,next).getString("format"));try{store.consume(3,next);fail("Restore replayed")}catch(_:IllegalStateException){}
  }
  @Test fun expiredAndExplicitlyClearedPreviewsCannotRestore(){
    var time=1000L;val store=RhVideoBackups{time};val ticket=store.stage(3,sample(),preview()).getString("ticket");time+=300000
    try{store.consume(3,ticket);fail("Expired preview accepted")}catch(_:IllegalStateException){}
    val fresh=store.stage(3,sample(),preview()).getString("ticket");store.clear();try{store.consume(3,fresh);fail("Logout retained preview")}catch(_:IllegalStateException){}
  }
}
