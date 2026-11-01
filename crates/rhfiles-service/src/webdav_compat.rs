//! Trusted-TLS adapter only. Shares, authorization and revocation stay in the
//! same live service state; this is deliberately not a second file server.
use crate::{Error, Result, http};
use axum::{
    body::Body,
    extract::{Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use std::{
    net::{IpAddr, SocketAddr, TcpListener},
    path::Path,
    sync::Arc,
};

pub(crate) struct Gateway {
    domain: String,
    port: u16,
    tls: axum_server::tls_rustls::RustlsConfig,
    listeners: Vec<(IpAddr, axum_server::Handle<SocketAddr>)>,
    pub error: Option<String>,
}
async fn dispatch(State(state): State<Arc<http::State>>, mut request: Request) -> Response {
    let path = request.uri().path();
    // Windows probes OPTIONS at the server root before opening /dav/. No API,
    // invitations or group-admin routes are exposed on the compatibility port.
    if path == "/" && request.method() == axum::http::Method::OPTIONS {
        *request.uri_mut() = "/dav/".parse().unwrap();
    } else if path != "/dav" && !path.starts_with("/dav/") {
        return (StatusCode::NOT_FOUND, Body::empty()).into_response();
    }
    http::dispatch(State(state), request).await
}
impl Gateway {
    pub fn start(
        runtime: &tokio::runtime::Handle,
        state: &Arc<http::State>,
        domain: &str,
        port: u16,
        cert: &Path,
        key: &Path,
    ) -> Result<Self> {
        if port == 0
            || !domain.ends_with(".ts.net")
            || domain.len() > 253
            || !domain
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'.' || c == b'-')
        {
            return Err(Error::new(
                "invalid_request",
                "需要本机 Tailscale HTTPS 域名和独立端口",
            ));
        }
        let tls = runtime
            .block_on(axum_server::tls_rustls::RustlsConfig::from_pem_file(
                cert, key,
            ))
            .map_err(|_| Error::new("tls", "无法读取可信 HTTPS 证书或私钥"))?;
        let mut gateway = Self {
            domain: domain.into(),
            port,
            tls,
            listeners: Vec::new(),
            error: None,
        };
        gateway.refresh(runtime, state)?;
        Ok(gateway)
    }
    pub fn refresh(
        &mut self,
        runtime: &tokio::runtime::Handle,
        state: &Arc<http::State>,
    ) -> Result<()> {
        let mut desired = crate::private_interfaces()?;
        desired.push("127.0.0.1".parse().unwrap());
        let mut additions = Vec::new();
        for ip in desired
            .iter()
            .filter(|ip| !self.listeners.iter().any(|v| v.0 == **ip))
        {
            let socket = TcpListener::bind(SocketAddr::new(*ip, self.port)).map_err(|_| {
                Error::new(
                    "bind_failed",
                    "可信 WebDAV 端口被占用，未改动原有设备组服务",
                )
            })?;
            socket.set_nonblocking(true)?;
            additions.push((*ip, socket));
        }
        for (ip, socket) in additions {
            let handle = axum_server::Handle::new();
            let task_handle = handle.clone();
            let _enter = runtime.enter();
            let server = axum_server::tls_rustls::from_tcp_rustls(socket, self.tls.clone())?;
            let app = axum::Router::new()
                .fallback(dispatch)
                .with_state(state.clone());
            runtime.spawn(async move {
                let _ = server
                    .handle(task_handle)
                    .serve(app.into_make_service_with_connect_info::<SocketAddr>())
                    .await;
            });
            self.listeners.push((ip, handle));
        }
        self.listeners.retain(|(ip, handle)| {
            if desired.contains(ip) {
                true
            } else {
                handle.shutdown();
                false
            }
        });
        self.error = None;
        Ok(())
    }
    pub fn status(&self) -> serde_json::Value {
        serde_json::json!({"running":true,"domain":self.domain,"port":self.port,"url":format!("https://{}:{}/dav/",self.domain,self.port),"unc":format!(r"\\{}@SSL@{}\DavWWWRoot\dav",self.domain,self.port),"groupBound":true,"error":self.error})
    }
}
impl Drop for Gateway {
    fn drop(&mut self) {
        for (_, handle) in &self.listeners {
            handle.shutdown();
        }
    }
}
