import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {parse} from 'acorn';
const require=createRequire(import.meta.url),Exports=require('../../src/js/rhvideo-exports.js');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
function bridge(){
  const context=vm.createContext({window:{RHVideoBridge:{}},setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(new URL('../../android/web/js/rhvideo-mobile.js',import.meta.url),'utf8'),context);
  return context.window.RHVideoNative;
}
function client(){
  const nativeBridge=bridge(),actions=new Map(),errors=[],calls=[],opened=[];
  const module=Exports.install({mobile:true,state:{generation:7,kind:'favorite'},object:(properties,required)=>({properties,required}),action:(name,schema,fn)=>actions.set(name,fn),notice:e=>errors.push(String(e)),listenNative:nativeBridge.listen,
    native:async(name,args)=>{calls.push({name,args});if(name==='exports.download')return {requested:true,pickId:id(71)};if(name==='exports.uiReady')return {open:true};throw Error('Unexpected native action '+name);},
    invoke:async name=>{opened.push(name);return {opened:true};}});
  return {nativeBridge,module,errors,calls,opened,download:()=>actions.get('exports.download')({id:id(99)})};
}
test('the actual Android bridge accepts every literal shared native subscription and still rejects unknown events',async()=>{
  const names=new Set(['rhvideo-configuration-preview','rhvideo-configuration-export']);
  const walk=node=>{if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&(node.callee?.name==='listenNative'||node.callee?.property?.name==='listenNative')&&typeof node.arguments[0]?.value==='string')names.add(node.arguments[0].value);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);};
  for(const file of ['rhvideo-client.js','rhvideo-exports.js'])walk(parse(fs.readFileSync(new URL('../../src/js/'+file,import.meta.url),'utf8'),{ecmaVersion:'latest'}));
  assert(names.has('rhvideo-download-picker')&&names.has('rhvideo-rotation-preference')&&names.size>=11,'Derive subscriptions from the real consumers, not an empty hardcoded inventory');
  const nativeBridge=bridge();for(const name of names){let received;const remove=await nativeBridge.listen(name,event=>received=event.payload);nativeBridge.dispatch(name,{marker:name});assert.equal(received.marker,name);remove();}
  await assert.rejects(nativeBridge.listen('not-a-registered-media-event',()=>{}),/未知媒体事件/);
});
test('cancelling the real mobile picker bridge clears choosing state without starting a task or replaying',async()=>{
  const c=client();await c.download();assert.equal(c.module.state().busy,true);
  c.nativeBridge.dispatch('rhvideo-download-picker',{generation:7,pickId:id(71),result:{picked:false}});
  assert.equal(c.module.state().busy,false);assert.equal(c.module.state().phase,'idle');assert.match(c.module.state().message,/已取消/);assert.equal(c.module.state().downloads.length,0);assert.equal(c.calls.length,1);assert.deepEqual(c.errors,[]);
});
test('picker completion and progress cross the actual mobile bridge with their account and task identities',async()=>{
  const c=client();await c.download();const task={id:id(80),exportId:id(99),state:'queued',bytes:0,total:12,revision:0,started:1,path:'content://owned/document/1'};
  c.nativeBridge.dispatch('rhvideo-download-picker',{generation:7,pickId:id(71),result:{task}});assert.equal(c.module.state().busy,false);
  c.nativeBridge.dispatch('rhvideo-download-progress',{generation:7,task:{...task,state:'saved',bytes:12,revision:3}});
  c.nativeBridge.dispatch('rhvideo-download-progress',{generation:6,task:{...task,state:'failed',revision:99}});
  assert.equal(c.module.state().downloads[0].state,'saved');assert.equal(c.module.state().downloads[0].revision,3);assert.deepEqual(c.errors,[]);
});
test('a notification to an existing Activity reaches the same public export-open action',async()=>{
  const c=client();c.nativeBridge.dispatch('rhvideo-export-open',{});await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(c.opened,['exports.open']);assert.deepEqual(c.calls.map(v=>v.name),['exports.uiReady']);assert.deepEqual(c.errors,[]);
});
