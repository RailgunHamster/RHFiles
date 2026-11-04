import test from 'node:test';
import assert from 'node:assert/strict';
import {context,load,plain} from '../testing/source.mjs';
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
test('loadGitStatus displays branch, ahead/behind and Verso workspace prefix', async () => {
  const statusEl = { textContent: '' };
  const ctx = context({
    G: { gitCache: {}, vcsWorkspaceInfo: null },
    getTab: () => ({ path: 'D:\\Projects\\Demo' }),
    document: { getElementById: id => (id === 'status-git' ? statusEl : null) },
    call: async (cmd) => {
      if (cmd === 'git_status') return { 'hero.png': 'modified', 'new.txt': 'added' };
      if (cmd === 'vcs_workspace_info') return { kind: 'verso', repo_root: 'D:\\Projects\\Demo', branch: 'main', ahead: 1, behind: 2, verso_available: true };
      return null;
    },
  });
  load(ctx, 'git.js', ['loadGitStatus', 'openInVerso']);
  await ctx.loadGitStatus('D:\\Projects\\Demo');
  assert.equal(statusEl.textContent, 'Verso: main \u21911 \u21932 M:1 A:1');
});