const pickerInvoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
const pickerListen = window.__TAURI_INTERNALS__?.event?.listen || window.__TAURI__?.event?.listen;

const pickerText = {
  zh: {
    title: 'RHFiles 已打开位置', subtitle: '选择后让当前 Windows 窗口跳转', click: '单击即可跳转',
    dialog: 'Windows 打开 / 保存窗口', explorer: 'Windows 资源管理器',
    window: 'RHFiles 窗口 {number}', empty: '没有可用的文件夹', emptyHint: '请先在 RHFiles 中打开本地或网络文件夹',
    failed: '跳转失败：{error}', collapse: '收起（仅显示路径）', expand: '展开详细信息',
    hide: '暂时隐藏', disable: '关闭此功能（可在设置中重新开启）', openInRhfiles: '在 RHFiles 里打开',
    preview: '选中文件预览', noPreview: '没有可预览的文件',
    chooseInRhfiles: '用 RHFiles 选文件', chooseInRhfilesSingle: '用 RHFiles 选这个文件',
    choiceResume: '回到 RHFiles 继续选择',
    choiceBusy: '正在打开 RHFiles…',
  },
  en: {
    title: 'Open RHFiles locations', subtitle: 'Choose where this Windows window should go', click: 'Click to navigate',
    dialog: 'Windows Open / Save dialog', explorer: 'Windows File Explorer',
    window: 'RHFiles window {number}', empty: 'No folder is available', emptyHint: 'Open a local or network folder in RHFiles first',
    failed: 'Navigation failed: {error}', collapse: 'Collapse to paths only', expand: 'Expand details',
    hide: 'Hide for now', disable: 'Turn off this feature (re-enable it in Settings)', openInRhfiles: 'Open in RHFiles',
    preview: 'Selected file preview', noPreview: 'No file is selected',
    chooseInRhfiles: 'Choose files in RHFiles', chooseInRhfilesSingle: 'Choose this file in RHFiles',
    choiceResume: 'Back to RHFiles to keep choosing',
    choiceBusy: 'Opening RHFiles…',
  },
};

const previewImageExt = new Set(['png','jpg','jpeg','gif','bmp','webp','svg','ico','tiff','tif','heic','avif']);
let previewRequest = 0;

let pickerState = { locale: 'zh', locations: [], targetKind: '', targetPath: null, compact: false };

