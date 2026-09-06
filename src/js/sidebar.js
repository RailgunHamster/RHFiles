// sidebar.js — sidebar tree, drives, tag list

// --- directory tree ---
async function loadTree(path, expand) {
  const tree = document.getElementById("dir-tree");
  try {
    const children = await call("get_dir_tree", { path });
    const existing = tree.querySelector(`[data-tpath="${path.replace(/\\/g, "\\\\")}"]`);
    if (existing) {
      const childContainer = existing.querySelector(".tree-children");
      if (childContainer) {
        const wasOpen = childContainer.classList.contains("open");
        childContainer.innerHTML = "";
        children.forEach(c => renderTreeItem(childContainer, c, (parseInt(existing.dataset.depth) || 0) + 1));
        if (wasOpen || expand) {
          childContainer.classList.add("open");
          existing.querySelector(".tree-arrow").classList.add("expanded");
        }
      }
    } else {
      renderTreeNode(tree, children, path, expand);
    }
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
  const wrapper = document.createElement("div");
  wrapper.className = "tree-item";
  wrapper.dataset.tpath = entry.path;
  wrapper.dataset.depth = depth;
  const div = document.createElement("div");
  div.className = "tree-row";
  div.style.paddingLeft = (depth * 16) + "px";
  div.innerHTML = `
    <span class="tree-arrow ${entry.has_children ? '' : 'empty'}">\u25b6</span>
    <svg class="tree-icon" width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5h4.5L7.5 6h7v7h-13V4.5z" stroke="#dcb67a" stroke-width="1"/></svg>
    <span class="tree-name">${esc(entry.name)}</span>
  `;
  wrapper.appendChild(div);
  const childrenDiv = document.createElement("div");
  childrenDiv.className = "tree-children";
  wrapper.appendChild(childrenDiv);

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
          if (childrenDiv.children.length === 0) {
            childrenDiv.innerHTML = "";
            kids.forEach(k => renderTreeItem(childrenDiv, k, depth + 1));
          }
        } catch (ex) {}
      }
      childrenDiv.classList.add("open");
      arrow.classList.add("expanded");
    }
  });
  container.appendChild(wrapper);
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
    { label: t('sidebar.open'), action: () => navigateTo(path) },
    { label: t('ctx.newTab'), action: () => addTab(path) },
    { label: isFavoriteFolder(path) ? t('favorites.remove') : t('favorites.add'), action: () => toggleFavoriteFolder(path, label) },
    { label: "-", action: null },
    { label: t('ctx.properties'), action: () => showPropertiesDialog(path) },
    { label: t('btn.format') + '...', action: () => showFormatDialog(letter, label) },
  ];
  renderMenuItems(menu, items, e.clientX, e.clientY);
  document.body.appendChild(menu);
  _ctxShow(menu);
  requestAnimationFrame(() => clampMenuPosition(menu, e.clientX, e.clientY));
}

