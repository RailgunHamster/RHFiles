// tabs.js — tab management + breadcrumb navigation

function tabName(path) {
  if (path === "home://") return "Home";
  return path;
}

function tabTooltip(path) {
  if (path === "home://") return "Home";
  return path;
}

function saveFolderLayout(path, layout) {
  try {
    const data = JSON.parse(localStorage.getItem('rhfiles-folder-layouts') || '{}');
    data[path] = layout;
    localStorage.setItem('rhfiles-folder-layouts', JSON.stringify(data));
  } catch (e) {}
}

function loadFolderLayout(path) {
  try {
    const data = JSON.parse(localStorage.getItem('rhfiles-folder-layouts') || '{}');
    return data[path] || null;
  } catch (e) { return null; }
}

function renderTabs() {
  const bar = document.getElementById("tab-bar");
  bar.innerHTML = G.tabs.map(t =>
    `<div class="tab ${t.id===G.activeTab?'active':''}" data-tab-id="${t.id}" onclick="switchTab(${t.id})" onauxclick="if(event.button===1)closeTab(${t.id})" title="${esc(tabTooltip(t.path))}" draggable="true">
      <span class="tab-label">${esc(tabName(t.path))}</span>
      <button class="tab-close" onclick="event.stopPropagation();closeTab(${t.id})">&times;</button>
    </div>`
  ).join("") + `<button class="tab-new" onclick="addTab()" title="New tab">
    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
  </button>`;
  initTabDragDrop();
  initTabPreview();
}

function switchTab(id) {
  saveCurrentTabState();
  G.activeTab = id;
  const tab = getTab();
  G.sortField = tab.sortF;
  G.sortAsc = tab.sortAsc;
  renderTabs();
  navigateTo(tab.path, false);
  restoreTabState(tab);
  updateSortArrows();
}

