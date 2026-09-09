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
const SETTINGS_SECTIONS = Object.freeze([
  ['general', 'settings.categoryGeneral'],
  ['appearance', 'settings.categoryAppearance'],
  ['files', 'settings.categoryFiles'],
  ['preview', 'settings.categoryPreview'],
  ['search', 'settings.categorySearch'],
  ['integration', 'settings.categoryIntegration'],
  ['updates', 'settings.categoryUpdates'],
  ['shortcuts', 'settings.categoryShortcuts'],
  ['data', 'settings.categoryData'],
]);

function settingsSectionIcon(id) {
  const paths = {
    general: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.7v1.4M8 12.9v1.4M1.7 8h1.4M12.9 8h1.4M3.55 3.55l1 1M11.45 11.45l1 1M12.45 3.55l-1 1M4.55 11.45l-1 1"/>',
    appearance: '<path d="M8 2a6 6 0 1 0 0 12c1.1 0 1.5-.7 1.1-1.5-.4-.7.1-1.5 1-1.5h1.4A2.5 2.5 0 0 0 14 8.5 6.5 6.5 0 0 0 8 2z"/><circle cx="5" cy="6" r=".6"/><circle cx="8" cy="4.8" r=".6"/><circle cx="11" cy="6.3" r=".6"/>',
    files: '<path d="M1.8 4.5h5l1.6 1.7h5.8v6.6H1.8V4.5z"/><path d="M1.8 4.5V3.2h4.4l1.3 1.3"/>',
    preview: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="m4.2 10 2.5-2.6 1.9 1.8 1.4-1.4 1.8 2.2"/><circle cx="10.8" cy="5.7" r=".8"/>',
    search: '<circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3.4 3.4"/>',
    integration: '<path d="M3 3.2h4.3v4.3H3zM8.7 8.5H13v4.3H8.7z"/><path d="M7.3 5.35h2.1a1.6 1.6 0 0 1 1.6 1.6V8.5M8.7 10.65H6.6A1.6 1.6 0 0 1 5 9.05V7.5"/>',
    updates: '<path d="M8 2.2v7.1M5.2 6.7 8 9.5l2.8-2.8"/><path d="M2.5 11.2v2h11v-2"/>',
    shortcuts: '<rect x="1.7" y="3.1" width="12.6" height="9.8" rx="1.5"/><path d="M4 6h1M7.5 6h1M11 6h1M4 9h1M7 9h5"/>',
    data: '<ellipse cx="8" cy="3.7" rx="5" ry="2"/><path d="M3 3.7v4.2c0 1.1 2.2 2 5 2s5-.9 5-2V3.7M3 7.8V12c0 1.1 2.2 2 5 2s5-.9 5-2V7.8"/>',
  };
  return '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">' + (paths[id] || paths.general) + '</svg>';
}

function settingsPage(id, titleKey, descriptionKey, body) {
  return '<section class="settings-page" id="settings-page-' + id + '" role="tabpanel" aria-labelledby="settings-nav-' + id + '" data-settings-page="' + id + '">' +
    '<header class="settings-page-header"><h2>' + esc(t(titleKey)) + '</h2><p>' + esc(t(descriptionKey)) + '</p></header>' +
    body + '</section>';
}

