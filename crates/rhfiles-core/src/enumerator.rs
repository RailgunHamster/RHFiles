use std::path::Path;
use std::process::Command;
use std::time::SystemTime;

use crate::{DriveInfo, FileEntry};

fn hidden_command(program: &str) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

pub fn list_dir(path: &Path) -> std::io::Result<Vec<FileEntry>> {
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(path)? {
        // Directory contents can change while they are being enumerated, and a
        // single child may be an inaccessible reparse point. Explorer-style
        // listing should keep the usable entries instead of failing the whole
        // folder because one child disappeared or denied metadata access.
        let Ok(entry) = entry else { continue };
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        let (is_hidden, is_system) = attribute_flags(&metadata);
        let is_dot = is_dot_name(&name);
        let extension = if metadata.is_dir() {
            String::new()
        } else {
            Path::new(&name)
                .extension()
                .map(|e| e.to_string_lossy().into_owned())
                .unwrap_or_default()
        };
        entries.push(FileEntry {
            name,
            path: entry.path(),
            extension,
            is_dir: metadata.is_dir(),
            is_hidden,
            is_system,
            is_dot,
            size: metadata.len(),
            modified: metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
            created: metadata.created().unwrap_or(SystemTime::UNIX_EPOCH),
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Windows visibility attributes, reported separately so callers can mirror
/// Explorer's two independent check boxes ("hidden items" vs "protected
/// operating system files") instead of collapsing them into one flag.
#[cfg(target_os = "windows")]
fn attribute_flags(metadata: &std::fs::Metadata) -> (bool, bool) {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
    let attr = metadata.file_attributes();
    (
        (attr & FILE_ATTRIBUTE_HIDDEN) != 0,
        (attr & FILE_ATTRIBUTE_SYSTEM) != 0,
    )
}

#[cfg(not(target_os = "windows"))]
fn attribute_flags(_metadata: &std::fs::Metadata) -> (bool, bool) {
    (false, false)
}

/// The traditional dot-prefixed hidden file, judged by name only.
fn is_dot_name(name: &str) -> bool {
    name.starts_with('.') && name != "." && name != ".."
}

pub fn get_dir_tree(path: &Path) -> std::io::Result<Vec<FileEntry>> {
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(path)? {
        let Ok(entry) = entry else { continue };
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let (is_hidden, is_system) = attribute_flags(&metadata);
        let is_dot = is_dot_name(&name);
        entries.push(FileEntry {
            name,
            path: entry.path(),
            extension: String::new(),
            is_dir: true,
            is_hidden,
            is_system,
            is_dot,
            size: 0,
            modified: metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
            created: metadata.created().unwrap_or(SystemTime::UNIX_EPOCH),
        });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

pub fn has_subdirs(path: &Path) -> bool {
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                return true;
            }
        }
    }
    false
}

pub fn generate_thumbnail(path: &Path, max_size: u32) -> Result<String, String> {
    use base64::Engine;
    let img = image::open(path).map_err(|e| e.to_string())?;
    let thumb = img.thumbnail(max_size, max_size);
    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    thumb
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

pub fn read_file_text(path: &Path, max_bytes: u64) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    file.take(max_bytes)
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;
    if buf.len() > 3 && buf[0] == 0xEF && buf[1] == 0xBB && buf[2] == 0xBF {
        Ok(String::from_utf8_lossy(&buf[3..]).into_owned())
    } else {
        Ok(String::from_utf8_lossy(&buf).into_owned())
    }
}

#[cfg(target_os = "windows")]
fn shell_execute_working_directory(path: &Path) -> Option<Vec<u16>> {
    use std::os::windows::ffi::OsStrExt;

    path.parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(|parent| {
            parent
                .as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect()
        })
}

pub fn run_powershell_script(path: &Path, keep_open: bool) -> Result<(), String> {
    let exe = if cfg!(target_os = "windows") {
        "powershell.exe"
    } else {
        "pwsh"
    };
    let mut cmd = std::process::Command::new(exe);
    if keep_open {
        cmd.arg("-NoExit");
    }
    cmd.args(["-ExecutionPolicy", "Bypass", "-File"]).arg(path);
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        cmd.current_dir(parent);
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}
pub fn open_file(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { return crate::macos::open(path); }
    #[cfg(target_os = "windows")]
    {
        if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("ps1"))
        {
            return run_powershell_script(path, false);
        }
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let directory_wide = shell_execute_working_directory(path);
        let operation: Vec<u16> = "open\0".encode_utf16().collect();
        unsafe {
            let result = windows::Win32::UI::Shell::ShellExecuteW(
                None,
                windows::core::PCWSTR(operation.as_ptr()),
                windows::core::PCWSTR(wide.as_ptr()),
                windows::core::PCWSTR::null(),
                directory_wide
                    .as_ref()
                    .map_or_else(windows::core::PCWSTR::null, |directory| {
                        windows::core::PCWSTR(directory.as_ptr())
                    }),
                windows::Win32::UI::WindowsAndMessaging::SW_SHOW,
            );
            if (result.0 as usize) <= 32 {
                return Err(format!("ShellExecuteW failed: {}", result.0 as usize));
            }
        }
        Ok(())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub fn show_properties(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("/usr/bin/osascript").args(["-e", "on run argv\ntell application \"Finder\"\nactivate\nopen information window of (POSIX file (item 1 of argv) as alias)\nend tell\nend run", "--"]).arg(path).output().map_err(|e| e.to_string())?;
        return if output.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&output.stderr).into_owned()) };
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::Win32::UI::Shell::{
            SEE_MASK_INVOKEIDLIST, SHELLEXECUTEINFOW, ShellExecuteExW,
        };
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let verb: Vec<u16> = "properties\0".encode_utf16().collect();
        unsafe {
            let mut info = SHELLEXECUTEINFOW::default();
            info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            info.lpVerb = windows::core::PCWSTR(verb.as_ptr());
            info.lpFile = windows::core::PCWSTR(wide.as_ptr());
            info.nShow = SW_SHOW.0;
            info.fMask = SEE_MASK_INVOKEIDLIST;
            let _ = ShellExecuteExW(&mut info);
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported".to_string())
    }
}

fn find_repo_root(path: &Path, marker: &str) -> Option<std::path::PathBuf> {
    let mut current = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent()?.to_path_buf()
    };
    loop {
        if current.join(marker).exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

pub fn parse_git_porcelain_for_dir(
    stdout: &str,
    rel_prefix: &str,
) -> std::collections::HashMap<String, String> {
    let mut status_map = std::collections::HashMap::new();
    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let status = line.get(0..2).unwrap_or("  ").trim();
        let raw_path = line[3..].trim_matches('"').replace('\\', "/");
        let rel = if rel_prefix.is_empty() {
            raw_path.as_str()
        } else if let Some(stripped) = raw_path.strip_prefix(rel_prefix) {
            stripped
        } else {
            continue;
        };
        let rel = rel.trim_matches('/');
        if rel.is_empty() {
            continue;
        }
        let status_str = match status {
            "M" | "MM" | "AM" => "modified",
            "A" => "added",
            "D" | "AD" => "deleted",
            "??" => "untracked",
            _ => "modified",
        };
        if let Some((first_dir, _)) = rel.split_once('/') {
            status_map
                .entry(first_dir.to_string())
                .and_modify(|existing| {
                    if *existing != "modified" && status_str != "untracked" {
                        *existing = "modified".to_string();
                    }
                })
                .or_insert_with(|| {
                    if status_str == "untracked" {
                        "untracked".to_string()
                    } else {
                        "modified".to_string()
                    }
                });
        } else {
            status_map.insert(rel.to_string(), status_str.to_string());
        }
    }
    status_map
}
fn compute_repo_rel_prefix(path: &Path, repo_root: &Path) -> String {
    path.strip_prefix(repo_root)
        .ok()
        .map(|p| {
            let s = p.to_string_lossy().replace('\\', "/");
            let trimmed = s.trim_matches('/');
            if trimmed.is_empty() {
                String::new()
            } else {
                format!("{trimmed}/")
            }
        })
        .unwrap_or_default()
}
pub fn get_git_status(path: &Path) -> Result<std::collections::HashMap<String, String>, String> {
    if let Some(repo_root) = find_repo_root(path, ".git") {
        let output = hidden_command("git")
            .args(["-c", "core.quotepath=false", "status", "--porcelain", "--no-renames", "-uall", "--", "."])
            .current_dir(path)
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Ok(std::collections::HashMap::new());
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let rel_prefix = compute_repo_rel_prefix(path, &repo_root);
        return Ok(parse_git_porcelain_for_dir(&stdout, &rel_prefix));
    }
    if let Some(verso_root) = find_repo_root(path, ".verso") {
        return get_verso_status_for_dir(path, &verso_root);
    }
    Ok(std::collections::HashMap::new())
}
fn get_verso_status_for_dir(
    path: &Path,
    verso_root: &Path,
) -> Result<std::collections::HashMap<String, String>, String> {
    let Some(install) = find_verso_installation() else {
        return Ok(std::collections::HashMap::new());
    };
    if !Path::new(&install.host).exists() {
        return Ok(std::collections::HashMap::new());
    }
    let req = serde_json::json!({
        "protocol": 1,
        "command": "status",
        "workspace": verso_root.to_string_lossy(),
        "refreshTeam": false
    });
    let mut child = hidden_command(&install.host)
        .arg("--line")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = writeln!(stdin, "{}", req);
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(std::collections::HashMap::new());
    }
    let reply: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    let Some(files) = reply.get("data").and_then(|d| d.get("files")).and_then(|f| f.as_array()) else {
        return Ok(std::collections::HashMap::new());
    };
    let rel_prefix = compute_repo_rel_prefix(path, verso_root);
    let mut status_map = std::collections::HashMap::new();
    for item in files {
        let Some(fp) = item.get("path").and_then(|p| p.as_str()) else { continue };
        let Some(st) = item.get("status").and_then(|s| s.as_str()) else { continue };
        let mapped = match st {
            "已修改" | "团队有更新" => "modified",
            "新增" => "added",
            "已删除" => "deleted",
            _ => continue,
        };
        let rel = if rel_prefix.is_empty() {
            fp
        } else if let Some(stripped) = fp.strip_prefix(&rel_prefix) {
            stripped
        } else {
            continue;
        };
        let rel = rel.trim_matches('/');
        if rel.is_empty() {
            continue;
        }
        if let Some((first_dir, _)) = rel.split_once('/') {
            status_map.entry(first_dir.to_string()).or_insert_with(|| "modified".to_string());
        } else {
            status_map.insert(rel.to_string(), mapped.to_string());
        }
    }
    Ok(status_map)
}pub fn get_drives() -> Result<Vec<DriveInfo>, String> {
    #[cfg(target_os = "macos")]
    { return serde_json::from_value(crate::macos::request(serde_json::json!({"action":"drives"}))?).map_err(|e| e.to_string()); }
    let mut drives = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let drive_letters = unsafe { windows::Win32::Storage::FileSystem::GetLogicalDrives() };
        for i in 0..26 {
            if (drive_letters >> i) & 1 != 0 {
                let letter = (b'A' + i as u8) as char;
                let drive_path = format!("{letter}:\\");
                let drive_path_wide: Vec<u16> = std::ffi::OsStr::new(&drive_path)
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                let mut volume_name = [0u16; 128];
                let mut fs_name = [0u16; 128];
                let mut serial = 0u32;
                let mut max_component = 0u32;
                let mut fs_flags = 0u32;
                unsafe {
                    let _ = windows::Win32::Storage::FileSystem::GetVolumeInformationW(
                        windows::core::PCWSTR(drive_path_wide.as_ptr()),
                        Some(&mut volume_name),
                        Some(&mut serial),
                        Some(&mut max_component),
                        Some(&mut fs_flags),
                        Some(&mut fs_name),
                    );
                }
                let label = String::from_utf16_lossy(&volume_name)
                    .trim_end_matches('\0')
                    .to_string();
                let fs_type = String::from_utf16_lossy(&fs_name)
                    .trim_end_matches('\0')
                    .to_string();
                let mut free = 0u64;
                let mut total = 0u64;
                let mut _free_call = 0u64;
                unsafe {
                    let _ = windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
                        windows::core::PCWSTR(drive_path_wide.as_ptr()),
                        Some(&mut free),
                        Some(&mut total),
                        Some(&mut _free_call),
                    );
                }
                drives.push(DriveInfo {
                    letter: format!("{letter}:"),
                    label,
                    fs_type,
                    total_bytes: total,
                    free_bytes: free,
                });
            }
        }
    }
    Ok(drives)
}

