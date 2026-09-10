use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ptr;
#[cfg(test)]
use std::sync::atomic::AtomicU8;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::mpsc::{self, SyncSender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};
use windows::Win32::Foundation::{
    GlobalFree, HANDLE, HINSTANCE, HWND, LPARAM, LRESULT, RECT, RPC_E_CHANGED_MODE, WPARAM,
};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromWindow,
};
use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_APARTMENTTHREADED, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
    CoUninitialize, IDataObject, IServiceProvider,
};
use windows::Win32::System::DataExchange::{
    CloseClipboard, CountClipboardFormats, EmptyClipboard, GetClipboardSequenceNumber,
    OpenClipboard, SetClipboardData,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock};
use windows::Win32::System::Ole::{
    CF_UNICODETEXT, IOleWindow, OleGetClipboard, OleInitialize, OleSetClipboard, OleUninitialize,
};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationValuePattern,
    TreeScope_Descendants, UIA_AutomationIdPropertyId, UIA_EditControlTypeId, UIA_ValuePatternId,
};
#[cfg(test)]
use windows::Win32::UI::Accessibility::{
    IUIAutomationInvokePattern, IUIAutomationSelectionItemPattern, TreeScope_Children,
    UIA_InvokePatternId, UIA_NamePropertyId, UIA_SelectionItemPatternId,
};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT,
    KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, SendInput, VIRTUAL_KEY, VK_BACK, VK_CONTROL, VK_D,
    VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_HOME, VK_INSERT, VK_L, VK_LEFT, VK_LWIN, VK_MENU,
    VK_OEM_1, VK_OEM_2, VK_OEM_3, VK_OEM_4, VK_OEM_5, VK_OEM_6, VK_OEM_7, VK_OEM_COMMA,
    VK_OEM_MINUS, VK_OEM_PERIOD, VK_OEM_PLUS, VK_RETURN, VK_RIGHT, VK_RWIN, VK_SHIFT, VK_SPACE,
    VK_TAB, VK_UP,
};
use windows::Win32::UI::Shell::{
    IShellBrowser, IShellWindows, IWebBrowser2, SID_STopLevelBrowser, ShellWindows,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, EnumChildWindows, GetClassNameW, GetForegroundWindow,
    GetMessageW, GetWindowRect, GetWindowThreadProcessId, HC_ACTION, HWND_TOPMOST, IsWindow,
    IsWindowVisible, KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG, SW_HIDE, SW_SHOWNOACTIVATE,
    SWP_NOACTIVATE, SWP_SHOWWINDOW, SetForegroundWindow, SetWindowPos, SetWindowsHookExW,
    ShowWindow, TranslateMessage, UnhookWindowsHookEx, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP,
    WM_SYSKEYDOWN, WM_SYSKEYUP,
};
use windows_core::{BOOL, BSTR, Interface};

const INPUT_MARKER: usize = 0x5248_4649;
#[cfg(test)]
const TEST_INPUT_MARKER: usize = 0x5248_5445;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Hotkey {
    ctrl: bool,
    shift: bool,
    alt: bool,
    key: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDialogLocation {
    id: String,
    #[serde(default)]
    window_label: String,
    pane: String,
    tab_index: usize,
    path: String,
    active: bool,
    pinned: bool,
}

#[derive(Clone)]
struct WindowLocations {
    locations: Vec<FileDialogLocation>,
}

#[derive(Clone, Default)]
struct IntegrationConfig {
    enabled: bool,
    windows: HashMap<String, WindowLocations>,
    locale: String,
    hotkeys: Vec<Hotkey>,
    shortcut_labels: Vec<String>,
    rejected_shortcuts: Vec<String>,
}

#[derive(Debug)]
struct PickerRequest {
    hwnd: usize,
    trigger_key: u32,
}

#[derive(Debug, Default)]
struct DialogEvidence {
    has_shell_view: bool,
    has_direct_ui: bool,
    has_list_view: bool,
    has_edit: bool,
    has_combo: bool,
    has_button: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDialogIntegrationStatus {
    enabled: bool,
    running: bool,
    path_available: bool,
    current_path: Option<String>,
    location_count: usize,
    registered_shortcuts: Vec<String>,
    rejected_shortcuts: Vec<String>,
    supported_targets: Vec<&'static str>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDialogPickerState {
    enabled: bool,
    target_available: bool,
    target_kind: &'static str,
    target_path: Option<String>,
    locale: String,
    compact: bool,
    locations: Vec<FileDialogLocation>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenExplorerLocationPayload {
    path: String,
    existing: bool,
    pane: Option<String>,
    tab_index: Option<usize>,
}

static CONFIG: OnceLock<Mutex<IntegrationConfig>> = OnceLock::new();
static HOOK_START_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static HOOK_RUNNING: AtomicBool = AtomicBool::new(false);
static MONITOR_START_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);
static CONSUMED_KEY: AtomicU32 = AtomicU32::new(0);
static ACTIVE_TARGET: AtomicUsize = AtomicUsize::new(0);
static DISMISSED_TARGET: AtomicUsize = AtomicUsize::new(0);
static PICKER_COMPACT: AtomicBool = AtomicBool::new(false);
#[cfg(test)]
static LAST_NAVIGATION_METHOD: AtomicU8 = AtomicU8::new(0);
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static ACTION_SENDER: OnceLock<SyncSender<PickerRequest>> = OnceLock::new();

fn config() -> &'static Mutex<IntegrationConfig> {
    CONFIG.get_or_init(|| Mutex::new(IntegrationConfig::default()))
}

fn lock_config() -> std::sync::MutexGuard<'static, IntegrationConfig> {
    config()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn action_sender() -> &'static SyncSender<PickerRequest> {
    ACTION_SENDER.get_or_init(|| {
        let (sender, receiver) = mpsc::sync_channel::<PickerRequest>(4);
        thread::Builder::new()
            .name("rhfiles-dialog-picker-shortcut".to_string())
            .spawn(move || {
                while let Ok(request) = receiver.recv() {
                    if wait_for_trigger_release(request.trigger_key) {
                        DISMISSED_TARGET.store(0, Ordering::Release);
                        show_picker_for(request.hwnd, true);
                    }
                }
            })
            .expect("failed to start file-dialog picker shortcut worker");
        sender
    })
}

fn all_locations(snapshot: &IntegrationConfig) -> Vec<FileDialogLocation> {
    let mut windows = snapshot.windows.iter().collect::<Vec<_>>();
    windows.sort_by(|(left_label, _), (right_label, _)| {
        let left_main = left_label.as_str() == "main";
        let right_main = right_label.as_str() == "main";
        right_main
            .cmp(&left_main)
            .then_with(|| left_label.cmp(right_label))
    });
    windows
        .into_iter()
        .flat_map(|(_, window)| window.locations.iter().cloned())
        .collect()
}

fn active_location(snapshot: &IntegrationConfig) -> Option<String> {
    let locations = all_locations(snapshot);
    locations
        .iter()
        .find(|location| location.active)
        .or_else(|| locations.first())
        .map(|location| location.path.clone())
}

fn normalize_folder_path(path: Option<String>) -> Option<String> {
    let raw = path?;
    let raw = raw.trim();
    if raw.is_empty() || raw.contains("://") {
        return None;
    }
    let mut value = raw.replace('/', "\\");
    let bytes = value.as_bytes();
    let is_drive = bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':';
    let is_unc = value.starts_with("\\\\") && value.len() > 2;
    if !is_drive && !is_unc {
        return None;
    }
    if value.len() == 2 && is_drive {
        value.push('\\');
    }
    Some(value)
}

fn same_windows_folder(left: &str, right: &str) -> bool {
    let comparison_key = |value: &str| {
        normalize_folder_path(Some(value.to_string()))
            .map(|path| path.trim_end_matches('\\').to_ascii_lowercase())
    };
    let Some(left_key) = comparison_key(left) else {
        return false;
    };
    let Some(right_key) = comparison_key(right) else {
        return false;
    };
    if left_key == right_key {
        return true;
    }

    // Explorer and WebView APIs may expose the same folder through a DOS 8.3
    // alias (for example ADMINI~1) and a long path. Only pay the filesystem
    // resolution cost after the cheap case-insensitive comparison misses.
    let canonical_key = |value: &str| {
        std::fs::canonicalize(value)
            .ok()
            .and_then(|path| comparison_key(&path.to_string_lossy()))
    };
    canonical_key(left).is_some_and(|left| canonical_key(right).as_ref() == Some(&left))
}

fn parse_hotkey(raw: &str) -> Option<Hotkey> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }

    let plus_key = raw.ends_with("++");
    let mut parts: Vec<&str> = raw.split('+').filter(|part| !part.is_empty()).collect();
    if plus_key {
        parts.push("+");
    }

    let mut hotkey = Hotkey {
        ctrl: false,
        shift: false,
        alt: false,
        key: 0,
    };
    for part in parts {
        match part.trim().to_ascii_lowercase().as_str() {
            "ctrl" | "control" => hotkey.ctrl = true,
            "shift" => hotkey.shift = true,
            "alt" => hotkey.alt = true,
            key if hotkey.key == 0 => hotkey.key = key_name_to_vk(key)?,
            _ => return None,
        }
    }

    // A bare printable key would interfere with typing even though the hook is
    // scoped to Explorer and file dialogs. Require an explicit modifier.
    if hotkey.key == 0 || (!hotkey.ctrl && !hotkey.shift && !hotkey.alt) {
        return None;
    }
    Some(hotkey)
}

fn key_name_to_vk(key: &str) -> Option<u32> {
    if key.len() == 1 {
        let byte = key.as_bytes()[0];
        if byte.is_ascii_alphabetic() {
            return Some(byte.to_ascii_uppercase() as u32);
        }
        if byte.is_ascii_digit() {
            return Some(byte as u32);
        }
    }
    if let Some(number) = key
        .strip_prefix('f')
        .and_then(|value| value.parse::<u32>().ok())
        && (1..=24).contains(&number)
    {
        return Some(0x70 + number - 1);
    }
    Some(match key {
        "space" => VK_SPACE.0 as u32,
        "tab" => VK_TAB.0 as u32,
        "backspace" => VK_BACK.0 as u32,
        "escape" | "esc" => VK_ESCAPE.0 as u32,
        "enter" | "return" => VK_RETURN.0 as u32,
        "delete" => VK_DELETE.0 as u32,
        "insert" => VK_INSERT.0 as u32,
        "home" => VK_HOME.0 as u32,
        "end" => VK_END.0 as u32,
        "arrowleft" | "left" => VK_LEFT.0 as u32,
        "arrowright" | "right" => VK_RIGHT.0 as u32,
        "arrowup" | "up" => VK_UP.0 as u32,
        "arrowdown" | "down" => VK_DOWN.0 as u32,
        "," => VK_OEM_COMMA.0 as u32,
        "." => VK_OEM_PERIOD.0 as u32,
        ";" => VK_OEM_1.0 as u32,
        "/" => VK_OEM_2.0 as u32,
        "`" => VK_OEM_3.0 as u32,
        "[" => VK_OEM_4.0 as u32,
        "\\" => VK_OEM_5.0 as u32,
        "]" => VK_OEM_6.0 as u32,
        "'" => VK_OEM_7.0 as u32,
        "-" => VK_OEM_MINUS.0 as u32,
        "=" | "+" => VK_OEM_PLUS.0 as u32,
        _ => return None,
    })
}

fn is_key_down(key: VIRTUAL_KEY) -> bool {
    // The high bit reports the physical down state and is not affected by lock keys.
    unsafe { GetAsyncKeyState(key.0 as i32) < 0 }
}

fn modifiers_match(hotkey: Hotkey) -> bool {
    hotkey.ctrl == is_key_down(VK_CONTROL)
        && hotkey.shift == is_key_down(VK_SHIFT)
        && hotkey.alt == is_key_down(VK_MENU)
}

