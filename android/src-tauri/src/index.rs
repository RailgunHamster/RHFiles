//! File-name index and search.
//!
//! Android has no Everything: there is no system-wide MFT to query, and
//! `MediaStore` indexes media only. A file manager that wants instant results for
//! *any* file therefore has to keep its own name index — which is exactly what
//! this module does, in memory, rebuilt on demand and persisted between runs.
//!
//! The index stores only names and metadata, never file contents.

use serde::Serialize;
use std::fs;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

const MAGIC: &[u8; 4] = b"RHIX";
const FORMAT_VERSION: u32 = 2;
const PROGRESS_EVERY: u64 = 4096;

#[derive(Debug, Clone)]
pub struct IndexEntry {
    pub path: String,
    pub name: String,
    /// Lowercased name, precomputed so a search never allocates per entry.
    pub lower_name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: u64,
}

impl IndexEntry {
    fn new(path: String, name: String, is_dir: bool, size: u64, modified_ms: u64) -> Self {
        let lower_name = name.to_lowercase();
        Self {
            path,
            name,
            lower_name,
            is_dir,
            size,
            modified_ms,
        }
    }

    /// Depth from the storage root; shallower entries sort first so results near
    /// the top of a tree beat deeply nested ones with the same match quality.
    pub fn depth(&self) -> usize {
        self.path.bytes().filter(|byte| *byte == b'/').count()
    }
}

#[derive(Debug, Clone, Default)]
pub struct IndexSnapshot {
    pub entries: Vec<IndexEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub indexing: bool,
    pub entry_count: u64,
    pub scanned_dirs: u64,
    pub current_dir: String,
    pub last_finished_ms: Option<u64>,
    pub duration_ms: u64,
    pub roots: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: u64,
    pub parent: String,
    /// 0 = exact name, 1 = name prefix, 2 = name contains, 3 = path only.
    pub rank: u8,
}

#[derive(Debug, Default)]
pub struct IndexState {
    entries: RwLock<Vec<IndexEntry>>,
    indexing: AtomicBool,
    stop_requested: AtomicBool,
    scanned_dirs: AtomicU64,
    current_dir: RwLock<String>,
    last_finished_ms: RwLock<Option<u64>>,
    duration_ms: AtomicU64,
    roots: RwLock<Vec<String>>,
    error: RwLock<Option<String>>,
}

pub type SharedIndex = Arc<IndexState>;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|delta| delta.as_millis() as u64)
        .unwrap_or(0)
}

impl IndexState {
    pub fn status(&self) -> IndexStatus {
        IndexStatus {
            indexing: self.indexing.load(Ordering::Relaxed),
            entry_count: self.entries.read().map(|e| e.len() as u64).unwrap_or(0),
            scanned_dirs: self.scanned_dirs.load(Ordering::Relaxed),
            current_dir: self
                .current_dir
                .read()
                .map(|value| value.clone())
                .unwrap_or_default(),
            last_finished_ms: *self.last_finished_ms.read().unwrap_or_else(|e| e.into_inner()),
            duration_ms: self.duration_ms.load(Ordering::Relaxed),
            roots: self.roots.read().map(|value| value.clone()).unwrap_or_default(),
            error: self
                .error
                .read()
                .map(|value| value.clone())
                .unwrap_or(None),
        }
    }

    pub fn clear(&self) {
        if let Ok(mut entries) = self.entries.write() {
            entries.clear();
            entries.shrink_to_fit();
        }
        self.scanned_dirs.store(0, Ordering::Relaxed);
        self.duration_ms.store(0, Ordering::Relaxed);
        *self.last_finished_ms.write().unwrap_or_else(|e| e.into_inner()) = None;
        *self.error.write().unwrap_or_else(|e| e.into_inner()) = None;
    }

    fn replace(&self, entries: Vec<IndexEntry>) {
        if let Ok(mut guard) = self.entries.write() {
            *guard = entries;
        }
    }

    pub fn snapshot(&self) -> Vec<IndexEntry> {
        self.entries
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }
}

/// Directory names that only ever contain caches or other apps' internals and
/// would dominate the index with useless hits.
const SKIP_DIRS: &[&str] = &[
    ".thumbnails",
    ".cache",
    "cache",
    "Cache",
    "obj",
    ".gradle",
    "node_modules",
    ".git",
    "lost+found",
];

