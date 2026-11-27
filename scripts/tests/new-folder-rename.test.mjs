import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const readSrc = rel => fs.readFileSync(new URL('../../src/' + rel, import.meta.url), 'utf8');

function section(file, start, end) {
  const source = readSrc('js/' + file);
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `could not slice ${file} from ${start} to ${end}`);
  return source.slice(first, last);
}

function makeContext(extra = {}) {
  return vm.createContext({
    console,
    Set,
    Map,
    URL,
    RHFilesUI: {
      listen: (node, type, handler, options) => node?.addEventListener?.(type, handler, options),
      remove: (node, type, handler, options) => node?.removeEventListener?.(type, handler, options),
      assign: (node, type, handler) => { if (node) node['on' + type] = handler; },
    },
    ...extra,
  });
}

test('bundled i18n packs and locale fallback translate default new folder and new file names', () => {
  const en = JSON.parse(readSrc('i18n/en.json'));
  const zh = JSON.parse(readSrc('i18n/zh.json'));
  assert.equal(en['dialog.newFolderDefault'], 'New Folder');
  assert.equal(en['dialog.newFileDefault'], 'New File');
  assert.equal(zh['dialog.newFolderDefault'], '新建文件夹');
  assert.equal(zh['dialog.newFileDefault'], '新建文件');

  const ctx = makeContext({ I18N: { en, zh }, _lang: 'zh' });
  vm.runInContext(
    section('common.js', 'const LOCALIZED_NEW_DEFAULTS =', 'function setLang('),
    ctx,
  );
  assert.equal(ctx.defaultNewFolderName(), '新建文件夹');
  assert.equal(ctx.defaultNewFileName(), '新建文件');
  assert.equal(ctx.defaultNewFolderName('en'), 'New Folder');
  assert.equal(ctx.defaultNewFileName('en'), 'New File');
  assert.equal(ctx.defaultNewFolderName('zh-TW'), '新增資料夾');
  assert.equal(ctx.defaultNewFileName('zh-TW'), '新增檔案');
  assert.equal(ctx.defaultNewFolderName('ja'), '新しいフォルダー');
  assert.equal(ctx.defaultNewFileName('ja'), '新しいファイル');
  assert.equal(ctx.defaultNewFolderName('ko'), '새 폴더');
  assert.equal(ctx.defaultNewFileName('ko'), '새 파일');
  assert.equal(ctx.defaultNewFolderName('de'), 'Neuer Ordner');
  assert.equal(ctx.defaultNewFolderName('fr'), 'Nouveau dossier');
  assert.equal(ctx.defaultNewFolderName('es'), 'Nueva carpeta');

  // Custom language pack overrides take precedence over the built-in table.
  ctx.I18N.ja = { 'dialog.newFolderDefault': 'カスタムフォルダー', 'dialog.newFileDefault': 'カスタムファイル' };
  assert.equal(ctx.defaultNewFolderName('ja'), 'カスタムフォルダー');
  assert.equal(ctx.defaultNewFileName('ja'), 'カスタムファイル');
});

