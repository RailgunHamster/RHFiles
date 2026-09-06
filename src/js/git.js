// git.js — git integration + archive browsing

async function loadGitStatus(path) {
  try {
    const cache = await call("git_status", { path });
    if (!getTab() || getTab().path !== path) return;
    G.gitCache = cache;
    const statusEl = document.getElementById("status-git");
    if (statusEl) {
      if (Object.keys(G.gitCache).length > 0) {
        const counts = { modified: 0, added: 0, deleted: 0, untracked: 0 };
        for (const s of Object.values(G.gitCache)) { if (counts[s] !== undefined) counts[s]++; }
        const parts = [];
        if (counts.modified) parts.push("M:" + counts.modified);
        if (counts.added) parts.push("A:" + counts.added);
        if (counts.deleted) parts.push("D:" + counts.deleted);
        if (counts.untracked) parts.push("?:" + counts.untracked);
        if (parts.length) statusEl.textContent = "Git: " + parts.join(" ");
        else statusEl.textContent = "";
      } else {
        statusEl.textContent = "";
      }
    }
  } catch (e) {
    if (!getTab() || getTab().path !== path) return;
    G.gitCache = {};
    const statusEl = document.getElementById("status-git");
    if (statusEl) statusEl.textContent = "";
  }
}

// --- archive browsing ---
let archiveBrowsingPath = null;

async function openArchive(path) {
  try {
    const entries = await call("list_archive", { path });
    archiveBrowsingPath = path;
    const listId = "file-list";
    const list = document.getElementById(listId);
    const tab = getTab();
    tab.entries = entries.map((e, i) => ({
      name: e.name, path: e.path, extension: e.is_dir ? "" : (e.name.split(".").pop() || ""),
      is_dir: e.is_dir, is_hidden: false, size: e.size, size_display: fmtSize(e.size),
      modified: e.modified, created: "", archive_entry: true, archive_index: i
    }));
    tab.sel.clear();
    const header = document.querySelector(".file-header");
    if (header) {
      header.insertAdjacentHTML("beforebegin",
        '<div class="archive-header"><span>' + t("archive.title") + ': ' + esc(path.split("\\").pop()) +
        '</span><button class="archive-close" onclick="closeArchive()">&times;</button>' +
        '<button class="dialog-btn" style="margin-left:8px" onclick="extractArchiveAll()">' + t("ctx.extractAll") + '</button></div>');
    }
    renderFiles(tab, listId, "status-count", "status-selection");
  } catch (e) { alert(t('alert.openArchiveFailed', {error: e})); }
}

function closeArchive() {
  archiveBrowsingPath = null;
  const hdr = document.querySelector(".archive-header");
  if (hdr) hdr.remove();
  refresh();
}

async function extractArchiveAll() {
  if (!archiveBrowsingPath) return;
  showProgress(t('status.extracting', { name: archiveBrowsingPath.split('\\').pop() }));
  try {
    await call("extract_archive", { path: archiveBrowsingPath, dest: getTab().path, entryPath: null });
    closeArchive();
  } catch (e) {
    if (!/cancel/i.test(String(e))) alert(t('alert.extractFailed', {error: e}));
  } finally { hideProgress(); }
}

async function extractArchiveEntry(idx) {
  if (!archiveBrowsingPath) return;
  const entries = getTab().entries;
  if (!entries[idx]) return;
  showProgress(t('status.extracting', { name: entries[idx].name }));
  try {
    await call("extract_archive", { path: archiveBrowsingPath, dest: getTab().path, entryPath: entries[idx].path });
    refresh();
  } catch (e) {
    if (!/cancel/i.test(String(e))) alert(t('alert.extractFailed', {error: e}));
  } finally { hideProgress(); }
}

// --- git branch management ---
async function loadGitBranches(path) {
  try {
    const data = await call("git_branches", { path });
    const el = document.getElementById("git-branch-selector");
    if (!el) return data;
    const branches = Array.isArray(data) ? data : (data.branches || []);
    const current = Array.isArray(data)
      ? (branches.find(b => b.is_current)?.name || "")
      : (data.current || "");
    el.innerHTML = branches.map(b => {
      const name = typeof b === 'string' ? b : b.name;
      return '<option value="' + esc(name) + '"' + (name === current ? ' selected' : '') + '>' + esc(name) + (name === current ? ' *' : '') + '</option>';
    }).join("");
    el.style.display = branches.length ? "inline-block" : "none";
    return data;
  } catch (e) { return []; }
}

