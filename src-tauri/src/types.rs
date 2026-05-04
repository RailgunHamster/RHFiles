use rhfiles_core::enumerator;
use serde::Serialize;
use std::sync::Mutex;

pub struct CancelFlag(pub Mutex<bool>);

#[derive(Serialize, Clone)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub is_dir: bool,
    pub is_hidden: bool,
    pub size: u64,
    pub size_display: String,
    pub modified: String,
    pub created: String,
    pub modified_ts: i64,
    pub created_ts: i64,
    pub folder_size: Option<u64>,
}

#[derive(Serialize, Clone)]
pub struct DriveInfoSer {
    pub letter: String,
    pub label: String,
    pub free: String,
    pub path: String,
    pub free_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Serialize, Clone)]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub has_children: bool,
    pub is_hidden: bool,
}

#[derive(Serialize, Clone)]
pub struct ArchiveEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: String,
}

#[derive(Serialize)]
pub struct FilePreview {
    pub preview_type: String,
    pub text_content: Option<String>,
    pub image_data: Option<String>,
    pub size: u64,
}

#[derive(Serialize)]
pub struct FileDetailInfo {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub is_dir: bool,
    pub size: u64,
    pub size_display: String,
    pub folder_size: Option<u64>,
    pub folder_size_display: Option<String>,
    pub modified: String,
    pub created: String,
    pub readonly: bool,
    pub attributes: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct NetworkFavorite {
    pub id: i64,
    pub protocol: String,
    pub host: String,
    pub port: i32,
    pub path: String,
    pub username: String,
    pub display_name: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct RecentItem {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub ext: String,
    pub access_count: i32,
    pub last_accessed: String,
}

#[derive(Serialize, Clone)]
pub struct CloudProvider {
    pub id: String,
    pub name: String,
    pub path: String,
    pub icon_dll: String,
    pub icon_index: i32,
}

#[derive(Serialize)]
pub struct I18nFileInfo {
    pub code: String,
    pub name: String,
    pub url: String,
}

pub fn format_time(t: std::time::SystemTime) -> String {
    enumerator::format_time_proper(t)
}

pub fn file_info_from_entry(e: &rhfiles_core::FileEntry) -> FileInfo {
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

pub fn format_size(bytes: u64) -> String {
    let b = bytes as f64;
    if b < 1024.0 { format!("{} B", bytes) }
    else if b < 1024.0 * 1024.0 { format!("{:.1} KB", b / 1024.0) }
    else if b < 1024.0 * 1024.0 * 1024.0 { format!("{:.1} MB", b / (1024.0 * 1024.0)) }
    else { format!("{:.1} GB", b / (1024.0 * 1024.0 * 1024.0)) }
}

pub fn expand_env_var(s: &str) -> String {
    let s = s.replace("%USERPROFILE%", &std::env::var("USERPROFILE").unwrap_or_default());
    let s = s.replace("%LOCALAPPDATA%", &std::env::var("LOCALAPPDATA").unwrap_or_default());
    let s = s.replace("%APPDATA%", &std::env::var("APPDATA").unwrap_or_default());
    let s = s.replace("%SystemRoot%", &std::env::var("SystemRoot").unwrap_or_default());
    let s = s.replace("%windir%", &std::env::var("windir").unwrap_or_default());
    s.replace("%ProgramFiles%", &std::env::var("ProgramFiles").unwrap_or_default())
}

pub fn parse_icon_resource(resource: &str) -> (String, i32) {
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

pub fn resolve_display_name(resource: &str) -> String {
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
