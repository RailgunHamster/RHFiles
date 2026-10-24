package com.railgunhamster.rhfiles

import android.net.Uri
import android.util.Base64
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.*
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.*
import com.railgunhamster.rhfiles.SafeFiles.readBytesBounded

/** Native HTTPS API. The paired SHA-256 certificate is the device identity;
 * credentials stay in RemoteStorage's Android Keystore encrypted profiles. */
internal class RhFilesConnection(private val config:JSONObject) {
  companion object {
    private val clients=linkedMapOf<String,OkHttpClient>()
    private val JSON="application/json; charset=utf-8".toMediaType()
    internal fun valid(c:JSONObject) {
      val u=c.getString("url").toHttpUrl()
      require(u.isHttps&&u.username.isEmpty()&&u.password.isEmpty()&&u.query==null&&u.fragment==null&&u.encodedPath=="/"){"RHFiles 地址必须是 HTTPS 主机和端口，不含路径或账号"}
      require(PairingData.localAddress(u.host)){"仅允许本机、局域网或 Tailscale IPv4 地址 / Local, LAN or Tailscale IPv4 address required"}
      require(c.optString("fingerprint").matches(Regex("[0-9a-f]{64}"))){"需要电脑端证书 SHA-256 指纹"}
    }
    @Synchronized internal fun client(c:JSONObject):OkHttpClient {
      valid(c);val host=c.getString("url").toHttpUrl().host;val pin=c.getString("fingerprint");val key="$host:$pin"
      clients[key]?.let{return it}
      val trust=object:X509TrustManager {
        override fun getAcceptedIssuers()=emptyArray<X509Certificate>()
        override fun checkClientTrusted(chain:Array<X509Certificate>,auth:String){throw CertificateException("Unsupported client certificate")}
        override fun checkServerTrusted(chain:Array<X509Certificate>,auth:String) {
          if(chain.isEmpty())throw CertificateException("Missing server certificate")
          chain[0].checkValidity()
          val actual=MessageDigest.getInstance("SHA-256").digest(chain[0].encoded)
          val expected=pin.chunked(2).map{it.toInt(16).toByte()}.toByteArray()
          if(!MessageDigest.isEqual(actual,expected))throw CertificateException("电脑证书已改变，请重新配对；已阻止发送登录凭据")
        }
      }
      val tls=SSLContext.getInstance("TLS").apply{init(null,arrayOf<TrustManager>(trust),SecureRandom())}
      val client=OkHttpClient.Builder().sslSocketFactory(tls.socketFactory,trust)
        // Explicit certificate pairing replaces CA/hostname identity, but this
        // verifier is never usable for a host other than this paired endpoint.
        .hostnameVerifier{hostname,_->hostname==host}.connectTimeout(8,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS).writeTimeout(30,TimeUnit.SECONDS)
        .followRedirects(false).followSslRedirects(false).proxy(java.net.Proxy.NO_PROXY).build()
      if(clients.size>=32){val first=clients.keys.first();clients.remove(first)?.connectionPool?.evictAll()};clients[key]=client;return client
    }
    fun pair(uri:String,name:String,deviceName:String):JSONObject {
      val data=PairingData.parse(uri)
      require(name.isNotBlank()&&name.length<=120){"请填写设备名称"}
      val clientName=DeviceNames.normalize(deviceName)?:throw IllegalArgumentException("无法读取本机设备名称")
      val addresses=data.getJSONArray("endpoints");require(addresses.length() in 1..16){"电脑未提供可用地址"}
      val local=runCatching{java.net.NetworkInterface.getNetworkInterfaces().toList().flatMap{network->network.interfaceAddresses.mapNotNull{address->address.address.hostAddress?.let{it to address.networkPrefixLength.toInt()}}}}.getOrDefault(emptyList())
      val endpoints=PairingData.preferredEndpoints((0 until addresses.length()).map{addresses.getString(it)},local)
      require(data.getString("code").matches(Regex("[0-9]{10}"))){"配对码无效"}
      var failure:IOException?=null
      for(endpoint in endpoints) {
        val c=JSONObject().put("type","rhfiles").put("name",name).put("url",endpoint).put("fingerprint",data.getString("fingerprint"));valid(c)
        try {
          // The saved computer label and this phone's name are different data.
          val response=RhFilesConnection(c).request("POST","/api/v1/pair",body=JSONObject().put("code",data.getString("code")).put("name",clientName).toString().toRequestBody(JSON),authenticate=false)
          response.use{val credential=JSONObject(String(it.body!!.byteStream().readBytesBounded(16384),Charsets.UTF_8));return c.put("username",credential.getString("username")).put("password",credential.getString("password"))}
        }catch(e:HttpFailure){throw e}catch(e:SSLException){throw e}catch(e:IOException){failure=e}
      }
      throw IOException("无法连接电脑，请确认同一局域网、服务已启动，并检查防火墙。${failure?.message}",failure)
    }
  }
  internal class HttpFailure(val status:Int,message:String):IOException(message)
  private fun request(method:String,endpoint:String,path:String?=null,body:RequestBody?=null,headers:Map<String,String> = emptyMap(),authenticate:Boolean=true,extra:Map<String,String> = emptyMap(),retryGroup:Boolean=true):Response {
    valid(config);require(endpoint.startsWith("/api/v1/")&&!endpoint.contains("?")&&!endpoint.contains("#")){"非法接口路径"}
    val url=config.getString("url").toHttpUrl().newBuilder().encodedPath(endpoint).apply{if(path!=null)addQueryParameter("path",path);extra.forEach{(k,v)->addQueryParameter(k,v)}}.build()
    val builder=Request.Builder().url(url).method(method,body)
    if(authenticate){if(config.optString("groupId").isNotEmpty())builder.header("Authorization",DeviceGroups.authorization(config))else{require(config.optString("username").isNotEmpty()&&config.optString("password").isNotEmpty()){"此设备需要重新配对"};builder.header("Authorization",Credentials.basic(config.getString("username"),config.getString("password"),Charsets.UTF_8))}}
    headers.forEach{(k,v)->builder.header(k,v)}
    val response=client(config).newCall(builder.build()).execute()
    // A service restart discards RAM sessions, not group trust. HTTP 401 is an
    // authentication rejection before file dispatch. Retry only replayable
    // bodies once; tus offsets still guard any partially staged PATCH.
    if(response.code==401&&authenticate&&retryGroup&&config.optString("groupId").isNotEmpty()&&body?.isOneShot()!=true&&body?.isDuplex()!=true){response.close();DeviceGroups.invalidate(config);return request(method,endpoint,path,body,headers,authenticate,extra,false)}
    if(!response.isSuccessful){val detail=try{JSONObject(String(response.body!!.byteStream().readBytesBounded(16384),Charsets.UTF_8)).optJSONObject("error")?.optString("message")}catch(_:Exception){null};response.close();throw HttpFailure(response.code,"RHFiles：HTTP ${response.code} · "+(detail?:when(response.code){401->"授权已失效，请重新配对";403->"电脑端未授予此权限";409,412->"目标已存在或目录已变化，未覆盖";423->"文件被其他客户端锁定";else->"请求失败"}))};return response
  }
  private fun objectReply(r:Response)=r.use{JSONObject(String(it.body!!.byteStream().readBytesBounded(8*1024*1024),Charsets.UTF_8))}
  private fun entry(v:JSONObject,path:String)=NativeEntry(path,v.getString("name"),v.getBoolean("isDir"),v.getLong("size"),v.getLong("modifiedMs"))
  fun list(relative:String,parent:String):List<NativeEntry> {
    val result=mutableListOf<NativeEntry>();var revision:String?=null
    do {
      val page=objectReply(request("GET","/api/v1/list","/$relative",extra=buildMap{put("offset",result.size.toString());put("limit","2000");revision?.let{put("revision",it)}}));revision=page.getString("revision")
      val entries=page.getJSONArray("entries");require(page.getInt("total")<=50000){"目录超过五万项，请缩小范围"}
      for(i in 0 until entries.length()){val v=entries.getJSONObject(i);val name=SafeFiles.name(v.getString("name"));require(v.getString("path")=="/${relative.trimEnd('/')}/$name".replace("//","/")){"目录项超出请求范围"};result.add(entry(v,parent.trimEnd('/')+"/"+Uri.encode(name)))}
      require(entries.length()>0||result.size==page.getInt("total")){"目录分页不完整"}
    }while(result.size<page.getInt("total"));return result
  }
  fun stat(relative:String,path:String)=entry(objectReply(request("GET","/api/v1/stat","/$relative")),path)
  fun content(relative:String,position:Long=0):Response=request("GET","/api/v1/content","/$relative",headers=mapOf("Range" to "bytes=$position-","Accept-Encoding" to "identity"))
  fun thumbnail(relative:String):JSONObject=request("GET","/api/v1/thumbnail","/$relative").use{JSONObject().put("dataUrl","data:image/png;base64,"+Base64.encodeToString(it.body!!.byteStream().readBytesBounded(1024*1024),Base64.NO_WRAP))}
  fun mutate(action:String,relative:String,destination:String?=null){require(action in listOf("mkdir","rename","delete"));val v=JSONObject().put("path","/$relative");if(destination!=null)v.put("destination","/$destination");request("POST","/api/v1/$action",body=v.toString().toRequestBody(JSON)).close()}
  /** Retain one bounded chunk until HEAD confirms its offset. Never replay a
   * non-idempotent whole-file PUT after a transport failure. */
  fun upload(relative:String,input:InputStream,length:Long,progress:(Int)->Unit) {
    require(length>=0){"来源长度未知，请先另存到本机后上传"}
    val creation=request("POST","/api/v1/uploads",body=byteArrayOf().toRequestBody(),headers=mapOf("Tus-Resumable" to "1.0.0","Upload-Length" to length.toString(),"Upload-Metadata" to "path "+Base64.encodeToString("/$relative".toByteArray(Charsets.UTF_8),Base64.NO_WRAP)))
    val location=creation.use{it.header("Location")?:error("缺少上传任务地址")};require(location.matches(Regex("/api/v1/uploads/[A-Za-z0-9_-]{43}"))){"上传地址无效"}
    var offset=0L
    try {
      val buffer=ByteArray(1024*1024)
      while(offset<length) {
        val count=minOf(buffer.size.toLong(),length-offset).toInt();var read=0
        while(read<count){val n=input.read(buffer,read,count-read);if(n<0)throw EOFException("来源提前结束，未发布到电脑");check(n>0){"来源读取没有进展"};read+=n}
        val base=offset;var confirmed=offset;var retries=0
        while(confirmed<base+count){
          try {
            val from=(confirmed-base).toInt();val response=request("PATCH",location,body=buffer.copyOfRange(from,count).toRequestBody("application/offset+octet-stream".toMediaType()),headers=mapOf("Tus-Resumable" to "1.0.0","Upload-Offset" to confirmed.toString()))
            confirmed=response.use{it.header("Upload-Offset")?.toLongOrNull()?:error("缺少上传进度")};require(confirmed==base+count){"上传进度异常"}
          }catch(e:IOException){
            if(Thread.currentThread().isInterrupted||e is HttpFailure&&e.status!=409||++retries>2)throw e
            val response=request("HEAD",location,headers=mapOf("Tus-Resumable" to "1.0.0"));confirmed=response.use{it.header("Upload-Offset")?.toLongOrNull()?:throw IOException("无法恢复上传偏移")};require(confirmed in base..base+count){"上传偏移超出本次数据范围"}
          }
        }
        offset=confirmed;progress(count)
      }
      require(input.read()==-1){"来源长度发生变化，请检查目标副本"}
      try{request("DELETE",location,headers=mapOf("Tus-Resumable" to "1.0.0")).close()}catch(_:IOException){}
    }catch(e:Exception){try{request("DELETE",location,headers=mapOf("Tus-Resumable" to "1.0.0")).close()}catch(_:Exception){};throw e}
  }
}
