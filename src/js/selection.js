// selection.js - rectangle (rubber band) selection

// Grabbing one of these starts a file drag; grabbing anywhere else inside a row
// (the date/type/size cells, the blank space right of a name, card padding)
// starts a rubber-band selection instead.
const BOX_SELECT_CONTENT_SELECTOR = [
  '.row-fname', '.row-icon', '.thumb-img-box', '.thumb-name', '.thumb-meta',
  '.tile-file-name', '.row-tags', '.row-path', '.system-icon-host',
  '.large-file-icon', '.big-icon-slot', '.card-icon-slot', 'input', 'button',
].join(', ');

function usesRubberBandTarget(target) {
  return !target.closest(BOX_SELECT_CONTENT_SELECTOR);
}

function initBoxSelection(listEl) {
  let isSelecting = false;
  let selStartX = 0, selStartY = 0;
  let selectionRect = null;
  // A finished rubber-band drag is followed by a click event on the same spot.
  // Swallow that one click so it cannot clear the selection that was just made.
  let suppressNextClick = false;

  const beginSelection = event => {
    isSelecting = true;
    suppressNextClick = false;
    selStartX = event.clientX;
    selStartY = event.clientY;
    const rect = listEl.getBoundingClientRect();
    selectionRect = document.createElement('div');
    selectionRect.className = 'selection-rect';
    const startX = Math.min(Math.max(event.clientX, rect.left), rect.right) - rect.left;
    const startY = event.clientY - rect.top;
    selectionRect.style.left = (startX + listEl.scrollLeft) + 'px';
    selectionRect.style.top = (startY + listEl.scrollTop) + 'px';
    selectionRect.style.width = '0px';
    selectionRect.style.height = '0px';
    listEl.style.position = 'relative';
    listEl.appendChild(selectionRect);
    selStartX = rect.left + startX;
    selStartY = event.clientY;
  };

  // Click on empty area: clear selection. Capture phase so the click that ends
  // a rubber-band drag can be stopped before it reaches the row handlers.
  listEl.addEventListener('click', e => {
    if (suppressNextClick) {
      suppressNextClick = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (e.target.closest('.file-row')) return;
    const isRight = listEl.id === 'right-file-list';
    const tabOrPane = isRight ? G.rp : getTab();
    if (!tabOrPane || !tabOrPane.entries) return;
    tabOrPane.sel.clear();
    tabOrPane.lastIdx = -1;
    const listId = isRight ? "right-file-list" : "file-list";
    const countId = isRight ? "right-status-count" : "status-count";
    const selId = isRight ? null : "status-selection";
    renderFiles(tabOrPane, listId, countId, selId, isRight);
    updatePreviewForSelection();
  }, true);

  listEl.addEventListener('mousedown', e => {
    if (e.button === 0 || e.button === 2) {
      G.lastActivePane = listEl.id === 'right-file-list' ? 'right' : 'left';
      if (typeof updatePaneFocusUI === 'function') updatePaneFocusUI();
      focusFilePane(listEl);
    }
    if (e.button !== 0) return;
    // A new gesture always clears the stale swallow flag: the click it targets
    // belongs to the previous drag and never arrived.
    suppressNextClick = false;
    const row = e.target.closest('.file-row');
    if (row && !usesRubberBandTarget(e.target)) return;
    beginSelection(e);
  });

  // The gutter is the always-available fallback for full grids and card
  // layouts where every row is packed with content.
  const gutter = document.querySelector(`.box-select-gutter[data-target="${listEl.id}"]`);
  if (gutter) {
    gutter.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      G.lastActivePane = listEl.id === 'right-file-list' ? 'right' : 'left';
      if (typeof updatePaneFocusUI === 'function') updatePaneFocusUI();
      focusFilePane(listEl);
      beginSelection(e);
    });
  }

  // A rubber-band drag must not be hijacked by the native file drag that the
  // row's draggable attribute would otherwise start.
  listEl.addEventListener('dragstart', e => {
    if (isSelecting) e.preventDefault();
  }, true);

  let _selRaf = 0;
  let _selE = null;
  document.addEventListener('mousemove', e => {
    if (!isSelecting || !selectionRect) return;
    _selE = e;
    if (!_selRaf) {
      _selRaf = requestAnimationFrame(() => {
        _selRaf = 0;
        if (!_selE || !selectionRect) return;
        const ev = _selE;
        const list = listEl;
        const rect = list.getBoundingClientRect();
        const x = Math.min(ev.clientX, selStartX) - rect.left + list.scrollLeft;
        const y = Math.min(ev.clientY, selStartY) - rect.top + list.scrollTop;
        const w = Math.abs(ev.clientX - selStartX);
        const h = Math.abs(ev.clientY - selStartY);
        selectionRect.style.left = x + 'px';
        selectionRect.style.top = y + 'px';
        selectionRect.style.width = w + 'px';
        selectionRect.style.height = h + 'px';
        selectFilesInRect(list, x, y, w, h, ev.ctrlKey);
      });
    }
  });

  document.addEventListener('mouseup', () => {
    if (selectionRect) {
      selectionRect.remove();
      selectionRect = null;
      suppressNextClick = true;
    }
    isSelecting = false;
  });
}

