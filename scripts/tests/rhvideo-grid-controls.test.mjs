import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{create}=require('../../src/js/automation-core.js'),phase=require('../../src/js/rhvideo-playback-phase.js');
async function grid({component=null,registry=null,subscribe=null}={}){
 const html=fs.readFileSync(new URL('../../src/rhvideo-grid.html',import.meta.url),'utf8'),nodes=new Map(),handlers=[],events=new Map(),timers=new Map(),windowEvents=new Map();let timer=0,command,readState;
 const prefix=component?.actionPrefix||'rhvideo.grid.';
 const node=id=>{if(!nodes.has(id)){let value=id==='target'?'-1':id==='volume'?'100':'0';const n={id,tagName:'DIV',dataset:{},disabled:false,textContent:'',hidden:false,children:[],setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k]??null;},replaceChildren(...v){this.children=v;},append(...v){this.children.push(...v);},closest(){return null;},matches(){return false;}};Object.defineProperty(n,'value',{get:()=>value,set(v){const text=String(v);value=n.tagName==='SELECT'&&!n.children.some(o=>o.value===text)?'':text;}});nodes.set(id,n);}return nodes.get(id);};
 for(const [,tag,attrs]of html.matchAll(/<(button|input|select)\b([^>]*)>/g)){const id=attrs.match(/\bid="([^"]+)"/);if(id)node(id[1]).tagName=tag.toUpperCase();}for(const [,id]of html.matchAll(/\bid="([^"]+)"/g))node(id);
 // A real select clears its value when there is no exact option match. Do not
 // let a permissive fake hide a packaged '.5' versus state '0.5' mismatch.
 for(const [,attrs,body]of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select\s*>/g)){const n=node(attrs.match(/\bid="([^"]+)"/)[1]);for(const [,option,text]of body.matchAll(/<option\b([^>]*)>([^<]*)/g))n.children.push({value:option.match(/\bvalue="([^"]+)"/)[1],textContent:text,selected:/\bselected\b/.test(option)});n.value=(n.children.find(v=>v.selected)||n.children[0]).value;}
 const state={generation:1,windowLease:3,count:2,total:4,offset:0,groupIndex:0,groupTotal:2,hasPrevious:false,hasNext:true,cells:[10,11].map((inputId,i)=>({id:'video-'+i,inputId,title:'generated-'+i,state:3,pauseRequested:false,positionMs:1000,durationMs:20000,volume:100,rate:1,renderedFrames:20,favorite:false,marked:false}))},calls=[],api=registry||create({instanceId:'generated-grid-controls'});command=readState=()=>Promise.resolve(structuredClone(state));
 const request=(action,args)=>{calls.push({action,args});return action==='grid.state'?readState(args):command(action,args);};
 const receive=async(name,handler)=>{events.set(name,handler);return()=>{if(events.get(name)===handler)events.delete(name);};};
 const document={getElementById:node,querySelectorAll:()=>[...nodes.values()].filter(v=>v.tagName!=='DIV'),activeElement:null},window={RHFilesAPI:api,__TAURI__:{core:{invoke:(_name,{action,args}={})=>request(action,args)},event:{listen:subscribe||receive}},addEventListener(name,handler){windowEvents.set(name,handler);},removeEventListener(name,handler){if(windowEvents.get(name)===handler)windowEvents.delete(name);}};
 const context=vm.createContext({window,document,RHFilesAPI:api,RHVideoPlaybackPhase:phase,RHFilesUI:{listen(n,type,handler,options,site){handlers.push({n,type,handler,options,site});},remove(n,type,handler){const i=handlers.findIndex(v=>v.n===n&&v.type===type&&v.handler===handler);if(i>=0)handlers.splice(i,1);}},Option:function(text,value){this.textContent=text;this.value=value;},setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)});
 let controller;for(const [,file]of html.matchAll(/<script\s+src="(js\/rhvideo-grid[^"/]*\.js)"/g)){if(component&&file==='js/rhvideo-grid.js')continue;controller=vm.runInContext(fs.readFileSync(new URL('../../src/'+file,import.meta.url),'utf8'),context,{filename:file});}
 if(component){context.componentOptions={...component,api,lookup:node,nativeRequest:request};controller=vm.runInContext('window.RHVideoGridControls.install(componentOptions)',context);}
 await api.invoke(prefix+'state');
 return {api,state,calls,node,events,handlers,timers,windowEvents,controller,context,prefix,setCommand:fn=>{command=fn;},setStateReader:fn=>{readState=fn;},fire:async(id,type,values={})=>{const n=id==='document'?document:node(id);if(type==='pointerdown')document.activeElement=n;let result;for(const h of handlers.filter(v=>v.n===n&&v.type===type))result=h.handler({isTrusted:true,button:0,key:'ArrowRight',code:'ArrowRight',target:n,preventDefault(){},...values});return result;}};
}
test('a held grid volume gesture keeps its original input when the visible group is replaced',async()=>{
 const p=await grid();await p.api.invoke('rhvideo.grid.target',{index:0});await p.fire('volume','pointerdown');p.node('volume').value='45';
 p.state.cells=p.state.cells.map((v,i)=>({...v,id:'replacement-'+i,inputId:20+i}));await p.api.invoke('rhvideo.grid.state');
 p.setCommand((action,args)=>{assert.equal(action,'grid.control');assert.equal(args.expectedInput,10);assert.equal(args.inputTarget,0);return Promise.reject(Error('同屏输入已改变，旧操作未执行'));});
 await assert.rejects(p.fire('volume','change'),/旧操作未执行/);assert.match(p.node('error').textContent,/旧操作未执行/);
});
test('a held aggregate grid gesture carries the original complete input set, not the replacement group',async()=>{
 const p=await grid();await p.fire('volume','pointerdown');p.node('volume').value='45';p.state.cells=p.state.cells.map((v,i)=>({...v,inputId:30+i}));await p.api.invoke('rhvideo.grid.state');
 p.setCommand((action,args)=>{assert.equal(action,'grid.control');assert.deepEqual(Array.from(args.expectedInputs),[10,11]);return Promise.reject(Error('同屏输入已改变，旧操作未执行'));});await assert.rejects(p.fire('volume','change'),/旧操作未执行/);
});
test('grid physical UI callbacks preserve the actual failure instead of reporting successful automation',async()=>{
 const p=await grid(),denial=Error('Generated native grid denial');p.setCommand(()=>Promise.reject(denial));await assert.rejects(p.fire('pause','click'),e=>e===denial);assert.equal(p.node('error').textContent,denial.message);assert.equal(p.calls.filter(v=>v.action==='grid.control').length,1);
});
test('the actual native grid payload with its null popup host lease reaches the guarded input operation',async()=>{
 const p=await grid();await p.events.get('rhvideo-grid-input')({payload:{inputId:10,target:0,intent:'toggle',hostLease:null}});for(let i=0;i<20;i++)await Promise.resolve();
 const writes=p.calls.filter(v=>v.action==='grid.control');assert.equal(writes.length,1);assert.equal(writes[0].args.expectedInput,10);assert.deepEqual(Array.from(writes[0].args.expectedInputs),[10,11]);assert.equal(writes[0].args.command,'pause');assert.equal(p.node('error').textContent,'');
});

