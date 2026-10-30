import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {parse} from 'acorn';
const require=createRequire(import.meta.url),I=require('../../src/js/rhvideo-index.js');
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');let handler,closeHandler;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee.name==='action'){if(node.arguments[0]?.value==='replacement.selected')handler=node.arguments[2];if(node.arguments[0]?.value==='panel.close')closeHandler=node.arguments[2];}for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}walk(parse(source,{ecmaVersion:'latest'}));assert(handler);assert(closeHandler);
const rows=[{id:'z',original_filename:'Z.mp4',original_filesize:1,created_at:'2026-01-02'},{id:'a',original_filename:'A.mp4',original_filesize:3,created_at:'2026-01-01'},{id:'m',original_filename:'M.mp4',original_filesize:2,created_at:'2026-01-03'}];
const keys=['video:a','video:lost','picture:p','video:m','video:ghost','video:z'];
const make=(options={})=>{
  const catalog=new I.Catalog();catalog.set('video',rows);const calls=[],queries=[],selected=new Set(options.keys||keys);
  const scope=vm.createContext({epoch:7,replacementSelectionIntent:0,selected,pendingConfirmation:null,detailJob:null,viewer:null,liveRefresh:{enabled:false,configure(){}},$:()=>({close(){}}),config:()=>({sort:options.sort||'dateDesc',seed:options.seed||0}),ensure:async()=>{await options.ensure?.(scope);return scope.epoch;},
    query:async args=>{queries.push(args);await options.query?.(scope);return catalog.query(args);},
    invoke:async(name,args)=>{calls.push({name,args});return {name,args};}});
  const run=vm.runInContext('('+source.slice(handler.start,handler.end)+')',scope);
  const close=vm.runInContext('('+source.slice(closeHandler.start,closeHandler.end)+')',scope);
  return {scope,calls,queries,selected,close:id=>close({id}),run:()=>run({resolution:'1280x720',crf:30})};
};
for(const [sort,ids]of [['dateDesc',['m','z','a','lost','ghost']],['dateAsc',['a','z','m','lost','ghost']],['nameAsc',['a','m','z','lost','ghost']],['nameDesc',['z','m','a','lost','ghost']],['sizeDesc',['a','m','z','lost','ghost']],['sizeAsc',['z','m','a','lost','ghost']]])test('selected replacement follows '+sort+' across filters, then retains missing selected IDs',async()=>{
  const f=make({sort});await f.run();assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'replacement.submit');assert.deepEqual(Array.from(f.calls[0].args.ids),ids);
  assert.equal(f.queries.length,1);const q=f.queries[0];assert.equal(q.kind,'video');assert.equal(q.search,'');assert.equal(q.folder,'');assert.deepEqual(Object.keys(q.rule),[]);assert.equal(q.allKeys,true);assert.equal(q.latest,undefined);
  assert.equal(q.mediaType,'video');assert.equal(q.portraitOnly,false);
});
test('a selection change during metadata lookup cannot change the already clicked replacement batch',async()=>{
  const f=make({query:scope=>{scope.selected.clear();scope.selected.add('video:new-click');}});await f.run();assert.deepEqual(Array.from(f.calls[0].args.ids),['m','z','a','lost','ghost']);assert.deepEqual([...f.selected],['video:new-click']);
});
for(const phase of ['ensure','query'])test('an account change during '+phase+' rejects the old selection before confirmation',async()=>{
  const f=make({[phase]:scope=>{scope.epoch++;}});await assert.rejects(f.run(),/媒体账户已改|媒体账户已更改/);assert.equal(f.calls.length,0);
});
test('a failed snapshot does not silently submit in click order or replay any operation',async()=>{
  const f=make({query:()=>{throw Error('owned metadata failure');}});await assert.rejects(f.run(),/owned metadata failure/);assert.equal(f.calls.length,0);assert.equal(f.queries.length,1);
});
test('an empty/video-free selection cannot create a replacement confirmation',async()=>{
  for(const keys of [[],['picture:p','novel:n']]){const f=make({keys});await assert.rejects(f.run(),/选择视频/);assert.equal(f.calls.length,0);assert.equal(f.queries.length,0);}
});
test('native seeded ordering is retained without filtering or discarding unknown selected IDs',async()=>{
  const f=make({seed:123}),catalog=new I.Catalog();catalog.set('video',rows);await f.run();
  const known=(await catalog.query({kind:'video',seed:123,allKeys:true})).queue.map(row=>row.id);assert.deepEqual(Array.from(f.calls[0].args.ids),[...known,'lost','ghost']);
});
test('the 1000-video limit is exact and larger selections fail before metadata or confirmation',async()=>{
  const f=make({keys:Array.from({length:1000},(_,i)=>'video:id-'+i)});await f.run();assert.equal(f.calls[0].args.ids.length,1000);
  const huge=make({keys:Array.from({length:1001},(_,i)=>'video:id-'+i)});await assert.rejects(huge.run(),/1000/);assert.equal(huge.calls.length,0);assert.equal(huge.queries.length,0);
});
for(const phase of ['ensure','query'])test('a newer replacement request wins over an older delayed '+phase,async()=>{
  let release,count=0;const gate=new Promise(resolve=>release=resolve),f=make({[phase]:()=>++count===1?gate:undefined});
  const old=f.run();await new Promise(setImmediate);f.selected.clear();f.selected.add('video:z');await f.run();release();
  assert.equal((await old).stale,true);assert.equal(f.calls.length,1);assert.deepEqual(Array.from(f.calls[0].args.ids),['z']);
});
for(const id of ['wb-info','wb-confirm'])test('closing '+id+' invalidates its delayed unsubmitted replacement confirmation',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),f=make({query:()=>gate}),pending=f.run();await new Promise(setImmediate);await f.close(id);release();
  assert.equal((await pending).stale,true);assert.equal(f.calls.length,0);
});
const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html'),functions=new Map();
if(fs.existsSync(reference))for(const script of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(script[1],{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'&&['applyVideoSort','showBatchReplaceModal'].includes(node.id.name))functions.set(node.id.name,script[1].slice(node.start,node.end));
test('differential: actual reference replacement freezes full-list ordering and keeps missing IDs',{skip:!functions.size},async()=>{
  const nodes=new Map(),scope=vm.createContext({allVideos:rows,videoBatchIds:new Set(keys.filter(key=>key.startsWith('video:')).map(key=>key.slice(6))),replaceEstimateRequest:0,replaceSubmissionKey:null,replaceReceiptMismatch:false,replaceBatchIds:null,replaceModalVideoId:null,
    doReplaceConfirm(){},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{classList:{add(){},remove(){}},style:{setProperty(){}}});return nodes.get(id);}}});
  assert.equal(functions.size,2);vm.runInContext([...functions.values()].join('\n'),scope);
  for(const [sort,by]of [['dateDesc','date-desc'],['dateAsc','date-asc'],['nameAsc','name'],['sizeDesc','size-desc'],['sizeAsc','size-asc']]){
    scope.allVideos=scope.applyVideoSort(rows,by);scope.showBatchReplaceModal();const f=make({sort});await f.run();assert.deepEqual(Array.from(f.calls[0].args.ids),Array.from(scope.replaceBatchIds));
  }
});
