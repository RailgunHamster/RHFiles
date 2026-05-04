// icons.js — file icons with 4 modes: builtin, fluent, system, mixed

const _iconCache = new Map();
const _iconCacheOrder = [];
const ICON_CACHE_MAX = 500;

function getIconMode() {
  return G.settings.iconMode || 'builtin';
}

function clearIconCache() {
  _iconCache.clear();
  _iconCacheOrder.length = 0;
}

async function getSystemIcon(path, size) {
  size = size || 16;
  if (_iconCache.has(path)) return _iconCache.get(path);
  try {
    const data = await call("get_file_icon", { path, size });
    if (data) {
      if (_iconCache.size >= ICON_CACHE_MAX) {
        const old = _iconCacheOrder.shift();
        if (old) _iconCache.delete(old);
      }
      _iconCache.set(path, data);
      _iconCacheOrder.push(path);
      return data;
    }
  } catch (e) {}
  return null;
}

function fileIcon(file, forPreview) {
  const mode = getIconMode();
  if (mode === 'system') return _systemIconSync(file, forPreview);
  if (mode === 'mixed') return _mixedIcon(file, forPreview);
  if (mode === 'fluent') return _fluentIcon(file, forPreview);
  return _builtinIcon(file, forPreview);
}

function _systemIconSync(file, forPreview) {
  const path = file.path || '';
  const cached = _iconCache.get(path);
  if (cached) return `<img src="data:image/png;base64,${cached}" style="width:16px;height:16px;vertical-align:middle" alt="">`;
  if (window.__TAURI_INTERNALS__) {
    getSystemIcon(path, forPreview ? 32 : 16).then(() => {
      const listId = G.lastActivePane === 'right' ? "right-file-list" : "file-list";
      const el = document.getElementById(listId);
      if (el) {
        const imgs = el.querySelectorAll(`img[data-icon-path="${CSS.escape(path)}"]`);
        imgs.forEach(img => {
          const data = _iconCache.get(path);
          if (data) img.src = `data:image/png;base64,${data}`;
        });
      }
    });
  }
  return `<img data-icon-path="${esc(path)}" style="width:16px;height:16px;vertical-align:middle;opacity:.3" alt="">`;
}

function _mixedIcon(file, forPreview) {
  const ext = (file.extension || '').toLowerCase();
  const useSystem = ['exe','msi','dll','lnk','bat','cmd','ps1','com'].includes(ext) || file.is_dir;
  if (useSystem) return _systemIconSync(file, forPreview);
  return _fluentIcon(file, forPreview);
}

// === BUILTIN: Rich hand-crafted SVGs ===

function _builtinIcon(file, forPreview) {
  if (file.is_dir) return _iconFolder();
  const ext = (file.extension || '').toLowerCase();
  if (_IMAGE_EXT.has(ext)) return _iconImage(ext);
  if (_AUDIO_EXT.has(ext)) return _iconAudio(ext);
  if (_VIDEO_EXT.has(ext)) return _iconVideo(ext);
  if (_ARCHIVE_EXT.has(ext)) return _iconArchive(ext);
  if (_CODE_EXT.has(ext)) return _iconCode(ext);
  if (_DOC_EXT.has(ext)) return _iconDoc(ext);
  if (_WEB_EXT.has(ext)) return _iconWeb(ext);
  if (_CONFIG_EXT.has(ext)) return _iconConfig(ext);
  if (_FONT_EXT.has(ext)) return _iconFont();
  if (_DB_EXT.has(ext)) return _iconDb();
  if (ext === 'pdf') return _iconPdf();
  if (ext === 'txt') return _iconText();
  if (ext === 'md') return _iconMarkdown();
  if (['exe','msi','dll','com'].includes(ext)) return _iconExe();
  if (['lnk','url'].includes(ext)) return _iconShortcut();
  if (['ttf','otf','woff','woff2'].includes(ext)) return _iconFont();
  return _iconGeneric();
}

