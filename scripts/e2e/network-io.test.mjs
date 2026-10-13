import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {root} from '../testing/source.mjs';
import {launchApp} from '../testing/app-session.mjs';

const executable = process.env.RHFILES_NETWORK_WORKER_EXE || path.join(root, 'target/debug/rhfiles.exe');
const productionWorker = Boolean(process.env.RHFILES_NETWORK_WORKER_EXE);
function run(flag, request, timeout = 15000) {
  const result = spawnSync(executable, [flag, JSON.stringify(request)], {encoding:'utf8', windowsHide:true, timeout});
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  const messages = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  return {messages, result:messages.at(-1).Done};
}
const worker = request => run('--rhfiles-network-worker', request);

test('real network worker stays headless and preserves filesystem results', {skip:process.platform !== 'win32'}, async t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'rhfiles-worker-'));
  const file = path.join(fixture, '中文 空格.json');
  fs.writeFileSync(file, '{"hello":"世界"}');
  fs.mkdirSync(path.join(fixture, 'folder'));
  await t.test('directory listing and Unicode metadata', () => {
    const entries = worker({ListDir:fixture}).result.Ok;
    assert.equal(entries.length, 2);
    assert.equal(entries.find(e => e.name === '中文 空格.json').path, file);
    const info = worker({FileInfo:file}).result.Ok;
    assert.equal(info.name, '中文 空格.json');
    assert.equal(info.size, fs.statSync(file).size);
  });
  await t.test('existence never disguises an error as an empty directory', () => {
    assert.equal(worker({Exists:file}).result.Ok, true);
    assert.equal(worker({Exists:path.join(fixture, 'missing')}).result.Ok, false);
    assert.ok(worker({ListDir:path.join(fixture, 'missing')}).result.Err);
    assert.ok(worker({FileInfo:path.join(fixture, 'missing')}).result.Err);
  });
  await t.test('directory tree and bounded update metadata', () => {
    assert.equal(worker({Tree:fixture}).result.Ok[0].name, 'folder');
    assert.equal(worker({ReadText:{path:file,limit:1024}}).result.Ok, '{"hello":"世界"}');
    assert.ok(worker({ReadText:{path:file,limit:2}}).result.Err.includes('limit'));
  });
  await t.test('package copy reports progress, preserves bytes and refuses overwrite', () => {
    const source = path.join(fixture, 'package.nupkg');
    const destination = path.join(fixture, 'copied.nupkg');
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 7, 137);
    fs.writeFileSync(source, bytes);
    const copied = worker({CopyUpdate:{source,destination}});
    assert.equal(copied.result.Ok, null);
    assert.ok(copied.messages.filter(m => m.Progress).length >= 3);
    assert.deepEqual(fs.readFileSync(destination), bytes);
    fs.writeFileSync(destination, 'existing package');
    assert.ok(worker({CopyUpdate:{source,destination}}).result.Err);
    assert.equal(fs.readFileSync(destination, 'utf8'), 'existing package');
  });
  await t.test('actual parent kills a hanging worker and gates only that host', {skip:productionWorker}, () => {
    const start = Date.now();
    const {result} = run('--rhfiles-network-probe', {request:{TestWait:60000},timeout_ms:250,repeat:true});
    assert.match(result.Ok.first.Err, /\[timed_out\]/);
    assert.match(result.Ok.second.Err, /\[network_cooldown\]/);
    assert.equal(result.Ok.independent.Ok, null);
    assert.ok(Date.now() - start < 10000);
  });
  await t.test('parent protocol returns a complete real directory listing', {skip:productionWorker}, () => {
    const {result} = run('--rhfiles-network-probe', {request:{ListDir:fixture},timeout_ms:5000});
    assert.ok(result.Ok.first.Ok.some(e => e.name === '中文 空格.json'));
  });
  await t.test('job object ends the helper when its parent exits unexpectedly', {skip:productionWorker}, async () => {
    const parent = spawn(executable, ['--rhfiles-network-probe', JSON.stringify({request:{TestWait:60000},timeout_ms:30000})], {windowsHide:true,stdio:'ignore'});
    const exited = once(parent, 'exit');
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      const query = pid => spawnSync('powershell.exe', ['-NoProfile','-Command', `@(Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}' | Where-Object Name -eq 'rhfiles.exe' | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress`], {windowsHide:true,encoding:'utf8',timeout:10000});
      const queryResult = query(parent.pid);
      assert.equal(queryResult.status, 0, queryResult.stderr);
      const pids = [].concat(JSON.parse(queryResult.stdout.trim() || '[]'));
      assert.equal(pids.length, 1, 'one isolated helper must be running');
      parent.kill(); await exited;
      await new Promise(resolve => setTimeout(resolve, 300));
      const remaining = spawnSync('tasklist.exe', ['/FI', `PID eq ${pids[0]}`, '/FO','CSV','/NH'], {windowsHide:true,encoding:'utf8'});
      assert.ok(!remaining.stdout.includes(`"${pids[0]}"`));
    } finally { if (parent.exitCode === null) parent.kill(); }
  });
});

test('real application reads the configured SMB fixture without blocking local IPC', {skip:!process.env.RHFILES_TEST_NETWORK_PATH}, async t => {
  const app = await launchApp(); t.after(() => app.close());
  const remote = process.env.RHFILES_TEST_NETWORK_PATH;
  const result = await app.evaluate(`Promise.all([call('list_dir',{path:${JSON.stringify(remote)}}),call('get_window_label',{})])`);
  assert.ok(Array.isArray(result[0])); assert.equal(typeof result[1], 'string');
  const history = await app.evaluate(`call('get_release_history',{source:${JSON.stringify(remote)},proxy:null,allowRemote:true})`);
  assert.equal(history.warning, null);
  assert.ok(history.releases.some(release => release.version === '0.1.66'));
});

test('SMB package download commits only a complete verified payload', {skip:!process.env.RHFILES_TEST_NETWORK_PATH || productionWorker}, () => {
  const remote = process.env.RHFILES_TEST_NETWORK_PATH;
  const feed = JSON.parse(worker({ReadText:{path:path.join(remote, 'releases.win.json'),limit:8*1024*1024}}).result.Ok);
  const asset = feed.Assets.find(a => a.Type === 'Full');
  assert.ok(asset);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'rhfiles-update-worker-'));
  const destination = path.join(fixture, 'package.partial');
  const copy = source => run('--rhfiles-network-probe', {request:{CopyUpdate:{source,destination}},timeout_ms:30000,commit_update:true}, 60000).result.Ok.first;
  assert.equal(copy(path.join(remote, asset.FileName)).Ok, null);
  const bytes = fs.readFileSync(destination);
  assert.equal(bytes.length, asset.Size);
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), asset.SHA256.toUpperCase());
  assert.ok(copy(path.join(remote, 'missing-' + path.basename(fixture) + '.nupkg')).Err);
  assert.deepEqual(fs.readFileSync(destination), bytes);
  assert.deepEqual(fs.readdirSync(fixture), ['package.partial']);
});
