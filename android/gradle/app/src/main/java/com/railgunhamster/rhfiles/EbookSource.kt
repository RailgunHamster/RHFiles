package com.railgunhamster.rhfiles

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.security.MessageDigest
import java.util.zip.ZipFile

/** Read-only selected-book access. ZIP resources are streamed, never extracted. */
class EbookSource(context:Context,path:String,private val canceled:()->Boolean={false}):Closeable {
  companion object {
    const val MAX_BOOK_BYTES=64L*1024*1024
    const val MAX_RESOURCE_BYTES=20L*1024*1024
    const val MAX_TEXT_BYTES=8L*1024*1024
    const val MAX_EXPANDED_BYTES=256L*1024*1024
    const val MAX_ENTRIES=5000
    val FORMATS=setOf("epub","mobi","azw","azw3","prc","fb2","cbz")
    fun supported(name:String)=name.substringAfterLast('.').lowercase() in FORMATS
    fun resourceName(name:String):String {
      require(name.isNotEmpty()&&name.length<=1024&&!name.startsWith('/')&&!name.contains('\\')&&!name.contains('\u0000')&&!name.contains(':')){"电子书资源路径无效"}
      require(name.split('/').none{it==".."||it=="."||it.isEmpty()}){"电子书资源路径越界"};return name
    }
  }
  private val storage=NativeStorage(context)
  private val original=run{require(!storage.isRemote(path)){"网络电子书请先下载到本机"};storage.stat(path)}
  val name=original.name
  val format=name.substringAfterLast('.').lowercase()
  private var owned:File?=null
  private val file:File
  private var zip:ZipFile?=null
  private val entries=linkedMapOf<String,Long>()
  val key=MessageDigest.getInstance("SHA-256").digest("$path:${original.modified}:${original.size}".toByteArray()).joinToString(""){"%02x".format(it)}
  init {
    require(!storage.isRemote(path)){"网络电子书请先下载到本机"}
    require(!original.isDir&&supported(name)){"支持 EPUB、MOBI/AZW3、FB2 和 CBZ；PDF 请用系统阅读器打开"}
    require(original.size<=MAX_BOOK_BYTES){"电子书超过首版阅读器的 64 MB 上限"}
    file=if(storage.isDocument(path)) {
      val directory=File(context.cacheDir,"ebook-reader").apply{mkdirs()}
      directory.listFiles()?.take(100)?.filter{it.isFile&&it.canonicalFile==it.absoluteFile&&it.name.startsWith("reader-")&&it.name.endsWith(".book")&&it.lastModified()<System.currentTimeMillis()-86400000L}?.forEach{it.delete()}
      File.createTempFile("reader-",".book",directory).also{temporary->
        owned=temporary
        try{storage.input(path).use{input->temporary.outputStream().use{out->val buffer=ByteArray(64*1024);var total=0L
          while(true){check(!canceled()&&!Thread.currentThread().isInterrupted){"读取已取消"};val count=input.read(buffer);if(count<0)break;total+=count;require(total<=MAX_BOOK_BYTES){"电子书超过 64 MB 上限"};out.write(buffer,0,count)}
        }}}catch(error:Exception){temporary.delete();throw error}
      }
    }else storage.local(path)
    try {
      require(file.length() in 1..MAX_BOOK_BYTES){"电子书为空或超过 64 MB 上限"}
      if(format in setOf("epub","cbz")) {
        zip=ZipFile(file);var expanded=0L;var count=0
        val iterator=zip!!.entries()
        while(iterator.hasMoreElements()){
          check(!canceled()){ "读取已取消" };val entry=iterator.nextElement();require(++count<=MAX_ENTRIES){"电子书资源数量超过安全上限"}
          resourceName(entry.name.trimEnd('/'));if(entry.isDirectory)continue
          require(entry.size>=0&&entry.size<=MAX_RESOURCE_BYTES){"电子书单个资源超过 20 MB 上限：${entry.name}"}
          expanded+=entry.size;require(expanded<=MAX_EXPANDED_BYTES){"电子书展开后超过 256 MB 安全上限"}
          require(entries.put(entry.name,entry.size)==null){"电子书包含重名资源：${entry.name}"}
        }
      }
    }catch(error:Exception){close();throw error}
  }
  fun metadata(theme:String)=JSONObject().put("name",name).put("format",format).put("key",key).put("size",file.length()).put("theme",theme)
    .put("entries",JSONArray(entries.map{(name,size)->JSONObject().put("filename",name).put("size",size)}))
  fun raw():InputStream {check(!canceled()){ "读取已取消" };return bounded(file.inputStream(),MAX_BOOK_BYTES)}
  fun resource(name:String,text:Boolean):InputStream {
    resourceName(name);val length=entries[name]?:error("电子书资源不存在：$name");val limit=if(text)MAX_TEXT_BYTES else MAX_RESOURCE_BYTES
    require(length<=limit){"电子书章节或资源过大：$name"};return bounded(zip!!.getInputStream(zip!!.getEntry(name)),limit)
  }
  private fun bounded(input:InputStream,limit:Long)=object:FilterInputStream(input){
    var total=0L
    private fun checked(count:Int):Int {check(!canceled()){ "读取已取消" };if(count>0){total+=count;require(total<=limit){"电子书资源超过安全上限"}};return count}
    override fun read()=super.read().also{if(it>=0)checked(1)}
    override fun read(buffer:ByteArray,offset:Int,length:Int)=checked(`in`.read(buffer,offset,length))
  }
  override fun close(){try{zip?.close()}finally{zip=null;owned?.delete();owned=null}}
}
