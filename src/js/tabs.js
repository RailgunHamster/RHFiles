// tabs.js — tab management + breadcrumb navigation

function tabName(path) {
  const parts = path.replace(/\\/g,"/").split("/").filter(Boolean);
  return parts.length ? parts[parts.length-1] : path;
}

function renderTabs() {
  const bar = document.getElementById("tab-bar");
  bar.innerHTML = G.tabs.map(t =>
    `<div class="tab ${t.id===G.activeTab?'active':''}" onclick="switchTab(${t.id})" onauxclick="if(event.button===1)closeTab(${t.id})">
      <span class="tab-label">${esc(tabName(t.path))}</span>
      <button class="tab-close" onclick="event.stopPropagation();closeTab(${t.id})">&times;</button>
    </div>`
  ).join("") + `<button class="tab-new" onclick="addTab()" title="New tab">
    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
  </button>`;
}

function switchTab(id) {
  G.activeTab = id;
  const tab = getTab();
  tab.sel.clear();
  tab.lastIdx = -1;
  G.sortField = tab.sortF;
  G.sortAsc = tab.sortAsc;
  renderTabs();
  navigateTo(tab.path, false);
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
  const idx = G.tabs.findIndex(t => t.id === id);
  G.tabs.splice(idx, 1);
  if (G.activeTab === id) {
    G.activeTab = G.tabs[Math.min(idx, G.tabs.length-1)].id;
    const tab = getTab();
    G.sortField = tab.sortF;
    G.sortAsc = tab.sortAsc;
    renderTabs();
    navigateTo(tab.path, false);
    updateSortArrows();
  } else {
    renderTabs();
  }
}

// --- breadcrumb ---
function renderBreadcrumb(path, bcId, dropdownId, inputId, isRight) {
  const bc = document.getElementById(bcId || "breadcrumb");
  const parts = path.replace(/\\/g,"/").split("/").filter(Boolean);
  let html = "", accumulated = "";
  parts.forEach((part, i) => {
    accumulated += (i === 0 ? "" : "/") + part;
    const fullPath = i === 0 ? part + "\\" : accumulated.replace(/\//g, "\\");
    html += `<span class="bc-item" data-path="${esc(fullPath)}">${esc(part)}</span>`;
    if (i < parts.length - 1) {
      html += `<span class="bc-sep" data-path="${esc(fullPath)}">\u203a</span>`;
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

// --- navigation ---
async function navigateTo(path, pushHistory) {
  if (pushHistory === undefined) pushHistory = true;
  const tab = getTab();
  const filter = document.getElementById("filter-input").value;
  try {
    let entries = await call("list_dir", { path, filter: "" });
    if (!G.showHidden) entries = entries.filter(e => !e.is_hidden);
    if (filter) {
      const lower = filter.toLowerCase();
      entries = entries.filter(e => e.name.toLowerCase().includes(lower));
    }
    entries = sortEntriesList(entries, tab.sortF, tab.sortAsc);
    tab.entries = entries;
    if (pushHistory && path !== tab.path) {
      tab.history = tab.history.slice(0, tab.historyIdx + 1);
      tab.history.push(path);
      tab.historyIdx = tab.history.length - 1;
    }
    tab.path = path;
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
    saveTabState();
    updatePreviewForSelection();
  } catch (e) {
    document.getElementById("status-count").textContent = "Error: " + e;
  }
}

function applyFilter() {
  if (G.deepSearch) runDeepSearch();
  else navigateTo(getTab().path, false);
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
