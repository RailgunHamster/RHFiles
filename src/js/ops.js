// ops.js — file operations + context menu

function resolveRightPane(isRight) {
  return typeof isRight === 'boolean' ? isRight : (G.dualOn && G.lastActivePane === 'right');
}

function isCloudPath(isRight) {
  const path = isRight ? G.rp.path : getTab().path;
  const pl = path.toLowerCase();
  return pl.includes("onedrive") || pl.includes("google drive") || pl.includes("my drive") || pl.includes("dropbox");
}

function showConfirmDialog(options) {
  const config = options || {};
  return new Promise(resolve => {
    document.querySelector('.app-confirm-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'overlay app-confirm-overlay';
    overlay.tabIndex = -1;
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog-box app-confirm-box';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    const body = document.createElement('div');
    body.className = 'app-confirm-body';
    const icon = document.createElement('div');
    icon.className = 'app-confirm-icon';
    if (config.kind === 'update') {
      icon.classList.add('update');
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 17v2h14v-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    } else {
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M8 3h8l1 3h3v2H4V6h3l1-3zM6.5 9h11l-.7 11H7.2L6.5 9z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 12v5M14 12v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    }
    const copy = document.createElement('div');
    copy.className = 'app-confirm-copy';
    const title = document.createElement('div');
    title.className = 'app-confirm-title';
    title.textContent = config.title || t('confirm.deleteTitle');
    const message = document.createElement('div');
    message.className = 'app-confirm-message';
    message.textContent = config.message || '';
    const detail = document.createElement('div');
    detail.className = 'app-confirm-detail';
    detail.textContent = config.detail || '';
    copy.append(title, message);
    if (detail.textContent) copy.appendChild(detail);
    body.append(icon, copy);
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const cancel = document.createElement('button');
    cancel.className = 'dialog-btn';
    cancel.textContent = config.cancelLabel || t('btn.cancel');
    const confirm = document.createElement('button');
    confirm.className = config.kind === 'update' ? 'dialog-btn primary' : 'dialog-btn danger';
    confirm.textContent = config.confirmLabel || t('btn.delete');
    actions.append(cancel, confirm);
    box.append(body, actions);
    overlay.append(backdrop, box);
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', () => finish(false));
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.focus(); cancel.focus(); });
  });
}

// --- file ops ---
let _deleteRequestActive = false;

async function deleteSelected(isRight) {
  isRight = resolveRightPane(isRight);
  const sel = getSelectedPaths(isRight);
  if (!sel.length || _deleteRequestActive) return;
  _deleteRequestActive = true;
  const message = sel.length === 1
    ? t('confirm.deleteItem', {name: sel[0].name})
    : t('confirm.deleteItems', {count: sel.length});
  let confirmed = false;
  try {
    confirmed = await showConfirmDialog({
      title: t('confirm.deleteTitle'),
      message,
      detail: t('confirm.recycleBinHint'),
      confirmLabel: t('btn.delete'),
    });
  } finally {
    _deleteRequestActive = false;
  }
  if (!confirmed) return;
  const deletedPaths = sel.map(function(file) { return file.path; });
  const taskId = showProgress(t('status.deleting'), {
    indeterminate: true,
    cancellable: true,
    currentName: sel[0]?.name || '',
    currentPath: deletedPaths[0] || '',
    totalItems: deletedPaths.length,
    aggregateProgress: true,
  });
  try {
    const outcome = await call('delete_files', {paths: deletedPaths, operationId: taskId});
    const actuallyDeleted = Array.isArray(outcome?.deleted) ? outcome.deleted : deletedPaths;
    if (actuallyDeleted.length) trackDelete(actuallyDeleted);
    await refresh();
    if (outcome?.cancelled) {
      cancelOperationTask(taskId, t('tasks.deleteCancelledDetail', {
        completed: actuallyDeleted.length,
        total: deletedPaths.length,
      }));
    } else if (outcome?.errors?.length) {
      failOperationTask(taskId, outcome.errors);
      alert(t('alert.deleteFailed', {error: outcome.errors.join('\n')}));
    } else {
      completeOperationTask(taskId);
    }
  } catch (error) {
    failOperationTask(taskId, error);
    alert(t('alert.deleteFailed', {error}));
  }
}

async function deleteSelectedPermanently(isRight) {
  isRight = resolveRightPane(isRight);
  const sel = getSelectedPaths(isRight);
  if (!sel.length || _deleteRequestActive) return;
  _deleteRequestActive = true;
  const message = sel.length === 1
    ? t('confirm.permanentDeleteItem', {name: sel[0].name})
    : t('confirm.permanentDeleteItems', {count: sel.length});
  let finalConfirmation = false;
  try {
    const firstConfirmation = await showConfirmDialog({
      title: t('confirm.permanentDeleteTitle'),
      message,
      detail: t('confirm.permanentDeleteWarning'),
      confirmLabel: t('btn.continue'),
    });
    if (!firstConfirmation) return;

    finalConfirmation = await showConfirmDialog({
      title: t('confirm.permanentDeleteFinalTitle'),
      message,
      detail: t('confirm.permanentDeleteFinalWarning'),
      confirmLabel: t('btn.deletePermanently'),
    });
  } finally {
    _deleteRequestActive = false;
  }
  if (!finalConfirmation) return;

  const deletedPaths = sel.map(function(file) { return file.path; });
  const taskId = showProgress(t('status.deletingPermanently'), {
    indeterminate: true,
    cancellable: true,
    currentName: sel[0]?.name || '',
    currentPath: deletedPaths[0] || '',
    totalItems: deletedPaths.length,
    aggregateProgress: true,
  });
  try {
    const outcome = await call('delete_files_permanently', {
      paths: deletedPaths,
      operationId: taskId,
    });
    await refresh();
    const actuallyDeleted = Array.isArray(outcome?.deleted) ? outcome.deleted : [];
    if (outcome?.cancelled) {
      cancelOperationTask(taskId, t('tasks.deleteCancelledDetail', {
        completed: actuallyDeleted.length,
        total: deletedPaths.length,
      }));
    } else if (outcome?.errors?.length) {
      failOperationTask(taskId, outcome.errors);
      alert(t('alert.deleteFailed', {error: outcome.errors.join('\n')}));
    } else {
      completeOperationTask(taskId);
    }
  } catch (error) {
    failOperationTask(taskId, error);
    alert(t('alert.deleteFailed', {error}));
  }
}

function startInlineRename(rowEl, file, isRight, onCancel) {
  const nameEl = rowEl.querySelector(".row-fname");
  if (!nameEl) return;
  const origName = file.name;
  const ext = file.is_dir ? "" : (file.extension ? "." + file.extension : "");
  const baseName = file.is_dir ? origName : (ext ? origName.slice(0, -ext.length) : origName);

  const input = document.createElement("input");
  input.className = "rename-input";
  input.value = origName;
  nameEl.replaceWith(input);
  input.focus();
  if (!file.is_dir && ext) {
    input.setSelectionRange(0, baseName.length);
  } else {
    input.select();
  }

  let done = false;
  const commit = async () => {
    if (done) return; done = true;
    const newName = input.value.trim();
    if (!input.isConnected) return;
    input.replaceWith(nameEl);
    nameEl.textContent = esc(file.name);
    if (!newName || newName === origName) return;
    try {
      const oldPath = file.path;
      await call("rename_file", { path: oldPath, newName });
      const newPath = oldPath.split("\\").slice(0, -1).join("\\") + "\\" + newName;
      trackRename(oldPath, newPath);
      await refresh();
    } catch (e) { alert(t('alert.renameFailed')); }
  };
  const cancel = async () => {
    if (done) return; done = true;
    input.replaceWith(nameEl);
    if (onCancel) { try { await onCancel(); } catch(e) {} }
  };

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  });
  input.addEventListener("blur", () => commit());
}

async function renamePrompt(isRight) {
  isRight = resolveRightPane(isRight);
  const sel = getSelectedPaths(isRight);
  if (sel.length !== 1) return;
  const isR = isRight;
  const listId = isR ? "right-file-list" : "file-list";
  const rows = document.querySelectorAll(`#${listId} .file-row`);
  for (const row of rows) {
    if (row.dataset.path === sel[0].path) {
      startInlineRename(row, sel[0], isRight);
      return;
    }
  }
}

async function newFolder(isRight) {
  isRight = resolveRightPane(isRight);
  const destPath = isRight ? G.rp.path : getTab().path;
  try {
    await call("new_folder", { parent: destPath });
    await refresh();
    _findAndRename(isRight, destPath, "New Folder");
  } catch (e) { alert(t('alert.newFolderFailed')); }
}

async function copySelected(isRight) {
  isRight = resolveRightPane(isRight);
  const sel = getSelectedPaths(isRight);
  if (!sel.length) return;
  const clipboard = { op: "copy", paths: new Set(sel.map(f => f.path)), sequence: 0 };
  G.clipboard = clipboard;
  if (isRight) renderFiles(G.rp, "right-file-list", "right-status-count", null, true);
  else renderFiles(getTab(), "file-list", "status-count", "status-selection");
  if (!window.__rhfilesSuppressNativeClipboard) {
    try {
      clipboard.sequence = Number(await call('set_windows_file_clipboard', {
        paths: [...clipboard.paths],
        cut: false,
      })) || 0;
    } catch (error) {}
  }
}

async function cutSelected(isRight) {
  isRight = resolveRightPane(isRight);
  const sel = getSelectedPaths(isRight);
  if (!sel.length) return;
  const clipboard = { op: "cut", paths: new Set(sel.map(f => f.path)), sequence: 0 };
  G.clipboard = clipboard;
  if (isRight) renderFiles(G.rp, "right-file-list", "right-status-count", null, true);
  else renderFiles(getTab(), "file-list", "status-count", "status-selection");
  if (!window.__rhfilesSuppressNativeClipboard) {
    try {
      clipboard.sequence = Number(await call('set_windows_file_clipboard', {
        paths: [...clipboard.paths],
        cut: true,
      })) || 0;
    } catch (error) {}
  }
}

function _findAndRename(isRight, parentPath, prefix) {
  const listId = isRight ? "right-file-list" : "file-list";
  const rows = document.querySelectorAll(`#${listId} .file-row`);
  for (const row of rows) {
    const nameEl = row.querySelector(".row-fname");
    if (!nameEl) continue;
    if (row.dataset.path && row.dataset.path.startsWith(parentPath)) {
      const fname = row.dataset.path.split("\\").pop();
      if (fname && fname.startsWith(prefix)) {
        const file = { name: fname, path: row.dataset.path, is_dir: row.classList.contains("dir") ? 1 : 0, extension: fname.includes(".") ? fname.split(".").pop() : "" };
        startInlineRename(row, file, isRight, async () => {
          try {
            await call("delete_file", { path: file.path });
            await refresh();
          } catch(e) { console.error("delete failed", e); }
        });
        return;
      }
    }
  }
}

