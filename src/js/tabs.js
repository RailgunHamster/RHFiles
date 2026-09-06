// tabs.js — tab management + breadcrumb navigation

function tabName(path) {
  if (path === "home://") return t('nav.home');
  return displayPath(path);
}

function tabTooltip(path) {
  if (path === "home://") return t('nav.home');
  return displayPath(path);
}

let _tabTailFrame = 0;
const _tabTailRoots = new Set();
function revealTabLabelTails(root) {
  _tabTailRoots.add(root || document);
  if (_tabTailFrame) return;
  _tabTailFrame = requestAnimationFrame(() => {
    _tabTailFrame = 0;
    _tabTailRoots.forEach(scope => {
      scope.querySelectorAll('.tab-label').forEach(label => {
        const clipped = label.scrollWidth > label.clientWidth + 1;
        label.classList.toggle('tail-clipped', clipped);
        label.scrollLeft = clipped ? label.scrollWidth : 0;
      });
    });
    _tabTailRoots.clear();
  });
}

function saveFolderLayout(path, layout) {
  try {
    const data = JSON.parse(localStorage.getItem('rhfiles-folder-layouts') || '{}');
    data[path] = normalizeLayout(layout);
    localStorage.setItem('rhfiles-folder-layouts', JSON.stringify(data));
  } catch (e) {}
}

function loadFolderLayout(path) {
  try {
    const data = JSON.parse(localStorage.getItem('rhfiles-folder-layouts') || '{}');
    const stored = data[path] || null;
    if (stored === 'icons') {
      data[path] = 'cards';
      localStorage.setItem('rhfiles-folder-layouts', JSON.stringify(data));
    }
    return stored ? normalizeLayout(stored) : null;
  } catch (e) { return null; }
}

function renderTabs() {
  const bar = document.getElementById("tab-bar");
  if (!bar) return;
  const paneBadge = G.dualOn ? `<span class="tab-pane-index" title="${esc(t('pane.left'))}">1</span>` : '';
  bar.innerHTML = paneBadge + G.tabs.map(tab =>
    `<div class="tab ${tab.id===G.activeTab?'active':''}" data-tab-id="${tab.id}" data-pane="left" onclick="switchTab(${tab.id})" onauxclick="if(event.button===1)closeTab(${tab.id},false)" title="${esc(tabTooltip(tab.path))}" draggable="true">
      <span class="tab-label">${esc(tabName(tab.path))}</span>
      <button class="tab-close" onclick="event.stopPropagation();closeTab(${tab.id},false)">&times;</button>
    </div>`
  ).join("") + `<button class="tab-new" onclick="addTab(undefined,false)" title="${t('nav.newTab')}">
    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
  </button>`;
  initTabDragDrop(bar, false);
  initTabPreview();
  revealTabLabelTails(bar);
  renderRightTabs();
}

function renderRightTabs() {
  const bar = document.getElementById('right-tab-bar');
  if (!bar) return;
  bar.innerHTML = `<span class="tab-pane-index" title="${esc(t('pane.right'))}">2</span>` + G.rpTabs.map(tab =>
    `<div class="tab ${tab.id===G.activeRpTab?'active':''}" data-tab-id="${tab.id}" data-pane="right" onclick="switchRightTab(${tab.id})" onauxclick="if(event.button===1)closeTab(${tab.id},true)" title="${esc(tabTooltip(tab.path))}" draggable="true">
      <span class="tab-label">${esc(tabName(tab.path))}</span>
      <button class="tab-close" onclick="event.stopPropagation();closeTab(${tab.id},true)">&times;</button>
    </div>`
  ).join('') + `<button class="tab-new" onclick="addTab(undefined,true)" title="${t('nav.newTab')}">
    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
  </button>`;
  initTabDragDrop(bar, true);
  revealTabLabelTails(bar);
}

window.addEventListener('resize', () => revealTabLabelTails());

function switchTab(id) {
  G.lastActivePane = 'left';
  if (typeof updatePaneFocusUI === 'function') updatePaneFocusUI();
  if (id === G.activeTab) return;
  if (typeof resetTypeSearch === 'function') resetTypeSearch();
  hideTabPreview();
  _navigationToken++;
  saveCurrentTabState();
  G.activeTab = id;
  const tab = getTab();
  G.sortField = tab.sortF;
  G.sortAsc = tab.sortAsc;
  _updateTabActive();
  _renderTabContent(tab);
  updateSortArrows();
  updateSidebarSelection();
  _refreshTabInBackground(tab);
}

function switchRelativeTab(delta) {
  const isRight = G.dualOn && G.lastActivePane === 'right';
  const tabs = isRight ? G.rpTabs : G.tabs;
  const activeId = isRight ? G.activeRpTab : G.activeTab;
  if (tabs.length < 2) return;
  const current = tabs.findIndex(tab => tab.id === activeId);
  const next = (current + delta + tabs.length) % tabs.length;
  if (isRight) switchRightTab(tabs[next].id);
  else switchTab(tabs[next].id);
}

function _updateTabActive() {
  document.querySelectorAll("#tab-bar .tab").forEach(el => {
    el.classList.toggle("active", parseInt(el.dataset.tabId) === G.activeTab);
  });
}

function _renderTabContent(tab) {
  if (tab.path === "home://") {
    showHomePage();
    renderBreadcrumb(tab.path);
    document.getElementById("path-input").value = tab.path;
    return;
  }
  hideHomePage();
  showFileContent();
  const filterEl = document.getElementById("filter-input");
  if (filterEl) filterEl.value = "";
  renderBreadcrumb(tab.path);
  document.getElementById("path-input").value = tab.path;
  _applySavedSelection(tab);
  renderFiles(tab, "file-list", "status-count", "status-selection");
  updateStatus(tab, "status-count", "status-selection");
  updatePreviewForSelection();
  _applySavedScroll(tab);
}

