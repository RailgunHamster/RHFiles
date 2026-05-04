// sidebar.js — sidebar tree, drives, tag list

// --- directory tree ---
async function loadTree(path, expand) {
  const tree = document.getElementById("dir-tree");
  try {
    const children = await call("get_dir_tree", { path });
    renderTreeNode(tree, children, path, expand);
  } catch (e) {}
}

function renderTreeNode(container, children, parentPath, expand) {
  const existing = Array.from(container.querySelectorAll("[data-tpath]")).find(el => el.dataset.tpath === parentPath) || null;
  let node;
  if (existing) {
    node = existing;
    const childContainer = node.querySelector(".tree-children");
    if (childContainer) {
      childContainer.innerHTML = "";
      children.forEach(c => renderTreeItem(childContainer, c, (parseInt(node.dataset.depth) || 0) + 1));
      childContainer.classList.add("open");
    }
    node.querySelector(".tree-arrow").classList.add("expanded");
    node.querySelector(".tree-arrow").classList.remove("empty");
  } else {
    node = document.createElement("div");
    node.className = "tree-node";
    node.dataset.tpath = parentPath;
    node.dataset.depth = "0";
    node.innerHTML = `<div class="tree-row" style="padding-left:0px">
      <span class="tree-arrow ${expand?'expanded':''}">\u25b6</span>
      <svg class="tree-icon" width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5h4.5L7.5 6h7v7h-13V4.5z" stroke="#dcb67a" stroke-width="1"/></svg>
      <span class="tree-name">${esc(parentPath.split('\\').filter(Boolean).pop() || parentPath)}</span>
    </div>
    <div class="tree-children ${expand?'open':''}"></div>`;
    const childContainer = node.querySelector(".tree-children");
    children.forEach(c => renderTreeItem(childContainer, c, 1));
    const row = node.querySelector(".tree-row");
    row.addEventListener("click", e => {
      e.stopPropagation();
      navigateTo(parentPath);
      const childrenDiv = node.querySelector(".tree-children");
      const arrow = node.querySelector(".tree-arrow");
      if (childrenDiv.classList.contains("open")) {
        childrenDiv.classList.remove("open");
        arrow.classList.remove("expanded");
      } else {
        childrenDiv.classList.add("open");
        arrow.classList.add("expanded");
        loadTree(parentPath, true);
      }
    });
    container.appendChild(node);
  }
}

function renderTreeItem(container, entry, depth) {
  depth = depth || 0;
  const div = document.createElement("div");
  div.className = "tree-row";
  div.style.paddingLeft = (depth * 16) + "px";
  div.dataset.depth = depth;
  div.innerHTML = `
    <span class="tree-arrow ${entry.has_children ? '' : 'empty'}">\u25b6</span>
    <svg class="tree-icon" width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5h4.5L7.5 6h7v7h-13V4.5z" stroke="#dcb67a" stroke-width="1"/></svg>
    <span class="tree-name">${esc(entry.name)}</span>
  `;
  const childrenDiv = document.createElement("div");
  childrenDiv.className = "tree-children";
  div.appendChild(childrenDiv);

  div.addEventListener("click", async e => {
    e.stopPropagation();
    navigateTo(entry.path);
    const arrow = div.querySelector(".tree-arrow");
    if (childrenDiv.classList.contains("open")) {
      childrenDiv.classList.remove("open");
      arrow.classList.remove("expanded");
    } else {
      if (entry.has_children) {
        try {
          const kids = await call("get_dir_tree", { path: entry.path });
          childrenDiv.innerHTML = "";
          kids.forEach(k => renderTreeItem(childrenDiv, k, depth + 1));
        } catch (ex) {}
      }
      childrenDiv.classList.add("open");
      arrow.classList.add("expanded");
    }
  });
  container.appendChild(div);
}

