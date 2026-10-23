package com.railgunhamster.rhfiles

import android.util.Base64
import org.json.JSONObject
import org.json.JSONArray
import java.security.*
import java.security.interfaces.ECPublicKey
import java.security.spec.*

/** Public signed introductions + strictly LOCAL refusal latch. No clocks or
 * incoming payload can clear blocked entries or change local file grants. */
internal class DeviceGroupModel(private val identity:Identity, saved:String?, private val persist:(String)->Unit) {
  interface Identity { val publicKey:String; fun sign(bytes:ByteArray):ByteArray }
  companion object {
    private val domain="RHFiles-Group-v1\u0000".toByteArray(Charsets.UTF_8)
    private val fields=setOf("v","kind","group","key","issuer","name","label","invite","nonce","seq","server")
    fun encode(bytes:ByteArray)=Base64.encodeToString(bytes,Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    fun decode(value:String):ByteArray {require(value.matches(Regex("[A-Za-z0-9_-]*"))){"设备组编码无效"};val bytes=Base64.decode(value,Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING);require(encode(bytes)==value){"设备组编码不是规范形式"};return bytes}
    fun id(key:String)=MessageDigest.getInstance("SHA-256").digest(key.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
    fun publicKey(key:PublicKey):String {
      val p=(key as ECPublicKey).w
      fun coordinate(v:java.math.BigInteger):ByteArray {val bytes=v.toByteArray().takeLast(32).toByteArray();return ByteArray(32-bytes.size)+bytes}
      return encode(byteArrayOf(4)+coordinate(p.affineX)+coordinate(p.affineY))
    }
    private fun key(value:String):PublicKey {
      val bytes=decode(value);require(bytes.size==65&&bytes[0]==4.toByte()){ "设备组公钥无效" }
      val parameters=AlgorithmParameters.getInstance("EC").apply{init(ECGenParameterSpec("secp256r1"))}.getParameterSpec(ECParameterSpec::class.java)
      val point=ECPoint(java.math.BigInteger(1,bytes.copyOfRange(1,33)),java.math.BigInteger(1,bytes.copyOfRange(33,65)))
      return KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(point,parameters))
    }
    private fun exact(v:JSONObject,keys:Set<String>){require(v.keys().asSequence().toSet()==keys){"设备组证明结构无效"}}
    fun read(s:JSONObject):JSONObject {
      exact(s,setOf("payload","signature"));require(s.getString("payload").length<=8192&&s.getString("signature").length<=128){"设备组证明过大"}
      val bytes=decode(s.getString("payload"));val c=JSONObject(String(bytes,Charsets.UTF_8));exact(c,fields)
      require(c.get("v") is Int&&c.get("invite") is Boolean&&(c.get("seq") is Int||c.get("seq") is Long)&&c.getLong("seq")>=0&&listOf("kind","group","key","issuer","name","label","nonce").all{c.get(it) is String}){"设备组字段类型无效"}
      require(c.getInt("v")==1){"不支持的设备组版本"};key(c.getString("key"))
      require(Signature.getInstance("SHA256withECDSA").run{initVerify(key(c.getString("issuer")));update(domain+bytes);verify(decode(s.getString("signature")))}){"设备组签名校验失败"}
      return c
    }
    fun packetId(p:JSONObject):String {
      exact(p,setOf("root","members","servers"));require(p.toString().toByteArray().size<=160000&&p.getJSONArray("members").length()<=128&&p.getJSONArray("servers").length()<=128){"设备组超过大小或成员上限"}
      val c=read(p.getJSONObject("root"));require(c.getString("kind")=="root"&&c.getString("group").isEmpty()&&c.getString("key")==c.getString("issuer")&&c.getBoolean("invite")&&c.isNull("server")&&decode(c.getString("nonce")).size==32&&c.getLong("seq")==0L){"设备组根证明无效"};name(c.getString("name"));name(c.getString("label"))
      return MessageDigest.getInstance("SHA-256").digest(decode(p.getJSONObject("root").getString("payload"))).joinToString(""){"%02x".format(it)}
    }
    private fun name(v:String){require(v.isNotBlank()&&v.toByteArray().size<=120&&v.none{it.isISOControl()}){"设备或组名称无效"}}
    fun uri(prefix:String,value:JSONObject)=prefix+encode(value.toString().toByteArray(Charsets.UTF_8))
    fun parse(uri:String,prefix:String):JSONObject {val value=uri.trim();require(value.length<=360000&&value.startsWith(prefix)){"设备组信息类型或大小不正确"};return JSONObject(String(decode(value.removePrefix(prefix)),Charsets.UTF_8))}
    fun inspect(uri:String):JSONObject {
      if(uri.startsWith("rhfiles-group-request:v1:")){val c=read(parse(uri,"rhfiles-group-request:v1:"));requestValid(c);return JSONObject().put("uri",uri).put("name",c.getString("name")).put("kind","request").put("deviceId",id(c.getString("key")))}
      val p=parse(uri,"rhfiles-group-approval:v1:");return JSONObject().put("uri",uri).put("name",read(p.getJSONObject("root")).getString("label")).put("kind","approval").put("groupId",packetId(p))
    }
    private fun requestValid(c:JSONObject){require(c.getString("kind")=="request"&&c.getString("key")==c.getString("issuer")&&c.getString("group").isEmpty()&&decode(c.getString("nonce")).size==32&&!c.getBoolean("invite")&&c.isNull("server")&&c.getString("label").isEmpty()&&c.getLong("seq")==0L){"入组请求无效"};name(c.getString("name"))}
    fun verifyServerProof(proof:JSONObject,group:String,nonce:String,fp:String,peer:String){
      val c=read(proof);require(c.getString("kind")=="server-auth"&&c.getString("group")==group&&c.getString("nonce")==nonce&&c.getString("label")==fp&&id(c.getString("key"))==peer&&c.getString("key")==c.getString("issuer")&&c.getString("name").isEmpty()&&!c.getBoolean("invite")&&c.isNull("server")&&c.getLong("seq")==0L){"实际电脑的设备组身份不符，已拒绝地址别名或转发"}
    }
    private fun each(a:JSONArray)= (0 until a.length()).map{a.getJSONObject(it)}
    private fun peers(g:JSONObject):LinkedHashMap<String,JSONObject> {val p=g.getJSONObject("packet");val all=listOf(p.getJSONObject("root"))+each(p.getJSONArray("members"));return linkedMapOf<String,JSONObject>().apply{all.forEach{val c=read(it);put(id(c.getString("key")),c)}}}
    private fun member(g:JSONObject,peer:String):JSONObject {require(!g.optBoolean("left")&&!g.getJSONObject("blocked").has(peer)){"本机已移除此设备，必须在本机手动确认恢复"};return peers(g)[peer]?:error("没有有效的组成员证明")}
    private fun validateServer(s:JSONObject){exact(s,setOf("endpoints","fingerprint"));val e=s.getJSONArray("endpoints");require(e.length() in 1..16){"电脑地址无效"};for(i in 0 until e.length()){RhFilesConnection.valid(JSONObject().put("url",e.getString(i)).put("fingerprint",s.getString("fingerprint")))}}
    private fun merge(g:JSONObject,incoming:JSONObject) {
      val p=g.getJSONObject("packet");val group=packetId(p);require(packetId(incoming)==group){"不是同一个设备组"}
      val accepted=peers(g);val blocked=g.getJSONObject("blocked");val pending=mutableListOf<Pair<JSONObject,JSONObject>>()
      for(cert in each(incoming.getJSONArray("members"))){val c=read(cert);require(c.getString("kind")=="member"&&c.getString("group")==group&&c.isNull("server")&&decode(c.getString("nonce")).size==32&&c.getString("label").isEmpty()&&c.getLong("seq")==0L){"成员证明无效"};name(c.getString("name"));if(!accepted.containsKey(id(c.getString("key"))))pending.add(cert to c)}
      repeat(128){val it=pending.iterator();while(it.hasNext()){val (cert,c)=it.next();val subject=id(c.getString("key"));val issuer=id(c.getString("issuer"));if(blocked.has(subject)||blocked.has(issuer)){it.remove();continue};if(accepted[issuer]?.getBoolean("invite")==true){if(!accepted.containsKey(subject)){p.getJSONArray("members").put(cert);accepted[subject]=c};it.remove()}}}
      for(cert in each(incoming.getJSONArray("servers"))){val c=read(cert);require(c.getString("kind")=="server"&&c.getString("group")==group&&c.getString("key")==c.getString("issuer")&&!c.getBoolean("invite")&&c.getString("nonce").isEmpty()&&c.getString("label").isEmpty()&&c.getLong("seq")>0){"电脑服务证明无效"};validateServer(c.getJSONObject("server"));val peer=id(c.getString("key"));if(!accepted.containsKey(peer)||blocked.has(peer))continue
        val ads=p.getJSONArray("servers");val old=(0 until ads.length()).firstOrNull{read(ads.getJSONObject(it)).getString("key")==c.getString("key")};if(old==null)ads.put(cert)else if(read(ads.getJSONObject(old)).getLong("seq")<c.getLong("seq"))ads.put(old,cert)
      };packetId(p)
    }
  }
  private var doc=if(saved==null)JSONObject().put("version",0).put("groups",JSONObject())else JSONObject(saved)
  val deviceId get()=id(identity.publicKey)
  init {require((saved?.toByteArray()?.size?:0)<=4*1024*1024&&doc.getJSONObject("groups").length()<=16){"设备组记录过大"};doc.getJSONObject("groups").keys().forEach{require(packetId(doc.getJSONObject("groups").getJSONObject(it).getJSONObject("packet"))==it){"设备组记录损坏，不会忽略本机移除记录"}}}
  private fun group(d:JSONObject,id:String)=d.getJSONObject("groups").optJSONObject(id)?:error("本机没有加入此设备组")
  private fun refusals(d:JSONObject)=d.optJSONObject("refusals")?:JSONObject().also{d.put("refusals",it)}
  private fun inheritRefusals(d:JSONObject){val all=d.getJSONObject("groups");all.keys().forEach{key->val blocked=all.getJSONObject(key).getJSONObject("blocked");refusals(d).keys().forEach{blocked.put(it,refusals(d).get(it))}}}
  private fun change(run:(JSONObject)->Any):Any {val next=JSONObject(doc.toString());inheritRefusals(next);val result=run(next);inheritRefusals(next);next.put("version",Math.addExact(next.getLong("version"),1));val text=next.toString();require(text.toByteArray().size<=4*1024*1024){"设备组记录过大"};persist(text);doc=next;return result}
  private fun claims(kind:String,name:String="")=JSONObject().put("v",1).put("kind",kind).put("group","").put("key",identity.publicKey).put("issuer",identity.publicKey).put("name",name).put("label","").put("invite",false).put("nonce","").put("seq",0).put("server",JSONObject.NULL)
  private fun sign(c:JSONObject):JSONObject {val bytes=c.toString().toByteArray(Charsets.UTF_8);return JSONObject().put("payload",encode(bytes)).put("signature",encode(identity.sign(domain+bytes)))}
  private fun nonce()=encode(ByteArray(32).also{SecureRandom().nextBytes(it)})
  private fun grant(args:JSONObject)=JSONObject().put("write",args.optJSONObject("permissions")?.optBoolean("write")==true).put("delete",args.optJSONObject("permissions")?.optBoolean("delete")==true)
  @Synchronized fun packet(id:String):JSONObject {val g=group(doc,id);member(g,deviceId);return JSONObject(g.getJSONObject("packet").toString())}
  @Synchronized fun requirePeer(id:String,peer:String):JSONObject {val g=group(doc,id);member(g,deviceId);member(g,peer);return JSONObject(g.getJSONObject("permissions").toString())}
  @Synchronized fun importPacket(id:String,p:JSONObject){change{val g=group(it,id);member(g,deviceId);merge(g,p);true}}
  @Synchronized fun proof(id:String,nonce:String,fp:String):JSONObject {requirePeer(id,deviceId);require(decode(nonce).size==32&&fp.matches(Regex("[0-9a-f]{64}"))){"身份挑战无效"};return sign(claims("auth").put("group",id).put("nonce",nonce).put("label",fp))}
  @Synchronized fun state():JSONObject {
    val out=JSONArray();val groups=doc.getJSONObject("groups");groups.keys().forEach{id->val g=groups.getJSONObject(id);val members=JSONArray();peers(g).forEach{(peer,c)->val blocked=g.getJSONObject("blocked");val server=each(g.getJSONObject("packet").getJSONArray("servers")).map(::read).firstOrNull{it.getString("key")==c.getString("key")}?.optJSONObject("server");members.put(JSONObject().put("id",peer).put("name",c.getString("name")).put("canInvite",c.getBoolean("invite")).put("blocked",blocked.has(peer)).put("removedAt",blocked.optJSONObject(peer)?.optLong("removedAt")?:JSONObject.NULL).put("self",peer==deviceId).put("server",server?:JSONObject.NULL))};out.put(JSONObject().put("id",id).put("name",read(g.getJSONObject("packet").getJSONObject("root")).getString("label")).put("permissions",g.getJSONObject("permissions")).put("enabled",g.getBoolean("enabled")).put("left",g.optBoolean("left")).put("members",members))};return JSONObject().put("deviceId",deviceId).put("version",doc.getLong("version")).put("groups",out)
  }
  @Synchronized fun run(command:String,args:JSONObject):Any = when(command) {
    "state"->state()
    "request"->{val n=args.getString("deviceName");name(n);val c=claims("request",n).put("nonce",nonce());val signed=sign(c);change{it.put("pending",c.getString("nonce"));JSONObject().put("uri",uri("rhfiles-group-request:v1:",signed))}}
    "create"->{
      val n=args.getString("deviceName");val label=args.getString("name");name(n);name(label)
      val p=JSONObject().put("root",sign(claims("root",n).put("label",label).put("invite",true).put("nonce",nonce()))).put("members",JSONArray()).put("servers",JSONArray());val id=packetId(p)
      change{require(it.getJSONObject("groups").length()<16){"最多加入 16 个设备组"};it.getJSONObject("groups").put(id,JSONObject().put("packet",p).put("blocked",JSONObject(refusals(it).toString())).put("permissions",grant(args)).put("enabled",true).put("left",false));id}
    }
    "approve"->{
      val req=read(parse(args.getString("uri"),"rhfiles-group-request:v1:"));requestValid(req)
      change{val g=group(it,args.getString("id"));require(member(g,deviceId).getBoolean("invite")){"本机没有邀请权限"};val subject=id(req.getString("key"));require(!g.getJSONObject("blocked").has(subject)){"本机曾移除此设备，请先手动确认恢复"}
        val invite=peers(g)[subject]?.getBoolean("invite")?:args.optBoolean("canInvite");val p=JSONObject(g.getJSONObject("packet").toString());val certs=JSONArray(each(p.getJSONArray("members")).filter{ id(read(it).getString("key"))!=subject });p.put("members",certs)
        certs.put(sign(claims("member",req.getString("name")).put("key",req.getString("key")).put("group",args.getString("id")).put("nonce",req.getString("nonce")).put("invite",invite)));merge(g,p);JSONObject().put("uri",uri("rhfiles-group-approval:v1:",p))}
    }
    "join"->{
      require(args.optBoolean("confirmed")){"请在本机确认信任入组证明的来源"};val p=parse(args.getString("uri"),"rhfiles-group-approval:v1:");val id=packetId(p)
      change{val all=it.getJSONObject("groups");val old=all.optJSONObject(id)
        if(old!=null){member(old,deviceId);merge(old,p)}else{
          require(all.length()<16){"最多加入 16 个设备组"}
          val own=each(p.getJSONArray("members")).map(::read).firstOrNull{it.getString("key")==identity.publicKey}?:error("证明中没有本机身份")
          require(it.optString("pending").isNotEmpty()&&own.getString("nonce")==it.optString("pending")){"不是本机当前入组请求的批准，请重新生成请求"}
          val g=JSONObject().put("packet",JSONObject().put("root",p.getJSONObject("root")).put("members",JSONArray()).put("servers",JSONArray())).put("blocked",JSONObject(refusals(it).toString())).put("permissions",grant(args)).put("enabled",true).put("left",false)
          // Only a fresh, explicitly confirmed join restores our membership
          // here. Keep other groups' blocks and every other device's refusal.
          g.getJSONObject("blocked").remove(deviceId)
          merge(g,p);member(g,deviceId);all.put(id,g);refusals(it).remove(deviceId);it.remove("pending")
        };id
      }
    }
    "export"->JSONObject().put("uri",uri("rhfiles-group-approval:v1:",packet(args.getString("id"))))
    "forget"->{require(args.opt("confirmed")==true){"删除本机设备组必须明确确认"};change{val id=args.getString("id");group(it,id);it.getJSONObject("groups").remove(id);true}}
    "remove"->change{val g=group(it,args.getString("id"));val peer=args.getString("peer");require(peers(g).containsKey(peer)){"成员不存在"};refusals(it).put(peer,JSONObject().put("removedAt",System.currentTimeMillis()).put("version",Math.addExact(it.getLong("version"),1)));true}
    "restore"->{require(args.optBoolean("confirmed")){"恢复访问必须在本机手动确认"};change{val peer=args.getString("peer");require(group(it,args.getString("id")).getJSONObject("blocked").has(peer)){"此设备不在本机移除列表中"};refusals(it).remove(peer);val all=it.getJSONObject("groups");all.keys().forEach{key->all.getJSONObject(key).getJSONObject("blocked").remove(peer)};true}}
    "configure"->change{val g=group(it,args.getString("id"));g.put("enabled",args.optBoolean("enabled")).put("permissions",grant(args));true}
    else->error("未知设备组操作")
  }
}
