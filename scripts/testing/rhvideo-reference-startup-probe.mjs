// Runs the actual reference page in a fresh, isolated WebView2 process.
// This is a comparison oracle, NOT a browser-playback fallback in RHFiles.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {launchApp,until} from './app-session.mjs';
import {rhvideoFixture} from './rhvideo-fixture.mjs';
import {generateStartupMedia} from './rhvideo-startup-media.mjs';
const scenario=process.argv[2]||'h264-1080',reference=path.resolve(process.env.RHVIDEO_SOURCE||'../RHVideo');
assert(fs.existsSync(path.join(reference,'static/index.html')),'Provide the actual RHVideo source');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-reference-startup-')),file=path.join(directory,'startup.mp4');
let app,fixture,failure;const receipt={scenario,measure:'reference page, fresh process, library ready; rVFC plus visible screenshot evidence',physicalScreenTiming:false,mediaRequests:[]};
try{
  receipt.source=generateStartupMedia(file,scenario);receipt.sourceSha256=createHash('sha256').update(fs.readFileSync(file)).digest('hex');receipt.referenceSHA256=createHash('sha256').update(fs.readFileSync(path.join(reference,'static/index.html'))).digest('hex');
  app=await launchApp({emulateFocus:true});receipt.artifactDir=app.artifactDir;
  let started;
  fixture=await rhvideoFixture({referenceStatic:path.join(reference,'static'),videoFile:file,videoCount:1,pictureCount:0,galleryVideoCount:1,galleryFrameCount:1,videoDuration:12,beforeMedia:({path:request,range})=>{if(started!==undefined&&request.endsWith('/play'))receipt.mediaRequests.push({atMs:performance.now()-started,range:range||null});}});
  // The real reference streams do not attach fetch headers to <video>. Supply
  // the owned fixture credential at the test transport, without changing the
  // reference's functions, source URLs or media/rendering implementation.
  await app.send('Network.enable');await app.send('Network.setExtraHTTPHeaders',{headers:{Authorization:'Bearer fixture-bearer-do-not-persist'}});
  await app.send('Page.navigate',{url:fixture.url});await until(()=>app.evaluate("typeof playVideoLocal==='function'&&typeof RHSearch!=='undefined'"),'actual reference ready');
  await app.evaluate("(async()=>{const value=await(await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'preview',password:'fixture-only'})})).json();token=value.access_token;mediaRotated=false;document.getElementById('app').classList.remove('hidden');document.getElementById('login-section').classList.add('hidden');switchTab('list');await loadVideos();await filterVideos();})()");
  await until(()=>app.evaluate("allVideos.length===1&&[...document.querySelectorAll('#videos-grid img')].some(i=>i.complete&&i.naturalWidth>0)"),'one reference cover decoded');
  await app.send('Page.bringToFront');
  await app.evaluate("window.__firstReferenceFrame=null;window.__referenceVideoObserver=new MutationObserver(()=>{const video=document.querySelector('#media-content video');if(video&&!video.dataset.startupProbe){video.dataset.startupProbe='true';video.requestVideoFrameCallback((now,metadata)=>{window.__firstReferenceFrame={elapsedMs:performance.now()-window.__referenceVideoStart,mediaTime:metadata.mediaTime,presentedFrames:metadata.presentedFrames,width:metadata.width,height:metadata.height,visible:document.visibilityState,rect:video.getBoundingClientRect().toJSON()};});}});window.__referenceVideoObserver.observe(document.getElementById('media-content'),{childList:true});true");
  // Same user activation as clicking Play, not a forced autoplay preference.
  started=performance.now();await app.send('Runtime.evaluate',{expression:"window.__referenceVideoStart=performance.now();playVideoLocal('video-0');true",userGesture:true,returnByValue:true});
  receipt.firstFrame=await until(()=>app.evaluate('window.__firstReferenceFrame'),'reference compositor callback',15000);
  assert.equal(receipt.firstFrame.visible,'visible');assert(receipt.firstFrame.rect.width>0&&receipt.firstFrame.rect.height>0);assert.equal(receipt.firstFrame.width,receipt.source.width);assert.equal(receipt.firstFrame.height,receipt.source.height);
  await app.screenshot('reference-first-frame');assert(receipt.mediaRequests.length>0,'The actual reference reached the fixture stream');
}catch(error){failure=error;receipt.error=String(error?.stack||error);}
finally{
  if(app){app.close();await app.closed;fs.writeFileSync(path.join(app.artifactDir,'reference-startup-measurement.json'),JSON.stringify(receipt,null,2));}
  await fixture?.close();if(path.basename(directory).startsWith('rhfiles-reference-startup-')&&path.dirname(fs.realpathSync(directory))===fs.realpathSync(os.tmpdir()))fs.rmSync(directory,{recursive:true});
}
console.log(JSON.stringify(receipt));if(failure)throw failure;
