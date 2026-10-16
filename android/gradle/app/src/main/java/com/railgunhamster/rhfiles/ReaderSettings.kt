package com.railgunhamster.rhfiles

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile

/** Shared between the isolated reader process and backup service; never exposes
 * general file access or file-manager IPC to a book. */
object ReaderSettings {
  private val monitor=Any()
  private fun file(context:Context)=AtomicFile(File(context.filesDir,"reader-settings-v1.json"))
  private fun <T> locked(context:Context,block:()->T):T=synchronized(monitor){RandomAccessFile(File(context.filesDir,"reader-settings-v1.lock"),"rw").use{it.channel.lock().use{block()}}}
  fun validate(values:JSONObject):JSONObject {
    require(values.length()<=10001&&values.toString().length<=2_000_000){"阅读配置过大"}
    values.keys().forEach{key->require(key=="rhfiles.reader.options"||Regex("rhfiles\\.reader\\.book\\.[A-Za-z0-9_-]{1,160}").matches(key)){"阅读配置字段无效"};val text=values.getString(key);require(text.length<=65536){"阅读记录过长"};JSONObject(text)}
    return JSONObject(values.toString())
  }
  fun state(context:Context):JSONObject=locked(context){val f=file(context);JSONObject().put("authoritative",f.baseFile.exists()).put("values",if(f.baseFile.exists())JSONObject(f.openRead().bufferedReader().use{it.readText()})else JSONObject())}
  fun replace(context:Context,values:JSONObject)=locked(context){write(context,validate(values))}
  fun update(context:Context,key:String,value:String)=locked(context){val values=stateUnlocked(context);values.put(key,value);write(context,validate(values))}
  private fun stateUnlocked(context:Context):JSONObject {val f=file(context);return if(f.baseFile.exists())JSONObject(f.openRead().bufferedReader().use{it.readText()})else JSONObject()}
  private fun write(context:Context,values:JSONObject){val f=file(context);val stream=f.startWrite();try{stream.write(values.toString().toByteArray());f.finishWrite(stream)}catch(e:Exception){f.failWrite(stream);throw e}}
}
