import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';
import{launchApp,until,sleep}from'../testing/app-session.mjs';import{cdpSession}from'../rhfiles-api.mjs';import{rhvideoFixture}from'../testing/rhvideo-fixture.mjs';
import{execFileSync}from'node:child_process';

test('paused manual slideshow navigation displays actual picture pixels instead of freezing a transparent layer',async()=>{
 const app=await launchApp({emulateFocus:true});let fixture,view;
 const invoke=(action,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+action)+','+JSON.stringify(args)+')');
 try{
  const image=execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:size=800x500:rate=1','-vf','drawbox=x=0:y=0:w=400:h=250:color=0xff0000:t=fill,drawbox=x=400:y=0:w=400:h=250:color=0x00ff00:t=fill,drawbox=x=0:y=250:w=400:h=250:color=0x0000ff:t=fill,drawbox=x=400:y=250:w=400:h=250:color=0xffff00:t=fill','-frames:v','1','-c:v','png','-threads','1','-f','image2pipe','pipe:1'],{windowsHide:true,timeout:15000});
  fixture=await rhvideoFixture({videoCount:0,pictureCount:2,beforeMedia:async({image:picture})=>picture?{body:image,contentType:'application/octet-stream'}:undefined});fixture.favorites.add('picture:picture-0');fixture.favorites.add('picture:picture-1');
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'packaged library');view=await cdpSession(target,30000);await until(()=>view.evaluate('!!window.RHFilesAPI?.list().some(row=>row.id==="rhvideo.viewer.favorite")'),'slideshow API');
  await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await invoke('category',{kind:'favorite'});await invoke('viewer.open',{mode:'slideshow',source:'favorite'});await invoke('viewer.toggle');await invoke('viewer.step',{direction:1});
  const state=await invoke('viewer.state');assert.equal(state.running,false);assert.equal(state.loading,false);assert.equal(state.index,1);
  let colors=[];await until(async()=>{
   const box=await view.evaluate('(()=>{const n=document.querySelector(".wb-slide:not(.outgoing) img"),r=n.getBoundingClientRect(),w=Math.min(r.width,r.height*n.naturalWidth/n.naturalHeight),h=w*n.naturalHeight/n.naturalWidth;return {x:r.x+(r.width-w)/2,y:r.y+(r.height-h)/2,w,h,viewport:innerWidth,opacity:Number(getComputedStyle(n.closest(".wb-slide")).opacity)};})()'),shot=Buffer.from((await view.send('Page.captureScreenshot',{format:'png'})).data,'base64');fs.writeFileSync(path.join(app.artifactDir,'paused-slideshow-pixels.png'),shot);const width=shot.readUInt32BE(16),scale=width/box.viewport,rgb=execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{input:shot,windowsHide:true,maxBuffer:32*1024*1024,timeout:10000});
   colors=Array.from({length:4},(_,i)=>{const x=Math.floor((box.x+box.w*(i%2===0?.25:.75))*scale),y=Math.floor((box.y+box.h*(i<2?.25:.75))*scale),offset=(y*width+x)*3;return Array.from(rgb.subarray(offset,offset+3));});return box.opacity>=.98&&colors.every(([r,g,b],i)=>i===0?r>160&&g<90&&b<90:i===1?g>160&&r<90&&b<90:i===2?b>160&&r<90&&g<90:r>160&&g>160&&b<90);
  },'Paused navigation must actually display four picture markers; see paused-slideshow-pixels.png',8000).catch(error=>{console.error({colors,artifacts:app.artifactDir});throw error;});await invoke('panel.close',{id:'wb-viewer'});
 }finally{view?.close();app.close();await fixture?.close();}
});
test('favorite slideshow has independent timing, a real total-progress control and End stays on the final decoded picture',async()=>{
 const app=await launchApp({emulateFocus:true});let fixture,view;
 const invoke=(action,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+action)+','+JSON.stringify(args)+')');
 try{
  fixture=await rhvideoFixture({videoCount:0,pictureCount:4});for(let i=0;i<4;i++)fixture.favorites.add('picture:picture-'+i);
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'packaged library');view=await cdpSession(target,30000);
  await until(()=>view.evaluate('!!window.RHFilesAPI?.list().some(row=>row.id==="rhvideo.configuration.preview")'),'current configuration/workbench API');
  for(const file of ['rhvideo-index.js','rhvideo-configuration.js','rhvideo-workbench.js']){const served=await view.evaluate('fetch('+JSON.stringify('js/'+file)+').then(r=>r.text())'),source=fs.readFileSync(new URL('../../src/js/'+file,import.meta.url),'utf8'),hash=x=>createHash('sha256').update(x).digest('hex');assert.equal(hash(served),hash(source),'Run the current '+file);}
  await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
  for(const [key,value]of Object.entries({stay:7,overlap:false,favoriteStay:60,favoriteFadeMs:1300}))await invoke('preferences.set',{key,value});
  await invoke('category',{kind:'favorite'});await invoke('viewer.open',{mode:'slideshow',source:'favorite'});
  await until(()=>view.evaluate('(()=>{const n=document.querySelector(".wb-slide:not(.outgoing) img");return n?.complete&&n.naturalWidth>0;})()'),'a real decoded slideshow image');
  const appearance=await view.evaluate('(()=>{const n=document.querySelector(".wb-slide:not(.outgoing)");return {stay:n.style.getPropertyValue("--stay"),fade:n.style.getPropertyValue("--fade"),zoom:n.classList.contains("ken-burns"),progress:!!document.querySelector("#wb-slideshow-progress")};})()');assert.deepEqual(appearance,{stay:'60s',fade:'1.3s',zoom:false,progress:true});
  const state=await invoke('viewer.state');assert.equal(state.total,4);assert.equal(state.totalDuration,240);assert.equal(state.duration,60);
  // The main app's focus emulation does not focus this separate native library.
  // Do not send a key before the real controller owns keyboard input, and do
  // not manufacture focus with bringToFront, DOM focus() or a preparatory click.
  const focusStarted=performance.now();await until(()=>view.evaluate('document.hasFocus()'),'Real native library keyboard focus');console.log(JSON.stringify({nativeLibraryFocusReadyMs:performance.now()-focusStarted}));
  const key=async(code,keyCode)=>{await view.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:code,code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode});await view.send('Input.dispatchKeyEvent',{type:'keyUp',key:code,code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode});};
  const observeKeys='window.__slideshowKeyEvents=[];window.addEventListener("keydown",e=>setTimeout(()=>__slideshowKeyEvents.push({code:e.code,key:e.key,target:e.target?.outerHTML,prevented:e.defaultPrevented}),0),true)';await app.evaluate(observeKeys);await view.evaluate(observeKeys);
  try{await key('End',35);await until(async()=>{const s=await invoke('viewer.state');return s.index===3&&!s.loading;},'End really selects the final image');}catch(error){console.error('slideshow keyboard diagnostic',await invoke('viewer.state'),await view.evaluate('({focused:document.hasFocus(),focus:document.activeElement?.outerHTML,keys:__slideshowKeyEvents,dialogs:[...document.querySelectorAll("dialog[open]")].map(n=>n.id)})'),await app.evaluate('({mainKeys:__slideshowKeyEvents,focused:document.hasFocus(),focus:document.activeElement?.outerHTML.slice(0,300)})'));throw error;}await sleep(300);assert.equal((await invoke('viewer.state')).index,3,'End must not immediately wrap to the first picture');
  await key('Home',36);await until(async()=>{const s=await invoke('viewer.state');return s.index===0&&!s.loading;},'Home returns to the first image');
  const delivered=await view.evaluate('__slideshowKeyEvents.map(row=>row.code)');assert(delivered.includes('End')&&delivered.includes('Home'),'Both keys must reach the real library window');assert.equal(await app.evaluate('__slideshowKeyEvents.length'),0,'Library keyboard input must not leak to the main file browser');
  const progress=await view.evaluate('RHFilesAPI.invoke("ui.list").then(rows=>rows.find(row=>row.id==="wb-slideshow-progress"))');assert(progress);await view.evaluate('RHFilesAPI.invoke("ui.set",'+JSON.stringify({controlId:progress.controlId,value:'500',commit:true})+')');await until(async()=>{const state=await invoke('viewer.state');return state.index===2&&!state.loading;},'The actual range control waits for the new decoded target');
  const stripControls='#wb-viewer [data-api-action="rhvideo.viewer.lanes"],#wb-viewer [data-api-action="rhvideo.viewer.direction"]';assert.equal(await view.evaluate('document.querySelectorAll('+JSON.stringify(stripControls)+').length'),0,'Strip-only controls are not exposed as ineffective slideshow buttons');
  assert.deepEqual((await invoke('ui.contract')).missing,[]);const screenshot=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'rhvideo-favorite-slideshow-progress.png'),Buffer.from(screenshot.data,'base64'));console.log(JSON.stringify({slideshow:appearance,totalDuration:240,artifacts:app.artifactDir}));
  await invoke('panel.close',{id:'wb-viewer'});
 }finally{view?.close();app.close();await fixture?.close();}
});

