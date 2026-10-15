// Real updater/installer tests. Refuses physical devices via androidSession().
// Install a debug test baseline with versionCode lower than the supplied release.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {androidSession,until,pause} from './testing/android-session.mjs';

const apkPath=path.resolve(process.argv[2] || 'android/dist/rhfiles-android-arm64-v8a-release.apk');
const sdk=process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
const buildTools=fs.readdirSync(path.join(sdk,'build-tools')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))[0];
const aapt=path.join(sdk,'build-tools',buildTools,process.platform==='win32'?'aapt.exe':'aapt');
const badging=execFileSync(aapt,['dump','badging',apkPath],{encoding:'utf8',windowsHide:true});
const identity=badging.match(/package: name='com\.railgunhamster\.rhfiles' versionCode='(\d+)' versionName='([^']+)'/);assert.ok(identity,'Real RHFiles release APK required');
const releaseCode=Number(identity[1]),releaseVersion=identity[2];
const actual=fs.readFileSync(apkPath),hash=crypto.createHash('sha256').update(actual).digest('hex');
const badSignature=process.argv[3]?fs.readFileSync(path.resolve(process.argv[3])):null;
let app=await androidSession();
// Revoking install permission kills the app on Android 16. Do it before opening
// the test's CDP session, never halfway through an in-flight bridge call.
app.close();app.adb('shell','am','force-stop','com.railgunhamster.rhfiles');
app.adb('shell','appops','set','com.railgunhamster.rhfiles','REQUEST_INSTALL_PACKAGES','deny');
await pause(500);app=await androidSession();
const results=[];let mode='valid',downloads=0,feeds=0;
const record=(name,value,detail)=>{results.push({name,pass:!!value,detail});console.log((value?'PASS':'FAIL')+' — '+name+(detail?' — '+JSON.stringify(detail):''));assert.ok(value,name);};
const server=http.createServer((req,res)=>{
  if(req.url==='/updates/releases.android.json'){
    feeds++;if(mode==='404')return res.writeHead(404).end();
    const code=mode==='wrong-version'?releaseCode+1:releaseCode;
    const bytes=mode==='bad-signature'?badSignature:actual;
    return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({schemaVersion:1,packageId:'com.railgunhamster.rhfiles',releases:[{version:releaseVersion,versionCode:code,minSdk:24,notes:'真实 APK 更新测试\n第二行',assets:[{abi:'arm64-v8a',fileName:'update.apk',size:bytes.length,sha256:mode==='bad-hash'?'0'.repeat(64):crypto.createHash('sha256').update(bytes).digest('hex')}]}]}));
  }
  if(req.url==='/updates/update.apk'){
    const bytes=mode==='bad-signature'?badSignature:actual;
    downloads++;res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Length':bytes.length});
    let offset=0;const timer=setInterval(()=>{if(res.destroyed)return clearInterval(timer);const end=Math.min(bytes.length,offset+128*1024);res.write(bytes.subarray(offset,end));offset=end;if(offset===bytes.length){clearInterval(timer);res.end();}},25);return;
  }
  res.writeHead(404).end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;app.adb('reverse','tcp:'+port,'tcp:'+port);
const native=(cmd,args={})=>app.evaluate(`api.native(${JSON.stringify(cmd)},${JSON.stringify(args)})`);
const settled=()=>until(async()=>{const s=await native('update.status');return !['checking','downloading','verifying'].includes(s.state)&&s;},'update task completion',60000);
try {
  record('Updater is present in real APK',await app.evaluate('api.updatesAvailable()'));
  const initial=await settled();record('Test baseline predates candidate APK',initial.currentCode<releaseCode,initial.currentCode);
  const config={...initial.config,autoCheck:false,source:'family',family:`http://127.0.0.1:${port}/updates/`,connectionId:''};
  await native('update.save',config);
  for(const reason of ['startup','settings','hour'])await native('update.check',{manual:false,reason});
  record('Disabled automatic checks make no HTTP requests',feeds===0,feeds);
  mode='404';await native('update.check',{manual:true});const missing=await settled();record('Missing feed is failure, never latest',missing.state==='failed' && missing.message.includes('404'),missing.message);
  for(const test of ['bad-hash','wrong-version',...(badSignature?['bad-signature']:[])]){
    mode=test;await native('update.check',{manual:true});await settled();await native('update.download');const outcome=await settled();
    record('Rejects '+test+' before install',outcome.state==='failed' && outcome.message.includes(test==='bad-hash'?'SHA-256':test==='bad-signature'?'签名':'版本'),outcome.message);
  }
  mode='valid';await native('update.check',{manual:true});await settled();await native('update.download');
  await until(async()=>{const s=await native('update.status');return s.state==='downloading'&&s.bytes>0&&s.bytes<actual.length;},'intermediate download progress');
  record('Real HTTP download reports intermediate bytes',true);
  await native('update.cancel');const canceled=await settled();record('Cancellation is not completion',canceled.state==='canceled',canceled.message);
  await native('update.download');await settled();const ready=await native('update.status');record('Actual signed release APK passes all checks',ready.state==='ready',ready.message);
  await app.click('#btn-menu');await app.click('#nav-settings');await until(()=>app.evaluate('!!document.getElementById("update-install")'),'update settings UI');
  await app.screenshot('update-ready');
  record('First installation asks for unknown-app permission',await native('update.install')==='permission');
  await until(()=>app.adb('shell','dumpsys','activity','activities').match(/topResumedActivity=.*com.android.settings/),'system unknown-app settings');
  app.adb('shell','uiautomator','dump','/data/local/tmp/rhfiles-unknown-apps.xml');const permissionXml=app.adb('shell','cat','/data/local/tmp/rhfiles-unknown-apps.xml');
  record('System unknown-app settings is foreground',permissionXml.includes('Install unknown apps') && permissionXml.includes('RHFiles'));
  // Only the emulator is mutated. Click the observed system permission toggle.
  const toggle=permissionXml.match(/<node[^>]*checkable="true"[^>]*checked="false"[^>]*clickable="true"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(toggle,'Observed permission toggle');
  app.adb('shell','input','tap',String((Number(toggle[1])+Number(toggle[3]))/2),String((Number(toggle[2])+Number(toggle[4]))/2));app.adb('shell','input','keyevent','4');
  await until(()=>app.adb('shell','dumpsys','activity','activities').match(/topResumedActivity=.*(?:packageinstaller|permissioncontroller).*?(?:Install|install)/),'system installer after granting permission');
  record('Permission return automatically resumes system installation',true);
  app.adb('shell','uiautomator','dump','/data/local/tmp/rhfiles-installer.xml');const xml=app.adb('shell','cat','/data/local/tmp/rhfiles-installer.xml');
  fs.writeFileSync(path.join(app.artifactDir,'installer.xml'),xml);
  assert.ok(xml.includes('Do you want to update this app?'),'System must identify this as an update, not a fresh install');
  const match=xml.match(/<node[^>]*resource-id="(?:(?:com\.google\.android\.packageinstaller|com\.android\.packageinstaller):id\/ok_button|android:id\/button1)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  assert.ok(match,'Observed system installation confirmation button must exist');
  const before=app.adb('shell','dumpsys','package','com.railgunhamster.rhfiles');assert.ok(before.includes('versionCode='+initial.currentCode));
  app.adb('shell','input','tap',String((Number(match[1])+Number(match[3]))/2),String((Number(match[2])+Number(match[4]))/2));
  await until(()=>app.adb('shell','dumpsys','package','com.railgunhamster.rhfiles').includes('versionCode='+releaseCode),'system actually installs APK',60000);
  record('System confirmation actually upgrades to shipping APK',true);
  record('APK downloads were exercised, not mocked',downloads>=4,downloads);
} finally {
  fs.writeFileSync(path.join(app.artifactDir,'update-regression.json'),JSON.stringify(results,null,2));
  app.close();app.adb('reverse','--remove','tcp:'+port);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  console.log('Evidence: '+app.artifactDir);
}
