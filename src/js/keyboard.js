// keyboard.js — keyboard shortcuts + command palette

document.addEventListener("keydown", async e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
    if (e.key === "Escape") e.target.blur();
    if (e.ctrlKey && e.key === "p" && e.shiftKey) { e.preventDefault(); openCommandPalette(); }
    return;
  }

  // command palette
  if (e.ctrlKey && e.key === "p" && e.shiftKey) { e.preventDefault(); openCommandPalette(); return; }
  // settings
  if (e.ctrlKey && e.key === ",") { e.preventDefault(); openSettings(); return; }

  const entries = getTab().entries || [];
  const sel = getTab().sel || new Set();
  const indices = [...sel];
  const focusedIndex = indices.length ? indices[indices.length - 1] : -1;

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (focusedIndex < entries.length - 1) {
        sel.clear(); sel.add(focusedIndex < 0 ? 0 : focusedIndex + 1);
        getTab().lastIdx = focusedIndex < 0 ? 0 : focusedIndex + 1;
      }
      renderFiles(getTab(), "file-list", "status-count", "status-selection");
      scrollToVisible(getTab().lastIdx);
      updatePreviewForSelection();
      break;
    case "ArrowUp":
      e.preventDefault();
      if (focusedIndex > 0) {
        sel.clear(); sel.add(focusedIndex - 1);
        getTab().lastIdx = focusedIndex - 1;
      }
      renderFiles(getTab(), "file-list", "status-count", "status-selection");
      scrollToVisible(getTab().lastIdx);
      updatePreviewForSelection();
      break;
    case "Enter":
      e.preventDefault();
      if (indices.length === 1 && entries[focusedIndex]) {
        if (entries[focusedIndex].is_dir) await navigateTo(entries[focusedIndex].path);
        else openFileHandler(entries[focusedIndex].path);
      }
      break;
    case "Backspace": e.preventDefault(); await goUp(); break;
    case "Delete": e.preventDefault(); await deleteSelected(); break;
    case "F2": e.preventDefault(); await renamePrompt(); break;
    case "F5": e.preventDefault(); await refresh(); break;
    case "F7": e.preventDefault(); await newFolder(); break;
    case " ":
      e.preventDefault();
      await quicklookSelected();
      break;
    case "Home": e.preventDefault(); sel.clear(); sel.add(0); getTab().lastIdx = 0; renderFiles(getTab(), "file-list", "status-count", "status-selection"); scrollToVisible(0); updatePreviewForSelection(); break;
    case "End": e.preventDefault(); sel.clear(); sel.add(entries.length-1); getTab().lastIdx = entries.length-1; renderFiles(getTab(), "file-list", "status-count", "status-selection"); scrollToVisible(entries.length-1); updatePreviewForSelection(); break;
    case "F11":
      e.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
      break;
    case "Tab":
      e.preventDefault();
      if (G.dualOn) {
        G.lastActivePane = G.lastActivePane === 'right' ? 'left' : 'right';
        const targetList = G.lastActivePane === 'right' ? "right-file-list" : "file-list";
        document.getElementById(targetList)?.focus();
      }
      break;
    default:
      if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); await goBack(); }
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); await goForward(); }
      if (e.altKey && e.key === "Enter") { e.preventDefault(); await showPropertiesDialog(getSelectedPaths()[0]?.path); }
      if (e.ctrlKey && e.key === "c" && !e.shiftKey) { e.preventDefault(); await copySelected(); }
      if (e.ctrlKey && e.key === "x") { e.preventDefault(); await cutSelected(); }
      if (e.ctrlKey && e.key === "v") { e.preventDefault(); await paste(); }
      if (e.ctrlKey && e.key === "a" && !e.shiftKey) { e.preventDefault(); selectAll(); }
      if (e.ctrlKey && e.key === "t") { e.preventDefault(); addTab(); }
      if (e.ctrlKey && e.key === "w") { e.preventDefault(); closeTab(G.activeTab); }
      if (e.ctrlKey && e.key === "n" && !e.shiftKey) { e.preventDefault(); call("open_new_window", {}); }
      if (e.ctrlKey && e.key === "h") { e.preventDefault(); toggleHidden(); }
      if (e.ctrlKey && e.key === "b") { e.preventDefault(); toggleDualPane(); }
      if (e.ctrlKey && e.key === "i") { e.preventDefault(); invertSelection(); }
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); await undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); await redo(); }
      if (e.ctrlKey && e.shiftKey && e.key === "N") { e.preventDefault(); showNewFileDialog(); }
      if (e.ctrlKey && e.shiftKey && e.key === "H") { e.preventDefault(); toggleGroupingMenu(); }
      break;
  }
});

function scrollToVisible(index) {
  const listId = G.lastActivePane === 'right' ? "right-file-list" : "file-list";
  const list = document.getElementById(listId);
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
  { id:"nav.back", label:"Go Back", action: goBack, keys:"Alt+Left" },
  { id:"nav.forward", label:"Go Forward", action: goForward, keys:"Alt+Right" },
  { id:"nav.up", label:"Go Up", action: goUp, keys:"Backspace" },
  { id:"nav.refresh", label:"Refresh", action: refresh, keys:"F5" },
  { id:"file.newFolder", label:"New Folder", action: newFolder, keys:"F7" },
  { id:"file.open", label:"Open File", action: () => { const s=getSelectedPaths(); if(s.length) if(s[0].is_dir)navigateTo(s[0].path); else openFileHandler(s[0].path); }, keys:"Enter" },
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
  { id:"settings", label:"Settings", action: openSettings, keys:"Ctrl+," },
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
  list.innerHTML = filtered.map((c, i) =>
    `<div class="palette-item${i===0?' active':''}" onclick="executePalette(${COMMANDS.indexOf(c)})">
      ${esc(c.label)} ${c.keys ? `<span class="pi-shortcut">${c.keys}</span>` : ''}
    </div>`
  ).join("");
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
