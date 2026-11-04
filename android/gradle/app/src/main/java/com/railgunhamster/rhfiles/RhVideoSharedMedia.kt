package com.railgunhamster.rhfiles

import android.webkit.WebView
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject

/** Decoder slots only. The canonical frontend owns the playlist and controls. */
internal class RhVideoSharedMedia(private val activity:AppCompatActivity,private val root:FrameLayout,private val web:WebView){
  private data class Slot(val generation:Long,val revision:Long,val player:RhVideoPresentation)
  private val slots=linkedMapOf<String,Slot>()
  private fun key(args:JSONObject)=args.getString("key").also{require(it.matches(Regex("[A-Za-z0-9-]{1,96}")))}
  private fun revision(args:JSONObject)=args.getLong("revision").also{require(it in 1..9007199254740991L)}
  private fun owns(slot:Slot,args:JSONObject,generation:Long)=slot.generation==generation&&slot.revision==revision(args)&&(!args.has("expectedInput")||args.isNull("expectedInput")||slot.player.state().optLong("inputId")==args.getLong("expectedInput"))
  private fun state(slot:Slot):JSONObject{
    val value=slot.player.state()
    value.put("state",when(value.optString("state")){"playing"->3;"ended"->6;"error"->7;else->4})
    if(!value.isNull("error"))value.put("presentationError",value.getString("error"))
    return value
  }
  fun request(action:String,args:JSONObject,generation:Long):Any=when(action){
    "shared.media.open"->{
      val key=key(args);val revision=revision(args)
      require(slots[key]?.let{it.generation!=generation||it.revision<revision}!=false){"媒体输入已过期"}
      require(slots.containsKey(key)||slots.size<12){"最多同时解码 12 个视频"}
      slots.remove(key)?.player?.close()
      val player=RhVideoPresentation(activity,root,web)
      try{
        val value=player.open(JSONObject().put("sharedPath",args.getString("path")).put("seconds",args.optDouble("seconds",0.0)).put("title","RHVideo").put("_sessionGeneration",generation))
        val input=value.getLong("inputId")
        player.control(JSONObject().put("expectedInput",input).put("command","volume").put("value",args.optDouble("volume",0.0)))
        player.control(JSONObject().put("expectedInput",input).put("command","rate").put("value",args.optDouble("rate",1.0)))
        if(args.optBoolean("paused",true))player.control(JSONObject().put("expectedInput",input).put("command","pause"))
        Slot(generation,revision,player).also{slots[key]=it}.let(::state)
      }catch(error:Exception){player.close();throw error}
    }
    "shared.media.close"->{val key=key(args);val slot=slots[key];if(slot!=null&&owns(slot,args,generation)){slots.remove(key);slot.player.close()}else JSONObject().put("stale",true)}
    "shared.media.control"->{val slot=slots[key(args)]?.takeIf{owns(it,args,generation)}?:error("媒体输入已切换");require(args.has("expectedInput"));slot.player.control(args);state(slot)}
    "shared.media.state"->JSONArray().also{array->slots.forEach{(key,slot)->if(slot.generation==generation)array.put(JSONObject().put("key",key).put("revision",slot.revision).put("state",state(slot)))}}
    "shared.media.bounds"->{val items=args.getJSONArray("items");require(items.length()<=12);for(i in 0 until items.length()){val row=items.getJSONObject(i);slots[key(row)]?.takeIf{owns(it,row,generation)}?.player?.bounds(row)};JSONObject().put("updated",true)}
    else->error("未知原生媒体操作")
  }
  fun pause(){slots.values.forEach{it.player.pause()}}
  fun close(){val old=slots.values.toList();slots.clear();old.forEach{it.player.close()}}
}
