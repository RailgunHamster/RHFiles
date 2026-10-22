import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {context,load,plain,deferred} from '../testing/source.mjs';

function model(){const c=context({Intl});load(c,'recycle.js',['recycleVisibleItems','recycleClickSelection']);return c;}
const item=(id,name,extra={})=>({id,name,originalPath:'C:\\测试\\'+name,originalFolder:'C:\\测试',itemType:'Text',...extra});
test('Recycle Bin searches Unicode names, paths and multiple terms without changing the snapshot',()=>{
  const c=model(),items=[item('a','ＡＢＣ10.txt'),item('b','中文.txt'),item('c','other',{originalPath:'D:\\中文\\other'})];
  assert.deepEqual(plain(c.recycleVisibleItems(items,'abc10','name',false)).map(x=>x.id),['a']);
  assert.deepEqual(plain(c.recycleVisibleItems(items,'中文 other','name',false)).map(x=>x.id),['c']);
  assert.deepEqual(items.map(x=>x.id),['a','b','c']);
});
test('Recycle Bin sorts actual numbers and dates, with unknown values last in either direction',()=>{
  const c=model(),items=[item('a','file10',{size:2,deletedAt:100}),item('b','file2',{size:20,deletedAt:200}),item('c','file1',{size:null,deletedAt:null})];
  for(const field of ['size','deletedAt']){
    assert.deepEqual(plain(c.recycleVisibleItems(items,'',field,true)).map(x=>x.id),['b','a','c']);
    assert.deepEqual(plain(c.recycleVisibleItems(items,'',field,false)).map(x=>x.id),['a','b','c']);
  }
  assert.deepEqual(plain(c.recycleVisibleItems(items,'','name',false)).map(x=>x.id),['c','b','a']);
});
test('Duplicate original names remain independent and deterministic',()=>{
  const c=model(),items=[item('b','same'),item('a','same')];
  assert.deepEqual(plain(c.recycleVisibleItems(items)).map(x=>x.id),['a','b']);
  assert.deepEqual([...c.recycleClickSelection(items,new Set(),'a',null).selected],['a']);
});
test('Shift range, Ctrl toggle and reversed sort use stable recycle identities',()=>{
  const c=model(),items=['a','b','c','d'].map(id=>item(id,id));
  assert.deepEqual([...c.recycleClickSelection(items,new Set(['d']),'c','a',true).selected],['a','b','c']);
  assert.deepEqual([...c.recycleClickSelection(items,new Set(['d']),'b','a',true,true).selected],['d','a','b']);
  assert.deepEqual([...c.recycleClickSelection(items,new Set(['a','c']),'a','c',false,true).selected],['c']);
  assert.deepEqual([...c.recycleClickSelection([...items].reverse(),new Set(['a']),'c','a',true).selected],['c','b','a']);
  assert.deepEqual([...c.recycleClickSelection(items,new Set(['a']),'missing','a').selected],['a']);
});
function operations(confirmations=[true,true],overrides={}){
  const calls=[],dialogs=[];const pane={id:1,path:'recycle://',entries:[],sel:new Set(),lastIdx:-1};
  const c=context({Intl,_lang:'zh',G:{dualOn:false,tabs:[pane],rpTabs:[]},getTab:()=>pane,fmtSize:String,document:{getElementById:()=>null},showNotice:()=>{},
    call:async(name,args)=>{calls.push({name,args});if(name==='recycle_bin_prepare_delete')return {planId:'one-use',count:args.ids.length,names:['owned.txt']};return {completed:[],skipped:[],failed:[]};},
    showConfirmDialog:async config=>{dialogs.push(config);return confirmations.shift();},...overrides});
  load(c,'recycle.js',['RECYCLE_ROOT','RECYCLE_COPY','recycleBusy','isRecyclePath','recycleRequireLocation','recyclePane','recycleModel','recycleSelectedIds','recycleViewItems','recycleVisibleItems','recycleEntry','recycleRebuild','recycleText','recycleDelete','recycleRestore','recycleSetSelection','recycleSetQuery','recycleSetSort']);
  c.recyclePaint=()=>{};c.recyclePaintAll=()=>{};c.recycleViewState=()=>({});
  c.recycleRunOperation=async(ids,restore,keepBoth,plan)=>{calls.push({name:'run',args:{ids:[...ids],restore,keepBoth,plan}});};
  c.state=c.recycleModel(pane);c.pane=pane;
  c.state.items=[item('0123456789abcdef','owned.txt'),item('abcdef0123456789','other.txt')];
  c.recycleRebuild(pane,['0123456789abcdef']);
  return {c,calls,dialogs};
}
test('Permanent deletion reserves a snapshot and needs both confirmations',async()=>{
  const {c,calls,dialogs}=operations();await c.recycleDelete();
  assert.equal(dialogs.length,2);assert.match(dialogs[0].detail,/owned.txt/);
  assert.deepEqual(calls.map(x=>x.name),['recycle_bin_prepare_delete','run','recycle_bin_discard_plan']);
  assert.deepEqual(plain(calls[1].args.ids),['0123456789abcdef']);assert.equal(calls[1].args.restore,false);assert.equal(vm.runInContext('recycleBusy',c),false);
});
for(const answers of [[false],[true,false]])test('Cancelling confirmation discards the one-use plan: '+answers,async()=>{
  const {c,calls}=operations([...answers]);await c.recycleDelete();
  assert.deepEqual(calls.map(x=>x.name),['recycle_bin_prepare_delete','recycle_bin_discard_plan']);assert.equal(vm.runInContext('recycleBusy',c),false);
});
test('Empty bin is unavailable for incomplete listings and never clears only filtered results',async()=>{
  const {c,calls}=operations();c.state.truncated=true;await assert.rejects(c.recycleDelete(true),/部分/);assert.equal(calls.length,0);
  c.state.truncated=false;c.state.query='owned';await c.recycleDelete(true);
  assert.equal(calls[0].args.ids.length,2);
});
test('Double click cannot create a second pending confirmation',async()=>{
  const pending=deferred();let count=0;
  const {c}=operations([false],{call:async name=>{if(name==='recycle_bin_prepare_delete'){count++;return pending.promise;}}});
  const first=c.recycleDelete();await assert.rejects(c.recycleDelete(),/运行/);assert.equal(count,1);
  pending.resolve({planId:'owned',count:1,names:[]});await first;assert.equal(vm.runInContext('recycleBusy',c),false);
});
test('Backend errors propagate to automation and release the busy state',async()=>{
  const {c}=operations([true,true],{call:async()=>{throw Error('access denied');}});
  await assert.rejects(c.recycleDelete(),/access denied/);assert.equal(vm.runInContext('recycleBusy',c),false);assert.match(c.state.report.error,/access denied/);
});
test('Restore keeps stable IDs and explicitly opts into keep-both',async()=>{
  const {c,calls}=operations();await c.recycleRestore(true);
  assert.equal(calls[0].args.keepBoth,true);assert.equal(calls[0].args.restore,true);
  assert.deepEqual(plain(calls[0].args.ids),['0123456789abcdef']);
});
test('Filter clears hidden selection and semantic selection rejects stale identities',()=>{
  const {c}=operations();c.recycleSetQuery('other');assert.equal(c.pane.sel.size,0);
  assert.throws(()=>c.recycleSetSelection(['missing']),/listing/);
  assert.throws(()=>c.recycleSetSort('path',false),/Unknown/);
});

