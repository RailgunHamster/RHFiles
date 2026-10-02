import test from 'node:test';
import assert from 'node:assert/strict';
import {context,load,plain,deferred} from '../testing/source.mjs';

function fixture({answers=[true,true],outcome,selection,confirm=true}={}) {
  const selected=selection||[{name:'a.txt',path:'C:\\a.txt'},{name:'目录',path:'C:\\目录'}];
  const prompts=[],calls=[],undo=[],states=[];let refreshes=0;
  const ctx=context({G:{settings:{confirmRecycleDelete:confirm}},t:x=>x,resolveRightPane:x=>!!x,
    getSelectedPaths:()=>selected,showNotice:()=>{},showConfirmDialog:async p=>{prompts.push(p);return answers.shift();},
    showProgress:()=> 'delete-test',trackDelete:p=>undo.push(plain(p)),refresh:async()=>{refreshes++;},
    cancelOperationTask:()=>states.push('cancel'),completeOperationTask:()=>states.push('complete'),
    failOperationTask:()=>states.push('failed'),alert:()=>{},
    call:async(cmd,args)=>{calls.push([cmd,plain(args)]);return outcome||{deleted:selected.map(s=>s.path),errors:[]};},
  });
  load(ctx,'remote.js',['isFtpPath']);
  load(ctx,'ops.js',['_deleteRequestActive','archiveSelectionIsReadOnly','deleteSelected','deleteSelectedPermanently']);
  return {ctx,prompts,calls,undo,states,refreshes:()=>refreshes};
}
test('Delete sends the complete multi-selection in one batch and tracks only successful deletions',async()=>{
  const h=fixture({outcome:{deleted:['C:\\a.txt'],errors:['directory is locked']}});await h.ctx.deleteSelected(false);
  assert.deepEqual(h.calls,[['delete_files',{paths:['C:\\a.txt','C:\\目录'],operationId:'delete-test'}]]);
  assert.deepEqual(h.undo,[['C:\\a.txt']]);assert.deepEqual(h.states,['failed']);assert.equal(h.refreshes(),1);
});
test('cancel normal delete has no native side effects',async()=>{
  const h=fixture({answers:[false]});await h.ctx.deleteSelected();assert.equal(h.prompts.length,1);assert.equal(h.calls.length,0);assert.equal(h.undo.length,0);
});
test('normal delete can skip confirmation only when configured',async()=>{
  const h=fixture({confirm:false});await h.ctx.deleteSelected();assert.equal(h.prompts.length,0);assert.equal(h.calls.length,1);
});
for(const answers of [[false],[true,false],[true,true]]) test(`Shift+Delete confirmations ${answers.join('/')} cannot be bypassed by normal-delete preference`,async()=>{
  const h=fixture({answers:[...answers],confirm:false});await h.ctx.deleteSelectedPermanently();assert.equal(h.prompts.length,answers.length);
  assert.equal(h.calls.length,answers.every(Boolean)?1:0);assert.equal(h.undo.length,0,'permanent deletion cannot be undone');
  if(h.calls.length)assert.deepEqual(h.calls[0],['delete_files_permanently',{paths:['C:\\a.txt','C:\\目录'],operationId:'delete-test'}]);
});
for(const method of ['deleteSelected','deleteSelectedPermanently'])test(`${method} rejects archive members and empty selection`,async()=>{
  for(const selection of [[],[{name:'inside.txt',path:'C:\\a.zip/inside.txt',archive_entry:true}]]){
    const h=fixture({selection});await h.ctx[method]();assert.equal(h.calls.length,0);assert.equal(h.prompts.length,0);
  }
});
test('holding Delete while confirmation is open cannot create duplicate dialogs',async()=>{
  const h=fixture(),pending=deferred();h.ctx.showConfirmDialog=async p=>{h.prompts.push(p);return pending.promise;};
  const first=h.ctx.deleteSelected();await h.ctx.deleteSelected();assert.equal(h.prompts.length,1);
  pending.resolve(false);await first;assert.equal(h.calls.length,0);
});
test('cancelled delete batch keeps undo for completed files and reports cancellation',async()=>{
  const h=fixture({outcome:{deleted:['C:\\a.txt'],errors:[],cancelled:true}});await h.ctx.deleteSelected();
  assert.deepEqual(h.undo,[['C:\\a.txt']]);assert.deepEqual(h.states,['cancel']);
});
for(const path of ['ftp://host/remote.txt','\\\\server\\share\\remote.txt'])test(`remote deletion warns about permanent loss and does not promise recycle-bin undo: ${path}`,async()=>{
  const h=fixture({selection:[{name:'remote.txt',path}]});await h.ctx.deleteSelected();
  assert.equal(h.prompts[0].detail,'confirm.networkDeleteHint');assert.equal(h.undo.length,0);
});
