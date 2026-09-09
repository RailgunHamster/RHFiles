// integration.js — opt-in Windows file-dialog / Explorer folder synchronization

let _fileDialogIntegrationSyncTimer = null;
let _fileDialogIntegrationRequestToken = 0;

function activeIntegrationFolder() {
  const pane = G.dualOn && G.lastActivePane === 'right' ? G.rp : getTab();
  const raw = String(pane?.path || '').trim();
  if (!raw || raw.includes('://')) return null;
  const normalized = normalizeWindowsPathInput(raw);
  if (/^[a-z]:[\\/]/i.test(normalized) || /^\\\\[^\\]/.test(normalized)) {
    return normalized;
  }
  return null;
}

function fileDialogIntegrationLocations() {
  const locations = [];
  const addTabs = (tabs, pane, activeId, paneActive) => {
    (tabs || []).forEach((tab, tabIndex) => {
      const raw = String(tab?.path || '').trim();
      if (!raw || raw.includes('://')) return;
      const path = normalizeWindowsPathInput(raw);
      if (!/^[a-z]:[\\/]/i.test(path) && !/^\\\\[^\\]/.test(path)) return;
      locations.push({
        id: `${G.windowLabel || 'main'}:${pane}:${tab.id ?? tabIndex}`,
        pane,
        tabIndex,
        path,
        active: paneActive && tab.id === activeId,
        pinned: tab.pinned === true,
      });
    });
  };

  const rightActive = G.dualOn && G.lastActivePane === 'right';
  addTabs(G.tabs, 'left', G.activeTab, !rightActive);
  if (G.dualOn) addTabs(G.rpTabs, 'right', G.activeRpTab, rightActive);
  return locations;
}

function fileDialogIntegrationShortcuts() {
  const shortcuts = getShortcutBindings()?.['integration.quickSwitch'];
  return Array.isArray(shortcuts) ? shortcuts.filter(Boolean) : [];
}

function renderFileDialogIntegrationStatus() {
  const statusElement = document.getElementById('settings-integration-status');
  const shortcutElement = document.getElementById('settings-integration-shortcut');
  if (shortcutElement) {
    shortcutElement.textContent = fileDialogIntegrationShortcuts().join(' / ') || t('settings.integrationNoShortcut');
  }
  if (!statusElement) return;

  const enabled = G.settings.fileDialogIntegrationEnabled === true;
  const status = G._fileDialogIntegrationStatus;
  const error = G._fileDialogIntegrationError;
  statusElement.classList.toggle('error', !!error);
  if (error) {
    statusElement.textContent = t('settings.integrationStatusError', { error });
  } else if (!enabled) {
    statusElement.textContent = t('settings.integrationStatusDisabled');
  } else if (!status?.pathAvailable) {
    statusElement.textContent = t('settings.integrationStatusNoFolder');
  } else if (status.running) {
    statusElement.textContent = t('settings.integrationStatusReady', {
      count: status.locationCount || fileDialogIntegrationLocations().length,
    });
    statusElement.title = status.currentPath || '';
  } else {
    statusElement.textContent = t('settings.integrationStatusStarting');
  }
}

async function syncFileDialogIntegration(force = false) {
  if (!force && !document.hasFocus()) return G._fileDialogIntegrationStatus || null;
  const token = ++_fileDialogIntegrationRequestToken;
  try {
    const status = await call('configure_file_dialog_integration', {
      enabled: G.settings.fileDialogIntegrationEnabled === true,
      locations: fileDialogIntegrationLocations(),
      shortcuts: fileDialogIntegrationShortcuts(),
      locale: G.settings.language || document.documentElement.lang || 'en',
    });
    if (token !== _fileDialogIntegrationRequestToken) return status;
    G._fileDialogIntegrationStatus = status;
    G._fileDialogIntegrationError = '';
    renderFileDialogIntegrationStatus();
    return status;
  } catch (error) {
    if (token !== _fileDialogIntegrationRequestToken) return null;
    G._fileDialogIntegrationError = String(error);
    renderFileDialogIntegrationStatus();
    throw error;
  }
}

function scheduleFileDialogIntegrationSync(force = false) {
  if (!force && !document.hasFocus()) return;
  clearTimeout(_fileDialogIntegrationSyncTimer);
  _fileDialogIntegrationSyncTimer = setTimeout(() => {
    syncFileDialogIntegration(force).catch(() => {});
  }, 80);
}

async function setFileDialogIntegrationEnabled(enabled) {
  G.settings.fileDialogIntegrationEnabled = !!enabled;
  saveSettings();
  try {
    await syncFileDialogIntegration(true);
    showNotice(t(enabled ? 'notice.integrationEnabled' : 'notice.integrationDisabled'));
  } catch (error) {
    G.settings.fileDialogIntegrationEnabled = false;
    saveSettings();
    const checkbox = document.getElementById('settings-integration-enabled');
    if (checkbox) checkbox.checked = false;
  }
  renderFileDialogIntegrationStatus();
}

function openIntegrationShortcutSettings() {
  switchSettingsSection('shortcuts');
  requestAnimationFrame(() => {
    const input = document.querySelector('.shortcut-key-input[data-action="integration.quickSwitch"]');
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input?.classList.add('shortcut-attention');
    setTimeout(() => input?.classList.remove('shortcut-attention'), 1600);
  });
}


window.addEventListener('storage', event => {
  if (event.key !== 'rhfiles-settings') return;
  const latest = loadSettings();
  Object.assign(G.settings, latest);
  scheduleFileDialogIntegrationSync(true);
});
