import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { parse } = createRequire(import.meta.url)('../../src/js/json-tree.js');

test('JSON tree retains order, repeated keys, and exact scalar source', () => {
  const result = parse('\uFEFF{"2":9007199254740993,"1":-0,"1":1E+400,"items":[null,true,[],{},"x\\\"y"]}');
  const children = result.node.children;
  assert.deepEqual(children.map(row => row.key), ['"2"', '"1"', '"1"', '"items"']);
  assert.deepEqual(children.slice(0, 3).map(row => row.node.value), ['9007199254740993', '-0', '1E+400']);
  assert.deepEqual(children[3].node.children.map(row => row.node.value), ['null', 'true', '[', '{', '"x\\\"y"']);
  assert.deepEqual(parse('false'), { node: { value: 'false' } });
});

test('a truncated prefix, malformed JSON, and oversized trees report different errors', () => {
  assert.deepEqual(parse('{}', true), { error: 'incomplete' });
  for (const input of ['{"a":1,}', '{/*comment*/}', '{"a":', '{} {}']) assert.deepEqual(parse(input), { error: 'invalid' });
  for (const input of ['['.repeat(70) + '0' + ']'.repeat(70), '[' + '0,'.repeat(20000) + '0]', ' '.repeat(256 * 1024 + 1)])
    assert.deepEqual(parse(input), { error: 'limit' });
});

test('the packaged desktop and Android JSON tree implementation stays identical', () => {
  const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(read('../../src/js/json-tree.js'), read('../../android/web/js/json-tree.js'));
});
