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