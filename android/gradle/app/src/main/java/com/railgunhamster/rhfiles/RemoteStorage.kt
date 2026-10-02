package com.railgunhamster.rhfiles

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.hierynomus.msdtyp.AccessMask
import com.hierynomus.msfscc.FileAttributes
import com.hierynomus.mssmb2.SMB2CreateDisposition
import com.hierynomus.mssmb2.SMB2ShareAccess
import com.hierynomus.smbj.SMBClient
import com.hierynomus.smbj.SmbConfig
import com.hierynomus.smbj.auth.AuthenticationContext
import com.hierynomus.smbj.share.DiskShare
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.RequestBody.Companion.toRequestBody
import org.apache.commons.net.ftp.FTP
import org.apache.commons.net.ftp.FTPClient
import org.apache.commons.net.ftp.FTPSClient
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.security.KeyStore
import java.util.EnumSet
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.xml.parsers.DocumentBuilderFactory
import com.railgunhamster.rhfiles.SafeFiles.readBytesBounded

/** Credentials never enter URLs, logs, task journals, or localStorage. */
class RemoteStorage(private val context: Context, private val profileLookup: ((String)->JSONObject)? = null) {
  private val preferences = context.getSharedPreferences("remote-v1", Context.MODE_PRIVATE)
  private val http = OkHttpClient.Builder().connectTimeout(20,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS)
    .writeTimeout(30,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey("rhfiles-remotes",null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("rhfiles-remotes",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @Synchronized fun save(config: JSONObject): String {
    val type = config.getString("type")
    require(type in listOf("smb","ftp","ftps","webdav")) { "未知网络协议" }
    SafeFiles.name(config.getString("name"))
    if (type == "webdav") {
      val u = config.getString("url").toHttpUrl()
      require(u.username.isEmpty() && u.password.isEmpty() && u.query == null && u.fragment == null) { "请在用户名/密码框填写凭据，不要放进地址" }
      require(u.isHttps || config.optBoolean("insecure")) { "HTTP 为明文连接，请明确允许或使用 HTTPS" }
    } else {
      val host = config.getString("host")
      require(host.isNotBlank() && host.none { it == '/' || it == '@' || it.isWhitespace() }) { "请填写主机名或 IP，不要带协议和路径" }
      require(config.optInt("port",if (type=="smb") 445 else 21) in 1..65535) { "端口无效" }
      if (type == "ftp") require(config.optBoolean("insecure")) { "FTP 会明文传输密码，请明确允许或选择 FTPS" }
      if (type == "smb") SafeFiles.name(config.getString("share"))
    }
    val id = UUID.randomUUID().toString()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key())
    val encrypted = cipher.iv + cipher.doFinal(config.toString().toByteArray())
    require(preferences.edit().putString(id,Base64.encodeToString(encrypted,Base64.NO_WRAP)).commit()) { "连接配置保存失败" }
    return id
  }
  fun remove(id: String) { require(preferences.edit().remove(id).commit()) { "删除连接失败" } }
  private fun config(id: String): JSONObject {
    profileLookup?.let { return JSONObject(it(id).toString()) }
    val encrypted = Base64.decode(preferences.getString(id,null) ?: error("网络位置已删除"),Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,encrypted.copyOfRange(0,12)))
    return JSONObject(String(cipher.doFinal(encrypted.copyOfRange(12,encrypted.size)),Charsets.UTF_8))
  }
  fun connections(): JSONArray = JSONArray().also { result -> preferences.all.keys.sorted().forEach { id ->
    try { val c = config(id); result.put(JSONObject().put("id",id).put("name",c.getString("name")).put("type",c.getString("type")).put("path","remote://$id/")) }
    catch (_: Exception) { result.put(JSONObject().put("id",id).put("name","密钥失效，请删除并重新添加").put("type","unavailable")) }
  } }
  private data class Location(val id: String, val relative: String, val c: JSONObject)
  private fun location(path: String): Location {
    val uri = Uri.parse(path); require(uri.scheme == "remote" && uri.query == null && uri.fragment == null) { "网络路径无效" }
    val id = uri.host ?: error("网络位置无效"); val segments = uri.pathSegments
    segments.forEach { SafeFiles.name(it) }
    return Location(id,segments.joinToString("/"),config(id))
  }
  private fun child(path: String, name: String) = path.trimEnd('/') + "/" + Uri.encode(SafeFiles.name(name))
  private fun parent(path: String) = path.trimEnd('/').substringBeforeLast('/') + "/"
  private fun ftp(c: JSONObject): FTPClient {
    val f = if (c.getString("type") == "ftps") FTPSClient(false).apply { isEndpointCheckingEnabled = true } else FTPClient()
    f.connectTimeout=20000; f.defaultTimeout=30000; f.controlEncoding="UTF-8"; f.setDataTimeout(java.time.Duration.ofSeconds(30))
    try {
      f.connect(c.getString("host"),c.optInt("port",21)); require(f.login(c.optString("username").ifBlank{"anonymous"},c.optString("password",""))) { "FTP 登录失败：${f.replyCode}" }
      if (f is FTPSClient) { f.execPBSZ(0); f.execPROT("P") }
      f.enterLocalPassiveMode(); require(f.setFileType(FTP.BINARY_FILE_TYPE)) { "服务器拒绝二进制模式" }
      return f
    } catch (e: Exception) { try { f.disconnect() } catch (_: Exception) {}; throw e }
  }
  private fun ftpPath(l: Location) = "/" + l.relative
  private inline fun <T> withFtp(c: JSONObject, block: (FTPClient) -> T): T { val f=ftp(c); try { return block(f) } finally { try { f.disconnect() } catch (_: Exception) {} } }
  private class Smb(val client: SMBClient, val share: DiskShare): Closeable { override fun close() { try { share.close() } finally { client.close() } } }
  private fun smb(c: JSONObject): Smb {
    val client=SMBClient(SmbConfig.builder().withAuthenticators(listOf(com.hierynomus.smbj.auth.NtlmAuthenticator.Factory()))
      .withTimeout(30,TimeUnit.SECONDS).withSoTimeout(30000).build())
    try {
      val connection=client.connect(c.getString("host"),c.optInt("port",445))
      val session=connection.authenticate(AuthenticationContext(c.optString("username"),c.optString("password").toCharArray(),c.optString("domain")))
      val share=session.connectShare(c.getString("share")) as? DiskShare ?: error("不是文件共享")
      return Smb(client,share)
    } catch (e: Exception) { client.close(); throw e }
  }
  private fun smbPath(l: Location) = l.relative.replace('/','\\')
  private fun url(l: Location): HttpUrl {
    val base=l.c.getString("url").trimEnd('/').plus('/').toHttpUrl().newBuilder()
    l.relative.split('/').filter { it.isNotEmpty() }.forEach { base.addPathSegment(it) }; return base.build()
  }
  private fun request(l: Location, method: String, body: RequestBody? = null, headers: Map<String,String> = emptyMap()): Response {
    val builder=Request.Builder().url(url(l)).method(method,body)
    if (l.c.optString("username").isNotEmpty()) builder.header("Authorization",Credentials.basic(l.c.getString("username"),l.c.optString("password"),Charsets.UTF_8))
    headers.forEach { (k,v) -> builder.header(k,v) }
    return http.newCall(builder.build()).execute().also { if (!it.isSuccessful) { val code=it.code; it.close(); error("WebDAV 请求失败：HTTP $code（不自动跟随重定向）") } }
  }
  fun list(path: String): List<NativeEntry> {
    val l=location(path)
    return when(l.c.getString("type")) {
      "smb" -> smb(l.c).use { s -> s.share.list(smbPath(l)).filter { it.fileName!="." && it.fileName!=".." }.take(50000).map {
        NativeEntry(child(path,it.fileName),it.fileName,it.fileAttributes and FileAttributes.FILE_ATTRIBUTE_DIRECTORY.value != 0L,it.endOfFile,it.lastWriteTime.toEpochMillis())
      } }
      "ftp", "ftps" -> withFtp(l.c) { f ->
        require(f.changeWorkingDirectory(ftpPath(l))) { "FTP 目录不可访问：${f.replyCode}" }
        val entries=f.listFiles(); require(f.replyCode in 200..299) { "FTP 列目录失败：${f.replyCode}" }
        entries.filter { it.name!="." && it.name!=".." && !it.isSymbolicLink }.take(50000).map {
          NativeEntry(child(path,it.name),it.name,it.isDirectory,it.size,it.timestamp?.timeInMillis ?: 0)
        }
      }
      else -> request(l,"PROPFIND",("<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>").toRequestBody(),mapOf("Depth" to "1")).use { response ->
        val bytes=response.body!!.byteStream().use { it.readBytesBounded(4*1024*1024) }
        val factory=DocumentBuilderFactory.newInstance().apply {
          isNamespaceAware=true; setFeature("http://apache.org/xml/features/disallow-doctype-decl",true)
          setFeature("http://xml.org/sax/features/external-general-entities",false); setFeature("http://xml.org/sax/features/external-parameter-entities",false)
        }
        val document=factory.newDocumentBuilder().parse(ByteArrayInputStream(bytes))
        val nodes=document.getElementsByTagNameNS("DAV:","response"); val results=mutableListOf<NativeEntry>(); val base=url(l)
        for(i in 0 until nodes.length.coerceAtMost(50001)) {
          val e=nodes.item(i) as org.w3c.dom.Element
          fun value(tag:String)=e.getElementsByTagNameNS("DAV:",tag).item(0)?.textContent ?: ""
          val target=base.resolve(value("href")) ?: continue
          val prefix=base.encodedPath.trimEnd('/')+"/"
          if(target.host!=base.host || target.port!=base.port || target.scheme!=base.scheme || !target.encodedPath.startsWith(prefix)) continue
          val rest=target.encodedPath.removePrefix(prefix).trimEnd('/'); if(rest.isEmpty() || '/' in rest) continue
          val name=Uri.decode(rest); SafeFiles.name(name)
          val modified=try { java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz",java.util.Locale.US).parse(value("getlastmodified"))?.time ?: 0 } catch (_: Exception) { 0L }
          results.add(NativeEntry(child(path,name),name,e.getElementsByTagNameNS("DAV:","collection").length>0,value("getcontentlength").toLongOrNull() ?: 0,modified))
        }; results
      }
    }
  }
  fun stat(path: String): NativeEntry {
    val l=location(path)
    if(l.relative.isEmpty()) return NativeEntry(path,l.c.getString("name"),true)
    return list(parent(path)).find { it.name==l.relative.substringAfterLast('/') } ?: error("远程文件已不存在")
  }
  fun input(path: String): InputStream {
    val l=location(path)
    return when(l.c.getString("type")) {
      "smb" -> {
        val s=smb(l.c)
        try {
          val file=s.share.openFile(smbPath(l),EnumSet.of(AccessMask.GENERIC_READ),null,SMB2ShareAccess.ALL,SMB2CreateDisposition.FILE_OPEN,null)
          object: FilterInputStream(file.inputStream) { override fun close() { try { super.close(); file.close() } finally { s.close() } } }
        } catch(e:Exception) { s.close(); throw e }
      }
      "ftp", "ftps" -> {
        val f=ftp(l.c)
        try {
          val stream=f.retrieveFileStream(ftpPath(l)) ?: error("FTP 读取失败：${f.replyCode}")
          object: FilterInputStream(stream) { override fun close() { try { super.close(); require(f.completePendingCommand()) { "FTP 传输未完成" } } finally { f.disconnect() } } }
        } catch(e:Exception) { f.disconnect(); throw e }
      }
      else -> { val r=request(l,"GET"); object: FilterInputStream(r.body!!.byteStream()) { override fun close() { try { super.close() } finally { r.close() } } } }
    }
  }
  fun create(parent: String, name: String, dir: Boolean): String {
    val path=child(parent,name); val l=location(path)
    when(l.c.getString("type")) {
      "smb" -> smb(l.c).use { s -> if(dir) s.share.mkdir(smbPath(l)) else s.share.openFile(smbPath(l),EnumSet.of(AccessMask.GENERIC_WRITE),null,SMB2ShareAccess.ALL,SMB2CreateDisposition.FILE_CREATE,null).close() }
      "ftp", "ftps" -> withFtp(l.c) { f -> require(if(dir) f.makeDirectory(ftpPath(l)) else f.storeFile(ftpPath(l),ByteArrayInputStream(byteArrayOf()))) { "FTP 创建失败：${f.replyCode}" } }
      else -> request(l,if(dir) "MKCOL" else "PUT",if(dir) null else byteArrayOf().toRequestBody(),mapOf("If-None-Match" to "*")).close()
    }; return path
  }
  fun write(path: String, input: InputStream, progress: (Int)->Unit) {
    val l=location(path)
    when(l.c.getString("type")) {
      "smb" -> smb(l.c).use { s -> s.share.openFile(smbPath(l),EnumSet.of(AccessMask.GENERIC_WRITE),null,SMB2ShareAccess.ALL,SMB2CreateDisposition.FILE_OVERWRITE,null).use { file -> file.outputStream.use { SafeFiles.pump(input,it,progress) } } }
      "ftp", "ftps" -> withFtp(l.c) { f ->
        (f.storeFileStream(ftpPath(l)) ?: error("FTP 写入被拒绝")).use { SafeFiles.pump(input,it,progress) }
        require(f.completePendingCommand()) { "FTP 传输未完成：${f.replyCode}" }
      }
      else -> request(l,"PUT",object: RequestBody() {
        override fun contentType(): MediaType? = null
        override fun writeTo(sink: okio.BufferedSink) { SafeFiles.pump(input,sink.outputStream(),progress) }
      }).close()
    }
  }
  fun rename(path: String, name: String): String {
    val l=location(path); require(l.relative.isNotEmpty()) { "不能重命名网络根目录" }
    require(list(parent(path)).none { it.name==name }) { "目标已存在，未覆盖" }
    val target=child(parent(path),name); val to=location(target)
    when(l.c.getString("type")) {
      "smb" -> smb(l.c).use { s -> s.share.open(smbPath(l),EnumSet.of(AccessMask.DELETE,AccessMask.GENERIC_READ),null,SMB2ShareAccess.ALL,SMB2CreateDisposition.FILE_OPEN,null).use { it.rename(smbPath(to),false) } }
      "ftp", "ftps" -> withFtp(l.c) { require(it.rename(ftpPath(l),ftpPath(to))) { "FTP 重命名失败：${it.replyCode}" } }
      else -> request(l,"MOVE",null,mapOf("Destination" to url(to).toString(),"Overwrite" to "F")).close()
    }; return target
  }
  fun delete(path: String) {
    val entry=stat(path); val l=location(path); require(l.relative.isNotEmpty()) { "不能删除网络根目录" }
    when(l.c.getString("type")) {
      "smb" -> smb(l.c).use { if(entry.isDir) it.share.rmdir(smbPath(l),false) else it.share.rm(smbPath(l)) }
      "ftp", "ftps" -> withFtp(l.c) { require(if(entry.isDir) it.removeDirectory(ftpPath(l)) else it.deleteFile(ftpPath(l))) { "FTP 删除失败：${it.replyCode}" } }
      else -> request(l,"DELETE").close()
    }
  }
}
