import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';import{parse}from'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),actions=new Map(),functions=new Map();
function collect(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration')functions.set(node.id.name,source.slice(node.start,node.end));if(node.type==='CallExpression'&&node.callee?.name==='action'&&typeof node.arguments[0]?.value==='string'&&node.arguments[2])actions.set(node.arguments[0].value,source.slice(node.arguments[2].start,node.arguments[2].end));for(const value of Object.values(node))if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')collect(value);}collect(parse(source,{ecmaVersion:'latest'}));
test('a strip enlargement captures the admitted picture rather than a selection changed during an await',async()=>{
 const first={id:'first',kind:'picture',title:'First',path:'/storage/first.webp'},second={id:'second',kind:'picture',path:'/storage/second.webp'},viewer={mode:'strip',token:1,current:null,rowLookup:new Map([['picture:first',{item:first}]])},calls=[];let release;
 const context=vm.createContext({viewer,pauseStrip(){},invoke:async(name,args)=>{calls.push([name,args]);if(name==='viewer.select'){viewer.current=first;return new Promise(resolve=>release=resolve);}return {opened:true};}});vm.runInContext(functions.get('requireStrip'),context);const handler=vm.runInContext('('+actions.get('viewer.inspect')+')',context),pending=handler({key:'picture:first',expectedViewer:1});viewer.current=second;release();await pending;assert.equal(calls[1][0],'image.preview');assert.equal(calls[1][1].path,first.path);
});
test('closing a strip during enlargement admission cannot reopen it or pause the replacement',async()=>{
 const first={id:'first',kind:'picture',path:'/storage/first.webp'},viewer={mode:'strip',token:1,rowLookup:new Map([['picture:first',{item:first}]])};let release,opens=0,pauses=0;
 const context=vm.createContext({viewer,pauseStrip(){pauses++;},invoke:async name=>name==='viewer.select'?new Promise(resolve=>release=resolve):opens++});vm.runInContext(functions.get('requireStrip'),context);const handler=vm.runInContext('('+actions.get('viewer.inspect')+')',context),pending=handler({key:'picture:first',expectedViewer:1});context.viewer={mode:'strip',token:2};release();assert.equal((await pending).stale,true);assert.equal(opens,0);assert.equal(pauses,0);
});
test('an old strip toolbar mark is rejected before reading the current preview or submitting a source',async()=>{
 const context=vm.createContext({viewer:{token:2}}),handler=vm.runInContext('('+actions.get('selection.markCurrent')+')',context);await assert.rejects(handler({expectedViewer:1}),/窗口已改变/);
});
test('a named strip favorite cannot silently favorite a different current slideshow item',async()=>{
 const context=vm.createContext({viewer:{mode:'slideshow',token:1,current:{id:'other',kind:'picture'}}}),handler=vm.runInContext('('+actions.get('viewer.favorite')+')',context);await assert.rejects(handler({key:'picture:first'}),/指定图片收藏/);
});
function frameFixture(native){
 const nodes=[],row={spacer:{append:node=>nodes.push(node)}},tile={key:'picture:first:0',item:{id:'first',kind:'picture',title:'First',path:'/storage/first.webp'}},viewer={token:1,rows:[row],layoutRevision:1,tiles:new Map(),stripUrls:new Map(),failedPaths:new Map()},entry={tile,row};
 const context=vm.createContext({viewer,native,stripWindow:()=>[entry],notice(){},el:()=>({dataset:{},classList:{add(){}},append(){}}),button:()=>({setAttribute(){}}),listen(){},positionStripTile(){},refreshViewer(){},I:{key:item=>item.kind+':'+item.id}});vm.runInContext(functions.get('renderStripFrame'),context);return {context,viewer,nodes};
}
test('a terminal strip image-resolution failure becomes a visible placeholder, not a request per animation frame',async()=>{
 let attempts=0;const {context,viewer,nodes}=frameFixture(async()=>{attempts++;throw Error('owned network failure');});for(let i=0;i<5;i++)await context.renderStripFrame(viewer);assert.equal(attempts,1);assert.equal(nodes.length,1);assert.equal(viewer.failedPaths.get('/storage/first.webp'),'owned network failure');assert.equal(nodes[0].title,'owned network failure');
});
test('late strip image resolution cannot paint a closed viewer or a rebuilt layout',async()=>{
 for(const mode of ['replacement','resize']){let release;const {context,viewer,nodes}=frameFixture(()=>new Promise(resolve=>release=resolve)),pending=context.renderStripFrame(viewer);if(mode==='replacement')context.viewer={token:2};else viewer.layoutRevision++;release(['resolved:old']);await pending;assert.equal(nodes.length,0);assert.equal(viewer.stripUrls.size,0);}
});
test('an empty replacement keeps the established zero-count API without retiring the still-open viewer',async()=>{
 const previous={token:1,mode:'strip'},calls=[],notifications=[],context=vm.createContext({epoch:1,viewer:previous,viewerToken:1,ensure:async()=>1,stopViewer(){calls.push('retired');context.viewer=null;},config:()=>({}),criteria:()=>({}),rawCatalog:async()=>{},send:async()=>({queue:[]}),I:{canonical:JSON.stringify},prefs:{},notice:message=>notifications.push(message),dialog(){calls.push('opened');throw Error('Unexpected empty modal');}}),handler=vm.runInContext('('+actions.get('viewer.open')+')',context);
 const result=await handler({mode:'strip',source:'picture'});assert.equal(result.opened,false);assert.equal(result.total,0);assert.equal(result.empty,true);assert.equal(context.viewer,previous);assert.deepEqual(calls,[]);assert.match(notifications[0],/没有符合/);
});
test('a late strip catalog cannot reopen after close or paint another account',async()=>{
 for(const mode of ['close','account']){
  let release,retired=0,opened=0;const context=vm.createContext({epoch:1,viewer:{token:1},viewerToken:1,ensure:async()=>1,config:()=>({}),criteria:()=>({}),rawCatalog:async()=>{},send:()=>new Promise(resolve=>release=resolve),stopViewer(){retired++;},dialog(){opened++;},I:{canonical:JSON.stringify},prefs:{}}),handler=vm.runInContext('('+actions.get('viewer.open')+')',context),pending=handler({mode:'strip',source:'picture'});
  for(let i=0;i<10&&!release;i++)await new Promise(setImmediate);assert(release);if(mode==='close'){context.viewerToken++;context.viewer=null;}else{context.epoch++;context.viewer={token:9};}release({queue:[{id:'old',kind:'picture'}]});assert.equal((await pending).stale,true);assert.equal(retired,0);assert.equal(opened,0);
 }
});
test('inline strip speed repaint preserves zero and fractional legacy settings as well as the reference multiplier',()=>{
 const settings={scrollSpeed:400},viewer={speed:{value:'100'},speedLabel:{}},context=vm.createContext({config:()=>settings});vm.runInContext(functions.get('paintStripSpeed'),context);
 for(const value of [400,2000,0,1.5]){settings.scrollSpeed=value;context.paintStripSpeed(viewer);assert.equal(Number(viewer.speed.value),value);assert.equal(viewer.speed.title,value+' px/s');assert.equal(viewer.speedLabel.textContent,'×'+(value/200).toFixed(1));}
});
