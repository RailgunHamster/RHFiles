// dialogs.js — batch rename, tag dialog, settings

let batchRenameSource = null;

function openBatchRename(isRight) {
  const sel = getSelectedPaths(isRight);
  if (!sel.length) return;
  batchRenameSource = { isRight, files: sel };
  document.getElementById("br-find").value = "";
  document.getElementById("br-replace").value = "";
  document.getElementById("batch-rename-dialog").style.display = "flex";
  document.getElementById("br-find").focus();
  previewBatchRename();
}

function closeBatchRename() {
  document.getElementById("batch-rename-dialog").style.display = "none";
}

function previewBatchRename() {
  if (!batchRenameSource) return;
  const find = document.getElementById("br-find").value;
  const replace = document.getElementById("br-replace").value;
  const isRegex = document.getElementById("br-regex").checked;
  const isCase = document.getElementById("br-case").checked;
  const preview = document.getElementById("br-preview");
  if (!find) { preview.innerHTML = ""; return; }
  preview.innerHTML = batchRenameSource.files.map(f => {
    let newName = f.name;
    try {
      if (isRegex) {
        const re = new RegExp(find, isCase ? "g" : "gi");
        newName = newName.replace(re, replace);
      } else {
        const escaped = find.replace(/[.*+?^${'$'}{}()|[\]\\]/g, '\\$&');
        newName = isCase ? newName.replaceAll(find, replace) : newName.replace(new RegExp(escaped, 'gi'), replace);
      }
    } catch (e) { newName = f.name + " [error]"; }
    return '<div class="br-row"><span class="br-old">' + esc(f.name) + '</span> → <span class="br-new">' + esc(newName) + '</span></div>';
  }).join("");
}

async function executeBatchRename() {
  if (!batchRenameSource) return;
  const find = document.getElementById("br-find").value;
  const replace = document.getElementById("br-replace").value;
  const isRegex = document.getElementById("br-regex").checked;
  const isCase = document.getElementById("br-case").checked;
  const renames = batchRenameSource.files.map(f => {
    let newName = f.name;
    try {
      if (isRegex) {
        const re = new RegExp(find, isCase ? "g" : "gi");
        newName = newName.replace(re, replace);
      } else {
        const escaped = find.replace(/[.*+?^${'$'}{}()|[\]\\]/g, '\\$&');
        newName = isCase ? newName.replaceAll(find, replace) : newName.replace(new RegExp(escaped, 'gi'), replace);
      }
    } catch (e) { newName = f.name; }
    return [f.path, newName];
  });
  try {
    await call("batch_rename", { renames });
    closeBatchRename();
    await refresh();
  } catch (e) { alert("Rename failed: " + e); }
}

// --- tag dialog ---
let tagDialogSource = null;

async function openTagDialog(isRight) {
  const sel = getSelectedPaths(isRight);
  if (!sel.length) return;
  tagDialogSource = isRight;
  document.getElementById("tag-dialog").style.display = "flex";
  document.getElementById("tag-input").focus();
  await renderCurrentTags();
}

function closeTagDialog() {
  document.getElementById("tag-dialog").style.display = "none";
  refresh();
}

