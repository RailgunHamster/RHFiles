package com.railgunhamster.rhfiles

import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

/** Session-local explicit marks. Taking a run consumes it before any I/O. */
internal class RhVideoPreviewState {
  companion object {private val sequence=AtomicLong()}
  data class Run(val id:Long,val targets:List<JSONObject>)
  private val pending=linkedMapOf<String,JSONObject>()
  private var order=0L
  private var active:Run?=null
  private var result=JSONObject()
  @Synchronized fun mark(kind:String,id:String,title:String,enabled:Boolean?=null):JSONObject {
    require(kind in listOf("video","picture","novel")&&id.matches(Regex("[A-Za-z0-9_-]{1,128}"))&&title.length<=1024){"预览标记无效"}
    val key="$kind:$id";val next=enabled?:!pending.containsKey(key)
    if(next){require(pending.size<1000||pending.containsKey(key)){"本次预览暂存标记最多 1000 项"};pending[key]=JSONObject().put("kind",kind).put("id",id).put("title",title).put("order",pending[key]?.getLong("order")?:order++)}else pending.remove(key)
    return JSONObject().put("kind",kind).put("id",id).put("enabled",next).put("pending",pending.size)
  }
  @Synchronized fun marked(kind:String,id:String)=pending.containsKey("$kind:$id")
  @Synchronized fun pending()=JSONObject().put("items",JSONArray(pending.values.map{JSONObject(it.toString())})).put("running",active!=null)
  @Synchronized fun result()=JSONObject(result.toString())
  @Synchronized fun take():Run? {
    if(active!=null||pending.isEmpty())return null
    val run=Run(sequence.incrementAndGet(),pending.values.map{JSONObject(it.toString())});pending.clear();active=run
    result=JSONObject().put("run",run.id).put("running",true).put("total",run.targets.size).put("completed",0).put("items",JSONArray())
    return run
  }
  @Synchronized fun publish(run:Run,item:JSONObject) {
    check(active?.id==run.id){"暂存执行已结束"}
    val count=result.getInt("completed");val expected=run.targets[count]
    require(expected.getString("kind")==item.getString("kind")&&expected.getString("id")==item.getString("id")&&item.get("success") is Boolean){"暂存结果顺序无效"}
    result.getJSONArray("items").put(JSONObject(item.toString()));result.put("completed",count+1)
    if(count+1==run.targets.size){active=null;result.put("running",false)}
  }
}
