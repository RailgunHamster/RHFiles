import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fc from 'fast-check';
import {context,load,plain,deferred,propertyOptions} from '../testing/source.mjs';

function history(extra={}) {
  const calls=[],alerts=[];
  const ctx=context({t:(key,args)=>key+(args?.error ? String(args.error) : JSON.stringify(args||{})),alert:x=>alerts.push(x),
    refresh:async()=>{},call:async(cmd,args)=>{calls.push([cmd,plain(args)]);},...extra});
  load(ctx,'remote.js',['pathLeaf','isFtpPath','ftpUrl']); load(ctx,'undoredo.js');
  return {ctx,calls,alerts,stacks:()=>vm.runInContext('[undoStack.length,redoStack.length]',ctx)};
}
for(const kind of ['Copy','Move','Rename','BatchRename','Delete']) test(`undo/redo ${kind} addresses the exact original paths`,async()=>{
  const {ctx,calls,stacks}=history();
  const a='C:\\源\\中文.txt',b='D:\\目标\\改名.txt';
  const expected={
    Copy:[['delete_file',{path:b}],['copy_path_exact',{src:a,dest:b}]],
    Move:[['move_path_exact',{src:b,dest:a}],['move_path_exact',{src:a,dest:b}]],
    Rename:[['rename_file',{path:b,newName:'中文.txt'}],['rename_file',{path:a,newName:'改名.txt'}]],
    BatchRename:[['move_paths_exact',{moves:[[b,a]]}],['move_paths_exact',{moves:[[a,b]]}]],
    Delete:[['restore_recycled_files',{paths:[a,b]}],['delete_files',{paths:[a,b]}]],
  };
  if(kind==='BatchRename')ctx.trackBatchRename([[a,b]]);else if(kind==='Delete')ctx.trackDelete([a,b]);else ctx['track'+kind](a,b);
  await ctx.undo();assert.deepEqual(plain(stacks()),[0,1]);
  await ctx.redo();assert.deepEqual(plain(stacks()),[1,0]);assert.deepEqual(calls,expected[kind]);
});
test('batch rename undo runs in reverse dependency order',async()=>{
  const {ctx,calls}=history();ctx.trackBatchRename([['C:\\a','C:\\b'],['C:\\b','C:\\c']]);await ctx.undo();
  assert.deepEqual(calls[0][1].moves,[['C:\\c','C:\\b'],['C:\\b','C:\\a']]);
});
for(const direction of ['undo','redo']) test(`${direction} failure retains one retryable history entry`,async()=>{
  let fail=false;const {ctx,stacks,alerts}=history({call:async()=>{if(fail)throw Error('locked file');}});
  ctx.trackMove('C:\\a','C:\\b');if(direction==='redo')await ctx.undo();fail=true;
  await ctx[direction]();assert.deepEqual(plain(stacks()),direction==='undo'?[1,0]:[0,1]);assert.equal(alerts.length,1);
  fail=false;await ctx[direction]();assert.deepEqual(plain(stacks()),direction==='undo'?[0,1]:[1,0]);
});
for(const direction of ['undo','redo']) test(`${direction} success is not reversed in history when view refresh fails`,async()=>{
  let fail=false;const {ctx,stacks,calls}=history({refresh:async()=>{if(fail)throw Error('network listing timed out');}});
  ctx.trackMove('C:\\a','C:\\b');if(direction==='redo')await ctx.undo();fail=true;await ctx[direction]();
  assert.deepEqual(plain(stacks()),direction==='undo'?[0,1]:[1,0]);
  const count=calls.length;await ctx[direction]();assert.equal(calls.length,count,'must not repeat the completed filesystem operation');
});
test('holding Ctrl+Z cannot execute dependent undo operations concurrently',async()=>{
  const pending=deferred();const calls=[];
  const {ctx,stacks}=history({call:async(_,args)=>{calls.push(args);await pending.promise;}});
  ctx.trackMove('C:\\a','C:\\b');ctx.trackMove('C:\\b','C:\\c');
  const first=ctx.undo(),second=ctx.undo();assert.equal(calls.length,1);
  pending.resolve();await Promise.all([first,second]);assert.deepEqual(plain(stacks()),[1,1]);
});
test('new operation while undo is pending invalidates redo',async()=>{
  const pending=deferred();const {ctx,stacks}=history({call:()=>pending.promise});
  ctx.trackMove('C:\\a','C:\\b');const undo=ctx.undo();ctx.trackCopy('C:\\x','C:\\y');pending.resolve();await undo;
  assert.deepEqual(plain(stacks()),[1,0]);
});
test('partially failed delete redo restores only items actually deleted',async()=>{
  const calls=[];const {ctx,stacks,alerts}=history({call:async(cmd,args)=>{
    calls.push([cmd,plain(args)]);if(cmd==='delete_files')return {deleted:['C:\\a'],errors:['C:\\b: locked']};
  }});
  ctx.trackDelete(['C:\\a','C:\\b']);await ctx.undo();await ctx.redo();
  assert.deepEqual(calls.at(-1),['restore_recycled_files',{paths:['C:\\a']}]);
  assert.deepEqual(plain(stacks()),[0,1]);assert.match(alerts[0],/locked/);
});
test('random copy/undo/redo/new-action sequences agree with an independent filesystem model',async()=>{
  await fc.assert(fc.asyncProperty(fc.array(fc.constantFrom('copy','undo','redo'),{minLength:1,maxLength:80}),async commands=>{
    const disk=new Set(),expected=new Set(),past=[],future=[];let serial=0;
    const {ctx,stacks}=history({call:async(cmd,args)=>{
      if(cmd==='delete_file'){assert.ok(disk.delete(args.path),'undo path exists');}
      else if(cmd==='copy_path_exact'){assert.ok(!disk.has(args.dest),'redo never overwrites');disk.add(args.dest);}
      else assert.fail('unexpected command '+cmd);
    }});
    for(const command of commands){
      if(command==='copy') {const dest='C:\\copy'+serial++;disk.add(dest);expected.add(dest);ctx.trackCopy('C:\\original',dest);
        past.push(dest);if(past.length>50)past.shift();future.length=0;
      } else if(command==='undo'){if(past.length){const p=past.pop();expected.delete(p);future.push(p);}await ctx.undo();}
      else {if(future.length){const p=future.pop();expected.add(p);past.push(p);}await ctx.redo();}
      assert.deepEqual([...disk].sort(),[...expected].sort());assert.deepEqual(plain(stacks()),[past.length,future.length]);
    }
  }),propertyOptions());
});

