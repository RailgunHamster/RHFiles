import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),functions=new Map();
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&['button','select'].includes(n.id.name))functions.set(n.id.name,source.slice(n.start,n.end));for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else walk(v);}walk(parse(source,{ecmaVersion:'latest'}));
function fixture(invoke){const handlers=[],notices=[],context=vm.createContext({el:()=>({dataset:{},append(){}}),Option:class{},invoke,notice:e=>notices.push(e),listen:(_node,_event,handler)=>handlers.push(handler)});for(const code of functions.values())vm.runInContext(code,context);return {context,handlers,notices};}
test('button UI reports an action failure but returns the original rejection to automation',async()=>{const failure=Error('Generated action denied'),f=fixture(async()=>{throw failure;});f.context.button('Generated','image.favorite');await assert.rejects(f.handlers[0](),error=>error===failure);assert.equal(f.notices.length,1);assert.equal(f.notices[0],failure);});
test('select UI reports an action failure but cannot turn it into a successful UI receipt',async()=>{const failure=Error('Generated option denied'),f=fixture(async()=>{throw failure;});f.context.select([['one','One']],'preferences.set',value=>({value}),'one');await assert.rejects(f.handlers[0](),error=>error===failure);assert.equal(f.notices.length,1);});
test('button automation still waits for actual action completion and returns its result',async()=>{let release;const f=fixture(()=>new Promise(resolve=>release=resolve));f.context.button('Generated','image.favorite');let finished=false;const pending=f.handlers[0]().then(value=>{finished=true;return value;});assert.equal(finished,false);release({favorite:true});assert.equal((await pending).favorite,true);assert.equal(f.notices.length,0);});

const handwritten=new Map();function findHandlers(n){if(!n||typeof n!=='object')return;if(n.type==='CallExpression'&&n.callee.name==='listen'){
 const site=n.arguments[3];let name=site?.type==='Literal'?site.value:null,prefix=site;
 while(prefix?.type==='BinaryExpression'&&prefix.operator==='+')prefix=prefix.left;
 if(site?.type==='BinaryExpression'&&prefix?.type==='Literal'&&['settings.','shortcut.'].includes(prefix.value))name=prefix.value+'*';
 if(name)handwritten.set(name,source.slice(n.arguments[2].start,n.arguments[2].end));
}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(findHandlers);else findHandlers(v);}findHandlers(parse(source,{ecmaVersion:'latest'}));
for(const site of ['gallery.jump','novel.previewSearch','reader.search']){
 function handler(invoke,notices){assert(handwritten.has(site),'Actual registered handler '+site);return vm.runInNewContext('('+handwritten.get(site)+')',{invoke,notice:error=>notices.push(error),page:{value:'2'},search:{value:'生成搜索'},chapterSearch:{value:'生成章节'}});}
 test(site+' UI preserves the actual failed action for its caller',async()=>{const failure=Error('Generated handwritten failure'),notices=[],fn=handler(async()=>{throw failure;},notices);await assert.rejects(Promise.resolve(fn({preventDefault(){}})),error=>error===failure);assert.equal(notices.length,1);assert.equal(notices[0],failure);});
 test(site+' UI does not finish before its action and returns its result',async()=>{let release;const notices=[],pending=new Promise(resolve=>release=resolve),fn=handler(()=>pending,notices),result=fn({preventDefault(){}});assert.equal(result,pending,'Return the original action, not its error-observer Promise or undefined');release({completed:true});assert.equal((await result).completed,true);assert.equal(notices.length,0);});
}

// Execute the actual registered DOM handlers, not a rewritten semantic action.
// These are single explicit controls; wheel/animation scheduling has different
// coalescing semantics and is deliberately not included here.
for(const site of ['selection','settings.*','shortcut.*','tasks.batches.visibility','viewer.speed','viewer.minimap','viewer.visualMap','viewer.progress','viewer.select','viewer.inspect','page.volume']){
 function handler(invoke,notices){
  assert(handwritten.has(site),'Actual registered handler '+site);
  return vm.runInNewContext('('+handwritten.get(site)+')',{
   invoke,notice:error=>notices.push(error),batches:{open:false},viewer:{token:42},token:42,v:{token:42},key:'picture:generated',
   label:{textContent:''},speed:{value:'400'},map:{value:'500'},progress:{value:'500'},master:{value:'20'},
   card:{dataset:{id:'generated',kind:'picture'}},checkbox:{checked:true},control:{checked:true,value:'20'},type:'number',
   scope:'viewer',command:'next',value:{value:'KeyJ'},
   minimap:{getBoundingClientRect:()=>({left:0,width:100})},
  });
 }
 const event=()=>({preventDefault(){},stopPropagation(){},clientX:40,target:{closest:()=>null}});
 test(site+' UI must not turn the failed action into a successful automation result',async()=>{
  const failure=Error('Generated explicit-control failure'),notices=[],fn=handler(async()=>{throw failure;},notices);
  await assert.rejects(Promise.resolve(fn(event())),error=>error===failure);assert.equal(notices.length,1);assert.equal(notices[0],failure);
 });
 test(site+' UI waits for its original action and returns the exact result',async()=>{
  let release;const notices=[],pending=new Promise(resolve=>release=resolve),fn=handler(()=>pending,notices),result=fn(event());
  assert.equal(result,pending,'Return the action promise, not its notice observer or undefined');release({completed:true});
  assert.equal((await result).completed,true);assert.equal(notices.length,0);
 });
}
