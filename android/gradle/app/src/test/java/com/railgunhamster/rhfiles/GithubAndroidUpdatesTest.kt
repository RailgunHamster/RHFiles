package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONArray
import org.json.JSONObject

class GithubAndroidUpdatesTest {
  private val repository="RailgunHamster/RHFiles"
  private val base="https://github.com/$repository/releases/download/"
  private fun page(number:Int=1)="https://api.github.com/repos/$repository/releases?per_page=100&page=$number"
  private val documents=mutableMapOf<String,String>()
  private val requested=mutableListOf<String>()
  private fun fetch(url:String):String {requested.add(url);return documents[url] ?: error("Unexpected request: $url")}
  private fun android(code:Long, tag:String="android-v0.1.${code-1000}", abi:String="arm64-v8a", minSdk:Int=24, digest:String="a".repeat(64)):JSONObject {
    val name="RHFiles-Android-0.1.${code-1000}-$abi.apk"
    val item=JSONObject().put("version","0.1.${code-1000}").put("versionCode",code).put("minSdk",minSdk).put("assets",JSONArray().put(
      JSONObject().put("abi",abi).put("fileName",name).put("size",123).put("sha256",digest)))
    documents["$base$tag/$UPDATE_FEED"]=JSONObject().put("schemaVersion",1).put("packageId",APP_PACKAGE).put("releases",JSONArray().put(item)).toString()
    return JSONObject().put("tag_name",tag).put("assets",JSONArray()
      .put(JSONObject().put("name",UPDATE_FEED).put("browser_download_url","$base$tag/$UPDATE_FEED"))
      .put(JSONObject().put("name",name).put("browser_download_url","$base$tag/$name")))
  }
  private fun windows()=JSONObject().put("tag_name","v9.0.0").put("assets",JSONArray().put(JSONObject().put("name","releases.win.json")))
  private fun choose(items:JSONArray,installed:Long=1009):AndroidRelease? {
    documents[page()]=items.toString()
    return AndroidUpdateFeed.github(repository,listOf("arm64-v8a"),36,installed,::fetch)
  }
  private fun rejected(block:()->Unit) {try{block();fail("Invalid or incomplete GitHub check reported success")}catch(_:IllegalArgumentException){}}

  @Test fun installedFirstFeedDoesNotHideLaterUpgrade() {
    val selected=choose(JSONArray().put(windows()).put(android(1009)).put(android(1010)))!!
    assertEquals(1010L,selected.code)
    assertTrue(selected.location.contains("/android-v0.1.10/"))
    assertTrue(requested.contains("${base}android-v0.1.10/$UPDATE_FEED"))
  }
  @Test fun choosesHighestVersionCodeNotTagOrReleaseOrder() {
    assertEquals(1011L,choose(JSONArray().put(android(1010)).put(android(1005,"android-v99.0.0")).put(android(1011)))!!.code)
  }
  @Test fun ignoresWindowsDraftsAndPrereleases() {
    val draft=android(1012).put("draft",true)
    val preview=android(1013).put("prerelease",true)
    assertEquals(1010L,choose(JSONArray().put(windows()).put(draft).put(preview).put(android(1010)))!!.code)
    assertFalse(requested.any{it.contains("android-v0.1.12")||it.contains("android-v0.1.13")})
  }
  @Test fun incompatibleNewestDoesNotHideCompatibleUpgrade() {
    assertEquals(1010L,choose(JSONArray().put(android(1012,minSdk=37)).put(android(1011,abi="x86_64")).put(android(1010)))!!.code)
  }
  @Test fun scansAnotherPageEvenIfFirstPageHasAnInstalledAndroidFeed() {
    val first=JSONArray().put(android(1009))
    repeat(99){first.put(windows())}
    documents[page(2)]=JSONArray().put(android(1010)).toString()
    assertEquals(1010L,choose(first)!!.code)
    assertTrue(requested.contains(page(2)))
  }
  @Test fun windowsCompatibilityMirrorAndAndroidReleaseMayRepeatSamePackage() {
    val selected=choose(JSONArray().put(android(1011,"v0.1.72")).put(android(1009)).put(android(1011)))!!
    assertEquals(1011L,selected.code)
    assertTrue(selected.location.contains("/v0.1.72/"))
  }
  @Test fun repeatedVersionWithDifferentBytesIsRejected() {
    rejected{choose(JSONArray().put(android(1010,"v0.1.72")).put(android(1010,digest="b".repeat(64))))}
  }
  @Test fun latestRequiresAllFeedsToBeChecked() {
    assertNull(choose(JSONArray().put(android(1008)).put(android(1009))))
    assertEquals(3,requested.size)
  }
  @Test fun brokenLaterFeedCannotReportLatest() {
    val items=JSONArray().put(android(1009)).put(android(1010))
    documents["${base}android-v0.1.10/$UPDATE_FEED"]="not JSON"
    try{choose(items);fail("Broken later feed was ignored")}catch(_:org.json.JSONException){}
  }
  @Test fun missingSelectedApkAndForeignAssetUrlAreRejected() {
    val missing=android(1010);missing.getJSONArray("assets").remove(1)
    try{choose(JSONArray().put(missing));fail("Missing APK accepted")}catch(_:IllegalStateException){}
    val foreign=android(1011);foreign.getJSONArray("assets").getJSONObject(0).put("browser_download_url","https://evil.test/feed.json")
    rejected{choose(JSONArray().put(foreign))}
    assertFalse(requested.any{it.contains("evil.test")})
  }
  @Test fun noAndroidFeedsAndTruncatedCatalogAreErrorsNotLatest() {
    rejected{choose(JSONArray().put(windows()))}
    val full=JSONArray();repeat(100){full.put(windows())}
    for(number in 2..5)documents[page(number)]=full.toString()
    try{choose(full);fail("Incomplete catalog accepted")}catch(e:IllegalStateException){assertTrue(e.message!!.contains("500"))}
  }
}
