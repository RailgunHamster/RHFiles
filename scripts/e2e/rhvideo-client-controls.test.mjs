import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';import {cdpSession} from '../rhfiles-api.mjs';
import {clientControlsFixture,exerciseClientControls} from '../testing/rhvideo-client-controls.mjs';

test('media cards preserve actual favorite and image failures in their UI receipts',{timeout:60000},async()=>{
 const app=await launchApp({emulateFocus:true}),receipt={passed:false};let page,fixture;
 try{
  fixture=await clientControlsFixture();await app.evaluate('RHFilesAPI.invoke("rhvideo.open")');
  const target=await until(async()=>{const pages=await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'owned client-controls library');
  page=await cdpSession(target,30000);await until(()=>page.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.media.open")'),'actual media API');
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');for(const file of ['rhvideo-client.js','rhvideo-workbench.js'])assert.equal(sha(await page.evaluate('fetch('+JSON.stringify('js/'+file)+').then(r=>r.text())')),sha(fs.readFileSync(new URL('../../src/js/'+file,import.meta.url))));
  await exerciseClientControls({page,server:fixture.url,fixture,receipt});
 }catch(error){receipt.failure=String(error);throw error;}
 finally{page?.close();await app.close();if(fixture){receipt.requests=fixture.requests.map(({path,method})=>({path,method}));receipt.transport=fixture.transport.snapshot();await fixture.close();}fs.writeFileSync(path.join(app.artifactDir,'client-controls.json'),JSON.stringify(receipt,null,2));console.log('Actual media-card controls: '+app.artifactDir);}
});
