use crate::types::*;
use std::collections::HashMap;


#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
pub fn get_cloud_status(path: String) -> Result<String, String> {
    use std::os::windows::fs::MetadataExt;
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let attrs = metadata.file_attributes();
    let path_lower = path.to_lowercase();
    let is_onedrive = path_lower.contains("onedrive");
    let is_gdrive = path_lower.contains("google drive") || path_lower.contains("my drive");
    if !is_onedrive && !is_gdrive {
        return Ok("none".to_string());
    }
    const FILE_ATTRIBUTE_OFFLINE: u32 = 0x00001000;
    const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x00400000;
    const FILE_ATTRIBUTE_PINNED: u32 = 0x00000080;
    const FILE_ATTRIBUTE_UNPINNED: u32 = 0x00100000;
    if attrs & FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS != 0 {
        Ok("syncing".to_string())
    } else if attrs & FILE_ATTRIBUTE_OFFLINE != 0 {
        if attrs & FILE_ATTRIBUTE_PINNED != 0 {
            Ok("syncing".to_string())
        } else {
            Ok("online_only".to_string())
        }
    } else if attrs & FILE_ATTRIBUTE_UNPINNED != 0 {
        Ok("locally_available".to_string())
    } else {
        Ok("synced".to_string())
    }
}

#[tauri::command]
pub fn get_cloud_providers() -> Result<Vec<CloudProvider>, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let root_path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\SyncRootManager";
    let root = hklm.open_subkey(root_path).map_err(|e| e.to_string())?;
    let mut providers = Vec::new();
    for child in root.enum_keys().flatten() {
        if let Ok(subkey) = root.open_subkey(&child) {
            let name: String = subkey.get_value("DisplayNameResource").unwrap_or_else(|_| {
                let parts: Vec<&str> = child.split('!').collect();
                parts.first().map(|s| s.to_string()).unwrap_or_default()
            });
            let user_path: Option<String> = subkey.open_subkey("UserSyncRoots")
                .ok()
                .and_then(|usr| {
                    let sids: Vec<String> = usr.enum_values().filter_map(|v| v.ok()).map(|(k, _)| k).collect();
                    sids.first().and_then(|sid| usr.get_value::<String, _>(sid).ok())
                });
            let icon_resource: String = subkey.get_value("IconResource").unwrap_or_else(|_| "".to_string());
            let (icon_dll, icon_index) = parse_icon_resource(&icon_resource);
            if let Some(sync_path) = user_path {
                let display_name = resolve_display_name(&name);
                providers.push(CloudProvider {
                    id: child.clone(),
                    name: display_name,
                    path: sync_path,
                    icon_dll,
                    icon_index,
                });
            }
        }
    }
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let ns_path = r"Software\Microsoft\Windows\CurrentVersion\Explorer\Desktop\NameSpace";
    if let Ok(ns_root) = hkcu.open_subkey(ns_path) {
        for clsid in ns_root.enum_keys().flatten() {
            if let Ok(clsid_key) = ns_root.open_subkey(&clsid) {
                let default_name: String = clsid_key.get_value("").unwrap_or_default();
                let path_lower = default_name.to_lowercase();
                if path_lower.contains("onedrive") || path_lower.contains("cloud") {
                    if let Ok(target) = clsid_key.open_subkey("Instance\\InitPropertyBag") {
                        if let Ok(target_path) = target.get_value::<String, _>("TargetFolderPath") {
                            let expanded = expand_env_var(&target_path);
                            if !expanded.is_empty() && !providers.iter().any(|p| p.path.eq_ignore_ascii_case(&expanded)) {
                                providers.push(CloudProvider {
                                    id: clsid.clone(),
                                    name: default_name,
                                    path: expanded,
                                    icon_dll: String::new(),
                                    icon_index: 0,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    if providers.is_empty() {
        let onedrive_env = std::env::var("OneDrive").ok();
        let onedrive_commercial = std::env::var("OneDriveCommercial").ok();
        if let Some(od_path) = onedrive_env {
            if std::path::Path::new(&od_path).exists() {
                providers.push(CloudProvider {
                    id: "OneDrive".to_string(),
                    name: "OneDrive".to_string(),
                    path: od_path,
                    icon_dll: String::new(),
                    icon_index: 0,
                });
            }
        }
        if let Some(od_path) = onedrive_commercial {
            if std::path::Path::new(&od_path).exists() && !providers.iter().any(|p| p.path.eq_ignore_ascii_case(&od_path)) {
                providers.push(CloudProvider {
                    id: "OneDriveCommercial".to_string(),
                    name: "OneDrive - ".to_string() + &std::path::Path::new(&od_path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                    path: od_path,
                    icon_dll: String::new(),
                    icon_index: 0,
                });
            }
        }
    }
    Ok(providers)
}

#[tauri::command]
pub fn cloud_pin_file(path: String) -> Result<(), String> {
    let output = std::process::Command::new("attrib")
        .args(["+p", &path])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("attrib +p failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

#[tauri::command]
pub fn cloud_unpin_file(path: String) -> Result<(), String> {
    let output = std::process::Command::new("attrib")
        .args(["+u", &path])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("attrib +u failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

#[tauri::command]
pub fn cloud_clear_pin(path: String) -> Result<(), String> {
    let output = std::process::Command::new("attrib")
        .args(["-p", &path])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("attrib -p failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

#[tauri::command]
pub fn get_cloud_file_size(path: String) -> Result<HashMap<String, u64>, String> {
    use std::os::windows::fs::MetadataExt;
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let attrs = metadata.file_attributes();
    let local_size = metadata.len();
    let mut result = HashMap::new();
    result.insert("local_size".to_string(), local_size);
    if attrs & 0x00001000 != 0 {
        result.insert("cloud_size".to_string(), 0);
        result.insert("is_placeholder".to_string(), 1);
    } else {
        result.insert("cloud_size".to_string(), local_size);
        result.insert("is_placeholder".to_string(), 0);
    }
    Ok(result)
}
