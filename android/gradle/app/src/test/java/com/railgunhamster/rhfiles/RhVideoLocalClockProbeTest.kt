package com.railgunhamster.rhfiles

import java.io.File
import java.io.RandomAccessFile
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class RhVideoLocalClockProbeTest {
  @get:Rule val temp=TemporaryFolder()
  private val name="rhvideo-local-grid-"+"a".repeat(32)
  private fun fixtures(parent:File):File=File(parent,name).also{folder->check(folder.mkdirs());File(folder,"portrait.mp4").writeBytes(byteArrayOf(1));File(folder,"landscape.mp4").writeBytes(byteArrayOf(2))}
  private fun rejected(block:()->Unit){try{block();fail("Expected local fixture rejection")}catch(_:IllegalArgumentException){}}
  @Test fun acceptsOnlyOneOrThreeInTheSameFixedPortraitPortraitLandscapeOrder(){
    val base=temp.newFolder();val folder=fixtures(base)
    assertEquals(listOf("portrait.mp4"),RhVideoLocalClockProbe.sources(base,folder.path,1).map{it.name})
    assertEquals(listOf("portrait.mp4","portrait.mp4","landscape.mp4"),RhVideoLocalClockProbe.sources(base,folder.path,3).map{it.name})
    for(count in listOf(-1,0,2,4,1000))rejected{RhVideoLocalClockProbe.sources(base,folder.path,count)}
  }
  @Test fun rejectsOutsideRootsMissingFilesAndUnboundedFilesBeforeCreatingAPlayer(){
    val base=temp.newFolder();val outside=fixtures(temp.newFolder())
    rejected{RhVideoLocalClockProbe.sources(base,outside.path,3)}
    val folder=fixtures(base);assertTrue(File(folder,"landscape.mp4").delete());rejected{RhVideoLocalClockProbe.sources(base,folder.path,3)}
    RandomAccessFile(File(folder,"landscape.mp4"),"rw").use{it.setLength(16L*1024*1024+1)};rejected{RhVideoLocalClockProbe.sources(base,folder.path,3)}
    assertEquals(1,RhVideoLocalClockProbe.sources(base,folder.path,1).size)
  }
  @Test fun rejectsMalformedOrTraversalDirectoryNamesAndEmptySources(){
    val base=temp.newFolder();for(value in listOf("",base.path,"x".repeat(4097),File(base,name+"-copy").path,File(base,"$name/../escape").path))rejected{RhVideoLocalClockProbe.sources(base,value,1)}
    val folder=fixtures(base);File(folder,"portrait.mp4").writeBytes(byteArrayOf());rejected{RhVideoLocalClockProbe.sources(base,folder.path,1)}
  }
}
