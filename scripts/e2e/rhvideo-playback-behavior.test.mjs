// Behavioral acceptance, alongside the differential oracle that executes the
// reference functions. These tests inspect real native frames/server writes,
// not only API enumeration. All media/profiles are generated and disposable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFileSync,spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {launchApp,until,sleep} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
import {listenBrowserLoopback} from '../testing/browser-loopback.mjs';
const native={skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1'};
const {grid:Grid}=createRequire(import.meta.url)('../../src/js/rhvideo-model.js');
const invoke=(view,name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
const command=(app,action,args={})=>app.evaluate('call("rhvideo_request",'+JSON.stringify({action,args})+')');
async function withSuspendedControls(view,work){
  // VirtualTimePolicy.advance fast-forwards delayed work; it does not restore
  // the real clock. Use reversible page suspension for native-background tests.
  await view.evaluate('window.__rhFreezeProbe={ticks:0};window.__rhFreezeProbe.timer=setInterval(()=>window.__rhFreezeProbe.ticks++,50);true');
  await until(()=>view.evaluate('window.__rhFreezeProbe.ticks>0'),'controls probe is actually ticking');
  const before=await view.evaluate('window.__rhFreezeProbe.ticks');
  await view.send('Page.setWebLifecycleState',{state:'frozen'});
  let result;
  try{result=await work();}finally{await view.send('Page.setWebLifecycleState',{state:'active'});}
  const after=await view.evaluate('window.__rhFreezeProbe.ticks');
  assert(after-before<=2,'controls timers must remain suspended during native-only work');
  const started=performance.now(),resumed=await until(async()=>{const ticks=await view.evaluate('window.__rhFreezeProbe.ticks');return ticks>after?ticks:null;},'controls timers resume after activation',5000);
  const wallMs=performance.now()-started;
  assert(resumed-after<=wallMs/50+6,'resume must not put controls into an accelerated synthetic clock');
  console.log(JSON.stringify({controlsClock:{before,after,resumed,wallMs}}));
  await view.evaluate('clearInterval(window.__rhFreezeProbe.timer);delete window.__rhFreezeProbe;true');
  return result;
}
async function target(app,file){
  const found=await until(async()=>{const all=await(await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();return all.find(t=>new URL(t.url).pathname.endsWith('/'+file));},file+' window');
  const view=await cdpSession(found,30000);
  const action=file==='rhvideo-player.html'?'rhvideo.player.state':file==='rhvideo-grid.html'?'rhvideo.grid.state':'rhvideo.playlist.sequential';
  await until(()=>view.evaluate('!!globalThis.RHFilesAPI?.list().some(a=>a.id==='+JSON.stringify(action)+')'),'behavior APIs ready');
  const codes={'rhvideo.html':['rhvideo-model.js','rhvideo-workbench.js'],'rhvideo-player.html':['rhvideo-player.js'],'rhvideo-grid.html':['rhvideo-grid.js']}[file]||[];
  for(const code of codes){const served=await view.evaluate('fetch('+JSON.stringify('js/'+code)+').then(r=>r.text())'),source=fs.readFileSync(new URL('../../src/js/'+code,import.meta.url),'utf8'),hash=value=>createHash('sha256').update(value).digest('hex');assert.equal(hash(served),hash(source),'behavior tests must run the current '+code);}
  if(file==='rhvideo-player.html'&&process.env.RHFILES_EXPECT_RENDERER){const actual=await invoke(view,'player.state');assert.equal(actual.renderer,process.env.RHFILES_EXPECT_RENDERER,'verify the actual renderer, not only the requested environment');}
  return view;
}
async function setup(options={}){
  const app=await launchApp({emulateFocus:true});let fixture,view;
  try{
    const {portraitIndices=[],picturesOnly=false,rotationMarkers=false,primaryGallery=false,videoMetadataDuration,...fixtureOptions}=options,duration=options.videoDuration??14,file=path.join(app.directory,'behavior.mp4');
    const make=(file,size)=>execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size='+size+':rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000',...(rotationMarkers?['-vf','drawbox=x=20:y=20:w=60:h=60:color=0xff0000:t=fill,drawbox=x=iw-80:y=20:w=60:h=60:color=0x00ff00:t=fill,drawbox=x=20:y=ih-80:w=60:h=60:color=0x0000ff:t=fill,drawbox=x=iw-80:y=ih-80:w=60:h=60:color=0xffff00:t=fill']:[]),'-t',String(duration),'-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
    if(!picturesOnly)make(file,'640x360');
    const portrait=path.join(app.directory,'portrait.mp4');
    if(portraitIndices.length)make(portrait,'360x640');
    const orientation=portraitIndices.length?{videoFiles:Object.fromEntries(portraitIndices.map(i=>['video-'+i,portrait])),videoResolutions:Array.from({length:options.videoCount??6},(_,i)=>portraitIndices.includes(i)?'360x640':'640x360')}:{};
    fixture=await rhvideoFixture({videoFile:picturesOnly?null:file,videoCount:6,...fixtureOptions,...orientation,videoDuration:videoMetadataDuration??duration});
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");view=await target(app,'rhvideo.html');
    if(!primaryGallery)await invoke(view,'category',{kind:'video'});await invoke(view,'connection.connect',{server:fixture.url,username:'preview',password:'fixture-only'});
    return {app,fixture,view,close:async()=>{view.close();app.close();await fixture.close();}};
  }catch(error){view?.close();app.close();await fixture?.close();throw error;}
}
const runCli=(app,window,action,args,key,options={})=>new Promise((resolve,reject)=>{
  const endpoint=options.endpoint?['--endpoint',options.endpoint]:['--port',String(app.port)],selector=options.target?['--target',options.target]:['--window',window];
  const child=spawn(process.execPath,['scripts/rhfiles-api.mjs',...endpoint,...selector,'--timeout','5000','--wait','--key',key,'run',action,JSON.stringify(args)],{windowsHide:true,env:{...process.env,...(options.trace?{RHFILES_CLI_TRACE:'1'}:{})}});let stdout='',stderr='';
  child.stdout.on('data',part=>stdout+=part);child.stderr.on('data',part=>stderr+=part);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
});
test('native startup keeps real WebView keyboard focus without a second controller focus transition',native,async()=>{
  const s=await setup({videoDuration:30});let player;
  const key=async(code,key,windowsVirtualKeyCode)=>{await player.send('Input.dispatchKeyEvent',{type:'rawKeyDown',code,key,windowsVirtualKeyCode,nativeVirtualKeyCode:windowsVirtualKeyCode});await player.send('Input.dispatchKeyEvent',{type:'keyUp',code,key,windowsVirtualKeyCode,nativeVirtualKeyCode:windowsVirtualKeyCode});};
  try{
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
    // No Page.bringToFront, focus emulation, DOM focus(), or preparatory click:
    // those would conceal a real keyboard-focus regression at startup.
    await until(async()=>{const value=await invoke(player,'player.state');return value.renderedFrames>0;},'initial actual native frame',25000);
    const focus=await player.evaluate('({focused:document.hasFocus(),visible:document.visibilityState,active:document.activeElement?.tagName})');assert.equal(focus.focused,true,JSON.stringify(focus));assert.equal(focus.visible,'visible');assert(!['BUTTON','INPUT','SELECT','TEXTAREA'].includes(focus.active),'A new viewer starts on its keyboard surface, not a previously focused command');
    await key('Space',' ',32);await until(async()=>{const value=await invoke(player,'player.state');return value.state===4;},'Space pauses the actual native input');
    await key('Space',' ',32);await until(async()=>{const value=await invoke(player,'player.state');return value.state===3&&!value.pauseRequested;},'Space resumes the actual native input');
    await key('Tab','Tab',9);assert.equal(await player.evaluate('document.activeElement.id'),'back','Tab can enter the real control strip without a mouse click');
    await invoke(s.view,'media.open',{kind:'video',id:'video-1'});await until(async()=>{const value=await invoke(player,'player.state');return value.queue?.id==='video-1'&&value.renderedFrames>0;},'reused viewer really displays the next source',25000);
    assert.equal(await player.evaluate('document.hasFocus()'),true);assert.equal(await player.evaluate('document.activeElement.id'),'back','Reusing the viewer keeps the existing focused control');
    await invoke(s.view,'player.close');
  }finally{player?.close();await s.close();}
});

test('grid startup keeps real WebView keyboard focus and keyboard-only control/close access',native,async()=>{
  const s=await setup({videoDuration:30});let grid;
  try{
    await invoke(s.view,'preferences.set',{key:'gridCount',value:2});await invoke(s.view,'grid.open');grid=await target(s.app,'rhvideo-grid.html');
    await until(async()=>{const value=await invoke(grid,'grid.state');return value.cells.length===2&&value.cells.every(cell=>cell.renderedFrames>0);},'two actual grid video outputs',25000);
    const focus=await grid.evaluate('({focused:document.hasFocus(),visible:document.visibilityState,first:[...document.querySelectorAll("button")].find(node=>!node.disabled)?.id})');assert.equal(focus.focused,true,JSON.stringify(focus));assert.equal(focus.visible,'visible');
    await grid.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await grid.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await grid.evaluate('document.activeElement.id'),focus.first,'The first enabled grid command is keyboard accessible without a click');
    await grid.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await grid.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until(async()=>{const value=await command(s.app,'grid.state');return value.cells.length===0;},'Escape really releases all grid players');
    await until(async()=>!(await(await fetch(`http://127.0.0.1:${s.app.port}/json/list`)).json()).some(t=>new URL(t.url).pathname.endsWith('/rhvideo-grid.html')),'Keyboard close destroys the grid WebView',3000);
  }finally{grid?.close();await s.close();}
});

test('player-owned close and back complete their public CLI runs instead of losing the result with the window',native,async()=>{
  const s=await setup();let player;
  try{
    const cli=(action,args,key)=>runCli(s.app,'window-rhvideo-player',action,args,key);
    for(const name of ['close','back','ui-back']){
      await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
      await until(async()=>{const value=await invoke(player,'player.state');return value.renderedFrames>0;},'real native frame before self-close',25000);
      const control=name==='ui-back'?await player.evaluate("RHFilesAPI.invoke('ui.list').then(rows=>rows.find(row=>row.id==='back'))"):null;
      const output=await cli(control?'ui.invoke':'rhvideo.player.'+name,control?{controlId:control.controlId}: {},'self-'+name);
      if(process.env.RHFILES_CLI_TRACE==='1')console.log(JSON.stringify({scenario:'player self-'+name,...output}));
      assert.equal(output.code,0,JSON.stringify(output));const reply=JSON.parse(output.stdout.trim());assert.equal(reply.result.state,'succeeded',JSON.stringify(reply));if(control)assert.deepEqual(reply.result.result,{controlId:control.controlId,event:'click'});else assert.equal(reply.result.result.closed,true);
      assert.equal((await command(s.app,'player.state')).opened,false);
      await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${s.app.port}/json/list`)).json();return !pages.some(page=>new URL(page.url).pathname.endsWith('/rhvideo-player.html'));},'Close retires the player window, not a hidden polling WebView',3000);
      player.close();player=null;
      if(name==='close'){
        await invoke(s.view,'media.open',{kind:'video',id:'video-1'});player=await target(s.app,'rhvideo-player.html');const replacement=await invoke(player,'player.state');
        const replay=await cli('rhvideo.player.close',{},'self-close');if(process.env.RHFILES_CLI_TRACE==='1')console.log(JSON.stringify({scenario:'player old-key receipt, no replay',...replay}));assert.equal(replay.code,0,JSON.stringify(replay));assert.equal(JSON.parse(replay.stdout).result.state,'succeeded');const after=await invoke(player,'player.state');assert.equal(after.opened,true,'The old request key must not close a later player');assert.equal(after.inputId,replacement.inputId);
        await command(s.app,'player.close');player.close();player=null;
      }
    }
  }finally{player?.close();await s.close();}
});

test('grid-owned close returns its completed CLI receipt and releases every native player',native,async()=>{
  const s=await setup();let grid;
  try{
    await invoke(s.view,'preferences.set',{key:'gridCount',value:2});await invoke(s.view,'grid.open');grid=await target(s.app,'rhvideo-grid.html');
    await until(async()=>{const value=await invoke(grid,'grid.state');return value.cells.length===2&&value.cells.every(cell=>cell.renderedFrames>0);},'both real grid frames before self-close',25000);
    const output=await runCli(s.app,'window-rhvideo-grid','rhvideo.grid.close',{},'grid-self-close');if(process.env.RHFILES_CLI_TRACE==='1')console.log(JSON.stringify({scenario:'grid self-close CLI',...output}));assert.equal(output.code,0,JSON.stringify(output));const reply=JSON.parse(output.stdout);assert.equal(reply.result.state,'succeeded');assert.equal(reply.result.result.closed,true);
    assert.equal((await command(s.app,'grid.state')).cells.length,0);
    await until(async()=>{const pages=await(await fetch(`http://127.0.0.1:${s.app.port}/json/list`)).json();return !pages.some(page=>new URL(page.url).pathname.endsWith('/rhvideo-grid.html'));},'retire the grid WebView instead of keeping it hidden',3000);
  }finally{grid?.close();await s.close();}
});

test('grid close recovers through a real survivor when the first view is paused and target rediscovery is unavailable',native,async()=>{
  const s=await setup();let grid,server;
  try{
    await invoke(s.view,'preferences.set',{key:'gridCount',value:2});await invoke(s.view,'grid.open');grid=await target(s.app,'rhvideo-grid.html');
    await until(async()=>{const value=await invoke(grid,'grid.state');return value.cells.length===2&&value.cells.every(cell=>cell.renderedFrames>0);},'two actual grid frames before recovery fault',25000);
    // Drop only the producer's wait reply. The action, native players, process
    // receipt and survivor API all remain real. Without this transport fault a
    // prompt, valid producer reply may win the race, not exercise recovery.
    await grid.evaluate('(()=>{const api=RHFilesAPI,rpc=api.rpc;api.rpc=request=>request.method==="runs.wait"?new Promise(()=>{}):rpc.call(api,request);return true;})()');
    const pages=await(await fetch(`http://127.0.0.1:${s.app.port}/json/list`)).json(),isMain=page=>/^\/(index\.html)?$/.test(new URL(page.url).pathname);
    const main=pages.find(isMain),gridPage=pages.find(page=>new URL(page.url).pathname==='/rhvideo-grid.html');assert(main&&gridPage);
    const ordered=[main,...pages.filter(page=>page.id!==main.id)];let requests=0;
    // Real WebViews, native operations and real WebSocket endpoints; the
    // injected faults affect reply delivery, the paused view and discovery.
    // Debugger pause survives the close handler's native window activation;
    // lifecycle freezing can be undone by that activation, hiding the fault.
    server=http.createServer((req,res)=>{if(req.url!=='/json/list'){res.writeHead(404).end();return;}requests++;if(requests>1){res.writeHead(503).end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(ordered));});
    await listenBrowserLoopback(server);
    await s.app.send('Debugger.enable');await s.app.send('Debugger.pause');let output;
    await until(()=>s.app.events.some(event=>event.method==='Debugger.paused'),'the first real view is actually debugger-paused',3000);
    const diagnostics={};
    const inspectReceipt=async()=>{
      try{return await s.view.evaluate('window.__TAURI__.core.invoke("automation_receipt",{query:{key:"grid-close-fault"}})',1500);}
      catch(error){return {diagnosticError:error.code||error.message};}
    };
    try{
      output=await runCli(s.app,null,'rhvideo.grid.close',{},'grid-close-fault',{endpoint:`http://127.0.0.1:${server.address().port}`,target:gridPage.id,trace:true});
      // Preserve the original five-second result. On failure, only READ the
      // process ledger before/after resuming the unrelated view: no replay,
      // extended action deadline, or inferred success from a vanished window.
      if(output.code!==0)diagnostics.whilePaused=await inspectReceipt();
    }finally{await s.app.send('Debugger.resume');await s.app.send('Debugger.disable');}
    if(output.code!==0){diagnostics.afterResume=await inspectReceipt();fs.writeFileSync(path.join(s.app.artifactDir,'grid-close-recovery-failure.json'),JSON.stringify({output,...diagnostics},null,2));console.log(JSON.stringify({scenario:'grid close failure ledger',...diagnostics}));}
    console.log(JSON.stringify({scenario:'grid close with paused survivor/discovery fault',...output}));assert.equal(output.code,0,JSON.stringify(output));const reply=JSON.parse(output.stdout);assert.equal(reply.result.state,'succeeded');assert.equal(reply.result.result.closed,true);
    const trace=output.stderr.trim().split('\n').map(line=>JSON.parse(line));assert.equal(trace.filter(row=>row.rhfilesClientTrace==='request.send').length,1,'Never resubmit the close action');
    const healthyStart=trace.findIndex(row=>row.rhfilesClientTrace==='recovery.target'&&row.target!==main.id),pausedEnd=trace.findIndex(row=>['recovery.cancelled','recovery.unavailable'].includes(row.rhfilesClientTrace)&&row.target===main.id);
    assert(healthyStart>=0&&pausedEnd>healthyStart,'The healthy survivor must start before the paused source finishes or is cancelled, not wait for its time slice');
    assert(trace.some(row=>['recovery.read','recovery.wait'].includes(row.rhfilesClientTrace)&&row.target!==main.id&&row.state==='succeeded'),'Completion must come from a real surviving view, not disappearance');assert.equal(requests,1,'Previously enumerated survivors must not need a fresh target list');
    assert.equal((await command(s.app,'grid.state')).cells.length,0);
    await until(async()=>{const current=await(await fetch(`http://127.0.0.1:${s.app.port}/json/list`)).json();return !current.some(page=>page.id===gridPage.id);},'the closed grid WebView is really destroyed',3000);
  }finally{server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));grid?.close();await s.close();}
});

test('a later real completion is not discarded after an earlier survivor reports running but loses its wait reply',native,async()=>{
  const s=await setup();let grid,closing;
  try{
    await invoke(s.view,'preferences.set',{key:'gridCount',value:2});await invoke(s.view,'grid.open');grid=await target(s.app,'rhvideo-grid.html');
    await until(async()=>{const state=await invoke(grid,'grid.state');return state.cells.length===2&&state.cells.every(cell=>cell.renderedFrames>0);},'two real outputs before late-receipt fault',25000);
    // Only reply delivery is faulted. The original close and all receipts are
    // real. Main answers its first status normally but drops the subsequent
    // wait; the library holds its one status until the real close is complete.
    await grid.evaluate('(()=>{const api=RHFilesAPI,rpc=api.rpc;api.rpc=request=>request.method==="runs.wait"?new Promise(()=>{}):rpc.call(api,request);return true;})()');
    await s.app.evaluate('(()=>{const api=RHFilesAPI,rpc=api.rpc;window.__receiptWaitStarted=false;api.rpc=request=>{if(request.method==="runs.wait"){window.__receiptWaitStarted=true;return new Promise(()=>{});}return rpc.call(api,request);};return true;})()');
    await s.view.evaluate('(()=>{const api=RHFilesAPI,rpc=api.rpc;window.__releaseReceiptStatus=null;api.rpc=async request=>{if(request.method==="runs.status")await new Promise(resolve=>window.__releaseReceiptStatus=resolve);return rpc.call(api,request);};return true;})()');
    closing=runCli(s.app,'window-rhvideo-grid','rhvideo.grid.close',{},'late-native-completion',{trace:true});
    await until(()=>s.app.evaluate('window.__receiptWaitStarted'),'the early running source really starts its stalled wait',3000);
    await until(async()=>{const value=await s.view.evaluate('RHFilesAPI.rpc({jsonrpc:"2.0",id:"read-only-observer",method:"runs.lookup",params:{key:"late-native-completion"}})');return value.result?.state==='succeeded';},'the actual process close receipt is complete',4000);
    assert.equal(await s.view.evaluate('(()=>{if(!window.__releaseReceiptStatus)return false;window.__releaseReceiptStatus();return true;})()'),true,'Release the already-started status response, not a new query');
    const output=await closing;console.log(JSON.stringify({scenario:'real later completion after running-source wait loss',...output}));assert.equal(output.code,0,JSON.stringify(output));
    const reply=JSON.parse(output.stdout);assert.equal(reply.result.state,'succeeded');assert.equal(reply.result.result.closed,true);
    const trace=output.stderr.trim().split('\n').map(line=>JSON.parse(line)),reads=trace.filter(row=>row.rhfilesClientTrace==='recovery.read');
    assert(reads.some(row=>row.state==='running')&&reads.some(row=>row.state==='succeeded'),'An early running receipt must not discard the later confirmed native result');
    assert.equal(trace.filter(row=>row.rhfilesClientTrace==='request.send').length,1,'Do not replay the accepted close');
    assert.equal((await command(s.app,'grid.state')).cells.length,0);
    await until(async()=>!(await(await fetch(`http://127.0.0.1:${s.app.port}/json/list`)).json()).some(page=>new URL(page.url).pathname==='/rhvideo-grid.html'),'the original close really destroys its view',3000);
  }finally{grid?.close();await s.close();await closing;}
});

test('sequential playback keeps the visible full-list order, wraps manually, seeks across entries and resumes its own cursor',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'sort',{value:'nameDesc'});
    const order=(await invoke(s.view,'state')).items.map(i=>i.id);
    assert.equal(await s.view.evaluate("document.querySelectorAll('select[data-api-action=\"rhvideo.play.mode\"]').length"),0,'playback capabilities are explicit actions, not a mode dropdown');
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    const initial=await invoke(player,'player.state');assert.equal(initial.queue.id,order[0]);assert.equal(initial.queue.total,6);assert.equal(initial.queue.options.mode,'sequential');assert.equal(initial.queue.options.fullLength,true);
    const last=await invoke(player,'player.previous');assert.equal(last.queue.id,order.at(-1));
    await invoke(player,'player.control',{command:'rate',value:1.5});
    const first=await invoke(player,'player.next');assert.equal(first.queue.id,order[0]);
    assert.equal((await invoke(player,'player.state')).rate,1.5,'switching to a preloaded/new native player must preserve playlist speed');
    const seeked=await invoke(player,'player.seekQueue',{ratio:.25});assert.equal(seeked.queue.index,1);assert.equal(seeked.queue.id,order[1]);
    await until(async()=>{const value=await invoke(player,'player.state');return value.renderedFrames>0&&value.decoderPositionMs>=6500;},'actual native cross-entry seek',25000);
    await invoke(player,'player.control',{command:'pause'});
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    const segment=await invoke(player,'player.state');assert.equal(segment.queue.options.mode,'segments');assert.equal(segment.queue.total,4,'segment pool is the screenshot gallery, not the six-item video list');assert.equal(segment.queue.options.fullLength,false);assert.equal(segment.queue.options.segment,3);
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');assert.equal((await invoke(player,'player.state')).queue.id,order[1],'segment playback cannot overwrite sequential playback history');
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.sequential',{super:true});player=await target(s.app,'rhvideo-player.html');
    const low=await invoke(player,'player.state');assert.equal(low.queue.index,0);assert.equal(low.queue.options.mode,'sequential-super');assert.equal(low.queue.options.super,true);
    await until(()=>s.fixture.requests.some(r=>r.path.endsWith('/play')&&r.query==='?super=true'),'actual super stream requested');
    assert.deepEqual((await invoke(player,'ui.contract')).missing,[]);
    await player.send('Emulation.setDeviceMetricsOverride',{width:640,height:420,deviceScaleFactor:1,mobile:false});
    const outside=await player.evaluate("[...document.querySelectorAll('#controls button,#controls input,#controls select')].filter(n=>n.getClientRects().length).filter(n=>{const r=n.getBoundingClientRect();return r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1}).map(n=>n.id)");
    assert.deepEqual(outside,[],'all player controls remain reachable at minimum size');
  }finally{player?.close();await s.close();}
});