function addTab(path, isRight) {
  if (isRight === undefined) isRight = G.dualOn && G.lastActivePane === 'right';
  if (isRight) return addRightTab(path);
  path = path || "C:\\";
  const t = { id: G.nextTabId++, path, history: [path], historyIdx: 0, entries: [], sel: new Set(), lastIdx: -1, sortF: "name", sortAsc: true };
  G.tabs.push(t);
  G.activeTab = t.id;
  G.sortField = "name";
  G.sortAsc = true;
  renderTabs();
  updateSortArrows();
  navigateTo(path, false);
}

function closeTab(id, isRight) {
  if (isRight) return closeRightTab(id);
  if (G.tabs.length <= 1) return;
  hideTabPreview();
  _navigationToken++;
  saveCurrentTabState();
  const idx = G.tabs.findIndex(t => t.id === id);
  G.tabs.splice(idx, 1);
  if (G.activeTab === id) {
    G.activeTab = G.tabs[Math.min(idx, G.tabs.length-1)].id;
    const tab = getTab();
    G.sortField = tab.sortF;
    G.sortAsc = tab.sortAsc;
    renderTabs();
    _renderTabContent(tab);
    updateSortArrows();
    _refreshTabInBackground(tab);
  } else {
    renderTabs();
  }
}

function addRightTab(path) {
  path = path || G.rp?.path || getTab()?.path || 'C:\\';
  const tab = { id:G.nextRpTabId++, path, history:[path], histIdx:0, entries:[], sel:new Set(), lastIdx:-1, sortF:'name', sortAsc:true };
  G.rpTabs.push(tab);
  G.activeRpTab = tab.id;
  G.rp = tab;
  G.lastActivePane = 'right';
  renderRightTabs();
  updatePaneFocusUI();
  rpNavigateTo(path, false);
  saveTabState();
}

function switchRightTab(id) {
  if (id === G.activeRpTab) {
    G.lastActivePane = 'right';
    updatePaneFocusUI();
    return;
  }
  const currentList = document.getElementById('right-file-list');
  if (G.rp) G.rp._savedScroll = currentList?.scrollTop || 0;
  const tab = getRightTab(id);
  if (!tab) return;
  G.activeRpTab = id;
  G.rp = tab;
  G.lastActivePane = 'right';
  renderRightTabs();
  updatePaneFocusUI();
  document.getElementById('right-path-input').value = tab.path;
  renderBreadcrumb(tab.path, 'right-breadcrumb', 'right-bc-dropdown', 'right-path-input', true);
  renderFiles(tab, 'right-file-list', 'right-status-count', null, true);
  requestAnimationFrame(() => { if (currentList) currentList.scrollTop = tab._savedScroll || 0; });
  rpNavigateTo(tab.path, false);
  saveTabState();
}

function closeRightTab(id) {
  if (G.rpTabs.length <= 1) return;
  const index = G.rpTabs.findIndex(tab => tab.id === id);
  if (index < 0) return;
  G.rpTabs.splice(index, 1);
  if (G.activeRpTab === id) {
    const tab = G.rpTabs[Math.min(index, G.rpTabs.length - 1)];
    G.activeRpTab = tab.id;
    G.rp = tab;
    rpNavigateTo(tab.path, false);
  }
  renderRightTabs();
  saveTabState();
}

function closeOtherTabs(id, isRight) {
  const target = isRight ? getRightTab(id) : getTab(id);
  if (!target) return;
  if (isRight) {
    G.rpTabs = [target];
    G.activeRpTab = id;
    G.rp = target;
    renderRightTabs();
    rpNavigateTo(target.path, false);
    saveTabState();
    return;
  }
  G.tabs = [target];
  if (G.activeTab !== id) {
    G.activeTab = id;
    G.sortField = target.sortF;
    G.sortAsc = target.sortAsc;
    _renderTabContent(target);
    updateSortArrows();
  }
  renderTabs();
  saveTabState();
}

function closeTabsToRight(id, isRight) {
  const tabs = isRight ? G.rpTabs : G.tabs;
  const activeId = isRight ? G.activeRpTab : G.activeTab;
  const index = tabs.findIndex(tab => tab.id === id);
  if (index < 0 || index === tabs.length - 1) return;
  const removedIds = new Set(tabs.slice(index + 1).map(tab => tab.id));
  if (isRight) G.rpTabs = tabs.slice(0, index + 1);
  else G.tabs = tabs.slice(0, index + 1);
  if (removedIds.has(activeId)) {
    if (isRight) {
      G.activeRpTab = id;
      G.rp = getRightTab(id);
      rpNavigateTo(G.rp.path, false);
    } else {
      G.activeTab = id;
      const target = getTab(id);
      G.sortField = target.sortF;
      G.sortAsc = target.sortAsc;
      _renderTabContent(target);
      updateSortArrows();
    }
  }
  if (isRight) renderRightTabs(); else renderTabs();
  saveTabState();
}

// --- tab state save/restore ---
function saveCurrentTabState() {
  const tab = getTab();
  if (!tab) return;
  const listEl = document.getElementById("file-list");
  tab._savedScroll = listEl ? listEl.scrollTop : 0;
  tab._savedSelPaths = [...(tab.sel || [])].map(i => tab.entries[i]?.path).filter(Boolean);
}

