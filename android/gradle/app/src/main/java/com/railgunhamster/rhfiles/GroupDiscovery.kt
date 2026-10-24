package com.railgunhamster.rhfiles

import android.content.Context
import android.net.nsd.*
import android.net.wifi.WifiManager
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.CountDownLatch

/** Bounded one-shot NSD; the multicast lock and callbacks always leave together. */
internal object GroupDiscovery {
  fun find(context:Context,fingerprint:String,millis:Long,cancelled:()->Boolean):List<String>{
    val nsd=context.getSystemService(Context.NSD_SERVICE)as NsdManager
    val end=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(millis.coerceIn(1,3000))
    val queue=LinkedBlockingQueue<NsdServiceInfo>(64);val found=java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
    val multicast=(context.applicationContext.getSystemService(Context.WIFI_SERVICE)as? WifiManager)?.createMulticastLock("RHFiles:group-on-demand")
    fun alive()=!cancelled()&&!Thread.currentThread().isInterrupted&&System.nanoTime()<end
    val listener=object:NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(type:String){}
      override fun onDiscoveryStopped(type:String){}
      override fun onStartDiscoveryFailed(type:String,code:Int){}
      override fun onStopDiscoveryFailed(type:String,code:Int){}
      override fun onServiceLost(info:NsdServiceInfo){}
      override fun onServiceFound(info:NsdServiceInfo){if(alive())queue.offer(info)}
    }
    var started=false
    try{
      multicast?.setReferenceCounted(false);multicast?.acquire();nsd.discoverServices("_rhfiles._tcp.",NsdManager.PROTOCOL_DNS_SD,listener);started=true
      while(alive()&&found.isEmpty()){
        val info=queue.poll(60,TimeUnit.MILLISECONDS)?:continue;val done=CountDownLatch(1)
        fun accept(service:NsdServiceInfo){if(alive())LanDiscovery.rhFilesRecord(service)?.takeIf{it.optString("fingerprint")==fingerprint}?.let{found.add(it.getString("url"))};done.countDown()}
        if(android.os.Build.VERSION.SDK_INT>=34){
          val callback=object:NsdManager.ServiceInfoCallback {
            override fun onServiceInfoCallbackRegistrationFailed(code:Int){done.countDown()}
            override fun onServiceInfoCallbackUnregistered(){}
            override fun onServiceLost(){}
            override fun onServiceUpdated(service:NsdServiceInfo){accept(service)}
          }
          try{nsd.registerServiceInfoCallback(info,java.util.concurrent.Executor{it.run()},callback);while(alive()&&!done.await(60,TimeUnit.MILLISECONDS)){} }finally{try{nsd.unregisterServiceInfoCallback(callback)}catch(_:Exception){}}
        }else{
          @Suppress("DEPRECATION") nsd.resolveService(info,object:NsdManager.ResolveListener {
            override fun onResolveFailed(service:NsdServiceInfo,code:Int){done.countDown()}
            override fun onServiceResolved(service:NsdServiceInfo){accept(service)}
          });while(alive()&&!done.await(60,TimeUnit.MILLISECONDS)){}
        }
      }
      return found.take(16)
    }finally{if(started)try{nsd.stopServiceDiscovery(listener)}catch(_:Exception){};if(multicast?.isHeld==true)multicast.release()}
  }
}
