import test from 'node:test';
import assert from 'node:assert/strict';
import {context, load, plain} from '../testing/source.mjs';

function harness(extra = {}) {
  const ctx = context({isFtpPath:() => false, ...extra});
  load(ctx, 'common.js', ['parentFolderPath']);
  load(ctx, 'ops.js', ['ARCHIVE_EXTENSIONS','archiveNameInfo','archiveFolderName','isArchiveEntry','selectedArchiveGroups','windowsPathKey']);
  return ctx;
}
const file = (name, folder='C:\\archives') => ({name,path:folder+'\\'+name,extension:name.split('.').pop(),is_dir:false});
for (const [name, folder] of [
  ['photos.7z.001','photos'],['photos.7z.002','photos'],['photos.ZIP.003','photos'],
  ['photos.zip.1000','photos'],['资料.tar.gz.002','资料'],['photos.z01','photos'],
  ['photos.Z02','photos'],['photos.part1.rar','photos'],['photos.PART02.RAR','photos'],
  ['photos.part003.rar','photos'],['photos.r00','photos'],['photos.s01','photos'],
  ['photos.001','photos'],['photos.002','photos'],['photos.zip','photos'],
  ['photos.xz','photos'],['photos.tar.zst','photos'],
  ['..7z.002','archive'],['...zip','archive'],
]) test(`archive menu recognizes ${name} and uses folder ${folder}`, () => {
  const ctx = harness();
  assert.equal(ctx.isArchiveEntry(file(name)), true);
  assert.equal(ctx.archiveFolderName(name), folder);
  assert.equal(ctx.isArchiveEntry({...file(name),is_dir:true}), false);
});
for (const name of ['readme.txt','file.000','photos.zip.000','report.2026','photo.001.txt','file.1','file.01','zip','RAR','7z']) {
  test(`ordinary file ${name} does not receive extraction actions`, () => assert.equal(harness().isArchiveEntry(file(name)), false));
}
test('selecting a full volume set extracts only once, without hiding other archive families or folders', () => {
  const ctx = harness();
  const selected = [file('photos.7z.002'),file('photos.7z.001'),file('photos.7z'),
    file('photos.z01'),file('photos.z02'),file('photos.zip'),file('photos.part02.rar'),file('photos.part01.rar'),
    file('old.r01'),file('old.r00'),file('old.rar'),file('photos.7z.001','D:\\other'),file('readme.txt')];
  assert.equal(ctx.selectedArchiveGroups(selected).length, 6);
});
test('volume deduplication follows Windows and Mac case-sensitive path rules', () => {
  const selected = [file('Bundle.7z.001'),file('bundle.7z.002')];
  assert.equal(harness().selectedArchiveGroups(selected).length, 1);
  assert.equal(harness({IS_MAC:true}).selectedArchiveGroups(selected).length, 2);
});
test('batch extraction receives each volume family once and retains unrelated archives', async () => {
  const calls=[];
  const ctx=harness({extractArchiveTo:async file => {calls.push(file.name);return null;},captureArchiveRefresh:()=>({}),refreshArchiveOrigin:async () => {},alert:() => {}});
  load(ctx,'ops.js',['extractArchives']);
  await ctx.extractArchives([file('a.zip.002'),file('a.zip.001'),file('b.part02.rar'),file('b.part01.rar')], entry => entry.name);
  assert.deepEqual(calls,['a.zip.002','b.part02.rar']);
});
test('activating a split archive browses it in the originating pane rather than using an unknown-file association', async () => {
  const opened=[];
  const ctx=harness({openArchive:async (...args) => opened.push(args)});
  load(ctx,'ops.js',['activateEntry']);
  await ctx.activateEntry(file('a.7z.002'),true,0);
  assert.deepEqual(plain(opened),[['C:\\archives\\a.7z.002',true]]);
});

test('selectedArchiveGroups handles RHFiles remote device paths without failing on family colons', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const P = require('../../src/js/device-paths.js');
  const g = 'a'.repeat(64), p = 'b'.repeat(64);
  const remoteFile = (name, dir='/Files/archives') => ({
    name,
    path: P.make(g, p, dir + '/' + name),
    extension: name.split('.').pop(),
    is_dir: false,
  });
  const ctx = harness({
    RHFilesDevicePaths: P,
    isDevicePath: v => P.is(v),
  });
  const grouped = ctx.selectedArchiveGroups([
    remoteFile('pack.zip'),
    remoteFile('data.7z.001'),
    remoteFile('data.7z.002'),
    remoteFile('vol.part1.rar'),
    remoteFile('vol.part2.rar'),
    remoteFile('other.7z', '/Files/other'),
  ]);
  assert.equal(grouped.length, 4);
  assert.deepEqual(plain(grouped.map(e => e.name)), ['pack.zip', 'data.7z.001', 'vol.part1.rar', 'other.7z']);
});

