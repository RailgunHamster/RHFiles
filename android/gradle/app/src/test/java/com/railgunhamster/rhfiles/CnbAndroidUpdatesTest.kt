package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONArray
import org.json.JSONObject

class CnbAndroidUpdatesTest {
  private val repo="example/sub/RHFiles"
  private fun item(code:Long,abi:String="arm64-v8a",sdk:Int=24)=JSONObject().put("version","0.1.${code-1000}").put("versionCode",code).put("minSdk",sdk).put("assets",JSONArray().put(JSONObject().put("abi",abi).put("fileName","RHFiles-Android-0.1.${code-1000}-$abi.apk").put("size",123).put("sha256","a".repeat(64))))
  private fun choose(items:JSONArray,installed:Long=1000):AndroidRelease? {
    val doc=JSONObject().put("schemaVersion",1).put("packageId",APP_PACKAGE).put("releases",items)
    var requests=0
    val result=CnbAndroidUpdates.select(repo,listOf("arm64-v8a"),36,installed){url->requests++;assertEquals("https://cnb.cool/$repo/-/releases/latest/download/$UPDATE_FEED",url);assertFalse(url.contains("api.cnb.cool"));doc.toString()}
    assertEquals(1,requests);return result
  }
  private fun rejected(block:()->Unit){try{block();fail("Unsafe CNB input accepted")}catch(_:IllegalArgumentException){}}
  @Test fun canonicalRepositorySupportsNestedGroupsButRejectsRoutesCredentialsAndTraversal(){
    assertEquals(repo,CnbAndroidUpdates.repository("https://cnb.cool/$repo.git/"))
    for(url in listOf("http://cnb.cool/a/b","https://github.com/a/b","https://user:secret@cnb.cool/a/b","https://cnb.cool/a/b?token=secret","https://cnb.cool/a/b#fragment","https://cnb.cool:8443/a/b","https://cnb.cool/a/b/-/releases","https://cnb.cool/a/../b","https://cnb.cool/a/%2e/b","https://cnb.cool/a//b","https://cnb.cool/a/.git"))rejected{CnbAndroidUpdates.repository(url)}
  }
  @Test fun highestCompatibleCodeUsesPinnedPayloadNotLatest(){val r=choose(JSONArray().put(item(1030)).put(item(1039)).put(item(1040,"x86_64")))!!;assertEquals(1039L,r.code);assertEquals("https://cnb.cool/$repo/-/releases/download/android-v0.1.39/${r.fileName}",r.location)}
  @Test fun installedDraftAndPreviewEntriesCannotBecomeUpdates(){assertNull(choose(JSONArray().put(item(1039)).put(item(1040).put("draft",true)).put(item(1041).put("prerelease",true)),1039))}
  @Test fun providerNeutralAndExplicitCnbTagsAreSupportedWithoutUsingLegacyGiteeTag(){
    assertTrue(choose(JSONArray().put(item(1039).put("releaseTag","android-v0.1.39")))!!.location.contains("/android-v0.1.39/"))
    assertTrue(choose(JSONArray().put(item(1039).put("cnbTag","phone-39").put("giteeTag","wrong-legacy-tag")))!!.location.contains("/phone-39/"))
  }
  @Test fun unsafeOrMutableTagsCannotBecomePayloadAddresses(){for(tag in listOf("latest","..","../other","a/b","https://evil.test/","a?token=secret","%2e%2e","u:p"))rejected{choose(JSONArray().put(item(1039).put("cnbTag",tag)))}}
  @Test fun emptyOrDuplicateIndexCannotPretendToBeLatest(){rejected{choose(JSONArray())};rejected{choose(JSONArray().put(item(1039)).put(item(1039)))}}
  @Test fun transient403IsAnErrorNotLatest(){try{CnbAndroidUpdates.select(repo,listOf("arm64-v8a"),36,1000){throw IllegalStateException("HTTP 403")};fail()}catch(e:IllegalStateException){assertEquals("HTTP 403",e.message)}}
}
