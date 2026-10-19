package com.railgunhamster.rhfiles

import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.util.UUID

@RunWith(RobolectricTestRunner::class) @Config(manifest=Config.NONE,sdk=[28])
class UsageReportTest {
  private class Source:UsageSource {
    val rows=linkedMapOf("/root" to listOf(UsageItem("/root/a","a",true),UsageItem("/root/big.mp4","big.mp4",false,100)),"/root/a" to listOf(UsageItem("/root/a/small.jpg","small.jpg",false,20),UsageItem("/root/a/no.txt","no.txt",false,4,issue="权限不足")))
    override fun root(path:String)=UsageItem(path,"测试目录",true)
    override fun children(path:String,accept:(UsageItem)->Unit){rows[path]?.forEach(accept)?:error("目录读取失败")}
    override fun measure(item:UsageItem)=item
  }
  private fun report(source:UsageSource=Source(),maxEntries:Long=10000):UsageReport {
    val id=UUID.randomUUID().toString();return UsageReport(File(RuntimeEnvironment.getApplication().cacheDir,"$id.db"),id,source,"/root","first",maxEntries=maxEntries)
  }
  @Test fun aggregationDrilldownTypesLargestAndIssuesAreConsistent(){report().use{r->
    val progress=mutableListOf<Int>();r.run{if(!it.isNull("percent"))progress.add(it.getInt("percent"))}
    assertEquals("completed",r.status().getString("state"));assertTrue(progress.zipWithNext().all{it.first<=it.second});assertEquals(100,progress.last())
    val page=r.page(1,"folders",0,100);val root=page.getJSONObject("root");assertEquals(120,root.getLong("size"));assertEquals(3,root.getLong("files"));assertEquals(1,root.getLong("directories"));assertEquals(1,root.getLong("issues"))
    assertEquals("big.mp4",page.getJSONArray("entries").getJSONObject(0).getString("name"))
    val folder=page.getJSONArray("entries").getJSONObject(1).getLong("id");val child=r.page(folder,"folders",0,100);assertEquals(20,child.getJSONObject("folder").getLong("size"));assertEquals(2,child.getJSONArray("breadcrumbs").length())
    val largest=r.page(1,"largest",0,1);assertTrue(largest.getBoolean("hasMore"));assertEquals(100,largest.getJSONArray("entries").getJSONObject(0).getLong("size"));assertEquals(1,r.page(1,"largest",2,1).getJSONArray("entries").length())
    val types=r.page(1,"types",0,100).getJSONArray("groups");assertEquals("video",types.getJSONObject(0).getString("kind"));assertEquals(3,types.length())
    assertEquals("权限不足",r.page(1,"issues",0,100).getJSONArray("entries").getJSONObject(0).getString("issue"))
  }}
  @Test fun entryLimitAndUnreadableFoldersAreExplicitlyIncomplete(){
    report(maxEntries=2).use{r->r.run();assertTrue(r.status().getBoolean("truncated"));assertTrue(r.page(1,"issues",0,100).getJSONArray("entries").length()>0)}
    val source=Source();source.rows.remove("/root/a");report(source).use{r->r.run();assertEquals(1,r.status().getLong("issues"));assertTrue(r.page(1,"issues",0,100).getJSONArray("entries").getJSONObject(0).getString("issue").contains("目录读取失败"))}
  }
  @Test fun cancellationAndInterruptedReportsNeverPretendToBeComplete(){
    report().use{r->r.cancel();r.run();assertEquals("canceled",r.status().getString("state"));assertFalse(r.status().getBoolean("ready"))}
    val first=report();val file=first.file;val id=first.id;first.close()
    UsageReport(file,id,Source(),"","",restore=true).use{r->assertEquals("interrupted",r.status().getString("state"));assertFalse(r.status().getBoolean("ready"));try{r.page(1,"folders",0,100);fail()}catch(_:IllegalArgumentException){}}
  }
  @Test fun cancellationDuringIndexKeepsOnlyDiscoveredMetadataAndDoesNotMeasure(){
    var measured=false;lateinit var r:UsageReport
    val source=object:UsageSource{
      override fun root(path:String)=UsageItem(path,"root",true)
      override fun children(path:String,accept:(UsageItem)->Unit){accept(UsageItem("/root/file","file",false,42));r.cancel();accept(UsageItem("/root/late","late",false,9))}
      override fun measure(item:UsageItem):UsageItem{measured=true;return item}
    }
    r=report(source);r.use{it.run();assertFalse(measured);assertEquals("canceled",it.status().getString("state"));assertEquals(42,it.page(1,"folders",0,100).getJSONObject("root").getLong("size"));assertTrue(it.status().getLong("issues")>0)}
  }
  @Test fun pagingIsBoundedAndCategoriesCoverCommonFormats(){report().use{r->r.run();for(limit in listOf(0,201))try{r.page(1,"folders",0,limit);fail()}catch(_:IllegalArgumentException){};assertEquals("apps",UsageReport.kind("APP.APK"));assertEquals("archive",UsageReport.kind("a.7z"));assertEquals("document",UsageReport.kind("a.mobi"))}}
}
