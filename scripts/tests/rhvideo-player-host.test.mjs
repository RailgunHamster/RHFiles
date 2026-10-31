import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {create}=createRequire(import.meta.url)('../../src/js/automation-core.js');
const source=fs.readFileSync(new URL('../../src/js/rhvideo-player-host.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};

// Host/lifetime unit fixture only. Real native pixels, focus, DPI and decoder
// performance are deliberately NOT simulated or certified by this fixture.
function fixture({inline=true,fetchGate=null,fullscreen=false}={}){
 const calls=[],nodes=[],controllers=[],events=new Map(),handlers=new Map(),notices=[];let selected=null,version=0,uuid=0,owner=0,lease=0,override=null,currentState=null;
 class Node{
  constructor(tag){this.tagName=tag;this.id='';this.dataset={};this.open=false;this.children=[];const classes=new Set();this.classList={add:name=>classes.add(name),contains:name=>classes.has(name),toggle(name,on){if(on===undefined)on=!classes.has(name);if(on)classes.add(name);else classes.delete(name);return on;}};nodes.push(this);}
  append(...values){this.children.push(...values);}setAttribute(){}querySelectorAll(){return [];}querySelector(){return this.title||(this.title=new Node('div'));}
  addEventListener(name,fn){handlers.set(this.id+':'+name,fn);}getBoundingClientRect(){return {x:16,y:24,width:640,height:360};}
  focus(){this.focused=true;}close(){this.open=false;}remove(){this.removed=true;}
 }
 const document={hidden:false,body:new Node('body'),createElement:tag=>new Node(tag),importNode:()=>new Node('footer'),addEventListener:(name,fn)=>handlers.set('document:'+name,fn)};
 const api=create({instanceId:'generated-native-host'});
 const rawNative=async(action,args={})=>{calls.push({action,args:structuredClone(args)});if(override){const result=override(action,args);if(result!==undefined)return result;}
  if(action==='player.hostContext')return {window:2};if(action==='player.hostPrepare')return {...args,owner:++owner};
  if(action==='play'){currentState={opened:true,inputId:++lease,state:3,renderedFrames:1,pauseRequested:false,host:{...args.host,lease:lease*2}};return structuredClone(currentState);}
  if(action==='player.state')return structuredClone(currentState);
  if(action==='player.control'){currentState.pauseRequested=args.command==='pause';return structuredClone(currentState);}
  if(action==='player.fullscreen'){fullscreen=!fullscreen;return {fullscreen};}
  return {closed:true};
 };
 const context=vm.createContext({window:{__TAURI__:{window:{getCurrentWindow:()=>({isFullscreen:async()=>fullscreen})},event:{listen:async(name,fn)=>{events.set(name,fn);return()=>events.delete(name);}}},addEventListener:(name,fn)=>handlers.set('window:'+name,fn)},document,
  crypto:{randomUUID:()=>String(++uuid)+'-panel'},fetch:async()=>{if(fetchGate)await fetchGate.promise;return {ok:true,text:async()=>'<footer id="controls"></footer>'};},DOMParser:class{parseFromString(){return {getElementById:()=>new Node('footer')};}},ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){}disconnect(){this.disconnected=true;}},
  RHFilesUI:{listen:(node,name,fn)=>handlers.set(node.id+':'+name,fn)},RHVideoPlayerControls:{install(options){const c={options,suspended:0,resumed:0,disposed:0,suspend(){this.suspended++;},resume(){this.resumed++;},dispose(){this.disposed++;}};controllers.push(c);return c;}}
 });
 vm.runInContext(source,context);const host=context.window.RHVideoPlayerHost.install({api,rawNative,modalTop:()=>selected,openDialog:id=>{selected=id;nodes.findLast(n=>n.id===id).open=true;},notice:error=>notices.push(String(error?.message||error)),intent:()=>version,canInline:()=>inline});
 return {host,api,calls,nodes,controllers,events,handlers,notices,get state(){return currentState;},set override(fn){override=fn;},advance(){version++;},cover(){selected='generated-settings';},uncover(){selected='rhvideo-player-dialog';},count:action=>calls.filter(c=>c.action===action).length};
}