function _applySavedSelection(tab) {
  tab.sel = new Set();
  tab.lastIdx = -1;
  if (tab._savedSelPaths && tab._savedSelPaths.length > 0) {
    tab._savedSelPaths.forEach(p => {
      const idx = tab.entries.findIndex(e => e.path === p);
      if (idx >= 0) tab.sel.add(idx);
    });
    if (tab.sel.size > 0) tab.lastIdx = [...tab.sel].pop();
  }
}

function _applySavedScroll(tab) {
  const listEl = document.getElementById("file-list");
  const scroll = tab._savedScroll || 0;
  delete tab._savedScroll;
  delete tab._savedSelPaths;
  if (listEl && scroll > 0) {
    requestAnimationFrame(() => { listEl.scrollTop = scroll; });
  }
}

// --- background refresh (keeps cached entries fresh without blocking UI) ---
let _tabRefreshToken = 0;
async function _refreshTabInBackground(tab) {
  if (tab.path === "home://") return;
  const token = ++_tabRefreshToken;
  try {
    let entries = await listPathEntries(tab.path, "");
    if (token !== _tabRefreshToken) return;
    if (!G.showHidden) entries = entries.filter(e => !e.is_hidden);
    entries = sortEntriesList(entries, tab.sortF, tab.sortAsc);
    if (!_entriesChanged(tab.entries, entries)) {
      tab.entries = entries;
      _refreshTabMeta(tab);
      return;
    }
    const selPaths = [...(tab.sel || [])].map(i => tab.entries[i]?.path).filter(Boolean);
    tab.entries = entries;
    tab.sel = new Set();
    selPaths.forEach(p => {
      const idx = entries.findIndex(e => e.path === p);
      if (idx >= 0) tab.sel.add(idx);
    });
    tab.lastIdx = tab.sel.size > 0 ? [...tab.sel].pop() : -1;
    if (tab.id === G.activeTab) {
      const listEl = document.getElementById("file-list");
      const savedScroll = listEl ? listEl.scrollTop : 0;
      renderFiles(tab, "file-list", "status-count", "status-selection");
      updateStatus(tab, "status-count", "status-selection");
      if (listEl) listEl.scrollTop = savedScroll;
    }
    _refreshTabMeta(tab, true);
  } catch (e) {}
}

function _refreshTabMeta(tab, force) {
  const now = Date.now();
  if (!force && tab._metaRefreshAt && now - tab._metaRefreshAt < 15000) {
    G._watchSnapshot = null;
    return;
  }
  tab._metaRefreshAt = now;
  loadTree(tab.path, false);
  loadGitStatus(tab.path);
  if (typeof loadSvnStatus === 'function') loadSvnStatus(tab.path);
  G._watchSnapshot = null;
}

function _entriesChanged(oldE, newE) {
  if (oldE.length !== newE.length) return true;
  for (let i = 0; i < oldE.length; i++) {
    if (oldE[i].name !== newE[i].name) return true;
  }
  return false;
}

// --- tab drag-and-drop ---
let _dragTabId = null;
function initTabDragDrop(bar, isRight) {
  bar = bar || document.getElementById("tab-bar");
  if (!bar) return;
  const tabs = isRight ? G.rpTabs : G.tabs;
  bar.querySelectorAll(".tab").forEach(tabEl => {
    tabEl.addEventListener("dragstart", e => {
      _dragTabId = parseInt(tabEl.dataset.tabId);
      tabEl.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", _dragTabId);
    });
    tabEl.addEventListener("dragend", () => {
      _dragTabId = null;
      tabEl.classList.remove("dragging");
      bar.querySelectorAll(".tab").forEach(t => t.classList.remove("drag-over"));
    });
    tabEl.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      bar.querySelectorAll(".tab").forEach(t => t.classList.remove("drag-over"));
      tabEl.classList.add("drag-over");
    });
    tabEl.addEventListener("dragleave", () => {
      tabEl.classList.remove("drag-over");
    });
    tabEl.addEventListener("drop", e => {
      e.preventDefault();
      tabEl.classList.remove("drag-over");
      const fromId = parseInt(e.dataTransfer.getData("text/plain"));
      const toId = parseInt(tabEl.dataset.tabId);
      if (fromId === toId) return;
      const fromIdx = tabs.findIndex(t => t.id === fromId);
      const toIdx = tabs.findIndex(t => t.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = tabs.splice(fromIdx, 1);
      tabs.splice(toIdx, 0, moved);
      if (isRight) renderRightTabs(); else renderTabs();
      saveTabState();
    });
  });
}

// --- tab hover preview ---
let _previewTimer = null;
let _previewEl = null;
function initTabPreview() {
  const bar = document.getElementById("tab-bar");
  bar.querySelectorAll(".tab").forEach(tabEl => {
    tabEl.addEventListener("mouseenter", () => {
      if (parseInt(tabEl.dataset.tabId) === G.activeTab) return;
      hideTabPreview();
      _previewTimer = setTimeout(() => showTabPreview(tabEl), 600);
    });
    tabEl.addEventListener("mouseleave", () => {
      if (_previewTimer) clearTimeout(_previewTimer);
      hideTabPreview();
    });
  });
}

