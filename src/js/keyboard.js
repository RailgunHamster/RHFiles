// keyboard.js — customizable keyboard shortcuts + command palette

const DEFAULT_SHORTCUTS = {
  "nav.up":              ["Backspace", "Alt+ArrowUp"],
  "nav.down":            ["Alt+ArrowDown"],
  "nav.back":            ["Alt+ArrowLeft"],
  "nav.forward":         ["Alt+ArrowRight"],
  "nav.refresh":         ["F5"],
  "nav.open":            ["Enter"],
  "nav.home":            ["Home"],
  "nav.end":             ["End"],
  "file.copy":           ["Ctrl+C"],
  "file.cut":            ["Ctrl+X"],
  "file.paste":          ["Ctrl+V"],
  "file.delete":         ["Delete"],
  "file.rename":         ["F2"],
  "file.newFolder":      ["F7"],
  "file.newFile":        ["Ctrl+Shift+N"],
  "file.selectAll":      ["Ctrl+A"],
  "file.invertSelection":["Ctrl+I"],
  "file.properties":     ["Alt+Enter"],
  "file.quicklook":      ["Space"],
  "file.undo":           ["Ctrl+Z"],
  "file.redo":           ["Ctrl+Y"],
  "view.fullscreen":     ["F11"],
  "view.dualPane":       ["Ctrl+B"],
  "view.hidden":         ["Ctrl+H"],
  "view.switchPane":     ["Tab"],
  "view.grouping":       ["Ctrl+Shift+H"],
  "window.new":          ["Ctrl+N"],
  "window.pip":          ["Ctrl+Shift+P"],
  "palette":             [],
  "settings":            ["Ctrl+,"],
  "tab.new":             ["Ctrl+T"],
  "tab.close":           ["Ctrl+W"],
};

const ACTION_HANDLERS = {
  "nav.up":              async () => await goUp(),
  "nav.down":            async () => { const tab = getTab(); const entries = tab.entries || []; const sel = tab.sel || new Set(); const indices = [...sel]; const fi = indices.length ? indices[indices.length - 1] : -1; if (indices.length === 1 && entries[fi]) { if (entries[fi].is_dir) await navigateTo(entries[fi].path); else openFileHandler(entries[fi].path); } },
  "nav.back":            async () => await goBack(),
  "nav.forward":         async () => await goForward(),
  "nav.refresh":         async () => await refresh(),
  "nav.open":            async () => {},
  "nav.home":            async () => { const tab = getTab(); const sel = tab.sel || new Set(); sel.clear(); sel.add(0); tab.lastIdx = 0; renderFiles(tab, "file-list", "status-count", "status-selection"); scrollToVisible(0); updatePreviewForSelection(); },
  "nav.end":             async () => { const tab = getTab(); const entries = tab.entries || []; const sel = tab.sel || new Set(); sel.clear(); sel.add(entries.length - 1); tab.lastIdx = entries.length - 1; renderFiles(tab, "file-list", "status-count", "status-selection"); scrollToVisible(entries.length - 1); updatePreviewForSelection(); },
  "file.copy":           async () => await copySelected(),
  "file.cut":            async () => await cutSelected(),
  "file.paste":          async () => await paste(),
  "file.delete":         async () => await deleteSelected(),
  "file.rename":         async () => await renamePrompt(),
  "file.newFolder":      async () => await newFolder(),
  "file.newFile":        async () => showNewFileDialog(),
  "file.selectAll":      async () => selectAll(),
  "file.invertSelection":async () => invertSelection(),
  "file.properties":     async () => await showPropertiesDialog(getSelectedPaths()[0]?.path),
  "file.quicklook":      async () => await quicklookSelected(),
  "file.undo":           async () => await undo(),
  "file.redo":           async () => await redo(),
  "view.fullscreen":     async () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); },
  "view.dualPane":       async () => toggleDualPane(),
  "view.hidden":         async () => toggleHidden(),
  "view.switchPane":     async () => { if (G.dualOn) { G.lastActivePane = G.lastActivePane === 'right' ? 'left' : 'right'; const targetList = G.lastActivePane === 'right' ? "right-file-list" : "file-list"; document.getElementById(targetList)?.focus(); } },
  "view.grouping":       async () => toggleGroupingMenu(),
  "window.new":          async () => call("open_new_window", {}),
  "window.pip":          async () => { try { const isPip = await call("toggle_pip", {}); G.pipMode = isPip; showNotice(isPip ? "PiP Mode ON" : "PiP Mode OFF"); } catch(e) { alert("PiP failed: " + e); } },
  "tab.new":             async () => addTab(),
  "tab.close":           async () => closeTab(G.activeTab),
};