test('a library play selects its actual scoped host before starting the decoder',async()=>{
 const p=fixture();await p.host.request('play',{id:'generated-video'});
 const play=p.calls.find(c=>c.action==='play');assert.equal(play.args.host.kind,'library');assert.equal(play.args.host.panel,'1-panel');assert.equal(play.args.host.window,2);assert.equal(play.args.host.owner,1);assert.deepEqual(play.args.host.bounds,{x:16,y:24,width:640,height:360});assert.equal(p.nodes.filter(n=>n.tagName==='dialog').length,1);
 assert.equal((await p.api.invoke('rhvideo.player.hostState')).pending,false);
});
test('unsupported platforms retain the explicit native path without creating a fake inline panel',async()=>{
 const p=fixture({inline:false});p.override=action=>action==='play'?{opened:true,host:{kind:'popup',lease:2}}:undefined;
 assert.equal((await p.host.request('play',{id:'generated'})).host.kind,'popup');assert.equal(p.count('player.hostContext'),0);assert.equal(p.nodes.filter(n=>n.tagName==='dialog').length,0);
});
test('concurrent first plays share one mount and one pending reservation',async()=>{
 const gate=deferred(),p=fixture({fetchGate:gate}),a=p.host.request('play',{id:'old'});p.advance();const b=p.host.request('play',{id:'new'});gate.resolve();await Promise.all([a,b]);
 assert.equal(p.nodes.filter(n=>n.tagName==='dialog').length,1);assert.equal(p.count('player.hostPrepare'),1);assert.deepEqual(p.calls.filter(c=>c.action==='play').map(c=>c.args.id),['new']);
});
test('closing before markup arrives does not resurrect a dialog or decoder',async()=>{
 const gate=deferred(),p=fixture({fetchGate:gate}),play=p.host.request('play',{id:'generated'});await p.host.close();gate.resolve();assert.equal((await play).stale,true);assert.equal(p.count('play'),0);assert.equal(p.nodes.filter(n=>n.tagName==='dialog').length,0);
});
test('a superseded request cannot retire the shared reservation used by its successor',async()=>{
 const p=fixture(),gate=deferred();p.override=action=>action==='player.hostPrepare'?gate.promise:undefined;
 const a=p.host.request('play',{id:'old'});await tick();p.advance();const b=p.host.request('play',{id:'new'});await tick();gate.resolve({window:2,panel:'1-panel',owner:1});await Promise.all([a,b]);
 assert.equal(p.count('player.hostPrepare'),1);assert.equal(p.count('player.closeHost'),0);assert.deepEqual(p.calls.filter(c=>c.action==='play').map(c=>c.args.id),['new']);
});
test('closing a pending reservation retires exactly that owner after its reply',async()=>{
 const p=fixture(),gate=deferred();p.override=action=>action==='player.hostPrepare'?gate.promise:undefined;
 const play=p.host.request('play',{id:'generated'});await tick();await p.host.close();gate.resolve({window:2,panel:'1-panel',owner:1});assert.equal((await play).stale,true);
 assert.equal(p.count('play'),0);assert.equal(p.count('player.closeHost'),1);assert.equal(p.calls.at(-1).args.owner,1);
});
test('an old native play reply and closed event cannot remove a reopened owner',async()=>{
 const p=fixture(),gate=deferred();p.override=(action,args)=>action==='play'&&args.id==='old'?gate.promise:undefined;
 const a=p.host.request('play',{id:'old'});await tick();const old=p.calls.find(c=>c.action==='play').args.host;await p.host.close();p.advance();await p.host.request('play',{id:'new'});const current=await p.api.invoke('rhvideo.player.hostState');
 gate.resolve({opened:true,inputId:10,host:{...old,lease:40}});assert.equal((await a).stale,true);p.events.get('rhvideo-player-closed')({payload:{host:{...old,lease:40}}});assert.equal((await p.api.invoke('rhvideo.player.hostState')).panel,current.panel);assert(p.host.opened());
});
for(const paused of [false,true])test('cover and restoration preserve '+(paused?'paused':'running')+' intent without duplicate commands',async()=>{
 const p=fixture();await p.host.request('play',{id:'generated'});p.state.pauseRequested=paused;await p.host.request('player.state');p.cover();await p.host.sync();await p.host.sync();
 assert.equal(p.calls.filter(c=>c.action==='player.control'&&c.args.command==='pause').length,1);assert.equal(p.calls.filter(c=>c.action==='player.bounds').at(-1).args.visible,false);
 p.uncover();await p.host.sync();assert.equal(p.calls.filter(c=>c.action==='player.control'&&c.args.command==='resume').length,paused?0:1);assert.equal(p.calls.filter(c=>c.action==='player.bounds').at(-1).args.visible,true);
});
test('first-frame preparation keeps the native surface present but alpha zero',async()=>{
 const p=fixture();await p.host.request('play',{id:'generated'});p.state.renderedFrames=0;await p.host.request('player.state');let last=p.calls.filter(c=>c.action==='player.bounds').at(-1).args;assert.equal(last.visible,true);assert.equal(last.opacity,0);
 p.state.renderedFrames=1;await p.host.request('player.state');last=p.calls.filter(c=>c.action==='player.bounds').at(-1).args;assert.equal(last.visible,true);assert.equal(last.opacity,1);
});
test('modal-covered resume is denied without sending a native write',async()=>{
 const p=fixture();await p.host.request('play',{id:'generated'});p.cover();await p.host.sync();const count=p.count('player.control');await assert.rejects(p.host.request('player.control',{command:'resume'}),/覆盖/);assert.equal(p.count('player.control'),count);
});
test('native bounds and close failures remain visible and are not automatically retried',async()=>{
 const p=fixture();await p.host.request('play',{id:'generated'});const failure=Error('generated close denial');p.override=action=>action==='player.closeHost'?Promise.reject(failure):undefined;
 await assert.rejects(p.host.close(),e=>e===failure);assert.equal(p.count('player.closeHost'),1);assert.match((await p.api.invoke('rhvideo.player.hostState')).error,/generated close denial/);assert(p.host.opened());
});
test('a removed panel rejects its old public close identity without closing the current one',async()=>{
 const p=fixture();await p.host.request('play',{id:'a'});const old=(await p.api.invoke('rhvideo.player.hostState')).panel;await p.host.close();await p.host.request('play',{id:'b'});
 assert.equal((await p.api.invoke('rhvideo.player.panelClose',{expectedPanel:old})).stale,true);assert(p.host.opened());assert.equal(p.count('player.closeHost'),1);
});
test('a new explicit play waits for the accepted old close and then owns a fresh reservation',async()=>{
 const p=fixture();await p.host.request('play',{id:'old'});const old=await p.api.invoke('rhvideo.player.hostState'),gate=deferred();p.override=(action,args)=>action==='player.closeHost'&&args.owner===old.host.owner?gate.promise:undefined;
 const closing=p.host.close();let next;
 try{await tick();p.advance();next=p.host.request('play',{id:'new'});await tick();assert.equal(p.count('play'),1,'No new decoder request may reuse an owner whose close is awaiting acknowledgement');gate.resolve({closed:true});await closing;await next;const current=await p.api.invoke('rhvideo.player.hostState');assert.equal(current.opened,true);assert.notEqual(current.host.owner,old.host.owner);}
 finally{gate.resolve({closed:true});await Promise.allSettled([closing,next].filter(Boolean));}
});
test('an original play acknowledged after its UI intent changed retires its otherwise unused native scope',async()=>{
 const p=fixture(),gate=deferred();p.override=action=>action==='play'?gate.promise:undefined;const opening=p.host.request('play',{id:'old'});await tick();const raw=p.calls.find(c=>c.action==='play');assert(raw);p.advance();gate.resolve({opened:true,inputId:1,state:3,renderedFrames:1,host:{...raw.args.host,lease:2}});
 const result=await opening;assert.equal(result.stale,true);assert.equal(p.count('player.closeHost'),1,'Do not leave an alpha-zero native input and preparing dialog behind');assert.equal(p.host.opened(),false);
});
test('a replacement and old-parent cleanup cannot overtake an earlier native source acknowledgement',async()=>{
 const p=fixture(),gate=deferred();p.override=(action,args)=>action==='play'&&args.id==='old'?gate.promise:action==='player.closeParent'?{closed:false,stale:true}:undefined;
 const old=p.host.request('play',{id:'old'});await tick();const first=p.calls.find(c=>c.action==='play');p.advance();const next=p.host.request('play',{id:'new'}),cleanup=p.host.request('player.closeParent',{parentPreview:'old-preview',parentPlayback:'old-playback'});await tick();assert.equal(p.count('play'),1);assert.equal(p.count('player.closeParent'),0);
 gate.resolve({opened:true,inputId:10,state:3,renderedFrames:1,host:{...first.args.host,lease:2}});assert.equal((await old).stale,true);await next;assert.equal((await cleanup).stale,true);assert.deepEqual(p.calls.filter(c=>c.action==='play'||c.action==='player.closeParent').map(c=>c.args.id||c.action),['old','new','player.closeParent']);assert(p.host.opened());
});
test('duplicate closes await one accepted operation rather than submitting another native close',async()=>{
 const p=fixture();await p.host.request('play',{id:'generated'});const gate=deferred();p.override=action=>action==='player.closeHost'?gate.promise:undefined;const a=p.host.close(),b=p.host.close();await tick();assert.equal(p.count('player.closeHost'),1);gate.resolve({closed:true});await Promise.all([a,b]);assert.equal(p.host.opened(),false);
});