test('live portrait playback filters its original pool; restarting sequential mode resets portrait/full length exactly as the reference',native,async()=>{
  const s=await setup({portraitIndices:[0,2,3],videoDuration:20});let player;
  try{
    const original=(await invoke(s.view,'state')).items.map(i=>i.id);
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    const initial=await invoke(player,'player.state');assert.equal(initial.queue.sourceTotal,6);assert.equal(initial.queue.portraitTotal,3);assert.equal(initial.queue.options.segment,300);
    await invoke(player,'player.control',{command:'rate',value:1.5});
    const filtered=await invoke(player,'player.options',{portraitOnly:true});assert.equal(filtered.total,3);assert.equal(filtered.options.fullLength,true);assert.equal(filtered.options.portraitOnly,true);
    await until(async()=>{const v=await invoke(player,'player.state');return v.renderedFrames>0&&v.videoHeight>v.videoWidth&&v.rate===1.5;},'actual portrait frames after pool switch',25000);
    await assert.rejects(command(s.app,'player.options',{options:{loop:true},expectedId:initial.queue.id,expectedRevision:initial.queue.revision}),/已改变/,'an ABA-same video ID cannot accept old queue settings');
    const restored=await invoke(player,'player.options',{portraitOnly:false});assert.equal(restored.total,6);assert.equal(restored.options.fullLength,false);assert.equal(restored.options.portraitOnly,false);
    assert.equal((await invoke(player,'player.next')).queue.id,original[1]);assert.equal((await invoke(player,'player.state')).rate,1.5);
    await invoke(player,'player.options',{portraitOnly:true});
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    const resumed=(await invoke(player,'player.state')).queue;assert.equal(resumed.total,6);assert.equal(resumed.sourceTotal,6);assert.equal(resumed.options.portraitOnly,false);assert.equal(resumed.options.fullLength,true,'a fresh sequential start always restores full-length playback');
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    const segments=(await invoke(player,'player.state')).queue;assert.equal(segments.options.portraitOnly,false);assert.equal(segments.total,4,'a sequential setting cannot filter the independent gallery mode');
    assert.deepEqual((await invoke(player,'ui.contract')).missing,[]);
    await invoke(player,'player.options',{portraitOnly:true});await invoke(player,'player.options',{fullLength:false,segment:2});
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    const restoredSegments=(await invoke(player,'player.state')).queue;assert.equal(restoredSegments.options.portraitOnly,true);assert.equal(restoredSegments.options.fullLength,false);assert.equal(restoredSegments.segmentLengthMs,2000,'portrait filtering must not overwrite a saved explicit segment choice');
  }finally{player?.close();await s.close();}
});