async function renderCurrentTags() {
  const sel = getSelectedPaths(tagDialogSource);
  if (!sel.length) return;
  const file = sel[0];
  const container = document.getElementById("tag-current");
  const tags = G.tagCache[file.path] || [];
  container.innerHTML = tags.map((tag, i) =>
    '<span class="tag-pill-edit" style="background:' + tagColor(i) + '22;color:' + tagColor(i) + '">' +
    esc(tag) + '<span class="tag-remove" onclick="removeTag(\'' + esc(tag).replace(/'/g, "\\'") + '\')">&times;</span></span>'
  ).join("");
}

function addTagToSelected() {
  const input = document.getElementById("tag-input");
  const tag = input.value.trim();
  if (!tag) return;
  const sel = getSelectedPaths(tagDialogSource);
  if (!sel.length) return;
  const path = sel[0].path;
  if (!G.tagCache[path]) G.tagCache[path] = [];
  if (!G.tagCache[path].includes(tag)) G.tagCache[path].push(tag);
  call("save_file_tags", { path, tags: G.tagCache[path] });
  input.value = "";
  renderCurrentTags();
  renderFiles(getTab(), "file-list", "status-count", "status-selection");
}

function removeTag(tag) {
  const sel = getSelectedPaths(tagDialogSource);
  if (!sel.length) return;
  const path = sel[0].path;
  if (G.tagCache[path]) G.tagCache[path] = G.tagCache[path].filter(t => t !== tag);
  call("save_file_tags", { path, tags: G.tagCache[path] || [] });
  renderCurrentTags();
  renderFiles(getTab(), "file-list", "status-count", "status-selection");
}

// --- settings ---
function openSettings() {
  const dlg = document.getElementById("settings-dialog");
  const content = document.getElementById("settings-content");
  const themeVal = G.theme || 'light';
  content.innerHTML =
    '<div class="settings-row"><label>' + t('settings.language') + '</label>' +
    '<select onchange="setLang(this.value)"><option value="en"' + (_lang==="en"?" selected":"") + '>English</option><option value="zh"' + (_lang==="zh"?" selected":"") + '>' + esc('\u4e2d\u6587') + '</option></select></div>' +
    '<div class="settings-row"><label>' + t('settings.theme') + '</label>' +
    '<select id="settings-theme-select" onchange="onThemeSelectChange(this.value)"><option value="light"' + (themeVal==="light"?" selected":"") + '>Light</option><option value="dark"' + (themeVal==="dark"?" selected":"") + '>Dark</option><option value="custom"' + (themeVal==="custom"?" selected":"") + '>Custom</option></select></div>' +
    '<div id="custom-theme-section" style="display:' + (themeVal==="custom"?"block":"none") + ';margin-top:8px">' +
      '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:4px">' +
        '<label>Custom CSS</label>' +
        '<textarea id="custom-theme-css" rows="8" style="width:100%;font-family:monospace;font-size:12px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:6px;resize:vertical">' + esc(localStorage.getItem('rhfiles-custom-theme') || '') + '</textarea>' +
      '</div>' +
      '<div class="settings-row" style="gap:8px">' +
        '<button class="dialog-btn" onclick="uploadThemeFile()">Upload .css</button>' +
        '<button class="dialog-btn primary" onclick="applyCustomThemeFromSettings()">Apply</button>' +
        '<button class="dialog-btn" onclick="resetCustomTheme()">Reset</button>' +
      '</div>' +
    '</div>' +
    '<div class="settings-row"><label>Background Effect</label>' +
    '<select onchange="applyWindowEffect(this.value)"><option value="none"' + (G.windowEffect==="none"||!G.windowEffect?" selected":"") + '>None</option><option value="mica"' + (G.windowEffect==="mica"?" selected":"") + '>Mica</option><option value="acrylic"' + (G.windowEffect==="acrylic"?" selected":"") + '>Acrylic</option><option value="mica-alt"' + (G.windowEffect==="mica-alt"?" selected":"") + '>Mica Alt</option></select></div>' +
    '<div class="settings-row"><label>Layout</label>' +
    '<select onchange="setLayout(this.value)"><option value="details"' + (G.layout==="details"?" selected":"") + '>Details</option><option value="icons"' + (G.layout==="icons"?" selected":"") + '>Icons</option><option value="thumbnails"' + (G.layout==="thumbnails"?" selected":"") + '>Thumbnails</option><option value="cards"' + (G.layout==="cards"?" selected":"") + '>Cards</option><option value="columns"' + (G.layout==="columns"?" selected":"") + '>Columns</option></select></div>' +
    '<div class="settings-row"><label>Show File Extensions</label>' +
    '<input type="checkbox" onchange="G.showExtensions=this.checked;renderFiles(getTab(),\'file-list\',\'status-count\',\'status-selection\')"' + (G.showExtensions!==false?' checked':'') + '></div>' +
    '<div class="settings-row"><label>Grouping</label>' +
    '<select onchange="toggleGrouping(this.value)"><option value="none"' + (G.groupBy==='none'||!G.groupBy?" selected":"") + '>None</option><option value="type"' + (G.groupBy==='type'?" selected":"") + '>By Type</option><option value="date"' + (G.groupBy==='date'?" selected":"") + '>By Date</option><option value="size"' + (G.groupBy==='size'?" selected":"") + '>By Size</option><option value="extension"' + (G.groupBy==='extension'?" selected":"") + '>By Extension</option></select></div>' +
    '<div class="settings-row"><label>Default Terminal</label>' +
    '<select onchange="G.settings.terminal=this.value;saveSettings()"><option value="wt"' + ((G.settings.terminal||'wt')==='wt'?" selected":"") + '>Windows Terminal</option><option value="powershell"' + (G.settings.terminal==='powershell'?" selected":"") + '>PowerShell</option><option value="cmd"' + (G.settings.terminal==='cmd'?" selected":"") + '>Command Prompt</option></select></div>' +
    '<div class="settings-row"><label>Adaptive Layout</label>' +
    '<input type="checkbox" onchange="G.settings.adaptiveLayout=this.checked;saveSettings()"' + (G.settings.adaptiveLayout!==false?' checked':'') + '></div>' +
    '<div class="settings-row"><label>Search Engine</label>' +
    '<select onchange="G.settings.searchEngine=this.value;saveSettings();initQuickSearch()">' +
      '<option value="auto"' + ((G.settings.searchEngine||'auto')==='auto'?" selected":"") + '>Auto (Everything if available)</option>' +
      '<option value="everything"' + (G.settings.searchEngine==='everything'?" selected":"") + '>Everything only</option>' +
      '<option value="builtin"' + (G.settings.searchEngine==='builtin'?" selected":"") + '>Builtin (recursive scan)</option>' +
    '</select></div>' +
    '<div class="settings-row"><label>Icon Style</label>' +
    '<select onchange="G.settings.iconMode=this.value;saveSettings();clearIconCache();renderFiles(getTab(),\'file-list\',\'status-count\',\'status-selection\')">' +
      '<option value="builtin"' + ((G.settings.iconMode||'builtin')==='builtin'?" selected":"") + '>Builtin (Rich SVG)</option>' +
      '<option value="fluent"' + (G.settings.iconMode==='fluent'?" selected":"") + '>Fluent UI Style</option>' +
      '<option value="system"' + (G.settings.iconMode==='system'?" selected":"") + '>System Icons (Real)</option>' +
      '<option value="mixed"' + (G.settings.iconMode==='mixed'?" selected":"") + '>Mixed (SVG + System)</option>' +
    '</select></div>' +
    '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px"><label>Customize Toolbar</label>' +
    '<div id="toolbar-config-list" style="display:flex;flex-direction:column;gap:4px;max-height:250px;overflow:auto"></div>' +
    '<button class="dialog-btn" onclick="resetToolbarConfig()" style="align-self:flex-start">Reset to Default</button></div>' +
    '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">' +
    '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px"><label>' + t('settings.shortcuts') + '</label>' +
    '<div id="shortcut-config-list" style="display:flex;flex-direction:column;gap:6px;max-height:350px;overflow:auto;padding:4px 0"></div>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
      '<button class="dialog-btn" onclick="resetShortcuts()" style="align-self:flex-start">Reset Shortcuts</button>' +
      '<span style="font-size:11px;color:var(--text-secondary)">Click a key binding to re-record. Multiple keys per action allowed.</span>' +
    '</div></div>' +
    '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">' +
    '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px"><label>Data Management</label>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="dialog-btn" onclick="exportAllData()">Export All Data</button>' +
      '<button class="dialog-btn" onclick="importAllData()">Import Data...</button>' +
      '<button class="dialog-btn" onclick="clearAllData()" style="color:#e74c3c">Clear All Data</button>' +
    '</div>' +
    '<span style="font-size:11px;color:var(--text-secondary)">Export includes: shortcuts, tabs, tags, pinned folders, layouts, themes, settings, browsing history.</span>' +
    '</div>';
  dlg.style.display = "flex";
  renderToolbarConfig();
  renderShortcutConfig();
}

function onThemeSelectChange(val) {
  const section = document.getElementById("custom-theme-section");
  if (section) section.style.display = val === "custom" ? "block" : "none";
  if (val !== "custom") {
    applyTheme(val);
  } else {
    applyTheme("custom");
  }
}

function applyCustomThemeFromSettings() {
  const textarea = document.getElementById("custom-theme-css");
  if (textarea) {
    localStorage.setItem("rhfiles-custom-theme", textarea.value);
    applyCustomTheme();
  }
}

function resetCustomTheme() {
  localStorage.removeItem("rhfiles-custom-theme");
  const textarea = document.getElementById("custom-theme-css");
  if (textarea) textarea.value = "";
  applyCustomTheme();
}

function uploadThemeFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".css";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const textarea = document.getElementById("custom-theme-css");
      if (textarea) textarea.value = reader.result;
      localStorage.setItem("rhfiles-custom-theme", reader.result);
      applyCustomTheme();
    };
    reader.readAsText(file);
  };
  input.click();
}