const _IMAGE_EXT = new Set(['png','jpg','jpeg','gif','bmp','svg','webp','ico','tiff','tif','raw','heic','avif']);
const _AUDIO_EXT = new Set(['mp3','wav','flac','aac','ogg','wma','m4a','opus','aiff']);
const _VIDEO_EXT = new Set(['mp4','mkv','avi','mov','wmv','flv','webm','m4v','3gp','ts']);
const _ARCHIVE_EXT = new Set(['zip','rar','7z','tar','gz','bz2','xz','zst','cab','iso','dmg']);
const _CODE_EXT = new Set(['js','ts','jsx','tsx','py','rs','go','rb','java','c','cpp','h','hpp','cs','swift','kt','lua','r','pl','sh','bat','ps1','php','dart','zig','nim','scala','hs','ex','exs','vue','svelte']);
const _DOC_EXT = new Set(['doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','rtf','csv']);
const _WEB_EXT = new Set(['html','htm','css','scss','sass','less']);
const _CONFIG_EXT = new Set(['json','toml','yaml','yml','xml','ini','cfg','conf','env','properties','gradle','cmake','make']);
const _FONT_EXT = new Set(['ttf','otf','woff','woff2','eot']);
const _DB_EXT = new Set(['sql','db','sqlite','sqlite3','mdb','accdb']);

function _iconFolder() {
  return '<svg viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5h4.5L7.5 6h7v7h-13V4.5z" fill="#dcb67a" fill-opacity=".25" stroke="#dcb67a" stroke-width=".9" stroke-linejoin="round"/><path d="M1.5 6.5h13" stroke="#dcb67a" stroke-width=".7" opacity=".4"/></svg>';
}

function _iconImage(ext) {
  const c = '#4caf50';
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 2h9a1 1 0 011 1v10a1 1 0 01-1 1h-9a1 1 0 01-1-1V3a1 1 0 011-1z" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-width=".8"/><circle cx="5.5" cy="5.5" r="1.3" stroke="${c}" stroke-width=".7" fill="${c}" fill-opacity=".3"/><path d="M2.5 11.5l3-3 2 2 2.5-3 3.5 4" stroke="${c}" stroke-width=".8" stroke-linejoin="round"/></svg>`;
}

function _iconAudio(ext) {
  const c = '#e91e63';
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 2h9a1 1 0 011 1v10a1 1 0 01-1 1h-9a1 1 0 01-1-1V3a1 1 0 011-1z" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-width=".8"/><path d="M6 12a2 2 0 01-2-2M10 11a2 2 0 01-2-2" stroke="${c}" stroke-width=".8" stroke-linecap="round"/><path d="M7 11V4.5L11 3v6.5" stroke="${c}" stroke-width=".7" stroke-linejoin="round"/><circle cx="6" cy="11" r="1.2" fill="${c}" fill-opacity=".4"/><circle cx="10" cy="10" r="1.2" fill="${c}" fill-opacity=".4"/></svg>`;
}

function _iconVideo(ext) {
  const c = '#9c27b0';
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 2h9a1 1 0 011 1v10a1 1 0 01-1 1h-9a1 1 0 01-1-1V3a1 1 0 011-1z" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-width=".8"/><path d="M6.5 6v4l3.5-2z" fill="${c}" fill-opacity=".6"/></svg>`;
}

function _iconArchive(ext) {
  const c = '#795548';
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 2h9a1 1 0 011 1v10a1 1 0 01-1 1h-9a1 1 0 01-1-1V3a1 1 0 011-1z" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-width=".8"/><path d="M6.5 2v12M9.5 2v12" stroke="${c}" stroke-width=".5" opacity=".3"/><rect x="6" y="5" width="4" height="2.5" rx=".3" stroke="${c}" stroke-width=".6" fill="${c}" fill-opacity=".15"/><circle cx="8" cy="11" r="1" stroke="${c}" stroke-width=".6" fill="${c}" fill-opacity=".3"/></svg>`;
}