// --- drives ---
async function loadDrives() {
  try {
    const drives = await call("get_drives");
    const list = document.getElementById("drives-list");
    list.innerHTML = "";
    for (const d of drives) {
      const div = document.createElement("div");
      div.className = "drive-item";
      div.dataset.path = d.path;
      div.dataset.label = d.label;
      div.dataset.letter = d.letter;
      div.innerHTML = `<div class="drive-name">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="8" rx="1.5" stroke="currentColor" stroke-width=".9"/><circle cx="11.5" cy="8" r="1" fill="currentColor" opacity=".4"/></svg>
          ${esc(d.label)} (${esc(d.letter)})
        </div>
        <div class="drive-info">${esc(d.free)}</div>`;
      div.addEventListener("click", () => navigateTo(d.path));
      div.addEventListener("contextmenu", e => showDriveContextMenu(e, d.path, d.label, d.letter));
      list.appendChild(div);
    }
  } catch (e) {}
}

function showDriveContextMenu(e, path, label, letter) {
  e.preventDefault();
  e.stopPropagation();
  removeContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;`;
  const items = [
    { label: "Open", action: () => navigateTo(path) },
    { label: "Properties", action: () => showPropertiesDialog(path) },
    { label: "-", action: null },
    { label: "Format...", action: () => showFormatDialog(letter, label) },
  ];
  items.forEach(item => {
    if (item.label === "-") {
      const sep = document.createElement("div"); sep.className = "ctx-sep"; menu.appendChild(sep);
    } else {
      const mi = document.createElement("div");
      mi.className = "ctx-item";
      mi.innerHTML = `<span>${esc(item.label)}</span>`;
      mi.addEventListener("click", () => { removeContextMenu(); if (item.action) item.action(); });
      menu.appendChild(mi);
    }
  });
  document.body.appendChild(menu);
  contextMenu = menu;
}

function showFormatDialog(letter, label) {
  const dlg = document.createElement("dialog");
  dlg.style.cssText = "border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--bg-1);color:var(--text-1);min-width:320px;";
  dlg.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:14px">Format Drive ${esc(letter)}</h3>
    <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
      <label style="display:flex;align-items:center;gap:8px;">Volume Label: <input id="fmt-label" type="text" value="${esc(label)}" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;"></label>
      <label style="display:flex;align-items:center;gap:8px;">File System:
        <select id="fmt-fs" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;">
          <option value="NTFS" selected>NTFS</option>
          <option value="FAT32">FAT32</option>
          <option value="exFAT">exFAT</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="fmt-quick" checked> Quick Format</label>
    </div>
    <div style="margin-top:12px;color:var(--git-deleted);font-size:11px;">Warning: This will erase all data on the drive!</div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="dialog-btn" id="fmt-cancel">Cancel</button>
      <button class="dialog-btn" style="background:var(--git-deleted);color:#fff;" id="fmt-ok">Format</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector("#fmt-cancel").onclick = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector("#fmt-ok").onclick = async () => {
    const label = dlg.querySelector("#fmt-label").value;
    const fs = dlg.querySelector("#fmt-fs").value;
    const quick = dlg.querySelector("#fmt-quick").checked;
    if (!confirm(`Format drive ${letter}: as ${fs}? All data will be lost!`)) return;
    try {
      await call("format_drive", { drive: letter, label, fs, quick });
      showNotice("Drive formatted successfully");
      await loadDrives();
    } catch (e) { alert("Format failed: " + e); }
    dlg.close(); dlg.remove();
  };
  dlg.showModal();
  dlg.onclose = () => dlg.remove();
}

// --- tags list in sidebar ---
async function loadTagList() {
  try {
    const allTags = await call("db_load_all_tags", {});
    if (allTags) G.tagCache = allTags;
    const list = document.getElementById("tag-list");
    if (!allTags || !Object.keys(allTags).length) {
      list.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">No tags</div>';
      return;
    }
    const tagMap = {};
    for (const [path, tags] of Object.entries(allTags)) {
      for (const tag of tags) {
        if (!tagMap[tag]) tagMap[tag] = [];
        tagMap[tag].push(path);
      }
    }
    list.innerHTML = Object.keys(tagMap).map((tag, idx) =>
      `<span class="tag-pill" data-tag="${esc(tag)}" style="background:${tagColor(idx)}22;color:${tagColor(idx)}" title="${tagMap[tag].length} files">${esc(tag)}</span>`
    ).join("");
    list.querySelectorAll(".tag-pill").forEach(el => {
      el.addEventListener("click", () => navigateToTagFiles(el.dataset.tag));
    });
  } catch (e) {}
}

async function navigateToTagFiles(tag) {
  try {
    const allTags = G.tagCache;
    if (!allTags) return;
    const matchingPaths = [];
    for (const [path, tags] of Object.entries(allTags)) {
      if (tags.includes(tag)) matchingPaths.push(path);
    }
    if (!matchingPaths.length) return;
    const firstPath = matchingPaths[0];
    const parentDir = firstPath.split("\\").slice(0, -1).join("\\") || firstPath;
    const fileName = firstPath.split("\\").pop();
    await navigateTo(parentDir);
    const tab = getTab();
    const idx = tab.entries.findIndex(e => e.name === fileName);
    if (idx >= 0) {
      tab.sel.clear();
      tab.sel.add(idx);
      tab.lastIdx = idx;
      renderFiles(tab, "file-list", "status-count", "status-selection");
      updatePreviewForSelection();
    }
  } catch (e) {}
}

function updateSidebarSelection() {
  document.querySelectorAll(".sidebar-item,.tree-row").forEach(el => el.classList.remove("selected"));
  const currentPath = (G.lastActivePane === 'right' ? G.rp : getTab()).path;
  document.querySelectorAll(".tree-row").forEach(el => {
    const nameEl = el.querySelector(".tree-name");
    if (nameEl) {
      const row = el.closest("[data-tpath]");
      if (row && row.dataset.tpath === currentPath) el.classList.add("selected");
    }
  });
}

// --- quick access pinning ---
let _pinnedFolders = [];

async function loadPinnedFolders() {
  try {
    const data = await call("db_load_pinned", {});
    _pinnedFolders = (data || []).map(([path, name]) => ({ path, name }));
  } catch (e) {
    try { _pinnedFolders = JSON.parse(localStorage.getItem('rhfiles-pinned') || '[]'); } catch(e2) { _pinnedFolders = []; }
  }
  renderPinnedFolders();
}

function getPinnedFolders() {
  return _pinnedFolders;
}

async function pinFolder(path, name) {
  if (_pinnedFolders.find(p => p.path === path)) return;
  _pinnedFolders.push({ path, name: name || path.split("\\").pop() });
  try { await call("db_save_pinned", { paths: _pinnedFolders.map(p => [p.path, p.name]) }); } catch (e) {}
  renderPinnedFolders();
}

async function unpinFolder(path) {
  _pinnedFolders = _pinnedFolders.filter(p => p.path !== path);
  try { await call("db_save_pinned", { paths: _pinnedFolders.map(p => [p.path, p.name]) }); } catch (e) {}
  renderPinnedFolders();
}

function renderPinnedFolders() {
  const pinned = _pinnedFolders;
  let container = document.getElementById("pinned-list");
  if (!container) {
    const qaSection = document.querySelector(".sidebar-section[data-section='quickAccess']") ||
      document.getElementById("quick-access-section");
    if (qaSection) {
      container = document.createElement("div");
      container.id = "pinned-list";
      container.style.cssText = "padding:0 4px;";
      qaSection.appendChild(container);
    }
  }
  if (!container) return;
  container.innerHTML = "";
  for (const p of pinned) {
    const div = document.createElement("div");
    div.className = "sidebar-item pinned-item";
    div.dataset.path = p.path;
    div.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1l2 4.5H15l-3.8 3 1.4 4.7L8 10.5 3.4 13.2l1.4-4.7L1 5.5h5z" fill="#e8b130" stroke="#c99820" stroke-width=".5"/></svg> ' + esc(p.name);
    div.addEventListener("click", () => navigateTo(p.path));
    div.addEventListener("contextmenu", e => showSidebarContextMenu(e, p.path, p.name));
    container.appendChild(div);
  }
}

function showSidebarContextMenu(e, path, name) {
  e.preventDefault();
  e.stopPropagation();
  removeContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;`;
  const items = [
    { label: "Open", action: () => navigateTo(path) },
    { label: "Unpin from Quick Access", action: () => unpinFolder(path) },
    { label: "Properties", action: () => showPropertiesDialog(path) },
  ];
  items.forEach(item => {
    const mi = document.createElement("div");
    mi.className = "ctx-item";
    mi.innerHTML = `<span>${esc(item.label)}</span>`;
    mi.addEventListener("click", () => { removeContextMenu(); if (item.action) item.action(); });
    menu.appendChild(mi);
  });
  document.body.appendChild(menu);
  contextMenu = menu;
}

