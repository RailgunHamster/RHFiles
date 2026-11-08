package com.railgunhamster.rhfiles

import org.junit.Assert.*
import org.junit.Test

class SafeXmlTest {
  private val xml="<?xml version=\"1.0\"?><d:multistatus xmlns:d=\"DAV:\"><d:response><d:href>中文 &amp; a.txt</d:href></d:response></d:multistatus>"
  @Test fun supportsNamespaceAwareUtf8AndUtf16WithoutApacheFeatures(){
    for(encoding in listOf("UTF-8","UTF-16","UTF-16LE","UTF-16BE")){
      val doc=SafeXml.parse(xml.toByteArray(charset(encoding)))
      assertEquals("中文 & a.txt",doc.getElementsByTagNameNS("DAV:","href").item(0).textContent)
    }
  }
  @Test fun rejectsDtdAndEntityDeclarationsInEveryAcceptedWireEncoding(){
    for(encoding in listOf("UTF-8","UTF-16","UTF-16LE","UTF-16BE"))for(source in listOf("<!DOCTYPE x SYSTEM 'http://127.0.0.1:1/private'><x/>","<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///private'>]><x>&e;</x>","<!DOCTYPE x [<!ENTITY a 'long'>]><x>&a;</x>")){
      try{SafeXml.parse(source.toByteArray(charset(encoding)));fail("DTD accepted")}catch(_:IllegalArgumentException){}
    }
  }
  @Test fun rejectsOversizedBinaryAndEncodingConfusion(){
    for(source in listOf(byteArrayOf(0,0,60,0),"<?xml version=\"1.0\" encoding=\"UTF-7\"?><x/>".toByteArray(),ByteArray(101){120})){
      try{SafeXml.parse(source,100);fail("Invalid input accepted")}catch(_:Exception){}
    }
  }
}
