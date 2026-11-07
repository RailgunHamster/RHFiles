// undoredo.js - file operation undo/redo system

const MAX_UNDO = 50;
let undoStack = [];
let redoStack = [];
let historyBusy = false;
let historyRevision = 0;

function pushUndo(action) {
  historyRevision++;
  undoStack.push(action);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
}

async function undo() {
  if (historyBusy || !undoStack.length) return;
  historyBusy = true;
  const revision = historyRevision;
  const action = undoStack.pop();
  const originalIndex = undoStack.length;
  try {
    await action.undo();
    // A new operation during the await has already invalidated redo history.
    if (revision === historyRevision) redoStack.push(action);
  } catch (e) {
    undoStack.splice(Math.min(originalIndex, undoStack.length), 0, action);
    historyBusy = false;
    alert(t('alert.undoFailed', {error: e}));
    return;
  }
  try {
    await refresh();
  } catch (e) {
    // The filesystem action succeeded. A failed listing must not make it run twice.
    console.warn('Refresh after undo failed', e);
  } finally {
    historyBusy = false;
  }
}

async function redo() {
  if (historyBusy || !redoStack.length) return;
  historyBusy = true;
  const revision = historyRevision;
  const action = redoStack.pop();
  try {
    await action.redo();
    undoStack.push(action);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  } catch (e) {
    if (revision === historyRevision) redoStack.push(action);
    historyBusy = false;
    alert(t('alert.redoFailed', {error: e}));
    return;
  }
  try {
    await refresh();
  } catch (e) {
    console.warn('Refresh after redo failed', e);
  } finally {
    historyBusy = false;
  }
}

function trackCopy(src, dest) {
  if(typeof isDevicePath==='function'&&(isDevicePath(src)||isDevicePath(dest))){const id=takeDeviceTransferHistory(src,dest);if(id)pushUndo({label:t('undo.copy',{path:src}),undo:()=>call('device_transfer',{action:'undo_transfer',args:{id}}),redo:()=>call('device_transfer',{action:'redo_transfer',args:{id}})});return;}
  pushUndo({
    label: t('undo.copy', {path: src}),
    undo: async () => { await call("delete_file", { path: dest }); },
    redo: async () => { await call("copy_path_exact", { src, dest }); }
  });
}

function trackMergedTransfer(operation, pairs, removedDirectories) {
  if(typeof isDevicePath==='function'&&(pairs.some(pair=>pair.some(isDevicePath))||removedDirectories.some(isDevicePath))){
    const ids=pairs.map(([src,dest])=>takeDeviceTransferHistory(src,dest));if(ids.some(id=>!id))return;
    let undoIndex=ids.length-1,redoIndex=0;const created=new Map();
    pushUndo({label:t(operation==='move'?'undo.move':'undo.copy',{path:pairs[0]?.[0]||removedDirectories[0]}),
      undo:async()=>{
        if(operation==='move')for(const path of [...removedDirectories].reverse())if(!await call('path_exists',{path})){await call('ensure_merge_folder',{path});created.set(path,(await call('device_transfer',{action:'inspect',args:{path}})).revision);}
        while(undoIndex>=0){await call('device_transfer',{action:'undo_transfer',args:{id:ids[undoIndex]}});undoIndex--;}redoIndex=0;
      },
      redo:async()=>{
        while(redoIndex<ids.length){await call('device_transfer',{action:'redo_transfer',args:{id:ids[redoIndex]}});redoIndex++;}
        if(operation==='move'&&created.size){const result=await call('device_transfer',{action:'remove_empty',args:{paths:[...created.keys()],identities:Object.fromEntries(created)}});if(result.errors.length)throw Error(result.errors.join('\n'));created.clear();}undoIndex=ids.length-1;
      }});return;
  }
  const entries = pairs.map(pair => [...pair]);
  const removed = [...removedDirectories];
  let undoIndex = entries.length - 1, redoIndex = 0;
  pushUndo({
    label: t(operation === 'move' ? 'undo.move' : 'undo.copy', {path: entries[0]?.[0] || removed[0]}),
    undo: async () => {
      if (operation === 'move') {
        for (const path of [...removed].reverse()) await call('ensure_merge_folder', {path});
      }
      while (undoIndex >= 0) {
        const [src, dest] = entries[undoIndex];
        if (operation === 'move') await call('move_path_exact', {src:dest, dest:src});
        else await call('delete_file', {path:dest});
        undoIndex--;
      }
      redoIndex = 0;
    },
    redo: async () => {
      while (redoIndex < entries.length) {
        const [src, dest] = entries[redoIndex];
        await call(operation === 'move' ? 'move_path_exact' : 'copy_path_exact', {src, dest});
        redoIndex++;
      }
      if (operation === 'move' && removed.length) {
        const result = await call('remove_empty_merge_folders', {paths:removed});
        if (result.errors.length) throw new Error(result.errors.join('\n'));
      }
      undoIndex = entries.length - 1;
    },
  });
}