test('screenshot slideshow favorites its source video without opening the video or losing its image',async()=>{
 const app=await launchApp({emulateFocus:true});let fixture,view;
 const invoke=(action,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+action)+','+JSON.stringify(args)+')');
 try{
  fixture=await rhvideoFixture({videoCount:2,pictureCount:0,galleryVideoCount:2,galleryFrameCount:3});
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'packaged library');view=await cdpSession(target,30000);
  await until(()=>view.evaluate('!!window.RHFilesAPI?.list().some(row=>row.id==="rhvideo.viewer.favorite")'),'slideshow favorite API');await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
  await invoke('viewer.open',{mode:'slideshow',source:'gallery'});await invoke('viewer.toggle');const before=await invoke('viewer.state');assert.equal(before.current.kind,'frame');assert.equal(before.total,6);assert.equal(before.nativeVideo,false);
  await invoke('viewer.favorite');assert(fixture.favorites.has('video:'+before.current.videoId));assert.equal((await invoke('viewer.state')).favorite,true);
  await invoke('viewer.step',{direction:1});assert.equal((await invoke('viewer.state')).favorite,true,'Another screenshot of the same source has the same favorite state');await invoke('viewer.favorite');assert.equal(fixture.favorites.has('video:'+before.current.videoId),false);
  assert.equal(fixture.requests.some(row=>/\/api\/v1\/videos\/[^/]+\/play/.test(row.path)),false,'Favoriting an image must not start its source video');await invoke('panel.close',{id:'wb-viewer'});
 }finally{view?.close();app.close();await fixture?.close();}
});