function _iconCode(ext) {
  const colors = {rs:'#dea584',py:'#3776ab',js:'#f0db4f',ts:'#3178c6',jsx:'#61dafb',tsx:'#3178c6',java:'#b07219',go:'#00add8',rb:'#cc342d',c:'#555',cpp:'#659ad2',h:'#555',hpp:'#659ad2',cs:'#9b4993',swift:'#ffac45',kt:'#a97bff',lua:'#00007c',php:'#777bb4',dart:'#0175c2',sh:'#4eaa25',bat:'#ccc',ps1:'#0078d4',vue:'#42b883',svelte:'#ff3e00',zig:'#f7a41d',dart:'#0175c2'};
  const c = colors[ext] || '#0078d4';
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M4.5 1.5h4.6l3.4 3.4v9.6a1 1 0 01-1 1h-7a1 1 0 01-1-1v-13a1 1 0 011-1z" fill="${c}" fill-opacity=".08" stroke="${c}" stroke-width=".8"/><path d="M9 1.5V5h3.5" stroke="${c}" stroke-width=".8"/><path d="M5.5 8.5l-1.5 1.5 1.5 1.5M10.5 8.5l1.5 1.5-1.5 1.5M8.5 7.5l-1 5" stroke="${c}" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function _iconDoc(ext) {
  const colors = {doc:'#2b579a',docx:'#2b579a',xls:'#217346',xlsx:'#217346',ppt:'#d24726',pptx:'#d24726',odt:'#0078d4',ods:'#0078d4',odp:'#0078d4',rtf:'#666',csv:'#217346'};
  const c = colors[ext] || '#2b579a';
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M4.5 1.5h4.6l3.4 3.4v9.6a1 1 0 01-1 1h-7a1 1 0 01-1-1v-13a1 1 0 011-1z" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-width=".8"/><path d="M9 1.5V5h3.5" stroke="${c}" stroke-width=".8"/><path d="M6 7h4M6 9h4M6 11h3" stroke="${c}" stroke-width=".6" stroke-linecap="round" opacity=".5"/></svg>`;
}

