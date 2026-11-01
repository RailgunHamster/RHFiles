package com.railgunhamster.rhfiles

import org.json.JSONObject

internal const val DEFAULT_CNB="https://cnb.cool/railgunhamster/RHFiles"
internal const val DEFAULT_GITHUB="https://github.com/RailgunHamster/RHFiles"

/** One migration for live preferences and imported backups. Retired update
 * addresses are discarded, never turned into ordinary network connections. */
internal object AndroidUpdateSettings {
  fun normalize(value:JSONObject,allowRetired:Boolean=false):JSONObject {
    val allowed=setOf("source","cnb","github","proxy","autoCheck","proxyEnabled","sourceChoiceVersion")+
      if(allowRetired)setOf("gitee","family","connectionId")else emptySet()
    require(value.keys().asSequence().all{it in allowed}){"未知更新配置字段"}
    val old=value.getString("source")
    require(old in listOf("cnb","github")||(allowRetired&&old in listOf("gitee","family"))){"更新源无效"}
    val source=if(old=="github")"github"else"cnb"
    val cnb=value.optString("cnb",DEFAULT_CNB).trim().ifEmpty{DEFAULT_CNB}
    val github=value.optString("github",DEFAULT_GITHUB).trim().ifEmpty{DEFAULT_GITHUB}
    CnbAndroidUpdates.repository(cnb);AndroidUpdateFeed.githubRepository(github)
    require(value.get("autoCheck") is Boolean&&value.get("proxyEnabled") is Boolean){"更新开关无效"}
    return JSONObject().put("source",source).put("cnb",cnb).put("github",github)
      .put("autoCheck",value.getBoolean("autoCheck")).put("proxyEnabled",value.getBoolean("proxyEnabled"))
      .put("proxy",value.optString("proxy").trim()).put("sourceChoiceVersion",2)
  }
}
