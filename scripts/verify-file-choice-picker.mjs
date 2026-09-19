/**
 * Verifies the RHFiles browser-upload confirm bar (src/js/file-choice.js)
 * against a real Chromium engine, without needing an interactive desktop.
 *
 *   node scripts/verify-file-choice-picker.mjs
 *
 * Why this exists: scripts/test-gui.ps1 runs the suite inside the app's own
 * WebView, which requires a visible RHFiles window. On a headless or
 * disconnected session that window never appears, so the GUI suite silently
 * produces no results and frontend changes go unverified. This script loads the
 * real module and stylesheet into headless Edge, stubs only the Tauri IPC bridge
 * and RHFiles' own selection reader, and drives the bar through a full
 * select/confirm/cancel round trip.
 *
 * Exits 0 when every check passes, 1 on a failed check, 3 when Edge is missing.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(projectRoot, 'src');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rhfiles-choice-'));
const pagePath = path.join(tmp, 'probe.html');
const profile = path.join(tmp, 'profile');

const srcUrl = srcDir.replace(/\\/g, '/');
// The probe uses the real index.html DOM and every shipped stylesheet, with the
// app scripts removed (they need Tauri). Layout is the point: #main-area is a
// row flex container, so where the bar is inserted decides whether it is a
// bottom strip or a squeezed column between the panes and the inspector.
let indexHtml = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
indexHtml = indexHtml.replace(/<script\b[\s\S]*?<\/script>/gi, '');
indexHtml = indexHtml.replace(/(href|src)="(?!https?:|file:|data:|#)([^"]+)"/gi,
  (match, attr, value) => `${attr}="file:///${srcUrl}/${value}"`);
fs.writeFileSync(pagePath, indexHtml);

const edge = [
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
].find(candidate => candidate && fs.existsSync(candidate));
if (!edge) {
  console.error('EDGE_NOT_FOUND: Microsoft Edge is required for this check');
  process.exit(3);
}

const port = 9333;
const child = spawn(edge, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-sync',
  '--disable-gpu', '--window-size=1280,900',
  `file:///${pagePath.replace(/\\/g, '/')}`,
], { stdio: 'ignore' });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function findTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find(candidate => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
      if (target) return target;
    } catch (error) { /* endpoint not up yet */ }
    await sleep(250);
  }
  throw new Error('CDP endpoint did not become ready');
}

const target = await findTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise(resolve => pending.set(id, resolve));
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (result.error) throw new Error(JSON.stringify(result.error));
  const details = result.result;
  if (details.exceptionDetails) {
    throw new Error('page exception: ' + JSON.stringify(
      details.exceptionDetails.exception?.description || details.exceptionDetails.text
    ));
  }
  return details.result.value;
}

await send('Runtime.enable');

const failures = [];
function check(name, actual, expected, detail) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` -> got ${JSON.stringify(actual)}${detail ? ` :: ${detail}` : ''}`}`);
}

// Install the globals the module expects, then load the real module file through
// a script element so it shares the page's script scope.
const moduleUrl = `file:///${path.join(srcDir, 'js', 'file-choice.js').replace(/\\/g, '/')}`;
await evaluate(`
  (() => {
    window.__TAURI_INTERNALS__ = { event: { listen: () => Promise.resolve(() => {}) } };
    window._lang = 'zh';
    window.showNotice = () => {};
    window.G = { dualOn: false, lastActivePane: 'left' };
    window.__selected = [];
    window.getSelectedPaths = () => window.__selected;
    window.__navigated = null;
    window.navigateTo = pathValue => { window.__navigated = pathValue; return Promise.resolve(); };
    window.__chosen = null;
    window.__cancelled = false;
    window.__session = null;
    window.call = (cmd, args) => {
      if (cmd === 'begin_file_choice_in_rhfiles') return Promise.resolve(window.__session);
      if (cmd === 'choose_files_in_file_dialog') { window.__chosen = args.files; return Promise.resolve(null); }
      if (cmd === 'cancel_file_choice') { window.__cancelled = true; return Promise.resolve(null); }
      return Promise.resolve(null);
    };
    const loader = document.createElement('script');
    loader.src = ${JSON.stringify(moduleUrl)};
    document.head.append(loader);
    window.__moduleLoaded = new Promise((resolve, reject) => {
      loader.addEventListener('load', () => resolve(true), { once: true });
      loader.addEventListener('error', () => reject(new Error('module script failed to load')), { once: true });
    });
    return true;
  })()
`);
await evaluate('window.__moduleLoaded');

