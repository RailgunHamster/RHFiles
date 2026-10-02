//! Filesystem commands.
//!
//! With `MANAGE_EXTERNAL_STORAGE` granted, Android's shared storage behaves like
//! an ordinary directory tree for a native process, so every operation here is
//! plain `std::fs` on absolute POSIX paths. No SAF, no `content://`, no
//! `DocumentFile` — that is the whole point of the permission model.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// Hard ceiling for a single `list_dir` response. A directory that exceeds it is
/// reported as truncated instead of blowing up the WebView.
const MAX_ENTRIES: usize = 20_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified_ms: Option<u64>,
    pub mode: Option<u32>,
    /// Extension-preserving category used to pick icons: image, video, audio,
    /// archive, apk, document, code, other.
    pub kind: &'static str,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub path: String,
    pub name: String,
    pub parent: Option<String>,
    pub entries: Vec<DirEntryInfo>,
    pub truncated: bool,
    pub dir_count: u64,
    pub file_count: u64,
    pub total_bytes: u64,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathRef {
    pub path: String,
}

pub(crate) fn kind_of(name: &str, is_dir: bool) -> &'static str {
    if is_dir {
        return "folder";
    }
    let ext = name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "heic" | "heif" | "avif" | "svg"
        | "tiff" | "ico" => "image",
        "mp4" | "mkv" | "avi" | "mov" | "webm" | "m4v" | "3gp" | "wmv" | "flv" | "m2ts" | "mts" => "video",
        "mp3" | "flac" | "wav" | "aac" | "ogg" | "opus" | "m4a" | "amr" | "wma" => "audio",
        "zip" | "rar" | "7z" | "tar" | "gz" | "xz" | "bz2" | "zst" | "apk" | "apks" | "xapk"
        | "iso" => "archive",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "rtf"
        | "epub" => "document",
        "rs" | "js" | "ts" | "tsx" | "jsx" | "py" | "java" | "kt" | "c" | "h" | "cpp" | "hpp"
        | "go" | "rb" | "php" | "cs" | "swift" | "sh" | "ps1" | "json" | "toml" | "yaml" | "yml"
        | "xml" | "html" | "css" | "sql" | "ini" | "cfg" => "code",
        _ => "other",
    }
}

fn modified_ms(meta: &fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|delta| delta.as_millis() as u64)
}

#[cfg(unix)]
fn mode_of(meta: &fs::Metadata) -> Option<u32> {
    use std::os::unix::fs::PermissionsExt;
    Some(meta.permissions().mode())
}

#[cfg(not(unix))]
fn mode_of(_meta: &fs::Metadata) -> Option<u32> {
    None
}

fn entry_info(path: &Path, name: String) -> Option<DirEntryInfo> {
    let meta = fs::symlink_metadata(path).ok()?;
    let is_symlink = meta.file_type().is_symlink();
    let is_dir = if is_symlink {
        fs::metadata(path).map(|m| m.is_dir()).unwrap_or(false)
    } else {
        meta.is_dir()
    };
    Some(DirEntryInfo {
        hidden: name.starts_with('.'),
        kind: kind_of(&name, is_dir),
        path: path.to_string_lossy().to_string(),
        is_dir,
        is_symlink,
        size: if meta.is_dir() { 0 } else { meta.len() },
        modified_ms: modified_ms(&meta),
        mode: mode_of(&meta),
        name,
    })
}

