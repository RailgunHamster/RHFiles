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
  } catch (e) { alert("Undo failed: " + e); }
}

async function redo() {
  if (!redoStack.length) return;
  const action = redoStack.pop();
  try {
    await action.redo();
    undoStack.push(action);
    await refresh();
  } catch (e) { alert("Redo failed: " + e); }
}

function trackCopy(src, dest) {
  pushUndo({
    label: "Copy " + src,
    undo: async () => { await call("delete_file", { path: dest }); },
    redo: async () => { await call("copy_path", { src, dest: dest.split("\\").slice(0, -1).join("\\") }); }
  });
}

function trackMove(src, dest) {
  pushUndo({
    label: "Move " + src,
    undo: async () => { await call("move_path_cmd", { src: dest, dest: src.split("\\").slice(0, -1).join("\\") }); },
    redo: async () => { await call("move_path_cmd", { src, dest: dest.split("\\").slice(0, -1).join("\\") }); }
  });
}

function trackRename(oldPath, newPath) {
  pushUndo({
    label: "Rename to " + newPath.split("\\").pop(),
    undo: async () => { await call("rename_file", { path: newPath, newName: oldPath.split("\\").pop() }); },
    redo: async () => { await call("rename_file", { path: oldPath, newName: newPath.split("\\").pop() }); }
  });
}

function trackDelete(paths) {
  pushUndo({
    label: "Delete " + paths.length + " items",
    undo: async () => {
      showNotice("Deleted items can be restored from the Recycle Bin");
    },
    redo: async () => { for (const p of paths) await call("delete_file", { path: p }); }
  });
}

function trackNewFolder(path) {
  pushUndo({
    label: "New folder " + path,
    undo: async () => { await call("delete_file", { path }); },
    redo: async () => { await call("new_folder", { parent: path.split("\\").slice(0, -1).join("\\") }); }
  });
}
