use crate::types::*;
use pinyin::ToPinyinMulti;
use regex::RegexBuilder;

use std::collections::{HashSet, VecDeque};
use std::fs::Metadata;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// ── Everything SDK types ───────────────────────────────────────────────────

type EvSetSearchW = unsafe extern "system" fn(*const u16);
type EvSetMatchPath = unsafe extern "system" fn(i32);
type EvSetMatchCase = unsafe extern "system" fn(i32);
type EvSetRegex = unsafe extern "system" fn(i32);
type EvSetMax = unsafe extern "system" fn(u32);
type EvSetSort = unsafe extern "system" fn(u32);
type EvSetRequestFlags = unsafe extern "system" fn(u32);
type EvQueryW = unsafe extern "system" fn(i32) -> i32;

type EvGetNumResults = unsafe extern "system" fn() -> u32;
type EvGetResultPathW = unsafe extern "system" fn(u32, *mut u16, u32) -> u32;
type EvGetResultSize = unsafe extern "system" fn(u32, *mut i64) -> i32;
type EvGetResultDate = unsafe extern "system" fn(u32, *mut i64) -> i32;
type EvIsFileResult = unsafe extern "system" fn(u32) -> i32;
type EvIsFolderResult = unsafe extern "system" fn(u32) -> i32;
type EvGetLastError = unsafe extern "system" fn() -> u32;
type EvCleanup = unsafe extern "system" fn();
type EvIsDbLoaded = unsafe extern "system" fn() -> i32;

struct EverythingApi {
    _lib: &'static libloading::Library,
    set_search: libloading::Symbol<'static, EvSetSearchW>,
    set_match_path: libloading::Symbol<'static, EvSetMatchPath>,
    #[allow(dead_code)]
    set_match_case: libloading::Symbol<'static, EvSetMatchCase>,
    #[allow(dead_code)]
    set_regex: libloading::Symbol<'static, EvSetRegex>,
    set_max: libloading::Symbol<'static, EvSetMax>,
    set_sort: libloading::Symbol<'static, EvSetSort>,
    set_request_flags: libloading::Symbol<'static, EvSetRequestFlags>,
    query: libloading::Symbol<'static, EvQueryW>,
    num_results: libloading::Symbol<'static, EvGetNumResults>,
    result_path: libloading::Symbol<'static, EvGetResultPathW>,
    result_size: libloading::Symbol<'static, EvGetResultSize>,
    result_date: libloading::Symbol<'static, EvGetResultDate>,
    is_file: libloading::Symbol<'static, EvIsFileResult>,
    is_folder: libloading::Symbol<'static, EvIsFolderResult>,
    get_last_error: libloading::Symbol<'static, EvGetLastError>,
    is_db_loaded: libloading::Symbol<'static, EvIsDbLoaded>,
    _cleanup: libloading::Symbol<'static, EvCleanup>,
}

unsafe impl Send for EverythingApi {}
unsafe impl Sync for EverythingApi {}

static EV_API: Mutex<Option<EverythingApi>> = Mutex::new(None);
static EV_STARTING: AtomicBool = AtomicBool::new(false);

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

// ── DLL / EXE discovery ────────────────────────────────────────────────────

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
}

pub fn find_everything_exe() -> Option<String> {
    // 1. 系统安装路径优先（复用已有数据库）
    for c in &[
        r"C:\Program Files\Everything\Everything.exe",
        r"C:\Program Files (x86)\Everything\Everything.exe",
    ] {
        if Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    // 2. exe 同级目录（打包后捆绑的便携版）
    if let Some(dir) = exe_dir() {
        let bundled = dir.join("Everything.exe");
        if bundled.exists() {
            return Some(bundled.to_string_lossy().into_owned());
        }
    }
    // 3. 源码目录 thirdparty（开发时）
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let tp = Path::new(&manifest_dir)
            .join("thirdparty")
            .join("Everything.exe");
        if tp.exists() {
            return Some(tp.to_string_lossy().into_owned());
        }
        let tp2 = Path::new(&manifest_dir)
            .join("thirdparty")
            .join("everything.exe");
        if tp2.exists() {
            return Some(tp2.to_string_lossy().into_owned());
        }
    }
    None
}

