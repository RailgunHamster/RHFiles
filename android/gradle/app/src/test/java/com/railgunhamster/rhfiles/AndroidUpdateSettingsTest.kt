package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject

class AndroidUpdateSettingsTest {
  private fun base(source:String)=JSONObject().put("source",source).put("github",DEFAULT_GITHUB).put("autoCheck",false).put("proxyEnabled",false).put("proxy","")
  @Test fun retiredGiteeAndFamilyBackupsMigrateWithoutEnablingChecksOrRestoringAddresses(){
    for(source in listOf("gitee","family")){
      val normalized=AndroidUpdateSettings.normalize(base(source).put("gitee","https://gitee.com/old/repo").put("family","\\\\old-server\\updates").put("connectionId","old-id"),true)
      assertEquals("cnb",normalized.getString("source"));assertEquals(DEFAULT_CNB,normalized.getString("cnb"));assertFalse(normalized.getBoolean("autoCheck"))
      for(key in listOf("family","connectionId","gitee"))assertFalse(normalized.has(key))
    }
  }
  @Test fun explicitGithubAndCustomCnbLocationsSurviveRoundTrip(){
    val github=AndroidUpdateSettings.normalize(base("github"));assertEquals("github",github.getString("source"))
    val cnb=AndroidUpdateSettings.normalize(base("cnb").put("cnb","https://cnb.cool/example/sub/RHFiles"));assertEquals("https://cnb.cool/example/sub/RHFiles",cnb.getString("cnb"))
    assertEquals(cnb.toString(),AndroidUpdateSettings.normalize(cnb).toString())
  }
  @Test fun retiredSourceCannotBeSavedAndUnknownFieldsOrInlineCredentialsAreRejected(){
    for(value in listOf(base("family"),base("gitee"),base("cnb").put("smbPassword","not-allowed"),base("cnb").put("token","not-allowed"))){try{AndroidUpdateSettings.normalize(value);fail()}catch(_:IllegalArgumentException){}}
  }
}
