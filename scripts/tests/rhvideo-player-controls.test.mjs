import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{create}=require('../../src/js/automation-core.js');
const source=fs.readFileSync(new URL('../../src/js/rhvideo-player-controls.js',import.meta.url),'utf8');
const model=require('../../src/js/rhvideo-model.js');
const playbackPhase=require('../../src/js/rhvideo-playback-phase.js');

// Run the entire shipped player and its registered callbacks. The native edge
// is controlled only in this unit fixture; real-window acceptance is separate.
async function player({origin='video',opened=true,component=null,registry=null}={}){
 const nodes=new Map(),handlers=new Map(),calls=[],timers=new Map(),events=new Map(),windowEvents=new Map();let timerId=0;
 const actualNode=id=>{if(!nodes.has(id))nodes.set(id,{id,disabled:false,hidden:false,value:'500',checked:false,dataset:{},textContent:'',setAttribute(){},getAttribute(){return null;},append(){},matches(){return false;},closest(){return null;}});return nodes.get(id);};
 const idPrefix=component?.idPrefix||'',prefix=component?.actionPrefix||'rhvideo.player.',node=id=>actualNode(idPrefix+id);
 const html=fs.readFileSync(new URL('../../src/rhvideo-player.html',import.meta.url),'utf8');
 for(const match of html.matchAll(/id="([^"]+)"/g))node(match[1]);
 for(const match of html.matchAll(/<(button|input|select)\b([^>]*)>/g)){const id=/\bid="([^"]+)"/.exec(match[2]);if(id)node(id[1]).tagName=match[1].toUpperCase();}
 const state={opened,generation:1,inputId:10,title:'Generated video',positionMs:1000,durationMs:20000,state:3,renderedFrames:30,volume:80,rate:1,queue:{id:'video-0',revision:20,planRevision:30,hasNext:true,hasPrevious:true,total:3,index:0,totalMs:60000,segmentLengthMs:20000,options:{origin,reference:origin!=='favorite',fullLength:false,parentIndex:0,parentTotal:3}}};
 let command=()=>Promise.resolve(structuredClone(state)),readState=()=>Promise.resolve(structuredClone(state));
 const api=registry||create({instanceId:'generated-player-controls'});
 const document={getElementById:actualNode,querySelectorAll:()=>[...nodes.values()].filter(n=>n.tagName),createElement:tag=>{const key='generated-'+nodes.size,n=actualNode(key);n.identifier=key;n.tagName=tag.toUpperCase();Object.defineProperty(n,'id',{get(){return this.identifier;},set(id){if(nodes.get(this.identifier)===this)nodes.delete(this.identifier);this.identifier=id;nodes.set(id,this);}});return n;}};
 const request=(action,args)=>{calls.push({action,args});return component?.nativeRequest?component.nativeRequest(action,args):action==='player.state'?readState(args):command(action,args);};
 const context=vm.createContext({window:{RHFilesAPI:api,__TAURI__:{core:{invoke:(_name,{action,args})=>request(action,args)},event:{listen:async(name,handler)=>{events.set(name,handler);return()=>events.delete(name);}}},addEventListener(name,handler){windowEvents.set(name,handler);},removeEventListener(name,handler){if(windowEvents.get(name)===handler)windowEvents.delete(name);}},document,RHFilesUI:{listen(n,event,handler,_options,site){handlers.set(site,{node:n,event,handler});},remove(n,event,handler){for(const [site,value]of handlers)if(value.node===n&&value.event===event&&value.handler===handler)handlers.delete(site);}},RHVideoModel:model,RHVideoPlaybackPhase:playbackPhase,setTimeout:callback=>{timers.set(++timerId,callback);return timerId;},clearTimeout:id=>timers.delete(id),performance:{now:()=>1000}});
 vm.runInContext(source,context,{filename:'rhvideo-player-controls.js'});let controller;
 if(component){context.componentOptions={...component,api,nativeRequest:request};controller=vm.runInContext('window.RHVideoPlayerControls.install(componentOptions)',context);}else controller=vm.runInContext(fs.readFileSync(new URL('../../src/js/rhvideo-player.js',import.meta.url),'utf8'),context);
 await api.invoke(prefix+'state');
 const event=values=>({button:0,code:'ArrowRight',key:'ArrowRight',repeat:false,isTrusted:false,deltaY:1,target:{matches:()=>false,closest:()=>null,isContentEditable:false},preventDefault(){},...values});
 return {api,state,node,calls,handlers,timers,events,windowEvents,controller,context,event,setCommand:fn=>{command=fn;},setStateReader:fn=>{readState=fn;},fire:(site,values={})=>{assert(handlers.has(site),'Actual registered handler '+site);return handlers.get(site).handler(event(values));}};
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
test('the actual player does not call a PLAYING input with zero presented frames visible playback',async()=>{
 const p=await player();Object.assign(p.state,{state:3,renderedFrames:0,decodedFrames:1,decodedAudioBlocks:0,firstFrameMs:0,positionMs:0});await p.api.invoke('rhvideo.player.state');assert.equal(p.node('status').textContent,'正在准备首帧…');assert.equal(p.api.snapshot().state.player.playback.phase,'preparing');
});
test('decoded audio or video without a presentation cannot complete first-frame preparation',async()=>{
 const p=await player();Object.assign(p.state,{state:3,renderedFrames:0,decodedFrames:100,decodedAudioBlocks:100});await p.api.invoke('rhvideo.player.state');assert.equal(p.node('status').textContent,'正在准备首帧…');
});
test('a real presented frame completes the label and the same read-only semantic phase',async()=>{
 const p=await player();Object.assign(p.state,{state:3,renderedFrames:1});await p.api.invoke('rhvideo.player.state');assert.equal(p.node('status').textContent,'播放中');assert.equal(p.api.snapshot().state.player.playback.phase,'playing');
});
test('terminal failure wins over a stale pending seek instead of masquerading as loading',async()=>{
 const p=await player();Object.assign(p.state,{state:7,renderedFrames:0,pendingSeekMs:900});await p.api.invoke('rhvideo.player.state');assert.match(p.node('status').textContent,/播放失败/);
});