fn find_ev_dll() -> Option<PathBuf> {
    let dll_name = if cfg!(target_arch = "x86_64") {
        "Everything64.dll"
    } else {
        "Everything32.dll"
    };

    // 1. exe 同级目录（打包后）
    if let Some(dir) = exe_dir() {
        let bundled = dir.join(dll_name);
        if bundled.exists() {
            return Some(bundled);
        }
    }

    // 2. 源码目录 thirdparty（开发时）
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let tp = Path::new(&manifest_dir)
            .join("thirdparty")
            .join("everything")
            .join("dll")
            .join(dll_name);
        if tp.exists() {
            return Some(tp);
        }
    }

    // 3. 系统安装路径
    for base in &[
        r"C:\Program Files\Everything",
        r"C:\Program Files (x86)\Everything",
    ] {
        let p = Path::new(base).join(dll_name);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

// ── Everything SDK loader ──────────────────────────────────────────────────

fn load_ev_api(dll_path: &Path) -> Result<EverythingApi, String> {
    unsafe {
        let lib: &'static libloading::Library = Box::leak(Box::new(
            libloading::Library::new(dll_path)
                .map_err(|e| format!("Failed to load {}: {}", dll_path.display(), e))?,
        ));

        Ok(EverythingApi {
            set_search: lib
                .get(b"Everything_SetSearchW")
                .map_err(|e| format!("{}", e))?,
            set_match_path: lib
                .get(b"Everything_SetMatchPath")
                .map_err(|e| format!("{}", e))?,
            set_match_case: lib
                .get(b"Everything_SetMatchCase")
                .map_err(|e| format!("{}", e))?,
            set_regex: lib
                .get(b"Everything_SetRegex")
                .map_err(|e| format!("{}", e))?,
            set_max: lib
                .get(b"Everything_SetMax")
                .map_err(|e| format!("{}", e))?,
            set_sort: lib
                .get(b"Everything_SetSort")
                .map_err(|e| format!("{}", e))?,
            set_request_flags: lib
                .get(b"Everything_SetRequestFlags")
                .map_err(|e| format!("{}", e))?,
            query: lib
                .get(b"Everything_QueryW")
                .map_err(|e| format!("{}", e))?,
            num_results: lib
                .get(b"Everything_GetNumResults")
                .map_err(|e| format!("{}", e))?,
            result_path: lib
                .get(b"Everything_GetResultFullPathNameW")
                .map_err(|e| format!("{}", e))?,
            result_size: lib
                .get(b"Everything_GetResultSize")
                .map_err(|e| format!("{}", e))?,
            result_date: lib
                .get(b"Everything_GetResultDateModified")
                .map_err(|e| format!("{}", e))?,
            is_file: lib
                .get(b"Everything_IsFileResult")
                .map_err(|e| format!("{}", e))?,
            is_folder: lib
                .get(b"Everything_IsFolderResult")
                .map_err(|e| format!("{}", e))?,
            get_last_error: lib
                .get(b"Everything_GetLastError")
                .map_err(|e| format!("{}", e))?,
            is_db_loaded: lib
                .get(b"Everything_IsDBLoaded")
                .map_err(|e| format!("{}", e))?,
            _cleanup: lib
                .get(b"Everything_CleanUp")
                .map_err(|e| format!("{}", e))?,
            _lib: lib,
        })
    }
}

fn get_ev_api() -> Result<(), String> {
    let mut guard = EV_API.lock().map_err(|e| format!("mutex error: {}", e))?;
    if guard.is_some() {
        return Ok(());
    }
    let dll = find_ev_dll().ok_or_else(|| {
        "Everything64.dll not found. Place it next to the app executable.".to_string()
    })?;
    let api = load_ev_api(&dll)?;
    *guard = Some(api);
    Ok(())
}