test('Each pane keeps independent filters, sort order and stable-ID selection',()=>{
  const {c}=operations(),right={id:2,path:'recycle://',entries:[],sel:new Set(),lastIdx:-1};
  c.G.rp=right;c.G.rpTabs=[right];c.G.dualOn=true;
  c.recycleModel(right).items=[...c.state.items];c.recycleRebuild(right);
  c.recycleSetQuery('other',right);c.recycleSetSelection(['abcdef0123456789'],'replace',right);c.recycleSetSort('name',true,right);
  assert.equal(c.state.query,'');assert.equal(c.state.sort,'deletedAt');
  assert.deepEqual([...c.recycleSelectedIds(c.pane)],['0123456789abcdef']);
  assert.deepEqual([...c.recycleSelectedIds(right)],['abcdef0123456789']);assert.equal(right.entries.length,1);
  c.recycleSetQuery('',right);assert.equal(right.entries.length,2);assert.equal(c.pane.entries.length,2);
});

test('Leaving the virtual location disables stale restore-all and empty-bin APIs',async()=>{
  const {c,calls}=operations();c.pane.path='D:\\live';
  await assert.rejects(c.recycleDelete(true),/Open recycle/);await assert.rejects(c.recycleRestore(false,true),/Open recycle/);
  assert.throws(()=>c.recycleSetQuery('anything'),/Open recycle/);assert.equal(calls.length,0);
});

test('A late Recycle Bin response cannot overwrite an ordinary folder',async()=>{
  const pending=deferred(),{c}=operations([],{call:()=>pending.promise});load(c,'recycle.js',['recycleRefresh']);
  const refresh=c.recycleRefresh();c.pane.path='D:\\live';const live=[{path:'D:\\live\\keep.txt',name:'keep.txt'}];c.pane.entries=live;
  pending.resolve({items:[item('stale','stale')],total:1});await refresh;
  assert.equal(c.pane.entries,live);assert.equal(c.pane.path,'D:\\live');assert.equal(c.state.loading,false);
});

test('Only the most recent refresh can commit its snapshot',async()=>{
  const first=deferred(),second=deferred(),pending=[first,second];
  const {c}=operations([],{call:()=>pending.shift().promise});load(c,'recycle.js',['recycleRefresh']);
  const old=c.recycleRefresh(),current=c.recycleRefresh();
  second.resolve({items:[item('new','new')],total:1});await current;
  first.resolve({items:[item('stale','stale')],total:1});await old;
  assert.deepEqual(c.pane.entries.map(e=>e.name),['new']);assert.equal(c.state.loading,false);
});

test('Virtual location aliases normalize without becoming Windows relative paths',()=>{
  const c=context();load(c,'common.js',['normalizeWindowsPathInput']);
  for(const path of ['recycle:','recycle:/','recycle://','RECYCLE://','shell:RecycleBinFolder'])assert.equal(c.normalizeWindowsPathInput(path),'recycle://');
  assert.equal(c.normalizeWindowsPathInput('recycle://0123456789abcdef'),'recycle://0123456789abcdef');
});

test('Virtual IDs never reach filesystem, shell or transfer calls, even when nested',async()=>{
  const forwarded=[],c=context({invoke:async(...args)=>{forwarded.push(args);return true;},normalizeInvokeArgs:args=>args});load(c,'common.js',['call']);
  for(const [command,args]of [['open_file',{path:'recycle://id'}],['copy_files',{paths:['C:\\ok','recycle://id'],destination:'D:\\target'}],['file_operation',{nested:{destination:'recycle://'}}]])await assert.rejects(c.call(command,args),/Restore/);
  assert.equal(forwarded.length,0);await c.call('db_add_bookmark',{path:'recycle://'});assert.equal(forwarded.length,1);
  await c.call('write_text_file',{path:'C:\\note.txt',content:'recycle:// is a virtual location'});assert.equal(forwarded.length,2,'Text contents are not mistaken for paths');
});
