package com.railgunhamster.rhfiles

import okhttp3.Call
import okhttp3.Response
import java.io.InputStream
import java.util.concurrent.atomic.AtomicBoolean

/** Keep the owning call as in-process metadata so closing a partially read
 * preview can interrupt a blocked socket read, instead of waiting for timeout. */
internal object ReadHttp {
  fun execute(call:Call):Response {
    val response=call.execute()
    return response.newBuilder().request(response.request.newBuilder().tag(Call::class.java,call).build()).build()
  }
  fun cancel(response:Response){response.request.tag(Call::class.java)?.cancel()}
  fun stream(response:Response):InputStream {
    val source=requireNotNull(response.body).byteStream()
    return object:InputStream(){
      val closed=AtomicBoolean();val monitor=Any()
      override fun read():Int=synchronized(monitor){check(!closed.get()){"媒体流已关闭"};source.read()}
      override fun read(bytes:ByteArray,offset:Int,length:Int):Int=synchronized(monitor){check(!closed.get()){"媒体流已关闭"};source.read(bytes,offset,length)}
      override fun close(){if(closed.compareAndSet(false,true)){
        // Okio sources cannot be read and closed concurrently. Cancel the call
        // outside the read monitor to wake the socket; then release it once.
        cancel(response);synchronized(monitor){try{source.close()}finally{response.close()}}
      }}
    }
  }
}
