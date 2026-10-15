package com.railgunhamster.rhfiles

import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.*
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

@RunWith(RobolectricTestRunner::class)
@Config(manifest=Config.NONE,sdk=[28])
class EbookSourceTest {
  private val context get()=RuntimeEnvironment.getApplication()
  private fun fixture(block:(File)->Unit){val root=File(context.cacheDir,"exports").apply{mkdirs()};val dir=Files.createTempDirectory(root.toPath(),"ebook-test-").toFile();try{block(dir)}finally{dir.deleteRecursively()}}
  private fun reject(block:()->Unit){try{block();fail("Expected refusal")}catch(_:IllegalArgumentException){}catch(_:IllegalStateException){}catch(_:IOException){}}
  private fun zip(file:File,entries:Map<String,ByteArray>){ZipOutputStream(file.outputStream()).use{out->for((name,bytes)in entries){out.putNextEntry(ZipEntry(name));out.write(bytes);out.closeEntry()}}}
  @Test fun formatsIncludeMobiAndCaseInsensitiveExtensions(){for(ext in EbookSource.FORMATS)assertTrue(EbookSource.supported("中文.${ext.uppercase()}"));assertFalse(EbookSource.supported("book.pdf"));assertFalse(EbookSource.supported("book.exe"))}
  @Test fun rejectsEscapingAndAmbiguousResourcePaths(){for(name in listOf("../x","a/../b","/x","C:/x","a\\b","a/./b","x\u0000y",""))reject{EbookSource.resourceName(name)};assertEquals("章节/你好.xhtml",EbookSource.resourceName("章节/你好.xhtml"))}
  @Test fun nestedResourcesAreReadWithoutExtractionOrChangingOriginal()=fixture{dir->val file=File(dir,"book.epub");zip(file,mapOf("OPS/章节.xhtml" to "你好".toByteArray(),"OPS/empty" to byteArrayOf()));val original=file.readBytes();EbookSource(context,file.path).use{source->assertEquals("你好",source.resource("OPS/章节.xhtml",true).use{it.reader().readText()});assertEquals(2,source.metadata("light").getJSONArray("entries").length());assertEquals(0,source.resource("OPS/empty",false).use{it.readBytes().size})};assertArrayEquals(original,file.readBytes());assertEquals(1,dir.listFiles()!!.size)}
  @Test fun maliciousArchiveIsNeverExtractedAndFailureReleasesFile()=fixture{dir->val file=File(dir,"bad.epub");zip(file,mapOf("../escape" to byteArrayOf(1)));reject{EbookSource(context,file.path).close()};assertTrue(file.delete());assertEquals(0,dir.listFiles()!!.size)}
  @Test fun emptyAndOversizeBooksAreRefused()=fixture{dir->val file=File(dir,"book.mobi");file.createNewFile();reject{EbookSource(context,file.path).close()};RandomAccessFile(file,"rw").use{it.setLength(EbookSource.MAX_BOOK_BYTES+1)};reject{EbookSource(context,file.path).close()}}
  @Test fun oversizedResourceIsRefusedBeforeDecoding()=fixture{dir->val file=File(dir,"book.epub");zip(file,mapOf("large.jpg" to ByteArray((EbookSource.MAX_RESOURCE_BYTES+1).toInt())));reject{EbookSource(context,file.path).close()};assertTrue(file.exists())}
  @Test fun chapterTextHasLowerBoundThanBinaryResources()=fixture{dir->val file=File(dir,"book.epub");zip(file,mapOf("large.xhtml" to ByteArray((EbookSource.MAX_TEXT_BYTES+1).toInt())));EbookSource(context,file.path).use{source->reject{source.resource("large.xhtml",true).close()};source.resource("large.xhtml",false).use{assertTrue(it.read()>=0)}}}
  @Test fun cancellationStopsStreamAndLeavesSourceUntouched()=fixture{dir->val file=File(dir,"book.mobi").apply{writeText("source")};var canceled=false;EbookSource(context,file.path){canceled}.use{source->source.raw().use{input->canceled=true;reject{input.read()}}};assertEquals("source",file.readText())}
  @Test fun unknownResourceDoesNotExposeSiblingFile()=fixture{dir->val file=File(dir,"book.cbz");zip(file,mapOf("1.png" to byteArrayOf(1)));File(dir,"secret").writeText("private");EbookSource(context,file.path).use{source->reject{source.resource("../secret",false)};reject{source.resource("secret",false)}}}
}
