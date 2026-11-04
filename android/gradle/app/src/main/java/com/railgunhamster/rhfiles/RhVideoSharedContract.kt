package com.railgunhamster.rhfiles

import org.json.JSONObject

/** Generated frontend route inventory, not an arbitrary HTTP/native proxy. */
internal class RhVideoSharedContract(private val manifest:JSONObject){
  fun path(method:String,raw:String):String{
    require(raw.length<=8192&&raw.startsWith('/')&&!raw.startsWith("//")&&raw.none{it.code<32||it=='\\'||it=='#'}){"媒体接口路径无效"}
    val path=raw.substringBefore('?')
    val decoded=java.net.URLDecoder.decode(path.replace("+","%2B"),"UTF-8")
    require(!decoded.contains('%')&&decoded.split('/').none{it=="."||it==".."}){"媒体接口路径无效"}
    if(method=="GET"&&path=="/openapi.json")return raw.removePrefix("/")
    require(!path.startsWith("/api/v1/auth/")||path=="/api/v1/auth/me"){"请使用受保护的登录接口"}
    val operations=manifest.getJSONArray("business_operations")
    require((0 until operations.length()).any{index->
      val entry=operations.getJSONObject(index).getString("id").split(' ',limit=2)
      if(entry[0]!=method||!entry[1].startsWith("/api/v1/"))false else{
        val a=entry[1].split('/');val b=path.split('/')
        a.size==b.size&&a.zip(b).all{(pattern,value)->if(pattern.startsWith('{')&&pattern.endsWith('}'))value.isNotEmpty()&&!value.contains('%')else pattern==value}
      }
    }){"接口未包含在共享前端契约中"}
    return raw.removePrefix("/")
  }
  companion object{
    fun media(raw:String):Pair<String,Boolean>{
      val video=Regex("api/v1/videos/[A-Za-z0-9_-]{1,128}/play(\\?(super=true|quality=lowest))?")
      if(video.matches(raw))return raw to false
      return RhVideoClient.imagePath(raw) to true
    }
  }
}
