import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';
import {sourceRoot} from '../testing/source.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {visibleCoverReadiness} from '../testing/rhvideo-visible-covers.mjs';
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
    const invoke=(name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
    const ready=async()=>{await view.evaluate('('+visibleCoverReadiness.toString()+')("#media-grid .cover-button")');await view.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
    await invoke('category',{kind:'video'});await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
    await invoke('search',{query:'qing chen'});await ready();
    const before=await view.evaluate("(()=>{window.__qaSeenCards=[...document.querySelectorAll('#media-grid .media-card')].filter(card=>{const r=card.querySelector('.cover-button').getBoundingClientRect();return r.width>0&&r.height>0&&r.left<innerWidth&&r.top<innerHeight&&r.right>0&&r.bottom>0;}).map(card=>({card,image:card.querySelector('img'),id:card.dataset.id}));return {visible:__qaSeenCards.length,bytes:__qaSeenCards.reduce((n,v)=>n+v.image.naturalWidth*v.image.naturalHeight*4,0),ids:__qaSeenCards.map(v=>v.id)};})()");
    assert(before.visible>0);assert(before.bytes<=16*1024*1024,'The actual previously visible workload must fit the unchanged cache budget');
    const visible=new Set(before.ids),reads=()=>fixture.requests.filter(r=>r.path.endsWith('/thumbnail')&&visible.has(r.path.split('/').at(-2))).length,initialReads=reads();assert(initialReads>0);
    await invoke('search',{query:'海边'});await ready();await invoke('search',{query:'qing chen'});await ready();
    const result=await view.evaluate("({sameCards:__qaSeenCards.every(v=>document.querySelector('#media-grid .media-card[data-id=\"'+v.id+'\"]')===v.card),sameImages:__qaSeenCards.every(v=>v.card.querySelector('img')===v.image&&v.image.complete&&v.image.naturalWidth>0)})");
    fs.writeFileSync(path.join(app.artifactDir,'visible-card-cache.json'),JSON.stringify({before,result,initialReads,finalReads:reads()},null,2));
    assert.equal(result.sameCards,true,'Actual previously visible cards, not unseen bottom rows, must survive the alternate list');assert.equal(result.sameImages,true);assert.equal(reads(),initialReads,'Returning to the seen page must not reread its visible thumbnails');
    const shot=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'visible-card-cache.png'),Buffer.from(shot.data,'base64'));
    t.diagnostic('Actual visible-node / decode / HTTP evidence: '+app.artifactDir);
  }catch(error){fs.writeFileSync(path.join(app.artifactDir,'visible-card-cache-failure.json'),JSON.stringify({message:error.message,stack:error.stack},null,2));throw error;}
});
