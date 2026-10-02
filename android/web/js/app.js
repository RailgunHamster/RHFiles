/* RHFiles mobile shell: explicit routes, bounded lists and independent tasks.
 * The layout follows File Manager Plus's familiar category-home/browser model;
 * icons, implementation and branding are RHFiles's own. */
(() => {
  const $ = (id) => document.getElementById(id);
  const saved = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const cache = (key, value) => localStorage.setItem(key, value);
  const categories = [
    ['image', '图片', '#9662b7'], ['audio', '音频', '#27877f'], ['video', '视频', '#c36268'],
    ['document', '文档', '#528bc1'], ['archive', '压缩包', '#b08451'], ['recent', '最近修改', '#63879a'],
  ];
  const labels = Object.fromEntries(categories.map(([id, label]) => [id, label]));
  let favorites = [];
  try { favorites = JSON.parse(saved('rhfiles.favorites', '[]')).filter((item) => typeof item.path === 'string' && typeof item.name === 'string').slice(0, 100); } catch {}
  const state = {
    route: { screen: 'home' }, stack: [], roots: [], root: '/storage/emulated/0', entries: [],
    listing: null, selected: new Set(), clipboard: null, favorites, task: null,
    view: saved('rhfiles.view', 'list') === 'grid' ? 'grid' : 'list',
    sort: saved('rhfiles.sort', 'name'), hidden: saved('rhfiles.hidden', '0') === '1',
    permissions: null, index: null, server: null, busy: false,
  };
  let navigationId = 0, searchId = 0, searchTimer, indexTimer, quitArmedAt = 0;
  const sameRoute = (a, b) => JSON.stringify([a.screen,a.path,a.category,a.tool]) === JSON.stringify([b.screen,b.path,b.category,b.tool]);
  const rootFor = (path) => state.roots.filter((root) => path === root.path || path.startsWith(root.path + '/')).sort((a,b) => b.path.length - a.path.length)[0];
  const rootLabel = (root) => root?.removable ? '外部存储' : '内部存储';
  const pathLabel = (path) => {
    const root = rootFor(path);
    return root ? rootLabel(root) + path.slice(root.path.length) : path;
  };
  const isList = () => ['folder', 'library', 'favorites', 'search'].includes(state.route.screen);
  const action = (label, icon, onSelect, danger = false) => ({ label, icon, onSelect, danger });
  function on(id, handler) {
    $(id).addEventListener('click', () => Promise.resolve().then(handler).catch(error));
  }
  function error(value) { ui.toast('操作失败：' + (value?.message || String(value)), 4500); }
  function button(label, icon, handler, className = 'nav-item') {
    const node = ui.el('button', className);
    node.type = 'button';
    node.innerHTML = ui.icon(icon);
    node.append(ui.el('span', '', label));
    node.addEventListener('click', () => Promise.resolve().then(handler).catch(error));
    return node;
  }

  function showPlaceholder(message, handler, caption) {
    $('placeholder').replaceChildren(ui.el('div', '', message));
    if (handler) $('placeholder').append(button(caption || '重试', 'refresh', handler, 'primary'));
    $('placeholder').hidden = false;
    $('filelist').hidden = true;
  }
  function renderShell() {
    const route = state.route, count = state.selected.size, pending = state.clipboard;
    const title = route.screen === 'home' ? 'RHFiles'
      : route.screen === 'folder' ? (rootFor(route.path)?.path === route.path ? rootLabel(rootFor(route.path)) : fmt.baseName(route.path))
      : route.screen === 'library' ? labels[route.category]
      : route.screen === 'favorites' ? '收藏夹'
      : route.screen === 'search' ? '搜索'
      : ({ settings: '设置', server: '从电脑访问', usage: '空间分析' })[route.tool] || 'RHFiles';
    $('title').textContent = title;
    document.querySelector('.topbar').hidden = count > 0;
    $('selection-head').hidden = count === 0;
    $('sel-count').textContent = '已选择 ' + count + ' 项';
    $('selection-bar').hidden = count === 0;
    $('selection-bar').querySelector('[data-action="rename"]').disabled = count !== 1 || !!state.task;
    for (const node of $('selection-bar').querySelectorAll('button')) if (node.dataset.action !== 'rename') node.disabled = !!state.task;
    $('filelist').classList.toggle('selecting', count > 0);
    $('browse-actions').hidden = !isList() || count > 0 || !!pending;
    $('btn-new').disabled = route.screen !== 'folder' || !!state.task || state.busy;
    $('list-status').hidden = !isList() || state.busy;
    $('btn-search').hidden = route.screen === 'tool';
    $('pathbar').hidden = route.screen !== 'folder';
    $('searchbar').hidden = route.screen !== 'search';
    $('paste-bar').hidden = !pending || !!count || !!state.task;
    if (pending) {
      $('paste-label').textContent = (pending.mode === 'cut' ? '待移动 ' : '待复制 ') + pending.paths.length + ' 项';
      $('paste-destination').textContent = route.screen === 'folder' ? '目标：' + pathLabel(route.path) : '请打开目标文件夹';
      $('btn-paste').textContent = pending.mode === 'cut' ? '移动到这里' : '粘贴到这里';
      $('btn-paste').disabled = route.screen !== 'folder' || state.busy;
    }
    $('task-bar').hidden = !state.task;
    $('task-label').textContent = state.task?.label || '';
    if (route.screen === 'folder') {
      const root = rootFor(route.path);
      const parts = root ? [{ name: rootLabel(root), path: root.path }, ...fmt.path2parts(route.path).filter(p => p.path.startsWith(root.path + '/'))] : fmt.path2parts(route.path);
      $('crumbs').replaceChildren();
      parts.forEach((part, i) => {
        if (i) $('crumbs').append(ui.el('span', 'sep', '›'));
        const b = button(part.name, 'folder', () => go({ screen: 'folder', path: part.path }), 'crumb' + (i === parts.length - 1 ? ' current' : ''));
        b.querySelector('svg').remove();
        $('crumbs').append(b);
      });
      requestAnimationFrame(() => { $('crumbs').scrollLeft = $('crumbs').scrollWidth; });
    }
    $('banner').hidden = !state.permissions || state.permissions.manageExternalStorage || !state.permissions.sharedStorageReadable;
    if (!$('banner').hidden) {
      $('banner').replaceChildren(ui.el('span', '', '尚未获得所有文件访问权限，部分内容可能不可见。'));
      $('banner').append(button('去授权', 'open', () => api.openAppSettings(), 'text-btn'));
    }
  }
  function paintSelection() {
    renderShell();
    for (const node of $('filelist').querySelectorAll('[data-path]')) {
      node.classList.toggle('selected', state.selected.has(node.dataset.path));
      node.setAttribute('aria-selected', String(state.selected.has(node.dataset.path)));
    }
  }
  function toggleSelection(path) {
    if (state.selected.has(path)) state.selected.delete(path); else state.selected.add(path);
    paintSelection();
  }
  function clearSelection() { state.selected.clear(); paintSelection(); }

  function tile(grid, id, label, icon, color, note, handler) {
    const node = ui.el('button', 'home-tile');
    node.dataset.tile = id;
    const graphic = ui.el('span', 'tile-icon');
    graphic.style.setProperty('--tile-color', color);
    graphic.innerHTML = ui.icon(icon);
    node.append(graphic, ui.el('strong', '', label), ui.el('small', '', note || ''));
    node.addEventListener('click', () => Promise.resolve().then(handler).catch(error));
    grid.append(node);
  }
  function renderHome() {
    const home = $('home'), grid = ui.el('div', 'home-grid');
    home.replaceChildren(grid);
    for (const [i, root] of state.roots.entries()) {
      const capacity = Number.isFinite(root.totalBytes) && Number.isFinite(root.freeBytes)
        ? fmt.size(root.totalBytes - root.freeBytes) + ' / ' + fmt.size(root.totalBytes) : root.removable ? fmt.baseName(root.path) : '本机文件';
      tile(grid, 'storage-' + i, rootLabel(root), root.removable ? 'sd' : 'storage', '#768896', capacity, () => go({ screen: 'folder', path: root.path }));
    }
    tile(grid, 'downloads', '下载', 'download', '#b78a41', 'Download', () => go({ screen: 'folder', path: state.root + '/Download' }));
    for (const [id, label, color] of categories) tile(grid, id, label, id, color, id === 'recent' ? '按修改时间' : '按文件类型', () => go({ screen: 'library', category: id }));
    tile(grid, 'favorites', '收藏夹', 'star', '#ca9940', state.favorites.length + ' 个位置', () => go({ screen: 'favorites' }));
    tile(grid, 'server', '从电脑访问', 'computer', '#54877b', '局域网传输', () => go({ screen: 'tool', tool: 'server' }));
    tile(grid, 'usage', '空间分析', 'chart', '#8b739a', '查看文件占用', () => go({ screen: 'tool', tool: 'usage' }));
    tile(grid, 'settings', '设置', 'settings', '#748193', '显示与权限', () => go({ screen: 'tool', tool: 'settings' }));
    const note = ui.el('div', 'home-note', state.index?.lastFinishedMs ? '分类基于文件名索引；新文件可通过更新索引加入。' : '图片、音频等分类需要先建立本机文件名索引。');
    note.append(button(state.index?.indexing ? '正在建立索引…' : '更新索引', 'refresh', rebuildIndex, 'text-btn'));
    home.append(note);
  }
  function renderDrawer() {
    $('roots').replaceChildren(...state.roots.map(root => button(rootLabel(root), root.removable ? 'sd' : 'storage', () => { closeDrawer(); return go({ screen: 'folder', path: root.path }); })));
    $('nav-favorites').replaceChildren(...state.favorites.map(entry => button(entry.name, 'star', () => { closeDrawer(); return activate(entry); })));
    if (!state.favorites.length) $('nav-favorites').append(ui.el('p', 'muted', '在文件的更多菜单中添加收藏'));
  }
  function openDrawer() { renderDrawer(); $('drawer').hidden = false; $('scrim').hidden = false; }
  function closeDrawer() { $('drawer').hidden = true; if (!ui.isSheetOpen()) $('scrim').hidden = true; }

  // Request IDs make old directory/search/preview responses unable to replace a
  // newer screen. The in-app back stack is independent of WebView history.
  async function go(route, options = {}) {
    if (!options.replace && !sameRoute(route, state.route)) state.stack.push({ ...state.route, scroll: $('filelist').scrollTop });
    const id = ++navigationId;
    ++searchId; clearTimeout(searchTimer);
    state.route = { ...route }; state.selected.clear(); state.entries = []; state.listing = null; state.busy = true;
    for (const name of ['home', 'filelist', 'tool-page', 'placeholder']) $(name).hidden = true;
    renderShell();
    try {
      if (route.screen === 'home') { renderHome(); $('home').hidden = false; }
      else if (route.screen === 'tool') {
        $('tool-page').hidden = false;
        for (const tool of ['settings','server','usage']) $('tool-' + tool).hidden = route.tool !== tool;
        if (route.tool === 'settings') await refreshSettings();
        if (route.tool === 'server') await refreshServer();
        if (route.tool === 'usage') {
          $('scan-root').textContent = pathLabel(state.root);
          $('scan-result').replaceChildren();
        }
      } else if (route.screen === 'folder') {
        showPlaceholder('正在读取文件夹…');
        const listing = await api.listDir({ path: route.path });
        if (id !== navigationId) return;
        state.route.path = listing.path; state.listing = listing; state.entries = listing.entries || [];
        const root = rootFor(listing.path); if (root) state.root = root.path;
        showList(route.scroll);
      } else if (route.screen === 'favorites') {
        state.entries = state.favorites.map(item => ({ ...item, kind: item.isDir ? 'folder' : kindOf(item.name) }));
        showList(route.scroll);
      } else if (route.screen === 'library') {
        showPlaceholder('正在读取分类…');
        const status = await api.indexStatus();
        if (id !== navigationId) return;
        state.index = status;
        if (!status.lastFinishedMs && !status.entryCount) {
          showPlaceholder(status.indexing ? '正在建立索引，完成后会自动刷新。' : '尚未建立文件索引。\n建立索引后即可按类型浏览。', rebuildIndex, '建立索引');
          if (status.indexing) pollIndex();
        } else {
          const page = await api.browseLibrary({ category: route.category, root: state.root, showHidden: state.hidden, limit: 2000 });
          if (id !== navigationId) return;
          state.entries = page.entries; state.listing = page; showList(route.scroll);
        }
      } else if (route.screen === 'search') {
        $('search-input').value = route.query || '';
        $('search-scope').textContent = route.global ? '全部文件' : '当前文件夹';
        showPlaceholder(route.global ? '搜索全部已建立索引的文件' : '搜索当前文件夹内的文件名');
        if (route.query) await runSearch(route.query);
        $('search-input').focus();
      }
    } catch (err) {
      if (id !== navigationId) return;
      showPlaceholder('无法打开此位置\n' + (err?.message || err), () => go(route, { replace: true }));
    } finally {
      if (id === navigationId) { state.busy = false; renderShell(); }
    }
  }
  function showList(scroll = 0) {
    $('placeholder').hidden = true; $('filelist').hidden = false;
    renderList(scroll || 0);
  }
  function currentEntries() {
    const list = fmt.shapeEntries(state.entries, { sort: state.route.screen === 'library' && state.route.category === 'recent' ? 'date' : state.sort, showHidden: state.hidden });
    return list;
  }
  function renderList(scrollOverride) {
    if (!isList() || $('filelist').hidden) return;
    const container = $('filelist'), list = currentEntries();
    const scroll = typeof scrollOverride === 'number' ? scrollOverride : container.scrollTop;
    container.classList.toggle('grid', state.view === 'grid');
    container.replaceChildren();
    $('list-status').textContent = list.length + ' 项' + (state.listing?.truncated ? ' · 仅显示部分结果，请缩小范围' : '');
    if (!list.length) {
      container.append(ui.el('div', 'placeholder', state.route.screen === 'favorites' ? '还没有收藏\n在文件或文件夹的更多菜单中添加。' : state.route.screen === 'search' ? '没有匹配的文件' : '没有文件'));
      return;
    }
    const height = state.view === 'grid' ? 136 : 64;
    const columns = state.view === 'grid' ? Math.max(2, Math.floor(container.clientWidth / 112)) : 1;
    const top = ui.el('div'), bottom = ui.el('div'), windowNode = ui.el('div', 'file-window');
    container.style.setProperty('--columns', columns);
    container.append(top, windowNode, bottom);
    // Establish the full scroll extent before restoring a saved offset.
    bottom.style.height = Math.ceil(list.length / columns) * height + 'px';
    container.scrollTop = scroll;
    let scheduled = false;
    function paint() {
      scheduled = false; if (!windowNode.isConnected) return;
      thumbQueue.length = 0;
      const firstRow = Math.max(0, Math.floor(container.scrollTop / height) - 3);
      const lastRow = Math.min(Math.ceil(list.length / columns), Math.ceil((container.scrollTop + container.clientHeight) / height) + 3);
      top.style.height = firstRow * height + 'px';
      bottom.style.height = (Math.ceil(list.length / columns) - lastRow) * height + 'px';
      windowNode.replaceChildren(...list.slice(firstRow * columns, lastRow * columns).map(buildNode));
    }
    container.onscroll = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(paint); } };
    paint(); paintSelection();
  }
  function buildNode(entry) {
    const node = ui.el('div', state.view === 'grid' ? 'cell' : 'row');
    node.dataset.path = entry.path; node.dataset.kind = entry.isDir ? 'folder' : entry.kind;
    node.tabIndex = 0; node.setAttribute('role', 'option'); node.setAttribute('aria-label', entry.name);
    if (state.clipboard?.mode === 'cut' && state.clipboard.paths.includes(entry.path)) node.classList.add('pending-cut');
    const thumb = ui.el('div', 'thumb'); thumb.innerHTML = ui.icon(entry.isDir ? 'folder' : entry.kind);
    node.append(thumb);
    if (entry.kind === 'image') thumbnail(thumb, entry);
    const meta = ui.el('div', 'meta'); meta.append(ui.el('div', 'name', entry.name));
    if (state.view !== 'grid') meta.append(ui.el('div', 'sub', (entry.isDir ? '文件夹' : fmt.size(entry.size)) + (entry.modifiedMs ? ' · ' + fmt.date(entry.modifiedMs).split(' ')[0] : '') + (state.route.screen !== 'folder' ? ' · ' + pathLabel(fmt.parentOf(entry.path)) : '')));
    node.append(meta, ui.el('div', 'check'));
    const more = button('更多操作', 'more', () => entryMenu(entry), 'entry-more');
    more.setAttribute('aria-label', entry.name + ' 的更多操作'); more.querySelector('span').remove();
    more.addEventListener('pointerdown', e => e.stopPropagation());
    more.addEventListener('click', e => e.stopPropagation()); node.append(more);
    let timer, origin, held = false;
    const cancel = () => { clearTimeout(timer); timer = null; };
    node.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      origin = [e.clientX,e.clientY]; held = false;
      timer = setTimeout(() => { held = true; state.selected.add(entry.path); paintSelection(); if (navigator.vibrate) navigator.vibrate(10); }, 450);
    });
    node.addEventListener('pointermove', e => { if (origin && Math.hypot(e.clientX-origin[0],e.clientY-origin[1]) > 10) cancel(); });
    for (const name of ['pointerup','pointercancel','pointerleave']) node.addEventListener(name, cancel);
    node.addEventListener('contextmenu', e => { e.preventDefault(); cancel(); state.selected.add(entry.path); held = true; paintSelection(); });
    node.addEventListener('click', () => { cancel(); if (held) { held = false; return; } if (state.selected.size) toggleSelection(entry.path); else activate(entry).catch(error); });
    node.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); activate(entry).catch(error); } else if (e.key === ' ') { e.preventDefault(); toggleSelection(entry.path); } });
    return node;
  }
  const thumbCache = new Map(), thumbQueue = [];
  let activeThumbs = 0;
  function thumbnail(node, entry) {
    const key = entry.path + ':' + entry.modifiedMs + ':' + entry.size;
    function apply(data) {
      if (!node.isConnected || !data) return;
      const image = new Image(); image.alt = ''; image.decoding = 'async'; image.src = data;
      image.onload = () => { if (node.isConnected) node.replaceChildren(image); };
    }
    if (thumbCache.has(key)) { queueMicrotask(() => apply(thumbCache.get(key))); return; }
    thumbQueue.push({ node, entry, key, apply }); drainThumbs();
  }
  function drainThumbs() {
    while (activeThumbs < 4 && thumbQueue.length) {
      const job = thumbQueue.shift();
      // Newly built nodes attach in the current turn; check after the microtask.
      activeThumbs++;
      Promise.resolve().then(async () => {
        if (!job.node.isConnected) return;
        try {
          const result = await api.readThumbnail({ path: job.entry.path, maxEdge: 128 });
          const url = typeof result === 'string' ? result : result?.dataUrl;
          if (url) { if (thumbCache.size >= 256) thumbCache.delete(thumbCache.keys().next().value); thumbCache.set(job.key,url); job.apply(url); }
        } catch { /* File icon remains a valid fallback. */ }
      }).finally(() => { activeThumbs--; drainThumbs(); });
    }
  }
  function kindOf(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (/^(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif|svg|tiff|ico)$/.test(ext)) return 'image';
    if (/^(mp4|mkv|avi|mov|webm|m4v|3gp|wmv|flv|m2ts|mts)$/.test(ext)) return 'video';
    if (/^(mp3|flac|wav|aac|ogg|opus|m4a|amr|wma)$/.test(ext)) return 'audio';
    if (/^(zip|rar|7z|tar|gz|xz|bz2|zst|apk|apks|xapk|iso)$/.test(ext)) return 'archive';
    return 'document';
  }

  async function activate(entry) {
    if (entry.isDir) return go({ screen: 'folder', path: entry.path });
    if (api.nativeAvailable() && !['image','audio','video'].includes(entry.kind) && !/\.(txt|md|csv|log|json|xml|ini|cfg|toml|ya?ml|js|ts|rs|py|java|kt|c|h|cpp|css|html|sh)$/i.test(entry.name)) return api.systemOpen(entry.path);
    const nav = navigationId;
    ui.openSheet(entry.name, [action('关闭', 'close', () => {})], '正在读取…');
    const panel = $('sheet-panel'), identity = panel.firstChild;
    const stillOpen = () => nav === navigationId && ui.isSheetOpen() && panel.firstChild === identity;
    try {
      if (['image','audio','video'].includes(entry.kind)) {
        const media = document.createElement(entry.kind === 'image' ? 'img' : entry.kind);
        media.className = 'media-preview';
        if (entry.kind !== 'image') { media.controls = true; media.preload = 'metadata'; }
        else { media.alt = entry.name; media.decoding = 'async'; }
        media.addEventListener('error', () => { if (stillOpen()) panel.querySelector('.sheet-note').textContent = '此设备的内置预览暂不支持该格式。'; });
        media.src = api.assetUrl(entry.path);
        panel.querySelector('.sheet-note').textContent = '';
        panel.append(media); return;
      }
      if (entry.kind === 'archive') { panel.querySelector('.sheet-note').textContent = '此版本暂不支持压缩包内容预览。可在文件的更多菜单中复制、移动或查看属性。'; return; }
      const preview = await api.readTextPreview({ path: entry.path, maxBytes: 256 * 1024 });
      if (!stillOpen()) return;
      panel.querySelector('.sheet-note').textContent = preview.truncated ? '文件较大，仅显示前 256 KB。' : '';
      const pre = ui.el('pre', '', preview.text); pre.style.padding = '0 20px'; panel.append(pre);
    } catch (err) { if (stillOpen()) panel.querySelector('.sheet-note').textContent = '无法预览：' + (err?.message || err); }
  }
  function entryMenu(entry) {
    ui.openSheet(entry.name, [
      action(entry.isDir ? '打开文件夹' : '打开 / 预览', 'open', () => activate(entry)),
      ...(!entry.isDir && api.nativeAvailable() ? [action('打开方式', 'open', () => api.systemOpen(entry.path)), action('分享', 'share', () => api.shareFile(entry.path))] : []),
      action('复制', 'copy', () => setClipboard('copy',[entry.path])),
      action('移动', 'cut', () => setClipboard('cut',[entry.path])),
      action('重命名', 'rename', () => rename(entry)),
      action(state.favorites.some(e => e.path === entry.path) ? '取消收藏' : '添加到收藏', 'star', () => favorite(entry)),
      action('复制路径', 'copy', async () => { await ui.copyText(entry.path); ui.toast('路径已复制'); }),
      ...(state.route.screen === 'folder' ? [] : [action('打开所在文件夹', 'folder', () => go({ screen: 'folder', path: fmt.parentOf(entry.path) }))]),
      action('属性', 'info', () => ui.openSheet(entry.name, [action('关闭','close',()=>{})], '位置：' + entry.path + '\n类型：' + (entry.isDir ? '文件夹' : entry.kind) + '\n大小：' + fmt.size(entry.size) + '\n修改时间：' + fmt.date(entry.modifiedMs))),
      action('删除', 'trash', () => remove([entry.path]), true),
    ]);
  }
  function favorite(entry) {
    const next = state.favorites.some(e => e.path === entry.path) ? state.favorites.filter(e => e.path !== entry.path) : [...state.favorites, { name: entry.name, path: entry.path, isDir: entry.isDir }];
    const added = next.length > state.favorites.length;
    cache('rhfiles.favorites', JSON.stringify(next)); state.favorites = next;
    ui.toast(added ? '已添加收藏' : '已取消收藏');
    if (state.route.screen === 'favorites') go(state.route, { replace: true });
  }
  function setClipboard(mode, paths) {
    if (state.task) return ui.toast('请等待当前文件任务完成');
    if (!paths.length) return;
    state.clipboard = { mode, paths: [...new Set(paths)] }; state.selected.clear();
    renderList(); renderShell();
  }
  async function task(label, work) {
    if (state.task) { ui.toast('请等待当前文件任务完成'); return; }
    state.task = { label }; renderShell();
    try { await work(); } catch (err) { error(err); }
    finally { state.task = null; renderShell(); }
  }
  function failures(title, report) {
    if (report.failures?.length) ui.openSheet(title, [action('关闭','close',()=>{})], report.failures.map(item => item.path + '\n' + item.message).join('\n\n'));
  }
  async function paste() {
    if (!state.clipboard || state.route.screen !== 'folder' || state.busy) return;
    const pending = state.clipboard, destination = state.route.path;
    const start = { ...state.route };
    await task(pending.mode === 'cut' ? '正在移动到 ' + pathLabel(destination) : '正在复制到 ' + pathLabel(destination), async () => {
      const report = await (pending.mode === 'cut' ? api.moveEntries : api.copyEntries)({ sources: pending.paths, destination });
      if (state.clipboard === pending) {
        const failed = new Set((report.failures || []).map(item => item.path));
        const remaining = pending.paths.filter(path => failed.has(path));
        state.clipboard = remaining.length ? { ...pending, paths: remaining } : null;
      }
      ui.toast('已完成 ' + (report.moved?.length || 0) + ' 项' + (report.failures?.length ? '，失败 ' + report.failures.length + ' 项，可重试' : ''));
      if (sameRoute(state.route,start)) await go(start, { replace: true });
      failures('部分文件未完成', report);
    });
  }
  async function remove(paths) {
    if (state.task || !paths.length) return;
    const confirmed = await ui.confirm('删除 ' + paths.length + ' 项？', '本次为永久删除，无法撤销。\n' + paths.slice(0,3).map(fmt.baseName).join('\n'), '永久删除');
    if (!confirmed) return;
    const start = { ...state.route };
    await task('正在删除 ' + paths.length + ' 项', async () => {
      const report = await api.deleteEntries({ paths, permanent: true });
      const deleted = new Set(report.deleted || []);
      state.entries = state.entries.filter(item => !deleted.has(item.path));
      state.selected.clear();
      ui.toast('已删除 ' + deleted.size + ' 项');
      if (sameRoute(state.route,start)) {
        if (start.screen === 'folder') await go(start, { replace: true }); else renderList();
      }
      failures('部分文件未删除', report);
    });
  }
  async function rename(entry) {
    if (state.task) return;
    const name = await ui.prompt('重命名', entry.name, '保存');
    if (!name || name === entry.name) return;
    const start = { ...state.route };
    await task('正在重命名', async () => {
      await api.renameEntry({ path: entry.path, newName: name });
      if (sameRoute(state.route,start)) await go(start, { replace: true });
      ui.toast('已重命名');
    });
  }
  function newMenu() {
    const parent = state.route.path;
    if (state.route.screen !== 'folder') return;
    const create = async (folder) => {
      const name = await ui.prompt(folder ? '新建文件夹' : '新建文件', folder ? '新建文件夹' : '新建文件.txt', '创建');
      if (!name) return;
      await task('正在创建', async () => {
        await (folder ? api.createDirectory : api.createFile)({ parent, name });
        if (state.route.screen === 'folder' && state.route.path === parent) await go(state.route, { replace: true });
      });
    };
    ui.openSheet('新建', [action('文件夹','folder',()=>create(true)), action('文件','document',()=>create(false))]);
  }
  function sortMenu() {
    ui.openSheet('排序方式', [['name','名称'],['date','修改时间（新到旧）'],['size','大小（大到小）'],['kind','类型']].map(([key,label]) => action((state.sort === key ? '✓ ' : '') + label, 'sort', () => { state.sort = key; cache('rhfiles.sort',key); renderList(); })));
  }
  function viewMenu() {
    ui.openSheet('显示方式', [['list','列表'],['grid','网格']].map(([key,label])=> action((state.view===key?'✓ ':'')+label,'grid',()=>{ state.view=key; cache('rhfiles.view',key); renderList(); })));
  }
  function moreMenu() {
    const options = [action('设置','settings',()=>go({screen:'tool',tool:'settings'}))];
    if (isList()) options.unshift(action('显示方式','grid',viewMenu), action('排序','sort',sortMenu), action('全选','copy',()=>{ state.selected = new Set(currentEntries().map(e=>e.path)); paintSelection(); }));
    if (state.route.screen === 'folder') options.unshift(action('收藏此文件夹','star',()=>favorite({path:state.route.path,name:fmt.baseName(state.route.path),isDir:true})));
    ui.openSheet('更多选项', options);
  }
  async function runSearch(query) {
    if (state.route.screen !== 'search') return;
    const id = ++searchId, nav = navigationId, route = state.route;
    route.query = query;
    if (!query.trim()) { state.entries=[]; showPlaceholder('输入文件名进行搜索'); return; }
    try {
      let entries;
      if (route.global) {
        const status = await api.indexStatus();
        if (id !== searchId || nav !== navigationId) return;
        if (!status.entryCount && !status.lastFinishedMs) { showPlaceholder('尚未建立全局文件索引', rebuildIndex, '建立索引'); return; }
        entries = (await api.searchFiles({query,limit:1000,directoriesOnly:false})).filter(item=>state.hidden || !item.path.split('/').some(part=>part.startsWith('.'))).map(item=>({...item,kind:item.isDir?'folder':kindOf(item.name)}));
      } else {
        const listing = await api.listDir({path:route.path});
        const tokens = query.toLocaleLowerCase().trim().split(/\s+/);
        entries = listing.entries.filter(item=>tokens.every(token=>item.name.toLocaleLowerCase().includes(token)));
      }
      if (id !== searchId || nav !== navigationId) return;
      state.entries = entries; state.selected.clear(); showList(); renderShell();
    } catch (err) { if (id === searchId && nav === navigationId) showPlaceholder('搜索失败：' + err); }
  }
  async function refreshSettings() {
    const [permissions,status,info] = await Promise.all([api.permissionStatus(),api.indexStatus(),api.appInfo()]);
    state.permissions = permissions; state.index = status;
    $('permissions').textContent = permissions.manageExternalStorage ? '已获得所有文件访问权限' : '尚未获得所有文件访问权限';
    $('index-status').textContent = status.indexing ? '正在建立索引：已扫描 ' + fmt.count(status.scannedDirs) + ' 个文件夹' : '已索引 ' + fmt.count(status.entryCount) + ' 个名称' + (status.lastFinishedMs ? '\n更新于 ' + fmt.date(status.lastFinishedMs) : '');
    $('version').textContent = 'RHFiles Android ' + info.version;
    $('btn-theme').textContent = '主题：' + (document.documentElement.dataset.theme === 'dark' ? '深色' : '明亮');
    $('btn-hidden').textContent = '显示隐藏文件：' + (state.hidden ? '开' : '关');
    if (status.indexing) pollIndex();
  }
  async function rebuildIndex() {
    await api.indexStart({ roots: state.roots.map(root=>root.path) });
    state.index = { ...state.index, indexing: true }; ui.toast('开始建立索引，可继续浏览文件'); pollIndex();
    if (state.route.screen === 'home') renderHome();
  }
  function pollIndex() {
    if (indexTimer) return;
    indexTimer = setInterval(async () => {
      try {
        const status = await api.indexStatus(); state.index = status;
        $('index-status').textContent = status.indexing ? '正在索引：' + fmt.count(status.scannedDirs) + ' 个文件夹' : '已索引 ' + fmt.count(status.entryCount) + ' 个名称';
        if (!status.indexing) {
          clearInterval(indexTimer); indexTimer = null;
          if (status.error) error(status.error); else ui.toast('文件索引已更新');
          if (['home','library','search'].includes(state.route.screen)) await go(state.route,{replace:true});
        }
      } catch { clearInterval(indexTimer); indexTimer=null; }
    },1500);
  }
  async function refreshServer() {
    const server = await api.serverStatus(); state.server=server;
    $('server-status').textContent = server.running ? '共享位置：' + server.root + '\n' + ((server.urls || []).join('\n') || '未检测到局域网地址，请连接 Wi-Fi') : '文件服务未启动';
    $('btn-server-toggle').textContent = server.running ? '停止文件服务' : '启动文件服务';
  }
  async function refreshLogs() {
    const page = await api.logs({limit:200});
    $('log-view').textContent = page.entries.map(e=>fmt.date(e.atMs)+' ['+e.level+'] '+e.scope+': '+e.message).join('\n') || '暂无日志';
  }
  async function scan() {
    const root = state.root;
    $('btn-scan').disabled=true; $('scan-result').textContent='正在分析…';
    try {
      const report = await api.scanStorageSizes({root,maxEntries:400000});
      if (state.route.tool !== 'usage' || state.root !== root) return;
      $('scan-result').replaceChildren(ui.el('div','','总计 '+fmt.size(report.totalBytes)+' · '+fmt.count(report.files)+' 个文件'));
      for (const c of report.categories) $('scan-result').append(ui.el('div','',({Images:'图片',Audio:'音频',Videos:'视频',Documents:'文档',Archives:'压缩包',Other:'其他'})[c.name] || c.name), ui.el('div','',fmt.size(c.bytes)+' · '+fmt.count(c.files)+' 项'));
      if(report.truncated) $('scan-result').append(ui.el('p','','已达到扫描上限，结果不完整。'));
    } catch(err) { $('scan-result').textContent='分析失败：'+err; } finally { $('btn-scan').disabled=false; }
  }
  function back() {
    if(ui.isSheetOpen()) { ui.closeSheet(); return true; }
    if(!$('drawer').hidden) { closeDrawer(); return true; }
    if(state.selected.size) { clearSelection(); return true; }
    if(state.stack.length) { go(state.stack.pop(),{replace:true}); return true; }
    if(state.route.screen!=='home') { go({screen:'home'},{replace:true}); return true; }
    return false;
  }
  async function bootStorage() {
    showPlaceholder('正在读取存储位置…');
    const permissions = await api.permissionStatus(); state.permissions=permissions;
    if(!permissions.sharedStorageReadable) {
      const box=ui.el('div','blocked');
      box.append(ui.el('h2','','允许访问本机文件'),ui.el('p','','浏览和管理共享存储前，请在系统设置中允许 RHFiles 访问所有文件。其他应用的私有目录仍可能受到安卓限制。'),
        button('打开系统设置','open',()=>api.openAppSettings(),'primary'),button('重新检查','refresh',bootStorage,'text-btn'));
      $('placeholder').replaceChildren(box); renderShell(); return;
    }
    state.roots=await api.storageRoots();
    if(state.roots.length) state.root=state.roots.find(r=>!r.removable)?.path || state.roots[0].path;
    try { state.index=await api.indexStatus(); } catch {}
    await go({screen:'home'},{replace:true});
  }
  async function boot() {
    for(const node of document.querySelectorAll('[data-icon]')) node.innerHTML=ui.icon(node.dataset.icon);
    document.documentElement.dataset.theme=saved('rhfiles.theme','light')==='dark'?'dark':'light';
    api.systemTheme(document.documentElement.dataset.theme==='dark').catch(()=>{});
    ui.bindScrim();
    $('scrim').addEventListener('click',closeDrawer);
    on('btn-menu',openDrawer); on('drawer-close',closeDrawer);
    on('nav-home',()=>{closeDrawer();return go({screen:'home'});});
    on('nav-settings',()=>{closeDrawer();return go({screen:'tool',tool:'settings'});});
    on('btn-home',()=>go({screen:'home'}));
    on('btn-up',()=>{ const path=state.route.path; return go(rootFor(path)?.path===path?{screen:'home'}:{screen:'folder',path:fmt.parentOf(path)}); });
    on('btn-search',()=>go({screen:'search',path:state.route.screen==='folder'?state.route.path:state.root,global:state.route.screen!=='folder'}));
    on('btn-search-close',()=>back());
    on('search-scope',()=>{ state.route.global=!state.route.global; $('search-scope').textContent=state.route.global?'全部文件':'当前文件夹'; return runSearch($('search-input').value); });
    $('search-input').addEventListener('input',()=>{clearTimeout(searchTimer);++searchId;searchTimer=setTimeout(()=>runSearch($('search-input').value),160);});
    on('btn-overflow',moreMenu); on('btn-view',viewMenu); on('btn-sort',sortMenu); on('btn-new',newMenu);
    on('btn-refresh',()=>go(state.route,{replace:true})); on('sel-close',clearSelection);
    on('sel-all',()=>{ const entries=currentEntries(); state.selected=state.selected.size===entries.length?new Set():new Set(entries.map(e=>e.path)); paintSelection(); });
    $('selection-bar').addEventListener('click',e=>{
      const which=e.target.closest('[data-action]')?.dataset.action, paths=[...state.selected];
      if(which==='copy'||which==='cut') setClipboard(which,paths);
      if(which==='delete') remove(paths).catch(error);
      if(which==='rename'&&paths.length===1) rename(state.entries.find(item=>item.path===paths[0])).catch(error);
      if(which==='more') ui.openSheet('已选 '+paths.length+' 项',[action('复制路径','copy',async()=>{await ui.copyText(paths.join('\n'));ui.toast('路径已复制');})]);
    });
    on('btn-paste',paste); on('btn-cancel-paste',()=>{state.clipboard=null;renderList();renderShell();});
    on('btn-reindex',rebuildIndex); on('btn-clear-index',async()=>{await api.indexClear();await refreshSettings();});
    on('btn-permission',()=>api.openAppSettings());
    on('btn-theme',async()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';cache('rhfiles.theme',document.documentElement.dataset.theme);await api.systemTheme(document.documentElement.dataset.theme==='dark');return refreshSettings();});
    on('btn-hidden',()=>{state.hidden=!state.hidden;cache('rhfiles.hidden',state.hidden?'1':'0');return refreshSettings();});
    on('btn-refresh-logs',refreshLogs); on('btn-copy-logs',async()=>{await refreshLogs();await ui.copyText($('log-view').textContent);ui.toast('日志已复制');});
    on('btn-clear-logs',async()=>{await api.clearLogs();await refreshLogs();});
    on('btn-server-toggle',async()=>{ if(state.server?.running) await api.serverStop(); else if(await ui.confirm('启动局域网文件服务？','同一网络的设备将能读取和写入 '+pathLabel(state.root)+'。仅在可信网络使用。','启动')) await api.serverStart({options:{root:state.root}}); await refreshServer(); });
    on('btn-scan',scan);
    history.replaceState({rhfiles:true},'',location.href);
    history.pushState({rhfiles:true},'',location.href);
    window.addEventListener('popstate',()=>{
      if(back()) {history.pushState({rhfiles:true},'',location.href);return;}
      if(Date.now()-quitArmedAt<2000) return;
      quitArmedAt=Date.now(); ui.toast('再按一次返回键退出');history.pushState({rhfiles:true},'',location.href);
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();back();}});
    let width=0;
    new ResizeObserver(entries=>{const w=entries[0].contentRect.width;if(w!==width){width=w;renderList();}}).observe($('filelist'));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden && state.permissions && !state.permissions.manageExternalStorage) bootStorage().catch(error);});
    if(!api.available()) {showPlaceholder('此版本无法连接文件服务，请重新安装。');return;}
    try {await bootStorage();} catch(err){showPlaceholder('启动失败：'+err,bootStorage);}
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