function showTabPreview(tabEl) {
  const tabId = parseInt(tabEl.dataset.tabId);
  if (!tabEl.isConnected || tabId === G.activeTab) return;
  const tab = G.tabs.find(t => t.id === tabId);
  if (!tab) return;

  if (!_previewEl) {
    _previewEl = document.createElement("div");
    _previewEl.className = "tab-preview";
    _previewEl.addEventListener("mouseenter", () => { if (_previewTimer) clearTimeout(_previewTimer); });
    _previewEl.addEventListener("mouseleave", hideTabPreview);
    document.body.appendChild(_previewEl);
  }

  const entries = tab.entries || [];
  const dirCount = entries.filter(e => e.is_dir).length;
  const fileCount = entries.length - dirCount;
  const maxShow = 10;
  const shown = entries.slice(0, maxShow);

  _previewEl.innerHTML =
    `<div class="tab-preview-path">${esc(tab.path)}</div>` +
    `<div class="tab-preview-meta">${t('nav.foldersFiles', {folders: dirCount, files: fileCount})}</div>` +
    `<div class="tab-preview-list">${shown.map(e =>
      `<div class="tab-preview-item${e.is_dir ? ' dir' : ''}">${e.is_dir ? '📁 ' : ''}${esc(e.name)}</div>`
    ).join("")}${entries.length > maxShow ? `<div class="tab-preview-more">${t('nav.moreTabs', {count: entries.length - maxShow})}</div>` : ''}</div>`;

  const rect = tabEl.getBoundingClientRect();
  _previewEl.style.top = (rect.bottom + 4) + "px";
  _previewEl.style.left = Math.min(rect.left, window.innerWidth - 296) + "px";
  _previewEl.classList.add("visible");
}

function hideTabPreview() {
  if (_previewTimer) {
    clearTimeout(_previewTimer);
    _previewTimer = null;
  }
  if (_previewEl) _previewEl.classList.remove("visible");
}

// --- breadcrumb ---
function revealBreadcrumbTail(bc) {
  if (!bc) return;
  requestAnimationFrame(() => { bc.scrollLeft = bc.scrollWidth; });
}

function renderBreadcrumb(path, bcId, dropdownId, inputId, isRight) {
  const bc = document.getElementById(bcId || "breadcrumb");
  if (path === "home://") {
    bc.innerHTML = `<span class="bc-item" data-path="home://">${t('nav.home')}</span><span class="breadcrumb-spacer"></span>`;
    const spacer = bc.querySelector(".breadcrumb-spacer");
    if (spacer) spacer.addEventListener("click", () => enterEditMode(isRight));
    revealBreadcrumbTail(bc);
    return;
  }
  let parts, isUnc = false;
  if (path.startsWith("\\\\")) {
    isUnc = true;
    const withoutPrefix = path.substring(2);
    const slashIdx = withoutPrefix.indexOf("\\");
    if (slashIdx >= 0) {
      parts = ["\\\\" + withoutPrefix.substring(0, slashIdx), ...withoutPrefix.substring(slashIdx + 1).replace(/\\/g, "/").split("/").filter(Boolean)];
    } else {
      parts = ["\\\\" + withoutPrefix];
    }
  } else {
    parts = path.replace(/\\/g,"/").split("/").filter(Boolean);
  }
  let html = "", accumulated = "";
  parts.forEach((part, i) => {
    if (isUnc && i === 0) {
      accumulated = part;
    } else {
      accumulated += (accumulated && !accumulated.endsWith("\\") ? "\\" : "") + part;
    }
    if (/^[A-Za-z]:$/.test(accumulated)) {
      accumulated += "\\";
    }
    const displayPart = /^[A-Za-z]:$/.test(part)
      ? part.charAt(0)
      : (isUnc && i === 0 ? displayPath(part) : part);
    html += `<span class="bc-item" data-path="${esc(accumulated)}">${esc(displayPart)}</span>`;
    if (i < parts.length - 1) {
      html += `<span class="bc-sep" data-path="${esc(accumulated)}">\u203a</span>`;
    }
  });
  html += `<span class="breadcrumb-spacer"></span>`;
  bc.innerHTML = html;

  bc.querySelectorAll(".bc-item").forEach(el => {
    el.addEventListener("click", () => { if (isRight) rpNavigateTo(el.dataset.path); else navigateTo(el.dataset.path); });
  });
  bc.querySelectorAll(".bc-sep").forEach(el => {
    el.addEventListener("click", e => { e.stopPropagation(); showBcDropdown(el.dataset.path, el, dropdownId, isRight); });
  });
  const spacer = bc.querySelector(".breadcrumb-spacer");
  if (spacer) {
    spacer.addEventListener("click", () => enterEditMode(isRight));
  }
  revealBreadcrumbTail(bc);
}

async function showBcDropdown(parentPath, sepEl, dropdownId, isRight) {
  const dropdown = document.getElementById(dropdownId || "bc-dropdown");
  const wasOpen = dropdown.classList.contains("show");
  hideDropdown(dropdownId);
  if (wasOpen && dropdown._lastPath === parentPath) return;
  try {
    const entries = await listPathEntries(parentPath, "");
    const dirs = entries.filter(e => e.is_dir);
    if (!dirs.length) return;
    dropdown.innerHTML = dirs.map(d =>
      `<div class="bc-dropdown-item" data-path="${esc(d.path)}">${esc(d.name)}</div>`
    ).join("");
    dropdown.querySelectorAll(".bc-dropdown-item").forEach(el => {
      el.addEventListener("click", () => { hideDropdown(dropdownId); if (isRight) rpNavigateTo(el.dataset.path); else navigateTo(el.dataset.path); });
    });
    dropdown.classList.add("show");
    dropdown._lastPath = parentPath;
    setTimeout(() => document.addEventListener("click", () => hideDropdown(dropdownId), { once: true }), 50);
  } catch (e) {}
}