/// Maps common Windows delete HRESULTs onto a short human hint so failures
/// surface a reason instead of a bare code.
#[cfg(target_os = "windows")]
fn describe_delete_failure(code: i32) -> String {
    let code = code as u32;
    match code {
        0x8007_0005 | 5 => "access denied — the item may be in use or need administrator rights".to_string(),
        0x8007_0020 | 32 => "the file is in use by another process".to_string(),
        0x8007_007B | 123 => "the path is invalid or too long".to_string(),
        0x8007_0002 | 2 => "the item no longer exists".to_string(),
        0x8027_0000..=0x8027_FFFF => "Windows rejected the operation (item in use or protected)".to_string(),
        _ => String::new(),
    }
}

#[cfg(target_os = "windows")]
fn delete_with_windows_shell(path: &Path, allow_undo: bool) -> Result<(), String> {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        FileOperation, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT,
        FILEOPERATION_FLAGS, IFileOperation, IShellItem, SHCreateItemFromParsingName,
    };

    let apartment = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if apartment.is_err() && apartment != RPC_E_CHANGED_MODE {
        return Err(format!(
            "Unable to initialize Windows for deleting {}: {apartment}",
            path.display()
        ));
    }
    let outcome = (|| -> Result<(), String> {
        let operation: IFileOperation =
            unsafe { CoCreateInstance(&FileOperation, None, CLSCTX_ALL) }.map_err(|error| {
                format!("Unable to start the Windows delete operation: {error}")
            })?;
        let mut flags = FOF_NOCONFIRMATION.0 | FOF_SILENT.0 | FOF_NOERRORUI.0;
        if allow_undo {
            flags |= FOF_ALLOWUNDO.0;
        }
        unsafe { operation.SetOperationFlags(FILEOPERATION_FLAGS(flags)) }
            .map_err(|error| format!("Unable to configure the Windows delete operation: {error}"))?;
        let parsing_name = HSTRING::from(path.as_os_str().to_string_lossy().as_ref());
        let item: IShellItem = unsafe { SHCreateItemFromParsingName(&parsing_name, None) }
            .map_err(|error| {
                format!("Cannot open {} for deletion: {error}", path.display())
            })?;
        unsafe { operation.DeleteItem(&item, None) }
            .map_err(|error| format!("Unable to queue {} for deletion: {error}", path.display()))?;
        if let Err(error) = unsafe { operation.PerformOperations() } {
            let hint = describe_delete_failure(error.code().0);
            return Err(match hint.is_empty() {
                true => format!("Windows could not delete {}: {error}", path.display()),
                false => format!("Windows could not delete {}: {error} ({hint})", path.display()),
            });
        }
        if unsafe { operation.GetAnyOperationsAborted() }
            .map_err(|error| format!("Unable to read the Windows delete result: {error}"))?
            .as_bool()
        {
            return Err("Delete operation was cancelled".to_string());
        }
        Ok(())
    })();
    if apartment.is_ok() {
        unsafe { CoUninitialize() };
    }
    outcome
}

