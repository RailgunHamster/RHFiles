package com.railgunhamster.rhfiles

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.InputStream

class TextPreviewTest {
  @Test fun readsUtf8AndUnicodeWithoutWritingFiles(){val text="{\"名字\":\"中文 🙂\"}\n";val value=TextPreview.read(ByteArrayInputStream(text.toByteArray()),4096);assertEquals(text,value.text);assertEquals("UTF-8",value.encoding);assertFalse(value.truncated)}
  @Test fun readsBomUtf16AndLegacyChinese(){
    for(encoding in listOf("UTF-16LE","UTF-16BE")){
      val bom=if(encoding.endsWith("LE"))byteArrayOf(0xff.toByte(),0xfe.toByte())else byteArrayOf(0xfe.toByte(),0xff.toByte())
      val text="中文文件 🙂\n";val value=TextPreview.decode(bom+text.toByteArray(charset(encoding)),false);assertEquals(text,value.text);assertEquals(encoding,value.encoding)
    }
    assertEquals("中文日志",TextPreview.decode("中文日志".toByteArray(charset("GB18030")),false).text)
  }
  @Test fun stopsAtLimitPlusOneInsteadOfReadingTheWholeRemoteFile(){
    var count=0;val input=object:InputStream(){override fun read():Int{count++;return 'x'.code}}
    val value=TextPreview.read(input,1024);assertEquals(1025,count);assertEquals(1024,value.text.length);assertTrue(value.truncated)
  }
  @Test fun partialUtf8DoesNotCorruptTheLastCharacter(){val value=TextPreview.read(ByteArrayInputStream("中文测试".toByteArray()),4);assertEquals("中",value.text);assertTrue(value.truncated)}
  @Test fun rejectsArchivesExecutablesAndNulPayloads(){
    for(bytes in listOf(byteArrayOf(0x50,0x4b,3,4),byteArrayOf(0x4d,0x5a,0,1),byteArrayOf(0x7f,0x45,0x4c,0x46),"hello\u0000world".toByteArray())){
      try{TextPreview.decode(bytes,false);fail("Binary payload accepted")}catch(_:IllegalArgumentException){}
    }
  }
  @Test fun exactLimitAndEmptyFilesAreNotMarkedTruncated(){assertFalse(TextPreview.read(ByteArrayInputStream("1234".toByteArray()),4).truncated);assertEquals("",TextPreview.read(ByteArrayInputStream(byteArrayOf()),8).text)}
  @Test fun rejectsUnboundedRequests(){for(limit in listOf(0,-1,TextPreview.LIMIT+1)){try{TextPreview.read(ByteArrayInputStream(byteArrayOf()),limit);fail("Invalid limit accepted")}catch(_:IllegalArgumentException){}}}
  @Test fun plainTextPrefixesAreNotMistakenForBinarySignatures(){for(text in listOf("PK release notes","MZ module examples"))assertEquals(text,TextPreview.decode(text.toByteArray(),false).text)}
  @Test fun rejectsAStalledStreamWithoutBusyLooping(){val input=object:InputStream(){override fun read()=0;override fun read(bytes:ByteArray,offset:Int,length:Int)=0};try{TextPreview.read(input,100);fail("No-progress stream accepted")}catch(_:IllegalStateException){}}
}
