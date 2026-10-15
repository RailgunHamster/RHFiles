//! Same IPC/transport implementation for Windows and Android, lazy/opt-in only.
use rhfiles_transfer::{Peer, Service, Status};
use std::{
    path::PathBuf,
    sync::{Mutex, OnceLock},
};
static SERVICE: OnceLock<Mutex<Option<Service>>> = OnceLock::new();
fn slot() -> &'static Mutex<Option<Service>> {
    SERVICE.get_or_init(|| Mutex::new(None))
}
fn service() -> Result<Service, String> {
    slot()
        .lock()
        .map_err(|_| "互传状态不可用")?
        .clone()
        .ok_or_else(|| "请先开启附近互传".into())
}
fn local(value: String) -> Result<PathBuf, String> {
    let path = PathBuf::from(&value);
    let unc = value.starts_with("//")
        || (value.starts_with("\\\\") && !value.starts_with("\\\\?\\"))
        || value.to_ascii_lowercase().starts_with("\\\\?\\unc\\");
    if !path.is_absolute() || unc {
        return Err("首版互传请选择本机文件或文件夹，不支持 SMB / SAF / 网盘位置".into());
    }
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    #[cfg(feature = "android-shell")]
    if !path.starts_with("/storage") {
        return Err("仅允许共享存储中的本机文件；网络或授权位置请先下载".into());
    }
    Ok(path)
}
#[tauri::command]
pub async fn nearby_start<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    alias: String,
) -> Result<Status, String> {
    #[cfg(feature = "android-shell")]
    let data = crate::app_data_dir(&app).join("nearby-v1");
    #[cfg(not(feature = "android-shell"))]
    let data = {
        let _ = app;
        crate::profile::data_dir()?.join("nearby-v1")
    };
    tauri::async_runtime::spawn_blocking(move || {
        let mut current = slot().lock().map_err(|_| "互传状态不可用")?;
        if let Some(service) = current.as_ref() {
            if service.status().running {
                return Ok(service.status());
            }
        }
        let instance = Service::start(data, alias, rhfiles_transfer::PORT, true)?;
        let status = instance.status();
        *current = Some(instance);
        Ok(status)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn nearby_status() -> Result<Option<Status>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        Ok(slot()
            .lock()
            .map_err(|_| "互传状态不可用")?
            .as_ref()
            .map(Service::status))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn nearby_stop() {
    if let Ok(current) = slot().lock() {
        if let Some(service) = current.as_ref() {
            service.stop();
        }
    }
}
#[tauri::command]
pub async fn nearby_probe(address: String) -> Result<Peer, String> {
    let service = service()?;
    tauri::async_runtime::spawn_blocking(move || service.probe(&address))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn nearby_send(
    peer_id: String,
    confirmed_fingerprint: String,
    sources: Vec<String>,
) -> Result<String, String> {
    let service = service()?;
    tauri::async_runtime::spawn_blocking(move || {
        let sources = sources
            .into_iter()
            .map(local)
            .collect::<Result<Vec<_>, _>>()?;
        service.send(&peer_id, &confirmed_fingerprint, sources)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn nearby_accept(id: String, destination: String) -> Result<(), String> {
    let service = service()?;
    tauri::async_runtime::spawn_blocking(move || service.accept(&id, local(destination)?))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn nearby_cancel(id: String) -> Result<(), String> {
    service()?.cancel(&id)
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_railgunhamster_rhfiles_NearbyService_stopNative(
    _env: *mut std::ffi::c_void,
    _object: *mut std::ffi::c_void,
) {
    nearby_stop();
}
#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_railgunhamster_rhfiles_NearbyService_hasActiveNative(
    _env: *mut std::ffi::c_void,
    _object: *mut std::ffi::c_void,
) -> u8 {
    slot()
        .try_lock()
        .ok()
        .and_then(|service| service.as_ref().map(Service::transferring))
        .unwrap_or(false) as u8
}
