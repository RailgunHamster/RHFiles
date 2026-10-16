import test from 'node:test';
import assert from 'node:assert/strict';
import {context,load,deferred} from '../testing/source.mjs';

function extraction(right=false) {
  const left={id:1,path:'C:\\data',entries:[],sel:new Set()},rp={id:2,path:'D:\\other',entries:[],sel:new Set()};
  let active=left;
  const pending=deferred(),listing=deferred(),refreshes=[],alerts=[];
  const ctx=context({G:{dualOn:right,lastActivePane:right?'right':'left',rp},getTab:()=>active,
    t:key=>key,alert:e=>alerts.push(e),showProgress:()=> 'task',completeOperationTask:()=>{},
    _refreshTabInBackground:async(...args)=>refreshes.push(args),showArchiveDirectory:()=>{},
    call:async cmd=>cmd==='inspect_archive_extraction'?{conflicts:[]}:cmd==='list_archive'?listing.promise:pending.promise,
  });
  load(ctx,'git.js',['archivePane','openArchive']);
  load(ctx,'ops.js',['captureArchiveRefresh','refreshArchiveOrigin','extractArchiveTo']);
  const pane=right?rp:left;
  const start=()=>ctx.extractArchiveTo({path:pane.path+'\\a.7z',name:'a.7z',extension:'7z'},pane.path);
  return {ctx,left,rp,pane,pending,listing,refreshes,alerts,start,switchTab:()=>{active={...left,id:3}}};
}
for(const right of [false,true]) {
  const side=right?'right':'left';
  for(const state of ['open','opening','navigated','search','switched-pane-focus'])test(`${side}: extraction completion respects ${state}`,async()=>{
    const h=extraction(right),task=h.start();await Promise.resolve();await Promise.resolve();
    let opening;
    if(state==='open'||state==='opening') {
      opening=h.ctx.openArchive(h.pane.path+'\\a.7z',right);
      if(state==='open'){h.listing.resolve([]);await opening;}
    } else if(state==='navigated'){h.pane.path='E:\\new';h.pane._archiveToken=1;}
    else if(state==='search')h.ctx.G.searchActive=true;
    else h.ctx.G.lastActivePane=right?'left':'right';
    h.pending.resolve();await task;
    assert.equal(h.refreshes.length,state==='switched-pane-focus'?1:0);
    if(h.refreshes.length){assert.equal(h.refreshes[0][0],h.pane);assert.equal(!!h.refreshes[0][1],right);}
    if(state==='opening'){assert.ok(h.pane._archiveOpening);h.listing.resolve([]);await opening;assert.ok(h.pane.archivePath);}
    assert.deepEqual(h.alerts,[]);
  });
}
test('extraction finishing in a different left tab does not reload the new tab',async()=>{
  const h=extraction(),task=h.start();await Promise.resolve();h.switchTab();h.pending.resolve();await task;assert.deepEqual(h.refreshes,[]);
});
test('stale archive errors do not interrupt the folder navigated to later',async()=>{
  const h=extraction(),opening=h.ctx.openArchive('C:\\data\\a.zip');
  h.pane.path='E:\\new';h.pane._archiveToken++;h.pane._archiveOpening=null;
  h.listing.reject(Error('old request failed'));await opening;assert.deepEqual(h.alerts,[]);assert.equal(h.pane.archivePath,undefined);
});

function watcher(right=false) {
  const left={id:1,path:'C:\\data'},rp={id:2,path:'D:\\other'},pending=[],refreshes=[],timers=[];
  let poll,event;
  const ctx=context({G:{dualOn:right,rp},_navigationToken:0,_rpNavigationToken:0,
    getTab:()=>left,stopFileWatch:()=>{},document:{hidden:false},currentFileDragWindowId:()=> 'self',
    window:{__TAURI_INTERNALS__:{event:{listen:(_,callback)=>{event=callback;return Promise.resolve(()=>{});}}}},
    windowsPathKey:p=>p.toLowerCase(),setInterval:fn=>{poll=fn;return 1},setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{},
    listPathEntries:()=>{const d=deferred();pending.push(d);return d.promise},
    _refreshTabInBackground:async(...args)=>refreshes.push(args),
    navigateTo:()=>refreshes.push('UNSAFE navigate'),rpNavigateTo:()=>refreshes.push('UNSAFE right navigate'),
  });
  load(ctx,'common.js',['startFileWatch']);ctx.startFileWatch();
  return {ctx,left,rp,pane:right?rp:left,pending,refreshes,poll:()=>poll(),event:()=>event({payload:{paths:[right?rp.path:left.path]}}),flush:()=>timers.at(-1)()};
}
for(const right of [false,true])for(const kind of ['opened','opening','opened-then-closed'])test(`${right?'right':'left'}: stale watcher listing cannot cancel archive ${kind}`,async()=>{
  const h=watcher(right),seed=h.poll();h.pending.forEach(p=>p.resolve([{path:'old'}]));await seed;
  const offset=h.pending.length,changed=h.poll();
  h.pane._archiveToken=1;
  if(kind==='opened')h.pane.archivePath='a.zip';else if(kind==='opening')h.pane._archiveOpening=1;
  h.pending.slice(offset).forEach(p=>p.resolve([{path:'new'}]));await changed;
  // The other pane has a legitimate refresh, but the addressed archive never does.
  assert.ok(h.refreshes.every(entry=>Array.isArray(entry)&&entry[0]!==h.pane));
});
for(const right of [false,true])test(`${right?'right':'left'}: pending archive blocks both polling and queued file-change refresh`,async()=>{
  const h=watcher(right);h.event();h.pane._archiveOpening=1;await h.flush();assert.deepEqual(h.refreshes,[]);
  const tick=h.poll();h.pending.forEach(p=>p.resolve([]));await tick;
  assert.equal(h.pending.length,right?1:0,'only the unrelated pane may read its folder');
});
for(const right of [false,true])test(`${right?'right':'left'}: healthy file-change refresh is non-navigating and pane-scoped`,async()=>{
  const h=watcher(right);h.event();await h.flush();assert.equal(h.refreshes.length,1);assert.equal(h.refreshes[0][0],h.pane);assert.equal(h.refreshes[0][1],right);
});
