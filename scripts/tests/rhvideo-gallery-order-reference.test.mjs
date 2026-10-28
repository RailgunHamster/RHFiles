import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {parse} from 'acorn';
const require=createRequire(import.meta.url),I=require('../../src/js/rhvideo-index.js'),tags=require('../../src/js/rhvideo-tags.js');
const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
const videos=[
  {video_id:'z-last',filename:'Z.mp4',folder:'保留',duration:40,resolution:'640x360',screenshots:[{url:'/storage/雪😀/z-late.webp',time_seconds:9},{url:'/storage/z-early.webp',time_seconds:1}]},
  {video_id:'a-first',filename:'A.mp4',folder:'保留',duration:20,resolution:'360x640',base_url:'/storage/a/',frames:[['9.webp',9],['1.webp',1]]},
];
const pictures=[{id:'p-z',original_filename:'Z.webp',folder_label:'保留',webp_path:'z.webp'},{id:'p-a',original_filename:'A.webp',folder_label:'排除',webp_path:'a.webp'}];
const functions=new Map();
if(fs.existsSync(reference))for(const m of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const n of parse(m[1],{ecmaVersion:'latest'}).body)if(n.type==='FunctionDeclaration')functions.set(n.id.name,m[1].slice(n.start,n.end));
function oracle({mix=false,seed=null,rule={},auto=false}={}){
  const stored=new Map(),nodes=new Map(),context=vm.createContext({token:'fixture',API_BASE:'/api/v1',mediaTagGridTimer:0,gridFilterResetPending:false,gridLoadRequest:0,gridLoadController:null,
    gridLoadedData:null,gridLoadedPictures:null,gridLoadedScope:'',gridMedia:[],gridItems:[],gridBaseMedia:[],gridBaseItems:[],gridBaseOrderHash:'',gridOrderHashCache:new WeakMap(),currentGridShuffleSeed:null,
    gridPage:1,noAutoShuffle:!auto,mediaTagFilter:tags.normalize(rule),allPictures:pictures,picturesLoaded:true,picturesLoadPromise:Promise.resolve(),gridRefreshPending:false,
    window:{crypto:{getRandomValues:values=>{values[0]=0x1234abcd;return values;}}},clearLegacyGridOrderStorage(){},
    RHTagFilter:tags,AbortController,clearTimeout,formatTime:String,fetchLibraryIndex:async()=>videos,loadPictures:async()=>{},restoreMediaState(){},renderGridPage(){},
    localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,String(value)),removeItem:key=>stored.delete(key)},
    document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'8',checked:id==='mix-pictures'&&mix,style:{},classList:{add(){},remove(){}},innerHTML:'',textContent:''});return nodes.get(id);}},favEsc:String,console});
  const names=['gridMediaOrderKey','gridOrderHash','gridSeededItemRank','reindexGridItems','applySeedGridOrder','restoreShuffleOrder','gridOrderScopeKey','generateGridShuffleSeed','doShuffle','loadGrid'];
  for(const name of names)assert(functions.has(name),'Missing actual reference function '+name);
  vm.runInContext(names.map(name=>functions.get(name)).join('\n'),context);
  return {context,async load(){await context.loadGrid(false);if(seed)context.applySeedGridOrder(seed);return Array.from(context.gridMedia,v=>context.gridMediaOrderKey(v));}};
}
test('gallery query defaults to server order, without borrowing the video-list sort',async()=>{
  const c=new I.Catalog();c.set('gallery',[{id:'z',kind:'frame',videoId:'z',path:'/z.webp'},{id:'a',kind:'frame',videoId:'a',path:'/a.webp'}]);
  assert.deepEqual((await c.query({kind:'gallery'})).items.map(v=>v.id),['z','a']);
});
test('mixed gallery construction is picture-first and preserves compact frame order without argument spreading',async()=>{
  const c=new I.Catalog();c.setGallery(videos,pictures);
  assert.deepEqual((await c.query({kind:'gallery',limit:10})).items.map(v=>[v.kind,v.id,v.seconds]),[['picture','p-z',undefined],['picture','p-a',undefined],['frame','z-last-frame0',9],['frame','z-last-frame1',1],['frame','a-first-frame0',9],['frame','a-first-frame1',1]]);
  const large=Array.from({length:150000},(_,i)=>({id:'p'+i,webp_path:i+'.webp'}));assert.equal(c.setGallery([],large).count,large.length);
});
test('differential: real reference default and mixed screenshot pools match the shipped worker model',{skip:!functions.size},async()=>{
  for(const mix of [false,true])for(const rule of [{},{mode:'and',include:['保留'],exclude:[]}]){
    const expected=await oracle({mix,rule}).load(),c=new I.Catalog({tags});c.setGallery(videos,mix?pictures:[]);
    const value=await c.query({kind:'gallery',rule,limit:20});assert.deepEqual(value.items.map(I.galleryKey),expected);
  }
});
test('differential: UTF-16 seed/key ranks and ties use the actual current reference algorithm',{skip:!functions.size},async()=>{
  for(const seed of ['00000000','00000001','6d2b79f5','fedcba98']){
    const expected=await oracle({mix:true,seed}).load(),c=new I.Catalog({tags});c.setGallery(videos,pictures);
    assert.deepEqual((await c.query({kind:'gallery',seed,limit:20})).items.map(I.galleryKey),expected);
  }
});
test('inserting/removing library items keeps existing seeded relative order and exact URL identity',async()=>{
  const c=new I.Catalog();c.setGallery(videos,pictures);const args={kind:'gallery',seed:'1234abcd',limit:20},before=(await c.query(args)).items.map(I.galleryKey);
  c.setGallery([{video_id:'new',filename:'new',screenshots:[{url:'/new.webp',time_seconds:0}]},...videos],[{id:'new-p',webp_path:'new-p.webp'},...pictures]);
  const after=(await c.query(args)).items.map(I.galleryKey);assert.deepEqual(after.filter(k=>before.includes(k)),before);
  const target='video:z-last|url:/storage/雪😀/z-late.webp',located=await c.query({...args,locate:{orderKey:target}});assert.equal(I.galleryKey(located.located.item),target);
  for(const seed of ['not-a-seed',{},[],Infinity,-1,4294967296])await assert.rejects(c.query({...args,seed}),/种子/);
});
test('differential: the first mixed library automatically chooses and applies a real reference seed',{skip:!functions.size},async()=>{
  const original=oracle({mix:true,auto:true}),expected=await original.load();assert.equal(original.context.currentGridShuffleSeed,'1234abcd');const c=new I.Catalog();c.setGallery(videos,pictures);assert.deepEqual((await c.query({kind:'gallery',seed:'1234abcd',limit:20})).items.map(I.galleryKey),expected);
});
test('differential: named-order scope has the reference Boolean tag semantics and does not include shot count',{skip:!functions.size},()=>{
  const workbench=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');let helper;
  function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id.name==='galleryOrderScope')helper=workbench.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(workbench,{ecmaVersion:'latest'}));assert(helper);
  for(const mix of [false,true])for(const rule of [{},{include:['保留']},{mode:'or',include:['甲','乙'],exclude:['丙']},{groups:[{include:['甲']},{include:['乙']}],exclude:['丙']}]){
    const original=oracle({mix,rule}),port=vm.createContext({RHTagFilter:tags,config:()=>({rule,mixPictures:mix,perVideo:30})});vm.runInContext(helper,port);assert.equal(port.galleryOrderScope(),original.context.gridOrderScopeKey());
  }
});
