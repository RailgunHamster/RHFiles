// ops.js — file operations + context menu

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
  hideProgress();
}

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
        showProgress("Moving...");
        await call("move_with_progress", { src: srcPath, dest: destPath });
        hideProgress();
        trackMove(srcPath, destPath + "\\" + srcPath.split("\\").pop());
      } else {
        showProgress("Copying...");
        await call("copy_with_progress", { src: srcPath, dest: destPath });
        hideProgress();
        trackCopy(srcPath, destPath + "\\" + srcPath.split("\\").pop());
      }
    }
    if (G.clipboard.op === "cut") G.clipboard = null;
    await refresh();
  } catch (e) { hideProgress(); alert("Paste failed: " + e); }
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
  call("get_file_association", { extension: info.extension }).then(data => {
    const el = document.getElementById("props-association");
    if (el) el.textContent = data || "Unknown";
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
  const isCert = ["cer","crt","p7b","pfx","p12"].includes(ext);

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${x}px;top:${y}px;`;

  const items = [
    { label: t('ctx.open'), shortcut:"Enter", action: () => { if (singleSelection) { if (sel[0].is_dir) { if (isRight) rpNavigateTo(sel[0].path); else navigateTo(sel[0].path); } else openFileHandler(sel[0].path); } }, disabled: !singleSelection },
    { label: "Open in IDE", action: async () => { try { const ides = await call("detect_ides", {}); if (ides && ides.length) { await call("open_in_ide", { ide_cmd: ides[0].command, path: sel[0].path }); } } catch(e) { alert("No IDE detected"); } }, disabled: !singleSelection },
    { label: "Open in Terminal", action: () => { const path = singleFile ? sel[0].path.split("\\").slice(0,-1).join("\\") : (singleSelection ? sel[0].path : getTab().path); call("open_terminal", { path, terminal: G.settings.terminal || "wt" }); } },
    { label: "-", action: null },
    { label: "Run as Administrator", action: () => { call("run_as_admin", { path: sel[0].path }); }, disabled: !singleFile || !isExe, hidden: !singleFile || !isExe },
    { label: "Compatibility Settings...", action: () => showCompatDialog(sel[0].path), disabled: !singleFile || !isExe, hidden: !singleFile || !isExe },
    { label: "Install Certificate", action: async () => { try { await call("install_certificate", { path: sel[0].path }); showNotice("Certificate installed"); } catch(e) { alert("Install failed: " + e); } }, disabled: !singleFile || !isCert, hidden: !singleFile || !isCert },
    { label: "-", action: null, hidden: (!singleFile || !isExe) && (!singleFile || !isCert) },
    { label: t('ctx.cut'), shortcut:"Ctrl+X", action: () => cutSelected(isRight), disabled: !hasSelection },
    { label: t('ctx.copy'), shortcut:"Ctrl+C", action: () => copySelected(isRight), disabled: !hasSelection },
    { label: t('ctx.paste'), shortcut:"Ctrl+V", action: () => paste(isRight), disabled: !G.clipboard },
    { label: "Paste Shortcut", action: async () => { if (!G.clipboard) return; const dest = isRight ? G.rp.path : getTab().path; try { for (const src of G.clipboard.paths) { const linkName = src.split("\\").pop().replace(/\.[^.]+$/, ""); await call("create_shortcut", { target: src, name: linkName, dest: dest }); } await refresh(); } catch(e) { alert("Create shortcut failed: " + e); } }, disabled: !G.clipboard },
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
    { label: "Extract Here", action: async () => { const ext = (singleFile ? singleFile.extension : "").toLowerCase(); if (ext === "7z") { try { await call("extract_7z", { archive: sel[0].path, dest: getTab().path }); await refresh(); } catch(e) { alert("7z extract failed: " + e); } } else { call("extract_archive", { path: sel[0].path, dest: getTab().path, entryPath: null }); refresh(); } }, disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: "Extract to Subfolder...", action: async () => { const sub = sel[0].name.replace(/\.[^.]+$/, ""); const ext = (singleFile ? singleFile.extension : "").toLowerCase(); if (ext === "7z") { try { await call("extract_7z", { archive: sel[0].path, dest: getTab().path + "\\" + sub }); await refresh(); } catch(e) { alert("7z extract failed: " + e); } } else { call("extract_archive", { path: sel[0].path, dest: getTab().path + "\\" + sub, entryPath: null }); refresh(); } }, disabled: !singleFile || !isArchive, hidden: !singleFile || !isArchive },
    { label: "-", action: null, hidden: !singleFile || !isArchive },
    { label: "Compress to ZIP", action: async () => { const paths = sel.map(f => f.path); try { await call("create_archive", { paths, dest: getTab().path + "\\" + (singleSelection ? sel[0].name : "archive") + ".zip" }); await refresh(); } catch(e) { alert("Compress failed: " + e); } }, disabled: !hasSelection },
    { label: "Compress to 7z", action: async () => { const paths = sel.map(f => f.path); try { await call("create_7z", { sources: paths, archive: getTab().path + "\\" + (singleSelection ? sel[0].name : "archive") + ".7z" }); await refresh(); } catch(e) { alert("7z compress failed: " + e); } }, disabled: !hasSelection, hidden: !G._7zAvailable },
    { label: "-", action: null, hidden: !G._7zAvailable },
    { label: "Install Font", action: () => { call("install_font", { path: sel[0].path }); }, disabled: !singleFile || !isFont, hidden: !singleFile || !isFont },
    { label: "-", action: null, hidden: !singleFile || !isFont },
    { label: t('ctx.selectAll'), shortcut:"Ctrl+A", action: () => selectAll(isRight) },
    { label: "Invert Selection", shortcut:"Ctrl+I", action: () => invertSelection(isRight) },
    { label: "-", action: null },
    { label: t('ctx.batchRename'), action: () => openBatchRename(isRight), disabled: !hasSelection },
    { label: t('ctx.addTag'), action: () => openTagDialog(isRight), disabled: !hasSelection },
    { label: t('ctx.properties'), shortcut:"Alt+Enter", action: () => { if (singleSelection) showPropertiesDialog(sel[0].path); }, disabled: !singleSelection },
    { label: "Permissions...", action: () => { if (singleSelection) showPermissionsDialog(sel[0].path); }, disabled: !singleSelection },
    { label: "-", action: null },
    { label: "Unblock File", action: async () => { try { await call("unblock_file", { path: sel[0].path }); showNotice("File unblocked"); refresh(); } catch(e) { alert("Unblock failed: " + e); } }, disabled: !singleFile, hidden: !singleFile },
    { label: "View Streams...", action: async () => { try { const ads = await call("list_ads", { path: sel[0].path }); showStreamsDialog(sel[0].path, ads); } catch(e) { showStreamsDialog(sel[0].path, []); } }, disabled: !singleFile, hidden: !singleFile },
    { label: "-", action: null },
    { label: "Empty Recycle Bin", action: () => { if (confirm("Empty Recycle Bin?")) call("empty_recycle_bin", {}); } },
    { label: "Git Clone...", action: () => showGitCloneDialog() },
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

  if (singleFile) {
    (async () => {
      try {
        const verbs = await call("get_shell_verbs", { path: sel[0].path });
        if (verbs && verbs.length > 0 && contextMenu === menu) {
          const skip = ['open', 'edit', 'print', 'explore', 'find', 'runas'];
          const extra = verbs.filter(v => !skip.includes(String(v.verb).toLowerCase()));
          if (extra.length > 0) {
            const sep = document.createElement("div");
            sep.className = "ctx-sep";
            menu.appendChild(sep);
            for (const v of extra) {
              const mi = document.createElement("div");
              mi.className = "ctx-item";
              mi.innerHTML = `<span>${esc(v.label)}</span>`;
              mi.addEventListener("click", () => {
                removeContextMenu();
                call("invoke_shell_verb", { path: sel[0].path, verb: v.verb });
              });
              menu.appendChild(mi);
            }
          }
        }
      } catch (e) {}
    })();
  }

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
    const templateExt = tmpl ? (tmpl.extension || (tmpl.ext || "").replace(/^\./, '')) : "";
    await call("create_new_file", { parent: destPath, template: templateExt, name: fileName });
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

// --- ADS streams dialog ---
function showStreamsDialog(path, streams) {
  const dlg = document.createElement("dialog");
  dlg.className = "ads-dialog";
  dlg.style.cssText = "border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--bg-1);color:var(--text-1);max-width:500px;";
  let listHtml = streams.length
    ? streams.map(s => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
        <span style="cursor:pointer;text-decoration:underline" data-stream="${esc(s)}">${esc(s)}</span>
        <button class="dialog-btn danger" data-del="${esc(s)}" style="font-size:11px">Delete</button>
      </div>`).join("")
    : "<div style='color:var(--text-3);padding:8px'>No alternate data streams found.</div>";
  dlg.innerHTML = `<h3 style="margin:0 0 8px;font-size:14px">Alternate Data Streams</h3>
    <div style="font-size:11px;color:var(--text-3);margin-bottom:8px">${esc(path)}</div>
    <div style="max-height:300px;overflow:auto">${listHtml}</div>
    <div style="margin-top:12px;text-align:right">
      <button class="dialog-btn" id="ads-close">Close</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector("#ads-close").onclick = () => { dlg.close(); dlg.remove(); };
  dlg.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      const stream = btn.dataset.del;
      try {
        await call("delete_ads", { path, stream });
        btn.closest("div[style]").remove();
        showNotice("Stream deleted");
      } catch(e) { alert("Delete stream failed: " + e); }
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
      } catch(e) { alert("Read stream failed: " + e); }
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
    { value: "", label: "None (Default)" },
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
    <h3 style="margin:0 0 12px;font-size:14px">Compatibility Settings</h3>
    <div style="font-size:11px;color:var(--text-3);margin-bottom:8px;word-break:break-all;">${esc(path)}</div>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;">Compatibility Mode:
      <select id="compat-mode" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;">
        ${modes.map(m => `<option value="${m.value}">${esc(m.label)}</option>`).join("")}
      </select>
    </label>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="dialog-btn" id="compat-cancel">Cancel</button>
      <button class="dialog-btn primary" id="compat-ok">Apply</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector("#compat-cancel").onclick = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector("#compat-ok").onclick = async () => {
    const mode = dlg.querySelector("#compat-mode").value;
    try {
      await call("set_compat_mode", { path, mode });
      showNotice(mode ? "Compatibility mode set" : "Compatibility mode cleared");
    } catch (e) { alert("Failed: " + e); }
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
        <td style="padding:4px 8px;"><button class="dialog-btn" style="font-size:11px;padding:2px 8px;" data-remove-account="${esc(p.account)}">Remove</button></td>
      </tr>
    `).join("");

    dlg.innerHTML = `
      <h3 style="margin:0 0 8px;font-size:14px">Permissions: ${esc(path.split(/[\\/]/).pop())}</h3>
      <div style="font-size:11px;color:var(--text-4);margin-bottom:8px;word-break:break-all;">${esc(path)}</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid var(--border);">
          <th style="text-align:left;padding:4px 8px;font-size:11px;color:var(--text-4);">Account</th>
          <th style="text-align:left;padding:4px 8px;font-size:11px;color:var(--text-4);">Access</th>
          <th style="width:80px;"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;">
        <input type="text" id="perm-account" placeholder="DOMAIN\\User" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:12px;">
        <select id="perm-level" style="padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:12px;">
          <option value="F">Full Control</option>
          <option value="M">Modify</option>
          <option value="RX">Read & Execute</option>
          <option value="R">Read</option>
          <option value="W">Write</option>
        </select>
        <button class="dialog-btn primary" id="perm-add" style="font-size:12px;">Add</button>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="dialog-btn" id="perm-close">Close</button>
        <button class="dialog-btn" id="perm-inherit-toggle">Disable Inheritance</button>
      </div>`;
    document.body.appendChild(dlg);

    dlg.querySelector("#perm-close").onclick = () => { dlg.close(); dlg.remove(); };
    dlg.querySelector("#perm-add").onclick = async () => {
      const account = dlg.querySelector("#perm-account").value.trim();
      const level = dlg.querySelector("#perm-level").value;
      if (!account) return;
      try {
        await call("set_permission", { path, account, permission: level });
        showNotice("Permission added");
        dlg.close(); dlg.remove();
        showPermissionsDialog(path);
      } catch (e) { alert("Failed to set permission: " + e); }
    };
    dlg.querySelectorAll("[data-remove-account]").forEach(btn => {
      btn.onclick = async () => {
        try {
          await call("remove_permission", { path, account: btn.dataset.removeAccount });
          showNotice("Permission removed");
          dlg.close(); dlg.remove();
          showPermissionsDialog(path);
        } catch (e) { alert("Failed to remove permission: " + e); }
      };
    });
    dlg.querySelector("#perm-inherit-toggle").onclick = async () => {
      try {
        await call("inherit_permissions", { path, enable: false });
        showNotice("Inheritance disabled");
        dlg.close(); dlg.remove();
        showPermissionsDialog(path);
      } catch (e) { alert("Failed to toggle inheritance: " + e); }
    };

    dlg.showModal();
    dlg.onclose = () => dlg.remove();
  } catch (e) {
    alert("Failed to get permissions: " + e);
  }
}
