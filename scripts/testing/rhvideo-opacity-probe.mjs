// Fixed fresh-process visibility diagnostic. Not a default rendering mode,
// product change, playback-quality acceptance, or retry-until-green runner.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {root} from './source.mjs';import {launchApp,until,sleep} from './app-session.mjs';import {cdpSession} from '../rhfiles-api.mjs';import {rhvideoFixture} from './rhvideo-fixture.mjs';import {clockFormat,generateClockMedia,decodeFrameIdentity} from './native-media-clock.mjs';import {markerPixels} from './native-startup-pixels.mjs';

export const opacityCases=Object.freeze(['control-read','early-reveal','early-reveal','control-read']);
export function visibleSourceInterval(rows){
 let lastMissing=0,previous=-1;
 for(const row of rows){assert(Number.isFinite(row.startedMs)&&Number.isFinite(row.finishedMs)&&row.startedMs>=previous&&row.finishedMs>=row.startedMs,'Invalid observation timing');previous=row.finishedMs;
  if(row.ambiguous)continue;
  if(row.absent){lastMissing=row.startedMs;continue;}
  if(row.error)throw Error('Unclassified observation failure: '+row.error);
  assert(Number.isInteger(row.alpha)&&row.alpha>=0&&row.alpha<=255,'Invalid native alpha');
  if(row.alpha===255&&row.markers?.visible&&row.identity){assert(Number.isSafeInteger(row.identity.frame)&&row.identity.frame>=0&&Number.isFinite(row.identity.sourceMs));return {lowerMs:lastMissing,upperMs:row.finishedMs,sourceFrame:row.identity.frame,sourceMs:row.identity.sourceMs};}
  if(row.alpha!==255||!row.markers?.visible)lastMissing=row.startedMs;
 }
 return null;
}

