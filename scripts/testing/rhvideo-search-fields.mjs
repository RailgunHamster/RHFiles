// The same real UI/API scenario runs in Windows and an admitted Android APK.
// Android entry never installs packages or selects/restarts a physical device.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root} from './source.mjs';
import {until} from './app-session.mjs';
import {admitLocalClockDevice} from './rhvideo-local-clock.mjs';
import {androidSession} from './android-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';
import {rhvideoFixture} from './rhvideo-fixture.mjs';

export function configureSearchFixture(fixture){
  assert.deepEqual(fixture.videos.map(row=>row.id),['video-0','video-1','video-2']);
  Object.assign(fixture.videos[0],{title:'显示片名',filename:'重庆森林.mp4',original_resolution:'1920×1080',original_duration:99.75,original_filesize:7654321,status:'processing',duration_seconds:456});
  Object.assign(fixture.videos[1],{original_resolution:'640x360',original_duration:0,original_filesize:0,status:'ready'});
  Object.assign(fixture.videos[2],{original_resolution:'1920X1080',original_duration:22,original_filesize:123,status:'failed'});
  fixture.favorites.add('video:video-0');fixture.favorites.add('picture:picture-0');
}
export async function checkPackagedSearchFields(view,server){
  const actual=await view.evaluate("fetch('js/rhvideo-index.js').then(r=>r.text())"),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(actual),hash(fs.readFileSync(path.join(root,'src/js/rhvideo-index.js'))),'Use the actual current packaged worker index');
  const invoke=(name,args={})=>view.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
  await invoke('category',{kind:'video'});await invoke('connection.connect',{server,username:'preview',password:'fixture-only'});
  const cases=[];
  const check=async(kind,query,expected)=>{
    const result=await invoke('search',{query});assert.equal(result.error,'');assert.deepEqual(result.items.map(row=>row.id).sort(),expected);
    assert.deepEqual(await view.evaluate("[...document.querySelectorAll('.media-card')].map(row=>row.dataset.id).sort()"),expected);
    cases.push({kind,query,ids:result.items.map(row=>row.id).sort()});
  };
  for(const query of ['processing','99.75','7654321','1920×1080'])await check('video',query,['video-0']);
  await check('video','456',[]);
  await view.evaluate("document.getElementById('search').value='ready';document.getElementById('search').dispatchEvent(new Event('input',{bubbles:true}));true");
  await until(async()=>{const value=await invoke('state');return !value.loading&&value.search==='ready'&&value.items.length===1;},'visible search input uses the same worker projection');
  assert.deepEqual((await invoke('state')).items.map(row=>row.id),['video-1']);
  await invoke('category',{kind:'picture'});await check('picture','2560×1600',Array.from({length:8},(_,i)=>'picture-'+i));
  await invoke('category',{kind:'favorite'});for(const query of ['重庆','cqsl','chongqing'])await check('favorite',query,['video-0']);
  const final=await invoke('state');assert.equal(final.connected,true);assert.equal(final.restoring,false);assert.equal(new URL(final.server).href,new URL(server).href,'An older automatic restore cannot replace this explicit login');
  assert.deepEqual((await invoke('ui.contract')).missing,[]);
  return {cases,inputSearch:'ready',missingUIActions:[]};
}
export function admitSearchDevice(serial,run){
  assert.match(serial,/^emulator-\d+$/,'Only an explicit owned emulator is allowed');
  admitLocalClockDevice(serial,run(['shell','getprop','ro.kernel.qemu']),run(['emu','avd','name']));
  assert.equal(run(['shell','getprop','sys.boot_completed']).trim(),'1');
  assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/,'Do not run through system/app error dialogs');
  for(const name of ['com.railgunhamster.rhfiles','stagefright'])try{assert.equal(run(['shell','pidof',name]).trim(),'','Existing playback/session must not be replaced');}catch(error){if(error.status!==1)throw error;}
}
async function main(){
  const [serial,apk]=process.argv.slice(2);assert(apk,'Provide the exact already-installed APK snapshot');assert.match(serial||'',/^emulator-\d+$/);
  const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk'),adb=path.join(sdk,'platform-tools/adb.exe');
  const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:4*1024*1024});
  admitSearchDevice(serial,run);
  const actualApk=fs.realpathSync(apk),relative=path.relative(path.join(root,'test-artifacts'),actualApk),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert(relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&path.extname(actualApk)==='.apk','Use an APK snapshot inside this worktree');
  const installed=run(['shell','pm','path','com.railgunhamster.rhfiles']).trim().split(/\r?\n/);assert.equal(installed.length,1);assert.match(installed[0],/^package:\/data\/app\/[A-Za-z0-9_~+=./-]+\/base\.apk$/);
  assert.equal(run(['shell','sha256sum',installed[0].slice(8)]).slice(0,64),hash(actualApk),'Installed APK differs from the admitted snapshot');
  const artifact=fs.mkdtempSync(path.join(root,'test-artifacts/rhvideo-android-search-fields-')),receipt={serial,apkSha256:hash(actualApk),artifact,scope:'Packaged worker, actual UI input and semantic API; not native playback acceptance'};
  let fixture,app,view,port;console.log('Android search fields: '+artifact);
  try{
    fixture=await rhvideoFixture({videoCount:3});configureSearchFixture(fixture);
    process.env.ANDROID_SDK_ROOT=sdk;app=await androidSession(serial);
    await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
    const pid=run(['shell','pidof','com.railgunhamster.rhfiles']).trim();assert.match(pid,/^\d+$/);receipt.pid=Number(pid);
    port=run(['forward','tcp:0','localabstract:webview_devtools_remote_'+pid]).trim();assert.match(port,/^\d+$/);
    const target=await until(async()=>{const pages=(await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(2000)})).json()).filter(row=>row.type==='page'&&row.url==='https://appassets.androidplatform.net/rhvideo/rhvideo.html');assert(pages.length<=1);return pages[0];},'owned native library WebView');
    view=await cdpSession(target,30000);
    // Like an actual user changing servers, explicitly connect once controls
    // exist. Do not wait for an unrelated remembered/offline test server's
    // automatic restore, or remove the old/new connection identity assertions.
    await until(()=>view.evaluate("!!window.RHFilesAPI?.snapshot().state.application&&['rhvideo.category','rhvideo.connection.connect','rhvideo.search'].every(id=>RHFilesAPI.list().some(row=>row.id===id))"),'packaged search controls registered');
    receipt.result=await checkPackagedSearchFields(view,'http://10.0.2.2:'+new URL(fixture.url).port);
    await app.screenshot('search-fields');receipt.sessionArtifact=app.artifactDir;receipt.passed=true;
  }catch(error){
    receipt.failure=String(error);process.exitCode=1;console.error(error);
    if(app)try{await app.screenshot('search-fields-failure');receipt.sessionArtifact=app.artifactDir;}catch{receipt.failureScreenshotUnavailable=true;}
    if(view)try{receipt.failureState=await view.evaluate("RHFilesAPI.invoke('rhvideo.state')");}catch{receipt.failureStateUnavailable=true;}
  }
  finally{
    if(fixture){receipt.transport=fixture.transport.snapshot();receipt.unexpectedWrites=fixture.requests.filter(row=>row.method!=='GET'&&!(row.method==='POST'&&row.path==='/api/v1/auth/login')).map(({method,path})=>({method,path}));if(receipt.unexpectedWrites.length){receipt.passed=false;process.exitCode=1;}await fixture.close();}
    view?.close();try{app?.close();}catch(error){receipt.closeError=String(error.code||'unavailable');}
    if(port)try{run(['forward','--remove','tcp:'+port]);}catch{}
    try{run(['shell','am','force-stop','com.railgunhamster.rhfiles']);}catch(error){receipt.teardownError=String(error.code||'unavailable');}
    fs.writeFileSync(path.join(artifact,'receipt.json'),JSON.stringify(receipt,null,2));
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
