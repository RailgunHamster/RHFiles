package com.railgunhamster.rhfiles

import java.io.Closeable

/** Bounded, expiring read-only resources. Network work never holds the map lock.
 * A retired resource remains alive until its last borrower returns. */
internal class IdleReadPool<K,T:Closeable>(private val capacity:Int=4,private val idleMs:Long=45000,private val now:()->Long={android.os.SystemClock.elapsedRealtime()}) {
  private class Slot<T>(var touched:Long){var value:T?=null;var users=0;var retired=false}
  private val slots=linkedMapOf<K,Slot<T>>()
  private fun close(slot:Slot<T>)=synchronized(slot){val value=slot.value;slot.value=null;try{(value as? Closeable)?.close()}catch(_:Exception){}}
  fun <R> use(key:K,create:()->T,block:(T)->R):R {
    reap()
    val evicted=mutableListOf<Slot<T>>()
    val slot=synchronized(slots){
      (slots[key]?:run{
        if(slots.size>=capacity){val oldest=slots.entries.filter{it.value.users==0}.minByOrNull{it.value.touched}
          check(oldest!=null){"正在浏览的网络位置过多，请稍后重试"};slots.remove(oldest.key);oldest.value.retired=true;evicted.add(oldest.value)}
        Slot<T>(now()).also{slots[key]=it}
      }).also{it.users++}
    }
    evicted.forEach(::close)
    try{return synchronized(slot){
      val resource=slot.value?:create().also{slot.value=it}
      try{block(resource)}catch(error:Throwable){slot.value=null;try{resource.close()}catch(_:Exception){};throw error}
    }}finally{
      val dispose=synchronized(slots){slot.users--;slot.touched=now();slot.retired&&slot.users==0}
      if(dispose)close(slot)
    }
  }
  fun invalidate(matches:(K)->Boolean){
    val dispose=mutableListOf<Slot<T>>()
    synchronized(slots){val iterator=slots.iterator();while(iterator.hasNext()){val entry=iterator.next();if(matches(entry.key)){iterator.remove();entry.value.retired=true;if(entry.value.users==0)dispose.add(entry.value)}}}
    dispose.forEach(::close)
  }
  fun reap(){val cutoff=now()-idleMs;val dispose=mutableListOf<Slot<T>>()
    synchronized(slots){val iterator=slots.iterator();while(iterator.hasNext()){val entry=iterator.next();if(entry.value.users==0&&entry.value.touched<=cutoff){iterator.remove();entry.value.retired=true;dispose.add(entry.value)}}}
    dispose.forEach(::close)
  }
}
