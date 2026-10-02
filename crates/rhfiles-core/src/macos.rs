use std::{ffi::{CStr, CString, c_char}, path::{Path, PathBuf}};
use serde_json::{Value, json};

unsafe extern "C" {
    fn rhfiles_macos_request(input: *const c_char) -> *mut c_char;
    fn rhfiles_macos_free(value: *mut c_char);
}

pub fn request(value: Value) -> Result<Value, String> {
    let input = CString::new(value.to_string()).map_err(|e| e.to_string())?;
    unsafe {
        let raw = rhfiles_macos_request(input.as_ptr());
        if raw.is_null() { return Err("macOS service returned no response".into()); }
        let data = CStr::from_ptr(raw).to_bytes().to_vec();
        rhfiles_macos_free(raw);
        let response: Value = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
        if let Some(error) = response.get("error").and_then(Value::as_str) { return Err(error.into()); }
        Ok(response["value"].clone())
    }
}

pub fn rename_exclusive(source: &Path, target: &Path) -> Result<(), String> {
    request(json!({"action":"rename", "path":source, "target":target})).map(|_| ())
}

fn trash_journal(path: &Path) -> Result<PathBuf, String> {
    use sha2::{Digest, Sha256};
    let root = PathBuf::from(std::env::var_os("HOME").ok_or("HOME unavailable")?)
        .join("Library/Application Support/RHFiles/trash");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root.join(format!("{:x}.json", Sha256::digest(path.as_os_str().as_encoded_bytes()))))
}

pub fn trash(path: &Path) -> Result<(), String> {
    static TRASH_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = TRASH_LOCK.lock().map_err(|e| e.to_string())?;
    if !path.is_absolute() || path.parent().is_none() { return Err("Cannot trash a filesystem root".into()); }
    let journal = trash_journal(path)?;
    // Secure a writable recovery record before asking the OS to move anything.
    let staged = journal.with_extension(format!("{}.pending", std::process::id()));
    let mut record = std::fs::OpenOptions::new().write(true).create(true).truncate(true).open(&staged).map_err(|e| e.to_string())?;
    let trashed = match request(json!({"action":"trash", "path":path})) {
        Ok(value) => value,
        Err(error) => { let _ = std::fs::remove_file(staged); return Err(error); }
    };
    use std::io::Write;
    record.write_all(json!({"original":path,"trashed":trashed}).to_string().as_bytes()).map_err(|e| format!("File is in Trash, but recovery record could not be saved: {e}"))?;
    record.sync_all().map_err(|e| e.to_string())?;
    std::fs::rename(staged, journal).map_err(|e| format!("File is in Trash; recovery record publication failed: {e}"))
}

pub fn restore(path: &Path) -> Result<(), String> {
    let journal = trash_journal(path)?;
    let record: Value = serde_json::from_slice(&std::fs::read(&journal).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if record["original"].as_str() != path.to_str() { return Err("Trash record does not match the requested path".into()); }
    let source = PathBuf::from(record["trashed"].as_str().ok_or("Missing Trash location")?);
    if !source.components().any(|part| part.as_os_str() == ".Trash" || part.as_os_str() == ".Trashes") {
        return Err("Recovery source is not a Trash location".into());
    }
    rename_exclusive(&source, path)?;
    std::fs::remove_file(journal).map_err(|e| e.to_string())
}

pub fn open(path: &Path) -> Result<(), String> {
    let status = std::process::Command::new("/usr/bin/open").arg("--").arg(path).status().map_err(|e| e.to_string())?;
    if status.success() { Ok(()) } else { Err(format!("macOS could not open {}: {status}", path.display())) }
}