function closeSettings() {
  document.getElementById("settings-dialog").style.display = "none";
}

async function showNewFileDialog(isRight) {
  let templates = [];
  try {
    templates = await call("get_new_file_templates", {});
  } catch (e) {
    templates = [
      { name: "Text File", ext: ".txt", content: "" },
      { name: "HTML File", ext: ".html", content: "<!DOCTYPE html>\n<html>\n<head><title></title></head>\n<body>\n\n</body>\n</html>" },
      { name: "JSON File", ext: ".json", content: "{\n  \n}" },
      { name: "Markdown File", ext: ".md", content: "# Title\n\n" },
      { name: "JavaScript File", ext: ".js", content: "// \n" },
      { name: "CSS File", ext: ".css", content: "/* */\n" },
      { name: "Python File", ext: ".py", content: "# -*- coding: utf-8 -*-\n\n" },
      { name: "Batch File", ext: ".bat", content: "@echo off\n\n" },
    ];
  }
  const destPath = isRight ? G.rp.path : getTab().path;
  const fileName = prompt("File name:", "New File" + (templates.length ? templates[0].ext : ".txt"));
  if (!fileName) return;
  const tmpl = templates.find(t => fileName.endsWith(t.ext)) || templates[0];
  try {
    const templateExt = tmpl ? (tmpl.extension || (tmpl.ext || "").replace(/^\./, '')) : "";
    await call("create_new_file", { parent: destPath, template: templateExt, name: fileName });
    await refresh();
  } catch (e) { alert("Create file failed: " + e); }
}

