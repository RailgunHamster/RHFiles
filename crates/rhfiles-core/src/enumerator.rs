use std::path::Path;
use std::time::SystemTime;

use crate::{DriveInfo, FileEntry};

pub fn list_dir(path: &Path) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();

    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();

        let is_hidden = name.starts_with('.');

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

pub fn get_drives() -> Result<Vec<DriveInfo>, String> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let drive_letters =
            unsafe { windows::Win32::Storage::FileSystem::GetLogicalDrives() };
        for i in 0..26 {
            if (drive_letters >> i) & 1 != 0 {
                let letter = (b'A' + i as u8) as char;
                let drive_path = format!("{letter}:\\");
                let drive_path_wide: Vec<u16> =
                    std::ffi::OsStr::new(&drive_path)
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

                let label = String::from_utf16_lossy(&volume_name);
                let label = label.trim_end_matches('\0').to_string();
                let fs_type = String::from_utf16_lossy(&fs_name);
                let fs_type = fs_type.trim_end_matches('\0').to_string();

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

pub fn delete_to_recycle_bin(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .chain(std::iter::once(0))
            .collect();

        use windows::Win32::UI::Shell::{
            FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_SILENT, FO_DELETE,
            SHFILEOPSTRUCTW, SHFileOperationW,
        };

        let mut op = SHFILEOPSTRUCTW::default();
        op.wFunc = FO_DELETE;
        op.pFrom = windows::core::PCWSTR(wide.as_ptr());
        op.fFlags = (FOF_ALLOWUNDO.0 | FOF_NOCONFIRMATION.0 | FOF_SILENT.0) as u16;

        let result = unsafe { SHFileOperationW(&mut op) };
        if result != 0 {
            return Err(format!("SHFileOperation failed: {result}"));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if path.is_dir() {
            std::fs::remove_dir_all(path).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
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
