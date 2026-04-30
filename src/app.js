document.addEventListener("contextmenu", e => e.preventDefault());

const invoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;

let tabs = [{ id: 0, path: "C:\\", history: [], historyIdx: -1 }];
let activeTab = 0;
let nextTabId = 1;
let selectedIndices = new Set();
let lastClickedIndex = -1;
let allEntries = [];
let sortField = "name";
let sortAsc = true;
let showHidden = false;
let clipboard = null;

function homeDir(name) {
  const home = process_env("USERPROFILE") || "C:\\Users\\User";
  return home + "\\" + name;
}

function process_env(key) {
  try { return invoke("get_env", { key }); } catch(e) { return null; }
}

async function call(cmd, args = {}) {
  if (invoke) return invoke(cmd, args);
  return fallbackCall(cmd, args);
}

function fallbackCall(cmd, args) {
  const mockFiles = [
    { name:"Documents", path:"C:\\Documents", extension:"", is_dir:true, is_hidden:false, size:0, size_display:"", modified:"2025-12-10 14:22" },
    { name:"Downloads", path:"C:\\Downloads", extension:"", is_dir:true, is_hidden:false, size:0, size_display:"", modified:"2025-12-09 09:15" },
    { name:".gitconfig", path:"C:\\.gitconfig", extension:"gitconfig", is_dir:false, is_hidden:true, size:256, size_display:"256 B", modified:"2025-11-01 08:00" },
    { name:"file1.txt", path:"C:\\file1.txt", extension:"txt", is_dir:false, is_hidden:false, size:1234, size_display:"1.2 KB", modified:"2025-12-08 18:30" },
    { name:"image.png", path:"C:\\image.png", extension:"png", is_dir:false, is_hidden:false, size:567890, size_display:"567.9 KB", modified:"2025-11-20 11:45" },
    { name:"project", path:"C:\\project", extension:"", is_dir:true, is_hidden:false, size:0, size_display:"", modified:"2025-12-07 16:00" },
    { name:"readme.md", path:"C:\\readme.md", extension:"md", is_dir:false, is_hidden:false, size:2048, size_display:"2.0 KB", modified:"2025-12-10 10:30" },
    { name:"archive.zip", path:"C:\\archive.zip", extension:"zip", is_dir:false, is_hidden:false, size:1048576, size_display:"1.0 MB", modified:"2025-06-15 08:00" },
    { name:"config.toml", path:"C:\\config.toml", extension:"toml", is_dir:false, is_hidden:false, size:512, size_display:"512 B", modified:"2025-12-01 20:12" },
    { name:"src", path:"C:\\src", extension:"", is_dir:true, is_hidden:false, size:0, size_display:"", modified:"2025-12-11 07:44" },
    { name:"data.json", path:"C:\\data.json", extension:"json", is_dir:false, is_hidden:false, size:32768, size_display:"32.0 KB", modified:"2025-12-05 13:22" },
    { name:"main.rs", path:"C:\\main.rs", extension:"rs", is_dir:false, is_hidden:false, size:4096, size_display:"4.0 KB", modified:"2025-12-11 09:15" },
    { name:"photo_001.jpg", path:"C:\\photo_001.jpg", extension:"jpg", is_dir:false, is_hidden:false, size:3145728, size_display:"3.0 MB", modified:"2025-10-20 16:00" },
    { name:"video.mp4", path:"C:\\video.mp4", extension:"mp4", is_dir:false, is_hidden:false, size:52428800, size_display:"50.0 MB", modified:"2025-09-05 12:00" },
  ];
  const mockDrives = [
    { letter:"C:", label:"Windows", free:"45.2 GB free / 256.0 GB", path:"C:\\" },
    { letter:"D:", label:"Data", free:"120.5 GB free / 512.0 GB", path:"D:\\" },
  ];
  switch(cmd) {
    case "list_dir": return mockFiles;
    case "get_drives": return mockDrives;
    case "parent_path": return "C:\\";
    case "get_env": return args.key === "USERPROFILE" ? "C:\\Users\\User" : null;
    default: return null;
  }
}

function getTab() { return tabs.find(t => t.id === activeTab); }
function getEntries() { return allEntries; }

