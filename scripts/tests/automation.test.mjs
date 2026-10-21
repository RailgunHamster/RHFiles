import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {parseArguments,endpointUrl,requestFor,expressionFor} from '../rhfiles-api.mjs';
const require=createRequire(import.meta.url);
test('custom-origin WebViews without crypto.randomUUID still start with secure instance IDs',()=>{const code=fs.readFileSync(new URL('../../src/js/automation-core.js',import.meta.url),'utf8');const sandbox=vm.createContext({module:{exports:{}},crypto:{getRandomValues:bytes=>globalThis.crypto.getRandomValues(bytes)}});vm.runInContext(code,sandbox);const value=sandbox.module.exports.create();assert.match(value.instanceId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);});
test('desktop, Android and isolated reader use identical action protocol bytes',()=>{const core=fs.readFileSync(new URL('../../src/js/automation-core.js',import.meta.url));for(const location of ['../../android/web/js/automation-core.js','../../android/reader/automation-core.js'])assert.ok(core.equals(fs.readFileSync(new URL(location,import.meta.url))),location);});
const {create,ActionError,validate}=require('../../src/js/automation-core.js');
const schema={type:'object',properties:{path:{type:'string',minLength:1},count:{type:'integer',minimum:1,maximum:10}},required:['path'],additionalProperties:false};
const api=()=>{const a=create({instanceId:'test'});a.register('files.test',p=>({path:p.path,count:p.count??1}),{params:schema});return a;};
test('action discovery publishes schema, version and structured results',async()=>{
  const a=api();assert.equal(a.version,'1.0');assert.deepEqual(a.list().map(x=>x.id),['files.test']);
  assert.deepEqual(a.describe('files.test').params,schema);
  assert.deepEqual(await a.invoke('files.test',{path:'中文/文件'}),{path:'中文/文件',count:1});
  assert.throws(()=>a.register('files.test',()=>{}),{code:'DUPLICATE_ACTION'});
});
for(const [name,args]of Object.entries({missing:{},empty:{path:''},extra:{path:'x',unknown:true},fraction:{path:'x',count:1.5},range:{path:'x',count:11},null:null,array:[],infinite:{path:'x',count:Infinity},undefined:{path:undefined},function:{path:()=>{}},date:{path:new Date()},prototype:JSON.parse('{"path":"x","__proto__":{}}')})){
  test('invalid input cannot start a handler: '+name,async()=>{let calls=0;const a=create({instanceId:'test'});a.register('write',()=>calls++,{params:schema});await assert.rejects(a.invoke('write',args),{code:'INVALID_PARAMS'});assert.equal(calls,0);});
}
test('JSON from a separate same-origin pane is accepted',async()=>{const value=vm.runInNewContext('({path:"跨窗格",count:3})');assert.deepEqual(await api().invoke('files.test',value),{path:'跨窗格',count:3});});
test('arguments are copied before calling a handler',async()=>{const a=create({instanceId:'test'}),p={path:'a'};a.register('mutate',x=>{x.path='b';return x;},{params:schema});await a.invoke('mutate',p);assert.equal(p.path,'a');});
test('asynchronous writes return an ID and execute once per key',async()=>{
  const a=create({instanceId:'test'});let done,calls=0;a.register('work',()=>{calls++;return new Promise(r=>done=r);});
  const first=a.run('work',{}, {key:'copy-1'});assert.equal(first.state,'running');assert.equal(a.run('work',{}, {key:'copy-1'}).id,first.id);assert.equal(calls,1);
  assert.equal(a.lookup('copy-1').id,first.id);assert.throws(()=>a.lookup('unknown'),{code:'RUN_NOT_FOUND'});
  done({files:4});assert.deepEqual((await a.wait(first.id)).result,{files:4});assert.equal(a.run('work',{}, {key:'copy-1'}).state,'succeeded');
});
test('same idempotency key with different parameters cannot silently run',()=>{const a=api();a.run('files.test',{path:'a'},{key:'x'});assert.throws(()=>a.run('files.test',{path:'b'},{key:'x'}),{code:'IDEMPOTENCY_CONFLICT'});});
test('expired results never trigger an automatic repeat',async()=>{const a=create({instanceId:'test',maxRuns:1});let calls=0;a.register('work',()=>++calls);const first=a.run('work',{}, {key:'first'});await a.wait(first.id);const second=a.run('work',{}, {key:'second'});await a.wait(second.id);assert.throws(()=>a.run('work',{}, {key:'first'}),{code:'RESULT_EXPIRED'});assert.equal(calls,2);});
test('active action limits do not evict ongoing operations',async()=>{const a=create({instanceId:'test',maxActive:1,maxRuns:1});let finish;a.register('work',()=>new Promise(r=>finish=r));const run=a.run('work');assert.throws(()=>a.run('work'),{code:'BUSY'});assert.equal((await a.wait(run.id,0)).state,'running');finish();await a.wait(run.id);});
test('frequent UI queries cannot evict a long operation at its completion',async()=>{const a=create({instanceId:'test',maxRuns:2});let finish;a.register('long',()=>new Promise(r=>finish=r));a.register('query',()=>null);const work=a.run('long');for(let i=0;i<10;i++)await a.wait(a.run('query').id);finish({files:3});assert.deepEqual((await a.wait(work.id)).result,{files:3});});
test('long-running request keys are retained after completion, not expired from submission',async()=>{let clock=0,finish;const a=create({instanceId:'test',now:()=>clock});a.register('work',()=>new Promise(r=>finish=r));const work=a.run('work',{}, {key:'slow'});clock=31*60*1000;finish();await a.wait(work.id);assert.equal(a.lookup('slow').id,work.id);assert.equal(a.run('work',{}, {key:'slow'}).id,work.id);});
test('errors remain inspectable without unhandled rejections',async()=>{const a=create({instanceId:'test'});a.register('failure',async()=>{throw new ActionError('DENIED','no access',{password:'secret',path:'folder'});});const run=a.run('failure');const state=await a.wait(run.id);assert.equal(state.state,'failed');assert.deepEqual(state.error,{code:'DENIED',message:'no access',details:{password:'[REDACTED]',path:'folder'}});});
test('malformed handler results are reported instead of fabricated success',async()=>{const a=create({instanceId:'test'});a.register('bad',()=>({x:undefined}));assert.equal((await a.wait(a.run('bad').id)).error.code,'INVALID_RESULT');});
test('snapshot redacts passwords and isolates individual state-provider failures',()=>{const a=create({instanceId:'test'});a.provideState('settings',()=>({password:'s',nested:{token:'x'},path:'safe'}));a.provideState('broken',()=>{throw Error('error');});const state=a.snapshot().state;assert.equal(state.settings.password,'[REDACTED]');assert.equal(state.settings.nested.token,'[REDACTED]');assert.equal(state.settings.path,'safe');assert.equal(state.broken.error.code,'ACTION_FAILED');});
test('RPC envelope is strictly checked and errors preserve valid request IDs',async()=>{
  const a=api();const call=(method,params)=>a.rpc({jsonrpc:'2.0',id:42,method,params});
  assert.equal((await call('api.describe',{})).result.apiVersion,'1.0');
  assert.equal((await call('actions.describe',{action:'nope'})).error.data.code,'ACTION_NOT_FOUND');
  assert.equal((await call('state.get',{secret:true})).error.code,-32602);
  assert.equal((await call('shell.execute',{})).error.code,-32601);
  const bad=await a.rpc({jsonrpc:'2.0',id:{malicious:true},method:'actions.list'});assert.equal(bad.id,null);assert.equal(bad.error.code,-32600);
});
test('array schema, enum, item counts and nested fields are enforced',()=>{const s={type:'array',items:{type:'string',enum:['a','b']},maxItems:2};validate(['a','b'],s);assert.throws(()=>validate(['c'],s));assert.throws(()=>validate(['a','a','a'],s));});
test('CLI supports explicit targets and panes without hidden phone changes',()=>{const {options,position}=parseArguments(['--android','emulator-5584','--pane','right','--wait','run','files.list','{"limit":2}']);assert.equal(options.android,'emulator-5584');assert.equal(options.pane,'right');assert.equal(options.wait,true);assert.deepEqual(requestFor(position,'k').params,{action:'files.list',args:{limit:2},key:'k'});});
for(const input of ['https://127.0.0.1:9222','http://server:9222','http://127.0.0.1@evil.com','http://127.0.0.1:9222/path','http://127.0.0.1:9222?x=y','http://user:secret@localhost:9222'])test('CLI refuses nonlocal/ambiguous endpoint '+input,()=>assert.throws(()=>endpointUrl(input),{code:'INVALID_ENDPOINT'}));
test('CLI validates arguments before transport access',()=>{assert.equal(endpointUrl('http://127.0.0.1:9222'),'http://127.0.0.1:9222');assert.throws(()=>parseArguments(['--port','0']));assert.throws(()=>parseArguments(['--pane','unknown']));assert.throws(()=>parseArguments(['--scope','image']));assert.throws(()=>parseArguments(['--android','phone','--launch','app.exe']));assert.throws(()=>requestFor(['state','ignored']));assert.throws(()=>requestFor(['run','x','broken-json']));});
test('untrusted CLI strings remain JSON rather than executable source',async()=>{let seen;const request={jsonrpc:'2.0',id:1,method:'actions.run',params:{action:'x',args:{path:'");globalThis.pwned=true;//\n中文\\a'},key:'safe'}};const context=vm.createContext({RHFilesAPI:{rpc:async r=>{seen=r;return {ok:true};}}});await vm.runInContext(expressionFor(request),context);assert.equal(context.pwned,undefined);assert.equal(seen.params.args.path,request.params.args.path);});
