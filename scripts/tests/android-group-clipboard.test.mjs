import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
import {context,sourceRoot} from '../testing/source.mjs';

function declaration(ctx,file,name){
  const source=fs.readFileSync(path.join(sourceRoot,'android/web/js',file),'utf8');
  const first=parse(source,{ecmaVersion:'latest'}).body[0];
  const body=(first.type==='ExpressionStatement'?first.expression:first.declarations[0].init).callee.body.body;
  const node=body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(node,name);
  vm.runInContext(source.slice(node.start,node.end),ctx);
}
for(const mode of ['async','webview-denied','unavailable'])test('Android group settings uses the shared full-text clipboard adapter: '+mode,async()=>{
  const text='rhfiles-group-request:v1:'+('公开证明'.repeat(9000)),nodes=new Map(),events=[];let area,mounted;
  const document={documentElement:{dataset:{theme:'light'}},body:{appendChild:n=>{area=n;events.push('append');},removeChild:n=>{assert.equal(n,area);events.push('remove');}},
    createElement:()=>({style:{},setAttribute(){},select(){events.push('select');}}),execCommand:command=>{assert.equal(command,'copy');assert.equal(area.value,text);events.push('legacy');return mode!=='unavailable';}};
  const clipboard={writeText:async value=>{assert.equal(value,text);events.push('async');if(mode!=='async')throw Error('Write permission denied.');}};
  const ctx=context({document,navigator:{clipboard},ui:{},state:{route:{section:'storage'}},localStorage:{getItem:()=>null},
    $:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},setSettingsSection(){},settingsSection:'storage',
    api:{permissionStatus:async()=>({manageExternalStorage:true}),indexStatus:async()=>({indexing:false,entryCount:0}),appInfo:async()=>({version:'0.1.38'}),updatesAvailable:()=>false,syncAvailable:()=>false},
    fmt:{count:String},refreshAutomationSetting:async()=>{},error:err=>{throw err;},deviceGroupView:{mount:async(_root,options)=>{mounted=options;}}});
  declaration(ctx,'ui.js','copyText');ctx.ui.copyText=vm.runInContext('copyText',ctx);
  declaration(ctx,'app.js','refreshSettings');await vm.runInContext('refreshSettings()',ctx);
  assert.equal(mounted.copy,ctx.ui.copyText,'Use the platform adapter instead of the denied raw iframe Clipboard API');
  if(mode==='unavailable')await assert.rejects(mounted.copy(text),/clipboard is unavailable/);
  else assert.equal(await mounted.copy(text),true);
  assert.deepEqual(events,mode==='async'?['async']:['async','append','select','legacy','remove']);
});
