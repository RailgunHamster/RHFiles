use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{self, SyncSender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT,
    KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, SendInput, VIRTUAL_KEY, VK_BACK, VK_CONTROL, VK_D,
    VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_HOME, VK_INSERT, VK_LEFT, VK_LWIN, VK_MENU, VK_OEM_1,
    VK_OEM_2, VK_OEM_3, VK_OEM_4, VK_OEM_5, VK_OEM_6, VK_OEM_7, VK_OEM_COMMA, VK_OEM_MINUS,
    VK_OEM_PERIOD, VK_OEM_PLUS, VK_RETURN, VK_RIGHT, VK_RWIN, VK_SHIFT, VK_SPACE, VK_TAB, VK_UP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, EnumChildWindows, GetClassNameW, GetForegroundWindow,
    GetMessageW, HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN,
    WM_SYSKEYUP,
};
use windows_core::BOOL;

const INPUT_MARKER: usize = 0x5248_4649;

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
    if event.flags.contains(LLKHF_INJECTED) || event.dwExtraInfo == INPUT_MARKER {
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
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: INPUT_MARKER,
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

fn navigate_window(request: NavigationRequest) {
    if !wait_for_trigger_release(request.trigger_key) {
        return;
    }
    thread::sleep(Duration::from_millis(25));
    let foreground = unsafe { GetForegroundWindow() };
    if foreground.0 as usize != request.hwnd || supported_foreground_window().is_none() {
        return;
    }

    // Standard Windows file dialogs and Explorer both focus their address bar
    // with Alt+D. Unicode SendInput avoids touching the user's clipboard.
    let focus_address = [
        key_input(VK_MENU, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_D, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_D, KEYEVENTF_KEYUP),
        key_input(VK_MENU, KEYEVENTF_KEYUP),
    ];
    if !send_inputs(&focus_address) {
        return;
    }
    thread::sleep(Duration::from_millis(55));

    let mut text_inputs = Vec::with_capacity(request.path.encode_utf16().count() * 2);
    for unit in request.path.encode_utf16() {
        text_inputs.push(unicode_input(unit, false));
        text_inputs.push(unicode_input(unit, true));
    }
    if !send_inputs(&text_inputs) {
        return;
    }
    thread::sleep(Duration::from_millis(35));
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
}
