import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {context,load,plain,deferred} from '../testing/source.mjs';
const require=createRequire(import.meta.url),P=require('../../src/js/device-paths.js'),Core=require('../../src/js/automation-core.js');
const group='a'.repeat(64),peer='b'.repeat(64),otherGroup='c'.repeat(64),otherPeer='d'.repeat(64);
const uri=tail=>P.make(group,peer,tail);
const known=()=>({groups:[{id:group,name:'RH',members:[{id:peer,name:'WINSERVER',server:{}}]}]});

function fixture({zh=true,webClipboard=true}={}){
  const api=Core.create(),calls=[],notices=[],alerts=[];
  let state=known(),clipboard='existing clipboard',stateReader;
  const ctx=context({RHFilesDevicePaths:P,RHFilesAutomationCore:Core,window:{RHFilesAPI:api},_lang:zh?'zh-CN':'en',
    ACTION_HANDLERS:{},document:{getElementById:()=>null},
    t:(key,args)=>key+':'+(args?.error?String(args.error):JSON.stringify(args??{})),showNotice:value=>notices.push(value),alert:value=>alerts.push(value),
    writeTextClipboard:async value=>{calls.push({web:value});if(webClipboard)clipboard=value;return webClipboard;},
    call:async(command,args)=>{
      calls.push({command,args:plain(args)});
      if(command==='device_groups'&&args.command==='state')return stateReader?stateReader():plain(state);
      if(command==='copy_file_path'){clipboard=args.path;return;}
      throw Error('Unexpected native operation '+command);
    },
  });
  load(ctx,'device-groups-ui.js');load(ctx,'device-browser.js');
  load(ctx,'ops.js',['formatPathsForClipboard','copyPathsFromMenu','copyPathFromMenu','copySelectedPaths']);
  load(ctx,'sidebar-order.js');load(ctx,'automation-desktop.js');
  return {api,ctx,calls,notices,alerts,setState:value=>state=value,setStateReader:value=>stateReader=value,
    get clipboard(){return clipboard;},copy:paths=>ctx.copyPathsFromMenu(paths)};
}

test('ordinary copy-path UI and semantic API copy unique readable addresses, never identity IDs',async()=>{
  const f=fixture(),path=uri('/C/Users/Administrator/下载 % #/文件.txt');
  assert.equal(await f.ctx.copyPathFromMenu(path),true);
  assert.equal(f.clipboard,'rh://WINSERVER/C/Users/Administrator/下载 %25 %23/文件.txt');
  const devices=(await f.api.invoke('devices.list')).devices;
  assert.equal(P.resolveAddress(f.clipboard,devices).path,path);
  assert.deepEqual(await f.api.invoke('files.copyPaths',{paths:[uri('/'),path]}),{copied:2});
  assert.equal(f.clipboard,'rh://WINSERVER/\r\nrh://WINSERVER/C/Users/Administrator/下载 %25 %23/文件.txt');
  assert(!f.clipboard.includes(group));assert(!f.clipboard.includes(peer));
  assert(f.calls.every(v=>v.web||v.command==='device_groups'),'Path copying must not open a connection or mutate files');
});

test('mixed local/UNC/device selections keep order and local syntax, one path per line',async()=>{
  const f=fixture(),paths=[{path:'C:\\Local folder\\file.txt'},{path:uri('/Files/中文')},'\\\\SERVER-HOME\\Public\\file.txt'];
  const before=structuredClone(paths);assert(await f.copy(paths));
  assert.equal(f.clipboard,'C:\\Local folder\\file.txt\r\nrh://WINSERVER/Files/中文\r\n\\\\SERVER-HOME\\Public\\file.txt');
  assert.deepEqual(paths,before,'Formatting must not change selected entries, stored tabs or favorites');
});

test('same device name in two groups is automatically group-qualified and resolves to the original identity',async()=>{
  const f=fixture(),state=known();state.groups.push({id:otherGroup,name:'Other',members:[{id:otherPeer,name:'winserver',server:{}}]});f.setState(state);
  const paths=[uri('/Files/a.txt'),P.make(otherGroup,otherPeer,'/Files/b.txt')];
  assert(await f.copy(paths));assert.equal(f.clipboard,'rh://RH@WINSERVER/Files/a.txt\r\nrh://Other@winserver/Files/b.txt');
  const devices=(await f.api.invoke('devices.list')).devices;
  assert.deepEqual(f.clipboard.split('\r\n').map(value=>P.resolveAddress(value,devices).path),paths);
});

for(const zh of [true,false])test(`fully duplicated names reject the entire batch without changing clipboard (${zh?'Chinese':'English'})`,async()=>{
  const f=fixture({zh}),state=known();state.groups.push({id:otherGroup,name:'rh',members:[{id:otherPeer,name:'winserver',server:{}}]});f.setState(state);
  assert.equal(await f.copy(['C:\\safe.txt',uri('/Files/a.txt')]),false);
  assert.equal(f.clipboard,'existing clipboard');assert.equal(f.notices.length,0);
  assert.match(f.alerts[0],/ambiguous_device/);assert.match(f.alerts[0],zh?/连接诊断/:/Connection diagnostics/);
  assert(!f.calls.some(v=>v.web||v.command==='copy_file_path'));
  await assert.rejects(f.api.invoke('files.copyPaths',{paths:[uri('/')]}),{code:'COPY_PATHS_FAILED'});
  assert.equal(f.clipboard,'existing clipboard');
});

