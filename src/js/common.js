// common.js — global state, utilities, i18n, API

const invoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;

// --- i18n ---
const _builtinEn = { 'cmd.new':'New','cmd.cut':'Cut','cmd.copy':'Copy','cmd.paste':'Paste','cmd.rename':'Rename','cmd.delete':'Delete','cmd.sort':'Sort','cmd.hidden':'Hidden','cmd.refresh':'Refresh','cmd.goBack':'Go Back','cmd.goForward':'Go Forward','cmd.goUp':'Go Up','cmd.openInto':'Open','cmd.newFolder':'New Folder','cmd.newFile':'New File','cmd.batchRename':'Batch Rename','cmd.properties':'Properties','cmd.manageTags':'Manage Tags','cmd.toggleTheme':'Toggle Theme','cmd.togglePreview':'Toggle Preview','cmd.toggleDualPane':'Toggle Dual Pane','cmd.toggleHidden':'Toggle Hidden','cmd.toggleGrouping':'Toggle Grouping','cmd.togglePip':'Toggle PiP','cmd.layoutDetails':'Details Layout','cmd.layoutIcons':'Icons Layout','cmd.layoutThumbnails':'Thumbnails Layout','cmd.layoutCards':'Cards Layout','cmd.layoutColumns':'Columns Layout','cmd.invertSelection':'Invert Selection','cmd.undo':'Undo','cmd.redo':'Redo','cmd.fullscreen':'Fullscreen','cmd.exportData':'Export Data','cmd.importData':'Import Data','cmd.newWindow':'New Window','cmd.quickLook':'Quick Look','cmd.switchPane':'Switch Pane','ctx.open':'Open','ctx.openWith':'Open with...','ctx.cut':'Cut','ctx.copy':'Copy','ctx.paste':'Paste','ctx.rename':'Rename','ctx.delete':'Delete','ctx.newFolder':'New Folder','ctx.selectAll':'Select All','ctx.properties':'Properties','ctx.showHidden':'Show hidden items','ctx.hideHidden':'Hide hidden items','ctx.batchRename':'Batch Rename','ctx.addTag':'Add Tag','ctx.extract':'Extract','ctx.extractAll':'Extract All','col.name':'Name','col.modified':'Date modified','col.created':'Date created','col.type':'Type','col.size':'Size','sidebar.tree':'Directory Tree','sidebar.quickAccess':'Quick access','sidebar.thisPC':'This PC','sidebar.tags':'Tags','sidebar.recent':'Recent','preview.title':'Preview','preview.selectFile':'Select a file to preview','preview.noPreview':'No preview available','preview.binary':'Binary file','batchRename.title':'Batch Rename','batchRename.find':'Find','batchRename.replace':'Replace','properties.title':'Properties','settings.title':'Settings','settings.language':'Language','settings.theme':'Theme','settings.shortcuts':'Keyboard Shortcuts','tag.manage':'Manage Tags','archive.title':'Archive','btn.cancel':'Cancel','btn.rename':'Rename','btn.ok':'OK','btn.add':'Add','btn.save':'Save','nav.home':'Home','nav.newTab':'New Tab','group.items':'{count} items','notice.pipOn':'PiP mode on','notice.pipOff':'PiP mode off','notice.searchHistoryCleared':'Search history cleared','status.items':'{count} items','status.item':'{count} item','status.folders':'{count} folders','status.folder':'{count} folder','status.files':'{count} files','status.file':'{count} file','status.error':'Error: {error}','status.searching':'Searching...','status.searchError':'Search error: {error}','home.desktop':'Desktop','home.downloads':'Downloads','home.documents':'Documents','home.pictures':'Pictures','home.music':'Music','home.videos':'Videos','home.noRecent':'No recent items','search.placeholder':'Search...','search.quickSearch':'Quick Search','search.modeNormal':'Normal','search.modeRegex':'Regex','search.modeWildcard':'Wildcard','search.modeTooltip':'{mode} mode','search.results':'{count} results','search.builtin':'Built-in','search.everythingNotRunning':'Everything not running','search.downloadEverything':'Download Everything','search.changeEngine':'Change in Settings','search.recent':'Recent','search.clear':'Clear','alert.cannotNavArchive':'Cannot navigate into archive','alert.pipFailed':'PiP failed: {error}','confirm.updateAvailable':'Update {version} available','cloud.synced':'Synced','cloud.onlineOnly':'Online only','cloud.syncing':'Syncing','cloud.locallyAvailable':'Locally available','ctx.moreOptions':'Show more options' };
Object.assign(_builtinEn, {
  'cmd.quickLook': 'Quick Preview',
  'cmd.toggleFavorite': 'Add or remove current folder from Favorites',
  'cmd.nextTab': 'Next Tab',
  'cmd.previousTab': 'Previous Tab',
  'settings.previewDefaultOpen': 'Open preview pane by default',
  'ctx.preview': 'Preview',
  'ctx.extractHere': 'Extract directly into current folder',
  'ctx.extractTo': 'Extract into the "{name}" folder',
  'ctx.playFolderWithVlc': 'Play folder with VLC',
  'ctx.shareQQ': 'QQ',
  'ctx.shareWechat': 'WeChat',
  'ctx.shareFeishu': 'Feishu',
  'ctx.loadingShares': 'Loading shared folders...',
  'ctx.sharesUnavailable': 'Shared folders unavailable',
  'sidebar.favorites': 'Favorites',
  'sidebar.noFavorites': 'No favorites yet',
  'preview.loading': 'Loading preview...',
  'preview.open': 'Open selected item',
  'notice.favoriteAdded': 'Added to Favorites',
  'notice.favoriteRemoved': 'Removed from Favorites',
  'notice.fontInstalled': 'Font installed',
  'notice.pathCopied': 'Path copied',
  'favorites.add': 'Add folder to Favorites',
  'favorites.remove': 'Remove from Favorites',
  'favorites.addCurrent': 'Add current folder to Favorites',
  'favorites.removeCurrent': 'Remove current folder from Favorites',
  'search.scopeFolderTitle': 'Search this folder (click for global search)',
  'search.scopeGlobalTitle': 'Search everywhere (click for folder search)',
  'search.inFolderPlaceholder': 'Search in {folder}',
  'search.globalPlaceholder': 'Search everywhere',
  'search.scopeFolder': 'In {folder}',
  'search.scopeGlobal': 'Everywhere',
  'search.resultCount': '{count} results',
  'typeSearch.loading': '{query} \u00b7 matching names and Pinyin...',
  'typeSearch.hint': '{query} \u00b7 {current}/{total} \u00b7 {next} next, {previous} previous',
  'typeSearch.noMatch': '{query} \u00b7 no matching item',
  'cmd.typeSearchNext': 'Next typed-search match',
  'cmd.typeSearchPrevious': 'Previous typed-search match',
  'cmd.jumpFirst': 'Jump to First Item',
  'cmd.jumpLast': 'Jump to Last Item',
  'cmd.commandPalette': 'Command Palette',
  'cmd.newTab': 'New Tab',
  'cmd.closeTab': 'Close Tab',
  'btn.retry': 'Retry',
  'dialog.permLoading': 'Reading permissions...',
  'dialog.permLoadFailed': 'Unable to read permissions: {error}',
  'dialog.permTimedOut': 'Permission lookup timed out after 10 seconds.',
  'status.openingPowerShell': 'Opening PowerShell...',
  'alert.openPowerShellFailed': 'Failed to open PowerShell: {error}',
  'status.openingProgram': 'Opening {name}...',
  'status.processingAction': '{name}...',
  'status.compressing': 'Compressing {name}...',
  'status.deleting': 'Deleting...',
  'alert.openProgramFailed': 'Failed to open {name}: {error}',
  'alert.openFileFailed': 'Failed to open file: {error}',
  'alert.copyPathFailed': 'Failed to copy path: {error}',
  'alert.actionFailed': '{name} failed: {error}',
  'status.extracting': 'Extracting {name}...',
  'template.textFile': 'Text File',
  'template.htmlFile': 'HTML File',
  'template.jsonFile': 'JSON File',
  'template.markdownFile': 'Markdown File',
  'template.jsFile': 'JavaScript File',
  'template.cssFile': 'CSS File',
  'template.pythonFile': 'Python File',
  'template.rustFile': 'Rust Source File',
  'template.xmlFile': 'XML File',
  'template.yamlFile': 'YAML File',
  'template.shellFile': 'Shell Script',
  'template.batchFile': 'Batch File',
  'cmd.group': 'Group',
  'cmd.toggleSearchScope': 'Toggle folder/global search',
  'ctx.openCmd': 'Open in Command Prompt',
  'ctx.openPowerShell': 'Open in PowerShell',
  'confirm.deleteTitle': 'Move to Recycle Bin',
  'confirm.recycleBinHint': 'You can restore these items from the Recycle Bin.',
  'preview.truncated': 'Large file · preview shortened',
  'preview.truncatedDetail': 'Only the beginning is shown to keep RHFiles responsive ({count} characters total).',
  'preview.image.displayMode': 'Image display mode',
  'preview.image.contain': 'Fit',
  'preview.image.cover': 'Fill',
  'preview.image.width': 'Fit width',
  'preview.image.actual': '1:1',
  'settings.enableGlobalSearch': 'Enable global search',
  'settings.addShortcut': 'Add key binding',
  'settings.removeShortcut': 'Remove last key binding',
  'search.globalDisabledTitle': 'Global search is disabled in Settings',
  'tab.close': 'Close tab',
  'tab.closeOthers': 'Close other tabs',
  'tab.closeRight': 'Close tabs to the right',
  'pane.leftTabs': 'Left pane tabs',
  'pane.right': 'Right pane',
});
const I18N = { en: _builtinEn };
const BUNDLED_I18N_FILES = [
  { code: 'en', name: 'English', url: '/i18n/en.json' },
  { code: 'zh', name: '\u4e2d\u6587', url: '/i18n/zh.json' },
];

