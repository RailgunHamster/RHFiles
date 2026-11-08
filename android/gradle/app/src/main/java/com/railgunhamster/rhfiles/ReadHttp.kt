package com.railgunhamster.rhfiles

import okhttp3.Call
import okhttp3.Response

/** Keep the owning call as in-process metadata so closing a partially read
 * preview can interrupt a blocked socket read, instead of waiting for timeout. */
internal object ReadHttp {
  fun execute(call:Call):Response {
    val response=call.execute()
    return response.newBuilder().request(response.request.newBuilder().tag(Call::class.java,call).build()).build()
  }
  fun cancel(response:Response){response.request.tag(Call::class.java)?.cancel()}
}
