package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.file.Files
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
@Config(manifest=Config.NONE,sdk=[28])
class TrashTest {
  private val context get()=RuntimeEnvironment.getApplication()
  private fun fixture(block:(File)->Unit) {
    val root=File(context.cacheDir,"exports").apply{mkdirs()}
    val dir=Files.createTempDirectory(root.toPath(),"trash-qa-").toFile().canonicalFile
    try{block(dir)}finally{
      val records=File(context.filesDir,"trash-v1")
      records.listFiles()?.forEach{f->if(runCatching{JSONObject(f.readText()).getString("original").startsWith(dir.path+File.separator)}.getOrDefault(false))f.delete()}
      dir.deleteRecursively()
    }
  }
  private fun records()=Trash.list(context).let{a->(0 until a.length()).map{a.getJSONObject(it)}}
  private fun put(file:File):JSONObject {Trash.put(context,file);return records().first{it.getString("original")==file.path}}
  private fun run(op:String,ids:List<String>):FileTasks.Job =
    FileTasks.Job(UUID.randomUUID().toString(),op,JSONObject().put("ids",JSONArray(ids))).also{FileTasks.execute(context,it)}

  @Test fun batchRestorePreservesBytesAndIsolatesConflicts()=fixture{d->
    val a=File(d,"same.txt").apply{writeText("original")};val b=File(d,"中文").apply{mkdir()}
    File(b,"nested.txt").writeText("nested")
    val first=put(a);val second=put(b);a.writeText("keep external")
    val job=run("restore",listOf(first.getString("id"),second.getString("id")))
    assertEquals(1,job.failures.size);assertEquals(1,job.done);assertEquals(2,job.files)
    assertEquals("keep external",a.readText());assertEquals("nested",File(b,"nested.txt").readText())
    assertEquals(listOf(second.getString("id")),job.completed.toList())
    assertTrue(File(first.getString("path")).exists())
    a.delete();Trash.restore(context,first.getString("id"));assertEquals("original",a.readText())
  }
  @Test fun purgeOnlyDeletesSnapshotAndJournalAfterSuccessfulRemoval()=fixture{d->
    val a=put(File(d,"one").apply{writeText("a")})
    val b=put(File(d,"folder").apply{mkdir();File(this,"deep").mkdir();File(this,"deep/data").writeText("b")})
    val later=put(File(d,"later").apply{writeText("c")})
    val job=run("trash-delete",listOf(a.getString("id"),b.getString("id")))
    assertTrue(job.failures.toString(),job.failures.isEmpty());assertEquals(2,job.done)
    for(record in listOf(a,b)){assertFalse(File(record.getString("path")).exists());assertFalse(File(context.filesDir,"trash-v1/"+record.getString("id")+".json").exists())}
    assertTrue(File(later.getString("path")).exists());Trash.restore(context,later.getString("id"));assertEquals("c",File(d,"later").readText())
  }
  @Test fun cancellationRetainsPayloadAndRecoverableJournal()=fixture{d->
    val record=put(File(d,"tree").apply{mkdir();File(this,"keep").writeText("safe")})
    try{Trash.purge(context,record.getString("id")){throw IllegalStateException("cancel")};fail("Cancellation ignored")}catch(_:IllegalStateException){}
    assertTrue(File(record.getString("path"),"keep").isFile)
    assertTrue(records().any{it.getString("id")==record.getString("id")})
    Trash.restore(context,record.getString("id"));assertEquals("safe",File(d,"tree/keep").readText())
  }
  @Test fun tamperedPayloadCannotDeleteUnrelatedFiles()=fixture{d->
    val record=put(File(d,"source").apply{writeText("recycled")});val keep=File(d,"keep").apply{writeText("safe")}
    File(context.filesDir,"trash-v1/"+record.getString("id")+".json").writeText(JSONObject(record.toString()).put("path",keep.path).toString())
    val job=run("trash-delete",listOf(record.getString("id")))
    assertEquals(1,job.failures.size);assertEquals("safe",keep.readText());assertTrue(File(record.getString("path")).exists())
  }
  @Test fun nestedSymbolicLinkIsUnlinkedNotTraversed()=fixture{d->
    val keep=File(d,"outside").apply{mkdir();File(this,"keep").writeText("safe")}
    val source=File(d,"tree").apply{mkdir()};Files.createSymbolicLink(File(source,"link").toPath(),keep.toPath())
    val record=put(source);val job=run("trash-delete",listOf(record.getString("id")))
    assertTrue(job.failures.toString(),job.failures.isEmpty());assertEquals("safe",File(keep,"keep").readText())
  }
  @Test fun idsAreValidatedDeduplicatedAndLegacySingleRestoreRemainsSupported(){
    val id=UUID.randomUUID().toString()
    assertEquals(listOf(id),Trash.ids(JSONObject().put("id",id)))
    assertEquals(listOf(id),Trash.ids(JSONObject().put("ids",JSONArray().put(id).put(id))))
    for(args in listOf(JSONObject().put("ids",JSONArray()),JSONObject().put("id","../outside"))){
      try{Trash.ids(args);fail("Invalid ID accepted")}catch(_:IllegalArgumentException){}
    }
  }
  @Test fun nativeKindsSeparateAllAndroidPackageVariantsFromArchives(){
    for(name in listOf("app.apk","UPPER.APK","split.apks","game.xapk","bundle.apkm"))assertEquals("apk",NativeEntry.kind(name))
    for(name in listOf("backup.zip","backup.7z","backup.tar"))assertEquals("archive",NativeEntry.kind(name))
  }
}
