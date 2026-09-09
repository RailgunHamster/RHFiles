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

function tabPinIndicator() {
  return `<span class="tab-pin" title="${esc(t('tab.pinned'))}" aria-hidden="true">
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M5.2 1.8h5.6l-.72 3.06 1.72 1.88v1.18H8.7v4.8L8 14l-.7-1.28v-4.8H4.2V6.74l1.72-1.88L5.2 1.8Z" fill="currentColor"/></svg>
  </span>`;
}

function renderTabMarkup(tab, isRight, index, tabs) {
  const activeId = isRight ? G.activeRpTab : G.activeTab;
  const pane = isRight ? 'right' : 'left';
  const pinned = tab.pinned === true;
  const boundary = pinned && tabs[index + 1]?.pinned !== true;
  const closeButton = pinned ? '' : `<button class="tab-close" onclick="event.stopPropagation();closeTab(${tab.id},${isRight})">&times;</button>`;
  return `<div class="tab ${tab.id===activeId?'active':''} ${pinned?'pinned':''} ${boundary?'pinned-boundary':''}" data-tab-id="${tab.id}" data-pane="${pane}" data-pinned="${pinned}" onclick="${isRight?'switchRightTab':'switchTab'}(${tab.id})" onauxclick="if(event.button===1)closeTab(${tab.id},${isRight})" title="${esc(tabTooltip(tab.path))}" draggable="true">
    ${pinned ? tabPinIndicator() : ''}<span class="tab-label">${esc(tabName(tab.path))}</span>${closeButton}
  </div>`;
}

function normalizePinnedTabOrder(tabs) {
  if (!Array.isArray(tabs) || tabs.length < 2) return tabs;
  const ordered = [...tabs.filter(tab => tab.pinned === true), ...tabs.filter(tab => tab.pinned !== true)];
  tabs.splice(0, tabs.length, ...ordered);
  return tabs;
}