check('module loaded without throwing', await evaluate('typeof fileChoiceIsActive'), 'function');
check('the bar starts hidden', await evaluate(`
  (() => {
    fileChoiceEnsureDom();
    const bar = document.getElementById('file-choice-bar');
    return [bar !== null, bar.hidden, fileChoiceIsActive()];
  })()
`), [true, true, false]);

// --- filtering helpers used to keep the count honest ---
check('filters selected paths to the accepted extensions',
  await evaluate(`fileChoiceFilterPaths(['C:\\\\a.png','C:\\\\b.txt','C:\\\\c.jpg'], ['png','jpg'])`),
  ['C:\\a.png', 'C:\\c.jpg']);
check('an unrestricted dialog keeps every path',
  await evaluate(`fileChoiceFilterPaths(['C:\\\\a.png','C:\\\\b.txt'], []).length`), 2);

// --- opening the bar ---
await evaluate(`
  window.__session = { active: true, startFolder: 'D:\\\\Pictures', extensions: ['png','jpg'],
                       allowMultiple: true, filterLabel: 'Image Files', locale: 'zh' };
  window.__navigated = null;
  window.__beginDone = fileChoiceBegin();
  true;
`);
await evaluate('window.__beginDone');
check('RHFiles navigates to the dialog folder once',
  await evaluate('window.__navigated'), 'D:\\Pictures');check('the confirm bar is shown', await evaluate(`
  [document.getElementById('file-choice-bar').hidden, fileChoiceIsActive()]
`), [false, true]);
check('nothing is selected yet, so confirm is disabled', await evaluate(`
  [document.getElementById('file-choice-confirm').disabled,
   document.getElementById('file-choice-clear').disabled,
   document.getElementById('file-choice-subtitle').textContent]
`), [true, true, '在 RHFiles 里挑好文件，然后点“选好了”送回浏览器的对话框']);
check('the accepted types are shown', await evaluate(`
  document.getElementById('file-choice-filter').textContent
`), '只接受 *.png *.jpg');

// --- selection drives the bar ---
await evaluate(`
  window.__selected = [{name:'a.png', path:'C:\\\\a.png', is_dir:false}];
  fileChoiceRefreshSelection();
`);
check('a selected file enables confirm', await evaluate(`
  [document.getElementById('file-choice-confirm').disabled,
   document.getElementById('file-choice-subtitle').textContent]
`), [false, '已选择 a.png']);

await evaluate(`
  window.__selected = [{name:'a.png', path:'C:\\\\a.png', is_dir:false},
                       {name:'b.jpg', path:'C:\\\\b.jpg', is_dir:false},
                       {name:'folder', path:'C:\\\\folder', is_dir:true}];
  fileChoiceRefreshSelection();
`);
check('folders are excluded from the count', await evaluate(`
  document.getElementById('file-choice-subtitle').textContent
`), '已选择 2 个文件');

await evaluate(`
  window.__selected = [{name:'notes.txt', path:'C:\\\\notes.txt', is_dir:false}];
  fileChoiceRefreshSelection();
`);
check('a file the dialog rejects cannot be confirmed', await evaluate(`
  [document.getElementById('file-choice-confirm').disabled,
   document.getElementById('file-choice-subtitle').textContent]
`), [true, '在 RHFiles 里挑好文件，然后点“选好了”送回浏览器的对话框']);

