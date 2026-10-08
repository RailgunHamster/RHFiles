import test from 'node:test';
import assert from 'node:assert/strict';
import {context, load, plain} from '../testing/source.mjs';

const source = 'C:\\source\\Shared', target = 'D:\\destination\\Shared';
function harness({operation='copy', decision='skip', applyAll=false, cancelAfter=Infinity, fail=null, native=false}={}) {
  const root='D:\\destination';
  const disk=new Map([
    [source,'dir'],[source+'\\sub','dir'],[source+'\\sub\\same.txt','incoming'],
    [source+'\\new.txt','new'],[source+'\\.hidden','hidden'],
    [target,'dir'],[target+'\\sub','dir'],[target+'\\sub\\same.txt','original'],
    [target+'\\keep.txt','keep'],[target+'\\sub\\keep.txt','nested keep'],
  ]);
  const plan={entries:[
    {src:source+'\\new.txt',dest:target+'\\new.txt'},
    {src:source+'\\sub\\same.txt',dest:target+'\\sub\\same.txt'},
    {src:source+'\\.hidden',dest:target+'\\.hidden'},
  ],sourceDirectories:[source,source+'\\sub']};
  const transfers=[],dialogs=[],histories=[],finished=[],calls=[];
  const pane={id:1,path:root,entries:[{name:'Shared',is_dir:true}]};
  const ctx=context({G:{clipboard:native?null:{op:operation==='move'?'cut':'copy',paths:new Set([source]),sequence:0}},
    window:{__TAURI_INTERNALS__:native?{}:undefined,__rhfilesSuppressNativeClipboard:!native},
    resolveRightPane:()=>false,getTab:()=>pane,refresh:async()=>{},t:key=>key,alert:()=>{},showNotice:assert.fail,
    createOperationTaskId:()=> 'merge-test',showProgress:()=>{},
    isOperationCancellationRequested:()=>transfers.length>=cancelAfter,
    completeOperationTask:()=>finished.push('complete'),cancelOperationTask:()=>finished.push('cancel'),
    failOperationTask:(_,errors)=>finished.push(plain(errors)),
    trackCopy:(...args)=>histories.push(['unexpected-root-copy',...args]),
    trackMove:(...args)=>histories.push(['unexpected-root-move',...args]),
    trackMergedTransfer:(...args)=>histories.push(plain(args)),
    showConflictDialog:(a,b,src,dest,done)=>{dialogs.push([src,dest]);done(decision,applyAll);},
    call:async(cmd,args)=>{
      calls.push([cmd,plain(args)]);
      if(cmd==='read_native_file_clipboard')return {paths:[source],cut:operation==='move',sequence:5};
      if(cmd==='get_windows_file_clipboard_info')return {sequence:5};
      if(cmd==='plan_folder_merge')return args.src===source ? plain(plan) : null;
      if(cmd==='path_exists')return disk.has(args.path);
      if(cmd==='remove_empty_merge_folders'){
        const removed=[];
        for(const path of [...args.paths].reverse()){
          if(disk.get(path)==='dir' && ![...disk.keys()].some(p=>p.startsWith(path+'\\'))){disk.delete(path);removed.push(path);}
        }
        return {removed,errors:[]};
      }
      if(['clear_windows_file_clipboard','set_windows_file_clipboard'].includes(cmd))return 5;
      assert.ok(['copy_with_progress','move_with_progress'].includes(cmd),cmd);
      if(args.src===fail)throw Error('locked file');
      const dest=args.dest+'\\'+(args.targetName||args.src.split('\\').pop());
      assert.notEqual(dest,target,'the existing root must never be replaced');
      if(!args.overwrite)assert.ok(!disk.has(dest),'must not overwrite without confirmation');
      disk.set(dest,disk.get(args.src));
      if(cmd==='move_with_progress')disk.delete(args.src);
      transfers.push([args.src,dest,args.overwrite]);
    },
  });
  load(ctx,'common.js',['parentFolderPath','isBenignUserCancel','isSamePathTransferError']);
  load(ctx,'remote.js',['pathLeaf','isFtpPath','ftpUrl']);
  load(ctx,'conflict.js',['fileNameKey','generateUniqueName','allocateUniqueName']);
  load(ctx,'ops.js',['joinFolderPath','windowsPathKey','mergeFoldersIfNeeded','performDroppedFileOperation','paste', 'reconcileCutClipboard']);
  return {ctx,disk,transfers,dialogs,histories,finished,calls,root,pane,plan};
}

for(const route of ['drag','paste','native-paste'])test(`${route}: same-named folders merge and keep destination-only and skipped files`,async()=>{
  const h=harness({native:route==='native-paste'});
  if(route==='drag')await h.ctx.performDroppedFileOperation([source],h.root,h.pane.entries,'copy');
  else await h.ctx.paste(false);
  assert.equal(h.disk.get(target+'\\keep.txt'),'keep');
  assert.equal(h.disk.get(target+'\\sub\\keep.txt'),'nested keep');
  assert.equal(h.disk.get(target+'\\sub\\same.txt'),'original');
  assert.equal(h.disk.get(target+'\\new.txt'),'new');assert.equal(h.disk.get(target+'\\.hidden'),'hidden');
  assert.deepEqual(h.dialogs,[[source+'\\sub\\same.txt',target+'\\sub\\same.txt']]);
  assert.deepEqual(h.histories,[['copy',[[source+'\\new.txt',target+'\\new.txt'],[source+'\\.hidden',target+'\\.hidden']],[]]]);
  assert.deepEqual(h.finished,['complete']);
  if(route==='native-paste')assert.ok(h.calls.some(([cmd])=>cmd==='read_native_file_clipboard'));
});

