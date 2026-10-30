import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installSearchTiming} from '../testing/rhvideo-search-timing.mjs';

function environment() {
  let tick = 0; const posts = [], invocations = [];
  class Worker {
    listeners = [];
    addEventListener(type, callback) { assert.equal(type, 'message'); this.listeners.push(callback); }
    postMessage(...args) { posts.push({receiver:this,args}); return 'unchanged'; }
    reply(data) { for (const listener of this.listeners) listener({data}); }
  }
  const value = Promise.resolve('private response');
  const core = {invoke(...args) { invocations.push({receiver:this,args}); return value; }};
  const context = vm.createContext({Worker, __TAURI__:{core}, performance:{now:()=>++tick}});
  vm.runInContext('('+installSearchTiming.toString()+')()', context);
  return {context, Worker, core, value, posts, invocations,
    snapshot:()=>JSON.parse(JSON.stringify(context.__rhvideoSearchTiming.snapshot()))};
}

test('worker timing is passive, exact-forwarding and contains no data or media addresses', () => {
  const e=environment(), worker=new e.Worker(), message={id:7, action:'query', args:{secret:'password',url:'private'}};
  const transfer=[];
  assert.equal(worker.postMessage(message,transfer),'unchanged');
  assert.equal(e.posts[0].receiver,worker); assert.equal(e.posts[0].args[0],message); assert.equal(e.posts[0].args[1],transfer);
  worker.reply({id:7,result:{secret:'private response'}}); worker.reply({id:777,result:'ignore'});
  const state=e.snapshot(); assert.deepEqual(state.records.map(x=>[x.boundary,x.stage,x.id,x.action]),[['worker','sent',7,'query'],['worker','received',7,'query']]);
  assert(!JSON.stringify(state).includes('password'));assert(!JSON.stringify(state).includes('private'));
  assert.equal(state.diagnosticOnly,true); assert.match(state.clock,/not worker CPU/);
});

test('native timing returns the same promise and ignores non-allowlisted operations', async () => {
  const e=environment(),args={action:'resolve',args:{secret:'password'}};
  assert.equal(e.core.invoke('rhvideo_request',args),e.value);
  assert.equal(e.core.invoke('rhvideo_request',{action:'player.open'}),e.value);
  await e.value;
  assert.equal(e.invocations[0].receiver,e.core);assert.equal(e.invocations[0].args[1],args);
  assert.deepEqual(e.snapshot().records.map(x=>[x.stage,x.action]),[['sent','resolve'],['received','resolve']]);
});

test('records and pending worker identities are bounded and snapshots are copies', () => {
  const e=environment(),worker=new e.Worker();
  for(let id=0;id<5000;id++){worker.postMessage({id,action:'query'});worker.reply({id});}
  assert.equal(e.snapshot().records.length,4096);assert(e.snapshot().dropped>0);
  const first=e.context.__rhvideoSearchTiming.snapshot();first.records[0].action='corrupt';assert.equal(e.snapshot().records[0].action,'query');
  const p=environment(),waiting=new p.Worker();for(let id=0;id<256;id++)waiting.postMessage({id,action:'query'});
  assert.equal(p.snapshot().records.length,128);assert.equal(p.snapshot().dropped,128);
});

test('invalid worker identities and duplicate installation cannot leak arbitrary labels', () => {
  const e=environment(),worker=new e.Worker();
  for(const message of [{id:'private',action:'query'},{id:1,action:'private action'},null])worker.postMessage(message);
  assert.equal(e.posts.length,3);assert.equal(e.snapshot().records.length,0);
  assert.throws(()=>vm.runInContext('('+installSearchTiming.toString()+')()',e.context),/already installed/);
});

test('native rejection remains the original rejected promise and records no error content', async () => {
  const failure=Error('private failure');let tick=0;
  const promise=Promise.reject(failure),core={invoke(){return promise;}};
  class Worker {postMessage(){}}
  const context=vm.createContext({Worker,__TAURI__:{core},performance:{now:()=>++tick}});
  vm.runInContext('('+installSearchTiming.toString()+')()',context);
  assert.equal(core.invoke('rhvideo_request',{action:'resolve',args:{password:'secret'}}),promise);
  await assert.rejects(promise,error=>error===failure);
  const state=JSON.parse(JSON.stringify(context.__rhvideoSearchTiming.snapshot()));
  assert.deepEqual(state.records.map(x=>x.stage),['sent','failed']);assert(!JSON.stringify(state).includes('private'));
});

test('read-only public Tauri exports are observed through the unchanged internal forwarding boundary', async () => {
  const calls=[],promise=Promise.resolve('private'),transport={invoke(...args){calls.push({receiver:this,args});return promise;}};
  class Worker {postMessage(){}}
  const context=vm.createContext({Worker,__TAURI__:{core:Object.freeze({invoke(){throw Error('not the transport');}})},__TAURI_INTERNALS__:transport,performance:{now:()=>0}});
  vm.runInContext('('+installSearchTiming.toString()+')()',context);
  const args={action:'state'};assert.equal(transport.invoke('rhvideo_request',args),promise);await promise;
  assert.equal(calls[0].receiver,transport);assert.equal(calls[0].args[1],args);
  assert.equal(context.__rhvideoSearchTiming.snapshot().records.length,2);
});

test('a protected release transport is untouched and explicitly reported as unobserved', () => {
  class Worker {postMessage(){}}
  const invoke=()=>Promise.resolve(null),core=Object.freeze({invoke});
  const context=vm.createContext({Worker,__TAURI__:{core},performance:{now:()=>0}});
  vm.runInContext('('+installSearchTiming.toString()+')()',context);
  assert.equal(core.invoke,invoke);assert.equal(context.__rhvideoSearchTiming.snapshot().nativeObserved,false);
});
