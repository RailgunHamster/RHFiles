import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {create}=createRequire(import.meta.url)('../../src/js/automation-core.js');
test('a retired action disposer cannot unregister a new owner of the same action',async()=>{
 const api=create(),handler=()=>({value:2}),old=api.register('generated.action',handler);old();const current=api.register('generated.action',handler);old();assert.deepEqual(await api.invoke('generated.action'),{value:2});current();await assert.rejects(api.invoke('generated.action'),{code:'ACTION_NOT_FOUND'});
});
test('a retired state disposer cannot remove a new registration of the identical provider',()=>{
 const api=create(),read=()=>({value:3}),old=api.provideState('generated',read);assert.deepEqual(api.snapshot().state.generated,{value:3});old();assert(!Object.hasOwn(api.snapshot().state,'generated'));const current=api.provideState('generated',read);old();assert.deepEqual(api.snapshot().state.generated,{value:3});current();assert(!Object.hasOwn(api.snapshot().state,'generated'));
});
test('a rejected duplicate registration never replaces its current owner',async()=>{
 const api=create(),remove=api.register('generated.action',()=>4);assert.throws(()=>api.register('generated.action',()=>5),{code:'DUPLICATE_ACTION'});assert.equal(await api.invoke('generated.action'),4);remove();assert.equal(api.list().length,0);
});
test('unmounting an action does not discard completion of a previously accepted run',async()=>{
 const api=create();let release;const gate=new Promise(resolve=>release=resolve),remove=api.register('generated.pending',()=>gate);const pending=api.run('generated.pending');remove();await assert.rejects(api.invoke('generated.pending'),{code:'ACTION_NOT_FOUND'});release({completed:true});const result=await api.wait(pending.id,1000);assert.equal(result.state,'succeeded');assert.deepEqual(result.result,{completed:true});
});