async function gitCheckout(branch) {
  try {
    await call("git_checkout", { path: getTab().path, branch });
    await refresh();
    await loadGitStatus(getTab().path);
    await loadGitBranches(getTab().path);
  } catch (e) { alert(t('alert.checkoutFailed', {error: e})); }
}

async function gitCreateBranch(name) {
  if (!name) return;
  try {
    await call("git_create_branch", { path: getTab().path, branch: name });
    await gitCheckout(name);
  } catch (e) { alert(t('alert.branchFailed', {error: e})); }
}

async function gitInit() {
  try {
    await call("git_init", { path: getTab().path });
    await refresh();
    await loadGitStatus(getTab().path);
    await loadGitBranches(getTab().path);
  } catch (e) { alert(t('alert.gitInitFailed', {error: e})); }
}

function renderGitBranchSelector() {
  let container = document.getElementById("git-branch-container");
  if (!container) {
    container = document.createElement("span");
    container.id = "git-branch-container";
    container.style.cssText = "margin-left:8px;display:inline-flex;align-items:center;gap:4px;";
    const statusEl = document.getElementById("status-git");
    if (statusEl && statusEl.parentNode) {
      statusEl.parentNode.insertBefore(container, statusEl.nextSibling);
    }
    container.innerHTML = '<select id="git-branch-selector" onchange="gitCheckout(this.value)" style="font-size:11px;max-width:120px;background:var(--bg-2);color:var(--text-2);border:1px solid var(--border);border-radius:3px;padding:1px 4px;"></select>' +
      '<button onclick="gitCreateBranchPrompt()" style="font-size:10px;background:var(--bg-3);border:1px solid var(--border);border-radius:3px;color:var(--text-3);padding:0 4px;cursor:pointer;" title="New Branch">+</button>';
  }
  loadGitBranches(getTab().path);
}

function gitCreateBranchPrompt() {
  const name = prompt(t('prompt.newBranchName'));
  if (name) gitCreateBranch(name);
}

// --- git clone ---
function showGitCloneDialog() {
  const dlg = document.createElement("dialog");
  dlg.style.cssText = "border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--bg-1);color:var(--text-1);min-width:400px;";
  dlg.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:14px">${t('dialog.gitCloneTitle')}</h3>
    <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
      <label style="display:flex;align-items:center;gap:8px;">${t('dialog.repoUrl')}
        <input id="git-clone-url" type="text" placeholder="${t('dialog.repoUrlPlaceholder')}" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;">
      </label>
      <label style="display:flex;align-items:center;gap:8px;">${t('dialog.destination')}
        <input id="git-clone-dest" type="text" value="${esc(getTab().path)}" style="flex:1;padding:4px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:4px;">
      </label>
    </div>
    <div id="git-clone-status" style="margin-top:8px;font-size:11px;color:var(--text-4);"></div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="dialog-btn" id="git-clone-cancel">${t('btn.cancel')}</button>
      <button class="dialog-btn primary" id="git-clone-ok">${t('btn.clone')}</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector("#git-clone-cancel").onclick = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector("#git-clone-ok").onclick = async () => {
    const url = dlg.querySelector("#git-clone-url").value.trim();
    const dest = dlg.querySelector("#git-clone-dest").value.trim();
    if (!url) { alert(t('alert.enterUrl')); return; }
    if (!dest) { alert(t('alert.enterDest')); return; }
    const statusEl = dlg.querySelector("#git-clone-status");
    statusEl.textContent = t('status.cloning');
    statusEl.style.color = "var(--text-3)";
    try {
      const repoName = url.split('/').pop().replace('.git', '') || "repo";
      const fullDest = dest + "\\" + repoName;
      await call("git_clone", { url, dest: fullDest });
      statusEl.textContent = t('notice.cloneSuccess');
      statusEl.style.color = "var(--accent)";
      dlg.close(); dlg.remove();
      navigateTo(fullDest);
    } catch (e) {
      statusEl.textContent = t('alert.cloneFailed', {error: e});
      statusEl.style.color = "var(--git-deleted)";
    }
  };
  dlg.showModal();
  dlg.onclose = () => dlg.remove();
}
