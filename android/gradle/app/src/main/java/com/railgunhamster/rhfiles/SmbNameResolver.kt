package com.railgunhamster.rhfiles

import java.io.Closeable
import java.net.UnknownHostException
import java.util.Locale
import java.util.concurrent.*

/** Positive results only, scoped to an Android Network (not an SSID/local IP).
 * Platform DNS is not reliably interruptible: give DNS, mDNS and NBNS separate
 * bounded lanes so a stuck mDNS call cannot starve a working LAN lookup. */
internal class SmbNameResolver(
  private val timeoutMs:Long=4000,
  private val ttlMs:Long=300000,
  private val capacity:Int=64,
  private val now:()->Long={System.nanoTime()/1_000_000}
):Closeable {
  init{require(timeoutMs>0&&ttlMs>0&&capacity>0)}
  enum class Lane { DNS, MDNS, NBNS }
  data class Lookup(val lane:Lane,val run:()->String?)
  data class Answer(val address:String,val cached:Boolean)
  private data class Key(val network:String,val host:String)
  private data class Cached(val address:String,val expires:Long)
  private class Flight(val deadline:Long,val count:Int) {
    val result=CompletableFuture<String>()
    val jobs=mutableListOf<Future<*>>()
    var failures=0
  }
  private val lock=Any()
  private var closed=false
  private val cache=linkedMapOf<Key,Cached>()
  private val flights=mutableMapOf<Key,Flight>()
  private val workers=Lane.values().associateWith{lane->
    ThreadPoolExecutor(2,2,30,TimeUnit.SECONDS,ArrayBlockingQueue(8),{task->
      Thread(task,"RHFiles-SMB-${lane.name}").apply{isDaemon=true}
    },ThreadPoolExecutor.AbortPolicy()).apply{allowCoreThreadTimeOut(true)}
  }
  private fun key(network:String,host:String)=Key(network,host.lowercase(Locale.ROOT))
  private fun failure(host:String)=UnknownHostException("无法解析服务器 $host（名称查询失败或超时）。请确认同一 Wi-Fi，或使用服务器的局域网 IP。")
  private fun retire(key:Key,flight:Flight,error:Exception) {
    // Caller holds lock. Cancel queued jobs; running platform DNS is bounded by
    // lane size even when it ignores interruption. Late answers are discarded.
    if(flights[key]!==flight)return
    flights.remove(key);flight.result.completeExceptionally(error)
    flight.jobs.forEach{it.cancel(false)}
  }
  fun resolve(network:String,host:String,lookups:List<Lookup>):Answer {
    require(lookups.isNotEmpty())
    val key=key(network,host)
    var start=false
    val flight=synchronized(lock){
      check(!closed){"SMB resolver closed"}
      val time=now()
      cache.entries.removeAll{it.value.expires<=time}
      cache[key]?.let{return Answer(it.address,true)}
      flights.entries.toList().filter{it.value.deadline<=time}.forEach{retire(it.key,it.value,failure(it.key.host))}
      flights[key]?:run{
        if(flights.size>=32)throw failure(host)
        start=true;Flight(time+timeoutMs,lookups.size).also{flights[key]=it}
      }
    }
    if(start)for(lookup in lookups){
      synchronized(lock){
        if(flight.result.isDone)return@synchronized
        try{
          val worker=workers.getValue(lookup.lane).apply{purge()}
          flight.jobs.add(worker.submit{
            val address=try{lookup.run()?.takeIf{it.isNotBlank()}}catch(_:Exception){null}
            synchronized(lock){
              if(flights[key]!==flight)return@submit
              if(now()>=flight.deadline){retire(key,flight,failure(host));return@submit}
              if(address!=null){
                cache.remove(key)
                if(cache.size>=capacity)cache.remove(cache.keys.first())
                cache[key]=Cached(address,now()+ttlMs)
                flights.remove(key);flight.result.complete(address)
                flight.jobs.forEach{it.cancel(false)}
              }else if(++flight.failures==flight.count)retire(key,flight,failure(host))
            }
          })
        }catch(_:RejectedExecutionException){
          if(++flight.failures==flight.count)retire(key,flight,failure(host))
        }
      }
    }
    return try{
      Answer(flight.result.get((flight.deadline-now()).coerceAtLeast(1),TimeUnit.MILLISECONDS),false)
    }catch(_:TimeoutException){
      synchronized(lock){retire(key,flight,failure(host))};throw failure(host)
    }catch(error:ExecutionException){throw (error.cause as? Exception ?: failure(host))}
    catch(error:InterruptedException){Thread.currentThread().interrupt();throw java.io.InterruptedIOException("SMB 名称查询已取消").apply{initCause(error)}}
  }
  fun forget(network:String,host:String,address:String){synchronized(lock){
    val key=key(network,host)
    if(cache[key]?.address==address)cache.remove(key)
  }}
  override fun close(){synchronized(lock){
    closed=true;cache.clear();flights.entries.toList().forEach{retire(it.key,it.value,failure(it.key.host))}
    workers.values.forEach{it.shutdownNow()}
  }}
}
