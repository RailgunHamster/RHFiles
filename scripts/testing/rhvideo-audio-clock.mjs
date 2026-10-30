// Independent platform-clock diagnostic; never a substitute for RHFiles playback.
// No app install, app data, volume changes, service reset or private reflection.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {admitLocalClockDevice} from './rhvideo-local-clock.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),serial=process.argv[2];
assert(/^emulator-\d+$/.test(serial||''),'Only an owned emulator serial is accepted');
const sdk=process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk'),java=process.env.JAVA_HOME;
assert(java&&fs.existsSync(path.join(java,'bin/javac.exe')),'Set JAVA_HOME to the QA JDK');
const adb=path.join(sdk,'platform-tools/adb.exe'),android=path.join(sdk,'platforms/android-36/android.jar');
const run=(exe,args,timeout=20000)=>execFileSync(exe,args,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:1024*1024});
const device=args=>run(adb,['-s',serial,...args]);
const kernel=device(['shell','getprop','ro.kernel.qemu']),avd=device(['emu','avd','name']);
admitLocalClockDevice(serial,kernel,avd);
const name=avd.split(/\r?\n/).map(v=>v.trim()).filter(v=>v!=='OK').join('');
// A standalone audio control must not compete with an earlier owned playback.
// Refuse it instead of stopping/restarting another process to make it pass.
for(const processName of ['com.railgunhamster.rhfiles','stagefright']){
  try{assert.equal(device(['shell','pidof',processName]).trim(),'','Existing playback invalidates an independent PCM control');}
  catch(error){if(error.status!==1)throw error;}
}
const artifactRoot=path.join(root,'test-artifacts');assert(!fs.lstatSync(artifactRoot).isSymbolicLink(),'The diagnostic artifact root cannot be a link');
const artifact=fs.mkdtempSync(path.join(artifactRoot,'rhvideo-pcm-clock-')),classes=path.join(artifact,'classes'),dex=path.join(artifact,'dex');fs.mkdirSync(classes);fs.mkdirSync(dex);
const source=path.join(root,'scripts/testing/android/PcmClock.java'),sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const receipt={serial,avd:name,artifact,sourceSha256:sha(source),cases:[],scope:'Public AudioTrack in a shell-UID process, not the RHFiles app UID or Media3; no playback-quality acceptance claim'};
fs.writeFileSync(path.join(artifact,'compile.log'),run(path.join(java,'bin/javac.exe'),['-source','8','-target','8','-cp',android,'-d',classes,source],30000));
const d8=fs.readdirSync(path.join(sdk,'build-tools')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(v=>path.join(sdk,'build-tools',v,'lib/d8.jar')).find(fs.existsSync);assert(d8,'Android D8 is required');
const compiled=fs.readdirSync(classes,{recursive:true}).filter(v=>v.endsWith('.class')).map(v=>path.join(classes,v));assert(compiled.length>0);
fs.appendFileSync(path.join(artifact,'compile.log'),run(path.join(java,'bin/java.exe'),['-cp',d8,'com.android.tools.r8.D8','--min-api','31','--lib',android,'--output',dex,...compiled],30000));
const remote='/data/local/tmp/rhfiles-qa-pcm-'+randomUUID().replaceAll('-',''),dexFile=path.join(dex,'classes.dex');receipt.dexSha256=sha(dexFile);
device(['shell','mkdir',remote]);device(['push',dexFile,remote+'/classes.dex']);assert.equal(device(['shell','sha256sum',remote+'/classes.dex']).slice(0,64),receipt.dexSha256);
console.log('Independent PCM clock: '+artifact);
try{
  for(const count of [1,3]){
    // The guest timeout only owns this app_process. It never resets AudioFlinger,
    // Windows audio, the emulator, RHFiles or any other guest process.
    let stdout='',stderr='',exitCode=0;const started=performance.now();
    try{stdout=device(['shell','timeout','15','env','CLASSPATH='+remote+'/classes.dex','app_process','/system/bin','com.railgunhamster.rhfiles.qa.PcmClock',String(count)]);}
    catch(error){stdout=String(error.stdout||'');stderr=String(error.stderr||'');exitCode=Number.isInteger(error.status)?error.status:null;}
    fs.writeFileSync(path.join(artifact,'pcm-'+count+'.log'),stdout+'\n'+stderr);
    const lines=stdout.split(/\r?\n/).filter(v=>v.startsWith('{'));let report=null;try{report=JSON.parse(lines.at(-1));}catch{}
    receipt.cases.push({count,exitCode,hostElapsedMs:performance.now()-started,report});console.log(JSON.stringify(receipt.cases.at(-1)));
  }
  assert.equal(sha(source),receipt.sourceSha256,'Source must not change during the diagnostic');
}finally{fs.writeFileSync(path.join(artifact,'receipt.json'),JSON.stringify(receipt,null,2));}
// A low clock is valid diagnostic evidence, not a successful playback result.
if(receipt.cases.some(value=>value.exitCode!==0||value.report?.clockHealthy!==true))process.exitCode=1;
