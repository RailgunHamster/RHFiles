package com.railgunhamster.rhfiles

import android.content.Context
import android.content.ContextWrapper
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import okhttp3.mockwebserver.*
import java.io.File
import java.util.UUID
import javax.crypto.spec.SecretKeySpec

@RunWith(RobolectricTestRunner::class) @Config(manifest=Config.NONE,sdk=[28])
class ConfigSyncTest {
  private class Device(base:Context,val id:String):ContextWrapper(base){
    override fun getSharedPreferences(name:String,mode:Int)=super.getSharedPreferences("$id-$name",mode)
    override fun getFilesDir()=File(super.getFilesDir(),id).apply{mkdirs()}
  }
  private val app get()=RuntimeEnvironment.getApplication()
  private fun device(id:String)=Device(app,id)
  private fun remotes(c:Context,byte:Byte)=RemoteStorage(c,credentialKey={SecretKeySpec(ByteArray(32){byte},"AES")})
  private fun profile(name:String="NAS",password:String="local-secret")=JSONObject().put("type","smb").put("name",name).put("host","server-home").put("share","Public").put("username","qa-user").put("password",password)
  private fun web(vararg favorites:JSONObject)=JSONObject().put("rhfiles.favorites",JSONArray(favorites.toList()).toString()).put("rhfiles.theme","dark").put("rhfiles.panes","rows")
  private fun favorite(id:String,label:String="收藏")=JSONObject().put("name","图片").put("path","remote://$id/Public/图片").put("isDir",true).put("label",label)
  private fun configure(sync:ConfigSync,server:MockWebServer,enabled:Boolean=false)=sync.save(JSONObject().put("enabled",enabled).put("insecure",true).put("url",server.url("/dav/RHFiles/").toString()).put("username","sync-user").put("password","webdav-secret"))
  private class Cloud:Dispatcher(){
    var doc:JSONObject?=null;var rev=0;var writes=0;var reject:Int?=null;var etags=true;var forcePreconditionFailure=false
    override fun dispatch(request:RecordedRequest):MockResponse {
      reject?.let{return MockResponse().setResponseCode(it)}
      if(request.method=="GET"){val response=if(doc==null)MockResponse().setResponseCode(404)else MockResponse().setBody(doc.toString());if(doc!=null&&etags)response.addHeader("ETag","\"r$rev\"");return response}
      if(request.method=="PUT"){
        if(forcePreconditionFailure){forcePreconditionFailure=false;rev++;return MockResponse().setResponseCode(412)}
        if(doc==null&&request.getHeader("If-None-Match")!="*"||doc!=null&&request.getHeader("If-Match")!="\"r$rev\"")return MockResponse().setResponseCode(412)
        doc=JSONObject(request.body.readUtf8());rev++;writes++;return MockResponse().setResponseCode(204)
      }
      return MockResponse().setResponseCode(405)
    }
  }
  private fun finish(sync:ConfigSync,web:JSONObject,choice:String="",token:String=""):JSONObject {
    val result=sync.run(web,true,token,choice);if(result.optString("state")=="conflict")return result
    val applied=sync.apply(result.getString("proposalId"),web);web.put("rhfiles.favorites",applied.getJSONArray("favorites").toString());return sync.acknowledge(applied.getString("id"))
  }
  @Test fun twoDevicesMergeMetadataAndBookmarksButNeverTransferPasswordsOrDevicePreferences(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start()
      val a=device("a");val b=device("b");val ra=remotes(a,1);val rb=remotes(b,2);val sa=ConfigSync(a,ra);val sb=ConfigSync(b,rb);configure(sa,server);configure(sb,server)
      val id=ra.save(profile());val wa=web(favorite(id),JSONObject().put("name","本机目录").put("path","/storage/local-only").put("isDir",true));val wb=web()
      assertEquals("success",finish(sa,wa).getString("state"));assertFalse(cloud.doc.toString().contains("local-secret"));assertFalse(cloud.doc.toString().contains("webdav-secret"));assertFalse(cloud.doc.toString().contains("/storage/"));assertFalse(cloud.doc.toString().contains("rhfiles.theme"))
      assertEquals("success",finish(sb,wb).getString("state"));assertEquals(id,rb.connections().getJSONObject(0).getString("id"));assertFalse(rb.editable(id).getBoolean("hasPassword"));assertEquals("dark",wb.getString("rhfiles.theme"));assertEquals("rows",wb.getString("rhfiles.panes"))
      rb.save(rb.editable(id).put("password","phone-b-secret"));val f=JSONArray(wb.getString("rhfiles.favorites")).getJSONObject(0);f.put("label","B 的别名");wb.put("rhfiles.favorites",JSONArray().put(f).toString());finish(sb,wb);finish(sa,wa)
      assertEquals("B 的别名",JSONArray(wa.getString("rhfiles.favorites")).getJSONObject(0).getString("label"));assertEquals(2,JSONArray(wa.getString("rhfiles.favorites")).length());assertEquals("local-secret",ra.backupProfiles().getJSONObject(0).getJSONObject("config").getString("password"));assertFalse(cloud.doc.toString().contains("phone-b-secret"))
      val first=server.takeRequest();assertEquals("/dav/RHFiles/rhfiles-settings-v1.json",first.path);assertTrue(first.getHeader("Authorization")!!.startsWith("Basic "))
    }
  }
  @Test fun disabledAutomaticSyncDoesNoIoAndMissingCloudNeverDeletesLocalConfiguration(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start();val c=device("off");val r=remotes(c,3);r.save(profile());val sync=ConfigSync(c,r);configure(sync,server)
      sync.run(web(),false);assertEquals(0,server.requestCount);val w=web();finish(sync,w);cloud.doc=null;finish(sync,w);assertEquals(1,r.connections().length());assertEquals(2,cloud.writes)
    }
  }
  @Test fun conflictingEditsRequireExplicitChoiceAndConditionalWritesAreRetriedWithoutBlindOverwrite(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start();val a=device("ca");val b=device("cb");val ra=remotes(a,1);val rb=remotes(b,2);val id=ra.save(profile());val sa=ConfigSync(a,ra);val sb=ConfigSync(b,rb);configure(sa,server);configure(sb,server);val wa=web(favorite(id));val wb=web();finish(sa,wa);finish(sb,wb)
      fun label(w:JSONObject,text:String){val f=JSONArray(w.getString("rhfiles.favorites")).getJSONObject(0);f.put("label",text);w.put("rhfiles.favorites",JSONArray().put(f).toString())}
      label(wa,"本机改名");label(wb,"另一台改名");finish(sb,wb);val count=cloud.writes;val conflict=sa.run(wa,true);assertEquals("conflict",conflict.getString("state"));assertEquals(count,cloud.writes)
      val resolved=finish(sa,wa,"remote",conflict.getString("conflictToken"));assertEquals("success",resolved.getString("state"));assertEquals("另一台改名",JSONArray(wa.getString("rhfiles.favorites")).getJSONObject(0).getString("label"))
      label(wa,"再改名");cloud.forcePreconditionFailure=true;assertEquals("success",finish(sa,wa).getString("state"));assertEquals("再改名",cloud.doc!!.getJSONArray("favorites").getJSONObject(0).getString("label"))
    }
  }
  @Test fun redirectsAuthenticationMalformedDocumentsAndMissingEtagsNeverMutateLocalSettings(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start();val c=device("errors");val r=remotes(c,4);r.save(profile());val sync=ConfigSync(c,r);configure(sync,server);val before=SharedConfig.canonical(r.backupProfiles())
      for(code in listOf(401,403,302,500)){cloud.reject=code;try{sync.run(web(),true);fail()}catch(e:Exception){assertTrue(e.message!!.contains(code.toString())||code==302)};assertEquals(before,SharedConfig.canonical(r.backupProfiles()));assertEquals(0,cloud.writes)}
      cloud.reject=null;cloud.doc=SharedConfig.empty();cloud.etags=false;try{sync.run(web(),true);fail()}catch(e:Exception){assertTrue(e.message!!.contains("ETag"))};assertEquals(0,cloud.writes)
      cloud.etags=true;cloud.doc=SharedConfig.empty().put("password","must-not-be-imported");try{sync.run(web(),true);fail()}catch(_:Exception){};assertEquals(before,SharedConfig.canonical(r.backupProfiles()))
    }
  }
  @Test fun unacknowledgedApplicationRollsBackAndConcurrentFavoriteChangesAreNotOverwritten(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start();val c=device("rollback");val r=remotes(c,5);val sync=ConfigSync(c,r);configure(sync,server)
      val id=UUID.randomUUID().toString();cloud.doc=SharedConfig.empty().put("profiles",JSONArray().put(JSONObject().put("id",id).put("config",SharedConfig.profile(profile())))).put("favorites",JSONArray().put(favorite(id)))
      val w=web();val proposal=sync.run(w,true);val changed=web(JSONObject().put("name","本机").put("path","/storage/new").put("isDir",true));try{sync.apply(proposal.getString("proposalId"),changed);fail()}catch(_:Exception){};assertEquals(0,r.connections().length())
      val next=sync.run(w,true);sync.apply(next.getString("proposalId"),w);assertEquals(1,r.connections().length());assertTrue(sync.busy)
      val reopened=ConfigSync(c,r);val restore=reopened.recover()!!;assertEquals(0,r.connections().length());assertEquals("[]",restore.getString("favorites"));assertFalse(reopened.busy);reopened.clearRollback();assertNull(reopened.rollbackWeb())
    }
  }
  @Test fun backupIncludesWebdavCredentialsButRestoringKeepsAutoSyncDisabled(){
    val c=device("backup");val r=remotes(c,6);val sync=ConfigSync(c,r);sync.save(JSONObject().put("enabled",true).put("url","https://example.test/dav/").put("username","user").put("password","only-in-encrypted-backup").put("insecure",false))
    val updates=JSONObject().put("connectionId","");val backup=SettingsBackup(c,r);val snapshot=backup.snapshot(web(),updates);assertEquals("only-in-encrypted-backup",snapshot.getJSONObject("sync").getString("password"))
    val sealed=SettingsBackup.seal(snapshot,"qa-backup-pass".toCharArray());assertFalse(String(sealed).contains("only-in-encrypted-backup"));backup.apply(snapshot,web());assertFalse(ConfigSync.rawConfig(c,r).getBoolean("enabled"));assertEquals("only-in-encrypted-backup",ConfigSync.rawConfig(c,r).getString("password"))
  }
  @Test fun sharedSchemaRejectsSecretsUnsafePathsUnknownSettingsAndExcessiveDepth(){
    val r=remotes(device("schema"),7);val id=UUID.randomUUID().toString();val base=SharedConfig.empty().put("profiles",JSONArray().put(JSONObject().put("id",id).put("config",SharedConfig.profile(profile()))))
    SharedConfig.validate(base,r::validate)
    for(field in listOf("password","token","rhfiles.panes")){val bad=JSONObject(base.toString());bad.getJSONArray("profiles").getJSONObject(0).getJSONObject("config").put(field,"secret");try{SharedConfig.validate(bad,r::validate);fail()}catch(_:Exception){}}
    for(path in listOf("/storage/local","remote://$id/..","remote://$id/a?password=oops","remote://${UUID.randomUUID()}/a")){val bad=JSONObject(base.toString()).put("favorites",JSONArray().put(favorite(id).put("path",path)));try{SharedConfig.validate(bad,r::validate);fail()}catch(_:Exception){}}
    for(value in listOf("1",1.5,2)){try{SharedConfig.validate(JSONObject(base.toString()).put("schemaVersion",value),r::validate);fail()}catch(_:Exception){}}
    for(value in listOf("445",445.5,0,65536,4294967741L)){val bad=JSONObject(base.toString());bad.getJSONArray("profiles").getJSONObject(0).getJSONObject("config").put("port",value);try{SharedConfig.validate(bad,r::validate);fail()}catch(_:Exception){}}
    for(path in listOf("remote://user@$id/a","remote://$id:445/a")){val bad=JSONObject(base.toString()).put("favorites",JSONArray().put(favorite(id).put("path",path)));try{SharedConfig.validate(bad,r::validate);fail()}catch(_:Exception){}}
    for(parent in listOf("remote://$id/../secret","remote://$id/a?password=oops")){val bad=JSONObject(base.toString()).put("favorites",JSONArray().put(favorite(id).put("parentPath",parent)));try{SharedConfig.validate(bad,r::validate);fail()}catch(_:Exception){}}
    try{SharedConfig.parse("[".repeat(30)+"]".repeat(30));fail()}catch(_:Exception){}
  }
  @Test fun uploadReceiptAcknowledgesOnlyOwnCommittedDeltasAndDoesNotDeleteUnappliedCloudAdditions(){
    val id=UUID.randomUUID().toString();val other=UUID.randomUUID().toString()
    fun doc(vararg entries:Pair<String,String>)=SharedConfig.empty().put("profiles",JSONArray(entries.map{(key,name)->JSONObject().put("id",key).put("config",SharedConfig.profile(profile(name)))}))
    val base=doc(id to "原名");val local=doc(id to "本机改名");val cloud=doc(id to "本机改名",other to "云端新增")
    val receipt=SharedConfig.receipt(base,local,cloud);assertTrue(SharedConfig.same(local,receipt))
    val changedAgain=doc(id to "本机再次改名");val next=SharedConfig.merge(receipt,changedAgain,cloud)
    assertEquals(0,next.conflicts.length());assertEquals(2,next.document.getJSONArray("profiles").length());assertTrue(next.document.toString().contains("本机再次改名"));assertTrue(next.document.toString().contains("云端新增"))
    val deleted=SharedConfig.receipt(base,SharedConfig.empty(),SharedConfig.empty());assertEquals(0,deleted.getJSONArray("profiles").length())
  }
  @Test fun concurrentProfileRemovalAndNewBookmarkRequireAChoiceWithoutLeavingOrphans(){
    val id=UUID.randomUUID().toString();val base=SharedConfig.empty().put("profiles",JSONArray().put(JSONObject().put("id",id).put("config",SharedConfig.profile(profile()))))
    val local=JSONObject(base.toString()).put("favorites",JSONArray().put(favorite(id)));val remote=SharedConfig.empty()
    assertTrue(SharedConfig.merge(base,local,remote).conflicts.length()>0)
    val keep=SharedConfig.merge(base,local,remote,"local").document;assertEquals(1,keep.getJSONArray("profiles").length());assertEquals(1,keep.getJSONArray("favorites").length())
    val remove=SharedConfig.merge(base,local,remote,"remote").document;assertEquals(0,remove.getJSONArray("profiles").length());assertEquals(0,remove.getJSONArray("favorites").length())
    val r=remotes(device("orphan"),8);SharedConfig.validate(keep,r::validate);SharedConfig.validate(remove,r::validate)
  }
  @Test fun changedEndpointNeverReusesOldPasswordAndChangedRemoteAccountClearsLocalSecret(){
    MockWebServer().use{server->val cloud=Cloud();server.dispatcher=cloud;server.start();val c=device("identity");val r=remotes(c,9);val sync=ConfigSync(c,r);configure(sync,server)
      try{sync.save(JSONObject().put("enabled",false).put("insecure",true).put("url",server.url("/other/").toString()).put("username","other").put("password",""));fail()}catch(_:Exception){}
      assertEquals("webdav-secret",ConfigSync.rawConfig(c,r).getString("password"))
      val id=r.save(profile());val w=web(favorite(id));finish(sync,w)
      cloud.doc!!.getJSONArray("profiles").getJSONObject(0).getJSONObject("config").put("username","another-user");cloud.rev++
      finish(sync,w);assertFalse(r.editable(id).getBoolean("hasPassword"));assertEquals("another-user",r.editable(id).getString("username"))
    }
  }
}
