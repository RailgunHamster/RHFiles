import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {systemAudioTrack,audioClockObservation} from '../testing/rhvideo-system-audio.mjs';
const row='85 yes 12159 1569 45 A 0x000 00000001 0000000C 48000 3 1 0 -33 0 0 0 000A1434 4360 8 A 264268 0 false 50.31 t';
test('system PCM parser correlates the exact active process, track and real mixer counters',()=>{
  const expected={id:85,client:12159,sampleRate:48000,serverFrames:0xA1434,bufferFrames:4360,framesReady:8,underruns:264268};
  assert.deepEqual(systemAudioTrack('header\n'+row,12159),expected);
  assert.deepEqual(systemAudioTrack('S '+row,12159),expected);
  assert.equal(systemAudioTrack(row,11537),null);
  assert.equal(systemAudioTrack(row.replace('yes','no'),12159),null);
});
test('ambiguous tracks, unknown layouts and missing PCM fields fail instead of fabricating progress',()=>{
  for(const text of [row+'\n'+row,row.replace('000A1434','invalid'),row.replace('48000','unknown'),row.replace('0x000','bad')])assert.throws(()=>systemAudioTrack(text,12159));
  assert.throws(()=>systemAudioTrack(row,0));
});
const sample=(started,finished,serverFrames)=>({started,finished,track:{id:85,client:12159,sampleRate:48000,serverFrames}});
test('system audio observation reports a wall-time uncertainty envelope, not an app pass',()=>{
  const result=audioClockObservation(sample(100,200,96000),sample(5200,5400,216000));
  assert.equal(result.mediaMs,2500);assert.equal(result.minimumWallMs,5000);assert.equal(result.maximumWallMs,5300);
  assert.equal(result.maximumRate,.5);assert.equal(result.minimumRate,2500/5300);assert.equal(result.diagnosticOnly,true);
  assert(!Object.hasOwn(result,'passed'));
});
test('a different input, reset counter or unbounded interval cannot become a valid clock observation',()=>{
  const before=sample(100,200,96000);
  for(const key of ['id','client','sampleRate']){const after=sample(5200,5400,216000);after.track[key]++;assert.throws(()=>audioClockObservation(before,after));}
  for(const after of [sample(5100,5200,216000),sample(15200,15400,216000),sample(5200,5400,1),sample(NaN,5400,216000)])assert.throws(()=>audioClockObservation(before,after));
  for(const frames of [0,95999,288000])assert.throws(()=>audioClockObservation(sample(100,200,frames),sample(5200,5400,500000)));
});
test('system clock runner is bounded, isolated and never changes media/player/network/system settings',()=>{
  const source=fs.readFileSync(new URL('../testing/rhvideo-system-audio.mjs',import.meta.url),'utf8');
  assert.match(source,/admitLocalClockDevice\(serial/);assert.match(source,/noProcess\('stagefright'\);noProcess\('com\.railgunhamster\.rhfiles'\)/);
  assert.match(source,/'timeout','30','stagefright','-a','-o','-q',media/);
  assert.match(source,/sha256sum/);assert.match(source,/setTimeout\(resolve,5100\)/);
  assert.doesNotMatch(source,/\['install'|\['reverse'|force-stop|setprop|settings','put|killall|setPlaybackSpeed|seekTo|\.volume=/);
});