function hideDropdown(dropdownId) {
  const dropdown = document.getElementById(dropdownId || "bc-dropdown");
  if (dropdown) dropdown.classList.remove("show");
}

function enterEditMode(isRight) {
  const barId = isRight ? "right-address-bar" : "address-bar";
  const inputId = isRight ? "right-path-input" : "path-input";
  const bar = document.getElementById(barId);
  const input = document.getElementById(inputId);
  bar.classList.add("editing");
  input.value = isRight ? G.rp.path : getTab().path;
  input.style.display = "block";
  input.focus();
  input.select();
}

function exitEditMode(isRight) {
  const barId = isRight ? "right-address-bar" : "address-bar";
  const inputId = isRight ? "right-path-input" : "path-input";
  const bar = document.getElementById(barId);
  const input = document.getElementById(inputId);
  bar.classList.remove("editing");
  input.style.display = "none";
  input.blur();
}

function detectAdaptiveLayout(entries) {
    if (entries.length === 0) return null;
    let images = 0, dirs = 0;
    for (const e of entries) {
        if (e.is_dir) dirs++;
        else if (['png','jpg','jpeg','gif','bmp','webp','svg','ico','tiff'].includes((e.extension||'').toLowerCase())) images++;
    }
    const total = entries.length;
    if (images / total > 0.8) return 'cards';
    return null;
}

// --- navigation ---
let _navigationToken = 0;
async function navigateTo(path, pushHistory) {
  if (typeof resetTypeSearch === 'function') resetTypeSearch();
  const navigationToken = ++_navigationToken;
  _searchRequestToken++;
  if (pushHistory === undefined) pushHistory = true;
  path = normalizeWindowsPathInput(path);
  // navigating away from search results clears search state
  G.searchActive = false;
  G.searchQuery = "";
  if (path === "home://") {
    const tab = getTab();
    if (pushHistory && path !== tab.path) {
      tab.history = tab.history.slice(0, tab.historyIdx + 1);
      tab.history.push(path);
      tab.historyIdx = tab.history.length - 1;
    }
    tab.path = path;
    tab.entries = [];
    tab.sel.clear();
    tab.lastIdx = -1;
    document.getElementById("path-input").value = path;
    renderBreadcrumb(path);
    hideFileContent();
    showHomePage();
    renderTabs();
    saveTabState();
    updateSearchScopeUI();
    if (typeof updateFavoriteButtons === 'function') updateFavoriteButtons();
    return true;
  }
  hideHomePage();
  showFileContent();
  const tab = getTab();
  const filterEl = document.getElementById("filter-input");
  if (filterEl && path !== tab.path) filterEl.value = "";
  try {
    let entries = await listPathEntries(path, "");
    if (navigationToken !== _navigationToken) return false;
    if (!G.showHidden) entries = entries.filter(e => !e.is_hidden);
    const filter = filterEl ? filterEl.value.toLowerCase() : "";
    if (filter) entries = entries.filter(e => e.name.toLowerCase().includes(filter));
    entries = sortEntriesList(entries, tab.sortF, tab.sortAsc);
    tab.entries = entries;
    if (pushHistory && path !== tab.path) {
      tab.history = tab.history.slice(0, tab.historyIdx + 1);
      tab.history.push(path);
      tab.historyIdx = tab.history.length - 1;
    }
    tab.path = path;
    renderTabs();
    addRecentFile(path, path.split("\\").pop(), true, "");
    const savedLayout = loadFolderLayout(path);
    if (savedLayout && savedLayout !== G.layout) {
      G.layout = savedLayout;
      localStorage.setItem('rhfiles-layout', savedLayout);
      document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === savedLayout));
    } else if (G.settings.adaptiveLayout !== false) {
      const detected = detectAdaptiveLayout(entries);
      if (detected && detected !== G.layout) {
        G.layout = detected;
        localStorage.setItem('rhfiles-layout', detected);
        document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === detected));
      }
    }
    tab.sel.clear();
    tab.lastIdx = -1;
    G.sortField = tab.sortF;
    G.sortAsc = tab.sortAsc;
    G._watchSnapshot = null;
    document.getElementById("path-input").value = path;
    renderBreadcrumb(path);
    renderFiles(tab, "file-list", "status-count", "status-selection");
    updateStatus(tab, "status-count", "status-selection");
    updateSidebarSelection();
    _refreshTabMeta(tab, true);
    saveTabState();
    updateSearchScopeUI();
    if (typeof updateFavoriteButtons === 'function') updateFavoriteButtons();
    updatePreviewForSelection();
    return true;
  } catch (e) {
    if (navigationToken !== _navigationToken) return false;
    document.getElementById("status-count").textContent = t('status.error', {error: e});
    return false;
  }
}

G.searchActive = false;
G.searchQuery = '';

let _searchTimer = null;
let _searchRunning = false;
let _everythingAvailable = false;
let _searchMode = 'normal';
// Search always starts scoped to the current folder. Global search is an
// explicit, temporary mode so a previous session cannot surprise the user.
let _searchScope = 'folder';
localStorage.removeItem('rhfiles-search-scope');
let _searchRequestToken = 0;

function getSearchFolderPath() {
  const path = getActivePaneState()?.path || '';
  return /^[A-Za-z]:\\/.test(path) || path.startsWith('\\\\') ? path : null;
}

