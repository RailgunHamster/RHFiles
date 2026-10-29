import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../../src/js/rhvideo-rules-model.js');
test('continuous tag viewport crosses old page boundaries without a separate page or an unbounded DOM',()=>{
  const first=M.viewport({total:240,extent:280,top:0});assert.equal(first.offset,0);assert.equal(first.first,0);assert.equal(first.last,5);
  const crossing=M.viewport({total:240,extent:280,top:78*56,offset:0});assert(crossing.offset>0&&crossing.offset<=78);assert(crossing.offset+80>=crossing.last);assert.equal(crossing.top,78*56);
  const end=M.viewport({total:240,extent:280,top:Number.MAX_SAFE_INTEGER,offset:0});assert.equal(end.first,235);assert.equal(end.last,240);assert.equal(end.offset,160);assert.equal(end.logicalTop,240*56-280);
});
test('a million tags remain physically scrollable and all visible rows retain exact local geometry',()=>{
  const end=M.viewport({total:1000000,extent:336,top:90000000});assert.equal(end.maxTop,8000000);assert.equal(end.last,1000000);assert.equal(end.first,999994);assert.equal(M.rowTop(end.first,end),end.top);assert.equal(M.rowTop(end.last,end),end.top+336);
  const next=M.viewport({total:1000000,extent:336,top:(end.logicalTop-56)/end.scale,offset:end.offset});assert.equal(next.first,999993);assert.equal(next.logicalTop,end.logicalTop-56);
});
test('query shrink clamps once, resize keeps the complete visible range, and empty views have no ghost rows',()=>{
  const shrunk=M.viewport({total:3,extent:280,top:6000,offset:80});assert.equal(shrunk.offset,0);assert.equal(shrunk.top,0);assert.equal(shrunk.last,3);
  const empty=M.viewport({total:0,extent:280,top:6000,offset:80});assert.equal(empty.offset,0);assert.equal(empty.first,0);assert.equal(empty.last,0);assert.equal(empty.maxTop,0);
  const page=M.viewport({total:240,extent:280,top:80*56,offset:80});assert.equal(page.offset,80,'Existing explicit page API remains compatible even though its UI is gone');
});
test('random continuous windows cover every visible row, respect the native scroll cap and never oscillate',()=>{
  let seed=0x17abcd;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let i=0;i<10000;i++){const total=random(1000001),extent=80+random(600),top=random(90000001),offset=random(1000001),view=M.viewport({total,extent,top,offset});assert(view.offset<=view.first);assert(view.offset+80>=view.last);assert(view.offset>=0&&view.offset<=Math.max(0,total-80));assert(view.top>=0&&view.top<=view.maxTop);assert(view.maxTop<=8000000);assert.deepEqual(M.viewport({total,extent,top:view.top,offset:view.offset}),view);}
  for(const args of [{total:-1},{total:1.5},{total:1,extent:0},{total:1,top:NaN},{total:1,rowHeight:0}])assert.throws(()=>M.viewport(args));
});