test('a real pointer toggle with fewer than two portrait videos fails visibly without changing the paused input or queue',native,async()=>{
  const s=await setup({portraitIndices:[0]});let player;
  try{
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    await until(async()=>(await invoke(player,'player.state')).renderedFrames>0,'initial decoded frame',25000);
    const before=await invoke(player,'player.control',{command:'pause'});
    // The main WebView's focus emulation does not cover this separate controls
    // WebView. Keep this CDP pointer acceptance independent of other windows
    // taking OS focus, and wait for its native strip resize/layout to settle.
    await player.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await player.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const point=await player.evaluate("(()=>{const r=document.getElementById('portrait-only').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    assert.equal(await player.evaluate(`document.elementFromPoint(${point.x},${point.y})===document.getElementById('portrait-only')`),true,'pointer coordinates must hit the actual checkbox');
    await player.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await player.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await player.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    await until(()=>player.evaluate("document.getElementById('error').textContent.includes('不足 2 个')&&!document.getElementById('portrait-only').checked"),'visible error and reverted checkbox');
    const after=await invoke(player,'player.state');assert.equal(after.queue.id,before.queue.id);assert.equal(after.queue.revision,before.queue.revision);assert.equal(after.queue.total,6);assert.equal(after.state,4);
    assert.equal((await command(s.app,'playlist.state',{mode:'sequential'})).portraitOnly,false,'a rejected UI toggle must not persist as enabled');
  }catch(error){console.log(JSON.stringify({scenario:'portrait pointer rejection',ui:await player?.evaluate("({focus:document.hasFocus(),error:document.getElementById('error').textContent,checked:document.getElementById('portrait-only').checked,disabled:document.getElementById('portrait-only').disabled,rect:document.getElementById('portrait-only').getBoundingClientRect().toJSON(),viewport:[innerWidth,innerHeight]})").catch(e=>({error:String(e)})),native:await command(s.app,'player.state').catch(e=>({error:String(e)}))}));throw error;}
  finally{player?.close();await s.close();}
});

test('failed playlist reads skip forward once even with repeat enabled, and an all-failed queue terminates',native,async()=>{
  const s=await setup({videoCount:3,beforeMedia:async({image})=>image?null:{status:404}});let player;
  try{
    await invoke(s.view,'preferences.set',{key:'loop',value:true});
    await invoke(s.view,'playlist.start');
    await until(()=>s.fixture.requests.some(r=>r.path.endsWith('/play')),'real failed stream attempted');
    await until(async()=>!(await command(s.app,'player.state')).opened,'bounded failed queue closes rather than looping/retrying',20000);
    const reads=s.fixture.requests.filter(r=>r.path.endsWith('/play')).length;assert(reads>0&&reads<=6,'at most the finite queue plus one bounded preload, not a repeated playlist');
    await sleep(1200);assert.equal(s.fixture.requests.filter(r=>r.path.endsWith('/play')).length,reads,'no traffic after terminal failure');
    assert.match(await s.view.evaluate("document.getElementById('notice').textContent"),/加载失败/);
  }catch(error){console.log(JSON.stringify({scenario:'terminal playlist read failures',native:await command(s.app,'player.state').catch(String),reads:s.fixture.requests.filter(r=>r.path.endsWith('/play'))}));throw error;}
  finally{player?.close();await s.close();}
});
test('gallery segment playback starts at the browsed item, deduplicates videos and ignores list multiselection',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:8});
    const image=await invoke(s.view,'image.state');
    await invoke(s.view,'selection.toggle',{kind:'video',id:'video-5',enabled:true});
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    const queue=(await invoke(player,'player.state')).queue;
    assert.equal(queue.id,image.current.videoId);assert.equal(queue.total,4);assert.equal(queue.segmentLengthMs,3000);
    await assert.rejects(invoke(s.view,'playlist.sequential'),/多选/);
  }finally{player?.close();await s.close();}
});
test('the final non-looped segment closes playback and returns to the library instead of remaining paused',native,async()=>{
  for(const existingGallery of [false,true]){
  const s=await setup({videoDuration:6,videoCount:2});let player;
  try{
    if(existingGallery)await invoke(s.view,'gallery.open');
    const before=await s.view.evaluate("[...document.querySelectorAll('.wb-dialog[open]')].map(n=>n.id)");
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    await invoke(player,'player.seekQueue',{ratio:1});
    const current=await until(async()=>{const v=await invoke(player,'player.state');return v.queue.index===1&&v.renderedFrames>0?v:null;},'actual final segment displays',25000);
    await invoke(player,'player.control',{command:'seek',value:current.queue.segmentStartMs+current.queue.segmentLengthMs-50});
    await until(async()=>!(await command(s.app,'player.state')).opened,'final segment closes natively',8000);
    assert.deepEqual(await s.view.evaluate("[...document.querySelectorAll('.wb-dialog[open]')].map(n=>n.id)"),before,'an existing gallery survives; starting from the list must not invent a gallery popup');
  }finally{player?.close();await s.close();}
  }
});
test('video from a screenshot returns to that exact image; arrows pop to the parent image queue; closing commits marks only once',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:0});
    await invoke(s.view,'image.step',{direction:-1});const wrapped=await invoke(s.view,'image.state');assert.equal(wrapped.index,wrapped.total-1);
    await invoke(s.view,'image.step',{direction:1});assert.equal((await invoke(s.view,'image.state')).index,0);
    await invoke(s.view,'image.playFrame');player=await target(s.app,'rhvideo-player.html');
    assert.equal((await invoke(player,'player.state')).queue.options.origin,'frame');
    await command(s.app,'player.next');player.close();player=null;
    await until(async()=>(await invoke(s.view,'image.state')).index===1,'next returns to parent screenshot rather than a different video queue');
    const parent=await invoke(s.view,'image.state');
    await invoke(s.view,'image.playFrame');player=await target(s.app,'rhvideo-player.html');
    await invoke(player,'player.mark');assert.equal(s.fixture.trash.length,0);
    await command(s.app,'player.back');player.close();player=null;
    assert.equal((await invoke(s.view,'image.state')).index,parent.index);assert.equal(s.fixture.trash.length,0,'returning within the preview stack must not commit pending marks');
    assert.equal((await invoke(s.view,'preview.pending')).items.length,1);
    await invoke(s.view,'image.close');
    await until(async()=>{const r=await invoke(s.view,'preview.state');return r?.completed===1&&!r.running;},'explicit marks commit when the preview actually closes');
    assert.equal(s.fixture.trash.length,1);assert.equal(s.fixture.requests.filter(r=>r.method==='POST'&&r.path.startsWith('/api/v1/trash/video/')).length,1);
  }finally{player?.close();await s.close();}
});
test('player favorites update the library, and a failed preview write is terminal rather than replayed on the next close',native,async()=>{
  const s=await setup({failTrashIds:['video:video-0']});let player;
  try{
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
    await invoke(player,'player.favorite');assert(s.fixture.favorites.has('video:video-0'));
    await invoke(s.view,'favorite.toggle',{kind:'video',id:'video-0'});assert.equal(s.fixture.favorites.has('video:video-0'),false);
    await invoke(player,'player.mark');assert.equal((await invoke(s.view,'workbench.diagnostics')).selected,0,'preview marks are not list multiselection');
    await invoke(s.view,'player.close');player.close();player=null;
    const result=await until(async()=>{const r=await invoke(s.view,'preview.state');return r?.completed===1&&!r.running?r:null;},'failed write is shown as a terminal result');
    assert.equal(result.items[0].success,false);assert.match(result.items[0].error,/403|read-only/);
    await invoke(s.view,'media.open',{kind:'video',id:'video-1'});player=await target(s.app,'rhvideo-player.html');
    await invoke(s.view,'player.close');player.close();player=null;await sleep(300);
    assert.equal(s.fixture.requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/trash/video/video-0').length,1,'no automatic replay or ABA rearming');
  }finally{player?.close();await s.close();}
});

test('native playback from the primary screenshot page returns to its exact image and page without opening another gallery',native,async()=>{
  const s=await setup({primaryGallery:true,galleryVideoCount:6});let player;
  try{
    await until(async()=>(await invoke(s.view,'gallery.state')).total===48,'primary screenshot page ready');
    await invoke(s.view,'gallery.page',{direction:1});await invoke(s.view,'gallery.inspect',{index:0});const image=await invoke(s.view,'image.state');assert.equal(image.index,36);assert.equal(image.current.seconds,8);
    await invoke(s.view,'image.playFrame');player=await target(s.app,'rhvideo-player.html');
    const playing=await until(async()=>{const state=await invoke(player,'player.state');return state.renderedFrames>0&&state.positionMs>=7900?state:null;},'primary screenshot time really displays native frames',25000);
    assert.equal(playing.queue.id,image.current.videoId);assert.equal(playing.queue.options.parentTotal,48);
    await command(s.app,'player.back');player.close();player=null;await until(async()=>{const v=await invoke(s.view,'image.state');return v.opened&&!v.loading&&v.index===36;},'native Back restores that exact primary image');await invoke(s.view,'image.close');
    assert.equal((await invoke(s.view,'state')).view,'gallery');assert.equal(await s.view.evaluate("!document.getElementById('gallery-panel').hidden&&document.querySelector('#gallery-content .wb-gallery-nav').textContent.includes('37 / 48')"),true);assert.equal(await s.view.evaluate("document.querySelectorAll('dialog[open]').length"),0);
  }finally{player?.close();await s.close();}
});

test('native segment and multi-video queues use server screenshot order rather than a separately sorted video list',native,async()=>{
  const metadata=[2,0,1].map(id=>({video_id:'video-'+id,filename:'Source '+id,folder:'test',duration:14,resolution:'640x360',screenshots:[{url:'/storage/pictures/'+id+'.svg',time_seconds:1}]}));
  const s=await setup({primaryGallery:true,beforeGallery:()=>({data:metadata})});let player,grid;
  try{
    await until(async()=>(await invoke(s.view,'gallery.state')).total===3,'non-alphabetical source gallery');await invoke(s.view,'sort',{value:'nameAsc'});await invoke(s.view,'gallery.inspect',{index:1});await invoke(s.view,'image.close');
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    for(const id of ['video-0','video-1','video-2']){const actual=await until(async()=>{const v=await invoke(player,'player.state');return v.queue?.id===id&&v.renderedFrames>0?v:null;},'actual source-ordered segment '+id,25000);assert.equal(actual.queue.total,3);if(id!=='video-2')await invoke(player,'player.next');}
    await invoke(s.view,'player.close');player.close();player=null;await invoke(s.view,'preferences.set',{key:'gridCount',value:3});await invoke(s.view,'grid.open');grid=await target(s.app,'rhvideo-grid.html');
    const actual=await until(async()=>{const v=await invoke(grid,'grid.state');return v.cells?.length===3&&v.cells.every(c=>c.renderedFrames>0)?v:null;},'all source-ordered grid inputs really render',25000);assert.deepEqual(actual.cells.map(c=>c.id),['video-2','video-0','video-1']);
    if(process.env.RHFILES_EXPECT_RENDERER)assert(actual.cells.every(c=>c.renderer===process.env.RHFILES_EXPECT_RENDERER));await invoke(s.view,'grid.close');grid.close();grid=null;
  }finally{player?.close();grid?.close();await s.close();}
});

test('a cold normal video card never waits for the background gallery or manufactures a screenshot parent',native,async()=>{
  let release,s,player;const held=new Promise(resolve=>release=resolve);
  try{
    s=await setup({beforeGallery:()=>held});
    await until(()=>s.fixture.requests.some(r=>r.path==='/api/v1/screenshots/grid'),'reference-style background gallery request starts');
    assert.equal((await invoke(s.view,'gallery.state')).loading,true);
    await invoke(s.view,'media.open',{kind:'video',id:'video-1'});player=await target(s.app,'rhvideo-player.html');
    const state=await until(async()=>{const v=await invoke(player,'player.state');return v.renderedFrames>0?v:null;},'cold direct video really renders',25000);
    assert.equal(state.queue.id,'video-1');assert.equal(state.queue.total,1);assert.equal(state.queue.options.origin,undefined);
    assert.equal(s.fixture.requests.filter(r=>r.path==='/api/v1/screenshots/grid').length,1,'the click neither duplicates nor waits for the background read');
    await command(s.app,'player.back');player.close();player=null;assert.equal((await invoke(s.view,'image.state')).opened,false,'no uncached parent is invented on Back');
    release();await until(async()=>(await invoke(s.view,'gallery.state')).loaded,'background metadata completes without a popup');
    assert.equal(await s.view.evaluate("!!document.querySelector('#wb-gallery[open]')"),false);
  }finally{release();player?.close();await s?.close();}
});

test('a normal video card reuses its cached first matching screenshot without reopening the gallery before playback',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'gallery.open');await invoke(s.view,'panel.close',{id:'wb-gallery'});
    await invoke(s.view,'media.open',{kind:'video',id:'video-1'});player=await target(s.app,'rhvideo-player.html');
    const queue=(await invoke(player,'player.state')).queue;assert.equal(queue.id,'video-1');assert.equal(queue.options.origin,'frame');
    assert.equal(await s.view.evaluate("!!document.querySelector('#wb-gallery[open]')"),false,'metadata preparation cannot pop a gallery in front of the clicked video');
    await command(s.app,'player.back');player.close();player=null;
    const parent=await until(async()=>{const v=await invoke(s.view,'image.state');return v.opened&&v.current?.videoId==='video-1'?v:null;},'ordinary video returns to the reference parent screenshot');
    assert.equal(parent.index,8,'first matching frame, not the last browsed frame');
    await invoke(s.view,'image.close');
  }finally{player?.close();await s.close();}
});

