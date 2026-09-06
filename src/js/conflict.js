// conflict.js - file conflict resolution

let conflictCallback = null;

function showConflictDialog(sourceName, destName, sourcePath, destPath, onResolve) {
  conflictCallback = onResolve;
  const dlg = document.getElementById("conflict-dialog");
  const content = document.getElementById("conflict-content");
  content.innerHTML = `
    <div class="conflict-message">${t('dialog.conflictMsg')}</div>
    <div class="conflict-files">
      <div class="conflict-file">
        <div class="conflict-label">${t('dialog.conflictSource')}</div>
        <div class="conflict-name">${esc(sourceName)}</div>
        <div class="conflict-path">${esc(sourcePath)}</div>
      </div>
      <div class="conflict-file">
        <div class="conflict-label">${t('dialog.conflictDest')}</div>
        <div class="conflict-name">${esc(destName)}</div>
        <div class="conflict-path">${esc(destPath)}</div>
      </div>
    </div>
    <div class="conflict-options">
      <button class="dialog-btn" onclick="resolveConflict('replace')">${t('dialog.conflictReplace')}</button>
      <button class="dialog-btn" onclick="resolveConflict('skip')">${t('dialog.conflictSkip')}</button>
      <button class="dialog-btn" onclick="resolveConflict('rename')">${t('dialog.conflictKeepBoth')}</button>
      <button class="dialog-btn" onclick="resolveConflict('cancel')">${t('btn.cancel')}</button>
    </div>
    <label class="conflict-apply-all"><input type="checkbox" id="conflict-apply-all"> ${t('dialog.conflictApplyAll')}</label>
  `;
  dlg.style.display = "flex";
}

function resolveConflict(action) {
  document.getElementById("conflict-dialog").style.display = "none";
  const applyAll = document.getElementById("conflict-apply-all")?.checked || false;
  if (conflictCallback) conflictCallback(action, applyAll);
  conflictCallback = null;
}

function closeConflict() {
  document.getElementById("conflict-dialog").style.display = "none";
  if (conflictCallback) conflictCallback('cancel', false);
  conflictCallback = null;
}

function fileNameKey(name) {
  return String(name || '').normalize('NFC').toLocaleLowerCase();
}

function generateUniqueName(destDir, name, existingNames) {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.substring(0, dot) : name;
  const ext = dot > 0 ? name.substring(dot) : '';
  const used = new Set(Array.from(existingNames || [], fileNameKey));
  let index = 1;
  let candidate = `${base} (${index})${ext}`;
  while (used.has(fileNameKey(candidate))) {
    index++;
    candidate = `${base} (${index})${ext}`;
  }
  return candidate;
}