fn window_class(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let length = unsafe { GetClassNameW(hwnd, &mut buffer) };
    String::from_utf16_lossy(&buffer[..length.max(0) as usize])
}

unsafe extern "system" fn collect_dialog_evidence(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let evidence = unsafe { &mut *(lparam.0 as *mut DialogEvidence) };
    match window_class(hwnd).to_ascii_lowercase().as_str() {
        "shelldll_defview" => evidence.has_shell_view = true,
        "directuihwnd" | "duiviewwndclassname" => evidence.has_direct_ui = true,
        "syslistview32" => evidence.has_list_view = true,
        "edit" => evidence.has_edit = true,
        "combobox" | "comboboxex32" => evidence.has_combo = true,
        "button" => evidence.has_button = true,
        _ => {}
    }
    BOOL::from(true)
}

fn is_supported_window_shape(top_class: &str, evidence: &DialogEvidence) -> bool {
    match top_class.to_ascii_lowercase().as_str() {
        "cabinetwclass" | "explorewclass" => true,
        "#32770" => {
            evidence.has_shell_view
                || (evidence.has_button
                    && ((evidence.has_direct_ui && (evidence.has_edit || evidence.has_combo))
                        || (evidence.has_list_view && evidence.has_edit)))
        }
        _ => false,
    }
}

fn is_supported_window(hwnd: HWND) -> bool {
    if hwnd.0.is_null() || !unsafe { IsWindow(Some(hwnd)) }.as_bool() {
        return false;
    }
    let top_class = window_class(hwnd);
    if matches!(
        top_class.to_ascii_lowercase().as_str(),
        "cabinetwclass" | "explorewclass"
    ) {
        return true;
    }
    if top_class != "#32770" {
        return false;
    }

    let mut evidence = DialogEvidence::default();
    unsafe {
        let _ = EnumChildWindows(
            Some(hwnd),
            Some(collect_dialog_evidence),
            LPARAM((&mut evidence as *mut DialogEvidence) as isize),
        );
    }
    is_supported_window_shape(&top_class, &evidence)
}

fn supported_foreground_window() -> Option<HWND> {
    let hwnd = unsafe { GetForegroundWindow() };
    is_supported_window(hwnd).then_some(hwnd)
}

unsafe extern "system" fn keyboard_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code != HC_ACTION as i32 || lparam.0 == 0 {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }
    let event = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
    #[cfg(test)]
    let is_test_input = event.dwExtraInfo == TEST_INPUT_MARKER;
    #[cfg(not(test))]
    let is_test_input = false;
    if !is_test_input && (event.flags.contains(LLKHF_INJECTED) || event.dwExtraInfo == INPUT_MARKER)
    {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }

    let message = wparam.0 as u32;
    if message == WM_KEYUP || message == WM_SYSKEYUP {
        if CONSUMED_KEY
            .compare_exchange(event.vkCode, 0, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            return LRESULT(1);
        }
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }
    if message != WM_KEYDOWN && message != WM_SYSKEYDOWN {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }
    if CONSUMED_KEY.load(Ordering::Acquire) == event.vkCode {
        return LRESULT(1);
    }

    let snapshot = lock_config().clone();
    if !snapshot.enabled {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }
    if !snapshot
        .hotkeys
        .iter()
        .copied()
        .any(|hotkey| hotkey.key == event.vkCode && modifiers_match(hotkey))
    {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }
    let Some(hwnd) = supported_foreground_window() else {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    };

    if action_sender()
        .try_send(PickerRequest {
            hwnd: hwnd.0 as usize,
            trigger_key: event.vkCode,
        })
        .is_ok()
    {
        CONSUMED_KEY.store(event.vkCode, Ordering::Release);
        LRESULT(1)
    } else {
        unsafe { CallNextHookEx(None, code, wparam, lparam) }
    }
}

fn ensure_hook_started() -> Result<(), String> {
    if HOOK_RUNNING.load(Ordering::Acquire) {
        return Ok(());
    }
    let _guard = HOOK_START_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if HOOK_RUNNING.load(Ordering::Acquire) {
        return Ok(());
    }

    let (startup_sender, startup_receiver) = mpsc::sync_channel(1);
    thread::Builder::new()
        .name("rhfiles-dialog-hook".to_string())
        .spawn(move || hook_message_loop(startup_sender))
        .map_err(|error| format!("Unable to start integration worker: {error}"))?;
    startup_receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "The integration worker did not start in time".to_string())?
}

fn hook_message_loop(startup_sender: SyncSender<Result<(), String>>) {
    let module = match unsafe { GetModuleHandleW(None) } {
        Ok(module) => HINSTANCE(module.0),
        Err(error) => {
            let _ = startup_sender.send(Err(format!(
                "Unable to identify the RHFiles process module: {error}"
            )));
            return;
        }
    };
    let hook =
        match unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), Some(module), 0) } {
            Ok(hook) => hook,
            Err(error) => {
                let _ = startup_sender.send(Err(format!(
                    "Unable to install the Windows keyboard hook: {error}"
                )));
                return;
            }
        };
    let _ = action_sender();
    HOOK_RUNNING.store(true, Ordering::Release);
    let _ = startup_sender.send(Ok(()));

    let mut message = MSG::default();
    loop {
        let result = unsafe { GetMessageW(&mut message, None, 0, 0) };
        if result.0 <= 0 {
            break;
        }
        unsafe {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
    let _ = unsafe { UnhookWindowsHookEx(hook) };
    HOOK_RUNNING.store(false, Ordering::Release);
}

fn picker_hwnd() -> Option<HWND> {
    let app = APP_HANDLE.get()?;
    let window = app.get_webview_window("integration-picker")?;
    let raw = window.hwnd().ok()?;
    Some(HWND(raw.0))
}

fn ensure_picker_window() -> Result<(), String> {
    let app = APP_HANDLE
        .get()
        .ok_or_else(|| "RHFiles is not ready to create the location picker".to_string())?;
    if app.get_webview_window("integration-picker").is_some() {
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        "integration-picker",
        tauri::WebviewUrl::App("integration-picker.html".into()),
    )
    .title("RHFiles Locations")
    .inner_size(370.0, 320.0)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .shadow(true)
    .build()
    .map(|_| ())
    .map_err(|error| format!("Unable to create the RHFiles location picker: {error}"))
}

fn target_kind(hwnd: HWND) -> &'static str {
    match window_class(hwnd).to_ascii_lowercase().as_str() {
        "cabinetwclass" | "explorewclass" => "windowsExplorer",
        "#32770" => "windowsFileDialog",
        _ => "",
    }
}

fn prune_closed_window_locations() -> bool {
    let Some(app) = APP_HANDLE.get() else {
        return false;
    };
    let mut snapshot = lock_config();
    let previous = snapshot.windows.len();
    snapshot
        .windows
        .retain(|label, _| app.get_webview_window(label).is_some());
    previous != snapshot.windows.len()
}

fn picker_state() -> FileDialogPickerState {
    let _ = prune_closed_window_locations();
    let snapshot = lock_config().clone();
    let locations = all_locations(&snapshot);
    let target = ACTIVE_TARGET.load(Ordering::Acquire);
    let target = HWND(target as *mut core::ffi::c_void);
    let target_available = is_supported_window(target);
    let target_kind = if target_available {
        target_kind(target)
    } else {
        ""
    };
    FileDialogPickerState {
        enabled: snapshot.enabled,
        target_available,
        target_kind,
        target_path: None,
        locale: snapshot.locale,
        compact: PICKER_COMPACT.load(Ordering::Acquire),
        locations,
    }
}

fn emit_picker_state() {
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit_to(
            "integration-picker",
            "file-dialog-picker-state",
            picker_state(),
        );
    }
}

fn hide_picker_native() {
    if let Some(hwnd) = picker_hwnd() {
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
    }
}

fn position_picker(target: HWND, picker: HWND) -> bool {
    let mut target_rect = RECT::default();
    if unsafe { GetWindowRect(target, &mut target_rect) }.is_err() {
        return false;
    }

    let monitor = unsafe { MonitorFromWindow(target, MONITOR_DEFAULTTONEAREST) };
    if monitor.0.is_null() {
        return false;
    }
    let mut monitor_info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if !unsafe { GetMonitorInfoW(monitor, &mut monitor_info) }.as_bool() {
        return false;
    }

    let location_count = lock_config()
        .windows
        .values()
        .map(|window| window.locations.len())
        .sum::<usize>();
    let row_count = location_count.clamp(1, 7) as i32;
    let compact = PICKER_COMPACT.load(Ordering::Acquire);
    let dpi = unsafe { GetDpiForWindow(target) }.max(96) as i32;
    let scaled = |logical: i32| logical.saturating_mul(dpi) / 96;
    let width = scaled(if compact { 310 } else { 370 });
    let logical_height = if compact {
        (48 + row_count * 39).clamp(112, 350)
    } else {
        (106 + row_count * 48).clamp(174, 462)
    };
    let height = scaled(logical_height);
    let gap = scaled(10);
    let work = monitor_info.rcWork;

    let x = if work.right - target_rect.right >= width + gap {
        target_rect.right + gap
    } else if target_rect.left - work.left >= width + gap {
        target_rect.left - width - gap
    } else {
        (target_rect.right - width - scaled(18)).clamp(work.left, work.right - width)
    };
    let y = target_rect
        .top
        .clamp(work.top, (work.bottom - height).max(work.top));

    unsafe {
        SetWindowPos(
            picker,
            Some(HWND_TOPMOST),
            x,
            y,
            width,
            height,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        )
        .is_ok()
    }
}

fn show_picker_for(target_value: usize, activate: bool) {
    let target = HWND(target_value as *mut core::ffi::c_void);
    if !lock_config().enabled || !is_supported_window(target) {
        return;
    }
    let Some(picker) = picker_hwnd() else {
        return;
    };
    let locations_changed = prune_closed_window_locations();
    let previous = ACTIVE_TARGET.swap(target_value, Ordering::AcqRel);
    if previous != target_value || locations_changed {
        emit_picker_state();
    }
    if !position_picker(target, picker) {
        return;
    }
    if activate {
        unsafe {
            let _ = ShowWindow(picker, SW_SHOWNOACTIVATE);
            let _ = SetForegroundWindow(picker);
        }
    }
}

fn monitor_picker() {
    MONITOR_RUNNING.store(true, Ordering::Release);
    let mut previous_foreground = 0usize;
    loop {
        let enabled = lock_config().enabled;
        if !enabled {
            if ACTIVE_TARGET.swap(0, Ordering::AcqRel) != 0 {
                emit_picker_state();
                hide_picker_native();
            }
            DISMISSED_TARGET.store(0, Ordering::Release);
            thread::sleep(Duration::from_millis(500));
            continue;
        }
        thread::sleep(Duration::from_millis(140));

        let foreground = unsafe { GetForegroundWindow() };
        let foreground_value = foreground.0 as usize;
        let picker = picker_hwnd();
        let picker_value = picker.map_or(0, |hwnd| hwnd.0 as usize);
        let active_value = ACTIVE_TARGET.load(Ordering::Acquire);
        let active = HWND(active_value as *mut core::ffi::c_void);

        if foreground_value == picker_value && active_value != 0 && is_supported_window(active) {
            if let Some(picker) = picker {
                let _ = position_picker(active, picker);
            }
            previous_foreground = foreground_value;
            continue;
        }

        if is_supported_window(foreground) {
            if DISMISSED_TARGET.load(Ordering::Acquire) == foreground_value {
                hide_picker_native();
            } else {
                show_picker_for(foreground_value, false);
            }
            previous_foreground = foreground_value;
            continue;
        }

        if foreground_value != previous_foreground {
            DISMISSED_TARGET.store(0, Ordering::Release);
        }
        previous_foreground = foreground_value;
        hide_picker_native();
    }
}