function tr(key, values = {}) {
  const locale = String(pickerState.locale || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  let value = pickerText[locale][key] || pickerText.en[key] || key;
  for (const [name, replacement] of Object.entries(values)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

function basename(path) {
  const normalized = String(path || '').replace(/[\\/]+$/, '');
  if (/^[a-z]:$/i.test(normalized)) return normalized.toUpperCase();
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || path || '';
}

function renderPicker(state) {
  pickerState = state || pickerState;
  document.documentElement.lang = String(pickerState.locale || '').startsWith('zh') ? 'zh-CN' : 'en';
  document.documentElement.classList.toggle('compact', pickerState.compact === true);
  document.getElementById('picker-title').textContent = tr('title');
  document.getElementById('picker-subtitle').textContent = tr('subtitle');
  document.getElementById('picker-hint').textContent = tr('click');
  document.getElementById('picker-target').textContent = pickerState.targetKind === 'windowsExplorer' ? tr('explorer') : tr('dialog');
  const compact = document.getElementById('picker-compact');
  const compactLabel = tr(pickerState.compact ? 'expand' : 'collapse');
  compact.title = compactLabel;
  compact.setAttribute('aria-label', compactLabel);
  const disable = document.getElementById('picker-disable');
  disable.title = tr('disable');
  disable.setAttribute('aria-label', tr('disable'));
  const close = document.getElementById('picker-close');
  close.title = tr('hide');
  close.setAttribute('aria-label', tr('hide'));
  const openInRhfiles = document.getElementById('picker-open-rhfiles');
  const compactOpenInRhfiles = document.getElementById('picker-open-rhfiles-compact');
  const canOpenInRhfiles = pickerState.targetKind === 'windowsExplorer' || pickerState.targetKind === 'windowsFileDialog';
  openInRhfiles.hidden = !canOpenInRhfiles;
  openInRhfiles.title = canOpenInRhfiles ? (pickerState.selectedPath || pickerState.targetPath || tr('openInRhfiles')) : '';
  compactOpenInRhfiles.hidden = !canOpenInRhfiles;
  compactOpenInRhfiles.title = tr('openInRhfiles');
  compactOpenInRhfiles.setAttribute('aria-label', tr('openInRhfiles'));
  document.getElementById('picker-open-rhfiles-label').textContent = tr('openInRhfiles');
  renderPickerChoice(pickerState);
  renderPickerPreview(pickerState);

  const list = document.getElementById('picker-list');
  list.replaceChildren();
  const locations = Array.isArray(pickerState.locations) ? pickerState.locations : [];
  if (!locations.length) {
    const empty = document.createElement('div');
    empty.className = 'picker-empty';
    const title = document.createElement('strong');
    title.textContent = tr('empty');
    const hint = document.createElement('span');
    hint.textContent = tr('emptyHint');
    empty.append(title, hint);
    list.append(empty);
    return;
  }

  const windowLabels = [...new Set(locations.map(location => location.windowLabel || 'main'))];
  windowLabels.forEach((windowLabel, windowIndex) => {
    const group = document.createElement('div');
    group.className = 'picker-group';
    if (windowLabels.length > 1) {
      const heading = document.createElement('div');
      heading.className = 'picker-group-title';
      heading.textContent = tr('window', { number: windowIndex + 1 });
      group.append(heading);
    }
    locations.filter(location => (location.windowLabel || 'main') === windowLabel).forEach(location => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `picker-location${location.active ? ' active' : ''}`;
      button.title = location.path;

      const copy = document.createElement('span');
      copy.className = 'location-copy';
      const name = document.createElement('span');
      name.className = 'location-name';
      name.textContent = basename(location.path);
      const path = document.createElement('span');
      path.className = 'location-path';
      path.textContent = location.path;
      copy.append(name, path);
      button.append(copy);
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await pickerInvoke('navigate_file_dialog_location', { path: location.path });
        } catch (error) {
          document.getElementById('picker-subtitle').textContent = tr('failed', { error: String(error) });
        } finally {
          button.disabled = false;
        }
      });
      group.append(button);
    });
    list.append(group);
  });
}

document.getElementById('picker-compact').addEventListener('click', async () => {
  const compact = pickerState.compact !== true;
  localStorage.setItem('rhfiles-integration-picker-compact', String(compact));
  try {
    const state = await pickerInvoke('set_file_dialog_picker_compact', { compact });
    renderPicker(state);
  } catch (error) {
    document.getElementById('picker-subtitle').textContent = tr('failed', { error: String(error) });
  }
});

/** Offer RHFiles as the picker for dialogs that are choosing a file. */
function renderPickerChoice(state) {
  const button = document.getElementById('picker-choose-rhfiles');
  const label = document.getElementById('picker-choose-rhfiles-label');
  if (!button || !label) return;
  const available = state.choiceAvailable === true && state.targetKind === 'windowsFileDialog';
  button.hidden = !available;
  document.documentElement.classList.toggle('has-choice', available);
  if (!available) return;
  // While a hand-off is in progress the same button brings RHFiles back to the
  // front, which matters because RHFiles is where the choosing happens.
  const active = state.choiceActive === true;
  const text = active
    ? tr('choiceResume')
    : (state.choiceAllowMultiple === false ? tr('chooseInRhfilesSingle') : tr('chooseInRhfiles'));
  const filter = Array.isArray(state.choiceExtensions) && state.choiceExtensions.length
    ? state.choiceExtensions.map(extension => `*.${extension}`).join(' ')
    : '';
  label.textContent = text;
  button.title = filter ? `${text} · ${filter}` : text;
  button.setAttribute('aria-label', text);
}

