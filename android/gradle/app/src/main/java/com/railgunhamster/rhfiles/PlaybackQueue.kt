package com.railgunhamster.rhfiles

import org.json.JSONArray
import org.json.JSONObject

/** Bounded intent payload; no filesystem walk or permission guesses for SAF. */
internal object PlaybackQueue {
  data class Item(val path:String,val name:String,val revision:String?=null)
  fun parse(args:JSONObject):List<Item> {
    val selected=args.getString("path");val input=args.optJSONArray("queue")?:JSONArray()
    require(input.length()<=1000&&input.toString().toByteArray(Charsets.UTF_8).size<=256*1024){"播放列表过大"}
    fun valid(path:String)=path.length<=8192&&(path.startsWith("/")||path.startsWith("content://")||path.startsWith("remote://")||path.matches(Regex("rhvideo://[a-f0-9-]{36}")))&&!path.contains('\u0000')
    require(valid(selected)){"媒体路径无效"}
    val items=linkedMapOf<String,Item>()
    for(i in 0 until input.length()){
      val item=input.getJSONObject(i);val path=item.getString("path")
      val revision=item.optString("revision").takeIf{it.isNotEmpty()&&it!="null"};require(revision==null||revision.length<=256){"媒体文件版本无效"}
      if(valid(path))items.putIfAbsent(path,Item(path,item.optString("name",path.substringAfterLast('/')).take(512),revision))
    }
    if(!items.containsKey(selected))items[selected]=Item(selected,args.optString("name",selected.substringAfterLast('/')).take(512))
    return items.values.toList()
  }
  fun json(items:List<Item>)=JSONArray(items.map{JSONObject().put("path",it.path).put("name",it.name).also{v->it.revision?.let{revision->v.put("revision",revision)}}}).toString()
  fun afterDelete(items:List<Item>,selected:String):Pair<List<Item>,Int> {
    val at=items.indexOfFirst{it.path==selected};require(at>=0){"待删除文件不在播放列表中"}
    val remaining=items.filter{it.path!=selected}
    return remaining to if(remaining.isEmpty()||at>=remaining.size)0 else at
  }
}
