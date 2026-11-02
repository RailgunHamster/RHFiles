import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {context,load,plain} from '../testing/source.mjs';
function dragSetup(){
  const actions=new Map(),calls=[],events=new Map(),timers=[];
  const ctx=context({invoke:()=>{},G:{},_lang:'zh',isDevicePath:p=>p.startsWith('rhfiles-device:'),isFtpPath:p=>p.startsWith('remote:'),showNotice:()=>{},clearRhfilesFileDragSession:()=>{},window:{RHFilesAPI:{register:(id,fn)=>actions.set(id,fn)},__TAURI__:{event:{listen:async(id,fn)=>events.set(id,fn)}}},call:async(cmd,args)=>{calls.push({cmd,args});return {status:'cancelled'};},setTimeout:fn=>timers.push(fn)});
  load(ctx,'native-drag.js');return {ctx,calls,timers,events,actions};
}
test('native dragging only intercepts trusted Windows drags, not synthetic tests or unprepared remote files',()=>{
  const h=dragSetup();assert.equal(vm.runInContext('nativeFileDrag.start({isTrusted:false},{paths:["C:/file"]})',h.ctx),false);
  assert.equal(vm.runInContext('nativeFileDrag.start({isTrusted:true},{paths:["remote://id/file"]})',h.ctx),false);
  assert.equal(h.timers.length,0);
});
test('local multi-file native drag is deferred once and retains the original internal session payload',async()=>{
  const h=dragSetup();h.ctx.prevented=0;
  assert.equal(vm.runInContext('nativeFileDrag.start({isTrusted:true,preventDefault:()=>prevented++},{kind:"rhfiles-file-drag",paths:["C:/a","C:/b"]})',h.ctx),true);
  assert.equal(h.ctx.prevented,1);assert.equal(h.calls.length,0);await h.timers[0]();await new Promise(setImmediate);
  assert.deepEqual(plain(h.calls[0]),{cmd:'native_drag_start',args:{paths:['C:/a','C:/b'],payload:{kind:'rhfiles-file-drag',paths:['C:/a','C:/b']}}});
});
test('native session notifications preserve paths for protected dragover and clear on cancellation',()=>{
  const h=dragSetup(),event=h.events.get('native-file-drag'),payload={kind:'rhfiles-file-drag',paths:['C:/a']};event({payload:{active:true,payload}});assert.equal(h.ctx.G._nativeFileDrag,true);assert.equal(h.ctx.G._activeFileDragPayload,payload);event({payload:{active:false}});assert.equal(h.ctx.G._nativeFileDrag,false);
});
test('prepared remote files are single-use local copies, not a permanent stale replacement for remote content',async()=>{
  const h=dragSetup();Object.assign(h.ctx,{pathLeaf:()=> 'a.txt',joinFolderPath:(a,b)=>a+'/'+b,createOperationTaskId:()=> 'owned-op',showProgress:()=> 'owned-task',hideProgress:()=>{}});
  h.ctx.call=async cmd=>cmd==='native_drag_cache'?{directory:'C:/owned-cache'}:{status:'dropped'};
  const p='remote://id/a.txt';await h.actions.get('files.prepareExternalDrag')({paths:[p]});
  assert.equal(vm.runInContext('nativeFileDrag.start({isTrusted:true,preventDefault(){}},{kind:"rhfiles-file-drag",paths:["remote://id/a.txt"]})',h.ctx),true);
  await h.timers[0]();await new Promise(setImmediate);
  assert.equal(vm.runInContext('nativeFileDrag.start({isTrusted:true,preventDefault(){}},{kind:"rhfiles-file-drag",paths:["remote://id/a.txt"]})',h.ctx),false);
});
test('saved remote locations retain encoded path segments and never become Windows paths',()=>{
  const ctx=context({networkLocations:{label:()=> 'SFTP server'}});load(ctx,'remote.js',['isFtpPath','isSavedNetworkPath','savedNetworkLocation','pathLeaf']);load(ctx,'common.js',['parentFolderPath']);load(ctx,'ops.js',['joinFolderPath']);
  const value=vm.runInContext('joinFolderPath("remote://00000000-0000-4000-8000-000000000000/","中文 a%")',ctx);assert.equal(value,'remote://00000000-0000-4000-8000-000000000000/%E4%B8%AD%E6%96%87%20a%25');ctx.value=value;
  assert.equal(vm.runInContext('parentFolderPath(value)',ctx),'remote://00000000-0000-4000-8000-000000000000/');assert.equal(vm.runInContext('savedNetworkLocation(value).path',ctx),'/中文 a%');assert.equal(vm.runInContext('pathLeaf(value)',ctx),'中文 a%');
});
test('remote overwrite never deletes the intact target before a transfer',async()=>{
  const calls=[],ctx=context({G:{},_lang:'en',call:async(cmd,args)=>{calls.push(cmd);if(cmd==='path_exists')return true;throw Error('Unexpected '+cmd);},t:k=>k,pathLeaf:p=>p.split('/').at(-1),joinFolderPath:(p,n)=>p+'/'+n});
  load(ctx,'remote.js',['isFtpPath','routeFtpCommand']);ctx.args={src:'remote://id/source',dest:'C:/dest',overwrite:true};
  await assert.rejects(vm.runInContext('routeFtpCommand("copy_with_progress",args)',ctx),/Safe replacement/);assert.deepEqual(calls,['path_exists']);
});
test('saved protocol cross-location move is rejected before any path-only source deletion or transfer',async()=>{
  const calls=[],ctx=context({_lang:'en',call:async cmd=>calls.push(cmd)});load(ctx,'remote.js',['isFtpPath','routeFtpCommand']);
  for(const cmd of ['move_with_progress','move_path_exact'])await assert.rejects(vm.runInContext(`routeFtpCommand(${JSON.stringify(cmd)},{src:'remote://id/source',dest:'C:/dest'})`,ctx),/unsupported_safe_move/);
  assert.deepEqual(calls,[]);
});
