package com.railgunhamster.rhfiles

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import java.io.IOException
import java.net.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.SecureRandom
import java.util.Locale

/** Windows-style single-label LAN names may exist in DNS, mDNS or NBNS.
 * No credentials are sent, no system DNS settings changed, no internet broadcast. */
internal object SmbHosts {
  data class Scope(val network:Network,val key:String,val links:LinkProperties,val host:String)
  private val resolver=SmbNameResolver()
  internal fun scopeKey(handle:Long,links:String)="$handle:$links"
  internal data class Route(val id:Int,val lan:Boolean=false,val vpn:Boolean=false)
  internal fun selectRoute(active:Route?,routes:List<Route>,local:Boolean):Route? =
    if(active?.vpn==true)active else if(local||active==null)routes.firstOrNull{it.lan&&!it.vpn&&it.id==active?.id}?:routes.firstOrNull{it.lan&&!it.vpn}?:active else active
  internal fun localTarget(host:String):Boolean {
    val target=host.removeSuffix(".").removeSurrounding("[","]")
    if(target.equals("localhost",true)||target.startsWith("127.")||target=="::1")return false
    if(target.isNotBlank()&&target.none{it=='.'||it==':'}&&target.any{!it.isDigit()})return true
    if(listOf(".local",".lan",".home",".home.arpa").any{target.endsWith(it,true)})return true
    val numeric=target.substringBefore('%')
    if(!numeric.matches(Regex("[0-9.]+|[0-9a-fA-F:]+")))return false
    return try{val address=InetAddress.getByName(numeric);address.isSiteLocalAddress||address.isLinkLocalAddress||
      (address is Inet6Address&&(address.address[0].toInt() and 0xfe)==0xfc)}catch(_:UnknownHostException){false}
  }
  fun network(context:Context,host:String=""):Scope {
    val manager=context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val active=manager.activeNetwork
    val networks=(manager.allNetworks.toList()+listOfNotNull(active)).distinct()
    val routes=networks.mapIndexed{index,value->
      val caps=manager.getNetworkCapabilities(value)
      Route(index,caps?.let{it.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)||it.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)}==true,
        caps?.hasTransport(NetworkCapabilities.TRANSPORT_VPN)==true)
    }
    // A Wi-Fi without Internet is still a valid NAS network. Do not force its
    // short names/private addresses over cellular, or bypass an active VPN.
    val chosen=selectRoute(routes.getOrNull(networks.indexOf(active)),routes,localTarget(host))
    val network=chosen?.let{networks[it.id]} ?: throw IOException("网络未连接，请连接服务器所在的 Wi-Fi")
    val links=manager.getLinkProperties(network) ?: throw IOException("网络正在切换，请稍后重试")
    return Scope(network,scopeKey(network.networkHandle,links.toString()),links,host)
  }
  fun requireCurrent(context:Context,scope:Scope){
    if(network(context,scope.host).key!=scope.key)throw IOException("网络已切换，请重新打开网络位置")
  }
  internal fun isLanName(host:String)=host.matches(Regex("[A-Za-z0-9_-]{1,15}"))&&host.any{!it.isDigit()}
  fun resolve(scope:Scope,host:String):SmbNameResolver.Answer {
    val lookups=mutableListOf(SmbNameResolver.Lookup(SmbNameResolver.Lane.DNS){scope.network.getAllByName(host).firstOrNull()?.hostAddress})
    if(isLanName(host)){
      // Race the fallbacks. A failing platform .local lookup can take ~10s;
      // it must not delay an NBNS answer that arrives immediately on the LAN.
      lookups.add(SmbNameResolver.Lookup(SmbNameResolver.Lane.MDNS){scope.network.getAllByName("$host.local").firstOrNull()?.hostAddress})
      lookups.add(SmbNameResolver.Lookup(SmbNameResolver.Lane.NBNS){nbns(scope,host)})
    }
    return resolver.resolve(scope.key,host,lookups)
  }
  fun forget(scope:Scope,host:String,address:String)=resolver.forget(scope.key,host,address)
  private fun nbns(scope:Scope,host:String):String? {
      val interfaces=scope.links.interfaceName?.let{NetworkInterface.getByName(it)}?.interfaceAddresses.orEmpty()
        .filter{it.address is Inet4Address&&it.broadcast!=null&&scope.links.linkAddresses.any{link->link.address==it.address}}
      if(interfaces.isEmpty())return null
      val id=SecureRandom().nextInt(65536);val query=query(host,id)
      DatagramSocket().use{socket->scope.network.bindSocket(socket);socket.broadcast=true;socket.soTimeout=150
        for(address in interfaces)try{socket.send(DatagramPacket(query,query.size,address.broadcast,137))}catch(_:Exception){}
        val end=System.nanoTime()+TimeUnitNanos;val bytes=ByteArray(1500)
        while(System.nanoTime()<end)try{
          val packet=DatagramPacket(bytes,bytes.size);socket.receive(packet);if(packet.port!=137)continue
          for(candidate in answers(bytes.copyOf(packet.length),id)){
            val raw=candidate.address
            if(interfaces.any{address->sameSubnet(address.address.address,raw,address.networkPrefixLength.toInt())})return candidate.hostAddress!!
          }
        }catch(_:SocketTimeoutException){}
      }
      return null
  }
  private const val TimeUnitNanos=1_400_000_000L
  private fun sameSubnet(a:ByteArray,b:ByteArray,prefix:Int):Boolean = a.size==4&&b.size==4&&prefix in 1..32&&(0 until prefix).all{bit->(a[bit/8].toInt() shr (7-bit%8) and 1)==(b[bit/8].toInt() shr (7-bit%8) and 1)}
  internal fun credentials(username:String,domain:String):Pair<String,String>{
    if('\\' !in username)return username to domain
    val parts=username.split('\\');require(parts.size==2&&parts.all{it.isNotBlank()}){"SMB 用户名应为 域\\用户名，或单独填写用户名和域"}
    require(domain.isBlank()||domain.equals(parts[0],true)){"SMB 用户名中的域与单独填写的域不一致"};return parts[1] to parts[0]
  }
  internal fun query(host:String,id:Int):ByteArray {
    val name=host.uppercase(Locale.ROOT).padEnd(15,' ').toByteArray(Charsets.US_ASCII)+byteArrayOf(0x20)
    val result=ByteBuffer.allocate(50).order(ByteOrder.BIG_ENDIAN);result.putShort(id.toShort()).putShort(0x0110).putShort(1).putShort(0).putShort(0).putShort(0).put(32)
    for(byte in name){result.put(('A'.code+(byte.toInt() shr 4 and 15)).toByte());result.put(('A'.code+(byte.toInt() and 15)).toByte())}
    result.put(0).putShort(0x20).putShort(1);return result.array()
  }
  internal fun answers(bytes:ByteArray,id:Int):List<InetAddress> = try{
    val b=ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN);fun u16()=b.short.toInt() and 65535
    require(u16()==id);val flags=u16();require(flags and 0x800f==0x8000);val questions=u16();val answers=u16();u16();u16();require(questions<=8&&answers<=32)
    fun skipName(){var size=0;while(true){val n=b.get().toInt() and 255;require(++size<=128);if(n==0)return;if(n and 0xc0==0xc0){b.get();return};require(n<=63);b.position(b.position()+n)}}
    repeat(questions){skipName();u16();u16()};val result=mutableListOf<InetAddress>()
    repeat(answers){skipName();val type=u16();val klass=u16();b.int;val length=u16();val start=b.position();require(length<=b.remaining())
      if(type==0x20&&klass==1&&length%6==0)repeat(length/6){u16();val raw=ByteArray(4);b.get(raw);val address=InetAddress.getByAddress(raw);if(!address.isAnyLocalAddress&&!address.isLoopbackAddress&&!address.isMulticastAddress)result.add(address)}
      b.position(start+length)
    };result
  }catch(_:Exception){emptyList()}
}