fn should_skip(name: &str) -> bool {
    SKIP_DIRS.contains(&name)
}

struct WalkSink<'a> {
    state: &'a IndexState,
    entries: Vec<IndexEntry>,
    last_report: u64,
}

impl<'a> WalkSink<'a> {
    fn push(&mut self, path: &Path, name: String, meta: &fs::Metadata, is_dir: bool) {
        let modified = meta
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|delta| delta.as_millis() as u64)
            .unwrap_or(0);
        self.entries.push(IndexEntry::new(
            path.to_string_lossy().to_string(),
            name,
            is_dir,
            if is_dir { 0 } else { meta.len() },
            modified,
        ));
        if self.entries.len() as u64 >= self.last_report + PROGRESS_EVERY {
            self.last_report = self.entries.len() as u64;
            if let Ok(mut current) = self.state.current_dir.write() {
                *current = path.to_string_lossy().to_string();
            }
        }
    }
}

fn walk(root: &Path, sink: &mut WalkSink<'_>) -> bool {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if sink.state.stop_requested.load(Ordering::Relaxed) {
            return false;
        }
        let Ok(reader) = fs::read_dir(&dir) else {
            continue;
        };
        sink.state.scanned_dirs.fetch_add(1, Ordering::Relaxed);
        if let Ok(mut current) = sink.state.current_dir.write() {
            *current = dir.to_string_lossy().to_string();
        }
        for item in reader.flatten() {
            if sink.state.stop_requested.load(Ordering::Relaxed) {
                return false;
            }
            let path = item.path();
            let name = item.file_name().to_string_lossy().to_string();
            let Ok(meta) = fs::symlink_metadata(&path) else {
                continue;
            };
            let is_symlink = meta.file_type().is_symlink();
            if is_symlink {
                // Record the link itself, never follow it: following symlinks
                // inside shared storage can loop forever.
                sink.push(&path, name, &meta, false);
                continue;
            }
            let is_dir = meta.is_dir();
            if is_dir {
                if should_skip(&name) || name == "Android" {
                    // `Android/` holds data/ and obb/, which stay restricted even
                    // with all-files access; indexing them only produces errors.
                    sink.push(&path, name, &meta, true);
                    continue;
                }
                sink.push(&path, name, &meta, true);
                stack.push(path);
            } else {
                sink.push(&path, name, &meta, false);
            }
        }
    }
    true
}

/// Start a background index build. Returns immediately; the frontend polls
/// `index_status` for progress.
#[tauri::command]
pub fn index_start<R: tauri::Runtime>(
    state: tauri::State<'_, crate::AppState>,
    app: tauri::AppHandle<R>,
    roots: Option<Vec<String>>,
) -> Result<IndexStatus, String> {
    start_index(Arc::clone(&state.index), app, roots)
}

/// Entry point for the embedded HTTP server, which has no `State` extractor.
pub fn index_start_for_handle<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<IndexStatus, String> {
    let state = {
        use tauri::Manager;
        app.try_state::<crate::AppState>()
            .map(|state| Arc::clone(&state.index))
    };
    let Some(index) = state else {
        return Err("application state is not ready".into());
    };
    start_index(index, app, None)
}

