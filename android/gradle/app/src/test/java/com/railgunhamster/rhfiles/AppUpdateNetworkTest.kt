package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.MockResponse
import org.json.JSONObject

@RunWith(RobolectricTestRunner::class)
@Config(manifest=Config.NONE,sdk=[28])
class AppUpdateNetworkTest {
  private fun updater(server:MockWebServer?=null):AppUpdates {
    val context=RuntimeEnvironment.getApplication()
    context.getSharedPreferences("updates-v1",0).edit().clear().commit()
    if(server==null)return AppUpdates(context)
    // Only the test's injected transport maps a validated public CNB URL to
    // loopback. The ordinary HTTP request/response/cancel code still executes.
    lateinit var result:AppUpdates
    result=AppUpdates(context){config,url->
      assertEquals("https://cnb.cool/railgunhamster/RHFiles/-/releases/latest/download/$UPDATE_FEED",url)
      result.request(config,server.url("/updates/$UPDATE_FEED").toString(),true).use{it.body!!.string()}
    }
    return result
  }
  private fun latestFeed(u:AppUpdates)=JSONObject().put("schemaVersion",1).put("packageId",APP_PACKAGE).put("releases",org.json.JSONArray().put(JSONObject().put("version","0.0.0").put("versionCode",u.status().getLong("currentCode")))).toString()
  private fun await(u:AppUpdates):JSONObject {val end=System.currentTimeMillis()+10000;while(System.currentTimeMillis()<end){val s=u.status();if(s.getString("state")!="checking")return s;Thread.sleep(10)};error("Check did not finish")}
  @Test fun newInstallDefaultsToCnbAndExplicitGithubChoiceIsPreserved(){val u=updater();assertEquals("cnb",u.config().getString("source"));assertEquals(DEFAULT_CNB,u.config().getString("cnb"));u.save(u.config().put("source","github"));assertEquals("github",u.config().getString("source"));try{u.save(u.config().put("source","family"));fail()}catch(_:IllegalArgumentException){};assertEquals("github",u.config().getString("source"));assertFalse(u.config().has("family"))}
  @Test fun legacyFamilyBackupCanBeRestoredWithoutRevivingItsAddress(){val u=updater();val legacy=u.config().put("source","family").put("family","\\\\old-server\\updates").put("connectionId","retired").put("autoCheck",false);legacy.remove("cnb");u.validateBackup(legacy);u.save(AndroidUpdateSettings.normalize(legacy,true));assertEquals(DEFAULT_CNB,u.config().getString("cnb"));assertEquals("cnb",u.config().getString("source"));assertFalse(u.config().getBoolean("autoCheck"));assertFalse(u.config().has("connectionId"))}
  @Test fun cnbSettingsAreValidatedAndCoveredByBackup(){val u=updater();val config=u.config().put("cnb","https://cnb.cool/example/sub/custom");u.save(config);u.validateBackup(config);assertEquals(config.getString("cnb"),u.config().getString("cnb"));try{u.save(config.put("cnb","https://cnb.cool/a/b?access_token=secret"));fail()}catch(_:IllegalArgumentException){};assertEquals("https://cnb.cool/example/sub/custom",u.config().getString("cnb"))}
  @Test fun disabledAutomaticCheckNeverTouchesNetworkButManualCheckWorks() {
    MockWebServer().use {server->server.start();val u=updater(server);val config=u.config().put("autoCheck",false);u.save(config)
      for(reason in listOf("startup","settings","hour"))assertEquals("idle",u.check(false,reason).getString("state"))
      assertEquals(0,server.requestCount)
      server.enqueue(MockResponse().setBody(latestFeed(u)))
      u.check(true,"manual");assertEquals("latest",await(u).getString("state"));assertEquals("/updates/$UPDATE_FEED",server.takeRequest().path)
    }
  }
  @Test fun missingFeedAndInvalidJsonAreErrorsNotLatestVersion() {
    MockWebServer().use {server->server.start();val u=updater(server);u.save(u.config())
      server.enqueue(MockResponse().setResponseCode(404));u.check(true,"manual");val missing=await(u);assertEquals("failed",missing.getString("state"));assertTrue(missing.getString("message").contains("404"))
      server.enqueue(MockResponse().setBody("<html>login required</html>"));u.check(true,"manual");assertEquals("failed",await(u).getString("state"))
    }
  }
  private fun ready(u:AppUpdates){for((key,value)in listOf("state" to "ready","available" to AndroidRelease("0.1.21",1021,"","arm64-v8a","update.apk",1,"a".repeat(64),"fixture"))){val field=AppUpdates::class.java.getDeclaredField(key);field.isAccessible=true;field.set(u,value)}}
  @Test fun downloadedUpdateCanBeManuallyRecheckedInsteadOfBeingPermanentlyLockedReady(){MockWebServer().use{server->server.start();val u=updater(server);u.save(u.config());ready(u);assertEquals("ready",u.check(false,"hour").getString("state"));assertEquals(0,server.requestCount);server.enqueue(MockResponse().setBody(latestFeed(u)));u.check(true,"manual");assertEquals("latest",await(u).getString("state"));assertEquals(1,server.requestCount)}}
  @Test fun cancelReadyClearsReceiptButDoesNotInvalidateAnInstallerSnapshot(){val u=updater();ready(u);val directory=java.io.File(RuntimeEnvironment.getApplication().filesDir,"updates");java.io.File(directory,"ready.json").writeText("fixture");java.io.File(directory,"update.apk").writeText("download");val snapshot=java.io.File(directory,"installers/owned-fixture.apk").apply{parentFile!!.mkdirs();writeText("already handed to installer")};assertEquals("canceled",u.cancel().getString("state"));assertFalse(java.io.File(directory,"ready.json").exists());assertFalse(java.io.File(directory,"update.apk").exists());assertEquals("already handed to installer",snapshot.readText())}
  @Test fun installationFailureIsRecordedInsteadOfLeavingAMisleadingReadyState(){val u=updater();ready(u);u.installationFailed(IllegalArgumentException("APK 版本不匹配：更新清单 0.1.21 (1021)，APK 0.1.20 (1020)"));val s=u.status();assertEquals("failed",s.getString("state"));assertTrue(s.getString("message").contains("1021"));assertTrue(s.getString("message").contains("1020"));assertEquals(1021,s.getJSONObject("release").getInt("versionCode"))}
  @Test fun sourceChangesCannotRaceAnInFlightCheck() {
    MockWebServer().use {server->server.start();val u=updater(server);val config=u.config();u.save(config)
      server.enqueue(MockResponse().setBody(latestFeed(u)).setBodyDelay(1,java.util.concurrent.TimeUnit.SECONDS))
      u.check(true,"manual");try{u.save(config.put("source","github"));fail("Configuration race accepted")}catch(_:IllegalArgumentException){}
      assertEquals("latest",await(u).getString("state"))
    }
  }
  @Test fun publicSourceDnsAndTimeoutErrorsNeverSuggestSmbCredentials(){
    for(source in listOf("cnb","gitee","github")){
      val dns=updateFailure(java.net.UnknownHostException("cnb.cool"),source);assertTrue(dns.contains("DNS"));assertFalse(dns.contains("家庭 Wi-Fi"))
      val timeout=updateFailure(java.net.SocketTimeoutException("fixture"),source);assertTrue(timeout.contains("HTTP 代理"));assertFalse(timeout.contains("SMB 端口"))
    }
  }
}
