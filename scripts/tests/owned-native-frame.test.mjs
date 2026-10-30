import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {admitOwnedFrameTool,validateFrameInput,validateOwnedBitmap,ownedFrameReader,ownedWindowDriver} from '../testing/owned-native-frame.mjs';
import {ownedObserverAdmission} from '../testing/rhvideo-windows.mjs';
function fixture(){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-owned-frame-'))),source=path.join(root,'scripts/testing/owned-native-frame.cpp'),tool=path.join(root,'test-artifacts/owned-native-frame/owned-native-frame.exe'),directory=path.join(root,'fixture');
 fs.mkdirSync(path.dirname(source),{recursive:true});fs.mkdirSync(path.dirname(tool),{recursive:true});fs.mkdirSync(directory);fs.writeFileSync(source,'synthetic source, not a pixel test');fs.writeFileSync(tool,'synthetic tool, never executed');
 const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');const proof={format:'RHFiles.owned-frame-tool',protocol:1,sourceSHA256:sha(source),exeSHA256:sha(tool)};fs.writeFileSync(tool+'.json',JSON.stringify(proof));
 let state={opened:true,inputId:7,rotation:0,renderer:'native-hardware-auto'},reads=0,execution;const calls=[];
 const bitmap=(file,w=2,h=2)=>{const b=Buffer.alloc(54+w*h*4);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(w,18);b.writeInt32LE(-h,22);b.writeUInt16LE(1,26);b.writeUInt16LE(32,28);fs.writeFileSync(file,b);};
 const execute=async(exe,args,options)=>{calls.push({exe,args,options});if(execution)return execution(exe,args,options);bitmap(path.join(options.cwd,args[2]));return JSON.stringify({protocol:1,scope:'owned-sibling-client',pid:42,width:2,height:2});};
 const reader=ownedFrameReader({workspace:root,tool,pid:42,executable:path.join(root,'owned/rhfiles.exe'),directory,getState:async()=>{reads++;return {...state};},execute});
 return {root,source,tool,directory,calls,reader,proof,bitmap,execute,setState:value=>{state={...state,...value};},setExecute:fn=>execution=fn,getReads:()=>reads,close(){reader.close();fs.rmSync(root,{recursive:true});}};
}

test('tool admission requires exact compiled and source identities, not only a filename',()=>{
 const f=fixture();try{assert.equal(admitOwnedFrameTool(f.root,f.tool),f.tool);fs.appendFileSync(f.tool,'tampered');assert.throws(()=>admitOwnedFrameTool(f.root,f.tool),/compiled bytes/);fs.writeFileSync(f.tool,'synthetic tool, never executed');fs.appendFileSync(f.source,'changed');assert.throws(()=>admitOwnedFrameTool(f.root,f.tool),/compiled bytes/);}finally{f.close();}
});

test('pixel requests cannot supply paths, handles, arbitrary renderer or unsafe input identities',()=>{
 for(const value of [null,[],{path:'outside'},{hwnd:123},{renderer:'other'},{expectedInput:0},{expectedInput:-1},{expectedInput:'7'},{expectedInput:NaN},{expectedInput:2**54}])assert.throws(()=>validateFrameInput(value));
 for(const value of [{},{expectedInput:7}])assert.doesNotThrow(()=>validateFrameInput(value));
});

test('actual observation stays read-only, uses a fresh basename and verifies input identity before and after',async()=>{
 const f=fixture();try{const frame=await f.reader.read({expectedInput:7});assert.equal(frame.inputId,7);assert.equal(frame.rotation,0);assert.equal(f.getReads(),2);assert.equal(path.dirname(frame.path),f.directory);assert.match(path.basename(frame.path),/^rhvideo-native-[a-f0-9]{32}\.bmp$/);assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].args.slice(0,2),['42',path.join(f.root,'owned/rhfiles.exe')]);assert.equal(f.calls[0].args[3],'native-hardware-auto');assert.equal(f.calls[0].options.timeout,4500);assert.equal(f.calls[0].options.windowsHide,true);assert.equal(f.reader.close().length,0);assert(!fs.existsSync(frame.path));}finally{f.close();}
});

test('stale inputs cannot start capture or publish a frame after source replacement',async()=>{
 const f=fixture();try{await assert.rejects(f.reader.read({expectedInput:8}),/changed before/);assert.equal(f.calls.length,0);
 f.setExecute(async(_,args,options)=>{f.bitmap(path.join(options.cwd,args[2]));f.setState({inputId:8});return JSON.stringify({protocol:1,scope:'owned-sibling-client',pid:42,width:2,height:2});});
 await assert.rejects(f.reader.read({expectedInput:7}),/changed during/);assert.equal(fs.readdirSync(f.directory).length,0);
 }finally{f.close();}
});

test('frame layout validation rejects truncated, wrong orientation, geometry or pixel format',()=>{
 const f=fixture();try{const file=path.join(f.directory,'synthetic.bmp');f.bitmap(file);assert.doesNotThrow(()=>validateOwnedBitmap(file,2,2));
 for(const mutate of [b=>b.writeInt32LE(2,22),b=>b.writeUInt16LE(24,28),b=>b.writeUInt32LE(55,10),b=>b.fill(0,0,2),b=>b.writeUInt32LE(1,2),b=>b.writeUInt32LE(1,30)]){f.bitmap(file);const b=fs.readFileSync(file);mutate(b);fs.writeFileSync(file,b);assert.throws(()=>validateOwnedBitmap(file,2,2));}
 fs.writeFileSync(file,'small');assert.throws(()=>validateOwnedBitmap(file,2,2));for(const width of [0,4097,NaN])assert.throws(()=>validateOwnedBitmap(file,width,2));
 }finally{f.close();}
});

