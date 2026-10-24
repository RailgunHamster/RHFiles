package com.railgunhamster.rhfiles

internal class GroupIdentityFailure(message:String,cause:Throwable?=null):java.io.IOException(message,cause)

/** Pure policy, fake-clock testable. Never reset the deadline on Wi-Fi events. */
internal class ConnectionBudget(private val clock:()->Long= {System.nanoTime()/1_000_000},val total:Long=15_000,val maxAttempts:Int=6) {
  private val start=clock()
  private val seen=hashSetOf<String>()
  var attempts=0;private set
  val remaining get()=(total-(clock()-start)).coerceAtLeast(0)
  val elapsed get()=(clock()-start).coerceAtLeast(0)
  fun admit(url:String,generation:Long=0):String? {
    val key=url.trimEnd('/')+"@$generation"
    if(key in seen)return "duplicate"
    if(remaining<=0||attempts>=maxAttempts)return "budget_exhausted"
    seen.add(key);attempts++;return null
  }
  companion object {
    fun terminal(code:String)=code in setOf("http_401","http_403","authorization_revoked","invalid_identity_proof")
    fun classify(error:Exception):String=when(error){
      is RhFilesConnection.HttpFailure->"http_${error.status}"
      is GroupIdentityFailure->"invalid_identity_proof"
      is javax.net.ssl.SSLException->"identity_or_tls_failure"
      is java.net.SocketTimeoutException->"timeout"
      is java.net.ConnectException->"connection_rejected_or_unreachable"
      is java.io.InterruptedIOException->"cancelled_or_timeout"
      is SecurityException->"authorization_revoked"
      is IllegalArgumentException,is IllegalStateException,is org.json.JSONException->"invalid_response"
      else->"transport_error"
    }
  }
}