function renderTabs() {
  const bar = document.getElementById("tab-bar");
  if (!bar) return;
  const paneBadge = G.dualOn ? `<span class="tab-pane-index" title="${esc(t('pane.left'))}">1</span>` : '';
  bar.innerHTML = paneBadge + G.tabs.map((tab, index) => renderTabMarkup(tab, false, index, G.tabs)).join("") + `<button class="tab-new" onclick="addTab(undefined,false)" title="${t('nav.newTab')}">
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
  bar.innerHTML = `<span class="tab-pane-index" title="${esc(t('pane.right'))}">2</span>` + G.rpTabs.map((tab, index) => renderTabMarkup(tab, true, index, G.rpTabs)).join('') + `<button class="tab-new" onclick="addTab(undefined,true)" title="${t('nav.newTab')}">
    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
  </button>`;
  initTabDragDrop(bar, true);
  revealTabLabelTails(bar);
}

window.addEventListener('resize', () => revealTabLabelTails());

function switchTab(id) {
  G.lastActivePane = 'left';
  if (typeof updatePaneFocusUI === 'function') updatePaneFocusUI();
  if (id === G.activeTab) {
    if (typeof syncDiskUsageWithActiveFolder === 'function') syncDiskUsageWithActiveFolder(getTab()?.path, false);
    if (typeof scheduleFileDialogIntegrationSync === 'function') scheduleFileDialogIntegrationSync();
    return;
  }
  if (typeof resetTypeSearch === 'function') resetTypeSearch();
  hideTabPreview();
  _navigationToken++;
  saveCurrentTabState();
  G.activeTab = id;
  const tab = getTab();
  if (typeof syncDiskUsageWithActiveFolder === 'function') syncDiskUsageWithActiveFolder(tab?.path, false);
  G.sortField = tab.sortF;
  G.sortAsc = tab.sortAsc;
  _updateTabActive();
  _renderTabContent(tab);
  updateSortArrows();
  updateSidebarSelection();
  _refreshTabInBackground(tab);
  if (typeof scheduleFileDialogIntegrationSync === 'function') scheduleFileDialogIntegrationSync();
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
  const t = { id: G.nextTabId++, path, history: [path], historyIdx: 0, entries: [], sel: new Set(), lastIdx: -1, sortF: "name", sortAsc: true, pinned: false };
  G.tabs.push(t);
  G.activeTab = t.id;
  G.sortField = "name";
  G.sortAsc = true;
  renderTabs();
  updateSortArrows();
  navigateTo(path, false);
}

function selectedTabPaths(tab) {
  if (Array.isArray(tab?._savedSelPaths)) return [...tab._savedSelPaths];
  return [...(tab?.sel || [])].map(index => tab.entries?.[index]?.path).filter(Boolean);
}

async function duplicateTab(tabId, isRight) {
  const tabs = isRight ? G.rpTabs : G.tabs;
  const source = tabs.find(tab => tab.id === tabId);
  const sourceIndex = tabs.indexOf(source);
  if (!source || sourceIndex < 0) return;

  const list = document.getElementById(isRight ? 'right-file-list' : 'file-list');
  if ((!isRight && G.activeTab === tabId) || (isRight && G.activeRpTab === tabId)) {
    if (isRight) source._savedScroll = list?.scrollTop || 0;
    else saveCurrentTabState();
  }
  const selectionPaths = selectedTabPaths(source);
  const duplicate = {
    id: isRight ? G.nextRpTabId++ : G.nextTabId++,
    path: source.path,
    history: [...(source.history || [source.path])],
    entries: [...(source.entries || [])],
    sel: new Set(source.sel || []),
    lastIdx: source.lastIdx ?? -1,
    sortF: source.sortF || 'name',
    sortAsc: source.sortAsc !== false,
    pinned: source.pinned === true,
    _savedScroll: source._savedScroll || 0,
  };
  if (isRight) duplicate.histIdx = Math.max(0, Math.min(source.histIdx ?? 0, duplicate.history.length - 1));
  else {
    duplicate.historyIdx = Math.max(0, Math.min(source.historyIdx ?? 0, duplicate.history.length - 1));
    duplicate._savedSelPaths = selectionPaths;
  }
  tabs.splice(sourceIndex + 1, 0, duplicate);

  if (isRight) {
    G.activeRpTab = duplicate.id;
    G.rp = duplicate;
    G.lastActivePane = 'right';
    renderRightTabs();
    updatePaneFocusUI();
    await rpNavigateTo(duplicate.path, false);
    duplicate.sel.clear();
    selectionPaths.forEach(path => {
      const index = duplicate.entries.findIndex(entry => entry.path === path);
      if (index >= 0) duplicate.sel.add(index);
    });
    duplicate.lastIdx = duplicate.sel.size ? [...duplicate.sel].pop() : -1;
    renderFiles(duplicate, 'right-file-list', 'right-status-count', null, true);
    requestAnimationFrame(() => {
      const target = document.getElementById('right-file-list');
      if (target) target.scrollTop = duplicate._savedScroll || 0;
    });
  } else {
    hideTabPreview();
    _navigationToken++;
    G.activeTab = duplicate.id;
    G.lastActivePane = 'left';
    G.sortField = duplicate.sortF;
    G.sortAsc = duplicate.sortAsc;
    renderTabs();
    _renderTabContent(duplicate);
    updateSortArrows();
    updateSidebarSelection();
    _refreshTabInBackground(duplicate);
  }
  saveTabState();
}

function toggleTabPinned(tabId, isRight) {
  const tabs = isRight ? G.rpTabs : G.tabs;
  const index = tabs.findIndex(tab => tab.id === tabId);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  tab.pinned = tab.pinned !== true;
  const pinnedCount = tabs.filter(item => item.pinned === true).length;
  tabs.splice(pinnedCount, 0, tab);
  if (isRight) renderRightTabs();
  else renderTabs();
  saveTabState();
}

function closeTab(id, isRight) {
  if (isRight) return closeRightTab(id);
  if (G.tabs.length <= 1) return;
  hideTabPreview();
  _navigationToken++;
  saveCurrentTabState();
  const idx = G.tabs.findIndex(t => t.id === id);
  if (idx < 0) return;
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
  const tab = { id:G.nextRpTabId++, path, history:[path], histIdx:0, entries:[], sel:new Set(), lastIdx:-1, sortF:'name', sortAsc:true, pinned:false };
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

function tabsKeptAfterCloseOthers(tabs, id) {
  return tabs.filter(tab => tab.id === id || tab.pinned === true);
}

function closableTabIdsToRight(tabs, id) {
  const index = tabs.findIndex(tab => tab.id === id);
  if (index < 0) return new Set();
  return new Set(tabs.slice(index + 1).filter(tab => tab.pinned !== true).map(tab => tab.id));
}

function closeOtherTabs(id, isRight) {
  const target = isRight ? getRightTab(id) : getTab(id);
  if (!target) return;
  const sourceTabs = isRight ? G.rpTabs : G.tabs;
  const keptTabs = tabsKeptAfterCloseOthers(sourceTabs, id);
  if (isRight) {
    G.rpTabs = keptTabs;
    G.activeRpTab = id;
    G.rp = target;
    renderRightTabs();
    rpNavigateTo(target.path, false);
    saveTabState();
    return;
  }
  G.tabs = keptTabs;
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
  const removedIds = closableTabIdsToRight(tabs, id);
  if (!removedIds.size) return;
  const keptTabs = tabs.filter(tab => !removedIds.has(tab.id));
  if (isRight) G.rpTabs = keptTabs;
  else G.tabs = keptTabs;
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
let _dragTabPane = null;
const RHFILES_TAB_DRAG_MIME = 'application/x-rhfiles-tab+json';
const TAB_FILE_DRAG_SWITCH_DELAY_MS = 480;
let _fileDragTabHoverTimer = null;
let _fileDragTabHoverTarget = null;
let _fileDragTabLeaveTimer = null;

function isRhfilesFileDrag(dataTransfer) {
  const types = Array.from(dataTransfer?.types || []).map(type => String(type).toLowerCase());
  if (types.includes(RHFILES_FILE_DRAG_MIME)) return true;
  if (G._activeFileDragPayload?.paths?.length && !types.includes(RHFILES_TAB_DRAG_MIME)) return true;
  if (!types.includes('text/plain')) return false;
  try {
    return String(dataTransfer.getData('text/plain') || '').startsWith(RHFILES_FILE_DRAG_PREFIX);
  } catch (error) {
    return false;
  }
}

function isRhfilesTabDrag(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes(RHFILES_TAB_DRAG_MIME);
}

function clearTabReorderIndicators(bar) {
  bar?.querySelectorAll('.tab').forEach(tab => tab.classList.remove('drag-over-before', 'drag-over-after'));
}

function reorderTabsByDrop(tabs, fromId, toId, afterTarget) {
  const fromIndex = tabs.findIndex(tab => tab.id === fromId);
  const targetIndex = tabs.findIndex(tab => tab.id === toId);
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return false;
  if ((tabs[fromIndex].pinned === true) !== (tabs[targetIndex].pinned === true)) return false;
  let insertionIndex = targetIndex + (afterTarget ? 1 : 0);
  const [moved] = tabs.splice(fromIndex, 1);
  if (fromIndex < insertionIndex) insertionIndex--;
  tabs.splice(Math.max(0, Math.min(insertionIndex, tabs.length)), 0, moved);
  return true;
}

function clearFileDragTabHover(tabEl) {
  if (tabEl && _fileDragTabHoverTarget && tabEl !== _fileDragTabHoverTarget) return;
  if (_fileDragTabLeaveTimer) clearTimeout(_fileDragTabLeaveTimer);
  _fileDragTabLeaveTimer = null;
  if (_fileDragTabHoverTimer) clearTimeout(_fileDragTabHoverTimer);
  _fileDragTabHoverTimer = null;
  if (_fileDragTabHoverTarget) _fileDragTabHoverTarget.classList.remove('file-drag-hover');
  _fileDragTabHoverTarget = null;
}

function scheduleFileDragTabSwitch(tabEl, isRight) {
  if (_fileDragTabLeaveTimer) clearTimeout(_fileDragTabLeaveTimer);
  _fileDragTabLeaveTimer = null;
  const tabId = parseInt(tabEl?.dataset.tabId);
  const activeId = isRight ? G.activeRpTab : G.activeTab;
  if (!tabEl || !Number.isFinite(tabId) || tabId === activeId) {
    clearFileDragTabHover();
    return;
  }
  if (_fileDragTabHoverTarget === tabEl && _fileDragTabHoverTimer) return;
  clearFileDragTabHover();
  hideTabPreview();
  _fileDragTabHoverTarget = tabEl;
  tabEl.classList.add('file-drag-hover');
  _fileDragTabHoverTimer = setTimeout(() => {
    if (_fileDragTabHoverTarget !== tabEl || !tabEl.isConnected) return;
    clearFileDragTabHover();
    if (isRight) switchRightTab(tabId);
    else switchTab(tabId);
  }, TAB_FILE_DRAG_SWITCH_DELAY_MS);
}

function initTabDragDrop(bar, isRight) {
  bar = bar || document.getElementById("tab-bar");
  if (!bar) return;
  bar.querySelectorAll(".tab").forEach(tabEl => {
    tabEl.addEventListener("dragstart", e => {
      _dragTabId = parseInt(tabEl.dataset.tabId);
      _dragTabPane = isRight ? 'right' : 'left';
      tabEl.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(RHFILES_TAB_DRAG_MIME, JSON.stringify({
        kind: 'rhfiles-tab',
        tabId: _dragTabId,
        pane: _dragTabPane,
      }));
    });
    tabEl.addEventListener("dragend", () => {
      _dragTabId = null;
      _dragTabPane = null;
      clearFileDragTabHover();
      tabEl.classList.remove("dragging");
      clearTabReorderIndicators(bar);
    });
    tabEl.addEventListener("dragover", e => {
      if (isRhfilesFileDrag(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        clearTabReorderIndicators(bar);
        scheduleFileDragTabSwitch(tabEl, isRight);
        return;
      }
      if (!isRhfilesTabDrag(e.dataTransfer) || _dragTabPane !== (isRight ? 'right' : 'left')) return;
      const tabs = isRight ? G.rpTabs : G.tabs;
      const dragged = tabs.find(tab => tab.id === _dragTabId);
      const target = tabs.find(tab => tab.id === parseInt(tabEl.dataset.tabId));
      if (!dragged || !target || (dragged.pinned === true) !== (target.pinned === true)) {
        clearTabReorderIndicators(bar);
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      clearTabReorderIndicators(bar);
      const rect = tabEl.getBoundingClientRect();
      tabEl.classList.add(e.clientX >= rect.left + rect.width / 2 ? 'drag-over-after' : 'drag-over-before');
    });
    tabEl.addEventListener("dragleave", e => {
      // Child elements (label, pin, close button) emit their own bubbling
      // dragleave events while the pointer is still inside the tab.
      if (e.target !== tabEl) return;
      tabEl.classList.remove('drag-over-before', 'drag-over-after');
      if (e.relatedTarget && tabEl.contains(e.relatedTarget)) return;
      if (_fileDragTabLeaveTimer) clearTimeout(_fileDragTabLeaveTimer);
      _fileDragTabLeaveTimer = setTimeout(() => {
        _fileDragTabLeaveTimer = null;
        clearFileDragTabHover(tabEl);
      }, 180);
    });
    tabEl.addEventListener("drop", async e => {
      if (isRhfilesFileDrag(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
        const payload = readRhfilesFileDragData(e.dataTransfer);
        clearTabReorderIndicators(bar);
        clearFileDragTabHover();
        const targetId = parseInt(tabEl.dataset.tabId);
        const tabs = isRight ? G.rpTabs : G.tabs;
        const target = tabs.find(tab => tab.id === targetId);
        if (isRight) switchRightTab(targetId);
        else switchTab(targetId);
        try {
          if (payload && target && target.path !== 'home://' && typeof handleRhfilesFileDrop === 'function') {
            await handleRhfilesFileDrop(payload, target.path, target.entries || [], isRight);
          }
        } finally {
          clearRhfilesFileDragSession();
        }
        return;
      }
      if (!isRhfilesTabDrag(e.dataTransfer) || _dragTabPane !== (isRight ? 'right' : 'left')) return;
      e.preventDefault();
      e.stopPropagation();
      const afterTarget = tabEl.classList.contains('drag-over-after');
      clearTabReorderIndicators(bar);
      let payload = null;
      try { payload = JSON.parse(e.dataTransfer.getData(RHFILES_TAB_DRAG_MIME) || 'null'); } catch (error) {}
      const fromId = Number(payload?.tabId ?? _dragTabId);
      const toId = parseInt(tabEl.dataset.tabId);
      const tabs = isRight ? G.rpTabs : G.tabs;
      if (!reorderTabsByDrop(tabs, fromId, toId, afterTarget)) return;
      _dragTabId = null;
      _dragTabPane = null;
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
      if (_fileDragTabHoverTarget || _dragTabId !== null) return;
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

document.addEventListener('dragover', event => {
  if (!_fileDragTabHoverTarget || !isRhfilesFileDrag(event.dataTransfer)) return;
  if (!event.target.closest?.('.tab')) clearFileDragTabHover();
});
document.addEventListener('dragend', () => {
  clearFileDragTabHover();
  clearRhfilesFileDragSession();
});
document.addEventListener('drop', () => {
  clearFileDragTabHover();
  setTimeout(clearRhfilesFileDragSession, 0);
});

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

function describeNavigationError(error) {
  let raw = '';
  if (typeof error === 'string') raw = error;
  else if (error && typeof error.message === 'string') raw = error.message;
  else if (error != null) {
    try { raw = JSON.stringify(error); } catch (_) { raw = String(error); }
  }

  let code = '';
  const tagged = /^RHFILES_FS_ERROR\|([^|]+)\|(.*)$/s.exec(raw);
  if (tagged) {
    code = tagged[1];
    raw = tagged[2];
  } else if (/access is denied|permission denied|拒绝访问|无权访问|os error 5/i.test(raw)) {
    code = 'permission_denied';
  } else if (/not found|cannot find|找不到|不存在|os error (2|3)\b/i.test(raw)) {
    code = 'not_found';
  } else if (/network.*(unreachable|not found)|找不到网络路径|网络.*不可用|os error (53|67)\b/i.test(raw)) {
    code = 'network_unreachable';
  } else if (/timed? out|超时/i.test(raw)) {
    code = 'timed_out';
  }

  const key = code === 'permission_denied' ? 'permissionDenied'
    : code === 'not_found' ? 'notFound'
    : (code === 'network_unreachable' || code === 'timed_out') ? 'unavailable'
    : 'generic';
  return { code, raw: raw || t('nav.unknownError'), key };
}

function renderNavigationError(path, error, isRight) {
  const info = describeNavigationError(error);
  const list = document.getElementById(isRight ? 'right-file-list' : 'file-list');
  const status = document.getElementById(isRight ? 'right-status-count' : 'status-count');
  if (status) status.textContent = t(`nav.${info.key}Title`);
  if (!list) return;

  list.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = `navigation-error navigation-error-${info.key}`;
  panel.innerHTML =
    '<svg class="navigation-error-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M3.5 7.5h6l2 2h9v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5z" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M12 12v3.2M12 17.5v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>' +
    `<div class="navigation-error-title">${esc(t(`nav.${info.key}Title`))}</div>` +
    `<div class="navigation-error-body">${esc(t(`nav.${info.key}Body`))}</div>` +
    `<div class="navigation-error-path" title="${esc(path)}">${esc(displayPath(path))}</div>` +
    `<details class="navigation-error-details"><summary>${esc(t('nav.errorDetails'))}</summary><div>${esc(info.raw)}</div></details>`;

  const actions = document.createElement('div');
  actions.className = 'navigation-error-actions';
  const retry = document.createElement('button');
  retry.className = 'dialog-btn primary';
  retry.textContent = t('nav.retry');
  retry.addEventListener('click', () => {
    if (isRight) rpNavigateTo(path, false); else navigateTo(path, false);
  });
  actions.appendChild(retry);
  panel.appendChild(actions);
  list.appendChild(panel);
}

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
    if (typeof syncDiskUsageWithActiveFolder === 'function') syncDiskUsageWithActiveFolder(path, false);
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
    if (typeof scheduleFileDialogIntegrationSync === 'function') scheduleFileDialogIntegrationSync();
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
    if (typeof syncDiskUsageWithActiveFolder === 'function') syncDiskUsageWithActiveFolder(path, false);
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
    if (typeof scheduleFileDialogIntegrationSync === 'function') scheduleFileDialogIntegrationSync();
    return true;
  } catch (e) {
    if (navigationToken !== _navigationToken) return false;
    renderNavigationError(path, e, false);
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

function describeSearchError(error) {
  const raw = typeof error === 'string' ? error
    : (error && typeof error.message === 'string' ? error.message : String(error || ''));
  const tagged = /^([^|]+)\|(.*)$/s.exec(raw);
  const code = tagged ? tagged[1] : '';
  const details = tagged ? tagged[2] : raw;
  const key = code === 'EVERYTHING_IPC_UNAVAILABLE' ? 'ipcUnavailable'
    : code === 'EVERYTHING_DB_NOT_READY' ? 'indexNotReady'
    : code === 'EVERYTHING_START_TIMEOUT' ? 'startTimeout'
    : code === 'SEARCH_TIMEOUT' ? 'timeout'
    : 'generic';
  return { key, details: details || t('search.unknownError') };
}

function renderSearchFailure(query, error, isRight) {
  const info = describeSearchError(error);
  const list = document.getElementById(isRight ? 'right-file-list' : 'file-list');
  const status = document.getElementById(isRight ? 'right-status-count' : 'status-count');
  if (status) status.textContent = t('search.failedTitle');
  if (!list) return;

  list.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'navigation-error search-error-state';
  panel.innerHTML =
    '<svg class="navigation-error-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.7"/>' +
      '<path d="m15.5 15.5 5 5M10.5 7.2v4.2M10.5 14.2v.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
    '</svg>' +
    `<div class="navigation-error-title">${esc(t('search.failedTitle'))}</div>` +
    `<div class="navigation-error-body">${esc(t(`search.${info.key}Body`))}</div>` +
    `<details class="navigation-error-details"><summary>${esc(t('nav.errorDetails'))}</summary><div>${esc(info.details)}</div></details>`;
  const actions = document.createElement('div');
  actions.className = 'navigation-error-actions';
  const retry = document.createElement('button');
  retry.className = 'dialog-btn primary';
  retry.textContent = t('nav.retry');
  retry.addEventListener('click', () => runSearch(query));
  actions.appendChild(retry);
  if (info.key === 'ipcUnavailable' || info.key === 'indexNotReady' || info.key === 'startTimeout') {
    const openEverything = document.createElement('button');
    openEverything.className = 'dialog-btn';
    openEverything.textContent = t('search.openEverything');
    openEverything.addEventListener('click', async () => {
      try { await call('open_everything', {}); }
      catch (openError) { showNotice(t('status.searchError', { error: openError })); }
    });
    actions.appendChild(openEverything);
  }
  panel.appendChild(actions);
  list.appendChild(panel);
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
        const request = scopePath
          ? call("search_recursive", { path: scopePath, query: fullQuery, maxResults: 500 })
          : call("quick_search", { query: fullQuery, maxResults: 500 });
        const results = await withTimeout(request, 12000, 'SEARCH_TIMEOUT|The search did not finish within 12 seconds');
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
        renderSearchFailure(query, e, isRight);
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
  const key = String(name || '').toLowerCase();
  const resolved = G.knownFolders && G.knownFolders[key];
  if (resolved) return resolved;
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
