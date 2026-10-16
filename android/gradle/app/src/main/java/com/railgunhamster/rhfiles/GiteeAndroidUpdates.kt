package com.railgunhamster.rhfiles

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONArray
import org.json.JSONObject

/** Public Gitee v5 releases contain named attachments alongside generated
 * source archives. Never use latest/tag text to compare Android versions. */
internal object GiteeAndroidUpdates {
  fun select(repository:String,abis:List<String>,sdk:Int,installed:Long,fetch:(String)->String):AndroidRelease? {
    var found=false
    var best:AndroidRelease?=null
    fun location(asset:JSONObject):String {
      val url=asset.getString("browser_download_url").toHttpUrl()
      require(url.isHttps && url.host=="gitee.com" && url.port==443 && url.username.isEmpty() && url.password.isEmpty() && url.query==null && url.fragment==null && url.encodedPath.startsWith("/$repository/releases/download/")) { "Gitee 更新资源地址无效" }
      return url.toString()
    }
    for(page in 1..5) {
      val releases=JSONArray(fetch("https://gitee.com/api/v5/repos/$repository/releases?per_page=100&page=$page"))
      require(releases.length()<=100) { "Gitee 发行列表过大" }
      for(i in 0 until releases.length()) {
        val release=releases.getJSONObject(i)
        if(release.optBoolean("draft") || release.optBoolean("prerelease"))continue
        val assets=release.getJSONArray("assets")
        require(assets.length()<=200) { "Gitee 发行附件过多" }
        val byName=mutableMapOf<String,JSONObject>()
        for(j in 0 until assets.length()) {
          val asset=assets.getJSONObject(j);val name=asset.getString("name")
          require(byName.put(name,asset)==null) { "Gitee 发行存在重名附件，无法安全选择更新包" }
        }
        val feed=byName[UPDATE_FEED] ?: continue
        found=true
        val candidate=AndroidUpdateFeed.select(fetch(location(feed)),abis,sdk,installed) { name ->
          location(byName[name] ?: error("Gitee 发行中缺少 $name"))
        } ?: continue
        val previous=best
        if(previous!=null && candidate.code==previous.code) {
          require(candidate.version==previous.version && candidate.abi==previous.abi && candidate.size==previous.size && candidate.sha256==previous.sha256 && candidate.fileName==previous.fileName) { "Gitee 同一 Android 版本存在不一致的更新包；已拒绝安装" }
        }
        if(previous==null || candidate.code>previous.code)best=candidate
      }
      if(releases.length()<100) {
        require(found) { "Gitee 正式发行中没有 Android 更新清单；请检查仓库或改用其他更新源" }
        return best
      }
    }
    error("Gitee 发行超过 500 条，未能完整核对 Android 最新版本；请改用其他更新源")
  }
}
