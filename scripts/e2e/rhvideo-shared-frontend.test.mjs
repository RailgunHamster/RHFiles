// Actual RHFiles + WebView2 + libVLC, consuming the canonical frontend artifact.
// Every HTTP response/media file belongs to an isolated generated fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from '../testing/app-session.mjs';
import {cdpSession} from '../testing/library-session.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {makePresentationMarkers} from '../testing/rhvideo-presentation-input.mjs';
import {verify} from '../rhvideo-frontend.mjs';

test('canonical frontend controls actual native media without a second playlist/UI',{skip:process.platform!=='win32'||process.env.RHFILES_NATIVE_PLAYER_QA!=='1',timeout:180000},async()=>{
 const app=await launchApp({emulateFocus:true});let fixture,page;const receipt={passed:false,frontend:verify().id};
 const api=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
 const call=(name,args=[])=>api('shared.call',{name,args});
 const media=()=>api('shared.media');
 try{
  const file=path.join(app.directory,'shared-markers.mp4');makePresentationMarkers(file);
  fixture=await rhvideoFixture({videoFile:file,videoCount:3,pictureCount:3,videoDuration:20});
  await app.evaluate('RHFilesAPI.invoke("rhvideo.open",{shared:true})');
  const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).find(row=>new URL(row.url).pathname==='/rhvideo-shared.html'),'canonical owned library');
  page=await cdpSession(target,30000);
  const packaged=await page.evaluate('fetch("vendor/rhvideo/frontend/manifest.json").then(response=>response.json())');
  assert.equal(packaged.id,receipt.frontend,'Test the exact imported frontend, not a cached application build');
  receipt.connected=await api('connect',{server:fixture.url,username:'preview',password:'fixture-only'});assert(receipt.connected.connected);
  await call('navigation.tab',['list']);
  await until(()=>page.evaluate('document.querySelectorAll("#videos-grid .video-card").length===3'),'canonical video list');
  const operations=await api('shared.operations');assert(operations.actions.length>300);assert(operations.controls.length>200);
  assert.equal(await page.evaluate('typeof RHVideoWorkbench'), 'undefined','The reimplemented workbench is not loaded');
  await call('app.playVideoLocal',['video-0']);
  receipt.playing=await until(async()=>{const rows=await media();return rows.find(row=>row.src.includes('video-0')&&row.state.renderedFrames>0&&row.state.decodedAudioBlocks>0);},'actual decoded native audio/video',30000);
  assert.equal(receipt.playing.state.engine,'libVLC');assert(receipt.playing.state.nativeSurface);
  await api('shared.control',{target:'#media-content video',action:'media',options:{command:'pause'}});
  await until(async()=>(await media()).some(row=>row.state.state===4),'actual native pause');
  await api('shared.control',{target:'#media-content video',action:'media',value:7,options:{command:'seek'}});
  receipt.seek=await until(async()=>{const rows=await media();return rows.find(row=>Math.abs(row.state.positionMs-7000)<500&&!row.state.restoringPausedFrame);},'actual native seek while paused',20000);
  await call('app.toggleFavorite',['video','video-0',true]);assert(fixture.favorites.has('video:video-0'));
  await call('app.playVideoLocal',['video-1']);
  receipt.switched=await until(async()=>{const rows=await media();return rows.find(row=>row.src.includes('video-1')&&row.state.renderedFrames>0);},'next actual native input',30000);
  assert.notEqual(receipt.playing.input,receipt.switched.input);
  await until(async()=>(await media()).filter(row=>row.src).length===1,'retired input released');
  await call('app.closeMediaViewer');
  await call('app.startListSequentialPlay');
  const playlist=async()=> (await media()).find(row=>row.elementId==='playlist-video'&&row.src&&row.state.renderedFrames>0);
  const first=await until(playlist,'first shared playlist item',30000);
  await call('app.playlistNav',[1]);
  receipt.playlistNext=await until(async()=>{const row=await playlist();return row&&row.src!==first.src?row:null;},'native playlist next',30000);
  await call('app.closePlaylistViewer');
  await call('app.startListSequentialPlay');
  receipt.playlistRestored=await until(async()=>{const row=await playlist();return row?.src===receipt.playlistNext.src?row:null;},'same shared playlist position restored',30000);
  await call('app.closePlaylistViewer');
  receipt.privacy=await page.evaluate('({cookies:document.cookie,hasBearer:document.documentElement.outerHTML.includes("fixture-bearer-do-not-persist"),inline:document.querySelectorAll("[onclick],[onerror],[onload]").length})');
  assert.equal(receipt.privacy.hasBearer,false);
  assert.equal(receipt.privacy.inline,0);
  await app.screenshot('shared-frontend-main.png');
  await call('app.logout');
  await until(()=>page.evaluate('document.getElementById("app").classList.contains("hidden")'),'canonical logout');
  receipt.passed=true;
 }catch(error){receipt.failure=String(error.stack||error);if(page)try{receipt.dom=await page.evaluate('document.body.innerText.slice(-6000)');receipt.state=await media();}catch{}throw error;}
 finally{page?.close();await app.close();await fixture?.close();fs.writeFileSync(path.join(app.artifactDir,'shared-frontend.json'),JSON.stringify(receipt,null,2));console.log('Shared frontend evidence: '+app.artifactDir);}
});
