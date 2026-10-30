import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {parse} from 'acorn';
const require=createRequire(import.meta.url),I=require('../../src/js/rhvideo-index.js');
const source=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
let reference;
if(fs.existsSync(source))for(const script of fs.readFileSync(source,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
  const node=parse(script[1],{ecmaVersion:'latest'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='applyVideoSort');
  if(node)reference=vm.runInNewContext('('+script[1].slice(node.start,node.end)+')');
}
const ids=rows=>Array.from(rows,row=>row.id);
const query=async(rows,sort)=>{const c=new I.Catalog();c.set('video',rows);return ids((await c.query({kind:'video',sort,limit:100,allKeys:true})).items);};
const equalRows=()=>['z-first','a-second','m-third'].map(id=>({id,original_filename:'同一个名称.mp4',original_filesize:123,created_at:'2026-10-30T00:00:00.123456Z'}));
for(const sort of ['nameAsc','nameDesc','dateDesc','dateAsc','sizeDesc','sizeAsc'])test('video '+sort+' ties retain server order, not media IDs',async()=>{
  const rows=equalRows();assert.deepEqual(await query(rows,sort),ids(rows));
});
test('video name sort uses the original filename and the reference lexical digit ordering',async()=>{
  const rows=[{id:'two',original_filename:'片段2.mp4',title:'A'},{id:'ten',original_filename:'片段10.mp4',title:'Z'}];
  assert.deepEqual(await query(rows,'nameAsc'),['ten','two']);assert.deepEqual(await query(rows,'nameDesc'),['two','ten']);
});
test('video size sort uses original_filesize including zero, not source/derived size fallbacks',async()=>{
  const rows=[{id:'zero',original_filesize:0,source_size:999},{id:'one',original_filesize:1,source_size:1}];
  assert.deepEqual(await query(rows,'sizeAsc'),['zero','one']);assert.deepEqual(await query(rows,'sizeDesc'),['one','zero']);
});
test('updating an equal-key video catalog restores that new source order in pages and playback snapshots',async()=>{
  const c=new I.Catalog(),rows=equalRows();c.set('video',rows);
  await c.query({kind:'video',sort:'dateDesc',allKeys:true});
  const changed=[{...rows[2],id:'b-new'},rows[2],rows[0]];c.set('video',changed);
  const value=await c.query({kind:'video',sort:'dateDesc',limit:1,allKeys:true});assert.deepEqual(ids(value.queue),ids(changed));assert.equal(value.items[0].id,'b-new');
  assert.equal((await c.query({kind:'video',sort:'dateDesc',offset:1,limit:1})).items[0].id,'m-third');
});
for(const [sort,original]of [['nameAsc','name'],['dateDesc','date-desc'],['dateAsc','date-asc'],['sizeDesc','size-desc'],['sizeAsc','size-asc']])test('differential: actual reference applyVideoSort '+original,{skip:!reference},async()=>{
  const rows=[
    {id:'z',original_filename:'片段2.mp4',title:'显示 A',original_filesize:0,source_size:10000,created_at:'2026-10-30T00:00:00.123456Z'},
    {id:'a',original_filename:'片段10.mp4',title:'显示 Z',original_filesize:1,source_size:1,created_at:'2026-10-30T00:00:00.123457Z'},
    {id:'q',original_filename:'片段2.mp4',original_filesize:0,created_at:null},
    {id:'b',original_filename:'阿尔法.mp4',original_filesize:2,created_at:'not a date'},
    {id:'c',original_filename:'',filename:'不是排序名称',original_filesize:null,filesize:999,created_at:'2020-01-01'},
  ];
  for(const values of [rows,rows.slice().reverse(),equalRows()])assert.deepEqual(await query(values,sort),ids(reference(values,original)));
});
test('differential: all 150 playback IDs and every page keep the actual reference sort',{skip:!reference},async()=>{
  const rows=Array.from({length:150},(_,i)=>({id:'id-'+(150-i),original_filename:'片段'+(i%13)+'.mp4',original_filesize:i%4,created_at:new Date(Date.UTC(2026,0,1+i%3)).toISOString()}));
  const c=new I.Catalog();c.set('video',rows);
  for(const [sort,by]of [['nameAsc','name'],['dateDesc','date-desc'],['dateAsc','date-asc'],['sizeDesc','size-desc'],['sizeAsc','size-asc']]){
    const expected=ids(reference(rows,by)),value=await c.query({kind:'video',sort,limit:36,allKeys:true});
    assert.deepEqual(ids(value.queue),expected);assert.deepEqual(ids(value.items),expected.slice(0,36));
    for(let offset=36;offset<rows.length;offset+=36)assert.deepEqual(ids((await c.query({kind:'video',sort,offset,limit:36})).items),expected.slice(offset,offset+36));
  }
});
