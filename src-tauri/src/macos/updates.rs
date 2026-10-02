//! Never consume a Windows Velopack feed from the macOS application.
use serde_json::{Value, json};
#[tauri::command]
pub fn get_last_update_failure() -> Option<Value> { None }
#[tauri::command]
pub fn check_updates() -> Value {
    json!({"managed":false,"isPortable":true,"currentVersion":env!("CARGO_PKG_VERSION"),"availableVersion":null,"releaseNotes":"","pendingRestart":false})
}
#[tauri::command]
pub fn get_release_history() -> Result<Value,String> {
    let history:Value=serde_json::from_str(include_str!(concat!(env!("OUT_DIR"),"/release-history.json"))).map_err(|e|e.to_string())?;
    Ok(json!({"currentVersion":env!("CARGO_PKG_VERSION"),"releases":history["releases"],"source":"bundled","warning":null}))
}
#[tauri::command]
pub fn download_update() -> Result<String,String> { Err("macOS updates are installed from the macOS download, not Windows Update.exe. Signed automatic updates have not been configured.".into()) }
#[tauri::command]
pub fn apply_update() -> Result<(),String> { Err("Install the new RHFiles.app from the macOS release; user data stays in Application Support.".into()) }