test('favorite slideshow respects type filters and retains its opening snapshot after unfavoriting an off-page item',async()=>{
 const app=await launchApp({emulateFocus:true});let fixture,view;
 const invoke=(action,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+action)+','+JSON.stringify(args)+')');
 try{
  fixture=await rhvideoFixture({videoCount:0,pictureCount:42});for(let i=0;i<42;i++)fixture.favorites.add('picture:picture-'+i);fixture.favorites.add('novel:novel-0');
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'packaged library');view=await cdpSession(target,30000);
  await until(()=>view.evaluate('!!window.RHFilesAPI?.list().some(row=>row.id==="rhvideo.configuration.preview")'),'current workbench API');
  for(const file of ['rhvideo-client.js','rhvideo-workbench.js']){const served=await view.evaluate('fetch('+JSON.stringify('js/'+file)+').then(r=>r.text())'),source=fs.readFileSync(new URL('../../src/js/'+file,import.meta.url),'utf8');assert.equal(createHash('sha256').update(served).digest('hex'),createHash('sha256').update(source).digest('hex'),'Run current '+file);}
  await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await invoke('category',{kind:'favorite'});
  await invoke('preferences.set',{key:'favoriteStay',value:60});
  for(const filter of ['video','novel']){
   await invoke('preferences.set',{key:'mediaType',value:filter});const opened=await invoke('viewer.open',{mode:'slideshow',source:'favorite'});assert.equal(opened.total,0,'Do not play pictures hidden by the current '+filter+' filter');assert.equal(opened.opened,false);assert.equal((await invoke('viewer.state')).opened,false,'An empty favorite filter cannot open a blank slideshow or hidden source');await invoke('panel.close',{id:'wb-viewer'});
  }
  await invoke('preferences.set',{key:'mediaType',value:''});const opened=await invoke('viewer.open',{mode:'slideshow',source:'favorite'});assert.equal(opened.total,42,'Novels are not counted as playable media');
  await invoke('viewer.toggle');await invoke('viewer.seek',{ratio:1});
  const current=await invoke('viewer.state');assert.equal(current.index,41);assert.equal(current.current.kind,'picture');assert.equal(current.loading,false);
  const cardExists=await view.evaluate('!!document.querySelector('+JSON.stringify('.media-card[data-id="'+current.current.id+'"]')+')');assert.equal(cardExists,false,'The target is off the loaded first card page');
  const clickFavorite=async()=>{const controls=await view.evaluate('RHFilesAPI.invoke("ui.list")'),control=controls.find(row=>row.id==='wb-viewer-favorite');assert(control,'Favorite action must have the same UI/API contract');return view.evaluate('RHFilesAPI.invoke("ui.invoke",'+JSON.stringify({controlId:control.controlId})+')');};
  await clickFavorite();assert.equal(fixture.favorites.has('picture:'+current.current.id),false);assert.equal((await invoke('viewer.state')).favorite,false);
  await invoke('viewer.step',{direction:-1});await invoke('viewer.step',{direction:1});const returned=await invoke('viewer.state');assert.equal(returned.current.id,current.current.id);assert.equal(returned.total,42);assert.equal(returned.loading,false,'An unfavorited item remains playable in the already-open snapshot');
  await clickFavorite();assert.equal(fixture.favorites.has('picture:'+current.current.id),true);assert.equal((await invoke('viewer.state')).favorite,true);
  const writes=fixture.requests.filter(row=>row.path==='/api/v1/favorites/picture/'+current.current.id&&['PUT','DELETE'].includes(row.method));assert.equal(writes.length,2,'Exactly one write per explicit click');
  await invoke('panel.close',{id:'wb-viewer'});
  await invoke('viewer.open',{mode:'slideshow',source:'favorite'});assert.equal((await invoke('viewer.state')).index,0,'Reference opening always starts a fresh favorite slideshow, not an unsolicited resume');await invoke('panel.close',{id:'wb-viewer'});
 }finally{view?.close();app.close();await fixture?.close();}
});
