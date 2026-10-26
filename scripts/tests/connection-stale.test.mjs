import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {parse} from 'acorn';import {createRequire} from 'node:module';
import {sourceRoot} from '../testing/source.mjs';
const source=fs.readFileSync(path.join(sourceRoot,'android/web/js/app.js'),'utf8');
const body=parse(source,{ecmaVersion:'latest'}).body[0].expression.callee.body.body;
const declarations=body.filter(n=>n.type==='FunctionDeclaration'&&['refreshCurrent','task'].includes(n.id.name)).map(n=>source.slice(n.start,n.end)).join('\n');
test('failed refresh preserves list and scroll, blocks mutations, and clears stale state after recovery',async()=>{
  const entries=[{path:'remote://qa/Files/a.txt',name:'a.txt'}],state={route:{screen:'folder',path:'remote://qa/Files'},entries,selected:new Set(),listing:{entries},busy:false};
  let fail=true,mutations=0,redraws=0;const status={textContent:'1 项'},messages=[];
  const ctx=vm.createContext({state,refreshPromise:null,refreshAgain:false,navigationId:1,api:{listDir:async()=>{if(fail)throw Error('Timed out');return {entries}}},fmt:{sameEntries:()=>true},error:m=>messages.push(m),ui:{toast:m=>messages.push(m)},renderShell(){},currentEntries:()=>state.entries,$:()=>status,blocked:()=>false,paneHost:()=>null,renderList:()=>redraws++});
  vm.runInContext(declarations,ctx);await vm.runInContext('refreshCurrent()',ctx);
  assert.equal(state.entries,entries);assert.equal(redraws,0);assert.match(state.staleError,/Timed out/);
  ctx.work=async()=>mutations++;await vm.runInContext("task('delete',work)",ctx);assert.equal(mutations,0);assert.ok(messages.some(m=>m.includes('请先刷新')));
  fail=false;await vm.runInContext('refreshCurrent()',ctx);assert.equal(state.staleError,null);assert.equal(redraws,0);assert.equal(status.textContent,'1 项');
  await vm.runInContext("task('delete',work)",ctx);assert.equal(mutations,1);
});
test('automation exposes stale state and rejects file changes with a structured error',()=>{
  class ActionError extends Error{constructor(code,message){super(message);this.code=code;}}
  const handlers={},state={route:{screen:'folder'},entries:[{path:'/a'}],selected:new Set(['/a']),staleError:'timeout'};
  const require=createRequire(import.meta.url),fmt=require(path.join(sourceRoot,'android/web/js/format.js'));
  const ctx=vm.createContext({fmt,RHFilesAutomationCore:{ActionError},window:{RHFilesAPI:{register:(name,handler)=>handlers[name]=handler,provideState(){}}},state,app:{state,ready:()=>true},workbench:{id:'main'},api:{automationAvailable:()=>false},deviceGroupView:{register(){}}});
  vm.runInContext(fs.readFileSync(path.join(sourceRoot,'android/web/js/automation-android.js'),'utf8')+'\nandroidAutomation.install(app);',ctx);
  assert.equal(handlers['navigation.state']().stale,true);
  for(const name of ['files.paste','files.delete','files.rename'])assert.throws(()=>handlers[name]({path:'/a'}),error=>error.code==='STALE_LISTING');
});
test('Android opaque custom URLs still resolve real network profile IDs',async()=>{
  const require=createRequire(import.meta.url),mobileList=require(path.join(sourceRoot,'android/web/js/list-model.js'));
  const text=fs.readFileSync(path.join(sourceRoot,'android/web/js/features.js'),'utf8');
  const fn=parse(text,{ecmaVersion:'latest'}).body[0].declarations[0].init.callee.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='beforeRemoteNavigate');assert.ok(fn);
  const calls=[],id='a41e0350-6644-48d2-87a5-409aa184502f';
  const ctx=vm.createContext({mobileList,URL:class{constructor(){this.hostname='';}},api:{native:async(command,args)=>{calls.push({command,args});assert.equal(args.id,id);return {needsPassword:false};}}});
  vm.runInContext(text.slice(fn.start,fn.end),ctx);
  for(const p of [`remote://${id}/`,`remote://${id}/Files/${encodeURIComponent('中文')}`,`remote://${id.toUpperCase()}/`]){ctx.path=p;assert.equal(await vm.runInContext('beforeRemoteNavigate(path)',ctx),true);}
  assert.equal(calls.length,3);
  for(const p of [`remote://${id}@evil/`,`remote://${id}:445/`,`remote://${id}/?token=x`]){ctx.path=p;await assert.rejects(vm.runInContext('beforeRemoteNavigate(path)',ctx));}
  assert.equal(calls.length,3);
});