function updateSearchScopeUI() {
  const btn = document.getElementById('btn-search-scope');
  const input = document.getElementById('filter-input');
  const folderPath = getSearchFolderPath();
  const globalEnabled = G.settings.globalSearchEnabled !== false;
  if (!globalEnabled && _searchScope === 'global') _searchScope = 'folder';
  const folderScope = _searchScope === 'folder' && !!folderPath;
  if (btn) {
    btn.disabled = !folderPath || !globalEnabled;
    btn.classList.toggle('active', folderScope);
    btn.innerHTML = folderScope
      ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5h4.8L8 6h6.5v6.8h-13V4.5z" stroke="currentColor" stroke-width="1"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1"/><path d="M2 8h12M8 2c1.8 1.7 2.7 3.7 2.7 6S9.8 12.3 8 14M8 2C6.2 3.7 5.3 5.7 5.3 8S6.2 12.3 8 14" stroke="currentColor" stroke-width=".8"/></svg>';
    const title = !globalEnabled
      ? t('search.globalDisabledTitle')
      : (folderScope ? t('search.scopeFolderTitle') : t('search.scopeGlobalTitle'));
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }
  if (input && !input.value) {
    input.placeholder = folderScope
      ? t('search.inFolderPlaceholder', {folder: folderPath.split('\\').filter(Boolean).pop() || folderPath})
      : t('search.globalPlaceholder');
  }
}

function toggleSearchScope() {
  if (!getSearchFolderPath()) return;
  if (G.settings.globalSearchEnabled === false) {
    showNotice(t('search.globalDisabledTitle'));
    return;
  }
  setSearchScope(_searchScope === 'folder' ? 'global' : 'folder');
}

function setSearchScope(scope) {
  const next = scope === 'global' ? 'global' : 'folder';
  if (next === 'global' && G.settings.globalSearchEnabled === false) {
    showNotice(t('search.globalDisabledTitle'));
    return;
  }
  if (next === 'global' && !getSearchFolderPath()) return;
  _searchScope = next;
  _searchRequestToken++;
  updateSearchScopeUI();
  const input = document.getElementById('filter-input');
  if (input && input.value.trim()) applyFilter();
}

function setGlobalSearchEnabled(enabled) {
  G.settings.globalSearchEnabled = !!enabled;
  if (!enabled) _searchScope = 'folder';
  saveSettings();
  updateSearchScopeUI();
  const input = document.getElementById('filter-input');
  if (input && input.value.trim()) applyFilter();
}

function applyFilter() {
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchRequestToken++;
  const query = document.getElementById("filter-input").value.trim();
  if (query.length === 0) {
    _searchRequestToken++;
    _searchRunning = false;
    G.searchActive = false;
    G.searchQuery = '';
    hideQuickSearch();
    if (G.dualOn && G.lastActivePane === 'right') rpNavigateTo(G.rp.path, false);
    else navigateTo(getTab().path, false);
    return;
  }
  _searchTimer = setTimeout(() => runSearch(query), query.length < 2 ? 400 : 250);
}

function toggleSearchMode() {
  const modes = ['normal', 'regex', 'wildcard'];
  const labels = [t('search.modeNormal'), t('search.modeRegex'), t('search.modeWildcard')];
  const idx = (modes.indexOf(_searchMode) + 1) % modes.length;
  _searchMode = modes[idx];
  const btn = document.getElementById("btn-search-mode");
  if (btn) {
    btn.textContent = _searchMode === 'regex' ? '.*' : _searchMode === 'wildcard' ? '*?' : 'Ab';
    btn.title = t('search.modeTooltip', {mode: labels[idx]});
  }
  const input = document.getElementById("filter-input");
  if (input && input.value.trim().length >= 1) {
    applyFilter();
  }
}

function toggleSearchHelp() {
  const help = document.getElementById("search-help-popover");
  if (!help) return;
  help.style.display = help.style.display === 'block' ? 'none' : 'block';
}

function hideSearchHelp() {
  const help = document.getElementById("search-help-popover");
  if (help) help.style.display = 'none';
}

function initDoubleCtrlSearch() {
  let lastCtrlTime = 0;
  document.addEventListener('keydown', e => {
    if (e.key === 'Control' && !e.shiftKey && !e.altKey) {
      const now = Date.now();
      if (now - lastCtrlTime < 350) {
        const input = document.getElementById("filter-input");
        if (input && document.activeElement !== input) {
          input.focus();
          input.select();
        }
        lastCtrlTime = 0;
      } else {
        lastCtrlTime = now;
      }
    }
  });
}

async function initQuickSearch() {
    try {
        // Do NOT eagerly spawn Everything at startup: launching it here pops the
        // user's existing Everything window to the front (single-instance forward)
        // and its first-run indexing stalls the machine. It is started lazily by
        // the first quick search instead (see ensure_everything_running).
        _everythingAvailable = await call("is_everything_available", {});
        const input = document.getElementById("filter-input");
        if (input) {
            input.addEventListener('keydown', e => {
              if (e.key === 'Escape') {
                document.getElementById("filter-input").value = '';
                applyFilter();
                hideSearchHelp();
              }
            });
        }
        updateSearchScopeUI();
        initDoubleCtrlSearch();
    } catch (e) {}
}