fn with_ev_api<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&EverythingApi) -> Result<R, String>,
{
    get_ev_api()?;
    let guard = EV_API.lock().map_err(|e| format!("mutex error: {}", e))?;
    match guard.as_ref() {
        Some(api) => f(api),
        None => Err("Everything SDK not loaded".to_string()),
    }
}

// ── Everything process management ──────────────────────────────────────────

fn is_everything_window_running() -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::FindWindowW;
        let class_name: Vec<u16> = "EVERYTHING_TASKBAR_NOTIFICATION\0".encode_utf16().collect();
        unsafe { FindWindowW(windows::core::PCWSTR(class_name.as_ptr()), None).is_ok() }
    }
    #[cfg(not(target_os = "windows"))]
    false
}

#[tauri::command]
pub fn is_everything_available() -> bool {
    find_ev_dll().is_some() && (is_everything_window_running() || find_everything_exe().is_some())
}

#[tauri::command(async)]
pub fn start_everything() -> Result<String, String> {
    if is_everything_window_running() {
        return Ok("already_running".to_string());
    }
    let ev_exe = find_everything_exe().ok_or_else(|| {
        "Everything.exe not found. Place it next to the app executable.".to_string()
    })?;
    let _child = std::process::Command::new(&ev_exe)
        .arg("-startup")
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to start Everything: {}", e))?;

    for _ in 0..8 {
        std::thread::sleep(Duration::from_millis(250));
        if is_everything_window_running() || everything_ipc_alive() {
            return Ok("started".to_string());
        }
    }
    Ok("timeout".to_string())
}

#[tauri::command(async)]
pub fn open_everything() -> Result<(), String> {
    let ev_exe = find_everything_exe().ok_or_else(|| {
        "Everything.exe not found. Place it next to the app executable.".to_string()
    })?;
    std::process::Command::new(ev_exe)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to open Everything: {error}"))
}

/// Probe the SDK IPC itself: a running Everything (any version, any window
/// class) answers an empty non-blocking query. This is more reliable than
/// FindWindow, and avoids spawning a second instance whose single-instance
/// forward would pop the user's existing Everything window to the front.
fn everything_ipc_alive() -> bool {
    with_ev_api(|api| {
        Ok(unsafe {
            let empty: Vec<u16> = vec![0u16];
            (api.set_search)(empty.as_ptr());
            (api.set_max)(0);
            (api.query)(0) != 0
        })
    })
    .unwrap_or(false)
}

fn everything_db_loaded() -> bool {
    with_ev_api(|api| Ok(unsafe { (api.is_db_loaded)() != 0 })).unwrap_or(false)
}

fn wait_for_everything_database(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if everything_ipc_alive() && everything_db_loaded() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    everything_ipc_alive() && everything_db_loaded()
}

fn ensure_everything_running() -> Result<(), String> {
    if everything_ipc_alive() {
        return if wait_for_everything_database(Duration::from_secs(2)) {
            Ok(())
        } else {
            Err(
                "EVERYTHING_DB_NOT_READY|Everything is still building or loading its index"
                    .to_string(),
            )
        };
    }
    if is_everything_window_running() {
        return Err("EVERYTHING_IPC_UNAVAILABLE|Everything is running, but RHFiles cannot communicate with it. Make sure both apps run at the same privilege level".to_string());
    }
    let result = start_everything()?;
    if result == "timeout" {
        return Err(
            "EVERYTHING_START_TIMEOUT|Everything started but did not expose its IPC endpoint"
                .to_string(),
        );
    }
    if wait_for_everything_database(Duration::from_secs(2)) {
        Ok(())
    } else {
        Err(
            "EVERYTHING_DB_NOT_READY|Everything started, but its index is not ready yet"
                .to_string(),
        )
    }
}

