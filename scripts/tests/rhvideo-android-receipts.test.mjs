import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
import core from '../../src/js/automation-core.js';
const read=file=>fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const client=read('src/js/rhvideo-client.js');
function backHandler(extra={}){
  const script=parse(client,{ecmaVersion:'latest',sourceType:'script'}).body[0].expression.callee.body.body;
  const action=script.find(node=>node.type==='ExpressionStatement'&&node.expression.type==='CallExpression'&&node.expression.callee.name==='action'&&node.expression.arguments[0]?.value==='back').expression;
  const handler=action.arguments[2];return vm.runInNewContext('('+client.slice(handler.start,handler.end)+')',{workbench:null,modalTop:()=>undefined,mobile:true,native:()=>true,...extra});
}
function hostRegistry(native){
  const actions=core.create(),context={window:{RHFilesAPI:actions},RHFilesAutomationCore:core,api:{native}};
  const android=vm.runInNewContext(read('android/web/js/automation-android.js')+';androidAutomation',context);
  android.host({frames:()=>[],active:()=>0,layout:()=>({mode:'single'}),setLayout:()=>{}});return actions;
}
const rpc=(actions,method,params)=>actions.rpc({jsonrpc:'2.0',id:'test',method,params});

function binding(invoke,notice){
  let callback;const script=parse(client,{ecmaVersion:'latest',sourceType:'script'}).body[0].expression.callee.body.body;
  const node=script.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='bind');assert(node);
  const observer=script.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='observeAction');assert(observer);
  const bind=vm.runInNewContext(client.slice(observer.start,observer.end)+';('+client.slice(node.start,node.end)+')',{RHFilesUI:{listen:(_node,_event,handler)=>{callback=handler;}},$:()=>({dataset:{}}),invoke,notice});
  bind('library-back','click','back');return ()=>callback({});
}
test('the actual button binding returns its unsettled action, not an early UI completion',async()=>{
  let finish,done=false;const pending=new Promise(resolve=>finish=resolve),click=binding(()=>pending,()=>assert.fail('No error expected'));
  const result=click();assert.equal(typeof result?.then,'function');result.then(()=>done=true);
  await new Promise(setImmediate);assert.equal(done,false);finish(true);assert.equal(await result,true);
});
test('the actual button still shows its error but leaves it observable to ui.invoke',async()=>{
  const error=Error('owned close failure'),notices=[],click=binding(()=>Promise.reject(error),value=>notices.push(value));
  await assert.rejects(click(),value=>value===error);assert.deepEqual(notices,[error]);
});

test('the actual mobile Back handler forwards its run identity once, and survives through the real host lookup provider',async()=>{
  let sent=0,run,receipt;
  const producer=core.create();producer.register('rhvideo.back',backHandler({native:(action,args)=>{assert.equal(action,'close');sent++;run=args._automationRun;return new Promise(()=>{});}}));
  const started=producer.run('rhvideo.back',{}, {key:'close-once'});
  assert.equal(started.state,'running');assert.equal(sent,1);assert.equal(run.id,started.id);assert.equal(run.key,'close-once');
  const survivor=hostRegistry(async(command,query)=>{assert.equal(command,'automation.receipt');assert.deepEqual(JSON.parse(JSON.stringify(query)),{key:'close-once'});return receipt??null;});
  assert.equal((await rpc(survivor,'runs.lookup',{key:'close-once'})).error.data.code,'RUN_NOT_FOUND');
  receipt={id:run.id,action:run.action,state:'running',startedAt:run.startedAt,finishedAt:null};
  assert.equal((await rpc(survivor,'runs.lookup',{key:'close-once'})).result.state,'running');
  receipt={...receipt,state:'succeeded',finishedAt:run.startedAt+10,result:true};
  assert.equal((await rpc(survivor,'runs.lookup',{key:'close-once'})).result.result,true);assert.equal(sent,1);
});

test('Back inside a library panel cannot prematurely retire the library or create a native close receipt',async()=>{
  let local=0;const run={id:'run:1'};
  assert.deepEqual(JSON.parse(JSON.stringify(await backHandler({workbench:{back:()=>{local++;return true;}},native:()=>assert.fail('Do not close a library under its panel')})({},run))),{closed:true});
  assert.equal(local,1);
  let invoked;
  await backHandler({modalTop:()=> 'image-dialog',invoke:name=>{invoked=name;return {closed:true};},native:()=>assert.fail('Close only the child image')})({},run);
  assert.equal(invoked,'image.close');
});

test('unknown or failed Android process receipts remain errors, without any close replay',async()=>{
  const failed={id:'gone:1',action:'rhvideo.back',state:'failed',startedAt:1,finishedAt:2,error:{code:'ACTION_FAILED',message:'Unconfirmed close'}};
  let reads=0;const survivor=hostRegistry(async()=>{reads++;return failed;});
  const result=await rpc(survivor,'runs.lookup',{key:'old'});assert.equal(result.result.state,'failed');assert.equal(result.result.error.code,'ACTION_FAILED');assert.equal(reads,1);
  assert.equal(survivor.list().some(action=>action.id==='rhvideo.back'),false,'A survivor cannot redispatch the vanished library action');
});

test('native close completion follows actual cleanup and destruction; queries stay off the main thread',()=>{
  const activity=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/RhVideoActivity.kt');
  const close=activity.slice(activity.indexOf('"close"->{'),activity.indexOf('"play"->{',activity.indexOf('"close"->{')));
  assert.match(close,/RhVideoCloseReceipts\.begin/);assert.match(close,/closeReceipt=admitted\.ticket;finish\(\)/);assert.match(close,/return@execute/);
  assert.doesNotMatch(close,/\.finish\(true\)|Thread\.sleep|\.get\(/);
  const destroy=activity.slice(activity.indexOf('override fun onDestroy()'));
  assert(destroy.indexOf('web.destroy()')<destroy.indexOf('super.onDestroy()'));assert(destroy.indexOf('super.onDestroy()')<destroy.indexOf('receipt?.finish('));
  assert.match(destroy,/receipt\?\.finish\(cleaned&&destroyed&&isFinishing&&!isChangingConfigurations\)/);
  const main=read('android/gradle/app/src/main/java/com/railgunhamster/rhfiles/MainActivity.kt');
  const ui=main.match(/val uiCommands=setOf\(([^\n]+)\)/)?.[1];assert(ui);assert(!ui.includes('automation.receipt'));
  assert.match(main,/"automation.receipt" -> \{check\(NativeAutomation\.enabled\(this\)\)/);
  assert.match(activity,/action=="automation.receipt"[^]*?RhVideoCloseReceipts\.read\(args\)[^]*?return@execute[^]*?client\.validateContext/);
  assert.match(client,/api\.provideRunLookup\(query=>mobile\?window\.RHVideoNative\.request\('automation.receipt',query\)/);
  const probe=read('android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java');
  assert.match(probe,/destroyedActivities\.contains\(producer\)&&producer\.isDestroyed\(\)/);
  assert.match(probe,/SystemClock\.elapsedRealtime\(\)-started<=5000/);
  assert.match(probe,/old completed request cannot close a newly opened library/);
});
