import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchApp,until,sleep} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const invoke=(view,name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
async function setup(options){
  const fixture=await rhvideoFixture(options),app=await launchApp({emulateFocus:true});let view;
  try{
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
    const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(p=>new URL(p.url).pathname.endsWith('/rhvideo.html'));},'library target');
    view=await cdpSession(target,30000);await until(()=>view.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.gallery.state")'),'gallery state API');
    for(const file of ['rhvideo-client.js','rhvideo-workbench.js']){const served=await view.evaluate('fetch('+JSON.stringify('js/'+file)+').then(r=>r.text())'),source=fs.readFileSync(new URL('../../src/js/'+file,import.meta.url),'utf8'),hash=v=>createHash('sha256').update(v).digest('hex');assert.equal(hash(served),hash(source),'Use the actual embedded '+file);}
    await invoke(view,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
    return {fixture,app,view,close:async()=>{view.close();await app.close();await fixture.close();}};
  }catch(error){view?.close();await app.close();await fixture.close();throw error;}
}
const reads=fixture=>fixture.requests.filter(r=>r.path==='/api/v1/screenshots/grid').length;

test('login prepares gallery metadata without blocking cards or popping a dialog; opening joins that same read',async()=>{
  const gate=deferred();let s;
  try{
    s=await setup({beforeGallery:()=>gate.promise});await until(()=>reads(s.fixture)===1,'background request starts');
    assert.equal((await invoke(s.view,'state')).total,52);assert.equal((await invoke(s.view,'gallery.state')).loading,true);
    assert.equal(await s.view.evaluate("!!document.querySelector('#wb-gallery[open]')"),false);
    await s.view.evaluate('window.__galleryOpen=RHFilesAPI.invoke("rhvideo.gallery.open");true');
    await until(()=>s.view.evaluate("!!document.querySelector('#wb-gallery[open] .wb-content[aria-busy=true]')"),'a real closable loading panel appears');
    await sleep(150);assert.equal(reads(s.fixture),1,'opening must not duplicate the background request');gate.resolve();await s.view.evaluate('window.__galleryOpen');
    await until(()=>s.view.evaluate("[...document.querySelectorAll('#wb-gallery .wb-frame img')].filter(i=>i.complete&&i.naturalWidth===800).length===32"),'gallery images really decode');
    assert.equal((await invoke(s.view,'gallery.state')).count,32);assert.deepEqual((await invoke(s.view,'ui.contract')).missing,[]);
    await invoke(s.view,'rules.apply',{rule:{mode:'and',include:['山野与旅途'],exclude:[]}});
    assert.equal(await s.view.evaluate("document.querySelectorAll('#wb-gallery .wb-frame').length"),8,'changing the shared filter updates an already-open gallery too');
    await invoke(s.view,'rules.apply',{rule:{mode:'and',include:['no-such-fixture-folder'],exclude:[]}});
    assert.equal(await s.view.evaluate("document.querySelectorAll('#wb-gallery .wb-frame').length"),0);assert(await s.view.evaluate("document.querySelector('.wb-gallery-nav').textContent.includes('没有符合条件')"));
  }finally{gate.resolve();await s?.close();}
});
test('closing a visible loading panel does not let its delayed completion reopen it',async()=>{
  const gate=deferred();let s;
  try{
    s=await setup({beforeGallery:()=>gate.promise});await until(()=>reads(s.fixture)===1,'background request');
    await s.view.evaluate('window.__galleryOpen=RHFilesAPI.invoke("rhvideo.gallery.open");true');await until(()=>s.view.evaluate("!!document.querySelector('#wb-gallery[open]')"),'loading panel open');
    await invoke(s.view,'panel.close',{id:'wb-gallery'});gate.resolve();assert.equal((await s.view.evaluate('window.__galleryOpen')).stale,true);
    assert.equal((await invoke(s.view,'gallery.state')).loaded,true,'a harmless background metadata read can finish after closing');assert.equal(await s.view.evaluate("!!document.querySelector('#wb-gallery[open]')"),false);
  }finally{gate.resolve();await s?.close();}
});
test('a failed background gallery does not fail the video list or silently retry and its error remains visible',async()=>{
  let offline=true,s;
  try{
    s=await setup({beforeGallery:()=>offline?{status:503,detail:'Owned gallery unavailable'}:null});
    await until(async()=>(await invoke(s.view,'gallery.state')).error,'terminal background error');assert.equal((await invoke(s.view,'state')).total,52);assert.equal(reads(s.fixture),1);
    await invoke(s.view,'refresh');await sleep(150);assert.equal(reads(s.fixture),1,'refreshing the list is not a hidden gallery retry');
    assert.equal(await s.view.evaluate("(()=>{const n=document.getElementById('wb-gallery-status');return n&&!n.hidden&&n.textContent.includes('加载失败');})()"),true);
    offline=false;await invoke(s.view,'gallery.open');assert.equal(reads(s.fixture),2);assert.equal((await invoke(s.view,'gallery.state')).loaded,true);assert.equal(await s.view.evaluate("document.getElementById('wb-gallery-status').hidden"),true);
    await s.view.send('Emulation.setDeviceMetricsOverride',{width:800,height:700,deviceScaleFactor:1,mobile:false});
    assert(await s.view.evaluate("document.querySelector('.wb-gallery-tools').getBoundingClientRect().height<140"),'gallery controls should wrap as a toolbar, not take seven full rows');
    await s.view.send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(s.app.artifactDir,'gallery-ready.png'),Buffer.from(r.data,'base64')));
    await s.view.send('Emulation.setDeviceMetricsOverride',{width:360,height:740,deviceScaleFactor:1,mobile:false});
    assert(await s.view.evaluate("(()=>{const n=document.querySelector('.wb-gallery-tools');return n.scrollWidth<=n.clientWidth+1&&n.getBoundingClientRect().height<280;})()"),'narrow controls wrap within the panel');
  }finally{await s?.close();}
});
test('a late pre-refresh response cannot replace the new gallery even in the same account',async()=>{
  const gate=deferred();let calls=0,s,oldFinished=false;
  const data=title=>[{video_id:'video-0',filename:title,folder:'test',duration:12,resolution:'640x360',screenshots:[{url:'/storage/pictures/0.svg',time_seconds:0}]}];
  try{
    s=await setup({beforeGallery:async({response})=>{const call=++calls;if(call===1){response.once('finish',()=>oldFinished=true);await gate.promise;return {data:data('OLD delayed metadata')};}return {data:data('NEW current metadata')};}});
    await until(()=>calls===1,'old background metadata request held');await invoke(s.view,'gallery.refresh');
    assert.equal(await s.view.evaluate("document.querySelector('#wb-gallery .wb-frame').textContent"),'NEW current metadata');gate.resolve();await until(()=>oldFinished,'the old HTTP response actually finishes');await sleep(150);
    await invoke(s.view,'gallery.open');assert.equal(reads(s.fixture),2);assert.equal(await s.view.evaluate("document.querySelector('#wb-gallery .wb-frame').textContent"),'NEW current metadata','the current worker must not contain the late old snapshot');
  }finally{gate.resolve();await s?.close();}
});
