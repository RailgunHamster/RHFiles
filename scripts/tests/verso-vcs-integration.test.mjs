import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {context,load,plain,root} from '../testing/source.mjs';
test('buildProgramOpenMenu includes Verso, Verso Diff and Verso History on Windows', () => {
  const calls = [];
  const ctx = context({
    IS_MAC: false,
    t: key => key,
    openWithProgramFromMenu: (targetPath, program, label) => calls.push({targetPath, program, label}),
    runContextCommand: () => {},
    call: () => {},
  });
  load(ctx, 'ops.js', ['buildProgramOpenMenu']);
  const items = ctx.buildProgramOpenMenu('D:\\git\\Verso\\src\\Verso.Core\\Workspace.cs', {isDirectory: false});
  const verso = items.find(i => i.label === 'Verso');
  const versoDiff = items.find(i => i.label === 'Verso Diff');
  const versoHistory = items.find(i => i.label === 'Verso History');
  assert.ok(verso && versoDiff && versoHistory, 'Verso actions must be present in Open With menu on Windows');
  versoDiff.action();
  assert.deepEqual(plain(calls[0]), {
    targetPath: 'D:\\git\\Verso\\src\\Verso.Core\\Workspace.cs',
    program: 'verso_changes',
    label: 'Verso',
  });
});
test('loadGitStatus displays branch, ahead/behind, Verso toolbar button and updates visible row badges', async () => {
  const statusEl = { textContent: '' };
  const topBtn = { hidden: true };
  const topLabel = { textContent: '' };
  const statusBtn = { hidden: true };
  const rowCell = { className: 'row-git', title: '', textContent: '' };
  const listEl = {
    querySelectorAll: () => [{
      dataset: { index: '0' },
      querySelector: () => rowCell,
    }],
  };
  const elements = {
    'status-git': statusEl,
    'btn-open-verso': topBtn,
    'btn-open-verso-label': topLabel,
    'status-verso-btn': statusBtn,
    'file-list': listEl,
  };
  const ctx = context({
    G: { gitCache: {}, vcsWorkspaceInfo: null },
    getTab: () => ({ path: 'D:\\Projects\\Demo', entries: [{ name: 'hero.png' }] }),
    document: { getElementById: id => elements[id] || null },
    call: async (cmd) => {
      if (cmd === 'git_status') return { 'hero.png': 'modified', 'new.txt': 'added' };
      if (cmd === 'vcs_workspace_info') return { kind: 'verso', repo_root: 'D:\\Projects\\Demo', branch: 'main', ahead: 1, behind: 2, verso_available: true };
      return null;
    },
  });
  load(ctx, 'git.js', ['applyGitBadgesToVisibleRows', 'updateVersoToolbarAndStatusUI', 'loadGitStatus', 'openInVerso', 'openActiveSelectionInVerso']);
  await ctx.loadGitStatus('D:\\Projects\\Demo');
  assert.equal(statusEl.textContent, 'Verso: main \u21911 \u21932 M:1 A:1');
  assert.equal(topBtn.hidden, false);
  assert.equal(topLabel.textContent, 'Verso \u00b7 main');
  assert.equal(statusBtn.hidden, false);
  assert.equal(rowCell.className, 'row-git git-modified');
  assert.equal(rowCell.textContent, '\u25cf');
});
test('cmd-selection-pill[hidden] rule prevents empty oval pill when nothing is selected', () => {
  const css = fs.readFileSync(path.join(root, 'src/css/codex-polish.css'), 'utf8');
  assert.match(css, /\.cmd-selection-pill\[hidden\][\s\S]*?display:\s*none\s*!important/);
});test('Home page renders RHFiles shared drives with capacity bars and Network locations like drives', () => {
  const ctx = context({
    _lang: 'zh-CN',
    esc: s => String(s ?? ''),
    RHFilesUI: { listen: () => {} },
    window: { RHFilesAPI: { invoke: async () => ({}) } },
    document: {
      createElement: tag => ({
        tagName: tag.toUpperCase(),
        className: '',
        dataset: {},
        style: {},
        innerHTML: '',
        children: [],
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...nodes) { this.children = nodes; },
      }),
    },
  });
  load(ctx, 'tabs.js', ['_createHomePeerCard', '_createHomeShareCard']);
  const peer = { group: '1'.repeat(64), groupName: 'Office', peer: '2'.repeat(64), name: 'WINSERVER', path: 'rhfiles-device://' + '1'.repeat(64) + '/' + '2'.repeat(64) + '/' };
  const shareDrive = {
    name: 'D',
    path: peer.path + 'D',
    is_dir: true,
    total_bytes: 1000 * 1024 * 1024 * 1024,
    free_bytes: 400 * 1024 * 1024 * 1024,
  };
  const card = ctx._createHomeShareCard(peer, shareDrive);
  assert.equal(card.className, 'home-drive-card');
  assert.match(card.innerHTML, /<div class="home-drive-letter">D:<\/div>/);
  assert.match(card.innerHTML, /WINSERVER \(Office\)/);
  assert.match(card.innerHTML, /home-drive-bar-fill" style="width:60%/);
  assert.match(card.innerHTML, /400\.0 GB free \/ 1000\.0 GB/);
});