function fileIcon(file) {
  if (file.is_dir) return '<svg viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5h4.5L7.5 6h7v7h-13V4.5z" stroke="#dcb67a" stroke-width="1" stroke-linejoin="round"/><path d="M1.5 6.5h13" stroke="#dcb67a" stroke-width=".7" opacity=".5"/></svg>';
  const ext = file.extension.toLowerCase();
  const colors = {
    txt:"#666", md:"#666", rs:"#dea584", py:"#3776ab", js:"#f7df1e", ts:"#3178c6",
    json:"#5b5b5b", toml:"#9c4221", yaml:"#cb171e", xml:"#e37933",
    png:"#28a745", jpg:"#28a745", gif:"#28a745", svg:"#ff9900", webp:"#28a745",
    zip:"#6c757d", rar:"#6c757d", "7z":"#6c757d", tar:"#6c757d", gz:"#6c757d",
    mp3:"#e91e63", wav:"#e91e63", flac:"#e91e63", ogg:"#e91e63",
    mp4:"#9c27b0", mkv:"#9c27b0", avi:"#9c27b0", webm:"#9c27b0",
    pdf:"#d32f2f", doc:"#2b579a", docx:"#2b579a", xls:"#217346", xlsx:"#217346",
    exe:"#0078d4", msi:"#0078d4", dll:"#0078d4",
    html:"#e34c26", css:"#264de4", scss:"#cf649a",
  };
  const c = colors[ext] || "#888";
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M4.5 1.5h4.6l3.4 3.4v9.6a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" stroke="${c}" stroke-width=".9"/><path d="M9 1.5V5h3.5" stroke="${c}" stroke-width=".9"/></svg>`;
}

function renderTabs() {
  const bar = document.getElementById("tab-bar");
  bar.innerHTML = tabs.map(t => `
    <div class="tab ${t.id === activeTab ? 'active' : ''}" onclick="switchTab(${t.id})" onauxclick="if(event.button===1)closeTab(${t.id})">
      <span class="tab-label">${esc(tabName(t.path))}</span>
      <button class="tab-close" onclick="event.stopPropagation();closeTab(${t.id})">&times;</button>
    </div>
  `).join("") + `<button class="tab-new" onclick="addTab()" title="New tab">
    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
  </button>`;
}

