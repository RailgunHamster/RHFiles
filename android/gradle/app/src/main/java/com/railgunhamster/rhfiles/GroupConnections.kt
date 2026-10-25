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
  private data class Route(val url:String,val epoch:Long,val at:Long,val healthy:Boolean=true)
  private data class Failure(val epoch:Long,val at:Long,val count:Int,val manualAt:Long?=null)
  private class Run(val budget:ConnectionBudget,var epoch:Long,val report:JSONObject){@Volatile var cancelled=false;var attemptEnd=Long.MAX_VALUE;val calls=ConcurrentHashMap.newKeySet<Call>()}
  private val routes=ConcurrentHashMap<String,Route>()
  private val failures=ConcurrentHashMap<String,Failure>()
  private class Gate(val lock:ReentrantLock=ReentrantLock(),var users:Int=0,var manualUsers:Int=0,val manualCancellation:java.util.concurrent.atomic.AtomicLong=java.util.concurrent.atomic.AtomicLong())
  private val locks=hashMapOf<String,Gate>()
  private val active=ConcurrentHashMap<String,Run>()
  private val history=ArrayDeque<JSONObject>()
  private val current=ThreadLocal<Run>()
  private fun remembered(key:String):List<String> {
    val prefs=owner?.getSharedPreferences("rhfiles-connection-history",Context.MODE_PRIVATE)?:return emptyList()
    return listOf("lan_address","tailscale_address","loopback").mapNotNull{type->runCatching{JSONObject(prefs.getString("$key|$type",null)?:return@runCatching null).takeIf{System.currentTimeMillis()-it.getLong("at") in 0..604800000L}}.getOrNull()}.sortedByDescending{it.getLong("at")}.map{it.getString("url")}
  }
  private fun remember(key:String,url:String):Boolean=runCatching{
    val prefs=owner?.getSharedPreferences("rhfiles-connection-history",Context.MODE_PRIVATE)?:return@runCatching false
    val edit=prefs.edit();if(prefs.all.size>=128)prefs.all.entries.sortedBy{runCatching{JSONObject(it.value.toString()).optLong("at")}.getOrDefault(0)}.take(prefs.all.size-127).forEach{edit.remove(it.key)}
    edit.putString("$key|${ConnectionPolicy.routeType(url)}",JSONObject().put("url",url).put("at",System.currentTimeMillis()).toString()).commit()
  }.getOrDefault(false)
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
    val key=key(c);val budget=ConnectionBudget({android.os.SystemClock.elapsedRealtime()},total=minOf(15_000L,DeviceGroups.refreshRemaining()))
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
    var reused=false
    try {
      if(manualRequest&&gate.manualCancellation.get()!=cancellationVersion){report.put("outcome","cancelled").put("certainty","confirmed");step(run,"coalesce",null,"cancelled","cancelled");throw java.io.InterruptedIOException("连接已取消")}
      try{DeviceGroups.validatePeer(c)}catch(e:Exception){val code=ConnectionBudget.classify(e);report.put("outcome",if(code=="authorization_revoked")code else "authorization_rejected").put("certainty","confirmed");step(run,"authorization",null,"failed",code);throw e}
      val cached=routes[key]
      if((!force||waited)&&cached!=null&&cached.healthy&&cached.epoch==epoch&&now-cached.at<60_000&&DeviceGroups.hasSession(JSONObject(c.toString()).put("url",cached.url))){
        val result=JSONObject(c.toString()).put("url",cached.url)
        DeviceGroups.authorization(result)
        reused=true
        if(manualRequest){report.put("outcome","connected").put("certainty","confirmed").put("endpoint",cached.url);step(run,"coalesce",cached.url,"succeeded","reused_verified_route")}
        // Reuse is cheap and must not evict a useful failure/success history.
        return result
      }
      val failure=failures[key]?.takeIf{it.epoch==epoch}
      val cooling=failure?.let{(ConnectionPolicy.cooldown(it.count)-(now-it.at)).coerceAtLeast(0)}?:0
      val manualWait=failure?.manualAt?.let{(ConnectionPolicy.MANUAL_INTERVAL_MS-(now-it)).coerceAtLeast(0)}?:0
      if(cooling>0||manualRequest&&manualWait>0){
        if(!manualRequest||waited||manualWait>0){step(run,"budget",null,"skipped",if(manualRequest&&manualWait>0)"manual_rate_limited"else"cooldown");report.put("outcome","cooldown").put("retryAfterMs",if(manualRequest&&manualWait>0)manualWait else cooling);throw java.io.IOException("暂未恢复，连接重试冷却中；请查看连接诊断")}
        step(run,"budget",null,"allowed","manual_retry_allowed")
      }
      val candidates=ArrayDeque<Pair<String,String>>()
      if(manual!=null){
        try{RhFilesConnection.valid(JSONObject(c.toString()).put("url",manual))}catch(_:Exception){step(run,"manual",null,"failed","invalid_endpoint");report.put("outcome","invalid_endpoint").put("certainty","confirmed");throw java.io.IOException("恢复地址必须是 HTTPS 私网地址，不含账号、密码、路径或查询参数")}
        candidates.add("manual" to manual.trimEnd('/'))
      }
      cached?.let{candidates.add("last_success" to it.url)}
      remembered(key).filter{url->runCatching{RhFilesConnection.valid(JSONObject(c.toString()).put("url",url));true}.getOrDefault(false)}.forEach{candidates.add("last_success" to it)}
      candidates.add("saved_address" to c.getString("url").trimEnd('/'))
      DeviceGroups.knownEndpoints(c).forEach{candidates.add("known_address" to it.trimEnd('/'))}
      fun orderCandidates(){val ranked=DeviceGroups.preferredEndpoints(candidates.map{it.second}.distinct()).withIndex().associate{it.value to it.index};val ordered=candidates.sortedBy{if(it.first=="manual")-1 else ranked[it.second]?:Int.MAX_VALUE};candidates.clear();candidates.addAll(ordered)}
      orderCandidates()
      val remoteAddresses=DeviceGroups.knownEndpoints(c).any{!ConnectionPolicy.loopback(it)}
      var peerQuery=false;var discovered=false;var networkWaited=false;var warmRetried=false
      while(budget.remaining>0&&budget.attempts<6){
        if(run.cancelled||Thread.currentThread().isInterrupted){report.put("outcome","cancelled").put("certainty","confirmed");step(run,"budget",null,"cancelled","cancelled");throw java.io.InterruptedIOException("连接已取消")}
        if(ConnectionNetwork.generation.get()!=epoch){
          step(run,"network",null,"cancelled","local_network_changed")
          if(!networkWaited&&budget.remaining>300){networkWaited=true;step(run,"network",null,"waiting","waiting_network");Thread.sleep(minOf(250,budget.remaining));epoch=ConnectionNetwork.generation.get();run.epoch=epoch;candidates.addFirst("saved_address" to c.getString("url"));orderCandidates()}
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
        val(method,url)=candidate
        if(remoteAddresses&&ConnectionPolicy.loopback(url)&&method !in listOf("manual","last_success","warm_retry")){step(run,method,url,"skipped","remote_loopback_ignored");continue}
        if(DeviceGroups.ownAddress(url)&&method !in listOf("manual","last_success","warm_retry")){step(run,method,url,"skipped","remote_self_address_ignored");continue}
        val skipped=budget.admit(url,epoch,method=="warm_retry")
        if(skipped!=null){step(run,method,url,"skipped",skipped);continue}
        val start=android.os.SystemClock.elapsedRealtime();val allowance=if(budget.attempts==1||method=="last_success")ConnectionPolicy.COLD_ATTEMPT_MS else ConnectionPolicy.NORMAL_ATTEMPT_MS
        run.attemptEnd=start+allowance;report.put("attemptAllowanceMs",allowance)
        try{
          val result=JSONObject(c.toString()).put("url",url);RhFilesConnection.valid(result)
          // A transport timeout does not revoke a perfectly good session.
          // Explicit manual verification and HTTP 401 can renew it once.
          if(manualRequest&&method!="warm_retry")DeviceGroups.invalidate(result)
          val auth=DeviceGroups.authorization(result,allowDiscovered=true)
          try{DeviceGroups.checkFileAccess(result,auth)}catch(e:RhFilesConnection.HttpFailure){
            if(e.status!=401)throw e
            // A restarted server forgets RAM credentials, not membership. A
            // capabilities rejection has dispatched no file mutation.
            step(run,"session",url,"retrying","session_expired")
            DeviceGroups.invalidate(result)
            DeviceGroups.checkFileAccess(result,DeviceGroups.authorization(result,allowDiscovered=true))
          }
          DeviceGroups.validatePeer(result)
          if(ConnectionNetwork.generation.get()!=epoch||run.cancelled)continue
          val changed=cached?.url?.let{it!=url}?: (url!=c.getString("url"))
          step(run,method,url,"succeeded",if(changed)"address_changed_verified"else"identity_verified",start)
          report.put("outcome","connected").put("certainty","confirmed").put("endpoint",url).put("routeType",ConnectionPolicy.routeType(url))
          listOf("trusted_peers","mdns","udp","manual_help").forEach{m->if((0 until report.getJSONArray("steps").length()).none{report.getJSONArray("steps").getJSONObject(it).optString("method")==m})step(run,m,null,"skipped","already_connected")}
          if(routes.size>=128)routes.clear();routes[key]=Route(url,epoch,android.os.SystemClock.elapsedRealtime());failures.remove(key)
          if(!remember(key,url))step(run,"history",null,"failed","history_not_saved")
          return result
        }catch(e:Exception){if(ConnectionNetwork.generation.get()!=epoch){step(run,method,url,"cancelled","local_network_changed",start);continue};val code=ConnectionBudget.classify(e);step(run,method,url,"failed",code,start);if(ConnectionBudget.terminal(code)){report.put("outcome","authorization_rejected").put("certainty","confirmed");throw e}
          if(!warmRetried&&ConnectionPolicy.retryable(code)&&(budget.attempts==1||method=="last_success")&&budget.remaining>500&&budget.attempts<6){warmRetried=true;step(run,"warm_retry",url,"waiting","bounded_transport_retry");Thread.sleep(minOf(200L+java.util.concurrent.ThreadLocalRandom.current().nextLong(151),budget.remaining));candidates.addFirst("warm_retry" to url)}
        }
      }
      step(run,"udp",null,"skipped","not_enabled");step(run,"manual_help",null,"available","enter_private_address_or_exchange_group_data")
      // Start cooldown when the run finishes, not when it began: a full
      // 15-second failure must not consume its own entire cooldown allowance.
      if(failures.size>=128)failures.clear();val finished=android.os.SystemClock.elapsedRealtime();val count=(failure?.count?:0)+1;failures[key]=Failure(epoch,finished,count,if(manualRequest)finished else failure?.manualAt);report.put("retryAfterMs",ConnectionPolicy.cooldown(count))
      throw java.io.IOException("设备当前不可达，不能确定是否离线；请打开设备组 → 连接诊断查看尝试过程")
    } finally {
      if(!reused&&report.optString("outcome")!="connected")routes.computeIfPresent(key){_,route->route.copy(healthy=false)}
      report.put("durationMs",budget.elapsed).put("attempts",budget.attempts).put("remainingMs",budget.remaining);if(report.optString("outcome")!="unreachable"||report.getJSONArray("steps").length()>0)record(report)
      current.remove();active.remove(key,run);run.calls.forEach{it.cancel();ConnectionNetwork.release(it)};lock.unlock();releaseGate()
    }
  }
  fun failed(c:JSONObject){routes.computeIfPresent(key(c)){_,route->route.copy(healthy=false)}}
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
