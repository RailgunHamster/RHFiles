import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyReferenceClock} from '../testing/rhvideo-android-reference-clock.mjs';
const runner=fileURLToPath(new URL('../testing/rhvideo-android-reference-clock.mjs',import.meta.url));
const before=()=>Array.from({length:3},(_,i)=>({id:'video-'+i,input:i+1,positionMs:1000,presentedMs:1000,frames:24,width:360,height:640,durationMs:20000,rate:1,volume:.2,muted:false,paused:false,ended:false,error:null,readyState:4}));
const after=value=>value.map(row=>({...row,positionMs:row.positionMs+4900,presentedMs:row.presentedMs+4900,frames:row.frames+110}));
test('actual reference clock requires all three continuously presented non-muted original inputs',()=>{const a=before(),b=after(a),result=verifyReferenceClock(a,b,5020);assert.equal(result.length,3);assert(result.every(row=>row.positionDeltaMs===4900&&row.frameDelta===110));});
for(const [field,value]of [['input',99],['id','other'],['volume',0],['muted',true],['paused',true],['ended',true],['error',{code:4}],['rate',2],['width',180],['height',320],['durationMs',10000],['readyState',1],['positionMs',2000],['presentedMs',2000],['frames',30]])test('reference control rejects a false pass for '+field,()=>{const a=before(),b=after(a);b[1][field]=value;assert.throws(()=>verifyReferenceClock(a,b,5020));});
test('reference control rejects missing/duplicate streams and out-of-budget observation',()=>{const a=before(),b=after(a);for(const elapsed of [4999,10000])assert.throws(()=>verifyReferenceClock(a,b,elapsed));assert.throws(()=>verifyReferenceClock(a,b.slice(1),5020));b[1].id=b[0].id;assert.throws(()=>verifyReferenceClock(a,b,5020));});
test('reference control requires an actual identified video element and captures audio before stopping it',()=>{
  for(const [field,value]of [['id',''],['input',undefined],['input',0]]){const a=before(),b=after(a);a[1][field]=b[1][field]=value;assert.throws(()=>verifyReferenceClock(a,b,5020));}
  const source=fs.readFileSync(runner,'utf8');assert(source.indexOf("['audio-flinger.log'")<source.indexOf("run(['shell','am','force-stop'"));assert(source.indexOf("if(receipt.passed&&process.exitCode!==1)")>source.indexOf("fs.writeFileSync(path.join(artifact,'receipt.json')"));
});
test('reference control refuses phones before SDK access and never installs an APK or changes audio/codecs',()=>{
  for(const serial of ['', 'Moto','192.168.0.114:46413','emulator-5590;adb']){const result=spawnSync(process.execPath,[runner,...(serial?[serial]:[])],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(result.status,1);assert.match(result.stderr,/Only an explicit owned emulator serial is accepted/);assert.equal(result.stdout,'');}
  const source=fs.readFileSync(runner,'utf8');assert.match(source,/admitLocalClockDevice\(serial,/);assert.match(source,/Existing playback invalidates/);assert.match(source,/sha256sum/);assert.match(source,/requestVideoFrameCallback/);assert.match(source,/await pause\(5000\);receipt.after/);assert.doesNotMatch(source,/\['install'|setWebLifecycleState|settings.*put|setPlaybackParameters|MediaCodec|reboot|setStreamVolume/);
});
