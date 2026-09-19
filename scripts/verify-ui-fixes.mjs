/**
 * Verifies the 0.1.53 frontend fixes without an interactive desktop.
 *
 *   node scripts/verify-ui-fixes.mjs
 *
 * Part A loads the real src/js/icons.js into headless Edge and checks that
 * script files render RHFiles' console icon instead of the folder-like shell
 * icon, and that images still use shell icons in the default "mixed" mode.
 *
 * Part B asserts the source contracts of the remaining fixes (preview volume,
 * F5 layout stability, thumbnail cache key, ESC rename re-selection, sidebar
 * drop destinations) directly against the shipped files.
 *
 * Exits 0 when every check passes, 1 on failure, 3 when Edge is missing.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(projectRoot, 'src');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rhfiles-ui-'));
const pagePath = path.join(tmp, 'probe.html');
const profile = path.join(tmp, 'profile');
const srcUrl = srcDir.replace(/\\/g, '/');

const page = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///${srcUrl}/css/base.css">
</head><body></body></html>`;
fs.writeFileSync(pagePath, page);

const edge = [
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
].find(candidate => candidate && fs.existsSync(candidate));
if (!edge) {
  console.error('EDGE_NOT_FOUND: Microsoft Edge is required for this check');
  process.exit(3);
}

const port = 9334;
const child = spawn(edge, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-gpu',
  `file:///${pagePath.replace(/\\/g, '/')}`,
], { stdio: 'ignore' });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function findTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const target = (await response.json()).find(c => c.type === 'page' && c.webSocketDebuggerUrl);
      if (target) return target;
    } catch (error) { /* not ready yet */ }
    await sleep(250);
  }
  throw new Error('CDP endpoint did not become ready');
}

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