pub fn initialize(app: tauri::AppHandle) -> Result<(), String> {
    let _ = APP_HANDLE.set(app);
    Ok(())
}

fn ensure_monitor_started() -> Result<(), String> {
    if MONITOR_RUNNING.load(Ordering::Acquire) {
        return Ok(());
    }
    let _guard = MONITOR_START_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if MONITOR_RUNNING.load(Ordering::Acquire) {
        return Ok(());
    }
    thread::Builder::new()
        .name("rhfiles-dialog-picker-monitor".to_string())
        .spawn(monitor_picker)
        .map_err(|error| format!("Unable to start the Windows integration monitor: {error}"))?;
    Ok(())
}

fn wait_for_trigger_release(trigger_key: u32) -> bool {
    let deadline = Instant::now() + Duration::from_millis(1500);
    loop {
        let trigger_is_down = unsafe { GetAsyncKeyState(trigger_key as i32) < 0 };
        let modifier_is_down = is_key_down(VK_CONTROL)
            || is_key_down(VK_SHIFT)
            || is_key_down(VK_MENU)
            || is_key_down(VK_LWIN)
            || is_key_down(VK_RWIN);
        if !trigger_is_down && !modifier_is_down {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        thread::sleep(Duration::from_millis(10));
    }
}

fn key_input(key: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    key_input_with_marker(key, flags, INPUT_MARKER)
}

fn key_input_with_marker(key: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS, marker: usize) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: marker,
            },
        },
    }
}

fn unicode_input(unit: u16, key_up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0),
                wScan: unit,
                dwFlags: if key_up {
                    KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
                } else {
                    KEYEVENTF_UNICODE
                },
                time: 0,
                dwExtraInfo: INPUT_MARKER,
            },
        },
    }
}

fn send_inputs(inputs: &[INPUT]) -> bool {
    unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) == inputs.len() as u32 }
}

struct IntegrationClipboardGuard;

impl IntegrationClipboardGuard {
    fn open() -> Option<Self> {
        for _ in 0..24 {
            if unsafe { OpenClipboard(None) }.is_ok() {
                return Some(Self);
            }
            thread::sleep(Duration::from_millis(4));
        }
        None
    }
}

impl Drop for IntegrationClipboardGuard {
    fn drop(&mut self) {
        let _ = unsafe { CloseClipboard() };
    }
}

fn publish_temporary_clipboard_text(text: &str, original: Option<&IDataObject>) -> Option<u32> {
    if text.contains('\0') {
        return None;
    }
    let wide = text
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let byte_len = wide.len().checked_mul(std::mem::size_of::<u16>())?;
    let memory = unsafe { GlobalAlloc(GMEM_MOVEABLE, byte_len) }.ok()?;
    let pointer = unsafe { GlobalLock(memory) };
    if pointer.is_null() {
        let _ = unsafe { GlobalFree(Some(memory)) };
        return None;
    }
    unsafe {
        ptr::copy_nonoverlapping(wide.as_ptr().cast::<u8>(), pointer.cast::<u8>(), byte_len);
        let _ = GlobalUnlock(memory);
    }
    let clipboard = match IntegrationClipboardGuard::open() {
        Some(clipboard) => clipboard,
        None => {
            let _ = unsafe { GlobalFree(Some(memory)) };
            return None;
        }
    };
    if unsafe { EmptyClipboard() }.is_err() {
        let _ = unsafe { GlobalFree(Some(memory)) };
        return None;
    }
    if unsafe { SetClipboardData(CF_UNICODETEXT.0 as u32, Some(HANDLE(memory.0))) }.is_err() {
        let _ = unsafe { GlobalFree(Some(memory)) };
        let failed_sequence = unsafe { GetClipboardSequenceNumber() };
        drop(clipboard);
        let _ = restore_temporary_clipboard(original, failed_sequence);
        return None;
    }
    let sequence = unsafe { GetClipboardSequenceNumber() };
    drop(clipboard);
    Some(sequence)
}

fn clear_temporary_clipboard(expected_sequence: u32) -> bool {
    if unsafe { GetClipboardSequenceNumber() } != expected_sequence {
        // The user or another application replaced our temporary value. Never
        // overwrite that newer clipboard content with the older snapshot.
        return true;
    }
    let Some(_clipboard) = IntegrationClipboardGuard::open() else {
        return false;
    };
    if unsafe { GetClipboardSequenceNumber() } != expected_sequence {
        return true;
    }
    unsafe { EmptyClipboard() }.is_ok()
}

fn restore_temporary_clipboard(original: Option<&IDataObject>, expected_sequence: u32) -> bool {
    for _ in 0..20 {
        if unsafe { GetClipboardSequenceNumber() } != expected_sequence {
            return true;
        }
        let restored = match original {
            Some(data) => unsafe { OleSetClipboard(data) }.is_ok(),
            None => clear_temporary_clipboard(expected_sequence),
        };
        if restored {
            return true;
        }
        thread::sleep(Duration::from_millis(5));
    }
    false
}

/// Pastes a complete path into the focused Windows location edit in one
/// operation. Chromium's virtualized dialog and modern Explorer can ignore a
/// UIA ValuePattern change intermittently, while a real paste reliably
/// notifies their internal navigation model. The previous clipboard object is
/// restored before returning.
fn wait_for_input_foreground(target: HWND, timeout: Duration) -> bool {
    if unsafe { GetForegroundWindow() } != target {
        let _ = unsafe { SetForegroundWindow(target) };
    }
    let deadline = Instant::now() + timeout;
    while unsafe { GetForegroundWindow() } != target && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    (unsafe { GetForegroundWindow() }) == target
}

fn paste_location_without_typing(target: HWND, path: &str) -> bool {
    struct OleGuard;
    impl Drop for OleGuard {
        fn drop(&mut self) {
            unsafe { OleUninitialize() };
        }
    }

    if unsafe { OleInitialize(None) }.is_err() {
        return false;
    }
    let _ole = OleGuard;
    if !wait_for_input_foreground(target, Duration::from_millis(700)) {
        return false;
    }
    // A browser prompt can steal focus while a newly-created file dialog is
    // publishing its UIA tree. Re-focus the dialog and its editable location
    // immediately before pasting, instead of trusting an earlier Ctrl+L.
    if !send_inputs(&[
        key_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_L, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_L, KEYEVENTF_KEYUP),
        key_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ]) {
        return false;
    }
    thread::sleep(Duration::from_millis(70));
    if !wait_for_input_foreground(target, Duration::from_millis(700)) {
        return false;
    }
    let original_format_count = unsafe { CountClipboardFormats() };
    let original = unsafe { OleGetClipboard() }.ok();
    if original_format_count > 0 && original.is_none() {
        return false;
    }
    let Some(temporary_sequence) = publish_temporary_clipboard_text(path, original.as_ref()) else {
        return false;
    };

    let paste_sent = wait_for_input_foreground(target, Duration::from_millis(700))
        && send_inputs(&[
            key_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
            key_input(VIRTUAL_KEY(b'A' as u16), KEYBD_EVENT_FLAGS(0)),
            key_input(VIRTUAL_KEY(b'A' as u16), KEYEVENTF_KEYUP),
            key_input(VIRTUAL_KEY(b'V' as u16), KEYBD_EVENT_FLAGS(0)),
            key_input(VIRTUAL_KEY(b'V' as u16), KEYEVENTF_KEYUP),
            key_input(VK_CONTROL, KEYEVENTF_KEYUP),
        ]);
    if paste_sent {
        // Paste is delivered synchronously to the focused edit, but the
        // dialog's navigation model processes the resulting change on its UI
        // queue. One frame keeps Enter ordered after that notification.
        thread::sleep(Duration::from_millis(140));
    }
    let confirm_sent = paste_sent
        && wait_for_input_foreground(target, Duration::from_millis(700))
        && send_inputs(&[
            key_input(VK_RETURN, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_RETURN, KEYEVENTF_KEYUP),
        ]);
    thread::sleep(Duration::from_millis(35));
    let restored = restore_temporary_clipboard(original.as_ref(), temporary_sequence);
    confirm_sent && restored
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum InstantAddressReplacement {
    AddressBar,
    DialogFileName,
}

fn explorer_browser_has_visible_view(browser: &IWebBrowser2) -> bool {
    unsafe {
        let Ok(provider) = browser.cast::<IServiceProvider>() else {
            return false;
        };
        let Ok(shell_browser) = provider.QueryService::<IShellBrowser>(&SID_STopLevelBrowser)
        else {
            return false;
        };
        let Ok(shell_view) = shell_browser.QueryActiveShellView() else {
            return false;
        };
        let Ok(ole_window) = shell_view.cast::<IOleWindow>() else {
            return false;
        };
        ole_window
            .GetWindow()
            .is_ok_and(|view_hwnd| IsWindowVisible(view_hwnd).as_bool())
    }
}

fn navigate_explorer_browser(browser: &IWebBrowser2, path: &str) -> Result<(), String> {
    let url = VARIANT::from(path);
    let empty = VARIANT::default();
    for attempt in 0..6 {
        let result = unsafe {
            browser.Navigate2(&url, Some(&empty), Some(&empty), Some(&empty), Some(&empty))
        };
        match result {
            Ok(()) => return Ok(()),
            Err(error) if error.code().0 as u32 == 0x8007_00aa && attempt < 5 => {
                // Explorer briefly reports ERROR_BUSY while the active tab is
                // completing its previous navigation. A short retry keeps a
                // deliberate second click from becoming a random failure.
                thread::sleep(Duration::from_millis(80));
            }
            Err(error) => return Err(format!("File Explorer rejected the folder: {error}")),
        }
    }
    unreachable!()
}

fn navigate_explorer_with_shell(hwnd: usize, path: &str) -> Result<bool, String> {
    struct ComGuard;
    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|error| format!("Unable to initialize Explorer automation: {error}"))?;
        let _guard = ComGuard;
        let windows: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_ALL)
            .map_err(|error| format!("Unable to enumerate File Explorer windows: {error}"))?;
        let count = windows.Count().map_err(|error| error.to_string())?;
        let mut matching_browsers = Vec::new();
        let mut visible_browsers = Vec::new();
        for index in 0..count {
            let Ok(dispatch) = windows.Item(&VARIANT::from(index)) else {
                continue;
            };
            let Ok(browser) = dispatch.cast::<IWebBrowser2>() else {
                continue;
            };
            let Ok(browser_hwnd) = browser.HWND() else {
                continue;
            };
            if browser_hwnd.0 as usize != hwnd {
                continue;
            }
            if explorer_browser_has_visible_view(&browser) {
                visible_browsers.push(browser.clone());
            }
            matching_browsers.push(browser);
        }

        // Windows 11 Explorer tabs share a CabinetWClass top-level HWND. ShellWindows
        // exposes one IWebBrowser2 per tab, so choosing the first matching HWND
        // always redirects the first tab. Its active Shell view is the only
        // visible view; use that entry when it is unambiguous.
        if visible_browsers.len() == 1 {
            navigate_explorer_browser(&visible_browsers[0], path)?;
            return Ok(true);
        }
        if matching_browsers.len() == 1 {
            navigate_explorer_browser(&matching_browsers[0], path)?;
            return Ok(true);
        }

        // If a future Explorer build stops exposing view visibility, returning
        // false deliberately selects the active-window address-bar fallback
        // below instead of ever redirecting an arbitrary background tab.
    }
    Ok(false)
}

