/* Derived metadata index. Shared by the search worker and the synthetic Node tests. */
(function (root) {
    'use strict';
    const VERSION = 'mixed-pinyin-1/pinyin-pro-3.29.5';
    const readings = new Map();
    const literals = new Map();
    function normalize(value) {
        return String(value ?? '').normalize('NFKC').toLowerCase().replace(/ü/g, 'v')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    }
    function alternatives(char, dictionary) {
        if (!/\p{Script=Han}/u.test(char)) {
            if (!literals.has(char)) literals.set(char, [char]);
            return literals.get(char);
        }
        if (readings.has(char)) return readings.get(char);
        const result = new Set([char]);
        for (const reading of dictionary.polyphonic(char, { toneType: 'none', type: 'array' })[0] || []) {
            const value = normalize(reading);
            if (!value) continue;
            result.add(value);
            result.add(value[0]);
            if (/^(zh|ch|sh)/.test(value)) result.add(value.slice(0, 2));
        }
        const list = [...result];
        if (readings.size >= 12000) readings.delete(readings.keys().next().value);
        readings.set(char, list);
        return list;
    }
    function tokenize(text, dictionary) {
        return Array.from(normalize(text), char => alternatives(char, dictionary));
    }
    // Match contiguous source characters, choosing one representation per character.
    // The final syllable may be incomplete while the user is still typing.
    function matches(tokens, query) {
        if (!query) return true;
        for (let start = 0; start < tokens.length; start++) {
            if (!tokens[start].some(value => value[0] === query[0])) continue;
            const stack = [[start, 0]], seen = new Set();
            while (stack.length) {
                const [position, offset] = stack.pop();
                const key = position * (query.length + 1) + offset;
                if (seen.has(key) || position >= tokens.length) continue;
                seen.add(key);
                const tail = query.slice(offset);
                for (const value of tokens[position]) {
                    if (value.startsWith(tail)) return true;
                    if (query.startsWith(value, offset)) stack.push([position + 1, offset + value.length]);
                }
            }
        }
        return false;
    }
    class Index {
        constructor(dictionary) {
            this.dictionary = dictionary;
            this.documents = new Map();
            this.postings = new Map();
            this.queries = new Map();
        }
        remove(key) {
            const old = this.documents.get(key);
            if (!old) return;
            for (const start of old.starts) {
                const posting = this.postings.get(start);
                posting?.delete(key);
                if (!posting?.size) this.postings.delete(start);
            }
            this.documents.delete(key);
        }
        upsert(entry, cached) {
            const signature = JSON.stringify(entry.fields);
            const old = this.documents.get(entry.key);
            const reusable = old?.signature === signature ? old
                : cached?.version === VERSION && cached.signature === signature ? cached : null;
            const fields = reusable ? reusable.tokens.map(tokens => typeof tokens === 'string' ? tokenize(tokens, this.dictionary) : tokens)
                : entry.fields.map(text => tokenize(text, this.dictionary));
            const raw = (entry.literal || []).map(normalize);
            if (old && old.signature === signature && JSON.stringify(old.raw) === JSON.stringify(raw)) return { changed: false, built: false };
            this.remove(entry.key);
            const starts = new Set();
            for (const tokens of fields) for (const token of tokens) for (const value of token) starts.add(value[0]);
            // Literal technical fields remain searchable without phonetic conversion.
            for (const text of raw) for (const char of text) starts.add(char);
            const doc = { key: entry.key, signature, tokens: fields, raw, starts, version: VERSION };
            this.documents.set(entry.key, doc);
            for (const start of starts) {
                if (!this.postings.has(start)) this.postings.set(start, new Set());
                this.postings.get(start).add(entry.key);
            }
            this.queries.clear();
            return { changed: true, built: !reusable, document: doc };
        }
        prune(keys) {
            const removed = [];
            for (const key of this.documents.keys()) if (!keys.has(key)) { this.remove(key); removed.push(key); }
            if (removed.length) this.queries.clear();
            return removed;
        }
        search(text) {
            const query = normalize(text);
            if (!query) return [...this.documents.keys()];
            if (this.queries.has(query)) return this.queries.get(query);
            const result = [];
            for (const key of this.postings.get(query[0]) || []) {
                const doc = this.documents.get(key);
                if (doc.raw.some(value => value.includes(query)) || doc.tokens.some(tokens => matches(tokens, query))) result.push(key);
            }
            if (this.queries.size >= 64) this.queries.delete(this.queries.keys().next().value);
            this.queries.set(query, result);
            return result;
        }
    }
    const api = { VERSION, normalize, tokenize, matches, Index,
        readingEntries: () => [...readings],
        hydrateReadings(entries) { for (const [char, options] of entries) readings.set(char, options); } };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RHSearchCore = api;
})(globalThis);

