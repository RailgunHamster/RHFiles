// Diagnostic only: ordinary local PlayerView vs RHVideo's integration. Never
// install an APK, select a phone, alter codec/quality/audio settings or retry play.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {androidSession,until,pause} from './android-session.mjs';
import {root} from './source.mjs';

export function admitLocalClockDevice(serial,kernel,avd){
  assert.match(serial,/^emulator-\d+$/);assert.equal(kernel.trim(),'1');
  const names=avd.split(/\r?\n/).map(v=>v.trim());
  assert(['RHFilesRhVideoQA20261027','RHFilesRhVideoQA20261030Audio','RHFilesRhVideoQA20261030HostGpu'].some(v=>names.includes(v)),'Only an explicitly owned RHVideo QA AVD is allowed');
}
export function verifyLocalClock(before,after,elapsedMs){
  assert.equal(before.count,1);assert.equal(after.count,1);
  for(const value of [before,after]){
    assert.equal(value.playing,true);assert.equal(value.rendered,true);assert.equal(value.rate,1);assert.equal(value.error,null);
    assert(value.volume>0&&value.decoderVolume>0);assert.equal(value.durationMs,20000);
    for(const type of ['audio','video'])assert(value.tracks.groups.some(g=>g.type===type&&g.tracks.some(t=>t.selected)),'Keep selected '+type);
  }
  assert(before.positionMs>=500&&before.positionMs<6000,'Sample early without seeking/resetting');
  assert.equal(before.path,after.path);assert.equal(before.inputId,after.inputId);
  const result={elapsedMs,positionDeltaMs:after.positionMs-before.positionMs,frameDelta:after.renderedFrames-before.renderedFrames};
  assert(elapsedMs>=5000&&elapsedMs<10000&&result.positionDeltaMs>=4000&&result.frameDelta>=60,'Ordinary local playback did not sustain real time: '+JSON.stringify(result));
  return result;
}
async function main(){
  const [serial,apk]=process.argv.slice(2);assert(serial&&apk,'Provide an owned AVD and the exact already-installed APK snapshot');
  const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk');
  const adb=path.join(sdk,'platform-tools/adb.exe'),run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.match(serial,/^emulator-\d+$/);
  admitLocalClockDevice(serial,run(['shell','getprop','ro.kernel.qemu']),run(['emu','avd','name']));
  const actualApk=fs.realpathSync(apk),relative=path.relative(path.join(root,'test-artifacts'),actualApk);
  assert(relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&path.extname(actualApk)==='.apk','Use an APK snapshot inside this worktree test-artifacts');
  const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),apkHash=hash(actualApk);
  const installed=run(['shell','pm','path','com.railgunhamster.rhfiles']).trim().split(/\r?\n/);
  assert.equal(installed.length,1);assert.match(installed[0],/^package:\/data\/app\/[A-Za-z0-9_~+=./-]+\/base\.apk$/);
  assert.equal(run(['shell','sha256sum',installed[0].slice(8)]).slice(0,64),apkHash,'Do not test another installed runtime');
  assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/);
  const artifact=fs.mkdtempSync(path.join(root,'test-artifacts/rhvideo-local-clock-')),media=path.join(artifact,'portrait.mp4');
  const remote='/sdcard/Android/data/com.railgunhamster.rhfiles/files/rhvideo-local-clock-'+randomUUID(),file=remote+'/portrait.mp4';
  const receipt={diagnosticOnly:true,apkSha256:apkHash,serial,artifact};let session,frozen=false,opened=false;
  console.log('Local native clock diagnostic: '+artifact);
  try{
    execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size=360x640:rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-t','20','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',media],{windowsHide:true,timeout:30000});
    receipt.mediaSha256=hash(media);assert.equal(receipt.mediaSha256,'98c8699ed412be73efb519aa2c8388d56e68c71b5c8edd014fa17d8cd32c24bc','Keep the same RHVideo control source bytes');
    run(['shell','mkdir','-p',remote]);run(['push',media,file]);assert.equal(run(['shell','sha256sum',file]).slice(0,64),receipt.mediaSha256);
    process.env.ANDROID_SDK_ROOT=sdk;session=await androidSession(serial);receipt.sessionArtifacts=session.artifactDir;
    const invoke=(name,args={})=>session.evaluate('(RHFilesAPI.forPane?RHFilesAPI.forPane("active"):RHFilesAPI).invoke('+JSON.stringify(name)+','+JSON.stringify(args)+')');
    await invoke('navigation.open',{path:remote});const listing=await invoke('files.list');assert.equal(listing.total,1);assert.equal(listing.entries[0].path,file);
    await invoke('files.open',{path:file});opened=true;
    const before=await until(async()=>{const value=await invoke('native.media.state');return value.playing&&value.rendered&&value.positionMs>=500&&value.renderedFrames>1?value:null;},'ordinary local decoded playback',20000);receipt.before=before;
    assert.equal(before.path,file);assert(!Object.hasOwn(before,'rotationRenderer')&&!Object.hasOwn(before,'lease'),'The control must use ordinary PlayerView without an RHVideo surface/session');
    const started=performance.now();
    await session.send('Page.setWebLifecycleState',{state:'frozen'});frozen=true;
    try{await pause(5000);}finally{await session.send('Page.setWebLifecycleState',{state:'active'});frozen=false;}
    const after=await invoke('native.media.state');receipt.after=after;receipt.elapsedMs=performance.now()-started;
    receipt.continuity=verifyLocalClock(before,after,receipt.elapsedMs);
    await session.screenshot('local-native-clock');receipt.passed=true;
    console.log('PASS: ordinary local clock diagnostic only; not full product acceptance '+JSON.stringify(receipt.continuity));
  }catch(error){receipt.failure=String(error);process.exitCode=1;console.error(error);}
  finally{
    if(frozen)try{await session.send('Page.setWebLifecycleState',{state:'active'});}catch{}
    receipt.diagnostics={};
    for(const [name,args]of [['native-logcat.log',['logcat','-d','-v','threadtime','-t','2000']],['native-frames.log',['shell','dumpsys','gfxinfo','com.railgunhamster.rhfiles']]])try{fs.writeFileSync(path.join(artifact,name),run(args));receipt.diagnostics[name]={captured:true};}catch(error){receipt.diagnostics[name]={captured:false,reason:String(error.code||'unavailable')};}
    if(opened)try{await session.evaluate('(RHFilesAPI.forPane?RHFilesAPI.forPane("active"):RHFilesAPI).invoke("native.media.control",{command:"close"})');}catch{}
    try{session?.close();}catch(error){receipt.closeError=String(error.code||'unavailable');}
    try{run(['shell','am','force-stop','com.railgunhamster.rhfiles']);}catch(error){receipt.teardownError=String(error.code||'unavailable');}
    fs.writeFileSync(path.join(artifact,'receipt.json'),JSON.stringify(receipt,null,2));
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
