package com.railgunhamster.rhfiles

import android.content.Context
import android.net.*
import okhttp3.Call
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/** Observe local link changes, not INTERNET/VALIDATED. A LAN without Internet
 * is usable. No periodic ping, resolver probe, wake lock or background scan. */
internal object ConnectionNetwork {
  private var installed=false
  val generation=AtomicLong(0)
  private val links=ConcurrentHashMap<Network,String>()
  private val pending=ConcurrentHashMap<Call,Long>()
  @Synchronized fun install(context:Context){
    if(installed)return
    val manager=context.getSystemService(Context.CONNECTIVITY_SERVICE)as ConnectivityManager
    fun signature(p:LinkProperties)=p.interfaceName+":"+p.linkAddresses.sortedBy{it.toString()}.joinToString()+":"+p.routes.sortedBy{it.toString()}.joinToString()
    // Snapshot outside callbacks. Callback arguments, never racy synchronous
    // getLinkProperties calls, are the source of subsequent updates.
    manager.allNetworks.forEach{n->manager.getLinkProperties(n)?.let{links[n]=signature(it)}}
    fun changed(){val next=generation.incrementAndGet();pending.forEach{(call,epoch)->if(epoch!=next)call.cancel()}}
    manager.registerNetworkCallback(NetworkRequest.Builder().clearCapabilities().build(),object:ConnectivityManager.NetworkCallback(){
      override fun onLinkPropertiesChanged(network:Network,properties:LinkProperties){val value=signature(properties);if(links.put(network,value)!=value)changed()}
      override fun onLost(network:Network){if(links.remove(network)!=null)changed()}
    })
    installed=true
  }
  fun track(call:Call,epoch:Long){pending[call]=epoch;if(epoch!=generation.get())call.cancel()}
  fun release(call:Call){pending.remove(call)}
}
