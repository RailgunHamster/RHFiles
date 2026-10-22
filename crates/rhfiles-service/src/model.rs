use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShareConfig {
    pub name: String,
    pub path: PathBuf,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Permissions {
    #[serde(default)]
    pub write: bool,
    #[serde(default)]
    pub delete: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub permissions: Permissions,
    pub created_ms: u64,
    #[serde(skip_serializing)]
    pub secret_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredDevice {
    pub id: String,
    pub name: String,
    pub permissions: Permissions,
    pub created_ms: u64,
    pub secret_hash: String,
}

impl From<&StoredDevice> for Device {
    fn from(v: &StoredDevice) -> Self {
        Self {
            id: v.id.clone(),
            name: v.name.clone(),
            permissions: v.permissions.clone(),
            created_ms: v.created_ms,
            secret_hash: String::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Credential {
    pub username: String,
    pub password: String,
    pub device: Device,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    /// Virtual path only: /ShareName/relative/path. Never a host filesystem path.
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: u64,
    pub revision: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub path: String,
    pub offset: usize,
    pub total: usize,
    pub revision: String,
    pub entries: Vec<Entry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pairing {
    pub code: String,
    pub expires_ms: u64,
    pub fingerprint: String,
    pub endpoints: Vec<String>,
    pub connection_uri: String,
    pub qr_svg: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub running: bool,
    pub port: u16,
    pub fingerprint: String,
    pub certificate_pem: String,
    pub endpoints: Vec<String>,
    pub shares: Vec<ShareConfig>,
    pub devices: Vec<Device>,
    pub active_uploads: usize,
}

#[derive(Clone, Debug)]
pub struct Error {
    pub code: &'static str,
    pub message: String,
}
impl Error {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for Error {}
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        use std::io::ErrorKind::*;
        let code = match e.kind() {
            NotFound => "not_found",
            AlreadyExists => "conflict",
            PermissionDenied => "forbidden",
            _ => "io_error",
        };
        // No absolute paths, credentials or OS error details in remote replies.
        Self::new(
            code,
            match e.kind() {
                NotFound => "文件或文件夹不存在",
                AlreadyExists => "目标已存在，未覆盖",
                PermissionDenied => "没有权限或路径不在共享范围内",
                _ => "文件操作失败，请在电脑端检查磁盘和权限",
            },
        )
    }
}
pub type Result<T> = std::result::Result<T, Error>;

pub(crate) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub(crate) fn random() -> Result<String> {
    use base64::Engine;
    let mut b = [0u8; 32];
    getrandom::fill(&mut b).map_err(|_| Error::new("random", "安全随机数不可用"))?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b))
}
