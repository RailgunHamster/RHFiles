// Same-UID, minified Media3 local-file control. No server, download, network
// redirect, phone, codec tuning or replay; explicitly not RHVideo acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile,execFileSync,spawn} from 'node:child_process';
import {admitLocalClockDevice} from './rhvideo-local-clock.mjs';
import {root} from './source.mjs';

export function verifyLocalGridReceipt(output,count){
  assert(count===1||count===3);assert.doesNotMatch(output,/FAIL:|INSTRUMENTATION_FAILED|keyDispatchingTimedOut|Input dispatching timed out/);
  assert.match(output,/PASS: ordinary local simultaneous clock diagnostic only; not RHVideo product acceptance/);
  const read=prefix=>{const lines=output.split(/\r?\n/).filter(line=>line.startsWith(prefix));assert.equal(lines.length,1);return JSON.parse(lines[0].slice(prefix.length));};
  const before=read('STEP: local clock settled '),clock=read('STEP: local clock continuity ');
  assert.equal(before.diagnosticOnly,true);assert.match(before.runId,/^[a-f0-9-]{36}$/);assert(Number.isSafeInteger(before.uid)&&before.uid>0);
  assert.equal(before.cells.length,count);assert.equal(new Set(before.cells.map(c=>c.inputId)).size,count);
  assert.equal(clock.samples.length,count);assert(clock.elapsedMs>=5000&&clock.elapsedMs<10000);
  for(let i=0;i<count;i++){
    const cell=before.cells[i],sample=clock.samples[i];assert.equal(cell.inputId,sample.inputId);
    assert(Number.isSafeInteger(cell.inputId)&&cell.inputId>0);
    assert.match(cell.path,/^\/(?:storage\/emulated\/\d+|sdcard)\/Android\/data\/com\.railgunhamster\.rhfiles\/files\/rhvideo-local-grid-[a-f0-9]{32}\/(?:portrait|landscape)\.mp4$/);
    assert.equal(path.dirname(cell.path),path.dirname(before.cells[0].path));assert(cell.path.endsWith(i===2?'/landscape.mp4':'/portrait.mp4'));
    assert.equal(cell.rate,1);assert.equal(cell.decoderVolume,20);assert.equal(cell.durationMs,20000);assert.equal(cell.surfaceType,'SurfaceView');assert.equal(cell.playing,true);assert.equal(cell.rendered,true);assert.equal(cell.error,null);
    assert.equal(cell.playWhenReady,true);assert.equal(cell.playbackState,3);assert.equal(cell.suppressionReason,0);assert.equal(cell.repeat,true);
    assert(cell.positionMs>=250&&cell.positionMs<6000);assert(cell.renderedFrames>1);
    for(const type of ['audio','video'])assert(cell.tracks.groups.some(g=>g.type===type&&g.tracks.some(t=>t.selected)));
    assert(sample.positionDeltaMs>=4000&&sample.frameDelta>=60&&sample.frameTimeDeltaMs>=4000);
  }
  return {before,clock};
}

