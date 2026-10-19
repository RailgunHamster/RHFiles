package com.railgunhamster.rhfiles

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.Base64
import android.util.LruCache
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/** Load on demand, not hundreds of base64 icons in the installed-app listing. */
internal class AppIcons(private val context:Context) {
  private val cache=object:LruCache<String,String>(2*1024*1024){override fun sizeOf(key:String,value:String)=value.length*2}
  @Suppress("DEPRECATION") fun read(packageName:String,requestedEdge:Int):JSONObject {
    require(packageName.length<=255&&packageName.matches(Regex("[A-Za-z0-9_.]+"))){"应用包名无效"}
    val info=context.packageManager.getPackageInfo(packageName,0);val edge=requestedEdge.coerceIn(32,96)
    val key="$packageName:${info.lastUpdateTime}:$edge"
    cache.get(key)?.let{return JSONObject(it)}
    val drawable=context.packageManager.getApplicationIcon(packageName)
    val image=Bitmap.createBitmap(edge,edge,Bitmap.Config.ARGB_8888)
    try {
      drawable.setBounds(0,0,edge,edge);drawable.draw(Canvas(image))
      val output=ByteArrayOutputStream();check(image.compress(Bitmap.CompressFormat.PNG,100,output))
      val result=JSONObject().put("dataUrl","data:image/png;base64,"+Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP)).put("width",edge).put("height",edge)
      cache.put(key,result.toString());return result
    }finally{image.recycle()}
  }
  fun clear(){cache.evictAll()}
}
