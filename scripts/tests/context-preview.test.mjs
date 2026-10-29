import test from 'node:test';
import assert from 'node:assert/strict';
import {context,load,plain} from '../testing/source.mjs';

function fixture(){
  const pane=()=>({path:'C:\\qa',entries:[{path:'C:\\qa\\a.txt'},{path:'C:\\qa\\b.txt'},{path:'C:\\qa\\c.txt'}],sel:new Set([0]),lastIdx:0});
  const left=pane(),right=pane(),events=[];
  const ctx=context({G:{layout:'details',lastActivePane:'left',dualOn:true,rp:right,previewOn:true,inspectorTab:'preview'},
    getTab:()=>left,document:{getElementById:id=>({id})},focusFilePane:el=>events.push(['focus',el.id]),
    updatePaneFocusUI:()=>{},renderFiles:()=>events.push(['render']),updatePreviewForSelection:()=>events.push(['preview']),fileChoiceRefreshSelection:()=>{},updateStatus:()=>{}});
  load(ctx,'filelist.js',['activeColumnSelection','applyMouseFileSelection','selectContextTarget','selectColumnTarget','selectedEntriesForPane','getSelectedPaths']);
  return {ctx,left,right,events};
}
for(const isRight of [false,true])test(`right-click changes preview and active pane: ${isRight?'right':'left'}`,()=>{
  const {ctx,left,right,events}=fixture(),pane=isRight?right:left;
  pane._columnSelection={root:pane.path,entry:{path:'stale'}};
  ctx.selectContextTarget(1,pane,isRight?'right-file-list':'file-list',isRight);
  assert.deepEqual([...pane.sel],[1]);assert.equal(pane.lastIdx,1);assert.equal(pane._columnSelection,undefined);
  assert.equal(ctx.G.lastActivePane,isRight?'right':'left');assert.deepEqual(events.map(e=>e[0]),['focus','render','preview']);
  assert.deepEqual(plain(ctx.getSelectedPaths()),[pane.entries[1]]);
});
test('right-click preserves a multi-selection when its target is already selected',()=>{
  const {ctx,left,events}=fixture();left.sel=new Set([0,2]);
  ctx.selectContextTarget(2,left,'file-list',false);
  assert.deepEqual([...left.sel],[0,2]);assert.deepEqual(events.map(e=>e[0]),['focus','preview']);
});
test('nested column selection is the actual preview/command target, never a stale root row',()=>{
  const {ctx,left}=fixture();ctx.G.layout='columns';const child={path:'C:\\qa\\folder\\child.txt'};
  ctx.selectColumnTarget(child,left,'file-list',false);
  assert.equal(left.sel.size,0);assert.deepEqual(plain(ctx.getSelectedPaths()),[child]);
  left.path='C:\\other';assert.deepEqual(plain(ctx.getSelectedPaths()),[]);
  left.path='C:\\qa';ctx.G.layout='details';assert.deepEqual(plain(ctx.getSelectedPaths()),[]);
});
test('late preview completion from the inactive pane cannot replace the current pane',()=>{
  const {ctx,left,right}=fixture();ctx._previewRequestToken=10;
  load(ctx,'pane.js',['previewRequestIsCurrent']);
  assert.equal(ctx.previewRequestIsCurrent(10,left.entries[0].path,false),true);
  ctx.G.lastActivePane='right';assert.equal(ctx.previewRequestIsCurrent(10,left.entries[0].path,false),false);
  assert.equal(ctx.previewRequestIsCurrent(10,right.entries[0].path,true),true);
  assert.equal(ctx.previewRequestIsCurrent(9,right.entries[0].path,true),false);
});
