import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
import {createRequire} from 'node:module';
const C=createRequire(import.meta.url)('../../src/js/rhvideo-task-center.js');
const source=fs.readFileSync(new URL('../../src/js/rhvideo-task-center.js',import.meta.url),'utf8');
let declaration;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='readDetail'){assert(!declaration);declaration=node;}for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
walk(parse(source,{ecmaVersion:'latest',sourceType:'script'}));assert(declaration,'Exercise the actual packaged detail-read function');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};};
function fixture(){
  const reads=[],painted=[],errors=[],busy=[];let resumed=0;
  const ctx=vm.createContext({selected:'video:owned',generation:1,detailTicket:0,detailLoading:false,detail:null,detailError:'',connected:true,
    config:{queue:'default',view:'running',q:'',days:7,status:'all',pageNumber:1},contextKey:C.contextKey,
    nodes:{detail:{setAttribute:(key,value)=>busy.push([key,value])}},current:()=>ctx.connected,detailProblem:error=>errors.push(error.message),
    ctx:{remote:(name,args)=>{assert.equal(name,'tasks.detail');const item=deferred();reads.push({name,args:JSON.parse(JSON.stringify(args)),...item});return item.promise;},presentation:{paint:(_node,value,kind)=>painted.push({id:value.id,kind})},detailFooter:()=>{},refreshed:()=>resumed++}});
  vm.runInContext(source.slice(declaration.start,declaration.end),ctx);
  return {ctx,reads,painted,errors,busy,resumed:()=>resumed};
}
for(const manual of [true,false])test(`only a successful explicit manual read resets the shared loop: manual=${manual}`,async()=>{
  const f=fixture(),pending=f.ctx.readDetail(manual);assert(f.ctx.detailLoading);f.reads[0].resolve({id:'video:owned',status:'processing'});await pending;
  assert.equal(f.resumed(),manual?1:0);assert.equal(f.painted.length,1);assert.equal(f.ctx.detailLoading,false);assert.deepEqual(f.reads[0].args,{params:{queue:'default',entry:'video:owned'}});
});
test('manual read failure or mismatched receipt cannot reset the failure budget',async()=>{
  for(const mismatch of [true,false]){const f=fixture(),pending=f.ctx.readDetail(true);if(mismatch)f.reads[0].resolve({id:'video:other'});else f.reads[0].reject(Error('offline'));await assert.rejects(pending);assert.equal(f.resumed(),0);assert.equal(f.painted.length,0);assert.equal(f.errors.length,1);assert.equal(f.ctx.detailLoading,false);}
});
for(const change of ['closed','generation','selection','filter'])test('a late manual read cannot restart another task context after '+change,async()=>{
  const f=fixture(),pending=f.ctx.readDetail(true);if(change==='closed')f.ctx.connected=false;if(change==='generation')f.ctx.generation++;if(change==='selection')f.ctx.selected='video:other';if(change==='filter')f.ctx.config.view='history';
  f.reads[0].resolve({id:'video:owned'});assert.equal((await pending).stale,true);assert.equal(f.resumed(),0);assert.equal(f.painted.length,0);assert.equal(f.errors.length,0);
});
test('an older read cannot finish a newer in-flight read or reset its loop',async()=>{
  const f=fixture(),old=f.ctx.readDetail(true),current=f.ctx.readDetail(true);f.reads[0].resolve({id:'video:owned'});assert.equal((await old).stale,true);assert.equal(f.ctx.detailLoading,true);assert.equal(f.resumed(),0);
  f.reads[1].resolve({id:'video:owned'});await current;assert.equal(f.ctx.detailLoading,false);assert.equal(f.resumed(),1);assert.equal(f.painted.length,1);
});
