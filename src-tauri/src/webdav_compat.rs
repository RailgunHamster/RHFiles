//! Device-local Tailscale certificate configuration; never exported or synced.
use serde::{Deserialize, Serialize};
use std::{
    io::Read,
    path::PathBuf,
    process::{Command, Stdio},
};
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    enabled: bool,
    domain: String,
    port: u16,
}
fn config_path() -> Result<PathBuf, String> {
    Ok(crate::profile::data_dir()?.join("lan-service-v1/webdav-compat.json"))
}
fn config() -> Result<Config, String> {
    match std::fs::read(config_path()?) {
        Ok(b) if b.len() <= 4096 => {
            serde_json::from_slice(&b).map_err(|_| "WebDAV 兼容配置损坏".into())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Config::default()),
        _ => Err("无法读取 WebDAV 兼容配置".into()),
    }
}
fn save(value: &Config) -> Result<(), String> {
    use std::io::Write;
    let path = config_path()?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let mut file =
        tempfile::NamedTempFile::new_in(path.parent().unwrap()).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec(value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
fn tailscale(args: &[&std::ffi::OsStr], timeout: u64) -> Result<Vec<u8>, String> {
    #[cfg(windows)]
    let executable = PathBuf::from(std::env::var_os("ProgramFiles").ok_or("找不到 Program Files")?)
        .join("Tailscale/tailscale.exe");
    #[cfg(not(windows))]
    let executable = PathBuf::from("/usr/bin/tailscale");
    if !executable.is_file() {
        return Err("请先安装并连接 Tailscale / Install and connect Tailscale first".into());
    }
    let mut command = Command::new(executable);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let out = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout.take(262145).read_to_end(&mut bytes);
        (result, bytes)
    });
    let err = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stderr.take(16385).read_to_end(&mut bytes);
        bytes
    });
    let until = std::time::Instant::now() + std::time::Duration::from_secs(timeout);
    let status = loop {
        match child.try_wait() {
            Ok(Some(code)) => break Ok(code),
            Ok(None) if std::time::Instant::now() < until => {
                std::thread::sleep(std::time::Duration::from_millis(100))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break Err("Tailscale 操作超时；已结束本次进程，未修改原有设备组入口".to_owned());
            }
        }
    };
    let (read, bytes) = out.join().map_err(|_| "无法读取 Tailscale 输出")?;
    let errors = err.join().unwrap_or_default();
    let status = status?;
    if !status.success() {
        return Err(format!(
            "Tailscale HTTPS 配置失败 / HTTPS setup failed: {}",
            String::from_utf8_lossy(&errors[..errors.len().min(4096)])
        ));
    }
    read.map_err(|e| e.to_string())?;
    if bytes.len() > 262144 {
        return Err("Tailscale 状态过大".into());
    }
    Ok(bytes)
}
fn certificate(config: &Config) -> Result<(PathBuf, PathBuf), String> {
    if !config.domain.ends_with(".ts.net")
        || !config
            .domain
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
    {
        return Err("无效 Tailscale 域名".into());
    }
    let root = crate::profile::user_root()?.join("webdav-tls-v1");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let cert = root.join(format!("{}.crt", config.domain));
    let key = root.join(format!("{}.key", config.domain));
    tailscale(
        &[
            "cert".as_ref(),
            "--min-validity=168h".as_ref(),
            "--cert-file".as_ref(),
            cert.as_os_str(),
            "--key-file".as_ref(),
            key.as_os_str(),
            config.domain.as_ref(),
        ],
        90,
    )?;
    Ok((cert, key))
}
pub fn restore(service: &rhfiles_service::Service) -> Result<(), String> {
    let value = config()?;
    if value.enabled {
        let (cert, key) = certificate(&value)?;
        service
            .enable_webdav_compatibility(&value.domain, value.port, &cert, &key)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn settings() -> Result<serde_json::Value, String> {
    serde_json::to_value(config()?).map_err(|e| e.to_string())
}
pub fn action(
    service: &rhfiles_service::Service,
    action: &str,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    match action {
        "enable" => {
            if args["confirmed"].as_bool() != Some(true) {
                return Err("需要确认：本机 ts.net 域名将出现在公开的证书透明度日志中".into());
            }
            let status: serde_json::Value =
                serde_json::from_slice(&tailscale(&["status".as_ref(), "--json".as_ref()], 10)?)
                    .map_err(|_| "无效 Tailscale 状态")?;
            if status["BackendState"] != "Running" {
                return Err("请先连接 Tailscale".into());
            }
            let domain = status["Self"]["DNSName"]
                .as_str()
                .ok_or("Tailscale 尚未提供 HTTPS 域名")?
                .trim_end_matches('.')
                .to_ascii_lowercase();
            let port = args["port"].as_u64().unwrap_or(39129);
            if port == 0 || port > 65535 {
                return Err("端口无效".into());
            }
            let value = Config {
                enabled: true,
                domain,
                port: port as u16,
            };
            let (cert, key) = certificate(&value)?;
            let result = service
                .enable_webdav_compatibility(&value.domain, value.port, &cert, &key)
                .map_err(|e| e.to_string())?;
            if let Err(e) = save(&value) {
                service.disable_webdav_compatibility();
                return Err(e);
            }
            Ok(result)
        }
        "disable" => {
            let mut value = config()?;
            value.enabled = false;
            save(&value)?;
            service.disable_webdav_compatibility();
            Ok(serde_json::json!({"enabled":false}))
        }
        "credentials" | "revoke" => {
            let group = args["group"].as_str().ok_or("缺少设备组")?;
            let peer = args["peer"].as_str().ok_or("缺少组成员")?;
            if action == "credentials" {
                service
                    .webdav_credentials(group, peer)
                    .map_err(|e| e.to_string())
            } else {
                service
                    .revoke_webdav_credentials(group, peer)
                    .map_err(|e| e.to_string())?;
                Ok(serde_json::json!({"revoked":true}))
            }
        }
        _ => Err("不支持的 WebDAV 兼容操作".into()),
    }
}
