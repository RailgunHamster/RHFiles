import test from 'node:test';
import assert from 'node:assert/strict';
import {context,load,plain,deferred} from '../testing/source.mjs';

const row=(name,size=1)=>({name,path:'C:\\data\\'+name,is_dir:false,size});
function refreshFixture() {
  const requests=[],renders=[],errors=[],metadata=[],scroll={scrollTop:148};
  const tab={id:1,path:'C:\\data',entries:[row('a'),row('c')],sel:new Set([1]),lastIdx:1,sortF:'name',sortAsc:true,_loaded:true};
  const ctx=context({G:{activeTab:1},t:x=>x,withTimeout:p=>p,entryVisible:()=>true,
    listPathEntries:()=>{const d=deferred();requests.push(d);return d.promise;},
    renderFiles:()=>{renders.push(tab.path);scroll.scrollTop=0;},updateStatus:()=>{},
    renderNavigationLoading:()=>{},renderNavigationError:(_,e)=>errors.push(String(e)),
    _refreshTabMeta:()=>metadata.push(tab.path),document:{getElementById:()=>scroll},
  });
  load(ctx,'filelist.js',['naturalCompare','sortableDateValue','sortEntriesList']);
  load(ctx,'tabs.js',['_refreshTabInBackground','_entriesChanged']);
  return {ctx,tab,requests,renders,errors,metadata,scroll};
}
for(const lateFailure of [false,true]) test(`out-of-order listing ${lateFailure?'failure':'success'} cannot replace the newer listing`,async()=>{
  const h=refreshFixture();const first=h.ctx._refreshTabInBackground(h.tab),second=h.ctx._refreshTabInBackground(h.tab);
  h.requests[1].resolve([row('newest')]);await second;
  if(lateFailure)h.requests[0].reject(Error('old network failure'));else h.requests[0].resolve([row('stale')]);
  await first;assert.deepEqual(plain(h.tab.entries).map(e=>e.name),['newest']);assert.equal(h.tab._loaded,true);
  assert.deepEqual(h.errors,[]);assert.equal(h.renders.length,1);
});
for(const lateFailure of [false,true]) test(`leaving a folder invalidates pending listing ${lateFailure?'failure':'success'}`,async()=>{
  const h=refreshFixture();const first=h.ctx._refreshTabInBackground(h.tab);h.tab.path='D:\\elsewhere';
  h.tab.entries=[row('current')];
  if(lateFailure)h.requests[0].reject(Error('old failure'));else h.requests[0].resolve([row('old')]);await first;
  assert.equal(h.tab.entries[0].name,'current');assert.deepEqual(h.errors,[]);assert.equal(h.renders.length,0);
});
test('background insertion preserves selected path and scroll, not the old row index',async()=>{
  const h=refreshFixture();const pending=h.ctx._refreshTabInBackground(h.tab);
  h.requests[0].resolve([row('c'),row('b'),row('a')]);await pending;
  assert.deepEqual([...h.tab.sel],[2]);assert.equal(h.tab.entries[h.tab.lastIdx].name,'c');assert.equal(h.scroll.scrollTop,148);
});
test('background deletion drops removed selection without selecting its replacement row',async()=>{
  const h=refreshFixture();const pending=h.ctx._refreshTabInBackground(h.tab);h.requests[0].resolve([row('a'),row('d')]);await pending;
  assert.equal(h.tab.sel.size,0);assert.equal(h.tab.lastIdx,-1);
});
test('unchanged listing avoids redraw, changed metadata redraws once',async()=>{
  const h=refreshFixture();let pending=h.ctx._refreshTabInBackground(h.tab);h.requests[0].resolve([row('a'),row('c')]);await pending;
  assert.equal(h.renders.length,0);pending=h.ctx._refreshTabInBackground(h.tab);h.requests[1].resolve([row('a',99),row('c')]);await pending;
  assert.equal(h.renders.length,1);assert.equal(h.tab.entries[0].size,99);
});
for(const path of ['home://','archive']) test(`${path} is not sent to ordinary directory refresh`,async()=>{
  const h=refreshFixture();if(path==='archive')h.tab.archivePath='C:\\a.zip';else h.tab.path=path;
  await h.ctx._refreshTabInBackground(h.tab);assert.equal(h.requests.length,0);
});
test('refreshing an inactive tab must not replace the active tree or VCS metadata',()=>{
  const calls=[];const ctx=context({G:{activeTab:1},loadTree:p=>calls.push(p),loadGitStatus:p=>calls.push(p),loadSvnStatus:p=>calls.push(p)});
  load(ctx,'tabs.js',['_refreshTabMeta']);ctx._refreshTabMeta({id:2,path:'D:\\background'},true);assert.deepEqual(calls,[]);
  ctx._refreshTabMeta({id:1,path:'C:\\active'},true);assert.deepEqual(calls,['C:\\active','C:\\active','C:\\active']);
});