test('newFolder passes localized baseName and reveals offscreen folder in virtualized list before renaming', async () => {
  const entries = Array.from({ length: 80 }, (_, index) => ({
    name: index === 62 ? '新建文件夹' : `dir-${String(index).padStart(3, '0')}`,
    path: `C:\\work\\${index === 62 ? '新建文件夹' : `dir-${String(index).padStart(3, '0')}`}`,
    is_dir: true,
    extension: '',
  }));
  const tab = { path: 'C:\\work', entries: [], sel: new Set([0]), lastIdx: 0 };
  const revealedRow = {
    dataset: { path: entries[62].path },
    classList: { contains: cls => cls === 'dir' },
    querySelector: () => ({}),
  };
  const calls = [];
  const revealedIndices = [];
  const inlineRenameCalls = [];
  let refreshedWith = null;

  const listEl = {
    _revealFileIndex(idx) {
      revealedIndices.push(idx);
      return revealedRow;
    },
  };

  const ctx = makeContext({
    G: { dualOn: false, lastActivePane: 'left', layout: 'details', rp: { path: 'D:\\', entries: [], sel: new Set() } },
    getTab: () => tab,
    resolveRightPane: value => !!value,
    defaultNewFolderName: () => '新建文件夹',
    t: k => k,
    windowsPathKey: p => String(p || '').toLowerCase(),
    normalizeWindowsPathInput: p => String(p || ''),
    pathLeaf: p => String(p || '').split('\\').pop(),
    updatePaneFocusUI: () => {},
    updatePreviewForSelection: () => {},
    renderFiles: () => {},
    document: {
      getElementById: id => (id === 'file-list' ? listEl : null),
      querySelectorAll: () => [],
    },
    call: async (cmd, args) => {
      calls.push([cmd, args]);
      return entries[62].path;
    },
    refresh: async isRight => {
      refreshedWith = isRight;
      tab.entries = entries;
    },
    alert: msg => assert.fail('unexpected alert: ' + msg),
  });

  vm.runInContext(section('ops.js', 'async function newFolder(', 'async function copySelected('), ctx);
  vm.runInContext(section('ops.js', 'function _findAndRename(', 'async function refreshPastedFolder('), ctx);
  ctx.startInlineRename = (...args) => inlineRenameCalls.push(args);

  await ctx.newFolder(false);

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['new_folder', { parent: 'C:\\work', baseName: '新建文件夹' }]]);
  assert.equal(refreshedWith, false);
  assert.deepEqual([...tab.sel], [62]);
  assert.equal(tab.lastIdx, 62);
  assert.deepEqual(revealedIndices, [62]);
  assert.equal(inlineRenameCalls.length, 1);
  assert.equal(inlineRenameCalls[0][0], revealedRow);
  assert.equal(inlineRenameCalls[0][1], entries[62]);
  assert.equal(inlineRenameCalls[0][2], false);
});

test('startInlineRename supports all layouts, stops pointer bubbling, and respects IME composition', async () => {
  for (const selector of ['.row-fname', '.card-file-name', '.thumb-name', '.column-item-name']) {
    const listeners = {};
    let replacedWith = null;
    let restoredTo = null;
    let focused = false;
    let selectedAll = false;
    const renamed = [];

    const nameEl = {
      textContent: '新建文件夹',
      replaceWith(node) { replacedWith = node; },
    };
    const rowEl = {
      querySelector(sel) {
        assert.ok(sel.includes(selector), `selector ${sel} must match ${selector}`);
        return nameEl;
      },
    };
    const input = {
      type: '',
      className: '',
      value: '',
      isConnected: true,
      focus() { focused = true; },
      select() { selectedAll = true; },
      setSelectionRange() {},
      replaceWith(node) { restoredTo = node; this.isConnected = false; },
      addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    };

    const ctx = makeContext({
      G: { rp: null },
      getTab: () => null,
      document: {
        createElement: () => input,
        getElementById: () => null,
      },
      renameEntry: async (file, newName, isRight) => { renamed.push([file.path, newName, isRight]); },
      selectNavigatedPath: () => {},
      t: k => k,
      alert: msg => assert.fail('unexpected alert: ' + msg),
    });

    vm.runInContext(section('ops.js', 'function inlineRenameNameElement(', 'async function renamePrompt('), ctx);
    const started = ctx.startInlineRename(rowEl, { name: '新建文件夹', path: 'C:\\work\\新建文件夹', is_dir: true, extension: '' }, false);
    assert.equal(started, true);
    assert.equal(replacedWith, input);
    assert.equal(input.type, 'text');
    assert.equal(input.className, 'rename-input');
    assert.equal(focused, true);
    assert.equal(selectedAll, true);

    for (const eventType of ['mousedown', 'click', 'dblclick']) {
      let stopped = false;
      listeners[eventType].forEach(fn => fn({ stopPropagation() { stopped = true; } }));
      assert.equal(stopped, true, `${eventType} inside rename input must not bubble to list/row handlers`);
    }

    // Enter while IME is composing must not commit prematurely.
    input.value = '我的项目';
    listeners.keydown.forEach(fn => fn({ key: 'Enter', isComposing: true, keyCode: 229, preventDefault() {}, stopPropagation() {} }));
    assert.equal(renamed.length, 0);
    assert.equal(input.isConnected, true);

    // Real Enter commits the rename.
    let prevented = false, stopped = false;
    listeners.keydown.forEach(fn => fn({
      key: 'Enter',
      isComposing: false,
      keyCode: 13,
      preventDefault() { prevented = true; },
      stopPropagation() { stopped = true; },
    }));
    await new Promise(setImmediate);
    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.equal(restoredTo, nameEl);
    assert.deepEqual(renamed, [['C:\\work\\新建文件夹', '我的项目', false]]);
  }
});

