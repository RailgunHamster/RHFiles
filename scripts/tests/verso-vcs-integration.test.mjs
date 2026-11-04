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
});