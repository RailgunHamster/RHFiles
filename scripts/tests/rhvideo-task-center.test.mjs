import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const C=createRequire(import.meta.url)('../../src/js/rhvideo-task-center.js');
const page=()=>({items:[{id:'video:one',filename:'测试 <&>.mp4',status:'processing'}],page:1,pages:1,total:1,counts:{running:1}});

test('default history excludes replacement-only results without hiding the failed view',()=>{
  assert.deepEqual(C.statusOptions('default').map(([key])=>key),['all','succeeded','issues']);
  assert.deepEqual(C.statusOptions('replacement').map(([key])=>key),['all','succeeded','issues','skipped','cancelled']);
  assert.deepEqual(Object.keys(C.views),['running','queued','failed','history']);
});
test('task workspace context includes every query and excludes changing refresh bookkeeping',()=>{
  const value={queue:'default',view:'running',q:'中文',days:7,status:'all',pageNumber:1};
  assert.equal(C.contextKey(value),C.contextKey({...value,load:20,renderedLoad:19,live:true}));
  for(const [key,next]of Object.entries({queue:'replacement',view:'failed',q:'other',days:30,status:'issues',pageNumber:2}))assert.notEqual(C.contextKey(value),C.contextKey({...value,[key]:next}),key);
});
test('valid pages preserve literal names, item order and empty pages',()=>{
  const value=page();assert.equal(C.validatePage(value),value);assert.deepEqual(C.validatePage({items:[],page:1,pages:1,total:0}).items,[]);
});
for(const [name,patch]of [['missing items',{items:null}],['too many',{items:Array.from({length:26},(_,i)=>({id:String(i),filename:'x',status:'pending'}))}],['duplicate IDs',{items:[page().items[0],page().items[0]]}],['fractional page',{page:1.5}],['page outside range',{page:2}],['invalid total',{total:-1}],['missing name',{items:[{id:'x',status:'failed'}]}],['missing identity',{items:[{id:'',filename:'x',status:'pending'}]}]])test('rejects malformed task page: '+name,()=>assert.throws(()=>C.validatePage({...page(),...patch}),/格式无效/));
