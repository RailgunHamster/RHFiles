// Actual minified APK and native plane. No phone, browser playback fallback,
// audio/codec experiments, response substitution or operation retry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root} from './source.mjs';
import {admitLocalClockDevice} from './rhvideo-local-clock.mjs';
import {androidSession,until} from './android-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from './rhvideo-fixture.mjs';
import {holdPresentationReplyScript,makePresentationMarkers,fourPresentationMarkers,exercisePresentationInputs} from './rhvideo-presentation-input.mjs';
import {exercisePresentationModal} from './rhvideo-presentation-modal.mjs';
import {androidApkRuntimes} from './android-apk-runtime.mjs';
import {observeMediaRevealScript,exerciseMediaReveal} from './rhvideo-media-reveal.mjs';

export function presentationOptions(extra){
 assert(Array.isArray(extra)&&new Set(extra).size===extra.length&&extra.every(v=>['--installed','--modal','--reveal'].includes(v)),'Only unique --installed, --modal and --reveal flags are allowed');
 assert(!(extra.includes('--modal')&&extra.includes('--reveal')),'Choose exactly one business scenario');
 return {installedOnly:extra.includes('--installed'),modal:extra.includes('--modal'),reveal:extra.includes('--reveal')};
}

async function main(){
 const [serial,apk,...extra]=process.argv.slice(2);assert(/^emulator-\d+$/.test(serial||''),'Only an explicit owned emulator is allowed');assert(apk,'Provide the exact normal APK snapshot');
 const {installedOnly,modal,reveal}=presentationOptions(extra);
 const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk'),adb=path.join(sdk,'platform-tools/adb.exe');
 const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2*1024*1024});
 admitLocalClockDevice(serial,run(['shell','getprop','ro.kernel.qemu']),run(['emu','avd','name']));assert.equal(run(['shell','getprop','sys.boot_completed']).trim(),'1');
 assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/);
 const actual=fs.realpathSync(apk),relative=path.relative(path.join(root,'test-artifacts'),actual),sha=b=>createHash('sha256').update(b).digest('hex');
 assert(relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&path.extname(actual)==='.apk','Use an APK snapshot in this worktree');
 const archive=path.join(root,'src-tauri/thirdparty/7z.exe');
 const aapt=fs.readdirSync(path.join(sdk,'build-tools')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(v=>path.join(sdk,'build-tools',v,'aapt.exe')).find(v=>fs.existsSync(v));assert(aapt,'Android aapt is required');
 androidApkRuntimes(execFileSync(aapt,['list',actual],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024}).split(/\r?\n/));
 for(const [entry,file]of [['assets/rhvideo/js/rhvideo-workbench.js','src/js/rhvideo-workbench.js'],['assets/rhvideo/js/rhvideo-client.js','src/js/rhvideo-client.js'],['assets/rhvideo/js/rhvideo-mobile.js','android/web/js/rhvideo-mobile.js']])assert.equal(sha(execFileSync(archive,['e','-so',actual,entry],{windowsHide:true,maxBuffer:8*1024*1024})),sha(fs.readFileSync(path.join(root,file))),'The APK must contain current '+file);
 const artifact=fs.mkdtempSync(path.join(root,'test-artifacts/rhvideo-presentation-'+(reveal?'reveal':modal?'modal':'input')+'-android-')),receipt={serial,apkSha256:sha(fs.readFileSync(actual)),installedOnly,modal,reveal,passed:false,artifact};let app,page,fixture,port;
 console.log('Android packaged media scenario: '+artifact);
 try{
  if(!installedOnly)run(['install','--no-incremental','-r',actual]);const installed=run(['shell','pm','path','com.railgunhamster.rhfiles']).trim().split(/\r?\n/);assert.equal(installed.length,1);assert.match(installed[0],/^package:\/data\/app\/[A-Za-z0-9_~+=./-]+\/base\.apk$/);assert.equal(run(['shell','sha256sum',installed[0].slice(8)]).slice(0,64),receipt.apkSha256,'Verify actual installed bytes');
  const movie=path.join(artifact,'markers.mp4');makePresentationMarkers(movie);fixture=await rhvideoFixture({videoFile:movie,videoCount:2,pictureCount:reveal?100:1,videoDuration:20});
  process.env.ANDROID_SDK_ROOT=sdk;app=await androidSession(serial);receipt.sessionArtifact=app.artifactDir;
  await app.evaluate('(RHFilesAPI.forPane?RHFilesAPI.forPane("active"):RHFilesAPI).invoke("rhvideo.open")');
  const pid=run(['shell','pidof','com.railgunhamster.rhfiles']).trim();assert.match(pid,/^\d+$/);receipt.pid=Number(pid);port=run(['forward','tcp:0','localabstract:webview_devtools_remote_'+pid]).trim();assert.match(port,/^\d+$/);
  const entry=await until(async()=>{const values=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(2000)})).json();return values.find(p=>p.type==='page'&&p.url==='https://appassets.androidplatform.net/rhvideo/rhvideo.html');},'exact owned native library');
  page=await cdpSession(entry,30000);await page.send('Page.enable');await until(()=>page.evaluate('document.readyState==="complete"&&typeof RHVideoWorkbench==="object"&&!!RHFilesAPI.list().find(a=>a.id==="rhvideo.viewer.video")'),'initial packaged workbench');
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:reveal?observeMediaRevealScript:holdPresentationReplyScript});await page.send('Page.reload');
  await until(()=>page.evaluate('typeof __qaPresentationNative==="function"&&!!RHFilesAPI.list().find(a=>a.id==="rhvideo.viewer.video")'),'packaged workbench and delivery-only shim');
  const positions=new Map();
  const started=performance.now();
  const checkFrame=async(label,state,hidden=false)=>{
   const box=await page.evaluate('(()=>{const r=document.querySelector("#wb-viewer .wb-viewer-surface").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewport:innerWidth};})()');
   await app.screenshot(label);const file=path.join(app.artifactDir,label+'.png'),png=fs.readFileSync(file);assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');
   const width=png.readUInt32BE(16),height=png.readUInt32BE(20);assert(width>0&&width<=4096&&height>0&&height<=4096);
   const pixels=execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-threads','1','-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,maxBuffer:64*1024*1024,timeout:15000});assert.equal(pixels.length,width*height*3);
   const colors=points=>points.map(([x,y])=>{assert(x>=0&&x<width&&y>=0&&y<height);return Array.from(pixels.subarray((y*width+x)*3,(y*width+x)*3+3));});
   let points=hidden?null:positions.get(state.inputId);
   if(!points){
    const scale=width/box.viewport,w=Math.min(box.width,box.height*640/360),h=w*360/640,x=(box.x+(box.width-w)/2)*scale,y=(box.y+(box.height-h)/2)*scale;
    // Account for the Activity's top inset once. Later captures must use these
    // SAME points, not search another image after a stale hide/resize command.
    for(let inset=0;inset<=height*.16;inset+=8){const candidate=Array.from({length:4},(_,i)=>[Math.floor(x+w*scale*(i%2===0?.25:.75)),Math.floor(y+h*scale*(i<2?.25:.75)+inset)]);if(candidate.every(([a,b])=>a>=0&&a<width&&b>=0&&b<height)&&fourPresentationMarkers(colors(candidate))){points=candidate;break;}}
    if(hidden){assert(!points,'Late native video must not cover the actual Android settings screen');return {hidden:true,width,height};}
    assert(points,'Actual Android screen must show all four native video markers');positions.set(state.inputId,points);
   }
   const samples=colors(points);assert(fourPresentationMarkers(samples),'Stale operations must not hide or move the real native frame');return {width,height,points,colors:samples};
  };
  const options={page,until,server:'http://10.0.2.2:'+new URL(fixture.url).port,receipt,onPhase:phase=>{(receipt.phases??=[]).push({phase,elapsedMs:Math.round(performance.now()-started)});fs.writeFileSync(path.join(artifact,'receipt.json'),JSON.stringify(receipt,null,2));console.log('Phase: '+phase);}};
  if(reveal){await exerciseMediaReveal(options);await app.screenshot('off-page-target-revealed');}
  else if(modal)await exercisePresentationModal({...options,checkHidden:(label,state)=>checkFrame(label,state,true),checkVisible:checkFrame});
  else await exercisePresentationInputs({...options,checkFrame});
 }catch(error){receipt.failure=String(error);process.exitCode=1;console.error(error);}
 finally{
  if(page)try{receipt.final=await page.evaluate('__qaPresentationNative("presentation.state").then(s=>({opened:s.opened,inputId:s.inputId,frames:s.renderedFrames,state:s.state}))');}catch(error){receipt.finalReadError=String(error.code||'unavailable');}
  if(app)try{await app.screenshot('presentation-input-final');}catch{}
  page?.close();try{app?.close();}catch(error){receipt.sessionCloseError=String(error);}
  if(port)try{run(['forward','--remove','tcp:'+port]);}catch{}
  try{run(['shell','am','force-stop','com.railgunhamster.rhfiles']);}catch(error){receipt.teardownError=String(error);}
  if(fixture){receipt.requests=fixture.requests.map(({method,path})=>({method,path}));receipt.transport=fixture.transport.snapshot();await fixture.close();}
  fs.writeFileSync(path.join(artifact,'receipt.json'),JSON.stringify(receipt,null,2));
 }
 if(receipt.passed&&process.exitCode!==1)console.log('PASS: '+(reveal?'actual off-page catalog target and decoded cover':modal?'actual native modal visibility and restored playback':'actual native input/late-reply/pixel protection')+' '+artifact);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
