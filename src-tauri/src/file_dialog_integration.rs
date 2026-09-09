use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{self, SyncSender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT,
    KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, SendInput, VIRTUAL_KEY, VK_BACK, VK_CONTROL, VK_D,
    VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_HOME, VK_INSERT, VK_LEFT, VK_LWIN, VK_MENU, VK_OEM_1,
    VK_OEM_2, VK_OEM_3, VK_OEM_4, VK_OEM_5, VK_OEM_6, VK_OEM_7, VK_OEM_COMMA, VK_OEM_MINUS,
    VK_OEM_PERIOD, VK_OEM_PLUS, VK_RETURN, VK_RIGHT, VK_RWIN, VK_SHIFT, VK_SPACE, VK_TAB, VK_UP,
};
use windows::Win32::UI::Shell::{IShellWindows, IWebBrowser2, ShellWindows};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, EnumChildWindows, GetClassNameW, GetForegroundWindow,
    GetMessageW, HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN,
    WM_SYSKEYUP,
};
use windows_core::{BOOL, Interface};

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

#[derive(Clone, Default)]
struct IntegrationConfig {
    enabled: bool,
    path: Option<String>,
    hotkeys: Vec<Hotkey>,
    shortcut_labels: Vec<String>,
    rejected_shortcuts: Vec<String>,
}

#[derive(Debug)]
struct NavigationRequest {
    hwnd: usize,
    trigger_key: u32,
    path: String,
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
    registered_shortcuts: Vec<String>,
    rejected_shortcuts: Vec<String>,
    supported_targets: Vec<&'static str>,
}

static CONFIG: OnceLock<Mutex<IntegrationConfig>> = OnceLock::new();
static HOOK_START_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static HOOK_RUNNING: AtomicBool = AtomicBool::new(false);
static CONSUMED_KEY: AtomicU32 = AtomicU32::new(0);
static ACTION_SENDER: OnceLock<SyncSender<NavigationRequest>> = OnceLock::new();

fn config() -> &'static Mutex<IntegrationConfig> {
    CONFIG.get_or_init(|| Mutex::new(IntegrationConfig::default()))
}

fn lock_config() -> std::sync::MutexGuard<'static, IntegrationConfig> {
    config()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn action_sender() -> &'static SyncSender<NavigationRequest> {
    ACTION_SENDER.get_or_init(|| {
        let (sender, receiver) = mpsc::sync_channel::<NavigationRequest>(4);
        thread::Builder::new()
            .name("rhfiles-dialog-navigation".to_string())
            .spawn(move || {
                while let Ok(request) = receiver.recv() {
                    navigate_window(request);
                }
            })
            .expect("failed to start file-dialog navigation worker");
        sender
    })
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

fn supported_foreground_window() -> Option<HWND> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return None;
    }
    let top_class = window_class(hwnd);
    if matches!(
        top_class.to_ascii_lowercase().as_str(),
        "cabinetwclass" | "explorewclass"
    ) {
        return Some(hwnd);
    }
    if top_class != "#32770" {
        return None;
    }

    let mut evidence = DialogEvidence::default();
    unsafe {
        let _ = EnumChildWindows(
            Some(hwnd),
            Some(collect_dialog_evidence),
            LPARAM((&mut evidence as *mut DialogEvidence) as isize),
        );
    }
    is_supported_window_shape(&top_class, &evidence).then_some(hwnd)
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
    let Some(path) = snapshot.path else {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    };
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
        .try_send(NavigationRequest {
            hwnd: hwnd.0 as usize,
            trigger_key: event.vkCode,
            path,
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
            let url = VARIANT::from(path);
            let empty = VARIANT::default();
            browser
                .Navigate2(&url, Some(&empty), Some(&empty), Some(&empty), Some(&empty))
                .map_err(|error| format!("File Explorer rejected the folder: {error}"))?;
            return Ok(true);
        }
    }
    Ok(false)
}

