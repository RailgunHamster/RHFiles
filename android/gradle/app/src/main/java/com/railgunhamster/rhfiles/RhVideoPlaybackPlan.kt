package com.railgunhamster.rhfiles

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToLong

/** Immutable reference queue. A 21-item decoder window must never re-plan it. */
internal class RhVideoPlaybackPlan(rows:List<JSONObject>,settings:JSONObject) {
  data class Entry(val id:String,val title:String,val durationMs:Long,val portrait:Boolean,val startMs:Long,val lengthMs:Long)
  data class Target(val index:Int,val positionMs:Long)
  private val source=rows.map{JSONObject(it.toString())}
  val options=JSONObject(settings.toString())
  val reference=options.optBoolean("reference")
  val entries:List<Entry>
  val beforeMs:LongArray
  val totalMs:Long
  val signature:String
  init {
    require(source.isNotEmpty()&&source.size<=100000){"播放队列为空或过大"}
    require(options.optDouble("rate",1.0).let{it.isFinite()&&it in .25..4.0}){"播放速度无效"}
    for(key in listOf("reference","fullLength","portraitOnly","loop","closeAtEnd","super","deferPreviewCommit"))if(options.has(key))require(options.get(key) is Boolean){"播放开关无效"}
    if(options.optString("origin")=="frame"){
      require(options.optString("parentKey").let{it.isNotEmpty()&&it.length<=1024}&&options.optString("parentPreview").matches(Regex("[A-Za-z0-9_-]{1,128}"))&&options.optInt("parentTotal") in 1..10000000){"父截图上下文无效"}
    }
    val seen=HashSet<String>()
    val all=source.mapIndexed{index,row->
      val id=row.getString("id");require(id.matches(Regex("[A-Za-z0-9_-]{1,128}"))&&seen.add(id)){"播放队列编号无效或重复"}
      val duration=seconds(row.optDouble("duration",0.0),true)
      val full=options.optBoolean("fullLength",true)
      val segment=seconds(options.optDouble("segment",15.0),false)
      val explicit=row.has("segmentStart")&&row.has("segmentLength")
      require(!reference||explicit){"播放片段计划不完整"}
      val start=if(explicit)seconds(row.getDouble("segmentStart"),true) else if(full||duration<=segment+1000)0L else
        (1000+java.util.Random(RhVideoClient::class.java.name.hashCode().toLong()+index).nextDouble()*(duration-segment-1000)).toLong()
      val length=if(explicit)seconds(row.getDouble("segmentLength"),false) else if(full)duration.takeIf{it>0}?:86400000L else if(duration>0)minOf(segment,duration)else segment
      require(duration==0L||start+length<=duration+100){"片段超出视频时长"}
      Entry(id,row.optString("title","视频"),duration,row.optBoolean("portrait"),start,length)
    }
    entries=if(options.optBoolean("portraitOnly"))all.filter{it.portrait}.also{require(it.size>=2){"竖屏视频不足 2 个"}}else all
    beforeMs=LongArray(entries.size+1);entries.forEachIndexed{i,e->beforeMs[i+1]=beforeMs[i]+e.lengthMs};totalMs=beforeMs.last()
    signature=java.security.MessageDigest.getInstance("SHA-256").digest(JSONArray(entries.map{it.id}).toString().toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
  }
  fun seek(ratio:Double):Target {
    require(ratio.isFinite()&&ratio in 0.0..1.0){"队列进度应为 0–1"}
    val target=(totalMs*ratio).roundToLong()
    var low=0;var high=entries.lastIndex
    while(low<high){val mid=(low+high)/2;if(target<beforeMs[mid+1])high=mid else low=mid+1}
    // Reference's total-progress endpoint selects the last item at its start.
    return Target(low,entries[low].startMs+if(ratio==1.0)0 else (target-beforeMs[low]).coerceIn(0,entries[low].lengthMs))
  }
  fun progress(index:Int,positionMs:Long):Long=beforeMs[index]+(positionMs-entries[index].startMs).coerceIn(0,entries[index].lengthMs)
  fun changed(patch:JSONObject):RhVideoPlaybackPlan {
    require(patch.keys().asSequence().all{it in setOf("fullLength","segment","portraitOnly","loop","rate")}){"未知连播设置"}
    val next=JSONObject(options.toString());patch.keys().forEach{next.put(it,patch.get(it))}
    for(key in listOf("fullLength","portraitOnly","loop"))if(patch.has(key))require(patch.get(key) is Boolean){"连播开关无效"}
    if(patch.has("portraitOnly")&&!patch.has("fullLength"))next.put("fullLength",patch.getBoolean("portraitOnly"))
    if(patch.has("segment")){val value=patch.getDouble("segment");require(value.isFinite()&&value in 1.0..300.0){"片段长度应为 1–300 秒"};if(!patch.has("fullLength"))next.put("fullLength",false)}
    if(patch.has("rate")){val rate=patch.getDouble("rate");require(rate.isFinite()&&rate in .25..4.0){"播放速度应为 0.25–4"}}
    val rebuild=next.optBoolean("fullLength",true)!=options.optBoolean("fullLength",true)||next.optDouble("segment",15.0)!=options.optDouble("segment",15.0)
    val updated=source.map{row->JSONObject(row.toString()).also{if(rebuild){
      val duration=row.optDouble("duration",0.0);val segment=next.optDouble("segment",15.0);val full=next.optBoolean("fullLength",true);val maxStart=duration-segment-1
      it.put("segmentStart",if(full||maxStart<=1)0.0 else kotlin.math.round((1+Math.random()*(maxStart-1))*10)/10)
      it.put("segmentLength",if(full)duration.takeIf{v->v>0}?:86400.0 else if(duration>0)minOf(duration,segment)else segment)
    }}}
    return RhVideoPlaybackPlan(updated,next)
  }
  private fun seconds(value:Double,zero:Boolean):Long {
    require(value.isFinite()&&value>=0&&(zero||value>0)&&value<=604800){"视频时间无效"}
    return (value*1000).roundToLong().also{require(zero||it>0){"片段长度不足一毫秒"}}
  }
}
