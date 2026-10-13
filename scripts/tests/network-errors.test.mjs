import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {context, load, root} from '../testing/source.mjs';

for (const language of ['zh', 'en']) {
  const dictionary = JSON.parse(fs.readFileSync(path.join(root, `src/i18n/${language}.json`), 'utf8'));
  for (const code of ['timed_out', 'network_cooldown', 'network_busy']) {
    test(`${language}: ${code} is localized, logged and displayed as unavailable, not empty`, async () => {
      const original = `[${code}] original diagnostic`;
      const logs = [];
      const ctx = context({invoke:async () => { throw original; }, normalizeInvokeArgs:x => x,
        logInvokeFailure:(...args) => logs.push(args), t:key => dictionary[key]});
      load(ctx, 'common.js', ['call']);
      load(ctx, 'tabs.js', ['describeNavigationError']);
      assert.equal(typeof dictionary[`network.${code}`], 'string');
      let caught;
      try { await ctx.call('list_dir', {path:'\\\\server\\share'}); } catch (error) { caught = error; }
      assert.equal(caught, `[${code}] ${dictionary[`network.${code}`]}`);
      assert.equal(logs[0][1], original);
      assert.equal(ctx.describeNavigationError(caught).key, 'unavailable');
    });
  }
}

test('path-existence permission failures remain failures rather than false', async () => {
  const original = 'Access is denied (os error 5)';
  const ctx = context({invoke:async () => { throw original; }, normalizeInvokeArgs:x => x, logInvokeFailure:() => {}});
  load(ctx, 'common.js', ['call']);
  await assert.rejects(ctx.call('path_exists', {path:'C:\\private'}), error => error === original);
});
