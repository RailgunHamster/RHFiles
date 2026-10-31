import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
const wb=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),client=fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url),'utf8');
function functions(source){const found=new Map();function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration')found.set(n.id.name,source.slice(n.start,n.end));for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else walk(v);}walk(parse(source,{ecmaVersion:'latest'}));return found;}
const methods=functions(wb),ui=functions(client),deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};},settle=()=>new Promise(setImmediate);
test('initial picture loading is immediately closable and completion does not raise it over a newer modal',async()=>{
 const pending=deferred();let opened=0,top='catalog';const context=vm.createContext({epoch:1,singlePlayIntent:0,imageSession:null,state:{kind:'picture'},I:{key:m=>m.id},criteria:v=>v,query:async()=>({located:{index:0},total:1}),crypto:{randomUUID:()=> 'generated-preview'},stepImage:()=>pending.promise,ctx:{openDialog(){opened++;top='image';}}});
 vm.runInContext(methods.get('image'),context);const running=context.image({id:'p',kind:'picture'});await settle();assert.equal(opened,1,'Show loading before decoding so Back/Close are usable');top='settings';pending.resolve({index:0});await running;assert.equal(top,'settings');assert.equal(opened,1,'Completion must not re-raise the old modal');
});
function fixture(){
 const decodes=[],saved=[],session={args:{kind:'gallery'},index:0,total:4,current:{kind:'frame',id:'f0',path:'/storage/0.webp'}},context=vm.createContext({imageSession:session,imageToken:0,gallery:{limit:36},prefs:{},I:{key:m=>m.id,galleryKey:m=>m.id},RHVideoModel:{playback:{step:(i,d,n)=>(i+d+n)%n}},send:async(_name,args)=>({items:[{kind:'frame',id:'f'+args.offset,path:'/storage/'+args.offset+'.webp'}]}),native:async(_name,args)=>args.paths,refreshImage(){},save(){saved.push(session.index);},ctx:{resetImageZoom(){},cancelImageDecode(){},prepareImage(media,current){const pending=deferred();decodes.push({media,current,...pending});return pending.promise;}}});
 vm.runInContext(methods.get('stepImage'),context);return {context,session,decodes,saved};
}
test('picture navigation cannot commit metadata or report ready before the actual image decodes',async()=>{
 const f=fixture(),pending=f.context.stepImage(1);await settle();assert.equal(f.decodes.length,1,'Actual decode must be awaited');assert.equal(f.session.loading,true);assert.equal(f.session.index,0);assert.equal(f.session.current.id,'f0');assert.deepEqual(f.saved,[]);f.decodes[0].resolve({});await pending;assert.equal(f.session.loading,false);assert.equal(f.session.index,1);assert.equal(f.session.current.id,'f1');assert.deepEqual(f.saved,[1]);
});
test('decode failure rejects the action, preserves the last good target and exposes a stable error',async()=>{
 const f=fixture(),pending=f.context.stepImage(1);await settle();assert.equal(f.decodes.length,1);f.decodes[0].reject(Error('Generated invalid image'));await assert.rejects(pending,/invalid image/);assert.equal(f.session.loading,false);assert.equal(f.session.index,0);assert.equal(f.session.current.id,'f0');assert.match(f.session.error,/invalid image/);assert.deepEqual(f.saved,[]);
});
test('a superseded or closed decode cannot commit, overwrite an error or clear the current loading state',async()=>{
 const f=fixture(),first=f.context.stepImage(1);await settle();assert.equal(f.decodes.length,1);const second=f.context.stepImage(1);await settle();assert.equal(f.decodes.length,2);assert.equal(f.decodes[0].current(),false);f.decodes[0].reject(Error('Retired decode'));assert.equal((await first).stale,true);assert.equal(f.session.loading,true);assert.equal(f.session.error,'');f.decodes[1].resolve({});await second;assert.equal(f.session.index,2);
 const closed=f.context.stepImage(1);await settle();f.context.imageSession=null;f.context.imageToken++;f.decodes[2].reject(Error('Closed image'));assert.equal((await closed).stale,true);assert.equal(f.context.imageSession,null);
});
function imageFixture(){
 const pending=deferred(),timers=new Map();let src='old',next=0;const node={complete:false,naturalWidth:0,naturalHeight:0,getAttribute:()=>src,removeAttribute:()=>{src=null;},get src(){return src;},set src(v){src=v;},decode:()=>pending.promise};
 const context=vm.createContext({pendingImageDecode:null,$:()=>node,setTimeout:fn=>{const id=++next;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});assert(ui.has('prepareImage'),'The shipped client must provide actual DOM decoding');vm.runInContext(ui.get('cancelImageDecode')+'\n'+ui.get('prepareImage'),context);return {context,node,pending,timers};
}
test('the shipped DOM decoder validates actual dimensions and source, with finite timeout and no failed-request replay',async()=>{
 const f=imageFixture(),running=f.context.prepareImage({cover:'new'},()=>true);assert.equal(f.node.src,'new');assert.equal(f.timers.size,1);f.node.complete=true;f.node.naturalWidth=800;f.node.naturalHeight=500;f.pending.resolve();await running;assert.equal(f.timers.size,0);
 for(const kind of ['failure','empty','source','timeout']){const f=imageFixture(),p=f.context.prepareImage({cover:'new'},()=>true);if(kind==='timeout')f.timers.get(1)();else if(kind==='failure')f.pending.reject(Error('secret URL'));else{f.node.complete=true;f.node.naturalWidth=kind==='empty'?0:800;f.node.naturalHeight=500;if(kind==='source')f.node.src='other';f.pending.resolve();}await assert.rejects(p,/图片/);assert.equal(f.timers.size,0);assert.equal(f.node.src,kind==='source'?'other':null,'Failed current sources must not keep downloading');}
 const code=ui.get('prepareImage');assert.doesNotMatch(code,/fetch\(|new Image|createObjectURL|retry|\.click\(|\.focus\(/);assert.match(code,/20000/);
});
test('a retired DOM decode is stale, not a visible failure on another image or account',async()=>{
 const f=imageFixture();let active=true;const p=f.context.prepareImage({cover:'new'},()=>active);active=false;f.pending.reject(Error('Retired'));assert.equal((await p).stale,true);assert.equal(f.timers.size,0);
});
test('close and same-URL supersession settle even when the browser never completes its decode promise',async()=>{
 const f=imageFixture(),closed=f.context.prepareImage({cover:'same'},()=>true);f.context.cancelImageDecode();assert.equal((await closed).stale,true);assert.equal(f.node.src,null);assert.equal(f.timers.size,0);assert.equal(f.context.pendingImageDecode,null);
 const a=f.context.prepareImage({cover:'same'},()=>true),next=deferred();f.node.decode=()=>next.promise;const b=f.context.prepareImage({cover:'same'},()=>true);assert.equal((await a).stale,true);assert.equal(f.node.src,'same');assert(f.context.pendingImageDecode);assert.equal(f.timers.size,1,'Old cleanup cannot clear the new timeout');f.node.complete=true;f.node.naturalWidth=800;f.node.naturalHeight=500;next.resolve();assert.equal((await b).decoded,true);assert.equal(f.timers.size,0);
});