function detectDefaultLanguage(languages) {
  const preferred = Array.isArray(languages)
    ? languages
    : (navigator.languages?.length ? navigator.languages : [navigator.language]);
  for (const language of preferred) {
    const normalized = String(language || '');
    if (/^zh(?:-|$)/i.test(normalized)) return 'zh';
    if (/^en(?:-|$)/i.test(normalized)) return 'en';
  }
  return 'en';
}

let _lang = localStorage.getItem('rhfiles-lang') || detectDefaultLanguage();
let _i18nReady = false;

async function initI18n() {
  await Promise.allSettled(BUNDLED_I18N_FILES.map(async file => {
    const resp = await fetch(file.url);
    if (resp.ok) {
      const data = await resp.json();
      const code = data._meta?.code || file.code;
      I18N[code] = data;
      I18N[code]._name = data._meta?.name || file.name || code;
    }
  }));
  _i18nReady = true;
}

function t(key, params) {
  const val = (I18N[_lang] && I18N[_lang][key]) || I18N.en[key] || key;
  if (!params) return val;
  return val.replace(/\{(\w+)\}/g, (_, k) => params[k] !== undefined ? params[k] : '{' + k + '}');
}

function setLang(l) {
  _lang = I18N[l] ? l : 'en';
  localStorage.setItem('rhfiles-lang', _lang);
  applyI18n();
  const settingsDialog = document.getElementById('settings-dialog');
  if (settingsDialog?.style.display === 'flex' && typeof openSettings === 'function') openSettings();
}
function applyI18n() {
  document.documentElement.lang = _lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  if (typeof initCommands === 'function') initCommands();
  if (typeof updateSearchScopeUI === 'function') updateSearchScopeUI();
  if (typeof updateFavoriteButtons === 'function') updateFavoriteButtons();
  if (typeof renderPinnedFolders === 'function') renderPinnedFolders();
  if (typeof renderTabs === 'function' && G?.tabs) renderTabs();
  if (typeof renderFiles === 'function' && typeof getTab === 'function' && getTab()) {
    renderFiles(getTab(), 'file-list', 'status-count', 'status-selection');
    if (G.dualOn) renderFiles(G.rp, 'right-file-list', 'right-status-count', null, true);
  }
  if (document.getElementById('home-page')?.style.display !== 'none' && typeof showHomePage === 'function') showHomePage();
}
function getAvailableLanguages() {
  const langs = [{ code: 'en', name: 'English' }];
  for (const [code, data] of Object.entries(I18N)) {
    if (code === 'en') continue;
    langs.push({ code, name: data._name || data._meta?.name || code });
  }
  return langs;
}