test('copy refreshes only local trust, so removed file-service records cannot use a stale short alias',async()=>{
  const f=fixture();assert(await f.copy([uri('/Files/first')]));const original=f.clipboard;
  f.setState({groups:[]});assert.equal(await f.copy(['C:\\a.txt',uri('/Files/second')]),false);
  assert.equal(f.clipboard,original);assert.match(f.alerts.at(-1),/device_not_found/);
  assert.equal(f.calls.filter(v=>v.command==='device_groups').length,2);
  assert(f.calls.every(v=>v.web||v.command==='device_groups'));
});

test('a selection is snapshotted before awaiting trust instead of following later selection changes',async()=>{
  const f=fixture(),gate=deferred(),paths=[{path:uri('/Files/original')}];
  f.setStateReader(()=>gate.promise);const copy=f.copy(paths);paths[0].path=uri('/Files/replacement');paths.push('C:\\unselected.txt');
  gate.resolve(known());assert(await copy);assert.equal(f.clipboard,'rh://WINSERVER/Files/original');
});

test('overlapping trust refreshes refuse a stale copy result, with no implicit retries or clipboard write',async()=>{
  const f=fixture(),gate=deferred();let reads=0;
  f.setStateReader(()=>++reads===1?gate.promise:known());const copying=f.copy([uri('/Files/first')]);
  await f.api.invoke('devices.refresh');gate.resolve(known());assert.equal(await copying,false);
  assert.equal(f.clipboard,'existing clipboard');assert.match(f.alerts[0],/device_state_changed/);assert.equal(reads,2);
});

test('local-only copies do not load device state and empty selections leave clipboard alone',async()=>{
  const f=fixture();assert.equal(await f.copy([]),false);assert.equal(f.clipboard,'existing clipboard');
  await assert.rejects(f.api.invoke('files.copyPaths',{paths:[]}),{code:'INVALID_PARAMS'});
  assert(await f.copy(['C:\\a.txt','\\\\server\\share\\b.txt']));
  assert.equal(f.clipboard,'C:\\a.txt\r\n\\\\server\\share\\b.txt');assert(!f.calls.some(v=>v.command));
});

test('restricted WebView clipboard uses the same short-address text through the native text fallback',async()=>{
  const f=fixture({webClipboard:false});assert(await f.copy([uri('/Files/a.txt')]));
  assert.equal(f.clipboard,'rh://WINSERVER/Files/a.txt');
  assert.deepEqual(f.calls.filter(v=>v.command==='copy_file_path').map(v=>v.args),[{path:f.clipboard}]);
});

test('reserved device-name delimiters and NFC names round-trip without exposing identity strings',async()=>{
  const f=fixture(),state=known();state.groups[0].name='组@X';state.groups[0].members[0].name='电脑 @ A/外屏';f.setState(state);
  const path=uri('/Files/100% #.txt');assert(await f.copy([path]));
  assert.equal(f.clipboard,'rh://电脑 %40 A%2F外屏/Files/100%25 %23.txt');
  assert.equal(P.resolveAddress(f.clipboard,(await f.api.invoke('devices.list')).devices).path,path);
});

test('malformed device URI errors are contained by the copy workflow without copying a partial batch',async()=>{
  const f=fixture();assert.equal(await f.copy(['C:\\safe',P.prefix+group+'/'+peer+'/Files/%2e%2e/secret']),false);
  assert.equal(f.clipboard,'existing clipboard');assert.match(f.alerts[0],/invalid_path/);
});

test('diagnostic APIs return and explicitly copy stable addresses even without a name alias; no trust, auth or network mutation',async()=>{
  const f=fixture(),path=uri('/Files/中文 % #.txt');
  assert.deepEqual(await f.api.invoke('devices.address',{path}),{address:'rh://WINSERVER/Files/中文 %25 %23.txt'});
  f.setState({groups:[]});const before=f.calls.length;
  assert.deepEqual(await f.api.invoke('devices.address',{path,format:'stable'}),{address:path});assert.equal(f.calls.length,before);
  assert.deepEqual(await f.api.invoke('devices.copyStableAddress',{path}),{address:path});assert.equal(f.clipboard,path);
  assert(!f.calls.slice(before).some(v=>v.command));
  const copied=f.clipboard;
  await assert.rejects(f.api.invoke('devices.copyStableAddress',{path:P.prefix+group+'/'+peer+'/Files/%2e%2e/secret'}),/invalid_path/);
  assert.equal(f.clipboard,copied,'Malformed diagnostic paths must never replace the clipboard');
  await assert.rejects(f.api.invoke('devices.copyStableAddress',{path:'C:\\local'}),/RHFiles/);
  await assert.rejects(f.api.invoke('devices.address',{path,format:'unrecognized'}),{code:'INVALID_PARAMS'});
});

for(const right of [false,true])test(`Ctrl+Shift+C selection handler copies all ${right?'right':'left'} pane addresses`,async()=>{
  const f=fixture(),paths=[uri('/Files/a.txt'),uri('/Files/b.txt')],pane={path:uri('/Files'),entries:paths.map(path=>({path})),sel:new Set([0,1])};
  Object.assign(f.ctx,{G:{rp:pane},getTab:()=>pane,resolveRightPane:()=>right,selectedEntriesForPane:value=>[...value.sel].map(i=>value.entries[i])});
  assert(await f.ctx.copySelectedPaths(right));assert.equal(f.clipboard,'rh://WINSERVER/Files/a.txt\r\nrh://WINSERVER/Files/b.txt');
  assert.deepEqual(pane.entries.map(v=>v.path),paths);
});
