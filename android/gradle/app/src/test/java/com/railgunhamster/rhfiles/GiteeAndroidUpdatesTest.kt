package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONArray
import org.json.JSONObject

class GiteeAndroidUpdatesTest {
  private val repository="railgunhamster/RHFiles"
  private val requested=mutableListOf<String>()
  private fun item(code:Long,abi:String="arm64-v8a",sdk:Int=24)=JSONObject().put("version","0.1.${code-1000}").put("versionCode",code).put("minSdk",sdk).put("assets",JSONArray().put(JSONObject().put("abi",abi).put("fileName","RHFiles-Android-0.1.${code-1000}-$abi.apk").put("size",123).put("sha256","a".repeat(64))))
  private fun choose(items:JSONArray,installed:Long=1009):AndroidRelease? {
    val doc=JSONObject().put("schemaVersion",1).put("packageId",APP_PACKAGE).put("releases",items)
    return GiteeAndroidUpdates.select(repository,listOf("arm64-v8a"),36,installed){url->requested.add(url);assertEquals("https://gitee.com/$repository/releases/download/latest/$UPDATE_FEED",url);assertFalse(url.contains("/api/"));doc.toString()}
  }
  private fun rejected(block:()->Unit){try{block();fail("Unsafe Gitee result accepted")}catch(_:IllegalArgumentException){}}
  @Test fun requiresCanonicalHttpsRepositoryWithoutCredentialsOrQuery(){
    assertEquals(repository,AndroidUpdateFeed.giteeRepository("$DEFAULT_GITEE.git/"))
    for(url in listOf("http://gitee.com/a/b","https://github.com/a/b","https://gitee.com/a/b/releases","https://u:p@gitee.com/a/b","https://gitee.com/a/b?access_token=secret","https://gitee.com:8443/a/b","https://gitee.com/a/.git"))rejected{AndroidUpdateFeed.giteeRepository(url)}
  }
  @Test fun readsOnePublicIndexWithoutAnyApiAndSelectsHighestNumericCode(){
    val r=choose(JSONArray().put(item(1011)).put(item(1019)).put(item(1013)))!!
    assertEquals(1019L,r.code);assertEquals(1,requested.size);assertEquals("https://gitee.com/$repository/releases/download/android-v0.1.19/${r.fileName}",r.location)
  }
  @Test fun installedAndIncompatibleEntriesNeedNoHistoricalRequests(){assertNull(choose(JSONArray().put(item(1009)).put(item(1020,abi="x86_64")).put(item(1021,sdk=37)))) ;assertEquals(1,requested.size)}
  @Test fun previewAndDraftEntriesCannotBecomeStableUpdates(){assertEquals(1019L,choose(JSONArray().put(item(1019)).put(item(1020).put("prerelease",true)).put(item(1021).put("draft",true)))!!.code)}
  @Test fun oldFeedsDeriveVersionTagAndCustomTagsAreExplicit(){assertTrue(choose(JSONArray().put(item(1019)))!!.location.contains("/android-v0.1.19/"));assertTrue(choose(JSONArray().put(item(1020).put("giteeTag","phone-2026.10")))!!.location.contains("/phone-2026.10/"))}
  @Test fun movingLatestAliasIsNeverUsedForApkDownloads(){val result=choose(JSONArray().put(item(1019)))!!;assertFalse(result.location.contains("/latest/"));assertTrue(result.location.contains("/android-v0.1.19/"))}
  @Test fun unsafeAndMutableTagsCannotRedirectDownloads(){for(tag in listOf("latest","..","../other","https://evil.test/","x?token=secret","%2e%2e","a#fragment","u:p"))rejected{choose(JSONArray().put(item(1019).put("giteeTag",tag)))}}
  @Test fun duplicateCodesMissingHashesWrongPackageAndMalformedFeedsNeverReportLatest(){
    rejected{choose(JSONArray().put(item(1019)).put(item(1019)))}
    val bad=item(1019);bad.getJSONArray("assets").getJSONObject(0).put("sha256","");rejected{choose(JSONArray().put(bad))}
    for(text in listOf("<html>login</html>","{\"schemaVersion\":1,\"packageId\":\"other\",\"releases\":[]}"))try{GiteeAndroidUpdates.select(repository,listOf("arm64-v8a"),36,1000){text};fail()}catch(_:Exception){}
  }
  @Test fun networkFailuresAnd403AreErrorsNotLatest(){
    try{GiteeAndroidUpdates.select(repository,listOf("arm64-v8a"),36,1019){throw IllegalStateException("HTTP 403")};fail()}catch(e:IllegalStateException){assertTrue(e.message!!.contains("403"))}
    val message=updateFailure(IllegalStateException("读取更新清单失败：gitee.com 返回 HTTP 403"),"gitee");assertTrue(message.contains("限流"));assertTrue(message.contains("不需要填写发布令牌"));assertFalse(message.contains("SMB 登录"))
  }
}
