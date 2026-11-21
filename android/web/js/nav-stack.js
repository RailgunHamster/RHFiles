/* Bounded, cycle-folding in-app navigation stack for Android panes. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.androidNavStack = model;
})(globalThis, () => {
  const limit = 128;
  const screens = new Set(['home', 'folder', 'library', 'favorites', 'search', 'tool']);

  function normPath(value) {
    if (typeof value !== 'string' || !value) return '';
    if (value === '/') return '/';
    const trimmed = value.replace(/\/+$/, '');
    return trimmed || '/';
  }

  function validRoute(value) {
    return !!value && typeof value === 'object' && screens.has(value.screen);
  }

  function routeKey(route) {
    if (!validRoute(route)) return '';
    return JSON.stringify([
      route.screen,
      normPath(route.path),
      route.category || '',
      normPath(route.folder),
      route.tool || '',
      normPath(route.boundary),
    ]);
  }

  function sameRoute(a, b) {
    const ka = routeKey(a), kb = routeKey(b);
    return !!ka && ka === kb;
  }

  function clean(stack, current, max = limit) {
    if (validRoute(current) && current.screen === 'home') return [];
    const currentKey = routeKey(current);
    const seen = new Set();
    const result = [];
    const list = Array.isArray(stack) ? stack : [];
    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      const key = routeKey(entry);
      if (!key || key === currentKey || seen.has(key)) continue;
      seen.add(key);
      result.push({ ...entry });
      if (result.length === max) break;
    }
    result.reverse();
    return result;
  }

  function push(stack, current, next, max = limit) {
    if (!validRoute(next)) return clean(stack, current, max);
    if (next.screen === 'home') return [];
    if (!validRoute(current) || sameRoute(current, next)) return clean(stack, next, max);
    const base = clean(stack, next, max);
    const currentKey = routeKey(current);
    const nextKey = routeKey(next);
    const filtered = base.filter(entry => {
      const key = routeKey(entry);
      return key !== currentKey && key !== nextKey;
    });
    filtered.push({ ...current });
    return filtered.length > max ? filtered.slice(-max) : filtered;
  }

  function pop(stack) {
    const list = Array.isArray(stack) ? stack.slice() : [];
    const entry = list.length ? list.pop() : null;
    return { entry, stack: list };
  }

  return { limit, normPath, routeKey, sameRoute, clean, push, pop };
});
