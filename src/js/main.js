// main.js — initialization and event wiring

let _startupWatchdogTimer = null;

function startupIssueText(error) {
  if (error && typeof error.message === 'string') return error.message;
  return String(error || 'Unknown startup error');
}

function reportStartupIssue(stage, error) {
  call('log_error', {
    message: `Startup ${stage}: ${startupIssueText(error)}`,
    source: 'startup',
    stack: error?.stack || '',
  }).catch(() => {});
}

function beginStartupWatchdog() {
  clearTimeout(_startupWatchdogTimer);
  _startupWatchdogTimer = setTimeout(() => {
    if (G.startupReady === true) return;
    const tab = typeof getTab === 'function' ? getTab() : null;
    const list = document.getElementById('file-list');
    const homeVisible = document.getElementById('home-page')?.style.display !== 'none';
    if (list && !homeVisible && tab?._loaded !== true && list.childElementCount === 0
        && typeof renderNavigationError === 'function') {
      renderNavigationError(
        tab?.path || '',
        new Error(t('nav.startupTimedOutDetail')),
        false,
      );
    }
    reportStartupIssue('watchdog', new Error('Application initialization did not finish within 12 seconds'));
  }, 12000);
}

function completeStartup() {
  G.startupReady = true;
  document.documentElement.dataset.appReady = 'true';
  clearTimeout(_startupWatchdogTimer);
  _startupWatchdogTimer = null;
}

document.addEventListener("DOMContentLoaded", async () => {
  beginStartupWatchdog();
  try {
    await withTimeout(initI18n(), 3500, 'Language resources timed out');
  } catch (error) {
    reportStartupIssue('language', error);
  }
  applyI18n();
  if (typeof initCommands === 'function') initCommands();
  if (typeof restorePreviewPane === 'function') restorePreviewPane();
  document.querySelectorAll(".layout-btn").forEach(b => b.classList.toggle("active", b.dataset.layout === G.layout));
  renderTabs();
  updateSortArrows();

  {
    const [knownFolders, label] = await Promise.all([
      withTimeout(call("get_known_folders", {}), 3000, 'Known folders timed out').catch(async error => {
        reportStartupIssue('known-folders', error);
        const home = await withTimeout(
          call("get_env", { key: "USERPROFILE" }),
          1500,
          'Home folder lookup timed out',
        ).catch(() => "C:\\");
        return { home: home || "C:\\" };
      }),
      withTimeout(call("get_window_label", {}), 2000, 'Window label timed out').catch(error => {
        reportStartupIssue('window-label', error);
        return "main";
      }),
    ]);
    G.knownFolders = knownFolders || {};
    G.homeDirPath = G.knownFolders.home || "C:\\";
    G.windowLabel = label || "main";
  }

  let saved = null;
  let geo = null;
  try {
    const ws = await withTimeout(
      call("load_window_state", { windowId: G.windowLabel }),
      3000,
      'Saved window state timed out',
    );
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
  } catch (error) {
    reportStartupIssue('saved-window-state', error);
  }

  if (!saved) saved = loadTabState();

  const startPath = G.homeDirPath || "C:\\";
  if (saved && saved.tabs && saved.tabs.length > 0) {
    G.tabs = saved.tabs.map((st, i) => ({
      id: st.id || i, path: migrateLegacyKnownFolderPath(st.path || startPath),
      history: [migrateLegacyKnownFolderPath(st.path || startPath)], historyIdx: 0,
      entries: [], sel: new Set(), lastIdx: -1,
      _loaded: false,
      sortF: st.sortF || "name", sortAsc: st.sortAsc !== undefined ? st.sortAsc : true,
      pinned: st.pinned === true,
      _restoredSelPaths: st.selPaths || [],
      _restoredScrollTop: st.scrollTop || 0,
    }));
    normalizePinnedTabOrder(G.tabs);
    G.activeTab = saved.activeTab || G.tabs[0].id;
    G.nextTabId = Math.max(...G.tabs.map(t => t.id)) + 1;
    if (saved.rightTabs && saved.rightTabs.length > 0) {
      G.rpTabs = saved.rightTabs.map((st, index) => ({
        id: st.id || 100000 + index,
        path: migrateLegacyKnownFolderPath(st.path || startPath),
        history: [migrateLegacyKnownFolderPath(st.path || startPath)], histIdx: 0,
        entries: [], sel: new Set(), lastIdx: -1,
        _loaded: false,
        sortF: st.sortF || 'name', sortAsc: st.sortAsc !== false,
        pinned: st.pinned === true,
      }));
      normalizePinnedTabOrder(G.rpTabs);
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
  } catch (error) {
    reportStartupIssue('initial-folder', error);
  }
  if (!initialPathLoaded) {
    try {
      initialPathLoaded = await withTimeout(
        navigateTo("C:\\", false),
        3000,
        "Fallback folder load timed out"
      );
    } catch (error) {
      reportStartupIssue('fallback-folder', error);
    }
  }
  if (!initialPathLoaded) await navigateTo("home://", false);
  if (typeof syncFileDialogIntegration === 'function') {
    await withTimeout(
      syncFileDialogIntegration(true),
      3000,
      'Windows integration startup timed out',
    ).catch(error => reportStartupIssue('windows-integration', error));
    window.addEventListener('focus', () => scheduleFileDialogIntegrationSync(true));
  }

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
  if (G.windowLabel === 'main' && typeof loadInterruptedOperationReports === 'function') {
    loadInterruptedOperationReports();
  }
  initBoxSelection(document.getElementById("file-list"));
  initBoxSelection(document.getElementById("right-file-list"));

  // single instance: listen for navigate-to-path from second instance
  const listen = window.__TAURI_INTERNALS__?.event?.listen || window.__TAURI__?.event?.listen;
  if (listen) {
    listen("navigate-to-path", (event) => {
      if (event.payload) navigateAddressInput(event.payload, false);
    }).catch(() => {});
    listen("deep-link://request", (event) => {
      try {
        const urls = event.payload && event.payload.urls ? event.payload.urls : [];
        if (urls.length > 0) {
          let path = urls[0].replace(/^rhfiles:\/\//, '').replace(/\//g, '\\');
          if (path) navigateAddressInput(path, false);
        }
      } catch (e) {}
    }).catch(() => {});
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
      if (typeof closeMediaConvertDialog === 'function') closeMediaConvertDialog();
    }
  });

  if (G.windowLabel === "main") {
    const runAutomaticUpdateCheck = () => {
      if (isAutomaticUpdateCheckEnabled()) checkForUpdates(false);
    };
    setTimeout(runAutomaticUpdateCheck, UPDATE_CHECK_STARTUP_DELAY_MS);
    setInterval(runAutomaticUpdateCheck, UPDATE_CHECK_INTERVAL_MS);
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
          pinned: t.pinned === true,
        })),
        activeRpTab: G.activeRpTab,
        rightTabs: (G.rpTabs || []).map(t => ({
          id: t.id,
          path: t.path,
          sortF: t.sortF,
          sortAsc: t.sortAsc,
          pinned: t.pinned === true,
        })),
      };
      call("save_current_window_geometry", {
        stateJson: JSON.stringify(state),
      }).catch(() => {});
      if (!_cleanupDone) {
        _cleanupDone = true;
        call("cleanup_stale_windows", {}).catch(() => {});
      }
    } catch(e) {}
  }, 15000);
  completeStartup();
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
  return G.settings.updateSourceMode === 'server'
    ? getServerUpdateSource()
    : getGithubUpdateSource();
}

