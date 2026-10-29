package com.railgunhamster.rhfiles

import org.json.JSONObject
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/** Process-owned receipts for a library which destroys its producing WebView.
 * No disk, raw arguments/fingerprint, Activity references or operation replay.
 * Completion is published by onDestroy, never by queuing finish(). */
internal object RhVideoCloseReceipts {
  private val store=RhVideoCloseReceiptStore()
  fun begin(run:JSONObject)=store.begin(run)
  fun read(query:JSONObject)=store.read(query)
}

internal class RhVideoCloseReceiptStore(
  private val elapsed:()->Long={System.nanoTime()/1_000_000},
  private val wall:()->Long={System.currentTimeMillis()},
  private val capacity:Int=128,private val activeLimit:Int=16,
  private val retiredLimit:Int=4096,private val ttlMs:Long=30*60*1000L
) {
  private val lock=ReentrantLock()
  private val changed=lock.newCondition()
  private var sequence=0L
  private data class Identity(val id:String,val action:String,val key:String?,val hash:String)
  private data class Entry(val identity:Identity,val token:Long,val started:Long,val result:Any,
    var finished:Long?=null,var finishedAt:Long?=null,var success:Boolean=false)
  private data class Retired(val identity:Identity,val at:Long)
  private val entries=linkedMapOf<String,Entry>()
  private val retired=ArrayDeque<Retired>()
  init{require(capacity>0&&activeLimit in 1..capacity&&retiredLimit>0&&ttlMs>0)}

  sealed interface Admission {
    class Start(val ticket:Ticket):Admission
    class Confirmed(val result:Any):Admission
  }
  class Ticket internal constructor(private val store:RhVideoCloseReceiptStore,private val id:String,private val token:Long){
    fun finish(destroyed:Boolean){store.finish(id,token,destroyed)}
  }
  private fun integer(json:JSONObject,key:String,max:Long):Long {
    val value=json.opt(key);require(value is Number){"无效的关闭回执数值"}
    val result=value.toLong();require(result in 0..max&&value.toDouble()==result.toDouble()){ "无效的关闭回执数值" };return result
  }
  private fun string(json:JSONObject,key:String,max:Int):String {
    val value=json.opt(key);require(value is String&&value.isNotEmpty()&&value.length<=max){"无效的关闭回执标识"};return value
  }
  private fun copy(value:Any):Any=if(value is JSONObject)JSONObject(value.toString())else value
  private fun prune(){
    val now=elapsed();entries.entries.removeAll{(_,entry)->entry.finished?.let{now-it>=ttlMs}==true}
    while(retired.firstOrNull()?.let{now-it.at>=ttlMs}==true)retired.removeFirst()
  }
  private fun makeRoom(){
    while(entries.size>=capacity&&retired.size<retiredLimit){
      val old=entries.values.firstOrNull{it.finished!=null}?:break
      entries.remove(old.identity.id);retired.addLast(Retired(old.identity,old.finished!!))
    }
  }
  fun begin(run:JSONObject):Admission=lock.withLock {
    require(run.keys().asSequence().all{it in setOf("id","action","key","fingerprint","startedAt","completionResult")}){"未知的关闭回执字段"}
    val id=string(run,"id",240);val action=string(run,"action",200)
    require(action in setOf("rhvideo.back","ui.invoke")){"此操作不能关闭媒体库"}
    val key=if(run.has("key"))string(run,"key",200)else null
    val fingerprint=string(run,"fingerprint",262144)
    val started=integer(run,"startedAt",9_007_199_254_740_991L)
    require(started>=wall()-ttlMs&&started<=wall()+60000){"关闭请求已过期，未重复执行"}
    val result:Any=if(action=="ui.invoke"){
      val value=run.opt("completionResult");require(value is JSONObject){"缺少控件关闭回执"}
      require(value.length()==2&&value.has("controlId")&&value.has("event")){"无效的控件关闭回执"}
      string(value,"controlId",240);require(string(value,"event",32).matches(Regex("[a-z]+"))){"无效的控件事件"};JSONObject(value.toString())
    }else{require(!run.has("completionResult")){"关闭动作不接受控件结果"};true}
    val hash=MessageDigest.getInstance("SHA-256").digest(fingerprint.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
    val identity=Identity(id,action,key,hash);prune()
    fun matches(old:Identity)=old.id==id||key!=null&&old.key==key
    val old=entries.values.lastOrNull{matches(it.identity)}
    if(old!=null){
      require(old.identity.hash==hash&&old.identity.action==action){"该标识已用于不同操作，未重复执行"}
      check(old.finished!=null){"关闭仍在处理，请查询回执，不要重复提交"}
      check(old.success){"此前关闭已失败，不会自动重试"}
      return@withLock Admission.Confirmed(copy(old.result))
    }
    val expired=retired.lastOrNull{matches(it.identity)}
    check(expired==null){"关闭结果已过期，未重复执行"}
    makeRoom()
    check(entries.size<capacity&&entries.values.count{it.finished==null}<activeLimit){"关闭回执繁忙，未执行新操作"}
    val token=++sequence;entries[id]=Entry(identity,token,started,result);Admission.Start(Ticket(this,id,token))
  }
  private fun finish(id:String,token:Long,destroyed:Boolean)=lock.withLock {
    val entry=entries[id]?.takeIf{it.token==token&&it.finished==null}?:return@withLock
    entry.success=destroyed;entry.finished=elapsed();entry.finishedAt=wall();changed.signalAll()
  }
  private fun snapshot(entry:Entry):JSONObject=JSONObject().put("id",entry.identity.id).put("action",entry.identity.action)
    .put("state",if(entry.finished==null)"running"else if(entry.success)"succeeded"else "failed")
    .put("startedAt",entry.started).put("finishedAt",entry.finishedAt?:JSONObject.NULL).also{
      if(entry.finished!=null){if(entry.success)it.put("result",copy(entry.result))else it.put("error",JSONObject().put("code","ACTION_FAILED").put("message","未能确认媒体库完整关闭；没有自动重试"))}
    }
  fun read(query:JSONObject):JSONObject?=lock.withLock {
    require(query.keys().asSequence().all{it in setOf("runId","key","timeoutMs")}&&query.has("runId")!=query.has("key")){"请按一个关闭请求标识查询"}
    val id=if(query.has("runId"))string(query,"runId",240)else null
    val key=if(query.has("key"))string(query,"key",200)else null
    var remaining=TimeUnit.MILLISECONDS.toNanos(if(query.has("timeoutMs"))integer(query,"timeoutMs",30000)else 0)
    prune();val entry=entries.values.lastOrNull{if(id!=null)it.identity.id==id else it.identity.key==key}
    if(entry==null){check(retired.none{if(id!=null)it.identity.id==id else it.identity.key==key}){"关闭结果已过期，未重复执行"};return@withLock null}
    while(entry.finished==null&&remaining>0)remaining=changed.awaitNanos(remaining)
    snapshot(entry)
  }
}
