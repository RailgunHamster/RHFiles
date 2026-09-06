// undoredo.js - file operation undo/redo system

const MAX_UNDO = 50;
let undoStack = [];
let redoStack = [];

function pushUndo(action) {
  undoStack.push(action);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
}

async function undo() {
  if (!undoStack.length) return;
  const action = undoStack.pop();
  try {
    await action.undo();
    redoStack.push(action);
    await refresh();
  } catch (e) {
    undoStack.push(action);
    alert(t('alert.undoFailed', {error: e}));
  }
}

async function redo() {
  if (!redoStack.length) return;
  const action = redoStack.pop();
  try {
    await action.redo();
    undoStack.push(action);
    await refresh();
  } catch (e) {
    redoStack.push(action);
    alert(t('alert.redoFailed', {error: e}));
  }
}

function trackCopy(src, dest) {
  pushUndo({
    label: t('undo.copy', {path: src}),
    undo: async () => { await call("delete_file", { path: dest }); },
    redo: async () => { await call("copy_path_exact", { src, dest }); }
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
    label: t('undo.renameTo', {path: newPath.split("\\").pop()}),
    undo: async () => { await call("rename_file", { path: newPath, newName: oldPath.split("\\").pop() }); },
    redo: async () => { await call("rename_file", { path: oldPath, newName: newPath.split("\\").pop() }); }
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
    redo: async () => { await call("new_folder", { parent: path.split("\\").slice(0, -1).join("\\") }); }
  });
}
