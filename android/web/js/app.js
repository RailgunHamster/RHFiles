/* RHFiles mobile shell: explicit routes, bounded lists and independent tasks.
 * The layout follows File Manager Plus's familiar category-home/browser model;
 * icons, implementation and branding are RHFiles's own. */
(() => {
  const $ = (id) => document.getElementById(id);
  const saved = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const cache = (key, value) => {localStorage.setItem(key, value);if(key==='rhfiles.favorites')window.dispatchEvent(new Event('rhfiles-config-changed'));};
  const navigationKey='rhfiles.navigation'+(workbench.id==='second'?'.second':'');
  let peerTask=null;
  const paneHost=()=>workbench.parentHost();
  const dual=()=>!!paneHost()?.dual(window);
  const blocked=()=>!!state.task||!!peerTask;
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
  let refreshPromise = null, refreshAgain = false;
  let navigationTimer,lastNavigationSnapshot='';
  function rememberNavigation(){
    if(!state.permissions||document.hidden)return;
    try{
      const value={version:1,root:state.root,route:{...state.route,scroll:$('filelist').scrollTop},stack:state.stack.slice(-128),selected:[...state.selected],clipboard:state.clipboard};
      const json=JSON.stringify(value);if(json!==lastNavigationSnapshot){cache(navigationKey,json);lastNavigationSnapshot=json;}
    }catch{} // A full/disabled cache never prevents browsing or file operations.
  }
  function savedNavigation(){
    try{const value=JSON.parse(saved(navigationKey,'null'));return value?.version===1&&['home','folder','library','favorites','search','tool'].includes(value.route?.screen)?value:null;}catch{return null;}
  }
  const folderParents = new Map();
  let homeSnapshot='';
  const sameRoute = (a, b) => JSON.stringify([a.screen,a.path,a.category,a.folder,a.tool,a.boundary]) === JSON.stringify([b.screen,b.path,b.category,b.folder,b.tool,b.boundary]);
  const rootFor = (path) => state.roots.filter((root) => path.replace(/\/+$/,'') === root.path.replace(/\/+$/,'') || path.startsWith(root.path.replace(/\/+$/,'') + '/')).sort((a,b) => b.path.length - a.path.length)[0];
  // A Home shortcut has a navigation root, not a different filesystem path.
  // Carry it only within that subtree; ordinary storage/favorite routes stay real.
  const folderRoute = (path, label, parentPath) => {
    const {boundary,boundaryLabel}=state.route;
    return {screen:'folder',path,label,parentPath,...(boundary && (path===boundary || path.startsWith(boundary+'/')) ? {boundary,boundaryLabel} : {})};
  };
  const rootLabel = (root) => root?.provider ? root.label : root?.removable ? '外部存储' : '内部存储';
  const pathLabel = (path) => {
    const root = rootFor(path);
    return root ? rootLabel(root) + fmt.displayPath(path).slice(fmt.displayPath(root.path.replace(/\/+$/,'')).length) : fmt.displayPath(path);
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
    rememberNavigation();
    if(document.body.classList.contains('wide-layout'))renderDrawer();
    const route = state.route, count = state.selected.size, pending = state.clipboard;
    const title = route.screen === 'home' ? 'RHFiles'
      : route.screen === 'folder' ? (route.boundary===route.path ? route.boundaryLabel : rootFor(route.path)?.path === route.path ? rootLabel(rootFor(route.path)) : route.label || fmt.baseName(route.path))
      : route.screen === 'library' ? labels[route.category] + (route.folder ? ' · ' + fmt.baseName(route.folder) : '')
      : route.screen === 'favorites' ? '收藏夹'
      : route.screen === 'search' ? '搜索'
      : ({ settings: '设置', server: '从电脑访问', usage: '空间分析', remote:'网络位置',providers:'外置存储与网盘',apps:'应用管理',tasks:'文件任务',trash:'回收站',nearby:'附近互传' })[route.tool] || 'RHFiles';
    $('title').textContent = title;
    document.querySelector('.topbar').hidden = count > 0;
    $('selection-head').hidden = count === 0;
    $('sel-count').textContent = '已选择 ' + count + ' 项';
    $('selection-bar').hidden = count === 0;
    $('selection-bar').querySelector('[data-action="rename"]').disabled = count !== 1 || blocked();
    for (const node of $('selection-bar').querySelectorAll('button')) if (node.dataset.action !== 'rename') node.disabled = blocked();
    $('pane-transfer-actions').hidden=!count||!dual();
    $('copy-to-pane').disabled=$('move-to-pane').disabled=blocked();
    $('filelist').classList.toggle('selecting', count > 0);
    $('browse-actions').hidden = !isList() || count > 0 || !!pending;
    $('btn-new').disabled = route.screen !== 'folder' || blocked() || state.busy;
    $('list-status').hidden = !isList() || state.busy;
    $('btn-search').hidden = route.screen === 'tool';
    $('pathbar').hidden = route.screen !== 'folder';
    $('searchbar').hidden = route.screen !== 'search';
    $('paste-bar').hidden = !pending || !!count || blocked();
    if (pending) {
      $('paste-label').textContent = (pending.mode === 'cut' ? '待移动 ' : '待复制 ') + pending.paths.length + ' 项';
      $('paste-destination').textContent = route.screen === 'folder' ? '目标：' + pathLabel(route.path) : '请打开目标文件夹';
      $('btn-paste').textContent = pending.mode === 'cut' ? '移动到这里' : '粘贴到这里';
      $('btn-paste').disabled = route.screen !== 'folder' || state.busy;
    }
    $('task-bar').hidden = !blocked();
    $('task-label').textContent = state.task?.label || peerTask || '';
    if (route.screen === 'folder') {
      const root = rootFor(route.path), boundary=route.boundary;
      const parts = boundary ? [{name:route.boundaryLabel,path:boundary},...fmt.path2parts(route.path).filter(p=>p.path.startsWith(boundary+'/'))] : api.isVirtual(route.path) ? [{name:route.label || root?.label || '网络 / 授权位置',path:route.path}] : root ? [{ name: rootLabel(root), path: root.path }, ...fmt.path2parts(route.path).filter(p => p.path.startsWith(root.path + '/'))] : fmt.path2parts(route.path);
      $('crumbs').replaceChildren();
      parts.forEach((part, i) => {
        if (i) $('crumbs').append(ui.el('span', 'sep', '›'));
        const b = button(part.name, 'folder', () => go(folderRoute(part.path)), 'crumb' + (i === parts.length - 1 ? ' current' : ''));
        b.querySelector('svg').remove();
        $('crumbs').append(b);
      });
      requestAnimationFrame(() => { $('crumbs').scrollLeft = $('crumbs').scrollWidth; });
    }
    $('banner').hidden = !state.permissions || state.permissions.manageExternalStorage;
    if (!$('banner').hidden) {
      $('banner').replaceChildren(ui.el('span', '', '尚未获得所有文件访问权限，部分内容可能不可见。'));
      $('banner').append(button('去授权', 'open', () => api.openAppSettings(), 'text-btn'));
    }
  }
  function paintSelection() {
    if(state.selected.size)$('filelist').dispatchEvent(new Event('rhfiles-list-reset'));
    renderShell();
    for (const node of $('filelist').querySelectorAll('[data-path]')) {
      node.classList.toggle('selected', state.selected.has(node.dataset.path));
      node.classList.toggle('pending-cut',state.clipboard?.mode==='cut'&&state.clipboard.paths.includes(node.dataset.path));
      node.setAttribute('aria-selected', String(state.selected.has(node.dataset.path)));
    }
  }
  function toggleSelection(path) {
    if(state.entries.find(e=>e.path===path)?.libraryAlbum)return;
    if (state.selected.has(path)) state.selected.delete(path); else state.selected.add(path);
    paintSelection();
  }
  function startSelection(entry){
    if(entry.libraryAlbum)return ui.toast('请先打开分类，再长按选择文件');
    state.selected.add(entry.path);paintSelection();
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
    const homeRoots=state.roots.filter(root=>!root.network);
    // Capacity/index notifications must not replace nodes receiving an active
    // touch. Rebuild only when the navigation layout itself changes.
    const snapshot=JSON.stringify([state.roots.map(({path,label,removable,provider})=>({path,label,removable,provider})),state.root,api.featuresAvailable()]);
    const capacityOf=root=>Number.isFinite(root.totalBytes) && Number.isFinite(root.freeBytes)
      ? fmt.size(root.totalBytes-root.freeBytes)+' / '+fmt.size(root.totalBytes) : root.network ? '网络存储 · '+String(root.protocol||'SMB').toUpperCase() : root.provider ? '已授权存储' : root.removable ? fmt.baseName(root.path) : '本机文件';
    const noteText=state.index?.lastFinishedMs ? '分类基于文件名索引；新文件可通过更新索引加入。' : '图片、音频等分类需要先建立本机文件名索引。';
    const indexText=state.index?.indexing ? '正在建立索引…' : '更新索引';
    if(snapshot===homeSnapshot && $('home').childElementCount){
      homeRoots.forEach((root,i)=>{$('home').querySelector(`[data-tile="storage-${i}"] small`).textContent=capacityOf(root);});
      $('home').querySelector('[data-tile="favorites"] small').textContent=state.favorites.length+' 个位置';
      const note=$('home').querySelector('.home-note');note.querySelector('.index-description').textContent=noteText;note.querySelector('button').setAttribute('aria-label',indexText);note.querySelector('button').disabled=!!state.index?.indexing;note.querySelector('.index-caption').textContent=state.index?.indexing?'正在更新索引…':fmt.count(state.index?.entryCount || 0)+' 个已索引项目';
      androidUpdates.paintHome();return;
    }
    homeSnapshot=snapshot;
    const home = $('home'), grid = ui.el('div', 'home-grid');
    home.replaceChildren(grid);
    for (const [i, root] of homeRoots.entries()) {
      const capacity = capacityOf(root);
      tile(grid, 'storage-' + i, rootLabel(root), ui.storageSymbol(root), '#5572d8', capacity, () => go({ screen: 'folder', path: root.path,label:rootLabel(root) }));
    }
    tile(grid, 'downloads', '下载', 'download', '#b78a41', 'Download', () => go({ screen: 'folder', path: state.root + '/Download', boundary:state.root+'/Download', boundaryLabel:'下载' }));
    for (const [id, label, color] of categories) tile(grid, id, label, id, color, id === 'recent' ? '按修改时间' : '按文件类型', () => go({ screen: 'library', category: id }));
    tile(grid, 'favorites', '收藏夹', 'star', '#ca9940', state.favorites.length + ' 个位置', () => go({ screen: 'favorites' }));
    tile(grid, 'server', '从电脑访问', 'server', '#54877b', '局域网传输', () => go({ screen: 'tool', tool: 'server' }));
    tile(grid, 'usage', '空间分析', 'chart', '#8b739a', '查看文件占用', () => go({ screen: 'tool', tool: 'usage' }));
    tile(grid, 'settings', '设置', 'settings', '#748193', '显示与权限', () => go({ screen: 'tool', tool: 'settings' }));
    if (api.featuresAvailable()) for (const [id,label,icon,note] of androidFeatures.destinations) tile(grid,id,label,icon,'#648b9c',note,()=>id==='nearby'?androidNearby.open():go({screen:'tool',tool:id}));
    const note=ui.el('section','home-note index-card'),symbol=ui.el('div','index-symbol');symbol.innerHTML=ui.icon('search');
    const copy=ui.el('div','index-copy');copy.append(ui.el('strong','index-caption',state.index?.indexing?'正在更新索引…':fmt.count(state.index?.entryCount || 0)+' 个已索引项目'),ui.el('p','index-description',noteText));
    const update=button('更新','refresh',rebuildIndex,'index-update');update.setAttribute('aria-label',indexText);update.disabled=!!state.index?.indexing;note.append(symbol,copy,update);
    home.append(note);
    androidUpdates.paintHome();
  }
  let drawerSignature='';
  function renderDrawer() {
    const signature=JSON.stringify([state.roots,state.favorites]);if(signature===drawerSignature)return;drawerSignature=signature;
    $('roots').replaceChildren(...state.roots.map(root => {const row=button(rootLabel(root), ui.storageSymbol(root), () => { closeDrawer(); return go({ screen: 'folder', path: root.path,label:rootLabel(root) }); });if(root.needsPassword)row.append(ui.el('small','credential-badge','待补填密码'));return row;}));
    $('nav-favorites').replaceChildren(...state.favorites.map(entry => {
      const row=ui.el('div','favorite-location');
      const open=button(favoriteLabel(entry),'star',()=>{closeDrawer();return activate(entry);});
      const more=button('收藏操作','more',()=>{closeDrawer();favoriteMenu(entry);},'icon-btn favorite-more');
      more.setAttribute('aria-label',favoriteLabel(entry)+' 的收藏操作');more.querySelector('span').remove();
      row.append(open,more);return row;
    }));
    if (!state.favorites.length) $('nav-favorites').append(ui.el('p', 'muted', '在文件的更多菜单中添加收藏'));
  }
  function openDrawer() { renderDrawer(); ui.setDrawerOpen(true); }
  function closeDrawer() { ui.setDrawerOpen(false); }
  async function refreshLocations(){state.roots=await api.storageRoots();thumbnails.clear();renderDrawer();if(state.route.screen==='home')renderHome();}
  function removeFavoritePrefix(prefix){state.favorites=state.favorites.filter(e=>!e.path.startsWith(prefix));cache('rhfiles.favorites',JSON.stringify(state.favorites));renderDrawer();}

  // Request IDs make old directory/search/preview responses unable to replace a
  // newer screen. The in-app back stack is independent of WebView history.
  async function go(route, options = {}) {
    if(route.screen!=='tool'||route.tool!=='nearby')androidNearby.leave();
    if(route.screen!=='tool'||route.tool!=='usage')androidUsage.leave();
    if (route.screen === 'home') state.stack = [];
    else if (!options.replace && !sameRoute(route, state.route)) state.stack.push({ ...state.route, scroll: $('filelist').scrollTop });
    if (route.screen === 'folder' && route.parentPath && route.path !== route.parentPath) folderParents.set(route.path,route.parentPath);
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
        $('tool-extra').hidden = ['settings','server','usage'].includes(route.tool);
        if (!$('tool-extra').hidden) await androidFeatures.renderTool(route.tool);
        if (route.tool === 'settings') await refreshSettings();
        if (route.tool === 'server') {await refreshServer();await androidFeatures.refreshFtp();}
        if (route.tool === 'usage') {
          await androidUsage.enter(route.path||state.root);
        }
      } else if (route.screen === 'folder') {
        showPlaceholder('正在读取文件夹…');
        if(api.featuresAvailable()&&route.path.startsWith('remote://')&&!await androidFeatures.beforeRemoteNavigate(route.path,()=>id===navigationId)){
          if(id===navigationId)showPlaceholder('此网络位置待补填密码\n密码不会随配置同步，请在本机补填后连接。',()=>go(route,{replace:true}),'补填密码');
          return;
        }
        if(id!==navigationId)return;
        const listing = await api.listDir({ path: route.path });
        if (id !== navigationId) return;
        state.route.path = listing.path; state.listing = listing; state.entries = listing.entries || [];
        const root = rootFor(listing.path); if (root && !api.isVirtual(root.path)) state.root = root.path;
        showList(route.scroll);
      } else if (route.screen === 'favorites') {
        state.entries = state.favorites.map(item => ({ ...item, kind: item.isDir ? 'folder' : kindOf(item.name) }));
        showList(route.scroll);
      } else if (route.screen === 'library') {
        showPlaceholder('正在读取分类…');
        const status = await api.indexStatus();
        if (id !== navigationId) return;
        state.index = status;
        if (!status.lastFinishedMs && !status.entryCount && !(api.featuresAvailable() && ['image','audio','video'].includes(route.category))) {
          showPlaceholder(status.indexing ? '正在建立索引，完成后会自动刷新。' : '尚未建立文件索引。\n建立索引后即可按类型浏览。', rebuildIndex, '建立索引');
          if (status.indexing) pollIndex();
        } else {
          const page = await api.browseLibrary({ category: route.category, root: state.root, showHidden: state.hidden, limit: 2000,albums:route.category!=='recent'&&!route.folder,folder:route.folder });
          if (id !== navigationId) return;
          state.entries = libraryEntries(page.entries,route); state.listing = page; showList(route.scroll);
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

  // Storage notifications must not perform navigation or hide a usable listing.
  // Coalesce bursts, keep the existing DOM when unchanged, and discard late replies.
  async function refreshCurrent() {
    if(state.route.screen==='tool'&&state.route.tool==='nearby')return;
    if (refreshPromise) { refreshAgain = true; return refreshPromise; }
    refreshPromise = (async () => {
      do {
        refreshAgain = false;
        const route = state.route, token = navigationId;
        if (route.screen === 'home') { renderHome(); renderShell(); continue; }
        if (route.screen !== 'folder' && route.screen !== 'library') { await go(route,{replace:true}); continue; }
        if (state.busy) continue;
        try {
          const listing = route.screen === 'folder' ? await api.listDir({path:route.path})
            : await api.browseLibrary({category:route.category,root:state.root,showHidden:state.hidden,limit:2000,albums:route.category!=='recent'&&!route.folder,folder:route.folder});
          if (token !== navigationId || state.route !== route) continue;
          const entries = route.screen==='library'?libraryEntries(listing.entries||[],route):listing.entries||[], changed = !fmt.sameEntries(state.entries,entries) || entries.some((e,i)=>e.count!==state.entries[i]?.count||e.cover?.path!==state.entries[i]?.cover?.path);
          state.listing = listing;
          if (changed) {
            const scroll = $('filelist').scrollTop, paths = new Set(entries.map(entry=>entry.path));
            state.entries = entries;
            state.selected = new Set([...state.selected].filter(path=>paths.has(path)));
            renderList(scroll);
          }
        } catch (err) {
          if (token === navigationId && state.route === route) error('刷新失败，已保留当前列表：'+(err?.message || err));
        }
      } while (refreshAgain);
    })();
    try { await refreshPromise; } finally { refreshPromise = null; renderShell(); }
  }
  function currentEntries() {
    const list = fmt.shapeEntries(state.entries, { sort: state.route.screen === 'library' && state.route.category === 'recent' ? 'date' : state.sort, showHidden: state.hidden });
    return list;
  }
  function libraryEntries(entries,route){
    if(entries.some(e=>e.libraryAlbum))return entries;
    const visible=entries.filter(e=>state.hidden||!e.path.split('/').some(part=>part.startsWith('.')));
    if(route.category==='recent')return visible;
    if(route.folder)return visible.filter(e=>(e.parentPath||fmt.parentOf(e.path))===route.folder);
    return mobileList.albums(visible,fmt.parentOf,fmt.baseName);
  }
  let listGeometry;
  function renderList(scrollOverride) {
    if (!isList() || $('filelist').hidden) return;
    const container = $('filelist'), list = currentEntries();
    container.dispatchEvent(new Event('rhfiles-list-reset'));
    const existing=new Map([...container.querySelectorAll('[data-path]')].map(node=>[node.dataset.path,node]));
    const rowFor=entry=>{const old=existing.get(entry.path);return old?.dataset.signature===JSON.stringify(entry)&&old.classList.contains(state.view==='grid'?'cell':'row')?old:buildNode(entry);};
    let scroll = typeof scrollOverride === 'number' ? scrollOverride : container.scrollTop;
    container.classList.toggle('grid', state.view === 'grid');
    container.replaceChildren();
    $('list-status').textContent = list.length + ' 项' + (state.listing?.truncated ? ' · 仅显示部分结果，请缩小范围' : '');
    if (!list.length) {
      container.append(ui.el('div', 'placeholder', state.route.screen === 'favorites' ? '还没有收藏\n在文件或文件夹的更多菜单中添加。' : state.route.screen === 'search' ? '没有匹配的文件' : '没有文件'));
      return;
    }
    const height = state.view === 'grid' ? 136 : 64;
    const columns = state.view === 'grid' ? Math.max(2, Math.floor(container.clientWidth / 112)) : 1;
    const routeKey=JSON.stringify(state.route);
    if(listGeometry?.route===routeKey&&listGeometry.columns!==columns){const index=Math.floor(scroll/listGeometry.height)*listGeometry.columns;scroll=Math.floor(index/columns)*height;}
    listGeometry={route:routeKey,columns,height};
    const space=ui.el('div','file-space'),windowNode=ui.el('div','file-window');
    container.style.setProperty('--columns', columns);
    container.append(space);space.append(windowNode);
    // Establish the full scroll extent before restoring a saved offset.
    space.style.height = Math.ceil(list.length / columns) * height + 'px';
    container.scrollTop = scroll;
    let scheduled = false,previousRange='';
    function paint() {
      scheduled = false; if (!windowNode.isConnected) return;
      const {first,last}=mobileList.range(container.scrollTop,container.clientHeight,height,columns,list.length);
      const rangeKey=first+':'+last;if(previousRange===rangeKey)return;previousRange=rangeKey;
      windowNode.style.transform=`translateY(${first/columns*height}px)`;
      mobileList.reconcile(windowNode,list.slice(first,last),rowFor);thumbnails.prune();
    }
    container.onscroll = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(paint); } clearTimeout(navigationTimer);navigationTimer=setTimeout(rememberNavigation,100); };
    paint(); paintSelection();
  }
  function buildNode(entry) {
    const node = ui.el('div', state.view === 'grid' ? 'cell' : 'row');
    node.dataset.path = entry.path; node.dataset.kind = entry.isDir ? 'folder' : entry.kind;
    node.dataset.signature=JSON.stringify(entry);
    const displayName=state.route.screen==='favorites'?favoriteLabel(entry):entry.name;
    node.tabIndex = 0; node.setAttribute('role', 'option'); node.setAttribute('aria-label', displayName);
    node.classList.toggle('selected',state.selected.has(entry.path));node.setAttribute('aria-selected',String(state.selected.has(entry.path)));
    if (state.clipboard?.mode === 'cut' && state.clipboard.paths.includes(entry.path)) node.classList.add('pending-cut');
    const thumb = ui.el('div', 'thumb'); thumb.innerHTML = ui.icon(entry.isDir ? 'folder' : entry.kind);
    const content=ui.el('div','entry-content');node.append(content);content.append(thumb);
    if (['image','video'].includes(entry.kind)) thumbnail(thumb, entry);
    else if(entry.libraryAlbum&&['image','video'].includes(entry.cover.kind))thumbnail(thumb,entry.cover);
    if(entry.kind==='video')thumb.classList.add('video-thumb');
    const meta = ui.el('div', 'meta'); meta.append(ui.el('div', 'name', displayName));
    if (state.view !== 'grid' || entry.libraryAlbum) meta.append(ui.el('div', 'sub',entry.libraryAlbum?entry.count+' 项 · '+pathLabel(entry.path):(entry.isDir ? '文件夹' : fmt.size(entry.size)) + (entry.modifiedMs ? ' · ' + fmt.date(entry.modifiedMs).split(' ')[0] : '') + (state.route.screen !== 'folder' ? ' · ' + pathLabel(fmt.parentOf(entry.path)) : '')));
    content.append(meta, ui.el('div', 'check'));
    const more = button('更多操作', 'more', () => entryMenu(entry), 'entry-more');
    more.setAttribute('aria-label', entry.name + ' 的更多操作'); more.querySelector('span').remove();
    more.addEventListener('pointerdown', e => e.stopPropagation());
    more.addEventListener('click', e => e.stopPropagation()); content.append(more);
    if(!entry.libraryAlbum){
      const del=button('删除','trash',()=>{node.dispatchEvent(new Event('rhfiles-close-swipe',{bubbles:true}));return remove([entry.path]);},'entry-delete');
      del.setAttribute('aria-label','删除 '+displayName);del.hidden=true;del.tabIndex=-1;
      del.addEventListener('pointerdown',e=>e.stopPropagation());del.addEventListener('click',e=>e.stopPropagation());node.prepend(del);
    }
    node.addEventListener('keydown', e => { if(e.target!==node)return;if (e.key === 'Enter') { e.preventDefault(); activate(entry).catch(error); } else if (e.key === ' ') { e.preventDefault(); toggleSelection(entry.path); } });
    return node;
  }
  const thumbnails=mobileList.thumbnailLoader(entry=>api.readThumbnail({path:entry.path,kind:entry.kind,maxEdge:160}));
  function thumbnail(node, entry) {
    thumbnails.request(entry,data=>{const image=new Image();image.alt='';image.decoding='async';image.onerror=()=>{if(image.isConnected)node.innerHTML=ui.icon(entry.kind);};image.src=data;node.replaceChildren(image);},()=>node.isConnected);
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
    if(entry.libraryAlbum)return go({screen:'library',category:state.route.category,folder:entry.path});
    if (entry.isDir) return go(folderRoute(entry.path,favoriteLabel(entry),
      entry.parentPath || (state.route.screen==='folder' ? state.route.path : null)));
    if(api.featuresAvailable()&&entry.path.startsWith('remote://')){const nav=navigationId;if(!await androidFeatures.beforeRemoteNavigate(entry.path,()=>navigationId===nav)||navigationId!==nav)return;}
    if(api.ebooksAvailable()&&/\.(epub|mobi|azw3?|prc|fb2|cbz)$/i.test(entry.name)&&!entry.path.startsWith('remote://'))return api.native('ebook.open',{path:entry.path,name:entry.name,theme:document.documentElement.dataset.theme});
    if(api.playbackAvailable() && ['video','audio'].includes(entry.kind))return api.playMedia(entry,currentEntries());
    if(api.featuresAvailable()&&entry.kind==='image')return androidFeatures.media(entry,currentEntries());
    if (api.featuresAvailable() && api.isVirtual(entry.path)) {
      if (entry.path.startsWith('content://')) return api.systemOpen(entry.path);
      return androidFeatures.download(entry);
    }
    if (api.featuresAvailable() && entry.kind === 'archive' && /\.(zip|tar|gz|xz|tgz|txz)$/i.test(entry.name)) return androidFeatures.archive(entry);
    if (['image','video','audio'].includes(entry.kind)) return androidFeatures.media(entry,currentEntries());
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
    $('filelist').dispatchEvent(new Event('rhfiles-list-reset'));
    ui.openSheet(entry.name,entryActions(entry),entry.libraryAlbum?entry.path+'\n'+entry.count+' 项':undefined);
  }
  function entryActions(entry){
    if(entry.libraryAlbum)return [action('查看此分类','folder',()=>activate(entry)),action('打开实际文件夹','open',()=>go({screen:'folder',path:entry.path})),action('复制路径','copy',()=>ui.copyText(entry.path))];
    return [
      action(entry.isDir ? '打开文件夹' : '打开 / 预览', 'open', () => activate(entry)),
      ...(entry.isDir?[action('分析空间','chart',()=>go({screen:'tool',tool:'usage',path:entry.path}))]:[]),
      action(state.selected.has(entry.path)?'取消选择':'选择','check',()=>toggleSelection(entry.path)),
      ...(!entry.isDir && api.nativeAvailable() ? [action('打开方式', 'open', () => api.systemOpen(entry.path)), action('分享', 'share', () => api.shareFile(entry.path))] : []),
      action('复制', 'copy', () => setClipboard('copy',[entry.path])),
      action('移动', 'cut', () => setClipboard('cut',[entry.path])),
      ...(dual()?[action('复制到另一窗格','copy',()=>transferToPane('copy',[entry.path])),action('移动到另一窗格','cut',()=>transferToPane('cut',[entry.path]))]:[]),
      action('重命名', 'rename', () => rename(entry)),
      ...(api.featuresAvailable() ? androidFeatures.entryActions(entry) : []),
      action(state.favorites.some(e => e.path === entry.path) ? '取消收藏' : '添加到收藏', 'star', () => favorite(entry)),
      ...(state.favorites.some(e=>e.path===entry.path)?[action('修改收藏名称','rename',()=>renameFavorite(entry))]:[]),
      action('复制路径', 'copy', async () => { await ui.copyText(entry.path); ui.toast('路径已复制'); }),
      ...(state.route.screen === 'folder' || (api.isVirtual(entry.path)&&!entry.parentPath) ? [] : [action('打开所在文件夹', 'folder', () => go(folderRoute(entry.parentPath || fmt.parentOf(entry.path))))]),
      action('属性', 'info', () => ui.openSheet(entry.name, [action('关闭','close',()=>{})], '位置：' + entry.path + '\n类型：' + (entry.isDir ? '文件夹' : entry.kind) + '\n大小：' + fmt.size(entry.size) + '\n修改时间：' + fmt.date(entry.modifiedMs))),
      action('删除', 'trash', () => remove([entry.path]), true),
    ];
  }
  function selectionMenu(){
    const paths=[...state.selected];if(!paths.length)return;
    const entries=paths.map(path=>state.entries.find(e=>e.path===path)||currentEntries().find(e=>e.path===path)).filter(Boolean);
    // The toolbar owns common operations; the remaining single-file operations
    // come from exactly the same source as that file's overflow menu.
    if(paths.length===1&&entries.length===1)return ui.openSheet('已选 1 项',entryActions(entries[0]).filter(item=>!['复制','移动','重命名','删除','选择','取消选择'].includes(item.label)));
    const removeFavorites=entries.every(e=>state.favorites.some(f=>f.path===e.path));
    ui.openSheet('已选 '+paths.length+' 项',[
      ...(dual()?[action('复制到另一窗格','copy',()=>transferToPane('copy',paths)),action('移动到另一窗格','cut',()=>transferToPane('cut',paths))]:[]),
      action('复制路径','copy',async()=>{await ui.copyText(paths.join('\n'));ui.toast('路径已复制');}),
      ...(api.featuresAvailable()?androidFeatures.selectionActions(paths):[]),
      ...(entries.length===paths.length?[action(removeFavorites?'取消收藏':'添加到收藏','star',()=>favoriteMany(entries,removeFavorites))]:[]),
      action('属性','info',()=>ui.openSheet('已选 '+paths.length+' 项',[action('关闭','close',()=>{})],paths.join('\n')+'\n已知文件大小：'+fmt.size(entries.reduce((n,e)=>n+(!e.isDir?e.size||0:0),0))+'（不统计文件夹内容）'))
    ]);
  }
  function favoriteMany(entries,removeAll){
    const previous=JSON.parse(saved('rhfiles.favorites','[]')),selected=new Set(entries.map(e=>e.path));
    const next=removeAll?previous.filter(f=>!selected.has(f.path)):[...previous,...entries.filter(e=>!previous.some(f=>f.path===e.path)).map(e=>({name:e.name,path:e.path,isDir:e.isDir,parentPath:e.parentPath}))];
    if(next.length>100)return ui.toast('常用 / 收藏位置最多保存 100 项，未更改收藏');
    cache('rhfiles.favorites',JSON.stringify(next));state.favorites=next;renderDrawer();if(state.route.screen==='favorites')go(state.route,{replace:true}).catch(error);ui.toast(removeAll?'已取消收藏':'已添加收藏');
  }
  const favoriteLabel=entry=>typeof entry.label==='string'&&entry.label.trim()?entry.label:entry.name;
  function favoriteMenu(entry){ui.openSheet(favoriteLabel(entry),[
    action('打开','open',()=>activate(entry)),action('修改收藏名称','rename',()=>renameFavorite(entry)),
    action('取消收藏','star',()=>favorite(entry)),action('复制路径','copy',()=>ui.copyText(entry.path))
  ],entry.path);}
  async function renameFavorite(entry){
    const value=await ui.prompt('修改收藏名称（不改变文件或路径）',favoriteLabel(entry),'保存');
    if(value===null)return;const label=value.trim();if(!label||label.length>1024)return ui.toast('名称需为 1–1024 个字符');
    // Re-read after the dialog: the other pane may have changed favorites.
    const next=JSON.parse(saved('rhfiles.favorites','[]')),found=next.find(item=>item.path===entry.path);
    if(!found)return ui.toast('此收藏已被移除');found.label=label;
    cache('rhfiles.favorites',JSON.stringify(next));state.favorites=next;renderDrawer();
    if(state.route.screen==='favorites')await go(state.route,{replace:true});ui.toast('收藏名称已保存，实际路径未改变');
  }
  function favorite(entry) {
    if(!state.favorites.some(e=>e.path===entry.path)&&state.favorites.length>=100)return ui.toast('常用 / 收藏位置最多保存 100 项，请先移除不再使用的项目');
    const next = state.favorites.some(e => e.path === entry.path) ? state.favorites.filter(e => e.path !== entry.path) : [...state.favorites, { name: entry.name, path: entry.path, isDir: entry.isDir, parentPath:entry.parentPath }];
    const added = next.length > state.favorites.length;
    cache('rhfiles.favorites', JSON.stringify(next)); state.favorites = next;
    ui.toast(added ? '已添加收藏' : '已取消收藏');
    renderDrawer();
    if (state.route.screen === 'favorites') go(state.route, { replace: true });
  }
  function setClipboard(mode, paths) {
    if (blocked()) return ui.toast('请等待当前文件任务完成');
    if (!paths.length) return;
    state.clipboard = { mode, paths: [...new Set(paths)] }; state.selected.clear();
    paneHost()?.clipboard(window,state.clipboard);
    renderList(); renderShell();
  }
  async function task(label, work) {
    if (blocked()||(paneHost()&&!paneHost().acquire(window,label))) { ui.toast('请等待当前文件任务完成'); return; }
    state.task = { label }; renderShell();
    try { await work(); } catch (err) { error(err); }
    finally { state.task = null; paneHost()?.release(window); renderShell(); }
  }
  async function transferToPane(mode,paths) {
    if(blocked()||!paths.length)return;
    const other=paneHost()?.other(window);
    if(!other)return ui.toast('请先开启双窗格');
    if(other.route.screen!=='folder')return ui.toast('请先在另一窗格打开目标文件夹');
    if(other.busy)return ui.toast('另一窗格正在读取，请稍后再试');
    const destination=other.route.path;
    if(!await ui.confirm(mode==='cut'?'移动到另一窗格？':'复制到另一窗格？',paths.length+' 项 → '+fmt.displayPath(destination)+'\n文件夹会合并；不会自动覆盖同名文件。',mode==='cut'?'移动':'复制',{danger:false,icon:mode==='cut'?'cut':'copy'}))return;
    const start={...state.route};
    // Capture the displayed destination before confirmation; never silently
    // follow the other pane to a different folder during an async dialog.
    await task((mode==='cut'?'正在移动到 ':'正在复制到 ')+pathLabel(destination),async()=>{
      const report=await(mode==='cut'?api.moveEntries:api.copyEntries)({sources:paths,destination});
      const failed=new Set((report.failures||[]).map(item=>item.path));state.selected=new Set(paths.filter(path=>failed.has(path)));
      ui.toast('已完成 '+(report.moved?.length||0)+' 项'+(failed.size?'，失败 '+failed.size+' 项':''));
      if(sameRoute(state.route,start))await go(start,{replace:true});
      failures('部分文件未完成',report);
    });
  }
  function failures(title, report) {
    if (report.failures?.length) ui.openSheet(title, [action('关闭','close',()=>{})], report.failures.map(item => fmt.displayPath(item.path) + '\n' + fmt.displayPathText(item.message)).join('\n\n'));
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
        paneHost()?.clipboard(window,state.clipboard,pending.revision);
      }
      ui.toast('已完成 ' + (report.moved?.length || 0) + ' 项' + (report.failures?.length ? '，失败 ' + report.failures.length + ' 项，可重试' : ''));
      if (sameRoute(state.route,start)) await go(start, { replace: true });
      failures('部分文件未完成', report);
    });
  }
  async function remove(paths) {
    if (blocked() || !paths.length) return;
      const recycle = api.featuresAvailable() && paths.every(p=>!api.isVirtual(p));
      const confirmed = await ui.confirm('删除 ' + paths.length + ' 项？', (recycle ? '移入 RHFiles 回收站，可在首页恢复。\n' : '本次为永久删除，无法撤销。\n') + paths.slice(0,3).map(fmt.baseName).join('\n'), recycle ? '移入回收站' : '永久删除');
    if (!confirmed) return;
    const start = { ...state.route };
    await task('正在删除 ' + paths.length + ' 项', async () => {
      const report = recycle ? await api.runJob('trash',{sources:paths}) : await api.deleteEntries({ paths, permanent: true });
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
    if (blocked()) return;
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
    if(paneHost())options.unshift({...action('分屏布局','layoutColumns',()=>paneHost().openLayout(window)),id:'pane-layout'});
    if (isList()) options.unshift(action('显示方式','grid',viewMenu), action('排序','sort',sortMenu), ...((state.route.screen==='library'&&!state.route.folder&&state.route.category!=='recent')?[]:[action('全选','copy',()=>{ state.selected = new Set(currentEntries().map(e=>e.path)); paintSelection(); })]));
    if (state.route.screen === 'folder') options.unshift(action('分析当前文件夹','chart',()=>go({screen:'tool',tool:'usage',path:state.route.path})),action(state.favorites.some(e=>e.path===state.route.path)?'取消收藏此文件夹':'收藏此文件夹','star',()=>favorite({path:state.route.path,name:state.route.label||fmt.baseName(state.route.path),isDir:true})));
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
    setSettingsSection(state.route.section||settingsSection);
    const [permissions,status,info] = await Promise.all([api.permissionStatus(),api.indexStatus(),api.appInfo()]);
    state.permissions = permissions; state.index = status;
    $('permissions').textContent = permissions.manageExternalStorage ? '已获得所有文件访问权限' : '尚未获得所有文件访问权限';
    $('index-status').textContent = status.indexing ? '正在建立索引：已扫描 ' + fmt.count(status.scannedDirs) + ' 个文件夹' : '已索引 ' + fmt.count(status.entryCount) + ' 个名称' + (status.lastFinishedMs ? '\n更新于 ' + fmt.date(status.lastFinishedMs) : '');
    $('version').textContent = 'RHFiles Android ' + info.version;
    $('btn-theme').textContent = '主题：' + (document.documentElement.dataset.theme === 'dark' ? '深色' : '明亮');
    $('btn-hidden').textContent = '显示隐藏文件：' + (state.hidden ? '开' : '关');
    if(api.updatesAvailable())androidUpdates.onSettings().catch(error);
    if(api.syncAvailable())configSync.refresh().catch(error);
    if (status.indexing) pollIndex();
  }
  let settingsSection='display';
  function setSettingsSection(section){
    settingsSection=['display','index','storage','updates','sync','backup','about'].includes(section)?section:'display';
    if(state.route.tool==='settings')state.route.section=settingsSection;
    for(const panel of document.querySelectorAll('[data-settings-panel]'))panel.hidden=panel.dataset.settingsPanel!==settingsSection;
    for(const tab of document.querySelectorAll('[data-settings-section]')){const active=tab.dataset.settingsSection===settingsSection;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;tab.classList.toggle('active',active);}
    rememberNavigation();
  }
  async function rebuildIndex() {
    await api.indexStart({ roots: state.roots.filter(root=>!api.isVirtual(root.path)).map(root=>root.path) });
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
    $('server-status').textContent = server.running ? '共享位置：' + server.root + '\n' + ((server.urls || []).join('\n') || '未检测到局域网地址，请连接 Wi-Fi') + (server.password ? '\n用户名：rhfiles\n密码：'+server.password+'\n'+(server.readOnly?'只读':'允许上传新文件') : '') : '文件服务未启动';
    $('server-write').disabled=server.running;
    ui.serviceAction($('btn-server-toggle'),server.running?'停止文件服务':'启动文件服务',server.running);
  }
  async function refreshLogs() {
    const page = await api.logs({limit:200});
    $('log-view').textContent = page.entries.map(e=>fmt.date(e.atMs)+' ['+e.level+'] '+e.scope+': '+e.message).join('\n') || '暂无日志';
  }
  function back() {
    if(androidNearby.back())return true;
    if(ui.isSheetOpen()) { ui.closeSheet(); return true; }
    if(!$('drawer').hidden&&!document.body.classList.contains('wide-layout')) { closeDrawer(); return true; }
    if(state.selected.size) { clearSelection(); return true; }
    if(androidUsage.back())return true;
    if(state.route.screen==='folder') {
      const path=state.route.path, root=rootFor(path), boundary=state.route.boundary;
      if(boundary===path) {go({screen:'home'},{replace:true});return true;}
      const parent = api.isVirtual(path) ? folderParents.get(path) : root?.path===path ? null : fmt.parentOf(path);
      if(parent && parent!==path) {
        const index=state.stack.findLastIndex(route=>route.screen==='folder' && route.path===parent && route.boundary===boundary);
        const route=index>=0 ? state.stack[index] : folderRoute(parent);
        if(index>=0)state.stack.length=index;
        go(route,{replace:true});return true;
      }
      if(!api.isVirtual(path) || root?.path===path) {go({screen:'home'},{replace:true});return true;}
    }
    if(state.stack.length) { go(state.stack.pop(),{replace:true}); return true; }
    if(state.route.screen!=='home') { go({screen:'home'},{replace:true}); return true; }
    return false;
  }
  async function bootStorage() {
    showPlaceholder('正在读取存储位置…');
    const permissions = await api.permissionStatus(); state.permissions=permissions;
    if(!permissions.sharedStorageReadable && !api.featuresAvailable()) {
      const box=ui.el('div','blocked');
      box.append(ui.el('h2','','允许访问本机文件'),ui.el('p','','浏览和管理共享存储前，请在系统设置中允许 RHFiles 访问所有文件。其他应用的私有目录仍可能受到安卓限制。'),
        button('打开系统设置','open',()=>api.openAppSettings(),'primary'),button('重新检查','refresh',bootStorage,'text-btn'));
      $('placeholder').replaceChildren(box); renderShell(); return;
    }
    state.roots=await api.storageRoots();
    if(state.roots.length) state.root=state.roots.find(r=>!r.removable)?.path || state.roots[0].path;
    try { state.index=await api.indexStatus(); } catch {}
    await go({screen:'home'},{replace:true});
    if (api.featuresAvailable()) {
      if(workbench.primary())androidFeatures.receiveShares().catch(error);
      if (workbench.primary()&&permissions.manageExternalStorage && !state.index?.indexing && (!state.index?.lastFinishedMs || Date.now()-state.index.lastFinishedMs>3600000)) rebuildIndex().catch(error);
    }
  }
  async function boot() {
    await api.initNative();
    await configBackup.boot();
    await configSync.boot();
    if(await workbench.boot())return;
    configBackup.init(error);
    configSync.init({error,go});
    androidFeatures.init({state,go,task,setClipboard,refresh:refreshCurrent,refreshLocations,removeFavoritePrefix,button,action,error,favorite});
    androidUsage.init({state,go,button,action,error,pathLabel});
    androidUpdates.init({go,error});
    window.rhfilesHandleBack = () => state.permissions ? back() : true;
    window.rhfilesPane={snapshot:()=>({route:{...state.route},busy:state.busy}),refresh:()=>refreshCurrent().catch(error)};
    window.addEventListener('rhfiles-panes-changed',renderShell);
    window.addEventListener('rhfiles-clipboard',event=>{state.clipboard=event.detail;renderList();renderShell();});
    window.addEventListener('rhfiles-pane-task',event=>{peerTask=event.detail;renderShell();});
    window.addEventListener('rhfiles-files-changed',()=>{if(!document.hidden)refreshCurrent().catch(error);});
    window.addEventListener('storage',event=>{
      if(event.key==='rhfiles.theme'){document.documentElement.dataset.theme=event.newValue==='dark'?'dark':'light';}
      if(event.key==='rhfiles.favorites'){try{state.favorites=JSON.parse(event.newValue||'[]');renderDrawer();if(state.route.screen==='home')renderHome();if(state.route.screen==='favorites')go(state.route,{replace:true}).catch(error);}catch{}}
      if(event.key==='rhfiles.hidden'){state.hidden=event.newValue==='1';if(isList())renderList();}
    });
    for(const node of document.querySelectorAll('[data-icon]')) node.innerHTML=ui.icon(node.dataset.icon);
    document.documentElement.dataset.theme=saved('rhfiles.theme','light')==='dark'?'dark':'light';
    api.systemTheme(document.documentElement.dataset.theme==='dark').catch(()=>{});
    ui.bindScrim();
    ui.bindDrawerSwipe({canOpen:()=>true,
      isOpen:()=>!$('drawer').hidden,prepare:renderDrawer});
    adaptive.init(renderDrawer);
    window.addEventListener('rhfiles-locations-changed',()=>refreshLocations().catch(error));
    for(const tab of document.querySelectorAll('[data-settings-section]')){tab.onclick=()=>setSettingsSection(tab.dataset.settingsSection);tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const tabs=[...tab.parentNode.children],delta=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1,next=tabs[(tabs.indexOf(tab)+delta+tabs.length)%tabs.length];next.click();next.focus();};}
    $('project-license').addEventListener('toggle',async()=>{
      const details=$('project-license');if(!details.open||details.dataset.loaded)return;
      try{const texts=await Promise.all(['NOTICE.txt','LICENSE.txt'].map(async name=>{const response=await fetch(name);if(!response.ok)throw Error('License unavailable');return response.text();}));$('project-notice-text').textContent=texts[0];$('project-license-text').textContent=texts[1];details.dataset.loaded='1';}
      catch{$('project-license-text').textContent='许可文件未能加载，请查看 RHFiles 源码仓库中的 LICENSE / NOTICE。';}
    });
    $('smb-rpc-license').addEventListener('toggle',async()=>{
      const details=$('smb-rpc-license');if(!details.open||details.dataset.loaded)return;
      try{const response=await fetch('SMBJ-RPC-LICENSE.txt');if(!response.ok)throw Error('License unavailable');$('smb-rpc-license-text').textContent=await response.text();details.dataset.loaded='1';}
      catch{$('smb-rpc-license-text').textContent='请查看源码包内 SMBJ-RPC-LICENSE.txt。';}
    });
    ui.bindFileGestures($('filelist'),{find:path=>state.entries.find(entry=>entry.path===path)||currentEntries().find(entry=>entry.path===path),select:startSelection,toggle:toggleSelection,activate:entry=>activate(entry).catch(error),hasSelection:()=>state.selected.size>0});
    $('scrim').addEventListener('click',closeDrawer);
    on('btn-menu',openDrawer); on('drawer-close',closeDrawer);
    on('nav-home',()=>{closeDrawer();return go({screen:'home'});});
    on('nav-settings',()=>{closeDrawer();return go({screen:'tool',tool:'settings'});});
    on('btn-home',()=>go({screen:'home'}));
    on('btn-up',back);
    on('btn-search',()=>go({screen:'search',path:state.route.screen==='folder'?state.route.path:state.root,global:state.route.screen!=='folder',boundary:state.route.boundary,boundaryLabel:state.route.boundaryLabel}));
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
      if(which==='more') selectionMenu();
    });
    on('copy-to-pane',()=>transferToPane('copy',[...state.selected]));on('move-to-pane',()=>transferToPane('cut',[...state.selected]));
    on('btn-paste',paste); on('btn-cancel-paste',()=>{state.clipboard=null;paneHost()?.clipboard(window,null);renderList();renderShell();});
    on('btn-reindex',rebuildIndex); on('btn-clear-index',async()=>{await api.indexClear();await refreshSettings();});
    on('btn-permission',()=>api.openAppSettings());
    on('btn-theme',async()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';cache('rhfiles.theme',document.documentElement.dataset.theme);await api.systemTheme(document.documentElement.dataset.theme==='dark');return refreshSettings();});
    on('btn-hidden',()=>{state.hidden=!state.hidden;cache('rhfiles.hidden',state.hidden?'1':'0');return refreshSettings();});
    on('btn-refresh-logs',refreshLogs); on('btn-copy-logs',async()=>{await refreshLogs();await ui.copyText($('log-view').textContent);ui.toast('日志已复制');});
    on('btn-clear-logs',async()=>{await api.clearLogs();await refreshLogs();});
    on('btn-server-toggle',async()=>{ if(state.server?.running) await api.serverStop(); else if(await ui.confirm('启动局域网文件服务？','持有密码的设备将能'+($('server-write').checked?'读取和上传新文件到 ':'读取 ')+pathLabel(state.root)+'。HTTP 不加密，仅在可信网络使用。','启动')) await api.serverStart({options:{root:state.root,readOnly:!$('server-write').checked}}); await refreshServer(); });
    if (!api.nativeBackAvailable()) {
      history.replaceState({rhfiles:true},'',location.href);
      history.pushState({rhfiles:true},'',location.href);
      window.addEventListener('popstate',()=>{
        if(back()) {history.pushState({rhfiles:true},'',location.href);return;}
        if(Date.now()-quitArmedAt<2000) return;
        quitArmedAt=Date.now(); ui.toast('再按一次返回键退出');history.pushState({rhfiles:true},'',location.href);
      });
    }
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();back();}});
    let width=0;
    new ResizeObserver(entries=>{const w=entries[0].contentRect.width;if(w!==width){width=w;renderList();}}).observe($('filelist'));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(api.featuresAvailable())androidFeatures.onResume().catch(error);else if(state.permissions && !state.permissions.manageExternalStorage)bootStorage().catch(error);}});
    if(!api.available()) {showPlaceholder('此版本无法连接文件服务，请重新安装。');return;}
    const resume=api.shouldRestoreNavigation()?savedNavigation():null;
    try {
      await bootStorage();
      if(resume){
        if(state.roots.some(root=>root.path===resume.root))state.root=resume.root;
        await go(resume.route,{replace:true});
        state.stack=Array.isArray(resume.stack)?resume.stack:[];
        state.clipboard=paneHost()?paneHost().currentClipboard(window):resume.clipboard;
        state.selected=new Set((resume.selected||[]).filter(path=>state.entries.some(entry=>entry.path===path)));
        if(isList()&&!$('filelist').hidden)renderList(resume.route.scroll||0);else renderShell();
      }
      if(paneHost())state.clipboard=paneHost().currentClipboard(window);
    } catch(err){showPlaceholder('启动失败：'+err,bootStorage);}
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
