import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserFixture } from './browser-fixture.mjs';

const fixture = await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
let checks = 0;
const check = (value, label) => { assert.ok(value, label); console.log('ok ' + (++checks) + ' - ' + label); };

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

async function openApp({ dualPane = false, viewport = { width: 412, height: 892 } } = {}) {
  const context = await fixture.browser.newContext({ viewport, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await context.addInitScript(({ dualPane, tinyPng }) => {
    if (window.parent !== window) return;
    const root = '/storage/emulated/0';
    const file = (name, kind = 'document') => ({ name, path: root + '/' + name, isDir: false, kind, size: 120, modifiedMs: 1 });
    const texts = {
      [root + '/report.html']: '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=https://evil.example"><style>h1{color:rgb(200, 40, 60)}.card{padding:8px}</style></head><body onclick="window.__xss=1"><h1 class="card">HTML 报告</h1><p>正文内容</p><img id="ok" src="' + tinyPng + '"><img id="bad" src="https://evil.example/a.png" onerror="window.__xss=2"><script>window.__xss=3</script><a id="ext" href="https://evil.example">外链</a><a id="hash" href="#top">锚点</a></body></html>',
      [root + '/note.md']: '# 标题\n\n普通段落',
      [root + '/data.json']: '{"ok":true,"items":[1,2]}',
      [root + '/plain.txt']: 'hello fullscreen text',
    };
    const model = window.__previewModel = { fullscreenCalls: [], fs: { [root]: [file('report.html'), file('note.md'), file('data.json'), file('plain.txt'), file('photo.png', 'image'), file('bundle.zip', 'archive')] } };
    window.__TAURI_INTERNALS__ = {
      convertFileSrc: () => tinyPng,
      invoke: async (cmd, args = {}) => {
        switch (cmd) {
          case 'debug_note': return;
          case 'get_permission_status': return { manageExternalStorage: true, sharedStorageReadable: true };
          case 'get_storage_roots': return [{ path: root, label: '内部存储' }];
          case 'index_status': return { entryCount: 6, indexing: false, lastFinishedMs: Date.now() };
          case 'app_info': return { version: 'html-fs-test' };
          case 'list_dir': return { path: args.path, entries: structuredClone(model.fs[args.path] || []) };
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
            case 'capabilities': return { version: 3, nativeBack: true, dualPane, adaptiveLayout: true, windowFullscreen: true };
            case 'permission':
            case 'theme': return true;
            case 'window.layout': return {};
            case 'window.fullscreen': model.fullscreenCalls.push(!!args.enabled); return true;
            case 'roots': return [{ path: root, label: '内部存储' }];
            case 'shares':
            case 'jobs':
            case 'connection.retired': return [];
            case 'text.preview': {
              const text = texts[args.path];
              if (text === undefined) throw Error('missing text ' + args.path);
              return { text, encoding: 'UTF-8', truncated: false, bytesRead: text.length, maxBytes: args.maxBytes || 262144 };
            }
            case 'text.preview.cancel': return true;
            case 'text.read': return { text: texts[args.path] || '', revision: 'rev-1' };
            case 'archive.list': return [{ name: 'inside.txt', size: 42, isDir: false }];
            case 'media.image': return { dataUrl: tinyPng };
            default: throw Error('Unmocked native ' + command);
          }
        }).then(
          result => window.RHFilesNative.onmessage({ data: JSON.stringify({ id, result }) }),
          err => window.RHFilesNative.onmessage({ data: JSON.stringify({ id, error: err.message }) }),
        );
      },
    };
  }, { dualPane, tinyPng });
  await page.goto(fixture.url);
  if (dualPane) {
    await page.waitForFunction(() => [...document.querySelectorAll('.file-pane')].length === 2 && [...document.querySelectorAll('.file-pane')].every(f => f.contentWindow?.rhfilesPane?.snapshot().ready));
  } else {
    await page.waitForFunction(() => window.rhfilesPane?.snapshot().ready);
  }
  return { context, page, errors };
}

