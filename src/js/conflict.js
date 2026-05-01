// conflict.js - file conflict resolution

let conflictCallback = null;

function showConflictDialog(sourceName, destName, sourcePath, destPath, onResolve) {
  conflictCallback = onResolve;
  const dlg = document.getElementById("conflict-dialog");
  const content = document.getElementById("conflict-content");
  content.innerHTML = `
    <div class="conflict-message">A file with the same name already exists:</div>
    <div class="conflict-files">
      <div class="conflict-file">
        <div class="conflict-label">Source</div>
        <div class="conflict-name">${esc(sourceName)}</div>
        <div class="conflict-path">${esc(sourcePath)}</div>
      </div>
      <div class="conflict-file">
        <div class="conflict-label">Destination</div>
        <div class="conflict-name">${esc(destName)}</div>
        <div class="conflict-path">${esc(destPath)}</div>
      </div>
    </div>
    <div class="conflict-options">
      <button class="dialog-btn" onclick="resolveConflict('replace')">Replace</button>
      <button class="dialog-btn" onclick="resolveConflict('skip')">Skip</button>
      <button class="dialog-btn" onclick="resolveConflict('rename')">Keep Both</button>
      <button class="dialog-btn" onclick="resolveConflict('cancel')">Cancel</button>
    </div>
    <label class="conflict-apply-all"><input type="checkbox" id="conflict-apply-all"> Apply to all conflicts</label>
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

function generateUniqueName(destDir, name) {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.substring(0, dot) : name;
  const ext = dot > 0 ? name.substring(dot) : '';
  return base + ' (1)' + ext;
}
