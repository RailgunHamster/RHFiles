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
  content.innerHTML =
    '<div class="settings-row"><label>' + t('settings.language') + '</label>' +
    '<select onchange="setLang(this.value)"><option value="en"' + (_lang==="en"?" selected":"") + '>English</option><option value="zh"' + (_lang==="zh"?" selected":"") + '>' + esc('\u4e2d\u6587') + '</option></select></div>' +
    '<div class="settings-row"><label>' + t('settings.theme') + '</label>' +
    '<select onchange="applyTheme(this.value)"><option value="light"' + (G.theme==="light"?" selected":"") + '>Light</option><option value="dark"' + (G.theme==="dark"?" selected":"") + '>Dark</option></select></div>' +
    '<div class="settings-row"><label>Background Effect</label>' +
    '<select onchange="applyWindowEffect(this.value)"><option value="none"' + (G.windowEffect==="none"||!G.windowEffect?" selected":"") + '>None</option><option value="mica"' + (G.windowEffect==="mica"?" selected":"") + '>Mica</option><option value="acrylic"' + (G.windowEffect==="acrylic"?" selected":"") + '>Acrylic</option><option value="mica-alt"' + (G.windowEffect==="mica-alt"?" selected":"") + '>Mica Alt</option></select></div>' +
    '<div class="settings-row"><label>Layout</label>' +
    '<select onchange="setLayout(this.value)"><option value="details"' + (G.layout==="details"?" selected":"") + '>Details</option><option value="icons"' + (G.layout==="icons"?" selected":"") + '>Icons</option><option value="cards"' + (G.layout==="cards"?" selected":"") + '>Cards</option><option value="columns"' + (G.layout==="columns"?" selected":"") + '>Columns</option></select></div>' +
    '<div class="settings-row"><label>Show File Extensions</label>' +
    '<input type="checkbox" onchange="G.showExtensions=this.checked;renderFiles(getTab(),\'file-list\',\'status-count\',\'status-selection\')"' + (G.showExtensions!==false?' checked':'') + '></div>' +
    '<div class="settings-row"><label>Grouping</label>' +
    '<select onchange="toggleGrouping(this.value)"><option value="none"' + (G.groupBy==='none'||!G.groupBy?" selected":"") + '>None</option><option value="type"' + (G.groupBy==='type'?" selected":"") + '>By Type</option><option value="date"' + (G.groupBy==='date'?" selected":"") + '>By Date</option><option value="size"' + (G.groupBy==='size'?" selected":"") + '>By Size</option><option value="extension"' + (G.groupBy==='extension'?" selected":"") + '>By Extension</option></select></div>' +
    '<div class="settings-row"><label>Default Terminal</label>' +
    '<select onchange="G.settings.terminal=this.value;saveSettings()"><option value="wt"' + ((G.settings.terminal||'wt')==='wt'?" selected":"") + '>Windows Terminal</option><option value="powershell"' + (G.settings.terminal==='powershell'?" selected":"") + '>PowerShell</option><option value="cmd"' + (G.settings.terminal==='cmd'?" selected":"") + '>Command Prompt</option></select></div>';
  dlg.style.display = "flex";
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
