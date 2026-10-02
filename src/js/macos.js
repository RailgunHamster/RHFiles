// macOS-only presentation and Finder drop integration. Windows paths remain untouched.
function configureMacSettings() {
  const terminal = document.querySelector('#settings-page-general select[onchange*="settings.terminal"]');
  if (terminal) {
    terminal.innerHTML = '<option value="terminal">Terminal</option><option value="iterm">iTerm</option>';
    terminal.value = G.settings.terminal === 'iterm' ? 'iterm' : 'terminal';
  }
  document.getElementById('settings-page-integration')?.remove();
  for (const id of ['settings-auto-update','settings-update-source','settings-update-github','settings-update-server']) {
    document.getElementById(id)?.closest('.settings-row')?.remove();
  }
  document.querySelectorAll('[data-archive-tool="bandizip"], [data-archive-tool="winrar"]').forEach(el => el.remove());
  const effect = document.querySelector('#settings-page-appearance select[onchange*="WindowEffect"]');
  effect?.closest('.settings-row')?.remove();
  const ffmpeg = document.getElementById('settings-ffmpeg-path');
  if (ffmpeg) ffmpeg.placeholder = '/opt/homebrew/bin/ffmpeg';
  const check = document.getElementById('settings-check-update');
  if (check) {
    check.textContent = t('mac.downloads');
    check.onclick = () => window.__TAURI__?.shell?.open('https://github.com/RailgunHamster/RHFiles/actions/workflows/macos.yml');
  }
}

function macNativeDropTarget(element) {
  if (!element || element.closest('.overlay, .dialog-overlay, dialog[open], .context-menu')) return null;
  const side = sidebarDropDestination(element);
  if (side) return {path:side.path, entries:[], isRight:false};
  const tab = element.closest('.tab[data-tab-id]');
  const isRight = tab ? tab.dataset.pane === 'right' : !!element.closest('#right-panel, #right-file-list');
  const pane = tab ? (isRight ? getRightTab(Number(tab.dataset.tabId)) : getTab(Number(tab.dataset.tabId))) : (isRight ? G.rp : getTab());
  if (!tab && !element.closest('#file-list, #right-file-list')) return null;
  if (!pane || pane.archivePath || !String(pane.path).startsWith('/')) return null;
  const row = element.closest('[data-index]');
  const entry = row ? pane.entries?.[Number(row.dataset.index)] : null;
  return {path:entry?.is_dir ? entry.path : pane.path, entries:entry?.is_dir ? [] : pane.entries, isRight};
}

async function initMacNativeDrops() {
  if (!IS_MAC || !window.__TAURI__?.event?.listen) return;
  const listen = window.__TAURI__.event.listen;
  const at = event => {
    const p = event.payload?.position;
    const scale = window.devicePixelRatio || 1;
    return p ? document.elementFromPoint(p.x / scale, p.y / scale) : null;
  };
  await listen('tauri://drag-over', event => {
    const tab = at(event)?.closest('.tab[data-tab-id]');
    if (tab) scheduleFileDragTabSwitch(tab, tab.dataset.pane === 'right');
    else clearFileDragTabHover();
  });
  await listen('tauri://drag-leave', () => clearFileDragTabHover());
  await listen('tauri://drag-drop', async event => {
    clearFileDragTabHover();
    const target = macNativeDropTarget(at(event));
    const paths = event.payload?.paths?.filter(path => typeof path === 'string' && path.startsWith('/')) || [];
    if (!target || !paths.length) return;
    try { await handleRhfilesFileDrop({kind:'rhfiles-file-drag', paths}, target.path, target.entries, target.isRight); }
    catch (error) { showNotice(String(error)); }
  });
}

if (IS_MAC) initMacNativeDrops().catch(error => console.error('Finder drag integration:', error));
