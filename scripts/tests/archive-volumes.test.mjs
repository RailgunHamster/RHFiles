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
  const ctx=harness({extractArchiveTo:async file => {calls.push(file.name);return null;},refresh:async () => {},alert:() => {}});
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