fn kickstart_everything_in_background() {
    if is_everything_window_running() || EV_STARTING.swap(true, Ordering::AcqRel) {
        return;
    }
    std::thread::spawn(|| {
        let _ = start_everything();
        EV_STARTING.store(false, Ordering::Release);
    });
}

// ── Search via Everything SDK ──────────────────────────────────────────────

fn filetime_to_millis(ft: i64) -> i64 {
    if ft <= 0 {
        return 0;
    }
    (ft - 116444736000000000) / 10000
}

fn filetime_to_string(ft: i64) -> String {
    let ms = filetime_to_millis(ft);
    if ms <= 0 {
        return String::new();
    }
    let secs = (ms / 1000) as i64;
    if let Some(d) = chrono::DateTime::from_timestamp(secs, ((ms % 1000) * 1_000_000) as u32) {
        d.format("%Y-%m-%d %H:%M").to_string()
    } else {
        String::new()
    }
}

fn run_ev_sdk_query(query: &str, max_results: usize) -> Result<Vec<FileInfo>, String> {
    ensure_everything_running()?;

    with_ev_api(|api| {
        let query_wide = wide(query);
        unsafe { (api.set_search)(query_wide.as_ptr()) };
        unsafe { (api.set_max)(max_results as u32) };
        unsafe { (api.set_sort)(1) }; // 1 = sort by name ascending (always fast)
        unsafe { (api.set_match_path)(1) };
        // Request size (0x10) + date modified (0x40) + full path (0x04)
        unsafe { (api.set_request_flags)(0x54) };

        let ok = unsafe { (api.query)(1) };
        if ok == 0 {
            let err_code = unsafe { (api.get_last_error)() };
            return Err(format!("Everything query failed, error code: {}", err_code));
        }

        let count = unsafe { (api.num_results)() } as usize;
        let limit = count.min(max_results);
        let mut results = Vec::with_capacity(limit);

        let mut path_buf = vec![0u16; 520];

        for i in 0..limit as u32 {
            let len = unsafe { (api.result_path)(i, path_buf.as_mut_ptr(), path_buf.len() as u32) }
                as usize;
            if len == 0 {
                continue;
            }
            let path_str = String::from_utf16_lossy(&path_buf[..len.min(path_buf.len() - 1)]);

            let is_dir = unsafe { (api.is_folder)(i) != 0 };
            let is_file = unsafe { (api.is_file)(i) != 0 };
            if !is_dir && !is_file {
                continue;
            }

            let mut li_size: i64 = 0;
            unsafe { (api.result_size)(i, &mut li_size) };
            let size = li_size as u64;

            let mut ft: i64 = 0;
            unsafe { (api.result_date)(i, &mut ft) };
            let modified = filetime_to_string(ft);
            let modified_ts = filetime_to_millis(ft);

            let name = Path::new(&path_str)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let extension = if is_dir {
                String::new()
            } else {
                Path::new(&path_str)
                    .extension()
                    .map(|e| e.to_string_lossy().into_owned())
                    .unwrap_or_default()
            };

            results.push(FileInfo {
                name,
                path: path_str,
                extension,
                is_dir,
                is_hidden: false,
                size,
                size_display: format_size(size),
                modified,
                created: String::new(),
                modified_ts,
                created_ts: 0,
                folder_size: None,
            });
        }
        Ok(results)
    })
}

fn normalized_scope_prefix(path: &str) -> String {
    let mut scope = path.replace('/', "\\");
    while scope.len() > 3 && scope.ends_with('\\') {
        scope.pop();
    }
    if !scope.ends_with('\\') {
        scope.push('\\');
    }
    scope.to_lowercase()
}

fn is_path_in_scope(candidate: &str, scope: &str) -> bool {
    candidate
        .replace('/', "\\")
        .to_lowercase()
        .starts_with(&normalized_scope_prefix(scope))
}

