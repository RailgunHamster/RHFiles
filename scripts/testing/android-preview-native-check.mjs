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
import {startPreviewService} from './preview-service.mjs';
const [serial,apk,python,receiptFile]=process.argv.slice(2);
if(!/^emulator-\d+$/.test(serial||'')||!apk||!python||!receiptFile)throw Error('Usage: android-preview-native-check.mjs emulator-N FORMAL.apk FIXTURE-python.exe OWNED-EMULATOR.json (app must already be foreground with ADB automation enabled)');
const receipt=JSON.parse(fs.readFileSync(receiptFile));
const manifest=JSON.parse(fs.readFileSync('android/src-tauri/tauri.conf.json'));
assert.equal(receipt.serial,serial);
if(receipt.readOnly!==true){
  assert.equal(receipt.owned,true,'Only a freshly created task-owned AVD may be writable');
  if(receipt.remoteHost){
    assert.equal(receipt.remoteHost,'nuc');assert.equal(process.env.RHFILES_TEST_FIXTURE_RELAY,'nuc');
    assert.match(receipt.remoteRoot,/^\/tmp\/rhfiles-preview049-[A-Za-z0-9]+$/);
    assert.equal(receipt.avd,'RHFilesPreview049NucQA');assert.equal(serial,'emulator-5568');
    const proof=spawnSync('ssh',['-T','-o','BatchMode=yes','nuc','python3','-'],{encoding:'utf8',windowsHide:true,timeout:15000,input:`import os, json, stat\nroot=${JSON.stringify(receipt.remoteRoot)}\nassert os.path.realpath(root)==root and os.stat(root).st_uid==os.getuid()\nassert stat.S_IMODE(os.stat(root).st_mode)==0o700\npid=int(open(root+'/emulator.pid').read())\nassert os.stat('/proc/'+str(pid)).st_uid==os.getuid()\nargs=open('/proc/'+str(pid)+'/cmdline','rb').read().decode().split('\\0')\nassert args[0].startswith(root+'/sdk/emulator/')\nassert args[args.index('-avd')+1]=='RHFilesPreview049NucQA'\nassert args[args.index('-port')+1]=='5568'\nassert os.path.realpath(root+'/avd/RHFilesPreview049NucQA.avd').startswith(root+'/avd/')\nprint(json.dumps({'owned': True, 'pid': pid}))\n`});
    assert.equal(proof.status,0,'Remote emulator ownership proof: '+proof.stderr);assert.equal(JSON.parse(proof.stdout).owned,true);
  }else{
    const avd=fs.realpathSync(receipt.avdDirectory),owned=fs.realpathSync('test-artifacts')+path.sep;
    assert.ok(avd.toLowerCase().startsWith(owned.toLowerCase()));assert.equal(path.basename(avd),receipt.avd+'.avd');
  }
}
const adbExe=path.join(process.env.ANDROID_HOME,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
const adb=(...args)=>{const r=spawnSync(adbExe,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:120000});if(r.status!==0)throw Error(r.stderr||r.stdout||String(r.error));return r.stdout.trim();};
assert.equal(adb('shell','getprop','ro.kernel.qemu'),'1');
const guestAvd=adb('shell','getprop','ro.boot.qemu.avd_name')||adb('shell','getprop','ro.kernel.qemu.avd_name');
assert.equal(guestAvd||adb('emu','avd','name').split('\n')[0].trim(),receipt.avd);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-preview-native-'));
const relayHost=process.env.RHFILES_TEST_FIXTURE_RELAY;
if(relayHost&&relayHost!=='nuc')throw Error('Only the explicitly selected nuc test relay is admitted');
const fixture=spawn(path.resolve(python),['-u',path.resolve('scripts/testing/protocol-fixtures.py'),directory],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,...(relayHost?{RHFILES_FIXTURE_FTP_PASV_START:'45080'}:{})}});
let output='',fixtureErrors='';fixture.stdout.on('data',b=>output+=b);fixture.stderr.on('data',b=>fixtureErrors+=b);
let phone,desktop,headless,groupId,reversePort;const connections=[];let checks=0;
const relays=[];
async function relay(ports){
  if(!relayHost)return;
  const args=['-T','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2',...ports.flatMap(port=>['-R',`127.0.0.1:${port}:127.0.0.1:${port}`]),relayHost,'echo RHFILES_QA_RELAY_READY; exec sleep 900'];
  const child=spawn('ssh',args,{windowsHide:true});relays.push(child);let out='',error='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>error+=b);
  await until(()=>{if(child.exitCode!==null)throw Error('Owned fixture relay ended: '+error);return out.includes('RHFILES_QA_RELAY_READY');},'owned loopback fixture relay',15000);
}
let streamBytes=0,slowStarted=false;const streamRequests=[];
const streaming=http.createServer((req,res)=>{
  if(req.method!=='GET'||!['/dav/large.txt','/dav/slow.txt'].includes(req.url)){res.writeHead(404,{'Content-Length':0});res.end();return;}
  const record={method:req.method,path:req.url,bytes:0,started:Date.now(),closed:false};streamRequests.push(record);
  res.on('close',()=>{record.closed=true;record.elapsedMs=Date.now()-record.started;});
  res.writeHead(200,{'Content-Type':'text/plain','Content-Length':8*1024*1024});
  if(req.url.endsWith('/slow.txt')){slowStarted=true;res.write('waiting\n');return;}
  const timer=setInterval(()=>{streamBytes+=4096;record.bytes+=4096;res.write(Buffer.alloc(4096,120));if(record.bytes>=8*1024*1024){clearInterval(timer);res.end();}},4);
  res.on('close',()=>clearInterval(timer));
});
const check=(test,label)=>{assert.ok(test,label);console.log('ok '+(++checks)+' - '+label);};
const data={json:'{"名字":"真实网络预览","items":[1,2]}',md:'# 网络 Markdown\n\n**中文粗体**\n\n| A | B |\n|---|---|\n|一|二|\n\n<script>globalThis.__previewPwn=true</script>\n<img src="https://example.invalid/private" onerror="globalThis.__previewPwn=true">',large:'中文日志与 emoji 😀\n'.repeat(120000)};
fs.writeFileSync(path.join(directory,'测试.json'),data.json);fs.writeFileSync(path.join(directory,'说明.md'),data.md);fs.writeFileSync(path.join(directory,'large.log'),data.large);
fs.writeFileSync(path.join(directory,'utf16.txt'),Buffer.concat([Buffer.from([255,254]),Buffer.from('中文 UTF16 😀','utf16le')]));
fs.writeFileSync(path.join(directory,'binary.json'),Buffer.from([80,75,3,4,0,0,1,2]));fs.writeFileSync(path.join(directory,'broken.apk'),'not an apk');
for(let i=0;i<250;i++)fs.writeFileSync(path.join(directory,'fastscroll-'+String(i).padStart(4,'0')+'.txt'),'Owned synthetic scroll fixture '+i);
// Windows permits names whose UTF-8 representation exceeds a Linux component.
const longApk='中文'.repeat(process.platform==='win32'?50:38)+'.apk';fs.copyFileSync(apk,path.join(directory,longApk));
// Solid-color PNGs generated solely for this synthetic gallery.
const drawing=`import os,struct,zlib,binascii,pathlib
root=pathlib.Path(os.environ['RHFILES_QA_FIXTURE'])
def chunk(kind,data):
 return struct.pack('>I',len(data))+kind+data+struct.pack('>I',binascii.crc32(kind+data)&0xffffffff)
for name,color,width,height in [('a.png',(0,128,128),400,650),('b.png',(100,149,237),180,650),('c.png',(255,127,80),900,500)]:
 pixels=(b'\\0'+bytes(color)*width)*height
 image=b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels,9))+chunk(b'IEND',b'')
 (root/name).write_bytes(image)`;
