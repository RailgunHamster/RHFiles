// file-choice.js — choose files for a browser upload inside RHFiles itself.
//
// The companion list offers "choose files in RHFiles" when a browser opens its
// native file dialog. Rather than reproducing a file browser in a modal, this
// keeps the browser dialog waiting and adds a thin confirm bar over RHFiles'
// own tabs, panes, preview, search and keyboard handling. The user browses and
// previews exactly as they always do, then confirms.

const fileChoiceText = {
  zh: {
    title: '为浏览器上传选择文件',
    subtitle: '在 RHFiles 里挑好文件，然后点“选好了”送回浏览器的对话框',
    any: '任意文件',
    only: '只接受 {list}',
    none: '还没有选择文件',
    one: '已选择 {name}',
    many: '已选择 {count} 个文件',
    confirm: '选好了',
    confirmTitle: '把选中的文件送回浏览器的上传对话框',
    clear: '清除选择',
    cancel: '取消',
    cancelTitle: '取消并回到浏览器的对话框',
    delivered: '已把 {count} 个文件送回浏览器的上传对话框',
    unsupported: '这个对话框不接受该类型的文件：{list}',
    failed: '操作失败：{error}',
  },
  en: {
    title: 'Choose files for the browser upload',
    subtitle: 'Pick files in RHFiles, then press “Use these files”',
    any: 'Any file',
    only: 'Accepts {list}',
    none: 'No file selected yet',
    one: 'Selected {name}',
    many: '{count} files selected',
    confirm: 'Use these files',
    confirmTitle: 'Send the selected files to the browser upload dialog',
    clear: 'Clear selection',
    cancel: 'Cancel',
    cancelTitle: 'Cancel and return to the browser dialog',
    delivered: 'Sent {count} file(s) to the browser upload dialog',
    unsupported: 'That dialog does not accept this file type: {list}',
    failed: 'Failed: {error}',
  },
};

const fileChoiceState = {
  active: false,
  busy: false,
  session: null,
  nodes: null,
  folder: '',
};

