package com.railgunhamster.rhfiles

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONObject
import org.json.JSONArray
import okhttp3.Request
import okhttp3.Credentials
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.*
import java.security.spec.ECGenParameterSpec
import java.util.concurrent.TimeUnit
import com.railgunhamster.rhfiles.SafeFiles.readBytesBounded

/** Key never leaves Android Keystore. Neither membership, local refusals nor
 * session passwords participate in configuration/WebDAV backup or sync. */
internal object DeviceGroups {
  private const val ALIAS="rhfiles-device-group-p256-v1"
  private var owner:Context?=null
  private var model:DeviceGroupModel?=null
  private data class Session(val authorization:String,val expires:Long)
  private val sessions=linkedMapOf<String,Session>()
  private val refreshDeadline=ThreadLocal<Long>()
  fun refreshRemaining()=refreshDeadline.get()?.let{(it-android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0)}?:15000L
  @Synchronized fun install(context:Context){if(owner==null){owner=context.applicationContext;GroupConnections.install(context)}}
  @Synchronized fun invalidate(c:JSONObject){val prefix="${c.getString("groupId")}:${c.getString("groupPeerId")}:";sessions.keys.filter{it.startsWith(prefix)}.toList().forEach{sessions.remove(it)}}
  @Synchronized fun hasSession(c:JSONObject)=sessions["${c.getString("groupId")}:${c.getString("groupPeerId")}:${c.getString("url")}:${c.getString("fingerprint")}"]?.let{it.expires>android.os.SystemClock.elapsedRealtime()}==true
  @Synchronized private fun groups():DeviceGroupModel {
    model?.let{return it};val context=owner?:error("设备组尚未初始化")
    val preferences=context.getSharedPreferences("rhfiles-device-groups-v1",Context.MODE_PRIVATE)
    val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
    if(!store.containsAlias(ALIAS)){
      require(!preferences.contains("document")){"设备组私钥缺失；不会生成新身份覆盖本机移除记录"}
      KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC,"AndroidKeyStore").apply{initialize(KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY).setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1")).setDigests(KeyProperties.DIGEST_SHA256).build())}.generateKeyPair()
    }
    val public=DeviceGroupModel.publicKey(store.getCertificate(ALIAS).publicKey)
    val signer=object:DeviceGroupModel.Identity {
      override val publicKey=public
      override fun sign(bytes:ByteArray)=Signature.getInstance("SHA256withECDSA").run{initSign(store.getKey(ALIAS,null) as PrivateKey);update(bytes);sign()}
    }
    return DeviceGroupModel(signer,preferences.getString("document",null)){require(preferences.edit().putString("document",it).commit()){"无法保存设备组，本次更改未生效"}}.also{model=it}
  }
  fun describe(uri:String):JSONObject {
    if(uri.startsWith(GroupInvitation.PREFIX))return GroupInvitation.describe(uri)
    val meta=DeviceGroupModel.inspect(uri);return if(meta.getString("kind")=="request")meta else groups().inspectIncoming(uri)
  }
  @Synchronized fun joinInvitation(uri:String,confirmed:Boolean,remote:RemoteStorage):Any {
    require(confirmed){"请确认信任邀请来自你的电脑"};val invite=GroupInvitation.parse(uri);val g=groups()
    val request=g.run("invitationRequest",JSONObject().put("deviceName",DeviceNames.current(owner?:error("设备组未初始化")))) as JSONObject
    val signed=DeviceGroupModel.parse(request.getString("uri"),"rhfiles-group-request:v1:")
    val addresses=invite.getJSONArray("endpoints");val ordered=preferredEndpoints((0 until addresses.length()).map{addresses.getString(it)}).distinct().take(6)
    val deadline=android.os.SystemClock.elapsedRealtime()+15000;var last:Exception?=null
    for(address in ordered){
      val remaining=deadline-android.os.SystemClock.elapsedRealtime();if(remaining<=0)break
      val c=JSONObject().put("url",address).put("fingerprint",invite.getString("fingerprint"))
      val body=JSONObject().put("token",invite.getString("token")).put("request",signed).toString().toRequestBody("application/json; charset=utf-8".toMediaType())
      try {
        val call=RhFilesConnection.client(c).newBuilder().connectTimeout(minOf(4500,remaining),TimeUnit.MILLISECONDS).callTimeout(minOf(6000,remaining),TimeUnit.MILLISECONDS).build().newCall(Request.Builder().url(address.trimEnd('/')+"/api/v1/groups/invitations/redeem").post(body).build())
        val packet=call.execute().use{response->
          val reply=JSONObject(String(response.body!!.byteStream().readBytesBounded(180000),Charsets.UTF_8))
          require(response.isSuccessful){reply.optJSONObject("error")?.optString("message")?:"入组失败：HTTP ${response.code}"};reply
        }
        require(DeviceGroupModel.packetId(packet)==invite.getString("groupId")){"返回的设备组与邀请不一致"}
        val members=packet.getJSONArray("members");val approval=(0 until members.length()).map{DeviceGroupModel.read(members.getJSONObject(it))}.firstOrNull{it.getString("key")==g.publicIdentity()}
        val known=g.state().getJSONArray("groups").let{all->(0 until all.length()).any{all.getJSONObject(it).getString("id")==invite.getString("groupId")}}
        require(known||approval!=null&&DeviceGroupModel.id(approval.getString("issuer"))==invite.getString("deviceId")){"批准设备身份与邀请不一致"}
        val result=g.run("join",JSONObject().put("uri",DeviceGroupModel.uri("rhfiles-group-approval:v1:",packet)).put("confirmed",true));g.requirePeer(invite.getString("groupId"),invite.getString("deviceId"));sessions.clear();GroupConnections.invalidate();importLocations(remote);return result
      }catch(e:java.net.ConnectException){last=e}catch(e:java.net.NoRouteToHostException){last=e}
      catch(e:java.net.SocketTimeoutException){throw java.io.IOException("邀请请求超时，可能已由电脑批准。未重复发送；请重试或生成新邀请。",e)}
    }
    throw java.io.IOException("无法连接邀请中的电脑地址，请确认局域网或 Tailscale 已连通。${last?.javaClass?.simpleName?:("已达到尝试上限")}")
  }
  fun run(command:String,args:JSONObject,remote:RemoteStorage):Any {
    if(command=="join"&&args.optString("uri").startsWith(GroupInvitation.PREFIX))return joinInvitation(args.getString("uri"),args.optBoolean("confirmed"),remote)
    val g=groups()
    if(command=="diagnostics")return GroupConnections.diagnostics()
    if(command=="cancel")return GroupConnections.cancel(args.getString("id"),args.getString("peer"))
    if(command=="connect"){
      val group=args.getString("id");val peer=args.getString("peer")
      val member=servers().firstOrNull{it.first==group&&it.second==peer}?.third?:error("没有有效的组设备")
      val c=profile(group,peer,member,endpoints(member.getJSONObject("server")).first())
      try{val resolved=GroupConnections.resolve(c,"manual",true,args.optString("endpoint").takeIf{it.isNotBlank()});for(old in profiles(remote)){if(old.optString("groupId")==group&&old.optString("groupPeerId")==peer)remote.save(old.put("url",resolved.getString("url")))}}catch(_:java.io.IOException){}
      return GroupConnections.diagnostics().let{a->(0 until a.length()).map{a.getJSONObject(it)}.firstOrNull{it.optString("group")==group&&it.optString("peer")==peer}?:error("没有连接诊断")}
    }
    if(command=="refresh")return refresh(remote)
    if(command=="forget")return synchronized(this){
      val id=args.getString("id");g.run(command,args)
      sessions.keys.filter{it.startsWith("$id:")}.toList().forEach{sessions.remove(it)}
      GroupConnections.invalidate()
      removeOrphanLocations(remote)
    }
    val result=g.run(command,args)
    if(command=="state")(result as JSONObject).put("defaultDeviceName",DeviceNames.current(owner?:error("设备组尚未初始化")))
    if(command in listOf("remove","restore","configure","join")){synchronized(this){sessions.clear()};GroupConnections.invalidate()}
    if(command=="join")importLocations(remote)
    if(command=="remove")removeLocation(remote,args.getString("id"),args.getString("peer"))
    return result
  }
  private fun endpoints(server:JSONObject):List<String> {
    val a=server.getJSONArray("endpoints");val values=(0 until a.length()).map{a.getString(it)}
    return preferredEndpoints(values)
  }
  fun preferredEndpoints(values:List<String>):List<String> {
    val local=runCatching{java.net.NetworkInterface.getNetworkInterfaces().toList().flatMap{n->n.interfaceAddresses.mapNotNull{a->a.address.hostAddress?.let{it to a.networkPrefixLength.toInt()}}}}.getOrDefault(emptyList())
    return GroupAddresses.preferredEndpoints(values,local)
  }
  fun ownAddress(url:String)=runCatching{val host=java.net.URI(url).host;!ConnectionPolicy.loopback(url)&&java.net.NetworkInterface.getNetworkInterfaces().toList().any{n->n.inetAddresses.toList().any{it.hostAddress==host}}}.getOrDefault(false)
  private fun servers():List<Triple<String,String,JSONObject>> {
    val result=mutableListOf<Triple<String,String,JSONObject>>();val state=groups().state();val all=state.getJSONArray("groups")
    for(i in 0 until all.length()){val g=all.getJSONObject(i);val members=g.getJSONArray("members");if((0 until members.length()).any{members.getJSONObject(it).optBoolean("self")&&members.getJSONObject(it).optBoolean("blocked")})continue
      for(j in 0 until members.length()){val p=members.getJSONObject(j);if(!p.optBoolean("self")&&!p.optBoolean("blocked")&&!p.isNull("server")){result.add(Triple(g.getString("id"),p.getString("id"),p))}}}
    return result
  }
  private fun profile(group:String,peer:String,member:JSONObject,url:String)=JSONObject().put("type","rhfiles").put("name",member.getString("name")).put("url",url).put("fingerprint",member.getJSONObject("server").getString("fingerprint")).put("groupId",group).put("groupPeerId",peer)
  private fun profiles(remote:RemoteStorage):List<JSONObject>{val a=remote.backupProfiles(true);return (0 until a.length()).map{val item=a.getJSONObject(it);JSONObject(item.getJSONObject("config").toString()).put("id",item.getString("id"))}}
  @Synchronized private fun importLocations(remote:RemoteStorage):Int {
    var count=0;for((group,peer,member) in servers()){
      groups().requirePeer(group,peer);val old=profiles(remote).firstOrNull{it.optString("groupId")==group&&it.optString("groupPeerId")==peer}
      val candidates=endpoints(member.getJSONObject("server"));val url=old?.optString("url")?.takeIf{it in candidates}?:candidates.first();val c=profile(group,peer,member,url);old?.let{c.put("id",it.getString("id"))};remote.save(c);count++
    };return count
  }
  /** Retry orphan cleanup after interruption; never create peer refusals in
   * other groups. This lock also serializes refresh's final profile writes. */
  @Synchronized private fun removeOrphanLocations(remote:RemoteStorage):JSONObject {
    val all=groups().state().getJSONArray("groups");val ids=(0 until all.length()).map{all.getJSONObject(it).getString("id")}.toSet();val removed=JSONArray();val errors=JSONArray()
    try{for(c in profiles(remote)){val id=c.optString("groupId");if(id.isNotEmpty()&&id !in ids){try{remote.remove(c.getString("id"),false);removed.put(c.getString("id"))}catch(e:Exception){errors.put(e.message?:"无法删除生成的网络位置")}}}}catch(e:Exception){errors.put(e.message?:"无法读取生成的网络位置")}
    return JSONObject().put("removedLocations",removed).put("cleanupErrors",errors)
  }
  private fun removeLocation(remote:RemoteStorage,group:String,peer:String){for(c in profiles(remote)){if(c.optString("groupId")==group&&c.optString("groupPeerId")==peer)remote.remove(c.getString("id"),false)}}
  /** Removing the generated location is also a persistent local refusal. */
  fun removingProfile(c:JSONObject){if(c.optString("groupId").isNotEmpty()){groups().run("remove",JSONObject().put("id",c.getString("groupId")).put("peer",c.getString("groupPeerId")));synchronized(this){sessions.clear()}}}
  private fun exchange(c:JSONObject,path:String,body:JSONObject?):JSONObject {
    RhFilesConnection.valid(c)
    val remaining=minOf(GroupConnections.remaining(),refreshDeadline.get()?.let{it-android.os.SystemClock.elapsedRealtime()}?:12000L)
    if(remaining<=0)throw java.net.SocketTimeoutException("本次连接阶段额度已耗尽")
    val client=RhFilesConnection.client(c).newBuilder().callTimeout(remaining,TimeUnit.MILLISECONDS).connectTimeout(minOf(4500L,remaining),TimeUnit.MILLISECONDS).build()
    val url=c.getString("url").trimEnd('/')+"/api/v1/groups/"+path
    val builder=Request.Builder().url(url)
    if(body!=null)builder.post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
    val call=client.newCall(builder.build());val start=android.os.SystemClock.elapsedRealtime();GroupConnections.track(call)
    try{return call.execute().use{r->if(!r.isSuccessful)throw RhFilesConnection.HttpFailure(r.code,"设备组连接失败 HTTP ${r.code}");JSONObject(String(r.body!!.byteStream().readBytesBounded(280000),Charsets.UTF_8))}.also{GroupConnections.phase(c,path,start)}}catch(e:Exception){GroupConnections.phase(c,path,start,ConnectionBudget.classify(e));throw e}finally{GroupConnections.release(call)}
  }
  private fun checkPeer(group:String,peer:String){try{groups().requirePeer(group,peer)}catch(e:Exception){throw SecurityException("本机设备组授权已失效",e)}}
  fun validatePeer(c:JSONObject){val s=knownServer(c);if(c.getString("fingerprint")!=s.getString("fingerprint"))throw GroupIdentityFailure("电脑身份发生变化，已拒绝发送凭据")}
  private fun knownServer(c:JSONObject):JSONObject {val group=c.getString("groupId");val peer=c.getString("groupPeerId");checkPeer(group,peer);return servers().firstOrNull{it.first==group&&it.second==peer}?.third?.getJSONObject("server")?:error("设备组没有此电脑的服务证明")}
  fun knownEndpoints(c:JSONObject)=endpoints(knownServer(c))
  fun checkFileAccess(c:JSONObject,auth:String){
    val start=android.os.SystemClock.elapsedRealtime()
    val remaining=GroupConnections.remaining();if(remaining<=0)throw java.net.SocketTimeoutException("本次连接阶段额度已耗尽")
    val call=RhFilesConnection.client(c).newBuilder().callTimeout(remaining.coerceAtMost(3000),TimeUnit.MILLISECONDS).build().newCall(Request.Builder().url(c.getString("url")+"/api/v1/capabilities").header("Authorization",auth).build());GroupConnections.track(call)
    try{call.execute().use{r->if(!r.isSuccessful)throw RhFilesConnection.HttpFailure(r.code,"文件服务访问被拒绝 HTTP ${r.code}");r.body?.byteStream()?.readBytesBounded(16384)};GroupConnections.phase(c,"capabilities",start)}catch(e:Exception){GroupConnections.phase(c,"capabilities",start,ConnectionBudget.classify(e));throw e}finally{GroupConnections.release(call)}
  }
  fun exchangeKnownPeer(group:String,peer:String,url:String){
    val member=servers().firstOrNull{it.first==group&&it.second==peer}?.third?:error("没有此组设备")
    val c=profile(group,peer,member,url);val auth=synchronized(this){sessions["$group:$peer:$url:${c.getString("fingerprint")}"]?.takeIf{it.expires>android.os.SystemClock.elapsedRealtime()}?.authorization}?:error("没有现存在线会话")
    val call=RhFilesConnection.client(c).newBuilder().callTimeout(minOf(1000L,GroupConnections.remaining()).coerceAtLeast(1),TimeUnit.MILLISECONDS).build().newCall(Request.Builder().url(url+"/api/v1/groups/state").header("Authorization",auth).build());GroupConnections.track(call)
    try{call.execute().use{r->if(!r.isSuccessful)throw RhFilesConnection.HttpFailure(r.code,"组设备未响应 HTTP ${r.code}");val packet=JSONObject(String(r.body!!.byteStream().readBytesBounded(280000),Charsets.UTF_8));checkPeer(group,peer);groups().importPacket(group,packet)}}finally{GroupConnections.release(call)}
  }
  fun authorization(c:JSONObject,allowDiscovered:Boolean=false):String {
    val g=groups();val group=c.getString("groupId");val peer=c.getString("groupPeerId");checkPeer(group,peer)
    val member=servers().firstOrNull{it.first==group&&it.second==peer}?.third?:error("设备组没有此电脑的服务证明")
    val server=member.getJSONObject("server");require(c.getString("fingerprint")==server.getString("fingerprint")&&(allowDiscovered||c.getString("url") in endpoints(server))){"电脑地址或身份已改变，请刷新组设备"}
    val cache="$group:$peer:${c.getString("url")}:${c.getString("fingerprint")}";val now=android.os.SystemClock.elapsedRealtime()
    synchronized(this){sessions[cache]?.takeIf{it.expires>now}?.let{return it.authorization}}
    val nonce=exchange(c,"challenge",JSONObject().put("groupId",group).put("deviceId",g.deviceId)).getString("nonce")
    val result=exchange(c,"session",JSONObject().put("groupId",group).put("nonce",nonce).put("packet",g.packet(group)).put("proof",g.proof(group,nonce,c.getString("fingerprint"))))
    try{DeviceGroupModel.verifyServerProof(result.getJSONObject("serverProof"),group,nonce,c.getString("fingerprint"),peer)}catch(e:Exception){throw GroupIdentityFailure("设备签名证明无效",e)}
    try{g.importPacket(group,result.getJSONObject("packet"))}catch(e:Exception){checkPeer(group,peer);throw GroupIdentityFailure("设备组公开证明无效",e)};checkPeer(group,peer)
    require(c.getString("url") in knownEndpoints(c)){"实际服务没有签名确认此地址"}
    val credential=result.getJSONObject("credential");val auth=Credentials.basic(credential.getString("username"),credential.getString("password"),Charsets.UTF_8)
    synchronized(this){if(sessions.size>=128)sessions.remove(sessions.keys.first());sessions[cache]=Session(auth,now+25*60*1000)};return auth
  }
  private fun refresh(remote:RemoteStorage):JSONObject {
    val cleanup=removeOrphanLocations(remote)
    val failures=JSONArray();var connected=0
    val deadline=android.os.SystemClock.elapsedRealtime()+30000;refreshDeadline.set(deadline)
    try {
    for((group,peer,member) in servers().take(32)){
      if(android.os.SystemClock.elapsedRealtime()>=deadline){failures.put(JSONObject().put("device",member.getString("name")).put("message","刷新达到 30 秒上限；已保留现有连接，可稍后重试"));break}
      var failure:Exception?=null
      try{val c=profile(group,peer,member,endpoints(member.getJSONObject("server")).first());val resolved=GroupConnections.resolve(c,"refresh",true);synchronized(this){groups().requirePeer(group,peer);for(old in profiles(remote)){if(old.optString("groupId")==group&&old.optString("groupPeerId")==peer)remote.save(old.put("url",resolved.getString("url")))}};connected++}catch(e:Exception){failure=e}
      failure?.let{failures.put(JSONObject().put("device",member.getString("name")).put("message",it.message))}
    }
    } finally {refreshDeadline.remove()}
    return JSONObject().put("connected",connected).put("locations",importLocations(remote)).put("errors",failures).also{result->cleanup.keys().forEach{result.put(it,cleanup.get(it))}}
  }
}
