import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {context,load} from '../testing/source.mjs';
const P=createRequire(import.meta.url)('../../src/js/device-paths.js');
const group='a'.repeat(64),peer='b'.repeat(64);
function fixture(){
  const calls=[],notices=[],canonical=P.make(group,peer,'/Files/中文.txt');
  const ctx=context({RHFilesDevicePaths:P,window:{RHFilesAPI:{invoke:async(id,args)=>{calls.push({id,args});return {path:canonical};}}},
    normalizeWindowsPathInput:value=>value,parentFolderPath:path=>P.parent(path),showNotice:value=>notices.push(value),
    call:async(cmd,args)=>{calls.push({cmd,args});return {is_dir:false};},
    navigateTo:async path=>{calls.push({left:path});return true;},rpNavigateTo:async path=>{calls.push({right:path});return true;},
    selectNavigatedPath:(path,right)=>calls.push({selected:path,right})});
  load(ctx,'tabs.js',['navigateAddressInput']);return {ctx,calls,notices,canonical};
}
for(const right of [false,true])test(`rh:// file input resolves before filesystem metadata and selects file in ${right?'right':'left'} pane`,async()=>{
  const f=fixture();assert(await f.ctx.navigateAddressInput('rh://PC/Files/中文.txt',right));
  assert.equal(f.calls[0].id,'devices.resolve');assert.equal(f.calls[1].args.path,f.canonical);
  assert.equal(f.calls[2][right?'right':'left'],P.parent(f.canonical));assert.equal(f.calls[3].selected,f.canonical);assert.equal(f.calls[3].right,right);
});
test('failed alias resolution leaves current folder alone and never calls local filesystem APIs',async()=>{
  const f=fixture();f.ctx.window.RHFilesAPI.invoke=async()=>{throw Error('[ambiguous_device] Duplicate device name');};
  assert.equal(await f.ctx.navigateAddressInput('rh://PC',false),false);assert.equal(f.calls.length,0);assert.match(f.notices[0],/ambiguous_device/);
});
test('ordinary UNC input retains SMB routing instead of invoking the RHFiles name resolver',async()=>{
  const f=fixture();await f.ctx.navigateAddressInput('\\\\PC\\Files',false);
  assert(!f.calls.some(v=>v.id==='devices.resolve'));assert.equal(f.calls[0].args.path,'\\\\PC\\Files');
});
test('device autocomplete is local only and displays aliases in address edit mode',async()=>{
  const input={_suggestToken:2,style:{},focus(){},select(){}};let suggestions;
  const ctx=context({RHFilesDevicePaths:P,deviceBrowser:{suggest:value=>[{kind:'device',path:value+'PC/'}],address:()=> 'rh://PC/Files/'},
    isDevicePath:P.is,getTab:()=>({path:P.make(group,peer,'/Files')}),document:{getElementById:id=>id==='address-bar'?{classList:{add(){}}}:input},
    renderAddressSuggestions:(_,items)=>suggestions=items});
  load(ctx,'tabs.js',['refreshAddressSuggestions','enterEditMode']);
  await ctx.refreshAddressSuggestions('rh://',false,2);assert.equal(suggestions[0].path,'rh://PC/');
  ctx.enterEditMode(false);assert.equal(input.value,'rh://PC/Files/');
});
