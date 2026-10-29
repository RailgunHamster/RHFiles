import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const P=createRequire(import.meta.url)('../../src/js/rhvideo-task-priority.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}){
  let identity='account-A',applied=0;const actions=new Map(),calls=[],changes=[];
  const controller=P.install({processId:options.processId||'owned-process',identity:()=>identity,object:()=>({}),action:(name,_schema,handler)=>actions.set(name,handler),ready:async()=>{},capture:()=>({panel:1}),changed:value=>changes.push(value),
    native:async(command,args)=>{assert.equal(command,'operation');calls.push(structuredClone(args));const result=await options.before?.(args);if(result!==undefined)return result;if(args.name==='tasks.detail')return {id:args.params.entry,status:'pending',can_prioritize:true,filename:'测试任务.mp4',...options.detail};if(args.name==='tasks.prioritize')return {id:args.params.entry,kind:args.params.queue,status:'pending',prioritized:true,already_prioritized:false,blocked_by:null,...options.post};throw Error('Unexpected operation');},
    applied:async(...args)=>{applied++;await options.after?.(...args);}
  });
  const invoke=(args={})=>actions.get('task.prioritize')({kind:'default',id:'video:queued',expectedRevision:controller.state().revision,...args});
  return {controller,invoke,calls,changes,identity:value=>{identity=value;},applied:()=>applied,state:controller.state};
}
test('promotion rechecks a real pending task and submits exactly one fixed write',async()=>{
  const f=fixture();const value=await f.invoke();assert(value.prioritized);assert.deepEqual(f.calls.map(v=>v.name),['tasks.detail','tasks.prioritize']);assert.equal(f.applied(),1);assert.match(f.state().message,/当前任务结束后/);assert.equal(f.state().pending,null);
  value.id='changed';assert.equal(f.state().receipt.id,'video:queued');assert.deepEqual(JSON.parse(JSON.stringify(f.state())),f.state());
});
for(const [blocked,text]of [['replacement','原片替换'],['default','默认处理'],['paused','队列恢复']])test('blocked promotion remains queued, not resumed: '+blocked,async()=>{
  const f=fixture({post:{blocked_by:blocked,already_prioritized:true}});await f.invoke({kind:'replacement',id:'replace:123'});assert.match(f.state().message,new RegExp(text));assert(f.calls.every(v=>!v.name.includes('retry')&&!v.name.includes('resume')));
});
test('running, failed, cancelled and unsupported task states never reach the promotion POST',async()=>{
  for(const detail of [{status:'processing'},{status:'failed'},{status:'cancelled'},{can_prioritize:false},{can_prioritize:undefined},{id:'video:another'}]){
    const f=fixture({detail});await assert.rejects(f.invoke());assert.equal(f.calls.length,1);assert.equal(f.applied(),0);
  }
});
test('invalid queue identity, history, traversal, overflow and stale process fail before any request',async()=>{
  for(const args of [{kind:'all'},{id:'run:old'},{id:'replace:3'},{id:'video:../escape'},{id:'video:'+('a'.repeat(49))},{kind:'replacement',id:'replace:0'},{kind:'replacement',id:'replace:9223372036854775808'},{expectedRevision:'retired-process'}]){
    const f=fixture();await assert.rejects(f.invoke(args));assert.equal(f.calls.length,0);
  }
});
test('account reset while a pending detail is read prevents sending a later write',async()=>{
  const wait=deferred(),f=fixture({before:args=>args.name==='tasks.detail'?wait.promise:undefined}),work=f.invoke();await turn();f.controller.reset();wait.resolve({id:'video:queued',status:'pending',can_prioritize:true});await assert.rejects(work,/账户已改变/);assert.equal(f.calls.length,1);assert.equal(f.state().error,'');
});
test('a late accepted old-account response cannot refresh or overwrite a new account task',async()=>{
  const wait=deferred();let delay=true;const f=fixture({before:args=>args.name==='tasks.prioritize'&&delay?wait.promise:undefined});const old=f.invoke();await turn();f.controller.reset();f.identity('account-B');delay=false;await f.invoke({id:'video:new'});wait.resolve({id:'video:queued',kind:'default',status:'pending',prioritized:true});await assert.rejects(old,/账户已改变/);assert.equal(f.state().receipt.id,'video:new');assert.equal(f.applied(),1);assert.equal(f.state().pending,null);
});
test('simultaneous clicks, even for different rows, cannot reorder through duplicate in-flight writes',async()=>{
  const wait=deferred(),f=fixture({before:args=>args.name==='tasks.prioritize'?wait.promise:undefined}),work=f.invoke();await turn();await assert.rejects(f.invoke({id:'video:another'}),/正在提交/);wait.resolve({id:'video:queued',kind:'default',status:'pending',prioritized:true});await work;assert.equal(f.calls.filter(v=>v.name==='tasks.prioritize').length,1);
});
test('an uncertain write failure is visible and never retried or reported as completed',async()=>{
  const f=fixture({before:args=>{if(args.name==='tasks.prioritize')throw Error('HTTP 503');}});await assert.rejects(f.invoke(),/不会自动重发/);await turn();assert.equal(f.calls.length,2);assert.equal(f.state().receipt,null);assert.match(f.state().error,/HTTP 503/);assert.equal(f.applied(),0);
});
test('a successful write with a failed read refresh stays successful and warns without replay',async()=>{
  const f=fixture({after:()=>{throw Error('read unavailable');}}),result=await f.invoke();assert(result.prioritized);assert.equal(result.clientWarning,'read unavailable');assert.equal(f.state().error,'');assert.match(f.state().message,/置顶已完成|已置顶/);assert.match(f.state().message,/不会重发/);assert.equal(f.calls.length,2);
});
test('a mismatched receipt is not applied and retains an explicit uncertain-outcome warning',async()=>{
  const f=fixture({post:{id:'video:other'}});await assert.rejects(f.invoke(),/回执不匹配/);assert.equal(f.applied(),0);assert.equal(f.state().receipt,null);assert.match(f.state().error,/不会自动重发/);
});
