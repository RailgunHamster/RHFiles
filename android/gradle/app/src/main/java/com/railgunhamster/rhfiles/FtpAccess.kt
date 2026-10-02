package com.railgunhamster.rhfiles

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import org.apache.ftpserver.FtpServer
import org.apache.ftpserver.FtpServerFactory
import org.apache.ftpserver.ConnectionConfigFactory
import org.apache.ftpserver.DataConnectionConfigurationFactory
import org.apache.ftpserver.listener.ListenerFactory
import org.apache.ftpserver.filesystem.nativefs.NativeFileSystemFactory
import org.apache.ftpserver.ftplet.*
import org.apache.ftpserver.usermanager.UsernamePasswordAuthentication
import org.apache.ftpserver.usermanager.impl.BaseUser
import org.apache.ftpserver.usermanager.impl.WritePermission
import org.apache.ftpserver.usermanager.impl.ConcurrentLoginPermission
import org.apache.ftpserver.usermanager.impl.TransferRatePermission
import org.json.JSONObject
import org.json.JSONArray
import java.io.*
import java.net.NetworkInterface
import java.net.Inet4Address
import java.security.SecureRandom
import java.util.Base64

/** FTP is opt-in, password protected, passive-only and jailed to one chosen local directory. */
object FtpAccess {
  @Volatile private var server:FtpServer?=null
  private var password=""
  private var root=""
  private var port=0
  private var readOnly=true
  val running get()=server!=null
  internal val instanceToken get()=server
  internal fun stopAsync(expected:FtpServer?):Thread? {
    if(expected==null)return null
    return Thread { synchronized(this) { if(server===expected)stop() } }.apply{start()}
  }
  @Synchronized fun status():JSONObject {
    val addresses=try{NetworkInterface.getNetworkInterfaces().toList().filter{it.isUp&&!it.isLoopback}.flatMap{it.inetAddresses.toList()}.filterIsInstance<Inet4Address>().map{"ftp://${it.hostAddress}:$port/"}}catch(_:Exception){emptyList()}
    return JSONObject().put("running",running).put("root",root).put("port",port).put("username","rhfiles")
      .put("password",if(running)password else "").put("readOnly",readOnly).put("urls",JSONArray(if(running)addresses else emptyList<String>()))
  }
  @Synchronized fun start(context:Context,args:JSONObject):JSONObject {
    if(running)return status()
    val folder=NativeStorage(context).local(args.getString("root"));require(folder.isDirectory){"共享目标必须是本地文件夹"}
    val requestedPort=args.optInt("port",2121);require(requestedPort in 1024..65535){"端口必须介于 1024 和 65535"}
    require(args.optBoolean("trustedNetwork")){"FTP 不加密，请确认只在可信局域网使用"}
    val secret=ByteArray(18).also{SecureRandom().nextBytes(it)};val nextPassword=Base64.getUrlEncoder().withoutPadding().encodeToString(secret)
    val readonly=args.optBoolean("readOnly",true)
    val ftp=create(folder,requestedPort,nextPassword,readonly)
    try {
      ftp.start();server=ftp;password=nextPassword;root=folder.path;port=requestedPort;readOnly=readonly
      ContextCompat.startForegroundService(context,Intent(context,FileTaskService::class.java))
    }catch(e:Exception){ftp.stop();server=null;password="";throw e}
    return status()
  }
  @Synchronized fun stop():JSONObject {val old=server;server=null;password="";old?.stop();FileTasks.service?.finishIfIdle();return status()}

