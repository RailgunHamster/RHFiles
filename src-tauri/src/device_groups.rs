//! Local administration only; no network route may clear a local refusal.
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
use rhfiles_service::{
    Permissions,
    device_name::default_device_name,
    groups::{Packet, Signed},
};
use serde_json::{Value, json};
use tauri::Emitter;
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
pub async fn device_groups(
    command: String,
    args: Value,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    if command == "join"
        && field(&args, "uri")?
            .trim()
            .starts_with(rhfiles_service::connection::INVITATION_PREFIX)
    {
        let groups = crate::lan_service::groups()?;
        let id = rhfiles_service::connection::join_invitation(
            &groups,
            field(&args, "uri")?,
            &default_device_name(),
            args.get("confirmed") == Some(&Value::Bool(true)),
            permissions(&args)?,
        )
        .await?;
        connector()?.invalidate();
        // Membership is already committed and the invitation consumed. A local
        // service advertisement failure must not report that joining failed.
        if let Err(error) = crate::lan_service::advertise_groups() {
            eprintln!("Group joined; local service advertisement unavailable: {error}");
        }
        let _ = app.emit("device-groups-changed", ());
        return Ok(json!(id));
    }
    if command == "connect" {
        let connector = connector()?;
        let report = connector
            .connect(
                field(&args, "id")?,
                field(&args, "peer")?,
                args.get("endpoint")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                "manual",
            )
            .await;
        return serde_json::to_value(report).map_err(|e| e.to_string());
    }
    if command == "diagnostics" {
        return serde_json::to_value(connector()?.diagnostics()).map_err(|e| e.to_string());
    }
    if command == "refresh" {
        let result = refresh_services().await?;
        let _ = app.emit("device-groups-changed", ());
        return Ok(result);
    }
    if command == "cancel" {
        return Ok(json!(
            connector()?.cancel(field(&args, "id")?, field(&args, "peer")?)
        ));
    }
    let changed = matches!(
        command.as_str(),
        "create" | "join" | "remove" | "restore" | "forget" | "configure" | "setAlias"
    );
    let result = tauri::async_runtime::spawn_blocking(move || run(&command, &args))
        .await
        .map_err(|e| e.to_string())??;
    if changed {
        let _ = app.emit("device-groups-changed", ());
    }
    Ok(result)
}
pub(crate) fn connector() -> Result<std::sync::Arc<rhfiles_service::connection::Connector>, String>
{
    static INSTANCE: std::sync::OnceLock<std::sync::Arc<rhfiles_service::connection::Connector>> =
        std::sync::OnceLock::new();
    if let Some(v) = INSTANCE.get() {
        return Ok(v.clone());
    }
    let v = std::sync::Arc::new(rhfiles_service::connection::Connector::new(
        crate::lan_service::groups()?,
    ));
    Ok(INSTANCE.get_or_init(|| v).clone())
}

fn service_peers(state: &Value) -> Vec<(String, String, String)> {
    state["groups"].as_array().into_iter().flatten().flat_map(|group| {
        group["members"].as_array().into_iter().flatten().filter_map(|peer| {
            if peer["self"] == true || peer["blocked"] == true || !peer["server"].is_object() {
                return None;
            }
            Some((group["id"].as_str()?.to_owned(), peer["id"].as_str()?.to_owned(),
                peer["name"].as_str().unwrap_or("RHFiles").to_owned()))
        })
    }).collect()
}

/// One bounded publication after an explicit service start / sharing change.
/// An already running refresh coalesces this work; there is no timer or retry.
pub(crate) fn publish_service_records() {
    tauri::async_runtime::spawn(async {
        if let Err(error) = refresh_services().await {
            eprintln!("Service record exchange not completed: {error}");
        }
    });
}

