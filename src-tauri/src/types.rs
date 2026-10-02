use rhfiles_core::enumerator;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::Mutex;

#[derive(Default)]
pub struct CancelState {
    active: HashSet<String>,
    cancelled: HashSet<String>,
    update_lock: Option<std::fs::File>,
    updating: bool,
}

pub struct CancelFlag(pub Mutex<CancelState>);

pub struct ActiveOperation<'a> { cancel: &'a CancelFlag, id: String }
impl Drop for ActiveOperation<'_> {
    fn drop(&mut self) { self.cancel.clear(Some(&self.id)); }
}

impl CancelFlag {
    pub fn begin(&self, kind: &str) -> Result<ActiveOperation<'_>, String> {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let id = format!("{kind}-{}-{}", std::process::id(), NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
        self.reset(Some(&id))?;
        Ok(ActiveOperation { cancel: self, id })
    }
    fn key(operation_id: Option<&str>) -> String {
        operation_id
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("legacy")
            .to_string()
    }

    pub fn reset(&self, operation_id: Option<&str>) -> Result<(), String> {
        let key = Self::key(operation_id);
        let mut state = self.0.lock().map_err(|error| error.to_string())?;
        if state.updating { return Err("[update_busy] An update is being installed".into()); }
        if state.update_lock.is_none() {
            let lease = crate::profile::coordination_file("operations.lock")?;
            lease.try_lock_shared().map_err(|_| "[update_busy] An update is being installed")?;
            state.update_lock = Some(lease);
        }
        state.cancelled.remove(&key);
        state.active.insert(key);
        Ok(())
    }

    pub fn cancel(&self, operation_id: Option<&str>) -> Result<(), String> {
        let key = Self::key(operation_id);
        let mut state = self.0.lock().map_err(|error| error.to_string())?;
        if state.active.contains(&key) {
            state.cancelled.insert(key);
        }
        Ok(())
    }

    pub fn is_cancelled(&self, operation_id: Option<&str>) -> Result<bool, String> {
        Ok(self
            .0
            .lock()
            .map_err(|error| error.to_string())?
            .cancelled
            .contains(&Self::key(operation_id)))
    }

    pub fn clear(&self, operation_id: Option<&str>) {
        if let Ok(mut state) = self.0.lock() {
            let key = Self::key(operation_id);
            state.cancelled.remove(&key);
            state.active.remove(&key);
            if state.active.is_empty() && !state.updating { state.update_lock = None; }
        }
    }

    pub fn begin_update(&self) -> Result<(), String> {
        let mut state = self.0.lock().map_err(|e| e.to_string())?;
        if !state.active.is_empty() || state.updating {
            return Err("[update_busy] Wait for all file tasks to finish before updating".into());
        }
        let lease = crate::profile::coordination_file("operations.lock")?;
        lease.try_lock().map_err(|_| "[update_busy] Another RHFiles instance is processing files")?;
        crate::profile::reserve_update()?;
        state.update_lock = Some(lease);
        state.updating = true;
        Ok(())
    }

    pub fn abort_update(&self) {
        if let Ok(mut state) = self.0.lock() {
            if state.updating {
                state.updating = false;
                state.update_lock = None;
                crate::profile::release_update();
            }
        }
    }
}

#[cfg(test)]
mod cancel_flag_tests {
    use super::*;

    #[test]
    fn cancellation_is_scoped_to_active_operations() {
        let flag = CancelFlag(Mutex::new(CancelState::default()));
        flag.cancel(Some("inactive")).unwrap();
        assert!(!flag.is_cancelled(Some("inactive")).unwrap());

        flag.reset(Some("first")).unwrap();
        flag.reset(Some("second")).unwrap();
        flag.cancel(Some("first")).unwrap();
        assert!(flag.is_cancelled(Some("first")).unwrap());
        assert!(!flag.is_cancelled(Some("second")).unwrap());

        flag.clear(Some("first"));
        assert!(!flag.is_cancelled(Some("first")).unwrap());
    }

    #[test]
    fn operation_guard_blocks_update_and_releases_on_early_return() {
        let flag = CancelFlag(Mutex::new(CancelState::default()));
        {
            let _operation = flag.begin("compress").unwrap();
            assert!(flag.begin_update().unwrap_err().contains("[update_busy]"));
            assert_eq!(flag.0.lock().unwrap().active.len(), 1);
        }
        let state = flag.0.lock().unwrap();
        assert!(state.active.is_empty());
        assert!(state.update_lock.is_none());
    }

    #[test]
    fn update_reservation_prevents_new_operations() {
        let flag = CancelFlag(Mutex::new(CancelState { updating: true, ..Default::default() }));
        assert!(flag.reset(Some("copy")).unwrap_err().contains("[update_busy]"));
    }
}

#[derive(Serialize, Clone)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub is_dir: bool,
    pub is_hidden: bool,
    pub is_system: bool,
    pub is_dot: bool,
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
    pub is_system: bool,
    pub is_dot: bool,
}

#[derive(Serialize, Clone)]
pub struct ArchiveEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: String,
    pub encrypted: bool,
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
        is_system: e.is_system,
        is_dot: e.is_dot,
        size: e.size,
        size_display: e.display_size(),
        modified: format_time(e.modified),
        created: format_time(e.created),
        modified_ts: e
            .modified
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
        created_ts: e
            .created
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
        folder_size: None,
    }
}

pub fn format_size(bytes: u64) -> String {
    let b = bytes as f64;
    if b < 1024.0 {
        format!("{} B", bytes)
    } else if b < 1024.0 * 1024.0 {
        format!("{:.1} KB", b / 1024.0)
    } else if b < 1024.0 * 1024.0 * 1024.0 {
        format!("{:.1} MB", b / (1024.0 * 1024.0))
    } else {
        format!("{:.1} GB", b / (1024.0 * 1024.0 * 1024.0))
    }
}

pub fn expand_env_var(s: &str) -> String {
    let s = s.replace(
        "%USERPROFILE%",
        &std::env::var("USERPROFILE").unwrap_or_default(),
    );
    let s = s.replace(
        "%LOCALAPPDATA%",
        &std::env::var("LOCALAPPDATA").unwrap_or_default(),
    );
    let s = s.replace("%APPDATA%", &std::env::var("APPDATA").unwrap_or_default());
    let s = s.replace(
        "%SystemRoot%",
        &std::env::var("SystemRoot").unwrap_or_default(),
    );
    let s = s.replace("%windir%", &std::env::var("windir").unwrap_or_default());
    s.replace(
        "%ProgramFiles%",
        &std::env::var("ProgramFiles").unwrap_or_default(),
    )
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
    if resource.contains("OneDrive") {
        return "OneDrive".to_string();
    }
    if resource.contains("Google") {
        return "Google Drive".to_string();
    }
    if resource.contains("Dropbox") {
        return "Dropbox".to_string();
    }
    if resource.starts_with('@') {
        let path = resource.trim_start_matches('@');
        let dll = if let Some(idx) = path.rfind(",-") {
            &path[..idx]
        } else {
            path
        };
        let expanded = expand_env_var(dll);
        if let Some(name) = std::path::Path::new(&expanded).file_stem() {
            return name.to_string_lossy().into_owned();
        }
    }
    resource.to_string()
}