for(const id of ['volume','rate','seek','group-seek'])test(id+' cancellation cannot be rebound to the current input',async()=>{
 const p=await grid();await p.fire(id,'pointerdown');await p.fire(id,'pointercancel');
 await assert.rejects(p.fire(id,'change'),/拖动已取消/);assert.equal(p.calls.filter(v=>v.action!=='grid.state').length,0);
});

for(const [id,type,action,value]of [['pause','click','grid.control'],['mute','click','grid.control'],['favorite','click','grid.favorite'],['mark','click','grid.mark'],['expand','click','grid.expand'],['next','click','grid.page'],['group-seek','change','grid.seekGroup','500'],['volume','change','grid.control','44'],['rate','change','grid.control','1.25'],['seek','change','grid.control','500']]){
 test(id+' UI waits for the native result and retains failure without replay',async()=>{
  const p=await grid();await p.api.invoke('rhvideo.grid.target',{index:0});if(value)p.node(id).value=value;
  let reject;const gate=new Promise((_,no)=>reject=no),denial=Error('Generated '+id+' denial');p.setCommand(name=>{assert.equal(name,action);return gate;});
  let settled=false;const pending=p.fire(id,type).finally(()=>{settled=true;});const rejected=assert.rejects(pending,e=>e===denial);
  for(let n=0;n<20;n++)await Promise.resolve();assert.equal(settled,false);assert.equal(p.calls.filter(v=>v.action===action).length,1);reject(denial);await rejected;
  assert.equal(p.node('error').textContent,denial.message);assert.equal(p.calls.filter(v=>v.action===action).length,1);
 });
}

test('grid keyboard returns an actual native failure to its caller',async()=>{
 const p=await grid(),denial=Error('Generated keyboard denial');p.setCommand(()=>Promise.reject(denial));
 await assert.rejects(p.fire('document','keydown',{key:' ',code:'',target:{closest:()=>null}}),e=>e===denial);assert.equal(p.node('error').textContent,denial.message);
});

