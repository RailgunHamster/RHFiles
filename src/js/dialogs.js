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
    '<select onchange="setLayout(this.value)"><option value="details"' + (G.layout==="details"?" selected":"") + '>Details</option><option value="icons"' + (G.layout==="icons"?" selected":"") + '>Icons</option><option value="cards"' + (G.layout==="cards"?" selected":"") + '>Cards</option><option value="columns"' + (G.layout==="columns"?" selected":"") + '>Columns</option></select></div>' +
    '<div class="settings-row"><label>Show File Extensions</label>' +
    '<input type="checkbox" onchange="G.showExtensions=this.checked;renderFiles(getTab(),\'file-list\',\'status-count\',\'status-selection\')"' + (G.showExtensions!==false?' checked':'') + '></div>' +
    '<div class="settings-row"><label>Grouping</label>' +
    '<select onchange="toggleGrouping(this.value)"><option value="none"' + (G.groupBy==='none'||!G.groupBy?" selected":"") + '>None</option><option value="type"' + (G.groupBy==='type'?" selected":"") + '>By Type</option><option value="date"' + (G.groupBy==='date'?" selected":"") + '>By Date</option><option value="size"' + (G.groupBy==='size'?" selected":"") + '>By Size</option><option value="extension"' + (G.groupBy==='extension'?" selected":"") + '>By Extension</option></select></div>' +
    '<div class="settings-row"><label>Default Terminal</label>' +
    '<select onchange="G.settings.terminal=this.value;saveSettings()"><option value="wt"' + ((G.settings.terminal||'wt')==='wt'?" selected":"") + '>Windows Terminal</option><option value="powershell"' + (G.settings.terminal==='powershell'?" selected":"") + '>PowerShell</option><option value="cmd"' + (G.settings.terminal==='cmd'?" selected":"") + '>Command Prompt</option></select></div>' +
    '<div class="settings-row"><label>Adaptive Layout</label>' +
    '<input type="checkbox" onchange="G.settings.adaptiveLayout=this.checked;saveSettings()"' + (G.settings.adaptiveLayout!==false?' checked':'') + '></div>' +
    '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px"><label>Customize Toolbar</label>' +
    '<div id="toolbar-config-list" style="display:flex;flex-direction:column;gap:4px;max-height:250px;overflow:auto"></div>' +
    '<button class="dialog-btn" onclick="resetToolbarConfig()" style="align-self:flex-start">Reset to Default</button></div>';
  dlg.style.display = "flex";
  renderToolbarConfig();
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
    await call("create_new_file", { path: destPath + "\\" + fileName, content: tmpl ? tmpl.content : "" });
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
