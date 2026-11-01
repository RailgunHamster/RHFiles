package com.railgunhamster.rhfiles

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONObject

/** CNB OpenAPI requires a token even for some public reads. App clients use
 * anonymous download routes only; no publishing credential enters the APK.
 * The channel pointer may move, but selected APKs always use a version tag. */
internal object CnbAndroidUpdates {
  fun repository(value:String):String {
    val raw=value.trim().trimEnd('/')
    require(!raw.contains('%')&&raw.split('/').none{it in listOf(".","..")}){"CNB 仓库地址无效"}
    val url=raw.toHttpUrl()
    require(url.isHttps&&url.host=="cnb.cool"&&url.port==443&&url.username.isEmpty()&&url.password.isEmpty()&&url.query==null&&url.fragment==null){"请填写 https://cnb.cool/组织/仓库，不要包含账号、令牌或查询参数"}
    val parts=url.pathSegments.toMutableList()
    require(parts.size in 2..10&&parts.all{it.matches(Regex("[A-Za-z0-9_.-]+"))&&it !in listOf(".","..","-")}){"请填写 CNB 仓库地址，支持多级组织；不要填写发行页或安装包地址"}
    parts[parts.lastIndex]=parts.last().removeSuffix(".git")
    require(parts.last().isNotEmpty()&&parts.last() !in listOf(".","..","-")){"CNB 仓库名称无效"}
    return parts.joinToString("/")
  }
  fun index(repository:String)="https://cnb.cool/$repository/-/releases/latest/download/$UPDATE_FEED"
  fun select(repository:String,abis:List<String>,sdk:Int,installed:Long,fetch:(String)->String):AndroidRelease? {
    val text=fetch(index(repository))
    val entries=JSONObject(text).getJSONArray("releases")
    require(entries.length() in 1..500){"CNB 没有有效 Android 更新条目，不能确认是否为最新版本"}
    val selected=AndroidUpdateFeed.select(text,abis,sdk,installed){it}?:return null
    val matches=(0 until entries.length()).map{entries.getJSONObject(it)}.filter{it.optLong("versionCode")==selected.code}
    require(matches.size==1){"CNB 更新清单中有重复的版本码，已拒绝安装"}
    val item=matches.single()
    val tag=when {
      item.has("cnbTag")->item.getString("cnbTag")
      item.has("releaseTag")->item.getString("releaseTag")
      else->{require(selected.version.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+"))){"CNB 更新清单缺少不可变版本标签"};"android-v${selected.version}"}
    }
    require(tag.length in 1..180&&tag.matches(Regex("[A-Za-z0-9_.-]+"))&&tag !in listOf(".","..","latest")){"CNB 更新包标签无效，不能使用可变的 latest 地址"}
    val location="https://cnb.cool/$repository/-/releases/download/".toHttpUrl().newBuilder().addPathSegment(tag).addPathSegment(selected.fileName).build().toString()
    return selected.copy(location=location)
  }
}
