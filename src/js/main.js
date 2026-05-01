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
      entries: [], sel: new Set(), lastIdx: -1, sortF: "name", sortAsc: true
    }));
    G.activeTab = saved.activeTab || G.tabs[0].id;
    G.nextTabId = Math.max(...G.tabs.map(t => t.id)) + 1;
  } else {
    getTab().path = startPath;
    getTab().history = [startPath];
    getTab().historyIdx = 0;
  }

  await navigateTo(getTab().path, false);
  await loadDrives();
  loadTree(getTab().path, true);
  await loadTagList();
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
      if (file.name.toLowerCase().endsWith(".zip")) {
        await openArchive(file.path);
      } else {
        navigateTo(file.path);
      }
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
    if (file.is_dir) rpNavigateTo(file.path);
    else try { await call("open_file", { path: file.path }); } catch (ex) {}
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
});

document.addEventListener("contextmenu", e => e.preventDefault());

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
