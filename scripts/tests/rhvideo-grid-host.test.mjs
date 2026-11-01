import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {create}=createRequire(import.meta.url)('../../src/js/automation-core.js');
const source=fs.readFileSync(new URL('../../src/js/rhvideo-grid-host.js',import.meta.url),'utf8');
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};

// Exercise the shipped host and public registry. Only DOM, decoder and footer
// controller edges are fixtures: these tests do NOT certify pixels/performance.
function fixture({fetchGate}={}){
 const calls=[],nodes=[],handlers=[],events=new Map(),controllers=[];let selected=null,uuid=0,version=0,ownerId=0,lease=0,state=null,override=null;
 class Node{
  constructor(tag){this.tagName=tag.toUpperCase();this.id='';this.children=[];this.dataset={};this.attributes={};this.className='';this.open=false;this.hidden=false;this.style={};this.classList={add:(...v)=>{this.className+=' '+v.join(' ');}};nodes.push(this);}
  append(...items){for(const n of items){n.remove();n.parentNode=this;this.children.push(n);}}
  insertBefore(n,before){n.remove();n.parentNode=this;this.children.splice(this.children.indexOf(before),0,n);}
  remove(){if(this.parentNode){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}}
  close(){this.open=false;}focus(){}setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k]??null;}
  addEventListener(type,fn){handlers.push({node:this,type,fn});}
  getBoundingClientRect(){return {x:20,y:30,width:640,height:360};}
  matches(selector){return selector.split(',').some(s=>s[0]==='#'?this.id===s.slice(1):s[0]==='.'?this.className.split(/\s+/).includes(s.slice(1)):s==='[id]'?!!this.id:s.startsWith('[role=')?this.attributes.role===s.slice(6,-1).replaceAll('"',''):this.tagName===s.toUpperCase());}
  querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 }
 function footer(){const root=new Node('footer');root.id='controls';for(const [tag,id,className,role]of [['div','title','player-title'],['div','row','control-row'],['div','summary',''],['div','error','', 'alert'],...['previous','next','pause','resume','mute','restore'].map(id=>['button',id,''])]){const n=new Node(tag);n.id=id;n.className=className;if(role)n.setAttribute('role',role);root.append(n);}return root;}
 const document={hidden:false,body:new Node('body'),createElement:tag=>new Node(tag),importNode:()=>footer(),addEventListener(){}};
 const api=create({instanceId:'generated-grid-host'}),rawNative=async(action,args={})=>{
  calls.push({action,args:structuredClone(args)});if(override){const value=override(action,args);if(value!==undefined)return value;}
  if(action==='grid.hostContext')return {window:2};if(action==='grid.hostPrepare')return {...args,owner:++ownerId};
  if(action==='grid.open'){state={host:{...args.host,lease:++lease},expanded:null,cells:[0,1].map(i=>({inputId:lease*10+i,id:'generated-'+i,title:'Generated '+i,positionMs:0,durationMs:20000,volume:100,rate:1,state:3,pauseRequested:false}))};return structuredClone(state);}
  if(action==='grid.control'){for(const [i,cell]of state.cells.entries())if(args.target===-1||args.target===i)cell.pauseRequested=args.command==='pause';return structuredClone(state);}
  if(action==='grid.state')return structuredClone(state);return {closed:true};
 };
 const context=vm.createContext({window:{__TAURI__:{event:{listen:async(name,fn)=>{events.set(name,fn);return()=>events.delete(name);}}},addEventListener(){}},document,crypto:{randomUUID:()=>++uuid+'-panel'},
  fetch:async()=>{if(fetchGate)await fetchGate.promise;return {ok:true,text:async()=>'<footer></footer>'};},DOMParser:class{parseFromString(){return {getElementById:()=>footer()};}},ResizeObserver:class{observe(){}disconnect(){}},Option:function(label,value){const n=new Node('option');n.value=value;return n;},
  RHFilesUI:{listen:(node,type,fn)=>handlers.push({node,type,fn}),remove:(node,type,fn)=>{const i=handlers.findIndex(v=>v.node===node&&v.type===type&&v.fn===fn);if(i>=0)handlers.splice(i,1);}},RHVideoGridControls:{install(options){const c={options,disposed:0,suspend(){},resume(){},refresh:async()=>{},dispose(){this.disposed++;}};controllers.push(c);return c;}}
 });
 vm.runInContext(source,context);const host=context.window.RHVideoGridHost.install({api,rawNative,modalTop:()=>selected,openDialog:id=>{selected=id;nodes.findLast(n=>n.id===id).open=true;},notice(){},intent:()=>version,canInline:()=>true});
 return {host,api,calls,nodes,controllers,events,get state(){return state;},set override(fn){override=fn;},advance(){version++;},cover(){selected='generated-settings';},uncover(){selected='rhvideo-grid-dialog';},count:action=>calls.filter(v=>v.action===action).length,fire:async(id,type)=>{let prevented=false;const target=nodes.findLast(n=>n.id===id);for(const h of handlers.filter(v=>v.node===target&&v.type===type))await h.fn({target,preventDefault(){prevented=true;}});return {prevented};}};
}