// --- state ---
let G = {};
window.G = G;
G.tabs = [{ id: 0, path: "C:\\", history: [], historyIdx: -1, entries: [], sel: new Set(), lastIdx: -1, sortF: "name", sortAsc: true }];
G.activeTab = 0;
G.nextTabId = 1;
G.sortField = "name";
G.sortAsc = true;
G.showHidden = false;
G.clipboard = null;
G.layout = localStorage.getItem('rhfiles-layout') || 'details';
G.settings = loadSettings();
G.previewOn = G.settings.previewDefaultOpen !== false;
G.dualOn = false;
G.gitCache = {};
G.tagCache = {};
G.groupBy = localStorage.getItem('rhfiles-groupBy') || 'none';
G.showExtensions = true;
G.pipMode = false;
G._7zAvailable = false;

G.lastActivePane = 'left';

G._typeSearch = { str: '', lastQuery: '', timer: null, matches: [], matchPos: -1, requestToken: 0, isRight: false };

// --- right pane state ---
G.rp = { path: "C:\\", entries: [], sel: new Set(), lastIdx: -1, sortF: "name", sortAsc: true, history: ["C:\\"], histIdx: 0 };
G.windowLabel = null;

// --- tab helpers ---
function getTab(id) {
  const tid = id !== undefined ? id : G.activeTab;
  return G.tabs.find(t => t.id === tid);
}