fn navigate_window(request: NavigationRequest) {
    if !wait_for_trigger_release(request.trigger_key) {
        return;
    }
    thread::sleep(Duration::from_millis(25));
    let foreground = unsafe { GetForegroundWindow() };
    if foreground.0 as usize != request.hwnd || supported_foreground_window().is_none() {
        return;
    }

    let foreground_class = window_class(foreground);
    if matches!(
        foreground_class.to_ascii_lowercase().as_str(),
        "cabinetwclass" | "explorewclass"
    ) && navigate_explorer_with_shell(request.hwnd, &request.path).unwrap_or(false)
    {
        return;
    }

    // Common Windows file dialogs (and the legacy Explorer fallback) focus
    // their address bar with Alt+D. Unicode SendInput avoids the clipboard.
    let focus_address = [
        key_input(VK_MENU, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_D, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_D, KEYEVENTF_KEYUP),
        key_input(VK_MENU, KEYEVENTF_KEYUP),
    ];
    if !send_inputs(&focus_address) {
        return;
    }
    // Explorer's breadcrumb animation and the modern IFileDialog address bar
    // can take more than one frame to turn into an editable control.
    thread::sleep(Duration::from_millis(220));
    let dialog_path = if request.path.ends_with('\\') {
        request.path.clone()
    } else {
        format!("{}\\", request.path)
    };
    let select_all = [
        key_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
        key_input(VIRTUAL_KEY(b'A' as u16), KEYBD_EVENT_FLAGS(0)),
        key_input(VIRTUAL_KEY(b'A' as u16), KEYEVENTF_KEYUP),
        key_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    if !send_inputs(&select_all) {
        return;
    }
    thread::sleep(Duration::from_millis(40));

    let mut text_inputs = Vec::with_capacity(dialog_path.encode_utf16().count() * 2);
    for unit in dialog_path.encode_utf16() {
        text_inputs.push(unicode_input(unit, false));
        text_inputs.push(unicode_input(unit, true));
    }
    if !send_inputs(&text_inputs) {
        return;
    }
    thread::sleep(Duration::from_millis(100));
    let _ = send_inputs(&[
        key_input(VK_RETURN, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_RETURN, KEYEVENTF_KEYUP),
    ]);
}

fn current_status() -> FileDialogIntegrationStatus {
    let snapshot = lock_config().clone();
    FileDialogIntegrationStatus {
        enabled: snapshot.enabled,
        running: HOOK_RUNNING.load(Ordering::Acquire),
        path_available: snapshot.path.is_some(),
        current_path: snapshot.path,
        registered_shortcuts: snapshot.shortcut_labels,
        rejected_shortcuts: snapshot.rejected_shortcuts,
        supported_targets: vec!["windowsFileDialog", "windowsExplorer"],
    }
}

#[tauri::command]
pub fn configure_file_dialog_integration(
    enabled: bool,
    path: Option<String>,
    shortcuts: Vec<String>,
) -> Result<FileDialogIntegrationStatus, String> {
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
    if enabled && hotkeys.is_empty() {
        return Err("Configure at least one shortcut containing Ctrl, Shift, or Alt".to_string());
    }

    {
        let mut state = lock_config();
        state.enabled = enabled;
        state.path = normalize_folder_path(path);
        state.hotkeys = hotkeys;
        state.shortcut_labels = shortcut_labels;
        state.rejected_shortcuts = rejected_shortcuts;
    }
    if enabled && let Err(error) = ensure_hook_started() {
        lock_config().enabled = false;
        return Err(error);
    }
    Ok(current_status())
}

#[tauri::command]
pub fn get_file_dialog_integration_status() -> FileDialogIntegrationStatus {
    current_status()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        process::{Child, Command},
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetMenu, GetMenuItemCount, GetMenuItemID, GetMenuStringW, GetSubMenu,
        GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible, MF_BYPOSITION, PostMessageW,
        SetForegroundWindow, WM_CLOSE, WM_COMMAND,
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

    fn send_test_ctrl_g() {
        let g = VIRTUAL_KEY(b'G' as u16);
        assert!(send_inputs(&[key_input_with_marker(
            VK_CONTROL,
            KEYBD_EVENT_FLAGS(0),
            TEST_INPUT_MARKER,
        )]));
        let modifier_deadline = Instant::now() + Duration::from_secs(1);
        while !is_key_down(VK_CONTROL) && Instant::now() < modifier_deadline {
            thread::sleep(Duration::from_millis(10));
        }
        assert!(
            is_key_down(VK_CONTROL),
            "test Ctrl modifier did not activate"
        );
        assert!(send_inputs(&[
            key_input_with_marker(g, KEYBD_EVENT_FLAGS(0), TEST_INPUT_MARKER),
            key_input_with_marker(g, KEYEVENTF_KEYUP, TEST_INPUT_MARKER),
        ]));
        assert!(send_inputs(&[key_input_with_marker(
            VK_CONTROL,
            KEYEVENTF_KEYUP,
            TEST_INPUT_MARKER,
        )]));
    }

    struct ExplorerTestGuard {
        hwnd: Option<HWND>,
        root: std::path::PathBuf,
    }

    impl Drop for ExplorerTestGuard {
        fn drop(&mut self) {
            lock_config().enabled = false;
            if let Some(hwnd) = self.hwnd {
                let _ = unsafe { PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)) };
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
    fn accepts_drive_and_unc_folders_but_not_virtual_locations() {
        assert_eq!(
            normalize_folder_path(Some("C:".into())).as_deref(),
            Some("C:\\")
        );
        assert!(normalize_folder_path(Some("\\\\server\\share".into())).is_some());
        assert!(normalize_folder_path(Some("home://".into())).is_none());
    }

    #[test]
    fn installs_the_out_of_process_hook_and_can_disable_it() {
        let enabled = configure_file_dialog_integration(
            true,
            Some("C:\\".to_string()),
            vec!["Ctrl+Shift+F24".to_string()],
        )
        .expect("the low-level Windows hook should install");
        assert!(enabled.enabled);
        assert!(enabled.running);
        assert!(enabled.path_available);

        let disabled = configure_file_dialog_integration(
            false,
            Some("C:\\".to_string()),
            vec!["Ctrl+Shift+F24".to_string()],
        )
        .expect("the hook should be disableable without stopping its worker");
        assert!(!disabled.enabled);
        assert!(disabled.running);
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

        let status = configure_file_dialog_integration(
            true,
            Some(target.to_string_lossy().into_owned()),
            vec!["Ctrl+G".to_string()],
        )
        .expect("enable the Explorer integration");
        assert!(status.running);

        focus_controlled_window(hwnd);
        send_test_ctrl_g();

        let navigated = wait_for_explorer_title(&target_title, Duration::from_secs(10))
            .expect("Ctrl+G did not navigate Explorer to the configured RHFiles folder");
        assert_eq!(
            navigated, hwnd,
            "navigation unexpectedly changed Explorer windows"
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

        configure_file_dialog_integration(
            true,
            Some(target_folder.to_string_lossy().into_owned()),
            vec!["Ctrl+G".to_string()],
        )
        .expect("enable the native file-dialog integration");
        send_test_ctrl_g();
        assert!(
            wait_for_child_text(
                dialog_hwnd,
                "ToolbarWindow32",
                &target_folder_name,
                Duration::from_secs(10),
            ),
            "Ctrl+G did not navigate Notepad's dialog to the configured folder"
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
}
