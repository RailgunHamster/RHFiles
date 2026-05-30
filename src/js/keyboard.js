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
  "file.contextMenu":    ["F9", "ContextMenu"],
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
  "nav.home":            async () => { const isRight = G.lastActivePane === 'right'; const pane = isRight ? G.rp : getTab(); const sel = pane.sel || new Set(); sel.clear(); sel.add(0); pane.lastIdx = 0; const listId = isRight ? "right-file-list" : "file-list"; const countId = isRight ? "right-status-count" : "status-count"; renderFiles(pane, listId, countId, null, isRight); scrollToVisible(0); updatePreviewForSelection(); },
  "nav.end":             async () => { const isRight = G.lastActivePane === 'right'; const pane = isRight ? G.rp : getTab(); const entries = pane.entries || []; const sel = pane.sel || new Set(); sel.clear(); sel.add(entries.length - 1); pane.lastIdx = entries.length - 1; const listId = isRight ? "right-file-list" : "file-list"; const countId = isRight ? "right-status-count" : "status-count"; renderFiles(pane, listId, countId, null, isRight); scrollToVisible(entries.length - 1); updatePreviewForSelection(); },
  "file.contextMenu":   async () => {
    const isRight = G.lastActivePane === 'right';
    const listId = isRight ? "right-file-list" : "file-list";
    const selEl = document.querySelector(`#${listId} .file-row.selected`) || document.getElementById(listId);
    if (selEl) {
      const r = selEl.getBoundingClientRect();
      showContextMenu(r.left + r.width / 2, r.top + r.height / 2, isRight);
    }
  },
  "file.copy":           async () => await copySelected(),
  "file.cut":            async () => await cutSelected(),
  "file.paste":          async () => await paste(),
  "file.delete":         async () => await deleteSelected(),
  "file.rename":         async () => await renamePrompt(),
  "file.newFolder":      async () => await newFolder(),
  "file.newFile":        async () => showNewFileDialog(),
  "file.selectAll":      async () => selectAll(),
  "file.invertSelection":async () => invertSelection(),
  "file.properties":     async () => {
    const isRight = G.lastActivePane === 'right';
    const paths = getSelectedPaths(isRight);
    const listId = isRight ? "right-file-list" : "file-list";
    if (paths.length && typeof flashAt === 'function') {
      const selEl = document.querySelector(`#${listId} .file-row.selected`) || document.getElementById(listId);
      if (selEl) {
        const r = selEl.getBoundingClientRect();
        flashAt(r.left + r.width / 2, r.top + r.height / 2);
      }
    }
    await showPropertiesDialog(paths[0]?.path);
  },
  "file.quicklook":      async () => await quicklookSelected(),
  "file.undo":           async () => await undo(),
  "file.redo":           async () => await redo(),
  "view.fullscreen":     async () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); },
  "view.dualPane":       async () => toggleDualPane(),
  "view.hidden":         async () => toggleHidden(),
  "view.switchPane":     async () => { if (G.dualOn) { G.lastActivePane = G.lastActivePane === 'right' ? 'left' : 'right'; const targetList = G.lastActivePane === 'right' ? "right-file-list" : "file-list"; document.getElementById(targetList)?.focus(); } },
  "view.grouping":       async () => toggleGroupingMenu(),
  "window.new":          async () => call("open_new_window", {}),
  "window.pip":          async () => { try { const isPip = await call("toggle_pip", {}); G.pipMode = isPip; showNotice(isPip ? t('notice.pipOn') : t('notice.pipOff')); } catch(e) { alert(t('alert.pipFailed', {error: e})); } },
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

