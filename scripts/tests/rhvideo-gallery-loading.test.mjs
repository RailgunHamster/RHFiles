import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');
const names=new Set(['loadGallery','prepareGallery','invalidateGallery','galleryScope','galleryReady','warmGallery','paintGalleryStatus']),functions=[];
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&names.has(n.id?.name))functions.push(source.slice(n.start,n.end));for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
walk(parse(source,{ecmaVersion:'latest'}));
const rows=id=>[{video_id:id,filename:id,folder:'test',duration:10,resolution:'640x360',screenshots:[{url:'/storage/'+id+'.webp',time_seconds:2}]}];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function reached(check){for(let i=0;i<50;i++){if(check())return;await new Promise(setImmediate);}throw Error('Expected operation did not start');}
function harness(overrides={}){
  const reads=[],sets=[],pending=[],notices=[],dialogs=[];
  const scope=vm.createContext({epoch:1,state:{connected:true,search:''},gallery:{loaded:false,load:0,revision:0,pending:null,scope:'',error:'',count:0,items:[],total:0,offset:0,limit:36,seed:0},preferences:{perVideo:8,mixPictures:false,rule:{}},
    config:()=>scope.preferences,ensure:async()=>scope.epoch,I:{canonical:JSON.stringify},queueMicrotask,$:()=>null,
    remote:async(name,args)=>{const p=deferred();reads.push({name,args});pending.push(p);return p.promise;},
    send:async(action,args)=>{if(action==='set'){sets.push(args);return {};}return {items:[],queue:[],total:0};},
    native:async()=>[],notice:message=>notices.push(String(message)),el:()=>({setAttribute(){}}),dialog:()=>{dialogs.push('opened');return {replaceChildren(){},setAttribute(){},removeAttribute(){}};},
    ...overrides});vm.runInContext(functions.join('\n'),scope);return {scope,reads,sets,pending,notices,dialogs};
}
test('background warm-up and an immediate gallery read share one metadata request',async()=>{
  const h=harness(),a=h.scope.loadGallery(false,false),b=h.scope.loadGallery(false,false);await reached(()=>h.reads.length>0);
  const count=h.reads.length;h.pending.forEach(p=>p.resolve(rows('one')));await Promise.all([a,b]);assert.equal(count,1,'Do not duplicate a slow all-gallery read');assert.equal(h.sets.length,1);assert.equal(h.scope.gallery.loaded,true);assert.equal(h.dialogs.length,0,'background loading has no popup');
});
test('a late pre-refresh gallery response cannot overwrite the newer worker snapshot',async()=>{
  const h=harness(),old=h.scope.loadGallery(false,false);await reached(()=>h.reads.length===1);
  const next=h.scope.loadGallery(true,false);await reached(()=>h.reads.length===2);h.pending[1].resolve(rows('new'));await next;h.pending[0].resolve(rows('old'));const result=await old;
  assert.equal(result.stale,true);assert.deepEqual(h.sets.map(s=>s.items[0].videoId),['new']);assert.equal(h.scope.gallery.loaded,true);
});
test('a changed session rejects late data before it is inserted in the current worker',async()=>{
  const h=harness(),old=h.scope.loadGallery(false,false);await reached(()=>h.reads.length===1);h.scope.epoch++;h.scope.gallery.load++;h.scope.gallery.loaded=false;h.scope.gallery.pending=null;
  h.pending[0].resolve(rows('other-account'));const result=await old;assert.equal(result.stale,true);assert.equal(h.sets.length,0);assert.equal(h.scope.gallery.loaded,false);
});
test('a failed background load is terminal, visible in state, and only a new explicit read starts again',async()=>{
  const h=harness(),first=h.scope.loadGallery(false,false);await reached(()=>h.reads.length===1);h.pending[0].reject(Error('offline fixture'));await assert.rejects(first,/offline fixture/);
  assert.equal(h.scope.gallery.pending,null);assert.match(h.scope.gallery.error,/offline fixture/);await new Promise(setImmediate);assert.equal(h.reads.length,1);
  const retry=h.scope.loadGallery(false,false);await reached(()=>h.reads.length===2);h.pending[1].resolve(rows('recovered'));await retry;assert.equal(h.scope.gallery.error,'');assert.equal(h.scope.gallery.loaded,true);
});
test('closing while image URLs are pending cannot reopen the gallery afterwards',async()=>{
  const urls=deferred(),h=harness({native:()=>urls.promise}),opening=h.scope.loadGallery();await reached(()=>h.reads.length===1);h.pending[0].resolve(rows('one'));
  await reached(()=>h.scope.gallery.loaded);await new Promise(setImmediate);assert.equal(h.dialogs.length,1,'explicit open displays a closable loading panel');h.scope.gallery.load++;urls.resolve([]);assert.equal((await opening).stale,true);assert.equal(h.dialogs.length,1,'late image URLs do not reopen a closed panel');
});
test('warm-up is nonblocking and does not open any viewer while the metadata is held',async()=>{
  const h=harness();assert.equal(h.scope.warmGallery(),undefined);await reached(()=>h.reads.length===1);assert.equal(h.dialogs.length,0);h.pending[0].resolve(rows('warm'));await reached(()=>h.scope.gallery.loaded);assert.equal(h.dialogs.length,0);
});
test('a changed screenshot setting gets a new snapshot and discards the old scope response',async()=>{
  const h=harness(),old=h.scope.loadGallery(false,false);await reached(()=>h.reads.length===1);h.scope.preferences.perVideo=2;
  const current=h.scope.loadGallery(false,false);await reached(()=>h.reads.length===2);h.pending[1].resolve(rows('new-scope'));await current;h.pending[0].resolve(rows('old-scope'));assert.equal((await old).stale,true);assert.deepEqual(h.sets.map(s=>s.items[0].videoId),['new-scope']);assert.equal(h.scope.galleryReady(),true);
});
test('invalidating data while image URLs are pending does not paint or replace the visible items',async()=>{
  const urls=deferred(),h=harness({native:()=>urls.promise}),opening=h.scope.loadGallery();await reached(()=>h.reads.length===1);h.pending[0].resolve(rows('one'));await reached(()=>h.scope.gallery.loaded);await new Promise(setImmediate);
  h.scope.gallery.items=[{id:'still-visible'}];h.scope.invalidateGallery();urls.resolve([]);assert.equal((await opening).stale,true);assert.equal(h.scope.gallery.items[0].id,'still-visible');assert.equal(h.dialogs.length,1);
});
test('a failed explicit refresh retains the previous valid pool just as the reference does',async()=>{
  const h=harness();h.scope.gallery.loaded=true;h.scope.gallery.scope=h.scope.galleryScope();h.scope.gallery.count=8;
  const refreshing=h.scope.loadGallery(true,false);await reached(()=>h.reads.length===1);h.pending[0].reject(Error('refresh failed'));await assert.rejects(refreshing,/refresh failed/);assert.equal(h.scope.galleryReady(),true);assert.equal(h.scope.gallery.count,8);assert.match(h.scope.gallery.error,/refresh failed/);
});
const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
test('reference showApp starts its gallery read without awaiting it or blocking the video list',{skip:!fs.existsSync(reference)},()=>{
  const html=fs.readFileSync(reference,'utf8');let original;
  for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const n of parse(m[1],{ecmaVersion:'latest'}).body)if(n.type==='FunctionDeclaration'&&n.id.name==='showApp')original=m[1].slice(n.start,n.end);
  assert(original);const calls=[],scope=vm.createContext({token:'fixture',localStorage:{getItem:()=>null},document:{getElementById:()=>({classList:{add(){},remove(){}},checked:false})},
    loadGrid:reset=>{calls.push(['gallery',reset]);return new Promise(()=>{});},loadVideos:()=>calls.push(['videos'])});
  for(const name of ['loadPageVolumePreference','loadRotationPref','loadMediaTagFilter','loadGridTagPrefs','renderGridTagTabs','renderNovelTagTabs','loadFolders','loadFavoriteIds','syncGlobalQueueVisibility','startQueuePolling','startProgressPolling','loadReplacementJobs'])scope[name]=()=>{};
  vm.runInContext(original,scope);assert.equal(scope.showApp(),undefined);assert.deepEqual(calls,[['gallery',false],['videos']]);
});
