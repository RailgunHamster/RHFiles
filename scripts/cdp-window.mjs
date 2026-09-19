/**
 * Drives a running RHFiles window over the Chrome DevTools protocol.
 *
 *   $env:RHFILES_CDP_PORT=9222; RHFiles.exe        # start RHFiles with a port
 *   node scripts/cdp-window.mjs eval "document.title"
 *   node scripts/cdp-window.mjs dom                # outline of the live DOM
 *   node scripts/cdp-window.mjs shot out.png       # screenshot the window
 *   node scripts/cdp-window.mjs targets            # list windows/pages
 *
 * Windows note: exporting WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS does NOT work —
 * wry always assigns CoreWebView2EnvironmentOptions::AdditionalBrowserArguments,
 * and WebView2 ignores that environment variable once the property is set. RHFiles
 * therefore forwards RHFILES_CDP_PORT through the same channel wry uses (see
 * requested_browser_args in src-tauri/src/window.rs), which is what actually opens
 * the port. This is the only way to see or drive the real WebView: the in-app GUI
 * suite needs a visible desktop, while this works on a headless session too.
 */

import fs from 'node:fs';

const port = process.env.RHFILES_CDP_PORT || '9222';
const [command = 'targets', ...rest] = process.argv.slice(2);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function targets() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await response.json();
      if (list.length) return list;
    } catch (error) { /* port not up yet */ }
    await sleep(250);
  }
  throw new Error(`no DevTools target on 127.0.0.1:${port} (is RHFiles running with RHFILES_CDP_PORT=${port}?)`);
}

async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('DevTools socket failed')), { once: true });
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
  const send = (method, params) => new Promise(resolve => {
    const id = nextId++;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params: params || {} }));
  });
  return { socket, send };
}

const list = await targets();
if (command === 'targets') {
  for (const target of list) console.log(`${target.type}  ${target.title}  <${target.url}>`);
  process.exit(0);
}

// The main window is the one serving the app root, not the companion picker.
const main = list.find(target => target.type === 'page' && /\/(index\.html)?$/.test(new URL(target.url).pathname))
  || list.find(target => target.type === 'page');
if (!main) {
  console.error('no page target found');
  process.exit(2);
}

const { socket, send } = await connect(main);
await send('Runtime.enable');

if (command === 'eval') {
  const expression = rest.join(' ');
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  const details = response.result;
  if (details?.exceptionDetails) {
    console.error('page exception: ' + (details.exceptionDetails.exception?.description || details.exceptionDetails.text));
    process.exit(1);
  }
  const value = details?.result?.value;
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
} else if (command === 'dom') {
  const response = await send('Runtime.evaluate', {
    expression: `(() => {
      const walk = (node, depth) => {
        if (node.nodeType !== 1 || depth > 4) return '';
        const id = node.id ? '#' + node.id : '';
        const cls = typeof node.className === 'string' && node.className ? '.' + node.className.trim().split(/\\s+/).join('.') : '';
        const rect = node.getBoundingClientRect();
        const size = rect.width && rect.height ? ' [' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ']' : '';
        const hidden = node.hidden || rect.width === 0 ? ' (hidden)' : '';
        let out = '  '.repeat(depth) + node.tagName.toLowerCase() + id + cls + size + hidden + '\\n';
        for (const child of node.children) out += walk(child, depth + 1);
        return out;
      };
      return walk(document.body, 0);
    })()`,
    returnByValue: true,
  });
  console.log(response.result?.result?.value || '');
} else if (command === 'shot') {
  const file = rest[0] || 'rhfiles-shot.png';
  const response = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const data = response.result?.data;
  if (!data) {
    console.error('screenshot failed: ' + JSON.stringify(response).slice(0, 400));
    process.exit(1);
  }
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`wrote ${file}`);
} else {
  console.error(`unknown command: ${command}`);
  process.exit(2);
}

socket.close();
process.exit(0);