test('fullscreen acknowledgement changes the live library layout in both directions',async()=>{
 const p=fixture();await p.host.request('play',{id:'generated'});const dialog=p.nodes.find(n=>n.tagName==='dialog');assert.equal(dialog.classList.contains('is-fullscreen'),false);
 assert.equal((await p.host.request('player.fullscreen')).fullscreen,true);assert.equal(dialog.classList.contains('is-fullscreen'),true);
 assert.equal((await p.host.request('player.fullscreen')).fullscreen,false);assert.equal(dialog.classList.contains('is-fullscreen'),false);
});

test('a player opened in an already-fullscreen library adopts that layout before native admission',async()=>{
 const p=fixture({fullscreen:true});let admitted=false;p.override=action=>{if(action==='play'){admitted=true;assert.equal(p.nodes.find(n=>n.tagName==='dialog').classList.contains('is-fullscreen'),true);}return undefined;};
 await p.host.request('play',{id:'generated'});assert(admitted);
});

test('a delayed fullscreen acknowledgement cannot resize a replacement panel',async()=>{
 const p=fixture();await p.host.request('play',{id:'old'});const gate=deferred();p.override=action=>action==='player.fullscreen'?gate.promise:undefined;
 const pending=p.host.request('player.fullscreen');await tick();await p.host.close();p.advance();await p.host.request('play',{id:'new'});const current=p.nodes.findLast(n=>n.tagName==='dialog');
 gate.resolve({fullscreen:true});await pending;assert.equal(current.classList.contains('is-fullscreen'),false);assert(p.host.opened());
});

test('a rejected fullscreen change does not silently change the current layout',async()=>{
 const p=fixture();await p.host.request('play',{id:'generated'});const failure=Error('generated fullscreen denial');p.override=action=>action==='player.fullscreen'?Promise.reject(failure):undefined;
 await assert.rejects(p.host.request('player.fullscreen'),error=>error===failure);assert.equal(p.nodes.find(n=>n.tagName==='dialog').classList.contains('is-fullscreen'),false);assert.equal(p.count('player.fullscreen'),1);
});

test('consecutive fullscreen toggles keep native and layout acknowledgements ordered',async()=>{
 const p=fixture();await p.host.request('play',{id:'generated'});const gate=deferred();let received=0;p.override=action=>{if(action==='player.fullscreen')return ++received===1?gate.promise:{fullscreen:false};};
 const first=p.host.request('player.fullscreen');await tick();const second=p.host.request('player.fullscreen');await tick();assert.equal(p.count('player.fullscreen'),1,'The second toggle must not overtake the first acknowledgement');
 gate.resolve({fullscreen:true});await Promise.all([first,second]);assert.equal(p.count('player.fullscreen'),2);assert.equal(p.nodes.find(n=>n.tagName==='dialog').classList.contains('is-fullscreen'),false);
});
