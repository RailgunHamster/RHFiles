// pane.js — preview pane + dual pane

function convertFileSrc(filePath) {
  if (window.__TAURI_INTERNALS__) {
    const path = filePath.replace(/\\/g, '/');
    return 'https://asset.localhost/' + encodeURIComponent(path).replace(/%3A/g, ':').replace(/%2F/g, '/');
  }
  return filePath;
}

// --- preview pane ---
function togglePreviewPane() {
  G.previewOn = !G.previewOn;
  const pane = document.getElementById("preview-pane");
  const divider = document.getElementById("preview-divider");
  const btn = document.getElementById("btn-preview");
  if (G.previewOn) {
    pane.style.display = "flex";
    divider.style.display = "block";
    btn.style.background = "var(--accent-light)";
    btn.style.color = "var(--accent)";
  } else {
    pane.style.display = "none";
    divider.style.display = "none";
    btn.style.background = "";
    btn.style.color = "";
  }
  updatePreviewForSelection();
}

async function updatePreviewForSelection() {
  if (!G.previewOn) return;
  const isRight = G.lastActivePane === 'right';
  const sel = getSelectedPaths(isRight);
  if (sel.length !== 1) {
    document.getElementById("preview-content").innerHTML = `<div class="preview-empty">${t('preview.selectFile')}</div>`;
    return;
  }
  const file = sel[0];
  const ext = (file.extension || "").toLowerCase();
  if (file.is_dir) {
    try {
      const dirEntries = await call("list_dir", { path: file.path, filter: "" });
      const preview = dirEntries.slice(0, 20);
      document.getElementById("preview-content").innerHTML =
        '<div style="text-align:center;padding:12px;">' +
        '<div style="font-size:36px;">' + bigFileIcon(file) + '</div>' +
        '<div style="font-size:14px;color:var(--text-2);margin:4px 0;">' + esc(file.name) + '</div>' +
        '<div style="font-size:11px;color:var(--text-4);margin-bottom:8px;">' + dirEntries.length + ' items</div>' +
        '<div style="text-align:left;font-size:11px;color:var(--text-3);">' +
        preview.map(e => '<div style="padding:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
          (e.is_dir ? '&#128193; ' : '&#128196; ') + esc(e.name) + '</div>').join("") +
        (dirEntries.length > 20 ? '<div style="color:var(--text-4);">...and ' + (dirEntries.length - 20) + ' more</div>' : '') +
        '</div></div>';
    } catch (e) {
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
      document.getElementById("preview-content").innerHTML =
        '<div style="padding:16px;">' +
        '<div style="font-size:36px;text-align:center;">' + bigFileIcon(file) + '</div>' +
        '<div style="text-align:center;font-size:14px;color:var(--text-2);margin:4px 0;">' + esc(file.name) + '</div>' +
        '<div style="margin-top:12px;font-size:11px;">' +
        '<div class="props-row"><span class="props-label">Target:</span><span class="props-value">' + esc(scData && scData.target ? scData.target : "Unknown") + '</span></div>' +
        '<div class="props-row"><span class="props-label">Args:</span><span class="props-value">' + esc(scData && scData.args ? scData.args : "") + '</span></div>' +
        '<div class="props-row"><span class="props-label">Work Dir:</span><span class="props-value">' + esc(scData && scData.work_dir ? scData.work_dir : "") + '</span></div>' +
        '</div></div>';
    } catch (e) {
      document.getElementById("preview-content").innerHTML = `<div class="preview-empty">${t('preview.noPreview')}</div>`;
    }
    return;
  }
  let is_pdf = ext === "pdf";
  let is_audio = ['mp3','wav','flac','ogg','aac','wma','m4a'].includes(ext);
  let is_video = ['mp4','mkv','avi','webm','mov','wmv','m4v'].includes(ext);
  if (is_pdf) {
    const src = convertFileSrc(file.path);
    document.getElementById("preview-content").innerHTML = `<div style="text-align:center;padding:12px;">
      <div style="font-size:36px;color:#d32f2f">&#128196;</div>
      <div style="margin-top:4px;font-size:14px;color:var(--text-2)">${esc(file.name)}</div>
      <div style="margin-top:2px;color:var(--text-4)">${fmtSize(file.size)}</div>
      <button class="dialog-btn" style="margin-top:8px" onclick="call('open_file',{path:'${esc(file.path)}'})">Open PDF</button>
      <iframe src="${esc(src)}" style="width:100%;height:280px;border:1px solid var(--border);margin-top:8px;border-radius:4px;"></iframe>
    </div>`;
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
  try {
    const preview = await call("read_file_preview", { path: file.path });
    const content = document.getElementById("preview-content");
    if (preview.preview_type === "image" && preview.image_data) {
      content.innerHTML = `<div class="preview-image"><img src="data:image/png;base64,${preview.image_data}" alt="${esc(file.name)}"></div>`;
    } else if (preview.preview_type === "text" && preview.text_content != null) {
      const extL = (file.extension || "").toLowerCase();
      if (extL === "md" || extL === "markdown") {
        content.innerHTML = '<div class="preview-text markdown-preview">' + renderMarkdown(preview.text_content) + '</div>';
      } else {
        const highlighted = syntaxHighlight(esc(preview.text_content), extL);
        content.innerHTML = `<pre class="preview-text">${highlighted}</pre>`;
      }
    } else {
      content.innerHTML = `<div class="preview-empty">
        <div style="font-size:48px;">${bigFileIcon(file)}</div>
        <div style="margin-top:8px;font-size:14px;color:var(--text-2);">${esc(file.name)}</div>
        <div style="margin-top:4px;color:var(--text-4);">${fmtSize(preview.size)}</div>
        <div style="margin-top:12px;color:var(--text-4);">${t('preview.binary')}</div>
      </div>`;
    }
  } catch (e) {
    document.getElementById("preview-content").innerHTML = `<div class="preview-empty">${t('preview.noPreview')}</div>`;
  }
}

// --- dual pane ---
function toggleDualPane() {
  G.dualOn = !G.dualOn;
  const rightPane = document.getElementById("pane-right");
  const divider = document.getElementById("pane-divider");
  const btn = document.getElementById("btn-dual");
  if (G.dualOn) {
    rightPane.style.display = "flex";
    divider.style.display = "block";
    btn.style.background = "var(--accent-light)";
    btn.style.color = "var(--accent)";
    if (G.rp.history.length === 0) {
      G.rp.history = [G.rp.path];
      G.rp.histIdx = 0;
    }
    rpNavigateTo(G.rp.path, false);
  } else {
    rightPane.style.display = "none";
    divider.style.display = "none";
    btn.style.background = "";
    btn.style.color = "";
  }
  renderFiles(getTab(), "file-list", "status-count", "status-selection");
}

async function rpNavigateTo(path, pushHistory) {
  if (pushHistory === undefined) pushHistory = true;
  try {
    let entries = await call("list_dir", { path, filter: "" });
    if (!G.showHidden) entries = entries.filter(e => !e.is_hidden);
    entries = sortEntriesList(entries, G.rp.sortF, G.rp.sortAsc);
    G.rp.entries = entries;
    if (pushHistory && path !== G.rp.path) {
      G.rp.history = G.rp.history.slice(0, G.rp.histIdx + 1);
      G.rp.history.push(path);
      G.rp.histIdx = G.rp.history.length - 1;
    }
    G.rp.path = path;
    G.rp.sel.clear();
    G.rp.lastIdx = -1;
    document.getElementById("right-path-input").value = path;
    renderBreadcrumb(path, "right-breadcrumb", null, "right-path-input", true);
    renderFiles(G.rp, "right-file-list", "right-status-count", null, true);
  } catch (e) { document.getElementById("right-status-count").textContent = "Error: " + e; }
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
  const startX = e.clientX;
  const startW = container.clientWidth;
  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    const newW = Math.max(200, Math.min(startW + dx, window.innerWidth - 200));
    document.getElementById(rightId).style.width = (newW) + "px";
  };
  const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

// --- syntax highlighting ---
function syntaxHighlight(html, ext) {
  const KW = {
    rs: /\b(fn|let|mut|const|if|else|match|for|while|loop|return|struct|enum|impl|trait|pub|use|mod|self|Self|super|crate|where|async|await|move|ref|type|static|dyn|as|in|break|continue|true|false|None|Some|Ok|Err|Vec|String|Box|Rc|Arc)\b/g,
    js: /\b(function|const|let|var|if|else|for|while|do|return|class|new|this|typeof|instanceof|import|export|from|default|async|await|try|catch|throw|finally|switch|case|break|continue|null|undefined|true|false|of|in|yield|delete|void)\b/g,
    ts: /\b(function|const|let|var|if|else|for|while|do|return|class|new|this|typeof|instanceof|import|export|from|default|async|await|try|catch|throw|finally|switch|case|break|continue|null|undefined|true|false|of|in|yield|interface|type|enum|namespace|declare|as|keyof|extends|implements)\b/g,
    py: /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|raise|pass|break|continue|lambda|yield|global|nonlocal|assert|del|in|not|and|or|is|None|True|False|self|print|range|len)\b/g,
    json: null, toml: null,
  };
  const re = KW[ext];
  if (!re) return html;
  const commentChar = ext === 'py' ? '#' : (ext === 'rs' || ext === 'js' || ext === 'ts') ? '//' : null;
  const sRe = /(&quot;[^]*?&quot;|&#39;[^]*?&#39;)/g;
  const cRe = commentChar ? new RegExp('(' + commentChar.replace('/', '\\/') + '[^\\n]*)', 'g') : null;

  let result = html;
  result = result.replace(re, '<span style="color:#569cd6">$1</span>');
  result = result.replace(sRe, '<span style="color:#ce9178">$1</span>');
  result = result.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#b5cea8">$1</span>');
  if (cRe) result = result.replace(cRe, '<span style="color:#6a9955">$1</span>');
  return result;
}

// --- markdown rendering ---
function renderMarkdown(text) {
  let html = esc(text);
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin:8px 0 4px;font-size:14px;">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin:10px 0 4px;font-size:15px;">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin:12px 0 6px;font-size:17px;">$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-3);padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>');
  html = html.replace(/^\- (.+)$/gm, '<div style="padding-left:16px;">&#8226; $1</div>');
  html = html.replace(/^\* (.+)$/gm, '<div style="padding-left:16px;">&#8226; $1</div>');
  html = html.replace(/^\d+\. (.+)$/gm, '<div style="padding-left:16px;">&#8226; $1</div>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid var(--border);padding-left:8px;color:var(--text-3);margin:4px 0;">$1</blockquote>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="#" style="color:var(--accent);">$1</a>');
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:8px 0;">');
  html = html.replace(/\n/g, '<br>');
  return html;
}
