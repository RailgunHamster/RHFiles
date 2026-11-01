import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),P=require('../../src/js/device-paths.js'),group='a'.repeat(64),peer='b'.repeat(64),path=P.make(group,peer,'/Files/中文%/A.txt');
function fixture(){
  const actions=new Map(),calls=[];let state={groups:[{id:group,name:'RH',members:[{id:peer,name:'电脑 A',server:{fingerprint:'public'},blocked:false,self:false}]}]};
  const api={register:(id,fn,schema)=>actions.set(id,{fn,schema}),invoke:async(id,args)=>{calls.push({id,args});if(actions.has(id))return actions.get(id).fn(args);return {path:args.path};}};
  const ctx=vm.createContext({RHFilesDevicePaths:P,window:{RHFilesAPI:api},_lang:'zh',URL,performance,document:{getElementById:()=>null},closeSettings:()=>{},writeTextClipboard:async value=>calls.push({clipboard:value}),call:async(cmd,args)=>{
    calls.push({cmd,args});if(cmd==='device_groups')return state;
    if(cmd==='get_windows_file_clipboard_info')return {sequence:19};
    if(cmd==='device_fs')return args.action==='resource'?{url:'http://127.0.0.1:1234/device/'+'c'.repeat(43)}:[{name:'A.txt',path}];
    if(cmd==='device_transfer')return {native:true,action:args.action};
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

test('copy/cut/paste and merge cleanup route both transfer directions to the native device engine, never to local shell APIs',async()=>{
  const f=fixture();
  for(const [command,action]of [['copy_with_progress','copy'],['move_with_progress','move'],['copy_path_exact','copy_exact'],['move_path_exact','move_exact'],['plan_folder_merge','plan_merge']]){
    for(const args of [{src:'C:\\fixtures\\本机',dest:path,operationId:'fixture-1'},{src:path,dest:'C:\\fixtures\\下载',operationId:'fixture-2'},{src:path,dest:P.make(group,peer,'/Files/other'),operationId:'fixture-3'}]){
      const result=await f.route(command,args);assert.equal(result.value.action,action);assert.equal(f.calls.at(-1).cmd,'device_transfer');assert.deepEqual(f.calls.at(-1).args.args,args);
    }
  }
  assert.equal((await f.route('remove_empty_merge_folders',{paths:[path,'C:\\fixtures\\empty']})).value.action,'remove_empty');
  assert.equal(await f.route('device_transfer',{action:'copy',args:{src:path,dest:'C:\\fixtures'}}),null,'native forwarding cannot recursively intercept itself');
  const result=await f.run('devices.transfer',{operation:'copy',src:'C:\\fixture',dest:path});assert.equal(result.action,'copy');
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

test('resolving a readable device address refreshes local trust but does not send network or filesystem requests',async()=>{
  const f=fixture();const resolved=await f.run('devices.resolve',{address:'rh://电脑 A/Files/中文%25/A.txt'});
  assert.equal(resolved.path,path);assert.deepEqual(f.calls.map(v=>v.cmd),['device_groups']);
  assert.equal((await f.run('devices.list')).devices[0].address,'rh://电脑 A/');
  f.setState({groups:[{id:group,name:'RH',members:[{id:peer,name:'电脑 A',server:{},blocked:true}]}]});
  await assert.rejects(f.run('devices.resolve',{address:'rh://电脑 A/'}),/device_not_found/);
  assert(!f.calls.some(v=>v.cmd==='device_fs'));
});

test('unknown, malformed and duplicate names report actionable errors without falling back to a host/IP',async()=>{
  const f=fixture();await assert.rejects(f.run('devices.resolve',{address:'rh://电脑 A/Files/%2e%2e'}),/invalid_device_address/);
  await assert.rejects(f.run('devices.resolve',{address:'rh://192.168.0.1/'}),/device_not_found/);
  f.setState({groups:[{id:group,name:'RH',members:[{id:peer,name:'电脑 A',server:{}}]},{id:'c'.repeat(64),name:'Other',members:[{id:'d'.repeat(64),name:'电脑 A',server:{}}]}]});
  await assert.rejects(f.run('devices.resolve',{address:'rh://电脑 A/'}),/ambiguous_device/);
  assert.equal((await f.run('devices.resolve',{address:'rh://Other@电脑 A/'})).peer,'d'.repeat(64));
  const suggestions=vm.runInContext("deviceBrowser.suggest('rh://')",f.ctx);
  assert.equal(suggestions.length,2);assert.equal(suggestions[0].path,'rh://RH@电脑 A/');
  assert(f.calls.every(v=>v.cmd==='device_groups'));
});
