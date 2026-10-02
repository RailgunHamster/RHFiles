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
class FileTasksTest {
  private val context get()=RuntimeEnvironment.getApplication()
  private fun <T> fixture(block:(File)->T):T {
    val root=File(context.cacheDir,"exports").apply{mkdirs()};val dir=Files.createTempDirectory(root.toPath(),"test-").toFile()
    try{return block(dir)}finally{dir.deleteRecursively()}
  }
  private fun run(op:String,sources:List<File>,destination:File):FileTasks.Job {
    val args=JSONObject().put("sources",JSONArray(sources.map{it.path})).put("destination",destination.path)
    return FileTasks.Job(UUID.randomUUID().toString(),op,args).also{FileTasks.execute(context,it)}
  }
  @Test fun copyIsRealBytesAndPreservesSource()=fixture{d->
    val source=File(d,"source").apply{writeBytes(ByteArray(700000){(it%251).toByte()})};val dest=File(d,"dest").apply{mkdir()}
    val job=run("copy",listOf(source),dest)
    assertTrue(job.failures.toString(),job.failures.isEmpty());assertArrayEquals(source.readBytes(),File(dest,"source").readBytes());assertEquals(700000,job.bytes);assertEquals(700000,job.total)
  }
  @Test fun recursiveMovePublishesBeforeDeletingAndKeepsNewName()=fixture{d->
    val source=File(d,"tree").apply{mkdir()};File(source,"empty").mkdir();File(source,"中文.txt").writeText("data")
    val dest=File(d,"dest").apply{mkdir()};val job=run("move",listOf(source),dest)
    assertTrue(job.failures.toString(),job.failures.isEmpty());assertFalse(source.exists());assertEquals("data",File(dest,"tree/中文.txt").readText());assertTrue(File(dest,"tree/empty").isDirectory)
  }
  @Test fun conflictsNeverOverwrite()=fixture{d->
    val source=File(d,"same.txt").apply{writeText("new")};val dest=File(d,"dest").apply{mkdir()};File(dest,"same.txt").writeText("old")
    val job=run("copy",listOf(source),dest);assertTrue(job.failures.toString(),job.failures.isEmpty());assertEquals("old",File(dest,"same.txt").readText());assertEquals("new",File(dest,"same (1).txt").readText())
  }
  @Test fun partialFailureKeepsFailedSourcesAndReportsPerPath()=fixture{d->
    val good=File(d,"good").apply{writeText("good")};val missing=File(d,"missing");val dest=File(d,"dest").apply{mkdir()}
    val job=run("move",listOf(good,missing),dest);assertEquals(1,job.failures.size);assertEquals(missing.path,job.failures[0].first);assertEquals(listOf(good.path),job.completed.toList());assertFalse(good.exists())
  }
  @Test fun refusesCopyIntoSourceDirectory()=fixture{d->
    val source=File(d,"tree").apply{mkdir()};val child=File(source,"child").apply{mkdir()};File(source,"keep").writeText("safe")
    val job=run("copy",listOf(source),child);assertEquals(1,job.failures.size);assertEquals("safe",File(source,"keep").readText());assertEquals(0,child.listFiles()!!.size)
  }
  @Test fun canceledTaskDoesNotDeleteOrPublish()=fixture{d->
    val source=File(d,"source").apply{writeText("safe")};val dest=File(d,"dest").apply{mkdir()}
    val j=FileTasks.Job(UUID.randomUUID().toString(),"move",JSONObject().put("sources",JSONArray().put(source.path)).put("destination",dest.path));j.canceled=true
    try{FileTasks.execute(context,j);fail("Canceled task ran")}catch(_:IllegalStateException){}
    assertTrue(source.exists());assertEquals(0,dest.listFiles()!!.size)
  }
  @Test fun rejectsPrivatePathsOutsideGrantedRoots() {
    try{NativeStorage(context).local(File(context.filesDir,"secret").path);fail("Private data exposed")}catch(_:IllegalArgumentException){}
  }
  @Test fun trashRoundTripPreservesContentsAndRefusesRestoreConflict()=fixture{d->
    val source=File(d,"restore.txt").canonicalFile.apply{writeText("original")};Trash.put(context,source);assertFalse(source.exists())
    val records=Trash.list(context);val record=(0 until records.length()).map{records.getJSONObject(it)}.first{it.getString("original")==source.path}
    source.writeText("external")
    try{Trash.restore(context,record.getString("id"));fail("Overwrote conflict")}catch(_:IllegalArgumentException){}
    assertEquals("external",source.readText());assertTrue(File(record.getString("path")).exists())
    source.delete();Trash.restore(context,record.getString("id"));assertEquals("original",source.readText())
  }
}
