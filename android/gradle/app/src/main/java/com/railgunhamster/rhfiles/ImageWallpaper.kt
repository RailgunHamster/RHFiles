package com.railgunhamster.rhfiles

import android.app.WallpaperManager
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Read-only snapshot + system confirmation; never calls setBitmap/setStream. */
internal object ImageWallpaper {
  private const val MAX_BYTES=48L*1024*1024
  private const val CACHE_BYTES=192L*1024*1024
  private const val KEEP_MS=24L*60*60*1000

  fun prepare(context:Context,storage:NativeStorage,path:String):Uri {
    val manager=WallpaperManager.getInstance(context)
    require(manager.isWallpaperSupported){"当前设备不支持设置壁纸"}
    require(manager.isSetWallpaperAllowed){"系统策略不允许修改壁纸"}
    return FileProvider.getUriForFile(context,"${context.packageName}.fileprovider",snapshot(context){storage.input(path)})
  }

  @Synchronized internal fun snapshot(context:Context,maxBytes:Long=MAX_BYTES,open:()->InputStream):File {
    val directory=File(context.cacheDir,"exports/wallpapers");check(directory.mkdirs()||directory.isDirectory){"无法创建壁纸缓存"}
    val now=System.currentTimeMillis()
    directory.listFiles()?.filter{it.isFile&&now-it.lastModified()>KEEP_MS}?.forEach{it.delete()}
    require((directory.listFiles()?.sumOf{it.length()}?:0)+maxBytes<=CACHE_BYTES){"壁纸临时缓存已满，请稍后再试或在系统中清理 RHFiles 缓存"}
    val temporary=File(directory,UUID.randomUUID().toString()+".part")
    try {
      val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(40)
      var count=0L
      open().use{input->temporary.outputStream().use{output->
        val buffer=ByteArray(65536)
        while(true){
          check(System.nanoTime()<deadline){"读取壁纸图片超时，请先下载到本机"}
          val n=input.read(buffer);if(n<0)break;check(n>0){"读取图片没有进展"}
          count+=n;require(count<=maxBytes){"图片超过 48 MB，请先使用较小的图片"};output.write(buffer,0,n)
        }
      }}
      val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(temporary.path,bounds)
      require(bounds.outWidth>0&&bounds.outHeight>0&&bounds.outWidth.toLong()*bounds.outHeight<=200_000_000){"系统无法解码此图片，或图片尺寸过大；可先转换为 JPG / PNG"}
      val extension=when(bounds.outMimeType){"image/jpeg"->"jpg";"image/png"->"png";"image/webp"->"webp";"image/gif"->"gif";"image/bmp"->"bmp";"image/heic","image/heif"->"heic";"image/avif"->"avif";else->error("此图片格式暂不支持设为壁纸，请转换为 JPG / PNG")}
      val file=File(directory,temporary.nameWithoutExtension+"."+extension)
      check(temporary.renameTo(file)){"无法保存壁纸临时图片"};return file
    } finally {temporary.delete()}
  }

  internal fun grant(intent:Intent,uri:Uri):Intent= intent.apply{
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    clipData=ClipData.newRawUri("壁纸图片",uri)
  }

  fun intent(context:Context,uri:Uri):Intent {
    require(uri.scheme=="content"){"壁纸图片必须使用临时授权的内容 URI"}
    val mime=context.contentResolver.getType(uri)?:""
    require(mime.startsWith("image/")){"不是可读取的图片"}
    val manager=WallpaperManager.getInstance(context)
    return try {grant(manager.getCropAndSetWallpaperIntent(uri),uri)}
    catch(_:IllegalArgumentException){
      // Some vendor systems only expose their picker through Android's Set As.
      val fallback=grant(Intent(Intent.ACTION_ATTACH_DATA).setDataAndType(uri,mime),uri)
      require(fallback.resolveActivity(context.packageManager)!=null){"当前系统没有可用的壁纸设置界面，请用系统图库设置"}
      grant(Intent.createChooser(fallback,"选择壁纸应用"),uri)
    }
  }
}