window.addEventListener("keydown", e => {
  if (!e.altKey || e.key !== "Enter") return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  const anyDialog = document.querySelector('.overlay[style*="display: flex"], .overlay[style*="display:flex"]');
  if (anyDialog) return;
  e.preventDefault();
  const handler = ACTION_HANDLERS["file.properties"];
  if (handler) handler();
}, true);

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

  const anyDialogOpen = document.querySelector('.overlay[style*="display: flex"], .overlay[style*="display:flex"]');
  if (anyDialogOpen) return;

  const bindings = getShortcutBindings();
  const combo = normalizeKey(e);

  const actionId = findActionForBinding(bindings, combo);
  if (actionId) {
    e.preventDefault();

    if (actionId === "palette") { openCommandPalette(); return; }
    if (actionId === "settings") { openSettings(); return; }

    if (actionId === "nav.open") {
      const isRight = G.lastActivePane === 'right';
      const pane = isRight ? G.rp : getTab();
      const entries = pane.entries || [];
      const sel = pane.sel || new Set();
      const indices = [...sel];
      const focusedIndex = indices.length ? indices[indices.length - 1] : -1;
      if (indices.length === 1 && entries[focusedIndex]) {
        if (entries[focusedIndex].is_dir) {
          if (isRight) rpNavigateTo(entries[focusedIndex].path);
          else await navigateTo(entries[focusedIndex].path);
        }
        else openFileHandler(entries[focusedIndex].path);
      }
      return;
    }

    const handler = ACTION_HANDLERS[actionId];
    if (handler) await handler();
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const isRight = G.lastActivePane === 'right';
    const pane = isRight ? G.rp : getTab();
    const entries = pane.entries || [];
    const sel = pane.sel || new Set();
    const indices = [...sel];
    const fi = indices.length ? indices[indices.length - 1] : -1;
    if (fi < entries.length - 1) { sel.clear(); sel.add(fi < 0 ? 0 : fi + 1); pane.lastIdx = fi < 0 ? 0 : fi + 1; }
    const listId = isRight ? "right-file-list" : "file-list";
    const countId = isRight ? "right-status-count" : "status-count";
    renderFiles(pane, listId, countId, null, isRight);
    scrollToVisible(pane.lastIdx);
    updatePreviewForSelection();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const isRight = G.lastActivePane === 'right';
    const pane = isRight ? G.rp : getTab();
    const sel = pane.sel || new Set();
    const indices = [...sel];
    const fi = indices.length ? indices[indices.length - 1] : -1;
    if (fi > 0) { sel.clear(); sel.add(fi - 1); pane.lastIdx = fi - 1; }
    const listId = isRight ? "right-file-list" : "file-list";
    const countId = isRight ? "right-status-count" : "status-count";
    renderFiles(pane, listId, countId, null, isRight);
    scrollToVisible(pane.lastIdx);
    updatePreviewForSelection();
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
let COMMANDS = [];

function initCommands() {
  COMMANDS = [
  { id:"nav.back", label: t('cmd.goBack'), action: goBack, keys:() => getShortcutBindings()["nav.back"]?.[0] },
  { id:"nav.forward", label: t('cmd.goForward'), action: goForward, keys:() => getShortcutBindings()["nav.forward"]?.[0] },
  { id:"nav.up", label: t('cmd.goUp'), action: goUp, keys:() => getShortcutBindings()["nav.up"]?.[0] },
  { id:"nav.down", label: t('cmd.openInto'), action: async () => { const tab = getTab(); const sel = tab.sel || new Set(); const indices = [...sel]; const fi = indices.length ? indices[indices.length-1] : -1; const entries = tab.entries || []; if (indices.length === 1 && entries[fi]) { if (entries[fi].is_dir) await navigateTo(entries[fi].path); else openFileHandler(entries[fi].path); } }, keys:() => getShortcutBindings()["nav.down"]?.[0] },
  { id:"nav.refresh", label: t('cmd.refresh'), action: refresh, keys:"F5" },
  { id:"file.newFolder", label: t('cmd.newFolder'), action: newFolder, keys:"F7" },
  { id:"file.copy", label: t('cmd.copy'), action: copySelected, keys:"Ctrl+C" },
  { id:"file.cut", label: t('cmd.cut'), action: cutSelected, keys:"Ctrl+X" },
  { id:"file.paste", label: t('cmd.paste'), action: paste, keys:"Ctrl+V" },
  { id:"file.rename", label: t('cmd.rename'), action: renamePrompt, keys:"F2" },
  { id:"file.contextMenu", label: t('cmd.contextMenu'), action: () => {
    const isRight = G.lastActivePane === 'right';
    const listId = isRight ? "right-file-list" : "file-list";
    const selEl = document.querySelector(`#${listId} .file-row.selected`) || document.getElementById(listId);
    if (selEl) { const r = selEl.getBoundingClientRect(); showContextMenu(r.left + r.width / 2, r.top + r.height / 2, isRight); }
  }, keys:() => getShortcutBindings()["file.contextMenu"]?.[0] },
  { id:"file.delete", label: t('cmd.delete'), action: deleteSelected, keys:"Delete" },
  { id:"file.selectAll", label: t('cmd.selectAll'), action: selectAll, keys:"Ctrl+A" },
  { id:"file.batchRename", label: t('cmd.batchRename'), action: openBatchRename },
  { id:"file.properties", label: t('cmd.properties'), action: () => showPropertiesDialog(getSelectedPaths()[0]?.path), keys:"Alt+Enter" },
  { id:"file.tags", label: t('cmd.manageTags'), action: openTagDialog },
  { id:"view.theme", label: t('cmd.toggleTheme'), action: toggleTheme },
  { id:"view.preview", label: t('cmd.togglePreview'), action: togglePreviewPane },
  { id:"view.dualPane", label: t('cmd.toggleDualPane'), action: toggleDualPane, keys:"Ctrl+B" },
  { id:"view.hidden", label: t('cmd.toggleHidden'), action: toggleHidden, keys:"Ctrl+H" },
  { id:"view.layout.details", label: t('cmd.layoutDetails'), action: () => setLayout("details") },
  { id:"view.layout.icons", label: t('cmd.layoutIcons'), action: () => setLayout("icons") },
  { id:"view.layout.thumbnails", label: t('cmd.layoutThumbnails'), action: () => setLayout("thumbnails") },
  { id:"view.layout.cards", label: t('cmd.layoutCards'), action: () => setLayout("cards") },
  { id:"view.layout.columns", label: t('cmd.layoutColumns'), action: () => setLayout("columns") },
  { id:"file.invertSelection", label: t('cmd.invertSelection'), action: invertSelection, keys:"Ctrl+I" },
  { id:"file.undo", label: t('cmd.undo'), action: undo, keys:"Ctrl+Z" },
  { id:"file.redo", label: t('cmd.redo'), action: redo, keys:"Ctrl+Y" },
  { id:"file.newFile", label: t('cmd.newFile'), action: showNewFileDialog, keys:"Ctrl+Shift+N" },
  { id:"view.fullscreen", label: t('cmd.fullscreen'), action: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(()=>{}); }, keys:"F11" },
  { id:"view.switchPane", label: t('cmd.switchPane'), action: () => { if (G.dualOn) { G.lastActivePane = G.lastActivePane === 'right' ? 'left' : 'right'; } }, keys:"Tab" },
  { id:"view.grouping", label: t('cmd.toggleGrouping'), action: toggleGroupingMenu, keys:"Ctrl+Shift+H" },
  { id:"file.quicklook", label: t('cmd.quickLook'), action: quicklookSelected, keys:"Space" },
  { id:"window.new", label: t('cmd.newWindow'), action: () => call("open_new_window", {}), keys:"Ctrl+N" },
  { id:"window.pip", label: t('cmd.togglePip'), action: async () => { try { const isPip = await call("toggle_pip", {}); G.pipMode = isPip; showNotice(isPip ? t('notice.pipOn') : t('notice.pipOff')); } catch(e) {} }, keys:"Ctrl+Shift+P" },
  { id:"settings", label: t('cmd.settings'), action: openSettings, keys:"Ctrl+," },
  { id:"data.export", label: t('cmd.exportData'), action: exportAllData },
  { id:"data.import", label: t('cmd.importData'), action: importAllData },
  ];
}

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
});
