/**
 * Drives a running RHFiles window over the Chrome DevTools protocol.
 *
 *   $env:RHFILES_CDP_PORT=9222; RHFiles.exe        # start RHFiles with a port
 *   node scripts/cdp-window.mjs eval "document.title"
 *   node scripts/cdp-window.mjs dom                # outline of the live DOM
 *   node scripts/cdp-window.mjs shot out.png       # screenshot the window
 *   node scripts/cdp-window.mjs targets            # list windows/pages
 *   node scripts/cdp-window.mjs drag ".file-name" ".tab" "#file-list"
 *       # protocol-level primary-button drag; optional final drop selector
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
  const events = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Input.dragIntercepted') events.push(message);
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
  return { socket, send, events };
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

const { socket, send, events } = await connect(main);
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
} else if (command === 'drag') {
  const [sourceSelector, targetSelector, dropSelector] = rest;
  const response = await send('Runtime.evaluate', {expression: `(() => {
    const center = selector => { const element = document.querySelector(selector); if (!element) throw new Error('Missing drag target: ' + selector); const r = element.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; };
    return [center(${JSON.stringify(sourceSelector)}), center(${JSON.stringify(targetSelector)})];
  })()`, returnByValue:true});
  const points = response.result?.result?.value;
  if (!points) throw new Error('Unable to resolve drag targets');
  const [from,to] = points;
  await send('Input.setInterceptDrags', {enabled:true});
  await send('Input.dispatchMouseEvent', {type:'mouseMoved', ...from});
  await send('Input.dispatchMouseEvent', {type:'mousePressed', ...from, button:'left', buttons:1, clickCount:1});
  try {
    for (let step=1;step<=12 && !events.length;step++) {
      await send('Input.dispatchMouseEvent', {type:'mouseMoved', x:from.x+(to.x-from.x)*step/12, y:from.y+(to.y-from.y)*step/12, button:'left', buttons:1});
      await new Promise(resolve=>setTimeout(resolve,40));
    }
    for (let attempt=0;attempt<20 && !events.length;attempt++) await sleep(50);
    const data = events.at(-1)?.params.data;
    if (!data) throw new Error('The source did not start a browser drag');
    const dispatch = async (type, point) => {
      const reply = await send('Input.dispatchDragEvent', {type,...point,data});
      if (reply.error) throw new Error(JSON.stringify(reply.error));
    };
    await dispatch('dragEnter',to);
    for (let step=0;step<8;step++) { await dispatch('dragOver',to); await sleep(100); }
    let destination = to;
    if (dropSelector) {
      const reply = await send('Runtime.evaluate', {expression:`(() => { const r=document.querySelector(${JSON.stringify(dropSelector)})?.getBoundingClientRect(); return r && {x:r.x+r.width/2,y:r.y+r.height/2}; })()`,returnByValue:true});
      destination = reply.result?.result?.value;
      if (!destination) throw new Error('Drop selector not found after hovering');
    }
    await dispatch('dragOver',destination);
    await dispatch('drop',destination);
  } finally {
    await send('Input.dispatchMouseEvent', {type:'mouseReleased', ...to, button:'left', buttons:0, clickCount:1});
    await send('Input.setInterceptDrags', {enabled:false});
  }
  console.log('Protocol drag/drop dispatched; verify the application result separately.');
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
