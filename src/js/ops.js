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
  const msg = sel.length === 1 ? t('confirm.deleteItem', {name: sel[0].name}) : t('confirm.deleteItems', {count: sel.length});
  if (!confirm(msg)) return;
  try {
    await call("delete_files", { paths: sel.map(f => f.path) });
    await refresh();
  } catch (e) { alert(t('alert.deleteFailed', {error: e})); }
}

async function renamePrompt(isRight) {
  const sel = getSelectedPaths(isRight);
  if (sel.length !== 1) return;
  const newName = prompt(t('prompt.rename'), sel[0].name);
  if (!newName || newName === sel[0].name) return;
  try {
    const oldPath = sel[0].path;
    await call("rename_file", { path: oldPath, newName });
    const newPath = oldPath.split("\\").slice(0, -1).join("\\") + "\\" + newName;
    trackRename(oldPath, newPath);
    await refresh();
  }
  catch (e) { alert(t('alert.renameFailed')); }
}

async function newFolder() {
  try { await call("new_folder", { parent: getTab().path }); await refresh(); }
  catch (e) { alert(t('alert.newFolderFailed')); }
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

async function showShellVerbsMenu(path, cx, cy) {
  removeContextMenu();
  // Show loading indicator immediately
  const sub = document.createElement("div");
  sub.className = "context-menu";
  sub.style.cssText = `left:${cx}px;top:${cy}px;z-index:9999;`;
  const loadingItem = document.createElement("div");
  loadingItem.className = "ctx-item disabled";
  loadingItem.innerHTML = `<span>${t('properties.loading')}</span>`;
  sub.appendChild(loadingItem);
  document.body.appendChild(sub);
  requestAnimationFrame(() => clampMenuPosition(sub, cx, cy));
  _ctxShow(sub);

  // Fire COM and registry in parallel — render whichever finishes first
  let comDone = false;
  let registryDone = false;
  let comResult = null;
  let registryResult = null;

  call("query_context_menu", { path }).then(v => {
    comResult = v;
    comDone = true;
    if (!registryDone) renderShellMenu(sub, path, v);
  }).catch(() => { comDone = true; });

  call("get_shell_verbs", { path }).then(v => {
    registryResult = v;
    registryDone = true;
    if (!comDone) renderShellMenu(sub, path, v);
  }).catch(() => { registryDone = true; });

  // After 2 seconds, if neither has finished with valid data, give up
  setTimeout(() => {
    if (!comDone && !registryDone) { sub.remove(); }
    else if (comDone && comResult && comResult.length) { /* COM won */ }
    else if (registryDone && registryResult && registryResult.length) { /* registry won */ }
    else if (comDone && !comResult?.length && registryDone && !registryResult?.length) { sub.remove(); }
    else if (comDone && !comResult?.length && !registryDone) { /* wait for registry */ }
    else if (registryDone && !registryResult?.length && !comDone) { /* wait for COM */ }
  }, 2000);
}

function renderShellMenu(container, path, items) {
  if (!items || !items.length) return;
  container.innerHTML = "";
  items.forEach(v => {
    if (v.separator) {
      const sep = document.createElement("div"); sep.className = "ctx-sep"; container.appendChild(sep);
      return;
    }
    const mi = document.createElement("div");
    mi.className = "ctx-item";
    mi.innerHTML = `<span>${esc(v.label)}</span>`;
    mi.addEventListener("click", () => {
      removeContextMenu();
      if (v.id !== undefined) {
        call("invoke_context_menu_command", { path, cmdId: v.id });
      } else if (v.verb !== undefined) {
        call("invoke_shell_verb", { path, verb: v.verb });
      }
    });
    container.appendChild(mi);
  });
  requestAnimationFrame(() => clampMenuPosition(container, parseInt(container.style.left), parseInt(container.style.top)));
}

/// Render a context menu from shell verbs via registry scan (fast, no COM).
/// Falls back to built-in menu if registry returns nothing.
/// Items have the shape: { verb, label, children?: [...] }
async function showComContextMenu(path, cx, cy) {
  removeContextMenu();
  let items;
  try {
    items = await call("get_shell_verbs", { path });
  } catch (e) { console.error("get_shell_verbs error:", e); }
  if (!items || !items.length) {
    console.log("get_shell_verbs empty for", path, ", falling back to built-in menu");
    showContextMenu(cx, cy); return;
  }
  console.log("get_shell_verbs returned", items.length, "items for", path);

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${cx}px;top:${cy}px;z-index:9999;`;

  function closeAllSubs() {
    menu.querySelectorAll(".ctx-item").forEach(el => { if (el._subOpen) { el._subContainer.style.display = "none"; el._subContainer.innerHTML = ""; el._subOpen = false; } });
  }

  function openSub(parentEl, children, depth) {
    const sub = parentEl._subContainer;
    if (!sub) return;
    sub.innerHTML = "";
    buildItems(sub, children, depth);
    sub.style.display = "block";
    parentEl._subOpen = true;

    const pRect = parentEl.getBoundingClientRect();
    sub.style.left = (pRect.right + 2) + "px";
    sub.style.top = pRect.top + "px";

    requestAnimationFrame(() => {
      const sRect = sub.getBoundingClientRect();
      if (sRect.right > window.innerWidth) sub.style.left = (pRect.left - sRect.width - 2) + "px";
      if (sRect.bottom > window.innerHeight) sub.style.top = Math.max(4, window.innerHeight - sRect.height - 8) + "px";
    });
  }

  function buildItems(parentEl, itemList, depth) {
    itemList.forEach(it => {
      if (it.separator) {
        const sep = document.createElement("div"); sep.className = "ctx-sep"; parentEl.appendChild(sep);
        return;
      }
      const mi = document.createElement("div");
      mi.className = "ctx-item";
      const hasChildren = it.children && it.children.length > 0;
      mi.innerHTML = `<span>${esc(it.label)}</span>${hasChildren ? '<span class="ctx-arrow">\u25b6</span>' : ''}`;
      mi.addEventListener("click", e => {
        e.stopPropagation();
        if (hasChildren) {
          if (mi._subOpen) { mi._subContainer.style.display = "none"; mi._subContainer.innerHTML = ""; mi._subOpen = false; return; }
          closeAllSubs();
          openSub(mi, it.children, depth + 1);
        } else {
          removeContextMenu();
          call("invoke_shell_verb", { path, verb: it.verb }).catch(() => {});
        }
      });
      parentEl.appendChild(mi);

      if (hasChildren) {
        const subContainer = document.createElement("div");
        subContainer.className = "context-menu ctx-submenu";
        subContainer.style.display = "none";
        subContainer.style.position = "fixed";
        subContainer.style.zIndex = "10001";
        parentEl.appendChild(subContainer);
        mi._subContainer = subContainer;
      }
    });
  }

  buildItems(menu, items, 0);

  document.body.appendChild(menu);
  _ctxShow(menu);
  requestAnimationFrame(() => clampMenuPosition(menu, cx, cy));

  document.addEventListener("pointerdown", function closeSubs(e) {
    if (!menu.contains(e.target)) { closeAllSubs(); document.removeEventListener("pointerdown", closeSubs); }
  }, true);
}

function showContextMenu(x, y, isRight) {
  removeContextMenu();
  const sel = getSelectedPaths(isRight);
  const hasSelection = sel.length > 0;
  const singleSelection = sel.length === 1;
  const singleFile = singleSelection && !sel[0].is_dir ? sel[0] : null;
  const ext = singleFile ? (singleFile.extension || "").toLowerCase() : "";
  const isImage = ["jpg","jpeg","png","gif","bmp","webp","svg","ico","tiff"].includes(ext);
  const isArchive = ["zip","rar","7z","tar","gz","bz2"].includes(ext);
  const isExe = ext === "exe" || ext === "msi";
  const isFont = ["ttf","otf","fon"].includes(ext);
  const isShortcut = ext === "lnk";
  const isCert = ["cer","crt","p7b","pfx","p12"].includes(ext);

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${x}px;top:${y}px;z-index:9999;`;

  const items = [
    { label: t('ctx.open'), shortcut:"Enter", action: () => { if (singleSelection) { if (sel[0].is_dir) { if (isRight) rpNavigateTo(sel[0].path); else navigateTo(sel[0].path); } else openFileHandler(sel[0].path); } }, disabled: !singleSelection },
    { label: t('ctx.openInIde'), action: async () => { try { const ides = await call("detect_ides", {}); if (ides && ides.length) { await call("open_in_ide", { ide_cmd: ides[0].command, path: sel[0].path }); } } catch(e) { alert(t('alert.noIde')); } }, disabled: !singleSelection },
    { label: t('ctx.openInTerminal'), action: () => { const path = singleFile ? sel[0].path.split("\\").slice(0,-1).join("\\") : (singleSelection ? sel[0].path : getTab().path); call("open_terminal", { path, terminal: G.settings.terminal || "wt" }); } },
    { label: "-", action: null },
    { label: t('ctx.runAsAdmin'), action: () => { call("run_as_admin", { path: sel[0].path }); }, disabled: !singleFile || !isExe, hidden: !singleFile || !isExe },
    { label: t('ctx.compatSettings'), action: () => showCompatDialog(sel[0].path), disabled: !singleFile || !isExe, hidden: !singleFile || !isExe },
    { label: t('ctx.installCert'), action: async () => { try { await call("install_certificate", { path: sel[0].path }); showNotice(t('notice.certInstalled')); } catch(e) { alert(t('alert.installCertFailed')); } }, disabled: !singleFile || !isCert, hidden: !singleFile || !isCert },
    { label: "-", action: null, hidden: (!singleFile || !isExe) && (!singleFile || !isCert) },
    { label: t('ctx.cut'), shortcut:"Ctrl+X", action: () => cutSelected(isRight), disabled: !hasSelection },
    { label: t('ctx.copy'), shortcut:"Ctrl+C", action: () => copySelected(isRight), disabled: !hasSelection },
    { label: t('ctx.paste'), shortcut:"Ctrl+V", action: () => paste(isRight), disabled: !G.clipboard },
    { label: t('ctx.pasteShortcut'), action: async () => { if (!G.clipboard) return; const dest = isRight ? G.rp.path : getTab().path; try { for (const src of G.clipboard.paths) { const linkName = src.split("\\").pop().replace(/\.[^.]+$/, ""); await call("create_shortcut", { target: src, name: linkName, dest: dest }); } await refresh(); } catch(e) { alert(t('alert.shortcutFailed')); } }, disabled: !G.clipboard },
    { label: "-", action: null },
    { label: t('ctx.rename'), shortcut:"F2", action: () => renamePrompt(isRight), disabled: !singleSelection },
    { label: t('ctx.delete'), shortcut:"Del", action: () => deleteSelected(isRight), disabled: !hasSelection },
    { label: "-", action: null },
    { label: t('ctx.newFile'), shortcut:"Ctrl+Shift+N", action: () => showNewFileDialog(isRight) },
    { label: t('ctx.newFolder'), shortcut:"F7", action: newFolder },
    { label: "-", action: null },
    { label: t('ctx.setWallpaper'), action: () => { call("set_wallpaper", { path: sel[0].path }); }, disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: t('ctx.rotateLeft'), action: () => { call("rotate_image", { path: sel[0].path, degrees: -90 }); }, disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: t('ctx.rotateRight'), action: () => { call("rotate_image", { path: sel[0].path, degrees: 90 }); }, disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: "-", action: null, hidden: !singleFile || !isImage },
    { label: t('ctx.extractHere'), action: async () => { const ext = (singleFile ? singleFile.extension : "").toLowerCase(); if (ext === "7z") { try { await call("extract_7z", { archive: sel[0].path, dest: getTab().path }); await refresh(); } catch(e) { alert(t('alert.extractFailed')); } } else { call("extract_archive", { path: sel[0].path, dest: getTab().path, entryPath: null }); refresh(); } }, disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: t('ctx.extractTo'), action: async () => { const sub = sel[0].name.replace(/\.[^.]+$/, ""); const ext = (singleFile ? singleFile.extension : "").toLowerCase(); if (ext === "7z") { try { await call("extract_7z", { archive: sel[0].path, dest: getTab().path + "\\" + sub }); await refresh(); } catch(e) { alert(t('alert.extractFailed')); } } else { call("extract_archive", { path: sel[0].path, dest: getTab().path + "\\" + sub, entryPath: null }); refresh(); } }, disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: "-", action: null, hidden: !singleFile || !isArchive },
    { label: t('ctx.compressZip'), action: async () => { const paths = sel.map(f => f.path); try { await call("create_archive", { paths, dest: getTab().path + "\\" + (singleSelection ? sel[0].name : "archive") + ".zip" }); await refresh(); } catch(e) { alert(t('alert.compressFailed')); } }, disabled: !hasSelection },
    { label: t('ctx.compress7z'), action: async () => { const paths = sel.map(f => f.path); try { await call("create_7z", { sources: paths, archive: getTab().path + "\\" + (singleSelection ? sel[0].name : "archive") + ".7z" }); await refresh(); } catch(e) { alert(t('alert.compress7zFailed')); } }, disabled: !hasSelection, hidden: !G._7zAvailable },
    { label: "-", action: null, hidden: !G._7zAvailable },
    { label: t('ctx.installFont'), action: () => { call("install_font", { path: sel[0].path }); }, disabled: !singleFile || !isFont, hidden: !singleFile || !isFont },
    { label: "-", action: null, hidden: !singleFile || !isFont },
    { label: t('ctx.selectAll'), shortcut:"Ctrl+A", action: () => selectAll(isRight) },
    { label: t('ctx.invertSelection'), shortcut:"Ctrl+I", action: () => invertSelection(isRight) },
    { label: "-", action: null },
    { label: t('ctx.batchRename'), action: () => openBatchRename(isRight), disabled: !hasSelection },
    { label: t('ctx.addTag'), action: () => openTagDialog(isRight), disabled: !hasSelection },
    { label: t('ctx.properties'), shortcut:"Alt+Enter", action: () => { if (singleSelection) showPropertiesDialog(sel[0].path); }, disabled: !singleSelection },
    { label: t('ctx.permissions'), action: () => { if (singleSelection) showPermissionsDialog(sel[0].path); }, disabled: !singleSelection },
    { label: "-", action: null },
    { label: t('ctx.unblockFile'), action: async () => { try { await call("unblock_file", { path: sel[0].path }); showNotice(t('notice.fileUnblocked')); refresh(); } catch(e) { alert(t('alert.unblockFailed')); } }, disabled: !singleFile, hidden: !singleFile },
    { label: t('ctx.viewStreams'), action: async () => { try { const ads = await call("list_ads", { path: sel[0].path }); showStreamsDialog(sel[0].path, ads); } catch(e) { showStreamsDialog(sel[0].path, []); } }, disabled: !singleFile, hidden: !singleFile },
    { label: "-", action: null },
    { label: "\u2601 " + t('ctx.alwaysKeep'), action: async () => { try { for (const f of sel) await call("cloud_pin_file", { path: f.path }); showNotice(t('notice.filesPinned')); await refresh(); } catch(e) { alert(t('alert.pinFailed')); } }, disabled: !hasSelection, hidden: !isCloudPath(isRight) },
    { label: "\u2601 " + t('ctx.freeUpSpace'), action: async () => { try { for (const f of sel) await call("cloud_unpin_file", { path: f.path }); showNotice(t('notice.spaceFreed')); await refresh(); } catch(e) { alert(t('alert.unpinFailed')); } }, disabled: !hasSelection, hidden: !isCloudPath(isRight) },
    { label: "-", action: null },
    { label: t('ctx.emptyRecycleBin'), action: () => { if (confirm(t('confirm.emptyRecycleBin'))) call("empty_recycle_bin", {}); } },
    { label: t('ctx.gitClone'), action: () => showGitCloneDialog() },
    { label: t('ctx.svnCheckout'), action: () => showSvnCheckoutDialog() },
    { label: t('ctx.svnUpdate'), action: svnUpdate, hidden: typeof svnUpdate !== 'function' },
    { label: t('ctx.svnCommit'), action: svnCommit, hidden: typeof svnCommit !== 'function' },
    { label: t('ctx.svnRevert'), action: svnRevert, hidden: typeof svnRevert !== 'function' },
    { label: t('ctx.svnAdd'), action: svnAdd, hidden: typeof svnAdd !== 'function' },
    { label: t('ctx.svnLog'), action: showSvnLog, hidden: typeof showSvnLog !== 'function' },
    { label: t('ctx.svnCleanup'), action: svnCleanup, hidden: typeof svnCleanup !== 'function' },
    { label: G.showHidden ? t('ctx.hideHidden') : t('ctx.showHidden'), action: toggleHidden },
  ];

  const visibleItems = items.filter(it => !it.hidden);

  visibleItems.forEach(item => {
    if (item.label === "-") {
      const sep = document.createElement("div"); sep.className = "ctx-sep"; menu.appendChild(sep);
    } else {
      const mi = document.createElement("div");
      mi.className = "ctx-item" + (item.disabled ? " disabled" : "");
      mi.innerHTML = `<span>${esc(item.label)}</span>${item.shortcut ? `<span class="ctx-shortcut">${item.shortcut}</span>` : ""}`;
      mi.addEventListener("click", () => { removeContextMenu(); if (item.action && !item.disabled) item.action(); });
      menu.appendChild(mi);
    }
  });

  document.body.appendChild(menu);
  _ctxShow(menu);

  if (singleSelection) {
    const sep = document.createElement("div");
    sep.className = "ctx-sep";
    menu.appendChild(sep);
    const loadingItem = document.createElement("div");
    loadingItem.className = "ctx-item disabled";
    loadingItem.innerHTML = `<span>${t('ctx.moreOptions')}...</span>`;
    menu.appendChild(loadingItem);

    async function loadShellVerbs() {
      let verbs;
      try { verbs = await call("get_shell_verbs", { path: sel[0].path }); } catch(e) {}
      if (!verbs || !verbs.length) { loadingItem.remove(); return; }
      loadingItem.remove();
      verbs.forEach(v => {
        if (v.separator) {
          const sep = document.createElement("div"); sep.className = "ctx-sep"; menu.appendChild(sep);
          return;
        }
        const mi = document.createElement("div");
        mi.className = "ctx-item";
        mi.innerHTML = `<span>${esc(v.label)}</span>`;
        mi.addEventListener("click", () => { removeContextMenu(); call("invoke_shell_verb", { path: sel[0].path, verb: v.verb }); });
        menu.appendChild(mi);
      });
      requestAnimationFrame(() => clampMenuPosition(menu, x, y));
    }
    loadShellVerbs();
  }

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
  if (contextMenu && !contextMenu.contains(e.target)) removeContextMenu();
}
function _ctxCloseBlur() {
  if (contextMenu) removeContextMenu();
}
function _ctxShow(menu) {
  contextMenu = menu;
  // Register close handlers when menu is shown
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
