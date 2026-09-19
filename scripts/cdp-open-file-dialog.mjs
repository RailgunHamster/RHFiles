// Opens the native file dialog of a Chromium page by dispatching a real click
// on its <input type=file>. Trusted input via CDP is what makes the renderer
// treat it as a user gesture, which a plain element.click() from script cannot.
const port = process.argv[2] || '9333';
const selector = process.argv[3] || '#picker';

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find(target => target.type === 'page' && !target.url.startsWith('devtools://'));
if (!page) {
  console.error('no page target');
  process.exit(2);
}
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', () => reject(new Error('socket failed')), { once: true });
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

const rectResponse = await send('Runtime.evaluate', {
  expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  returnByValue: true,
});
const point = rectResponse.result?.result?.value;
if (!point) {
  console.error('selector not found: ' + selector);
  process.exit(2);
}
console.log(`clicking ${selector} at ${Math.round(point.x)},${Math.round(point.y)}`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none', clickCount: 0 });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
console.log('click dispatched');
socket.close();
process.exit(0);
