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
    const completed = renames
      .filter(([oldPath, newName]) => oldPath.split(/[\\/]/).pop() !== newName)
      .map(([oldPath, newName]) => [oldPath, joinFolderPath(parentFolderPath(oldPath), newName)]);
    if (completed.length) trackBatchRename(completed);
    closeBatchRename();
    await refresh();
  } catch (e) { alert(t('alert.renameFailed', { error:e })); }
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
    '<select onchange="setLayout(this.value)"><option value="details"' + (G.layout==="details"?" selected":"") + '>' + t('settings.layoutDetails') + '</option><option value="cards"' + (G.layout==="cards"?" selected":"") + '>' + t('settings.layoutCards') + '</option><option value="thumbnails"' + (G.layout==="thumbnails"?" selected":"") + '>' + t('settings.layoutThumbnails') + '</option><option value="columns"' + (G.layout==="columns"?" selected":"") + '>' + t('settings.layoutColumns') + '</option></select></div>' +
    '<div class="settings-row"><label>' + t('settings.dualOrientation') + '</label>' +
    '<select onchange="setDualPaneOrientation(this.value)"><option value="vertical"' + (G.settings.dualPaneOrientation!=="horizontal"?" selected":"") + '>' + t('pane.vertical') + '</option><option value="horizontal"' + (G.settings.dualPaneOrientation==="horizontal"?" selected":"") + '>' + t('pane.horizontal') + '</option></select></div>' +
    '<div class="settings-row"><label for="settings-preview-default">' + t('settings.previewDefaultOpen') + '</label>' +
    '<input id="settings-preview-default" type="checkbox" onchange="setPreviewDefaultOpen(this.checked)"' + (G.settings.previewDefaultOpen!==false?' checked':'') + '></div>' +
    '<div class="settings-row"><label for="settings-global-search">' + t('settings.enableGlobalSearch') + '</label>' +
    '<input id="settings-global-search" type="checkbox" onchange="setGlobalSearchEnabled(this.checked)"' + (G.settings.globalSearchEnabled!==false?' checked':'') + '></div>' +
    '<div class="settings-row"><label for="settings-auto-update">' + t('settings.autoUpdate') + '</label>' +
    '<input id="settings-auto-update" type="checkbox" onchange="setAutoUpdateEnabled(this.checked)"' + (G.settings.autoUpdateEnabled!==false?' checked':'') + '></div>' +
    '<div class="settings-row"><label for="settings-update-source">' + t('settings.updateSource') + '</label>' +
    '<select id="settings-update-source" onchange="setUpdateSource(this.value)">' +
      '<option value="https://github.com/RailgunHamster/RHFiles"' + (getUpdateSource()==='https://github.com/RailgunHamster/RHFiles'?' selected':'') + '>' + t('settings.updateSourceGithub') + '</option>' +
      '<option value="\\\\SERVER-HOME\\Public\\Software\\RHFiles-Releases"' + (getUpdateSource()==='\\\\SERVER-HOME\\Public\\Software\\RHFiles-Releases'?' selected':'') + '>' + t('settings.updateSourceServer') + '</option>' +
    '</select></div>' +
    '<div class="settings-row update-settings-row"><span id="settings-update-status" class="settings-help">' + t('update.statusUnknown') + '</span>' +
    '<button class="dialog-btn" id="settings-check-update" onclick="checkForUpdates(true)">' + t('settings.checkUpdates') + '</button></div>' +
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
  refreshUpdateSettingsStatus();
}

function setAutoUpdateEnabled(enabled) {
  G.settings.autoUpdateEnabled = !!enabled;
  saveSettings();
}

