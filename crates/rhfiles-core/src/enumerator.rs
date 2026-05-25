use std::path::Path;
use std::time::SystemTime;

use crate::{DriveInfo, FileEntry};

pub fn list_dir(path: &Path) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_hidden = is_hidden(&name, &metadata);
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

#[cfg(target_os = "windows")]
fn is_hidden(name: &str, metadata: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 2;
    let attr = metadata.file_attributes();
    name.starts_with('.') || (attr & FILE_ATTRIBUTE_HIDDEN) != 0
}

#[cfg(not(target_os = "windows"))]
fn is_hidden(name: &str, _metadata: &std::fs::Metadata) -> bool {
    name.starts_with('.')
}

pub fn get_dir_tree(path: &Path) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        if !metadata.is_dir() { continue; }
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_hidden = is_hidden(&name, &metadata);
        entries.push(FileEntry {
            name, path: entry.path(), extension: String::new(),
            is_dir: true, is_hidden, size: 0,
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
            if entry.path().is_dir() { return true; }
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
    thumb.write_to(&mut cursor, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

pub fn read_file_text(path: &Path, max_bytes: u64) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    file.take(max_bytes).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    if buf.len() > 3 && buf[0] == 0xEF && buf[1] == 0xBB && buf[2] == 0xBF {
        Ok(String::from_utf8_lossy(&buf[3..]).into_owned())
    } else {
        Ok(String::from_utf8_lossy(&buf).into_owned())
    }
}

pub fn open_file(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let operation: Vec<u16> = "open\0".encode_utf16().collect();
        unsafe {
            let result = windows::Win32::UI::Shell::ShellExecuteW(
                None, windows::core::PCWSTR(operation.as_ptr()),
                windows::core::PCWSTR(wide.as_ptr()),
                windows::core::PCWSTR::null(), None,
                windows::Win32::UI::WindowsAndMessaging::SW_SHOW,
            );
            if (result.0 as usize) <= 32 {
                return Err(format!("ShellExecuteW failed: {}", result.0 as usize));
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { std::process::Command::new("xdg-open").arg(path).spawn().map_err(|e| e.to_string())?; Ok(()) }
}

pub fn show_properties(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_INVOKEIDLIST};
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
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
    { Err("Not supported".to_string()) }
}

fn find_repo_root(path: &Path, marker: &str) -> Option<std::path::PathBuf> {
    let mut current = if path.is_dir() { path.to_path_buf() } else { path.parent()?.to_path_buf() };
    loop {
        if current.join(marker).exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

pub fn get_git_status(path: &Path) -> Result<std::collections::HashMap<String, String>, String> {
    if find_repo_root(path, ".git").is_none() {
        return Ok(std::collections::HashMap::new());
    }
    let output = std::process::Command::new("git")
        .args(["status", "--porcelain", "--no-renames"])
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() { return Ok(std::collections::HashMap::new()); }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut status_map = std::collections::HashMap::new();
    for line in stdout.lines() {
        if line.len() < 4 { continue; }
        let status = line.get(0..2).unwrap_or("  ").trim();
        let filepath = &line[3..];
        let status_str = match status {
            "M" | "MM" | "AM" => "modified", "A" => "added",
            "D" | "AD" => "deleted", "??" => "untracked", _ => "modified",
        };
        status_map.insert(filepath.to_string(), status_str.to_string());
    }
    Ok(status_map)
}

pub fn get_drives() -> Result<Vec<DriveInfo>, String> {
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
                    .encode_wide().chain(std::iter::once(0)).collect();
                let mut volume_name = [0u16; 128];
                let mut fs_name = [0u16; 128];
                let mut serial = 0u32; let mut max_component = 0u32;
                let mut fs_flags = 0u32;
                unsafe {
                    let _ = windows::Win32::Storage::FileSystem::GetVolumeInformationW(
                        windows::core::PCWSTR(drive_path_wide.as_ptr()),
                        Some(&mut volume_name), Some(&mut serial),
                        Some(&mut max_component), Some(&mut fs_flags), Some(&mut fs_name),
                    );
                }
                let label = String::from_utf16_lossy(&volume_name).trim_end_matches('\0').to_string();
                let fs_type = String::from_utf16_lossy(&fs_name).trim_end_matches('\0').to_string();
                let mut free = 0u64; let mut total = 0u64; let mut _free_call = 0u64;
                unsafe {
                    let _ = windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
                        windows::core::PCWSTR(drive_path_wide.as_ptr()),
                        Some(&mut free), Some(&mut total), Some(&mut _free_call),
                    );
                }
                drives.push(DriveInfo { letter: format!("{letter}:"), label, fs_type, total_bytes: total, free_bytes: free });
            }
        }
    }
    Ok(drives)
}

pub fn delete_to_recycle_bin(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = path.as_os_str().encode_wide()
            .chain(std::iter::once(0)).chain(std::iter::once(0)).collect();
        use windows::Win32::UI::Shell::{FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_SILENT, FO_DELETE, SHFILEOPSTRUCTW, SHFileOperationW};
        let mut op = SHFILEOPSTRUCTW::default();
        op.wFunc = FO_DELETE;
        op.pFrom = windows::core::PCWSTR(wide.as_ptr());
        op.fFlags = (FOF_ALLOWUNDO.0 | FOF_NOCONFIRMATION.0 | FOF_SILENT.0) as u16;
        let result = unsafe { SHFileOperationW(&mut op) };
        if result != 0 { return Err(format!("SHFileOperation failed: {result}")); }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if path.is_dir() { std::fs::remove_dir_all(path).map_err(|e| e.to_string())?; }
        else { std::fs::remove_file(path).map_err(|e| e.to_string())?; }
    }
    Ok(())
}