const MAX_PINYIN_VARIANTS: usize = 64;

fn append_alias_parts(variants: &mut Vec<String>, parts: &[String], initials_only: bool) {
    let current = std::mem::take(variants);
    let mut expanded = Vec::with_capacity((current.len() * parts.len()).min(MAX_PINYIN_VARIANTS));
    for base in current {
        for part in parts {
            if expanded.len() >= MAX_PINYIN_VARIANTS {
                break;
            }
            let mut value = base.clone();
            if initials_only {
                if let Some(initial) = part.chars().next() {
                    value.push(initial);
                }
            } else {
                value.push_str(part);
            }
            expanded.push(value);
        }
    }
    *variants = expanded;
}

fn aliases_for_name(name: &str) -> Vec<String> {
    let mut full = vec![String::new()];
    let mut initials = vec![String::new()];

    for ch in name.chars() {
        if let Some(multi) = ch.to_pinyin_multi() {
            let mut parts = Vec::new();
            for pronunciation in multi {
                let plain = pronunciation.plain().to_lowercase();
                if !parts.contains(&plain) {
                    parts.push(plain);
                }
            }
            append_alias_parts(&mut full, &parts, false);
            append_alias_parts(&mut initials, &parts, true);
        } else if ch.is_alphanumeric() {
            for lower in ch.to_lowercase() {
                for alias in &mut full {
                    alias.push(lower);
                }
                for alias in &mut initials {
                    alias.push(lower);
                }
            }
        }
    }

    let mut seen = HashSet::new();
    full.into_iter()
        .chain(initials)
        .filter(|alias| !alias.is_empty() && seen.insert(alias.clone()))
        .collect()
}

enum BuiltinMatcher {
    Plain(Vec<String>),
    Wildcard(String),
    Regex(regex::Regex),
}

impl BuiltinMatcher {
    fn from_query(query: &str) -> Result<Self, String> {
        if let Some(pattern) = query.strip_prefix("regex:") {
            return RegexBuilder::new(pattern)
                .case_insensitive(true)
                .build()
                .map(Self::Regex)
                .map_err(|error| format!("INVALID_REGEX|{error}"));
        }
        if let Some(pattern) = query.strip_prefix("wildcards:") {
            return Ok(Self::Wildcard(pattern.to_lowercase()));
        }
        let terms = query
            .to_lowercase()
            .split_whitespace()
            .map(str::to_owned)
            .collect::<Vec<_>>();
        Ok(Self::Plain(terms))
    }

    fn matches(&self, name: &str) -> bool {
        let lower = name.to_lowercase();
        match self {
            Self::Regex(regex) => regex.is_match(name),
            Self::Wildcard(pattern) => wildcard_matches(pattern, &lower),
            Self::Plain(terms) => {
                if terms.is_empty() {
                    return true;
                }
                let needs_aliases = name.chars().any(|ch| !ch.is_ascii())
                    && terms.iter().any(|term| term.is_ascii());
                let aliases = if needs_aliases {
                    aliases_for_name(name)
                } else {
                    Vec::new()
                };
                terms.iter().all(|term| {
                    lower.contains(term) || aliases.iter().any(|alias| alias.contains(term))
                })
            }
        }
    }
}

fn wildcard_matches(pattern: &str, value: &str) -> bool {
    let pattern = pattern.chars().collect::<Vec<_>>();
    let value = value.chars().collect::<Vec<_>>();
    let mut previous = vec![false; value.len() + 1];
    previous[0] = true;
    for token in pattern {
        let mut current = vec![false; value.len() + 1];
        if token == '*' {
            current[0] = previous[0];
            for index in 1..=value.len() {
                current[index] = previous[index] || current[index - 1];
            }
        } else {
            for index in 1..=value.len() {
                current[index] = previous[index - 1] && (token == '?' || token == value[index - 1]);
            }
        }
        previous = current;
    }
    previous[value.len()]
}