test('ordinary video clicks start at zero by default, without removing explicit playback history',native,async()=>{
  const s=await setup();let player;
  try{
    assert.equal((await invoke(s.view,'preferences.state')).resume,false,'automatic resume is opt-in; RHVideo ordinary playback starts from zero');
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
    await until(async()=>(await invoke(player,'player.state')).renderedFrames>0,'first native picture',25000);
    await invoke(player,'player.control',{command:'seek',value:6500});
    await until(async()=>(await invoke(player,'player.state')).decoderPositionMs>=6400,'native history seek',25000);
    await invoke(player,'player.control',{command:'pause'});await invoke(s.view,'player.close');player.close();player=null;
    const history=await command(s.app,'playback.history');assert(history['video-0'].seconds>=6,'the separate history/continue action keeps its saved position');
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
    const restarted=await until(async()=>{const state=await invoke(player,'player.state');return state.renderedFrames>0?state:null;},'new native input from ordinary click',25000);
    assert(restarted.positionMs<3000,'an ordinary click must not silently restore the old 6.5-second point');
  }finally{player?.close();await s.close();}
});

test('single-video loop and speed survive a different source without leaking into playlist modes or another login',native,async()=>{
  const s=await setup({videoDuration:20});let player;
  try{
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
    await invoke(player,'player.options',{loop:true});const changed=await invoke(player,'player.control',{command:'rate',value:1.5});assert.equal(changed.rate,1.5);assert.equal(changed.queue.options.rate,1.5,'the control acknowledgement must describe the updated queue too');
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'media.open',{kind:'video',id:'video-1'});player=await target(s.app,'rhvideo-player.html');
    let state=await invoke(player,'player.state');assert.equal(state.queue.options.loop,true,'closing the media viewer must not reset its own repeat toggle');assert.equal(state.rate,1.5,'a different source inherits the media-viewer speed');
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');state=await invoke(player,'player.state');assert.equal(state.queue.options.loop,false);assert.equal(state.rate,1,'gallery playlist controls are independent');
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');state=await invoke(player,'player.state');assert.equal(state.queue.options.loop,true);assert.equal(state.rate,1.5);
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'connection.logout');await invoke(s.view,'connection.connect',{server:s.fixture.url,username:'preview',password:'fixture-only'});
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');state=await invoke(player,'player.state');assert.equal(state.queue.options.loop,false);assert.equal(state.rate,1,'new login has its own transient media controls');
  }finally{player?.close();await s.close();}
});

test('video arrows still pop the parent preview when that parent collection contains exactly one screenshot',native,async()=>{
  const s=await setup({videoCount:1,galleryVideoCount:1,galleryFrameCount:1});let player;
  try{
    await invoke(s.view,'gallery.open');await invoke(s.view,'panel.close',{id:'wb-gallery'});
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
    const state=await invoke(player,'player.state');assert.equal(state.queue.options.parentTotal,1);assert.equal(state.queue.hasPrevious,true);assert.equal(state.queue.hasNext,true);
    await player.send('Emulation.setFocusEmulationEnabled',{enabled:true});await player.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const point=await player.evaluate("(()=>{const button=document.getElementById('next'),r=button.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,disabled:button.disabled}})()");assert.equal(point.disabled,false);assert.equal(await player.evaluate(`document.elementFromPoint(${point.x},${point.y})===document.getElementById('next')`),true);
    await player.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:point.x,y:point.y});await player.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x,y:point.y});player.close();player=null;
    const image=await until(async()=>{const value=await invoke(s.view,'image.state');return value.opened&&!value.loading?value:null;},'single-item parent returns through the actual arrow');assert.equal(image.index,0);assert.equal(image.total,1);assert.equal(image.current.videoId,'video-0');
  }finally{player?.close();await s.close();}
});

test('replaying the same screenshot uses a new child identity and consumes each return only once',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:3});await invoke(s.view,'image.playVideo');player=await target(s.app,'rhvideo-player.html');const first=await invoke(player,'player.state');
    await command(s.app,'player.back');player.close();player=null;await until(async()=>{const value=await invoke(s.view,'image.state');return value.opened&&!value.loading;},'first child returns before replay');
    await invoke(s.view,'image.playVideo');player=await target(s.app,'rhvideo-player.html');const second=await invoke(player,'player.state');assert.equal(second.queue.options.parentPreview,first.queue.options.parentPreview);assert.notEqual(second.queue.options.parentPlayback,first.queue.options.parentPlayback);
    const event={generation:first.generation,parentKey:first.queue.options.parentKey,parentPreview:first.queue.options.parentPreview,parentPlayback:first.queue.options.parentPlayback,close:true};assert.equal((await invoke(s.view,'image.returnFromVideo',event)).stale,true);
    const actual=await invoke(player,'player.state');assert.equal(actual.opened,true);assert.equal(actual.inputId,second.inputId,'an old whole-close cannot stop a newer child of the same image');
    await command(s.app,'player.back');player.close();player=null;await until(async()=>{const value=await invoke(s.view,'image.state');return value.opened&&!value.loading&&value.index===3;},'current child return accepted');
    const duplicate={...event,parentPlayback:second.queue.options.parentPlayback,direction:1,close:false};assert.equal((await invoke(s.view,'image.returnFromVideo',duplicate)).stale,true);assert.equal((await invoke(s.view,'image.state')).index,3);
  }finally{player?.close();await s.close();}
});

