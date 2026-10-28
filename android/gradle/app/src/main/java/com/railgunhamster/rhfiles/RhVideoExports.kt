package com.railgunhamster.rhfiles

import org.json.JSONArray
import org.json.JSONObject

/** Metadata only. The server owns ZIP jobs; preparing a selection never starts one. */
internal class RhVideoExports(private val clock:()->Long={android.os.SystemClock.elapsedRealtime()}) {
  companion object {
    const val MAX_ITEMS=50_000
    private const val SAFE_INTEGER=9_007_199_254_740_991L
    fun uuid(value:String)=value.matches(Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))
    private fun fields(args:JSONObject,allowed:Set<String>){require(args.keys().asSequence().all{it in allowed}){"导出参数无效"}}
    private fun count(value:Any?,max:Long)=value is Number && value.toDouble().isFinite() && value.toDouble()==value.toLong().toDouble() && value.toLong() in 0..max
    private fun reference(value:JSONObject):Pair<String,String>{
      fields(value,setOf("type","id"))
      val type=value.get("type");val id=value.get("id")
      require(type is String && type in listOf("video","picture","novel")){"导出媒体类型无效"}
      require(id is String && id.codePointCount(0,id.length) in 1..36 && !id.contains('\u0000')){"导出媒体编号无效"}
      return type to id
    }
    fun job(value:JSONObject):JSONObject {
      val invalid="服务器返回的 ZIP 导出状态无效；请查看最近导出，不会自动重复打包"
      require(listOf("id","request_id").all{value.opt(it) is String && uuid(value.getString(it))}){invalid}
      require(value.optString("status") in listOf("queued","running","completed","failed","cancelled","expired")){invalid}
      require(count(value.opt("total"),MAX_ITEMS.toLong()) && value.getLong("total")>0 && count(value.opt("archive_bytes"),SAFE_INTEGER)){invalid}
      require(value.opt("cancel_requested") is Boolean && value.opt("can_download") is Boolean && (!value.getBoolean("can_download")||value.getString("status")=="completed")){invalid}
      for(key in listOf("created_at","finished_at","expires_at")){
        if(key!="created_at" && value.isNull(key))continue
        val date=value.opt(key);require(date is String && date.length<=64){invalid}
        try{java.time.OffsetDateTime.parse(date)}catch(_:Exception){throw IllegalArgumentException(invalid)}
      }
      require(value.isNull("error_message") || value.opt("error_message") is String && value.getString("error_message").codePointCount(0,value.getString("error_message").length)<=16384){invalid}
      val progress=value.optJSONObject("progress")?:throw IllegalArgumentException(invalid)
      for(key in listOf("done","included","skipped","bytes_done","bytes_total"))if(progress.has(key))require(count(progress.opt(key),if(key.startsWith("bytes_"))SAFE_INTEGER else value.getLong("total"))){invalid}
      if(progress.has("percent")){val n=progress.opt("percent");require(n is Number && n.toDouble().isFinite() && n.toDouble() in 0.0..100.0){invalid}}
      if(progress.has("current")){val s=progress.opt("current");require(s is String && s.codePointCount(0,s.length)<=32768){invalid}}
      return value
    }
    fun response(name:String,value:Any):Any {
      if(name!="exports.list")return job(value as? JSONObject?:error("导出任务格式无效"))
      val result=value as? JSONObject?:error("导出列表格式无效")
      val items=result.optJSONArray("items")?:error("导出列表格式无效")
      require(items.length()<=100){"导出列表数量无效"}
      val ids=hashSetOf<String>()
      for(i in 0 until items.length())require(ids.add(job(items.getJSONObject(i)).getString("id").lowercase(java.util.Locale.ROOT))){"导出列表包含重复任务"}
      return result
    }
    fun identity(value:JSONObject,field:String,expected:String):JSONObject {
      check(value.optString(field).equals(expected,ignoreCase=true)){"服务器返回的导出任务与请求不匹配，请查看最近导出核对；不会自动重复执行"}
      return value
    }
  }
  private data class Draft(val generation:Long,val total:Int,val created:Long,val items:MutableList<JSONObject> = mutableListOf(),val keys:MutableSet<Pair<String,String>> = hashSetOf())
  private val drafts=linkedMapOf<String,Draft>()
  private fun prune(generation:Long){val now=clock();drafts.values.removeAll{it.generation!=generation || now-it.created>=300_000}}
  @Synchronized fun clear(){drafts.clear()}
  @Synchronized fun prepare(generation:Long,args:JSONObject):JSONObject {
    fields(args,setOf("ticket","offset","total","items"))
    val ticket=args.getString("ticket");require(uuid(ticket)){"导出准备标识无效"}
    require(count(args.opt("total"),MAX_ITEMS.toLong()) && args.getInt("total")>0){"一次最多导出 50000 项"}
    val total=args.getInt("total");require(count(args.opt("offset"),(total-1).toLong())){"导出分段位置无效"}
    val offset=args.getInt("offset");val items=args.getJSONArray("items")
    require(items.length() in 1..200 && offset+items.length()<=total){"每次最多准备 200 项，且不能超过声明总数"}
    val rows=(0 until items.length()).map{items.getJSONObject(it)}
    val keys=rows.map{reference(it)}.toSet();require(keys.size==rows.size){"导出选择包含重复条目"}
    prune(generation)
    require(drafts.values.sumOf{it.items.size}+rows.size<=100_000){"准备中的导出合计不能超过 100000 项"}
    val existing=drafts[ticket]
    val draft=if(existing!=null){
      require(existing.total==total && existing.items.size==offset){"导出选择已改变或分段重复，请重新准备；未提交打包"}
      require(keys.none{it in existing.keys}){"导出选择包含重复条目"};existing
    }else{
      require(offset==0 && drafts.size<4){"导出准备已失效或准备任务过多"}
      Draft(generation,total,clock()).also{drafts[ticket]=it}
    }
    // Clone bridge JSON. A caller cannot alter a prepared snapshot afterwards.
    draft.items.addAll(rows.map{JSONObject(it.toString())});draft.keys.addAll(keys)
    return JSONObject().put("ticket",ticket).put("count",draft.items.size).put("total",total).put("ready",draft.items.size==total)
  }
  @Synchronized fun discard(generation:Long,args:JSONObject):JSONObject {
    fields(args,setOf("ticket"));val ticket=args.getString("ticket");require(uuid(ticket)){"导出准备标识无效"}
    val removed=if(drafts[ticket]?.generation==generation)drafts.remove(ticket)!=null else false
    return JSONObject().put("removed",removed)
  }
  @Synchronized fun consume(generation:Long,args:JSONObject):JSONObject {
    fields(args,setOf("requestId","ticket"));val requestId=args.getString("requestId");require(uuid(requestId)){"导出请求标识无效"}
    val body=JSONObject().put("request_id",requestId)
    if(!args.has("ticket"))return body
    require(args.opt("ticket") is String && uuid(args.getString("ticket"))){"导出准备标识无效"}
    prune(generation);val ticket=args.getString("ticket");val draft=drafts[ticket]
    check(draft!=null && draft.items.size==draft.total){"导出选择尚未准备完整或已失效，请重新准备"}
    // Consume before HTTP. Transport failure must not re-submit this selection.
    drafts.remove(ticket)
    return body.put("selection",JSONArray(draft.items))
  }
}
