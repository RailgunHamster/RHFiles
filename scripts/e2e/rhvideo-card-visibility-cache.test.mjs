import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';
import {sourceRoot} from '../testing/source.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {exerciseVisibleCardCache} from '../testing/rhvideo-visible-card-cache.mjs';
import {cdpSession} from '../rhfiles-api.mjs';

test('visible decoded covers survive an actual alternate search within the unchanged detached-image budget',{timeout:120000},async t=>{
  const fixture=await rhvideoFixture({videoCount:480});let app,view;
  t.after(async()=>{view?.close();if(app){app.close();await app.closed;}await fixture.close();});
  app=await launchApp({emulateFocus:true});
  try{
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
    const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).find(v=>new URL(v.url).pathname==='/rhvideo.html'),'actual media view');
    view=await cdpSession(target,30000);await until(()=>view.evaluate("!!globalThis.RHFilesAPI?.list().some(a=>a.id==='rhvideo.search')"),'actual library API');
    const sha=x=>createHash('sha256').update(x).digest('hex');
    for(const file of ['rhvideo-client.js','rhvideo-workbench.js'])assert.equal(sha(await view.evaluate('fetch('+JSON.stringify('js/'+file)+').then(r=>r.text())')),sha(fs.readFileSync(path.join(sourceRoot,'src/js',file))),'The actual program must match the explicitly selected '+file);
    await view.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await view.send('Emulation.setFocusEmulationEnabled',{enabled:true});await view.send('Page.bringToFront');
    await exerciseVisibleCardCache({page:view,server:fixture.url,fixture,receipt:{},onSnapshot:value=>fs.writeFileSync(path.join(app.artifactDir,'visible-card-cache.json'),JSON.stringify(value,null,2))});
    const shot=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'visible-card-cache.png'),Buffer.from(shot.data,'base64'));
    t.diagnostic('Actual visible-node / decode / HTTP evidence: '+app.artifactDir);
  }catch(error){fs.writeFileSync(path.join(app.artifactDir,'visible-card-cache-failure.json'),JSON.stringify({message:error.message,stack:error.stack},null,2));throw error;}
});