function loadShortcutBindings() {
  try {
    const saved = localStorage.getItem('rhfiles-shortcuts');
    if (saved) {
      const custom = JSON.parse(saved);
      const merged = {};
      for (const id in DEFAULT_SHORTCUTS) {
        merged[id] = custom[id] || DEFAULT_SHORTCUTS[id];
      }
      return merged;
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
}

function saveShortcutBindings(bindings) {
  localStorage.setItem('rhfiles-shortcuts', JSON.stringify(bindings));
}

function normalizeKey(e) {
  let parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  let key = e.key;
  if (key === " ") key = "Space";
  if (key === ",") key = ",";
  if (!["Control", "Shift", "Alt", "Meta"].includes(key)) {
    if (key.length === 1) key = key.length === 1 ? key.toUpperCase() : key;
    parts.push(key);
  }
  return parts.join("+");
}

function findActionForBinding(bindings, combo) {
  for (const actionId in bindings) {
    if (bindings[actionId].includes(combo)) return actionId;
  }
  return null;
}

let _shortcutBindings = null;

function getShortcutBindings() {
  if (!_shortcutBindings) _shortcutBindings = loadShortcutBindings();
  return _shortcutBindings;
}

document.addEventListener("keydown", async e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
    if (e.key === "Escape") e.target.blur();
    if (e.target.id === "palette-input") return;
    if (e.target.classList.contains("shortcut-recorder")) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { e.target.value = e.target.dataset.original || ""; e.target.classList.remove("shortcut-recorder"); e.target.blur(); return; }
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const combo = normalizeKey(e);
      if (combo) {
        e.target.value = combo;
        e.target.dataset.original = combo;
        const actionId = e.target.dataset.action;
        const idx = parseInt(e.target.dataset.index);
        if (actionId) {
          const bindings = getShortcutBindings();
          if (!bindings[actionId]) bindings[actionId] = [];
          bindings[actionId][idx] = combo;
          saveShortcutBindings(bindings);
          _shortcutBindings = bindings;
        }
        e.target.classList.remove("shortcut-recorder");
        e.target.blur();
      }
      return;
    }
    return;
  }

  const bindings = getShortcutBindings();
  const combo = normalizeKey(e);

  const actionId = findActionForBinding(bindings, combo);
  if (actionId) {
    e.preventDefault();

    if (actionId === "palette") { openCommandPalette(); return; }
    if (actionId === "settings") { openSettings(); return; }

    if (actionId === "nav.open") {
      const entries = getTab().entries || [];
      const sel = getTab().sel || new Set();
      const indices = [...sel];
      const focusedIndex = indices.length ? indices[indices.length - 1] : -1;
      if (indices.length === 1 && entries[focusedIndex]) {
        if (entries[focusedIndex].is_dir) await navigateTo(entries[focusedIndex].path);
        else openFileHandler(entries[focusedIndex].path);
      }
      return;
    }

    if (actionId === "nav.up" || actionId === "nav.down") {
      const entries = getTab().entries || [];
      const sel = getTab().sel || new Set();
      const indices = [...sel];
      const focusedIndex = indices.length ? indices[indices.length - 1] : -1;

      if (actionId === "nav.up") {
        if (focusedIndex > 0) {
          sel.clear(); sel.add(focusedIndex - 1);
          getTab().lastIdx = focusedIndex - 1;
        }
      } else {
        if (focusedIndex < entries.length - 1) {
          sel.clear(); sel.add(focusedIndex < 0 ? 0 : focusedIndex + 1);
          getTab().lastIdx = focusedIndex < 0 ? 0 : focusedIndex + 1;
        }
      }
      renderFiles(getTab(), "file-list", "status-count", "status-selection");
      scrollToVisible(getTab().lastIdx);
      updatePreviewForSelection();
      return;
    }

    const handler = ACTION_HANDLERS[actionId];
    if (handler) await handler();
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const entries = getTab().entries || [];
    const sel = getTab().sel || new Set();
    const indices = [...sel];
    const fi = indices.length ? indices[indices.length - 1] : -1;
    if (fi < entries.length - 1) { sel.clear(); sel.add(fi < 0 ? 0 : fi + 1); getTab().lastIdx = fi < 0 ? 0 : fi + 1; }
    renderFiles(getTab(), "file-list", "status-count", "status-selection");
    scrollToVisible(getTab().lastIdx);
    updatePreviewForSelection();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const sel = getTab().sel || new Set();
    const indices = [...sel];
    const fi = indices.length ? indices[indices.length - 1] : -1;
    if (fi > 0) { sel.clear(); sel.add(fi - 1); getTab().lastIdx = fi - 1; }
    renderFiles(getTab(), "file-list", "status-count", "status-selection");
    scrollToVisible(getTab().lastIdx);
    updatePreviewForSelection();
  } else if (e.key === "Enter") {
    e.preventDefault();
    const entries = getTab().entries || [];
    const sel = getTab().sel || new Set();
    const indices = [...sel];
    const fi = indices.length ? indices[indices.length - 1] : -1;
    if (indices.length === 1 && entries[fi]) {
      if (entries[fi].is_dir) await navigateTo(entries[fi].path);
      else openFileHandler(entries[fi].path);
    }
  }
});

