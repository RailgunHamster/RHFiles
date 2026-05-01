// filelist.js — virtual list, layouts, sorting, rendering

function naturalCompare(a, b) {
  const ax = [], bx = [];
  a.replace(/(\d+)|(\D+)/g, (_, $1, $2) => { ax.push([$1 || Infinity, $2 || '']); });
  b.replace(/(\d+)|(\D+)/g, (_, $1, $2) => { bx.push([$1 || Infinity, $2 || '']); });
  while (ax.length && bx.length) {
    const an = ax.shift(), bn = bx.shift();
    const nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
    if (nn) return nn;
  }
  return ax.length - bx.length;
}

function sortEntriesList(entries, field, asc) {
  const dir = asc ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    if (field === "name") return dir * naturalCompare(a.name.toLowerCase(), b.name.toLowerCase());
    let va, vb;
    switch (field) {
      case "modified": va = a.modified; vb = b.modified; break;
      case "type": va = a.is_dir ? "0" : "1" + a.extension.toLowerCase(); vb = b.is_dir ? "0" : "1" + b.extension.toLowerCase(); break;
      case "size": va = a.size; vb = b.size; break;
      default: return dir * naturalCompare(a.name.toLowerCase(), b.name.toLowerCase());
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function updateSortArrows() {
  document.querySelectorAll(".col").forEach(col => {
    col.classList.toggle("sort-active", col.dataset.sort === G.sortField);
    const arrow = col.querySelector(".sort-arrow");
    if (arrow) arrow.textContent = col.dataset.sort === G.sortField ? (G.sortAsc ? "\u25b2" : "\u25bc") : "";
  });
}

function sortBy(field) {
  const tab = getTab();
  if (G.sortField === field) { G.sortAsc = !G.sortAsc; }
  else { G.sortField = field; G.sortAsc = true; }
  tab.sortF = G.sortField;
  tab.sortAsc = G.sortAsc;
  updateSortArrows();
  renderFiles(tab, "file-list", "status-count", "status-selection");
}

function toggleSort() {
  const tab = getTab();
  const fields = ["name", "modified", "type", "size"];
  const idx = fields.indexOf(G.sortField);
  G.sortField = fields[(idx + 1) % fields.length];
  G.sortAsc = true;
  tab.sortF = G.sortField;
  tab.sortAsc = G.sortAsc;
  updateSortArrows();
  renderFiles(tab, "file-list", "status-count", "status-selection");
}

function toggleHidden() {
  G.showHidden = !G.showHidden;
  document.getElementById("btn-hidden").classList.toggle("active-toggle", G.showHidden);
  navigateTo(getTab().path, false);
}

const ROW_H = 24;
const ICON_ROW_H = 80;
const CARD_ROW_H = 168;

function renderFiles(tabOrPane, listId, countId, selId, isRight) {
  const list = document.getElementById(listId);
  const entries = tabOrPane.entries || [];
  const sel = tabOrPane.sel || new Set();
  list.innerHTML = "";

  if (G.layout === "icons") {
    renderIconLayout(list, entries, sel, isRight, tabOrPane, listId);
  } else if (G.layout === "cards") {
    renderCardLayout(list, entries, sel, isRight, tabOrPane, listId);
  } else if (G.layout === "columns") {
    renderColumnLayout(list, entries, sel, isRight, tabOrPane.path || getTab().path);
  } else {
    renderDetailsLayout(list, entries, sel, isRight, tabOrPane, listId);
  }

  if (countId) updateStatus(tabOrPane, countId, selId);

  const currentEntries = entries;
  setTimeout(() => updateCloudStatus(list, currentEntries), 50);
}

function renderDetailsLayout(list, entries, sel, isRight, tabOrPane, listId) {
  const totalH = entries.length * ROW_H;
  const spacer = document.createElement("div");
  spacer.className = "virtual-list-spacer";
  spacer.style.height = totalH + "px";
  list.appendChild(spacer);

  const content = document.createElement("div");
  content.className = "virtual-list-content";
  list.appendChild(content);

  const rowH = ROW_H;
  const viewH = list.clientHeight || 600;
  const bufferRows = 10;

  function renderVisible() {
    const scrollTop = list.scrollTop;
    const start = Math.max(0, Math.floor(scrollTop / rowH) - bufferRows);
    const end = Math.min(entries.length, Math.ceil((scrollTop + viewH) / rowH) + bufferRows);
    content.innerHTML = "";
    content.style.top = (start * rowH) + "px";

    for (let i = start; i < end; i++) {
      const file = entries[i];
      const isSelected = sel.has(i);
      const isCut = G.clipboard && G.clipboard.op === "cut" && G.clipboard.paths.has(file.path);
      const row = document.createElement("div");
      row.className = "file-row" + (file.is_dir ? " dir" : "") + (isSelected ? " selected" : "") + (isCut ? " cut-item" : "");
      row.dataset.index = i;
      row.dataset.path = file.path;
      row.style.position = "relative";

      row.addEventListener("click", e => handleRowClick(e, i, sel, tabOrPane, isRight));
      row.addEventListener("contextmenu", e => {
        e.preventDefault();
        if (!sel.has(i)) { sel.clear(); sel.add(i); tabOrPane.lastIdx = i; renderFiles(tabOrPane, listId, null, null, isRight); }
        showContextMenu(e.clientX, e.clientY, isRight);
      });
      row.draggable = true;
      row.addEventListener("dragstart", e => {
        if (!sel.has(i)) { sel.clear(); sel.add(i); renderFiles(tabOrPane, listId, null, null, isRight); }
        e.dataTransfer.setData("text/plain", JSON.stringify([...sel].map(idx => entries[idx].path)));
      });

      let tagsHtml = "";
      const tags = G.tagCache[file.path];
      if (tags && tags.length) {
        tagsHtml = '<span class="row-tags">' + tags.map((tag, ti) => `<span class="row-tag-dot" style="background:${tagColor(ti)}"></span>`).join("") + '</span>';
      }

      let gitHtml = "";
      const gitStatus = G.gitCache[file.name];
      if (gitStatus) {
        const gitIcons = { modified: '\u25cf', added: '+', deleted: '\u2715', untracked: '?' };
        const gitClass = 'git-' + gitStatus;
        gitHtml = `<div class="row-git ${gitClass}" title="${gitStatus}">${gitIcons[gitStatus] || ''}</div>`;
      }

      row.innerHTML = `
        <div class="row-name">
          <span class="row-icon">${fileIcon(file)}</span>
          <span class="row-fname">${esc(file.name)}</span>${tagsHtml}
        </div>
        ${gitHtml ? gitHtml : '<div class="row-git"></div>'}
        <div class="row-date">${esc(file.modified)}</div>
        <div class="row-type">${esc(fileTypeLabel(file))}</div>
        <div class="row-size">${esc(file.size_display)}</div>
      `;
      content.appendChild(row);
    }
  }

  list.onscroll = renderVisible;
  renderVisible();
}

function renderIconLayout(list, entries, sel, isRight, tabOrPane, listId) {
  const grid = document.createElement("div");
  grid.style.display = "flex";
  grid.style.flexWrap = "wrap";
  grid.style.gap = "4px";
  grid.style.padding = "8px";
  list.appendChild(grid);

  entries.forEach((file, i) => {
    const isSelected = sel.has(i);
    const isCut = G.clipboard && G.clipboard.op === "cut" && G.clipboard.paths.has(file.path);
    const item = document.createElement("div");
    item.className = "file-row" + (file.is_dir ? " dir" : "") + (isSelected ? " selected" : "") + (isCut ? " cut-item" : "");
    item.style.cssText = "display:inline-flex;flex-direction:column;width:96px;height:80px;padding:6px 4px;text-align:center;border-radius:6px;vertical-align:top;align-items:center;justify-content:center;";
    item.dataset.index = i;
    item.dataset.path = file.path;

    item.addEventListener("click", e => handleRowClick(e, i, sel, tabOrPane, isRight));
    item.addEventListener("contextmenu", e => { e.preventDefault(); if (!sel.has(i)) { sel.clear(); sel.add(i); tabOrPane.lastIdx = i; renderFiles(tabOrPane, listId, null, null, isRight); } showContextMenu(e.clientX, e.clientY, isRight); });
    item.addEventListener("dragstart", e => {
      if (!sel.has(i)) { sel.clear(); sel.add(i); renderFiles(tabOrPane, listId, null, null, isRight); }
      e.dataTransfer.setData("text/plain", JSON.stringify([...sel].map(idx => entries[idx].path)));
    });
    item.draggable = true;

    item.innerHTML = `
      <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${bigFileIcon(file)}</div>
      <div style="font-size:11px;color:var(--text-2);text-align:center;word-break:break-all;max-height:2.4em;overflow:hidden;line-height:1.2;margin-top:2px;width:100%;">${esc(file.name)}</div>
    `;
    grid.appendChild(item);
  });
}

function renderCardLayout(list, entries, sel, isRight, tabOrPane, listId) {
  const grid = document.createElement("div");
  grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;padding:8px;";
  list.appendChild(grid);

  entries.forEach((file, i) => {
    const isSelected = sel.has(i);
    const isCut = G.clipboard && G.clipboard.op === "cut" && G.clipboard.paths.has(file.path);
    const item = document.createElement("div");
    item.className = "file-row" + (file.is_dir ? " dir" : "") + (isSelected ? " selected" : "") + (isCut ? " cut-item" : "");
    item.style.cssText = `display:inline-flex;flex-direction:column;width:${CARD_ROW_H}px;height:${CARD_ROW_H}px;padding:8px;border:1px solid var(--border);border-radius:8px;vertical-align:top;align-items:center;cursor:default;transition:border-color .15s,background .06s;`;
    item.dataset.index = i;
    item.dataset.path = file.path;
    if (isSelected) item.style.borderColor = "var(--accent)";
    if (isSelected) item.style.background = "var(--select-bg)";

    item.addEventListener("click", e => handleRowClick(e, i, sel, tabOrPane, isRight));
    item.addEventListener("contextmenu", e => { e.preventDefault(); if (!sel.has(i)) { sel.clear(); sel.add(i); tabOrPane.lastIdx = i; renderFiles(tabOrPane, listId, null, null, isRight); } showContextMenu(e.clientX, e.clientY, isRight); });
    item.addEventListener("mouseenter", () => { if (!sel.has(i)) item.style.borderColor = "var(--accent)"; });
    item.addEventListener("mouseleave", () => { if (!sel.has(i)) item.style.borderColor = "var(--border)"; });
    item.addEventListener("dragstart", e => {
      if (!sel.has(i)) { sel.clear(); sel.add(i); renderFiles(tabOrPane, listId, null, null, isRight); }
      e.dataTransfer.setData("text/plain", JSON.stringify([...sel].map(idx => entries[idx].path)));
    });
    item.draggable = true;

    item.innerHTML = `
      <div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${bigFileIcon(file)}</div>
      <div style="font-size:12px;color:var(--text-2);text-align:center;word-break:break-word;max-height:2.4em;overflow:hidden;line-height:1.2;margin-top:4px;width:100%;">${esc(file.name)}</div>
      <div style="font-size:10px;color:var(--text-4);text-align:center;margin-top:2px;">${esc(file.size_display || fileTypeLabel(file))}</div>
      <div style="font-size:10px;color:var(--text-4);text-align:center;">${esc(file.modified)}</div>
    `;
    grid.appendChild(item);
  });
}

function renderColumnLayout(list, entries, sel, isRight, currentPath) {
  const browser = document.createElement("div");
  browser.className = "column-browser";
  browser.style.flex = "1";
  browser.style.overflow = "auto";
  list.appendChild(browser);

  const parents = [];
  if (!isRight) {
    const root = currentPath.match(/^[A-Z]:\\/i);
    let p = currentPath;
    while (p && p.length > 3) {
      const idx = p.endsWith("\\") ? p.slice(0, -1).lastIndexOf("\\") : p.lastIndexOf("\\");
      if (idx > 0) p = p.substring(0, idx + 1);
      else break;
      parents.unshift(p);
    }
  }

  async function renderColumn(colIdx, colPath) {
    const col = document.createElement("div");
    col.className = "column-col";
    browser.appendChild(col);
    try {
      let colEntries = await call("list_dir", { path: colPath, filter: "" });
      if (!G.showHidden) colEntries = colEntries.filter(e => !e.is_hidden);
      colEntries.sort((a, b) => (b.is_dir - a.is_dir) || a.name.localeCompare(b.name));
      col.innerHTML = `<div style="padding:4px 12px;font-size:12px;font-weight:600;color:var(--text-3);border-bottom:1px solid var(--divider);">${esc(colPath.split('\\').filter(Boolean).pop() || colPath)}</div>`;
      colEntries.forEach(entry => {
        const item = document.createElement("div");
        item.className = "column-item";
        item.dataset.path = entry.path;
        item.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5h4.5L7.5 6h7v7h-13V4.5z" stroke="#dcb67a" stroke-width="1"/></svg>
          <span>${esc(entry.name)}</span>
          ${entry.is_dir ? '<span class="ci-arrow">\u203a</span>' : ''}`;
        item.addEventListener("click", () => {
          if (entry.is_dir) {
            if (isRight) rpNavigateTo(entry.path); else navigateTo(entry.path);
          } else {
            openFileHandler(entry.path);
          }
        });
        col.appendChild(item);
      });
    } catch (e) {
      col.innerHTML += `<div style="padding:8px;color:var(--text-4);">Error</div>`;
    }
  }

  parents.forEach((p, i) => renderColumn(i, p));
  renderColumn(parents.length, currentPath);
}

function handleRowClick(e, index, sel, tabOrPane, isRight) {
  G.lastActivePane = isRight ? 'right' : 'left';
  if (e.ctrlKey) {
    if (sel.has(index)) sel.delete(index);
    else sel.add(index);
    tabOrPane.lastIdx = index;
  } else if (e.shiftKey && tabOrPane.lastIdx >= 0) {
    const start = Math.min(tabOrPane.lastIdx, index);
    const end = Math.max(tabOrPane.lastIdx, index);
    sel.clear();
    for (let i = start; i <= end; i++) sel.add(i);
  } else {
    sel.clear();
    sel.add(index);
    tabOrPane.lastIdx = index;
  }
  if (isRight) renderFiles(tabOrPane, "right-file-list", "right-status-count", null, true);
  else renderFiles(tabOrPane, "file-list", "status-count", "status-selection");
  updatePreviewForSelection();
}

function updateStatus(tabOrPane, countId, selId) {
  const entries = tabOrPane.entries || [];
  const sel = tabOrPane.sel || new Set();
  const count = entries.length;
  let txt = count + " item" + (count !== 1 ? "s" : "");
  if (sel.size > 0) {
    const selected = [...sel].map(i => entries[i]).filter(Boolean);
    const dirs = selected.filter(f => f.is_dir).length;
    const files = selected.filter(f => !f.is_dir).length;
    const totalSize = selected.reduce((s, f) => s + (f.size||0), 0);
    let parts = [];
    if (dirs) parts.push(dirs + " folder" + (dirs > 1 ? "s" : ""));
    if (files) parts.push(files + " file" + (files > 1 ? "s" : ""));
    if (totalSize > 0) parts.push(fmtSize(totalSize));
    txt += " \u00b7 " + parts.join(", ");
  }
  document.getElementById(countId).textContent = txt;
  if (selId) document.getElementById(selId).textContent = "";
}

function getSelectedPaths(isRight) {
  const tabOrPane = isRight ? G.rp : getTab();
  const entries = tabOrPane.entries || [];
  const sel = tabOrPane.sel || new Set();
  return [...sel].map(i => entries[i]).filter(Boolean);
}

function selectAll(isRight) {
  const tabOrPane = isRight ? G.rp : getTab();
  const entries = tabOrPane.entries || [];
  const sel = tabOrPane.sel || new Set();
  sel.clear();
  entries.forEach((_, i) => sel.add(i));
  if (isRight) renderFiles(tabOrPane, "right-file-list", "right-status-count", null, true);
  else { renderFiles(tabOrPane, "file-list", "status-count", "status-selection"); updatePreviewForSelection(); }
}

async function updateCloudStatus(listEl, entries) {
  const cloudEntries = entries.filter(e =>
    e.path.toLowerCase().includes("onedrive") ||
    e.path.toLowerCase().includes("google drive")
  );
  for (const ent of cloudEntries.slice(0, 50)) {
    try {
      const status = await call("get_cloud_status", { path: ent.path });
      if (status && status !== "none") {
        const row = listEl.querySelector('[data-path="' + CSS.escape(ent.path) + '"]');
        if (row) {
          const nameEl = row.querySelector('.row-fname') || row.querySelector('.row-name');
          if (nameEl && !nameEl.querySelector('.cloud-icon')) {
            const icon = status === "synced" ? "\u2601" :
                         status === "online_only" ? "\u26C5" : "\u{1F504}";
            const span = document.createElement('span');
            span.className = 'cloud-icon';
            span.textContent = ' ' + icon;
            span.title = status;
            span.style.cssText = 'font-size:10px;margin-left:4px;opacity:0.7;';
            nameEl.appendChild(span);
          }
        }
      }
    } catch (e) {}
  }
}