function switchSettingsSection(sectionId, persist = true) {
  if (!SETTINGS_SECTIONS.some(([id]) => id === sectionId)) sectionId = 'general';
  document.querySelectorAll('#settings-nav .settings-nav-item').forEach(button => {
    const active = button.dataset.settingsSection === sectionId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('#settings-content .settings-page').forEach(page => {
    const active = page.dataset.settingsPage === sectionId;
    page.classList.toggle('active', active);
    page.hidden = !active;
  });
  const content = document.getElementById('settings-content');
  if (content) content.scrollTop = 0;
  const resetShortcutsButton = document.getElementById('settings-reset-shortcuts-footer');
  if (resetShortcutsButton) resetShortcutsButton.hidden = sectionId !== 'shortcuts';
  if (persist) localStorage.setItem('rhfiles-settings-section', sectionId);
}

function handleSettingsNavKey(event, sectionId) {
  const currentIndex = SETTINGS_SECTIONS.findIndex(([id]) => id === sectionId);
  if (currentIndex < 0) return;
  let nextIndex = currentIndex;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % SETTINGS_SECTIONS.length;
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = SETTINGS_SECTIONS.length - 1;
  else return;
  event.preventDefault();
  const nextId = SETTINGS_SECTIONS[nextIndex][0];
  switchSettingsSection(nextId);
  document.querySelector(`#settings-nav [data-settings-section="${nextId}"]`)?.focus();
}

function openSettings() {
  const dlg = document.getElementById("settings-dialog");
  const nav = document.getElementById("settings-nav");
  const content = document.getElementById("settings-content");
  const themeVal = G.theme || 'light';
  const langOptions = getAvailableLanguages().map(l =>
    '<option value="' + l.code + '"' + (_lang===l.code?" selected":"") + '>' + esc(l.name) + '</option>'
  ).join("");
  nav.setAttribute('aria-label', t('settings.categories'));
  nav.innerHTML = SETTINGS_SECTIONS.map(([id, labelKey]) =>
    '<button type="button" class="settings-nav-item" id="settings-nav-' + id + '" role="tab" aria-controls="settings-page-' + id + '" data-settings-section="' + id + '" onclick="switchSettingsSection(\'' + id + '\')" onkeydown="handleSettingsNavKey(event,\'' + id + '\')">' +
      settingsSectionIcon(id) + '<span>' + esc(t(labelKey)) + '</span></button>'
  ).join('');

  const general = '<div class="settings-card">' +
    '<div class="settings-row"><label>' + t('settings.language') + '</label>' +
    '<select onchange="setLang(this.value)">' + langOptions + '</select></div>' +
    '<div class="settings-row"><label>' + t('settings.defaultTerminal') + '</label>' +
    '<select onchange="G.settings.terminal=this.value;saveSettings()"><option value="wt"' + ((G.settings.terminal||'wt')==='wt'?" selected":"") + '>' + t('settings.termWt') + '</option><option value="powershell"' + (G.settings.terminal==='powershell'?" selected":"") + '>' + t('settings.termPs') + '</option><option value="cmd"' + (G.settings.terminal==='cmd'?" selected":"") + '>' + t('settings.termCmd') + '</option></select></div>' +
    '<div class="settings-row"><label>' + t('settings.adaptiveLayout') + '</label>' +
    '<input type="checkbox" onchange="G.settings.adaptiveLayout=this.checked;saveSettings()"' + (G.settings.adaptiveLayout!==false?' checked':'') + '></div></div>';

  const appearance = '<div class="settings-card">' +
    '<div class="settings-row"><label>' + t('settings.theme') + '</label>' +
    '<select id="settings-theme-select" onchange="onThemeSelectChange(this.value)">' + themeOptionsHtml(themeVal) + '</select></div>' +
    '<div class="settings-theme-folder">' +
      '<div><strong>' + t('settings.userThemes') + '</strong><span id="settings-theme-directory">' + esc(_themeDirectory || t('settings.themeFolderUnknown')) + '</span></div>' +
      '<div class="settings-inline-actions"><button class="dialog-btn" onclick="openThemeFolder()">' + t('settings.openThemeFolder') + '</button>' +
      '<button class="dialog-btn" onclick="reloadThemePacks()">' + t('settings.reloadThemes') + '</button></div>' +
    '</div>' +
    '<div class="settings-row"><label>' + t('settings.bgEffect') + '</label>' +
    '<select onchange="applyWindowEffect(this.value)"><option value="none"' + (G.windowEffect==="none"||!G.windowEffect?" selected":"") + '>' + t('settings.effectNone') + '</option><option value="mica"' + (G.windowEffect==="mica"?" selected":"") + '>' + t('settings.effectMica') + '</option><option value="acrylic"' + (G.windowEffect==="acrylic"?" selected":"") + '>' + t('settings.effectAcrylic') + '</option><option value="mica-alt"' + (G.windowEffect==="mica-alt"?" selected":"") + '>' + t('settings.effectMicaAlt') + '</option></select></div>' +
    '<div class="settings-row"><label>' + t('settings.iconStyle') + '</label>' +
    '<select onchange="setIconMode(this.value)">' +
      '<option value="builtin"' + (G.settings.iconMode==='builtin'?" selected":"") + '>' + t('settings.iconBuiltin') + '</option>' +
      '<option value="fluent"' + (G.settings.iconMode==='fluent'?" selected":"") + '>' + t('settings.iconFluent') + '</option>' +
      '<option value="system"' + (G.settings.iconMode==='system'?" selected":"") + '>' + t('settings.iconSystem') + '</option>' +
      '<option value="mixed"' + ((G.settings.iconMode||'mixed')==='mixed'?" selected":"") + '>' + t('settings.iconMixed') + '</option>' +
    '</select></div></div>' +
    '<div class="settings-card"><div class="settings-card-title">' + t('settings.advancedCss') + '</div>' +
      '<p class="settings-card-description">' + t('settings.advancedCssHelp') + '</p>' +
    '<div id="custom-theme-section" class="settings-nested">' +
      '<div class="settings-row settings-row-stack">' +
        '<label>' + t('settings.customCss') + '</label>' +
        '<textarea id="custom-theme-css" rows="8" class="settings-code-input">' + esc(localStorage.getItem('rhfiles-custom-theme') || '') + '</textarea>' +
      '</div>' +
      '<div class="settings-inline-actions">' +
        '<button class="dialog-btn" onclick="uploadThemeFile()">' + t('btn.uploadCss') + '</button>' +
        '<button class="dialog-btn primary" onclick="applyCustomThemeFromSettings()">' + t('btn.apply') + '</button>' +
        '<button class="dialog-btn" onclick="resetCustomTheme()">' + t('btn.reset') + '</button>' +
      '</div>' +
    '</div></div>';

  const files = '<div class="settings-card">' +
    '<div class="settings-row"><label>' + t('settings.layout') + '</label>' +
    '<select onchange="setLayout(this.value)"><option value="details"' + (G.layout==="details"?" selected":"") + '>' + t('settings.layoutDetails') + '</option><option value="cards"' + (G.layout==="cards"?" selected":"") + '>' + t('settings.layoutCards') + '</option><option value="thumbnails"' + (G.layout==="thumbnails"?" selected":"") + '>' + t('settings.layoutThumbnails') + '</option><option value="columns"' + (G.layout==="columns"?" selected":"") + '>' + t('settings.layoutColumns') + '</option></select></div>' +
    '<div class="settings-row"><label>' + t('settings.dualOrientation') + '</label>' +
    '<select onchange="setDualPaneOrientation(this.value)"><option value="vertical"' + (G.settings.dualPaneOrientation!=="horizontal"?" selected":"") + '>' + t('pane.vertical') + '</option><option value="horizontal"' + (G.settings.dualPaneOrientation==="horizontal"?" selected":"") + '>' + t('pane.horizontal') + '</option></select></div>' +
    '<div class="settings-row"><label>' + t('settings.showExtensions') + '</label>' +
    '<input type="checkbox" onchange="G.showExtensions=this.checked;renderFiles(getTab(),\'file-list\',\'status-count\',\'status-selection\')"' + (G.showExtensions!==false?' checked':'') + '></div>' +
    '<div class="settings-row"><label>' + t('settings.grouping') + '</label>' +
    '<select onchange="toggleGrouping(this.value)"><option value="none"' + (G.groupBy==='none'||!G.groupBy?" selected":"") + '>' + t('settings.groupNone') + '</option><option value="type"' + (G.groupBy==='type'?" selected":"") + '>' + t('settings.groupType') + '</option><option value="date"' + (G.groupBy==='date'?" selected":"") + '>' + t('settings.groupDate') + '</option><option value="size"' + (G.groupBy==='size'?" selected":"") + '>' + t('settings.groupSize') + '</option><option value="extension"' + (G.groupBy==='extension'?" selected":"") + '>' + t('settings.groupExt') + '</option></select></div></div>' +
    '<div class="settings-card"><div class="settings-card-title">' + t('settings.ffmpegTitle') + '</div>' +
    '<p class="settings-card-description">' + t('settings.ffmpegHelp') + '</p>' +
    '<div class="settings-row update-location-row"><label for="settings-ffmpeg-path">' + t('settings.ffmpegPath') + '</label>' +
    '<input id="settings-ffmpeg-path" type="text" spellcheck="false" placeholder="C:\\Tools\\ffmpeg\\bin\\ffmpeg.exe" value="' + esc(String(G.settings.ffmpegPath || '')) + '" onchange="setFfmpegPath(this.value,this)"></div>' +
    '<div class="settings-inline-actions"><button class="dialog-btn" type="button" onclick="refreshFfmpegSettingsStatus()">' + t('settings.ffmpegDetect') + '</button></div>' +
    '<div id="settings-ffmpeg-status" class="media-convert-engine" role="status"></div></div>' +
    '<div class="settings-card"><div class="settings-card-title">' + t('settings.customizeToolbar') + '</div>' +
    '<div id="toolbar-config-list" class="settings-config-list toolbar-config-list"></div>' +
    '<button class="dialog-btn" onclick="resetToolbarConfig()">' + t('btn.resetDefault') + '</button></div>';

  const preview = '<div class="settings-card">' +
    '<div class="settings-row"><label for="settings-preview-default">' + t('settings.previewDefaultOpen') + '</label>' +
    '<input id="settings-preview-default" type="checkbox" onchange="setPreviewDefaultOpen(this.checked)"' + (G.settings.previewDefaultOpen!==false?' checked':'') + '></div>' +
    '<div class="settings-feature-note"><strong>' + t('settings.previewFormatsTitle') + '</strong><span>' + t('settings.previewFormatsBody') + '</span></div></div>';

  const search = '<div class="settings-card">' +
    '<div class="settings-row"><label for="settings-global-search">' + t('settings.enableGlobalSearch') + '</label>' +
    '<input id="settings-global-search" type="checkbox" onchange="setGlobalSearchEnabled(this.checked)"' + (G.settings.globalSearchEnabled!==false?' checked':'') + '></div>' +
    '<div class="settings-feature-note"><strong>' + t('settings.searchBehaviorTitle') + '</strong><span>' + t('settings.searchBehaviorBody') + '</span></div></div>';

  const integration = '<div class="settings-card">' +
    '<div class="settings-row"><label for="settings-integration-enabled"><span class="settings-label-title">' + t('settings.integrationEnabled') + '</span><span class="settings-experimental-badge">' + t('settings.integrationExperimental') + '</span></label>' +
    '<input id="settings-integration-enabled" type="checkbox" onchange="setFileDialogIntegrationEnabled(this.checked)"' + (G.settings.fileDialogIntegrationEnabled===true?' checked':'') + '></div>' +
    '<div class="settings-feature-note"><strong>' + t('settings.integrationBehaviorTitle') + '</strong><span>' + t('settings.integrationBehaviorBody') + '</span></div>' +
    '<div class="settings-feature-note"><strong>' + t('settings.integrationTargetsTitle') + '</strong><span>' + t('settings.integrationTargetsBody') + '</span></div></div>' +
    '<div class="settings-card settings-integration-card"><div class="settings-card-title">' + t('settings.integrationShortcutTitle') + '</div>' +
    '<div class="settings-integration-shortcut-row"><kbd id="settings-integration-shortcut"></kbd><button type="button" class="dialog-btn" onclick="openIntegrationShortcutSettings()">' + t('settings.integrationEditShortcut') + '</button></div>' +
    '<p class="settings-card-description">' + t('settings.integrationShortcutHelp') + '</p>' +
    '<div id="settings-integration-status" class="settings-integration-status" role="status"></div></div>';

  const updates = '<div class="settings-card">' +
    '<div class="settings-row"><label for="settings-auto-update">' + t('settings.autoUpdate') + '</label>' +
    '<input id="settings-auto-update" type="checkbox" onchange="setAutoUpdateEnabled(this.checked)"' + (G.settings.autoUpdateEnabled!==false?' checked':'') + '></div>' +
    '<div class="settings-row"><label for="settings-update-source">' + t('settings.updateSource') + '</label>' +
    '<select id="settings-update-source" onchange="setUpdateSourceMode(this.value)">' +
      '<option value="github"' + (G.settings.updateSourceMode!=='server'?' selected':'') + '>' + t('settings.updateSourceGithub') + '</option>' +
      '<option value="server"' + (G.settings.updateSourceMode==='server'?' selected':'') + '>' + t('settings.updateSourceServer') + '</option>' +
    '</select></div>' +
    '<div class="settings-row update-location-row"><label for="settings-update-github">' + t('settings.githubUpdateSource') + '</label>' +
    '<input id="settings-update-github" type="text" spellcheck="false" value="' + esc(getGithubUpdateSource()) + '" onchange="setUpdateSourceLocation(\'github\',this.value,this)"></div>' +
    '<div class="settings-row update-location-row"><label for="settings-update-server">' + t('settings.serverUpdateSource') + '</label>' +
    '<input id="settings-update-server" type="text" spellcheck="false" value="' + esc(getServerUpdateSource()) + '" onchange="setUpdateSourceLocation(\'server\',this.value,this)"></div>' +
    '<div class="settings-source-help">' + t('settings.updateSourceHelp') + '</div>' +
    '<div class="settings-row"><label for="settings-proxy-enabled">' + t('settings.proxyEnabled') + '</label>' +
    '<input id="settings-proxy-enabled" type="checkbox" onchange="setProxyEnabled(this.checked)"' + (G.settings.proxyEnabled===true?' checked':'') + '></div>' +
    '<div class="settings-row update-location-row"><label for="settings-proxy-url">' + t('settings.proxyAddress') + '</label>' +
    '<input id="settings-proxy-url" type="text" inputmode="url" spellcheck="false" placeholder="http://127.0.0.1:7890" value="' + esc(String(G.settings.proxyUrl || '')) + '" onchange="setProxyUrl(this.value,this)"' + (G.settings.proxyEnabled===true?'':' disabled') + '></div>' +
    '<div class="settings-source-help">' + t('settings.proxyHelp') + '</div>' +
    '<div class="settings-row update-settings-row"><div class="settings-update-copy">' +
      '<span id="settings-update-status" class="settings-help">' + t('update.statusUnknown') + '</span>' +
      '<div id="settings-update-failure" class="settings-update-failure" hidden>' +
        '<span id="settings-update-failure-text"></span>' +
        '<button type="button" id="settings-update-log" class="settings-text-button" hidden onclick="openUpdateFailureLog()">' + t('update.openLog') + '</button>' +
      '</div></div>' +
    '<button class="dialog-btn" id="settings-check-update" onclick="checkForUpdates(true)">' + t('settings.checkUpdates') + '</button></div></div>' +
    '<div class="settings-card settings-history-card"><div class="settings-card-heading"><div><div class="settings-card-title">' + t('settings.releaseHistory') + '</div><div class="settings-card-description">' + t('settings.releaseHistoryHelp') + '</div></div>' +
    '<button class="dialog-btn" id="settings-refresh-history" onclick="loadReleaseHistory(true)">' + t('settings.refreshHistory') + '</button></div>' +
    '<div id="settings-release-history" class="settings-release-history"><div class="settings-history-state">' + t('settings.historyLoading') + '</div></div></div>';

  const shortcuts = '<div class="settings-card settings-shortcut-card">' +
    '<p class="settings-card-description settings-shortcut-help">' + t('settings.shortcutHelp') + '</p>' +
    '<div id="shortcut-config-list" class="settings-config-list shortcut-config-list"></div></div>';

  const data = '<div class="settings-card"><div class="settings-card-title">' + t('settings.dataManagement') + '</div>' +
    '<div class="settings-inline-actions">' +
      '<button class="dialog-btn" onclick="exportAllData()">' + t('btn.export') + '</button>' +
      '<button class="dialog-btn" onclick="importAllData()">' + t('btn.import') + '</button>' +
      '<button class="dialog-btn danger" onclick="clearAllData()">' + t('btn.clearAll') + '</button>' +
    '</div>' +
    '<p class="settings-card-description">' + t('settings.dataHelp') + '</p></div>';

  content.innerHTML =
    settingsPage('general', 'settings.categoryGeneral', 'settings.categoryGeneralDesc', general) +
    settingsPage('appearance', 'settings.categoryAppearance', 'settings.categoryAppearanceDesc', appearance) +
    settingsPage('files', 'settings.categoryFiles', 'settings.categoryFilesDesc', files) +
    settingsPage('preview', 'settings.categoryPreview', 'settings.categoryPreviewDesc', preview) +
    settingsPage('search', 'settings.categorySearch', 'settings.categorySearchDesc', search) +
    settingsPage('integration', 'settings.categoryIntegration', 'settings.categoryIntegrationDesc', integration) +
    settingsPage('updates', 'settings.categoryUpdates', 'settings.categoryUpdatesDesc', updates) +
    settingsPage('shortcuts', 'settings.categoryShortcuts', 'settings.categoryShortcutsDesc', shortcuts) +
    settingsPage('data', 'settings.categoryData', 'settings.categoryDataDesc', data);
  dlg.style.display = "flex";
  const initialSection = localStorage.getItem('rhfiles-settings-section') || 'general';
  switchSettingsSection(initialSection, false);
  renderToolbarConfig();
  renderShortcutConfig();
  updateThemeSettingsControls();
  refreshUpdateSettingsStatus();
  loadReleaseHistory(false);
  if (typeof renderFileDialogIntegrationStatus === 'function') renderFileDialogIntegrationStatus();
  if (typeof refreshFfmpegSettingsStatus === 'function') refreshFfmpegSettingsStatus();
}

function setAutoUpdateEnabled(enabled) {
  G.settings.autoUpdateEnabled = !!enabled;
  saveSettings();
  refreshUpdateSettingsStatus();
  loadReleaseHistory(false);
}

function setUpdateSourceMode(mode) {
  G.settings.updateSourceMode = mode === 'server' ? 'server' : 'github';
  G.settings.updateSource = getUpdateSource();
  saveSettings();
  G._updateStatus = null;
  refreshUpdateSettingsStatus();
  loadReleaseHistory(false);
}

function setUpdateSourceLocation(kind, value, input) {
  const isServer = kind === 'server';
  const fallback = isServer ? DEFAULT_SERVER_UPDATE_SOURCE : DEFAULT_GITHUB_UPDATE_SOURCE;
  const normalized = String(value || '').trim() || fallback;
  if (isServer) G.settings.serverUpdateSource = normalized;
  else G.settings.githubUpdateSource = normalized;
  if (input) input.value = normalized;
  G.settings.updateSource = getUpdateSource();
  saveSettings();
  if ((isServer && G.settings.updateSourceMode === 'server') || (!isServer && G.settings.updateSourceMode !== 'server')) {
    G._updateStatus = null;
    refreshUpdateSettingsStatus();
    loadReleaseHistory(false);
  }
}

function setProxyEnabled(enabled) {
  G.settings.proxyEnabled = !!enabled;
  const input = document.getElementById('settings-proxy-url');
  if (input) input.disabled = !G.settings.proxyEnabled;
  saveSettings();
  refreshUpdateSettingsStatus();
  loadReleaseHistory(false);
}

function setProxyUrl(value, input) {
  const normalized = String(value || '').trim();
  G.settings.proxyUrl = normalized;
  if (input) input.value = normalized;
  saveSettings();
  if (G.settings.proxyEnabled === true) {
    refreshUpdateSettingsStatus();
    loadReleaseHistory(false);
  }
}

let _releaseHistoryRequestToken = 0;
let _releaseHistoryEntries = [];
let _releaseHistorySnapshot = null;

function hydrateReleaseHistoryItem(details) {
  if (!details || details.dataset.loaded === 'true') return;
  const index = Number(details.dataset.releaseIndex);
  const entry = _releaseHistoryEntries[index];
  const body = details.querySelector('.settings-release-notes');
  if (!entry || !body) return;
  body.innerHTML = renderMarkdown(String(entry.notesMarkdown || ''));
  details.dataset.loaded = 'true';
}

function renderReleaseHistory(response) {
  const container = document.getElementById('settings-release-history');
  if (!container) return;
  _releaseHistoryEntries = Array.isArray(response?.releases) ? response.releases : [];
  if (!_releaseHistoryEntries.length) {
    container.innerHTML = `<div class="settings-history-state">${esc(t('settings.historyEmpty'))}</div>`;
    return;
  }
  const currentVersion = String(response.currentVersion || '');
  const sourceLabel = response.source === 'remote' ? t('settings.historyRemote') : t('settings.historyBundled');
  const refreshing = response.refreshing
    ? `<div class="settings-history-refreshing"><span aria-hidden="true"></span>${esc(t('settings.historyRefreshing'))}</div>`
    : '';
  const warning = response.warning
    ? `<div class="settings-history-warning" title="${esc(String(response.warning))}">${esc(t('settings.historyFallback'))}</div>`
    : '';
  container.innerHTML = `<div class="settings-history-source">${esc(sourceLabel)}</div>${refreshing}${warning}` +
    _releaseHistoryEntries.map((entry, index) => {
      const current = String(entry.version) === currentVersion;
      return `<details class="settings-release-item" data-release-index="${index}"${index === 0 ? ' open' : ''}>
        <summary><span class="settings-release-version">v${esc(String(entry.version || ''))}</span>${current ? `<span class="settings-release-current">${esc(t('settings.currentVersion'))}</span>` : ''}</summary>
        <div class="settings-release-notes"></div>
      </details>`;
    }).join('');
  container.querySelectorAll('.settings-release-item').forEach(details => {
    details.addEventListener('toggle', () => { if (details.open) hydrateReleaseHistoryItem(details); });
    if (details.open) hydrateReleaseHistoryItem(details);
  });
}

async function loadReleaseHistory(manual) {
  const container = document.getElementById('settings-release-history');
  if (!container) return;
  const button = document.getElementById('settings-refresh-history');
  const token = ++_releaseHistoryRequestToken;
  const allowRemote = !!manual || isAutomaticUpdateCheckEnabled();
  if (_releaseHistorySnapshot) {
    renderReleaseHistory({..._releaseHistorySnapshot, refreshing:allowRemote});
  } else {
    container.innerHTML = `<div class="settings-history-state">${esc(t('settings.historyLoading'))}</div>`;
  }
  if (button) button.disabled = true;
  let bundled = null;
  try {
    bundled = await withTimeout(call('get_release_history', {
      source: getUpdateSource(),
      proxy: null,
      allowRemote: false,
    }), 5000, 'Bundled release history request timed out');
    if (token !== _releaseHistoryRequestToken) return;
    _releaseHistorySnapshot = bundled;
    renderReleaseHistory({...bundled, refreshing:allowRemote});
  } catch (error) {
    if (token !== _releaseHistoryRequestToken) return;
    if (!_releaseHistorySnapshot) {
      container.innerHTML = `<div class="settings-history-state settings-history-warning" title="${esc(String(error))}">${esc(t('settings.historyFailed'))}</div>`;
    }
  }

  if (allowRemote && token === _releaseHistoryRequestToken) {
    try {
      const response = await withTimeout(call('get_release_history', {
        source: getUpdateSource(),
        proxy: getUpdateProxy(),
        allowRemote: true,
      }), 35000, 'Release history request timed out');
      if (token !== _releaseHistoryRequestToken) return;
      _releaseHistorySnapshot = response;
      renderReleaseHistory(response);
    } catch (error) {
      if (token !== _releaseHistoryRequestToken) return;
      const fallback = bundled || _releaseHistorySnapshot;
      if (fallback) {
        _releaseHistorySnapshot = {...fallback, warning:String(error), refreshing:false};
        renderReleaseHistory(_releaseHistorySnapshot);
      } else {
        container.innerHTML = `<div class="settings-history-state settings-history-warning" title="${esc(String(error))}">${esc(t('settings.historyFailed'))}</div>`;
      }
    }
  }
  if (token === _releaseHistoryRequestToken && button) button.disabled = false;
}

function onThemeSelectChange(val) {
  applyTheme(val);
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
let _diskUsageRefreshTimer = null;
let _diskUsagePendingPath = '';
let _diskUsageRenderedPath = '';
const DISK_USAGE_NAV_REFRESH_DELAY = 180;

function diskUsageTargetPath(path) {
  const requested = path || getActivePaneState()?.path;
  if (!requested) return '';
  return requested === 'home://'
    ? (G.homeDirPath || 'C:\\')
    : normalizeWindowsPathInput(requested);
}

function diskUsagePathsEqual(left, right) {
  return String(left || '').toLocaleLowerCase() === String(right || '').toLocaleLowerCase();
}

function resetDiskUsageSurface(loading) {
  _diskUsageSelected = null;
  _diskUsageRows = [];
  updateDiskUsageActionState();
  const summary = document.getElementById('disk-usage-summary');
  const results = document.getElementById('disk-usage-results');
  if (summary) summary.innerHTML = '';
  if (results) {
    results.innerHTML = loading
      ? `<div class="disk-usage-loading"><span></span>${esc(t('diskUsage.analyzing'))}</div>`
      : '';
  }
}

function pauseDiskUsageAnalysis() {
  if (_diskUsageRefreshTimer) clearTimeout(_diskUsageRefreshTimer);
  _diskUsageRefreshTimer = null;
  _diskUsagePendingPath = '';
  ++_diskUsageToken;
}

function syncDiskUsageWithActiveFolder(path, isRight) {
  if (!G.previewOn || G.inspectorTab !== 'disk') return false;
  const rightActive = G.dualOn && G.lastActivePane === 'right';
  if (typeof isRight === 'boolean' && rightActive !== isRight) return false;
  const nextPath = diskUsageTargetPath(path);
  if (!nextPath) return false;
  const pathChanged = !diskUsagePathsEqual(nextPath, _diskUsagePath);
  if (!pathChanged && (diskUsagePathsEqual(nextPath, _diskUsageRenderedPath) || diskUsagePathsEqual(nextPath, _diskUsagePendingPath))) return false;

  if (_diskUsageRefreshTimer) clearTimeout(_diskUsageRefreshTimer);
  _diskUsageRefreshTimer = null;
  _diskUsagePath = nextPath;
  _diskUsagePendingPath = nextPath;
  ++_diskUsageToken; // invalidate a dust result that belongs to the previous folder
  const pathLabel = document.getElementById('disk-usage-path');
  if (pathLabel) pathLabel.textContent = displayPath(nextPath);
  resetDiskUsageSurface(true);

  _diskUsageRefreshTimer = setTimeout(() => {
    _diskUsageRefreshTimer = null;
    if (!G.previewOn || G.inspectorTab !== 'disk' || !diskUsagePathsEqual(nextPath, _diskUsagePath)) {
      if (diskUsagePathsEqual(nextPath, _diskUsagePendingPath)) _diskUsagePendingPath = '';
      return;
    }
    refreshDiskUsage();
  }, DISK_USAGE_NAV_REFRESH_DELAY);
  return true;
}

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
    {label:t('ctx.open'), icon:'open', action:() => openDiskUsageNode(node)},
    {label:t('ctx.newTab'), icon:'tab', hidden:!isDirectory, action:() => addTab(path)},
    {label:t('sidebar.openLocation'), icon:'location', action:() => revealDiskUsageNode(node)},
    {label:t('ctx.preview'), icon:'preview', hidden:isDirectory, action:async () => { if (await revealDiskUsageNode(node)) switchInspectorTab('preview'); }},
    {label:'-'},
    {label:t('ctx.copyPath'), icon:'path', action:() => copyPathFromMenu(path)},
    {label:t('diskUsage.analyze'), icon:'disk', hidden:!isDirectory, action:() => showDiskUsageDialog(path)},
    {label:t('ctx.openCmd'), icon:'terminal', hidden:!isDirectory, action:() => runContextCommand('open_terminal', {path, terminal:'cmd'}, 'CMD')},
    {label:t('ctx.openPowerShell'), icon:'terminal', hidden:!isDirectory, action:() => runContextCommand('open_terminal', {path, terminal:'powershell'}, 'PowerShell')},
    {label:'-'},
    {label:t('ctx.properties'), icon:'properties', action:() => showPropertiesDialog(path)},
  ], 'disk-usage-context-menu');
}

