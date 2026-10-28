import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {recoverRun,cdpSession} from '../rhfiles-api.mjs';

const targets=['paused','healthy'].map(id=>({type:'page',id,url:'http://tauri.localhost/rhvideo.html',webSocketDebuggerUrl:'ws://127.0.0.1:9222/'+id}));
const request={jsonrpc:'2.0',id:'caller',method:'actions.run',params:{action:'rhvideo.grid.close',key:'accepted-once',args:{}}};
const receipt={id:'grid:1',action:request.params.action,state:'succeeded',startedAt:1,finishedAt:2,result:{closed:true}};
const read=expression=>vm.runInNewContext(expression,{RHFilesAPI:{rpc:query=>query}});

test('a paused first view does not subtract time from a healthy view needing most of the shared deadline',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const opened=[],calls=[],closed=[],controller=new AbortController();let recovery;
  try{
    recovery=recoverRun('',{wait:true},request,receipt.id,Date.now()+500,{signal:controller.signal,knownTargets:targets,fetchTargets:async()=>{throw Error('No rediscovery needed');},openSession:async target=>{
      opened.push(target.id);let rejectPending,timer;
      return {evaluate:expression=>{const query=read(expression);calls.push({target:target.id,method:query.method});return new Promise((resolve,reject)=>{rejectPending=reject;if(target.id==='healthy')timer=setTimeout(()=>resolve({result:receipt}),400);});},close(){closed.push(target.id);clearTimeout(timer);rejectPending?.(Error('Read closed'));}};
    }});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(opened,['paused','healthy'],'Both sources must be queried before spending the first source\'s time slice');
    assert.equal(calls.length,2);t.mock.timers.tick(400);const result=await recovery;
    assert.deepEqual(JSON.parse(JSON.stringify(result.result)),receipt);assert.equal(result.id,'caller');assert.equal(Date.now(),1400);assert(closed.includes('paused'));assert(closed.includes('healthy'));assert(calls.every(call=>call.method==='runs.status'),'No accepted operation may be replayed');
  }finally{controller.abort();await recovery;t.mock.timers.reset();}
});

test('a fast malformed or unrelated receipt cannot beat a slower valid completion',async()=>{
  const all=[...targets,{...targets[1],id:'foreign'}],closed=[];
  const reply=await recoverRun('',{wait:true},request,receipt.id,Date.now()+1000,{knownTargets:all,openSession:async target=>({async evaluate(){if(target.id==='paused')return {result:{...receipt,result:undefined}};if(target.id==='foreign')return {result:{...receipt,id:'other:1'}};await new Promise(resolve=>setImmediate(resolve));return {result:receipt};},close(){closed.push(target.id);}})});
  assert.deepEqual(JSON.parse(JSON.stringify(reply.result)),receipt);assert.equal(new Set(closed).size,3);
});

test('an early running source must not discard a later confirmed completion while its own wait stalls',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const controller=new AbortController(),calls=[],closed=[];let recovery,observed;
  try{
    recovery=recoverRun('',{wait:true},request,receipt.id,Date.now()+500,{signal:controller.signal,knownTargets:targets,fetchTargets:async()=>[],openSession:async target=>{
      let timer,rejectPending;
      return {evaluate(expression){const query=read(expression);calls.push({target:target.id,method:query.method});
        if(target.id==='paused'&&query.method==='runs.status')return Promise.resolve({result:{...receipt,state:'running',finishedAt:null}});
        return new Promise((resolve,reject)=>{rejectPending=reject;if(target.id==='healthy')timer=setTimeout(()=>resolve({result:receipt}),400);});
      },close(){closed.push(target.id);clearTimeout(timer);rejectPending?.(Error('Read closed'));}};
    }}).then(value=>{observed=value;return value;});
    await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(400);await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(observed?.result,receipt,'A confirmed result from another already-started status read must not be cancelled in favor of an unfinished wait');
    assert.equal(calls.filter(row=>row.method==='runs.wait').length,1,'This does not authorize another long wait or replay');assert.equal(new Set(closed).size,2);
  }finally{controller.abort();await recovery;t.mock.timers.reset();}
});

test('aborting an unopened receipt transport closes the socket instead of waiting for its full handshake timeout',async()=>{
  const previous=globalThis.WebSocket,sockets=[];
  globalThis.WebSocket=class extends EventTarget{constructor(){super();sockets.push(this);}close(){this.closed=true;this.dispatchEvent(new Event('close'));}};
  try{
    const controller=new AbortController(),opening=cdpSession(targets[0],1000,{signal:controller.signal});controller.abort();
    await assert.rejects(opening,{code:'READ_ABORTED'});assert.equal(sockets.length,1);assert(sockets[0].closed);
    const count=sockets.length;await assert.rejects(cdpSession(targets[1],1000,{signal:controller.signal}),{code:'READ_ABORTED'});assert.equal(sockets.length,count,'An already-aborted lookup must not create another socket');
  }finally{globalThis.WebSocket=previous;}
});
