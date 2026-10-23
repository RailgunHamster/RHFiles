package com.railgunhamster.rhfiles

import android.provider.Settings
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)@Config(manifest=Config.NONE,sdk=[28])
class DeviceNamesTest {
  @Test fun systemNameIsPreferredToAProductModel(){
    assertEquals("我的 OPPO",DeviceNames.choose(listOf({" 我的 OPPO "}),"OPPO","Find N"))
  }
  @Test fun actualAndroidSettingIsUsedWithoutBluetoothAccess(){
    val context=RuntimeEnvironment.getApplication()
    Settings.Global.putString(context.contentResolver,"device_name","Moto 工作手机")
    assertEquals("Moto 工作手机",DeviceNames.current(context))
  }
  @Test fun missingOrRestrictedSettingsFallThroughToTheNextSource(){
    assertEquals("vivo",DeviceNames.choose(listOf({throw SecurityException("blocked")},{" \n"},{"vivo"}),"Other","Model"))
  }
  @Test fun modelFallbackIsReadableAndDoesNotRepeatTheManufacturer(){
    assertEquals("motorola razr",DeviceNames.choose(emptyList(),"motorola","razr"))
    assertEquals("OPPO Find",DeviceNames.choose(emptyList(),"OPPO","OPPO Find"))
    assertEquals("Pixel",DeviceNames.choose(emptyList(),null,"Pixel"))
    assertEquals("Android",DeviceNames.choose(emptyList(),"unknown","unknown"))
  }
  @Test fun unicodeAndControlCharactersRespectTheSignedProtocolLimit(){
    assertEquals("我的手机",DeviceNames.normalize(" 我的\n手机\u0000 "))
    assertNull(DeviceNames.normalize(" \r\n\u0000 "))
    for(value in listOf("a".repeat(200),"中".repeat(100),"😀".repeat(100))){
      val result=DeviceNames.normalize(value)!!
      assertTrue(result.toByteArray(Charsets.UTF_8).size<=120)
      assertTrue(result.none { it.isISOControl() })
      assertFalse(result.last().isHighSurrogate())
    }
  }
}