test('a delayed real video-card click cannot take over a newer clicked video or its parent',native,async()=>{
  const s=await setup();let player;
  try{
    await s.view.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await invoke(s.view,'gallery.open');await invoke(s.view,'panel.close',{id:'wb-gallery'});
    await s.view.evaluate("window.__playPost=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){if(!window.__heldPlay&&message.action==='query'&&message.args.kind==='gallery'&&message.args.locate?.videoId){window.__heldPlay={worker:this,message,rest};return;}return window.__playPost.call(this,message,...rest);};true");
    const click=async id=>{await s.view.evaluate("document.querySelector('.media-card[data-id="+JSON.stringify(id)+"] .cover-button').scrollIntoView({block:'center'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");const point=await s.view.evaluate("(()=>{const n=document.querySelector('.media-card[data-id="+JSON.stringify(id)+"] .cover-button'),r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)?.closest('.media-card')?.dataset.id};})()");assert.equal(point.hit,id,'the real pointer must hit the requested visible card');const {x,y}=point;await s.view.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x,y});await s.view.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x,y});};
    await click('video-0');await until(()=>s.view.evaluate('!!window.__heldPlay'),'first real card is awaiting gallery metadata');
    await click('video-1');player=await target(s.app,'rhvideo-player.html');
    const shown=await until(async()=>{const v=await invoke(player,'player.state');return v.queue?.id==='video-1'&&v.renderedFrames>0?v:null;},'newer clicked video displays actual native frames',25000);
    await s.view.evaluate("Worker.prototype.postMessage=window.__playPost;const held=window.__heldPlay,receive=held.worker.onmessage;held.worker.onmessage=function(event){receive.call(this,event);if(event.data.id===held.message.id)window.__oldPlayDelivered=true;};window.__playPost.call(held.worker,held.message,...held.rest);true");
    await until(()=>s.view.evaluate('window.__oldPlayDelivered===true'),'old gallery response delivered');
    const current=await invoke(player,'player.state');assert.equal(current.inputId,shown.inputId);assert.equal(current.queue.id,'video-1');assert.equal((await invoke(s.view,'image.state')).current.videoId,'video-1');
    assert.equal(s.fixture.requests.filter(r=>r.path==='/api/v1/videos/video-0/play').length,0,'an obsolete click must never start an old stream after the new one');
  }finally{player?.close();await s.close();}
});

test('single-video smart rotation toggles back, preserves pause/time/rate, and persists without rotating an already-fitting source',native,async()=>{
  const s=await setup({portraitIndices:[0],videoDuration:20,rotationMarkers:true,loginUsers:['preview','other']});let player;
  const capture=async(state,name)=>{
    const image=await command(s.app,'player.diagnosticFrame',{expectedInput:state.inputId});assert.equal(path.dirname(image.path),s.app.directory,'only this fixture working directory may receive diagnostic files');
    const data=fs.readFileSync(image.path);assert.equal(data.subarray(0,2).toString(),'BM');const width=data.readInt32LE(18),height=-data.readInt32LE(22);assert.equal(data.length,54+width*height*4);
    const saved=path.join(s.app.artifactDir,name+'.png');execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-i',image.path,'-frames:v','1',saved],{windowsHide:true,timeout:10000});
    const sw=360,sh=640,quarter=state.rotation===90,dw=quarter?sh:sw,dh=quarter?sw:sh,scale=Math.min(width/dw,height/dh),left=(width-dw*scale)/2,top=(height-dh*scale)/2,colors=[];
    for(let corner=0;corner<4;corner++){
      const x=corner%2?310:50,y=corner<2?50:590,px=Math.round(left+(quarter?sh-y:x)*scale),py=Math.round(top+(quarter?x:y)*scale),offset=54+(py*width+px)*4;
      const [b,g,r]=data.subarray(offset,offset+3);colors.push([r,g,b]);
      assert(corner===0?r>160&&g<90&&b<90:corner===1?g>160&&r<90&&b<90:corner===2?b>160&&r<90&&g<90:r>160&&g>160&&b<90,`actual ${state.renderer} corner ${corner} at ${state.rotation} degrees: ${r},${g},${b}; canvas ${width}x${height}`);
    }
    console.log(JSON.stringify({nativeRotationScreenshot:saved,width,height,colors}));
  };
  try{
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
    await until(async()=>{const v=await invoke(player,'player.state');return v.renderedFrames>0&&v.videoHeight>v.videoWidth;},'actual portrait source before rotation',25000);
    await invoke(player,'player.control',{command:'rate',value:1.5});await invoke(player,'player.control',{command:'pause'});await invoke(player,'player.control',{command:'seek',value:5000});
    await until(async()=>{const v=await invoke(player,'player.state');return v.state===4&&Math.abs(v.positionMs-5000)<250;},'initial paused position');
    await invoke(player,'player.rotate');
    const rotated=await until(async()=>{const v=await invoke(player,'player.state');return v.rotation===90&&v.state===4&&!v.restoringPausedFrame&&v.renderedFrames>0?v:null;},'actual rotated paused frame',25000);
    console.log(JSON.stringify({rotatedNativeState:rotated}));
    if(rotated.renderer==='gdi-compatibility')assert(rotated.presentedWidth>rotated.presentedHeight,'the actual GDI presenter must draw the landscape geometry, not only set an angle flag');
    await capture(rotated,'rhvideo-rotation-on');
    await invoke(player,'player.rotate');
    const off=await until(async()=>{const v=await invoke(player,'player.state');return v.state===4&&!v.restoringPausedFrame&&v.renderedFrames>0?v:null;},'second toggle settled',25000);
    assert.equal(off.rotation,0,'a second toggle means off, not 180 degrees');assert.equal(off.autoRotate,false);assert.equal(off.rate,1.5);assert(Math.abs(off.positionMs-5000)<500);
    if(off.renderer==='gdi-compatibility')assert(off.presentedHeight>off.presentedWidth);
    await capture(off,'rhvideo-rotation-off');
    await invoke(player,'player.rotate');await until(async()=>{const v=await invoke(player,'player.state');return v.rotation===90&&v.renderedFrames>0&&!v.restoringPausedFrame;},'enabled rotation reapplied',25000);
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'media.open',{kind:'video',id:'video-2'});player=await target(s.app,'rhvideo-player.html');
    const landscape=await until(async()=>{const v=await invoke(player,'player.state');return v.renderedFrames>0?v:null;},'next source actually renders',25000);
    assert.equal(landscape.autoRotate,true);assert.equal(landscape.rotation,0,'a wide source must not inherit the portrait angle');
    const oldSnapshot=await command(s.app,'preferences');await command(s.app,'preferences',{value:{...oldSnapshot,autoRotate:false}});assert.equal((await invoke(s.view,'rotation.state')).enabled,true,'a stale library save cannot overwrite the newer player choice');
    await invoke(s.view,'player.close');player.close();player=null;
    await invoke(s.view,'connection.logout');await invoke(s.view,'connection.connect',{server:s.fixture.url,username:'preview',password:'fixture-only'});
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
    const reopened=await until(async()=>{const v=await invoke(player,'player.state');return v.renderedFrames>0?v:null;},'rotation preference survives reopening same account',25000);assert.equal(reopened.autoRotate,true);assert.equal(reopened.rotation,90);
    await assert.rejects(invoke(player,'player.control',{command:'autoRotate',enabled:false,expectedInput:rotated.inputId}),/播放输入已改变/);assert.equal((await invoke(s.view,'rotation.state')).enabled,true);
    await invoke(s.view,'player.close');player.close();player=null;await invoke(s.view,'connection.logout');await invoke(s.view,'connection.connect',{server:s.fixture.url,username:'other',password:'fixture-only'});
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');const other=await until(async()=>{const v=await invoke(player,'player.state');return v.renderedFrames>0?v:null;},'other account default actual frame',25000);assert.equal(other.autoRotate,false);assert.equal(other.rotation,0);
  }finally{player?.close();await s.close();}
});

test('a real seek drag stays bound to the input where it started when the queue advances',native,async()=>{
  const s=await setup({videoDuration:20});let player;
  try{
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    const first=await until(async()=>{const v=await invoke(player,'player.state');return v.renderedFrames>0&&v.durationMs>0?v:null;},'first native seek target',25000);
    await player.send('Emulation.setFocusEmulationEnabled',{enabled:true});await player.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await player.evaluate("window.__seekEvents=[];for(const name of ['pointerdown','input','change','pointerup'])document.getElementById('seek').addEventListener(name,event=>window.__seekEvents.push({name,value:event.target.value,trusted:event.isTrusted}),true);true");
    const point=await player.evaluate("(()=>{const r=document.getElementById('seek').getBoundingClientRect();return {x:r.x+r.width*.75,y:r.y+r.height/2};})()");
    await player.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
    await invoke(player,'player.next');
    const next=await until(async()=>{const v=await invoke(player,'player.state');return v.inputId!==first.inputId&&v.renderedFrames>0?v:null;},'queue advanced during the held drag',25000);
    await invoke(player,'player.control',{command:'pause'});
    await player.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
    console.log(JSON.stringify({seekDrag:await player.evaluate("({events:window.__seekEvents,error:document.getElementById('error').textContent})"),released:await invoke(player,'player.state')}));
    await until(()=>player.evaluate("document.getElementById('error').textContent.includes('旧操作未执行')"),'old drag is rejected visibly rather than seeking the new video');
    const current=await invoke(player,'player.state');assert.equal(current.inputId,next.inputId);assert(current.positionMs<8000,'releasing an old 75% drag must not seek the new input');
  }finally{player?.close();await s.close();}
});

test('a real total-progress drag survives Next but cannot seek a replacement time plan',native,async()=>{
  const s=await setup({videoDuration:20});let player;
  try{
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    const first=await until(async()=>{const v=await invoke(player,'player.state');return v.renderedFrames>0&&v.durationMs>0?v:null;},'initial total-progress target',25000);
    await player.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await player.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const point=await player.evaluate("(()=>{const r=document.getElementById('queue-seek').getBoundingClientRect();return {x:r.x+r.width*.75,y:r.y+r.height/2};})()");
    const down=(at=point)=>player.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...at});
    const up=(at=point)=>player.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...at});
    await down();await invoke(player,'player.next');
    assert.equal((await invoke(player,'player.state')).queue.planRevision,first.queue.planRevision);
    await up();
    const seeked=await until(async()=>{const v=await invoke(player,'player.state');return v.queue.index===4&&v.renderedFrames>0&&v.positionMs>8000?v:null;},'queue gesture uses its full original timeline after Next',25000);
    await invoke(player,'player.control',{command:'pause'});
    // Make a genuinely different value, otherwise a second click at the same
    // position produces no native HTML range change/commit at all.
    const secondPoint=await player.evaluate("(()=>{const r=document.getElementById('queue-seek').getBoundingClientRect();return {x:r.x+r.width*.25,y:r.y+r.height/2};})()");
    await player.evaluate("window.__queueDragEvents=[];for(const name of ['pointerdown','input','change','pointerup'])document.getElementById('queue-seek').addEventListener(name,event=>window.__queueDragEvents.push({name,value:event.target.value,trusted:event.isTrusted}),true);true");
    await down(secondPoint);await invoke(player,'player.options',{fullLength:false,segment:2});
    const changed=await invoke(player,'player.state');assert.notEqual(changed.queue.planRevision,seeked.queue.planRevision);
    await up(secondPoint);await until(()=>player.evaluate("document.getElementById('error').textContent.includes('播放队列已改变')"),'replaced plan is rejected visibly');
    console.log(JSON.stringify({queueDrag:await player.evaluate('window.__queueDragEvents'),beforePlan:seeked.queue.planRevision,afterPlan:changed.queue.planRevision,inputBeforeRejection:changed.inputId}));
    assert.equal((await invoke(player,'player.state')).inputId,changed.inputId,'old drag does not replace the current native source');
    await assert.rejects(invoke(player,'player.seekQueue',{ratio:.5,expectedPlanRevision:seeked.queue.planRevision}),/播放队列已改变/);
  }finally{player?.close();await s.close();}
});

