package com.railgunhamster.rhfiles

import android.content.Context
import org.json.*
import okhttp3.Call
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock

/** One resolver shared by ordinary file I/O, refresh and manual diagnostics.
 * Only group/public-key identity survives address changes. No credential leaves
 * pinned TLS. Reports contain fixed codes, not exception messages/secrets. */
internal object GroupConnections {
  private var owner:Context?=null
  private data class Route(val url:String,val epoch:Long,val at:Long)
  private data class Failure(val epoch:Long,val at:Long)
  private class Run(val budget:ConnectionBudget,var epoch:Long,val report:JSONObject){@Volatile var cancelled=false;var attemptEnd=Long.MAX_VALUE;val calls=ConcurrentHashMap.newKeySet<Call>()}
  private val routes=ConcurrentHashMap<String,Route>()
  private val failures=ConcurrentHashMap<String,Failure>()
  private class Gate(val lock:ReentrantLock=ReentrantLock(),var users:Int=0,var manualUsers:Int=0,val manualCancellation:java.util.concurrent.atomic.AtomicLong=java.util.concurrent.atomic.AtomicLong())
  private val locks=hashMapOf<String,Gate>()
  private val active=ConcurrentHashMap<String,Run>()
  private val history=ArrayDeque<JSONObject>()
  private val current=ThreadLocal<Run>()
  @Synchronized fun install(context:Context){if(owner==null){owner=context.applicationContext;ConnectionNetwork.install(context)}}
  private fun key(c:JSONObject)="${c.getString("groupId")}:${c.getString("groupPeerId")}:${c.getString("fingerprint")}"
  fun remaining()=current.get()?.let{minOf(it.budget.remaining,it.attemptEnd-android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0)}?:12_000L
  fun track(call:Call){current.get()?.let{r->r.calls.add(call);ConnectionNetwork.track(call,r.epoch);if(r.cancelled||Thread.currentThread().isInterrupted)call.cancel()}}
  fun release(call:Call){current.get()?.calls?.remove(call);ConnectionNetwork.release(call)}
  fun phase(c:JSONObject,method:String,start:Long,code:String="response_received"){current.get()?.let{step(it,method,c.getString("url"),if(code=="response_received")"succeeded"else"failed",code,start)}}
  fun invalidate(){routes.clear();failures.clear();active.values.forEach{it.cancelled=true;it.calls.forEach(Call::cancel)}}
  fun cancel(group:String,peer:String):Boolean {
    val prefix="$group:$peer:";var found=false
    synchronized(locks){locks.filterKeys{it.startsWith(prefix)}.values.filter{it.manualUsers>0}.forEach{it.manualCancellation.incrementAndGet();found=true}}
    // A Settings page must never cancel a file task which owns the same peer.
    active.filterKeys{it.startsWith(prefix)}.values.filter{it.report.optString("trigger")=="manual"}.forEach{r->found=true;r.cancelled=true;r.calls.forEach(Call::cancel)}
    return found
  }
  @Synchronized fun diagnostics():JSONArray=JSONArray(history.reversed().map{JSONObject(it.toString())})
  @Synchronized private fun record(report:JSONObject){if(history.size>=20)history.removeFirst();history.addLast(JSONObject(report.toString()))}
  private fun step(r:Run,method:String,url:String?,outcome:String,code:String,start:Long=android.os.SystemClock.elapsedRealtime()){
    val a=r.report.getJSONArray("steps");if(a.length()<40)a.put(JSONObject().put("method",method).put("endpoint",url?:JSONObject.NULL).put("outcome",outcome).put("code",code).put("durationMs",android.os.SystemClock.elapsedRealtime()-start))
  }
  fun resolve(c:JSONObject,trigger:String="file_request",force:Boolean=false,manual:String?=null):JSONObject {
    val key=key(c);val budget=ConnectionBudget(total=minOf(15_000L,DeviceGroups.refreshRemaining()))
    val manualRequest=trigger=="manual"
    val(gate,cancellationVersion)=synchronized(locks){require(locks.size<128||locks.containsKey(key)){"并发连接数达到上限"};val value=locks.getOrPut(key){Gate()};val version=value.manualCancellation.get();value.users++;if(manualRequest)value.manualUsers++;value to version}
    val lock=gate.lock
    fun releaseGate(){synchronized(locks){gate.users--;if(manualRequest)gate.manualUsers--;if(gate.users==0)locks.remove(key)}}
    val waited=!lock.tryLock()
    try{if(waited&&!lock.tryLock(budget.remaining.coerceAtLeast(1),TimeUnit.MILLISECONDS)){releaseGate();throw java.io.IOException("连接任务正在处理，请查看连接诊断")}}catch(e:InterruptedException){releaseGate();Thread.currentThread().interrupt();throw java.io.InterruptedIOException("等待连接已取消")}
    val now=android.os.SystemClock.elapsedRealtime();var epoch=ConnectionNetwork.generation.get()
    val report=JSONObject().put("group",c.getString("groupId")).put("peer",c.getString("groupPeerId")).put("trigger",trigger.take(40)).put("startedAt",System.currentTimeMillis())
      .put("outcome","unreachable").put("certainty","unknown").put("steps",JSONArray())
    val run=Run(budget,epoch,report);active[key]=run;current.set(run)
    try {
      if(manualRequest&&gate.manualCancellation.get()!=cancellationVersion){report.put("outcome","cancelled").put("certainty","confirmed");step(run,"coalesce",null,"cancelled","cancelled");throw java.io.InterruptedIOException("连接已取消")}
      try{DeviceGroups.validatePeer(c)}catch(e:Exception){report.put("outcome","authorization_revoked").put("certainty","confirmed");step(run,"authorization",null,"failed","authorization_revoked");throw e}
      val cached=routes[key]
      if((!force||waited)&&cached!=null&&cached.epoch==epoch&&now-cached.at<60_000){
        val result=JSONObject(c.toString()).put("url",cached.url)
        DeviceGroups.authorization(result)
        if(manualRequest){report.put("outcome","connected").put("certainty","confirmed").put("endpoint",cached.url);step(run,"coalesce",cached.url,"succeeded","reused_verified_route")}
        // Reuse is cheap and must not evict a useful failure/success history.
        return result
      }
      if(failures[key]?.let{it.epoch==epoch&&now-it.at<15_000}==true){step(run,"budget",null,"skipped","cooldown");report.put("outcome","cooldown");throw java.io.IOException("暂未恢复，连接重试冷却中；请查看连接诊断")}
      val candidates=ArrayDeque<Pair<String,String>>()
      if(manual!=null){
        try{RhFilesConnection.valid(JSONObject(c.toString()).put("url",manual))}catch(_:Exception){step(run,"manual",null,"failed","invalid_endpoint");report.put("outcome","invalid_endpoint").put("certainty","confirmed");throw java.io.IOException("恢复地址必须是 HTTPS 私网地址，不含账号、密码、路径或查询参数")}
        candidates.add("manual" to manual.trimEnd('/'))
      }
      cached?.let{candidates.add("last_success" to it.url)}
      candidates.add("saved_address" to c.getString("url").trimEnd('/'))
      DeviceGroups.knownEndpoints(c).forEach{candidates.add("known_address" to it.trimEnd('/'))}
      var peerQuery=false;var discovered=false;var networkWaited=false
      while(budget.remaining>0&&budget.attempts<6){
        if(run.cancelled||Thread.currentThread().isInterrupted){report.put("outcome","cancelled").put("certainty","confirmed");step(run,"budget",null,"cancelled","cancelled");throw java.io.InterruptedIOException("连接已取消")}
        if(ConnectionNetwork.generation.get()!=epoch){
          step(run,"network",null,"cancelled","local_network_changed")
          if(!networkWaited&&budget.remaining>300){networkWaited=true;step(run,"network",null,"waiting","waiting_network");Thread.sleep(minOf(250,budget.remaining));epoch=ConnectionNetwork.generation.get();run.epoch=epoch;candidates.addFirst("saved_address" to c.getString("url"))}
          else{report.put("outcome","network_changed").put("certainty","confirmed");throw java.io.IOException("本机网络持续变化；已停止重试，请在网络稳定后重试")}
        }
        if(!peerQuery&&(budget.attempts>=3||candidates.isEmpty())){
          peerQuery=true;val peers=routes.filter{(k,v)->k.startsWith(c.getString("groupId")+":")&&k!=key&&v.epoch==epoch&&now-v.at<300_000}.entries.take(2)
          if(peers.isEmpty())step(run,"trusted_peers",null,"skipped","no_online_peer")
          for((peerKey,route) in peers){if(budget.remaining<300||budget.admit(route.url+"#peer",epoch)!=null)break;val start=android.os.SystemClock.elapsedRealtime();run.attemptEnd=start+1000
            try{val peer=peerKey.split(':')[1];DeviceGroups.exchangeKnownPeer(c.getString("groupId"),peer,route.url);step(run,"trusted_peers",route.url,"succeeded","signed_packet_received",start);DeviceGroups.knownEndpoints(c).forEach{candidates.addFirst("trusted_peers" to it)}}catch(e:Exception){step(run,"trusted_peers",route.url,"failed",ConnectionBudget.classify(e),start)}
          }
        }
        if(!discovered&&(budget.attempts>=3||candidates.isEmpty())){
          discovered=true;val start=android.os.SystemClock.elapsedRealtime();val context=owner?:error("连接尚未初始化")
          if(budget.remaining>300)try{
            val found=GroupDiscovery.find(context,c.getString("fingerprint"),minOf(2200,budget.remaining)){run.cancelled||ConnectionNetwork.generation.get()!=epoch}
            step(run,"mdns",null,if(found.isEmpty())"inconclusive"else"succeeded",if(found.isEmpty())"no_matching_announcement"else"untrusted_hints_received",start)
            found.reversed().forEach{candidates.addFirst("mdns" to it)}
          }catch(_:Exception){step(run,"mdns",null,"failed","discovery_unavailable",start)}
        }
        val candidate=candidates.removeFirstOrNull()?:break
        val(method,url)=candidate;val skipped=budget.admit(url,epoch)
        if(skipped!=null){step(run,method,url,"skipped",skipped);continue}
        val start=android.os.SystemClock.elapsedRealtime();run.attemptEnd=start+3000
        try{
          val result=JSONObject(c.toString()).put("url",url);RhFilesConnection.valid(result)
          if(force)DeviceGroups.invalidate(result)
          val auth=DeviceGroups.authorization(result,allowDiscovered=true)
          DeviceGroups.checkFileAccess(result,auth)
          DeviceGroups.validatePeer(result)
          if(ConnectionNetwork.generation.get()!=epoch||run.cancelled)continue
          val changed=cached?.url?.let{it!=url}?: (url!=c.getString("url"))
          step(run,method,url,"succeeded",if(changed)"address_changed_verified"else"identity_verified",start)
          report.put("outcome","connected").put("certainty","confirmed").put("endpoint",url)
          listOf("trusted_peers","mdns","udp","manual_help").forEach{m->if((0 until report.getJSONArray("steps").length()).none{report.getJSONArray("steps").getJSONObject(it).optString("method")==m})step(run,m,null,"skipped","already_connected")}
          if(routes.size>=128)routes.clear();routes[key]=Route(url,epoch,now);failures.remove(key)
          return result
        }catch(e:Exception){if(ConnectionNetwork.generation.get()!=epoch){step(run,method,url,"cancelled","local_network_changed",start);continue};val code=ConnectionBudget.classify(e);step(run,method,url,"failed",code,start);if(ConnectionBudget.terminal(code)){report.put("outcome","authorization_rejected").put("certainty","confirmed");throw e}}
      }
      step(run,"udp",null,"skipped","not_enabled");step(run,"manual_help",null,"available","enter_private_address_or_exchange_group_data")
      if(failures.size>=128)failures.clear();failures[key]=Failure(epoch,now)
      throw java.io.IOException("设备当前不可达，不能确定是否离线；请打开设备组 → 连接诊断查看尝试过程")
    } finally {
      report.put("durationMs",budget.elapsed);if(report.optString("outcome")!="unreachable"||report.getJSONArray("steps").length()>0)record(report)
      current.remove();active.remove(key,run);run.calls.forEach{it.cancel();ConnectionNetwork.release(it)};lock.unlock();releaseGate()
    }
  }
  fun failed(c:JSONObject){routes.remove(key(c));DeviceGroups.invalidate(c)}
  fun requestFailed(c:JSONObject,code:String,duration:Long,ambiguous:Boolean){
    if(c.optString("groupId").isEmpty())return
    record(JSONObject().put("group",c.getString("groupId")).put("peer",c.getString("groupPeerId")).put("trigger","file_request").put("startedAt",System.currentTimeMillis()-duration).put("durationMs",duration)
      .put("outcome",if(ambiguous)"operation_unconfirmed"else"unreachable").put("certainty","unknown").put("steps",JSONArray().put(JSONObject().put("method","file_request").put("endpoint",c.getString("url")).put("durationMs",duration).put("outcome","failed").put("code",code))))
  }
  fun observed(c:JSONObject,code:String,duration:Long){
    if(c.optString("groupId").isEmpty())return
    // Fast successful reads do not flood history; failures and slow responses do.
    if(code=="response_received"&&duration<2000)return
    record(JSONObject().put("group",c.getString("groupId")).put("peer",c.getString("groupPeerId")).put("trigger","file_request").put("startedAt",System.currentTimeMillis()-duration).put("durationMs",duration)
      .put("outcome",if(code.startsWith("http_"))"server_response_error"else"connected").put("certainty","confirmed").put("endpoint",c.getString("url")).put("steps",JSONArray().put(JSONObject().put("method","file_request").put("endpoint",c.getString("url")).put("durationMs",duration).put("outcome",if(code.startsWith("http_"))"failed"else"succeeded").put("code",if(code=="response_received"&&duration>=2000)"response_slow"else code))))
  }
}
