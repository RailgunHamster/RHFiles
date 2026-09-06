// ops.js — file operations + context menu

function resolveRightPane(isRight) {
  return typeof isRight === 'boolean' ? isRight : (G.dualOn && G.lastActivePane === 'right');
}

function isCloudPath(isRight) {
  const path = isRight ? G.rp.path : getTab().path;
  const pl = path.toLowerCase();
  return pl.includes("onedrive") || pl.includes("google drive") || pl.includes("my drive") || pl.includes("dropbox");
}

// --- progress tracking ---
let currentOperationCancelled = false;

function setupProgressListener() {
  if (window.__TAURI_INTERNALS__) {
    const { listen } = window.__TAURI_INTERNALS__.event || {};
    if (listen) {
      listen("op-progress", (event) => {
        if (event.payload && event.payload.status === "progress") {
          updateProgress(event.payload);
        } else if (event.payload && event.payload.status === "complete") {
          hideProgress();
        }
      });
      listen("update-progress", (event) => {
        if (!event.payload) return;
        updateProgress({
          percentage: Math.max(0, Math.min(100, Number(event.payload.percentage) || 0)),
          speed: 0,
          totalBytes: 0,
          bytesTransferred: 0,
        });
      });
    }
  }
}

function showProgress(title, options = {}) {
  const { indeterminate = false, cancellable = true } = options;
  document.getElementById("progress-overlay").style.display = "block";
  document.getElementById("progress-title").textContent = title;
  const bar = document.getElementById("progress-bar");
  bar.classList.toggle("indeterminate", indeterminate);
  bar.style.width = indeterminate ? "35%" : "0%";
  document.getElementById("progress-percent").textContent = indeterminate ? "\u2026" : "0%";
  document.getElementById("progress-speed").textContent = "";
  document.getElementById("progress-bytes").textContent = "";
  document.getElementById("progress-cancel").style.display = cancellable ? "" : "none";
  currentOperationCancelled = false;
}

function updateProgress(data) {
  const bar = document.getElementById("progress-bar");
  bar.classList.remove("indeterminate");
  bar.style.width = data.percentage + "%";
  document.getElementById("progress-percent").textContent = data.percentage + "%";
  document.getElementById("progress-speed").textContent = data.speed > 0 ? fmtSize(data.speed) + "/s" : "";
  document.getElementById("progress-bytes").textContent = data.totalBytes > 0
    ? fmtSize(data.bytesTransferred) + " / " + fmtSize(data.totalBytes)
    : "";
}

function hideProgress() {
  document.getElementById("progress-overlay").style.display = "none";
  document.getElementById("progress-bar").classList.remove("indeterminate");
  document.getElementById("progress-cancel").style.display = "";
}

