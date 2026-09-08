use crate::types::*;
use rhfiles_core::enumerator;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use tauri::{Emitter, Manager};

fn tagged_fs_error(error: &std::io::Error) -> String {
    let code = match error.raw_os_error() {
        Some(5 | 65 | 1326) => "permission_denied",
        Some(2 | 3) => "not_found",
        Some(53 | 64 | 67 | 1219 | 1231) => "network_unreachable",
        Some(21 | 32 | 33) => "busy",
        _ => match error.kind() {
            std::io::ErrorKind::PermissionDenied => "permission_denied",
            std::io::ErrorKind::NotFound => "not_found",
            std::io::ErrorKind::TimedOut => "timed_out",
            std::io::ErrorKind::WouldBlock => "busy",
            std::io::ErrorKind::NetworkUnreachable => "network_unreachable",
            _ => "io_error",
        },
    };
    format!("RHFILES_FS_ERROR|{code}|{error}")
}

const TRANSFER_BUFFER_SIZE: usize = 1024 * 1024;

#[derive(Clone, Copy, Default)]
struct PathTotals {
    bytes: u64,
    entries: u64,
}

#[cfg(test)]
fn scan_path(path: &Path) -> Result<PathTotals, String> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("Cannot read {}: {error}", path.display()))?;
    let mut totals = PathTotals {
        bytes: if metadata.is_file() {
            metadata.len()
        } else {
            0
        },
        entries: 1,
    };
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        for entry in std::fs::read_dir(path)
            .map_err(|error| format!("Cannot list {}: {error}", path.display()))?
        {
            let entry = entry
                .map_err(|error| format!("Cannot list an item in {}: {error}", path.display()))?;
            let child = scan_path(&entry.path())?;
            totals.bytes = totals.bytes.saturating_add(child.bytes);
            totals.entries = totals.entries.saturating_add(child.entries);
        }
    }
    Ok(totals)
}

struct ReportingScanner<'a> {
    app: &'a tauri::AppHandle,
    cancel: &'a CancelFlag,
    operation_id: &'a str,
    operation: &'a str,
    source: &'a str,
    destination: &'a str,
    scanned: PathTotals,
    last_emit: Instant,
    batch_index: Option<usize>,
    batch_total: Option<usize>,
}

impl<'a> ReportingScanner<'a> {
    fn new(
        app: &'a tauri::AppHandle,
        cancel: &'a CancelFlag,
        operation_id: &'a str,
        operation: &'a str,
        source: &'a str,
        destination: &'a str,
    ) -> Self {
        Self {
            app,
            cancel,
            operation_id,
            operation,
            source,
            destination,
            scanned: PathTotals::default(),
            last_emit: Instant::now(),
            batch_index: None,
            batch_total: None,
        }
    }

    fn set_batch_position(&mut self, index: usize, total: usize) {
        self.batch_index = Some(index);
        self.batch_total = Some(total);
    }

    fn emit(&mut self, path: &Path, force: bool) {
        let now = Instant::now();
        if !force && now.duration_since(self.last_emit).as_millis() < 120 {
            return;
        }
        self.last_emit = now;
        let _ = self.app.emit(
            "op-progress",
            serde_json::json!({
                "operationId": self.operation_id,
                "operation": self.operation,
                "src": self.source,
                "dest": self.destination,
                "currentPath": path.to_string_lossy(),
                "currentName": display_name(path),
                "bytesTransferred": self.scanned.bytes,
                "totalBytes": 0,
                "entriesCompleted": self.scanned.entries,
                "totalEntries": 0,
                "percentage": 0,
                "speed": 0,
                "batchIndex": self.batch_index,
                "batchTotal": self.batch_total,
                "status": "calculating",
            }),
        );
    }

    fn scan(&mut self, path: &Path) -> Result<PathTotals, String> {
        if self.cancel.is_cancelled(Some(self.operation_id))? {
            return Err("Cancelled".to_string());
        }
        let metadata = std::fs::symlink_metadata(path)
            .map_err(|error| format!("Cannot read {}: {error}", path.display()))?;
        let mut totals = PathTotals {
            bytes: if metadata.is_file() {
                metadata.len()
            } else {
                0
            },
            entries: 1,
        };
        self.scanned.bytes = self.scanned.bytes.saturating_add(totals.bytes);
        self.scanned.entries = self.scanned.entries.saturating_add(1);
        self.emit(path, false);
        if metadata.is_dir() && !metadata.file_type().is_symlink() {
            for entry in std::fs::read_dir(path)
                .map_err(|error| format!("Cannot list {}: {error}", path.display()))?
            {
                let entry = entry.map_err(|error| {
                    format!("Cannot list an item in {}: {error}", path.display())
                })?;
                let child = self.scan(&entry.path())?;
                totals.bytes = totals.bytes.saturating_add(child.bytes);
                totals.entries = totals.entries.saturating_add(child.entries);
            }
        }
        Ok(totals)
    }
}

fn operation_id_or_legacy(operation_id: Option<String>) -> String {
    operation_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "legacy".to_string())
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

struct OperationProgress<'a> {
    app: &'a tauri::AppHandle,
    operation: &'a str,
    operation_id: &'a str,
    source: &'a str,
    destination: &'a str,
    total_bytes: u64,
    total_entries: u64,
    transferred: u64,
    completed_entries: u64,
    started: Instant,
    last_emit: Instant,
    last_emit_bytes: u64,
    smoothed_speed: f64,
    batch_index: Option<u64>,
    batch_total: Option<u64>,
}

impl<'a> OperationProgress<'a> {
    fn new(
        app: &'a tauri::AppHandle,
        operation: &'a str,
        operation_id: &'a str,
        source: &'a str,
        destination: &'a str,
        totals: PathTotals,
    ) -> Self {
        let now = Instant::now();
        Self {
            app,
            operation,
            operation_id,
            source,
            destination,
            total_bytes: totals.bytes,
            total_entries: totals.entries,
            transferred: 0,
            completed_entries: 0,
            started: now,
            last_emit: now,
            last_emit_bytes: 0,
            smoothed_speed: 0.0,
            batch_index: None,
            batch_total: None,
        }
    }

    fn add_bytes(&mut self, bytes: u64) {
        self.transferred = self.transferred.saturating_add(bytes);
    }

    fn complete_entry(&mut self) {
        self.completed_entries = self.completed_entries.saturating_add(1);
    }

    fn set_batch_position(&mut self, index: usize, total: usize) {
        self.batch_index = Some(index as u64);
        self.batch_total = Some(total as u64);
    }

    fn percentage(&self, status: &str) -> u32 {
        if status == "complete" {
            return 100;
        }
        let value = if self.total_bytes > 0 {
            self.transferred as f64 / self.total_bytes as f64 * 100.0
        } else if self.total_entries > 0 {
            self.completed_entries as f64 / self.total_entries as f64 * 100.0
        } else {
            0.0
        };
        value.clamp(0.0, 99.0).round() as u32
    }