// --- utilities ---
function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function escAttr(s) { return String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

// Keep Windows paths untouched for filesystem operations and clipboard actions,
// but present them with web-style separators. An UNC prefix therefore stays
// visibly doubled: //server/share instead of the misleading /server/share.
function displayPath(path) {
  if (path === 'home://') return t('nav.home');
  return String(path || '').replace(/\\/g, '/');
}

function formatFileDate(timestamp, fallback) {
  const value = Number(timestamp);
  let date = Number.isFinite(value) && value > 0
    ? new Date(value < 100000000000 ? value * 1000 : value)
    : null;
  if (!date && fallback) {
    const text = String(fallback).trim();
    const parts = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(text);
    date = parts
      ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), Number(parts[4] || 0), Number(parts[5] || 0))
      : new Date(text);
  }
  if (!date) return fallback || '';
  if (Number.isNaN(date.getTime())) return fallback || '';
  const pad = part => String(part).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const time = pad(date.getHours()) + ':' + pad(date.getMinutes());
  return _lang === 'zh'
    ? year + '年' + month + '月' + day + '日 ' + time
    : month + '/' + day + '/' + year + ' ' + time;
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes < 1099511627776) return (bytes / 1073741824).toFixed(1) + " GB";
  return (bytes / 1099511627776).toFixed(1) + " TB";
}

// --- API ---
async function call(cmd, args) {
  if (invoke) return invoke(cmd, args || {});
  return fallbackCall(cmd, args || {});
}

function parentFolderPath(path) {
  const normalized = String(path || '').replace(/\//g, '\\');
  if (/^[A-Za-z]:\\$/.test(normalized)) return normalized;
  const clean = normalized.replace(/\\+$/, '');
  const idx = clean.lastIndexOf('\\');
  if (idx === 2 && /^[A-Za-z]:/.test(clean)) return clean.slice(0, 3);
  return idx > 0 ? clean.slice(0, idx) : clean;
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || "Operation timed out")), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout])
    .finally(() => { if (timer !== null) clearTimeout(timer); });
}

