//! File operations use the same identity-bound routes as discovery. No URL,
//! credential, proxy or redirect escape hatch is exposed to a renderer.
use super::*;
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use reqwest::{Method, RequestBuilder, Response};
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DevicePath {
    pub group: String,
    pub peer: String,
    pub path: String,
}
impl DevicePath {
    pub const PREFIX: &'static str = "rhfiles-device://";
    pub fn new(group: &str, peer: &str, path: &str) -> Result<Self, String> {
        for id in [group, peer] {
            if id.len() != 64 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
                return Err("[invalid_path] 设备身份无效".into());
            }
        }
        validate_path(path)?;
        Ok(Self {
            group: group.to_ascii_lowercase(),
            peer: peer.to_ascii_lowercase(),
            path: if path == "/" {
                "/".into()
            } else {
                path.trim_end_matches('/').into()
            },
        })
    }
    pub fn parse(uri: &str) -> Result<Self, String> {
        if uri.len() > 27000
            || !uri
                .get(..Self::PREFIX.len())
                .is_some_and(|p| p.eq_ignore_ascii_case(Self::PREFIX))
            || uri.contains(['?', '#'])
        {
            return Err("[invalid_path] 设备路径无效".into());
        }
        let mut pieces = uri[Self::PREFIX.len()..].splitn(3, '/');
        let group = pieces.next().unwrap_or_default();
        let peer = pieces.next().unwrap_or_default();
        let raw = pieces.next().unwrap_or_default();
        if raw.contains("//") {
            return Err("[invalid_path] 设备路径包含空段".into());
        }
        let mut parts = Vec::new();
        if !raw.is_empty() {
            for piece in raw.trim_end_matches('/').split('/') {
                // Decode exactly once. Encoded slash/backslash and dot components
                // cannot be normalized away by a general URL parser.
                let name = percent_encoding::percent_decode_str(piece)
                    .decode_utf8()
                    .map_err(|_| "[invalid_path] 路径编码无效")?;
                if name.contains(['/', '\\'])
                    || (piece.contains('%') && !valid_percent_encoding(piece))
                {
                    return Err("[invalid_path] 路径分隔符编码无效".into());
                }
                parts.push(name.into_owned());
            }
        }
        Self::new(group, peer, &format!("/{}", parts.join("/")))
    }
    pub fn uri(&self) -> String {
        const SET: &percent_encoding::AsciiSet = &percent_encoding::NON_ALPHANUMERIC
            .remove(b'-')
            .remove(b'_')
            .remove(b'.')
            .remove(b'!')
            .remove(b'~')
            .remove(b'*')
            .remove(b'\'')
            .remove(b'(')
            .remove(b')');
        format!(
            "{}{}/{}/{}",
            Self::PREFIX,
            self.group,
            self.peer,
            self.path
                .trim_start_matches('/')
                .split('/')
                .map(|p| percent_encoding::utf8_percent_encode(p, SET).to_string())
                .collect::<Vec<_>>()
                .join("/")
        )
    }
    pub fn child(&self, name: &str) -> Result<Self, String> {
        crate::storage::valid_name(name).map_err(|e| format!("[{}] {}", e.code, e.message))?;
        Self::new(
            &self.group,
            &self.peer,
            &format!("{}/{}", self.path.trim_end_matches('/'), name),
        )
    }
}
fn valid_percent_encoding(value: &str) -> bool {
    let b = value.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            if i + 2 >= b.len() || !b[i + 1..i + 3].iter().all(u8::is_ascii_hexdigit) {
                return false;
            }
            i += 3
        } else {
            i += 1
        }
    }
    true
}

