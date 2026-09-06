use crate::types::*;
use rhfiles_core::enumerator;
use std::path::PathBuf;

use tauri::Emitter;

#[tauri::command(async)]
pub fn list_dir(path: String) -> Result<Vec<FileInfo>, String> {
    let p = PathBuf::from(&path);
    let entries = enumerator::list_dir(&p).map_err(|e| e.to_string())?;
    Ok(entries.iter().map(file_info_from_entry).collect())
}

#[tauri::command(async)]
pub fn get_drives() -> Result<Vec<DriveInfoSer>, String> {
    let drives = enumerator::get_drives().map_err(|e| e.to_string())?;
    Ok(drives
        .iter()
        .map(|d| DriveInfoSer {
            letter: d.letter.clone(),
            label: if d.label.is_empty() {
                "Local Disk".to_string()
            } else {
                d.label.clone()
            },
            free: format!(
                "{:.1} GB free / {:.1} GB",
                d.free_bytes as f64 / (1024.0 * 1024.0 * 1024.0),
                d.total_bytes as f64 / (1024.0 * 1024.0 * 1024.0)
            ),
            path: format!("{}\\", d.letter),
            free_bytes: d.free_bytes,
            total_bytes: d.total_bytes,
        })
        .collect())
}

#[tauri::command]
pub fn parent_path(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    p.parent()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "No parent".to_string())
}

#[tauri::command(async)]
pub fn delete_file(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    std::fs::symlink_metadata(&target).map_err(|error| format!("Cannot delete {path}: {error}"))?;
    enumerator::delete_to_recycle_bin(&target)
}

#[derive(serde::Serialize)]
pub struct DeleteFilesOutcome {
    deleted: Vec<String>,
    errors: Vec<String>,
}

#[tauri::command(async)]
pub fn delete_files(paths: Vec<String>) -> DeleteFilesOutcome {
    let mut deleted = Vec::new();
    let mut errors = Vec::new();
    for path in &paths {
        let target = PathBuf::from(path);
        let result = std::fs::symlink_metadata(&target)
            .map_err(|error| format!("Cannot delete {path}: {error}"))
            .and_then(|_| enumerator::delete_to_recycle_bin(&target));
        match result {
            Ok(()) => deleted.push(path.clone()),
            Err(error) => errors.push(format!("{path}: {error}")),
        }
    }
    DeleteFilesOutcome { deleted, errors }
}

#[cfg(target_os = "windows")]
fn recycle_compare_path(path: &str) -> String {
    let normalized = path.replace('/', "\\");
    let path_buf = PathBuf::from(&normalized);
    let expanded = path_buf
        .parent()
        .and_then(|parent| parent.canonicalize().ok())
        .and_then(|parent| path_buf.file_name().map(|name| parent.join(name)))
        .unwrap_or(path_buf)
        .to_string_lossy()
        .into_owned();
    let without_extended_prefix = if let Some(unc) = expanded.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        expanded
            .strip_prefix(r"\\?\")
            .unwrap_or(&expanded)
            .to_string()
    };
    without_extended_prefix
        .trim_end_matches('\\')
        .to_lowercase()
}

