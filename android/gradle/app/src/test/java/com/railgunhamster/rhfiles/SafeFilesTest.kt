package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import java.io.*
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.xz.XZCompressorOutputStream
import java.util.zip.GZIPOutputStream

class SafeFilesTest {
  private fun <T> temporary(block:(File)->T):T {val dir=Files.createTempDirectory("rhfiles-native-test-").toFile();try{return block(dir)}finally{dir.deleteRecursively()}}
  private fun fails(block:()->Unit) {try{block();fail("Expected refusal")}catch(_:IllegalArgumentException){}catch(_:IllegalStateException){}catch(_:IOException){}}
  @Test fun rejectsTraversalAndAbsoluteArchivePaths() {
    for(path in listOf("../x","a/../../x","/root","\\server\\x","C:/x","a\\..\\x","a/./x","a//x","x\u0000y","a:stream"))fails{SafeFiles.relative(path)}
    assertEquals("中文 目录/a.txt",SafeFiles.relative("中文 目录/a.txt"))
  }
  @Test fun validatesNamesWithoutDestroyingUnicode() {
    for(n in listOf("", " ", ".", "..", "a/b", "a\\b", "x\ny"))fails{SafeFiles.name(n)}
    assertEquals("中文 🙂.txt",SafeFiles.name("中文 🙂.txt"))
  }
  @Test fun refusesPublishingOverExistingData()=temporary{d->
    val a=File(d,"a").apply{writeText("new")};val b=File(d,"b").apply{writeText("original")}
    fails{SafeFiles.publish(a,b)};assertEquals("original",b.readText());assertTrue(a.exists())
  }
  @Test fun utf8EditorPreservesBomAndCrLf()=temporary{d->
    val f=File(d,"text").apply{writeText("\uFEFF中文\r\nline\r\n")};val (text,revision)=SafeFiles.readText(f)
    SafeFiles.saveText(f,text+"追加\r\n",revision);assertEquals(text+"追加\r\n",f.readText());assertEquals(1,d.listFiles()!!.size)
  }
  @Test fun textEditorNeverOverwritesExternalChanges()=temporary{d->
    val f=File(d,"text").apply{writeText("original")};val revision=SafeFiles.readText(f).second;f.writeText("external")
    fails{SafeFiles.saveText(f,"edited",revision)};assertEquals("external",f.readText())
  }
  @Test fun rejectsBinaryInvalidUtf8AndOversizeText()=temporary{d->
    val f=File(d,"file")
    for(bytes in listOf(byteArrayOf(1,0,2),byteArrayOf(0xff.toByte()),ByteArray(SafeFiles.TEXT_LIMIT+1){65})) {f.writeBytes(bytes);fails{SafeFiles.readText(f)}}
  }
  @Test fun zipRoundTripIncludesEmptyDirectoriesAndZeroByteFiles()=temporary{d->
    val source=File(d,"中文").apply{mkdir()};File(source,"empty").mkdir();File(source,"zero").createNewFile();File(source,"hello.txt").writeText("你好\n")
    val zip=File(d,"out.zip");var bytes=0L;Archives.zip(listOf(source),zip,6){bytes+=it};assertEquals("你好\n".toByteArray().size.toLong(),bytes)
    assertEquals(4,Archives.list(zip).size)
    val result=Archives.extract(zip,d,"result");assertEquals("你好\n",File(result,"中文/hello.txt").readText());assertTrue(File(result,"中文/empty").isDirectory);assertEquals(0,File(result,"中文/zero").length())
  }
  @Test fun failedExtractionCleansOnlyItsStagingDirectory()=temporary{d->
    val keep=File(d,"keep").apply{writeText("untouched")};val zip=File(d,"attack.zip")
    ZipOutputStream(zip.outputStream()).use{it.putNextEntry(ZipEntry("../escape"));it.write(1);it.closeEntry()}
    fails{Archives.extract(zip,d,"result")};assertFalse(File(d,"escape").exists());assertFalse(File(d,"result").exists());assertEquals("untouched",keep.readText());assertEquals(2,d.listFiles()!!.size)
  }
  @Test fun cancellationRemovesUnpublishedArchiveOutput()=temporary{d->
    val file=File(d,"source").apply{writeBytes(ByteArray(1000000))};val target=File(d,"out.zip")
    fails{Archives.zip(listOf(file),target,0){if(it>0)error("cancel")}};assertFalse(target.exists());assertTrue(file.exists());assertEquals(1,d.listFiles()!!.size)
  }
  @Test fun existingExtractionFolderIsNotMergedOrOverwritten()=temporary{d->
    val file=File(d,"file").apply{writeText("x")};val zip=File(d,"a.zip");Archives.zip(listOf(file),zip,6)
    val target=File(d,"existing").apply{mkdir()};File(target,"keep").writeText("safe")
    fails{Archives.extract(zip,d,"existing")};assertEquals("safe",File(target,"keep").readText())
  }
  @Test fun tarGzipAndXzExtractThroughSameBounds()=temporary{d->
    val tar=File(d,"a.tar")
    TarArchiveOutputStream(tar.outputStream()).use{out->val e=TarArchiveEntry("中文.txt");val bytes="你好".toByteArray();e.size=bytes.size.toLong();out.putArchiveEntry(e);out.write(bytes);out.closeArchiveEntry()}
    assertEquals("你好",File(Archives.extract(tar,d,"tar"),"中文.txt").readText())
    val gz=File(d,"plain.gz");GZIPOutputStream(gz.outputStream()).use{it.write("gzip".toByteArray())}
    assertEquals("gzip",File(Archives.extract(gz,d,"gzip"),"plain").readText())
    val xz=File(d,"plain.xz");XZCompressorOutputStream(xz.outputStream()).use{it.write("xz".toByteArray())}
    assertEquals("xz",File(Archives.extract(xz,d,"xz"),"plain").readText())
  }
  @Test fun refusesTarLinks()=temporary{d->
    val tar=File(d,"link.tar");TarArchiveOutputStream(tar.outputStream()).use{out->val e=TarArchiveEntry("link",'2'.code.toByte());e.linkName="../secret";out.putArchiveEntry(e);out.closeArchiveEntry()}
    fails{Archives.extract(tar,d,"out")};assertFalse(File(d,"out").exists())
  }
  @Test fun rejectsDamagedZipCrcBeforePublishing()=temporary{d->
    val zip=File(d,"damaged.zip");val payload="hello".toByteArray();val crc=java.util.zip.CRC32().apply{update(payload)}
    ZipOutputStream(zip.outputStream()).use{out->val e=ZipEntry("a.txt");e.method=ZipEntry.STORED;e.size=5;e.compressedSize=5;e.crc=crc.value;out.putNextEntry(e);out.write(payload);out.closeEntry()}
    val bytes=zip.readBytes();bytes[35]=(bytes[35].toInt() xor 1).toByte();zip.writeBytes(bytes)
    fails{Archives.extract(zip,d,"result")};assertFalse(File(d,"result").exists())
  }
  @Test fun refusesArchiveInsideSourceAndDuplicateBasenames()=temporary{d->
    val source=File(d,"source").apply{mkdir()};File(source,"a").writeText("a")
    fails{Archives.zip(listOf(source),File(source,"out.zip"),6)}
    fails{Archives.zip(listOf(source,source),File(d,"out.zip"),6)};assertFalse(File(d,"out.zip").exists())
  }
}
