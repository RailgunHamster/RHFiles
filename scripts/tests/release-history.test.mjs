import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import fc from 'fast-check';
import {root,propertyOptions} from '../testing/source.mjs';
const source=fs.readFileSync(path.join(root,'src/js/release-history.js'),'utf8');
const model=vm.runInNewContext(source+';releaseHistoryPages');
const entries=n=>Array.from({length:n},(_,i)=>({version:String(n-i),id:i}));
const ids=items=>Array.from(items,v=>v.id);

test('one latest release and ten-record history pages partition without overlap, omissions or mutation',()=>{
  fc.assert(fc.property(fc.integer({min:0,max:2000}),n=>{
    const records=Object.freeze(entries(n)),first=model.split(records),seen=[...ids(first.recent)];
    assert.equal(first.recent.length,Math.min(1,n));
    assert.deepEqual(ids(first.recent),n?[0]:[]);
    for(let page=1;page<=first.pages;page++){
      const state=model.split(records,page);assert(state.older.length<=10);assert.equal(state.page,page);
      seen.push(...ids(state.older));
    }
    assert.deepEqual(seen,ids(records));assert.equal(records.length,n);
  }),propertyOptions());
});
for(const n of [0,1,2,9,10,11,12,20,21,22,30,31,32,100])test(`history boundary ${n} keeps only the latest release separate`,()=>{
  const records=entries(n),state=model.split(records,Infinity),last=model.split(records,Number.MAX_SAFE_INTEGER);
  assert.equal(state.page,1);assert.equal(state.totalOlder,Math.max(0,n-1));
  assert.equal(last.pages,Math.max(1,Math.ceil((n-1)/10)));assert.equal(last.page,last.pages);
  assert(last.recent.length+last.older.length<=11);
});
test('a refreshed smaller history clamps its page and never moves recent entries into older history',()=>{
  const old=model.split(entries(103),10);assert.equal(old.page,10);
  const refreshed=model.split(entries(11),old.page);assert.equal(refreshed.page,1);assert.deepEqual(ids(refreshed.older),[1,2,3,4,5,6,7,8,9,10]);
  const empty=model.split([],old.page);assert.equal(empty.page,1);assert.equal(empty.older.length,0);
});

test('the first history page starts immediately after the featured latest release',()=>{
  const records=entries(22),first=model.split(records),second=model.split(records,2),last=model.split(records,3);
  assert.deepEqual(ids(first.recent),[0]);assert.deepEqual(ids(first.older),[1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(ids(second.older),[11,12,13,14,15,16,17,18,19,20]);assert.deepEqual(ids(last.older),[21]);
  assert.equal(first.pages,3);
});
test('Android ships exactly the same pagination model',()=>assert.equal(source,fs.readFileSync(path.join(root,'android/web/js/release-history.js'),'utf8')));