// --- cloud storage providers ---
async function loadCloudProviders() {
  const section = document.getElementById("cloud-section");
  const list = document.getElementById("cloud-list");
  if (!section || !list) return;
  try {
    const providers = await call("get_cloud_providers", {});
    if (!providers || providers.length === 0) {
      section.style.display = "none";
      return;
    }
    section.style.display = "";
    list.innerHTML = "";
    for (const p of providers) {
      const div = document.createElement("div");
      div.className = "sidebar-item cloud-item";
      div.dataset.path = p.path;
      div.dataset.name = p.name;
      div.dataset.id = p.id;
      const iconSvg = getCloudIcon(p.name);
      div.innerHTML = iconSvg + ' <span>' + esc(p.name) + '</span>';
      div.addEventListener("click", () => navigateTo(p.path));
      div.addEventListener("contextmenu", e => showCloudContextMenu(e, p));
      list.appendChild(div);
    }
  } catch (e) {
    section.style.display = "none";
  }
}

function getCloudIcon(name) {
  const n = name.toLowerCase();
  if (n.includes("onedrive")) {
    return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6.5 4C7.3 2.2 9 1 11 1c2.5 0 4.5 2 4.5 4.5 0 .3 0 .5-.1.8C16.3 6.8 17 8 17 9.5 17 11.4 15.4 13 13.5 13H4C2.3 13 1 11.7 1 10c0-1.5 1-2.7 2.4-3C3.1 6.2 3 5.4 3 4.5 3 2.8 4.3 1.5 6 1.5c.2 0 .3 0 .5.03" stroke="#0078d4" stroke-width="1" fill="none" transform="scale(0.8) translate(1,1)"/></svg>';
  }
  if (n.includes("google")) {
    return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2a6 6 0 0 1 5.2 3H8a3 3 0 0 0-2.6 1.5L3.4 3.5A6 6 0 0 1 8 2zM2.8 4.5L4.8 8l-2 3.5A6 6 0 0 1 2 8c0-1.3.3-2.5.8-3.5zM8 14a6 6 0 0 1-5.2-3h4.4a3 3 0 0 0 2.6-1.5l2 3A6 6 0 0 1 8 14z" fill="#4285f4" transform="scale(0.85) translate(1,1)"/></svg>';
  }
  if (n.includes("dropbox")) {
    return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 2l-3 2.5L4 7l3-2.5L4 2zM12 2L9 4.5 12 7l3-2.5L12 2zM1 9l3 2.5L7 9l-3-2.5L1 9zM9 9l3 2.5L15 9l-3-2.5L9 9zM4 12.5L7 15l3-2.5L7 10 4 12.5z" fill="#0061ff" transform="scale(0.85) translate(1,1)"/></svg>';
  }
  return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 5a4 4 0 0 1 7.5-1A3.5 3.5 0 0 1 14 7.5 3.5 3.5 0 0 1 10.5 11h-7A3.5 3.5 0 0 1 0 7.5C0 5.7 1.3 4.2 3 4" stroke="currentColor" stroke-width="1" fill="none" transform="translate(1,2)"/></svg>';
}

