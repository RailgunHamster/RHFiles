package com.railgunhamster.rhfiles

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.media.ThumbnailUtils
import android.os.Build
import android.os.CancellationSignal
import android.util.Base64
import android.util.Size
import android.util.LruCache
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Uses system thumbnail codecs, not an entire media file loaded into WebView. */
class MediaThumbnails(private val storage:NativeStorage){
  private val cache=object:LruCache<String,String>(4*1024*1024){override fun sizeOf(key:String,value:String)=value.length*2}
  private val timers=Executors.newSingleThreadScheduledExecutor()
  fun close(){timers.shutdownNow();cache.evictAll()}
  fun read(path:String,requestedEdge:Int):JSONObject {
    if(storage.isRemote(path)&&storage.remote.isRhFiles(path))return storage.remote.rhFilesThumbnail(path)
    require(!storage.isRemote(path)){"此网络协议暂不支持服务端缩略图"}
    val entry=storage.stat(path);require(!entry.isDir){"不是媒体文件"}
    val edge=requestedEdge.coerceIn(48,192);val kind=NativeEntry.kind(entry.name)
    require(kind in listOf("image","video")){"没有可用的媒体缩略图"}
    val key="$path:${entry.modified}:${entry.size}:$edge"
    cache.get(key)?.let{return JSONObject(it)}
    val signal=CancellationSignal();val timeout=timers.schedule({signal.cancel()},3,TimeUnit.SECONDS)
    try {
      val bitmap=if(storage.isDocument(path)) {
        if(Build.VERSION.SDK_INT>=29)storage.context.contentResolver.loadThumbnail(storage.docUri(path),Size(edge,edge),signal)
        else android.provider.DocumentsContract.getDocumentThumbnail(storage.context.contentResolver,storage.docUri(path),android.graphics.Point(edge,edge),signal)
      }else{
        val file=storage.local(path)
        if(Build.VERSION.SDK_INT>=29){if(kind=="video")ThumbnailUtils.createVideoThumbnail(file,Size(edge,edge),signal)else ThumbnailUtils.createImageThumbnail(file,Size(edge,edge),signal)}
        else if(kind=="video") {
          val reader=MediaMetadataRetriever()
          try{reader.setDataSource(file.path);if(Build.VERSION.SDK_INT>=27)reader.getScaledFrameAtTime(-1,MediaMetadataRetriever.OPTION_CLOSEST_SYNC,edge,edge)else reader.getFrameAtTime(-1)}finally{reader.release()}
        }else{
          val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(file.path,bounds)
          require(bounds.outWidth>0&&bounds.outHeight>0){"无法读取图片"}
          val options=BitmapFactory.Options();while(bounds.outWidth/options.inSampleSize.coerceAtLeast(1)>edge*2||bounds.outHeight/options.inSampleSize.coerceAtLeast(1)>edge*2)options.inSampleSize=options.inSampleSize.coerceAtLeast(1)*2
          BitmapFactory.decodeFile(file.path,options)
        }
      } ?: error("设备未能生成此格式的缩略图")
      try{
        signal.throwIfCanceled();val ratio=minOf(1.0,edge.toDouble()/maxOf(bitmap.width,bitmap.height))
        val scaled=if(ratio<1)Bitmap.createScaledBitmap(bitmap,maxOf(1,(bitmap.width*ratio).toInt()),maxOf(1,(bitmap.height*ratio).toInt()),true)else bitmap
        try{val bytes=ByteArrayOutputStream();check(scaled.compress(Bitmap.CompressFormat.JPEG,75,bytes)){"缩略图编码失败"};val result=JSONObject().put("dataUrl","data:image/jpeg;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP)).put("width",scaled.width).put("height",scaled.height)
          cache.put(key,result.toString());return result
        }finally{if(scaled!==bitmap)scaled.recycle()}
      }finally{bitmap.recycle()}
    }finally{timeout.cancel(false)}
  }
}
