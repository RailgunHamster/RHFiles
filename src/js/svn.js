// svn.js — SVN integration

G.svnCache = {};

async function loadSvnStatus(path) {
  try {
    G.svnCache = await call("svn_status", { path });
    const statusEl = document.getElementById("status-svn");
    if (statusEl && Object.keys(G.svnCache).length > 0) {
      const counts = { modified: 0, added: 0, deleted: 0, untracked: 0, missing: 0, conflicted: 0 };
      for (const s of Object.values(G.svnCache)) { if (counts[s] !== undefined) counts[s]++; }
      const parts = [];
      if (counts.modified) parts.push("M:" + counts.modified);
      if (counts.added) parts.push("A:" + counts.added);
      if (counts.deleted) parts.push("D:" + counts.deleted);
      if (counts.untracked) parts.push("?:" + counts.untracked);
      if (counts.missing) parts.push("!!:" + counts.missing);
      if (counts.conflicted) parts.push("C:" + counts.conflicted);
      if (parts.length) statusEl.textContent = "SVN: " + parts.join(" ");
    }
  } catch (e) { G.svnCache = {}; }
}

async function loadSvnInfo(path) {
  try {
    const info = await call("svn_info", { path });
    const el = document.getElementById("svn-info-display");
    if (el && info) {
      el.textContent = info.url ? `${info.url} (r${info.revision})` : "";
    }
    return info;
  } catch (e) { return null; }
}

async function svnUpdate() {
  const path = getTab().path;
  try {
    showNotice("SVN update in progress...");
    const result = await call("svn_update", { path });
    showNotice(t('notice.svnUpdateComplete', {output: result.split('\n').filter(l => l.trim()).slice(-3).join(', ')}));
    await refresh();
    await loadSvnStatus(path);
  } catch (e) { alert(t('alert.svnUpdateFailed', {error: e})); }
}

async function svnCommit() {
  const path = getTab().path;
  const message = prompt(t('prompt.svnCommitMessage'));
  if (!message) return;
  try {
    showNotice("SVN commit in progress...");
    const result = await call("svn_commit", { path, message });
    showNotice(t('notice.svnCommitComplete', {output: result.split('\n').filter(l => l.trim()).slice(-3).join(', ')}));
    await refresh();
    await loadSvnStatus(path);
  } catch (e) { alert(t('alert.svnCommitFailed', {error: e})); }
}

async function svnRevert() {
  const isRight = G.lastActivePane === 'right';
  const pane = isRight ? G.rp : getTab();
  const sel = pane.sel || new Set();
  const entries = pane.entries || [];
  const targets = [...sel].map(i => entries[i]?.name).filter(Boolean);
  if (!targets.length) { alert("Select files to revert"); return; }
  if (!confirm(t('confirm.svnRevert', {count: targets.length}))) return;
  try {
    await call("svn_revert", { path: pane.path, targets });
    showNotice(t('notice.svnRevertComplete'));
    await refresh();
    await loadSvnStatus(pane.path);
  } catch (e) { alert(t('alert.svnRevertFailed', {error: e})); }
}

async function svnAdd() {
  const isRight = G.lastActivePane === 'right';
  const pane = isRight ? G.rp : getTab();
  const sel = pane.sel || new Set();
  const entries = pane.entries || [];
  const targets = [...sel].map(i => entries[i]?.name).filter(Boolean);
  if (!targets.length) { alert("Select files to add"); return; }
  try {
    await call("svn_add", { path: pane.path, targets });
    showNotice(t('notice.svnAddComplete'));
    await refresh();
    await loadSvnStatus(pane.path);
  } catch (e) { alert(t('alert.svnAddFailed', {error: e})); }
}

async function svnCleanup() {
  const path = getTab().path;
  try {
    await call("svn_cleanup", { path });
    showNotice(t('notice.svnCleanupComplete'));
  } catch (e) { alert(t('alert.svnCleanupFailed', {error: e})); }
}

