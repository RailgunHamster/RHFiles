// pane.js — preview pane + dual pane

function convertFileSrc(filePath) {
  const converter = window.__TAURI_INTERNALS__?.convertFileSrc || window.__TAURI__?.core?.convertFileSrc;
  if (converter) {
    try { return converter(filePath); } catch (e) {}
  }
  if (window.__TAURI_INTERNALS__) {
    const path = filePath.replace(/\\/g, '/');
    return 'https://asset.localhost/' + encodeURIComponent(path).replace(/%3A/g, ':').replace(/%2F/g, '/');
  }
  return filePath;
}

// --- preview pane ---
let _previewRequestToken = 0;
let _previewedFile = null;
const TEXT_PREVIEW_MAX_CHARS = 40000;
const TEXT_PREVIEW_MAX_LINES = 1200;
const IMAGE_PREVIEW_MODES = new Set(['contain', 'cover', 'width', 'actual']);

function truncatePreviewText(value) {
  const source = String(value == null ? '' : value);
  let end = Math.min(source.length, TEXT_PREVIEW_MAX_CHARS);
  let lines = 1;
  for (let i = 0; i < end; i++) {
    if (source.charCodeAt(i) === 10 && ++lines > TEXT_PREVIEW_MAX_LINES) {
      end = i;
      break;
    }
  }
  return { text: source.slice(0, end), truncated: end < source.length, totalChars: source.length };
}

function renderImagePreview(imageData, fileName, sourceIsUrl) {
  const savedMode = IMAGE_PREVIEW_MODES.has(G.settings.imagePreviewMode) ? G.settings.imagePreviewMode : 'contain';
  const modes = ['contain', 'cover', 'width', 'actual'];
  const buttons = modes.map(mode =>
    `<button class="preview-image-mode${mode === savedMode ? ' active' : ''}" data-image-mode="${mode}" onclick="setImagePreviewMode('${mode}')">${esc(t('preview.image.' + mode))}</button>`
  ).join('');
  const source = sourceIsUrl ? imageData : 'data:image/png;base64,' + imageData;
  return `<div class="preview-image-shell">
    <div class="preview-image-toolbar" role="group" aria-label="${esc(t('preview.image.displayMode'))}">${buttons}</div>
    <div class="preview-image-stage mode-${savedMode}"><img src="${esc(source)}" alt="${esc(fileName)}" decoding="async"></div>
  </div>`;
}

function setImagePreviewMode(mode) {
  if (!IMAGE_PREVIEW_MODES.has(mode)) return;
  G.settings.imagePreviewMode = mode;
  saveSettings();
  const stage = document.querySelector('#preview-content .preview-image-stage');
  if (stage) stage.className = 'preview-image-stage mode-' + mode;
  document.querySelectorAll('#preview-content .preview-image-mode').forEach(button => {
    button.classList.toggle('active', button.dataset.imageMode === mode);
  });
}

function setPreviewPaneVisible(visible, persist) {
  G.previewOn = !!visible;
  const pane = document.getElementById("preview-pane");
  const divider = document.getElementById("preview-divider");
  const btn = document.getElementById("btn-preview");
  if (G.previewOn) {
    pane.style.display = "flex";
    divider.style.display = "block";
    const savedWidth = parseInt(localStorage.getItem('rhfiles-preview-width') || '300', 10);
    pane.style.width = Math.max(200, Math.min(savedWidth || 300, 500)) + 'px';
    btn.style.background = "var(--accent-light)";
    btn.style.color = "var(--accent)";
  } else {
    togglePreviewFullscreen(false);
    _previewRequestToken++;
    _previewedFile = null;
    pane.style.display = "none";
    divider.style.display = "none";
    btn.style.background = "";
    btn.style.color = "";
    setPreviewHeader(null);
    const content = document.getElementById("preview-content");
    if (content) content.innerHTML = `<div class="preview-empty">${t('preview.selectFile')}</div>`;
  }
  if (persist !== false && G.settings) {
    G.settings.previewDefaultOpen = G.previewOn;
    saveSettings();
  }
  if (G.previewOn) updatePreviewForSelection();
}

function restorePreviewPane() {
  setPreviewPaneVisible(G.previewOn, false);
}

function togglePreviewPane() {
  setPreviewPaneVisible(!G.previewOn);
}

function togglePreviewFullscreen(force) {
  const pane = document.getElementById('preview-pane');
  if (!pane) return;
  const shouldOpen = typeof force === 'boolean'
    ? force
    : !document.body.classList.contains('preview-fullscreen-active');
  if (shouldOpen && !G.previewOn) setPreviewPaneVisible(true);
  document.body.classList.toggle('preview-fullscreen-active', shouldOpen);
  pane.classList.toggle('fullscreen-preview', shouldOpen);
  const button = document.getElementById('preview-fullscreen');
  if (button) {
    const label = t(shouldOpen ? 'preview.exitFullscreen' : 'preview.fullscreen');
    button.title = label;
    button.setAttribute('aria-label', label);
    button.classList.toggle('active', shouldOpen);
  }
}

function setPreviewDefaultOpen(enabled) {
  setPreviewPaneVisible(!!enabled);
}

function previewSelected(isRight) {
  if (typeof isRight === 'boolean') G.lastActivePane = isRight ? 'right' : 'left';
  if (!G.previewOn) setPreviewPaneVisible(true);
  else updatePreviewForSelection();
}

function toggleQuickPreview(isRight) {
  if (G.previewOn) setPreviewPaneVisible(false);
  else previewSelected(isRight);
}

