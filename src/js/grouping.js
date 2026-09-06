// grouping.js - file grouping by date/size/type

function toggleGrouping(field) {
  G.groupBy = (G.groupBy === field) ? 'none' : field;
  localStorage.setItem('rhfiles-groupBy', G.groupBy);
  renderFiles(getTab(), "file-list", "status-count", "status-selection");
}

function getGroupKey(file) {
  switch (G.groupBy) {
    case 'date':
      if (!file.modified_ts) return 'group.unknown';
      {
        const modified = new Date(Number(file.modified_ts));
        if (Number.isNaN(modified.getTime())) return 'group.unknown';
        const now = new Date();
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startModified = new Date(modified.getFullYear(), modified.getMonth(), modified.getDate());
        const days = Math.floor((startToday - startModified) / 86400000);
        if (days === 0) return 'group.today';
        if (days === 1) return 'group.yesterday';
        if (days > 1 && days < 7) return 'group.thisWeek';
        const year = modified.getFullYear();
        return year === now.getFullYear() ? 'group.thisYear:' + year : 'group.older:' + year;
      }
    case 'size':
      if (file.is_dir) return 'group.folders';
      if (file.size === 0) return 'group.sizeEmpty';
      if (file.size < 1024) return 'group.sizeTiny';
      if (file.size < 1048576) return 'group.sizeSmall';
      if (file.size < 104857600) return 'group.sizeMedium';
      return 'group.sizeLarge';
    case 'type':
      if (file.is_dir) return 'group.folders';
      const ext = (file.extension || '').toLowerCase();
      if (['jpg','jpeg','png','gif','bmp','webp','svg','ico','tiff'].includes(ext)) return 'group.images';
      if (['mp3','wav','flac','ogg','aac','wma'].includes(ext)) return 'group.audio';
      if (['mp4','mkv','avi','webm','mov','wmv'].includes(ext)) return 'group.video';
      if (['pdf'].includes(ext)) return 'group.documents';
      if (['doc','docx','xls','xlsx','ppt','pptx'].includes(ext)) return 'group.officeDocs';
      if (['txt','md','rtf'].includes(ext)) return 'group.textFiles';
      if (['zip','rar','7z','tar','gz'].includes(ext)) return 'group.archives';
      if (['exe','msi','dll'].includes(ext)) return 'group.applications';
      if (['rs','js','ts','py','c','cpp','java','go','rb','php','html','css','sh','bat'].includes(ext)) return 'group.sourceCode';
      return 'group.other';
    case 'extension':
      if (file.is_dir) return 'group.folders';
      return 'ext:' + (file.extension || 'NO_EXT');
    default:
      return null;
  }
}

function groupEntries(entries) {
  if (G.groupBy === 'none') return null;
  const groups = new Map();
  for (let i = 0; i < entries.length; i++) {
    const key = getGroupKey(entries[i]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  return groups;
}

const GROUP_ORDER = {
  'group.folders': 0, 'group.today': 1, 'group.yesterday': 2, 'group.thisWeek': 3,
  'group.thisYear': 4, 'group.older': 5, 'group.unknown': 6,
  'group.sizeEmpty': 0, 'group.sizeTiny': 1, 'group.sizeSmall': 2, 'group.sizeMedium': 3, 'group.sizeLarge': 4,
  'group.images': 0, 'group.audio': 1, 'group.video': 2, 'group.documents': 3, 'group.officeDocs': 4,
  'group.textFiles': 5, 'group.archives': 6, 'group.applications': 7, 'group.sourceCode': 8, 'group.other': 9,
};

function sortGroupKeys(keys) {
  return [...keys].sort((a, b) => {
    const ka = a.split(':')[0], kb = b.split(':')[0];
    const oa = GROUP_ORDER[ka] !== undefined ? GROUP_ORDER[ka] : 99;
    const ob = GROUP_ORDER[kb] !== undefined ? GROUP_ORDER[kb] : 99;
    return oa - ob || a.localeCompare(b);
  });
}

function translateGroupKey(key) {
  if (key.startsWith('group.thisYear:')) return t('group.thisYear', {year: key.split(':')[1]});
  if (key.startsWith('group.older:')) return t('group.older', {year: key.split(':')[1]});
  if (key.startsWith('ext:')) {
    const ext = key.substring(4);
    return ext === 'NO_EXT' ? t('group.noExtension') : '.' + ext.toUpperCase();
  }
  return t(key);
}

function renderGroupHeader(label, count, list) {
  const header = document.createElement('div');
  header.className = 'group-header';
  header.innerHTML = `<span class="group-label">${esc(translateGroupKey(label))}</span><span class="group-count">${t('group.items', {count: count})}</span>`;
  list.appendChild(header);
}

function toggleGroupingMenu() {
  removeContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  const modes = [
    { label: t('group.menuNone'), field: "none" },
    { label: t('group.menuType'), field: "type" },
    { label: t('group.menuDate'), field: "date" },
    { label: t('group.menuSize'), field: "size" },
    { label: t('group.menuExt'), field: "extension" },
  ];
  modes.forEach(m => {
    const mi = document.createElement("div");
    mi.className = "ctx-item" + (G.groupBy === m.field ? " active" : "");
    mi.innerHTML = `<span>${m.label}</span>`;
    mi.addEventListener("click", () => {
      removeContextMenu();
      toggleGrouping(m.field);
    });
    menu.appendChild(mi);
  });
  document.body.appendChild(menu);
  contextMenu = menu;
  requestAnimationFrame(() => {
    menu.style.left = Math.min(100, window.innerWidth - 150) + "px";
    menu.style.top = Math.min(200, window.innerHeight - 200) + "px";
  });
}