test('native PLAYER and foreign host events never invoke Grid controls',async()=>{
 const p=await grid();for(const payload of [{inputId:10,target:null,intent:'toggle',hostLease:7},{inputId:10,target:0,intent:'toggle',hostLease:7},{inputId:10,target:0.5,intent:'toggle',hostLease:null}])await p.events.get('rhvideo-grid-input')({payload});
 assert.equal(p.calls.filter(v=>v.action!=='grid.state').length,0);assert.equal(p.node('error').textContent,'');
});

test('an older read cannot repaint a replacement group',async()=>{
 const p=await grid();let release;p.setStateReader(()=>new Promise(resolve=>release=resolve));const pending=p.api.invoke('rhvideo.grid.state'),old=structuredClone(p.state);
 p.state.cells=p.state.cells.map((v,i)=>({...v,inputId:20+i}));p.setStateReader(()=>Promise.resolve(structuredClone(p.state)));await p.api.invoke('rhvideo.grid.state');release(old);await pending;
 assert.deepEqual(Array.from(p.controller.snapshot().state.cells,v=>v.inputId),[20,21]);
});

test('suspend fences pending reads and held input, and resume owns only one timer',async()=>{
 const p=await grid();await p.fire('volume','pointerdown');let release;p.setStateReader(()=>new Promise(resolve=>release=resolve));const pending=p.api.invoke('rhvideo.grid.state');p.controller.suspend();
 release({...structuredClone(p.state),cells:p.state.cells.map(v=>({...v,inputId:v.inputId+20}))});await pending;assert.equal(p.timers.size,0);assert.equal(p.controller.snapshot().active,false);assert.equal(p.controller.snapshot().state.cells[0].inputId,10);
 await assert.rejects(p.api.invoke('rhvideo.grid.control',{target:0,command:'pause'}),/未激活/);p.setStateReader(()=>Promise.resolve(structuredClone(p.state)));p.controller.resume();p.controller.resume();for(let n=0;n<20;n++)await Promise.resolve();assert.equal(p.timers.size,1);
 await assert.rejects(p.fire('volume','change'),/拖动已取消/);assert.equal(p.calls.filter(v=>v.action==='grid.control').length,0);
});

test('dispose unregisters only its own controls, state, events and timers',async()=>{
 const api=create({instanceId:'shared-grid-registry'}),p=await grid({registry:api,component:{actionPrefix:'rhvideo.inlineGrid.',standalone:false}});
 api.register('rhvideo.grid.state',()=>({owner:'workbench'}));assert.equal((await api.invoke('rhvideo.grid.state')).owner,'workbench');
 assert(p.handlers.length>0);p.controller.dispose();assert.equal(p.handlers.length,0);assert.equal(p.events.size,0);assert.equal(p.timers.size,0);assert.equal(p.windowEvents.size,0);
 assert.equal(api.list().some(v=>v.id.startsWith('rhvideo.inlineGrid.')),false);assert.equal((await api.invoke('rhvideo.grid.state')).owner,'workbench');assert.equal('rhvideo.inlineGrid' in api.snapshot().state,false);
});

test('a late event subscription is disposed even after the component has closed',async()=>{
 const gates=[],removed=[],p=await grid({component:{actionPrefix:'rhvideo.inlineGrid.',standalone:false},subscribe:(name)=>new Promise(resolve=>gates.push(()=>resolve(()=>removed.push(name))))});
 p.controller.dispose();for(const release of gates)release();for(let n=0;n<20;n++)await Promise.resolve();assert.deepEqual(removed.sort(),['rhvideo-grid-input','rhvideo-grid-session']);
});

test('topmost modal ownership disables every Grid source control and blocks mutation',async()=>{
 let top=true;const p=await grid({component:{actionPrefix:'rhvideo.inlineGrid.',standalone:false,isTop:()=>top}});top=false;await p.api.invoke('rhvideo.inlineGrid.state');
 assert(p.node('group-seek').disabled);assert(p.node('next').disabled);assert(p.node('pause').disabled);await assert.rejects(p.api.invoke('rhvideo.inlineGrid.control',{target:0,command:'pause'}),/未激活/);
 assert.equal((await p.fire('pause','click')).ignored,true);assert.equal(p.calls.filter(v=>v.action==='grid.control').length,0);
});

