package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject
import org.json.JSONArray
import java.io.ByteArrayInputStream
import java.nio.file.Files
import java.security.MessageDigest

class AppUpdatesTest {
  private val content="APK 测试内容".toByteArray()
  private val sha=MessageDigest.getInstance("SHA-256").digest(content).joinToString(""){"%02x".format(it)}
  private fun asset(abi:String="arm64-v8a")=JSONObject().put("abi",abi).put("fileName","RHFiles-Android-0.1.4-$abi.apk").put("size",content.size).put("sha256",sha)
  private fun release(code:Long=1004,minSdk:Int=24,assets:JSONArray=JSONArray().put(asset()))=JSONObject().put("version","0.1.4").put("versionCode",code).put("minSdk",minSdk).put("notes","第一行\n第二行").put("assets",assets)
  private fun feed(releases:JSONArray=JSONArray().put(release()))=JSONObject().put("schemaVersion",1).put("packageId",APP_PACKAGE).put("releases",releases)
  private fun select(doc:JSONObject=feed(),abis:List<String> = listOf("arm64-v8a"),sdk:Int=36,installed:Long=1003)=AndroidUpdateFeed.select(doc.toString(),abis,sdk,installed){"https://example.test/$it"}
  private fun rejects(block:()->Unit){try{block();fail("Invalid update accepted")}catch(_:IllegalArgumentException){}}
  @Test fun choosesHighestAndroidVersionCodeNotFeedOrder(){assertEquals(1009L,select(feed(JSONArray().put(release(1009)).put(release(1004))))!!.code)}
  @Test fun resolvesOnlySelectedAssetNotMissingHistoricalAttachments(){val old=release(1004);old.getJSONArray("assets").getJSONObject(0).put("fileName","old.apk");val calls=mutableListOf<String>();val r=AndroidUpdateFeed.select(feed(JSONArray().put(old).put(release(1005))).toString(),listOf("arm64-v8a"),36,1003){name->calls.add(name);require(name!="old.apk");"https://example.test/$name"};assertEquals(1005L,r!!.code);assertEquals(listOf("RHFiles-Android-0.1.4-arm64-v8a.apk"),calls)}
  @Test fun skipsAlreadyInstalledAndDowngrade(){assertNull(select(feed(JSONArray().put(release(1003)).put(release(999)))))}
  @Test fun filtersMinimumSdkAndCpu(){assertNull(select(feed(JSONArray().put(release(1004,37)))));assertNull(select(abis=listOf("x86_64")))}
  @Test fun prefersDeviceAbiBeforeUniversal(){val r=select(feed(JSONArray().put(release(assets=JSONArray().put(asset("universal")).put(asset("arm64-v8a"))))));assertEquals("arm64-v8a",r!!.abi)}
  @Test fun fallsBackToUniversal(){assertEquals("universal",select(feed(JSONArray().put(release(assets=JSONArray().put(asset("universal"))))))!!.abi)}
  @Test fun preservesMultilineReleaseNotes(){assertEquals("第一行\n第二行",select()!!.notes)}
  @Test fun rejectsWindowsOrOtherPackageFeeds(){rejects{select(feed().put("packageId","com.other.app"))};rejects{select(feed().put("schemaVersion",2))}}
  @Test fun rejectsPathTraversalAndNonApks(){for(name in listOf("../evil.apk","x/y.apk","x\\y.apk","C:evil.apk","x\u0000.apk","installer.exe")){val r=release();r.getJSONArray("assets").getJSONObject(0).put("fileName",name);rejects{select(feed(JSONArray().put(r)))}}}
  @Test fun rejectsMissingDigestAndInvalidSize(){for(field in listOf("size","sha256")){val r=release();r.getJSONArray("assets").getJSONObject(0).put(field,if(field=="size")-1 else "bad");rejects{select(feed(JSONArray().put(r)))}}}
  @Test fun githubAcceptsOnlyHttpsRepository(){assertEquals("RailgunHamster/RHFiles",AndroidUpdateFeed.githubRepository("https://github.com/RailgunHamster/RHFiles.git/"));for(url in listOf("http://github.com/a/b","https://evil.test/a/b","https://github.com/a/b/releases","https://user:pass@github.com/a/b"))rejects{AndroidUpdateFeed.githubRepository(url)}}
  @Test fun uncPreservesShareAndUnicodePaths(){val p=RemoteStorage.parseUnc("\\\\SERVER-HOME\\Public\\Software\\中文目录\\");assertEquals("SERVER-HOME",p.host);assertEquals("Public",p.share);assertEquals(listOf("Software","中文目录"),p.parts)}
  @Test fun uncRejectsMissingShareTraversalAndCredentials(){for(path in listOf("\\SERVER-HOME\\Public","\\\\SERVER-HOME","\\\\SERVER-HOME\\Public\\..","smb://user:password@server/share","\\\\server\\share\\a\\\\b"))rejects{RemoteStorage.parseUnc(path)}}
  @Test fun streamingCopyReportsIntermediateProgressAndChecksDigest(){val dir=Files.createTempDirectory("update-test").toFile();try{val file=java.io.File(dir,"download.part");val progress=mutableListOf<Long>();AndroidUpdateFeed.copy(ByteArrayInputStream(content),file,select()!!,{false}){progress.add(it)};assertArrayEquals(content,file.readBytes());assertEquals(content.size.toLong(),progress.last())}finally{dir.deleteRecursively()}}
  @Test fun truncatedOverlongAndCorruptDownloadsNeverLeaveApk(){val dir=Files.createTempDirectory("update-test").toFile();try{for(data in listOf(content.copyOf(content.size-1),content+byteArrayOf(1),ByteArray(content.size))){val file=java.io.File(dir,"download.part");rejects{AndroidUpdateFeed.copy(ByteArrayInputStream(data),file,select()!!,{false}){}};assertFalse(file.exists())}}finally{dir.deleteRecursively()}}
  @Test fun canceledDownloadNeverLeavesApk(){val dir=Files.createTempDirectory("update-test").toFile();try{val file=java.io.File(dir,"download.part");try{AndroidUpdateFeed.copy(ByteArrayInputStream(content),file,select()!!,{true}){};fail("Cancellation ignored")}catch(_:IllegalStateException){};assertFalse(file.exists())}finally{dir.deleteRecursively()}}
}
