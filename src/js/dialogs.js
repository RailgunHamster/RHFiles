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
  container.innerHTML = "";
  tags.forEach((tag, i) => {
    const span = document.createElement("span");
    span.className = "tag-pill-edit";
    span.style.background = tagColor(i) + "22";
    span.style.color = tagColor(i);
    span.textContent = tag;
    const remove = document.createElement("span");
    remove.className = "tag-remove";
    remove.textContent = "\u00d7";
    remove.addEventListener("click", () => removeTag(tag));
    span.appendChild(remove);
    container.appendChild(span);
  });
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
  call("db_save_tags", { path, tags: G.tagCache[path] });
  input.value = "";
  renderCurrentTags();
  renderFiles(getTab(), "file-list", "status-count", "status-selection");
}

function removeTag(tag) {
  const sel = getSelectedPaths(tagDialogSource);
  if (!sel.length) return;
  const path = sel[0].path;
  if (G.tagCache[path]) G.tagCache[path] = G.tagCache[path].filter(t => t !== tag);
  call("db_save_tags", { path, tags: G.tagCache[path] || [] });
  renderCurrentTags();
  renderFiles(getTab(), "file-list", "status-count", "status-selection");
}

// --- settings ---
function openSettings() {
  const dlg = document.getElementById("settings-dialog");
  const content = document.getElementById("settings-content");
  const themeVal = G.theme || 'light';
  const langOptions = getAvailableLanguages().map(l =>
    '<option value="' + l.code + '"' + (_lang===l.code?" selected":"") + '>' + esc(l.name) + '</option>'
  ).join("");
  content.innerHTML =
    '<div class="settings-row"><label>' + t('settings.language') + '</label>' +
    '<select onchange="setLang(this.value)">' + langOptions + '</select></div>' +
    '<div class="settings-row"><label>' + t('settings.theme') + '</label>' +
    '<select id="settings-theme-select" onchange="onThemeSelectChange(this.value)"><option value="light"' + (themeVal==="light"?" selected":"") + '>' + t('settings.themeLight') + '</option><option value="dark"' + (themeVal==="dark"?" selected":"") + '>' + t('settings.themeDark') + '</option><option value="custom"' + (themeVal==="custom"?" selected":"") + '>' + t('settings.themeCustom') + '</option></select></div>' +
    '<div id="custom-theme-section" style="display:' + (themeVal==="custom"?"block":"none") + ';margin-top:8px">' +
      '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:4px">' +
        '<label>' + t('settings.customCss') + '</label>' +
        '<textarea id="custom-theme-css" rows="8" style="width:100%;font-family:monospace;font-size:12px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:6px;resize:vertical">' + esc(localStorage.getItem('rhfiles-custom-theme') || '') + '</textarea>' +
      '</div>' +
      '<div class="settings-row" style="gap:8px">' +
        '<button class="dialog-btn" onclick="uploadThemeFile()">' + t('btn.uploadCss') + '</button>' +
        '<button class="dialog-btn primary" onclick="applyCustomThemeFromSettings()">' + t('btn.apply') + '</button>' +
        '<button class="dialog-btn" onclick="resetCustomTheme()">' + t('btn.reset') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="settings-row"><label>' + t('settings.bgEffect') + '</label>' +
    '<select onchange="applyWindowEffect(this.value)"><option value="none"' + (G.windowEffect==="none"||!G.windowEffect?" selected":"") + '>' + t('settings.effectNone') + '</option><option value="mica"' + (G.windowEffect==="mica"?" selected":"") + '>' + t('settings.effectMica') + '</option><option value="acrylic"' + (G.windowEffect==="acrylic"?" selected":"") + '>' + t('settings.effectAcrylic') + '</option><option value="mica-alt"' + (G.windowEffect==="mica-alt"?" selected":"") + '>' + t('settings.effectMicaAlt') + '</option></select></div>' +
    '<div class="settings-row"><label>' + t('settings.layout') + '</label>' +
    '<select onchange="setLayout(this.value)"><option value="details"' + (G.layout==="details"?" selected":"") + '>' + t('settings.layoutDetails') + '</option><option value="icons"' + (G.layout==="icons"?" selected":"") + '>' + t('settings.layoutIcons') + '</option><option value="thumbnails"' + (G.layout==="thumbnails"?" selected":"") + '>' + t('settings.layoutThumbnails') + '</option><option value="cards"' + (G.layout==="cards"?" selected":"") + '>' + t('settings.layoutCards') + '</option><option value="columns"' + (G.layout==="columns"?" selected":"") + '>' + t('settings.layoutColumns') + '</option></select></div>' +
    '<div class="settings-row"><label>' + t('settings.showExtensions') + '</label>' +
    '<input type="checkbox" onchange="G.showExtensions=this.checked;renderFiles(getTab(),\'file-list\',\'status-count\',\'status-selection\')"' + (G.showExtensions!==false?' checked':'') + '></div>' +
    '<div class="settings-row"><label>' + t('settings.grouping') + '</label>' +
    '<select onchange="toggleGrouping(this.value)"><option value="none"' + (G.groupBy==='none'||!G.groupBy?" selected":"") + '>' + t('settings.groupNone') + '</option><option value="type"' + (G.groupBy==='type'?" selected":"") + '>' + t('settings.groupType') + '</option><option value="date"' + (G.groupBy==='date'?" selected":"") + '>' + t('settings.groupDate') + '</option><option value="size"' + (G.groupBy==='size'?" selected":"") + '>' + t('settings.groupSize') + '</option><option value="extension"' + (G.groupBy==='extension'?" selected":"") + '>' + t('settings.groupExt') + '</option></select></div>' +
    '<div class="settings-row"><label>' + t('settings.defaultTerminal') + '</label>' +
    '<select onchange="G.settings.terminal=this.value;saveSettings()"><option value="wt"' + ((G.settings.terminal||'wt')==='wt'?" selected":"") + '>' + t('settings.termWt') + '</option><option value="powershell"' + (G.settings.terminal==='powershell'?" selected":"") + '>' + t('settings.termPs') + '</option><option value="cmd"' + (G.settings.terminal==='cmd'?" selected":"") + '>' + t('settings.termCmd') + '</option></select></div>' +
    '<div class="settings-row"><label>' + t('settings.adaptiveLayout') + '</label>' +
    '<input type="checkbox" onchange="G.settings.adaptiveLayout=this.checked;saveSettings()"' + (G.settings.adaptiveLayout!==false?' checked':'') + '></div>' +
    '<div class="settings-row"><label>' + t('settings.iconStyle') + '</label>' +
    '<select onchange="G.settings.iconMode=this.value;saveSettings();clearIconCache();renderFiles(getTab(),\'file-list\',\'status-count\',\'status-selection\')">' +
      '<option value="builtin"' + ((G.settings.iconMode||'builtin')==='builtin'?" selected":"") + '>' + t('settings.iconBuiltin') + '</option>' +
      '<option value="fluent"' + (G.settings.iconMode==='fluent'?" selected":"") + '>' + t('settings.iconFluent') + '</option>' +
      '<option value="system"' + (G.settings.iconMode==='system'?" selected":"") + '>' + t('settings.iconSystem') + '</option>' +
      '<option value="mixed"' + (G.settings.iconMode==='mixed'?" selected":"") + '>' + t('settings.iconMixed') + '</option>' +
    '</select></div>' +
    '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px"><label>' + t('settings.customizeToolbar') + '</label>' +
    '<div id="toolbar-config-list" style="display:flex;flex-direction:column;gap:4px;max-height:250px;overflow:auto"></div>' +
    '<button class="dialog-btn" onclick="resetToolbarConfig()" style="align-self:flex-start">' + t('btn.resetDefault') + '</button></div>' +
    '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">' +
    '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px"><label>' + t('settings.shortcuts') + '</label>' +
    '<div id="shortcut-config-list" style="display:flex;flex-direction:column;gap:6px;max-height:350px;overflow:auto;padding:4px 0"></div>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
      '<button class="dialog-btn" onclick="resetShortcuts()" style="align-self:flex-start">' + t('btn.resetShortcuts') + '</button>' +
      '<span style="font-size:11px;color:var(--text-secondary)">' + t('settings.shortcutHelp') + '</span>' +
    '</div></div>' +
    '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">' +
    '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px"><label>' + t('settings.dataManagement') + '</label>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="dialog-btn" onclick="exportAllData()">' + t('btn.export') + '</button>' +
      '<button class="dialog-btn" onclick="importAllData()">' + t('btn.import') + '</button>' +
      '<button class="dialog-btn" onclick="clearAllData()" style="color:#e74c3c">' + t('btn.clearAll') + '</button>' +
    '</div>' +
    '<span style="font-size:11px;color:var(--text-secondary)">' + t('settings.dataHelp') + '</span>' +
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

// --- new file dialog ---
let _newFileTemplates = [];
let _newFileDest = "";
let _newFileIsRight = false;

function newFileTemplateExt(tpl) {
  if (!tpl) return "";
  if (tpl.extension) return String(tpl.extension);
  return String(tpl.ext || "").replace(/^\./, "");
}

async function showNewFileDialog(isRight) {
  const dialogEl = document.getElementById("newfile-dialog");
  const container = document.getElementById("newfile-templates");
  const nameInput = document.getElementById("newfile-name");
  if (!dialogEl || !container || !nameInput) return;
  _newFileIsRight = !!isRight;
  _newFileDest = _newFileIsRight ? G.rp.path : getTab().path;
  let templates = [];
  try {
    templates = await call("get_new_file_templates", {});
  } catch (e) { /* fall back to built-in templates below */ }
  if (!Array.isArray(templates) || templates.length === 0) {
    templates = [
      { name: t('template.textFile'), ext: ".txt", content: "" },
      { name: t('template.htmlFile'), ext: ".html", content: "<!DOCTYPE html>\n<html>\n<head><title></title></head>\n<body>\n\n</body>\n</html>" },
      { name: t('template.jsonFile'), ext: ".json", content: "{\n  \n}" },
      { name: t('template.markdownFile'), ext: ".md", content: "# Title\n\n" },
      { name: t('template.jsFile'), ext: ".js", content: "// \n" },
      { name: t('template.cssFile'), ext: ".css", content: "/* */\n" },
      { name: t('template.pythonFile'), ext: ".py", content: "# -*- coding: utf-8 -*-\n\n" },
      { name: t('template.batchFile'), ext: ".bat", content: "@echo off\n\n" },
    ];
  }
  _newFileTemplates = templates;
  container.innerHTML = templates.map((tpl, i) => {
    const ext = newFileTemplateExt(tpl);
    const icon = (typeof fileIcon === "function") ? fileIcon({ name: tpl.name || ext, extension: ext, is_dir: false, size: 0 }) : "";
    return `<div class="newfile-template${i === 0 ? " selected" : ""}" data-idx="${i}" onclick="selectNewFileTemplate(${i})"><span class="nft-icon">${icon}</span><span class="nft-name">${esc(tpl.name || ext)}</span></div>`;
  }).join("");
  nameInput.value = t('dialog.newFileDefault') + (templates.length ? "." + newFileTemplateExt(templates[0]) : ".txt");
  nameInput.onkeydown = e => {
    if (e.key === "Enter") { e.preventDefault(); createNewFileFromDialog(); }
    else if (e.key === "Escape") { e.preventDefault(); closeNewFile(); }
  };
  dialogEl.style.display = "flex";
  nameInput.focus();
}

function selectNewFileTemplate(idx) {
  const tpl = _newFileTemplates[idx];
  if (!tpl) return;
  document.querySelectorAll("#newfile-templates .newfile-template").forEach(el =>
    el.classList.toggle("selected", parseInt(el.dataset.idx) === idx));
  const input = document.getElementById("newfile-name");
  if (!input) return;
  let base = input.value.trim();
  if (!base) base = t('dialog.newFileDefault');
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = newFileTemplateExt(tpl);
  input.value = stem + (ext ? "." + ext : "");
  input.selectionStart = input.selectionEnd = stem.length + 1;
  input.focus();
}

async function createNewFileFromDialog() {
  const nameEl = document.getElementById("newfile-name");
  const name = nameEl ? nameEl.value.trim() : "";
  if (!name) return;
  const sel = document.querySelector("#newfile-templates .newfile-template.selected");
  let idx = sel ? parseInt(sel.dataset.idx) : 0;
  const byExt = _newFileTemplates.findIndex(tpl => {
    const ext = newFileTemplateExt(tpl);
    return ext && name.toLowerCase().endsWith("." + ext.toLowerCase());
  });
  if (byExt >= 0) idx = byExt;
  const tpl = _newFileTemplates[idx];
  try {
    await call("create_new_file", { parent: _newFileDest, template: newFileTemplateExt(tpl), name });
    closeNewFile();
    await refresh(_newFileIsRight);
  } catch (e) { alert(t('alert.createFileFailed', {error: e})); }
}

function closeNewFile() {
  const dlg = document.getElementById("newfile-dialog");
  if (dlg) dlg.style.display = "none";
}

// --- toolbar customization ---
const TOOLBAR_BUTTONS = [
  { id: "btn-new", label: t('tb.newFolder') },
  { id: "btn-cut", label: t('tb.cut') },
  { id: "btn-copy", label: t('tb.copy') },
  { id: "btn-paste", label: t('tb.paste') },
  { id: "btn-rename", label: t('tb.rename') },
  { id: "btn-delete", label: t('tb.delete') },
  { id: "btn-sort", label: t('tb.sort') },
  { id: "btn-hidden", label: t('tb.hidden') },
  { id: "btn-group", label: t('tb.group') },
  { id: "btn-layout-details", label: t('tb.details') },
  { id: "btn-layout-icons", label: t('tb.icons') },
  { id: "btn-layout-cards", label: t('tb.cards') },
  { id: "btn-layout-columns", label: t('tb.columns') },
  { id: "btn-preview", label: t('tb.preview') },
  { id: "btn-dual", label: t('tb.dualPane') },
  { id: "btn-theme", label: t('tb.theme') },
  { id: "btn-refresh", label: t('tb.refresh') },
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
  "nav.up": t('cmd.goUp'),
  "nav.down": t('cmd.openInto'),
  "nav.back": t('cmd.goBack'),
  "nav.forward": t('cmd.goForward'),
  "nav.refresh": t('cmd.refresh'),
  "nav.open": t('cmd.openInto'),
  "nav.home": "Jump to First",
  "nav.end": "Jump to Last",
  "file.copy": t('cmd.copy'),
  "file.cut": t('cmd.cut'),
  "file.paste": t('cmd.paste'),
  "file.delete": t('cmd.delete'),
  "file.rename": t('cmd.rename'),
  "file.newFolder": t('cmd.newFolder'),
  "file.newFile": t('cmd.newFile'),
  "file.selectAll": t('cmd.selectAll'),
  "file.invertSelection": t('cmd.invertSelection'),
  "file.properties": t('cmd.properties'),
  "file.quicklook": t('cmd.quickLook'),
  "file.undo": t('cmd.undo'),
  "file.redo": t('cmd.redo'),
  "view.fullscreen": t('cmd.fullscreen'),
  "view.dualPane": t('cmd.toggleDualPane'),
  "view.hidden": t('cmd.toggleHidden'),
  "view.switchPane": t('cmd.switchPane'),
  "view.grouping": t('cmd.toggleGrouping'),
  "window.new": t('cmd.newWindow'),
  "window.pip": t('cmd.togglePip'),
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
  showNotice(t('notice.shortcutsReset'));
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
      if (dbData.db_network_favorites) data._db_network_favorites = dbData.db_network_favorites;
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
    showNotice(t('notice.dataExported'));
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
        if (!data._version) { alert(t('alert.invalidBackup')); return; }
        for (const k in data) {
          if (k.startsWith("_")) continue;
          localStorage.setItem(k, data[k]);
        }
        _shortcutBindings = null;
        const dbTags = data._db_tags || "";
        const dbLayouts = data._db_layouts || "";
        const dbPinned = data._db_pinned || "";
        const dbNetFavs = data._db_network_favorites || "";
        if (dbTags || dbLayouts || dbPinned || dbNetFavs) {
          call("db_import_all", { tagsJson: dbTags, layoutsJson: dbLayouts, pinnedJson: dbPinned, networkFavoritesJson: dbNetFavs }).then(() => {
            showNotice(t('notice.dataImported'));
            setTimeout(() => location.reload(), 1500);
          }).catch(e => {
            showNotice(t('alert.importSqliteFailed', {error: e}));
            setTimeout(() => location.reload(), 1500);
          });
        } else {
          showNotice(t('notice.dataImportedLsOnly'));
          setTimeout(() => location.reload(), 1500);
        }
      } catch (e) {
        alert(t('alert.parseBackupFailed', {error: e.message}));
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function clearAllData() {
  if (!confirm(t('confirm.clearAllData'))) return;
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("rhfiles-")) keysToRemove.push(k);
  }
  for (const k of keysToRemove) localStorage.removeItem(k);
  _shortcutBindings = null;
  call("db_clear_all", {}).catch(() => {});
  showNotice(t('notice.dataCleared'));
  setTimeout(() => location.reload(), 1500);
}
