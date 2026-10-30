import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {parse} from 'acorn';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
const require=createRequire(import.meta.url),I=require('../../src/js/rhvideo-index.js'),search=require('../../src/js/rhvideo-search.js'),dictionary=require('../../src/vendor/pinyin-pro/pinyin-pro.js'),tags=require('../../src/js/rhvideo-tags.js');
const source=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
const shapes=new Map();
if(fs.existsSync(source)){
  const walk=node=>{
    if(!node||typeof node!=='object')return;
    if(node.type==='CallExpression'&&node.callee.name==='searchCatalog'&&node.arguments[0]?.type==='Literal'){
      const [collection,,fields,,literal]=node.arguments;
      if(fields?.type==='ArrayExpression'&&(!literal||literal.type==='ArrayExpression'))shapes.set(collection.value,{fields:fields.elements.map(v=>v.value),literal:literal?.elements.map(v=>v.value)||[]});
    }
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
  };
  for(const script of fs.readFileSync(source,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))walk(parse(script[1],{ecmaVersion:'latest'}));
}
const reference=shapes.size?require(path.join(path.dirname(source),'search-core.js')):null;
const documents={
  video:[{id:'a',original_filename:'重庆森林.mp4',folder_label:'旅行',original_resolution:'1920×1080',original_duration:99.75,original_filesize:7654321,status:'processing',duration_seconds:456,codec:'not-a-search-field'},
    {id:'b',original_filename:'沿途.mp4',folder_label:'城市',original_resolution:'640x360',original_duration:0,original_filesize:0,status:'ready'},
    {id:'c',original_filename:'Other.mp4',folder_label:'清晨',original_resolution:'1920X1080',original_duration:22,original_filesize:123,status:'failed'}],
  picture:[{id:'a',original_filename:'重庆.webp',folder_label:'旅行',original_resolution:'2560×1600',codec:'not-a-search-field'},{id:'b',original_filename:'街景.webp',folder_label:'城市',original_resolution:'640x360'}],
  novel:[{id:'a',title:'重庆故事',folder_label:'旅行',resolution:'not-a-search-field'},{id:'b',title:'',original_filename:'not-a-book-title',folder_label:'城市'}],
  favorite:[{id:'a',type:'video',title:'片名',filename:'重庆森林.mp4',folder_label:'旅行',resolution:'not-a-search-field'},
    {id:'b',type:'picture',title:'',filename:'城市.webp',folder_label:'相册'},{id:'c',type:'novel',title:null,filename:null,folder_label:'书架'}],
};
const create=()=>new I.Catalog({search,dictionary,tags});
const keys=rows=>rows.map(row=>(row.kind||row.type||'video')+':'+row.id).sort();
for(const [query,expected]of [['processing',['a']],['99.75',['a']],['7654321',['a']],['1920×1080',['a']],['0',['a','b','c']]])test('video technical search preserves the actual raw field: '+query,async()=>{
  const c=create();c.set('video',documents.video);assert.deepEqual((await c.query({kind:'video',search:query})).items.map(v=>v.id).sort(),expected);
});
test('favorite search includes filename even when the display title is different',async()=>{
  const c=create();c.set('favorite',documents.favorite);for(const query of ['重庆','chongqing','cqsl'])assert.deepEqual((await c.query({kind:'favorite',search:query})).items.map(v=>v.id),['a']);
});
test('display fallbacks and normalized technical metadata do not invent searchable fields',async()=>{
  for(const kind of Object.keys(documents)){const c=create();c.set(kind,documents[kind]);assert.equal((await c.query({kind,search:'not-a-search-field'})).total,0);}
  const c=create();c.set('novel',documents.novel);assert.equal((await c.query({kind:'novel',search:'not-a-book-title'})).total,0);
});
test('replacing a catalog replaces searchable metadata instead of reusing old raw fields',async()=>{
  const c=create();c.set('favorite',documents.favorite);assert.equal((await c.query({kind:'favorite',search:'cqsl'})).total,1);
  c.set('favorite',[{...documents.favorite[0],filename:'山海.mp4'}]);assert.equal((await c.query({kind:'favorite',search:'cqsl'})).total,0);assert.equal((await c.query({kind:'favorite',search:'shanhai'})).total,1);
});
test('raw title snapshots stay private and do not change when a caller mutates its input later',async()=>{
  const c=create(),source={id:'a',type:'novel',title:'原来标题',filename:'另外文件.txt',folder_label:'书架'};
  c.set('favorite',[source]);source.title='后来的标题';
  assert.equal((await c.query({kind:'favorite',search:'yuanlai'})).total,1);assert.equal((await c.query({kind:'favorite',search:'houlai'})).total,0);
  const rows=(await c.query({kind:'favorite'})).items;assert.equal(rows[0].title,'原来标题');assert(!JSON.stringify(rows).includes('searchTitles'));
});
test('the HTTP favorite fixture supplies real title/filename fields for all three media kinds',async t=>{
  const fixture=await rhvideoFixture({videoCount:1,pictureCount:1});t.after(()=>fixture.close());
  for(const key of ['video:video-0','picture:picture-0','novel:novel-0'])fixture.favorites.add(key);
  const value=await(await fetch(fixture.url+'/api/v1/favorites',{headers:{Authorization:'Bearer fixture-bearer-do-not-persist'}})).json();
  assert.equal(value.items.length,3);for(const row of value.items){assert.equal(typeof row.title,'string');assert.equal(typeof row.filename,'string');assert(row.title);assert(row.filename);if(row.type==='novel')assert.equal(row.filename,row.title+'.txt');}
});
for(const [kind,collection]of [['video','videos'],['picture','pictures'],['novel','novels'],['favorite','favorites']])test('differential: actual reference '+collection+' search projection and dictionary',{skip:!reference},async()=>{
  const shape=shapes.get(collection);assert(shape,'Missing actual reference search shape: '+collection);
  const oracle=new reference.Index(dictionary),c=create();c.set(kind,documents[kind]);
  for(const row of documents[kind])oracle.upsert({key:(row.type||kind)+':'+row.id,fields:shape.fields.map(field=>String(row[field]??'')),literal:shape.literal.map(field=>String(row[field]??''))});
  for(const query of ['重庆','重qing','chongqing','cq','lvxing','99.75','7654321','processing','ready','0','1920×1080','1920X1080','2560×1600','456','not-a-search-field','not-a-book-title','c'])assert.deepEqual(keys((await c.query({kind,search:query})).items),Array.from(oracle.search(query)).sort(),kind+' query '+query);
});
