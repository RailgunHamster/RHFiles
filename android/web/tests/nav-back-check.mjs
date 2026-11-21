import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserFixture } from './browser-fixture.mjs';

const fixture = await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
let checks = 0;
const check = (value, label) => { assert.ok(value, label); console.log('ok ' + (++checks) + ' - ' + label); };

async function openApp({ restore = false, initialNav = null } = {}) {
  const context = await fixture.browser.newContext({ viewport: { width: 412, height: 892 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await context.addInitScript(({ restore, initialNav }) => {
    const root = '/storage/emulated/0';
    const sd = '/storage/SDCARD';
    const remoteId = '11111111-2222-3333-4444-555555555555';
    const remoteRoot = 'remote://' + remoteId + '/';
    const dir = (p, name = p.split('/').pop()) => ({ name, path: p, isDir: true, kind: 'folder', size: 0, modifiedMs: 1 });
    const file = (p, kind = 'document') => ({ name: p.split('/').pop(), path: p, isDir: false, kind, size: 12, modifiedMs: 1 });
    const fs = {
      [root]: [dir(root + '/Work'), dir(root + '/Other'), dir(root + '/DCIM')],
      [root + '/Work']: [dir(root + '/Work/Deep'), file(root + '/Work/w.txt')],
      [root + '/Work/Deep']: [dir(root + '/Work/Deep/Leaf'), file(root + '/Work/Deep/d.txt')],
      [root + '/Work/Deep/Leaf']: [file(root + '/Work/Deep/Leaf/l.txt')],
      [root + '/Other']: [file(root + '/Other/o.txt')],
      [root + '/DCIM']: [file(root + '/DCIM/pic.jpg', 'image')],
      [sd]: [file(sd + '/sd.txt')],
      [remoteRoot]: [dir(remoteRoot + 'Share', 'Share')],
      [remoteRoot + 'Share']: [dir(remoteRoot + 'Share/Sub', 'Sub'), file(remoteRoot + 'Share/s.txt')],
      [remoteRoot + 'Share/Sub']: [file(remoteRoot + 'Share/Sub/n.txt')],
    };
    const indexed = Object.values(fs).flat().filter(e => !e.isDir && !e.path.startsWith('remote://'));
    if (!localStorage.getItem('rhfiles.favorites')) {
      localStorage.setItem('rhfiles.favorites', JSON.stringify([
        { path: root + '/Work/Deep/Leaf', name: 'Leaf', isDir: true },
        { path: root + '/Work', name: 'Work', isDir: true },
        { path: root + '/Other', name: 'Other', isDir: true },
      ]));
    }
    if (initialNav && !sessionStorage.getItem('seeded-nav')) {
      sessionStorage.setItem('seeded-nav', '1');
      localStorage.setItem('rhfiles.navigation', JSON.stringify(initialNav));
    }
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args = {}) => {
        switch (cmd) {
          case 'debug_note': return;
          case 'get_permission_status': return { manageExternalStorage: true, sharedStorageReadable: true };
          case 'get_storage_roots': return [
            { path: root, label: '内部存储', removable: false },
            { path: sd, label: '外部存储', removable: true },
          ];
          case 'index_status': return { entryCount: indexed.length, indexing: false, lastFinishedMs: Date.now() };
          case 'app_info': return { version: 'nav-back-test' };
          case 'list_dir': {
            const key = args.path === 'remote://' + remoteId ? remoteRoot : args.path;
            if (!fs[key]) throw Error('missing ' + args.path);
            return { path: key, entries: structuredClone(fs[key]) };
          }
          case 'browse_library_folders':
          case 'browse_library':
            return { entries: indexed.filter(e => e.kind === args.category) };
          case 'read_thumbnail': return {};
          default: throw Error('Unmocked rust ' + cmd);
        }
      },
    };
    window.RHFilesNative = {
      postMessage(raw) {
        const { id, command, args = {} } = JSON.parse(raw);
        Promise.resolve().then(async () => {
          switch (command) {
            case 'capabilities': return { version: 3, nativeBack: true, restoreNavigation: restore };
            case 'permission':
            case 'theme': return true;
            case 'window.layout': return {};
            case 'roots': return [
              { path: root, label: '内部存储', removable: false },
              { path: sd, label: '外部存储', removable: true },
              { path: remoteRoot, label: '家用 NAS', network: true, provider: true, protocol: 'smb' },
            ];
            case 'connections': return [{ id: remoteId, name: '家用 NAS', path: remoteRoot, protocol: 'smb' }];
            case 'connection.get': return { id: args.id, name: '家用 NAS', path: 'remote://' + args.id + '/', protocol: 'smb', needsPassword: false };
            case 'shares':
            case 'jobs':
            case 'connection.retired': return [];
            case 'media.library': return { entries: indexed.filter(e => e.kind === args.category) };
            case 'list': {
              const key = args.path === 'remote://' + remoteId ? remoteRoot : args.path;
              if (!fs[key]) throw Error('missing remote ' + args.path);
              return { path: key, entries: structuredClone(fs[key]) };
            }
            default: throw Error('Unmocked native ' + command);
          }
        }).then(
          result => window.RHFilesNative.onmessage({ data: JSON.stringify({ id, result }) }),
          err => window.RHFilesNative.onmessage({ data: JSON.stringify({ id, error: err.message }) }),
        );
      },
    };
  }, { restore, initialNav });
  await page.goto(fixture.url);
  await page.waitForFunction(() => window.rhfilesPane?.snapshot().ready);
  return { context, page, errors };
}

const row = (p, name) => p.locator('#filelist [role=option]').filter({ has: p.locator('.name', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) });
const titleOf = (p) => p.locator('#title').innerText();
const waitTitle = (p, expected) => p.waitForFunction((want) => document.getElementById('title')?.textContent === want, expected);
const back = (p) => p.evaluate(() => window.rhfilesHandleBack());

try {
  // 1, 2A, 3, 5 in live navigation flow
  {
    const { context, page: p, errors } = await openApp();

    // Rule 1: Favorites -> deep folder -> swipe back returns to Favorites; #btn-up goes to parent folder
    await p.locator('[data-tile=favorites]').click();
    await row(p, 'Leaf').waitFor();
    await row(p, 'Leaf').click();
    await row(p, 'l.txt').waitFor();
    check(await back(p) === true, 'Back from favorite folder is handled');
    await waitTitle(p, '收藏夹');
    check(await titleOf(p) === '收藏夹', 'Rule 1: swipe back from favorite deep folder returns to Favorites, not parent folder');

    await row(p, 'Leaf').click();
    await row(p, 'l.txt').waitFor();
    await p.locator('#btn-up').click();
    await row(p, 'd.txt').waitFor();
    check(await titleOf(p) === 'Deep', 'Rule 1: pathbar Up button goes to physical parent directory');
    // Rule 2A: swipe back right after #btn-up returns to Leaf
    await back(p);
    await row(p, 'l.txt').waitFor();
    check(await titleOf(p) === 'Leaf', 'Rule 2A: swipe back after Up returns to the previous folder');
    await back(p);
    await waitTitle(p, '收藏夹');
    await back(p);
    await p.waitForSelector('#home:not([hidden])');
    check(await back(p) === false, 'Back reaches Home and then permits exit');

    // Rule 1 (Library folder opened from History)
    await p.locator('[data-tile=image]').click();
    await row(p, 'DCIM').click();
    await row(p, 'pic.jpg').waitFor();
    await p.locator('#btn-home').click();
    await p.waitForSelector('#home:not([hidden])');
    await p.locator('#btn-menu').click();
    await p.locator('#nav-history').click();
    await p.locator('.visit-history-open').filter({ hasText: 'DCIM · 图片' }).click();
    await row(p, 'pic.jpg').waitFor();
    await back(p);
    await waitTitle(p, '历史记录');
    check(await titleOf(p) === '历史记录', 'Rule 1: swipe back from History-opened category album returns to History');
    await p.locator('.visit-history-open').filter({ hasText: 'DCIM · 图片' }).click();
    await row(p, 'pic.jpg').waitFor();
    await p.locator('#btn-up').click();
    await row(p, 'DCIM').waitFor();
    check(await titleOf(p) === '图片', 'Rule 1: Up button in category album goes to category root');
    await back(p);
    await row(p, 'pic.jpg').waitFor();
    check(await titleOf(p) === '图片 · DCIM', 'Rule 2A: swipe back after category Up returns to album');

    // Rule 2A: Breadcrumb jump preserves previous folder on top of back stack
    await p.locator('#btn-home').click();
    await p.locator('[data-tile=storage-0]').click();
    await row(p, 'Work').click();
    await row(p, 'Deep').click();
    await row(p, 'Leaf').click();
    await row(p, 'l.txt').waitFor();
    await p.locator('#crumbs').getByRole('button', { name: 'Work', exact: true }).click();
    await row(p, 'w.txt').waitFor();
    check(await titleOf(p) === 'Work', 'Breadcrumb jumps to Work');
    await back(p);
    await row(p, 'l.txt').waitFor();
    check(await titleOf(p) === 'Leaf', 'Rule 2A: swipe back after breadcrumb jump returns to Leaf');
    await back(p);
    await row(p, 'd.txt').waitFor();
    check(await titleOf(p) === 'Deep', 'Continuing back follows folded stack (Deep -> 内部存储 -> Home without repeating Work)');
    await back(p);
    await waitTitle(p, '内部存储');
    await back(p);
    await p.waitForSelector('#home:not([hidden])');
    check(true, 'Folded stack avoids visiting Work twice before Home');

    // Rule 3: Drawer switch from 内部存储/Work to 外部存储 -> swipe back returns to Work
    await p.locator('[data-tile=storage-0]').click();
    await row(p, 'Work').click();
    await row(p, 'w.txt').waitFor();
    await p.locator('#btn-menu').click();
    await p.locator('#roots').getByRole('button', { name: '外部存储', exact: true }).click();
    await row(p, 'sd.txt').waitFor();
    await back(p);
    await row(p, 'w.txt').waitFor();
    check(await titleOf(p) === 'Work', 'Rule 3: swipe back after drawer storage switch returns to 内部存储/Work');

    // Rule 5: Loop folding under repeated drawer ping-pong Work <-> Other
    for (let i = 0; i < 4; i++) {
      await p.locator('#btn-menu').click();
      await p.locator('#nav-favorites').getByRole('button', { name: 'Other', exact: true }).click();
      await row(p, 'o.txt').waitFor();
      await p.locator('#btn-menu').click();
      await p.locator('#nav-favorites').getByRole('button', { name: 'Work', exact: true }).click();
      await row(p, 'w.txt').waitFor();
    }
    const visited = [];
    for (let step = 0; step < 8; step++) {
      const handled = await back(p);
      if (!handled) break;
      await p.waitForTimeout(40);
      visited.push(await titleOf(p));
    }
    check(
      JSON.stringify(visited) === JSON.stringify(['Other', '内部存储', 'RHFiles']),
      'Rule 5: ping-pong loop folds cleanly (' + JSON.stringify(visited) + ')'
    );
    check(errors.length === 0, 'No page errors in Rules 1/2A/3/5: ' + errors.join('; '));
    await context.close();
  }

  // Rule 4a: Empty stack on local deep folder falls back to parent folders -> Home -> exit
  {
    const { context, page: p, errors } = await openApp({
      restore: true,
      initialNav: {
        version: 1,
        root: '/storage/emulated/0',
        route: { screen: 'folder', path: '/storage/emulated/0/Work/Deep/Leaf' },
        stack: [],
        selected: [],
        clipboard: null,
      },
    });
    await row(p, 'l.txt').waitFor();
    const steps = [];
    for (const want of ['Deep', 'Work', '内部存储', 'RHFiles']) {
      check(await back(p) === true, 'Empty-stack back steps toward ' + want);
      await waitTitle(p, want);
      steps.push(await titleOf(p));
    }
    check(JSON.stringify(steps) === JSON.stringify(['Deep', 'Work', '内部存储', 'RHFiles']), 'Rule 4: empty stack walks up local parents without looping');
    check(await back(p) === false, 'Rule 4: exits cleanly once Home is reached');
    check(errors.length === 0, 'No page errors in Rule 4 local: ' + errors.join('; '));
    await context.close();
  }

  // Rule 4b: Empty stack on remote deep folder falls back to parent shares -> Home -> exit
  {
    const { context, page: p, errors } = await openApp({
      restore: true,
      initialNav: {
        version: 1,
        root: '/storage/emulated/0',
        route: { screen: 'folder', path: 'remote://11111111-2222-3333-4444-555555555555/Share/Sub' },
        stack: [],
        selected: [],
        clipboard: null,
      },
    });
    await row(p, 'n.txt').waitFor();
    for (const want of ['Share', '家用 NAS', 'RHFiles']) {
      check(await back(p) === true, 'Empty-stack remote back steps toward ' + want);
      await waitTitle(p, want);
    }
    check(await back(p) === false, 'Rule 4: remote empty stack exits cleanly at Home');
    check(errors.length === 0, 'No page errors in Rule 4 remote: ' + errors.join('; '));
    await context.close();
  }

  // Rule 4c: Empty stack on library album falls back to category -> Home -> exit
  {
    const { context, page: p, errors } = await openApp({
      restore: true,
      initialNav: {
        version: 1,
        root: '/storage/emulated/0',
        route: { screen: 'library', category: 'image', folder: '/storage/emulated/0/DCIM' },
        stack: [],
        selected: [],
        clipboard: null,
      },
    });
    await row(p, 'pic.jpg').waitFor();
    check(await back(p) === true, 'Empty-stack library album back returns to category');
    await waitTitle(p, '图片');
    check(await back(p) === true, 'Empty-stack library category back returns to Home');
    await waitTitle(p, 'RHFiles');
    check(await back(p) === false, 'Rule 4: library empty stack exits cleanly at Home');
    check(errors.length === 0, 'No page errors in Rule 4 library: ' + errors.join('; '));
    await context.close();
  }

  console.log('PASS ' + checks + ' navigation back/up/folding checks');
} finally {
  await fixture.close();
}
