/* Original synthetic texts only; no copyrighted sample books in the repo. */
export const epub=new Map(Object.entries({
  'mimetype':'application/epub+zip',
  'META-INF/container.xml':'<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  'OPS/book.opf':'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">rhfiles-own-test</dc:identifier><dc:title>阅读测试</dc:title><dc:language>zh-CN</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>',
  'OPS/nav.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">第一章</a></li><li><a href="two.xhtml">第二章</a></li></ol></nav></body></html>',
  'OPS/one.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title></head><body><h1>第一章 中文阅读</h1><script>parent.__bookScriptRan=true</script><img src="https://example.invalid/track.png" onerror="parent.__bookScriptRan=true"/>'+Array.from({length:60},(_,i)=>'<p>第'+i+'段：这是 RHFiles 自有测试文字，用来检查中文翻页、目录和恢复阅读位置。</p>').join('')+'</body></html>',
  'OPS/two.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第二章</title></head><body><h1>第二章 测试终点</h1><p>这是第二个章节。</p></body></html>'
}).map(([name,value])=>[name,Buffer.from(value)]));
export function mobi(encryption=0){
  const html=Buffer.from('<html><body><h1>MOBI 中文测试</h1>'+('<p>这是无压缩的原创 MOBI 测试段落。</p>'.repeat(25))+'<mbp:pagebreak/><h1>第二部分</h1><p>测试结束。</p></body></html>'),title=Buffer.from('MOBI 阅读测试');
  const chunks=[];for(let offset=0;offset<html.length;offset+=4096)chunks.push(html.subarray(offset,offset+4096));const count=chunks.length+1;
  const header=Buffer.alloc(78+count*8+2),record=Buffer.alloc(248+title.length);header.write('RHFiles reader test');header.write('BOOKMOBI',60);header.writeUInt16BE(count,76);
  record.writeUInt16BE(1,0);record.writeUInt32BE(html.length,4);record.writeUInt16BE(chunks.length,8);record.writeUInt16BE(4096,10);record.writeUInt16BE(encryption,12);record.write('MOBI',16);record.writeUInt32BE(232,20);record.writeUInt32BE(2,24);record.writeUInt32BE(65001,28);record.writeUInt32BE(1,32);record.writeUInt32BE(6,36);record.writeUInt32BE(248,84);record.writeUInt32BE(title.length,88);record[95]=4;record.writeUInt32BE(count,108);record.writeUInt32BE(0xffffffff,244);title.copy(record,248);
  let offset=header.length;for(const [i,data]of[record,...chunks].entries()){header.writeUInt32BE(offset,78+i*8);offset+=data.length;}
  return Buffer.concat([header,record,...chunks]);
}
export const fb2=Buffer.from('<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><genre>prose</genre><author><first-name>RHFiles</first-name><last-name>QA</last-name></author><book-title>FB2 阅读测试</book-title><lang>zh</lang></title-info></description><body><section id="one"><title><p>FB2 中文章节</p></title><p>这是原创 FB2 阅读测试。</p></section></body></FictionBook>');
export const comic=new Map([['1.PNG',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=','base64')]]);