function fallbackCall(cmd, args) {
  const mockFiles = [
    { name:"Documents", path:"C:\\Documents", extension:"", is_dir:true, is_hidden:false, size:0, size_display:"", modified:"2025-12-10 14:22", created:"" },
    { name:"Downloads", path:"C:\\Downloads", extension:"", is_dir:true, is_hidden:false, size:0, size_display:"", modified:"2025-12-09 09:15", created:"" },
    { name:".gitconfig", path:"C:\\.gitconfig", extension:"gitconfig", is_dir:false, is_hidden:true, size:256, size_display:"256 B", modified:"2025-11-01 08:00", created:"" },
    { name:"file1.txt", path:"C:\\file1.txt", extension:"txt", is_dir:false, is_hidden:false, size:1234, size_display:"1.2 KB", modified:"2025-12-08 18:30", created:"" },
    { name:"image.png", path:"C:\\image.png", extension:"png", is_dir:false, is_hidden:false, size:567890, size_display:"567.9 KB", modified:"2025-11-20 11:45", created:"" },
    { name:"project", path:"C:\\project", extension:"", is_dir:true, is_hidden:false, size:0, size_display:"", modified:"2025-12-07 16:00", created:"" },
    { name:"readme.md", path:"C:\\readme.md", extension:"md", is_dir:false, is_hidden:false, size:2048, size_display:"2.0 KB", modified:"2025-12-10 10:30", created:"" },
    { name:"archive.zip", path:"C:\\archive.zip", extension:"zip", is_dir:false, is_hidden:false, size:1048576, size_display:"1.0 MB", modified:"2025-06-15 08:00", created:"" },
    { name:"config.toml", path:"C:\\config.toml", extension:"toml", is_dir:false, is_hidden:false, size:512, size_display:"512 B", modified:"2025-12-01 20:12", created:"" },
    { name:"src", path:"C:\\src", extension:"", is_dir:true, is_hidden:false, size:0, size_display:"", modified:"2025-12-11 07:44", created:"" },
    { name:"data.json", path:"C:\\data.json", extension:"json", is_dir:false, is_hidden:false, size:32768, size_display:"32.0 KB", modified:"2025-12-05 13:22", created:"" },
    { name:"main.rs", path:"C:\\main.rs", extension:"rs", is_dir:false, is_hidden:false, size:4096, size_display:"4.0 KB", modified:"2025-12-11 09:15", created:"" },
    { name:"video.mp4", path:"C:\\video.mp4", extension:"mp4", is_dir:false, is_hidden:false, size:52428800, size_display:"50.0 MB", modified:"2025-09-05 12:00", created:"" },
  ];
  const mockDrives = [
    { letter:"C:", label:"Windows", free:"45.2 GB free / 256.0 GB", path:"C:\\" },
    { letter:"D:", label:"Data", free:"120.5 GB free / 512.0 GB", path:"D:\\" },
  ];
  switch (cmd) {
    case "list_dir": return mockFiles;
    case "get_drives": return mockDrives;
    case "parent_path": return "C:\\";
    case "get_dir_tree": return mockFiles.filter(f=>f.is_dir).map(f=>({name:f.name,path:f.path,has_children:true,is_hidden:false}));
    case "get_env": return args.key==="USERPROFILE"?"C:\\Users\\User":null;
    case "read_file_preview": return {preview_type:"text",text_content:"Mock preview content.",image_data:null,size:1024};
    case "git_status": return {};
    case "load_file_tags": return [];
    case "load_all_tags": return {};
    case "get_file_info": return {name:"file.txt",path:"C:\\file.txt",extension:"txt",is_dir:false,size:1024,size_display:"1 KB",modified:"2025-12-10 14:22",created:"2025-11-01 08:00",readonly:false};
    case "folder_size": return 0;
    case "compute_hash": return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    case "open_terminal": return null;
    case "get_file_icon": return null;
    case "get_new_file_templates": return [
      { name:"Text File", ext:".txt", content:"" },
      { name:"HTML File", ext:".html", content:"<!DOCTYPE html>\n<html>\n<head><title></title></head>\n<body>\n\n</body>\n</html>" },
      { name:"JSON File", ext:".json", content:"{\n  \n}" },
      { name:"Markdown File", ext:".md", content:"# Title\n\n" },
      { name:"JavaScript File", ext:".js", content:"// \n" },
      { name:"CSS File", ext:".css", content:"/* */\n" },
      { name:"Python File", ext:".py", content:"# -*- coding: utf-8 -*-\n\n" },
      { name:"Batch File", ext:".bat", content:"@echo off\n\n" },
    ];
    case "create_new_file": return null;
    case "get_file_association": return { name:"Unknown" };
    case "run_as_admin": return null;
    case "empty_recycle_bin": return null;
    case "rotate_image": return null;
    case "read_shortcut": return { target:"C:\\target.exe", args:"", work_dir:"" };
    case "detect_ides": return [{ name:"VS Code", path:"code.cmd" }];
    case "open_in_ide": return null;
    case "install_font": return null;
    case "set_wallpaper": return null;
    case "set_file_readonly": return null;
    case "git_branches": return [{ name:"main", is_current:true }, { name:"develop", is_current:false }];
    case "git_checkout": return null;
    case "git_create_branch": return null;
    case "git_init": return null;
    case "create_archive": return null;
    case "create_shortcut": return null;
    case "open_new_window": window.open(location.href, '_blank'); return null;
    case "get_window_label": return "main";
    case "save_window_state": return null;
    case "load_window_state": return null;
    case "get_all_window_states": return [];
    case "delete_window_state": return null;
    case "save_current_window_geometry": return null;
    case "restore_window_geometry": return null;
    case "cleanup_stale_windows": return null;
    case "set_window_effect": return null;
    case "quicklook": return null;
    case "check_updates": return null;
    case "db_save_tags": return null;
    case "db_load_tags": return [];
    case "db_load_all_tags": return {};
    case "db_save_layout": return null;
    case "db_load_layout": return null;
    case "db_save_pinned": return null;
    case "db_load_pinned": return [];
    case "db_export_all": return {};
    case "db_import_all": return null;
    case "db_clear_all": return null;
    case "db_add_recent": return null;
    case "invoke_context_menu_command": return null;
    case "open_with_program": return null;
    case "get_permissions": return [];
    case "set_permission": return null;
    case "remove_permission": return null;
    case "inherit_permissions": return null;
    case "copy_file_path": return null;
    case "show_open_with_dialog": return null;
    case "compress_with": return null;
    case "share_file": return null;
    case "cancel_operation": return null;
    case "is_everything_available": return false;
    case "quick_search": return [];
    case "search_recursive": return [];
    case "pinyin_aliases": return (args.names || []).map(() => []);
    default: return null;
  }
}