function showCloudContextMenu(e, provider) {
  e.preventDefault();
  e.stopPropagation();
  removeContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = "left:" + e.clientX + "px;top:" + e.clientY + "px;";
  const items = [
    { label: "Open", action: () => navigateTo(provider.path) },
    { label: "Pin to Quick Access", action: () => pinFolder(provider.path, provider.name) },
    { label: "Properties", action: () => showPropertiesDialog(provider.path) },
  ];
  items.forEach(item => {
    const mi = document.createElement("div");
    mi.className = "ctx-item";
    mi.innerHTML = '<span>' + esc(item.label) + '</span>';
    mi.addEventListener("click", () => { removeContextMenu(); if (item.action) item.action(); });
    menu.appendChild(mi);
  });
  document.body.appendChild(menu);
  contextMenu = menu;
}

// --- WSL & library detection ---
async function detectWSLDistros() {
  try {
    const drives = await call("get_drives");
    const wslBase = "\\\\wsl$\\";
    const list = document.getElementById("wsl-list");
    if (!list) return;
    let container = list.parentElement;
    if (!container) return;
    const distros = drives ? [] : [];
    try {
      const entries = await call("list_dir", { path: wslBase, filter: "" });
      if (entries && entries.length) {
        container.style.display = "";
        list.innerHTML = "";
        for (const d of entries.filter(e => e.is_dir)) {
          const div = document.createElement("div");
          div.className = "sidebar-item";
          div.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width=".8"/><text x="8" y="11" text-anchor="middle" font-size="7" fill="currentColor">W</text></svg> ' + esc(d.name);
          div.addEventListener("click", () => navigateTo(d.path));
          list.appendChild(div);
        }
      }
    } catch (e) { container.style.display = "none"; }
  } catch (e) {}
}