async function main() {
  const target = await findTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve));
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params) => new Promise(resolve => {
    const id = nextId++;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.result?.exceptionDetails) {
      const details = response.result.exceptionDetails;
      throw new Error(details.exception?.description || details.text || 'evaluation failed');
    }
    return response.result?.result?.value;
  };

  console.log('Part A: icons.js in headless Edge');
  // icons.js is a classic script of top-level function declarations, so
  // evaluating its source in the page's global scope defines them for the
  // checks below (and avoids file:// script-loading restrictions).
  await evaluate(`
    window.t = key => key;
    window.esc = value => String(value);
    window.getIconMode = () => 'mixed';
    window.getSystemIcon = () => Promise.resolve(null);
    window.__TAURI_INTERNALS__ = undefined;
    ${fs.readFileSync(path.join(srcDir, 'js', 'icons.js'), 'utf8')}
    'icons loaded';
  `);
  const results = await evaluate(`(() => {
    const bat = { name: 'run.bat', extension: 'bat', is_dir: false };
    const cmd = { name: 'run.cmd', extension: 'cmd', is_dir: false };
    const ps1 = { name: 'run.ps1', extension: 'ps1', is_dir: false };
    const png = { name: 'a.png', extension: 'png', is_dir: false };
    const dir = { name: 'folder', extension: '', is_dir: true };
    return {
      batBuiltin: _builtinIcon(bat, true),
      cmdBuiltin: _builtinIcon(cmd, true),
      ps1Builtin: _builtinIcon(ps1, true),
      batLarge: bigFileIcon(bat, 48),
      cmdLarge: bigFileIcon(cmd, 48),
      pngLarge: bigFileIcon(png, 48),
      dirLarge: bigFileIcon(dir, 48),
    };
  })()`);

  const isConsoleIcon = svg => typeof svg === 'string' && svg.includes('#1f2430' + '') && svg.includes('M4 7.6');
  check('bat uses the console icon', isConsoleIcon(results.batBuiltin));
  check('cmd uses the console icon', isConsoleIcon(results.cmdBuiltin));
  check('ps1 uses the blue console icon', typeof results.ps1Builtin === 'string' && results.ps1Builtin.includes('#012456'));
  check('bat is not the folder icon', !results.batBuiltin.includes('#F3B11F'));
  check('bat thumbnail prefers the builtin icon in mixed mode', results.batLarge.includes('large-file-icon') && !results.batLarge.includes('system-icon-host'));
  check('cmd thumbnail prefers the builtin icon in mixed mode', results.cmdLarge.includes('large-file-icon'));
  check('images keep the shell icon in mixed mode', results.pngLarge.includes('system-icon-host'));
  check('directories keep the builtin folder icon', results.dirLarge.includes('#F3B11F'));

  // base.css resets `margin` on everything, which used to strip the UA's
  // centring from every showModal() prompt.
  const dialogBox = await evaluate(`(() => {
    const dlg = document.createElement('dialog');
    dlg.style.cssText = 'border:1px solid #ccd;border-radius:8px;padding:16px;min-width:380px;';
    dlg.innerHTML = '<h3 style="margin:0 0 8px">probe</h3><input type="password">';
    document.body.appendChild(dlg);
    dlg.showModal();
    const rect = dlg.getBoundingClientRect();
    const result = {
      dx: Math.abs((rect.left + rect.width / 2) - window.innerWidth / 2),
      dy: Math.abs((rect.top + rect.height / 2) - window.innerHeight / 2),
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
    };
    dlg.close();
    dlg.remove();
    return result;
  })()`);
  check('modal prompt is horizontally centred', dialogBox.dx < 2, `offset ${dialogBox.dx}px (left ${dialogBox.left})`);
  check('modal prompt is vertically centred', dialogBox.dy < 2, `offset ${dialogBox.dy}px (top ${dialogBox.top})`);
  check('modal prompt keeps its content size', dialogBox.width >= 380 && dialogBox.height > 40, `${dialogBox.width}x${dialogBox.height}`);

  socket.close();

  console.log('Part B: source contracts');
  const read = file => fs.readFileSync(path.join(srcDir, 'js', file), 'utf8');
  const common = read('common.js');
  const panes = read('pane.js');
  const tabs = read('tabs.js');
  const list = read('filelist.js');
  const ops = read('ops.js');
  const sidebar = read('sidebar.js');
  const mainjs = read('main.js');

  check('preview volume default exists', /previewVolume:\s*100/.test(common));
  check('preview volume is clamped on load', /settings\.previewVolume = Number\.isFinite\(storedVolume\)/.test(common));
  check('audio preview applies the volume', /<audio controls[\s\S]{0,200}applyPreviewVolume\(\)/.test(panes));
  check('video preview applies the volume', /<video controls[\s\S]{0,200}applyPreviewVolume\(\)/.test(panes));
  check('player volume writes the setting back', /volumechange[\s\S]{0,200}setPreviewVolume\(next, \{ persist: true \}\)/.test(panes));

  check('same-path reload skips layout detection', /const isSamePathReload = tab\._loaded && path === tab\.path;/.test(tabs));
  check('layout block is guarded by the reload flag', /if \(!isSamePathReload\) \{[\s\S]{0,600}loadFolderLayout/.test(tabs));
  check('saved folder layout wins over adaptive detection', /if \(savedLayout\) \{[\s\S]{0,400}\} else if \(G\.settings\.adaptiveLayout/.test(tabs));

  check('thumbnail cache key includes the version', /function thumbnailCacheKey\(file\)/.test(list) && /file\.modified/.test(list) && /file\.size/.test(list));
  check('all thumbnail cache reads use the key', (list.match(/_thumbCache\.get\(/g) || []).length === 1 && list.includes('_thumbCache.get(thumbnailCacheKey(file))'));
  check('all thumbnail cache writes use the key', list.includes('_thumbCache.set(thumbnailCacheKey(file), b64)'));
  check('video extensions request thumbnails', /_THUMB_VIDEO_EXT/.test(list) && /configuredFfmpegPath/.test(list));

  // 0.1.61: the PDF viewer loads automatically, but never inside the selection
  // handler — starting it there is what made selecting a large PDF freeze the UI.
  const pdfBranch = (panes.match(/if \(is_pdf\) \{[\s\S]*?\n  \}/) || [''])[0];
  check('the PDF viewer is not started inside the selection handler', pdfBranch.length > 0 && !/innerHTML \+= `[^`]*iframe/.test(pdfBranch), pdfBranch.slice(0, 60));
  check('the PDF viewer still loads automatically', /requestAnimationFrame\(\(\) => setTimeout\(mountViewer, 0\)\)/.test(pdfBranch));

  check('ESC rename cancel uses the real path', /selectNavigatedPath\(file\.path, isRight\)/.test(ops));
  check('ESC rename cancel no longer references oldPath', !/selectNavigatedPath\(oldPath, isRight\)/.test(ops));

  // 0.1.56: "Sub items Errors" is not a password symptom; a verified password
  // must not re-open the prompt when individual entries fail.
  const detection = (ops.match(/function isArchivePasswordError[\s\S]*?return (\/[^\n]*?\/i)\.test/) || [])[1] || '';
  check('password detection ignores the generic error summary', /wrong password|password is incorrect|cannot open encrypted/i.test(detection) && !/sub items errors/i.test(detection), detection);
  check('verified passwords do not re-prompt', /if \(!passwordVerified && attempt < 2\)/.test(ops) && /if \(!passwordVerified && attempt < 2\)/.test(read('git.js')));
  check('extract-all tracks password verification', /let passwordVerified = false;/.test(read('git.js')));
  const i18n = { en: JSON.parse(fs.readFileSync(path.join(srcDir, 'i18n', 'en.json'), 'utf8')), zh: JSON.parse(fs.readFileSync(path.join(srcDir, 'i18n', 'zh.json'), 'utf8')) };
  check('partial-extract message exists (en)', typeof i18n.en['alert.archivePartialExtract'] === 'string' && i18n.en['alert.archivePartialExtract'].includes('{error}'));
  check('partial-extract message exists (zh)', typeof i18n.zh['alert.archivePartialExtract'] === 'string' && i18n.zh['alert.archivePartialExtract'].includes('{error}'));
  check('preview volume strings exist (en/zh)', Boolean(i18n.en['settings.previewVolume'] && i18n.zh['settings.previewVolume']));

  check('libraries rows expose data-path', /div\.dataset\.path = l\.path;/.test(sidebar));
  check('quick access rows expose data-path', /el\.dataset\.path = navPath;/.test(mainjs));
  check('flat sidebar rows spring-load on hover', /spring-load them by[\s\S]{0,900}navigateTo\(path\)/.test(ops));
  check('sidebar drop destination resolves data-path rows', /\.sidebar \[data-tpath\], \.sidebar \[data-path\]/.test(ops));

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
}

main()
  .catch(error => {
    console.error(`ERROR: ${error.message}`);
    failures += 1;
  })
  .finally(() => {
    child.kill();
    process.exit(failures === 0 ? 0 : 1);
  });
