import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {parse} from 'acorn';
const require=createRequire(import.meta.url),M=require('../../src/js/rhvideo-rules-model.js'),T=require('../../src/js/rhvideo-tags.js'),I=require('../../src/js/rhvideo-index.js'),search=require('../../src/js/rhvideo-search.js'),dictionary=require('../../src/vendor/pinyin-pro/pinyin-pro.js');
const clone=value=>JSON.parse(JSON.stringify(value));
test('nested tag actions preserve empty-group editing, local NOT precedence and explicit selection',()=>{
  const m=new M.Editor(T);m.accept(m.edit('add',{path:[]}));assert.deepEqual(m.path,[0]);assert.equal(m.node().mode,'or');assert.equal(T.active(m.rule),false);m.accept(m.edit('tag',{label:'风景',kind:'include'}));m.accept(m.edit('tag',{label:'风景',kind:'exclude'}));assert.deepEqual(m.node().include,[]);assert.deepEqual(m.node().exclude,['风景']);m.accept(m.edit('mode',{path:[],value:'or'}));assert.equal(T.compile(m.rule)('风景'),false);assert.equal(T.compile(m.rule)('其他'),true);m.accept(m.edit('remove',{path:[0]}));assert.deepEqual(m.path,[]);assert.equal(T.active(m.rule),false);
});
test('stale rendered group/tag controls cannot act on a new group reusing the same path',()=>{
  const m=new M.Editor(T);m.accept(m.edit('add',{path:[]}));const old=m.revision;m.accept(m.edit('remove',{path:[0]}));m.accept(m.edit('add',{path:[]}));assert.throws(()=>m.edit('tag',{label:'旧点击',kind:'include',path:[0],expectedRevision:old}),/旧操作/);assert.equal(T.active(m.rule),false);
});
test('invalid names and group/depth limits cannot partially mutate rules or the selected group',()=>{
  const m=new M.Editor(T);for(let i=0;i<8;i++)m.accept(m.edit('add'));const before=m.snapshot();assert.throws(()=>m.edit('add'),/嵌套过深/);assert.deepEqual(m.snapshot(),before);for(const label of ['',',','a,b','x'.repeat(256)])assert.throws(()=>m.edit('tag',{label,kind:'include'}));assert.deepEqual(m.snapshot(),before);assert.throws(()=>m.edit('remove',{path:[]}),/不能移除主条件/);
});
test('external rule replacement invalidates stale controls and falls back from removed groups',()=>{
  const m=new M.Editor(T);m.accept(m.edit('add'));const old=m.revision;m.sync({include:['新规则']});assert.deepEqual(m.path,[]);assert(m.revision>old);assert.throws(()=>m.select([0],old),/旧操作/);assert.equal(m.snapshot().expression,'"新规则"');
});
test('account resets cannot reuse a former group revision even for the same tree shape',()=>{
  const m=new M.Editor(T);m.accept(m.edit('add'));const old=m.revision;m.reset();m.accept(m.edit('add'));assert(m.revision>old);assert.throws(()=>m.edit('tag',{label:'旧账号',kind:'include',path:[0],expectedRevision:old}),/旧操作/);
});
test('tag preference input is bounded, account-local data with the reference sort/recent/collapse shape',()=>{
  assert.deepEqual(M.settings(null),{sort:'count-desc',recent:[],collapsed:{all:false}});assert.deepEqual(M.settings({sort:'recent',recent:['a','a','b'],collapsed:{all:true},password:'never'}),{sort:'recent',recent:['a','b'],collapsed:{all:true}});assert.equal(M.settings({recent:Array.from({length:40},(_,i)=>String(i))}).recent.length,30);
});
const catalog=()=>new I.Catalog({tags:T,search,dictionary});
const videos=[{id:'v1',folder_label:'风景,旅行'},{id:'v2',folder_label:'风景,风景'},{id:'v3',folder_label:'重庆庆典'},{id:'v4',folder_label:''}],pictures=[{id:'p1',folder_label:'旅行'},{id:'p2',folder_label:'家庭'}];
test('tag statistics count source videos, not screenshot frames, with independent picture totals',async()=>{
  const c=catalog();c.set('video',videos);c.set('picture',pictures);c.setGallery([{video_id:'v1',folder:'风景',frames:Array.from({length:30},(_,i)=>['/frame'+i,i])}],[]);
  const value=await c.tagQuery({kinds:['video','picture'],rule:{include:['旅行']}});assert.deepEqual(value.catalogs,[{kind:'video',total:4,matching:1},{kind:'picture',total:2,matching:1}]);assert.equal(value.rows.find(v=>v.name==='风景').counts.video,2);assert.equal(value.rows.find(v=>v.name==='旅行').count,2);
});
test('missing selected tags and explicit empty folders stay visible with zero counts',async()=>{
  const c=catalog();c.set('video',videos);const result=await c.tagQuery({kinds:['video'],folders:['空目录'],rule:{exclude:['已移除']}});for(const name of ['空目录','已移除'])assert.equal(result.rows.find(v=>v.name===name).count,0);
});
test('favorites respect the active media type without leaking unrelated catalogs into their counts',async()=>{
  const c=catalog();c.set('favorite',[{id:'v1',type:'video',folder_label:'风景'},{id:'p1',type:'picture',folder_label:'家庭'},{id:'n1',type:'novel',folder_label:'家庭'}]);const result=await c.tagQuery({kinds:['favorite'],mediaType:'picture'});assert.deepEqual(result.catalogs,[{kind:'favorite',total:1,matching:1}]);assert.deepEqual(result.rows.map(v=>v.name),['家庭']);
});
test('tag search supports Chinese, full pinyin and initials, including orphan selected labels',async()=>{
  const c=catalog();c.set('video',videos);for(const text of ['重庆','chongqing','cq']){const result=await c.tagQuery({kinds:['video'],search:text});assert(result.rows.some(v=>v.name==='重庆庆典'),text);}
  assert.equal((await c.tagQuery({kinds:['video'],rule:{include:['山海']},search:'shanhai'})).rows[0].name,'山海');
});
test('tag rows are paged, ordered by name/count/recent and invalidated by changed source records',async()=>{
  const c=catalog();c.set('video',Array.from({length:205},(_,i)=>({id:'v'+i,folder_label:'标签'+String(i).padStart(3,'0')})));const page=await c.tagQuery({kinds:['video'],sort:'name-asc',offset:80,limit:80});assert.equal(page.rows.length,80);assert.equal(page.rows[0].name,'标签080');assert.equal(page.total,205);assert.equal((await c.tagQuery({kinds:['video'],sort:'recent',recent:['标签200']})).rows[0].name,'标签200');c.set('video',[{id:'new',folder_label:'新目录'}]);assert.deepEqual((await c.tagQuery({kinds:['video']})).rows.map(v=>v.name),['新目录']);
});
test('an obsolete tag scan stops without caching a partial table or suppressing the next request',async()=>{
  const c=catalog();c.set('video',Array.from({length:3000},(_,i)=>({id:'v'+i,folder_label:'目录'})));assert.equal((await c.tagQuery({kinds:['video']},()=>true)).stale,true);assert.equal(c.tagCache.size,0);const next=await c.tagQuery({kinds:['video']});assert.equal(next.rows[0].count,3000);
});
const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html'),functions=new Map();if(fs.existsSync(reference))for(const match of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(match[1],{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration')functions.set(node.id.name,match[1].slice(node.start,node.end));
test('nested editor mutations are differential-tested against the actual RHVideo functions',{skip:!functions.size},()=>{
  const names=['mediaTagPath','mediaTagNode','addMediaTagGroup','removeMediaTagGroup','setMediaTagGroupMode','toggleMediaTag'],scope=vm.createContext({structuredClone,RHTagFilter:T,mediaTagFilter:T.normalize(),mediaTagGroupPath:[],gridTagRecent:[],saveGridTagPrefs(){}});scope.updateMediaTagFilter=rule=>{try{scope.mediaTagFilter=T.normalize(rule);return true;}catch{return false;}};vm.runInContext(names.map(n=>functions.get(n)).join('\n'),scope);const m=new M.Editor(T);
  for(const [action,args,original]of [
    ['add',{path:[]},()=>scope.addMediaTagGroup('')],['tag',{label:'风景',kind:'include'},()=>scope.toggleMediaTag('风景')],['add',{path:[0]},()=>scope.addMediaTagGroup('0')],['tag',{label:'旅行',kind:'exclude'},()=>scope.toggleMediaTag('旅行','exclude')],['mode',{path:[0],value:'and'},()=>scope.setMediaTagGroupMode('0','and')],['remove',{path:[0,0]},()=>scope.removeMediaTagGroup('0.0')]
  ]){m.accept(m.edit(action,args));original();assert.deepEqual(m.rule,clone(scope.mediaTagFilter),action);assert.deepEqual(m.path,clone(scope.mediaTagGroupPath),action);}
});
test('300 mixed valid UI edits retain the exact reference tree and selected target group',{skip:!functions.size},()=>{
  const names=['mediaTagPath','mediaTagNode','addMediaTagGroup','removeMediaTagGroup','setMediaTagGroupMode','toggleMediaTag','clearMediaTagFilter','selectMediaTagGroup'],scope=vm.createContext({structuredClone,RHTagFilter:T,mediaTagFilter:T.normalize(),mediaTagGroupPath:[],gridTagRecent:[],saveGridTagPrefs(){},renderGridTagDrawer(){}});scope.updateMediaTagFilter=rule=>{try{scope.mediaTagFilter=T.normalize(rule);return true;}catch{return false;}};vm.runInContext(names.map(n=>functions.get(n)).join('\n'),scope);const m=new M.Editor(T);let seed=0x1090;const pick=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let step=0;step<300;step++){
    const paths=[];function visit(node,p=[]){paths.push(p);for(const [i,child]of (node.groups||[]).entries())visit(child,[...p,i]);}visit(m.rule);const target=paths[pick(paths.length)],key=target.join('.'),kind=pick(5);
    if(kind===0&&paths.length<12&&target.length<5){m.accept(m.edit('add',{path:target}));scope.addMediaTagGroup(key);}
    else if(kind===1&&target.length){m.accept(m.edit('remove',{path:target}));scope.removeMediaTagGroup(key);}
    else if(kind===2){const value=pick(2)?'and':'or';m.accept(m.edit('mode',{path:target,value}));scope.setMediaTagGroupMode(key,value);}
    else if(kind===3){m.accept(m.edit('clear'));scope.clearMediaTagFilter();}
    else{const label=['风景','旅行','城市','音乐','猫咪'][pick(5)],type=pick(2)?'include':'exclude';m.select(target);scope.selectMediaTagGroup(key);m.accept(m.edit('tag',{label,kind:type,path:target}));scope.toggleMediaTag(label,type,target);}
    assert.deepEqual(m.rule,clone(scope.mediaTagFilter),'tree after edit '+step);assert.deepEqual(m.path,clone(scope.mediaTagGroupPath),'selected group after edit '+step);
  }
});
test('every source and all four tag sort modes match the actual reference tag table',{skip:!functions.size},async()=>{
  const novels=[{id:'n1',folder_label:'音乐'}],favorites=[{id:'v1',type:'video',folder_label:'风景,旅行'},{id:'p1',type:'picture',folder_label:'家庭'}],rule=T.normalize({include:['已移除']}),allFolders=['空目录'],recent=['旅行','音乐'],node={sort:'count-desc',mix:true};
  const scope=vm.createContext({allVideos:videos,allPictures:pictures,allNovels:novels,favItems:favorites,allFolders,mediaTagFilter:rule,mediaTagDrawerSource:'grid',favFilter:'all',gridTagRecent:recent,gridTagCountCache:null,RHTagFilter:T,document:{getElementById:id=>id==='mix-pictures'?{checked:node.mix}:{value:node.sort}}});vm.runInContext(['mediaTagCatalogs','mediaTagCatalogRecord','gridTagCounts','gridTagRows'].map(n=>functions.get(n)).join('\n'),scope);
  const c=catalog();for(const [kind,rows]of [['video',videos],['picture',pictures],['novel',novels],['favorite',favorites]])c.set(kind,rows);
  for(const [source,kinds]of [['grid',['video','picture']],['list',['video']],['pictures',['picture']],['novels',['novel']],['favorites',['favorite']]])for(const sort of M.sorts){
    scope.mediaTagDrawerSource=source;node.sort=sort;scope.gridTagCountCache=null;const expected=clone(scope.gridTagRows()).map(row=>({name:row.name,count:row.count,counts:Object.fromEntries([['video','videos'],['picture','pictures'],['novel','novels'],['favorite','favorites']].filter(([,key])=>row[key]).map(([kind,key])=>[kind,row[key]]))})),actual=await c.tagQuery({kinds,rule,sort,recent,folders:['grid','list'].includes(source)?allFolders:[]});assert.deepEqual(actual.rows,expected,source+' '+sort);
  }
});
