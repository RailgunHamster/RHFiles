//! The Windows window-hook is intentionally unavailable on macOS.
//! Do not request Accessibility permissions or pretend that a hook is running.
use serde_json::{Value, json};
pub fn initialize(_: tauri::AppHandle) -> Result<(), String> {
    Ok(())
}
#[tauri::command]
pub fn configure_file_dialog_integration() -> Value {
    get_file_dialog_integration_status()
}
#[tauri::command]
pub fn get_file_dialog_integration_status() -> Value {
    json!({"enabled":false,"running":false,"supported":false,"locationCount":0,"error":null})
}
#[tauri::command]
pub fn get_file_dialog_picker_state() -> Value {
    json!({"visible":false,"locations":[]})
}
#[tauri::command]
pub fn get_file_choice_session() -> Value {
    json!({"active":false})
}
#[tauri::command]
pub fn hide_file_dialog_picker() {}
#[tauri::command]
pub fn set_file_dialog_picker_compact() -> Value {
    get_file_dialog_picker_state()
}
#[tauri::command]
pub fn disable_file_dialog_integration() {}
#[tauri::command]
pub fn cancel_file_choice() {}
#[tauri::command]
pub fn begin_file_choice_in_rhfiles() -> Result<(), String> {
    Err("Windows dialog integration is not available on macOS".into())
}
#[tauri::command]
pub fn choose_files_in_file_dialog() -> Result<(), String> {
    begin_file_choice_in_rhfiles()
}
#[tauri::command]
pub fn navigate_file_dialog_location() -> Result<(), String> {
    begin_file_choice_in_rhfiles()
}
#[tauri::command]
pub fn open_explorer_location_in_rhfiles() -> Result<(), String> {
    begin_file_choice_in_rhfiles()
}