const generated=spawnSync(path.resolve(python),['-c',drawing],{encoding:'utf8',windowsHide:true,env:{...process.env,RHFILES_QA_FIXTURE:directory}});assert.equal(generated.status,0,generated.stderr);
const sourceHash=createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
const sourceHashes=new Map(fs.readdirSync(directory).map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex')]));
try{
  await listenBrowserLoopback(streaming);
  const ports=await until(()=>output.includes('\n')&&JSON.parse(output.split(/\r?\n/)[0]),'loopback protocol fixtures');
  await relay([ports.webdav,ports.ftp,...(ports.ftpPasv||[]),streaming.address().port]);
  console.log('Attaching to the foreground owned emulator');
  phone=await androidSession(serial,{attachOnly:true});const evaluate=phone.evaluate;
  const native=(command,args={})=>evaluate(`api.native(${JSON.stringify(command)},${JSON.stringify(args)})`);
  const call=(name,args={})=>evaluate(`(RHFilesAPI.forPane?RHFilesAPI.forPane('left'):RHFilesAPI).invoke(${JSON.stringify(name)},${JSON.stringify(args)})`);
  const view=expression=>evaluate(`(()=>{const f=[...document.querySelectorAll('iframe.file-pane')].map(e=>e.contentWindow).find(w=>w.document.querySelector('#sheet-panel.text-preview,#sheet-panel.image-viewer'));const w=f||window;return (${expression})(w,w.document);})()`);
  const version=adb('shell','dumpsys','package','com.railgunhamster.rhfiles');check(version.includes('versionName='+manifest.version)&&version.includes('versionCode='+manifest.bundle.android.versionCode),'installed formal APK matches the Android source version');
  for(const file of ['js/text-preview.js','js/text-preview-worker.js','js/gallery.js','js/gallery-continuous.js','js/image-strip.js','js/file-scroll.js','js/api.js','js/app.js','vendor/text-preview/purify.min.js']){
    // Windows-built APKs contain checkout CRLFs. Canonicalize only those line
    // endings; all other source content and the APK binary hash stay strict.
    const loaded=await evaluate(`fetch(${JSON.stringify(file)}).then(r=>r.text())`),canonical=value=>createHash('sha256').update(value.replace(/\r\n/g,'\n')).digest('hex');
    assert.equal(canonical(loaded),canonical(fs.readFileSync(path.join('android/web',file),'utf8')),file+' bundled source (LF-normalized)');
  }check(true,'formal WebView serves the current reader, worker, gallery and storage bridge');
  const jobsBefore=(await native('jobs')).length;
  const profiles=[{type:'webdav',name:'Preview QA DAV',url:`http://10.0.2.2:${ports.webdav}/dav/`,username:'rhfiles-qa',password:'owned-fixture-only',insecure:true},{type:'ftp',name:'Preview QA FTP',host:'10.0.2.2',port:ports.ftp,username:'rhfiles-qa',password:'owned-fixture-only',insecure:true}];
  const locations=[];
  for(const profile of profiles){const id=await native('connection.save',profile);connections.push(id);locations.push({name:profile.type,path:'remote://'+id+'/'});}
  let service,windows,peer;
  if(process.env.RHFILES_TEST_HEADLESS_SERVICE){
    // Write access applies only to this fresh synthetic share and generated
    // group; existing groups, shares and user files are never consulted.
    headless=await startPreviewService(process.env.RHFILES_TEST_HEADLESS_SERVICE,directory,{write:true});
    service=headless.service;groupId=service.group;peer=service.peer;
  }else{
    desktop=await launchApp({desktopId:'preview-native-owned'});
    windows=(command,args={})=>desktop.evaluate(`call(${JSON.stringify(command)},${JSON.stringify(args)})`);
    service=await windows('lan_service_start',{config:{port:0,shares:[{name:'Files',path:directory}]}});
    groupId=await windows('device_groups',{command:'create',args:{name:'Remote preview QA',deviceName:'Preview QA PC'}});
    await windows('device_groups',{command:'configure',args:{id:groupId,enabled:true,permissions:{write:true,delete:false}}});
    peer=(await windows('device_groups',{command:'state',args:{}})).deviceId;
  }
  await relay([service.port]);
  const request=await native('groups.request',{deviceName:'Owned emulator preview QA'});
  const approval=headless?await headless.approve(request.uri):await windows('device_groups',{command:'approve',args:{id:groupId,uri:request.uri,canInvite:false}});
  await native('groups.join',{uri:approval.uri,confirmed:true});
  if(relayHost||headless){
    // The loopback-only fixture signs 127.0.0.1, not the emulator's 10.0.2.2
    // host alias. Preserve the signed endpoint through an owned ADB tunnel.
    if(headless){adb('reverse','--no-rebind',`tcp:${service.port}`,`tcp:${service.port}`);reversePort=service.port;}
    const endpoint=`https://${headless?'127.0.0.1':'10.0.2.2'}:${service.port}`;
    const result=await native('groups.connect',{id:groupId,peer,endpoint});
    assert.equal(result.outcome,'connected','Owned group connection diagnostics: '+JSON.stringify(result));
  }
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
  for(const [number,location]of locations.entries()){
    await call('navigation.open',{path:location.path});
    const name='QA 新建 '+number,created=path.join(directory,name),nested=path.join(created,'子目录'),marker=path.join(created,'preserve.txt');
    assert.ok(!fs.existsSync(created),'fresh synthetic creation target');
    const result=await call('files.createDirectory',{name});
    assert.equal(result.parent,location.path);assert.equal(result.name,name);assert.equal(result.directory,true);
    assert.ok(fs.statSync(created).isDirectory());assert.ok(result.path.startsWith('remote://'));
    fs.writeFileSync(marker,'Duplicate creation must preserve this owned marker');
    await assert.rejects(()=>call('files.createDirectory',{name}));
    assert.equal(fs.readFileSync(marker,'utf8'),'Duplicate creation must preserve this owned marker');
    await assert.rejects(()=>call('files.createDirectory',{name:'../escape'}));
    assert.ok(!fs.existsSync(path.join(directory,'escape')));
    // A failed create must release both the busy flag and the pane lock.
    await call('navigation.open',{path:result.path});
    await call('files.createDirectory',{name:'子目录'});
    assert.ok(fs.statSync(nested).isDirectory());
    await call('navigation.open',{path:location.path});
    fs.rmdirSync(nested);fs.unlinkSync(marker);fs.rmdirSync(created);
    check(true,location.name+': current-folder API creates Chinese nested directories; duplicate and invalid names preserve existing contents');
  }
  if(headless){
    const rh=locations.find(l=>l.name==='RHFiles group'),name='QA 拒绝写入';
    await headless.permissions(false);await call('navigation.open',{path:rh.path});
    await assert.rejects(()=>call('files.createDirectory',{name}),/403|权限|forbidden|permission|只读/i);
    assert.ok(!fs.existsSync(path.join(directory,name)));
    check(true,'real RHFiles service rejects folder creation after write permission is revoked');
  }
  check((await native('jobs')).length===jobsBefore,'text viewing creates no transfer/download jobs');
  const streamId=await native('connection.save',{type:'webdav',name:'Bounded stream QA',url:`http://10.0.2.2:${streaming.address().port}/dav/`,insecure:true});connections.push(streamId);
  const streamed=await call('preview.text.read',{path:`remote://${streamId}/large.txt`,maxBytes:32768});assert.equal(streamed.bytesRead,32768);assert.equal(streamed.truncated,true);await pause(250);
  console.log('Bounded HTTP source receipt: '+JSON.stringify(streamRequests));
  check(streamBytes<256*1024,'bounded HTTP preview closes the stream well before the eight MB source finishes: '+JSON.stringify(streamRequests));
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
  await until(()=>view('(w,d)=>{const images=[...d.querySelectorAll(".gallery-page img")];return images.length>0&&images.every(e=>e.complete&&e.naturalWidth>0);}'),'real remote images decoded');
  const box=await view('(w,d)=>{const r=d.querySelector(".media-viewport").getBoundingClientRect();const f=w.frameElement?.getBoundingClientRect();return {x:r.x+(f?.x||0),y:r.y+(f?.y||0),width:r.width,height:r.height};}');
  const before=await call('gallery.state');await phone.swipe(box.x+box.width*.7,box.y+box.height*.5,box.x+box.width*.7-65,box.y+box.height*.5);await pause(900);const after=await call('gallery.state');
  check(after.position>before.position&&after.position<before.position+.99&&after.position%1>.01,'trusted short touch moves the continuous remote canvas and does not snap');
  await pause(850);assert.equal((await call('gallery.state')).position,after.position);check(await view('(w,d)=>d.querySelectorAll(".gallery-page").length<=32'),'continuous remote rendering stays bounded after inertia ends');await phone.screenshot('remote-continuous-gallery');
  const gaps=await view('(w,d)=>{const images=[...d.querySelectorAll(".gallery-page img")].sort((a,b)=>Number(a.parentElement.dataset.slot??a.parentElement.dataset.imageIndex)-Number(b.parentElement.dataset.slot??b.parentElement.dataset.imageIndex)).map(image=>{const r=image.getBoundingClientRect(),width=Math.min(r.width,r.height*image.naturalWidth/image.naturalHeight);return {left:r.left+(r.width-width)/2,right:r.left+(r.width+width)/2};});return images.slice(1).map((image,i)=>image.left-images[i].right);}');
  check(gaps.length&&gaps.every(gap=>Math.abs(gap)<1),'actual decoded remote picture edges meet without black padding');
  await call('gallery.auto.speed.set',{speed:120});await call('gallery.auto.start');await pause(250);check((await call('gallery.state')).position>after.position,'native continuous auto-scroll advances at the configured speed');await call('gallery.auto.pause');const autoPaused=await call('gallery.state');await pause(200);assert.equal((await call('gallery.state')).position,autoPaused.position);check(!autoPaused.autoScroll.running,'native auto-scroll pause retains the exact free position');
  await call('gallery.control',{command:'zoomIn'});assert.ok((await call('gallery.state')).zoom>1);await call('gallery.control',{command:'fit'});
  const imageCount=(await call('gallery.state')).count;assert.equal(imageCount,3);
  for(const mode of ['continuous','paged']){
    await call('gallery.mode.set',{mode});await call('gallery.seek',{index:imageCount-1});
    await call('gallery.control',{command:'next'});
    await until(async()=>(await call('gallery.state')).index===0,mode+' last to first');
    await call('gallery.control',{command:'previous'});
    await until(async()=>(await call('gallery.state')).index===imageCount-1,mode+' first to last');
    await view('(w,d)=>{const bar=d.querySelector(".gallery-progress input");bar.value="0";bar.dispatchEvent(new w.Event("input",{bubbles:true}));return true;}');
    const preview=await call('gallery.state');assert.equal(preview.index,imageCount-1);assert.equal(preview.previewIndex,0);
    assert.ok(await view('(w,d)=>d.querySelector(".gallery-progress-label").textContent.includes("1 / 3")'));
    await view('(w,d)=>{d.querySelector(".gallery-progress input").dispatchEvent(new w.Event("change",{bubbles:true}));return true;}');
    await until(async()=>(await call('gallery.state')).index===0,mode+' progress seek commit');
    check(true,'native '+mode+' gallery wraps both ways and its progress bar previews before seeking');
  }
  await call('navigation.back');assert.equal((await call('gallery.state')).open,false);
  await until(async()=>(await call('files.scroll.state')).visible,'native long-folder fast scroll');
  await call('files.scroll.to',{ratio:0});
  const handle=await evaluate(`(()=>{const f=[...document.querySelectorAll('iframe.file-pane')].find(f=>!f.contentDocument.getElementById('filelist')?.hidden),d=f?.contentDocument||document,t=d.querySelector('.file-fast-scroll-thumb').getBoundingClientRect(),r=d.querySelector('.file-fast-scroll').getBoundingClientRect(),b=f?.getBoundingClientRect()||{x:0,y:0};return {x:t.x+b.x+t.width/2,y:t.y+b.y+t.height/2,travel:r.height-t.height,width:t.width,height:t.height};})()`);
  assert.ok(handle.width>=44&&handle.height>=56);await phone.swipe(handle.x,handle.y,handle.x,handle.y+handle.travel*.6);
  const scrolled=await call('files.scroll.state');check(scrolled.ratio>.5&&(await call('selection.get')).length===0,'native finger-sized file handle scrolls the real remote folder without selecting files');await phone.screenshot('remote-folder-fast-scroll');
  await call('files.scroll.to',{ratio:1});assert.ok((await call('files.scroll.state')).ratio>.99);await call('navigation.open',{path:groupRoot});await until(async()=>!(await call('files.scroll.state')).visible,'native single-page folder hides its fast scroll');check(true,'native fast scroll reaches the last file and hides for one-page folders');
  const cache=await call('files.cacheApk',{path:entry(longApk).path});let progress=false;
  const cached=await until(async()=>{const j=await native('job.status',{id:cache.jobId});if(j.bytes>0&&j.bytes<j.total)progress=true;if(j.state==='failed')throw Error(j.message);return j.state==='completed'&&j;},'native remote APK cache',120000);
  assert.equal(cached.bytes,fs.statSync(apk).size);assert.equal(cached.outputs.length,1);assert.ok(cached.outputs[0].includes('/cache/exports/open-cache/')&&cached.outputs[0].endsWith('/package.apk'));
  check(true,'long Chinese remote APK filename caches into a completed private installation file');
  const invalid=await call('files.cacheApk',{path:entry('broken.apk').path});const failed=await until(async()=>{const j=await native('job.status',{id:invalid.jobId});return ['failed','completed'].includes(j.state)&&j;},'invalid APK cache');assert.equal(failed.state,'failed');assert.equal(failed.outputs.length,0);check(true,'invalid APK fails explicitly without exposing incomplete output');
  adb('shell','appops','set','com.railgunhamster.rhfiles','REQUEST_INSTALL_PACKAGES','allow');
  const installerVisible=()=>adb('shell','dumpsys','activity','activities').split(/\r?\n/).some(line=>/topResumedActivity|mResumedActivity/.test(line)&&/packageinstaller|permissioncontroller.*Install/i.test(line));
  let installerReceipts=0;
  const installerReady=()=>{
    if(!installerVisible())return false;
    adb('shell','uiautomator','dump','--compressed','/data/local/tmp/rhfiles-qa-install-confirmation.xml');
    const xml=adb('exec-out','cat','/data/local/tmp/rhfiles-qa-install-confirmation.xml');
    const ready=/text="RHFiles"/.test(xml)&&/Do you want to (?:update|install) this app\?/.test(xml)&&[...xml.matchAll(/<node\b[^>]*>/g)].some(([node])=>/text="(?:Update|Install)"/i.test(node)&&/clickable="true"/.test(node)&&/enabled="true"/.test(node));
    fs.writeFileSync(path.join(phone.artifactDir,'apk-installation-latest.xml'),xml);
    if(ready)fs.writeFileSync(path.join(phone.artifactDir,`apk-installation-${++installerReceipts}.xml`),xml);
    return ready;
  };
  await call('files.installCachedApk',{jobId:cache.jobId});await until(installerReady,'system package installer ready for explicit confirmation',45000);
  check(true,'completed remote APK hands off to Android system installation confirmation');adb('shell','input','keyevent','4');await pause(400);
  const rh=locations.find(l=>l.name==='RHFiles group');await call('navigation.open',{path:rh.path});await call('files.open',{path:rh.entries.find(e=>e.name===longApk).path});await until(installerReady,'default group APK click handoff ready for explicit confirmation',120000);
  check(true,'normal opening of a RHFiles-device APK caches and directly opens system installation confirmation');await phone.screenshot('remote-apk-system-confirmation');adb('shell','input','keyevent','4');await pause(300);
  assert.deepEqual(fs.readdirSync(directory).sort(),[...sourceHashes.keys()].sort());
  for(const [name,digest]of sourceHashes)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex'),digest,name+' remains unchanged');
  check(true,'all previews and cache operations leave source files unchanged');
  fs.writeFileSync(path.join(phone.artifactDir,'summary.json'),JSON.stringify({pass:true,checks,version:manifest.version,emulator:receipt.avd,abi:adb('shell','getprop','ro.product.cpu.abi'),remoteHost:receipt.remoteHost||null,protocols:locations.map(l=>l.name),intermediateApkProgressObserved:progress,sourceHash,sourceFilesChecked:sourceHashes.size},null,2));
  console.log(JSON.stringify({pass:true,checks,artifactDir:phone.artifactDir,desktopArtifacts:desktop?.artifactDir||null,headlessService:!!headless,intermediateApkProgressObserved:progress}));
}catch(error){if(phone){await phone.screenshot('failure').catch(()=>{});console.error(await phone.evaluate(`JSON.stringify({text:document.body.innerText.slice(-4000),frames:[...document.querySelectorAll('iframe.file-pane')].map(f=>({preview:f.contentWindow.androidTextPreview?.state(),gallery:f.contentWindow.androidGallery?.state(),text:f.contentDocument.body.innerText.slice(-2000)}))})`).catch(()=>''));}throw error;}
finally{
  if(phone){for(const id of connections)await phone.evaluate(`api.native('connection.delete',{id:${JSON.stringify(id)}})`).catch(()=>{});if(groupId)await phone.evaluate(`api.native('groups.forget',{id:${JSON.stringify(groupId)},confirmed:true})`).catch(()=>{});phone.close();}
  if(desktop){await desktop.evaluate("call('lan_service_stop',{})").catch(()=>{});await desktop.close();}
  if(headless)await headless.close();
  if(reversePort)adb('reverse','--remove',`tcp:${reversePort}`);
  fixture.stdin.end();fixture.kill();
  for(const relay of relays)relay.kill();
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('rhfiles-preview-native-'));
  fs.rmSync(directory,{recursive:true,force:true});
  streaming.closeAllConnections();await new Promise(resolve=>streaming.close(resolve));
}
