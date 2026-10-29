// selection.js - rectangle (rubber band) selection

// The name cell (icon + label) is the drag surface and advertises itself with a
// grip chip when selected. Cells to the right of it, empty row space, the grid
// gaps and the gutter all start a rubber-band selection.
const BOX_SELECT_CONTENT_SELECTOR = [
  '.row-name',
  '.thumb-img-box', '.thumb-name', '.thumb-meta',
  '.column-item',
  'input', 'button',
].join(', ');

function usesRubberBandTarget(target) {
  return !target.closest(BOX_SELECT_CONTENT_SELECTOR);
}

// Pointer travel (px) before a press becomes a marquee. Below it the gesture
// stays a plain click: selecting the row under the cursor, or clearing the
// selection when the empty background was pressed.
const BOX_SELECT_DRAG_THRESHOLD = 4;

function initBoxSelection(listEl) {
  let isSelecting = false;
  let dragActive = false;
  let anchorX = 0, anchorY = 0;
  let pressX = 0, pressY = 0;
  let selectionRect = null;
  let baseSelection = [];
  let selectionOwner, selectionPath, selectionEntries;
  // Only a real marquee swallows the click that follows it; a plain click must
  // still reach the row handler (select) or the empty-area handler (clear).
  let suppressNextClick = false;

  const beginSelection = event => {
    if (typeof resetTypeSearch === 'function') resetTypeSearch();
    const pane = listEl.id === 'right-file-list' ? G.rp : getTab();
    selectionOwner = pane;
    selectionPath = pane?.path;
    selectionEntries = pane?.entries;
    baseSelection = [...(pane?.sel || [])];
    isSelecting = true;
    dragActive = false;
    suppressNextClick = false;
    pressX = event.clientX;
    pressY = event.clientY;
    // The gutter sits beside the list, so clamp the anchor into its bounds.
    const rect = listEl.getBoundingClientRect();
    anchorX = Math.min(Math.max(event.clientX, rect.left), rect.right - 1);
    anchorY = event.clientY;
  };

  const activateMarquee = () => {
    if (dragActive) return;
    dragActive = true;
    const rect = listEl.getBoundingClientRect();
    selectionRect = document.createElement('div');
    selectionRect.className = 'selection-rect';
    selectionRect.style.left = (anchorX - rect.left + listEl.scrollLeft) + 'px';
    selectionRect.style.top = (anchorY - rect.top + listEl.scrollTop) + 'px';
    selectionRect.style.width = '0px';
    selectionRect.style.height = '0px';
    listEl.style.position = 'relative';
    listEl.appendChild(selectionRect);
  };

  // Click on empty area: clear selection. Capture phase so the click that ends
  // a marquee drag can be stopped before it reaches the row handlers.
  RHFilesUI.listen(listEl,'click', e => {
    if(e.target.closest('[data-recycle-controls],.recycle-columns,.recycle-more,.recycle-report'))return;
    if (suppressNextClick) {
      suppressNextClick = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (e.target.closest('.file-row, .column-item')) return;
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
  }, true,"src.js.selection.initBoxSelection.171b20ce488a");

  RHFilesUI.listen(listEl,'mousedown', e => {
    if (e.button === 0 || e.button === 2) {
      // Cancel pending type-search before mouseup/click: its asynchronous
      // completion must not replace the row while this gesture is in flight.
      if (typeof resetTypeSearch === 'function') resetTypeSearch();
      G.lastActivePane = listEl.id === 'right-file-list' ? 'right' : 'left';
      if (typeof updatePaneFocusUI === 'function') updatePaneFocusUI();
      focusFilePane(listEl);
    }
    if (e.button !== 0) return;
    if(e.target.closest('[data-recycle-controls],.recycle-columns,.recycle-more,.recycle-report'))return;
    // A new gesture always clears the stale swallow flag: the click it targets
    // belongs to the previous drag and never arrived.
    suppressNextClick = false;
    const row = e.target.closest('.file-row, .column-item');
    if (row && !usesRubberBandTarget(e.target)) return;
    beginSelection(e);
  },undefined,"src.js.selection.initBoxSelection.4c0cf9da0330");

  // The gutter is the always-available fallback for full grids and card
  // layouts where every row is packed with content.
  const gutter = document.querySelector(`.box-select-gutter[data-target="${listEl.id}"]`);
  if (gutter) {
    RHFilesUI.listen(gutter,'mousedown', e => {
      if (e.button !== 0) return;
      G.lastActivePane = listEl.id === 'right-file-list' ? 'right' : 'left';
      if (typeof updatePaneFocusUI === 'function') updatePaneFocusUI();
      focusFilePane(listEl);
      beginSelection(e);
    },undefined,"src.js.selection.initBoxSelection.e448d0abdbf6");
  }

  // A marquee drag must not be hijacked by the native file drag that the row's
  // draggable attribute would otherwise start.
  RHFilesUI.listen(listEl,'dragstart', e => {
    if (isSelecting) e.preventDefault();
  }, true,"src.js.selection.initBoxSelection.cdc44ac0af16");

  let _selRaf = 0;
  let _selE = null;
  const updateMarquee = ev => {
    if (!ev || !selectionRect) return;
    const pane = listEl.id === 'right-file-list' ? G.rp : getTab();
    if (pane !== selectionOwner || pane?.path !== selectionPath) return;
    if (pane.entries !== selectionEntries) {
      const paths = new Set(baseSelection.map(index => selectionEntries?.[index]?.path).filter(Boolean));
      baseSelection = pane.entries.flatMap((entry,index) => paths.has(entry.path) ? [index] : []);
      selectionEntries = pane.entries;
    }
    const rect = listEl.getBoundingClientRect();
    const x = Math.min(ev.clientX, anchorX) - rect.left + listEl.scrollLeft;
    const y = Math.min(ev.clientY, anchorY) - rect.top + listEl.scrollTop;
    const w = Math.abs(ev.clientX - anchorX);
    const h = Math.abs(ev.clientY - anchorY);
    selectionRect.style.left = x + 'px';
    selectionRect.style.top = y + 'px';
    selectionRect.style.width = w + 'px';
    selectionRect.style.height = h + 'px';
    selectFilesInRect(listEl, x, y, w, h, ev.ctrlKey || (IS_MAC && ev.metaKey), baseSelection);
  };
  RHFilesUI.listen(document,'mousemove', e => {
    if (!isSelecting) return;
    if (!dragActive) {
      const travelled = Math.hypot(e.clientX - pressX, e.clientY - pressY);
      if (travelled < BOX_SELECT_DRAG_THRESHOLD) return;
      activateMarquee();
    }
    if (!selectionRect) return;
    _selE = e;
    if (!_selRaf) {
      _selRaf = requestAnimationFrame(() => {
        _selRaf = 0;
        updateMarquee(_selE);
      });
    }
  },undefined,"src.js.selection.initBoxSelection.304836c6cac7");

  RHFilesUI.listen(document,'mouseup', event => {
    const finishedMarquee = dragActive;
    // Mouseup can arrive before the queued animation frame. Commit its final
    // rectangle before removing the overlay, so an immediate shortcut sees
    // every row under the released rectangle, not last frame's partial set.
    if (finishedMarquee) updateMarquee(event);
    if (_selRaf) cancelAnimationFrame(_selRaf);
    _selRaf = 0;
    _selE = null;
    if (selectionRect) {
      selectionRect.remove();
      selectionRect = null;
    }
    suppressNextClick = finishedMarquee;
    isSelecting = false;
    dragActive = false;
    if(finishedMarquee){
      const pane=listEl.id==='right-file-list'?G.rp:getTab();
      if(typeof isRecyclePath==='function'&&isRecyclePath(pane?.path))recyclePaint(pane);
    }
  },undefined,"src.js.selection.initBoxSelection.32589474d3e3");
}

function selectFilesInRect(listEl, rx, ry, rw, rh, additive, baseSelection = []) {
  const isRight = listEl.id === 'right-file-list';
  const tabOrPane = isRight ? G.rp : getTab();
  const sel = tabOrPane.sel;
  delete tabOrPane._columnSelection;
  const listRect = listEl.getBoundingClientRect();
  const scrollTop = listEl.scrollTop;

  // Deselect in place by toggling classes. Re-rendering the whole list here
  // (every animation frame) would destroy the live selection rect and jank the UI.
  sel.clear();
  if (additive) for (const index of baseSelection) sel.add(index);

  const rows = listEl.querySelectorAll('.file-row');
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
        sel.add(idx);
      }
    }
  });

  rows.forEach(row => row.classList.toggle('selected', sel.has(Number(row.dataset.index))));
  tabOrPane.lastIdx = -1;
  sel.forEach(i => { if (i > tabOrPane.lastIdx) tabOrPane.lastIdx = i; });
  if (isRight) updateStatus(tabOrPane, "right-status-count", null);
  else updateStatus(tabOrPane, "status-count", "status-selection");
}

function invertSelection(isRight) {
  if (typeof resetTypeSearch === 'function') resetTypeSearch();
  if (typeof isRight !== 'boolean') isRight = G.dualOn && G.lastActivePane === 'right';
  const tabOrPane = isRight ? G.rp : getTab();
  if (!tabOrPane || !tabOrPane.entries) return;
  const target = activeColumnSelection(tabOrPane)?.state || tabOrPane;
  const newSel = new Set();
  for (let i = 0; i < target.entries.length; i++) {
    if (!target.sel.has(i)) newSel.add(i);
  }
  target.sel = newSel;
  if (newSel.size > 0) target.lastIdx = [...newSel].pop();
  else target.lastIdx = -1;
  if (target !== tabOrPane) { paintColumnSelection(tabOrPane, isRight); updatePreviewForSelection(); return; }
  const listId = isRight ? "right-file-list" : "file-list";
  const countId = isRight ? "right-status-count" : "status-count";
  const selId = isRight ? null : "status-selection";
  renderFiles(tabOrPane, listId, countId, selId, isRight);
  updatePreviewForSelection();
}
