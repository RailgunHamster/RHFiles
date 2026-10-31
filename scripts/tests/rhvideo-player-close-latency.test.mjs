import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {playerCloseLatencyReceipt,playerCloseLatencyEvents} from '../testing/rhvideo-player-close-latency.mjs';
const run='a'.repeat(32),sample=()=>({protocol:1,run,pid:42,clock:'android-elapsed-realtime',inputId:7,renderedFrames:4,startedAt:10000,ackAt:15000,stoppedAt:11000,destroyedAt:12000,completed:true,destroyed:true,libraryResumed:true,observationStopped:true});
test('native destruction and later acknowledgement have separate Android-clock timings, including early acknowledgements',()=>{
 const row=playerCloseLatencyReceipt(sample(),run);assert.equal(row.ackMs,5000);assert.equal(row.destroyedMs,2000);assert.equal(row.ackAfterDestroyMs,3000);assert.match(row.scope,/not full product acceptance/);
 assert.equal(playerCloseLatencyReceipt({...sample(),ackAt:10500},run).ackAfterDestroyMs,-1500);
});
test('stale, incomplete or malformed close evidence cannot become success or persist arbitrary fields',()=>{
 for(const patch of [{run:'b'.repeat(32)},{clock:'host'},{protocol:2},{pid:0},{inputId:0},{renderedFrames:0},{ackAt:9999},{stoppedAt:9999},{destroyedAt:10001},{completed:false},{destroyed:false},{libraryResumed:false},{observationStopped:false},{ackAt:200001}])assert.throws(()=>playerCloseLatencyReceipt({...sample(),...patch},run));
 const result=playerCloseLatencyReceipt({...sample(),password:'secret',path:'private',error:'sensitive'},run);assert.doesNotMatch(JSON.stringify(result),/secret|private|sensitive/);assert.throws(()=>playerCloseLatencyReceipt(sample(),'x'));
});
test('partial lifecycle diagnostics survive without a final receipt and cannot pass acceptance',()=>{
 const event=(event,patch={})=>'10-31 00:00:00.000 42 43 I RHVideoCloseEvent: '+JSON.stringify({protocol:1,run,pid:42,clock:'android-elapsed-realtime',event,startedAt:10000,at:11000,...patch});
 const row=playerCloseLatencyEvents([event('started',{at:10000,password:'secret'}),event('ack'),event('destroyed',{run:'b'.repeat(32)}),event('path'),event('stopped',{at:9999}),'I RHVideoCloseEvent: invalid'].join('\n'),run);
 assert.deepEqual(row.events.map(e=>e.event),['started','ack']);assert.equal(row.events[1].elapsedMs,1000);assert.equal(row.rejected,3);assert.match(row.scope,/never an acceptance receipt/);assert.doesNotMatch(JSON.stringify(row),/secret/);assert.throws(()=>playerCloseLatencyReceipt(row,run));
 assert.equal(playerCloseLatencyEvents(Array(12).fill(event('ack')).join('\n'),run).dropped,4);
 assert.throws(()=>playerCloseLatencyEvents('','invalid'));
});
test('the close observer is a finite opt-in probe of a real rendered player and never repeats the close',()=>{
 const java=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8'),method=java.slice(java.indexOf('private void checkPlayerCloseLatency('),java.indexOf('\n  private ',java.indexOf('private void checkPlayerCloseLatency(')+1));
 assert.equal([...method.matchAll(/action\("player\.close"/g)].length,1);assert.match(method,/waitPlayer\("video-0",true\)/);assert.match(method,/for\(int i=0;i<6;i\+\+\)/);assert.match(method,/ended\.countDown\(\);observation\.join\(1500\)/);assert.match(method,/destroyedActivities\.contains\(producer\)&&producer\.isDestroyed\(\)/);assert.doesNotMatch(method,/\.recreate\(|\.seekTo\(|\.pauseTimers\(|\.setVolume\(|\.setPlaybackSpeed\(/);
 assert.match(method,/saveCloseLatency\(receipt\);\s*action\("player.close"/);assert.match(method,/closeLatencyEvent\("ack"\);saveCloseLatency\(receipt\)/);assert.match(java,/closeLatencyEvent\("stopped"\)/);assert.match(java,/closeLatencyEvent\("destroyed"\)/);
 const runner=fs.readFileSync(new URL('../testing/rhvideo-android.mjs',import.meta.url),'utf8');assert.match(runner,/playerCloseMode\?180000:/);assert.match(runner,/playerCloseLatencyReceipt\(/);assert.match(runner,/actual destruction; not full product acceptance/);assert.match(runner,/!closeReceiptMode&&!playerCloseMode/);
});
