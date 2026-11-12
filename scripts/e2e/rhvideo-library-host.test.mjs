// The ordinary shipped media.open flow, not a QA-only host selector. Generated
// source media / private profiles only; no focus emulation or real database.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {launchApp,until,sleep} from '../testing/app-session.mjs';import {cdpSession} from '../testing/library-session.mjs';import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';import {generateClockMedia,decodeFrameIdentity} from '../testing/native-media-clock.mjs';

test('ordinary video playback stays in the library with real pixels, scoped controls and modal restoration',{skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1',timeout:180000},async()=>{
 const app=await launchApp(),receipt={passed:false,scope:'library PLAYER functional acceptance, not full performance or Android acceptance'};let fixture,page;
 const api=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 const targets=async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json());
 const save=(name,frame)=>{fs.copyFileSync(frame.path,path.join(app.artifactDir,name+'.bmp'));return {width:frame.width,height:frame.height,alpha:frame.alpha,identity:decodeFrameIdentity(fs.readFileSync(frame.path))};};
 const capture=async(name,input)=>{
  const started=performance.now();
  for(let attempt=0;attempt<20;attempt++){
   const frame=await app.readNativeFrame({expectedInput:input});
   try{return save(name,frame);}catch(error){
    if(!/Source clock sentinel missing|Ambiguous source clock cell|Source clock inverse checksum mismatch/.test(String(error)))throw error;
    // Functional paint readiness is asynchronous after show/resize. Preserve
    // every pending/black observation; this is not a first-frame benchmark.
    (receipt.pendingFrames??=[]).push({name,attempt,elapsedMs:performance.now()-started,error:String(error)});
    fs.copyFileSync(frame.path,path.join(app.artifactDir,name+'-pending-'+attempt+'.bmp'));
    if(attempt===19||performance.now()-started>5000)throw error;
    await sleep(25);
   }
  }
 };
 try{
  const movie=path.join(app.directory,'library-clock.mp4');generateClockMedia(movie);fixture=await rhvideoFixture({videoFile:movie,videoCount:2,pictureCount:0,videoDuration:20});
  await app.evaluate('RHFilesAPI.invoke("rhvideo.open")');const target=await until(async()=>(await targets()).find(row=>new URL(row.url).pathname==='/rhvideo.html'),'owned library');page=await cdpSession(target,30000);await until(()=>page.evaluate('!!globalThis.RHFilesAPI?.list().find(row=>row.id==="rhvideo.media.open")'),'packaged library actions');
  await api('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await api('category',{kind:'video'});await api('preferences.set',{key:'fullLength',value:true});
  const started=performance.now();receipt.open=await api('media.open',{kind:'video',id:'video-0'});receipt.replyMs=performance.now()-started;assert.equal(receipt.open.freshSurfaceInput,true,'The first input owns a genuinely unused native surface');
  const early=await app.readLibraryPlayerFrame();receipt.earlySurface={alpha:early.alpha,width:early.width,height:early.height};fs.copyFileSync(early.path,path.join(app.artifactDir,'library-early.bmp'));assert.equal(early.alpha,255,'An unused canvas is not hidden waiting for coarse frame counters; this alone is not picture-readiness evidence');
  receipt.initial=await until(async()=>{const value=await api('player.state');return value.opened&&value.renderedFrames>0&&value.decodedAudioBlocks>0?value:null;},'actual library video and audio',25000);
  assert.equal(receipt.initial.host.kind,'library');assert.equal(receipt.initial.renderer,process.env.RHFILES_VLC_COMPATIBILITY==='1'?'gdi-compatibility':'native-hardware-auto');assert.equal(receipt.initial.decoderRate,1);assert(receipt.initial.decoderVolume>0&&!receipt.initial.muted);
  assert.equal((await targets()).some(row=>new URL(row.url).pathname==='/rhvideo-player.html'),false,'No separate player WebView created by the ordinary library path');
  assert.equal(await page.evaluate('document.getElementById("rhvideo-player-dialog").open'),true);receipt.frame=await capture('library-first',receipt.initial.inputId);assert.equal(receipt.frame.alpha,255);
  assert.equal(await page.evaluate('document.activeElement.className'),'rhvideo-native-stage','A new modal owns keyboard input on the video surface, not an arbitrary button');
  receipt.windows=await app.nativeWindows.windows();assert(receipt.windows.some(row=>row.label==='window-rhvideo'&&row.foreground&&row.inputFocus),'Library must retain natural focus without CDP focus emulation');
  const hash=value=>createHash('sha256').update(value).digest('hex');for(const file of ['rhvideo-player-host.js','rhvideo-player-controls.js'])assert.equal(hash(await page.evaluate('fetch('+JSON.stringify('js/'+file)+').then(row=>row.text())')),hash(fs.readFileSync(new URL('../../src/js/'+file,import.meta.url))));
  const contract=await api('inlinePlayer.contract');assert.deepEqual(contract.missing,[]);
  await api('settings.open');receipt.covered=await api('player.state');assert.equal(receipt.covered.pauseRequested,true);assert.equal((await api('player.hostState')).covered,true);
  let hidden=false;try{await app.readNativeFrame({expectedInput:receipt.initial.inputId});}catch(error){if(String(error).includes('No visible owned player surface is present'))hidden=true;else throw error;}assert(hidden,'The native video plane must not cover a newer settings dialog');
  await api('panel.close',{id:'wb-settings'});receipt.restored=await until(async()=>{const value=await api('player.state');return !value.pauseRequested&&value.state===3?value:null;},'restored running intent');assert.equal(receipt.restored.inputId,receipt.initial.inputId);receipt.restoredFrame=await capture('library-restored',receipt.initial.inputId);
  await api('inlinePlayer.control',{command:'pause',expectedInput:receipt.initial.inputId});await api('settings.open');await api('panel.close',{id:'wb-settings'});assert.equal((await api('player.state')).pauseRequested,true,'A user pause must survive cover/restore');
  const volume=await page.evaluate('RHFilesAPI.invoke("ui.list",{includeHidden:true}).then(rows=>rows.find(row=>row.id==="library-player-volume"))');assert(volume?.enabled);await page.evaluate('RHFilesAPI.invoke("ui.set",'+JSON.stringify({controlId:volume.controlId,value:'43'})+')');assert.equal((await api('player.state')).volume,43);
  await until(async()=>{const state=await api('player.state');return state.pauseRequested&&state.state===4;},'paused decoder before repeated modal paints');
  for(let cycle=0;cycle<4;cycle++){
   await api('settings.open');await api('panel.close',{id:'wb-settings'});assert.equal((await api('player.state')).pauseRequested,true);
   await capture('library-paused-modal-'+cycle,receipt.initial.inputId);
  }
  receipt.beforeFullscreen=await capture('library-before-fullscreen',receipt.initial.inputId);
  assert.equal(await page.evaluate('__TAURI__.window.getCurrentWindow().isFullscreen()'),false);await api('inlinePlayer.fullscreen');assert.equal(await page.evaluate('__TAURI__.window.getCurrentWindow().isFullscreen()'),true);
  // The OS flag can change before WebView2 resizes and the host's
  // ResizeObserver forwards the final stage bounds to the native canvas.
  const fullState=await until(async()=>{
   const geometry=await page.evaluate('(()=>{const r=document.getElementById("rhvideo-player-dialog").getBoundingClientRect(),s=document.querySelector(".rhvideo-native-stage").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight,stageWidth:s.width,stageHeight:s.height,dpr:devicePixelRatio};})()');
   receipt.fullscreenGeometry=geometry;
   assert(Math.abs(geometry.width-geometry.viewportWidth)<=1,'Fullscreen must fill the actual viewport width');
   assert(Math.abs(geometry.height-geometry.viewportHeight)<=1,'Fullscreen must fill the actual viewport height');
   assert(Math.abs(geometry.x)<=1&&Math.abs(geometry.y)<=1,'No normal-dialog margin remains in fullscreen');
   const state=await api('player.state');
   receipt.fullscreenNativeViewport={width:state.viewportWidth,height:state.viewportHeight};
   assert.equal(state.inputId,receipt.initial.inputId);
   assert(Math.abs(state.viewportWidth-Math.round(geometry.stageWidth*geometry.dpr))<=1,'Native canvas matches the actual fullscreen stage width');
   assert(Math.abs(state.viewportHeight-Math.round(geometry.stageHeight*geometry.dpr))<=1,'Native canvas matches the actual fullscreen stage height');
   return state;
  },'WebView2 layout and native canvas agree in fullscreen',5000);
  // The native resize and GDI presentation commit asynchronously. Functional
  // acceptance waits for the actual resized source pixels, not merely the
  // logical viewport reply; this is not a first-frame performance measurement.
  receipt.fullscreenFrame=await until(async()=>{const frame=await app.readNativeFrame({expectedInput:receipt.initial.inputId});if(Math.abs(frame.width-fullState.viewportWidth)>1||Math.abs(frame.height-fullState.viewportHeight)>1)return null;return save('library-fullscreen',frame);},'actual resized fullscreen source pixels',5000);assert.equal(receipt.fullscreenFrame.identity.frame,receipt.beforeFullscreen.identity.frame,'Resizing a paused video retains the actual source frame, not a black replacement');
  await api('inlinePlayer.fullscreen');assert.equal(await page.evaluate('__TAURI__.window.getCurrentWindow().isFullscreen()'),false);assert.equal(await page.evaluate('document.getElementById("rhvideo-player-dialog").classList.contains("is-fullscreen")'),false);await api('inlinePlayer.fullscreen');
  const old=await api('player.hostState');const run=await page.evaluate('RHFilesAPI.run("rhvideo.inlinePlayer.back",{})');receipt.close=await until(()=>page.evaluate('RHFilesAPI.status('+JSON.stringify(run.id)+')').then(row=>row.state==='running'?null:row),'logical close receipt',30000);assert.equal(receipt.close.state,'succeeded');assert.equal(receipt.close.result.closed,true);assert.equal((await api('player.hostState')).opened,false);assert.equal(await page.evaluate('__TAURI__.window.getCurrentWindow().isFullscreen()'),false,'Closing a library player restores its previous fullscreen state');
  await api('media.open',{kind:'video',id:'video-1'});receipt.reopened=await until(async()=>{const value=await api('player.state');return value.opened&&value.renderedFrames>0?value:null;},'reopened scoped native input',25000);assert.notEqual(receipt.reopened.host.owner,old.host.owner);assert.equal((await api('player.panelClose',{expectedPanel:old.panel})).stale,true);assert.equal((await api('player.hostState')).opened,true);
  receipt.staleNativeClose=await page.evaluate('__TAURI__.core.invoke("rhvideo_request",'+JSON.stringify({action:'player.closeHost',args:{window:old.host.window,panel:old.panel,owner:old.host.owner,reason:'close'}})+')');assert.equal(receipt.staleNativeClose.stale,true);assert.equal(receipt.staleNativeClose.closed,false);assert.equal((await api('player.state')).inputId,receipt.reopened.inputId,'The native reservation fence, not only the UI identity, rejects a delayed old close');
  assert.equal(receipt.reopened.freshSurfaceInput,true,'Closing and reopening allocates a new canvas');receipt.reusedOpen=await api('media.open',{kind:'video',id:'video-1'});assert.equal(receipt.reusedOpen.freshSurfaceInput,false,'Reopening an input in the same canvas must not inherit its first-input exemption');assert.notEqual(receipt.reusedOpen.inputId,receipt.reopened.inputId);
  receipt.reused=await until(async()=>{const value=await api('player.state');return value.opened&&value.renderedFrames>0?value:null;},'reused canvas has its own displayed input',25000);receipt.reusedFrame=await capture('library-reused',receipt.reused.inputId);assert.equal(receipt.reusedFrame.alpha,255);await api('player.close');receipt.passed=true;
 }catch(error){receipt.failure=String(error?.stack||error);throw error;}
 finally{page?.close();await app.close();if(fixture){receipt.transport=fixture.transport.snapshot();await fixture.close();}fs.writeFileSync(path.join(app.artifactDir,'library-host.json'),JSON.stringify(receipt,null,2));console.log('Actual library PLAYER: '+app.artifactDir);}
});
