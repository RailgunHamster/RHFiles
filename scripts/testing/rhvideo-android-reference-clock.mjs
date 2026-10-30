// Actual reference-page control in an owned Android WebView, never an RHFiles
// playback fallback or a claim that the native app's acceptance has passed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root} from './source.mjs';
import {admitLocalClockDevice} from './rhvideo-local-clock.mjs';
import {androidSession,until,pause} from './android-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from './rhvideo-fixture.mjs';
import {referenceFingerprint} from './rhvideo-windows.mjs';

export function verifyReferenceClock(before,after,elapsedMs){
  assert.equal(before.length,3);assert.equal(after.length,3);
  assert(elapsedMs>=5000&&elapsedMs<10000,'Use an uninterrupted five-second observation');
  const ids=new Set();
  return after.map((value,index)=>{
    const previous=before[index];assert.equal(typeof value.id,'string');assert(value.id);assert(Number.isSafeInteger(value.input)&&value.input>0);assert(!ids.has(value.id));ids.add(value.id);
    assert.equal(value.id,previous.id);assert.equal(value.input,previous.input,'Do not count replacement video elements as continuous playback');
    for(const state of [previous,value]){
      assert.equal(state.paused,false);assert.equal(state.muted,false);assert.equal(state.ended,false);assert.equal(state.error,null);assert.equal(state.rate,1);assert.equal(state.volume,.2);
      assert.equal(state.width,360);assert.equal(state.height,640);assert.equal(state.durationMs,20000);assert(state.readyState>=2);assert(state.frames>1);assert(state.positionMs>250);
    }
    const result={id:value.id,input:value.input,positionDeltaMs:value.positionMs-previous.positionMs,frameDelta:value.frames-previous.frames,presentedDeltaMs:value.presentedMs-previous.presentedMs};
    assert(result.positionDeltaMs>=4000&&result.frameDelta>=60&&result.presentedDeltaMs>=4000,'Reference playback did not sustain the native gate: '+JSON.stringify(result));return result;
  });
}
async function main(){
  const [serial,apk]=process.argv.slice(2);assert(/^emulator-\d+$/.test(serial||''),'Only an explicit owned emulator serial is accepted');assert(apk,'Provide the exact already-installed QA APK');
  const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk'),adb=path.join(sdk,'platform-tools/adb.exe');
  const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:2*1024*1024});
  admitLocalClockDevice(serial,run(['shell','getprop','ro.kernel.qemu']),run(['emu','avd','name']));
  assert.equal(run(['shell','getprop','sys.boot_completed']).trim(),'1');assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/,'Do not run through system/app error dialogs');
  const actualApk=fs.realpathSync(apk),relative=path.relative(path.join(root,'test-artifacts'),actualApk),sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert(relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&path.extname(actualApk)==='.apk','Use an APK snapshot inside this worktree');
  const installed=run(['shell','pm','path','com.railgunhamster.rhfiles']).trim().split(/\r?\n/);assert.equal(installed.length,1);assert.match(installed[0],/^package:\/data\/app\/[A-Za-z0-9_~+=./-]+\/base\.apk$/);
  const apkSha256=sha(actualApk);assert.equal(run(['shell','sha256sum',installed[0].slice(8)]).slice(0,64),apkSha256);
  for(const name of ['com.railgunhamster.rhfiles','stagefright']){try{assert.equal(run(['shell','pidof',name]).trim(),'','Existing playback invalidates an independent reference control');}catch(error){if(error.status!==1)throw error;}}
  const reference=fs.realpathSync(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo')),inventory=JSON.parse(fs.readFileSync(path.join(root,'scripts/testing/rhvideo-control-map.json'),'utf8')).modules.map(row=>row.file),files=referenceFingerprint(reference,inventory);
  const artifact=fs.mkdtempSync(path.join(root,'test-artifacts/rhvideo-android-reference-clock-')),media=path.join(artifact,'portrait.mp4');
  const receipt={diagnosticOnly:true,scope:'Actual reference HTML/WebView renderer; not native RHFiles acceptance or physical speaker output',serial,apkSha256,referenceFiles:files,artifact,phase:'admitted'};let app,page,fixture,port;
  console.log('Actual Android reference clock: '+artifact);
  try{
    receipt.phase='source-generation';
    execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size=360x640:rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-t','20','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',media],{windowsHide:true,timeout:30000});
    receipt.mediaSha256=sha(media);assert.equal(receipt.mediaSha256,'98c8699ed412be73efb519aa2c8388d56e68c71b5c8edd014fa17d8cd32c24bc');
    fixture=await rhvideoFixture({referenceStatic:path.join(reference,'static'),videoFile:media,videoCount:3,pictureCount:0,galleryVideoCount:3,galleryFrameCount:1,videoDuration:20,videoResolutions:['360x640','360x640','360x640']});
    receipt.phase='app-start';process.env.ANDROID_SDK_ROOT=sdk;app=await androidSession(serial);receipt.sessionArtifact=app.artifactDir;
    const pid=run(['shell','pidof','com.railgunhamster.rhfiles']).trim();assert.match(pid,/^\d+$/);receipt.pid=Number(pid);
    port=run(['forward','tcp:0','localabstract:webview_devtools_remote_'+pid]).trim();assert.match(port,/^\d+$/);
    const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(3000)})).json(),pages=targets.filter(target=>target.type==='page'&&/^https?:\/\/tauri\.localhost\//.test(target.url));assert.equal(pages.length,1,'Select only the owned fresh main WebView');
    page=await cdpSession(pages[0],20000);await page.send('Network.enable');await page.send('Network.setExtraHTTPHeaders',{headers:{Authorization:'Bearer fixture-bearer-do-not-persist'}});
    receipt.phase='reference-navigation';const server='http://10.0.2.2:'+new URL(fixture.url).port;await page.send('Page.navigate',{url:server});
    await until(()=>page.evaluate("typeof startGridPlay==='function'&&typeof RHSearch!=='undefined'"),'actual Android reference scripts',30000);
    receipt.phase='catalog';await page.evaluate("(async()=>{const value=await(await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'preview',password:'fixture-only'})})).json();token=value.access_token;document.getElementById('app').classList.remove('hidden');document.getElementById('login-section').classList.add('hidden');await loadVideos();await filterVideos();await loadGrid();setPageVolume(.2);return true;})()");
    receipt.loaded=await page.evaluate('({videos:allVideos.length,grid:gridMedia.length,volume:pageVolume,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},visible:document.visibilityState})');assert.equal(receipt.loaded.videos,3);assert.equal(receipt.loaded.visible,'visible');
    // Observe, never replace the reference's grouping/play/codec implementation.
    await page.evaluate(`(()=>{window.__qaReferenceClock={next:0,inputs:new WeakMap()};const qa=window.__qaReferenceClock;qa.watch=()=>{for(const video of document.querySelectorAll('#grid-content video')){if(qa.inputs.has(video))continue;const state={input:++qa.next,frames:0,presentedMs:0};qa.inputs.set(video,state);const frame=(_,metadata)=>{state.frames++;state.presentedMs=Math.round(metadata.mediaTime*1000);if(video.isConnected)video.requestVideoFrameCallback(frame);};video.requestVideoFrameCallback(frame);}};qa.observer=new MutationObserver(qa.watch);qa.observer.observe(document.getElementById('grid-content'),{childList:true,subtree:true});qa.snapshot=()=>[...document.querySelectorAll('#grid-content video')].map(video=>{const state=qa.inputs.get(video)||{};return {id:video.closest('[data-video-id]').dataset.videoId,input:state.input,frames:state.frames||0,presentedMs:state.presentedMs||0,positionMs:Math.round(video.currentTime*1000),durationMs:Math.round(video.duration*1000),paused:video.paused,ended:video.ended,muted:video.muted,volume:video.volume,rate:video.playbackRate,readyState:video.readyState,width:video.videoWidth,height:video.videoHeight,error:video.error?{code:video.error.code,message:video.error.message}:null};});return true;})()`);
    receipt.phase='grid-start';const started=performance.now();await page.send('Runtime.evaluate',{expression:'startGridPlay();true',userGesture:true,awaitPromise:true,returnByValue:true});
    receipt.before=await until(async()=>{const values=await page.evaluate('__qaReferenceClock.snapshot()');receipt.last=values;return values.length===3&&values.every(value=>!value.paused&&value.readyState>=2&&value.frames>1&&value.positionMs>250)?values:null;},'three actual reference A/V elements ready',30000);receipt.readyHostMs=performance.now()-started;
    // No state polling, clock manipulation or pause/seek/play calls in this interval.
    receipt.phase='continuity';const clock=performance.now();await pause(5000);receipt.after=await page.evaluate('__qaReferenceClock.snapshot()');receipt.elapsedMs=performance.now()-clock;
    receipt.continuity=verifyReferenceClock(receipt.before,receipt.after,receipt.elapsedMs);receipt.passed=true;receipt.phase='passed';
  }catch(error){receipt.failure=String(error);process.exitCode=1;console.error(error);}
  finally{
    if(page)try{receipt.last=await page.evaluate('window.__qaReferenceClock?.snapshot()||null');}catch(error){receipt.lastReadError=String(error.code||'unavailable');}
    if(app)try{await app.screenshot('reference-grid-clock');}catch(error){receipt.screenshotError=String(error.code||'unavailable');}
    // Capture the current PID/track evidence before closing its media or app.
    for(const [name,args]of [['native-logcat.log',['logcat','-d','-v','threadtime','-t','1800']],['audio-flinger.log',['shell','dumpsys','media.audio_flinger']]])try{fs.writeFileSync(path.join(artifact,name),run(args));}catch(error){receipt[name]={error:String(error.code||'unavailable')};}
    if(page)try{await page.evaluate('window.__qaReferenceClock?.observer.disconnect();closeGridViewer(null);true');}catch{}
    page?.close();try{app?.close();}catch(error){receipt.sessionCloseError=String(error.code||'unavailable');}
    if(port)try{run(['forward','--remove','tcp:'+port]);}catch{}
    try{run(['shell','am','force-stop','com.railgunhamster.rhfiles']);}catch(error){receipt.teardownError=String(error.code||'unavailable');}
    if(fixture){receipt.transport=fixture.transport.snapshot();receipt.streamReads=fixture.requests.filter(value=>value.path.endsWith('/play')).length;receipt.unexpectedWrites=fixture.requests.filter(value=>value.method!=='GET'&&!(value.method==='POST'&&value.path==='/api/v1/auth/login')).map(value=>({method:value.method,path:value.path}));await fixture.close();}
    try{if(JSON.stringify(referenceFingerprint(reference,inventory))!==JSON.stringify(files))throw Error('Reference changed during the control');}catch(error){receipt.referenceChanged=String(error);receipt.passed=false;process.exitCode=1;}
    if(receipt.unexpectedWrites?.length){receipt.passed=false;process.exitCode=1;}
    fs.writeFileSync(path.join(artifact,'receipt.json'),JSON.stringify(receipt,null,2));
  }
  if(receipt.passed&&process.exitCode!==1)console.log('PASS: reference WebView control only '+JSON.stringify(receipt.continuity));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