function _iconWeb(ext) {
  const c = ext === 'html' ? '#e34c26' : ext === 'css' ? '#264de4' : ext === 'scss' ? '#cf649a' : '#f06529';
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 2h9a1 1 0 011 1v10a1 1 0 01-1 1h-9a1 1 0 01-1-1V3a1 1 0 011-1z" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-width=".8"/><path d="M5.5 7.5l2 4 3-7" stroke="${c}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function _iconConfig(ext) {
  const c = ext === 'json' ? '#5b5b5b' : ext === 'toml' ? '#9c4221' : ext === 'xml' ? '#e37933' : '#666';
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 2h9a1 1 0 011 1v10a1 1 0 01-1 1h-9a1 1 0 01-1-1V3a1 1 0 011-1z" fill="${c}" fill-opacity=".08" stroke="${c}" stroke-width=".8"/><path d="M5.5 6l1.5 2-1.5 2M8.5 6l1.5 2-1.5 2M10 6h.5M10 10h.5" stroke="${c}" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function _iconPdf() {
  return '<svg viewBox="0 0 16 16" fill="none"><path d="M4.5 1.5h4.6l3.4 3.4v9.6a1 1 0 01-1 1h-7a1 1 0 01-1-1v-13a1 1 0 011-1z" fill="#d32f2f" fill-opacity=".1" stroke="#d32f2f" stroke-width=".8"/><path d="M9 1.5V5h3.5" stroke="#d32f2f" stroke-width=".8"/><text x="8" y="10.5" text-anchor="middle" font-size="3.5" font-weight="600" fill="#d32f2f" font-family="sans-serif">PDF</text></svg>';
}

function _iconText() {
  return '<svg viewBox="0 0 16 16" fill="none"><path d="M4.5 1.5h4.6l3.4 3.4v9.6a1 1 0 01-1 1h-7a1 1 0 01-1-1v-13a1 1 0 011-1z" fill="#666" fill-opacity=".06" stroke="#666" stroke-width=".8"/><path d="M9 1.5V5h3.5" stroke="#666" stroke-width=".8"/><path d="M5.5 7h5M5.5 9h5M5.5 11h3" stroke="#666" stroke-width=".5" stroke-linecap="round" opacity=".4"/></svg>';
}

function _iconMarkdown() {
  return '<svg viewBox="0 0 16 16" fill="none"><path d="M4.5 1.5h4.6l3.4 3.4v9.6a1 1 0 01-1 1h-7a1 1 0 01-1-1v-13a1 1 0 011-1z" fill="#666" fill-opacity=".06" stroke="#666" stroke-width=".8"/><path d="M9 1.5V5h3.5" stroke="#666" stroke-width=".8"/><path d="M5 11V7l2 2 2-2v4" stroke="#666" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 7v4" stroke="#666" stroke-width=".7" stroke-linecap="round"/><path d="M11 7l1 1M11 7l-1 1" stroke="#666" stroke-width=".5" stroke-linecap="round"/></svg>';
}

function _iconExe() {
  return '<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 2h9a1 1 0 011 1v10a1 1 0 01-1 1h-9a1 1 0 01-1-1V3a1 1 0 011-1z" fill="#0078d4" fill-opacity=".1" stroke="#0078d4" stroke-width=".8"/><rect x="5" y="4" width="6" height="6" rx="1" stroke="#0078d4" stroke-width=".7" fill="#0078d4" fill-opacity=".1"/><path d="M8 5.5v3M6.5 7h3" stroke="#0078d4" stroke-width=".6" stroke-linecap="round"/><path d="M5 12.5h6" stroke="#0078d4" stroke-width=".6" stroke-linecap="round" opacity=".4"/></svg>';
}

function _iconShortcut() {
  return '<svg viewBox="0 0 16 16" fill="none"><path d="M4.5 1.5h4.6l3.4 3.4v9.6a1 1 0 01-1 1h-7a1 1 0 01-1-1v-13a1 1 0 011-1z" fill="#2196f3" fill-opacity=".08" stroke="#2196f3" stroke-width=".8"/><path d="M9 1.5V5h3.5" stroke="#2196f3" stroke-width=".8"/><path d="M7 7l3.5 3.5M10 8v3H7" stroke="#2196f3" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function _iconFont() {
  return '<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 2h9a1 1 0 011 1v10a1 1 0 01-1 1h-9a1 1 0 01-1-1V3a1 1 0 011-1z" fill="#9c27b0" fill-opacity=".08" stroke="#9c27b0" stroke-width=".8"/><text x="8" y="11" text-anchor="middle" font-size="7" font-weight="700" fill="#9c27b0" font-family="serif">A</text></svg>';
}

function _iconDb() {
  return '<svg viewBox="0 0 16 16" fill="none"><path d="M3 4.5c0-1.4 2.2-2.5 5-2.5s5 1.1 5 2.5" stroke="#ff9800" stroke-width=".8"/><ellipse cx="8" cy="4.5" rx="5" ry="2.5" fill="#ff9800" fill-opacity=".1" stroke="#ff9800" stroke-width=".8"/><path d="M3 4.5v7c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-7" stroke="#ff9800" stroke-width=".8"/><path d="M3 8c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5" stroke="#ff9800" stroke-width=".6" opacity=".5"/></svg>';
}

function _iconGeneric() {
  return '<svg viewBox="0 0 16 16" fill="none"><path d="M4.5 1.5h4.6l3.4 3.4v9.6a1 1 0 01-1 1h-7a1 1 0 01-1-1v-13a1 1 0 011-1z" stroke="#888" stroke-width=".8"/><path d="M9 1.5V5h3.5" stroke="#888" stroke-width=".8"/></svg>';
}

// === FLUENT UI style — cleaner, Win11 inspired ===

function _fluentIcon(file, forPreview) {
  if (file.is_dir) return _fluentFolder();
  const ext = (file.extension || '').toLowerCase();
  if (_IMAGE_EXT.has(ext)) return _fluentImage();
  if (_AUDIO_EXT.has(ext)) return _fluentAudio();
  if (_VIDEO_EXT.has(ext)) return _fluentVideo();
  if (_ARCHIVE_EXT.has(ext)) return _fluentArchive();
  if (_CODE_EXT.has(ext)) return _fluentCode(ext);
  if (_DOC_EXT.has(ext)) return _fluentDoc();
  if (_WEB_EXT.has(ext)) return _fluentWeb();
  if (_CONFIG_EXT.has(ext)) return _fluentConfig();
  if (_FONT_EXT.has(ext)) return _fluentFont();
  if (_DB_EXT.has(ext)) return _fluentDb();
  if (ext === 'pdf') return _fluentPdf();
  if (ext === 'txt') return _fluentText();
  if (ext === 'md') return _fluentMarkdown();
  if (['exe','msi','dll','com'].includes(ext)) return _fluentExe();
  if (['lnk','url'].includes(ext)) return _fluentShortcut();
  return _fluentGeneric();
}

function _fluentFolder() {
  return '<svg viewBox="0 0 16 16" fill="none"><path d="M1 5.5V12a2 2 0 002 2h10a2 2 0 002-2V5.5H1z" fill="#FFB900"/><path d="M1 5.5V4a2 2 0 012-2h3.17a1 1 0 01.7.3L8.3 3.7a1 1 0 00.7.3H13a2 2 0 012 2v1.5H1z" fill="#FFD75E"/></svg>';
}

function _fluentImage() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#E8544E" fill-opacity=".12"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#E8544E" stroke-width=".8"/><circle cx="5.5" cy="5.5" r="1.5" fill="#E8544E" opacity=".5"/><path d="M2 11l3-3 2.5 2.5L10 8l4 4v1a2 2 0 01-2 2H4a2 2 0 01-2-2v-2z" fill="#E8544E" opacity=".3"/></svg>';
}

