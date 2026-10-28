import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';import{parse}from'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),actions=new Map();let implementation;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='playFavoriteVideo')implementation=source.slice(node.start,node.end);if(node.type==='CallExpression'&&node.callee?.name==='action'&&typeof node.arguments[0]?.value==='string'&&node.arguments[2])actions.set(node.arguments[0].value,source.slice(node.arguments[2].start,node.arguments[2].end));for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}walk(parse(source,{ecmaVersion:'latest'}));assert(implementation);
const old=()=>({previewId:'old-preview',total:4,low:false,index:0,current:{kind:'picture',id:'old-picture'}}),item={kind:'video',id:'one',title:'One',duration:20};
test('a favorite video prepared for a closed preview is discarded without starting a decoder',async()=>{
 let release;const calls=[],session=old(),context=vm.createContext({epoch:1,imageToken:1,imageSession:session,crypto:{randomUUID:()=> 'old-child'},I:{key:item=>item.kind+':'+item.id},prepareQueue:()=>new Promise(resolve=>release=resolve),discardPrepared:async(...args)=>calls.push(['discard',...args]),native:async name=>{calls.push([name]);return {};}});vm.runInContext(implementation,context);
 const pending=context.playFavoriteVideo(session,item,2,1);context.imageSession={previewId:'new-preview'};context.imageToken=2;release('old-draft');assert.equal((await pending).stale,true);assert.deepEqual(calls,[['discard','old-draft',1]]);
});
test('a late accepted play only retires its own preview and child, never closes the replacement player',async()=>{
 let release,entered;const started=new Promise(resolve=>entered=resolve),calls=[],session=old(),context=vm.createContext({epoch:1,imageToken:1,imageSession:session,crypto:{randomUUID:()=> 'old-child'},I:{key:item=>item.kind+':'+item.id},prepareQueue:async()=> 'old-draft',discardPrepared:async()=>{throw Error('An accepted play is not a prepared draft');},native:(name,args)=>{calls.push([name,JSON.parse(JSON.stringify(args))]);if(name==='play'){entered();return new Promise(resolve=>release=resolve);}return Promise.resolve({closed:false,stale:true});}});vm.runInContext(implementation,context);
 const pending=context.playFavoriteVideo(session,item,2,1);await started;context.imageSession={previewId:'new-preview'};context.imageToken=2;release({opened:true});assert.equal((await pending).stale,true);assert.deepEqual(calls.map(row=>row[0]),['play','player.closeParent']);assert.deepEqual(calls[1][1],{parentPreview:'old-preview',parentPlayback:'old-child'});
});
test('invalid favorite parent seek cannot consume the current child return identity',async()=>{
 const session={favorite:true,previewId:'preview',playbackId:'child',total:4,current:{kind:'video',id:'one'}},calls=[],context=vm.createContext({imageSession:session,state:{generation:1},I:{key:item=>item.kind+':'+item.id},stepImage:async()=>calls.push('step'),invoke:async()=>calls.push('close'),ctx:{openDialog(){}}}),handler=vm.runInContext('('+actions.get('image.returnFromVideo')+')',context);
 const event={generation:1,parentKey:'video:one',parentPreview:'preview',parentPlayback:'child',targetIndex:4};await assert.rejects(handler(event),/收藏浏览位置无效/);assert.equal(session.playbackId,'child','Validation must happen before revoking the active return capability');assert.deepEqual(calls,[]);
});
test('ordinary favorite ordering cannot pretend to shuffle an immutable opening snapshot',async()=>{
 const session={favorite:true,args:{kind:'favorite',seed:7}},calls=[],context=vm.createContext({imageSession:session,stepImage:async()=>calls.push('step'),save:()=>calls.push('save')}),handler=vm.runInContext('('+actions.get('image.order')+')',context);
 await assert.rejects(handler({random:false}),/收藏/);assert.equal(session.args.seed,7);assert.deepEqual(calls,[]);
});
test('favorite continuous browsing uses the mixed viewer rather than the picture strip flow',async()=>{
 const calls=[],context=vm.createContext({ensure:async()=>{calls.push('ensure');throw Error('Entered picture-only strip flow');},invoke:async(name,args)=>{calls.push([name,args]);return {opened:true,total:4};}}),handler=vm.runInContext('('+actions.get('viewer.open')+')',context);
 assert.equal((await handler({mode:'strip',source:'favorite'})).total,4);assert.deepEqual(calls.map(row=>row[0]),['favorite.browse']);
});