function cancelOperation() {
  currentOperationCancelled = true;
  call("cancel_operation", {});
  hideProgress();
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
async function deleteSelected(isRight) {
  isRight = resolveRightPane(isRight);
  const sel = getSelectedPaths(isRight);
  if (!sel.length) return;
  const message = sel.length === 1
    ? t('confirm.deleteItem', {name: sel[0].name})
    : t('confirm.deleteItems', {count: sel.length});
  const confirmed = await showConfirmDialog({
    title: t('confirm.deleteTitle'),
    message,
    detail: t('confirm.recycleBinHint'),
    confirmLabel: t('btn.delete'),
  });
  if (!confirmed) return;
  showProgress(t('status.deleting'), { indeterminate: true, cancellable: false });
  try {
    const deletedPaths = sel.map(f => f.path);
    const outcome = await call("delete_files", { paths: deletedPaths });
    const actuallyDeleted = Array.isArray(outcome?.deleted) ? outcome.deleted : deletedPaths;
    if (actuallyDeleted.length) trackDelete(actuallyDeleted);
    await refresh();
    if (outcome?.errors?.length) {
      alert(t('alert.deleteFailed', {error: outcome.errors.join('\n')}));
    }
  } catch (e) {
    alert(t('alert.deleteFailed', {error: e}));
  } finally {
    hideProgress();
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
  G.clipboard = { op: "copy", paths: new Set(sel.map(f => f.path)) };
  if (isRight) renderFiles(G.rp, "right-file-list", "right-status-count", null, true);
  else renderFiles(getTab(), "file-list", "status-count", "status-selection");
}

async function cutSelected(isRight) {
  isRight = resolveRightPane(isRight);
  const sel = getSelectedPaths(isRight);
  if (!sel.length) return;
  G.clipboard = { op: "cut", paths: new Set(sel.map(f => f.path)) };
  if (isRight) renderFiles(G.rp, "right-file-list", "right-status-count", null, true);
  else renderFiles(getTab(), "file-list", "status-count", "status-selection");
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

async function paste(isRight) {
  isRight = resolveRightPane(isRight);
  if (!G.clipboard) return;
  const destTab = isRight ? G.rp : getTab();
  const destPath = destTab.path;
  const destEntries = destTab.entries || [];
  const existingNames = new Set(destEntries.map(entry => fileNameKey(entry.name)));
  let applyAllAction = null;
  try {
    const clipboard = G.clipboard;
    for (const srcPath of [...clipboard.paths]) {
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
      if (action === 'cancel') break;
      if (action === 'skip') continue;
      const targetName = action === 'rename'
        ? generateUniqueName(destPath, srcName, existingNames)
        : srcName;
      const targetPath = joinFolderPath(destPath, targetName);
      const overwrites = conflict && action === 'replace';
      const keepsBoth = action === 'rename';
      if (clipboard.op === "cut") {
        showProgress(t('status.moving'), { indeterminate: keepsBoth });
        if (keepsBoth) await call("move_path_exact", { src: srcPath, dest: targetPath });
        else await call("move_with_progress", { src: srcPath, dest: destPath, overwrite:overwrites });
        if (!overwrites) trackMove(srcPath, targetPath);
        clipboard.paths.delete(srcPath);
      } else {
        showProgress(t('status.copying'), { indeterminate: keepsBoth });
        if (keepsBoth) await call("copy_path_exact", { src: srcPath, dest: targetPath });
        else await call("copy_with_progress", { src: srcPath, dest: destPath, overwrite:overwrites });
        if (!overwrites) trackCopy(srcPath, targetPath);
      }
      hideProgress();
      existingNames.add(fileNameKey(targetName));
    }
    if (G.clipboard?.op === "cut" && !G.clipboard.paths.size) G.clipboard = null;
    await refresh();
  } catch (e) { hideProgress(); alert(t('alert.pasteFailed', { error: e })); }
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
  showProgress(t('status.extracting', { name: file.name }));
  try {
    const ext = (file.extension || '').toLowerCase();
    if (ext === 'zip') {
      await call('extract_archive', { path: file.path, dest: destination, entryPath: null });
    } else {
      await call('extract_7z', { archive: file.path, dest: destination });
    }
    await refresh();
  } catch (e) {
    if (!/cancel/i.test(String(e))) alert(t('alert.extractFailed', { error: e }));
  } finally {
    hideProgress();
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
  showProgress(t('status.compressing', { name: request.baseName }), { indeterminate: true, cancellable: false });
  try {
    await call(request.command, request.args);
    await refresh();
  } catch (e) {
    alert(t('alert.compressFailed', { error: e }));
  } finally {
    hideProgress();
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

async function copyPathFromMenu(path) {
  try {
    await call('copy_file_path', { path });
    showNotice(t('notice.pathCopied'));
  } catch (e) {
    alert(t('alert.copyPathFailed', { error: e }));
  }
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
      mi.innerHTML = `<span>${esc(item.label)}</span><span class="ctx-arrow">\u25B6</span>`;
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
      mi.innerHTML = `<span>${esc(item.label)}</span>${item.shortcut ? `<span class="ctx-shortcut">${item.shortcut}</span>` : ""}`;
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
  const isExe = ext === "exe" || ext === "msi";
  const isFont = ["ttf","otf","fon"].includes(ext);
  const isCert = ["cer","crt","p7b","pfx","p12"].includes(ext);
  const currentPath = isRight ? G.rp.path : getTab().path;
  const extractFolder = singleFile ? archiveFolderName(singleFile.name) : '';
  const openTarget = singleSelection ? sel[0].path : currentPath;

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${x}px;top:${y}px;z-index:9999;`;

  const openWithSubmenu = [
    { label: "VS Code", action: () => openWithProgramFromMenu(openTarget, "vscode", "VS Code") },
    { label: "Visual Studio", action: () => openWithProgramFromMenu(openTarget, "visual_studio", "Visual Studio") },
    { label: "-" },
    { label: "CMD", action: () => openWithProgramFromMenu(openTarget, "cmd", "CMD") },
    { label: "PowerShell", action: () => openWithProgramFromMenu(openTarget, "powershell", "PowerShell") },
    { label: "Git Bash", action: () => openWithProgramFromMenu(openTarget, "git_bash", "Git Bash") },
  ];
  if (isMedia) openWithSubmenu.push({ label: "VLC", action: () => openWithProgramFromMenu(sel[0].path, "vlc", "VLC") });
  if (isMedia) openWithSubmenu.push({ label: "PotPlayer", action: () => openWithProgramFromMenu(sel[0].path, "potplayer", "PotPlayer") });
  if (isDir) openWithSubmenu.push({ label: t('ctx.playFolderWithVlc'), action: () => openWithProgramFromMenu(sel[0].path, "vlc_folder", "VLC") });
  if (isMedia || isDir) openWithSubmenu.push({ label: "-" });
  openWithSubmenu.push({ label: t('ctx.openWithDialog'), action: () => runContextCommand("show_open_with_dialog", { path: openTarget }, t('ctx.openWithDialog')) });
  if (isDir) openWithSubmenu.push({ label: t('ctx.newWindow'), action: () => call("open_new_window", { initial_path: sel[0].path }) });

  const items = [
    { label: t('ctx.open'), shortcut:"Enter", action: () => { if (singleSelection) { if (sel[0].is_dir) { if (isRight) rpNavigateTo(sel[0].path); else navigateTo(sel[0].path); } else openFileHandler(sel[0].path); } }, disabled: !singleSelection },
    { label: t('ctx.preview'), shortcut:"Space", action: () => previewSelected(isRight), disabled: !singleSelection },
    { label: t('ctx.newTab'), action: () => addTab(singleDir.path), hidden: !singleDir },
    { label: t('ctx.openWith'), submenu: openWithSubmenu, disabled: !singleSelection },
    { label: isFavoriteFolder(singleDir?.path) ? t('favorites.remove') : t('favorites.add'), action: () => toggleFavoriteFolder(singleDir.path, singleDir.name), hidden: !singleDir },
    { label: "-", action: null },
    { label: t('ctx.cut'), shortcut:"Ctrl+X", action: () => cutSelected(isRight), disabled: !hasSelection },
    { label: t('ctx.copy'), shortcut:"Ctrl+C", action: () => copySelected(isRight), disabled: !hasSelection },
    { label: t('ctx.paste'), shortcut:"Ctrl+V", action: () => paste(isRight), disabled: !G.clipboard },
    { label: "-", action: null },
    { label: t('ctx.rename'), shortcut:"F2", action: () => renamePrompt(isRight), disabled: !singleSelection },
    { label: t('ctx.batchRename'), action: () => openBatchRename(isRight), hidden: sel.length < 2 },
    { label: t('ctx.delete'), shortcut:"Del", action: () => deleteSelected(isRight), disabled: !hasSelection },
    { label: t('ctx.addTag'), action: () => openTagDialog(isRight), disabled: !hasSelection },
    { label: "-", action: null },
    { label: t('ctx.copyPath'), shortcut:"Ctrl+Shift+C", action: () => { if (singleSelection) copyPathFromMenu(sel[0].path); }, disabled: !singleSelection },
    { label: t('search.openLocation'), action: () => {
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
    { label: t('ctx.share'), submenu: [
      { label: t('ctx.shareQQ'), action: () => { if (singleSelection) runContextCommand("share_file", { path: sel[0].path, target: "qq" }, t('ctx.shareQQ')); } },
      { label: t('ctx.shareWechat'), action: () => { if (singleSelection) runContextCommand("share_file", { path: sel[0].path, target: "wechat" }, t('ctx.shareWechat')); } },
      { label: t('ctx.shareFeishu'), action: () => { if (singleSelection) runContextCommand("share_file", { path: sel[0].path, target: "feishu" }, t('ctx.shareFeishu')); } },
      { label: "-" },
      { label: t('ctx.windowsShare'), action: () => { if (singleSelection) runContextCommand("share_file", { path: sel[0].path, target: "windows" }, t('ctx.windowsShare')); } },
    ], disabled: !singleSelection },
    { label: t('ctx.compress'), submenu: [
      { label: "ZIP", action: () => compressSelection(sel, currentPath, "zip") },
      { label: "7-Zip (.7z)", action: () => compressSelection(sel, currentPath, "7zip") },
      { label: "Bandizip", action: () => compressSelection(sel, currentPath, "bandizip") },
      { label: "WinRAR (.rar)", action: () => compressSelection(sel, currentPath, "winrar") },
    ], disabled: !hasSelection },
    { label: "-", action: null },
    { label: t('ctx.newFile'), shortcut:"Ctrl+Shift+N", action: () => showNewFileDialog(isRight) },
    { label: t('ctx.newFolder'), shortcut:"F7", action: () => newFolder(isRight) },
    { label: "-", action: null, hidden: !singleSelection },
    { label: t('ctx.setWallpaper'), action: () => runContextCommand("set_wallpaper", { path: sel[0].path }, t('ctx.setWallpaper')), disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: t('ctx.rotateLeft'), action: () => runContextCommand("rotate_image", { path: sel[0].path, degrees: -90 }, t('ctx.rotateLeft'), { refreshAfter: true }), disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: t('ctx.rotateRight'), action: () => runContextCommand("rotate_image", { path: sel[0].path, degrees: 90 }, t('ctx.rotateRight'), { refreshAfter: true }), disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: "-", action: null, hidden: !singleFile || !isImage },
    { label: t('ctx.extractHere'), action: () => extractArchiveTo(singleFile, currentPath), disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: t('ctx.extractTo', {name: extractFolder}), action: () => extractArchiveTo(singleFile, joinFolderPath(currentPath, extractFolder)), disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: "-", action: null, hidden: !singleFile || !isArchive },
    { label: t('ctx.runAsAdmin'), action: () => runContextCommand("run_as_admin", { path: sel[0].path }, t('ctx.runAsAdmin')), disabled: !singleFile || !isExe, hidden: !singleFile || !isExe },
    { label: t('ctx.installCert'), action: () => runContextCommand("install_certificate", { path: sel[0].path }, t('ctx.installCert'), { successMessage: t('notice.certInstalled') }), disabled: !singleFile || !isCert, hidden: !singleFile || !isCert },
    { label: t('ctx.installFont'), action: () => runContextCommand("install_font", { path: sel[0].path }, t('ctx.installFont'), { successMessage: t('notice.fontInstalled') }), disabled: !singleFile || !isFont, hidden: !singleFile || !isFont },
    { label: "-", action: null, hidden: !singleSelection },
    { label: t('ctx.properties'), shortcut:"Alt+Enter", action: () => { if (singleSelection) showPropertiesDialog(sel[0].path); }, disabled: !singleSelection },
    { label: t('ctx.permissions'), action: () => { if (singleSelection) showPermissionsDialog(sel[0].path); }, disabled: !singleSelection },
  ];

  renderMenuItems(menu, items, x, y);

  document.body.appendChild(menu);
  _ctxShow(menu);

  let ctxMeta = { x, y, isRight, singleSelection, sel, singleFile, isDir, items };

  menu.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); removeContextMenu(); return; }
    if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      const s = getSelectedPaths(ctxMeta.isRight);
      if (s.length) {
        removeContextMenu();
        showPropertiesDialog(s[0].path);
      }
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      const s2 = getSelectedPaths(ctxMeta.isRight);
      if (s2.length) { removeContextMenu(); deleteSelected(ctxMeta.isRight); }
      return;
    }
    if (e.key === "F2") {
      e.preventDefault();
      const s3 = getSelectedPaths(ctxMeta.isRight);
      if (s3.length === 1) { removeContextMenu(); renamePrompt(ctxMeta.isRight); }
      return;
    }
    if (e.key === "Enter" && !e.altKey) {
      e.preventDefault();
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
  showMenuAt(x, y, [
    { label: t('tab.close'), shortcut: 'Ctrl+W', action: () => closeTab(tabId, isRight), disabled: tabs.length <= 1 },
    { label: t('tab.closeOthers'), action: () => closeOtherTabs(tabId, isRight), disabled: tabs.length <= 1 },
    { label: t('tab.closeRight'), action: () => closeTabsToRight(tabId, isRight), disabled: index < 0 || index === tabs.length - 1 },
    { label: '-' },
    { label: t('ctx.copyPath'), action: () => copyPathFromMenu(folderPath), disabled: folderPath === 'home://' },
    { label: t('ctx.openCmd'), action: () => runContextCommand('open_terminal', {path: folderPath, terminal: 'cmd'}, 'CMD'), disabled: folderPath === 'home://' },
    { label: t('ctx.openPowerShell'), action: () => runContextCommand('open_terminal', {path: folderPath, terminal: 'powershell'}, 'PowerShell'), disabled: folderPath === 'home://' },
    { label: '-' },
    { label: t('cmd.refresh'), shortcut: 'F5', action: () => { if (isRight) switchRightTab(tabId); else if (G.activeTab !== tabId) switchTab(tabId); refresh(); } },
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
    { label: t('ctx.cut'), shortcut: 'Ctrl+X', disabled: !editable || !selected, action: async () => { if (await writeTextClipboard(selected)) replaceInputSelection(input, ''); } },
    { label: t('ctx.copy'), shortcut: 'Ctrl+C', disabled: !selected, action: () => writeTextClipboard(selected) },
    { label: t('ctx.paste'), shortcut: 'Ctrl+V', disabled: !editable, action: async () => { try { replaceInputSelection(input, await navigator.clipboard.readText()); } catch (e) {} } },
    { label: t('ctx.selectAll'), shortcut: 'Ctrl+A', disabled: !input.value, action: () => { input.focus(); input.select(); } },
    { label: t('search.clear'), disabled: !editable || !input.value, action: () => { input.value = ''; input.dispatchEvent(new Event('input', {bubbles: true})); } },
  ];
  if (options && options.search) {
    const folderName = getSearchFolderPath()?.split('\\').filter(Boolean).pop() || t('nav.home');
    items.push({label: '-'});
    items.push({ label: (_searchScope === 'folder' ? '\u2713 ' : '') + t('search.scopeFolder', {folder: folderName}), action: () => setSearchScope('folder') });
    items.push({ label: (_searchScope === 'global' ? '\u2713 ' : '') + t('search.scopeGlobal'), shortcut: 'Ctrl+Shift+F', disabled: G.settings.globalSearchEnabled === false, action: () => setSearchScope('global') });
  }
  showMenuAt(x, y, items, 'input-context-menu');
}

function showPathContextMenu(x, y, path, isDir, isRight) {
  if (!path || path === 'home://') {
    showMenuAt(x, y, [
      { label: t('cmd.refresh'), shortcut: 'F5', action: refresh },
      { label: t('cmd.newTab'), shortcut: 'Ctrl+T', action: () => addTab('home://') },
      { label: t('cmd.settings'), shortcut: 'Ctrl+,', action: openSettings },
    ]);
    return;
  }
  const terminalPath = isDir ? path : parentFolderPath(path);
  const openAction = () => {
    if (isDir) { if (isRight) rpNavigateTo(path); else navigateTo(path); }
    else openFileHandler(path);
  };
  const items = [
    { label: t('ctx.open'), action: openAction },
    { label: t('ctx.newTab'), action: () => addTab(path, isRight), hidden: !isDir },
    { label: '-' },
    { label: t('ctx.copyPath'), action: () => copyPathFromMenu(path) },
    { label: t('ctx.openCmd'), action: () => runContextCommand('open_terminal', {path: terminalPath, terminal: 'cmd'}, 'CMD') },
    { label: t('ctx.openPowerShell'), action: () => runContextCommand('open_terminal', {path: terminalPath, terminal: 'powershell'}, 'PowerShell') },
    { label: t('diskUsage.analyze'), hidden: !isDir, action: () => showDiskUsageDialog(path) },
    { label: isFavoriteFolder(path) ? t('favorites.remove') : t('favorites.add'), hidden: !isDir, action: () => toggleFavoriteFolder(path, favoriteDisplayName(path)) },
    { label: '-' },
    { label: t('ctx.properties'), action: () => showPropertiesDialog(path) },
  ];
  showMenuAt(x, y, items, 'path-context-menu');
}

function showBlankListContextMenu(x, y, isRight) {
  G.lastActivePane = isRight ? 'right' : 'left';
  if (typeof updatePaneFocusUI === 'function') updatePaneFocusUI();
  const path = isRight ? G.rp.path : getTab().path;
  showMenuAt(x, y, [
    { label: t('ctx.newFolder'), shortcut: 'F7', action: () => newFolder(isRight) },
    { label: t('ctx.newFile'), shortcut: 'Ctrl+Shift+N', action: () => showNewFileDialog(isRight) },
    { label: '-' },
    { label: t('ctx.paste'), shortcut: 'Ctrl+V', action: () => paste(isRight), disabled: !G.clipboard },
    { label: t('cmd.refresh'), shortcut: 'F5', action: refresh },
    { label: t('ctx.selectAll'), shortcut: 'Ctrl+A', action: () => selectAll(isRight) },
    { label: '-' },
    { label: t('ctx.copyPath'), action: () => copyPathFromMenu(path) },
    { label: t('ctx.openCmd'), action: () => runContextCommand('open_terminal', {path, terminal: 'cmd'}, 'CMD') },
    { label: t('ctx.openPowerShell'), action: () => runContextCommand('open_terminal', {path, terminal: 'powershell'}, 'PowerShell') },
    { label: t('diskUsage.analyze'), action: () => showDiskUsageDialog(path) },
    { label: isFavoriteFolder(path) ? t('favorites.removeCurrent') : t('favorites.addCurrent'), action: () => toggleFavoriteFolder(path, favoriteDisplayName(path)) },
    { label: t('ctx.properties'), action: () => showPropertiesDialog(path) },
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
    else showMenuAt(event.clientX, event.clientY, [{label: t('cmd.refresh'), action: refresh}, {label: t('cmd.settings'), action: openSettings}]);
    return;
  }
  event.stopPropagation();
  showMenuAt(event.clientX, event.clientY, [
    { label: t('cmd.refresh'), shortcut: 'F5', action: refresh },
    { label: t('cmd.newTab'), shortcut: 'Ctrl+T', action: () => addTab(getTab().path) },
    { label: t('cmd.settings'), shortcut: 'Ctrl+,', action: openSettings },
  ], 'app-context-menu');
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && contextMenu) removeContextMenu();
});
document.addEventListener("contextmenu", e => {
  if (contextMenu && !contextMenu.contains(e.target)) removeContextMenu();
});

// --- drag & drop ---
document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", async e => {
  e.preventDefault();
  try {
    const data = e.dataTransfer.getData("text/plain");
    if (data) {
      const paths = JSON.parse(data);
      const dropTarget = e.target.closest('.file-list');
      const isRightDrop = dropTarget && dropTarget.id === 'right-file-list';
      const dest = isRightDrop ? G.rp.path : getTab().path;
      const destinationPane = isRightDrop ? G.rp : getTab();
      const existingNames = new Set((destinationPane.entries || []).map(entry => fileNameKey(entry.name)));
      let applyAllAction = null;
      activatePane(isRightDrop ? 'right' : 'left');
      for (const src of paths) {
        const sourceName = String(src).split(/[\\/]/).pop();
        const originalTarget = joinFolderPath(dest, sourceName);
        if (windowsPathKey(src) === windowsPathKey(originalTarget)) continue;

        const conflict = existingNames.has(fileNameKey(sourceName)) || await call('path_exists', { path:originalTarget });
        let action = 'move';
        if (conflict) {
          if (applyAllAction) {
            action = applyAllAction;
          } else {
            action = await new Promise(resolve => {
              showConflictDialog(sourceName, sourceName, src, originalTarget, (choice, applyAll) => {
                if (applyAll) applyAllAction = choice;
                resolve(choice);
              });
            });
          }
        }
        if (action === 'cancel') break;
        if (action === 'skip') continue;

        const targetName = action === 'rename'
          ? generateUniqueName(dest, sourceName, existingNames)
          : sourceName;
        const targetPath = joinFolderPath(dest, targetName);
        const overwrites = conflict && action === 'replace';
        const keepsBoth = action === 'rename';
        showProgress(t('status.moving'), { indeterminate: keepsBoth });
        if (keepsBoth) await call("move_path_exact", { src, dest: targetPath });
        else await call("move_with_progress", { src, dest, overwrite:overwrites });
        hideProgress();
        if (!overwrites) trackMove(src, targetPath);
        existingNames.add(fileNameKey(targetName));
      }
      // A cross-pane move changes both directories. Refresh both sides so the
      // source does not retain a stale item and the destination appears at once.
      await navigateTo(getTab().path, false);
      if (G.dualOn) await rpNavigateTo(G.rp.path, false);
    }
  } catch (ex) {
    hideProgress();
    alert(t('alert.moveFailed', { error: ex }));
  }
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
