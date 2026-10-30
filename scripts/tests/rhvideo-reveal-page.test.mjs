import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),I=require('../../src/js/rhvideo-index.js'),tags=require('../../src/js/rhvideo-tags.js');
const model=require('../../src/js/rhvideo-model.js');
const workbench=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),client=fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url),'utf8');
function declarations(source){const result=new Map();function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration')result.set(n.id.name,source.slice(n.start,n.end));if(n.type==='CallExpression'&&n.callee.name==='action'&&n.arguments[0]?.value==='media.reveal'){const fn=n.arguments[2];result.set('reveal',source.slice(fn.start,fn.end));}for(const value of Object.values(n))if(Array.isArray(value))value.forEach(walk);else walk(value);}walk(parse(source,{ecmaVersion:'latest'}));return result;}
const wb=declarations(workbench),ui=declarations(client);
function catalogFixture(count=100){
 const c=new I.Catalog({tags});c.set('picture',Array.from({length:count},(_,i)=>({kind:'picture',id:'p'+i,title:String(i).padStart(6,'0')})));
 const calls=[],resolves=[],context=vm.createContext({I,epoch:1,catalogRevision:1,state:{view:'catalog',kind:'picture',offset:0,limit:36,loadId:1},prefs:{rule:{}},resolutionGeneration:1,
  ensure:async()=>context.epoch,rawCatalog:async()=>{},resolutions:{get:()=>null,put(){}},
  criteria:extra=>({kind:context.state.kind,offset:context.state.offset,limit:36,sort:'nameAsc',...extra}),
  query:async args=>{assert.notEqual(args.allKeys,true,'Single-file location must not transfer the entire ordered library');calls.push(args);return c.query({kind:'picture',offset:0,limit:36,sort:'nameAsc',...args});},
  native:async(action,args)=>{assert.equal(action,'resolve');assert(args.items.length<=36);resolves.push(args.items.map(v=>v.id));return {generation:1,items:args.items.map(v=>({...v,cover:'generated-only'}))};},
  invalidateGallery(){},warmGallery(){},save(){}});
 vm.runInContext(wb.get('catalog'),context);return {context,calls,resolves,c};
}
test('locating an off-page item resolves only its final page, not a preliminary first page',async()=>{
 const f=catalogFixture(),value=await f.context.catalog(false,{kind:'picture',id:'p75'});
 assert.equal(value.offset,72);assert.equal(value.total,100);assert.deepEqual(f.resolves,[Array.from({length:28},(_,i)=>'p'+(i+72))]);assert.equal(f.calls.length,2);assert.equal(f.calls[0].locate.key,'picture:p75');assert.equal(f.calls[0].limit,1);assert.equal(f.calls[1].offset,72);
});
test('one-hundred-thousand-item location still transfers a locator and one bounded final page',async()=>{
 const f=catalogFixture(100000),value=await f.context.catalog(false,{kind:'picture',id:'p99999'});
 assert.equal(value.offset,99972);assert.equal(value.items.length,28);assert.equal(f.resolves.length,1);assert.equal(f.calls.length,2);assert(f.calls.every(v=>v.allKeys!==true));assert(Buffer.byteLength(JSON.stringify(value))<10000);
});
test('a missing target rejects instead of painting an unrelated first page',async()=>{
 const f=catalogFixture();await assert.rejects(f.context.catalog(false,{kind:'picture',id:'missing'}),/清单/);assert.equal(f.resolves.length,0);
});
test('a superseded locator cannot clear filters, resolve a page or change the current offset',async()=>{
 const f=catalogFixture();let release;f.context.prefs.rule={include:['keep']};f.context.query=args=>new Promise(resolve=>{release=resolve;});
 const pending=f.context.catalog(false,{kind:'picture',id:'p75'}).then(result=>({result}),error=>({error}));for(let i=0;i<20&&!release;i++)await new Promise(setImmediate);assert.equal(typeof release,'function');f.context.state.loadId++;release({located:null,total:100,items:[]});
 const outcome=await pending;assert.match(String(outcome.error),/更改|改变/);assert.deepEqual(JSON.parse(JSON.stringify(f.context.prefs.rule)),{include:['keep']});assert.equal(f.context.state.offset,0);assert.equal(f.resolves.length,0);
});
test('ordinary category loading retains the normal bounded page-cache path',async()=>{
 const f=catalogFixture(),value=await f.context.catalog(false);assert.equal(value.total,100);assert.equal(f.calls.length,1);assert.equal(f.calls[0].latest,true);assert.equal(f.calls[0].locate,undefined);assert.equal(f.resolves.length,1);
});
test('shared category preparation preserves the existing reset and folder-load behavior without a preliminary paint',async()=>{
 const calls=[],state={view:'gallery',kind:'video',offset:72,search:'old',folder:'old'},nodes={search:{value:'old'},folder:{value:'old'}};
 const context=vm.createContext({state,searchTimer:1,clearTimeout:()=>calls.push('clear'),workbench:{leaveGallery:()=>calls.push('leave')},$:id=>nodes[id],syncSection:()=>calls.push('section'),load:async(...args)=>{calls.push(args);return {offset:72};}});
 assert(ui.has('loadCategory'),'Execute the production shared category function');vm.runInContext(ui.get('loadCategory'),context);const target={kind:'picture',id:'p75'};await context.loadCategory('picture',target);
 assert.equal(state.view,'catalog');assert.equal(state.kind,'picture');assert.equal(state.search,'');assert.equal(state.folder,'');assert.equal(nodes.search.value,'');assert.equal(nodes.folder.value,'');assert.deepEqual(calls.slice(0,3),['clear','leave','section']);assert.equal(calls.length,4);assert.deepEqual(calls[3],[false,true,target]);
});

test('a filtered-out target retries only a bounded locator after clearing the old rule',async()=>{
 const f=catalogFixture();let reads=0,cleared=0;const query=f.context.query;f.context.prefs.rule={include:['old']};f.context.save=()=>cleared++;
 f.context.query=async args=>++reads===1?{located:null,total:0,items:[]}:query(args);
 const value=await f.context.catalog(false,{kind:'picture',id:'p75'});assert.equal(value.offset,72);assert.equal(cleared,1);assert.deepEqual(JSON.parse(JSON.stringify(f.context.prefs.rule)),{});assert.equal(f.resolves.length,1);assert.equal(reads,3);
});

function loadFixture(){
 const state={connected:true,view:'catalog',kind:'picture',offset:0,limit:36,loadId:1,items:[]},calls={paint:0,cards:0,folders:0},nodes={'media-grid':{dataset:{kind:'picture'},children:[],setAttribute(){},replaceChildren(){}},notice:{},'result-count':{}};
 const context=vm.createContext({state,model,$:id=>nodes[id],workbench:{catalog:async()=>({items:[{kind:'picture',id:'p75',title:'generated'}],total:100,generation:1,offset:72}),paintCards(){calls.cards++;}},
  status(){},notice(){},pagination(){},trimCards(){},loadFolders(){calls.folders++;},paint(){calls.paint++;},snapshot:()=>({...state})});
 vm.runInContext(ui.get('load'),context);return {context,state,calls};
}
test('actual client load commits the located offset and paints once after the final page is ready',async()=>{
 const f=loadFixture(),value=await f.context.load(false,true,{kind:'picture',id:'p75'});assert.equal(value.offset,72);assert.equal(f.state.items[0].id,'p75');assert.equal(f.calls.paint,1);assert.equal(f.calls.cards,1);assert.equal(f.calls.folders,1);assert.equal(f.state.loading,false);
});
test('a late located page never changes the newer navigation or paints old cards',async()=>{
 const f=loadFixture();let release;f.context.workbench.catalog=()=>new Promise(resolve=>release=resolve);const pending=f.context.load(false,false,{kind:'picture',id:'p75'});
 f.state.loadId++;f.state.offset=36;release({items:[],total:100,generation:1,offset:72});await pending;assert.equal(f.state.offset,36);assert.equal(f.calls.paint,0);assert.equal(f.calls.cards,0);
});
test('invalid page metadata does not show an unrelated page as a successful location',async()=>{
 const f=loadFixture();f.context.workbench.catalog=async()=>({items:[],total:100,offset:1.5});await f.context.load(false,false,{kind:'picture',id:'p75'});assert.match(f.state.error,/定位页码/);assert.equal(f.calls.paint,0);
});

function revealFixture(){
 const calls=[],preview={},card={dataset:{id:'p75',kind:'picture'},scrollIntoView(){calls.push('scroll');},classList:{add(){calls.push('highlight');},remove(){}}},nodes={'image-dialog':{open:true},'wb-gallery':{open:false},'media-grid':{querySelectorAll:()=>[card]}};
 const context=vm.createContext({epoch:1,imageToken:1,imageSession:preview,state:{kind:'picture',view:'catalog',loadId:1,offset:0,error:'',items:[]},ensure:async()=>1,$:id=>nodes[id],setTimeout(){},
  ctx:{loadCategory(kind,target){calls.push({kind,target});context.state.loadId++;context.state.items=[{id:target.id,kind}];context.state.offset=72;return Promise.resolve();}},
  invoke:async name=>{calls.push(name);if(name==='image.close'){nodes['image-dialog'].open=false;context.imageSession=null;context.imageToken++;}},query:()=>assert.fail('Reveal must not request a full order or preliminary page'),load:()=>assert.fail('Reveal must not issue a second load')});
 vm.runInContext('globalThis.reveal=('+wb.get('reveal')+')',context);return {context,calls,nodes,preview};
}
test('actual reveal uses the shared one-page load then closes its preview and highlights the target',async()=>{
 const f=revealFixture(),value=await f.context.reveal({id:'p75',kind:'picture'});assert.equal(value.offset,72);assert.equal(f.calls.length,4);assert.equal(f.calls[1],'image.close');assert.deepEqual(f.calls.slice(2),['scroll','highlight']);assert.equal(f.nodes['image-dialog'].open,false);
});
test('a replaced preview or newer navigation prevents a late reveal from closing or highlighting it',async()=>{
 for(const change of [f=>f.context.imageSession={},f=>f.context.state.loadId++,f=>f.context.epoch++]){
  const f=revealFixture();let release;f.context.ctx.loadCategory=()=>{f.context.state.loadId++;return new Promise(resolve=>release=resolve);};const pending=f.context.reveal({id:'p75',kind:'picture'});for(let i=0;i<20&&!release;i++)await new Promise(setImmediate);assert.equal(typeof release,'function');change(f);release();assert.equal((await pending).stale,true);assert.equal(f.nodes['image-dialog'].open,true);assert.equal(f.calls.length,0);
 }
});
test('a failed location leaves the source preview open and reports its failure',async()=>{
 const f=revealFixture();f.context.ctx.loadCategory=async()=>{f.context.state.error='owned read failure';};await assert.rejects(f.context.reveal({id:'p75',kind:'picture'}),/owned read failure/);assert.equal(f.nodes['image-dialog'].open,true);assert.equal(f.calls.length,0);
});

test('a replaced account or preview during session verification cannot even start the old target navigation',async()=>{
 for(const change of [f=>f.context.epoch++,f=>f.context.imageSession={},f=>f.context.state.loadId++,f=>f.context.imageToken+=2]){
  const f=revealFixture();let release;f.context.ensure=()=>new Promise(resolve=>release=resolve);const pending=f.context.reveal({id:'p75',kind:'picture'});assert.equal(typeof release,'function');change(f);release(f.context.epoch);
  assert.equal((await pending).stale,true);assert.equal(f.calls.length,0,'No category load, closing or highlight may run after the original intent was superseded');assert.equal(f.nodes['image-dialog'].open,true);
 }
});

test('a newer UI during native preview-close cannot be closed or highlighted by the earlier reveal',async()=>{
 for(const change of [f=>f.context.state.loadId++,f=>f.context.imageToken+=2]){
  const f=revealFixture();let release;f.context.invoke=name=>{f.calls.push(name);if(name==='image.close'){f.context.imageSession=null;f.context.imageToken++;f.nodes['image-dialog'].open=false;return new Promise(resolve=>release=resolve);}return Promise.resolve();};
  const pending=f.context.reveal({id:'p75',kind:'picture'});for(let i=0;i<20&&!release;i++)await new Promise(setImmediate);assert.equal(typeof release,'function');change(f);f.nodes['wb-gallery'].open=true;release();
  assert.equal((await pending).stale,true);assert.equal(f.calls.length,2,'Only the earlier category load and its own image close may have started');assert.equal(f.nodes['wb-gallery'].open,true);
 }
});
