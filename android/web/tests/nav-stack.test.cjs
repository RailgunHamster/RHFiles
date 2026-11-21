const test = require('node:test');
const assert = require('node:assert/strict');
const nav = require('../js/nav-stack.js');

const home = { screen: 'home' };
const folder = (path, extra = {}) => ({ screen: 'folder', path, ...extra });
const tool = (name, extra = {}) => ({ screen: 'tool', tool: name, ...extra });
const lib = (category, folderPath) => folderPath
  ? { screen: 'library', category, folder: folderPath }
  : { screen: 'library', category };

test('normal forward drill-down records history and returning Home clears stack', () => {
  let stack = [];
  stack = nav.push(stack, home, folder('/s'));
  stack = nav.push(stack, folder('/s', { scroll: 120 }), folder('/s/A'));
  stack = nav.push(stack, folder('/s/A', { scroll: 40 }), folder('/s/A/B'));
  assert.deepEqual(stack.map(r => r.path || r.screen), ['home', '/s', '/s/A']);
  assert.equal(stack[1].scroll, 120);

  const cleared = nav.push(stack, folder('/s/A/B'), home);
  assert.deepEqual(cleared, []);
});

test('breadcrumb / up jump keeps previous page on top (2A) while folding older target', () => {
  let stack = [];
  stack = nav.push(stack, home, folder('/s'));
  stack = nav.push(stack, folder('/s'), folder('/s/A'));
  stack = nav.push(stack, folder('/s/A'), folder('/s/A/B'));
  stack = nav.push(stack, folder('/s/A/B'), folder('/s/A/B/C'));

  // Jump via breadcrumb from C back to A
  stack = nav.push(stack, folder('/s/A/B/C', { scroll: 300 }), folder('/s/A'));
  assert.deepEqual(stack.map(r => r.path || r.screen), ['home', '/s', '/s/A/B', '/s/A/B/C']);

  // First swipe back returns immediately to C with its scroll position
  const first = nav.pop(stack);
  assert.equal(first.entry.path, '/s/A/B/C');
  assert.equal(first.entry.scroll, 300);
  // Continuing back never visits A a second time
  assert.deepEqual(first.stack.map(r => r.path || r.screen), ['home', '/s', '/s/A/B']);
});

test('repeated A<->B and A->B->C->A loops fold cleanly without growing stack', () => {
  let stack = [];
  let cur = home;
  const visit = (next) => { stack = nav.push(stack, cur, next); cur = next; };

  visit(folder('/s/A'));
  for (let i = 0; i < 10; i++) {
    visit(folder('/s/B'));
    visit(folder('/s/A'));
  }
  assert.deepEqual(stack.map(r => r.path || r.screen), ['home', '/s/B']);
  assert.equal(cur.path, '/s/A');

  // 3-way loop A -> B -> C repeated
  for (let i = 0; i < 5; i++) {
    visit(folder('/s/B'));
    visit(folder('/s/C'));
    visit(folder('/s/A'));
  }
  assert.deepEqual(stack.map(r => r.path || r.screen), ['home', '/s/B', '/s/C']);
  assert.equal(cur.path, '/s/A');
});

test('repeated tool visits fold older copies while preserving most recent jump source', () => {
  let stack = [];
  let cur = home;
  const visit = (next) => { stack = nav.push(stack, cur, next); cur = next; };

  visit(folder('/s/A'));
  visit(tool('history'));
  visit(folder('/s/B'));
  visit(tool('history'));
  visit(folder('/s/C'));

  assert.deepEqual(stack.map(r => r.path || r.tool || r.screen), ['home', '/s/A', '/s/B', 'history']);
  assert.equal(cur.path, '/s/C');
});

test('trailing slash normalization folds equivalent remote roots and distinguishes boundaries', () => {
  let stack = [];
  stack = nav.push(stack, home, folder('remote://id-1/'));
  stack = nav.push(stack, folder('remote://id-1/'), folder('remote://id-1/Share'));
  stack = nav.push(stack, folder('remote://id-1/Share'), folder('remote://id-1'));
  assert.deepEqual(stack.map(r => r.path || r.screen), ['home', 'remote://id-1/Share']);

  // Downloads shortcut boundary is distinct from physical Download path
  assert.equal(
    nav.sameRoute(
      folder('/s/Download', { boundary: '/s/Download', boundaryLabel: '下载' }),
      folder('/s/Download')
    ),
    false
  );
  assert.equal(nav.sameRoute(lib('image', '/s/DCIM/'), lib('image', '/s/DCIM')), true);
});

test('clean removes invalid/duplicate/current entries, respects limit, and clears on home', () => {
  const dirty = [
    null,
    { screen: 'unknown' },
    home,
    folder('/s/A', { scroll: 1 }),
    folder('/s/B', { scroll: 2 }),
    folder('/s/A', { scroll: 9 }),
    folder('/s/C', { scroll: 3 }),
  ];
  const cleaned = nav.clean(dirty, folder('/s/C'));
  assert.deepEqual(cleaned.map(r => r.path || r.screen), ['home', '/s/B', '/s/A']);
  assert.equal(cleaned[2].scroll, 9);
  assert.deepEqual(nav.clean(dirty, home), []);

  const many = Array.from({ length: 150 }, (_, i) => folder('/s/dir-' + i));
  assert.equal(nav.clean(many, folder('/s/current')).length, nav.limit);
});
