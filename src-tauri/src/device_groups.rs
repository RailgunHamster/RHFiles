//! Local administration only; no network route may clear a local refusal.
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
use rhfiles_service::{
    Permissions,
    groups::{Packet, Signed},
};
use serde_json::{Value, json};
fn clean_device_name(value: &str) -> Option<String> {
    let mut name = String::new();
    for ch in value.trim().chars().filter(|ch| !ch.is_control()) {
        if name.len() + ch.len_utf8() > 120 {
            break;
        }
        name.push(ch);
    }
    let name = name.trim();
    (!name.is_empty()).then(|| name.to_owned())
}
fn default_device_name() -> String {
    #[cfg(windows)]
    if let Some(name) = std::env::var("COMPUTERNAME")
        .ok()
        .and_then(|v| clean_device_name(&v))
    {
        return name;
    }
    #[cfg(not(windows))]
    {
        // Local kernel hostname only: never resolve DNS or open a network path.
        let mut bytes = [0u8; 256];
        if unsafe { libc::gethostname(bytes.as_mut_ptr().cast(), bytes.len()) } == 0 {
            let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
            if let Some(name) = clean_device_name(&String::from_utf8_lossy(&bytes[..end])) {
                return name;
            }
        }
    }
    std::env::var("HOSTNAME")
        .ok()
        .and_then(|v| clean_device_name(&v))
        .unwrap_or_else(|| "Computer".into())
}
fn field<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("缺少参数 {key}"))
}
fn permissions(v: &Value) -> Result<Permissions, String> {
    serde_json::from_value(v.get("permissions").cloned().unwrap_or(json!({})))
        .map_err(|e| e.to_string())
}
fn decode<T: serde::de::DeserializeOwned>(uri: &str, prefix: &str) -> Result<T, String> {
    if uri.len() > 360000 {
        return Err("设备组信息过大".into());
    }
    let bytes = B64
        .decode(
            uri.trim()
                .strip_prefix(prefix)
                .ok_or("设备组信息类型不正确")?,
        )
        .map_err(|_| "设备组编码无效")?;
    serde_json::from_slice(&bytes).map_err(|_| "设备组信息结构无效".into())
}
fn encoded(prefix: &str, value: impl serde::Serialize) -> Result<Value, String> {
    let uri = format!(
        "{prefix}{}",
        B64.encode(serde_json::to_vec(&value).map_err(|e| e.to_string())?)
    );
    let qr = qrcode::QrCode::with_error_correction_level(uri.as_bytes(), qrcode::EcLevel::L)
        .ok()
        .map(|q| {
            q.render::<qrcode::render::svg::Color>()
                .min_dimensions(280, 280)
                .build()
        });
    Ok(json!({"uri":uri,"qrSvg":qr}))
}
#[tauri::command]
pub async fn device_groups(command: String, args: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run(&command, &args))
        .await
        .map_err(|e| e.to_string())?
}
fn run(command: &str, args: &Value) -> Result<Value, String> {
    let groups = crate::lan_service::groups()?;
    let result = (|| -> rhfiles_service::Result<Value> {
        Ok(match command {
            "state" => {
                let mut state = groups.state()?;
                state["defaultDeviceName"] = Value::String(default_device_name());
                state
            }
            "create" => json!(groups.create(
                field(args, "name").map_err(err)?,
                field(args, "deviceName").map_err(err)?,
                permissions(args).map_err(err)?
            )?),
            "request" => {
                return encoded(
                    "rhfiles-group-request:v1:",
                    groups.request(field(args, "deviceName").map_err(err)?)?,
                )
                .map_err(err);
            }
            "approve" => {
                let request: Signed = decode(
                    field(args, "uri").map_err(err)?,
                    "rhfiles-group-request:v1:",
                )
                .map_err(err)?;
                return encoded(
                    "rhfiles-group-approval:v1:",
                    groups.approve(
                        field(args, "id").map_err(err)?,
                        &request,
                        args.get("canInvite")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    )?,
                )
                .map_err(err);
            }
            "join" => {
                if args.get("confirmed") != Some(&Value::Bool(true)) {
                    return Err(err("请在本机确认信任入组证明的来源"));
                }
                let packet: Packet = decode(
                    field(args, "uri").map_err(err)?,
                    "rhfiles-group-approval:v1:",
                )
                .map_err(err)?;
                json!(groups.join(packet, permissions(args).map_err(err)?)?)
            }
            "export" => {
                return encoded(
                    "rhfiles-group-approval:v1:",
                    groups.packet(field(args, "id").map_err(err)?)?,
                )
                .map_err(err);
            }
            "remove" => {
                groups.remove(
                    field(args, "id").map_err(err)?,
                    field(args, "peer").map_err(err)?,
                )?;
                Value::Bool(true)
            }
            "restore" => {
                groups.restore(
                    field(args, "id").map_err(err)?,
                    field(args, "peer").map_err(err)?,
                    args.get("confirmed") == Some(&Value::Bool(true)),
                )?;
                Value::Bool(true)
            }
            "configure" => {
                groups.configure(
                    field(args, "id").map_err(err)?,
                    args.get("enabled") == Some(&Value::Bool(true)),
                    permissions(args).map_err(err)?,
                )?;
                Value::Bool(true)
            }
            _ => return Err(err("未知设备组操作")),
        })
    })();
    let result = result.map_err(|e| e.to_string())?;
    if matches!(command, "create" | "join") {
        crate::lan_service::advertise_groups()?;
    }
    Ok(result)
}
fn err(message: impl Into<String>) -> rhfiles_service::Error {
    rhfiles_service::Error::new("invalid_group", message)
}

#[cfg(test)]
mod name_tests {
    use super::*;
    #[test]
    fn system_names_are_safe_and_within_the_signed_name_limit() {
        assert_eq!(
            clean_device_name("  WINSERVER  ").as_deref(),
            Some("WINSERVER")
        );
        assert_eq!(clean_device_name(" \r\n\0 "), None);
        assert_eq!(clean_device_name("我的\n电脑").as_deref(), Some("我的电脑"));
        for value in ["a".repeat(200), "中".repeat(100), "🖥️".repeat(100)] {
            let name = clean_device_name(&value).unwrap();
            assert!(name.len() <= 120);
            assert!(!name.chars().any(char::is_control));
            assert!(name.is_char_boundary(name.len()));
        }
    }
    #[test]
    fn local_machine_name_is_nonempty_without_network_access() {
        let name = default_device_name();
        assert!(!name.trim().is_empty());
        assert!(name.len() <= 120);
        #[cfg(windows)]
        if let Some(expected) = std::env::var("COMPUTERNAME")
            .ok()
            .and_then(|v| clean_device_name(&v))
        {
            assert_eq!(name, expected);
        }
    }
}
