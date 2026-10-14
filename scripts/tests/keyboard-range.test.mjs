import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {context, load, propertyOptions} from '../testing/source.mjs';

function fixture(count=10) {
  const ctx=context();load(ctx,'keyboard.js',['applyArrowFileSelection','gridNavigationIndex']);
  const pane={path:'C:\\fixture',entries:Array.from({length:count},(_,i)=>({path:'C:\\fixture\\'+i})),sel:new Set(),lastIdx:-1};
  const move=(key,shift=true,ctrl=false,columns=1)=>{
    const current=pane.lastIdx;
    const next=ctx.gridNavigationIndex(current,key,pane.entries.length,columns);
    ctx.applyArrowFileSelection(pane,current,next,shift,ctrl);
  };
  return {ctx,pane,move};
}

test('Shift+arrows expands, contracts and crosses a stable anchor',()=>{
  const {pane,move}=fixture();pane.lastIdx=3;pane.sel.add(3);
  move('ArrowDown');assert.deepEqual([...pane.sel],[3,4]);
  move('ArrowDown');assert.deepEqual([...pane.sel],[3,4,5]);
  move('ArrowUp');assert.deepEqual([...pane.sel],[3,4]);
  move('ArrowUp');assert.deepEqual([...pane.sel],[3]);
  move('ArrowUp');assert.deepEqual([...pane.sel],[2,3]);
  move('ArrowUp');assert.deepEqual([...pane.sel],[1,2,3]);
  move('ArrowDown',false);assert.deepEqual([...pane.sel],[2]);
  move('ArrowDown');assert.deepEqual([...pane.sel],[2,3]);
});

test('Shift+arrows starts selection when none is selected and respects boundaries',()=>{
  const {pane,move}=fixture(3);
  move('ArrowDown');assert.deepEqual([...pane.sel],[0]);
  move('ArrowDown');move('ArrowDown');move('ArrowDown');assert.deepEqual([...pane.sel],[0,1,2]);
  move('ArrowUp');assert.deepEqual([...pane.sel],[0,1]);
  const up=fixture(3);up.move('ArrowUp');assert.deepEqual([...up.pane.sel],[2]);
  up.move('ArrowUp');assert.deepEqual([...up.pane.sel],[1,2]);
});

test('Ctrl+Shift preserves disjoint selections while the current range contracts',()=>{
  const {pane,move}=fixture();pane.sel=new Set([0,5]);pane.lastIdx=5;
  move('ArrowDown',true,true);assert.deepEqual([...pane.sel],[0,5,6]);
  move('ArrowDown',true,true);assert.deepEqual([...pane.sel],[0,5,6,7]);
  move('ArrowUp',true,true);assert.deepEqual([...pane.sel],[0,5,6]);
});

for(const change of ['focus','selection','entries','path']) test(`range anchor resets after external ${change} changes`,()=>{
  const {pane,move}=fixture();pane.lastIdx=2;pane.sel.add(2);move('ArrowDown');
  if(change==='focus')pane.lastIdx=6;
  if(change==='selection')pane.sel=new Set([3]);
  if(change==='entries')pane.entries=[...pane.entries].reverse();
  if(change==='path')pane.path='C:\\other';
  const start=pane.lastIdx;move('ArrowDown');assert.deepEqual([...pane.sel],[start,start+1]);
});

test('independent panes keep their own anchors and grids follow visual movement',()=>{
  const left=fixture(),right=fixture();left.pane.lastIdx=1;left.pane.sel.add(1);
  right.pane.lastIdx=7;right.pane.sel.add(7);
  left.move('ArrowDown',true,false,3);assert.deepEqual([...left.pane.sel],[1,2,3,4]);
  right.move('ArrowUp');assert.deepEqual([...right.pane.sel],[6,7]);
  left.move('ArrowRight');assert.deepEqual([...left.pane.sel],[1,2,3,4,5]);
  left.move('ArrowLeft');assert.deepEqual([...left.pane.sel],[1,2,3,4]);
});

test('arbitrary Shift+arrow sequences keep exactly the anchor-to-focus range',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:100}),fc.nat(),fc.array(fc.constantFrom('ArrowUp','ArrowDown'),{maxLength:100}),(count,seed,keys)=>{
    const {pane,move}=fixture(count),anchor=seed%count;pane.lastIdx=anchor;pane.sel.add(anchor);
    for(const key of keys){move(key);const begin=Math.min(anchor,pane.lastIdx),end=Math.max(anchor,pane.lastIdx);
      assert.deepEqual([...pane.sel],Array.from({length:end-begin+1},(_,i)=>begin+i));}
  }),propertyOptions());
});
