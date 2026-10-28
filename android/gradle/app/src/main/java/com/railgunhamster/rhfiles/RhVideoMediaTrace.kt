package com.railgunhamster.rhfiles

import android.content.Context
import android.os.SystemClock
import android.util.Log
import okhttp3.Call
import okhttp3.Connection
import okhttp3.EventListener
import okhttp3.Protocol
import okhttp3.Response
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Proxy
import java.util.concurrent.atomic.AtomicLong

/** Opt-in local timing only: never log a URL, capability, bearer or filename. */
internal class RhVideoMediaTrace(private val context:Context):EventListener.Factory {
  companion object {private val sequence=AtomicLong()}
  override fun create(call:Call):EventListener {
    if(!BuildConfig.DEBUG&&!NativeAutomation.enabled(context))return EventListener.NONE
    val id=sequence.incrementAndGet();val started=SystemClock.elapsedRealtime()
    return object:EventListener(){
      private fun stage(value:String)=Log.d("RHVideoMediaTrace","call=$id stage=$value elapsedMs=${SystemClock.elapsedRealtime()-started}").let{}
      override fun callStart(call:Call)=stage("start")
      override fun connectStart(call:Call,address:InetSocketAddress,proxy:Proxy)=stage("connect-start")
      override fun connectEnd(call:Call,address:InetSocketAddress,proxy:Proxy,protocol:Protocol?)=stage("connect-end")
      override fun connectionAcquired(call:Call,connection:Connection)=stage("connection-${System.identityHashCode(connection)}")
      override fun requestHeadersEnd(call:Call,request:okhttp3.Request)=stage("request-headers")
      override fun responseHeadersStart(call:Call)=stage("response-headers-start")
      override fun responseHeadersEnd(call:Call,response:Response)=stage("response-headers-${response.code}")
      override fun responseBodyStart(call:Call)=stage("body-start")
      override fun responseBodyEnd(call:Call,byteCount:Long)=stage("body-end-$byteCount")
      override fun responseFailed(call:Call,ioe:IOException)=stage("response-failed-${ioe.javaClass.simpleName}")
      override fun callFailed(call:Call,ioe:IOException)=stage("failed-${ioe.javaClass.simpleName}")
      override fun callEnd(call:Call)=stage("end")
    }
  }
}
