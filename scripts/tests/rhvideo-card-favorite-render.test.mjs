import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-client.js',import.meta.url),'utf8');
const declarations=parse(source,{ecmaVersion:'latest'}).body[0].expression.callee.body.body.filter(n=>n.type==='FunctionDeclaration');
function fixture(){
  const calls={viewer:0,image:0,gridScans:0,heartQueries:0},cache=new Map(),items=Array.from({length:36},(_,i)=>({id:String(i),kind:'video',title:'视频 '+i}));
  const key=m=>m.kind+':'+m.id,flags=()=>({values:new Set(),toggle(name,enabled){enabled?this.values.add(name):this.values.delete(name);}});
  const cards=items.map(media=>{const heart={dataset:{key:key(media)},classList:flags(),attrs:{},setAttribute(name,value){this.attrs[name]=value;}};
    const card={dataset:{id:media.id,kind:media.kind},heart,image:{decoded:true},querySelector(selector){assert.equal(selector,'.favorite-button');calls.heartQueries++;return heart;}};
    heart.closest=selector=>{assert.equal(selector,'.media-card');return card;};cache.set(key(media),{node:card,signature:JSON.stringify(media)});return card;});
  const grid={children:[],dataset:{},replaceChildren(){this.children=[];},append(node){this.children.push(node);},querySelectorAll(selector){assert.equal(selector,'.favorite-button');calls.gridScans++;return this.children.map(c=>c.heart);}};
  const bookButton={classList:flags(),attrs:{},setAttribute(name,value){this.attrs[name]=value;}},nodes={'library-status':{replaceChildren(){}},'media-grid':grid,'image-dialog':{open:true},'reader-favorite':bookButton};
  const state={kind:'video',items,favorites:new Set(['video:1']),favoriteBusy:new Set(['video:2'])};
  const context=vm.createContext({state,reader:{book:{id:'book'}},workbench:{refreshViewer(){calls.viewer++;},refreshImage(){calls.image++;}},cardCache:cache,model:{itemKey:key},$:id=>nodes[id],trimCards(){},document:{createElement(){throw Error('A warm render cannot recreate decoded cards');}}});
  for(const node of declarations.filter(n=>['paint','paintFavorite','paintCardFavorite','rememberViewportCards'].includes(n.id.name)))vm.runInContext(source.slice(node.start,node.end),context);
  return {context,calls,cards,grid,state,bookButton};
}
test('warm catalog rendering updates each cached heart locally without refreshing unrelated viewers per card',()=>{
  const f=fixture(),images=f.cards.map(c=>c.image);vm.runInContext('paint()',f.context);
  assert.deepEqual(f.grid.children,f.cards);assert.deepEqual(f.cards.map(c=>c.image),images);
  assert.equal(f.cards[1].heart.attrs['aria-pressed'],'true');assert.equal(f.cards[1].heart.attrs['aria-label'],'取消收藏 视频 1');assert.equal(f.cards[2].heart.disabled,true);
  assert.equal(f.calls.viewer,0,'A list repaint is not 36 separate favorite mutations');assert.equal(f.calls.image,0,'Do not rebuild the image toolbar for each reused list card');
  assert.equal(f.calls.gridScans,0,'Do not repeatedly scan the growing grid');assert.equal(f.calls.heartQueries,36,'Exactly one bounded local heart lookup per cached card');
});
test('an actual favorite mutation still refreshes open viewers and the reader, retaining card identity',()=>{
  const f=fixture();f.grid.children=[...f.cards];f.state.favorites.add('novel:book');vm.runInContext("paintFavorite('novel:book')",f.context);
  assert.equal(f.calls.viewer,1);assert.equal(f.calls.image,1);assert.equal(f.bookButton.attrs['aria-pressed'],'true');assert.equal(f.bookButton.title,'取消收藏本书');
  f.state.favorites.delete('video:1');f.state.favoriteBusy.add('video:1');vm.runInContext("paintFavorite('video:1')",f.context);
  assert.equal(f.calls.viewer,2);assert.equal(f.calls.image,2);assert.equal(f.cards[1].heart.attrs['aria-pressed'],'false');assert.equal(f.cards[1].heart.attrs['aria-label'],'收藏 视频 1');assert.equal(f.cards[1].heart.disabled,true);assert.deepEqual(f.grid.children,f.cards);
});