function setUpdateSource(source) {
  G.settings.updateSource = source;
  saveSettings();
  G._updateStatus = null;
  refreshUpdateSettingsStatus();
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

function newFileTemplateLabel(tpl) {
  const keyByExtension = {
    txt: 'template.textFile', md: 'template.markdownFile', html: 'template.htmlFile',
    css: 'template.cssFile', js: 'template.jsFile', py: 'template.pythonFile',
    rs: 'template.rustFile', json: 'template.jsonFile', xml: 'template.xmlFile',
    yaml: 'template.yamlFile', yml: 'template.yamlFile', sh: 'template.shellFile',
    bat: 'template.batchFile',
  };
  const key = keyByExtension[newFileTemplateExt(tpl).toLowerCase()];
  return key ? t(key) : (tpl?.name || newFileTemplateExt(tpl));
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
    return `<div class="newfile-template${i === 0 ? " selected" : ""}" data-idx="${i}" onclick="selectNewFileTemplate(${i})"><span class="nft-icon">${icon}</span><span class="nft-name">${esc(newFileTemplateLabel(tpl))}</span></div>`;
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

// --- folder disk-usage analysis (bundled dust) ---
let _diskUsagePath = '';
let _diskUsageToken = 0;
let _diskUsageRows = [];
let _diskUsageSelected = null;

function parseDustSize(value) {
  const text = String(value == null ? '' : value).trim().replace(/\s+/g, '');
  const match = /^([\d.]+)([kmgtpe]?)(?:i?b)?$/i.exec(text);
  if (!match) return Number(value) || 0;
  const powers = { '':0, k:1, m:2, g:3, t:4, p:5, e:6 };
  return Number(match[1]) * Math.pow(1024, powers[match[2].toLowerCase()] || 0);
}

function dustDisplayName(path) {
  const normalized = String(path || '').replace(/[\\/]+$/, '');
  return normalized.split(/[\\/]/).filter(Boolean).pop() || displayPath(path);
}

function flattenDustTree(node, level, rows) {
  const children = Array.isArray(node?.children) ? node.children : [];
  children.forEach(child => {
    rows.push({ node:child, level });
    flattenDustTree(child, level + 1, rows);
  });
  return rows;
}

function diskUsageNodeIsDirectory(node) {
  return node?.is_dir === true || (Array.isArray(node?.children) && node.children.length > 0);
}

function updateDiskUsageActionState() {
  const enabled = !!_diskUsageSelected;
  ['disk-usage-open', 'disk-usage-reveal', 'disk-usage-copy', 'disk-usage-properties'].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.disabled = !enabled;
  });
}

function selectDiskUsageRow(row, node) {
  document.querySelectorAll('.disk-usage-row.selected').forEach(item => {
    item.classList.remove('selected');
    item.setAttribute('aria-selected', 'false');
  });
  _diskUsageSelected = node || null;
  if (row && node) {
    row.classList.add('selected');
    row.setAttribute('aria-selected', 'true');
    row.focus({preventScroll:true});
  }
  updateDiskUsageActionState();
}

async function revealDiskUsageNode(node) {
  if (!node?.name) return false;
  const path = String(node.name);
  const parent = parentFolderPath(path);
  const isRight = G.dualOn && G.lastActivePane === 'right';
  const opened = isRight ? await rpNavigateTo(parent) : await navigateTo(parent);
  if (opened === false) return false;
  const pane = isRight ? G.rp : getTab();
  const index = (pane.entries || []).findIndex(entry => entry.path.toLowerCase() === path.toLowerCase());
  if (index >= 0) {
    pane.sel.clear();
    pane.sel.add(index);
    pane.lastIdx = index;
    renderFiles(pane, isRight ? 'right-file-list' : 'file-list', isRight ? 'right-status-count' : 'status-count', isRight ? null : 'status-selection', isRight);
    scrollToVisible(index);
    updatePreviewForSelection();
  }
  return true;
}

async function openDiskUsageNode(node) {
  if (!node?.name) return;
  const path = String(node.name);
  if (diskUsageNodeIsDirectory(node)) {
    if (G.dualOn && G.lastActivePane === 'right') await rpNavigateTo(path);
    else await navigateTo(path);
  } else {
    await openFileHandler(path);
  }
}

