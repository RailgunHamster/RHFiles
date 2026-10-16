package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONArray
import org.json.JSONObject

class GiteeAndroidUpdatesTest {
  private val repository="railgunhamster/RHFiles"
  private val base="https://gitee.com/$repository/releases/download/"
  private val documents=mutableMapOf<String,String>()
  private val requested=mutableListOf<String>()
  private fun page(number:Int=1)="https://gitee.com/api/v5/repos/$repository/releases?per_page=100&page=$number"
  private fun fetch(url:String):String {requested.add(url);return documents[url] ?: error("Unexpected request: $url")}
  private fun release(code:Long,tag:String="android-v0.1.${code-1000}",abi:String="arm64-v8a",minSdk:Int=24,digest:String="a".repeat(64)):JSONObject {
    val name="RHFiles-Android-0.1.${code-1000}-$abi.apk"
    val item=JSONObject().put("version","0.1.${code-1000}").put("versionCode",code).put("minSdk",minSdk).put("assets",JSONArray().put(JSONObject().put("abi",abi).put("fileName",name).put("size",123).put("sha256",digest)))
    documents["$base$tag/$UPDATE_FEED"]=JSONObject().put("schemaVersion",1).put("packageId",APP_PACKAGE).put("releases",JSONArray().put(item)).toString()
    return JSONObject().put("tag_name",tag).put("assets",JSONArray()
      .put(JSONObject().put("name",UPDATE_FEED).put("browser_download_url","$base$tag/$UPDATE_FEED"))
      .put(JSONObject().put("name",name).put("browser_download_url","$base$tag/$name"))
      .put(JSONObject().put("name","$tag.zip").put("browser_download_url","https://gitee.com/$repository/archive/refs/tags/$tag.zip")))
  }
  private fun windows()=JSONObject().put("tag_name","v9.0.0").put("assets",JSONArray())
  private fun choose(items:JSONArray,installed:Long=1009):AndroidRelease? {documents[page()]=items.toString();return GiteeAndroidUpdates.select(repository,listOf("arm64-v8a"),36,installed,::fetch)}
  private fun rejected(block:()->Unit){try{block();fail("Unsafe Gitee result accepted")}catch(_:IllegalArgumentException){}}
  @Test fun requiresCanonicalHttpsRepositoryWithoutCredentialsOrQuery(){
    assertEquals(repository,AndroidUpdateFeed.giteeRepository("$DEFAULT_GITEE.git/"))
    for(url in listOf("http://gitee.com/a/b","https://github.com/a/b","https://gitee.com/a/b/releases","https://u:p@gitee.com/a/b","https://gitee.com/a/b?access_token=secret","https://gitee.com:8443/a/b","https://gitee.com/a/.git"))rejected{AndroidUpdateFeed.giteeRepository(url)}
  }
  @Test fun installedFirstDoesNotHideHigherAndroidVersionAndIgnoresSourceArchives(){assertEquals(1013L,choose(JSONArray().put(windows()).put(release(1009)).put(release(1013)).put(release(1011)))!!.code);assertFalse(requested.any{it.endsWith(".zip")})}
  @Test fun scansFollowingPages(){val items=JSONArray().put(release(1009));repeat(99){items.put(windows())};documents[page(2)]=JSONArray().put(release(1013)).toString();assertEquals(1013L,choose(items)!!.code);assertTrue(requested.contains(page(2)))}
  @Test fun skipsPreviewAndIncompatiblePackages(){assertEquals(1010L,choose(JSONArray().put(release(1014).put("prerelease",true)).put(release(1013,abi="x86_64")).put(release(1012,minSdk=37)).put(release(1010)))!!.code)}
  @Test fun samePackageMayAppearInTwoReleases(){assertEquals(1013L,choose(JSONArray().put(release(1013,"mirror")).put(release(1013)))!!.code)}
  @Test fun conflictingSameVersionCannotBeInstalled(){rejected{choose(JSONArray().put(release(1013,"mirror")).put(release(1013,digest="b".repeat(64))))}}
  @Test fun allCheckedInstalledFeedsAreLatest(){assertNull(choose(JSONArray().put(release(1008)).put(release(1009))));assertEquals(3,requested.size)}
  @Test fun missingFeedIsNotLatest(){rejected{choose(JSONArray().put(windows()))}}
  @Test fun brokenFeedAndNetworkFailureDoNotReportLatest(){val items=JSONArray().put(release(1009)).put(release(1013));documents["${base}android-v0.1.13/$UPDATE_FEED"]="<html>login</html>";try{choose(items);fail()}catch(_:org.json.JSONException){};documents.remove("${base}android-v0.1.13/$UPDATE_FEED");try{choose(items);fail()}catch(_:IllegalStateException){}}
  @Test fun missingApkAndDuplicateNamesAreRejected(){val missing=release(1013);missing.getJSONArray("assets").remove(1);try{choose(JSONArray().put(missing));fail()}catch(_:IllegalStateException){};val duplicate=release(1013);duplicate.getJSONArray("assets").put(duplicate.getJSONArray("assets").getJSONObject(0));rejected{choose(JSONArray().put(duplicate))}}
  @Test fun foreignInsecureCredentialAndTokenUrlsAreRejectedBeforeRequest(){for(url in listOf("https://evil.test/feed","http://gitee.com/$repository/releases/download/v/a","https://gitee.com/other/repo/releases/download/v/a","https://u:p@gitee.com/$repository/releases/download/v/a","https://gitee.com/$repository/releases/download/v/a?access_token=secret")){val item=release(1013);item.getJSONArray("assets").getJSONObject(0).put("browser_download_url",url);rejected{choose(JSONArray().put(item))};assertFalse(requested.contains(url))}}
  @Test fun truncatedCatalogIsError(){val items=JSONArray();repeat(100){items.put(windows())};for(p in 2..5)documents[page(p)]=items.toString();try{choose(items);fail()}catch(e:IllegalStateException){assertTrue(e.message!!.contains("500"))}}
  @Test fun publicSourceNetworkFailuresDoNotSuggestSmbCredentials(){for(source in listOf("gitee","github")){val dns=updateFailure(java.net.UnknownHostException("gitee.com"),source);assertTrue(dns.contains("DNS"));assertFalse(dns.contains("家庭 Wi-Fi"));val timeout=updateFailure(java.net.SocketTimeoutException("fixture"),source);assertTrue(timeout.contains("HTTP 代理"));assertFalse(timeout.contains("SMB 端口"))}}
}
