package com.railgunhamster.rhfiles

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.NetworkInfo
import java.io.IOException
import java.net.InetAddress
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowNetworkInfo
import org.robolectric.util.ReflectionHelpers
import org.robolectric.util.ReflectionHelpers.ClassParameter

@RunWith(RobolectricTestRunner::class) @Config(manifest=Config.NONE,sdk=[28])
class SmbNetworkScopeTest {
  private val context get()=RuntimeEnvironment.getApplication()
  @Suppress("DEPRECATION")
  @Test fun dnsAndLinkChangesRejectOldAuthenticationScope(){
    val manager=context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val shadow=shadowOf(manager)
    shadow.setActiveNetworkInfo(ShadowNetworkInfo.newInstance(NetworkInfo.DetailedState.CONNECTED,ConnectivityManager.TYPE_WIFI,0,true,true))
    val network=manager.activeNetwork!!
    fun links(dns:String)=LinkProperties().apply{
      interfaceName="wlan0"
      ReflectionHelpers.callInstanceMethod<Boolean>(this,"addDnsServer",ClassParameter.from(InetAddress::class.java,InetAddress.getByName(dns)))
    }
    shadow.setLinkProperties(network,links("192.168.0.1"))
    val first=SmbHosts.network(context);SmbHosts.requireCurrent(context,first)
    shadow.setLinkProperties(network,links("192.168.0.2"))
    assertNotEquals(first.key,SmbHosts.network(context).key)
    try{SmbHosts.requireCurrent(context,first);fail("Old network accepted")}catch(_:IOException){}
    shadow.setActiveNetworkInfo(null)
    try{SmbHosts.network(context);fail("Offline scope accepted")}catch(_:IOException){}
  }
}
