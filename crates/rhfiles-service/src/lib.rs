//! Explicitly enabled HTTPS file service; JSON API and WebDAV share one core.
//! Windows SMB/WebClient redirectors are never used for local shared roots.
mod auth;
mod dav;
mod http;
mod identity;
mod locks;
mod model;
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
    handle: axum_server::Handle<SocketAddr>,
    running: Arc<AtomicBool>,
    port: u16,
    fingerprint: String,
    certificate: String,
    endpoints: Vec<String>,
    shares: Vec<ShareConfig>,
}

impl Service {
    /// No auto-start, no firewall mutation. Callers explicitly select a local
    /// listening address (0.0.0.0 enables LAN access) and explicit local roots.
    pub fn start(data: &Path, shares: Vec<ShareConfig>, bind: SocketAddr) -> Result<Self> {
        std::fs::create_dir_all(data)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(data, std::fs::Permissions::from_mode(0o700))?;
        }
        let storage = Arc::new(storage::Storage::new(&shares, data)?);
        let (fingerprint, tls) = identity::load(data)?;
        let certificate = identity::certificate(data)?;
        let state = Arc::new(http::State::new(data, storage)?);
        let listener = TcpListener::bind(bind)?;
        listener.set_nonblocking(true)?;
        let port = listener.local_addr()?.port();
        let mut addresses = if bind.ip().is_unspecified() {
            if_addrs::get_if_addrs()?
                .into_iter()
                .map(|a| a.ip())
                .filter(
                    |ip| matches!(ip,std::net::IpAddr::V4(v) if v.is_private()||v.is_link_local()),
                )
                .collect::<Vec<_>>()
        } else {
            vec![bind.ip()]
        };
        addresses.sort();
        addresses.dedup();
        let endpoints = addresses
            .into_iter()
            .take(16)
            .map(|ip| format!("https://{}", SocketAddr::new(ip, port)))
            .collect();
        let handle = axum_server::Handle::new();
        let thread_handle = handle.clone();
        let server_state = state.clone();
        let running = Arc::new(AtomicBool::new(true));
        let flag = running.clone();
        // Separate runtime keeps slow local disk work out of the application UI.
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(4)
            .enable_all()
            .build()?;
        let server = {
            let _enter = runtime.enter();
            axum_server::tls_rustls::from_tcp_rustls(
                listener,
                axum_server::tls_rustls::RustlsConfig::from_config(tls),
            )?
        };
        std::thread::Builder::new()
            .name("rhfiles-https".into())
            .spawn(move || {
                runtime.block_on(async move {
                    let app = axum::Router::new()
                        .fallback(http::dispatch)
                        .with_state(server_state);
                    if let Err(error) = server
                        .handle(thread_handle)
                        .serve(app.into_make_service_with_connect_info::<SocketAddr>())
                        .await
                    {
                        eprintln!("RHFiles HTTPS listener stopped: {error}");
                    }
                });
                flag.store(false, Ordering::Release);
            })?;
        Ok(Self {
            state,
            handle,
            running,
            port,
            fingerprint,
            certificate,
            endpoints,
            shares,
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
        }
    }
    pub fn credential(&self, name: &str, permissions: Permissions) -> Result<Credential> {
        self.state.auth.issue(name, permissions)
    }
    pub fn revoke(&self, id: &str) -> Result<()> {
        self.state.auth.revoke(id)
    }
    pub fn pairing(&self, permissions: Permissions) -> Result<Pairing> {
        let (code, expires_ms) = self.state.auth.pairing(permissions)?;
        let payload = serde_json::json!({"version":1,"endpoints":self.endpoints,"fingerprint":self.fingerprint,"code":code});
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
        self.state.auth.stop();
        self.handle.shutdown();
    }
}
impl Drop for Service {
    fn drop(&mut self) {
        self.stop();
    }
}