fn millis_since_epoch(time: SystemTime) -> i64 {
    time.duration_since(SystemTime::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(target_os = "windows")]
fn is_hidden_result(name: &str, metadata: Option<&Metadata>) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    name.starts_with('.')
        || metadata
            .map(|value| value.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0)
            .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn is_hidden_result(name: &str, _metadata: Option<&Metadata>) -> bool {
    name.starts_with('.')
}

fn filesystem_search(
    root: &Path,
    query: &str,
    max_results: usize,
) -> Result<Vec<FileInfo>, String> {
    let matcher = BuiltinMatcher::from_query(query)?;
    let initial = std::fs::read_dir(root).map_err(|error| {
        let code = match error.kind() {
            std::io::ErrorKind::PermissionDenied => "permission_denied",
            std::io::ErrorKind::NotFound => "not_found",
            std::io::ErrorKind::TimedOut => "timed_out",
            _ => "io_error",
        };
        format!("RHFILES_FS_ERROR|{code}|{error}")
    })?;

    const MAX_VISITED: usize = 100_000;
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut queue = VecDeque::new();
    let mut results = Vec::new();
    let mut visited = 0usize;

    // Preserve the already-opened root iterator so a protected root reports a
    // useful error, while inaccessible descendants can simply be skipped.
    queue.push_back((root.to_path_buf(), Some(initial)));

    while let Some((directory, opened)) = queue.pop_front() {
        if results.len() >= max_results || visited >= MAX_VISITED || Instant::now() >= deadline {
            break;
        }
        let entries = match opened {
            Some(entries) => entries,
            None => match std::fs::read_dir(&directory) {
                Ok(entries) => entries,
                Err(_) => continue,
            },
        };

        for entry in entries.flatten() {
            if results.len() >= max_results || visited >= MAX_VISITED || Instant::now() >= deadline
            {
                break;
            }
            visited += 1;
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let is_dir = file_type.is_dir();
            if is_dir && !file_type.is_symlink() {
                queue.push_back((entry.path(), None));
            }

            let name = entry.file_name().to_string_lossy().into_owned();
            if !matcher.matches(&name) {
                continue;
            }
            let metadata = entry.metadata().ok();
            let size = metadata.as_ref().map(Metadata::len).unwrap_or(0);
            let modified_time = metadata
                .as_ref()
                .and_then(|value| value.modified().ok())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            let created_time = metadata
                .as_ref()
                .and_then(|value| value.created().ok())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            let extension = if is_dir {
                String::new()
            } else {
                entry
                    .path()
                    .extension()
                    .map(|value| value.to_string_lossy().into_owned())
                    .unwrap_or_default()
            };

            results.push(FileInfo {
                name: name.clone(),
                path: entry.path().to_string_lossy().into_owned(),
                extension,
                is_dir,
                is_hidden: is_hidden_result(&name, metadata.as_ref()),
                size,
                size_display: format_size(size),
                modified: format_time(modified_time),
                created: format_time(created_time),
                modified_ts: millis_since_epoch(modified_time),
                created_ts: millis_since_epoch(created_time),
                folder_size: None,
            });
        }
    }

    results.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(results)
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command(async)]
pub fn quick_search(query: String, max_results: usize) -> Result<Vec<FileInfo>, String> {
    run_ev_sdk_query(&query, max_results)
}

#[tauri::command(async)]
pub fn search_recursive(
    path: String,
    query: String,
    max_results: usize,
) -> Result<Vec<FileInfo>, String> {
    // Folder-scoped searches must feel immediate even on the first run of the
    // portable build. Start Everything opportunistically, but use the bounded
    // filesystem engine until IPC and the database are both ready.
    if !everything_ipc_alive() || !everything_db_loaded() {
        kickstart_everything_in_background();
        return filesystem_search(Path::new(&path), &query, max_results);
    }

    let mut scope_query = path.replace('/', "\\");
    while scope_query.len() > 3 && scope_query.ends_with('\\') {
        scope_query.pop();
    }
    let everything_query = if query.is_empty() {
        format!("path:\"{}\"", scope_query)
    } else {
        format!("path:\"{}\" {}", scope_query, query)
    };
    let query_limit = max_results.saturating_mul(2).max(max_results).min(5_000);
    let mut results = match run_ev_sdk_query(&everything_query, query_limit) {
        Ok(results) => results,
        // Current-folder search must remain useful on a clean portable setup
        // where the Everything service/index is not ready yet. The bounded
        // walker skips protected descendants and never follows junctions.
        Err(_) => return filesystem_search(Path::new(&path), &query, max_results),
    };
    // Everything's path: matcher is substring based. Keep the final boundary
    // check here so a scope such as C:\\work never leaks C:\\workspace results.
    results.retain(|entry| is_path_in_scope(&entry.path, &path));
    results.truncate(max_results);
    Ok(results)
}

#[tauri::command(async)]
pub fn pinyin_aliases(names: Vec<String>) -> Vec<Vec<String>> {
    names.iter().map(|name| aliases_for_name(name)).collect()
}

#[cfg(test)]
mod tests {
    use super::{
        BuiltinMatcher, aliases_for_name, filesystem_search, is_path_in_scope, wildcard_matches,
    };

    #[test]
    fn folder_scope_accepts_direct_and_nested_children() {
        assert!(is_path_in_scope(r"D:\work\file.txt", r"D:\work"));
        assert!(is_path_in_scope(r"D:\work\src\main.rs", r"D:\work\"));
    }

    #[test]
    fn folder_scope_rejects_similar_sibling_prefixes() {
        assert!(!is_path_in_scope(r"D:\workspace\file.txt", r"D:\work"));
    }

    #[test]
    fn folder_scope_is_case_insensitive_and_handles_drive_roots() {
        assert!(is_path_in_scope(r"d:\Work\FILE.TXT", r"D:\work"));
        assert!(is_path_in_scope(r"C:\Windows\notepad.exe", r"C:\"));
    }

    #[test]
    fn pinyin_aliases_include_full_spelling_and_initials() {
        let aliases = aliases_for_name("中国人.txt");
        assert!(aliases.iter().any(|alias| alias == "zhongguorentxt"));
        assert!(aliases.iter().any(|alias| alias == "zgrtxt"));
    }

    #[test]
    fn pinyin_aliases_include_heteronyms() {
        let aliases = aliases_for_name("重庆");
        assert!(aliases.iter().any(|alias| alias == "chongqing"));
        assert!(aliases.iter().any(|alias| alias == "cq"));
    }

    #[test]
    fn builtin_plain_search_matches_middle_and_pinyin_initials() {
        let middle = BuiltinMatcher::from_query("port").unwrap();
        assert!(middle.matches("annual-report-2026.pdf"));

        let pinyin = BuiltinMatcher::from_query("zgzl").unwrap();
        assert!(pinyin.matches("中国资料.txt"));
    }

    #[test]
    fn builtin_wildcard_search_matches_case_insensitively() {
        assert!(wildcard_matches("*.jpg", "holiday.jpg"));
        assert!(wildcard_matches("report-??.pdf", "report-26.pdf"));
        assert!(!wildcard_matches("*.png", "holiday.jpg"));
    }

    #[test]
    fn filesystem_fallback_searches_nested_names_and_pinyin() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("rhfiles-search-{unique}"));
        let nested = root.join("nested");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("中国资料.txt"), b"test").unwrap();

        let results = filesystem_search(&root, "zgzl", 20).unwrap();
        assert!(results.iter().any(|entry| entry.name == "中国资料.txt"));

        std::fs::remove_dir_all(root).unwrap();
    }
}
