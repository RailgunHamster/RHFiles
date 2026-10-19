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
  private fun updater():AppUpdates {
    val context=RuntimeEnvironment.getApplication()
    context.getSharedPreferences("updates-v1",0).edit().clear().commit()
    val constructor=AppUpdates::class.java.getDeclaredConstructor(android.content.Context::class.java)
    constructor.isAccessible=true;return constructor.newInstance(context)
  }
  private fun await(u:AppUpdates):JSONObject {val end=System.currentTimeMillis()+10000;while(System.currentTimeMillis()<end){val s=u.status();if(s.getString("state")!="checking")return s;Thread.sleep(10)};error("Check did not finish")}
  @Test fun newInstallDefaultsToGiteeAndExistingExplicitChoiceIsPreserved(){val u=updater();assertEquals("gitee",u.config().getString("source"));assertEquals(DEFAULT_GITEE,u.config().getString("gitee"));u.save(u.config().put("source","github"));assertEquals("github",u.config().getString("source"));u.save(u.config().put("source","family"));assertEquals("family",u.config().getString("source"))}
  @Test fun legacyConfigurationWithoutGiteeFieldCanStillBeSavedAndRestored(){val u=updater();val legacy=u.config().put("source","github");legacy.remove("gitee");u.validateBackup(legacy);u.save(legacy);assertEquals(DEFAULT_GITEE,u.config().getString("gitee"));assertEquals("github",u.config().getString("source"))}
  @Test fun giteeSettingsAreValidatedAndCoveredByBackup(){val u=updater();val config=u.config().put("gitee","https://gitee.com/example/custom");u.save(config);u.validateBackup(config);assertEquals(config.getString("gitee"),u.config().getString("gitee"));try{u.save(config.put("gitee","https://gitee.com/a/b?access_token=secret"));fail()}catch(_:IllegalArgumentException){};assertEquals("https://gitee.com/example/custom",u.config().getString("gitee"))}
  @Test fun disabledAutomaticCheckNeverTouchesNetworkButManualCheckWorks() {
    MockWebServer().use {server->server.start();val u=updater();val config=u.config().put("source","family").put("family",server.url("/updates/")).put("autoCheck",false);u.save(config)
      for(reason in listOf("startup","settings","hour"))assertEquals("idle",u.check(false,reason).getString("state"))
      assertEquals(0,server.requestCount)
      server.enqueue(MockResponse().setBody("""{"schemaVersion":1,"packageId":"$APP_PACKAGE","releases":[]}"""))
      u.check(true,"manual");assertEquals("latest",await(u).getString("state"));assertEquals("/updates/$UPDATE_FEED",server.takeRequest().path)
    }
  }
  @Test fun missingFeedAndInvalidJsonAreErrorsNotLatestVersion() {
    MockWebServer().use {server->server.start();val u=updater();u.save(u.config().put("source","family").put("family",server.url("/updates/")))
      server.enqueue(MockResponse().setResponseCode(404));u.check(true,"manual");val missing=await(u);assertEquals("failed",missing.getString("state"));assertTrue(missing.getString("message").contains("404"))
      server.enqueue(MockResponse().setBody("<html>login required</html>"));u.check(true,"manual");assertEquals("failed",await(u).getString("state"))
    }
  }
  @Test fun sourceChangesCannotRaceAnInFlightCheck() {
    MockWebServer().use {server->server.start();val u=updater();val config=u.config().put("source","family").put("family",server.url("/updates/"));u.save(config)
      server.enqueue(MockResponse().setBody("""{"schemaVersion":1,"packageId":"$APP_PACKAGE","releases":[]}""").setBodyDelay(1,java.util.concurrent.TimeUnit.SECONDS))
      u.check(true,"manual");try{u.save(config.put("source","github"));fail("Configuration race accepted")}catch(_:IllegalArgumentException){}
      assertEquals("latest",await(u).getString("state"))
    }
  }
  @Test fun publicSourceDnsAndTimeoutErrorsNeverSuggestSmbCredentials(){
    for(source in listOf("gitee","github")){
      val dns=updateFailure(java.net.UnknownHostException("gitee.com"),source);assertTrue(dns.contains("DNS"));assertFalse(dns.contains("家庭 Wi-Fi"))
      val timeout=updateFailure(java.net.SocketTimeoutException("fixture"),source);assertTrue(timeout.contains("HTTP 代理"));assertFalse(timeout.contains("SMB 端口"))
    }
  }
}
