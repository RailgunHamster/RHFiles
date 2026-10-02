import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../../src/js/' + name, import.meta.url), 'utf8');
function section(file, start, end) {
  const source = read(file);
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, 'test must use actual production function');
  return source.slice(first, last);
}
function context(extra = {}) { return vm.createContext({console, Set, Map, URL, ...extra}); }

test('new-folder rename finds only the returned path and never installs a delete callback', () => {
  const calls = [];
  const row = path => ({dataset:{path}, querySelector:()=>({}), classList:{contains:()=>true}});
  const old = row('C:\\tmp\\New Folder'), created = row('C:\\tmp\\New Folder (1)');
  const ctx = context({document:{querySelectorAll:()=>[old, created]},
    windowsPathKey:p=>String(p).toLowerCase(), pathLeaf:p=>p.split('\\').pop(),
    startInlineRename:(...args)=>calls.push(args)});
  vm.runInContext(section('ops.js','function _findAndRename(', 'async function refresh'),ctx);
  ctx._findAndRename(false,created.dataset.path);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],created);
  assert.equal(calls[0].length,3);
});

test('late background listing cannot replace a navigated tab', async () => {
  let resolve;
  const tab = {id:1,path:'C:\\A',entries:[],_loaded:true};
  const ctx=context({G:{activeTab:1},t:x=>x,withTimeout:p=>p,
    listPathEntries:()=>new Promise(r=>resolve=r),renderNavigationLoading:()=>{},
    _refreshTabMeta:()=>{},renderNavigationError:()=>assert.fail('stale error rendered')});
  vm.runInContext(section('tabs.js','async function _refreshTabInBackground(', 'function _refreshTabMeta('),ctx);
  const work=ctx._refreshTabInBackground(tab);
  tab.path='C:\\B'; tab.entries=[{name:'new'}];
  resolve([{name:'old'}]); await work;
  assert.equal(tab.entries[0].name,'new');
});

test('metadata changes count even with unchanged filenames',()=>{
  const ctx=context();
  vm.runInContext(section('tabs.js','function _entriesChanged(', '// --- tab drag-and-drop ---'),ctx);
  assert.equal(ctx._entriesChanged([{name:'a',size:1}],[{name:'a',size:2}]),true);
});

test('column items do not start a marquee or clear selection',()=>{
  const handlers={};
  const list={id:'file-list',addEventListener:(type,fn)=>{(handlers[type]??=[]).push(fn);},getBoundingClientRect:()=>({left:0,right:200})};
  const ctx=context({G:{},document:{querySelector:()=>null,addEventListener:()=>{}},focusFilePane:()=>{},
    getTab:()=>assert.fail('column treated as blank area')});
  vm.runInContext(read('selection.js'),ctx);
  ctx.initBoxSelection(list);
  const target={closest:selector=>selector.includes('.column-item')?{}:null};
  for(const fn of handlers.click) fn({target});
  for(const fn of handlers.mousedown) fn({target,button:0});
  for(const fn of handlers.dragstart) fn({preventDefault:()=>assert.fail('column drag cancelled')});
});

test('archive listing stays in its originating right pane',async()=>{
  const left={path:'C:\\left',entries:[]},right={path:'C:\\right',entries:[],sel:new Set()};
  const renders=[];
  const ctx=context({G:{rp:right},getTab:()=>left,call:async()=>[{name:'a',path:'a'}],
    renderFiles:(...args)=>renders.push(args),fmtSize:()=>'',t:x=>x,alert:assert.fail});
  vm.runInContext(section('git.js','function archivePane(', '// --- git branch management ---'),ctx);
  await ctx.openArchive('C:\\right\\a.zip',true);
  assert.equal(left.entries.length,0); assert.equal(right.entries.length,1);
  assert.equal(renders[0][1],'right-file-list');
});

