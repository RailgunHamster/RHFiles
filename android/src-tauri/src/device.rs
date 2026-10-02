//! Android device facts: storage roots, permission state, size scanning.
//!
//! Everything here is observed from `/proc`, `/sys` or the filesystem itself so
//! the Rust side stays free of JNI plumbing. The one thing that cannot be read
//! directly from a file — whether `MANAGE_EXTERNAL_STORAGE` was granted — is
//! inferred from the accessibility of the shared-storage root, which is exactly
//! what that permission governs for a target-SDK-30+ application.

use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageRoot {
    /// Absolute path usable by `std::fs` and by the Rust backend.
    pub path: String,
    /// Human label, e.g. "Internal storage", "Removable (XXXX-XXXX)".
    pub label: String,
    pub kind: String,
    pub removable: bool,
    pub read_only: bool,
    pub total_bytes: Option<u64>,
    pub free_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
    /// `true` when every storage root is readable *and* writable.
    pub manage_external_storage: bool,
    pub shared_storage_readable: bool,
    pub shared_storage_writable: bool,
    pub can_access_obb: bool,
    pub app_data_dir: String,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategorySize {
    pub name: String,
    pub bytes: u64,
    pub files: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSizeReport {
    pub root: String,
    pub total_bytes: u64,
    pub files: u64,
    pub directories: u64,
    pub bytes_available: Option<u64>,
    pub categories: Vec<CategorySize>,
    pub truncated: bool,
}

pub const SHARED_STORAGE: &str = "/storage/emulated/0";

pub fn shared_storage_root() -> PathBuf {
    PathBuf::from(SHARED_STORAGE)
}

/// Best-effort API level. `ro.build.version.sdk` is only readable on some
/// builds; `None` simply means "unknown", never an error.
pub fn android_api_level() -> Option<u32> {
    for candidate in ["/system/build.prop", "/vendor/build.prop", "/default.prop"] {
        let Ok(props) = std::fs::read_to_string(candidate) else {
            continue;
        };
        for line in props.lines() {
            if let Some(value) = line.strip_prefix("ro.build.version.sdk=") {
                if let Ok(level) = value.trim().parse::<u32>() {
                    return Some(level);
                }
            }
        }
    }
    None
}

fn unescape_mount(value: &str) -> String {
    value
        .replace("\\040", " ")
        .replace("\\011", "\t")
        .replace("\\012", "\n")
        .replace("\\134", "\\")
}

/// Storage-looking mounts from `/proc/mounts`, as `(path, fstype, removable)`.
fn mount_candidates() -> Vec<(PathBuf, String, bool)> {
    let mut out = Vec::new();
    let Ok(text) = std::fs::read_to_string("/proc/mounts") else {
        return out;
    };
    for line in text.lines() {
        let mut fields = line.split_whitespace();
        let _device = fields.next();
        let Some(mount) = fields.next() else { continue };
        let Some(fstype) = fields.next() else { continue };
        if !matches!(
            fstype,
            "fuse" | "fuseblk" | "sdcardfs" | "vfat" | "exfat" | "f2fs" | "ext4" | "esdfs"
        ) {
            continue;
        }
        let path = PathBuf::from(unescape_mount(mount));
        let text_path = path.to_string_lossy().to_string();
        if !(text_path.starts_with("/storage/") || text_path.starts_with("/mnt/media_rw")) {
            continue;
        }
        // Per-app emulated views are not useful navigation entry points.
        if text_path.contains("/Android/data") || text_path.contains("/Android/obb") {
            continue;
        }
        let removable = text_path.starts_with("/mnt/media_rw") || !text_path.contains("emulated/0");
        out.push((path, fstype.to_string(), removable));
    }
    out
}

fn label_for(path: &Path) -> (String, bool) {
    let text = path.to_string_lossy().to_string();
    if text.contains("emulated/0") {
        return ("Internal storage".into(), false);
    }
    if text.contains("emulated") {
        let slot = text.rsplit('/').next().unwrap_or("?").to_string();
        return (format!("Internal storage ({slot})"), false);
    }
    let name = text.rsplit('/').next().unwrap_or("?").to_string();
    if name.len() == 9 && name.contains('-') {
        return (format!("SD card ({name})"), true);
    }
    (format!("Removable ({name})"), true)
}

fn is_readable_dir(path: &Path) -> bool {
    std::fs::read_dir(path).is_ok()
}

fn can_write_probe(path: &Path) -> bool {
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let probe = path.join(format!(".rhfiles-write-probe-{}-{}", std::process::id(), SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    // Never truncate or remove a pre-existing user file when probing access.
    match std::fs::OpenOptions::new().write(true).create_new(true).open(&probe) {
        Ok(file) => {
            drop(file);
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod probe_tests {
    #[test]
    fn access_probe_preserves_existing_file_and_cleans_only_its_own_probe() {
        let root = std::env::temp_dir().join(format!("rhfiles-probe-test-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let original = root.join(".rhfiles-write-probe");
        std::fs::write(&original, b"user content").unwrap();
        assert!(super::can_write_probe(&root));
        assert_eq!(std::fs::read(&original).unwrap(), b"user content");
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);
        std::fs::remove_file(original).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}

/// Space figures parsed from `/proc/mounts`' companion `statfs` data is not
/// available through std, so we report what `/proc/meminfo`-style sources
/// cannot give and let the frontend show `null` instead of a wrong number.
fn free_space(_path: &Path) -> Option<(u64, u64)> {
    None
}

/// Deduplicated, application-visible storage roots ordered by usefulness.
pub fn storage_roots() -> Vec<StorageRoot> {
    let mut candidates: Vec<(PathBuf, String, bool)> = vec![(
        shared_storage_root(),
        "fuse".into(),
        false,
    )];
    candidates.extend(mount_candidates());

    for base in ["/storage", "/mnt/media_rw"] {
        if let Ok(entries) = std::fs::read_dir(base) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name == "self" || name == "emulated" {
                    continue;
                }
                candidates.push((entry.path(), "fuse".into(), true));
            }
        }
    }

    let mut seen = BTreeMap::<String, StorageRoot>::new();
    for (path, fstype, removable) in candidates {
        let key = path.to_string_lossy().to_string();
        if seen.contains_key(&key) || !is_readable_dir(&path) {
            continue;
        }
        let (label, detected_removable) = label_for(&path);
        let (total_bytes, free_bytes) = match free_space(&path) {
            Some((total, free)) => (Some(total), Some(free)),
            None => (None, None),
        };
        seen.insert(
            key.clone(),
            StorageRoot {
                path: key,
                label,
                kind: fstype,
                removable: removable || detected_removable,
                read_only: !can_write_probe(&path),
                total_bytes,
                free_bytes,
            },
        );
    }
    seen.into_values().collect()
}

pub fn permission_status(app_data_dir: &Path) -> PermissionStatus {
    let shared = shared_storage_root();
    let readable = is_readable_dir(&shared);
    let writable = readable && can_write_probe(&shared);
    let obb = is_readable_dir(Path::new("/storage/emulated/0/Android/obb"));

    let mut notes = Vec::new();
    if !readable {
        notes.push(
            "Shared storage is not readable — grant \"All files access\" (MANAGE_EXTERNAL_STORAGE) in system settings.".to_string(),
        );
    } else if !writable {
        // This is the state that used to look like "the app works, but every
        // folder is empty": without the permission Android still lets the root be
        // listed while hiding every real file inside it.
        notes.push(
            "All files access is off: shared storage is read-only and its contents are hidden, so folders open empty. Grant MANAGE_EXTERNAL_STORAGE in system settings.".to_string(),
        );
    }
    if readable && !obb {
        notes.push("Android/data and Android/obb remain restricted on this device.".to_string());
    }
    if readable && writable {
        notes.push("Full filesystem access is active.".to_string());
    }

    PermissionStatus {
        manage_external_storage: readable && writable,
        shared_storage_readable: readable,
        shared_storage_writable: writable,
        can_access_obb: obb,
        app_data_dir: app_data_dir.to_string_lossy().to_string(),
        notes,
    }
}

fn category_of(name: &str) -> &'static str {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase());
    match ext.as_deref() {
        Some(
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "heic" | "heif" | "avif" | "tiff"
            | "svg" | "raw" | "dng",
        ) => "Images",
        Some(
            "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "3gp" | "ts" | "mpg"
            | "mpeg",
        ) => "Videos",
        Some("mp3" | "flac" | "wav" | "aac" | "ogg" | "opus" | "m4a" | "wma" | "ape" | "amr") => {
            "Audio"
        }
        Some("apk" | "apks" | "xapk" | "apkm") => "Apps",
        Some("zip" | "rar" | "7z" | "tar" | "gz" | "xz" | "bz2" | "zst" | "iso") => "Archives",
        Some(
            "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "epub" | "rtf",
        ) => "Documents",
        _ => "Other",
    }
}

/// One-shot, depth-first size scan used by the "Storage" screen.
pub fn scan_storage_sizes(
    root: String,
    max_entries: Option<u64>,
) -> Result<StorageSizeReport, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let limit = max_entries.unwrap_or(400_000);
    let mut totals: BTreeMap<&'static str, (u64, u64)> = BTreeMap::new();
    let mut files = 0u64;
    let mut directories = 0u64;
    let mut total_bytes = 0u64;
    let mut truncated = false;

    let mut stack = vec![root_path.clone()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if files + directories >= limit {
                truncated = true;
                stack.clear();
                break;
            }
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                directories += 1;
                stack.push(entry.path());
            } else if meta.is_file() {
                files += 1;
                let size = meta.len();
                total_bytes += size;
                let name = entry.file_name().to_string_lossy().to_string();
                let slot = totals.entry(category_of(&name)).or_insert((0, 0));
                slot.0 += size;
                slot.1 += 1;
            }
        }
    }

    let mut categories: Vec<CategorySize> = totals
        .into_iter()
        .map(|(name, (bytes, files))| CategorySize {
            name: name.to_string(),
            bytes,
            files,
        })
        .collect();
    categories.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    Ok(StorageSizeReport {
        root,
        total_bytes,
        files,
        directories,
        bytes_available: None,
        categories,
        truncated,
    })
}

#[tauri::command]
pub fn get_storage_roots() -> Vec<StorageRoot> {
    storage_roots()
}

#[tauri::command]
pub fn get_permission_status<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> PermissionStatus {
    permission_status(&crate::app_data_dir(&app))
}