#[cfg(target_os = "windows")]
fn restore_recycled_files_windows(paths: Vec<String>) -> Result<(), String> {
    std::thread::spawn(move || -> Result<(), String> {
        use windows::Win32::System::Com::{
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
            CoUninitialize,
        };
        use windows::Win32::System::Variant::VARIANT;
        use windows::Win32::UI::Shell::{FolderItem2, IShellDispatch, Shell};
        use windows::core::{BSTR, Interface};

        struct ComGuard;
        impl Drop for ComGuard {
            fn drop(&mut self) {
                unsafe { CoUninitialize() };
            }
        }

        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(|error| format!("COM initialization failed: {error}"))?;
            let _guard = ComGuard;
            let shell: IShellDispatch = CoCreateInstance(&Shell, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| format!("Recycle Bin is unavailable: {error}"))?;
            let recycle_bin = shell
                .NameSpace(&VARIANT::from(10_i32))
                .map_err(|error| format!("Cannot open Recycle Bin: {error}"))?;
            let items = recycle_bin
                .Items()
                .map_err(|error| format!("Cannot list Recycle Bin: {error}"))?;
            let count = items.Count().map_err(|error| error.to_string())?;
            let mut candidates = Vec::new();

            for index in 0..count {
                let Ok(item) = items.Item(&VARIANT::from(index)) else {
                    continue;
                };
                let Ok(item2) = item.cast::<FolderItem2>() else {
                    continue;
                };
                let Ok(parent_value) =
                    item2.ExtendedProperty(&BSTR::from("System.Recycle.DeletedFrom"))
                else {
                    continue;
                };
                let Ok(parent) = BSTR::try_from(&parent_value) else {
                    continue;
                };
                let name = item2
                    .ExtendedProperty(&BSTR::from("System.FileName"))
                    .ok()
                    .and_then(|value| BSTR::try_from(&value).ok())
                    .filter(|value| !value.is_empty())
                    .or_else(|| item.Name().ok())
                    .unwrap_or_default();
                if name.is_empty() {
                    continue;
                }
                let original = PathBuf::from(parent.to_string()).join(name.to_string());
                let deleted_at = item2
                    .ExtendedProperty(&BSTR::from("System.Recycle.DateDeleted"))
                    .ok()
                    .and_then(|value| f64::try_from(&value).ok())
                    .unwrap_or_default();
                candidates.push((
                    recycle_compare_path(&original.to_string_lossy()),
                    deleted_at,
                    item2,
                ));
            }

            let mut reserved = vec![false; candidates.len()];
            let mut restore_plan = Vec::new();
            for path in paths {
                let destination = PathBuf::from(&path);
                if destination.exists() {
                    return Err(format!("Restore destination already exists: {path}"));
                }
                let wanted = recycle_compare_path(&path);
                let candidate_index = candidates
                    .iter()
                    .enumerate()
                    .filter(|(index, (candidate, _, _))| !reserved[*index] && candidate == &wanted)
                    .max_by(|(_, (_, left, _)), (_, (_, right, _))| {
                        left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal)
                    })
                    .map(|(index, _)| index)
                    .ok_or_else(|| format!("Item was not found in Recycle Bin: {path}"))?;
                reserved[candidate_index] = true;
                restore_plan.push((path, destination, candidate_index));
            }

            for (path, destination, candidate_index) in restore_plan {
                candidates[candidate_index]
                    .2
                    .InvokeVerb(&VARIANT::from("undelete"))
                    .map_err(|error| format!("Could not restore {path}: {error}"))?;

                for _ in 0..100 {
                    if destination.exists() {
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                if !destination.exists() {
                    return Err(format!("Windows did not restore the item: {path}"));
                }
            }
            Ok(())
        }
    })
    .join()
    .map_err(|_| "Recycle Bin restore worker stopped unexpectedly".to_string())?
}

#[tauri::command(async)]
pub fn restore_recycled_files(paths: Vec<String>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        restore_recycled_files_windows(paths)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = paths;
        Err("Recycle Bin restore is only available on Windows".to_string())
    }
}

#[tauri::command(async)]
pub fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let parent = p.parent().unwrap_or(&p);
    let new_path = parent.join(&new_name);
    std::fs::rename(&p, &new_path).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn new_folder(parent: String) -> Result<(), String> {
    enumerator::create_new_file(&PathBuf::from(&parent), "folder", "")
}

#[tauri::command(async)]
pub fn copy_path(src: String, dest: String) -> Result<(), String> {
    enumerator::copy_path(&PathBuf::from(&src), &PathBuf::from(&dest))
}

