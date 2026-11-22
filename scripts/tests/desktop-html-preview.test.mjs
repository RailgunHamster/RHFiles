import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { context, sourceRoot } from '../testing/source.mjs';

function loadPane() {
  const listeners = new Map();
  const makeEl = (tag) => {
    const attrs = new Map();
    const classes = new Set();
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      dataset: {},
      hidden: false,
      children: [],
      textContent: '',
      title: '',
      srcdoc: '',
      classList: {
        add: (...c) => c.forEach(x => classes.add(x)),
        remove: (...c) => c.forEach(x => classes.delete(x)),
        toggle: (x, force) => (force === undefined ? (classes.has(x) ? (classes.delete(x), false) : (classes.add(x), true)) : (force ? (classes.add(x), true) : (classes.delete(x), false))),
        contains: (x) => classes.has(x),
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      append: (...nodes) => el.children.push(...nodes),
      querySelector: (sel) => el._queries?.[sel] || null,
    };
    return el;
  };
  const ctx = context({
    G: { previewOn: true, inspectorTab: 'preview', lastActivePane: 'left', settings: {} },
    t: (k) => k,
    esc: (s) => String(s ?? ''),
    getSelectedPaths: () => [{ path: 'C:\\demo\\index.html', name: 'index.html', extension: 'html' }],
    RHFilesUI: { listen: (node, ev, fn) => listeners.set(node, fn) },
    document: { createElement: makeEl, addEventListener: () => {} },
    window: {},
  });
  const source = fs.readFileSync(path.join(sourceRoot, 'src/js/pane.js'), 'utf8');
  vm.runInContext(source, ctx);
  return { ctx, makeEl, listeners };
}

test('desktop HTML preview recognizes html/htm/xhtml and strips active/external content with strict CSP', () => {
  const { ctx } = loadPane();
  assert.equal(vm.runInContext('isHtmlPreviewExt("html")', ctx), true);
  assert.equal(vm.runInContext('isHtmlPreviewExt("HTM")', ctx), true);
  assert.equal(vm.runInContext('isHtmlPreviewExt(".xhtml")', ctx), true);
  assert.equal(vm.runInContext('isHtmlPreviewExt("xml")', ctx), false);

  const doc = vm.runInContext(
    `buildHtmlPreviewDocument('<html><head><meta http-equiv="refresh" content="0;url=https://evil.example"><style>h1{color:teal}</style></head><body onclick="alert(1)"><h1>Report</h1><script>alert(2)</script><iframe src="https://evil.example"></iframe><a href="javascript:alert(3)">x</a></body></html>')`,
    ctx
  );
  assert.ok(doc.includes('Content-Security-Policy'));
  assert.ok(doc.includes("script-src 'none'"));
  assert.ok(doc.includes('<h1>Report</h1>'));
  assert.ok(doc.includes('h1{color:teal}'));
  assert.ok(!/<script\b/i.test(doc));
  assert.ok(!/<iframe\b/i.test(doc));
  assert.ok(!/http-equiv="refresh"/i.test(doc));
  assert.ok(!/onclick=/i.test(doc));
  assert.ok(!/javascript:/i.test(doc));
});

test('desktop HTML preview mounts sandboxed iframe by default and toggles between Preview and Source', () => {
  const { ctx, makeEl } = loadPane();
  const shell = makeEl('div');
  const toolbar = makeEl('div');
  const sourcePre = makeEl('pre');
  shell._queries = { '.preview-text': sourcePre, '.preview-code-toolbar': toolbar };
  const content = makeEl('div');
  content._queries = { '.preview-code-shell': shell };
  ctx.__content = content;
  vm.runInContext('_previewRequestToken = 1;', ctx);
  vm.runInContext(
    `mountHtmlPreview(__content, { text_content: '<h1>Hi</h1>', truncated: false }, { path: 'C:\\\\demo\\\\index.html', name: 'index.html' }, 1, false)`,
    ctx
  );
  const state1 = vm.runInContext('htmlPreviewState()', ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(state1)), { open: true, mode: 'preview', truncated: false });
  const iframe = shell.children.find(c => c.tagName === 'IFRAME');
  assert.ok(iframe, 'HTML preview iframe mounted');
  assert.equal(iframe.getAttribute('sandbox'), '');
  assert.equal(iframe.hidden, false);
  assert.equal(sourcePre.hidden, true);
  assert.equal(shell.classList.contains('preview-html-active'), true);
  assert.ok(iframe.srcdoc.includes('<h1>Hi</h1>'));

  const state2 = vm.runInContext('setHtmlPreviewMode("source")', ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(state2)), { open: true, mode: 'source', truncated: false });
  assert.equal(iframe.hidden, true);
  assert.equal(sourcePre.hidden, false);
  assert.equal(shell.classList.contains('preview-html-active'), false);

  const state3 = vm.runInContext('setHtmlPreviewMode("preview")', ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(state3)), { open: true, mode: 'preview', truncated: false });
  assert.equal(iframe.hidden, false);
  assert.equal(sourcePre.hidden, true);
});