function showDiskUsageNodeContextMenu(event, node) {
  event.preventDefault();
  event.stopPropagation();
  const path = String(node?.name || '');
  const isDirectory = diskUsageNodeIsDirectory(node);
  showMenuAt(event.clientX, event.clientY, [
    {label:t('ctx.open'), action:() => openDiskUsageNode(node)},
    {label:t('ctx.newTab'), hidden:!isDirectory, action:() => addTab(path)},
    {label:t('sidebar.openLocation'), action:() => revealDiskUsageNode(node)},
    {label:t('ctx.preview'), hidden:isDirectory, action:async () => { if (await revealDiskUsageNode(node)) switchInspectorTab('preview'); }},
    {label:'-'},
    {label:t('ctx.copyPath'), action:() => copyPathFromMenu(path)},
    {label:t('diskUsage.analyze'), hidden:!isDirectory, action:() => showDiskUsageDialog(path)},
    {label:t('ctx.openCmd'), hidden:!isDirectory, action:() => runContextCommand('open_terminal', {path, terminal:'cmd'}, 'CMD')},
    {label:t('ctx.openPowerShell'), hidden:!isDirectory, action:() => runContextCommand('open_terminal', {path, terminal:'powershell'}, 'PowerShell')},
    {label:'-'},
    {label:t('ctx.properties'), action:() => showPropertiesDialog(path)},
  ], 'disk-usage-context-menu');
}

function renderDiskUsage(data) {
  const results = document.getElementById('disk-usage-results');
  const summary = document.getElementById('disk-usage-summary');
  if (!results || !summary) return;
  const rows = flattenDustTree(data, 0, []);
  _diskUsageRows = rows;
  _diskUsageSelected = null;
  updateDiskUsageActionState();
  const total = Math.max(parseDustSize(data?.size), ...rows.map(row => parseDustSize(row.node.size)), 1);
  summary.innerHTML = `<span>${esc(t('diskUsage.total'))}</span><strong>${esc(String(data?.size || fmtSize(total)))}</strong><span class="disk-usage-count">${esc(t('diskUsage.entries', {count:rows.length}))}</span>`;
  if (!rows.length) {
    results.innerHTML = `<div class="disk-usage-empty">${esc(t('diskUsage.empty'))}</div>`;
    return;
  }
  results.innerHTML = rows.map(({node, level}, index) => {
    const bytes = parseDustSize(node.size);
    const percent = Math.max(1, Math.min(100, bytes / total * 100));
    const path = String(node.name || '');
    const isDirectory = node.is_dir === true || Array.isArray(node.children);
    return `<button class="disk-usage-row${isDirectory ? ' is-directory' : ''}" data-index="${index}" data-path="${esc(path)}" title="${esc(displayPath(path))}" aria-selected="false">
      <span class="disk-usage-indent" style="width:${Math.min(level, 8) * 16}px"></span>
      <span class="disk-usage-icon">${isDirectory ? '&#128193;' : '&#128196;'}</span>
      <span class="disk-usage-name">${esc(dustDisplayName(path))}</span>
      <span class="disk-usage-bar-track"><span class="disk-usage-bar" style="width:${percent.toFixed(2)}%"></span></span>
      <span class="disk-usage-size">${esc(String(node.size || ''))}</span>
    </button>`;
  }).join('');
  results.querySelectorAll('.disk-usage-row').forEach((row, index) => {
    const node = rows[index]?.node;
    row.addEventListener('click', () => selectDiskUsageRow(row, node));
    row.addEventListener('dblclick', () => openDiskUsageNode(node));
    row.addEventListener('contextmenu', event => {
      selectDiskUsageRow(row, node);
      showDiskUsageNodeContextMenu(event, node);
    });
  });
}

async function refreshDiskUsage() {
  const token = ++_diskUsageToken;
  const results = document.getElementById('disk-usage-results');
  const summary = document.getElementById('disk-usage-summary');
  const depth = Number(document.getElementById('disk-usage-depth')?.value || 2);
  _diskUsageSelected = null;
  _diskUsageRows = [];
  updateDiskUsageActionState();
  if (summary) summary.innerHTML = '';
  if (results) results.innerHTML = `<div class="disk-usage-loading"><span></span>${esc(t('diskUsage.analyzing'))}</div>`;
  try {
    const data = await call('analyze_disk_usage', { path:_diskUsagePath, depth, maxEntries:250 });
    if (token !== _diskUsageToken) return;
    renderDiskUsage(data);
  } catch (error) {
    if (token !== _diskUsageToken || !results) return;
    results.innerHTML = `<div class="disk-usage-empty"><strong>${esc(t('diskUsage.failed'))}</strong><span>${esc(String(error))}</span></div>`;
  }
}

