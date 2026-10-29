package com.railgunhamster.rhfiles

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.io.FileOutputStream
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

/** Device/user-local login, excluded from Android backup and RHFiles sync.
 * A test may supply a JVM AES key; production always uses AndroidKeyStore. */
internal class RhVideoCredentials(private val context:Context,private val testKey:(()->SecretKey)?=null){
  class Record(val server:String,val username:String,val token:String,val refreshAt:Long)
  private val file=AtomicFile(File(context.noBackupFilesDir,"rhvideo-login-v1.enc"))
  private fun aad()=("RHFiles\u0000RHVideo login v1\u0000"+context.packageName+"\u0000"+context.noBackupFilesDir.canonicalPath).toByteArray(Charsets.UTF_8)
  private fun key():SecretKey{
    testKey?.let{return it()}
    val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
    (store.getKey("rhfiles-rhvideo-login-v1",null)as? SecretKey)?.let{return it}
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{
      init(KeyGenParameterSpec.Builder("rhfiles-rhvideo-login-v1",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  fun exists()=file.baseFile.isFile||File(file.baseFile.path+".bak").isFile
  private fun validate(value:Record){
    RhVideoClient.base(value.server)
    require(value.username.isNotBlank()&&value.username.length<=256&&value.username.none{it.code<32}&&value.token.isNotBlank()&&value.token.length<=32768&&value.token.none{it.code<32}&&value.refreshAt>0){"已保存的登录格式无效，请重新登录"}
  }
  fun save(value:Record){
    validate(value)
    val plain=JSONObject().put("version",1).put("server",value.server).put("username",value.username).put("token",value.token).put("refreshAt",value.refreshAt).toString().toByteArray(Charsets.UTF_8)
    require(plain.size<=65536){"本机登录记录过大"}
    val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());cipher.updateAAD(aad())
    require(cipher.iv.size==12){"系统未提供支持的登录保护参数"};val encrypted=byteArrayOf(1)+cipher.iv+cipher.doFinal(plain);var output:FileOutputStream?=null
    try{output=file.startWrite();output.write(encrypted);file.finishWrite(output)}catch(error:Exception){file.failWrite(output);throw java.io.IOException("无法保存受保护的本机登录",error)}
  }
  fun read():Record?{
    if(!exists())return null
    require(file.baseFile.length()<=131072&&File(file.baseFile.path+".bak").length()<=131072){"本机登录存储过大"}
    val bytes=file.readFully();require(bytes.size in 30..131072&&bytes[0]==1.toByte()){"本机登录存储格式无效"}
    val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(1,13)));cipher.updateAAD(aad())
    val plain=try{cipher.doFinal(bytes.copyOfRange(13,bytes.size))}catch(_:Exception){throw java.io.IOException("无法解密此设备／用户保存的登录，请重新登录")}
    require(plain.size<=65536){"本机登录记录过大"};val value=JSONObject(plain.toString(Charsets.UTF_8))
    require(value.getInt("version")==1&&value.keys().asSequence().toSet()==setOf("version","server","username","token","refreshAt")){"本机登录记录格式无效"}
    return Record(value.getString("server"),value.getString("username"),value.getString("token"),value.getLong("refreshAt")).also{validate(it)}
  }
  fun clear(){file.delete();check(!exists()){"无法移除本机保存的登录，退出未完成；请检查应用存储权限"}}
}
