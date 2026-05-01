// ops.js — file operations + context menu

// --- file ops ---
async function deleteSelected(isRight) {
  const sel = getSelectedPaths(isRight);
  if (!sel.length) return;
  const msg = sel.length === 1 ? 'Delete "' + sel[0].name + '"?' : 'Delete ' + sel.length + ' items?';
  if (!confirm(msg)) return;
  try {
    for (const f of sel) await call("delete_file", { path: f.path });
    await refresh();
  } catch (e) { alert("Delete failed: " + e); }
}

async function renamePrompt(isRight) {
  const sel = getSelectedPaths(isRight);
  if (sel.length !== 1) return;
  const newName = prompt("Rename:", sel[0].name);
  if (!newName || newName === sel[0].name) return;
  try {
    const oldPath = sel[0].path;
    await call("rename_file", { path: oldPath, newName });
    const newPath = oldPath.split("\\").slice(0, -1).join("\\") + "\\" + newName;
    trackRename(oldPath, newPath);
    await refresh();
  }
  catch (e) { alert("Rename failed: " + e); }
}

async function newFolder() {
  try { await call("new_folder", { parent: getTab().path }); await refresh(); }
  catch (e) { alert("New folder failed: " + e); }
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
  const destPath = isRight ? G.rp.path : getTab().path;
  try {
    for (const srcPath of G.clipboard.paths) {
      if (G.clipboard.op === "cut") {
        await call("move_path_cmd", { src: srcPath, dest: destPath });
        trackMove(srcPath, destPath + "\\" + srcPath.split("\\").pop());
      } else {
        await call("copy_path", { src: srcPath, dest: destPath });
        trackCopy(srcPath, destPath + "\\" + srcPath.split("\\").pop());
      }
    }
    if (G.clipboard.op === "cut") G.clipboard = null;
    await refresh();
  } catch (e) { alert("Paste failed: " + e); }
}

