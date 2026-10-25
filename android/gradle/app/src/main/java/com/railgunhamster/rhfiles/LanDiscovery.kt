package com.railgunhamster.rhfiles

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.Closeable
import java.net.*
import java.util.UUID
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean
import javax.xml.parsers.DocumentBuilderFactory

/** Short, opt-in discovery only. No login attempts, port sweep, or metadata fetch. */
class LanDiscovery(private val context:Context):Closeable {
  private class Scan(val protocol:String) {
    val stopped=AtomicBoolean(false);val running=AtomicBoolean(true)
    val devices=ConcurrentHashMap<String,JSONObject>();val errors=CopyOnWriteArrayList<String>()
  }
  private val scans=linkedMapOf<String,Scan>()
  @Synchronized fun start(protocol:String="smb"):String {
    require(protocol in listOf("smb","rhfiles")){"不支持的发现协议"}
    while(scans.size>=2){val key=scans.keys.first();scans.remove(key)?.stopped?.set(true)}
    val id=UUID.randomUUID().toString();val scan=Scan(protocol);scans[id]=scan
    Thread({run(scan)},"RHFiles-LAN").apply{isDaemon=true;start()};return id
  }
  @Synchronized fun state(id:String):JSONObject {
    val scan=scans[id]?:error("发现任务已结束，请重新扫描")
    return JSONObject().put("running",scan.running.get()).put("devices",JSONArray(scan.devices.values.sortedBy{it.optString("host")}))
      .put("warnings",JSONArray(scan.errors.distinct()))
  }
  @Synchronized fun stop(id:String){scans[id]?.stopped?.set(true)}
  @Synchronized override fun close(){scans.values.forEach{it.stopped.set(true)};scans.clear()}
  private fun run(scan:Scan) {
    var multicast:WifiManager.MulticastLock?=null;var workers:ExecutorService?=null
    try {
      val interfaces=NetworkInterface.getNetworkInterfaces().toList().filter{it.isUp&&!it.isLoopback&&!it.isPointToPoint}
      val addresses=interfaces.flatMap{it.interfaceAddresses}.filter{!it.address.isLoopbackAddress&&!it.address.isAnyLocalAddress}
      require(addresses.isNotEmpty()){"没有可用的局域网接口，请连接 Wi-Fi 或以太网"}
      multicast=(context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager)?.createMulticastLock("RHFiles:discovery")?.apply{setReferenceCounted(false);acquire()}
      val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(8)
      fun alive()=!scan.stopped.get()&&System.nanoTime()<deadline
      fun add(host:InetAddress,port:Int,name:String,source:String,fingerprint:String?=null){
        if(!alive()||!addresses.any{sameSubnet(it.address.address,host.address,it.networkPrefixLength.toInt())}||port !in 1..65535)return
        val address=host.hostAddress?:return;val key="$address:$port"
        synchronized(scan){
          if(scan.devices.size>=256&&!scan.devices.containsKey(key)){scan.errors.addIfAbsent("发现结果达到 256 项上限，请缩小局域网范围或手动添加");return}
          scan.devices.compute(key){_,previous->JSONObject().put("host",address).put("port",port).put("type",scan.protocol).apply{if(fingerprint!=null)put("fingerprint",fingerprint)}
            .put("name",if(source=="mDNS"||previous==null)name.take(100) else previous.optString("name"))
            .put("source",if(previous==null)source else (previous.optString("source")+" / "+source).split(" / ").distinct().joinToString(" / "))}
        }
      }
      val ipv4=if(scan.protocol=="smb")interfaces.flatMap{iface->iface.interfaceAddresses.filter{it.address is Inet4Address}.map{iface to it}}.take(4) else emptyList()
      workers=Executors.newFixedThreadPool(1+ipv4.size)
      val tasks=mutableListOf<Future<*>>()
      tasks+=workers.submit{
        val nsd=context.getSystemService(Context.NSD_SERVICE) as NsdManager
        val queue=LinkedBlockingQueue<NsdServiceInfo>(128)
        val listener=object:NsdManager.DiscoveryListener {
          override fun onDiscoveryStarted(type:String){}
          override fun onDiscoveryStopped(type:String){}
          override fun onStartDiscoveryFailed(type:String,code:Int){scan.errors.add("mDNS 发现失败：$code")}
          override fun onStopDiscoveryFailed(type:String,code:Int){}
          override fun onServiceLost(info:NsdServiceInfo){}
          override fun onServiceFound(info:NsdServiceInfo){if(alive())queue.offer(info)}
        }
        var started=false
        try {
          nsd.discoverServices(if(scan.protocol=="rhfiles")"_rhfiles._tcp." else "_smb._tcp.",NsdManager.PROTOCOL_DNS_SD,listener);started=true
          while(alive()){
            val info=queue.poll(150,TimeUnit.MILLISECONDS)?:continue;val done=CountDownLatch(1)
            if(scan.protocol=="rhfiles"&&android.os.Build.VERSION.SDK_INT>=34){
              // Legacy resolveService may return only the first (IPv6) address.
              // Keep the modern callback until a usable IPv4 update arrives.
              val callback=object:NsdManager.ServiceInfoCallback {
                override fun onServiceInfoCallbackRegistrationFailed(code:Int){scan.errors.addIfAbsent("mDNS 地址解析失败：$code");done.countDown()}
                override fun onServiceInfoCallbackUnregistered(){}
                override fun onServiceLost(){}
                override fun onServiceUpdated(service:NsdServiceInfo){rhFilesRecord(service)?.let{value->rhFilesAddress(service)?.let{add(it,service.port,value.getString("name"),"mDNS",value.getString("fingerprint"));done.countDown()}}}
              }
              try {
                nsd.registerServiceInfoCallback(info,java.util.concurrent.Executor{it.run()},callback)
                val until=minOf(deadline,System.nanoTime()+TimeUnit.SECONDS.toNanos(3))
                while(alive()&&System.nanoTime()<until&&!done.await(100,TimeUnit.MILLISECONDS)){}
              }finally{try{nsd.unregisterServiceInfoCallback(callback)}catch(_:Exception){}}
              continue
            }
            @Suppress("DEPRECATION")
            nsd.resolveService(info,object:NsdManager.ResolveListener {
              override fun onResolveFailed(service:NsdServiceInfo,code:Int){done.countDown()}
              override fun onServiceResolved(service:NsdServiceInfo){
                if(scan.protocol=="rhfiles")rhFilesRecord(service)?.let{value->rhFilesAddress(service)?.let{add(it,service.port,value.getString("name"),"mDNS",value.getString("fingerprint"))}}
                else service.host?.let{add(it,service.port,service.serviceName,"mDNS")}
                done.countDown()
              }
            })
            while(alive()&&!done.await(100,TimeUnit.MILLISECONDS)){}
          }
        }catch(e:Exception){if(!scan.stopped.get())scan.errors.add("mDNS：${e.javaClass.simpleName}")}
        finally{if(started)try{nsd.stopServiceDiscovery(listener)}catch(_:Exception){}}
      }
      for((iface,address) in ipv4)tasks+=workers.submit{
        try {
          MulticastSocket(null).use{socket->
            socket.bind(InetSocketAddress(address.address,0));socket.networkInterface=iface;socket.timeToLive=1;socket.soTimeout=250
            val message="urn:uuid:"+UUID.randomUUID();val bytes=probe(message).toByteArray(Charsets.UTF_8)
            socket.send(DatagramPacket(bytes,bytes.size,InetAddress.getByName("239.255.255.250"),3702))
            while(alive())try {
              val packet=DatagramPacket(ByteArray(16384),16384);socket.receive(packet)
              if(sameSubnet(address.address.address,packet.address.address,address.networkPrefixLength.toInt())){
                val name=wsName(packet.data.copyOf(packet.length),message)?:continue;add(packet.address,445,name.ifBlank{packet.address.hostAddress?:"SMB 设备"},"WS-Discovery")
              }
            }catch(_:SocketTimeoutException){}
          }
        }catch(e:Exception){if(!scan.stopped.get())scan.errors.add("WS-Discovery：${e.javaClass.simpleName}")}
      }
      for(task in tasks)try{task.get((deadline-System.nanoTime()+TimeUnit.SECONDS.toNanos(1)).coerceAtLeast(1),TimeUnit.NANOSECONDS)}catch(_:Exception){task.cancel(true)}
    }catch(e:Exception){scan.errors.add(e.message?:e.javaClass.simpleName)}
    finally{scan.stopped.set(true);workers?.shutdownNow();if(multicast?.isHeld==true)multicast.release();scan.running.set(false)}
  }
  companion object {
    @Suppress("DEPRECATION") internal fun rhFilesAddress(info:NsdServiceInfo):InetAddress?=
      if(android.os.Build.VERSION.SDK_INT>=34)info.hostAddresses.firstOrNull{it is Inet4Address} else info.host?.takeIf{it is Inet4Address}
    internal fun rhFilesRecord(info:NsdServiceInfo):JSONObject?=try {
      require(info.serviceType.trim('.') in setOf("_rhfiles._tcp","_rhfiles._tcp.local"))
      val address=rhFilesAddress(info)?.hostAddress?:return null
      require(GroupAddresses.localAddress(address)&&info.port in 1..65535)
      require(info.attributes["v"]?.toString(Charsets.UTF_8)=="1")
      val fp=info.attributes["fp"]?.toString(Charsets.UTF_8)?:return null
      require(fp.matches(Regex("[0-9a-f]{64}")))
      val name=DeviceNames.normalize(info.attributes["name"]?.toString(Charsets.UTF_8))?:DeviceNames.normalize(info.serviceName)?:address
      JSONObject().put("name",name).put("url","https://$address:${info.port}").put("fingerprint",fp)
    }catch(_:Exception){null}
    internal fun sameSubnet(a:ByteArray,b:ByteArray,prefix:Int)=a.size==b.size&&prefix in 1..a.size*8&&(0 until prefix).all{bit->(a[bit/8].toInt() shr (7-bit%8) and 1)==(b[bit/8].toInt() shr (7-bit%8) and 1)}
    internal fun probe(id:String)="""<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:p="http://schemas.xmlsoap.org/ws/2006/02/devprof"><s:Header><a:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action><a:MessageID>$id</a:MessageID><a:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To></s:Header><s:Body><d:Probe><d:Types>p:Device</d:Types></d:Probe></s:Body></s:Envelope>"""
    internal fun wsName(bytes:ByteArray,id:String):String?=try{
      require(bytes.size<=16384)
      val factory=DocumentBuilderFactory.newInstance().apply{isNamespaceAware=true;setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);setFeature("http://xml.org/sax/features/external-general-entities",false);setFeature("http://xml.org/sax/features/external-parameter-entities",false)}
      val doc=factory.newDocumentBuilder().parse(ByteArrayInputStream(bytes))
      fun text(name:String)=doc.getElementsByTagNameNS("*",name).item(0)?.textContent?:""
      require(text("RelatesTo")==id&&doc.getElementsByTagNameNS("http://schemas.xmlsoap.org/ws/2005/04/discovery","ProbeMatch").length>0)
      require(text("Types").split(Regex("\\s+")).any{it.substringAfter(':')=="Computer"})
      text("XAddrs").split(Regex("\\s+")).firstNotNullOfOrNull{try{URI(it).host?.takeIf{host->host.length<=253}}catch(_:Exception){null}}?:""
    }catch(_:Exception){null}
  }
}
