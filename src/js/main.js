// main.js — initialization and event wiring

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  applyI18n();
  if (typeof initCommands === 'function') initCommands();
  if (typeof restorePreviewPane === 'function') restorePreviewPane();
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
    if (saved.rightTabs && saved.rightTabs.length > 0) {
      G.rpTabs = saved.rightTabs.map((st, index) => ({
        id: st.id || 100000 + index,
        path: st.path || startPath,
        history: [st.path || startPath], histIdx: 0,
        entries: [], sel: new Set(), lastIdx: -1,
        sortF: st.sortF || 'name', sortAsc: st.sortAsc !== false,
      }));
      G.activeRpTab = saved.activeRpTab && G.rpTabs.some(tab => tab.id === saved.activeRpTab)
        ? saved.activeRpTab
        : G.rpTabs[0].id;
      G.rp = getRightTab(G.activeRpTab);
      G.nextRpTabId = Math.max(...G.rpTabs.map(tab => tab.id)) + 1;
      G.rpInitialized = true;
    }
  } else {
    getTab().path = startPath;
    getTab().history = [startPath];
    getTab().historyIdx = 0;
  }

  let initialPathLoaded = false;
  try {
    initialPathLoaded = await withTimeout(
      navigateTo(getTab().path, false),
      5000,
      "Initial folder load timed out"
    );
  } catch (e) {}
  if (!initialPathLoaded) {
    try {
      initialPathLoaded = await withTimeout(
        navigateTo("C:\\", false),
        3000,
        "Fallback folder load timed out"
      );
    } catch (e) {}
  }
  if (!initialPathLoaded) await navigateTo("home://", false);

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
  Promise.allSettled([
    withTimeout(loadDrives(), 3000, "Drive discovery timed out"),
    withTimeout(loadTagList(), 3000, "Tag loading timed out"),
    withTimeout(loadPinnedFolders(), 3000, "Pinned folder loading timed out"),
  ]);
  document.querySelectorAll(".sidebar-item[data-nav]").forEach(el => {
    el.addEventListener("click", () => navigateTo(homeDir(el.dataset.nav)));
  });
  const ftpBtn = document.getElementById("ftp-connect-btn");
  if (ftpBtn) ftpBtn.addEventListener("click", showFtpDialog);
  loadRecentList();

  initQuickSearch();
  scheduleOptionalDiscovery();
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
      if (file.is_dir) { showNotice(t('alert.cannotNavArchive')); }
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
      if (document.body.classList.contains('preview-fullscreen-active')) {
        togglePreviewFullscreen(false);
        e.preventDefault();
        return;
      }
      closeDiskUsageDialog();
      closeCommandPalette();
      closeBatchRename();
      closeProperties();
      closeTagDialog();
      closeSettings();
      closeConflict();
    }
  });

  if (G.windowLabel === "main" && G.settings.autoUpdateEnabled !== false) {
    setTimeout(() => checkForUpdates(false), 5000);
  }
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
        activeRpTab: G.activeRpTab,
        rightTabs: (G.rpTabs || []).map(t => ({
          id: t.id,
          path: t.path,
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
  showApplicationContextMenu(e);
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

function getUpdateSource() {
  return G.settings.updateSource || 'https://github.com/RailgunHamster/RHFiles';
}

function updateSettingsStatusText(status, error) {
  const element = document.getElementById('settings-update-status');
  if (!element) return;
  if (error) {
    element.textContent = t('update.statusError');
  } else if (!status) {
    element.textContent = t('update.statusUnknown');
  } else if (!status.managed) {
    element.textContent = t('update.statusBootstrap', {version: status.currentVersion || ''});
  } else if (status.availableVersion) {
    element.textContent = t(status.pendingRestart ? 'update.statusReady' : 'update.statusAvailable', {
      version: status.availableVersion,
    });
  } else {
    element.textContent = t('update.statusCurrent', {version: status.currentVersion || ''});
  }
}

async function refreshUpdateSettingsStatus() {
  const button = document.getElementById('settings-check-update');
  updateSettingsStatusText(null);
  if (button) button.disabled = true;
  try {
    const status = await call('check_updates', {source: getUpdateSource()});
    G._updateStatus = status;
    updateSettingsStatusText(status);
  } catch (error) {
    updateSettingsStatusText(null, error);
  } finally {
    if (button) button.disabled = false;
  }
}

async function checkForUpdates(manual) {
  if (G._updateCheckRunning) return;
  G._updateCheckRunning = true;
  const button = document.getElementById('settings-check-update');
  if (button) button.disabled = true;
  try {
    const source = getUpdateSource();
    const status = await call('check_updates', {source});
    G._updateStatus = status;
    updateSettingsStatusText(status);

    if (!status || !status.managed) {
      if (manual) showNotice(t('update.bootstrapRequired'));
      return;
    }
    if (!status.availableVersion) {
      if (manual) showNotice(t('update.noUpdate', {version: status.currentVersion || ''}));
      return;
    }
    if (document.getElementById('progress-overlay')?.style.display !== 'none') {
      if (manual) showNotice(t('update.busy'));
      return;
    }

    const version = status.availableVersion;
    const noticeKey = 'rhfiles-update-notified';
    if (!manual && localStorage.getItem(noticeKey) === version) return;
    const notes = String(status.releaseNotes || '').trim();
    const confirmed = await showConfirmDialog({
      kind: 'update',
      title: t(status.pendingRestart ? 'update.readyTitle' : 'update.availableTitle'),
      message: t(status.pendingRestart ? 'update.readyMessage' : 'update.availableMessage', {version}),
      detail: notes ? notes.slice(0, 600) : t('update.restartHint'),
      confirmLabel: t(status.pendingRestart ? 'update.restartNow' : 'update.downloadRestart'),
      cancelLabel: t('update.later'),
    });
    if (!confirmed) {
      localStorage.setItem(noticeKey, version);
      return;
    }

    if (!status.pendingRestart) {
      showProgress(t('update.downloading', {version}), {cancellable:false});
      await call('download_update', {source});
    } else {
      showProgress(t('update.preparing', {version}), {indeterminate:true, cancellable:false});
    }
    document.getElementById('progress-title').textContent = t('update.restarting');
    updateProgress({percentage:100, speed:0, totalBytes:0, bytesTransferred:0});
    try { saveTabState(); } catch (error) {}
    await call('apply_update', {source});
  } catch (error) {
    hideProgress();
    updateSettingsStatusText(null, error);
    if (manual) showNotice(t('update.failed', {error: String(error)}));
  } finally {
    G._updateCheckRunning = false;
    if (button) button.disabled = false;
  }
}