function scrollToVisible(index) {
  const listId = G.lastActivePane === 'right' ? "right-file-list" : "file-list";
  const list = document.getElementById(listId);
  if (!list) return;
  let rowH = ROW_H;
  if (G.layout === "icons") rowH = ICON_ROW_H;
  else if (G.layout === "cards") rowH = CARD_ROW_H;
  const targetTop = index * rowH;
  if (targetTop < list.scrollTop || targetTop > list.scrollTop + list.clientHeight - rowH) {
    list.scrollTop = Math.max(0, targetTop - list.clientHeight / 2);
  }
}

// --- command palette ---
const COMMANDS = [
  { id:"nav.back", label:"Go Back", action: goBack, keys:() => getShortcutBindings()["nav.back"]?.[0] },
  { id:"nav.forward", label:"Go Forward", action: goForward, keys:() => getShortcutBindings()["nav.forward"]?.[0] },
  { id:"nav.up", label:"Go Up", action: goUp, keys:() => getShortcutBindings()["nav.up"]?.[0] },
  { id:"nav.down", label:"Open / Go Into", action: async () => { const tab = getTab(); const sel = tab.sel || new Set(); const indices = [...sel]; const fi = indices.length ? indices[indices.length-1] : -1; const entries = tab.entries || []; if (indices.length === 1 && entries[fi]) { if (entries[fi].is_dir) await navigateTo(entries[fi].path); else openFileHandler(entries[fi].path); } }, keys:() => getShortcutBindings()["nav.down"]?.[0] },
  { id:"nav.refresh", label:"Refresh", action: refresh, keys:"F5" },
  { id:"file.newFolder", label:"New Folder", action: newFolder, keys:"F7" },
  { id:"file.copy", label:"Copy", action: copySelected, keys:"Ctrl+C" },
  { id:"file.cut", label:"Cut", action: cutSelected, keys:"Ctrl+X" },
  { id:"file.paste", label:"Paste", action: paste, keys:"Ctrl+V" },
  { id:"file.rename", label:"Rename", action: renamePrompt, keys:"F2" },
  { id:"file.delete", label:"Delete", action: deleteSelected, keys:"Delete" },
  { id:"file.selectAll", label:"Select All", action: selectAll, keys:"Ctrl+A" },
  { id:"file.batchRename", label:"Batch Rename", action: openBatchRename },
  { id:"file.properties", label:"Properties", action: () => showPropertiesDialog(getSelectedPaths()[0]?.path), keys:"Alt+Enter" },
  { id:"file.tags", label:"Manage Tags", action: openTagDialog },
  { id:"view.theme", label:"Toggle Theme", action: toggleTheme },
  { id:"view.preview", label:"Toggle Preview Pane", action: togglePreviewPane },
  { id:"view.dualPane", label:"Toggle Dual Pane", action: toggleDualPane, keys:"Ctrl+B" },
  { id:"view.hidden", label:"Toggle Hidden Files", action: toggleHidden, keys:"Ctrl+H" },
  { id:"view.layout.details", label:"Details Layout", action: () => setLayout("details") },
  { id:"view.layout.icons", label:"Icons Layout", action: () => setLayout("icons") },
  { id:"view.layout.cards", label:"Cards Layout", action: () => setLayout("cards") },
  { id:"view.layout.columns", label:"Columns Layout", action: () => setLayout("columns") },
  { id:"file.invertSelection", label:"Invert Selection", action: invertSelection, keys:"Ctrl+I" },
  { id:"file.undo", label:"Undo", action: undo, keys:"Ctrl+Z" },
  { id:"file.redo", label:"Redo", action: redo, keys:"Ctrl+Y" },
  { id:"file.newFile", label:"New File...", action: showNewFileDialog, keys:"Ctrl+Shift+N" },
  { id:"view.fullscreen", label:"Toggle Fullscreen", action: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(()=>{}); }, keys:"F11" },
  { id:"view.switchPane", label:"Switch Pane Focus", action: () => { if (G.dualOn) { G.lastActivePane = G.lastActivePane === 'right' ? 'left' : 'right'; } }, keys:"Tab" },
  { id:"view.grouping", label:"Toggle Grouping Menu", action: toggleGroupingMenu, keys:"Ctrl+Shift+H" },
  { id:"file.quicklook", label:"QuickLook Preview", action: quicklookSelected, keys:"Space" },
  { id:"window.new", label:"New Window", action: () => call("open_new_window", {}), keys:"Ctrl+N" },
  { id:"window.pip", label:"Toggle PiP Mode", action: async () => { try { const isPip = await call("toggle_pip", {}); G.pipMode = isPip; showNotice(isPip ? "PiP Mode ON" : "PiP Mode OFF"); } catch(e) {} }, keys:"Ctrl+Shift+P" },
  { id:"settings", label:"Settings", action: openSettings, keys:"Ctrl+," },
  { id:"data.export", label:"Export Data...", action: exportAllData },
  { id:"data.import", label:"Import Data...", action: importAllData },
];