#[derive(Clone)]
pub enum FileRequest {
    Capabilities,
    List {
        path: String,
        offset: usize,
        limit: usize,
        revision: Option<String>,
    },
    Stat {
        path: String,
    },
    Content {
        path: String,
        range: Option<String>,
    },
    Thumbnail {
        path: String,
    },
    Mkdir {
        path: String,
    },
    Rename {
        path: String,
        destination: String,
    },
    Copy {
        path: String,
        destination: String,
    },
    Delete {
        path: String,
    },
    UploadCreate {
        path: String,
        length: u64,
    },
    UploadStatus {
        id: String,
    },
    UploadAppend {
        id: String,
        offset: u64,
        bytes: Vec<u8>,
    },
    UploadCancel {
        id: String,
    },
}
impl FileRequest {
    fn validate(&self) -> Result<(), String> {
        match self {
            Self::Capabilities => Ok(()),
            Self::UploadStatus { id }
            | Self::UploadCancel { id }
            | Self::UploadAppend { id, .. } => {
                if id.is_empty()
                    || id.len() > 128
                    || !id
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
                {
                    return Err("[invalid_request] 上传标识无效".into());
                }
                if let Self::UploadAppend { bytes, .. } = self {
                    if bytes.len() > 8 * 1024 * 1024 {
                        return Err("[too_large] 上传分块超过 8 MiB".into());
                    }
                }
                Ok(())
            }
            Self::Rename { path, destination } | Self::Copy { path, destination } => {
                validate_path(path)?;
                validate_path(destination)
            }
            Self::List {
                path,
                limit,
                offset,
                ..
            } => {
                validate_path(path)?;
                if *limit == 0 || *limit > 2000 || *offset > 1_000_000 {
                    Err("[invalid_request] 分页超出上限".into())
                } else {
                    Ok(())
                }
            }
            Self::Content { path, range } => {
                validate_path(path)?;
                if let Some(range) = range {
                    let valid = range.len() <= 100
                        && range
                            .strip_prefix("bytes=")
                            .and_then(|v| v.split_once('-'))
                            .is_some_and(|(start, end)| {
                                !(start.is_empty() && end.is_empty())
                                    && start.len() <= 20
                                    && end.len() <= 20
                                    && start.bytes().chain(end.bytes()).all(|b| b.is_ascii_digit())
                            });
                    if !valid {
                        return Err("[invalid_request] Range 格式无效".into());
                    }
                }
                Ok(())
            }
            Self::UploadCreate { path, length } => {
                validate_path(path)?;
                if *length > 1_099_511_627_776 {
                    Err("[too_large] 上传超过 1 TiB".into())
                } else {
                    Ok(())
                }
            }
            Self::Stat { path }
            | Self::Thumbnail { path }
            | Self::Mkdir { path }
            | Self::Delete { path } => validate_path(path),
        }
    }
    fn label(&self) -> &'static str {
        match self {
            Self::Capabilities => "capabilities",
            Self::List { .. } => "list",
            Self::Stat { .. } => "stat",
            Self::Content { .. } => "content",
            Self::Thumbnail { .. } => "thumbnail",
            Self::Mkdir { .. } => "mkdir",
            Self::Rename { .. } => "rename",
            Self::Copy { .. } => "copy",
            Self::Delete { .. } => "delete",
            Self::UploadCreate { .. } => "upload.create",
            Self::UploadStatus { .. } => "upload.status",
            Self::UploadAppend { .. } => "upload.append",
            Self::UploadCancel { .. } => "upload.cancel",
        }
    }
    fn read_only(&self) -> bool {
        matches!(
            self,
            Self::Capabilities
                | Self::List { .. }
                | Self::Stat { .. }
                | Self::Content { .. }
                | Self::Thumbnail { .. }
                | Self::UploadStatus { .. }
        )
    }
    fn build(&self, route: &Route) -> Result<RequestBuilder, String> {
        let (method, endpoint) = match self {
            Self::Capabilities => (Method::GET, "capabilities".into()),
            Self::List { .. } => (Method::GET, "list".into()),
            Self::Stat { .. } => (Method::GET, "stat".into()),
            Self::Content { .. } => (Method::GET, "content".into()),
            Self::Thumbnail { .. } => (Method::GET, "thumbnail".into()),
            Self::Mkdir { .. } => (Method::POST, "mkdir".into()),
            Self::Rename { .. } => (Method::POST, "rename".into()),
            Self::Copy { .. } => (Method::POST, "copy".into()),
            Self::Delete { .. } => (Method::POST, "delete".into()),
            Self::UploadCreate { .. } => (Method::POST, "uploads".into()),
            Self::UploadStatus { id }
            | Self::UploadAppend { id, .. }
            | Self::UploadCancel { id } => {
                if id.len() > 128
                    || id.is_empty()
                    || !id
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
                {
                    return Err("[invalid_request] 上传标识无效".into());
                }
                (
                    match self {
                        Self::UploadStatus { .. } => Method::HEAD,
                        Self::UploadCancel { .. } => Method::DELETE,
                        _ => Method::PATCH,
                    },
                    format!("uploads/{id}"),
                )
            }
        };
        let mut request = route
            .client
            .request(method, format!("{}/api/v1/{endpoint}", route.endpoint))
            .basic_auth(&route.username, Some(&route.password))
            .timeout(Duration::from_secs(
                if matches!(self, Self::Content { .. }) {
                    3600
                } else {
                    30
                },
            ));
        match self {
            Self::List {
                path,
                offset,
                limit,
                revision,
            } => {
                validate_path(path)?;
                if *limit == 0 || *limit > 2000 || *offset > 1_000_000 {
                    return Err("[invalid_request] 分页超出上限".into());
                }
                request = request.query(&[
                    ("path", path.clone()),
                    ("offset", offset.to_string()),
                    ("limit", limit.to_string()),
                ]);
                if let Some(revision) = revision {
                    request = request.query(&[("revision", revision)]);
                }
            }
            Self::Stat { path } | Self::Content { path, .. } | Self::Thumbnail { path } => {
                validate_path(path)?;
                request = request.query(&[("path", path)]);
                if let Self::Content {
                    range: Some(range), ..
                } = self
                {
                    if range.len() > 100
                        || !range.starts_with("bytes=")
                        || !range
                            .bytes()
                            .all(|b| b.is_ascii_digit() || b"bytes=-".contains(&b))
                    {
                        return Err("[invalid_request] Range 格式无效".into());
                    }
                    request = request.header("Range", range);
                }
            }
            Self::Mkdir { path } | Self::Delete { path } => {
                validate_path(path)?;
                request = request.json(&json!({"path":path}));
            }
            Self::Rename { path, destination } | Self::Copy { path, destination } => {
                validate_path(path)?;
                validate_path(destination)?;
                request = request.json(&json!({"path":path,"destination":destination}));
            }
            Self::UploadCreate { path, length } => {
                validate_path(path)?;
                if *length > 1_099_511_627_776 {
                    return Err("[too_large] 上传超过 1 TiB".into());
                }
                request = request
                    .header("Tus-Resumable", "1.0.0")
                    .header("Upload-Length", length.to_string())
                    .header("Upload-Metadata", format!("path {}", B64.encode(path)))
                    .body("");
            }
            Self::UploadStatus { .. } | Self::UploadCancel { .. } => {
                request = request.header("Tus-Resumable", "1.0.0");
            }
            Self::UploadAppend { offset, bytes, .. } => {
                if bytes.len() > 8 * 1024 * 1024 {
                    return Err("[too_large] 上传分块超过 8 MiB".into());
                }
                request = request
                    .header("Tus-Resumable", "1.0.0")
                    .header("Upload-Offset", offset.to_string())
                    .header("Content-Type", "application/offset+octet-stream")
                    .body(bytes.clone());
            }
            Self::Capabilities => {}
        }
        Ok(request)
    }
}
fn validate_path(path: &str) -> Result<(), String> {
    crate::storage::components(path)
        .map(|_| ())
        .map_err(|e| format!("[{}] {}", e.code, e.message))
}

