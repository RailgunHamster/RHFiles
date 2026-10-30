import test from 'node:test';
import assert from 'node:assert/strict';
import {launchApp,until} from '../testing/app-session.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {cdpSession} from '../rhfiles-api.mjs';

async function setup(beforeMedia){
  const app=await launchApp({emulateFocus:true});let fixture,view;
  try{
    fixture=await rhvideoFixture({videoCount:1,pictureCount:0,beforeMedia});
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
    const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'range fixture library');
    view=await cdpSession(target,30000);
    await until(()=>view.evaluate('!!window.RHFilesAPI?.list().some(a=>a.id==="rhvideo.connection.connect")'),'library actions');
    await view.evaluate('RHFilesAPI.invoke("rhvideo.category",{kind:"video"})');
    await view.evaluate('RHFilesAPI.invoke("rhvideo.connection.connect",'+JSON.stringify({server:fixture.url,username:'preview',password:'fixture-only'})+')');
    const url=await until(()=>view.evaluate("(()=>{const img=document.querySelector('.media-card[data-id=\"video-0\"] img');return img?.complete&&img.naturalWidth>0?img.src:null;})()"),'real opaque media capability');
    return {app,fixture,url,close:async()=>{view.close();await app.close();await fixture.close();}};
  }catch(error){view?.close();await app.close();await fixture?.close();throw error;}
}

test('real media broker preserves safe 416 resource lengths without forwarding private error headers or bodies',{timeout:60000},async t=>{
  let contentRange='bytes */12345',status=416;
  const s=await setup(({range})=>range?{status,headers:{'content-range':contentRange,'accept-ranges':'bytes','set-cookie':'private-cookie=never-forward','www-authenticate':'Bearer private-challenge','x-private-error':'secret'},detail:'private upstream body'}:null);
  t.after(s.close);t.diagnostic('Range error evidence: '+s.app.artifactDir);
  for(const value of ['bytes */0','bytes */12345','bytes */18446744073709551615',
    'bytes */18446744073709551616','bytes */-1','bytes 0-1/12','items */12','bytes */secret','bytes */12 token=secret']){
    contentRange=value;
    const response=await fetch(s.url,{headers:{Range:'bytes=12345-'},signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,416);
    const valid=['bytes */0','bytes */12345','bytes */18446744073709551615'].includes(value);
    assert.equal(response.headers.get('content-range'),valid?value:null,'The upstream size must survive a valid EOF response, never an invalid/secret field');
    assert.equal(response.headers.get('accept-ranges'),'bytes');
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    for(const name of ['set-cookie','www-authenticate','x-private-error'])assert.equal(response.headers.get(name),null);
    assert.equal(await response.text(),'');
  }
  status=404;
  const missing=await fetch(s.url,{headers:{Range:'bytes=12345-'},signal:AbortSignal.timeout(10000)});
  assert.equal(missing.status,404);assert.equal(missing.headers.get('content-range'),null);assert.equal(await missing.text(),'');
  assert.equal(s.fixture.requests.filter(row=>row.range).length,10,'Each explicit GET reaches the server exactly once');
});

test('logout during a pending range response rejects its stale resource metadata',{timeout:60000},async t=>{
  let release,entered;const held=new Promise(resolve=>release=resolve),arrived=new Promise(resolve=>entered=resolve);
  const s=await setup(async({range})=>{if(!range)return null;entered();await held;return {status:416,headers:{'content-range':'bytes */987654','accept-ranges':'bytes'},detail:'private old account'};});
  t.after(async()=>{release();await s.close();});
  const pending=fetch(s.url,{headers:{Range:'bytes=987654-'},signal:AbortSignal.timeout(10000)});
  await Promise.race([arrived,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Range request did not arrive')),5000);timer.unref();})]);
  await s.app.evaluate('call("rhvideo_request",{action:"logout",args:{}})');release();
  const response=await pending;assert.equal(response.status,401);assert.equal(response.headers.get('content-range'),null);assert.equal(await response.text(),'');
  assert.equal(s.fixture.requests.filter(row=>row.range).length,1,'Logout cannot replay the old read');
});

test('logout while image content detection is awaiting its prefix cannot expose old MIME or length',{timeout:60000},async t=>{
  let release,entered;const held=new Promise(resolve=>release=resolve),arrived=new Promise(resolve=>entered=resolve);
  const body=Buffer.from('\x89PNG\r\n\x1a\nprivate-old-image','latin1');
  const s=await setup(({range})=>range?{body,contentType:'application/octet-stream',splitAt:4,afterFirstChunk:()=>{entered();return held;}}:null);
  t.after(async()=>{release();await s.close();});
  const pending=fetch(s.url,{headers:{Range:'bytes=0-'},signal:AbortSignal.timeout(10000)});
  await Promise.race([arrived,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Image prefix did not arrive')),5000);timer.unref();})]);
  await s.app.evaluate('call("rhvideo_request",{action:"logout",args:{}})');release();
  const response=await pending;assert.equal(response.status,401);assert.equal(response.headers.get('content-type'),null);assert.notEqual(response.headers.get('content-length'),String(body.length));
  assert.equal(await response.text(),'');assert.equal(s.fixture.requests.filter(row=>row.range).length,1);
});