function openCommandPalette() {
  const overlay = document.getElementById("command-palette");
  overlay.style.display = "flex";
  const input = document.getElementById("palette-input");
  input.value = "";
  input.focus();
  filterPalette();
}

function closeCommandPalette() {
  document.getElementById("command-palette").style.display = "none";
}

function filterPalette() {
  const query = document.getElementById("palette-input").value.toLowerCase();
  const list = document.getElementById("palette-list");
  const filtered = COMMANDS.filter(c => c.label.toLowerCase().includes(query));
  list.innerHTML = filtered.map((c, i) => {
    const keyStr = typeof c.keys === 'function' ? c.keys() : c.keys;
    return `<div class="palette-item${i===0?' active':''}" onclick="executePalette(${COMMANDS.indexOf(c)})">
      ${esc(c.label)} ${keyStr ? `<span class="pi-shortcut">${esc(keyStr)}</span>` : ''}
    </div>`;
  }).join("");
  document.querySelectorAll(".palette-item").forEach(el => {
    el.addEventListener("mouseenter", () => {
      document.querySelectorAll(".palette-item").forEach(e => e.classList.remove("active"));
      el.classList.add("active");
    });
  });
}

function executePalette(idx) {
  closeCommandPalette();
  if (COMMANDS[idx]) {
    const cmd = COMMANDS[idx];
    if (cmd.action) cmd.action();
  }
}

document.getElementById("palette-input").addEventListener("keydown", e => {
  if (e.key === "Escape") { e.preventDefault(); closeCommandPalette(); }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    const items = document.querySelectorAll(".palette-item");
    const active = document.querySelector(".palette-item.active");
    const idx = active ? Math.min(Array.from(items).indexOf(active) + 1, items.length - 1) : 0;
    items.forEach(el => el.classList.remove("active"));
    if (items[idx]) { items[idx].classList.add("active"); items[idx].scrollIntoView({block:"nearest"}); }
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    const items = document.querySelectorAll(".palette-item");
    const active = document.querySelector(".palette-item.active");
    const idx = active ? Math.max(Array.from(items).indexOf(active) - 1, 0) : 0;
    items.forEach(el => el.classList.remove("active"));
    if (items[idx]) { items[idx].classList.add("active"); items[idx].scrollIntoView({block:"nearest"}); }
  }
  if (e.key === "Enter") {
    e.preventDefault();
    const items = document.querySelectorAll(".palette-item");
    const active = document.querySelector(".palette-item.active");
    if (active) {
      const cmdIdx = COMMANDS.findIndex(c => c.label === active.textContent.trim().replace(/\s+[A-Z].*$/, ""));
      if (cmdIdx >= 0) executePalette(cmdIdx);
    }
  }
});