fn set_focused_uia_edit_value(
    automation: &IUIAutomation,
    target_process_id: u32,
    value: &BSTR,
) -> Result<InstantAddressReplacement, String> {
    let element = unsafe { automation.GetFocusedElement() }
        .map_err(|error| format!("get focused UI element: {error}"))?;
    let process_id = unsafe { element.CurrentProcessId() }
        .map_err(|error| format!("read focused process: {error}"))?;
    if process_id != target_process_id as i32 {
        return Err(format!(
            "focused process {process_id} does not match target {target_process_id}"
        ));
    }
    if !unsafe { element.CurrentHasKeyboardFocus() }
        .map_err(|error| format!("read keyboard focus: {error}"))?
        .as_bool()
    {
        return Err("address element does not have keyboard focus".to_string());
    }
    let control_type = unsafe { element.CurrentControlType() }
        .map_err(|error| format!("read focused control type: {error}"))?;
    if control_type != UIA_EditControlTypeId {
        return Err(format!(
            "focused control type {} is not an edit",
            control_type.0
        ));
    }
    let pattern =
        unsafe { element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) }
            .map_err(|error| format!("get address value pattern: {error}"))?;
    if unsafe { pattern.CurrentIsReadOnly() }
        .map_err(|error| format!("read address mutability: {error}"))?
        .as_bool()
    {
        return Err("address value pattern is read-only".to_string());
    }
    unsafe { pattern.SetValue(value) }
        .map_err(|error| format!("replace address value: {error}"))?;
    let automation_id = unsafe { element.CurrentAutomationId() }
        .ok()
        .map(|value| value.to_string());
    Ok(if automation_id.as_deref() == Some("1148") {
        InstantAddressReplacement::DialogFileName
    } else {
        InstantAddressReplacement::AddressBar
    })
}

fn set_uia_element_value(element: &IUIAutomationElement, value: &BSTR) -> Result<(), String> {
    unsafe { element.SetFocus() }.map_err(|error| format!("focus address element: {error}"))?;
    let pattern =
        unsafe { element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) }
            .map_err(|error| format!("get address value pattern: {error}"))?;
    if unsafe { pattern.CurrentIsReadOnly() }
        .map_err(|error| format!("read address mutability: {error}"))?
        .as_bool()
    {
        return Err("address value pattern is read-only".to_string());
    }
    unsafe { pattern.SetValue(value) }.map_err(|error| format!("replace address value: {error}"))
}

fn modern_explorer_uia_address_element(
    automation: &IUIAutomation,
    target: HWND,
) -> Result<IUIAutomationElement, String> {
    let root = unsafe { automation.ElementFromHandle(target) }
        .map_err(|error| format!("get Explorer automation root: {error}"))?;
    let address_group_id = VARIANT::from(BSTR::from("PART_AutoSuggestBox"));
    let address_group_condition = unsafe {
        automation.CreatePropertyCondition(UIA_AutomationIdPropertyId, &address_group_id)
    }
    .map_err(|error| format!("create Explorer address-group condition: {error}"))?;
    let address_groups = unsafe { root.FindAll(TreeScope_Descendants, &address_group_condition) }
        .map_err(|error| format!("find Explorer address groups: {error}"))?;
    let text_box_id = VARIANT::from(BSTR::from("TextBox"));
    let text_box_condition =
        unsafe { automation.CreatePropertyCondition(UIA_AutomationIdPropertyId, &text_box_id) }
            .map_err(|error| format!("create Explorer address condition: {error}"))?;
    let mut addresses = Vec::new();
    let count = unsafe { address_groups.Length() }
        .map_err(|error| format!("count Explorer address groups: {error}"))?;
    for index in 0..count {
        let Ok(group) = (unsafe { address_groups.GetElement(index) }) else {
            continue;
        };
        let Ok(address) = (unsafe { group.FindFirst(TreeScope_Descendants, &text_box_condition) })
        else {
            continue;
        };
        if unsafe { address.CurrentHasKeyboardFocus() }.is_ok_and(|value| value.as_bool()) {
            return Ok(address);
        }
        addresses.push(address);
    }
    if addresses.len() == 1 {
        return Ok(addresses.remove(0));
    }
    Err(format!(
        "could not identify the focused Explorer address element (found {})",
        addresses.len()
    ))
}

fn set_modern_explorer_uia_address_value(
    automation: &IUIAutomation,
    target: HWND,
    value: &BSTR,
) -> Result<InstantAddressReplacement, String> {
    let address = modern_explorer_uia_address_element(automation, target)?;
    set_uia_element_value(&address, value)?;
    Ok(InstantAddressReplacement::AddressBar)
}

fn normalize_explorer_folder_value(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.to_ascii_lowercase().starts_with("file:") {
        return url::Url::parse(raw)
            .ok()?
            .to_file_path()
            .ok()
            .and_then(|path| normalize_folder_path(Some(path.to_string_lossy().into_owned())));
    }
    normalize_folder_path(Some(raw.to_string()))
}

fn focused_explorer_folder(target: HWND) -> Option<String> {
    struct ComGuard(bool);
    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() };
            }
        }
    }

    let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if initialized.is_err() && initialized != RPC_E_CHANGED_MODE {
        return None;
    }
    let _guard = ComGuard(initialized.is_ok());
    let automation =
        unsafe { CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_ALL) }.ok()?;
    let mut target_process_id = 0u32;
    unsafe { GetWindowThreadProcessId(target, Some(&mut target_process_id)) };
    if let Ok(element) = unsafe { automation.GetFocusedElement() }
        && unsafe { element.CurrentProcessId() }.ok()? == target_process_id as i32
        && unsafe { element.CurrentControlType() }.ok()? == UIA_EditControlTypeId
        && unsafe { element.CurrentHasKeyboardFocus() }.ok()?.as_bool()
        && let Ok(pattern) =
            unsafe { element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) }
        && let Ok(raw) = unsafe { pattern.CurrentValue() }
        && let Some(path) = normalize_explorer_folder_value(&raw.to_string())
    {
        return Some(path);
    }
    // On Windows 11, GetFocusedElement may report the address bar's parent
    // container even though its active TextBox child owns keyboard focus.
    // Search the target Explorer window so inactive tabs cannot be selected.
    let element = modern_explorer_uia_address_element(&automation, target).ok()?;
    let pattern =
        unsafe { element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) }
            .ok()?;
    let raw = unsafe { pattern.CurrentValue() }.ok()?.to_string();
    normalize_explorer_folder_value(&raw)
}

fn read_active_explorer_folder(target: HWND) -> Result<String, String> {
    let _ = send_inputs(&[
        key_input(VK_MENU, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_MENU, KEYEVENTF_KEYUP),
    ]);
    if !unsafe { SetForegroundWindow(target) }.as_bool() {
        return Err("Windows did not allow File Explorer to regain focus".to_string());
    }
    let foreground_deadline = Instant::now() + Duration::from_millis(1200);
    while unsafe { GetForegroundWindow() } != target && Instant::now() < foreground_deadline {
        thread::sleep(Duration::from_millis(15));
    }
    if unsafe { GetForegroundWindow() } != target {
        return Err("File Explorer did not regain focus in time".to_string());
    }
    let focus_address = if window_class(target).eq_ignore_ascii_case("cabinetwclass") {
        [
            key_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_L, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_L, KEYEVENTF_KEYUP),
            key_input(VK_CONTROL, KEYEVENTF_KEYUP),
        ]
    } else {
        [
            key_input(VK_MENU, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_D, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_D, KEYEVENTF_KEYUP),
            key_input(VK_MENU, KEYEVENTF_KEYUP),
        ]
    };
    if !send_inputs(&focus_address) {
        return Err("Unable to focus File Explorer's address bar".to_string());
    }
    let deadline = Instant::now() + Duration::from_millis(1400);
    let path = loop {
        if let Some(path) = focused_explorer_folder(target) {
            break Some(path);
        }
        if Instant::now() >= deadline {
            break None;
        }
        thread::sleep(Duration::from_millis(20));
    };
    let _ = send_inputs(&[
        key_input(VK_ESCAPE, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_ESCAPE, KEYEVENTF_KEYUP),
    ]);
    path.ok_or_else(|| "Unable to read File Explorer's active address".to_string())
}

fn replace_focused_address(target: HWND, path: &str) -> Option<InstantAddressReplacement> {
    struct ComGuard(bool);
    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() };
            }
        }
    }

    let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let can_use_com = initialized.is_ok() || initialized == RPC_E_CHANGED_MODE;
    let _guard = ComGuard(initialized.is_ok());
    let automation = can_use_com
        .then(|| unsafe { CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_ALL) })
        .and_then(Result::ok);
    let mut target_process_id = 0u32;
    unsafe { GetWindowThreadProcessId(target, Some(&mut target_process_id)) };
    let automation_value = BSTR::from(path);
    let modern_explorer = window_class(target).eq_ignore_ascii_case("cabinetwclass");
    // Newly-created Chromium file pickers can expose their native HWND before
    // the UI Automation edit provider is ready. Poll long enough to keep the
    // whole-path replacement path reliable; already-rendered dialogs return on
    // the first iteration.
    let deadline = Instant::now() + Duration::from_millis(2500);
    while Instant::now() < deadline {
        if let Some(automation) = automation.as_ref() {
            let result =
                set_focused_uia_edit_value(automation, target_process_id, &automation_value)
                    .or_else(|focused_error| {
                        if modern_explorer {
                            set_modern_explorer_uia_address_value(
                                automation,
                                target,
                                &automation_value,
                            )
                            .map_err(|explorer_error| {
                                format!(
                                    "{focused_error}; Explorer address lookup: {explorer_error}"
                                )
                            })
                        } else {
                            Err(focused_error)
                        }
                    });
            match result {
                Ok(replacement) => return Some(replacement),
                Err(_) => {}
            }
        }
        thread::sleep(Duration::from_millis(20));
    }
    None
}

