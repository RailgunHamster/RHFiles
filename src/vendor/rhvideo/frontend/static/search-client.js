(function () {
    'use strict';
    let worker, sequence = 0, generation = 0, auth = '', scopePromise;
    let snapshots = new WeakMap();
    const requests = new Map(), stats = new Map();
    function dispose() {
        generation++;
        worker?.terminate(); worker = null;
        for (const request of requests.values()) request.reject(new Error('Search reset'));
        requests.clear(); snapshots = new WeakMap(); stats.clear();
    }
    function getWorker() {
        if (worker) return worker;
        worker = new Worker(RHVideoHost.staticURL('search-worker.js?v=1'));
        worker.onmessage = event => {
            const request = requests.get(event.data.id);
            if (!request) return;
            requests.delete(event.data.id);
            event.data.error ? request.reject(new Error(event.data.error)) : request.resolve(event.data.result);
        };
        worker.onerror = () => dispose();
        return worker;
    }
    function send(message) {
        return new Promise((resolve, reject) => {
            const id = ++sequence;
            try { getWorker().postMessage({ ...message, id }); requests.set(id, { resolve, reject }); }
            catch (error) { reject(error); }
        });
    }
    function accountScope(token) {
        if (token !== auth || !scopePromise) {
            dispose(); auth = token;
            // Use the stable account subject for cache reuse after a token refresh.
            // This is a cache partition only; authorization stays on the server.
            let subject = token;
            try { subject = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || token; } catch (_) {}
            let hash = 2166136261;
            for (const char of subject) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
            scopePromise = crypto.subtle
                ? crypto.subtle.digest('SHA-256', new TextEncoder().encode(subject)).then(buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(''))
                : Promise.resolve('account-' + (hash >>> 0).toString(16));
        }
        return scopePromise;
    }
    async function filter(collection, records, fields, query, token, literal = []) {
        if (!String(query || '').trim()) return records;
        const scoped = accountScope(token || ''), session = generation;
        const active = () => {
            if (session !== generation) throw new DOMException('Search reset', 'AbortError');
        };
        const scope = await scoped;
        active();
        let cached = snapshots.get(records);
        const shape = JSON.stringify([collection, fields, literal]);
        if (!cached || cached.shape !== shape || cached.scope !== scope || cached.length !== records.length) {
            const keys = records.map((record, i) => String(record.id != null ? (record.type || '') + ':' + record.id : record.index ?? record.i ?? record.name ?? i));
            const entries = records.map((record, i) => ({ key: keys[i],
                fields: fields.map(field => String(record[field] ?? '')),
                literal: literal.map(field => String(record[field] ?? '')) }));
            cached = { shape, scope, keys, length: records.length, synced: send({ type: 'sync', collection, scope, entries,
                persist: !['novel-toc', 'novel-excerpts'].includes(collection) }) };
            snapshots.set(records, cached);
            cached.synced.then(result => stats.set(collection, result)).catch(() => snapshots.delete(records));
        }
        await cached.synced;
        active();
        const keys = new Set(await send({ type: 'query', collection, scope, query }));
        active();
        return records.filter((_, i) => keys.has(cached.keys[i]));
    }
    window.RHSearch = {
        filter,
        stats: () => Object.fromEntries(stats),
        flush: () => send({ type: 'flush' }),
        reset() {
            dispose(); auth = ''; scopePromise = null;
            // A logout removes derived names as well as the active worker.
            try { indexedDB.deleteDatabase('rhvideo-search'); } catch (_) {}
        },
        invalidate() { snapshots = new WeakMap(); }
    };
})();