function showFormatDialog(letter, label) {
  const dlg = document.createElement("dialog");
  dlg.style.cssText = "border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--bg-1);color:var(--text-1);min-width:320px;";
  dlg.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:14px">${t('dialog.formatDrive', {letter: esc(letter)})}</h3>
    <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
      <label style="display:flex;align-items:center;gap:8px;">${t('dialog.volumeLabel')}: <input id="fmt-label" type="text" value="${esc(label)}" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;"></label>
      <label style="display:flex;align-items:center;gap:8px;">${t('dialog.fileSystem')}:
        <select id="fmt-fs" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;">
          <option value="NTFS" selected>NTFS</option>
          <option value="FAT32">FAT32</option>
          <option value="exFAT">exFAT</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="fmt-quick" checked> ${t('dialog.quickFormat')}</label>
    </div>
    <div style="margin-top:12px;color:var(--git-deleted);font-size:11px;">${t('dialog.formatWarning')}</div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="dialog-btn" id="fmt-cancel">${t('btn.cancel')}</button>
      <button class="dialog-btn" style="background:var(--git-deleted);color:#fff;" id="fmt-ok">${t('btn.format')}</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector("#fmt-cancel").onclick = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector("#fmt-ok").onclick = async () => {
    const label = dlg.querySelector("#fmt-label").value;
    const fs = dlg.querySelector("#fmt-fs").value;
    const quick = dlg.querySelector("#fmt-quick").checked;
    if (!confirm(t('confirm.formatDrive', {letter, fs}))) return;
    try {
      await call("format_drive", { drive: letter, label, fs, quick });
      showNotice(t('notice.driveFormatted'));
      await loadDrives();
    } catch (e) { alert(t('alert.formatFailed', {error: e})); }
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
      list.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">' + t('sidebar.noTags') + '</div>';
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

// --- recent items ---
async function loadRecentList() {
  const list = document.getElementById("recent-list");
  if (!list) return;
  try {
    const items = await call("db_load_recent", { mode: "recent", limit: 15 });
    if (!items || !items.length) {
      list.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">' + t('sidebar.noRecent') + '</div>';
      return;
    }
    list.innerHTML = "";
    for (const item of items) {
      const div = document.createElement("div");
      div.className = "sidebar-item recent-item";
      div.dataset.path = item.path;
      const folderIcon = item.is_dir
        ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1 4h5l2 2h7v7H1z" stroke="currentColor" stroke-width=".8" fill="none"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="3" y="1" width="10" height="14" rx="1" stroke="currentColor" stroke-width=".8" fill="none"/><path d="M6 5h4M6 7h4M6 9h3" stroke="currentColor" stroke-width=".6"/></svg>';
      div.innerHTML = folderIcon + ' ' + esc(item.name);
      div.title = item.path + "\n" + formatTimeAgo(item.last_accessed) + (item.access_count > 1 ? " \u00b7 " + item.access_count + "x" : "");
      div.addEventListener("click", () => {
        if (item.is_dir) {
          navigateTo(item.path);
        } else {
          const parentDir = item.path.split("\\").slice(0, -1).join("\\") || item.path;
          const fileName = item.path.split("\\").pop();
          navigateTo(parentDir).then(() => {
            const tab = getTab();
            const idx = tab.entries.findIndex(e => e.name === fileName);
            if (idx >= 0) {
              tab.sel.clear();
              tab.sel.add(idx);
              tab.lastIdx = idx;
              renderFiles(tab, "file-list", "status-count", "status-selection");
              updatePreviewForSelection();
            }
          });
        }
      });
      div.addEventListener("contextmenu", e => showRecentContextMenu(e, item));
      list.appendChild(div);
    }
  } catch (e) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">' + t('sidebar.noRecent') + '</div>';
  }
}

function formatTimeAgo(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('time.justNow');
    if (mins < 60) return t('time.minAgo', {count: mins});
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('time.hAgo', {count: hrs});
    const days = Math.floor(hrs / 24);
    if (days === 1) return t('time.yesterday');
    if (days < 7) return t('time.daysAgo', {count: days});
    return d.toLocaleDateString();
  } catch (e) { return ""; }
}

function showRecentContextMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  removeContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = "left:" + e.clientX + "px;top:" + e.clientY + "px;";
  const items = [
    { label: item.is_dir ? t('sidebar.open') : t('sidebar.openFile'), action: () => { if (item.is_dir) navigateTo(item.path); else call("open_file", { path: item.path }); } },
    { label: t('sidebar.openLocation'), action: () => navigateTo(item.is_dir ? item.path : parentFolderPath(item.path)) },
    { label: "-", action: null },
    { label: t('sidebar.removeFromRecent'), action: () => { call("db_remove_recent", { path: item.path }).then(() => loadRecentList()); } },
    { label: t('sidebar.clearAllRecent'), action: () => { if (confirm(t('confirm.clearRecent'))) { call("db_clear_recent", {}).then(() => loadRecentList()); } } },
  ];
  renderMenuItems(menu, items, e.clientX, e.clientY);
  document.body.appendChild(menu);
  _ctxShow(menu);
  requestAnimationFrame(() => clampMenuPosition(menu, e.clientX, e.clientY));
}