  /** The same factory is exercised by loopback protocol tests; no Android service is mocked into a pass. */
  internal fun create(root:File,port:Int,password:String,readOnly:Boolean,address:String="0.0.0.0"):FtpServer {
    val factory=FtpServerFactory()
    val listener=ListenerFactory().apply {
      this.port=port;serverAddress=address;idleTimeout=300
      dataConnectionConfiguration=DataConnectionConfigurationFactory().apply{
        isActiveEnabled=false;isPassiveIpCheck=true;idleTime=30
      }.createDataConnectionConfiguration()
    }
    factory.addListener("default",listener.createListener())
    factory.connectionConfig=ConnectionConfigFactory().apply{isAnonymousLoginEnabled=false;maxLogins=4;maxThreads=8;maxLoginFailures=3;loginFailureDelay=1000}.createConnectionConfig()
    val user=BaseUser().apply{
      name="rhfiles";this.password=password;homeDirectory=root.canonicalPath;maxIdleTime=300
      // A custom manager must supply these itself; the stock properties manager
      // adds them while loading a user. Without them USER is rejected with 421.
      authorities=mutableListOf<Authority>(ConcurrentLoginPermission(4,4),TransferRatePermission(0,0)).apply{if(!readOnly)add(WritePermission())}
    }
    factory.userManager=object:UserManager {
      override fun getUserByName(name:String):User?=if(name==user.name)user else null
      override fun getAllUserNames()=arrayOf(user.name)
      override fun doesExist(name:String)=name==user.name
      override fun getAdminName()=""
      override fun isAdmin(name:String)=false
      override fun delete(name:String){throw FtpException("Read-only user configuration")}
      override fun save(value:User){throw FtpException("Read-only user configuration")}
      override fun authenticate(auth:Authentication):User {
        if(auth is UsernamePasswordAuthentication && auth.username==user.name && auth.password==password)return user
        throw AuthenticationFailedException("Invalid credentials")
      }
    }
    val native=NativeFileSystemFactory()
    factory.fileSystem=FileSystemFactory {account->
      val view=native.createFileSystemView(account)
      object:FileSystemView by view {
        override fun getHomeDirectory()=guard(view.homeDirectory,root,readOnly)
        override fun getWorkingDirectory()=guard(view.workingDirectory,root,readOnly)
        override fun getFile(path:String)=guard(view.getFile(path),root,readOnly)
        override fun changeWorkingDirectory(path:String):Boolean {
          if(!safe(view.getFile(path),root))return false
          return view.changeWorkingDirectory(path)
        }
      }
    }
    return factory.createServer()
  }
  private fun safe(file:FtpFile,root:File):Boolean = try {
    val physical=file.physicalFile as File;val resolved=physical.canonicalFile
    !SafeFiles.isLink(physical) && (resolved==root.canonicalFile || resolved.path.startsWith(root.canonicalPath+File.separator))
  }catch(_:Exception){false}
  private fun guard(file:FtpFile,root:File,readOnly:Boolean):FtpFile {
    fun allowed()=safe(file,root)
    return object:FtpFile by file {
      override fun doesExist()=allowed()&&file.doesExist()
      override fun isReadable()=allowed()&&file.isReadable
      override fun isWritable()=allowed()&&!readOnly&&!file.doesExist()
      override fun isRemovable()=false
      override fun delete()=false
      override fun move(destination:FtpFile)=false
      override fun setLastModified(time:Long)=false
      override fun mkdir()=allowed()&&!readOnly&&!file.doesExist()&&file.mkdir()
      override fun listFiles():List<FtpFile> {
        if(!allowed())throw IOException("Outside shared folder")
        return file.listFiles().filter{safe(it,root)}.take(50000).map{guard(it,root,readOnly)}
      }
      override fun createInputStream(offset:Long):InputStream {
        if(!allowed())throw IOException("Outside shared folder")
        return file.createInputStream(offset)
      }
      override fun createOutputStream(offset:Long):OutputStream {
        if(!allowed()||readOnly||offset!=0L)throw IOException("Read-only, outside root or resume unsupported")
        val target=file.physicalFile as File
        // CREATE_NEW also protects a file that appeared after isWritable().
        val stream=java.nio.file.Files.newOutputStream(target.toPath(),java.nio.file.StandardOpenOption.CREATE_NEW,java.nio.file.StandardOpenOption.WRITE)
        return stream
      }
    }
  }
}
