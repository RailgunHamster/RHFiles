package com.railgunhamster.rhfiles

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONObject

/** Public download routes do not consume Gitee's anonymous v5 API quota.
 * Only the channel index is mutable; APK URLs always name an immutable tag. */
internal object GiteeAndroidUpdates {
  fun index(repository:String)="https://gitee.com/$repository/releases/download/latest/$UPDATE_FEED"
  fun select(repository:String,abis:List<String>,sdk:Int,installed:Long,fetch:(String)->String):AndroidRelease? {
    val text=fetch(index(repository))
    val selected=AndroidUpdateFeed.select(text,abis,sdk,installed){it}?:return null
    val entries=JSONObject(text).getJSONArray("releases")
    val matches=(0 until entries.length()).map{entries.getJSONObject(it)}.filter{it.optLong("versionCode")==selected.code}
    require(matches.size==1){"Gitee 更新清单中有重复的版本码，已拒绝安装"}
    val item=matches.single()
    val tag=if(item.has("giteeTag"))item.getString("giteeTag")else {
      require(selected.version.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+"))){"Gitee 更新清单缺少 giteeTag"}
      "android-v${selected.version}"
    }
    require(tag.length in 1..180&&tag !in listOf(".","..","latest")&&tag.matches(Regex("[A-Za-z0-9_.-]+"))){"Gitee 更新包标签无效，必须指定不可变的版本标签"}
    val location="https://gitee.com/$repository/releases/download/".toHttpUrl().newBuilder().addPathSegment(tag).addPathSegment(selected.fileName).build().toString()
    return selected.copy(location=location)
  }
}
