import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),actions=new Map();let invalidator;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='invalidatePendingConfirmation')invalidator=node;if(node.type==='CallExpression'&&node.callee.name==='action')actions.set(node.arguments[0]?.value,node.arguments[2]);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}walk(parse(source,{ecmaVersion:'latest'}));assert(invalidator);
const deferred=()=>{let resolve;return {promise:new Promise(done=>resolve=done),resolve:()=>resolve()};};
const spec={operations:{'batches.create':{risk:'destructive'},'safe.read':{risk:'read'}}};
function fixture(options={}){
  const calls=[],scope=vm.createContext({epoch:7,confirmationIntent:0,state:{generation:3},manifest:options.manifest||Promise.resolve(spec),
    ensure:async()=>{await options.ensure?.(scope);return scope.epoch;},selectedItems:async()=>{await options.items?.(scope);return [{id:'a',kind:'video'}];},
    beginConfirmation:args=>{calls.push(args);return {ticket:'fixture-'+calls.length};}});
  vm.runInContext(source.slice(invalidator.start,invalidator.end),scope);
  const handler=name=>{const node=actions.get(name);assert(node);return vm.runInContext('('+source.slice(node.start,node.end)+')',scope);};
  const begin=handler('confirm.begin'),stage=handler('selection.stage');return {scope,calls,begin:args=>begin(args||{name:'batches.create'}),stage,interrupt:()=>scope.invalidatePendingConfirmation()};
}
for(const phase of ['ensure','manifest'])test('a newer dialog supersedes generic confirmation during '+phase,async()=>{
  const gate=deferred(),f=fixture(phase==='ensure'?{ensure:()=>gate.promise}:{manifest:gate.promise.then(()=>spec)}),pending=f.begin();await new Promise(setImmediate);f.interrupt();gate.resolve();assert.equal((await pending).stale,true);assert.equal(f.calls.length,0);
});
for(const phase of ['ensure','manifest'])test('the newer generic confirmation wins during '+phase+' without creating the old ticket',async()=>{
  const gate=deferred();let count=0;const f=fixture(phase==='ensure'?{ensure:()=>++count===1?gate.promise:undefined}:{manifest:gate.promise.then(()=>spec)}),old=f.begin({name:'batches.create',body:{video_ids:['old']}});await new Promise(setImmediate);
  const newer=f.begin({name:'batches.create',body:{video_ids:['new']}});await new Promise(setImmediate);gate.resolve();assert.equal((await old).stale,true);assert((await newer).ticket);assert.equal(f.calls.length,1);assert.deepEqual(Array.from(f.calls[0].body.video_ids),['new']);
});
test('a later dialog supersedes pending selection-stage metadata without staging files',async()=>{
  const gate=deferred(),f=fixture({items:()=>gate.promise}),pending=f.stage();await new Promise(setImmediate);f.interrupt();gate.resolve();assert.equal((await pending).stale,true);assert.equal(f.calls.length,0);
});
test('a newer generic request supersedes selection metadata before its own dialog is ready',async()=>{
  const items=deferred(),manifest=deferred(),f=fixture({items:()=>items.promise,manifest:manifest.promise.then(()=>spec)}),old=f.stage();await new Promise(setImmediate);const newer=f.begin();await new Promise(setImmediate);
  items.resolve();assert.equal((await old).stale,true);assert.equal(f.calls.length,0);manifest.resolve();assert((await newer).ticket);assert.equal(f.calls.length,1);
});
test('normal generic and selection-stage confirmation still reaches the existing rendering boundary once',async()=>{
  const f=fixture();assert((await f.begin()).ticket);assert((await f.stage()).ticket);assert.equal(f.calls.length,2);assert.equal(f.calls[1].name,'trash.stage');assert.equal(f.calls[1].batch.length,1);
});
test('an obsolete login-state read does not go on to wait for the operation manifest',async()=>{
  const gate=deferred(),f=fixture({ensure:()=>gate.promise,manifest:{then(){assert.fail('An obsolete request must not read another resource');}}}),pending=f.begin();await new Promise(setImmediate);f.interrupt();gate.resolve();assert.equal((await pending).stale,true);assert.equal(f.calls.length,0);
});
test('account changes, invalid operations and failed reads cannot create generic tickets',async()=>{
  const changed=fixture({ensure:s=>{s.state.generation++;}});await assert.rejects(changed.begin(),/账户已改变/);assert.equal(changed.calls.length,0);
  const invalid=fixture();for(const name of ['safe.read','unknown'])await assert.rejects(invalid.begin({name}),/不支持/);assert.equal(invalid.calls.length,0);
  const failed=fixture({ensure:()=>{throw Error('owned-read-failure');}});await assert.rejects(failed.begin(),/owned-read-failure/);assert.equal(failed.calls.length,0);
});