async function detectWindowsLibraries() {
  try {
    const libraries = [
      { name: "Documents", path: "C:\\Users\\User\\Documents" },
      { name: "Pictures", path: "C:\\Users\\User\\Pictures" },
      { name: "Music", path: "C:\\Users\\User\\Music" },
      { name: "Videos", path: "C:\\Users\\User\\Videos" },
    ];
    const env = await call("get_env", { key: "USERPROFILE" });
    const userProfile = env || "C:\\Users\\User";
    const mapped = libraries.map(l => ({
      name: l.name,
      path: userProfile + "\\" + l.name.toLowerCase().replace(/^./, c => c.toUpperCase())
    }));
    let container = document.getElementById("libraries-list");
    if (!container) return;
    container.innerHTML = "";
    for (const l of mapped) {
      const div = document.createElement("div");
      div.className = "sidebar-item";
      div.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 5h5l2 2h5v6H2V5z" stroke="var(--accent)" stroke-width=".8"/></svg> ' + esc(l.name);
      div.addEventListener("click", () => navigateTo(l.path));
      div.addEventListener("contextmenu", e => { e.preventDefault(); e.stopPropagation(); pinFolder(l.path, l.name); });
      container.appendChild(div);
    }
  } catch (e) {}
}

// --- network browsing ---
async function renderNetwork() {
  const section = document.getElementById('network-section');
  if (!section) return;
  section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">Scanning...</div>';
  try {
    const servers = await call("browse_network", {});
    section.innerHTML = '';
    for (const s of servers) {
      const div = document.createElement('div');
      div.className = 'sidebar-item';
      div.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="1" stroke="currentColor" stroke-width=".8"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width=".6"/></svg> ' + esc(s.name);
      div.dataset.path = s.path;
      div.onclick = () => navigateTo(s.path);
      div.oncontextmenu = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const shares = await call("list_shares", { server: s.path });
          showNetworkMenu(e, s, shares);
        } catch (ex) {
          showNetworkMenu(e, s, []);
        }
      };
      section.appendChild(div);
    }
    if (servers.length === 0) {
      section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">No servers found</div>';
    }
  } catch (e) {
    section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">Network unavailable</div>';
  }
}

