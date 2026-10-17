package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import java.net.InetAddress

class LanDiscoveryTest {
  private val id="urn:uuid:fixture"
  private fun response(types:String="pub:Computer",related:String=id)= """<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"><s:Header><a:RelatesTo>$related</a:RelatesTo></s:Header><s:Body><d:ProbeMatches><d:ProbeMatch><d:Types>$types</d:Types><d:XAddrs>http://server-home:5357/service</d:XAddrs></d:ProbeMatch></d:ProbeMatches></s:Body></s:Envelope>""".toByteArray()
  @Test fun discoveryUsesCorrelatedComputerResponsesOnly(){
    assertEquals("server-home",LanDiscovery.wsName(response(),id));assertNull(LanDiscovery.wsName(response(related="other"),id));assertNull(LanDiscovery.wsName(response(types="printer:Printer"),id))
    assertTrue(LanDiscovery.probe(id).contains(id));assertFalse(LanDiscovery.probe(id).contains("password"))
  }
  @Test fun malformedTruncatedOversizedAndExternalEntityResponsesCannotEscapeParser(){
    assertNull(LanDiscovery.wsName(ByteArray(16385),id));assertNull(LanDiscovery.wsName("<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///private'>]><x>&e;</x>".toByteArray(),id))
    val bytes=response();for(size in listOf(0,1,20,bytes.size-1))assertNull(LanDiscovery.wsName(bytes.copyOf(size),id))
  }
  @Test fun discoveryStaysOnTheLocalInterfaceSubnetForIpv4AndIpv6(){
    fun ip(s:String)=InetAddress.getByName(s).address
    assertTrue(LanDiscovery.sameSubnet(ip("192.168.1.3"),ip("192.168.1.120"),24))
    assertFalse(LanDiscovery.sameSubnet(ip("192.168.1.3"),ip("192.168.2.3"),24));assertFalse(LanDiscovery.sameSubnet(ip("192.168.1.3"),ip("8.8.8.8"),24))
    assertTrue(LanDiscovery.sameSubnet(ip("fe80::1"),ip("fe80::2"),64));assertFalse(LanDiscovery.sameSubnet(ip("fe80::1"),ip("2001:db8::1"),64))
    assertFalse(LanDiscovery.sameSubnet(ip("192.168.1.3"),ip("192.168.1.3"),0));assertFalse(LanDiscovery.sameSubnet(ip("192.168.1.3"),ip("fe80::2"),24))
  }
}
