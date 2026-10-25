package com.railgunhamster.rhfiles

import okhttp3.HttpUrl.Companion.toHttpUrl

/** Group route ranking and private-address policy. No pairing parser. */
internal object GroupAddresses {
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
    val networks=local.mapNotNull{(host,prefix)->ipv4(host)?.takeIf{prefix in 1..32&&it ushr 24!=127L}?.let{Triple(it,prefix,(0xffffffffL shl (32-prefix)) and 0xffffffffL)}}
    fun score(endpoint:String):Int {
      val ip=ipv4(endpoint.toHttpUrl().host)?:return -1
      if(ip ushr 24==127L)return -200
      val direct=networks.filter{(address,_,mask)->(address and mask)==(ip and mask)}.maxOfOrNull{1000+it.second}
      return direct?:if(tailnet(ip)){if(networks.any{tailnet(it.first)})100 else -100}else 0
    }
    return endpoints.sortedByDescending(::score)
  }
}
