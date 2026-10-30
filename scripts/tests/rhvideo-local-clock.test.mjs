import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {admitLocalClockDevice,verifyLocalClock} from '../testing/rhvideo-local-clock.mjs';
const state=(positionMs,renderedFrames)=>({count:1,playing:true,rendered:true,rate:1,error:null,volume:100,decoderVolume:100,durationMs:20000,path:'owned-test.mp4',inputId:1,positionMs,renderedFrames,tracks:{groups:['audio','video'].map(type=>({type,tracks:[{selected:true}]}))}});
test('ordinary local clock diagnostics admit only the exact owned AVDs',()=>{
  for(const avd of ['RHFilesRhVideoQA20261027','RHFilesRhVideoQA20261030Audio','RHFilesRhVideoQA20261030HostGpu','RHFilesRhVideoQA20261030Api36'])admitLocalClockDevice('emulator-5590','1\n',avd+'\nOK\n');
  for(const args of [['phone','1','RHFilesRhVideoQA20261030Audio'],['emulator-5586','0','RHFilesRhVideoQA20261030Audio'],['emulator-5586','1','RHFilesRhVideoQA20261030Audio-copy'],['emulator-5588','1','RHFilesRhVideoQA20261030HostGpu-copy'],['emulator-5590','0','RHFilesRhVideoQA20261030Api36'],['emulator-5590','1','RHFilesRhVideoQA20261030Api36-copy'],['emulator-5586','1','Moto']])assert.throws(()=>admitLocalClockDevice(...args));
});
test('the local control preserves real source, input, tracks, frames and normal speed',()=>{
  assert.deepEqual(verifyLocalClock(state(700,18),state(5700,138),5200),{elapsedMs:5200,positionDeltaMs:5000,frameDelta:120});
  for(const patch of [{path:'other'},{inputId:2},{playing:false},{count:3},{rate:.5},{decoderVolume:0},{error:'codec'},{durationMs:12000},{positionMs:2000},{renderedFrames:30},{tracks:{groups:[]}}])assert.throws(()=>verifyLocalClock(state(700,18),{...state(5700,138),...patch},5200));
  for(const elapsed of [4500,10000])assert.throws(()=>verifyLocalClock(state(700,18),state(5700,138),elapsed));
  assert.throws(()=>verifyLocalClock(state(19000,300),state(1000,400),5200),'An EOF wrap cannot pass as a forward interval');
});
test('local playback control uses the actual file-open API and never queries during the frozen interval',()=>{
  const source=fs.readFileSync(new URL('../testing/rhvideo-local-clock.mjs',import.meta.url),'utf8');
  assert.match(source,/invoke\('files\.open',\{path:file\}\)/);
  const interval=source.slice(source.indexOf('const started=performance.now()'),source.indexOf('receipt.continuity='));
  assert.match(interval,/state:'frozen'/);assert.match(interval,/await pause\(5000\)/);assert.match(interval,/state:'active'/);
  assert.equal([...interval.matchAll(/invoke\(/g)].length,1,'One read only after the complete observation');
  assert.doesNotMatch(source,/\['install'|setPlaybackSpeed|command:'seek'|command:'volume'|VIRTUAL_TIME|setVirtualTimePolicy/);
});
test('ordinary timeline reporting reads one position without manufacturing a full-length clipping end',()=>{
  const activity=fs.readFileSync(new URL('../../android/gradle/app/src/main/java/com/railgunhamster/rhfiles/PlaybackActivity.kt',import.meta.url),'utf8');
  const state=activity.slice(activity.indexOf('internal fun automationState()'),activity.indexOf('internal fun automationControl('));
  assert.match(state,/val currentPosition=engine\.currentPosition/);assert.match(state,/put\("positionMs",currentPosition\)/);assert.match(state,/rhQueuePosition\(w,local,currentPosition\)/);
  const item=activity.slice(activity.indexOf('private fun rhItem('),activity.indexOf('private fun rebuildRhWindow('));
  assert.match(item,/if\(w\.ends\[i\]>=0\)clipping\.setEndPositionMs\(w\.ends\[i\]\)/);
  assert.doesNotMatch(item,/duration|totalMs|setEndPositionMs\(engine/,'A metadata or decoded duration must not silently truncate an open-ended source');
  const java=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8');
  assert.match(java,/getLong\("segmentEndMs"\)==-1&&before\.getLong\("queuePositionMs"\)==before\.getLong\("positionMs"\)/);
});
