use crate::types::*;
use rhfiles_core::enumerator;
use std::path::PathBuf;

use tauri::Emitter;

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FileInfo>, String> {
    let p = PathBuf::from(&path);
    let entries = enumerator::list_dir(&p).map_err(|e| e.to_string())?;
    Ok(entries.iter().map(file_info_from_entry).collect())
}

#[tauri::command]
pub fn get_drives() -> Result<Vec<DriveInfoSer>, String> {
    let drives = enumerator::get_drives().map_err(|e| e.to_string())?;
    Ok(drives.iter().map(|d| DriveInfoSer {
        letter: d.letter.clone(),
        label: if d.label.is_empty() { "Local Disk".to_string() } else { d.label.clone() },
        free: format!("{:.1} GB free / {:.1} GB",
            d.free_bytes as f64 / (1024.0 * 1024.0 * 1024.0),
            d.total_bytes as f64 / (1024.0 * 1024.0 * 1024.0)),
        path: format!("{}\\", d.letter),
        free_bytes: d.free_bytes,
        total_bytes: d.total_bytes,
    }).collect())
}

#[tauri::command]
pub fn parent_path(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    p.parent().map(|p| p.to_string_lossy().into_owned()).ok_or_else(|| "No parent".to_string())
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    enumerator::delete_to_recycle_bin(&PathBuf::from(&path))
}

#[tauri::command]
pub fn delete_files(paths: Vec<String>) -> Result<(), String> {
    let mut errors = Vec::new();
    for path in &paths {
        if let Err(e) = enumerator::delete_to_recycle_bin(&PathBuf::from(path)) {
            errors.push(format!("{}: {}", path, e));
        }
    }
    if errors.is_empty() { Ok(()) }
    else { Err(errors.join("\n")) }
}

#[tauri::command]
pub fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let parent = p.parent().unwrap_or(&p);
    let new_path = parent.join(&new_name);
    std::fs::rename(&p, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn new_folder(parent: String) -> Result<(), String> {
    enumerator::create_new_file(&PathBuf::from(&parent), "folder", "")
}

#[tauri::command]
pub fn copy_path(src: String, dest: String) -> Result<(), String> {
    enumerator::copy_path(&PathBuf::from(&src), &PathBuf::from(&dest))
}

#[tauri::command]
pub fn move_path_cmd(src: String, dest: String) -> Result<(), String> {
    enumerator::move_path(&PathBuf::from(&src), &PathBuf::from(&dest))
}

#[tauri::command]
pub async fn copy_with_progress(src: String, dest: String, app: tauri::AppHandle, cancel: tauri::State<'_, CancelFlag>) -> Result<(), String> {
    *cancel.0.lock().unwrap() = false;
    let src_path = PathBuf::from(&src);
    let dest_path = PathBuf::from(&dest);
    let src_name = src_path.file_name().ok_or("no filename")?;
    let target = dest_path.join(src_name);

    if src_path.is_dir() {
        let total_size = enumerator::folder_size(&src_path).unwrap_or(0);
        let _ = app.emit("op-progress", serde_json::json!({
            "operation": "copy", "src": src, "dest": dest,
            "bytesTransferred": 0, "totalBytes": total_size,
            "percentage": 0, "speed": 0, "status": "calculating"
        }));
        enumerator::copy_path(&src_path, &dest_path)?;
    } else {
        let total = std::fs::metadata(&src_path).map_err(|e| e.to_string())?.len();
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
            if n == 0 { break; }
            dest_file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            transferred += n as u64;

            let now = std::time::Instant::now();
            if now.duration_since(last_emit).as_millis() >= 100 || n == 0 {
                last_emit = now;
                let elapsed = start.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 { transferred as f64 / elapsed } else { 0.0 };
                let pct = if total > 0 { (transferred as f64 / total as f64 * 100.0) as u32 } else { 100 };

                let _ = app.emit("op-progress", serde_json::json!({
                    "operation": "copy", "src": src, "dest": dest,
                    "bytesTransferred": transferred, "totalBytes": total,
                    "percentage": pct, "speed": speed as u64, "status": "progress"
                }));
            }
        }
    }

    let _ = app.emit("op-progress", serde_json::json!({
        "operation": "copy", "src": src, "dest": dest,
        "bytesTransferred": 0, "totalBytes": 0,
        "percentage": 100, "speed": 0, "status": "complete"
    }));
    Ok(())
}