// --- toolbar customization ---
const TOOLBAR_BUTTONS = [
  { id: "btn-new", label: "New Folder/File" },
  { id: "btn-cut", label: "Cut" },
  { id: "btn-copy", label: "Copy" },
  { id: "btn-paste", label: "Paste" },
  { id: "btn-rename", label: "Rename" },
  { id: "btn-delete", label: "Delete" },
  { id: "btn-sort", label: "Sort" },
  { id: "btn-hidden", label: "Hidden Files" },
  { id: "btn-group", label: "Group" },
  { id: "btn-layout-details", label: "Details Layout" },
  { id: "btn-layout-icons", label: "Icons Layout" },
  { id: "btn-layout-cards", label: "Cards Layout" },
  { id: "btn-layout-columns", label: "Columns Layout" },
  { id: "btn-preview", label: "Preview Pane" },
  { id: "btn-dual", label: "Dual Pane" },
  { id: "btn-theme", label: "Toggle Theme" },
  { id: "btn-refresh", label: "Refresh" },
];

function loadToolbarConfig() {
  try {
    const saved = localStorage.getItem("rhfiles-toolbar");
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return { visible: TOOLBAR_BUTTONS.map(b => b.id) };
}

function applyToolbarConfig() {
  const config = loadToolbarConfig();
  const toolbar = document.querySelector(".command-bar");
  if (!toolbar) return;
  const allBtns = toolbar.querySelectorAll(".cmd, .tb[id], .layout-btn");
  const visibleSet = new Set(config.visible);
  allBtns.forEach(btn => {
    const id = btn.id || btn.dataset.layout && ("btn-layout-" + btn.dataset.layout);
    if (!id) return;
    if (visibleSet.has(id)) {
      btn.style.display = "";
    } else {
      btn.style.display = "none";
    }
  });
}

function renderToolbarConfig() {
  const container = document.getElementById("toolbar-config-list");
  if (!container) return;
  const config = loadToolbarConfig();
  const visibleSet = new Set(config.visible);
  container.innerHTML = TOOLBAR_BUTTONS.map(b =>
    `<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:2px 0">
      <input type="checkbox" ${visibleSet.has(b.id) ? "checked" : ""} onchange="toggleToolbarBtn('${b.id}', this.checked)">
      ${esc(b.label)}
    </label>`
  ).join("");
}

function toggleToolbarBtn(id, visible) {
  const config = loadToolbarConfig();
  if (visible) {
    if (!config.visible.includes(id)) config.visible.push(id);
  } else {
    config.visible = config.visible.filter(v => v !== id);
  }
  localStorage.setItem("rhfiles-toolbar", JSON.stringify(config));
  applyToolbarConfig();
}

function resetToolbarConfig() {
  localStorage.removeItem("rhfiles-toolbar");
  applyToolbarConfig();
  renderToolbarConfig();
}

// --- shortcut customization ---
const SHORTCUT_LABELS = {
  "nav.up": "Go Up",
  "nav.down": "Open / Go Into Folder",
  "nav.back": "Go Back",
  "nav.forward": "Go Forward",
  "nav.refresh": "Refresh",
  "nav.open": "Open Selected",
  "nav.home": "Jump to First",
  "nav.end": "Jump to Last",
  "file.copy": "Copy",
  "file.cut": "Cut",
  "file.paste": "Paste",
  "file.delete": "Delete",
  "file.rename": "Rename",
  "file.newFolder": "New Folder",
  "file.newFile": "New File",
  "file.selectAll": "Select All",
  "file.invertSelection": "Invert Selection",
  "file.properties": "Properties",
  "file.quicklook": "QuickLook Preview",
  "file.undo": "Undo",
  "file.redo": "Redo",
  "view.fullscreen": "Toggle Fullscreen",
  "view.dualPane": "Toggle Dual Pane",
  "view.hidden": "Toggle Hidden Files",
  "view.switchPane": "Switch Pane",
  "view.grouping": "Toggle Grouping",
  "window.new": "New Window",
  "window.pip": "Toggle PiP",
  "tab.new": "New Tab",
  "tab.close": "Close Tab",
};

function renderShortcutConfig() {
  const container = document.getElementById("shortcut-config-list");
  if (!container) return;
  const bindings = getShortcutBindings();
  const entries = Object.entries(SHORTCUT_LABELS);
  container.innerHTML = entries.map(([actionId, label]) => {
    const keys = bindings[actionId] || [];
    const keyInputs = keys.map((k, i) =>
      `<input type="text" class="shortcut-key-input" readonly value="${esc(k)}" data-action="${actionId}" data-index="${i}" data-original="${esc(k)}" style="width:140px;font-size:12px;padding:3px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:3px;cursor:pointer;text-align:center" onclick="recordShortcut(this)">`
    ).join("");
    return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
      <span style="width:160px;font-size:12px;flex-shrink:0">${esc(label)}</span>
      <div style="display:flex;gap:4px;align-items:center">${keyInputs}</div>
      <button class="dialog-btn" style="font-size:10px;padding:2px 6px" onclick="addShortcutBinding('${actionId}')">+</button>
      <button class="dialog-btn" style="font-size:10px;padding:2px 6px;color:#e74c3c" onclick="removeShortcutBinding('${actionId}')">-</button>
    </div>`;
  }).join("");
}

function recordShortcut(input) {
  input.classList.add("shortcut-recorder");
  input.value = "Press keys...";
  input.focus();
}

function addShortcutBinding(actionId) {
  const bindings = getShortcutBindings();
  if (!bindings[actionId]) bindings[actionId] = [];
  if (bindings[actionId].length < 4) {
    bindings[actionId].push("");
    saveShortcutBindings(bindings);
    _shortcutBindings = bindings;
    renderShortcutConfig();
    const inputs = document.querySelectorAll(`.shortcut-key-input[data-action="${actionId}"]`);
    const last = inputs[inputs.length - 1];
    if (last) recordShortcut(last);
  }
}

function removeShortcutBinding(actionId) {
  const bindings = getShortcutBindings();
  if (bindings[actionId] && bindings[actionId].length > 0) {
    bindings[actionId].pop();
    saveShortcutBindings(bindings);
    _shortcutBindings = bindings;
    renderShortcutConfig();
  }
}

function resetShortcuts() {
  localStorage.removeItem("rhfiles-shortcuts");
  _shortcutBindings = null;
  renderShortcutConfig();
  showNotice("Shortcuts reset to defaults");
}

// --- import/export ---
async function collectAllLocalData() {
  const data = { _version: 2, _exportDate: new Date().toISOString() };
  const keys = [
    "rhfiles-settings", "rhfiles-lang", "rhfiles-layout", "rhfiles-tabs",
    "rhfiles-shortcuts", "rhfiles-toolbar", "rhfiles-custom-theme",
    "rhfiles-groupBy", "rhfiles-theme", "rhfiles-folder-layouts",
    "rhfiles-tags", "rhfiles-pinned", "rhfiles-recent", "rhfiles-search-history",
  ];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("rhfiles-") && !data.hasOwnProperty(k)) {
      data[k] = localStorage.getItem(k);
    }
  }
  try {
    const dbData = await call("db_export_all", {});
    if (dbData) {
      if (dbData.db_tags) data._db_tags = dbData.db_tags;
      if (dbData.db_layouts) data._db_layouts = dbData.db_layouts;
      if (dbData.db_pinned) data._db_pinned = dbData.db_pinned;
    }
  } catch (e) {}
  return data;
}

function exportAllData() {
  collectAllLocalData().then(data => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rhfiles-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice("Data exported successfully (localStorage + SQLite)");
  });
}

function importAllData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data._version) { alert("Invalid RHFiles backup file"); return; }
        for (const k in data) {
          if (k.startsWith("_")) continue;
          localStorage.setItem(k, data[k]);
        }
        _shortcutBindings = null;
        const dbTags = data._db_tags || "";
        const dbLayouts = data._db_layouts || "";
        const dbPinned = data._db_pinned || "";
        if (dbTags || dbLayouts || dbPinned) {
          call("db_import_all", { tagsJson: dbTags, layoutsJson: dbLayouts, pinnedJson: dbPinned }).then(() => {
            showNotice("Data imported successfully (localStorage + SQLite). Reloading...");
            setTimeout(() => location.reload(), 1500);
          }).catch(e => {
            showNotice("localStorage imported, SQLite failed: " + e);
            setTimeout(() => location.reload(), 1500);
          });
        } else {
          showNotice("Data imported successfully. Reloading...");
          setTimeout(() => location.reload(), 1500);
        }
      } catch (e) {
        alert("Failed to parse backup: " + e.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function clearAllData() {
  if (!confirm("This will clear ALL local data (shortcuts, tags, tabs, layouts, history, settings, SQLite database). Continue?")) return;
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("rhfiles-")) keysToRemove.push(k);
  }
  for (const k of keysToRemove) localStorage.removeItem(k);
  _shortcutBindings = null;
  call("db_clear_all", {}).catch(() => {});
  showNotice("All data cleared (localStorage + SQLite). Reloading...");
  setTimeout(() => location.reload(), 1500);
}