// --- confirm delivers and hides the bar ---
await evaluate(`
  window.__selected = [{name:'a.png', path:'C:\\\\a.png', is_dir:false},
                       {name:'b.jpg', path:'C:\\\\b.jpg', is_dir:false}];
  fileChoiceRefreshSelection();
  fileChoiceConfirm();
`);
check('confirming delivers the chosen files',
  await evaluate('window.__chosen'), ['C:\\a.png', 'C:\\b.jpg']);
check('the bar disappears after confirming', await evaluate(`
  [document.getElementById('file-choice-bar').hidden, fileChoiceIsActive()]
`), [true, false]);

// --- cancel releases the session and hides the bar ---
await evaluate(`
  window.__chosen = null; window.__cancelled = false;
  fileChoiceBegin();
`);
check('the bar returns for a new hand-off',
  await evaluate('document.getElementById("file-choice-bar").hidden'), false);
await evaluate(`
  window.__selected = [{name:'a.png', path:'C:\\\\a.png', is_dir:false}];
  fileChoiceRefreshSelection();
  fileChoiceCancel();
`);
check('cancelling tells the backend', await evaluate('window.__cancelled'), true);
check('cancelling hides the bar', await evaluate(`
  [document.getElementById('file-choice-bar').hidden, fileChoiceIsActive()]
`), [true, false]);
check('cancelling delivers nothing', await evaluate('window.__chosen'), null);

// --- a resumed hand-off does not navigate away ---
await evaluate(`
  fileChoiceBegin();
`);
await evaluate('window.__beginDone').catch(() => {});
await evaluate(`
  window.__navigated = null;
  window.__resumeDone = fileChoiceBegin();
  true;
`);
await evaluate('window.__resumeDone');
check('resuming does not re-navigate the pane',
  await evaluate('window.__navigated'), null);

// --- real layout: a full-width strip under the panes, not a squeezed column ---
await evaluate(`
  document.getElementById('file-choice-bar').hidden = false;
  true;
`);
const layout = await evaluate(`
  (() => {
    const bar = document.getElementById('file-choice-bar');
    const app = document.getElementById('app');
    const body = document.querySelector('.body');
    const pane = document.getElementById('pane-container');
    const b = bar.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const p = pane.getBoundingClientRect();
    const clear = document.getElementById('file-choice-clear').getBoundingClientRect();
    const confirm = document.getElementById('file-choice-confirm').getBoundingClientRect();
    return {
      barWidth: Math.round(b.width),
      barHeight: Math.round(b.height),
      barTop: Math.round(b.top),
      bodyWidth: Math.round(bodyRect.width),
      bodyBottom: Math.round(bodyRect.bottom),
      appBottom: Math.round(app.getBoundingClientRect().bottom),
      paneWidth: Math.round(p.width),
      buttonsInRow: confirm.left > clear.left && Math.abs(confirm.top - clear.top) < 2,
    };
  })()
`);
const layoutDetail = JSON.stringify(layout);
check('the bar spans the window width', Math.abs(layout.barWidth - layout.bodyWidth) < 2, true, layoutDetail);
check('the bar sits below the panes', layout.barTop >= layout.bodyBottom - 1, true, layoutDetail);
check('the bar stays a thin strip', layout.barHeight > 10 && layout.barHeight < 90, true, layoutDetail);
check('the panes keep their width', layout.paneWidth > layout.bodyWidth * 0.3, true, layoutDetail);
check('the bar buttons are laid out in a row', layout.buttonsInRow === true, true, layoutDetail);
check('the bar keeps its own flex strip', await evaluate(`
  (() => {
    const style = getComputedStyle(document.getElementById('file-choice-bar'));
    return style.position + '/' + style.display;
  })()
`), 'static/flex');

socket.close();
child.kill();
await sleep(300);
fs.rmSync(tmp, { recursive: true, force: true });

console.log('');
if (failures.length) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exit(1);
}
console.log('ALL FRONTEND CHECKS PASSED');
process.exit(0);
