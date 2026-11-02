//! Saved protocol locations share password-free configuration with Android.
//! Credentials/SSH trust never cross the JS bridge on reads or config sync.
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::Emitter;
static VAULT_LOCK: Mutex<()> = Mutex::new(());
#[derive(Default, Clone, Serialize, Deserialize)]
struct Secret {
    binding: String,
    password: String,
    pin: String,
}
fn err(e: impl ToString) -> String {
    e.to_string()
}
fn field<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v[key].as_str().ok_or_else(|| format!("Missing {key}"))
}
fn scope() -> Result<(PathBuf, Vec<u8>), String> {
    let dir = crate::profile::data_dir()?;
    std::fs::create_dir_all(&dir).map_err(err)?;
    let scope = format!(
        "RHFiles network locations v1\0{}",
        std::fs::canonicalize(&dir).map_err(err)?.display()
    )
    .into_bytes();
    Ok((dir.join("network-secrets.dpapi"), scope))
}
fn vault() -> Result<BTreeMap<String, Secret>, String> {
    let (path, scope) = scope()?;
    match std::fs::read(path) {
        Ok(data) => {
            serde_json::from_slice(&crate::config_sync::crypt(&data, &scope, false)?).map_err(err)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(e) => Err(err(e)),
    }
}
fn save_vault(v: &BTreeMap<String, Secret>) -> Result<(), String> {
    let (path, scope) = scope()?;
    let data = crate::config_sync::crypt(&serde_json::to_vec(v).map_err(err)?, &scope, true)?;
    let mut file =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("Invalid vault path")?).map_err(err)?;
    file.write_all(&data)
        .and_then(|_| file.as_file().sync_all())
        .map_err(err)?;
    file.persist(path).map_err(err)?;
    Ok(())
}
fn binding(c: &Value) -> String {
    let mut c = c.clone();
    if let Some(o) = c.as_object_mut() {
        o.remove("name");
    }
    format!("{:x}", Sha256::digest(c.to_string()))
}
fn saved(id: &str) -> Result<(Value, Secret), String> {
    let p = crate::config_sync::network_profiles()?
        .into_iter()
        .find(|p| p["id"] == id)
        .ok_or("[not_found] Network location removed")?;
    let c = p["config"].clone();
    let secret = vault()?
        .remove(id)
        .filter(|s| s.binding == binding(&c))
        .unwrap_or_default();
    Ok((c, secret))
}
fn id() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(err)?;
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    let s = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &s[..8],
        &s[8..12],
        &s[12..16],
        &s[16..20],
        &s[20..]
    ))
}
fn port(c: &Value) -> u16 {
    c["port"].as_u64().unwrap_or(match c["type"].as_str() {
        Some("sftp") => 22,
        Some("smb") => 445,
        _ => 21,
    }) as u16
}
fn path(value: &str) -> Result<String, String> {
    if value.len() > 27000
        || !value.starts_with('/')
        || value
            .split('/')
            .any(|p| p == ".." || p == "." || p.contains(['\\', '\0', '\r', '\n']))
    {
        return Err("[invalid_path] Invalid remote path".into());
    }
    Ok(value.into())
}
fn leaf(value: &str) -> Result<&str, String> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.contains(['/', '\\', '\0', '\r', '\n'])
    {
        Err("[invalid_path] Invalid filename".into())
    } else {
        Ok(value)
    }
}
fn join(parent: &str, name: &str) -> Result<String, String> {
    Ok(format!("{}/{}", parent.trim_end_matches('/'), leaf(name)?))
}
fn tcp(c: &Value) -> Result<std::net::TcpStream, String> {
    use std::net::ToSocketAddrs;
    let host = field(c, "host")?;
    let addresses = (host, port(c))
        .to_socket_addrs()
        .map_err(|e| format!("[dns] {e}"))?;
    let mut last = "No address returned".into();
    for addr in addresses.take(3) {
        match std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(4)) {
            Ok(s) => {
                s.set_read_timeout(Some(Duration::from_secs(15)))
                    .map_err(err)?;
                s.set_write_timeout(Some(Duration::from_secs(15)))
                    .map_err(err)?;
                return Ok(s);
            }
            Err(e) => last = e.to_string(),
        }
    }
    Err(format!("[connect_failed] {last}"))
}
fn ssh(c: &Value, s: &Secret, probe: bool) -> Result<(ssh2::Session, String), String> {
    let mut session = ssh2::Session::new().map_err(err)?;
    session.set_tcp_stream(tcp(c)?);
    session.set_timeout(15000);
    session
        .handshake()
        .map_err(|e| format!("[ssh_handshake] {e}"))?;
    let key = session
        .host_key()
        .ok_or("[ssh_host_key] Server did not provide a key")?
        .0;
    let fingerprint = format!(
        "SHA256:{}",
        B64.encode(Sha256::digest(key)).trim_end_matches('=')
    );
    if !probe {
        if s.pin.is_empty() {
            return Err(format!(
                "[ssh_host_key_required] 请确认服务器指纹 / Verify server fingerprint: {fingerprint}"
            ));
        }
        if s.pin != fingerprint {
            return Err("[ssh_host_key_changed] 服务器指纹已变化，未发送密码 / Host key changed; no password was sent".into());
        }
        session.userauth_password(c["username"].as_str().unwrap_or(""),&s.password).map_err(|_|"[authentication_required] SFTP 登录失败，请填写本机密码 / SFTP login failed; enter credentials on this device")?;
    }
    Ok((session, fingerprint))
}
fn info(name: &str, directory: bool, size: u64, modified: i64) -> Value {
    json!({"name":name,"path":name,"is_dir":directory,"is_hidden":false,"is_system":false,"is_dot":name.starts_with('.'),"size":size,"size_display":crate::types::format_size(size),"extension":if directory{""}else{name.rsplit_once('.').map(|(_,v)|v).unwrap_or("")},"modified":"","created":"","modified_ts":modified,"created_ts":0,"folder_size":null})
}