fn navigate_target_window(hwnd_value: usize, path: &str) -> Result<(), String> {
    #[cfg(test)]
    LAST_NAVIGATION_METHOD.store(0, Ordering::Release);
    let path = normalize_folder_path(Some(path.to_string()))
        .ok_or_else(|| "The selected RHFiles location is not a filesystem folder".to_string())?;
    let target = HWND(hwnd_value as *mut core::ffi::c_void);
    if !is_supported_window(target) {
        return Err("The Windows file window is no longer available".to_string());
    }

    let target_class = window_class(target);
    // Modern CabinetWClass windows can host several tabs under the same HWND.
    // ShellWindows cannot reliably identify the selected tab and may activate
    // and redirect the first one. Use the focused address element below for
    // modern Explorer; the Shell API remains useful for legacy ExploreWClass.
    if target_class.eq_ignore_ascii_case("explorewclass")
        && navigate_explorer_with_shell(hwnd_value, &path)?
    {
        #[cfg(test)]
        LAST_NAVIGATION_METHOD.store(1, Ordering::Release);
        return Ok(());
    }

    // Selecting a location is an explicit user gesture in RHFiles' companion
    // window. A synthetic Alt tap permits the foreground transition without
    // clipboard use, but only send it when a transition is actually needed:
    // a bare Alt in an already-active Common Item Dialog enters menu mode and
    // can swallow the following Alt+D.
    if unsafe { GetForegroundWindow() } != target {
        let _ = send_inputs(&[
            key_input(VK_MENU, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_MENU, KEYEVENTF_KEYUP),
        ]);
    }
    if !unsafe { SetForegroundWindow(target) }.as_bool() {
        return Err("Windows did not allow the file dialog to regain focus".to_string());
    }
    let focus_deadline = Instant::now() + Duration::from_millis(1200);
    while unsafe { GetForegroundWindow() } != target && Instant::now() < focus_deadline {
        thread::sleep(Duration::from_millis(15));
    }
    if unsafe { GetForegroundWindow() } != target {
        return Err("The file dialog did not regain focus in time".to_string());
    }

    // Common Windows file dialogs and modern Explorer focus their address bar
    // with Ctrl+L. This avoids localized access-key handling in Chromium-hosted
    // dialogs, where Alt+D can leave focus in the filename field.
    let focus_address = [
        key_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_L, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_L, KEYEVENTF_KEYUP),
        key_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    if !send_inputs(&focus_address) {
        return Err("Unable to focus the Windows address bar".to_string());
    }
    // Explorer's breadcrumb animation and the modern IFileDialog address bar
    // can take more than one frame to turn into an editable control.
    thread::sleep(Duration::from_millis(80));
    let dialog_path = path;
    // Waiting for UIA here also acts as a readiness probe for newly-created
    // Chromium dialogs. Their top-level HWND can become foreground before the
    // focused edit provider is ready to accept a real paste.
    let instant_replacement = replace_focused_address(target, &dialog_path);
    if (target_class.eq_ignore_ascii_case("#32770")
        || target_class.eq_ignore_ascii_case("cabinetwclass"))
        && paste_location_without_typing(target, &dialog_path)
    {
        #[cfg(test)]
        LAST_NAVIGATION_METHOD.store(2, Ordering::Release);
        return Ok(());
    }
    let replaced_directly = instant_replacement.is_some();
    let replaced_filename = instant_replacement == Some(InstantAddressReplacement::DialogFileName);
    #[cfg(test)]
    LAST_NAVIGATION_METHOD.store(if replaced_directly { 2 } else { 3 }, Ordering::Release);
    if !replaced_directly {
        // Keep Unicode input as a compatibility fallback for alternate shell
        // hosts that do not expose a writable UI Automation value pattern.
        let select_all = [
            key_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
            key_input(VIRTUAL_KEY(b'A' as u16), KEYBD_EVENT_FLAGS(0)),
            key_input(VIRTUAL_KEY(b'A' as u16), KEYEVENTF_KEYUP),
            key_input(VK_CONTROL, KEYEVENTF_KEYUP),
        ];
        if !send_inputs(&select_all) {
            return Err("Unable to select the current Windows address".to_string());
        }
        thread::sleep(Duration::from_millis(40));

        let mut text_inputs = Vec::with_capacity(dialog_path.encode_utf16().count() * 2);
        for unit in dialog_path.encode_utf16() {
            text_inputs.push(unicode_input(unit, false));
            text_inputs.push(unicode_input(unit, true));
        }
        if !send_inputs(&text_inputs) {
            return Err("Unable to enter the selected folder in Windows".to_string());
        }
    }
    if replaced_filename && target_class.eq_ignore_ascii_case("#32770") {
        let _ = unsafe { SetForegroundWindow(target) };
        // ValuePattern replaces the complete path without visible typing. A
        // zero-net-change edit (Space + Backspace) makes Chromium's Common Item
        // Dialog commit that value, then Enter confirms it in the same input
        // batch so a foreground race cannot split the operation.
        if !send_inputs(&[
            key_input(VK_END, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_END, KEYEVENTF_KEYUP),
            key_input(VK_SPACE, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_SPACE, KEYEVENTF_KEYUP),
            key_input(VK_BACK, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_BACK, KEYEVENTF_KEYUP),
            key_input(VK_RETURN, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_RETURN, KEYEVENTF_KEYUP),
        ]) {
            return Err("Unable to confirm the Windows filename field".to_string());
        }
        return Ok(());
    }
    // Some Chromium-hosted Common Item Dialogs apply ValuePattern changes on
    // their UI thread. Give that single update one frame to settle before
    // confirming it; this is still effectively instant to the user.
    thread::sleep(Duration::from_millis(if replaced_directly {
        140
    } else {
        45
    }));
    if !send_inputs(&[
        key_input(VK_RETURN, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_RETURN, KEYEVENTF_KEYUP),
    ]) {
        return Err("Unable to confirm the selected folder in Windows".to_string());
    }
    Ok(())
}

fn current_status() -> FileDialogIntegrationStatus {
    let snapshot = lock_config().clone();
    let locations = all_locations(&snapshot);
    FileDialogIntegrationStatus {
        enabled: snapshot.enabled,
        running: snapshot.enabled && MONITOR_RUNNING.load(Ordering::Acquire),
        path_available: !locations.is_empty(),
        current_path: active_location(&snapshot),
        location_count: locations.len(),
        registered_shortcuts: snapshot.shortcut_labels,
        rejected_shortcuts: snapshot.rejected_shortcuts,
        supported_targets: vec!["windowsFileDialog", "windowsExplorer"],
    }
}

// Creating or destroying a WebView window may synchronously marshal work back
// to Tauri's event loop. This command must therefore run on the async command
// executor; running it as a synchronous command deadlocks every later IPC call
// when the opt-in integration creates its companion picker.
#[tauri::command(async)]
pub fn configure_file_dialog_integration(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    enabled: bool,
    locations: Vec<FileDialogLocation>,
    shortcuts: Vec<String>,
    locale: Option<String>,
) -> Result<FileDialogIntegrationStatus, String> {
    initialize(app.clone())?;
    let mut hotkeys = Vec::new();
    let mut shortcut_labels = Vec::new();
    let mut rejected_shortcuts = Vec::new();
    for shortcut in shortcuts {
        if let Some(parsed) = parse_hotkey(&shortcut) {
            if !hotkeys.contains(&parsed) {
                hotkeys.push(parsed);
                shortcut_labels.push(shortcut);
            }
        } else if !shortcut.trim().is_empty() {
            rejected_shortcuts.push(shortcut);
        }
    }

    let window_label = window.label().to_string();
    let normalized_locations = locations
        .into_iter()
        .take(200)
        .enumerate()
        .filter_map(|(index, mut location)| {
            location.path = normalize_folder_path(Some(location.path))?;
            location.window_label = window_label.clone();
            location.pane = if location.pane.eq_ignore_ascii_case("right") {
                "right".to_string()
            } else {
                "left".to_string()
            };
            if location.id.trim().is_empty() {
                location.id = format!("{window_label}:{}:{index}", location.pane);
            }
            Some(location)
        })
        .collect::<Vec<_>>();

    {
        let mut state = lock_config();
        state.enabled = enabled;
        state.windows.insert(
            window_label,
            WindowLocations {
                locations: normalized_locations,
            },
        );
        if let Some(locale) = locale {
            state.locale = if locale.to_ascii_lowercase().starts_with("zh") {
                "zh".to_string()
            } else {
                "en".to_string()
            };
        }
        state.hotkeys = hotkeys;
        state.shortcut_labels = shortcut_labels;
        state.rejected_shortcuts = rejected_shortcuts;
    }
    if enabled {
        let startup = ensure_picker_window()
            .and_then(|_| ensure_monitor_started())
            .and_then(|_| {
                if lock_config().hotkeys.is_empty() {
                    Ok(())
                } else {
                    ensure_hook_started()
                }
            });
        if let Err(error) = startup {
            lock_config().enabled = false;
            if let Some(picker) = app.get_webview_window("integration-picker") {
                let _ = picker.destroy();
            }
            return Err(error);
        }
    }
    if !enabled {
        ACTIVE_TARGET.store(0, Ordering::Release);
        DISMISSED_TARGET.store(0, Ordering::Release);
        hide_picker_native();
        if let Some(picker) = app.get_webview_window("integration-picker") {
            let _ = picker.destroy();
        }
    }
    emit_picker_state();
    Ok(current_status())
}

#[tauri::command]
pub fn get_file_dialog_integration_status() -> FileDialogIntegrationStatus {
    current_status()
}

#[tauri::command]
pub fn get_file_dialog_picker_state() -> FileDialogPickerState {
    picker_state()
}