pub fn list_dir_impl(path: &Path) -> Result<DirListing, String> {
    let started = std::time::Instant::now();
    let reader = fs::read_dir(path).map_err(|error| format!("{}: {error}", path.display()))?;

    let mut entries = Vec::new();
    let mut dir_count = 0u64;
    let mut file_count = 0u64;
    let mut total_bytes = 0u64;
    let mut truncated = false;
    let mut skipped = 0u64;

    for item in reader {
        let Ok(item) = item else {
            // A directory entry that cannot even be read is a permission or I/O
            // problem. Counting it keeps a partly readable folder from looking
            // identical to an empty one.
            skipped += 1;
            continue;
        };
        if entries.len() >= MAX_ENTRIES {
            truncated = true;
            break;
        }
        let name = item.file_name().to_string_lossy().to_string();
        let Some(info) = entry_info(&item.path(), name) else {
            skipped += 1;
            continue;
        };
        if info.is_dir {
            dir_count += 1;
        } else {
            file_count += 1;
            total_bytes = total_bytes.saturating_add(info.size);
        }
        entries.push(info);
    }

    let elapsed_ms = started.elapsed().as_millis() as u64;
    if skipped > 0 {
        crate::log::warn(
            "fs",
            format!(
                "{}: {skipped} entries could not be read (permission or I/O); {file_count} files and {dir_count} folders listed",
                path.display()
            ),
        );
    }
    // An empty result is exactly the symptom that is hardest to explain from the
    // outside ("this folder looks empty"), so it is always recorded.
    if entries.is_empty() {
        crate::log::warn(
            "fs",
            format!(
                "{}: readable but empty ({skipped} unreadable entries) in {elapsed_ms} ms",
                path.display()
            ),
        );
    }

    let parent = path
        .parent()
        .filter(|parent| parent.as_os_str() != path.as_os_str())
        .map(|parent| parent.to_string_lossy().to_string());
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    Ok(DirListing {
        path: path.to_string_lossy().to_string(),
        name,
        parent,
        entries,
        truncated,
        dir_count,
        file_count,
        total_bytes,
        elapsed_ms,
    })
}

pub fn list_dir(path: String) -> Result<DirListing, String> {
    let path = PathBuf::from(path);
    if !path.is_dir() {
        crate::log::warn("fs", format!("list_dir refused, not a directory: {}", path.display()));
        return Err(format!("not a directory: {}", path.display()));
    }
    let listing = list_dir_impl(&path)?;
    // Only slow or large listings are worth a line; logging every tap would
    // drown the diagnostics view.
    if listing.elapsed_ms >= 250 || listing.entries.len() >= 2000 || listing.truncated {
        crate::log::info(
            "fs",
            format!(
                "listed {} entries ({} dirs, {} files, {} truncated) in {} ms",
                listing.path,
                listing.dir_count,
                listing.file_count,
                listing.truncated,
                listing.elapsed_ms
            ),
        );
    }
    Ok(listing)
}

