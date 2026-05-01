// selection.js - rectangle (rubber band) selection

function initBoxSelection(listEl) {
  let isSelecting = false;
  let selStartX = 0, selStartY = 0;
  let selectionRect = null;

  listEl.addEventListener('mousedown', e => {
    if (e.target.closest('.file-row') || e.button !== 0) return;
    isSelecting = true;
    selStartX = e.clientX;
    selStartY = e.clientY;
    const rect = listEl.getBoundingClientRect();
    selectionRect = document.createElement('div');
    selectionRect.className = 'selection-rect';
    selectionRect.style.left = (e.clientX - rect.left + listEl.scrollLeft) + 'px';
    selectionRect.style.top = (e.clientY - rect.top + listEl.scrollTop) + 'px';
    selectionRect.style.width = '0px';
    selectionRect.style.height = '0px';
    listEl.style.position = 'relative';
    listEl.appendChild(selectionRect);
  });

  document.addEventListener('mousemove', e => {
    if (!isSelecting || !selectionRect) return;
    const list = listEl;
    const rect = list.getBoundingClientRect();
    const x = Math.min(e.clientX, selStartX) - rect.left + list.scrollLeft;
    const y = Math.min(e.clientY, selStartY) - rect.top + list.scrollTop;
    const w = Math.abs(e.clientX - selStartX);
    const h = Math.abs(e.clientY - selStartY);
    selectionRect.style.left = x + 'px';
    selectionRect.style.top = y + 'px';
    selectionRect.style.width = w + 'px';
    selectionRect.style.height = h + 'px';
    selectFilesInRect(list, x, y, w, h, e.ctrlKey);
  });

  document.addEventListener('mouseup', () => {
    if (selectionRect) { selectionRect.remove(); selectionRect = null; }
    isSelecting = false;
  });
}

function selectFilesInRect(listEl, rx, ry, rw, rh, additive) {
  const isRight = listEl.id === 'right-file-list';
  const tabOrPane = isRight ? G.rp : getTab();
  const sel = tabOrPane.sel;
  const listRect = listEl.getBoundingClientRect();
  const scrollTop = listEl.scrollTop;

  if (!additive) sel.clear();

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
      if (!isNaN(idx)) sel.add(idx);
    }
  });

  if (isRight) renderFiles(tabOrPane, "right-file-list", "right-status-count", null, true);
  else renderFiles(tabOrPane, "file-list", "status-count", "status-selection");
}