test('extractArchives runs multiple archives in parallel and supports applying one shared password across all prompts', async () => {
  const started = [];
  const extracted = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const openDialogs = [];
  const makeDialog = () => {
    const handlers = new Map();
    const input = { value: '', focus() {}, addEventListener(k, fn) { handlers.set('input:' + k, fn); } };
    const applyAll = { checked: false };
    const cancelBtn = {};
    const okBtn = {};
    const dlg = {
      style: {},
      className: '',
      innerHTML: '',
      shownNonModal: false,
      closed: false,
      removed: false,
      querySelector(sel) {
        if (sel === 'input[type="password"]') return input;
        if (sel === '[data-act="apply-all"]') return applyAll;
        if (sel === '[data-act="cancel"]') return cancelBtn;
        if (sel === '[data-act="ok"]') return okBtn;
        return null;
      },
      addEventListener(k, fn) { handlers.set(k, fn); },
      show() { this.shownNonModal = true; },
      showModal() { throw new Error('must not block UI with showModal'); },
      close() { this.closed = true; },
      remove() { this.removed = true; },
      _input: input,
      _applyAll: applyAll,
      _okBtn: okBtn,
      _cancelBtn: cancelBtn,
    };
    openDialogs.push(dlg);
    return dlg;
  };
  const ctx = harness({
    document: { createElement: () => makeDialog(), body: { appendChild() {} } },
    RHFilesUI: {
      assign(el, ev, fn) { el['on' + ev] = fn; },
      listen(el, ev, fn) { el['on' + ev] = fn; },
      remove() {},
    },
    t: k => k,
    esc: s => s,
    alert: () => {},
    showProgress: () => 'op-' + Math.random(),
    completeOperationTask: () => {},
    cancelOperationTask: () => {},
    failOperationTask: () => {},
    captureArchiveRefresh: () => ({}),
    refreshArchiveOrigin: async () => {},
    call: async (cmd, args) => {
      if (cmd === 'inspect_archive_extraction') {
        started.push(args.path);
        return { planId: 'plan-' + args.path, conflicts: [], passwordEntry: 'secret.txt' };
      }
      if (cmd === 'verify_archive_password') {
        if (args.path.endsWith('c.zip')) return args.password === 'diff-pass';
        return args.password === 'same-pass';
      }
      if (cmd === 'extract_archive' || cmd === 'extract_7z') {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(r => setTimeout(r, 25));
        inFlight--;
        extracted.push({ path: args.path || args.archive, password: args.password });
        return;
      }
      throw new Error('unexpected ' + cmd);
    },
  });
  load(ctx, 'ops.js', [
    'isArchivePasswordError',
    '_archivePasswordZIndex',
    '_openArchivePasswordDialogs',
    'promptArchivePassword',
    'resolveArchivePassword',
    'extractArchiveTo',
    'extractArchives',
  ]);
  const run = ctx.extractArchives([file('a.zip'), file('b.zip'), file('c.zip')], entry => 'C:\\out\\' + entry.name);
  // Wait for all 3 non-modal password dialogs to pop up simultaneously (no queueing!)
  await new Promise(r => setTimeout(r, 15));
  assert.equal(openDialogs.length, 3);
  assert.ok(openDialogs.every(d => d.shownNonModal));

  // Enter shared password in the first dialog with "apply-all" checked
  openDialogs[0]._input.value = 'same-pass';
  openDialogs[0]._applyAll.checked = true;
  openDialogs[0]._okBtn.onclick();

  // Wait for a.zip and b.zip to start extracting in parallel, and c.zip to re-prompt (dialog #4)
  await new Promise(r => setTimeout(r, 15));
  assert.equal(openDialogs.length, 4);
  assert.equal(maxInFlight, 2, 'a.zip and b.zip must extract in parallel while c.zip re-prompts');

  // Unlock c.zip with its own password
  openDialogs[3]._input.value = 'diff-pass';
  openDialogs[3]._okBtn.onclick();
  await run;

  assert.equal(extracted.length, 3);
  assert.deepEqual(
    extracted.map(e => [e.path.split('\\').pop(), e.password]).sort(),
    [['a.zip', 'same-pass'], ['b.zip', 'same-pass'], ['c.zip', 'diff-pass']]
  );
});