test('full release acceptance requires a compiled observer and records both tool and source digests',()=>{
 const f=fixture();try{const proof=ownedObserverAdmission(f.root);assert.equal(proof.executable,f.tool);assert.equal(proof.exeSHA256,f.proof.exeSHA256);assert.equal(proof.sourceSHA256,f.proof.sourceSHA256);fs.unlinkSync(f.tool);assert.throws(()=>ownedObserverAdmission(f.root));}finally{f.close();}
});

test('external window transport is bounded and cannot submit arbitrary keys or accept another process acknowledgement',async()=>{
 const f=fixture();let driver;try{
  driver=ownedWindowDriver({workspace:f.root,tool:f.tool,pid:42,executable:'own/rhfiles.exe',directory:f.directory,execute:f.execute});
  await assert.rejects(driver.libraryKey({key:'PageDown'}),/Only Home\/End/);await assert.rejects(driver.libraryKey({key:'End',encoding:'anything'}),/encoding/);assert.equal(f.calls.length,0);
  f.setExecute(async(_,args,options)=>{assert.equal(options.timeout,4500);assert.equal(options.cwd,f.directory);return JSON.stringify({protocol:1,scope:'owned-sibling-windows',pid:42,windows:[{label:'main',foreground:false,active:false,inputFocus:false}]});});
  assert.equal((await driver.windows())[0].label,'main');assert.deepEqual(f.calls[0].args,['42','own/rhfiles.exe','windows']);
  f.setExecute(async()=>JSON.stringify({protocol:1,scope:'owned-sibling-windows',pid:99}));await assert.rejects(driver.activateMain(),/identity mismatch/);
  driver.close();await assert.rejects(driver.windows(),/closed/);
 }finally{driver?.close();f.close();}
});

test('closing aborts its own pending capture, and never starts an unbounded second observation',async()=>{
 const f=fixture();try{let started;const begun=new Promise(resolve=>started=resolve);f.setExecute((_,args,options)=>new Promise((_,reject)=>{started();options.signal.addEventListener('abort',()=>reject(Error('owned capture aborted')),{once:true});}));
 const pending=f.reader.read();await begun;await assert.rejects(f.reader.read(),/one owned/);f.reader.close();await assert.rejects(pending,/aborted/);await assert.rejects(f.reader.read(),/closed/);
 }finally{f.close();}
});

test('library presentation observation requires its exact scope and actual native opacity, not only decoded pixels',async()=>{
 const f=fixture();let reader;try{
  const options={workspace:f.root,tool:f.tool,pid:42,executable:'own/rhfiles.exe',directory:f.directory,getState:async()=>({opened:true,inputId:7,rotation:0,renderer:'native-hardware-auto'})};
  assert.throws(()=>ownedFrameReader({...options,scope:'desktop'}),/Unknown owned frame scope/);
  let scope='owned-sibling-presentation',alpha=0;
  reader=ownedFrameReader({...options,scope:'presentation',execute:async(_,args,config)=>{assert.equal(args[4],'library-presentation');assert.equal(args.length,5);f.bitmap(path.join(config.cwd,args[2]));return JSON.stringify({protocol:1,scope,pid:42,width:2,height:2,...(alpha===undefined?{}:{alpha})});}});
  const transparent=await reader.read();assert.equal(transparent.alpha,0,'A decoded transparent window cannot be falsely reported opaque');
  alpha=255;assert.equal((await reader.read()).alpha,255);
  for(const bad of [undefined,-1,256,.5,'255']){alpha=bad;await assert.rejects(reader.read(),/presentation alpha/);assert.equal(fs.readdirSync(f.directory).length,2,'Rejected replies cannot leave another generated bitmap');}
  scope='owned-sibling-client';alpha=255;await assert.rejects(reader.read(),/identity mismatch/);assert.equal(fs.readdirSync(f.directory).length,2);
 }finally{reader?.close();f.close();}
});

test('a bounded owned-library ping preserves timeout/error evidence without changing focus or submitting an action',async()=>{
 const f=fixture();let driver;try{
  let value={observedAtMs:123456789,responded:true,elapsedMs:0,win32Error:0};
  driver=ownedWindowDriver({workspace:f.root,tool:f.tool,pid:42,executable:'own/rhfiles.exe',directory:f.directory,execute:async(_,args)=>{assert.deepEqual(args,['42','own/rhfiles.exe','library-ping']);return JSON.stringify({protocol:1,scope:'owned-sibling-windows',pid:42,...value});}});
  assert.deepEqual(await driver.pingLibrary(),value);
  for(const error of [1460,0]){value={observedAtMs:123456789,responded:false,elapsedMs:109,win32Error:error};assert.deepEqual(await driver.pingLibrary(),value);}
  for(const bad of [{observedAtMs:null},{observedAtMs:0},{responded:1},{elapsedMs:-1},{elapsedMs:4501},{win32Error:-1},{responded:true,win32Error:1460}]){value={observedAtMs:123456789,responded:false,elapsedMs:100,win32Error:0,...bad};await assert.rejects(driver.pingLibrary(),/responsiveness observation/);}
 }finally{driver?.close();f.close();}
});