test('reused source component keeps namespaced action coverage and all six reference rates',async()=>{
 const p=await grid({component:{actionPrefix:'rhvideo.inlineGrid.',standalone:false}});const coverage=await p.api.invoke('rhvideo.inlineGrid.contract');assert.deepEqual(Array.from(coverage.missing),[]);assert.equal(coverage.controls,14);
 const html=fs.readFileSync(new URL('../../src/rhvideo-grid.html',import.meta.url),'utf8'),rates=[...html.match(/<select id="rate"[\s\S]*?<\/select>/)[0].matchAll(/value="([^"]+)"/g)].map(v=>Number(v[1]));assert.deepEqual(rates,[.5,.75,1,1.25,1.5,2]);
});

test('suspend and repeated resume during a pending read never duplicate polling',async()=>{
 const p=await grid();p.controller.suspend();let release;p.setStateReader(()=>new Promise(resolve=>release=resolve));const before=p.calls.length;p.controller.resume();p.controller.suspend();p.controller.resume();p.controller.resume();assert.equal(p.calls.length,before+1);assert.equal(p.timers.size,0);
 release(structuredClone(p.state));for(let n=0;n<20;n++)await Promise.resolve();assert.equal(p.timers.size,1);p.controller.dispose();assert.equal(p.timers.size,0);
});

test('late accepted close completion cannot close a newly mounted component',async()=>{
 const registry=create({instanceId:'remounted-grid-registry'});let release,oldClosed=0,newClosed=0;
 const old=await grid({registry,component:{actionPrefix:'rhvideo.inlineGrid.',standalone:false,onClosed:()=>oldClosed++}});old.setCommand(()=>new Promise(resolve=>release=resolve));const closing=registry.invoke('rhvideo.inlineGrid.close');for(let n=0;n<20;n++)await Promise.resolve();old.controller.dispose();
 const current=await grid({registry,component:{actionPrefix:'rhvideo.inlineGrid.',standalone:false,onClosed:()=>newClosed++}});release({closed:true});assert.equal((await closing).closed,true);assert.equal(oldClosed,0);assert.equal(newClosed,0);assert(registry.list().some(v=>v.id==='rhvideo.inlineGrid.control'));current.controller.dispose();
});

test('registration collision rolls back only the incomplete component',async()=>{
 const registry=create();registry.register('rhvideo.inlineGrid.state',()=>({original:true}));await assert.rejects(grid({registry,component:{actionPrefix:'rhvideo.inlineGrid.',standalone:false}}),{code:'DUPLICATE_ACTION'});assert.equal(registry.list().length,1);assert.equal((await registry.invoke('rhvideo.inlineGrid.state')).original,true);assert.deepEqual(registry.snapshot().state,{});
});

test('standalone controls reject takeover by a replacement popup lease',async()=>{
 const p=await grid();p.state.windowLease=4;await assert.rejects(p.api.invoke('rhvideo.grid.state'),/同屏宿主已改变/);assert.equal(p.controller.snapshot().state.windowLease,3);
});

test('cleanup rejection stays visible without retry or unhandled rejection',async()=>{
 let removed=0;const p=await grid({component:{actionPrefix:'rhvideo.inlineGrid.',standalone:false},subscribe:async()=>()=>{removed++;return Promise.reject(Error('Generated Grid cleanup denial'));}});p.controller.dispose();for(let n=0;n<20;n++)await Promise.resolve();assert.equal(removed,2);assert.deepEqual(Array.from(p.controller.snapshot().cleanupErrors),['Generated Grid cleanup denial','Generated Grid cleanup denial']);p.controller.dispose();assert.equal(removed,2);
});

test('standalone close preserves its native receipt and scoped close remains local',async()=>{
 for(const component of [null,{actionPrefix:'rhvideo.inlineGrid.',standalone:false}]){const p=await grid({component}),prefix=component?.actionPrefix||'rhvideo.grid.';p.setCommand(()=>Promise.resolve({closed:true}));const run=p.api.run(prefix+'close'),result=await p.api.wait(run.id,1000);assert.equal(result.state,'succeeded');assert.equal(result.result.closed,true);const args=p.calls.find(v=>v.action==='grid.close').args;if(component)assert.equal(args._automationRun,undefined);else assert.equal(args._automationRun.action,'rhvideo.grid.close');p.controller.dispose();}
});

for(const value of [.5,.75])test('rate '+value+' remains visibly selected after native state refresh',async()=>{
 const p=await grid();await p.api.invoke('rhvideo.grid.target',{index:0});p.state.cells[0].rate=value;await p.api.invoke('rhvideo.grid.state');assert.equal(p.node('rate').value,String(value));
});
