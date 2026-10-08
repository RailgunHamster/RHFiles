import test from 'node:test';
import assert from 'node:assert/strict';
import {context,load,plain} from '../testing/source.mjs';

const members=[
  {path:'root.txt',name:'root.txt',size:1,is_dir:false},
  {path:'A/',name:'A',is_dir:true},
  {path:'A/deep/same.txt',name:'same.txt',size:2,is_dir:false},
  {path:'B\\deep\\same.txt',name:'same.txt',size:3,is_dir:false},
  {path:'A/empty/',name:'empty',is_dir:true},
];
function archive() {
  const pane={path:'C:\\data',archivePath:'C:\\data\\test.zip',archiveEntries:members,archivePrefix:'',entries:[],sel:new Set()};
  const ctx=context({G:{rp:pane},getTab:()=>pane,fmtSize:size=>String(size||0),renderFiles:()=>{}});
  load(ctx,'git.js',['archivePane','archiveDirectoryEntries','showArchiveDirectory','enterArchiveDirectory','goUpArchive']);
  return {ctx,pane};
}
test('archive root shows only direct members and infers missing parent directories',()=>{
  const {ctx}=archive();const entries=plain(ctx.archiveDirectoryEntries(members));
  assert.deepEqual(entries.map(entry=>[entry.name,entry.is_dir]),[['root.txt',false],['A',true],['B',true]]);
  assert.ok(!entries.some(entry=>entry.name==='same.txt'),'nested files must not appear at ZIP root');
});
test('archive folder navigation preserves full member paths and separates duplicate leaf names',async()=>{
  const {ctx,pane}=archive();ctx.showArchiveDirectory(pane,'',false);ctx.enterArchiveDirectory('A/',false);
  assert.equal(pane.archivePrefix,'A/');assert.deepEqual(plain(pane.entries.map(entry=>entry.name)),['deep','empty']);
  ctx.enterArchiveDirectory('A/deep',false);assert.equal(pane.entries[0].path,'A/deep/same.txt');
  assert.equal(pane.entries[0].size,2);await ctx.goUpArchive(false);await ctx.goUpArchive(false);
  ctx.enterArchiveDirectory('B',false);ctx.enterArchiveDirectory('B/deep',false);
  assert.equal(pane.entries[0].path,'B\\deep\\same.txt');assert.equal(pane.entries[0].size,3);
});
test('empty archive folders stay empty and navigating a nonexistent folder leaves state intact',()=>{
  const {ctx,pane}=archive();ctx.showArchiveDirectory(pane,'A/',true);ctx.enterArchiveDirectory('A/empty/',true);
  assert.equal(pane.entries.length,0);ctx.enterArchiveDirectory('missing',true);assert.equal(pane.archivePrefix,'A/empty/');
});
