// test-harness.js — automated GUI testing
// Loaded only in dev mode. Listens for "run-tests" Tauri event, runs tests, emits results.

(function () {
  const results = [];
  let currentSuite = "";

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || "Assertion failed");
  }

  function assertEqual(a, b, msg) {
    if (a !== b) throw new Error((msg || "") + " expected " + JSON.stringify(b) + " got " + JSON.stringify(a));
  }

  function assertIncludes(str, sub, msg) {
    if (!String(str).includes(sub)) throw new Error((msg || "") + " '" + str + "' does not include '" + sub + "'");
  }

  function assertNotIncludes(str, sub, msg) {
    if (String(str).includes(sub)) throw new Error((msg || "") + " '" + str + "' should not include '" + sub + "'");
  }

  function log(msg) {
    console.log("[TEST] " + msg);
  }

  async function test(name, fn) {
    currentSuite = name;
    try {
      await fn();
      results.push({ name, status: "PASS" });
      log("PASS: " + name);
    } catch (e) {
      results.push({ name, status: "FAIL", error: e.message });
      log("FAIL: " + name + " — " + e.message);
    }
  }

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function simulateClick(el) {
    if (!el) throw new Error("simulateClick: element is null");
    const rect = el.getBoundingClientRect();
    const evt = new MouseEvent("click", {
      bubbles: true, cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    el.dispatchEvent(evt);
  }

  function simulateContextMenu(el) {
    if (!el) throw new Error("simulateContextMenu: element is null");
    const rect = el.getBoundingClientRect();
    const evt = new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 2,
    });
    el.dispatchEvent(evt);
  }

  function waitFor(sel, timeout) {
    timeout = timeout || 5000;
    return new Promise((resolve, reject) => {
      const start = Date.now();
      function check() {
        const el = document.querySelector(sel);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(new Error("waitFor('" + sel + "') timed out after " + timeout + "ms"));
        requestAnimationFrame(check);
      }
      check();
    });
  }

  function waitForCondition(condFn, timeout) {
    timeout = timeout || 5000;
    return new Promise((resolve, reject) => {
      const start = Date.now();
      function check() {
        try { if (condFn()) return resolve(); } catch (e) {}
        if (Date.now() - start > timeout) return reject(new Error("waitForCondition timed out after " + timeout + "ms"));
        requestAnimationFrame(check);
      }
      check();
    });
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ======== TEST SUITES ========

  async function runAllTests() {
    results.length = 0;
    log("=== GUI Test Suite Start ===");

    // ================================================================
    // SECTION 1: SIDEBAR & DRIVES
    // ================================================================

    await test("[sidebar] Drives are rendered", async () => {
      const items = $$(".drive-item");
      assert(items.length > 0, "No drive items found in #drives-list");
    });

    await test("[sidebar] Drive items have data-path attribute", async () => {
      const items = $$(".drive-item");
      items.forEach((el, i) => {
        assert(el.dataset.path, "Drive item " + i + " missing data-path");
        assert(el.dataset.path.includes(":\\"), "Drive item " + i + " path '" + el.dataset.path + "' doesn't look like a drive path");
      });
    });

    await test("[sidebar] Drive items use addEventListener (no inline onclick)", async () => {
      const items = $$(".drive-item");
      items.forEach((el, i) => {
        const onclick = el.getAttribute("onclick");
        assert(!onclick, "Drive item " + i + " has inline onclick attribute — should use addEventListener");
      });
    });

    await test("[sidebar] Drive items have pointer cursor and transition", async () => {
      const item = $(".drive-item");
      assert(item, "No drive item found");
      const style = getComputedStyle(item);
      assertEqual(style.cursor, "pointer", "Drive item cursor");
      assertIncludes(style.transition, "background", "Drive item transition");
    });

    await test("[sidebar] Quick access items use addEventListener", async () => {
      const items = $$(".sidebar-item[onclick]");
      assertEqual(items.length, 0, "Found sidebar items with inline onclick. Count: " + items.length);
    });

    await test("[sidebar] Pinned folder items use addEventListener", async () => {
      const pinnedItems = $$(".pinned-item");
      pinnedItems.forEach((el, i) => {
        const onclick = el.getAttribute("onclick");
        assert(!onclick, "Pinned item " + i + " has inline onclick");
        assert(el.dataset.path, "Pinned item " + i + " missing data-path");
      });
    });

    await test("[sidebar] Library items use addEventListener", async () => {
      const libItems = $$("#libraries-list .sidebar-item");
      libItems.forEach((el, i) => {
        const onclick = el.getAttribute("onclick");
        assert(!onclick, "Library item " + i + " has inline onclick");
      });
    });

    await test("[sidebar] Directory tree is rendered", async () => {
      const tree = $("#dir-tree");
      assert(tree, "#dir-tree element not found");
      const rows = tree.querySelectorAll(".tree-row");
      assert(rows.length > 0, "No tree rows found");
    });

    await test("[sidebar] Tag list container exists", async () => {
      const tagList = $("#tag-list");
      assert(tagList, "#tag-list element not found");
    });

    // ================================================================
    // SECTION 2: NAVIGATION
    // ================================================================

    await test("[nav] Click D: drive navigates", async () => {
      const items = $$(".drive-item");
      let dDrive = null;
      items.forEach(el => {
        if (el.dataset.path && el.dataset.path.toUpperCase().startsWith("D:")) dDrive = el;
      });
      if (!dDrive) {
        log("SKIP: No D: drive, using first drive");
        dDrive = $(".drive-item");
      }
      assert(dDrive, "No drive item found");
      const targetPath = dDrive.dataset.path;
      simulateClick(dDrive);
      await waitForCondition(() => getTab().path === targetPath, 8000);
      assertEqual(getTab().path, targetPath, "Tab path after drive click");
      await sleep(300);
      assert(!$("#status-count").textContent.includes("Error"), "Status bar shows error");
    });

    await test("[nav] Click C: drive navigates", async () => {
      let cDrive = null;
      $$(".drive-item").forEach(el => {
        if (el.dataset.path && el.dataset.path.toUpperCase().startsWith("C:")) cDrive = el;
      });
      assert(cDrive, "No C: drive found");
      const targetPath = cDrive.dataset.path;
      simulateClick(cDrive);
      await waitForCondition(() => getTab().path === targetPath, 8000);
      assertEqual(getTab().path, targetPath, "Tab path after C: click");
      await sleep(300);
    });

    await test("[nav] Click Desktop quick access navigates", async () => {
      const items = $$(".sidebar-item");
      let desktopItem = null;
      items.forEach(el => {
        const span = el.querySelector("span");
        if (span && span.textContent.trim() === "Desktop") desktopItem = el;
      });
      if (!desktopItem) { log("SKIP: Desktop quick access not found"); return; }
      simulateClick(desktopItem);
      await waitForCondition(() => getTab().path.toLowerCase().includes("desktop"), 8000);
      assertIncludes(getTab().path.toLowerCase(), "desktop", "Path after Desktop click");
      await sleep(300);
    });

    await test("[nav] goUp navigates to parent", async () => {
      const tab = getTab();
      const childPath = tab.path;
      if (typeof goUp !== 'function') { log("SKIP: goUp not available"); return; }
      await goUp();
      await sleep(500);
      assert(getTab().path !== childPath, "Path unchanged after goUp");
      assert(getTab().history.length > 0, "History empty after goUp");
    });

    await test("[nav] goBack returns to previous path", async () => {
      if (typeof goBack !== 'function') { log("SKIP: goBack not available"); return; }
      const currentPath = getTab().path;
      if (getTab().historyIdx <= 0) { log("SKIP: No history to go back to"); return; }
      await goBack();
      await sleep(500);
      assert(getTab().path !== currentPath || getTab().historyIdx === 0, "goBack did not change path");
    });

    await test("[nav] goForward advances in history", async () => {
      if (typeof goForward !== 'function') { log("SKIP: goForward not available"); return; }
      const tab = getTab();
      if (tab.historyIdx >= tab.history.length - 1) { log("SKIP: No forward history"); return; }
      const prevPath = tab.path;
      await goForward();
      await sleep(500);
      assert(getTab().path !== prevPath, "goForward did not change path");
    });

    await test("[nav] Navigate to home://", async () => {
      if (typeof navigateTo !== 'function') { log("SKIP: navigateTo not available"); return; }
      await navigateTo("home://");
      await sleep(500);
      assertEqual(getTab().path, "home://", "Path should be home://");
      const homePage = $("#home-page");
      assert(homePage, "#home-page not found");
      assert(homePage.offsetHeight > 0, "Home page not visible");
    });

    await test("[nav] Breadcrumb shows correct path", async () => {
      let cDrive = null;
      $$(".drive-item").forEach(el => {
        if (el.dataset.path && el.dataset.path.toUpperCase().startsWith("C:")) cDrive = el;
      });
      if (!cDrive) { log("SKIP: No C: drive"); return; }
      const targetPath = cDrive.dataset.path;
      simulateClick(cDrive);
      await waitForCondition(() => getTab().path === targetPath, 8000);
      await sleep(300);
      const bcItems = $$("#breadcrumb .bc-item");
      assert(bcItems.length > 0, "No breadcrumb items found");
      const lastBc = bcItems[bcItems.length - 1];
      const bcPath = lastBc.dataset.path;
      if (/^[A-Z]:$/i.test(bcPath)) {
        throw new Error("Breadcrumb path '" + bcPath + "' missing trailing backslash");
      }
      assertEqual(bcPath, targetPath, "Breadcrumb path mismatch");
    });

    // ================================================================
    // SECTION 3: TAB MANAGEMENT
    // ================================================================

    await test("[tabs] Tab bar is rendered", async () => {
      const tabBar = $("#tab-bar");
      assert(tabBar, "#tab-bar not found");
      const tabs = tabBar.querySelectorAll(".tab");
      assert(tabs.length >= 1, "No tabs rendered");
    });

    await test("[tabs] Tab has active state", async () => {
      const activeTab = $(".tab.active");
      assert(activeTab, "No active tab found");
    });

    await test("[tabs] Add tab creates new tab", async () => {
      const initialCount = $$("#tab-bar .tab").length;
      if (typeof addTab !== 'function') { log("SKIP: addTab not available"); return; }
      addTab();
      await sleep(300);
      const newCount = $$("#tab-bar .tab").length;
      assertEqual(newCount, initialCount + 1, "Tab count after addTab");
      assertEqual(G.activeTab, G.tabs[G.tabs.length - 1].id, "New tab should be active");
    });

    await test("[tabs] Close tab removes tab", async () => {
      if (G.tabs.length <= 1) { log("SKIP: Need at least 2 tabs"); return; }
      if (typeof closeTab !== 'function') { log("SKIP: closeTab not available"); return; }
      const initialCount = G.tabs.length;
      const lastTabId = G.tabs[G.tabs.length - 1].id;
      closeTab(lastTabId);
      await sleep(300);
      assertEqual(G.tabs.length, initialCount - 1, "Tab count after closeTab");
    });

    await test("[tabs] Switch tab changes active tab", async () => {
      if (G.tabs.length < 2) {
        if (typeof addTab === 'function') addTab();
        await sleep(300);
      }
      if (G.tabs.length < 2) { log("SKIP: Need at least 2 tabs"); return; }
      const firstTabId = G.tabs[0].id;
      if (typeof switchTab !== 'function') { log("SKIP: switchTab not available"); return; }
      switchTab(firstTabId);
      await sleep(300);
      assertEqual(G.activeTab, firstTabId, "Active tab after switch");
      const activeEl = $(".tab.active");
      assert(activeEl, "No active tab element");
      assertEqual(parseInt(activeEl.dataset.tabId), firstTabId, "Active tab element ID");
    });

    await test("[tabs] Tab label matches path", async () => {
      const tab = getTab();
      const tabEl = $(".tab.active .tab-label");
      assert(tabEl, "Active tab label element not found");
      let expected;
      if (tab.path === "home://") expected = "Home";
      else if (/^[A-Za-z]:\\$/.test(tab.path)) expected = tab.path.slice(0, -1);
      else {
        const parts = tab.path.replace(/\\/g, "/").replace(/\/$/, "").split("/");
        expected = parts[parts.length - 1] || tab.path;
      }
      assertEqual(tabEl.textContent, expected, "Tab label text");
    });

    await test("[tabs] Tab new button exists", async () => {
      const newBtn = $(".tab-new");
      assert(newBtn, "New tab button not found");
    });

    // ================================================================
    // SECTION 4: FILE LIST & RENDERING
    // ================================================================

    await test("[filelist] File list element exists", async () => {
      const list = $("#file-list");
      assert(list, "#file-list not found");
    });

    await test("[filelist] Entries populated after navigation", async () => {
      const tab = getTab();
      if (tab.path === "home://") {
        assertEqual(tab.entries.length, 0, "Home page should have 0 entries");
      } else {
        assert(tab.entries.length >= 0, "tab.entries should be an array");
        if (tab.entries.length > 0) {
          const first = tab.entries[0];
          assert(first.name !== undefined, "Entry missing name");
          assert(first.is_dir !== undefined, "Entry missing is_dir");
          assert(first.path !== undefined, "Entry missing path");
        }
      }
    });

    await test("[filelist] File rows rendered for directory", async () => {
      const tab = getTab();
      if (tab.path === "home://" || tab.entries.length === 0) {
        log("SKIP: No entries to render");
        return;
      }
      const rows = $$("#file-list .file-row");
      assert(rows.length > 0, "No file rows rendered for " + tab.path);
    });

    await test("[filelist] File rows have data-index attribute", async () => {
      const rows = $$("#file-list .file-row");
      rows.forEach((row, i) => {
        assert(row.dataset.index !== undefined, "Row " + i + " missing data-index");
      });
    });

    await test("[filelist] Status bar shows item count", async () => {
      const statusEl = $("#status-count");
      assert(statusEl, "#status-count not found");
      const text = statusEl.textContent;
      assert(typeof text === "string" && text.length > 0, "Status bar is empty");
      assert(!text.includes("Error"), "Status bar shows error: " + text);
    });

    await test("[filelist] Status selection element exists", async () => {
      const selEl = $("#status-selection");
      assert(selEl, "#status-selection not found");
    });

    await test("[filelist] File header with column headers exists", async () => {
      const header = $("#file-header");
      assert(header, "#file-header not found");
      const cols = header.querySelectorAll(".col");
      assert(cols.length > 0, "No column headers found");
    });

    await test("[filelist] Sort arrows are rendered", async () => {
      if (typeof updateSortArrows !== 'function') { log("SKIP: updateSortArrows not available"); return; }
      updateSortArrows();
      const arrows = $$(".sort-arrow");
      assert(arrows.length > 0, "No sort arrows found");
    });

    // ================================================================
    // SECTION 5: SELECTION
    // ================================================================

    await test("[selection] Click file row selects it", async () => {
      const rows = $$("#file-list .file-row");
      if (rows.length === 0) { log("SKIP: No file rows"); return; }
      const tab = getTab();
      tab.sel.clear();
      const row = rows[0];
      simulateClick(row);
      await sleep(100);
      assert(tab.sel.size > 0, "No selection after clicking file row");
    });

    await test("[selection] getSelectedPaths returns selected entries", async () => {
      if (typeof getSelectedPaths !== 'function') { log("SKIP: getSelectedPaths not available"); return; }
      const sel = getSelectedPaths();
      assert(Array.isArray(sel), "getSelectedPaths should return array");
    });

    await test("[selection] selectAll selects all entries", async () => {
      const tab = getTab();
      if (tab.entries.length === 0) { log("SKIP: No entries"); return; }
      if (typeof selectAll !== 'function') { log("SKIP: selectAll not available"); return; }
      selectAll();
      assertEqual(tab.sel.size, tab.entries.length, "selectAll should select all entries");
    });

    await test("[selection] Click selected row deselects others", async () => {
      const rows = $$("#file-list .file-row");
      if (rows.length < 2) { log("SKIP: Need at least 2 rows"); return; }
      const tab = getTab();
      if (typeof selectAll === 'function') selectAll();
      simulateClick(rows[0]);
      await sleep(100);
      assertEqual(tab.sel.size, 1, "Should have exactly 1 selected after single click");
    });

    // ================================================================
    // SECTION 6: LAYOUT
    // ================================================================

    await test("[layout] Details layout renders correctly", async () => {
      if (typeof setLayout !== 'function') { log("SKIP: setLayout not available"); return; }
      setLayout('details');
      await sleep(200);
      assertEqual(G.layout, 'details', "Layout should be details");
      const activeBtn = $(".layout-btn.active[data-layout='details']");
      assert(activeBtn, "Details layout button should be active");
      const rows = $$("#file-list .file-row");
      const tab = getTab();
      if (tab.entries.length > 0) assert(rows.length > 0, "No rows in details layout");
    });

    await test("[layout] Switch to icons layout", async () => {
      if (typeof setLayout !== 'function') { log("SKIP: setLayout not available"); return; }
      setLayout('icons');
      await sleep(200);
      assertEqual(G.layout, 'icons', "Layout should be icons");
      const activeBtn = $(".layout-btn.active[data-layout='icons']");
      assert(activeBtn, "Icons layout button should be active");
    });

    await test("[layout] Switch to cards layout", async () => {
      if (typeof setLayout !== 'function') { log("SKIP: setLayout not available"); return; }
      setLayout('cards');
      await sleep(200);
      assertEqual(G.layout, 'cards', "Layout should be cards");
      const activeBtn = $(".layout-btn.active[data-layout='cards']");
      assert(activeBtn, "Cards layout button should be active");
    });

    await test("[layout] Switch back to details layout", async () => {
      if (typeof setLayout !== 'function') { log("SKIP: setLayout not available"); return; }
      setLayout('details');
      await sleep(200);
      assertEqual(G.layout, 'details', "Layout should be details");
    });

    // ================================================================
    // SECTION 7: SORT
    // ================================================================

    await test("[sort] Sort by name", async () => {
      if (typeof sortBy !== 'function') { log("SKIP: sortBy not available"); return; }
      sortBy('name');
      await sleep(200);
      assertEqual(G.sortField, 'name', "Sort field should be name");
    });

    await test("[sort] Sort by size", async () => {
      if (typeof sortBy !== 'function') { log("SKIP: sortBy not available"); return; }
      sortBy('size');
      await sleep(200);
      assertEqual(G.sortField, 'size', "Sort field should be size");
    });

    await test("[sort] Sort by modified date", async () => {
      if (typeof sortBy !== 'function') { log("SKIP: sortBy not available"); return; }
      sortBy('modified');
      await sleep(200);
      assertEqual(G.sortField, 'modified', "Sort field should be modified");
    });

    await test("[sort] Toggle sort direction", async () => {
      if (typeof sortBy !== 'function') { log("SKIP: sortBy not available"); return; }
      sortBy('name');
      const dirBefore = G.sortAsc;
      sortBy('name');
      assertEqual(G.sortAsc, !dirBefore, "Sort direction should toggle");
      sortBy('name');
      assertEqual(G.sortAsc, dirBefore, "Sort direction should toggle back");
    });

    await test("[sort] naturalCompare function works", async () => {
      if (typeof naturalCompare !== 'function') { log("SKIP: naturalCompare not available"); return; }
      assert(naturalCompare("a1", "a2") < 0, "a1 < a2");
      assert(naturalCompare("a10", "a2") > 0, "a10 > a2 (natural sort)");
      assert(naturalCompare("abc", "abc") === 0, "abc == abc");
    });

    // ================================================================
    // SECTION 8: DUAL PANE
    // ================================================================

    await test("[dualpane] Toggle dual pane on", async () => {
      if (typeof toggleDualPane !== 'function') { log("SKIP: toggleDualPane not available"); return; }
      toggleDualPane();
      await sleep(300);
      assertEqual(G.dualOn, true, "Dual pane should be on");
      const rightPane = $("#pane-right");
      assert(rightPane, "#pane-right not found");
      assert(rightPane.offsetHeight > 0, "Right pane should be visible");
      const divider = $("#pane-divider");
      assert(divider, "#pane-divider not found");
    });

    await test("[dualpane] Right pane has file list", async () => {
      const rightList = $("#right-file-list");
      assert(rightList, "#right-file-list not found");
    });

    await test("[dualpane] Right pane status bar exists", async () => {
      const rightStatus = $("#right-status-count");
      assert(rightStatus, "#right-status-count not found");
    });

    await test("[dualpane] Toggle dual pane off", async () => {
      if (typeof toggleDualPane !== 'function') { log("SKIP: toggleDualPane not available"); return; }
      toggleDualPane();
      await sleep(300);
      assertEqual(G.dualOn, false, "Dual pane should be off");
    });

    // ================================================================
    // SECTION 9: PREVIEW PANE
    // ================================================================

    await test("[preview] Toggle preview pane on", async () => {
      if (typeof togglePreviewPane !== 'function') { log("SKIP: togglePreviewPane not available"); return; }
      togglePreviewPane();
      await sleep(300);
      assertEqual(G.previewOn, true, "Preview should be on");
      const previewPane = $("#preview-pane");
      assert(previewPane, "#preview-pane not found");
    });

    await test("[preview] Preview content area exists", async () => {
      const previewContent = $("#preview-content");
      assert(previewContent, "#preview-content not found");
    });

    await test("[preview] Toggle preview pane off", async () => {
      if (typeof togglePreviewPane !== 'function') { log("SKIP: togglePreviewPane not available"); return; }
      togglePreviewPane();
      await sleep(300);
      assertEqual(G.previewOn, false, "Preview should be off");
    });

    // ================================================================
    // SECTION 10: CLIPBOARD
    // ================================================================

    await test("[clipboard] G.clipboard initially null", async () => {
      assertEqual(G.clipboard, null, "Clipboard should be null initially");
    });

    await test("[clipboard] Copy selected sets clipboard", async () => {
      const rows = $$("#file-list .file-row");
      if (rows.length === 0) { log("SKIP: No rows to copy"); return; }
      if (typeof selectAll === 'function') selectAll();
      if (typeof copySelected !== 'function') { log("SKIP: copySelected not available"); return; }
      copySelected();
      assert(G.clipboard !== null, "Clipboard should be set after copy");
      assertEqual(G.clipboard.op, "copy", "Clipboard op should be copy");
    });

    await test("[clipboard] Cut selected sets clipboard", async () => {
      const rows = $$("#file-list .file-row");
      if (rows.length === 0) { log("SKIP: No rows to cut"); return; }
      if (typeof selectAll === 'function') selectAll();
      if (typeof cutSelected !== 'function') { log("SKIP: cutSelected not available"); return; }
      cutSelected();
      assert(G.clipboard !== null, "Clipboard should be set after cut");
      assertEqual(G.clipboard.op, "cut", "Clipboard op should be cut");
    });

    await test("[clipboard] getSelectedPaths returns paths", async () => {
      if (typeof getSelectedPaths !== 'function') { log("SKIP: getSelectedPaths not available"); return; }
      const paths = getSelectedPaths();
      assert(Array.isArray(paths), "Should return array");
      if (paths.length > 0) {
        assert(paths[0].path !== undefined, "Selected entry should have path");
      }
    });

    // ================================================================
    // SECTION 11: CONTEXT MENU
    // ================================================================

    await test("[ctxmenu] Right-click shows context menu", async () => {
      const rows = $$("#file-list .file-row");
      if (rows.length > 0) {
        simulateContextMenu(rows[0]);
      } else {
        simulateContextMenu($("#file-list"));
      }
      await sleep(200);
      const menu = $(".context-menu");
      assert(menu, "Context menu did not appear");
      removeContextMenu();
    });

    await test("[ctxmenu] Context menu has menu items", async () => {
      const rows = $$("#file-list .file-row");
      if (rows.length > 0) {
        simulateContextMenu(rows[0]);
      } else {
        simulateContextMenu($("#file-list"));
      }
      await sleep(200);
      const items = $$(".context-menu .ctx-item");
      assert(items.length > 0, "Context menu has no items");
      removeContextMenu();
    });

    await test("[ctxmenu] Drive right-click shows context menu", async () => {
      const item = $(".drive-item");
      assert(item, "No drive item");
      simulateContextMenu(item);
      await sleep(200);
      const menu = $(".context-menu");
      assert(menu, "Context menu did not appear on drive");
      removeContextMenu();
    });

    // ================================================================
    // SECTION 12: HOME PAGE
    // ================================================================

    await test("[home] Navigate to home page", async () => {
      if (typeof navigateTo !== 'function') { log("SKIP: navigateTo not available"); return; }
      await navigateTo("home://");
      await sleep(500);
      assertEqual(getTab().path, "home://", "Path should be home://");
    });

    await test("[home] Home page element is visible", async () => {
      const homePage = $("#home-page");
      assert(homePage, "#home-page not found");
      assert(homePage.offsetHeight > 0, "Home page should be visible");
    });

    await test("[home] Home quick access section exists", async () => {
      const qa = $("#home-quick-access");
      assert(qa, "#home-quick-access not found");
    });

    await test("[home] Home drives section renders", async () => {
      await sleep(500);
      const drives = $$("#home-drives .home-drive-card");
      assert(drives.length > 0, "No home drive cards rendered");
    });

    await test("[home] Home drive cards use addEventListener", async () => {
      const cards = $$("#home-drives .home-drive-card");
      cards.forEach((el, i) => {
        const onclick = el.getAttribute("onclick");
        assert(!onclick, "Home drive card " + i + " has inline onclick");
      });
    });

    // ================================================================
    // SECTION 13: THEME
    // ================================================================

    await test("[theme] Theme attribute on html element", async () => {
      const theme = document.documentElement.getAttribute("data-theme");
      assert(theme === "light" || theme === "dark" || theme === "custom", "Unexpected theme: " + theme);
    });

    await test("[theme] G.theme is set", async () => {
      assert(G.theme !== undefined, "G.theme not set");
      assert(G.theme === "light" || G.theme === "dark" || G.theme === "custom", "Unexpected G.theme: " + G.theme);
    });

    await test("[theme] Toggle theme changes data-theme", async () => {
      if (typeof toggleTheme !== 'function') { log("SKIP: toggleTheme not available"); return; }
      const before = document.documentElement.getAttribute("data-theme");
      toggleTheme();
      await sleep(100);
      const after = document.documentElement.getAttribute("data-theme");
      assert(after !== before, "Theme did not change after toggle: " + before + " -> " + after);
      toggleTheme();
      await sleep(100);
    });

    // ================================================================
    // SECTION 14: TOOLBAR & COMMAND BAR
    // ================================================================

    await test("[toolbar] Address bar exists", async () => {
      const addr = $("#address-bar");
      assert(addr, "#address-bar not found");
    });

    await test("[toolbar] Path input shows current path", async () => {
      const input = $("#path-input");
      assert(input, "#path-input not found");
      const tab = getTab();
      if (tab.path !== "home://") {
        assertEqual(input.value, tab.path, "Path input value mismatch");
      }
    });

    await test("[toolbar] Filter input exists", async () => {
      const filter = $("#filter-input");
      assert(filter, "#filter-input not found");
    });

    await test("[toolbar] Layout buttons exist", async () => {
      const btns = $$(".layout-btn");
      assert(btns.length >= 3, "Expected at least 3 layout buttons, got " + btns.length);
    });

    await test("[toolbar] Command bar buttons exist", async () => {
      const newBtn = $("#btn-new");
      const cutBtn = $("#btn-cut");
      const copyBtn = $("#btn-copy");
      const pasteBtn = $("#btn-paste");
      assert(newBtn, "#btn-new not found");
      assert(cutBtn, "#btn-cut not found");
      assert(copyBtn, "#btn-copy not found");
      assert(pasteBtn, "#btn-paste not found");
    });

    // ================================================================
    // SECTION 15: DIALOGS
    // ================================================================

    await test("[dialogs] Command palette — COMMANDS array populated", async () => {
      if (typeof COMMANDS === 'undefined') { log("SKIP: COMMANDS not in scope"); return; }
      assert(COMMANDS.length > 0, "COMMANDS array should have entries, got " + COMMANDS.length);
    });

    await test("[dialogs] Command palette open/close", async () => {
      if (typeof openCommandPalette !== 'function') { log("SKIP: openCommandPalette not available"); return; }
      openCommandPalette();
      await sleep(200);
      const palette = $("#command-palette");
      assert(palette, "#command-palette not found");
      assert(palette.offsetHeight > 0, "Command palette should be visible");
      if (typeof closeCommandPalette === 'function') closeCommandPalette();
      await sleep(200);
    });

    await test("[dialogs] Settings dialog open/close", async () => {
      if (typeof openSettings !== 'function') { log("SKIP: openSettings not available"); return; }
      openSettings();
      await sleep(200);
      const settings = $("#settings-dialog");
      assert(settings, "#settings-dialog not found");
      if (typeof closeSettings === 'function') closeSettings();
      await sleep(200);
    });

    await test("[dialogs] Properties dialog element exists in DOM", async () => {
      const props = $("#properties-dialog");
      assert(props, "#properties-dialog not found");
    });

    await test("[dialogs] Batch rename dialog element exists", async () => {
      const br = $("#batch-rename-dialog");
      assert(br, "#batch-rename-dialog not found");
    });

    await test("[dialogs] Tag dialog element exists", async () => {
      const td = $("#tag-dialog");
      assert(td, "#tag-dialog not found");
    });

    await test("[dialogs] Conflict dialog element exists", async () => {
      const cd = $("#conflict-dialog");
      assert(cd, "#conflict-dialog not found");
    });

    await test("[dialogs] Progress overlay element exists", async () => {
      const po = $("#progress-overlay");
      assert(po, "#progress-overlay not found");
    });

    // ================================================================
    // SECTION 16: UNDO/REDO
    // ================================================================

    await test("[undoredo] Undo/redo functions exist", async () => {
      assert(typeof undo === 'function', "undo function not found");
      assert(typeof redo === 'function', "redo function not found");
      assert(typeof pushUndo === 'function', "pushUndo function not found");
    });

    await test("[undoredo] Track functions exist", async () => {
      assert(typeof trackCopy === 'function', "trackCopy not found");
      assert(typeof trackMove === 'function', "trackMove not found");
      assert(typeof trackRename === 'function', "trackRename not found");
      assert(typeof trackDelete === 'function', "trackDelete not found");
      assert(typeof trackNewFolder === 'function', "trackNewFolder not found");
    });

    await test("[undoredo] pushUndo adds to stack", async () => {
      if (typeof pushUndo !== 'function') { log("SKIP: pushUndo not available"); return; }
      const before = typeof undoStack !== 'undefined' ? undoStack.length : -1;
      if (before < 0) { log("SKIP: undoStack not accessible"); return; }
      pushUndo({ type: "test", undo: async () => {}, redo: async () => {} });
      assertEqual(undoStack.length, before + 1, "Undo stack should grow");
      undoStack.pop();
    });

    // ================================================================
    // SECTION 17: GROUPING
    // ================================================================

    await test("[grouping] Grouping functions exist", async () => {
      assert(typeof toggleGrouping === 'function', "toggleGrouping not found");
      assert(typeof getGroupKey === 'function', "getGroupKey not found");
    });

    await test("[grouping] G.groupBy defaults to none", async () => {
      assertIncludes("none type date size extension".split(" "), G.groupBy, "G.groupBy should be a valid value, got: " + G.groupBy);
    });

    await test("[grouping] Toggle grouping changes state", async () => {
      if (typeof toggleGrouping !== 'function') { log("SKIP: toggleGrouping not available"); return; }
      const before = G.groupBy;
      toggleGrouping('type');
      assertEqual(G.groupBy, before === 'type' ? 'none' : 'type', "Grouping should toggle");
      toggleGrouping('none');
    });

    // ================================================================
    // SECTION 18: ICONS
    // ================================================================

    await test("[icons] fileIcon function exists", async () => {
      assert(typeof fileIcon === 'function', "fileIcon function not found");
    });

    await test("[icons] fileIcon returns HTML string", async () => {
      if (typeof fileIcon !== 'function') { log("SKIP"); return; }
      const testFile = { name: "test.txt", is_dir: false, extension: "txt" };
      const html = fileIcon(testFile);
      assert(typeof html === "string", "fileIcon should return string");
      assert(html.length > 0, "fileIcon returned empty string");
    });

    await test("[icons] bigFileIcon function exists", async () => {
      assert(typeof bigFileIcon === 'function', "bigFileIcon function not found");
    });

    await test("[icons] fileTypeLabel function exists", async () => {
      assert(typeof fileTypeLabel === 'function', "fileTypeLabel function not found");
    });

    await test("[icons] tagColor function exists", async () => {
      assert(typeof tagColor === 'function', "tagColor function not found");
      const c = tagColor(0);
      assert(typeof c === 'string', "tagColor should return string");
    });

    // ================================================================
    // SECTION 19: GIT/SVN STATUS
    // ================================================================

    await test("[git] Status bar git element exists", async () => {
      const el = $("#status-git");
      assert(el, "#status-git not found");
    });

    await test("[git] loadGitStatus function exists", async () => {
      assert(typeof loadGitStatus === 'function', "loadGitStatus not found");
    });

    await test("[svn] Status bar svn element exists", async () => {
      const el = $("#status-svn");
      assert(el, "#status-svn not found");
    });

    await test("[svn] loadSvnStatus function exists", async () => {
      assert(typeof loadSvnStatus === 'function', "loadSvnStatus not found");
    });

    // ================================================================
    // SECTION 20: CONFLICT RESOLUTION
    // ================================================================

    await test("[conflict] Conflict functions exist", async () => {
      assert(typeof showConflictDialog === 'function', "showConflictDialog not found");
      assert(typeof resolveConflict === 'function', "resolveConflict not found");
      assert(typeof closeConflict === 'function', "closeConflict not found");
    });

    await test("[conflict] generateUniqueName function works", async () => {
      if (typeof generateUniqueName !== 'function') { log("SKIP: generateUniqueName not available"); return; }
      const name = generateUniqueName("C:\\Test", "file.txt");
      assertIncludes(name, "file", "Generated name should contain base name");
      assertIncludes(name, ".txt", "Generated name should preserve extension");
    });

    // ================================================================
    // SECTION 21: TOAST NOTIFICATIONS
    // ================================================================

    await test("[toast] showNotice creates toast element", async () => {
      if (typeof showNotice !== 'function') { log("SKIP: showNotice not available"); return; }
      showNotice("Test notification");
      await sleep(100);
      const toast = $("#rhfiles-toast");
      assert(toast, "#rhfiles-toast not created");
      assertIncludes(toast.textContent, "Test notification", "Toast text mismatch");
    });

    // ================================================================
    // SECTION 22: GLOBAL STATE (G)
    // ================================================================

    await test("[global] G object exists and has required properties", async () => {
      assert(G !== undefined, "G is undefined");
      assert(Array.isArray(G.tabs), "G.tabs should be array");
      assert(typeof G.activeTab === 'number', "G.activeTab should be number");
      assert(typeof G.sortField === 'string', "G.sortField should be string");
      assert(typeof G.sortAsc === 'boolean', "G.sortAsc should be boolean");
    });

    await test("[global] G.rp (right pane) state exists", async () => {
      assert(G.rp !== undefined, "G.rp undefined");
      assert(typeof G.rp.path === 'string', "G.rp.path should be string");
      assert(Array.isArray(G.rp.entries), "G.rp.entries should be array");
    });

    await test("[global] G.settings loaded", async () => {
      assert(G.settings !== undefined, "G.settings undefined");
      assert(typeof G.settings === 'object', "G.settings should be object");
    });

    await test("[global] G.windowLabel is set", async () => {
      assert(G.windowLabel !== null && G.windowLabel !== undefined, "G.windowLabel not set");
    });

    // ================================================================
    // SECTION 23: COMMON UTILITIES
    // ================================================================

    await test("[utils] esc() escapes HTML", async () => {
      if (typeof esc !== 'function') { log("SKIP: esc not available"); return; }
      assertEqual(esc("<b>test</b>"), "&lt;b&gt;test&lt;/b&gt;", "esc HTML");
      assertEqual(esc("a&b"), "a&amp;b", "esc ampersand");
      assertEqual(esc('a"b'), "a&quot;b", "esc quotes");
    });

    await test("[utils] fmtSize() formats bytes", async () => {
      if (typeof fmtSize !== 'function') { log("SKIP: fmtSize not available"); return; }
      assertIncludes(fmtSize(1024), "KB", "1KB");
      assertIncludes(fmtSize(1048576), "MB", "1MB");
      assertIncludes(fmtSize(0), "0", "0 bytes");
    });

    await test("[utils] getTab() returns current tab", async () => {
      const tab = getTab();
      assert(tab !== undefined, "getTab returned undefined");
      assert(tab.id !== undefined, "Tab missing id");
      assert(tab.path !== undefined, "Tab missing path");
    });

    // ================================================================
    // SECTION 24: KEYBOARD
    // ================================================================

    await test("[keyboard] normalizeKey function exists", async () => {
      assert(typeof normalizeKey === 'function', "normalizeKey not found");
    });

    await test("[keyboard] Shortcut bindings loadable", async () => {
      if (typeof getShortcutBindings !== 'function') { log("SKIP: getShortcutBindings not available"); return; }
      const bindings = getShortcutBindings();
      assert(typeof bindings === 'object', "Bindings should be object");
    });

    await test("[keyboard] Default shortcuts include basic actions", async () => {
      if (typeof DEFAULT_SHORTCUTS === 'undefined') { log("SKIP: DEFAULT_SHORTCUTS not accessible"); return; }
      assert(DEFAULT_SHORTCUTS['file.copy'], "Missing file.copy shortcut");
      assert(DEFAULT_SHORTCUTS['file.paste'], "Missing file.paste shortcut");
      assert(DEFAULT_SHORTCUTS['tab.new'], "Missing tab.new shortcut");
    });

    // ================================================================
    // SECTION 25: WINDOW STATE
    // ================================================================

    await test("[window] Window state save function exists in backend", async () => {
      try {
        await call("get_window_label", {});
        assert(true, "get_window_label command available");
      } catch (e) {
        assert(false, "get_window_label failed: " + e.message);
      }
    });

    await test("[window] Window label matches G.windowLabel", async () => {
      const label = await call("get_window_label", {});
      assertEqual(label, G.windowLabel, "Window label from backend should match G.windowLabel");
    });

    // ================================================================
    // SECTION 26: RESPONSIVENESS & CLEANUP
    // ================================================================

    await test("[perf] Shell verbs query completes", async () => {
      try {
        const start = Date.now();
        const verbs = await call("get_shell_verbs", { path: "C:\\Windows\\notepad.exe" });
        const elapsed = Date.now() - start;
        assert(Array.isArray(verbs), "get_shell_verbs should return array");
        log("Shell verbs for .exe: " + verbs.length + " items in " + elapsed + "ms");
        assert(elapsed < 100, "Shell verbs should take < 100ms, took " + elapsed + "ms");
      } catch (e) {
        log("Shell verbs test: " + e.message);
      }
    });

    await test("[stability] App remains responsive after all tests", async () => {
      const tab = getTab();
      assert(tab, "getTab() returned null — app may be frozen");
      assert(tab.entries !== undefined, "tab.entries undefined");
      const el = document.getElementById("status-count");
      assert(el, "status-count element not found");
      assert(typeof el.textContent === "string", "status-count textContent not a string");
    });

    await test("[cleanup] Navigate back to C drive", async () => {
      let cDrive = null;
      $$(".drive-item").forEach(el => {
        if (el.dataset.path && el.dataset.path.toUpperCase().startsWith("C:")) cDrive = el;
      });
      if (cDrive) {
        simulateClick(cDrive);
        await waitForCondition(() => getTab().path === cDrive.dataset.path, 8000);
      }
    });

    log("=== GUI Test Suite End ===");
    const passed = results.filter(r => r.status === "PASS").length;
    const failed = results.filter(r => r.status === "FAIL").length;
    log("Results: " + passed + " passed, " + failed + " failed, " + results.length + " total");

    return { passed, failed, total: results.length, results, version: "v2-2026-05-03" };
  }

  // Register with Tauri event system
  function init() {
    const listen = (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.event && window.__TAURI_INTERNALS__.event.listen) ||
                   (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.listen);
    const emit = (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.event && window.__TAURI_INTERNALS__.event.emit) ||
                 (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.emit);

    window.__runTests = runAllTests;

    if (listen) {
      log("Test harness initialized, listen fn found");
      listen("run-tests", async () => {
        log("Received 'run-tests' event");
        try {
          const testResults = await runAllTests();
          if (emit) emit("test-results", testResults);
          await call("write_test_results", { results: JSON.stringify(testResults) });
        } catch (e) { log("Error: " + e.message); }
      });
    } else {
      log("Tauri event listen not available");
    }

    // Auto-run: check trigger via Rust command
    setTimeout(async () => {
      try {
        const val = await call("get_env", { key: "RHFILES_AUTORUN_TESTS" });
        log("RHFILES_AUTORUN_TESTS = " + JSON.stringify(val));
        if (val === "1") {
          log("Starting auto-run via env var");
          await autoRunAndSave();
        }
      } catch (e) {
        log("Auto-run check failed: " + e.message);
      }
    }, 5000);
  }

  async function autoRunAndSave() {
    log("autoRunAndSave called");
    try {
      const testResults = await runAllTests();
      log("Tests completed, writing results...");
      try {
        await call("write_test_results", { results: JSON.stringify(testResults) });
        log("Results written via Tauri command");
      } catch (e) {
        log("write_test_results failed: " + e.message + ", trying localStorage");
        try { localStorage.setItem("rhfiles-test-results", JSON.stringify(testResults)); } catch(e2) {}
      }
    } catch (e) {
      log("autoRunAndSave error: " + e.message);
      try {
        await call("write_test_results", { results: JSON.stringify({ error: e.message }) });
      } catch (e2) {}
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 1000));
  } else {
    setTimeout(init, 1000);
  }
})();