#[tauri::command]
pub async fn network_location(
    action: String,
    args: Value,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || command(&action, &args, &app))
        .await
        .map_err(err)?
}
fn command(action: &str, args: &Value, app: &tauri::AppHandle) -> Result<Value, String> {
    #[cfg(not(windows))]
    if action!="list"{return Err("[unsupported] Saved network locations require this platform's secure credential integration; no metadata or password was changed".into());}
    if !args.is_object() {
        return Err("Invalid arguments".into());
    }
    match action {
        "list" => {
            let _lock = VAULT_LOCK.lock().map_err(err)?;
            let secrets = vault()?;
            let profiles=crate::config_sync::network_profiles()?.into_iter().map(|p|{let id=p["id"].as_str().unwrap_or("");let secret=secrets.get(id).filter(|s|s.binding==binding(&p["config"]));json!({"id":id,"config":p["config"],"hasPassword":secret.is_some_and(|s|!s.password.is_empty()),"fingerprint":secret.map(|s|s.pin.as_str()).unwrap_or("")})}).collect::<Vec<_>>();
            Ok(json!({"profiles":profiles}))
        }
        "save" | "remove" => {
            let _lock = VAULT_LOCK.lock().map_err(err)?;
            let id = args["id"].as_str().map(str::to_owned).unwrap_or(id()?);
            let remove = action == "remove";
            let config = args["config"].clone();
            let mut v = vault()?;
            if !remove {
                let b = binding(&config);
                let old = v.remove(&id).filter(|s| s.binding == b).unwrap_or_default();
                let password = if args["clearPassword"] == true {
                    String::new()
                } else {
                    args["password"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .unwrap_or(&old.password)
                        .into()
                };
                if password.len() > 8192 {
                    return Err("Password too long".into());
                }
                v.insert(
                    id.clone(),
                    Secret {
                        binding: b,
                        password,
                        pin: args["fingerprint"]
                            .as_str()
                            .filter(|s| s.starts_with("SHA256:") && s.len() < 128)
                            .unwrap_or(&old.pin)
                            .into(),
                    },
                );
            } else {
                v.remove(&id);
            }
            // Validate metadata before storing any secret. Metadata errors cannot
            // result in a half-created visible profile.
            crate::config_sync::save_network_profile(json!({"id":id,"config":config}), remove)?;
            save_vault(&v)?;
            let _ = app.emit("config-sync-changed", json!({"networkLocations":true}));
            Ok(json!({"id":id}))
        }
        "probe" => {
            crate::config_sync::validate_network_config(&args["config"])?;
            if args["config"]["type"] != "sftp" {
                return Err("Only SFTP uses SSH fingerprints".into());
            }
            execute(
                args["config"].clone(),
                Secret::default(),
                "fingerprint",
                json!({}),
            )
        }
        "open" => {
            let (c, s) = saved(field(args, "id")?)?;
            if c["type"] == "smb" {
                if port(&c) != 445 || field(&c, "host")?.contains(':') {
                    return Err(
                        "Windows SMB requires port 445 and a hostname or IPv4 address".into(),
                    );
                }
                let host = field(&c, "host")?;
                let share = c["share"].as_str().unwrap_or("");
                let unc = format!(
                    "\\\\{host}{}",
                    if share.is_empty() {
                        String::new()
                    } else {
                        format!("\\{share}")
                    }
                );
                if !s.password.is_empty() {
                    #[cfg(windows)]
                    {
                        crate::network_io::execute_protocol(
                            host,
                            crate::network_io::Request::Protocol {
                                config: c.clone(),
                                password: s.password,
                                pin: String::new(),
                                action: "smb_connect".into(),
                                args: json!({}),
                            },
                        )?;
                    }
                }
                return Ok(json!({"path":unc}));
            }
            Ok(json!({"path":format!("remote://{}/",field(args,"id")?)}))
        }
        "fs" => {
            let (c, s) = saved(field(args, "id")?)?;
            let op = field(args, "operation")?;
            let mut a = args.clone();
            a["path"] = json!(path(args["path"].as_str().unwrap_or("/"))?);
            if op == "download" {
                let dest = PathBuf::from(field(args, "localPath")?);
                if !dest.is_absolute() || dest.to_string_lossy().contains("://") {
                    return Err("Invalid local destination".into());
                }
                let parent = dest.parent().ok_or("No local destination folder")?;
                let temp = tempfile::NamedTempFile::new_in(parent).map_err(err)?;
                a["localPath"] = json!(temp.path());
                let result = execute(c, s, op, a)?;
                temp.as_file().sync_all().map_err(err)?;
                temp.persist_noclobber(dest).map_err(err)?;
                return Ok(result);
            }
            execute(c, s, op, a)
        }
        _ => Err("Unknown network-location action".into()),
    }
}
fn execute(config: Value, secret: Secret, action: &str, args: Value) -> Result<Value, String> {
    #[cfg(windows)]
    {
        let host = config["host"]
            .as_str()
            .or(config["url"].as_str())
            .unwrap_or("network-location")
            .to_string();
        return crate::network_io::execute_protocol(
            &host,
            crate::network_io::Request::Protocol {
                config,
                password: secret.password,
                pin: secret.pin,
                action: action.into(),
                args,
            },
        );
    }
    #[cfg(not(windows))]
    dispatch(config, secret.password, secret.pin, action, args)
}
pub(crate) fn dispatch(
    config: Value,
    password: String,
    pin: String,
    action: &str,
    args: Value,
) -> Result<Value, String> {
    let secret = Secret {
        password,
        pin,
        ..Default::default()
    };
    let p = path(args["path"].as_str().unwrap_or("/"))?;
    match config["type"].as_str() {
        Some("sftp") => sftp(&config, &secret, action, &p, &args),
        Some("ftp" | "ftps") => ftp(&config, &secret, action, &p, &args),
        Some("webdav") => webdav(&config, &secret, action, &p, &args),
        Some("smb") if action == "smb_connect" => smb_connect(&config, &secret.password),
        _ => Err("Unsupported network protocol".into()),
    }
}
#[cfg(windows)]
fn smb_connect(c: &Value, password: &str) -> Result<Value, String> {
    use windows::{Win32::NetworkManagement::WNet::*, core::PCWSTR};
    let host = field(c, "host")?;
    let share = c["share"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("IPC$");
    if host
        .chars()
        .any(|c| c.is_control() || "/\\:@?# ".contains(c))
        || share.chars().any(|c| c.is_control() || "/\\:".contains(c))
    {
        return Err("Invalid SMB host/share".into());
    }
    let domain = c["domain"].as_str().unwrap_or("");
    let user = c["username"].as_str().unwrap_or("");
    let user = if domain.is_empty() {
        user.into()
    } else {
        format!("{domain}\\{user}")
    };
    if user.is_empty() || user.contains('\0') || password.contains('\0') {
        return Err(
            "[authentication_required] Enter SMB username and password on this device".into(),
        );
    }
    let unc = format!("\\\\{host}\\{share}");
    let mut remote: Vec<u16> = unc.encode_utf16().chain(Some(0)).collect();
    let username: Vec<u16> = user.encode_utf16().chain(Some(0)).collect();
    let mut pass: Vec<u16> = password.encode_utf16().chain(Some(0)).collect();
    let resource = NETRESOURCEW {
        dwType: RESOURCETYPE_ANY,
        lpRemoteName: windows::core::PWSTR(remote.as_mut_ptr()),
        ..Default::default()
    };
    let status = unsafe {
        WNetAddConnection2W(
            &resource,
            PCWSTR(pass.as_ptr()),
            PCWSTR(username.as_ptr()),
            CONNECT_TEMPORARY,
        )
    };
    pass.fill(0);
    if status.0 != 0 {
        return Err(format!(
            "[smb_{}] Windows 网络登录失败；未断开其他连接或重试。若为 1219，此主机已有其他账号连接。 / Windows network login failed; no other connection was disconnected.",
            status.0
        ));
    }
    Ok(json!({"connected":true}))
}
#[cfg(not(windows))]
fn smb_connect(_: &Value, _: &str) -> Result<Value, String> {
    Err("SMB login uses Windows network connections".into())
}
fn sftp(c: &Value, s: &Secret, action: &str, p: &str, a: &Value) -> Result<Value, String> {
    let (session, fingerprint) = ssh(c, s, action == "fingerprint")?;
    if action == "fingerprint" {
        return Ok(json!({"fingerprint":fingerprint}));
    }
    let fs = session.sftp().map_err(err)?;
    let target = Path::new(p);
    match action {
        "list" => {
            let mut list = Vec::new();
            for (path, stat) in fs.readdir(target).map_err(err)? {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                if name == "." || name == ".." {
                    continue;
                }
                list.push(info(
                    &name,
                    stat.is_dir(),
                    stat.size.unwrap_or(0),
                    stat.mtime.unwrap_or(0) as i64 * 1000,
                ));
                if list.len() > 100000 {
                    return Err("Directory exceeds 100,000 entries".into());
                }
            }
            Ok(json!(list))
        }
        "mkdir" => {
            fs.mkdir(target, 0o755).map_err(err)?;
            Ok(Value::Null)
        }
        "delete" => {
            if a["isDir"] == true {
                fs.rmdir(target)
            } else {
                fs.unlink(target)
            }
            .map_err(err)?;
            Ok(Value::Null)
        }
        "rename" => {
            let parent = p.rsplit_once('/').map(|(v, _)| v).unwrap_or("");
            let dest = join(parent, field(a, "newName")?)?;
            fs.rename(target, Path::new(&dest), Some(ssh2::RenameFlags::empty()))
                .map_err(err)?;
            Ok(Value::Null)
        }
        "download" => {
            let mut source = fs.open(target).map_err(err)?;
            let mut dest = std::fs::OpenOptions::new()
                .write(true)
                .open(field(a, "localPath")?)
                .map_err(err)?;
            std::io::copy(&mut source, &mut dest).map_err(err)?;
            dest.sync_all().map_err(err)?;
            Ok(Value::Null)
        }
        "upload" => {
            let mut source = std::fs::File::open(field(a, "localPath")?).map_err(err)?;
            let mut dest = fs
                .open_mode(
                    target,
                    ssh2::OpenFlags::WRITE | ssh2::OpenFlags::CREATE | ssh2::OpenFlags::EXCLUSIVE,
                    0o644,
                    ssh2::OpenType::File,
                )
                .map_err(err)?;
            std::io::copy(&mut source, &mut dest).map_err(err)?;
            if let Err(error) = dest.fsync() {
                if error.code() != ssh2::ErrorCode::SFTP(8) {
                    return Err(err(error));
                }
            }
            dest.close().map_err(err)?;
            Ok(Value::Null)
        }
        _ => Err("Unsupported SFTP operation".into()),
    }
}
fn ftp(c: &Value, s: &Secret, action: &str, p: &str, a: &Value) -> Result<Value, String> {
    use suppaftp::{NativeTlsConnector, NativeTlsFtpStream};
    if c["type"] == "ftp" && c["insecure"] != true {
        return Err("Plain FTP requires explicit consent".into());
    }
    let stream = NativeTlsFtpStream::connect_with_stream(tcp(c)?).map_err(err)?;
    let mut fs = if c["type"] == "ftps" {
        stream
            .into_secure(
                NativeTlsConnector::from(native_tls::TlsConnector::new().map_err(err)?),
                field(c, "host")?,
            )
            .map_err(err)?
    } else {
        stream
    };
    fs.login(c["username"].as_str().filter(|s|!s.is_empty()).unwrap_or("anonymous"),&s.password).map_err(|_|"[authentication_required] FTP 登录失败，请填写本机密码 / FTP login failed; enter credentials on this device")?;
    // SIZE commonly fails in ASCII mode, defeating collision checks; ASCII
    // transfers also corrupt arbitrary binary files through newline conversion.
    fs.transfer_type(suppaftp::types::FileType::Binary)
        .map_err(err)?;
    let result = match action {
        "list" => {
            fs.cwd(p).map_err(err)?;
            let lines = fs.list(None).map_err(err)?;
            let mut list = Vec::new();
            for line in lines {
                let entry: suppaftp::list::File = line.parse().map_err(
                    |_| "[unsupported_listing] Cannot parse this server's FTP directory listing",
                )?;
                let name = entry.name();
                if [".", ".."].contains(&name) {
                    continue;
                }
                let mtime = entry
                    .modified()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);
                list.push(info(name, entry.is_directory(), entry.size() as u64, mtime));
            }
            Ok(json!(list))
        }
        "mkdir" => fs.mkdir(p).map(|_| Value::Null).map_err(err),
        "delete" => if a["isDir"] == true {
            fs.rmdir(p)
        } else {
            fs.rm(p)
        }
        .map(|_| Value::Null)
        .map_err(err),
        "rename" => {
            let dest = join(
                p.rsplit_once('/').map(|(v, _)| v).unwrap_or(""),
                field(a, "newName")?,
            )?;
            if fs.size(&dest).is_ok() || fs.cwd(&dest).is_ok() {
                return Err("[conflict] Destination exists; nothing was replaced".into());
            }
            fs.rename(p, &dest).map(|_| Value::Null).map_err(err)
        }
        "download" => {
            let mut reader = fs.retr_as_stream(p).map_err(err)?;
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .open(field(a, "localPath")?)
                .map_err(err)?;
            std::io::copy(&mut reader, &mut file).map_err(err)?;
            fs.finalize_retr_stream(reader).map_err(err)?;
            file.sync_all().map_err(err)?;
            Ok(Value::Null)
        }
        "upload" => {
            if fs.size(p).is_ok() {
                return Err("[conflict] Destination exists; nothing was replaced".into());
            }
            let mut file = std::fs::File::open(field(a, "localPath")?).map_err(err)?;
            fs.put_file(p, &mut file).map_err(err)?;
            Ok(Value::Null)
        }
        _ => Err("Unsupported FTP operation".into()),
    };
    fs.quit().ok();
    result
}
fn dav_url(c: &Value, p: &str) -> Result<url::Url, String> {
    let mut url = url::Url::parse(field(c, "url")?).map_err(err)?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Invalid WebDAV URL".into());
    }
    if url.scheme() == "http" && c["insecure"] != true {
        return Err("Plain HTTP requires explicit consent".into());
    }
    {
        let mut parts = url.path_segments_mut().map_err(|_| "Invalid URL path")?;
        parts.pop_if_empty();
        for part in p.split('/').filter(|v| !v.is_empty()) {
            parts.push(part);
        }
        if p.trim_matches('/').is_empty() {
            parts.push("");
        }
    }
    Ok(url)
}
fn webdav(c: &Value, s: &Secret, action: &str, p: &str, a: &Value) -> Result<Value, String> {
    let mut url = dav_url(c, p)?;
    if matches!(action, "list" | "mkdir") || a["isDir"] == true {
        url.path_segments_mut()
            .map_err(|_| "Invalid collection URL")?
            .pop_if_empty()
            .push("");
    }
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .allow_non_standard_methods(true)
        .timeout_global(Some(Duration::from_secs(600)))
        .timeout_connect(Some(Duration::from_secs(5)))
        .timeout_recv_response(Some(Duration::from_secs(15)))
        .max_redirects(0)
        .http_status_as_error(false)
        .proxy(None)
        .build()
        .into();
    let method = match action {
        "list" => "PROPFIND",
        "mkdir" => "MKCOL",
        "delete" => "DELETE",
        "rename" => "MOVE",
        "download" => "GET",
        "upload" => "PUT",
        _ => return Err("Unsupported WebDAV operation".into()),
    };
    let mut req = ureq::http::Request::builder()
        .method(method)
        .uri(url.as_str());
    let username = c["username"].as_str().unwrap_or("");
    if !username.is_empty() || !s.password.is_empty() {
        req = req.header(
            "Authorization",
            format!("Basic {}", B64.encode(format!("{username}:{}", s.password))),
        );
    }
    if action == "list" {
        req = req
            .header("Depth", "1")
            .header("Content-Type", "application/xml; charset=utf-8");
    }
    if action == "upload" {
        req = req.header("If-None-Match", "*");
    }
    if action == "rename" {
        let parent = p.rsplit_once('/').map(|(v, _)| v).unwrap_or("");
        req = req
            .header(
                "Destination",
                dav_url(c, &join(parent, field(a, "newName")?)?)?.as_str(),
            )
            .header("Overwrite", "F");
    }
    let mut response = if action == "upload" {
        let f = std::fs::File::open(field(a, "localPath")?).map_err(err)?;
        agent.run(req.body(f).map_err(err)?).map_err(err)?
    } else if action == "list" {
        agent.run(req.body(br#"<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>"#.as_slice()).map_err(err)?).map_err(err)?
    } else {
        agent.run(req.body(()).map_err(err)?).map_err(err)?
    };
    let code = response.status().as_u16();
    if !(200..300).contains(&code) {
        return Err(match code {
            401 | 403 => format!(
                "[authentication_required] WebDAV HTTP {code}，请检查本机登录和权限 / Check local credentials and permissions"
            ),
            404 => "[not_found] Remote item not found".into(),
            409 | 412 => "[conflict] Destination exists or changed; nothing was replaced".into(),
            _ => format!("[webdav] Server returned HTTP {code}; redirects are not followed"),
        });
    }
    if action == "list" {
        let bytes = response
            .body_mut()
            .with_config()
            .limit(8 * 1024 * 1024)
            .read_to_vec()
            .map_err(err)?;
        return dav_list(&bytes, &url);
    }
    if action == "download" {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .open(field(a, "localPath")?)
            .map_err(err)?;
        std::io::copy(&mut response.body_mut().as_reader(), &mut file).map_err(err)?;
        file.sync_all().map_err(err)?;
    }
    Ok(Value::Null)
}
fn dav_list(bytes: &[u8], base: &url::Url) -> Result<Value, String> {
    use quick_xml::{Reader, events::Event};
    #[derive(Default)]
    struct Node {
        name: String,
        text: String,
        children: Vec<Node>,
    }
    fn attach(node: Node, stack: &mut [Node], root: &mut Option<Node>) -> Result<(), String> {
        if let Some(parent) = stack.last_mut() {
            parent.children.push(node)
        } else if root.replace(node).is_some() {
            return Err("Multiple WebDAV XML roots".into());
        }
        Ok(())
    }
    fn child<'a>(node: &'a Node, name: &str) -> Option<&'a Node> {
        node.children.iter().find(|n| n.name == name)
    }
    fn success(status: &str) -> bool {
        status.split_whitespace().nth(1) == Some("200")
    }
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut stack: Vec<Node> = Vec::new();
    let mut root = None;
    let mut nodes = 0;
    loop {
        match reader.read_event().map_err(err)? {
            Event::DocType(_) => return Err("WebDAV XML document types are not accepted".into()),
            Event::Start(e) => {
                nodes += 1;
                if stack.len() >= 32 || nodes > 300000 {
                    return Err("WebDAV XML structure exceeds limits".into());
                }
                stack.push(Node {
                    name: String::from_utf8_lossy(e.local_name().as_ref()).into_owned(),
                    ..Default::default()
                });
            }
            Event::Empty(e) => {
                nodes += 1;
                if nodes > 300000 {
                    return Err("WebDAV XML structure exceeds limits".into());
                }
                attach(
                    Node {
                        name: String::from_utf8_lossy(e.local_name().as_ref()).into_owned(),
                        ..Default::default()
                    },
                    &mut stack,
                    &mut root,
                )?;
            }
            Event::Text(e) => {
                let value = e.decode().map_err(err)?;
                let text = quick_xml::escape::unescape(&value).map_err(err)?;
                if let Some(node) = stack.last_mut() {
                    node.text.push_str(&text)
                } else if !text.trim().is_empty() {
                    return Err("Text outside WebDAV XML root".into());
                }
            }
            Event::CData(e) => {
                if let Some(node) = stack.last_mut() {
                    node.text.push_str(&e.decode().map_err(err)?);
                }
            }
            Event::GeneralRef(e) => {
                if let Some(node) = stack.last_mut() {
                    let raw = e.decode().map_err(err)?;
                    let escaped = format!("&{raw};");
                    node.text
                        .push_str(&quick_xml::escape::unescape(&escaped).map_err(err)?);
                }
            }
            Event::End(e) => {
                let node = stack.pop().ok_or("Unexpected WebDAV XML closing tag")?;
                if node.name.as_bytes() != e.local_name().as_ref() {
                    return Err("Mismatched WebDAV XML tag".into());
                }
                attach(node, &mut stack, &mut root)?;
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if !stack.is_empty() {
        return Err("Truncated WebDAV XML response".into());
    }
    let root = root
        .filter(|n: &Node| n.name == "multistatus")
        .ok_or("Expected WebDAV multistatus document")?;
    let mut out = Vec::new();
    for response in root.children.iter().filter(|n| n.name == "response") {
        if child(response, "status").is_some_and(|s| !success(&s.text)) {
            continue;
        }
        let href = child(response, "href")
            .filter(|n| !n.text.is_empty())
            .ok_or("WebDAV entry lacks a path")?;
        let url = base.join(&href.text).map_err(err)?;
        if url.origin() != base.origin() {
            return Err("WebDAV returned an external directory entry".into());
        }
        let prefix = format!("{}/", base.path().trim_end_matches('/'));
        let normalized = url.path().trim_end_matches('/');
        if normalized == base.path().trim_end_matches('/') {
            continue;
        }
        let relative = normalized
            .strip_prefix(&prefix)
            .filter(|v| !v.is_empty() && !v.contains('/'))
            .ok_or("WebDAV returned an entry outside this directory")?;
        let decoded = percent_encoding::percent_decode_str(relative)
            .decode_utf8()
            .map_err(err)?;
        leaf(&decoded)?;
        // A server can return successful properties in one propstat
        // and missing properties in another. Never let the latter
        // hide a valid entry or replace its successful metadata.
        let mut size = 0;
        let mut directory = false;
        let mut modified = String::new();
        let mut found = false;
        for group in response.children.iter().filter(|n| n.name == "propstat") {
            if !child(group, "status").is_some_and(|s| success(&s.text)) {
                continue;
            }
            let Some(prop) = child(group, "prop") else {
                continue;
            };
            found = true;
            if let Some(value) = child(prop, "getcontentlength") {
                size = value.text.parse().unwrap_or(0);
            }
            if let Some(value) = child(prop, "getlastmodified") {
                modified = value.text.clone();
            }
            if let Some(value) = child(prop, "resourcetype") {
                directory = child(value, "collection").is_some();
            }
        }
        if !found {
            continue;
        }
        let timestamp = chrono::DateTime::parse_from_rfc2822(&modified)
            .map(|d| d.timestamp_millis())
            .unwrap_or(0);
        out.push(info(&decoded, directory, size, timestamp));
        if out.len() > 100000 {
            return Err("Directory exceeds 100,000 entries".into());
        }
    }
    Ok(json!(out))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn credentials_are_bound_to_identity_not_labels() {
        let a = json!({"type":"sftp","host":"one","port":22,"username":"me","name":"A"});
        let mut b = a.clone();
        b["name"] = json!("renamed");
        assert_eq!(binding(&a), binding(&b));
        for key in ["host", "username", "type"] {
            let mut b = a.clone();
            b[key] = json!("other");
            assert_ne!(binding(&a), binding(&b));
        }
    }
    #[test]
    fn webdav_urls_encode_once_and_reject_credentials_or_path_escape() {
        let c = json!({"url":"https://example.invalid/dav/"});
        assert_eq!(
            dav_url(&c, "/中文 a%/x").unwrap().as_str(),
            "https://example.invalid/dav/%E4%B8%AD%E6%96%87%20a%25/x"
        );
        for p in ["../x", "/../x", "/a\\b", "/a\0b"] {
            assert!(path(p).is_err());
        }
        assert!(dav_url(&json!({"url":"http://host/dav"}), "/").is_err());
        assert!(dav_url(&json!({"url":"https://u:p@host/"}), "/").is_err());
    }
    #[test]
    fn parses_webdav_unicode_collections_and_escaped_names() {
        let xml=br#"<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response><d:response><d:href>/dav/a%20%26%20b/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>"#;
        let value = dav_list(
            xml,
            &url::Url::parse("https://example.invalid/dav").unwrap(),
        )
        .unwrap();
        assert_eq!(value.as_array().unwrap().len(), 1);
        assert_eq!(value[0]["name"], "a & b");
        assert_eq!(value[0]["is_dir"], true);
    }
    #[test]
    fn rejects_external_hrefs_and_dtd() {
        for xml in [
            r#"<multistatus><response><href>https://evil.invalid/x</href></response></multistatus>"#,
            r#"<!DOCTYPE x [<!ENTITY a SYSTEM "file:///c:/secret">]><x/>"#,
        ] {
            assert!(
                dav_list(
                    xml.as_bytes(),
                    &url::Url::parse("https://example.invalid/dav/").unwrap()
                )
                .is_err()
            );
        }
    }
    #[test]
    fn successful_webdav_properties_survive_a_later_missing_property_group() {
        let xml=br#"<multistatus><response><href>/dav/folder/</href><propstat><prop><resourcetype><collection/></resourcetype><getcontentlength>42</getcontentlength></prop><status>HTTP/1.1 200 OK</status></propstat><propstat><prop><getcontentlength>999</getcontentlength></prop><status>HTTP/1.1 404 Not Found</status></propstat></response></multistatus>"#;
        let result = dav_list(
            xml,
            &url::Url::parse("https://example.invalid/dav/").unwrap(),
        )
        .unwrap();
        assert_eq!(result[0]["size"], 42);
        assert_eq!(result[0]["is_dir"], true);
        for xml in [
            "<multistatus><response><href>/dav/a</href>",
            "<html/>",
            "<multistatus/><multistatus/>",
        ] {
            assert!(
                dav_list(
                    xml.as_bytes(),
                    &url::Url::parse("https://example.invalid/dav/").unwrap()
                )
                .is_err()
            );
        }
    }
}
