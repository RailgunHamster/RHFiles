//! Opt-in, per-user folder launching. Never replace explorer.exe or the Folder
//! class (which also owns non-filesystem Shell namespaces).
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
static LOCK: Mutex<()> = Mutex::new(());
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Settings {
    folders: bool,
    win_e: bool,
    new_window: bool,
    target: PathBuf,
    #[serde(default)]
    entries: Vec<Entry>,
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
struct Raw {
    kind: u32,
    bytes: Vec<u8>,
}
#[derive(Clone, Serialize, Deserialize)]
struct Entry {
    key: String,
    name: String,
    before: Option<Raw>,
    installed: Raw,
}
fn root() -> Result<PathBuf, String> {
    Ok(crate::profile::user_root()?.join("ShellIntegration"))
}
fn registry_lease(dir: &Path) -> Result<std::fs::File, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let file = std::fs::File::options()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(dir.join("registration.lock"))
        .map_err(|e| e.to_string())?;
    file.try_lock()
        .map_err(|_| "[busy] Another RHFiles instance is changing shell integration")?;
    Ok(file)
}
fn read_at(root: &Path) -> Result<Settings, String> {
    match std::fs::read(root.join("settings.json")) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
        Err(e) => Err(e.to_string()),
    }
}
fn write_at(root: &Path, s: &Settings) -> Result<(), String> {
    use std::io::Write;
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(root).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec(s).map_err(|e| e.to_string())?)
        .and_then(|_| file.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    file.persist(root.join("settings.json"))
        .map_err(|e| e.to_string())?;
    Ok(())
}
fn plain_path(value: &str) -> Option<String> {
    let value = value.strip_suffix(r"\.").unwrap_or(value);
    let bytes = value.as_bytes();
    let drive = bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/');
    let unc = value.starts_with(r"\\")
        && !value.starts_with(r"\\?\")
        && !value.starts_with(r"\\.\")
        && value[2..].split('\\').filter(|p| !p.is_empty()).count() >= 2;
    if value.contains('\0') || value.contains("://") || !(drive || unc) {
        return None;
    }
    Some(value.into())
}
pub fn request(args: &[String]) -> Option<Value> {
    if args.get(1).map(String::as_str) == Some("--shell-home") {
        return Some(json!({"path":"home://","shell":true}));
    }
    if args.get(1).map(String::as_str) != Some("--shell-open") {
        return None;
    }
    plain_path(args.get(2)?).map(|path| json!({"path":path,"shell":true}))
}
fn command(launcher: &Path) -> String {
    format!("\"{}\" --shell-open \"%1\\.\"", launcher.display())
}
fn raw(s: &str) -> Raw {
    Raw {
        kind: 1,
        bytes: s
            .encode_utf16()
            .chain(Some(0))
            .flat_map(u16::to_le_bytes)
            .collect(),
    }
}
fn desired(s: &Settings, launcher: &Path) -> Vec<(String, String, Raw)> {
    let mut list = Vec::new();
    if s.folders {
        for class in ["Directory", "Drive"] {
            let key = format!(r"Software\Classes\{class}\shell");
            list.push((key.clone(), "".into(), raw("RHFiles.Open")));
            list.push((
                format!(r"{key}\RHFiles.Open"),
                "".into(),
                raw("在 RHFiles 中打开 / Open in RHFiles"),
            ));
            list.push((
                format!(r"{key}\RHFiles.Open\command"),
                "".into(),
                raw(&command(launcher)),
            ));
            list.push((
                format!(r"{key}\RHFiles.Explorer"),
                "".into(),
                raw("用 Windows 资源管理器打开 / Open in Windows Explorer"),
            ));
            list.push((
                format!(r"{key}\RHFiles.Explorer\command"),
                "".into(),
                raw("explorer.exe \"%1\""),
            ));
        }
    }
    if s.win_e {
        list.push((
            r"Software\Microsoft\Windows\CurrentVersion\Run".into(),
            "RHFiles Shell shortcuts".into(),
            raw(&format!(
                "\"{}\" --rhfiles-shell-broker",
                launcher.display()
            )),
        ));
    }
    list
}
trait Registry {
    fn get(&self, key: &str, name: &str) -> Result<Option<Raw>, String>;
    fn set(&self, key: &str, name: &str, value: Option<&Raw>) -> Result<(), String>;
}
#[cfg(windows)]
struct UserRegistry;
#[cfg(windows)]
impl Registry for UserRegistry {
    fn get(&self, key: &str, name: &str) -> Result<Option<Raw>, String> {
        use winreg::{RegKey, enums::*};
        match RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(key)
            .and_then(|k| k.get_raw_value(name))
        {
            Ok(v) => Ok(Some(Raw {
                kind: v.vtype as u32,
                bytes: v.bytes,
            })),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    fn set(&self, key: &str, name: &str, value: Option<&Raw>) -> Result<(), String> {
        use winreg::{RegKey, RegValue, enums::*};
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Some(value) = value {
            let kind = match value.kind {
                1 => REG_SZ,
                2 => REG_EXPAND_SZ,
                3 => REG_BINARY,
                4 => REG_DWORD,
                7 => REG_MULTI_SZ,
                11 => REG_QWORD,
                _ => return Err("Unsupported original registry type".into()),
            };
            hkcu.create_subkey(key)
                .and_then(|(k, _)| {
                    k.set_raw_value(
                        name,
                        &RegValue {
                            vtype: kind,
                            bytes: value.bytes.clone(),
                        },
                    )
                })
                .map_err(|e| e.to_string())
        } else {
            match hkcu
                .open_subkey_with_flags(key, KEY_SET_VALUE)
                .and_then(|k| k.delete_value(name))
            {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(e.to_string()),
            }
        }
    }
}
fn restore(reg: &impl Registry, s: &mut Settings) -> Result<Vec<String>, String> {
    let mut warnings = Vec::new();
    // Only restore entries still owned by us. Preserve another application's
    // subsequent changes, including a different default file manager.
    for e in s.entries.iter().rev() {
        if reg.get(&e.key, &e.name)?.as_ref() == Some(&e.installed) {
            reg.set(&e.key, &e.name, e.before.as_ref())?;
        } else {
            warnings.push(format!(
                "{} [{}]: changed by another application; preserved",
                e.key, e.name
            ));
        }
    }
    s.entries.clear();
    Ok(warnings)
}
fn install(
    reg: &impl Registry,
    s: &mut Settings,
    launcher: &Path,
    mut persist: impl FnMut(&Settings) -> Result<(), String>,
) -> Result<(), String> {
    let result = (|| {
        for (key, name, installed) in desired(s, launcher) {
            let before = reg.get(&key, &name)?;
            s.entries.push(Entry {
                key: key.clone(),
                name: name.clone(),
                before,
                installed: installed.clone(),
            });
            persist(s)?; // Recovery journal always precedes the registry write.
            reg.set(&key, &name, Some(&installed))?;
        }
        persist(s)
    })();
    if let Err(error) = result {
        let rollback = restore(reg, s);
        s.folders = false;
        s.win_e = false;
        let journal = persist(s);
        return Err(format!(
            "{error}; rollback: {}; recovery journal: {}",
            if rollback.is_ok() {
                "restored"
            } else {
                "incomplete; use Repair"
            },
            if journal.is_ok() {
                "saved"
            } else {
                "previous journal retained; use Repair"
            }
        ));
    }
    Ok(())
}
#[tauri::command(async)]
pub fn shell_defaults_state() -> Result<Value, String> {
    let s = read_at(&root()?)?;
    Ok(
        json!({"folders":s.folders,"winE":s.win_e,"newWindow":s.new_window,"target":s.target,"targetExists":s.target.is_file(),"supported":cfg!(windows)}),
    )
}
#[tauri::command(async)]
pub fn shell_defaults_save(folders: bool, win_e: bool, new_window: bool) -> Result<Value, String> {
    #[cfg(windows)]
    {
        let _guard = LOCK.lock().map_err(|e| e.to_string())?;
        let dir = root()?;
        let _lease = registry_lease(&dir)?;
        let mut old = read_at(&dir)?;
        let warnings = restore(&UserRegistry, &mut old)?;
        old.folders = false;
        old.win_e = false;
        write_at(&dir, &old)?;
        let target = std::env::current_exe().map_err(|e| e.to_string())?;
        let launcher = dir.join("RHFilesShell.exe");
        if (folders || win_e) && !launcher.is_file() {
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            std::fs::copy(&target, &launcher).map_err(|e| e.to_string())?;
        }
        let mut next = Settings {
            folders,
            win_e,
            new_window,
            target,
            entries: Vec::new(),
        };
        install(&UserRegistry, &mut next, &launcher, |s| write_at(&dir, s))?;
        if win_e {
            use std::os::windows::process::CommandExt;
            if let Err(error) = std::process::Command::new(&launcher)
                .arg("--rhfiles-shell-broker")
                .creation_flags(0x08000000)
                .spawn()
            {
                let _ = restore(&UserRegistry, &mut next);
                next.win_e = false;
                next.folders = false;
                let _ = write_at(&dir, &next);
                notify_shell();
                return Err(format!(
                    "Shortcut broker failed; integration rolled back: {error}"
                ));
            }
        }
        notify_shell();
        Ok(
            json!({"folders":folders,"winE":win_e,"newWindow":new_window,"target":next.target,"targetExists":true,"supported":true,"warnings":warnings}),
        )
    }
    #[cfg(not(windows))]
    {
        let _ = (folders, win_e, new_window);
        Err("Windows shell integration is unavailable".into())
    }
}
#[cfg(windows)]
fn notify_shell() {
    unsafe {
        use windows::Win32::UI::Shell::*;
        SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None);
    }
}
pub fn uninstall() {
    #[cfg(windows)]
    if let Ok(dir) = root() {
        if let Ok(_lease) = registry_lease(&dir) {
            if let Ok(mut s) = read_at(&dir) {
                let _ = restore(&UserRegistry, &mut s);
                s.folders = false;
                s.win_e = false;
                let _ = write_at(&dir, &s);
                notify_shell();
            }
        }
    }
}
pub fn new_window() -> bool {
    root()
        .ok()
        .and_then(|p| read_at(&p).ok())
        .is_some_and(|s| s.new_window)
}
#[tauri::command]
pub fn shell_defaults_request(window: tauri::WebviewWindow) -> Option<Value> {
    static CONSUMED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if window.label() != "main" || CONSUMED.swap(true, std::sync::atomic::Ordering::AcqRel) {
        return None;
    }
    request(&std::env::args().collect::<Vec<_>>())
}
/// Runs before Velopack and WebView initialization, so the stable recovery
/// launcher still works after a portable folder has moved or been uninstalled.
pub fn run_if_requested() -> bool {
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--rhfiles-shell-broker") {
        #[cfg(windows)]
        let _ = broker();
        return true;
    }
    let is_launcher = std::env::current_exe()
        .ok()
        .and_then(|p| {
            p.file_name()
                .map(|s| s.to_string_lossy().eq_ignore_ascii_case("RHFilesShell.exe"))
        })
        .unwrap_or(false);
    if !is_launcher {
        return false;
    }
    let request = request(&args);
    let target = root()
        .ok()
        .and_then(|dir| read_at(&dir).ok())
        .map(|s| s.target);
    if let Some(target) = target.filter(|p| p.is_file()) {
        let _ = std::process::Command::new(target)
            .args(args.iter().skip(1))
            .spawn();
    } else {
        uninstall();
        #[cfg(windows)]
        {
            let mut c = std::process::Command::new("explorer.exe");
            if let Some(p) = request
                .and_then(|r| r["path"].as_str().map(str::to_owned))
                .filter(|p| p != "home://")
            {
                c.arg(p);
            }
            let _ = c.spawn();
        }
    }
    true
}

#[cfg(windows)]
fn broker() -> Result<(), String> {
    use std::sync::{
        OnceLock,
        atomic::{AtomicBool, Ordering},
    };
    use windows::{
        Win32::{
            Foundation::*,
            System::{LibraryLoader::*, Threading::*},
            UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
        },
        core::HSTRING,
    };
    static ENABLED: AtomicBool = AtomicBool::new(false);
    static HELD: AtomicBool = AtomicBool::new(false);
    static SEND: OnceLock<std::sync::mpsc::SyncSender<()>> = OnceLock::new();
    unsafe extern "system" fn hook(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
        if code == HC_ACTION as i32 && ENABLED.load(Ordering::Relaxed) {
            let key = unsafe { &*(l.0 as *const KBDLLHOOKSTRUCT) };
            if key.vkCode == b'E' as u32
                && (w.0 == WM_KEYUP as usize || w.0 == WM_SYSKEYUP as usize)
                && HELD.swap(false, Ordering::Relaxed)
            {
                return LRESULT(1);
            }
            let win = unsafe {
                GetAsyncKeyState(VK_LWIN.0 as i32) < 0 || GetAsyncKeyState(VK_RWIN.0 as i32) < 0
            };
            let modifiers = unsafe {
                GetAsyncKeyState(VK_CONTROL.0 as i32) < 0
                    || GetAsyncKeyState(VK_MENU.0 as i32) < 0
                    || GetAsyncKeyState(VK_SHIFT.0 as i32) < 0
            };
            if key.vkCode == b'E' as u32 && win && !modifiers && key.flags.0 & LLKHF_INJECTED.0 == 0
            {
                if (w.0 == WM_KEYDOWN as usize || w.0 == WM_SYSKEYDOWN as usize)
                    && !HELD.swap(true, Ordering::Relaxed)
                {
                    // Mask the otherwise unconsumed Windows-key release so it
                    // doesn't also open Start. Never remap any other chord.
                    let inputs = [
                        INPUT {
                            r#type: INPUT_KEYBOARD,
                            Anonymous: INPUT_0 {
                                ki: KEYBDINPUT {
                                    wVk: VK_CONTROL,
                                    ..Default::default()
                                },
                            },
                        },
                        INPUT {
                            r#type: INPUT_KEYBOARD,
                            Anonymous: INPUT_0 {
                                ki: KEYBDINPUT {
                                    wVk: VK_CONTROL,
                                    dwFlags: KEYEVENTF_KEYUP,
                                    ..Default::default()
                                },
                            },
                        },
                    ];
                    unsafe {
                        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
                    }
                    if let Some(tx) = SEND.get() {
                        let _ = tx.try_send(());
                    }
                }
                return LRESULT(1);
            }
        }
        unsafe { CallNextHookEx(None, code, w, l) }
    }
    let dir = root()?;
    let name = HSTRING::from(format!("Local\\RHFilesShell-{:x}", {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        dir.hash(&mut h);
        h.finish()
    }));
    let mutex = unsafe { CreateMutexW(None, false, &name) }.map_err(|e| e.to_string())?;
    struct Handle(HANDLE);
    impl Drop for Handle {
        fn drop(&mut self) {
            let _ = unsafe { CloseHandle(self.0) };
        }
    }
    let _mutex = Handle(mutex);
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        return Ok(());
    }
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let _ = SEND.set(tx);
    let launcher = dir.join("RHFilesShell.exe");
    std::thread::spawn(move || {
        use std::os::windows::process::CommandExt;
        let mut last = std::time::Instant::now() - std::time::Duration::from_secs(1);
        for () in rx {
            if last.elapsed().as_millis() < 300 {
                continue;
            }
            last = std::time::Instant::now();
            let _ = std::process::Command::new(&launcher)
                .arg("--shell-home")
                .creation_flags(0x08000000)
                .spawn();
        }
    });
    let module = unsafe { GetModuleHandleW(None) }.map_err(|e| e.to_string())?;
    let installed =
        unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook), Some(module.into()), 0) }
            .map_err(|e| e.to_string())?;
    let timer = unsafe { SetTimer(None, 0, 1000, None) };
    if timer == 0 {
        let _ = unsafe { UnhookWindowsHookEx(installed) };
        return Err("Cannot monitor shortcut settings; hook removed".into());
    }
    let mut msg = MSG::default();
    loop {
        let s = read_at(&dir)?;
        if !s.win_e || !s.target.is_file() {
            ENABLED.store(false, Ordering::Relaxed);
            if !s.target.is_file() {
                uninstall();
            }
            break;
        }
        ENABLED.store(true, Ordering::Relaxed);
        if unsafe { GetMessageW(&mut msg, None, 0, 0) }.0 <= 0 {
            break;
        }
        if msg.message != WM_TIMER {
            unsafe {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }
    unsafe {
        let _ = KillTimer(None, timer);
        let _ = UnhookWindowsHookEx(installed);
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, collections::BTreeMap};
    #[derive(Default)]
    struct Memory(RefCell<BTreeMap<(String, String), Raw>>);
    impl Registry for Memory {
        fn get(&self, k: &str, n: &str) -> Result<Option<Raw>, String> {
            Ok(self.0.borrow().get(&(k.into(), n.into())).cloned())
        }
        fn set(&self, k: &str, n: &str, v: Option<&Raw>) -> Result<(), String> {
            let mut m = self.0.borrow_mut();
            if let Some(v) = v {
                m.insert((k.into(), n.into()), v.clone());
            } else {
                m.remove(&(k.into(), n.into()));
            }
            Ok(())
        }
    }
    #[test]
    fn parses_only_plain_filesystem_shell_paths() {
        for p in [r"C:\", r"C:\a b\中文", r"\\server\share\a"] {
            let r = request(&["exe".into(), "--shell-open".into(), format!("{p}\\.")]).unwrap();
            assert_eq!(r["path"], p);
        }
        for p in [
            "shell:RecycleBinFolder",
            "::{CLSID}",
            "rh://device/",
            "relative",
            r"\\?\C:\a",
            r"\\.\pipe\x",
        ] {
            assert!(plain_path(p).is_none(), "{p}");
        }
    }
    #[test]
    fn conditional_restore_preserves_subsequent_changes() {
        let reg = Memory::default();
        let original = raw("OtherFileManager");
        let ours = raw("RHFiles.Open");
        let e = Entry {
            key: "Directory\\shell".into(),
            name: "".into(),
            before: Some(original.clone()),
            installed: ours.clone(),
        };
        reg.set(&e.key, "", Some(&ours)).unwrap();
        let mut s = Settings {
            entries: vec![e.clone()],
            ..Default::default()
        };
        assert!(restore(&reg, &mut s).unwrap().is_empty());
        assert_eq!(reg.get(&e.key, "").unwrap(), Some(original));
        let third = raw("ThirdManager");
        reg.set(&e.key, "", Some(&third)).unwrap();
        s.entries = vec![e];
        assert_eq!(restore(&reg, &mut s).unwrap().len(), 1);
        assert_eq!(reg.get("Directory\\shell", "").unwrap(), Some(third));
    }
    #[test]
    fn registration_never_touches_shell_namespaces_or_machine_scope() {
        let settings = Settings {
            folders: true,
            win_e: true,
            ..Default::default()
        };
        let entries = desired(&settings, Path::new(r"C:\App Data\RHFilesShell.exe"));
        assert_eq!(entries.len(), 11);
        assert!(
            entries
                .iter()
                .all(|(k, _, _)| !k.contains("Classes\\Folder\\")
                    && !k.contains("CLSID")
                    && !k.contains("Winlogon"))
        );
        assert!(command(Path::new("launcher")).contains(r#"%1\."#));
    }
    #[test]
    fn journal_failure_rolls_back_prior_writes_without_losing_the_recovery_record() {
        let reg = Memory::default();
        let mut settings = Settings {
            folders: true,
            win_e: true,
            ..Default::default()
        };
        let mut writes = 0;
        let mut last = Settings::default();
        let result = install(&reg, &mut settings, Path::new("launcher"), |s| {
            writes += 1;
            if writes == 3 {
                return Err("simulated disk failure".into());
            }
            last = s.clone();
            Ok(())
        });
        assert!(result.unwrap_err().contains("rollback: restored"));
        assert!(reg.0.borrow().is_empty());
        assert!(settings.entries.is_empty());
        assert!(!last.folders && !last.win_e);
    }
}
