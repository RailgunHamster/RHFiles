use rhfiles_core::enumerator;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Emitter;

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
        let mut buf = vec![0u8; 8192];
        let mut transferred: u64 = 0;
        let start = std::time::Instant::now();

        loop {
            if *cancel.0.lock().unwrap() {
                let _ = std::fs::remove_file(&target);
                return Err("Cancelled".to_string());
            }
            let n = source_file.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 { break; }
            dest_file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            transferred += n as u64;

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
        let mut buf = vec![0u8; 8192];
        let mut transferred: u64 = 0;
        let start = std::time::Instant::now();

        loop {
            if *cancel.0.lock().unwrap() {
                let _ = std::fs::remove_file(&target);
                return Err("Cancelled".to_string());
            }
            let n = source_file.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 { break; }
            dest_file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            transferred += n as u64;

            let elapsed = start.elapsed().as_secs_f64();
            let speed = if elapsed > 0.0 { transferred as f64 / elapsed } else { 0.0 };
            let pct = if total > 0 { ((transferred as f64 / total as f64 * 90.0) + 5.0) as u32 } else { 90 };

            let _ = app.emit("op-progress", serde_json::json!({
                "operation": "move", "src": src, "dest": dest,
                "bytesTransferred": transferred, "totalBytes": total,
                "percentage": pct, "speed": speed as u64, "status": "progress"
            }));
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
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tags (path TEXT PRIMARY KEY, tags TEXT);
         CREATE TABLE IF NOT EXISTS folder_layouts (path TEXT PRIMARY KEY, layout TEXT);
         CREATE TABLE IF NOT EXISTS folder_prefs (path TEXT PRIMARY KEY, prefs TEXT);
         CREATE TABLE IF NOT EXISTS pinned (path TEXT PRIMARY KEY, name TEXT, ord INTEGER);"
    ).map_err(|e| e.to_string())?;
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

    Ok(data)
}

#[tauri::command]
fn db_import_all(tags_json: String, layouts_json: String, pinned_json: String) -> Result<(), String> {
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

    Ok(())
}

#[tauri::command]
fn db_clear_all() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM tags", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folder_layouts", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folder_prefs", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM pinned", []).map_err(|e| e.to_string())?;
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
                    created: String::new(), folder_size: None,
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
                            modified: metadata.and_then(|m| m.modified().ok()).map(|t| format_time(t)).unwrap_or_default(),
                            created: String::new(), folder_size: None,
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
async fn open_new_window(app: tauri::AppHandle) -> Result<(), String> {
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        format!("window-{}", id),
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("RHFiles")
    .inner_size(1200.0, 800.0)
    .build()
    .map_err(|e| e.to_string())?;
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
    if attrs & FILE_ATTRIBUTE_OFFLINE != 0 {
        Ok("online_only".to_string())
    } else if attrs & FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS != 0 {
        Ok("syncing".to_string())
    } else {
        Ok("synced".to_string())
    }
}

// === FTP Connection ===

#[tauri::command]
async fn ftp_list(host: String, path: String, user: String, pass: String) -> Result<Vec<FileInfo>, String> {
    let ps = format!(
        r#"$uri = "ftp://{host}{path}";
        $creds = New-Object System.Net.NetworkCredential('{user}', '{pass}');
        $request = [System.Net.FtpWebRequest]::Create($uri);
        $request.Credentials = $creds;
        $request.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectoryDetails;
        $request.UsePassive = $true;
        try {{
            $response = $request.GetResponse();
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream());
            $listing = $reader.ReadToEnd();
            $reader.Close();
            $response.Close();
            $results = @();
            foreach ($line in $listing -split "`n") {{
                if ($line.Trim() -eq '') continue;
                $parts = $line -split '\s+';
                if ($parts.Length -ge 9) {{
                    $perms = $parts[0];
                    $isDir = $perms.StartsWith('d');
                    $name = ($parts[8..($parts.Length-1)] -join ' ').Trim();
                    if ($name -eq '.' -or $name -eq '..') continue;
                    $results += @{{
                        name = $name;
                        is_dir = $isDir;
                        size = if ($parts[4] -match '^\d+$') {{ [long]$parts[4] }} else {{ 0 }};
                        modified = $parts[5] + ' ' + $parts[6] + ' ' + $parts[7];
                    }}
                }}
            }}
            $results | ConvertTo-Json -Compress
        }} catch {{
            Write-Error $_.Exception.Message
        }}"#,
        host = host, path = path, user = user, pass = pass
    );

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "null" {
        return Ok(Vec::new());
    }

    let raw: Vec<serde_json::Value> = if stdout.starts_with('[') {
        serde_json::from_str(&stdout).unwrap_or_default()
    } else {
        serde_json::from_str(&format!("[{}]", stdout)).unwrap_or_default()
    };

    let mut entries = Vec::new();
    for item in raw {
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let is_dir = item.get("is_dir").and_then(|v| v.as_bool()).unwrap_or(false);
        let size = item.get("size").and_then(|v| v.as_i64()).unwrap_or(0) as u64;
        let ftp_path = format!("ftp://{}/{}{}", host, path.trim_end_matches('/'), if path.ends_with('/') { "" } else { "/" });

        entries.push(FileInfo {
            name: name.clone(),
            path: ftp_path + &name,
            extension: if is_dir { String::new() } else {
                name.rsplit('.').next().unwrap_or("").to_string()
            },
            is_dir,
            is_hidden: false,
            size,
            size_display: if size > 0 { format_size(size) } else { String::new() },
            modified: item.get("modified").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            created: String::new(),
            folder_size: None,
        });
    }

    Ok(entries)
}