pub fn copy_path(src: &Path, dest_dir: &Path) -> Result<(), String> {
    let name = src.file_name().ok_or("no filename")?;
    let dest = dest_dir.join(name);
    if src.is_dir() { copy_dir_recursive(src, &dest)?; }
    else { std::fs::copy(src, &dest).map_err(|e| e.to_string())?; }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() { copy_dir_recursive(&src_path, &dest_path)?; }
        else { std::fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?; }
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
    if !path.is_dir() { return Ok(std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)); }
    let mut total: u64 = 0;
    fn walk(p: &Path, total: &mut u64) {
        if let Ok(entries) = std::fs::read_dir(p) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Ok(meta) = entry.metadata() {
                    if meta.is_dir() { walk(&path, total); }
                    else { *total += meta.len(); }
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
                if n == 0 { break; }
                h.update(&buf[..n]);
            }
            Ok(format!("{:x}", h.finalize()))
        }
        "sha1" => {
            let mut h = sha1::Sha1::new();
            loop {
                let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 { break; }
                h.update(&buf[..n]);
            }
            Ok(format!("{:x}", h.finalize()))
        }
        "sha256" => {
            let mut h = sha2::Sha256::new();
            loop {
                let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 { break; }
                h.update(&buf[..n]);
            }
            Ok(format!("{:x}", h.finalize()))
        }
        "sha512" => {
            let mut h = sha2::Sha512::new();
            loop {
                let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 { break; }
                h.update(&buf[..n]);
            }
            Ok(format!("{:x}", h.finalize()))
        }
        _ => Err(format!("Unknown algorithm: {algorithm}")),
    }
}