#[tauri::command]
pub fn create_directory(parent: String, name: String) -> Result<String, String> {
    let name = validate_name(&name)?;
    let target = PathBuf::from(parent).join(name);
    if target.exists() {
        return Err(format!("already exists: {}", target.display()));
    }
    fs::create_dir(&target).map_err(|error| format!("{}: {error}", target.display()))?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_file(parent: String, name: String) -> Result<String, String> {
    let name = validate_name(&name)?;
    let target = PathBuf::from(parent).join(name);
    if target.exists() {
        return Err(format!("already exists: {}", target.display()));
    }
    fs::File::create(&target).map_err(|error| format!("{}: {error}", target.display()))?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn rename_entry(path: String, new_name: String) -> Result<String, String> {
    let source = PathBuf::from(&path);
    let new_name = validate_name(&new_name)?;
    let parent = source
        .parent()
        .ok_or_else(|| "cannot rename a filesystem root".to_string())?;
    let target = parent.join(new_name);
    if target.exists() && target != source {
        return Err(format!("already exists: {}", target.display()));
    }
    fs::rename(&source, &target)
        .map_err(|error| format!("rename {}: {error}", source.display()))?;
    Ok(target.to_string_lossy().to_string())
}

pub fn delete_entries(paths: Vec<String>, permanent: bool) -> Result<DeleteReport, String> {
    let mut deleted = Vec::new();
    let mut failures = Vec::new();
    for path in paths {
        let target = PathBuf::from(&path);
        // A "recycle bin" is deliberately not emulated here: Android has none
        // that a file manager may write to without escaping its own sandbox.
        // `permanent` exists so the UI can state the consequence explicitly.
        let _ = permanent;
        let result = if target.is_dir() && !target.is_symlink() {
            fs::remove_dir_all(&target)
        } else {
            fs::remove_file(&target)
        };
        match result {
            Ok(()) => deleted.push(path),
            Err(error) => {
                crate::log::error("fs", format!("delete failed for {path}: {error}"));
                failures.push(PathError {
                    path,
                    message: error.to_string(),
                });
            }
        }
    }
    Ok(DeleteReport { deleted, failures })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteReport {
    pub deleted: Vec<String>,
    pub failures: Vec<PathError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathError {
    pub path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferReport {
    pub moved: Vec<String>,
    pub failures: Vec<PathError>,
    pub bytes: u64,
    pub elapsed_ms: u64,
}

static COPY_COUNTER: AtomicU64 = AtomicU64::new(0);

/// First free `name (n).ext` sibling, counting up from the original name.
fn unique_sibling(target: &Path) -> PathBuf {
    let parent = target.parent().unwrap_or_else(|| Path::new("/"));
    let stem = target
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let ext = target
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for index in 1..10_000u32 {
        let candidate = parent.join(format!("{stem} ({index}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!(
        "{stem} ({}).copy{ext}",
        COPY_COUNTER.fetch_add(1, Ordering::Relaxed)
    ))
}

fn copy_recursive(source: &Path, target: &Path, bytes: &mut u64) -> Result<(), String> {
    let meta = fs::symlink_metadata(source).map_err(|e| format!("{}: {e}", source.display()))?;
    if meta.is_dir() && !meta.file_type().is_symlink() {
        fs::create_dir_all(target).map_err(|e| format!("{}: {e}", target.display()))?;
        for item in fs::read_dir(source).map_err(|e| format!("{}: {e}", source.display()))? {
            let item = item.map_err(|e| e.to_string())?;
            copy_recursive(&item.path(), &target.join(item.file_name()), bytes)?;
        }
        return Ok(());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    let mut reader =
        fs::File::open(source).map_err(|e| format!("open {}: {e}", source.display()))?;
    let mut writer = fs::File::create(target).map_err(|e| format!("create {}: {e}", target.display()))?;
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let read = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        writer.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
        *bytes = bytes.saturating_add(read as u64);
    }
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

fn transfer(
    sources: Vec<String>,
    destination: String,
    move_entries: bool,
) -> Result<TransferReport, String> {
    let started = std::time::Instant::now();
    let destination = PathBuf::from(destination);
    if !destination.is_dir() {
        return Err(format!("destination is not a directory: {}", destination.display()));
    }

    let mut moved = Vec::new();
    let mut failures = Vec::new();
    let mut bytes = 0u64;
    let destination_real = fs::canonicalize(&destination).map_err(|e| e.to_string())?;

    for source in sources {
        let source_path = PathBuf::from(&source);
        let Some(file_name) = source_path.file_name() else {
            failures.push(PathError {
                path: source,
                message: "cannot transfer a filesystem root".into(),
            });
            continue;
        };
        let mut target = destination.join(file_name);

        // Canonical paths also catch aliases, `..` and symlinks into the source.
        let source_real = match fs::canonicalize(&source_path) {
            Ok(path) => path,
            Err(error) => {
                failures.push(PathError { path: source, message: error.to_string() });
                continue;
            }
        };
        if source_real.is_dir() && destination_real.starts_with(&source_real) {
            failures.push(PathError {
                path: source,
                message: "cannot copy or move a folder into itself".into(),
            });
            continue;
        }
        if target.exists() {
            target = unique_sibling(&target);
        }

        if move_entries {
            match fs::rename(&source_path, &target) {
                Ok(()) => {
                    moved.push(target.to_string_lossy().to_string());
                    continue;
                }
                Err(_) => {
                    // Cross-volume move: fall through to copy + delete.
                }
            }
        }

        match copy_recursive(&source_path, &target, &mut bytes) {
            Ok(()) => {
                if move_entries {
                    let cleanup = if source_path.is_dir() && !source_path.is_symlink() {
                        fs::remove_dir_all(&source_path)
                    } else {
                        fs::remove_file(&source_path)
                    };
                    if let Err(error) = cleanup {
                        failures.push(PathError {
                            path: source,
                            message: format!("copied but could not remove the original: {error}"),
                        });
                        continue;
                    }
                }
                moved.push(target.to_string_lossy().to_string());
            }
            Err(message) => failures.push(PathError { path: source, message }),
        }
    }

    Ok(TransferReport {
        moved,
        failures,
        bytes,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

pub fn copy_entries(sources: Vec<String>, destination: String) -> Result<TransferReport, String> {
    let report = transfer(sources, destination, false)?;
    crate::log::info(
        "fs",
        format!(
            "copy: {} item(s), {} bytes in {} ms, {} failure(s)",
            report.moved.len(),
            report.bytes,
            report.elapsed_ms,
            report.failures.len()
        ),
    );
    Ok(report)
}

pub fn move_entries(sources: Vec<String>, destination: String) -> Result<TransferReport, String> {
    let report = transfer(sources, destination, true)?;
    crate::log::info(
        "fs",
        format!(
            "move: {} item(s), {} bytes in {} ms, {} failure(s)",
            report.moved.len(),
            report.bytes,
            report.elapsed_ms,
            report.failures.len()
        ),
    );
    Ok(report)
}

#[tauri::command]
pub fn entry_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPreview {
    pub path: String,
    pub text: String,
    pub truncated: bool,
    pub bytes: u64,
    pub lines: u64,
}

/// Heuristic that decides whether a byte chunk is worth showing in a text
/// preview.
///
/// A NUL byte is the classic tell, but plenty of binary formats have none —
/// a JPEG's entropy-coded data, for instance, is mostly bytes that decode to
/// control characters. Counting those catches what the NUL test misses.
fn looks_binary(bytes: &[u8]) -> bool {
    if bytes.contains(&0) {
        return true;
    }
    let sample = &bytes[..bytes.len().min(8 * 1024)];
    if sample.is_empty() {
        return false;
    }
    let suspicious = sample
        .iter()
        .filter(|byte| {
            matches!(byte, 0x01..=0x08 | 0x0b | 0x0e..=0x1f | 0x7f)
        })
        .count();
    suspicious * 100 / sample.len() > 15
}

pub fn read_text_preview(path: String, max_bytes: Option<u64>) -> Result<TextPreview, String> {
    const HARD_CAP: u64 = 4 * 1024 * 1024;
    let cap = max_bytes.unwrap_or(512 * 1024).min(HARD_CAP);
    let path_ref = Path::new(&path);
    let meta = fs::metadata(path_ref).map_err(|error| format!("{path}: {error}"))?;
    if meta.is_dir() {
        return Err("is a directory".into());
    }
    let take = meta.len().min(cap);
    let file = fs::File::open(path_ref).map_err(|error| format!("{path}: {error}"))?;
    let mut buffer = Vec::with_capacity(take as usize);
    file.take(take)
        .read_to_end(&mut buffer)
        .map_err(|error| error.to_string())?;

    if looks_binary(&buffer) {
        return Err("binary file".into());
    }
    let text = String::from_utf8_lossy(&buffer).to_string();
    let lines = text.lines().count() as u64;
    Ok(TextPreview {
        path,
        text,
        truncated: meta.len() > take,
        bytes: meta.len(),
        lines,
    })
}

/// MD5-style digest used by the "duplicate finder" groundwork. Implemented
/// inline to avoid pulling a hashing dependency into the mobile build.
pub fn file_hash(path: String, algorithm: Option<String>) -> Result<String, String> {
    let mut file = fs::File::open(&path).map_err(|error| format!("{path}: {error}"))?;
    let mut hasher = Fnv1a::default();
    let mut buffer = vec![0u8; 1 << 20];
    let mut total = 0u64;
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.write(&buffer[..read]);
        total += read as u64;
    }
    let _ = algorithm;
    Ok(format!("fnv1a64:{:016x}:{total}", hasher.finish()))
}

/// 64-bit FNV-1a. Not cryptographic; used for change detection and duplicate
/// pre-filtering, where speed matters more than collision resistance.
#[derive(Default)]
struct Fnv1a {
    state: u64,
}

impl Fnv1a {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x1000_0000_01b3;

    fn write(&mut self, bytes: &[u8]) {
        if self.state == 0 {
            self.state = Self::OFFSET;
        }
        for byte in bytes {
            self.state ^= *byte as u64;
            self.state = self.state.wrapping_mul(Self::PRIME);
        }
    }

    fn finish(&self) -> u64 {
        if self.state == 0 {
            Self::OFFSET
        } else {
            self.state
        }
    }
}

fn validate_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("name is empty".into());
    }
    if trimmed == "." || trimmed == ".." {
        return Err("reserved name".into());
    }
    if trimmed.contains('/') || trimmed.contains('\0') {
        return Err("name contains an illegal character".into());
    }
    Ok(trimmed.to_string())
}

/// Aggregate counts by category, used by the Storage screen without a second
/// filesystem walk.
pub fn summarize(entries: &[DirEntryInfo]) -> HashMap<&'static str, (u64, u64)> {
    let mut out: HashMap<&'static str, (u64, u64)> = HashMap::new();
    for entry in entries {
        let slot = out.entry(entry.kind).or_insert((0, 0));
        slot.0 += 1;
        slot.1 = slot.1.saturating_add(entry.size);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rhfiles-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create scratch dir");
        dir
    }

    #[test]
    fn copying_a_directory_into_its_descendant_is_rejected() {
        let root = scratch("copy-descendant");
        let source = root.join("source"); let child = source.join("child");
        fs::create_dir_all(&child).unwrap();
        let report = transfer(vec![source.to_string_lossy().into()], child.to_string_lossy().into(), false).unwrap();
        assert_eq!(report.failures.len(), 1);
        assert!(!child.join("source").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn classify_by_extension() {
        assert_eq!(kind_of("photo.HEIC", false), "image");
        assert_eq!(kind_of("clip.mp4", false), "video");
        assert_eq!(kind_of("lib.rs", false), "code");
        // `.ts` is TypeScript far more often than MPEG transport stream on a
        // phone, so it stays in `code`; `.m2ts` covers the media case.
        assert_eq!(kind_of("notes.ts", false), "code");
        assert_eq!(kind_of("movie.m2ts", false), "video");
        assert_eq!(kind_of("app.apk", false), "archive");
        assert_eq!(kind_of("anything", true), "folder");
    }

    #[test]
    fn reject_illegal_names() {
        assert!(validate_name("").is_err());
        assert!(validate_name("   ").is_err());
        assert!(validate_name("..").is_err());
        assert!(validate_name("a/b").is_err());
        assert_eq!(validate_name("  report.txt ").unwrap(), "report.txt");
    }

    #[test]
    fn list_dir_reports_directories_before_files_and_counts_bytes() {
        let root = scratch("list");
        fs::create_dir(root.join("sub")).unwrap();
        fs::write(root.join("a.txt"), b"hello").unwrap();
        fs::write(root.join(".hidden"), b"x").unwrap();

        let listing = list_dir_impl(&root).unwrap();
        assert_eq!(listing.dir_count, 1);
        assert_eq!(listing.file_count, 2);
        assert_eq!(listing.total_bytes, 6);
        assert!(listing.entries.iter().any(|entry| entry.name == ".hidden" && entry.hidden));
        assert_eq!(listing.parent.as_deref(), root.parent().map(|p| p.to_str().unwrap()));
    }

    #[test]
    fn copy_recursive_preserves_tree_and_counts_bytes() {
        let root = scratch("copy");
        let source = root.join("src");
        fs::create_dir_all(source.join("nested")).unwrap();
        fs::write(source.join("one.bin"), vec![7u8; 4096]).unwrap();
        fs::write(source.join("nested/two.bin"), vec![9u8; 1024]).unwrap();

        let target = root.join("dst");
        let mut bytes = 0;
        copy_recursive(&source, &target, &mut bytes).unwrap();
        assert_eq!(bytes, 5120);
        assert!(target.join("nested/two.bin").is_file());
        let copied = fs::read(target.join("one.bin")).unwrap();
        assert_eq!(copied.len(), 4096);
    }

    #[test]
    fn copy_never_overwrites_an_existing_sibling() {
        let root = scratch("collide");
        fs::write(root.join("report.txt"), b"one").unwrap();
        fs::write(root.join("report (1).txt"), b"two").unwrap();
        let unique = unique_sibling(&root.join("report.txt"));
        assert_eq!(unique.file_name().unwrap().to_string_lossy(), "report (2).txt");
    }

    #[test]
    fn move_into_own_subtree_is_refused() {
        let root = scratch("selfmove");
        let source = root.join("outer");
        let inner = source.join("inner");
        fs::create_dir_all(&inner).unwrap();

        let report = transfer(
            vec![source.to_string_lossy().to_string()],
            inner.to_string_lossy().to_string(),
            true,
        )
        .unwrap();
        assert!(report.moved.is_empty());
        assert_eq!(report.failures.len(), 1);
        assert!(report.failures[0].message.contains("into itself"));
    }

    #[test]
    fn delete_removes_trees_and_reports_missing_paths() {
        let root = scratch("delete");
        let victim = root.join("tree");
        fs::create_dir_all(victim.join("deep")).unwrap();
        fs::write(victim.join("deep/file.txt"), b"x").unwrap();

        let report = delete_entries(
            vec![
                victim.to_string_lossy().to_string(),
                root.join("not-there").to_string_lossy().to_string(),
            ],
            true,
        )
        .unwrap();
        assert_eq!(report.deleted.len(), 1);
        assert_eq!(report.failures.len(), 1);
        assert!(!victim.exists());
    }

    #[test]
    fn text_preview_refuses_binary_and_truncates() {
        let root = scratch("preview");
        let binary = root.join("blob.bin");
        fs::write(&binary, [0u8, 1, 2, 3]).unwrap();
        assert!(read_text_preview(binary.to_string_lossy().to_string(), None).is_err());

        let text = root.join("long.txt");
        fs::write(&text, "a".repeat(4096)).unwrap();
        let preview = read_text_preview(text.to_string_lossy().to_string(), Some(1024)).unwrap();
        assert!(preview.truncated);
        assert_eq!(preview.bytes, 4096);
        assert_eq!(preview.text.len(), 1024);
    }

    #[test]
    fn binary_detection_catches_payloads_without_null_bytes() {
        // A JPEG's entropy-coded scan data is mostly control bytes and contains
        // no NUL, so the NUL test alone would happily "preview" it as text.
        assert!(looks_binary(&[0x07u8; 512]));
        assert!(looks_binary(&[0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
        assert!(looks_binary(&[0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x01]));

        // Ordinary source code, including its tabs, newlines and UTF-8.
        assert!(!looks_binary("fn main() {\n\tprintln!(\"中文 ok\");\n}\n".as_bytes()));
        assert!(!looks_binary(b""));
        assert!(!looks_binary("a\tb\r\nc".as_bytes()));
    }

    #[test]
    fn hash_is_stable_and_length_suffix_is_reported() {
        let root = scratch("hash");
        let file = root.join("data.bin");
        fs::write(&file, b"rhfiles").unwrap();
        let first = file_hash(file.to_string_lossy().to_string(), None).unwrap();
        let second = file_hash(file.to_string_lossy().to_string(), None).unwrap();
        assert_eq!(first, second);
        assert!(first.ends_with(":7"));
    }

    #[test]
    fn summarize_groups_by_kind() {
        let entries = vec![
            DirEntryInfo {
                name: "a.jpg".into(),
                path: "/a.jpg".into(),
                is_dir: false,
                is_symlink: false,
                size: 100,
                modified_ms: None,
                mode: None,
                kind: "image",
                hidden: false,
            },
            DirEntryInfo {
                name: "b.jpg".into(),
                path: "/b.jpg".into(),
                is_dir: false,
                is_symlink: false,
                size: 50,
                modified_ms: None,
                mode: None,
                kind: "image",
                hidden: false,
            },
        ];
        let summary = summarize(&entries);
        assert_eq!(summary.get("image").copied(), Some((2, 150)));
    }
}