function selectFilesInRect(listEl, rx, ry, rw, rh, additive) {
  const isRight = listEl.id === 'right-file-list';
  const tabOrPane = isRight ? G.rp : getTab();
  const sel = tabOrPane.sel;
  const listRect = listEl.getBoundingClientRect();
  const scrollTop = listEl.scrollTop;

  // Deselect in place by toggling classes. Re-rendering the whole list here
  // (every animation frame) would destroy the live selection rect and jank the UI.
  if (!additive) {
    listEl.querySelectorAll('.file-row').forEach(row => {
      if (row.classList.contains('selected')) row.classList.remove('selected');
    });
    sel.clear();
  }

  const rows = listEl.querySelectorAll('.file-row');
  let added = false;
  rows.forEach(row => {
    const rowRect = row.getBoundingClientRect();
    const rowTop = rowRect.top - listRect.top + scrollTop;
    const rowLeft = rowRect.left - listRect.left;
    const rowW = rowRect.width;
    const rowH = rowRect.height;

    if (rx < rowLeft + rowW && rx + rw > rowLeft &&
        ry < rowTop + rowH && ry + rh > rowTop) {
      const idx = parseInt(row.dataset.index);
      if (!isNaN(idx)) {
        if (!sel.has(idx)) { sel.add(idx); added = true; }
        if (!row.classList.contains('selected')) row.classList.add('selected');
      }
    }
  });

  if (added) {
    tabOrPane.lastIdx = -1;
    sel.forEach(i => { if (i > tabOrPane.lastIdx) tabOrPane.lastIdx = i; });
    if (isRight) updateStatus(tabOrPane, "right-status-count", null);
    else updateStatus(tabOrPane, "status-count", "status-selection");
  }
}

function invertSelection(isRight) {
  if (typeof isRight !== 'boolean') isRight = G.dualOn && G.lastActivePane === 'right';
  const tabOrPane = isRight ? G.rp : getTab();
  if (!tabOrPane || !tabOrPane.entries) return;
  const newSel = new Set();
  for (let i = 0; i < tabOrPane.entries.length; i++) {
    if (!tabOrPane.sel.has(i)) newSel.add(i);
  }
  tabOrPane.sel = newSel;
  if (newSel.size > 0) tabOrPane.lastIdx = [...newSel].pop();
  else tabOrPane.lastIdx = -1;
  const listId = isRight ? "right-file-list" : "file-list";
  const countId = isRight ? "right-status-count" : "status-count";
  const selId = isRight ? null : "status-selection";
  renderFiles(tabOrPane, listId, countId, selId, isRight);
  updatePreviewForSelection();
}