test('Custom device aliases sync via SharedConfig merge and Home page groups drives by machine', () => {
  const SC = JSON.parse(JSON.stringify({}));
  const shared = fs.readFileSync(path.join(root, 'src/js/shared-config.js'), 'utf8');
  const scCtx = context({});
  load(scCtx, 'shared-config.js');
  const SharedConfig = scCtx.RHFilesSharedConfig;
  const peerA = 'a'.repeat(64);
  const peerB = 'b'.repeat(64);
  const base = SharedConfig.empty();
  const local = { ...SharedConfig.empty(), schemaVersion: 2, deviceAliases: { [peerA]: '客厅服务器' } };
  const remote = { ...SharedConfig.empty(), schemaVersion: 2, deviceAliases: { [peerB]: '书房主力机' } };
  const merged = SharedConfig.merge(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.document.schemaVersion, 2);
  assert.deepEqual(plain(merged.document.deviceAliases), {
    [peerA]: '客厅服务器',
    [peerB]: '书房主力机',
  });

  const ctx = context({
    _lang: 'zh-CN',
    esc: s => String(s ?? ''),
    RHFilesUI: { listen: () => {} },
    deviceBrowser: { promptAlias: () => {}, showPeerContextMenu: () => {} },
    window: { RHFilesAPI: { invoke: async () => ({}) } },
    document: {
      createElement: tag => ({
        tagName: tag.toUpperCase(),
        className: '',
        dataset: {},
        style: {},
        innerHTML: '',
        children: [],
        setAttribute() {},
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...nodes) { this.children = nodes; },
      }),
    },
  });
  load(ctx, 'tabs.js', ['_createHomePeerCard', '_createHomeShareCard', '_createHomeDeviceGroupHeader']);
  const aliasedPeer = {
    group: '1'.repeat(64),
    groupName: 'Office',
    peer: peerA,
    name: '客厅服务器',
    alias: '客厅服务器',
    rawName: 'WINSERVER',
    path: 'rhfiles-device://' + '1'.repeat(64) + '/' + peerA + '/',
  };
  const header = ctx._createHomeDeviceGroupHeader(aliasedPeer, true);
  assert.equal(header.className, 'home-device-machine-head');
  assert.match(header.children[0].innerHTML, /客厅服务器/);
  assert.match(header.children[0].innerHTML, /WINSERVER/);
  const shareCard = ctx._createHomeShareCard(aliasedPeer, {
    name: 'C',
    path: aliasedPeer.path + 'C',
    is_dir: true,
    total_bytes: 500 * 1024 * 1024 * 1024,
    free_bytes: 200 * 1024 * 1024 * 1024,
  });
  assert.ok(shareCard.innerHTML.includes('客厅服务器 (WINSERVER · Office)'));
});