function showNetworkMenu(e, server, shares) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.cssText = 'left:' + e.clientX + 'px;top:' + e.clientY + 'px;';
  const openItem = document.createElement('div');
  openItem.className = 'ctx-item';
  openItem.innerHTML = '<span>Open \\\\' + esc(server.name) + '</span>';
  openItem.onclick = () => { removeContextMenu(); navigateTo(server.path); };
  menu.appendChild(openItem);
  if (shares.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'ctx-sep';
    menu.appendChild(sep);
    for (const sh of shares) {
      const item = document.createElement('div');
      item.className = 'ctx-item';
      item.innerHTML = '<span>' + esc(sh.name) + '</span>';
      item.onclick = () => { removeContextMenu(); navigateTo(sh.path); };
      menu.appendChild(item);
    }
  }
  document.body.appendChild(menu);
  contextMenu = menu;
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (e.clientX - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (e.clientY - rect.height) + 'px';
  });
}

// --- FTP ---
function showFtpDialog() {
  const dlg = document.createElement('dialog');
  dlg.style.cssText = 'border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--bg-1);color:var(--text-1);min-width:340px;';
  dlg.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:14px">Connect to FTP Server</h3>
    <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
      <div class="dialog-row"><label>Host:</label><input type="text" id="ftp-host" placeholder="ftp.example.com" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;"></div>
      <div class="dialog-row"><label>Path:</label><input type="text" id="ftp-path" value="/" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;"></div>
      <div class="dialog-row"><label>User:</label><input type="text" id="ftp-user" placeholder="anonymous" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;"></div>
      <div class="dialog-row"><label>Password:</label><input type="password" id="ftp-pass" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;"></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="dialog-btn" id="ftp-cancel">Cancel</button>
      <button class="dialog-btn primary" id="ftp-connect">Connect</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('#ftp-cancel').onclick = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector('#ftp-connect').onclick = async () => {
    const host = dlg.querySelector('#ftp-host').value.trim();
    const path = dlg.querySelector('#ftp-path').value || '/';
    const user = dlg.querySelector('#ftp-user').value || 'anonymous';
    const pass = dlg.querySelector('#ftp-pass').value;
    if (!host) { alert('Please enter a host'); return; }
    try {
      const entries = await call('ftp_list', { host, path, user, pass });
      dlg.close();
      dlg.remove();
      showFtpEntries(host, path, user, pass, entries);
    } catch (e) {
      alert('FTP connection failed: ' + e);
    }
  };
  dlg.showModal();
  dlg.onclose = () => dlg.remove();
}

async function showFtpEntries(host, path, user, pass, entries) {
  G.ftpConnection = { host, path, user, pass };
  const tab = getTab();
  tab.entries = entries;
  tab.sel.clear();
  tab.lastIdx = -1;
  tab.path = 'ftp://' + host + path;
  document.getElementById('path-input').value = tab.path;
  renderBreadcrumb(tab.path);
  renderFiles(tab, 'file-list', 'status-count', 'status-selection');
  updateStatus(tab, 'status-count', 'status-selection');
}

// --- MTP Devices ---
async function renderMtpDevices() {
  const section = document.getElementById('mtp-section');
  if (!section) return;
  section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">Scanning...</div>';
  try {
    const devices = await call('list_mtp_devices', {});
    section.innerHTML = '';
    for (const d of devices) {
      const div = document.createElement('div');
      div.className = 'sidebar-item';
      div.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="3" y="1" width="10" height="14" rx="1.5" stroke="currentColor" stroke-width=".8"/><circle cx="8" cy="12" r="1" fill="currentColor" opacity=".4"/></svg> ' + esc(d.name);
      div.dataset.path = d.path;
      div.onclick = () => navigateTo(d.path);
      section.appendChild(div);
    }
    if (devices.length === 0) {
      section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">No devices found</div>';
    }
  } catch (e) {
    section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">No devices found</div>';
  }
}