function _fluentAudio() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#9c27b0" fill-opacity=".1"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#9c27b0" stroke-width=".8"/><path d="M7 4v5.3a2 2 0 101 1.7V6l3-1v3.3a2 2 0 101 1.7V3l-5 1z" fill="#9c27b0" opacity=".6"/></svg>';
}

function _fluentVideo() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="2" fill="#0078d4" fill-opacity=".1"/><rect x="2" y="3" width="12" height="10" rx="2" stroke="#0078d4" stroke-width=".8"/><path d="M6.5 6v4l3.5-2z" fill="#0078d4" opacity=".6"/></svg>';
}

function _fluentArchive() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#795548" fill-opacity=".1"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#795548" stroke-width=".8"/><path d="M6 2v12M10 2v12" stroke="#795548" stroke-width=".4" opacity=".3"/><rect x="6.5" y="4.5" width="3" height="2" rx=".5" stroke="#795548" stroke-width=".6"/><circle cx="8" cy="10" r=".8" fill="#795548" opacity=".5"/></svg>';
}

function _fluentCode(ext) {
  const colors = {rs:'#dea584',py:'#3776ab',js:'#f0db4f',ts:'#3178c6',java:'#b07219',go:'#00add8',rb:'#cc342d',c:'#555',cpp:'#659ad2',cs:'#9b4993',swift:'#ffac45',kt:'#a97bff',php:'#777bb4',vue:'#42b883',svelte:'#ff3e00',sh:'#4eaa25',bat:'#ccc',ps1:'#0078d4'};
  const c = colors[ext] || '#0078d4';
  return `<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="${c}" fill-opacity=".06"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="${c}" stroke-width=".8"/><path d="M6 6L3.5 8 6 10M10 6l2.5 2L10 10" stroke="${c}" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function _fluentDoc() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#2b579a" fill-opacity=".08"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#2b579a" stroke-width=".8"/><path d="M5 6h6M5 8h6M5 10h4" stroke="#2b579a" stroke-width=".6" stroke-linecap="round" opacity=".4"/></svg>';
}

function _fluentWeb() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#e34c26" fill-opacity=".08"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#e34c26" stroke-width=".8"/><path d="M5.5 7l2 4.5 3-7" stroke="#e34c26" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function _fluentConfig() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#666" fill-opacity=".06"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#666" stroke-width=".8"/><path d="M5.5 6l1.5 2-1.5 2M8.5 6l1.5 2-1.5 2" stroke="#666" stroke-width=".6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function _fluentPdf() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#d32f2f" fill-opacity=".08"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#d32f2f" stroke-width=".8"/><text x="8" y="10.5" text-anchor="middle" font-size="4" font-weight="700" fill="#d32f2f" font-family="sans-serif">PDF</text></svg>';
}

function _fluentText() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#666" fill-opacity=".06"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#666" stroke-width=".8"/><path d="M5 6h6M5 8h6M5 10h4" stroke="#666" stroke-width=".5" stroke-linecap="round" opacity=".35"/></svg>';
}

function _fluentMarkdown() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#666" fill-opacity=".06"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#666" stroke-width=".8"/><path d="M5 11V7l2 2 2-2v4" stroke="#666" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 7v4" stroke="#666" stroke-width=".7" stroke-linecap="round"/><path d="M11 7l1 1M11 7l-1 1" stroke="#666" stroke-width=".5" stroke-linecap="round"/></svg>';
}

function _fluentExe() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#0078d4" fill-opacity=".08"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#0078d4" stroke-width=".8"/><rect x="5.5" y="4.5" width="5" height="5" rx="1" stroke="#0078d4" stroke-width=".6"/><path d="M8 6v2M6.5 7h3" stroke="#0078d4" stroke-width=".5" stroke-linecap="round"/></svg>';
}

function _fluentShortcut() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#2196f3" fill-opacity=".08"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#2196f3" stroke-width=".8"/><path d="M7 7l3 3M9.5 8v2.5H7" stroke="#2196f3" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function _fluentFont() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="#9c27b0" fill-opacity=".06"/><rect x="2" y="2" width="12" height="12" rx="2" stroke="#9c27b0" stroke-width=".8"/><text x="8" y="11.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="#9c27b0" font-family="serif">A</text></svg>';
}

function _fluentDb() {
  return '<svg viewBox="0 0 16 16" fill="none"><ellipse cx="8" cy="4.5" rx="5.5" ry="2.5" fill="#ff9800" fill-opacity=".12"/><ellipse cx="8" cy="4.5" rx="5.5" ry="2.5" stroke="#ff9800" stroke-width=".8"/><path d="M2.5 4.5v7c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-7" stroke="#ff9800" stroke-width=".8"/><path d="M2.5 8c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5" stroke="#ff9800" stroke-width=".5" opacity=".4"/></svg>';
}

function _fluentGeneric() {
  return '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#888" stroke-width=".8"/><path d="M9 2v4h4" stroke="#888" stroke-width=".7" stroke-linejoin="round"/></svg>';
}

function bigFileIcon(file) {
  const mode = getIconMode();
  if (mode === 'system' || (mode === 'mixed' && _useSystemForFile(file))) {
    const cached = _iconCache.get(file.path || '');
    if (cached) return `<img src="data:image/png;base64,${cached}" style="width:48px;height:48px" alt="">`;
    return `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;opacity:.3">${_builtinIcon(file, true)}</div>`;
  }
  return fileIcon(file).replace(/viewBox="0 0 16 16"/g, 'viewBox="0 0 48 48"').replace(/stroke-width="\.(\d+)"/g, (m, n) => `stroke-width="${parseFloat('0.' + n) * 3}"`).replace(/font-size="(\d+)"/g, (m, n) => `font-size="${parseFloat(n) * 3}"`);
}

