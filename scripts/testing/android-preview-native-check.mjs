// Explicit, owned emulator only. All remote data and groups belong to this run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {androidSession,until,pause} from './android-session.mjs';
import {launchApp} from './app-session.mjs';
import {listenBrowserLoopback} from './browser-loopback.mjs';
const [serial,apk,python,receiptFile]=process.argv.slice(2);
if(!/^emulator-\d+$/.test(serial||'')||!apk||!python||!receiptFile)throw Error('Usage: android-preview-native-check.mjs emulator-N FORMAL.apk FIXTURE-python.exe OWNED-EMULATOR.json (app must already be foreground with ADB automation enabled)');
const receipt=JSON.parse(fs.readFileSync(receiptFile));
const manifest=JSON.parse(fs.readFileSync('android/src-tauri/tauri.conf.json'));
assert.equal(receipt.serial,serial);assert.equal(receipt.readOnly,true);
const adbExe=path.join(process.env.ANDROID_HOME,'platform-tools','adb.exe');
const adb=(...args)=>{const r=spawnSync(adbExe,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:120000});if(r.status!==0)throw Error(r.stderr||r.stdout||String(r.error));return r.stdout.trim();};
assert.equal(adb('shell','getprop','ro.kernel.qemu'),'1');assert.equal(adb('emu','avd','name').split('\n')[0].trim(),receipt.avd);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-preview-native-'));
const fixture=spawn(path.resolve(python),['-u',path.resolve('scripts/testing/protocol-fixtures.py'),directory],{windowsHide:true,stdio:['pipe','pipe','pipe']});
let output='',fixtureErrors='';fixture.stdout.on('data',b=>output+=b);fixture.stderr.on('data',b=>fixtureErrors+=b);
let phone,desktop,groupId;const connections=[];let checks=0;
let streamBytes=0,slowStarted=false;
const streaming=http.createServer((req,res)=>{
  res.writeHead(200,{'Content-Type':'text/plain','Content-Length':8*1024*1024});
  if(req.url.endsWith('/slow.txt')){slowStarted=true;res.write('waiting\n');return;}
  const timer=setInterval(()=>{streamBytes+=4096;res.write(Buffer.alloc(4096,120));if(streamBytes>=8*1024*1024){clearInterval(timer);res.end();}},4);
  res.on('close',()=>clearInterval(timer));
});
const check=(test,label)=>{assert.ok(test,label);console.log('ok '+(++checks)+' - '+label);};
const data={json:'{"名字":"真实网络预览","items":[1,2]}',md:'# 网络 Markdown\n\n**中文粗体**\n\n| A | B |\n|---|---|\n|一|二|\n\n<script>globalThis.__previewPwn=true</script>\n<img src="https://example.invalid/private" onerror="globalThis.__previewPwn=true">',large:'中文日志与 emoji 😀\n'.repeat(120000)};
fs.writeFileSync(path.join(directory,'测试.json'),data.json);fs.writeFileSync(path.join(directory,'说明.md'),data.md);fs.writeFileSync(path.join(directory,'large.log'),data.large);
fs.writeFileSync(path.join(directory,'utf16.txt'),Buffer.concat([Buffer.from([255,254]),Buffer.from('中文 UTF16 😀','utf16le')]));
fs.writeFileSync(path.join(directory,'binary.json'),Buffer.from([80,75,3,4,0,0,1,2]));fs.writeFileSync(path.join(directory,'broken.apk'),'not an apk');
const longApk='中文'.repeat(50)+'.apk';fs.copyFileSync(apk,path.join(directory,longApk));
// Solid-color PNGs generated solely for this synthetic gallery.
const drawing=`Add-Type -AssemblyName System.Drawing\nforeach($pair in @(@('a.png','Teal'),@('b.png','CornflowerBlue'),@('c.png','Coral'))){$bitmap=[System.Drawing.Bitmap]::new(400,650);$graphics=[System.Drawing.Graphics]::FromImage($bitmap);$graphics.Clear([System.Drawing.Color]::FromName($pair[1]));$bitmap.Save([IO.Path]::Combine($env:RHFILES_QA_FIXTURE,$pair[0]),[System.Drawing.Imaging.ImageFormat]::Png);$graphics.Dispose();$bitmap.Dispose()}`;
const generated=spawnSync('pwsh',['-NoProfile','-Command',drawing],{encoding:'utf8',windowsHide:true,env:{...process.env,RHFILES_QA_FIXTURE:directory}});assert.equal(generated.status,0,generated.stderr);
const sourceHash=createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
try{
  await listenBrowserLoopback(streaming);
  const ports=await until(()=>output.includes('\n')&&JSON.parse(output.split(/\r?\n/)[0]),'loopback protocol fixtures');
  console.log('Attaching to the foreground owned emulator');
  phone=await androidSession(serial,{attachOnly:true});const evaluate=phone.evaluate;
  const native=(command,args={})=>evaluate(`api.native(${JSON.stringify(command)},${JSON.stringify(args)})`);
  const call=(name,args={})=>evaluate(`(RHFilesAPI.forPane?RHFilesAPI.forPane('left'):RHFilesAPI).invoke(${JSON.stringify(name)},${JSON.stringify(args)})`);
  const view=expression=>evaluate(`(()=>{const f=[...document.querySelectorAll('iframe.file-pane')].map(e=>e.contentWindow).find(w=>w.androidTextPreview?.state().open||w.androidGallery?.state().open);const w=f||window;return (${expression})(w,w.document);})()`);
  const version=adb('shell','dumpsys','package','com.railgunhamster.rhfiles');check(version.includes('versionName='+manifest.version)&&version.includes('versionCode='+manifest.bundle.android.versionCode),'installed formal APK matches the Android source version');
  for(const file of ['js/text-preview.js','js/text-preview-worker.js','js/gallery.js','js/gallery-continuous.js','js/api.js','js/app.js','vendor/text-preview/purify.min.js']){
    const loaded=await evaluate(`fetch(${JSON.stringify(file)}).then(r=>r.text())`);assert.equal(createHash('sha256').update(loaded).digest('hex'),createHash('sha256').update(fs.readFileSync(path.join('android/web',file))).digest('hex'),file+' bundled bytes');
  }check(true,'formal WebView serves the current reader, worker, gallery and storage bridge');
  const jobsBefore=(await native('jobs')).length;
  const profiles=[{type:'webdav',name:'Preview QA DAV',url:`http://10.0.2.2:${ports.webdav}/dav/`,username:'rhfiles-qa',password:'owned-fixture-only',insecure:true},{type:'ftp',name:'Preview QA FTP',host:'10.0.2.2',port:ports.ftp,username:'rhfiles-qa',password:'owned-fixture-only',insecure:true}];
  const locations=[];
  for(const profile of profiles){const id=await native('connection.save',profile);connections.push(id);locations.push({name:profile.type,path:'remote://'+id+'/'});}
  desktop=await launchApp({desktopId:'preview-native-owned'});
  const windows=(command,args={})=>desktop.evaluate(`call(${JSON.stringify(command)},${JSON.stringify(args)})`);
  await windows('lan_service_start',{config:{port:0,shares:[{name:'Files',path:directory}]}});
  groupId=await windows('device_groups',{command:'create',args:{name:'Remote preview QA',deviceName:'Preview QA PC'}});
  await windows('device_groups',{command:'configure',args:{id:groupId,enabled:true,permissions:{write:false,delete:false}}});
  const request=await native('groups.request',{deviceName:'Owned emulator preview QA'});
  const approval=await windows('device_groups',{command:'approve',args:{id:groupId,uri:request.uri,canInvite:false}});
  await native('groups.join',{uri:approval.uri,confirmed:true});
  const roots=await native('roots');let groupRoot;
  for(const location of roots.filter(r=>r.path?.startsWith('remote://'))){const id=location.path.split('/')[2],c=await native('connection.get',{id});if(c.groupId===groupId)groupRoot=location.path;}
  assert.ok(groupRoot,'test group publishes a storage root');const groupEntries=(await native('list',{path:groupRoot})).entries;
  locations.push({name:'RHFiles group',path:groupEntries.find(e=>e.name==='Files').path});
  for(const location of locations){
    const entries=(await native('list',{path:location.path})).entries;const byName=name=>{const e=entries.find(e=>e.name===name);assert.ok(e,name+' in '+location.name);return e;};location.entries=entries;
    const text=await call('preview.text.read',{path:byName('测试.json').path,maxBytes:262144});assert.equal(text.text,data.json);assert.equal(text.encoding,'UTF-8');
    const large=await call('preview.text.read',{path:byName('large.log').path,maxBytes:262144});assert.equal(large.bytesRead,262144);assert.equal(large.truncated,true);assert.ok(data.large.startsWith(large.text));
    const utf16=await call('preview.text.read',{path:byName('utf16.txt').path});assert.equal(utf16.text,'中文 UTF16 😀');
    await assert.rejects(()=>call('preview.text.read',{path:byName('binary.json').path}),/二进制/);
    check(true,location.name+': real Unicode/UTF16, bounded large reads and binary rejection');
  }
  check((await native('jobs')).length===jobsBefore,'text viewing creates no transfer/download jobs');
  const streamId=await native('connection.save',{type:'webdav',name:'Bounded stream QA',url:`http://10.0.2.2:${streaming.address().port}/dav/`,insecure:true});connections.push(streamId);
  const streamed=await call('preview.text.read',{path:`remote://${streamId}/large.txt`,maxBytes:32768});assert.equal(streamed.bytesRead,32768);assert.equal(streamed.truncated,true);await pause(250);
  check(streamBytes<256*1024,'bounded HTTP preview closes the stream well before the eight MB source finishes');
  const cancellation=native('text.preview',{path:`remote://${streamId}/slow.txt`,requestId:'owned-cancellation-049',maxBytes:262144}).then(()=>({unexpected:true}),error=>({error:error.message}));
  await until(()=>slowStarted,'real stalled HTTP read');const cancelAt=Date.now();await native('text.preview.cancel',{requestId:'owned-cancellation-049'});const cancelled=await cancellation;
  check(cancelled.error&&Date.now()-cancelAt<4000,'cancel interrupts the pending network read: '+JSON.stringify({elapsedMs:Date.now()-cancelAt,...cancelled}));
  const dav=locations[0],entry=name=>dav.entries.find(e=>e.name===name);
  await call('navigation.open',{path:dav.path});await call('files.open',{path:entry('说明.md').path});
  await until(()=>view('(w,d)=>!!d.querySelector(".text-preview-markdown h1")'),'real Tauri worker Markdown render');
  check(await view('(w,d)=>d.querySelectorAll(".text-preview-markdown table").length===1&&!d.querySelector(".text-preview-markdown img,.text-preview-markdown script")&&!w.__previewPwn'),'actual APK Worker renders Markdown with sanitized GFM');
  await phone.screenshot('remote-markdown');await call('preview.text.control',{command:'source'});check((await call('preview.text.state')).mode==='source','Markdown source view uses the same retained text');await call('preview.text.control',{command:'close'});
  await call('files.open',{path:entry('large.log').path});await call('preview.text.control',{command:'more'});const largeState=await call('preview.text.state');check(largeState.truncated&&largeState.partCount>1,'one MB text preview is divided into bounded display parts');await call('preview.text.control',{command:'nextPart'});assert.equal((await call('preview.text.state')).part,1);await call('preview.text.control',{command:'close'});
  await call('gallery.mode.set',{mode:'paged'});await call('files.open',{path:entry('b.png').path});assert.equal((await call('gallery.state')).mode,'paged');await call('gallery.mode.set',{mode:'continuous'});
  await until(()=>view('(w,d)=>[...d.querySelectorAll(".gallery-page img")].every(e=>e.complete&&e.naturalWidth>0)'),'real remote images decoded');
  const box=await view('(w,d)=>{const r=d.querySelector(".media-viewport").getBoundingClientRect();const f=w.frameElement?.getBoundingClientRect();return {x:r.x+(f?.x||0),y:r.y+(f?.y||0),width:r.width,height:r.height};}');
  const before=await call('gallery.state');await phone.swipe(box.x+box.width*.7,box.y+box.height*.5,box.x+box.width*.7-65,box.y+box.height*.5);await pause(900);const after=await call('gallery.state');
  check(after.position>before.position&&after.position<before.position+.99&&after.position%1>.01,'trusted short touch moves the continuous remote canvas and does not snap');
  await pause(850);assert.equal((await call('gallery.state')).position,after.position);check(await view('(w,d)=>d.querySelectorAll(".gallery-page").length<=3'),'continuous remote rendering stays bounded after inertia ends');await phone.screenshot('remote-continuous-gallery');
  await call('gallery.control',{command:'zoomIn'});assert.ok((await call('gallery.state')).zoom>1);await call('gallery.control',{command:'fit'});await call('gallery.mode.set',{mode:'paged'});assert.equal((await call('gallery.state')).mode,'paged');await evaluate(`(()=>{const f=[...document.querySelectorAll('iframe.file-pane')].find(e=>e.contentWindow.androidGallery?.state().open);(f?.contentWindow||window).ui.closeSheet();})()`);
  const cache=await call('files.cacheApk',{path:entry(longApk).path});let progress=false;
  const cached=await until(async()=>{const j=await native('job.status',{id:cache.jobId});if(j.bytes>0&&j.bytes<j.total)progress=true;if(j.state==='failed')throw Error(j.message);return j.state==='completed'&&j;},'native remote APK cache',120000);
  assert.equal(cached.bytes,fs.statSync(apk).size);assert.equal(cached.outputs.length,1);assert.ok(cached.outputs[0].includes('/cache/exports/open-cache/')&&cached.outputs[0].endsWith('/package.apk'));
  check(true,'long Chinese remote APK filename caches into a completed private installation file');
  const invalid=await call('files.cacheApk',{path:entry('broken.apk').path});const failed=await until(async()=>{const j=await native('job.status',{id:invalid.jobId});return ['failed','completed'].includes(j.state)&&j;},'invalid APK cache');assert.equal(failed.state,'failed');assert.equal(failed.outputs.length,0);check(true,'invalid APK fails explicitly without exposing incomplete output');
  adb('shell','appops','set','com.railgunhamster.rhfiles','REQUEST_INSTALL_PACKAGES','allow');
  const installerVisible=()=>adb('shell','dumpsys','activity','activities').split(/\r?\n/).some(line=>/topResumedActivity|mResumedActivity/.test(line)&&/packageinstaller|permissioncontroller.*Install/i.test(line));
  await call('files.installCachedApk',{jobId:cache.jobId});await until(installerVisible,'system package installer');
  check(true,'completed remote APK hands off to Android system installation confirmation');adb('shell','input','keyevent','4');await pause(400);
  const rh=locations.find(l=>l.name==='RHFiles group');await call('navigation.open',{path:rh.path});await call('files.open',{path:rh.entries.find(e=>e.name===longApk).path});await until(installerVisible,'default group APK click handoff',120000);
  check(true,'normal opening of a RHFiles-device APK caches and directly opens system installation confirmation');await phone.screenshot('remote-apk-system-confirmation');adb('shell','input','keyevent','4');await pause(300);
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(directory,longApk))).digest('hex'),sourceHash);check(true,'all previews and cache operations leave source files unchanged');
  fs.writeFileSync(path.join(phone.artifactDir,'summary.json'),JSON.stringify({pass:true,checks,version:manifest.version,protocols:locations.map(l=>l.name),intermediateApkProgressObserved:progress,sourceHash},null,2));
  console.log(JSON.stringify({pass:true,checks,artifactDir:phone.artifactDir,desktopArtifacts:desktop.artifactDir,intermediateApkProgressObserved:progress}));
}catch(error){if(phone){await phone.screenshot('failure').catch(()=>{});console.error(await phone.evaluate(`JSON.stringify({text:document.body.innerText.slice(-4000),frames:[...document.querySelectorAll('iframe.file-pane')].map(f=>({preview:f.contentWindow.androidTextPreview?.state(),gallery:f.contentWindow.androidGallery?.state(),text:f.contentDocument.body.innerText.slice(-2000)}))})`).catch(()=>''));}throw error;}
finally{
  if(phone){for(const id of connections)await phone.evaluate(`api.native('connection.delete',{id:${JSON.stringify(id)}})`).catch(()=>{});if(groupId)await phone.evaluate(`api.native('groups.forget',{id:${JSON.stringify(groupId)},confirmed:true})`).catch(()=>{});phone.close();}
  if(desktop){await desktop.evaluate("call('lan_service_stop',{})").catch(()=>{});await desktop.close();}
  fixture.stdin.end();fixture.kill();
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('rhfiles-preview-native-'));
  fs.rmSync(directory,{recursive:true,force:true});
  streaming.closeAllConnections();await new Promise(resolve=>streaming.close(resolve));
}
