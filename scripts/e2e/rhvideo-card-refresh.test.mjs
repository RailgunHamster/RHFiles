import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchApp,until} from '../testing/app-session.mjs';
import {sourceRoot} from '../testing/source.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {cdpSession} from '../rhfiles-api.mjs';

test('cached catalog repaint leaves the active picture alone while real favorite changes still synchronize',{timeout:120000},async t=>{
  const fixture=await rhvideoFixture({videoCount:3}),app=await launchApp({emulateFocus:true});let view;
  t.after(async()=>{view?.close();app.close();await app.closed;await fixture.close();});
  try{
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
    const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).find(v=>new URL(v.url).pathname==='/rhvideo.html'),'actual media library');
    view=await cdpSession(target,30000);await until(()=>view.evaluate("!!globalThis.RHFilesAPI?.list().some(a=>a.id==='rhvideo.image.state')"),'picture actions');
    const hash=value=>createHash('sha256').update(value).digest('hex');
    assert.equal(hash(await view.evaluate("fetch('js/rhvideo-client.js').then(r=>r.text())")),hash(fs.readFileSync(path.join(sourceRoot,'src/js/rhvideo-client.js'))),'The served client must match this explicitly selected source snapshot');
    const invoke=(name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
    await invoke('category',{kind:'picture'});await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
    await invoke('media.open',{kind:'picture',id:'picture-0'});
    await until(()=>view.evaluate("document.getElementById('image-dialog').open&&document.getElementById('full-image').naturalWidth>0"),'actual decoded picture');
    const before=await invoke('image.state');assert.equal(before.current.id,'picture-0');
    await view.evaluate("window.__qaCachedNodes=[...document.querySelectorAll('#media-grid .media-card')];window.__qaPreviewRepaints=0;window.__qaPreviewObserver=new MutationObserver(records=>{window.__qaPreviewRepaints+=records.length});window.__qaPreviewObserver.observe(document.getElementById('image-position'),{childList:true});true");
    await invoke('search',{query:''});await view.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const render=await view.evaluate("({intact:window.__qaCachedNodes.length>0&&window.__qaCachedNodes.every((n,i)=>document.querySelectorAll('#media-grid .media-card')[i]===n),repaints:window.__qaPreviewRepaints,cards:window.__qaCachedNodes.length})");
    fs.writeFileSync(path.join(app.artifactDir,'cached-card-render.json'),JSON.stringify(render,null,2));
    assert.equal(render.intact,true,'Exercise real reused DOM cards, not a fresh replacement');assert.equal(render.cards,8);assert.equal(render.repaints,0,'A cached list repaint must not refresh the active preview once per card');
    assert.deepEqual(await invoke('image.state'),before,'List refresh cannot change preview identity, position or target');
    await invoke('image.favorite');assert(fixture.favorites.has('picture:picture-0'));
    assert.equal(await view.evaluate("document.getElementById('wb-image-favorite').getAttribute('aria-pressed')"),'true');
    assert.equal(await view.evaluate("document.querySelector('.favorite-button[data-key=\"picture:picture-0\"]').getAttribute('aria-pressed')"),'true');
    assert((await view.evaluate('window.__qaPreviewRepaints'))>0,'An actual favorite still refreshes the active preview');
    await view.evaluate('window.__qaPreviewObserver.disconnect();true');
    assert.equal(fixture.requests.filter(r=>r.method==='PUT'&&r.path==='/api/v1/favorites/picture/picture-0').length,1,'No favorite replay');
    const screenshot=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'cached-card-picture.png'),Buffer.from(screenshot.data,'base64'));
    t.diagnostic('Actual cached-card / picture / favorite evidence: '+app.artifactDir);
  }catch(error){if(view)try{const screenshot=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'cached-card-failure.png'),Buffer.from(screenshot.data,'base64'));}catch{}throw error;}
});
