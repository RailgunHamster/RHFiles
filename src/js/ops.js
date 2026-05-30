// ops.js — file operations + context menu

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
    }
  }
}

function showProgress(title) {
  document.getElementById("progress-overlay").style.display = "block";
  document.getElementById("progress-title").textContent = title;
  document.getElementById("progress-bar").style.width = "0%";
  document.getElementById("progress-percent").textContent = "0%";
  document.getElementById("progress-speed").textContent = "";
  document.getElementById("progress-bytes").textContent = "";
  currentOperationCancelled = false;
}

function updateProgress(data) {
  document.getElementById("progress-bar").style.width = data.percentage + "%";
  document.getElementById("progress-percent").textContent = data.percentage + "%";
  document.getElementById("progress-speed").textContent = fmtSize(data.speed) + "/s";
  document.getElementById("progress-bytes").textContent = fmtSize(data.bytesTransferred) + " / " + fmtSize(data.totalBytes);
}

function hideProgress() {
  document.getElementById("progress-overlay").style.display = "none";
}

function cancelOperation() {
  currentOperationCancelled = true;
  call("cancel_operation", {});
  hideProgress();
}

// --- file ops ---
async function deleteSelected(isRight) {
  const sel = getSelectedPaths(isRight);
  if (!sel.length) return;
  try {
    await call("delete_files", { paths: sel.map(f => f.path) });
    await refresh();
  } catch (e) { alert(t('alert.deleteFailed', {error: e})); }
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
  const destPath = isRight ? G.rp.path : getTab().path;
  try {
    await call("new_folder", { parent: destPath });
    await refresh();
    _findAndRename(isRight, destPath, "New Folder");
  } catch (e) { alert(t('alert.newFolderFailed')); }
}

async function copySelected(isRight) {
  const sel = getSelectedPaths(isRight);
  if (!sel.length) return;
  G.clipboard = { op: "copy", paths: new Set(sel.map(f => f.path)) };
  if (isRight) renderFiles(G.rp, "right-file-list", "right-status-count", null, true);
  else renderFiles(getTab(), "file-list", "status-count", "status-selection");
}

async function cutSelected(isRight) {
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
  if (!G.clipboard) return;
  const destTab = isRight ? G.rp : getTab();
  const destPath = destTab.path;
  const destEntries = destTab.entries || [];
  let applyAllAction = null;
  try {
    for (const srcPath of G.clipboard.paths) {
      const srcName = srcPath.split("\\").pop();
      const destFullPath = destPath + "\\" + srcName;
      const conflict = destEntries.find(e => e.name === srcName);
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
      if (action === 'rename') {
        await call("rename_file", { path: destFullPath, newName: generateUniqueName(destPath, srcName) });
      }
      if (G.clipboard.op === "cut") {
        showProgress(t('status.moving'));
        await call("move_with_progress", { src: srcPath, dest: destPath });
        hideProgress();
        trackMove(srcPath, destFullPath);
      } else {
        showProgress(t('status.copying'));
        await call("copy_with_progress", { src: srcPath, dest: destPath });
        hideProgress();
        trackCopy(srcPath, destFullPath);
      }
    }
    if (G.clipboard.op === "cut") G.clipboard = null;
    await refresh();
  } catch (e) { hideProgress(); alert(t('alert.pasteFailed')); }
}

async function openFileHandler(path) {
  try { await call("open_file", { path }); } catch (e) {}
}

async function quicklookSelected(isRight) {
  const sel = getSelectedPaths(isRight);
  if (sel.length === 1) {
    try { await call("quicklook", { path: sel[0].path }); } catch (e) {}
  }
}

