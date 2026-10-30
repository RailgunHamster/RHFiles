// Diagnostic only: observe Android's system AudioPlayer without RHFiles/Media3.
// Uses an already generated silent fixture, never changes host/guest audio setup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {admitLocalClockDevice} from './rhvideo-local-clock.mjs';
import {root} from './source.mjs';

export function systemAudioTrack(dump,pid){
  assert(Number.isSafeInteger(pid)&&pid>0);
  const matches=[];
  for(const line of dump.split(/\r?\n/)){
    const t=line.trim().split(/\s+/),active=t.indexOf('yes');
    if(![1,2].includes(active)||t[active+1]!==String(pid))continue;
    assert(active===1||t[0]==='S','Unknown AudioFlinger row type');
    assert(/^\d+$/.test(t[active-1])&&/^0x[\da-f]+$/i.test(t[active+5]));
    for(const index of [active+6,active+7,active+16])assert(/^[\da-f]{8}$/i.test(t[index]||''),'Unknown AudioFlinger PCM layout');
    for(const index of [active+8,active+17,active+18,active+20])assert(/^\d+$/.test(t[index]||''),'Missing PCM counters');
    const track={id:Number(t[active-1]),client:pid,sampleRate:Number(t[active+8]),
      serverFrames:parseInt(t[active+16],16),bufferFrames:Number(t[active+17]),
      framesReady:Number(t[active+18]),underruns:Number(t[active+20])};
    assert(track.sampleRate>0&&track.bufferFrames>0);matches.push(track);
  }
  assert(matches.length<=1,'Ambiguous system AudioPlayer tracks');return matches[0]||null;
}

export function audioClockObservation(before,after){
  for(const sample of [before,after]){
    assert(Number.isFinite(sample.started)&&Number.isFinite(sample.finished)&&sample.finished>=sample.started);
    for(const key of ['id','client','sampleRate','serverFrames'])assert(Number.isSafeInteger(sample.track[key])&&sample.track[key]>=0);
    assert(sample.track.sampleRate>0);
  }
  for(const key of ['id','client','sampleRate'])assert.equal(before.track[key],after.track[key],'Audio input changed');
  assert(before.track.serverFrames>=before.track.sampleRate*2&&before.track.serverFrames<before.track.sampleRate*6,
    'Observe already progressing audio, not initial buffer fill or the end of the source');
  const minimumWallMs=after.started-before.finished,maximumWallMs=after.finished-before.started;
  assert(minimumWallMs>=5000&&maximumWallMs<15000,'Unbounded or overlapping observations');
  assert(after.track.serverFrames>=before.track.serverFrames,'Audio frame counter reset');
  const mediaMs=(after.track.serverFrames-before.track.serverFrames)*1000/before.track.sampleRate;
  return {diagnosticOnly:true,minimumWallMs,maximumWallMs,mediaMs,
    minimumRate:mediaMs/maximumWallMs,maximumRate:mediaMs/minimumWallMs};
}

async function main(){
  const [serial,media]=process.argv.slice(2);
  assert.match(serial||'',/^emulator-\d+$/);
  assert.match(media||'',/^\/sdcard\/Android\/data\/com\.railgunhamster\.rhfiles\/files\/rhvideo-local-grid-[a-f0-9]{32}\/portrait\.mp4$/);
  const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk');
  const adb=path.join(sdk,'platform-tools/adb.exe');
  const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:4*1024*1024});
  admitLocalClockDevice(serial,run(['shell','getprop','ro.kernel.qemu']),run(['emu','avd','name']));
  assert.equal(run(['shell','getprop','sys.boot_completed']).trim(),'1');
  assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/);
  const noProcess=name=>{try{assert.equal(run(['shell','pidof',name]).trim(),'','Existing process must not be interrupted');}catch(error){if(error.status!==1)throw error;}};
  noProcess('stagefright');noProcess('com.railgunhamster.rhfiles');
  assert.equal(run(['shell','which','stagefright']).trim(),'/system_ext/bin/stagefright');
  const sha256='98c8699ed412be73efb519aa2c8388d56e68c71b5c8edd014fa17d8cd32c24bc';
  assert.equal(run(['shell','sha256sum',media]).slice(0,64),sha256,'Keep the exact local H264/AAC fixture');
  const artifact=fs.mkdtempSync(path.join(root,'test-artifacts/rhvideo-system-audio-'));
  const receipt={diagnosticOnly:true,serial,media,sha256,observed:false};
  console.log('System audio diagnostic: '+artifact);
  let output='',timedOut=false;const launched=performance.now();
  const child=spawn(adb,['-s',serial,'shell','timeout','30','stagefright','-a','-o','-q',media],{windowsHide:true});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  const done=new Promise(resolve=>{child.once('error',error=>resolve({code:null,errorClass:String(error.code||'spawn-failed')}));child.once('close',code=>resolve({code}));});
  const deadline=setTimeout(()=>{timedOut=true;child.kill();},40000);
  const snapshot=pid=>{
    const started=performance.now(),dump=run(['shell','dumpsys','media.audio_flinger']),finished=performance.now();
    return {started,finished,track:systemAudioTrack(dump,pid),dump};
  };
  try{
    let before;const readinessEnd=performance.now()+10000;
    while(performance.now()<readinessEnd){
      let text='';try{text=run(['shell','pidof','stagefright']).trim();}catch(error){if(error.status!==1)throw error;}
      if(text){assert.match(text,/^\d+$/);receipt.pid=Number(text);
        const cmd=run(['shell','cat','/proc/'+text+'/cmdline']).split('\0');
        assert(cmd.includes(media)&&cmd.some(value=>value==='stagefright'||value==='/system_ext/bin/stagefright'),'Unrelated process');
        const value=snapshot(receipt.pid);if(value.track&&value.track.serverFrames>=value.track.sampleRate*2){before=value;break;}
      }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert(before,'System AudioPlayer did not create an active PCM track');
    assert(before.track.serverFrames<before.track.sampleRate*6,'Observe early without restarting or seeking');
    await new Promise(resolve=>setTimeout(resolve,5100));const after=snapshot(receipt.pid);
    assert(after.track,'System AudioPlayer ended before the second snapshot');
    fs.writeFileSync(path.join(artifact,'audio-before.log'),before.dump);fs.writeFileSync(path.join(artifact,'audio-after.log'),after.dump);
    delete before.dump;delete after.dump;receipt.before=before;receipt.after=after;
    receipt.clock=audioClockObservation(before,after);receipt.observed=true;
    console.log('Observed system PCM clock only; not RHVideo acceptance: '+JSON.stringify(receipt.clock));
  }catch(error){receipt.failure=String(error);process.exitCode=1;}
  finally{
    receipt.process=await done;clearTimeout(deadline);receipt.elapsedMs=performance.now()-launched;receipt.hostTimedOut=timedOut;
    fs.writeFileSync(path.join(artifact,'stagefright.log'),output);
    if(timedOut||receipt.process.code!==0){process.exitCode=1;receipt.failure??='System control did not exit normally';}
    try{noProcess('stagefright');receipt.guestExited=true;}catch{receipt.guestExited=false;process.exitCode=1;}
    fs.writeFileSync(path.join(artifact,'receipt.json'),JSON.stringify(receipt,null,2));
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