async function openFileHandler(path) {
  try { await call("open_file", { path }); } catch (e) {}
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
    <div class="props-row"><span class="props-label">Name:</span><span class="props-value">${esc(info.name)}</span></div>
    <div class="props-row"><span class="props-label">Path:</span><span class="props-value">${esc(info.path)}</span></div>
    <div class="props-row"><span class="props-label">Type:</span><span class="props-value">${esc(isDir?'File folder':ext.toUpperCase()+' File')}</span></div>
    <div class="props-row"><span class="props-label">Size:</span><span class="props-value">${esc(info.size_display)}</span></div>`;

  if (isDir) {
    html += `<div class="props-row"><span class="props-label">Folder Size:</span><span class="props-value" id="props-folder-size">Calculating...</span></div>`;
  }

  html += `
    <div class="props-row"><span class="props-label">Modified:</span><span class="props-value">${esc(info.modified)}</span></div>
    <div class="props-row"><span class="props-label">Created:</span><span class="props-value">${esc(info.created)}</span></div>
    <div class="props-row"><span class="props-label">Read-only:</span><span class="props-value">${info.readonly?'Yes':'No'}</span></div>`;

  if (isShortcut) {
    html += `<div class="props-row"><span class="props-label">Shortcut Target:</span><span class="props-value" id="props-shortcut-target">Loading...</span></div>`;
  }

  html += `<div class="props-row"><span class="props-label">File Hash:</span><span class="props-value">
    <button class="dialog-btn" onclick="computeAndShowHash('md5','${esc(info.path)}')">MD5</button>
    <button class="dialog-btn" onclick="computeAndShowHash('sha256','${esc(info.path)}')">SHA256</button>
    <span id="props-hash-result" style="margin-left:8px;font-size:11px;color:var(--text-3);word-break:break-all;"></span>
  </span></div>`;

  html += `<div class="props-row"><span class="props-label">Opens with:</span><span class="props-value" id="props-association">Loading...</span></div>`;

  content.innerHTML = html;
  dlg.style.display = "flex";

  if (isDir) {
    call("folder_size", { path: info.path }).then(size => {
      const el = document.getElementById("props-folder-size");
      if (el) el.textContent = fmtSize(size);
    }).catch(() => {
      const el = document.getElementById("props-folder-size");
      if (el) el.textContent = "Unable to calculate";
    });
  }
  if (isShortcut) {
    call("read_shortcut", { path: info.path }).then(data => {
      const el = document.getElementById("props-shortcut-target");
      if (el) el.textContent = data && data.target ? data.target : "Unknown";
    }).catch(() => {
      const el = document.getElementById("props-shortcut-target");
      if (el) el.textContent = "Unable to read";
    });
  }
  call("get_file_association", { path: info.path }).then(data => {
    const el = document.getElementById("props-association");
    if (el) el.textContent = data && data.name ? data.name : "Unknown";
  }).catch(() => {
    const el = document.getElementById("props-association");
    if (el) el.textContent = "Unknown";
  });
}

async function computeAndShowHash(algo, path) {
  const el = document.getElementById("props-hash-result");
  if (el) el.textContent = "Computing...";
  try {
    const result = await call("compute_hash", { path, algo });
    if (el) el.textContent = algo.toUpperCase() + ": " + result;
  } catch (e) {
    if (el) el.textContent = "Error: " + e;
  }
}

function closeProperties() {
  document.getElementById("properties-dialog").style.display = "none";
}

// --- context menu ---
let contextMenu = null;

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

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${x}px;top:${y}px;`;

  const items = [
    { label: t('ctx.open'), shortcut:"Enter", action: () => { if (singleSelection) { if (sel[0].is_dir) { if (isRight) rpNavigateTo(sel[0].path); else navigateTo(sel[0].path); } else openFileHandler(sel[0].path); } }, disabled: !singleSelection },
    { label: "Open in IDE", action: async () => { try { const ides = await call("detect_ides", {}); if (ides && ides.length) { await call("open_in_ide", { path: sel[0].path, ide: ides[0] }); } } catch(e) { alert("No IDE detected"); } }, disabled: !singleSelection },
    { label: "Open in Terminal", action: () => { const path = singleFile ? sel[0].path.split("\\").slice(0,-1).join("\\") : (singleSelection ? sel[0].path : getTab().path); call("open_terminal", { path, terminal: G.settings.terminal || "wt" }); } },
    { label: "-", action: null },
    { label: "Run as Administrator", action: () => { call("run_as_admin", { path: sel[0].path }); }, disabled: !singleFile || !isExe, hidden: !singleFile || !isExe },
    { label: "-", action: null, hidden: !singleFile || !isExe },
    { label: t('ctx.cut'), shortcut:"Ctrl+X", action: () => cutSelected(isRight), disabled: !hasSelection },
    { label: t('ctx.copy'), shortcut:"Ctrl+C", action: () => copySelected(isRight), disabled: !hasSelection },
    { label: t('ctx.paste'), shortcut:"Ctrl+V", action: () => paste(isRight), disabled: !G.clipboard },
    { label: "Paste Shortcut", action: async () => { if (!G.clipboard) return; const dest = isRight ? G.rp.path : getTab().path; try { for (const src of G.clipboard.paths) { const name = src.split("\\").pop().replace(/\.[^.]+$/, "") + ".lnk"; await call("create_shortcut", { target: src, dest: dest + "\\" + name }); } await refresh(); } catch(e) { alert("Create shortcut failed: " + e); } }, disabled: !G.clipboard },
    { label: "-", action: null },
    { label: t('ctx.rename'), shortcut:"F2", action: () => renamePrompt(isRight), disabled: !singleSelection },
    { label: t('ctx.delete'), shortcut:"Del", action: () => deleteSelected(isRight), disabled: !hasSelection },
    { label: "-", action: null },
    { label: "New File...", shortcut:"Ctrl+Shift+N", action: () => showNewFileDialog(isRight) },
    { label: t('ctx.newFolder'), shortcut:"F7", action: newFolder },
    { label: "-", action: null },
    { label: "Set as Wallpaper", action: () => { call("set_wallpaper", { path: sel[0].path }); }, disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: "Rotate Left", action: () => { call("rotate_image", { path: sel[0].path, degrees: -90 }); }, disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: "Rotate Right", action: () => { call("rotate_image", { path: sel[0].path, degrees: 90 }); }, disabled: !singleFile || !isImage, hidden: !singleFile || !isImage },
    { label: "-", action: null, hidden: !singleFile || !isImage },
    { label: "Extract Here", action: () => { call("extract_archive", { path: sel[0].path, dest: getTab().path, entryPath: null }); refresh(); }, disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: "Extract to Subfolder...", action: () => { const sub = sel[0].name.replace(/\.[^.]+$/, ""); call("extract_archive", { path: sel[0].path, dest: getTab().path + "\\" + sub, entryPath: null }); refresh(); }, disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: "-", action: null, hidden: !singleFile || !isArchive },
    { label: "Compress to ZIP", action: async () => { const paths = sel.map(f => f.path); try { await call("create_archive", { paths, dest: getTab().path + "\\" + (singleSelection ? sel[0].name : "archive") + ".zip" }); await refresh(); } catch(e) { alert("Compress failed: " + e); } }, disabled: !hasSelection },
    { label: "-", action: null },
    { label: "Install Font", action: () => { call("install_font", { path: sel[0].path }); }, disabled: !singleFile || !isFont, hidden: !singleFile || !isFont },
    { label: "-", action: null, hidden: !singleFile || !isFont },
    { label: t('ctx.selectAll'), shortcut:"Ctrl+A", action: () => selectAll(isRight) },
    { label: "Invert Selection", shortcut:"Ctrl+I", action: () => invertSelection(isRight) },
    { label: "-", action: null },
    { label: t('ctx.batchRename'), action: () => openBatchRename(isRight), disabled: !hasSelection },
    { label: t('ctx.addTag'), action: () => openTagDialog(isRight), disabled: !hasSelection },
    { label: t('ctx.properties'), shortcut:"Alt+Enter", action: () => { if (singleSelection) showPropertiesDialog(sel[0].path); }, disabled: !singleSelection },
    { label: "-", action: null },
    { label: "Empty Recycle Bin", action: () => { if (confirm("Empty Recycle Bin?")) call("empty_recycle_bin", {}); } },
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
  contextMenu = menu;
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + "px";
  });
}