function fileChoiceTr(key, values = {}) {
  const locale = String(fileChoiceState.session?.locale || (typeof _lang === 'string' ? _lang : '') || 'en')
    .toLowerCase()
    .startsWith('zh') ? 'zh' : 'en';
  let value = fileChoiceText[locale][key] || fileChoiceText.en[key] || key;
  for (const [name, replacement] of Object.entries(values)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

function fileChoiceExtension(path) {
  const match = /\.([^.\s\\/]+)$/.exec(String(path || ''));
  return match ? match[1].toLowerCase() : '';
}

function fileChoiceBasename(path) {
  const parts = String(path || '').split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || path;
}

/** Files the dialog accepts; an empty list means it accepts anything. */
function fileChoiceAccepted() {
  const extensions = fileChoiceState.session?.extensions;
  return Array.isArray(extensions) ? extensions : [];
}

function fileChoiceFilterSummary() {
  const accepted = fileChoiceAccepted();
  if (!accepted.length) return fileChoiceTr('any');
  return fileChoiceTr('only', { list: accepted.map(extension => `*.${extension}`).join(' ') });
}

/** Keep only the files the dialog will accept, so the count is never a lie. */
function fileChoiceFilterPaths(paths, accepted) {
  const list = Array.isArray(accepted) ? accepted : [];
  if (!list.length) return paths.slice();
  return paths.filter(path => list.includes(fileChoiceExtension(path)));
}

/** The paths of the files currently selected in RHFiles, folders excluded. */
function fileChoiceSelectedFiles() {
  let entries = [];
  try {
    entries = typeof getSelectedPaths === 'function' ? getSelectedPaths() : [];
  } catch (error) {
    return [];
  }
  const files = entries.filter(entry => entry && !entry.is_dir).map(entry => entry.path).filter(Boolean);
  return fileChoiceFilterPaths(files, fileChoiceAccepted());
}

function fileChoiceIsActive() {
  return fileChoiceState.active;
}

function fileChoiceEnsureDom() {
  if (fileChoiceState.nodes) return fileChoiceState.nodes;
  const mainArea = document.getElementById('main-area');
  if (!mainArea) return null;

  const bar = document.createElement('div');
  bar.className = 'file-choice-bar';
  bar.id = 'file-choice-bar';
  bar.hidden = true;
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-live', 'polite');
  bar.innerHTML = `
    <span class="file-choice-badge" aria-hidden="true">
      <svg viewBox="0 0 20 20" fill="none"><path d="M3 5.4h5.2l1.5 1.7h7.3v9.6H3V5.4Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.8 11.2h6.4M10 8v6.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
    </span>
    <span class="file-choice-copy">
      <strong id="file-choice-title"></strong>
      <span id="file-choice-subtitle"></span>
    </span>
    <span class="file-choice-filter" id="file-choice-filter"></span>
    <span class="file-choice-error" id="file-choice-error"></span>
    <button type="button" class="file-choice-action" id="file-choice-clear"></button>
    <button type="button" class="file-choice-action" id="file-choice-cancel"></button>
    <button type="button" class="file-choice-action primary" id="file-choice-confirm"></button>`;
  mainArea.append(bar);

  const nodes = {
    mainArea,
    bar,
    title: bar.querySelector('#file-choice-title'),
    subtitle: bar.querySelector('#file-choice-subtitle'),
    filter: bar.querySelector('#file-choice-filter'),
    error: bar.querySelector('#file-choice-error'),
    clear: bar.querySelector('#file-choice-clear'),
    cancel: bar.querySelector('#file-choice-cancel'),
    confirm: bar.querySelector('#file-choice-confirm'),
  };
  nodes.clear.addEventListener('click', () => fileChoiceClearSelection());
  nodes.cancel.addEventListener('click', () => fileChoiceCancel());
  nodes.confirm.addEventListener('click', () => fileChoiceConfirm());
  fileChoiceState.nodes = nodes;
  return nodes;
}

function fileChoiceRender() {
  const nodes = fileChoiceState.nodes;
  if (!nodes) return;
  const files = fileChoiceSelectedFiles();
  nodes.title.textContent = fileChoiceTr('title');
  nodes.filter.textContent = fileChoiceFilterSummary();
  nodes.confirm.textContent = fileChoiceTr('confirm');
  nodes.confirm.title = fileChoiceTr('confirmTitle');
  nodes.clear.textContent = fileChoiceTr('clear');
  nodes.cancel.textContent = fileChoiceTr('cancel');
  nodes.cancel.title = fileChoiceTr('cancelTitle');
  nodes.clear.disabled = files.length === 0;
  nodes.confirm.disabled = files.length === 0 || fileChoiceState.busy;

  if (files.length === 1) {
    nodes.subtitle.textContent = fileChoiceTr('one', { name: fileChoiceBasename(files[0]) });
  } else if (files.length > 1) {
    nodes.subtitle.textContent = fileChoiceTr('many', { count: files.length });
  } else {
    nodes.subtitle.textContent = fileChoiceTr('subtitle');
  }
}

async function fileChoiceBegin() {
  const nodes = fileChoiceEnsureDom();
  if (!nodes) return;
  // Already selecting from a previous press: this is a resume, which exists so
  // the companion button can bring RHFiles back to the front.
  if (fileChoiceState.active) {
    try {
      await call('begin_file_choice_in_rhfiles', {});
    } catch (error) {
      // Losing the resume is harmless; the bar is already on screen.
    }
    return;
  }
  fileChoiceState.busy = true;
  let session;
  try {
    session = await call('begin_file_choice_in_rhfiles', {});
  } catch (error) {
    fileChoiceState.busy = false;
    if (typeof showNotice === 'function') showNotice(String(error));
    return;
  }
  fileChoiceState.session = session;
  fileChoiceState.active = true;
  fileChoiceState.busy = false;
  nodes.bar.hidden = false;
  nodes.error.textContent = '';
  // Start in the folder the dialog is showing, once. After that the user is
  // free to navigate anywhere with RHFiles' normal controls.
  // NOTE: the backend serializes this struct as camelCase, so the field is
  // startFolder — reading start_folder here silently skipped the navigation.
  const start = String(session?.startFolder ?? session?.start_folder ?? '').trim();
  if (start && start !== fileChoiceState.folder) {
    fileChoiceState.folder = start;
    try {
      await navigateTo(start);
    } catch (error) {
      // An unreadable folder is not fatal: the user can still navigate.
    }
  }
  // Navigating can restore a tab selection, so take the count from the truth.
  fileChoiceRender();
  fileChoiceRefreshSelection();
}

function fileChoiceClose() {
  const nodes = fileChoiceState.nodes;
  if (nodes) {
    nodes.bar.hidden = true;
    nodes.error.textContent = '';
  }
  fileChoiceState.active = false;
  fileChoiceState.busy = false;
  fileChoiceState.session = null;
  fileChoiceState.folder = '';
}

/** Drop the selection and refresh the list, so the bar and RHFiles agree. */
function fileChoiceClearSelection() {
  try {
    const isRight = G.dualOn && G.lastActivePane === 'right';
    const tabOrPane = isRight ? G.rp : getTab();
    if (tabOrPane?.sel) {
      tabOrPane.sel.clear();
      if (isRight) {
        renderFiles(tabOrPane, 'right-file-list', 'right-status-count', null, true);
      } else {
        renderFiles(tabOrPane, 'file-list', 'status-count', 'status-selection', false);
        if (typeof updatePreviewForSelection === 'function') updatePreviewForSelection();
      }
    }
  } catch (error) {
    // Selection internals are best-effort; the bar re-renders from the truth.
  }
  fileChoiceRender();
}

async function fileChoiceConfirm() {
  const nodes = fileChoiceState.nodes;
  if (!nodes || fileChoiceState.busy) return;
  const files = fileChoiceSelectedFiles();
  if (!files.length) return;
  fileChoiceState.busy = true;
  nodes.error.textContent = '';
  fileChoiceRender();
  try {
    await call('choose_files_in_file_dialog', { files });
    const delivered = files.length;
    fileChoiceClose();
    if (typeof showNotice === 'function') {
      showNotice(fileChoiceTr('delivered', { count: delivered }));
    }
  } catch (error) {
    fileChoiceState.busy = false;
    nodes.error.textContent = fileChoiceTr('failed', { error: String(error) });
    fileChoiceRender();
  }
}

async function fileChoiceCancel() {
  const wasActive = fileChoiceState.active;
  fileChoiceClose();
  if (!wasActive) return;
  try {
    await call('cancel_file_choice', {});
  } catch (error) {
    // The dialog may already be gone; there is nothing useful left to do.
  }
}

/** Called after RHFiles' own selection changes so the bar stays accurate. */
function fileChoiceRefreshSelection() {
  if (fileChoiceState.active) fileChoiceRender();
}

function fileChoiceInstallListeners() {
  const listen = window.__TAURI_INTERNALS__?.event?.listen || window.__TAURI__?.event?.listen;
  if (listen) {
    listen('file-choice-request', () => {
      if (!fileChoiceState.active && !fileChoiceState.busy) fileChoiceBegin();
    }).catch(() => {});
    listen('file-choice-ended', () => {
      if (fileChoiceState.active) fileChoiceClose();
    }).catch(() => {});
  }
  window.addEventListener('beforeunload', () => {
    if (fileChoiceState.active) call('cancel_file_choice', {}).catch(() => {});
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fileChoiceInstallListeners, { once: true });
  } else {
    fileChoiceInstallListeners();
  }
}
