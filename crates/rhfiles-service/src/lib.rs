//! Explicitly enabled HTTPS file service; JSON API and WebDAV share one core.
//! Windows SMB/WebClient redirectors are never used for local shared roots.
mod auth;
pub mod connection;
mod dav;
pub mod device_name;
pub mod discovery;
pub mod groups;
mod http;
mod identity;
mod invitations;
mod locks;
mod model;
mod network_scope;
mod storage;
mod uploads;

pub use model::{Error, Permissions, Result, ShareConfig, Status};
use std::{
    net::{SocketAddr, TcpListener},
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

pub struct Service {
    state: Arc<http::State>,
    network: Arc<std::sync::Mutex<Network>>,
    running: Arc<AtomicBool>,
    port: u16,
    fingerprint: String,
    certificate: String,
    shares: Vec<ShareConfig>,
}

struct Network {
    listeners: Vec<(std::net::IpAddr, axum_server::Handle<SocketAddr>)>,
    endpoints: Vec<String>,
    advertisement: Option<Arc<discovery::Advertisement>>,
    error: Option<String>,
}

fn private_interfaces() -> Result<Vec<std::net::IpAddr>> {
    let mut addresses = if_addrs::get_if_addrs()?
        .into_iter()
        .map(|a| a.ip())
        .filter(|ip| ip.is_ipv4() && !ip.is_loopback() && network_scope::allowed(*ip))
        .collect::<Vec<_>>();
    addresses.sort();
    addresses.dedup();
    addresses.truncate(15);
    Ok(addresses)
}

// Local interface enumeration only: no ping, DNS, subnet scan or phone polling.
// New sockets are ready before signed addresses/announcements change. Existing
// sessions/uploads are retained; disappearing interfaces stop their listeners.
fn refresh_interfaces(
    network: &std::sync::Mutex<Network>,
    state: &Arc<http::State>,
    tls: &Arc<rustls::ServerConfig>,
    port: u16,
    fingerprint: &str,
    runtime: &tokio::runtime::Handle,
) -> Result<()> {
    let mut desired = private_interfaces()?;
    desired.push("127.0.0.1".parse().unwrap());
    refresh_desired(network, state, tls, port, fingerprint, runtime, desired)
}
fn refresh_desired(
    network: &std::sync::Mutex<Network>,
    state: &Arc<http::State>,
    tls: &Arc<rustls::ServerConfig>,
    port: u16,
    fingerprint: &str,
    runtime: &tokio::runtime::Handle,
    mut desired: Vec<std::net::IpAddr>,
) -> Result<()> {
    desired.sort();
    let mut current = network.lock().unwrap();
    let mut previous = current.listeners.iter().map(|v| v.0).collect::<Vec<_>>();
    previous.sort();
    if previous == desired {
        return Ok(());
    }
    let mut additions = Vec::new();
    for address in desired.iter().filter(|a| !previous.contains(a)) {
        let socket = TcpListener::bind(SocketAddr::new(*address, port))?;
        socket.set_nonblocking(true)?;
        additions.push((*address, socket));
    }
    let endpoints = desired
        .iter()
        .map(|ip| format!("https://{}", SocketAddr::new(*ip, port)))
        .collect::<Vec<_>>();
    let host = groups::Server {
        endpoints: endpoints.clone(),
        fingerprint: fingerprint.into(),
    };
    state.groups.advertise(host.clone())?;
    *state.host.lock().unwrap() = Some(host);
    for (ip, socket) in additions {
        let handle = axum_server::Handle::new();
        let _enter = runtime.enter();
        let server = axum_server::tls_rustls::from_tcp_rustls(
            socket,
            axum_server::tls_rustls::RustlsConfig::from_config(tls.clone()),
        )?;
        let app = axum::Router::new()
            .fallback(http::dispatch)
            .with_state(state.clone());
        let task_handle = handle.clone();
        runtime.spawn(async move {
            let _ = server
                .handle(task_handle)
                .serve(app.into_make_service_with_connect_info::<SocketAddr>())
                .await;
        });
        current.listeners.push((ip, handle));
    }
    current.listeners.retain(|(ip, handle)| {
        if desired.contains(ip) {
            true
        } else {
            handle.shutdown();
            false
        }
    });
    if let Some(ad) = current.advertisement.take() {
        ad.stop();
    }
    let announced = desired
        .into_iter()
        .filter(|a| !a.is_loopback())
        .collect::<Vec<_>>();
    current.advertisement = if announced.is_empty() {
        None
    } else {
        match discovery::Advertisement::start(&announced, port, fingerprint) {
            Ok(ad) => {
                current.error = None;
                Some(Arc::new(ad))
            }
            Err(_) => {
                current.error =
                    Some("接口已更新；mDNS 广播失败 / Interfaces updated; mDNS unavailable".into());
                None
            }
        }
    };
    current.endpoints = endpoints;
    Ok(())
}

impl Service {
    /// No auto-start, no firewall mutation. Callers explicitly select a local
    /// listening address (0.0.0.0 selects local/LAN/Tailscale interfaces, never
    /// public interfaces) and explicit local roots.
    pub fn start(data: &Path, shares: Vec<ShareConfig>, bind: SocketAddr) -> Result<Self> {
        Self::start_protected(data, shares, bind, &[])
    }
    /// Allow an explicitly selected disk root, while excluding host-owned
    /// configuration and credentials (also across virtual desktop profiles).
    pub fn start_protected(
        data: &Path,
        shares: Vec<ShareConfig>,
        bind: SocketAddr,
        protected: &[std::path::PathBuf],
    ) -> Result<Self> {
        if !bind.ip().is_unspecified() && !network_scope::allowed(bind.ip()) {
            return Err(Error::new("invalid_bind", "不允许在公网地址启动文件服务"));
        }
        if bind.ip().is_unspecified() && bind.is_ipv6() {
            return Err(Error::new(
                "invalid_bind",
                "请使用明确的本机 IPv6 地址或 IPv4 自动选择",
            ));
        }
        Self::start_grouped(
            data,
            shares,
            bind,
            protected,
            Arc::new(groups::Groups::open(data)?),
        )
    }
    pub fn start_grouped(
        data: &Path,
        shares: Vec<ShareConfig>,
        bind: SocketAddr,
        protected: &[std::path::PathBuf],
        groups: Arc<groups::Groups>,
    ) -> Result<Self> {
        if !bind.ip().is_unspecified() && !network_scope::allowed(bind.ip()) {
            return Err(Error::new("invalid_bind", "不允许在公网地址启动文件服务"));
        }
        if bind.ip().is_unspecified() && bind.is_ipv6() {
            return Err(Error::new(
                "invalid_bind",
                "请使用明确的本机 IPv6 地址或 IPv4 自动选择",
            ));
        }
        std::fs::create_dir_all(data)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(data, std::fs::Permissions::from_mode(0o700))?;
        }
        let storage = Arc::new(storage::Storage::protected(&shares, data, protected)?);
        let (fingerprint, tls) = identity::load(data)?;
        let certificate = identity::certificate(data)?;
        let state = Arc::new(http::State::with_groups(data, storage, groups)?);
        let mut addresses = if bind.ip().is_unspecified() {
            private_interfaces()?
        } else {
            vec![bind.ip()]
        };
        addresses.sort();
        addresses.dedup();
        addresses.truncate(15);
        // Never bind a wildcard/public interface. Even a LAN-origin connection
        // addressed to the machine's public IP cannot reach this listener.
        let mut listening = addresses.clone();
        if bind.ip().is_unspecified() {
            listening.insert(0, "127.0.0.1".parse().unwrap());
        }
        let mut port = bind.port();
        let mut listeners = Vec::new();
        for address in listening {
            let listener = TcpListener::bind(SocketAddr::new(address, port)).map_err(|error| {
                Error::new(
                    "bind_failed",
                    format!(
                        "无法监听本机接口 {address}:{port} / Cannot bind local interface: {error}"
                    ),
                )
            })?;
            listener.set_nonblocking(true)?;
            port = listener.local_addr()?.port();
            listeners.push(listener);
        }
        if addresses.is_empty() {
            addresses.push("127.0.0.1".parse().unwrap());
        }
        let (advertisement, discovery_error) = if addresses.iter().any(|a| !a.is_loopback()) {
            match discovery::Advertisement::start(&addresses, port, &fingerprint) {
                Ok(v) => (Some(Arc::new(v)), None),
                Err(_) => (None, Some("mDNS 自动发现未能启动，仍可使用设备组邀请 / Discovery unavailable; device-group invitations still work".into())),
            }
        } else {
            (None, None)
        };
        let endpoints: Vec<String> = addresses
            .into_iter()
            .take(16)
            .map(|ip| format!("https://{}", SocketAddr::new(ip, port)))
            .collect();
        let mut group_endpoints = endpoints.clone();
        // A wildcard service also really listens on loopback. Keep it last for
        // phones, but sign it too for local desktop instances / isolated AVD QA.
        if bind.ip().is_unspecified() {
            group_endpoints.push(format!("https://127.0.0.1:{port}"));
        }
        let host = groups::Server {
            endpoints: group_endpoints,
            fingerprint: fingerprint.clone(),
        };
        state.groups.advertise(host.clone())?;
        *state.host.lock().unwrap() = Some(host);
        let handles = listeners
            .iter()
            .map(|_| axum_server::Handle::new())
            .collect::<Vec<_>>();
        let thread_handles = handles.clone();
        let listener_ips = listeners
            .iter()
            .map(|s| s.local_addr().unwrap().ip())
            .collect::<Vec<_>>();
        let network = Arc::new(std::sync::Mutex::new(Network {
            listeners: listener_ips.into_iter().zip(handles).collect(),
            endpoints,
            advertisement,
            error: discovery_error,
        }));
        let server_state = state.clone();
        let running = Arc::new(AtomicBool::new(true));
        let flag = running.clone();
        // Separate runtime keeps slow local disk work out of the application UI.
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(4)
            .enable_all()
            .build()?;
        let servers = {
            let _enter = runtime.enter();
            listeners
                .into_iter()
                .map(|listener| {
                    axum_server::tls_rustls::from_tcp_rustls(
                        listener,
                        axum_server::tls_rustls::RustlsConfig::from_config(tls.clone()),
                    )
                })
                .collect::<std::io::Result<Vec<_>>>()?
        };
        let dynamic = bind.ip().is_unspecified();
        let active_network = network.clone();
        let network_fingerprint = fingerprint.clone();
        std::thread::Builder::new()
            .name("rhfiles-https".into())
            .spawn(move || {
                runtime.block_on(async move {
                    let app = axum::Router::new()
                        .fallback(http::dispatch)
                        .with_state(server_state.clone());
                    for (server, handle) in servers.into_iter().zip(thread_handles) {
                        let app = app.clone();
                        tokio::spawn(async move {
                            let _ = server
                                .handle(handle)
                                .serve(app.into_make_service_with_connect_info::<SocketAddr>())
                                .await;
                        });
                    }
                    while flag.load(Ordering::Acquire) {
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        if dynamic && flag.load(Ordering::Acquire) {
                            if let Err(error) = refresh_interfaces(
                                &active_network,
                                &server_state,
                                &tls,
                                port,
                                &network_fingerprint,
                                &tokio::runtime::Handle::current(),
                            ) {
                                active_network.lock().unwrap().error = Some(format!(
                                    "接口恢复失败 / Interface recovery failed: {error}"
                                ));
                            }
                        }
                    }
                });
            })?;
        Ok(Self {
            state,
            network,
            running,
            port,
            fingerprint,
            certificate,
            shares,
        })
    }
    pub fn status(&self) -> Status {
        let network = self.network.lock().unwrap();
        Status {
            running: self.running.load(Ordering::Acquire),
            port: self.port,
            fingerprint: self.fingerprint.clone(),
            certificate_pem: self.certificate.clone(),
            endpoints: network.endpoints.clone(),
            shares: self.shares.clone(),

            active_uploads: self.state.uploads.count(),
            discovery_error: network.error.clone(),
        }
    }
    pub fn groups(&self) -> Arc<groups::Groups> {
        self.state.groups.clone()
    }
    pub fn advertise_group_host(&self) -> Result<()> {
        self.state.groups.advertise(
            self.state
                .host
                .lock()
                .unwrap()
                .clone()
                .ok_or_else(|| Error::new("invalid_group", "服务未启动"))?,
        )
    }
    /// Local-only administration. Never log or synchronize invitation tokens.
    pub fn group_invitation(&self, id: &str, can_invite: bool) -> Result<serde_json::Value> {
        use base64::Engine;
        if !self.running.load(Ordering::Acquire) {
            return Err(Error::new("invalid_group", "请先启动文件服务"));
        }
        let (token, expires) = self
            .state
            .invitations
            .create(&self.state.groups, id, can_invite)?;
        let data = serde_json::json!({"version":1,"groupId":id,"deviceId":self.state.groups.device_id(),"deviceName":device_name::default_device_name(),"endpoints":self.network.lock().unwrap().endpoints,"fingerprint":self.fingerprint,"token":token,"expiresMs":expires});
        let uri = format!(
            "rhfiles-group-invite:v1:{}",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data.to_string())
        );
        let qr = qrcode::QrCode::with_error_correction_level(uri.as_bytes(), qrcode::EcLevel::L)
            .map_err(|_| Error::new("qr", "无法生成设备组邀请二维码"))?
            .render::<qrcode::render::svg::Color>()
            .min_dimensions(320, 320)
            .build();
        Ok(serde_json::json!({"uri":uri,"qrSvg":qr,"expiresMs":expires}))
    }
    pub fn stop(&self) {
        self.state.invitations.clear();
        self.running.store(false, Ordering::Release);
        let network = self.network.lock().unwrap();
        if let Some(advertisement) = &network.advertisement {
            advertisement.stop();
        }
        self.state.auth.stop();
        for (_, handle) in &network.listeners {
            handle.shutdown();
        }
    }
}
impl Drop for Service {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(all(test, windows))]
mod interface_tests {
    use super::*;
    #[tokio::test]
    async fn hot_rebind_preserves_credentials_and_upload_ownership_without_public_binding() {
        let dir = tempfile::tempdir().unwrap();
        let files = dir.path().join("files");
        std::fs::create_dir(&files).unwrap();
        let data = dir.path().join("data");
        let service = Service::start(
            &data,
            vec![ShareConfig {
                name: "Files".into(),
                path: files,
            }],
            "127.0.0.1:0".parse().unwrap(),
        )
        .unwrap();
        let groups = service.groups();
        let id = groups
            .create(
                "QA",
                "Host",
                Permissions {
                    write: true,
                    delete: true,
                },
            )
            .unwrap();
        let credential = service
            .state
            .auth
            .group_session(groups.clone(), &id, &groups.device_id())
            .unwrap();
        let (_, tls) = identity::load(&data).unwrap();
        let status = service.status();
        let client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .no_proxy()
            .build()
            .unwrap();
        let upload = client
            .post(format!("https://127.0.0.1:{}/api/v1/uploads", status.port))
            .basic_auth(
                credential["username"].as_str().unwrap(),
                credential["password"].as_str(),
            )
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Length", "1")
            .header("Upload-Metadata", "path L0ZpbGVzL25ldy50eHQ=")
            .body("")
            .send()
            .await
            .unwrap();
        assert!(upload.status().is_success());
        let location = upload
            .headers()
            .get("Location")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        refresh_desired(
            &service.network,
            &service.state,
            &tls,
            status.port,
            &status.fingerprint,
            &tokio::runtime::Handle::current(),
            vec!["127.0.0.1".parse().unwrap(), "127.0.0.2".parse().unwrap()],
        )
        .unwrap();
        let response = client
            .head(format!("https://127.0.0.2:{}{location}", status.port))
            .basic_auth(
                credential["username"].as_str().unwrap(),
                credential["password"].as_str(),
            )
            .header("Tus-Resumable", "1.0.0")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), 200);
        assert_eq!(response.headers()["Upload-Offset"], "0");
        assert_eq!(service.status().fingerprint, status.fingerprint);
        assert!(
            service
                .status()
                .endpoints
                .iter()
                .any(|s| s.contains("127.0.0.2"))
        );
        refresh_desired(
            &service.network,
            &service.state,
            &tls,
            status.port,
            &status.fingerprint,
            &tokio::runtime::Handle::current(),
            vec!["127.0.0.1".parse().unwrap()],
        )
        .unwrap();
        assert!(
            !service
                .status()
                .endpoints
                .iter()
                .any(|s| s.contains("127.0.0.2"))
        );
        // Rebinding must not invalidate pre-existing grants, unlike stop/start.
        assert!(
            client
                .get(format!(
                    "https://127.0.0.1:{}/api/v1/capabilities",
                    status.port
                ))
                .basic_auth(
                    credential["username"].as_str().unwrap(),
                    credential["password"].as_str()
                )
                .send()
                .await
                .unwrap()
                .status()
                .is_success()
        );
    }
}
