/* Thin bridge to the Rust backend.
 *
 * Every backend call goes through `invoke()` so there is exactly one place that
 * knows how the frontend talks to Tauri, and exactly one place that reports a
 * command failure to the user. */

const api = (() => {
  const listeners = new Set();
  let nativeId = 0;
  const nativePending = new Map();
  function nativeCall(command, args = {}) {
    const bridge = window.RHFilesNative;
    if (!bridge) return Promise.reject(new Error('本版本或系统 WebView 暂不支持此系统操作'));
    bridge.onmessage = (event) => {
      let response;
      try { response = JSON.parse(event.data); } catch { return; }
      const pending = nativePending.get(response.id);
      if (!pending) return;
      nativePending.delete(response.id); clearTimeout(pending.timer);
      if (response.error) pending.reject(new Error(response.error)); else pending.resolve(response.result);
    };
    return new Promise((resolve, reject) => {
      const id = ++nativeId;
      const timer = setTimeout(() => { nativePending.delete(id); reject(new Error('系统操作未响应')); }, 8000);
      nativePending.set(id, { resolve, reject, timer });
      try { bridge.postMessage(JSON.stringify({ id, command, args })); }
      catch (error) { clearTimeout(timer); nativePending.delete(id); reject(error); }
    });
  }

  /**
   * Locates the IPC entry point.
   *
   * Tauri 2 injects `__TAURI_INTERNALS__.invoke` into every WebView, but only
   * exposes the friendlier `window.__TAURI__.core.invoke` namespace when the
   * config sets `app.withGlobalTauri`. Relying on the latter alone is what made
   * the first device build show an empty list: the page loaded, every call
   * rejected with "Tauri IPC is unavailable", and nothing said why.
   *
   * Resolved on every call rather than captured once, so a harness that swaps the
   * bridge after load takes effect, and so both shapes work.
   */
  function bridge() {
    const internals = window.__TAURI_INTERNALS__;
    if (internals && typeof internals.invoke === 'function') return internals.invoke.bind(internals);
    const global = window.__TAURI__;
    if (global && global.core && typeof global.core.invoke === 'function') return global.core.invoke;
    return null;
  }

  /** `true` when a backend is reachable at all; used by the boot screen. */
  function available() {
    return bridge() !== null;
  }

  function invoke(command, args) {
    const call = bridge();
    if (!call) {
      return Promise.reject(new Error('the app backend is not reachable from this page'));
    }
    return call(command, args || {});
  }

  function onError(handler) {
    listeners.add(handler);
    return () => listeners.delete(handler);
  }

  function report(command, error) {
    const message = typeof error === 'string' ? error : (error && error.message) || String(error);
    for (const handler of listeners) handler(command, message);
  }

  function wrap(command) {
    return (args) => invoke(command, args).catch((error) => {
      report(command, error);
      throw error;
    });
  }

  /**
   * Android package id, hard-coded because it is also the value in
   * tauri.conf.json (`identifier`). Used to build `package:` intent URIs.
   */
  const ANDROID_PACKAGE = 'com.railgunhamster.rhfiles';

  /**
   * Opens a system settings screen for this app.
   *
   * An `intent:` URI navigated from the WebView is handed to Android, which is
   * the documented way for a WebView-based app to reach its own settings without
   * a native bridge. `ACTION_APPLICATION_DETAILS_SETTINGS` is used rather than
   * the Android-11-specific "all files access" screen because it exists on every
   * API level this app supports and always contains the permission toggles.
   */
  function openAppSettings() {
    if (window.RHFilesNative) return nativeCall('settings');
    const uri = `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;` +
      `data=package:${ANDROID_PACKAGE};end`;
    try {
      window.location.href = uri;
      return Promise.resolve(true);
    } catch (error) {
      return Promise.reject(new Error(error && error.message ? error.message : 'intent was refused'));
    }
  }

  return {
    onError,
    raw: invoke,
    available,
    appInfo: wrap('app_info'),
    openAppSettings,
    nativeAvailable: () => !!window.RHFilesNative,
    systemOpen: (path) => nativeCall('open', { path }),
    shareFile: (path) => nativeCall('share', { path }),
    systemTheme: (dark) => window.RHFilesNative ? nativeCall('theme', { dark }) : Promise.resolve(),

    // Device
    storageRoots: wrap('get_storage_roots'),
    async permissionStatus() {
      const status = await invoke('get_permission_status');
      if (window.RHFilesNative) status.manageExternalStorage = await nativeCall('permission');
      return status;
    },
    scanStorageSizes: wrap('scan_storage_sizes'),

    // Filesystem
    listDir: wrap('list_dir'),
    createDirectory: wrap('create_directory'),
    createFile: wrap('create_file'),
    renameEntry: wrap('rename_entry'),
    deleteEntries: wrap('delete_entries'),
    copyEntries: wrap('copy_entries'),
    moveEntries: wrap('move_entries'),
    entryExists: wrap('entry_exists'),
    readTextPreview: wrap('read_text_preview'),
    fileHash: wrap('file_hash'),
    readThumbnail: wrap('read_thumbnail'),

    // Index
    indexStart: wrap('index_start'),
    indexStop: wrap('index_stop'),
    indexClear: wrap('index_clear'),
    indexStatus: wrap('index_status'),
    searchFiles: wrap('search_files'),
    browseLibrary: wrap('browse_library'),
    assetUrl(path) {
      const convert = window.__TAURI_INTERNALS__?.convertFileSrc || window.__TAURI__?.core?.convertFileSrc;
      if (!convert) throw new Error('本版本未提供媒体文件访问接口');
      return convert(path, 'asset');
    },

    // Reverse server (phone as a file source for a PC)
    serverStatus: wrap('get_reverse_server_status'),
    serverStart: wrap('start_reverse_server'),
    serverStop: wrap('stop_reverse_server'),

    // Diagnostics
    logs: wrap('get_logs'),
    clearLogs: wrap('clear_logs'),

    /**
     * Writes a line into the backend diagnostics log. Used at the few points
     * where a silent failure would leave no trace at all: the boot path and every
     * directory listing. Never throws — a debugging aid must not break the
     * feature it is meant to observe.
     */
    note(scope, message) {
      return invoke('debug_note', { scope: String(scope), message: String(message) })
        .catch(() => undefined);
    },
  };
})();
