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
import {observeOwnedIpc} from './cdp-ipc-timing.mjs';
let networkObserver;
assert.equal(process.env.RHFILES_NATIVE_PLAYER_QA,'1','Opt in to the owned native-output diagnostic');
const scenario=process.argv[2]||'h264-1080',format=startupScenarios[scenario];assert(format,'Unknown fixed startup scenario');
const captureMode=process.argv[3]||'poll';assert(['poll','after-stats'].includes(captureMode),'Use poll or after-stats pixel sampling');
const ipcMode=process.argv[4]||'default';assert(['default','postmessage'].includes(ipcMode),'Use default or isolated postmessage transport comparison');
const stateObserver=process.argv[5]||'main';assert(['main','player'].includes(stateObserver),'Observe through the main or actual player WebView');
const readback=process.env.RHFILES_QA_READBACK||'ipc';assert(['ipc','stdio'].includes(readback),'Use IPC or the owned debug-only stdin readback');
const emulateFocus=process.env.RHFILES_QA_EMULATE_FOCUS!=='0';
assert(['0','1',undefined].includes(process.env.RHFILES_QA_EMULATE_FOCUS),'Use an explicit focus comparison, not an arbitrary browser option');
const emulateLibraryFocus=process.env.RHFILES_QA_LIBRARY_EMULATE_FOCUS==='1';
assert(['0','1',undefined].includes(process.env.RHFILES_QA_LIBRARY_EMULATE_FOCUS),'Use an explicit library focus comparison');
const mediaRoot=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-startup-source-')),sourceFile=path.join(mediaRoot,'startup.mp4');
let app,fixture,library,player,opening,started;const receipt={scenario,source:format,captureMode,ipcMode,stateObserver,requestedDebugNetworkCacheMs:process.env.RHFILES_VLC_NETWORK_CACHE_MS??null,requestedDebugDecoderThreads:process.env.RHFILES_VLC_DECODE_THREADS??null,requestedNativeDebugLogging:!!process.env.RHFILES_VLC_DEBUG,measure:'new process/player, library already ready',traceClock:'host pipe receipt, not exact VLC producer time',samplePeriodMs:200,samples:[],mediaRequests:[]};let failure;
const action=(view,name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
const observer=()=>stateObserver==='player'?player:app;
const command=(name,args={})=>readback==='stdio'?app.diagnostic(name==='player.diagnosticFrame'?'player.frame':name,args):observer().evaluate((stateObserver==='player'?'window.__TAURI__.core.invoke':'call')+'("rhvideo_request",'+JSON.stringify({action:name,args})+')');
try{
  let source=format;
  if(process.env.RHFILES_STARTUP_MEDIA){
    const provided=path.resolve(process.env.RHFILES_STARTUP_MEDIA);
    const metadata=JSON.parse(execFileSync(process.env.FFPROBE||'ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,codec_name','-of','json',provided],{encoding:'utf8',windowsHide:true,timeout:10000})).streams?.[0];
    assert.equal(metadata?.width,format.width);assert.equal(metadata?.height,format.height);assert.equal(metadata?.codec_name,format.codec==='libx265'?'hevc':'h264');
    fs.copyFileSync(provided,sourceFile);receipt.sourceMode='reused byte-identical fixture';
  }else{source=generateStartupMedia(sourceFile,scenario);receipt.sourceMode='generated before timing';}
  const {width,height}=source;
  receipt.sourceSha256=createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
  app=await launchApp({emulateFocus,traceOutput:true,nativeDiagnostics:readback==='stdio'});receipt.readback=readback;receipt.mainFocusEmulation=emulateFocus;
  fixture=await rhvideoFixture({videoFile:sourceFile,videoCount:1,pictureCount:0,galleryVideoCount:1,galleryFrameCount:1,videoDuration:12,videoResolutions:[`${width}x${height}`],beforeMedia:({path:request,range})=>{if(started!==undefined&&request.endsWith('/play'))receipt.mediaRequests.push({atMs:performance.now()-started,range:range||null});}});
  await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
  const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return pages.find(p=>new URL(p.url).pathname.endsWith('/rhvideo.html'));},'library target');
  library=await cdpSession(target,30000);
  receipt.libraryFocusEmulation=emulateLibraryFocus;
  if(emulateLibraryFocus)await library.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await until(()=>library.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==="rhvideo.media.open")'),'library actions');
  if(ipcMode==='postmessage'){
    // Diagnostic only: reject one READ before fetch sends anything, allowing
    // Tauri's own existing fallback to select postMessage. Never fail a sent
    // request or replay a mutating action, and don't replace any handler.
    await library.evaluate(`(()=>{window.__startupOriginalFetch=window.fetch;window.__startupRejectedBeforeSend=0;window.fetch=function(input,init){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.hostname==='ipc.localhost'&&!window.__startupRejectedBeforeSend){window.__startupRejectedBeforeSend++;return Promise.reject(new TypeError('Owned pre-send transport comparison'));}return window.__startupOriginalFetch.call(this,input,init);};return true;})()`);
    await library.evaluate('window.__TAURI__.core.invoke("rhvideo_request",{action:"state",args:{}})');receipt.rejectedBeforeSend=await library.evaluate('(()=>{window.fetch=window.__startupOriginalFetch;return window.__startupRejectedBeforeSend;})()');assert.equal(receipt.rejectedBeforeSend,1,'Select the real framework fallback before any measured action');
  }
  await action(library,'category',{kind:'video'});await action(library,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});await action(library,'rotation.set',{enabled:false});
  await until(()=>library.evaluate("(()=>{const images=[...document.querySelectorAll('.cover-button img')];return images.length===1&&images.every(i=>i.complete&&i.naturalWidth>0);})()"),'one real initial cover finishes before timing');
  const served=await library.evaluate("fetch('js/rhvideo-workbench.js').then(r=>r.text())"),expected=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');assert.equal(createHash('sha256').update(served).digest('hex'),createHash('sha256').update(expected).digest('hex'),'Measure the actual current embedded frontend');
  await library.evaluate(`(()=>{
    const original=window.fetch;window.__startupIPC=[];window.__startupLongTasks=[];
    window.fetch=function(input,init){
      let timed=false;try{const url=new URL(typeof input==='string'?input:input.url,location.href);timed=url.hostname==='ipc.localhost'&&JSON.parse(init?.body||'{}').action==='play';}catch{}
      if(!timed)return original.call(this,input,init);
      const started=performance.now(),row={startMs:started-window.__startupActionAt};window.__startupIPC.push(row);
      return original.call(this,input,init).then(response=>{
        row.headersMs=performance.now()-started;const json=response.json.bind(response);
        response.json=()=>json().then(value=>{row.bodyMs=performance.now()-started;return value;});return response;
      });
    };
    new PerformanceObserver(list=>{for(const item of list.getEntries())if(window.__startupLongTasks.length<64)window.__startupLongTasks.push({at:item.startTime,duration:item.duration});}).observe({type:'longtask',buffered:false});return true;
  })()`);
  assert.equal(await app.evaluate('typeof window.__TAURI__.window.Window.getByLabel'), 'function','Use actual window visibility, not a hidden/offscreen readback alone');
  receipt.artifactDir=app.artifactDir;receipt.executable=process.env.RHFILES_TEST_EXECUTABLE||path.resolve('target/debug/rhfiles.exe');receipt.executableSha256=createHash('sha256').update(fs.readFileSync(receipt.executable)).digest('hex');
  if(process.env.RHFILES_QA_NETWORK_TIMING==='1')networkObserver=await observeOwnedIpc(target,app.port);
  started=performance.now();const requestStart=fixture.requests.length;let openError;
  // Separate the page's own action latency from delivery of its CDP reply to
  // this observer. An unfocused view / debugger transport may delay the latter;
  // it must not be reported as time spent inside the UI operation itself.
  const expression='(async()=>{const started=window.__startupActionAt=performance.now();const value=await RHFilesAPI.invoke("rhvideo.media.open",{kind:"video",id:"video-0"});return {value,frontendReplyMs:performance.now()-started};})()';
  opening=library.evaluate(expression).then(measured=>{receipt.openReplyMs=performance.now()-started;receipt.frontendReplyMs=measured.frontendReplyMs;receipt.observerDeliveryOverheadMs=Math.max(0,receipt.openReplyMs-measured.frontendReplyMs);return measured.value;},error=>{openError=error;return null;});
  if(readback==='stdio'){receipt.observerReadyMs=0;receipt.observerState={transport:'owned-native-stdio',readyBeforeTiming:true};}
  if(stateObserver==='player'&&readback!=='stdio'){
    // Do not focus/emulate/activate this view: observe the window selected by
    // the real open workflow. This separates an occluded observer's response
    // latency from the decoder's actual pixel availability.
    const target=await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${app.port}/json/list`,{signal:AbortSignal.timeout(1000)})).json();return pages.find(p=>new URL(p.url).pathname==='/rhvideo-player.html');},'actual player observer',10000);
    player=await cdpSession(target,10000);
    await until(()=>player.evaluate('!!window.__TAURI__?.core?.invoke'),'player native bridge',5000);
    receipt.observerReadyMs=performance.now()-started;
    receipt.observerState=await player.evaluate('({focused:document.hasFocus(),visible:document.visibilityState})');
  }
  let lastMissingMs=0,lastState;
  while(performance.now()-started<15000){
    if(openError)throw openError;
    const state=await command('player.state');lastState=state;
    if(state.opened){
      if(process.env.RHFILES_EXPECT_RENDERER)assert.equal(state.renderer,process.env.RHFILES_EXPECT_RENDERER,'Confirm the renderer actually selected');
      receipt.renderer=state.renderer;
      receipt.engine=state.engine;receipt.engineVersion=state.engineVersion;receipt.pluginIndexMode=state.pluginIndexMode;
      if(process.env.RHFILES_EXPECT_ENGINE_VERSION)assert.equal(state.engineVersion?.split(' ')[0],process.env.RHFILES_EXPECT_ENGINE_VERSION,'Compare the intended runtime, not a machine-wide fallback');
      const windowState=readback==='stdio'?await app.diagnostic('player.window'):await observer().evaluate("window.__TAURI__.window.Window.getByLabel('window-rhvideo-player').then(async w=>w?{visible:await w.isVisible(),minimized:await w.isMinimized()}:null)");
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
  receipt.frontendTransport=await library.evaluate(`({ipc:window.__startupIPC,longTasks:window.__startupLongTasks.map(row=>({atMs:row.at-window.__startupActionAt,durationMs:row.duration})),resources:performance.getEntriesByType('resource').filter(row=>{try{const url=new URL(row.name);return url.hostname==='ipc.localhost'&&url.pathname==='/rhvideo_request'&&row.startTime>=window.__startupActionAt;}catch{return false;}}).slice(0,64).map(row=>({startMs:row.startTime-window.__startupActionAt,durationMs:row.duration,requestStartMs:row.requestStart?row.requestStart-window.__startupActionAt:null,responseStartMs:row.responseStart?row.responseStart-window.__startupActionAt:null,responseEndMs:row.responseEnd-window.__startupActionAt,transferSize:row.transferSize,encodedBodySize:row.encodedBodySize,decodedBodySize:row.decodedBodySize}))})`);
  receipt.finalState=lastState;receipt.nonStreamRequests=fixture.requests.slice(requestStart).filter(r=>!r.path.endsWith('/play')).map(r=>r.path);
  if(networkObserver)receipt.browserIpc=networkObserver.snapshot();
  if(process.env.RHFILES_VLC_NATIVE_TRACE==='1'||process.env.RHFILES_PLAY_NATIVE_TRACE==='1'){
    assert.equal(readback,'stdio','Producer trace stays on the owned debug-only readback');
    receipt.producerTrace=await app.diagnostic('player.trace',{expectedInput:lastState.inputId});
    assert.equal(receipt.producerTrace.inputId,lastState.inputId);
    assert(receipt.producerTrace.hostStages.length>0,'Real host startup stages must reach the bounded trace');
    if(process.env.RHFILES_VLC_NATIVE_TRACE==='1'){
      assert.equal(receipt.producerTrace.vlc.clock,'producer-monotonic');
      assert(receipt.producerTrace.vlc.events.length>0,'Real libVLC startup events must reach the bounded callback');
    }
  }
  assert(receipt.firstPixelIntervalMs,'No four-marker native frame appeared inside the bounded observation');assert(receipt.firstStatsObservedMs,'No native display statistic appeared inside the bounded observation');
  assert(receipt.mediaRequests.length>0,'The measured input really reached the owned upstream');
  if(process.env.RHFILES_QA_TRACE_LIFECYCLE==='1'){
    assert.equal(readback,'stdio');assert.equal(process.env.RHFILES_VLC_NATIVE_TRACE,'1');
    const before=lastState.inputId;
    await action(library,'media.open',{kind:'video',id:'video-0'});
    const replacement=await until(async()=>{const value=await command('player.state');return value.opened&&value.inputId!==before&&value.renderedFrames>0?value:null;},'replacement native input actually renders',15000);
    await assert.rejects(app.diagnostic('player.trace',{expectedInput:before}),/播放输入已改变/);
    const trace=await app.diagnostic('player.trace',{expectedInput:replacement.inputId});
    assert.equal(trace.vlc.inputId,replacement.inputId);assert(trace.vlc.events.length>0);
    receipt.traceLifecycle={oldInput:before,newInput:replacement.inputId,oldReadRejected:true,newEvents:trace.vlc.events.length};
  }
  // Exercise log_unset's in-flight callback barrier through the real public
  // close path, rather than validating only process termination by taskkill.
  await app.evaluate('call("rhvideo_request",{action:"player.close",args:{}})');
  assert.equal((await app.evaluate('call("rhvideo_request",{action:"player.state",args:{}})')).opened,false);
  receipt.nativeClosedBeforeProcessExit=true;
}catch(error){failure=error;receipt.error=String(error?.stack||error);}
finally{
  networkObserver?.close();
  player?.close();library?.close();if(app){app.close();let timer;try{await Promise.race([app.closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned process output did not drain')),5000);})]);}catch(error){failure??=error;receipt.cleanupError=String(error);}finally{clearTimeout(timer);}}await fixture?.close();
  if(app){
    if(started!==undefined)receipt.nativeTrace=app.outputEvents.filter(event=>event.at>=started).map(({at,stream,text})=>({atMs:at-started,stream,text}));
    const log=fs.readFileSync(path.join(app.artifactDir,'app.log'),'utf8');receipt.hardwareLog=log.split(/\r?\n/).filter(line=>/hardware decoding|using.*D3D11VA|using video output|using hw|using vout display|frame thread mode|Direct3D11 Open/i.test(line)).slice(0,12);
    receipt.startupStages=[...log.matchAll(/RHFILES_VLC_STAGE ([a-z-]+) (\d+)/g)].map(([,stage,elapsedMs])=>({stage,elapsedMs:Number(elapsedMs)}));
    receipt.openStages=[...log.matchAll(/RHFILES_PLAY_STAGE ([a-z-]+) (\d+)/g)].map(([,stage,elapsedMs])=>({stage,elapsedMs:Number(elapsedMs)}));
    receipt.requestStages=[...log.matchAll(/RHFILES_REQUEST_STAGE ([a-z.-]+) ([a-z-]+) (\d+)/g)].map(([,action,stage,elapsedMs])=>({action,stage,elapsedMs:Number(elapsedMs)}));
    receipt.stateStages=[...log.matchAll(/RHFILES_STATE_STAGE (\d+) (\d+) ([a-z-]+) (\d+)/g)].slice(0,2048).map(([,input,probe,stage,elapsedMs])=>({input:Number(input),probe:Number(probe),stage,elapsedMs:Number(elapsedMs)}));
    receipt.audioOutputInitializations=(log.match(/main generic debug: creating audio output/g)||[]).length;
    fs.writeFileSync(path.join(app.artifactDir,'startup-measurement.json'),JSON.stringify(receipt,null,2));
    const bitmap=path.join(app.artifactDir,'first-visible.bmp');if(fs.existsSync(bitmap))execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-i',bitmap,'-frames:v','1',path.join(app.artifactDir,'first-visible.png')],{windowsHide:true,timeout:10000});
  }
  // This exact directory was created above for generated media, never a user path.
  if(path.dirname(fs.realpathSync(mediaRoot))===fs.realpathSync(os.tmpdir())&&path.basename(mediaRoot).startsWith('rhfiles-startup-source-'))fs.rmSync(mediaRoot,{recursive:true});
}
console.log(JSON.stringify({measured:!failure,scenario,captureMode,ipcMode,stateObserver,readback,requestedDebugNetworkCacheMs:receipt.requestedDebugNetworkCacheMs,requestedDebugDecoderThreads:receipt.requestedDebugDecoderThreads,requestedNativeDebugLogging:receipt.requestedNativeDebugLogging,observerReadyMs:receipt.observerReadyMs,observerState:receipt.observerState,rejectedBeforeSend:receipt.rejectedBeforeSend,renderer:receipt.renderer,engine:receipt.engine,engineVersion:receipt.engineVersion,pluginIndexMode:receipt.pluginIndexMode,firstPixelIntervalMs:receipt.firstPixelIntervalMs,firstStatsObservedMs:receipt.firstStatsObservedMs,reportedFirstFrameMs:receipt.reportedFirstFrameMs,openReplyMs:receipt.openReplyMs,frontendReplyMs:receipt.frontendReplyMs,observerDeliveryOverheadMs:receipt.observerDeliveryOverheadMs,frontendTransport:receipt.frontendTransport,mediaRequests:receipt.mediaRequests,artifactDir:receipt.artifactDir,error:receipt.error}));
if(failure)throw failure;
