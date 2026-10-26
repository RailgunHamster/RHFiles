package com.railgunhamster.rhfiles

import androidx.media3.common.C
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import org.json.JSONArray
import org.json.JSONObject

/** Structured equivalents of Media3's native track/subtitle controls. */
@UnstableApi
internal object PlayerTracks {
  val commands=setOf("track.select","track.auto","subtitles")
  private fun type(name:String)=when(name){"video"->C.TRACK_TYPE_VIDEO;"audio"->C.TRACK_TYPE_AUDIO;"text"->C.TRACK_TYPE_TEXT;else->error("轨道类型必须为 video、audio 或 text")}
  private fun name(type:Int)=when(type){C.TRACK_TYPE_VIDEO->"video";C.TRACK_TYPE_AUDIO->"audio";C.TRACK_TYPE_TEXT->"text";else->"other"}
  fun state(tracks:Tracks,parameters:TrackSelectionParameters):JSONObject {
    val groups=JSONArray()
    for((index,group) in tracks.groups.withIndex()){
      if(name(group.type)=="other")continue
      val formats=JSONArray()
      for(i in 0 until group.length){val f=group.getTrackFormat(i);formats.put(JSONObject()
        .put("index",i).put("id",f.id?:"").put("label",f.label?:"").put("language",f.language?:"")
        .put("mime",f.sampleMimeType?:"").put("codecs",f.codecs?:"").put("width",f.width).put("height",f.height)
        .put("bitrate",f.bitrate).put("channels",f.channelCount).put("sampleRate",f.sampleRate)
        .put("supported",group.isTrackSupported(i)).put("selected",group.isTrackSelected(i)))}
      groups.put(JSONObject().put("index",index).put("id",group.mediaTrackGroup.id).put("type",name(group.type)).put("tracks",formats))
    }
    return JSONObject().put("groups",groups).put("subtitlesEnabled",!parameters.disabledTrackTypes.contains(C.TRACK_TYPE_TEXT))
  }
  fun change(tracks:Tracks,current:TrackSelectionParameters,args:JSONObject):TrackSelectionParameters {
    val builder=current.buildUpon()
    when(args.getString("command")){
      "subtitles"->builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT,!args.getBoolean("enabled"))
      "track.auto"->{val type=type(args.getString("trackType"));builder.clearOverridesOfType(type).setTrackTypeDisabled(type,false)}
      "track.select"->{
        val groupIndex=args.getInt("trackGroup");require(groupIndex in tracks.groups.indices){"轨道组已改变，请重新读取播放器状态"}
        val group=tracks.groups[groupIndex];require(name(group.type)!="other"){"此轨道类型不能手动选择"}
        val index=args.getInt("trackIndex");require(index in 0 until group.length&&group.isTrackSupported(index)){"轨道不存在或设备不支持"}
        builder.clearOverridesOfType(group.type).setTrackTypeDisabled(group.type,false)
          .addOverride(TrackSelectionOverride(group.mediaTrackGroup,listOf(index)))
      }
      else->error("未知轨道操作")
    }
    return builder.build()
  }
}