    fn emit(&mut self, status: &str, current_path: Option<&Path>, force: bool) {
        let now = Instant::now();
        let interval = now.duration_since(self.last_emit).as_secs_f64();
        if !force && interval < 0.1 {
            return;
        }
        if interval > 0.0 {
            let sample = self.transferred.saturating_sub(self.last_emit_bytes) as f64 / interval;
            self.smoothed_speed = if self.smoothed_speed > 0.0 {
                self.smoothed_speed * 0.72 + sample * 0.28
            } else {
                sample
            };
        }
        self.last_emit = now;
        self.last_emit_bytes = self.transferred;
        let current = current_path.map(|path| path.to_string_lossy().into_owned());
        let current_name = current_path.map(display_name);
        let elapsed_seconds = self.started.elapsed().as_secs_f64();
        let _ = self.app.emit(
            "op-progress",
            serde_json::json!({
                "operationId": self.operation_id,
                "operation": self.operation,
                "src": self.source,
                "dest": self.destination,
                "currentPath": current,
                "currentName": current_name,
                "bytesTransferred": self.transferred,
                "totalBytes": self.total_bytes,
                "entriesCompleted": self.completed_entries,
                "totalEntries": self.total_entries,
                "percentage": self.percentage(status),
                "speed": self.smoothed_speed.max(0.0) as u64,
                "elapsedSeconds": elapsed_seconds,
                "batchIndex": self.batch_index,
                "batchTotal": self.batch_total,
                "status": status,
            }),
        );
    }
}

fn validate_target_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains(['\\', '/'])
        || name.chars().any(|character| "<>:\"|?*".contains(character))
    {
        return Err(format!("Invalid destination name: {name}"));
    }
    Ok(())
}

fn paths_resolve_to_same_entry(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }
    let (Ok(left), Ok(right)) = (std::fs::canonicalize(left), std::fs::canonicalize(right)) else {
        return false;
    };
    #[cfg(target_os = "windows")]
    {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    }
    #[cfg(not(target_os = "windows"))]
    {
        left == right
    }
}

fn remove_path_if_present(path: &Path) -> Result<(), String> {
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return Ok(());
    };
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        std::fs::remove_dir_all(path)
    } else if metadata.is_dir() {
        std::fs::remove_dir(path)
    } else {
        std::fs::remove_file(path)
    }
    .map_err(|error| format!("Cannot remove {}: {error}", path.display()))
}

fn sanitized_operation_id(operation_id: &str) -> String {
    let mut safe: String = operation_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .take(72)
        .collect();
    if safe.is_empty() || safe == "legacy" {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        safe = format!("{}-{stamp}", std::process::id());
    }
    safe
}

fn hidden_sibling(parent: &Path, kind: &str, operation_id: &str) -> PathBuf {
    parent.join(format!(
        ".rhfiles-{kind}-{}",
        sanitized_operation_id(operation_id)
    ))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferJournal {
    schema_version: u32,
    operation_id: String,
    operation: String,
    source: String,
    target: String,
    staging: String,
    backup: Option<String>,
    phase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteJournal {
    schema_version: u32,
    operation_id: String,
    operation: String,
    paths: Vec<String>,
    completed: Vec<String>,
    current: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationRecoveryReport {
    operation_id: String,
    operation: String,
    source: String,
    destination: String,
    outcome: String,
    detail: String,
    completed_items: Option<usize>,
    total_items: Option<usize>,
}

fn operation_journal_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cannot locate operation journal: {error}"))?
        .join("operation-journal");
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create operation journal: {error}"))?;
    Ok(directory)
}

fn journal_path(
    app: &tauri::AppHandle,
    prefix: &str,
    operation_id: &str,
) -> Result<PathBuf, String> {
    Ok(operation_journal_dir(app)?.join(format!(
        "{prefix}-{}.json",
        sanitized_operation_id(operation_id)
    )))
}

fn persist_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let payload = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(path)
        .map_err(|error| format!("Cannot write {}: {error}", path.display()))?;
    file.write_all(&payload)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Cannot persist {}: {error}", path.display()))
}

fn persist_transfer_journal(
    app: &tauri::AppHandle,
    journal: &TransferJournal,
) -> Result<PathBuf, String> {
    let path = journal_path(app, "transfer", &journal.operation_id)?;
    persist_json(&path, journal)?;
    Ok(path)
}

fn persist_delete_journal(
    app: &tauri::AppHandle,
    journal: &DeleteJournal,
) -> Result<PathBuf, String> {
    let path = journal_path(app, "delete", &journal.operation_id)?;
    persist_json(&path, journal)?;
    Ok(path)
}

#[tauri::command(async)]
pub fn list_dir(path: String) -> Result<Vec<FileInfo>, String> {
    let p = PathBuf::from(&path);
    let entries = enumerator::list_dir(&p).map_err(|error| tagged_fs_error(&error))?;
    Ok(entries.iter().map(file_info_from_entry).collect())
}

#[tauri::command(async)]
pub fn get_drives() -> Result<Vec<DriveInfoSer>, String> {
    let drives = enumerator::get_drives().map_err(|e| e.to_string())?;
    Ok(drives
        .iter()
        .map(|d| DriveInfoSer {
            letter: d.letter.clone(),
            label: if d.label.is_empty() {
                "Local Disk".to_string()
            } else {
                d.label.clone()
            },
            free: format!(
                "{:.1} GB free / {:.1} GB",
                d.free_bytes as f64 / (1024.0 * 1024.0 * 1024.0),
                d.total_bytes as f64 / (1024.0 * 1024.0 * 1024.0)
            ),
            path: format!("{}\\", d.letter),
            free_bytes: d.free_bytes,
            total_bytes: d.total_bytes,
        })
        .collect())
}

#[tauri::command]
pub fn parent_path(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    p.parent()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "No parent".to_string())
}

