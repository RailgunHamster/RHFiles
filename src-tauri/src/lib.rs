use rhfiles_core::enumerator;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Listener};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct CancelFlag(Mutex<bool>);

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
    created: String,
    modified_ts: i64,
    created_ts: i64,
    folder_size: Option<u64>,
}

#[derive(Serialize, Clone)]
struct DriveInfoSer {
    letter: String,
    label: String,
    free: String,
    path: String,
    free_bytes: u64,
    total_bytes: u64,
}

#[derive(Serialize, Clone)]
struct TreeEntry {
    name: String,
    path: String,
    has_children: bool,
    is_hidden: bool,
}

#[derive(Serialize, Clone)]
struct ArchiveEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified: String,
}

fn format_time(t: std::time::SystemTime) -> String {
    enumerator::format_time_proper(t)
}

fn file_info_from_entry(e: &rhfiles_core::FileEntry) -> FileInfo {
    FileInfo {
        name: e.name.clone(),
        path: e.path.to_string_lossy().into_owned(),
        extension: e.extension.clone(),
        is_dir: e.is_dir,
        is_hidden: e.is_hidden,
        size: e.size,
        size_display: e.display_size(),
        modified: format_time(e.modified),
        created: format_time(e.created),
        modified_ts: e.modified.duration_since(std::time::SystemTime::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0),
        created_ts: e.created.duration_since(std::time::SystemTime::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0),
        folder_size: None,
    }
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<FileInfo>, String> {
    let p = PathBuf::from(&path);
    let entries = enumerator::list_dir(&p).map_err(|e| e.to_string())?;
    Ok(entries.iter().map(file_info_from_entry).collect())
}

#[tauri::command]
fn get_drives() -> Result<Vec<DriveInfoSer>, String> {
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
fn parent_path(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    p.parent().map(|p| p.to_string_lossy().into_owned()).ok_or_else(|| "No parent".to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    enumerator::delete_to_recycle_bin(&PathBuf::from(&path))
}

#[tauri::command]
fn delete_files(paths: Vec<String>) -> Result<(), String> {
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
fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let parent = p.parent().unwrap_or(&p);
    let new_path = parent.join(&new_name);
    std::fs::rename(&p, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn new_folder(parent: String) -> Result<(), String> {
    enumerator::create_new_file(&PathBuf::from(&parent), "folder", "")
}

#[tauri::command]
fn copy_path(src: String, dest: String) -> Result<(), String> {
    enumerator::copy_path(&PathBuf::from(&src), &PathBuf::from(&dest))
}

#[tauri::command]
fn move_path_cmd(src: String, dest: String) -> Result<(), String> {
    enumerator::move_path(&PathBuf::from(&src), &PathBuf::from(&dest))
}

#[tauri::command]
async fn copy_with_progress(src: String, dest: String, app: tauri::AppHandle, cancel: tauri::State<'_, CancelFlag>) -> Result<(), String> {
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
async fn move_with_progress(src: String, dest: String, app: tauri::AppHandle, cancel: tauri::State<'_, CancelFlag>) -> Result<(), String> {
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
fn get_env(key: String) -> Option<String> {
    std::env::var(key).ok()
}

#[tauri::command]
fn cancel_operation(cancel: tauri::State<'_, CancelFlag>) {
    *cancel.0.lock().unwrap() = true;
}

#[tauri::command]
fn get_dir_tree(path: String) -> Result<Vec<TreeEntry>, String> {
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
fn get_thumbnail(path: String, size: u32) -> Result<String, String> {
    enumerator::generate_thumbnail(&PathBuf::from(&path), size)
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    enumerator::open_file(&PathBuf::from(&path))
}

#[tauri::command]
fn show_properties(path: String) -> Result<(), String> {
    enumerator::show_properties(&PathBuf::from(&path))
}

#[tauri::command]
fn read_file_preview(path: String) -> Result<FilePreview, String> {
    let p = PathBuf::from(&path);
    let metadata = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let ext = p.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default().to_lowercase();
    let is_image = matches!(ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "ico" | "tiff" | "tif");
    let is_text = matches!(ext.as_str(),
        "txt" | "md" | "rs" | "js" | "ts" | "json" | "toml" | "yaml" | "yml" | "xml"
            | "html" | "css" | "scss" | "py" | "c" | "cpp" | "h" | "hpp" | "java" | "go"
            | "sh" | "bat" | "ps1" | "ini" | "cfg" | "log" | "csv" | "sql" | "rb" | "php"
            | "swift" | "kt" | "lua" | "vim" | "dockerfile" | "makefile" | "gitignore"
            | "env" | "lock" | "svg");
    if is_image {
        let thumb_b64 = enumerator::generate_thumbnail(&p, 400).ok();
        Ok(FilePreview { preview_type: "image".to_string(), text_content: None, image_data: thumb_b64, size: metadata.len() })
    } else if is_text || metadata.len() < 500_000 {
        let text = enumerator::read_file_text(&p, 100_000)?;
        Ok(FilePreview { preview_type: "text".to_string(), text_content: Some(text), image_data: None, size: metadata.len() })
    } else {
        Ok(FilePreview { preview_type: "binary".to_string(), text_content: None, image_data: None, size: metadata.len() })
    }
}

#[derive(Serialize)]
struct FilePreview {
    preview_type: String,
    text_content: Option<String>,
    image_data: Option<String>,
    size: u64,
}

#[tauri::command]
fn git_status(path: String) -> Result<HashMap<String, String>, String> {
    enumerator::get_git_status(&PathBuf::from(&path))
}

#[tauri::command]
fn git_branches(path: String) -> Result<Vec<enumerator::GitBranch>, String> {
    enumerator::git_branches(&PathBuf::from(&path))
}

#[tauri::command]
fn git_checkout(path: String, branch: String) -> Result<(), String> {
    enumerator::git_checkout(&PathBuf::from(&path), &branch)
}

#[tauri::command]
fn git_create_branch(path: String, name: String) -> Result<(), String> {
    enumerator::git_create_branch(&PathBuf::from(&path), &name)
}

#[tauri::command]
fn git_init(path: String) -> Result<(), String> {
    enumerator::git_init(&PathBuf::from(&path))
}

#[tauri::command]
fn svn_status(path: String) -> Result<HashMap<String, String>, String> {
    enumerator::get_svn_status(&PathBuf::from(&path))
}

#[tauri::command]
fn svn_info(path: String) -> Result<enumerator::SvnInfo, String> {
    enumerator::get_svn_info(&PathBuf::from(&path))
}

#[tauri::command]
fn svn_update(path: String) -> Result<String, String> {
    enumerator::svn_update(&PathBuf::from(&path))
}

#[tauri::command]
fn svn_commit(path: String, message: String) -> Result<String, String> {
    enumerator::svn_commit(&PathBuf::from(&path), &message)
}

#[tauri::command]
fn svn_revert(path: String, targets: Vec<String>) -> Result<(), String> {
    enumerator::svn_revert(&PathBuf::from(&path), targets)
}

#[tauri::command]
fn svn_add(path: String, targets: Vec<String>) -> Result<(), String> {
    enumerator::svn_add(&PathBuf::from(&path), targets)
}

#[tauri::command]
fn svn_log(path: String, limit: u32) -> Result<Vec<enumerator::SvnLogEntry>, String> {
    enumerator::get_svn_log(&PathBuf::from(&path), limit)
}

#[tauri::command]
fn svn_checkout(url: String, dest: String) -> Result<String, String> {
    enumerator::svn_checkout(&url, &dest)
}

#[tauri::command]
fn svn_cleanup(path: String) -> Result<(), String> {
    enumerator::svn_cleanup(&PathBuf::from(&path))
}

#[tauri::command]
fn svn_resolve(path: String, targets: Vec<String>) -> Result<(), String> {
    enumerator::svn_resolve(&PathBuf::from(&path), targets)
}

#[tauri::command]
fn list_archive(path: String) -> Result<Vec<ArchiveEntry>, String> {
    let p = PathBuf::from(&path);
    let ext = p.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default().to_lowercase();
    match ext.as_str() {
        "zip" => list_zip(&p),
        _ => Err("Unsupported archive format".to_string()),
    }
}

fn list_zip(path: &Path) -> Result<Vec<ArchiveEntry>, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for i in 0..archive.len() {
        let f = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_string();
        entries.push(ArchiveEntry {
            name: name.split('/').last().unwrap_or(&name).to_string(),
            path: name.clone(),
            is_dir: name.ends_with('/'),
            size: f.size(),
            modified: String::new(),
        });
    }
    Ok(entries)
}

#[tauri::command]
fn extract_archive(path: String, dest: String, entry_path: Option<String>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let d = PathBuf::from(&dest);
    let file = std::fs::File::open(&p).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    if let Some(ep) = entry_path {
        for i in 0..archive.len() {
            let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
            if f.name() == ep {
                let out_path = d.join(f.name().replace('/', "\\"));
                if f.is_dir() {
                    std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
                } else {
                    if let Some(parent) = out_path.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut f, &mut out_file).map_err(|e| e.to_string())?;
                }
                break;
            }
        }
    } else {
        archive.extract(&d).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn cleanup_stale_windows(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let open_labels: Vec<String> = app.webview_windows().keys().cloned().collect();
    let conn = get_db()?;
    let mut stmt = conn.prepare("SELECT window_id FROM window_states").map_err(|e| e.to_string())?;
    let rows: Vec<String> = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    for window_id in rows {
        if !open_labels.contains(&window_id) {
            conn.execute("DELETE FROM window_states WHERE window_id = ?1", rusqlite::params![window_id]).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn create_archive(sources: Vec<String>, dest: String) -> Result<(), String> {
    let dest_path = PathBuf::from(&dest);
    let file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for src in &sources {
        let src_path = PathBuf::from(src);
        if src_path.is_dir() {
            add_dir_to_zip(&mut zip_writer, &src_path, &src_path, &options)?;
        } else {
            let name = src_path.file_name().ok_or("no filename")?.to_string_lossy();
            zip_writer.start_file(name.as_ref(), options).map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(&src_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zip_writer).map_err(|e| e.to_string())?;
        }
    }
    zip_writer.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn add_dir_to_zip(zip_writer: &mut zip::ZipWriter<std::fs::File>, base: &Path, dir: &Path, options: &zip::write::SimpleFileOptions) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let relative = path.strip_prefix(base).map_err(|e| e.to_string())?;
        let name = relative.to_string_lossy().replace("\\", "/");
        if path.is_dir() {
            zip_writer.add_directory(format!("{}/", name), *options).map_err(|e| e.to_string())?;
            add_dir_to_zip(zip_writer, base, &path, options)?;
        } else {
            zip_writer.start_file(&name, *options).map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, zip_writer).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn batch_rename(renames: Vec<(String, String)>) -> Result<Vec<String>, String> {
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
fn save_file_tags(path: String, tags: Vec<String>) -> Result<(), String> {
    let tag_file = get_tag_file()?;
    let mut all_tags = load_all_tags_inner(&tag_file)?;
    if tags.is_empty() { all_tags.remove(&path); }
    else { all_tags.insert(path, tags); }
    let json = serde_json::to_string_pretty(&all_tags).map_err(|e| e.to_string())?;
    std::fs::write(&tag_file, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_file_tags(path: String) -> Result<Vec<String>, String> {
    let tag_file = get_tag_file()?;
    let all_tags = load_all_tags_inner(&tag_file)?;
    Ok(all_tags.get(&path).cloned().unwrap_or_default())
}

#[tauri::command]
fn load_all_tags() -> Result<HashMap<String, Vec<String>>, String> {
    let tag_file = get_tag_file()?;
    load_all_tags_inner(&tag_file)
}

fn get_tag_file() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(app_data).join("RHFiles");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("tags.json"))
}

fn load_all_tags_inner(path: &Path) -> Result<HashMap<String, Vec<String>>, String> {
    if !path.exists() { return Ok(HashMap::new()); }
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

// === SQLite persistence ===

fn get_db() -> Result<rusqlite::Connection, String> {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(app_data).join("RHFiles");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db_path = dir.join("rhfiles.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    let ver: u32 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap_or(0);
    if ver < 3 {
        let migrations = match ver {
            0 => "CREATE TABLE IF NOT EXISTS tags (path TEXT PRIMARY KEY, tags TEXT);
                  CREATE TABLE IF NOT EXISTS folder_layouts (path TEXT PRIMARY KEY, layout TEXT);
                  CREATE TABLE IF NOT EXISTS folder_prefs (path TEXT PRIMARY KEY, prefs TEXT);
                  CREATE TABLE IF NOT EXISTS pinned (path TEXT PRIMARY KEY, name TEXT, ord INTEGER);
                  CREATE TABLE IF NOT EXISTS window_states (
                      window_id TEXT PRIMARY KEY,
                      state_json TEXT,
                      pos_x INTEGER,
                      pos_y INTEGER,
                      width INTEGER,
                      height INTEGER,
                      maximized INTEGER DEFAULT 0,
                      sort_order INTEGER DEFAULT 0
                  );",
            1 => "",
            2 => "",
            _ => "",
        };
        if !migrations.is_empty() {
            conn.execute_batch(migrations).map_err(|e| e.to_string())?;
        }
        if ver < 2 {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS network_favorites (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    protocol TEXT NOT NULL,
                    host TEXT NOT NULL,
                    port INTEGER DEFAULT 0,
                    path TEXT DEFAULT '/',
                    username TEXT DEFAULT '',
                    password TEXT DEFAULT '',
                    display_name TEXT DEFAULT '',
                    last_used TEXT DEFAULT ''
                );"
            ).map_err(|e| e.to_string())?;
        }
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS recent_items (
                path TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                is_dir INTEGER DEFAULT 0,
                ext TEXT DEFAULT '',
                access_count INTEGER DEFAULT 1,
                last_accessed TEXT NOT NULL
            );
            PRAGMA user_version = 3;"
        ).map_err(|e| e.to_string())?;
    }
    Ok(conn)
}

#[tauri::command]
fn db_save_tags(path: String, tags: Vec<String>) -> Result<(), String> {
    let conn = get_db()?;
    let tags_json = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    conn.execute("INSERT OR REPLACE INTO tags (path, tags) VALUES (?1, ?2)", rusqlite::params![path, tags_json]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn db_load_tags(path: String) -> Result<Vec<String>, String> {
    let conn = get_db()?;
    let mut stmt = conn.prepare("SELECT tags FROM tags WHERE path = ?1").map_err(|e| e.to_string())?;
    let result = stmt.query_row(rusqlite::params![path], |row| row.get::<_, String>(0)).ok();
    match result {
        Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string()),
        None => Ok(Vec::new()),
    }
}

#[tauri::command]
fn db_load_all_tags() -> Result<HashMap<String, Vec<String>>, String> {
    let conn = get_db()?;
    let mut stmt = conn.prepare("SELECT path, tags FROM tags").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for row in rows {
        let (path, tags_json) = row.map_err(|e| e.to_string())?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        map.insert(path, tags);
    }
    Ok(map)
}

#[tauri::command]
fn db_save_layout(path: String, layout: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("INSERT OR REPLACE INTO folder_layouts (path, layout) VALUES (?1, ?2)", rusqlite::params![path, layout]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn db_load_layout(path: String) -> Result<Option<String>, String> {
    let conn = get_db()?;
    let mut stmt = conn.prepare("SELECT layout FROM folder_layouts WHERE path = ?1").map_err(|e| e.to_string())?;
    Ok(stmt.query_row(rusqlite::params![path], |row| row.get::<_, String>(0)).ok())
}

#[tauri::command]
fn db_save_pinned(paths: Vec<(String, String)>) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM pinned", []).map_err(|e| e.to_string())?;
    for (i, (path, name)) in paths.iter().enumerate() {
        conn.execute("INSERT INTO pinned (path, name, ord) VALUES (?1, ?2, ?3)", rusqlite::params![path, name, i]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn db_load_pinned() -> Result<Vec<(String, String)>, String> {
    let conn = get_db()?;
    let mut stmt = conn.prepare("SELECT path, name FROM pinned ORDER BY ord").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct NetworkFavorite {
    id: i64,
    protocol: String,
    host: String,
    port: i32,
    path: String,
    username: String,
    display_name: String,
}

#[tauri::command]
fn db_save_network_favorite(protocol: String, host: String, port: i32, path: String, username: String, display_name: String) -> Result<i64, String> {
    let conn = get_db()?;
    conn.execute(
        "INSERT INTO network_favorites (protocol, host, port, path, username, display_name, last_used) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        rusqlite::params![protocol, host, port, path, username, display_name],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn db_load_network_favorites() -> Result<Vec<NetworkFavorite>, String> {
    let conn = get_db()?;
    let mut stmt = conn.prepare("SELECT id, protocol, host, port, path, username, display_name FROM network_favorites ORDER BY last_used DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(NetworkFavorite {
            id: row.get(0)?,
            protocol: row.get(1)?,
            host: row.get(2)?,
            port: row.get(3)?,
            path: row.get(4)?,
            username: row.get(5)?,
            display_name: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
fn db_delete_network_favorite(id: i64) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM network_favorites WHERE id = ?1", rusqlite::params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct RecentItem {
    path: String,
    name: String,
    is_dir: bool,
    ext: String,
    access_count: i32,
    last_accessed: String,
}

#[tauri::command]
fn db_add_recent(path: String, name: String, is_dir: bool, ext: String) -> Result<(), String> {
    let conn = get_db()?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO recent_items (path, name, is_dir, ext, access_count, last_accessed) VALUES (?1, ?2, ?3, ?4, 1, ?5)
         ON CONFLICT(path) DO UPDATE SET access_count = access_count + 1, last_accessed = ?5, name = ?2, is_dir = ?3, ext = ?4",
        rusqlite::params![path, name, is_dir as i32, ext, now],
    ).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM recent_items WHERE path NOT IN (SELECT path FROM recent_items ORDER BY last_accessed DESC LIMIT 200)", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn db_load_recent(mode: String, limit: i32) -> Result<Vec<RecentItem>, String> {
    let conn = get_db()?;
    let order = if mode == "frequent" { "access_count DESC, last_accessed DESC" } else { "last_accessed DESC" };
    let sql = format!("SELECT path, name, is_dir, ext, access_count, last_accessed FROM recent_items ORDER BY {} LIMIT ?1", order);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![limit], |row| {
        Ok(RecentItem {
            path: row.get(0)?,
            name: row.get(1)?,
            is_dir: row.get::<_, i32>(2)? != 0,
            ext: row.get(3)?,
            access_count: row.get(4)?,
            last_accessed: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
fn db_remove_recent(path: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM recent_items WHERE path = ?1", rusqlite::params![path]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn db_clear_recent() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM recent_items", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
struct I18nFileInfo {
    code: String,
    name: String,
    url: String,
}

#[tauri::command]
fn list_i18n_files(app: tauri::AppHandle) -> Result<Vec<I18nFileInfo>, String> {
    let mut result = Vec::new();
    if let Ok(dir) = std::path::PathBuf::from("../src/i18n").canonicalize() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    let code = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
                    if code.is_empty() { continue; }
                    let url = format!("/i18n/{}.json", code);
                    result.push(I18nFileInfo {
                        code: code.clone(),
                        name: code.clone(),
                        url,
                    });
                }
            }
        }
    }
    Ok(result)
}

#[tauri::command]
fn db_export_all() -> Result<HashMap<String, String>, String> {
    let conn = get_db()?;
    let mut data = HashMap::new();
    let mut stmt = conn.prepare("SELECT path, tags FROM tags").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
    let mut tags_map = HashMap::new();
    for row in rows {
        let (path, tags_json) = row.map_err(|e| e.to_string())?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        tags_map.insert(path, tags);
    }
    data.insert("db_tags".into(), serde_json::to_string(&tags_map).map_err(|e| e.to_string())?);

    let mut stmt = conn.prepare("SELECT path, layout FROM folder_layouts").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
    let mut layouts_map = HashMap::new();
    for row in rows {
        let (path, layout) = row.map_err(|e| e.to_string())?;
        layouts_map.insert(path, layout);
    }
    data.insert("db_layouts".into(), serde_json::to_string(&layouts_map).map_err(|e| e.to_string())?);

    let mut stmt = conn.prepare("SELECT path, name FROM pinned ORDER BY ord").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
    let mut pinned_list = Vec::new();
    for row in rows {
        pinned_list.push(row.map_err(|e| e.to_string())?);
    }
    data.insert("db_pinned".into(), serde_json::to_string(&pinned_list).map_err(|e| e.to_string())?);

    let mut stmt = conn.prepare("SELECT id, protocol, host, port, path, username, display_name FROM network_favorites ORDER BY last_used DESC").map_err(|e| e.to_string())?;
    let net_rows = stmt.query_map([], |row| {
        Ok(NetworkFavorite {
            id: row.get(0)?,
            protocol: row.get(1)?,
            host: row.get(2)?,
            port: row.get(3)?,
            path: row.get(4)?,
            username: row.get(5)?,
            display_name: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut net_list = Vec::new();
    for row in net_rows {
        net_list.push(row.map_err(|e| e.to_string())?);
    }
    data.insert("db_network_favorites".into(), serde_json::to_string(&net_list).map_err(|e| e.to_string())?);

    Ok(data)
}

#[tauri::command]
fn db_import_all(tags_json: String, layouts_json: String, pinned_json: String, network_favorites_json: String) -> Result<(), String> {
    let conn = get_db()?;

    if !tags_json.is_empty() {
        let tags_map: HashMap<String, Vec<String>> = serde_json::from_str(&tags_json).map_err(|e| e.to_string())?;
        for (path, tags) in &tags_map {
            let tj = serde_json::to_string(tags).map_err(|e| e.to_string())?;
            conn.execute("INSERT OR REPLACE INTO tags (path, tags) VALUES (?1, ?2)", rusqlite::params![path, tj]).map_err(|e| e.to_string())?;
        }
    }

    if !layouts_json.is_empty() {
        let layouts_map: HashMap<String, String> = serde_json::from_str(&layouts_json).map_err(|e| e.to_string())?;
        for (path, layout) in &layouts_map {
            conn.execute("INSERT OR REPLACE INTO folder_layouts (path, layout) VALUES (?1, ?2)", rusqlite::params![path, layout]).map_err(|e| e.to_string())?;
        }
    }

    if !pinned_json.is_empty() {
        let pinned_list: Vec<(String, String)> = serde_json::from_str(&pinned_json).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM pinned", []).map_err(|e| e.to_string())?;
        for (i, (path, name)) in pinned_list.iter().enumerate() {
            conn.execute("INSERT INTO pinned (path, name, ord) VALUES (?1, ?2, ?3)", rusqlite::params![path, name, i]).map_err(|e| e.to_string())?;
        }
    }

    if !network_favorites_json.is_empty() {
        let net_list: Vec<NetworkFavorite> = serde_json::from_str(&network_favorites_json).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM network_favorites", []).map_err(|e| e.to_string())?;
        for fav in &net_list {
            conn.execute(
                "INSERT INTO network_favorites (protocol, host, port, path, username, display_name, last_used) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
                rusqlite::params![fav.protocol, fav.host, fav.port, fav.path, fav.username, fav.display_name],
            ).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn db_clear_all() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM tags", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folder_layouts", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folder_prefs", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM pinned", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM network_favorites", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM recent_items", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_file_info(path: String) -> Result<FileDetailInfo, String> {
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

#[derive(Serialize)]
struct FileDetailInfo {
    name: String, path: String, extension: String, is_dir: bool,
    size: u64, size_display: String,
    folder_size: Option<u64>, folder_size_display: Option<String>,
    modified: String, created: String, readonly: bool, attributes: String,
}

fn format_size(bytes: u64) -> String {
    let b = bytes as f64;
    if b < 1024.0 { format!("{} B", bytes) }
    else if b < 1024.0 * 1024.0 { format!("{:.1} KB", b / 1024.0) }
    else if b < 1024.0 * 1024.0 * 1024.0 { format!("{:.1} MB", b / (1024.0 * 1024.0)) }
    else { format!("{:.1} GB", b / (1024.0 * 1024.0 * 1024.0)) }
}

#[tauri::command]
fn create_shortcut(target: String, name: String, dest: String) -> Result<(), String> {
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

fn find_es_exe() -> Option<String> {
    let candidates = [
        r"C:\Program Files\Everything\es.exe",
        r"C:\Program Files (x86)\Everything\es.exe",
    ];
    for c in &candidates {
        if Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("where")
        .arg("es.exe")
        .creation_flags(0x08000000)
        .output()
        .ok();
    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("which")
        .arg("es.exe")
        .output()
        .ok();
    output.and_then(|o| {
        if o.status.success() {
            String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
        } else {
            None
        }
    })
}

#[tauri::command]
fn is_everything_available() -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::FindWindowW;
        let class_name: Vec<u16> = "EVERYTHING_TASKBAR_NOTIFICATION\0".encode_utf16().collect();
        let hwnd = unsafe { FindWindowW(windows::core::PCWSTR(class_name.as_ptr()), None) };
        if hwnd.is_ok() { return true; }
        find_es_exe().is_some()
    }
    #[cfg(not(target_os = "windows"))]
    {
        find_es_exe().is_some()
    }
}

#[derive(Default)]
struct SearchFilters {
    query_text: String,
    ext_filter: Option<Vec<String>>,
    type_filter: Option<String>,
    size_min: Option<u64>,
    size_max: Option<u64>,
    files_only: bool,
    folders_only: bool,
    use_regex: bool,
    use_wildcards: bool,
}

fn parse_size_value(s: &str) -> Option<u64> {
    let s = s.trim();
    if s == "empty" { return Some(0); }
    let lower = s.to_lowercase();
    let (num_part, multiplier) = if lower.ends_with("gb") {
        (&lower[..lower.len()-2], 1073741824u64)
    } else if lower.ends_with("mb") {
        (&lower[..lower.len()-2], 1048576u64)
    } else if lower.ends_with("kb") {
        (&lower[..lower.len()-2], 1024u64)
    } else {
        (lower.as_str(), 1u64)
    };
    num_part.trim().parse::<f64>().ok().map(|v| (v * multiplier as f64) as u64)
}

fn parse_search_query(raw: &str) -> SearchFilters {
    let mut f = SearchFilters::default();
    let mut text_parts: Vec<String> = Vec::new();
    let tokens = raw.split_whitespace().collect::<Vec<_>>();
    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i];
        let lower = token.to_lowercase();
        if lower.starts_with("regex:") {
            f.use_regex = true;
            let rest = &token[6..];
            if !rest.is_empty() { text_parts.push(rest.to_string()); }
        } else if lower.starts_with("wildcards:") {
            f.use_wildcards = true;
            let rest = &token[10..];
            if !rest.is_empty() { text_parts.push(rest.to_string()); }
        } else if lower.starts_with("ext:") {
            let exts: Vec<String> = token[4..].split(';').map(|e| e.trim().to_lowercase()).filter(|e| !e.is_empty()).collect();
            if !exts.is_empty() { f.ext_filter = Some(exts); }
        } else if lower.starts_with("size:") {
            let val = &token[5..];
            if let Some(range) = val.find("..") {
                f.size_min = parse_size_value(&val[..range]);
                f.size_max = parse_size_value(&val[range+2..]);
            } else if val.starts_with('>') {
                f.size_min = parse_size_value(&val[1..]).map(|v| v + 1);
            } else if val.starts_with('<') {
                f.size_max = parse_size_value(&val[1..]).map(|v| if v > 0 { v - 1 } else { 0 });
            } else if val.starts_with(">=") {
                f.size_min = parse_size_value(&val[2..]);
            } else if val.starts_with("<=") {
                f.size_max = parse_size_value(&val[2..]);
            } else {
                let exact = parse_size_value(val);
                if let Some(s) = exact {
                    f.size_min = Some(s);
                    f.size_max = Some(s);
                }
            }
        } else if lower == "file:" || lower == "files:" {
            f.files_only = true;
        } else if lower == "folder:" || lower == "folders:" {
            f.folders_only = true;
        } else if lower == "audio:" {
            f.ext_filter = Some(vec!["mp3".into(),"wav".into(),"flac".into(),"aac".into(),"ogg".into(),"wma".into(),"m4a".into(),"opus".into()]);
        } else if lower == "video:" {
            f.ext_filter = Some(vec!["mp4".into(),"avi".into(),"mkv".into(),"mov".into(),"wmv".into(),"flv".into(),"webm".into(),"m4v".into()]);
        } else if lower == "pic:" {
            f.ext_filter = Some(vec!["jpg".into(),"jpeg".into(),"png".into(),"gif".into(),"bmp".into(),"svg".into(),"webp".into(),"ico".into(),"tiff".into(),"tif".into()]);
        } else if lower == "doc:" {
            f.ext_filter = Some(vec!["pdf".into(),"doc".into(),"docx".into(),"xls".into(),"xlsx".into(),"ppt".into(),"pptx".into(),"txt".into(),"rtf".into(),"odt".into()]);
        } else if lower == "exe:" {
            f.ext_filter = Some(vec!["exe".into(),"msi".into(),"bat".into(),"cmd".into(),"ps1".into()]);
        } else if lower == "zip:" {
            f.ext_filter = Some(vec!["zip".into(),"rar".into(),"7z".into(),"tar".into(),"gz".into(),"bz2".into()]);
        } else if lower.starts_with("type:") {
            f.type_filter = Some(token[5..].to_lowercase());
        } else {
            text_parts.push(token.to_string());
        }
        i += 1;
    }
    f.query_text = text_parts.join(" ");
    if f.ext_filter.is_none() {
        if let Some(ref tf) = f.type_filter {
            match tf.as_str() {
                "audio" => f.ext_filter = Some(vec!["mp3".into(),"wav".into(),"flac".into(),"aac".into(),"ogg".into(),"m4a".into()]),
                "video" => f.ext_filter = Some(vec!["mp4".into(),"avi".into(),"mkv".into(),"mov".into(),"wmv".into(),"webm".into()]),
                "image" | "picture" | "pic" => f.ext_filter = Some(vec!["jpg".into(),"jpeg".into(),"png".into(),"gif".into(),"bmp".into(),"svg".into(),"webp".into()]),
                "document" | "doc" => f.ext_filter = Some(vec!["pdf".into(),"doc".into(),"docx".into(),"txt".into(),"rtf".into()]),
                "archive" | "zip" => f.ext_filter = Some(vec!["zip".into(),"rar".into(),"7z".into(),"tar".into(),"gz".into()]),
                _ => {}
            }
        }
    }
    f
}

fn matches_builtin_filter(name: &str, extension: &str, is_dir: bool, size: u64, filters: &SearchFilters) -> bool {
    if filters.files_only && is_dir { return false; }
    if filters.folders_only && !is_dir { return false; }
    if !is_dir {
        if let Some(ref exts) = filters.ext_filter {
            let ext_lower = extension.to_lowercase();
            if !exts.iter().any(|e| e == &ext_lower) { return false; }
        }
    }
    if let Some(min) = filters.size_min {
        if size < min { return false; }
    }
    if let Some(max) = filters.size_max {
        if size > max { return false; }
    }
    if !filters.query_text.is_empty() {
        let name_lower = name.to_lowercase();
        let query_lower = filters.query_text.to_lowercase();
        if filters.use_regex {
            if let Ok(re) = regex::Regex::new(&filters.query_text) {
                if !re.is_match(name) { return false; }
            } else { return false; }
        } else if filters.use_wildcards {
            let pattern = query_lower.replace('*', ".*").replace('?', ".");
            if let Ok(re) = regex::Regex::new(&format!("^{}$", pattern)) {
                if !re.is_match(&name_lower) { return false; }
            } else { return false; }
        } else {
            let words: Vec<&str> = query_lower.split('|').collect();
            let has_or = query_lower.contains('|');
            if has_or {
                if !words.iter().any(|w| name_lower.contains(w.trim())) { return false; }
            } else {
                for word in query_lower.split_whitespace() {
                    if word.starts_with('!') || word.starts_with('-') {
                        if name_lower.contains(&word[1..]) { return false; }
                    } else if !name_lower.contains(word) { return false; }
                }
            }
        }
    }
    true
}

fn builtin_search(filters: &SearchFilters, max_results: usize) -> Vec<FileInfo> {
    let mut results = Vec::new();
    for drive in ['C', 'D', 'E', 'F', 'G', 'H'] {
        let root = format!("{}:\\", drive);
        if !Path::new(&root).exists() { continue; }
        builtin_search_dir(&PathBuf::from(&root), filters, &mut results, max_results);
        if results.len() >= max_results { break; }
    }
    results
}

fn builtin_search_dir(dir: &Path, filters: &SearchFilters, results: &mut Vec<FileInfo>, max: usize) {
    if results.len() >= max { return; }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        if results.len() >= max { return; }
        let name = entry.file_name().to_string_lossy().into_owned();
        if let Ok(metadata) = entry.metadata() {
            let is_dir = metadata.is_dir();
            let size = metadata.len();
            let extension = if is_dir { String::new() }
                else { Path::new(&name).extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default() };
            if matches_builtin_filter(&name, &extension, is_dir, size, filters) {
                results.push(FileInfo {
                    name, path: entry.path().to_string_lossy().into_owned(), extension,
                    is_dir, is_hidden: false, size,
                    size_display: format_size(size),
                    modified: metadata.modified().ok().map(|t| format_time(t)).unwrap_or_default(),
                    created: String::new(),
                    modified_ts: metadata.modified().ok().and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0),
                    created_ts: 0,
                    folder_size: None,
                });
            }
            if is_dir { builtin_search_dir(&entry.path(), filters, results, max); }
        }
    }
}

#[tauri::command]
fn quick_search(query: String, max_results: usize, engine: String) -> Result<Vec<FileInfo>, String> {
    let use_everything = engine == "everything" || (engine == "auto" && is_everything_available());

    if use_everything {
        if let Some(es) = find_es_exe() {
            let output = std::process::Command::new(&es)
                .args(["-n", &max_results.to_string(), &query])
                .creation_flags(0x08000000)
                .output()
                .map_err(|e| e.to_string())?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut results = Vec::new();
                for line in stdout.lines() {
                    let line = line.trim();
                    if line.is_empty() { continue; }
                    let path = PathBuf::from(line);
                    if let Some(name) = path.file_name().map(|n| n.to_string_lossy().into_owned()) {
                        let metadata = std::fs::metadata(&path).ok();
                        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                        let extension = if is_dir { String::new() }
                            else { path.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default() };
                        results.push(FileInfo {
                            name, path: line.to_string(), extension,
                            is_dir, is_hidden: false, size,
                            size_display: format_size(size),
                            modified: metadata.as_ref().and_then(|m| m.modified().ok()).map(|t| format_time(t)).unwrap_or_default(),
                            created: String::new(),
                            modified_ts: metadata.as_ref().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0),
                            created_ts: 0,
                            folder_size: None,
                        });
                    }
                    if results.len() >= max_results { break; }
                }
                return Ok(results);
            }
        }
        if engine == "everything" {
            return Err("Everything is not installed. Download from voidtools.com".to_string());
        }
    }

    let filters = parse_search_query(&query);
    Ok(builtin_search(&filters, max_results))
}

#[tauri::command]
fn search_recursive(path: String, query: String, max_results: usize) -> Result<Vec<FileInfo>, String> {
    let filters = parse_search_query(&query);
    let mut results = Vec::new();
    builtin_search_dir(&PathBuf::from(&path), &filters, &mut results, max_results);
    Ok(results)
}

// === ADS (NTFS Alternate Data Streams) ===

#[tauri::command]
fn list_ads(path: String) -> Result<Vec<String>, String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &format!(
            "Get-Item -LiteralPath '{}' -Stream * | Where-Object {{ $_.Stream -ne ':$DATA' }} | Select-Object -ExpandProperty Stream",
            path.replace("'", "''")
        )])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
}

#[tauri::command]
fn delete_ads(path: String, stream: String) -> Result<(), String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &format!(
            "Remove-Item -LiteralPath \"{}:{}\" -Force -ErrorAction Stop",
            path.replace('"', "\"\""), stream.replace('"', "\"\"")
        )])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(err.to_string());
    }
    Ok(())
}

#[tauri::command]
fn read_ads(path: String, stream: String) -> Result<String, String> {
    let full_path = format!("{}:{}", path, stream);
    std::fs::read_to_string(&full_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn unblock_file(path: String) -> Result<(), String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &format!(
            "Unblock-File -LiteralPath '{}'",
            path.replace("'", "''")
        )])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(err.to_string());
    }
    Ok(())
}

// === PiP Mode ===

#[tauri::command]
async fn toggle_pip(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("main") {
        let is_top = win.is_always_on_top().map_err(|e| e.to_string())?;
        if is_top {
            win.set_always_on_top(false).map_err(|e| e.to_string())?;
            win.set_decorations(true).map_err(|e| e.to_string())?;
            win.set_size(tauri::LogicalSize::new(1200.0, 800.0)).map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            win.set_always_on_top(true).map_err(|e| e.to_string())?;
            win.set_decorations(false).map_err(|e| e.to_string())?;
            win.set_size(tauri::LogicalSize::new(500.0, 400.0)).map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("No main window".to_string())
    }
}

// === 7z Compression ===

fn find_7z() -> Option<String> {
    let candidates = [
        r"C:\Program Files\7-Zip\7z.exe",
        r"C:\Program Files (x86)\7-Zip\7z.exe",
    ];
    for c in &candidates {
        if Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    std::process::Command::new("where")
        .arg("7z.exe")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
            } else {
                None
            }
        })
}

#[tauri::command]
fn extract_7z(archive: String, dest: String) -> Result<(), String> {
    let exe = find_7z().ok_or("7-Zip not installed. Download from 7-zip.org")?;
    let output = std::process::Command::new(&exe)
        .args(["x", &archive, &format!("-o{}", dest), "-y"])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn create_7z(sources: Vec<String>, archive: String) -> Result<(), String> {
    let exe = find_7z().ok_or("7-Zip not installed. Download from 7-zip.org")?;
    let mut cmd = std::process::Command::new(&exe);
    cmd.args(["a", &archive, "-mx=5"]);
    for s in &sources {
        cmd.arg(s);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn is_7z_available() -> bool {
    find_7z().is_some()
}

// === WINDOW EFFECT ===

#[tauri::command]
async fn set_window_effect(effect: String, window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWINDOWATTRIBUTE};

        let tauri_hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = windows::Win32::Foundation::HWND(tauri_hwnd.0);
        let backdrop: u32 = match effect.as_str() {
            "mica" => 2,
            "acrylic" => 3,
            "mica-alt" => 4,
            _ => 0,
        };
        unsafe {
            let dark_mode: u32 = 1;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWINDOWATTRIBUTE(20),
                &dark_mode as *const u32 as *const core::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWINDOWATTRIBUTE(38),
                &backdrop as *const u32 as *const core::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = (effect, window); Err("Not supported on this platform".to_string()) }
}

// === QUICKLOOK ===

#[tauri::command]
fn quicklook(path: String) -> Result<(), String> {
    let output = std::process::Command::new("cmd")
        .args(["/C", "where", "QuickLook.exe"])
        .output();
    match output {
        Ok(o) if o.status.success() => {
            let exe = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !exe.is_empty() {
                let _ = std::process::Command::new(&exe).arg(&path).spawn();
            }
            Ok(())
        }
        _ => {
            let seer = std::process::Command::new("cmd")
                .args(["/C", "where", "Seer.exe"])
                .output();
            match seer {
                Ok(s) if s.status.success() => {
                    let exe = String::from_utf8_lossy(&s.stdout).trim().to_string();
                    if !exe.is_empty() {
                        let _ = std::process::Command::new(&exe).arg(&path).spawn();
                    }
                    Ok(())
                }
                _ => Err("QuickLook or Seer Pro not found. Install QuickLook for file previews.".to_string()),
            }
        }
    }
}

// === NEW COMMANDS ===

#[tauri::command]
fn folder_size(path: String) -> Result<u64, String> {
    enumerator::folder_size(&PathBuf::from(&path))
}

#[tauri::command]
fn compute_hash(path: String, algorithm: String) -> Result<String, String> {
    enumerator::file_hash(&PathBuf::from(&path), &algorithm)
}

#[tauri::command]
fn open_terminal(path: String, terminal: String) -> Result<(), String> {
    enumerator::open_terminal(&PathBuf::from(&path), &terminal)
}

#[tauri::command]
fn get_file_icon(path: String, size: u32) -> Result<String, String> {
    enumerator::extract_file_icon(&PathBuf::from(&path), size)
}

#[tauri::command]
fn get_new_file_templates() -> Result<Vec<enumerator::NewFileTemplate>, String> {
    enumerator::get_new_file_templates()
}

#[tauri::command]
fn create_new_file(parent: String, template: String, name: String) -> Result<(), String> {
    enumerator::create_new_file(&PathBuf::from(&parent), &template, &name)
}

#[tauri::command]
fn get_file_association(extension: String) -> Result<String, String> {
    enumerator::get_file_association(&extension)
}

#[tauri::command]
fn run_as_admin(path: String) -> Result<(), String> {
    enumerator::run_as_admin(&PathBuf::from(&path))
}

#[tauri::command]
fn empty_recycle_bin() -> Result<(), String> {
    enumerator::empty_recycle_bin()
}

#[tauri::command]
fn rotate_image(path: String, degrees: i32) -> Result<(), String> {
    enumerator::rotate_image(&PathBuf::from(&path), degrees)
}

#[tauri::command]
fn read_shortcut(path: String) -> Result<enumerator::ShortcutInfo, String> {
    enumerator::read_shortcut_target(&PathBuf::from(&path))
}

#[tauri::command]
fn detect_ides() -> Vec<enumerator::IDEInfo> {
    enumerator::detect_ides()
}

#[tauri::command]
fn open_in_ide(ide_cmd: String, path: String) -> Result<(), String> {
    enumerator::open_in_ide(&ide_cmd, &PathBuf::from(&path))
}

#[tauri::command]
fn install_font(path: String) -> Result<(), String> {
    enumerator::install_font(&PathBuf::from(&path))
}

#[tauri::command]
fn set_wallpaper(path: String) -> Result<(), String> {
    enumerator::set_wallpaper(&PathBuf::from(&path))
}

#[tauri::command]
fn set_file_readonly(path: String, readonly: bool) -> Result<(), String> {
    enumerator::set_file_readonly(&PathBuf::from(&path), readonly)
}

#[tauri::command]
async fn open_new_window(app: tauri::AppHandle, initial_path: Option<String>) -> Result<String, String> {
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let label = format!("window-{}", id);
    {
        let conn = get_db()?;
        let state_json = initial_path.as_ref().map(|p| serde_json::json!({"initial_path": p}).to_string()).unwrap_or_default();
        conn.execute(
            "INSERT OR REPLACE INTO window_states (window_id, state_json, pos_x, pos_y, width, height, maximized, sort_order) VALUES (?1, ?2, 0, 0, 1200, 800, 0, 0)",
            rusqlite::params![label, state_json],
        ).map_err(|e| e.to_string())?;
    }
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("RHFiles")
    .inner_size(1200.0, 800.0)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(label)
}

#[tauri::command]
fn get_window_label(window: tauri::WebviewWindow) -> String {
    window.label().to_string()
}

#[tauri::command]
fn save_window_state(window_id: String, state_json: String, pos_x: i32, pos_y: i32, width: i32, height: i32, maximized: bool, sort_order: i32) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "INSERT OR REPLACE INTO window_states (window_id, state_json, pos_x, pos_y, width, height, maximized, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![window_id, state_json, pos_x, pos_y, width, height, maximized as i32, sort_order],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_window_state(window_id: String) -> Result<Option<serde_json::Value>, String> {
    let conn = get_db()?;
    let mut stmt = conn.prepare("SELECT state_json, pos_x, pos_y, width, height, maximized, sort_order FROM window_states WHERE window_id = ?1")
        .map_err(|e| e.to_string())?;
    let result = stmt.query_row(rusqlite::params![window_id], |row| {
        let state_json: String = row.get(0)?;
        let pos_x: i32 = row.get(1)?;
        let pos_y: i32 = row.get(2)?;
        let width: i32 = row.get(3)?;
        let height: i32 = row.get(4)?;
        let maximized: i32 = row.get(5)?;
        let sort_order: i32 = row.get(6)?;
        Ok(serde_json::json!({
            "state_json": state_json,
            "pos_x": pos_x,
            "pos_y": pos_y,
            "width": width,
            "height": height,
            "maximized": maximized != 0,
            "sort_order": sort_order,
        }))
    });
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn get_all_window_states() -> Result<Vec<serde_json::Value>, String> {
    let conn = get_db()?;
    let mut stmt = conn.prepare("SELECT window_id, state_json, pos_x, pos_y, width, height, maximized, sort_order FROM window_states ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let window_id: String = row.get(0)?;
        let state_json: String = row.get(1)?;
        let pos_x: i32 = row.get(2)?;
        let pos_y: i32 = row.get(3)?;
        let width: i32 = row.get(4)?;
        let height: i32 = row.get(5)?;
        let maximized: i32 = row.get(6)?;
        let sort_order: i32 = row.get(7)?;
        Ok(serde_json::json!({
            "window_id": window_id,
            "state_json": state_json,
            "pos_x": pos_x,
            "pos_y": pos_y,
            "width": width,
            "height": height,
            "maximized": maximized != 0,
            "sort_order": sort_order,
        }))
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
fn delete_window_state(window_id: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM window_states WHERE window_id = ?1", rusqlite::params![window_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn save_current_window_geometry(window: tauri::WebviewWindow, state_json: String) -> Result<(), String> {
    let pos = window.inner_position().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let is_maximized = window.is_maximized().unwrap_or(false);
    let window_id = window.label().to_string();
    let conn = get_db()?;
    conn.execute(
        "INSERT OR REPLACE INTO window_states (window_id, state_json, pos_x, pos_y, width, height, maximized, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, (SELECT COALESCE(sort_order, 0) FROM window_states WHERE window_id = ?1))",
        rusqlite::params![window_id, state_json, pos.x, pos.y, size.width as i32, size.height as i32, is_maximized as i32],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn restore_window_geometry(window: tauri::WebviewWindow) -> Result<(), String> {
    let window_id = window.label().to_string();
    let conn = get_db()?;
    let result: Result<(i32, i32, i32, i32, bool), _> = conn.query_row(
        "SELECT pos_x, pos_y, width, height, maximized FROM window_states WHERE window_id = ?1",
        rusqlite::params![window_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get::<_, i32>(4)? != 0)),
    );
    if let Ok((pos_x, pos_y, width, height, maximized)) = result {
        if width > 0 && height > 0 {
            let _ = window.set_size(tauri::LogicalSize::new(width as f64, height as f64));
        }
        if pos_x != 0 || pos_y != 0 {
            let _ = window.set_position(tauri::LogicalPosition::new(pos_x as f64, pos_y as f64));
        }
        if maximized {
            let _ = window.maximize();
        }
    }
    Ok(())
}

#[tauri::command]
async fn check_updates() -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let resp = client.get("https://api.github.com/repos/RailgunHamster/RHFiles/releases/latest")
        .header("User-Agent", "RHFiles")
        .send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let latest = body.get("tag_name").and_then(|v| v.as_str()).unwrap_or("");
    let current = env!("CARGO_PKG_VERSION");
    if !latest.is_empty() && latest != current {
        let url = body.get("html_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
        Ok(Some(format!("{}|{}", latest, url)))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn rtf_to_html(path: String) -> Result<String, String> {
    let ps = format!(
        r#"$rtb = New-Object System.Windows.Forms.RichTextBox;
        $rtb.Rtf = [System.IO.File]::ReadAllText('{}');
        $rtb.Text"#,
        path.replace("'", "''")
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-STA", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    Ok(format!("<pre style='white-space:pre-wrap'>{}</pre>", escaped))
}

#[tauri::command]
fn docx_to_text(path: String) -> Result<String, String> {
    let ps = format!(
        r#"Add-Type -AssemblyName 'System.IO.Compression.FileSystem';
        $zip = [System.IO.Compression.ZipFile]::OpenRead('{}');
        $entry = $zip.GetEntry('word/document.xml');
        if ($entry) {{
            $stream = $entry.Open();
            $reader = New-Object System.IO.StreamReader($stream);
            $xml = [xml]$reader.ReadToEnd();
            $reader.Close();
            $zip.Dispose();
            $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable);
            $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
            $paragraphs = $xml.SelectNodes('//w:p', $ns);
            ($paragraphs | ForEach-Object {{ 
                $_.SelectNodes('.//w:t', $ns) | ForEach-Object {{ $_.'#text' }}
            }}) -join ' '
        }} else {{
            $zip.Dispose();
            'No document content found'
        }}"#,
        path.replace("'", "''")
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    Ok(format!("<pre style='white-space:pre-wrap'>{}</pre>", escaped))
}

#[tauri::command]
async fn format_drive(drive: String, label: String, fs: String, quick: bool) -> Result<(), String> {
    let drive_letter = drive.chars().next().unwrap_or('C');
    let mut args: Vec<String> = vec![
        format!("{}:", drive_letter),
        format!("/fs:{}", fs),
        format!("/v:{}", label),
    ];
    if quick {
        args.push("/q".to_string());
    }
    args.push("/y".to_string());
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("format.com")
        .args(&args)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("format.com")
        .args(&args)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn install_certificate(path: String) -> Result<(), String> {
    let output = std::process::Command::new("certutil")
        .args(["-addstore", "TrustedPublisher", &path])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn set_compat_mode(path: String, mode: String) -> Result<(), String> {
    let ps = if mode.is_empty() {
        format!(
            "Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' -Name '{}' -ErrorAction SilentlyContinue",
            path.replace("'", "''")
        )
    } else {
        format!(
            "if (-not (Test-Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers')) {{ New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' -Force | Out-Null }}; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' -Name '{}' -Value '~ {}' -Force",
            path.replace("'", "''"), mode
        )
    };
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn get_compat_mode(path: String) -> Result<String, String> {
    let escaped = path.replace("'", "''");
    let ps = format!(
        "try {{ (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' -Name '{}' -ErrorAction Stop).'{}' }} catch {{ '' }}",
        escaped, escaped
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;
    let val = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(val.strip_prefix("~ ").unwrap_or(&val).to_string())
}

// === Error Reporting ===

#[tauri::command]
fn log_error(message: String, source: Option<String>, stack: Option<String>) -> Result<(), String> {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let entry = format!("[{}] {} (source: {})\n{}",
        timestamp,
        message,
        source.unwrap_or_default(),
        stack.unwrap_or_default()
    );
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let log_dir = std::path::PathBuf::from(app_data).join("RHFiles").join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log_path = log_dir.join(format!("error-{}.log", chrono::Local::now().format("%Y-%m-%d")));
    use std::io::Write;
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut f| writeln!(f, "{}", entry))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_error_logs() -> Result<Vec<String>, String> {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let log_dir = std::path::PathBuf::from(app_data).join("RHFiles").join("logs");
    if !log_dir.exists() {
        return Ok(Vec::new());
    }
    let mut logs = Vec::new();
    for entry in std::fs::read_dir(&log_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if let Some(name) = path.to_str() {
            if name.ends_with(".log") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    logs.push(content);
                }
            }
        }
    }
    Ok(logs)
}

// === Git Clone ===

#[tauri::command]
async fn git_clone(url: String, dest: String) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(["clone", &url, &dest])
        .output()
        .map_err(|e| format!("git not found: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.to_string());
    }
    Ok(dest)
}

// === Cloud Storage Sync Status ===

#[tauri::command]
fn get_cloud_status(path: String) -> Result<String, String> {
    use std::os::windows::fs::MetadataExt;
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let attrs = metadata.file_attributes();
    let path_lower = path.to_lowercase();
    let is_onedrive = path_lower.contains("onedrive");
    let is_gdrive = path_lower.contains("google drive") || path_lower.contains("my drive");
    if !is_onedrive && !is_gdrive {
        return Ok("none".to_string());
    }
    const FILE_ATTRIBUTE_OFFLINE: u32 = 0x00001000;
    const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x00400000;
    const FILE_ATTRIBUTE_PINNED: u32 = 0x00000080;
    const FILE_ATTRIBUTE_UNPINNED: u32 = 0x00100000;
    if attrs & FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS != 0 {
        Ok("syncing".to_string())
    } else if attrs & FILE_ATTRIBUTE_OFFLINE != 0 {
        if attrs & FILE_ATTRIBUTE_PINNED != 0 {
            Ok("syncing".to_string())
        } else {
            Ok("online_only".to_string())
        }
    } else if attrs & FILE_ATTRIBUTE_UNPINNED != 0 {
        Ok("locally_available".to_string())
    } else {
        Ok("synced".to_string())
    }
}

#[derive(Serialize, Clone)]
struct CloudProvider {
    id: String,
    name: String,
    path: String,
    icon_dll: String,
    icon_index: i32,
}

#[tauri::command]
fn get_cloud_providers() -> Result<Vec<CloudProvider>, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let root_path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\SyncRootManager";
    let root = hklm.open_subkey(root_path).map_err(|e| e.to_string())?;
    let mut providers = Vec::new();
    for child in root.enum_keys().flatten() {
        if let Ok(subkey) = root.open_subkey(&child) {
            let name: String = subkey.get_value("DisplayNameResource").unwrap_or_else(|_| {
                let parts: Vec<&str> = child.split('!').collect();
                parts.first().map(|s| s.to_string()).unwrap_or_default()
            });
            let user_path: Option<String> = subkey.open_subkey("UserSyncRoots")
                .ok()
                .and_then(|usr| {
                    let sids: Vec<String> = usr.enum_values().filter_map(|v| v.ok()).map(|(k, _)| k).collect();
                    sids.first().and_then(|sid| usr.get_value::<String, _>(sid).ok())
                });
            let icon_resource: String = subkey.get_value("IconResource").unwrap_or_else(|_| "".to_string());
            let (icon_dll, icon_index) = parse_icon_resource(&icon_resource);
            if let Some(sync_path) = user_path {
                let display_name = resolve_display_name(&name);
                providers.push(CloudProvider {
                    id: child.clone(),
                    name: display_name,
                    path: sync_path,
                    icon_dll,
                    icon_index,
                });
            }
        }
    }
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let ns_path = r"Software\Microsoft\Windows\CurrentVersion\Explorer\Desktop\NameSpace";
    if let Ok(ns_root) = hkcu.open_subkey(ns_path) {
        for clsid in ns_root.enum_keys().flatten() {
            if let Ok(clsid_key) = ns_root.open_subkey(&clsid) {
                let default_name: String = clsid_key.get_value("").unwrap_or_default();
                let path_lower = default_name.to_lowercase();
                if path_lower.contains("onedrive") || path_lower.contains("cloud") {
                    if let Ok(target) = clsid_key.open_subkey("Instance\\InitPropertyBag") {
                        if let Ok(target_path) = target.get_value::<String, _>("TargetFolderPath") {
                            let expanded = expand_env_var(&target_path);
                            if !expanded.is_empty() && !providers.iter().any(|p| p.path.eq_ignore_ascii_case(&expanded)) {
                                providers.push(CloudProvider {
                                    id: clsid.clone(),
                                    name: default_name,
                                    path: expanded,
                                    icon_dll: String::new(),
                                    icon_index: 0,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    if providers.is_empty() {
        let onedrive_env = std::env::var("OneDrive").ok();
        let onedrive_commercial = std::env::var("OneDriveCommercial").ok();
        if let Some(od_path) = onedrive_env {
            if std::path::Path::new(&od_path).exists() {
                providers.push(CloudProvider {
                    id: "OneDrive".to_string(),
                    name: "OneDrive".to_string(),
                    path: od_path,
                    icon_dll: String::new(),
                    icon_index: 0,
                });
            }
        }
        if let Some(od_path) = onedrive_commercial {
            if std::path::Path::new(&od_path).exists() && !providers.iter().any(|p| p.path.eq_ignore_ascii_case(&od_path)) {
                providers.push(CloudProvider {
                    id: "OneDriveCommercial".to_string(),
                    name: "OneDrive - ".to_string() + &std::path::Path::new(&od_path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                    path: od_path,
                    icon_dll: String::new(),
                    icon_index: 0,
                });
            }
        }
    }
    Ok(providers)
}

fn parse_icon_resource(resource: &str) -> (String, i32) {
    if resource.is_empty() {
        return (String::new(), 0);
    }
    if let Some(idx) = resource.rfind(',') {
        let dll = &resource[..idx];
        let index: i32 = resource[idx + 1..].trim().parse().unwrap_or(0);
        (expand_env_var(dll), index)
    } else {
        (expand_env_var(resource), 0)
    }
}

fn resolve_display_name(resource: &str) -> String {
    if resource.contains("OneDrive") { return "OneDrive".to_string(); }
    if resource.contains("Google") { return "Google Drive".to_string(); }
    if resource.contains("Dropbox") { return "Dropbox".to_string(); }
    if resource.starts_with('@') {
        let path = resource.trim_start_matches('@');
        let dll = if let Some(idx) = path.rfind(",-") { &path[..idx] } else { path };
        let expanded = expand_env_var(dll);
        if let Some(name) = std::path::Path::new(&expanded).file_stem() {
            return name.to_string_lossy().into_owned();
        }
    }
    resource.to_string()
}

fn expand_env_var(s: &str) -> String {
    let s = s.replace("%USERPROFILE%", &std::env::var("USERPROFILE").unwrap_or_default());
    let s = s.replace("%LOCALAPPDATA%", &std::env::var("LOCALAPPDATA").unwrap_or_default());
    let s = s.replace("%APPDATA%", &std::env::var("APPDATA").unwrap_or_default());
    let s = s.replace("%SystemRoot%", &std::env::var("SystemRoot").unwrap_or_default());
    let s = s.replace("%windir%", &std::env::var("windir").unwrap_or_default());
    s.replace("%ProgramFiles%", &std::env::var("ProgramFiles").unwrap_or_default())
}

#[tauri::command]
fn cloud_pin_file(path: String) -> Result<(), String> {
    let output = std::process::Command::new("attrib")
        .args(["+p", &path])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("attrib +p failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

#[tauri::command]
fn cloud_unpin_file(path: String) -> Result<(), String> {
    let output = std::process::Command::new("attrib")
        .args(["+u", &path])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("attrib +u failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

#[tauri::command]
fn cloud_clear_pin(path: String) -> Result<(), String> {
    let output = std::process::Command::new("attrib")
        .args(["-p", &path])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("attrib -p failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

#[tauri::command]
fn get_cloud_file_size(path: String) -> Result<HashMap<String, u64>, String> {
    use std::os::windows::fs::MetadataExt;
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let attrs = metadata.file_attributes();
    let local_size = metadata.len();
    let mut result = HashMap::new();
    result.insert("local_size".to_string(), local_size);
    if attrs & 0x00001000 != 0 {
        result.insert("cloud_size".to_string(), 0);
        result.insert("is_placeholder".to_string(), 1);
    } else {
        result.insert("cloud_size".to_string(), local_size);
        result.insert("is_placeholder".to_string(), 0);
    }
    Ok(result)
}

// === FTP/FTPS Connection ===

#[tauri::command]
async fn ftp_list(host: String, path: String, user: String, pass: String) -> Result<Vec<FileInfo>, String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') {
        host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21)
    } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    let remote_path = if path.is_empty() || path == "/" { "." } else { &path };
    ftp.cwd(remote_path).map_err(|e| format!("CWD: {}", e))?;
    let list = ftp.list(None).map_err(|e| format!("LIST: {}", e))?;
    ftp.quit().ok();
    parse_ftp_list(&list, &host, &path)
}

fn parse_ftp_list(list: &[String], host: &str, path: &str) -> Result<Vec<FileInfo>, String> {
    let mut entries = Vec::new();
    for line in list {
        let line_str = line.to_string();
        let parts: Vec<&str> = line_str.split_whitespace().collect();
        if parts.len() < 9 { continue; }
        let perms = parts[0];
        let is_dir = perms.starts_with('d') || perms.starts_with('l');
        let name = parts[8..].join(" ");
        if name == "." || name == ".." { continue; }
        let size: u64 = parts[4].parse().unwrap_or(0);
        let modified = format!("{} {} {}", parts[5], parts[6], parts[7]);
        let ftp_path = format!("ftp://{}/{}{}", host, path.trim_end_matches('/'), if path.ends_with('/') || path == "/" { "" } else { "/" });
        entries.push(FileInfo {
            name: name.clone(),
            path: ftp_path + &name,
            extension: if is_dir { String::new() } else { name.rsplit('.').next().unwrap_or("").to_string() },
            is_dir,
            is_hidden: name.starts_with('.'),
            size,
            size_display: if size > 0 { format_size(size) } else { String::new() },
            modified,
            created: String::new(),
            modified_ts: 0,
            created_ts: 0,
            folder_size: None,
        });
    }
    Ok(entries)
}

#[tauri::command]
async fn ftp_download(host: String, remote_path: String, local_path: String, user: String, pass: String) -> Result<(), String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') { host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21) } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    let remote_dir = std::path::Path::new(&remote_path).parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or("/".to_string());
    let filename = std::path::Path::new(&remote_path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    ftp.cwd(&remote_dir).map_err(|e| format!("CWD: {}", e))?;
    let mut reader = ftp.retr_as_stream(&filename).map_err(|e| format!("RETR: {}", e))?;
    let mut file = std::fs::File::create(&local_path).map_err(|e| format!("Create file: {}", e))?;
    std::io::copy(&mut reader, &mut file).map_err(|e| format!("Download: {}", e))?;
    ftp.finalize_retr_stream(reader).map_err(|e| format!("Finalize: {}", e))?;
    ftp.quit().ok();
    Ok(())
}

#[tauri::command]
async fn ftp_upload(host: String, local_path: String, remote_dir: String, user: String, pass: String) -> Result<(), String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') {
        host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21)
    } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    ftp.cwd(&remote_dir).map_err(|e| format!("CWD: {}", e))?;
    let filename = std::path::Path::new(&local_path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mut file = std::fs::File::open(&local_path).map_err(|e| format!("Open file: {}", e))?;
    ftp.put_file(&filename, &mut file).map_err(|e| format!("STOR: {}", e))?;
    ftp.quit().ok();
    Ok(())
}

#[tauri::command]
async fn ftp_delete(host: String, remote_path: String, is_dir: bool, user: String, pass: String) -> Result<(), String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') {
        host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21)
    } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    if is_dir {
        ftp.rmdir(&remote_path).map_err(|e| format!("RMD: {}", e))?;
    } else {
        ftp.rm(&remote_path).map_err(|e| format!("DELE: {}", e))?;
    }
    ftp.quit().ok();
    Ok(())
}

#[tauri::command]
async fn ftp_mkdir(host: String, remote_path: String, user: String, pass: String) -> Result<(), String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') { host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21) } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    ftp.mkdir(&remote_path).map_err(|e| format!("MKD: {}", e))?;
    ftp.quit().ok();
    Ok(())
}

#[tauri::command]
async fn ftp_rename(host: String, old_path: String, new_name: String, user: String, pass: String) -> Result<(), String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') { host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21) } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    let parent = std::path::Path::new(&old_path).parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or("/".to_string());
    let new_path = if parent.ends_with('/') { format!("{}{}", parent, new_name) } else { format!("{}\\{}", parent, new_name) };
    ftp.rename(&old_path, &new_path).map_err(|e| format!("RNFR/RNTO: {}", e))?;
    ftp.quit().ok();
    Ok(())
}

// === SFTP Connection ===

#[tauri::command]
async fn sftp_list(host: String, port: u16, path: String, user: String, pass: String) -> Result<Vec<FileInfo>, String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP connect: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH session: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("SSH handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("SSH auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP init: {}", e))?;
    let dir_path = std::path::Path::new(&path);
    let dir = sftp.readdir(dir_path).map_err(|e| format!("SFTP readdir: {}", e))?;
    let mut entries = Vec::new();
    for (entry_path, stat) in dir {
        let name = entry_path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if name == "." || name == ".." { continue; }
        let is_dir = stat.is_dir();
        let size = stat.size.unwrap_or(0);
        let mtime = stat.mtime.map(|t| {
            chrono::DateTime::from_timestamp(t as i64, 0)
                .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
                .unwrap_or_default()
        }).unwrap_or_default();
        let sftp_path = format!("sftp://{}:{}{}", host, port, entry_path.to_string_lossy());
        entries.push(FileInfo {
            name: name.clone(),
            path: sftp_path,
            extension: if is_dir { String::new() } else { name.rsplit('.').next().unwrap_or("").to_string() },
            is_dir,
            is_hidden: name.starts_with('.'),
            size,
            size_display: if size > 0 { format_size(size) } else { String::new() },
            modified: mtime,
            created: String::new(),
            modified_ts: stat.mtime.map(|t| t as i64 * 1000).unwrap_or(0),
            created_ts: 0,
            folder_size: None,
        });
    }
    sess.disconnect(None, "bye", None).ok();
    Ok(entries)
}

#[tauri::command]
async fn sftp_download(host: String, port: u16, remote_path: String, local_path: String, user: String, pass: String) -> Result<(), String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("Auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {}", e))?;
    let remote = std::path::Path::new(&remote_path);
    let mut remote_file = sftp.open(remote).map_err(|e| format!("Open remote: {}", e))?;
    let mut local_file = std::fs::File::create(&local_path).map_err(|e| format!("Create local: {}", e))?;
    std::io::copy(&mut remote_file, &mut local_file).map_err(|e| format!("Download: {}", e))?;
    sess.disconnect(None, "bye", None).ok();
    Ok(())
}

#[tauri::command]
async fn sftp_upload(host: String, port: u16, local_path: String, remote_path: String, user: String, pass: String) -> Result<(), String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("Auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {}", e))?;
    let remote = std::path::Path::new(&remote_path);
    let mut remote_file = sftp.create(remote).map_err(|e| format!("Create remote: {}", e))?;
    let mut local_file = std::fs::File::open(&local_path).map_err(|e| format!("Open local: {}", e))?;
    std::io::copy(&mut local_file, &mut remote_file).map_err(|e| format!("Upload: {}", e))?;
    sess.disconnect(None, "bye", None).ok();
    Ok(())
}

#[tauri::command]
async fn sftp_delete(host: String, port: u16, remote_path: String, is_dir: bool, user: String, pass: String) -> Result<(), String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("Auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {}", e))?;
    let path = std::path::Path::new(&remote_path);
    if is_dir {
        sftp.rmdir(path).map_err(|e| format!("RMDIR: {}", e))?;
    } else {
        sftp.unlink(path).map_err(|e| format!("UNLINK: {}", e))?;
    }
    sess.disconnect(None, "bye", None).ok();
    Ok(())
}

#[tauri::command]
async fn sftp_mkdir(host: String, port: u16, remote_path: String, user: String, pass: String) -> Result<(), String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("Auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {}", e))?;
    sftp.mkdir(std::path::Path::new(&remote_path), 0o755).map_err(|e| format!("MKDIR: {}", e))?;
    sess.disconnect(None, "bye", None).ok();
    Ok(())
}

#[tauri::command]
async fn sftp_rename(host: String, port: u16, old_path: String, new_path: String, user: String, pass: String) -> Result<(), String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("Auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {}", e))?;
    sftp.rename(std::path::Path::new(&old_path), std::path::Path::new(&new_path), None).map_err(|e| format!("RENAME: {}", e))?;
    sess.disconnect(None, "bye", None).ok();
    Ok(())
}

// === NTFS Permissions ===

#[tauri::command]
fn get_permissions(path: String) -> Result<Vec<serde_json::Value>, String> {
    let output = std::process::Command::new("icacls")
        .arg(&path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut perms = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.ends_with(':') {
            continue;
        }
        if line.contains(":(") {
            let parts: Vec<&str> = line.splitn(2, ":(").collect();
            if parts.len() == 2 {
                let account = parts[0].trim().to_string();
                let access = format!("({}", parts[1].trim_end_matches(','));
                let access_display = access.replace("(F)", " Full Control")
                    .replace("(M)", " Modify")
                    .replace("(RX)", " Read & Execute")
                    .replace("(R)", " Read")
                    .replace("(W)", " Write")
                    .replace("(X)", " Execute")
                    .replace("(OI)", " [Files]")
                    .replace("(CI)", " [Subfolders]")
                    .replace("(IO)", " [Inherit Only]")
                    .replace("(NP)", " [No Inherit]");

                perms.push(serde_json::json!({
                    "account": account,
                    "access": access,
                    "display": access_display
                }));
            }
        }
    }

    Ok(perms)
}

#[tauri::command]
fn set_permission(path: String, account: String, permission: String) -> Result<(), String> {
    let perm_arg = format!("{}:{}", account, permission);
    let output = std::process::Command::new("icacls")
        .args([&path, "/grant", &perm_arg])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn remove_permission(path: String, account: String) -> Result<(), String> {
    let output = std::process::Command::new("icacls")
        .args([&path, "/remove", &account])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn inherit_permissions(path: String, enable: bool) -> Result<(), String> {
    let arg = if enable { "/inheritance:e" } else { "/inheritance:d" };
    let output = std::process::Command::new("icacls")
        .args([&path, arg])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

// === MTP Device Browsing ===

#[tauri::command]
fn list_mtp_devices() -> Result<Vec<FileInfo>, String> {
    let ps = r#"
        try {
            $shell = New-Object -ComObject Shell.Application
            $devices = $shell.NameSpace(17)
            $results = @()
            foreach ($item in $devices.Items()) {
                $path = $item.Path
                if ($path -match '^::\{') {
                    $name = $item.Name
                    if ($name -and $name -notmatch '^[A-Z]:$') {
                        $results += @{
                            name = $name
                            path = $path
                            is_dir = $true
                        }
                    }
                }
            }
            $results | ConvertTo-Json -Compress
        } catch {
            '[]'
        }
    "#;

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-STA", "-Command", ps])
        .output().map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let raw: Vec<serde_json::Value> = serde_json::from_str(&stdout).unwrap_or_default();

    let mut devices = Vec::new();
    for item in raw {
        devices.push(FileInfo {
            name: item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            path: item.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            extension: String::new(),
            is_dir: true,
            is_hidden: false,
            size: 0,
            size_display: String::new(),
            modified: String::new(),
            created: String::new(),
            modified_ts: 0,
            created_ts: 0,
            folder_size: None,
        });
    }

    Ok(devices)
}

// === SMB/Network Browsing ===

#[cfg(target_os = "windows")]
#[tauri::command]
fn browse_network() -> Result<Vec<FileInfo>, String> {
    use windows::Win32::NetworkManagement::WNet::{
        WNetOpenEnumA, WNetEnumResourceA, WNetCloseEnum,
        RESOURCE_GLOBALNET, RESOURCETYPE_ANY, RESOURCEUSAGE_CONTAINER, WNET_OPEN_ENUM_USAGE,
    };
    use windows::Win32::NetworkManagement::WNet::NETRESOURCEA;
    use windows::Win32::Foundation::HANDLE;
    let mut net_resource = NETRESOURCEA::default();
    net_resource.dwScope = RESOURCE_GLOBALNET;
    net_resource.dwType = RESOURCETYPE_ANY;
    net_resource.dwUsage = RESOURCEUSAGE_CONTAINER.0;
    let mut handle: HANDLE = HANDLE::default();
    unsafe {
        let result = WNetOpenEnumA(
            RESOURCE_GLOBALNET,
            RESOURCETYPE_ANY,
            WNET_OPEN_ENUM_USAGE(0),
            Some(&net_resource),
            &mut handle,
        );
        if result.0 != 0 {
            let _ = WNetCloseEnum(handle);
            return Err(format!("WNetOpenEnum error: {}", result.0));
        }
        let mut servers = Vec::new();
        let mut buf_size: u32 = 16384;
        let mut buf = vec![0u8; buf_size as usize];
        let mut count = u32::MAX;
        loop {
            let enum_result = WNetEnumResourceA(handle, &mut count, buf.as_mut_ptr() as *mut _, &mut buf_size);
            if enum_result == windows::Win32::Foundation::ERROR_NO_MORE_ITEMS { break; }
            if enum_result.0 != 0 { break; }
            let resources = std::slice::from_raw_parts(buf.as_ptr() as *const NETRESOURCEA, count as usize);
            for res in resources {
                let name_ptr = res.lpRemoteName;
                if name_ptr.is_null() { continue; }
                let cstr = std::ffi::CStr::from_ptr(name_ptr.0 as *const i8);
                let name_str = cstr.to_string_lossy().to_string();
                let display_name = name_str.trim_start_matches('\\');
                if display_name.is_empty() { continue; }
                servers.push(FileInfo {
                    name: display_name.to_string(),
                    path: name_str.clone(),
                    extension: String::new(),
                    is_dir: true,
                    is_hidden: false,
                    size: 0,
                    size_display: String::new(),
                    modified: String::new(),
                    created: String::new(),
                    modified_ts: 0,
                    created_ts: 0,
                    folder_size: None,
                });
            }
            count = u32::MAX;
        }
        let _ = WNetCloseEnum(handle);
        Ok(servers)
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn browse_network() -> Result<Vec<FileInfo>, String> {
    Ok(Vec::new())
}

#[tauri::command]
fn list_shares(server: String) -> Result<Vec<FileInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::NetworkManagement::WNet::{
            WNetOpenEnumA, WNetEnumResourceA, WNetCloseEnum,
            RESOURCE_GLOBALNET, RESOURCETYPE_ANY, RESOURCEUSAGE_CONTAINER, WNET_OPEN_ENUM_USAGE,
        };
        use windows::Win32::NetworkManagement::WNet::NETRESOURCEA;
        use windows::Win32::Foundation::HANDLE;
        use windows::core::PSTR;
        let server_bytes = format!("{}\0", server);
        let mut net_resource = NETRESOURCEA::default();
        net_resource.dwScope = RESOURCE_GLOBALNET;
        net_resource.dwType = RESOURCETYPE_ANY;
        net_resource.dwUsage = RESOURCEUSAGE_CONTAINER.0;
        net_resource.lpRemoteName = PSTR(server_bytes.as_ptr() as *mut _);
        let mut handle: HANDLE = HANDLE::default();
        unsafe {
            let result = WNetOpenEnumA(
                RESOURCE_GLOBALNET,
                RESOURCETYPE_ANY,
                WNET_OPEN_ENUM_USAGE(0),
                Some(&net_resource),
                &mut handle,
            );
            if result.0 != 0 {
                let _ = WNetCloseEnum(handle);
                return Err(format!("WNetOpenEnum error: {}", result.0));
            }
            let mut shares = Vec::new();
            let mut buf_size: u32 = 16384;
            let mut buf = vec![0u8; buf_size as usize];
            let mut count = u32::MAX;
            loop {
                let enum_result = WNetEnumResourceA(handle, &mut count, buf.as_mut_ptr() as *mut _, &mut buf_size);
                if enum_result == windows::Win32::Foundation::ERROR_NO_MORE_ITEMS { break; }
                if enum_result.0 != 0 { break; }
                let resources = std::slice::from_raw_parts(buf.as_ptr() as *const NETRESOURCEA, count as usize);
                for res in resources {
                    let name_ptr = res.lpRemoteName;
                    if name_ptr.is_null() { continue; }
                    let cstr = std::ffi::CStr::from_ptr(name_ptr.0 as *const i8);
                    let name_str = cstr.to_string_lossy().to_string();
                    let display = name_str.trim_start_matches('\\').split('\\').last().unwrap_or("").to_string();
                    if display.is_empty() { continue; }
                    shares.push(FileInfo {
                        name: display,
                        path: name_str,
                        extension: String::new(),
                        is_dir: true,
                        is_hidden: false,
                        size: 0,
                        size_display: String::new(),
                        modified: String::new(),
                        created: String::new(),
                        modified_ts: 0,
                        created_ts: 0,
                        folder_size: None,
                    });
                }
                count = u32::MAX;
            }
            let _ = WNetCloseEnum(handle);
            Ok(shares)
        }
    }
    #[cfg(not(target_os = "windows"))]
    { Ok(Vec::new()) }
}

// === Shell Native Context Menu ===

#[tauri::command]
fn get_shell_verbs(path: String) -> Result<Vec<serde_json::Value>, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext.is_empty() {
        return Ok(Vec::new());
    }

    let ext_with_dot = if ext.starts_with('.') { ext.clone() } else { format!(".{}", ext) };

    let mut verbs = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let hives = [
        (HKEY_LOCAL_MACHINE, "HKLM"),
        (HKEY_CURRENT_USER, "HKCU"),
    ];

    for (hive, _hive_name) in &hives {
        let root = RegKey::predef(*hive);
        let ext_key = match root.open_subkey_with_flags(format!("Software\\Classes\\{}", ext_with_dot), KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };
        let prog_id: String = match ext_key.get_value("") {
            Ok(v) => v,
            Err(_) => continue,
        };
        if prog_id.is_empty() {
            continue;
        }
        let shell_key = match root.open_subkey_with_flags(format!("Software\\Classes\\{}\\shell", prog_id), KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };
        for subkey_result in shell_key.enum_keys() {
            let verb_name = match subkey_result {
                Ok(v) => v,
                Err(_) => continue,
            };
            if seen.contains(&verb_name) {
                continue;
            }
            let verb_key = match shell_key.open_subkey_with_flags(&verb_name, KEY_READ) {
                Ok(k) => k,
                Err(_) => continue,
            };
            let cmd_key = match verb_key.open_subkey_with_flags("command", KEY_READ) {
                Ok(k) => k,
                Err(_) => continue,
            };
            let _command: String = match cmd_key.get_value("") {
                Ok(v) => v,
                Err(_) => continue,
            };
            let label: String = verb_key.get_value("").unwrap_or_else(|_| verb_name.clone());
            seen.insert(verb_name.clone());
            verbs.push(serde_json::json!({
                "verb": verb_name,
                "label": label,
            }));
        }
    }

    Ok(verbs)
}

#[tauri::command]
fn invoke_shell_verb(path: String, verb: String) -> Result<(), String> {
    let ps = format!(
        r#"$shell = New-Object -ComObject Shell.Application;
        $folder = $shell.Namespace((Split-Path '{}'));
        $item = $folder.ParseName((Split-Path '{}' -Leaf));
        $item.InvokeVerb('{}')"#,
        path.replace("'", "''"), path.replace("'", "''"), verb
    );

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn show_native_context_menu(path: String, x: i32, y: i32) -> Result<(), String> {
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;
    use windows::Win32::UI::Shell::Common::*;
    use windows::Win32::UI::WindowsAndMessaging::*;
    use windows::Win32::Foundation::*;

    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)
            .ok().map_err(|e| e.to_string())?;

        let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
        SHParseDisplayName(
            &windows::core::HSTRING::from(&path),
            None,
            &mut pidl,
            0,
            None,
        ).map_err(|e| e.to_string())?;

        let mut pidl_last: *mut ITEMIDLIST = std::ptr::null_mut();
        let parent_folder: IShellFolder = SHBindToParent(
            pidl,
            Some(&mut pidl_last),
        ).map_err(|e| e.to_string())?;

        let pcm: IContextMenu = parent_folder.GetUIObjectOf(
            HWND::default(),
            &[pidl_last],
            None,
        ).map_err(|e| e.to_string())?;

        let hmenu = CreatePopupMenu().map_err(|e| e.to_string())?;

        let hr = pcm.QueryContextMenu(
            hmenu,
            0,
            1,
            0x7FFF,
            CMF_NORMAL | CMF_EXTENDEDVERBS,
        );
        if hr.is_err() {
            return Err(format!("QueryContextMenu failed: {:08x}", hr.0 as u32));
        }

        let result = TrackPopupMenu(
            hmenu,
            TPM_RETURNCMD | TPM_LEFTALIGN | TPM_TOPALIGN,
            x,
            y,
            None,
            HWND::default(),
            None,
        );

        if result.0 != 0 {
            let cmd_id = result.0 - 1;
            let cmd_str = format!("{}\0", cmd_id);
            let mut cmd = CMINVOKECOMMANDINFO::default();
            cmd.cbSize = std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32;
            cmd.fMask = SEE_MASK_UNICODE;
            cmd.lpVerb = windows::core::PCSTR::from_raw(cmd_str.as_ptr());
            cmd.nShow = SW_SHOWNORMAL.0 as i32;
            pcm.InvokeCommand(&raw const cmd).map_err(|e| e.to_string())?;
        }

        let _ = DestroyMenu(hmenu);
        CoTaskMemFree(Some(pidl as *const _));
        CoUninitialize();
    }
    Ok(())
}

// === GUI Test Runner ===

#[tauri::command]
async fn run_gui_tests(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use std::sync::mpsc;
    let (tx, rx): (mpsc::Sender<String>, mpsc::Receiver<String>) = mpsc::channel();
    let tx = std::sync::Mutex::new(Some(tx));

    let listener = app.listen("test-results", move |event| {
        if let Some(tx) = tx.lock().unwrap().take() {
            let payload = event.payload().to_string();
            let _ = tx.send(payload);
        }
    });

    app.emit("run-tests", ()).map_err(|e| e.to_string())?;

    let result = rx.recv_timeout(std::time::Duration::from_secs(60));
    app.unlisten(listener);

    match result {
        Ok(json_str) => {
            let val: serde_json::Value = serde_json::from_str(&json_str).unwrap_or_else(|_| {
                serde_json::json!({ "error": "Failed to parse test results", "raw": json_str })
            });
            Ok(val)
        }
        Err(_) => Ok(serde_json::json!({ "error": "Test runner timed out after 60s" })),
    }
}

#[tauri::command]
fn write_test_results(results: String) -> Result<(), String> {
    let tmp = std::env::var("TEMP").unwrap_or_else(|_| ".".to_string());
    let path = std::path::PathBuf::from(tmp).join("rhfiles-test-results.json");
    std::fs::write(&path, &results).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CancelFlag(Mutex::new(false)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                let _ = window.show();
            }
            if args.len() > 1 {
                let mut path = args[1].clone();
                if let Some(stripped) = path.strip_prefix("rhfiles://") {
                    path = stripped.replace('/', "\\");
                }
                let _ = app.emit("navigate-to-path", path);
            }
        }))
        .setup(|app| {
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
            use tauri::Manager;
            if let Some(icon) = app.default_window_icon() {
                let _tray = TrayIconBuilder::new()
                    .icon(icon.clone())
                    .tooltip("RHFiles")
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(w) = tray.app_handle().get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            // Restore saved windows on startup
            {
                let app_handle = app.handle().clone();
                let restore_result: Result<Vec<_>, String> = (|| {
                    let conn = get_db()?;
                    let mut stmt = conn.prepare("SELECT window_id, pos_x, pos_y, width, height, maximized, sort_order FROM window_states WHERE window_id != 'main' ORDER BY sort_order").map_err(|e| e.to_string())?;
                    let rows = stmt.query_map([], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, i32>(1)?,
                            row.get::<_, i32>(2)?,
                            row.get::<_, i32>(3)?,
                            row.get::<_, i32>(4)?,
                            row.get::<_, i32>(5)? != 0,
                            row.get::<_, i32>(6)?,
                        ))
                    }).map_err(|e| e.to_string())?;
                    Ok(rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
                })();
                if let Ok(rows) = restore_result {
                    if !rows.is_empty() {
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            for (window_id, pos_x, pos_y, width, height, _maximized, _sort_order) in rows {
                                use tauri::WebviewWindowBuilder;
                                let builder = WebviewWindowBuilder::new(
                                    &app_handle,
                                    &window_id,
                                    tauri::WebviewUrl::App("index.html".into()),
                                )
                                .title("RHFiles")
                                .inner_size(width as f64, height as f64);
                                let builder = if pos_x != 0 || pos_y != 0 {
                                    builder.position(pos_x as f64, pos_y as f64)
                                } else {
                                    builder
                                };
                                let _ = builder.build();
                            }
                        });
                    }
                }
            }

            // Auto-run GUI tests if trigger file exists
            {
                let trigger = std::path::PathBuf::from("D:\\git\\RHFiles\\rhfiles-run-tests.trigger");
                if trigger.exists() {
                    let _ = std::fs::remove_file(&trigger);
                    let app_handle = app.handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(12));
                        let _ = app_handle.emit("run-tests", ());
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_dir, get_drives, parent_path, delete_file, delete_files, rename_file, new_folder,
            copy_path, move_path_cmd, copy_with_progress, move_with_progress,
            cancel_operation,
            get_env, get_dir_tree, get_thumbnail, open_file,
            show_properties, read_file_preview, git_status, git_branches, git_checkout,
            git_create_branch, git_init,
            svn_status, svn_info, svn_update, svn_commit, svn_revert, svn_add, svn_log, svn_checkout, svn_cleanup, svn_resolve,
            list_archive, extract_archive, create_archive,
            batch_rename, save_file_tags, load_file_tags, load_all_tags, get_file_info,
            create_shortcut, search_recursive, quick_search, is_everything_available,
            folder_size, compute_hash, open_terminal, get_file_icon,
            get_new_file_templates, create_new_file, get_file_association,
            run_as_admin, empty_recycle_bin, rotate_image, read_shortcut,
            detect_ides, open_in_ide, install_font, set_wallpaper, set_file_readonly,
            open_new_window,
            get_window_label, save_window_state, load_window_state, get_all_window_states, delete_window_state, save_current_window_geometry, restore_window_geometry, cleanup_stale_windows,
            set_window_effect, quicklook,
            check_updates,
            db_save_tags, db_load_tags, db_load_all_tags,
            db_save_layout, db_load_layout,
            db_save_pinned, db_load_pinned,
            db_save_network_favorite, db_load_network_favorites, db_delete_network_favorite,
            db_add_recent, db_load_recent, db_remove_recent, db_clear_recent,
            list_i18n_files,
            db_export_all, db_import_all, db_clear_all,
            list_ads, delete_ads, read_ads, unblock_file,
            toggle_pip,
            extract_7z, create_7z, is_7z_available,
            rtf_to_html, docx_to_text,
            format_drive,
            install_certificate, set_compat_mode, get_compat_mode,
            log_error, get_error_logs,
            git_clone,
            get_cloud_status, get_cloud_providers, cloud_pin_file, cloud_unpin_file, cloud_clear_pin, get_cloud_file_size,
            browse_network, list_shares,
            ftp_list, ftp_download, ftp_upload, ftp_delete, ftp_mkdir, ftp_rename,
            sftp_list, sftp_download, sftp_upload, sftp_delete, sftp_mkdir, sftp_rename,
            get_permissions, set_permission, remove_permission, inherit_permissions,
            list_mtp_devices,
            get_shell_verbs, invoke_shell_verb,
            show_native_context_menu,
            run_gui_tests, write_test_results,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
