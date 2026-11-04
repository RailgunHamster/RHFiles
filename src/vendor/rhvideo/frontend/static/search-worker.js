'use strict';
importScripts('vendor/pinyin-pro/pinyin-pro-3.29.5.js', 'search-core.js?v=1');
const collections = new Map();
let databasePromise;
let dictionaryPromise;
const dirty = new Map();
let flushTimer, writes = Promise.resolve();
function database() {
    if (!databasePromise) databasePromise = new Promise(resolve => {
        if (!self.indexedDB) return resolve(null);
        const request = indexedDB.open('rhvideo-search', 1);
        request.onupgradeneeded = () => {
            const store = request.result.createObjectStore('records', { keyPath: 'id' });
            store.createIndex('namespace', 'namespace');
        };
        request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
        request.onerror = request.onblocked = () => resolve(null);
    });
    return databasePromise;
}
async function restore(namespace) {
    const db = await database();
    if (!db) return [];
    return new Promise(resolve => {
        try {
            const request = db.transaction('records').objectStore('records').index('namespace').getAll(namespace);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve([]);
        } catch (_) { resolve([]); }
    });
}
async function persist(namespace, changed, removed) {
    const db = await database();
    if (!db || (!changed.length && !removed.length)) return;
    await new Promise(resolve => {
        try {
            const tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records');
            for (const doc of changed) store.put({ id: namespace + '\0' + doc.key, namespace,
                key: doc.key, signature: doc.signature,
                // Persist each character's readings once, rather than duplicating
                // every alternative for every filename in the library.
                tokens: doc.tokens?.map(tokens => tokens.map(options => options[0]).join('')),
                readings: doc.readings, version: doc.version });
            for (const key of removed) store.delete(namespace + '\0' + key);
            tx.oncomplete = tx.onerror = tx.onabort = resolve;
        } catch (_) { resolve(); }
    });
}
function schedulePersistence(namespace, changed, removed) {
    if (!dirty.has(namespace)) dirty.set(namespace, { changed: new Map(), removed: new Set() });
    const batch = dirty.get(namespace);
    for (const doc of changed) { batch.changed.set(doc.key, doc); batch.removed.delete(doc.key); }
    for (const key of removed) { batch.changed.delete(key); batch.removed.add(key); }
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 250);
}
function flush() {
    clearTimeout(flushTimer);
    const batches = [...dirty]; dirty.clear();
    writes = writes.then(async () => {
        for (const [namespace, batch] of batches) {
            const changed = [...batch.changed.values()], removed = [...batch.removed];
            // Short transactions allow query messages to run between writes.
            for (let i = 0; i < Math.max(changed.length, removed.length); i += 400) {
                await persist(namespace, changed.slice(i, i + 400), removed.slice(i, i + 400));
            }
        }
    }).catch(() => {}); // Derived disk cache is optional; the memory index still works.
    return writes;
}
async function handle(message) {
    const namespace = message.scope + ':' + message.collection;
    if (message.type === 'flush') return flush();
    if (message.type === 'sync') {
        const started = performance.now();
        const dictionaryNamespace = 'dictionary:' + RHSearchCore.VERSION;
        if (!dictionaryPromise) dictionaryPromise = restore(dictionaryNamespace).then(rows => RHSearchCore.hydrateReadings(rows[0]?.readings || []));
        await dictionaryPromise;
        let state = collections.get(namespace);
        if (!state) {
            const stored = message.persist ? await restore(namespace) : [];
            state = { index: new RHSearchCore.Index(pinyinPro), stored: new Map(stored.map(doc => [doc.key, doc])) };
            // Callers use fixed collection names; changing books replaces the
            // existing chapter collection instead of retaining every book.
            collections.set(namespace, state);
        }
        const changed = [], keys = new Set();
        const restoredAt = performance.now();
        let built = 0, reused = 0;
        for (let i = 0; i < message.entries.length; i++) {
            const entry = message.entries[i]; keys.add(entry.key);
            const update = state.index.upsert(entry, state.stored.get(entry.key));
            if (update.built) built++; else reused++;
            if (update.built) changed.push(update.document);
            if (i && i % 400 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        const removed = new Set(state.index.prune(keys));
        for (const key of state.stored.keys()) if (!keys.has(key)) removed.add(key);
        if (message.persist) {
            if (built) schedulePersistence(dictionaryNamespace, [{ key: 'readings', version: RHSearchCore.VERSION, readings: RHSearchCore.readingEntries() }], []);
            schedulePersistence(namespace, changed, [...removed]);
        }
        state.stored.clear();
        // The in-memory index is authoritative after syncing the current catalog.
        return { built, reused, removed: removed.size, total: keys.size,
            restoreMs: Math.round(restoredAt - started), indexMs: Math.round(performance.now() - restoredAt) };
    }
    if (message.type === 'query') return collections.get(namespace)?.index.search(message.query) || [];
    throw new Error('Unknown search request');
}
// Preserve sync/query order even when an IndexedDB transaction yields.
let pending = Promise.resolve();
self.onmessage = event => {
    pending = pending.then(async () => {
        try { self.postMessage({ id: event.data.id, result: await handle(event.data) }); }
        catch (error) { self.postMessage({ id: event.data.id, error: error.message }); }
    });
};
