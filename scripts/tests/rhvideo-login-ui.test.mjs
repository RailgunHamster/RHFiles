import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {parse}from'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest'});let restore,startup,update,nativeCall,finishStartup;const helpers=[];
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&['prepareConnection','connectionReady'].includes(node.id?.name))helpers.push(node);if(node.type==='FunctionDeclaration'&&node.id?.name==='updateConnection')update=node;if(node.type==='VariableDeclarator'&&node.id?.name==='native')nativeCall=node.init;if(node.type==='CallExpression'&&node.callee.name==='action'&&node.arguments[0]?.value==='connection.restore')restore=node.arguments[2];if(node.type==='ArrowFunctionExpression'&&node.async&&source.slice(node.start,node.end).includes('connection=connectionEpoch,value=await native(\'state\')'))startup=node;if(node.type==='ArrowFunctionExpression'&&source.slice(node.start,node.end).includes('libraryReady=true')&&!source.slice(node.start,node.end).includes('const connection=connectionEpoch'))finishStartup=node;for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
walk(ast);assert(restore&&startup,'Use the real registered restore action and startup closure');
const gate=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
function client(native){
  const calls=[],state={connected:false,username:'',favorites:new Set(),loadId:0,kind:'video'},node={textContent:''};
  const scope=vm.createContext({state,connectionEpoch:0,connectionPreparation:null,$:()=>node,native,model:{favoriteSet:v=>new Set(v)},beginConnection:()=>++scope.connectionEpoch,updateConnection:v=>{calls.push(['connection',v]);Object.assign(state,v);},workbench:{reset:async()=>{state.loadId++;calls.push(['reset']);}},load:async()=>calls.push(['load']),snapshot:()=>({...state}),notice:v=>calls.push(['notice',String(v)]),invoke:async name=>calls.push(['invoke',name])});
  assert.equal(helpers.length,2);vm.runInContext(helpers.map(n=>source.slice(n.start,n.end)).join('\n'),scope);
  return {scope,state,calls,node,restore:vm.runInContext('('+source.slice(restore.start,restore.end)+')',scope),startup:vm.runInContext('('+source.slice(startup.start,startup.end)+')',scope)};
}
test('startup requests native restoration, never a renderer-stored bearer or password login',async()=>{
  const names=[],c=client(async name=>{names.push(name);return {connected:false,server:'https://example.invalid',username:'saved'};});await c.startup();assert.deepEqual(names,['state']);assert(c.calls.some(v=>v[0]==='invoke'&&v[1]==='connection.restore'));
});
test('catalog readiness waits for the actual shared account preparation before issuing any metadata request',async()=>{
  const text=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),tree=parse(text,{ecmaVersion:'latest'});let ensure;
  function find(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='ensure')ensure=node;for(const value of Object.values(node))if(Array.isArray(value))value.forEach(find);else if(value&&typeof value==='object')find(value);}find(tree);assert(ensure);
  const pending=gate();let calls=0;const state={connected:true},scope=vm.createContext({state,ctx:{connectionReady:()=>pending.promise},native:()=>{calls++;throw Error('Premature metadata');}}),read=vm.runInContext('('+text.slice(ensure.start,ensure.end)+')',scope)();await Promise.resolve();assert.equal(calls,0);state.connected=false;pending.resolve();await assert.rejects(read,/请先连接/);assert.equal(calls,0);
});
test('a disconnected native counter cannot become an authenticated bridge context',async()=>{
  assert(update&&nativeCall);const calls=[],nodes=new Map(),state={},scope=vm.createContext({state,mobile:true,URL,workbench:{acceptSession(){}},syncSection(){},notice(){},$:id=>{if(!nodes.has(id))nodes.set(id,{classList:{toggle(){}}});return nodes.get(id);},window:{RHVideoNative:{request:async(name,args)=>{calls.push({name,args});return {};}}}});
  const accept=vm.runInContext('('+source.slice(update.start,update.end)+')',scope),native=vm.runInContext('('+source.slice(nativeCall.start,nativeCall.end)+')',scope);
  accept({connected:false,generation:17});await native('exports.uiReady');assert.equal(state.generation,0);assert(!Object.hasOwn(calls.at(-1).args,'_sessionGeneration'),'No active identity means no authenticated context on local readiness calls');
  accept({connected:true,generation:18});await native('exports.uiReady');assert.equal(calls.at(-1).args._sessionGeneration,18,'Do not weaken active-account context protection');
});
test('application readiness includes native startup hooks and cannot hide their visible errors',async()=>{
  assert(finishStartup);const pending=gate(),notices=[],scope=vm.createContext({libraryReady:false,workbench:{ready:()=>pending.promise},notice:e=>notices.push(String(e))});const done=vm.runInContext('('+source.slice(finishStartup.start,finishStartup.end)+')',scope)();assert.equal(scope.libraryReady,false,'Ready cannot precede exports.uiReady and other native hooks');pending.resolve();await done;assert.equal(scope.libraryReady,true);
});
test('a genuine native startup-hook error is visible before readiness instead of leaving a permanent spinner',async()=>{
  const notices=[],scope=vm.createContext({libraryReady:false,workbench:{ready:async()=>{throw Error('Owned native hook failure');}},notice:e=>notices.push(String(e))});await vm.runInContext('('+source.slice(finishStartup.start,finishStartup.end)+')',scope)();assert.equal(scope.libraryReady,true);assert.match(notices[0],/Owned native hook failure/);
});
test('a restored account loads its actual favorites and catalog with no token in renderer arguments',async()=>{
  const names=[],c=client(async(name,args)=>{names.push({name,args});return name==='restore'?{connected:true,username:'demo',generation:3}:[];});await c.restore();assert.equal(c.state.username,'demo');assert.deepEqual(names.map(v=>({...v,args:v.args?{...v.args}:v.args})),[{name:'restore',args:{fresh:false}},{name:'favorites',args:undefined}]);assert.deepEqual(c.calls.map(v=>v[0]),['connection','reset','load']);
});
test('late restore and late initial state cannot overwrite a newer user connection or logout',async()=>{
  for(const step of ['restore','startup']){
    const pending=gate(),c=client(()=>pending.promise),run=c[step]();c.scope.connectionEpoch++;c.state.connected=true;c.state.username='new-account';pending.resolve({connected:false,username:'old-account',loginWarning:'old failure'});await run;
    assert.equal(c.state.username,'new-account');assert.equal(c.state.connected,true);assert.deepEqual(c.calls,[],'No stale update, catalog load, automatic re-restore, or warning');
  }
});
test('already-connected accounts do not restart authentication or clear active media',async()=>{
  const c=client(()=>{throw Error('No auth request expected');});c.state.connected=true;c.state.username='active';await c.restore();assert.deepEqual(c.calls,[]);
});
test('a native transport failure is not left showing an endless restoration',async()=>{
  const c=client(async()=>{throw Error('native reply unavailable');});await assert.rejects(c.restore(),/reply unavailable/);assert.equal(c.state.restoring,false);assert.match(c.state.loginWarning,/reply unavailable/);assert.equal(c.node.textContent,'尚未连接');
});
test('a late failed restoration does not write a warning into a new account',async()=>{
  let reject;const pending=new Promise((_,r)=>reject=r),c=client(()=>pending),old=c.restore();c.scope.connectionEpoch++;c.state.username='new-account';c.state.restoring=false;reject(Error('old reply error'));await old;assert.equal(c.state.loginWarning,undefined);assert.equal(c.state.username,'new-account');
});
test('restoration finishing after the user starts another catalog cannot supersede that read',async()=>{
  const pending=gate(),c=client(async name=>name==='restore'?{connected:true,username:'demo'}:[]);c.scope.workbench.reset=()=>{c.state.loadId++;c.calls.push(['reset']);return pending.promise;};
  const run=c.restore();for(let i=0;i<8&&!c.calls.some(v=>v[0]==='reset');i++)await Promise.resolve();assert(c.calls.some(v=>v[0]==='reset'));c.state.kind='picture';c.state.loadId++;pending.resolve({reset:true});await run;
  assert.equal(c.calls.filter(v=>v[0]==='load').length,0,'The delayed initial load cannot invalidate the user-selected catalog request');assert.equal(c.state.kind,'picture');
});
test('an already connected startup cannot invalidate navigation while its favorites read is pending',async()=>{
  const pending=gate(),c=client(async name=>name==='state'?{connected:true,username:'demo'}:pending.promise),run=c.startup();for(let i=0;i<8&&!c.calls.some(v=>v[0]==='connection');i++)await Promise.resolve();c.state.loadId++;c.state.kind='picture';pending.resolve([]);await run;
  assert.equal(c.calls.filter(v=>v[0]==='load').length,0);assert.equal(c.state.kind,'picture');
});
