package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import java.io.Closeable
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class IdleReadPoolTest {
  private class Resource:Closeable {var closes=0;override fun close(){closes++}}
  @Test fun repeatedReadsReuseLiveResourcesAndIdleExpiryClosesThem(){
    var clock=0L;var opens=0;val pool=IdleReadPool<String,Resource>(2,100){clock};val resource=Resource()
    repeat(10){pool.use("a",{opens++;resource}){assertSame(resource,it)}};assertEquals(1,opens)
    clock=99;pool.reap();assertEquals(0,resource.closes);clock=100;pool.reap();assertEquals(1,resource.closes)
    pool.use("a",{opens++;Resource()}){};assertEquals(2,opens)
  }
  @Test fun lruAndExplicitInvalidationDoNotKeepOldCredentials(){
    var clock=0L;val pool=IdleReadPool<String,Resource>(2,100){clock};val a=Resource();val b=Resource()
    pool.use("a",{a}){};clock++;pool.use("b",{b}){};clock++;pool.use("a",{error("must reuse")}){}
    pool.use("c",{Resource()}){};assertEquals(1,b.closes);assertEquals(0,a.closes)
    pool.invalidate{it=="a"};assertEquals(1,a.closes)
  }
  @Test fun errorsDisposeBrokenSocketsAndNextCallCreatesFreshResource(){
    val pool=IdleReadPool<String,Resource>(now={0L});val broken=Resource()
    try{pool.use("a",{broken}){throw IOException("closed socket")};fail()}catch(_:IOException){}
    assertEquals(1,broken.closes);val fresh=Resource();pool.use("a",{fresh}){assertSame(fresh,it)}
  }
  @Test fun externallyClosedResourcesAreReplacedBeforeTheNextRead(){
    val pool=IdleReadPool<String,Resource>(reusable={it.closes==0},now={0L});val old=Resource();val fresh=Resource()
    pool.use("a",{old}){};old.close();pool.use("a",{fresh}){assertSame(fresh,it)}
    pool.use("a",{error("must reuse replacement")}){assertSame(fresh,it)}
  }
  @Test fun invalidationWaitsForBorrowerAndDoesNotCloseReplacement(){
    val pool=IdleReadPool<String,Resource>(now={0L});val a=Resource();val b=Resource();val entered=CountDownLatch(1);val release=CountDownLatch(1)
    val executor=java.util.concurrent.Executors.newSingleThreadExecutor()
    try{val work=executor.submit{pool.use("a",{a}){entered.countDown();assertTrue(release.await(5,TimeUnit.SECONDS));assertEquals(0,a.closes)}}
      assertTrue(entered.await(5,TimeUnit.SECONDS));pool.invalidate{true};assertEquals(0,a.closes)
      pool.use("a",{b}){};release.countDown();work.get(5,TimeUnit.SECONDS);assertEquals(1,a.closes);assertEquals(0,b.closes)
    }finally{release.countDown();executor.shutdownNow()}
  }
  @Test fun concurrentBorrowersReuseOneResourceWithoutNegativeLeaseCounts(){
    val pool=IdleReadPool<String,Resource>(now={0L});val resource=Resource();val entered=CountDownLatch(1);val release=CountDownLatch(1);val second=CountDownLatch(1)
    val executor=java.util.concurrent.Executors.newFixedThreadPool(2)
    try{val one=executor.submit{pool.use("a",{resource}){entered.countDown();assertTrue(release.await(5,TimeUnit.SECONDS))}};assertTrue(entered.await(5,TimeUnit.SECONDS))
      val two=executor.submit{pool.use("a",{error("duplicate factory")}){second.countDown();assertSame(resource,it)}}
      release.countDown();one.get(5,TimeUnit.SECONDS);two.get(5,TimeUnit.SECONDS);assertEquals(0L,second.count);pool.invalidate{true};assertEquals(1,resource.closes)
    }finally{release.countDown();executor.shutdownNow()}
  }
}
