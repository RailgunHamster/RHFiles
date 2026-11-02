// Synthetic, owned-profile LAN acceptance. No installed instance, production
// group, clipboard, real media, SMB/DNS repair or user file is touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomFillSync} from 'node:crypto';
import {spawn} from 'node:child_process';
import {launchApp,until} from './app-session.mjs';
import {launchRemoteWindowsApp} from './remote-windows-app.mjs';
import {root} from './source.mjs';
const bytes=64*1024*1024,results=[];
const output=path.join(root,'test-artifacts','device-transfer-throughput-20261102.json');
const api=(app,id,args={})=>app.evaluate('RHFilesAPI.invoke('+JSON.stringify(id)+','+JSON.stringify(args)+')');
function report(value){results.push(value);console.log(JSON.stringify(value));fs.writeFileSync(output,JSON.stringify(results,null,2));}
function ps(source){return new Promise((resolve,reject)=>{
  const child=spawn('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=5','-l','40608','railgunhamster','powershell','-NoProfile','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{windowsHide:true});
  let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('Owned QA SSH timeout'));},60000);
  child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code?reject(Error(err.slice(0,2000))):resolve(out.replace(/^\uFEFF/,''));});child.stdin.end();
});}
const sha=file=>{const h=createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024);try{while(true){const n=fs.readSync(fd,buffer);if(!n)break;h.update(buffer.subarray(0,n));}}finally{fs.closeSync(fd);}return h.digest('hex');};
function generate(file){const block=randomFillSync(Buffer.alloc(1024*1024)),fd=fs.openSync(file,'wx');try{for(let n=0;n<bytes;n+=block.length)fs.writeSync(fd,block);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
async function transfer(app,label,src,dest,targetName,options={parallelism:2,bytesPerSecond:0}){
  const args={operation:'copy',src,dest,targetName,recordHistory:false,operationId:'qa-'+targetName,downloadOptions:options};
  // Native API schema deliberately has no hidden confirmation bypass. Use the
  // same ordinary copy action and capture its asynchronous completion.
  delete args.recordHistory;
  const start=performance.now();
  await app.evaluate(`window.__transferQA={state:'running'};RHFilesAPI.invoke('devices.transfer',${JSON.stringify(args)}).then(value=>__transferQA={state:'done',value}).catch(e=>__transferQA={state:'failed',error:String(e)});true`);
  const done=await until(async()=>{const value=await app.evaluate('__transferQA');return value.state==='running'?false:value;},label,180000);
  assert.equal(done.state,'done',done.error||label);
  const seconds=(performance.now()-start)/1000;
  report({kind:'transfer',label,bytes,seconds,MBps:bytes/seconds/1e6,options});return done.value;
}
const host=await launchApp({desktopId:'bounded-transfer-host'}),client=await launchApp({desktopId:'bounded-transfer-client'});let remote;
const files=path.join(host.directory,'generated-transfer-fixtures'),downloads=path.join(client.directory,'generated-transfer-downloads');fs.mkdirSync(files);fs.mkdirSync(downloads);generate(path.join(files,'seed.bin'));
try{
  remote=await launchRemoteWindowsApp();const remoteFiles=remote.directory+'\\generated-transfer-fixtures';
  assert(/^C:\\Users\\40608\\AppData\\Local\\Temp\\rhfiles-windows-qa-[a-f0-9]{32}\\generated-transfer-fixtures$/.test(remoteFiles));
  await ps(`$ErrorActionPreference='Stop';$root='${remoteFiles}';New-Item -ItemType Directory -Path $root|Out-Null;$block=New-Object byte[] 1048576;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($block);$f=[IO.File]::Open((Join-Path $root 'seed.bin'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{for($i=0;$i -lt 64;$i++){$f.Write($block,0,$block.Length)};$f.Flush($true)}finally{$f.Dispose()}`);
  const localDigest=sha(path.join(files,'seed.bin'));
  const remoteDigest=(await ps(`(Get-FileHash -Algorithm SHA256 -LiteralPath '${remoteFiles}\\seed.bin').Hash`)).trim().toLowerCase();
  const group=await api(host,'groups.create',{name:'Disposable transfer acceptance',deviceName:'QA WINSERVER',permissions:{write:true,delete:true}});
  for(const[app,name]of [[client,'QA client'],[remote,'QA RAILGUNHAMSTER']]){const request=await api(app,'groups.request',{deviceName:name});const approval=await api(host,'groups.approve',{id:group,uri:request.uri,canInvite:true});await api(app,'groups.join',{uri:approval.uri,confirmed:true,permissions:{write:true,delete:true}});}
  await api(host,'server.start',{config:{port:0,shares:[{name:'Files',path:files}]}});
  await api(remote,'server.start',{config:{port:0,shares:[{name:'Files',path:remoteFiles}]}});
  await api(host,'groups.join',{uri:(await api(remote,'groups.export',{id:group})).uri,confirmed:true});
  await api(client,'groups.join',{uri:(await api(host,'groups.export',{id:group})).uri,confirmed:true});
  const peers=(await api(client,'devices.refresh')).devices,a=peers.find(v=>v.name==='QA WINSERVER'),b=peers.find(v=>v.name==='QA RAILGUNHAMSTER');assert(a&&b);
  const localStatus=(await api(host,'server.state')).status;
  const localRoute=await api(client,'groups.connect',{id:group,peer:a.peer,endpoint:'https://127.0.0.1:'+localStatus.port});
  assert.equal(localRoute.outcome,'connected','Two isolated instances on one host require an explicitly verified loopback route');
  const status=(await api(remote,'server.state')).status;
  const lan=status.endpoints.find(v=>/^https:\/\/192\.168\.0\.100:/.test(v));assert(lan,'The owned remote service must advertise its actual LAN address');
  const connected=await api(client,'groups.connect',{id:group,peer:b.peer,endpoint:lan});assert.equal(connected.outcome,'connected');assert.equal(connected.endpoint,lan);
  report({kind:'route',endpoint:connected.endpoint,transport:'direct-LAN-HTTPS',binary:process.env.RHFILES_TEST_EXECUTABLE});
  for(let round=1;round<=2;round++){
    await transfer(client,'LAN upload '+round,path.join(files,'seed.bin'),b.path+'Files','upload-'+round+'.bin');
    assert.equal((await ps(`(Get-FileHash -Algorithm SHA256 -LiteralPath '${remoteFiles}\\upload-${round}.bin').Hash`)).trim().toLowerCase(),localDigest);
    await transfer(client,'LAN download '+round,b.path+'Files/seed.bin',downloads,'download-'+round+'.bin');
    assert.equal(sha(path.join(downloads,'download-'+round+'.bin')),remoteDigest);
    await transfer(client,'remote-path relay '+round,b.path+'Files/seed.bin',a.path+'Files','relay-'+round+'.bin');
    assert.equal(sha(path.join(files,'relay-'+round+'.bin')),remoteDigest);
  }
  for(const parallelism of [1,4]){
    await transfer(client,'LAN download streams='+parallelism,b.path+'Files/seed.bin',downloads,'streams-'+parallelism+'.bin',{parallelism,bytesPerSecond:0});
    assert.equal(sha(path.join(downloads,'streams-'+parallelism+'.bin')),remoteDigest);
  }
  const diagnostics=await api(client,'groups.diagnostics');
  assert(diagnostics.some(v=>v.trigger==='file.download'&&v.outcome==='completed'));
  report({kind:'complete',hashVerified:true,productionUntouched:true,diagnostics:diagnostics.filter(v=>v.trigger==='file.download')});
}catch(error){report({kind:'failure',error:String(error)});throw error;}
finally{await api(host,'server.stop').catch(()=>{});if(remote)await api(remote,'server.stop').catch(()=>{});await remote?.close();await client.close();await host.close();}
