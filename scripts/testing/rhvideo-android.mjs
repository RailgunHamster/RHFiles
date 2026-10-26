// Run only against the owned emulator and the actual minified release APK.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {rhvideoFixture} from './rhvideo-fixture.mjs';
const serial=process.argv[2]||'emulator-5584',apk=process.argv[3],probe=process.argv[4];
assert.match(serial,/^emulator-\d+$/);assert(apk&&probe,'Provide release APK and instrumentation APK');
const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk');
const adb=path.join(sdk,'platform-tools/adb.exe');
const run=(args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:120000});
assert.equal(run(['shell','getprop','ro.kernel.qemu']).trim(),'1','Physical devices are not allowed');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-rhvideo-android-'));
const video=path.join(temporary,'sample.mp4');
execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-t','20','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart',video],{windowsHide:true,timeout:30000});
const fixture=await rhvideoFixture({videoFile:video}),port=new URL(fixture.url).port;
const artifact=path.resolve('test-artifacts/rhvideo-android-release');fs.mkdirSync(artifact,{recursive:true});
try{
  console.log(run(['install','-r',apk]).trim());console.log(run(['install','-r',probe]).trim());
  run(['reverse','tcp:'+port,'tcp:'+port]);run(['shell','am','force-stop','com.railgunhamster.rhfiles']);
  const child=spawn(adb,['-s',serial,'shell','am','instrument','-w','-e','server','http://127.0.0.1:'+port,'com.railgunhamster.rhfiles.test/com.railgunhamster.rhfiles.RhVideoInstrumentation'],{windowsHide:true});
  let output='';child.stdout.on('data',data=>{output+=data;process.stdout.write(data);});child.stderr.on('data',data=>{output+=data;process.stderr.write(data);});
  const timer=setTimeout(()=>child.kill(),180000);
  try{await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Instrumentation exit '+code)));});}finally{clearTimeout(timer);}
  fs.writeFileSync(path.join(artifact,'instrumentation.log'),output);
  assert.match(output,/PASS: native HTTP/);assert.doesNotMatch(output,/FAIL:|INSTRUMENTATION_FAILED/);
  for(const name of ['rhvideo-library-qa.png','rhvideo-player-qa.png'])run(['pull','/sdcard/Android/data/com.railgunhamster.rhfiles/files/'+name,path.join(artifact,name)]);
  assert(fixture.requests.some(r=>r.path.endsWith('/play')&&r.authorization==='Bearer fixture-bearer-do-not-persist'));
  assert(fixture.progress.length>0,'Reader progress reached server');
  assert(fixture.favorites.has('picture:picture-0'),'Favorite reached server');
  console.log('PASS: release APK end-to-end, artifacts '+artifact);
}finally{try{run(['reverse','--remove','tcp:'+port]);}catch{}await fixture.close();fs.rmSync(temporary,{recursive:true,force:true});}
