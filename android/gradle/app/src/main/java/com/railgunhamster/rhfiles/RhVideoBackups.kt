package com.railgunhamster.rhfiles

import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID

/** One credentials-free preview per client. A failed restore is never replayed. */
internal class RhVideoBackups(private val now:()->Long={android.os.SystemClock.elapsedRealtime()}) {
  companion object {
    const val LIMIT=20*1024*1024
    private val names=setOf("page_volume","rotate","mix_pictures","grid_tag_prefs","media_tag_filter","strip_layout","strip_speed","kenburns_duration","kenburns_overlap","kenburns_fade_min","kenburns_fade_max","kenburns_fade_ratio","novel_settings","favshow_image","favshow_video","favshow_fade")
    fun preferences(value:JSONObject){require(value.length()<=32&&value.keys().asSequence().all{it in names&&value.opt(it) is String&&value.getString(it).codePointCount(0,value.getString(it).length)<=16384}){"备份包含不支持的页面偏好"}}
    fun document(value:JSONObject){
      require(value.optString("format")=="RHVideo.config-backup"&&value.opt("version")==1&&value.opt("created_at") is String&&value.keys().asSequence().all{it in setOf("format","version","created_at","favorites","watch_folders","reading_progress","ui_preferences")}){"文件不是受支持的 RHVideo 配置备份（版本 1）"}
      for((key,limit)in listOf("favorites" to 50000,"watch_folders" to 1000,"reading_progress" to 50000))if(value.has(key))require(value.opt(key) is JSONArray&&value.getJSONArray(key).length()<=limit){"备份的 $key 格式或数量无效"}
      if(value.has("ui_preferences"))preferences(value.getJSONObject("ui_preferences"))
    }
    fun summary(value:JSONObject,applied:Boolean){
      require(value.opt("applied")==applied&&value.opt("preferences") is Number&&(value.get("preferences") as Number).toDouble()>=0&&value.optJSONArray("issues")?.length()?.let{it<=50}==true){"服务器未返回有效的配置恢复结果，请核对当前记录；不会自动重复恢复"}
      for((key,fields)in listOf("favorites" to listOf("total","add","existing","unmatched"),"watch_folders" to listOf("total","add","existing","skipped"),"reading_progress" to listOf("total","update","kept","unmatched"))){val counts=value.optJSONObject(key)?:error("配置恢复结果缺少匹配统计");require(fields.all{val n=counts.opt(it) as? Number;n!=null&&n.toDouble().isFinite()&&n.toDouble()==n.toLong().toDouble()&&n.toLong()>=0}){"配置恢复结果缺少匹配统计"}}
      if(value.has("ui_preferences"))preferences(value.getJSONObject("ui_preferences"))
    }
  }
  private data class Pending(val generation:Long,val ticket:String,val value:JSONObject,val created:Long)
  private var pending:Pending?=null
  @Synchronized fun clear(){pending=null}
  @Synchronized fun stage(generation:Long,value:JSONObject,preview:JSONObject):JSONObject{
    document(value);summary(preview,false);val ticket=UUID.randomUUID().toString();pending=Pending(generation,ticket,JSONObject(value.toString()),now());return JSONObject().put("ticket",ticket).put("preview",preview)
  }
  @Synchronized fun consume(generation:Long,ticket:String):JSONObject{
    val value=pending?.takeIf{it.generation==generation&&it.ticket==ticket&&now()-it.created in 0 until 300000}?:error("备份预览已失效，请重新选择文件并预览")
    pending=null;return value.value
  }
}