async function runSearch(query) {
    const isRight = G.dualOn && G.lastActivePane === 'right';
    const tab = isRight ? G.rp : getTab();
    const statusId = isRight ? 'right-status-count' : 'status-count';
    const requestToken = ++_searchRequestToken;
    const scopePath = _searchScope === 'folder' ? getSearchFolderPath() : null;
    const modePrefix = _searchMode === 'regex' ? 'regex:' : _searchMode === 'wildcard' ? 'wildcards:' : '';
    const fullQuery = modePrefix + query;
    _searchRunning = true;
    try {
        document.getElementById(statusId).textContent = t('status.searching');
        const results = scopePath
          ? await call("search_recursive", { path: scopePath, query: fullQuery, maxResults: 500 })
          : await call("quick_search", { query: fullQuery, maxResults: 500 });
        if (requestToken !== _searchRequestToken || document.getElementById("filter-input").value.trim() !== query) return;
        G.searchActive = true;
        G.searchQuery = query;
        G.searchScope = scopePath ? 'folder' : 'global';
        G.searchBasePath = scopePath || '';
        tab.entries = results;
        tab.sel.clear();
        tab.lastIdx = -1;
        renderSearchBreadcrumb(query, results.length, scopePath, isRight);
        renderFiles(tab, isRight ? 'right-file-list' : 'file-list', statusId, isRight ? null : 'status-selection', isRight);
        document.getElementById(statusId).textContent = t('search.results', {count: results.length});
    } catch (e) {
        if (requestToken !== _searchRequestToken) return;
        const errMsg = typeof e === 'string' ? e : (e?.message || e?.toString() || 'Unknown error');
        document.getElementById(statusId).textContent = t('status.searchError', {error: errMsg});
    } finally {
        if (requestToken === _searchRequestToken) _searchRunning = false;
    }
}

function renderSearchBreadcrumb(query, count, scopePath, isRight) {
    const scopeName = scopePath ? (scopePath.split('\\').filter(Boolean).pop() || scopePath) : t('search.scopeGlobal');
    const scopeLabel = scopePath ? t('search.scopeFolder', {folder: scopeName}) : t('search.scopeGlobal');
    const bc = document.getElementById(isRight ? 'right-breadcrumb' : 'breadcrumb');
    if (!bc) return;
    const fullTitle = scopePath ? `${scopePath} — ${query}` : query;
    bc.innerHTML = `<span class="bc-item" title="${esc(fullTitle)}" style="color:var(--accent);font-weight:500">🔍 ${esc(query)}</span>` +
        `<span class="bc-sep">‹</span><span class="bc-item" title="${esc(scopePath || scopeLabel)}">${esc(scopeLabel)}</span>` +
        `<span style="color:var(--text-4);font-size:11px;margin-left:6px;flex-shrink:0">${esc(t('search.resultCount', {count}))}</span>` +
        `<span class="breadcrumb-spacer" style="flex:1;cursor:text;min-width:20px;display:block;height:30px"></span>`;
    revealBreadcrumbTail(bc);
}

function hideQuickSearch() {}

// --- deep search (legacy stubs, keep for compatibility) ---
G.deepSearch = false;
function toggleDeepSearch() {}
async function runDeepSearch() {}

function homeDir(name) {
  return (G.homeDirPath || "C:\\") + "\\" + name;
}

function hideFileContent() {
  const el = document.querySelector("#pane-left > .content");
  if (el) el.style.display = "none";
}

function showFileContent() {
  const el = document.querySelector("#pane-left > .content");
  if (el) el.style.display = "";
}

function showHomePage() {
  document.getElementById("home-page").style.display = "block";
  hideFileContent();
  const quickAccess = document.getElementById("home-quick-access");
  const folders = [
    { name: t('home.desktop'), path: homeDir("Desktop"), icon: "M1.5 3h13v10H1.5z M5 14h6" },
    { name: t('home.downloads'), path: homeDir("Downloads"), icon: "M8 2v7M5 6l3 3 3-3M2.5 10v3h11v-3" },
    { name: t('home.documents'), path: homeDir("Documents"), icon: "M3 2h5l4 4v8H3z M8 2v4h4" },
    { name: t('home.pictures'), path: homeDir("Pictures"), icon: "M2 3h12v10H2z M3.5 11l2.7-2.8 2.1 2 2.3-3 2.9 3.8 M5 6.1a1 1 0 1 0 0-.01" },
    { name: t('home.music'), path: homeDir("Music"), icon: "M4 12a2 2 0 11-0-4M12 10a2 2 0 11-0-4M6 12V3l8-2v9" },
    { name: t('home.videos'), path: homeDir("Videos"), icon: "M1.5 3.5h13v9h-13z M6.25 5.65l4.2 2.35-4.2 2.35z" },
  ];
  quickAccess.innerHTML = "";
  for (const f of folders) {
    const card = document.createElement("div");
    card.className = "home-card";
    card.innerHTML = `<svg class="home-card-icon" viewBox="0 0 16 16" fill="none"><path d="${f.icon}" stroke="currentColor" stroke-width="1"/></svg><div class="home-card-name">${esc(f.name)}</div>`;
    card.addEventListener("click", () => navigateTo(f.path));
    quickAccess.appendChild(card);
  }
  renderHomeDrives();

  _homeRecentMode = "recent";
  renderHomeRecent("recent");
}