fn start_index<R: tauri::Runtime>(
    index: SharedIndex,
    app: tauri::AppHandle<R>,
    roots: Option<Vec<String>>,
) -> Result<IndexStatus, String> {
    if index.indexing.swap(true, Ordering::SeqCst) {
        return Ok(index.status());
    }
    index.stop_requested.store(false, Ordering::SeqCst);
    index.scanned_dirs.store(0, Ordering::Relaxed);
    *index.error.write().unwrap_or_else(|e| e.into_inner()) = None;

    let roots = roots.unwrap_or_else(|| vec![crate::device::SHARED_STORAGE.to_string()]);
    *index.roots.write().unwrap_or_else(|e| e.into_inner()) = roots.clone();

    let data_dir = crate::app_data_dir(&app);
    let worker = Arc::clone(&index);
    std::thread::spawn(move || {
        let index = worker;
        let started = std::time::Instant::now();
        let mut entries = Vec::new();
        for root in &roots {
            let path = PathBuf::from(root);
            if !path.is_dir() {
                continue;
            }
            let mut sink = WalkSink {
                state: &index,
                entries: Vec::new(),
                last_report: 0,
            };
            let completed = walk(&path, &mut sink);
            entries.append(&mut sink.entries);
            if !completed {
                break;
            }
        }
        let stopped = index.stop_requested.load(Ordering::Relaxed);
        let counted = entries.len();
        index.replace(entries);
        index.duration_ms.store(started.elapsed().as_millis() as u64, Ordering::Relaxed);
        *index.last_finished_ms.write().unwrap_or_else(|e| e.into_inner()) = Some(now_ms());
        crate::log::info(
            "index",
            format!(
                "{} {counted} names in {} ms ({} folders scanned)",
                if stopped { "indexing stopped after" } else { "indexed" },
                index.duration_ms.load(Ordering::Relaxed),
                index.scanned_dirs.load(Ordering::Relaxed)
            ),
        );
        if !stopped {
            persist(&index, &data_dir);
        }
        index.indexing.store(false, Ordering::SeqCst);
    });

    Ok(index.status())
}

#[tauri::command]
pub fn index_stop(state: tauri::State<'_, crate::AppState>) -> IndexStatus {
    state.index.stop_requested.store(true, Ordering::SeqCst);
    state.index.status()
}

#[tauri::command]
pub fn index_clear<R: tauri::Runtime>(
    state: tauri::State<'_, crate::AppState>,
    app: tauri::AppHandle<R>,
) -> IndexStatus {
    state.index.clear();
    let path = crate::app_data_dir(&app).join("index.bin");
    let _ = fs::remove_file(path);
    state.index.status()
}

#[tauri::command]
pub fn index_status(state: tauri::State<'_, crate::AppState>) -> IndexStatus {
    state.index.status()
}

#[tauri::command]
pub fn search_files(
    state: tauri::State<'_, crate::AppState>,
    query: String,
    limit: Option<usize>,
    directories_only: Option<bool>,
) -> Vec<SearchHit> {
    let Ok(entries) = state.index.entries.read() else {
        return Vec::new();
    };
    search_in(
        &entries,
        &query,
        limit.unwrap_or(300),
        directories_only.unwrap_or(false),
    )
}

/// Pure ranking core, separated from the command so it can be unit tested.
pub fn search_in(
    entries: &[IndexEntry],
    query: &str,
    limit: usize,
    directories_only: bool,
) -> Vec<SearchHit> {
    let limit = limit.clamp(1, 2000);
    let tokens: Vec<String> = query
        .split_whitespace()
        .map(|token| token.to_lowercase())
        .filter(|token| !token.is_empty())
        .collect();
    if tokens.is_empty() {
        return Vec::new();
    }

    let joined = tokens.join(" ");
    let mut hits: Vec<SearchHit> = Vec::new();
    for entry in entries.iter() {
        if directories_only && !entry.is_dir {
            continue;
        }
        let all_in_name = tokens.iter().all(|token| entry.lower_name.contains(token));
        let all_in_path = !all_in_name && {
            let lower_path = entry.path.to_lowercase();
            tokens.iter().all(|token| lower_path.contains(token))
        };
        if !all_in_name && !all_in_path {
            continue;
        }
        let rank = if entry.lower_name == joined {
            0
        } else if all_in_name && entry.lower_name.starts_with(&tokens[0]) {
            1
        } else if all_in_name {
            2
        } else {
            3
        };
        hits.push(SearchHit {
            rank,
            parent: Path::new(&entry.path)
                .parent()
                .map(|parent| parent.to_string_lossy().to_string())
                .unwrap_or_default(),
            path: entry.path.clone(),
            name: entry.name.clone(),
            is_dir: entry.is_dir,
            size: entry.size,
            modified_ms: entry.modified_ms,
        });
        // Cheap early exit: past this multiple of the limit the sort below is
        // already dominated by good candidates.
        if hits.len() >= limit.saturating_mul(12) {
            break;
        }
    }

    hits.sort_by(|a, b| {
        a.rank
            .cmp(&b.rank)
            .then_with(|| b.is_dir.cmp(&a.is_dir))
            .then_with(|| {
                a.path
                    .matches('/')
                    .count()
                    .cmp(&b.path.matches('/').count())
            })
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    hits.truncate(limit);
    hits
}

// ---------------------------------------------------------------------------
// Persistence: a compact binary blob, no dependencies.
// ---------------------------------------------------------------------------

fn write_str<W: Write>(writer: &mut W, value: &str) -> std::io::Result<()> {
    let bytes = value.as_bytes();
    writer.write_all(&(bytes.len() as u32).to_le_bytes())?;
    writer.write_all(bytes)
}

fn read_str<R: Read>(reader: &mut R) -> std::io::Result<String> {
    let mut length = [0u8; 4];
    reader.read_exact(&mut length)?;
    let length = u32::from_le_bytes(length) as usize;
    if length > 8192 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "name too long",
        ));
    }
    let mut buffer = vec![0u8; length];
    reader.read_exact(&mut buffer)?;
    String::from_utf8(buffer)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "invalid utf-8"))
}