pub fn open_terminal(path: &Path, terminal: &str) -> Result<(), String> {
    let dir = path.to_string_lossy().into_owned();
    match terminal {
        "cmd" => { std::process::Command::new("cmd").args(["/k", &format!("cd /d {}", &dir)]).spawn().map_err(|e| e.to_string())?; }
        "powershell" => { std::process::Command::new("powershell").args(["-NoExit", "-Command", &format!("cd '{}'", &dir)]).spawn().map_err(|e| e.to_string())?; }
        "wt" => { std::process::Command::new("wt").args(["-d", &dir]).spawn().map_err(|e| e.to_string())?; }
        _ => { std::process::Command::new("cmd").args(["/k", &format!("cd /d {}", &dir)]).spawn().map_err(|e| e.to_string())?; }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn extract_file_icon(path: &Path, size: u32) -> Result<String, String> {
    use base64::Engine;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHGFI_ICON, SHFILEINFOW};
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon};
    use windows::Win32::Graphics::Gdi::{GetDIBits, CreateCompatibleDC, SelectObject, DeleteDC, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS};
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;

    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let mut shfi = SHFILEINFOW::default();
    let flags = SHGFI_ICON.0 | if size > 16 { 0x000000010u32 } else { 0x000000000u32 };

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
    let mut icon_info = std::mem::MaybeUninit::<windows::Win32::UI::WindowsAndMessaging::ICONINFO>::uninit();
    let ok = unsafe { windows::Win32::UI::WindowsAndMessaging::GetIconInfo(hicon, icon_info.as_mut_ptr()) };
    let icon_info = unsafe { icon_info.assume_init() };
    if ok.is_err() {
        unsafe { let _ = DestroyIcon(hicon); };
        return Err("GetIconInfo failed".to_string());
    }

    let hdc = unsafe { CreateCompatibleDC(None) };
    let target_size = size.min(64);

    let mut bmi = BITMAPINFO {
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
    let mut pixels = vec![0u8; buf_size];

    let old = unsafe { SelectObject(hdc, icon_info.hbmColor.into()) };
    let scanlines = unsafe {
        GetDIBits(hdc, icon_info.hbmColor, 0, target_size, Some(pixels.as_mut_ptr() as *mut _), &mut bmi, DIB_RGB_COLORS)
    };
    unsafe { SelectObject(hdc, old); let _ = DeleteDC(hdc); };

    if !icon_info.hbmColor.is_invalid() {
        unsafe { let _ = DeleteObject(icon_info.hbmColor.into()); }
    }
    if !icon_info.hbmMask.is_invalid() {
        unsafe { let _ = DeleteObject(icon_info.hbmMask.into()); }
    }
    unsafe { let _ = DestroyIcon(hicon); };

    if scanlines == 0 {
        return Err("GetDIBits failed".to_string());
    }

    let mut img = image::RgbaImage::new(target_size, target_size);
    for y in 0..target_size {
        for x in 0..target_size {
            let idx = ((y * target_size + x) * 4) as usize;
            if idx + 3 < pixels.len() {
                let b = pixels[idx];
                let g = pixels[idx + 1];
                let r = pixels[idx + 2];
                let a = pixels[idx + 3];
                img.put_pixel(x, y, image::Rgba([r, g, b, a]));
            }
        }
    }

    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    img.write_to(&mut cursor, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

#[cfg(not(target_os = "windows"))]
pub fn extract_file_icon(_path: &Path, _size: u32) -> Result<String, String> {
    Err("Not supported".to_string())
}

#[cfg(target_os = "windows")]
pub fn get_new_file_templates() -> Result<Vec<NewFileTemplate>, String> {
    let mut templates = Vec::new();
    let extensions = [".txt", ".md", ".html", ".css", ".js", ".py", ".rs", ".json", ".xml", ".yaml", ".sh", ".bat"];
    let names = ["Text Document", "Markdown", "HTML Document", "CSS Stylesheet", "JavaScript", "Python File", "Rust Source", "JSON File", "XML Document", "YAML File", "Shell Script", "Batch File"];

    for (i, ext) in extensions.iter().enumerate() {
        templates.push(NewFileTemplate {
            name: names[i].to_string(),
            extension: ext[1..].to_string(),
            template_content: String::new(),
        });
    }
    Ok(templates)
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
            "html" => "<!DOCTYPE html>\n<html>\n<head>\n  <title></title>\n</head>\n<body>\n</body>\n</html>\n",
            "json" => "{\n}\n",
            "xml" => "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<root>\n</root>\n",
            _ => "",
        };
        std::fs::write(&p, content).map_err(|e| e.to_string())
    }
}

pub fn get_file_association(extension: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("cmd")
            .args(["/c", &format!("assoc .{}", extension)])
            .output().map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let line = stdout.trim();
        if let Some(eq_pos) = line.find('=') {
            let ftype = &line[eq_pos + 1..];
            let output2 = std::process::Command::new("cmd")
                .args(["/c", &format!("ftype {}", ftype)])
                .output().map_err(|e| e.to_string())?;
            let stdout2 = String::from_utf8_lossy(&output2.stdout);
            if let Some(eq2) = stdout2.trim().find('=') {
                let cmd_str = stdout2.trim()[eq2 + 1..].to_string();
                if let Some(exe_end) = cmd_str.find(".exe") {
                    let exe_path = cmd_str[..exe_end + 4].to_string();
                    let name = std::path::Path::new(&exe_path).file_name()
                        .map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                    return Ok(name);
                }
                return Ok(cmd_str);
            }
        }
        Err("No association found".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    { Err("Not supported".to_string()) }
}

pub fn run_as_admin(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW};
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let verb: Vec<u16> = "runas\0".encode_utf16().collect();
        unsafe {
            let mut info = SHELLEXECUTEINFOW::default();
            info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            info.lpVerb = windows::core::PCWSTR(verb.as_ptr());
            info.lpFile = windows::core::PCWSTR(wide.as_ptr());
            info.nShow = SW_SHOW.0;
            let _ = ShellExecuteExW(&mut info);
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { Err("Not supported".to_string()) }
}

pub fn empty_recycle_bin() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Shell::SHEmptyRecycleBinW;
        let empty: Vec<u16> = "\0".encode_utf16().collect();
        unsafe {
            let _ = SHEmptyRecycleBinW(None, windows::core::PCWSTR(empty.as_ptr()),
                windows::Win32::UI::Shell::SHERB_NOCONFIRMATION | windows::Win32::UI::Shell::SHERB_NOPROGRESSUI | windows::Win32::UI::Shell::SHERB_NOSOUND);
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { Err("Not supported".to_string()) }
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
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output().map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let lines: Vec<&str> = stdout.lines().collect();
        Ok(ShortcutInfo {
            target: lines.first().unwrap_or(&"").to_string(),
            working_dir: lines.get(1).unwrap_or(&"").to_string(),
            arguments: lines.get(2).unwrap_or(&"").to_string(),
        })
    }
    #[cfg(not(target_os = "windows"))]
    { Err("Not supported".to_string()) }
}

#[derive(serde::Serialize)]
pub struct ShortcutInfo {
    pub target: String,
    pub working_dir: String,
    pub arguments: String,
}

pub fn git_branches(path: &Path) -> Result<Vec<GitBranch>, String> {
    let output = std::process::Command::new("git")
        .args(["branch", "--format=%(refname:short)|%(HEAD)"])
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() { return Ok(Vec::new()); }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().filter_map(|line| {
        let parts: Vec<&str> = line.splitn(2, '|').collect();
        if parts.len() == 2 {
            Some(GitBranch { name: parts[0].to_string(), is_current: parts[1] == "*" })
        } else { None }
    }).collect())
}