test('integration-picker.html loads automation-core.js before integration-picker.js and renders open locations', async () => {
  const html = fs.readFileSync(path.join(root, 'src/integration-picker.html'), 'utf8');
  const coreIdx = html.indexOf('js/automation-core.js');
  const pickerIdx = html.indexOf('js/integration-picker.js');
  assert.ok(coreIdx >= 0 && coreIdx < pickerIdx, 'integration-picker.html must load js/automation-core.js before js/integration-picker.js');

  const elements = new Map();
  const makeEl = (id = '') => ({
    id,
    className: '',
    textContent: '',
    title: '',
    hidden: false,
    disabled: false,
    children: [],
    classList: { toggle() {} },
    setAttribute() {},
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
  });
  for (const id of [
    'picker-title', 'picker-subtitle', 'picker-hint', 'picker-target',
    'picker-compact', 'picker-disable', 'picker-close',
    'picker-open-rhfiles', 'picker-open-rhfiles-compact', 'picker-open-rhfiles-label',
    'picker-choose-rhfiles', 'picker-choose-rhfiles-label',
    'picker-list', 'picker-preview', 'picker-preview-visual',
    'picker-preview-name', 'picker-preview-meta', 'picker-preview-path',
  ]) {
    elements.set(id, makeEl(id));
  }
  const sampleState = {
    locale: 'zh',
    compact: false,
    targetKind: 'windowsFileDialog',
    targetPath: 'D:\\git\\Verso',
    choiceAvailable: true,
    choiceActive: false,
    choiceAllowMultiple: true,
    choiceExtensions: ['png'],
    locations: [
      { id: 'main:left:1', windowLabel: 'main', pane: 'left', path: 'D:\\git\\Verso', active: true },
      { id: 'main:left:2', windowLabel: 'main', pane: 'left', path: 'C:\\Users\\Administrator\\Downloads', active: false },
    ],
  };
  const ctx = context({
    crypto: globalThis.crypto,
    localStorage: { getItem: () => 'false', setItem: () => {} },
    document: {
      documentElement: { lang: 'zh-CN', classList: { toggle() {} } },
      getElementById: id => elements.get(id) || makeEl(id),
      createElement: tag => makeEl(tag),
      addEventListener: () => {},
    },
    window: {
      __TAURI_INTERNALS__: {
        invoke: async cmd => {
          if (cmd === 'set_file_dialog_picker_compact' || cmd === 'get_file_dialog_picker_state') return sampleState;
          return null;
        },
        event: { listen: async () => () => {} },
      },
    },
  });
  ctx.window.window = ctx.window;
  ctx.window.document = ctx.document;
  load(ctx, 'automation-core.js');
  load(ctx, 'integration-picker.js');
  await new Promise(r => setTimeout(r, 20));
  assert.equal(elements.get('picker-target').textContent, 'Windows 打开 / 保存窗口');
  assert.equal(elements.get('picker-choose-rhfiles').hidden, false);
  assert.equal(elements.get('picker-list').children.length, 1);
  assert.equal(elements.get('picker-list').children[0].children.length, 2);
});

