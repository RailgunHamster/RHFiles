/* Unit tests for the frontend's pure helpers.
 *
 * The mobile frontend has no build step and no framework, so a bundler-based
 * test runner would be the only thing in the toolchain. `node --test` is built
 * into Node 18+, and `format.js` is written so it can be loaded directly.
 *
 *   node --test android/web/tests
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const fmt = require(path.join(__dirname, '..', 'js', 'format.js'));

test('size formats across unit boundaries', () => {
  assert.equal(fmt.size(0), '0 B');
  assert.equal(fmt.size(999), '999 B');
  assert.equal(fmt.size(1024), '1.0 KB');
  assert.equal(fmt.size(1536), '1.5 KB');
  assert.equal(fmt.size(10 * 1024), '10 KB');
  assert.equal(fmt.size(5 * 1024 * 1024 * 1024), '5.0 GB');
  assert.equal(fmt.size(2 * 1024 ** 4), '2.0 TB');
  assert.equal(fmt.size(null), '');
  assert.equal(fmt.size(undefined), '');
});

test('relative time is stable for a fixed now', () => {
  const now = 1_700_000_000_000;
  assert.equal(fmt.relative(now - 5_000, now), 'just now');
  assert.equal(fmt.relative(now - 5 * 60_000, now), '5 min ago');
  assert.equal(fmt.relative(now - 3 * 3_600_000, now), '3 h ago');
  assert.equal(fmt.relative(now - 4 * 86_400_000, now), '4 d ago');
  assert.equal(fmt.relative(0, now), '');
  // Older than a month falls back to an absolute date.
  assert.match(fmt.relative(now - 400 * 86_400_000, now), /^\d{4}-\d{2}-\d{2} /);
});

test('paths split into breadcrumbs with absolute prefixes', () => {
  assert.deepEqual(fmt.path2parts('/storage/emulated/0/DCIM'), [
    { name: 'storage', path: '/storage' },
    { name: 'emulated', path: '/storage/emulated' },
    { name: '0', path: '/storage/emulated/0' },
    { name: 'DCIM', path: '/storage/emulated/0/DCIM' },
  ]);
  assert.deepEqual(fmt.path2parts('/'), []);
  assert.deepEqual(fmt.path2parts('/data'), [{ name: 'data', path: '/data' }]);
});

test('parent and basename handle trailing slashes and roots', () => {
  assert.equal(fmt.parentOf('/storage/emulated/0/DCIM/'), '/storage/emulated/0');
  assert.equal(fmt.parentOf('/data'), '/');
  assert.equal(fmt.parentOf('/'), '/');
  assert.equal(fmt.baseName('/storage/emulated/0/photo.jpg'), 'photo.jpg');
  assert.equal(fmt.baseName('/storage/emulated/0/DCIM/'), 'DCIM');
  assert.equal(fmt.baseName('plain.txt'), 'plain.txt');
});

const entry = (name, isDir, extra) =>
  Object.assign({ name, isDir, size: 0, modifiedMs: 0, kind: isDir ? 'folder' : 'other' }, extra || {});

test('folders sort before files regardless of the sort key', () => {
  const entries = [
    entry('zebra.txt', false, { size: 10 }),
    entry('alpha', true),
    entry('beta', true),
    entry('apple.txt', false, { size: 99 }),
  ];
  const shaped = fmt.shapeEntries(entries, { sort: 'name' });
  assert.deepEqual(shaped.map((e) => e.name), ['alpha', 'beta', 'apple.txt', 'zebra.txt']);
  const bySize = fmt.shapeEntries(entries, { sort: 'size' });
  assert.deepEqual(bySize.map((e) => e.name), ['alpha', 'beta', 'apple.txt', 'zebra.txt']);
});

test('hidden entries are dropped unless asked for', () => {
  const entries = [entry('.secret', false), entry('visible.txt', false), entry('.config', true)];
  assert.deepEqual(fmt.shapeEntries(entries, {}).map((e) => e.name), ['visible.txt']);
  assert.deepEqual(
    fmt.shapeEntries(entries, { showHidden: true }).map((e) => e.name),
    ['.config', '.secret', 'visible.txt'],
  );
});

test('name sorting is numeric-aware and case-insensitive', () => {
  const entries = [entry('file10.txt', false), entry('file2.txt', false), entry('File1.txt', false)];
  assert.deepEqual(
    fmt.shapeEntries(entries, { sort: 'name' }).map((e) => e.name),
    ['File1.txt', 'file2.txt', 'file10.txt'],
  );
});

test('date and kind sorting fall back to the name', () => {
  const entries = [
    entry('old.jpg', false, { modifiedMs: 1000, kind: 'image' }),
    entry('new.jpg', false, { modifiedMs: 9000, kind: 'image' }),
    entry('notes.txt', false, { modifiedMs: 5000, kind: 'document' }),
  ];
  assert.deepEqual(
    fmt.shapeEntries(entries, { sort: 'date' }).map((e) => e.name),
    ['new.jpg', 'notes.txt', 'old.jpg'],
  );
  assert.deepEqual(
    fmt.shapeEntries(entries, { sort: 'kind' }).map((e) => e.name),
    ['notes.txt', 'new.jpg', 'old.jpg'],
  );
});

test('shaping never mutates the caller array', () => {
  const entries = [entry('b.txt', false), entry('a.txt', false)];
  const shaped = fmt.shapeEntries(entries, { sort: 'name' });
  assert.deepEqual(entries.map((e) => e.name), ['b.txt', 'a.txt']);
  assert.notEqual(shaped, entries);
});

test('an unknown sort key falls back to name order', () => {
  const entries = [entry('b.txt', false), entry('a.txt', false)];
  assert.deepEqual(
    fmt.shapeEntries(entries, { sort: 'nonsense' }).map((e) => e.name),
    ['a.txt', 'b.txt'],
  );
});

test('count uses locale grouping', () => {
  assert.equal(fmt.count(0), '0');
  assert.equal(fmt.count(1234567), (1234567).toLocaleString());
});