async function refreshPastedFolder(destPath, isRight, tabId) {
  const target = isRight ? G.rpTabs.find(tab => tab.id === tabId) : getTab(tabId);
  if (!target || target.path !== destPath) return;
  if (isRight) {
    if (G.activeRpTab === tabId) await rpNavigateTo(destPath, false);
    return;
  }
  if (G.activeTab === tabId) await navigateTo(destPath, false);
  else await _refreshTabInBackground(target);
}

async function pasteWindowsFileClipboard(destPath, isRight, tabId) {
  const taskId = createOperationTaskId();
  showProgress(t('status.pastingWindowsClipboard'), {
    taskId,
    indeterminate: true,
    cancellable: true,
    currentPath: destPath,
  });
  try {
    const result = await call('paste_windows_file_clipboard', {
      destination: destPath,
      operationId: taskId,
    });
    await refreshPastedFolder(destPath, !!isRight, tabId);
    if (result?.aborted) cancelOperationTask(taskId);
    else completeOperationTask(taskId);
  } catch (error) {
    failOperationTask(taskId, error);
    alert(t('alert.pasteFailed', { error }));
  }
}

async function reconcileCutClipboard(clipboard, originalCount) {
  if (clipboard?.op !== 'cut') return;
  if (clipboard.sequence) {
    try {
      const info = await call('get_windows_file_clipboard_info', {});
      if (Number(info?.sequence) && Number(info.sequence) !== clipboard.sequence) {
        if (G.clipboard === clipboard) G.clipboard = null;
        return;
      }
    } catch (error) {}
  }
  if (!clipboard.paths.size) {
    if (G.clipboard === clipboard) G.clipboard = null;
    if (clipboard.sequence) {
      try {
        await call('clear_windows_file_clipboard', { expectedSequence: clipboard.sequence });
      } catch (error) {}
    }
  } else if (clipboard.paths.size !== originalCount && clipboard.sequence) {
    try {
      clipboard.sequence = Number(await call('set_windows_file_clipboard', {
        paths: [...clipboard.paths],
        cut: true,
      })) || clipboard.sequence;
    } catch (error) {}
  }
}

async function paste(isRight) {
  isRight = resolveRightPane(isRight);
  const destTab = isRight ? G.rp : getTab();
  const destPath = destTab.path;
  if (G.clipboard?.sequence) {
    try {
      const info = await call('get_windows_file_clipboard_info', {});
      if (Number(info?.sequence) && Number(info.sequence) !== G.clipboard.sequence) {
        G.clipboard = null;
      }
    } catch (error) {}
  }
  if (!G.clipboard) return pasteWindowsFileClipboard(destPath, isRight, destTab.id);
  const destEntries = destTab.entries || [];
  const existingNames = new Set(destEntries.map(entry => fileNameKey(entry.name)));
  let applyAllAction = null;
  const clipboard = G.clipboard;
  const sources = Array.from(clipboard.paths);
  const taskId = createOperationTaskId();
  const errors = [];
  let taskStarted = false;
  let userCancelled = false;
  try {
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
      if (taskStarted && isOperationCancellationRequested(taskId)) {
        userCancelled = true;
        break;
      }
      const srcPath = sources[sourceIndex];
      const srcName = srcPath.split(/[\\/]/).pop();
      const destFullPath = joinFolderPath(destPath, srcName);
      if (windowsPathKey(srcPath) === windowsPathKey(destFullPath)) {
        if (clipboard.op === 'cut') clipboard.paths.delete(srcPath);
        continue;
      }
      const conflict = existingNames.has(fileNameKey(srcName)) || await call('path_exists', { path:destFullPath });
      let action = 'replace';
      if (conflict) {
        if (applyAllAction) {
          action = applyAllAction;
        } else {
          action = await new Promise((resolve) => {
            showConflictDialog(srcName, srcName, srcPath, destFullPath, (a, applyAll) => {
              if (applyAll) applyAllAction = a;
              resolve(a);
            });
          });
        }
      }
      if (action === 'cancel') {
        userCancelled = true;
        break;
      }
      if (action === 'skip') continue;
      if (taskStarted && isOperationCancellationRequested(taskId)) {
        userCancelled = true;
        break;
      }
      const targetName = action === 'rename'
        ? generateUniqueName(destPath, srcName, existingNames)
        : srcName;
      const targetPath = joinFolderPath(destPath, targetName);
      const overwrites = conflict && action === 'replace';
      taskStarted = true;
      showProgress(clipboard.op === 'cut' ? t('status.moving') : t('status.copying'), {
        taskId,
        indeterminate: true,
        cancellable: true,
        currentName: srcName,
        currentPath: srcPath,
        currentIndex: sourceIndex + 1,
        totalItems: sources.length,
      });
      if (isOperationCancellationRequested(taskId)) {
        userCancelled = true;
        break;
      }
      try {
        const args = {
          src: srcPath,
          dest: destPath,
          overwrite: overwrites,
          targetName: targetName === srcName ? null : targetName,
          operationId: taskId,
        };
        if (clipboard.op === "cut") {
          await call("move_with_progress", args);
          if (!overwrites) trackMove(srcPath, targetPath);
          clipboard.paths.delete(srcPath);
        } else {
          await call("copy_with_progress", args);
          if (!overwrites) trackCopy(srcPath, targetPath);
        }
        existingNames.add(fileNameKey(targetName));
      } catch (error) {
        if (/cancel/i.test(String(error))) {
          userCancelled = true;
          break;
        }
        errors.push(srcName + ': ' + String(error));
      }
    }
    await reconcileCutClipboard(clipboard, sources.length);
    await refresh();
    if (taskStarted) {
      if (errors.length) {
        failOperationTask(taskId, errors);
        alert(t('alert.pasteFailed', { error: errors.join('\n') }));
      } else if (userCancelled) {
        cancelOperationTask(taskId);
      } else {
        completeOperationTask(taskId);
      }
    }
  } catch (error) {
    if (taskStarted) failOperationTask(taskId, error);
    alert(t('alert.pasteFailed', { error }));
  }
}

async function openFileHandler(path) {
  try {
    await call("open_file", { path });
  } catch (e) {
    alert(t('alert.openFileFailed', { error: e }));
  }
}

async function quicklookSelected(isRight) {
  const targetIsRight = typeof isRight === 'boolean' ? isRight : G.lastActivePane === 'right';
  const sel = getSelectedPaths(targetIsRight);
  if (sel.length === 1) {
    toggleQuickPreview(targetIsRight);
  }
}

function archiveFolderName(name) {
  return String(name || 'archive').replace(/\.(tar\.(gz|bz2|xz)|zip|rar|7z|tar|gz|bz2|xz)$/i, '') || 'archive';
}

function joinFolderPath(parent, child) {
  return String(parent || '').replace(/[\\/]+$/, '') + '\\' + child;
}

