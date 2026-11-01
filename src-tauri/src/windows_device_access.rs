//! Opt-in live Windows filesystem access, not a downloaded mirror. The server
//! must explicitly authorize this group member. Secrets never enter renderer,
//! command lines, config sync or Windows-wide insecure certificate settings.
use rhfiles_service::connection::{DevicePath, FileRequest};
use serde_json::{Value, json};
use std::{
    net::IpAddr,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
static CONNECT: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn gateway(value: &str) -> Result<(String, u16), String> {
    let url = reqwest::Url::parse(value).map_err(|_| "[invalid_response] Windows 兼容地址无效")?;
    let host = url.host_str().ok_or("Missing Windows gateway host")?;
    if url.scheme() != "https"
        || !host.ends_with(".ts.net")
        || host.len() > 253
        || !host
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b".-".contains(&b))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/dav/"
    {
        return Err(
            "[invalid_response] Windows 兼容接入仅接受可信 Tailscale HTTPS /dav/ 地址".into(),
        );
    }
    Ok((
        host.into(),
        url.port_or_known_default().ok_or("Missing port")?,
    ))
}
fn allowed(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            v.is_private()
                || v.is_loopback()
                || v.is_link_local()
                || v.octets()[0] == 100 && (64..128).contains(&v.octets()[1])
        }
        IpAddr::V6(v) => v.is_loopback() || v.is_unique_local() || v.is_unicast_link_local(),
    }
}
async fn http(url: &str) -> Result<reqwest::Client, String> {
    let (host, port) = gateway(url)?;
    let addresses = tokio::time::timeout(
        Duration::from_secs(3),
        tokio::net::lookup_host((host.as_str(), port)),
    )
    .await
    .map_err(|_| "[dns_timeout] Windows 兼容地址解析超过 3 秒，未重试")?
    .map_err(|_| "[dns_error] 无法解析对方的 Tailscale HTTPS 地址")?
    .collect::<Vec<_>>();
    if addresses.is_empty() || addresses.iter().any(|a| !allowed(a.ip())) {
        return Err(
            "[public_address_forbidden] Windows 兼容入口未解析为本机、局域网或 Tailscale 地址"
                .into(),
        );
    }
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(10))
        .resolve_to_addrs(&host, &addresses)
        .build()
        .map_err(|_| "Cannot create trusted Windows access client".into())
}
fn field<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v[key]
        .as_str()
        .filter(|v| !v.is_empty() && !v.contains('\0') && v.len() <= 4096)
        .ok_or_else(|| format!("[invalid_response] 缺少 {key}"))
}
async fn probe(client: &reqwest::Client, url: &str, credentials: &Value) -> Result<bool, String> {
    let response=client.request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(),url).header("Depth","0").basic_auth(field(credentials,"username")?,Some(field(credentials,"password")?)).send().await.map_err(|_|"[webdav_tls_or_network] 无法连接可信 HTTPS 兼容入口；证书仍需通过系统验证，未忽略 TLS 错误")?;
    if [401, 403].contains(&response.status().as_u16()) {
        return Ok(false);
    }
    if response.status().as_u16() != 207 {
        return Err(format!(
            "[webdav_protocol] 兼容入口返回 HTTP {}",
            response.status().as_u16()
        ));
    }
    Ok(true)
}
struct Trace {
    report: rhfiles_service::connection::Report,
    start: Instant,
    phase: Instant,
    method: String,
}
impl Trace {
    fn new(path: &DevicePath) -> Self {
        Self {
            report: rhfiles_service::connection::Report {
                group: path.group.clone(),
                peer: path.peer.clone(),
                trigger: "windows.compatibility".into(),
                started_at: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
                duration_ms: 0,
                outcome: "failed".into(),
                certainty: "unknown".into(),
                endpoint: None,
                steps: Vec::new(),
                attempts: 0,
                remaining_ms: 0,
                retry_after_ms: 0,
                route_type: Some("windows_https".into()),
            },
            start: Instant::now(),
            phase: Instant::now(),
            method: String::new(),
        }
    }
    fn next(&mut self, method: &str) {
        if !self.method.is_empty() {
            self.add("succeeded", "ok");
        }
        self.method = method.into();
        self.phase = Instant::now();
    }
    fn add(&mut self, outcome: &str, code: &str) {
        if self.report.steps.len() < 16 {
            self.report.steps.push(rhfiles_service::connection::Step {
                method: self.method.clone(),
                endpoint: self.report.endpoint.clone(),
                outcome: outcome.into(),
                code: code.into(),
                duration_ms: self.phase.elapsed().as_millis() as u64,
            });
        }
    }
    fn finish(mut self, error: Option<&String>) -> rhfiles_service::connection::Report {
        let success = error.is_none();
        let code = error
            .and_then(|e| e.strip_prefix('['))
            .and_then(|e| e.split_once(']'))
            .map(|v| v.0)
            .filter(|v| {
                v.len() <= 64
                    && v.bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
            })
            .unwrap_or(if success {
                "connected"
            } else {
                "windows_access_failed"
            });
        self.add(if success { "succeeded" } else { "failed" }, code);
        self.report.duration_ms = self.start.elapsed().as_millis() as u64;
        self.report.outcome = if success { "connected" } else { "failed" }.into();
        self.report.certainty = if success { "confirmed" } else { "unknown" }.into();
        self.report
    }
}
pub(crate) async fn resolve(path: &DevicePath) -> Result<String, String> {
    let connector = crate::device_groups::connector()?;
    let mut trace = Trace::new(path);
    let result = resolve_inner(path, &mut trace).await;
    connector.record_external(trace.finish(result.as_ref().err()));
    result
}
async fn resolve_inner(path: &DevicePath, trace: &mut Trace) -> Result<String, String> {
    trace.next("windows.component");
    if crate::lan_service::lan_service_webdav_compatibility()["webClient"]["state"]
        == "not_installed"
    {
        return Err("[windows_component_missing] 本机 Windows 未安装 WebClient/WebDAV Redirector；RHFiles 文件操作可直接使用设备协议，调用系统程序则需要此 Windows 组件。未自动安装或重启".into());
    }
    trace.next("windows.connection-queue");
    let _queue = tokio::time::timeout(Duration::from_secs(1), CONNECT.lock())
        .await
        .map_err(|_| "[busy] 正在建立另一个 Windows 兼容连接，请稍后手动再试")?;
    let connector = crate::device_groups::connector()?;
    let lease = connector.file_lease(&path.group, &path.peer)?;
    lease.check()?;
    trace.next("windows.capabilities");
    let caps = connector
        .file_request(&path.group, &path.peer, FileRequest::Capabilities)
        .await?
        .json(65536)
        .await?;
    let url=caps["windowsCompatibility"]["url"].as_str().ok_or("[compatibility_unavailable] 对方尚未启用可信 HTTPS WebDAV 兼容入口；文件操作仍可直接使用设备协议")?.to_string();
    trace.next("windows.private-dns");
    trace.report.endpoint = Some(url.clone());
    let (host, port) = gateway(&url)?;
    let client = http(&url).await?;
    let (vault, scope) = vault_location(path)?;
    trace.next("windows.credential-cache");
    let cached = read_vault(&vault, &scope)
        .ok()
        .filter(|v| v["gateway"]["url"] == url);
    trace.next(if cached.is_some() {
        "windows.cached-authorization"
    } else {
        "windows.owner-authorization"
    });
    let credentials = if let Some(credentials) = cached.filter(|v| v["groupId"] == path.group) {
        if probe(&client, &url, &credentials).await? {
            credentials
        } else {
            issue(&connector, path, &vault, &scope, &url).await?
        }
    } else {
        issue(&connector, path, &vault, &scope, &url).await?
    };
    lease.check()?;
    trace.next("windows.trusted-https-probe");
    if !probe(&client, &url, &credentials).await? {
        return Err("[forbidden] Windows 兼容授权已撤销；请让服务器重新授权此成员".into());
    }
    let unc = format!(r"\\{}@SSL@{}\DavWWWRoot\dav", host, port);
    let username = field(&credentials, "username")?.to_string();
    let password = field(&credentials, "password")?.to_string();
    let key = host.clone();
    let worker_unc = unc.clone();
    trace.next("windows.webclient");
    trace.report.attempts = 1;
    tokio::task::spawn_blocking(move || {
        crate::network_io::execute_private(
            &key,
            crate::network_io::Request::WebdavConnect {
                unc: worker_unc,
                username,
                password,
            },
        )
    })
    .await
    .map_err(|_| "Windows access worker failed")??;
    trace.next("windows.final-authorization");
    lease.check()?;
    Ok(format!("{}{}", unc, path.path.replace('/', r"\")))
}
fn vault_location(path: &DevicePath) -> Result<(std::path::PathBuf, String), String> {
    let directory = crate::profile::data_dir()?.join("device-windows-access");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let scope = format!(
        "RHFiles Windows access v1|{}|{}|{}",
        directory.display(),
        path.group,
        path.peer
    );
    use sha2::Digest;
    Ok((
        directory.join(format!(
            "{:x}.vault",
            sha2::Sha256::digest(format!("{}|{}", path.group, path.peer))
        )),
        scope,
    ))
}
fn read_vault(path: &std::path::Path, scope: &str) -> Result<Value, String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|_| "[not_found] 本机没有为此设备保存 Windows 连接")?
        .take(65537)
        .read_to_end(&mut bytes)
        .map_err(|_| "无法读取本机 Windows 连接")?;
    if bytes.len() > 65536 {
        return Err("[invalid_config] Windows 连接缓存过大".into());
    }
    serde_json::from_slice(&crate::config_sync::crypt(&bytes, scope.as_bytes(), false)?)
        .map_err(|_| "[invalid_config] Windows 连接缓存无效".into())
}
pub(crate) async fn disconnect(path: &DevicePath) -> Result<Value, String> {
    let (vault, scope) = vault_location(path)?;
    let credentials = match read_vault(&vault, &scope) {
        Ok(v) => v,
        Err(e) if e.starts_with("[not_found]") => return Ok(json!({"disconnected":false})),
        Err(e) => return Err(e),
    };
    let (host, port) = gateway(field(&credentials["gateway"], "url")?)?;
    let unc = format!(r"\\{}@SSL@{}\DavWWWRoot\dav", host, port);
    let username = field(&credentials, "username")?.to_string();
    tokio::task::spawn_blocking(move || {
        crate::network_io::execute_private(
            &format!("disconnect-{host}"),
            crate::network_io::Request::WebdavDisconnect { unc, username },
        )
    })
    .await
    .map_err(|_| "Windows disconnect worker failed")?
}
pub(crate) fn disconnect_worker(unc: &str, username: &str) -> Result<Value, String> {
    use windows::{
        Win32::NetworkManagement::WNet::*,
        core::{PCWSTR, PWSTR},
    };
    let valid =
        regex::Regex::new(r"^\\\\[a-z0-9.-]+\.ts\.net@SSL@[0-9]{1,5}\\DavWWWRoot\\dav$").unwrap();
    if !valid.is_match(unc)
        || username.is_empty()
        || username.len() > 256
        || username.contains('\0')
    {
        return Err("[invalid_request] 断开参数无效".into());
    }
    let remote = unc.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let mut user = vec![0u16; 512];
    let mut length = user.len() as u32;
    let result = unsafe {
        WNetGetUserW(
            PCWSTR(remote.as_ptr()),
            PWSTR(user.as_mut_ptr()),
            &mut length,
        )
    };
    if result.0 == 2250 {
        return Ok(json!({"disconnected":false}));
    }
    if result.0 != 0 {
        return Err(format!(
            "[windows_webdav_{}] 无法核对当前连接所属账号，未断开",
            result.0
        ));
    }
    let actual =
        String::from_utf16_lossy(&user[..user.iter().position(|&v| v == 0).unwrap_or(user.len())]);
    if actual.rsplit('\\').next() != Some(username) {
        return Err("[forbidden] 此 Windows 连接不属于当前 RHFiles 配置，未断开".into());
    }
    let result =
        unsafe { WNetCancelConnection2W(PCWSTR(remote.as_ptr()), NET_CONNECT_FLAGS(0), false) };
    if result.0 != 0 {
        return Err(format!(
            "[windows_webdav_{}] 连接未断开；未强制关闭文件",
            result.0
        ));
    }
    Ok(json!({"disconnected":true}))
}
async fn issue(
    connector: &std::sync::Arc<rhfiles_service::connection::Connector>,
    path: &DevicePath,
    vault: &std::path::Path,
    scope: &str,
    url: &str,
) -> Result<Value, String> {
    // A submitted credential request is never replayed automatically. The
    // server additionally requires a prior owner-approved grant for this peer.
    let credentials = connector
        .file_request(
            &path.group,
            &path.peer,
            FileRequest::WindowsAccessCredential,
        )
        .await?
        .json(16384)
        .await?;
    if credentials["gateway"]["url"] != url
        || credentials["groupBound"] != true
        || credentials["groupId"] != path.group
    {
        return Err("[invalid_response] Windows 兼容授权与当前设备组不匹配".into());
    }
    field(&credentials, "username")?;
    field(&credentials, "password")?;
    let encrypted = crate::config_sync::crypt(
        &serde_json::to_vec(&credentials).map_err(|_| "Invalid Windows access credentials")?,
        scope.as_bytes(),
        true,
    )?;
    use std::io::Write;
    let mut temp =
        tempfile::NamedTempFile::new_in(vault.parent().ok_or("Missing vault directory")?)
            .map_err(|e| e.to_string())?;
    temp.write_all(&encrypted).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(vault).map_err(|e| e.to_string())?;
    Ok(credentials)
}
pub(crate) fn connect_worker(unc: &str, username: &str, password: &str) -> Result<Value, String> {
    use windows::{
        Win32::NetworkManagement::WNet::*,
        core::{PCWSTR, PWSTR},
    };
    // Only the exact trusted gateway root is accepted; never an arbitrary SMB
    // hostname, a mapped drive, a pipe, user URL or credentials in argv.
    let re =
        regex::Regex::new(r"^\\\\[a-z0-9.-]+\.ts\.net@SSL@[0-9]{1,5}\\DavWWWRoot\\dav$").unwrap();
    if !re.is_match(unc)
        || username.is_empty()
        || password.is_empty()
        || username.contains('\0')
        || password.contains('\0')
        || username.len() > 256
        || password.len() > 256
    {
        return Err("[invalid_request] Windows 兼容连接参数无效".into());
    }
    let mut remote = unc.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let user = username.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let mut pass = password.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let resource = NETRESOURCEW {
        dwType: RESOURCETYPE_DISK,
        lpRemoteName: PWSTR(remote.as_mut_ptr()),
        ..Default::default()
    };
    let code = unsafe {
        WNetAddConnection2W(
            &resource,
            PCWSTR(pass.as_ptr()),
            PCWSTR(user.as_ptr()),
            CONNECT_TEMPORARY,
        )
    };
    pass.fill(0);
    if code.0 != 0 {
        return Err(format!(
            "[windows_webdav_{}] Windows WebClient 无法建立兼容连接；未修改安全设置、断开其他连接或重试。{}",
            code.0,
            if code.0 == 1219 {
                "此服务器已有不同凭据的连接，请先自行关闭对应连接。"
            } else {
                "请检查 WebClient 服务、Tailscale 和系统证书。"
            }
        ));
    }
    Ok(json!({"connected":true}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_trusted_https_tailscale_paths_and_private_addresses_can_reach_windows() {
        assert!(gateway("https://computer.example.ts.net:39129/dav/").is_ok());
        for value in [
            "http://computer.ts.net/dav/",
            "https://127.0.0.1:39129/dav/",
            "https://computer.ts.net/other",
            "https://user:secret@computer.ts.net/dav/",
            "https://computer.ts.net/dav/?secret=x",
            "https://example.com/dav/",
        ] {
            assert!(gateway(value).is_err(), "{value}");
        }
        for value in [
            "127.0.0.1",
            "192.168.0.1",
            "100.73.139.109",
            "fd7a:115c:a1e0::1",
        ] {
            assert!(allowed(value.parse().unwrap()));
        }
        for value in ["8.8.8.8", "100.128.0.1", "2606:4700:4700::1111"] {
            assert!(!allowed(value.parse().unwrap()));
        }
        assert!(connect_worker(r"\\server\share", "user", "password").is_err());
    }
}