const settle=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};
test('two reusable player scopes retain complete controls without replacing library APIs or state',async()=>{
 const registry=create(),application={platform:'library',ready:true};registry.provideState('application',()=>application);
 const a=await player({registry,component:{idPrefix:'inline-a-',actionPrefix:'rhvideo.inlineA.'}}),b=await player({registry,component:{idPrefix:'inline-b-',actionPrefix:'rhvideo.inlineB.'}});
 for(const [p,prefix]of [[a,'rhvideo.inlineA.'],[b,'rhvideo.inlineB.']]){const contract=await registry.invoke(prefix+'contract');assert.equal(contract.missing.length,0);assert.equal(contract.controls,(fs.readFileSync(new URL('../../src/rhvideo-player.html',import.meta.url),'utf8').match(/<(button|input|select)\b/g)||[]).length+5);assert.equal(p.node('toggle').dataset.apiAction,prefix+'control');assert.equal(p.node('player-mark').dataset.apiAction,prefix+'mark');}
 await registry.invoke('rhvideo.inlineA.control',{command:'pause'});assert.equal(a.calls.filter(c=>c.action==='player.control').length,1);assert.equal(b.calls.filter(c=>c.action==='player.control').length,0);assert.deepEqual(registry.snapshot().state.application,application);assert(!registry.list().some(row=>row.id.startsWith('rhvideo.player.')));
 a.controller.dispose();assert(!registry.list().some(row=>row.id.startsWith('rhvideo.inlineA.')));assert(registry.list().some(row=>row.id==='rhvideo.inlineB.control'));assert(!Object.hasOwn(registry.snapshot().state,'rhvideo.inlineA'));assert.equal(a.handlers.size,0);assert.equal(a.timers.size,0);await registry.invoke('rhvideo.inlineB.control',{command:'pause'});b.controller.dispose();assert.deepEqual(registry.snapshot().state,{application});
});
test('a disposed scope cannot dispatch a late DOM or native input into a remounted scope',async()=>{
 const registry=create(),options={idPrefix:'inline-',actionPrefix:'rhvideo.inline.'},old=await player({registry,component:options});const click=old.handlers.get('rhvideo.inline.toggle').handler,native=old.events.get('rhvideo-native-input');old.controller.dispose();old.controller.dispose();await assert.rejects(registry.invoke('rhvideo.inline.control',{command:'pause'}),{code:'ACTION_NOT_FOUND'});
 const current=await player({registry,component:options});old.controller.dispose();assert.equal((await click(old.event())).ignored,true);native({payload:{inputId:10,intent:'toggle'}});await settle();assert.equal(old.calls.filter(c=>c.action==='player.control').length,0);assert.equal(current.calls.filter(c=>c.action==='player.control').length,0);await registry.invoke('rhvideo.inline.control',{command:'pause'});assert.equal(current.calls.filter(c=>c.action==='player.control').length,1);current.controller.dispose();
});
test('suspending the player stops polling and cancels the original source gesture until a fresh gesture',async()=>{
 const p=await player();p.fire('rhvideo.player.seek.begin');p.node('seek').value='500';p.fire('rhvideo.player.seek.preview');assert.equal(p.timers.size,1);p.controller.suspend();assert.equal(p.timers.size,0);assert.equal(p.node('seek').disabled,true);assert.equal(p.fire('rhvideo.player.keyboard').ignored,true);await assert.rejects(p.api.invoke('rhvideo.player.control',{command:'pause'}),/未激活/);await p.controller.refresh();assert.equal(p.node('toggle').disabled,true);
 p.controller.resume();p.controller.resume();await settle();assert.equal(p.timers.size,1);await assert.rejects(Promise.resolve(p.fire('rhvideo.player.seek.commit',{isTrusted:true})),/拖动已取消/);assert.equal(p.calls.filter(c=>c.action==='player.control').length,0);p.fire('rhvideo.player.seek.begin');await p.fire('rhvideo.player.seek.commit',{isTrusted:true});assert.equal(p.calls.filter(c=>c.action==='player.control').length,1);p.controller.dispose();
});
test('suspend and repeated resume during a native read never multiply the polling chain',async()=>{
 const p=await player();p.controller.suspend();let release;const gate=new Promise(resolve=>release=resolve);p.setStateReader(()=>gate);const before=p.calls.length;p.controller.resume();p.controller.suspend();p.controller.resume();p.controller.resume();assert.equal(p.calls.length,before+1);assert.equal(p.controller.snapshot().busy,true);assert.equal(p.timers.size,0);release(structuredClone(p.state));await settle();assert.equal(p.controller.snapshot().busy,false);assert.equal(p.timers.size,1);p.controller.dispose();assert.equal(p.timers.size,0);
});
test('a late native state after unmount cannot paint, enable controls or restart polling',async()=>{
 const p=await player();p.controller.suspend();let release;p.setStateReader(()=>new Promise(resolve=>release=resolve));const title=p.node('title').textContent;p.controller.resume();p.controller.dispose();release({...structuredClone(p.state),title:'Late reply must not paint'});await settle();assert.equal(p.node('title').textContent,title);assert.equal(p.node('seek').disabled,true);assert.equal(p.timers.size,0);assert.equal(p.handlers.size,0);assert.equal(p.events.size,0);assert.equal(p.windowEvents.size,0);assert.equal(p.controller.snapshot().closed,true);assert.equal(p.controller.snapshot().ready,false);
});
test('late native listener registrations are removed once and cannot revive a disposed scope',async()=>{
 const pending=new Map(),removed=[];const p=await player({component:{actionPrefix:'rhvideo.inline.',listenEvent:(name,handler)=>new Promise(resolve=>pending.set(name,{handler,resolve}))}});p.controller.dispose();assert.equal(pending.size,2);for(const [name,value]of pending){value.handler({payload:{inputId:10,intent:'toggle',generation:2}});value.resolve(()=>removed.push(name));}await settle();assert.deepEqual(removed.sort(),['rhvideo-native-input','rhvideo-player-session']);assert.equal(p.calls.filter(c=>c.action==='player.control').length,0);assert.equal(p.timers.size,0);
});
test('listener cleanup rejection remains observable without retry or unhandled rejection',async()=>{
 let removed=0;const p=await player({component:{actionPrefix:'rhvideo.inline.',listenEvent:async()=>()=>{removed++;return Promise.reject(Error('Generated cleanup denial'));}}});p.controller.dispose();await settle();assert.equal(removed,2);assert.deepEqual(Array.from(p.controller.snapshot().cleanupErrors),['Generated cleanup denial','Generated cleanup denial']);p.controller.dispose();assert.equal(removed,2);
});
test('incomplete markup fails before installing any public actions or providers',async()=>{
 const registry=create();await assert.rejects(player({registry,component:{actionPrefix:'rhvideo.inline.',lookup:id=>['controls','back'].includes(id)?{}:null}}),/控件尚未载入/);assert.equal(registry.list().length,0);assert.deepEqual(registry.snapshot().state,{});
});
test('native close remains pending until the owning UI has finished its close transition',async()=>{
 let release,entered=false;const gate=new Promise(resolve=>release=resolve),p=await player({component:{actionPrefix:'rhvideo.inline.',onClosed:()=>{entered=true;return gate;}}});p.setCommand(()=>Promise.resolve({closed:true}));let finished=false;const result=p.api.invoke('rhvideo.inline.back').then(value=>{finished=true;return value;});await settle();assert.equal(entered,true);assert.equal(finished,false);release();assert.equal((await result).closed,true);assert.equal(p.calls.filter(c=>c.action==='player.back').length,1);p.controller.dispose();
});
test('covered controls do not steal input or send native writes behind a newer panel',async()=>{
 let top=false;const p=await player({component:{actionPrefix:'rhvideo.inline.',isTop:()=>top}});assert.equal(p.node('seek').disabled,true);await assert.rejects(p.api.invoke('rhvideo.inline.control',{command:'resume'}),/未激活/);assert.equal(p.fire('rhvideo.inline.keyboard').ignored,true);p.events.get('rhvideo-native-input')({payload:{inputId:10,intent:'toggle'}});await settle();assert.equal(p.calls.filter(c=>c.action==='player.control').length,0);top=true;p.controller.resume();await settle();assert.equal(p.node('seek').disabled,false);await p.api.invoke('rhvideo.inline.control',{command:'pause'});assert.equal(p.calls.filter(c=>c.action==='player.control').length,1);p.controller.dispose();
});
test('a registration collision rolls back only this incomplete mount, not the existing owner',async()=>{
 const registry=create();registry.register('rhvideo.inline.state',()=>({existing:true}));await assert.rejects(player({registry,component:{actionPrefix:'rhvideo.inline.'}}),{code:'DUPLICATE_ACTION'});assert.equal(registry.list().length,1);assert.deepEqual(await registry.invoke('rhvideo.inline.state'),{existing:true});assert.deepEqual(registry.snapshot().state,{});
});
test('scoped close runs complete locally while canonical standalone close preserves its native receipt',async()=>{
 for(const component of [null,{actionPrefix:'rhvideo.inline.'}]){const p=await player({component}),prefix=component?.actionPrefix||'rhvideo.player.';p.setCommand(()=>Promise.resolve({closed:true}));const started=p.api.run(prefix+'back');const finished=await p.api.wait(started.id,1000);assert.equal(finished.state,'succeeded');assert.equal(finished.result.closed,true);const call=p.calls.find(value=>value.action==='player.back');if(component)assert.equal(call.args._automationRun,undefined,'An in-place scope does not retire its containing WebView');else assert.equal(call.args._automationRun.action,'rhvideo.player.back');p.controller.dispose();}
});
test('an unsupported standalone namespace fails without partially publishing its controls',async()=>{
 const registry=create();await assert.rejects(player({registry,component:{actionPrefix:'rhvideo.inline.',standalone:true}}),/标准接口作用域/);assert.equal(registry.list().length,0);assert.deepEqual(registry.snapshot().state,{});
});
test('late accepted close completion cannot run an old UI callback against a remounted player',async()=>{
 const registry=create();let release,oldTransitions=0,newTransitions=0;const gate=new Promise(resolve=>release=resolve),old=await player({registry,component:{actionPrefix:'rhvideo.inline.',onClosed:()=>oldTransitions++}});old.setCommand(()=>gate);const closing=registry.invoke('rhvideo.inline.close');await settle();old.controller.dispose();const current=await player({registry,component:{actionPrefix:'rhvideo.inline.',onClosed:()=>newTransitions++}});release({closed:true});assert.equal((await closing).closed,true,'Accepted native completion is still reported truthfully');assert.equal(oldTransitions,0);assert.equal(newTransitions,0);assert(registry.list().some(row=>row.id==='rhvideo.inline.control'));current.controller.dispose();
});
for(const dependency of ['model','playbackPhase'])test('missing '+dependency+' fails before creating a partial player scope',async()=>{
 const registry=create();await assert.rejects(player({registry,component:{actionPrefix:'rhvideo.inline.',[dependency]:{}}}),/播放器依赖尚未载入/);assert.equal(registry.list().length,0);assert.deepEqual(registry.snapshot().state,{});
});
