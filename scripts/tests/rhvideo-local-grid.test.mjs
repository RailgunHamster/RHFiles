import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyLocalGridReceipt} from '../testing/rhvideo-local-grid.mjs';
const read=relative=>fs.readFileSync(new URL('../../'+relative,import.meta.url),'utf8');
function receipt(count=3){
  const cells=Array.from({length:count},(_,i)=>({inputId:i+1,path:'/storage/emulated/0/Android/data/com.railgunhamster.rhfiles/files/rhvideo-local-grid-'+'a'.repeat(32)+'/'+(i===2?'landscape':'portrait')+'.mp4',positionMs:500,rate:1,decoderVolume:20,durationMs:20000,surfaceType:'SurfaceView',playing:true,playWhenReady:true,playbackState:3,suppressionReason:0,repeat:true,rendered:true,error:null,renderedFrames:12,tracks:{groups:['audio','video'].map(type=>({type,tracks:[{selected:true}]}))}}));
  return {before:{diagnosticOnly:true,runId:'11111111-2222-4333-8444-555555555555',uid:10192,cells},clock:{elapsedMs:5100,samples:cells.map(c=>({inputId:c.inputId,positionDeltaMs:5000,frameDelta:120,frameTimeDeltaMs:5000}))}};
}
function log({before,clock}){return 'STEP: local clock settled '+JSON.stringify(before)+'\nSTEP: local clock continuity '+JSON.stringify(clock)+'\nPASS: ordinary local simultaneous clock diagnostic only; not RHVideo product acceptance';}
test('same-UID local control requires a complete independent receipt for each requested input',()=>{
  for(const count of [1,3])assert.equal(verifyLocalGridReceipt(log(receipt(count)),count).before.cells.length,count);
  assert.throws(()=>verifyLocalGridReceipt(log(receipt(1)),3));assert.throws(()=>verifyLocalGridReceipt('PASS: reference grid',3));
  assert.throws(()=>verifyLocalGridReceipt(log(receipt())+'\nFAIL: native failure',3));
  assert.throws(()=>verifyLocalGridReceipt(log(receipt())+'\nSTEP: local clock continuity {}',3));
});
test('one frozen, muted, changed, slow or missing-track input invalidates the entire local control',()=>{
  for(const patch of [{inputId:1},{inputId:undefined},{inputId:0},{path:'https://outside.invalid/media.mp4'},{path:'/sdcard/shared.mp4'},{playWhenReady:false},{playbackState:2},{suppressionReason:1},{repeat:false},{rate:.5},{decoderVolume:0},{surfaceType:'TextureView'},{durationMs:12000},{playing:false},{rendered:false},{error:'codec'},{positionMs:19000},{renderedFrames:1},{tracks:{groups:[]}}]){
    const data=receipt();Object.assign(data.before.cells[1],patch);assert.throws(()=>verifyLocalGridReceipt(log(data),3));
  }
  for(const patch of [{inputId:55},{positionDeltaMs:3999},{frameDelta:59},{frameTimeDeltaMs:3999}]){
    const data=receipt();Object.assign(data.clock.samples[2],patch);assert.throws(()=>verifyLocalGridReceipt(log(data),3));
  }
  for(const elapsedMs of [4999,10000]){const data=receipt();data.clock.elapsedMs=elapsedMs;assert.throws(()=>verifyLocalGridReceipt(log(data),3));}
});
test('local controls are compile-time QA and opt-in only, without RHVideo transport/effects/clock substitutions',()=>{
  const native=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/RhVideoLocalClockProbe.kt'),gradle=read('android/gradle/app/build.gradle.kts'),host=read('scripts/testing/rhvideo-local-grid.mjs');
  assert.match(gradle,/buildConfigField\("boolean", "RHVIDEO_QA_LOCAL_CLOCK", providers\.gradleProperty\("rhfilesRhVideoProbe"\)\.isPresent\.toString\(\)\)/);
  assert.match(native,/check\(BuildConfig\.RHVIDEO_QA_LOCAL_CLOCK&&NativeAutomation\.enabled\(activity\)\)/);
  assert.match(native,/DefaultRenderersFactory\(activity\)\.setEnableDecoderFallback\(true\)/);
  assert.match(native,/PlayerView\(activity\)/);assert.match(native,/engine\.volume=\.2f/);
  assert.doesNotMatch(native,/RhVideoClient|MediaRoutingDataSource|RhVideoPlayerView|setPlaybackSpeed|seekTo|setVideoEffects|enablePerStreamMediaProgression|setStartThreshold/);
  assert.doesNotMatch(host,/\['install'|\['reverse'|fetch\(|createServer\(/);
  assert.match(host,/admitLocalClockDevice\(serial/);assert.match(host,/Do not run another installed APK/);
});
test('local native clock is observed once after five seconds, with no intermediate player-driving calls',()=>{
  const source=read('android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java');
  const body=source.slice(source.indexOf('private void checkLocalClockControl()'),source.indexOf('private boolean gridReady('));
  const interval=body.slice(body.indexOf('long clock=SystemClock.elapsedRealtime()'),body.indexOf('long elapsed='));
  assert.match(interval,/main\.pauseTimers\(\).*Thread\.sleep\(5000\).*main\.resumeTimers\(\)/s);
  assert.equal([...interval.matchAll(/nativeCall\(/g)].length,1);assert.doesNotMatch(interval,/seek|\.play\(|prepare\(/);
  assert.match(body,/position>=4000&&frames>=60&&pts>=4000/);assert.match(body,/finally\{nativeCall\("automation\.qa\.localClock"/);
});
