import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');
const functions=new Map(),actions=new Map();
function visit(node){
 if(!node||typeof node!=='object')return;
 if(node.type==='FunctionDeclaration'&&node.id)functions.set(node.id.name,source.slice(node.start,node.end));
 if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='action'&&typeof node.arguments[0]?.value==='string'&&node.arguments[2]){const fn=node.arguments[2];actions.set(node.arguments[0].value,source.slice(fn.start,fn.end));}
 for(const item of Object.values(node))if(Array.isArray(item))item.forEach(visit);else if(item&&typeof item==='object')visit(item);
}
visit(parse(source,{ecmaVersion:'latest'}));
const plain=x=>JSON.parse(JSON.stringify(x));
function view(token){return {token,transitionTicket:1,videoActive:false,videoInput:null,tiles:new Map(),surface:{getBoundingClientRect:()=>({x:0,y:0,width:800,height:450})},observer:{disconnect(){}}};}
function fixture(){
 const calls=[],opens=[],bounds=[],backend={input:11,opacity:1,playing:true,controls:0};let sequence=100,holdBounds=false;
 const context=vm.createContext({viewer:view(1),viewerToken:1,animation:0,innerWidth:800,top:true,config:()=>({super:false}),abortPictureOrders(){},rememberViewer(){},retireStripTile(){},cancelAnimationFrame(){},clearTimeout(){},notice(){},invalidatePendingConfirmation(){},$:()=>({close(){}}),liveRefresh:{enabled:false,configure(){}}});
 context.viewerIsTop=()=>context.top;
 const apply=(name,args={})=>{
  if(Object.hasOwn(args,'expectedInput')&&args.expectedInput!==backend.input)return {stale:true,opened:false};
  if(name==='presentation.close'){backend.input=null;return {closed:true};}
  if(name==='presentation.bounds'){backend.opacity=args.opacity;return {visible:true};}
  if(name==='presentation.control'){backend.controls++;backend.playing=args.command==='resume';return {opened:true,inputId:backend.input};}
  return {opened:backend.input!==null,inputId:backend.input};
 };
 context.native=(name,args={})=>{
  calls.push({name,args:plain(args)});
  if(name==='presentation.open'){const id=++sequence;backend.input=id;return new Promise(resolve=>opens.push({id,finish:()=>resolve({opened:true,inputId:id})}));}
  if(name==='presentation.bounds'&&holdBounds)return new Promise(resolve=>bounds.push({args,finish:()=>resolve(apply(name,args))}));
  return Promise.resolve(apply(name,args));
 };
 for(const name of ['presentationRequest','syncPresentation','stopViewer'])if(functions.has(name))vm.runInContext(functions.get(name),context);
 for(const [target,id]of [['openVideo','viewer.video'],['control','viewer.mediaControl'],['closePanel','panel.close']])vm.runInContext('globalThis.'+target+'=('+actions.get(id)+')',context);
 return {context,backend,calls,opens,bounds,holdBounds(){holdBounds=true;}};
}

test('a late open from a closed viewer can retire only its own actual native input, never the replacement',async()=>{
 const f=fixture(),old=f.context.openVideo({id:'old',title:'synthetic old'});assert.equal(f.opens.length,1);
 f.context.viewer=view(2);const fresh=f.context.openVideo({id:'new',title:'synthetic new'});f.opens[1].finish();await fresh;
 f.opens[0].finish();assert.equal((await old).stale,true);
 assert.equal(f.backend.input,102);assert.equal(f.context.viewer.videoInput,102);
 assert.equal(f.calls.find(row=>row.name==='presentation.close').args.expectedInput,101);
});

test('two opens within the same viewer cannot let the older reply adopt or project the newer video',async()=>{
 const f=fixture(),old=f.context.openVideo({id:'old',title:'old'}),fresh=f.context.openVideo({id:'new',title:'new'});
 f.opens[1].finish();await fresh;f.opens[0].finish();assert.equal((await old).stale,true);
 assert.equal(f.context.viewer.videoInput,102);assert.equal(f.backend.input,102);
 assert.deepEqual(f.calls.filter(row=>row.name==='presentation.bounds').map(row=>row.args.expectedInput),[102]);
});

test('moving to another slide invalidates an unfinished video open even in the same viewer',async()=>{
 const f=fixture(),old=f.context.openVideo({id:'old',title:'old'});f.context.viewer.transitionTicket++;
 f.opens[0].finish();assert.equal((await old).stale,true);assert.equal(f.context.viewer.videoActive,false);assert.equal(f.backend.input,null);
 assert.equal(f.calls.find(row=>row.name==='presentation.close').args.expectedInput,101);
});

test('queued bounds carry the captured input rather than moving whichever decoder happens to be current later',async()=>{
 const f=fixture(),old=f.context.viewer;old.videoActive=true;old.videoInput=11;f.holdBounds();
 const pending=f.context.syncPresentation(.25,true,old);assert.equal(f.bounds.length,1);
 f.context.viewer=view(2);f.backend.input=22;f.backend.opacity=1;f.bounds[0].finish();await pending;
 assert.equal(f.calls[0].args.expectedInput,11);assert.equal(f.backend.opacity,1);
});

test('visible controls capture the current input and an explicit stale input is not silently replaced with it',async()=>{
 const f=fixture();f.context.viewer.videoActive=true;f.context.viewer.videoInput=22;f.backend.input=22;
 await f.context.control({command:'pause'});const stale=await f.context.control({command:'resume',expectedInput:11});
 assert.equal(stale.stale,true);assert.equal(f.backend.controls,1);assert.equal(f.backend.playing,false);
 assert.deepEqual(f.calls.map(row=>row.args.expectedInput),[22,11]);
});

test('closing an old viewer cannot globally stop a newer native input which already replaced it',async()=>{
 const f=fixture();f.context.viewer.videoActive=true;f.context.viewer.videoInput=11;f.backend.input=22;
 f.context.stopViewer();await new Promise(setImmediate);
 assert.equal(f.context.viewer,null);assert.equal(f.backend.input,22);assert.equal(f.calls[0].args.expectedInput,11);
});

test('a late projection cannot show the current native video over a newer modal',async()=>{
 const f=fixture();f.context.viewer.videoActive=true;f.context.viewer.videoInput=11;f.context.top=false;
 await f.context.syncPresentation(1,true,f.context.viewer);
 assert.equal(f.calls[0].args.visible,false);assert.equal(f.calls[0].args.opacity,0);
});

test('closing one panel cannot resume video after another panel opens while native bounds acknowledgement is pending',async()=>{
 const f=fixture();f.context.viewer.videoActive=true;f.context.viewer.videoInput=11;f.context.viewer.running=true;f.holdBounds();
 const closing=f.context.closePanel({id:'wb-settings'});assert.equal(f.bounds.length,1);
 f.context.top=false;f.bounds[0].finish();await closing;
 assert.equal(f.backend.controls,0,'The new modal still owns pause; no late resume may be queued');
});
