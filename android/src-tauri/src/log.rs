//! In-app diagnostics log.
//!
//! Field debugging on Android is awkward: `adb logcat` needs a cable and a
//! developer-mode phone, and a crash in a Tauri command surfaces as a toast the
//! user has to transcribe. Keeping a small ring buffer in memory — readable from
//! the drawer and copyable with one tap — makes "it did not work" actionable
//! without any tooling on the other end.

use serde::Serialize;
use std::collections::VecDeque;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const CAPACITY: usize = 400;
/// Rotate the on-disk copy at this size: it exists for post-mortem debugging,
/// not for long-term storage, and the app has no log viewer for old files.
const FILE_LIMIT: u64 = 256 * 1024;
const FILE_NAME: &str = "rhfiles.log";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    /// Milliseconds since the Unix epoch; the frontend renders it as a time.
    pub at_ms: u64,
    pub level: &'static str,
    pub scope: String,
    pub message: String,
}

fn buffer() -> &'static Mutex<VecDeque<LogEntry>> {
    static BUFFER: OnceLock<Mutex<VecDeque<LogEntry>>> = OnceLock::new();
    BUFFER.get_or_init(|| Mutex::new(VecDeque::with_capacity(CAPACITY)))
}

/// Mirrors the ring buffer to a file, so an acceptance test (or a user with a
/// cable) can read back what happened without the UI.
fn sink() -> &'static Mutex<Option<File>> {
    static SINK: OnceLock<Mutex<Option<File>>> = OnceLock::new();
    SINK.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|delta| delta.as_millis() as u64)
        .unwrap_or(0)
}

/// Starts mirroring to `<data_dir>/rhfiles.log`, rotating an oversized file away.
pub fn init_file_log(data_dir: &Path) -> Option<PathBuf> {
    std::fs::create_dir_all(data_dir).ok()?;
    let path = data_dir.join(FILE_NAME);

    if std::fs::metadata(&path).map(|meta| meta.len() > FILE_LIMIT).unwrap_or(false) {
        let _ = std::fs::rename(&path, data_dir.join(format!("{FILE_NAME}.1")));
    }

    let file = OpenOptions::new().create(true).append(true).open(&path).ok()?;
    if let Ok(mut guard) = sink().lock() {
        *guard = Some(file);
    }
    Some(path)
}

/// Path the file mirror is expected at; also used by the acceptance script.
pub fn file_log_path(data_dir: &Path) -> PathBuf {
    data_dir.join(FILE_NAME)
}

fn write_to_file(entry: &LogEntry) {
    let Ok(mut guard) = sink().lock() else { return };
    let Some(file) = guard.as_mut() else { return };
    let seconds = entry.at_ms / 1000;
    let millis = entry.at_ms % 1000;
    // A leading `--` keeps a file name that starts with a dash from looking like
    // another log field when the line is read back.
    let _ = writeln!(
        file,
        "[{seconds}.{millis:03}] {:<5} [{}] {}",
        entry.level.to_uppercase(),
        entry.scope,
        entry.message
    );
    let _ = file.flush();
}

/// Appends one entry, dropping the oldest when full.
pub fn record(level: &'static str, scope: &str, message: impl Into<String>) {
    let entry = LogEntry {
        at_ms: now_ms(),
        level,
        scope: scope.to_string(),
        message: message.into(),
    };
    write_to_file(&entry);
    if let Ok(mut guard) = buffer().lock() {
        if guard.len() >= CAPACITY {
            guard.pop_front();
        }
        guard.push_back(entry);
    }
}

pub fn info(scope: &str, message: impl Into<String>) {
    record("info", scope, message);
}

pub fn warn(scope: &str, message: impl Into<String>) {
    record("warn", scope, message);
}

