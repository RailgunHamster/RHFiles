import test from 'node:test';
import assert from 'node:assert/strict';
import {context,load,plain} from '../testing/source.mjs';

function selectionFixture(){
  const pane={path:'C:\\qa',entries:Array.from({length:6},(_,i)=>({path:'C:\\qa\\'+i})),sel:new Set(),lastIdx:-1};
  const ctx=context({G:{layout:'columns',dualOn:false,lastActivePane:'left'},getTab:()=>pane,
    document:{getElementById:()=>({})},focusFilePane:()=>{},updatePaneFocusUI:()=>{},updateStatus:()=>{},updatePreviewForSelection:()=>{}});
  load(ctx,'filelist.js',['activeColumnSelection','selectedEntriesForPane','getSelectedPaths','applyMouseFileSelection','selectColumnTarget']);
  return {ctx,pane};
}

test('mouse selection uses the live Set, keeps disjoint items and extends a Ctrl+Shift range',()=>{
  const {ctx,pane}=selectionFixture();
  ctx.applyMouseFileSelection({},1,pane);ctx.applyMouseFileSelection({ctrlKey:true},4,pane);
  assert.deepEqual([...pane.sel],[1,4]);
  ctx.applyMouseFileSelection({ctrlKey:true,shiftKey:true},5,pane);assert.deepEqual([...pane.sel],[1,4,5]);
  ctx.applyMouseFileSelection({shiftKey:true},2,pane);assert.deepEqual([...pane.sel],[2,3,4]);
  ctx.applyMouseFileSelection({ctrlKey:true},3,pane);assert.deepEqual([...pane.sel],[2,4]);
});

test('a row rendered before a selection Set replacement still modifies the live selection',()=>{
  const {ctx,pane}=selectionFixture(),oldSet=pane.sel;
  ctx.document.getElementById=()=>({querySelectorAll:()=>[]});
  load(ctx,'filelist.js',['handleRowClick']);
  pane.sel=new Set([0]);ctx.handleRowClick({ctrlKey:true},2,oldSet,pane,false);
  assert.deepEqual([...pane.sel],[0,2]);assert.equal(oldSet.size,0);
});

test('nested column selection, copy paths and context targeting share the full selection',()=>{
  const {ctx,pane}=selectionFixture(),state={entries:[{path:'child/a'},{path:'child/b'},{path:'child/c'}],sel:new Set(),lastIdx:-1};
  const select=(index,extra={})=>ctx.selectColumnTarget(state.entries[index],pane,'file-list',false,{state,index,...extra});
  select(0);select(2,{event:{ctrlKey:true}});
  assert.deepEqual(plain(ctx.getSelectedPaths(false)).map(e=>e.path),['child/a','child/c']);
  select(0,{preserve:true});assert.deepEqual(plain(ctx.getSelectedPaths(false)).map(e=>e.path),['child/a','child/c']);
  let copied;ctx.resolveRightPane=()=>false;ctx.copyPathsFromMenu=paths=>{copied=plain(paths);};
  load(ctx,'ops.js',['copySelectedPaths']);ctx.copySelectedPaths(false);assert.deepEqual(copied,['child/a','child/c']);
  select(1,{preserve:true});assert.deepEqual(plain(ctx.getSelectedPaths(false)).map(e=>e.path),['child/b']);
  ctx.paintColumnSelection=()=>{};ctx.renderFiles=()=>assert.fail('Child selection must not rebuild the root columns');
  load(ctx,'filelist.js',['selectAll']);load(ctx,'selection.js',['invertSelection']);
  ctx.invertSelection(false);assert.deepEqual(plain(ctx.getSelectedPaths(false)).map(e=>e.path),['child/a','child/c']);
  ctx.selectAll(false);assert.equal(ctx.getSelectedPaths(false).length,3);
  pane.path='C:\\other';assert.deepEqual(plain(ctx.getSelectedPaths(false)),[]);
});

function marqueeFixture(){
  const handlers={},frames=new Map();let nextFrame=0;
  const pane={sel:new Set(),entries:[{path:'a'},{path:'b'},{path:'c'}],lastIdx:-1};
  const rows=pane.entries.map((_,index)=>({dataset:{index:String(index)},
    getBoundingClientRect:()=>({left:0,top:index*30,width:200,height:30}),classList:{toggle:()=>{}}}));
  const list={id:'file-list',scrollLeft:0,scrollTop:0,style:{},focus:()=>{},
    addEventListener:(type,handler)=>(handlers['list:'+type]??=[]).push(handler),
    getBoundingClientRect:()=>({left:0,right:200,top:0}),appendChild:()=>{},querySelectorAll:()=>rows};
  const ctx=context({G:{},getTab:()=>pane,focusFilePane:()=>{},updateStatus:()=>{},
    requestAnimationFrame:fn=>{const id=++nextFrame;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    document:{createElement:()=>({style:{},remove:()=>{}}),querySelector:()=>null,
      addEventListener:(type,handler)=>(handlers[type]??=[]).push(handler)}});
  load(ctx,'selection.js');ctx.initBoxSelection(list);
  const fire=(type,data={})=>{for(const handler of handlers[type]||[])handler({target:{closest:()=>null},button:0,clientX:20,clientY:5,...data});};
  return {ctx,pane,list,frames,fire};
}

test('releasing a marquee before its animation frame commits the final complete selection',()=>{
  const {pane,frames,fire}=marqueeFixture();
  fire('list:mousedown');fire('mousemove',{clientX:190,clientY:80});assert.equal(frames.size,1);
  fire('mouseup',{clientX:190,clientY:80});
  assert.deepEqual([...pane.sel],[0,1,2]);assert.equal(pane.lastIdx,2);assert.equal(frames.size,0);
});

test('Ctrl marquee preserves only the original base and the current rectangle, not old frames',()=>{
  const {ctx,pane,list}=marqueeFixture();pane.sel=new Set([2]);
  ctx.selectFilesInRect(list,0,0,180,50,true,[2]);assert.deepEqual([...pane.sel],[2,0,1]);
  ctx.selectFilesInRect(list,0,0,180,20,true,[2]);assert.deepEqual([...pane.sel],[2,0]);
  ctx.selectFilesInRect(list,0,150,180,20,false,[]);assert.deepEqual([...pane.sel],[]);assert.equal(pane.lastIdx,-1);
});

test('marquee refresh remaps the additive base by path instead of old indices',()=>{
  const {pane,fire}=marqueeFixture();pane.sel=new Set([2]);
  fire('list:mousedown',{clientY:65,ctrlKey:true});fire('mousemove',{clientX:190,clientY:85,ctrlKey:true});
  pane.entries=[pane.entries[2],pane.entries[0],pane.entries[1]];
  fire('mouseup',{clientX:190,clientY:85,ctrlKey:true});
  assert.deepEqual([...pane.sel],[0,2]);assert.deepEqual([...pane.sel].map(i=>pane.entries[i].path),['c','b']);
});

test('a marquee finishing after a tab change cannot alter the new tab selection',()=>{
  const {ctx,pane,fire}=marqueeFixture(),other={...pane,sel:new Set([1])};
  fire('list:mousedown');fire('mousemove',{clientX:190,clientY:80});ctx.getTab=()=>other;
  fire('mouseup',{clientX:190,clientY:80});
  assert.deepEqual([...other.sel],[1]);assert.equal(pane.sel.size,0);
});