#[derive(serde::Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

pub fn git_checkout(path: &Path, branch: &str) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .args(["checkout", branch])
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else { Ok(()) }
}

pub fn git_create_branch(path: &Path, name: &str) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .args(["checkout", "-b", name])
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else { Ok(()) }
}

pub fn git_init(path: &Path) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .args(["init"])
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else { Ok(()) }
}

// === SVN ===

pub fn get_svn_status(path: &Path) -> Result<std::collections::HashMap<String, String>, String> {
    if !path.join(".svn").exists() {
        return Ok(std::collections::HashMap::new());
    }
    let output = std::process::Command::new("svn")
        .args(["status", "--non-interactive"])
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() { return Ok(std::collections::HashMap::new()); }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut status_map = std::collections::HashMap::new();
    for line in stdout.lines() {
        if line.len() < 8 { continue; }
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
    let output = std::process::Command::new("svn")
        .args(["info", "--non-interactive", "--show-item", "url", "--show-item", "revision", "--show-item", "last-changed-author", "--show-item", "last-changed-date"])
        .current_dir(path).output().map_err(|e| e.to_string())?;
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
    let output = std::process::Command::new("svn")
        .args(["update", "--non-interactive"])
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

pub fn svn_commit(path: &Path, message: &str) -> Result<String, String> {
    let output = std::process::Command::new("svn")
        .args(["commit", "-m", message, "--non-interactive"])
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

pub fn svn_revert(path: &Path, targets: Vec<String>) -> Result<(), String> {
    let mut args = vec!["revert".to_string()];
    for t in &targets { args.push(t.clone()); }
    let output = std::process::Command::new("svn")
        .args(&args)
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else { Ok(()) }
}

pub fn svn_add(path: &Path, targets: Vec<String>) -> Result<(), String> {
    let mut args = vec!["add".to_string(), "--non-interactive".to_string()];
    for t in &targets { args.push(t.clone()); }
    let output = std::process::Command::new("svn")
        .args(&args)
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else { Ok(()) }
}

#[derive(serde::Serialize)]
pub struct SvnLogEntry {
    pub revision: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

pub fn get_svn_log(path: &Path, limit: u32) -> Result<Vec<SvnLogEntry>, String> {
    let output = std::process::Command::new("svn")
        .args(["log", "--non-interactive", "-l", &limit.to_string()])
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() { return Ok(Vec::new()); }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();
    let mut current: Option<SvnLogEntry> = None;
    let mut in_msg = false;
    let mut msg_lines: Vec<String> = Vec::new();
    for line in stdout.lines() {
        if line.starts_with('-') {
            if let Some(entry) = current.take() {
                entries.push(SvnLogEntry { message: msg_lines.join("\n"), ..entry });
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
        entries.push(SvnLogEntry { message: msg_lines.join("\n"), ..entry });
    }
    Ok(entries)
}

pub fn svn_checkout(url: &str, dest: &str) -> Result<String, String> {
    let output = std::process::Command::new("svn")
        .args(["checkout", url, dest, "--non-interactive"])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

pub fn svn_cleanup(path: &Path) -> Result<(), String> {
    let output = std::process::Command::new("svn")
        .args(["cleanup"])
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else { Ok(()) }
}

pub fn svn_resolve(path: &Path, targets: Vec<String>) -> Result<(), String> {
    let mut args = vec!["resolve".to_string(), "--accept".to_string(), "working".to_string()];
    for t in &targets { args.push(t.clone()); }
    let output = std::process::Command::new("svn")
        .args(&args)
        .current_dir(path).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    } else { Ok(()) }
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
            ides.push(IDEInfo { name: name.to_string(), command: cmd.to_string() });
        }
    }
    ides
}

fn which_exists(cmd: &str) -> bool {
    #[cfg(target_os = "windows")]
    { std::process::Command::new("where").arg(cmd).output().map(|o| o.status.success()).unwrap_or(false) }
    #[cfg(not(target_os = "windows"))]
    { std::process::Command::new("which").arg(cmd).output().map(|o| o.status.success()).unwrap_or(false) }
}

#[derive(serde::Serialize)]
pub struct IDEInfo {
    pub name: String,
    pub command: String,
}

pub fn open_in_ide(ide_cmd: &str, dir: &Path) -> Result<(), String> {
    std::process::Command::new(ide_cmd)
        .arg(dir).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn install_font(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let filename = path.file_name().ok_or("no filename")?.to_string_lossy().into_owned();
        let fonts_dir = std::path::PathBuf::from(std::env::var("WINDIR").unwrap_or("C:\\Windows".to_string())).join("Fonts");
        std::fs::copy(path, fonts_dir.join(&filename)).map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { Err("Not supported".to_string()) }
}

pub fn set_wallpaper(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS};
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        unsafe {
            let _ = SystemParametersInfoW(
                SPI_SETDESKWALLPAPER, 0,
                Some(wide.as_ptr() as *mut _),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS((SPIF_UPDATEINIFILE | SPIF_SENDCHANGE).0),
            );
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { Err("Not supported".to_string()) }
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
    let mut perms = std::fs::metadata(path).map_err(|e| e.to_string())?.permissions();
    perms.set_readonly(readonly);
    std::fs::set_permissions(path, perms).map_err(|e| e.to_string())
}