try {
  // 1. Single-pane HTML preview + fullscreen across HTML, Markdown, JSON, Plain Text, Image, Editor, Archive
  {
    const { context, page: p, errors } = await openApp();
    await p.locator('[data-tile=storage-0]').click();
    await p.locator('#filelist .name').getByText('report.html', { exact: true }).click();
    await p.locator('iframe.text-preview-html-frame').waitFor();

    const htmlState = await p.evaluate(() => RHFilesAPI.invoke('preview.text.state'));
    check(htmlState.mode === 'preview' && htmlState.fullscreen === false, 'HTML file opens in rendered preview mode by default');

    const sandboxAttr = await p.locator('iframe.text-preview-html-frame').getAttribute('sandbox');
    check(sandboxAttr === '', 'HTML preview iframe uses maximum-restriction empty sandbox attribute');

    const srcdoc = await p.locator('iframe.text-preview-html-frame').getAttribute('srcdoc');
    check(srcdoc.includes('HTML 报告') && srcdoc.includes('color:rgb(200, 40, 60)'), 'HTML preview preserves document markup and author styles');
    check(!/<script\b/i.test(srcdoc) && !/onerror=/i.test(srcdoc) && !/onclick=/i.test(srcdoc) && !/https:\/\/evil\.example/i.test(srcdoc), 'HTML preview strips scripts, inline handlers, and external URLs');
    check(srcdoc.includes('href="#top"') && srcdoc.includes(tinyPng), 'HTML preview keeps safe in-page anchors and embedded data:image URIs');

    // Toggle HTML Source / Preview
    await p.locator('[data-preview-action=source]').click();
    await p.locator('.text-preview-source').waitFor();
    check((await p.evaluate(() => RHFilesAPI.invoke('preview.text.state'))).mode === 'source', 'HTML preview can switch to Source mode');
    await p.locator('[data-preview-action=preview]').click();
    await p.locator('iframe.text-preview-html-frame').waitFor();
    check((await p.evaluate(() => RHFilesAPI.invoke('preview.text.state'))).mode === 'preview', 'HTML preview can switch back to rendered Preview mode');

    // Enter Fullscreen on HTML preview
    await p.locator('[data-preview-action=fullscreen]').click();
    check(await p.locator('#sheet-panel.preview-fullscreen').isVisible(), 'HTML preview enters fullscreen panel mode');
    check(await p.locator('.preview-fullscreen-exit').isVisible(), 'Fullscreen mode exposes floating Exit Fullscreen pill');
    check(!await p.locator('.text-preview-header').isVisible(), 'Fullscreen hides preview header chrome for maximum canvas');
    const box = await p.locator('iframe.text-preview-html-frame').boundingBox();
    check(Math.abs(box.width - 412) <= 2 && Math.abs(box.height - 892) <= 2, 'HTML iframe fills 100% of viewport in fullscreen (' + Math.round(box.width) + 'x' + Math.round(box.height) + ')');
    check(await p.evaluate(() => window.__previewModel.fullscreenCalls.at(-1) === true), 'Native window.fullscreen(true) is called');

    // Swipe back exits fullscreen FIRST, then closes preview
    check(await p.evaluate(() => window.rhfilesHandleBack()) === true, 'First Back consumes fullscreen exit');
    check(!await p.locator('#sheet-panel.preview-fullscreen').count() && await p.locator('iframe.text-preview-html-frame').isVisible(), 'First Back exits fullscreen while keeping preview open');
    check(await p.evaluate(() => window.__previewModel.fullscreenCalls.at(-1) === false), 'Native window.fullscreen(false) is restored on exit');
    check(await p.evaluate(() => window.rhfilesHandleBack()) === true, 'Second Back closes HTML preview');
    check(await p.locator('#sheet').isHidden(), 'HTML preview closes cleanly');

    // Markdown fullscreen + floating exit button
    await p.locator('#filelist .name').getByText('note.md', { exact: true }).click();
    await p.locator('.text-preview-markdown').waitFor();
    await p.locator('[data-preview-action=fullscreen]').click();
    check(await p.locator('#sheet-panel.preview-fullscreen').isVisible(), 'Markdown preview supports fullscreen');
    await p.locator('.preview-fullscreen-exit').click();
    check(!await p.locator('#sheet-panel.preview-fullscreen').count() && await p.locator('.text-preview-header').isVisible(), 'Floating Exit Fullscreen restores normal Markdown preview');
    await p.locator('[data-preview-action=close]').click();

    // JSON fullscreen
    await p.locator('#filelist .name').getByText('data.json', { exact: true }).click();
    await p.locator('.text-preview-source').waitFor();
    await p.locator('[data-preview-action=fullscreen]').click();
    check((await p.evaluate(() => RHFilesAPI.invoke('preview.text.state'))).fullscreen === true, 'JSON preview supports fullscreen');
    await p.evaluate(() => RHFilesAPI.invoke('preview.text.control', { command: 'close' }));
    check(await p.evaluate(() => window.__previewModel.fullscreenCalls.at(-1) === false), 'Closing preview directly from fullscreen resets native fullscreen');

    // Image gallery fullscreen (paged & continuous)
    await p.locator('#filelist .name').getByText('photo.png', { exact: true }).click();
    await p.locator('#sheet-panel.image-viewer').waitFor();
    await p.locator('#sheet-panel [aria-label="全屏"]').click();
    check((await p.evaluate(() => RHFilesAPI.invoke('gallery.state'))).fullscreen === true && await p.locator('#sheet-panel.preview-fullscreen.chrome-hidden').count() === 1, 'Paged image gallery supports fullscreen and hides chrome');
    await p.evaluate(() => window.rhfilesHandleBack());
    check((await p.evaluate(() => RHFilesAPI.invoke('gallery.state'))).fullscreen === false && await p.locator('#sheet-panel.image-viewer').isVisible(), 'Back exits image gallery fullscreen before closing');
    await p.evaluate(() => window.rhfilesHandleBack());
    check(await p.locator('#sheet').isHidden(), 'Second Back closes image gallery');

    // Archive preview fullscreen
    await p.locator('#filelist .name').getByText('bundle.zip', { exact: true }).click();
    await p.locator('.archive-entries').waitFor();
    await p.locator('[data-preview-action=fullscreen]').click();
    check(await p.locator('#sheet-panel.preview-fullscreen').isVisible(), 'Archive preview supports fullscreen');
    await p.evaluate(() => window.rhfilesHandleBack());
    check(!await p.locator('#sheet-panel.preview-fullscreen').count() && await p.locator('.archive-entries').isVisible(), 'Back exits archive fullscreen');
    await p.evaluate(() => window.rhfilesHandleBack());

    check(errors.length === 0, 'No page errors in single-pane HTML & fullscreen checks: ' + errors.join('; '));
    await context.close();
  }

  // 2. Dual-pane fullscreen expands active pane over split screen and restores both panes cleanly
  {
    const { context, page: p, errors } = await openApp({ dualPane: true, viewport: { width: 1280, height: 900 } });
    const first = p.frames().find(f => new URL(f.url()).searchParams.get('pane') === 'first');
    const second = p.frames().find(f => new URL(f.url()).searchParams.get('pane') === 'second');
    await first.locator('[data-tile=storage-0]').click();
    await first.locator('#filelist .name').getByText('report.html', { exact: true }).click();
    await first.locator('iframe.text-preview-html-frame').waitFor();

    const beforeBox = await p.locator('.file-pane').first().boundingBox();
    check(beforeBox.width < 700, 'Before fullscreen, first pane occupies half of dual-pane width (' + Math.round(beforeBox.width) + 'px)');

    await first.locator('[data-preview-action=fullscreen]').click();
    await p.waitForSelector('#workbench.pane-fullscreen');
    const fullBox = await p.locator('.file-pane').first().boundingBox();
    check(Math.abs(fullBox.width - 1280) <= 2 && !await p.locator('.pane-divider').isVisible() && !await p.locator('.file-pane').nth(1).isVisible(), 'Dual-pane fullscreen expands preview pane across entire 1280px window');
    check(await p.evaluate(() => window.__previewModel.fullscreenCalls.at(-1) === true), 'Dual-pane host forwards window.fullscreen(true)');

    await p.evaluate(() => window.rhfilesHandleBack());
    await p.waitForFunction(() => !document.getElementById('workbench').classList.contains('pane-fullscreen'));
    check(await p.locator('.pane-divider').isVisible() && await p.locator('.file-pane').nth(1).isVisible(), 'Exiting fullscreen restores split-pane layout and peer pane');
    check(await second.locator('#home').isVisible(), 'Peer pane route survives fullscreen toggle');
    check(await p.evaluate(() => window.__previewModel.fullscreenCalls.at(-1) === false), 'Dual-pane host forwards window.fullscreen(false) on exit');

    check(errors.length === 0, 'No page errors in dual-pane fullscreen checks: ' + errors.join('; '));
    await context.close();
  }

  console.log('PASS ' + checks + ' HTML preview & fullscreen checks');
} finally {
  await fixture.close();
}
