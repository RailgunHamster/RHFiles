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
    new: '<path d="M12 4v16M4 12h16"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    sort: '<path d="M4 6h16M4 12h11M4 18h6"/>',
    refresh: '<path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"/>',
    storage: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M10 18h4"/>',
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
  };

  function icon(kind, extra) {
    const path = ICONS[kind] || ICONS.other;
    return `<svg viewBox="0 0 24 24" class="${extra || ''}" aria-hidden="true">${path}</svg>`;
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
  let previousFocus = null;
  function closeSheet() {
    const dismiss = onDismiss;
    onDismiss = null;
    sheet().hidden = true;
    scrim().hidden = true;
    sheetPanel().innerHTML = '';
    if (dismiss) dismiss();
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  }

  /**
   * @param {string} title
   * @param {Array<{label: string, icon?: string, danger?: boolean, note?: string, onSelect?: Function}>} actions
   */
  function openSheet(title, actions, note) {
    closeSheet();
    previousFocus = document.activeElement;
    const panel = sheetPanel();
    panel.innerHTML = '';
    if (title) panel.appendChild(el('div', 'sheet-title', title));
    for (const action of actions) {
      const item = el('button', `sheet-item${action.danger ? ' danger' : ''}`);
      item.type = 'button';
      item.innerHTML = `${icon(action.icon || 'other')}<span></span>`;
      item.querySelector('span').textContent = action.label;
      item.addEventListener('click', () => {
        onDismiss = null;
        closeSheet();
        if (action.onSelect) Promise.resolve().then(action.onSelect).catch((error) => toast(`操作失败：${error}`));
      });
      panel.appendChild(item);
    }
    if (note) panel.appendChild(el('div', 'sheet-note', note));
    // app.js owns the WebView back sentinel; sheets must not accumulate history.
    sheet().hidden = false;
    scrim().hidden = false;
    panel.querySelector('button')?.focus({ preventScroll: true });
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
    closeSheet();
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
      cancel.addEventListener('click', () => finish(null));

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

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) {
          input.focus();
          return;
        }
        finish(value);
      });

      sheet().hidden = false;
      scrim().hidden = false;
      setTimeout(() => {
        input.focus();
        const dot = input.value.lastIndexOf('.');
        if (dot > 0) input.setSelectionRange(0, dot);
        else input.select();
      }, 40);
    });
  }

  /** A yes/no sheet. Resolves true only when the destructive action is chosen. */
  function confirm(title, message, confirmLabel) {
    return new Promise((resolve) => {
      openSheet(
        title,
        [
          { label: confirmLabel || '确认', icon: 'trash', danger: true, onSelect: () => resolve(true) },
          { label: '取消', icon: 'close', onSelect: () => resolve(false) },
        ],
        message,
      );
      onDismiss = () => resolve(false);
    });
  }

  function bindScrim() {
    scrim().addEventListener('click', closeSheet);
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

  return { icon, el, toast, openSheet, closeSheet, isSheetOpen, prompt, confirm, bindScrim, copyText, ICONS };
})();
