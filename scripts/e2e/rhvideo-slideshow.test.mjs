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
 const inputTransport=process.env.RHFILES_QA_SLIDESHOW_KEYS||(process.env.RHFILES_NATIVE_PLAYER_QA==='1'?'windows':'cdp');assert(['cdp','windows'].includes(inputTransport));
 if(inputTransport==='windows')assert.equal(process.env.RHFILES_NATIVE_PLAYER_QA,'1','Only the guarded owned-window QA adapter may send Windows keys');
 // This case tests native keyboard routing. Do not emulate focus in any view
 // sharing this browser environment: document.hasFocus() alone can then be
 // true even while neither native window owns keyboard input.
 const app=await launchApp();let fixture,view;
 const invoke=(action,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+action)+','+JSON.stringify(args)+')');
 try{
  fixture=await rhvideoFixture({videoCount:0,pictureCount:4});for(let i=0;i<4;i++)fixture.favorites.add('picture:picture-'+i);
  if(inputTransport==='windows'){
   await assert.rejects(app.evaluate('window.__TAURI__.core.invoke("rhvideo_request",{action:"diagnostics.libraryKey",args:{key:"PageDown"}})'),/仅允许 Home／End/);
   for(const encoding of ['arbitrary',7,null])await assert.rejects(app.evaluate('window.__TAURI__.core.invoke("rhvideo_request",{action:"diagnostics.libraryKey",args:'+JSON.stringify({key:'End',encoding})+'})'),/编码无效/);
   await assert.rejects(app.evaluate('window.__TAURI__.core.invoke("rhvideo_request",{action:"diagnostics.libraryKey",args:{key:"End"}})'),/测试媒体库未打开/);
  }
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
  const focusStarted=performance.now();let actualFocus;
  await until(async()=>{
   actualFocus=await view.evaluate('(async()=>({dom:document.hasFocus(),windows:'+ (process.env.RHFILES_NATIVE_PLAYER_QA==='1'?'await window.__TAURI__.core.invoke("rhvideo_request",{action:"diagnostics.windows",args:{}})':'null') +'}))()');
   const own=actualFocus.windows?.find(row=>row.label==='window-rhvideo');
   return actualFocus.dom&&(!actualFocus.windows||(own?.foreground&&own.active&&own.inputFocus));
  },'Real native library keyboard input ownership').catch(error=>{console.error({actualNativeFocus:actualFocus});throw error;});
  console.log(JSON.stringify({nativeLibraryFocusReadyMs:performance.now()-focusStarted,actualFocus}));
  const key=async(code,keyCode,encoding)=>{if(inputTransport==='windows'){const sent=await view.evaluate('window.__TAURI__.core.invoke("rhvideo_request",{action:"diagnostics.libraryKey",args:'+JSON.stringify({key:code,encoding})+'})');assert.deepEqual(sent,{sent:2,key:code,transport:'windows-send-input',encoding});return;}await view.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:code,code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode});await view.send('Input.dispatchKeyEvent',{type:'keyUp',key:code,code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode});};
  // Capture synchronously: a throttled setTimeout must not look like a missing
  // key. Never record outerHTML (which can include opaque media URLs).
  const observeKeys=`window.__slideshowKeyEvents=[];window.__slideshowFocusEvents=[];
    for(const type of ['keydown','keyup'])window.addEventListener(type,event=>{if(__slideshowKeyEvents.length>=64)return;const row={type,code:event.code,key:event.key,target:event.target?.id||event.target?.tagName,at:performance.now(),preventedAtCapture:event.defaultPrevented};__slideshowKeyEvents.push(row);setTimeout(()=>row.preventedAfterDispatch=event.defaultPrevented,0);},true);
    for(const type of ['focus','blur','focusin','focusout'])window.addEventListener(type,event=>{if(__slideshowFocusEvents.length<64)__slideshowFocusEvents.push({type,target:event.target?.id||event.target?.tagName||'window',at:performance.now(),focused:document.hasFocus()});},true);true`;
  await app.evaluate(observeKeys);await view.evaluate(observeKeys);
  const focusSnapshot=session=>session.evaluate('(async()=>({focused:document.hasFocus(),nativeFocused:await window.__TAURI__.window.getCurrentWindow().isFocused(),nativeWindows:await window.__TAURI__.core.invoke("rhvideo_request",{action:"diagnostics.windows",args:{}}).catch(()=>({unavailable:true})),visible:document.visibilityState,focus:document.activeElement?.id||document.activeElement?.tagName,keys:__slideshowKeyEvents,focusEvents:__slideshowFocusEvents,dialogs:[...document.querySelectorAll("dialog[open]")].map(n=>n.id)}))()');
  console.log(JSON.stringify({slideshowInputBefore:{main:await focusSnapshot(app),library:await focusSnapshot(view)}}));
  const encodings=[];
  for(const encoding of inputTransport==='windows'?['virtual-key','scan-code']:['cdp']){
   const start=await view.evaluate('__slideshowKeyEvents.length');
   try{await key('End',35,encoding);await until(async()=>{const s=await invoke('viewer.state');return s.index===3&&!s.loading;},'End really selects the final image');}catch(error){const diagnostic={inputTransport,encoding,state:await invoke('viewer.state'),library:await focusSnapshot(view),main:await focusSnapshot(app)};fs.writeFileSync(path.join(app.artifactDir,'slideshow-end-failure.json'),JSON.stringify(diagnostic,null,2));console.error('slideshow keyboard diagnostic',diagnostic,'artifacts',app.artifactDir);throw error;}await sleep(300);assert.equal((await invoke('viewer.state')).index,3,'End must not immediately wrap to the first picture');
   await key('Home',36,encoding);await until(async()=>{const s=await invoke('viewer.state');return s.index===0&&!s.loading;},'Home returns to the first image');
   await until(()=>view.evaluate('__slideshowKeyEvents.length>='+String(start+4)),'this input encoding delivers all down/up events');
   const events=await view.evaluate('__slideshowKeyEvents.slice('+start+')');
   for(const key of ['Home','End'])for(const type of ['keydown','keyup'])assert(events.some(row=>row.type===type&&row.key===key));
   if(encoding==='scan-code')assert(events.every(row=>row.code===row.key),'The physical scan-code control must really deliver Home/End codes');
   encodings.push({encoding,events});
  }
  // Native virtual/keypad navigation need not provide a physical code. Require
  // all four actual semantic key events, never just the command acknowledgement.
  await until(()=>view.evaluate('["Home","End"].every(key=>["keydown","keyup"].every(type=>__slideshowKeyEvents.some(row=>row.key===key&&row.type===type)))'),'both native navigation key down/up pairs reach the real library window');
  const keyboard={inputTransport,encodings,initialFocus:actualFocus,library:await focusSnapshot(view),main:await focusSnapshot(app)};
  fs.writeFileSync(path.join(app.artifactDir,'slideshow-keyboard.json'),JSON.stringify(keyboard,null,2));
  assert.equal(keyboard.main.keys.length,0,'Library keyboard input must not leak to the main file browser');
  const progress=await view.evaluate('RHFilesAPI.invoke("ui.list").then(rows=>rows.find(row=>row.id==="wb-slideshow-progress"))');assert(progress);await view.evaluate('RHFilesAPI.invoke("ui.set",'+JSON.stringify({controlId:progress.controlId,value:'500',commit:true})+')');await until(async()=>{const state=await invoke('viewer.state');return state.index===2&&!state.loading;},'The actual range control waits for the new decoded target');
  const stripControls='#wb-viewer [data-api-action="rhvideo.viewer.lanes"],#wb-viewer [data-api-action="rhvideo.viewer.direction"]';assert.equal(await view.evaluate('document.querySelectorAll('+JSON.stringify(stripControls)+').length'),0,'Strip-only controls are not exposed as ineffective slideshow buttons');
  assert.deepEqual((await invoke('ui.contract')).missing,[]);const screenshot=await view.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(app.artifactDir,'rhvideo-favorite-slideshow-progress.png'),Buffer.from(screenshot.data,'base64'));console.log(JSON.stringify({slideshow:appearance,totalDuration:240,artifacts:app.artifactDir}));
  await invoke('panel.close',{id:'wb-viewer'});
  if(inputTransport==='windows'){
   // Only after the real keyboard workflow, test refusal in our own OTHER
   // window. Never use this focus change to make End/Home pass.
   await app.evaluate('window.__TAURI__.core.invoke("rhvideo_request",{action:"diagnostics.activateMain",args:{}})');
   await until(async()=>{const rows=await app.evaluate('window.__TAURI__.core.invoke("rhvideo_request",{action:"diagnostics.windows",args:{}})');return rows.some(row=>row.label==='main'&&row.foreground&&row.inputFocus);},'owned main window for the negative input guard');
   await assert.rejects(view.evaluate('window.__TAURI__.core.invoke("rhvideo_request",{action:"diagnostics.libraryKey",args:{key:"End"}})'),/媒体库没有真实输入焦点/);
   assert.equal(await app.evaluate('__slideshowKeyEvents.length'),0,'A refused key cannot reach the other window');
   keyboard.refusal={passed:true,windows:await app.evaluate('window.__TAURI__.core.invoke("rhvideo_request",{action:"diagnostics.windows",args:{}})')};
   fs.writeFileSync(path.join(app.artifactDir,'slideshow-keyboard.json'),JSON.stringify(keyboard,null,2));
  }
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