#[tauri::command(async)]
pub fn move_path_cmd(src: String, dest: String) -> Result<(), String> {
    enumerator::move_path(&PathBuf::from(&src), &PathBuf::from(&dest))
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

fn remove_partial_copy(path: &std::path::Path) {
    if path.is_dir() {
        let _ = std::fs::remove_dir_all(path);
    } else {
        let _ = std::fs::remove_file(path);
    }
}

fn copy_path_to_exact(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    if !src.exists() {
        return Err(format!("Source does not exist: {}", src.display()));
    }
    if dest.exists() {
        return Err(format!("Destination already exists: {}", dest.display()));
    }
    let parent = dest
        .parent()
        .ok_or_else(|| format!("Destination has no parent: {}", dest.display()))?;
    if !parent.is_dir() {
        return Err(format!(
            "Destination folder does not exist: {}",
            parent.display()
        ));
    }

    let result = if src.is_dir() {
        fn copy_dir(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
            std::fs::create_dir(dest).map_err(|error| error.to_string())?;
            for entry in std::fs::read_dir(src).map_err(|error| error.to_string())? {
                let entry = entry.map_err(|error| error.to_string())?;
                let source = entry.path();
                let target = dest.join(entry.file_name());
                if source.is_dir() {
                    copy_dir(&source, &target)?;
                } else {
                    std::fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&target)
                        .and_then(|mut output| {
                            let mut input = std::fs::File::open(&source)?;
                            std::io::copy(&mut input, &mut output)?;
                            Ok(())
                        })
                        .map_err(|error| error.to_string())?;
                    if let Ok(metadata) = std::fs::metadata(&source) {
                        let _ = std::fs::set_permissions(&target, metadata.permissions());
                    }
                }
            }
            Ok(())
        }
        copy_dir(src, dest)
    } else {
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dest)
            .and_then(|mut output| {
                let mut input = std::fs::File::open(src)?;
                std::io::copy(&mut input, &mut output)?;
                Ok(())
            })
            .map_err(|error| error.to_string())
            .map(|_| {
                if let Ok(metadata) = std::fs::metadata(src) {
                    let _ = std::fs::set_permissions(dest, metadata.permissions());
                }
            })
    };

    if result.is_err() {
        remove_partial_copy(dest);
    }
    result
}

#[tauri::command(async)]
pub fn copy_path_exact(src: String, dest: String) -> Result<(), String> {
    copy_path_to_exact(&PathBuf::from(src), &PathBuf::from(dest))
}

fn move_path_to_exact(source: &std::path::Path, target: &std::path::Path) -> Result<(), String> {
    if !source.exists() {
        return Err(format!("Source does not exist: {}", source.display()));
    }
    if target.exists() {
        return Err(format!("Destination already exists: {}", target.display()));
    }
    let parent = target
        .parent()
        .ok_or_else(|| format!("Destination has no parent: {}", target.display()))?;
    if !parent.is_dir() {
        return Err(format!(
            "Destination folder does not exist: {}",
            parent.display()
        ));
    }

    match std::fs::rename(source, target) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            copy_path_to_exact(source, target).map_err(|copy_error| {
                format!("Move failed ({rename_error}); copy fallback failed ({copy_error})")
            })?;
            let remove_result = if source.is_dir() {
                std::fs::remove_dir_all(source)
            } else {
                std::fs::remove_file(source)
            };
            if let Err(error) = remove_result {
                return Err(format!(
                    "Copied the item but could not completely remove the source; the destination was kept to avoid data loss: {error}"
                ));
            }
            Ok(())
        }
    }
}

#[tauri::command(async)]
pub fn move_path_exact(src: String, dest: String) -> Result<(), String> {
    move_path_to_exact(&PathBuf::from(src), &PathBuf::from(dest))
}

