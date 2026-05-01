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
  const existing = container.querySelector(`[data-tpath="${esc(parentPath)}"]`);
  let node;
  if (existing) {
    node = existing;
    const childContainer = node.querySelector(".tree-children");
    if (childContainer) {
      childContainer.innerHTML = "";
      children.forEach(c => renderTreeItem(childContainer, c));
      childContainer.classList.add("open");
    }
    node.querySelector(".tree-arrow").classList.add("expanded");
    node.querySelector(".tree-arrow").classList.remove("empty");
  } else {
    node = document.createElement("div");
    node.className = "tree-node";
    node.dataset.tpath = parentPath;
    node.innerHTML = `<div class="tree-row">
      <span class="tree-arrow ${expand?'expanded':''}">\u25b6</span>
      <svg class="tree-icon" width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5h4.5L7.5 6h7v7h-13V4.5z" stroke="#dcb67a" stroke-width="1"/></svg>
      <span class="tree-name">${esc(parentPath.split('\\').filter(Boolean).pop() || parentPath)}</span>
    </div>
    <div class="tree-children ${expand?'open':''}"></div>`;
    const childContainer = node.querySelector(".tree-children");
    children.forEach(c => renderTreeItem(childContainer, c));
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

function renderTreeItem(container, entry) {
  const div = document.createElement("div");
  div.className = "tree-row";
  div.style.paddingLeft = (parseInt(container.parentElement?.querySelector(".tree-row")?.style.paddingLeft || 0) + 16) + "px";
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
          kids.forEach(k => renderTreeItem(childrenDiv, k));
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
    list.innerHTML = drives.map(d =>
      `<div class="drive-item" onclick="navigateTo('${esc(d.path)}')">
        <div class="drive-name">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="8" rx="1.5" stroke="currentColor" stroke-width=".9"/><circle cx="11.5" cy="8" r="1" fill="currentColor" opacity=".4"/></svg>
          ${esc(d.label)} (${esc(d.letter)})
        </div>
        <div class="drive-info">${esc(d.free)}</div>
      </div>`
    ).join("");
  } catch (e) {}
}

// --- tags list in sidebar ---
async function loadTagList() {
  try {
    const allTags = await call("load_all_tags", {});
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
      `<span class="tag-pill" style="background:${tagColor(idx)}22;color:${tagColor(idx)}" onclick="navigateTo('${esc(tagMap[tag][0].split('\\').slice(0,-1).join('\\') || tagMap[tag][0])}')" title="${tagMap[tag].length} files">${esc(tag)}</span>`
    ).join("");
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
function getPinnedFolders() {
  try {
    return JSON.parse(localStorage.getItem('rhfiles-pinned') || '[]');
  } catch (e) { return []; }
}

function pinFolder(path, name) {
  const pinned = getPinnedFolders();
  if (!pinned.find(p => p.path === path)) {
    pinned.push({ path, name: name || path.split("\\").pop() });
    localStorage.setItem('rhfiles-pinned', JSON.stringify(pinned));
    renderPinnedFolders();
  }
}

function unpinFolder(path) {
  let pinned = getPinnedFolders();
  pinned = pinned.filter(p => p.path !== path);
  localStorage.setItem('rhfiles-pinned', JSON.stringify(pinned));
  renderPinnedFolders();
}

function renderPinnedFolders() {
  const pinned = getPinnedFolders();
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
  container.innerHTML = pinned.map(p =>
    '<div class="sidebar-item pinned-item" data-pinned-path="' + esc(p.path) + '" onclick="navigateTo(\'' + esc(p.path) + '\')" oncontextmenu="showSidebarContextMenu(event,\'' + esc(p.path) + '\',\'' + esc(p.name) + '\')">' +
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1l2 4.5H15l-3.8 3 1.4 4.7L8 10.5 3.4 13.2l1.4-4.7L1 5.5h5z" fill="#e8b130" stroke="#c99820" stroke-width=".5"/></svg>' +
    ' ' + esc(p.name) + '</div>'
  ).join("");
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
        list.innerHTML = entries.filter(e => e.is_dir).map(d =>
          '<div class="sidebar-item" onclick="navigateTo(\'' + esc(d.path) + '\')">' +
          '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width=".8"/><text x="8" y="11" text-anchor="middle" font-size="7" fill="currentColor">W</text></svg>' +
          ' ' + esc(d.name) + '</div>'
        ).join("");
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
    container.innerHTML = mapped.map(l =>
      '<div class="sidebar-item" onclick="navigateTo(\'' + esc(l.path) + '\')" oncontextmenu="pinFolder(\'' + esc(l.path) + '\',\'' + esc(l.name) + '\')">' +
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 5h5l2 2h5v6H2V5z" stroke="var(--accent)" stroke-width=".8"/></svg>' +
      ' ' + esc(l.name) + '</div>'
    ).join("");
  } catch (e) {}
}
