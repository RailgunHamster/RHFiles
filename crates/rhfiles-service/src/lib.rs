//! Explicitly enabled HTTPS file service; JSON API and WebDAV share one core.
//! Windows SMB/WebClient redirectors are never used for local shared roots.
mod auth;
mod dav;
pub mod device_name;
mod discovery;
pub mod groups;
mod http;
mod identity;
mod locks;
mod model;
mod network_scope;
mod storage;
mod uploads;

use base64::Engine;
pub use model::{Credential, Device, Error, Pairing, Permissions, Result, ShareConfig, Status};
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
    handles: Vec<axum_server::Handle<SocketAddr>>,
    running: Arc<AtomicBool>,
    port: u16,
    fingerprint: String,
    certificate: String,
    endpoints: Vec<String>,
    shares: Vec<ShareConfig>,
    advertisement: Option<Arc<discovery::Advertisement>>,
    discovery_error: Option<String>,
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
            return Err(Error::new("invalid_bind", "请使用明确的本机 IPv6 地址或 IPv4 自动选择"));
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
            if_addrs::get_if_addrs()?
                .into_iter()
                .map(|a| a.ip())
                .filter(|ip| ip.is_ipv4() && !ip.is_loopback() && network_scope::allowed(*ip))
                .collect::<Vec<_>>()
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
                Err(_) => (None, Some("mDNS 自动发现未能启动，仍可扫码或粘贴配对信息 / Discovery unavailable; QR and manual pairing still work".into())),
            }
        } else {
            (None, None)
        };
        let endpoints: Vec<String> = addresses
            .into_iter()
            .take(16)
            .map(|ip| format!("https://{}", SocketAddr::new(ip, port)))
            .collect();
        let mut group_endpoints=endpoints.clone();
        // A wildcard service also really listens on loopback. Keep it last for
        // phones, but sign it too for local desktop instances / isolated AVD QA.
        if bind.ip().is_unspecified() { group_endpoints.push(format!("https://127.0.0.1:{port}")); }
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
        let server_state = state.clone();
        let running = Arc::new(AtomicBool::new(true));
        let flag = running.clone();
        let announcement = advertisement.clone();
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
        std::thread::Builder::new()
            .name("rhfiles-https".into())
            .spawn(move || {
                runtime.block_on(async move {
                    let app = axum::Router::new()
                        .fallback(http::dispatch)
                        .with_state(server_state);
                    futures_util::future::join_all(servers.into_iter().zip(thread_handles).map(
                        |(server, handle)| {
                            let app = app.clone();
                            async move {
                                if let Err(error) = server
                                    .handle(handle)
                                    .serve(app.into_make_service_with_connect_info::<SocketAddr>())
                                    .await
                                {
                                    eprintln!("RHFiles HTTPS listener stopped: {error}");
                                }
                            }
                        },
                    ))
                    .await;
                });
                flag.store(false, Ordering::Release);
                if let Some(advertisement) = announcement {
                    advertisement.stop();
                }
            })?;
        Ok(Self {
            state,
            handles,
            running,
            port,
            fingerprint,
            certificate,
            endpoints,
            shares,
            advertisement,
            discovery_error,
        })
    }
    pub fn status(&self) -> Status {
        Status {
            running: self.running.load(Ordering::Acquire),
            port: self.port,
            fingerprint: self.fingerprint.clone(),
            certificate_pem: self.certificate.clone(),
            endpoints: self.endpoints.clone(),
            shares: self.shares.clone(),
            devices: self.state.auth.devices(),
            active_uploads: self.state.uploads.count(),
            discovery_error: self.discovery_error.clone(),
        }
    }
    pub fn groups(&self) -> Arc<groups::Groups> {
        self.state.groups.clone()
    }
    pub fn advertise_group_host(&self) -> Result<()> {
        self.state.groups.advertise(self.state.host.lock().unwrap().clone().ok_or_else(||Error::new("invalid_group","服务未启动"))?)
    }
    pub fn credential(&self, name: &str, permissions: Permissions) -> Result<Credential> {
        self.state.auth.issue(name, permissions)
    }
    pub fn revoke(&self, id: &str) -> Result<()> {
        self.state.auth.revoke(id)
    }
    /// Never exposed on either network API; only the local host may grant access.
    pub fn set_permissions(&self, id: &str, permissions: Permissions) -> Result<Device> {
        self.state.auth.set_permissions(id, permissions)
    }
    pub fn pairing(&self, permissions: Permissions) -> Result<Pairing> {
        let (code, expires_ms) = self.state.auth.pairing(permissions)?;
        let payload = serde_json::json!({"version":1,"deviceName":device_name::default_device_name(),"endpoints":self.endpoints,"fingerprint":self.fingerprint,"code":code});
        let connection_uri = format!(
            "rhfiles-connect:v1:{}",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload.to_string())
        );
        let qr_svg = qrcode::QrCode::new(connection_uri.as_bytes())
            .map_err(|_| Error::new("qr", "无法生成配对二维码"))?
            .render::<qrcode::render::svg::Color>()
            .min_dimensions(240, 240)
            .build();
        Ok(Pairing {
            code,
            expires_ms,
            fingerprint: self.fingerprint.clone(),
            endpoints: self.endpoints.clone(),
            connection_uri,
            qr_svg,
        })
    }
    pub fn stop(&self) {
        self.running.store(false, Ordering::Release);
        if let Some(advertisement) = &self.advertisement {
            advertisement.stop();
        }
        self.state.auth.stop();
        for handle in &self.handles {
            handle.shutdown();
        }
    }
}
impl Drop for Service {
    fn drop(&mut self) {
        self.stop();
    }
}
