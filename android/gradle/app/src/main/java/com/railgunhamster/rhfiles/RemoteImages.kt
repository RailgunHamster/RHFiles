package com.railgunhamster.rhfiles

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayOutputStream

internal class RemoteImages(private val remote:RemoteStorage) {
  @Synchronized fun read(path:String,requestedEdge:Int):JSONObject {
    if(requestedEdge<=320&&remote.isRhFiles(path))return remote.rhFilesThumbnail(path)
    val edge=requestedEdge.coerceIn(192,1920);val limit=24*1024*1024
    val bytes=remote.mediaInput(path).use{media->
      require(media.totalLength<=limit){"网络图片超过 24 MB，请下载后用外部查看器打开"}
      val output=ByteArrayOutputStream();val buffer=ByteArray(65536);var count=0
      val deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(30)
      while(true){check(System.nanoTime()<deadline){"网络图片读取超时"};val n=media.stream.read(buffer);if(n<0)break;check(n>0){"网络图片读取没有进展"};count+=n;require(count<=limit){"网络图片超过 24 MB"};output.write(buffer,0,n)};output.toByteArray()
    }
    val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
    require(bounds.outWidth>0&&bounds.outHeight>0&&bounds.outWidth.toLong()*bounds.outHeight<=200_000_000){"设备无法解码此图片"}
    val options=BitmapFactory.Options().apply{inSampleSize=1}
    while(bounds.outWidth/options.inSampleSize>edge*2||bounds.outHeight/options.inSampleSize>edge*2)options.inSampleSize*=2
    val decoded=BitmapFactory.decodeByteArray(bytes,0,bytes.size,options)?:error("设备无法解码此图片")
    val orientation=try{ExifInterface(bytes.inputStream()).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL)}catch(_:Exception){ExifInterface.ORIENTATION_NORMAL}
    val matrix=Matrix().apply{when(orientation){
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL->setScale(-1f,1f)
      ExifInterface.ORIENTATION_ROTATE_180->setRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL->setScale(1f,-1f)
      ExifInterface.ORIENTATION_TRANSPOSE->{setRotate(90f);postScale(-1f,1f)}
      ExifInterface.ORIENTATION_ROTATE_90->setRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE->{setRotate(-90f);postScale(-1f,1f)}
      ExifInterface.ORIENTATION_ROTATE_270->setRotate(-90f)
    }}
    val image=try{if(matrix.isIdentity)decoded else Bitmap.createBitmap(decoded,0,0,decoded.width,decoded.height,matrix,true)}catch(error:Throwable){decoded.recycle();throw error}
    if(image!==decoded)decoded.recycle()
    try {
      val ratio=minOf(1.0,edge.toDouble()/maxOf(image.width,image.height));val scaled=if(ratio<1)Bitmap.createScaledBitmap(image,maxOf(1,(image.width*ratio).toInt()),maxOf(1,(image.height*ratio).toInt()),true)else image
      try{val output=ByteArrayOutputStream();val alpha=scaled.hasAlpha();check(scaled.compress(if(alpha)Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG,88,output));return JSONObject().put("dataUrl","data:image/"+(if(alpha)"png"else"jpeg")+";base64,"+Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP)).put("width",scaled.width).put("height",scaled.height)}finally{if(scaled!==image)scaled.recycle()}
    }finally{image.recycle()}
  }
}
