import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-player.js',import.meta.url),'utf8');
const model=createRequire(import.meta.url)('../../src/js/rhvideo-model.js');

function player(){
  const nodes=new Map(),providers=new Map(),actions=new Map(),timers=[];let release;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,disabled:false,hidden:false,value:'0',dataset:{},textContent:'',setAttribute(){},append(){},matches(){return false;}});return nodes.get(id);};
  const html=fs.readFileSync(new URL('../../src/rhvideo-player.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/id="([^"]+)"/g))node(match[1]);
  node('back').textContent=html.match(/id="back"[^>]*>([^<]*)</)[1];
  const controls=()=>[...nodes.values()].filter(n=>!['controls','title','status','error','position','duration','favorite-row','queue-row','segment-row','queue-counter','favorite-counter','portrait-count','playback-actions'].includes(n.id));
  const api={provideRunLookup(){},provideRunTransport(){},provideState:(name,read)=>providers.set(name,read),register:(name,handler)=>actions.set(name,handler),list:()=>[...actions.keys()].map(id=>({id})),invoke:async(name,args)=>actions.get(name)(args)};
  const pending=new Promise(resolve=>release=resolve);
  const context=vm.createContext({window:{RHFilesAPI:api,__TAURI__:{core:{invoke:()=>pending},event:{listen:async()=>{}}},addEventListener(){}},document:{getElementById:node,querySelectorAll:controls,createElement:()=>{const n=node('new-'+nodes.size);Object.defineProperty(n,'id',{get(){return this.identifier;},set(id){this.identifier=id;nodes.set(id,this);}});return n;}},RHFilesUI:{listen(){}},RHVideoModel:model,setTimeout:callback=>timers.push(callback),performance:{now:()=>0}});
  vm.runInContext(source,context);
  return {node,controls,providers,actions,release:async(value)=>{release(value);for(let n=0;n<8;n++)await Promise.resolve();}};
}

test('native player does not advertise ready before its first authoritative state',async()=>{
  const p=player();assert.equal(p.providers.get('application')().ready,false);
  await p.release({opened:true,generation:1,title:'Favorite',positionMs:0,durationMs:10000,state:3,volume:100,rate:1,queue:{id:'one',hasNext:true,hasPrevious:false,options:{origin:'favorite',parentIndex:1,parentTotal:4}}});
  assert.equal(p.providers.get('application')().ready,true);assert.equal(p.node('back').textContent,'返回收藏');assert.equal(p.node('favorite-row').hidden,false);assert.equal(p.node('favorite-counter').textContent,'2 / 4');
});

test('native playback controls stay disabled while their source is not yet known',async()=>{
  const p=player();assert(p.controls().filter(n=>n.id!=='back').every(n=>n.disabled),'No clickable uninitialized playback or collection controls');
  await p.release({opened:false,generation:1});assert.equal(p.providers.get('application')().ready,true);assert(p.controls().filter(n=>n.id!=='back').every(n=>n.disabled),'Stopped playback must not enable source controls');
});
