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
  pushUndo({
    label: t('undo.copy', {path: src}),
    undo: async () => { await call("delete_file", { path: dest }); },
    redo: async () => { await call("copy_path_exact", { src, dest }); }
  });
}

function trackMergedTransfer(operation, pairs, removedDirectories) {
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
  pushUndo({
    label: t('undo.move', {path: src}),
    undo: async () => { await call("move_path_exact", { src: dest, dest: src }); },
    redo: async () => { await call("move_path_exact", { src, dest }); }
  });
}

function trackRename(oldPath, newPath) {
  pushUndo({
    label: t('undo.renameTo', {path: pathLeaf(newPath)}),
    undo: async () => { await call("rename_file", { path: newPath, newName: pathLeaf(oldPath) }); },
    redo: async () => { await call("rename_file", { path: oldPath, newName: pathLeaf(newPath) }); }
  });
}

function trackBatchRename(pathPairs) {
  const pairs = pathPairs.map(([oldPath, newPath]) => [oldPath, newPath]);
  pushUndo({
    label: t('undo.renameItems', {count:pairs.length}),
    undo: async () => await call("move_paths_exact", {
      moves:[...pairs].reverse().map(([oldPath, newPath]) => [newPath, oldPath])
    }),
    redo: async () => await call("move_paths_exact", { moves:pairs })
  });
}

function trackDelete(paths) {
  const deletedPaths = [...paths];
  pushUndo({
    label: t('undo.deleteItems', {count: deletedPaths.length}),
    undo: async () => { await call("restore_recycled_files", { paths: deletedPaths }); },
    redo: async () => {
      const outcome = await call("delete_files", { paths: deletedPaths });
      if (outcome?.errors?.length) {
        if (outcome.deleted?.length) {
          await call("restore_recycled_files", { paths: outcome.deleted });
        }
        throw new Error(outcome.errors.join('\n'));
      }
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
