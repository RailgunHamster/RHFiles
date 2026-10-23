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
  @Synchronized fun install(context:Context){if(owner==null)owner=context.applicationContext}
  @Synchronized fun invalidate(c:JSONObject){val prefix="${c.getString("groupId")}:${c.getString("groupPeerId")}:";sessions.keys.filter{it.startsWith(prefix)}.toList().forEach{sessions.remove(it)}}
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
  fun describe(uri:String)=if(uri.startsWith("rhfiles-group-"))DeviceGroupModel.inspect(uri)else PairingData.describe(uri)
  fun run(command:String,args:JSONObject,remote:RemoteStorage):Any {
    val g=groups()
    if(command=="refresh")return refresh(remote)
    val result=g.run(command,args)
    if(command=="state")(result as JSONObject).put("defaultDeviceName",DeviceNames.current(owner?:error("设备组尚未初始化")))
    if(command in listOf("remove","restore","configure","join")){synchronized(this){sessions.clear()}}
    if(command=="join")importLocations(remote)
    if(command=="remove")removeLocation(remote,args.getString("id"),args.getString("peer"))
    return result
  }
  private fun endpoints(server:JSONObject):List<String> {
    val a=server.getJSONArray("endpoints");val values=(0 until a.length()).map{a.getString(it)}
    val local=runCatching{java.net.NetworkInterface.getNetworkInterfaces().toList().flatMap{n->n.interfaceAddresses.mapNotNull{a->a.address.hostAddress?.let{it to a.networkPrefixLength.toInt()}}}}.getOrDefault(emptyList())
    return PairingData.preferredEndpoints(values,local)
  }
  private fun servers():List<Triple<String,String,JSONObject>> {
    val result=mutableListOf<Triple<String,String,JSONObject>>();val state=groups().state();val all=state.getJSONArray("groups")
    for(i in 0 until all.length()){val g=all.getJSONObject(i);val members=g.getJSONArray("members");if((0 until members.length()).any{members.getJSONObject(it).optBoolean("self")&&members.getJSONObject(it).optBoolean("blocked")})continue
      for(j in 0 until members.length()){val p=members.getJSONObject(j);if(!p.optBoolean("self")&&!p.optBoolean("blocked")&&!p.isNull("server")){result.add(Triple(g.getString("id"),p.getString("id"),p))}}}
    return result
  }
  private fun profile(group:String,peer:String,member:JSONObject,url:String)=JSONObject().put("type","rhfiles").put("name",member.getString("name")).put("url",url).put("fingerprint",member.getJSONObject("server").getString("fingerprint")).put("groupId",group).put("groupPeerId",peer)
  private fun profiles(remote:RemoteStorage):List<JSONObject>{val a=remote.backupProfiles(true);return (0 until a.length()).map{val item=a.getJSONObject(it);JSONObject(item.getJSONObject("config").toString()).put("id",item.getString("id"))}}
  private fun importLocations(remote:RemoteStorage):Int {
    var count=0;for((group,peer,member) in servers()){
      groups().requirePeer(group,peer);val old=profiles(remote).firstOrNull{it.optString("groupId")==group&&it.optString("groupPeerId")==peer}
      val candidates=endpoints(member.getJSONObject("server"));val url=old?.optString("url")?.takeIf{it in candidates}?:candidates.first();val c=profile(group,peer,member,url);old?.let{c.put("id",it.getString("id"))};remote.save(c);count++
    };return count
  }
  private fun removeLocation(remote:RemoteStorage,group:String,peer:String){for(c in profiles(remote)){if(c.optString("groupId")==group&&c.optString("groupPeerId")==peer)remote.remove(c.getString("id"),false)}}
  /** Removing the generated location is also a persistent local refusal. */
  fun removingProfile(c:JSONObject){if(c.optString("groupId").isNotEmpty()){groups().run("remove",JSONObject().put("id",c.getString("groupId")).put("peer",c.getString("groupPeerId")));synchronized(this){sessions.clear()}}}
  private fun exchange(c:JSONObject,path:String,body:JSONObject?):JSONObject {
    RhFilesConnection.valid(c)
    val remaining=refreshDeadline.get()?.let{it-android.os.SystemClock.elapsedRealtime()}?:12000L
    require(remaining>0){"本次刷新已到时间上限，请稍后再试离线设备"}
    val client=RhFilesConnection.client(c).newBuilder().callTimeout(minOf(12000L,remaining),TimeUnit.MILLISECONDS).connectTimeout(4,TimeUnit.SECONDS).build()
    val url=c.getString("url").trimEnd('/')+"/api/v1/groups/"+path
    val builder=Request.Builder().url(url)
    if(body!=null)builder.post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
    return client.newCall(builder.build()).execute().use{r->val text=String(r.body!!.byteStream().readBytesBounded(280000),Charsets.UTF_8);val result=JSONObject(text);require(r.isSuccessful){result.optJSONObject("error")?.optString("message")?:"设备组连接失败 HTTP ${r.code}"};result}
  }
  @Synchronized fun authorization(c:JSONObject):String {
    val g=groups();val group=c.getString("groupId");val peer=c.getString("groupPeerId");g.requirePeer(group,peer)
    val member=servers().firstOrNull{it.first==group&&it.second==peer}?.third?:error("设备组没有此电脑的服务证明")
    val server=member.getJSONObject("server");require(c.getString("fingerprint")==server.getString("fingerprint")&&c.getString("url") in endpoints(server)){"电脑地址或身份已改变，请刷新组设备"}
    val cache="$group:$peer:${c.getString("url")}:${c.getString("fingerprint")}";val now=android.os.SystemClock.elapsedRealtime()
    sessions[cache]?.takeIf{it.expires>now}?.let{return it.authorization}
    val nonce=exchange(c,"challenge",JSONObject().put("groupId",group).put("deviceId",g.deviceId)).getString("nonce")
    val result=exchange(c,"session",JSONObject().put("groupId",group).put("nonce",nonce).put("packet",g.packet(group)).put("proof",g.proof(group,nonce,c.getString("fingerprint"))))
    DeviceGroupModel.verifyServerProof(result.getJSONObject("serverProof"),group,nonce,c.getString("fingerprint"),peer)
    g.importPacket(group,result.getJSONObject("packet"));g.requirePeer(group,peer)
    val credential=result.getJSONObject("credential");val auth=Credentials.basic(credential.getString("username"),credential.getString("password"),Charsets.UTF_8)
    if(sessions.size>=128)sessions.remove(sessions.keys.first());sessions[cache]=Session(auth,now+25*60*1000);return auth
  }
  private fun refresh(remote:RemoteStorage):JSONObject {
    val failures=JSONArray();var connected=0
    val deadline=android.os.SystemClock.elapsedRealtime()+30000;refreshDeadline.set(deadline)
    try {
    for((group,peer,member) in servers().take(32)){
      if(android.os.SystemClock.elapsedRealtime()>=deadline){failures.put(JSONObject().put("device",member.getString("name")).put("message","刷新达到 30 秒上限；已保留现有连接，可稍后重试"));break}
      var failure:Exception?=null
      for(url in endpoints(member.getJSONObject("server")).take(4)){
        if(android.os.SystemClock.elapsedRealtime()>=deadline)break
        try{val c=profile(group,peer,member,url);synchronized(this){sessions.keys.filter{it.startsWith("$group:$peer:")}.toList().forEach{sessions.remove(it)}};authorization(c);for(old in profiles(remote)){if(old.optString("groupId")==group&&old.optString("groupPeerId")==peer){old.put("url",url);remote.save(old)}};connected++;failure=null;break}catch(e:Exception){failure=e}
      };failure?.let{failures.put(JSONObject().put("device",member.getString("name")).put("message",it.message))}
    }
    } finally {refreshDeadline.remove()}
    return JSONObject().put("connected",connected).put("locations",importLocations(remote)).put("errors",failures)
  }
}
