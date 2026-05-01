// git.js — git integration + archive browsing

async function loadGitStatus(path) {
  try {
    G.gitCache = await call("git_status", { path });
    const statusEl = document.getElementById("status-git");
    if (statusEl && Object.keys(G.gitCache).length > 0) {
      const counts = { modified: 0, added: 0, deleted: 0, untracked: 0 };
      for (const s of Object.values(G.gitCache)) { if (counts[s] !== undefined) counts[s]++; }
      const parts = [];
      if (counts.modified) parts.push("M:" + counts.modified);
      if (counts.added) parts.push("A:" + counts.added);
      if (counts.deleted) parts.push("D:" + counts.deleted);
      if (counts.untracked) parts.push("?:" + counts.untracked);
      if (parts.length) statusEl.textContent = "Git: " + parts.join(" ");
    }
    renderFiles(getTab(), "file-list", "status-count", "status-selection");
  } catch (e) { G.gitCache = {}; }
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
  } catch (e) { alert("Cannot open archive: " + e); }
}

function closeArchive() {
  archiveBrowsingPath = null;
  const hdr = document.querySelector(".archive-header");
  if (hdr) hdr.remove();
  refresh();
}

async function extractArchiveAll() {
  if (!archiveBrowsingPath) return;
  try {
    await call("extract_archive", { path: archiveBrowsingPath, dest: getTab().path, entryPath: null });
    closeArchive();
  } catch (e) { alert("Extract failed: " + e); }
}

async function extractArchiveEntry(idx) {
  if (!archiveBrowsingPath) return;
  const entries = getTab().entries;
  if (!entries[idx]) return;
  try {
    await call("extract_archive", { path: archiveBrowsingPath, dest: getTab().path, entryPath: entries[idx].path });
    refresh();
  } catch (e) { alert("Extract failed: " + e); }
}

// --- git branch management ---
async function loadGitBranches(path) {
  try {
    const data = await call("git_branches", { path });
    const el = document.getElementById("git-branch-selector");
    if (!el) return data;
    const branches = data.branches || [];
    const current = data.current || "";
    el.innerHTML = branches.map(b =>
      '<option value="' + esc(b) + '"' + (b === current ? ' selected' : '') + '>' + esc(b) + (b === current ? ' *' : '') + '</option>'
    ).join("");
    el.style.display = branches.length ? "inline-block" : "none";
    return data;
  } catch (e) { return { branches: [], current: "" }; }
}

async function gitCheckout(branch) {
  try {
    await call("git_checkout", { path: getTab().path, branch });
    await refresh();
    await loadGitStatus(getTab().path);
    await loadGitBranches(getTab().path);
  } catch (e) { alert("Checkout failed: " + e); }
}

async function gitCreateBranch(name) {
  if (!name) return;
  try {
    await call("git_create_branch", { path: getTab().path, branch: name });
    await gitCheckout(name);
  } catch (e) { alert("Create branch failed: " + e); }
}

async function gitInit() {
  try {
    await call("git_init", { path: getTab().path });
    await refresh();
    await loadGitStatus(getTab().path);
    await loadGitBranches(getTab().path);
  } catch (e) { alert("Git init failed: " + e); }
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
  const name = prompt("New branch name:");
  if (name) gitCreateBranch(name);
}
