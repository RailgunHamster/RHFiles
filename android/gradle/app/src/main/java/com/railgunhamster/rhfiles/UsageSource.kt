package com.railgunhamster.rhfiles

import android.os.Build
import android.provider.DocumentsContract as Docs
import android.system.Os
import android.system.OsConstants
import java.nio.file.Files

internal data class UsageItem(val path:String,val name:String,val directory:Boolean,val bytes:Long=0,val modified:Long=0,val issue:String?=null)
internal interface UsageSource {
  fun root(path:String):UsageItem
  fun children(path:String,accept:(UsageItem)->Unit)
  fun measure(item:UsageItem):UsageItem
}

/** Streaming local/SAF enumeration. The ordinary 50k-row UI limit is not a scan limit. */
internal class DeviceUsageSource(private val storage:NativeStorage):UsageSource {
  private fun item(e:NativeEntry)=UsageItem(e.path,e.name,e.isDir,e.size,e.modified)
  override fun root(path:String)=item(storage.stat(path))
  private fun local(path:String):UsageItem {
    val name=java.io.File(path).name
    return try {
      val stat=Os.lstat(path)
      when {
        OsConstants.S_ISLNK(stat.st_mode)->UsageItem(path,name,false,issue="符号链接未跟随，避免循环或重复统计")
        OsConstants.S_ISDIR(stat.st_mode)->UsageItem(path,name,true,modified=stat.st_mtime*1000)
        OsConstants.S_ISREG(stat.st_mode)->UsageItem(path,name,false,stat.st_size,stat.st_mtime*1000)
        else->UsageItem(path,name,false,issue="不是普通文件，未读取")
      }
    }catch(e:Exception){UsageItem(path,name,false,issue=e.message?:"无法读取文件信息")}
  }
  override fun children(path:String,accept:(UsageItem)->Unit) {
    when {
      storage.isRemote(path)->{
        val entries=storage.list(path);entries.forEach{accept(item(it))}
        // Remote adapters impose protocol safety bounds. Never call a capped
        // response a complete directory, including a WebDAV byte-bound error.
        check(entries.size<50000){"网络目录达到 50,000 项安全上限；此目录结果可能不完整，请按子目录分析"}
      }
      storage.isDocument(path)->{
        val uri=storage.document(path)
        val children=Docs.buildChildDocumentsUriUsingTree(uri,Docs.getDocumentId(uri))
        storage.context.contentResolver.query(children,arrayOf(Docs.Document.COLUMN_DOCUMENT_ID,Docs.Document.COLUMN_DISPLAY_NAME,Docs.Document.COLUMN_MIME_TYPE,Docs.Document.COLUMN_SIZE,Docs.Document.COLUMN_LAST_MODIFIED),null,null,null)?.use{cursor->
          while(cursor.moveToNext())accept(UsageItem(Docs.buildDocumentUriUsingTree(uri,cursor.getString(0)).toString(),cursor.getString(1)?:"未命名",cursor.getString(2)==Docs.Document.MIME_TYPE_DIR,if(cursor.isNull(3))-1 else cursor.getLong(3),if(cursor.isNull(4))0 else cursor.getLong(4)))
        }?:error("提供者未返回目录内容，请检查授权")
      }
      else->{
        val directory=storage.local(path)
        if(Build.VERSION.SDK_INT>=26)Files.newDirectoryStream(directory.toPath()).use{stream->for(child in stream)accept(local(child.toString()))}
        else (directory.listFiles()?:error("无法读取文件夹：权限不足或存储不可用")).forEach{accept(local(it.path))}
      }
    }
  }
  override fun measure(item:UsageItem):UsageItem {
    if(storage.isRemote(item.path)||storage.isDocument(item.path))return item // Metadata already returned by the provider; do not open/read file contents.
    storage.local(item.path) // Revalidate confinement and symlinks after pre-scan.
    val now=local(item.path);check(!now.directory){"文件在分析期间变成了文件夹，请重新分析"};return now
  }
}