#[tauri::command(async)]
pub fn delete_file(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    std::fs::symlink_metadata(&target).map_err(|error| format!("Cannot delete {path}: {error}"))?;
    enumerator::delete_to_recycle_bin(&target)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFilesOutcome {
    deleted: Vec<String>,
    errors: Vec<String>,
    cancelled: bool,
}

#[tauri::command(async)]
pub fn delete_files(
    paths: Vec<String>,
    operation_id: Option<String>,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
) -> DeleteFilesOutcome {
    let operation_id = operation_id_or_legacy(operation_id);
    let _ = cancel.reset(Some(&operation_id));
    let mut deleted = Vec::new();
    let mut errors = Vec::new();
    let mut cancelled = false;
    let mut per_path_totals = Vec::with_capacity(paths.len());
    let mut all_totals = PathTotals::default();
    let source = paths.first().cloned().unwrap_or_default();
    let mut scanner = ReportingScanner::new(&app, &cancel, &operation_id, "delete", &source, "");
    for (path_index, path) in paths.iter().enumerate() {
        scanner.set_batch_position(path_index + 1, paths.len());
        scanner.emit(Path::new(path), true);
        let totals = match scanner.scan(Path::new(path)) {
            Ok(totals) => totals,
            Err(error) if error == "Cancelled" => {
                cancelled = true;
                break;
            }
            Err(_) => PathTotals {
                bytes: 0,
                entries: 1,
            },
        };
        all_totals.bytes = all_totals.bytes.saturating_add(totals.bytes);
        all_totals.entries = all_totals.entries.saturating_add(totals.entries);
        per_path_totals.push(totals);
    }

    let mut progress =
        OperationProgress::new(&app, "delete", &operation_id, &source, "", all_totals);
    if cancelled {
        progress.emit("cancelled", None, true);
        cancel.clear(Some(&operation_id));
        return DeleteFilesOutcome {
            deleted,
            errors,
            cancelled: true,
        };
    }
    progress.emit("preparing", paths.first().map(Path::new), true);
    let mut journal = DeleteJournal {
        schema_version: 1,
        operation_id: operation_id.clone(),
        operation: "delete".to_string(),
        paths: paths.clone(),
        completed: Vec::new(),
        current: None,
    };
    let journal_file = match persist_delete_journal(&app, &journal) {
        Ok(path) => Some(path),
        Err(error) => {
            progress.emit("failed", None, true);
            cancel.clear(Some(&operation_id));
            return DeleteFilesOutcome {
                deleted,
                errors: vec![error],
                cancelled: false,
            };
        }
    };

    for (index, path) in paths.iter().enumerate() {
        if cancel.is_cancelled(Some(&operation_id)).unwrap_or(false) {
            cancelled = true;
            break;
        }
        progress.set_batch_position(index + 1, paths.len());
        journal.current = Some(path.clone());
        if let Err(error) = persist_delete_journal(&app, &journal) {
            errors.push(error);
            break;
        }
        progress.emit("progress", Some(Path::new(path)), true);
        let target = PathBuf::from(path);
        let result = std::fs::symlink_metadata(&target)
            .map_err(|error| format!("Cannot delete {path}: {error}"))
            .and_then(|_| enumerator::delete_to_recycle_bin(&target));
        match result {
            Ok(()) => {
                deleted.push(path.clone());
                journal.completed.push(path.clone());
                let totals = per_path_totals.get(index).copied().unwrap_or_default();
                progress.add_bytes(totals.bytes);
                progress.completed_entries = progress
                    .completed_entries
                    .saturating_add(totals.entries.max(1));
            }
            Err(error) => errors.push(format!("{path}: {error}")),
        }
        journal.current = None;
        if let Err(error) = persist_delete_journal(&app, &journal) {
            errors.push(error);
            break;
        }
        progress.emit("progress", Some(Path::new(path)), true);
    }
    let final_status = if cancelled {
        "cancelled"
    } else if errors.is_empty() {
        "complete"
    } else {
        "failed"
    };
    progress.emit(final_status, None, true);
    if let Some(path) = journal_file {
        let _ = std::fs::remove_file(path);
    }
    cancel.clear(Some(&operation_id));
    DeleteFilesOutcome {
        deleted,
        errors,
        cancelled,
    }
}

fn delete_permanently_recursive(
    path: &Path,
    progress: &mut OperationProgress<'_>,
    cancel: &CancelFlag,
    operation_id: &str,
    errors: &mut Vec<String>,
) -> Result<(), String> {
    if cancel.is_cancelled(Some(operation_id))? {
        return Err("Cancelled".to_string());
    }
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("Cannot read {}: {error}", path.display()))?;
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        let entries = std::fs::read_dir(path)
            .map_err(|error| format!("Cannot list {}: {error}", path.display()))?;
        for entry in entries {
            if cancel.is_cancelled(Some(operation_id))? {
                return Err("Cancelled".to_string());
            }
            match entry {
                Ok(entry) => {
                    if let Err(error) = delete_permanently_recursive(
                        &entry.path(),
                        progress,
                        cancel,
                        operation_id,
                        errors,
                    ) {
                        if error == "Cancelled" {
                            return Err(error);
                        }
                        errors.push(error);
                    }
                }
                Err(error) => errors.push(format!(
                    "Cannot enumerate an item in {}: {error}",
                    path.display()
                )),
            }
        }
        progress.emit("progress", Some(path), true);
        match std::fs::remove_dir(path) {
            Ok(()) => progress.complete_entry(),
            Err(error) => errors.push(format!("Cannot remove {}: {error}", path.display())),
        }
    } else {
        progress.emit("progress", Some(path), true);
        let size = if metadata.is_file() {
            metadata.len()
        } else {
            0
        };
        let result = if metadata.is_dir() {
            std::fs::remove_dir(path)
        } else {
            std::fs::remove_file(path)
        };
        match result {
            Ok(()) => {
                progress.add_bytes(size);
                progress.complete_entry();
            }
            Err(error) => errors.push(format!("Cannot remove {}: {error}", path.display())),
        }
        progress.emit("progress", Some(path), true);
    }
    Ok(())
}

#[tauri::command(async)]
pub fn delete_files_permanently(
    paths: Vec<String>,
    operation_id: Option<String>,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
) -> DeleteFilesOutcome {
    let operation_id = operation_id_or_legacy(operation_id);
    let _ = cancel.reset(Some(&operation_id));
    let mut deleted = Vec::new();
    let mut errors = Vec::new();
    let mut cancelled = false;
    let mut all_totals = PathTotals::default();
    let source = paths.first().cloned().unwrap_or_default();
    let mut scanner =
        ReportingScanner::new(&app, &cancel, &operation_id, "deletePermanent", &source, "");
    for (path_index, path) in paths.iter().enumerate() {
        scanner.set_batch_position(path_index + 1, paths.len());
        scanner.emit(Path::new(path), true);
        match scanner.scan(Path::new(path)) {
            Ok(totals) => {
                all_totals.bytes = all_totals.bytes.saturating_add(totals.bytes);
                all_totals.entries = all_totals.entries.saturating_add(totals.entries);
            }
            Err(error) if error == "Cancelled" => {
                cancelled = true;
                break;
            }
            Err(error) => errors.push(error),
        }
    }

    let mut progress = OperationProgress::new(
        &app,
        "deletePermanent",
        &operation_id,
        &source,
        "",
        all_totals,
    );
    if cancelled {
        progress.emit("cancelled", None, true);
        cancel.clear(Some(&operation_id));
        return DeleteFilesOutcome {
            deleted,
            errors,
            cancelled: true,
        };
    }
    progress.emit("preparing", paths.first().map(Path::new), true);
    let mut journal = DeleteJournal {
        schema_version: 1,
        operation_id: operation_id.clone(),
        operation: "deletePermanent".to_string(),
        paths: paths.clone(),
        completed: Vec::new(),
        current: None,
    };
    let journal_file = match persist_delete_journal(&app, &journal) {
        Ok(path) => Some(path),
        Err(error) => {
            progress.emit("failed", None, true);
            cancel.clear(Some(&operation_id));
            return DeleteFilesOutcome {
                deleted,
                errors: vec![error],
                cancelled: false,
            };
        }
    };

    for (path_index, path) in paths.iter().enumerate() {
        if cancel.is_cancelled(Some(&operation_id)).unwrap_or(false) {
            cancelled = true;
            break;
        }
        progress.set_batch_position(path_index + 1, paths.len());
        journal.current = Some(path.clone());
        if let Err(error) = persist_delete_journal(&app, &journal) {
            errors.push(error);
            break;
        }
        let target = PathBuf::from(path);
        match delete_permanently_recursive(
            &target,
            &mut progress,
            &cancel,
            &operation_id,
            &mut errors,
        ) {
            Ok(()) => {
                if std::fs::symlink_metadata(&target).is_err() {
                    deleted.push(path.clone());
                    journal.completed.push(path.clone());
                }
            }
            Err(error) if error == "Cancelled" => {
                cancelled = true;
                break;
            }
            Err(error) => errors.push(error),
        }
        journal.current = None;
        if let Err(error) = persist_delete_journal(&app, &journal) {
            errors.push(error);
            break;
        }
    }

    let final_status = if cancelled {
        "cancelled"
    } else if errors.is_empty() {
        "complete"
    } else {
        "failed"
    };
    progress.emit(final_status, None, true);
    if let Some(path) = journal_file {
        let _ = std::fs::remove_file(path);
    }
    cancel.clear(Some(&operation_id));
    DeleteFilesOutcome {
        deleted,
        errors,
        cancelled,
    }
}

#[cfg(target_os = "windows")]
fn recycle_compare_path(path: &str) -> String {
    let normalized = path.replace('/', "\\");
    let path_buf = PathBuf::from(&normalized);
    let expanded = path_buf
        .parent()
        .and_then(|parent| parent.canonicalize().ok())
        .and_then(|parent| path_buf.file_name().map(|name| parent.join(name)))
        .unwrap_or(path_buf)
        .to_string_lossy()
        .into_owned();
    let without_extended_prefix = if let Some(unc) = expanded.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        expanded
            .strip_prefix(r"\\?\")
            .unwrap_or(&expanded)
            .to_string()
    };
    without_extended_prefix
        .trim_end_matches('\\')
        .to_lowercase()
}

