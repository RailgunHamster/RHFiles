import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),P=require('../../src/js/device-paths.js'),group='a'.repeat(64),peer='b'.repeat(64),path=P.make(group,peer,'/Files/中文%/A.txt');
function fixture(){
  const actions=new Map(),calls=[];let state={groups:[{id:group,name:'RH',members:[{id:peer,name:'电脑 A',server:{fingerprint:'public'},blocked:false,self:false}]}]};
  const api={register:(id,fn,schema)=>actions.set(id,{fn,schema}),invoke:async(id,args)=>{calls.push({id,args});if(actions.has(id))return actions.get(id).fn(args);return {path:args.path};}};
  const ctx=vm.createContext({RHFilesDevicePaths:P,window:{RHFilesAPI:api},_lang:'zh',URL,performance,document:{getElementById:()=>null},closeSettings:()=>{},writeTextClipboard:async value=>calls.push({clipboard:value}),call:async(cmd,args)=>{
    calls.push({cmd,args});if(cmd==='device_groups')return state;
    if(cmd==='get_windows_file_clipboard_info')return {sequence:19};
    if(cmd==='device_fs')return args.action==='resource'?{url:'http://127.0.0.1:1234/device/'+'c'.repeat(43)}:[{name:'A.txt',path}];
    throw Error('Unexpected native operation '+cmd);
  }});
  vm.runInContext(fs.readFileSync(new URL('../../src/js/device-browser.js',import.meta.url),'utf8'),ctx);
  return {ctx,actions,calls,setState:value=>state=value,run:(id,args={})=>actions.get(id).fn(args),route:(cmd,args)=>ctx.routeDeviceCommand(cmd,args)};
}
test('device UI APIs list locally accepted peers without probing or exposing session credentials',async()=>{
  const f=fixture();await f.run('devices.refresh');const list=await f.run('devices.list');assert.equal(list.devices.length,1);assert.equal(list.devices[0].path,P.make(group,peer));
  assert.deepEqual(f.calls.map(v=>v.cmd),['device_groups']);for(const name of ['open','entries','stat','preview','search','thumbnail','capabilities','resource','settings'])assert(f.actions.has('devices.'+name));
  await f.run('devices.open',{group,peer,path:'/Files/中文%',newTab:true,pane:'right'});
  assert.deepEqual(f.calls.filter(v=>v.id).map(v=>v.id),['tabs.new','navigation.open']);assert.equal(f.calls.at(-1).args.path,P.make(group,peer,'/Files/中文%'));
  f.setState({groups:[{id:group,name:'RH',members:[{id:peer,server:{},blocked:true}]}]});await f.run('devices.refresh');assert.equal((await f.run('devices.list')).devices.length,0);
});
test('device reads route to native group filesystem and local-only actions never receive identity URIs',async()=>{
  const f=fixture();assert.equal((await f.route('parent_path',{path})).value,P.parent(path));
  assert.equal((await f.route('list_dir',{path:P.parent(path)})).value[0].name,'A.txt');
  assert.equal(f.calls.at(-1).cmd,'device_fs');assert.equal(f.calls.at(-1).args.action,'list');
  for(const command of ['open_powershell','execute_tool','open_in_windows_explorer','compress_to_zip'])await assert.rejects(f.route(command,{path}),/unsupported/);
  await assert.rejects(f.route('get_file_info',{path:P.prefix+group+'/'+peer+'/Files/%2e%2e/x'}),/invalid_path/);
  assert.equal(f.calls.filter(v=>['open_powershell','execute_tool','open_in_windows_explorer','compress_to_zip','get_file_info'].includes(v.cmd)).length,0);
  assert.equal(await f.route('copy_file_path',{path}),null,'Text clipboard does not dereference a file');
});
test('remote clipboard retains in-app references but never creates native Windows shell file items',async()=>{
  const f=fixture(),result=await f.route('set_windows_file_clipboard',{paths:[path],cut:true});
  assert.equal(result.value,19);assert(f.calls.some(v=>v.clipboard===path));assert(!f.calls.some(v=>v.cmd==='set_windows_file_clipboard'));
});
test('media URLs are opaque loopback capabilities, bounded in memory and invalidated with device metadata',async()=>{
  const f=fixture();await f.run('devices.resource',{path});await f.run('devices.resource',{path});assert.equal(f.calls.filter(v=>v.cmd==='device_fs').length,1);
  await f.run('devices.refresh');await f.run('devices.resource',{path});assert.equal(f.calls.filter(v=>v.cmd==='device_fs').length,2);
});
