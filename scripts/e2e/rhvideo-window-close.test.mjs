// Real window-manager close during preparation, followed by a new explicit
// playback. No handler replacement, artificial decoder delay or retry.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {launchApp,until,sleep} from '../testing/app-session.mjs';import {cdpSession} from '../rhfiles-api.mjs';import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';import {markerPixels} from '../testing/native-startup-pixels.mjs';
test('native title-bar close retires pending playback without poisoning an explicitly reopened player',{skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1',timeout:120000},async()=>{
 const app=await launchApp({emulateFocus:true}),receipt={passed:false,mediaRequests:[]};let fixture,view,started;
 const invoke=(name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 try{
  const file=path.join(app.directory,'window-close-generated.mp4'),markers='drawbox=x=iw*.05:y=ih*.05:w=iw*.1:h=ih*.1:color=0xff0000:t=fill,drawbox=x=iw*.85:y=ih*.05:w=iw*.1:h=ih*.1:color=0x00ff00:t=fill,drawbox=x=iw*.05:y=ih*.85:w=iw*.1:h=ih*.1:color=0x0000ff:t=fill,drawbox=x=iw*.85:y=ih*.85:w=iw*.1:h=ih*.1:color=0xffff00:t=fill';
  execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-vf',markers,'-t','12','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
  fixture=await rhvideoFixture({videoFile:file,videoCount:2,videoResolutions:['640x360','640x360'],videoDuration:12,pictureCount:0,galleryVideoCount:0,beforeMedia:({path,range})=>{if(started!==undefined&&path.endsWith('/play'))receipt.mediaRequests.push({path,range,atMs:performance.now()-started});}});
  await app.evaluate('RHFilesAPI.invoke("rhvideo.open")');const target=await until(async()=>{const pages=await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo.html');},'owned close-regression library');view=await cdpSession(target,30000);await until(()=>view.evaluate('!!RHFilesAPI.list().find(v=>v.id==="rhvideo.media.open")'),'library APIs');
  await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await invoke('category',{kind:'video'});await invoke('rotation.set',{enabled:false});
  started=performance.now();const closing=app.nativeWindows.closePlayerWhenCreated();void closing.catch(()=>{});
  await view.evaluate(`(()=>{window.__qaClosingOpen={};RHFilesAPI.invoke('rhvideo.media.open',{kind:'video',id:'video-0'}).then(value=>{__qaClosingOpen.value=value;__qaClosingOpen.done=true;},error=>{__qaClosingOpen.error=String(error);__qaClosingOpen.done=true;});return true;})()`);
  receipt.close=await closing;receipt.initial=await until(()=>view.evaluate('window.__qaClosingOpen.done?window.__qaClosingOpen:null'),'initial playback outcome');
  if(receipt.initial.error)assert.match(receipt.initial.error,/窗口已关闭/);else assert.equal(receipt.initial.value.opened,true,'A completed-before-close input may succeed');
  receipt.cancelledPreparation=!!receipt.initial.error;receipt.requestsBeforeReopen=receipt.mediaRequests.length;
  await until(async()=>!(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).some(p=>new URL(p.url).pathname==='/rhvideo-player.html'),'native closed page destroyed');
  receipt.stopped=await until(async()=>{const s=await invoke('player.state');return s.opened?null:s;},'native engine stopped');assert.equal(receipt.stopped.queue,null);
  const quiet=receipt.mediaRequests.length;await sleep(300);assert.equal(receipt.mediaRequests.length,quiet,'No new media requests after completed close');
  // A new user action, not replay of the failed request or an automatic retry.
  await invoke('media.open',{kind:'video',id:'video-1'});receipt.reopened=await until(async()=>{const s=await invoke('player.state');return s.renderedFrames>0?s:null;},'reopened input actually displays frames',25000);
  assert.equal(receipt.reopened.queue.id,'video-1');assert.equal(receipt.reopened.videoWidth,640);assert.equal(receipt.reopened.videoHeight,360);assert.equal(receipt.reopened.renderer,'native-hardware-auto');assert.equal(receipt.reopened.engineVersion.split(' ')[0],'3.0.24');assert(receipt.reopened.decodedAudioBlocks>0&&receipt.reopened.decoderVolume>0&&!receipt.reopened.muted);
  const frame=await app.readNativeFrame({expectedInput:receipt.reopened.inputId});receipt.pixels=markerPixels(fs.readFileSync(frame.path),640,360);assert(receipt.pixels.visible,'A frame counter is not proof of visible reopened media');fs.copyFileSync(frame.path,path.join(app.artifactDir,'reopened-player.bmp'));
  receipt.finalClose=await app.nativeWindows.closePlayerWhenCreated();await until(async()=>!(await invoke('player.state')).opened,'reopened input stopped');await until(async()=>!(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).some(p=>new URL(p.url).pathname==='/rhvideo-player.html'),'second actual window destroyed');receipt.passed=true;
 }catch(error){receipt.failure=String(error?.stack||error);throw error;}
 finally{if(fixture)receipt.transport=fixture.transport.snapshot();view?.close();await app.close();await fixture?.close();fs.writeFileSync(path.join(app.artifactDir,'window-close.json'),JSON.stringify(receipt,null,2));console.log('Native window lifecycle: '+app.artifactDir);}
});

for(const operation of ['close','back'])test('native '+operation+' during preparation confirms teardown and allows a new explicit open',{skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1',timeout:120000},async()=>{
 const app=await launchApp({emulateFocus:true}),receipt={operation,passed:false,cancelledPreparation:false};let fixture,view;
 const invoke=(name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 const targets=async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json());
 try{
  const file=path.join(app.directory,'api-close-generated.mp4'),markers='drawbox=x=iw*.05:y=ih*.05:w=iw*.1:h=ih*.1:color=0xff0000:t=fill,drawbox=x=iw*.85:y=ih*.05:w=iw*.1:h=ih*.1:color=0x00ff00:t=fill,drawbox=x=iw*.05:y=ih*.85:w=iw*.1:h=ih*.1:color=0x0000ff:t=fill,drawbox=x=iw*.85:y=ih*.85:w=iw*.1:h=ih*.1:color=0xffff00:t=fill';
  execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-vf',markers,'-t','12','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
  fixture=await rhvideoFixture({videoFile:file,videoCount:2,videoResolutions:['640x360','640x360'],videoDuration:12,pictureCount:0,galleryVideoCount:0});
  await app.evaluate('RHFilesAPI.invoke("rhvideo.open")');const target=await until(async()=>(await targets()).find(p=>new URL(p.url).pathname==='/rhvideo.html'),'owned API-close library');view=await cdpSession(target,30000);await until(()=>view.evaluate('!!RHFilesAPI.list().find(v=>v.id==="rhvideo.media.open")'),'library APIs');
  await invoke('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await invoke('category',{kind:'video'});await invoke('rotation.set',{enabled:false});
  await view.evaluate(`(()=>{window.__qaClosingOpen={};RHFilesAPI.invoke('rhvideo.media.open',{kind:'video',id:'video-0'}).then(value=>{__qaClosingOpen.value=value;__qaClosingOpen.done=true;},error=>{__qaClosingOpen.error=String(error);__qaClosingOpen.done=true;});return true;})()`);
  // Observe the actual new player target. Do not delay a constructor, inject an
  // error, submit a second close or assume that target existence means a frame.
  await until(async()=>(await targets()).some(p=>new URL(p.url).pathname==='/rhvideo-player.html'),'pending native player target');
  receipt.beforeClose=await view.evaluate('window.__qaClosingOpen');
  receipt.close=await invoke('player.'+operation);assert.equal(receipt.close.closed,true);
  receipt.initial=await until(()=>view.evaluate('window.__qaClosingOpen.done?window.__qaClosingOpen:null'),'initial open settles after API '+operation);
  if(receipt.initial.error){assert.match(receipt.initial.error,/窗口已关闭|准备已被关闭操作终止/);receipt.cancelledPreparation=true;}
  else assert.equal(receipt.initial.value.opened,true,'A completed-before-close input may succeed');
  await until(async()=>!(await targets()).some(p=>new URL(p.url).pathname==='/rhvideo-player.html'),'API-close native target destroyed');
  receipt.stopped=await invoke('player.state');assert.equal(receipt.stopped.opened,false);assert.equal(receipt.stopped.queue,null);
  const reads=fixture.requests.filter(row=>row.path.endsWith('/play')).length;await sleep(300);assert.equal(fixture.requests.filter(row=>row.path.endsWith('/play')).length,reads,'Completed close cannot silently start another input');
  // This is a new user operation, not a replay of the failed open.
  await invoke('media.open',{kind:'video',id:'video-1'});receipt.reopened=await until(async()=>{const state=await invoke('player.state');return state.renderedFrames>0?state:null;},'new explicit native input',25000);
  assert.equal(receipt.reopened.queue.id,'video-1');assert.equal(receipt.reopened.renderer,'native-hardware-auto');assert(receipt.reopened.decodedAudioBlocks>0&&!receipt.reopened.muted&&receipt.reopened.decoderVolume>0);
  receipt.pixels=await until(async()=>{const frame=await app.readNativeFrame({expectedInput:receipt.reopened.inputId}),pixels=markerPixels(fs.readFileSync(frame.path),640,360);if(pixels.visible){fs.copyFileSync(frame.path,path.join(app.artifactDir,'api-'+operation+'-reopened.bmp'));return pixels;}return null;},'actual reopened marker pixels',15000);
  receipt.finalClose=await invoke('player.close');assert.equal(receipt.finalClose.closed,true);await until(async()=>!(await targets()).some(p=>new URL(p.url).pathname==='/rhvideo-player.html'),'reopened native target destroyed');assert.equal((await invoke('player.state')).opened,false);receipt.passed=true;
 }catch(error){receipt.failure=String(error?.stack||error);throw error;}
 finally{if(fixture)receipt.transport=fixture.transport.snapshot();view?.close();await app.close();await fixture?.close();fs.writeFileSync(path.join(app.artifactDir,'api-'+operation+'-preparation.json'),JSON.stringify(receipt,null,2));console.log('Native API preparation '+operation+': '+app.artifactDir);}
});
