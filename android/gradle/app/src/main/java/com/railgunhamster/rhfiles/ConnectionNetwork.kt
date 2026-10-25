package com.railgunhamster.rhfiles

import android.content.Context
import android.net.*
import okhttp3.Call
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/** Callback-fed snapshot, independent of Android so unrelated IMS/virtual
 * network churn can be regression-tested without real radios or polling. */
internal class ConnectionLinks {
  private val links=hashMapOf<String,String>()
  private val vpns=hashSetOf<String>()
  private var selected:String?=null
  @Synchronized fun update(id:String,signature:String){links[id]=signature}
  @Synchronized fun vpn(id:String,value:Boolean){if(value)vpns.add(id)else vpns.remove(id)}
  @Synchronized fun select(id:String?){selected=id}
  @Synchronized fun remove(id:String){links.remove(id);vpns.remove(id);if(selected==id)selected=null}
  @Synchronized fun signature():String=(listOfNotNull(selected)+vpns).distinct().sorted().mapNotNull{id->links[id]?.let{"$id:$it"}}.joinToString("|")
}

/** Observe local link changes, not INTERNET/VALIDATED. A LAN without Internet
 * is usable. No periodic ping, resolver probe, wake lock or background scan. */
internal object ConnectionNetwork {
  private var installed=false
  val generation=AtomicLong(0)
  private val links=ConnectionLinks()
  private val pending=ConcurrentHashMap<Call,Long>()
  @Synchronized fun install(context:Context){
    if(installed)return
    val manager=context.getSystemService(Context.CONNECTIVITY_SERVICE)as ConnectivityManager
    fun signature(p:LinkProperties)=p.interfaceName+":"+p.linkAddresses.sortedBy{it.toString()}.joinToString()+":"+p.routes.sortedBy{it.toString()}.joinToString()
    // Snapshot outside callbacks. Callback arguments, never racy synchronous
    // getLinkProperties calls, are the source of subsequent updates.
    links.select(manager.activeNetwork?.toString())
    manager.allNetworks.forEach{n->manager.getLinkProperties(n)?.let{links.update(n.toString(),signature(it))};links.vpn(n.toString(),manager.getNetworkCapabilities(n)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN)==true)}
    var previous=links.signature()
    val monitor=Any()
    fun changed(){synchronized(monitor){val nextSignature=links.signature();if(nextSignature==previous)return;previous=nextSignature;val next=generation.incrementAndGet();pending.forEach{(call,epoch)->if(epoch!=next)call.cancel()}}}
    manager.registerNetworkCallback(NetworkRequest.Builder().clearCapabilities().build(),object:ConnectivityManager.NetworkCallback(){
      override fun onCapabilitiesChanged(network:Network,caps:NetworkCapabilities){links.vpn(network.toString(),caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN));changed()}
      override fun onLinkPropertiesChanged(network:Network,properties:LinkProperties){links.update(network.toString(),signature(properties));changed()}
      override fun onLost(network:Network){links.remove(network.toString());changed()}
    })
    manager.registerDefaultNetworkCallback(object:ConnectivityManager.NetworkCallback(){
      override fun onAvailable(network:Network){links.select(network.toString());changed()}
      override fun onLinkPropertiesChanged(network:Network,properties:LinkProperties){links.update(network.toString(),signature(properties));changed()}
      override fun onLost(network:Network){links.remove(network.toString());changed()}
    })
    installed=true
  }
  fun track(call:Call,epoch:Long){pending[call]=epoch;if(epoch!=generation.get())call.cancel()}
  fun release(call:Call){pending.remove(call)}
}
