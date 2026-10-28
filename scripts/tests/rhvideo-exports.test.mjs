import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
import {deferred} from '../testing/source.mjs';
const require=createRequire(import.meta.url),E=require('../../src/js/rhvideo-exports.js'),I=require('../../src/js/rhvideo-index.js');
const search=require('../../src/js/rhvideo-search.js'),dictionary=require('../../src/vendor/pinyin-pro/pinyin-pro.js'),tags=require('../../src/js/rhvideo-tags.js');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const rows=length=>Array.from({length},(_,n)=>({id:String(n),kind:['video','picture','novel'][n%3]}));
function client({queue=rows(43),native,selection,changed}={}){
  const actions=new Map(),schemas=new Map(),calls=[];let next=1;
  const module=E.install({action:(name,schema,handler)=>{actions.set(name,handler);schemas.set(name,schema);},object:(properties,required)=>({properties,required}),requestId:()=>id(next++),selection:selection||(()=>({queue,total:queue.length})),changed,
    native:async(name,args)=>{calls.push({name,args});if(native)return native(name,args);if(name==='exports.prepare')return {ticket:args.ticket,total:args.total,count:args.offset+args.items.length,ready:args.offset+args.items.length===args.total};if(name==='exports.create')return {id:id(99),status:'queued'};return {removed:true};}});
  return {module,actions,schemas,calls,invoke:(name,args={})=>actions.get('exports.'+name)(args)};
}

test('filtered ZIP export includes every page and all three media types, never just visible cards',async()=>{
  const c=client();await c.invoke('create',{scope:'filtered'});
  const chunks=c.calls.filter(v=>v.name==='exports.prepare');assert.equal(chunks.length,1);assert.equal(chunks[0].args.total,43);assert.equal(chunks[0].args.items[42].id,'42');assert.deepEqual(new Set(chunks[0].args.items.map(v=>v.type)),new Set(['video','picture','novel']));
  assert.deepEqual(c.calls.at(-1),{name:'exports.create',args:{requestId:id(2),ticket:id(1)}});
  assert.equal(c.module.state().busy,false);assert.equal(c.module.state().phase,'idle');
});
test('all favorites omit the selection entirely and never wait for a filtered catalog',async()=>{
  const c=client({selection:()=>{throw Error('All scope must not query the view');}});await c.invoke('create',{scope:'all'});
  assert.deepEqual(c.calls,[{name:'exports.create',args:{requestId:id(1)}}]);
});
test('50000 references use bounded consecutive messages and strip unnecessary huge metadata',async()=>{
  const queue=rows(50000).map(v=>({...v,title:'巨大的无关标题'.repeat(2000)})),c=client({queue});await c.invoke('create',{scope:'filtered'});
  const chunks=c.calls.filter(v=>v.name==='exports.prepare');assert.equal(chunks.length,250);
  for(const [n,{args}]of chunks.entries()){assert.equal(args.offset,n*200);assert.equal(args.items.length,200);assert(Buffer.byteLength(JSON.stringify(args))<256*1024);assert.deepEqual(Object.keys(args.items[0]),['type','id']);}
  assert.equal(c.calls.filter(v=>v.name==='exports.create').length,1);
});
test('partial, empty, excessive, duplicate and invalid selections cannot submit a ZIP',async()=>{
  for(const result of [{total:0,queue:[]},{total:4,queue:rows(2)},{total:50001,queue:[]},{total:2,queue:[...rows(1),...rows(1)]},{total:1,queue:[{kind:'folder',id:'x'}]}]){
    const c=client({selection:()=>result});await assert.rejects(c.invoke('create',{scope:'filtered'}));assert.equal(c.calls.length,0);
  }
});
test('preparation failure discards only its own draft and does not submit or replay writes',async()=>{
  const c=client({queue:rows(201),native:async(name,args)=>{if(name==='exports.prepare'&&args.offset===200)throw Error('second chunk failed');if(name==='exports.prepare')return {ticket:args.ticket,total:201,count:200,ready:false};return {removed:true};}});
  await assert.rejects(c.invoke('create',{scope:'filtered'}),/second chunk/);assert.equal(c.calls.filter(v=>v.name==='exports.create').length,0);assert.deepEqual(c.calls.at(-1),{name:'exports.discard',args:{ticket:id(1)}});
});
test('an ambiguous submitted request is not reissued, and a new user action gets a new intent',async()=>{
  const c=client({native:async(name)=>{if(name==='exports.create')throw Error('Connection closed after request');}});
  await assert.rejects(c.invoke('create',{scope:'all'}));assert.equal(c.calls.length,1);assert.match(c.module.state().message,/查看最近导出/);assert.equal(c.module.state().phase,'failed');
  await assert.rejects(c.invoke('create',{scope:'all'}));assert.notEqual(c.calls[0].args.requestId,c.calls[1].args.requestId);
});
test('late selection and job callbacks after account reset cannot mutate or retarget the new session',async()=>{
  const selection=deferred(),c=client({selection:()=>selection.promise});const old=c.invoke('create',{scope:'filtered'});c.module.reset();selection.resolve({queue:rows(1),total:1});await assert.rejects(old,/账户已改变/);assert.equal(c.calls.length,0);assert.equal(c.module.state().phase,'idle');
  const request=deferred(),d=client({native:()=>request.promise});const submitted=d.invoke('create',{scope:'all'});d.module.reset();request.resolve({id:id(9)});await assert.rejects(submitted,/账户已改变/);assert.equal(d.module.state().lastJob,null);assert.equal(d.module.state().phase,'idle');
});
test('one create at a time, malformed prepare acknowledgements cannot start packing',async()=>{
  const gate=deferred(),c=client({native:()=>gate.promise});const first=c.invoke('create',{scope:'all'});await assert.rejects(c.invoke('create',{scope:'all'}),/正在进行/);gate.resolve({id:id(9)});await first;
  const malformed=client({native:async()=>({ticket:id(1),total:43,count:42,ready:true})});await assert.rejects(malformed.invoke('create',{scope:'filtered'}),/完整准备/);assert(!malformed.calls.some(v=>v.name==='exports.create'));
});
test('read and cancellation actions use the same fixed native operation contract',async()=>{
  const c=client();await c.invoke('list',{limit:100});await c.invoke('get',{id:id(7)});await c.invoke('cancel',{id:id(7)});
  assert.deepEqual(c.calls.map(v=>v.args),[{name:'exports.list',query:{limit:100}},{name:'exports.get',params:{id:id(7)}},{name:'exports.cancel',params:{id:id(7)}}]);
  await assert.rejects(c.invoke('get',{id:'../auth/me'}));assert.equal(c.calls.length,3);
  assert(new RegExp(c.schemas.get('exports.get').properties.id.pattern).test('C8F17F3E-28C5-4FCA-9FB2-204FB8713980'),'Public schema and native clients both accept canonical UUID hex casing');
});
test('actual workbench provider freezes filters before I/O and reloads favorites changed by other clients',async()=>{
  const text=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');let declaration;
  function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id.name==='favoriteExportSelection')declaration=text.slice(node.start,node.end);for(const v of Object.values(node))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(text,{ecmaVersion:'latest'}));assert(declaration);
  const gate=deferred(),filter={rule:{include:['旧筛选']},search:'before'},calls=[];
  const context=vm.createContext({structuredClone,criteria:extra=>({...filter,...extra}),ensure:()=>gate.promise,rawCatalog:async(kind,refresh)=>calls.push({kind,refresh}),query:async(args,version)=>({args,version})});
  vm.runInContext(declaration,context);const pending=context.favoriteExportSelection();filter.rule.include.push('迟到的新标签');filter.search='after';gate.resolve(9);const result=JSON.parse(JSON.stringify(await pending));
  assert.deepEqual(calls,[{kind:'favorite',refresh:true}]);assert.equal(result.version,9);assert.equal(result.args.search,'before');assert.deepEqual(result.args.rule.include,['旧筛选']);assert.equal(result.args.allKeys,true);assert.equal(result.args.offset,0);
});

