import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url),'utf8');
const declarations=parse(source,{ecmaVersion:'latest'}).body[0].expression.callee.body.body.filter(n=>n.type==='FunctionDeclaration');
function fixture(){
  const cache=new Map(),calls={unobserve:[],disconnect:0,removed:[],grid:0},observer={unobserve:node=>calls.unobserve.push(node),disconnect:()=>calls.disconnect++};
  const context=vm.createContext({cardCache:cache,cardVisibility:observer,visibilityOrder:0,document:{visibilityState:'visible'},$:()=>({replaceChildren(){calls.grid++;}})});
  function load(name){const node=declarations.find(n=>n.id.name===name);assert(node,'Production cache function '+name);vm.runInContext(source.slice(node.start,node.end),context);return context[name];}
  const add=(id,{attached=false,seen=0,width=1536,height=1536}={})=>{
    const image={naturalWidth:width,naturalHeight:height,removeAttribute(name){assert.equal(name,'src');calls.removed.push(id);this.naturalWidth=this.naturalHeight=0;}};
    const node={isConnected:attached,dataset:{kind:'video',id},querySelector:()=>image};
    cache.set('video:'+id,{node,signature:id,seen});return node;
  };
  return {cache,calls,context,add,load};
}

test('the same 16 MiB budget keeps a previously seen cover rather than a newer unseen offscreen cover',()=>{
  const f=fixture();const seen=f.add('seen',{seen:10}),unseen=f.add('unseen');
  f.load('trimCards')();assert(f.cache.has('video:seen'),'Do not evict the previously visible cover first');assert(!f.cache.has('video:unseen'));assert.deepEqual(f.calls.unobserve,[unseen]);assert.deepEqual(f.calls.removed,['unseen']);assert.equal(seen.isConnected,false);
});

test('entry and decoded-byte ceilings remain unchanged and attached cards are never evicted',()=>{
  const f=fixture(),attached=f.add('attached',{attached:true,seen:0});
  for(let i=0;i<90;i++)f.add(String(i),{seen:i,width:512,height:512});f.load('trimCards')();
  assert.equal(f.cache.get('video:attached').node,attached);assert(f.cache.size<=72);
  const detached=[...f.cache.values()].filter(v=>!v.node.isConnected);assert(detached.reduce((bytes,v)=>bytes+v.node.querySelector().naturalWidth*v.node.querySelector().naturalHeight*4,0)<=16*1024*1024);
  assert(f.cache.has('video:89'));assert(!f.cache.has('video:0'));
});

test('visibility events promote only the current attached node, not a hidden page or an old same-key element',()=>{
  const f=fixture(),current=f.add('same',{attached:true}),old={...current};const remember=f.load('rememberVisibleCards');
  const event=target=>({target,isIntersecting:true,intersectionRect:{width:10,height:10}});
  remember([event(old)]);assert.equal(f.cache.get('video:same').seen,0);
  remember([{...event(current),isIntersecting:false}]);assert.equal(f.cache.get('video:same').seen,0);
  remember([{...event(current),intersectionRect:{width:0,height:10}}]);assert.equal(f.cache.get('video:same').seen,0);
  remember([event(current)]);assert.equal(f.cache.get('video:same').seen,1);
  f.context.document.visibilityState='hidden';remember([event(current)]);assert.equal(f.cache.get('video:same').seen,1);
  f.context.document.visibilityState='visible';current.isConnected=false;remember([event(current)]);assert.equal(f.cache.get('video:same').seen,1);
});

test('an account/card reset disconnects observation and releases all image sources',()=>{
  const f=fixture();f.add('one');f.add('two');f.load('clearCards')();
  assert.equal(f.calls.disconnect,1);assert.equal(f.cache.size,0);assert.deepEqual(f.calls.removed,['one','two']);assert.equal(f.calls.grid,1);
});

test('the actual connection/logout reset also disconnects observation, not only an explicit list refresh',()=>{
  const f=fixture();f.add('old-account');f.add('old-detached');
  const grid={replaceChildren(){f.calls.grid++;},setAttribute(){}};
  Object.assign(f.context,{reader:{token:2,book:{id:'old'},loaded:true,saveTimer:0},state:{loadId:5,loading:true},timelineLoadId:3,folderLoadId:4,images:[{id:'old'}],clearTimeout,
    $:id=>id==='media-grid'?grid:{close(){},removeAttribute(){},replaceChildren(){}}});
  f.load('clearCards');f.load('clearMediaViews')();
  assert.equal(f.calls.disconnect,1,'beginConnection/invalidateReads must release the observer references to old account nodes');
  assert.equal(f.cache.size,0);assert.deepEqual(f.calls.removed,['old-account','old-detached']);assert.equal(f.calls.grid,1);
  assert.equal(f.context.reader.token,3);assert.equal(f.context.state.loadId,6);assert.equal(f.context.state.loading,false);assert.equal(f.context.reader.book,null);assert.equal(f.context.images.length,0);
});