test('Per-folder layout remembers normalized folder paths, inherits from parent folders, and never switches image folders from thumbnails to cards', () => {
  const store = new Map();
  const ctx = context({
    G: { layout: 'details', settings: { adaptiveLayout: true, defaultLayout: 'details' } },
    localStorage: {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
    },
    normalizeLayout: l => ['details', 'cards', 'thumbnails', 'columns'].includes(l) ? l : 'details',
    normalizeWindowsPathInput: p => String(p || '').replace(/\//g, '\\'),
    document: { querySelectorAll: () => [] },
  });
  load(ctx, 'tabs.js', ['folderLayoutKey', 'saveFolderLayout', 'loadFolderLayout', 'detectAdaptiveLayout', 'applyFolderLayout']);

  // 1. Adaptive layout for image-heavy folders uses 'thumbnails', never 'cards'
  const imgEntries = [
    { name: '1.png', extension: 'png', is_dir: false },
    { name: '2.jpg', extension: 'jpg', is_dir: false },
    { name: '3.webp', extension: 'webp', is_dir: false },
    { name: '4.png', extension: 'png', is_dir: false },
    { name: 'sub', extension: '', is_dir: true },
  ];
  assert.equal(ctx.detectAdaptiveLayout(imgEntries), 'thumbnails');
  ctx.applyFolderLayout('D:\\Gallery\\Unsaved', imgEntries);
  assert.equal(ctx.G.layout, 'thumbnails');

  // 2. Navigating to a normal code folder without saved layout resets to defaultLayout ('details')
  const codeEntries = [
    { name: 'Cargo.toml', extension: 'toml', is_dir: false },
    { name: 'main.rs', extension: 'rs', is_dir: false },
  ];
  ctx.applyFolderLayout('D:\\git\\Verso', codeEntries);
  assert.equal(ctx.G.layout, 'details');

  // 3. Explicit folder layout is normalized, inherited by subfolders, and does not leak to unrelated folders
  ctx.saveFolderLayout('D:\\Photos\\', 'thumbnails');
  assert.equal(ctx.loadFolderLayout('d:/photos'), 'thumbnails');
  assert.equal(ctx.loadFolderLayout('D:\\Photos\\2026\\Summer'), 'thumbnails');
  assert.equal(ctx.loadFolderLayout('D:\\OtherFolder'), null);
});

test('Desktop rh://Device/C:\\... and Android resolveWindowsDrivePath jump to shared Windows drives and reject unshared drives', async () => {
  const P = JSON.parse(JSON.stringify({}));
  const dpCtx = context({});
  load(dpCtx, 'device-paths.js');
  const Paths = dpCtx.RHFilesDevicePaths;
  const group = 'a'.repeat(64);
  const peer = 'b'.repeat(64);
  const peers = [{ group, groupName: 'Office', peer, name: 'Winserver' }];

  // 1. Desktop parseAddress / resolveAddress supports backslash and slash Windows drive paths
  const r1 = Paths.resolveAddress('rh://Winserver/C:\\Users\\40608\\Documents\\A\\B\\C', peers);
  assert.equal(r1.windowsDrive, 'C');
  assert.equal(r1.path, Paths.make(group, peer, '/C/Users/40608/Documents/A/B/C'));

  const r2 = Paths.resolveAddress('rh://Winserver/c:/Users/40608/Documents/A/B/C', peers);
  assert.equal(r2.windowsDrive, 'C');
  assert.equal(r2.path, Paths.make(group, peer, '/C/Users/40608/Documents/A/B/C'));

  // 2. Desktop navigateAddressInput checks whether the drive is actually shared on that device
  const notices = [];
  const navigated = [];
  let sharedRoots = [{ name: 'C', is_dir: true, path: Paths.make(group, peer, '/C') }];
  const navCtx = context({
    _lang: 'zh-CN',
    IS_MAC: false,
    RHFilesDevicePaths: Paths,
    window: {
      RHFilesAPI: {
        invoke: async (id, args) => {
          if (id === 'devices.resolve') return Paths.resolveAddress(args.address, peers);
          throw Error('Unexpected API ' + id);
        },
      },
    },
    normalizeWindowsPathInput: v => v,
    listPathEntries: async () => sharedRoots,
    call: async (cmd) => {
      if (cmd === 'get_file_info') return { is_dir: true };
      return null;
    },
    showNotice: msg => notices.push(msg),
    navigateTo: async p => { navigated.push(p); return true; },
    rpNavigateTo: async p => { navigated.push(p); return true; },
  });
  load(navCtx, 'tabs.js', ['navigateAddressInput']);

  const ok = await navCtx.navigateAddressInput('rh://Winserver/C:\\Users\\40608\\Documents\\A\\B\\C', false);
  assert.equal(ok, true);
  assert.equal(navigated.at(-1), Paths.make(group, peer, '/C/Users/40608/Documents/A/B/C'));

  // When only a normal folder 'Documents' is shared (not C drive), jumping via C:\... is rejected
  sharedRoots = [{ name: 'Documents', is_dir: true, path: Paths.make(group, peer, '/Documents') }];
  const rejected = await navCtx.navigateAddressInput('rh://Winserver/C:\\Users\\40608\\Documents\\A\\B\\C', false);
  assert.equal(rejected, false);
  assert.match(notices.at(-1), /未共享 C 盘/);

  // 3. Android mobileList.resolveWindowsDrivePath
  const androidListMod = fs.readFileSync(path.join(root, 'android/web/js/list-model.js'), 'utf8');
  const andCtx = context({});
  load(andCtx, '../../android/web/js/list-model.js');
  const mobileList = andCtx.mobileList;
  const remoteRoot = 'remote://11111111-1111-4111-8111-111111111111/';
  const androidShares = [
    { name: 'C', path: remoteRoot + 'C', isDir: true },
    { name: 'D', path: remoteRoot + 'D', isDir: true },
    { name: 'Movies', path: remoteRoot + 'Movies', isDir: true },
  ];
  assert.deepEqual(plain(mobileList.sharedDriveLetters(androidShares)), ['C', 'D']);

  const jump1 = mobileList.resolveWindowsDrivePath('C:\\Users\\40608\\Documents\\A\\B\\C', remoteRoot, androidShares);
  assert.equal(jump1.drive, 'C');
  assert.equal(jump1.path, remoteRoot + 'C/Users/40608/Documents/A/B/C');
  assert.equal(jump1.parentPath, remoteRoot + 'C/Users/40608/Documents/A/B');
  assert.equal(jump1.chain.length, 7);

  const jump2 = mobileList.resolveWindowsDrivePath('d:/Projects/Verso', remoteRoot, androidShares);
  assert.equal(jump2.drive, 'D');
  assert.equal(jump2.path, remoteRoot + 'D/Projects/Verso');

  assert.throws(
    () => mobileList.resolveWindowsDrivePath('E:\\Backup\\Data', remoteRoot, androidShares),
    /未共享 E 盘/
  );
  assert.throws(
    () => mobileList.resolveWindowsDrivePath('C:\\Users\\40608', remoteRoot, [{ name: 'Movies', path: remoteRoot + 'Movies', isDir: true }]),
    /未共享 C 盘/
  );
});

test('Android and Desktop favorites, properties, breadcrumbs and copy-path display rh:// short addresses instead of remote:// or rhfiles-device:// IDs', () => {
  const fmtCtx = context({});
  load(fmtCtx, '../../android/web/js/format.js');
  const fmt = fmtCtx.fmt;

  // 1. fmt.parentOf never slices remote://<uuid>/ into remote:/
  const devUuid = '550e8400-e29b-41d4-a716-446655440000';
  const rootUri = 'remote://' + devUuid + '/';
  assert.equal(fmt.parentOf(rootUri), rootUri);
  assert.equal(fmt.parentOf(rootUri + 'C'), rootUri);
  assert.equal(fmt.parentOf(rootUri + 'C/Users'), rootUri + 'C');

  // 2. Android app.js pathLabel / copyablePath / favoriteLabel / breadcrumbs format rhfiles roots as rh://
  const appSource = fs.readFileSync(path.join(root, 'android/web/js/app.js'), 'utf8');
  assert.ok(appSource.includes("return 'rh://' + root.label + (tail || '/');"), 'app.js must format rhfiles device paths as rh://');
  assert.ok(appSource.includes("const locationInfo = state.route.screen === 'favorites' ? pathLabel(entry.path)"), 'favorites screen must display pathLabel(entry.path)');
  assert.ok(appSource.includes("],pathLabel(entry.path));"), 'favoriteMenu must display pathLabel(entry.path) instead of raw entry.path');

  // 3. Desktop sidebar.js favoriteDisplayName and renderPinnedFolders use readable rh:// address
  const P = JSON.parse(JSON.stringify({}));
  const dpCtx = context({});
  load(dpCtx, 'device-paths.js');
  const Paths = dpCtx.RHFilesDevicePaths;
  const group = 'a'.repeat(64);
  const peer = 'b'.repeat(64);
  const devPath = Paths.make(group, peer, '/C/Users/40608/Documents');
  const sbCtx = context({
    IS_MAC: false,
    RHFilesDevicePaths: Paths,
    isDevicePath: Paths.is,
    deviceBrowser: {
      name: () => 'WINSERVER',
      address: p => Paths.addressFor(p, [{ group, groupName: 'Office', peer, name: 'WINSERVER' }]),
    },
    displayPath: p => p,
  });
  load(sbCtx, 'sidebar.js', ['favoriteDisplayName']);
  assert.equal(sbCtx.favoriteDisplayName(Paths.make(group, peer, '/')), 'WINSERVER');
  assert.equal(sbCtx.favoriteDisplayName(devPath), 'Documents');
});
