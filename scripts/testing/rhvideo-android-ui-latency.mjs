// Diagnostic only: separate foreground work from background WebView delivery.
// Exact, already-installed QA APK; generated media only; never replay a write.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root} from './source.mjs';
import {androidSession,until} from './android-session.mjs';
import {admitLocalClockDevice} from './rhvideo-local-clock.mjs';
import {androidApkRuntimes} from './android-apk-runtime.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from './rhvideo-fixture.mjs';
import {makePresentationMarkers} from './rhvideo-presentation-input.mjs';

export function latencySummary(rows){
 assert(Array.isArray(rows)&&rows.length>0&&rows.length<=100);
 const durations=key=>rows.map(row=>{assert(Number.isFinite(row[key])&&row[key]>=0);return row[key];}).sort((a,b)=>a-b);
 const result={count:rows.length};
 for(const key of ['hostMs','rendererMs']){const v=durations(key);result[key]={minimum:v[0],median:v[Math.floor(v.length/2)],maximum:v.at(-1)};}
 return result;
}

async function main(){
 const [serial,apk,...extra]=process.argv.slice(2);assert.equal(extra.length,0);assert.match(serial||'',/^emulator-\d+$/);assert(apk,'Provide the exact installed normal QA APK');
 const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk'),adb=path.join(sdk,'platform-tools/adb.exe');
 const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});
 admitLocalClockDevice(serial,run(['shell','getprop','ro.kernel.qemu']),run(['emu','avd','name']));assert.equal(run(['shell','getprop','sys.boot_completed']).trim(),'1');
 assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/);
 const actual=fs.realpathSync(apk),relative=path.relative(path.join(root,'test-artifacts'),actual),sha=b=>createHash('sha256').update(b).digest('hex');
 assert(relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&path.extname(actual)==='.apk');
 const installed=run(['shell','pm','path','com.railgunhamster.rhfiles']).trim().split(/\r?\n/);assert.equal(installed.length,1);assert.match(installed[0],/^package:\/data\/app\/[A-Za-z0-9_~+=./-]+\/base\.apk$/);
 const apkSha256=sha(fs.readFileSync(actual));assert.equal(run(['shell','sha256sum',installed[0].slice(8)]).slice(0,64),apkSha256,'No install or runtime substitution');
 const aapt=fs.readdirSync(path.join(sdk,'build-tools')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(v=>path.join(sdk,'build-tools',v,'aapt.exe')).find(fs.existsSync);assert(aapt);
 androidApkRuntimes(execFileSync(aapt,['list',actual],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024}).split(/\r?\n/));
 const archive=path.join(root,'src-tauri/thirdparty/7z.exe');
 for(const [entry,file]of [['assets/rhvideo/js/rhvideo-workbench.js','src/js/rhvideo-workbench.js'],['assets/rhvideo/js/rhvideo-mobile.js','android/web/js/rhvideo-mobile.js']])assert.equal(sha(execFileSync(archive,['e','-so',actual,entry],{windowsHide:true,maxBuffer:8*1024*1024})),sha(fs.readFileSync(path.join(root,file))));
 const artifact=fs.mkdtempSync(path.join(root,'test-artifacts/rhvideo-android-ui-latency-')),receipt={diagnosticOnly:true,serial,apkSha256,rows:[],completed:false,budgetMs:180000};let app,page,fixture,port;
 const controller=new AbortController();
 const deadline=setTimeout(()=>{receipt.deadlineExceeded=true;controller.abort();try{app?.close();}catch{}try{run(['shell','am','force-stop','com.railgunhamster.rhfiles']);}catch{}},receipt.budgetMs);
 const save=()=>fs.writeFileSync(path.join(artifact,'receipt.json'),JSON.stringify(receipt,null,2));
 const sample=async(target,stage,label,expression)=>{
  const start=performance.now();
  assert(!controller.signal.aborted,'The original diagnostic budget expired; no action will be submitted');
  const result=await target.evaluate(`(async()=>{const start=performance.now();const before={hidden:document.hidden,focused:document.hasFocus()};const value=await (${expression});return {rendererMs:performance.now()-start,before,after:{hidden:document.hidden,focused:document.hasFocus()},value};})()`);
  const row={stage,label,hostMs:performance.now()-start,...result};receipt.rows.push(row);save();console.log(JSON.stringify({stage,label,hostMs:Math.round(row.hostMs),rendererMs:Math.round(row.rendererMs),hidden:result.before.hidden}));return result.value;
 };
 const invoke=(name,args={})=>'RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')';
 const calibrate=async(target,stage)=>{for(let i=0;i<3;i++)await sample(target,stage,'constant','42');for(let i=0;i<3;i++)await sample(target,stage,'read-state',invoke('state'));};
 console.log('Owned Android UI latency: '+artifact);
 try{
  const movie=path.join(artifact,'generated-markers.mp4');makePresentationMarkers(movie);fixture=await rhvideoFixture({videoFile:movie,videoCount:2,pictureCount:3,videoDuration:20});
  process.env.ANDROID_SDK_ROOT=sdk;const start=performance.now();app=await androidSession(serial);receipt.mainReadyHostMs=performance.now()-start;receipt.sessionArtifact=app.artifactDir;save();
  await app.evaluate('(RHFilesAPI.forPane?RHFilesAPI.forPane("active"):RHFilesAPI).invoke("rhvideo.open")');
  const pid=run(['shell','pidof','com.railgunhamster.rhfiles']).trim();assert.match(pid,/^\d+$/);receipt.pid=Number(pid);port=run(['forward','tcp:0','localabstract:webview_devtools_remote_'+pid]).trim();assert.match(port,/^\d+$/);
  const libraryStart=performance.now();const entry=await until(async()=>{const rows=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(2000)})).json();return rows.find(p=>p.type==='page'&&p.url==='https://appassets.androidplatform.net/rhvideo/rhvideo.html');},'owned packaged library');
  page=await cdpSession(entry,30000,{signal:controller.signal});await page.send('Runtime.enable');await until(()=>page.evaluate('document.readyState==="complete"&&!!globalThis.RHFilesAPI?.list().find(a=>a.id==="rhvideo.viewer.video")'),'actual library readiness');receipt.libraryReadyHostMs=performance.now()-libraryStart;save();
  const server='http://10.0.2.2:'+new URL(fixture.url).port;
  await sample(page,'foreground-library','connect',invoke('connection.connect',{server,username:'preview',password:'fixture-only'}));
  await calibrate(page,'foreground-library');
  await sample(page,'foreground-library','pictures',invoke('category',{kind:'picture'}));
  await sample(page,'foreground-library','gallery-open',invoke('gallery.open'));
  await sample(page,'foreground-library','image-open',invoke('gallery.inspect',{index:1}));
  await until(async()=>{const value=await page.evaluate(invoke('image.state'));return value.opened&&!value.loading;},'actual decoded preview');
  await sample(page,'foreground-image','image-step',invoke('image.step',{direction:1}));
  await sample(page,'foreground-image','image-reveal',invoke('image.reveal'));
  await app.screenshot('after-image-reveal');
  await sample(page,'foreground-library','video-open',invoke('media.open',{kind:'video',id:'video-0'}));
  await until(async()=>{const value=await page.evaluate(invoke('player.state'));return value.opened&&value.rendered&&value.renderedFrames>0;},'actual native decoded player',20000);
  await calibrate(page,'background-library-with-native-player');
  await app.screenshot('native-player');
  await sample(page,'background-library-with-native-player','player-close',invoke('player.close'));
  // The close acknowledgement can precede Activity visibility restoration.
  // Keep the actual per-row visibility; do not label this whole phase foreground.
  await calibrate(page,'after-player-close');
  receipt.completed=true;
 }catch(error){receipt.failure=String(error);process.exitCode=1;console.error(error);
  // Fixed, read-only initialization metadata; never copy page text, credentials
  // or a user media listing into the diagnostic. No action or reload on error.
  if(page&&!controller.signal.aborted)try{receipt.failureView=await page.evaluate('({ready:document.readyState,hidden:document.hidden,bridge:typeof RHVideoBridge,client:typeof RHVideoBack,workbench:typeof RHVideoWorkbench,api:typeof RHFilesAPI,registered:typeof globalThis.RHFilesAPI?.list==="function"?RHFilesAPI.list().length:0,scripts:document.scripts.length})',2500);}catch(e){receipt.failureViewError=e.code||e.name;}
 }
 finally{
  clearTimeout(deadline);
  for(const stage of new Set(receipt.rows.map(r=>r.stage))){const rows=receipt.rows.filter(r=>r.stage===stage&&r.label==='constant');if(rows.length)(receipt.calibration??={})[stage]=latencySummary(rows);}
  page?.close();try{app?.close();}catch(error){receipt.closeError=String(error);}
  if(port)try{run(['forward','--remove','tcp:'+port]);}catch{}
  try{run(['shell','am','force-stop','com.railgunhamster.rhfiles']);}catch(error){receipt.teardownError=String(error);}
  if(fixture){receipt.transport=fixture.transport.snapshot();await fixture.close();}save();
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