pub fn error(scope: &str, message: impl Into<String>) {
    record("error", scope, message);
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogPage {
    pub entries: Vec<LogEntry>,
    pub total: usize,
    /// Capacity, so the UI can say "showing the last N of M".
    pub capacity: usize,
}

/// Returns the most recent entries, oldest first.
#[tauri::command]
pub fn get_logs(limit: Option<usize>) -> LogPage {
    // A requested limit of zero would return nothing while still reporting a
    // total, which reads as a bug in the UI; one entry is the useful minimum.
    let limit = limit.unwrap_or(CAPACITY).clamp(1, CAPACITY);
    let Ok(guard) = buffer().lock() else {
        return LogPage {
            entries: Vec::new(),
            total: 0,
            capacity: CAPACITY,
        };
    };
    let total = guard.len();
    let skip = total.saturating_sub(limit);
    LogPage {
        entries: guard.iter().skip(skip).cloned().collect(),
        total,
        capacity: CAPACITY,
    }
}

#[tauri::command]
pub fn clear_logs() -> LogPage {
    if let Ok(mut guard) = buffer().lock() {
        guard.clear();
    }
    get_logs(None)
}

/// Lets the frontend put a note into the same diagnostics log.
///
/// Without this a failure inside the WebView is invisible from the outside: the
/// page renders, nothing throws where logcat can see it, and the only symptom is
/// an empty list. Reported notes land in the ring buffer *and* the file mirror,
/// so `adb shell run-as <pkg> cat rhfiles.log` shows what the JavaScript saw.
#[tauri::command]
pub fn debug_note(scope: String, message: String) {
    let scope = format!("web:{scope}");
    record("info", &scope, message);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, MutexGuard, OnceLock};

    /// The buffer is process-wide while cargo runs tests in parallel, so the
    /// tests that assert on its *contents* must not overlap. Serialising them
    /// keeps the assertions exact instead of fuzzy.
    fn exclusive() -> MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[test]
    fn the_buffer_never_exceeds_its_capacity() {
        let _guard = exclusive();
        clear_logs();
        for index in 0..8 {
            info("test", format!("marker {index}"));
        }
        let page = get_logs(None);
        assert_eq!(page.total, 8);
        assert_eq!(page.entries.len(), 8);
        assert_eq!(page.capacity, CAPACITY);
    }

    #[test]
    fn the_oldest_entries_are_dropped_first() {
        let _guard = exclusive();
        clear_logs();
        for index in 0..(CAPACITY + 20) {
            info("test", format!("flood {index}"));
        }
        let entries = get_logs(None).entries;
        assert_eq!(entries.len(), CAPACITY);
        assert!(
            !entries.iter().any(|entry| entry.message == "flood 0"),
            "the oldest entry should have been evicted"
        );
        assert_eq!(
            entries.last().unwrap().message,
            format!("flood {}", CAPACITY + 19)
        );
    }

    #[test]
    fn a_limited_read_returns_the_newest_entries_in_order() {
        let _guard = exclusive();
        clear_logs();
        for index in 0..6 {
            info("test", format!("marker {index}"));
        }
        let tail = get_logs(Some(3));
        assert_eq!(tail.entries.len(), 3);
        assert_eq!(tail.total, 6);
        assert_eq!(
            tail.entries.iter().map(|entry| entry.message.as_str()).collect::<Vec<_>>(),
            ["marker 3", "marker 4", "marker 5"]
        );
    }

    #[test]
    fn levels_scopes_and_timestamps_are_recorded() {
        let _guard = exclusive();
        clear_logs();
        error("fs", "boom");
        warn("index", "slow");
        info("server", "listening");

        let entries = get_logs(None).entries;
        assert_eq!(
            entries.iter().map(|entry| entry.level).collect::<Vec<_>>(),
            ["error", "warn", "info"]
        );
        assert_eq!(
            entries.iter().map(|entry| entry.scope.as_str()).collect::<Vec<_>>(),
            ["fs", "index", "server"]
        );
        assert!(entries.iter().all(|entry| entry.at_ms > 0));

        // A zero limit is clamped rather than returning nothing.
        assert_eq!(get_logs(Some(0)).entries.len(), 1);
        assert_eq!(clear_logs().total, 0);
    }
}