function trackMove(src, dest) {
  if(typeof isDevicePath==='function'&&(isDevicePath(src)||isDevicePath(dest))){const id=takeDeviceTransferHistory(src,dest);if(id)pushUndo({label:t('undo.move',{path:src}),undo:()=>call('device_transfer',{action:'undo_transfer',args:{id}}),redo:()=>call('device_transfer',{action:'redo_transfer',args:{id}})});return;}
  pushUndo({
    label: t('undo.move', {path: src}),
    undo: async () => { await call("move_path_exact", { src: dest, dest: src }); },
    redo: async () => { await call("move_path_exact", { src, dest }); }
  });
}

function trackRename(oldPath, newPath, remoteRevision) {
  const remote = typeof isDevicePath==='function'&&(isDevicePath(oldPath)||isDevicePath(newPath));
  if(remote&&!remoteRevision)return;
  let revision=remoteRevision;
  pushUndo({
    label: t('undo.renameTo', {path: pathLeaf(newPath)}),
    undo: async () => { const result=await call("rename_file", { path: newPath, newName: pathLeaf(oldPath),...(remote?{expectedSourceRevision:revision}:{}) });if(remote)revision=result.revision; },
    redo: async () => { const result=await call("rename_file", { path: oldPath, newName: pathLeaf(newPath),...(remote?{expectedSourceRevision:revision}:{}) });if(remote)revision=result.revision; }
  });
}

function trackBatchRename(pathPairs, remoteEntries) {
  if(typeof isDevicePath==='function'&&pathPairs.some(pair=>pair.some(isDevicePath))){
    if(!remoteEntries?.length)return;
    let entries=remoteEntries;
    const execute=async reverse=>{const moves=pathPairs.map(([a,b])=>reverse?[b,a]:[a,b]),revisions=Object.fromEntries(entries.map(e=>[e.target,e.revision]));const result=await call('move_paths_exact',{moves,revisions});entries=result.entries;};
    pushUndo({label:t('undo.renameItems',{count:pathPairs.length}),undo:()=>execute(true),redo:()=>execute(false)});return;
  }
  const pairs = pathPairs.map(([oldPath, newPath]) => [oldPath, newPath]);
  pushUndo({
    label: t('undo.renameItems', {count:pairs.length}),
    undo: async () => await call("move_paths_exact", {
      moves:[...pairs].reverse().map(([oldPath, newPath]) => [newPath, oldPath])
    }),
    redo: async () => await call("move_paths_exact", { moves:pairs })
  });
}

function trackDelete(paths, remoteHistoryId, totalCount) {
  const deletedPaths = [...paths];
  let localDeleted = true, remoteDeleted = true;
  pushUndo({
    label: t('undo.deleteItems', {count: totalCount ?? deletedPaths.length}),
    undo: async () => {
      if(remoteHistoryId && remoteDeleted){await call('device_transfer',{action:'undo_transfer',args:{id:remoteHistoryId}});remoteDeleted=false;}
      if(deletedPaths.length && localDeleted){await call("restore_recycled_files", { paths: deletedPaths });localDeleted=false;}
    },
    redo: async () => {
      if(deletedPaths.length && !localDeleted){
        const outcome = await call("delete_files", { paths: deletedPaths });
        if (outcome?.errors?.length) {
          if (outcome.deleted?.length) {
            await call("restore_recycled_files", { paths: outcome.deleted });
          }
          throw new Error(outcome.errors.join('\n'));
        }
        localDeleted=true;
      }
      if(remoteHistoryId && !remoteDeleted){await call('device_transfer',{action:'redo_transfer',args:{id:remoteHistoryId}});remoteDeleted=true;}
    }
  });
}

function trackNewFolder(path) {
  pushUndo({
    label: t('undo.newFolder', {path: path}),
    undo: async () => { await call("delete_file", { path }); },
    redo: async () => { await call("new_folder", { parent: parentFolderPath(path) }); }
  });
}