/// Explicit signed membership exchange, not a recurring LAN scan. A snapshot
/// bounds work even when peers introduce further peers. Never invalidate file
/// leases, clear local refusals, enable sharing or change any permissions.
async fn refresh_services() -> Result<Value, String> {
    static REFRESH: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let _guard = REFRESH.try_lock().map_err(|_| "[refresh_busy] 已有设备刷新正在进行，请等待其完成")?;
    let groups = crate::lan_service::groups()?;
    // Re-advertise the local running service before exchanging public proofs.
    // This is not permission to start a stopped service or add shared roots.
    crate::lan_service::advertise_groups()?;
    let before = service_peers(&groups.state().map_err(|e| e.to_string())?);
    let connector = connector()?;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);
    let mut connected = 0;
    let mut errors = Vec::new();
    let mut budget_exhausted = before.len() > 32;
    for (id, peer, name) in before.iter().take(32) {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() { budget_exhausted = true; break; }
        // The normal manual connector already enforces signed identities,
        // private addresses, six attempts and a per-peer retry interval.
        match tokio::time::timeout(remaining, connector.connect(id, peer, None, "manual")).await {
            Ok(report) if report.outcome == "connected" => connected += 1,
            Ok(report) => errors.push(json!({"device":name,"group":id,"peer":peer,"code":report.outcome})),
            Err(_) => {
                errors.push(json!({"device":name,"group":id,"peer":peer,"code":"budget_exhausted"}));
                budget_exhausted = true;
                break;
            }
        }
    }
    let after = service_peers(&groups.state().map_err(|e| e.to_string())?);
    let discovered = after.iter().filter(|(id, peer, _)| !before.iter().any(|(g, p, _)| g == id && p == peer)).count();
    Ok(json!({"connected":connected,"locations":after.len(),"discovered":discovered,
        "errors":errors,"budgetExhausted":budget_exhausted,"budgetMs":30000,"maxPeers":32}))
}
fn run(command: &str, args: &Value) -> Result<Value, String> {
    let groups = crate::lan_service::groups()?;
    let result = (|| -> rhfiles_service::Result<Value> {
        Ok(match command {
            "invite" => {
                return crate::lan_service::group_invitation(
                    field(args, "id").map_err(err)?,
                    args.get("canInvite")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                )
                .map_err(err);
            }
            "state" => {
                let mut state = groups.state()?;
                state["defaultDeviceName"] = Value::String(default_device_name());
                state["deviceAliases"] = crate::config_sync::device_aliases();
                state
            }
            "setAlias" => {
                let peer = field(args, "peer").map_err(err)?;
                let alias = args.get("alias").and_then(Value::as_str);
                let aliases = crate::config_sync::save_device_alias(peer, alias).map_err(err)?;
                json!({"deviceAliases": aliases})
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
                if field(args, "uri")
                    .map_err(err)?
                    .trim()
                    .starts_with("rhfiles-group-request:v1:")
                {
                    return Err(err(
                        "这是入组请求，请交给已有成员批准，再将批准信息带回本机加入",
                    ));
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
            "forget" => {
                groups.forget(
                    field(args, "id").map_err(err)?,
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
    if matches!(
        command,
        "remove" | "restore" | "forget" | "configure" | "join"
    ) {
        connector()?.invalidate();
    }
    if matches!(command, "create" | "join") {
        crate::lan_service::advertise_groups()?;
    }
    if command == "configure" {
        // Settings have already been committed. A transient announcement error
        // must not pretend that grants were rolled back.
        if let Err(error) = crate::lan_service::advertise_groups() {
            eprintln!("Group settings saved; local service advertisement unavailable: {error}");
        }
        if crate::lan_service::is_running() {
            publish_service_records();
        }
    }
    Ok(result)
}
fn err(message: impl Into<String>) -> rhfiles_service::Error {
    rhfiles_service::Error::new("invalid_group", message)
}

#[cfg(test)]
mod name_tests {
    use super::*;
    use rhfiles_service::device_name::clean_device_name;
    #[test]
    fn refresh_candidates_exclude_self_removed_and_unadvertised_members_without_changing_grants() {
        let state = json!({"groups":[{"id":"group","enabled":false,"permissions":{"write":false,"delete":false},"members":[
            {"id":"self","name":"Local","self":true,"server":{}},
            {"id":"blocked","name":"Removed","blocked":true,"server":{}},
            {"id":"waiting","name":"No service","server":null},
            {"id":"peer","name":"CLAW","self":false,"blocked":false,"server":{}}
        ]}]});
        let original = state.clone();
        assert_eq!(service_peers(&state), vec![("group".into(),"peer".into(),"CLAW".into())]);
        assert_eq!(state, original);
    }
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