#[cfg(target_os = "windows")]
fn restore_recycled_files_windows(paths: Vec<String>) -> Result<(), String> {
    std::thread::spawn(move || -> Result<(), String> {
        use windows::Win32::System::Com::{
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
            CoUninitialize,
        };
        use windows::Win32::System::Variant::VARIANT;
        use windows::Win32::UI::Shell::{FolderItem2, IShellDispatch, Shell};
        use windows::core::{BSTR, Interface};

        struct ComGuard;
        impl Drop for ComGuard {
            fn drop(&mut self) {
                unsafe { CoUninitialize() };
            }
        }

        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(|error| format!("COM initialization failed: {error}"))?;
            let _guard = ComGuard;
            let shell: IShellDispatch = CoCreateInstance(&Shell, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| format!("Recycle Bin is unavailable: {error}"))?;
            let recycle_bin = shell
                .NameSpace(&VARIANT::from(10_i32))
                .map_err(|error| format!("Cannot open Recycle Bin: {error}"))?;
            let items = recycle_bin
                .Items()
                .map_err(|error| format!("Cannot list Recycle Bin: {error}"))?;
            let count = items.Count().map_err(|error| error.to_string())?;
            let mut candidates = Vec::new();

            for index in 0..count {
                let Ok(item) = items.Item(&VARIANT::from(index)) else {
                    continue;
                };
                let Ok(item2) = item.cast::<FolderItem2>() else {
                    continue;
                };
                let Ok(parent_value) =
                    item2.ExtendedProperty(&BSTR::from("System.Recycle.DeletedFrom"))
                else {
                    continue;
                };
                let Ok(parent) = BSTR::try_from(&parent_value) else {
                    continue;
                };
                let name = item2
                    .ExtendedProperty(&BSTR::from("System.FileName"))
                    .ok()
                    .and_then(|value| BSTR::try_from(&value).ok())
                    .filter(|value| !value.is_empty())
                    .or_else(|| item.Name().ok())
                    .unwrap_or_default();
                if name.is_empty() {
                    continue;
                }
                let original = PathBuf::from(parent.to_string()).join(name.to_string());
                let deleted_at = item2
                    .ExtendedProperty(&BSTR::from("System.Recycle.DateDeleted"))
                    .ok()
                    .and_then(|value| f64::try_from(&value).ok())
                    .unwrap_or_default();
                candidates.push((
                    recycle_compare_path(&original.to_string_lossy()),
                    deleted_at,
                    item2,
                ));
            }

            let mut reserved = vec![false; candidates.len()];
            let mut restore_plan = Vec::new();
            for path in paths {
                let destination = PathBuf::from(&path);
                if destination.exists() {
                    return Err(format!("Restore destination already exists: {path}"));
                }
                let wanted = recycle_compare_path(&path);
                let candidate_index = candidates
                    .iter()
                    .enumerate()
                    .filter(|(index, (candidate, _, _))| !reserved[*index] && candidate == &wanted)
                    .max_by(|(_, (_, left, _)), (_, (_, right, _))| {
                        left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal)
                    })
                    .map(|(index, _)| index)
                    .ok_or_else(|| format!("Item was not found in Recycle Bin: {path}"))?;
                reserved[candidate_index] = true;
                restore_plan.push((path, destination, candidate_index));
            }

            for (path, destination, candidate_index) in restore_plan {
                candidates[candidate_index]
                    .2
                    .InvokeVerb(&VARIANT::from("undelete"))
                    .map_err(|error| format!("Could not restore {path}: {error}"))?;

                for _ in 0..100 {
                    if destination.exists() {
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                if !destination.exists() {
                    return Err(format!("Windows did not restore the item: {path}"));
                }
            }
            Ok(())
        }
    })
    .join()
    .map_err(|_| "Recycle Bin restore worker stopped unexpectedly".to_string())?
}

#[tauri::command(async)]
pub fn restore_recycled_files(paths: Vec<String>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        restore_recycled_files_windows(paths)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = paths;
        Err("Recycle Bin restore is only available on Windows".to_string())
    }
}

#[tauri::command(async)]
pub fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let parent = p.parent().unwrap_or(&p);
    let new_path = parent.join(&new_name);
    std::fs::rename(&p, &new_path).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn new_folder(parent: String) -> Result<(), String> {
    enumerator::create_new_file(&PathBuf::from(&parent), "folder", "")
}

#[tauri::command(async)]
pub fn copy_path(src: String, dest: String) -> Result<(), String> {
    enumerator::copy_path(&PathBuf::from(&src), &PathBuf::from(&dest))
}

#[tauri::command(async)]
pub fn move_path_cmd(src: String, dest: String) -> Result<(), String> {
    enumerator::move_path(&PathBuf::from(&src), &PathBuf::from(&dest))
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

fn remove_partial_copy(path: &std::path::Path) {
    if path.is_dir() {
        let _ = std::fs::remove_dir_all(path);
    } else {
        let _ = std::fs::remove_file(path);
    }
}

fn copy_path_to_exact(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    if !src.exists() {
        return Err(format!("Source does not exist: {}", src.display()));
    }
    if dest.exists() {
        return Err(format!("Destination already exists: {}", dest.display()));
    }
    let parent = dest
        .parent()
        .ok_or_else(|| format!("Destination has no parent: {}", dest.display()))?;
    if !parent.is_dir() {
        return Err(format!(
            "Destination folder does not exist: {}",
            parent.display()
        ));
    }

    let result = if src.is_dir() {
        fn copy_dir(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
            std::fs::create_dir(dest).map_err(|error| error.to_string())?;
            for entry in std::fs::read_dir(src).map_err(|error| error.to_string())? {
                let entry = entry.map_err(|error| error.to_string())?;
                let source = entry.path();
                let target = dest.join(entry.file_name());
                if source.is_dir() {
                    copy_dir(&source, &target)?;
                } else {
                    std::fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&target)
                        .and_then(|mut output| {
                            let mut input = std::fs::File::open(&source)?;
                            std::io::copy(&mut input, &mut output)?;
                            Ok(())
                        })
                        .map_err(|error| error.to_string())?;
                    if let Ok(metadata) = std::fs::metadata(&source) {
                        let _ = std::fs::set_permissions(&target, metadata.permissions());
                    }
                }
            }
            Ok(())
        }
        copy_dir(src, dest)
    } else {
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dest)
            .and_then(|mut output| {
                let mut input = std::fs::File::open(src)?;
                std::io::copy(&mut input, &mut output)?;
                Ok(())
            })
            .map_err(|error| error.to_string())
            .map(|_| {
                if let Ok(metadata) = std::fs::metadata(src) {
                    let _ = std::fs::set_permissions(dest, metadata.permissions());
                }
            })
    };

    if result.is_err() {
        remove_partial_copy(dest);
    }
    result
}

#[tauri::command(async)]
pub fn copy_path_exact(src: String, dest: String) -> Result<(), String> {
    copy_path_to_exact(&PathBuf::from(src), &PathBuf::from(dest))
}

