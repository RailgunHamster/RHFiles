import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{create}=require('../../src/js/automation-core.js');
const source=fs.readFileSync(new URL('../../src/js/rhvideo-player.js',import.meta.url),'utf8');
const model=require('../../src/js/rhvideo-model.js');

// Run the entire shipped player and its registered callbacks. The native edge
// is controlled only in this unit fixture; real-window acceptance is separate.
async function player({origin='video',opened=true}={}){
 const nodes=new Map(),handlers=new Map(),calls=[],timers=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,disabled:false,hidden:false,value:'500',checked:false,dataset:{},textContent:'',setAttribute(){},getAttribute(){return null;},append(){},matches(){return false;},closest(){return null;}});return nodes.get(id);};
 const html=fs.readFileSync(new URL('../../src/rhvideo-player.html',import.meta.url),'utf8');
 for(const match of html.matchAll(/id="([^"]+)"/g))node(match[1]);
 const state={opened,generation:1,inputId:10,title:'Generated video',positionMs:1000,durationMs:20000,state:3,volume:80,rate:1,queue:{id:'video-0',revision:20,planRevision:30,hasNext:true,hasPrevious:true,total:3,index:0,totalMs:60000,segmentLengthMs:20000,options:{origin,reference:origin!=='favorite',fullLength:false,parentIndex:0,parentTotal:3}}};
 let command=()=>Promise.resolve(structuredClone(state));
 const api=create({instanceId:'generated-player-controls'});
 const document={getElementById:node,querySelectorAll:()=>[...nodes.values()].filter(n=>n.id!=='controls'),createElement:()=>{const n=node('generated-'+nodes.size);Object.defineProperty(n,'id',{get(){return this.identifier;},set(id){this.identifier=id;nodes.set(id,this);}});return n;}};
 const context=vm.createContext({window:{RHFilesAPI:api,__TAURI__:{core:{invoke:(_name,{action,args})=>{calls.push({action,args});return action==='player.state'?Promise.resolve(structuredClone(state)):command(action,args);}},event:{listen:async()=>{}}},addEventListener(){}},document,RHFilesUI:{listen(n,event,handler,_options,site){handlers.set(site,{node:n,event,handler});}},RHVideoModel:model,setTimeout:callback=>timers.push(callback),performance:{now:()=>1000}});
 vm.runInContext(source,context,{filename:'rhvideo-player.js'});
 await api.invoke('rhvideo.player.state');
 const event=values=>({button:0,code:'ArrowRight',key:'ArrowRight',repeat:false,isTrusted:false,deltaY:1,target:{matches:()=>false,closest:()=>null,isContentEditable:false},preventDefault(){},...values});
 return {api,state,node,calls,handlers,setCommand:fn=>{command=fn;},fire:(site,values={})=>{assert(handlers.has(site),'Actual registered handler '+site);return handlers.get(site).handler(event(values));}};
}
const controls=[
 ['rhvideo.player.toggle','player.control'],['rhvideo.player.rate','player.control'],
 ...['mute','rotate','loop','favorite','mark','next','previous','fullscreen','back'].map(name=>['rhvideo.player.'+name,{mute:'player.control',rotate:'player.control',loop:'player.options',favorite:'player.favorite',mark:'preview.mark'}[name]||'player.'+name]),
 ['rhvideo.player.options.fullLength','player.options'],['rhvideo.player.options.segment','player.options'],['rhvideo.player.options.portrait','player.options'],
 ['rhvideo.player.seek.commit','player.control'],['rhvideo.player.volume.commit','player.control'],['rhvideo.player.queue-seek.commit','player.seekQueue'],['rhvideo.player.favorite-seek.commit','player.seekParent'],
 ['rhvideo.player.keyboard','player.next'],['rhvideo.player.wheel','player.next'],
];
for(const [site,action]of controls){
 test(site+' returns the real native failure, not a successful UI result',async()=>{
  const p=await player({origin:site.includes('favorite-seek')?'favorite':'video'}),failure=Error('Generated native denial');
  p.node('rate').value='1.25';p.node('segment-length').value='3';
  p.setCommand((name)=>{assert.equal(name,action);return Promise.reject(failure);});
  await assert.rejects(Promise.resolve(p.fire(site)),error=>error===failure);
  assert.equal(p.calls.filter(c=>c.action===action).length,1,'No hidden retry');assert.equal(p.node('error').textContent,failure.message);
 });
 test(site+' stays pending until the actual command completes',async()=>{
  const p=await player({origin:site.includes('favorite-seek')?'favorite':'video'});let release;
  p.node('rate').value='1.25';p.node('segment-length').value='3';
  const gate=new Promise(resolve=>release=resolve);p.setCommand((name)=>{assert.equal(name,action);return gate;});
  let settled=false;const pending=Promise.resolve(p.fire(site)).then(value=>{settled=true;return value;});
  for(let n=0;n<20;n++)await Promise.resolve();
  assert.equal(settled,false,'The UI action must await its native command');
  release(structuredClone(p.state));const result=await pending;assert.equal(settled,true);assert.deepEqual(result,action==='player.options'?p.state.queue:p.state,'Preserve the semantic action result');assert.equal(p.calls.filter(c=>c.action===action).length,1);
 });
}
for(const action of ['mute','rotate'])test('semantic '+action+' itself preserves native rejection',async()=>{
 const p=await player(),failure=Error('Generated semantic denial');p.setCommand(()=>Promise.reject(failure));
 await assert.rejects(p.api.invoke('rhvideo.player.'+action),error=>error===failure);
});
test('range rejection retains the original decoder identity across A-B-A source reuse',async()=>{
 const p=await player(),failure=Error('Generated old input denied');
 p.fire('rhvideo.player.seek.begin');p.node('seek').value='500';p.fire('rhvideo.player.seek.preview');p.state.inputId=12;p.state.durationMs=100000;
 await p.api.invoke('rhvideo.player.state');p.setCommand((_name,args)=>{assert.equal(args.expectedInput,10);assert.equal(args.value,10000);return Promise.reject(failure);});
 await assert.rejects(Promise.resolve(p.fire('rhvideo.player.seek.commit')),error=>error===failure);assert.equal(p.state.inputId,12);
});
for(const kind of ['uninitialized','cancelled'])test(kind+' source gesture fails visibly without issuing a native write',async()=>{
 const p=await player({opened:kind!=='uninitialized'});
 if(kind==='uninitialized'){delete p.state.inputId;await p.api.invoke('rhvideo.player.state');}
 else{p.fire('rhvideo.player.seek.begin');p.fire('rhvideo.player.seek.cancel');}
 await assert.rejects(Promise.resolve(p.fire('rhvideo.player.seek.commit',{isTrusted:true})),new RegExp(kind==='uninitialized'?'尚未就绪':'拖动已取消'));
 assert.match(p.node('error').textContent,new RegExp(kind==='uninitialized'?'尚未就绪':'拖动已取消'));assert.equal(p.calls.filter(c=>c.action!=='player.state').length,0);
});
test('Escape returns its actual close failure without replaying the request',async()=>{
 const p=await player(),failure=Error('Generated close denied');p.setCommand((name)=>{assert.equal(name,'player.close');return Promise.reject(failure);});
 await assert.rejects(Promise.resolve(p.fire('rhvideo.player.keyboard',{key:'Escape',code:'Escape'})),error=>error===failure);assert.equal(p.calls.filter(c=>c.action==='player.close').length,1);
});
test('wheel admission remains throttled rather than queueing continuous events',async()=>{
 const p=await player();let release;const gate=new Promise(resolve=>release=resolve);p.setCommand(()=>gate);
 const first=p.fire('rhvideo.player.wheel'),second=p.fire('rhvideo.player.wheel');assert.equal(second,undefined);assert.equal(p.calls.filter(c=>c.action==='player.next').length,1);
 release(structuredClone(p.state));await first;
});