let pickerChoiceBusy = false;
async function chooseWithRhfiles() {
  if (pickerChoiceBusy) return;
  pickerChoiceBusy = true;
  const button = document.getElementById('picker-choose-rhfiles');
  const label = document.getElementById('picker-choose-rhfiles-label');
  const previous = label.textContent;
  document.getElementById('picker-subtitle').textContent = tr('choiceBusy');
  try {
    await pickerInvoke('begin_file_choice_in_rhfiles');
  } catch (error) {
    document.getElementById('picker-subtitle').textContent = tr('failed', { error: String(error) });
    label.textContent = previous;
  } finally {
    pickerChoiceBusy = false;
    button.disabled = false;
  }
}
document.getElementById('picker-choose-rhfiles').addEventListener('click', chooseWithRhfiles);

function renderPickerPreview(state) {
  const preview = document.getElementById('picker-preview');
  const visual = document.getElementById('picker-preview-visual');
  const nameEl = document.getElementById('picker-preview-name');
  const metaEl = document.getElementById('picker-preview-meta');
  const pathEl = document.getElementById('picker-preview-path');
  const selectedPath = state.selectionKind === 'file' ? state.selectedPath : '';
  const show = state.targetKind === 'windowsFileDialog' && !!selectedPath && state.selectedIsDir !== true;
  document.documentElement.classList.toggle('has-preview', show);
  preview.hidden = !show;
  if (!show) {
    visual.replaceChildren();
    nameEl.textContent = '';
    metaEl.textContent = '';
    pathEl.textContent = '';
    return;
  }
  const selectedName = state.selectedName || basename(selectedPath);
  nameEl.textContent = selectedName;
  pathEl.textContent = selectedPath;
  metaEl.textContent = tr('preview');
  visual.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h7.2L19 8.4V20.5H7V3.5Z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/><path d="M14 3.6V8.5h5" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/></svg>';
  const token = ++previewRequest;
  pickerInvoke('get_file_info', { path: selectedPath }).then(info => {
    if (token !== previewRequest) return;
    if (info?.sizeDisplay) metaEl.textContent = info.sizeDisplay;
    else if (info?.size_display) metaEl.textContent = info.size_display;
  }).catch(() => {});
  const ext = String(selectedName.split('.').pop() || '').toLowerCase();
  if (previewImageExt.has(ext)) {
    pickerInvoke('get_thumbnail', { path: selectedPath, size: 128 }).then(b64 => {
      if (token !== previewRequest || !b64) return;
      const image = document.createElement('img');
      image.alt = selectedName;
      image.src = `data:image/png;base64,${b64}`;
      visual.replaceChildren(image);
    }).catch(() => {});
  }
}

document.getElementById('picker-disable').addEventListener('click', () => {
  pickerInvoke('disable_file_dialog_integration', { targetKind: pickerState.targetKind }).catch(error => {
    document.getElementById('picker-subtitle').textContent = tr('failed', { error: String(error) });
  });
});
async function openExplorerLocation(event) {
  const buttons = [
    document.getElementById('picker-open-rhfiles'),
    document.getElementById('picker-open-rhfiles-compact'),
  ].filter(Boolean);
  buttons.forEach(button => { button.disabled = true; });
  try {
    await pickerInvoke('open_explorer_location_in_rhfiles');
  } catch (error) {
    document.getElementById('picker-subtitle').textContent = tr('failed', { error: String(error) });
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}
document.getElementById('picker-open-rhfiles').addEventListener('click', openExplorerLocation);
document.getElementById('picker-open-rhfiles-compact').addEventListener('click', openExplorerLocation);
document.getElementById('picker-close').addEventListener('click', () => pickerInvoke('hide_file_dialog_picker'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') pickerInvoke('hide_file_dialog_picker');
});

if (pickerListen) {
  pickerListen('file-dialog-picker-state', event => renderPicker(event.payload)).catch(() => {});
}
const savedCompact = localStorage.getItem('rhfiles-integration-picker-compact') === 'true';
pickerInvoke('set_file_dialog_picker_compact', { compact: savedCompact })
  .then(renderPicker)
  .catch(() => pickerInvoke('get_file_dialog_picker_state').then(renderPicker).catch(() => renderPicker(pickerState)));
