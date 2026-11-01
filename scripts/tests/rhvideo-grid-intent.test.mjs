import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {parse} from 'acorn';import {createRequire} from 'node:module';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),actions=new Map(),functions=new Map(),model=createRequire(import.meta.url)('../../src/js/rhvideo-model.js');
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='CallExpression'&&n.callee?.name==='action'&&['grid.open','grid.close'].includes(n.arguments[0]?.value))actions.set(n.arguments[0].value,source.slice(n.start,n.end));if(n.type==='FunctionDeclaration')functions.set(n.id.name,source.slice(n.start,n.end));for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
walk(parse(source,{ecmaVersion:'latest'}));assert.equal(actions.size,2);
const rows=['a','b','c'].map(id=>({id,title:id,kind:'video',resolution:'640x360',duration:20})),frames=rows.map(v=>({kind:'frame',videoId:v.id,id:'frame-'+v.id}));
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(overrides={}){const calls=[],discarded=[],registered=new Map();let serial=0;const context=vm.createContext({epoch:1,gridPlayIntent:0,singlePlayIntent:0,gallery:{loaded:true,seed:0},state:{search:''},ctx:{mobile:false,modalTop:()=>null},gridInputGuard:{},RHVideoModel:model,object:()=>({}),galleryReady:()=>true,loadGallery:async()=>{},config:()=>({rule:{},gridCount:2,super:false}),send:async(_name,args)=>({queue:args.kind==='gallery'?frames:rows}),prepareQueue:async()=>String(++serial),notice(){},action:(name,_schema,handler)=>registered.set(name,handler),native:async(name,args)=>{calls.push({name,args});if(name==='playlist.discard'){discarded.push(args.ticket);return {removed:true};}if(name==='grid.close')return {closed:true};assert.equal(name,'grid.open');return {opened:true,ticket:args.playlist};},...overrides});vm.runInContext(functions.get('discardPrepared')+'\n'+[...actions.values()].join('\n'),context);return {context,calls,discarded,open:()=>registered.get('grid.open')(),close:(args={})=>registered.get('grid.close')(args)};}

test('a held old Grid metadata read cannot supersede a newer accepted Grid open',async()=>{
 const held=gate(),entered=gate();let count=0;const p=fixture({send:async(_name,args)=>{if(args.kind==='gallery'&&++count===1){entered.resolve();await held.promise;}return {queue:args.kind==='gallery'?frames:rows};}});const old=p.open();await entered.promise;const current=await p.open();held.resolve();assert.equal((await old).stale,true);assert.deepEqual(p.calls.filter(v=>v.name==='grid.open').map(v=>v.args.playlist),[current.ticket]);
});
test('a held old Grid preparation is discarded once instead of opening over its successor',async()=>{
 const held=gate(),entered=gate();let count=0;const p=fixture({prepareQueue:async()=>{if(++count===1){entered.resolve();return held.promise;}return 'new';}}),old=p.open();await entered.promise;await p.open();held.resolve('old');assert.equal((await old).stale,true);assert.deepEqual(p.discarded,['old']);assert.deepEqual(p.calls.filter(v=>v.name==='grid.open').map(v=>v.args.playlist),['new']);
});
test('closing during Grid metadata loading cannot reopen a Grid after its late response',async()=>{
 const held=gate(),entered=gate(),p=fixture({galleryReady:()=>false,loadGallery:async()=>{entered.resolve();await held.promise;}}),old=p.open();await entered.promise;assert.equal((await p.close()).closed,true);held.resolve();assert.equal((await old).stale,true);assert.equal(p.calls.filter(v=>v.name==='grid.open').length,0);
});
test('closing during Grid preparation retires the one old draft without replaying it',async()=>{
 const held=gate(),entered=gate(),p=fixture({prepareQueue:async()=>{entered.resolve();return held.promise;}}),old=p.open();await entered.promise;await p.close();held.resolve('old');assert.equal((await old).stale,true);assert.deepEqual(p.discarded,['old']);assert.equal(p.calls.filter(v=>v.name==='grid.open').length,0);
});
test('Grid open failure releases its draft and preserves the actual error',async()=>{
 const denial=Error('Generated native Grid denial'),discarded=[],p=fixture({native:async(name,args)=>{if(name==='playlist.discard'){discarded.push(args.ticket);return {removed:true};}throw denial;}});await assert.rejects(p.open(),e=>e===denial);assert.deepEqual(discarded,['1']);
});
test('an account change during Grid preparation cannot hand the old ticket to the new account',async()=>{
 const held=gate(),entered=gate(),p=fixture({prepareQueue:async()=>{entered.resolve();return held.promise;}}),old=p.open();await entered.promise;p.context.epoch=2;held.resolve('old-account');const value=await old;assert.equal(value.stale,true);assert.equal(p.calls.filter(v=>v.name==='grid.open').length,0);assert.deepEqual(p.discarded,[],'Do not send old-account disposal to the new account');
});

test('opening Settings while Grid metadata is held prevents a late Grid from covering it',async()=>{
 const held=gate(),entered=gate(),p=fixture({galleryReady:()=>false,loadGallery:async()=>{entered.resolve();await held.promise;}}),old=p.open();await entered.promise;p.context.ctx.modalTop=()=> 'wb-settings';held.resolve();assert.equal((await old).stale,true);assert.equal(p.calls.filter(v=>v.name==='grid.open').length,0);
});
test('a changed foreground panel retires a delayed Grid draft without taking over the new panel',async()=>{
 const held=gate(),entered=gate(),p=fixture({prepareQueue:async()=>{entered.resolve();return held.promise;}}),old=p.open();await entered.promise;p.context.ctx.modalTop=()=> 'wb-settings';held.resolve('old');assert.equal((await old).stale,true);assert.deepEqual(p.discarded,['old']);assert.equal(p.calls.filter(v=>v.name==='grid.open').length,0);
});
test('a host rejecting an unused Grid draft as stale still releases that draft exactly once',async()=>{
 const discarded=[],p=fixture({native:async(name,args)=>{if(name==='playlist.discard'){discarded.push(args.ticket);return {removed:true};}return {stale:true};}});assert.equal((await p.open()).stale,true);assert.deepEqual(discarded,['1']);
});
