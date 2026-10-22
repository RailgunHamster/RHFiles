package com.railgunhamster.rhfiles

import java.net.UnknownHostException
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.*
import org.junit.Test

class SmbNameResolverTest {
  private fun dns(run:()->String?)=SmbNameResolver.Lookup(SmbNameResolver.Lane.DNS,run)
  private fun mdns(run:()->String?)=SmbNameResolver.Lookup(SmbNameResolver.Lane.MDNS,run)
  private fun nbns(run:()->String?)=SmbNameResolver.Lookup(SmbNameResolver.Lane.NBNS,run)
  private fun failure(block:()->Unit){try{block();fail("Unresolved host accepted")}catch(_:UnknownHostException){}}

  @Test fun fastLanAnswerDoesNotWaitForStalledPlatformMdns(){
    val release=CountDownLatch(1);val started=CountDownLatch(1)
    try{SmbNameResolver().use{resolver->
      val start=System.nanoTime()
      val answer=resolver.resolve("wifi-A","SERVER-HOME",listOf(dns{null},mdns{started.countDown();release.await(10,TimeUnit.SECONDS);null},nbns{check(started.await(1,TimeUnit.SECONDS));"192.168.0.2"}))
      assertEquals("192.168.0.2",answer.address)
      assertTrue("LAN lookup was serialized behind mDNS",TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<1000)
      assertEquals(answer.address,resolver.resolve("wifi-A","server-home",listOf(dns{error("cache miss")})).address)
    }}finally{release.countDown()}
  }
  @Test fun sameHostnameOnDifferentNetworksCannotReuseAnAddress(){
    SmbNameResolver().use{resolver->
      assertEquals("192.168.0.2",resolver.resolve("wifi-A","server",listOf(dns{"192.168.0.2"})).address)
      assertEquals("192.168.0.9",resolver.resolve("wifi-B","server",listOf(dns{"192.168.0.9"})).address)
      assertTrue(resolver.resolve("wifi-A","server",listOf(dns{null})).cached)
    }
  }
  @Test fun positiveTtlExpiresButFailuresAreNeverCached(){
    var clock=0L
    SmbNameResolver(ttlMs=100,now={clock}).use{resolver->
      failure{resolver.resolve("A","server",listOf(dns{null}))}
      assertFalse(resolver.resolve("A","server",listOf(dns{"one"})).cached)
      clock=99;assertEquals("one",resolver.resolve("A","server",listOf(dns{"two"})).address)
      clock=100;assertEquals("two",resolver.resolve("A","server",listOf(dns{"two"})).address)
    }
  }
  @Test fun connectionFailureEvictsOnlyTheAddressThatActuallyFailed(){
    SmbNameResolver().use{resolver->
      resolver.resolve("A","server",listOf(dns{"old"}));resolver.forget("A","server","old")
      assertEquals("new",resolver.resolve("A","server",listOf(dns{"new"})).address)
      resolver.forget("A","server","old")
      assertTrue(resolver.resolve("A","server",listOf(dns{null})).cached)
    }
  }
  @Test fun concurrentDirectoryAndThumbnailRequestsCoalesce(){
    val calls=AtomicInteger();val entered=CountDownLatch(1);val release=CountDownLatch(1)
    val executor=Executors.newFixedThreadPool(8)
    try{SmbNameResolver().use{resolver->
      val jobs=(1..8).map{executor.submit<String>{resolver.resolve("A","server",listOf(dns{calls.incrementAndGet();entered.countDown();release.await(3,TimeUnit.SECONDS);"address"})).address}}
      assertTrue(entered.await(3,TimeUnit.SECONDS));release.countDown()
      jobs.forEach{assertEquals("address",it.get(3,TimeUnit.SECONDS))};assertEquals(1,calls.get())
    }}finally{release.countDown();executor.shutdownNow()}
  }
  @Test fun timeoutIsBoundedAndLateAnswersDoNotPoisonTheCache(){
    val release=CountDownLatch(1);val exited=CountDownLatch(1)
    try{SmbNameResolver(timeoutMs=80).use{resolver->
      val start=System.nanoTime()
      failure{resolver.resolve("A","server",listOf(dns{try{release.await(3,TimeUnit.SECONDS);"late"}finally{exited.countDown()}}))}
      assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<1000)
      release.countDown();assertTrue(exited.await(2,TimeUnit.SECONDS))
      assertEquals("fresh",resolver.resolve("A","server",listOf(dns{"fresh"})).address)
    }}finally{release.countDown()}
  }
  @Test fun saturatedDnsLanesCannotStarveNbnsOrCreateUnboundedThreads(){
    val release=CountDownLatch(1);val calls=AtomicInteger()
    try{SmbNameResolver(timeoutMs=500).use{resolver->
      repeat(24){index->
        val answer=resolver.resolve("A","server$index",listOf(dns{calls.incrementAndGet();release.await(5,TimeUnit.SECONDS);null},mdns{release.await(5,TimeUnit.SECONDS);null},nbns{"192.168.0.2"}))
        assertEquals("192.168.0.2",answer.address)
      }
      assertTrue("Unbounded DNS worker count",calls.get()<=2)
    }}finally{release.countDown()}
  }
  @Test fun allFailuresReturnPromptlyAndOneFailedLaneDoesNotMaskSuccess(){
    SmbNameResolver().use{resolver->
      val start=System.nanoTime();failure{resolver.resolve("A","missing",listOf(dns{throw UnknownHostException()},nbns{null}))}
      assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<1000)
      assertEquals("ok",resolver.resolve("A","server",listOf(dns{throw UnknownHostException()},nbns{"ok"})).address)
    }
  }
  @Test fun positiveCacheIsBounded(){
    SmbNameResolver(capacity=2).use{resolver->
      resolver.resolve("A","a",listOf(dns{"a"}));resolver.resolve("A","b",listOf(dns{"b"}));resolver.resolve("A","c",listOf(dns{"c"}))
      assertFalse(resolver.resolve("A","a",listOf(dns{"a2"})).cached)
    }
  }
  @Test fun publicDomainsIpLiteralsAndExplicitMdnsNamesAreNeverBroadcastAsNbns(){
    for(host in listOf("example.com","server.local","192.168.0.2","::1","[fe80::1]","123","a".repeat(16)))assertFalse(host,SmbHosts.isLanName(host))
    for(host in listOf("SERVER-HOME","NAS","file_server"))assertTrue(host,SmbHosts.isLanName(host))
  }
  @Test fun networkIdentityIncludesHandleAndLinkPropertiesNotJustSubnet(){
    val links="192.168.0.100/24 DNS=192.168.0.1"
    assertNotEquals(SmbHosts.scopeKey(101,links),SmbHosts.scopeKey(102,links))
    assertNotEquals(SmbHosts.scopeKey(101,links),SmbHosts.scopeKey(101,"192.168.0.100/24 DNS=192.168.0.2"))
  }
  @Test fun localNasUsesLanEvenWhenCellularIsTheDefaultButNeverBypassesVpn(){
    val mobile=SmbHosts.Route(0);val wifi=SmbHosts.Route(1,lan=true);val vpn=SmbHosts.Route(2,vpn=true)
    assertEquals(wifi,SmbHosts.selectRoute(mobile,listOf(mobile,wifi),true))
    assertEquals(mobile,SmbHosts.selectRoute(mobile,listOf(mobile,wifi),false))
    assertEquals(vpn,SmbHosts.selectRoute(vpn,listOf(wifi,vpn),true))
    assertEquals(wifi,SmbHosts.selectRoute(null,listOf(wifi),true))
    assertNull(SmbHosts.selectRoute(null,emptyList(),true))
  }
  @Test fun onlyLocalTargetsPreferLanOverTheDefaultNetwork(){
    for(host in listOf("SERVER-HOME","long-file-server-name","NAS.local","nas.local.","nas.lan","nas.home","nas.home.arpa","192.168.0.2","10.1.2.3","172.16.0.1","169.254.1.2","fd00::123","fe80::1","[fd00::1]","fe80::1%wlan0"))assertTrue(host,SmbHosts.localTarget(host))
    for(host in listOf("localhost","127.0.0.1","::1","8.8.8.8","example.com","nas.local.evil","","123"))assertFalse(host,SmbHosts.localTarget(host))
  }
}
