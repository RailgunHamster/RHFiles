import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import{createRequire}from'node:module';import{parse}from'acorn';
const require=createRequire(import.meta.url),I=require('../../src/js/rhvideo-index.js'),tags=require('../../src/js/rhvideo-tags.js'),functions=new Map(),file=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
if(fs.existsSync(file))for(const script of fs.readFileSync(file,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(script[1],{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration')functions.set(node.id.name,script[1].slice(node.start,node.end));
const pictures=['z','a','b','c'].map((id,i)=>({id,kind:'picture',folder_label:i%2?'Other':'Keep',webp_path:id+'.webp',original_filename:id+'.png'}));
function oracle(items,saved,allowed=items,rule={}){const c=vm.createContext({allPictures:items,picMedia:allowed.map(p=>({pictureId:p.id})),mediaTagFilter:rule,RHTagFilter:tags,picStripShuffleKey:()=> 'owned',localStorage:{getItem:()=>saved===null?null:JSON.stringify(saved)}});vm.runInContext(functions.get('buildPicStripOrder'),c);return Array.from(c.buildPicStripOrder(),p=>p.id);}

test('picture source queries preserve server order independently of card sorting or shuffle preferences',async()=>{
 const c=new I.Catalog();c.set('picture',pictures);const result=await c.query({kind:'picture',sort:'source',allKeys:true});assert.deepEqual(result.queue.map(p=>p.id),pictures.map(p=>p.id));assert.equal(result.sourceTotal,4);
});
test('differential: saved picture IDs are filtered, deduplicated and followed by new pictures in server order',{skip:!functions.size},()=>{
 for(const saved of [null,[],['b','gone','b','z'],['c','a','z','b']])for(const rule of [{},{include:['Keep']}]){
  const allowed=pictures.filter(p=>p.id!=='a'),eligible=allowed.filter(p=>tags.compile(rule)(p.folder_label));assert.deepEqual(I.pictureOrder(eligible,saved).map(p=>p.id),oracle(pictures,saved,allowed,rule));
 }
 const changed=[{...pictures[0],id:'new'},...pictures],saved=['b','z','a','c'];assert.deepEqual(I.pictureOrder(changed,saved).map(p=>p.id),['b','z','a','c','new']);
});
test('differential: shuffle uses the actual reference Fisher-Yates procedure, not a new hash sort',{skip:!functions.size},()=>{
 const values=[.7,.1,.6],random=()=>{let i=0;return ()=>values[i++%values.length];},stored=new Map(),math=Object.create(Math);math.random=random();const c=vm.createContext({picStripAutoOn:false,picStripItems:pictures,picStripVMode:false,Math:math,performance:{now:()=>0},localStorage:{setItem:(key,value)=>stored.set(key,value)},picStripShuffleKey:()=> 'owned',reorderPicStripDom:()=>true,picStripRows:()=>[],psUpdateWindows(){},restorePicStripActive(){},rhDebug(){},notify(){}});vm.runInContext(functions.get('picStripHashIds')+'\n'+functions.get('shufflePicStrip'),c);c.shufflePicStrip();assert.deepEqual(I.shufflePictures(pictures,random()).map(p=>p.id),Array.from(c.picStripItems,p=>p.id));assert.deepEqual(pictures.map(p=>p.id),['z','a','b','c']);
});
test('differential: scroll identity uses the full saved order even when a tag filter hides some IDs',{skip:!functions.size},()=>{
 const c=vm.createContext({});vm.runInContext(functions.get('picStripHashIds'),c);for(const ids of [[],['z','😀','a'],['z','a','b']])assert.equal(I.pictureOrderSignature(ids,4),'rnd:'+c.picStripHashIds(ids));assert.equal(I.pictureOrderSignature(null,4),'seq:4');assert.equal(I.pictureOrderSignature(['z','a'],4),I.pictureOrderSignature(['z','a'],5));assert.notEqual(I.pictureOrderSignature(null,4),I.pictureOrderSignature(null,5));
});
test('a large persisted picture order stays exact rather than dropping IDs to fit the small general preferences record',()=>{
 const items=Array.from({length:50000},(_,i)=>({id:('00000000-0000-4000-8000-'+String(i).padStart(12,'0')),kind:'picture'})),ids=items.map(p=>p.id).reverse(),encoded=JSON.stringify(ids);assert(encoded.length>256*1024);assert(encoded.length<5*1024*1024);assert.deepEqual(I.pictureOrder(items,JSON.parse(encoded)).map(p=>p.id),ids);
});