function _useSystemForFile(file) {
  const ext = (file.extension || '').toLowerCase();
  return ['exe','msi','dll','lnk','bat','cmd','ps1','com'].includes(ext) || file.is_dir;
}

function fileTypeLabel(file) {
  if (file.is_dir) return t('type.fileFolder');
  const ext = file.extension.toUpperCase();
  if (!ext) return t('type.file');
  const labels = {
    TXT: t('type.textDoc'), MD: t('type.markdown'), RS: t('type.rustSource'), PY: t('type.pythonFile'), JS: t('type.javascript'), TS: t('type.typescript'),
    JSON: t('type.jsonFile'), TOML: t('type.toml'), YAML: t('type.yaml'), XML: t('type.xml'),
    PNG: t('type.pngImage'), JPG: t('type.jpegImage'), GIF: t('type.gifImage'), SVG: t('type.svgImage'), WEBP: t('type.webpImage'),
    ZIP: t('type.zipArchive'), RAR: t('type.rarArchive'), "7Z": t('type.7zArchive'), TAR: t('type.tarArchive'),
    MP3: t('type.mp3Audio'), WAV: t('type.wavAudio'), FLAC: t('type.flacAudio'), OGG: t('type.oggAudio'),
    MP4: t('type.mp4Video'), MKV: t('type.mkvVideo'), AVI: t('type.aviVideo'), WEBM: t('type.webmVideo'),
    PDF: t('type.pdfDoc'), DOC: t('type.wordDoc'), DOCX: t('type.wordDoc'), XLS: t('type.excelSheet'), XLSX: t('type.excelSheet'),
    PPT: t('type.pptPresentation'), PPTX: t('type.pptPresentation'),
    EXE: t('type.application'), DLL: t('type.dll'), MSI: t('type.installer'),
    HTML: t('type.htmlFile'), CSS: t('type.cssStylesheet'), SCSS: t('type.scssStylesheet'),
    SH: t('type.shellScript'), BAT: t('type.batchScript'), PS1: t('type.psScript'),
    C: t('type.cSource'), CPP: t('type.cppSource'), JAVA: t('type.javaSource'), GO: t('type.goSource'), RB: t('type.rubySource'),
    SWIFT: t('type.swiftSource'), KT: t('type.kotlinSource'), LUA: t('type.luaScript'), PHP: t('type.phpScript'),
    SQL: t('type.sqlDb'), DB: t('type.database'), SQLITE: t('type.sqliteDb'),
    TTF: t('type.ttfFont'), OTF: t('type.otfFont'), WOFF: t('type.webFont'),
    CSV: t('type.csvSheet'), RTF: t('type.richText'),
  };
  return labels[ext] || (ext + ' ' + t('type.file'));
}

function tagColor(idx) {
  const colors = ["#0078d4","#28a745","#e91e63","#ff9800","#9c27b0","#00bcd4","#795548","#607d8b"];
  return colors[idx % colors.length];
}