function getGithubUpdateSource() {
  return String(G.settings.githubUpdateSource || '').trim() || DEFAULT_GITHUB_UPDATE_SOURCE;
}

function getServerUpdateSource() {
  return String(G.settings.serverUpdateSource || '').trim() || DEFAULT_SERVER_UPDATE_SOURCE;
}

const UPDATE_CHECK_STARTUP_DELAY_MS = 5000;
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

function isAutomaticUpdateCheckEnabled() {
  return G.settings.autoUpdateEnabled !== false;
}

function canCheckForUpdates(manual) {
  return !!manual || isAutomaticUpdateCheckEnabled();
}

function getUpdateProxy() {
  if (G.settings.proxyEnabled !== true) return null;
  return String(G.settings.proxyUrl || '').trim();
}

function classifyUpdateFailureText(error) {
  const text = String(error || '').toLowerCase();
  if (/code:\s*32|running processes prevented|being used by another process|used by another process|另一个程序正在使用|进程无法访问/.test(text)) return 'locked';
  if (/code:\s*112|not enough space|no space left|磁盘空间不足/.test(text)) return 'disk-space';
  if (/checksum|data corruption|corrupt|损坏/.test(text)) return 'package';
  if (/access denied|permission denied|拒绝访问/.test(text)) return 'permission';
  if (/timed out|timeout|connection|network|dns|unable to retrieve|无法连接/.test(text)) return 'network';
  return 'unknown';
}

function normalizedUpdateFailure(error) {
  if (error && typeof error === 'object' && error.message) return error;
  const message = String(error || '').trim();
  return message ? {category: classifyUpdateFailureText(message), message} : null;
}

