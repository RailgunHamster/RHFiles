/* Formatting and list-shaping helpers.
 *
 * Dependency-free and allocation-light: `size`/`relative` run once per visible
 * row on every scroll repaint. Everything here is pure so the same file can be
 * unit tested under Node (see tests/format.test.js) — the browser gets it as a
 * `fmt` global, Node gets it as a module export. */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.fmt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

  function size(bytes) {
    if (bytes === null || bytes === undefined) return '';
    if (bytes < 1024) return `${bytes} B`;
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
  }

  function date(ms) {
    if (!ms) return '';
    const value = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }

  function relative(ms, now) {
    if (!ms) return '';
    const delta = (now === undefined ? Date.now() : now) - ms;
    const minute = 60000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (delta < minute) return 'just now';
    if (delta < hour) return `${Math.floor(delta / minute)} min ago`;
    if (delta < day) return `${Math.floor(delta / hour)} h ago`;
    if (delta < 30 * day) return `${Math.floor(delta / day)} d ago`;
    return date(ms);
  }

  function count(value) {
    return (value || 0).toLocaleString();
  }

  function path2parts(path) {
    const parts = [];
    let accumulated = '';
    for (const segment of String(path).split('/')) {
      if (segment === '') {
        accumulated = '/';
        continue;
      }
      accumulated = accumulated === '/' ? `/${segment}` : `${accumulated}/${segment}`;
      parts.push({ name: segment, path: accumulated });
    }
    return parts;
  }

  function parentOf(path) {
    const trimmed = String(path).replace(/\/+$/, '');
    const index = trimmed.lastIndexOf('/');
    if (index <= 0) return '/';
    return trimmed.slice(0, index);
  }

  function baseName(path) {
    const trimmed = String(path).replace(/\/+$/, '');
    const index = trimmed.lastIndexOf('/');
    return index < 0 ? trimmed : trimmed.slice(index + 1);
  }

  // Presentation only: never pass this back to a filesystem/provider command.
  // Decode once, retaining encoded separators and control/bidi characters so a
  // filename cannot invent a directory or a misleading extra line in the UI.
  function displayPath(value) {
    const path = String(value ?? '');
    return path.replace(/^(remote|content|file):\/\/([^/]*)([^?#]*)/i, (all, scheme, authority, rest) =>
      scheme + '://' + authority + rest.replace(/(?:%[0-9a-f]{2})+/gi, encoded => {
        try { return decodeURIComponent(encoded).replace(/[/\\\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, c => encodeURIComponent(c)); }
        catch { return encoded; }
      }));
  }
  function displayPathText(value) {
    return String(value ?? '').replace(/(?:remote|content|file):\/\/[^\s]+/gi, displayPath);
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  const COMPARATORS = {
    name: (a, b) => collator.compare(a.name, b.name),
    size: (a, b) => (b.size || 0) - (a.size || 0) || collator.compare(a.name, b.name),
    date: (a, b) => (b.modifiedMs || 0) - (a.modifiedMs || 0) || collator.compare(a.name, b.name),
    kind: (a, b) => collator.compare(a.kind || '', b.kind || '') || collator.compare(a.name, b.name),
  };
  // Keep existing keys/defaults compatible with older configurations.
  const sortChoices = [
    ['name', '名称（A → Z）'], ['name-desc', '名称（Z → A）'],
    ['date', '修改时间（新到旧）'], ['date-asc', '修改时间（旧到新）'],
    ['size', '大小（大到小）'], ['size-asc', '大小（小到大）'],
    ['kind', '类型（A → Z）'], ['kind-desc', '类型（Z → A）'],
  ];
  const reverseSorts = { 'name-desc': 'name', 'date-asc': 'date', 'size-asc': 'size', 'kind-desc': 'kind' };

  /**
   * Filters hidden entries and sorts folders first, then by the chosen key.
   * Mirrors what the real list shows, so it is the part worth unit testing.
   */
  function shapeEntries(entries, options) {
    const settings = options || {};
    const keepHidden = settings.showHidden === true;
    const reversed = Object.prototype.hasOwnProperty.call(reverseSorts, settings.sort);
    const key = reversed ? reverseSorts[settings.sort] : settings.sort;
    const comparator = Object.prototype.hasOwnProperty.call(COMPARATORS, key) ? COMPARATORS[key] : COMPARATORS.name;
    return entries
      .filter((entry) => keepHidden || !String(entry.name).startsWith('.'))
      .slice()
      .sort((a, b) => {
        if (Boolean(a.isDir) !== Boolean(b.isDir)) return a.isDir ? -1 : 1;
        return (reversed ? -1 : 1) * comparator(a, b);
      });
  }

  function sameEntries(a, b) {
    if (a.length !== b.length) return false;
    const keys = ['path','name','isDir','size','modifiedMs','kind','parentPath'];
    return a.every((entry, index) => keys.every(key => entry[key] === b[index][key]));
  }

  return { size, date, relative, count, path2parts, parentOf, baseName, displayPath, displayPathText, shapeEntries, sameEntries, sortChoices };
});
