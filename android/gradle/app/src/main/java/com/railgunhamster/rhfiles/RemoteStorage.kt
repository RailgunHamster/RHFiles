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
import com.hierynomus.smbj.session.Session
import com.rapid7.client.dcerpc.transport.SMBTransportFactories
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
class RemoteStorage(private val context: Context, private val credentialKey: (() -> SecretKey)? = null, private val profileLookup: ((String)->JSONObject)? = null) {
  init { DeviceGroups.install(context) }
  data class SmbShare(val name:String,val type:Int)
  internal var shareReader:((JSONObject)->List<SmbShare>)?=null
  data class Unc(val host: String,val share: String,val parts: List<String>)
  companion object {
    private data class ReadKey(val id:String,val fingerprint:String,val network:String)
    private class ReadSmb(val client:SMBClient,val session:Session):Closeable {
      private val shares=linkedMapOf<String,DiskShare>()
      val serverShares by lazy {SmbShares(SMBTransportFactories.SRVSVC.getTransport(session))}
      val alive get()=session.connection.isConnected&&shares.values.all{it.isConnected}
      fun share(name:String):DiskShare {
        shares[name]?.let{return it}
        if(shares.size>=4){val key=shares.keys.first();shares.remove(key)?.close()}
        return (session.connectShare(name) as? DiskShare ?: error("不是文件共享")).also{shares[name]=it}
      }
      override fun close(){closeReadSession(client,session);shares.clear()}
    }
    private val readSessions=IdleReadPool<ReadKey,ReadSmb>(idleMs=180000,reusable={it.alive})
    private val readReaper by lazy {java.util.concurrent.Executors.newSingleThreadScheduledExecutor{task->Thread(task,"RHFiles-SMB-idle").apply{isDaemon=true}}.apply{scheduleWithFixedDelay({readSessions.reap()},15,15,TimeUnit.SECONDS)}}
    internal fun discardReadSessions(){readSessions.invalidate{true}}
    internal fun readFingerprint(c:JSONObject):String {
      // A share is a tree on the same authenticated connection, not a new
      // login. Canonical fields also avoid JSON key-order/label cache misses.
      val (username,domain)=SmbHosts.credentials(c.optString("username"),c.optString("domain"))
      val identity=JSONArray(listOf(c.getString("host").lowercase(java.util.Locale.ROOT),c.optInt("port",445),username,domain.lowercase(java.util.Locale.ROOT),c.optString("password")))
      return java.security.MessageDigest.getInstance("SHA-256").digest(identity.toString().toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
    }
    internal fun requireCredentials(c:JSONObject){require(!c.optBoolean("needsPassword")){"此网络位置的密码未同步，请先补填密码（网络位置 → 编辑连接）"}}
    // SMBJ wraps transport IOExceptions in SMBRuntimeException; a closed Share
    // may have no cause at all. Preserve permission/protocol errors on a live
    // resource, rather than retrying every server rejection.
    internal fun readFailure(error:Exception,alive:Boolean):Exception =
      if(!alive||generateSequence<Throwable>(error){it.cause}.take(8).any{it is IOException})IOException("SMB 只读连接已断开：${error.message}",error)else error
    // Directory/RPC reads have no buffered writes. Once their responses and
    // explicit tree-close complete, disconnect this one-shot transport without
    // waiting another 15/30 seconds for an optional LOGOFF reply. TCP teardown
    // releases the server's remaining read-only handles (including IPC$).
    // Write/transfer sessions retain their normal acknowledged close sequence.
    private fun closeReadSession(client:SMBClient,session:Session) {
      try{session.connection.close(true)}finally{client.close()}
    }
    internal fun requireIdle(jobs:JSONArray,id:String) {
      fun references(value:Any?,depth:Int=0):Boolean=when {
        depth>64->true
        value is String->value.startsWith("remote://$id/")
        value is JSONObject->value.keys().asSequence().any{references(value.get(it),depth+1)}
        value is JSONArray->(0 until value.length()).any{references(value.get(it),depth+1)}
        else->false
      }
      require((0 until jobs.length()).none{val job=jobs.getJSONObject(it);job.optString("state") in listOf("queued","running","paused","scanning")&&references(job.opt("args"))}){"此网络位置有未完成的文件任务，请先结束任务再修改或移除连接"}
    }
    fun parseUnc(value: String): Unc {
      val path=value.trim().replace('\\','/').removePrefix("smb:")
      require(path.startsWith("//")) { "家庭服务器请填写 \\\\服务器\\共享\\目录，或 HTTP/HTTPS 目录" }
      val parts=path.removePrefix("//").trimEnd('/').split('/')
      require(parts.size>=2 && parts[0].isNotBlank() && parts[0].none{it.isWhitespace() || it in "@:?#"}) { "SMB 地址必须包含服务器和共享名" }
      parts.drop(1).forEach{SafeFiles.name(it)}
      return Unc(parts[0],parts[1],parts.drop(2))
    }
  }
  fun requireSmbConnection(id: String,host: String,share: String):Boolean {
    val c=config(id)
    requireCredentials(c)
    require(c.getString("type")=="smb" && c.getString("host").equals(host,true) && (c.optString("share").isBlank()||c.optString("share").equals(share,true))) { "所选 SMB 登录配置的服务器或共享名与更新目录不一致，请在网络位置中添加对应连接" }
    return c.optString("share").isBlank()
  }
  private val preferences = context.getSharedPreferences("remote-v1", Context.MODE_PRIVATE)
  private val http = OkHttpClient.Builder().connectTimeout(20,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS)
    .writeTimeout(30,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()
  private fun key(): SecretKey {
    credentialKey?.let{return it()}
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey("rhfiles-remotes",null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("rhfiles-remotes",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  internal fun validate(config:JSONObject) {
    require(config.toString().length<=65536){"网络配置过长"}
    val type = config.getString("type")
    require(type in listOf("smb","ftp","ftps","webdav","rhfiles")) { "未知网络协议" }
    SafeFiles.name(config.getString("name"))
    if(type=="rhfiles"){RhFilesConnection.valid(config);return}
    if (type == "webdav") {
      val u = config.getString("url").toHttpUrl()
      require(u.username.isEmpty() && u.password.isEmpty() && u.query == null && u.fragment == null) { "请在用户名/密码框填写凭据，不要放进地址" }
      require(u.isHttps || config.optBoolean("insecure")) { "HTTP 为明文连接，请明确允许或使用 HTTPS" }
    } else {
      val host = config.getString("host")
      require(host.isNotBlank() && host.length<=253 && host.none { it in "/\\@?#" || it.isWhitespace() || it.code<32 }) { "请填写主机名或 IP，不要带协议和路径" }
      require(config.optInt("port",if (type=="smb") 445 else 21) in 1..65535) { "端口无效" }
      if (type == "ftp") require(config.optBoolean("insecure")) { "FTP 会明文传输密码，请明确允许或选择 FTPS" }
      if (type == "smb" && config.optString("share").isNotBlank()) SafeFiles.name(config.getString("share"))
    }
  }
  private fun encrypt(config:JSONObject):String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key())
    val encrypted = cipher.iv + cipher.doFinal(config.toString().toByteArray())
    return Base64.encodeToString(encrypted,Base64.NO_WRAP)
  }
  internal fun sealLocal(value:JSONObject)=encrypt(value)
  internal fun unsealLocal(value:String):JSONObject {
    val encrypted=Base64.decode(value,Base64.NO_WRAP);require(encrypted.size>=28){"本机凭据已损坏"}
    val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,encrypted.copyOfRange(0,12)))
    return JSONObject(String(cipher.doFinal(encrypted.copyOfRange(12,encrypted.size)),Charsets.UTF_8))
  }
  @Synchronized fun save(config: JSONObject): String {
    val value=JSONObject(config.toString());val requested=value.optString("id")
    require(requested.isNotBlank()||preferences.all.size<200){"网络位置最多保存 200 项，请先移除不再使用的连接"}
    val id=if(requested.isBlank())UUID.randomUUID().toString() else {
      require(UUID.fromString(requested).toString()==requested&&preferences.contains(requested)){"网络位置已删除，请重新添加"};requested
    }
    val old=if(requested.isNotBlank())this.config(id)else null
    if(old?.optString("groupId")?.isNotEmpty()==true){
      require(value.optString("type")=="rhfiles"){"设备组连接不能改为其他协议，请另建连接"}
      value.put("groupId",old.getString("groupId")).put("groupPeerId",old.getString("groupPeerId"))
    }
    if(old!=null&&!value.optBoolean("clearPassword")&&value.optString("password").isEmpty()){
      fun identity(c:JSONObject)=listOf(c.optString("type"),c.optString("host").lowercase(),c.optInt("port",if(c.optString("type")=="smb")445 else 21).toString(),c.optString("url"),c.optString("username"),c.optString("domain"),c.optString("fingerprint"))
      require(old.optString("password").isEmpty()||identity(old)==identity(value)){"更换服务器、协议或账号时请重新填写密码，或勾选清除密码"}
      value.put("password",old.optString("password"))
    }
    if(value.optBoolean("clearPassword"))value.put("password","")
    val emptyConfirmed=value.optBoolean("allowEmptyPassword")||(old?.optBoolean("needsPassword")!=true&&value.optString("password").isEmpty())
    require(old?.optBoolean("needsPassword")!=true||value.optString("password").isNotEmpty()||value.optString("username").isBlank()||emptyConfirmed){"密码未同步，请补填密码；若此账号确实不需要密码，请明确勾选使用空密码"}
    value.put("needsPassword",false).put("emptyPasswordConfirmed",emptyConfirmed&&value.optString("password").isEmpty())
    value.remove("allowEmptyPassword")
    value.remove("id");value.remove("clearPassword");value.remove("hasPassword");validate(value)
    require(preferences.edit().putString(id,encrypt(value)).commit()) { "连接配置保存失败" }
    readSessions.invalidate{it.id==id}
    return id
  }
  fun editable(id:String):JSONObject {
    val c=config(id);val result=JSONObject().put("id",id).put("hasPassword",c.optString("password").isNotEmpty()).put("needsPassword",c.optBoolean("needsPassword"))
    for(field in listOf("name","type","host","port","share","domain","url","username","insecure","fingerprint","groupId","groupPeerId"))if(c.has(field))result.put(field,c.get(field))
    return result
  }
  internal fun backupProfiles(includeGroups:Boolean=false)=JSONArray().also{out->preferences.all.keys.sorted().forEach{id->val c=config(id);if(includeGroups||c.optString("groupId").isEmpty())out.put(JSONObject().put("id",id).put("config",c))}}
  internal fun portableWeb(web:JSONObject):JSONObject {
    val profiles=backupProfiles(true);val localIds=(0 until profiles.length()).map{profiles.getJSONObject(it)}.filter{it.getJSONObject("config").optString("groupId").isNotEmpty()}.map{it.getString("id")}.toSet()
    val result=JSONObject(web.toString());if(result.has("rhfiles.favorites")){val favorites=JSONArray(result.getString("rhfiles.favorites"));result.put("rhfiles.favorites",JSONArray((0 until favorites.length()).map{favorites.getJSONObject(it)}.filter{Uri.parse(it.optString("path")).host !in localIds}).toString())};return result
  }
  internal fun prepareProfiles(profiles:JSONArray):JSONObject=JSONObject().also{out->
    require(profiles.length()<=200){"网络位置过多"}
    for(i in 0 until profiles.length()){
      val item=profiles.getJSONObject(i);val id=item.getString("id");require(UUID.fromString(id).toString()==id&&!out.has(id)){"网络位置 ID 无效或重复"}
      val value=item.getJSONObject("config");validate(value);out.put(id,encrypt(value))
    }
  }
  fun remove(id: String,localRefusal:Boolean=true) { if(localRefusal)DeviceGroups.removingProfile(config(id));require(preferences.edit().remove(id).commit()) { "删除连接失败" };readSessions.invalidate{it.id==id} }
  private fun config(id: String): JSONObject {
    profileLookup?.let { return JSONObject(it(id).toString()) }
    val encrypted = Base64.decode(preferences.getString(id,null) ?: error("网络位置已删除"),Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,encrypted.copyOfRange(0,12)))
    return JSONObject(String(cipher.doFinal(encrypted.copyOfRange(12,encrypted.size)),Charsets.UTF_8))
  }
  fun connections(): JSONArray = JSONArray().also { result -> preferences.all.keys.sorted().forEach { id ->
    try { val c = config(id); result.put(JSONObject().put("id",id).put("name",c.getString("name")).put("type",c.getString("type")).put("host",c.optString("host")).put("port",c.optInt("port",445)).put("share",c.optString("share")).put("needsPassword",c.optBoolean("needsPassword")).put("path","remote://$id/")) }
    catch (_: Exception) { result.put(JSONObject().put("id",id).put("name","密钥失效，请删除并重新添加").put("type","unavailable")) }
  } }
  private data class Location(val id: String, val relative: String, val c: JSONObject,val serverRoot:Boolean=false)
  private fun location(path: String): Location {
    val uri = Uri.parse(path); require(uri.scheme == "remote" && uri.query == null && uri.fragment == null) { "网络路径无效" }
    val id = uri.host ?: error("网络位置无效"); val segments = uri.pathSegments
    segments.forEach { SafeFiles.name(it) }
    val c=config(id)
    requireCredentials(c)
    if(c.optString("type")=="smb"&&c.optString("share").isBlank()) {
      if(segments.isEmpty())return Location(id,"",c,true)
      return Location(id,segments.drop(1).joinToString("/"),c.put("share",segments.first()))
    }
    return Location(id,segments.joinToString("/"),c)
  }
  private fun child(path: String, name: String) = path.trimEnd('/') + "/" + Uri.encode(SafeFiles.name(name))
  fun isRhFiles(path:String)=path.startsWith("remote://")&&location(path).c.optString("type")=="rhfiles"
  fun isRhFilesRoot(path:String):Boolean {if(!path.startsWith("remote://")||Uri.parse(path).pathSegments.size>1)return false;val l=location(path);return l.c.optString("type")=="rhfiles"}
  fun destination(parent:String,name:String)=child(parent,name)
  fun uploadNew(path:String,input:InputStream,length:Long,progress:(Int)->Unit){val l=location(path);require(l.c.optString("type")=="rhfiles");RhFilesConnection(l.c).upload(l.relative,input,length,progress)}
  fun rhFilesThumbnail(path:String):JSONObject {val l=location(path);require(l.c.optString("type")=="rhfiles");return RhFilesConnection(l.c).thumbnail(l.relative)}
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
  private class Smb(val client: SMBClient, val share: DiskShare,val session:Session): Closeable {
    override fun close() { try { share.close() } finally { client.close() } }
  }
  private fun smbClient(network:SmbHosts.Scope,timeout:Long=30)=SMBClient(SmbConfig.builder().withSocketFactory(network.network.socketFactory).withAuthenticators(listOf(com.hierynomus.smbj.auth.NtlmAuthenticator.Factory()))
    .withTimeout(timeout,TimeUnit.SECONDS).withSoTimeout((timeout*1000).toInt()).build())
  private fun authenticate(client:SMBClient,c:JSONObject,network:SmbHosts.Scope):Session {
    val host=c.getString("host");val answer=SmbHosts.resolve(network,host)
    SmbHosts.requireCurrent(context,network)
    val connection=try{client.connect(answer.address,c.optInt("port",445))}catch(error:Exception){
      // No login or file operation has started. Evict a stale address, but do
      // not blindly replay authentication/writes or conceal the original error.
      SmbHosts.forget(network,host,answer.address);throw error
    }
    SmbHosts.requireCurrent(context,network)
    val (username,domain)=SmbHosts.credentials(c.optString("username"),c.optString("domain"))
    return connection.authenticate(if(username.isBlank()&&c.optString("password").isEmpty())AuthenticationContext.anonymous() else AuthenticationContext(username,c.optString("password").toCharArray(),domain))
  }
  private fun <T> readSmb(id:String,c:JSONObject,block:(ReadSmb)->T):T {
    readReaper
    val network=SmbHosts.network(context,c.getString("host"))
    readSessions.invalidate{it.network!=network.key}
    val key=ReadKey(id,readFingerprint(c),network.key)
    var created=false
    fun attempt()=readSessions.use(key,{
      created=true;val client=smbClient(network,15)
      try{ReadSmb(client,authenticate(client,c,network))}catch(error:Exception){client.close();throw error}
    }){connection->SmbHosts.requireCurrent(context,network);try{block(connection)}catch(error:Exception){throw readFailure(error,connection.alive)}}
    return try{attempt()}catch(error:IOException){
      if(created)throw error
      // A server may silently expire an idle socket. Retry an idempotent read
      // once with fresh authentication; never replay a write or an auth denial.
      readSessions.invalidate{it==key};attempt()
    }
  }
  private fun smbShares(id:String,c:JSONObject):List<SmbShare> = readSmb(id,c){connection->
    connection.serverShares.list()
  }
  private fun smb(c: JSONObject): Smb {
    val network=SmbHosts.network(context,c.getString("host"));val client=smbClient(network)
    try {
      val session=authenticate(client,c,network)
      val share=session.connectShare(c.getString("share")) as? DiskShare ?: error("不是文件共享")
      return Smb(client,share,session)
    } catch (e: Exception) { try{client.close()}catch(close:Exception){e.addSuppressed(close)}; throw e }
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
    if(l.serverRoot)try {
      val shares=shareReader?.invoke(l.c) ?: smbShares(l.id,l.c);require(shares.size<=4096){"服务器返回的共享过多，请指定共享名"}
      return shares.filter{it.type and 0xffff==0}.distinctBy{it.name.lowercase()}.map{
        NativeEntry(child(path,SafeFiles.name(it.name)),it.name,true)
      }.sortedBy{it.name.lowercase()}
    }catch(e:LinkageError){throw IOException("共享枚举组件不兼容，请更新应用；仍可编辑网络位置直接填写共享名称。",e)}
    catch(e:Exception){throw IOException("无法列出服务器共享：${e.message?:e.javaClass.simpleName}。请编辑网络位置填写账号/密码；如果服务器禁止枚举，也可直接填写共享名称。",e)}
    return when(l.c.getString("type")) {
      "rhfiles" -> RhFilesConnection(l.c).list(l.relative,path)
      "smb" -> readSmb(l.id,l.c) { connection -> connection.share(l.c.getString("share")).list(smbPath(l)).filter { it.fileName!="." && it.fileName!=".." }.take(50000).map {
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
    if(l.c.optString("type")=="rhfiles")return RhFilesConnection(l.c).stat(l.relative,path)
    if(l.relative.isEmpty()) return NativeEntry(path,Uri.parse(path).pathSegments.lastOrNull()?:l.c.getString("name"),true)
    if(l.c.getString("type")=="smb")return readSmb(l.id,l.c){connection->
      val info=connection.share(l.c.getString("share")).getFileInformation(smbPath(l))
      NativeEntry(path,Uri.parse(path).lastPathSegment?:"",info.standardInformation.isDirectory,info.standardInformation.endOfFile,info.basicInformation.lastWriteTime.toEpochMillis())
    }
    return list(parent(path)).find { it.name==l.relative.substringAfterLast('/') } ?: error("远程文件已不存在")
  }
  class MediaInput(val stream:InputStream,val totalLength:Long):Closeable {override fun close()=stream.close()}
  /** Streaming/range access for viewing only. Never creates a local file/task. */
  fun mediaInput(path:String,position:Long=0):MediaInput {
    require(position>=0){"媒体偏移无效"};val l=location(path)
    require(!l.serverRoot&&l.relative.isNotEmpty()){"不是媒体文件"}
    return when(l.c.getString("type")) {
      "smb"->{
        val s=smb(l.c)
        try {
          val file=s.share.openFile(smbPath(l),EnumSet.of(AccessMask.GENERIC_READ),null,SMB2ShareAccess.ALL,SMB2CreateDisposition.FILE_OPEN,null)
          try {
            val size=s.share.getFileInformation(smbPath(l)).standardInformation.endOfFile
            require(position<=size){"媒体偏移超出文件长度"}
            val stream=object:InputStream(){var at=position;val closed=java.util.concurrent.atomic.AtomicBoolean(false)
              override fun read():Int {val byte=ByteArray(1);return if(read(byte,0,1)<0)-1 else byte[0].toInt() and 255}
              @Synchronized override fun read(buffer:ByteArray,offset:Int,length:Int):Int {
                check(!closed.get()){"媒体流已关闭"};if(length==0)return 0;if(at>=size)return -1
                val count=file.read(buffer,at,offset,minOf(length.toLong(),size-at).toInt());if(count<=0)throw EOFException("远程媒体在读取期间发生改变或提前结束");at+=count;return count
              }
              // Closing must interrupt a blocked read, not wait on its monitor.
              // This exclusive read-only transport has no pending writes; TCP
              // teardown also releases the file handle at the server.
              override fun close(){if(closed.compareAndSet(false,true))closeReadSession(s.client,s.session)}
            }
            MediaInput(stream,size)
          }catch(error:Exception){file.close();throw error}
        }catch(error:Exception){closeReadSession(s.client,s.session);throw error}
      }
      "ftp","ftps"->{
        val f=ftp(l.c)
        try {
          if(position>0)f.restartOffset=position
          val stream=f.retrieveFileStream(ftpPath(l))?:throw IOException("服务器无法开始媒体读取或不支持拖动：${f.replyCode}")
          MediaInput(object:FilterInputStream(stream){override fun close(){try{super.close()}finally{f.disconnect()}}},-1)
        }catch(error:Exception){f.disconnect();throw error}
      }
      else->{
        val response=if(l.c.optString("type")=="rhfiles")RhFilesConnection(l.c).content(l.relative,position)else request(l,"GET",headers=mapOf("Range" to "bytes=$position-","Accept-Encoding" to "identity"))
        try {
          val range=response.header("Content-Range")
          val total=if(response.code==206){
            val match=Regex("bytes (\\d+)-(\\d+)/(\\d+)").matchEntire(range?:"")?:throw IOException("服务器返回了无效的媒体分段")
            val start=match.groupValues[1].toLong();val end=match.groupValues[2].toLong();val size=match.groupValues[3].toLong()
            require(start==position&&end>=start&&end<size){"服务器媒体偏移不一致"}
            require(response.header("Content-Encoding").let{it==null||it.equals("identity",true)}){"服务器返回了不支持的媒体编码"};size
          }else{require(position==0L){"此服务器不支持拖动媒体进度（HTTP Range）"};response.body!!.contentLength()}
          MediaInput(object:FilterInputStream(response.body!!.byteStream()){override fun close(){try{super.close()}finally{response.close()}}},total)
        }catch(error:Exception){response.close();throw error}
      }
    }
  }
  fun input(path: String): InputStream {
    val l=location(path)
    require(!l.serverRoot&&l.relative.isNotEmpty()){ "不能把服务器或共享根目录当作文件读取" }
    return when(l.c.getString("type")) {
      "smb" -> {
        val s=smb(l.c)
        try {
          val file=s.share.openFile(smbPath(l),EnumSet.of(AccessMask.GENERIC_READ),null,SMB2ShareAccess.ALL,SMB2CreateDisposition.FILE_OPEN,null)
          object: FilterInputStream(file.inputStream) {
            private var closed=false
            @Synchronized override fun close() {
              if(closed)return
              closed=true
              try { super.close() } finally { try { file.close() } finally { s.close() } }
            }
          }
        } catch(e:Exception) { s.close(); throw e }
      }
      "ftp", "ftps" -> {
        val f=ftp(l.c)
        try {
          val stream=f.retrieveFileStream(ftpPath(l)) ?: error("FTP 读取失败：${f.replyCode}")
          object: FilterInputStream(stream) { override fun close() { try { super.close(); require(f.completePendingCommand()) { "FTP 传输未完成" } } finally { f.disconnect() } } }
        } catch(e:Exception) { f.disconnect(); throw e }
      }
      else -> { val r=if(l.c.optString("type")=="rhfiles")RhFilesConnection(l.c).content(l.relative)else request(l,"GET"); object: FilterInputStream(r.body!!.byteStream()) { override fun close() { try { super.close() } finally { r.close() } } } }
    }
  }
  fun create(parent: String, name: String, dir: Boolean): String {
    require(!location(parent).serverRoot){"服务器列表不是文件目录，请先打开一个共享文件夹"}
    val path=child(parent,name); val l=location(path)
    when(l.c.getString("type")) {
      "rhfiles" -> if(dir)RhFilesConnection(l.c).mutate("mkdir",l.relative)else RhFilesConnection(l.c).upload(l.relative,ByteArrayInputStream(byteArrayOf()),0){}
      "smb" -> smb(l.c).use { s -> if(dir) s.share.mkdir(smbPath(l)) else s.share.openFile(smbPath(l),EnumSet.of(AccessMask.GENERIC_WRITE),null,SMB2ShareAccess.ALL,SMB2CreateDisposition.FILE_CREATE,null).close() }
      "ftp", "ftps" -> withFtp(l.c) { f -> require(if(dir) f.makeDirectory(ftpPath(l)) else f.storeFile(ftpPath(l),ByteArrayInputStream(byteArrayOf()))) { "FTP 创建失败：${f.replyCode}" } }
      else -> request(l,if(dir) "MKCOL" else "PUT",if(dir) null else byteArrayOf().toRequestBody(),mapOf("If-None-Match" to "*")).close()
    }; return path
  }
  fun write(path: String, input: InputStream, progress: (Int)->Unit) {
    val l=location(path)
    require(!l.serverRoot&&l.relative.isNotEmpty()){ "不能写入服务器或共享根目录" }
    when(l.c.getString("type")) {
      "rhfiles" -> error("首版 RHFiles 服务不覆盖已有文件，请复制为新文件或重命名后重试")
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
    require(!isRhFilesRoot(path)){"不能重命名共享入口，请打开共享后选择其中的文件夹"}
    val l=location(path); require(l.relative.isNotEmpty()) { "不能重命名网络根目录" }
    require(list(parent(path)).none { it.name==name }) { "目标已存在，未覆盖" }
    val target=child(parent(path),name); val to=location(target)
    when(l.c.getString("type")) {
      "rhfiles" -> RhFilesConnection(l.c).mutate("rename",l.relative,to.relative)
      "smb" -> smb(l.c).use { s -> s.share.open(smbPath(l),EnumSet.of(AccessMask.DELETE,AccessMask.GENERIC_READ),null,SMB2ShareAccess.ALL,SMB2CreateDisposition.FILE_OPEN,null).use { it.rename(smbPath(to),false) } }
      "ftp", "ftps" -> withFtp(l.c) { require(it.rename(ftpPath(l),ftpPath(to))) { "FTP 重命名失败：${it.replyCode}" } }
      else -> request(l,"MOVE",null,mapOf("Destination" to url(to).toString(),"Overwrite" to "F")).close()
    }; return target
  }
  fun delete(path: String) {
    require(!isRhFilesRoot(path)){"不能删除共享入口，请打开共享后选择其中的文件"}
    val entry=stat(path); val l=location(path); require(l.relative.isNotEmpty()) { "不能删除网络根目录" }
    when(l.c.getString("type")) {
      "rhfiles" -> RhFilesConnection(l.c).mutate("delete",l.relative)
      "smb" -> smb(l.c).use { if(entry.isDir) it.share.rmdir(smbPath(l),false) else it.share.rm(smbPath(l)) }
      "ftp", "ftps" -> withFtp(l.c) { require(if(entry.isDir) it.removeDirectory(ftpPath(l)) else it.deleteFile(ftpPath(l))) { "FTP 删除失败：${it.replyCode}" } }
      else -> request(l,"DELETE").close()
    }
  }
}
