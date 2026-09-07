// theme.js — built-in and user-installable theme packs

const THEME_VARIABLES = Object.freeze([
  '--bg', '--bg-card', '--bg-sidebar', '--bg-input', '--bg-soft', '--bg-raised',
  '--hover', '--active', '--text', '--text-1', '--text-2', '--text-3', '--text-4',
  '--accent', '--accent-hover', '--accent-light', '--select-bg', '--border', '--divider',
  '--shadow', '--shadow-soft', '--shadow-float', '--focus-ring', '--code-bg',
  '--syntax-keyword', '--syntax-string', '--syntax-number', '--syntax-comment',
  '--syntax-type', '--syntax-property', '--syntax-tag', '--syntax-attribute',
  '--syntax-operator', '--syntax-meta', '--syntax-error', '--syntax-warning', '--syntax-info',
  '--scrollbar-thumb', '--scrollbar-hover', '--preview-bg', '--bg-1', '--bg-2', '--bg-3',
  '--hover-bg', '--row-height', '--card-width', '--card-height',
]);
const THEME_VARIABLE_SET = new Set(THEME_VARIABLES);

const BUILTIN_THEME_PACKS = Object.freeze([
  { id:'light', nameKey:'settings.themeLight', base:'light', builtin:true, variables:{} },
  { id:'dark', nameKey:'settings.themeDark', base:'dark', builtin:true, variables:{} },
  {
    id:'sand', nameKey:'settings.themeSand', base:'light', builtin:true,
    variables:{
      '--bg':'#f1ede4', '--bg-card':'#fffaf0', '--bg-sidebar':'#f6f0e4', '--bg-input':'#fffdf8',
      '--bg-soft':'#eae3d7', '--bg-raised':'#fffdf8', '--hover':'#e8dfd0', '--active':'#ddd1bf',
      '--text':'#302b25', '--text-1':'#302b25', '--text-2':'#544b40', '--text-3':'#756a5d', '--text-4':'#9a8f80',
      '--accent':'#b4532a', '--accent-hover':'#963f1c', '--accent-light':'#f6dfd1', '--select-bg':'#f5e3d5',
      '--border':'#ddd3c4', '--divider':'#ebe3d7', '--focus-ring':'rgba(180,83,42,.20)', '--preview-bg':'#fffaf2',
      '--code-bg':'#f8f1e7', '--bg-1':'#f1ede4', '--bg-2':'#e8e1d6', '--bg-3':'#dcd2c3', '--hover-bg':'#e8dfd0',
    }
  },
  {
    id:'mist', nameKey:'settings.themeMist', base:'light', builtin:true,
    variables:{
      '--bg':'#eef3f4', '--bg-card':'#f9fcfc', '--bg-sidebar':'#f2f7f7', '--bg-input':'#ffffff',
      '--bg-soft':'#e4edef', '--bg-raised':'#ffffff', '--hover':'#dde9eb', '--active':'#d0dfe2',
      '--text':'#1e2c2e', '--text-1':'#1e2c2e', '--text-2':'#405457', '--text-3':'#627679', '--text-4':'#89999b',
      '--accent':'#167d86', '--accent-hover':'#0f6870', '--accent-light':'#d7eef0', '--select-bg':'#dceff1',
      '--border':'#d3dfe1', '--divider':'#e3ebec', '--focus-ring':'rgba(22,125,134,.20)', '--preview-bg':'#f7fbfb',
      '--code-bg':'#f1f7f7', '--bg-1':'#eef3f4', '--bg-2':'#e2ebed', '--bg-3':'#d4e0e2', '--hover-bg':'#dde9eb',
    }
  },
  {
    id:'forest', nameKey:'settings.themeForest', base:'dark', builtin:true,
    variables:{
      '--bg':'#14201b', '--bg-card':'#1c2a23', '--bg-sidebar':'#17251f', '--bg-input':'#24352c',
      '--bg-soft':'#223229', '--bg-raised':'#203028', '--hover':'#293c32', '--active':'#344a3e',
      '--text':'#edf5ef', '--text-1':'#edf5ef', '--text-2':'#c6d8cb', '--text-3':'#97ad9e', '--text-4':'#718579',
      '--accent':'#73c991', '--accent-hover':'#91d9aa', '--accent-light':'rgba(83,169,113,.20)', '--select-bg':'#274738',
      '--border':'#34483c', '--divider':'#293a31', '--focus-ring':'rgba(115,201,145,.22)', '--preview-bg':'#18261f',
      '--code-bg':'#14201b', '--bg-1':'#14201b', '--bg-2':'#223229', '--bg-3':'#2d4036', '--hover-bg':'#293c32',
      '--syntax-keyword':'#d7a7ff', '--syntax-string':'#8ddd9e', '--syntax-number':'#f0cf75', '--syntax-type':'#86c7ff',
    }
  },
  {
    id:'slate', nameKey:'settings.themeSlate', base:'dark', builtin:true,
    variables:{
      '--bg':'#171c25', '--bg-card':'#202631', '--bg-sidebar':'#1b212b', '--bg-input':'#29313e',
      '--bg-soft':'#272e39', '--bg-raised':'#252c37', '--hover':'#303846', '--active':'#3b4555',
      '--text':'#eef1f6', '--text-1':'#eef1f6', '--text-2':'#cbd2dc', '--text-3':'#9ea8b7', '--text-4':'#747f90',
      '--accent':'#8aa9ff', '--accent-hover':'#a2baff', '--accent-light':'rgba(102,137,230,.22)', '--select-bg':'#2d416b',
      '--border':'#384353', '--divider':'#2d3643', '--focus-ring':'rgba(138,169,255,.24)', '--preview-bg':'#1b212a',
      '--code-bg':'#171c24', '--bg-1':'#171c25', '--bg-2':'#272e39', '--bg-3':'#333c49', '--hover-bg':'#303846',
    }
  },
]);