async function main(){
  const [serial,mainApk,probeApk,requested='3']=process.argv.slice(2),count=Number(requested);
  assert(mainApk&&probeApk&&(requested==='1'||requested==='3'),'Provide owned AVD, exact installed main/probe APK snapshots and count 1 or 3');
  const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk'),adb=path.join(sdk,'platform-tools/adb.exe');
  assert.match(serial,/^emulator-\d+$/);
  const run=args=>execFileSync(adb,['-s',serial,...args],{windowsHide:true,encoding:'utf8',timeout:15000,maxBuffer:16*1024*1024});
  admitLocalClockDevice(serial,run(['shell','getprop','ro.kernel.qemu']),run(['emu','avd','name']));
  assert.equal(run(['shell','getprop','sys.boot_completed']).trim(),'1');assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/);
  const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),verified={};
  for(const [packageId,file]of [['com.railgunhamster.rhfiles',mainApk],['com.railgunhamster.rhfiles.test',probeApk]]){
    const actual=fs.realpathSync(file),relative=path.relative(path.join(root,'test-artifacts'),actual);
    assert(relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&path.extname(actual)==='.apk');
    const installed=run(['shell','pm','path',packageId]).trim().split(/\r?\n/);assert.equal(installed.length,1);assert.match(installed[0],/^package:\/data\/app\/[A-Za-z0-9_~+=./-]+\/base\.apk$/);
    verified[packageId]=hash(actual);assert.equal(run(['shell','sha256sum',installed[0].slice(8)]).slice(0,64),verified[packageId],'Do not run another installed APK');
  }
  const artifact=fs.mkdtempSync(path.join(root,'test-artifacts/rhvideo-local-grid-')),directory='/sdcard/Android/data/com.railgunhamster.rhfiles/files/rhvideo-local-grid-'+randomUUID().replaceAll('-','');
  const receipt={diagnosticOnly:true,serial,count,verified,directory,media:[],passed:false};console.log('Local grid control: '+artifact);
  const captures=[];let child,expired=false;
  const capture=(name,args)=>new Promise(resolve=>execFile(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:16*1024*1024},(error,stdout)=>{try{fs.writeFileSync(path.join(artifact,name),stdout||'');resolve({name,captured:!error,errorClass:error?String(error.code||'unavailable'):null});}catch(writeError){resolve({name,captured:false,errorClass:String(writeError.code||'write-failed')});}}));
  try{
    run(['shell','mkdir','-p',directory]);
    for(const [name,size,expected]of [['portrait','360x640','98c8699ed412be73efb519aa2c8388d56e68c71b5c8edd014fa17d8cd32c24bc'],['landscape','640x360','97cf3a48b50aaa677ee66fd9debca20786021ffbda51d286ebfa5a2aea86bddb']]){
      const file=path.join(artifact,name+'.mp4');execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size='+size+':rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-t','20','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
      assert.equal(hash(file),expected);run(['push',file,directory+'/'+name+'.mp4']);assert.equal(run(['shell','sha256sum',directory+'/'+name+'.mp4']).slice(0,64),expected);receipt.media.push({name,sha256:expected});
    }
    run(['shell','am','force-stop','com.railgunhamster.rhfiles']);
    run(['shell','rm','-f','/sdcard/Android/data/com.railgunhamster.rhfiles/files/rhvideo-local-grid-qa.png']);
    child=spawn(adb,['-s',serial,'shell','am','instrument','-w','-e','mode','local-clock','-e','count',String(count),'-e','directory',directory,'com.railgunhamster.rhfiles.test/com.railgunhamster.rhfiles.RhVideoInstrumentation'],{windowsHide:true});
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    let output='',captured=false;
    child.stdout.on('data',data=>{output+=data;process.stdout.write(data);const failure=output.match(/QA: local-clock-failure-snapshot pid=(\d+)/);if(!captured&&failure){captured=true;receipt.failedPid=Number(failure[1]);for(const [name,args]of [['native-audio-at-failure.log',['shell','dumpsys','media.audio_flinger']],['native-frames-at-failure.log',['shell','dumpsys','gfxinfo','com.railgunhamster.rhfiles']]])captures.push(capture(name,args));}});
    child.stderr.on('data',data=>{output+=data;process.stderr.write(data);});
    const timer=setTimeout(()=>{expired=true;child.kill();},120000);
    try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0&&!expired?resolve():reject(Error(expired?'Owned local control exceeded 120 seconds':'Instrumentation exit '+code)));});}
    finally{clearTimeout(timer);fs.writeFileSync(path.join(artifact,'instrumentation.log'),output);}
    receipt.result=verifyLocalGridReceipt(output,count);assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/);
    run(['pull','/sdcard/Android/data/com.railgunhamster.rhfiles/files/rhvideo-local-grid-qa.png',path.join(artifact,'native-surface.png')]);receipt.passed=true;
    console.log('PASS: ordinary local '+count+'-input clock control only; not RHVideo acceptance');
  }catch(error){receipt.failure=String(error);process.exitCode=1;console.error(error);}
  finally{
    receipt.liveCaptures=await Promise.all(captures);
    receipt.logcat=await capture('native-logcat.log',['logcat','-d','-v','threadtime','-t','6000']);
    try{run(['shell','am','force-stop','com.railgunhamster.rhfiles']);}catch(error){receipt.closeError=String(error.code||'unavailable');}
    fs.writeFileSync(path.join(artifact,'receipt.json'),JSON.stringify(receipt,null,2));
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
