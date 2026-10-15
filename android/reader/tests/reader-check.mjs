import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {browserFixture} from '../../web/tests/browser-fixture.mjs';import {epub,mobi,fb2,comic} from './fixtures.mjs';
let format='epub',raw;const test=await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),(req,res)=>{
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/book/'))return false;
  const entries=format==='cbz'?comic:epub;
  if(url.pathname==='/book/meta')res.setHeader('Content-Type','application/json'),res.end(JSON.stringify({name:'test.'+format,format,key:'own-test-'+format,size:123,entries:[...entries].map(([filename,bytes])=>({filename,size:bytes.length}))}));
  else if(url.pathname==='/book/raw')res.end(raw);else{const bytes=entries.get(url.searchParams.get('name'));bytes?res.end(bytes):res.writeHead(404).end();}return true;
});let checks=0;const check=(condition,label)=>{assert.ok(condition,label);console.log('ok '+(++checks)+' - '+label)};const errors=[];const page=await test.browser.newPage({viewport:{width:412,height:800}});page.on('pageerror',error=>errors.push(error.message));
const ready=async()=>{await page.waitForFunction(()=>document.getElementById('status').hidden||document.getElementById('status').classList.contains('failed'));assert.equal(await page.locator('#status').getAttribute('hidden'),'','Reader loads: '+await page.locator('#status').innerText());};
try{
  await page.goto(test.url);await ready();
  const bookText=()=>page.evaluate(()=>[...document.querySelector('foliate-view').renderer.getContents()].map(c=>c.doc.body.textContent).join(''));
  check((await bookText()).includes('中文阅读'),'EPUB actual parser renders Chinese text');
  check(!await page.evaluate(()=>window.__bookScriptRan),'book scripts and event handlers did not execute');
  check(await page.evaluate(()=>document.querySelector('foliate-view').renderer.getContents().every(c=>!c.doc.defaultView.frameElement.sandbox.contains('allow-scripts'))),'book frames have no script sandbox permission');
  await page.locator('#next').click();await page.waitForTimeout(500);check(Number(await page.locator('#progress').inputValue())>0,'pagination changes reading progress');
  await page.locator('#toc-toggle').click();await page.getByRole('button',{name:'第二章',exact:true}).click();await page.waitForTimeout(500);check((await bookText()).includes('测试终点'),'TOC jumps to another section');
  await page.locator('#font-plus').click();await page.locator('#theme-toggle').click();check(await page.locator('html').getAttribute('data-theme')==='sepia','reading appearance changes without changing book');
  await page.locator('#bookmark-toggle').click();await page.locator('#toc-toggle').click();await page.locator('#bookmarks-tab').click();check(await page.locator('.bookmark-row').count()===1,'bookmark saved');await page.locator('#toc-close').click();
  await page.reload();await ready();check((await bookText()).includes('测试终点'),'EPUB reading position restores');
  await page.evaluate(()=>localStorage.setItem('rhfiles.reader.book.own-test-epub','null'));await page.reload();await ready();check(!await page.locator('#status').isVisible(),'malformed cached state safely reset');
  format='mobi';raw=mobi();await page.goto(test.url);await ready();check((await bookText()).includes('MOBI 中文测试'),'MOBI actual PalmDOC parser renders Chinese text');
  raw=mobi(1);await page.reload();await page.waitForSelector('#status.failed');check((await page.locator('#status').innerText()).includes('DRM'),'encrypted MOBI refused with useful error');
  raw=Buffer.from('invalid');await page.reload();await page.waitForSelector('#status.failed');check((await page.locator('#status').innerText()).includes('原文件不会被修改'),'damaged MOBI fails visibly without modifying source');
  format='fb2';raw=fb2;await page.reload();await ready();check((await bookText()).includes('FB2 中文章节'),'FB2 actual parser renders Chinese text');
  format='cbz';await page.reload();await ready();check(await page.evaluate(()=>document.querySelector('foliate-view').renderer.getContents().some(c=>c.doc.querySelector('img')?.naturalWidth>0)),'CBZ renders uppercase image extension without extracting files');
  check(errors.length===0,'no uncaught reader exceptions: '+errors.join(';'));console.log('PASS '+checks+' ebook browser checks');
}finally{await page.close();await test.close();}