function renderDiskUsage(data) {
  const results = document.getElementById('disk-usage-results');
  const summary = document.getElementById('disk-usage-summary');
  if (!results || !summary) return;
  const rows = flattenDustTree(data, 0, []);
  _diskUsageRenderedPath = _diskUsagePath;
  _diskUsagePendingPath = '';
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
  if (_diskUsageRefreshTimer) clearTimeout(_diskUsageRefreshTimer);
  _diskUsageRefreshTimer = null;
  const token = ++_diskUsageToken;
  const results = document.getElementById('disk-usage-results');
  const depth = Number(document.getElementById('disk-usage-depth')?.value || 2);
  const analysisPath = _diskUsagePath;
  if (!analysisPath) return;
  _diskUsagePendingPath = analysisPath;
  _diskUsageRenderedPath = '';
  resetDiskUsageSurface(true);
  try {
    const data = await call('analyze_disk_usage', { path:analysisPath, depth, maxEntries:250 });
    if (token !== _diskUsageToken || G.inspectorTab !== 'disk' || !G.previewOn || !diskUsagePathsEqual(analysisPath, _diskUsagePath)) return;
    renderDiskUsage(data);
  } catch (error) {
    if (token !== _diskUsageToken || G.inspectorTab !== 'disk' || !G.previewOn || !diskUsagePathsEqual(analysisPath, _diskUsagePath) || !results) return;
    _diskUsagePendingPath = '';
    results.innerHTML = `<div class="disk-usage-empty"><strong>${esc(t('diskUsage.failed'))}</strong><span>${esc(String(error))}</span></div>`;
  }
}

