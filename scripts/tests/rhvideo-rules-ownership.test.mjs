import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import {parse} from 'acorn';
const require=createRequire(import.meta.url),T=require('../../src/js/rhvideo-tags.js'),text=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),functions=new Map();let apply;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration')functions.set(node.id.name,node);if(node.type==='CallExpression'&&node.callee.name==='action'&&node.arguments[0]?.value==='rules.apply')apply=node.arguments[2];for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}walk(parse(text,{ecmaVersion:'latest'}));
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function controller(){
 let next=0;const timers=new Map(),calls=[],scope=vm.createContext({RHTagFilter:T,ruleProcessId:'owned-process',ruleRefreshTimer:0,ruleRefreshWaiter:null,ruleEditIntent:0,ruleApplyIntent:0,epoch:1,account:'server\npreview',accountGeneration:1,state:{connected:true,generation:1,total:9,offset:8,loadId:0},prefs:{rule:{}},gallery:{offset:2},rulesEditor:{changed:()=>calls.push('paint'),error:e=>calls.push('error:'+e)},config:()=>scope.prefs,ensure:async()=>scope.epoch,save:()=>calls.push('save'),invalidateGallery:()=>calls.push('invalidate'),galleryVisible:()=>false,warmGallery:()=>calls.push('warm'),load:async()=>{calls.push('load');scope.state.total=3;return {total:3,error:''};},setTimeout:fn=>{const id=++next;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 for(const name of ['ruleIdentity','checkRuleOwner','cancelRuleRefresh','publishRule','tagCatalog']){const node=functions.get(name);vm.runInContext(text.slice(node.start,node.end),scope);}const handler=vm.runInContext('('+text.slice(apply.start,apply.end)+')',scope);
 return {scope,calls,timers,apply:handler,async flush(){for(let n=0;n<10&&!timers.size;n++)await Promise.resolve();const entries=[...timers];timers.clear();for(const [,fn]of entries)await fn();}};
}
test('an old asynchronous rule application cannot publish to the next account or flash its error',async()=>{
 const c=controller(),pending=gate();c.scope.ensure=()=>pending.promise;const old=c.apply({rule:{include:['old']}});c.scope.state.generation=2;c.scope.accountGeneration=2;c.scope.account='new-server\npreview';c.scope.epoch++;c.scope.prefs={rule:{include:['new']}};pending.resolve(2);await assert.rejects(old,/旧规则未应用/);assert.deepEqual(c.scope.prefs.rule,{include:['new']});assert.deepEqual(c.calls,[]);
});
test('two rapid rule edits publish immediately, coalesce reads and resolve obsolete intent without replay',async()=>{
 const c=controller(),first=c.scope.publishRule({include:['first']}),second=c.scope.publishRule({include:['second']});assert.equal(c.scope.prefs.rule.include[0],'second');assert.equal((await first).stale,true);assert.equal(c.timers.size,1);await c.flush();assert.equal((await second).total,3);assert.equal(c.calls.filter(v=>v==='load').length,1);assert.equal(c.scope.state.loadId,2);
});
test('an in-flight old filter render never replaces a newer rule or resolves as the latest intent',async()=>{
 const c=controller(),pending=gate();c.scope.load=()=>pending.promise;const first=c.scope.publishRule({include:['first']}),running=c.flush();for(let n=0;n<8;n++)await Promise.resolve();const second=c.scope.publishRule({include:['second']});pending.resolve({total:9});await running;assert.equal((await first).stale,true);assert.equal(c.scope.prefs.rule.include[0],'second');await c.flush();await second;
});
test('a delayed full-tree script request cannot overwrite a more recent click edit',async()=>{
 const c=controller(),pending=gate();c.scope.ensure=()=>pending.promise;const old=c.apply({rule:{include:['old-script']}}),clicked=c.scope.publishRule({include:['new-click']});pending.resolve(1);await assert.rejects(old,/旧规则未应用/);await c.flush();await clicked;assert.equal(c.scope.prefs.rule.include[0],'new-click');
});
test('invalid rule structure leaves the current filter intact and reports a modal-visible error',async()=>{
 const c=controller();await assert.rejects(c.apply({rule:{include:'not-a-list'}}),/标签必须/);assert.deepEqual(c.scope.prefs.rule,{});assert.equal(c.calls.filter(v=>v.startsWith('error:')).length,1);assert.equal(c.calls.includes('save'),false);
});
test('closing an account resolves queued read intentions without starting new work',async()=>{
 const c=controller(),waiting=c.scope.publishRule({include:['old']});c.scope.cancelRuleRefresh();assert.equal((await waiting).stale,true);assert.equal(c.timers.size,0);await c.flush();assert.equal(c.calls.includes('load'),false);
});
test('a late metadata prerequisite from a closed picker cannot supersede a newer worker tag request',async()=>{
 const c=controller(),pending=gate(),sent=[];let current=true;c.scope.catalogRevision=1;c.scope.rawCatalog=kind=>kind==='video'?pending.promise:Promise.resolve();c.scope.send=async(_action,args)=>{sent.push(args.source);return {rows:[],total:0};};
 const old=c.scope.tagCatalog({source:'video'},()=>current);for(let n=0;n<8;n++)await Promise.resolve();current=false;await c.scope.tagCatalog({source:'picture'},()=>true);pending.resolve();assert.equal((await old).stale,true);assert.deepEqual(sent,['picture'],'Obsolete work must not get a newer worker cancellation ID');
});
