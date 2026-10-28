package com.railgunhamster.rhfiles

import org.json.JSONArray
import org.json.JSONObject

/** Same packaged operation contract as Windows; never accepts an arbitrary URL. */
internal class RhVideoContract(private val manifest:JSONObject) {
  data class Call(val method:String,val path:String,val query:Map<String,String>,val body:JSONObject?,val invalidatesCatalog:Boolean=false)
  private fun valid(v:Any?,rule:String):Boolean = when {
    rule=="bool" -> v is Boolean
    rule=="uuid" -> v is String && RhVideoExports.uuid(v)
    rule=="id" -> v is String && v.matches(Regex("[A-Za-z0-9_-]{1,128}"))
    rule=="task" -> v is String && v.matches(Regex("(video|run|replace):[A-Za-z0-9_-]{1,128}"))
    rule=="resolution" -> v==null || v==JSONObject.NULL || v is String && (v.isEmpty() || v.matches(Regex("[1-9][0-9]{1,3}x[1-9][0-9]{1,3}")))
    rule.startsWith("text:") -> v is String && v.codePointCount(0,v.length)<=rule.substringAfter(':').toInt() && !v.contains('\u0000')
    rule.startsWith("int:") -> v is Number && v.toDouble().isFinite() && v.toDouble()==v.toLong().toDouble() && v.toLong() in rule.split(':')[1].toLong()..rule.split(':')[2].toLong()
    rule.startsWith("ids:") -> v is JSONArray && v.length() in 1..rule.substringAfter(':').toInt() && (0 until v.length()).all{valid(v.opt(it),"id")}
    else -> rule.split('|').contains(v.toString())
  }
  fun request(args:JSONObject):Call {
    require(args.keys().asSequence().all{it in listOf("name","params","query","body","confirmation")}){"操作参数无效"}
    val name=args.getString("name");val spec=manifest.getJSONObject("operations").optJSONObject(name)?:error("不支持的 RHVideo 操作")
    require(!spec.optBoolean("internal")){"此操作仅限原生登录管理"}
    if(spec.optString("risk")=="destructive")require(args.optString("confirmation")=="RHVIDEO:$name"){"此操作需要显式确认"}
    var path=spec.getString("path")
    val params=if(args.has("params"))args.getJSONObject("params")else JSONObject()
    for(key in params.keys()){
      require(path.contains("{$key}")&&valid(params.opt(key),spec.optJSONObject("params")?.optString(key,"id")?:"id")){"路径参数无效：$key"}
      path=path.replace("{$key}",params.getString(key))
    }
    require(!path.contains('{')&&!path.contains('}')){"缺少路径参数"}
    val query=linkedMapOf<String,String>()
    for(section in listOf("query","body"))if(args.has(section)){
      val values=args.getJSONObject(section)
      for(key in values.keys()){
        val rule=spec.optJSONObject(section)?.optString(key)?.takeIf{it.isNotEmpty()}?:error("不支持的参数：$key")
        require(valid(values.opt(key),rule)){"参数无效：$key"}
        if(section=="query")query[key]=values.get(key).toString()
      }
    }
    return Call(spec.getString("method"),"api/v1/$path",query,args.optJSONObject("body"),spec.optBoolean("invalidatesCatalog"))
  }
}
