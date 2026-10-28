import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {recoverRun,isReceiptTargetURL} from '../rhfiles-api.mjs';
const {create}=createRequire(import.meta.url)('../../src/js/automation-core.js');
const done={id:'retired:1',action:'rhvideo.player.close',state:'succeeded',startedAt:1,finishedAt:2,result:{closed:true}};
const rpc=(api,method,params)=>api.rpc({jsonrpc:'2.0',id:'read',method,params});

test('native handlers receive an immutable run identity and nested immediate UI actions share it',async()=>{
  const api=create({instanceId:'window'});let inner;
  api.register('rhvideo.player.close',(_,run)=>{inner=run;return {closed:true};});api.register('ui.invoke',()=>api.invoke('rhvideo.player.close'),{params:{type:'object',properties:{controlId:{type:'string'}},required:['controlId']}});
  const run=api.run('ui.invoke',{controlId:'ui-1'}, {key:'once'});assert.equal((await api.wait(run.id)).state,'succeeded');assert.equal(inner.id,run.id);assert.equal(inner.action,'ui.invoke');assert.equal(inner.key,'once');assert(Object.isFrozen(inner));assert.equal(inner.fingerprint,'ui.invoke:{"controlId":"ui-1"}');assert.deepEqual(inner.completionResult,{controlId:'ui-1',event:'click'});assert(Object.isFrozen(inner.completionResult));
  await api.invoke('rhvideo.player.close');assert.equal(inner,null,'A completed run cannot leak into an unrelated later physical click');
});
test('interleaved asynchronous handlers retain their own explicit receipt identities',async()=>{
  const api=create({instanceId:'window'}),resolvers=[],seen=[];api.register('close',async(_,run)=>{await new Promise(r=>resolvers.push(r));seen.push(run.id);return {closed:true};});
  const a=api.run('close'),b=api.run('close');resolvers[1]();await api.wait(b.id);resolvers[0]();await api.wait(a.id);assert.deepEqual(seen,[b.id,a.id]);
});
test('status, key lookup and wait can read a retired producer without invoking any action',async()=>{
  const reads=[],api=create({lookupRun:async q=>{reads.push(q);return done;}});let executions=0;api.register('rhvideo.player.close',()=>++executions);
  for(const [method,params]of [['runs.status',{runId:done.id}],['runs.lookup',{key:'old-key'}],['runs.wait',{runId:done.id,timeoutMs:500}]])assert.deepEqual((await rpc(api,method,params)).result,done);
  assert.deepEqual(reads,[{runId:done.id},{key:'old-key'},{runId:done.id,timeoutMs:500}]);assert.equal(executions,0);
});
test('missing and expired process results remain errors rather than successful replays',async()=>{
  const missing=create({lookupRun:async()=>null});assert.equal((await rpc(missing,'runs.lookup',{key:'absent'})).error.data.code,'RUN_NOT_FOUND');
  const expired=create({lookupRun:async()=>{throw {code:'RESULT_EXPIRED',message:'Do not replay'};}});assert.equal((await rpc(expired,'runs.lookup',{key:'old'})).error.data.code,'RESULT_EXPIRED');
  assert.throws(()=>missing.provideRunLookup(()=>null),{code:'INVALID_RUN_LOOKUP'});
});
test('a foreign or malformed completion cannot manufacture success',async()=>{
  for(const value of [{...done,id:'other:1'},{...done,result:undefined},{...done,finishedAt:null},{...done,state:'failed',error:{message:'missing code'}}]){
    const api=create({lookupRun:async()=>value});assert.equal((await rpc(api,'runs.status',{runId:done.id})).error.data.code,'INVALID_RESULT');
  }
});
const target=i=>({type:'page',id:String(i),url:'http://tauri.localhost/index.html',webSocketDebuggerUrl:'ws://127.0.0.1:9999/page/'+i});
const request={jsonrpc:'2.0',id:'original',method:'actions.run',params:{action:done.action,args:{},key:'once'}};
function harness(respond,targets=[target(1)]){
  const calls=[],closed=[];return {calls,closed,fetchTargets:async()=>targets,openSession:async t=>({evaluate:async expression=>vm.runInNewContext(expression,{RHFilesAPI:{rpc:async input=>{calls.push(input);return respond(input,t);}}}),close:()=>closed.push(t.id)})};
}
test('CLI transport recovery performs only status reads, waits once, and preserves the original request ID',async()=>{
  const h=harness(q=>({jsonrpc:'2.0',id:q.id,result:q.method==='runs.lookup'?{...done,state:'running',finishedAt:null}:done}));
  const reply=await recoverRun('http://127.0.0.1:9999',{wait:true},request,undefined,Date.now()+5000,h);
  assert.deepEqual(JSON.parse(JSON.stringify(reply)),{jsonrpc:'2.0',id:'original',result:done});assert.deepEqual(h.calls.map(q=>q.method),['runs.lookup','runs.wait']);assert.deepEqual(h.closed,['1']);assert(h.calls.every(q=>q.method!=='actions.run'));
});
test('recovery never guesses completion from a disappeared window or an unrelated run',async()=>{
  const h=harness(q=>({jsonrpc:'2.0',id:q.id,result:{...done,action:'some.other.operation'}}));assert.equal(await recoverRun('',{},request,done.id,Date.now()+5000,h),null);assert.equal(h.calls.length,1);assert.deepEqual(h.closed,['1']);
});
test('read-only recovery is bounded and does not run against arbitrary app-hosted pages',async()=>{
  const h=harness(q=>({jsonrpc:'2.0',id:q.id,error:{data:{code:'RUN_NOT_FOUND'}}}),Array.from({length:20},(_,i)=>target(i)));
  assert.equal(await recoverRun('',{},request,undefined,Date.now()+5000,h),null);assert.equal(h.calls.length,8);assert.equal(h.closed.length,8);
  for(const url of ['http://localhost/untrusted.html','https://example.com/index.html','file:///index.html','http://user:secret@localhost/index.html','http://localhost/index.html?redirect=x'])assert.equal(isReceiptTargetURL(url),false,url);
  for(const url of ['http://tauri.localhost/index.html','https://tauri.localhost/rhvideo.html'])assert.equal(isReceiptTargetURL(url),true);
});
test('expired receipts retain their precise error and a spent deadline causes no traffic',async()=>{
  const h=harness(q=>({jsonrpc:'2.0',id:q.id,error:{code:-32000,message:'Expired',data:{code:'RESULT_EXPIRED'}}}));
  assert.equal((await recoverRun('',{},request,undefined,Date.now()+5000,h)).error.data.code,'RESULT_EXPIRED');
  const count=h.calls.length;assert.equal(await recoverRun('',{},request,undefined,Date.now()-1,h),null);assert.equal(h.calls.length,count);
});
