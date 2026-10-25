package com.railgunhamster.rhfiles
import org.junit.Assert.*
import org.junit.Test

class ConnectionPolicyTest {
  @Test fun backoffOnlyGatesDemandAndIsBounded(){assertEquals(listOf(0L,2000L,5000L,15000L,30000L,30000L),(0..5).map(ConnectionPolicy::cooldown))}
  @Test fun identityAndPermissionFailuresNeverGetWarmRetries(){for(code in listOf("http_401","http_403","identity_or_tls_failure","invalid_identity_proof","authorization_revoked"))assertFalse(ConnectionPolicy.retryable(code));assertTrue(ConnectionPolicy.retryable("timeout"))}
  @Test fun irrelevantImsAndVirtualLinksDoNotChangeTheSelectedPath(){val links=ConnectionLinks();links.select("cell");links.update("cell","rmnet0:mobile");links.update("vpn","tun1:100.90.123.86");links.vpn("vpn",true);val before=links.signature();links.update("ims","rmnet3:new-route");links.update("unused","192.168.99.1");assertEquals(before,links.signature());links.remove("ims");assertEquals(before,links.signature());links.update("cell","rmnet0:new-mobile-route");assertNotEquals(before,links.signature())}
  @Test fun aLanWithoutInternetAndAnActualVpnChangeRemainRelevant(){val links=ConnectionLinks();links.select("wifi");links.update("wifi","wlan0:192.168.1.2");val before=links.signature();assertTrue(before.contains("wlan0"));links.update("vpn","tun1:100.1.2.3");links.vpn("vpn",true);assertNotEquals(before,links.signature());links.remove("vpn");assertEquals(before,links.signature())}
  @Test fun remoteLoopbackCannotOutrankTheTailnet(){val urls=listOf("https://127.0.0.1:39128","https://192.168.0.100:39128","https://100.115.85.155:39128");assertEquals(urls[2],PairingData.preferredEndpoints(urls,listOf("127.0.0.1" to 8,"100.90.123.86" to 32)).first())}
}
