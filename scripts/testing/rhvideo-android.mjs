// Run only against the owned emulator and the actual minified release APK.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {rhvideoFixture} from './rhvideo-fixture.mjs';
const serial=process.argv[2]||'emulator-5584',apk=process.argv[3],probe=process.argv[4];
assert.match(serial,/^emulator-\d+$/);assert(apk&&probe,'Provide release APK and instrumentation APK');
const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk');
const adb=path.join(sdk,'platform-tools/adb.exe');
const sevenZip=path.resolve('src-tauri/thirdparty/7z.exe');
const aapt=fs.readdirSync(path.join(sdk,'build-tools')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(v=>path.join(sdk,'build-tools',v,'aapt.exe')).find(v=>fs.existsSync(v));
assert(aapt,'Android aapt is required to validate the native runtime');
const apkEntries=execFileSync(aapt,['list',path.resolve(apk)],{encoding:'utf8',windowsHide:true}).split(/\r?\n/),abis=new Set(apkEntries.filter(v=>v.startsWith('lib/')).map(v=>v.split('/')[1]));
assert(abis.size>0,'Release APK has no native libraries');
for(const abi of abis)assert(apkEntries.includes('lib/'+abi+'/librhfiles_android_lib.so'),'Missing RHFiles runtime for '+abi+'; use the same ABI filters as the completed Rust build');
for(const relative of ['rhvideo.html','js/rhvideo-client.js','js/rhvideo-workbench.js','js/rhvideo-index.js','js/rhvideo-worker.js','js/rhvideo-refresh.js','rhvideo-operations.json']){
  const packaged=execFileSync(sevenZip,['e','-so',path.resolve(apk),'assets/rhvideo/'+relative],{windowsHide:true,maxBuffer:8*1024*1024});
  const expected=fs.readFileSync(path.resolve('src',relative));
  assert.equal(createHash('sha256').update(packaged).digest('hex'),createHash('sha256').update(expected).digest('hex'),'APK must include the current '+relative);
}
const run=(args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:120000});
assert.equal(run(['shell','getprop','ro.kernel.qemu']).trim(),'1','Physical devices are not allowed');
const bootDeadline=Date.now()+180000;
while(true){
  let ready=false;try{ready=run(['shell','getprop','sys.boot_completed']).trim()==='1'&&run(['shell','pm','path','android']).includes('package:');}catch{}
  if(ready)break;
  assert(Date.now()<bootDeadline,'Owned emulator did not finish boot/package-manager initialization');
  await new Promise(resolve=>setTimeout(resolve,1000));
}
assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/,'Resolve emulator system/app error dialogs before visual acceptance');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-rhvideo-android-'));
const video=path.join(temporary,'sample.mp4');
execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-t','20','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart',video],{windowsHide:true,timeout:30000});
const fixture=await rhvideoFixture({videoFile:video,chapterCount:83}),port=new URL(fixture.url).port;
const artifact=path.resolve('test-artifacts/rhvideo-android-release');fs.mkdirSync(artifact,{recursive:true});
function installExact(packageId,file){
  let matches=false;
  try{
    const installed=run(['shell','pm','path',packageId]).trim().split(/\r?\n/);
    if(installed.length===1&&/^package:\/data\/app\/[A-Za-z0-9_~+=./-]+\/base\.apk$/.test(installed[0])){
      const remote=run(['shell','sha256sum',installed[0].slice(8)]).slice(0,64);
      matches=remote===createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }catch{}
  console.log(matches?'Installed APK byte-for-byte verified: '+packageId:run(['install','-r',file]).trim());
}
try{
  installExact('com.railgunhamster.rhfiles',apk);installExact('com.railgunhamster.rhfiles.test',probe);
  run(['shell','appops','set','--uid','com.railgunhamster.rhfiles','MANAGE_EXTERNAL_STORAGE','allow']);
  run(['shell','pm','grant','com.railgunhamster.rhfiles','android.permission.POST_NOTIFICATIONS']);
  // Only this owned emulator: prevent the first-use Android fullscreen coachmark
  // from covering the native-player visual acceptance screenshot.
  run(['shell','settings','put','secure','immersive_mode_confirmations','confirmed']);
  run(['shell','svc','power','stayon','true']);run(['shell','input','keyevent','224']);run(['shell','wm','dismiss-keyguard']);
  run(['reverse','tcp:'+port,'tcp:'+port]);run(['shell','am','force-stop','com.railgunhamster.rhfiles']);
  const child=spawn(adb,['-s',serial,'shell','am','instrument','-w','-e','server','http://127.0.0.1:'+port,'com.railgunhamster.rhfiles.test/com.railgunhamster.rhfiles.RhVideoInstrumentation'],{windowsHide:true});
  let output='';child.stdout.on('data',data=>{output+=data;process.stdout.write(data);});child.stderr.on('data',data=>{output+=data;process.stderr.write(data);});
  const timer=setTimeout(()=>child.kill(),360000);
  try{await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Instrumentation exit '+code)));});}finally{clearTimeout(timer);}
  fs.writeFileSync(path.join(artifact,'instrumentation.log'),output);
  assert.match(output,/PASS: native HTTP/);assert.doesNotMatch(output,/FAIL:|INSTRUMENTATION_FAILED/);
  assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/,'A system/app dialog invalidates visual acceptance');
  for(const name of ['rhvideo-library-qa.png','rhvideo-player-qa.png','rhvideo-grid-qa.png'])run(['pull','/sdcard/Android/data/com.railgunhamster.rhfiles/files/'+name,path.join(artifact,name)]);
  assert(fixture.requests.some(r=>r.path.endsWith('/play')&&r.authorization==='Bearer fixture-bearer-do-not-persist'));
  assert(fixture.progress.length>0,'Reader progress reached server');
  assert(fixture.favorites.has('picture:picture-0'),'Favorite reached server');
  console.log('PASS: release APK end-to-end, artifacts '+artifact);
}finally{try{run(['reverse','--remove','tcp:'+port]);}catch{}await fixture.close();fs.rmSync(temporary,{recursive:true,force:true});}