fn move_path_to_exact(source: &std::path::Path, target: &std::path::Path) -> Result<(), String> {
    if !source.exists() {
        return Err(format!("Source does not exist: {}", source.display()));
    }
    if target.exists() {
        return Err(format!("Destination already exists: {}", target.display()));
    }
    let parent = target
        .parent()
        .ok_or_else(|| format!("Destination has no parent: {}", target.display()))?;
    if !parent.is_dir() {
        return Err(format!(
            "Destination folder does not exist: {}",
            parent.display()
        ));
    }

    match std::fs::rename(source, target) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            copy_path_to_exact(source, target).map_err(|copy_error| {
                format!("Move failed ({rename_error}); copy fallback failed ({copy_error})")
            })?;
            let remove_result = if source.is_dir() {
                std::fs::remove_dir_all(source)
            } else {
                std::fs::remove_file(source)
            };
            if let Err(error) = remove_result {
                return Err(format!(
                    "Copied the item but could not completely remove the source; the destination was kept to avoid data loss: {error}"
                ));
            }
            Ok(())
        }
    }
}

#[tauri::command(async)]
pub fn move_path_exact(src: String, dest: String) -> Result<(), String> {
    move_path_to_exact(&PathBuf::from(src), &PathBuf::from(dest))
}

#[tauri::command(async)]
pub fn move_paths_exact(moves: Vec<(String, String)>) -> Result<(), String> {
    let mut completed: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (src, dest) in moves {
        let source = PathBuf::from(src);
        let target = PathBuf::from(dest);
        if let Err(error) = move_path_to_exact(&source, &target) {
            let mut rollback_errors = Vec::new();
            for (original, renamed) in completed.iter().rev() {
                if let Err(rollback_error) = move_path_to_exact(renamed, original) {
                    rollback_errors.push(rollback_error);
                }
            }
            return Err(if rollback_errors.is_empty() {
                error
            } else {
                format!(
                    "{error}; rollback also failed: {}",
                    rollback_errors.join(" | ")
                )
            });
        }
        completed.push((source, target));
    }
    Ok(())
}

fn copy_path_streaming(
    source: &Path,
    target: &Path,
    progress: &mut OperationProgress<'_>,
    cancel: &CancelFlag,
    operation_id: &str,
) -> Result<(), String> {
    if cancel.is_cancelled(Some(operation_id))? {
        return Err("Cancelled".to_string());
    }
    let metadata = std::fs::symlink_metadata(source)
        .map_err(|error| format!("Cannot read {}: {error}", source.display()))?;
    if metadata.file_type().is_symlink()
        && std::fs::metadata(source).is_ok_and(|value| value.is_dir())
    {
        return Err(format!(
            "Directory links are not copied recursively for safety: {}",
            source.display()
        ));
    }
    if metadata.is_dir() {
        std::fs::create_dir(target)
            .map_err(|error| format!("Cannot create {}: {error}", target.display()))?;
        for entry in std::fs::read_dir(source)
            .map_err(|error| format!("Cannot list {}: {error}", source.display()))?
        {
            let entry = entry
                .map_err(|error| format!("Cannot list an item in {}: {error}", source.display()))?;
            copy_path_streaming(
                &entry.path(),
                &target.join(entry.file_name()),
                progress,
                cancel,
                operation_id,
            )?;
        }
        if let Ok(source_metadata) = std::fs::metadata(source) {
            let _ = std::fs::set_permissions(target, source_metadata.permissions());
        }
        progress.complete_entry();
        progress.emit("progress", Some(source), false);
        return Ok(());
    }

    progress.emit("progress", Some(source), true);
    let mut input = std::fs::File::open(source)
        .map_err(|error| format!("Cannot open {}: {error}", source.display()))?;
    let mut output = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(target)
        .map_err(|error| format!("Cannot create {}: {error}", target.display()))?;
    let mut buffer = vec![0u8; TRANSFER_BUFFER_SIZE];
    loop {
        if cancel.is_cancelled(Some(operation_id))? {
            return Err("Cancelled".to_string());
        }
        let count = input
            .read(&mut buffer)
            .map_err(|error| format!("Cannot read {}: {error}", source.display()))?;
        if count == 0 {
            break;
        }
        output
            .write_all(&buffer[..count])
            .map_err(|error| format!("Cannot write {}: {error}", target.display()))?;
        progress.add_bytes(count as u64);
        progress.emit("progress", Some(source), false);
    }
    output
        .flush()
        .map_err(|error| format!("Cannot flush {}: {error}", target.display()))?;
    if let Ok(source_metadata) = std::fs::metadata(source) {
        let _ = std::fs::set_permissions(target, source_metadata.permissions());
    }
    progress.complete_entry();
    progress.emit("progress", Some(source), true);
    Ok(())
}

fn emit_initial_operation(
    app: &tauri::AppHandle,
    operation_id: &str,
    operation: &str,
    source: &str,
    destination: &str,
    status: &str,
) {
    let _ = app.emit(
        "op-progress",
        serde_json::json!({
            "operationId": operation_id,
            "operation": operation,
            "src": source,
            "dest": destination,
            "currentPath": source,
            "currentName": display_name(Path::new(source)),
            "bytesTransferred": 0,
            "totalBytes": 0,
            "entriesCompleted": 0,
            "totalEntries": 0,
            "percentage": 0,
            "speed": 0,
            "status": status,
        }),
    );
}

