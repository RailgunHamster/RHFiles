/* Small DOM helpers plus the shared visual vocabulary: icons, bottom sheet,
 * toast. No framework: the whole point of this app is to stay small and fast. */

const ui = (() => {
  const ICONS = {
    home: '<path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    up: '<path d="m6 12 6-6 6 6M12 6v15"/>',
    search: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>',
    more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    layoutColumns:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
    layoutRows:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/>',
    layoutSingle:'<rect x="3" y="4" width="18" height="16" rx="2"/>',
    layoutAuto:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M12 12h9"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    play:'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
    stop:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9h6v6H9z"/>',
    new: '<path d="M12 4v16M4 12h16"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    sort: '<path d="M4 6h16M4 12h11M4 18h6"/>',
    refresh: '<path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"/>',
    storage: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 12h18M6.5 8h6M7 16h.01M17 16h.01"/><circle cx="17" cy="8" r="1"/>',
    network: '<rect x="8" y="2.5" width="8" height="6" rx="1.5"/><rect x="2" y="16" width="7" height="5.5" rx="1.5"/><rect x="15" y="16" width="7" height="5.5" rx="1.5"/><path d="M12 8.5V12M5.5 16v-4h13v4"/>',
    server: '<rect x="2.5" y="4" width="13" height="11" rx="2"/><path d="M9 15v4M5.5 19h7M18 9l3 3-3 3M12 12h9"/>',
    nearby: '<path d="M3 8h15l-3-3M21 16H6l3 3M3 4v8M21 12v8"/><circle cx="3" cy="16" r="1.5"/><circle cx="21" cy="8" r="1.5"/>',
    external: '<path d="M12 3v13m-3-10 3-3 3 3M7 10v3l5 3 5-3V9M5 8h4M15 7h4v4h-4z"/><circle cx="12" cy="19" r="2.5"/>',
    cloud:'<path d="M7 19a5 5 0 0 1-.8-9.9A6.5 6.5 0 0 1 18.7 8a5.5 5.5 0 0 1-.2 11z"/>',
    tasks:'<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m8 11 1.5 1.5L12 10M14 11h2M8 17h8"/>',
    apps:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/>',
    sd: '<path d="M8 2h10v20H4V6zM9 5v4M13 5v4M16 5v4"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3L2.8 9.7l6.4-.9z"/>',
    recent: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    computer: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4M7 21h10"/>',
    chart: '<path d="M12 3v9h9a9 9 0 1 1-9-9zM16 3a9 9 0 0 1 5 5h-5z"/>',
    settings: '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 3 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-3-3 1-2-2z"/><circle cx="12" cy="11" r="3"/>',
    folder: '<path d="M3 7.5A2 2 0 0 1 5 5.5h3.6a2 2 0 0 1 1.4.6l1 1a2 2 0 0 0 1.4.6H19a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17l4.5-4 3.5 3 3-2.5L20 17"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10.5 9.5l4.5 2.5-4.5 2.5z"/>',
    audio: '<path d="M9 18V7l10-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    archive: '<path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M3 4.5h18V8H3z"/><path d="M10.5 12h3"/>',
    apk: '<path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10M7.5 5l9 4"/><path d="M8 13v3M6.5 14.5h3"/>',
    document: '<path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 3.5V8h4"/>',
    code: '<path d="M9 7l-5 5 5 5"/><path d="M15 7l5 5-5 5"/>',
    other: '<path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-6A3.5 3.5 0 0 0 3 6.5v6A2.5 2.5 0 0 0 5.5 15"/>',
    cut: '<circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="M7.8 16.2L18 4M16.2 16.2L6 4"/>',
    rename: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14.5 5.5l4 4"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 8h.01"/>',
    open: '<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    share: '<path d="M12 3v11"/><path d="M8.5 6.5L12 3l3.5 3.5"/><path d="M5 13v6.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
    back:'<path d="m14 5-7 7 7 7M7 12h14"/>',
    previous:'<path d="m15 5-7 7 7 7"/>',next:'<path d="m9 5 7 7-7 7"/>',
    zoomIn:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
    zoomOut:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6"/>',
    fit:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
    rotate:'<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/>',
  };

  function icon(kind, extra) {
    const symbol=Object.hasOwn(ICONS,kind)?kind:'other';
    return `<svg viewBox="0 0 24 24" data-symbol="${symbol}" class="${extra || ''}" aria-hidden="true">${ICONS[symbol]}</svg>`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  let toastTimer = null;
  function toast(message, durationMs) {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.hidden = true;
    }, durationMs || 2400);
  }

  // ------------------------------------------------------------- bottom sheet

  const scrim = () => document.getElementById('scrim');
  const sheet = () => document.getElementById('sheet');
  const sheetPanel = () => document.getElementById('sheet-panel');

  let onDismiss = null;
  let closeGuard = null, cleanup = null;
  let previousFocus = null;
  function closeSheet() {
    if (closeGuard && !closeGuard()) return false;
    const finish = cleanup; cleanup = null; closeGuard = null;
    if (finish) finish();
    const dismiss = onDismiss;
    onDismiss = null;
    sheet().hidden = true;
    scrim().hidden = true;
    sheetPanel().innerHTML = '';
    sheetPanel().classList.remove('viewer','editor','image-viewer','chrome-hidden');
    if (dismiss) dismiss();
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    return true;
  }

  /**
   * @param {string} title
   * @param {Array<{label: string, id?: string, icon?: string, danger?: boolean, note?: string, onSelect?: Function}>} actions
   */
  function openSheet(title, actions, note) {
    if (!closeSheet()) return;
    previousFocus = document.activeElement;
    const panel = sheetPanel();
    panel.innerHTML = '';
    if (title) panel.appendChild(el('div', 'sheet-title', title));
    for (const action of actions) {
      const item = el('button', `sheet-item${action.danger ? ' danger' : ''}`);
      item.type = 'button';
      if(action.id)item.dataset.command=action.id;
      item.innerHTML = `${icon(action.icon || 'other')}<span></span>`;
      item.querySelector('span').textContent = action.label;
      RHFilesUI.listen(item,'click', () => {
        onDismiss = null;
        closeSheet();
        if (action.onSelect) Promise.resolve().then(action.onSelect).catch((error) => toast(`操作失败：${error}`));
      },undefined,"android.web.js.ui.openSheet.0bed9d47c1ee");
      panel.appendChild(item);
    }
    if (note) panel.appendChild(el('div', 'sheet-note', note));
    // app.js owns the WebView back sentinel; sheets must not accumulate history.
    sheet().hidden = false;
    scrim().hidden = false;
    panel.querySelector('button')?.focus({ preventScroll: true });
    return true;
  }

  /** True when a sheet is on screen. */
  function isSheetOpen() {
    const node = sheet();
    return node ? !node.hidden : false;
  }

  /**
   * A sheet with a text input, used for rename / new folder / new file.
   * Resolves with the entered string or null.
   */
  function prompt(title, initial, confirmLabel) {
    if (!closeSheet()) return Promise.resolve(null);
    return new Promise((resolve) => {
      onDismiss = () => resolve(null);
      const panel = sheetPanel();
      panel.innerHTML = '';
      panel.appendChild(el('div', 'sheet-title', title));

      const form = el('form', 'sheet-form');
      form.style.padding = '14px 20px';
      form.style.display = 'flex';
      form.style.flexDirection = 'column';
      form.style.gap = '12px';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = initial || '';
      input.style.height = '46px';
      input.style.padding = '0 14px';
      input.style.borderRadius = '12px';
      input.style.border = '1px solid var(--border)';
      input.style.background = 'var(--surface)';
      input.style.color = 'var(--text)';
      input.style.font = 'inherit';
      input.style.userSelect = 'text';

      const row = el('div');
      row.style.display = 'flex';
      row.style.gap = '10px';
      row.style.justifyContent = 'flex-end';

      const cancel = el('button', '', '取消');
      cancel.type = 'button';
      cancel.style.cssText = 'padding:12px 18px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text);font:inherit';
      RHFilesUI.listen(cancel,'click', () => finish(null),undefined,"android.web.js.ui.prompt.6c6d1843e1da");

      const confirm = el('button', '', confirmLabel || '确定');
      confirm.type = 'submit';
      confirm.style.cssText = 'padding:12px 18px;border-radius:10px;border:0;background:var(--accent);color:#fff;font:inherit';

      form.appendChild(input);
      row.appendChild(cancel);
      row.appendChild(confirm);
      form.appendChild(row);
      panel.appendChild(form);

      function finish(value) {
        onDismiss = null;
        closeSheet();
        resolve(value);
      }

      RHFilesUI.listen(form,'submit', (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) {
          input.focus();
          return;
        }
        finish(value);
      },undefined,"android.web.js.ui.prompt.0c1b1f65f1e4");

      sheet().hidden = false;
      scrim().hidden = false;
      setTimeout(() => {
        if (!input.isConnected) return;
        input.focus({preventScroll:true});
        const dot = input.value.lastIndexOf('.');
        if (dot > 0) input.setSelectionRange(0, dot);
        else input.select();
      }, 40);
    });
  }

  /** A yes/no sheet. Resolves true only when the destructive action is chosen. */
  function confirm(title, message, confirmLabel,options={}) {
    return new Promise((resolve) => {
      const opened = openSheet(
        title,
        [
          { label: confirmLabel || '确认', icon: options.icon||'trash', danger: options.danger!==false, onSelect: () => resolve(true) },
          { label: '取消', icon: 'close', onSelect: () => resolve(false) },
        ],
        message,
      );
      if (!opened) { resolve(false); return; }
      onDismiss = () => resolve(false);
    });
  }

  function bindScrim() {
    RHFilesUI.listen(scrim(),'click', closeSheet,undefined,"android.web.js.ui.bindScrim.e7cb7a58e144");
  }

  let setDrawerOpen=()=>{};
  function bindDrawerSwipe({canOpen, isOpen, prepare}) {
    const drawer=document.getElementById('drawer'),overlay=scrim();
    let gesture=null,progress=0,settleTimer,suppressClick=false;
    const width=()=>drawer.getBoundingClientRect().width || Math.min(innerWidth*.84,320);
    function position(value,dragging=false){
      progress=Math.max(0,Math.min(1,value));drawer.hidden=false;overlay.hidden=false;
      drawer.classList.toggle('dragging',dragging);overlay.classList.toggle('dragging',dragging);
      drawer.style.transform=`translateX(${(progress-1)*width()}px)`;overlay.style.opacity=String(progress);
    }
    setDrawerOpen=(opened)=>{
      clearTimeout(settleTimer);
      if(document.body.classList.contains('wide-layout')){prepare();drawer.hidden=false;drawer.setAttribute('aria-hidden','false');drawer.style.removeProperty('transform');overlay.hidden=!isSheetOpen();overlay.style.removeProperty('opacity');return;}
      if(opened && drawer.hidden){prepare();position(0,true);drawer.getBoundingClientRect();}
      if(!opened && drawer.hidden)return;
      drawer.setAttribute('aria-hidden',String(!opened));
      position(opened?1:0);
      settleTimer=setTimeout(()=>{
        if(!opened){drawer.hidden=true;overlay.hidden=!isSheetOpen();overlay.style.removeProperty('opacity');}
      },matchMedia('(prefers-reduced-motion: reduce)').matches?0:200);
    };
    RHFilesUI.listen(document,'touchstart', event => {
      gesture = null;
      suppressClick=false;
      if (event.touches.length !== 1 || isSheetOpen()) return;
      if(document.body.classList.contains('wide-layout'))return;
      const closing = isOpen();
      if (closing ? !event.target.closest('#drawer') && event.target!==overlay : !canOpen() || event.target.closest('input,textarea,select,[contenteditable=true],[role=tablist],[data-horizontal-scroll],[data-swipe-open]')) return;
      const touch = event.touches[0];
      const visual=closing?Math.max(0,Math.min(1,1+drawer.getBoundingClientRect().left/width())):0;
      gesture = {x:touch.clientX,y:touch.clientY,closing,horizontal:false,base:visual,lastX:touch.clientX,lastTime:performance.now(),velocity:0};
    }, {passive:true},"android.web.js.ui.bindDrawerSwipe.af8fde23db2f");
    RHFilesUI.listen(document,'touchmove', event => {
      if (!gesture) return;
      if (event.touches.length !== 1) {if(gesture.horizontal)setDrawerOpen(gesture.closing);gesture=null;return;}
      const touch = event.touches[0], dx = touch.clientX-gesture.x, dy = touch.clientY-gesture.y;
      if (!gesture.horizontal && Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { gesture = null; return; }
      if(!gesture.horizontal && Math.abs(dx)>8 && Math.abs(dx)>Math.abs(dy)*1.5 && (gesture.closing?dx<0:dx>0)){
        gesture.horizontal=true;clearTimeout(settleTimer);if(!gesture.closing)prepare();
      }
      if(gesture.horizontal){
        if(event.cancelable)event.preventDefault();
        const now=performance.now(),elapsed=now-gesture.lastTime;
        if(elapsed>0)gesture.velocity=(touch.clientX-gesture.lastX)/elapsed;
        gesture.lastTime=now;gesture.lastX=touch.clientX;
        position(gesture.base+dx/width(),true);
      }
    }, {passive:false},"android.web.js.ui.bindDrawerSwipe.39c7e8050137");
    RHFilesUI.listen(document,'touchend', event => {
      const current = gesture; gesture = null;
      if (!current?.horizontal || event.changedTouches.length !== 1) return;
      const dx = event.changedTouches[0].clientX-current.x;
      if (event.cancelable) event.preventDefault();
      suppressClick=true;
      const fast=performance.now()-current.lastTime<120 && Math.abs(current.velocity)>.45 && Math.abs(dx)>20;
      setDrawerOpen(fast?current.velocity>0:current.closing?progress>.8:progress>=.2);
    }, {passive:false},"android.web.js.ui.bindDrawerSwipe.35d8499c54a0");
    RHFilesUI.listen(document,'touchcancel', () => {if(gesture?.horizontal)setDrawerOpen(gesture.closing);gesture=null;}, {passive:true},"android.web.js.ui.bindDrawerSwipe.758cf78135a0");
    RHFilesUI.listen(document,'click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}},{capture:true},"android.web.js.ui.bindDrawerSwipe.bfe5feccd472");
    // A real mouse/trackpad click after a touch swipe is a new action, not the
    // touch gesture's compatibility click (important on tablets and in DeX).
    RHFilesUI.listen(document,'pointerdown',event=>{if(event.pointerType==='mouse')suppressClick=false;},{capture:true},"android.web.js.ui.bindDrawerSwipe.7fda541cbd6d");
  }

  // One delegated long-press owner. Virtualized rows can disappear during a
  // scroll; their detached timers must never turn scrolling into selection.
  function bindFileGestures(container,{find,select,toggle,activate,hasSelection}){
    let pointer=null,timer,blockClick=false,lastScroll=-Infinity,opened=null;
    const cancel=()=>{clearTimeout(timer);timer=null;};
    const rowFor=target=>target.closest('[data-path]');
    function position(row,offset,dragging=false){
      const del=row.querySelector('.entry-delete');if(!del)return;
      row.style.setProperty('--swipe-offset',offset+'px');row.classList.toggle('swipe-dragging',dragging);
      del.hidden=offset===0;del.tabIndex=offset<0&&!dragging?0:-1;
      if(offset<0)row.dataset.swipeOpen='true';else delete row.dataset.swipeOpen;
    }
    function close(){if(opened)position(opened,0);opened=null;}
    const reset=()=>{cancel();if(pointer?.horizontal)position(pointer.row,0);pointer=null;close();};
    container.addEventListener('rhfiles-list-reset',reset);
    container.addEventListener('rhfiles-close-swipe',reset);
    RHFilesUI.listen(container,'pointerdown',event=>{
      if(pointer && event.pointerId!==pointer.id){reset();blockClick=true;return;}
      cancel();blockClick=false;pointer=null;
      if(event.button!==0 || event.target.closest('.entry-more,.entry-delete'))return;
      const row=rowFor(event.target);if(!row)return;
      const dismiss=!!opened&&opened!==row;if(dismiss)close();
      pointer={id:event.pointerId,x:event.clientX,y:event.clientY,row,path:row.dataset.path,moved:false,held:false,horizontal:false,base:opened===row?-72:0,dismiss};
      timer=setTimeout(()=>{
        const p=pointer;if(!p || p.moved || !p.row.isConnected || performance.now()-lastScroll<140)return;
        p.held=true;blockClick=true;close();const entry=find(p.path);if(entry)select(entry);navigator.vibrate?.(10);
      },500);
    },undefined,"android.web.js.ui.bindFileGestures.b4ead5f35a19");
    RHFilesUI.listen(container,'pointermove',event=>{
      const p=pointer;if(!p||p.id!==event.pointerId)return;
      const dx=event.clientX-p.x,dy=event.clientY-p.y;
      if(Math.hypot(dx,dy)>8){p.moved=true;blockClick=true;cancel();}
      if(!p.horizontal&&!p.vertical&&!p.held&&Math.abs(dy)>8&&Math.abs(dy)>=Math.abs(dx))p.vertical=true;
      if(!p.horizontal&&!p.vertical&&!p.held&&!hasSelection()&&p.row.querySelector('.entry-delete')&&Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.5&&(dx<0||p.base<0)){
        p.horizontal=true;close();opened=p.row;
        if(p.row.hasPointerCapture?.(event.pointerId)===false)try{p.row.setPointerCapture(event.pointerId);}catch{}
      }
      if(p.horizontal){event.preventDefault();position(p.row,Math.max(-72,Math.min(0,p.base+dx)),true);}
    },undefined,"android.web.js.ui.bindFileGestures.21fc5ccb042f");
    RHFilesUI.listen(container,'pointerup',event=>{
      const p=pointer;if(!p||p.id!==event.pointerId)return;cancel();
      if(p.horizontal){const offset=Math.max(-72,Math.min(0,p.base+event.clientX-p.x));if(offset<-24){opened=p.row;position(opened,-72);}else close();}
      if(p.moved||p.held||p.dismiss||p.base<0)blockClick=true;
      if(!p.moved&&p.base<0)close();pointer=null;
    },undefined,"android.web.js.ui.bindFileGestures.7c60b86e964f");
    RHFilesUI.listen(container,'pointercancel',()=>{reset();blockClick=true;},undefined,"android.web.js.ui.bindFileGestures.5d649e9868dc");
    container.addEventListener('scroll',()=>{lastScroll=performance.now();reset();blockClick=true;},{passive:true});
    RHFilesUI.listen(container,'click',event=>{
      if(event.target.closest('.entry-more,.entry-delete'))return;
      const row=rowFor(event.target);if(!row)return;
      if(blockClick){blockClick=false;event.preventDefault();return;}
      const entry=find(row.dataset.path);if(!entry)return;
      if(hasSelection())toggle(entry.path);else activate(entry);
    },undefined,"android.web.js.ui.bindFileGestures.1dd80fbc2ff6");
    RHFilesUI.listen(container,'contextmenu',event=>{
      event.preventDefault();cancel();const row=rowFor(event.target);if(!row)return;
      if(pointer?.moved || performance.now()-lastScroll<200 || blockClick)return;
      blockClick=true;close();const entry=find(row.dataset.path);if(entry)select(entry);
    },undefined,"android.web.js.ui.bindFileGestures.a2811b7fcae1");
    RHFilesUI.listen(container,'keydown',event=>{if(event.key==='Escape')close();},undefined,"android.web.js.ui.bindFileGestures.5301098200db");
    document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
    window.addEventListener('rhfiles-pan-scroll',()=>{reset();blockClick=true;});
    return reset;
  }

  /**
   * Copies text to the clipboard.
   *
   * On a secure context the async Clipboard API is available; the WebView on
   * older Android does not always expose it, so the hidden-textarea fallback is
   * kept rather than reporting a failure the user cannot act on.
   */
  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        /* fall through to the legacy path */
      }
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand && document.execCommand('copy');
    document.body.removeChild(area);
    if (!copied) throw new Error('the clipboard is unavailable');
    return true;
  }

  function serviceAction(node,label,running){node.replaceChildren();const mark=el('span','service-symbol');mark.innerHTML=icon(running?'stop':'play');node.append(mark,el('span','',label));node.dataset.running=String(running);node.setAttribute('aria-pressed',String(running));}
  function storageSymbol(root){
    if(root.network)return 'network';
    if(root.provider){
      if(/^content:\/\/com\.android\.(externalstorage|downloads|media)\.documents\//i.test(root.path))return /(?:tree|document)\/primary(?:%3a|:)/i.test(root.path)?'storage':'external';
      return 'cloud';
    }
    return root.removable?'sd':'storage';
  }
  return { icon, el, toast, openSheet, closeSheet, isSheetOpen, prompt, confirm, bindScrim, bindDrawerSwipe, bindFileGestures, serviceAction, storageSymbol, setDrawerOpen:opened=>setDrawerOpen(opened), copyText, ICONS,
    setCloseGuard: fn => { closeGuard = fn; }, onClosed: fn => { cleanup = fn; } };
})();
