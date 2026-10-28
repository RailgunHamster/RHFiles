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
async function setup(options,{catalog=true}={}){
  const fixture=await rhvideoFixture(options),app=await launchApp({emulateFocus:true});let view;
  try{
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
    const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(p=>new URL(p.url).pathname.endsWith('/rhvideo.html'));},'library target');
    view=await cdpSession(target,30000);await until(()=>view.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.gallery.state")'),'gallery state API');
    for(const file of ['rhvideo-client.js','rhvideo-workbench.js','rhvideo-index.js','rhvideo-worker.js']){const served=await view.evaluate('fetch('+JSON.stringify('js/'+file)+').then(r=>r.text())'),source=fs.readFileSync(new URL('../../src/js/'+file,import.meta.url),'utf8'),hash=v=>createHash('sha256').update(v).digest('hex');assert.equal(hash(served),hash(source),'Use the actual embedded '+file);}
    if(catalog)await invoke(view,'category',{kind:'video'});
    await invoke(view,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
    return {fixture,app,view,close:async()=>{view.close();await app.close();await fixture.close();}};
  }catch(error){view?.close();await app.close();await fixture.close();throw error;}
}
const reads=fixture=>fixture.requests.filter(r=>r.path==='/api/v1/screenshots/grid').length;

test('reference primary screenshot browser is a real main section, not a popup or a video list',async()=>{
  const s=await setup({galleryVideoCount:6},{catalog:false});
  const click=async selector=>{const p=await s.view.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await s.view.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await s.view.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});};
  try{
    assert.equal((await invoke(s.view,'state')).view,'gallery');
    await until(()=>s.view.evaluate("document.querySelectorAll('#gallery-content .wb-frame').length===36"),'primary screenshot cards ready');
    assert.equal(await s.view.evaluate("document.getElementById('media-grid').hidden&&document.getElementById('gallery-panel').getBoundingClientRect().width>0"),true);
    assert.equal(await s.view.evaluate("document.querySelectorAll('dialog[open]').length"),0,'the reference default is a page, not an extra modal');
    await until(()=>s.view.evaluate("[...document.querySelectorAll('#gallery-content img')].some(i=>i.complete&&i.naturalWidth===800)"),'actual visible primary screenshots decode');
    await invoke(s.view,'gallery.page',{direction:1});await invoke(s.view,'gallery.inspect',{index:0});assert.equal((await invoke(s.view,'image.state')).index,36);await invoke(s.view,'image.close');
    assert.equal(await s.view.evaluate("document.querySelector('#gallery-content .wb-gallery-nav').textContent.includes('37 / 48')"),true);
    await click('nav [data-kind=video]');await until(async()=>{const v=await invoke(s.view,'state');return v.view==='catalog'&&!v.loading;},'real video navigation');
    assert.equal(await s.view.evaluate("!document.getElementById('media-grid').hidden&&document.getElementById('gallery-panel').hidden"),true);
    await click('#gallery-nav');await until(()=>s.view.evaluate("!document.getElementById('gallery-panel').hidden&&document.querySelector('#gallery-content .wb-gallery-nav').textContent.includes('37 / 48')"),'primary navigation preserves its own screenshot page');
    await invoke(s.view,'search',{query:'no such screenshot fixture'});assert.equal(await s.view.evaluate("document.querySelectorAll('#gallery-content .wb-frame').length"),0);await invoke(s.view,'search',{query:''});assert.equal(await s.view.evaluate("document.querySelectorAll('#gallery-content .wb-frame').length"),36);
    assert.deepEqual((await invoke(s.view,'ui.contract')).missing,[]);await s.view.send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(s.app.artifactDir,'primary-gallery.png'),Buffer.from(r.data,'base64')));
  }finally{await s.close();}
});