function showDiskUsageDialog(path) {
  if (_diskUsageRefreshTimer) clearTimeout(_diskUsageRefreshTimer);
  _diskUsageRefreshTimer = null;
  _diskUsagePath = diskUsageTargetPath(path);
  _diskUsagePendingPath = _diskUsagePath;
  ++_diskUsageToken;
  switchInspectorTab('disk');
  document.getElementById('disk-usage-path').textContent = displayPath(_diskUsagePath);
  applyI18n();
  refreshDiskUsage();
}

function activateDiskUsageTab() {
  switchInspectorTab('disk');
  if (!syncDiskUsageWithActiveFolder()) {
    if (!_diskUsagePath) showDiskUsageDialog();
    else document.getElementById('disk-usage-path').textContent = displayPath(_diskUsagePath);
  }
}

function closeDiskUsageDialog() {
  if (G.inspectorTab === 'disk') setInspectorMode('closed', false);
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
  "file.copyPaths": "cmd.copyPaths",
  "file.cut": "cmd.cut",
  "file.paste": "cmd.paste",
  "file.delete": "cmd.delete",
  "file.deletePermanently": "cmd.deletePermanently",
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
  "integration.quickSwitch": "cmd.syncSystemDialog",
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
  if (typeof scheduleFileDialogIntegrationSync === 'function') scheduleFileDialogIntegrationSync(true);
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
