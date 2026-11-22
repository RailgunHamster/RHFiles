import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserFixture } from './browser-fixture.mjs';

const fixture = await browserFixture(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const context = await fixture.browser.newContext({ viewport: { width: 412, height: 892 }, hasTouch: true });
const page = await context.newPage();
let checks = 0;
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const check = (value, label) => { assert.ok(value, label); console.log('ok ' + (++checks) + ' - ' + label); };

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

await context.addInitScript(({ tinyPng }) => {
  const internal = '/storage/emulated/0';
  const sd = '/storage/SD-1';
  const rhId = '11111111-1111-4111-8111-111111111111';
  const smbId = '22222222-2222-4222-8222-222222222222';
  const rhRoot = `remote://${rhId}/`;
  const smbRoot = `remote://${smbId}/`;
  const dir = (name, p) => ({ name, path: p, isDir: true, kind: 'folder', size: 0, modifiedMs: 1 });
  const file = (name, p, kind = 'document', size = 2048) => ({ name, path: p, isDir: false, kind, size, modifiedMs: 1 });

  const model = window.__dlModel = {
    jobs: [],
    createdDirs: [],
    fs: {
      [internal]: [dir('Media', internal + '/Media'), dir('Documents', internal + '/Documents')],
      [internal + '/Media']: [dir('Saved', internal + '/Media/Saved')],
      [internal + '/Media/Saved']: [],
      [internal + '/Documents']: [],
      [sd]: [dir('Backup', sd + '/Backup')],
      [sd + '/Backup']: [],
    },
    remoteFs: {
      [rhRoot]: [dir('C', rhRoot + 'C')],
      [rhRoot + 'C']: [
        file('report.pdf', rhRoot + 'C/report.pdf', 'document', 4096),
        file('installer.bin', rhRoot + 'C/installer.bin', 'other', 8192),
        file('pic.png', rhRoot + 'C/pic.png', 'image', 1024),
        dir('SubDir', rhRoot + 'C/SubDir'),
      ],
      [rhRoot + 'C/SubDir']: [file('nested.txt', rhRoot + 'C/SubDir/nested.txt', 'document', 64)],
      [smbRoot]: [dir('Public', smbRoot + 'Public')],
      [smbRoot + 'Public']: [file('movie.bin', smbRoot + 'Public/movie.bin', 'other', 9000)],
    },
  };

  window.__TAURI_INTERNALS__ = {
    convertFileSrc: () => tinyPng,
    invoke: async (cmd, args = {}) => {
      switch (cmd) {
        case 'debug_note': return;
        case 'get_permission_status': return { manageExternalStorage: true, sharedStorageReadable: true };
        case 'index_status': return { entryCount: 10, indexing: false, lastFinishedMs: Date.now() };
        case 'app_info': return { version: 'dl-test' };
        case 'list_dir': return { path: args.path, entries: structuredClone(model.fs[args.path] || []) };
        case 'entry_exists': return Object.prototype.hasOwnProperty.call(model.fs, args.path);
        case 'create_directory': {
          const full = args.parent.replace(/\/+$/, '') + '/' + args.name;
          model.createdDirs.push(full);
          if (!model.fs[full]) model.fs[full] = [];
          const parentList = model.fs[args.parent] || (model.fs[args.parent] = []);
          if (!parentList.some(e => e.path === full)) parentList.push(dir(args.name, full));
          return full;
        }
        default: throw Error('Unmocked rust ' + cmd);
      }
    },
  };

  let jobSeq = 0;
  window.RHFilesNative = {
    postMessage(raw) {
      const { id, command, args = {} } = JSON.parse(raw);
      Promise.resolve().then(async () => {
        switch (command) {
          case 'capabilities':
            return { version: 3, nativeBack: true, deviceTransfers: true, adaptiveLayout: true };
          case 'permission':
          case 'theme':
            return true;
          case 'window.layout':
            return {};
          case 'roots':
            return [
              { path: internal, label: '内部存储', removable: false },
              { path: sd, label: '外部存储', removable: true },
              { path: rhRoot, label: 'WorkPC', provider: true, network: true, protocol: 'rhfiles', removable: false },
              { path: smbRoot, label: 'HomeNAS', provider: true, network: true, protocol: 'smb', removable: false },
            ];
          case 'shares':
          case 'connection.retired':
            return [];
          case 'transfer.settings':
            return { parallelism: 2, rateMiB: 0 };
          case 'connection.get':
            return {
              id: args.id,
              name: args.id === rhId ? 'WorkPC' : 'HomeNAS',
              type: args.id === rhId ? 'rhfiles' : 'smb',
              needsPassword: false,
            };
          case 'list':
            return { path: args.path, entries: structuredClone(model.remoteFs[args.path] || []) };
          case 'media.image':
            return { dataUrl: tinyPng };
          case 'job.start': {
            const jobId = 'job-' + (++jobSeq);
            const record = {
              id: jobId,
              op: args.op,
              args: structuredClone(args.args),
              state: 'completed',
              bytes: 1024,
              total: 1024,
              files: (args.args?.sources || []).length,
              done: (args.args?.sources || []).length,
              current: '',
              message: '',
              started: Date.now(),
              finished: Date.now(),
              completed: [...(args.args?.sources || [])],
              outputs: (args.args?.sources || []).map(s => args.args.destination + '/' + s.split('/').pop()),
              failures: [],
            };
            model.jobs.push(record);
            return jobId;
          }
          case 'job.status':
            return model.jobs.find(j => j.id === args.id);
          case 'jobs':
            return structuredClone(model.jobs);
          default:
            throw Error('Unmocked native ' + command);
        }
      }).then(
        result => window.RHFilesNative.onmessage({ data: JSON.stringify({ id, result }) }),
        err => window.RHFilesNative.onmessage({ data: JSON.stringify({ id, error: err.message }) }),
      );
    },
  };
}, { tinyPng });

const moreBtn = name => page.locator('#filelist .row').filter({ hasText: name }).locator('button.entry-more');
const sheetBtn = label => page.locator('#sheet-panel button.sheet-item').getByText(label, { exact: true });

try {
  await page.goto(fixture.url);
  await page.waitForFunction(() => window.rhfilesPane?.snapshot().ready);

  // 1. Visit SD card first so state.root drifts away from internal storage!
  await page.locator('[data-tile=storage-1]').click();
  await page.locator('#filelist .name').getByText('Backup', { exact: true }).waitFor();
  check(await page.evaluate(() => window.rhfilesPane.snapshot().route.path === '/storage/SD-1'), 'navigated to external SD card first');

  // 2. Open rh:// device WorkPC -> C:
  await page.locator('#btn-menu').click();
  await page.locator('#roots button').filter({ hasText: 'WorkPC' }).click();
  await page.locator('#filelist .name').getByText('C', { exact: true }).click();
  await page.locator('#filelist .name').getByText('report.pdf', { exact: true }).waitFor();

  // 3. Single file menu on rh:// offers BOTH 下载到默认文件夹（Download） and 下载到本机
  await moreBtn('report.pdf').click();
  await sheetBtn('下载到默认文件夹（Download）').waitFor();
  await sheetBtn('下载到本机').waitFor();
  check(true, 'rh:// file menu offers both 下载到默认文件夹（Download） and 下载到本机');

  // 4. Download to default folder auto-creates missing /storage/emulated/0/Download and stays in rh:// folder
  await sheetBtn('下载到默认文件夹（Download）').click();
  await page.waitForFunction(() => window.__dlModel.jobs.length === 1);
  const job1 = await page.evaluate(() => window.__dlModel.jobs[0]);
  check(job1.op === 'copy' && job1.args.destination === '/storage/emulated/0/Download' && job1.args.sources[0].endsWith('/report.pdf'), '下载到默认文件夹 copies directly into /storage/emulated/0/Download');
  check(await page.evaluate(() => window.__dlModel.createdDirs.includes('/storage/emulated/0/Download')), 'built-in default Download directory is created automatically if missing');
  check(await page.evaluate(() => window.rhfilesPane.snapshot().route.path.startsWith('remote://11111111')), '下载到默认文件夹 keeps user in current remote folder');

  // 5. Folder on rh:// ALSO supports 下载到默认文件夹 and 下载到本机
  await moreBtn('SubDir').click();
  await sheetBtn('下载到默认文件夹（Download）').waitFor();
  await sheetBtn('下载到本机').waitFor();
  await sheetBtn('下载到默认文件夹（Download）').click();
  await page.waitForFunction(() => window.__dlModel.jobs.length === 2);
  const job2 = await page.evaluate(() => window.__dlModel.jobs[1]);
  check(job2.args.sources[0].endsWith('/SubDir') && job2.args.destination === '/storage/emulated/0/Download', 'remote folder supports 下载到默认文件夹');

  // 6. Tapping 下载到本机 navigates directly to 内部存储 (/storage/emulated/0), NOT staying on remote AND NOT drifting to SD card!
  await moreBtn('report.pdf').click();
  await sheetBtn('下载到本机').click();
  await page.locator('#filelist .name').getByText('Media', { exact: true }).waitFor();
  const afterDlDevice = await page.evaluate(() => ({
    route: window.rhfilesPane.snapshot().route,
    pasteVisible: !document.getElementById('paste-bar').hidden,
    pasteDest: document.getElementById('paste-destination').textContent,
  }));
  check(afterDlDevice.route.path === '/storage/emulated/0', '下载到本机 navigates straight to internal storage (/storage/emulated/0), ignoring prior SD card visit');
  check(afterDlDevice.pasteVisible && afterDlDevice.pasteDest.includes('内部存储'), 'paste bar is visible with destination 内部存储');

  // 7. Cancel paste & swipe-back returns straight to rh://C
  await page.locator('#btn-cancel-paste').click();
  await page.evaluate(() => window.rhfilesHandleBack());
  await page.locator('#filelist .name').getByText('report.pdf', { exact: true }).waitFor();
  check(await page.evaluate(() => window.rhfilesPane.snapshot().route.path.endsWith('/C')), 'swipe-back returns from internal storage right back to rh:// folder');

  // 8. Multi-select on rh:// offers both download actions in 更多 menu
  await page.evaluate(() => window.RHFilesAPI.invoke('selection.set', {
    paths: ['remote://11111111-1111-4111-8111-111111111111/C/report.pdf', 'remote://11111111-1111-4111-8111-111111111111/C/SubDir'],
  }));
  await page.locator('#selection-bar button[data-action="more"]').click();
  await sheetBtn('下载到默认文件夹（Download）').waitFor();
  await sheetBtn('下载到本机').waitFor();
  await sheetBtn('下载到默认文件夹（Download）').click();
  await page.waitForFunction(() => window.__dlModel.jobs.length === 3);
  check(await page.evaluate(() => window.__dlModel.jobs[2].args.sources.length === 2), 'multi-select 下载到默认文件夹 downloads all selected remote items');

  // 9. Tapping an unpreviewable remote file opens download sheet with both options
  await page.locator('#filelist .name').getByText('installer.bin', { exact: true }).click();
  await sheetBtn('下载到默认文件夹（Download）').waitFor();
  await sheetBtn('下载到本机').waitFor();
  await sheetBtn('取消').click();
  check(true, 'tapping unpreviewable remote file offers both 下载到默认文件夹 and 下载到本机');

  // 10. Remote image gallery more menu offers both download options
  await page.locator('#filelist .name').getByText('pic.png', { exact: true }).click();
  await page.locator('#sheet-panel button[aria-label="图片更多选项"]').click();
  await page.locator('dialog.media-dialog button[data-media-action="download-default"]').waitFor();
  await page.locator('dialog.media-dialog button[data-media-action="download-device"]').waitFor();
  await page.locator('dialog.media-dialog button[data-media-action="download-default"]').click();
  await page.waitForFunction(() => window.__dlModel.jobs.length === 4);
  check(await page.evaluate(() => window.__dlModel.jobs[3].args.sources[0].endsWith('/pic.png')), 'remote image viewer downloads directly to default folder');
  await page.locator('#sheet-panel button[aria-label="返回文件列表"]').click();

  // 11. Configure custom default download folder in Settings -> 存储与权限
  await page.locator('#btn-menu').click();
  await page.locator('#nav-settings').click();
  await page.locator('[data-settings-section="storage"]').click();
  check((await page.locator('#default-download-path').innerText()).includes('内部存储/Download（默认）'), 'Settings shows built-in default download path');
  await page.locator('#btn-download-dir-pick').click();
  await sheetBtn('Media').click();
  await sheetBtn('Saved').click();
  await sheetBtn('使用此文件夹').click();
  check((await page.locator('#default-download-path').innerText()).includes('内部存储/Media/Saved'), 'Settings updates to custom default download folder');

  // 12. Verify SMB location uses the newly configured custom default folder
  await page.locator('#btn-menu').click();
  await page.locator('#roots button').filter({ hasText: 'HomeNAS' }).click();
  await page.locator('#filelist .name').getByText('Public', { exact: true }).click();
  await moreBtn('movie.bin').click();
  await sheetBtn('下载到默认文件夹（Saved）').waitFor();
  await sheetBtn('下载到默认文件夹（Saved）').click();
  await page.waitForFunction(() => window.__dlModel.jobs.length === 5);
  check(await page.evaluate(() => window.__dlModel.jobs[4].args.destination === '/storage/emulated/0/Media/Saved'), 'SMB 下载到默认文件夹 uses custom configured folder /storage/emulated/0/Media/Saved');

  // 13. Automation API validation & reset
  const folderInfo = await page.evaluate(() => window.RHFilesAPI.invoke('download.folder.get'));
  check(folderInfo.custom === true && folderInfo.path === '/storage/emulated/0/Media/Saved', 'download.folder.get returns custom path');
  const rejected = await page.evaluate(() => window.RHFilesAPI.invoke('download.folder.set', { path: 'remote://bad/dir' }).then(() => false, () => true));
  check(rejected, 'download.folder.set rejects remote:// paths');
  const resetInfo = await page.evaluate(() => window.RHFilesAPI.invoke('download.folder.set', { path: null }));
  check(resetInfo.custom === false && resetInfo.path === '/storage/emulated/0/Download', 'download.folder.set(null) resets back to default Download folder');

  check(errors.length === 0, 'zero uncaught frontend errors: ' + errors.join('; '));
  console.log('PASS ' + checks + ' Android remote download checks');
} finally {
  await context.close();
  await fixture.close();
}