function updateSidebarSelection() {
  document.querySelectorAll(".sidebar-item,.tree-row").forEach(el => el.classList.remove("selected"));
  const currentPath = (G.lastActivePane === 'right' ? G.rp : getTab()).path;
  document.querySelectorAll(".pinned-item").forEach(el => {
    if (favoritePathKey(el.dataset.path) === favoritePathKey(currentPath)) el.classList.add("selected");
  });
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

function favoritePathKey(path) {
  return String(path || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

function isFavoriteFolder(path) {
  const key = favoritePathKey(path);
  return !!key && _pinnedFolders.some(p => favoritePathKey(p.path) === key);
}

function favoriteDisplayName(path, name) {
  if (name) return name;
  const clean = String(path || '').replace(/[\\/]+$/, '');
  return clean.split(/[\\/]/).filter(Boolean).pop() || path;
}

async function savePinnedFolders() {
  const data = _pinnedFolders.map(p => [p.path, p.name]);
  localStorage.setItem('rhfiles-pinned', JSON.stringify(_pinnedFolders));
  try { await call("db_save_pinned", { paths: data }); } catch (e) {}
}

async function loadPinnedFolders() {
  try {
    const data = await call("db_load_pinned", {});
    _pinnedFolders = (data || []).map(([path, name]) => ({ path, name }));
  } catch (e) {
    try { _pinnedFolders = JSON.parse(localStorage.getItem('rhfiles-pinned') || '[]'); } catch(e2) { _pinnedFolders = []; }
  }
  renderPinnedFolders();
  updateFavoriteButtons();
}

function getPinnedFolders() {
  return _pinnedFolders;
}

async function pinFolder(path, name) {
  if (!path || path === 'home://' || isFavoriteFolder(path)) return false;
  _pinnedFolders.push({ path, name: favoriteDisplayName(path, name) });
  await savePinnedFolders();
  renderPinnedFolders();
  updateFavoriteButtons();
  showNotice(t('notice.favoriteAdded'));
  return true;
}

async function unpinFolder(path) {
  const key = favoritePathKey(path);
  const oldLength = _pinnedFolders.length;
  _pinnedFolders = _pinnedFolders.filter(p => favoritePathKey(p.path) !== key);
  if (_pinnedFolders.length === oldLength) return false;
  await savePinnedFolders();
  renderPinnedFolders();
  updateFavoriteButtons();
  showNotice(t('notice.favoriteRemoved'));
  return true;
}

async function toggleFavoriteFolder(path, name) {
  if (isFavoriteFolder(path)) return unpinFolder(path);
  return pinFolder(path, name);
}

function currentFolderForFavorite(isRight) {
  const path = isRight ? G.rp.path : getTab()?.path;
  return path && path !== 'home://' && !path.startsWith('ftp://') ? path : null;
}

async function toggleCurrentFolderFavorite(isRight, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const path = currentFolderForFavorite(!!isRight);
  if (!path) return;
  await toggleFavoriteFolder(path, favoriteDisplayName(path));
}

function updateFavoriteButtons() {
  [
    { id: 'btn-favorite-current', isRight: false },
    { id: 'btn-right-favorite', isRight: true },
  ].forEach(item => {
    const btn = document.getElementById(item.id);
    if (!btn) return;
    const path = currentFolderForFavorite(item.isRight);
    const active = !!path && isFavoriteFolder(path);
    btn.disabled = !path;
    btn.classList.toggle('active', active);
    const label = active ? t('favorites.removeCurrent') : t('favorites.addCurrent');
    btn.title = label + (item.isRight ? '' : ' (Ctrl+D)');
    btn.setAttribute('aria-label', label);
  });
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
  if (!pinned.length) {
    container.innerHTML = `<div class="favorite-empty">${esc(t('sidebar.noFavorites'))}</div>`;
    return;
  }
  for (const p of pinned) {
    const div = document.createElement("div");
    div.className = "sidebar-item pinned-item";
    div.dataset.path = p.path;
    div.title = p.path;
    div.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1l2 4.5H15l-3.8 3 1.4 4.7L8 10.5 3.4 13.2l1.4-4.7L1 5.5h5z" fill="#e8b130" stroke="#c99820" stroke-width=".5"/></svg><span class="sidebar-item-label">' + esc(p.name) + '</span>';
    div.addEventListener("click", () => navigateTo(p.path));
    div.addEventListener("auxclick", e => { if (e.button === 1) { e.preventDefault(); addTab(p.path); } });
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
    { label: t('sidebar.open'), action: () => navigateTo(path) },
    { label: t('ctx.newTab'), action: () => addTab(path) },
    { label: "-", action: null },
    { label: t('favorites.remove'), action: () => unpinFolder(path) },
    { label: t('ctx.properties'), action: () => showPropertiesDialog(path) },
  ];
  renderMenuItems(menu, items, e.clientX, e.clientY);
  document.body.appendChild(menu);
  _ctxShow(menu);
  requestAnimationFrame(() => clampMenuPosition(menu, e.clientX, e.clientY));
}

function showFolderShortcutContextMenu(e, path, name) {
  e.preventDefault();
  e.stopPropagation();
  removeContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;`;
  const items = [
    { label: t('sidebar.open'), action: () => navigateTo(path) },
    { label: t('ctx.newTab'), action: () => addTab(path) },
    { label: "-", action: null },
    { label: isFavoriteFolder(path) ? t('favorites.remove') : t('favorites.add'), action: () => toggleFavoriteFolder(path, name) },
    { label: t('ctx.properties'), action: () => showPropertiesDialog(path) },
  ];
  renderMenuItems(menu, items, e.clientX, e.clientY);
  document.body.appendChild(menu);
  _ctxShow(menu);
  requestAnimationFrame(() => clampMenuPosition(menu, e.clientX, e.clientY));
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
    { label: t('sidebar.open'), action: () => navigateTo(provider.path) },
    { label: t('ctx.newTab'), action: () => addTab(provider.path) },
    { label: isFavoriteFolder(provider.path) ? t('favorites.remove') : t('favorites.add'), action: () => toggleFavoriteFolder(provider.path, provider.name) },
    { label: t('ctx.properties'), action: () => showPropertiesDialog(provider.path) },
  ];
  renderMenuItems(menu, items, e.clientX, e.clientY);
  document.body.appendChild(menu);
  _ctxShow(menu);
  requestAnimationFrame(() => clampMenuPosition(menu, e.clientX, e.clientY));
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
      div.addEventListener("contextmenu", e => showFolderShortcutContextMenu(e, l.path, l.name));
      container.appendChild(div);
    }
  } catch (e) {}
}

// --- optional device/network discovery ---
function scheduleOptionalDiscovery() {
  const start = () => {
    renderNetwork();
    setTimeout(() => renderMtpDevices(), 250);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(start, { timeout: 3000 });
  } else {
    setTimeout(start, 1500);
  }
}

// --- network browsing ---
async function renderNetwork() {
  const section = document.getElementById('network-section');
  if (!section) return;
  section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">' + t('status.scanning') + '...</div>';
  try {
    const servers = await withTimeout(
      call("browse_network", {}),
      8000,
      "Network discovery timed out"
    );
    section.innerHTML = '';
    for (const s of servers) {
      const div = document.createElement('div');
      div.className = 'sidebar-item';
      div.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="1" stroke="currentColor" stroke-width=".8"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width=".6"/></svg> ' + esc(s.name);
      div.dataset.path = s.path;
      div.onclick = () => navigateTo(s.path);
      div.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const anchor = { clientX: e.clientX, clientY: e.clientY };
        const token = `${s.path}:${Date.now()}:${Math.random()}`;
        showNetworkMenu(anchor, s, [], { loading: true, token });
        withTimeout(call("list_shares", { server: s.path }), 8000, "Share discovery timed out")
          .then(shares => {
            if (contextMenu?.dataset.networkMenuToken === token) {
              showNetworkMenu(anchor, s, shares, { token });
            }
          })
          .catch(() => {
            if (contextMenu?.dataset.networkMenuToken === token) {
              showNetworkMenu(anchor, s, [], { error: true, token });
            }
          });
      };
      section.appendChild(div);
    }
    if (servers.length === 0) {
      section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">' + t('sidebar.noServers') + '</div>';
    }
  } catch (e) {
    section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">' + t('sidebar.networkUnavailable') + '</div>';
  }
}

function showNetworkMenu(e, server, shares, options = {}) {
  const { loading = false, error = false, token = '' } = options;
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.cssText = 'left:' + e.clientX + 'px;top:' + e.clientY + 'px;';
  menu.dataset.networkMenuToken = token;
  const items = [
    { label: t('sidebar.open') + ' \\\\' + server.name, action: () => navigateTo(server.path) },
    { label: t('ctx.newTab'), action: () => addTab(server.path) },
  ];
  if (loading) {
    items.push({ label: '-', action: null });
    items.push({ label: t('ctx.loadingShares'), disabled: true });
  } else if (error) {
    items.push({ label: '-', action: null });
    items.push({ label: t('ctx.sharesUnavailable'), disabled: true });
  }
  if (shares.length > 0) {
    items.push({ label: '-', action: null });
    for (const sh of shares) {
      items.push({ label: sh.name, action: () => navigateTo(sh.path) });
    }
  }
  renderMenuItems(menu, items, e.clientX, e.clientY);
  document.body.appendChild(menu);
  _ctxShow(menu);
  requestAnimationFrame(() => clampMenuPosition(menu, e.clientX, e.clientY));
}

// --- FTP ---
function showFtpDialog() {
  const dlg = document.createElement('dialog');
  dlg.style.cssText = 'border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--bg-1);color:var(--text-1);min-width:340px;';
  dlg.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:14px">${t('dialog.ftpTitle')}</h3>
    <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
      <div class="dialog-row"><label>${t('dialog.ftpHost')}:</label><input type="text" id="ftp-host" placeholder="${t('dialog.ftpHostPlaceholder')}" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;"></div>
      <div class="dialog-row"><label>${t('dialog.ftpPath')}:</label><input type="text" id="ftp-path" value="/" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;"></div>
      <div class="dialog-row"><label>${t('dialog.ftpUser')}:</label><input type="text" id="ftp-user" placeholder="${t('dialog.ftpUserPlaceholder')}" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;"></div>
      <div class="dialog-row"><label>${t('dialog.ftpPassword')}:</label><input type="password" id="ftp-pass" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;"></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="dialog-btn" id="ftp-cancel">${t('btn.cancel')}</button>
      <button class="dialog-btn primary" id="ftp-connect">${t('btn.connect')}</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('#ftp-cancel').onclick = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector('#ftp-connect').onclick = async () => {
    const host = dlg.querySelector('#ftp-host').value.trim();
    const path = dlg.querySelector('#ftp-path').value || '/';
    const user = dlg.querySelector('#ftp-user').value || 'anonymous';
    const pass = dlg.querySelector('#ftp-pass').value;
    if (!host) { alert(t('alert.enterHost')); return; }
    try {
      const entries = await call('ftp_list', { host, path, user, pass });
      dlg.close();
      dlg.remove();
      showFtpEntries(host, path, user, pass, entries);
    } catch (e) {
      alert(t('alert.ftpFailed', {error: e}));
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
  section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">' + t('status.scanning') + '...</div>';
  try {
    const devices = await withTimeout(
      call('list_mtp_devices', {}),
      5000,
      "Device discovery timed out"
    );
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
      section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">' + t('sidebar.noDevices') + '</div>';
    }
  } catch (e) {
    section.innerHTML = '<div style="font-size:11px;color:var(--text-4);padding:4px 8px;">' + t('sidebar.noDevices') + '</div>';
  }
}