test('independent prepared tickets survive interleaved chunks and discarding one never stops active playback',native,async()=>{
  const s=await setup({videoCount:3,videoDuration:20});let player;
  const prepare=(ticket,reset,ids)=>command(s.app,'playlist.prepare',{ticket,reset,items:ids.map(id=>({id,title:id,duration:20})),options:{fullLength:true}});
  try{
    await prepare('draft-a',true,['video-0']);await prepare('draft-b',true,['video-2']);
    assert.equal((await prepare('draft-a',false,['video-1'])).count,2,'another ticket cannot invalidate an earlier draft or its later chunks');
    await command(s.app,'play',{playlist:'draft-b',id:'video-2',title:'B'});player=await target(s.app,'rhvideo-player.html');
    const first=await invoke(player,'player.state');assert.equal(first.queue.id,'video-2');assert.equal(first.queue.total,1);
    await prepare('discarded-draft',true,['video-0']);assert.equal((await command(s.app,'playlist.discard',{ticket:'discarded-draft'})).removed,true);assert.equal((await command(s.app,'playlist.discard',{ticket:'discarded-draft'})).removed,false);
    assert.equal((await invoke(player,'player.state')).inputId,first.inputId,'draft cleanup is not a player-close action');
    await command(s.app,'play',{playlist:'draft-a',id:'video-1',title:'A'});const current=await invoke(player,'player.state');assert.equal(current.queue.total,2);assert.equal(current.queue.id,'video-1');
    await assert.rejects(command(s.app,'play',{playlist:'discarded-draft',id:'video-0',title:'Discarded'}),/准备已失效/);assert.equal((await invoke(player,'player.state')).inputId,current.inputId);
  }finally{player?.close();await s.close();}
});

test('a delayed screenshot switch cannot play, favorite or mark the old target; fast arrows retain their intended order',native,async()=>{
  const s=await setup();let player;
  try{
    await s.view.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:7});
    await until(()=>s.view.evaluate("document.getElementById('full-image').naturalWidth>0"),'decoded old screenshot');
    // Hold only the worker transport for frame 8. Real parsing/resolution and
    // native playback are unchanged; frame 9 may complete ahead of this read.
    await s.view.evaluate("window.__imagePost=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){if(message.action==='query'&&message.args.kind==='gallery'&&message.args.offset===8&&!message.args.allKeys){window.__heldImage={worker:this,message,rest};return;}return window.__imagePost.call(this,message,...rest);};window.__imageFirst=RHFilesAPI.invoke('rhvideo.image.step',{direction:1});true");
    await until(()=>s.view.evaluate('!!window.__heldImage'),'delayed real image query');
    const pending=await invoke(s.view,'image.state');assert.equal(pending.loading,true);assert.equal(pending.index,7);assert.equal(pending.requestedIndex,8);assert.equal(pending.current.videoId,'video-0');
    const point=await s.view.evaluate("(()=>{const r=document.getElementById('full-image').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await s.view.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await s.view.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    for(const name of ['image.playVideo','image.favorite','selection.markCurrent'])await assert.rejects(invoke(s.view,name),/正在切换/);
    assert.equal((await invoke(s.view,'preview.pending')).items.length,0);assert.equal(s.fixture.favorites.size,0);assert.equal(s.fixture.requests.filter(r=>r.path.endsWith('/play')).length,0,'clicking a pending screenshot must not launch its previous video');
    await invoke(s.view,'image.step',{direction:1});const latest=await invoke(s.view,'image.state');assert.equal(latest.index,9);assert.equal(latest.loading,false);assert.equal(latest.current.videoId,'video-1');
    await s.view.evaluate('Worker.prototype.postMessage=window.__imagePost;window.__imagePost.call(window.__heldImage.worker,window.__heldImage.message,...window.__heldImage.rest);true');
    assert.equal((await s.view.evaluate('window.__imageFirst')).stale,true);assert.equal((await invoke(s.view,'image.state')).index,9);
    await invoke(s.view,'image.playVideo');player=await target(s.app,'rhvideo-player.html');assert.equal((await invoke(player,'player.state')).queue.id,'video-1');
    await until(async()=>(await invoke(player,'player.state')).renderedFrames>0,'actual new screenshot source frame',25000);
  }finally{player?.close();await s.close();}
});

test('slideshow preview marks use the same one-shot close lifecycle as image and video previews',native,async()=>{
  const s=await setup();
  try{
    await invoke(s.view,'category',{kind:'picture'});
    await invoke(s.view,'viewer.open',{mode:'slideshow',source:'picture'});
    await until(()=>s.view.evaluate("document.querySelector('#wb-viewer .wb-slide img')?.naturalWidth>0"),'real slideshow picture');
    await invoke(s.view,'viewer.toggle');
    await invoke(s.view,'selection.markCurrent');
    const marks=await invoke(s.view,'preview.pending');assert.equal(marks.items.length,1);assert.equal(s.fixture.trash.length,0);
    await invoke(s.view,'panel.close',{id:'wb-viewer'});
    await until(async()=>{const r=await invoke(s.view,'preview.state');return r?.completed===1&&!r.running;},'closing slideshow commits its mark');
    assert.equal(s.fixture.trash[0].id,marks.items[0].id);assert.equal(s.fixture.trash[0].media_type,'picture');
    await invoke(s.view,'panel.close',{id:'wb-viewer'});await sleep(100);
    assert.equal(s.fixture.requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/trash/picture/'+marks.items[0].id).length,1);
  }finally{await s.close();}
});

test('the screenshot collection scrubber, Home/End, wheel and swipe navigate images rather than video time',async()=>{
  const s=await setup({picturesOnly:true,pictureCount:80});
  const key=async(name,code,eventCode=name)=>{await s.view.send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:eventCode,windowsVirtualKeyCode:code});await s.view.send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:eventCode,windowsVirtualKeyCode:code});};
  try{
    await s.view.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    assert.deepEqual(await invoke(s.view,'image.state'),{opened:false,loading:false,requestedIndex:null,previewId:null,index:0,total:0,current:null},'closed preview state is valid JSON');
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:0});
    const count=(await invoke(s.view,'image.state')).total;assert.equal(count,32);
    await until(()=>s.view.evaluate("document.getElementById('full-image').complete&&document.getElementById('full-image').naturalWidth>0"),'first screenshot actually decoded');
    await s.view.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await s.view.evaluate("window.__imageKeys=[];document.addEventListener('keydown',event=>window.__imageKeys.push({key:event.key,code:event.code,target:event.target.tagName,active:document.activeElement?.id,prevented:event.defaultPrevented}),true)");
    assert.equal(await s.view.evaluate("document.activeElement?.classList.contains('image-stage')"),true,'opening the preview puts keyboard focus on its navigable region, not an old page input');
    await key('End',35);await until(async()=>(await invoke(s.view,'image.state')).index===count-1,'End selects the last screenshot');
    await key('Home',36);await until(async()=>(await invoke(s.view,'image.state')).index===0,'Home selects the first screenshot');
    await invoke(s.view,'shortcuts.set',{scope:'image',command:'next',combo:'KeyN'});
    await key('ArrowRight',39);await until(()=>s.view.evaluate("window.__imageKeys.some(k=>k.code==='ArrowRight')"),'old key actually delivered');
    assert.equal((await invoke(s.view,'image.state')).index,0,'remapped keys must not fall through to the obsolete arrow binding');
    await key('n',78,'KeyN');await until(async()=>(await invoke(s.view,'image.state')).index===1,'custom image shortcut navigates');
    await invoke(s.view,'shortcuts.reset');await invoke(s.view,'image.seek',{ratio:0});
    const slider=await s.view.evaluate("(()=>{const r=document.getElementById('image-collection-seek').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await s.view.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...slider});await s.view.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...slider});
    await until(async()=>{const v=await invoke(s.view,'image.state');return v.index>0&&v.index<count-1;},'pointer scrubber reaches a middle frame');
    const ratio=await s.view.evaluate("Number(document.getElementById('image-collection-seek').value)/1000");assert.equal((await invoke(s.view,'image.state')).index,Math.round(ratio*(count-1)));
    await invoke(s.view,'image.seek',{ratio:0});
    const point=await s.view.evaluate("(()=>{const r=document.querySelector('.image-stage').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await s.view.send('Input.dispatchMouseEvent',{type:'mouseWheel',deltaX:0,deltaY:-120,...point});await until(async()=>(await invoke(s.view,'image.state')).index===count-1,'wheel wraps to previous screenshot');
    await invoke(s.view,'image.seek',{ratio:0});
    await s.view.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await s.view.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:1,radiusY:1,force:1,id:1}]});
    await s.view.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x-100,y:point.y,radiusX:1,radiusY:1,force:1,id:1}]});
    await s.view.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await until(async()=>(await invoke(s.view,'image.state')).index===1,'horizontal touch swipe reaches next screenshot');
    assert.equal(s.fixture.requests.filter(r=>r.path.endsWith('/play')).length,0,'collection navigation must not open video streams');
    await invoke(s.view,'image.favorite');assert(s.fixture.favorites.has('video:video-0'),'a screenshot star favorites its video, not the frame ID');
    assert.deepEqual((await invoke(s.view,'ui.contract')).missing,[]);
    for(const [width,height]of [[800,550],[360,800]]){
      await s.view.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await s.view.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const outside=await s.view.evaluate("(()=>{const d=document.getElementById('image-dialog').getBoundingClientRect();return [...document.querySelectorAll('#image-dialog button,#image-dialog input')].filter(n=>n.getClientRects().length).filter(n=>{const r=n.getBoundingClientRect();return r.top<d.top||r.bottom>d.bottom+1||r.left<d.left||r.right>d.right+1}).map(n=>n.id||n.textContent)})()");
      assert.deepEqual(outside,[],`all preview controls are reachable at ${width}x${height}`);
      const shot=await s.view.send('Page.captureScreenshot',{format:'png'}),file=path.join(s.app.artifactDir,`rhvideo-image-navigation-${width}.png`);fs.writeFileSync(file,Buffer.from(shot.data,'base64'));console.log(JSON.stringify({imagePreviewScreenshot:file}));
    }
    await invoke(s.view,'image.close');await invoke(s.view,'panel.close',{id:'wb-gallery'});const pictures=await invoke(s.view,'category',{kind:'picture'});
    await invoke(s.view,'media.open',{kind:'picture',id:pictures.items[0].id});await invoke(s.view,'image.seek',{ratio:1});const last=(await invoke(s.view,'image.state')).current;
    assert(!pictures.items.some(item=>item.id===last.id),'favorite target is outside the visible card page');
    await invoke(s.view,'image.favorite');assert(s.fixture.favorites.has('picture:'+last.id));assert.equal(await s.view.evaluate("document.getElementById('wb-image-favorite').getAttribute('aria-pressed')"),'true');
    await invoke(s.view,'image.close');await invoke(s.view,'image.preview',{path:'/storage/pictures/0.svg',title:'任务图片'});
    assert.equal((await invoke(s.view,'image.state')).current,null,'task enlargement uses its own panel, not the catalog preview queue');
    await invoke(s.view,'panel.close',{id:'wb-image-preview'});await invoke(s.view,'trash.preview',{path:'/storage/pictures/0.svg',title:'暂存图片'});
    assert.deepEqual((await invoke(s.view,'image.state')).current,{id:null,kind:null,videoId:null,seconds:null},'non-catalog trash previews also expose serializable state');
  }catch(error){console.log(JSON.stringify({scenario:'image input navigation',state:await invoke(s.view,'image.state').catch(diagnosticError=>({diagnosticError:String(diagnosticError)})),ui:await s.view.evaluate("({keys:window.__imageKeys,notice:document.getElementById('notice').textContent,focused:document.hasFocus(),active:document.activeElement?.outerHTML.slice(0,300),dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id)})").catch(diagnosticError=>({diagnosticError:String(diagnosticError)}))}));throw error;}
  finally{await s.close();}
});

