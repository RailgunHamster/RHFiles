import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';import {cdpSession} from '../rhfiles-api.mjs';import {imageDecodeFixture,exerciseImageDecode} from '../testing/rhvideo-image-decode.mjs';
test('real picture decoding, malformed media, rapid navigation and close share truthful UI/API state',{timeout:120000},async()=>{
 const app=await launchApp({emulateFocus:true}),receipt={passed:false};let page,fixture;
 try{
  fixture=await imageDecodeFixture();await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>{const pages=await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'owned media library');page=await cdpSession(target,30000);await page.send('Page.enable');await until(()=>page.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.image.seek")'),'shipped image API');
  const sha=v=>createHash('sha256').update(v).digest('hex');for(const file of ['rhvideo-client.js','rhvideo-workbench.js'])assert.equal(sha(await page.evaluate('fetch('+JSON.stringify('js/'+file)+').then(r=>r.text())')),sha(fs.readFileSync(new URL('../../src/js/'+file,import.meta.url))));
  await exerciseImageDecode({page,until,server:fixture.url,fixture,receipt,screenshot:async name=>{const shot=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,name+'.png'),Buffer.from(shot.data,'base64'));}});
 }catch(error){receipt.failure=String(error);throw error;}
 finally{fixture?.releaseAll();page?.close();await app.close();if(fixture){receipt.requests=fixture.requests.map(({path,method})=>({path,method}));receipt.transport=fixture.transport.snapshot();await fixture.close();}fs.writeFileSync(path.join(app.artifactDir,'image-decode.json'),JSON.stringify(receipt,null,2));console.log('Actual image decoding: '+app.artifactDir);}
});
