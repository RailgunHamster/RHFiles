package com.railgunhamster.rhfiles

import java.io.StringReader
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import javax.xml.parsers.DocumentBuilderFactory
import org.xml.sax.InputSource
import org.xml.sax.SAXException

/** Android's platform DOM parser does not implement Apache-specific features.
 * Decode the XML wire encodings explicitly and reject DTDs before parsing; the
 * resolver is a second barrier, never a permissive feature-setting fallback. */
internal object SafeXml {
  fun parse(bytes:ByteArray,limit:Int=4*1024*1024):org.w3c.dom.Document {
    require(bytes.size<=limit){"XML 响应过大"}
    fun at(i:Int)=bytes.getOrNull(i)?.toInt()?.and(255)
    var skip=0
    val encoding=when {
      at(0)==255&&at(1)==254->{skip=2;"UTF-16LE"}
      at(0)==254&&at(1)==255->{skip=2;"UTF-16BE"}
      at(0)==0&&at(1)==60->"UTF-16BE"
      at(0)==60&&at(1)==0->"UTF-16LE"
      else->{if(at(0)==239&&at(1)==187&&at(2)==191)skip=3;"UTF-8"}
    }
    val decoder=charset(encoding).newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
    val text=decoder.decode(ByteBuffer.wrap(bytes,skip,bytes.size-skip)).toString()
    require('\u0000' !in text){"XML 编码无效"}
    val declared=Regex("^<\\?xml\\s[^>]*?encoding\\s*=\\s*['\"]([^'\"]+)['\"]",RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)?.uppercase(java.util.Locale.ROOT)
    require(declared==null||declared==encoding||declared=="UTF-16"&&encoding.startsWith("UTF-16")){"XML 编码不受支持，请使用 UTF-8 或 UTF-16"}
    require(!text.contains("<!DOCTYPE",true)&&!text.contains("<!ENTITY",true)){"XML 不允许 DTD 或实体声明"}
    val builder=DocumentBuilderFactory.newInstance().apply{isNamespaceAware=true;isExpandEntityReferences=false}.newDocumentBuilder()
    builder.setEntityResolver{_,_->throw SAXException("XML 不允许外部实体")}
    return builder.parse(InputSource(StringReader(text)))
  }
}
