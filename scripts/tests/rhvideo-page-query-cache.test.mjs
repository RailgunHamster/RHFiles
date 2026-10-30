import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');
const functions=new Map();
function collect(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration')functions.set(node.id.name,node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(collect);else collect(value);}}
collect(parse(source,{ecmaVersion:'latest'}));
function fixture(){
  const calls=[];let checks=0,rawError=null,delay=null,result={items:[{kind:'video',id:'one'}],total:1,sourceTotal:1};
  const context=vm.createContext({epoch:1,catalogRevision:1,pageResults:new Map(),raw:new Map(),worker:null,rulesEditor:null,resolutions:{clear(){}},
    async ensure(){checks++;return context.epoch;},criteria:extra=>({kind:'video',search:'',sort:'dateDesc',offset:0,limit:36,...extra}),
    async rawCatalog(){if(rawError)throw rawError;},async send(action,args){calls.push({action,args});if(delay)await delay;return result;}});
  for(const name of ['query','invalidateCatalog']){const node=functions.get(name);assert(node);vm.runInContext(source.slice(node.start,node.end),context);}
  return {context,calls,query:(args={latest:true},cache=true)=>context.query(args,undefined,cache),setResult:value=>{result=value;},setRawError:value=>{rawError=value;},setDelay:value=>{delay=value;},checks:()=>checks};
}

test('the same current list page reuses bounded worker output but still validates the session and raw catalog',async()=>{
  const f=fixture();const first=await f.query(),second=await f.query();
  assert.equal(f.calls.length,1,'A cache hit must not repeat the worker round trip');assert.equal(f.checks(),2);
  assert.deepEqual(JSON.parse(JSON.stringify(first)),JSON.parse(JSON.stringify(second)));
  f.setRawError(Error('raw catalog failed'));await assert.rejects(f.query(),/raw catalog failed/);assert.equal(f.calls.length,1);
});

test('every query criterion and page participates in the cache identity',async()=>{
  const f=fixture();await f.query();
  for(const args of [{kind:'picture'},{search:'other'},{sort:'dateAsc'},{offset:36},{limit:72},{seed:4},{folder:'one'},{mediaType:'picture'},{portraitOnly:true},{rule:{not:['tag']}},{selected:['video:one']}])await f.query({latest:true,...args});
  assert.equal(f.calls.length,12);assert(f.context.pageResults.size<=8);
});

test('refresh and mutation invalidation drop cached list pages, including favorites',async()=>{
  const f=fixture();await f.query();f.context.invalidateCatalog('favorite');await f.query();assert.equal(f.calls.length,2);
  f.context.invalidateCatalog();await f.query();assert.equal(f.calls.length,3);
});

test('uncommitted stale worker paints and changed account/catalog epochs cannot populate the cache',async()=>{
  for(const field of ['epoch','catalogRevision']){
    const f=fixture();let release;f.setDelay(new Promise(resolve=>release=resolve));const pending=f.query();await new Promise(resolve=>setImmediate(resolve));f.context[field]++;release();await assert.rejects(pending,/已丢弃旧读取/);assert.equal(f.context.pageResults.size,0);
  }
  const f=fixture();f.setResult({items:[],total:0,stale:true});await f.query();await f.query();assert.equal(f.calls.length,2);assert.equal(f.context.pageResults.size,0);
});

test('playback/order/export snapshots and unbounded responses never use the list-page cache',async()=>{
  const f=fixture();await f.query({allKeys:true},false);await f.query({allKeys:true},false);assert.equal(f.calls.length,2);assert.equal(f.context.pageResults.size,0);
  f.setResult({items:Array.from({length:101},(_,id)=>({id})),total:101});await f.query();await f.query();assert.equal(f.calls.length,4);assert.equal(f.context.pageResults.size,0);
  f.setResult({items:[{id:'one',description:'x'.repeat(262144)}],total:1});await f.query();await f.query();assert.equal(f.calls.length,6);assert.equal(f.context.pageResults.size,0);
  f.setResult({items:[],total:0,queue:[]});await f.query({latest:true,allKeys:true});await f.query({latest:true,allKeys:true});assert.equal(f.calls.length,8);assert.equal(f.context.pageResults.size,0);
});

test('cached page containers cannot be corrupted by replacing a caller result array or count',async()=>{
  const f=fixture(),first=await f.query();first.items=[];first.total=0;const second=await f.query();assert.equal(second.total,1);assert.equal(second.items.length,1);
});

test('the page cache is explicit only at the normal catalog boundary and is cleared on worker catalog invalidation',()=>{
  assert.match(source,/const pageResults = new Map\(\)/);
  assert.match(source,/query\(\{latest:true\}, token, true\)/);
  assert.match(source,/function invalidateCatalog\(kind\) \{\s*catalogRevision\+\+;\s*pageResults\.clear\(\)/);
});