#[tauri::command]
async fn ftp_download(host: String, remote_path: String, local_path: String, user: String, pass: String) -> Result<(), String> {
    let ps = format!(
        r#"$uri = "ftp://{host}{remote_path}";
        $creds = New-Object System.Net.NetworkCredential('{user}', '{pass}');
        $client = New-Object System.Net.WebClient;
        $client.Credentials = $creds;
        $client.DownloadFile($uri, '{local_path}')"#,
        host = host, remote_path = remote_path, local_path = local_path.replace("'", "''"), user = user, pass = pass
    );

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
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
            folder_size: None,
        });
    }

    Ok(devices)
}

// === SMB/Network Browsing ===

#[tauri::command]
fn browse_network() -> Result<Vec<FileInfo>, String> {
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("net")
        .args(["view"])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("net")
        .args(["view"])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut servers = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("\\\\") {
            let name = line.split_whitespace().next().unwrap_or("").trim_start_matches('\\');
            if !name.is_empty() {
                servers.push(FileInfo {
                    name: name.to_string(),
                    path: format!("\\\\{}", name),
                    extension: String::new(),
                    is_dir: true,
                    is_hidden: false,
                    size: 0,
                    size_display: String::new(),
                    modified: String::new(),
                    created: String::new(),
                    folder_size: None,
                });
            }
        }
    }
    Ok(servers)
}

#[tauri::command]
fn list_shares(server: String) -> Result<Vec<FileInfo>, String> {
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("net")
        .args(["view", &server])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("net")
        .args(["view", &server])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut shares = Vec::new();
    let mut in_share_section = false;
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("Share") {
            in_share_section = true;
            continue;
        }
        if line.starts_with("---") {
            continue;
        }
        if !in_share_section {
            continue;
        }
        if line.is_empty() || line.starts_with("The command") {
            break;
        }
        let share_name = line.split_whitespace().next().unwrap_or("");
        if !share_name.is_empty() && share_name != "The" {
            shares.push(FileInfo {
                name: share_name.to_string(),
                path: format!("{}\\{}", server, share_name),
                extension: String::new(),
                is_dir: true,
                is_hidden: false,
                size: 0,
                size_display: String::new(),
                modified: String::new(),
                created: String::new(),
                folder_size: None,
            });
        }
    }
    Ok(shares)
}

// === Shell Native Context Menu ===

#[tauri::command]
fn get_shell_verbs(path: String) -> Result<Vec<serde_json::Value>, String> {
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext.is_empty() {
        return Ok(Vec::new());
    }

    let ps = format!(
        r#"$ext = '.{}';
        $verbs = @();
        try {{
            $progId = (Get-ItemProperty "HKLM:\Software\Classes\$ext" -ErrorAction Stop).'(default)'
            if ($progId) {{
                $shellPath = "HKLM:\Software\Classes\$progId\shell"
                if (Test-Path $shellPath) {{
                    Get-ChildItem $shellPath | ForEach-Object {{
                        $verb = $_.PSChildName
                        $label = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).'(default)'
                        if (-not $label) {{ $label = $verb }}
                        $command = (Get-ItemProperty "$($_.PSPath)\command" -ErrorAction SilentlyContinue).'(default)'
                        if ($command) {{
                            $verbs += @{{
                                verb = $verb
                                label = $label
                                command = $command
                            }}
                        }}
                    }}
                }}
            }}
        }} catch {{}}
        try {{
            $progId = (Get-ItemProperty "HKCU:\Software\Classes\$ext" -ErrorAction SilentlyContinue).'(default)'
            if ($progId) {{
                $shellPath = "HKCU:\Software\Classes\$progId\shell"
                if (Test-Path $shellPath) {{
                    Get-ChildItem $shellPath | ForEach-Object {{
                        $verb = $_.PSChildName
                        $label = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).'(default)'
                        if (-not $label) {{ $label = $verb }}
                        $command = (Get-ItemProperty "$($_.PSPath)\command" -ErrorAction SilentlyContinue).'(default)'
                        if ($command) {{
                            $verbs += @{{
                                verb = $verb
                                label = $label
                                command = $command
                            }}
                        }}
                    }}
                }}
            }}
        }} catch {{}}
        $verbs | ConvertTo-Json -Compress"#,
        ext
    );

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "null" {
        return Ok(Vec::new());
    }

    let verbs: Vec<serde_json::Value> = if stdout.starts_with('[') {
        serde_json::from_str(&stdout).unwrap_or_default()
    } else {
        serde_json::from_str(&format!("[{}]", stdout)).unwrap_or_default()
    };

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_dir, get_drives, parent_path, delete_file, rename_file, new_folder,
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
            set_window_effect, quicklook,
            check_updates,
            db_save_tags, db_load_tags, db_load_all_tags,
            db_save_layout, db_load_layout,
            db_save_pinned, db_load_pinned,
            db_export_all, db_import_all, db_clear_all,
            list_ads, delete_ads, read_ads, unblock_file,
            toggle_pip,
            extract_7z, create_7z, is_7z_available,
            rtf_to_html, docx_to_text,
            format_drive,
            install_certificate, set_compat_mode, get_compat_mode,
            log_error, get_error_logs,
            git_clone,
            get_cloud_status,
            browse_network, list_shares,
            ftp_list, ftp_download,
            get_permissions, set_permission, remove_permission, inherit_permissions,
            list_mtp_devices,
            get_shell_verbs, invoke_shell_verb,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
