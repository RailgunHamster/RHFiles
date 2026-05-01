// grouping.js - file grouping by date/size/type

let groupBy = 'none';

function toggleGrouping(field) {
  groupBy = (groupBy === field) ? 'none' : field;
  renderFiles(getTab(), "file-list", "status-count", "status-selection");
}

function getGroupKey(file) {
  switch (groupBy) {
    case 'date':
      if (!file.modified) return 'Unknown';
      if (file.modified.startsWith('Today')) return 'Today';
      if (file.modified.startsWith('Yesterday')) return 'Yesterday';
      if (file.modified.includes('days ago')) return 'This Week';
      if (file.modified.match(/^\d{4}\//)) {
        const year = file.modified.substring(0, 4);
        const currentYear = new Date().getFullYear();
        if (parseInt(year) === currentYear) return 'This Year (' + year + ')';
        return 'Older (' + year + ')';
      }
      return 'Unknown';
    case 'size':
      if (file.is_dir) return 'Folders';
      if (file.size === 0) return 'Empty (0 B)';
      if (file.size < 1024) return 'Tiny (< 1 KB)';
      if (file.size < 1048576) return 'Small (< 1 MB)';
      if (file.size < 104857600) return 'Medium (< 100 MB)';
      return 'Large (>= 100 MB)';
    case 'type':
      if (file.is_dir) return 'Folders';
      const ext = (file.extension || '').toLowerCase();
      if (['jpg','jpeg','png','gif','bmp','webp','svg','ico','tiff'].includes(ext)) return 'Images';
      if (['mp3','wav','flac','ogg','aac','wma'].includes(ext)) return 'Audio';
      if (['mp4','mkv','avi','webm','mov','wmv'].includes(ext)) return 'Video';
      if (['pdf'].includes(ext)) return 'Documents';
      if (['doc','docx','xls','xlsx','ppt','pptx'].includes(ext)) return 'Office Documents';
      if (['txt','md','rtf'].includes(ext)) return 'Text Files';
      if (['zip','rar','7z','tar','gz'].includes(ext)) return 'Archives';
      if (['exe','msi','dll'].includes(ext)) return 'Applications';
      if (['rs','js','ts','py','c','cpp','java','go','rb','php','html','css','sh','bat'].includes(ext)) return 'Source Code';
      return 'Other';
    case 'extension':
      if (file.is_dir) return 'Folders';
      return '.' + (file.extension || 'no extension').toUpperCase();
    default:
      return null;
  }
}

function groupEntries(entries) {
  if (groupBy === 'none') return null;
  const groups = new Map();
  for (let i = 0; i < entries.length; i++) {
    const key = getGroupKey(entries[i]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  return groups;
}

const GROUP_ORDER = {
  'Folders': 0, 'Today': 1, 'Yesterday': 2, 'This Week': 3,
  'This Year': 4, 'Older': 5, 'Unknown': 6,
  'Empty (0 B)': 0, 'Tiny (< 1 KB)': 1, 'Small (< 1 MB)': 2, 'Medium (< 100 MB)': 3, 'Large (>= 100 MB)': 4,
  'Images': 0, 'Audio': 1, 'Video': 2, 'Documents': 3, 'Office Documents': 4,
  'Text Files': 5, 'Archives': 6, 'Applications': 7, 'Source Code': 8, 'Other': 9,
};

function sortGroupKeys(keys) {
  return [...keys].sort((a, b) => {
    const oa = GROUP_ORDER[a] !== undefined ? GROUP_ORDER[a] : 99;
    const ob = GROUP_ORDER[b] !== undefined ? GROUP_ORDER[b] : 99;
    return oa - ob || a.localeCompare(b);
  });
}

function renderGroupHeader(label, count, list) {
  const header = document.createElement('div');
  header.className = 'group-header';
  header.innerHTML = `<span class="group-label">${esc(label)}</span><span class="group-count">${count} items</span>`;
  list.appendChild(header);
}