let _homeRecentMode = "recent";
function switchHomeRecentTab(mode) {
  _homeRecentMode = mode;
  document.querySelectorAll(".home-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === mode));
  renderHomeRecent(mode);
}

async function renderHomeRecent(mode) {
  const homeRecent = document.getElementById("home-recent");
  if (!homeRecent) return;
  try {
    const items = await call("db_load_recent", { mode, limit: 20 });
    if (!items || !items.length) {
      homeRecent.innerHTML = `<div style="color:var(--text-4);padding:8px;font-size:12px;">${t('home.noRecent')}</div>`;
      return;
    }
    homeRecent.innerHTML = "";
    for (const item of items) {
      const div = document.createElement("div");
      div.className = "home-recent-item";
      const iconSvg = item.is_dir
        ? '<svg class="hri-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 4h5l2 2h7v7H1z" stroke="currentColor" stroke-width=".8" fill="none"/></svg>'
        : '<svg class="hri-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="1" width="10" height="14" rx="1" stroke="currentColor" stroke-width=".8" fill="none"/><path d="M6 5h4M6 7h4M6 9h3" stroke="currentColor" stroke-width=".6"/></svg>';
      const timeStr = typeof formatTimeAgo === 'function' ? formatTimeAgo(item.last_accessed) : "";
      div.innerHTML = iconSvg +
        '<div class="hri-info"><span class="hri-name">' + esc(item.name) + '</span>' +
        '<span class="hri-meta">' + esc(item.path) + (timeStr ? ' \u00b7 ' + esc(timeStr) : '') + '</span></div>' +
        (item.access_count > 1 ? '<span class="hri-count">' + item.access_count + 'x</span>' : '');
      div.addEventListener("click", () => {
        if (item.is_dir) {
          navigateTo(item.path);
        } else {
          const parentDir = item.path.split("\\").slice(0, -1).join("\\") || item.path;
          navigateTo(parentDir);
        }
      });
      homeRecent.appendChild(div);
    }
  } catch (e) {
    homeRecent.innerHTML = `<div style="color:var(--text-4);padding:8px;font-size:12px;">${t('home.noRecent')}</div>`;
  }
}

async function renderHomeDrives() {
  const container = document.getElementById("home-drives");
  try {
    const drives = await call("get_drives");
    container.innerHTML = "";
    for (const d of drives) {
      const pct = d.total_bytes ? (d.free_bytes / d.total_bytes * 100) : 0;
      const usedPct = 100 - pct;
      const color = usedPct > 90 ? '#d32f2f' : usedPct > 70 ? '#ff9800' : '#0078d4';
      const card = document.createElement("div");
      card.className = "home-drive-card";
      card.innerHTML = `<div class="home-drive-letter">${esc(d.letter)}</div><div class="home-drive-label">${esc(d.label)}</div><div class="home-drive-bar"><div class="home-drive-bar-fill" style="width:${usedPct}%;background:${color}"></div></div><div style="font-size:11px;color:var(--text-4);margin-top:4px">${esc(d.free)}</div>`;
      card.addEventListener("click", () => navigateTo(d.path));
      container.appendChild(card);
    }
  } catch (e) {}
}

function hideHomePage() {
  document.getElementById("home-page").style.display = "none";
}

async function goUp() {
  try {
    const isRight = G.lastActivePane === 'right' && G.dualOn;
    const pane = isRight ? G.rp : getTab();
    if (pane.path === "home://") return;
    const prevDirName = pane.path.split("\\").pop() || pane.path.split("/").pop();
    // Drive root has no parent — go to home
    const isDriveRoot = /^[A-Z]:\\$/i.test(pane.path);
    const parent = isDriveRoot ? "home://" : await call("parent_path", { path: pane.path });
    if (isRight) {
      await rpNavigateTo(parent);
    } else {
      await navigateTo(parent);
    }
    if (parent === "home://") return;
    // Select the folder we just came from
    const entries = pane.entries || [];
    const idx = entries.findIndex(e => e.is_dir && e.name === prevDirName);
    if (idx >= 0) {
      pane.sel.clear();
      pane.sel.add(idx);
      pane.lastIdx = idx;
      const listId = isRight ? "right-file-list" : "file-list";
      const countId = isRight ? "right-status-count" : "status-count";
      renderFiles(pane, listId, countId, null, isRight);
      scrollToVisible(idx);
      updatePreviewForSelection();
    }
    return parent;
  } catch (e) {}
}

async function goBack() {
  if (G.dualOn && G.lastActivePane === 'right') return paneGoBack('right');
  const tab = getTab();
  if (tab.historyIdx <= 0) return;
  tab.historyIdx--;
  await navigateTo(tab.history[tab.historyIdx], false);
}

async function goForward() {
  if (G.dualOn && G.lastActivePane === 'right') return paneGoForward('right');
  const tab = getTab();
  if (tab.historyIdx >= tab.history.length - 1) return;
  tab.historyIdx++;
  await navigateTo(tab.history[tab.historyIdx], false);
}

async function refresh() {
  G.gitCache = {};
  if (G.dualOn && G.lastActivePane === 'right') {
    await rpNavigateTo(G.rp.path, false);
    return;
  }
  const tab = getTab();
  await navigateTo(tab.path, false);
}

function setLayout(layout) {
  layout = normalizeLayout(layout);
  G.layout = layout;
  localStorage.setItem('rhfiles-layout', layout);
  saveFolderLayout(getActivePaneState().path, layout);
  document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === layout));
  renderFiles(getTab(), "file-list", "status-count", "status-selection");
  if (G.dualOn) renderFiles(G.rp, "right-file-list", "right-status-count", null, true);
}

// --- entry editing for edit mode ---
document.addEventListener("DOMContentLoaded", () => {
  function setupEditInput(inputId, isRight) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (isRight) rpNavigateTo(input.value); else navigateTo(input.value);
        exitEditMode(isRight);
        input.blur();
      }
      if (e.key === "Escape") {
        exitEditMode(isRight);
        input.blur();
      }
    });
    input.addEventListener("blur", () => exitEditMode(isRight));
  }
  setupEditInput("path-input", false);
  setupEditInput("right-path-input", true);
});