async function main(){
 assert.equal(process.platform,'win32');assert.equal(process.env.RHFILES_NATIVE_PLAYER_QA,'1');assert(process.env.RHFILES_TEST_EXECUTABLE?.includes('test-artifacts'));
 for(const key of ['RHFILES_VLC_DEBUG','RHFILES_PLAY_NATIVE_TRACE','RHFILES_VLC_NATIVE_TRACE','RHFILES_VLC_COMPATIBILITY','RHFILES_VLC_NETWORK_CACHE_MS','RHFILES_VLC_DECODE_THREADS','RHFILES_QA_READBACK'])assert(!process.env[key],'No mixed experiment '+key);
 const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),directory=fs.mkdtempSync(path.join(root,'test-artifacts/rhvideo-opacity-')),media=path.join(directory,'generated.mp4'),generator=path.resolve(process.env.FFMPEG||'');assert.equal(fs.realpathSync(generator).toLowerCase(),fs.realpathSync(path.join(root,'src-tauri/thirdparty/ffmpeg.exe')).toLowerCase());
 const report={diagnosticOnly:true,physicalScreenTiming:false,performanceAccepted:false,observed:false,order:opacityCases,measure:'first complete coded source frame recovered from owned native client with alpha255; not physical display or speaker output',policy:{deadlineMs:15000,sampleRestMs:100,source:clockFormat,intervention:'one ordinary read versus one existing bounds opacity1 call, only before reported frames; never hide a ready control frame',noExtraPlayerStatePollingDuringCapture:true,noFocusEmulation:true},cases:[],exeSha256:sha(process.env.RHFILES_TEST_EXECUTABLE),generator:{path:generator,sha256:sha(generator),version:execFileSync(generator,['-version'],{encoding:'utf8',windowsHide:true,timeout:10000}).split(/\r?\n/,1)[0]},created:new Date().toISOString()};
 fs.writeFileSync(path.join(directory,'plan.json'),JSON.stringify(report,null,2));
 try{
  generateClockMedia(media);report.sourceSha256=sha(media);
  const raw=execFileSync(generator,['-hide_banner','-loglevel','error','-threads','2','-i',media,'-vf',"select='eq(n,0)+eq(n,257)+eq(n,479)',scale=960:540",'-fps_mode','passthrough','-pix_fmt','bgra','-f','rawvideo','pipe:1'],{windowsHide:true,timeout:30000,maxBuffer:8*1024*1024}),length=960*540*4;assert.equal(raw.length,3*length);report.calibration=[];
  for(const [index,expected]of [0,257,479].entries()){const bytes=Buffer.alloc(54+length);bytes.write('BM');bytes.writeUInt32LE(bytes.length,2);bytes.writeUInt32LE(54,10);bytes.writeUInt32LE(40,14);bytes.writeInt32LE(960,18);bytes.writeInt32LE(-540,22);bytes.writeUInt16LE(1,26);bytes.writeUInt16LE(32,28);raw.copy(bytes,54,index*length,(index+1)*length);const value=decodeFrameIdentity(bytes);assert.equal(value.frame,expected);report.calibration.push(value);}
  for(const [index,mode]of opacityCases.entries()){
   const receipt={index,mode,passed:false,samples:[]};report.cases.push(receipt);let app,fixture,page,opening,openError,start;
   try{
    app=await launchApp();receipt.artifact=app.artifactDir;fixture=await rhvideoFixture({videoFile:media,videoCount:1,pictureCount:0,galleryVideoCount:0,galleryFrameCount:0,videoDuration:20,videoResolutions:['1920x1080']});
    await app.evaluate('RHFilesAPI.invoke("rhvideo.open")');const target=await until(async()=>(await(await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()).find(row=>new URL(row.url).pathname==='/rhvideo.html'),'owned opacity library');page=await cdpSession(target,30000);await until(()=>page.evaluate('!!globalThis.RHFilesAPI?.list().some(row=>row.id==="rhvideo.media.open")'),'ordinary opacity actions');
    const api=(name,args={})=>page.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
    receipt.servedAssets={};for(const file of ['rhvideo-player-host.js','rhvideo-player-controls.js','rhvideo-playback-phase.js']){const served=await page.evaluate('fetch('+JSON.stringify('js/'+file)+').then(row=>row.text())'),hash=createHash('sha256').update(served).digest('hex');assert.equal(hash,sha(path.join(root,'src/js',file)),'Executable embedded asset differs from admitted source: '+file);receipt.servedAssets[file]=hash;}
    await api('connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await api('category',{kind:'video'});await api('rotation.set',{enabled:false});await until(()=>page.evaluate('(()=>{const rows=[...document.querySelectorAll(".cover-button img")];return rows.length===1&&rows.every(row=>row.complete&&row.naturalWidth>0);})()'),'cover ready outside measurement');assert.equal((await api('player.hostState')).opened,false);
    receipt.focusBefore=await app.nativeWindows.windows();assert(receipt.focusBefore.some(row=>row.label==='window-rhvideo'&&row.foreground&&row.inputFocus),'Keep natural library focus');
    start=performance.now();opening=api('media.open',{kind:'video',id:'video-0'}).then(async value=>{
     receipt.replyMs=performance.now()-start;receipt.open=value;assert(value.opened&&value.host?.kind==='library'&&value.renderer==='native-hardware-auto');receipt.interventionBeforeReportedFrames=value.renderedFrames===0&&!value.restoringPausedFrame;
     if(!receipt.interventionBeforeReportedFrames){receipt.notApplicable='The first frame was already reported before intervention';return;}
     const region=await page.evaluate('(()=>{const r=document.querySelector(".rhvideo-native-stage").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,dpr:devicePixelRatio};})()');receipt.region=region;receipt.interventionStartedMs=performance.now()-start;
     receipt.intervention=await page.evaluate('__TAURI__.core.invoke("rhvideo_request",'+JSON.stringify({action:mode==='control-read'?'player.hostContext':'player.bounds',args:mode==='control-read'?{}:{_hostLease:value.host.lease,expectedInput:value.inputId,x:region.x,y:region.y,width:region.width,height:region.height,visible:true,opacity:1}})+')');receipt.interventionFinishedMs=performance.now()-start;
    }).catch(error=>{openError=error;});
    while(performance.now()-start<report.policy.deadlineMs){
     if(openError)throw openError;const row={startedMs:performance.now()-start};receipt.samples.push(row);
     try{const picture=await app.readLibraryPlayerFrame();row.alpha=picture.alpha;row.width=picture.width;row.height=picture.height;const bytes=fs.readFileSync(picture.path);row.markers=markerPixels(bytes,1920,1080);
      if(row.markers.visible)try{row.identity=decodeFrameIdentity(bytes);if(!receipt.latent){receipt.latent={alpha:row.alpha,source:row.identity,startedMs:row.startedMs};fs.copyFileSync(picture.path,path.join(directory,'case-'+index+'-first-coded.bmp'));}}catch(error){row.ambiguous=true;row.error=String(error?.message||error);}
      row.finishedMs=performance.now()-start;const visible=visibleSourceInterval(receipt.samples);if(visible){receipt.firstVisible=visible;fs.copyFileSync(picture.path,path.join(directory,'case-'+index+'-visible.bmp'));break;}
     }catch(error){row.finishedMs=performance.now()-start;row.error=String(error?.message||error);if(row.error.includes('No visible owned player surface is present'))row.absent=true;else if(row.error.includes('Owned presentation opacity changed during capture'))row.ambiguous=true;else throw error;}
     await sleep(report.policy.sampleRestMs);
    }
    await opening;if(openError)throw openError;assert(receipt.interventionBeforeReportedFrames,receipt.notApplicable);assert(receipt.firstVisible,'No complete visible coded source frame within the fixed budget');
    receipt.after=await api('player.state');assert.equal(receipt.after.inputId,receipt.open.inputId);assert.equal(receipt.after.host.lease,receipt.open.host.lease);assert.equal(receipt.after.renderer,'native-hardware-auto');assert.equal(receipt.after.decoderRate,1);assert(receipt.after.decoderVolume>0&&!receipt.after.muted&&receipt.after.decodedAudioBlocks>0);assert.equal(receipt.after.rotation,0);
    receipt.focusAfter=await app.nativeWindows.windows();assert(receipt.focusAfter.some(row=>row.label==='window-rhvideo'&&row.foreground&&row.inputFocus));receipt.passed=true;
   }catch(error){receipt.failure=String(error?.stack||error);}
   finally{if(opening)await opening;page?.close();if(app)await app.close();if(fixture){receipt.transport=fixture.transport.snapshot();await fixture.close();}fs.writeFileSync(path.join(directory,'case-'+index+'.json'),JSON.stringify(receipt,null,2));}
  }
  assert.equal(sha(media),report.sourceSha256);assert.equal(sha(generator),report.generator.sha256);assert.equal(sha(process.env.RHFILES_TEST_EXECUTABLE),report.exeSha256);report.inputsUnchanged=true;assert(report.cases.every(row=>row.passed),'Every predeclared case must remain present and complete');report.observed=true;
 }catch(error){report.failure=String(error?.stack||error);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(report,null,2));console.log('Opacity source-pixel diagnostic: '+directory);console.log(JSON.stringify({observed:report.observed,performanceAccepted:false,cases:report.cases.map(row=>({index:row.index,mode:row.mode,passed:row.passed,replyMs:row.replyMs,firstVisible:row.firstVisible,latent:row.latent,failure:row.failure})),failure:report.failure}));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
