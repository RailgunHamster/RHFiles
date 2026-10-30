import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {observeMediaRevealScript,exerciseMediaReveal} from '../testing/rhvideo-media-reveal.mjs';

test('locating a real off-page picture paints only its final catalog page',{timeout:120000},async()=>{
 const app=await launchApp({emulateFocus:true}),receipt={passed:false};let fixture,page;
 try{
  fixture=await rhvideoFixture({pictureCount:100});await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>{const values=await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json();return values.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'owned library');page=await cdpSession(target,30000);await page.send('Page.enable');await until(()=>page.evaluate('!!globalThis.RHFilesAPI?.list().find(a=>a.id==="rhvideo.image.reveal")'),'initial shipped workbench');
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:observeMediaRevealScript});await page.send('Page.reload');await until(()=>page.evaluate('Array.isArray(globalThis.__qaCatalogReads)&&!!globalThis.RHFilesAPI?.list().find(a=>a.id==="rhvideo.image.reveal")'),'real catalog observation');
  const sha=s=>createHash('sha256').update(s).digest('hex');for(const file of ['rhvideo-workbench.js','rhvideo-client.js'])assert.equal(sha(await page.evaluate('fetch('+JSON.stringify('js/'+file)+').then(r=>r.text())')),sha(fs.readFileSync(new URL('../../src/js/'+file,import.meta.url))));
  await exerciseMediaReveal({page,until,server:fixture.url,receipt});
  const screenshot=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'target-revealed.png'),Buffer.from(screenshot.data,'base64'));
 }catch(error){receipt.failure=String(error);throw error;}
 finally{fs.writeFileSync(path.join(app.artifactDir,'media-reveal.json'),JSON.stringify(receipt,null,2));page?.close();await app.close();if(fixture){receipt.transport=fixture.transport.snapshot();await fixture.close();fs.writeFileSync(path.join(app.artifactDir,'media-reveal.json'),JSON.stringify(receipt,null,2));}console.log('Actual off-page location: '+app.artifactDir);}
});
