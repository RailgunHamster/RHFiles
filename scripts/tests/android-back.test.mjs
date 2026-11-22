import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {parse} from 'acorn';
import {context,deferred,plain,sourceRoot} from '../testing/source.mjs';
const require=createRequire(import.meta.url);
const androidNavStack=require(path.join(sourceRoot,'android/web/js/nav-stack.js'));

function functions(ctx,file,names){
  const source=fs.readFileSync(path.join(sourceRoot,'android/web/js',file),'utf8');
  const tree=parse(source,{ecmaVersion:'latest'}),first=tree.body[0];
  const body=(first.type==='ExpressionStatement'?first.expression:first.declarations[0].init).callee.body.body;
  for(const name of names){const node=body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(node,name);vm.runInContext(source.slice(node.start,node.end),ctx);}
}
function appFixture({screen='home',clipboard=null,host=null,transfer=false}={}){
  const state={route:{screen},stack:[],selected:new Set(),clipboard,task:null},events=[];
  const drawer={hidden:true};const ui={isSheetOpen:()=>false,toast:text=>events.push(text),closeSheet:()=>events.push('close sheet')};
  const normRoot=p=>String(p||'').replace(/\/+$/,'');
  const isRootPath=(a,b)=>!!a&&!!b&&normRoot(a).toLowerCase()===normRoot(b).toLowerCase();
  const ctx=context({state,quitArmedAt:123,window:{},paneHost:()=>host,blocked:()=>!!state.task,
    renderList:()=>events.push('list'),renderShell:()=>events.push('shell'),ui,
    androidNearby:{back:()=>false},androidTrash:{back:()=>false},androidUsage:{back:()=>false},
    androidFeatures:{cancelTransfersOnBack:()=>transfer},androidNavStack,$:()=>drawer,document:{body:{classList:{contains:()=>false}}},
    clearSelection:()=>state.selected.clear(),api:{isVirtual:()=>false},rootFor:()=>({path:'/root'}),isRootPath,sameRoute:androidNavStack.sameRoute,
    go:route=>{state.route=route;events.push('go '+route.screen);},folderRoute:path=>({screen:'folder',path}),fmt:{parentOf:p=>p.slice(0,p.lastIndexOf('/'))||'/'},folderParents:new Map()});
  functions(ctx,'app.js',['cancelPaste','libraryUp','parentRouteFor','up','back']);return {state,events,ctx,ui,back:()=>vm.runInContext('back()',ctx),up:()=>vm.runInContext('up()',ctx)};
}
for(const mode of ['copy','cut'])test('Home Back cancels pending '+mode+' before allowing exit',()=>{
  const f=appFixture({clipboard:{mode,paths:['/root/a']}});f.state.stack.push({screen:'folder',path:'/root'});
  assert.equal(f.back(),true);assert.equal(f.state.clipboard,null);assert.equal(f.ctx.quitArmedAt,0);
  assert.ok(f.events.includes(mode==='cut'?'已取消待移动':'已取消待复制'));
  assert.ok(!f.events.some(e=>e.startsWith('go ')));assert.equal(f.back(),false);
});
test('first Back from storage returns Home without clearing the paste destination workflow',()=>{
  const clipboard={mode:'copy',paths:['/root/a']},f=appFixture({screen:'folder',clipboard});f.state.route.path='/root';
  assert.equal(f.back(),true);assert.equal(f.state.route.screen,'home');assert.equal(f.state.clipboard,clipboard);
  assert.equal(f.back(),true);assert.equal(f.state.clipboard,null);assert.equal(f.back(),false);
});
test('selection and sheets are dismissed before cancelling the pending clipboard',()=>{
  const f=appFixture({clipboard:{mode:'copy',paths:['/root/a']}});f.state.selected.add('/root/b');
  assert.equal(f.back(),true);assert.equal(f.state.selected.size,0);assert.ok(f.state.clipboard);
  let open=true;f.ui.isSheetOpen=()=>open;f.ui.closeSheet=()=>{open=false;};
  assert.equal(f.back(),true);assert.ok(f.state.clipboard);assert.equal(f.back(),true);assert.equal(f.state.clipboard,null);
});
test('Home cancellation is shared across panes and cannot erase a newer clipboard revision',()=>{
  const newer={mode:'copy',paths:['/root/new'],revision:2},calls=[];
  const host={clipboard:(...args)=>{calls.push(args.slice(1));return false;},currentClipboard:()=>newer};
  const f=appFixture({clipboard:{mode:'cut',paths:['/root/old'],revision:1},host});
  assert.equal(f.back(),true);assert.equal(f.state.clipboard,newer);assert.deepEqual(calls,[[null,1]]);
  host.clipboard=()=>true;assert.equal(f.back(),true);assert.equal(f.state.clipboard,null);
});
test('a running transfer gets a cancellation prompt before Home Back touches the pending clipboard',()=>{
  const pending={mode:'copy',paths:['/root/a']},f=appFixture({clipboard:pending,transfer:true});
  assert.equal(f.back(),true);assert.equal(f.state.clipboard,pending);
});
test('Back pops previous history route before falling back to physical parent folders',()=>{
  const f=appFixture({screen:'folder'});f.state.route.path='/root/A/B';
  f.state.stack.push({screen:'favorites'});
  assert.equal(f.back(),true);assert.equal(f.state.route.screen,'favorites');assert.equal(f.state.stack.length,0);
  f.state.route={screen:'folder',path:'/root/A/B'};
  assert.equal(f.back(),true);assert.equal(f.state.route.path,'/root/A');assert.equal(f.state.stack.length,0);
  assert.equal(f.back(),true);assert.equal(f.state.route.path,'/root');assert.equal(f.state.stack.length,0);
  assert.equal(f.back(),true);assert.equal(f.state.route.screen,'home');assert.equal(f.back(),false);
});
test('Up navigates to physical parent directory even when history points elsewhere',()=>{
  const f=appFixture({screen:'folder'});f.state.route.path='/root/A/B';
  f.state.stack.push({screen:'favorites'});
  assert.equal(f.up(),true);assert.equal(f.state.route.path,'/root/A');
});
test('Back exits preview fullscreen before closing the preview sheet',()=>{
  const f=appFixture({screen:'folder'});f.state.route.path='/root';
  let open=true,full=true;
  f.ui.isSheetOpen=()=>open;
  f.ui.closeSheet=()=>{open=false;full=false;};
  f.ui.isPreviewFullscreen=()=>full;
  f.ui.setPreviewFullscreen=v=>{full=!!v;};
  assert.equal(f.back(),true);assert.equal(full,false);assert.equal(open,true);
  assert.equal(f.back(),true);assert.equal(open,false);
});
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function transferFixture({confirm=async()=>true,fetchJobs,initial=[{id:'copy-a',op:'copy',state:'running'}]}={}){
  const calls=[],errors=[],ctx=context({lastJobs:plain(initial),backCancelPending:false,
    active:job=>['queued','scanning','running','paused'].includes(job.state),
    app:{state:{route:{screen:'home'}},error:e=>errors.push(e.message)},ui:{confirm,toast:()=>{}},pollJobs:async()=>{},
    api:{featuresAvailable:()=>true,native:async(command,args)=>{calls.push({command,args:args?plain(args):null});if(command==='jobs')return plain(fetchJobs?fetchJobs():initial);if(command==='job.control')return true;throw Error(command);}}});
  functions(ctx,'features.js',['trackTransfer','cancelTransfersOnBack']);return {ctx,calls,errors,back:()=>vm.runInContext('cancelTransfersOnBack()',ctx)};
}
test('transfer Back cancellation requires confirmation and never cancels unrelated or later tasks',async()=>{
  const prompt=deferred();let jobs=[{id:'a',op:'copy',state:'running'},{id:'b',op:'move',state:'paused'},{id:'d',op:'delete',state:'running'}];
  const f=transferFixture({initial:jobs,fetchJobs:()=>jobs,confirm:()=>prompt.promise});
  assert.equal(f.back(),true);await turn();assert.equal(f.back(),true);assert.equal(f.calls.length,1);
  jobs=[{id:'a',op:'copy',state:'running'},{id:'b',op:'move',state:'completed'},{id:'c',op:'copy',state:'running'},{id:'d',op:'delete',state:'running'}];
  prompt.resolve(true);await turn();await turn();
  assert.deepEqual(f.calls.filter(c=>c.command==='job.control').map(c=>c.args),[{id:'a',action:'cancel'}]);assert.deepEqual(f.errors,[]);
});
test('declining transfer cancellation leaves the task untouched and keeps the app open',async()=>{
  const f=transferFixture({confirm:async()=>false});assert.equal(f.back(),true);await turn();
  assert.ok(!f.calls.some(c=>c.command==='job.control'));assert.equal(f.ctx.backCancelPending,false);
});
test('completed transfers do not intercept exit and delayed status cannot prompt after navigation',async()=>{
  const idle=transferFixture({initial:[{id:'a',op:'copy',state:'completed'}]});assert.equal(idle.back(),false);
  const jobs=deferred(),f=transferFixture({fetchJobs:()=>[]});
  f.ctx.api.native=async()=>jobs.promise;assert.equal(f.back(),true);f.ctx.app.state.route.screen='folder';jobs.resolve([{id:'a',op:'copy',state:'running'}]);await turn();
  assert.equal(f.ctx.backCancelPending,false);assert.ok(!f.calls.some(c=>c.command==='job.control'));
});
test('task status events track active and completed transfer IDs without treating deletion as paste',()=>{
  const f=transferFixture({initial:[]});vm.runInContext("trackTransfer({id:'a',op:'copy',state:'running'});trackTransfer({id:'a',op:'copy',state:'completed'});trackTransfer({id:'d',op:'delete',state:'running'})",f.ctx);
  assert.deepEqual(plain(f.ctx.lastJobs),[{id:'a',op:'copy',state:'completed'}]);assert.equal(f.back(),false);
});