/// True for UNC paths and mapped network drives. The Recycle Bin is a
/// per-volume local feature, so recycling anything on a network share always
/// fails with "the Recycle Bin on \\\\host is corrupted or unavailable".
#[cfg(target_os = "windows")]
fn is_network_path(path: &Path) -> bool {
    use windows::Win32::Storage::FileSystem::GetDriveTypeW;
    use windows::core::PCWSTR;

    // DRIVE_REMOTE from the Win32 GetDriveType contract. The windows crate
    // exposes it under a feature this crate does not enable.
    const DRIVE_REMOTE: u32 = 4;

    let text = path.to_string_lossy();
    if text.starts_with("\\\\") {
        return true;
    }
    let mut chars = text.chars();
    let is_drive_letter = matches!(chars.next(), Some(letter) if letter.is_ascii_alphabetic())
        && chars.next() == Some(':');
    if !is_drive_letter {
        return false;
    }
    let root: Vec<u16> = format!("{}:\\", &text[..2])
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) == DRIVE_REMOTE }
}

pub fn delete_to_recycle_bin(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Network locations cannot be recycled; delete them permanently
        // instead of failing the whole operation.
        if is_network_path(path) {
            return delete_permanently(path);
        }
        delete_with_windows_shell(path, true)?;
    }

    #[cfg(target_os = "macos")]
    crate::macos::trash(path)?;
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    return Err("Trash is unavailable on this platform; refusing permanent deletion".into());
    Ok(())
}