#[tauri::command]
pub async fn navigate_file_dialog_location(path: String) -> Result<(), String> {
    let target = ACTIVE_TARGET.load(Ordering::Acquire);
    if target == 0 {
        return Err("No Windows file dialog or File Explorer window is available".to_string());
    }
    let path = normalize_folder_path(Some(path))
        .ok_or_else(|| "The selected RHFiles location is not a filesystem folder".to_string())?;
    let location_is_current = all_locations(&lock_config())
        .iter()
        .any(|location| location.path.eq_ignore_ascii_case(&path));
    if !location_is_current {
        return Err("The selected RHFiles location is no longer open".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || navigate_target_window(target, &path))
        .await
        .map_err(|error| format!("Unable to run Windows navigation: {error}"))?
}

#[tauri::command(async)]
pub async fn open_explorer_location_in_rhfiles(
    app: tauri::AppHandle,
) -> Result<OpenExplorerLocationPayload, String> {
    let target = ACTIVE_TARGET.load(Ordering::Acquire);
    if target == 0 {
        return Err("No Windows File Explorer window is available".to_string());
    }
    let target_hwnd = HWND(target as *mut core::ffi::c_void);
    if target_kind(target_hwnd) != "windowsExplorer" || !is_supported_window(target_hwnd) {
        return Err("The active Windows window is not File Explorer".to_string());
    }
    let path = tauri::async_runtime::spawn_blocking(move || {
        read_active_explorer_folder(HWND(target as *mut core::ffi::c_void))
    })
    .await
    .map_err(|error| format!("Unable to read File Explorer's folder: {error}"))?
    .map_err(|error| format!("Unable to read File Explorer's current folder: {error}"))?;

    let snapshot = lock_config().clone();
    let existing_location = all_locations(&snapshot).into_iter().find(|location| {
        app.get_webview_window(&location.window_label).is_some()
            && same_windows_folder(&location.path, &path)
    });
    let destination_label = if let Some(location) = existing_location.as_ref() {
        location.window_label.clone()
    } else if app.get_webview_window("main").is_some() {
        "main".to_string()
    } else {
        let mut labels = snapshot.windows.keys().cloned().collect::<Vec<_>>();
        labels.sort();
        labels
            .into_iter()
            .find(|label| app.get_webview_window(label).is_some())
            .ok_or_else(|| "No RHFiles window is available".to_string())?
    };
    let payload = OpenExplorerLocationPayload {
        path,
        existing: existing_location.is_some(),
        pane: existing_location
            .as_ref()
            .map(|location| location.pane.clone()),
        tab_index: existing_location
            .as_ref()
            .map(|location| location.tab_index),
    };
    app.emit_to(
        &destination_label,
        "open-explorer-location-in-rhfiles",
        payload.clone(),
    )
    .map_err(|error| format!("Unable to send the Explorer folder to RHFiles: {error}"))?;
    if let Some(window) = app.get_webview_window(&destination_label) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    DISMISSED_TARGET.store(target, Ordering::Release);
    hide_picker_native();
    Ok(payload)
}

#[tauri::command]
pub fn hide_file_dialog_picker() {
    let target = ACTIVE_TARGET.load(Ordering::Acquire);
    if target != 0 {
        DISMISSED_TARGET.store(target, Ordering::Release);
    }
    hide_picker_native();
}

#[tauri::command]
pub fn set_file_dialog_picker_compact(compact: bool) -> FileDialogPickerState {
    PICKER_COMPACT.store(compact, Ordering::Release);
    let target_value = ACTIVE_TARGET.load(Ordering::Acquire);
    if target_value != 0
        && let Some(picker) = picker_hwnd()
    {
        let target = HWND(target_value as *mut core::ffi::c_void);
        if is_supported_window(target) {
            let _ = position_picker(target, picker);
        }
    }
    let state = picker_state();
    emit_picker_state();
    state
}

#[tauri::command]
pub fn disable_file_dialog_integration(app: tauri::AppHandle) {
    lock_config().enabled = false;
    ACTIVE_TARGET.store(0, Ordering::Release);
    DISMISSED_TARGET.store(0, Ordering::Release);
    hide_picker_native();
    let _ = app.emit("file-dialog-integration-disabled", ());
    emit_picker_state();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        process::{Child, Command},
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GW_OWNER, GetMenu, GetMenuItemCount, GetMenuItemID, GetMenuStringW,
        GetSubMenu, GetWindow, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
        MF_BYPOSITION, PostMessageW, SetForegroundWindow, WM_CLOSE, WM_COMMAND,
    };

    struct TopLevelWindowSearch {
        class_name: &'static str,
        title_fragment: String,
        process_id: Option<u32>,
        hwnd: Option<usize>,
    }

    unsafe extern "system" fn find_top_level_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = unsafe { &mut *(lparam.0 as *mut TopLevelWindowSearch) };
        let mut process_id = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process_id)) };
        if unsafe { IsWindowVisible(hwnd) }.as_bool()
            && window_class(hwnd).eq_ignore_ascii_case(search.class_name)
            && search
                .process_id
                .is_none_or(|expected| expected == process_id)
        {
            let mut title = [0u16; 1024];
            let length = unsafe { GetWindowTextW(hwnd, &mut title) };
            let title = String::from_utf16_lossy(&title[..length.max(0) as usize]);
            if title.contains(&search.title_fragment) {
                search.hwnd = Some(hwnd.0 as usize);
            }
        }
        BOOL::from(true)
    }

    fn top_level_window_with_title(
        class_name: &'static str,
        title_fragment: &str,
        process_id: Option<u32>,
    ) -> Option<HWND> {
        let mut search = TopLevelWindowSearch {
            class_name,
            title_fragment: title_fragment.to_string(),
            process_id,
            hwnd: None,
        };
        unsafe {
            let _ = EnumWindows(
                Some(find_top_level_window),
                LPARAM((&mut search as *mut TopLevelWindowSearch) as isize),
            );
        }
        search
            .hwnd
            .map(|value| HWND(value as *mut core::ffi::c_void))
    }

    fn window_title(hwnd: HWND) -> String {
        let mut title = [0u16; 1024];
        let length = unsafe { GetWindowTextW(hwnd, &mut title) };
        String::from_utf16_lossy(&title[..length.max(0) as usize])
    }

    fn wait_for_explorer_title(title_fragment: &str, timeout: Duration) -> Option<HWND> {
        let deadline = Instant::now() + timeout;
        loop {
            if let Some(hwnd) = top_level_window_with_title("CabinetWClass", title_fragment, None) {
                return Some(hwnd);
            }
            if Instant::now() >= deadline {
                return None;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    fn wait_for_explorer_folder(hwnd: HWND, path: &str, timeout: Duration) -> bool {
        let Some(folder_name) = std::path::Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
        else {
            return false;
        };
        let deadline = Instant::now() + timeout;
        loop {
            if top_level_window_with_title("CabinetWClass", folder_name, None)
                .is_some_and(|current| current == hwnd)
            {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    fn wait_for_process_window(
        class_name: &'static str,
        title_fragment: &str,
        process_id: u32,
        timeout: Duration,
    ) -> Option<HWND> {
        let deadline = Instant::now() + timeout;
        loop {
            if let Some(hwnd) =
                top_level_window_with_title(class_name, title_fragment, Some(process_id))
            {
                return Some(hwnd);
            }
            if Instant::now() >= deadline {
                return None;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    fn explorer_tab_names(hwnd: HWND) -> Vec<String> {
        struct ComGuard(bool);
        impl Drop for ComGuard {
            fn drop(&mut self) {
                if self.0 {
                    unsafe { CoUninitialize() };
                }
            }
        }

        let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if initialized.is_err() && initialized != RPC_E_CHANGED_MODE {
            return Vec::new();
        }
        let _guard = ComGuard(initialized.is_ok());
        let Ok(automation) =
            (unsafe { CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_ALL) })
        else {
            return Vec::new();
        };
        let Ok(root) = (unsafe { automation.ElementFromHandle(hwnd) }) else {
            return Vec::new();
        };
        let tab_list_id = VARIANT::from(BSTR::from("TabListView"));
        let Ok(tab_list_condition) = (unsafe {
            automation.CreatePropertyCondition(UIA_AutomationIdPropertyId, &tab_list_id)
        }) else {
            return Vec::new();
        };
        let Ok(tab_list) = (unsafe { root.FindFirst(TreeScope_Descendants, &tab_list_condition) })
        else {
            return Vec::new();
        };
        let Ok(any_condition) = (unsafe { automation.CreateTrueCondition() }) else {
            return Vec::new();
        };
        let Ok(children) = (unsafe { tab_list.FindAll(TreeScope_Children, &any_condition) }) else {
            return Vec::new();
        };
        let mut names = Vec::new();
        for index in 0..unsafe { children.Length() }.unwrap_or_default() {
            if let Ok(element) = unsafe { children.GetElement(index) }
                && let Ok(name) = unsafe { element.CurrentName() }
            {
                let name = name.to_string();
                if !name.is_empty() {
                    names.push(name);
                }
            }
        }
        names
    }

    fn open_explorer_tab(hwnd: HWND) -> bool {
        struct ComGuard(bool);
        impl Drop for ComGuard {
            fn drop(&mut self) {
                if self.0 {
                    unsafe { CoUninitialize() };
                }
            }
        }

        let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if initialized.is_err() && initialized != RPC_E_CHANGED_MODE {
            return false;
        }
        let _guard = ComGuard(initialized.is_ok());
        let Ok(automation) =
            (unsafe { CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_ALL) })
        else {
            return false;
        };
        let Ok(root) = (unsafe { automation.ElementFromHandle(hwnd) }) else {
            return false;
        };
        let add_button_id = VARIANT::from(BSTR::from("AddButton"));
        let Ok(condition) = (unsafe {
            automation.CreatePropertyCondition(UIA_AutomationIdPropertyId, &add_button_id)
        }) else {
            return false;
        };
        let Ok(button) = (unsafe { root.FindFirst(TreeScope_Descendants, &condition) }) else {
            return false;
        };
        let Ok(pattern) = (unsafe {
            button.GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId)
        }) else {
            return false;
        };
        unsafe { pattern.Invoke() }.is_ok()
    }

    fn select_explorer_tab(hwnd: HWND, index: i32) -> bool {
        struct ComGuard(bool);
        impl Drop for ComGuard {
            fn drop(&mut self) {
                if self.0 {
                    unsafe { CoUninitialize() };
                }
            }
        }

        let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if initialized.is_err() && initialized != RPC_E_CHANGED_MODE {
            return false;
        }
        let _guard = ComGuard(initialized.is_ok());
        let Ok(automation) =
            (unsafe { CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_ALL) })
        else {
            return false;
        };
        let Ok(root) = (unsafe { automation.ElementFromHandle(hwnd) }) else {
            return false;
        };
        let tab_list_id = VARIANT::from(BSTR::from("TabListView"));
        let Ok(condition) = (unsafe {
            automation.CreatePropertyCondition(UIA_AutomationIdPropertyId, &tab_list_id)
        }) else {
            return false;
        };
        let Ok(tab_list) = (unsafe { root.FindFirst(TreeScope_Descendants, &condition) }) else {
            return false;
        };
        let Ok(any_condition) = (unsafe { automation.CreateTrueCondition() }) else {
            return false;
        };
        let Ok(tabs) = (unsafe { tab_list.FindAll(TreeScope_Children, &any_condition) }) else {
            return false;
        };
        let Ok(tab) = (unsafe { tabs.GetElement(index) }) else {
            return false;
        };
        let Ok(pattern) = (unsafe {
            tab.GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId)
        }) else {
            return false;
        };
        if unsafe { pattern.Select() }.is_err() {
            return false;
        }
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            if unsafe { pattern.CurrentIsSelected() }.is_ok_and(|value| value.as_bool()) {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            thread::sleep(Duration::from_millis(50));
        }
    }

    fn invoke_named_uia_element(hwnd: HWND, name: &str) -> bool {
        struct ComGuard(bool);
        impl Drop for ComGuard {
            fn drop(&mut self) {
                if self.0 {
                    unsafe { CoUninitialize() };
                }
            }
        }

        let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if initialized.is_err() && initialized != RPC_E_CHANGED_MODE {
            return false;
        }
        let _guard = ComGuard(initialized.is_ok());
        let Ok(automation) =
            (unsafe { CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_ALL) })
        else {
            return false;
        };
        let Ok(root) = (unsafe { automation.ElementFromHandle(hwnd) }) else {
            return false;
        };
        let element_name = VARIANT::from(BSTR::from(name));
        let Ok(condition) =
            (unsafe { automation.CreatePropertyCondition(UIA_NamePropertyId, &element_name) })
        else {
            return false;
        };
        let Ok(element) = (unsafe { root.FindFirst(TreeScope_Descendants, &condition) }) else {
            return false;
        };
        let Ok(pattern) = (unsafe {
            element.GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId)
        }) else {
            return false;
        };
        unsafe { pattern.Invoke() }.is_ok()
    }

    fn uia_descendant_names(hwnd: HWND) -> Vec<String> {
        struct ComGuard(bool);
        impl Drop for ComGuard {
            fn drop(&mut self) {
                if self.0 {
                    unsafe { CoUninitialize() };
                }
            }
        }

        let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if initialized.is_err() && initialized != RPC_E_CHANGED_MODE {
            return Vec::new();
        }
        let _guard = ComGuard(initialized.is_ok());
        let Ok(automation) =
            (unsafe { CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_ALL) })
        else {
            return Vec::new();
        };
        let Ok(root) = (unsafe { automation.ElementFromHandle(hwnd) }) else {
            return Vec::new();
        };
        let Ok(any_condition) = (unsafe { automation.CreateTrueCondition() }) else {
            return Vec::new();
        };
        let Ok(elements) = (unsafe { root.FindAll(TreeScope_Descendants, &any_condition) }) else {
            return Vec::new();
        };
        let mut names = Vec::new();
        for index in 0..unsafe { elements.Length() }.unwrap_or_default() {
            if let Ok(element) = unsafe { elements.GetElement(index) }
                && let Ok(name) = unsafe { element.CurrentName() }
            {
                let name = name.to_string();
                if !name.is_empty() {
                    names.push(name);
                }
            }
        }
        names
    }

    fn wait_for_uia_name(hwnd: HWND, name_fragment: &str, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        loop {
            if uia_descendant_names(hwnd)
                .iter()
                .any(|name| name.contains(name_fragment))
            {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    fn focused_uia_debug() -> String {
        struct ComGuard(bool);
        impl Drop for ComGuard {
            fn drop(&mut self) {
                if self.0 {
                    unsafe { CoUninitialize() };
                }
            }
        }
        let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if initialized.is_err() && initialized != RPC_E_CHANGED_MODE {
            return format!("COM failed: {initialized:?}");
        }
        let _guard = ComGuard(initialized.is_ok());
        let Ok(automation) =
            (unsafe { CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_ALL) })
        else {
            return "automation unavailable".to_string();
        };
        let Ok(element) = (unsafe { automation.GetFocusedElement() }) else {
            return "focused element unavailable".to_string();
        };
        let name = unsafe { element.CurrentName() }
            .map(|value| value.to_string())
            .unwrap_or_default();
        let id = unsafe { element.CurrentAutomationId() }
            .map(|value| value.to_string())
            .unwrap_or_default();
        let value =
            unsafe { element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) }
                .and_then(|pattern| unsafe { pattern.CurrentValue() })
                .map(|value| value.to_string())
                .unwrap_or_default();
        format!("name={name:?} id={id:?} value={value:?}")
    }

    struct ChildTextSearch {
        class_name: &'static str,
        text_fragment: String,
        found: bool,
    }

    unsafe extern "system" fn find_child_text(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = unsafe { &mut *(lparam.0 as *mut ChildTextSearch) };
        if window_class(hwnd).eq_ignore_ascii_case(search.class_name) {
            let mut text = [0u16; 1024];
            let length = unsafe { GetWindowTextW(hwnd, &mut text) };
            let text = String::from_utf16_lossy(&text[..length.max(0) as usize]);
            if text.contains(&search.text_fragment) {
                search.found = true;
            }
        }
        BOOL::from(true)
    }

    fn window_has_child_text(top: HWND, class_name: &'static str, text_fragment: &str) -> bool {
        let mut search = ChildTextSearch {
            class_name,
            text_fragment: text_fragment.to_string(),
            found: false,
        };
        unsafe {
            let _ = EnumChildWindows(
                Some(top),
                Some(find_child_text),
                LPARAM((&mut search as *mut ChildTextSearch) as isize),
            );
        }
        search.found
    }

    fn wait_for_child_text(
        top: HWND,
        class_name: &'static str,
        text_fragment: &str,
        timeout: Duration,
    ) -> bool {
        let deadline = Instant::now() + timeout;
        loop {
            if window_has_child_text(top, class_name, text_fragment) {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    fn focus_controlled_window(hwnd: HWND) {
        // Releasing Alt permits a foreground transition without attaching to
        // or changing any pre-existing windows.
        assert!(send_inputs(&[
            key_input(VK_MENU, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_MENU, KEYEVENTF_KEYUP),
        ]));
        assert!(unsafe { SetForegroundWindow(hwnd) }.as_bool());
        let deadline = Instant::now() + Duration::from_secs(3);
        while unsafe { GetForegroundWindow() } != hwnd && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(unsafe { GetForegroundWindow() }, hwnd);
    }

    fn menu_command_with_accelerator(
        menu: windows::Win32::UI::WindowsAndMessaging::HMENU,
        accelerator: &str,
    ) -> Option<u32> {
        let count = unsafe { GetMenuItemCount(Some(menu)) };
        for position in 0..count.max(0) {
            let mut text = [0u16; 512];
            let length =
                unsafe { GetMenuStringW(menu, position as u32, Some(&mut text), MF_BYPOSITION) };
            let text = String::from_utf16_lossy(&text[..length.max(0) as usize]);
            if text.contains(accelerator) {
                let command = unsafe { GetMenuItemID(menu, position) };
                if command != u32::MAX {
                    return Some(command);
                }
            }
        }
        None
    }

    struct ExplorerTestGuard {
        hwnd: Option<HWND>,
        root: std::path::PathBuf,
    }

    impl Drop for ExplorerTestGuard {
        fn drop(&mut self) {
            lock_config().enabled = false;
            if let Some(hwnd) = self.hwnd {
                for _ in 0..3 {
                    if !unsafe { IsWindow(Some(hwnd)) }.as_bool() {
                        break;
                    }
                    let _ = unsafe { PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)) };
                    thread::sleep(Duration::from_millis(250));
                }
            }
            thread::sleep(Duration::from_millis(250));
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    struct NotepadTestGuard {
        dialog_hwnd: Option<HWND>,
        main_hwnd: Option<HWND>,
        process: Option<Child>,
        root: std::path::PathBuf,
    }

    struct EdgeTestGuard {
        dialog_hwnd: Option<HWND>,
        browser_hwnd: Option<HWND>,
        process: Option<Child>,
        root: std::path::PathBuf,
    }

    impl Drop for EdgeTestGuard {
        fn drop(&mut self) {
            if let Some(hwnd) = self.dialog_hwnd {
                let _ = unsafe { PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)) };
            }
            if let Some(hwnd) = self.browser_hwnd {
                let _ = unsafe { PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)) };
            }
            thread::sleep(Duration::from_millis(500));
            if let Some(mut process) = self.process.take()
                && process.try_wait().ok().flatten().is_none()
            {
                let _ = process.kill();
                let _ = process.wait();
            }
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    impl Drop for NotepadTestGuard {
        fn drop(&mut self) {
            lock_config().enabled = false;
            if let Some(hwnd) = self.dialog_hwnd {
                let _ = unsafe { PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)) };
            }
            if let Some(hwnd) = self.main_hwnd {
                let _ = unsafe { PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)) };
            }
            thread::sleep(Duration::from_millis(350));
            if let Some(mut process) = self.process.take()
                && process.try_wait().ok().flatten().is_none()
            {
                let _ = process.kill();
                let _ = process.wait();
            }
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn parses_configurable_shortcuts() {
        assert_eq!(
            parse_hotkey("Ctrl+G"),
            Some(Hotkey {
                ctrl: true,
                shift: false,
                alt: false,
                key: b'G' as u32,
            })
        );
        assert_eq!(
            parse_hotkey("Alt+["),
            Some(Hotkey {
                ctrl: false,
                shift: false,
                alt: true,
                key: VK_OEM_4.0 as u32
            })
        );
        assert_eq!(
            parse_hotkey("Ctrl+Shift+F12").map(|key| key.key),
            Some(0x7b)
        );
        assert!(parse_hotkey("G").is_none());
        assert!(parse_hotkey("").is_none());
    }

    #[test]
    fn recognizes_only_explorer_and_file_dialog_shapes() {
        assert!(is_supported_window_shape(
            "CabinetWClass",
            &DialogEvidence::default()
        ));
        assert!(!is_supported_window_shape(
            "Chrome_WidgetWin_1",
            &DialogEvidence::default()
        ));
        assert!(!is_supported_window_shape(
            "#32770",
            &DialogEvidence::default()
        ));
        assert!(is_supported_window_shape(
            "#32770",
            &DialogEvidence {
                has_shell_view: true,
                ..DialogEvidence::default()
            }
        ));
    }

    #[test]
    fn integration_picker_window_is_created_lazily() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let picker = config["app"]["windows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|window| window["label"] == "integration-picker")
            .expect("integration picker window config");
        assert_eq!(picker["create"], false);
        assert_eq!(picker["visible"], false);
        assert_eq!(picker["skipTaskbar"], true);
        let picker_html = include_str!("../../src/integration-picker.html");
        assert!(picker_html.contains("id=\"picker-compact\""));
        assert!(picker_html.contains("id=\"picker-disable\""));
        assert!(picker_html.contains("id=\"picker-open-rhfiles\""));
        assert!(picker_html.contains("id=\"picker-open-rhfiles-compact\""));
        assert!(picker_html.contains("在 RHFiles 里打开"));
        let picker_js = include_str!("../../src/js/integration-picker.js");
        assert!(!picker_js.contains("folderIcon"));
        assert!(!picker_js.contains("location-meta"));
        assert!(!picker_js.contains("tr('left')"));
        assert!(!picker_js.contains("tr('right')"));
        assert!(!picker_js.contains("tr('tab'"));
        assert!(picker_js.contains("} finally {"));
        assert!(picker_js.contains("button.disabled = false"));
    }

    #[test]
    fn accepts_drive_and_unc_folders_but_not_virtual_locations() {
        assert_eq!(
            normalize_folder_path(Some("C:".into())).as_deref(),
            Some("C:\\")
        );
        assert!(normalize_folder_path(Some("\\\\server\\share".into())).is_some());
        assert!(normalize_folder_path(Some("home://".into())).is_none());
        assert!(same_windows_folder("C:\\Folder", "c:/folder/"));
        assert!(same_windows_folder(
            "\\\\SERVER\\Share\\Folder\\",
            "\\\\server\\share\\folder"
        ));
    }

    #[test]
    fn installs_the_out_of_process_hook_and_can_disable_it() {
        {
            let mut state = lock_config();
            state.enabled = true;
            state.hotkeys = vec![parse_hotkey("Ctrl+Shift+F24").unwrap()];
        }
        ensure_hook_started().expect("the low-level Windows hook should install");
        assert!(HOOK_RUNNING.load(Ordering::Acquire));

        lock_config().enabled = false;
        assert!(HOOK_RUNNING.load(Ordering::Acquire));
    }

    #[test]
    #[ignore = "opens and closes a real File Explorer window"]
    fn navigates_a_real_file_explorer_window() {
        let unique = format!(
            "{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after the Unix epoch")
                .as_millis()
        );
        let root = std::env::temp_dir().join(format!("rhfiles-explorer-e2e-{unique}"));
        let source = root.join(format!("source-{unique}"));
        let target = root.join(format!("target-{unique}"));
        fs::create_dir_all(&source).expect("create Explorer source folder");
        fs::create_dir_all(&target).expect("create Explorer target folder");
        let source_title = source.file_name().unwrap().to_string_lossy().into_owned();
        let target_title = target.file_name().unwrap().to_string_lossy().into_owned();
        let mut guard = ExplorerTestGuard { hwnd: None, root };

        Command::new("explorer.exe")
            .arg(format!("/n,/e,{}", source.display()))
            .spawn()
            .expect("start the controlled File Explorer window");
        let hwnd = wait_for_explorer_title(&source_title, Duration::from_secs(10))
            .expect("the controlled Explorer window did not open at the source folder");
        guard.hwnd = Some(hwnd);

        focus_controlled_window(hwnd);

        focus_controlled_window(hwnd);
        navigate_target_window(hwnd.0 as usize, &target.to_string_lossy())
            .expect("select the target from the RHFiles location picker");

        let navigated = wait_for_explorer_title(&target_title, Duration::from_secs(10))
            .expect("the location picker did not navigate Explorer to the selected folder");
        assert_eq!(
            navigated, hwnd,
            "navigation unexpectedly changed Explorer windows"
        );
    }

    #[test]
    #[ignore = "opens a controlled File Explorer window with two tabs"]
    fn navigates_only_the_active_file_explorer_tab() {
        let unique = format!(
            "{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after the Unix epoch")
                .as_millis()
        );
        let root = std::env::temp_dir().join(format!("rhfiles-explorer-tabs-e2e-{unique}"));
        let first = root.join(format!("first-{unique}"));
        let second = root.join(format!("second-{unique}"));
        let target = root.join(format!("target-{unique}"));
        fs::create_dir_all(&first).expect("create first Explorer tab folder");
        fs::create_dir_all(&second).expect("create second Explorer tab folder");
        fs::create_dir_all(&target).expect("create Explorer target folder");
        let first_title = first.file_name().unwrap().to_string_lossy().into_owned();
        let target_title = target.file_name().unwrap().to_string_lossy().into_owned();
        let mut guard = ExplorerTestGuard { hwnd: None, root };

        Command::new("explorer.exe")
            .arg(format!("/n,/e,{}", first.display()))
            .spawn()
            .expect("start the controlled File Explorer window");
        let hwnd = wait_for_explorer_title(&first_title, Duration::from_secs(10))
            .expect("the controlled Explorer window did not open at the first folder");
        guard.hwnd = Some(hwnd);
        focus_controlled_window(hwnd);

        assert!(
            open_explorer_tab(hwnd),
            "could not invoke Explorer's new-tab button"
        );
        let tab_deadline = Instant::now() + Duration::from_secs(5);
        let opened_tabs = loop {
            let names = explorer_tab_names(hwnd);
            if names.len() >= 2 || Instant::now() >= tab_deadline {
                break names;
            }
            thread::sleep(Duration::from_millis(100));
        };
        assert!(
            opened_tabs.len() >= 2,
            "Ctrl+T did not create a second Explorer tab: {opened_tabs:?}"
        );
        assert!(
            select_explorer_tab(hwnd, 1),
            "could not select the controlled second Explorer tab"
        );
        thread::sleep(Duration::from_millis(300));
        focus_controlled_window(hwnd);
        navigate_target_window(hwnd.0 as usize, &second.to_string_lossy())
            .expect("navigate the new active Explorer tab to its source folder");
        assert_eq!(
            LAST_NAVIGATION_METHOD.load(Ordering::Acquire),
            2,
            "Explorer did not replace the active tab address in one operation"
        );
        assert!(
            wait_for_explorer_folder(hwnd, &second.to_string_lossy(), Duration::from_secs(10)),
            "the second Explorer tab did not navigate to its source folder: {:?}",
            explorer_tab_names(hwnd)
        );

        focus_controlled_window(hwnd);
        navigate_target_window(hwnd.0 as usize, &target.to_string_lossy())
            .expect("select the target for the active Explorer tab");
        assert_eq!(
            LAST_NAVIGATION_METHOD.load(Ordering::Acquire),
            2,
            "Explorer did not keep replacing the active tab address in one operation"
        );
        assert!(
            wait_for_explorer_folder(hwnd, &target.to_string_lossy(), Duration::from_secs(10)),
            "the active Explorer tab did not navigate to the selected folder: expected_hwnd={hwnd:?} expected_title={:?}; tabs={:?}; focused={}; foreground={:?} foreground_class={:?} foreground_title={:?}",
            window_title(hwnd),
            explorer_tab_names(hwnd),
            focused_uia_debug(),
            unsafe { GetForegroundWindow() },
            window_class(unsafe { GetForegroundWindow() }),
            window_title(unsafe { GetForegroundWindow() }),
        );
        let active_explorer_path = read_active_explorer_folder(hwnd)
            .expect("could not read the active Explorer tab's address");
        assert!(
            same_windows_folder(&active_explorer_path, &target.to_string_lossy()),
            "Explorer address lookup returned the wrong tab: active={active_explorer_path:?} target={:?}",
            target.to_string_lossy()
        );

        thread::sleep(Duration::from_millis(500));
        let tab_names = explorer_tab_names(hwnd);
        assert!(
            tab_names.iter().any(|name| name.contains(&first_title)),
            "the first Explorer tab was changed while the second tab was active: {tab_names:?}"
        );
        assert!(
            tab_names.iter().any(|name| name.contains(&target_title)),
            "the active Explorer tab did not retain the selected target: {tab_names:?}"
        );
    }

    #[test]
    #[ignore = "opens and closes a controlled Notepad file dialog"]
    fn navigates_a_real_windows_file_dialog() {
        let unique = format!(
            "{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after the Unix epoch")
                .as_millis()
        );
        let root = std::env::temp_dir().join(format!("rhfiles-notepad-e2e-{unique}"));
        let target_folder = root.join(format!("target-folder-{unique}"));
        let source = root.join(format!("source-{unique}.txt"));
        let target = target_folder.join(format!("target-{unique}.txt"));
        fs::create_dir_all(&target_folder).expect("create Notepad target folder");
        fs::write(&source, "RHFiles controlled source file\n").expect("write Notepad source file");
        fs::write(&target, "RHFiles controlled target file\n").expect("write Notepad target file");

        let process = Command::new("notepad.exe")
            .arg(&source)
            .spawn()
            .expect("start controlled Notepad process");
        let process_id = process.id();
        let mut guard = NotepadTestGuard {
            dialog_hwnd: None,
            main_hwnd: None,
            process: Some(process),
            root,
        };
        let source_name = source.file_name().unwrap().to_string_lossy().into_owned();
        let target_name = target.file_name().unwrap().to_string_lossy().into_owned();
        let target_folder_name = target_folder
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();

        let main_hwnd =
            wait_for_process_window("Notepad", &source_name, process_id, Duration::from_secs(10))
                .expect("the controlled Notepad window did not open");
        guard.main_hwnd = Some(main_hwnd);
        focus_controlled_window(main_hwnd);
        // The title is visible slightly before Notepad finishes wiring its
        // native menu on slower Windows hosts.
        thread::sleep(Duration::from_millis(300));
        let menu = unsafe { GetMenu(main_hwnd) };
        assert!(!menu.0.is_null(), "controlled Notepad has no native menu");
        let file_menu = unsafe { GetSubMenu(menu, 0) };
        assert!(
            !file_menu.0.is_null(),
            "controlled Notepad has no File menu"
        );
        let open_command = menu_command_with_accelerator(file_menu, "Ctrl+O")
            .expect("Notepad Open command was not found");
        unsafe {
            PostMessageW(
                Some(main_hwnd),
                WM_COMMAND,
                WPARAM(open_command as usize),
                LPARAM(0),
            )
        }
        .expect("invoke Notepad's Open command");

        let dialog_hwnd =
            wait_for_process_window("#32770", "", process_id, Duration::from_secs(10))
                .expect("Notepad did not open its native file dialog");
        guard.dialog_hwnd = Some(dialog_hwnd);
        focus_controlled_window(dialog_hwnd);
        let mut dialog_evidence = DialogEvidence::default();
        unsafe {
            let _ = EnumChildWindows(
                Some(dialog_hwnd),
                Some(collect_dialog_evidence),
                LPARAM((&mut dialog_evidence as *mut DialogEvidence) as isize),
            );
        }
        assert_eq!(
            supported_foreground_window(),
            Some(dialog_hwnd),
            "Notepad's native dialog was not recognized: {dialog_evidence:?}"
        );

        navigate_target_window(dialog_hwnd.0 as usize, &target_folder.to_string_lossy())
            .expect("select the target from the RHFiles location picker");
        assert_eq!(
            LAST_NAVIGATION_METHOD.load(Ordering::Acquire),
            2,
            "the common file dialog fell back to visible per-character input"
        );
        assert!(
            wait_for_child_text(
                dialog_hwnd,
                "ToolbarWindow32",
                &target_folder_name,
                Duration::from_secs(10),
            ),
            "the location picker did not navigate Notepad's dialog to the selected folder"
        );

        focus_controlled_window(dialog_hwnd);
        assert!(send_inputs(&[
            key_input(VK_MENU, KEYBD_EVENT_FLAGS(0)),
            key_input(VIRTUAL_KEY(b'N' as u16), KEYBD_EVENT_FLAGS(0)),
            key_input(VIRTUAL_KEY(b'N' as u16), KEYEVENTF_KEYUP),
            key_input(VK_MENU, KEYEVENTF_KEYUP),
        ]));
        thread::sleep(Duration::from_millis(150));
        assert!(send_inputs(&[
            key_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
            key_input(VIRTUAL_KEY(b'A' as u16), KEYBD_EVENT_FLAGS(0)),
            key_input(VIRTUAL_KEY(b'A' as u16), KEYEVENTF_KEYUP),
            key_input(VK_CONTROL, KEYEVENTF_KEYUP),
        ]));
        let mut filename_inputs = Vec::with_capacity(target_name.encode_utf16().count() * 2);
        for unit in target_name.encode_utf16() {
            filename_inputs.push(unicode_input(unit, false));
            filename_inputs.push(unicode_input(unit, true));
        }
        assert!(send_inputs(&filename_inputs));
        assert!(send_inputs(&[
            key_input(VK_RETURN, KEYBD_EVENT_FLAGS(0)),
            key_input(VK_RETURN, KEYEVENTF_KEYUP),
        ]));

        let reopened =
            wait_for_process_window("Notepad", &target_name, process_id, Duration::from_secs(10))
                .expect("Notepad did not open the target file by its basename after navigation");
        assert_eq!(reopened, main_hwnd);
        guard.dialog_hwnd = None;
    }

    #[test]
    #[ignore = "opens and closes a controlled Microsoft Edge file picker"]
    fn navigates_a_real_edge_file_picker_without_character_typing() {
        let edge = [
            std::env::var_os("PROGRAMFILES(X86)")
                .map(std::path::PathBuf::from)
                .map(|path| path.join("Microsoft/Edge/Application/msedge.exe")),
            std::env::var_os("PROGRAMFILES")
                .map(std::path::PathBuf::from)
                .map(|path| path.join("Microsoft/Edge/Application/msedge.exe")),
        ]
        .into_iter()
        .flatten()
        .find(|path| path.is_file())
        .expect("Microsoft Edge is not installed in a standard location");
        let unique = format!(
            "{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after the Unix epoch")
                .as_millis()
        );
        let root = std::env::temp_dir().join(format!("rhfiles-edge-e2e-{unique}"));
        let profile = root.join("edge-profile");
        let target_folder = root.join(format!("edge-target-{unique}"));
        let target_marker_name = format!("edge-marker-{unique}.txt");
        let page = root.join("picker.html");
        fs::create_dir_all(&profile).expect("create Edge test profile");
        fs::create_dir_all(&target_folder).expect("create Edge target folder");
        fs::write(
            target_folder.join(&target_marker_name),
            "RHFiles Edge picker test\n",
        )
        .expect("write Edge target marker");
        let edge_title = format!("RHFiles Edge Dialog {unique}");
        let button_name = format!("Open RHFiles picker {unique}");
        fs::write(
            &page,
            format!(
                "<!doctype html><meta charset=\"utf-8\"><title>{edge_title}</title>\
                 <button onclick=\"document.getElementById('file').click()\">{button_name}</button>\
                 <input id=\"file\" type=\"file\" hidden>"
            ),
        )
        .expect("write controlled Edge page");
        let page_url = url::Url::from_file_path(&page)
            .expect("convert Edge page path to a file URL")
            .to_string();

        let process = Command::new(edge)
            .arg("--new-window")
            .arg("--no-first-run")
            .arg("--no-default-browser-check")
            .arg("--disable-sync")
            .arg(format!("--user-data-dir={}", profile.display()))
            .arg(page_url)
            .spawn()
            .expect("start controlled Microsoft Edge window");
        let mut guard = EdgeTestGuard {
            dialog_hwnd: None,
            browser_hwnd: None,
            process: Some(process),
            root,
        };
        let browser_hwnd = top_level_window_with_title("Chrome_WidgetWin_1", &edge_title, None)
            .or_else(|| {
                let deadline = Instant::now() + Duration::from_secs(15);
                loop {
                    if let Some(hwnd) =
                        top_level_window_with_title("Chrome_WidgetWin_1", &edge_title, None)
                    {
                        break Some(hwnd);
                    }
                    if Instant::now() >= deadline {
                        break None;
                    }
                    thread::sleep(Duration::from_millis(100));
                }
            })
            .expect("the controlled Edge test page did not open");
        guard.browser_hwnd = Some(browser_hwnd);
        let mut browser_process_id = 0u32;
        unsafe { GetWindowThreadProcessId(browser_hwnd, Some(&mut browser_process_id)) };
        assert_ne!(browser_process_id, 0, "could not identify the Edge process");
        focus_controlled_window(browser_hwnd);
        let button_deadline = Instant::now() + Duration::from_secs(8);
        let button_invoked = loop {
            if invoke_named_uia_element(browser_hwnd, &button_name) {
                break true;
            }
            if Instant::now() >= button_deadline {
                break false;
            }
            thread::sleep(Duration::from_millis(150));
        };
        assert!(
            button_invoked,
            "could not invoke the controlled Edge file-picker button"
        );
        let dialog_deadline = Instant::now() + Duration::from_secs(10);
        let dialog_hwnd = loop {
            let foreground = unsafe { GetForegroundWindow() };
            if window_class(foreground).eq_ignore_ascii_case("#32770")
                && is_supported_window(foreground)
                && unsafe { GetWindow(foreground, GW_OWNER) }.ok() == Some(browser_hwnd)
            {
                break Some(foreground);
            }
            if Instant::now() >= dialog_deadline {
                break None;
            }
            thread::sleep(Duration::from_millis(100));
        }
        .expect("Edge did not open its native Windows file picker");
        guard.dialog_hwnd = Some(dialog_hwnd);
        focus_controlled_window(dialog_hwnd);
        navigate_target_window(dialog_hwnd.0 as usize, &target_folder.to_string_lossy())
            .expect("navigate Edge's native file picker");
        assert_eq!(
            LAST_NAVIGATION_METHOD.load(Ordering::Acquire),
            2,
            "Edge's file picker fell back to visible per-character input"
        );
        let reached_target =
            wait_for_uia_name(dialog_hwnd, &target_marker_name, Duration::from_secs(10));
        assert!(
            reached_target,
            "Edge's file picker did not reach the selected folder; focused={}; foreground={:?}; names={:?}",
            focused_uia_debug(),
            unsafe { GetForegroundWindow() },
            uia_descendant_names(dialog_hwnd),
        );
    }
}