function showDiskUsageDialog(path) {
  const activePath = path || getActivePaneState()?.path;
  _diskUsagePath = activePath === 'home://' ? (G.homeDirPath || 'C:\\') : normalizeWindowsPathInput(activePath);
  if (!G.previewOn) setPreviewPaneVisible(true);
  switchInspectorTab('disk');
  document.getElementById('disk-usage-path').textContent = displayPath(_diskUsagePath);
  applyI18n();
  refreshDiskUsage();
}

function activateDiskUsageTab() {
  if (!_diskUsagePath) showDiskUsageDialog();
  else {
    if (!G.previewOn) setPreviewPaneVisible(true);
    switchInspectorTab('disk');
  }
}

function closeDiskUsageDialog() {
  if (G.inspectorTab === 'disk') switchInspectorTab('preview');
}

function openSelectedDiskUsageItem() {
  return openDiskUsageNode(_diskUsageSelected);
}

function revealSelectedDiskUsageItem() {
  return revealDiskUsageNode(_diskUsageSelected);
}

function copySelectedDiskUsagePath() {
  if (_diskUsageSelected?.name) return copyPathFromMenu(String(_diskUsageSelected.name));
}

function showSelectedDiskUsageProperties() {
  if (_diskUsageSelected?.name) return showPropertiesDialog(String(_diskUsageSelected.name));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('disk-usage-results')?.addEventListener('keydown', event => {
    const row = event.target.closest('.disk-usage-row');
    if (!row) return;
    const index = Number(row.dataset.index);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const nextIndex = Math.max(0, Math.min(_diskUsageRows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      const nextRow = document.querySelector(`.disk-usage-row[data-index="${nextIndex}"]`);
      if (nextRow) selectDiskUsageRow(nextRow, _diskUsageRows[nextIndex]?.node);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      openDiskUsageNode(_diskUsageRows[index]?.node);
    } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      event.stopPropagation();
      const rect = row.getBoundingClientRect();
      showDiskUsageNodeContextMenu({preventDefault(){}, stopPropagation(){}, clientX:rect.left + 18, clientY:rect.bottom}, _diskUsageRows[index]?.node);
    }
  });
});

// --- toolbar customization ---
const TOOLBAR_BUTTONS = [
  { id: "btn-new", labelKey: 'tb.newFolder' },
  { id: "btn-cut", labelKey: 'tb.cut' },
  { id: "btn-copy", labelKey: 'tb.copy' },
  { id: "btn-paste", labelKey: 'tb.paste' },
  { id: "btn-rename", labelKey: 'tb.rename' },
  { id: "btn-delete", labelKey: 'tb.delete' },
  { id: "btn-sort", labelKey: 'tb.sort' },
  { id: "btn-hidden", labelKey: 'tb.hidden' },
  { id: "btn-group", labelKey: 'tb.group' },
  { id: "btn-layout-details", labelKey: 'tb.details' },
  { id: "btn-layout-thumbnails", labelKey: 'tb.thumbnails' },
  { id: "btn-layout-cards", labelKey: 'tb.cards' },
  { id: "btn-layout-columns", labelKey: 'tb.columns' },
  { id: "btn-disk-usage", labelKey: 'tb.diskUsage' },
  { id: "btn-preview", labelKey: 'tb.preview' },
  { id: "btn-dual", labelKey: 'tb.dualPane' },
  { id: "btn-theme", labelKey: 'tb.theme' },
  { id: "btn-refresh", labelKey: 'tb.refresh' },
];

function loadToolbarConfig() {
  try {
    const saved = localStorage.getItem("rhfiles-toolbar");
    if (saved) {
      const config = JSON.parse(saved);
      if ((config.version || 1) < 2) {
        if (!config.visible.includes('btn-disk-usage')) config.visible.push('btn-disk-usage');
      }
      if ((config.version || 1) < 3) {
        config.visible = config.visible.filter(id => id !== 'btn-layout-icons');
        if (!config.visible.includes('btn-layout-cards')) config.visible.push('btn-layout-cards');
        config.version = 3;
        localStorage.setItem('rhfiles-toolbar', JSON.stringify(config));
      }
      return config;
    }
  } catch(e) {}
  return { version: 3, visible: TOOLBAR_BUTTONS.map(b => b.id) };
}

