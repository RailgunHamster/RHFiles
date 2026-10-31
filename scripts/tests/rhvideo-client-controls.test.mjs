import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';

const source=fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url),'utf8');
const handlers=new Map(),functions=new Map(),variables=new Map();
const text=node=>source.slice(node.start,node.end);
function walk(node){
 if(!node||typeof node!=='object')return;
 if(node.type==='FunctionDeclaration')functions.set(node.id.name,text(node));
 if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.init)variables.set(node.id.name,text(node.init));
 if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&node.left.object.name==='window'&&node.left.property.name==='RHVideoBack')handlers.set('mobile.back',text(node.right));
 if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.object.name==='RHFilesUI'&&node.callee.property.name==='listen'){
  const site=node.arguments[4];let prefix=site;
  while(prefix?.type==='BinaryExpression'&&prefix.operator==='+')prefix=prefix.left;
  const name=site?.type==='Literal'?site.value:prefix?.value==='rhvideo.nav.'?'rhvideo.nav.*':prefix?.value==='rhvideo.'?'rhvideo.dialog.cancel':null;
  if(name)handlers.set(name,node.arguments[2].type==='Identifier'?node.arguments[2].name:text(node.arguments[2]));
 }
 for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else walk(value);
}
walk(parse(source,{ecmaVersion:'latest'}));
function handler(site,invoke,options={}){
 assert(handlers.has(site),'Actual registered handler '+site);
 const notices=[],context=vm.createContext({
  invoke,notice:error=>notices.push(error),Promise,
  media:{id:'generated-picture',kind:options.kind||'picture'},id:'generated-video',frame:{seconds:2},name:'image.close',
  button:{dataset:{kind:'picture'}},modalTop:()=>options.modal??'image-dialog',
  workbench:options.workbench===false?null:{selectCard:()=>null,canPlayImage:()=>options.playable!==false},
  imageWheelAt:-Infinity,performance:{now:()=>1000},imageTouch:{x:100,y:20},
 });
 if(functions.has('observeAction'))vm.runInContext(functions.get('observeAction'),context);
 vm.runInContext('const open='+variables.get('open'),context);
 const fn=vm.runInContext('('+handlers.get(site)+')',context);
 const event={key:options.key||'Home',deltaY:1,changedTouches:[{clientX:0,clientY:20}],target:{matches:()=>false,isContentEditable:false},preventDefault(){}};
 return {notices,fire:()=>fn(event)};
}
const cases=[
 ['rhvideo.card.open','media.open'],['rhvideo.card.title','media.open'],
 ['rhvideo.card.secondary','media.open'],['rhvideo.card.secondary','timeline.open',{kind:'video'}],
 ['rhvideo.card.favorite','favorite.toggle'],['rhvideo.timeline.frame','timeline.play'],
 ['rhvideo.nav.*','category'],['rhvideo.image.playVideo','image.playVideo'],
 ['rhvideo.dialog.cancel','image.close'],['rhvideo.image.keyboard','image.seek'],
 ['rhvideo.image.keyboard','image.step',{key:'ArrowLeft',workbench:false}],
 ['rhvideo.image.wheel','image.step'],['rhvideo.image.touchend','image.step'],['mobile.back','back'],
];
for(const [site,action,options]of cases){
 test(site+' '+action+' preserves the original failed action without replay',async()=>{
  const failure=Error('Generated client operation denied');let calls=0;
  const ui=handler(site,(name)=>{assert.equal(name,action);calls++;return Promise.reject(failure);},options);
  await assert.rejects(Promise.resolve(ui.fire()),error=>error===failure);
  assert.equal(calls,1);assert.deepEqual(ui.notices,[failure]);
 });
 test(site+' '+action+' waits for the original action and returns its exact result',async()=>{
  let release,calls=0;const pending=new Promise(resolve=>release=resolve),value={completed:true};
  const ui=handler(site,(name)=>{assert.equal(name,action);calls++;return pending;},options),result=ui.fire();
  assert.equal(result,pending,'UI must return the action, not undefined or its successful error observer');
  release(value);assert.equal(await result,value);assert.equal(calls,1);assert.deepEqual(ui.notices,[]);
 });
}
test('inactive image controls remain no-ops rather than starting hidden actions',()=>{
 for(const [site,options]of [['rhvideo.image.playVideo',{playable:false}],['rhvideo.image.keyboard',{modal:'reader-dialog'}],['rhvideo.image.wheel',{modal:'reader-dialog'}],['rhvideo.image.touchend',{modal:'reader-dialog'}]]){
  const ui=handler(site,()=>assert.fail('A guarded control cannot issue an action'),options);assert.equal(ui.fire(),undefined);
 }
});
test('image wheel admission keeps its existing throttle instead of replaying queued input',async()=>{
 let release,calls=0;const pending=new Promise(resolve=>release=resolve),ui=handler('rhvideo.image.wheel',()=>{calls++;return pending;});
 const first=ui.fire();assert.equal(ui.fire(),undefined);assert.equal(calls,1);release({completed:true});await first;
});