function windowsPathKey(path) {
  return String(path || '')
    .replace(/\//g, '\\')
    .replace(/\\+$/, '')
    .normalize('NFC')
    .toLocaleLowerCase();
}

async function extractArchiveTo(file, destination) {
  if (!file) return;
  const taskId = showProgress(t('status.extracting', { name: file.name }), {
    currentName: file.name,
    currentPath: file.path,
  });
  try {
    const ext = (file.extension || '').toLowerCase();
    if (ext === 'zip') {
      await call('extract_archive', {
        path: file.path,
        dest: destination,
        entryPath: null,
        operationId: taskId,
      });
    } else {
      await call('extract_7z', { archive: file.path, dest: destination, operationId: taskId });
    }
    completeOperationTask(taskId);
    await refresh();
  } catch (e) {
    if (/cancel/i.test(String(e))) cancelOperationTask(taskId);
    else {
      failOperationTask(taskId, e);
      alert(t('alert.extractFailed', { error: e }));
    }
  }
}

function makeCompressionRequest(files, currentPath, tool) {
  const sources = files.map(file => file.path);
  const baseName = files.length === 1 ? files[0].name : 'archive';
  const extension = tool === 'winrar' ? 'rar' : tool === '7zip' ? '7z' : 'zip';
  const destination = joinFolderPath(currentPath, `${baseName}.${extension}`);
  return {
    baseName,
    command: tool === 'zip' ? 'create_archive' : 'compress_with',
    args: tool === 'zip'
      ? { sources, dest: destination }
      : { sources, dest: destination, tool },
  };
}

async function compressSelection(files, currentPath, tool) {
  if (!files.length) return;
  const request = makeCompressionRequest(files, currentPath, tool);
  const taskId = showProgress(t('status.compressing', { name: request.baseName }), {
    indeterminate: true,
    cancellable: false,
    currentName: request.baseName,
  });
  try {
    await call(request.command, request.args);
    completeOperationTask(taskId);
    await refresh();
  } catch (e) {
    failOperationTask(taskId, e);
    alert(t('alert.compressFailed', { error: e }));
  }
}

async function openWithProgramFromMenu(path, program, displayName) {
  showNotice(t('status.openingProgram', { name: displayName }));
  try {
    await call('open_with_program', { path, program });
  } catch (e) {
    alert(t('alert.openProgramFailed', { name: displayName, error: e }));
  }
}

function formatPathsForClipboard(paths) {
  const values = Array.isArray(paths) ? paths : [paths];
  return values
    .map(value => typeof value === 'string' ? value : value?.path)
    .filter(value => typeof value === 'string' && value.length > 0)
    .join('\r\n');
}

async function copyPathsFromMenu(paths) {
  const text = formatPathsForClipboard(paths);
  if (!text) return false;
  const count = text.split('\r\n').length;
  try {
    // WebView clipboard is immediate and avoids launching PowerShell. Keep the
    // backend command as a compatibility fallback for restricted environments.
    if (!await writeTextClipboard(text)) await call('copy_file_path', { path: text });
    showNotice(count === 1 ? t('notice.pathCopied') : t('notice.pathsCopied', { count }));
    return true;
  } catch (e) {
    alert(t('alert.copyPathFailed', { error: e }));
    return false;
  }
}

function copyPathFromMenu(path) {
  return copyPathsFromMenu([path]);
}

function copySelectedPaths(isRight) {
  isRight = resolveRightPane(isRight);
  const pane = isRight ? G.rp : getTab();
  const entries = pane?.entries || [];
  const paths = [...(pane?.sel || new Set())]
    .sort((left, right) => left - right)
    .map(index => entries[index]?.path)
    .filter(Boolean);
  return copyPathsFromMenu(paths);
}

async function runContextCommand(command, args, label, options = {}) {
  const { refreshAfter = false, successMessage = '' } = options;
  showNotice(t('status.processingAction', { name: label }));
  try {
    await call(command, args);
    if (refreshAfter) await refresh();
    if (successMessage) showNotice(successMessage);
  } catch (e) {
    alert(t('alert.actionFailed', { name: label, error: e }));
  }
}

function openTerminalFromMenu(path) {
  const terminal = G.settings.terminal || 'wt';
  const displayName = terminal === 'wt' ? 'Windows Terminal' : terminal === 'powershell' ? 'PowerShell' : 'CMD';
  return runContextCommand('open_terminal', { path, terminal }, displayName);
}

async function showPropertiesDialog(path) {
  if (!path) return;
  try { await call("show_properties", { path }); } catch (e) {
    const info = await call("get_file_info", { path });
    if (info) showCustomProperties(info);
  }
}

function showCustomProperties(info) {
  const dlg = document.getElementById("properties-dialog");
  const content = document.getElementById("props-content");
  const ext = (info.extension || "").toLowerCase();
  const isShortcut = ext === "lnk";
  const isDir = info.is_dir;

  let html = `
    <div class="props-row"><span class="props-label">${t('properties.name')}</span><span class="props-value">${esc(info.name)}</span></div>
    <div class="props-row"><span class="props-label">${t('properties.path')}</span><span class="props-value">${esc(info.path)}</span></div>
    <div class="props-row"><span class="props-label">${t('properties.type')}</span><span class="props-value">${esc(isDir ? t('properties.fileFolder') : ext.toUpperCase() + ' ' + t('properties.file'))}</span></div>
    <div class="props-row"><span class="props-label">${t('properties.size')}</span><span class="props-value">${esc(info.size_display)}</span></div>`;

  if (isDir) {
    html += `<div class="props-row"><span class="props-label">${t('properties.folderSize')}</span><span class="props-value" id="props-folder-size">${t('properties.calculating')}</span></div>`;
  }

  html += `
    <div class="props-row"><span class="props-label">${t('properties.modified')}</span><span class="props-value">${esc(formatFileDate(info.modified_ts, info.modified))}</span></div>
    <div class="props-row"><span class="props-label">${t('properties.created')}</span><span class="props-value">${esc(formatFileDate(info.created_ts, info.created))}</span></div>
    <div class="props-row"><span class="props-label">${t('properties.readonly')}</span><span class="props-value">${info.readonly ? t('properties.yes') : t('properties.no')}</span></div>`;

  if (isShortcut) {
    html += `<div class="props-row"><span class="props-label">${t('properties.shortcutTarget')}</span><span class="props-value" id="props-shortcut-target">${t('properties.loading')}</span></div>`;
  }

  html += `<div class="props-row"><span class="props-label">${t('properties.fileHash')}</span><span class="props-value">
    <button class="dialog-btn" id="hash-md5-btn">MD5</button>
    <button class="dialog-btn" id="hash-sha256-btn">SHA256</button>
    <span id="props-hash-result" style="margin-left:8px;font-size:11px;color:var(--text-3);word-break:break-all;"></span>
  </span></div>`;

  html += `<div class="props-row"><span class="props-label">${t('properties.opensWith')}</span><span class="props-value" id="props-association">${t('properties.loading')}</span></div>`;

  content.innerHTML = html;
  const md5Btn = content.querySelector("#hash-md5-btn");
  const sha256Btn = content.querySelector("#hash-sha256-btn");
  if (md5Btn) md5Btn.addEventListener("click", () => computeAndShowHash('md5', info.path));
  if (sha256Btn) sha256Btn.addEventListener("click", () => computeAndShowHash('sha256', info.path));
  dlg.style.display = "flex";

  if (isDir) {
    call("folder_size", { path: info.path }).then(size => {
      const el = document.getElementById("props-folder-size");
      if (el) el.textContent = fmtSize(size);
    }).catch(() => {
      const el = document.getElementById("props-folder-size");
      if (el) el.textContent = t('properties.unableToCalc');
    });
  }
  if (isShortcut) {
    call("read_shortcut", { path: info.path }).then(data => {
      const el = document.getElementById("props-shortcut-target");
      if (el) el.textContent = data && data.target ? data.target : t('properties.unknown');
    }).catch(() => {
      const el = document.getElementById("props-shortcut-target");
      if (el) el.textContent = t('properties.unableToRead');
    });
  }
  call("get_file_association", { extension: info.extension }).then(data => {
    const el = document.getElementById("props-association");
    if (el) el.textContent = data || t('properties.unknown');
  }).catch(() => {
    const el = document.getElementById("props-association");
    if (el) el.textContent = t('properties.unknown');
  });
}

async function computeAndShowHash(algo, path) {
  const el = document.getElementById("props-hash-result");
  if (el) el.textContent = t('properties.computing');
  try {
    const result = await call("compute_hash", { path, algo });
    if (el) el.textContent = algo.toUpperCase() + ": " + result;
  } catch (e) {
    if (el) el.textContent = t('status.error', {error: e});
  }
}

function closeProperties() {
  document.getElementById("properties-dialog").style.display = "none";
}

// --- context menu ---
let contextMenu = null;

// Context-menu icons are intentionally kept in one small, built-in set.  Menu
// definitions only refer to a semantic name, so translated labels and future
// user-configured menu entries never need to embed (or trust) arbitrary HTML.
const CONTEXT_MENU_ICON_PATHS = Object.freeze({
  open: '<path d="M2.5 4.5h4l1.4 1.5h5.6v6.8h-11z"/><path d="m7 9 2-2 2 2M9 7v4.5"/>',
  preview: '<path d="M1.5 8s2.2-3.6 6.5-3.6S14.5 8 14.5 8s-2.2 3.6-6.5 3.6S1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="1.7"/>',
  tab: '<rect x="2" y="3" width="9" height="10" rx="1.5"/><path d="M5 6h8.5v7.5M9 9v4M7 11h4"/>',
  window: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6h12M8.5 9.5 11 7m0 0v2.2M11 7H8.8"/>',
  convert: '<path d="M2.5 5h9m0 0L9.5 3m2 2-2 2M13.5 11h-9m0 0 2-2m-2 2 2 2"/>',
  explorer: '<path d="M2 4.5h4.2L7.7 6H14v6.5H2z"/><path d="M9.5 9h3m-1.2-1.2L12.5 9l-1.2 1.2"/>',
  star: '<path d="m8 2 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9L4.4 13l.7-4-2.9-2.8 4-.6Z"/>',
  cut: '<circle cx="4.2" cy="4.2" r="1.7"/><circle cx="4.2" cy="11.8" r="1.7"/><path d="m5.6 5.2 7 5.3M5.6 10.8l7-5.3"/>',
  copy: '<rect x="5" y="4" width="8" height="9" rx="1.3"/><path d="M3 11V3.8C3 3.35 3.35 3 3.8 3H10"/>',
  paste: '<path d="M6 3h4M6.5 2h3v2h-3z"/><rect x="3" y="3" width="10" height="11" rx="1.5"/><path d="M5.5 7h5M5.5 9.5h5M5.5 12h3"/>',
  rename: '<path d="M3 12.5h2.4L13 4.9 11.1 3 3.5 10.6 3 12.5Z"/><path d="m9.9 4.2 1.9 1.9M2 14h12"/>',
  batch: '<path d="M3 4h7M3 8h5M3 12h4"/><path d="m10 11 2.5-2.5L14 10l-2.5 2.5-2 .5Z"/>',
  delete: '<path d="M3 4.5h10M6 2.5h4l.5 2H5.5l.5-2ZM4.5 5.5l.7 8h5.6l.7-8M7 7.5v3.5M9 7.5v3.5"/>',
  deleteForever: '<path d="M3 4.5h10M6 2.5h4l.5 2H5.5l.5-2ZM4.5 5.5l.7 8h5.6l.7-8"/><path d="m6.6 8 2.8 3m0-3-2.8 3"/>',
  tag: '<path d="M2.5 3h5.2l5.8 5.8-4.7 4.7L3 7.7Z"/><circle cx="5.3" cy="5.3" r=".8"/>',
  path: '<path d="M6.2 9.8 4.8 11.2a2.1 2.1 0 0 1-3-3l2-2a2.1 2.1 0 0 1 3 0M9.8 6.2l1.4-1.4a2.1 2.1 0 1 1 3 3l-2 2a2.1 2.1 0 0 1-3 0M5.8 10.2l4.4-4.4"/>',
  location: '<path d="M8 14s4-3.8 4-7.3a4 4 0 1 0-8 0C4 10.2 8 14 8 14Z"/><circle cx="8" cy="6.7" r="1.3"/>',
  share: '<circle cx="4" cy="8" r="1.5"/><circle cx="11.8" cy="4" r="1.5"/><circle cx="11.8" cy="12" r="1.5"/><path d="m5.3 7.3 5.2-2.6M5.3 8.7l5.2 2.6"/>',
  archive: '<path d="M3 3h10v3H3zM4 6h8v7H4zM6.5 8.5h3"/>',
  filePlus: '<path d="M4 2.5h5l3 3V14H4zM9 2.5v3h3M8 8v4M6 10h4"/>',
  folderPlus: '<path d="M2 4.5h4.2L7.7 6H14v6.5H2zM8 8v3M6.5 9.5h3"/>',
  image: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.2" cy="6.2" r="1"/><path d="m3.5 11 3-3 2.2 2 1.5-1.5 2.3 2.5"/>',
  rotateLeft: '<path d="M4.5 5H2V2.5M2.3 5A6 6 0 1 1 2.7 11"/>',
  rotateRight: '<path d="M11.5 5H14V2.5M13.7 5A6 6 0 1 0 13.3 11"/>',
  extract: '<path d="M3 2.5h10v4H3zM4 6.5h8v7H4zM8 5v6m0 0-2-2m2 2 2-2"/>',
  shield: '<path d="M8 2 13 4v3.5c0 3-2 5.3-5 6.5-3-1.2-5-3.5-5-6.5V4Z"/><path d="M8 5v5M5.5 7.5h5"/>',
  certificate: '<circle cx="8" cy="6.3" r="3.3"/><path d="m6 9-1 4 3-1.5L11 13l-1-4"/>',
  font: '<path d="M3 13 7.2 3h1.6L13 13M5 9.5h6"/>',
  properties: '<path d="M4 2.5h5l3 3V14H4zM9 2.5v3h3M6 8h4M6 10h4M6 12h2.5"/>',
  permissions: '<rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2M8 10v1.5"/>',
  pin: '<path d="M5 2.5h6l-.8 3 1.8 2H8.8V13L8 14l-.8-1V7.5H4l1.8-2Z"/>',
  duplicate: '<rect x="5" y="5" width="8" height="8" rx="1.3"/><path d="M3 10V4.2C3 3.55 3.55 3 4.2 3H10"/>',
  close: '<path d="m4 4 8 8m0-8-8 8"/>',
  refresh: '<path d="M13 6a5.5 5.5 0 1 0 .1 4M13 2.5V6H9.5"/>',
  selectAll: '<rect x="4" y="4" width="9" height="9" rx="1"/><path d="M2 10V3a1 1 0 0 1 1-1h7M6.5 8.5 8 10l3-3"/>',
  clear: '<path d="M3 4.5h10M6 2.5h4l.5 2H5.5l.5-2ZM4.5 5.5l.7 8h5.6l.7-8"/>',
  searchFolder: '<path d="M2 4.5h4L7.5 6H11v2"/><circle cx="10" cy="10" r="3"/><path d="m12.2 12.2 2 2"/>',
  globe: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c1.7 1.7 2.5 3.7 2.5 6S9.7 12.3 8 14M8 2C6.3 3.7 5.5 5.7 5.5 8s.8 4.3 2.5 6"/>',
  terminal: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="m4.5 6 2 2-2 2M8 10h3"/>',
  code: '<path d="m5.5 4-4 4 4 4M10.5 4l4 4-4 4M9 2.5 7 13.5"/>',
  media: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="m6.5 5.5 4 2.5-4 2.5Z"/>',
  vscode: '<path d="m2.7 5.5 2.2-2.1 2.9 2.3 3.9-3.2 1.6.8v9.4l-1.6.8-3.9-3.2-2.9 2.3-2.2-2.1L5.4 8Z"/><path d="M7.8 5.7v4.6L11.7 8Z"/>',
  'visual-studio': '<path d="M2.3 5.3 4.7 3 8 6.1l3.8-3.3 2.2 1v8.4l-2.2 1L8 9.9 4.7 13l-2.4-2.3L5 8Z"/><path d="M8 6.1v3.8M11.8 2.8v10.4"/>',
  cmd: '<rect x="1.8" y="3" width="12.4" height="10" rx="1.4"/><path d="M1.8 5.5h12.4M4 7.5l1.7 1.7L4 10.9M8 10.9h3"/>',
  powershell: '<path d="M5 2.7h7.2c.9 0 1.5.8 1.2 1.7L11.1 12c-.2.7-.8 1.2-1.6 1.2H3c-.9 0-1.5-.8-1.2-1.7l2.3-7.6C4.3 3.2 4.5 2.7 5 2.7Z"/><path d="m5 6 2.2 2L5 10M8.4 10h2.1"/>',
  'git-bash': '<path d="M8 1.8 14.2 8 8 14.2 1.8 8Z"/><circle cx="5.8" cy="5.8" r=".8"/><circle cx="10.2" cy="5.8" r=".8"/><circle cx="10.2" cy="10.2" r=".8"/><path d="M6.6 5.8h2.8M6.4 6.4l3.2 3.2"/>',
  vlc: '<path d="m8 2 4.5 11h-9ZM5 9h6M6 6.5h4M2.5 13h11"/>',
  potplayer: '<path d="M8 2.2c3.4 0 5.8 2.1 5.8 5.2 0 3.7-2.7 6.4-6.2 6.4-3.1 0-5.4-2.3-5.4-5.3C2.2 5.1 4.7 2.2 8 2.2Z"/><path d="m6.5 5.5 4 2.5-4 2.5Z"/>',
  qq: '<circle cx="8" cy="4.5" r="2.4"/><path d="M5.8 6.2c-1.3 1.1-1.6 4.6-.7 6.3.8 1.4 5 1.4 5.8 0 .9-1.7.6-5.2-.7-6.3M5 8h6M5.2 13l-1.8.6M10.8 13l1.8.6"/><circle cx="7.2" cy="4.2" r=".25"/><circle cx="8.8" cy="4.2" r=".25"/>',
  wechat: '<path d="M8.8 9.8c-.8.5-1.8.8-2.9.8-.5 0-1-.1-1.5-.2l-1.8 1 .5-1.7C2.4 9 2 8.1 2 7.1c0-2 1.8-3.7 4-3.7 2 0 3.7 1.3 4 3"/><path d="M14 9.2c0 1-.4 1.9-1.1 2.5l.4 1.5-1.5-.8c-.4.1-.8.2-1.3.2-1.9 0-3.5-1.4-3.5-3.2s1.6-3.2 3.5-3.2S14 7.4 14 9.2Z"/><circle cx="4.8" cy="6.7" r=".25"/><circle cx="7.2" cy="6.7" r=".25"/><circle cx="9.6" cy="8.8" r=".25"/><circle cx="11.6" cy="8.8" r=".25"/>',
  feishu: '<path d="m8 2.1 1.5 3.2 3.4-1.2-1.2 3.4 2.9 1.7-3.2 1-.1 3.6-2.7-2.4L6 13.8l-.2-3.6-3.2-1 2.9-1.7-1.2-3.4 3.4 1.2Z"/>',
  'windows-share': '<path d="M2.5 3.5 7.2 2.8v4.6H2.5ZM8.2 2.7l5.3-.8v5.5H8.2ZM2.5 8.4h4.7V13l-4.7-.7ZM8.2 8.4h5.3v5.7l-5.3-.9Z"/>',
  zip: '<path d="M4 2.5h5l3 3V14H4ZM9 2.5v3h3M7 3.2h2M7 5.2h2M7 7.2h2M6.3 10h3.4l-3.4 2h3.4"/>',
  'seven-zip': '<rect x="2.5" y="3" width="11" height="10" rx="1.4"/><path d="M4.5 5.5h5L7 10.8M10.5 7v3.5M12 7v3.5"/>',
  bandizip: '<rect x="2.5" y="2.8" width="11" height="10.4" rx="1.5"/><path d="M5.2 4.7v6.6h3.3a1.7 1.7 0 0 0 0-3.4H5.2h3a1.6 1.6 0 0 0 0-3.2Z"/>',
  winrar: '<path d="M3 2.5h10v3H3ZM3 6.5h10v3H3ZM3 10.5h10v3H3ZM7.2 2.5v11h2v-2h-2"/>',
  settings: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1"/>',
  disk: '<ellipse cx="8" cy="4" rx="5.5" ry="2"/><path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"/>',
  format: '<path d="m3 11 7-7 3 3-7 7H3ZM8.5 5.5l3 3M9 12h5"/>',
  remove: '<circle cx="8" cy="8" r="6"/><path d="M5 8h6"/>',
  folder: '<path d="M2 4.5h4.2L7.7 6H14v6.5H2z"/>',
  type: '<path d="M2.5 3.5h5v4h-5zM8.5 3.5h5v4h-5zM2.5 8.5h5v4h-5zM8.5 8.5h5v4h-5z"/>',
  calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M5 2v3M11 2v3M2.5 6.5h11M5 9h2M9 9h2M5 11.5h2"/>',
  size: '<path d="M3 13 13 3M7 3h6v6M3 7v6h6"/>',
  extension: '<path d="M4 2.5h5l3 3V14H4zM9 2.5v3h3"/><path d="M6 9h4M6 11h2.5"/>',
  check: '<path d="m3 8 3 3 7-7"/>',
});

const CONTEXT_MENU_ICON_TONES = Object.freeze({
  delete: 'danger',
  deleteForever: 'danger',
  close: 'danger',
  clear: 'danger',
  star: 'favorite',
  shield: 'security',
  permissions: 'security',
  vscode: 'brand',
  'visual-studio': 'brand',
  cmd: 'brand',
  powershell: 'brand',
  'git-bash': 'brand',
  vlc: 'brand',
  potplayer: 'brand',
  qq: 'brand',
  wechat: 'brand',
  feishu: 'brand',
  'windows-share': 'brand',
  zip: 'brand',
  'seven-zip': 'brand',
  bandizip: 'brand',
  winrar: 'brand',
});

function contextMenuIconMarkup(name) {
  const path = typeof name === 'string' ? CONTEXT_MENU_ICON_PATHS[name] : null;
  if (!path) return '<span class="ctx-icon ctx-icon-empty" aria-hidden="true"></span>';
  const tone = CONTEXT_MENU_ICON_TONES[name];
  const classes = `ctx-icon ctx-icon-${name}${tone ? ` ctx-icon-${tone}` : ''}`;
  return `<span class="${classes}" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none">${path}</svg></span>`;
}

function contextMenuLabelMarkup(item) {
  return `<span class="ctx-item-main">${contextMenuIconMarkup(item.icon)}<span class="ctx-label">${esc(item.label)}</span></span>`;
}

/// Clamp context menu position so it never overflows the viewport.
/// Falls back to scroll if the menu is larger than the viewport.
function clampMenuPosition(menu, anchorX, anchorY, { minVisible = 40 } = {}) {
  const rect = menu.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal: prefer right of anchor, flip left if overflow
  if (rect.right > vw) {
    const flippedLeft = anchorX - rect.width;
    if (flippedLeft >= 0) {
      menu.style.left = flippedLeft + "px";
    } else {
      // Not enough room either side — clamp to left edge + limit width
      menu.style.left = "0px";
      menu.style.maxWidth = (vw - 4) + "px";
    }
  }

  // Vertical: prefer below anchor, flip above if overflow
  if (rect.bottom > vh) {
    const flippedTop = anchorY - rect.height;
    if (flippedTop >= 0) {
      menu.style.top = flippedTop + "px";
    } else {
      // Not enough room either side — clamp near top + limit height
      menu.style.top = minVisible + "px";
      const availH = vh - minVisible - 8;
      if (rect.height > availH) {
        menu.style.maxHeight = availH + "px";
        menu.style.overflowY = "auto";
      }
    }
  }
}

function renderMenuItems(parent, items, x, y) {
  const normalized = [];
  items.filter(item => !item.hidden).forEach(item => {
    const isSep = item === "-" || item.label === "-";
    if (isSep && (normalized.length === 0 || normalized[normalized.length - 1] === "-" || normalized[normalized.length - 1].label === "-")) return;
    normalized.push(item);
  });
  while (normalized.length && (normalized[normalized.length - 1] === "-" || normalized[normalized.length - 1].label === "-")) normalized.pop();

  let lastWasSep = false;
  normalized.forEach(item => {
    if (item === "-" || item.label === "-") {
      if (lastWasSep) return;
      lastWasSep = true;
      const sep = document.createElement("div"); sep.className = "ctx-sep"; parent.appendChild(sep);
    } else if (item.submenu) {
      lastWasSep = false;
      const mi = document.createElement("div");
      mi.className = "ctx-item" + (item.disabled ? " disabled" : "");
      mi.innerHTML = `${contextMenuLabelMarkup(item)}<span class="ctx-arrow">\u25B6</span>`;
      const sub = document.createElement("div");
      sub.className = "ctx-submenu";
      renderMenuItems(sub, item.submenu, x, y);
      mi.appendChild(sub);
      mi.addEventListener("mouseenter", () => {
        const rect = mi.getBoundingClientRect();
        const subRect = sub.getBoundingClientRect();
        sub.style.top = "0";
        sub.style.left = "100%";
        sub.style.right = "auto";
        if (rect.right + subRect.width > window.innerWidth) {
          sub.style.left = "auto";
          sub.style.right = "100%";
        }
        requestAnimationFrame(() => {
          const visibleRect = sub.getBoundingClientRect();
          if (visibleRect.bottom > window.innerHeight - 4) {
            sub.style.top = Math.min(0, window.innerHeight - 4 - visibleRect.bottom) + "px";
          }
        });
      });
      mi.addEventListener("click", e => {
        if (e.target.closest('.ctx-submenu')) return;
      });
      parent.appendChild(mi);
    } else {
      lastWasSep = false;
      const mi = document.createElement("div");
      mi.className = "ctx-item" + (item.disabled ? " disabled" : "");
      mi.innerHTML = `${contextMenuLabelMarkup(item)}${item.shortcut ? `<span class="ctx-shortcut">${esc(item.shortcut)}</span>` : ""}`;
      mi.addEventListener("click", e => {
        if (item.disabled) return;
        const actionFn = item.action;
        if (item._flash) {
          const rect = mi.getBoundingClientRect();
          flashAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
          setTimeout(() => {
            removeContextMenu();
            if (actionFn) actionFn();
          }, 80);
        } else {
          removeContextMenu();
          if (actionFn) actionFn();
        }
      });
      parent.appendChild(mi);
    }
  });
}

function flashAt(x, y) {
  const d = document.createElement("div");
  d.style.position = "fixed";
  d.style.zIndex = "9999";
  d.style.pointerEvents = "none";
  d.style.background = "var(--accent)";
  d.style.opacity = "0.18";
  d.style.left = "0";
  d.style.top = "0";
  d.style.width = "100vw";
  d.style.height = "100vh";
  d.style.borderRadius = "0";
  document.body.appendChild(d);
  requestAnimationFrame(() => {
    d.style.transition = "all .4s ease-out";
    d.style.left = (x - 4) + "px";
    d.style.top = (y - 4) + "px";
    d.style.width = "8px";
    d.style.height = "8px";
    d.style.borderRadius = "50%";
    d.style.opacity = "0";
  });
  setTimeout(() => d.remove(), 450);
}

function buildProgramOpenMenu(targetPath, options) {
  const opts = options || {};
  const items = [
    { label: "VS Code", icon: "vscode", action: () => openWithProgramFromMenu(targetPath, "vscode", "VS Code") },
    { label: "Visual Studio", icon: "visual-studio", action: () => openWithProgramFromMenu(targetPath, "visual_studio", "Visual Studio") },
    { label: "-" },
    { label: "CMD", icon: "cmd", action: () => openWithProgramFromMenu(targetPath, "cmd", "CMD") },
    { label: "PowerShell", icon: "powershell", action: () => openWithProgramFromMenu(targetPath, "powershell", "PowerShell") },
    { label: "Git Bash", icon: "git-bash", action: () => openWithProgramFromMenu(targetPath, "git_bash", "Git Bash") },
  ];
  if (opts.isMedia) {
    items.push({ label: "VLC", icon: "vlc", action: () => openWithProgramFromMenu(targetPath, "vlc", "VLC") });
    items.push({ label: "PotPlayer", icon: "potplayer", action: () => openWithProgramFromMenu(targetPath, "potplayer", "PotPlayer") });
  }
  if (opts.isDirectory) {
    items.push({ label: t('ctx.playFolderWithVlc'), icon: "vlc", action: () => openWithProgramFromMenu(targetPath, "vlc_folder", "VLC") });
  }
  if (opts.isMedia || opts.isDirectory) items.push({ label: "-" });
  if (opts.includeSystemDialog !== false) {
    items.push({ label: t('ctx.openWithDialog'), icon: "window", action: () => runContextCommand("show_open_with_dialog", { path: targetPath }, t('ctx.openWithDialog')) });
  }
  if (opts.includeNewWindow) {
    items.push({ label: t('ctx.newWindow'), icon: "window", action: () => call("open_new_window", { initialPath: targetPath }) });
  }
  return items;
}

function showContextMenu(x, y, isRight) {
  removeContextMenu();
  const sel = getSelectedPaths(isRight);
  const hasSelection = sel.length > 0;
  const singleSelection = sel.length === 1;
  const singleFile = singleSelection && !sel[0].is_dir ? sel[0] : null;
  const singleDir = singleSelection && sel[0].is_dir ? sel[0] : null;
  const isDir = singleSelection && sel[0].is_dir;
  const ext = singleFile ? (singleFile.extension || "").toLowerCase() : "";
  const isImage = ["jpg","jpeg","png","gif","bmp","webp","svg","ico","tiff"].includes(ext);
  const isArchive = ["zip","rar","7z","tar","gz","bz2"].includes(ext);
  const isMedia = ["mp4","mkv","avi","mov","wmv","flv","webm","mp3","flac","wav","aac","ogg","m4a","wma","ape","alac"].includes(ext);
  const conversionKind = singleFile && typeof mediaConversionKind === 'function' ? mediaConversionKind(singleFile) : null;
  const isExe = ext === "exe" || ext === "msi";
  const isFont = ["ttf","otf","fon"].includes(ext);
  const isCert = ["cer","crt","p7b","pfx","p12"].includes(ext);
  const currentPath = isRight ? G.rp.path : getTab().path;
  const extractFolder = singleFile ? archiveFolderName(singleFile.name) : '';
  const openTarget = singleSelection ? sel[0].path : currentPath;

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${x}px;top:${y}px;z-index:9999;`;

  const openWithSubmenu = buildProgramOpenMenu(openTarget, {
    isDirectory: isDir,
    isMedia,
    includeNewWindow: isDir,
  });

  const items = [
    { label: t('ctx.open'), icon:"open", shortcut:"Enter", action: () => { if (singleSelection) { if (sel[0].is_dir) { if (isRight) rpNavigateTo(sel[0].path); else navigateTo(sel[0].path); } else openFileHandler(sel[0].path); } }, disabled: !singleSelection },
    { label: t('ctx.preview'), icon:"preview", shortcut:"Space", action: () => previewSelected(isRight), disabled: !singleSelection },
    { label: t('ctx.newTab'), icon:"tab", action: () => addTab(singleDir.path), hidden: !singleDir },
    { label: t('ctx.openWith'), icon:"window", submenu: openWithSubmenu, disabled: !singleSelection },
    { label: t('ctx.convertFormat'), icon:"convert", action: () => showMediaConvertDialog(singleFile, isRight), hidden: !conversionKind },
    { label: isDir ? t('ctx.openFolderInExplorer') : t('ctx.openContainingFolderInExplorer'), icon:"explorer", action: () => runContextCommand('open_in_windows_explorer', {path: sel[0].path, isDirectory: isDir}, isDir ? t('ctx.openFolderInExplorer') : t('ctx.openContainingFolderInExplorer')), disabled: !singleSelection },
    { label: isFavoriteFolder(singleDir?.path) ? t('favorites.remove') : t('favorites.add'), icon:"star", action: () => toggleFavoriteFolder(singleDir.path, singleDir.name), hidden: !singleDir },
    { label: "-", action: null },
    { label: t('ctx.cut'), icon:"cut", shortcut:"Ctrl+X", action: () => cutSelected(isRight), disabled: !hasSelection },
    { label: t('ctx.copy'), icon:"copy", shortcut:"Ctrl+C", action: () => copySelected(isRight), disabled: !hasSelection },
    { label: t('ctx.paste'), icon:"paste", shortcut:"Ctrl+V", action: () => paste(isRight) },
    { label: "-", action: null },
    { label: t('ctx.rename'), icon:"rename", shortcut:"F2", action: () => renamePrompt(isRight), disabled: !singleSelection },
    { label: t('ctx.batchRename'), icon:"batch", action: () => openBatchRename(isRight), hidden: sel.length < 2 },
    { label: t('ctx.delete'), icon:"delete", shortcut:"Del", action: () => deleteSelected(isRight), disabled: !hasSelection },
    { label: t('ctx.deletePermanently'), icon:"deleteForever", shortcut:"Shift+Del", action: () => deleteSelectedPermanently(isRight), disabled: !hasSelection },
    { label: t('ctx.addTag'), icon:"tag", action: () => openTagDialog(isRight), disabled: !hasSelection },
    { label: "-", action: null },
    { label: sel.length > 1 ? t('ctx.copyPaths', {count: sel.length}) : t('ctx.copyPath'), icon:"path", shortcut:"Ctrl+Shift+C", action: () => copySelectedPaths(isRight), disabled: !hasSelection },
    { label: t('search.openLocation'), icon:"location", action: () => {
        if (singleSelection) {
            document.getElementById("filter-input").value = '';
            G.searchActive = false;
            G.searchQuery = '';
            const f = sel[0];
            const parent = parentFolderPath(f.path);
            navigateTo(parent).then(() => {
                const tab = getTab();
                const idx = tab.entries.findIndex(e => e.path === f.path);
                if (idx >= 0) {
                    tab.sel.clear(); tab.sel.add(idx); tab.lastIdx = idx;
                    renderFiles(tab, "file-list", "status-count", "status-selection");
                    scrollToVisible(idx);
                }
            });
        }
    }, hidden: !G.searchActive || !singleSelection },
    { label: t('ctx.share'), icon:"share", submenu: [
      { label: t('ctx.shareQQ'), icon:"qq", action: () => { if (singleSelection) runContextCommand("share_file", { path: sel[0].path, target: "qq" }, t('ctx.shareQQ')); } },
      { label: t('ctx.shareWechat'), icon:"wechat", action: () => { if (singleSelection) runContextCommand("share_file", { path: sel[0].path, target: "wechat" }, t('ctx.shareWechat')); } },
      { label: t('ctx.shareFeishu'), icon:"feishu", action: () => { if (singleSelection) runContextCommand("share_file", { path: sel[0].path, target: "feishu" }, t('ctx.shareFeishu')); } },
      { label: "-" },
      { label: t('ctx.windowsShare'), icon:"windows-share", action: () => { if (singleSelection) runContextCommand("share_file", { path: sel[0].path, target: "windows" }, t('ctx.windowsShare')); } },
    ], disabled: !singleSelection },
    { label: t('ctx.compress'), icon:"archive", submenu: [
      { label: "ZIP", icon:"zip", action: () => compressSelection(sel, currentPath, "zip") },
      { label: "7-Zip (.7z)", icon:"seven-zip", action: () => compressSelection(sel, currentPath, "7zip") },
      { label: "Bandizip", icon:"bandizip", action: () => compressSelection(sel, currentPath, "bandizip") },
      { label: "WinRAR (.rar)", icon:"winrar", action: () => compressSelection(sel, currentPath, "winrar") },
    ], disabled: !hasSelection },
    { label: "-", action: null },
    { label: t('ctx.newFile'), icon:"filePlus", shortcut:"Ctrl+Shift+N", action: () => showNewFileDialog(isRight) },
    { label: t('ctx.newFolder'), icon:"folderPlus", shortcut:"F7", action: () => newFolder(isRight) },
    { label: "-", action: null, hidden: !singleSelection },
    { label: t('ctx.setWallpaper'), icon:"image", action: () => runContextCommand("set_wallpaper", { path: sel[0].path }, t('ctx.setWallpaper')), disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: t('ctx.rotateLeft'), icon:"rotateLeft", action: () => runContextCommand("rotate_image", { path: sel[0].path, degrees: -90 }, t('ctx.rotateLeft'), { refreshAfter: true }), disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: t('ctx.rotateRight'), icon:"rotateRight", action: () => runContextCommand("rotate_image", { path: sel[0].path, degrees: 90 }, t('ctx.rotateRight'), { refreshAfter: true }), disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: "-", action: null, hidden: !singleFile || !isImage },
    { label: t('ctx.extractHere'), icon:"extract", action: () => extractArchiveTo(singleFile, currentPath), disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: t('ctx.extractTo', {name: extractFolder}), icon:"extract", action: () => extractArchiveTo(singleFile, joinFolderPath(currentPath, extractFolder)), disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: "-", action: null, hidden: !singleFile || !isArchive },
    { label: t('ctx.runAsAdmin'), icon:"shield", action: () => runContextCommand("run_as_admin", { path: sel[0].path }, t('ctx.runAsAdmin')), disabled: !singleFile || !isExe, hidden: !singleFile || !isExe },
    { label: t('ctx.installCert'), icon:"certificate", action: () => runContextCommand("install_certificate", { path: sel[0].path }, t('ctx.installCert'), { successMessage: t('notice.certInstalled') }), disabled: !singleFile || !isCert, hidden: !singleFile || !isCert },
    { label: t('ctx.installFont'), icon:"font", action: () => runContextCommand("install_font", { path: sel[0].path }, t('ctx.installFont'), { successMessage: t('notice.fontInstalled') }), disabled: !singleFile || !isFont, hidden: !singleFile || !isFont },
    { label: "-", action: null, hidden: !singleSelection },
    { label: t('ctx.properties'), icon:"properties", shortcut:"Alt+Enter", action: () => { if (singleSelection) showPropertiesDialog(sel[0].path); }, disabled: !singleSelection },
    { label: t('ctx.permissions'), icon:"permissions", action: () => { if (singleSelection) showPermissionsDialog(sel[0].path); }, disabled: !singleSelection },
  ];

  renderMenuItems(menu, items, x, y);

  document.body.appendChild(menu);
  _ctxShow(menu);

  let ctxMeta = { x, y, isRight, singleSelection, sel, singleFile, isDir, items };

  menu.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); removeContextMenu(); return; }
    if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const s = getSelectedPaths(ctxMeta.isRight);
      if (s.length) {
        removeContextMenu();
        showPropertiesDialog(s[0].path);
      }
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      e.stopPropagation();
      const s2 = getSelectedPaths(ctxMeta.isRight);
      if (s2.length) {
        removeContextMenu();
        if (e.shiftKey) deleteSelectedPermanently(ctxMeta.isRight);
        else deleteSelected(ctxMeta.isRight);
      }
      return;
    }
    if (e.key === "F2") {
      e.preventDefault();
      e.stopPropagation();
      const s3 = getSelectedPaths(ctxMeta.isRight);
      if (s3.length === 1) { removeContextMenu(); renamePrompt(ctxMeta.isRight); }
      return;
    }
    if (e.key === "Enter" && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (ctxMeta.singleSelection) {
        const s = getSelectedPaths(ctxMeta.isRight);
        if (s.length) { removeContextMenu(); if (s[0].is_dir) { if (ctxMeta.isRight) rpNavigateTo(s[0].path); else navigateTo(s[0].path); } else openFileHandler(s[0].path); }
      }
      return;
    }
  });
  menu.tabIndex = -1;
  menu.focus();

  requestAnimationFrame(() => clampMenuPosition(menu, x, y));
}

function removeContextMenu() {
  if (contextMenu) {
    contextMenu.remove();
    contextMenu = null;
  }
  // Belt and suspenders: remove any orphaned context menus
  document.querySelectorAll(".context-menu").forEach(el => {
    el.remove();
  });
  document.removeEventListener("pointerdown", _ctxClosePtr, true);
  window.removeEventListener("blur", _ctxCloseBlur);
}
function _ctxClosePtr(e) {
  if (contextMenu && !contextMenu.contains(e.target) && !e.target.closest('.ctx-submenu')) removeContextMenu();
}
function _ctxCloseBlur() {
  if (contextMenu) removeContextMenu();
}
function _ctxShow(menu) {
  contextMenu = menu;
  document.addEventListener("pointerdown", _ctxClosePtr, true);
  window.addEventListener("blur", _ctxCloseBlur);
}

function showMenuAt(x, y, items, className) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu' + (className ? ' ' + className : '');
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.zIndex = '9999';
  renderMenuItems(menu, items, x, y);
  document.body.appendChild(menu);
  _ctxShow(menu);
  menu.tabIndex = -1;
  requestAnimationFrame(() => { clampMenuPosition(menu, x, y); menu.focus(); });
  return menu;
}

function showTabContextMenu(x, y, tabId, isRight) {
  const tabs = isRight ? G.rpTabs : G.tabs;
  const tab = isRight ? getRightTab(tabId) : getTab(tabId);
  if (!tab) return;
  const index = tabs.findIndex(item => item.id === tabId);
  const folderPath = tab.path;
  const hasClosableOthers = tabsKeptAfterCloseOthers(tabs, tabId).length < tabs.length;
  const hasClosableRight = closableTabIdsToRight(tabs, tabId).size > 0;
  showMenuAt(x, y, [
    { label: t(tab.pinned ? 'tab.unpin' : 'tab.pin'), icon: 'pin', action: () => toggleTabPinned(tabId, isRight) },
    { label: t('tab.duplicate'), icon: 'duplicate', action: () => duplicateTab(tabId, isRight) },
    { label: '-' },
    { label: t('tab.close'), icon: 'close', shortcut: 'Ctrl+W', action: () => closeTab(tabId, isRight), disabled: tabs.length <= 1 },
    { label: t('tab.closeOthers'), icon: 'close', action: () => closeOtherTabs(tabId, isRight), disabled: !hasClosableOthers },
    { label: t('tab.closeRight'), icon: 'close', action: () => closeTabsToRight(tabId, isRight), disabled: index < 0 || !hasClosableRight },
    { label: '-' },
    { label: t('ctx.copyPath'), icon: 'path', action: () => copyPathFromMenu(folderPath), disabled: folderPath === 'home://' },
    { label: t('ctx.openFolderInExplorer'), icon: 'explorer', action: () => runContextCommand('open_in_windows_explorer', {path: folderPath, isDirectory: true}, t('ctx.openFolderInExplorer')), disabled: folderPath === 'home://' },
    { label: t('ctx.openCmd'), icon: 'cmd', action: () => runContextCommand('open_terminal', {path: folderPath, terminal: 'cmd'}, 'CMD'), disabled: folderPath === 'home://' },
    { label: t('ctx.openPowerShell'), icon: 'powershell', action: () => runContextCommand('open_terminal', {path: folderPath, terminal: 'powershell'}, 'PowerShell'), disabled: folderPath === 'home://' },
    { label: '-' },
    { label: t('cmd.refresh'), icon: 'refresh', shortcut: 'F5', action: () => { if (isRight) switchRightTab(tabId); else if (G.activeTab !== tabId) switchTab(tabId); refresh(); } },
  ], 'tab-context-menu');
}

async function writeTextClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    return true;
  } catch (e) {
    return false;
  }
}

function replaceInputSelection(input, text) {
  const start = input.selectionStart == null ? input.value.length : input.selectionStart;
  const end = input.selectionEnd == null ? start : input.selectionEnd;
  input.setRangeText(text, start, end, 'end');
  input.dispatchEvent(new Event('input', {bubbles: true}));
}

function showInputContextMenu(x, y, input, options) {
  const selected = input.value.slice(input.selectionStart || 0, input.selectionEnd || 0);
  const editable = !input.readOnly && !input.disabled;
  const items = [
    { label: t('ctx.cut'), icon: 'cut', shortcut: 'Ctrl+X', disabled: !editable || !selected, action: async () => { if (await writeTextClipboard(selected)) replaceInputSelection(input, ''); } },
    { label: t('ctx.copy'), icon: 'copy', shortcut: 'Ctrl+C', disabled: !selected, action: () => writeTextClipboard(selected) },
    { label: t('ctx.paste'), icon: 'paste', shortcut: 'Ctrl+V', disabled: !editable, action: async () => { try { replaceInputSelection(input, await navigator.clipboard.readText()); } catch (e) {} } },
    { label: t('ctx.selectAll'), icon: 'selectAll', shortcut: 'Ctrl+A', disabled: !input.value, action: () => { input.focus(); input.select(); } },
    { label: t('search.clear'), icon: 'clear', disabled: !editable || !input.value, action: () => { input.value = ''; input.dispatchEvent(new Event('input', {bubbles: true})); } },
  ];
  if (options && options.search) {
    const folderName = getSearchFolderPath()?.split('\\').filter(Boolean).pop() || t('nav.home');
    items.push({label: '-'});
    items.push({ label: (_searchScope === 'folder' ? '\u2713 ' : '') + t('search.scopeFolder', {folder: folderName}), icon: 'searchFolder', action: () => setSearchScope('folder') });
    items.push({ label: (_searchScope === 'global' ? '\u2713 ' : '') + t('search.scopeGlobal'), icon: 'globe', shortcut: 'Ctrl+Shift+F', disabled: G.settings.globalSearchEnabled === false, action: () => setSearchScope('global') });
  }
  showMenuAt(x, y, items, 'input-context-menu');
}

function showPathContextMenu(x, y, path, isDir, isRight) {
  if (!path || path === 'home://') {
    showMenuAt(x, y, [
      { label: t('cmd.refresh'), icon: 'refresh', shortcut: 'F5', action: refresh },
      { label: t('cmd.newTab'), icon: 'tab', shortcut: 'Ctrl+T', action: () => addTab('home://') },
      { label: t('cmd.settings'), icon: 'settings', shortcut: 'Ctrl+,', action: openSettings },
    ]);
    return;
  }
  const terminalPath = isDir ? path : parentFolderPath(path);
  const openAction = () => {
    if (isDir) { if (isRight) rpNavigateTo(path); else navigateTo(path); }
    else openFileHandler(path);
  };
  const items = [
    { label: t('ctx.open'), icon: 'open', action: openAction },
    { label: t('ctx.newTab'), icon: 'tab', action: () => addTab(path, isRight), hidden: !isDir },
    { label: '-' },
    { label: t('ctx.copyPath'), icon: 'path', action: () => copyPathFromMenu(path) },
    { label: isDir ? t('ctx.openFolderInExplorer') : t('ctx.openContainingFolderInExplorer'), icon: 'explorer', action: () => runContextCommand('open_in_windows_explorer', {path, isDirectory: isDir}, isDir ? t('ctx.openFolderInExplorer') : t('ctx.openContainingFolderInExplorer')) },
    { label: t('ctx.openCmd'), icon: 'cmd', action: () => runContextCommand('open_terminal', {path: terminalPath, terminal: 'cmd'}, 'CMD') },
    { label: t('ctx.openPowerShell'), icon: 'powershell', action: () => runContextCommand('open_terminal', {path: terminalPath, terminal: 'powershell'}, 'PowerShell') },
    { label: t('diskUsage.analyze'), icon: 'disk', hidden: !isDir, action: () => showDiskUsageDialog(path) },
    { label: isFavoriteFolder(path) ? t('favorites.remove') : t('favorites.add'), icon: 'star', hidden: !isDir, action: () => toggleFavoriteFolder(path, favoriteDisplayName(path)) },
    { label: '-' },
    { label: t('ctx.properties'), icon: 'properties', action: () => showPropertiesDialog(path) },
  ];
  showMenuAt(x, y, items, 'path-context-menu');
}

function showBlankListContextMenu(x, y, isRight) {
  G.lastActivePane = isRight ? 'right' : 'left';
  if (typeof updatePaneFocusUI === 'function') updatePaneFocusUI();
  const path = isRight ? G.rp.path : getTab().path;
  showMenuAt(x, y, [
    { label: t('ctx.newFolder'), icon: 'folderPlus', shortcut: 'F7', action: () => newFolder(isRight) },
    { label: t('ctx.newFile'), icon: 'filePlus', shortcut: 'Ctrl+Shift+N', action: () => showNewFileDialog(isRight) },
    { label: '-' },
    { label: t('ctx.paste'), icon: 'paste', shortcut: 'Ctrl+V', action: () => paste(isRight) },
    { label: t('cmd.refresh'), icon: 'refresh', shortcut: 'F5', action: refresh },
    { label: t('ctx.selectAll'), icon: 'selectAll', shortcut: 'Ctrl+A', action: () => selectAll(isRight) },
    { label: '-' },
    { label: t('ctx.copyPath'), icon: 'path', action: () => copyPathFromMenu(path) },
    { label: t('ctx.openFolderInExplorer'), icon: 'explorer', action: () => runContextCommand('open_in_windows_explorer', {path, isDirectory: true}, t('ctx.openFolderInExplorer')) },
    { label: t('ctx.openWith'), icon: 'window', submenu: buildProgramOpenMenu(path, {isDirectory:true, includeNewWindow:true}) },
    { label: t('ctx.openCmd'), icon: 'cmd', action: () => runContextCommand('open_terminal', {path, terminal: 'cmd'}, 'CMD') },
    { label: t('ctx.openPowerShell'), icon: 'powershell', action: () => runContextCommand('open_terminal', {path, terminal: 'powershell'}, 'PowerShell') },
    { label: t('diskUsage.analyze'), icon: 'disk', action: () => showDiskUsageDialog(path) },
    { label: isFavoriteFolder(path) ? t('favorites.removeCurrent') : t('favorites.addCurrent'), icon: 'star', action: () => toggleFavoriteFolder(path, favoriteDisplayName(path)) },
    { label: t('ctx.properties'), icon: 'properties', action: () => showPropertiesDialog(path) },
  ]);
}

function showApplicationContextMenu(event) {
  event.preventDefault();
  if (event.target.closest('.context-menu, .ctx-submenu')) return;
  const tabEl = event.target.closest('#tab-bar .tab, #right-tab-bar .tab');
  if (tabEl) {
    event.stopPropagation();
    showTabContextMenu(event.clientX, event.clientY, Number(tabEl.dataset.tabId), tabEl.dataset.pane === 'right');
    return;
  }
  const input = event.target.closest('input[type="text"], input[type="search"], textarea');
  if (input) {
    event.stopPropagation();
    showInputContextMenu(event.clientX, event.clientY, input, {search: input.id === 'filter-input'});
    return;
  }
  const address = event.target.closest('.address-bar');
  if (address) {
    event.stopPropagation();
    const isRight = address.id === 'right-address-bar';
    const path = isRight ? G.rp.path : getTab().path;
    showPathContextMenu(event.clientX, event.clientY, path, true, isRight);
    return;
  }
  const search = event.target.closest('.search-box');
  if (search) {
    event.stopPropagation();
    showInputContextMenu(event.clientX, event.clientY, document.getElementById('filter-input'), {search: true});
    return;
  }
  const list = event.target.closest('.file-list');
  if (list && !event.target.closest('.file-row, .column-item')) {
    event.stopPropagation();
    showBlankListContextMenu(event.clientX, event.clientY, list.id === 'right-file-list');
    return;
  }
  const sidebar = event.target.closest('.sidebar');
  if (sidebar) {
    event.stopPropagation();
    const item = event.target.closest('[data-path], [data-nav]');
    const path = item?.dataset.path || (item?.dataset.nav ? homeDir(item.dataset.nav) : null);
    if (path) showPathContextMenu(event.clientX, event.clientY, path, true, false);
    else showMenuAt(event.clientX, event.clientY, [{label: t('cmd.refresh'), icon: 'refresh', action: refresh}, {label: t('cmd.settings'), icon: 'settings', action: openSettings}]);
    return;
  }
  event.stopPropagation();
  showMenuAt(event.clientX, event.clientY, [
    { label: t('cmd.refresh'), icon: 'refresh', shortcut: 'F5', action: refresh },
    { label: t('cmd.newTab'), icon: 'tab', shortcut: 'Ctrl+T', action: () => addTab(getTab().path) },
    { label: t('cmd.settings'), icon: 'settings', shortcut: 'Ctrl+,', action: openSettings },
  ], 'app-context-menu');
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && contextMenu) removeContextMenu();
});
document.addEventListener("contextmenu", e => {
  if (contextMenu && !contextMenu.contains(e.target)) removeContextMenu();
});

// --- drag & drop ---
function showFileDropOperationDialog(paths, destination) {
  return new Promise(resolve => {
    document.querySelector('.app-file-drop-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'overlay app-file-drop-overlay app-confirm-overlay';
    overlay.tabIndex = -1;
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog-box app-confirm-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const body = document.createElement('div');
    body.className = 'app-confirm-body';
    const icon = document.createElement('div');
    icon.className = 'app-confirm-icon transfer';
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const copy = document.createElement('div');
    copy.className = 'app-confirm-copy';
    const title = document.createElement('div');
    title.className = 'app-confirm-title';
    title.textContent = t('dragDrop.title');
    const message = document.createElement('div');
    message.className = 'app-confirm-message';
    message.textContent = paths.length === 1
      ? t('dragDrop.item', {name: String(paths[0]).split(/[\\/]/).pop()})
      : t('dragDrop.items', {count: paths.length});
    const detail = document.createElement('div');
    detail.className = 'app-confirm-detail';
    detail.textContent = t('dragDrop.destination', {path: displayPath(destination)});
    copy.append(title, message, detail);
    body.append(icon, copy);
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const cancel = document.createElement('button');
    cancel.className = 'dialog-btn';
    cancel.textContent = t('btn.cancel');
    const copyButton = document.createElement('button');
    copyButton.className = 'dialog-btn';
    copyButton.textContent = t('btn.copy');
    const moveButton = document.createElement('button');
    moveButton.className = 'dialog-btn primary';
    moveButton.textContent = t('btn.move');
    actions.append(cancel, copyButton, moveButton);
    box.append(body, actions);
    overlay.append(backdrop, box);
    let settled = false;
    const finish = choice => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(choice);
    };
    cancel.addEventListener('click', () => finish('cancel'));
    copyButton.addEventListener('click', () => finish('copy'));
    moveButton.addEventListener('click', () => finish('move'));
    backdrop.addEventListener('click', () => finish('cancel'));
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish('cancel');
      }
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.focus(); cancel.focus(); });
  });
}

async function broadcastFileDropChanges(paths) {
  const emit = window.__TAURI_INTERNALS__?.event?.emit || window.__TAURI__?.event?.emit;
  if (!emit) return;
  await emit('fs-change', {
    paths: [...new Set(paths)],
    originWindow: currentFileDragWindowId(),
  });
}

async function performDroppedFileOperation(paths, destination, destinationEntries, operation) {
  const existingNames = new Set((destinationEntries || []).map(entry => fileNameKey(entry.name)));
  const changedFolders = [destination];
  let applyAllAction = null;
  let changed = false;
  let userCancelled = false;
  const taskId = createOperationTaskId();
  const errors = [];
  let taskStarted = false;

  try {
    for (let sourceIndex = 0; sourceIndex < paths.length; sourceIndex++) {
      if (taskStarted && isOperationCancellationRequested(taskId)) {
        userCancelled = true;
        break;
      }
      const src = paths[sourceIndex];
      const sourceName = String(src).split(/[\\/]/).pop();
      const originalTarget = joinFolderPath(destination, sourceName);
      const sameTarget = windowsPathKey(src) === windowsPathKey(originalTarget);
      if (operation === 'move' && sameTarget) continue;

      const conflict = sameTarget
        || existingNames.has(fileNameKey(sourceName))
        || await call('path_exists', {path: originalTarget});
      let conflictAction = sameTarget ? 'rename' : 'move';
      if (conflict && !sameTarget) {
        if (applyAllAction) {
          conflictAction = applyAllAction;
        } else {
          conflictAction = await new Promise(resolve => {
            showConflictDialog(sourceName, sourceName, src, originalTarget, (choice, applyAll) => {
              if (applyAll) applyAllAction = choice;
              resolve(choice);
            });
          });
        }
      }
      if (conflictAction === 'cancel') {
        userCancelled = true;
        break;
      }
      if (conflictAction === 'skip') continue;
      if (taskStarted && isOperationCancellationRequested(taskId)) {
        userCancelled = true;
        break;
      }

      const targetName = conflictAction === 'rename'
        ? generateUniqueName(destination, sourceName, existingNames)
        : sourceName;
      const targetPath = joinFolderPath(destination, targetName);
      const overwrites = conflict && conflictAction === 'replace';
      taskStarted = true;
      showProgress(operation === 'copy' ? t('status.copying') : t('status.moving'), {
        taskId,
        indeterminate: true,
        cancellable: true,
        currentName: sourceName,
        currentPath: src,
        currentIndex: sourceIndex + 1,
        totalItems: paths.length,
      });
      if (isOperationCancellationRequested(taskId)) {
        userCancelled = true;
        break;
      }
      try {
        const args = {
          src,
          dest: destination,
          overwrite: overwrites,
          targetName: targetName === sourceName ? null : targetName,
          operationId: taskId,
        };
        if (operation === 'copy') {
          await call('copy_with_progress', args);
          if (!overwrites) trackCopy(src, targetPath);
        } else {
          await call('move_with_progress', args);
          if (!overwrites) trackMove(src, targetPath);
          changedFolders.push(parentFolderPath(src));
        }
        changed = true;
        existingNames.add(fileNameKey(targetName));
      } catch (error) {
        if (/cancel/i.test(String(error))) {
          userCancelled = true;
          break;
        }
        errors.push(sourceName + ': ' + String(error));
      }
    }
  } catch (error) {
    errors.push(String(error));
  }
  if (taskStarted) {
    if (errors.length) {
      failOperationTask(taskId, errors);
      alert(t(operation === 'copy' ? 'alert.copyFailed' : 'alert.moveFailed', {
        error: errors.join('\n'),
      }));
    } else if (userCancelled) {
      cancelOperationTask(taskId);
    } else {
      completeOperationTask(taskId);
    }
  }
  return changed ? changedFolders : [];
}

async function handleRhfilesFileDrop(payload, destination, destinationEntries, isRightDrop) {
  const paths = Array.isArray(payload?.paths)
    ? payload.paths.filter(path => typeof path === 'string' && path)
    : [];
  if (!paths.length || !destination || destination === 'home://') return false;

  activatePane(isRightDrop ? 'right' : 'left');
  let operation = 'move';
  if (payload.sourceWindow && payload.sourceWindow !== currentFileDragWindowId()) {
    operation = await showFileDropOperationDialog(paths, destination);
  }
  if (operation === 'cancel') return false;

  try {
    const changedFolders = await performDroppedFileOperation(
      paths,
      destination,
      destinationEntries,
      operation,
    );
    if (!changedFolders.length) return false;
    await navigateTo(getTab().path, false);
    if (G.dualOn) await rpNavigateTo(G.rp.path, false);
    await broadcastFileDropChanges(changedFolders);
    return true;
  } catch (error) {
    alert(t(operation === 'copy' ? 'alert.copyFailed' : 'alert.moveFailed', {error}));
    return false;
  }
}

document.addEventListener('dragover', event => {
  if (!isRhfilesFileDrag(event.dataTransfer)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

document.addEventListener('drop', async event => {
  const payload = readRhfilesFileDragData(event.dataTransfer);
  if (!payload) return;
  event.preventDefault();
  const dropTarget = event.target.closest('.file-list');
  if (!dropTarget) return;
  const isRightDrop = dropTarget.id === 'right-file-list';
  const destinationPane = isRightDrop ? G.rp : getTab();
  const pathRow = event.target.closest('[data-path]');
  const folderRow = pathRow && (pathRow.classList.contains('dir') || pathRow.dataset.isDir === 'true')
    ? pathRow
    : null;
  const destination = folderRow?.dataset.path || destinationPane.path;
  const destinationEntries = folderRow ? [] : destinationPane.entries;
  await handleRhfilesFileDrop(payload, destination, destinationEntries, isRightDrop);
});

// --- ADS streams dialog ---
function showStreamsDialog(path, streams) {
  const dlg = document.createElement("dialog");
  dlg.className = "ads-dialog";
  dlg.style.cssText = "border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--bg-1);color:var(--text-1);max-width:500px;";
  let listHtml = streams.length
    ? streams.map(s => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
        <span style="cursor:pointer;text-decoration:underline" data-stream="${esc(s)}">${esc(s)}</span>
        <button class="dialog-btn danger" data-del="${esc(s)}" style="font-size:11px">${t('btn.delete')}</button>
      </div>`).join("")
    : `<div style='color:var(--text-3);padding:8px'>${t('dialog.streamsEmpty')}</div>`;
  dlg.innerHTML = `<h3 style="margin:0 0 8px;font-size:14px">${t('dialog.streamsTitle')}</h3>
    <div style="font-size:11px;color:var(--text-3);margin-bottom:8px">${esc(path)}</div>
    <div style="max-height:300px;overflow:auto">${listHtml}</div>
    <div style="margin-top:12px;text-align:right">
      <button class="dialog-btn" id="ads-close">${t('btn.close')}</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector("#ads-close").onclick = () => { dlg.close(); dlg.remove(); };
  dlg.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      const stream = btn.dataset.del;
      try {
        await call("delete_ads", { path, stream });
        btn.closest("div[style]").remove();
        showNotice(t('notice.streamDeleted'));
      } catch(e) { alert(t('alert.streamDeleteFailed')); }
    };
  });
  dlg.querySelectorAll("[data-stream]").forEach(el => {
    el.onclick = async () => {
      const stream = el.dataset.stream;
      try {
        const content = await call("read_ads", { path, stream });
        const pre = document.createElement("pre");
        pre.style.cssText = "margin-top:8px;padding:8px;background:var(--bg-2);border-radius:4px;max-height:200px;overflow:auto;white-space:pre-wrap;font-size:12px";
        pre.textContent = content;
        const existing = dlg.querySelector("pre");
        if (existing) existing.remove();
        el.closest("div[style]").after(pre);
      } catch(e) { alert(t('alert.streamReadFailed')); }
    };
  });
  dlg.showModal();
  dlg.onclose = () => dlg.remove();
}

// --- notice toast ---
function showNotice(msg) {
  let toast = document.getElementById("rhfiles-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "rhfiles-toast";
    toast.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:6px;background:var(--bg-2);color:var(--text-1);border:1px solid var(--border);font-size:12px;z-index:99999;transition:opacity 0.3s";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = "1";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = "0"; }, 2000);
}

// --- 7z availability ---
async function check7zAvailable() {
  try { G._7zAvailable = await call("is_7z_available", {}); } catch(e) { G._7zAvailable = false; }
}
check7zAvailable();

// --- compatibility settings dialog ---
function showCompatDialog(path) {
  const modes = [
    { value: "", label: t('dialog.compatNone') },
    { value: "WIN95", label: "Windows 95" },
    { value: "WIN98", label: "Windows 98" },
    { value: "WINXPSP2", label: "Windows XP (SP2)" },
    { value: "WINXPSP3", label: "Windows XP (SP3)" },
    { value: "VISTARTM", label: "Windows Vista" },
    { value: "WIN7RTM", label: "Windows 7" },
    { value: "WIN8RTM", label: "Windows 8" },
  ];
  const dlg = document.createElement("dialog");
  dlg.style.cssText = "border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--bg-1);color:var(--text-1);min-width:320px;";
  dlg.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:14px">${t('dialog.compatTitle')}</h3>
    <div style="font-size:11px;color:var(--text-3);margin-bottom:8px;word-break:break-all;">${esc(path)}</div>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;">${t('dialog.compatMode')}
      <select id="compat-mode" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;">
        ${modes.map(m => `<option value="${m.value}">${esc(m.label)}</option>`).join("")}
      </select>
    </label>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="dialog-btn" id="compat-cancel">${t('btn.cancel')}</button>
      <button class="dialog-btn primary" id="compat-ok">${t('btn.apply')}</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector("#compat-cancel").onclick = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector("#compat-ok").onclick = async () => {
    const mode = dlg.querySelector("#compat-mode").value;
    try {
      await call("set_compat_mode", { path, mode });
      showNotice(mode ? t('notice.compatSet') : t('notice.compatCleared'));
    } catch (e) { alert(t('alert.compatFailed')); }
    dlg.close(); dlg.remove();
  };
  call("get_compat_mode", { path }).then(current => {
    const sel = dlg.querySelector("#compat-mode");
    if (sel && current) sel.value = current;
  }).catch(() => {});
  dlg.showModal();
  dlg.onclose = () => dlg.remove();
}

// --- NTFS permissions dialog ---
async function showPermissionsDialog(path) {
  const dlg = document.createElement("dialog");
  dlg.style.cssText = "border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--bg-1);color:var(--text-1);min-width:420px;";
  dlg.innerHTML = `
    <h3 style="margin:0 0 8px;font-size:14px">${t('dialog.permTitle', {path: esc(path.split(/[\\/]/).pop())})}</h3>
    <div style="font-size:11px;color:var(--text-4);margin-bottom:8px;word-break:break-all;">${esc(path)}</div>
    <div id="perm-dialog-content" aria-live="polite">
      <div style="padding:20px 8px;text-align:center;color:var(--text-3);">${t('dialog.permLoading')}</div>
      <div style="text-align:right;"><button class="dialog-btn" id="perm-close">${t('btn.close')}</button></div>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector("#perm-close").onclick = () => dlg.close();
  dlg.showModal();
  dlg.onclose = () => dlg.remove();

  try {
    const perms = await call("get_permissions", { path });
    if (!dlg.isConnected) return;
    let rows = perms.map(p => `
      <tr>
        <td style="padding:4px 8px;font-size:12px;color:var(--text-2)">${esc(p.account)}</td>
        <td style="padding:4px 8px;font-size:12px;color:var(--text-3)">${esc(p.display)}</td>
        <td style="padding:4px 8px;"><button class="dialog-btn" style="font-size:11px;padding:2px 8px;" data-remove-account="${esc(p.account)}">${t('btn.remove')}</button></td>
      </tr>
    `).join("");

    const content = dlg.querySelector("#perm-dialog-content");
    content.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid var(--border);">
          <th style="text-align:left;padding:4px 8px;font-size:11px;color:var(--text-4);">${t('dialog.permAccount')}</th>
          <th style="text-align:left;padding:4px 8px;font-size:11px;color:var(--text-4);">${t('dialog.permAccess')}</th>
          <th style="width:80px;"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;">
        <input type="text" id="perm-account" placeholder="${t('dialog.permPlaceholder')}" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:12px;">
        <select id="perm-level" style="padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:12px;">
          <option value="F">${t('dialog.permFullControl')}</option>
          <option value="M">${t('dialog.permModify')}</option>
          <option value="RX">${t('dialog.permReadExec')}</option>
          <option value="R">${t('dialog.permRead')}</option>
          <option value="W">${t('dialog.permWrite')}</option>
        </select>
        <button class="dialog-btn primary" id="perm-add" style="font-size:12px;">${t('btn.add')}</button>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="dialog-btn" id="perm-close">${t('btn.close')}</button>
        <button class="dialog-btn" id="perm-inherit-toggle">${t('dialog.permDisableInherit')}</button>
      </div>`;

    dlg.querySelector("#perm-close").onclick = () => dlg.close();
    dlg.querySelector("#perm-add").onclick = async () => {
      const account = dlg.querySelector("#perm-account").value.trim();
      const level = dlg.querySelector("#perm-level").value;
      if (!account) return;
      try {
        await call("set_permission", { path, account, permission: level });
        showNotice(t('notice.permAdded'));
        dlg.close(); dlg.remove();
        showPermissionsDialog(path);
      } catch (e) { alert(t('alert.permFailed')); }
    };
    dlg.querySelectorAll("[data-remove-account]").forEach(btn => {
      btn.onclick = async () => {
        try {
          await call("remove_permission", { path, account: btn.dataset.removeAccount });
          showNotice(t('notice.permRemoved'));
          dlg.close(); dlg.remove();
          showPermissionsDialog(path);
        } catch (e) { alert(t('alert.permRemoveFailed')); }
      };
    });
    dlg.querySelector("#perm-inherit-toggle").onclick = async () => {
      try {
        await call("inherit_permissions", { path, enable: false });
        showNotice(t('notice.inheritDisabled'));
        dlg.close(); dlg.remove();
        showPermissionsDialog(path);
      } catch (e) { alert(t('alert.inheritFailed')); }
    };

  } catch (e) {
    if (!dlg.isConnected) return;
    const content = dlg.querySelector("#perm-dialog-content");
    const errorText = String(e);
    const errorMessage = errorText.includes('timed out')
      ? t('dialog.permTimedOut')
      : t('dialog.permLoadFailed', {error: errorText});
    content.innerHTML = `
      <div style="padding:16px 8px;color:var(--danger,#d13438);word-break:break-word;">${esc(errorMessage)}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="dialog-btn" id="perm-close">${t('btn.close')}</button>
        <button class="dialog-btn primary" id="perm-retry">${t('btn.retry')}</button>
      </div>`;
    content.querySelector("#perm-close").onclick = () => dlg.close();
    content.querySelector("#perm-retry").onclick = () => {
      dlg.close();
      showPermissionsDialog(path);
    };
  }
}