pub struct IndexStore {
    pub entries: Vec<IndexEntry>,
    pub saved_at_ms: u64,
}

impl IndexStore {
    pub fn open(path: PathBuf) -> Option<Self> {
        let file = fs::File::open(path).ok()?;
        let mut reader = BufReader::with_capacity(1 << 20, file);
        let mut magic = [0u8; 4];
        reader.read_exact(&mut magic).ok()?;
        if &magic != MAGIC {
            return None;
        }
        let mut version = [0u8; 4];
        reader.read_exact(&mut version).ok()?;
        if u32::from_le_bytes(version) != FORMAT_VERSION {
            return None;
        }
        let mut count = [0u8; 8];
        reader.read_exact(&mut count).ok()?;
        let count = u64::from_le_bytes(count);
        let mut saved_at = [0u8; 8];
        reader.read_exact(&mut saved_at).ok()?;

        let mut entries = Vec::with_capacity(count.min(2_000_000) as usize);
        for _ in 0..count {
            let path = read_str(&mut reader).ok()?;
            let name = read_str(&mut reader).ok()?;
            let mut flags = [0u8; 1];
            reader.read_exact(&mut flags).ok()?;
            let mut size = [0u8; 8];
            reader.read_exact(&mut size).ok()?;
            let mut modified = [0u8; 8];
            reader.read_exact(&mut modified).ok()?;
            let is_dir = flags[0] & 1 == 1;
            entries.push(IndexEntry::new(
                path,
                name,
                is_dir,
                u64::from_le_bytes(size),
                u64::from_le_bytes(modified),
            ));
        }
        Some(IndexStore {
            entries,
            saved_at_ms: u64::from_le_bytes(saved_at),
        })
    }
}

fn persist(index: &IndexState, data_dir: &Path) {
    if fs::create_dir_all(data_dir).is_err() {
        return;
    }
    let final_path = data_dir.join("index.bin");
    let temp_path = data_dir.join("index.bin.tmp");
    let Ok(entries) = index.entries.read() else {
        return;
    };
    let result = (|| -> std::io::Result<()> {
        let file = fs::File::create(&temp_path)?;
        let mut writer = BufWriter::with_capacity(1 << 20, file);
        writer.write_all(MAGIC)?;
        writer.write_all(&FORMAT_VERSION.to_le_bytes())?;
        writer.write_all(&(entries.len() as u64).to_le_bytes())?;
        writer.write_all(&now_ms().to_le_bytes())?;
        for entry in entries.iter() {
            write_str(&mut writer, &entry.path)?;
            write_str(&mut writer, &entry.name)?;
            writer.write_all(&[u8::from(entry.is_dir)])?;
            writer.write_all(&entry.size.to_le_bytes())?;
            writer.write_all(&entry.modified_ms.to_le_bytes())?;
        }
        writer.flush()?;
        Ok(())
    })();
    if result.is_ok() {
        let _ = fs::rename(&temp_path, &final_path);
    } else {
        let _ = fs::remove_file(&temp_path);
    }
}

