// Cold PLAYER start after the library is ready; not a cold OS/disk-cache test.
// Run sequentially, with the actual renderer checked. Never an acceptance
// claim that compatibility scaling and default hardware output have equal quality.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {launchApp,until,sleep} from './app-session.mjs';
import {rhvideoFixture} from './rhvideo-fixture.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {markerPixels} from './native-startup-pixels.mjs';
import {startupScenarios,generateStartupMedia} from './rhvideo-startup-media.mjs';
assert.equal(process.env.RHFILES_NATIVE_PLAYER_QA,'1','Opt in to the owned native-output diagnostic');
const scenario=process.argv[2]||'h264-1080',format=startupScenarios[scenario];assert(format,'Unknown fixed startup scenario');
const captureMode=process.argv[3]||'poll';assert(['poll','after-stats'].includes(captureMode),'Use poll or after-stats pixel sampling');
const mediaRoot=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-startup-source-')),sourceFile=path.join(mediaRoot,'startup.mp4');
let app,fixture,library,opening,started;const receipt={scenario,source:format,captureMode,measure:'new process/player, library already ready',traceClock:'host pipe receipt, not exact VLC producer time',samplePeriodMs:200,samples:[],mediaRequests:[]};let failure;
const action=(view,name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
const command=(name,args={})=>app.evaluate('call("rhvideo_request",'+JSON.stringify({action:name,args})+')');
try{
  const {width,height}=generateStartupMedia(sourceFile,scenario);
  receipt.sourceSha256=createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
  app=await launchApp({emulateFocus:true,traceOutput:true});
  fixture=await rhvideoFixture({videoFile:sourceFile,videoCount:1,pictureCount:0,galleryVideoCount:1,galleryFrameCount:1,videoDuration:12,videoResolutions:[`${width}x${height}`],beforeMedia:({path:request,range})=>{if(started!==undefined&&request.endsWith('/play'))receipt.mediaRequests.push({atMs:performance.now()-started,range:range||null});}});
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(p=>new URL(p.url).pathname.endsWith('/rhvideo.html'));},'library target');
  library=await cdpSession(target,30000);
  await until(()=>library.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.media.open")'),'library actions');
  await action(library,'category',{kind:'video'});await action(library,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await action(library,'rotation.set',{enabled:false});
  await until(()=>library.evaluate("(()=>{const images=[...document.querySelectorAll('.cover-button img')];return images.length===1&&images.every(i=>i.complete&&i.naturalWidth>0);})()"),'one real initial cover finishes before timing');
  const served=await library.evaluate("fetch('js/rhvideo-workbench.js').then(r=>r.text())"),expected=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');assert.equal(createHash('sha256').update(served).digest('hex'),createHash('sha256').update(expected).digest('hex'),'Measure the actual current embedded frontend');
  assert.equal(await app.evaluate('typeof window.__TAURI__.window.Window.getByLabel'), 'function','Use actual window visibility, not a hidden/offscreen readback alone');
  receipt.artifactDir=app.artifactDir;receipt.executable=process.env.RHFILES_TEST_EXECUTABLE||path.resolve('target/debug/rhfiles.exe');receipt.executableSha256=createHash('sha256').update(fs.readFileSync(receipt.executable)).digest('hex');
  started=performance.now();const requestStart=fixture.requests.length;let openError;
  opening=action(library,'media.open',{kind:'video',id:'video-0'}).then(value=>{receipt.openReplyMs=performance.now()-started;return value;},error=>{openError=error;return null;});
  let lastMissingMs=0,lastState;
  while(performance.now()-started<15000){
    if(openError)throw openError;
    const state=await command('player.state');lastState=state;
    if(state.opened){
      if(process.env.RHFILES_EXPECT_RENDERER)assert.equal(state.renderer,process.env.RHFILES_EXPECT_RENDERER,'Confirm the renderer actually selected');
      receipt.renderer=state.renderer;
      const windowState=await app.evaluate("window.__TAURI__.window.Window.getByLabel('window-rhvideo-player').then(async w=>w?{visible:await w.isVisible(),minimized:await w.isMinimized()}:null)");
      const sample={atMs:performance.now()-started,statsFrames:state.renderedFrames,decodedFrames:state.decodedFrames,reportedFirstFrameMs:state.firstFrameMs,window:windowState};
      if(!receipt.firstStatsObservedMs&&state.renderedFrames>0){receipt.firstStatsObservedMs=sample.atMs;receipt.reportedFirstFrameMs=state.firstFrameMs;}
      // PrintWindow is synchronous. Compare against a run which makes NO image
      // readback until VLC reports displayed frames, rather than assuming the
      // act of observing pixels cannot perturb decoder/window initialization.
      // With after-stats there is no negative image sample before that point:
      // the interval's lower bound correctly stays zero, not the last zero
      // statistic (VLC publishes those counters only periodically).
      if(!receipt.firstPixelIntervalMs&&windowState?.visible&&!windowState.minimized&&(captureMode==='poll'||state.renderedFrames>0)){
        const began=performance.now()-started,image=await command('player.diagnosticFrame',{expectedInput:state.inputId});
        assert.equal(path.dirname(image.path),app.directory);assert.match(path.basename(image.path),/^rhvideo-native-[a-f0-9]{32}\.bmp$/);
        const bytes=fs.readFileSync(image.path),pixels=markerPixels(bytes,width,height);sample.captureMs=performance.now()-started-began;sample.pixels=pixels;
        if(pixels.visible){receipt.firstPixelIntervalMs=[lastMissingMs,performance.now()-started];fs.copyFileSync(image.path,path.join(app.artifactDir,'first-visible.bmp'));}
        else lastMissingMs=began;
        fs.unlinkSync(image.path); // Only the exact random file from this owned fixture.
      }
      receipt.samples.push(sample);
      if(receipt.firstPixelIntervalMs&&receipt.firstStatsObservedMs)break;
    }
    await sleep(receipt.samplePeriodMs);
  }
  await opening;if(openError)throw openError;
  receipt.finalState=lastState;receipt.nonStreamRequests=fixture.requests.slice(requestStart).filter(r=>!r.path.endsWith('/play')).map(r=>r.path);
  assert(receipt.firstPixelIntervalMs,'No four-marker native frame appeared inside the bounded observation');assert(receipt.firstStatsObservedMs,'No native display statistic appeared inside the bounded observation');
  assert(receipt.mediaRequests.length>0,'The measured input really reached the owned upstream');
}catch(error){failure=error;receipt.error=String(error?.stack||error);}
finally{
  library?.close();if(app){app.close();let timer;try{await Promise.race([app.closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned process output did not drain')),5000);})]);}catch(error){failure??=error;receipt.cleanupError=String(error);}finally{clearTimeout(timer);}}await fixture?.close();
  if(app){
    if(started!==undefined)receipt.nativeTrace=app.outputEvents.filter(event=>event.at>=started).map(({at,stream,text})=>({atMs:at-started,stream,text}));
    const log=fs.readFileSync(path.join(app.artifactDir,'app.log'),'utf8');receipt.hardwareLog=log.split(/\r?\n/).filter(line=>/hardware decoding|using.*D3D11VA|using video output|using hw|using vout display|frame thread mode|Direct3D11 Open/i.test(line)).slice(0,12);
    receipt.startupStages=[...log.matchAll(/RHFILES_VLC_STAGE ([a-z-]+) (\d+)/g)].map(([,stage,elapsedMs])=>({stage,elapsedMs:Number(elapsedMs)}));
    receipt.openStages=[...log.matchAll(/RHFILES_PLAY_STAGE ([a-z-]+) (\d+)/g)].map(([,stage,elapsedMs])=>({stage,elapsedMs:Number(elapsedMs)}));
    receipt.audioOutputInitializations=(log.match(/main generic debug: creating audio output/g)||[]).length;
    fs.writeFileSync(path.join(app.artifactDir,'startup-measurement.json'),JSON.stringify(receipt,null,2));
    const bitmap=path.join(app.artifactDir,'first-visible.bmp');if(fs.existsSync(bitmap))execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-i',bitmap,'-frames:v','1',path.join(app.artifactDir,'first-visible.png')],{windowsHide:true,timeout:10000});
  }
  // This exact directory was created above for generated media, never a user path.
  if(path.dirname(fs.realpathSync(mediaRoot))===fs.realpathSync(os.tmpdir())&&path.basename(mediaRoot).startsWith('rhfiles-startup-source-'))fs.rmSync(mediaRoot,{recursive:true});
}
console.log(JSON.stringify({measured:!failure,scenario,captureMode,renderer:receipt.renderer,firstPixelIntervalMs:receipt.firstPixelIntervalMs,firstStatsObservedMs:receipt.firstStatsObservedMs,reportedFirstFrameMs:receipt.reportedFirstFrameMs,openReplyMs:receipt.openReplyMs,mediaRequests:receipt.mediaRequests,artifactDir:receipt.artifactDir,error:receipt.error}));
if(failure)throw failure;
