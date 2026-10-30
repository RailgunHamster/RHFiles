import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';
import {sourceRoot} from '../testing/source.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {installSearchTiming} from '../testing/rhvideo-search-timing.mjs';
import {cdpSession} from '../rhfiles-api.mjs';

test('actual list-page cache avoids repeated worker trips and real stage/restore/refresh cannot return stale results',{timeout:120000},async t=>{
  const fixture=await rhvideoFixture({videoCount:52});let app,view;
  t.after(async()=>{view?.close();if(app){app.close();await app.closed;}await fixture.close();});
  app=await launchApp({emulateFocus:true});
  try{
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
    const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).find(v=>new URL(v.url).pathname==='/rhvideo.html'),'actual library');
    view=await cdpSession(target,30000);await until(()=>view.evaluate("!!globalThis.RHFilesAPI?.list().some(a=>a.id==='rhvideo.search')"),'actual search API');
    const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha(await view.evaluate("fetch('js/rhvideo-workbench.js').then(r=>r.text())")),sha(fs.readFileSync(path.join(sourceRoot,'src/js/rhvideo-workbench.js'))),'Test the selected actual packaged workbench, not another source snapshot');
    const invoke=(name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
    await invoke('category',{kind:'video'});
    assert.equal((await invoke('state')).kind,'video','Select the list explicitly; the reference-compatible startup is the screenshot browser');
    await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
    await view.evaluate('('+installSearchTiming.toString()+')()');
    const trips=()=>view.evaluate("__rhvideoSearchTiming.snapshot().records.filter(r=>r.boundary==='worker'&&r.stage==='sent'&&r.action==='query').length");
    const first=await invoke('search',{query:'qing chen'}),initial=await trips();assert.equal(first.total,5);assert(initial>0);
    const repeated=await invoke('search',{query:'qing chen'}),warm=await trips();
    fs.writeFileSync(path.join(app.artifactDir,'page-cache-trips.json'),JSON.stringify({initial,warm,first,repeated},null,2));
    assert.equal(warm,initial,'An identical actual list read must not cross the worker again');assert.deepEqual(repeated,first);
    await until(()=>view.evaluate("[...document.querySelectorAll('#media-grid img')].some(img=>img.complete&&img.naturalWidth>0)"),'actual decoded cached-page cover');
    const source={kind:'video',id:'video-0'};
    await invoke('remote.trash.stage',{params:source,confirmation:'RHVIDEO:trash.stage'});
    assert.equal((await invoke('state')).total,4,'A real mutation invalidates the previously cached page immediately');
    assert.equal((await invoke('search',{query:'qing chen'})).total,4);
    await invoke('remote.trash.restore',{params:source});assert.equal((await invoke('state')).total,5);
    await invoke('refresh');assert.equal((await invoke('state')).total,5);
    await invoke('search',{query:''});const beforePage=await trips();
    assert.equal((await invoke('page',{direction:1})).offset,36);const nextPage=await trips();assert(nextPage>beforePage);
    assert.equal((await invoke('page',{direction:-1})).offset,0);assert.equal(await trips(),nextPage,'Returning to a current cached page needs no new index request');
    for(const route of ['/api/v1/trash/video/video-0','/api/v1/trash/video/video-0/restore'])assert.equal(fixture.requests.filter(r=>r.method==='POST'&&r.path===route).length,1,'Cache invalidation cannot replay writes');
    const screenshot=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'page-cache-list.png'),Buffer.from(screenshot.data,'base64'));
    t.diagnostic('Actual worker-boundary / page / mutation evidence: '+app.artifactDir);
  }catch(error){fs.writeFileSync(path.join(app.artifactDir,'page-cache-failure.json'),JSON.stringify({name:error.name,message:error.message,stack:error.stack},null,2));if(view)try{const screenshot=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'page-cache-failure.png'),Buffer.from(screenshot.data,'base64'));}catch{}throw error;}
});