#[derive(Clone)]
pub struct FileLease {
    groups: Arc<Groups>,
    group: String,
    peer: String,
    session: Arc<()>,
    epoch: Arc<AtomicU64>,
    stamp: u64,
}
impl FileLease {
    pub fn check(&self) -> Result<(), String> {
        if self.epoch.load(Ordering::SeqCst) != self.stamp {
            return Err("[authorization_revoked] 本机设备组授权已改变".into());
        }
        self.groups
            .session_access(&self.group, &self.peer, false, Some(&self.session))
            .map(|_| ())
            .map_err(|_| "[authorization_revoked] 本机设备组授权已撤销".into())
    }
}
pub struct FileResponse {
    pub response: Response,
    pub lease: FileLease,
}
impl FileResponse {
    pub async fn chunk(&mut self) -> Result<Option<bytes::Bytes>, String> {
        self.lease.check()?;
        let chunk = self
            .response
            .chunk()
            .await
            .map_err(|_| "[response_interrupted] 远端读取中断，未自动重放")?;
        self.lease.check()?;
        Ok(chunk)
    }
    pub async fn json(mut self, limit: usize) -> Result<Value, String> {
        let mut bytes = Vec::new();
        while let Some(chunk) = self.chunk().await? {
            if bytes.len().saturating_add(chunk.len()) > limit {
                return Err("[response_too_large] 远端响应超过上限".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| "[invalid_response] 远端返回了无效 JSON".into())
    }
}
impl Connector {
    pub fn file_lease(&self, group: &str, peer: &str) -> Result<FileLease, String> {
        let stamp = self.file_epoch.load(Ordering::SeqCst);
        let session = self
            .groups
            .session_access(group, peer, false, None)
            .map_err(|_| "[authorization_revoked] 本机设备组授权已撤销")?
            .1;
        let lease = FileLease {
            groups: self.groups.clone(),
            group: group.into(),
            peer: peer.into(),
            session,
            epoch: self.file_epoch.clone(),
            stamp,
        };
        lease.check()?;
        Ok(lease)
    }
    fn usable_file_route(&self, group: &str, peer: &str) -> Option<Route> {
        let server = member(&self.groups, group, peer).ok()?;
        self.routes
            .lock()
            .ok()?
            .get(&format!("{group}:{peer}"))
            .filter(|r| {
                r.usable
                    && r.verified.elapsed() < Duration::from_secs(25 * 60)
                    && r.fingerprint == server.fingerprint
                    && server.endpoints.contains(&r.endpoint)
                    && r.network == network(&r.endpoint)
            })
            .cloned()
    }
    fn discard_file_route(&self, group: &str, peer: &str, route: &Route) {
        if let Some(active) = self
            .routes
            .lock()
            .unwrap()
            .get_mut(&format!("{group}:{peer}"))
        {
            if active.verified == route.verified {
                active.usable = false;
            }
        }
    }
    fn file_report(
        &self,
        group: &str,
        peer: &str,
        operation: &FileRequest,
        route: &Route,
        start: Instant,
        success: bool,
        code: String,
    ) {
        // Cover/content successes do not drown the connection proof in a
        // thumbnail-heavy folder. Failures always remain diagnostic evidence.
        if success
            && matches!(
                operation,
                FileRequest::Content { .. }
                    | FileRequest::Thumbnail { .. }
                    | FileRequest::Stat { .. }
            )
        {
            return;
        }
        let elapsed = start.elapsed().as_millis() as u64;
        let mut report = Report {
            group: group.into(),
            peer: peer.into(),
            trigger: format!("file.{}", operation.label()),
            started_at: now_ms().saturating_sub(elapsed),
            duration_ms: elapsed,
            outcome: if success {
                "connected"
            } else {
                "request_failed"
            }
            .into(),
            certainty: if code.starts_with("http_") || success || code == "identity_mismatch" {
                "confirmed"
            } else {
                "unknown"
            }
            .into(),
            endpoint: Some(route.endpoint.clone()),
            steps: vec![],
            attempts: 0,
            remaining_ms: 0,
            retry_after_ms: 0,
            route_type: Some(route_type(&route.endpoint).into()),
        };
        report.step(
            &format!("file.{}", operation.label()),
            Some(&route.endpoint),
            if success { "succeeded" } else { "failed" },
            &code,
            start,
        );
        self.record(report);
    }
    /// Reads may reacquire a stale connection once before receiving a body.
    /// A submitted mutation is never automatically replayed, even after 401.
    pub async fn file_request(
        &self,
        group: &str,
        peer: &str,
        operation: FileRequest,
    ) -> Result<FileResponse, String> {
        operation.validate()?;
        let stamp = self.file_epoch.load(Ordering::SeqCst);
        let session = self
            .groups
            .session_access(group, peer, false, None)
            .map_err(|_| "[authorization_revoked] 设备组不存在或设备已移除")?
            .1;
        let lease = FileLease {
            groups: self.groups.clone(),
            group: group.into(),
            peer: peer.into(),
            session,
            epoch: self.file_epoch.clone(),
            stamp,
        };
        for attempt in 0..2 {
            lease.check()?;
            let route = if let Some(route) = self.usable_file_route(group, peer) {
                route
            } else {
                let report = self.connect(group, peer, None, "file_read").await;
                if report.outcome != "connected" {
                    return Err(format!("[{}] 无法连接设备，请查看连接诊断", report.outcome));
                }
                self.usable_file_route(group, peer)
                    .ok_or("[authorization_revoked] 连接状态已失效")?
            };
            lease.check()?;
            let start = Instant::now();
            let response = operation.build(&route)?.send().await;
            lease.check()?;
            let (success, code) = match &response {
                Ok(response) => (
                    response.status().is_success(),
                    if response.status().is_success() {
                        "response_received".into()
                    } else {
                        format!("http_{}", response.status().as_u16())
                    },
                ),
                Err(error) => (
                    false,
                    if format!("{error:?}").contains("identity_mismatch") {
                        "identity_mismatch"
                    } else if error.is_timeout() {
                        "response_slow"
                    } else {
                        "transport_error"
                    }
                    .into(),
                ),
            };
            self.file_report(
                group,
                peer,
                &operation,
                &route,
                start,
                success,
                code.clone(),
            );
            let retry = attempt == 0
                && operation.read_only()
                && match &response {
                    Ok(response) => response.status() == reqwest::StatusCode::UNAUTHORIZED,
                    Err(error) => {
                        error.is_connect() && !format!("{error:?}").contains("identity_mismatch")
                    }
                };
            if retry {
                self.discard_file_route(group, peer, &route);
                continue;
            }
            let response = response.map_err(|_| {
                format!(
                    "[{code}] {}；{}",
                    if code == "identity_mismatch" {
                        "TLS 或设备身份不符，未发送文件凭据"
                    } else if code == "response_slow" {
                        "远端响应超时，不能据此判断设备离线"
                    } else {
                        "网络请求失败"
                    },
                    if operation.read_only() {
                        "读取已停止，不会无限探测"
                    } else {
                        "写入结果可能不明，请核对目标，不会自动重放"
                    }
                )
            })?;
            let status = response.status();
            if !status.is_success() {
                if status.as_u16() == 401 {
                    self.discard_file_route(group, peer, &route);
                }
                let code = match status.as_u16() {
                    401 => "unauthorized",
                    403 => "forbidden",
                    404 => "not_found",
                    409 | 412 => "conflict",
                    423 => "locked",
                    413 => "too_large",
                    416 => "range_not_satisfiable",
                    429 => "busy",
                    _ => "remote_error",
                };
                return Err(format!(
                    "[{code}] 设备返回 HTTP {}，未自动重放操作",
                    status.as_u16()
                ));
            }
            return Ok(FileResponse { response, lease });
        }
        Err("[unreachable] 设备连接未恢复".into())
    }
}
