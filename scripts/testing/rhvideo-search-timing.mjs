// Explicit QA-only boundary observation, injected by the owned-window runner.
// No parameters, URLs, results or error messages are retained. The wrappers
// forward the exact receiver/arguments and return the original value/promise.
export function installSearchTiming() {
  if (globalThis.__rhvideoSearchTiming) throw Error('Search timing already installed');
  const records = [], limit = 4096, pendingLimit = 128;
  let dropped = 0, nativeId = 0;
  const workers = new WeakMap();
  const record = (boundary, stage, id, action) => {
    if (records.length >= limit) { dropped++; return; }
    records.push({boundary, stage, id, action, atMs: performance.now()});
  };
  const originalPost = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (...args) {
    const message = args[0];
    if (message && Number.isSafeInteger(message.id) &&
        ['query', 'resource', 'invalidate', 'set', 'gallery', 'tags', 'info'].includes(message.action)) {
      let pending = workers.get(this);
      if (!pending) {
        pending = new Map(); workers.set(this, pending);
        this.addEventListener('message', event => {
          const action = pending.get(event.data?.id);
          if (action === undefined) return;
          pending.delete(event.data.id);
          record('worker', 'received', event.data.id, action);
        });
      }
      if (pending.size < pendingLimit) {
        pending.set(message.id, message.action);
        record('worker', 'sent', message.id, message.action);
      } else dropped++;
    }
    return Reflect.apply(originalPost, this, args);
  };
  // Tauri protects these functions in actual release builds. Never redefine
  // protected descriptors merely for a diagnostic. Report the missing boundary
  // explicitly; worker/paint timing is still useful, but cannot prove native
  // calls were absent or fast.
  const core = globalThis.__TAURI_INTERNALS__ || globalThis.__TAURI__.core, originalInvoke = core.invoke;
  const allowed = new Set(['state', 'preferences', 'resolve', 'catalog.resource', 'catalog', 'folders', 'favorites']);
  const observedInvoke = function (...args) {
    const action = args[0] === 'rhvideo_request' && args[1]?.action;
    const observed = allowed.has(action), id = observed ? ++nativeId : 0;
    if (observed) record('native', 'sent', id, action);
    const value = Reflect.apply(originalInvoke, this, args);
    if (observed) value.then(
      () => record('native', 'received', id, action),
      () => record('native', 'failed', id, action),
    );
    return value;
  };
  const nativeObserved = Object.getOwnPropertyDescriptor(core, 'invoke')?.writable === true;
  if (nativeObserved) core.invoke = observedInvoke;
  globalThis.__rhvideoSearchTiming = {
    snapshot: () => ({clock: 'page monotonic boundary delivery, not worker CPU time',
      diagnosticOnly: true, nativeObserved, dropped, records: records.map(record => ({...record}))}),
  };
  return true;
}
