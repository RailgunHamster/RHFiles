import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-player.js',import.meta.url),'utf8');
const begin=source.indexOf('function bindSourceRange('),end=source.indexOf("RHFilesUI.listen($('toggle')",begin);
function create(command=(value,target)=>({command:'seek',value:value/1000*target.durationMs}),scope='input'){
  const listeners=new Map(),calls=[],errors=[],locks=[],node={value:'750'},context=vm.createContext({state:{inputId:10,durationMs:20000,queue:{planRevision:30}},$:()=>node,RHFilesUI:{listen(_node,event,callback){listeners.set(event,callback);}},api:{invoke(name,args){calls.push({action:name,...args});return Promise.resolve({});}},control:args=>calls.push(args),error:value=>errors.push(value)});
  vm.runInContext(source.slice(begin,end),context);context.bindSourceRange('seek',command,value=>locks.push(value),undefined,scope);
  return {context,node,calls,errors,locks,fire:(name,args={})=>listeners.get(name)(args)};
}
test('a source seek keeps the original input and duration across a queue change',()=>{
  const s=create();s.fire('pointerdown',{button:0});s.fire('input');s.context.state={inputId:11,durationMs:100000};s.fire('change');
  assert.equal(s.calls[0].expectedInput,10);assert.equal(s.calls[0].value,15000);assert.deepEqual(s.locks,[true,false]);
});
test('a cancelled gesture cannot mutate any input, while a new gesture is usable',()=>{
  const s=create(value=>({command:'volume',value}));s.fire('pointerdown',{button:0});s.fire('input');s.fire('pointercancel');s.context.state={inputId:11,durationMs:100000};s.fire('change');
  assert.equal(s.calls.length,0);assert.match(s.errors[0],/拖动已取消/);s.node.value='37';s.fire('pointerdown',{button:0});s.fire('input');s.fire('change');assert.equal(s.calls[0].expectedInput,11);assert.equal(s.calls[0].value,37);
});
test('a held range key cannot switch targets mid-repeat, but a later key can',()=>{
  const s=create();s.fire('keydown',{code:'ArrowRight',repeat:false});s.fire('input');s.fire('change');s.context.state={inputId:11,durationMs:100000};s.fire('keydown',{code:'ArrowRight',repeat:true});s.fire('input');s.fire('change');
  assert.deepEqual(s.calls.map(c=>c.expectedInput),[10,10]);s.fire('keyup');s.fire('keydown',{code:'ArrowRight',repeat:false});s.fire('input');s.fire('change');assert.equal(s.calls[2].expectedInput,11);
});
test('automation input/change events begin a fresh transaction without a pointer',()=>{
  const s=create();s.fire('input');s.fire('change');s.context.state={inputId:11,durationMs:100000};s.fire('input');s.fire('change');assert.deepEqual(s.calls.map(c=>c.expectedInput),[10,11]);
});
test('standalone public change actions work without retargeting a late trusted commit',()=>{
  const s=create();s.fire('change',{isTrusted:false});s.context.state={inputId:11,durationMs:100000};s.fire('change',{isTrusted:true});s.fire('change',{isTrusted:false});assert.deepEqual(s.calls.map(c=>c.expectedInput),[10,11,11]);
  s.fire('pointerdown',{button:0});s.fire('input');s.fire('change',{isTrusted:true});s.context.state={inputId:12,durationMs:100000};s.fire('change',{isTrusted:true});assert.equal(s.calls.at(-1).expectedInput,11);
});

test('whole-queue drags retain their original plan but are not tied to an individual video',()=>{
  const s=create(value=>({ratio:value/1000}),'queue');s.fire('pointerdown',{button:0});s.fire('input');
  s.context.state={inputId:11,durationMs:100000,queue:{planRevision:30}};s.fire('change');
  assert.equal(s.calls[0].action,'rhvideo.player.seekQueue');assert.equal(s.calls[0].expectedPlanRevision,30);assert.equal(s.calls[0].ratio,.75);assert.equal(s.calls[0].expectedInput,undefined);
  s.fire('pointerdown',{button:0});s.context.state={inputId:12,durationMs:100000,queue:{planRevision:31}};s.fire('change');
  assert.equal(s.calls[1].expectedPlanRevision,30,'a newly opened queue cannot receive an old drag');
  s.fire('pointerdown',{button:0});s.fire('change');assert.equal(s.calls[2].expectedPlanRevision,31);
});

test('a cancelled queue gesture is terminal until a fresh gesture starts',()=>{
  const s=create(value=>({ratio:value/1000}),'queue');s.fire('pointerdown',{button:0});s.fire('input');s.fire('pointercancel');s.fire('change');assert.equal(s.calls.length,0);assert.match(s.errors[0],/拖动已取消/);
  s.fire('pointerdown',{button:0});s.fire('change');assert.equal(s.calls[0].expectedPlanRevision,30);
});
