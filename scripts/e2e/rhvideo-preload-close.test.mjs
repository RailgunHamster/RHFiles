// Generated A/V and a real held HTTP response. No decoder hook, fake result,
// timer adjustment, replay or production account/media is used.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {launchApp,until,sleep} from '../testing/app-session.mjs';import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';import {makePresentationMarkers} from '../testing/rhvideo-presentation-input.mjs';import {markerPixels} from '../testing/native-startup-pixels.mjs';

for(const operation of ['close','back'])test('native '+operation+' releases a held next-video preload without reviving it or controlling a new input',{skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1',timeout:120000},async()=>{
 const app=await launchApp({emulateFocus:true}),receipt={operation,passed:false,heldRequests:[]};let fixture,view,release;
 const gate=new Promise(resolve=>release=resolve),api=(name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 const native=(name,args={})=>view.evaluate('window.__TAURI__.core.invoke("rhvideo_request",'+JSON.stringify({action:name,args})+')');
 const targets=async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json());
 try{
  const media=path.join(app.directory,'preload-markers.mp4');makePresentationMarkers(media);
  fixture=await rhvideoFixture({videoFile:media,videoCount:3,pictureCount:0,videoDuration:20,videoResolutions:['640x360','640x360','640x360'],beforeMedia:async({path,requestIndex})=>{if(path==='/api/v1/videos/video-1/play'){receipt.heldRequests.push(requestIndex);await gate;}}});
  await app.evaluate('RHFilesAPI.invoke("rhvideo.open")');const target=await until(async()=>(await targets()).find(p=>new URL(p.url).pathname==='/rhvideo.html'),'owned preload library');view=await cdpSession(target,30000);
  await until(()=>view.evaluate('!!globalThis.RHFilesAPI?.list().find(a=>a.id==="rhvideo.playlist.sequential")'),'actual playlist actions');
  await api('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await api('category',{kind:'video'});await api('rotation.set',{enabled:false});
  await api('playlist.sequential');receipt.playing=await until(async()=>{const value=await api('player.state');return value.renderedFrames>0?value:null;},'actual main frame before preloading',25000);
  await until(()=>receipt.heldRequests.length>0,'next video HTTP read actually held',10000);receipt.preload=await native('player.preloadState');assert.equal(receipt.preload.state,'loading');assert(receipt.preload.activeTasks>0);
  assert.equal((await api('player.state')).queue.id,'video-0','Observe lookahead, not an automatic switch to the held file');
  receipt.close=await api('player.'+operation);assert.equal(receipt.close.closed,true);
  receipt.stopped=await api('player.state');assert.equal(receipt.stopped.opened,false);assert.equal(receipt.stopped.queue,null);receipt.afterClose=await native('player.preloadState');assert.equal(receipt.afterClose.state,'idle');assert.equal(receipt.afterClose.activeTasks,0,'Close must await the worker and its decoder release, not just hide its status');
  receipt.heldClosed=await until(()=>{const transport=fixture.transport.snapshot(),rows=transport.requests.filter(row=>receipt.heldRequests.includes(row.requestIndex));return rows.length>0&&rows.every(row=>row.closedMs!==null)?rows:null;},'real upstream preload read disconnected without releasing its reply',5000);
  assert(receipt.heldClosed.every(row=>row.finishedMs===null&&!row.writableFinished),'No complete held media response was supplied to make close pass');
  await until(async()=>!(await targets()).some(p=>new URL(p.url).pathname==='/rhvideo-player.html'),'closed player target destroyed');
  const before=receipt.heldRequests.length;release();await sleep(300);assert.equal(receipt.heldRequests.length,before,'Old preload cannot start another media read after close');assert.equal((await native('player.preloadState')).state,'idle');
  await api('media.open',{kind:'video',id:'video-2'});receipt.reopened=await until(async()=>{const value=await api('player.state');return value.renderedFrames>0?value:null;},'new explicit native video',25000);
  assert.equal(receipt.reopened.queue.id,'video-2');assert.equal(receipt.reopened.renderer,'native-hardware-auto');assert.equal(receipt.reopened.decoderRate,1);assert(receipt.reopened.decodedAudioBlocks>0&&receipt.reopened.decoderVolume>0&&!receipt.reopened.muted);
  receipt.pixels=await until(async()=>{const frame=await app.readNativeFrame({expectedInput:receipt.reopened.inputId}),pixels=markerPixels(fs.readFileSync(frame.path),640,360);if(!pixels.visible)return null;fs.copyFileSync(frame.path,path.join(app.artifactDir,'preload-'+operation+'-reopened.bmp'));return pixels;},'visible four-marker reopened video',15000);
  assert.equal(receipt.heldRequests.length,before);await api('player.close');assert.equal((await native('player.preloadState')).state,'idle');receipt.passed=true;
 }catch(error){receipt.failure=String(error?.stack||error);throw error;}
 finally{release();if(fixture)receipt.transport=fixture.transport.snapshot();view?.close();await app.close();await fixture?.close();fs.writeFileSync(path.join(app.artifactDir,'preload-'+operation+'.json'),JSON.stringify(receipt,null,2));console.log('Actual preload '+operation+': '+app.artifactDir);}
});