for(const decision of ['replace','rename'])test(`merge leaf conflict ${decision} affects only the named file`,async()=>{
  const h=harness({decision});await h.ctx.performDroppedFileOperation([source],h.root,h.pane.entries,'copy');
  assert.equal(h.disk.get(target+'\\keep.txt'),'keep');assert.equal(h.disk.get(target+'\\sub\\keep.txt'),'nested keep');
  assert.equal(h.disk.get(target+'\\sub\\same.txt'),decision==='replace'?'incoming':'original');
  if(decision==='rename')assert.equal(h.disk.get(target+'\\sub\\same (1).txt'),'incoming');
  assert.equal(h.histories[0][1].length,decision==='replace'?2:3,'overwritten files are excluded from undo');
});

test('apply to all during a merge applies to leaf files, never to their existing parent directories',async()=>{
  const h=harness({decision:'replace',applyAll:true});h.disk.set(target+'\\.hidden','old hidden');
  await h.ctx.performDroppedFileOperation([source],h.root,h.pane.entries,'copy');
  assert.equal(h.dialogs.length,1);assert.equal(h.disk.get(target+'\\.hidden'),'hidden');
  assert.equal(h.disk.get(target+'\\keep.txt'),'keep');assert.equal(h.histories[0][1].length,1);
});

test('a skipped move conflict remains in the source and cut clipboard; completed entries are undoable',async()=>{
  const h=harness({operation:'move'});await h.ctx.paste(false);
  assert.equal(h.disk.get(source+'\\sub\\same.txt'),'incoming');assert.equal(h.disk.get(target+'\\sub\\same.txt'),'original');
  assert.ok(h.ctx.G.clipboard.paths.has(source));assert.equal(h.histories[0][0],'move');
  assert.ok(!h.calls.some(([cmd])=>cmd==='clear_windows_file_clipboard'));
});

test('a complete merged move removes empty source folders and clears cut state',async()=>{
  const h=harness({operation:'move',decision:'replace'});await h.ctx.paste(false);
  assert.ok(!h.disk.has(source));assert.equal(h.ctx.G.clipboard,null);
  assert.deepEqual(h.histories[0][2],[source+'\\sub',source]);
  assert.equal(h.disk.get(target+'\\keep.txt'),'keep');
});

test('cancellation after one merged file keeps both original trees and records only that new file for undo',async()=>{
  const h=harness({cancelAfter:1});await h.ctx.performDroppedFileOperation([source],h.root,h.pane.entries,'copy');
  assert.equal(h.transfers.length,1);assert.equal(h.histories[0][1].length,1);assert.deepEqual(h.finished,['cancel']);
  assert.equal(h.disk.get(target+'\\sub\\same.txt'),'original');assert.equal(h.disk.get(target+'\\keep.txt'),'keep');
});

test('a failed merged child does not discard other completed copies or delete destination-only files',async()=>{
  const h=harness({decision:'replace',fail:source+'\\sub\\same.txt'});
  await h.ctx.performDroppedFileOperation([source],h.root,h.pane.entries,'copy');
  assert.equal(h.transfers.length,2);assert.equal(h.histories[0][1].length,2);
  assert.match(h.finished[0][0],/locked/);assert.equal(h.disk.get(target+'\\sub\\same.txt'),'original');
  assert.equal(h.disk.get(target+'\\keep.txt'),'keep');
});

test('merge undo retry resumes after completed child deletions and never deletes the pre-existing directory',async()=>{
  const disk=new Set([target,target+'\\keep',target+'\\a',target+'\\b']);let locked=true;const deleted=[];
  const ctx=context({t:key=>key,alert:()=>{},refresh:async()=>{},call:async(cmd,args)=>{
    assert.equal(cmd,'delete_file');assert.notEqual(args.path,target);
    if(args.path.endsWith('\\a') && locked)throw Error('locked');
    assert.ok(disk.delete(args.path),'must not repeat an already completed undo');deleted.push(args.path);
  }});
  load(ctx,'undoredo.js');ctx.trackMergedTransfer('copy',[[source+'\\a',target+'\\a'],[source+'\\b',target+'\\b']],[]);
  await ctx.undo();assert.deepEqual(deleted,[target+'\\b']);locked=false;await ctx.undo();
  assert.deepEqual(deleted,[target+'\\b',target+'\\a']);assert.deepEqual([...disk],[target,target+'\\keep']);
});

test('merged move undo recreates only removed source parents and moves only the recorded children back',async()=>{
  const calls=[];const ctx=context({t:key=>key,alert:assert.fail,refresh:async()=>{},call:async(cmd,args)=>{
    calls.push([cmd,plain(args)]);if(cmd==='remove_empty_merge_folders')return {removed:[source+'\\sub',source],errors:[]};
  }});
  load(ctx,'undoredo.js');const pairs=[[source+'\\sub\\new',target+'\\sub\\new']];
  ctx.trackMergedTransfer('move',pairs,[source+'\\sub',source]);await ctx.undo();await ctx.redo();
  assert.deepEqual(calls,[['ensure_merge_folder',{path:source}],['ensure_merge_folder',{path:source+'\\sub'}],
    ['move_path_exact',{src:target+'\\sub\\new',dest:source+'\\sub\\new'}],
    ['move_path_exact',{src:source+'\\sub\\new',dest:target+'\\sub\\new'}],
    ['remove_empty_merge_folders',{paths:[source+'\\sub',source]}]]);
});
