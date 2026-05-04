// common.js — global state, utilities, i18n, API

const invoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;

// --- i18n ---
const I18N = {
  en: { 'cmd.new':'New','cmd.cut':'Cut','cmd.copy':'Copy','cmd.paste':'Paste','cmd.rename':'Rename','cmd.delete':'Delete','cmd.sort':'Sort','cmd.hidden':'Hidden','cmd.refresh':'Refresh','ctx.open':'Open','ctx.openWith':'Open with...','ctx.cut':'Cut','ctx.copy':'Copy','ctx.paste':'Paste','ctx.rename':'Rename','ctx.delete':'Delete','ctx.newFolder':'New Folder','ctx.selectAll':'Select All','ctx.properties':'Properties','ctx.showHidden':'Show hidden items','ctx.hideHidden':'Hide hidden items','ctx.batchRename':'Batch Rename','ctx.addTag':'Add Tag','ctx.extract':'Extract','ctx.extractAll':'Extract All','col.name':'Name','col.modified':'Date modified','col.type':'Type','col.size':'Size','sidebar.tree':'Directory Tree','sidebar.quickAccess':'Quick access','sidebar.thisPC':'This PC','sidebar.tags':'Tags','preview.title':'Preview','preview.selectFile':'Select a file to preview','preview.noPreview':'No preview available','preview.binary':'Binary file','batchRename.title':'Batch Rename','batchRename.find':'Find','batchRename.replace':'Replace','properties.title':'Properties','settings.title':'Settings','settings.language':'Language','settings.theme':'Theme','settings.shortcuts':'Keyboard Shortcuts','tag.manage':'Manage Tags','archive.title':'Archive','btn.cancel':'Cancel','btn.rename':'Rename','btn.ok':'OK','btn.add':'Add','btn.save':'Save' },
  zh: { 'cmd.new':'新建','cmd.cut':'剪切','cmd.copy':'复制','cmd.paste':'粘贴','cmd.rename':'重命名','cmd.delete':'删除','cmd.sort':'排序','cmd.hidden':'隐藏','cmd.refresh':'刷新','ctx.open':'打开','ctx.openWith':'打开方式','ctx.cut':'剪切','ctx.copy':'复制','ctx.paste':'粘贴','ctx.rename':'重命名','ctx.delete':'删除','ctx.newFolder':'新建文件夹','ctx.selectAll':'全选','ctx.properties':'属性','ctx.showHidden':'显示隐藏项','ctx.hideHidden':'隐藏隐藏项','ctx.batchRename':'批量重命名','ctx.addTag':'添加标签','ctx.extract':'解压','ctx.extractAll':'全部解压','col.name':'名称','col.modified':'修改日期','col.type':'类型','col.size':'大小','sidebar.tree':'目录树','sidebar.quickAccess':'快速访问','sidebar.thisPC':'此电脑','sidebar.tags':'标签','preview.title':'预览','preview.selectFile':'选择文件以预览','preview.noPreview':'无预览','preview.binary':'二进制文件','batchRename.title':'批量重命名','batchRename.find':'查找','batchRename.replace':'替换','properties.title':'属性','settings.title':'设置','settings.language':'语言','settings.theme':'主题','settings.shortcuts':'快捷键','tag.manage':'管理标签','archive.title':'压缩文件','btn.cancel':'取消','btn.rename':'重命名','btn.ok':'确定','btn.add':'添加','btn.save':'保存' }
};
let _lang = localStorage.getItem('rhfiles-lang') || 'en';
function t(key) { return (I18N[_lang] && I18N[_lang][key]) || I18N.en[key] || key; }
function setLang(l) { _lang = l; localStorage.setItem('rhfiles-lang', l); applyI18n(); }
function applyI18n() { document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); }); }

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
G.previewOn = false;
G.dualOn = false;
G.gitCache = {};
G.tagCache = {};
G.settings = loadSettings();
G.groupBy = localStorage.getItem('rhfiles-groupBy') || 'none';
G.showExtensions = true;
G.pipMode = false;
G._7zAvailable = false;

G.lastActivePane = 'left';

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
    case "show_native_context_menu": return null;
    case "svn_status": return {};
    case "svn_info": return { url: "", revision: "", author: "", date: "" };
    case "svn_update": return "";
    case "svn_commit": return "";
    case "svn_revert": return null;
    case "svn_add": return null;
    case "svn_log": return [];
    case "svn_checkout": return "";
    case "svn_cleanup": return null;
    case "svn_resolve": return null;
    case "list_ads": return [];
    case "delete_ads": return null;
    case "read_ads": return "";
    case "unblock_file": return null;
    case "toggle_pip": return true;
    case "extract_7z": return null;
    case "create_7z": return null;
    case "is_7z_available": return false;
    case "rtf_to_html": return "<pre style='white-space:pre-wrap'>RTF preview (mock)</pre>";
    case "docx_to_text": return "<pre style='white-space:pre-wrap'>DOCX preview (mock)</pre>";
    case "format_drive": return null;
    case "install_certificate": return null;
    case "set_compat_mode": return null;
    case "get_compat_mode": return "";
    case "log_error": return null;
    case "get_error_logs": return [];
    case "git_clone": return "C:\\repo";
    case "get_cloud_status": return "none";
    case "get_cloud_providers": return [];
    case "cloud_pin_file": return null;
    case "cloud_unpin_file": return null;
    case "cloud_clear_pin": return null;
    case "get_cloud_file_size": return { local_size: 0, cloud_size: 0, is_placeholder: 0 };
    case "browse_network": return [];
    case "list_shares": return [];
    case "ftp_list": return [];
    case "ftp_download": return null;
    case "ftp_upload": return null;
    case "ftp_delete": return null;
    case "ftp_mkdir": return null;
    case "ftp_rename": return null;
    case "sftp_list": return [];
    case "sftp_download": return null;
    case "sftp_upload": return null;
    case "sftp_delete": return null;
    case "sftp_mkdir": return null;
    case "sftp_rename": return null;
    case "get_permissions": return [];
    case "set_permission": return null;
    case "remove_permission": return null;
    case "inherit_permissions": return null;
    case "list_mtp_devices": return [];
    case "get_shell_verbs": return [];
    case "invoke_shell_verb": return null;
    case "cancel_operation": return null;
    case "is_everything_available": return false;
    case "quick_search": return [];
    default: return null;
  }
}

// --- settings persistence ---
function loadSettings() {
  try {
    const s = localStorage.getItem('rhfiles-settings');
    return s ? JSON.parse(s) : { language: 'en', shortcuts: {} };
  } catch (e) { return { language: 'en', shortcuts: {} }; }
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

function addRecentFile(path, name) {
  let recent = JSON.parse(localStorage.getItem('rhfiles-recent') || '[]');
  recent = recent.filter(r => r.path !== path);
  recent.unshift({ path, name, time: Date.now() });
  recent = recent.slice(0, 50);
  localStorage.setItem('rhfiles-recent', JSON.stringify(recent));
}
