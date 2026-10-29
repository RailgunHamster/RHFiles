package com.railgunhamster.rhfiles

import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.RobolectricTestRunner
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
import okhttp3.mockwebserver.*
import java.io.File
import java.util.concurrent.*
import javax.crypto.KeyGenerator

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RhVideoLoginTest {
  private val context get()=RuntimeEnvironment.getApplication()
  private lateinit var server:MockWebServer
  private val key=KeyGenerator.getInstance("AES").apply{init(256)}.generateKey()
  private var now=1_800_000_000_000L
  private fun vault()=RhVideoCredentials(context){key}
  private fun client()=RhVideoClient(context,credentialStore=vault(),loginClock={now})
  @Before fun setup(){vault().clear();server=MockWebServer();server.start()}
  @After fun close(){vault().clear();server.shutdown()}
  private fun json(body:String,code:Int=200)=MockResponse().setHeader("Content-Type","application/json").setResponseCode(code).setBody(body)
  private fun login(c:RhVideoClient,user:String="demo",token:String="native-login-only",expires:Long=1800){server.enqueue(json("""{"access_token":"$token","expires_in":$expires}"""));c.connect(JSONObject().put("server",server.url("/").toString()).put("username",user).put("password","never-persist-password"));assertEquals("/api/v1/auth/login",server.takeRequest(5,TimeUnit.SECONDS)!!.path)}
  private fun registration(user:String="new-account")=JSONObject().put("server",server.url("/").toString()).put("username",user).put("password","new-account-password")
  @Test fun registrationCreatesOnlyTheServerAccountAndDoesNotSignIn(){
    val c=client();server.enqueue(json("""{"user_id":"created-account"}"""));assertTrue((c.request("register",registration()) as JSONObject).getBoolean("registered"))
    val request=server.takeRequest(5,TimeUnit.SECONDS)!!;assertEquals("/api/v1/auth/register",request.path);assertEquals("new-account@temp.com",JSONObject(request.body.readUtf8()).getString("email"));assertEquals(1,server.requestCount);assertFalse(c.state().getBoolean("connected"));assertFalse(vault().exists());assertTrue(context.getSharedPreferences("rhvideo-client-v1",0).all.values.none{it.toString().contains("new-account-password")})
  }
  @Test fun successfulOrFailedRegistrationCannotRevokeTheExistingLoginOrPersistANewPassword(){
    val c=client();login(c);val record=File(context.noBackupFilesDir,"rhvideo-login-v1.enc").readBytes();val generation=c.state().getLong("generation")
    server.enqueue(json("""{"user_id":"created-account"}"""));c.request("register",registration());server.takeRequest();assertEquals("demo",c.state().getString("username"));assertEquals(generation,c.state().getLong("generation"));assertArrayEquals(record,File(context.noBackupFilesDir,"rhvideo-login-v1.enc").readBytes())
    server.enqueue(json("{}",400));try{c.request("register",registration());fail("Duplicate registration accepted")}catch(e:Exception){assertTrue(e.message!!.contains("HTTP 400"))};server.takeRequest();assertEquals(3,server.requestCount);assertEquals("demo",c.state().getString("username"));assertArrayEquals(record,File(context.noBackupFilesDir,"rhvideo-login-v1.enc").readBytes())
  }
  @Test fun registrationValidatesBeforeSendingAndDoesNotReplayUnconfirmedResults(){
    val c=client();try{c.request("register",registration("x"));fail("Short username accepted")}catch(_:Exception){};assertEquals(0,server.requestCount)
    server.enqueue(json("{}"));try{c.request("register",registration());fail("Unconfirmed registration accepted")}catch(e:Exception){assertTrue(e.message!!.contains("核对"))};assertEquals(1,server.requestCount);assertFalse(c.state().getBoolean("connected"));assertFalse(vault().exists())
  }
  @Test fun protectedLoginRestoresIntoANewClientWithoutPasswordLoginOrUiTokens(){
    val first=client();login(first);assertTrue(first.state().getBoolean("credentialsPersisted"));val data=File(context.noBackupFilesDir,"rhvideo-login-v1.enc").readBytes();assertFalse(data.toString(Charsets.UTF_8).contains("native-login-only"));assertFalse(data.toString(Charsets.UTF_8).contains("never-persist-password"))
    val next=client();assertFalse(next.state().getBoolean("connected"));server.enqueue(json("""{"username":"demo","is_active":true}"""));val result=next.restore();assertTrue(result.getBoolean("connected"));assertFalse(result.toString().contains("native-login-only"));val request=server.takeRequest(5,TimeUnit.SECONDS)!!;assertEquals("/api/v1/auth/me",request.path);assertEquals("Bearer native-login-only",request.getHeader("Authorization"));assertEquals(2,server.requestCount)
    next.restore();assertEquals(2,server.requestCount);assertFalse(context.getSharedPreferences("rhvideo-client-v1",0).all.toString().contains("native-login-only"))
    val backup=SettingsBackup(context).snapshot(JSONObject(),JSONObject()).toString();assertFalse(backup.contains("native-login-only"));assertFalse(backup.contains("rhvideo-login"));assertFalse(backup.contains("never-persist-password"))
    next.logout();assertFalse(client().restore().getBoolean("connected"));assertFalse(vault().exists());assertEquals(2,server.requestCount)
  }
  @Test fun authDenialClearsSavedLoginButTemporaryServerFailureDoesNotLoopOrForgetIt(){
    login(client());server.enqueue(json("{}",503));val offline=client();val failed=offline.restore();assertFalse(failed.getBoolean("connected"));assertTrue(vault().exists());assertFalse(failed.getString("loginWarning").isEmpty());offline.restore();assertEquals(2,server.requestCount);server.takeRequest()
    server.enqueue(json("""{"username":"demo"}"""));assertTrue(offline.restore(true).getBoolean("connected"));assertEquals(3,server.requestCount);server.takeRequest()
    server.enqueue(json("{}",401));val denied=client().restore();assertFalse(denied.getBoolean("connected"));assertFalse(vault().exists());assertFalse(denied.toString().contains("native-login-only"));assertFalse(client().restore().getBoolean("connected"));assertEquals(4,server.requestCount)
  }
  @Test fun expiredSavedTokenRefreshesOnceAndPersistsTheReplacement(){
    vault().save(RhVideoCredentials.Record(server.url("/").toString(),"demo","old-token",1));server.enqueue(json("""{"access_token":"new-token"}"""));server.enqueue(json("""{"username":"demo"}"""));val c=client();assertTrue(c.restore().getBoolean("connected"));assertEquals("/api/v1/auth/refresh",server.takeRequest().path);assertEquals("Bearer new-token",server.takeRequest().getHeader("Authorization"));assertEquals("new-token",vault().read()!!.token);assertFalse(c.state().toString().contains("new-token"))
  }
  @Test fun aLateRestoreCannotResurrectLogoutOrOverwriteAnotherAccount(){
    login(client());val entered=CountDownLatch(1);val release=CountDownLatch(1)
    server.dispatcher=object:Dispatcher(){override fun dispatch(request:RecordedRequest):MockResponse{if(request.path=="/api/v1/auth/me"){entered.countDown();release.await(8,TimeUnit.SECONDS);return json("""{"username":"demo"}""")};return json("""{"access_token":"other-native-token"}""")}}
    val c=client();val pool=Executors.newSingleThreadExecutor();try{val old=pool.submit<JSONObject>{c.restore()};assertTrue(entered.await(5,TimeUnit.SECONDS));c.logout();assertFalse(vault().exists());release.countDown();assertFalse(old.get(8,TimeUnit.SECONDS).getBoolean("connected"));assertFalse(vault().exists())}finally{release.countDown();pool.shutdownNow()}
    // New explicit login invalidates the old account, even if its validation
    // response arrives afterward. No old token may be re-saved.
    val gate=CountDownLatch(1);val done=CountDownLatch(1);vault().save(RhVideoCredentials.Record(server.url("/").toString(),"demo","old-native-token",now+60000))
    server.dispatcher=object:Dispatcher(){override fun dispatch(request:RecordedRequest):MockResponse{if(request.path=="/api/v1/auth/me"){gate.countDown();done.await(8,TimeUnit.SECONDS);return json("""{"username":"demo"}""")};return json("""{"access_token":"other-native-token"}""")}}
    val other=client();val worker=Executors.newSingleThreadExecutor();try{val old=worker.submit<JSONObject>{other.restore()};assertTrue(gate.await(5,TimeUnit.SECONDS));other.connect(JSONObject().put("server",server.url("/").toString()).put("username","other").put("password","test-only"));done.countDown();assertEquals("other",old.get(8,TimeUnit.SECONDS).getString("username"));assertEquals("other-native-token",vault().read()!!.token);assertEquals("other",vault().read()!!.username)}finally{done.countDown();worker.shutdownNow()}
  }
  @Test fun corruptCopiedAndWrongAccountRecordsNeverAuthenticateOrBecomePlaintextFallbacks(){
    val value=RhVideoCredentials.Record(server.url("/").toString(),"demo","private-token",now+60000);vault().save(value)
    val wrongKey=KeyGenerator.getInstance("AES").apply{init(256)}.generateKey();try{RhVideoCredentials(context){wrongKey}.read();fail("Wrong key decoded a login")}catch(_:Exception){}
    val file=File(context.noBackupFilesDir,"rhvideo-login-v1.enc");val bytes=file.readBytes();bytes[bytes.lastIndex]=(bytes.last().toInt() xor 1).toByte();file.writeBytes(bytes);assertFalse(client().restore().getBoolean("connected"));assertEquals(0,server.requestCount)
    vault().save(value);server.enqueue(json("""{"username":"someone-else"}"""));assertFalse(client().restore().getBoolean("connected"));assertFalse(vault().exists());assertEquals(1,server.requestCount)
  }
  @Test fun currentAccount401RevokesTheSavedLogin(){
    val c=client();login(c);server.enqueue(json("{}",401));try{c.request("favorites",JSONObject());fail("Unauthorized favorites accepted")}catch(_:Exception){};assertFalse(c.state().getBoolean("connected"));assertFalse(vault().exists());server.takeRequest()
    login(c,"other","replacement-token");assertEquals("replacement-token",vault().read()!!.token);assertTrue(c.state().getBoolean("connected"))
  }
  @Test fun aLate401CannotRevokeANewAccountAndALateRefreshCannotPersistItsOldToken(){
    for(refresh in listOf(false,true)){
      val c=client();server.dispatcher=QueueDispatcher();login(c,expires=if(refresh)60 else 1800);if(refresh)now+=2000
      val entered=CountDownLatch(1);val release=CountDownLatch(1)
      server.dispatcher=object:Dispatcher(){override fun dispatch(request:RecordedRequest):MockResponse{
        if(request.path=="/api/v1/auth/login")return json("""{"access_token":"replacement-token"}""")
        entered.countDown();release.await(8,TimeUnit.SECONDS);return if(refresh)json("""{"access_token":"late-old-token"}""")else json("{}",401)
      }}
      val worker=Executors.newSingleThreadExecutor();try{
        val old=worker.submit<Boolean>{try{c.request("favorites",JSONObject());false}catch(_:Exception){true}};assertTrue(entered.await(5,TimeUnit.SECONDS));server.takeRequest()
        c.connect(JSONObject().put("server",server.url("/").toString()).put("username","other").put("password","test-only"));server.takeRequest();release.countDown();assertTrue(old.get(8,TimeUnit.SECONDS));assertTrue(c.state().getBoolean("connected"));assertEquals("other",c.state().getString("username"));assertEquals("replacement-token",vault().read()!!.token)
      }finally{release.countDown();worker.shutdownNow()}
    }
  }
}
