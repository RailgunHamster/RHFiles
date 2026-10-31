import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
const require=createRequire(import.meta.url),I=require('../../src/js/rhvideo-index.js'),tags=require('../../src/js/rhvideo-tags.js');
const create=()=>new I.Catalog({tags});
const rows=[
  {id:'z',kind:'frame',videoId:'a',title:'Z',folder_label:'keep',seconds:9},
  {id:'b',kind:'frame',videoId:'b',title:'B',folder_label:'other',seconds:2},
  {id:'a',kind:'frame',videoId:'a',title:'A',folder_label:'keep',seconds:1},
  {id:'p',kind:'picture',videoId:'a',title:'P',folder_label:'keep'},
];
test('locating a cached screenshot returns the same first match as the full ordered reference pool',async()=>{
  const c=create();c.set('gallery',rows);
  for(const sort of I.sorts)for(const seed of [0,17]){
    const args={kind:'gallery',sort,seed},full=await c.query({...args,allKeys:true});
    const result=await c.query({...args,limit:1,locate:{videoId:'a'}}),index=full.queue.findIndex(v=>v.kind==='frame'&&v.videoId==='a');
    assert.equal(result.located.index,index);assert.equal(result.located.item.id,full.queue[index].id);assert.equal(result.total,4);assert.equal(result.queue,undefined);
  }
});
test('exact media lookup obeys filters and never substitutes the first unrelated item',async()=>{
  const c=create();c.set('gallery',rows);
  const args={kind:'gallery',folder:'keep',sort:'nameDesc',limit:1};
  const exact=await c.query({...args,locate:{key:'picture:p'}});assert.equal(exact.located.item.kind,'picture');assert.equal(exact.located.index,1);assert.equal(exact.total,3);
  for(const key of ['frame:b','picture:missing','frame:p'])assert.equal((await c.query({...args,locate:{key}})).located,null);
  c.set('gallery',[rows[2]]);assert.equal((await c.query({...args,locate:{key:'frame:z'}})).located,null,'a replaced catalog cannot reuse an old position');
});
test('one-hundred-thousand screenshot navigation transfers one target, not the complete queue',async()=>{
  const c=create(),count=100000;c.set('gallery',Array.from({length:count},(_,i)=>({id:'f'+i,kind:'frame',videoId:'v'+i,title:String(i).padStart(6,'0'),seconds:i})));
  let searches=0;const search=c.search.bind(c);c.search=(...args)=>{searches++;return search(...args);};
  for(const target of [0,99999,50000]){
    const value=await c.query({kind:'gallery',sort:'nameAsc',limit:1,locate:{videoId:'v'+target}});
    assert.equal(value.total,count);assert.equal(value.located.index,target);assert.equal(value.located.item.id,'f'+target);assert.equal(value.items.length,1);assert.equal(value.queue,undefined);assert(Buffer.byteLength(JSON.stringify(value))<2000,'worker response stays bounded independently of pool size');
  }
  assert.equal(searches,1,'locating another target reuses the same filtered order');
});
test('a malformed locator fails before scanning or indexing the collection',async()=>{
  const c=create();c.search=()=>assert.fail('invalid locator should not build the order');
  for(const locate of [{},[],{videoId:'a',key:'frame:a'},{videoId:'../a'},{key:'frame:a',extra:true},{key:42},'a'])await assert.rejects(c.query({kind:'gallery',locate}),/定位/);
});
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),functions=new Map();let inspect;
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&['play','image'].includes(n.id?.name))functions.set(n.id.name,source.slice(n.start,n.end));if(n.type==='CallExpression'&&n.callee.name==='action'&&n.arguments[0]?.value==='gallery.inspect')inspect=source.slice(n.arguments[2].start,n.arguments[2].end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
walk(parse(source,{ecmaVersion:'latest'}));
function harness(){
  const calls=[],c=create();c.set('gallery',rows);c.set('picture',[rows[3]]);
  const scope=vm.createContext({epoch:1,singlePlayIntent:0,imageSession:null,gallery:{loaded:true,items:rows,seed:0,load:1,revision:1},state:{kind:'picture',search:''},I,crypto:{randomUUID:()=> 'owned'},
    config:()=>({rule:{},sort:'nameAsc'}),galleryReady:()=>true,criteria:args=>args,
    send:async(action,args)=>{assert.equal(action,'query');assert.notEqual(args.allKeys,true,'a single click cannot transfer the entire pool');calls.push(args);return c.query(args);},
    query:async args=>{calls.push(args);assert.notEqual(args.allKeys,true);return c.query(args);},
    prepareQueue:async()=> 'ticket',discardPrepared:async()=>{},native:async()=>({opened:true}),notice:message=>assert.fail(message),ctx:{openDialog:()=>calls.push('opened')},stepImage:async()=>({index:0})});
  vm.runInContext([...functions.values()].join('\n')+'\nvar inspect=('+inspect+');',scope);return {scope,c,calls};
}
test('the shipped ordinary click keeps its first matching screenshot parent without a full worker transfer',async()=>{
  const h=harness();await h.scope.play({id:'a',kind:'video',title:'A'});assert.equal(h.scope.imageSession.index,0);assert.equal(h.scope.imageSession.current.id,'z');assert.equal(h.scope.imageSession.total,4);assert.equal(h.calls[0].locate.videoId,'a');
});
test('the shipped picture click rejects a disappeared target instead of opening another file',async()=>{
  const h=harness();await h.scope.image(rows[3]);assert.equal(h.scope.imageSession.index,0);assert.equal(h.calls[0].locate.key,'picture:p');h.c.set('picture',[]);await assert.rejects(h.scope.image(rows[3]),/图片|清单/);
});
test('gallery inspect uses the exact ordered target and discards a delayed lookup after closing',async()=>{
  const h=harness();await h.scope.inspect({index:0});assert.equal(h.scope.imageSession.index,0);assert.equal(h.calls[0].locate.key,'frame:z');
  let release;h.scope.send=()=>new Promise(resolve=>release=resolve);const old=h.scope.inspect({index:2});h.scope.gallery.load++;release({located:{index:0,item:rows[2]},total:4});assert.equal((await old).stale,true);assert.equal(h.calls.filter(c=>c==='opened').length,1);
});
test('gallery inspect cannot reopen a decoded old picture after another media intent or account change',async()=>{
  for(const change of [s=>s.singlePlayIntent++,s=>s.epoch++,s=>s.gallery.revision++]){
    const h=harness();let release;h.scope.stepImage=()=>new Promise(resolve=>release=resolve);
    const old=h.scope.inspect({index:0});while(!release)await new Promise(setImmediate);assert.equal(h.calls.filter(c=>c==='opened').length,1,'Initial loading is visible and closable');change(h.scope);release({index:3});assert.equal((await old).stale,true);assert.equal(h.calls.filter(c=>c==='opened').length,1,'A retired decode cannot reopen its dialog');
  }
});
