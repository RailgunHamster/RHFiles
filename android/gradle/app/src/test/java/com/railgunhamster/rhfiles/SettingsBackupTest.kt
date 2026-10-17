package com.railgunhamster.rhfiles

import android.content.Context
import android.view.MotionEvent
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import javax.crypto.spec.SecretKeySpec

@RunWith(RobolectricTestRunner::class)
@Config(manifest=Config.NONE,sdk=[28])
class SettingsBackupTest {
  private val context get()=RuntimeEnvironment.getApplication()
  private fun remote(byte:Byte)=RemoteStorage(context,credentialKey={SecretKeySpec(ByteArray(32){byte},"AES")})
  private fun updates()=JSONObject().put("source","github").put("github","https://github.com/RailgunHamster/RHFiles").put("family","\\\\server\\share").put("connectionId","").put("proxy","http://127.0.0.1:7890").put("autoCheck",false).put("proxyEnabled",true)
  private fun profile()=JSONObject().put("type","smb").put("name","服务器").put("host","server").put("share","share").put("username","DOMAIN\\user").put("password","fixture-secret")
  @Test fun encryptedBackupRoundTripsWithoutPlaintextAndRejectsWrongPasswordOrTampering(){
    val payload=JSONObject().put("secret","fixture-secret");val pass="password-one".toCharArray();val sealed=SettingsBackup.seal(payload,pass)
    assertFalse(String(sealed).contains("fixture-secret"));assertEquals("fixture-secret",SettingsBackup.unseal(sealed,pass).getString("secret"))
    try{SettingsBackup.unseal(sealed,"password-two".toCharArray());fail()}catch(e:Exception){assertTrue(e.message!!.contains("密码"))}
    val envelope=JSONObject(String(sealed));val data=envelope.getString("data");envelope.put("data",(if(data[0]=='A')"B"else"A")+data.substring(1))
    try{SettingsBackup.unseal(envelope.toString().toByteArray(),pass);fail()}catch(_:Exception){}
    assertFalse(sealed.contentEquals(SettingsBackup.seal(payload,pass)))
  }
  @Test fun allSettingsAndCredentialsSurviveMigrationToADifferentDeviceKey(){
    val first=remote(1);val id=first.save(profile());ReaderSettings.replace(context,JSONObject().put("rhfiles.reader.options","{\"font\":24}").put("rhfiles.reader.book.abc","{\"cfi\":\"epubcfi(/6)\",\"bookmarks\":[]}"))
    val screens="""{"version":2,"screens":{"screen-1080x2092":{"portrait":"single","landscape":"columns"},"screen-1840x2208":{"portrait":"rows","landscape":"auto"}}}"""
    val web=JSONObject().put("rhfiles.theme","dark").put("rhfiles.panes","rows").put("rhfiles.panes.screens",screens).put("rhfiles.favorites","[{\"name\":\"网络\",\"path\":\"remote://$id/\"}]")
    val exported=SettingsBackup(context,first).snapshot(web,updates().put("connectionId",id))
    val next=remote(2);val store=SettingsBackup(context,next);store.apply(exported,JSONObject().put("rhfiles.theme","light"));val pending=store.pending()!!;assertEquals("dark",pending.getJSONObject("web").getString("rhfiles.theme"));assertEquals(screens,pending.getJSONObject("web").getString("rhfiles.panes.screens"));store.acknowledge(pending.getString("id"))
    assertEquals(id,next.backupProfiles().getJSONObject(0).getString("id"));assertEquals("fixture-secret",next.backupProfiles().getJSONObject(0).getJSONObject("config").getString("password"));assertTrue(ReaderSettings.state(context).toString().contains("epubcfi"));assertNull(store.pending());assertTrue(context.getSharedPreferences("updates-v1",Context.MODE_PRIVATE).getBoolean("proxyEnabled",false))
  }
  @Test fun crashBeforeFrontendAcknowledgementRestoresNativeAndWebSettings(){
    val remotes=remote(1);val original=remotes.save(profile());val store=SettingsBackup(context,remotes);val payload=store.snapshot(JSONObject().put("rhfiles.theme","dark"),updates());payload.put("profiles",org.json.JSONArray())
    store.apply(payload,JSONObject().put("rhfiles.theme","light"));assertEquals(0,remotes.connections().length());SettingsBackup(context,remotes).recover()
    assertEquals(original,remotes.connections().getJSONObject(0).getString("id"));assertEquals("light",store.pending()!!.getJSONObject("web").getString("rhfiles.theme"))
  }
  @Test fun invalidPayloadDoesNotMutateExistingSettings(){
    val remotes=remote(1);val id=remotes.save(profile());val store=SettingsBackup(context,remotes);val payload=store.snapshot(JSONObject(),updates());payload.getJSONObject("web").put("untrusted-key","value")
    try{store.apply(payload);fail()}catch(_:Exception){};assertEquals(id,remotes.connections().getJSONObject(0).getString("id"));assertNull(store.pending())
    payload.put("web",JSONObject());payload.getJSONObject("updates").put("connectionId","missing");try{store.apply(payload);fail()}catch(_:Exception){};assertEquals(id,remotes.connections().getJSONObject(0).getString("id"))
  }
  @Test fun readerStoreRejectsNonReaderKeysAndKeepsOtherBooks(){
    ReaderSettings.replace(context,JSONObject().put("rhfiles.reader.book.abc","{}"));ReaderSettings.update(context,"rhfiles.reader.options","{\"font\":18}")
    assertEquals(2,ReaderSettings.state(context).getJSONObject("values").length());try{ReaderSettings.update(context,"../../files","{}");fail()}catch(_:Exception){};assertEquals(2,ReaderSettings.state(context).getJSONObject("values").length())
  }
  @Test fun invalidScreenMapsAreRejectedAndLegacyBackupsRemainCompatible(){
    SettingsBackup.validateWeb(JSONObject().put("rhfiles.panes","rows"))
    SettingsBackup.validateWeb(JSONObject().put("rhfiles.panes.screens","""{"version":1,"screens":{"screen-1080x2092":"rows"}}"""))
    for(text in listOf("null","[]","{\"version\":\"1\",\"screens\":{}}","{\"version\":1,\"screens\":[]}","{\"version\":1,\"screens\":{\"__proto__\":\"rows\"}}","{\"version\":1,\"screens\":{\"screen-1080x2092\":false}}","{\"version\":1,\"screens\":{},\"extra\":1}")){
      try{SettingsBackup.validateWeb(JSONObject().put("rhfiles.panes.screens",text));fail("Accepted $text")}catch(_:Exception){}
    }
    val tooMany=JSONObject();for(i in 10..42)tooMany.put("screen-${i}x100","rows")
    try{SettingsBackup.validateWeb(JSONObject().put("rhfiles.panes.screens",JSONObject().put("version",1).put("screens",tooMany).toString()));fail("Accepted too many screens")}catch(_:Exception){}
  }
  @Test fun invalidOrientationProfilesAreRejectedWithoutMutatingAnySettings(){
    val remotes=remote(1);val id=remotes.save(profile());val store=SettingsBackup(context,remotes)
    for(profile in listOf("null","[]","{}","\"rows\"","{\"portrait\":false}","{\"portrait\":\"rows\",\"other\":\"single\"}","{\"landscape\":\"bad\"}")){
      val web=JSONObject().put("rhfiles.panes.screens","""{"version":2,"screens":{"screen-1080x2092":$profile}}""")
      val payload=store.snapshot(JSONObject(),updates()).put("web",web)
      try{store.apply(payload);fail("Accepted $profile")}catch(_:Exception){}
      assertEquals(id,remotes.connections().getJSONObject(0).getString("id"));assertNull(store.pending())
    }
  }
  @Test fun motionRelayIncludesBothPointerIdsAndNormalizesCoordinates(){
    val relay=PaneTouchRelay();val down=MotionEvent.obtain(0,1,MotionEvent.ACTION_DOWN,20f,30f,0);assertNull(relay.sample(down,100,100));relay.enabled=true;assertEquals("start",relay.sample(down,100,100)!!.getString("phase"));down.recycle()
    val properties=Array(2){i->MotionEvent.PointerProperties().apply{id=i;toolType=MotionEvent.TOOL_TYPE_FINGER}}
    val coords=Array(2){i->MotionEvent.PointerCoords().apply{x=if(i==0)20f else 80f;y=50f;pressure=1f;size=1f}}
    val event=MotionEvent.obtain(0,2,MotionEvent.ACTION_MOVE,2,properties,coords,0,0,1f,1f,0,0,android.view.InputDevice.SOURCE_TOUCHSCREEN,0)
    val points=relay.sample(event,100,100)!!.getJSONArray("points");assertEquals(2,points.length());assertFalse(points.getJSONObject(0).getBoolean("secondary"));assertTrue(points.getJSONObject(1).getBoolean("secondary"));assertEquals(.8,points.getJSONObject(1).getDouble("x"),.001);event.recycle()
  }
}
