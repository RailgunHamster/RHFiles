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

test('recent releases and older pages partition history without overlap, omissions or mutation',()=>{
  fc.assert(fc.property(fc.integer({min:0,max:2000}),n=>{
    const records=Object.freeze(entries(n)),first=model.split(records),seen=[...ids(first.recent)];
    assert.equal(first.recent.length,Math.min(10,n));
    for(let page=1;page<=first.pages;page++){
      const state=model.split(records,page);assert(state.older.length<=10);assert.equal(state.page,page);
      seen.push(...ids(state.older));
    }
    assert.deepEqual(seen,ids(records));assert.equal(records.length,n);
  }),propertyOptions());
});
for(const n of [0,1,9,10,11,19,20,21,30,31,100])test(`history boundary ${n} keeps the latest ten separate`,()=>{
  const records=entries(n),state=model.split(records,Infinity),last=model.split(records,Number.MAX_SAFE_INTEGER);
  assert.equal(state.page,1);assert.equal(state.totalOlder,Math.max(0,n-10));
  assert.equal(last.pages,Math.max(1,Math.ceil((n-10)/10)));assert.equal(last.page,last.pages);
  assert(last.recent.length+last.older.length<=20);
});
test('a refreshed smaller history clamps its page and never moves recent entries into older history',()=>{
  const old=model.split(entries(103),10);assert.equal(old.page,10);
  const refreshed=model.split(entries(11),old.page);assert.equal(refreshed.page,1);assert.deepEqual(ids(refreshed.older),[10]);
  const empty=model.split([],old.page);assert.equal(empty.page,1);assert.equal(empty.older.length,0);
});
test('Android ships exactly the same pagination model',()=>assert.equal(source,fs.readFileSync(path.join(root,'android/web/js/release-history.js'),'utf8')));
