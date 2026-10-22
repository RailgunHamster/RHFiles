// Explicit emulator-only acceptance check. Build both APKs first; it never
// installs on a physical device and never publishes an artifact.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
import {launchApp} from './app-session.mjs';
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT,adb=path.join(sdk||'','platform-tools','adb.exe');
const device=process.argv[2],apk=process.argv[3],testApk=process.argv[4];
if(!/^emulator-\d+$/.test(device||'')||!apk||!testApk)throw Error('Usage: node scripts/testing/android-lan-probe.mjs emulator-N APP.apk TEST.apk');
for(const file of [adb,apk,testApk])if(!fs.existsSync(file))throw Error('Missing: '+file);
const run=(...args)=>execFileSync(adb,['-s',device,...args],{encoding:'utf8',windowsHide:true,timeout:120000});
assert.match(run('shell','getprop','ro.kernel.qemu'),/1/);
assert.match(run('emu','avd','name'),/^RHFiles[^\r\n]*[\r\n]/,'Only an RHFiles-owned test AVD may be modified');
run('install','-r','-t',apk);run('install','-r','-t',testApk);
const app=await launchApp(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-lan-emulator-')),port=44128;
try{
  fs.writeFileSync(path.join(directory,'中文.txt'),'0123456789');
  const status=await app.evaluate(`call('lan_service_start',{config:{port:0,shares:[{name:'Files',path:${JSON.stringify(directory)}}]}})`);
  run('reverse','tcp:'+port,'tcp:'+status.port);
  const pair=await app.evaluate("call('lan_service_pair',{permissions:{write:true,delete:false}})");
  const payload=JSON.parse(Buffer.from(pair.connectionUri.split(':')[2],'base64url').toString());payload.endpoints=[`https://127.0.0.1:${port}`];
  const uri='rhfiles-connect:v1:'+Buffer.from(JSON.stringify(payload)).toString('base64url');
  const output=run('shell','am','instrument','-w','-r','-e','uri',uri,'com.railgunhamster.rhfiles.test/com.railgunhamster.rhfiles.LanServiceInstrumentation');
  fs.writeFileSync(path.join(app.artifactDir,'android-lan-probe.txt'),output);assert.match(output,/pass=true/);assert.doesNotMatch(output,/error=/);
  assert.equal(fs.readFileSync(path.join(directory,'手机目录','重命名.txt'),'utf8'),'hello');
  const copied=fs.readdirSync(directory).find(n=>n.startsWith('rhfiles-lan-')&&n.endsWith('.bin'));assert.ok(copied);
  const bytes=fs.readFileSync(path.join(directory,copied));assert.equal(bytes.length,2500000);assert.ok(bytes.every((b,i)=>b===i%251));
  console.log(JSON.stringify({pass:true,device,checks:'Android real HTTPS pairing, browse, Range, tus, background copy, byte-for-byte verification',artifacts:app.artifactDir}));
}finally{run('reverse','--remove','tcp:'+port);await app.evaluate("call('lan_service_stop',{})").catch(()=>{});app.close();}
