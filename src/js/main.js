// main.js — initialization and event wiring

document.addEventListener("DOMContentLoaded", async () => {
  applyI18n();
  document.querySelectorAll(".layout-btn").forEach(b => b.classList.toggle("active", b.dataset.layout === G.layout));
  renderTabs();
  updateSortArrows();

  try { G.homeDirPath = await call("get_env", { key: "USERPROFILE" }); } catch (e) { G.homeDirPath = "C:\\"; }

  // restore tab state
  const saved = loadTabState();
  const startPath = G.homeDirPath || "C:\\";
  if (saved && saved.tabs && saved.tabs.length > 0) {
    G.tabs = saved.tabs.map((st, i) => ({
      id: st.id || i, path: st.path || startPath,
      history: [st.path || startPath], historyIdx: 0,
      entries: [], sel: new Set(), lastIdx: -1,
      sortF: st.sortF || "name", sortAsc: st.sortAsc !== undefined ? st.sortAsc : true,
      _restoredSelPaths: st.selPaths || [],
      _restoredScrollTop: st.scrollTop || 0,
    }));
    G.activeTab = saved.activeTab || G.tabs[0].id;
    G.nextTabId = Math.max(...G.tabs.map(t => t.id)) + 1;
  } else {
    getTab().path = startPath;
    getTab().history = [startPath];
    getTab().historyIdx = 0;
  }

  await navigateTo(getTab().path, false);

  // restore selection and scroll position after navigation
  const activeTab = getTab();
  if (activeTab._restoredSelPaths && activeTab._restoredSelPaths.length > 0) {
    activeTab.sel = new Set();
    activeTab._restoredSelPaths.forEach(p => {
      const idx = activeTab.entries.findIndex(e => e.path === p);
      if (idx >= 0) activeTab.sel.add(idx);
    });
    if (activeTab.sel.size > 0) {
      activeTab.lastIdx = [...activeTab.sel].pop();
    }
    delete activeTab._restoredSelPaths;
    renderFiles(activeTab, "file-list", "status-count", "status-selection");
    updatePreviewForSelection();
  }
  if (activeTab._restoredScrollTop) {
    const listEl = document.getElementById("file-list");
    const scrollTarget = activeTab._restoredScrollTop;
    delete activeTab._restoredScrollTop;
    requestAnimationFrame(() => { if (listEl) listEl.scrollTop = scrollTarget; });
  }
  await loadDrives();
  loadTree(getTab().path, true);
  await loadTagList();
  renderNetwork();
  renderMtpDevices();
  startFileWatch();
  setupProgressListener();
  initBoxSelection(document.getElementById("file-list"));
  initBoxSelection(document.getElementById("right-file-list"));

  // load file tags for display
  try {
    const allTags = await call("load_all_tags", {});
    if (allTags) G.tagCache = allTags;
  } catch (e) {}

  // render pinned folders
  try { renderPinnedFolders(); } catch (e) {}

  // single instance: listen for navigate-to-path from second instance
  if (window.__TAURI_INTERNALS__) {
    const { listen } = window.__TAURI_INTERNALS__.event || {};
    if (listen) {
      listen("navigate-to-path", (event) => {
        if (event.payload) navigateTo(event.payload);
      }).catch(() => {});
      listen("deep-link://request", (event) => {
        try {
          const urls = event.payload && event.payload.urls ? event.payload.urls : [];
          if (urls.length > 0) {
            let path = urls[0].replace(/^rhfiles:\/\//, '').replace(/\//g, '\\');
            if (path) navigateTo(path);
          }
        } catch (e) {}
      }).catch(() => {});
    }
  }

  // double-click handling for left pane
  document.getElementById("file-list").addEventListener("dblclick", async e => {
    const row = e.target.closest(".file-row");
    if (!row) return;
    const idx = parseInt(row.dataset.index);
    const file = getTab().entries[idx];
    if (!file) return;
    if (file.archive_entry) {
      if (file.is_dir) {} // can't navigate inside archive dirs
      else extractArchiveEntry(idx);
    } else if (file.is_dir) {
      navigateTo(file.path);
    } else {
      const ext = (file.extension || "").toLowerCase();
      if (ext === "zip") {
        await openArchive(file.path);
      } else {
        try { await call("open_file", { path: file.path }); } catch (ex) {}
      }
    }
  });

  // double-click handling for right pane
  document.getElementById("right-file-list").addEventListener("dblclick", async e => {
    const row = e.target.closest(".file-row");
    if (!row) return;
    const idx = parseInt(row.dataset.index);
    const file = G.rp.entries[idx];
    if (!file) return;
    if (file.is_dir) {
      rpNavigateTo(file.path);
    } else {
      const ext = (file.extension || "").toLowerCase();
      if (ext === "zip") {
        await openArchive(file.path);
      } else {
        try { await call("open_file", { path: file.path }); } catch (ex) {}
      }
    }
  });

  // Close overlays on backdrop click
  document.querySelectorAll(".dialog-backdrop, .palette-backdrop").forEach(el => {
    el.addEventListener("click", () => {
      closeCommandPalette();
      closeBatchRename();
      closeProperties();
      closeTagDialog();
      closeSettings();
      closeConflict();
    });
  });

  // ESC closes all overlays
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeCommandPalette();
      closeBatchRename();
      closeProperties();
      closeTagDialog();
      closeSettings();
      closeConflict();
    }
  });

  setTimeout(() => checkForUpdates(), 5000);
  applyToolbarConfig();
});

document.addEventListener("contextmenu", e => {
  e.preventDefault();
  removeContextMenu();
  const isRight = G.lastActivePane === 'right';
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;`;
  const items = [
    { label: "New Folder", shortcut: "F7", action: newFolder },
    { label: "New File...", shortcut: "Ctrl+Shift+N", action: () => showNewFileDialog(isRight) },
    { label: "-", action: null },
    { label: "Paste", shortcut: "Ctrl+V", action: () => paste(isRight), disabled: !G.clipboard },
    { label: "-", action: null },
    { label: "Refresh", shortcut: "F5", action: refresh },
    { label: "Select All", shortcut: "Ctrl+A", action: () => selectAll(isRight) },
    { label: "-", action: null },
    { label: G.showHidden ? "Hide Hidden Items" : "Show Hidden Items", action: toggleHidden },
    { label: "Open in Terminal", action: () => { const path = isRight ? G.rp.path : getTab().path; call("open_terminal", { path, terminal: G.settings.terminal || "wt" }); } },
    { label: "Properties", action: () => showPropertiesDialog(isRight ? G.rp.path : getTab().path) },
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
    if (rect.right > window.innerWidth) menu.style.left = (e.clientX - rect.width) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (e.clientY - rect.height) + "px";
  });
});

window.addEventListener('error', (e) => {
    call("log_error", {
        message: e.message || String(e.error),
        source: e.filename || "",
        stack: e.error?.stack || ""
    }).catch(() => {});
});

window.addEventListener('unhandledrejection', (e) => {
    call("log_error", {
        message: String(e.reason),
        source: "promise",
        stack: e.reason?.stack || ""
    }).catch(() => {});
});

async function checkForUpdates() {
    try {
        const result = await call("check_updates", {});
        if (result) {
            const [version, url] = result.split("|");
            const msg = `RHFiles ${version} is available. Open download page?`;
            if (confirm(msg)) {
                window.open(url, "_blank");
            }
        }
    } catch (e) {}
}