function renderUpdateFailure(failure) {
  const container = document.getElementById('settings-update-failure');
  const textElement = document.getElementById('settings-update-failure-text');
  const logButton = document.getElementById('settings-update-log');
  if (!container || !textElement) return;
  const normalized = normalizedUpdateFailure(failure);
  if (!normalized) {
    container.hidden = true;
    textElement.textContent = '';
    container.title = '';
    if (logButton) logButton.hidden = true;
    return;
  }

  const category = ['locked', 'permission', 'disk-space', 'package', 'network'].includes(normalized.category)
    ? normalized.category
    : 'unknown';
  const key = {
    locked: 'update.failureLocked',
    permission: 'update.failurePermission',
    'disk-space': 'update.failureDiskSpace',
    package: 'update.failurePackage',
    network: 'update.failureNetwork',
    unknown: 'update.failureUnknown',
  }[category];
  const version = normalized.targetVersion ? ' ' + normalized.targetVersion : '';
  const lines = [t(key, {version})];
  if (category === 'locked' && normalized.searchPath) {
    lines.push(t('update.failureLockHint', {path: normalized.searchPath}));
  }
  const technical = String(normalized.technicalDetail || normalized.message || '').trim();
  if (technical) {
    const bounded = technical.length > 360 ? technical.slice(0, 357) + '...' : technical;
    lines.push(t('update.failureDetail', {error: bounded}));
  }
  textElement.textContent = lines.join('\n');
  container.title = [normalized.message, normalized.technicalDetail, normalized.logPath]
    .filter(Boolean)
    .join('\n');
  container.hidden = false;
  if (logButton) logButton.hidden = !normalized.logPath;
}

async function refreshLastUpdateFailure() {
  try {
    G._lastUpdateFailure = await call('get_last_update_failure', {});
  } catch (error) {
    G._lastUpdateFailure = null;
  }
  renderUpdateFailure(G._updateTransientFailure || G._lastUpdateFailure);
  return G._lastUpdateFailure;
}

async function openUpdateFailureLog() {
  const path = G._lastUpdateFailure?.logPath;
  if (!path) return;
  try {
    await call('open_in_windows_explorer', {path, isDirectory:false});
  } catch (error) {
    showNotice(t('update.openLogFailed', {error: String(error)}));
  }
}

function updateSettingsStatusText(status, error, state) {
  G._updateTransientFailure = error ? normalizedUpdateFailure(error) : null;
  const element = document.getElementById('settings-update-status');
  renderUpdateFailure(G._updateTransientFailure || G._lastUpdateFailure);
  if (!element) return;
  element.title = error ? String(error) : '';
  if (state === 'disabled') {
    element.textContent = t('update.statusDisabled');
  } else if (state === 'proxy-required') {
    element.textContent = t('update.statusProxyRequired');
  } else if (error) {
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
  await refreshLastUpdateFailure();
  if (!isAutomaticUpdateCheckEnabled()) {
    updateSettingsStatusText(null, null, 'disabled');
    if (button) button.disabled = false;
    return;
  }
  if (G.settings.proxyEnabled === true && !getUpdateProxy()) {
    updateSettingsStatusText(null, null, 'proxy-required');
    if (button) button.disabled = false;
    return;
  }
  if (G._updateCheckRunning) return;
  G._updateCheckRunning = true;
  updateSettingsStatusText(null);
  if (button) button.disabled = true;
  try {
    const status = await call('check_updates', {
      source: getUpdateSource(),
      proxy: getUpdateProxy(),
    });
    G._updateStatus = status;
    updateSettingsStatusText(status);
  } catch (error) {
    updateSettingsStatusText(null, error);
  } finally {
    if (button) button.disabled = false;
    G._updateCheckRunning = false;
  }
}

async function checkForUpdates(manual) {
  if (!canCheckForUpdates(manual)) {
    updateSettingsStatusText(null, null, 'disabled');
    return;
  }
  if (G.settings.proxyEnabled === true && !getUpdateProxy()) {
    updateSettingsStatusText(null, null, 'proxy-required');
    if (manual) showNotice(t('update.proxyRequired'));
    return;
  }
  if (G._updateCheckRunning) return;
  await refreshLastUpdateFailure();
  if (G._updateCheckRunning) return;
  G._updateCheckRunning = true;
  const button = document.getElementById('settings-check-update');
  let updateTaskId = null;
  if (button) button.disabled = true;
  try {
    const source = getUpdateSource();
    const proxy = getUpdateProxy();
    const status = await call('check_updates', {source, proxy});
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
    if (typeof _operationTasks !== 'undefined'
        && [..._operationTasks.values()].some(task => task.status === 'running')) {
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
      updateTaskId = showProgress(t('update.downloading', {version}), {cancellable:false});
      _updateProgressTaskId = updateTaskId;
      await call('download_update', {source, proxy});
    } else {
      updateTaskId = showProgress(t('update.preparing', {version}), {indeterminate:true, cancellable:false});
      _updateProgressTaskId = updateTaskId;
    }
    const updateTask = _operationTasks.get(updateTaskId);
    if (updateTask) updateTask.title = t('update.restarting');
    updateProgress({percentage:100, speed:0, totalBytes:0, bytesTransferred:0}, updateTaskId);
    try { saveTabState(); } catch (error) {}
    await call('apply_update', {source, proxy});
  } catch (error) {
    if (updateTaskId) failOperationTask(updateTaskId, error);
    _updateProgressTaskId = null;
    updateSettingsStatusText(null, error);
    if (manual) showNotice(t('update.failed', {error: String(error)}));
  } finally {
    G._updateCheckRunning = false;
    if (button) button.disabled = false;
  }
}
