import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
import {sourceRoot} from '../testing/source.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

function fixture(jobs){
  const source=fs.readFileSync(path.join(sourceRoot,'android/web/js/features.js'),'utf8');
  const declarations=parse(source,{ecmaVersion:'latest'}).body[0].declarations[0].init.callee.body.body;
  const fn=declarations.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='pollJobs');
  const chip={hidden:true,textContent:''},calls=[],ctx=vm.createContext({
    api:{tasksAvailable:()=>false,featuresAvailable:()=>true,native:async command=>{calls.push(command);return structuredClone(jobs);},indexStatus:async()=>({indexing:true})},
    app:{state:{route:{screen:'home'}}},lastJobs:[],active:j=>['queued','scanning','running','paused'].includes(j.state),
    states:{running:'进行中'},fmt:{size:()=>''},$:()=>chip,refreshedJobs:new Set(),paintJobs:()=>{},androidTasks:{},
  });
  vm.runInContext(source.slice(fn.start,fn.end),ctx);
  return {chip,calls,poll:()=>vm.runInContext('pollJobs()',ctx)};
}
test('completed file tasks never leave a needs-attention banner',async()=>{
  const f=fixture([{id:'done',state:'completed',failures:[],files:0,done:0}]);
  await f.poll();await f.poll();assert.equal(f.chip.hidden,true);
  assert.deepEqual(f.calls,['jobs','jobs']);
});
test('historical failures stay in history without creating a pending-work banner',async()=>{
  const jobs=[{id:'permission-denied',state:'failed'},{id:'old-done',state:'completed'}],f=fixture(jobs);
  await f.poll();assert.equal(f.chip.hidden,true);assert.equal(f.chip.textContent,'');assert.equal(jobs.length,2);
});
test('failures do not mask active tasks and running-to-failed hides the active banner',async()=>{
  const jobs=[{id:'old',state:'failed'},{id:'active',state:'running'}],f=fixture(jobs);
  await f.poll();assert.equal(f.chip.hidden,false);assert.match(f.chip.textContent,/文件任务 1/);
  jobs[1].state='failed';await f.poll();assert.equal(f.chip.hidden,true);assert.equal(f.chip.textContent,'');
});
test('failed and interrupted records only show results, with no replay/cancel/acknowledge buttons',()=>{
  const source=fs.readFileSync(path.join(sourceRoot,'android/web/js/features.js'),'utf8');
  const body=parse(source,{ecmaVersion:'latest'}).body[0].declarations[0].init.callee.body.body;
  const fn=body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='paintJobs');
  const node=(tag,cls,text)=>({tag,cls,text,children:[],append(...n){this.children.push(...n)},replaceChildren(...n){this.children=n}});
  const target=node('section');target.parentElement={scrollTop:123};
  const buttons=[],jobs=['failed','interrupted'].map((state,i)=>({id:String(i),state,op:'move',started:1,finished:2,files:2,done:1,bytes:5,total:10,current:'source',message:'HTTP 403',failures:[],outputs:['published-output']}));
  const context=vm.createContext({lastJobs:jobs,names:{move:'移动'},states:{failed:'失败',interrupted:'中断'},
    ui:{el:node},document:{createElement:node},fmt:require(path.join(sourceRoot,'android/web/js/format.js')),
    fileTaskGuidance:require(path.join(sourceRoot,'android/web/js/task-guidance.js')),
    active:j=>['running','queued','scanning','paused'].includes(j.state),
    button:label=>{buttons.push(label);return node('button','',label)},
    notice:(parent,text)=>parent.append(node('p','',text)),target,
  });
  vm.runInContext(source.slice(fn.start,fn.end)+'\npaintJobs(target)',context);
  assert.deepEqual(buttons,[]);assert.equal(target.parentElement.scrollTop,123);
  const text=JSON.stringify(target.children);assert.match(text,/HTTP 403/);assert.match(text,/published-output/);assert.equal(jobs.length,2);
});
