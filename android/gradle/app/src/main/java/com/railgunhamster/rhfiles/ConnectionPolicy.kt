package com.railgunhamster.rhfiles

/** Demand-driven policy shared by all callers. These are caps, not timers that
 * wake the application. A retry consumes the original round's attempt/deadline. */
internal object ConnectionPolicy {
  const val COLD_ATTEMPT_MS=6000L
  const val NORMAL_ATTEMPT_MS=3000L
  const val MANUAL_INTERVAL_MS=3000L
  fun cooldown(failures:Int)=when(failures){0->0L;1->2000L;2->5000L;3->15000L;else->30000L}
  fun retryable(code:String)=code in setOf("timeout","cancelled_or_timeout","transport_error","connection_rejected_or_unreachable","response_interrupted")
  fun loopback(url:String)=runCatching{val host=java.net.URI(url).host;host=="localhost"||host=="::1"||host?.startsWith("127.")==true}.getOrDefault(false)
  fun routeType(url:String)=if(loopback(url))"loopback" else if(runCatching{java.net.URI(url).host.split('.').let{it[0]=="100"&&it[1].toInt() in 64..127}}.getOrDefault(false))"tailscale_address" else "lan_address"
}