function removeContextMenu() { if (contextMenu) { contextMenu.remove(); contextMenu = null; } }
document.addEventListener("click", e => { if (contextMenu && !contextMenu.contains(e.target)) removeContextMenu(); });

async function showNewFileDialog(isRight) {
  let templates = [];
  try {
    templates = await call("get_new_file_templates", {});
  } catch (e) {
    templates = [
      { name: "Text File", ext: ".txt", content: "" },
      { name: "HTML File", ext: ".html", content: "<!DOCTYPE html>\n<html>\n<head><title></title></head>\n<body>\n\n</body>\n</html>" },
      { name: "JSON File", ext: ".json", content: "{\n  \n}" },
      { name: "Markdown File", ext: ".md", content: "# Title\n\n" },
      { name: "JavaScript File", ext: ".js", content: "// \n" },
      { name: "CSS File", ext: ".css", content: "/* */\n" },
      { name: "Python File", ext: ".py", content: "# -*- coding: utf-8 -*-\n\n" },
      { name: "Batch File", ext: ".bat", content: "@echo off\n\n" },
    ];
  }
  const destPath = isRight ? G.rp.path : getTab().path;
  const fileName = prompt("File name:", "New File" + (templates.length ? templates[0].ext : ".txt"));
  if (!fileName) return;
  const tmpl = templates.find(t => fileName.endsWith(t.ext)) || templates[0];
  try {
    await call("create_new_file", { path: destPath + "\\" + fileName, content: tmpl ? tmpl.content : "" });
    await refresh();
  } catch (e) { alert("Create file failed: " + e); }
}

// --- drag & drop ---
document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", async e => {
  e.preventDefault();
  try {
    const data = e.dataTransfer.getData("text/plain");
    if (data) {
      const paths = JSON.parse(data);
      const dest = getTab().path;
      for (const src of paths) {
        try { await call("move_path_cmd", { src, dest }); } catch (ex) {}
      }
      await refresh();
    }
  } catch (ex) {}
});