test('FTP paths and parent navigation are never converted into Windows paths',()=>{
  const ctx=context({G:{}});
  vm.runInContext(read('remote.js'),ctx);
  vm.runInContext(section('common.js','function normalizeWindowsPathInput(', 'function migrateLegacyKnownFolderPath('),ctx);
  vm.runInContext(section('common.js','function parentFolderPath(', 'function isBenignUserCancel('),ctx);
  assert.equal(ctx.normalizeWindowsPathInput('ftp://host/dir/a.txt'),'ftp://host/dir/a.txt');
  assert.equal(ctx.parentFolderPath('ftp://host/dir/a.txt'),'ftp://host/dir');
  assert.equal(ctx.parentFolderPath('ftp://host/'),'ftp://host/');
  assert.equal(ctx.ftpUrl('host','/dir/a #.txt'),'ftp://host/dir/a%20%23.txt');
});

test('thumbnail jobs are bounded, deduplicated and skip disconnected rows',async()=>{
  const jobs=[];
  const ctx=context({G:{settings:{}},_thumbCache:new Map(),thumbnailCacheKey:file=>file.path,
    bigFileIcon:()=>'<icon>',call:(_,args)=>new Promise(resolve=>jobs.push({path:args.path,resolve}))});
  vm.runInContext(section('filelist.js','const _thumbnailPending =', 'function handleRowClick('),ctx);
  const rows=Array.from({length:8},()=>({isConnected:true,innerHTML:''}));
  rows.forEach((row,i)=>ctx.loadThumbnail(String(i),row,{path:String(i)}));
  const duplicate={isConnected:true,innerHTML:''};
  ctx.loadThumbnail('0',duplicate,{path:'0'});
  rows[3].isConnected=false;
  assert.equal(jobs.length,3);
  jobs[0].resolve('image');
  await new Promise(setImmediate);
  assert.equal(jobs.length,4);
  assert.equal(jobs[3].path,'4');
  assert.match(duplicate.innerHTML,/image/);
  assert.equal(rows[3].innerHTML,'');
  assert.equal(jobs.filter(job=>job.path==='0').length,1);
});

test('archive selection refuses destructive and clipboard actions',()=>{
  const notices=[];
  const ctx=context({showNotice:message=>notices.push(message),t:x=>x});
  vm.runInContext(section('ops.js','function archiveSelectionIsReadOnly(', 'async function deleteSelected('),ctx);
  assert.equal(ctx.archiveSelectionIsReadOnly([{archive_entry:true}]),true);
  assert.equal(ctx.archiveSelectionIsReadOnly([{path:'C:\\file'}]),false);
  assert.equal(notices.length,1);
});

test('archive preflight failures are visible rather than silently ignored',async()=>{
  const notices=[];
  const ctx=context({call:async()=>{throw Error('access denied');},alert:message=>notices.push(message)});
  vm.runInContext(section('ops.js','async function extractArchiveTo(', '// Extract several archives'),ctx);
  await ctx.extractArchiveTo({path:'a.zip'},'C:\\target');
  assert.match(notices[0],/access denied/);
  assert.match(await ctx.extractArchiveTo({path:'a.zip'},'C:\\target',null,{silent:true}),/access denied/);
  assert.equal(notices.length,1);
});

test('FTP child navigation preserves encoded filenames and routes to the remote API',async()=>{
  const requests=[];
  const ctx=context({IS_MAC:false,G:{ftpConnections:new Map([['example.test',{user:'test',pass:''}]])},t:x=>x,
    call:async(cmd,args)=>{requests.push({cmd,args});return [{name:'中文 #.txt',is_dir:false}];}});
  vm.runInContext(read('remote.js'),ctx);
  const result=await ctx.routeFtpCommand('list_dir',{path:'ftp://example.test/folder'});
  assert.equal(requests[0].cmd,'ftp_list');
  assert.equal(requests[0].args.path,'/folder');
  assert.equal(result.value[0].path,'ftp://example.test/folder/%E4%B8%AD%E6%96%87%20%23.txt');
  assert.equal(ctx.pathLeaf(result.value[0].path),'中文 #.txt');
  assert.equal(await ctx.routeFtpCommand('list_dir',{path:'C:\\local'}),null);
});
