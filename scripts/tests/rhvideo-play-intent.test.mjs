import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {parse} from 'acorn';
const model=createRequire(import.meta.url)('../../src/js/rhvideo-model.js');
const index=createRequire(import.meta.url)('../../src/js/rhvideo-index.js');
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');
const functions=new Map();
function collect(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration')functions.set(node.id.name,source.slice(node.start,node.end));for(const value of Object.values(node))if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')collect(value);}
collect(parse(source,{ecmaVersion:'latest'}));
const code=name=>{assert(functions.has(name),'Test the actual '+name+' function');return functions.get(name);};
const rows=['a','b','c'].map(id=>({id,title:id,kind:'video',status:'ready',resolution:'640x360',duration:20}));
const frames=rows.map(v=>({id:'frame-'+v.id,key:'frame-'+v.id,kind:'frame',videoId:v.id,title:v.id,seconds:2}));
function reply(args,items){
  if(!args.locate)return {queue:items,total:items.length};
  const at=items.findIndex(v=>args.locate.videoId!==undefined?v.kind==='frame'&&v.videoId===args.locate.videoId:index.key(v)===args.locate.key);
  return {located:at<0?null:{index:at,item:items[at]},total:items.length};
}
function create(overrides={}){
  let sequence=0;const calls=[],discarded=[];
  const context=vm.createContext({epoch:1,singlePlayIntent:0,imageSession:null,gallery:{loaded:true,seed:0,offset:0},state:{search:''},prefs:{},selected:new Set(),RHVideoModel:model,I:index,crypto:{subtle:webcrypto.subtle,randomUUID:()=>String(++sequence)},TextEncoder,Error,
    config:()=>({rule:{},sort:'nameAsc',rotation:0,resume:false,segment:3,fullLength:false,portraitOnly:false,loop:false}),
    $:()=>({open:true}),ctx:{openDialog(){}},criteria:args=>args,stepImage:async()=>({index:0}),notice(){},query:async args=>reply(args,rows),send:async(_action,args)=>reply(args,frames),prepareQueue:async()=>String(++sequence),
    native:async(name,args)=>{if(name==='playlist.state')return {};if(name==='playlist.discard'){discarded.push(args.ticket);return {removed:true};}assert.equal(name,'play');calls.push(args);return {opened:true,id:args.id};},...overrides});
  vm.runInContext('function galleryReady(){return gallery.loaded;}\n'+['play','startPlaylist','playImageVideo','image','discardPrepared'].map(code).join('\n'),context);
  return {context,calls,discarded};
}
async function ready(check){for(let i=0;i<30;i++){if(check())return;await new Promise(setImmediate);}throw Error('Preparation was not reached');}

