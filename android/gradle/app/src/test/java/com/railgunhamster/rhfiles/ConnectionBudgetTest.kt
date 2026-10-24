package com.railgunhamster.rhfiles
import org.junit.Assert.*
import org.junit.Test
class ConnectionBudgetTest {
  @Test fun duplicatesShareBudgetAcrossDiscoveryMethods(){var time=0L;val b=ConnectionBudget({time});assertNull(b.admit("https://192.168.1.2:1"));assertEquals("duplicate",b.admit("https://192.168.1.2:1/"));assertEquals(1,b.attempts)}
  @Test fun sixAttemptsAreAHardLimit(){val b=ConnectionBudget({0});repeat(6){assertNull(b.admit("https://192.168.1.${it+1}:1"))};assertEquals("budget_exhausted",b.admit("https://192.168.1.9:1"))}
  @Test fun linkChangesCannotRenewDeadline(){var time=0L;val b=ConnectionBudget({time});time=14999;assertEquals(1L,b.remaining);assertNull(b.admit("a",1));time=15000;assertEquals("budget_exhausted",b.admit("a",2));assertEquals(0L,b.remaining)}
  @Test fun addressCanBeRetriedOnANewNetworkButStillCounts(){val b=ConnectionBudget({0});assertNull(b.admit("a",1));assertNull(b.admit("a",2));assertEquals("duplicate",b.admit("a",2));assertEquals(2,b.attempts)}
  @Test fun revokedAuthorizationStopsDiscoveryButTimeoutDoesNot(){assertTrue(ConnectionBudget.terminal("http_401"));assertTrue(ConnectionBudget.terminal("http_403"));assertTrue(ConnectionBudget.terminal("authorization_revoked"));assertFalse(ConnectionBudget.terminal("timeout"));assertFalse(ConnectionBudget.terminal("identity_or_tls_failure"))}
  @Test fun timeoutIsNeverClassifiedAsConfirmedOffline(){assertEquals("timeout",ConnectionBudget.classify(java.net.SocketTimeoutException()));assertEquals("connection_rejected_or_unreachable",ConnectionBudget.classify(java.net.ConnectException()));assertEquals("http_403",ConnectionBudget.classify(RhFilesConnection.HttpFailure(403,"redacted")))}
}