async function showPropertiesDialog(path) {
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
    <div class="props-row"><span class="props-label">${t('properties.modified')}</span><span class="props-value">${esc(info.modified)}</span></div>
    <div class="props-row"><span class="props-label">${t('properties.created')}</span><span class="props-value">${esc(info.created)}</span></div>
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
  let lastWasSep = false;
  items.forEach(item => {
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
        if (rect.right + 200 > window.innerWidth) {
          sub.style.left = "auto";
          sub.style.right = "100%";
        }
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

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${x}px;top:${y}px;z-index:9999;`;

  const openWithSubmenu = [
    { label: "VS Code", action: () => call("open_with_program", { path: singleSelection ? sel[0].path : currentPath, program: "vscode" }) },
    { label: "Visual Studio", action: () => call("open_with_program", { path: singleSelection ? sel[0].path : currentPath, program: "visual_studio" }) },
    { label: "-" },
    { label: "CMD", action: () => call("open_with_program", { path: singleSelection ? sel[0].path : currentPath, program: "cmd" }) },
    { label: "PowerShell", action: () => call("open_with_program", { path: singleSelection ? sel[0].path : currentPath, program: "powershell" }) },
    { label: "Git Bash", action: () => call("open_with_program", { path: singleSelection ? sel[0].path : currentPath, program: "git_bash" }) },
  ];
  if (isMedia) openWithSubmenu.push({ label: "VLC", action: () => call("open_with_program", { path: sel[0].path, program: "vlc" }) });
  if (isMedia) openWithSubmenu.push({ label: "PotPlayer", action: () => call("open_with_program", { path: sel[0].path, program: "potplayer" }) });
  if (isDir) openWithSubmenu.push({ label: "VLC (folder)", action: () => call("open_with_program", { path: sel[0].path, program: "vlc_folder" }) });
  if (isMedia || isDir) openWithSubmenu.push({ label: "-" });
  openWithSubmenu.push({ label: t('ctx.openWithDialog'), action: () => call("show_open_with_dialog", { path: singleSelection ? sel[0].path : currentPath }) });
  if (isDir) {
    openWithSubmenu.push({ label: t('ctx.newWindow'), action: () => call("open_new_window", { initial_path: sel[0].path }) });
    openWithSubmenu.push({ label: t('ctx.newTab'), action: () => addTab(sel[0].path) });
  }

  const items = [
    { label: t('ctx.open'), shortcut:"Enter", action: () => { if (singleSelection) { if (sel[0].is_dir) { if (isRight) rpNavigateTo(sel[0].path); else navigateTo(sel[0].path); } else openFileHandler(sel[0].path); } }, disabled: !singleSelection },
    { label: t('ctx.openWith'), submenu: openWithSubmenu, disabled: !singleSelection },
    { label: "-", action: null },
    { label: t('ctx.cut'), shortcut:"Ctrl+X", action: () => cutSelected(isRight), disabled: !hasSelection },
    { label: t('ctx.copy'), shortcut:"Ctrl+C", action: () => copySelected(isRight), disabled: !hasSelection },
    { label: t('ctx.paste'), shortcut:"Ctrl+V", action: () => paste(isRight), disabled: !G.clipboard },
    { label: "-", action: null },
    { label: t('ctx.rename'), shortcut:"F2", action: () => renamePrompt(isRight), disabled: !singleSelection },
    { label: t('ctx.delete'), shortcut:"Del", action: () => deleteSelected(isRight), disabled: !hasSelection },
    { label: "-", action: null },
    { label: t('ctx.copyPath'), shortcut:"Ctrl+Shift+C", action: () => { if (singleSelection) call("copy_file_path", { path: sel[0].path }); } , disabled: !singleSelection },
    { label: t('ctx.share'), submenu: [
      { label: "QQ", action: () => { if (singleSelection) call("share_file", { path: sel[0].path, target: "qq" }); } },
      { label: "\u5FAE\u4FE1", action: () => { if (singleSelection) call("share_file", { path: sel[0].path, target: "wechat" }); } },
      { label: "\u98DE\u4E66", action: () => { if (singleSelection) call("share_file", { path: sel[0].path, target: "feishu" }); } },
      { label: "-" },
      { label: t('ctx.windowsShare'), action: () => { if (singleSelection) call("share_file", { path: sel[0].path, target: "windows" }); } },
    ], disabled: !singleSelection },
    { label: t('ctx.compress'), submenu: [
      { label: "ZIP", action: async () => { const paths = sel.map(f => f.path); try { await call("create_archive", { paths, dest: currentPath + "\\" + (singleSelection ? sel[0].name : "archive") + ".zip" }); await refresh(); } catch(e) { alert(t('alert.compressFailed')); } } },
      { label: "7-Zip (.7z)", action: async () => { const paths = sel.map(f => f.path); try { await call("compress_with", { sources: paths, dest: currentPath + "\\" + (singleSelection ? sel[0].name : "archive") + ".7z", tool: "7zip" }); await refresh(); } catch(e) { alert(t('alert.compressFailed')); } } },
      { label: "Bandizip", action: async () => { const paths = sel.map(f => f.path); try { await call("compress_with", { sources: paths, dest: currentPath + "\\" + (singleSelection ? sel[0].name : "archive") + ".zip", tool: "bandizip" }); await refresh(); } catch(e) { alert(t('alert.compressFailed')); } } },
      { label: "WinRAR (.rar)", action: async () => { const paths = sel.map(f => f.path); try { await call("compress_with", { sources: paths, dest: currentPath + "\\" + (singleSelection ? sel[0].name : "archive") + ".rar", tool: "winrar" }); await refresh(); } catch(e) { alert(t('alert.compressFailed')); } } },
    ], disabled: !hasSelection },
    { label: "-", action: null },
    { label: t('ctx.newFile'), shortcut:"Ctrl+Shift+N", action: () => showNewFileDialog(isRight) },
    { label: t('ctx.newFolder'), shortcut:"F7", action: () => newFolder(isRight) },
    { label: "-", action: null, hidden: !singleSelection },
    { label: t('ctx.setWallpaper'), action: () => { call("set_wallpaper", { path: sel[0].path }); }, disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: t('ctx.rotateLeft'), action: () => { call("rotate_image", { path: sel[0].path, degrees: -90 }); }, disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: t('ctx.rotateRight'), action: () => { call("rotate_image", { path: sel[0].path, degrees: 90 }); }, disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: "-", action: null, hidden: !singleFile || !isImage },
    { label: t('ctx.extractHere'), action: async () => { const ext2 = (singleFile ? singleFile.extension : "").toLowerCase(); if (ext2 === "7z") { try { await call("extract_7z", { archive: sel[0].path, dest: currentPath }); await refresh(); } catch(e) { alert(t('alert.extractFailed')); } } else { call("extract_archive", { path: sel[0].path, dest: currentPath, entryPath: null }); refresh(); } }, disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: t('ctx.extractTo'), action: async () => { const sub = sel[0].name.replace(/\.[^.]+$/, ""); const ext2 = (singleFile ? singleFile.extension : "").toLowerCase(); if (ext2 === "7z") { try { await call("extract_7z", { archive: sel[0].path, dest: currentPath + "\\" + sub }); await refresh(); } catch(e) { alert(t('alert.extractFailed')); } } else { call("extract_archive", { path: sel[0].path, dest: currentPath + "\\" + sub, entryPath: null }); refresh(); } }, disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: "-", action: null, hidden: !singleFile || !isArchive },
    { label: t('ctx.runAsAdmin'), action: () => { call("run_as_admin", { path: sel[0].path }); }, disabled: !singleFile || !isExe, hidden: !singleFile || !isExe },
    { label: t('ctx.installCert'), action: async () => { try { await call("install_certificate", { path: sel[0].path }); showNotice(t('notice.certInstalled')); } catch(e) { alert(t('alert.installCertFailed')); } }, disabled: !singleFile || !isCert, hidden: !singleFile || !isCert },
    { label: t('ctx.installFont'), action: () => { call("install_font", { path: sel[0].path }); }, disabled: !singleFile || !isFont, hidden: !singleFile || !isFont },
    { label: "-", action: null, hidden: !singleSelection },
    { label: t('ctx.properties'), shortcut:"Alt+Enter", _flash: true, action: () => { if (singleSelection) showPropertiesDialog(sel[0].path); }, disabled: !singleSelection },
    { label: t('ctx.permissions'), action: () => { if (singleSelection) showPermissionsDialog(sel[0].path); }, disabled: !singleSelection },
  ];

  const visibleItems = items.filter(it => !it.hidden);

  renderMenuItems(menu, visibleItems, x, y);

  document.body.appendChild(menu);
  _ctxShow(menu);

  let ctxMeta = { x, y, isRight, singleSelection, sel, singleFile, isDir, items };

  menu.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); removeContextMenu(); return; }
    if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      const s = getSelectedPaths(ctxMeta.isRight);
      if (s.length) {
        const isR = ctxMeta.isRight;
        const lid = isR ? "right-file-list" : "file-list";
        const selEl = document.querySelector(`#${lid} .file-row.selected`) || document.getElementById(lid);
        if (selEl) { const r = selEl.getBoundingClientRect(); flashAt(r.left + r.width / 2, r.top + r.height / 2); }
        setTimeout(() => { removeContextMenu(); showPropertiesDialog(s[0].path); }, 80);
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
      for (const src of paths) {
        try { await call("move_path_cmd", { src, dest }); } catch (ex) {}
      }
      await refresh();
    }
  } catch (ex) {}
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
  try {
    const perms = await call("get_permissions", { path });
    const dlg = document.createElement("dialog");
    dlg.style.cssText = "border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--bg-1);color:var(--text-1);min-width:420px;";
    let rows = perms.map(p => `
      <tr>
        <td style="padding:4px 8px;font-size:12px;color:var(--text-2)">${esc(p.account)}</td>
        <td style="padding:4px 8px;font-size:12px;color:var(--text-3)">${esc(p.display)}</td>
        <td style="padding:4px 8px;"><button class="dialog-btn" style="font-size:11px;padding:2px 8px;" data-remove-account="${esc(p.account)}">${t('btn.remove')}</button></td>
      </tr>
    `).join("");

    dlg.innerHTML = `
      <h3 style="margin:0 0 8px;font-size:14px">${t('dialog.permTitle', {path: esc(path.split(/[\\/]/).pop())})}</h3>
      <div style="font-size:11px;color:var(--text-4);margin-bottom:8px;word-break:break-all;">${esc(path)}</div>
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
    document.body.appendChild(dlg);

    dlg.querySelector("#perm-close").onclick = () => { dlg.close(); dlg.remove(); };
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

    dlg.showModal();
    dlg.onclose = () => dlg.remove();
  } catch (e) {
    alert(t('alert.permGetFailed'));
  }
}
