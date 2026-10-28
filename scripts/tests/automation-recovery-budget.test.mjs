import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {recoverRun} from '../rhfiles-api.mjs';

const targets=[1,2].map(id=>({type:'page',id:String(id),url:'http://tauri.localhost/index.html',webSocketDebuggerUrl:'ws://127.0.0.1:9999/'+id}));
const request={jsonrpc:'2.0',id:'original',method:'actions.run',params:{action:'rhvideo.grid.close',args:{},key:'once'}};
const receipt={id:'grid:1',action:request.params.action,state:'succeeded',startedAt:1,finishedAt:2,result:{closed:true}};
const read=expression=>vm.runInNewContext(expression,{RHFilesAPI:{rpc:query=>query}});

for(const phase of ['connect','query'])test(`a stalled first ${phase} cannot consume the whole close-receipt recovery deadline`,async()=>{
  const calls=[],closed=[],opened=[];
  const harness={fetchTargets:async()=>targets,openSession:async(target,timeout)=>{
    opened.push(target.id);
    if(target.id==='1'&&phase==='connect')await new Promise((_,reject)=>setTimeout(()=>reject(Error('Unresponsive target')),timeout+20));
    let timer,rejectPending;
    return {evaluate:async expression=>{const query=read(expression);calls.push(query);if(target.id==='1')return new Promise((_,reject)=>{rejectPending=reject;timer=setTimeout(()=>reject(Error('Unresponsive view')),timeout+20);});return {jsonrpc:'2.0',id:query.id,result:receipt};},close(){closed.push(target.id);clearTimeout(timer);rejectPending?.(Error('Closed'));}};
  }};
  const result=await recoverRun('http://127.0.0.1:9999',{wait:true},request,undefined,Date.now()+240,harness);
  assert(result,'A healthy remaining view must still be checked inside the shared deadline');
  assert.deepEqual(JSON.parse(JSON.stringify(result.result)),receipt);assert.equal(result.id,'original');assert.deepEqual(opened,['1','2']);assert(closed.includes('2'));assert(calls.every(query=>query.method==='runs.lookup'),'Recovery must never replay the close action');
});

test('one matched live receipt can use the remaining wait budget even when a reserved transport has a short default',async()=>{
  const calls=[],harness={fetchTargets:async()=>Array.from({length:8},(_,i)=>({...targets[0],id:String(i)})),openSession:async()=>({
    async evaluate(expression,timeout=10){const query=read(expression);calls.push(query.method);if(query.method==='runs.lookup')return {jsonrpc:'2.0',id:query.id,result:{...receipt,state:'running',finishedAt:null}};
      let expiry,completion;try{return await Promise.race([new Promise((_,reject)=>expiry=setTimeout(()=>reject(Error('Wait budget spent')),timeout)),new Promise(resolve=>completion=setTimeout(()=>resolve({jsonrpc:'2.0',id:query.id,result:receipt}),120))]);}finally{clearTimeout(expiry);clearTimeout(completion);}},close(){}
  })};
  const result=await recoverRun('',{wait:true},request,undefined,Date.now()+500,harness);assert(result);assert.deepEqual(JSON.parse(JSON.stringify(result.result)),receipt);assert.equal(calls.filter(method=>method==='runs.lookup').length,8);assert.equal(calls.filter(method=>method==='runs.wait').length,1,'Only the selected matching source may perform a long wait');
});

test('a receipt expiring during the one read-only wait keeps its precise error',async()=>{
  const harness={fetchTargets:async()=>targets.slice(0,1),openSession:async()=>({async evaluate(expression){const query=read(expression);return query.method==='runs.lookup'?{result:{...receipt,state:'running',finishedAt:null}}:{jsonrpc:'2.0',id:query.id,error:{code:-32000,message:'Expired',data:{code:'RESULT_EXPIRED'}}};},close(){}})};
  const result=await recoverRun('',{wait:true},request,undefined,Date.now()+500,harness);assert.equal(result.id,'original');assert.equal(result.error.data.code,'RESULT_EXPIRED');
});

test('known surviving views recover a close without depending on another target-list request',async()=>{
  let discovery=0;const calls=[],opened=[];
  const harness={knownTargets:targets,fetchTargets:async()=>{discovery++;throw Error('Target discovery unavailable after close');},openSession:async target=>{
    opened.push(target.id);return {async evaluate(expression){const query=read(expression);calls.push(query.method);return {jsonrpc:'2.0',id:query.id,result:receipt};},close(){}};
  }};
  const result=await recoverRun('',{wait:true},request,receipt.id,Date.now()+500,harness);
  assert(result,'A previously enumerated survivor must supply the real receipt even if discovery is unavailable');
  assert.equal(discovery,0);assert.deepEqual(opened,['1','2']);assert.deepEqual(calls,['runs.status','runs.status']);assert.deepEqual(JSON.parse(JSON.stringify(result.result)),receipt);
});

test('stale known views allow one new discovery without querying any view twice',async()=>{
  let discovery=0;const opened=[];
  const harness={knownTargets:targets.slice(0,1),fetchTargets:async()=>{discovery++;assert.deepEqual(opened,['1']);return targets;},openSession:async target=>{
    opened.push(target.id);return {async evaluate(expression){const query=read(expression);return target.id==='1'?{error:{data:{code:'RUN_NOT_FOUND'}}}:{result:receipt};},close(){}};
  }};
  const result=await recoverRun('',{},request,receipt.id,Date.now()+500,harness);
  assert(result);assert.equal(discovery,1);assert.deepEqual(opened,['1','2']);
});

test('cached and newly discovered views share the same eight-target bound and URL allowlist',async()=>{
  let discovery=0;const opened=[],untrusted={...targets[0],id:'untrusted',url:'http://localhost/untrusted.html'};
  const known=Array.from({length:5},(_,i)=>({...targets[0],id:'known-'+i})),fresh=Array.from({length:12},(_,i)=>({...targets[0],id:'new-'+i}));
  const harness={knownTargets:[untrusted,...known,known[0]],fetchTargets:async()=>{discovery++;return [untrusted,...known,...fresh];},openSession:async target=>{
    opened.push(target.id);return {async evaluate(){return {error:{data:{code:'RUN_NOT_FOUND'}}};},close(){}};
  }};
  assert.equal(await recoverRun('',{},request,receipt.id,Date.now()+500,harness),null);assert.equal(discovery,1);assert.equal(opened.length,8);assert.equal(new Set(opened).size,8);assert(!opened.includes('untrusted'));
});