// --- settings persistence ---
function loadSettings() {
  const defaults = {
    language: 'en',
    shortcuts: {},
    previewDefaultOpen: true,
    globalSearchEnabled: true,
    imagePreviewMode: 'contain',
  };
  try {
    const s = localStorage.getItem('rhfiles-settings');
    return s ? { ...defaults, ...JSON.parse(s) } : defaults;
  } catch (e) { return defaults; }
}
function saveSettings() {
  localStorage.setItem('rhfiles-settings', JSON.stringify(G.settings));
}

// --- tab persistence ---
function saveTabState() {
  try {
    const listEl = document.getElementById("file-list");
    const state = {
      activeTab: G.activeTab,
      tabs: G.tabs.map(t => ({
        id: t.id,
        path: t.path,
        selPaths: [...(t.sel || [])].map(i => t.entries[i]?.path).filter(Boolean),
        scrollTop: listEl && t.id === G.activeTab ? listEl.scrollTop : (t._savedState?.scrollTop || 0),
        sortF: t.sortF,
        sortAsc: t.sortAsc,
      })),
    };
    localStorage.setItem('rhfiles-tabs', JSON.stringify(state));
  } catch (e) {}
}
function loadTabState() {
  try {
    const s = localStorage.getItem('rhfiles-tabs');
    if (!s) return null;
    return JSON.parse(s);
  } catch (e) { return null; }
}

// --- file watching ---
G._watchSnapshot = null;
G._watchTimer = null;
G._watchTauriUnlisten = null;
G._watchDebounce = null;
function startFileWatch() {
  stopFileWatch();
  if (window.__TAURI_INTERNALS__) {
    const { listen } = window.__TAURI_INTERNALS__.event || {};
    if (listen) {
      listen("fs-change", () => {
        if (G._watchDebounce) clearTimeout(G._watchDebounce);
        G._watchDebounce = setTimeout(() => {
          const tab = getTab();
          if (tab && tab.path) navigateTo(tab.path, false);
          G._watchDebounce = null;
        }, 300);
      }).then(unlisten => { G._watchTauriUnlisten = unlisten; }).catch(() => {});
    }
  }
  G._watchTimer = setInterval(async () => {
    if (document.hidden) return;
    const tab = getTab();
    if (!tab || !tab.entries) return;
    try {
      const entries = await call("list_dir", { path: tab.path, filter: "" });
      let snap = "";
      for (let i = 0; i < entries.length; i++) {
        snap += entries[i].name;
        snap += "|";
      }
      if (G._watchSnapshot && snap !== G._watchSnapshot) {
        G._watchSnapshot = snap;
        await navigateTo(tab.path, false);
      } else {
        G._watchSnapshot = snap;
      }
    } catch (e) {}
  }, 2000);
}
function stopFileWatch() {
  if (G._watchTimer) { clearInterval(G._watchTimer); G._watchTimer = null; }
  if (G._watchTauriUnlisten) { G._watchTauriUnlisten(); G._watchTauriUnlisten = null; }
}

let _recentRefreshTimer = null;
function addRecentFile(path, name, isDir, ext) {
  call("db_add_recent", {
    path,
    name,
    isDir: !!isDir,
    ext: ext || "",
  }).catch(() => {});
  if (!_recentRefreshTimer) {
    _recentRefreshTimer = setTimeout(() => {
      _recentRefreshTimer = null;
      if (typeof loadRecentList === 'function') loadRecentList();
    }, 3000);
  }
}