test('a delayed old gallery lookup cannot replace the latest clicked video or its parent',async()=>{
  let release,count=0;const {context,calls}=create({send:(_action,args)=>++count===1?new Promise(resolve=>release=()=>resolve(reply(args,frames))):Promise.resolve(reply(args,frames))});
  const old=context.play(rows[0]);await context.play(rows[1]);release();
  assert.equal((await old).stale,true);assert.equal(context.imageSession.current.videoId,'b');assert.deepEqual(calls.map(c=>c.id),['b']);
});
test('a late prepared ordinary video cannot play over a newer click',async()=>{
  let release,count=0;const {context,calls,discarded}=create({prepareQueue:()=>++count===1?new Promise(resolve=>release=resolve):Promise.resolve('new')});
  const old=context.play(rows[0]);await ready(()=>release);await context.play(rows[1]);release('old');
  assert.equal((await old).stale,true);assert.equal(context.imageSession.current.videoId,'b');assert.deepEqual(calls.map(c=>c.id),['b']);assert.deepEqual(discarded,['old']);
});
test('rejected ordinary preparation leaves the active parent preview intact',async()=>{
  const parent={previewId:'active',playbackId:'live-child',current:frames[2]},failure=Error('prepare failed');
  const {context,calls}=create({imageSession:parent,prepareQueue:async()=>{throw failure;}});
  await assert.rejects(context.play(rows[0]),/prepare failed/);assert.equal(context.imageSession,parent);assert.equal(calls.length,0);
});
test('a new ordinary click supersedes an older prepared playlist, not just another ordinary click',{timeout:5000},async()=>{
  // The real WebCrypto digest uses native work; thirty setImmediate turns are
  // not a readiness guarantee under load. Observe the actual preparation gate.
  let release,entered;const preparation=new Promise(resolve=>entered=resolve),{context,calls}=create({prepareQueue:(_items,options)=>options.reference?new Promise(resolve=>{release=resolve;entered();}):Promise.resolve('new')});
  const old=context.startPlaylist('sequential');await Promise.race([preparation,old.then(()=>{throw Error('Old playlist completed without reaching its preparation gate');})]);await context.play(rows[1]);release('old');
  assert.equal((await old).stale,true);assert.deepEqual(calls.map(c=>c.id),['b']);
});
test('starting a playlist supersedes a still-preparing screenshot video',async()=>{
  let release;const parent={previewId:'active',playbackId:'live-child',total:3,current:frames[0]};
  const {context,calls}=create({imageSession:parent,prepareQueue:(_items,options)=>options.origin==='frame'?new Promise(resolve=>release=resolve):Promise.resolve('new-playlist')});
  const old=context.playImageVideo(false,true);await ready(()=>release);await context.startPlaylist('sequential');release('old-frame');
  await assert.rejects(old,/预览目标已改变/);assert.deepEqual(calls.map(c=>c.playlist),['new-playlist']);assert.equal(parent.playbackId,'live-child');
});
test('a delayed picture lookup cannot pop over a newer video',async()=>{
  let release,opened=0;const {context,calls}=create({query:()=>new Promise(resolve=>release=resolve),ctx:{openDialog(){opened++;}}});
  const old=context.image({id:'picture',kind:'picture'});await context.play(rows[1]);release({queue:[{id:'picture'}],total:1});
  assert.equal((await old).stale,true);assert.equal(opened,0);assert.equal(context.imageSession.current.videoId,'b');assert.deepEqual(calls.map(c=>c.id),['b']);
});
test('a resolved old picture cannot reopen its dialog after the user starts another video',async()=>{
  let release,opened=0;const {context}=create({query:async args=>reply(args,[{id:'picture',kind:'picture'}]),stepImage:()=>new Promise(resolve=>release=resolve),ctx:{openDialog(){opened++;}}});
  const old=context.image({id:'picture',kind:'picture'});await ready(()=>release);await context.play(rows[1]);release({index:0});
  assert.equal((await old).stale,true);assert.equal(opened,1,'Only the initial loading dialog opens; no late reopening');assert.equal(context.imageSession.current.videoId,'b');
});
test('a failed native open cannot restore an old parent into a newly logged-in account',async()=>{
  let reject;const parent={previewId:'old-account',current:frames[0]},failure=Error('old account is no longer live');
  const {context}=create({imageSession:parent,send:async()=>({queue:[],total:0}),native:()=>new Promise((_resolve,fail)=>reject=fail)});
  const old=context.play(rows[1]);await ready(()=>reject);context.epoch++;context.imageSession=null;reject(failure);
  await assert.rejects(old,/old account/);assert.equal(context.imageSession,null);
});
test('a failed later chunk discards only its partial draft without retrying',async()=>{
  let chunks=0;const discarded=[],{context}=create({native:async(name,args)=>{if(name==='playlist.discard'){discarded.push(args.ticket);return {removed:true};}assert.equal(name,'playlist.prepare');if(++chunks===2)throw Error('chunk failed');return {count:200};}});
  vm.runInContext(code('prepareQueue'),context);
  await assert.rejects(context.prepareQueue(Array.from({length:201},(_,i)=>({id:String(i),title:String(i)}))),/chunk failed/);assert.equal(chunks,2);assert.equal(discarded.length,1);
});
function resumeAction(context){
  let resume;context.action=(name,_schema,handler)=>{if(name==='playback.resume')resume=handler;};context.object=()=>({});context.string={type:'string'};
  const start=source.search(/\baction\(\s*"playback.resume"/),end=start+source.slice(start).search(/\baction\(\s*"playback.clear"/);
  vm.runInContext(source.slice(start,end),context);return resume;
}
test('a late history lookup cannot overwrite a newer card click',async()=>{
  let release;const calls=[],{context}=create({native:async(name,args)=>{if(name==='playback.history')return new Promise(resolve=>release=resolve);assert.equal(name,'play');calls.push(args);return {opened:true};}});
  const resume=resumeAction(context),old=resume({id:'a'});await ready(()=>release);await context.play(rows[1]);release({a:{title:'old'}});
  assert.equal((await old).stale,true);assert.deepEqual(calls.map(c=>c.id),['b']);
});
test('explicit history resume supersedes an older pending card preparation',async()=>{
  let release;const calls=[],{context}=create({prepareQueue:()=>new Promise(resolve=>release=resolve),native:async(name,args)=>{if(name==='playback.history')return {c:{title:'continued'}};if(name==='playlist.discard')return {removed:true};assert.equal(name,'play');calls.push(args);return {opened:true};}});
  const resume=resumeAction(context),old=context.play(rows[0]);await ready(()=>release);await resume({id:'c'});release('old');assert.equal((await old).stale,true);assert.deepEqual(calls.map(c=>c.id),['c']);assert.equal(calls[0].resume,true);
});
test('a missing workbench cannot silently turn a single click into a list playlist',async()=>{
  const client=fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url),'utf8'),calls=[],context=vm.createContext({workbench:null,reader:{token:0},native:async(...args)=>calls.push(args),Error});
  vm.runInContext(client.slice(client.indexOf('async function openMedia('),client.indexOf('function showImage(')),context);
  await assert.rejects(context.openMedia(rows[0]),/工作台尚未就绪/);assert.equal(calls.length,0);
});
test('timeline playback cancels earlier preparation while preserving its exact target and time',async()=>{
  const client=fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url),'utf8');let play,cancelled=0;const calls=[],context=vm.createContext({workbench:{cancelPendingPlayback(){cancelled++;}},item:()=>({title:'chosen'}),native:async(...args)=>calls.push(args),action:(name,_schema,handler)=>{if(name==='timeline.play')play=handler;},object:()=>({}),string:{type:'string'}});
  vm.runInContext(client.slice(client.indexOf("action('timeline.play'"),client.indexOf("action('timeline.close'")),context);await play({id:'one',seconds:4});assert.equal(cancelled,1);assert.equal(calls[0][0],'play');assert.equal(calls[0][1].id,'one');assert.equal(calls[0][1].seconds,4);
});