function transfers({decision='rename',applyAll=false,exists=[],failName=null,cancelAt=Infinity}={}) {
  const commands=[],tracked=[],dialogs=[],progress=[],finished=[],alerts=[];
  const ctx=context({t:x=>x,alert:x=>alerts.push(x),createOperationTaskId:()=> 'task-test',
    isOperationCancellationRequested:()=>commands.length>=cancelAt,
    showConflictDialog:(a,b,src,dest,done)=>{dialogs.push([src,dest]);done(decision,applyAll);},
    showProgress:(_,state)=>progress.push(state),completeOperationTask:()=>finished.push('complete'),
    cancelOperationTask:()=>finished.push('cancel'),failOperationTask:(_,errors)=>finished.push(plain(errors)),
    trackCopy:(...args)=>tracked.push(['copy',...args]),trackMove:(...args)=>tracked.push(['move',...args]),
    call:async(cmd,args)=>{if(cmd==='path_exists')return exists.includes(args.path);
      if(cmd==='plan_folder_merge')return null;
      commands.push([cmd,plain(args)]);if(args.src.endsWith(failName||'\0'))throw Error('file is locked');},
  });
  load(ctx,'common.js',['parentFolderPath']);load(ctx,'remote.js',['pathLeaf','isFtpPath','ftpUrl']);
  load(ctx,'ops.js',['joinFolderPath','windowsPathKey','mergeFoldersIfNeeded','performDroppedFileOperation']);
  load(ctx,'conflict.js',['fileNameKey','generateUniqueName','allocateUniqueName']);
  return {ctx,commands,tracked,dialogs,progress,finished,alerts};
}
for(const operation of ['copy','move']) for(const decision of ['replace','rename','skip','cancel']) {
  test(`${operation} conflict choice ${decision} respects destination and undo rules`,async()=>{
    const h=transfers({decision});const result=await h.ctx.performDroppedFileOperation(['C:\\src\\a.txt'],'D:\\dest',[{name:'A.TXT'}],operation);
    assert.equal(h.dialogs.length,1);
    if(['skip','cancel'].includes(decision)){assert.equal(h.commands.length,0);assert.deepEqual(plain(result),[]);assert.equal(h.tracked.length,0);}
    else {assert.equal(h.commands[0][0],operation+'_with_progress');
      assert.equal(h.commands[0][1].overwrite,decision==='replace');
      assert.equal(h.commands[0][1].targetName,decision==='rename'?'a (1).txt':null);
      assert.deepEqual(h.tracked,decision==='replace'?[]:[[operation,'C:\\src\\a.txt','D:\\dest\\a (1).txt']]);
      assert.ok(result.includes('D:\\dest'));assert.deepEqual(h.finished,['complete']);}
  });
}
test('same-folder copy creates a sibling but same-folder move is a no-op',async()=>{
  const h=transfers();await h.ctx.performDroppedFileOperation(['C:\\data\\a.txt'],'C:\\data',[],'copy');
  assert.equal(h.commands[0][1].targetName,'a (1).txt');assert.equal(h.dialogs.length,0);
  await h.ctx.performDroppedFileOperation(['C:\\data\\a.txt'],'C:\\data',[],'move');assert.equal(h.commands.length,1);
});
test('apply-to-all conflict choice only prompts once and each copied target is distinct',async()=>{
  const h=transfers({decision:'rename',applyAll:true});
  await h.ctx.performDroppedFileOperation(['C:\\one\\a.txt','C:\\two\\a.txt'],'D:\\dest',[{name:'a.txt'}],'copy');
  assert.equal(h.dialogs.length,1);assert.deepEqual(h.commands.map(c=>c[1].targetName),['a (1).txt','a (2).txt']);
  assert.deepEqual(h.progress.filter(p=>p.currentIndex>0).map(p=>[p.currentIndex,p.totalItems]),[[1,2],[2,2]]);
});
test('one failed transfer does not erase other successes or claim the whole task succeeded',async()=>{
  const h=transfers({failName:'bad.txt'});
  const changed=await h.ctx.performDroppedFileOperation(['C:\\src\\good.txt','C:\\src\\bad.txt','C:\\src\\later.txt'],'D:\\dest',[],'copy');
  assert.equal(h.commands.length,3);assert.equal(h.tracked.length,2);assert.ok(changed.includes('D:\\dest'));
  assert.match(h.finished[0][0],/bad.txt.*locked/);assert.equal(h.alerts.length,1);assert.ok(!h.finished.includes('complete'));
});
test('cancel between files stops the batch without discarding completed undo entries',async()=>{
  const h=transfers({cancelAt:1});
  await h.ctx.performDroppedFileOperation(['C:\\a','C:\\b'],'D:\\dest',[],'move');
  assert.equal(h.commands.length,1);assert.equal(h.tracked.length,1);assert.deepEqual(h.finished,['cancel']);
});
