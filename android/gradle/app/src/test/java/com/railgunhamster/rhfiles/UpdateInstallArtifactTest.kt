package com.railgunhamster.rhfiles
import org.junit.Test
import org.junit.Assert.*
import java.nio.file.Files
import java.io.File
class UpdateInstallArtifactTest {
  private val sha="a".repeat(64)
  @Test fun differentVersionsAndDigestsHaveDifferentUris(){assertNotEquals(UpdateInstallArtifact.name("0.1.20",1020,sha),UpdateInstallArtifact.name("0.1.21",1021,sha));assertNotEquals(UpdateInstallArtifact.name("0.1.21",1021,sha),UpdateInstallArtifact.name("0.1.21",1021,"b".repeat(64)))}
  @Test fun installerReadsAnImmutableSnapshotNotTheReplacedDownload(){val dir=Files.createTempDirectory("installer-snapshot").toFile();try{val source=File(dir,"update.apk").apply{writeText("version21")};val output=File(dir,"installers");var checks=0;val first=UpdateInstallArtifact.prepare(output,source,"0.1.21",1021,sha){assertEquals("version21",it.readText());checks++};source.writeText("version22");val second=UpdateInstallArtifact.prepare(output,source,"0.1.22",1022,sha){assertEquals("version22",it.readText());checks++};assertNotEquals(first,second);assertEquals("version21",first.readText());assertEquals("version22",second.readText());assertEquals(2,checks);assertTrue(output.listFiles()!!.none{it.name.endsWith("preparing")})}finally{dir.deleteRecursively()}}
  @Test fun failedVerificationNeverLeavesAnInstallableFile(){val dir=Files.createTempDirectory("installer-reject").toFile();try{val source=File(dir,"update.apk").apply{writeText("bad")};val output=File(dir,"installers");try{UpdateInstallArtifact.prepare(output,source,"0.1.21",1021,sha){throw IllegalStateException("bad signature")};fail()}catch(_:IllegalStateException){};assertEquals(0,output.listFiles()!!.size)}finally{dir.deleteRecursively()}}
  @Test fun rejectsTraversalAndMalformedIdentifiers(){for(version in listOf("../bad","0.1.2/evil","0.1.2?x"))try{UpdateInstallArtifact.name(version,1021,sha);fail()}catch(_:IllegalArgumentException){}}
}
