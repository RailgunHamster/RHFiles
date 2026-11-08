package com.railgunhamster.rhfiles

import android.content.Context
import java.io.File
import org.json.JSONObject

/** Private working data, not a Download entry. All long I/O belongs to FileTasks. */
object OpenCache {
  private const val MAX=2L*1024*1024*1024
  private fun root(context:Context)=File(context.cacheDir,"exports/open-cache").apply{mkdirs()}
  fun create(context:Context,storage:NativeStorage,id:String,path:String,entry:NativeEntry,progress:(Int)->Unit):File {
    require(!entry.isDir&&entry.name.endsWith(".apk",true)){"缓存安装仅支持单个 APK；分包安装包请使用支持该格式的安装器"}
    require(entry.size in 1..MAX){"APK 大小无效或超过 2 GB 缓存上限"}
    val base=root(context);val now=System.currentTimeMillis()
    val old=base.listFiles().orEmpty().filter{!SafeFiles.isLink(it)}.sortedBy{it.lastModified()}
    var used=old.sumOf{folder->folder.walkTopDown().onEnter{!SafeFiles.isLink(it)}.filter{it.isFile&&!SafeFiles.isLink(it)}.sumOf{it.length()}}
    for(folder in old){if(now-folder.lastModified()<10*60*1000)continue
      if(now-folder.lastModified()>7*24*60*60*1000L||used+entry.size>MAX){val size=folder.walkTopDown().onEnter{!SafeFiles.isLink(it)}.filter{it.isFile&&!SafeFiles.isLink(it)}.sumOf{it.length()};folder.deleteRecursively();used-=size}}
    require(used+entry.size<=MAX){"安装缓存空间不足，请稍后再试或清理应用缓存"}
    val directory=File(base,id);require(directory.mkdir()){"无法创建安装缓存"}
    val work=File(directory,".incomplete");require(work.mkdir()){"无法创建临时安装缓存"}
    // A Windows filename can exceed Android's UTF-8 component limit. The
    // private cache name need not repeat the user's (possibly very long) name.
    val partial=File(work,"package.apk");val output=File(directory,"package.apk")
    try {
      var count=0L
      storage.input(path).use{input->partial.outputStream().use{sink->val buffer=ByteArray(256*1024);while(true){progress(0);val n=input.read(buffer);if(n<0)break;count+=n;require(count<=entry.size&&count<=MAX){"APK 在读取期间变大，缓存已停止"};sink.write(buffer,0,n);progress(n)}}}
      require(count==entry.size){"APK 缓存不完整，请重新打开原文件"}
      val after=storage.stat(path);require(!after.isDir&&after.size==entry.size&&after.modified==entry.modified){"APK 在缓存期间已修改，请重新打开原文件"}
      require(context.packageManager.getPackageArchiveInfo(partial.path,0)!=null){"文件不是有效 APK，或安装包已损坏"}
      SafeFiles.publish(partial,output);work.delete();return output
    }catch(error:Exception){directory.deleteRecursively();throw error}
  }
  fun output(context:Context,job:JSONObject):String {
    require(job.getString("op")=="cache-open"&&job.getString("state")=="completed"){"安装缓存尚未完成"}
    val outputs=job.getJSONArray("outputs");require(outputs.length()==1){"安装缓存已失效"}
    val file=File(outputs.getString(0));val parent=File(root(context),job.getString("id"))
    require(file.parentFile?.canonicalFile==parent.canonicalFile&&file.isFile&&!SafeFiles.isLink(file)&&file.extension.equals("apk",true)){"安装缓存已过期或被清理，请重新打开原文件"}
    return file.path
  }
}
