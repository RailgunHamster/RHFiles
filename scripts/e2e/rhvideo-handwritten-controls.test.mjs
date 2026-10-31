import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';import {cdpSession} from '../rhfiles-api.mjs';import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {exerciseHandwrittenControls} from '../testing/rhvideo-handwritten-controls.mjs';

test('handwritten search UI rejects the same invalid input as its semantic action',{timeout:60000},async()=>{
 const app=await launchApp({emulateFocus:true}),receipt={passed:false,cases:[]};let page,fixture;
 try{fixture=await rhvideoFixture({videoCount:0,galleryVideoCount:0,pictureCount:0});await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");const target=await until(async()=>{const pages=await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'owned handwritten controls library');page=await cdpSession(target,30000);await until(()=>page.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.novel.preview")'),'actual preview API');const hash=value=>createHash('sha256').update(value).digest('hex');assert.equal(hash(await page.evaluate('fetch("js/rhvideo-workbench.js").then(r=>r.text())')),hash(fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url))));
  await exerciseHandwrittenControls({page,server:fixture.url,receipt});
 }catch(error){receipt.failure=String(error);throw error;}
 finally{page?.close();await app.close();if(fixture){receipt.requests=fixture.requests.map(({path,method})=>({path,method}));await fixture.close();}fs.writeFileSync(path.join(app.artifactDir,'handwritten-controls.json'),JSON.stringify(receipt,null,2));console.log('Actual handwritten controls: '+app.artifactDir);}
});