pub fn load_into(index: &SharedIndex, store: IndexStore) {
    index.replace(store.entries);
    *index.last_finished_ms.write().unwrap_or_else(|e| e.into_inner()) = Some(store.saved_at_ms);
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPage {
    pub entries: Vec<crate::fs_ops::DirEntryInfo>,
    pub total: usize,
    pub total_bytes: u64,
    pub truncated: bool,
}

/// Categories use the existing name index; opening Home never recursively walks
/// storage on the UI thread. Results are bounded before crossing IPC.
#[tauri::command]
pub fn browse_library(
    category: String,
    root: String,
    show_hidden: Option<bool>,
    limit: Option<usize>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<LibraryPage, String> {
    let entries = state.index.entries.read().map_err(|_| "index unavailable")?;
    library_in(&entries, &category, &root, show_hidden.unwrap_or(false), limit.unwrap_or(1000))
}

fn library_in(entries: &[IndexEntry], category: &str, root: &str, show_hidden: bool, limit: usize) -> Result<LibraryPage, String> {
    if !matches!(category, "image" | "audio" | "video" | "document" | "archive" | "recent") {
        return Err("unknown library category".into());
    }
    let prefix = format!("{}/", root.trim_end_matches('/'));
    let mut matches: Vec<_> = entries.iter().filter(|entry| {
        if entry.is_dir || !entry.path.starts_with(&prefix) { return false; }
        let relative = &entry.path[prefix.len()..];
        if !show_hidden && relative.split('/').any(|part| part.starts_with('.')) { return false; }
        let kind = crate::fs_ops::kind_of(&entry.name, false);
        category == "recent" || kind == category || (category == "document" && kind == "code")
    }).collect();
    let total = matches.len();
    let total_bytes = matches.iter().fold(0u64, |sum, entry| sum.saturating_add(entry.size));
    let limit = limit.clamp(1, 2000);
    let order = |a: &&IndexEntry, b: &&IndexEntry| b.modified_ms.cmp(&a.modified_ms).then(a.path.cmp(&b.path));
    if matches.len() > limit {
        matches.select_nth_unstable_by(limit, order);
        matches.truncate(limit);
    }
    matches.sort_unstable_by(order);
    Ok(LibraryPage {
        total, total_bytes, truncated: total > matches.len(),
        entries: matches.into_iter().map(|entry| crate::fs_ops::DirEntryInfo {
            name: entry.name.clone(), path: entry.path.clone(), is_dir: false,
            is_symlink: false, size: entry.size, modified_ms: Some(entry.modified_ms),
            mode: None, kind: crate::fs_ops::kind_of(&entry.name, false), hidden: entry.name.starts_with('.'),
        }).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn library_respects_category_root_boundary_and_hidden_ancestors() {
        let entries = vec![
            entry("/s/p.JPG", "p.JPG", false), entry("/s/.hidden/p.jpg", "p.jpg", false),
            entry("/sibling/p.jpg", "p.jpg", false), entry("/s/folder.jpg", "folder.jpg", true),
            entry("/s/readme.txt", "readme.txt", false), entry("/s/config.json", "config.json", false),
        ];
        let page = library_in(&entries, "image", "/s/", false, 100).unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.entries[0].path, "/s/p.JPG");
        assert_eq!(library_in(&entries, "image", "/s", true, 100).unwrap().total, 2);
        assert_eq!(library_in(&entries, "document", "/s", false, 100).unwrap().total, 2);
        assert!(library_in(&entries, "unknown", "/s", false, 100).is_err());
    }

    #[test]
    fn library_bounds_payload_but_preserves_counts_and_deterministic_order() {
        let mut entries = vec![entry("/s/old.txt", "old.txt", false), entry("/s/b.txt", "b.txt", false), entry("/s/a.txt", "a.txt", false)];
        entries[0].modified_ms = 1;
        let page = library_in(&entries, "recent", "/s", false, 1).unwrap();
        assert_eq!(page.total, 3);
        assert_eq!(page.total_bytes, 30);
        assert!(page.truncated);
        assert_eq!(page.entries[0].name, "a.txt");
        assert_eq!(library_in(&[], "recent", "/s", false, 100).unwrap().total, 0);
    }

    fn entry(path: &str, name: &str, is_dir: bool) -> IndexEntry {
        IndexEntry::new(path.to_string(), name.to_string(), is_dir, 10, 1_700_000_000_000)
    }

    #[test]
    fn search_is_case_insensitive_and_ranks_prefixes_first() {
        let entries = vec![
            entry("/s/Report.txt", "Report.txt", false),
            entry("/s/my-report.txt", "my-report.txt", false),
            entry("/s/report", "report", true),
        ];
        let hits = search_in(&entries, "REPORT", 10, false);
        assert_eq!(hits.len(), 3);
        // Exact match ranks 0, prefix matches 1, interior matches 2.
        assert_eq!(hits[0].name, "report");
        assert!(hits[2].name.contains("my-"));
    }

    #[test]
    fn search_requires_every_token() {
        let entries = vec![
            entry("/s/holiday-photo.jpg", "holiday-photo.jpg", false),
            entry("/s/holiday-video.mp4", "holiday-video.mp4", false),
        ];
        let hits = search_in(&entries, "holiday photo", 10, false);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "holiday-photo.jpg");
    }

    #[test]
    fn search_can_restrict_to_directories_and_respects_the_limit() {
        let entries = vec![
            entry("/s/DCIM", "DCIM", true),
            entry("/s/dcim-backup.txt", "dcim-backup.txt", false),
        ];
        let only_dirs = search_in(&entries, "dcim", 10, true);
        assert_eq!(only_dirs.len(), 1);
        assert!(only_dirs[0].is_dir);
        assert_eq!(search_in(&entries, "dcim", 1, false).len(), 1);
        assert!(search_in(&entries, "   ", 10, false).is_empty());
    }

    #[test]
    fn a_path_only_match_ranks_last() {
        let entries = vec![
            entry("/s/Invoices/2024/acme.pdf", "acme.pdf", false),
            entry("/s/acme-notes.txt", "acme-notes.txt", false),
        ];
        let hits = search_in(&entries, "acme", 10, false);
        assert_eq!(hits[0].name, "acme-notes.txt");
        assert_eq!(hits[0].rank, 1);
    }

    #[test]
    fn depth_counts_path_separators() {
        assert_eq!(entry("/s/a.txt", "a.txt", false).depth(), 2);
        assert_eq!(entry("/s/x/y/z.txt", "z.txt", false).depth(), 4);
    }

    #[test]
    fn index_round_trips_through_the_binary_format() {
        let dir = std::env::temp_dir().join(format!("rhfiles-index-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let state = IndexState::default();
        state.replace(vec![
            entry("/s/照片.jpg", "照片.jpg", false),
            entry("/s/Music", "Music", true),
        ]);
        persist(&state, &dir);

        let store = IndexStore::open(dir.join("index.bin")).expect("index file should parse");
        assert_eq!(store.entries.len(), 2);
        assert!(store.saved_at_ms > 0);
        let reloaded = store
            .entries
            .iter()
            .find(|item| item.name == "照片.jpg")
            .expect("unicode names must survive the round trip");
        assert_eq!(reloaded.path, "/s/照片.jpg");
        assert_eq!(reloaded.lower_name, "照片.jpg");
        assert!(store.entries.iter().any(|item| item.is_dir && item.name == "Music"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupted_index_is_rejected_instead_of_half_loaded() {
        let dir = std::env::temp_dir().join(format!("rhfiles-index-bad-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("index.bin");

        fs::write(&path, b"nope").unwrap();
        assert!(IndexStore::open(path.clone()).is_none());

        let mut file = fs::File::create(&path).unwrap();
        file.write_all(MAGIC).unwrap();
        file.write_all(&FORMAT_VERSION.to_le_bytes()).unwrap();
        file.write_all(&5u64.to_le_bytes()).unwrap();
        file.write_all(&0u64.to_le_bytes()).unwrap();
        file.flush().unwrap();
        // Header promises five entries but the file ends here.
        assert!(IndexStore::open(path).is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn walking_skips_cache_directories() {
        let root = std::env::temp_dir().join(format!("rhfiles-walk-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("Photos")).unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("Photos/a.jpg"), b"x").unwrap();
        fs::write(root.join("node_modules/pkg/index.js"), b"x").unwrap();

        let state = IndexState::default();
        let mut sink = WalkSink {
            state: &state,
            entries: Vec::new(),
            last_report: 0,
        };
        assert!(walk(&root, &mut sink));
        let names: Vec<&str> = sink.entries.iter().map(|item| item.name.as_str()).collect();
        assert!(names.contains(&"a.jpg"));
        assert!(names.contains(&"node_modules"));
        assert!(!names.contains(&"index.js"), "cache-like directories must not be descended into");

        let _ = fs::remove_dir_all(&root);
    }
}
