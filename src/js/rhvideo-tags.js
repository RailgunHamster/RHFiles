/* Shared nested Boolean rules for every media catalog. */
(function (root) {
    'use strict';
    const MAX_TAGS = 64, MAX_LENGTH = 255, MAX_DEPTH = 8, MAX_GROUPS = 32;
    const labelCache = new Map();
    function labels(value) {
        const text = String(value || '');
        if (!labelCache.has(text)) {
            if (labelCache.size >= 4096) labelCache.delete(labelCache.keys().next().value);
            labelCache.set(text, new Set(text.split(',').map(label => label.trim()).filter(Boolean)));
        }
        return labelCache.get(text);
    }
    function normalize(value = {}) {
        let terms = 0, groupCount = 0;
        function list(input) {
            if (!Array.isArray(input)) throw new Error('标签必须使用列表');
            return [...new Set(input.map(label => {
                if (typeof label !== 'string') throw new Error('标签名称必须是文字');
                const text = label.trim();
                if (Array.from(text).length > MAX_LENGTH || text.includes(',')) throw new Error('标签名称无效');
                return text;
            }).filter(Boolean))].sort();
        }
        function visit(node, depth) {
            if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error('标签筛选格式不正确');
            if (depth > MAX_DEPTH || ++groupCount > MAX_GROUPS) throw new Error('标签分组过多或嵌套过深');
            const mode = node.mode === undefined ? 'and' : node.mode;
            if (!['and', 'or'].includes(mode)) throw new Error('标签组合方式必须是 AND 或 OR');
            const exclude = list(node.exclude === undefined ? [] : node.exclude), excluded = new Set(exclude);
            const include = list(node.include === undefined ? [] : node.include).filter(label => !excluded.has(label));
            terms += include.length + exclude.length;
            if (terms > MAX_TAGS) throw new Error(`最多组合 ${MAX_TAGS} 个标签条件`);
            const children = node.groups === undefined ? [] : node.groups;
            if (!Array.isArray(children)) throw new Error('子分组必须使用列表');
            const groups = children.map(child => visit(child, depth + 1));
            return { mode, include, exclude, ...(groups.length ? { groups } : {}) };
        }
        return visit(value, 0);
    }
    function active(node) { return !!(node.include.length || node.exclude.length || node.groups?.some(active)); }
    function compile(value) {
        const filter = normalize(value);
        function build(node) {
            const children = (node.groups || []).filter(active).map(build);
            return tags => {
                if (node.exclude.some(tag => tags.has(tag))) return false;
                if (!node.include.length && !children.length) return true;
                return node.mode === 'and'
                    ? node.include.every(tag => tags.has(tag)) && children.every(child => child(tags))
                    : node.include.some(tag => tags.has(tag)) || children.some(child => child(tags));
            };
        }
        const match = build(filter);
        return value => {
            const tags = labels(value);
            return match(tags);
        };
    }
    function canonical(node) {
        const groups = (node.groups || []).filter(active).map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        return { mode: node.mode, include: node.include, exclude: node.exclude, ...(groups.length ? { groups } : {}) };
    }
    function terms(value) {
        const result = [];
        function visit(node) { result.push(...node.include, ...node.exclude); (node.groups || []).forEach(visit); }
        visit(value); return result;
    }
    function describe(node) {
        const positive = [...node.include.map(label => JSON.stringify(label)), ...(node.groups || []).filter(active).map(group => '(' + describe(group) + ')')];
        let joined = positive.join(node.mode === 'and' ? ' AND ' : ' OR ');
        if (node.mode === 'or' && positive.length > 1 && node.exclude.length) joined = '(' + joined + ')';
        return [joined, ...node.exclude.map(label => 'NOT ' + JSON.stringify(label))].filter(Boolean).join(' AND ') || '不限标签';
    }
    function candidate(value) {
        const filter = normalize(value);
        if (!filter.groups?.length) return filter;
        function necessary(node) {
            const parts = [...node.include.map(label => new Set([label])), ...(node.groups || []).filter(active).map(necessary)];
            if (!parts.length) return new Set();
            return node.mode === 'and' ? new Set(parts.flatMap(part => [...part]))
                : new Set([...parts[0]].filter(label => parts.every(part => part.has(label))));
        }
        return { mode: 'and', include: [...necessary(filter)].sort(), exclude: filter.exclude };
    }
    const api = { MAX_TAGS, MAX_DEPTH, MAX_GROUPS, labels, normalize, compile, active, terms, describe, candidate,
        key: value => JSON.stringify(canonical(normalize(value))), reset: () => labelCache.clear() };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RHTagFilter = api;
})(globalThis);