function applyToolbarConfig() {
  const config = loadToolbarConfig();
  const toolbar = document.querySelector(".command-bar");
  if (!toolbar) return;
  const allBtns = toolbar.querySelectorAll(":scope > .cmd, :scope > .tb[id], .layout-switcher > .layout-btn");
  const visibleSet = new Set(config.visible);
  allBtns.forEach(btn => {
    const id = btn.id || btn.dataset.layout && ("btn-layout-" + btn.dataset.layout);
    if (!id) return;
    // Settings must never disappear behind a toolbar customization. Otherwise
    // the neighboring sun/theme button is easily mistaken for Settings.
    if (id === 'btn-settings') {
      btn.style.display = '';
      return;
    }
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
      ${esc(t(b.labelKey))}
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
const SHORTCUT_LABEL_KEYS = {
  "nav.up": "cmd.goUp",
  "nav.down": "cmd.openInto",
  "nav.back": "cmd.goBack",
  "nav.forward": "cmd.goForward",
  "nav.refresh": "cmd.refresh",
  "nav.address": "cmd.focusAddress",
  "nav.open": "cmd.openInto",
  "nav.home": "cmd.jumpFirst",
  "nav.end": "cmd.jumpLast",
  "file.contextMenu": "cmd.contextMenu",
  "file.copy": "cmd.copy",
  "file.cut": "cmd.cut",
  "file.paste": "cmd.paste",
  "file.delete": "cmd.delete",
  "file.rename": "cmd.rename",
  "file.newFolder": "cmd.newFolder",
  "file.newFile": "cmd.newFile",
  "file.selectAll": "cmd.selectAll",
  "file.invertSelection": "cmd.invertSelection",
  "file.properties": "cmd.properties",
  "file.quicklook": "cmd.quickLook",
  "file.toggleFavorite": "cmd.toggleFavorite",
  "file.undo": "cmd.undo",
  "file.redo": "cmd.redo",
  "view.fullscreen": "cmd.fullscreen",
  "view.previewFullscreen": "cmd.previewFullscreen",
  "view.diskUsage": "cmd.diskUsage",
  "view.dualPane": "cmd.toggleDualPane",
  "view.hidden": "cmd.toggleHidden",
  "view.switchPane": "cmd.switchPane",
  "view.grouping": "cmd.toggleGrouping",
  "window.new": "cmd.newWindow",
  "window.pip": "cmd.togglePip",
  "palette": "cmd.commandPalette",
  "settings": "cmd.settings",
  "tab.new": "cmd.newTab",
  "tab.close": "cmd.closeTab",
  "tab.next": "cmd.nextTab",
  "tab.previous": "cmd.previousTab",
  "typeSearch.next": "cmd.typeSearchNext",
  "typeSearch.previous": "cmd.typeSearchPrevious",
  "search.toggleScope": "cmd.toggleSearchScope",
};

function renderShortcutConfig() {
  const container = document.getElementById("shortcut-config-list");
  if (!container) return;
  const bindings = getShortcutBindings();
  const entries = Object.entries(SHORTCUT_LABEL_KEYS);
  container.innerHTML = entries.map(([actionId, labelKey]) => {
    const label = t(labelKey);
    const keys = bindings[actionId] || [];
    const keyInputs = keys.map((k, i) =>
      `<input type="text" class="shortcut-key-input" readonly value="${esc(k)}" data-action="${actionId}" data-index="${i}" data-original="${esc(k)}" style="width:140px;font-size:12px;padding:3px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:3px;cursor:pointer;text-align:center" onclick="recordShortcut(this)">`
    ).join("");
    return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
      <span style="width:160px;font-size:12px;flex-shrink:0">${esc(label)}</span>
      <div style="display:flex;gap:4px;align-items:center">${keyInputs}</div>
       <button class="shortcut-binding-btn add" title="${esc(t('settings.addShortcut'))}" aria-label="${esc(t('settings.addShortcut'))}" onclick="addShortcutBinding('${actionId}')"><span aria-hidden="true"></span></button>
       <button class="shortcut-binding-btn remove" title="${esc(t('settings.removeShortcut'))}" aria-label="${esc(t('settings.removeShortcut'))}" onclick="removeShortcutBinding('${actionId}')"><span aria-hidden="true"></span></button>
    </div>`;
  }).join("");
}

function recordShortcut(input) {
  input.classList.add("shortcut-recorder");
  input.value = t('notice.shortcutHelp');
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