let _themePacks = new Map(BUILTIN_THEME_PACKS.map(theme => [theme.id, theme]));
let _themeDirectory = '';
let _themeLoadErrors = [];
let _themePacksLoaded = false;

function localizedThemeName(theme) {
  if (theme.nameKey) return t(theme.nameKey);
  const name = theme.name;
  if (name && typeof name === 'object') {
    const language = String(_lang || 'en');
    const baseLanguage = language.split('-')[0];
    const candidates = [language, baseLanguage];
    if (baseLanguage === 'zh') candidates.push('zh-CN', 'zh-Hans');
    candidates.push('en');
    return String(candidates.map(code => name[code]).find(Boolean) || Object.values(name)[0] || theme.id);
  }
  return String(name || theme.id);
}

function validateThemeValue(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 180 && !/[;{}<>]/.test(value);
}

function normalizeUserThemeName(value, fileName) {
  if (typeof value === 'string') {
    const name = value.trim();
    if (!name || name.length > 80) throw new Error(`${fileName}: name must contain 1-80 characters`);
    return name;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fileName}: name must be text or a language map`);
  }
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 16) throw new Error(`${fileName}: name language map must contain 1-16 entries`);
  const localized = {};
  for (const [language, label] of entries) {
    const name = typeof label === 'string' ? label.trim() : '';
    if (!/^[A-Za-z0-9-]{1,24}$/.test(language) || !name || name.length > 80) {
      throw new Error(`${fileName}: invalid localized name`);
    }
    localized[language] = name;
  }
  return localized;
}

function parseUserTheme(file) {
  let raw;
  try { raw = JSON.parse(file.content); }
  catch (error) { throw new Error(`${file.fileName}: ${error.message}`); }
  if (!raw || raw.schemaVersion !== 1) throw new Error(`${file.fileName}: unsupported schemaVersion`);
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(String(raw.id || ''))) throw new Error(`${file.fileName}: invalid id`);
  if (raw.base !== 'light' && raw.base !== 'dark') throw new Error(`${file.fileName}: base must be light or dark`);
  if (!raw.variables || typeof raw.variables !== 'object' || Array.isArray(raw.variables)) throw new Error(`${file.fileName}: variables must be an object`);
  const name = normalizeUserThemeName(raw.name, file.fileName);
  const variables = {};
  for (const [key, value] of Object.entries(raw.variables)) {
    if (!THEME_VARIABLE_SET.has(key)) throw new Error(`${file.fileName}: unsupported variable ${key}`);
    if (!validateThemeValue(value)) throw new Error(`${file.fileName}: invalid value for ${key}`);
    variables[key] = value.trim();
  }
  return {
    id: 'user:' + raw.id,
    sourceId: raw.id,
    name,
    base: raw.base,
    variables,
    builtin: false,
    path: file.path,
  };
}

function getAvailableThemePacks() {
  return [..._themePacks.values()];
}

function themeOptionsHtml(selectedId) {
  return getAvailableThemePacks().map(theme =>
    '<option value="' + esc(theme.id) + '"' + (theme.id === selectedId ? ' selected' : '') + '>' + esc(localizedThemeName(theme)) + '</option>'
  ).join('');
}

function applyTheme(themeId, persist = true) {
  if (themeId === 'custom') themeId = 'light';
  const theme = _themePacks.get(themeId) || _themePacks.get('light');
  G.theme = theme.id;
  G.themeBase = theme.base;
  document.documentElement.setAttribute('data-theme', theme.base);
  document.documentElement.dataset.themePack = theme.id;
  let style = document.getElementById('theme-pack-variables');
  if (!style) {
    style = document.createElement('style');
    style.id = 'theme-pack-variables';
    document.head.appendChild(style);
  }
  const declarations = Object.entries(theme.variables).map(([key, value]) => `${key}:${value}`).join(';');
  style.textContent = declarations ? `:root{${declarations}}` : '';
  if (persist) localStorage.setItem('rhfiles-theme', theme.id);
  applyCustomTheme();
}

function toggleTheme() {
  applyTheme(G.themeBase === 'dark' ? 'light' : 'dark');
}

async function loadUserThemePacks(reapplySelected = true) {
  const selected = localStorage.getItem('rhfiles-theme') || G.theme || 'light';
  const next = new Map(BUILTIN_THEME_PACKS.map(theme => [theme.id, theme]));
  let discovery = {directory:'', themes:[], errors:[]};
  try { discovery = await call('list_user_themes', {}); }
  catch (error) { discovery.errors = [String(error)]; }
  _themeDirectory = String(discovery.directory || '');
  _themeLoadErrors = Array.isArray(discovery.errors) ? discovery.errors.map(String) : [];
  for (const file of (Array.isArray(discovery.themes) ? discovery.themes : [])) {
    try {
      const theme = parseUserTheme(file);
      next.set(theme.id, theme);
    } catch (error) { _themeLoadErrors.push(String(error.message || error)); }
  }
  _themePacks = next;
  _themePacksLoaded = true;
  if (reapplySelected) applyTheme(next.has(selected) ? selected : 'light', false);
  return {directory:_themeDirectory, errors:[..._themeLoadErrors], count:next.size - BUILTIN_THEME_PACKS.length};
}

function updateThemeSettingsControls() {
  const selector = document.getElementById('settings-theme-select');
  if (selector) selector.innerHTML = themeOptionsHtml(G.theme);
  const location = document.getElementById('settings-theme-directory');
  if (location) {
    location.textContent = _themeLoadErrors.length
      ? t('settings.themeLoadErrors', {count:_themeLoadErrors.length})
      : (_themeDirectory || t('settings.themeFolderUnknown'));
    location.title = _themeLoadErrors.length ? _themeLoadErrors.join('\n') : _themeDirectory;
  }
}

async function reloadThemePacks() {
  await loadUserThemePacks(true);
  updateThemeSettingsControls();
  showNotice(_themeLoadErrors.length
    ? t('settings.themeReloadWithErrors', {count:_themeLoadErrors.length})
    : t('settings.themeReloaded'));
}

async function openThemeFolder() {
  try {
    _themeDirectory = await call('open_theme_folder', {});
    updateThemeSettingsControls();
  } catch (error) {
    showNotice(t('settings.themeFolderFailed', {error}));
  }
}

const _savedThemeId = localStorage.getItem('rhfiles-theme') || 'light';
applyTheme(_themePacks.has(_savedThemeId) ? _savedThemeId : 'light', false);
loadUserThemePacks(true).then(updateThemeSettingsControls);

G.windowEffect = localStorage.getItem('rhfiles-window-effect') || 'none';
if (G.windowEffect !== 'none') applyWindowEffect(G.windowEffect);

async function applyWindowEffect(effect) {
  G.windowEffect = effect;
  localStorage.setItem('rhfiles-window-effect', effect);
  document.body.classList.toggle('mica-active', effect !== 'none');
  try { await call("set_window_effect", { effect }); } catch (e) {}
}

function applyCustomTheme() {
  let styleEl = document.getElementById('custom-theme');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-theme';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = localStorage.getItem('rhfiles-custom-theme') || '';
}

applyCustomTheme();
