// Emulator-only cross-language test of the shipped, minified public API.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync,spawn} from 'node:child_process';import assert from 'node:assert/strict';
import {launchApp} from './app-session.mjs';
const [device,apk,testApk]=process.argv.slice(2),adb=path.join(process.env.ANDROID_HOME||'','platform-tools','adb.exe');
if(!/^emulator-\d+$/.test(device||'')||!apk||!testApk)throw Error('Usage: android-groups-probe.mjs emulator-N APP.apk TEST.apk');
const run=(...args)=>execFileSync(adb,['-s',device,...args],{encoding:'utf8',windowsHide:true,timeout:120000});
assert.match(run('shell','getprop','ro.kernel.qemu'),/1/);assert.match(run('emu','avd','name'),/^RHFiles[^\r\n]*[\r\n]/);
run('install','-r','-t',apk);run('install','-r','-t',testApk);
run('shell','pm','clear','com.railgunhamster.rhfiles'); // Owned emulator fixture only.
const app=await launchApp({desktopId:'device-group-a'}),b=await launchApp({desktopId:'device-group-b'}),directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-group-native-'));
let port;
const call=(app,command,args={})=>app.evaluate(`call('device_groups',{command:${JSON.stringify(command)},args:${JSON.stringify(args)}})`);
function phase(groupPhase,args={}){const extra=Object.entries({groupPhase,loopback:'https://127.0.0.1:'+port,...args}).flatMap(([k,v])=>['-e',k,String(v)]);const output=run('shell','am','instrument','-w','-r',...extra,'com.railgunhamster.rhfiles.test/com.railgunhamster.rhfiles.LanServiceInstrumentation');fs.writeFileSync(path.join(app.artifactDir,'android-groups-'+groupPhase+'.txt'),output);assert.match(output,/pass=true/,output);assert.doesNotMatch(output,/error=/);return output;}
async function restartPhase(id){
  let output='',restarting;const proc=spawn(adb,['-s',device,'shell','am','instrument','-w','-r','-e','groupPhase','restart','-e','groupId',id,'-e','loopback','https://127.0.0.1:'+port,'com.railgunhamster.rhfiles.test/com.railgunhamster.rhfiles.LanServiceInstrumentation'],{windowsHide:true});
  const timer=setTimeout(()=>proc.kill(),120000);
  proc.stdout.on('data',bytes=>{output+=bytes.toString();if(output.includes('restartReady=true')&&!restarting)restarting=(async()=>{await app.evaluate("call('lan_service_stop',{})");await app.evaluate(`call('lan_service_start',{config:{port:${port},shares:[{name:'Files',path:${JSON.stringify(directory)}}]}})`);})();});proc.stderr.on('data',b=>{output+=b.toString()});
  await new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('exit',code=>code===0?resolve():reject(Error('Instrumentation exited '+code)));}).finally(()=>clearTimeout(timer));
  assert.ok(restarting,'Cached session established before restarting the isolated service');await restarting;fs.writeFileSync(path.join(app.artifactDir,'android-groups-restart.txt'),output);assert.match(output,/pass=true/,output);assert.doesNotMatch(output,/error=/);
}
try{
  fs.writeFileSync(path.join(directory,'中文.txt'),'group-native-interop');
  const status=await app.evaluate(`call('lan_service_start',{config:{port:0,shares:[{name:'Files',path:${JSON.stringify(directory)}}]}})`);port=status.port;run('reverse','tcp:'+port,'tcp:'+port);
  const id=await call(app,'create',{name:'跨端设备组 QA',deviceName:'Windows A'}),aId=(await call(app,'state')).deviceId;
  const request=await call(b,'request',{deviceName:'Offline introducer B'});const approval=await call(app,'approve',{id,uri:request.uri,canInvite:true});await call(b,'join',{uri:approval.uri,confirmed:true});
  const output=phase('request'),mobileRequest=Buffer.from(output.match(/groupData=([^\r\n]+)/)[1].trim(),'base64').toString();
  const mobileApproval=await call(b,'approve',{id,uri:mobileRequest,canInvite:false});b.close();
  const joined=phase('join',{groupId:id,approval:Buffer.from(mobileApproval.uri).toString('base64')}),phoneId=joined.match(/deviceId=([^\r\n]+)/)[1].trim();
  const learned=await call(app,'state');assert.ok(learned.groups[0].members.some(m=>m.id===phoneId&&!m.blocked),'Windows learned phone through offline B');
  await call(app,'remove',{id,peer:phoneId});phase('serverBlocked',{groupId:id});
  await call(app,'restore',{id,peer:phoneId,confirmed:true});phase('check',{groupId:id});
  await restartPhase(id);
  phase('remove',{groupId:id,peer:aId});phase('localBlocked',{groupId:id,peer:aId});phase('restore',{groupId:id,peer:aId});
  const ui=phase('ui',{groupId:id});fs.writeFileSync(path.join(app.artifactDir,'android-device-groups.png'),Buffer.from(ui.match(/screenshot=([^\r\n]+)/)[1].trim(),'base64'));
  await app.evaluate("setLang('zh');openSettings();switchSettingsSection('lan');true");await new Promise(r=>setTimeout(r,600));await app.screenshot('device-groups-native-interop');
  console.log(JSON.stringify({pass:true,device,checks:'Android Keystore P-256 ↔ Rust signatures; offline B introduction; native group browsing; server removal; client refusal after process restart; refresh cannot re-add; explicit manual restore',artifacts:app.artifactDir}));
}finally{if(port)run('reverse','--remove','tcp:'+port);await app.evaluate("call('lan_service_stop',{})").catch(()=>{});app.close();b.close();}
