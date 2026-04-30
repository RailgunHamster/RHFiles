use rhfiles_core::enumerator;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize, Clone)]
struct FileInfo {
    name: String,
    path: String,
    extension: String,
    is_dir: bool,
    is_hidden: bool,
    size: u64,
    size_display: String,
    modified: String,
}

#[derive(Serialize, Clone)]
struct DriveInfo {
    letter: String,
    label: String,
    free: String,
    path: String,
}

fn format_modified(modified: std::time::SystemTime) -> String {
    let Ok(dur) = modified.duration_since(std::time::UNIX_EPOCH) else {
        return String::new();
    };
    let secs = dur.as_secs();
    let days = secs / 86400;
    let time = secs % 86400;
    let hours = time / 3600;
    let mins = (time % 3600) / 60;

    let now = std::time::SystemTime::now();
    let Ok(now_dur) = now.duration_since(std::time::UNIX_EPOCH) else {
        return format!("{:02}:{:02}", hours, mins);
    };
    let now_days = now_dur.as_secs() / 86400;
    let diff_days = now_days.saturating_sub(days);

    if diff_days == 0 {
        format!("Today {:02}:{:02}", hours, mins)
    } else if diff_days == 1 {
        format!("Yesterday {:02}:{:02}", hours, mins)
    } else if diff_days < 7 {
        format!("{} days ago", diff_days)
    } else {
        let year = 1970 + (secs / (365 * 86400)) as u32;
        let day_of_year = (secs % (365 * 86400)) / 86400;
        let month = (day_of_year / 31) + 1;
        let day = (day_of_year % 31) + 1;
        format!("{}/{:02}/{:02} {:02}:{:02}", year, month, day, hours, mins)
    }
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<FileInfo>, String> {
    let p = PathBuf::from(&path);
    let entries = enumerator::list_dir(&p).map_err(|e| e.to_string())?;

    Ok(entries
        .iter()
        .map(|e| FileInfo {
            name: e.name.clone(),
            path: e.path.to_string_lossy().into_owned(),
            extension: e.extension.clone(),
            is_dir: e.is_dir,
            is_hidden: e.is_hidden,
            size: e.size,
            size_display: e.display_size(),
            modified: format_modified(e.modified),
        })
        .collect())
}

#[tauri::command]
fn get_drives() -> Result<Vec<DriveInfo>, String> {
    let drives = enumerator::get_drives().map_err(|e| e.to_string())?;
    Ok(drives
        .iter()
        .map(|d| DriveInfo {
            letter: d.letter.clone(),
            label: if d.label.is_empty() {
                "Local Disk".to_string()
            } else {
                d.label.clone()
            },
            free: format!(
                "{:.1} GB free / {:.1} GB",
                d.free_bytes as f64 / (1024.0 * 1024.0 * 1024.0),
                d.total_bytes as f64 / (1024.0 * 1024.0 * 1024.0),
            ),
            path: format!("{}\\", d.letter),
        })
        .collect())
}

#[tauri::command]
fn parent_path(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    p.parent()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "No parent".to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    enumerator::delete_to_recycle_bin(&p)
}

#[tauri::command]
fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let parent = p.parent().unwrap_or(&p);
    let new_path = parent.join(&new_name);
    std::fs::rename(&p, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn new_folder(parent: String) -> Result<(), String> {
    let p = PathBuf::from(&parent);
    let mut new_path = p.join("New Folder");
    let mut counter = 1;
    while new_path.exists() {
        new_path = p.join(format!("New Folder ({})", counter));
        counter += 1;
    }
    std::fs::create_dir(&new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_path(src: String, dest: String) -> Result<(), String> {
    let src_path = PathBuf::from(&src);
    let dest_path = PathBuf::from(&dest);
    enumerator::copy_path(&src_path, &dest_path)
}

#[tauri::command]
fn move_path(src: String, dest: String) -> Result<(), String> {
    let src_path = PathBuf::from(&src);
    let dest_path = PathBuf::from(&dest);
    enumerator::move_path(&src_path, &dest_path)
}

#[tauri::command]
fn get_env(key: String) -> Option<String> {
    std::env::var(key).ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            get_drives,
            parent_path,
            delete_file,
            rename_file,
            new_folder,
            copy_path,
            move_path,
            get_env,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