test('library Grid mounts one owned panel with directly addressable cell controls',async()=>{
 const p=fixture();await p.host.request('grid.open',{playlist:'generated'});const call=p.calls.find(v=>v.action==='grid.open');assert.equal(call.args.host.kind,'library');assert.equal(call.args.host.owner,1);assert.equal(call.args.host.window,2);assert.equal(p.nodes.filter(n=>n.tagName==='DIALOG').length,1);assert.equal((await p.api.invoke('rhvideo.grid.hostState')).pending,false);
 for(const index of [0,1])for(const name of ['favorite','mark','expand','toggle','mute','seek','volume','rate'])assert(p.nodes.some(n=>n.id==='library-grid-cell-'+index+'-'+name),name);
});
test('advanced summary UI and public API change the same panel, without native default double-toggle',async()=>{
 const p=fixture();await p.host.request('grid.open',{});assert.equal((await p.api.invoke('rhvideo.grid.hostState')).advanced,false);assert.equal((await p.fire('library-grid-advanced-toggle','click')).prevented,true);assert.equal((await p.api.invoke('rhvideo.grid.hostState')).advanced,true);await p.api.invoke('rhvideo.grid.advanced',{expanded:false});assert.equal((await p.api.invoke('rhvideo.grid.hostState')).advanced,false);assert.equal(p.nodes.findLast(n=>n.id==='library-grid-advanced-toggle').attributes['aria-expanded'],'false');
 await assert.rejects(p.api.invoke('rhvideo.grid.advanced',{}),/expanded|Required|required/);p.cover();await assert.rejects(p.api.invoke('rhvideo.grid.advanced',{expanded:true}),/当前未激活/);
});
test('old panel close and advanced actions cannot mutate a reopened Grid',async()=>{
 const p=fixture();await p.host.request('grid.open',{});const old=await p.api.invoke('rhvideo.grid.hostState');await p.host.close();p.advance();await p.host.request('grid.open',{});const current=await p.api.invoke('rhvideo.grid.hostState');assert.notEqual(current.panel,old.panel);
 assert.equal((await p.api.invoke('rhvideo.grid.advanced',{expanded:true,expectedPanel:old.panel})).stale,true);assert.equal((await p.api.invoke('rhvideo.grid.panelClose',{expectedPanel:old.panel})).stale,true);assert.equal((await p.api.invoke('rhvideo.grid.hostState')).advanced,false);assert(p.host.opened());
 p.events.get('rhvideo-grid-closed')({payload:{host:old.host}});assert.equal((await p.api.invoke('rhvideo.grid.hostState')).panel,current.panel);
});
test('closing before markup arrives cannot resurrect Grid or its native reservation',async()=>{
 const held=gate(),p=fixture({fetchGate:held}),open=p.host.request('grid.open',{});await p.host.close();held.resolve();assert.equal((await open).stale,true);assert.equal(p.count('grid.hostPrepare'),0);assert.equal(p.nodes.filter(n=>n.tagName==='DIALOG').length,0);
});
test('markup arriving after Settings opens cannot place a delayed Grid above it',async()=>{
 const held=gate(),p=fixture({fetchGate:held}),open=p.host.request('grid.open',{});p.cover();held.resolve();assert.equal((await open).stale,true);assert.equal(p.count('grid.hostPrepare'),0);assert.equal(p.nodes.filter(n=>n.tagName==='DIALOG').length,0);
});
test('a late native host reservation is retired exactly once after closing',async()=>{
 const held=gate(),p=fixture();p.override=action=>action==='grid.hostPrepare'?held.promise:undefined;const open=p.host.request('grid.open',{});await tick();await p.host.close();held.resolve({window:2,panel:'1-panel',owner:1});assert.equal((await open).stale,true);assert.equal(p.count('grid.open'),0);assert.equal(p.count('grid.closeHost'),1);assert.equal(p.calls.at(-1).args.owner,1);
});
test('cover and restoration preserve each cell pause intent',async()=>{
 const p=fixture();await p.host.request('grid.open',{});p.state.cells[0].pauseRequested=true;await p.host.request('grid.state');p.cover();await p.host.sync();await p.host.sync();assert.equal(p.calls.filter(v=>v.action==='grid.control'&&v.args.command==='pause').length,1);assert(p.calls.filter(v=>v.action==='grid.bounds').at(-1).args.cells.every(v=>!v.visible));p.uncover();await p.host.sync();const resume=p.calls.filter(v=>v.action==='grid.control'&&v.args.command==='resume');assert.equal(resume.length,1);assert.equal(resume[0].args.inputTarget,1);assert.equal(p.state.cells[0].pauseRequested,true);
});