pub fn delete_permanently(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    delete_with_windows_shell(path, false)?;

    #[cfg(not(target_os = "windows"))]
    {
        let metadata = std::fs::symlink_metadata(path).map_err(|error| error.to_string())?;
        if metadata.is_dir() && !metadata.file_type().is_symlink() {
            std::fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        } else {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn copy_path(src: &Path, dest_dir: &Path) -> Result<(), String> {
    let name = src.file_name().ok_or("no filename")?;
    let dest = dest_dir.join(name);
    if src.is_dir() {
        copy_dir_recursive(src, &dest)?;
    } else {
        std::fs::copy(src, &dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else {
            std::fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn move_path(src: &Path, dest_dir: &Path) -> Result<(), String> {
    let name = src.file_name().ok_or("no filename")?;
    let dest = dest_dir.join(name);
    std::fs::rename(src, &dest).map_err(|e| e.to_string())
}

// === NEW FUNCTIONS ===

pub fn folder_size(path: &Path) -> Result<u64, String> {
    if !path.is_dir() {
        return Ok(std::fs::metadata(path).map(|m| m.len()).unwrap_or(0));
    }
    let mut total: u64 = 0;
    fn walk(p: &Path, total: &mut u64) {
        if let Ok(entries) = std::fs::read_dir(p) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Ok(meta) = entry.metadata() {
                    if meta.is_dir() {
                        walk(&path, total);
                    } else {
                        *total += meta.len();
                    }
                }
            }
        }
    }
    walk(path, &mut total);
    Ok(total)
}

pub fn file_hash(path: &Path, algorithm: &str) -> Result<String, String> {
    use digest::Digest;
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut reader = std::io::BufReader::new(file);
    let mut buf = [0u8; 8192];
    match algorithm {
        "md5" => {
            let mut h = md5::Md5::new();
            loop {
                let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                h.update(&buf[..n]);
            }
            Ok(format!("{:x}", h.finalize()))
        }
        "sha1" => {
            let mut h = sha1::Sha1::new();
            loop {
                let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                h.update(&buf[..n]);
            }
            Ok(format!("{:x}", h.finalize()))
        }
        "sha256" => {
            let mut h = sha2::Sha256::new();
            loop {
                let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                h.update(&buf[..n]);
            }
            Ok(format!("{:x}", h.finalize()))
        }
        "sha512" => {
            let mut h = sha2::Sha512::new();
            loop {
                let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                h.update(&buf[..n]);
            }
            Ok(format!("{:x}", h.finalize()))
        }
        _ => Err(format!("Unknown algorithm: {algorithm}")),
    }
}

pub fn open_terminal(path: &Path, terminal: &str) -> Result<(), String> {
    let directory = if path.is_dir() {
        path
    } else {
        path.parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or(path)
    };
    let dir = directory.to_string_lossy().into_owned();
    #[cfg(target_os = "macos")]
    {
        let application = match terminal { "iterm" => "iTerm", "terminal" | "cmd" | "powershell" | "wt" => "Terminal", _ => return Err("Unsupported macOS terminal".into()) };
        let status = std::process::Command::new("/usr/bin/open").args(["-a", application, "--", &dir]).status().map_err(|e| e.to_string())?;
        return if status.success() { Ok(()) } else { Err(format!("Could not open {application}: {status}")) };
    }
    match terminal {
        "cmd" => {
            let command = format!("pushd \"{}\"", &dir);
            std::process::Command::new("cmd")
                .args(["/d", "/k", &command])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        "powershell" => {
            let command = format!("Set-Location -LiteralPath '{}'", dir.replace('\'', "''"));
            std::process::Command::new("powershell")
                .args(["-NoExit", "-Command", &command])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        "wt" => {
            std::process::Command::new("wt")
                .args(["-d", &dir])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        _ => {
            let command = format!("pushd \"{}\"", &dir);
            std::process::Command::new("cmd")
                .args(["/d", "/k", &command])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn extract_file_icon(path: &Path, size: u32) -> Result<String, String> {
    use base64::Engine;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Graphics::Gdi::{
        BI_RGB, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleDC, CreateDIBSection, DIB_RGB_COLORS,
        DeleteDC, DeleteObject, SelectObject,
    };
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Shell::{SHFILEINFOW, SHGFI_ICON, SHGetFileInfoW};
    use windows::Win32::UI::WindowsAndMessaging::{DI_NORMAL, DestroyIcon, DrawIconEx};

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut shfi = SHFILEINFOW::default();
    let flags = SHGFI_ICON.0
        | if size > 16 {
            0x000000010u32
        } else {
            0x000000000u32
        };

    let result = unsafe {
        SHGetFileInfoW(
            windows::core::PCWSTR(wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES::default(),
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            windows::Win32::UI::Shell::SHGFI_FLAGS(flags),
        )
    };

    if result == 0 || shfi.hIcon.is_invalid() {
        return Err("SHGetFileInfo failed".to_string());
    }

    let hicon = shfi.hIcon;
    let target_size = size.clamp(16, 64);

    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: target_size as i32,
            biHeight: -(target_size as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    let buf_size = (target_size * target_size * 4) as usize;
    let render_on_background = |background: u8| -> Result<Vec<u8>, String> {
        let hdc = unsafe { CreateCompatibleDC(None) };
        if hdc.is_invalid() {
            return Err("CreateCompatibleDC failed".to_string());
        }
        let mut bits = std::ptr::null_mut();
        let bitmap = match unsafe {
            CreateDIBSection(Some(hdc), &bmi, DIB_RGB_COLORS, &mut bits, None, 0)
        } {
            Ok(bitmap) => bitmap,
            Err(error) => {
                unsafe {
                    let _ = DeleteDC(hdc);
                }
                return Err(error.to_string());
            }
        };
        if bits.is_null() {
            unsafe {
                let _ = DeleteObject(bitmap.into());
                let _ = DeleteDC(hdc);
            }
            return Err("CreateDIBSection returned no pixel buffer".to_string());
        }
        let pixels = unsafe { std::slice::from_raw_parts_mut(bits.cast::<u8>(), buf_size) };
        pixels.fill(background);
        let old = unsafe { SelectObject(hdc, bitmap.into()) };
        let draw_result = unsafe {
            DrawIconEx(
                hdc,
                0,
                0,
                hicon,
                target_size as i32,
                target_size as i32,
                0,
                None,
                DI_NORMAL,
            )
        };
        let rendered = pixels.to_vec();
        unsafe {
            SelectObject(hdc, old);
            let _ = DeleteObject(bitmap.into());
            let _ = DeleteDC(hdc);
        }
        draw_result.map_err(|e| e.to_string())?;
        Ok(rendered)
    };

    let black = render_on_background(0);
    let white = render_on_background(255);
    unsafe {
        let _ = DestroyIcon(hicon);
    }
    let black = black?;
    let white = white?;

    let mut img = image::RgbaImage::new(target_size, target_size);
    for y in 0..target_size {
        for x in 0..target_size {
            let idx = ((y * target_size + x) * 4) as usize;
            let delta_b = white[idx].saturating_sub(black[idx]) as u16;
            let delta_g = white[idx + 1].saturating_sub(black[idx + 1]) as u16;
            let delta_r = white[idx + 2].saturating_sub(black[idx + 2]) as u16;
            let transparent = (delta_r + delta_g + delta_b) / 3;
            let alpha = 255u16.saturating_sub(transparent);
            let unpremultiply = |channel: u8| -> u8 {
                if alpha == 0 {
                    0
                } else {
                    ((channel as u16 * 255 + alpha / 2) / alpha).min(255) as u8
                }
            };
            img.put_pixel(
                x,
                y,
                image::Rgba([
                    unpremultiply(black[idx + 2]),
                    unpremultiply(black[idx + 1]),
                    unpremultiply(black[idx]),
                    alpha as u8,
                ]),
            );
        }
    }

    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    img.write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

#[cfg(not(target_os = "windows"))]
pub fn extract_file_icon(_path: &Path, _size: u32) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    return crate::macos::request(serde_json::json!({"action":"icon","path":_path,"size":_size}))?
        .as_str().map(str::to_owned).ok_or_else(|| "No macOS file icon".into());
    #[cfg(not(target_os = "macos"))]
    Err("Not supported".to_string())
}

#[cfg(not(windows))]
pub fn get_new_file_templates() -> Result<Vec<NewFileTemplate>, String> {
    Ok([("Text Document", ".txt"), ("Markdown", ".md"), ("JSON", ".json"), ("Shell Script", ".sh")]
        .into_iter().map(|(name, extension)| NewFileTemplate{name:name.into(),extension:extension.into(),template_content:String::new()}).collect())
}

#[cfg(target_os = "windows")]
pub fn get_new_file_templates() -> Result<Vec<NewFileTemplate>, String> {
    let mut templates = Vec::new();
    let extensions = [
        ".txt", ".md", ".html", ".css", ".js", ".py", ".rs", ".json", ".xml", ".yaml", ".sh",
        ".bat",
    ];
    let names = [
        "Text Document",
        "Markdown",
        "HTML Document",
        "CSS Stylesheet",
        "JavaScript",
        "Python File",
        "Rust Source",
        "JSON File",
        "XML Document",
        "YAML File",
        "Shell Script",
        "Batch File",
    ];

    for (i, ext) in extensions.iter().enumerate() {
        templates.push(NewFileTemplate {
            name: names[i].to_string(),
            extension: ext[1..].to_string(),
            template_content: String::new(),
        });
    }
    Ok(templates)
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::{describe_delete_failure, extract_file_icon, is_network_path, open_file, shell_execute_working_directory};
    use base64::Engine;

    #[test]
    fn delete_failures_map_to_readable_hints() {
        assert!(describe_delete_failure(0x8007_0005_u32 as i32).contains("access denied"));
        assert!(describe_delete_failure(0x8007_0020_u32 as i32).contains("in use"));
        assert!(describe_delete_failure(0x8007_007B_u32 as i32).contains("too long"));
        assert!(describe_delete_failure(0).is_empty());
    }

    #[test]
    fn network_paths_are_detected_for_recycle_bin_fallback() {
        assert!(is_network_path(std::path::Path::new(r"\\SERVER-HOME\Public\file.txt")));
        assert!(is_network_path(std::path::Path::new(r"\\server\share")));
        // Local drive letters must not be mistaken for network locations.
        let local_root = std::env::temp_dir();
        assert!(!is_network_path(&local_root));
        assert!(!is_network_path(std::path::Path::new(r"C:\Windows")));
    }

    #[test]
    fn extracts_a_visible_scaled_windows_icon() {
        let windows_dir = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".to_string());
        let path = std::path::Path::new(&windows_dir)
            .join("System32")
            .join("notepad.exe");
        let encoded = extract_file_icon(&path, 64).expect("extract system icon");
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .expect("decode icon");
        let image = image::load_from_memory(&bytes)
            .expect("parse icon png")
            .to_rgba8();
        assert_eq!(image.dimensions(), (64, 64));
        assert!(image.pixels().any(|pixel| pixel.0[3] > 0));
    }

    #[test]
    fn shell_execute_directory_is_the_nul_terminated_target_parent() {
        let path = std::path::Path::new(r"C:\Games\示例服务端\run.bat");
        let wide = shell_execute_working_directory(path).expect("batch parent directory");
        assert_eq!(wide.last(), Some(&0));
        assert_eq!(
            String::from_utf16(&wide[..wide.len() - 1]).expect("valid UTF-16 parent"),
            r"C:\Games\示例服务端"
        );
    }

    #[test]
    fn opening_a_batch_file_uses_its_directory_for_relative_files() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock after Unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "rhfiles-batch-working-directory-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&directory).expect("create batch test directory");
        let arguments = directory.join("user_jvm_args.txt");
        let script = directory.join("launch.bat");
        let result = directory.join("result.txt");
        std::fs::write(&arguments, "relative-path-ok\r\n").expect("write relative input");
        std::fs::write(
            &script,
            "@echo off\r\nfindstr /x \"relative-path-ok\" user_jvm_args.txt > \"%~dp0result.txt\"\r\n",
        )
        .expect("write batch probe");

        let observed = (|| -> Result<String, String> {
            open_file(&script)?;
            for _ in 0..200 {
                if result.is_file() {
                    let content =
                        std::fs::read_to_string(&result).map_err(|error| error.to_string())?;
                    if !content.trim().is_empty() {
                        return Ok(content);
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err("batch probe did not produce result.txt within 10 seconds".to_string())
        })();
        for _ in 0..20 {
            if !directory.exists() || std::fs::remove_dir_all(&directory).is_ok() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        assert_eq!(
            observed.expect("open and run batch probe").trim(),
            "relative-path-ok"
        );
    }
    #[test]
    fn opening_a_ps1_script_executes_with_bypass_in_its_directory() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock after Unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "rhfiles-ps1-working-directory-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&directory).expect("create ps1 test directory");
        let script = directory.join("probe.ps1");
        let result = directory.join("ps1-result.txt");
        std::fs::write(
            &script,
            "[IO.File]::WriteAllText((Join-Path $PWD 'ps1-result.txt'), 'ps1-bypass-ok')\r\n",
        )
        .expect("write ps1 probe");
        let observed = (|| -> Result<String, String> {
            open_file(&script)?;
            for _ in 0..200 {
                if result.is_file() {
                    let content =
                        std::fs::read_to_string(&result).map_err(|error| error.to_string())?;
                    if !content.trim().is_empty() {
                        return Ok(content);
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err("ps1 probe did not produce ps1-result.txt within 10 seconds".to_string())
        })();
        for _ in 0..20 {
            if !directory.exists() || std::fs::remove_dir_all(&directory).is_ok() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        assert_eq!(
            observed.expect("open and run ps1 probe").trim(),
            "ps1-bypass-ok"
        );
    }
}

#[derive(serde::Serialize, Clone)]
pub struct NewFileTemplate {
    pub name: String,
    pub extension: String,
    pub template_content: String,
}

pub fn create_new_file(parent: &Path, template: &str, name: &str) -> Result<(), String> {
    let file_name = if name.is_empty() {
        match template {
            "folder" => "New Folder".to_string(),
            ext => format!("New file.{}", ext),
        }
    } else {
        name.to_string()
    };
    if matches!(file_name.as_str(),"."|"..")||file_name.contains(['/', '\\', ':','\0']){return Err("Invalid new-file name".into());}

    if template == "folder" {
        let mut p = parent.join(&file_name);
        let mut counter = 1;
        while p.exists() {
            p = parent.join(format!("{} ({})", file_name, counter));
            counter += 1;
        }
        std::fs::create_dir(&p).map_err(|e| e.to_string())
    } else {
        let p = parent.join(&file_name);
        let content = match template {
            "html" => {
                "<!DOCTYPE html>\n<html>\n<head>\n  <title></title>\n</head>\n<body>\n</body>\n</html>\n"
            }
            "json" => "{\n}\n",
            "xml" => "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<root>\n</root>\n",
            _ => "",
        };
        use std::io::Write;
        let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(&p).map_err(|e|format!("Could not create a new file without replacing an existing item: {e}"))?;
        file.write_all(content.as_bytes()).map_err(|e|e.to_string())
    }
}

#[cfg(test)]mod new_file_safety_tests{
    use super::*;
    struct Owned(std::path::PathBuf);
    impl Owned {
        fn new() -> Self { Self::at(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()) }
        fn at(stamp: u128) -> Self {
            // Windows runners can return the same clock value in parallel
            // tests. Never let one fixture reuse or clean another's directory.
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            for _ in 0..128 {
                let sequence = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                let path = std::env::temp_dir().join(format!("rhfiles-new-file-safety-{}-{stamp}-{sequence}",std::process::id()));
                match std::fs::create_dir(&path) {
                    Ok(()) => return Self(path),
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(e) => panic!("Create isolated test directory: {e}"),
                }
            }
            panic!("Could not allocate an isolated test directory");
        }
    }
    impl Drop for Owned{fn drop(&mut self){let _=std::fs::remove_dir_all(&self.0);}}
    #[test] fn fixtures_are_distinct_even_with_the_same_clock_tick() {
        let first=Owned::at(0); let second=Owned::at(0);
        assert_ne!(first.0,second.0);drop(first);assert!(second.0.is_dir());
    }
    #[test]fn create_new_files_never_overwrite_an_existing_file_or_directory(){let data=Owned::new();std::fs::write(data.0.join("existing.json"),b"preserve").unwrap();assert!(create_new_file(&data.0,"json","existing.json").is_err());assert_eq!(std::fs::read(data.0.join("existing.json")).unwrap(),b"preserve");std::fs::create_dir(data.0.join("directory")).unwrap();assert!(create_new_file(&data.0,"txt","directory").is_err());assert!(data.0.join("directory").is_dir());}
    #[test]fn create_new_files_reject_path_names_and_keep_templates(){let data=Owned::new();for name in ["../outside","..\\outside","C:\\outside",".","..","x\0y"]{assert!(create_new_file(&data.0,"json",name).is_err());}create_new_file(&data.0,"json","new.json").unwrap();assert_eq!(std::fs::read_to_string(data.0.join("new.json")).unwrap(),"{\n}\n");}
}

pub fn get_file_association(extension: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let output = hidden_command("cmd")
            .args(["/c", &format!("assoc .{}", extension)])
            .output()
            .map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let line = stdout.trim();
        if let Some(eq_pos) = line.find('=') {
            let ftype = &line[eq_pos + 1..];
            let output2 = hidden_command("cmd")
                .args(["/c", &format!("ftype {}", ftype)])
                .output()
                .map_err(|e| e.to_string())?;
            let stdout2 = String::from_utf8_lossy(&output2.stdout);
            if let Some(eq2) = stdout2.trim().find('=') {
                let cmd_str = stdout2.trim()[eq2 + 1..].to_string();
                if let Some(exe_end) = cmd_str.find(".exe") {
                    let exe_path = cmd_str[..exe_end + 4].to_string();
                    let name = std::path::Path::new(&exe_path)
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    return Ok(name);
                }
                return Ok(cmd_str);
            }
        }
        Err("No association found".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported".to_string())
    }
}

pub fn run_as_admin(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::Win32::UI::Shell::{SHELLEXECUTEINFOW, ShellExecuteExW};
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;
        let is_ps1 = path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("ps1"));
        let wide: Vec<u16> = if is_ps1 {
            "powershell.exe\0".encode_utf16().collect()
        } else {
            path.as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect()
        };
        let params_wide: Option<Vec<u16>> = if is_ps1 {
            Some(
                format!(
                    "-ExecutionPolicy Bypass -File \"{}\"\0",
                    path.to_string_lossy()
                )
                .encode_utf16()
                .collect(),
            )
        } else {
            None
        };
        let directory_wide = shell_execute_working_directory(path);
        let verb: Vec<u16> = "runas\0".encode_utf16().collect();
        unsafe {
            let mut info = SHELLEXECUTEINFOW::default();
            info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            info.lpVerb = windows::core::PCWSTR(verb.as_ptr());
            info.lpFile = windows::core::PCWSTR(wide.as_ptr());
            if let Some(params) = params_wide.as_ref() {
                info.lpParameters = windows::core::PCWSTR(params.as_ptr());
            }
            if let Some(directory) = directory_wide.as_ref() {
                info.lpDirectory = windows::core::PCWSTR(directory.as_ptr());
            }
            info.nShow = SW_SHOW.0;
            let _ = ShellExecuteExW(&mut info);
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported".to_string())
    }
}

pub fn empty_recycle_bin() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Shell::SHEmptyRecycleBinW;
        let empty: Vec<u16> = "\0".encode_utf16().collect();
        unsafe {
            let _ = SHEmptyRecycleBinW(
                None,
                windows::core::PCWSTR(empty.as_ptr()),
                windows::Win32::UI::Shell::SHERB_NOCONFIRMATION
                    | windows::Win32::UI::Shell::SHERB_NOPROGRESSUI
                    | windows::Win32::UI::Shell::SHERB_NOSOUND,
            );
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported".to_string())
    }
}

pub fn rotate_image(path: &Path, degrees: i32) -> Result<(), String> {
    let img = image::open(path).map_err(|e| e.to_string())?;
    let rotated = match degrees {
        90 | -270 => img.rotate90(),
        180 | -180 => img.rotate180(),
        270 | -90 => img.rotate270(),
        _ => img,
    };
    rotated.save(path).map_err(|e| e.to_string())
}

pub fn read_shortcut_target(path: &Path) -> Result<ShortcutInfo, String> {
    #[cfg(target_os = "windows")]
    {
        let script = format!(
            "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('{}'); Write-Output $sc.TargetPath; Write-Output $sc.WorkingDirectory; Write-Output $sc.Arguments",
            path.to_string_lossy()
        );
        let output = hidden_command("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let lines: Vec<&str> = stdout.lines().collect();
        Ok(ShortcutInfo {
            target: lines.first().unwrap_or(&"").to_string(),
            working_dir: lines.get(1).unwrap_or(&"").to_string(),
            arguments: lines.get(2).unwrap_or(&"").to_string(),
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported".to_string())
    }
}

#[derive(serde::Serialize)]
pub struct ShortcutInfo {
    pub target: String,
    pub working_dir: String,
    pub arguments: String,
}

pub fn git_branches(path: &Path) -> Result<Vec<GitBranch>, String> {
    let output = hidden_command("git")
        .args(["branch", "--format=%(refname:short)|%(HEAD)"])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(2, '|').collect();
            if parts.len() == 2 {
                Some(GitBranch {
                    name: parts[0].to_string(),
                    is_current: parts[1] == "*",
                })
            } else {
                None
            }
        })
        .collect())
}

#[derive(serde::Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

pub fn git_checkout(path: &Path, branch: &str) -> Result<(), String> {
    let output = hidden_command("git")
        .args(["checkout", branch])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(())
    }
}

pub fn git_create_branch(path: &Path, name: &str) -> Result<(), String> {
    let output = hidden_command("git")
        .args(["checkout", "-b", name])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(())
    }
}

pub fn git_init(path: &Path) -> Result<(), String> {
    let output = hidden_command("git")
        .args(["init"])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(())
    }
}
pub fn git_pull(path: &Path) -> Result<String, String> {
    let output = hidden_command("git")
        .args(["pull", "--no-rebase"])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    } else {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}
pub fn git_push(path: &Path) -> Result<String, String> {
    let output = hidden_command("git")
        .args(["push"])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    } else {
        let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(if out.is_empty() { err } else { out })
    }
}
pub fn git_commit(path: &Path, message: &str, targets: Vec<String>) -> Result<String, String> {
    if targets.is_empty() {
        let add_out = hidden_command("git")
            .args(["add", "-A"])
            .current_dir(path)
            .output()
            .map_err(|e| e.to_string())?;
        if !add_out.status.success() {
            return Err(String::from_utf8_lossy(&add_out.stderr).trim().to_string());
        }
        let commit_out = hidden_command("git")
            .args(["commit", "-m", message])
            .current_dir(path)
            .output()
            .map_err(|e| e.to_string())?;
        if !commit_out.status.success() {
            return Err(String::from_utf8_lossy(&commit_out.stderr).trim().to_string());
        }
        Ok(String::from_utf8_lossy(&commit_out.stdout).trim().to_string())
    } else {
        let mut add_args = vec!["add".to_string(), "--".to_string()];
        add_args.extend(targets.iter().cloned());
        let add_out = hidden_command("git")
            .args(&add_args)
            .current_dir(path)
            .output()
            .map_err(|e| e.to_string())?;
        if !add_out.status.success() {
            return Err(String::from_utf8_lossy(&add_out.stderr).trim().to_string());
        }
        let mut commit_args = vec![
            "commit".to_string(),
            "-m".to_string(),
            message.to_string(),
            "--".to_string(),
        ];
        commit_args.extend(targets);
        let commit_out = hidden_command("git")
            .args(&commit_args)
            .current_dir(path)
            .output()
            .map_err(|e| e.to_string())?;
        if !commit_out.status.success() {
            return Err(String::from_utf8_lossy(&commit_out.stderr).trim().to_string());
        }
        Ok(String::from_utf8_lossy(&commit_out.stdout).trim().to_string())
    }
}
pub fn git_revert(path: &Path, targets: Vec<String>) -> Result<(), String> {
    let mut checkout_args = vec!["checkout".to_string(), "HEAD".to_string(), "--".to_string()];
    if targets.is_empty() {
        checkout_args.push(".".to_string());
    } else {
        checkout_args.extend(targets.iter().cloned());
    }
    let _ = hidden_command("git")
        .args(&checkout_args)
        .current_dir(path)
        .output();
    if !targets.is_empty() {
        let mut clean_args = vec!["clean".to_string(), "-fd".to_string(), "--".to_string()];
        clean_args.extend(targets);
        let _ = hidden_command("git")
            .args(&clean_args)
            .current_dir(path)
            .output();
    }
    Ok(())
}
#[derive(serde::Serialize, Clone, Debug)]
pub struct GitLogEntry {
    pub revision: String,
    pub author: String,
    pub date: String,
    pub message: String,
}
pub fn get_git_log(path: &Path, limit: u32) -> Result<Vec<GitLogEntry>, String> {
    let output = hidden_command("git")
        .args([
            "log",
            &format!("-n{}", limit.max(1)),
            "--date=format:%Y-%m-%d %H:%M",
            "--format=%h%x00%an%x00%ad%x00%s",
        ])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '\0').collect();
            if parts.len() == 4 {
                Some(GitLogEntry {
                    revision: parts[0].to_string(),
                    author: parts[1].to_string(),
                    date: parts[2].to_string(),
                    message: parts[3].to_string(),
                })
            } else {
                None
            }
        })
        .collect())
}
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VersoInstallation {
    pub protocol: i32,
    pub version: String,
    pub desktop: String,
    pub host: String,
}
pub fn find_verso_installation() -> Option<VersoInstallation> {
    if let Ok(custom) = std::env::var("VERSO_INSTALLATION_FILE") {
        if let Ok(bytes) = std::fs::read(&custom) {
            if let Ok(inst) = serde_json::from_slice::<VersoInstallation>(&bytes) {
                if Path::new(&inst.desktop).exists() {
                    return Some(inst);
                }
            }
        }
    }
    let local_app_data = std::env::var("LOCALAPPDATA").ok()?;
    let reg_path = Path::new(&local_app_data)
        .join("Verso")
        .join("Desktop")
        .join("installation.json");
    if let Ok(bytes) = std::fs::read(&reg_path) {
        if let Ok(inst) = serde_json::from_slice::<VersoInstallation>(&bytes) {
            if Path::new(&inst.desktop).exists() {
                return Some(inst);
            }
        }
    }
    None
}
#[derive(serde::Serialize, Clone, Debug, Default)]
pub struct VcsWorkspaceInfo {
    pub kind: Option<String>,
    pub repo_root: Option<String>,
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub verso_available: bool,
}
pub fn get_vcs_workspace_info(path: &Path) -> Result<VcsWorkspaceInfo, String> {
    let verso_available = find_verso_installation().is_some();
    if let Some(verso_root) = find_repo_root(path, ".verso") {
        let branch = std::fs::read(verso_root.join(".verso").join("workspace.json"))
            .ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
            .and_then(|v| v.get("branch")?.as_str().map(|s| s.to_string()));
        return Ok(VcsWorkspaceInfo {
            kind: Some("verso".to_string()),
            repo_root: Some(verso_root.to_string_lossy().to_string()),
            branch,
            ahead: 0,
            behind: 0,
            verso_available,
        });
    }
    if let Some(git_root) = find_repo_root(path, ".git") {
        let branch = hidden_command("git")
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .current_dir(&git_root)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
        let (mut ahead, mut behind) = (0u32, 0u32);
        if let Ok(ab_out) = hidden_command("git")
            .args(["rev-list", "--left-right", "--count", "HEAD...@{u}"])
            .current_dir(&git_root)
            .output()
        {
            if ab_out.status.success() {
                let s = String::from_utf8_lossy(&ab_out.stdout);
                let mut parts = s.split_whitespace();
                if let (Some(a), Some(b)) = (parts.next(), parts.next()) {
                    ahead = a.parse().unwrap_or(0);
                    behind = b.parse().unwrap_or(0);
                }
            }
        }
        return Ok(VcsWorkspaceInfo {
            kind: Some("git".to_string()),
            repo_root: Some(git_root.to_string_lossy().to_string()),
            branch,
            ahead,
            behind,
            verso_available,
        });
    }
    Ok(VcsWorkspaceInfo {
        kind: None,
        repo_root: None,
        branch: None,
        ahead: 0,
        behind: 0,
        verso_available,
    })
}
pub fn build_verso_launch_args(path: &Path, page: Option<&str>) -> Vec<String> {
    let repo_root = find_repo_root(path, ".verso").or_else(|| find_repo_root(path, ".git"));
    let mut args = Vec::new();
    if let Some(root) = repo_root {
        args.push(root.to_string_lossy().to_string());
        if let Ok(rel) = path.strip_prefix(&root) {
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            let trimmed = rel_str.trim_matches('/');
            if !trimmed.is_empty() {
                args.push("--select".to_string());
                args.push(trimmed.to_string());
            }
        }
    } else {
        args.push(path.to_string_lossy().to_string());
    }
    if let Some(p) = page.map(str::trim).filter(|s| !s.is_empty()) {
        args.push("--page".to_string());
        args.push(p.to_string());
    }
    args
}
pub fn open_in_verso(path: &Path, page: Option<&str>) -> Result<(), String> {
    let install = find_verso_installation()
        .ok_or_else(|| "Verso 客户端尚未安装或未注册（请先运行一次 Verso.exe）".to_string())?;
    let args = build_verso_launch_args(path, page);
    std::process::Command::new(&install.desktop)
        .args(&args)
        .spawn()
        .map_err(|e| format!("无法启动 Verso: {e}"))?;
    Ok(())
}// === SVN ===

pub fn get_svn_status(path: &Path) -> Result<std::collections::HashMap<String, String>, String> {
    if !path.join(".svn").exists() {
        return Ok(std::collections::HashMap::new());
    }
    let output = hidden_command("svn")
        .args(["status", "--non-interactive"])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(std::collections::HashMap::new());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut status_map = std::collections::HashMap::new();
    for line in stdout.lines() {
        if line.len() < 8 {
            continue;
        }
        let status_char = line.chars().next().unwrap_or(' ');
        let filepath = &line[7..];
        let status_str = match status_char {
            'M' => "modified",
            'A' => "added",
            'D' => "deleted",
            '?' => "untracked",
            '!' => "missing",
            'R' => "replaced",
            'C' => "conflicted",
            '~' => "obstructed",
            'I' => "ignored",
            'X' => "external",
            _ => "modified",
        };
        status_map.insert(filepath.to_string(), status_str.to_string());
    }
    Ok(status_map)
}

#[derive(serde::Serialize)]
pub struct SvnInfo {
    pub url: String,
    pub revision: String,
    pub author: String,
    pub date: String,
}

pub fn get_svn_info(path: &Path) -> Result<SvnInfo, String> {
    let output = hidden_command("svn")
        .args([
            "info",
            "--non-interactive",
            "--show-item",
            "url",
            "--show-item",
            "revision",
            "--show-item",
            "last-changed-author",
            "--show-item",
            "last-changed-date",
        ])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.lines().collect();
    Ok(SvnInfo {
        url: lines.first().unwrap_or(&"").to_string(),
        revision: lines.get(1).unwrap_or(&"").to_string(),
        author: lines.get(2).unwrap_or(&"").to_string(),
        date: lines.get(3).unwrap_or(&"").to_string(),
    })
}

pub fn svn_update(path: &Path) -> Result<String, String> {
    let output = hidden_command("svn")
        .args(["update", "--non-interactive"])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

pub fn svn_commit(path: &Path, message: &str) -> Result<String, String> {
    let output = hidden_command("svn")
        .args(["commit", "-m", message, "--non-interactive"])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

pub fn svn_revert(path: &Path, targets: Vec<String>) -> Result<(), String> {
    let mut args = vec!["revert".to_string()];
    for t in &targets {
        args.push(t.clone());
    }
    let output = hidden_command("svn")
        .args(&args)
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(())
    }
}

pub fn svn_add(path: &Path, targets: Vec<String>) -> Result<(), String> {
    let mut args = vec!["add".to_string(), "--non-interactive".to_string()];
    for t in &targets {
        args.push(t.clone());
    }
    let output = hidden_command("svn")
        .args(&args)
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(())
    }
}

#[derive(serde::Serialize)]
pub struct SvnLogEntry {
    pub revision: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

pub fn get_svn_log(path: &Path, limit: u32) -> Result<Vec<SvnLogEntry>, String> {
    let output = hidden_command("svn")
        .args(["log", "--non-interactive", "-l", &limit.to_string()])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();
    let mut current: Option<SvnLogEntry> = None;
    let mut in_msg = false;
    let mut msg_lines: Vec<String> = Vec::new();
    for line in stdout.lines() {
        if line.starts_with('-') {
            if let Some(entry) = current.take() {
                entries.push(SvnLogEntry {
                    message: msg_lines.join("\n"),
                    ..entry
                });
            }
            msg_lines.clear();
            in_msg = false;
            continue;
        }
        if line.starts_with('r') && line.contains('|') {
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            if parts.len() >= 3 {
                current = Some(SvnLogEntry {
                    revision: parts[0].trim().to_string(),
                    author: parts[1].trim().to_string(),
                    date: parts[2].split('.').next().unwrap_or("").trim().to_string(),
                    message: String::new(),
                });
                in_msg = true;
            }
        } else if in_msg && !line.is_empty() {
            msg_lines.push(line.to_string());
        }
    }
    if let Some(entry) = current.take() {
        entries.push(SvnLogEntry {
            message: msg_lines.join("\n"),
            ..entry
        });
    }
    Ok(entries)
}

pub fn svn_checkout(url: &str, dest: &str) -> Result<String, String> {
    let output = hidden_command("svn")
        .args(["checkout", url, dest, "--non-interactive"])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

pub fn svn_cleanup(path: &Path) -> Result<(), String> {
    let output = hidden_command("svn")
        .args(["cleanup"])
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(())
    }
}

pub fn svn_resolve(path: &Path, targets: Vec<String>) -> Result<(), String> {
    let mut args = vec![
        "resolve".to_string(),
        "--accept".to_string(),
        "working".to_string(),
    ];
    for t in &targets {
        args.push(t.clone());
    }
    let output = hidden_command("svn")
        .args(&args)
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(())
    }
}

pub fn detect_ides() -> Vec<IDEInfo> {
    let mut ides = Vec::new();
    let candidates = [
        ("code", "Visual Studio Code"),
        ("code-insiders", "VS Code Insiders"),
        ("cursor", "Cursor"),
        ("windsurf", "Windsurf"),
        ("idea64", "IntelliJ IDEA"),
        ("webstorm64", "WebStorm"),
        ("rider64", "JetBrains Rider"),
    ];
    for (cmd, name) in candidates {
        if which_exists(cmd) {
            ides.push(IDEInfo {
                name: name.to_string(),
                command: cmd.to_string(),
            });
        }
    }
    ides
}

fn which_exists(cmd: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        hidden_command("where")
            .arg(cmd)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("which")
            .arg(cmd)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

#[derive(serde::Serialize)]
pub struct IDEInfo {
    pub name: String,
    pub command: String,
}

pub fn open_in_ide(ide_cmd: &str, dir: &Path) -> Result<(), String> {
    std::process::Command::new(ide_cmd)
        .arg(dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn install_font(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let filename = path
            .file_name()
            .ok_or("no filename")?
            .to_string_lossy()
            .into_owned();
        let fonts_dir =
            std::path::PathBuf::from(std::env::var("WINDIR").unwrap_or("C:\\Windows".to_string()))
                .join("Fonts");
        std::fs::copy(path, fonts_dir.join(&filename)).map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported".to_string())
    }
}

pub fn set_wallpaper(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::Win32::UI::WindowsAndMessaging::{
            SPI_SETDESKWALLPAPER, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE,
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS, SystemParametersInfoW,
        };
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            let _ = SystemParametersInfoW(
                SPI_SETDESKWALLPAPER,
                0,
                Some(wide.as_ptr() as *mut _),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS((SPIF_UPDATEINIFILE | SPIF_SENDCHANGE).0),
            );
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported".to_string())
    }
}

pub fn format_time_proper(t: SystemTime) -> String {
    let dur = t.duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default();
    let dt = chrono::DateTime::from_timestamp(dur.as_secs() as i64, dur.subsec_nanos())
        .unwrap_or_default();
    let local = dt.with_timezone(&chrono::Local);
    let now = chrono::Local::now();
    let today = now.date_naive();
    let file_date = local.date_naive();
    if file_date == today {
        local.format("Today %H:%M").to_string()
    } else if (today - file_date).num_days() == 1 {
        local.format("Yesterday %H:%M").to_string()
    } else if (today - file_date).num_days() < 7 {
        format!("{} days ago", (today - file_date).num_days())
    } else {
        local.format("%Y/%m/%d %H:%M").to_string()
    }
}

pub fn set_file_readonly(path: &Path, readonly: bool) -> Result<(), String> {
    let mut perms = std::fs::metadata(path)
        .map_err(|e| e.to_string())?
        .permissions();
    #[cfg(unix)]
    { use std::os::unix::fs::PermissionsExt;
      let mode = perms.mode();
      perms.set_mode(if readonly { mode & !0o222 } else { mode | 0o200 }); }
    #[cfg(not(unix))]
    perms.set_readonly(readonly);
    std::fs::set_permissions(path, perms).map_err(|e| e.to_string())
}
#[cfg(test)]
mod vcs_verso_tests {
    use super::*;
    #[test]
    fn parse_git_porcelain_maps_subdirectory_files_and_folders() {
        let porcelain = " M src-tauri/src/lib.rs\nA  src-tauri/src/vcs.rs\n?? src-tauri/nested/new.txt\n M README.md\n";
        let root_map = parse_git_porcelain_for_dir(porcelain, "");
        assert_eq!(root_map.get("README.md").map(String::as_str), Some("modified"));
        assert_eq!(root_map.get("src-tauri").map(String::as_str), Some("modified"));
        let sub_map = parse_git_porcelain_for_dir(porcelain, "src-tauri/");
        assert_eq!(sub_map.get("src").map(String::as_str), Some("modified"));
        assert_eq!(sub_map.get("nested").map(String::as_str), Some("untracked"));
        assert!(!sub_map.contains_key("README.md"));
        let src_map = parse_git_porcelain_for_dir(porcelain, "src-tauri/src/");
        assert_eq!(src_map.get("lib.rs").map(String::as_str), Some("modified"));
        assert_eq!(src_map.get("vcs.rs").map(String::as_str), Some("added"));
    }
}