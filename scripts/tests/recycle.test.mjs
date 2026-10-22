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
  const calls=[],dialogs=[];
  const c=context({Intl,_lang:'zh',document:{getElementById:()=>null},showNotice:()=>{},
    call:async(name,args)=>{calls.push({name,args});if(name==='recycle_bin_prepare_delete')return {planId:'one-use',count:args.ids.length,names:['owned.txt']};return {completed:[],skipped:[],failed:[]};},
    showConfirmDialog:async config=>{dialogs.push(config);return confirmations.shift();},...overrides});
  load(c,'recycle.js',['RECYCLE_COPY','recycleState','recycleText','recycleDelete','recycleRestore','recycleSetSelection','recycleSetQuery','recycleSetSort']);
  c.recyclePaint=()=>{};c.recycleViewState=()=>({});
  c.recycleRunOperation=async(ids,restore,keepBoth,plan)=>{calls.push({name:'run',args:{ids:[...ids],restore,keepBoth,plan}});};
  c.state=vm.runInContext('recycleState',c);
  c.state.items=[item('0123456789abcdef','owned.txt'),item('abcdef0123456789','other.txt')];
  c.state.selected.add('0123456789abcdef');
  return {c,calls,dialogs};
}
test('Permanent deletion reserves a snapshot and needs both confirmations',async()=>{
  const {c,calls,dialogs}=operations();await c.recycleDelete();
  assert.equal(dialogs.length,2);assert.match(dialogs[0].detail,/owned.txt/);
  assert.deepEqual(calls.map(x=>x.name),['recycle_bin_prepare_delete','run','recycle_bin_discard_plan']);
  assert.deepEqual(plain(calls[1].args.ids),['0123456789abcdef']);assert.equal(calls[1].args.restore,false);assert.equal(c.state.busy,false);
});
for(const answers of [[false],[true,false]])test('Cancelling confirmation discards the one-use plan: '+answers,async()=>{
  const {c,calls}=operations([...answers]);await c.recycleDelete();
  assert.deepEqual(calls.map(x=>x.name),['recycle_bin_prepare_delete','recycle_bin_discard_plan']);assert.equal(c.state.busy,false);
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
  pending.resolve({planId:'owned',count:1,names:[]});await first;assert.equal(c.state.busy,false);
});
test('Backend errors propagate to automation and release the busy state',async()=>{
  const {c}=operations([true,true],{call:async()=>{throw Error('access denied');}});
  await assert.rejects(c.recycleDelete(),/access denied/);assert.equal(c.state.busy,false);assert.match(c.state.report.error,/access denied/);
});
test('Restore keeps stable IDs and explicitly opts into keep-both',async()=>{
  const {c,calls}=operations();await c.recycleRestore(true);
  assert.equal(calls[0].args.keepBoth,true);assert.equal(calls[0].args.restore,true);
  assert.deepEqual(plain(calls[0].args.ids),['0123456789abcdef']);
});
test('Filter clears hidden selection and semantic selection rejects stale identities',()=>{
  const {c}=operations();c.recycleSetQuery('other');assert.equal(c.state.selected.size,0);
  assert.throws(()=>c.recycleSetSelection(['missing']),/snapshot/);
  assert.throws(()=>c.recycleSetSort('path',false),/Unknown/);
});
