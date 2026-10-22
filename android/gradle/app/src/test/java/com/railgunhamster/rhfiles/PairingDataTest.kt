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
    info.setAttribute("v","2");assertNull(LanDiscovery.rhFilesRecord(info));info.setAttribute("v","1")
    info.setAttribute("fp","bad");assertNull(LanDiscovery.rhFilesRecord(info));info.setAttribute("fp",fp)
    info.port=0;assertNull(LanDiscovery.rhFilesRecord(info));info.port=39128
    info.host=InetAddress.getByAddress(byteArrayOf(8,8,8,8));assertNull(LanDiscovery.rhFilesRecord(info))
  }
}