function setPreviewHeader(file) {
  _previewedFile = file || null;
  const name = document.getElementById('preview-file-name');
  const open = document.getElementById('preview-open');
  if (name) {
    name.textContent = file ? file.name : '';
    name.title = file ? file.path : '';
  }
  if (open) {
    open.style.display = file ? 'flex' : 'none';
    open.title = file ? t('preview.open') : t('ctx.open');
    open.setAttribute('aria-label', open.title);
  }
}

function openPreviewedFile() {
  const file = _previewedFile;
  if (!file) return;
  if (file.is_dir) {
    if (G.lastActivePane === 'right') rpNavigateTo(file.path);
    else navigateTo(file.path);
  } else {
    openFileHandler(file.path);
  }
}

function previewRequestIsCurrent(token, path, isRight) {
  if (token !== _previewRequestToken || !G.previewOn) return false;
  const selected = getSelectedPaths(isRight);
  return selected.length === 1 && selected[0].path === path;
}

async function updatePreviewForSelection() {
  if (!G.previewOn) return;
  const isRight = G.lastActivePane === 'right';
  const sel = getSelectedPaths(isRight);
  if (sel.length !== 1) {
    _previewRequestToken++;
    setPreviewHeader(null);
    document.getElementById("preview-content").innerHTML = `<div class="preview-empty">${t('preview.selectFile')}</div>`;
    return;
  }
  const file = sel[0];
  const requestToken = ++_previewRequestToken;
  setPreviewHeader(file);
  document.getElementById("preview-content").innerHTML = `<div class="preview-empty preview-loading">${t('preview.loading')}</div>`;
  const ext = (file.extension || "").toLowerCase();
  if (file.is_dir) {
    try {
      const dirEntries = await call("list_dir", { path: file.path, filter: "" });
      if (!previewRequestIsCurrent(requestToken, file.path, isRight)) return;
      const preview = dirEntries.slice(0, 20);
      document.getElementById("preview-content").innerHTML =
        '<div style="text-align:center;padding:12px;">' +
        '<div style="font-size:36px;">' + bigFileIcon(file) + '</div>' +
        '<div style="font-size:14px;color:var(--text-2);margin:4px 0;">' + esc(file.name) + '</div>' +
        '<div style="font-size:11px;color:var(--text-4);margin-bottom:8px;">' + t('group.items', {count: dirEntries.length}) + '</div>' +
        '<div style="text-align:left;font-size:11px;color:var(--text-3);">' +
        preview.map(e => '<div style="padding:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
          (e.is_dir ? '&#128193; ' : '&#128196; ') + esc(e.name) + '</div>').join("") +
        (dirEntries.length > 20 ? '<div style="color:var(--text-4);">' + t('nav.moreTabs', {count: dirEntries.length - 20}) + '</div>' : '') +
        '</div></div>';
    } catch (e) {
      if (!previewRequestIsCurrent(requestToken, file.path, isRight)) return;
      document.getElementById("preview-content").innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-3);">
        <div style="font-size:48px;">${bigFileIcon(file)}</div>
        <div style="margin-top:8px;font-size:14px;color:var(--text-2);">${esc(file.name)}</div>
      </div>`;
    }
    return;
  }
  if (ext === "lnk") {
    try {
      const scData = await call("read_shortcut", { path: file.path });
      if (!previewRequestIsCurrent(requestToken, file.path, isRight)) return;
      document.getElementById("preview-content").innerHTML =
        '<div style="padding:16px;">' +
        '<div style="font-size:36px;text-align:center;">' + bigFileIcon(file) + '</div>' +
        '<div style="text-align:center;font-size:14px;color:var(--text-2);margin:4px 0;">' + esc(file.name) + '</div>' +
        '<div style="margin-top:12px;font-size:11px;">' +
        '<div class="props-row"><span class="props-label">' + t('preview.target') + '</span><span class="props-value">' + esc(scData && scData.target ? scData.target : t('properties.unknown')) + '</span></div>' +
        '<div class="props-row"><span class="props-label">' + t('preview.args') + '</span><span class="props-value">' + esc(scData && scData.args ? scData.args : "") + '</span></div>' +
        '<div class="props-row"><span class="props-label">' + t('preview.workDir') + '</span><span class="props-value">' + esc(scData && scData.work_dir ? scData.work_dir : "") + '</span></div>' +
        '</div></div>';
    } catch (e) {
      if (!previewRequestIsCurrent(requestToken, file.path, isRight)) return;
      document.getElementById("preview-content").innerHTML = `<div class="preview-empty">${t('preview.noPreview')}</div>`;
    }
    return;
  }
  let is_pdf = ext === "pdf";
  let is_image = ['png','jpg','jpeg','gif','bmp','webp','ico','tiff','tif','avif'].includes(ext);
  let is_audio = ['mp3','wav','flac','ogg','aac','wma','m4a'].includes(ext);
  let is_video = ['mp4','mkv','avi','webm','mov','wmv','m4v'].includes(ext);
  if (is_image) {
    document.getElementById("preview-content").innerHTML = renderImagePreview(convertFileSrc(file.path), file.name, true);
    return;
  }
  if (is_pdf) {
    const src = convertFileSrc(file.path);
    const previewContent = document.getElementById("preview-content");
    const openBtn = document.createElement("button");
    openBtn.className = "dialog-btn";
    openBtn.style.marginTop = "8px";
    openBtn.textContent = t('btn.openPdf');
    openBtn.addEventListener("click", () => call('open_file', { path: file.path }));
    const container = document.createElement("div");
    container.style.cssText = "text-align:center;padding:12px;";
    container.innerHTML = `<div style="font-size:36px;color:#d32f2f">&#128196;</div>
      <div style="margin-top:4px;font-size:14px;color:var(--text-2)">${esc(file.name)}</div>
      <div style="margin-top:2px;color:var(--text-4)">${fmtSize(file.size)}</div>`;
    container.appendChild(openBtn);
    container.innerHTML += `<iframe src="${esc(src)}" style="width:100%;height:280px;border:1px solid var(--border);margin-top:8px;border-radius:4px;"></iframe>`;
    previewContent.innerHTML = "";
    previewContent.appendChild(container);
    return;
  }
  if (is_audio) {
    const src = convertFileSrc(file.path);
    document.getElementById("preview-content").innerHTML = `<div style="text-align:center;padding:20px;">
      <div style="font-size:48px">&#127925;</div>
      <div style="margin-top:8px;font-size:14px;color:var(--text-2)">${esc(file.name)}</div>
      <div style="margin-top:4px;color:var(--text-4)">${fmtSize(file.size)}</div>
      <audio controls style="width:100%;margin-top:12px" src="${esc(src)}"></audio>
    </div>`;
    return;
  }
  if (is_video) {
    const src = convertFileSrc(file.path);
    document.getElementById("preview-content").innerHTML = `<div style="text-align:center;padding:12px;">
      <video controls style="width:100%;max-height:300px" src="${esc(src)}"></video>
      <div style="margin-top:4px;font-size:12px;color:var(--text-3)">${esc(file.name)}</div>
    </div>`;
    return;
  }
  if (ext === "rtf") {
    try {
      const html = await call("rtf_to_html", { path: file.path });
      if (!previewRequestIsCurrent(requestToken, file.path, isRight)) return;
      document.getElementById("preview-content").innerHTML =
        '<div style="text-align:center;padding:8px;">' +
        '<div style="font-size:36px;color:#2b579a">&#128196;</div>' +
        '<div style="margin-top:4px;font-size:14px;color:var(--text-2)">' + esc(file.name) + '</div>' +
        '</div>' +
        '<div class="rtf-preview" style="padding:8px;font-size:12px;line-height:1.5;border-top:1px solid var(--border);">' + html + '</div>';
    } catch (e) {
      if (!previewRequestIsCurrent(requestToken, file.path, isRight)) return;
      document.getElementById("preview-content").innerHTML = `<div class="preview-empty">${t('alert.rtfPreviewFailed')}</div>`;
    }
    return;
  }
  if (ext === "docx") {
    try {
      const html = await call("docx_to_text", { path: file.path });
      if (!previewRequestIsCurrent(requestToken, file.path, isRight)) return;
      document.getElementById("preview-content").innerHTML =
        '<div style="text-align:center;padding:8px;">' +
        '<div style="font-size:36px;color:#2b579a">&#128196;</div>' +
        '<div style="margin-top:4px;font-size:14px;color:var(--text-2)">' + esc(file.name) + '</div>' +
        '</div>' +
        '<div class="docx-preview" style="padding:8px;font-size:12px;line-height:1.5;border-top:1px solid var(--border);">' + html + '</div>';
    } catch (e) {
      if (!previewRequestIsCurrent(requestToken, file.path, isRight)) return;
      document.getElementById("preview-content").innerHTML = `<div class="preview-empty">${t('alert.docxPreviewFailed')}</div>`;
    }
    return;
  }
  try {
    const preview = await call("read_file_preview", { path: file.path });
    if (!previewRequestIsCurrent(requestToken, file.path, isRight)) return;
    const content = document.getElementById("preview-content");
    if (preview.preview_type === "image" && preview.image_data) {
      content.innerHTML = renderImagePreview(preview.image_data, file.name);
    } else if (preview.preview_type === "text" && preview.text_content != null) {
      const extL = (file.extension || "").toLowerCase();
      content.innerHTML = renderTextPreview(preview.text_content, extL, file.name);
    } else {
      content.innerHTML = `<div class="preview-empty">
        <div style="font-size:48px;">${bigFileIcon(file)}</div>
        <div style="margin-top:8px;font-size:14px;color:var(--text-2);">${esc(file.name)}</div>
        <div style="margin-top:4px;color:var(--text-4);">${fmtSize(preview.size)}</div>
        <div style="margin-top:12px;color:var(--text-4);">${t('preview.binary')}</div>
      </div>`;
    }
  } catch (e) {
    if (!previewRequestIsCurrent(requestToken, file.path, isRight)) return;
    document.getElementById("preview-content").innerHTML = `<div class="preview-empty">${t('preview.noPreview')}</div>`;
  }
}

// --- dual pane ---
let _tabBarAnchor = null;
let _toolbarAnchor = null;
let _searchBoxAnchor = null;
let _previewAutoClosedForDual = false;

function arrangeDualPaneChrome(enabled) {
  const tabBar = document.getElementById('tab-bar');
  const toolbar = document.getElementById('main-toolbar');
  const commandBar = document.getElementById('command-bar');
  const paneLeft = document.getElementById('pane-left');
  if (!tabBar || !toolbar || !paneLeft) return;
  if (enabled) {
    if (!_tabBarAnchor) {
      _tabBarAnchor = document.createComment('rhfiles-tab-bar-home');
      tabBar.parentNode.insertBefore(_tabBarAnchor, tabBar);
    }
    if (!_toolbarAnchor) {
      _toolbarAnchor = document.createComment('rhfiles-toolbar-home');
      toolbar.parentNode.insertBefore(_toolbarAnchor, toolbar);
    }
    paneLeft.insertBefore(toolbar, paneLeft.firstChild);
    paneLeft.insertBefore(tabBar, toolbar);
    const searchBox = toolbar.querySelector('.search-box');
    if (searchBox && commandBar) {
      if (!_searchBoxAnchor) {
        _searchBoxAnchor = document.createComment('rhfiles-search-box-home');
        searchBox.parentNode.insertBefore(_searchBoxAnchor, searchBox);
      }
      commandBar.insertBefore(searchBox, commandBar.querySelector('.cmd-stretch'));
      searchBox.classList.add('dual-global-search');
    }
  } else {
    if (_tabBarAnchor?.parentNode) _tabBarAnchor.parentNode.insertBefore(tabBar, _tabBarAnchor.nextSibling);
    if (_toolbarAnchor?.parentNode) _toolbarAnchor.parentNode.insertBefore(toolbar, _toolbarAnchor.nextSibling);
    const searchBox = commandBar?.querySelector('.search-box');
    if (searchBox && _searchBoxAnchor?.parentNode) {
      _searchBoxAnchor.parentNode.insertBefore(searchBox, _searchBoxAnchor.nextSibling);
      searchBox.classList.remove('dual-global-search');
    }
  }
}

function setDualPaneOrientation(orientation) {
  G.settings.dualPaneOrientation = orientation === 'horizontal' ? 'horizontal' : 'vertical';
  saveSettings();
  const container = document.getElementById('pane-container');
  container?.classList.toggle('horizontal-panes', G.settings.dualPaneOrientation === 'horizontal');
  document.getElementById('pane-divider')?.classList.toggle('horizontal-divider', G.settings.dualPaneOrientation === 'horizontal');
  if (G.dualOn) restoreDualPaneSplit();
}

function restoreDualPaneSplit() {
  const rightPane = document.getElementById('pane-right');
  if (!rightPane) return;
  const ratio = Math.max(.25, Math.min(.75, Number(localStorage.getItem('rhfiles-dual-split') || .5)));
  if (G.settings.dualPaneOrientation === 'horizontal') {
    rightPane.style.width = '';
    rightPane.style.height = (ratio * 100) + '%';
    rightPane.style.flex = `0 0 ${ratio * 100}%`;
  } else {
    rightPane.style.height = '';
    rightPane.style.width = (ratio * 100) + '%';
    rightPane.style.flex = `0 0 ${ratio * 100}%`;
  }
}

function activatePane(side) {
  G.lastActivePane = G.dualOn && side === 'right' ? 'right' : 'left';
  updatePaneFocusUI();
  updateSearchScopeUI();
  updatePreviewForSelection();
}

function toggleDualPane(force) {
  G.dualOn = typeof force === 'boolean' ? force : !G.dualOn;
  const rightPane = document.getElementById("pane-right");
  const divider = document.getElementById("pane-divider");
  const btn = document.getElementById("btn-dual");
  if (G.dualOn) {
    if (!G.rpInitialized) {
      const initialRightPath = getTab()?.path === 'home://' ? (G.homeDirPath || 'C:\\') : (getTab()?.path || 'C:\\');
      G.rp.path = initialRightPath;
      G.rp.history = [initialRightPath];
      G.rp.histIdx = 0;
      G.rpInitialized = true;
    }
    document.body.classList.add('dual-pane-active');
    arrangeDualPaneChrome(true);
    rightPane.style.display = "flex";
    divider.style.display = "block";
    btn.style.background = "var(--accent-light)";
    btn.style.color = "var(--accent)";
    if (G.previewOn && window.innerWidth < 1100) {
      _previewAutoClosedForDual = true;
      setPreviewPaneVisible(false, false);
    }
    setDualPaneOrientation(G.settings.dualPaneOrientation);
    restoreDualPaneSplit();
    if (G.rp.history.length === 0) {
      G.rp.history = [G.rp.path];
      G.rp.histIdx = 0;
    }
    rpNavigateTo(G.rp.path, false);
  } else {
    arrangeDualPaneChrome(false);
    document.body.classList.remove('dual-pane-active');
    G.lastActivePane = 'left';
    rightPane.style.display = "none";
    divider.style.display = "none";
    btn.style.background = "";
    btn.style.color = "";
    if (_previewAutoClosedForDual && !G.previewOn) setPreviewPaneVisible(true, false);
    _previewAutoClosedForDual = false;
  }
  renderTabs();
  updatePaneFocusUI();
  renderFiles(getTab(), "file-list", "status-count", "status-selection");
}

function updatePaneFocusUI() {
  const rightActive = G.dualOn && G.lastActivePane === 'right';
  document.getElementById('pane-left')?.classList.toggle('active-pane', !rightActive);
  document.getElementById('pane-right')?.classList.toggle('active-pane', rightActive);
}

let _rpNavigationToken = 0;
async function rpNavigateTo(path, pushHistory) {
  const pane = G.rp;
  const navigationToken = ++_rpNavigationToken;
  if (pushHistory === undefined) pushHistory = true;
  path = normalizeWindowsPathInput(path);
  try {
    let entries = await listPathEntries(path, "");
    if (navigationToken !== _rpNavigationToken || pane !== G.rp) return false;
    if (!G.showHidden) entries = entries.filter(e => !e.is_hidden);
    entries = sortEntriesList(entries, pane.sortF, pane.sortAsc);
    pane.entries = entries;
    if (pushHistory && path !== pane.path) {
      pane.history = pane.history.slice(0, pane.histIdx + 1);
      pane.history.push(path);
      pane.histIdx = pane.history.length - 1;
    }
    pane.path = path;
    pane.sel.clear();
    pane.lastIdx = -1;
    document.getElementById("right-path-input").value = path;
    renderBreadcrumb(path, "right-breadcrumb", "right-bc-dropdown", "right-path-input", true);
    renderFiles(pane, "right-file-list", "right-status-count", null, true);
    renderRightTabs();
    saveTabState();
    if (typeof updateFavoriteButtons === 'function') updateFavoriteButtons();
    updateSidebarSelection();
    return true;
  } catch (e) {
    if (navigationToken !== _rpNavigationToken || pane !== G.rp) return false;
    document.getElementById("right-status-count").textContent = t('status.error', {error: e});
    return false;
  }
}

function paneGoBack(pane) {
  if (pane === "right" && G.rp.histIdx > 0) { G.rp.histIdx--; rpNavigateTo(G.rp.history[G.rp.histIdx], false); }
}
function paneGoForward(pane) {
  if (pane === "right" && G.rp.histIdx < G.rp.history.length - 1) { G.rp.histIdx++; rpNavigateTo(G.rp.history[G.rp.histIdx], false); }
}
function paneGoUp(pane) {
  if (pane === "right") {
    try { call("parent_path", { path: G.rp.path }).then(parent => { if (parent) rpNavigateTo(parent); }); } catch (e) {}
  }
}
function paneSortBy(pane, field) {
  if (pane === "right") {
    if (G.rp.sortF === field) G.rp.sortAsc = !G.rp.sortAsc;
    else { G.rp.sortF = field; G.rp.sortAsc = true; }
  }
  renderFiles(G.rp, "right-file-list", "right-status-count", null, true);
}

// --- resizable panes ---
document.addEventListener("mousedown", e => {
  if (e.target.id === "pane-divider") startResize(e, "pane-container", "pane-left", "pane-right");
  if (e.target.id === "preview-divider") startResize(e, "main-area", "pane-container", "preview-pane");
});

function startResize(e, containerId, leftId, rightId) {
  e.preventDefault();
  const container = document.getElementById(containerId);
  const rightEl = document.getElementById(rightId);
  const horizontal = containerId === 'pane-container' && G.settings.dualPaneOrientation === 'horizontal';
  const startPointer = horizontal ? e.clientY : e.clientX;
  const startRightSize = horizontal ? rightEl.getBoundingClientRect().height : rightEl.getBoundingClientRect().width;
  const containerSize = horizontal ? container.clientHeight : container.clientWidth;
  const onMove = (ev) => {
    const delta = (horizontal ? ev.clientY : ev.clientX) - startPointer;
    const minimum = horizontal ? 150 : 240;
    const newRightSize = Math.max(minimum, Math.min(startRightSize - delta, containerSize - minimum));
    rightEl.style.flex = '0 0 ' + newRightSize + 'px';
    if (horizontal) rightEl.style.height = newRightSize + 'px';
    else rightEl.style.width = newRightSize + 'px';
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    if (rightId === 'preview-pane') localStorage.setItem('rhfiles-preview-width', String(Math.round(rightEl.getBoundingClientRect().width)));
    if (rightId === 'pane-right') {
      const size = horizontal ? rightEl.getBoundingClientRect().height : rightEl.getBoundingClientRect().width;
      localStorage.setItem('rhfiles-dual-split', String(size / containerSize));
    }
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pane-left')?.addEventListener('pointerdown', () => activatePane('left'));
  document.getElementById('pane-right')?.addEventListener('pointerdown', () => activatePane('right'));
  document.getElementById('pane-divider')?.addEventListener('dblclick', () => {
    localStorage.setItem('rhfiles-dual-split', '.5');
    restoreDualPaneSplit();
  });
  document.getElementById('btn-dual')?.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
    showMenuAt(event.clientX, event.clientY, [
      {label:(G.settings.dualPaneOrientation === 'vertical' ? '\u2713 ' : '') + t('pane.vertical'), action:() => { setDualPaneOrientation('vertical'); if (!G.dualOn) toggleDualPane(true); }},
      {label:(G.settings.dualPaneOrientation === 'horizontal' ? '\u2713 ' : '') + t('pane.horizontal'), action:() => { setDualPaneOrientation('horizontal'); if (!G.dualOn) toggleDualPane(true); }},
      {label:'-'},
      {label:t('pane.resetSplit'), action:() => { localStorage.setItem('rhfiles-dual-split', '.5'); restoreDualPaneSplit(); }},
    ]);
  });
  document.getElementById('preview-content')?.addEventListener('dblclick', event => {
    if (event.target.closest('.preview-image-stage, video, iframe')) togglePreviewFullscreen();
  });
});

// --- lightweight, dependency-free syntax highlighting ---
// Tokens are escaped one at a time so previewed files can never inject markup.
const PREVIEW_LANGUAGES = Object.freeze({
  js: ['javascript', 'JavaScript', 'code'], jsx: ['javascript', 'JavaScript JSX', 'code'], mjs: ['javascript', 'JavaScript', 'code'], cjs: ['javascript', 'JavaScript', 'code'],
  ts: ['typescript', 'TypeScript', 'code'], tsx: ['typescript', 'TypeScript TSX', 'code'],
  rs: ['rust', 'Rust', 'code'], py: ['python', 'Python', 'code'], pyw: ['python', 'Python', 'code'],
  c: ['c', 'C', 'code'], h: ['c', 'C Header', 'code'], cpp: ['cpp', 'C++', 'code'], cc: ['cpp', 'C++', 'code'], cxx: ['cpp', 'C++', 'code'], hpp: ['cpp', 'C++ Header', 'code'], hxx: ['cpp', 'C++ Header', 'code'],
  cs: ['csharp', 'C#', 'code'], java: ['java', 'Java', 'code'], go: ['go', 'Go', 'code'], rb: ['ruby', 'Ruby', 'code'], php: ['php', 'PHP', 'code'],
  swift: ['swift', 'Swift', 'code'], kt: ['kotlin', 'Kotlin', 'code'], kts: ['kotlin', 'Kotlin', 'code'], dart: ['dart', 'Dart', 'code'], lua: ['lua', 'Lua', 'code'], vim: ['vim', 'Vim Script', 'code'],
  sh: ['shell', 'Shell', 'code'], bash: ['shell', 'Bash', 'code'], zsh: ['shell', 'Zsh', 'code'], ps1: ['powershell', 'PowerShell', 'code'], bat: ['batch', 'Batch', 'code'], cmd: ['batch', 'Batch', 'code'],
  sql: ['sql', 'SQL', 'code'], dockerfile: ['dockerfile', 'Dockerfile', 'code'], makefile: ['makefile', 'Makefile', 'code'],
  json: ['json', 'JSON', 'json'], jsonc: ['jsonc', 'JSON with Comments', 'json'],
  html: ['markup', 'HTML', 'markup'], htm: ['markup', 'HTML', 'markup'], xml: ['markup', 'XML', 'markup'], svg: ['markup', 'SVG', 'markup'], xaml: ['markup', 'XAML', 'markup'], vue: ['markup', 'Vue', 'markup'], svelte: ['markup', 'Svelte', 'markup'],
  css: ['css', 'CSS', 'css'], scss: ['css', 'SCSS', 'css'], sass: ['css', 'Sass', 'css'], less: ['css', 'Less', 'css'],
  yaml: ['config', 'YAML', 'config'], yml: ['config', 'YAML', 'config'], toml: ['config', 'TOML', 'config'], ini: ['config', 'INI', 'config'], cfg: ['config', 'Config', 'config'], conf: ['config', 'Config', 'config'], env: ['config', 'Environment', 'config'], properties: ['config', 'Properties', 'config'], lock: ['config', 'Lock File', 'config'], gitignore: ['config', 'Git Ignore', 'config'], editorconfig: ['config', 'EditorConfig', 'config'],
  log: ['log', 'Log', 'log'], md: ['markdown', 'Markdown', 'markdown'], markdown: ['markdown', 'Markdown', 'markdown'],
  txt: ['text', 'Text', 'plain'], csv: ['text', 'CSV', 'plain'], tsv: ['text', 'TSV', 'plain'],
});

function _keywordSet(words) {
  return new Set(words.split(/\s+/).filter(Boolean));
}

const PREVIEW_KEYWORDS = Object.freeze({
  javascript: _keywordSet('as async await break case catch class const continue debugger default delete do else export extends false finally for from function get if import in instanceof let new null of return set static super switch this throw true try typeof undefined var void while with yield'),
  typescript: _keywordSet('abstract any as asserts async await bigint boolean break case catch class const constructor continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object of override private protected public readonly require return set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield'),
  rust: _keywordSet('Self as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self static struct super trait true type unsafe use where while None Some Ok Err'),
  python: _keywordSet('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return self try while with yield'),
  c: _keywordSet('auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while true false null'),
  cpp: _keywordSet('alignas alignof and asm auto bool break case catch char class const constexpr consteval constinit continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator override private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile while'),
  csharp: _keywordSet('abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach get goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly record ref return sbyte sealed set short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while yield'),
  java: _keywordSet('abstract assert boolean break byte case catch char class const continue default do double else enum exports extends false final finally float for if implements import instanceof int interface long module native new null package private protected public requires return short static strictfp super switch synchronized this throw throws transient true try var void volatile while'),
  go: _keywordSet('break case chan const continue default defer else fallthrough false for func go goto if import interface map nil package range return select struct switch true type var'),
  ruby: _keywordSet('BEGIN END alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield'),
  php: _keywordSet('abstract and array as break callable case catch class clone const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new null or print private protected public readonly require require_once return static switch throw trait true try unset use var while xor yield'),
  swift: _keywordSet('associatedtype break case catch class continue convenience default defer deinit do dynamic else enum extension fallthrough false fileprivate final for func get guard if import in indirect init inout internal is lazy let mutating nil nonmutating open operator override private protocol public repeat required rethrows return self set some static struct subscript super switch throw throws true try typealias var weak where while'),
  kotlin: _keywordSet('as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while by catch constructor delegate dynamic field file finally get import init param property receiver set setparam where'),
  dart: _keywordSet('abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for function get hide if implements import in interface is late library mixin new null on operator part required rethrow return set show static super switch sync this throw true try typedef var void while with yield'),
  lua: _keywordSet('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'),
  shell: _keywordSet('case do done elif else esac export fi for function if in local readonly return select shift then time trap true false until while'),
  powershell: _keywordSet('begin break catch class continue data do dynamicparam else elseif end enum exit filter finally for foreach from function hidden if in param process return static switch throw trap try until using var while true false null'),
  batch: _keywordSet('call choice cls copy del do echo else endlocal errorlevel exist exit for goto if in move not pause rem ren set setlocal shift start title type'),
  sql: _keywordSet('add all alter and any as asc backup begin between by case check column constraint create database default delete desc distinct drop else end exists foreign from full group having in index inner insert into is join key left like limit not null on or order outer primary procedure right rownum select set table top truncate union unique update values view when where with'),
  dockerfile: _keywordSet('add arg cmd copy entrypoint env expose from healthcheck label maintainer onbuild run shell stopsignal user volume workdir as'),
  makefile: _keywordSet('define else endef endif export ifdef ifeq ifndef ifneq include override private sinclude undefine unexport vpath'),
  vim: _keywordSet('autocmd call command echo else elseif endfor endif endfunction endtry endwhile execute for function if let return set try while'),
  css: _keywordSet('and from important in not only or to var calc clamp min max url rgb rgba hsl hsla inherit initial revert unset none auto'),
  config: _keywordSet('true false null none yes no on off'),
  json: _keywordSet('true false null'),
  jsonc: _keywordSet('true false null'),
});

function getPreviewLanguage(ext, fileName) {
  const normalized = String(ext || '').toLowerCase().replace(/^\./, '');
  const base = String(fileName || '').toLowerCase().split(/[\\/]/).pop();
  let key = normalized;
  if (base === 'dockerfile' || base.startsWith('dockerfile.')) key = 'dockerfile';
  else if (base === 'makefile' || base.startsWith('makefile.')) key = 'makefile';
  else if (base === '.gitignore' || base === '.gitattributes') key = 'gitignore';
  else if (base === '.editorconfig') key = 'editorconfig';
  else if (base === '.env' || base.startsWith('.env.')) key = 'env';
  const info = PREVIEW_LANGUAGES[key];
  if (info) return { id: info[0], label: info[1], family: info[2] };
  return { id: 'text', label: normalized ? normalized.toUpperCase() : 'Text', family: 'plain' };
}

function renderTextPreview(text, ext, fileName) {
  const prepared = truncatePreviewText(text);
  const language = getPreviewLanguage(ext, fileName);
  const body = language.family === 'markdown'
    ? '<div class="preview-text markdown-preview">' + renderMarkdown(prepared.text) + '</div>'
    : '<pre class="preview-text">' + syntaxHighlight(prepared.text, ext, fileName) + '</pre>';
  const truncated = prepared.truncated
    ? '<span class="preview-truncated" title="' + esc(t('preview.truncatedDetail', {count: prepared.totalChars})) + '">' + esc(t('preview.truncated')) + '</span>'
    : '';
  return '<div class="preview-code-shell preview-lang-' + esc(language.id) + '">' +
    '<div class="preview-code-toolbar"><span class="preview-language">' + esc(language.label) + '</span>' + truncated + '</div>' +
    body + '</div>';
}

function _token(kind, value) {
  return '<span class="tok-' + kind + '">' + esc(value) + '</span>';
}

function _isIdentStart(ch) {
  return !!ch && /[A-Za-z_$]/.test(ch);
}

function _isIdentPart(ch) {
  return !!ch && /[A-Za-z0-9_$]/.test(ch);
}

function _readQuoted(text, start) {
  const quote = text[start];
  const triple = (quote === '"' || quote === "'") && text.slice(start, start + 3) === quote.repeat(3);
  const delimiter = triple ? quote.repeat(3) : quote;
  let i = start + delimiter.length;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += Math.min(2, text.length - i);
      continue;
    }
    if (text.slice(i, i + delimiter.length) === delimiter) return i + delimiter.length;
    i++;
  }
  return text.length;
}

function _commentConfig(id) {
  if (id === 'python' || id === 'ruby' || id === 'shell' || id === 'makefile' || id === 'vim') return { line: ['#'], block: [] };
  if (id === 'powershell') return { line: ['#'], block: [['<#', '#>']] };
  if (id === 'sql') return { line: ['--'], block: [['/*', '*/']] };
  if (id === 'lua') return { line: ['--'], block: [['--[[', ']]']] };
  if (id === 'batch') return { line: ['::', 'REM '], block: [] };
  if (id === 'json') return { line: [], block: [] };
  if (id === 'jsonc') return { line: ['//'], block: [['/*', '*/']] };
  if (id === 'config') return { line: ['#', ';'], block: [] };
  return { line: ['//'], block: [['/*', '*/']] };
}

function _linePrefixIsWhitespace(text, index) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  return text.slice(lineStart, index).trim() === '';
}

function _highlightCode(text, language) {
  const config = _commentConfig(language.id);
  const keywords = PREVIEW_KEYWORDS[language.id] || new Set();
  const operators = '{}[]()<>.=:+-*/%!?&|^~;,@\\';
  let output = '';
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const pair of config.block) {
      if (text.startsWith(pair[0], i)) {
        const end = text.indexOf(pair[1], i + pair[0].length);
        const next = end < 0 ? text.length : end + pair[1].length;
        output += _token('comment', text.slice(i, next));
        i = next;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const marker of config.line) {
      const needsLineStart = marker === '::' || marker === 'REM ';
      const sameIgnoringCase = text.slice(i, i + marker.length).toUpperCase() === marker.toUpperCase();
      if (sameIgnoringCase && (!needsLineStart || _linePrefixIsWhitespace(text, i))) {
        const end = text.indexOf('\n', i);
        const next = end < 0 ? text.length : end;
        output += _token('comment', text.slice(i, next));
        i = next;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const next = _readQuoted(text, i);
      const raw = text.slice(i, next);
      let kind = 'string';
      if ((language.id === 'json' || language.id === 'jsonc')) {
        let after = next;
        while (/\s/.test(text[after] || '')) after++;
        if (text[after] === ':') kind = 'property';
      }
      output += _token(kind, raw);
      i = next;
      continue;
    }

    if ((language.id === 'c' || language.id === 'cpp') && ch === '#' && _linePrefixIsWhitespace(text, i)) {
      const end = text.indexOf('\n', i);
      const next = end < 0 ? text.length : end;
      output += _token('meta', text.slice(i, next));
      i = next;
      continue;
    }

    if (language.id === 'css' && ch === '@' && _isIdentStart(text[i + 1])) {
      let next = i + 2;
      while (_isIdentPart(text[next]) || text[next] === '-') next++;
      output += _token('meta', text.slice(i, next));
      i = next;
      continue;
    }

    const number = text.slice(i).match(/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/);
    if (number) {
      output += _token('number', number[0]);
      i += number[0].length;
      continue;
    }

    if (_isIdentStart(ch)) {
      let next = i + 1;
      while (_isIdentPart(text[next]) || (language.id === 'css' && text[next] === '-')) next++;
      const word = text.slice(i, next);
      const lower = word.toLowerCase();
      let lookahead = next;
      while (/\s/.test(text[lookahead] || '')) lookahead++;
      let kind = '';
      if (keywords.has(word) || keywords.has(lower)) kind = 'keyword';
      else if (language.id === 'css' && text[lookahead] === ':') kind = 'property';
      else if (text[lookahead] === '(') kind = 'function';
      else if (/^[A-Z][A-Za-z0-9_$]*$/.test(word) && word.length > 1) kind = 'type';
      output += kind ? _token(kind, word) : esc(word);
      i = next;
      continue;
    }

    if (operators.includes(ch)) {
      let next = i + 1;
      while (next < text.length && operators.includes(text[next])) next++;
      output += _token('operator', text.slice(i, next));
      i = next;
      continue;
    }

    output += esc(ch);
    i++;
  }
  return output;
}

function _highlightMarkupTag(raw) {
  let output = '';
  let i = 0;
  let sawTagName = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"' || ch === "'") {
      const next = _readQuoted(raw, i);
      output += _token('string', raw.slice(i, next));
      i = next;
      continue;
    }
    if (/[A-Za-z_:]/.test(ch)) {
      let next = i + 1;
      while (/[A-Za-z0-9_:.-]/.test(raw[next] || '')) next++;
      const name = raw.slice(i, next);
      output += _token(sawTagName ? 'attribute' : 'tag', name);
      sawTagName = true;
      i = next;
      continue;
    }
    if ('<>/={!}?'.includes(ch)) output += _token('operator', ch);
    else output += esc(ch);
    i++;
  }
  return output;
}

function _highlightMarkup(text) {
  let output = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      const next = end < 0 ? text.length : end + 3;
      output += _token('comment', text.slice(i, next));
      i = next;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      const next = end < 0 ? text.length : end + 3;
      output += _token('meta', text.slice(i, next));
      i = next;
      continue;
    }
    if (text[i] !== '<') {
      const next = text.indexOf('<', i);
      const end = next < 0 ? text.length : next;
      output += esc(text.slice(i, end));
      i = end;
      continue;
    }
    let next = i + 1;
    let quote = '';
    while (next < text.length) {
      const ch = text[next];
      if (quote) {
        if (ch === '\\') next++;
        else if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') { next++; break; }
      next++;
    }
    const raw = text.slice(i, next);
    output += /^<!doctype/i.test(raw) || raw.startsWith('<?') ? _token('meta', raw) : _highlightMarkupTag(raw);
    i = next;
  }
  return output;
}

function _highlightConfig(text) {
  return String(text).split(/\r?\n/).map(line => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed.startsWith('//')) return _token('comment', line);
    if (/^\s*\[[^\]]+\]\s*$/.test(line) || /^\s*(---|\.\.\.)\s*$/.test(line)) return _token('meta', line);
    const match = line.match(/^(\s*(?:-\s+)?(?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)(\s*)(=|:)(.*)$/);
    if (!match) return _highlightCode(line, { id: 'config' });
    return esc(match[1]) + _token('property', match[2]) + esc(match[3]) + _token('operator', match[4]) + _highlightCode(match[5], { id: 'config' });
  }).join('\n');
}

function _highlightLog(text) {
  const tokenPattern = /\b(?:TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|FATAL|CRITICAL|PANIC|SUCCESS|PASS|FAIL(?:ED)?)\b|\b\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+\-Z]+)?\b|\b(?:0x[0-9a-f]+|\d+(?:\.\d+)?)\b/gi;
  let output = '';
  let index = 0;
  for (const match of String(text).matchAll(tokenPattern)) {
    output += esc(text.slice(index, match.index));
    const upper = match[0].toUpperCase();
    let kind = 'number';
    if (/^(ERROR|FATAL|CRITICAL|PANIC|FAIL|FAILED)$/.test(upper)) kind = 'error';
    else if (/^WARN/.test(upper)) kind = 'warning';
    else if (/^(INFO|NOTICE)$/.test(upper)) kind = 'info';
    else if (/^(SUCCESS|PASS)$/.test(upper)) kind = 'string';
    else if (/^(TRACE|DEBUG)$/.test(upper)) kind = 'comment';
    else if (/^\d{4}-\d{2}-\d{2}/.test(match[0])) kind = 'meta';
    output += _token(kind, match[0]);
    index = match.index + match[0].length;
  }
  return output + esc(text.slice(index));
}

function syntaxHighlight(text, ext, fileName) {
  const source = String(text == null ? '' : text);
  const language = getPreviewLanguage(ext, fileName);
  if (language.family === 'markup') return _highlightMarkup(source);
  if (language.family === 'config') return _highlightConfig(source);
  if (language.family === 'log') return _highlightLog(source);
  if (language.family === 'code' || language.family === 'json' || language.family === 'css') return _highlightCode(source, language);
  return esc(source);
}

// --- markdown rendering ---
function renderMarkdown(text) {
  let html = esc(text);
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-heading" style="margin:8px 0 4px;font-size:14px;">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-heading" style="margin:10px 0 4px;font-size:15px;">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-heading" style="margin:12px 0 6px;font-size:17px;">$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  html = html.replace(/^\- (.+)$/gm, '<div style="padding-left:16px;">&#8226; $1</div>');
  html = html.replace(/^\* (.+)$/gm, '<div style="padding-left:16px;">&#8226; $1</div>');
  html = html.replace(/^\d+\. (.+)$/gm, '<div style="padding-left:16px;">&#8226; $1</div>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-quote">$1</blockquote>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="#" class="md-link">$1</a>');
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:8px 0;">');
  html = html.replace(/\n/g, '<br>');
  return html;
}