function searchFixture() {
  const left={entries:[row('report-one'),row('other'),row('report-two')],sel:new Set([1]),lastIdx:1};
  const right={entries:[row('重庆.txt'),row('annual-report'),row('报告.txt')],sel:new Set(),lastIdx:-1};
  right.entries[0]._pinyinAliases=['chongqingtxt','cqtxt'];right.entries[2]._pinyinAliases=['baogaotxt','bgtxt'];
  right.entries[1]._pinyinAliases=[];
  const hud=[],renders=[];
  const ctx=context({G:{rp:right,_typeSearch:{requestToken:0,matches:[],matchPos:-1},settings:{typeSearchTimeoutMs:0}},getTab:()=>left,
    clearTypeSearchHighlights:()=>{},showTypeSearchHud:(...args)=>hud.push(args),renderFiles:(_,id)=>renders.push(id),
    scrollToVisible:()=>{},updatePreviewForSelection:()=>{},scheduleTypeSearchReset:()=>{},
  });
  load(ctx,'keyboard.js',['normalizeTypeSearchText','typeSearchMatches','typeSearchNameMatchRange','runTypeSearchSelection','cycleTypeSearchSelection']);
  return {ctx,left,right,hud,renders};
}
test('typed substring matching cycles forward/backward and wraps in the active pane',async()=>{
  const h=searchFixture();await h.ctx.runTypeSearchSelection('port',0,false);assert.equal(h.left.lastIdx,0);
  await h.ctx.cycleTypeSearchSelection(1);assert.equal(h.left.lastIdx,2);
  await h.ctx.cycleTypeSearchSelection(1);assert.equal(h.left.lastIdx,0);
  await h.ctx.cycleTypeSearchSelection(-1);assert.equal(h.left.lastIdx,2);
  assert.deepEqual(plain(h.ctx.G._typeSearch.matches),[0,2]);assert.equal(h.right.sel.size,0);
});
for(const query of ['cq','chongqing','ongq','重庆','ＣＱ']) test(`Chinese/full Pinyin/initial/middle/fullwidth query ${query} selects in right pane`,async()=>{
  const h=searchFixture();await h.ctx.runTypeSearchSelection(query,0,true);
  assert.deepEqual([...h.right.sel],[0]);assert.deepEqual([...h.left.sel],[1]);assert.deepEqual(h.renders,['right-file-list']);
});
test('no-match query keeps prior selection and reports zero matches',async()=>{
  const h=searchFixture();await h.ctx.runTypeSearchSelection('missing',0,false);
  assert.deepEqual([...h.left.sel],[1]);assert.equal(h.ctx.G._typeSearch.matchPos,-1);assert.equal(h.hud.at(-1)[2],0);
});
test('late Pinyin result cannot select after a newer query',async()=>{
  const h=searchFixture(),pending=deferred();delete h.right.entries[0]._pinyinAliases;
  h.ctx.ensurePinyinAliases=()=>pending.promise;
  const first=h.ctx.runTypeSearchSelection('cq',0,true);
  await h.ctx.runTypeSearchSelection('报告',0,true);pending.resolve();await first;
  assert.deepEqual([...h.right.sel],[2]);assert.equal(h.ctx.G._typeSearch.visualQuery,'报告');
});
for(const [name,query,matched] of [['a_b-report.txt','ab','a_b'],['📁报告.json','报告','报告'],['ＦＯＯ.txt','foo','ＦＯＯ']]) {
  test(`highlight maps normalized query back to original Unicode characters: ${name}`,()=>{
    const h=searchFixture(),range=h.ctx.typeSearchNameMatchRange(name,query);
    assert.ok(range);assert.equal(name.slice(range.start,range.end),matched);
  });
}