test('full-length playback with missing catalog duration is not cut off at the short segment fallback',native,async()=>{
  const s=await setup({videoMetadataDuration:0});let player;
  try{
    await invoke(s.view,'preferences.set',{key:'fullLength',value:true});
    await invoke(s.view,'playlist.start');player=await target(s.app,'rhvideo-player.html');
    const initial=await invoke(player,'player.state');assert.equal(initial.queue.segmentDuration,0);assert.equal(initial.queue.segmentLengthMs,86400000,'reference full-length uses a one-day unknown-duration guard, not the three-second segment setting');
    await until(async()=>(await invoke(player,'player.state')).renderedFrames>0,'unknown-duration source actually displays frames',25000);
    await invoke(player,'player.control',{command:'pause'});
    await invoke(player,'player.options',{fullLength:false});assert.equal((await invoke(player,'player.state')).queue.segmentLengthMs,3000);
    await invoke(player,'player.options',{fullLength:true});assert.equal((await invoke(player,'player.state')).queue.segmentLengthMs,86400000,'live options use the same reference fallback as initial preparation');
    await invoke(player,'player.control',{command:'seek',value:6000});await invoke(player,'player.control',{command:'resume'});
    await until(async()=>{const v=await invoke(player,'player.state');assert.equal(v.queue?.id,initial.queue.id,'the original source must remain active beyond three seconds');return v.renderedFrames>0&&v.decoderPositionMs>=7000;},'full-length source continues past short-segment cutoff',20000);
  }finally{player?.close();await s.close();}
});

test('native-input public APIs bind single and grid intents to exact decoder instances and expose group seeking',native,async()=>{
  const s=await setup({galleryVideoCount:6});let player,grid;
  try{
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    const first=await until(async()=>{const value=await invoke(player,'player.state');return value.renderedFrames>0?value:null;},'single native frame before input',25000);assert(Number.isSafeInteger(first.inputId));
    const input=async(intent,inputId)=>(invoke(player,'player.input',{inputId:inputId??(await invoke(player,'player.state')).inputId,intent}));
    await input('toggle');await until(async()=>(await invoke(player,'player.state')).state===4,'native pause intent');
    await input('toggle');await until(async()=>(await invoke(player,'player.state')).state===3,'native resume intent');
    const second=await input('next');assert.equal(second.queue.index,1);assert.notEqual(second.inputId,first.inputId);
    assert.equal((await input('toggle',first.inputId)).stale,true,'late input from a retired decoder never toggles its replacement');
    await assert.rejects(command(s.app,'player.control',{command:'pause',expectedInput:first.inputId}),/旧操作未执行/);
    await assert.rejects(command(s.app,'preview.mark',{id:first.queue.id,kind:'video',title:first.title,expectedInput:first.inputId}),/旧操作未执行/);
    const again=await input('previous');assert.equal(again.queue.id,first.queue.id);assert.notEqual(again.inputId,first.inputId,'same-video ABA still creates a new decoder-input lease');
    assert.equal((await input('next',first.inputId)).stale,true);
    await assert.rejects(command(s.app,'player.close',{expectedInput:first.inputId}),/旧操作未执行/);
    assert.equal((await input('last')).queue.index,5);assert.equal((await input('first')).queue.index,0);
    await command(s.app,'player.close');player.close();player=null;
    await invoke(s.view,'preferences.set',{key:'gridCount',value:4});
    await invoke(s.view,'grid.open');grid=await target(s.app,'rhvideo-grid.html');
    const state=await invoke(grid,'grid.state'),old=state.cells[1].inputId;
    const guard={target:0,inputTarget:0,expectedInput:state.cells[0].inputId};
    await invoke(s.view,'grid.favorite',guard);assert(s.fixture.favorites.has('video:'+state.cells[0].id));
    await invoke(s.view,'grid.favorite',guard);assert.equal(s.fixture.favorites.size,0);
    await invoke(s.view,'grid.mark',{...guard,enabled:true});assert.equal((await invoke(grid,'grid.state')).cells[0].marked,true);
    await invoke(s.view,'grid.mark',{...guard,enabled:false});assert.equal((await invoke(grid,'grid.state')).cells[0].marked,false);
    console.log(JSON.stringify({sharedGridActions:'workbench and controller observe the same favorite/mark state',input:guard.expectedInput}));
    assert.deepEqual((await invoke(grid,'grid.seekGroup',{ratio:0})).cells.map(v=>v.inputId),state.cells.map(v=>v.inputId),'seeking to the current group must not restart its decoders');
    assert.equal((await invoke(grid,'grid.input',{target:1,inputId:old,intent:'expand'})).expanded,1);
    assert.equal((await invoke(grid,'grid.input',{target:1,inputId:old,intent:'close'})).expanded,null,'Escape restores an expanded cell before closing the entire grid');
    const next=await invoke(grid,'grid.input',{target:1,inputId:old,intent:'next'});assert.equal(next.offset,4);
    assert.equal((await invoke(grid,'grid.input',{target:1,inputId:old,intent:'expand'})).stale,true);
    assert.equal((await invoke(grid,'grid.input',{target:1,inputId:old,intent:'mark'})).stale,true,'late Delete cannot mark the new cell that reused this index');
    await assert.rejects(command(s.app,'grid.expand',{target:1,inputTarget:1,expectedInput:old}),/旧操作未执行/);
    await assert.rejects(command(s.app,'grid.favorite',{target:1,inputTarget:1,expectedInput:old}),/旧操作未执行/);
    assert.equal((await invoke(grid,'grid.seekGroup',{ratio:0})).offset,0);
    assert.equal((await invoke(grid,'grid.seekGroup',{ratio:.5})).offset,4,'the group scrubber rounds collection positions, not video seconds');
    const current=await invoke(grid,'grid.state');assert.equal((await invoke(grid,'grid.input',{target:0,inputId:current.cells[0].inputId,intent:'first'})).offset,0);
    assert.deepEqual((await invoke(grid,'ui.contract')).missing,[]);
    await grid.send('Emulation.setFocusEmulationEnabled',{enabled:true});await grid.send('Emulation.setDeviceMetricsOverride',{width:700,height:196,deviceScaleFactor:1,mobile:false});
    await grid.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.deepEqual(await grid.evaluate("[...document.querySelectorAll('#controls button,#controls input,#controls select')].filter(n=>n.getClientRects().length).filter(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1}).map(n=>n.id)"),[],'group-position controls fit inside the native control strip');
    const point=await grid.evaluate("(()=>{const r=document.getElementById('group-seek').getBoundingClientRect();return {x:r.x+r.width*.8,y:r.y+r.height/2}})()");
    await grid.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await grid.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    await until(async()=>(await invoke(grid,'grid.state')).offset===4,'actual group scrubber UI invokes collection seek');
  }finally{player?.close();grid?.close();await s.close();}
});

test('default grid uses the gallery pool and reference layouts, retains per-cell state only while open, and restores the saved group',native,async()=>{
  const s=await setup({videoCount:8,galleryVideoCount:6,portraitIndices:[0,1,3],videoDuration:18});let grid,other,phase='initial group';
  try{
    await invoke(s.view,'sort',{value:'nameAsc'});
    await invoke(s.view,'selection.toggle',{kind:'video',id:'video-7',enabled:true});
    const ordered=s.fixture.videos.slice(0,6); // Reference loadGrid preserves server order; list sorting is independent.
    const groups=Grid.groups(Grid.entries(ordered.map(v=>({videoId:v.id})),s.fixture.videos));assert(groups.length>1);assert.equal(groups.flat().length,6);
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:5});
    await invoke(s.view,'grid.open');grid=await target(s.app,'rhvideo-grid.html');
    const first=await until(async()=>{const v=await invoke(grid,'grid.state');return v.cells.every(c=>c.renderedFrames>0&&c.durationMs>0)?v:null;},'default aspect-ratio group frames',25000);
    console.log(JSON.stringify({gridRenderers:[...new Set(first.cells.map(c=>c.renderer))],requestedCompatibility:process.env.RHFILES_VLC_COMPATIBILITY??null}));
    if(process.env.RHFILES_EXPECT_RENDERER)assert(first.cells.every(c=>c.renderer===process.env.RHFILES_EXPECT_RENDERER),'acceptance must exercise the explicitly requested renderer');
    assert.equal(first.total,6,'the full video list and its multiselection must not replace the gallery pool');assert.equal(first.groupTotal,groups.length);
    assert.deepEqual(first.cells.map(c=>c.id),groups[0].map(v=>v.id),'the gallery browsing cursor must not rotate the multi-video starting pool');
    assert.deepEqual(first.cells.map(c=>c.rect),Grid.rects(groups[0].map(v=>v.aspectRatio)));
    assert(first.cells.every(c=>c.volume===100&&!c.muted));
    await invoke(grid,'grid.control',{target:0,command:'pause'});
    await invoke(grid,'grid.control',{target:0,command:'seek',value:5000});
    await invoke(grid,'grid.control',{target:0,command:'rate',value:1.5});
    await invoke(grid,'grid.control',{target:0,command:'volume',value:37});
    await invoke(grid,'grid.control',{target:0,command:'mute'});
    const saved=await until(async()=>{const v=(await invoke(grid,'grid.state')).cells[0];return v.state===4&&v.decoderPositionMs>=4800?v:null;},'actual paused cell position');
    const acceptedPause=await invoke(grid,'grid.control',{target:-1,command:'pause'});
    assert(acceptedPause.cells.every(c=>c.pauseRequested===true),'paging must remember the accepted pause even before the decoder acknowledges it');
    const next=await invoke(grid,'grid.page',{direction:1});assert.deepEqual(next.cells.map(c=>c.id),groups[1].map(v=>v.id));
    phase='restore paused group while controls are frozen';await withSuspendedControls(grid,async()=>{
      // A frozen page cannot answer its own JS bridge. Invoke the same native
      // action from its owner, without waking or reading the controls page.
      await command(s.app,'grid.page',{direction:-1});
      await sleep(first.cells.some(c=>c.renderer==='native-hardware-auto')?12000:2500);
      const backgroundState=await command(s.app,'grid.state'),background=backgroundState.cells;console.log(JSON.stringify({backgroundMonitorTicks:backgroundState.monitorTicks,cells:background.map(v=>({phase:v.restorePhase,frames:v.renderedFrames,state:v.state,position:v.positionMs}))}));assert(background.every(v=>!v.restoringPausedFrame&&v.renderedFrames>0&&v.state===4),'every paused cell must restore without any controls WebView timers or state polling');
    });
    phase='read restored paused cell';const restored=await until(async()=>{const v=(await invoke(grid,'grid.state')).cells[0];return v.state===4&&!v.restoringPausedFrame&&v.pendingSeekMs===null&&v.renderedFrames>0&&Math.abs(v.positionMs-saved.positionMs)<500?v:null;},'paused cell displays an actual restored frame after paging',25000);
    assert.equal(restored.volume,37);assert.equal(restored.muted,true);assert.equal(restored.rate,1.5);assert.equal(restored.seekError,null);assert.notEqual(restored.inputId,saved.inputId);
    phase='page after paused restore';const boundary=await invoke(grid,'grid.page',{direction:-1});assert.equal(boundary.cells[0].inputId,restored.inputId,'clamped navigation cannot restart the current group');
    await invoke(grid,'grid.page',{direction:1});
    // Observe close from the owner: the closed WebView cannot deliver its own
    // final CDP response after destroying its transport.
    phase='close first grid';await command(s.app,'grid.close');grid.close();grid=null;
    await until(async()=>!(await(await fetch(`http://127.0.0.1:${s.app.port}/json/list`)).json()).some(t=>new URL(t.url).pathname.endsWith('/rhvideo-grid.html')),'closed grid window retired');
    phase='reopen saved group';await invoke(s.view,'grid.open');grid=await target(s.app,'rhvideo-grid.html');
    const reopened=await invoke(grid,'grid.state');assert.equal(reopened.groupIndex,1);assert.deepEqual(reopened.cells.map(c=>c.id),groups[1].map(v=>v.id));
    phase='return to fresh first group';await invoke(grid,'grid.page',{direction:-1});
    const fresh=await until(async()=>{const v=(await invoke(grid,'grid.state')).cells[0];return v.renderedFrames>0?v:null;},'fresh viewer resumes default cell playback',25000);
    assert.equal(fresh.volume,100);assert.equal(fresh.muted,false);assert.equal(fresh.rate,1);assert.notEqual(fresh.state,4);assert(fresh.decoderPositionMs<4800,'close/reopen restores the group, not old per-cell playback state');
    phase='favorite and mark controls';await invoke(grid,'grid.target',{index:0});await invoke(grid,'grid.favorite',{target:0});assert(s.fixture.favorites.has('video:'+fresh.id));
    await invoke(grid,'grid.favorite',{target:0});assert.equal(s.fixture.favorites.size,0);
    await invoke(grid,'grid.input',{target:0,inputId:fresh.inputId,intent:'mark'});assert.equal((await invoke(grid,'grid.state')).cells[0].marked,true);assert.equal(s.fixture.trash.length,0,'marking does not delete a source immediately');
    await invoke(grid,'grid.mark',{target:0});assert.equal((await invoke(grid,'grid.state')).cells[0].marked,false);
    assert.deepEqual((await invoke(grid,'ui.contract')).missing,[]);
    phase='supersede in-flight paused restore';await invoke(grid,'grid.control',{target:0,command:'pause'});await invoke(grid,'grid.control',{target:0,command:'seek',value:8000});
    await invoke(grid,'grid.page',{direction:1});const priming=await invoke(grid,'grid.page',{direction:-1});
    assert.equal(priming.cells[0].restoringPausedFrame,true);assert.equal(priming.cells[0].decoderVolume,0,'priming a paused frame must never emit audio');
    await invoke(grid,'grid.control',{target:0,command:'seek',value:9000});await invoke(grid,'grid.control',{target:0,command:'resume'});
    await until(async()=>{const v=(await invoke(grid,'grid.state')).cells[0];return v.state===3&&!v.restoringPausedFrame&&v.pendingSeekMs===null&&v.renderedFrames>0&&v.decoderPositionMs>=8800;},'explicit resume supersedes pending pause restoration but retains the latest seek target',25000);
    const oldSession=await invoke(grid,'grid.state');
    other=await rhvideoFixture({videoFile:path.join(s.app.directory,'behavior.mp4'),videoDuration:18,videoCount:6,galleryVideoCount:6});
    phase='switch account and reuse window';await invoke(s.view,'connection.connect',{server:other.url,username:'preview',password:'fixture-only'});await invoke(s.view,'grid.open');
    const switched=await until(async()=>{const v=await invoke(grid,'grid.state');return v.generation>oldSession.generation?v:null;},'reused grid adopts the new account session');
    assert.equal(switched.groupIndex,0,'another server must not inherit this server’s saved group');
    await invoke(grid,'grid.favorite',{target:0});assert(other.favorites.has('video:'+switched.cells[0].id));assert.equal(s.fixture.favorites.size,0,'the reused controls must never write to their former server');
    phase='close new-account preview';await invoke(grid,'grid.mark',{target:0});await command(s.app,'grid.close');grid.close();grid=null;
    await until(()=>other.trash.length===1,'closing the native grid commits its preview mark');assert.equal(other.trash[0].id,switched.cells[0].id);
    await command(s.app,'grid.close');await sleep(100);assert.equal(other.trash.length,1,'a duplicate/late close cannot submit the mark twice');
  }catch(error){console.log(JSON.stringify({scenario:'reference default grid',phase,state:await command(s.app,'grid.state').catch(e=>({error:String(e)}))}));throw error;}
  finally{grid?.close();await s.close();await other?.close();}
});