test('a slow primary gallery never traps navigation or pops a late modal after switching to videos',async()=>{
  const gate=deferred();let s;
  try{
    s=await setup({beforeGallery:()=>gate.promise},{catalog:false});assert.equal((await invoke(s.view,'state')).view,'gallery');await until(()=>reads(s.fixture)===1,'primary metadata held');
    assert.equal(await s.view.evaluate("document.querySelector('#gallery-content[aria-busy=true]')!==null"),true);
    await invoke(s.view,'category',{kind:'video'});assert.equal((await invoke(s.view,'state')).total,52);gate.resolve();await until(async()=>(await invoke(s.view,'gallery.state')).loaded,'background snapshot completes');
    assert.equal((await invoke(s.view,'state')).view,'catalog');assert.equal(await s.view.evaluate("document.querySelectorAll('dialog[open]').length"),0);assert.equal(await s.view.evaluate("document.getElementById('gallery-panel').hidden"),true);
    await invoke(s.view,'gallery.show');assert.equal(await s.view.evaluate("document.querySelectorAll('#gallery-content .wb-frame').length"),32);assert.equal(reads(s.fixture),1);
  }finally{gate.resolve();await s?.close();}
});

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
    assert.equal(await s.view.evaluate("document.querySelector('#wb-gallery .wb-frame-title').textContent"),'NEW current metadata');gate.resolve();await until(()=>oldFinished,'the old HTTP response actually finishes');await sleep(150);
    await invoke(s.view,'gallery.open');assert.equal(reads(s.fixture),2);assert.equal(await s.view.evaluate("document.querySelector('#wb-gallery .wb-frame-title').textContent"),'NEW current metadata','the current worker must not contain the late old snapshot');
  }finally{gate.resolve();await s?.close();}
});

test('a fifty-thousand screenshot pool keeps exact end-to-start navigation without transferring the full pool to the UI',async()=>{
  let s;const count=50000;
  try{
    s=await setup({beforeGallery:()=>({data:[{video_id:'video-0',filename:'Large generated pool',folder:'test',duration:count,resolution:'640x360',screenshots:Array.from({length:count},(_,i)=>({url:'/storage/pictures/0.svg',time_seconds:i}))}]})});
    await until(async()=>(await invoke(s.view,'gallery.state')).count===count,'large background pool ready',30000);
    await s.view.evaluate(`(()=>{const original=Worker.prototype.postMessage,seen=new WeakSet(),pending=new Map();window.__locateReplies=[];Worker.prototype.postMessage=function(message,...rest){if(!seen.has(this)){seen.add(this);this.addEventListener('message',event=>{if(pending.has(event.data.id)){window.__locateReplies.push({selector:pending.get(event.data.id),bytes:new TextEncoder().encode(JSON.stringify(event.data)).byteLength,queued:!!event.data.result?.queue,index:event.data.result?.located?.index});pending.delete(event.data.id);}});}if(message.action==='query'&&message.args.locate){if(message.args.allKeys)throw Error('A target lookup must not ask for the whole pool');pending.set(message.id,message.args.locate);}return original.call(this,message,...rest);};return true;})()`);
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.jump',{page:Math.ceil(count/36)});await invoke(s.view,'gallery.inspect',{index:(count-1)%36});
    const image=await invoke(s.view,'image.state');assert.equal(image.total,count);assert.equal(image.index,count-1);assert.equal(image.current.seconds,count-1);
    await until(()=>s.view.evaluate('document.getElementById("full-image").naturalWidth===800'),'last actual image decoded');
    await invoke(s.view,'image.step',{direction:1});const wrapped=await invoke(s.view,'image.state');assert.equal(wrapped.index,0);assert.equal(wrapped.current.seconds,0);
    const replies=await s.view.evaluate('window.__locateReplies');assert.equal(replies.length,1);assert.equal(replies[0].index,count-1);assert.equal(replies[0].queued,false);assert(replies[0].bytes<2000,'actual worker target reply stays bounded');
    assert.equal(reads(s.fixture),1,'navigation never refetches the all-library metadata');console.log(JSON.stringify({pass:true,screenshotPool:count,workerTargetBytes:replies[0].bytes,endToStart:true}));
  }finally{await s?.close();}
});

