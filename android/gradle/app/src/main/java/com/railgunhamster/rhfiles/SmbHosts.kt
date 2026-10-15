package com.railgunhamster.rhfiles

import java.net.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.SecureRandom
import java.util.Locale

/** DNS first; Windows-style single-label LAN names may instead exist in NBNS.
 * No credentials are sent, no system DNS settings changed, no internet broadcast. */
internal object SmbHosts {
  fun resolve(host:String):String {
    try{return InetAddress.getByName(host).hostAddress!!}catch(original:UnknownHostException){
      if(!host.matches(Regex("[A-Za-z0-9_-]{1,15}")))throw original
      // Modern Android also resolves .local through the platform mDNS resolver.
      try{return InetAddress.getByName("$host.local").hostAddress!!}catch(_:UnknownHostException){}
      val interfaces=NetworkInterface.getNetworkInterfaces().toList().filter{it.isUp&&!it.isLoopback}.flatMap{it.interfaceAddresses}.filter{it.address is Inet4Address && it.broadcast!=null}
      if(interfaces.isEmpty())throw original
      val id=SecureRandom().nextInt(65536);val query=query(host,id)
      DatagramSocket().use{socket->socket.broadcast=true;socket.soTimeout=350
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
      throw UnknownHostException("无法解析服务器 $host（DNS 和局域网名称查询均未找到）。请确认同一 Wi-Fi，或把更新目录和 SMB 登录配置中的服务器名改为服务器的局域网 IP。").apply{initCause(original)}
    }
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