test('grid repeats normal EOF within the same native input but never retries a failed media request',native,async()=>{
  const s=await setup({videoCount:2,galleryVideoCount:2,videoDuration:6});let grid;
  try{
    await invoke(s.view,'grid.open');grid=await target(s.app,'rhvideo-grid.html');
    const before=await until(async()=>{const v=await invoke(grid,'grid.state');return v.cells.every(c=>c.renderedFrames>0&&c.durationMs>5000)?v:null;},'looping grid streams ready',25000);
    await invoke(grid,'grid.control',{target:0,command:'volume',value:23});await invoke(grid,'grid.control',{target:0,command:'rate',value:1.5});
    await invoke(grid,'grid.control',{target:0,command:'seek',value:before.cells[0].durationMs-800});
    await until(async()=>(await invoke(grid,'grid.state')).cells[0].decoderPositionMs>=before.cells[0].durationMs-1000,'actual near-EOF decoder position');
    const looped=await until(async()=>{const v=(await invoke(grid,'grid.state')).cells[0];assert.equal(v.inputId,before.cells[0].inputId,'normal EOF must not tear down and recreate the input');return v.decoderPositionMs<2000&&v.state===3?v:null;},'native EOF loop without decoder replacement',12000);
    assert.equal(looped.volume,23);assert.equal(looped.rate,1.5);assert(looped.renderedFrames>=before.cells[0].renderedFrames);
    assert(looped.positionMs<2500,'the visible progress must wrap too, not remain stuck at the previous EOF');
  }finally{grid?.close();await s.close();}
  const failed=await setup({videoCount:2,galleryVideoCount:2,beforeMedia:({image})=>image?null:{status:503,detail:'Offline test source'}});let failedGrid;
  try{
    await invoke(failed.view,'grid.open');failedGrid=await target(failed.app,'rhvideo-grid.html');
    await until(async()=>(await invoke(failedGrid,'grid.state')).cells.every(c=>[6,7].includes(c.state)),'failed grid input is terminal',20000);
    assert.match(await failedGrid.evaluate("document.getElementById('summary').textContent"),/加载失败/,'terminal playback failure must be visible, not only a zero frame counter');
    const requests=failed.fixture.requests.filter(r=>r.path.endsWith('/play')).length;
    assert(requests>=2);await sleep(2500);
    assert.equal(failed.fixture.requests.filter(r=>r.path.endsWith('/play')).length,requests,'EOF looping must not turn failure into an invisible network retry loop');
  }finally{failedGrid?.close();await failed.close();}
});

test('changing a segment while the new stream has no metadata defers one bounded seek instead of failing CI or seeking an old input',native,async()=>{
  let blocked=false,release;const gate=new Promise(resolve=>release=resolve);
  const s=await setup({portraitIndices:[0,2,3],videoDuration:20,beforeMedia:async({image})=>{if(!image&&blocked)await gate;return null;}});let player;
  try{
    await invoke(s.view,'playlist.sequential');player=await target(s.app,'rhvideo-player.html');
    const first=await until(async()=>{const value=await invoke(player,'player.state');return value.renderedFrames>0?value:null;},'initial metadata/frame',25000);
    blocked=true;await invoke(player,'player.options',{portraitOnly:true});
    await until(async()=>{const value=await invoke(player,'player.state');return value.inputId!==first.inputId&&value.durationMs===0;},'new decoder awaiting the gated stream');
    await invoke(player,'player.options',{fullLength:false,segment:2});
    const pending=await invoke(player,'player.state');assert(pending.pendingSeekMs>=1000);assert.equal(pending.pendingSeekMs,pending.queue.segmentStartMs);assert.equal(pending.seekError,null);
    release();blocked=false;
    await until(async()=>{const value=await invoke(player,'player.state');assert.equal(value.inputId,pending.inputId);return value.pendingSeekMs===null&&value.decoderPositionMs>=pending.pendingSeekMs-200&&value.renderedFrames>0;},'single deferred seek applied to the actual new native stream',25000);
    assert.equal((await invoke(player,'player.state')).seekError,null);
  }finally{release();player?.close();await s.close();}
});

test('closing a parent preview stops its video; an old return cannot navigate a later preview of the same screenshot',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:0});
    await invoke(s.view,'image.playFrame');player=await target(s.app,'rhvideo-player.html');
    const old=await invoke(player,'player.state');
    await invoke(s.view,'image.close');player.close();player=null;
    assert.equal((await command(s.app,'player.state')).opened,false,'closing the parent ends the complete preview stack');
    await invoke(s.view,'gallery.inspect',{index:0});
    const image=await invoke(s.view,'image.state');assert.notEqual(image.previewId,old.queue.options.parentPreview);
    const stale=await invoke(s.view,'image.returnFromVideo',{generation:old.generation,parentKey:old.queue.options.parentKey,parentPreview:old.queue.options.parentPreview,direction:1});
    assert.equal(stale.stale,true);assert.equal((await invoke(s.view,'image.state')).index,0);
  }finally{player?.close();await s.close();}
});

test('a reused player window adopts the new native session and never sends favorite writes to its former server',native,async()=>{
  const s=await setup();let player,other;
  try{
    await invoke(s.view,'media.open',{kind:'video',id:'video-0'});player=await target(s.app,'rhvideo-player.html');
    const old=await invoke(player,'player.state');
    other=await rhvideoFixture({videoFile:path.join(s.app.directory,'behavior.mp4'),videoDuration:14,videoCount:6});
    await invoke(s.view,'connection.connect',{server:other.url,username:'preview',password:'fixture-only'});
    await invoke(s.view,'media.open',{kind:'video',id:'video-1'});
    await until(async()=>{const v=await invoke(player,'player.state');return v.generation>old.generation&&v.queue?.id==='video-1';},'existing controls adopt the new server session');
    await invoke(player,'player.favorite');assert(other.favorites.has('video:video-1'));assert.equal(s.fixture.favorites.size,0);
  }finally{player?.close();await s.close();await other?.close();}
});

test('clicking the screenshot itself plays its source from the start; the explicit frame action seeks to that screenshot',native,async()=>{
  const s=await setup();let player;
  try{
    await invoke(s.view,'gallery.open');await invoke(s.view,'gallery.inspect',{index:3});
    const image=await invoke(s.view,'image.state');assert.equal(image.current.seconds,6);
    await s.app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
    await until(()=>s.view.evaluate("document.getElementById('full-image').complete&&document.getElementById('full-image').naturalWidth>0"),'clicked screenshot actually decoded');
    await s.view.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const point=await s.view.evaluate("(()=>{const r=document.getElementById('full-image').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await s.view.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await s.view.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    player=await target(s.app,'rhvideo-player.html');const start=await until(async()=>{const value=await invoke(player,'player.state');return value.renderedFrames>0?value:null;},'actual source frame from screenshot click',25000);assert.equal(start.queue.id,image.current.videoId);assert(start.positionMs<3000,'the reference screenshot click plays the source, not the selected frame timestamp');
    await command(s.app,'player.back');player.close();player=null;
    // Native close emits the parent-return event asynchronously. Do not issue
    // a second play while that image is still resolving its new capability.
    await until(async()=>{const value=await invoke(s.view,'image.state');return value.opened&&!value.loading&&value.current?.id===image.current.id;},'parent screenshot ready before a new play');
    await invoke(s.view,'image.playFrame');player=await target(s.app,'rhvideo-player.html');const frame=await until(async()=>{const value=await invoke(player,'player.state');return value.renderedFrames>0&&value.positionMs>=5900?value:null;},'actual explicit screenshot-time frame',25000);assert.equal(frame.queue.id,image.current.videoId);
  }finally{player?.close();await s.close();}
});
