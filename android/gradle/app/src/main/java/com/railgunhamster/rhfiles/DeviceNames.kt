package com.railgunhamster.rhfiles

import android.content.Context
import android.os.Build
import android.provider.Settings

/** Local display default only; not a device identifier or a Bluetooth lookup. */
internal object DeviceNames {
  fun current(context:Context):String = choose(listOf(
    { Settings.Global.getString(context.contentResolver,"device_name") },
    { Settings.Secure.getString(context.contentResolver,"device_name") },
    { Settings.System.getString(context.contentResolver,"device_name") }
  ),Build.MANUFACTURER,Build.MODEL)

  internal fun choose(readers:List<()->String?>,manufacturer:String?,model:String?):String {
    for(read in readers){runCatching { normalize(read()) }.getOrNull()?.let { return it }}
    val maker=normalize(manufacturer)?.takeUnless { it.equals("unknown",true) }
    val type=normalize(model)?.takeUnless { it.equals("unknown",true) }
    val fallback=if(type!=null&&maker!=null&&!type.startsWith(maker,true)) "$maker $type" else type?:maker
    return normalize(fallback)?:"Android"
  }

  internal fun normalize(value:String?):String? {
    if(value==null)return null
    val result=StringBuilder();var bytes=0
    val points=value.trim().codePoints().iterator()
    while(points.hasNext()){
      val point=points.nextInt();if(Character.isISOControl(point))continue
      val text=String(Character.toChars(point));val size=text.toByteArray(Charsets.UTF_8).size
      if(bytes+size>120)break
      result.append(text);bytes+=size
    }
    return result.toString().trim().takeIf { it.isNotEmpty() }
  }
}
