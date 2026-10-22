package com.railgunhamster.rhfiles

import android.net.nsd.NsdServiceInfo
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.net.InetAddress

@RunWith(RobolectricTestRunner::class)@Config(manifest=Config.NONE,sdk=[28])
class PairingDataTest {
  private val fp="ab".repeat(32)
  private fun rejected(block:()->Unit){try{block();fail("Unsafe pairing accepted")}catch(_:IllegalArgumentException){} }
  @Test fun scannerAndDiscoveryUseSameParser(){
    val uri=PairingData.compose("https://192.168.1.2:39128",fp,"0123456789",true)
    assertEquals("0123456789",PairingData.parse(uri).getString("code"))
    assertEquals(fp,PairingData.describe(uri).getString("fingerprint"))
    assertFalse(PairingData.describe(uri).has("password"))
  }
  @Test fun tailnetAddressesAreSupportedButPublicAndAdjacentRangesAreRejected(){
    for(host in listOf("127.0.0.1","192.168.0.1","100.64.0.0","100.127.255.255")) {
      assertTrue(PairingData.localAddress(host))
      assertEquals("https://$host:39128",PairingData.parse(PairingData.compose("https://$host:39128",fp,"0123456789",true)).getJSONArray("endpoints").getString(0))
    }
    for(host in listOf("100.63.255.255","100.128.0.0","8.8.8.8","172.32.0.1","0.0.0.0","255.255.255.255")) {
      assertFalse(PairingData.localAddress(host))
      rejected{PairingData.compose("https://$host:39128",fp,"0123456789",true)}
    }
  }
  @Test fun directlyConnectedWifiWinsOverTailnetAndVirtualAdapters(){
    val endpoints=listOf("https://100.122.230.22:39128","https://172.18.1.1:39128","https://192.168.0.110:39128")
    assertEquals(endpoints[2],PairingData.preferredEndpoints(endpoints,listOf("192.168.0.101" to 24,"127.0.0.1" to 8)).first())
    assertEquals(endpoints[0],PairingData.preferredEndpoints(endpoints,listOf("100.115.1.2" to 32,"192.168.2.2" to 24)).first())
    assertEquals(endpoints[1],PairingData.preferredEndpoints(endpoints,listOf("172.18.1.2" to 24)).first())
    assertEquals(listOf("https://localhost:39128"),PairingData.preferredEndpoints(listOf("https://localhost:39128"),emptyList()))
    assertTrue(PairingData.localAddress("localhost"));assertTrue(PairingData.localAddress("::1"))
  }
  @Test fun discoveryDoesNotSilentlyTrustAdvertisements(){
    rejected{PairingData.compose("https://192.168.1.2",fp,"0123456789",false)}
    rejected{PairingData.compose("https://192.168.1.2",fp,"123",true)}
    rejected{PairingData.compose("https://192.168.1.2","bad","0123456789",true)}
  }
  @Test fun untrustedQrCannotTriggerWebOrPublicEndpointRequests(){
    for(url in listOf("http://192.168.1.2","https://example.com","https://8.8.8.8","https://192.168.1.2/dav/","https://user:pass@192.168.1.2","https://192.168.1.2/?token=secret"))rejected{PairingData.compose(url,fp,"0123456789",true)}
    for(uri in listOf("https://example.com","rhfiles-connect:v1:"+"x".repeat(9000),"rhfiles-connect:v1:abc+def"))rejected{PairingData.parse(uri)}
  }
  @Test fun everyEndpointIsValidatedBeforeNetworkAccess(){
    val data=JSONObject().put("version",1).put("code","0123456789").put("fingerprint",fp).put("endpoints",JSONArray().put("https://192.168.1.2").put("https://evil.example"))
    val uri="rhfiles-connect:v1:"+Base64.encodeToString(data.toString().toByteArray(),Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    rejected{PairingData.parse(uri)}
  }
  @Test fun mdnsMetadataRequiresSupportedProtocolLocalAddressAndFingerprint(){
    val info=NsdServiceInfo().apply{serviceType="_rhfiles._tcp.";serviceName="My PC";host=InetAddress.getByAddress(byteArrayOf(192.toByte(),168.toByte(),1,2));port=39128;setAttribute("v","1");setAttribute("fp",fp)}
    assertEquals("https://192.168.1.2:39128",LanDiscovery.rhFilesRecord(info)!!.getString("url"))
    info.serviceType="._rhfiles._tcp.";assertNotNull(LanDiscovery.rhFilesRecord(info))
    info.setAttribute("v","2");assertNull(LanDiscovery.rhFilesRecord(info));info.setAttribute("v","1")
    info.setAttribute("fp","bad");assertNull(LanDiscovery.rhFilesRecord(info));info.setAttribute("fp",fp)
    info.port=0;assertNull(LanDiscovery.rhFilesRecord(info));info.port=39128
    info.host=InetAddress.getByAddress(byteArrayOf(8,8,8,8));assertNull(LanDiscovery.rhFilesRecord(info))
  }
}