function showSvnLog() {
  const dlg = document.createElement("div");
  dlg.className = "overlay";
  dlg.style.display = "flex";
  dlg.innerHTML = `
    <div class="dialog-backdrop" onclick="this.parentElement.remove()"></div>
    <div class="dialog-box dialog-wide">
      <div class="dialog-title">${t('dialog.svnLogTitle')}</div>
      <div class="dialog-scroll" id="svn-log-content" style="max-height:500px"><div style="color:var(--text-4);padding:8px">${t('properties.loading')}</div></div>
      <div class="dialog-actions">
        <button class="dialog-btn primary" onclick="this.closest('.overlay').remove()">${t('btn.close')}</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  call("svn_log", { path: getTab().path, limit: 25 }).then(entries => {
    const el = dlg.querySelector("#svn-log-content");
    if (!entries || entries.length === 0) {
      el.innerHTML = '<div style="color:var(--text-4);padding:8px">' + t('dialog.svnLogEmpty') + '</div>';
      return;
    }
    el.innerHTML = entries.map(e => `
      <div style="padding:6px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:600;color:var(--accent);font-size:12px">${esc(e.revision)}</span>
          <span style="font-size:11px;color:var(--text-4)">${esc(e.author)} · ${esc(e.date)}</span>
        </div>
        <div style="font-size:12px;color:var(--text-2);margin-top:2px;white-space:pre-wrap">${esc(e.message)}</div>
      </div>`).join("");
  }).catch(e => {
    const el = dlg.querySelector("#svn-log-content");
    el.innerHTML = `<div style="color:var(--text-4);padding:8px">${t('alert.svnLogFailed', {error: esc(String(e))})}</div>`;
  });
}

function showSvnCheckoutDialog() {
  const dlg = document.createElement("div");
  dlg.className = "overlay";
  dlg.style.display = "flex";
  dlg.innerHTML = `
    <div class="dialog-backdrop" onclick="this.parentElement.remove()"></div>
    <div class="dialog-box">
      <div class="dialog-title">${t('dialog.svnCheckoutTitle')}</div>
      <div class="dialog-row">
        <label>${t('dialog.repoUrl')}</label>
        <input type="text" id="svn-checkout-url" placeholder="${t('dialog.svnUrlPlaceholder')}" style="flex:1">
      </div>
      <div class="dialog-row">
        <label>${t('dialog.destination')}</label>
        <input type="text" id="svn-checkout-dest" value="${esc(getTab().path)}" style="flex:1">
      </div>
      <div id="svn-checkout-status" style="font-size:11px;color:var(--text-4);margin-top:4px"></div>
      <div class="dialog-actions">
        <button class="dialog-btn" onclick="this.closest('.overlay').remove()">${t('btn.cancel')}</button>
        <button class="dialog-btn primary" onclick="doSvnCheckout()">${t('btn.checkout')}</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);
}

async function doSvnCheckout() {
  const url = document.getElementById("svn-checkout-url")?.value?.trim();
  const dest = document.getElementById("svn-checkout-dest")?.value?.trim();
  const status = document.getElementById("svn-checkout-status");
  if (!url) { alert(t('alert.enterUrl')); return; }
  if (!dest) { alert(t('alert.enterDest')); return; }
  if (status) { status.textContent = t('status.checkingOut'); status.style.color = "var(--text-3)"; }
  try {
    await call("svn_checkout", { url, dest });
    if (status) { status.textContent = t('notice.checkoutComplete'); status.style.color = "var(--accent)"; }
    document.querySelector('.overlay[style*="flex"]')?.remove();
    navigateTo(dest);
  } catch (e) {
    if (status) { status.textContent = "Failed: " + e; status.style.color = "var(--git-deleted)"; }
  }
}

function getSvnStatusForFile(name) {
  return G.svnCache[name] || null;
}

function renderSvnStatusIcon(name) {
  const status = getSvnStatusForFile(name);
  if (!status) return '';
  const icons = { modified: '\u25cf', added: '+', deleted: '\u2715', untracked: '?', missing: '!', conflicted: '\u26a0', replaced: '\u21bb' };
  const colors = { modified: '#ff9800', added: '#4caf50', deleted: '#f44336', untracked: '#888', missing: '#f44336', conflicted: '#ff5722', replaced: '#2196f3' };
  const icon = icons[status] || '\u25cf';
  const color = colors[status] || '#888';
  return `<div class="row-svn svn-${status}" title="SVN: ${status}" style="color:${color}">${icon}</div>`;
}
