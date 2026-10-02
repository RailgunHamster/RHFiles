use crate::types::CloudProvider;
use std::{collections::HashMap, path::PathBuf};
#[tauri::command]
pub fn get_cloud_providers() -> Result<Vec<CloudProvider>, String> {
    let home = PathBuf::from(std::env::var_os("HOME").ok_or("HOME unavailable")?);
    let mut locations = vec![(
        "iCloud Drive".into(),
        home.join("Library/Mobile Documents/com~apple~CloudDocs"),
    )];
    if let Ok(entries) = std::fs::read_dir(home.join("Library/CloudStorage")) {
        locations.extend(
            entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| (e.file_name().to_string_lossy().into_owned(), e.path())),
        );
    }
    Ok(locations
        .into_iter()
        .filter(|(_, path)| path.is_dir())
        .map(|(name, path)| CloudProvider {
            id: path.to_string_lossy().into_owned(),
            name,
            path: path.to_string_lossy().into_owned(),
            icon_dll: String::new(),
            icon_index: 0,
        })
        .collect())
}
#[tauri::command]
pub fn get_cloud_status(path: String) -> Result<String, String> {
    std::fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    // Existence is not proof of synchronization; do not fabricate a green tick.
    Ok("none".into())
}
#[tauri::command]
pub fn get_cloud_file_size(path: String) -> Result<HashMap<String, u64>, String> {
    use std::os::unix::fs::MetadataExt;
    let m = std::fs::metadata(path).map_err(|e| e.to_string())?;
    Ok(HashMap::from([
        ("logical".into(), m.len()),
        ("physical".into(), m.blocks() * 512),
    ]))
}
#[tauri::command]
pub fn cloud_pin_file(path: String) -> Result<(), String> {
    Err(format!("Manage offline availability in Finder: {path}"))
}
#[tauri::command]
pub fn cloud_unpin_file(path: String) -> Result<(), String> {
    cloud_pin_file(path)
}
#[tauri::command]
pub fn cloud_clear_pin(path: String) -> Result<(), String> {
    cloud_pin_file(path)
}