function tabName(path) {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function switchTab(id) {
  activeTab = id;
  selectedIndices.clear();
  lastClickedIndex = -1;
  renderTabs();
  navigateTo(getTab().path, false);
}

function addTab(path) {
  path = path || "C:\\";
  const t = { id: nextTabId++, path, history: [path], historyIdx: 0 };
  tabs.push(t);
  activeTab = t.id;
  selectedIndices.clear();
  lastClickedIndex = -1;
  renderTabs();
  navigateTo(path, false);
}

function closeTab(id) {
  if (tabs.length <= 1) return;
  const idx = tabs.findIndex(t => t.id === id);
  tabs.splice(idx, 1);
  if (activeTab === id) {
    activeTab = tabs[Math.min(idx, tabs.length - 1)].id;
    selectedIndices.clear();
    renderTabs();
    navigateTo(getTab().path, false);
  } else {
    renderTabs();
  }
}

function renderBreadcrumb(path) {
  const bc = document.getElementById("breadcrumb");
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  let html = "";
  let accumulated = "";
  parts.forEach((part, i) => {
    accumulated += (i === 0 ? "" : "/") + part;
    const fullPath = i === 0 ? part + "\\" : accumulated.replace(/\//g, "\\");
    html += `<span class="bc-item" onclick="navigateTo('${esc(fullPath)}')">${esc(part)}</span>`;
    if (i < parts.length - 1) html += `<span class="bc-sep">\u203a</span>`;
  });
  bc.innerHTML = html;
}

function sortEntries(entries) {
  const dir = sortAsc ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    let va, vb;
    switch(sortField) {
      case "name": va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
      case "modified": va = a.modified; vb = b.modified; break;
      case "type": va = (a.is_dir ? "0" : "1" + a.extension.toLowerCase()); vb = (b.is_dir ? "0" : "1" + b.extension.toLowerCase()); break;
      case "size": va = a.size; vb = b.size; break;
      default: va = a.name.toLowerCase(); vb = b.name.toLowerCase();
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function updateSortArrows() {
  document.querySelectorAll(".col").forEach(col => {
    col.classList.toggle("sort-active", col.dataset.sort === sortField);
    const arrow = col.querySelector(".sort-arrow");
    if (arrow) arrow.textContent = col.dataset.sort === sortField ? (sortAsc ? "\u25b2" : "\u25bc") : "";
  });
}

function sortBy(field) {
  if (sortField === field) { sortAsc = !sortAsc; }
  else { sortField = field; sortAsc = true; }
  updateSortArrows();
  renderFiles();
}

function toggleSort() {
  const fields = ["name", "modified", "type", "size"];
  const idx = fields.indexOf(sortField);
  sortField = fields[(idx + 1) % fields.length];
  sortAsc = true;
  updateSortArrows();
  renderFiles();
}

function toggleHidden() {
  showHidden = !showHidden;
  document.getElementById("btn-hidden").classList.toggle("active-toggle", showHidden);
  navigateTo(getTab().path, false);
}

async function navigateTo(path, pushHistory = true) {
  const filter = document.getElementById("filter-input").value;
  try {
    let entries = await call("list_dir", { path, filter: "" });
    if (!showHidden) entries = entries.filter(e => !e.is_hidden);
    if (filter) {
      const lower = filter.toLowerCase();
      entries = entries.filter(e => e.name.toLowerCase().includes(lower));
    }
    allEntries = sortEntries(entries);

    const tab = getTab();
    if (pushHistory && path !== tab.path) {
      tab.history = tab.history.slice(0, tab.historyIdx + 1);
      tab.history.push(path);
      tab.historyIdx = tab.history.length - 1;
    }
    tab.path = path;

    selectedIndices.clear();
    lastClickedIndex = -1;
    document.getElementById("path-input").value = path;
    renderBreadcrumb(path);
    renderFiles();
    updateStatus();
    updateSidebarSelection();
  } catch(e) {
    document.getElementById("status-count").textContent = "Error: " + e;
  }
}

async function refresh() { await navigateTo(getTab().path, false); }

async function goUp() {
  try {
    const parent = await call("parent_path", { path: getTab().path });
    await navigateTo(parent);
  } catch(e) {}
}

async function goBack() {
  const tab = getTab();
  if (tab.historyIdx <= 0) return;
  tab.historyIdx--;
  await navigateTo(tab.history[tab.historyIdx], false);
}

async function goForward() {
  const tab = getTab();
  if (tab.historyIdx >= tab.history.length - 1) return;
  tab.historyIdx++;
  await navigateTo(tab.history[tab.historyIdx], false);
}

function applyFilter() { navigateTo(getTab().path, false); }

function renderFiles() {
  const list = document.getElementById("file-list");
  list.innerHTML = "";

  allEntries.forEach((file, i) => {
    const row = document.createElement("div");
    const isSelected = selectedIndices.has(i);
    const isCut = clipboard && clipboard.op === "cut" && clipboard.paths.has(file.path);
    row.className = "file-row" + (file.is_dir ? " dir" : "") + (isSelected ? " selected" : "") + (isCut ? " cut-item" : "");
    row.dataset.index = i;
    row.dataset.path = file.path;

    row.addEventListener("click", e => handleRowClick(e, i));
    row.addEventListener("dblclick", () => {
      if (file.is_dir) navigateTo(file.path);
    });
    row.addEventListener("contextmenu", e => {
      e.preventDefault();
      if (!selectedIndices.has(i)) {
        selectedIndices.clear();
        selectedIndices.add(i);
        lastClickedIndex = i;
        renderFiles();
      }
      showContextMenu(e.clientX, e.clientY);
    });
    row.draggable = true;
    row.addEventListener("dragstart", e => {
      if (!selectedIndices.has(i)) { selectedIndices.clear(); selectedIndices.add(i); renderFiles(); }
      e.dataTransfer.setData("text/plain", JSON.stringify([...selectedIndices].map(idx => allEntries[idx].path)));
    });

    row.innerHTML = `
      <div class="row-name">
        <span class="row-icon">${fileIcon(file)}</span>
        <span class="row-fname">${esc(file.name)}</span>
      </div>
      <div class="row-date">${esc(file.modified)}</div>
      <div class="row-type">${esc(file.is_dir ? "File folder" : file.extension.toUpperCase() || "File")}</div>
      <div class="row-size">${esc(file.size_display)}</div>
    `;
    list.appendChild(row);
  });
}

function handleRowClick(e, index) {
  if (e.ctrlKey) {
    if (selectedIndices.has(index)) selectedIndices.delete(index);
    else selectedIndices.add(index);
    lastClickedIndex = index;
  } else if (e.shiftKey && lastClickedIndex >= 0) {
    const start = Math.min(lastClickedIndex, index);
    const end = Math.max(lastClickedIndex, index);
    selectedIndices.clear();
    for (let i = start; i <= end; i++) selectedIndices.add(i);
  } else {
    selectedIndices.clear();
    selectedIndices.add(index);
    lastClickedIndex = index;
  }
  renderFiles();
  updateStatus();
}

function updateStatus() {
  const count = allEntries.length;
  let txt = `${count} item${count !== 1 ? "s" : ""}`;
  if (selectedIndices.size > 0) {
    const sel = [...selectedIndices].map(i => allEntries[i]).filter(Boolean);
    const dirs = sel.filter(f => f.is_dir).length;
    const files = sel.filter(f => !f.is_dir).length;
    const totalSize = sel.reduce((s, f) => s + f.size, 0);
    let parts = [];
    if (dirs) parts.push(`${dirs} folder${dirs > 1 ? "s" : ""}`);
    if (files) parts.push(`${files} file${files > 1 ? "s" : ""}`);
    if (totalSize > 0) parts.push(formatSize(totalSize));
    txt += " \u00b7 " + parts.join(", ");
  }
  document.getElementById("status-count").textContent = txt;
  document.getElementById("status-selection").textContent = "";
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1073741824).toFixed(1) + " GB";
}

function updateSidebarSelection() {
  document.querySelectorAll(".sidebar-item").forEach(el => {
    el.classList.remove("selected");
  });
}

function scrollToIndex(index) {
  const row = document.querySelector(`.file-row[data-index="${index}"]`);
  if (row) row.scrollIntoView({ block: "nearest" });
}

function getSelectedPaths() {
  return [...selectedIndices].map(i => allEntries[i]).filter(Boolean);
}

async function deleteSelected() {
  const sel = getSelectedPaths();
  if (!sel.length) return;
  const msg = sel.length === 1 ? `Delete "${sel[0].name}"?` : `Delete ${sel.length} items?`;
  if (!confirm(msg)) return;
  try {
    for (const f of sel) await call("delete_file", { path: f.path });
    await refresh();
  } catch(e) { alert("Delete failed: " + e); }
}

async function renamePrompt() {
  const sel = getSelectedPaths();
  if (sel.length !== 1) return;
  const newName = prompt("Rename:", sel[0].name);
  if (!newName || newName === sel[0].name) return;
  try { await call("rename_file", { path: sel[0].path, newName }); await refresh(); }
  catch(e) { alert("Rename failed: " + e); }
}

async function newFolder() {
  try { await call("new_folder", { parent: getTab().path }); await refresh(); }
  catch(e) { alert("New folder failed: " + e); }
}

async function copySelected() {
  const sel = getSelectedPaths();
  if (!sel.length) return;
  clipboard = { op: "copy", paths: new Set(sel.map(f => f.path)) };
  updateStatus();
}

async function cutSelected() {
  const sel = getSelectedPaths();
  if (!sel.length) return;
  clipboard = { op: "cut", paths: new Set(sel.map(f => f.path)) };
  renderFiles();
}

async function paste() {
  if (!clipboard) return;
  try {
    for (const srcPath of clipboard.paths) {
      if (clipboard.op === "cut") {
        await call("move_path", { src: srcPath, dest: getTab().path });
      } else {
        await call("copy_path", { src: srcPath, dest: getTab().path });
      }
    }
    if (clipboard.op === "cut") clipboard = null;
    await refresh();
  } catch(e) { alert("Paste failed: " + e); }
}

function showContextMenu(x, y) {
  removeContextMenu();
  const sel = getSelectedPaths();
  const hasSelection = sel.length > 0;
  const singleSelection = sel.length === 1;

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${x}px;top:${y}px;`;

  const items = [
    { label:"Open", shortcut:"Enter", action: () => { if (singleSelection && sel[0].is_dir) navigateTo(sel[0].path); }, disabled: !singleSelection },
    { label:"-", action: null },
    { label:"Cut", shortcut:"Ctrl+X", action: cutSelected, disabled: !hasSelection },
    { label:"Copy", shortcut:"Ctrl+C", action: copySelected, disabled: !hasSelection },
    { label:"Paste", shortcut:"Ctrl+V", action: paste, disabled: !clipboard },
    { label:"-", action: null },
    { label:"Rename", shortcut:"F2", action: renamePrompt, disabled: !singleSelection },
    { label:"Delete", shortcut:"Del", action: deleteSelected, disabled: !hasSelection },
    { label:"-", action: null },
    { label:"New Folder", shortcut:"F7", action: newFolder },
    { label:"Select All", shortcut:"Ctrl+A", action: selectAll },
    { label:"-", action: null },
    { label: showHidden ? "Hide hidden items" : "Show hidden items", action: toggleHidden },
  ];

  items.forEach(item => {
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

function selectAll() {
  selectedIndices.clear();
  allEntries.forEach((_, i) => selectedIndices.add(i));
  renderFiles();
  updateStatus();
}

let contextMenu = null;
function removeContextMenu() { if (contextMenu) { contextMenu.remove(); contextMenu = null; } }
document.addEventListener("click", e => { if (contextMenu && !contextMenu.contains(e.target)) removeContextMenu(); });

document.addEventListener("keydown", async e => {
  if (e.target.tagName === "INPUT") {
    if (e.key === "Escape") e.target.blur();
    return;
  }
  const entries = allEntries;
  const indices = [...selectedIndices];
  const focusedIndex = indices.length ? indices[indices.length - 1] : -1;

  switch(e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (focusedIndex < entries.length - 1) {
        selectedIndices.clear(); selectedIndices.add(focusedIndex < 0 ? 0 : focusedIndex + 1);
        lastClickedIndex = focusedIndex < 0 ? 0 : focusedIndex + 1;
      }
      renderFiles(); updateStatus(); scrollToIndex(lastClickedIndex); break;
    case "ArrowUp":
      e.preventDefault();
      if (focusedIndex > 0) {
        selectedIndices.clear(); selectedIndices.add(focusedIndex - 1);
        lastClickedIndex = focusedIndex - 1;
      }
      renderFiles(); updateStatus(); scrollToIndex(lastClickedIndex); break;
    case "Enter":
      e.preventDefault();
      if (indices.length === 1 && entries[focusedIndex]?.is_dir) await navigateTo(entries[focusedIndex].path);
      break;
    case "Backspace": e.preventDefault(); await goUp(); break;
    case "Delete": e.preventDefault(); await deleteSelected(); break;
    case "F2": e.preventDefault(); await renamePrompt(); break;
    case "F5": e.preventDefault(); await refresh(); break;
    case "F7": e.preventDefault(); await newFolder(); break;
    case "Home": e.preventDefault(); selectedIndices.clear(); selectedIndices.add(0); lastClickedIndex = 0; renderFiles(); scrollToIndex(0); break;
    case "End": e.preventDefault(); selectedIndices.clear(); selectedIndices.add(entries.length-1); lastClickedIndex = entries.length-1; renderFiles(); scrollToIndex(lastClickedIndex); break;
    default:
      if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); await goBack(); }
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); await goForward(); }
      if (e.ctrlKey && e.key === "c" && !e.shiftKey) { e.preventDefault(); await copySelected(); }
      if (e.ctrlKey && e.key === "x") { e.preventDefault(); await cutSelected(); }
      if (e.ctrlKey && e.key === "v") { e.preventDefault(); await paste(); }
      if (e.ctrlKey && e.key === "a") { e.preventDefault(); selectAll(); }
      if (e.ctrlKey && e.key === "t") { e.preventDefault(); addTab(); }
      if (e.ctrlKey && e.key === "w") { e.preventDefault(); closeTab(activeTab); }
      if (e.ctrlKey && e.key === "h") { e.preventDefault(); toggleHidden(); }
      break;
  }
});

document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", async e => {
  e.preventDefault();
  try {
    const data = e.dataTransfer.getData("text/plain");
    if (data) {
      const paths = JSON.parse(data);
      const dest = getTab().path;
      for (const src of paths) {
        const srcPath = await call("parent_path", { path: src });
        if (srcPath !== dest) await call("move_path", { src, dest });
      }
      await refresh();
    }
  } catch(ex) {}
});

async function loadDrives() {
  try {
    const drives = await call("get_drives");
    const list = document.getElementById("drives-list");
    list.innerHTML = drives.map(d => `
      <div class="drive-item" onclick="navigateTo('${esc(d.path)}')">
        <div class="drive-name">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="8" rx="1.5" stroke="currentColor" stroke-width=".9"/><circle cx="11.5" cy="8" r="1" fill="currentColor" opacity=".4"/></svg>
          ${esc(d.label)} (${esc(d.letter)})
        </div>
        <div class="drive-info">${esc(d.free)}</div>
      </div>
    `).join("");
  } catch(e) {}
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

async function init() {
  const home = await call("get_env", { key: "USERPROFILE" }).catch(() => null);
  const startPath = home || "C:\\";
  tabs[0].path = startPath;
  tabs[0].history = [startPath];
  tabs[0].historyIdx = 0;
  renderTabs();
  updateSortArrows();
  await navigateTo(startPath, false);
  await loadDrives();
}

init();