#[tauri::command]
pub async fn move_with_progress(src: String, dest: String, app: tauri::AppHandle, cancel: tauri::State<'_, CancelFlag>) -> Result<(), String> {
    *cancel.0.lock().unwrap() = false;
    let src_path = PathBuf::from(&src);
    let dest_path = PathBuf::from(&dest);
    let src_name = src_path.file_name().ok_or("no filename")?;
    let target = dest_path.join(src_name);

    let _ = app.emit("op-progress", serde_json::json!({
        "operation": "move", "src": src, "dest": dest,
        "bytesTransferred": 0, "totalBytes": 0,
        "percentage": 0, "speed": 0, "status": "preparing"
    }));

    if src_path.is_dir() {
        let total_size = enumerator::folder_size(&src_path).unwrap_or(0);
        let _ = app.emit("op-progress", serde_json::json!({
            "operation": "move", "src": src, "dest": dest,
            "bytesTransferred": 0, "totalBytes": total_size,
            "percentage": 10, "speed": 0, "status": "progress"
        }));
        if *cancel.0.lock().unwrap() { return Err("Cancelled".to_string()); }
        enumerator::copy_path(&src_path, &dest_path)?;
        std::fs::remove_dir_all(&src_path).map_err(|e| e.to_string())?;
    } else {
        let total = std::fs::metadata(&src_path).map_err(|e| e.to_string())?.len();
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
            if n == 0 { break; }
            dest_file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            transferred += n as u64;

            let now = std::time::Instant::now();
            if now.duration_since(last_emit).as_millis() >= 100 || n == 0 {
                last_emit = now;
                let elapsed = start.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 { transferred as f64 / elapsed } else { 0.0 };
                let pct = if total > 0 { ((transferred as f64 / total as f64 * 90.0) + 5.0) as u32 } else { 90 };

                let _ = app.emit("op-progress", serde_json::json!({
                    "operation": "move", "src": src, "dest": dest,
                    "bytesTransferred": transferred, "totalBytes": total,
                    "percentage": pct, "speed": speed as u64, "status": "progress"
                }));
            }
        }
        std::fs::remove_file(&src_path).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("op-progress", serde_json::json!({
        "operation": "move", "src": src, "dest": dest,
        "bytesTransferred": 0, "totalBytes": 0,
        "percentage": 100, "speed": 0, "status": "complete"
    }));
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

#[tauri::command]
pub fn get_dir_tree(path: String) -> Result<Vec<TreeEntry>, String> {
    let p = PathBuf::from(&path);
    let entries = enumerator::get_dir_tree(&p).map_err(|e| e.to_string())?;
    Ok(entries.iter().map(|e| TreeEntry {
        name: e.name.clone(),
        path: e.path.to_string_lossy().into_owned(),
        has_children: enumerator::has_subdirs(&e.path),
        is_hidden: e.is_hidden,
    }).collect())
}

#[tauri::command]
pub fn batch_rename(renames: Vec<(String, String)>) -> Result<Vec<String>, String> {
    let mut errors = Vec::new();
    for (old_path, new_name) in &renames {
        let p = PathBuf::from(old_path);
        let parent = p.parent().unwrap_or(&p);
        let new_path = parent.join(new_name);
        if let Err(e) = std::fs::rename(&p, &new_path) {
            errors.push(format!("{}: {}", old_path, e));
        }
    }
    if errors.is_empty() { Ok(errors) } else { Err(errors.join("\n")) }
}

#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileDetailInfo, String> {
    let p = PathBuf::from(&path);
    let metadata = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let extension = p.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default();
    let is_dir = metadata.is_dir();
    let size = metadata.len();
    let folder_size_val = if is_dir {
        enumerator::folder_size(&p).ok()
    } else { None };
    Ok(FileDetailInfo {
        name, path: p.to_string_lossy().into_owned(), extension, is_dir,
        size, size_display: format_size(size),
        folder_size: folder_size_val,
        folder_size_display: folder_size_val.map(|s| format_size(s)),
        modified: format_time(metadata.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH)),
        created: format_time(metadata.created().unwrap_or(std::time::SystemTime::UNIX_EPOCH)),
        readonly: metadata.permissions().readonly(),
        attributes: if is_dir { "Directory".to_string() } else { "File".to_string() },
    })
}

#[tauri::command]
pub fn create_shortcut(target: String, name: String, dest: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let dest_path = PathBuf::from(&dest);
        let lnk_path = dest_path.join(format!("{}.lnk", name));
        let target_str = target.replace("'", "''");
        let script = format!(
            "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('{}'); $sc.TargetPath = '{}'; $sc.Save()",
            lnk_path.to_string_lossy(), target_str
        );
        std::process::Command::new("powershell").args(["-NoProfile", "-Command", &script])
            .output().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = (target, name, dest); Err("Not supported".to_string()) }
}
