// main.js — initialization and event wiring

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof initCommands === 'function') initCommands();
  await initI18n();
  applyI18n();
  document.querySelectorAll(".layout-btn").forEach(b => b.classList.toggle("active", b.dataset.layout === G.layout));
  renderTabs();
  updateSortArrows();

  {
    const [home, label] = await Promise.all([
      call("get_env", { key: "USERPROFILE" }).catch(() => "C:\\"),
      call("get_window_label", {}).catch(() => "main"),
    ]);
    G.homeDirPath = home || "C:\\";
    G.windowLabel = label || "main";
  }

  let saved = null;
  let geo = null;
  try {
    const ws = await call("load_window_state", { window_id: G.windowLabel });
    if (ws && ws.state_json) {
      try {
        const parsed = JSON.parse(ws.state_json);
        if (parsed.initial_path) {
          saved = { activeTab: 0, tabs: [{ id: 0, path: parsed.initial_path, sortF: "name", sortAsc: true }] };
        } else if (parsed.tabs) {
          saved = parsed;
        }
      } catch(e) {}
      geo = ws;
    }
  } catch (e) {}

  if (!saved) saved = loadTabState();

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
  document.querySelectorAll(".sidebar-item[data-nav]").forEach(el => {
    el.addEventListener("click", () => navigateTo(homeDir(el.dataset.nav)));
  });
  const ftpBtn = document.getElementById("ftp-connect-btn");
  if (ftpBtn) ftpBtn.addEventListener("click", showFtpDialog);
  loadTree(getTab().path, true);

  await loadTagList();
  await loadPinnedFolders();
  loadRecentList();

  initQuickSearch();
  renderNetwork();
  renderMtpDevices();
  loadCloudProviders();
  try { detectWSLDistros(); } catch(e) {}
  try { detectWindowsLibraries(); } catch(e) {}
  startFileWatch();
  setupProgressListener();
  initBoxSelection(document.getElementById("file-list"));
  initBoxSelection(document.getElementById("right-file-list"));

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
      if (file.is_dir) { showNotice("Cannot navigate into archive subdirectories"); }
      else extractArchiveEntry(idx);
    } else if (file.is_dir) {
      navigateTo(file.path);
    } else {
      const ext = (file.extension || "").toLowerCase();
      if (ext === "zip") {
        await openArchive(file.path);
      } else {
        try { await call("open_file", { path: file.path }); addRecentFile(file.path, file.name, false, file.extension); } catch (ex) {}
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
        try { await call("open_file", { path: file.path }); addRecentFile(file.path, file.name, false, file.extension); } catch (ex) {}
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

  if (G.windowLabel === "main") {
    call("restore_window_geometry", {}).catch(() => {});
  }

  let _cleanupDone = false;
  setInterval(() => {
    try {
      const listEl = document.getElementById("file-list");
      const state = {
        activeTab: G.activeTab,
        tabs: G.tabs.map(t => ({
          id: t.id,
          path: t.path,
          selPaths: [...(t.sel || [])].map(i => t.entries[i]?.path).filter(Boolean),
          scrollTop: listEl && t.id === G.activeTab ? listEl.scrollTop : (t._savedState?.scrollTop || 0),
          sortF: t.sortF,
          sortAsc: t.sortAsc,
        })),
      };
      call("save_current_window_geometry", {
        state_json: JSON.stringify(state),
      }).catch(() => {});
      if (!_cleanupDone) {
        _cleanupDone = true;
        call("cleanup_stale_windows", {}).catch(() => {});
      }
    } catch(e) {}
  }, 15000);
});

document.addEventListener("contextmenu", e => {
  e.preventDefault();
  removeContextMenu();
  if (e.shiftKey) {
    const isRight = G.lastActivePane === 'right';
    const path = isRight ? G.rp.path : getTab().path;
    call("show_native_context_menu", { path, x: e.clientX, y: e.clientY });
    return;
  }
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
