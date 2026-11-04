// Isolated emulator acceptance; intentionally refuses a physical phone.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cdpSession} from '../rhfiles-api.mjs';
import {until} from './app-session.mjs';
import {rhvideoFixture} from './rhvideo-fixture.mjs';
import {makePresentationMarkers} from './rhvideo-presentation-input.mjs';
import {verify} from '../rhvideo-frontend.mjs';

const root=fileURLToPath(new URL('../..',import.meta.url));
const serial=process.argv[2],apk=process.argv[3];
assert(/^emulator-\d{4,5}$/.test(serial),'Only the owned emulator is allowed');
assert(apk&&fs.statSync(apk).isFile(),'Use the freshly assembled debug APK');
const adb=process.env.ADB||path.join(process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
const run=(...args)=>execFileSync(adb,['-s',serial,...args],{windowsHide:true,encoding:'utf8',timeout:args[0]==='install'?180000:45000}).trim();
assert.equal(run('shell','getprop','ro.boot.qemu.avd_name'),'RHFilesSharedQA');
assert.equal(run('shell','getprop','sys.boot_completed'),'1');
assert.equal(run('shell','id','-u'),'0','Enable ADB root only on the owned RHFilesSharedQA emulator to launch its non-exported media activity');
const directory=fs.mkdtempSync(path.join(root,'test-artifacts','shared-frontend-android-'));
const receipt={passed:false,frontend:verify().id};let fixture,port,library,remote;
const app='com.railgunhamster.rhfiles';
const api=(name,args={})=>library.evaluate('RHFilesAPI.invoke('+JSON.stringify('rhvideo.'+name)+','+JSON.stringify(args)+')');
const call=(name,args=[])=>api('shared.call',{name,args});
try{
 const movie=path.join(directory,'markers.mp4');makePresentationMarkers(movie);
 fixture=await rhvideoFixture({videoFile:movie,videoCount:3,pictureCount:3,videoDuration:20});
 remote=new URL(fixture.url).port;
 run('reverse','tcp:'+remote,'tcp:'+remote);
 if(process.argv.includes('--installed')){
   const installed=run('shell','pm','path',app).match(/^package:(\/[^\s]+\/base\.apk)$/m)?.[1];
   assert(installed,'Expected a previously installed APK on the owned emulator');
   const hash=createHash('sha256');
   for await(const bytes of fs.createReadStream(apk))hash.update(bytes);
   assert.equal(run('shell','sha256sum',installed).split(/\s+/)[0],hash.digest('hex'),'Installed APK differs from the selected APK');
 }else assert.match(run('install','-r',path.resolve(apk)),/Success/);
 run('shell','appops','set',app,'MANAGE_EXTERNAL_STORAGE','allow');
 run('shell','am','start','-W','-n',app+'/.RhVideoActivity','--ez','rhvideoSharedFrontend','true');
 const pid=await until(()=>run('shell','pidof',app).split(/\s+/)[0],'owned Android process',20000);
 port=run('forward','tcp:0','localabstract:webview_devtools_remote_'+pid);
 const targets=async()=>await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1500)})).json();
 const view=await until(async()=> (await targets()).find(t=>t.url==='https://appassets.androidplatform.net/rhvideo/rhvideo-shared.html'), 'shared media activity',90000);
 library=await cdpSession(view,30000);
 await until(()=>library.evaluate('globalThis.RHFilesAPI?.snapshot().state.application?.ready===true'),'canonical UI ready',30000);
 const bundled=await library.evaluate('fetch("vendor/rhvideo/frontend/manifest.json").then(response=>response.json())');
 assert.equal(bundled.id,receipt.frontend,'The APK must contain the exact imported frontend');
 receipt.connected=await api('connect',{server:'http://127.0.0.1:'+remote,username:'preview',password:'fixture-only'});assert(receipt.connected.connected);
 await call('navigation.tab',['list']);
 await until(()=>library.evaluate('document.querySelectorAll("#videos-grid .video-card").length===3'),'video list',30000);
 await call('app.playVideoLocal',['video-0']);
 receipt.playing=await until(async()=> (await api('shared.media')).find(row=>row.src.includes('video-0')&&row.state.renderedFrames>0), 'Media3 rendered first frame',40000);
 assert(receipt.playing.state.nativeSurface);
 await api('shared.control',{target:'#media-content video',action:'media',options:{command:'pause'}});
 await until(async()=> (await api('shared.media')).some(row=>row.state.state===4),'native pause');
 await api('shared.control',{target:'#media-content video',action:'media',value:7,options:{command:'seek'}});
 await until(async()=> (await api('shared.media')).some(row=>Math.abs(row.state.positionMs-7000)<500),'native seek');
 await call('app.toggleFavorite',['video','video-0',true]);assert(fixture.favorites.has('video:video-0'));
 await call('app.playVideoLocal',['video-1']);
 receipt.next=await until(async()=> (await api('shared.media')).find(row=>row.src.includes('video-1')&&row.state.renderedFrames>0), 'new Media3 input',30000);
 await until(async()=> (await api('shared.media')).filter(row=>row.src).length===1,'old decoder released');
 const png=execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{windowsHide:true,timeout:12000,maxBuffer:12*1024*1024});
 fs.writeFileSync(path.join(directory,'shared-player.png'),png);
 await call('app.logout');
 await until(()=>library.evaluate('document.getElementById("app").classList.contains("hidden")'),'logout returned to login');
 receipt.passed=true;
}catch(error){receipt.failure=String(error.stack||error);if(library)try{receipt.dom=await library.evaluate('document.body.innerText.slice(-5000)');receipt.media=await api('shared.media');}catch{}throw error;}
finally{
 library?.close();
 if(port)try{run('forward','--remove','tcp:'+port);}catch{}
 if(remote)try{run('reverse','--remove','tcp:'+remote);}catch{}
 try{run('shell','am','force-stop',app);}catch{}
 await fixture?.close();fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(receipt,null,2));
 console.log('Android shared frontend evidence: '+directory);
}