fn transfer_with_progress(
    source: String,
    destination: String,
    target_name: Option<String>,
    overwrite: bool,
    operation: &'static str,
    operation_id: String,
    app: &tauri::AppHandle,
    cancel: &CancelFlag,
) -> Result<(), String> {
    cancel.reset(Some(&operation_id))?;
    let source_path = PathBuf::from(&source);
    let destination_path = PathBuf::from(&destination);
    let source_metadata = std::fs::symlink_metadata(&source_path)
        .map_err(|error| format!("Cannot read {}: {error}", source_path.display()))?;
    if !destination_path.is_dir() {
        return Err(format!(
            "Destination folder does not exist: {}",
            destination_path.display()
        ));
    }
    let resolved_name = match target_name {
        Some(name) => {
            validate_target_name(&name)?;
            name
        }
        None => display_name(&source_path),
    };
    let target = destination_path.join(&resolved_name);
    if paths_resolve_to_same_entry(&source_path, &target) {
        return Err("Source and destination are the same".to_string());
    }
    if source_metadata.is_dir()
        && std::fs::canonicalize(&destination_path)
            .ok()
            .zip(std::fs::canonicalize(&source_path).ok())
            .is_some_and(|(destination, source)| destination.starts_with(source))
    {
        return Err("A folder cannot be copied or moved into itself".to_string());
    }
    if target.exists() && !overwrite {
        return Err(format!("Destination already exists: {}", target.display()));
    }

    emit_initial_operation(
        app,
        &operation_id,
        operation,
        &source,
        &destination,
        "preparing",
    );

    // A same-volume move without a conflict is an atomic metadata operation. It
    // is safer and much faster than needlessly copying every byte.
    if operation == "move" && !target.exists() {
        match std::fs::rename(&source_path, &target) {
            Ok(()) => {
                let mut progress = OperationProgress::new(
                    app,
                    operation,
                    &operation_id,
                    &source,
                    &destination,
                    PathTotals {
                        bytes: source_metadata.len(),
                        entries: 1,
                    },
                );
                progress.transferred = progress.total_bytes;
                progress.completed_entries = progress.total_entries;
                progress.emit("complete", Some(&target), true);
                cancel.clear(Some(&operation_id));
                return Ok(());
            }
            Err(_) => {
                // Cross-volume moves and providers that do not support rename
                // fall through to the journaled copy-then-remove path.
            }
        }
    }

    emit_initial_operation(
        app,
        &operation_id,
        operation,
        &source,
        &destination,
        "calculating",
    );
    let mut scanner =
        ReportingScanner::new(app, cancel, &operation_id, operation, &source, &destination);
    scanner.emit(&source_path, true);
    let totals = scanner.scan(&source_path)?;
    let mut progress =
        OperationProgress::new(app, operation, &operation_id, &source, &destination, totals);
    progress.emit("preparing", Some(&source_path), true);

    let staging = hidden_sibling(&destination_path, "partial", &operation_id);
    let backup = target
        .exists()
        .then(|| hidden_sibling(&destination_path, "backup", &operation_id));
    if staging.exists() || backup.as_ref().is_some_and(|path| path.exists()) {
        return Err(format!(
            "An unfinished RHFiles operation already uses task id {operation_id}"
        ));
    }
    let mut journal = TransferJournal {
        schema_version: 1,
        operation_id: operation_id.clone(),
        operation: operation.to_string(),
        source: source.clone(),
        target: target.to_string_lossy().into_owned(),
        staging: staging.to_string_lossy().into_owned(),
        backup: backup
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        phase: "copying".to_string(),
    };
    let journal_file = persist_transfer_journal(app, &journal)?;

    if let Err(error) =
        copy_path_streaming(&source_path, &staging, &mut progress, cancel, &operation_id)
    {
        let cleanup_error = remove_path_if_present(&staging).err();
        let _ = std::fs::remove_file(&journal_file);
        cancel.clear(Some(&operation_id));
        progress.emit(
            if error == "Cancelled" {
                "cancelled"
            } else {
                "failed"
            },
            Some(&source_path),
            true,
        );
        return Err(match cleanup_error {
            Some(cleanup) => format!("{error}; partial-output cleanup failed: {cleanup}"),
            None => error,
        });
    }
    if cancel.is_cancelled(Some(&operation_id))? {
        let _ = remove_path_if_present(&staging);
        let _ = std::fs::remove_file(&journal_file);
        cancel.clear(Some(&operation_id));
        progress.emit("cancelled", Some(&source_path), true);
        return Err("Cancelled".to_string());
    }

    journal.phase = "stagingReady".to_string();
    if let Err(error) = persist_json(&journal_file, &journal) {
        let _ = remove_path_if_present(&staging);
        let _ = std::fs::remove_file(&journal_file);
        progress.emit("failed", Some(&source_path), true);
        return Err(error);
    }
    if let Some(backup_path) = &backup {
        journal.phase = "backingUpTarget".to_string();
        if let Err(error) = persist_json(&journal_file, &journal) {
            let _ = remove_path_if_present(&staging);
            let _ = std::fs::remove_file(&journal_file);
            progress.emit("failed", Some(&target), true);
            return Err(error);
        }
        std::fs::rename(&target, backup_path).map_err(|error| {
            let _ = remove_path_if_present(&staging);
            let _ = std::fs::remove_file(&journal_file);
            format!("Cannot prepare destination {}: {error}", target.display())
        })?;
        journal.phase = "targetBackedUp".to_string();
        if let Err(error) = persist_json(&journal_file, &journal) {
            let rollback = std::fs::rename(backup_path, &target);
            let _ = remove_path_if_present(&staging);
            if rollback.is_ok() {
                let _ = std::fs::remove_file(&journal_file);
            }
            progress.emit("failed", Some(&target), true);
            return Err(match rollback {
                Ok(()) => error,
                Err(rollback_error) => format!(
                    "{error}; the previous destination could not be restored: {rollback_error}"
                ),
            });
        }
    }

    if let Err(error) = std::fs::rename(&staging, &target) {
        let mut rollback_errors = Vec::new();
        if let Some(backup_path) = &backup {
            if let Err(rollback_error) = std::fs::rename(backup_path, &target) {
                rollback_errors.push(format!(
                    "could not restore previous destination: {rollback_error}"
                ));
            }
        }
        let _ = remove_path_if_present(&staging);
        if rollback_errors.is_empty() {
            let _ = std::fs::remove_file(&journal_file);
        }
        cancel.clear(Some(&operation_id));
        progress.emit("failed", Some(&target), true);
        return Err(format!(
            "Cannot commit destination {}: {error}{}",
            target.display(),
            if rollback_errors.is_empty() {
                String::new()
            } else {
                format!("; {}", rollback_errors.join("; "))
            }
        ));
    }
    journal.phase = "targetCommitted".to_string();
    if let Err(error) = persist_json(&journal_file, &journal) {
        if operation == "move" {
            let mut rollback_errors = Vec::new();
            if let Err(rollback_error) = remove_path_if_present(&target) {
                rollback_errors.push(rollback_error);
            }
            if let Some(backup_path) = &backup {
                if let Err(rollback_error) = std::fs::rename(backup_path, &target) {
                    rollback_errors.push(format!(
                        "Cannot restore the previous destination: {rollback_error}"
                    ));
                }
            }
            if rollback_errors.is_empty() {
                let _ = std::fs::remove_file(&journal_file);
            }
            progress.emit("failed", Some(&target), true);
            return Err(if rollback_errors.is_empty() {
                error
            } else {
                format!(
                    "{error}; rollback also failed: {}",
                    rollback_errors.join(" | ")
                )
            });
        }
        if let Some(backup_path) = &backup {
            let _ = remove_path_if_present(backup_path);
        }
        let _ = std::fs::remove_file(&journal_file);
    }

    if operation == "move" {
        progress.emit("cleaning", Some(&source_path), true);
        if let Err(error) = remove_path_if_present(&source_path) {
            if let Some(backup_path) = &backup {
                let _ = remove_path_if_present(backup_path);
            }
            let _ = std::fs::remove_file(&journal_file);
            cancel.clear(Some(&operation_id));
            progress.emit("failed", Some(&source_path), true);
            return Err(format!(
                "The destination copy is complete, but the source could not be fully removed. The destination was kept to avoid data loss: {error}"
            ));
        }
        journal.phase = "sourceRemoved".to_string();
        let _ = persist_json(&journal_file, &journal);
    }

    if let Some(backup_path) = &backup {
        remove_path_if_present(backup_path)?;
    }
    let _ = std::fs::remove_file(&journal_file);
    cancel.clear(Some(&operation_id));
    progress.transferred = progress.total_bytes;
    progress.completed_entries = progress.total_entries;
    progress.emit("complete", Some(&target), true);
    Ok(())
}

#[tauri::command(async)]
pub fn copy_with_progress(
    src: String,
    dest: String,
    overwrite: Option<bool>,
    target_name: Option<String>,
    operation_id: Option<String>,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
) -> Result<(), String> {
    let operation_id = operation_id_or_legacy(operation_id);
    let result = transfer_with_progress(
        src,
        dest,
        target_name,
        overwrite.unwrap_or(false),
        "copy",
        operation_id.clone(),
        &app,
        &cancel,
    );
    cancel.clear(Some(&operation_id));
    result
}

#[tauri::command(async)]
pub fn move_with_progress(
    src: String,
    dest: String,
    overwrite: Option<bool>,
    target_name: Option<String>,
    operation_id: Option<String>,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
) -> Result<(), String> {
    let operation_id = operation_id_or_legacy(operation_id);
    let result = transfer_with_progress(
        src,
        dest,
        target_name,
        overwrite.unwrap_or(false),
        "move",
        operation_id.clone(),
        &app,
        &cancel,
    );
    cancel.clear(Some(&operation_id));
    result
}