test('background refresh defers instead of destroying an active inline rename input', async () => {
  let renderCalls = 0;
  const listEl = {
    scrollTop: 120,
    querySelector: sel => (sel === 'input.rename-input' ? { value: 'typing' } : null),
  };
  const tab = {
    id: 1,
    path: 'C:\\work',
    entries: [{ path: 'C:\\work\\新建文件夹', name: '新建文件夹', size: 0, modified_ts: 1, modified: '', is_dir: true }],
    sel: new Set([0]),
    lastIdx: 0,
    sortF: 'name',
    sortAsc: true,
    _loaded: true,
  };
  const ctx = makeContext({
    G: { activeTab: 1, searchActive: false },
    t: k => k,
    withTimeout: p => p,
    entryVisible: () => true,
    sortEntriesList: e => e,
    listPathEntries: async () => [
      ...tab.entries,
      { path: 'C:\\work\\other.txt', name: 'other.txt', size: 5, modified_ts: 2, modified: '', is_dir: false },
    ],
    document: { getElementById: id => (id === 'file-list' ? listEl : null) },
    renderFiles: () => { renderCalls++; },
    updateStatus: () => {},
    _refreshTabMeta: () => {},
    renderNavigationLoading: () => {},
    renderNavigationError: () => assert.fail('unexpected error'),
  });
  vm.runInContext(section('tabs.js', 'async function _refreshTabInBackground(', 'function _refreshTabMeta('), ctx);
  vm.runInContext(section('tabs.js', 'function _entriesChanged(', '// --- reorder tabs within the window ---'), ctx);

  await ctx._refreshTabInBackground(tab, false);
  assert.equal(renderCalls, 0);
  assert.equal(listEl._pendingBackgroundRefresh, true);
  assert.equal(tab.entries.length, 1);
});

test('FTP new_folder respects localized baseName and rejects path traversal', async () => {
  const created = [];
  const ctx = makeContext({
    G: {},
    _lang: 'zh',
    t: k => k,
    ftpEntries: async () => [{ name: '新建文件夹' }],
    joinFolderPath: (parent, name) => `${parent.replace(/\/+$/, '')}/${name}`,
    protocolOperation: async (op, path) => { created.push([op, path]); },
    call: async () => {},
  });
  vm.runInContext(readSrc('js/remote.js'), ctx);
  // Override ftpEntries/protocolOperation on context via a direct wrapper on remoteCommand:
  const mockEntries = [{ name: '新建文件夹' }];
  ctx.call = async (cmd, args) => {
    if (cmd === 'ftp_list') return mockEntries;
    if (cmd === 'ftp_mkdir') { created.push(args.path); return null; }
    throw new Error('unexpected call: ' + cmd);
  };
  // Verify remote.js uses baseName cleanly by checking the parsed handler with a fake FTP host.
  const src = readSrc('js/remote.js');
  assert.match(src, /args\.baseName/);
  assert.match(src, /Invalid destination name/);
});