#[tauri::command(async)]
pub fn move_paths_exact(moves: Vec<(String, String)>) -> Result<(), String> {
    let mut completed: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (src, dest) in moves {
        let source = PathBuf::from(src);
        let target = PathBuf::from(dest);
        if let Err(error) = move_path_to_exact(&source, &target) {
            let mut rollback_errors = Vec::new();
            for (original, renamed) in completed.iter().rev() {
                if let Err(rollback_error) = move_path_to_exact(renamed, original) {
                    rollback_errors.push(rollback_error);
                }
            }
            return Err(if rollback_errors.is_empty() {
                error
            } else {
                format!(
                    "{error}; rollback also failed: {}",
                    rollback_errors.join(" | ")
                )
            });
        }
        completed.push((source, target));
    }
    Ok(())
}

#[tauri::command(async)]
pub fn copy_with_progress(
    src: String,
    dest: String,
    overwrite: Option<bool>,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
) -> Result<(), String> {
    *cancel.0.lock().unwrap() = false;
    let src_path = PathBuf::from(&src);
    let dest_path = PathBuf::from(&dest);
    let src_name = src_path.file_name().ok_or("no filename")?;
    let target = dest_path.join(src_name);
    if target.exists() && !overwrite.unwrap_or(false) {
        return Err(format!("Destination already exists: {}", target.display()));
    }

    if src_path.is_dir() {
        let total_size = enumerator::folder_size(&src_path).unwrap_or(0);
        let _ = app.emit(
            "op-progress",
            serde_json::json!({
                "operation": "copy", "src": src, "dest": dest,
                "bytesTransferred": 0, "totalBytes": total_size,
                "percentage": 0, "speed": 0, "status": "calculating"
            }),
        );
        enumerator::copy_path(&src_path, &dest_path)?;
    } else {
        let total = std::fs::metadata(&src_path)
            .map_err(|e| e.to_string())?
            .len();
        let mut source_file = std::fs::File::open(&src_path).map_err(|e| e.to_string())?;
        let mut dest_file = std::fs::File::create(&target).map_err(|e| e.to_string())?;

        use std::io::{Read, Write};
        let mut buf = vec![0u8; 1048576];
        let mut transferred: u64 = 0;
        let start = std::time::Instant::now();
        let mut last_emit = std::time::Instant::now();

        loop {
            if *cancel.0.lock().unwrap() {
                let _ = std::fs::remove_file(&target);
                return Err("Cancelled".to_string());
            }
            let n = source_file.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            dest_file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            transferred += n as u64;

            let now = std::time::Instant::now();
            if now.duration_since(last_emit).as_millis() >= 100 || n == 0 {
                last_emit = now;
                let elapsed = start.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 {
                    transferred as f64 / elapsed
                } else {
                    0.0
                };
                let pct = if total > 0 {
                    (transferred as f64 / total as f64 * 100.0) as u32
                } else {
                    100
                };

                let _ = app.emit(
                    "op-progress",
                    serde_json::json!({
                        "operation": "copy", "src": src, "dest": dest,
                        "bytesTransferred": transferred, "totalBytes": total,
                        "percentage": pct, "speed": speed as u64, "status": "progress"
                    }),
                );
            }
        }
    }

    let _ = app.emit(
        "op-progress",
        serde_json::json!({
            "operation": "copy", "src": src, "dest": dest,
            "bytesTransferred": 0, "totalBytes": 0,
            "percentage": 100, "speed": 0, "status": "complete"
        }),
    );
    Ok(())
}