#[tauri::command]
pub fn get_env(key: String) -> Option<String> {
    std::env::var(key).ok()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownFolders {
    pub home: String,
    pub desktop: String,
    pub downloads: String,
    pub documents: String,
    pub pictures: String,
    pub music: String,
    pub videos: String,
}

fn known_folder_or_fallback(
    resolved: Result<PathBuf, tauri::Error>,
    home: &std::path::Path,
    fallback_name: &str,
) -> String {
    resolved
        .unwrap_or_else(|_| home.join(fallback_name))
        .to_string_lossy()
        .into_owned()
}

/// Resolve Windows Known Folders instead of assuming they live directly under
/// USERPROFILE. This follows OneDrive Known Folder Move, domain redirection and
/// user-customized locations.
#[tauri::command]
pub fn get_known_folders(app: tauri::AppHandle) -> KnownFolders {
    let paths = app.path();
    let home = paths.home_dir().unwrap_or_else(|_| {
        std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("C:\\"))
    });

    KnownFolders {
        home: home.to_string_lossy().into_owned(),
        desktop: known_folder_or_fallback(paths.desktop_dir(), &home, "Desktop"),
        downloads: known_folder_or_fallback(paths.download_dir(), &home, "Downloads"),
        documents: known_folder_or_fallback(paths.document_dir(), &home, "Documents"),
        pictures: known_folder_or_fallback(paths.picture_dir(), &home, "Pictures"),
        music: known_folder_or_fallback(paths.audio_dir(), &home, "Music"),
        videos: known_folder_or_fallback(paths.video_dir(), &home, "Videos"),
    }
}

fn recover_transfer_journal(
    journal_path: &Path,
    journal: &TransferJournal,
) -> OperationRecoveryReport {
    let source = PathBuf::from(&journal.source);
    let target = PathBuf::from(&journal.target);
    let staging = PathBuf::from(&journal.staging);
    let backup = journal.backup.as_deref().map(PathBuf::from);
    let mut errors = Vec::new();
    let target_was_committed = target.exists()
        && (!staging.exists()
            || matches!(journal.phase.as_str(), "targetCommitted" | "sourceRemoved"));

    if !target.exists() {
        if let Some(backup_path) = backup.as_ref().filter(|path| path.exists()) {
            if let Err(error) = std::fs::rename(backup_path, &target) {
                errors.push(format!(
                    "Could not restore the previous destination {}: {error}",
                    target.display()
                ));
            }
        }
    }
    if staging.exists() {
        if let Err(error) = remove_path_if_present(&staging) {
            errors.push(error);
        }
    }
    if target.exists() {
        if let Some(backup_path) = backup.as_ref().filter(|path| path.exists()) {
            if let Err(error) = remove_path_if_present(backup_path) {
                errors.push(error);
            }
        }
    }

    let (outcome, detail) = if !errors.is_empty() {
        ("recoveryFailed", errors.join(" | "))
    } else if journal.operation == "move" && target_was_committed && source.exists() {
        (
            "moveKeptBoth",
            "The destination copy is complete and the source was kept because the app stopped before the move could be finalized.".to_string(),
        )
    } else if target_was_committed {
        (
            "completedAfterRestart",
            "The committed destination was kept and temporary recovery files were cleaned."
                .to_string(),
        )
    } else {
        (
            "partialRemoved",
            "The incomplete temporary destination was removed; the source and previous destination were kept.".to_string(),
        )
    };
    if errors.is_empty() {
        let _ = std::fs::remove_file(journal_path);
    }
    OperationRecoveryReport {
        operation_id: journal.operation_id.clone(),
        operation: journal.operation.clone(),
        source: journal.source.clone(),
        destination: journal.target.clone(),
        outcome: outcome.to_string(),
        detail,
        completed_items: None,
        total_items: None,
    }
}

#[tauri::command(async)]
pub fn recover_interrupted_operations(
    app: tauri::AppHandle,
) -> Result<Vec<OperationRecoveryReport>, String> {
    let directory = operation_journal_dir(&app)?;
    let mut reports = Vec::new();
    for entry in std::fs::read_dir(&directory)
        .map_err(|error| format!("Cannot read operation journal: {error}"))?
    {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                reports.push(OperationRecoveryReport {
                    operation_id: "unknown".to_string(),
                    operation: "unknown".to_string(),
                    source: String::new(),
                    destination: String::new(),
                    outcome: "recoveryFailed".to_string(),
                    detail: error.to_string(),
                    completed_items: None,
                    total_items: None,
                });
                continue;
            }
        };
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let payload = match std::fs::read(&path) {
            Ok(payload) => payload,
            Err(error) => {
                reports.push(OperationRecoveryReport {
                    operation_id: name,
                    operation: "unknown".to_string(),
                    source: String::new(),
                    destination: String::new(),
                    outcome: "recoveryFailed".to_string(),
                    detail: error.to_string(),
                    completed_items: None,
                    total_items: None,
                });
                continue;
            }
        };
        if name.starts_with("transfer-") {
            match serde_json::from_slice::<TransferJournal>(&payload) {
                Ok(journal) => reports.push(recover_transfer_journal(&path, &journal)),
                Err(error) => reports.push(OperationRecoveryReport {
                    operation_id: name,
                    operation: "unknown".to_string(),
                    source: String::new(),
                    destination: String::new(),
                    outcome: "recoveryFailed".to_string(),
                    detail: format!("Unreadable transfer journal: {error}"),
                    completed_items: None,
                    total_items: None,
                }),
            }
        } else if name.starts_with("delete-") {
            match serde_json::from_slice::<DeleteJournal>(&payload) {
                Ok(journal) => {
                    let outcome = if journal.operation == "deletePermanent" {
                        "permanentDeleteInterrupted"
                    } else {
                        "recycleDeleteInterrupted"
                    };
                    let current = journal.current.clone().unwrap_or_default();
                    reports.push(OperationRecoveryReport {
                        operation_id: journal.operation_id,
                        operation: journal.operation,
                        source: current,
                        destination: String::new(),
                        outcome: outcome.to_string(),
                        detail: format!(
                            "{} of {} selected items were completed before RHFiles stopped.",
                            journal.completed.len(),
                            journal.paths.len()
                        ),
                        completed_items: Some(journal.completed.len()),
                        total_items: Some(journal.paths.len()),
                    });
                    let _ = std::fs::remove_file(path);
                }
                Err(error) => reports.push(OperationRecoveryReport {
                    operation_id: name,
                    operation: "delete".to_string(),
                    source: String::new(),
                    destination: String::new(),
                    outcome: "recoveryFailed".to_string(),
                    detail: format!("Unreadable delete journal: {error}"),
                    completed_items: None,
                    total_items: None,
                }),
            }
        }
    }
    Ok(reports)
}

#[tauri::command]
pub fn cancel_operation(
    operation_id: Option<String>,
    cancel: tauri::State<'_, CancelFlag>,
) -> Result<(), String> {
    cancel.cancel(operation_id.as_deref())
}

#[tauri::command(async)]
pub fn get_dir_tree(path: String) -> Result<Vec<TreeEntry>, String> {
    let p = PathBuf::from(&path);
    let entries = enumerator::get_dir_tree(&p).map_err(|e| e.to_string())?;
    Ok(entries
        .iter()
        .map(|e| TreeEntry {
            name: e.name.clone(),
            path: e.path.to_string_lossy().into_owned(),
            has_children: enumerator::has_subdirs(&e.path),
            is_hidden: e.is_hidden,
        })
        .collect())
}

