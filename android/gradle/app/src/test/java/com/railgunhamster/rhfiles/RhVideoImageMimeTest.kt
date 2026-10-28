package com.railgunhamster.rhfiles

import okio.Buffer
import okio.Source
import okio.Timeout
import okio.buffer
import org.junit.Assert.*
import org.junit.Test

class RhVideoImageMimeTest {
  @Test fun knownSignaturesWinOverIncorrectMimeLabels(){
    val cases=mapOf("\u0089PNG\r\n\u001a\n" to "image/png","\u00ff\u00d8\u00ff" to "image/jpeg","RIFF0000WEBP" to "image/webp","GIF89a" to "image/gif","GIF87a" to "image/gif","BM" to "image/bmp","\u0000\u0000\u0001\u0000" to "image/x-icon","II*\u0000" to "image/tiff","MM\u0000*" to "image/tiff","0000ftypavif" to "image/avif","0000ftypmif10000avis" to "image/avif")
    cases.forEach{(prefix,mime)->assertEquals(mime,RhVideoImageMime.detect(prefix.toByteArray(Charsets.ISO_8859_1),claimed="text/plain"))}
  }
  @Test fun truncationAndErrorPagesDoNotTrustTheClaimedImageType(){
    for(prefix in listOf("","RIF","RIFF0000W","<html>login required","<!DOCTYPE html>","{\"error\":true}","<svgarbage>"))for(type in listOf("image/png","image/svg+xml","application/octet-stream"))assertNull(prefix,RhVideoImageMime.detect(prefix.toByteArray(),claimed=type))
  }
  @Test fun svgRequiresBothItsExplicitMimeAndAnXmlOrSvgPrefix(){
    for(prefix in listOf("<svg xmlns='x'>","\uFEFF \n<svg>","<?xml version='1.0'?><svg>")){
      assertEquals("image/svg+xml",RhVideoImageMime.detect(prefix.toByteArray(),claimed="Image/SVG+XML; charset=utf-8"))
      assertNull(RhVideoImageMime.detect(prefix.toByteArray(),claimed="application/octet-stream"))
    }
  }
  @Test fun peekIsBoundedPreservesEveryByteAndRestoresTheSourceDeadline(){
    val bytes="RIFF0000WEBP".toByteArray()+ByteArray(1024*1024){(it%251).toByte()};val backing=Buffer().write(bytes)
    val timeout=Timeout().deadline(1,java.util.concurrent.TimeUnit.MINUTES);val previous=timeout.deadlineNanoTime();var consumed=0L
    val source=object:Source{override fun timeout()=timeout;override fun close(){};override fun read(sink:Buffer,byteCount:Long):Long=backing.read(sink,byteCount).also{if(it>0)consumed+=it}}.buffer()
    assertEquals("image/webp",RhVideoImageMime.sniff(source,"application/octet-stream"));assertTrue("Do not download the whole image to identify it",consumed<=8192);assertEquals(previous,timeout.deadlineNanoTime());assertArrayEquals(bytes,source.readByteArray())
  }
  @Test fun aRejectedPrefixDoesNotConsumeBytesOrLeaveANewDeadline(){
    val source=Buffer().writeUtf8("not an image".repeat(20));val count=source.size
    try{RhVideoImageMime.sniff(source,"image/png");fail()}catch(_:IllegalArgumentException){}
    assertEquals(count,source.size);assertFalse(source.timeout().hasDeadline())
  }
}
