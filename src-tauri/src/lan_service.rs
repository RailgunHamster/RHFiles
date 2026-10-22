//! Local-only administration. Network clients cannot change roots or grants.
use rhfiles_service::{Permissions, Service, ShareConfig};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{Arc, Mutex, OnceLock},
};

static SERVICE: OnceLock<Mutex<Option<Service>>> = OnceLock::new();
static STARTUP_ERROR: Mutex<Option<String>> = Mutex::new(None);
fn slot() -> &'static Mutex<Option<Service>> {
    SERVICE.get_or_init(|| Mutex::new(None))
}
fn directory() -> Result<std::path::PathBuf, String> {
    Ok(crate::profile::data_dir()?.join("lan-service-v1"))
}
static GROUPS: OnceLock<Mutex<Option<Arc<rhfiles_service::groups::Groups>>>> = OnceLock::new();
pub(crate) fn groups() -> Result<Arc<rhfiles_service::groups::Groups>, String> {
    let mut slot = GROUPS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| "设备组状态不可用")?;
    if let Some(groups) = &*slot {
        return Ok(groups.clone());
    }
    let groups =
        Arc::new(rhfiles_service::groups::Groups::open(&directory()?).map_err(|e| e.to_string())?);
    *slot = Some(groups.clone());
    Ok(groups)
}
pub(crate) fn advertise_groups() -> Result<(), String> {
    if let Some(service) = slot().lock().map_err(|_| "服务状态不可用")?.as_ref() {
        service.advertise_group_host().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    #[serde(default)]
    shares: Vec<ShareConfig>,
    #[serde(default = "port")]
    port: u16,
    #[serde(default)]
    auto_start: bool,
}
fn port() -> u16 {
    39128
}
impl Default for Config {
    fn default() -> Self {
        Self {
            shares: vec![],
            port: port(),
            auto_start: false,
        }
    }
}
fn read_config(path: &Path) -> Result<Config, String> {
    match std::fs::read(path.join("config.json")) {
        Ok(bytes) if bytes.len() <= 262144 => serde_json::from_slice(&bytes)
            .map_err(|e| format!("文件服务配置损坏 / Invalid service configuration: {e}")),
        Ok(_) => Err("文件服务配置过大 / Service configuration is too large".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Config::default()),
        Err(e) => Err(e.to_string()),
    }
}
fn save_config(path: &Path, config: &Config) -> Result<(), String> {
    use std::io::Write;
    std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(path).map_err(|e| e.to_string())?;
    temporary
        .write_all(&serde_json::to_vec_pretty(config).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary
        .persist(path.join("config.json"))
        .map_err(|e| e.to_string())?;
    Ok(())
}
fn start(config: Config) -> Result<rhfiles_service::Status, String> {
    let mut service = slot().lock().map_err(|_| "服务状态不可用")?;
    if service.as_ref().is_some_and(|s| s.status().running) {
        return Err("请先停止文件服务，再更改共享或端口".into());
    }
    service.take();
    let directory = directory()?;
    let running = Service::start_grouped(
        &directory,
        config.shares.clone(),
        ([0, 0, 0, 0], config.port).into(),
        &[crate::profile::user_root()?],
        groups()?,
    )
    .map_err(|e| e.to_string())?;
    save_config(&directory, &config)?;
    let status = running.status();
    *service = Some(running);
    *STARTUP_ERROR.lock().map_err(|_| "服务状态不可用")? = None;
    Ok(status)
}

/// Restore independently of the WebView; startup errors stay visible in settings.
pub(crate) fn restore_if_enabled() {
    let result = (|| {
        let config = read_config(&directory()?)?;
        if config.auto_start
            && !slot()
                .lock()
                .map_err(|_| "服务状态不可用")?
                .as_ref()
                .is_some_and(|s| s.status().running)
        {
            start(config)?;
        }
        Ok::<_, String>(())
    })();
    if let Err(error) = result {
        eprintln!("RHFiles LAN service auto-start failed: {error}");
        if let Ok(mut state) = STARTUP_ERROR.lock() {
            *state = Some(error);
        }
    }
}

#[tauri::command]
pub async fn lan_service_state() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let config=read_config(&directory()?)?;
        let startup_error=STARTUP_ERROR.lock().map_err(|_|"服务状态不可用")?.clone();
        let status=slot().lock().map_err(|_|"服务状态不可用")?.as_ref().map(Service::status);
        Ok(serde_json::json!({"config":config,
            "startup":{"supported":crate::lan_startup::supported(),"loginEnabled":crate::lan_startup::entry()?.is_some()},
            "startupError":startup_error,"status":status}))
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn lan_service_start(config: Config) -> Result<rhfiles_service::Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Listener start/stop must not silently reset startup preferences.
        let mut config = config;
        config.auto_start = read_config(&directory()?)?.auto_start;
        start(config)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn lan_service_startup(auto_start: bool, login: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = slot().lock().map_err(|_| "服务状态不可用")?;
        if login && !auto_start {
            return Err(
                "登录启动必须同时启用恢复服务 / Enable service restore before login startup".into(),
            );
        }
        let directory = directory()?;
        let mut config = read_config(&directory)?;
        if auto_start && config.shares.is_empty() {
            return Err(
                "请先添加共享并成功启动一次 / Configure and start shared folders first".into(),
            );
        }
        let previous = crate::lan_startup::entry()?;
        let desired = if login {
            Some(crate::lan_startup::desired_entry()?)
        } else {
            None
        };
        crate::lan_startup::write_entry(desired.as_deref())?;
        config.auto_start = auto_start;
        if let Err(error) = save_config(&directory, &config) {
            if let Err(rollback) = crate::lan_startup::write_entry(previous.as_deref()) {
                return Err(format!(
                    "{error}; 恢复登录启动设置也失败 / Startup rollback also failed: {rollback}"
                ));
            }
            return Err(error);
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn lan_service_stop() -> Result<(), String> {
    slot().lock().map_err(|_| "服务状态不可用")?.take();
    Ok(())
}
#[tauri::command]
pub async fn lan_service_drives() -> Result<Vec<ShareConfig>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        {
            use windows::Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives};
            use windows::core::PCWSTR;
            let mask = unsafe { GetLogicalDrives() };
            let mut roots = Vec::new();
            for i in 0..26 {
                if mask & (1 << i) == 0 {
                    continue;
                }
                let letter = (b'A' + i) as char;
                let path = format!("{letter}:\\");
                let wide = path.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
                // Filter locally before opening any root or asking for volume
                // information: mapped/network drives can block the redirector.
                if matches!(unsafe { GetDriveTypeW(PCWSTR(wide.as_ptr())) }, 2 | 3) {
                    roots.push(ShareConfig {
                        name: letter.to_string(),
                        path: path.into(),
                    });
                }
            }
            Ok(roots)
        }
        #[cfg(not(windows))]
        Err("请手动添加本机目录 / Add local folders manually on this platform".into())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn lan_service_pair(
    permissions: Permissions,
) -> Result<rhfiles_service::Pairing, String> {
    slot()
        .lock()
        .map_err(|_| "服务状态不可用")?
        .as_ref()
        .ok_or("文件服务尚未启动")?
        .pairing(permissions)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn lan_service_credential(
    name: String,
    permissions: Permissions,
) -> Result<rhfiles_service::Credential, String> {
    slot()
        .lock()
        .map_err(|_| "服务状态不可用")?
        .as_ref()
        .ok_or("文件服务尚未启动")?
        .credential(&name, permissions)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn lan_service_revoke(id: String) -> Result<(), String> {
    slot()
        .lock()
        .map_err(|_| "服务状态不可用")?
        .as_ref()
        .ok_or("文件服务尚未启动")?
        .revoke(&id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn lan_service_permissions(
    id: String,
    permissions: Permissions,
) -> Result<rhfiles_service::Device, String> {
    tauri::async_runtime::spawn_blocking(move || {
        slot()
            .lock()
            .map_err(|_| "服务状态不可用")?
            .as_ref()
            .ok_or("文件服务尚未启动")?
            .set_permissions(&id, permissions)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_config_is_opt_in_and_uses_the_correct_default_port() {
        let config: Config = serde_json::from_str(r#"{"shares":[]}"#).unwrap();
        assert_eq!(config.port, 39128);
        assert!(!config.auto_start);
        assert_eq!(Config::default().port, 39128);
        assert!(serde_json::from_str::<Config>(r#"{"autoStart":true,"oops":1}"#).is_err());
    }
    #[test]
    fn atomic_config_roundtrip_and_corruption_is_not_silently_ignored() {
        let directory = tempfile::tempdir().unwrap();
        let mut config = read_config(directory.path()).unwrap();
        assert!(!config.auto_start);
        config.auto_start = true;
        save_config(directory.path(), &config).unwrap();
        assert!(read_config(directory.path()).unwrap().auto_start);
        config.auto_start = false;
        save_config(directory.path(), &config).unwrap();
        assert!(!read_config(directory.path()).unwrap().auto_start);
        std::fs::write(directory.path().join("config.json"), b"broken").unwrap();
        assert!(read_config(directory.path()).is_err());
    }
}