#[tauri::command(async)]
pub fn move_with_progress(
    src: String,
    dest: String,
    overwrite: Option<bool>,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
) -> Result<(), String> {
    *cancel.0.lock().unwrap() = false;
    let src_path = PathBuf::from(&src);
    let dest_path = PathBuf::from(&dest);
    let src_name = src_path.file_name().ok_or("no filename")?;
    let target = dest_path.join(src_name);
    if target.exists() && !overwrite.unwrap_or(false) {
        return Err(format!("Destination already exists: {}", target.display()));
    }

    let _ = app.emit(
        "op-progress",
        serde_json::json!({
            "operation": "move", "src": src, "dest": dest,
            "bytesTransferred": 0, "totalBytes": 0,
            "percentage": 0, "speed": 0, "status": "preparing"
        }),
    );

    if src_path.is_dir() {
        let total_size = enumerator::folder_size(&src_path).unwrap_or(0);
        let _ = app.emit(
            "op-progress",
            serde_json::json!({
                "operation": "move", "src": src, "dest": dest,
                "bytesTransferred": 0, "totalBytes": total_size,
                "percentage": 10, "speed": 0, "status": "progress"
            }),
        );
        if *cancel.0.lock().unwrap() {
            return Err("Cancelled".to_string());
        }
        enumerator::copy_path(&src_path, &dest_path)?;
        std::fs::remove_dir_all(&src_path).map_err(|e| e.to_string())?;
    } else {
        let total = std::fs::metadata(&src_path)
            .map_err(|e| e.to_string())?
            .len();
        let mut source_file = std::fs::File::open(&src_path).map_err(|e| e.to_string())?;
        let mut dest_file = std::fs::File::create(&target).map_err(|e| e.to_string())?;

        use std::io::{Read, Write};
        let mut buf = vec![0u8; 1048576];
        let mut transferred: u64 = 0;
        let start = std::time::Instant::now();
        let mut last_emit = std::time::Instant::now();

        loop {
            if *cancel.0.lock().unwrap() {
                let _ = std::fs::remove_file(&target);
                return Err("Cancelled".to_string());
            }
            let n = source_file.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            dest_file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            transferred += n as u64;

            let now = std::time::Instant::now();
            if now.duration_since(last_emit).as_millis() >= 100 || n == 0 {
                last_emit = now;
                let elapsed = start.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 {
                    transferred as f64 / elapsed
                } else {
                    0.0
                };
                let pct = if total > 0 {
                    ((transferred as f64 / total as f64 * 90.0) + 5.0) as u32
                } else {
                    90
                };

                let _ = app.emit(
                    "op-progress",
                    serde_json::json!({
                        "operation": "move", "src": src, "dest": dest,
                        "bytesTransferred": transferred, "totalBytes": total,
                        "percentage": pct, "speed": speed as u64, "status": "progress"
                    }),
                );
            }
        }
        std::fs::remove_file(&src_path).map_err(|e| e.to_string())?;
    }

    let _ = app.emit(
        "op-progress",
        serde_json::json!({
            "operation": "move", "src": src, "dest": dest,
            "bytesTransferred": 0, "totalBytes": 0,
            "percentage": 100, "speed": 0, "status": "complete"
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn get_env(key: String) -> Option<String> {
    std::env::var(key).ok()
}

#[tauri::command]
pub fn cancel_operation(cancel: tauri::State<'_, CancelFlag>) {
    *cancel.0.lock().unwrap() = true;
}

#[tauri::command(async)]
pub fn get_dir_tree(path: String) -> Result<Vec<TreeEntry>, String> {
    let p = PathBuf::from(&path);
    let entries = enumerator::get_dir_tree(&p).map_err(|e| e.to_string())?;
    Ok(entries
        .iter()
        .map(|e| TreeEntry {
            name: e.name.clone(),
            path: e.path.to_string_lossy().into_owned(),
            has_children: enumerator::has_subdirs(&e.path),
            is_hidden: e.is_hidden,
        })
        .collect())
}

#[tauri::command(async)]
pub fn batch_rename(renames: Vec<(String, String)>) -> Result<Vec<String>, String> {
    let mut completed = Vec::new();
    for (old_path, new_name) in &renames {
        let p = PathBuf::from(old_path);
        let parent = p.parent().unwrap_or(&p);
        let new_path = parent.join(new_name);
        if p == new_path {
            continue;
        }
        if let Err(error) = std::fs::rename(&p, &new_path) {
            let mut rollback_errors = Vec::new();
            for (original, renamed) in completed.iter().rev() {
                if let Err(rollback_error) = std::fs::rename(renamed, original) {
                    rollback_errors.push(rollback_error.to_string());
                }
            }
            return Err(if rollback_errors.is_empty() {
                format!("{old_path}: {error}")
            } else {
                format!(
                    "{old_path}: {error}; rollback also failed: {}",
                    rollback_errors.join(" | ")
                )
            });
        }
        completed.push((p, new_path));
    }
    Ok(Vec::new())
}

#[tauri::command(async)]
pub fn get_file_info(path: String) -> Result<FileDetailInfo, String> {
    let p = PathBuf::from(&path);
    let metadata = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let extension = p
        .extension()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_default();
    let is_dir = metadata.is_dir();
    let size = metadata.len();
    // Recursive folder sizing can take minutes on large or network-backed trees.
    // Return the cheap metadata first; the properties dialog requests the size
    // separately and renders it when ready.
    let folder_size_val = None;
    Ok(FileDetailInfo {
        name,
        path: p.to_string_lossy().into_owned(),
        extension,
        is_dir,
        size,
        size_display: format_size(size),
        folder_size: folder_size_val,
        folder_size_display: folder_size_val.map(|s| format_size(s)),
        modified: format_time(
            metadata
                .modified()
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
        ),
        created: format_time(
            metadata
                .created()
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
        ),
        readonly: metadata.permissions().readonly(),
        attributes: if is_dir {
            "Directory".to_string()
        } else {
            "File".to_string()
        },
    })
}

#[tauri::command(async)]
pub fn folder_size(path: String) -> Result<u64, String> {
    enumerator::folder_size(&PathBuf::from(path))
}

#[tauri::command(async)]
pub fn create_shortcut(target: String, name: String, dest: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let dest_path = PathBuf::from(&dest);
        let lnk_path = dest_path.join(format!("{}.lnk", name));
        let target_str = target.replace("'", "''");
        let script = format!(
            "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('{}'); $sc.TargetPath = '{}'; $sc.Save()",
            lnk_path.to_string_lossy(),
            target_str
        );
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (target, name, dest);
        Err("Not supported".to_string())
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    #[ignore = "uses the Windows Recycle Bin"]
    fn deleted_file_can_be_restored_to_its_original_path() {
        let unique = format!(
            "rhfiles-recycle-undo-{}-{}.txt",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let path = std::env::temp_dir().join(unique);
        std::fs::write(&path, b"RHFiles undo test").unwrap();

        enumerator::delete_to_recycle_bin(&path).unwrap();
        assert!(!path.exists(), "test file should be in the Recycle Bin");
        restore_recycled_files_windows(vec![path.to_string_lossy().into_owned()]).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"RHFiles undo test");

        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn exact_move_round_trips_and_never_overwrites() {
        let root = std::env::temp_dir().join(format!(
            "rhfiles-exact-move-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let source = root.join("source.txt");
        let target = root.join("target.txt");
        std::fs::write(&source, b"source").unwrap();
        std::fs::write(&target, b"target").unwrap();

        assert!(
            move_path_exact(
                source.to_string_lossy().into_owned(),
                target.to_string_lossy().into_owned()
            )
            .is_err()
        );
        assert_eq!(std::fs::read(&source).unwrap(), b"source");
        assert_eq!(std::fs::read(&target).unwrap(), b"target");

        std::fs::remove_file(&target).unwrap();
        move_path_exact(
            source.to_string_lossy().into_owned(),
            target.to_string_lossy().into_owned(),
        )
        .unwrap();
        move_path_exact(
            target.to_string_lossy().into_owned(),
            source.to_string_lossy().into_owned(),
        )
        .unwrap();
        assert_eq!(std::fs::read(&source).unwrap(), b"source");
        std::fs::remove_dir_all(root).unwrap();
    }
}
