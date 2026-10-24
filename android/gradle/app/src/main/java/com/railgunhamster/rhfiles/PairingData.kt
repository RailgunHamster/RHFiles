package com.railgunhamster.rhfiles

import android.util.Base64
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONArray
import org.json.JSONObject

/** One parser for camera, clipboard, discovery and scripts. No network I/O. */
internal object PairingData {
  private const val PREFIX="rhfiles-connect:v1:"
  fun parse(uri:String):JSONObject {
    require(uri.length in 20..8192&&uri.startsWith(PREFIX)){"请使用电脑端完整配对信息 / Invalid RHFiles pairing data"}
    val payload=uri.removePrefix(PREFIX)
    require(payload.matches(Regex("[A-Za-z0-9_-]+"))){"配对数据编码无效"}
    val data=JSONObject(String(Base64.decode(payload,Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP),Charsets.UTF_8))
    require(data.getInt("version")==1){"配对版本不兼容"}
    require(data.getString("code").matches(Regex("[0-9]{10}"))){"配对码必须是 10 位数字"}
    require(data.getString("fingerprint").matches(Regex("[0-9a-f]{64}"))){"电脑身份指纹无效"}
    val endpoints=data.getJSONArray("endpoints");require(endpoints.length() in 1..16){"电脑未提供可用地址"}
    for(i in 0 until endpoints.length()) {
      val endpoint=endpoints.getString(i)
      RhFilesConnection.valid(JSONObject().put("url",endpoint).put("fingerprint",data.getString("fingerprint")))
      require(localAddress(endpoint.toHttpUrl().host)){"配对地址必须是本机、局域网或 Tailscale IPv4 地址 / Local, LAN or Tailscale IPv4 address required"}
    }
    return data
  }
  internal fun localAddress(host:String):Boolean {
    if(host=="localhost"||host=="::1")return true
    val parts=host.split('.');if(parts.size!=4)return false
    val bytes=parts.map{it.toIntOrNull()?.takeIf{n->n in 0..255}?:return false}
    return bytes[0]==10||bytes[0]==127||bytes[0]==192&&bytes[1]==168||bytes[0]==172&&bytes[1] in 16..31||bytes[0]==169&&bytes[1]==254||bytes[0]==100&&bytes[1] in 64..127
  }
  /** Try the phone's directly connected subnet first. Adding a Tailnet or
   * virtual-adapter address must not add repeated 8-second waits on Wi-Fi. */
  internal fun preferredEndpoints(endpoints:List<String>,local:List<Pair<String,Int>>):List<String> {
    fun ipv4(host:String):Long? {
      val bytes=host.split('.');if(bytes.size!=4)return null
      var value=0L
      for(part in bytes){val n=part.toIntOrNull()?.takeIf{it in 0..255}?:return null;value=(value shl 8) or n.toLong()}
      return value
    }
    fun tailnet(value:Long)=value ushr 22==0x191L
    val networks=local.mapNotNull{(host,prefix)->ipv4(host)?.takeIf{prefix in 1..32}?.let{Triple(it,prefix,(0xffffffffL shl (32-prefix)) and 0xffffffffL)}}
    fun score(endpoint:String):Int {
      val ip=ipv4(endpoint.toHttpUrl().host)?:return -1
      val direct=networks.filter{(address,_,mask)->(address and mask)==(ip and mask)}.maxOfOrNull{1000+it.second}
      return direct?:if(tailnet(ip)){if(networks.any{tailnet(it.first)})100 else -100}else 0
    }
    return endpoints.sortedByDescending(::score)
  }
  fun compose(url:String,fingerprint:String,code:String,verified:Boolean):String {
    require(verified){"请先与电脑核对身份指纹 / Verify the identity on the computer first"}
    val data=JSONObject().put("version",1).put("endpoints",JSONArray().put(url)).put("fingerprint",fingerprint).put("code",code)
    val uri=PREFIX+Base64.encodeToString(data.toString().toByteArray(Charsets.UTF_8),Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    parse(uri);return uri
  }
  fun describe(uri:String):JSONObject {
    val data=parse(uri)
    // Optional display metadata for old QR compatibility; never used as trust.
    return JSONObject().put("uri",uri).put("endpoints",data.getJSONArray("endpoints")).put("fingerprint",data.getString("fingerprint"))
      .put("deviceName",DeviceNames.normalize(data.opt("deviceName") as? String))
  }
}