function addTab(path) {
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

function closeTab(id) {
  if (G.tabs.length <= 1) return;
  saveCurrentTabState();
  const idx = G.tabs.findIndex(t => t.id === id);
  G.tabs.splice(idx, 1);
  if (G.activeTab === id) {
    G.activeTab = G.tabs[Math.min(idx, G.tabs.length-1)].id;
    const tab = getTab();
    G.sortField = tab.sortF;
    G.sortAsc = tab.sortAsc;
    renderTabs();
    navigateTo(tab.path, false);
    restoreTabState(tab);
    updateSortArrows();
  } else {
    renderTabs();
  }
}

// --- tab state save/restore ---
function saveCurrentTabState() {
  const tab = getTab();
  if (!tab) return;
  const listEl = document.getElementById("file-list");
  tab._savedState = {
    selPaths: [...(tab.sel || [])].map(i => tab.entries[i]?.path).filter(Boolean),
    scrollTop: listEl ? listEl.scrollTop : 0,
  };
}

function restoreTabState(tab) {
  if (!tab._savedState) return;
  const state = tab._savedState;
  delete tab._savedState;
  if (state.selPaths && state.selPaths.length > 0) {
    tab.sel = new Set();
    state.selPaths.forEach(p => {
      const idx = tab.entries.findIndex(e => e.path === p);
      if (idx >= 0) tab.sel.add(idx);
    });
    if (tab.sel.size > 0) {
      tab.lastIdx = [...tab.sel].pop();
    }
    const listEl = document.getElementById("file-list");
    if (listEl && state.scrollTop) {
      requestAnimationFrame(() => { listEl.scrollTop = state.scrollTop; });
    }
    renderFiles(tab, "file-list", "status-count", "status-selection");
    updatePreviewForSelection();
  }
}

// --- tab drag-and-drop ---
let _dragTabId = null;
function initTabDragDrop() {
  const bar = document.getElementById("tab-bar");
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
      const fromIdx = G.tabs.findIndex(t => t.id === fromId);
      const toIdx = G.tabs.findIndex(t => t.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = G.tabs.splice(fromIdx, 1);
      G.tabs.splice(toIdx, 0, moved);
      renderTabs();
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
      if (_previewTimer) clearTimeout(_previewTimer);
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
    `<div class="tab-preview-meta">${dirCount} folders, ${fileCount} files</div>` +
    `<div class="tab-preview-list">${shown.map(e =>
      `<div class="tab-preview-item${e.is_dir ? ' dir' : ''}">${e.is_dir ? '📁 ' : ''}${esc(e.name)}</div>`
    ).join("")}${entries.length > maxShow ? `<div class="tab-preview-more">...and ${entries.length - maxShow} more</div>` : ''}</div>`;

  const rect = tabEl.getBoundingClientRect();
  _previewEl.style.top = (rect.bottom + 4) + "px";
  _previewEl.style.left = Math.min(rect.left, window.innerWidth - 296) + "px";
  _previewEl.classList.add("visible");
}

function hideTabPreview() {
  if (_previewEl) _previewEl.classList.remove("visible");
}

// --- breadcrumb ---
function renderBreadcrumb(path, bcId, dropdownId, inputId, isRight) {
  const bc = document.getElementById(bcId || "breadcrumb");
  if (path === "home://") {
    bc.innerHTML = `<span class="bc-item" data-path="home://">Home</span><span class="breadcrumb-spacer"></span>`;
    const spacer = bc.querySelector(".breadcrumb-spacer");
    if (spacer) spacer.addEventListener("click", () => enterEditMode(isRight));
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
  const isDriveRoot = /^[A-Za-z]:\\?$/.test(path);
  parts.forEach((part, i) => {
    if (isUnc && i === 0) {
      accumulated = part;
    } else {
      accumulated += (accumulated ? "\\" : "") + part;
    }
    if (isDriveRoot && accumulated.length === 2 && accumulated.endsWith(":")) {
      accumulated += "\\";
    }
    html += `<span class="bc-item" data-path="${esc(accumulated)}">${esc(part)}</span>`;
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
}

async function showBcDropdown(parentPath, sepEl, dropdownId, isRight) {
  const dropdown = document.getElementById(dropdownId || "bc-dropdown");
  const wasOpen = dropdown.classList.contains("show");
  hideDropdown(dropdownId);
  if (wasOpen && dropdown._lastPath === parentPath) return;
  try {
    const entries = await call("list_dir", { path: parentPath, filter: "" });
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
    if (images / total > 0.8) return 'icons';
    return null;
}

// --- navigation ---
async function navigateTo(path, pushHistory) {
  if (pushHistory === undefined) pushHistory = true;
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
    return;
  }
  hideHomePage();
  showFileContent();
  const tab = getTab();
  const filterEl = document.getElementById("filter-input");
  if (filterEl && path !== tab.path) filterEl.value = "";
  try {
    let entries = await call("list_dir", { path, filter: "" });
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
    loadTree(path, true);
    loadGitStatus(path);
    if (typeof loadSvnStatus === 'function') loadSvnStatus(path);
    saveTabState();
    updatePreviewForSelection();
  } catch (e) {
    document.getElementById("status-count").textContent = "Error: " + e;
  }
}

let _quickSearchTimer = null;
let _everythingAvailable = false;
let _searchDropdownIdx = -1;
let _searchMode = 'normal';
let _doubleCtrlTime = 0;

function getSearchEngine() {
    return G.settings.searchEngine || 'auto';
}

let _filterTimer = null;
function applyFilter() {
  if (_filterTimer) clearTimeout(_filterTimer);
  const query = document.getElementById("filter-input").value.trim();
  if (G.deepSearch) { runDeepSearch(); }
  else {
    _filterTimer = setTimeout(() => { navigateTo(getTab().path, false); _filterTimer = null; }, query ? 150 : 0);
  }

  if (query.length < 2) {
    if (query.length === 0) showSearchHistory();
    else hideQuickSearch();
    return;
  }
  if (_quickSearchTimer) clearTimeout(_quickSearchTimer);
  _quickSearchTimer = setTimeout(() => runQuickSearch(query), 300);
}

function toggleSearchMode() {
  const modes = ['normal', 'regex', 'wildcard'];
  const labels = ['Normal', 'Regex', 'Wildcard'];
  const idx = (modes.indexOf(_searchMode) + 1) % modes.length;
  _searchMode = modes[idx];
  const btn = document.getElementById("btn-search-mode");
  if (btn) {
    btn.textContent = _searchMode === 'regex' ? '.*' : _searchMode === 'wildcard' ? '*?' : 'Ab';
    btn.title = `Search mode: ${labels[idx]}`;
  }
  const input = document.getElementById("filter-input");
  if (input && input.value.trim().length >= 2) {
    runQuickSearch(input.value.trim());
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

function saveSearchHistory(query) {
  if (!query || query.length < 2) return;
  let history = JSON.parse(localStorage.getItem('rhfiles-search-history') || '[]');
  history = history.filter(h => h !== query);
  history.unshift(query);
  history = history.slice(0, 30);
  localStorage.setItem('rhfiles-search-history', JSON.stringify(history));
}

function loadSearchHistory() {
  try { return JSON.parse(localStorage.getItem('rhfiles-search-history') || '[]'); } catch (e) { return []; }
}

function clearSearchHistory() {
  localStorage.removeItem('rhfiles-search-history');
  hideQuickSearch();
  showNotice("Search history cleared");
}

function showSearchHistory() {
  const history = loadSearchHistory();
  if (history.length === 0) { hideQuickSearch(); return; }
  const dropdown = document.getElementById("quick-search-dropdown");
  if (!dropdown) return;
  dropdown.innerHTML =
    `<div class="quick-search-header"><span>Recent Searches</span><button class="quick-search-clear" onclick="event.stopPropagation();clearSearchHistory()">Clear</button></div>`;
  for (const h of history) {
    const div = document.createElement("div");
    div.className = "quick-search-item history-item";
    div.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--text-4)"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M4.5 8a3.5 3.5 0 016.5-1.5" stroke="currentColor" stroke-width="1" fill="none" stroke-linecap="round"/></svg>
        <span class="quick-search-item-name">${esc(h)}</span>`;
    div.addEventListener("click", () => {
      document.getElementById("filter-input").value = h;
      applyFilter();
    });
    dropdown.appendChild(div);
  }
  _searchDropdownIdx = -1;
  dropdown.style.display = "block";
  setTimeout(() => document.addEventListener("click", hideQuickSearch, { once: true }), 50);
}

function handleSearchKeydown(e) {
  const dropdown = document.getElementById("quick-search-dropdown");
  if (!dropdown || dropdown.style.display === 'none') return;
  const items = dropdown.querySelectorAll('.quick-search-item:not(.quick-search-header)');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    e.stopPropagation();
    _searchDropdownIdx = Math.min(_searchDropdownIdx + 1, items.length - 1);
    updateDropdownHighlight(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    _searchDropdownIdx = Math.max(_searchDropdownIdx - 1, 0);
    updateDropdownHighlight(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    if (_searchDropdownIdx >= 0 && items[_searchDropdownIdx]) {
      items[_searchDropdownIdx].click();
    }
  } else if (e.key === 'Escape') {
    hideQuickSearch();
    hideSearchHelp();
    e.preventDefault();
  }
}

function updateDropdownHighlight(items) {
  items.forEach((item, i) => {
    item.classList.toggle('active', i === _searchDropdownIdx);
    if (i === _searchDropdownIdx) item.scrollIntoView({ block: 'nearest' });
  });
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
        _everythingAvailable = await call("is_everything_available", {});
        const input = document.getElementById("filter-input");
        const engine = getSearchEngine();
        if (input) {
            const modeHint = _searchMode === 'regex' ? ' [Regex]' : _searchMode === 'wildcard' ? ' [Wildcard]' : '';
            if (engine === 'everything' || (engine === 'auto' && _everythingAvailable)) {
                input.placeholder = "Quick Search..." + modeHint;
            } else {
                input.placeholder = "Search..." + modeHint;
            }
            input.addEventListener('focus', () => {
              if (!input.value.trim()) showSearchHistory();
            });
            input.addEventListener('keydown', e => {
              handleSearchKeydown(e);
            });
        }
        initDoubleCtrlSearch();
    } catch (e) {}
}

async function runQuickSearch(query) {
    const engine = getSearchEngine();
    const modePrefix = _searchMode === 'regex' ? 'regex:' : _searchMode === 'wildcard' ? 'wildcards:' : '';
    const fullQuery = modePrefix + query;
    try {
        const results = await call("quick_search", { query: fullQuery, maxResults: 50, engine });
        if (query.trim().length >= 2) saveSearchHistory(query);
        showQuickSearchResults(results, engine);
    } catch (e) {
        if (engine === 'everything') {
            showQuickSearchError("Everything not running. Install from voidtools.com");
        } else {
            hideQuickSearch();
        }
    }
}

function showQuickSearchError(msg) {
    const dropdown = document.getElementById("quick-search-dropdown");
    if (!dropdown) return;
    dropdown.innerHTML =
        `<div class="quick-search-header"><span style="color:var(--text-4)">Quick Search</span></div>` +
        `<div style="padding:12px;text-align:center;color:var(--text-3);font-size:12px">
            <div style="margin-bottom:8px">${esc(msg)}</div>
            <a href="https://www.voidtools.com" target="_blank" style="color:var(--accent);text-decoration:underline">Download Everything (free)</a>
            <div style="margin-top:8px;color:var(--text-4)">Or change search engine in Settings</div>
        </div>`;
    _searchDropdownIdx = -1;
    dropdown.style.display = "block";
    setTimeout(() => document.addEventListener("click", hideQuickSearch, { once: true }), 50);
}

function showQuickSearchResults(results, engine) {
    const dropdown = document.getElementById("quick-search-dropdown");
    if (!dropdown || results.length === 0) { hideQuickSearch(); return; }

    const isEv = engine !== 'builtin' && _everythingAvailable;
    const engineLabel = isEv
        ? '<span class="fast">⚡ Everything</span>'
        : '<span>Builtin</span>';
    const modeLabel = _searchMode !== 'normal' ? ` <span style="color:var(--accent)">${_searchMode}</span>` : '';

    dropdown.innerHTML =
        `<div class="quick-search-header"><span>${results.length} results${modeLabel}</span><span class="quick-search-engine">${engineLabel}</span></div>`;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const div = document.createElement("div");
      div.className = "quick-search-item" + (r.is_dir ? " dir" : "");
      div.dataset.path = r.path;
      div.dataset.index = i;
      div.innerHTML = `<span class="quick-search-item-name">${r.is_dir ? '📁 ' : ''}${esc(r.name)}</span>
                <span class="quick-search-item-meta">${r.size ? fmtSize(r.size) : ''}${r.modified ? ' · ' + r.modified.split(' ')[0] : ''}</span>
                <span class="quick-search-item-path">${esc(r.path)}</span>`;
      div.addEventListener("click", () => quickSearchNavigate(r.path));
      dropdown.appendChild(div);
    }
    _searchDropdownIdx = -1;
    dropdown.style.display = "block";

    setTimeout(() => document.addEventListener("click", hideQuickSearch, { once: true }), 50);
}

function hideQuickSearch() {
  const dropdown = document.getElementById("quick-search-dropdown");
  if (dropdown) dropdown.style.display = "none";
  _searchDropdownIdx = -1;
}

function quickSearchNavigate(path) {
  hideQuickSearch();
  const input = document.getElementById("filter-input");
  if (input) {
    saveSearchHistory(input.value.trim());
    input.value = "";
  }
  const parentPath = path.replace(/\\[^\\]+$/, '');
  navigateTo(parentPath);
  setTimeout(() => {
    const tab = getTab();
    const idx = tab.entries.findIndex(e => e.path === path);
    if (idx >= 0) {
      tab.sel.clear();
      tab.sel.add(idx);
      tab.lastIdx = idx;
      renderFiles(tab, "file-list", "status-count", "status-selection");
      scrollToVisible(idx);
    }
  }, 200);
}

// --- deep search ---
G.deepSearch = false;
function toggleDeepSearch() {
  G.deepSearch = !G.deepSearch;
  const btn = document.getElementById("btn-deep-search");
  if (G.deepSearch) {
    btn.style.background = "var(--accent-light)";
    btn.style.color = "var(--accent)";
  } else {
    btn.style.background = "";
    btn.style.color = "";
  }
  if (document.getElementById("filter-input").value) applyFilter();
}

async function runDeepSearch() {
  const query = document.getElementById("filter-input").value;
  if (!query) { navigateTo(getTab().path, false); return; }
  const tab = getTab();
  try {
    document.getElementById("status-count").textContent = "Searching...";
    const results = await call("search_recursive", { path: tab.path, query, maxResults: 500 });
    tab.entries = results;
    tab.sel.clear();
    tab.lastIdx = -1;
    renderFiles(tab, "file-list", "status-count", "status-selection");
  } catch (e) {
    document.getElementById("status-count").textContent = "Search error: " + e;
  }
}

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
    { name: "Desktop", path: homeDir("Desktop"), icon: "M1.5 3h13v10H1.5z M5 14h6" },
    { name: "Downloads", path: homeDir("Downloads"), icon: "M8 2v7M5 6l3 3 3-3M2.5 10v3h11v-3" },
    { name: "Documents", path: homeDir("Documents"), icon: "M3 2h5l4 4v8H3z M8 2v4h4" },
    { name: "Pictures", path: homeDir("Pictures"), icon: "M1 2h14v12H1z" },
    { name: "Music", path: homeDir("Music"), icon: "M4 12a2 2 0 11-0-4M12 10a2 2 0 11-0-4M6 12V3l8-2v9" },
    { name: "Videos", path: homeDir("Videos"), icon: "M1 3h14v10H1z" },
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

  const recentData = JSON.parse(localStorage.getItem('rhfiles-recent') || '[]');
  const homeRecent = document.getElementById("home-recent");
  homeRecent.innerHTML = "";
  recentData.slice(0, 20).forEach(r => {
    const div = document.createElement("div");
    div.className = "home-recent-item";
    div.innerHTML = `<span>${esc(r.name)}</span><span style="color:var(--text-4);font-size:11px">${esc(r.path)}</span>`;
    div.addEventListener("click", () => navigateTo(r.path.replace(/\\[^\\]+$/, '')));
    homeRecent.appendChild(div);
  });
  if (!recentData.length) homeRecent.innerHTML = '<div style="color:var(--text-4);padding:8px">No recent files</div>';
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
    const parent = await call("parent_path", { path: getTab().path });
    await navigateTo(parent);
  } catch (e) {}
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

async function refresh() {
  G.gitCache = {};
  const tab = getTab();
  await navigateTo(tab.path, false);
  if (G.dualOn) {
    await rpNavigateTo(G.rp.path, false);
  }
}

function setLayout(layout) {
  G.layout = layout;
  localStorage.setItem('rhfiles-layout', layout);
  saveFolderLayout(getTab().path, layout);
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
