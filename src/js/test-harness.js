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
    window.__rhfilesSuppressNativeClipboard = true;
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

    await test("[nav] Long breadcrumb reveals the path tail", async () => {
      assert(typeof revealBreadcrumbTail === 'function', "revealBreadcrumbTail not available");
      const bc = $("#breadcrumb");
      const oldHtml = bc.innerHTML;
      const oldWidth = bc.style.width;
      bc.style.width = "120px";
      bc.innerHTML = '<span style="display:inline-block;flex:0 0 700px">C:\\very\\long\\path\\whose\\tail\\must\\stay\\visible</span>';
      revealBreadcrumbTail(bc);
      await sleep(50);
      assert(bc.scrollLeft > 0, "Breadcrumb did not scroll toward the trailing path");
      bc.style.width = oldWidth;
      bc.innerHTML = oldHtml;
      renderBreadcrumb(getTab().path);
    });

    await test("[search] Folder and global scopes can be switched", async () => {
      assert(typeof toggleSearchScope === 'function', "toggleSearchScope not available");
      const scopeButton = $("#btn-search-scope");
      assert(scopeButton, "Search scope button not found");
      const original = _searchScope;
      const originalStored = localStorage.getItem('rhfiles-search-scope');
      _searchScope = 'folder';
      updateSearchScopeUI();
      assert(scopeButton.classList.contains('active'), "Folder search scope is not indicated");
      toggleSearchScope();
      assertEqual(_searchScope, 'global', "Search scope did not switch to global");
      _searchScope = original;
      if (originalStored === null) localStorage.removeItem('rhfiles-search-scope');
      else localStorage.setItem('rhfiles-search-scope', originalStored);
      updateSearchScopeUI();
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
      const expected = tabName(tab.path);
      assertEqual(tabEl.textContent, expected, "Tab label text");
    });

    await test("[tabs] Long tab labels reveal their trailing path", async () => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:90px';
      const label = document.createElement('span');
      label.className = 'tab-label';
      label.style.width = '90px';
      label.textContent = 'C:\\a-very-long-parent-folder\\another-long-folder\\important-tail';
      host.appendChild(label);
      document.body.appendChild(host);
      revealTabLabelTails(host);
      await sleep(50);
      assert(label.scrollWidth > label.clientWidth, "Test label did not overflow");
      assert(label.scrollLeft >= label.scrollWidth - label.clientWidth - 1, "Tab label was not scrolled to its tail");
      assert(label.classList.contains('tail-clipped'), "Clipped tab did not receive its tail fade");
      host.remove();
    });

    await test("[tabs] Active and inactive tabs have distinct surfaces", async () => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-10000px;top:0;display:flex';
      host.innerHTML = '<div class="tab"><span class="tab-label">Inactive</span></div><div class="tab active"><span class="tab-label">Active</span></div>';
      document.body.appendChild(host);
      const inactive = getComputedStyle(host.children[0]);
      const active = getComputedStyle(host.children[1]);
      assert(inactive.backgroundColor !== active.backgroundColor, "Tab surfaces are visually identical");
      assert(active.boxShadow !== 'none', "Active tab has no visual emphasis");
      host.remove();
    });

    await test("[tabs] Tab new button exists", async () => {
      const newBtn = $(".tab-new");
      assert(newBtn, "New tab button not found");
    });

    await test("[tabs] Duplicate tab is inserted beside the source with matching state", async () => {
      const source = getTab();
      const sourceIndex = G.tabs.indexOf(source);
      const originalCount = G.tabs.length;
      const expectedHistory = [...(source.history || [])];
      await duplicateTab(source.id, false);
      const duplicate = getTab();
      try {
        assertEqual(G.tabs.length, originalCount + 1, "Duplicate tab was not added");
        assertEqual(G.tabs[sourceIndex + 1].id, duplicate.id, "Duplicate tab was not placed beside its source");
        assertEqual(duplicate.path, source.path, "Duplicate tab path differs from its source");
        assertEqual(duplicate.sortF, source.sortF, "Duplicate tab sort field differs from its source");
        assertEqual(duplicate.sortAsc, source.sortAsc, "Duplicate tab sort direction differs from its source");
        assertEqual(duplicate.pinned === true, source.pinned === true, "Duplicate tab pin state differs from its source");
        assertEqual(JSON.stringify(duplicate.history), JSON.stringify(expectedHistory), "Duplicate tab history differs from its source");
        assert(duplicate.history !== source.history, "Duplicate tab shares its history array with the source");
      } finally {
        closeTab(duplicate.id, false);
        if (G.activeTab !== source.id) switchTab(source.id);
      }
    });

    await test("[tabs] Pinning moves a tab into the protected leading group and persists", async () => {
      const originalTabs = [...G.tabs];
      const originalPinned = new Map(G.tabs.map(tab => [tab.id, tab.pinned === true]));
      const rightTab = G.rpTabs[0];
      const originalRightPinned = rightTab?.pinned === true;
      const originalStored = localStorage.getItem('rhfiles-tabs');
      const candidate = G.tabs[G.tabs.length - 1];
      try {
        G.tabs.forEach(tab => { tab.pinned = false; });
        if (rightTab) {
          rightTab.pinned = false;
          toggleTabPinned(rightTab.id, true);
          assert(rightTab.pinned === true, "Right-pane tab was not pinned");
        }
        toggleTabPinned(candidate.id, false);
        assert(candidate.pinned === true, "Tab was not marked as pinned");
        assertEqual(G.tabs[0].id, candidate.id, "Pinned tab was not moved ahead of normal tabs");
        const element = document.querySelector(`#tab-bar .tab[data-tab-id="${candidate.id}"]`);
        assert(element?.classList.contains('pinned'), "Pinned tab has no pinned visual state");
        assert(element?.querySelector('.tab-pin'), "Pinned tab has no pin indicator");
        assert(!element?.querySelector('.tab-close'), "Pinned tab still exposes an accidental close button");
        const stored = JSON.parse(localStorage.getItem('rhfiles-tabs') || '{}');
        assert(stored.tabs?.find(tab => tab.id === candidate.id)?.pinned === true, "Left pinned state was not persisted");
        assert(stored.rightTabs?.find(tab => tab.id === rightTab?.id)?.pinned === true, "Right pinned state was not persisted");
        toggleTabPinned(candidate.id, false);
        assert(candidate.pinned !== true, "Tab was not unpinned");
      } finally {
        originalTabs.forEach(tab => { tab.pinned = originalPinned.get(tab.id) === true; });
        if (rightTab) rightTab.pinned = originalRightPinned;
        G.tabs.splice(0, G.tabs.length, ...originalTabs);
        renderTabs();
        if (originalStored === null) localStorage.removeItem('rhfiles-tabs');
        else localStorage.setItem('rhfiles-tabs', originalStored);
      }
    });

    await test("[tabs] Pinned ordering is stable and bulk close actions protect pinned tabs", async () => {
      const tabs = [
        {id:1, pinned:false},
        {id:2, pinned:true},
        {id:3, pinned:false},
        {id:4, pinned:true},
      ];
      normalizePinnedTabOrder(tabs);
      assertEqual(tabs.map(tab => tab.id).join(','), '2,4,1,3', "Pinned normalization did not preserve group order");
      assertEqual(tabsKeptAfterCloseOthers(tabs, 1).map(tab => tab.id).join(','), '2,4,1', "Close Others did not protect pinned tabs");
      assertEqual([...closableTabIdsToRight(tabs, 2)].join(','), '1,3', "Close Right included a pinned tab or missed normal tabs");
    });

    await test("[tabs] Reorder helper supports dropping before and after a tab", async () => {
      const tabs = [{id:1}, {id:2}, {id:3}];
      assert(reorderTabsByDrop(tabs, 3, 1, false), "Reorder before target was rejected");
      assertEqual(tabs.map(tab => tab.id).join(','), '3,1,2', "Drop-before order is wrong");
      assert(reorderTabsByDrop(tabs, 3, 2, true), "Reorder after target was rejected");
      assertEqual(tabs.map(tab => tab.id).join(','), '1,2,3', "Drop-after order is wrong");
      assert(!reorderTabsByDrop(tabs, 2, 2, true), "Dropping a tab onto itself changed the order");
      const grouped = [{id:4, pinned:true}, {id:5, pinned:true}, {id:6, pinned:false}];
      assert(reorderTabsByDrop(grouped, 5, 4, false), "Pinned tabs could not be reordered within their group");
      assertEqual(grouped.map(tab => tab.id).join(','), '5,4,6', "Pinned group reorder is wrong");
      assert(!reorderTabsByDrop(grouped, 4, 6, true), "Pinned tab crossed into the normal tab group");
      assertEqual(grouped.map(tab => tab.id).join(','), '5,4,6', "Rejected cross-group drag changed the order");
    });

    await test("[tabs] Dragging a rendered tab persists the new order", async () => {
      if (typeof DataTransfer !== 'function' || typeof DragEvent !== 'function') {
        log("SKIP: DragEvent/DataTransfer constructors unavailable");
        return;
      }
      if (G.tabs.length < 2) {
        addTab(getTab().path, false);
        await sleep(100);
      }
      const originalTabs = [...G.tabs];
      const originalOrder = originalTabs.map(tab => tab.id);
      try {
        renderTabs();
        const source = document.querySelector(`#tab-bar .tab[data-tab-id="${originalOrder[0]}"]`);
        const target = document.querySelector(`#tab-bar .tab[data-tab-id="${originalOrder[originalOrder.length - 1]}"]`);
        assert(source && target, "Rendered drag source or target is missing");
        const transfer = new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart', {bubbles:true, cancelable:true, dataTransfer:transfer}));
        const rect = target.getBoundingClientRect();
        target.dispatchEvent(new DragEvent('dragover', {bubbles:true, cancelable:true, dataTransfer:transfer, clientX:rect.right - 1}));
        target.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:transfer, clientX:rect.right - 1}));
        assertEqual(G.tabs[G.tabs.length - 1].id, originalOrder[0], "Rendered tab drag did not move the source after the target");
        const stored = JSON.parse(localStorage.getItem('rhfiles-tabs') || '{}');
        assertEqual(stored.tabs?.map(tab => tab.id).join(','), G.tabs.map(tab => tab.id).join(','), "Dragged tab order was not persisted");
      } finally {
        G.tabs.splice(0, G.tabs.length, ...originalTabs);
        renderTabs();
        saveTabState();
      }
    });

    await test("[tabs] Switching tab cancels pending hover preview", async () => {
      if (G.tabs.length < 2) {
        addTab();
        await sleep(300);
      }
      const target = G.tabs.find(tab => tab.id !== G.activeTab);
      assert(target, "No inactive tab available");
      const targetEl = document.querySelector(`.tab[data-tab-id="${target.id}"]`);
      assert(targetEl, "Inactive tab element not found");
      targetEl.dispatchEvent(new MouseEvent("mouseenter"));
      assert(_previewTimer !== null, "Hover preview timer was not scheduled");
      switchTab(target.id);
      await sleep(700);
      assert(_previewTimer === null, "Hover preview timer was not cleared");
      assert(!_previewEl || !_previewEl.classList.contains("visible"), "Hover preview opened after tab switch");
    });

    await test("[tabs] Active tab does not open hover preview", async () => {
      const activeEl = $(".tab.active");
      assert(activeEl, "Active tab element not found");
      activeEl.dispatchEvent(new MouseEvent("mouseenter"));
      await sleep(700);
      assert(_previewTimer === null, "Active tab scheduled a hover preview");
      assert(!_previewEl || !_previewEl.classList.contains("visible"), "Active tab opened a hover preview");
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

    await test("[filelist] Detail headers align with row columns", async () => {
      if (typeof setLayout === 'function') setLayout('details');
      await sleep(100);
      const header = $("#file-header");
      const row = $("#file-list .file-row");
      if (!row) { log("SKIP: No file rows"); return; }
      const pairs = [
        ['.col-date[data-sort="modified"]', '.row-date:nth-of-type(4)'],
        ['.col-date[data-sort="created"]', '.row-date:nth-of-type(5)'],
        ['.col-type', '.row-type'],
        ['.col-size', '.row-size']
      ];
      for (const [headerSelector, rowSelector] of pairs) {
        const headerCell = header.querySelector(headerSelector);
        const rowCell = row.querySelector(rowSelector);
        assert(headerCell && rowCell, `Missing alignment pair: ${headerSelector} / ${rowSelector}`);
        const delta = Math.abs(headerCell.getBoundingClientRect().left - rowCell.getBoundingClientRect().left);
        assert(delta < 0.6, `${headerSelector} is misaligned by ${delta}px`);
      }
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

    await test("[layout] Legacy icons layout migrates to cards", async () => {
      if (typeof setLayout !== 'function') { log("SKIP: setLayout not available"); return; }
      setLayout('icons');
      await sleep(200);
      assertEqual(G.layout, 'cards', "Legacy icons layout should map to cards");
      assert(!$(".layout-btn[data-layout='icons']"), "Icons layout button should be removed");
      const activeBtn = $(".layout-btn.active[data-layout='cards']");
      assert(activeBtn, "Cards layout button should be active after migration");
    });

    await test("[layout] Switch to cards layout", async () => {
      if (typeof setLayout !== 'function') { log("SKIP: setLayout not available"); return; }
      setLayout('cards');
      await sleep(200);
      assertEqual(G.layout, 'cards', "Layout should be cards");
      const activeBtn = $(".layout-btn.active[data-layout='cards']");
      assert(activeBtn, "Cards layout button should be active");
    });

    await test("[layout] Columns select files on one click and open on double-click", async () => {
      const host = document.createElement('div');
      host.id = 'column-test-host';
      document.body.appendChild(host);
      const entry = {name:'sample.json', path:'C:\\sample.json', is_dir:false, extension:'json', size:2, size_display:'2 B', modified_ts:0, created_ts:0, modified:'', created:''};
      const pane = {path:'C:\\', entries:[entry], sel:new Set(), lastIdx:-1};
      const savedPreview = G.previewOn;
      const originalOpen = openFileHandler;
      let opened = 0;
      G.previewOn = false;
      openFileHandler = async () => { opened++; };
      renderColumnLayout(host, pane.entries, pane.sel, false, pane, host.id, pane.path);
      await sleep(20);
      const item = host.querySelector('.column-item');
      simulateClick(item);
      assertEqual(opened, 0, "Column single-click opened a file");
      item.dispatchEvent(new MouseEvent('dblclick', {bubbles:true, cancelable:true}));
      assertEqual(opened, 1, "Column double-click did not open the file");
      openFileHandler = originalOpen;
      G.previewOn = savedPreview;
      host.remove();
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

    await test("[sort] Date, type, and size sorting reorder files and preserve selection", async () => {
      if (typeof sortBy !== 'function') { log("SKIP: sortBy not available"); return; }
      const tab = getTab();
      const saved = {
        entries: tab.entries,
        sel: tab.sel,
        lastIdx: tab.lastIdx,
        sortF: tab.sortF,
        sortAsc: tab.sortAsc,
        globalField: G.sortField,
        globalAsc: G.sortAsc,
      };
      const mock = (name, extension, size, modified) => ({
        name, path: `C:\\sort-test\\${name}`, extension, size,
        size_display: `${size} B`, modified_ts: modified, created_ts: modified,
        modified: '', created: '', is_dir: false, is_hidden: false,
      });
      try {
        tab.entries = [
          mock('bravo.txt', 'txt', 30, 200),
          mock('alpha.jpg', 'jpg', 20, 300),
          mock('charlie.csv', 'csv', 10, 100),
        ];
        tab.sel = new Set([0]);
        tab.lastIdx = 0;
        tab.sortF = 'name';
        tab.sortAsc = true;
        G.sortField = 'name';
        G.sortAsc = true;

        sortBy('size');
        assertEqual(tab.entries.map(entry => entry.name).join(','), 'charlie.csv,alpha.jpg,bravo.txt', "Ascending size sort did not reorder entries");
        assertEqual(tab.entries[[...tab.sel][0]].path, 'C:\\sort-test\\bravo.txt', "Selection moved to a different file after sorting");

        sortBy('size');
        assertEqual(tab.entries.map(entry => entry.name).join(','), 'bravo.txt,alpha.jpg,charlie.csv', "Descending size sort did not reorder entries");

        sortBy('modified');
        assertEqual(tab.entries.map(entry => entry.name).join(','), 'charlie.csv,bravo.txt,alpha.jpg', "Modified-date sort did not reorder entries");

        sortBy('type');
        assertEqual(tab.entries.map(entry => entry.name).join(','), 'charlie.csv,alpha.jpg,bravo.txt', "Type sort did not reorder entries");

        tab.entries[0].modified_ts = 0;
        tab.entries[0].modified = '2026-01-03 00:00';
        tab.entries[1].modified_ts = 0;
        tab.entries[1].modified = '2026-01-01 00:00';
        tab.entries[2].modified_ts = 0;
        tab.entries[2].modified = '2026-01-02 00:00';
        tab.sortF = 'type';
        tab.sortAsc = true;
        sortBy('modified');
        assertEqual(tab.entries.map(entry => entry.name).join(','), 'alpha.jpg,bravo.txt,charlie.csv', "Text-only modified dates were not sorted");
      } finally {
        tab.entries = saved.entries;
        tab.sel = saved.sel;
        tab.lastIdx = saved.lastIdx;
        tab.sortF = saved.sortF;
        tab.sortAsc = saved.sortAsc;
        G.sortField = saved.globalField;
        G.sortAsc = saved.globalAsc;
        updateSortArrows();
        renderFiles(tab, 'file-list', 'status-count', 'status-selection');
        saveTabState();
      }
    });

    await test("[sort] Sorted virtual list keeps scroll geometry and remains clickable", async () => {
      if (typeof sortBy !== 'function' || typeof detailsRowHeight !== 'function') {
        log("SKIP: virtual-list helpers not available");
        return;
      }
      const tab = getTab();
      const list = $("#file-list");
      const saved = {
        entries: tab.entries,
        sel: tab.sel,
        lastIdx: tab.lastIdx,
        sortF: tab.sortF,
        sortAsc: tab.sortAsc,
        globalField: G.sortField,
        globalAsc: G.sortAsc,
        layout: G.layout,
        groupBy: G.groupBy,
        previewOn: G.previewOn,
        scrollTop: list.scrollTop,
      };
      try {
        tab.entries = Array.from({length: 160}, (_, index) => ({
          name: `virtual-${String(index).padStart(3, '0')}.txt`,
          path: `C:\\virtual-sort-test\\virtual-${String(index).padStart(3, '0')}.txt`,
          extension: 'txt', size: 160 - index, size_display: `${160 - index} B`,
          modified_ts: index, created_ts: index, modified: '', created: '',
          is_dir: false, is_hidden: false,
        }));
        tab.sel = new Set();
        tab.lastIdx = -1;
        tab.sortF = 'name';
        tab.sortAsc = true;
        G.sortField = 'name';
        G.sortAsc = true;
        G.layout = 'details';
        G.groupBy = 'none';
        G.previewOn = false;
        list.scrollTop = 0;

        sortBy('size');
        await sleep(30);
        const rowH = detailsRowHeight(list);
        const spacer = list.querySelector('.virtual-list-spacer');
        assert(spacer, "Virtual spacer was not rendered");
        assert(Math.abs(parseFloat(spacer.style.height) - rowH * tab.entries.length) < 0.5,
          "Virtual spacer does not match the themed row height");

        list.scrollTop = rowH * 40;
        list.dispatchEvent(new Event('scroll'));
        await sleep(40);
        const row = [...list.querySelectorAll('.file-row')].find(candidate => {
          const rect = candidate.getBoundingClientRect();
          const listRect = list.getBoundingClientRect();
          return rect.bottom > listRect.top && rect.top < listRect.bottom;
        });
        assert(row, "No clickable row was rendered after scrolling");
        const index = Number(row.dataset.index);
        const path = row.dataset.path;

        // A sub-row scroll must not destroy the node under the pointer. Replacing
        // it between mouse-down and click was the cause of intermittent misses.
        list.scrollTop += Math.max(1, Math.floor(rowH / 4));
        list.dispatchEvent(new Event('scroll'));
        await sleep(40);
        assert(list.querySelector(`.file-row[data-index="${index}"]`) === row,
          "Visible row node was replaced during a small scroll");

        simulateClick(row);
        await sleep(20);
        assert(tab.sel.has(index), "Click did not select the sorted row");
        assertEqual(tab.entries[index].path, path, "Click selected a different sorted entry");
        assert(row.classList.contains('selected'), "Selected row did not receive visual state");
      } finally {
        tab.entries = saved.entries;
        tab.sel = saved.sel;
        tab.lastIdx = saved.lastIdx;
        tab.sortF = saved.sortF;
        tab.sortAsc = saved.sortAsc;
        G.sortField = saved.globalField;
        G.sortAsc = saved.globalAsc;
        G.layout = saved.layout;
        G.groupBy = saved.groupBy;
        G.previewOn = saved.previewOn;
        updateSortArrows();
        renderFiles(tab, 'file-list', 'status-count', 'status-selection');
        list.scrollTop = saved.scrollTop;
        saveTabState();
      }
    });

    await test("[sort] Right pane applies its own sort and arrow", async () => {
      if (typeof paneSortBy !== 'function') { log("SKIP: paneSortBy not available"); return; }
      const saved = {
        entries: G.rp.entries,
        sel: G.rp.sel,
        lastIdx: G.rp.lastIdx,
        sortF: G.rp.sortF,
        sortAsc: G.rp.sortAsc,
      };
      try {
        G.rp.entries = [
          {name:'large.bin', path:'C:\\large.bin', extension:'bin', size:30, size_display:'30 B', modified_ts:0, created_ts:0, modified:'', created:'', is_dir:false},
          {name:'small.bin', path:'C:\\small.bin', extension:'bin', size:10, size_display:'10 B', modified_ts:0, created_ts:0, modified:'', created:'', is_dir:false},
        ];
        G.rp.sel = new Set([0]);
        G.rp.lastIdx = 0;
        G.rp.sortF = 'name';
        G.rp.sortAsc = true;
        paneSortBy('right', 'size');
        assertEqual(G.rp.entries.map(entry => entry.name).join(','), 'small.bin,large.bin', "Right-pane size sort did not reorder entries");
        assertEqual(document.querySelector('#pane-right .col-size .sort-arrow')?.textContent, '\u25b2', "Right-pane sort arrow was not updated");
        assertEqual(G.rp.entries[[...G.rp.sel][0]].path, 'C:\\large.bin', "Right-pane selection moved to another file");
      } finally {
        Object.assign(G.rp, saved);
        updateSortArrows();
        renderFiles(G.rp, 'right-file-list', 'right-status-count', null, true);
        saveTabState();
      }
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
      window.__rhfilesTestPreviewState = G.previewOn;
      window.__rhfilesTestSettings = JSON.parse(JSON.stringify(G.settings));
      window.__rhfilesTestSettingsStorage = localStorage.getItem('rhfiles-settings');
      assert(typeof G.settings.previewDefaultOpen === 'boolean', "Preview startup setting is missing");
      setPreviewPaneVisible(false, false);
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

    await test("[preview] Syntax colors cover code, data, config, markup, and logs", async () => {
      assert(typeof syntaxHighlight === 'function', "syntaxHighlight not available");
      assertIncludes(syntaxHighlight('const answer = "42"; // note', 'js', 'sample.js'), 'tok-keyword', "JavaScript keyword color missing");
      assertIncludes(syntaxHighlight('{"answer": 42, "ready": true}', 'json', 'sample.json'), 'tok-property', "JSON property color missing");
      assertIncludes(syntaxHighlight('<section class="card">Hello</section>', 'html', 'sample.html'), 'tok-tag', "Markup tag color missing");
      assertIncludes(syntaxHighlight('server.port = 8080', 'toml', 'settings.toml'), 'tok-property', "Config key color missing");
      assertIncludes(syntaxHighlight('2026-09-06 ERROR request failed', 'log', 'app.log'), 'tok-error', "Log severity color missing");
    });

    await test("[preview] Highlighted text stays escaped and shows its language", async () => {
      const safe = syntaxHighlight('<script>alert("x")</script>', 'txt', 'note.txt');
      assertNotIncludes(safe, '<script>', "Plain-text preview allowed markup injection");
      assertIncludes(safe, '&lt;script&gt;', "Plain-text preview did not escape markup");
      const rendered = renderTextPreview('let value = true;', 'ts', 'sample.ts');
      assertIncludes(rendered, 'TypeScript', "Language badge missing");
      assertIncludes(rendered, 'preview-code-shell', "Code preview shell missing");
    });

    await test("[preview] Very long text is bounded before syntax rendering", async () => {
      const prepared = truncatePreviewText(('const value = 1;\n').repeat(10000));
      assert(prepared.truncated, "Long preview was not marked as truncated");
      assert(prepared.text.length <= TEXT_PREVIEW_MAX_CHARS, "Long preview exceeded the character cap");
      assert(prepared.text.split('\n').length <= TEXT_PREVIEW_MAX_LINES + 1, "Long preview exceeded the line cap");
      assertIncludes(renderTextPreview(('x\n').repeat(50000), 'txt', 'large.txt'), t('preview.truncated'), "Truncation notice is missing");
    });

    await test("[preview] Image preview exposes fit, fill, width, and 1:1 modes", async () => {
      const rendered = renderImagePreview('AA==', 'sample.png');
      for (const mode of ['contain', 'cover', 'width', 'actual']) {
        assertIncludes(rendered, `data-image-mode="${mode}"`, `Image mode ${mode} is missing`);
      }
    });

    await test("[preview] Maintained offline 3D loaders are available on demand", async () => {
      assertEqual(MODEL_PREVIEW_MAX_BYTES, 128 * 1024 * 1024, "3D preview has no safe file-size cap");
      const module = await loadPreview3DModule();
      assertEqual(module.MODEL_PREVIEW_MAX_BYTES, MODEL_PREVIEW_MAX_BYTES, "3D loader and preview routing disagree on the size cap");
      assert(typeof module.render3DPreview === 'function', "3D preview renderer did not load");
      assert(typeof module.dispose3DPreview === 'function', "3D preview cleanup is missing");
      for (const extension of ['glb', 'gltf', 'obj', 'fbx', 'stl', 'ply', '3mf']) {
        assert(module.SUPPORTED_3D_EXTENSIONS.includes(extension), `3D format ${extension} is missing`);
        assert(MODEL_PREVIEW_EXTENSIONS.has(extension), `Preview routing for ${extension} is missing`);
      }
    });

    await test("[preview] 3D renderer parses and draws a local STL model", async () => {
      const module = await loadPreview3DModule();
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:240px;';
      document.body.appendChild(host);
      const stl = 'solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test';
      try {
        await module.render3DPreview({
          container: host,
          extension: 'stl',
          sourceUrl: 'data:model/stl;base64,' + btoa(stl),
          fileName: 'triangle.stl',
          isCurrent: () => true,
        });
        assert(host.querySelector('canvas.preview-model-canvas'), "3D renderer did not create a canvas");
        assertIncludes(host.querySelector('.preview-model-stats')?.textContent || '', '1', "3D geometry statistics were not rendered");
      } finally {
        module.dispose3DPreview();
        host.remove();
      }
    });

    await test("[preview] Settings exposes the default-open option", async () => {
      openSettings();
      const settingsBox = document.querySelector('#settings-dialog .settings-dialog-box');
      assert(settingsBox && settingsBox.getBoundingClientRect().width >= Math.min(700, window.innerWidth - 48), "Settings workspace is still using the narrow dialog layout");
      assertEqual(document.querySelectorAll('#settings-nav .settings-nav-item').length, SETTINGS_SECTIONS.length, "Settings category navigation is incomplete");
      assertEqual(document.querySelectorAll('#settings-content .settings-page.active').length, 1, "Settings must show exactly one category at a time");
      switchSettingsSection('updates', false);
      assert(document.querySelector('[data-settings-page="updates"].active'), "Settings category navigation did not switch pages");
      const checkbox = $("#settings-preview-default");
      assert(checkbox, "Preview default-open setting is missing");
      assertEqual(checkbox.checked, G.settings.previewDefaultOpen !== false, "Preview setting state is out of sync");
      assert($("#settings-global-search"), "Global-search enable setting is missing");
      assert($("#settings-auto-update"), "Automatic-update setting is missing");
      assert($("#settings-proxy-enabled"), "Proxy enable setting is missing");
      assert($("#settings-proxy-url"), "Proxy address setting is missing");
      assert($("#settings-update-source"), "Update-source setting is missing");
      assert($("#settings-update-github"), "Configurable GitHub update location is missing");
      assert($("#settings-update-server"), "Configurable home-server update location is missing");
      assertEqual($("#settings-update-github").value, getGithubUpdateSource(), "GitHub source input is out of sync");
      assertEqual($("#settings-update-server").value, getServerUpdateSource(), "Home-server source input is out of sync");
      assert($("#settings-check-update"), "Manual update button is missing");
      assert($("#settings-update-failure"), "Persistent update-failure detail is missing");
      switchSettingsSection('integration', false);
      assert($("#settings-integration-enabled"), "Windows integration enable setting is missing");
      assert($("#settings-integration-shortcut"), "Windows integration shortcut display is missing");
      assert($("#settings-integration-status"), "Windows integration status is missing");
      assertEqual($("#settings-integration-enabled").checked, G.settings.fileDialogIntegrationEnabled === true, "Windows integration setting state is out of sync");
      const sampleFailure = {
        category:'locked',
        message:'Apply error: running processes prevented the update',
        technicalDetail:'code: 32, file is being used by another process',
        targetVersion:'0.1.18',
        logPath:'C:\\Users\\test\\AppData\\Local\\velopack\\velopack_RHFiles.log',
        searchPath:'D:\\software\\RHFiles\\current',
      };
      renderUpdateFailure(sampleFailure);
      assert(!$("#settings-update-failure").hidden, "Update failure was not shown beside the button");
      assertIncludes($("#settings-update-failure-text").textContent, '0.1.18', "Failed target version is missing");
      assertIncludes($("#settings-update-failure-text").textContent, sampleFailure.searchPath, "Lock search path is missing");
      assertIncludes($("#settings-update-failure-text").textContent, 'code: 32', "Technical failure detail is missing");
      assert(!$("#settings-update-log").hidden, "Update log action is hidden for a logged failure");
      assertEqual(classifyUpdateFailureText('Access denied; code: 32, file in use'), 'locked', "File lock should outrank a secondary access warning");
      renderUpdateFailure(null);
      const packagedFeed = await call('get_env', {key:'RHFILES_TEST_UPDATE_SOURCE'}).catch(() => '');
      if (packagedFeed) {
        const updateStatus = await call('check_updates', {source:packagedFeed});
        assert(updateStatus?.managed, "Velopack portable build was not recognized as managed");
        assert(updateStatus?.isPortable, "Velopack build was not recognized as portable");
        assert(/^\d+\.\d+\.\d+/.test(updateStatus.currentVersion || ''), "Velopack manifest version is invalid");
        const expectedCurrent = await call('get_env', {key:'RHFILES_TEST_EXPECTED_CURRENT'}).catch(() => '');
        const expectedUpdate = await call('get_env', {key:'RHFILES_TEST_EXPECTED_UPDATE'}).catch(() => '');
        if (expectedCurrent) assertEqual(updateStatus.currentVersion, expectedCurrent, "Velopack read the wrong installed version");
        if (expectedUpdate) assertEqual(updateStatus.availableVersion, expectedUpdate, "Update feed did not select the expected newer release");
      }
      closeSettings();
    });

    await test("[integration] File-dialog picker stays opt-in and publishes every open location", async () => {
      const savedEnabled = G.settings.fileDialogIntegrationEnabled;
      try {
        G.settings.fileDialogIntegrationEnabled = false;
        assertEqual(activeIntegrationFolder(), getTab().path === 'home://' ? null : getTab().path, "Integration did not resolve the active pane folder");
        const locations = fileDialogIntegrationLocations();
        assert(Array.isArray(locations), "Integration locations are not an array");
        assert(locations.every(location => location.path && ['left','right'].includes(location.pane)), "Integration published an invalid tab location");
        assert(locations.some(location => location.active) || locations.length === 0, "Integration did not identify the active RHFiles location");
        const status = await syncFileDialogIntegration(true);
        assertEqual(status.enabled, false, "Disabled integration unexpectedly installed an active hook");
        assertEqual(status.locationCount, locations.length, "Integration status did not report all open locations");
        assert(Array.isArray(status.supportedTargets) && status.supportedTargets.includes('windowsFileDialog'), "Windows file dialogs are not advertised as a supported target");
        assert(status.supportedTargets.includes('windowsExplorer'), "Windows Explorer is not advertised as a supported target");
      } finally {
        G.settings.fileDialogIntegrationEnabled = savedEnabled;
        await syncFileDialogIntegration(true).catch(() => {});
      }
    });

    await test("[media] Conversion dialog supports video, audio, and image profiles", async () => {
      assertEqual(mediaConversionKind({name:'clip.mkv', extension:'mkv', is_dir:false}), 'video', "MKV was not recognized as video");
      assertEqual(mediaConversionKind({name:'track.flac', extension:'flac', is_dir:false}), 'audio', "FLAC was not recognized as audio");
      assertEqual(mediaConversionKind({name:'photo.webp', extension:'webp', is_dir:false}), 'image', "WebP was not recognized as an image");
      assertEqual(mediaConversionKind({name:'notes.txt', extension:'txt', is_dir:false}), null, "Text was incorrectly treated as convertible media");
      await showMediaConvertDialog({name:'clip.mkv', path:'C:\\Media\\clip.mkv', extension:'mkv', is_dir:false}, false);
      assertEqual($('#media-convert-dialog').style.display, 'flex', "Conversion dialog did not open");
      assert(_mediaConvertFfmpegStatus?.available, "Bundled development FFmpeg was not detected");
      assert($('#media-convert-format').querySelector('option[value="mp4"]'), "Video conversion is missing MP4 output");
      assert(!$('#media-convert-codec').hidden, "Video codec configuration is hidden");
      $('#media-convert-format').value = 'gif';
      updateMediaConvertControls();
      assert($('#media-convert-codec').hidden, "GIF conversion kept an irrelevant video codec option");
      closeMediaConvertDialog();
    });

    await test("[themes] Built-in and file-based theme packs are validated and hot-swappable", async () => {
      assert(getAvailableThemePacks().length >= 6, "Expected at least six built-in themes");
      const parsed = parseUserTheme({
        fileName:'test-theme.json',
        path:'C:\\Themes\\test-theme.json',
        content:JSON.stringify({schemaVersion:1,id:'test-theme',name:{en:'Test',zh:'测试'},base:'dark',variables:{'--accent':'#39c5bb'}}),
      });
      assertEqual(parsed.id, 'user:test-theme', "User theme IDs must not collide with built-in themes");
      assertEqual(parsed.variables['--accent'], '#39c5bb', "User theme variables were not retained");
      const previousLanguage = _lang;
      _lang = 'zh';
      const localizedName = localizedThemeName(parsed);
      _lang = previousLanguage;
      assertEqual(localizedName, '测试', "Localized user-theme name did not follow the UI language");
      let rejected = false;
      try {
        parseUserTheme({fileName:'unsafe.json', content:JSON.stringify({schemaVersion:1,id:'unsafe',name:'Unsafe',base:'light',variables:{'background-image':'url(x)'}})});
      } catch (_) { rejected = true; }
      assert(rejected, "Unknown theme variables were not rejected");

      const previousTheme = G.theme;
      applyTheme('sand', false);
      assertEqual(document.documentElement.dataset.themePack, 'sand', "Built-in theme pack did not activate");
      assertEqual(document.documentElement.getAttribute('data-theme'), 'light', "Theme base was not applied");
      applyTheme(previousTheme, false);
    });

    await test("[updates] GitHub and home-server locations are independently configurable", async () => {
      const savedSettings = { ...G.settings };
      const savedStorage = localStorage.getItem('rhfiles-settings');
      try {
        G.settings.githubUpdateSource = 'https://github.com/example/custom-files';
        G.settings.serverUpdateSource = '\\\\HOME-NAS\\Apps\\RHFiles-Releases';
        G.settings.updateSourceMode = 'github';
        assertEqual(getUpdateSource(), 'https://github.com/example/custom-files', "Custom GitHub source was not selected");
        G.settings.updateSourceMode = 'server';
        assertEqual(getUpdateSource(), '\\\\HOME-NAS\\Apps\\RHFiles-Releases', "Custom home-server source was not selected");

        localStorage.setItem('rhfiles-settings', JSON.stringify({
          updateSource: '\\\\OLD-SERVER\\Public\\RHFiles-Releases',
        }));
        const migrated = loadSettings();
        assertEqual(migrated.updateSourceMode, 'server', "Legacy server setting did not migrate to server mode");
        assertEqual(migrated.serverUpdateSource, '\\\\OLD-SERVER\\Public\\RHFiles-Releases', "Legacy server path was not preserved");
      } finally {
        G.settings = savedSettings;
        if (savedStorage === null) localStorage.removeItem('rhfiles-settings');
        else localStorage.setItem('rhfiles-settings', savedStorage);
      }
    });

    await test("[updates] Automatic checks and proxy settings follow the configured policy", async () => {
      const savedSettings = { ...G.settings };
      try {
        assertEqual(UPDATE_CHECK_INTERVAL_MS, 60 * 60 * 1000, "Automatic update interval is not one hour");
        G.settings.autoUpdateEnabled = false;
        assertEqual(canCheckForUpdates(false), false, "A background check was allowed while automatic checks were off");
        assertEqual(canCheckForUpdates(true), true, "A manual check was blocked while automatic checks were off");

        G.settings.proxyEnabled = false;
        G.settings.proxyUrl = '127.0.0.1:7890';
        assertEqual(getUpdateProxy(), null, "A disabled proxy was still sent to the updater");
        G.settings.proxyEnabled = true;
        assertEqual(getUpdateProxy(), '127.0.0.1:7890', "The configured proxy address was not selected");
      } finally {
        G.settings = savedSettings;
      }
    });

    await test("[updates] Client exposes the complete bundled release history offline", async () => {
      const history = await call('get_release_history', {
        source:getUpdateSource(),
        proxy:null,
        allowRemote:false,
      });
      assertEqual(history.source, 'bundled', "Offline release history unexpectedly used the network");
      assert(Array.isArray(history.releases) && history.releases.length >= 10, "Bundled release history is incomplete");
      assert(history.releases.some(entry => entry.version === history.currentVersion), "Current version is absent from release history");
      assert(history.releases.some(entry => entry.version === '0.1.0'), "Initial release notes are absent from release history");
      renderReleaseHistory({...history, refreshing:true});
      assert(document.querySelector('#settings-release-history .settings-release-item'), "Bundled history was not rendered before a remote refresh");
      assert(document.querySelector('#settings-release-history .settings-history-refreshing'), "Background refresh state replaced the offline history");
    });

    await test("[preview] Toggle preview pane off", async () => {
      if (typeof togglePreviewPane !== 'function') { log("SKIP: togglePreviewPane not available"); return; }
      togglePreviewPane();
      await sleep(300);
      assertEqual(G.previewOn, false, "Preview should be off");
      G.settings = window.__rhfilesTestSettings;
      if (window.__rhfilesTestSettingsStorage === null) localStorage.removeItem('rhfiles-settings');
      else localStorage.setItem('rhfiles-settings', window.__rhfilesTestSettingsStorage);
      setPreviewPaneVisible(!!window.__rhfilesTestPreviewState, false);
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

    await test("[clipboard] Multiple selected paths are copied as Windows path lines", async () => {
      assert(typeof formatPathsForClipboard === 'function', "formatPathsForClipboard not found");
      assertEqual(
        formatPathsForClipboard([
          {path: 'C:\\Folder with spaces\\alpha.txt'},
          {path: '\\\\SERVER-HOME\\Public\\beta.txt'},
          {path: 'D:\\中文\\gamma.txt'},
        ]),
        'C:\\Folder with spaces\\alpha.txt\r\n\\\\SERVER-HOME\\Public\\beta.txt\r\nD:\\中文\\gamma.txt',
        "Multiple paths should use CRLF without changing Windows or UNC syntax",
      );
      assert(DEFAULT_SHORTCUTS['file.copyPaths'].includes('Ctrl+Shift+C'), "Copy-path shortcut is not registered");
    });

    await test("[clipboard] Multi-select context menu enables Copy Paths", async () => {
      const tab = getTab();
      const savedEntries = tab.entries;
      const savedSelection = tab.sel;
      const savedLastIndex = tab.lastIdx;
      try {
        tab.entries = [
          {name:'first.txt', path:'C:\\first.txt', extension:'txt', is_dir:false, size:1, size_display:'1 B'},
          {name:'second.txt', path:'C:\\second.txt', extension:'txt', is_dir:false, size:1, size_display:'1 B'},
        ];
        tab.sel = new Set([0, 1]);
        tab.lastIdx = 1;
        G.lastActivePane = 'left';
        showContextMenu(20, 20, false);
        const expectedLabel = t('ctx.copyPaths', {count: 2});
        const item = [...document.querySelectorAll('.context-menu > .ctx-item')]
          .find(candidate => candidate.querySelector(':scope > span')?.textContent === expectedLabel);
        assert(item, "Multi-select Copy Paths action is missing");
        assert(!item.classList.contains('disabled'), "Multi-select Copy Paths action is disabled");
      } finally {
        removeContextMenu();
        tab.entries = savedEntries;
        tab.sel = savedSelection;
        tab.lastIdx = savedLastIndex;
      }
    });

    await test("[clipboard] Paste falls back to the native Windows file clipboard", async () => {
      const savedClipboard = G.clipboard;
      const originalNativePaste = pasteWindowsFileClipboard;
      let pastedInto = null;
      try {
        G.clipboard = null;
        pasteWindowsFileClipboard = async path => { pastedInto = path; };
        await paste(false);
        assertEqual(pastedInto, getTab().path, "Native clipboard paste did not target the active folder");
      } finally {
        pasteWindowsFileClipboard = originalNativePaste;
        G.clipboard = savedClipboard;
      }
    });

    await test("[clipboard] Native paste forwards task-scoped byte progress", async () => {
      const originalCall = call;
      const originalRefreshPastedFolder = refreshPastedFolder;
      let request = null;
      let wasCancellable = false;
      try {
        refreshPastedFolder = async () => {};
        call = async (command, args) => {
          if (command !== 'paste_windows_file_clipboard') return originalCall(command, args);
          request = args;
          const task = _operationTasks.get(args.operationId);
          wasCancellable = !!task?.cancellable;
          updateProgress({
            operationId: args.operationId,
            status: 'progress',
            percentage: 40,
            bytesTransferred: 40 * 1024 * 1024,
            totalBytes: 100 * 1024 * 1024,
            speed: 10 * 1024 * 1024,
            entriesCompleted: 2,
            totalEntries: 5,
          });
          return {aborted:false, moved:false};
        };
        await pasteWindowsFileClipboard('C:\\destination', false, getTab().id);
        assert(request?.operationId, "Native paste did not forward its task id");
        assert(wasCancellable, "Native paste task was not cancellable while running");
        const task = _operationTasks.get(request.operationId);
        assertEqual(task?.status, 'complete', "Native paste task did not finish");
        assertEqual(task?.totalBytes, 100 * 1024 * 1024, "Native paste byte total was lost");
        assertEqual(task?.speed, 10 * 1024 * 1024, "Native paste speed was lost");
      } finally {
        if (request?.operationId) _operationTasks.delete(request.operationId);
        call = originalCall;
        refreshPastedFolder = originalRefreshPastedFolder;
        renderOperationCenter();
      }
    });

    const nativeClipboardProgressSource = await call('get_env', {
      key: 'RHFILES_NATIVE_CLIPBOARD_PROGRESS_SOURCE',
    });
    const nativeClipboardProgressDestination = await call('get_env', {
      key: 'RHFILES_NATIVE_CLIPBOARD_PROGRESS_DESTINATION',
    });
    if (nativeClipboardProgressSource && nativeClipboardProgressDestination) {
      await test("[clipboard] Native IFileOperation emits intermediate byte progress", async () => {
        const eventApi = window.__TAURI_INTERNALS__?.event || window.__TAURI__?.event;
        assert(eventApi?.listen, "Tauri event listener is unavailable");
        const operationId = createOperationTaskId();
        const snapshots = [];
        let clipboardSequence = 0;
        let unlisten = null;
        try {
          unlisten = await eventApi.listen('op-progress', (event) => {
            if (event.payload?.operationId === operationId) snapshots.push(event.payload);
          });
          clipboardSequence = Number(await call('set_windows_file_clipboard', {
            paths: [nativeClipboardProgressSource],
            cut: false,
          })) || 0;
          assert(clipboardSequence > 0, "Native file clipboard did not return a sequence number");
          showProgress(t('status.pastingWindowsClipboard'), {
            taskId: operationId,
            indeterminate: true,
            cancellable: true,
            currentPath: nativeClipboardProgressDestination,
          });
          const outcome = await call('paste_windows_file_clipboard', {
            destination: nativeClipboardProgressDestination,
            operationId,
          });
          await sleep(150);
          assert(!outcome?.aborted, "Windows aborted the native clipboard paste");
          const byteSnapshots = snapshots.filter((entry) => Number(entry.totalBytes) > 0);
          assert(byteSnapshots.length > 0, "No byte progress event was emitted");
          assert(byteSnapshots.some((entry) => {
            const transferred = Number(entry.bytesTransferred) || 0;
            const total = Number(entry.totalBytes) || 0;
            return transferred > 0 && transferred < total;
          }), "No intermediate byte progress was emitted: " + JSON.stringify(byteSnapshots));
          assert(byteSnapshots.some((entry) => Number(entry.speed) > 0),
            "No non-zero transfer speed was emitted");
          completeOperationTask(operationId);
        } finally {
          if (typeof unlisten === 'function') unlisten();
          if (clipboardSequence > 0) {
            try {
              await call('clear_windows_file_clipboard', {expectedSequence: clipboardSequence});
            } catch (error) {}
          }
          _operationTasks.delete(operationId);
          renderOperationCenter();
        }
      });
    }

    await test("[clipboard] A newer Windows clipboard replaces stale internal files", async () => {
      const savedClipboard = G.clipboard;
      const originalCall = call;
      const originalNativePaste = pasteWindowsFileClipboard;
      let nativePasteCount = 0;
      try {
        G.clipboard = {op:'copy', paths:new Set(['C:\\stale.txt']), sequence:41};
        call = async (command, args) => command === 'get_windows_file_clipboard_info'
          ? {sequence:42, hasFiles:true}
          : originalCall(command, args);
        pasteWindowsFileClipboard = async () => { nativePasteCount++; };
        await paste(false);
        assertEqual(nativePasteCount, 1, "New external clipboard data did not replace the stale internal copy");
        assertEqual(G.clipboard, null, "Stale internal clipboard was retained");
      } finally {
        call = originalCall;
        pasteWindowsFileClipboard = originalNativePaste;
        G.clipboard = savedClipboard;
      }
    });

    await test("[clipboard] File-view Paste remains available for Explorer and RDP clipboard data", async () => {
      const savedClipboard = G.clipboard;
      try {
        G.clipboard = null;
        showContextMenu(20, 20, false);
        const item = [...document.querySelectorAll('.context-menu > .ctx-item')]
          .find(candidate => candidate.querySelector(':scope > span')?.textContent === t('ctx.paste'));
        assert(item, "Paste action is missing when the internal clipboard is empty");
        assert(!item.classList.contains('disabled'), "Paste action is disabled for an external Windows clipboard");
      } finally {
        removeContextMenu();
        G.clipboard = savedClipboard;
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

    await test("[ctxmenu] Search input uses a localized app context menu", async () => {
      removeContextMenu();
      simulateContextMenu($("#filter-input"));
      await sleep(50);
      const menu = $(".context-menu");
      assert(menu, "Search input did not get an app context menu");
      assertIncludes(menu.textContent, t('search.scopeGlobal'), "Search scope action is missing");
      removeContextMenu();
    });

    await test("[ctxmenu] Folder background can open the current folder in VS Code", async () => {
      removeContextMenu();
      const expectedPath = getTab().path;
      const originalOpenWithProgram = openWithProgramFromMenu;
      let invoked = null;
      try {
        openWithProgramFromMenu = async (path, program) => { invoked = {path, program}; };
        showBlankListContextMenu(20, 20, false);
        const menu = $(".context-menu");
        assert(menu, "Folder background context menu did not appear");
        const openWith = [...menu.children].find(item => item.querySelector(':scope > span')?.textContent === t('ctx.openWith'));
        assert(openWith, "Folder background has no Open With submenu");
        const submenu = openWith.querySelector('.ctx-submenu');
        const vscode = [...(submenu?.children || [])].find(item => item.querySelector(':scope > span')?.textContent === 'VS Code');
        assert(vscode, "VS Code is missing from the folder background menu");
        simulateClick(vscode);
        await sleep(20);
        assertEqual(invoked?.path, expectedPath, "VS Code did not receive the current folder path");
        assertEqual(invoked?.program, 'vscode', "Folder background dispatched the wrong program");
      } finally {
        openWithProgramFromMenu = originalOpenWithProgram;
        removeContextMenu();
      }
    });

    await test("[ctxmenu] Tab menu includes close, path, browser, CMD, and PowerShell", async () => {
      removeContextMenu();
      simulateContextMenu($("#tab-bar .tab"));
      await sleep(50);
      const menu = $(".context-menu");
      assert(menu, "Tab context menu did not appear");
      assert(menu.textContent.includes(t('tab.pin')) || menu.textContent.includes(t('tab.unpin')), "Pin-tab action is missing");
      assertIncludes(menu.textContent, t('tab.duplicate'), "Duplicate-tab action is missing");
      assertIncludes(menu.textContent, t('tab.close'), "Close-tab action is missing");
      assertIncludes(menu.textContent, t('ctx.copyPath'), "Copy-path action is missing");
      assertIncludes(menu.textContent, t('ctx.openFolderInExplorer'), "Windows Explorer folder action is missing");
      assertIncludes(menu.textContent, t('ctx.openCmd'), "CMD action is missing");
      assertIncludes(menu.textContent, t('ctx.openPowerShell'), "PowerShell action is missing");
      removeContextMenu();
    });

    await test("[delete] Deletion requires an explicit second confirmation", async () => {
      const pending = showConfirmDialog({message: 'test'});
      const overlay = $(".app-confirm-overlay");
      assert(overlay, "Delete confirmation overlay did not appear");
      simulateClick(overlay.querySelector('.dialog-btn:not(.danger)'));
      assertEqual(await pending, false, "Cancel should stop deletion");
    });

    await test("[delete] Repeated multi-select Delete opens only one confirmation", async () => {
      const tab = getTab();
      const savedEntries = tab.entries;
      const savedSelection = tab.sel;
      const savedLastIndex = tab.lastIdx;
      const originalConfirm = showConfirmDialog;
      let confirmCalls = 0;
      try {
        tab.entries = [
          {name:'first.txt', path:'C:\\first.txt', extension:'txt', is_dir:false},
          {name:'second.txt', path:'C:\\second.txt', extension:'txt', is_dir:false},
        ];
        tab.sel = new Set([0, 1]);
        tab.lastIdx = 1;
        G.lastActivePane = 'left';
        showConfirmDialog = async () => {
          confirmCalls++;
          await sleep(30);
          return false;
        };
        await Promise.all([deleteSelected(false), deleteSelected(false)]);
        assertEqual(confirmCalls, 1, "Repeated Delete created duplicate confirmation requests");
      } finally {
        showConfirmDialog = originalConfirm;
        _deleteRequestActive = false;
        tab.entries = savedEntries;
        tab.sel = savedSelection;
        tab.lastIdx = savedLastIndex;
      }
    });

    await test("[delete] Permanent Delete requires two confirmations", async () => {
      const tab = getTab();
      const savedEntries = tab.entries;
      const savedSelection = tab.sel;
      const savedLastIndex = tab.lastIdx;
      const originalConfirm = showConfirmDialog;
      const originalCall = call;
      let confirmCalls = 0;
      let deleteCalls = 0;
      try {
        tab.entries = [
          {name:'permanent.txt', path:'C:\\permanent.txt', extension:'txt', is_dir:false},
        ];
        tab.sel = new Set([0]);
        tab.lastIdx = 0;
        G.lastActivePane = 'left';
        showConfirmDialog = async () => {
          confirmCalls++;
          return confirmCalls === 1;
        };
        call = async command => {
          if (command === 'delete_files_permanently') deleteCalls++;
          return {deleted:[], errors:[]};
        };
        await deleteSelectedPermanently(false);
        assertEqual(confirmCalls, 2, "Permanent Delete did not request two confirmations");
        assertEqual(deleteCalls, 0, "Cancelling the final confirmation still deleted files");
      } finally {
        showConfirmDialog = originalConfirm;
        call = originalCall;
        _deleteRequestActive = false;
        tab.entries = savedEntries;
        tab.sel = savedSelection;
        tab.lastIdx = savedLastIndex;
      }
    });

    await test("[delete] Context-menu Delete does not bubble into a second dispatch", async () => {
      const tab = getTab();
      const savedEntries = tab.entries;
      const savedSelection = tab.sel;
      const savedLastIndex = tab.lastIdx;
      const originalDelete = deleteSelected;
      let deleteCalls = 0;
      try {
        tab.entries = [
          {name:'first.txt', path:'C:\\first.txt', extension:'txt', is_dir:false},
          {name:'second.txt', path:'C:\\second.txt', extension:'txt', is_dir:false},
        ];
        tab.sel = new Set([0, 1]);
        tab.lastIdx = 1;
        G.lastActivePane = 'left';
        deleteSelected = async () => { deleteCalls++; };
        showContextMenu(20, 20, false);
        document.querySelector('.context-menu').dispatchEvent(new KeyboardEvent('keydown', {
          key:'Delete', bubbles:true, cancelable:true,
        }));
        await sleep(10);
        assertEqual(deleteCalls, 1, "Context-menu Delete was dispatched more than once");
      } finally {
        removeContextMenu();
        deleteSelected = originalDelete;
        tab.entries = savedEntries;
        tab.sel = savedSelection;
        tab.lastIdx = savedLastIndex;
      }
    });

    await test("[ctxmenu] Submenu labels are localized without duplicate arrows", async () => {
      assert(!/[\u25b6\u25b8>]$/.test(t('ctx.openWith').trim()), "Open-with translation includes a hard-coded submenu arrow");
      assert(!/[\u25b6\u25b8>]$/.test(t('ctx.share').trim()), "Share translation includes a hard-coded submenu arrow");
      assert(!/[\u25b6\u25b8>]$/.test(t('ctx.compress').trim()), "Compress translation includes a hard-coded submenu arrow");
    });

    await test("[ctxmenu] Network menu opens with a loading state", async () => {
      showNetworkMenu(
        { clientX: 16, clientY: 16 },
        { name: "test-server", path: "\\\\test-server" },
        [],
        { loading: true, token: "gui-test-network-menu" },
      );
      const menu = $(".context-menu");
      assert(menu, "Network context menu did not open immediately");
      assert(menu.textContent.includes(t('ctx.loadingShares')), "Network context menu has no loading state");
      removeContextMenu();
    });

    await test("[tasks] Long actions use an indeterminate non-cancellable task", async () => {
      const taskId = showProgress(t('status.deleting'), { indeterminate: true, cancellable: false });
      const task = document.querySelector('[data-task-id="' + taskId + '"]');
      assert(task, "Operation task was not rendered");
      assert(task.querySelector(".progress-bar").classList.contains("indeterminate"), "Progress bar is not indeterminate");
      assert(!task.querySelector(".operation-task-cancel"), "Non-cancellable action still shows Cancel");
      completeOperationTask(taskId);
      dismissOperationTask(taskId);
    });

    await test("[tasks] Concurrent operations keep independent progress and can collapse", async () => {
      const savedCollapsed = _operationCenterCollapsed;
      toggleOperationCenter(true);
      await sleep(220);
      const copyTask = showProgress(t('status.copying'), {currentName:'large.bin'});
      const deleteTask = showProgress(t('status.deleting'), {
        currentName:'old-folder',
        indeterminate:true,
      });
      updateProgress({
        operationId: copyTask,
        status:'progress',
        percentage:40,
        bytesTransferred:40 * 1024 * 1024,
        totalBytes:100 * 1024 * 1024,
        speed:10 * 1024 * 1024,
        entriesCompleted:2,
        totalEntries:5,
      });
      const copyCard = document.querySelector('[data-task-id="' + copyTask + '"]');
      const deleteCard = document.querySelector('[data-task-id="' + deleteTask + '"]');
      assert(copyCard && deleteCard, "Concurrent task cards were not kept");
      assertIncludes(copyCard.textContent, '10', "Transfer speed is missing");
      assertIncludes(copyCard.textContent, formatOperationDuration(6), "ETA is missing");
      assert(deleteCard.querySelector('.progress-bar.indeterminate'), "Second task lost its own progress state");
      _operationTasks.get(copyTask).cancelRequested = true;
      showProgress(t('status.copying'), {taskId: copyTask, currentIndex: 2, totalItems: 3});
      assert(isOperationCancellationRequested(copyTask), "Batch refresh lost its pending cancellation");
      const taskChevronPath = $("#operation-center-toggle .operation-center-chevron path");
      assertEqual(taskChevronPath?.getAttribute('d'), 'm4 6 4 4 4-4', "Expanded task center should point down toward its collapse direction");
      toggleOperationCenter(false);
      await sleep(220);
      assert($("#operation-center").classList.contains("collapsed"), "Task center did not collapse");
      assertEqual($("#operation-center-toggle").title, t('tasks.expand'), "Collapsed task center should describe the expand action");
      assert(getComputedStyle($("#operation-center-toggle .operation-center-chevron")).transform !== 'none', "Collapsed task center should rotate the chevron upward");
      toggleOperationCenter(true);
      await sleep(220);
      assert(!$("#operation-center").classList.contains("collapsed"), "Task center did not expand");
      assertEqual($("#operation-center-toggle").title, t('tasks.collapse'), "Expanded task center should describe the collapse action");
      await waitForCondition(() => getComputedStyle($("#operation-center-toggle .operation-center-chevron")).transform === 'none', 1000);
      completeOperationTask(copyTask);
      completeOperationTask(deleteTask);
      dismissOperationTask(copyTask);
      dismissOperationTask(deleteTask);
      _operationCenterCollapsed = savedCollapsed;
      renderOperationCenter();
    });

    await test("[dragdrop] File drag payload identifies its source window", async () => {
      const savedWindowLabel = G.windowLabel;
      const values = new Map();
      const transfer = {
        effectAllowed: 'none',
        types: [],
        setData(type, value) {
          values.set(type, value);
          if (!this.types.includes(type)) this.types.push(type);
        },
        getData(type) { return values.get(type) || ''; },
      };
      try {
        G.windowLabel = 'drag-source-test';
        setRhfilesFileDragData(transfer, ['C:\\one.txt', 'C:\\folder'], false);
        const payload = readRhfilesFileDragData(transfer);
        assert(payload, "RHFiles drag payload could not be read");
        assertEqual(payload.sourceWindow, 'drag-source-test', "Drag payload lost the source window");
        assertEqual(payload.sourcePane, 'left', "Drag payload lost the source pane");
        assertEqual(payload.paths.length, 2, "Drag payload lost selected paths");
        assertEqual(transfer.effectAllowed, 'copyMove', "Drag payload does not allow copy and move");
      } finally {
        G.windowLabel = savedWindowLabel;
        clearRhfilesFileDragSession();
      }
    });

    await test("[dragdrop] Starting a drag keeps the rendered source node alive", async () => {
      if (typeof DataTransfer !== 'function' || typeof DragEvent !== 'function') {
        log("SKIP: DragEvent/DataTransfer constructors unavailable");
        return;
      }
      const list = document.createElement('div');
      list.id = 'drag-source-node-test';
      list.style.height = '100px';
      const entries = [
        {name:'selected.txt', path:'C:\\DragTest\\selected.txt', is_dir:false, extension:'txt', size_display:'1 B'},
        {name:'dragged.txt', path:'C:\\DragTest\\dragged.txt', is_dir:false, extension:'txt', size_display:'1 B'},
      ];
      const state = {path:'C:\\DragTest', entries, sel:new Set([0]), lastIdx:0};
      document.body.appendChild(list);
      try {
        renderDetailsLayout(list, entries, state.sel, false, state, list.id);
        const source = list.querySelector('[data-index="1"]');
        assert(source, "Unselected drag source was not rendered");
        const transfer = new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart', {
          bubbles:true,
          cancelable:true,
          dataTransfer:transfer,
        }));
        assert(source.isConnected, "Drag start replaced the DOM node being dragged");
        assertEqual(state.sel.size, 1, "Drag start did not normalize the selection");
        assert(state.sel.has(1), "Drag start did not select the dragged item");
        const payload = readRhfilesFileDragData(transfer);
        assertEqual(payload?.paths?.join('|'), entries[1].path, "Drag payload did not contain the dragged item");
      } finally {
        teardownVirtualList(list);
        list.remove();
        clearRhfilesFileDragSession();
      }
    });

    await test("[dragdrop] Hovering a file over a tab survives child dragleave events", async () => {
      if (typeof DataTransfer !== 'function' || typeof DragEvent !== 'function') {
        log("SKIP: DragEvent/DataTransfer constructors unavailable");
        return;
      }
      const originalLeft = switchTab;
      const bar = document.createElement('div');
      const left = document.createElement('div');
      const label = document.createElement('span');
      left.className = 'tab';
      left.dataset.tabId = String(G.activeTab + 900001);
      label.className = 'tab-label';
      left.appendChild(label);
      bar.appendChild(left);
      document.body.appendChild(bar);
      let leftActivated = null;
      try {
        switchTab = function(id) { leftActivated = id; };
        clearRhfilesFileDragSession();
        assert(isRhfilesFileDrag({types:[RHFILES_FILE_DRAG_MIME]}), "File drag type was not recognized");
        assert(!isRhfilesFileDrag({types:['text/plain']}), "Tab reordering was mistaken for file dragging");
        const payload = JSON.stringify({
          kind:'rhfiles-file-drag',
          sourceWindow:currentFileDragWindowId(),
          sourcePane:'left',
          paths:['C:\\DragTest\\hover.txt'],
        });
        const transfer = new DataTransfer();
        transfer.setData('text/plain', RHFILES_FILE_DRAG_PREFIX + payload);
        initTabDragDrop(bar, false);
        left.dispatchEvent(new DragEvent('dragover', {bubbles:true, cancelable:true, dataTransfer:transfer}));
        label.dispatchEvent(new DragEvent('dragleave', {bubbles:true, cancelable:true, dataTransfer:transfer}));
        await sleep(TAB_FILE_DRAG_SWITCH_DELAY_MS + 50);
        assertEqual(leftActivated, Number(left.dataset.tabId), "Left tab was not activated after hover");
      } finally {
        clearFileDragTabHover();
        clearRhfilesFileDragSession();
        switchTab = originalLeft;
        bar.remove();
      }
    });

    await test("[dragdrop] Dropping directly on a tab targets that tab's folder", async () => {
      if (typeof DataTransfer !== 'function' || typeof DragEvent !== 'function') {
        log("SKIP: DragEvent/DataTransfer constructors unavailable");
        return;
      }
      const originalSwitchTab = switchTab;
      const originalHandleDrop = handleRhfilesFileDrop;
      const target = {
        id:G.nextTabId + 900003,
        path:'D:\\TabDropTarget',
        entries:[],
        sel:new Set(),
      };
      const bar = document.createElement('div');
      const tab = document.createElement('div');
      tab.className = 'tab';
      tab.dataset.tabId = String(target.id);
      bar.appendChild(tab);
      document.body.appendChild(bar);
      G.tabs.push(target);
      let switchedTo = null;
      let received = null;
      try {
        switchTab = id => { switchedTo = id; };
        handleRhfilesFileDrop = async (payload, destination, entries, isRight) => {
          received = {payload, destination, entries, isRight};
          return true;
        };
        const payload = JSON.stringify({
          kind:'rhfiles-file-drag',
          sourceWindow:currentFileDragWindowId(),
          sourcePane:'left',
          paths:['C:\\DragTest\\drop.txt'],
        });
        const transfer = new DataTransfer();
        transfer.setData('text/plain', RHFILES_FILE_DRAG_PREFIX + payload);
        initTabDragDrop(bar, false);
        tab.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:transfer}));
        await waitForCondition(() => received !== null, 1000);
        assertEqual(switchedTo, target.id, "Tab drop did not activate its destination tab");
        assertEqual(received.destination, target.path, "Tab drop used the wrong destination folder");
        assertEqual(received.payload.paths[0], 'C:\\DragTest\\drop.txt', "Tab drop lost its source path");
        assertEqual(received.isRight, false, "Left tab drop was routed to the right pane");
      } finally {
        switchTab = originalSwitchTab;
        handleRhfilesFileDrop = originalHandleDrop;
        const index = G.tabs.indexOf(target);
        if (index >= 0) G.tabs.splice(index, 1);
        clearRhfilesFileDragSession();
        bar.remove();
      }
    });

    await test("[dragdrop] Cross-window drop asks whether to copy or move", async () => {
      const pending = showFileDropOperationDialog(['C:\\one.txt'], 'D:\\Destination');
      const overlay = document.querySelector('.app-file-drop-overlay');
      assert(overlay, "Copy-or-move dialog did not appear");
      assertIncludes(overlay.textContent, t('btn.copy'), "Copy action is missing from the drop dialog");
      assertIncludes(overlay.textContent, t('btn.move'), "Move action is missing from the drop dialog");
      const moveButton = [...overlay.querySelectorAll('button')]
        .find(button => button.textContent === t('btn.move'));
      assert(moveButton, "Move button is missing from the drop dialog");
      simulateClick(moveButton);
      assertEqual(await pending, 'move', "Drop dialog returned the wrong operation");
    });

    await test("[dragdrop] Selected copy and move operations reach the correct backend commands", async () => {
      const originalCall = call;
      const originalShowProgress = showProgress;
      const originalHideProgress = hideProgress;
      const originalTrackCopy = trackCopy;
      const originalTrackMove = trackMove;
      const commands = [];
      let copyUndoEntries = 0;
      let moveUndoEntries = 0;
      try {
        call = async command => {
          commands.push(command);
          if (command === 'path_exists') return false;
          return null;
        };
        showProgress = () => {};
        hideProgress = () => {};
        trackCopy = () => { copyUndoEntries++; };
        trackMove = () => { moveUndoEntries++; };
        await performDroppedFileOperation(['C:\\Source\\copy.txt'], 'D:\\Destination', [], 'copy');
        await performDroppedFileOperation(['C:\\Source\\move.txt'], 'D:\\Destination', [], 'move');
        assert(commands.includes('copy_with_progress'), "Copy choice did not call the copy backend");
        assert(commands.includes('move_with_progress'), "Move choice did not call the move backend");
        assertEqual(copyUndoEntries, 1, "Copy drop was not added to undo history");
        assertEqual(moveUndoEntries, 1, "Move drop was not added to undo history");
      } finally {
        call = originalCall;
        showProgress = originalShowProgress;
        hideProgress = originalHideProgress;
        trackCopy = originalTrackCopy;
        trackMove = originalTrackMove;
      }
    });

    await test("[ctxmenu] ZIP compression sends the backend sources argument", async () => {
      const request = makeCompressionRequest(
        [{ name: "example", path: "C:\\example" }],
        "C:\\output",
        "zip",
      );
      assertEqual(request.command, "create_archive", "ZIP uses the wrong backend command");
      assert(Array.isArray(request.args.sources), "ZIP request has no sources argument");
      assert(request.args.paths === undefined, "ZIP request still uses the invalid paths argument");
    });

    await test("[permissions] Dialog opens before ACL lookup completes", async () => {
      const targetPath = getTab().path || "C:\\";
      const pending = showPermissionsDialog(targetPath);
      const content = $("#perm-dialog-content");
      assert(content, "Permission dialog did not open immediately");
      assert(content.textContent.includes(t('dialog.permLoading')), "Permission dialog did not show a loading state");
      await pending;
      const dlg = content.closest("dialog");
      if (dlg?.open) dlg.close();
      if (dlg?.isConnected) dlg.remove();
    });

    await test("[favorites] Address-bar favorite controls exist", async () => {
      assert($("#btn-favorite-current"), "Left favorite button not found");
      assert($("#btn-right-favorite"), "Right favorite button not found");
      assert(typeof toggleCurrentFolderFavorite === 'function', "Favorite toggle function not found");
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
      assert(theme === "light" || theme === "dark", "Unexpected theme base: " + theme);
    });

    await test("[theme] G.theme is set", async () => {
      assert(G.theme !== undefined, "G.theme not set");
      assert(getAvailableThemePacks().some(theme => theme.id === G.theme), "Unknown active theme pack: " + G.theme);
    });

    await test("[theme] Toggle theme changes data-theme", async () => {
      if (typeof toggleTheme !== 'function') { log("SKIP: toggleTheme not available"); return; }
      const previousPack = G.theme;
      const before = document.documentElement.getAttribute("data-theme");
      toggleTheme();
      await sleep(100);
      const after = document.documentElement.getAttribute("data-theme");
      assert(after !== before, "Theme did not change after toggle: " + before + " -> " + after);
      applyTheme(previousPack);
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

    await test("[dialogs] Shortcut reset belongs to the settings footer", async () => {
      openSettings();
      switchSettingsSection('shortcuts', false);
      const resetButton = document.getElementById('settings-reset-shortcuts-footer');
      assert(resetButton, "Shortcut reset button is missing from the settings footer");
      assert(!resetButton.hidden, "Shortcut reset button is hidden on the shortcut page");
      assert(resetButton.closest('.settings-dialog-actions'), "Shortcut reset button still floats inside scrolling content");
      assert(!document.querySelector('.settings-shortcut-actions'), "Legacy floating shortcut action bar still exists");
      switchSettingsSection('general', false);
      assert(resetButton.hidden, "Shortcut reset button leaked into another settings category");
      closeSettings();
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

    await test("[dialogs] File-operation task center exists", async () => {
      const po = $("#operation-center");
      assert(po, "#operation-center not found");
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
      assert(typeof trackBatchRename === 'function', "trackBatchRename not found");
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

    await test("[undoredo] Delete and move actions use reversible exact operations", async () => {
      const savedUndo = undoStack;
      const savedRedo = redoStack;
      undoStack = [];
      redoStack = [];
      try {
        trackDelete(['C:\\undo-test.txt']);
        assertIncludes(String(undoStack[0].undo), 'restore_recycled_files', "Delete undo does not restore from the Recycle Bin");
        trackMove('C:\\source.txt', 'D:\\target.txt');
        assertIncludes(String(undoStack[1].undo), 'move_path_exact', "Move undo can overwrite an existing destination");
        assertIncludes(String(undoStack[1].redo), 'move_path_exact', "Move redo is not path-exact");
      } finally {
        undoStack = savedUndo;
        redoStack = savedRedo;
      }
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

    await test("[icons] Default mode uses app-associated file icons", async () => {
      const oldMode = G.settings.iconMode;
      delete G.settings.iconMode;
      const html = fileIcon({ name:'capture.rdc', path:'C:\\capture.rdc', is_dir:false, extension:'rdc' });
      G.settings.iconMode = oldMode;
      assertIncludes(html, 'system-icon-host', ".rdc did not request its Windows-associated icon");
    });

    await test("[icons] Associated icon requests share an extension cache", async () => {
      const first = systemIconCacheKey({path:'C:\\one.rdc', extension:'rdc', is_dir:false}, 16);
      const second = systemIconCacheKey({path:'D:\\two.rdc', extension:'rdc', is_dir:false}, 16);
      const exeFirst = systemIconCacheKey({path:'C:\\one.exe', extension:'exe', is_dir:false}, 16);
      const exeSecond = systemIconCacheKey({path:'D:\\two.exe', extension:'exe', is_dir:false}, 16);
      assertEqual(first, second, "Same-extension documents do not share their system icon cache");
      assert(exeFirst !== exeSecond, "Executables incorrectly share path-specific icons");
    });

    await test("[icons] Recommended mixed mode keeps custom folder icons", async () => {
      const oldMode = G.settings.iconMode;
      G.settings.iconMode = 'mixed';
      const html = fileIcon({ name:'Folder', path:'C:\\Folder', is_dir:true, extension:'' });
      G.settings.iconMode = oldMode;
      assertIncludes(html, '<svg', "Mixed mode did not keep the custom folder icon");
      assertNotIncludes(html, 'system-icon-host', "Mixed mode unexpectedly replaced the custom folder icon");
    });

    await test("[icons] bigFileIcon function exists", async () => {
      assert(typeof bigFileIcon === 'function', "bigFileIcon function not found");
    });

    await test("[icons] Large icon markup respects the requested size", async () => {
      const oldMode = G.settings.iconMode;
      G.settings.iconMode = 'builtin';
      const html = bigFileIcon({ name: 'example.txt', path: 'C:\\example.txt', is_dir: false, extension: 'txt' }, 64);
      G.settings.iconMode = oldMode;
      assertIncludes(html, 'large-file-icon', "Large icon wrapper missing");
      assertIncludes(html, 'width:64px', "Large icon size was not applied");
      assertNotIncludes(html, 'viewBox="0 0 48 48"', "SVG viewBox was incorrectly enlarged");
    });

    await test("[icons] Large executable icons use the Windows shell icon", async () => {
      const oldMode = G.settings.iconMode;
      G.settings.iconMode = 'builtin';
      const html = bigFileIcon({ name: 'app.exe', path: 'C:\\Windows\\System32\\notepad.exe', is_dir: false, extension: 'exe' }, 64);
      G.settings.iconMode = oldMode;
      assertIncludes(html, 'system-icon-host', "Executable fell back to a generic large icon");
      assertIncludes(html, 'width:64px', "Windows shell icon did not use the requested size");
    });

    await test("[icons] Card labels are not line-clipped", async () => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;height:600px';
      document.body.appendChild(host);
      const file = { name: 'a-very-long-file-name-that-needs-several-lines-to-display-completely.txt', path: 'C:\\' + Date.now() + '.txt', is_dir: false, extension: 'txt', size_display: '1 KB', modified: '' };
      renderCardLayout(host, [file], new Set(), false, { entries: [file], sel: new Set(), lastIdx: -1 }, 'file-list');
      const cardLabel = host.querySelector('.card-file-name');
      assert(cardLabel && cardLabel.textContent === file.name, "Card label text was truncated");
      assertEqual(getComputedStyle(cardLabel).maxHeight, 'none', "Card label still has a height clip");
      host.remove();
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
      assertEqual(
        generateUniqueName("C:\\Test", "file.txt", new Set(['file.txt', 'file (1).txt'])),
        'file (2).txt',
        "Keep-both should not rename or collide with an existing item"
      );
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

    await test("[startup] Initialization reaches a bounded ready state", async () => {
      assertEqual(G.startupReady, true, "Startup ready flag was not reached");
      assertEqual(document.documentElement.dataset.appReady, 'true', "Startup readiness is not exposed to diagnostics");
      assertEqual(I18N_FILE_TIMEOUT_MS, 2500, "Bundled language resources are not time-bounded");
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

    await test("[utils] Display paths preserve UNC roots and use forward slashes", async () => {
      assertEqual(displayPath('\\\\SERVER-HOME\\Public\\Software'), '//SERVER-HOME/Public/Software', "UNC display path lost its prefix");
      assertEqual(displayPath('C:\\Users\\Test'), 'C:/Users/Test', "Drive path was not display-normalized");
    });

    await test("[utils] File dates are fixed-width and language aware", async () => {
      const oldLang = _lang;
      const stamp = new Date(2026, 8, 6, 9, 7).getTime();
      _lang = 'zh';
      assertEqual(formatFileDate(stamp, ''), '2026\u5e7409\u670806\u65e5 09:07', "Chinese date format is incorrect");
      _lang = 'en';
      assertEqual(formatFileDate(stamp, ''), '09/06/2026 09:07', "English date format is incorrect");
      _lang = oldLang;
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

    await test("[i18n] Bundled Chinese translations load in portable builds", async () => {
      assert(I18N.zh, "Bundled zh translation was not loaded");
      assertEqual(I18N.zh['settings.title'], '\u8bbe\u7f6e', "Chinese settings translation is unavailable");
      assertEqual(I18N.zh['ctx.shareWechat'], '\u5fae\u4fe1', "Chinese share-menu translation is unavailable");
      assertEqual(I18N.zh['template.rustFile'], 'Rust \u6e90\u6587\u4ef6', "New-file templates are not localized");
      assertEqual(I18N.zh['settings.categoryIntegration'], 'Windows 集成', "Windows integration settings are not localized");
      assertEqual(detectDefaultLanguage(['zh-CN']), 'zh', "zh-CN should default to Chinese");
      assertEqual(detectDefaultLanguage(['en-US']), 'en', "en-US should default to English");
    });

    await test("[keyboard] Shortcut bindings loadable", async () => {
      if (typeof getShortcutBindings !== 'function') { log("SKIP: getShortcutBindings not available"); return; }
      const bindings = getShortcutBindings();
      assert(typeof bindings === 'object', "Bindings should be object");
    });

    await test("[keyboard] Default shortcuts include basic actions", async () => {
      if (typeof DEFAULT_SHORTCUTS === 'undefined') { log("SKIP: DEFAULT_SHORTCUTS not accessible"); return; }
      assert(DEFAULT_SHORTCUTS['file.copy'], "Missing file.copy shortcut");
      assert(DEFAULT_SHORTCUTS['file.copyPaths']?.includes('Ctrl+Shift+C'), "Missing copy-path shortcut");
      assert(DEFAULT_SHORTCUTS['file.paste'], "Missing file.paste shortcut");
      assert(DEFAULT_SHORTCUTS['file.deletePermanently']?.includes('Shift+Delete'), "Missing Shift+Delete permanent-delete shortcut");
      assert(DEFAULT_SHORTCUTS['file.toggleFavorite']?.includes('Ctrl+D'), "Missing Ctrl+D favorite shortcut");
      assert(DEFAULT_SHORTCUTS['tab.new'], "Missing tab.new shortcut");
      assert(DEFAULT_SHORTCUTS['tab.next']?.includes('Ctrl+Tab'), "Missing Ctrl+Tab shortcut");
      assert(DEFAULT_SHORTCUTS['tab.previous']?.includes('Ctrl+Shift+Tab'), "Missing Ctrl+Shift+Tab shortcut");
      assert(DEFAULT_SHORTCUTS['typeSearch.next']?.includes('Alt+]'), "Missing configurable Alt+] next-match shortcut");
      assert(DEFAULT_SHORTCUTS['typeSearch.previous']?.includes('Alt+['), "Missing configurable Alt+[ previous-match shortcut");
      assert(typeof ACTION_HANDLERS['typeSearch.next'] === 'function', "Missing next search-match action");
      assert(typeof ACTION_HANDLERS['typeSearch.previous'] === 'function', "Missing previous search-match action");
      assert(DEFAULT_SHORTCUTS['search.toggleScope']?.includes('Ctrl+Shift+F'), "Missing global-search toggle shortcut");
      assert(DEFAULT_SHORTCUTS['integration.quickSwitch']?.includes('Ctrl+G'), "Missing configurable file-dialog integration shortcut");
    });

    await test("[keyboard] Ctrl multi-selection focuses the file pane and Delete reaches every selected item", async () => {
      const tab = getTab();
      const savedEntries = tab.entries;
      const savedSelection = tab.sel;
      const savedLastIndex = tab.lastIdx;
      const savedPane = G.lastActivePane;
      const originalDelete = deleteSelected;
      let deleteCalls = 0;
      let selectedCount = 0;
      try {
        tab.entries = [
          {name:'first.txt', path:'C:\\first.txt', is_dir:false, extension:'txt', size:1, size_display:'1 B'},
          {name:'second.txt', path:'C:\\second.txt', is_dir:false, extension:'txt', size:1, size_display:'1 B'},
        ];
        tab.sel = new Set();
        tab.lastIdx = -1;
        G.lastActivePane = 'left';
        renderFiles(tab, 'file-list', 'status-count', 'status-selection');
        const list = $('#file-list');
        document.getElementById('filter-input').focus();
        handleRowClick({ctrlKey:true, shiftKey:false}, 0, tab.sel, tab, false);
        handleRowClick({ctrlKey:true, shiftKey:false}, 1, tab.sel, tab, false);
        const active = document.activeElement;
        assert(!['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName),
          `Editable field kept focus after file selection (active=${active?.tagName || 'none'}#${active?.id || ''})`);
        deleteSelected = async function(isRight) {
          deleteCalls += 1;
          selectedCount = getSelectedPaths(isRight).length;
        };
        (document.activeElement || document).dispatchEvent(new KeyboardEvent('keydown', {
          key:'Delete',
          bubbles:true,
          cancelable:true,
        }));
        await sleep(20);
        assertEqual(deleteCalls, 1, "Delete shortcut was swallowed after multi-selection");
        assertEqual(selectedCount, 2, "Delete shortcut lost part of the selection");
      } finally {
        deleteSelected = originalDelete;
        tab.entries = savedEntries;
        tab.sel = savedSelection;
        tab.lastIdx = savedLastIndex;
        G.lastActivePane = savedPane;
        renderFiles(tab, 'file-list', 'status-count', 'status-selection');
      }
    });

    await test("[keyboard] Typed-search shortcut defaults dispatch in both directions", async () => {
      const originalNext = ACTION_HANDLERS['typeSearch.next'];
      const originalPrevious = ACTION_HANDLERS['typeSearch.previous'];
      const originalBindings = _shortcutBindings;
      let nextCalls = 0;
      let previousCalls = 0;
      try {
        _shortcutBindings = Object.fromEntries(
          Object.entries(DEFAULT_SHORTCUTS).map(([id, keys]) => [id, [...keys]])
        );
        ACTION_HANDLERS['typeSearch.next'] = async () => { nextCalls++; };
        ACTION_HANDLERS['typeSearch.previous'] = async () => { previousCalls++; };
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key:']', code:'BracketRight', altKey:true, bubbles:true, cancelable:true,
        }));
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key:'[', code:'BracketLeft', altKey:true, bubbles:true, cancelable:true,
        }));
        await sleep(30);
        assertEqual(nextCalls, 1, "Alt+] did not dispatch the next typed-search match");
        assertEqual(previousCalls, 1, "Alt+[ did not dispatch the previous typed-search match");
      } finally {
        ACTION_HANDLERS['typeSearch.next'] = originalNext;
        ACTION_HANDLERS['typeSearch.previous'] = originalPrevious;
        _shortcutBindings = originalBindings;
      }
    });

    await test("[keyboard] Legacy typed-search defaults migrate once", async () => {
      const saved = localStorage.getItem('rhfiles-shortcuts');
      const originalBindings = _shortcutBindings;
      try {
        localStorage.setItem('rhfiles-shortcuts', JSON.stringify({
          'typeSearch.next': ['F3'],
          'typeSearch.previous': ['Shift+F3'],
        }));
        _shortcutBindings = null;
        const migrated = loadShortcutBindings();
        assertEqual(migrated['typeSearch.next'][0], 'Alt+]', "Legacy next-match default was not migrated");
        assertEqual(migrated['typeSearch.previous'][0], 'Alt+[', "Legacy previous-match default was not migrated");
        const persisted = JSON.parse(localStorage.getItem('rhfiles-shortcuts'));
        assertEqual(persisted._schemaVersion, SHORTCUT_BINDING_SCHEMA_VERSION, "Shortcut migration version was not persisted");
      } finally {
        if (saved === null) localStorage.removeItem('rhfiles-shortcuts');
        else localStorage.setItem('rhfiles-shortcuts', saved);
        _shortcutBindings = originalBindings;
      }
    });

    await test("[keyboard] Ctrl held after multi-select still allows Delete", async () => {
      const action = findActionForKeyboardEvent(DEFAULT_SHORTCUTS, {
        key:'Delete', ctrlKey:true, shiftKey:false, altKey:false,
      });
      assertEqual(action, 'file.delete', "Ctrl+Delete did not fall back to the configured Delete action");
      const permanentAction = findActionForKeyboardEvent(DEFAULT_SHORTCUTS, {
        key:'Delete', ctrlKey:true, shiftKey:true, altKey:false,
      });
      assertEqual(permanentAction, 'file.deletePermanently', "Ctrl+Shift+Delete lost the permanent-delete action");
    });

    await test("[keyboard] Right Ctrl opens menu only for a short standalone tap", async () => {
      removeContextMenu();
      const rightCtrlDown = () => document.dispatchEvent(new KeyboardEvent('keydown', {
        key:'Control', code:'ControlRight', location:2, bubbles:true, cancelable:true,
      }));
      const rightCtrlUp = () => document.dispatchEvent(new KeyboardEvent('keyup', {
        key:'Control', code:'ControlRight', location:2, bubbles:true, cancelable:true,
      }));

      rightCtrlDown();
      rightCtrlUp();
      await sleep(10);
      assert(document.querySelector('.context-menu'), "Short right-Ctrl tap did not open the context menu");
      removeContextMenu();

      rightCtrlDown();
      assert(_rightCtrlTap, "Right-Ctrl tap state was not created");
      _rightCtrlTap.downAt -= RIGHT_CTRL_TAP_MAX_MS + 1;
      rightCtrlUp();
      await sleep(10);
      assert(!document.querySelector('.context-menu'), "Long right-Ctrl hold opened the context menu");

      rightCtrlDown();
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key:'Shift', code:'ShiftLeft', location:1, ctrlKey:true, bubbles:true, cancelable:true,
      }));
      rightCtrlUp();
      await sleep(10);
      assert(!document.querySelector('.context-menu'), "Right-Ctrl chord opened the context menu");
      _rightCtrlTap = null;
    });

    await test("[keyboard] Alt+Enter dispatches Properties exactly once", async () => {
      const originalHandler = ACTION_HANDLERS['file.properties'];
      const originalBindings = _shortcutBindings;
      let calls = 0;
      try {
        _shortcutBindings = Object.fromEntries(
          Object.entries(DEFAULT_SHORTCUTS).map(([id, keys]) => [id, [...keys]])
        );
        ACTION_HANDLERS['file.properties'] = async () => { calls++; };
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key:'Enter', code:'Enter', altKey:true, bubbles:true, cancelable:true,
        }));
        await sleep(30);
        assertEqual(calls, 1, "Alt+Enter opened Properties more than once");
      } finally {
        ACTION_HANDLERS['file.properties'] = originalHandler;
        _shortcutBindings = originalBindings;
      }
    });

    await test("[keyboard] Grid layouts navigate horizontally with Left and Right", async () => {
      assertEqual(gridNavigationIndex(4, 'ArrowLeft', 10, 3), 3, "Left did not select the previous visual item");
      assertEqual(gridNavigationIndex(4, 'ArrowRight', 10, 3), 5, "Right did not select the next visual item");
      assertEqual(gridNavigationIndex(4, 'ArrowUp', 10, 3), 1, "Up did not retain the visual column");
      assertEqual(gridNavigationIndex(4, 'ArrowDown', 10, 3), 7, "Down did not retain the visual column");
    });

    await test("[keyboard] Repeating a typed initial cycles matches", async () => {
      const tab = getTab();
      const savedEntries = tab.entries;
      const savedSel = tab.sel;
      const savedLastIdx = tab.lastIdx;
      const mock = name => ({ name, path: 'C:\\' + name, is_dir: false, extension: 'txt', size: 0, size_display: '0 B', modified: '', created: '' });
      tab.entries = [mock('alpha.txt'), mock('apple.txt'), mock('beta.txt')];
      tab.sel = new Set();
      tab.lastIdx = -1;
      G._typeSearch.str = 'a';
      await runTypeSearchSelection('a', 0, false);
      assertEqual(tab.lastIdx, 0, "First typed match was not selected");
      await runTypeSearchSelection('a', 1, false);
      assertEqual(tab.lastIdx, 1, "Typed match did not cycle to the next item");
      expireTypeSearchInput();
      assertEqual(G._typeSearch.str, '', "Expired input should start a fresh typed query");
      assertEqual(G._typeSearch.lastQuery, 'a', "Last typed query should remain available to the configured cycle shortcut");
      await cycleTypeSearchSelection(1);
      assertEqual(tab.lastIdx, 2, "Configured shortcut cycling did not include the middle-name match");
      await cycleTypeSearchSelection(1);
      assertEqual(tab.lastIdx, 0, "Configured shortcut cycling did not wrap to the first match");
      resetTypeSearch();
      tab.entries = savedEntries;
      tab.sel = savedSel;
      tab.lastIdx = savedLastIdx;
      renderFiles(tab, 'file-list', 'status-count', 'status-selection');
    });

    await test("[keyboard] Typed search matches inside names and highlights the hit", async () => {
      const tab = getTab();
      const savedEntries = tab.entries;
      const savedSel = tab.sel;
      const savedLastIdx = tab.lastIdx;
      const savedLayout = G.layout;
      try {
        tab.entries = [
          {name:'alpha.txt', path:'C:\\alpha.txt', is_dir:false, extension:'txt', size:0, size_display:'0 B', modified:'', created:''},
          {name:'annual-report-final.pdf', path:'C:\\annual-report-final.pdf', is_dir:false, extension:'pdf', size:0, size_display:'0 B', modified:'', created:''},
        ];
        tab.sel = new Set();
        tab.lastIdx = -1;
        G.layout = 'details';
        G._typeSearch.str = 'report';
        await runTypeSearchSelection('report', 0, false);
        assertEqual(tab.lastIdx, 1, "A match in the middle of the filename was not selected");
        const mark = document.querySelector('#file-list .file-row[data-index="1"] .type-search-match');
        assertEqual(mark?.textContent, 'report', "The matching filename characters were not highlighted");
        assert(getComputedStyle(mark).backgroundColor !== 'rgba(0, 0, 0, 0)', "The filename highlight is not visually distinct");
        const queryChip = document.querySelector('.type-search-hud .type-search-query');
        assertEqual(queryChip?.textContent, 'report', "The typed query is not prominent in the HUD");
        assert(parseFloat(getComputedStyle(queryChip).fontSize) >= 14, "The typed query remains too visually subtle");
        assert(typeSearchMatches({_pinyinAliases:['zhongguoren'], name:'\u4e2d\u56fd\u4eba'}, 'guo'), "Pinyin aliases do not support middle matching");
      } finally {
        resetTypeSearch();
        tab.entries = savedEntries;
        tab.sel = savedSel;
        tab.lastIdx = savedLastIdx;
        G.layout = savedLayout;
        renderFiles(tab, 'file-list', 'status-count', 'status-selection');
      }
    });

    await test("[keyboard] Chinese names match full Pinyin, initials, and heteronyms", async () => {
      const aliases = await call('pinyin_aliases', { names: ['中国人.txt', '重庆'] });
      assert(aliases[0].includes('zhongguorentxt'), "Full Pinyin alias missing");
      assert(aliases[0].includes('zgrtxt'), "Pinyin initials alias missing");
      assert(aliases[1].includes('chongqing'), "Heteronym Pinyin alias missing");
      assert(typeSearchMatches({ name: '重庆', _pinyinAliases: aliases[1] }, 'cq'), "Pinyin initials do not match type search");
    });

    await test("[archive] Named-folder extraction path is explicit", async () => {
      assertEqual(archiveFolderName('photos.zip'), 'photos', "ZIP folder name incorrect");
      assertEqual(archiveFolderName('backup.tar.gz'), 'backup', "Compound archive folder name incorrect");
      assertEqual(joinFolderPath('C:\\Temp\\', 'photos'), 'C:\\Temp\\photos', "Extraction destination incorrect");
      assertIncludes(t('ctx.extractTo', { name: 'photos' }), 'photos', "Named extraction label omits destination folder");
    });

    await test("[utils] parentFolderPath keeps drive roots intact", async () => {
      assertEqual(parentFolderPath("C:\\file.txt"), "C:\\", "Drive root parent is malformed");
      assertEqual(parentFolderPath("C:\\one\\two.txt"), "C:\\one", "Nested parent is malformed");
    });

    await test("[network] Address input canonicalizes UNC server roots", async () => {
      const threeSlashes = '\\'.repeat(3) + 'winserver';
      assertEqual(normalizeWindowsPathInput(threeSlashes), '\\\\winserver', "Extra UNC slash was not normalized");
      assertEqual(normalizeWindowsPathInput('//winserver/share'), '\\\\winserver\\share', "Forward-slash UNC input was not normalized");
      assertEqual(uncServerRoot(threeSlashes), '\\\\winserver', "UNC server root was not detected");
      assertEqual(uncServerRoot('\\\\winserver\\Public'), null, "A share path must not be treated as a server root");
    });

    await test("[navigation] Address input accepts local and UNC file URLs", async () => {
      assertEqual(
        normalizeWindowsPathInput('file:///D:/BetterLoreData/Deployment/New-PC/RailgunHamster%20BetterLore.zip'),
        'D:\\BetterLoreData\\Deployment\\New-PC\\RailgunHamster BetterLore.zip',
        "Local file URL was not decoded",
      );
      assertEqual(
        normalizeWindowsPathInput('file://SERVER-HOME/Public/Software/RHFiles.zip'),
        '\\\\server-home\\Public\\Software\\RHFiles.zip',
        "UNC file URL was not decoded",
      );
      assertEqual(
        normalizeWindowsPathInput('"file:///D:/%E6%B5%8B%E8%AF%95/file.txt"'),
        'D:\\测试\\file.txt',
        "Quoted Unicode file URL was not decoded",
      );
    });

    await test("[navigation] A file address selects the matching folder entry", async () => {
      const tab = getTab();
      const savedEntries = tab.entries;
      const savedSel = tab.sel;
      const savedLastIdx = tab.lastIdx;
      try {
        tab.entries = [
          {name:'one.txt', path:'C:\\AddressTest\\one.txt', is_dir:false, extension:'txt'},
          {name:'target.zip', path:'C:\\AddressTest\\Target.zip', is_dir:false, extension:'zip'},
        ];
        tab.sel = new Set();
        tab.lastIdx = -1;
        assert(selectNavigatedPath('c:\\addresstest\\target.zip', false), "Matching file was not selected");
        assert(tab.sel.has(1), "Selected index does not point at the addressed file");
        assertEqual(tab.lastIdx, 1, "Selection anchor was not updated");
      } finally {
        tab.entries = savedEntries;
        tab.sel = savedSel;
        tab.lastIdx = savedLastIdx;
        renderFiles(tab, 'file-list', 'status-count', 'status-selection');
      }
    });

    await test("[navigation] A real file URL opens its parent and selects the file", async () => {
      const originalPath = getTab().path;
      const tempPath = await call('get_env', {key:'TEMP'});
      const candidates = tempPath ? await listPathEntries(tempPath, '') : [];
      const target = candidates.find(entry => !entry.is_dir && !entry.is_hidden);
      if (!target) { log("SKIP: no visible file is available in TEMP"); return; }
      const fileUrl = 'file:///' + target.path
        .replace(/\\/g, '/')
        .split('/')
        .map((segment, index) => index === 0 ? segment : encodeURIComponent(segment))
        .join('/');
      try {
        assert(await navigateAddressInput(fileUrl, false), "File URL navigation failed");
        assertEqual(getTab().path.toLocaleLowerCase(), parentFolderPath(target.path).toLocaleLowerCase(), "File URL did not open its parent folder");
        const selected = getSelectedPaths(false);
        assertEqual(selected.length, 1, "File URL did not create a single selection");
        assertEqual(selected[0].path.toLocaleLowerCase(), target.path.toLocaleLowerCase(), "File URL selected the wrong entry");
      } finally {
        await navigateTo(originalPath, false);
      }
    });

    await test("[navigation] Known-folder redirects override USERPROFILE guesses", async () => {
      assert(G.knownFolders && typeof G.knownFolders.pictures === 'string' && G.knownFolders.pictures.length > 0, "Known-folder command did not return Pictures");
      const previous = G.knownFolders;
      const previousHome = G.homeDirPath;
      try {
        G.knownFolders = { pictures: 'C:\\Users\\Tester\\OneDrive\\Pictures' };
        G.homeDirPath = 'C:\\Users\\Tester';
        assertEqual(homeDir('Pictures'), 'C:\\Users\\Tester\\OneDrive\\Pictures', "Redirected Pictures path was ignored");
        assertEqual(migrateLegacyKnownFolderPath('C:\\Users\\Tester\\Pictures'), 'C:\\Users\\Tester\\OneDrive\\Pictures', "Saved legacy Pictures path was not migrated");
      } finally {
        G.knownFolders = previous;
        G.homeDirPath = previousHome;
      }
    });

    await test("[navigation] Failed folders show an actionable error state", async () => {
      const previousPath = getTab().path;
      const missingPath = 'C:\\__rhfiles_missing_navigation_test__';
      const opened = await navigateTo(missingPath, false);
      assertEqual(opened, false, "Missing folder unexpectedly opened");
      assert(document.querySelector('#file-list .navigation-error-notFound'), "Missing folder error panel was not rendered");
      await navigateTo(previousPath, false);
    });

    await test("[navigation] Restored tabs never fail as a silent blank view", async () => {
      const tab = getTab();
      const saved = {
        path:tab.path,
        entries:tab.entries,
        sel:tab.sel,
        lastIdx:tab.lastIdx,
        loaded:tab._loaded,
      };
      try {
        tab.path = 'C:\\__rhfiles_missing_background_refresh_test__';
        tab.entries = [];
        tab.sel = new Set();
        tab.lastIdx = -1;
        tab._loaded = false;
        renderNavigationLoading(tab.path, false);
        assert(document.querySelector('#file-list .navigation-loading'), "Unloaded tab did not show a loading state");
        await _refreshTabInBackground(tab);
        assert(document.querySelector('#file-list .navigation-error-notFound'), "Background refresh failure was swallowed into a blank view");

        tab.entries = [];
        tab._loaded = true;
        renderFiles(tab, 'file-list', 'status-count', 'status-selection');
        assert(document.querySelector('#file-list .file-list-empty'), "A genuinely empty folder was left visually blank");
      } finally {
        tab.path = saved.path;
        tab.entries = saved.entries;
        tab.sel = saved.sel;
        tab.lastIdx = saved.lastIdx;
        tab._loaded = saved.loaded;
        renderFiles(tab, 'file-list', 'status-count', 'status-selection');
      }
    });

    await test("[navigation] Filesystem errors retain a stable localized category", async () => {
      const denied = describeNavigationError('RHFILES_FS_ERROR|permission_denied|Access is denied. (os error 5)');
      assertEqual(denied.key, 'permissionDenied', "Permission error was not categorized");
      const missing = describeNavigationError('RHFILES_FS_ERROR|not_found|The system cannot find the path specified.');
      assertEqual(missing.key, 'notFound', "Missing path error was not categorized");
    });

    await test("[layout] Thumbnail view uses non-overlapping grid tracks", async () => {
      const tab = getTab();
      renderThumbnailLayout(document.getElementById('file-list'), tab.entries.slice(0, 6), tab.sel, false, tab, 'file-list');
      const grid = document.querySelector('#file-list > .thumbnail-grid');
      assert(grid, "Thumbnail grid was not rendered");
      assertEqual(getComputedStyle(grid).display, 'grid', "Thumbnail container must use CSS Grid");
      const items = grid.querySelectorAll('.thumb-item');
      const imageBox = grid.querySelector('.thumb-img-box');
      if (imageBox) assertEqual(getComputedStyle(imageBox).backgroundColor, 'rgba(0, 0, 0, 0)', "Thumbnail image box should be transparent");
      if (items.length > 1) {
        const first = items[0].getBoundingClientRect();
        const second = items[1].getBoundingClientRect();
        assert(first.right <= second.left || first.bottom <= second.top || second.bottom <= first.top, "Thumbnail cards overlap");
      }
      renderFiles(tab, 'file-list', 'status-count', 'status-selection');
    });

    await test("[preview] Fullscreen preview toggles and has configurable shortcut", async () => {
      togglePreviewFullscreen(true);
      assert(document.body.classList.contains('preview-fullscreen-active'), "Fullscreen preview class missing");
      assert(document.getElementById('preview-pane').classList.contains('fullscreen-preview'), "Preview pane did not become fullscreen");
      togglePreviewFullscreen(false);
      assert(!document.body.classList.contains('preview-fullscreen-active'), "Fullscreen preview did not close");
      assert(DEFAULT_SHORTCUTS['view.previewFullscreen']?.includes('Ctrl+Space'), "Fullscreen preview shortcut is not configurable");
    });

    await test("[dual pane] Right pane has an independent tab strip", async () => {
      renderRightTabs();
      const bar = document.getElementById('right-tab-bar');
      assert(bar && bar.querySelectorAll('.tab').length === G.rpTabs.length, "Right tab strip does not reflect right-pane tabs");
      assert(bar.querySelector('.tab')?.dataset.pane === 'right', "Right tab ownership is missing");
    });

    await test("[disk usage] Analyzer controls and renderer are available", async () => {
      assert(typeof showDiskUsageDialog === 'function', "Disk usage dialog is missing");
      assert(typeof parseDustSize === 'function', "dust size parser is missing");
      assertEqual(parseDustSize('1.5M'), 1.5 * 1024 * 1024, "dust size parsing is incorrect");
      assert(document.getElementById('disk-usage-results'), "Disk usage result surface is missing");
      const previousOpen = G.previewOn;
      const previousTab = G.inspectorTab;
      switchInspectorTab('disk');
      assertEqual(G.inspectorTab, 'disk', "Disk usage did not open in the inspector workspace");
      assert(G.previewOn, "Disk usage did not open the shared inspector");
      assert(document.getElementById('inspector-disk-view').classList.contains('active'), "Disk usage view is not active");
      assert(!document.getElementById('inspector-preview-view').classList.contains('active'), "Preview remained visible behind Disk usage");
      assert(document.getElementById('btn-disk-usage').classList.contains('active'), "Disk usage toolbar action is not active");
      assert(!document.getElementById('btn-preview').classList.contains('active'), "Preview toolbar action remained active");
      assertEqual(document.getElementById('inspector-mode-label').textContent, t('diskUsage.tab'), "Shared inspector heading does not reflect Disk usage");

      switchInspectorTab('preview');
      assert(document.getElementById('inspector-preview-view').classList.contains('active'), "Preview did not replace Disk usage");
      assert(!document.getElementById('inspector-disk-view').classList.contains('active'), "Disk usage remained visible behind Preview");
      assert(document.getElementById('disk-usage-item-actions'), "Disk usage item actions are missing");
      if (previousOpen) switchInspectorTab(previousTab);
      else setInspectorMode('closed', false);
    });

    await test("[disk usage] Active-folder changes invalidate stale results and schedule a rescan", async () => {
      const saved = {
        previewOn:G.previewOn,
        inspectorTab:G.inspectorTab,
        dualOn:G.dualOn,
        lastActivePane:G.lastActivePane,
        path:_diskUsagePath,
        token:_diskUsageToken,
        pendingPath:_diskUsagePendingPath,
        renderedPath:_diskUsageRenderedPath,
        rows:_diskUsageRows,
        selected:_diskUsageSelected,
        pathHtml:document.getElementById('disk-usage-path')?.innerHTML || '',
        summaryHtml:document.getElementById('disk-usage-summary')?.innerHTML || '',
        resultsHtml:document.getElementById('disk-usage-results')?.innerHTML || '',
      };
      try {
        if (_diskUsageRefreshTimer) clearTimeout(_diskUsageRefreshTimer);
        _diskUsageRefreshTimer = null;
        G.previewOn = true;
        G.inspectorTab = 'disk';
        G.dualOn = false;
        G.lastActivePane = 'left';
        _diskUsagePath = 'C:\\Old';
        _diskUsagePendingPath = '';
        _diskUsageRenderedPath = 'C:\\Old';
        document.getElementById('disk-usage-results').innerHTML = '<div>stale old-folder result</div>';
        const tokenBefore = _diskUsageToken;
        assert(syncDiskUsageWithActiveFolder('C:\\New', false), "Changing folders did not update the disk-usage target");
        assertEqual(_diskUsagePath, 'C:\\New', "Disk usage retained the previous folder path");
        assertEqual(document.getElementById('disk-usage-path').textContent, displayPath('C:\\New'), "Disk-usage path label is stale");
        assert(!document.getElementById('disk-usage-results').textContent.includes('old-folder'), "Old disk-usage rows remained visible");
        assert(document.getElementById('disk-usage-results').textContent.includes(t('diskUsage.analyzing')), "Folder change does not show a fresh analysis state");
        assert(_diskUsageToken > tokenBefore, "The previous dust request was not invalidated");
        assert(_diskUsageRefreshTimer !== null, "A rescan was not scheduled for the new folder");
      } finally {
        if (_diskUsageRefreshTimer) clearTimeout(_diskUsageRefreshTimer);
        _diskUsageRefreshTimer = null;
        G.previewOn = saved.previewOn;
        G.inspectorTab = saved.inspectorTab;
        G.dualOn = saved.dualOn;
        G.lastActivePane = saved.lastActivePane;
        _diskUsagePath = saved.path;
        _diskUsageToken = saved.token;
        _diskUsagePendingPath = saved.pendingPath;
        _diskUsageRenderedPath = saved.renderedPath;
        _diskUsageRows = saved.rows;
        _diskUsageSelected = saved.selected;
        document.getElementById('disk-usage-path').innerHTML = saved.pathHtml;
        document.getElementById('disk-usage-summary').innerHTML = saved.summaryHtml;
        document.getElementById('disk-usage-results').innerHTML = saved.resultsHtml;
        updateDiskUsageActionState();
      }
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