test('real gallery source order, mixed pictures, durable scoped names and exact continue-browsing survive a refreshed library and login',async()=>{
  let inserted=false,s;
  const data=()=>[
    ...(inserted?[{video_id:'video-3',filename:'Inserted',folder:'test',duration:20,resolution:'640x360',screenshots:[{url:'/storage/pictures/300.svg',time_seconds:0}]}]:[]),
    ...[2,0,1].map(id=>({video_id:'video-'+id,filename:['A','B','Z'][id]+'.mp4',folder:'test',duration:20,resolution:'640x360',screenshots:(id===2?[9,1,0,2,3,4,5,6,7,8,...Array.from({length:10},(_,i)=>i+10)]:Array.from({length:20},(_,i)=>i)).map(i=>({url:'/storage/pictures/'+(id*100+i)+'.svg',time_seconds:i}))}))];
  try{
    s=await setup({pictureCount:2,beforeGallery:()=>({data:data()})},{catalog:false});await until(async()=>(await invoke(s.view,'gallery.state')).total===60,'source gallery ready');
    await invoke(s.view,'gallery.inspect',{index:0});let image=await invoke(s.view,'image.state');assert.equal(image.current.videoId,'video-2');assert.equal(image.current.seconds,9);await invoke(s.view,'image.close');
    assert.equal(await s.view.evaluate("document.querySelector('#gallery-content .wb-frame-info').textContent"),'0:09 / 0:20');
    await invoke(s.view,'sort',{value:'nameAsc'});await invoke(s.view,'gallery.inspect',{index:0});assert.equal((await invoke(s.view,'image.state')).current.videoId,'video-2','video-list sorting cannot reorder screenshot browsing');await invoke(s.view,'image.close');
    await invoke(s.view,'preferences.set',{key:'mixPictures',value:true});assert.match((await invoke(s.view,'gallery.state')).seed,/^[a-f0-9]{8}$/,'a first mixed pool auto-shuffles like loadGrid');await invoke(s.view,'gallery.restore');
    await invoke(s.view,'gallery.inspect',{index:0});assert.equal((await invoke(s.view,'image.state')).current.id,'picture-0','restoring defaults places pictures before screenshot rows');await invoke(s.view,'image.close');
    await invoke(s.view,'gallery.orders');await invoke(s.view,'gallery.save',{name:'Default'});assert(await s.view.evaluate("document.querySelector('#wb-settings .wb-content').textContent.includes('Default')"),'saving updates the actual order UI');await invoke(s.view,'panel.close',{id:'wb-settings'});
    await invoke(s.view,'gallery.shuffle');const seed=(await invoke(s.view,'gallery.state')).seed;await invoke(s.view,'gallery.save',{name:'Seed'});const persisted=await s.app.evaluate("call('rhvideo_request',{action:'preferences',args:{}})");assert.equal(persisted.galleryOrdersByScope['|pictures'].Seed.seed,seed,'acknowledge only actual native persistence');
    await invoke(s.view,'gallery.page',{direction:1});await invoke(s.view,'gallery.resume',{name:'Default'});assert.equal((await invoke(s.view,'gallery.state')).offset,0);assert.equal((await invoke(s.view,'gallery.state')).seed,0,'named order does not restore an unrelated old page');
    await invoke(s.view,'gallery.page',{direction:1});await invoke(s.view,'gallery.inspect',{index:0});const prior=await invoke(s.view,'image.state');assert.equal(prior.index,36);await invoke(s.view,'image.close');
    inserted=true;await invoke(s.view,'gallery.refresh');await invoke(s.view,'gallery.restore');await invoke(s.view,'gallery.resume');image=await invoke(s.view,'image.state');assert.equal(image.index,37);assert.deepEqual(image.current,prior.current,'resume finds the exact URL instead of the reused frame index');await invoke(s.view,'image.close');
    await invoke(s.view,'gallery.save',{name:'Checkpoint'});await invoke(s.view,'connection.logout');await invoke(s.view,'connection.connect',{server:s.fixture.url,username:'preview',password:'fixture-only'});await until(async()=>{const g=await invoke(s.view,'gallery.state');return g.loaded&&g.total===63&&g.offset===36;},'login restores the remembered gallery page');
    await invoke(s.view,'gallery.resume');assert.equal((await invoke(s.view,'image.state')).index,37);await invoke(s.view,'image.close');
    await invoke(s.view,'preferences.set',{key:'perVideo',value:2});assert((await invoke(s.view,'gallery.state')).orders.includes('Seed'),'shot-count changes do not discard names');
    await invoke(s.view,'preferences.set',{key:'mixPictures',value:false});assert.deepEqual((await invoke(s.view,'gallery.state')).orders,[],'named orders are isolated by mixed-picture scope');
    assert.deepEqual((await invoke(s.view,'ui.contract')).missing,[]);console.log(JSON.stringify({pass:true,sourceOrder:['video-2','video-0','video-1'],exactResume:[36,37],scopedOrders:true,nativePersistence:true}));
  }finally{await s?.close();}
});
