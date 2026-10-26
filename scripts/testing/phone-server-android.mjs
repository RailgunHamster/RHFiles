// Actual release phone server + desktop native browser. Owned emulator only.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn,execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {launchApp,until} from './app-session.mjs';import {cdpSession,allocateAdbForward} from '../rhfiles-api.mjs';
const [serial,apk,probe]=process.argv.slice(2);assert.match(serial||'',/^emulator-\d+$/);assert(apk&&probe,'Provide actual release APK and instrumentation APK');
const sdk=process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk'),adb=path.join(sdk,'platform-tools/adb.exe');
const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:120000,windowsHide:true});
assert.equal(run(['shell','getprop','ro.kernel.qemu']).trim(),'1');assert.equal(run(['emu','avd','name']).split(/\r?\n/)[0].trim(),'RHFilesRhVideoQA20261027');
assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-phone-service-')),remote='/storage/emulated/0/Download/RHFiles-service-qa-'+Date.now(),artifacts=path.resolve('test-artifacts/phone-server-android');fs.mkdirSync(artifacts,{recursive:true});
fs.writeFileSync(path.join(tmp,'中文 % #.txt'),'手机共享 · 中文 0123456789');fs.mkdirSync(path.join(tmp,'子目录'));
const bmp=Buffer.alloc(70);bmp.write('BM');bmp.writeUInt32LE(70,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(2,18);bmp.writeInt32LE(2,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);bmp.writeUInt32LE(16,34);for(let i=54;i<70;i++)bmp[i]=i%3?255:0;fs.writeFileSync(path.join(tmp,'image.bmp'),bmp);
let pc,phone,child,forward,debugForward,testGroup;let output='';
const desktop=(id,args={})=>pc.evaluate('RHFilesAPI.invoke('+JSON.stringify(id)+','+JSON.stringify(args)+')');
const handset=(id,args={})=>phone.evaluate('(RHFilesAPI.forPane?RHFilesAPI.forPane("active"):RHFilesAPI).invoke('+JSON.stringify(id)+','+JSON.stringify(args)+')');
try{
 for(const [id,file]of [['com.railgunhamster.rhfiles',apk],['com.railgunhamster.rhfiles.test',probe]]){console.log(run(['install','-r',path.resolve(file)]).trim());const installed=run(['shell','pm','path',id]).trim().slice(8);assert.equal(run(['shell','sha256sum',installed]).slice(0,64),createHash('sha256').update(fs.readFileSync(file)).digest('hex'));}
 run(['shell','appops','set','--uid','com.railgunhamster.rhfiles','MANAGE_EXTERNAL_STORAGE','allow']);run(['shell','pm','grant','com.railgunhamster.rhfiles','android.permission.POST_NOTIFICATIONS']);run(['push',tmp,remote]);run(['shell','mkdir','-p',remote+'/子目录']);
 run(['shell','am','force-stop','com.railgunhamster.rhfiles']);child=spawn(adb,['-s',serial,'shell','am','instrument','-w','com.railgunhamster.rhfiles.test/com.railgunhamster.rhfiles.PhoneServerInstrumentation'],{windowsHide:true});child.stdout.on('data',b=>{output+=b;process.stdout.write(b);});child.stderr.on('data',b=>{output+=b;process.stderr.write(b);});
 await until(()=>{if(/INSTRUMENTATION_RESULT: failure=/.test(output))throw Error(output);return /ready=true/.test(output);},'owned emulator bootstrap',90000);
 const pid=run(['shell','pidof','com.railgunhamster.rhfiles']).trim();assert.match(pid,/^\d+$/);const cdp=debugForward=allocateAdbForward(run,'localabstract:webview_devtools_remote_'+pid);
 const target=await until(async()=>{const all=await(await fetch('http://127.0.0.1:'+cdp+'/json/list')).json();return all.find(t=>t.type==='page'&&/^https?:\/\/(tauri\.)?localhost/.test(t.url));},'phone WebView target');
 phone=await cdpSession(target,30000);await until(()=>phone.evaluate('(()=>{try{return (RHFilesAPI.forPane?RHFilesAPI.forPane("active"):RHFilesAPI).list().some(v=>v.id==="fileServer.start")}catch{return false}})()'),'phone shared APIs');
 pc=await launchApp({desktopId:'phone-device-browser',emulateFocus:true});
 const existing=await handset('groups.state');assert.equal(existing.groups.length,0,'Use a clean owned emulator, never remove arbitrary existing groups');
 const group=testGroup=await desktop('groups.create',{name:'RH phone browser QA',deviceName:'Fixture computer',permissions:{write:true,delete:true}}),request=await handset('groups.request',{deviceName:existing.defaultDeviceName}),approval=await desktop('groups.approve',{id:group,uri:request.uri,canInvite:true});
 // The relay must preserve the phone's signed endpoint port. Accepting a
 // different arbitrary loopback port would weaken endpoint binding; never
 // relax production authentication just to accommodate this emulator fixture.
 forward=allocateAdbForward(run,'tcp:39237',{randomPort:()=>39237});
 await handset('navigation.tool',{tool:'server'});
 assert.equal((await handset('fileServer.roots')).opened,true,'Root chooser returns structured state, not a DOM object');
 const fields=await handset('ui.list');for(const [name,value]of [['name','Phone'],['path',remote]]){const field=fields.find(v=>v.target?.name===name&&v.kind==='input');assert(field,'Share '+name+' is accessible through ui.set');await handset('ui.set',{controlId:field.controlId,value});}
 const save=(await handset('ui.list')).find(v=>v.label==='保存'&&v.kind==='button');assert(save);await handset('ui.invoke',{controlId:save.controlId});
 await phone.evaluate('window.__serverStart=null;void (RHFilesAPI.forPane?RHFilesAPI.forPane("active"):RHFilesAPI).invoke("fileServer.start",'+JSON.stringify({roots:[{name:'Phone',path:remote}],port:Number(forward)})+').then(value=>window.__serverStart={value}).catch(e=>window.__serverStart={error:String(e)});');
 const confirm=await until(async()=>{const all=await handset('ui.list');return all.controls?.find(v=>v.label==='启动')||all.find?.(v=>v.label==='启动');},'explicit shared-root confirmation');
 await handset('ui.invoke',{controlId:confirm.controlId,confirmationToken:confirm.confirmationToken,acknowledge:true});
 const started=await until(()=>phone.evaluate('window.__serverStart'),'native service startup');assert(!started.error,started.error);assert.equal(started.value.running,true);assert(!JSON.stringify(started).includes('password'));
 // Joining AFTER startup must publish this already-running service into the
 // new group through the same membership/API path, not a test-only shortcut.
 await handset('groups.join',{uri:approval.uri,confirmed:true});
 const notification=run(['shell','dumpsys','activity','services','com.railgunhamster.rhfiles']);assert.match(notification,/DeviceFileService/);assert.match(notification,/isForeground=true/);
 await desktop('groups.join',{uri:(await handset('groups.export',{id:group})).uri,confirmed:true});const devices=(await desktop('devices.refresh')).devices;assert.equal(devices.length,1);const device=devices[0];assert.equal(device.peer,(await handset('groups.state')).deviceId);
 assert.equal(started.value.port,Number(forward));const connection=await desktop('groups.connect',{id:group,peer:device.peer,endpoint:'https://127.0.0.1:'+forward});if(connection.outcome!=='connected'){fs.writeFileSync(path.join(artifacts,'connection-diagnostics.json'),JSON.stringify(connection,null,2));console.log(JSON.stringify(connection));}assert.equal(connection.outcome,'connected');
 await desktop('devices.open',{group,peer:device.peer});assert.equal((await desktop('files.list')).entries[0].name,'Phone');await desktop('navigation.open',{path:device.path+'Phone'});assert.equal((await desktop('files.list')).total,3);
 const file=device.path+'Phone/'+encodeURIComponent('中文 % #.txt');assert.equal((await desktop('devices.preview',{path:file})).text_content,'手机共享 · 中文 0123456789');
 await desktop('selection.set',{paths:[device.path+'Phone/image.bmp']});await until(()=>pc.evaluate('document.querySelector("#preview-content img")?.naturalWidth===2'),'real phone image through native desktop broker');
 const resource=(await desktop('devices.resource',{path:file})).url;assert.equal((await pc.evaluate('(async()=>{const r=await fetch('+JSON.stringify(resource)+',{headers:{Range:"bytes=0-5"}});return {status:r.status,bytes:(await r.arrayBuffer()).byteLength}})()')).status,206);
 await pc.screenshot('phone-device-browser');
 await handset('groups.remove',{id:group,peer:(await desktop('groups.state')).deviceId});
 assert.equal(await pc.evaluate('fetch('+JSON.stringify(resource)+').then(r=>r.status)'),401,'Server-local removal revokes old streams/capabilities');await assert.rejects(desktop('devices.entries',{path:device.path+'Phone'}),/unauthorized|已移除|授权|revoked/);
 await handset('groups.forget',{id:group,confirmed:true});assert.equal((await handset('groups.state')).groups.length,0);assert.equal((await handset('fileServer.stop')).running,false);
 assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/);console.log('PASS: actual release phone Keystore group HTTPS/WebDAV server, desktop normal tabs, text/image/range, foreground lifetime and server-local revocation');
}finally{
 if(phone){if(testGroup)await handset('groups.forget',{id:testGroup,confirmed:true}).catch(()=>{});await handset('fileServer.stop').catch(()=>{});await phone.evaluate('window.__phoneQaDone=true').catch(()=>{});phone.close();}
 if(child){await Promise.race([new Promise(resolve=>child.once('close',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);if(child.exitCode===null)child.kill();}
 fs.writeFileSync(path.join(artifacts,'instrumentation.log'),output);for(const port of [forward,debugForward].filter(Boolean))try{run(['forward','--remove','tcp:'+port]);}catch{}pc?.close();
 // Exact generated fixture only, never shared-storage root or real media.
 if(/^\/storage\/emulated\/0\/Download\/RHFiles-service-qa-\d+$/.test(remote))try{run(['shell','rm','-r',remote]);}catch{}fs.rmSync(tmp,{recursive:true,force:true});
}