const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
test('differential: original export selection includes the complete current filtered favorites, including novels',{skip:!fs.existsSync(reference)},async()=>{
  let oracle;
  function walk(node,text){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee?.object?.name==='RHFavoriteExports'&&node.callee.property?.name==='init'){const method=node.arguments[0].properties.find(v=>v.key.name==='getSelection').value;oracle=text.slice(method.start,method.end);}for(const v of Object.values(node))if(Array.isArray(v))v.forEach(n=>walk(n,text));else if(v&&typeof v==='object')walk(v,text);}
  for(const match of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))walk(parse(match[1],{ecmaVersion:'latest'}),match[1]);assert(oracle,'Read actual original getSelection callback');
  const catalog=new I.Catalog({search,dictionary,tags}),source=rows(71).map(v=>({id:v.id,type:v.kind,title:'收藏 '+v.id,original_filename:'收藏 '+v.id,folder_label:Number(v.id)%2?'保留':'其他'}));catalog.set('favorite',source);
  const result=await catalog.query({kind:'favorite',search:'收藏',folder:'保留',allKeys:true,offset:0,limit:1});assert.equal(result.items.length,1);assert(result.total>20);
  let loaded=0,rendered=0;const context=vm.createContext({loadFavorites:async()=>{loaded++;return true;},renderFavorites:async()=>{rendered++;},favNormItems:result.queue.map(v=>({mediaType:v.kind,id:v.id}))});
  const expected=JSON.parse(JSON.stringify(await vm.runInContext('('+oracle+')()',context)));
  assert.deepEqual(E.selection(result),expected);assert.equal(loaded,1);assert.equal(rendered,1);
});