#[tauri::command(async)]
pub fn batch_rename(renames: Vec<(String, String)>) -> Result<Vec<String>, String> {
    let mut completed = Vec::new();
    for (old_path, new_name) in &renames {
        let p = PathBuf::from(old_path);
        let parent = p.parent().unwrap_or(&p);
        let new_path = parent.join(new_name);
        if p == new_path {
            continue;
        }
        if let Err(error) = std::fs::rename(&p, &new_path) {
            let mut rollback_errors = Vec::new();
            for (original, renamed) in completed.iter().rev() {
                if let Err(rollback_error) = std::fs::rename(renamed, original) {
                    rollback_errors.push(rollback_error.to_string());
                }
            }
            return Err(if rollback_errors.is_empty() {
                format!("{old_path}: {error}")
            } else {
                format!(
                    "{old_path}: {error}; rollback also failed: {}",
                    rollback_errors.join(" | ")
                )
            });
        }
        completed.push((p, new_path));
    }
    Ok(Vec::new())
}

#[tauri::command(async)]
pub fn get_file_info(path: String) -> Result<FileDetailInfo, String> {
    let p = PathBuf::from(&path);
    let metadata = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let extension = p
        .extension()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_default();
    let is_dir = metadata.is_dir();
    let size = metadata.len();
    // Recursive folder sizing can take minutes on large or network-backed trees.
    // Return the cheap metadata first; the properties dialog requests the size
    // separately and renders it when ready.
    let folder_size_val = None;
    Ok(FileDetailInfo {
        name,
        path: p.to_string_lossy().into_owned(),
        extension,
        is_dir,
        size,
        size_display: format_size(size),
        folder_size: folder_size_val,
        folder_size_display: folder_size_val.map(|s| format_size(s)),
        modified: format_time(
            metadata
                .modified()
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
        ),
        created: format_time(
            metadata
                .created()
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
        ),
        readonly: metadata.permissions().readonly(),
        attributes: if is_dir {
            "Directory".to_string()
        } else {
            "File".to_string()
        },
    })
}

#[tauri::command(async)]
pub fn folder_size(path: String) -> Result<u64, String> {
    enumerator::folder_size(&PathBuf::from(path))
}

#[tauri::command(async)]
pub fn create_shortcut(target: String, name: String, dest: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let dest_path = PathBuf::from(&dest);
        let lnk_path = dest_path.join(format!("{}.lnk", name));
        let target_str = target.replace("'", "''");
        let script = format!(
            "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('{}'); $sc.TargetPath = '{}'; $sc.Save()",
            lnk_path.to_string_lossy(),
            target_str
        );
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (target, name, dest);
        Err("Not supported".to_string())
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn same_file_is_detected_across_windows_path_casing() {
        let root = std::env::temp_dir().join(format!(
            "rhfiles-same-path-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let original = root.join("MixedCase.txt");
        let alternate = root.join("MIXEDCASE.TXT");
        std::fs::write(&original, b"same").unwrap();
        assert!(paths_resolve_to_same_entry(&original, &alternate));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "uses the Windows Recycle Bin"]
    fn deleted_file_can_be_restored_to_its_original_path() {
        let unique = format!(
            "rhfiles-recycle-undo-{}-{}.txt",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let path = std::env::temp_dir().join(unique);
        std::fs::write(&path, b"RHFiles undo test").unwrap();

        enumerator::delete_to_recycle_bin(&path).unwrap();
        assert!(!path.exists(), "test file should be in the Recycle Bin");
        restore_recycled_files_windows(vec![path.to_string_lossy().into_owned()]).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"RHFiles undo test");

        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn exact_move_round_trips_and_never_overwrites() {
        let root = std::env::temp_dir().join(format!(
            "rhfiles-exact-move-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let source = root.join("source.txt");
        let target = root.join("target.txt");
        std::fs::write(&source, b"source").unwrap();
        std::fs::write(&target, b"target").unwrap();

        assert!(
            move_path_exact(
                source.to_string_lossy().into_owned(),
                target.to_string_lossy().into_owned()
            )
            .is_err()
        );
        assert_eq!(std::fs::read(&source).unwrap(), b"source");
        assert_eq!(std::fs::read(&target).unwrap(), b"target");

        std::fs::remove_file(&target).unwrap();
        move_path_exact(
            source.to_string_lossy().into_owned(),
            target.to_string_lossy().into_owned(),
        )
        .unwrap();
        move_path_exact(
            target.to_string_lossy().into_owned(),
            source.to_string_lossy().into_owned(),
        )
        .unwrap();
        assert_eq!(std::fs::read(&source).unwrap(), b"source");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn permanent_delete_removes_files_and_folders_without_recycle_tracking() {
        let root = std::env::temp_dir().join(format!(
            "rhfiles-permanent-delete-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let file = root.join("file.txt");
        let folder = root.join("folder");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(&file, b"permanent").unwrap();
        std::fs::write(folder.join("nested.txt"), b"permanent").unwrap();

        let totals = scan_path(&root).unwrap();
        assert_eq!(totals.entries, 4);
        assert_eq!(totals.bytes, 18);
        enumerator::delete_permanently(&file).unwrap();
        enumerator::delete_permanently(&folder).unwrap();
        assert!(!file.exists());
        assert!(!folder.exists());

        std::fs::remove_dir(root).unwrap();
    }

    #[test]
    fn interrupted_copy_removes_staging_and_preserves_existing_destination() {
        let root = std::env::temp_dir().join(format!(
            "rhfiles-copy-recovery-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let source = root.join("source.txt");
        let target = root.join("target.txt");
        let staging = root.join("partial.tmp");
        let journal_file = root.join("journal.json");
        std::fs::write(&source, b"source").unwrap();
        std::fs::write(&target, b"previous").unwrap();
        std::fs::write(&staging, b"partial").unwrap();
        std::fs::write(&journal_file, b"journal").unwrap();
        let journal = TransferJournal {
            schema_version: 1,
            operation_id: "recovery-test".to_string(),
            operation: "copy".to_string(),
            source: source.to_string_lossy().into_owned(),
            target: target.to_string_lossy().into_owned(),
            staging: staging.to_string_lossy().into_owned(),
            backup: None,
            phase: "copying".to_string(),
        };

        let report = recover_transfer_journal(&journal_file, &journal);
        assert_eq!(report.outcome, "partialRemoved");
        assert_eq!(std::fs::read(&target).unwrap(), b"previous");
        assert!(source.exists());
        assert!(!staging.exists());
        assert!(!journal_file.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn interrupted_move_keeps_complete_source_and_destination() {
        let root = std::env::temp_dir().join(format!(
            "rhfiles-move-recovery-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        let source = root.join("source.txt");
        let target = root.join("target.txt");
        let staging = root.join("missing-partial.tmp");
        let backup = root.join("backup.tmp");
        let journal_file = root.join("journal.json");
        std::fs::write(&source, b"source").unwrap();
        std::fs::write(&target, b"source").unwrap();
        std::fs::write(&backup, b"previous").unwrap();
        std::fs::write(&journal_file, b"journal").unwrap();
        let journal = TransferJournal {
            schema_version: 1,
            operation_id: "recovery-test".to_string(),
            operation: "move".to_string(),
            source: source.to_string_lossy().into_owned(),
            target: target.to_string_lossy().into_owned(),
            staging: staging.to_string_lossy().into_owned(),
            backup: Some(backup.to_string_lossy().into_owned()),
            phase: "targetCommitted".to_string(),
        };

        let report = recover_transfer_journal(&journal_file, &journal);
        assert_eq!(report.outcome, "moveKeptBoth");
        assert_eq!(std::fs::read(&source).unwrap(), b"source");
        assert_eq!(std::fs::read(&target).unwrap(), b"source");
        assert!(!backup.exists());
        assert!(!journal_file.exists());
        std::fs::remove_dir_all(root).unwrap();
    }
}
