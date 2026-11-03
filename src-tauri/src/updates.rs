use semver::Version;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex, mpsc},
    time::{Duration, Instant},
};
use tauri::Emitter;
use url::Url;
use velopack::{
    Error as VelopackError, UpdateCheck, UpdateManager, VelopackAsset, VelopackAssetFeed,
    bundle::Manifest, sources::UpdateSource,
};

const DEFAULT_UPDATE_SOURCE: &str = "https://cnb.cool/railgunhamster/RHFiles";
const FEED_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(20);
const DOWNLOAD_BODY_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const MAX_RELEASE_HISTORY_BYTES: usize = 2 * 1024 * 1024;
const MAX_UPDATE_LOG_BYTES: u64 = 2 * 1024 * 1024;
const BUNDLED_RELEASE_HISTORY: &str =
    include_str!(concat!(env!("OUT_DIR"), "/release-history.json"));

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    managed: bool,
    is_portable: bool,
    current_version: String,
    available_version: Option<String>,
    release_notes: String,
    pending_restart: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseHistoryEntry {
    version: String,
    notes_markdown: String,
    #[serde(default)]
    published_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseHistoryDocument {
    schema_version: u32,
    releases: Vec<ReleaseHistoryEntry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseHistoryResponse {
    current_version: String,
    releases: Vec<ReleaseHistoryEntry>,
    source: String,
    warning: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    percentage: i16,
    phase: &'static str,
    version: String,
    downloaded_bytes: u64,
    total_bytes: u64,
    speed: u64,
    message: String,
}

static UPDATE_OPERATION: Mutex<()> = Mutex::new(());
static UPDATE_WINDOW: LazyLock<Mutex<Option<crate::update_splash::Session>>> = LazyLock::new(|| Mutex::new(None));
static APPLY_FILE: Mutex<Option<File>> = Mutex::new(None);
fn emit_update(app: &tauri::AppHandle, progress: UpdateProgress) {
    let _ = app.emit("update-progress", &progress);
    if let Ok(window) = UPDATE_WINDOW.lock() { if let Some(window) = window.as_ref() { window.send(&progress); } }
}
fn phase(app: &tauri::AppHandle, name: &'static str, version: &str, message: &str) {
    emit_update(app, UpdateProgress { percentage: if name == "ready" {100} else {0}, phase:name,
        version:version.into(), downloaded_bytes:0,total_bytes:0,speed:0,message:message.chars().take(1000).collect() });
}
fn locator() -> Result<velopack::locator::VelopackLocator, String> {
    velopack::locator::auto_locate_app_manifest(velopack::locator::LocationContext::FromCurrentExe).map_err(|e|e.to_string())
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFailureInfo {
    category: String,
    message: String,
    technical_detail: Option<String>,
    target_version: Option<String>,
    log_path: String,
    search_path: Option<String>,
}

#[derive(Clone)]
enum WebSourceKind {
    Github { download_base: Url },
    Gitee { repository_base: Url },
    Cnb { repository_base: Url },
    Static { base_url: Url },
}

/// Velopack's Rust GitHub source does not read the Windows Internet Options proxy and
/// downloads the feed from every recent release. RHFiles uses a small source wrapper so
/// the configured proxy is explicit, checks are bounded, and GitHub's latest-release asset
/// URL can retrieve the cumulative feed without consuming REST API quota.
#[derive(Clone)]
struct ConfiguredWebSource {
    kind: WebSourceKind,
    feed_agent: ureq::Agent,
    download_agent: ureq::Agent,
    reporter: Option<Arc<dyn Fn(u64, u64, u64) + Send + Sync>>,
}

pub(super) fn validate_asset_name(name: &str) -> Result<(), VelopackError> {
    if name.is_empty()
        || matches!(name, "." | "..")
        || name.chars().any(|c| matches!(c, '/' | '\\' | ':' | '\0'))
    {
        return Err(VelopackError::Other("Invalid update asset filename".into()));
    }
    Ok(())
}

impl ConfiguredWebSource {
    fn new(source: &str, proxy: Option<&str>) -> Result<Self, VelopackError> {
        let source_url = Url::parse(source)?;
        if !matches!(source_url.scheme(), "http" | "https") {
            return Err(VelopackError::Other(format!(
                "Unsupported web update source scheme: {}",
                source_url.scheme()
            )));
        }

        let proxy = normalize_proxy_address(proxy).map_err(VelopackError::Other)?;
        let feed_agent = build_http_agent(proxy.as_deref(), true)?;
        let download_agent = build_http_agent(proxy.as_deref(), false)?;

        let kind = if source_url
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case("github.com"))
        {
            let segments: Vec<_> = source_url
                .path_segments()
                .map(|items| items.filter(|item| !item.is_empty()).collect())
                .unwrap_or_default();
            if segments.len() < 2 {
                return Err(VelopackError::Other(
                    "GitHub update source must be a repository URL".to_string(),
                ));
            }
            let owner = segments[0];
            let repository = segments[1].trim_end_matches(".git");
            WebSourceKind::Github {
                download_base: Url::parse(&format!(
                    "https://github.com/{owner}/{repository}/releases/latest/download/"
                ))?,
            }
        } else if source_url
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case("gitee.com"))
        {
            if source_url.scheme() != "https"
                || source_url.port().is_some()
                || !source_url.username().is_empty()
                || source_url.password().is_some()
                || source_url.query().is_some()
                || source_url.fragment().is_some()
            {
                return Err(VelopackError::Other("Gitee update source must be a public HTTPS repository URL without credentials or query parameters".into()));
            }
            let parts: Vec<_> = source_url
                .path_segments()
                .unwrap_or_else(|| unreachable!())
                .filter(|part| !part.is_empty())
                .collect();
            if parts.len() != 2 || parts.iter().any(|part| !repository_component(part)) {
                return Err(VelopackError::Other("Gitee update source must be a repository URL, for example https://gitee.com/owner/repository".into()));
            }
            let repository = parts[1].strip_suffix(".git").unwrap_or(parts[1]);
            if !repository_component(repository) {
                return Err(VelopackError::Other("Invalid Gitee repository name".into()));
            }
            WebSourceKind::Gitee {
                repository_base: Url::parse(&format!(
                    "https://gitee.com/{}/{repository}/releases/download/",
                    parts[0]
                ))?,
            }
        } else if source_url
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case("cnb.cool"))
        {
            if source_url.scheme() != "https"
                || source_url.port().is_some()
                || !source_url.username().is_empty()
                || source_url.password().is_some()
                || source_url.query().is_some()
                || source_url.fragment().is_some()
                || source.contains('%')
                || source.split('/').any(|part| matches!(part, "." | ".."))
            {
                return Err(VelopackError::Other("CNB update source must be a public HTTPS repository URL without credentials or query parameters".into()));
            }
            let mut parts: Vec<_> = source_url
                .path()
                .trim_end_matches('/')
                .split('/')
                .skip(1)
                .collect();
            if !(2..=10).contains(&parts.len())
                || parts.iter().any(|p| !repository_component(p) || *p == "-")
            {
                return Err(VelopackError::Other("CNB update source must be a repository URL, for example https://cnb.cool/group/repository (nested groups are supported)".into()));
            }
            let last = parts.last_mut().unwrap();
            *last = last.strip_suffix(".git").unwrap_or(last);
            if !repository_component(last) || *last == "-" {
                return Err(VelopackError::Other("Invalid CNB repository name".into()));
            }
            WebSourceKind::Cnb {
                repository_base: Url::parse(&format!(
                    "https://cnb.cool/{}/-/releases/",
                    parts.join("/")
                ))?,
            }
        } else {
            let base = format!("{}/", source.trim_end_matches('/'));
            WebSourceKind::Static {
                base_url: Url::parse(&base)?,
            }
        };

        Ok(Self {
            kind,
            feed_agent,
            download_agent,
            reporter: None,
        })
    }

    fn get_text(&self, url: &str, accept: &str) -> Result<String, VelopackError> {
        let mut response = self
            .feed_agent
            .get(url)
            .header("Accept", accept)
            .header("Cache-Control", "no-cache")
            .call()
            .map_err(|error| web_error("Unable to retrieve update metadata", error))?;
        response
            .body_mut()
            .read_to_string()
            .map_err(|error| web_error("Unable to read update metadata", error))
    }

    fn get_release_history_text(&self) -> Result<String, VelopackError> {
        let url = match &self.kind {
            WebSourceKind::Github { download_base } => {
                download_base.join("release-history.json")?
            }
            WebSourceKind::Static { base_url } => base_url.join("release-history.json")?,
            WebSourceKind::Gitee { repository_base } => {
                repository_base.join("latest/release-history.json")?
            }
            WebSourceKind::Cnb { repository_base } => {
                repository_base.join("latest/download/release-history.json")?
            }
        };
        self.get_text(url.as_str(), "application/json")
    }

    fn download_to_file(
        &self,
        url: &str,
        local_file: &Path,
        progress_sender: Option<mpsc::Sender<i16>>,
        expected_size: u64,
    ) -> Result<(), VelopackError> {
        let response = self
            .download_agent
            .get(url)
            .header("Accept", "application/octet-stream")
            .call()
            .map_err(|error| web_error("Unable to download update package", error))?;
        let (head, body) = response.into_parts();
        let total_size = head
            .headers
            .get("Content-Length")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        if total_size.is_some_and(|size| size != expected_size) {
            return Err(VelopackError::Other("[update_package] Download response size does not match the update feed".into()));
        }
        let mut reader = body.into_reader();
        let mut output = File::create(local_file)?;
        let mut buffer = vec![0_u8; 2 * 1024 * 1024];
        let mut downloaded = 0_u64;
        let mut last_progress = -1_i16;
        let started = Instant::now();
        let mut last_report = Instant::now() - Duration::from_secs(1);

        loop {
            let count = reader.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            output.write_all(&buffer[..count])?;
            downloaded += count as u64;
            if downloaded > expected_size { return Err(VelopackError::Other("[update_package] Download exceeds declared package size".into())); }
            if last_report.elapsed() >= Duration::from_millis(100) {
                if let Some(report) = &self.reporter { report(downloaded,total_size.unwrap_or(0),(downloaded as f64 / started.elapsed().as_secs_f64().max(0.001)) as u64); }
                last_report = Instant::now();
            }
            if let Some(total) = total_size.filter(|total| *total > 0) {
                let percentage = ((downloaded.saturating_mul(100) / total).min(100)) as i16;
                if percentage > last_progress {
                    last_progress = percentage;
                    if let Some(sender) = &progress_sender {
                        let _ = sender.send(percentage);
                    }
                }
            }
        }

        output.sync_all()?;
        if let Some(report) = &self.reporter { report(downloaded,total_size.unwrap_or(0),(downloaded as f64 / started.elapsed().as_secs_f64().max(0.001)) as u64); }

        if let Some(sender) = &progress_sender {
            let _ = sender.send(100);
        }
        Ok(())
    }
}

fn repository_component(value: &str) -> bool {
    !value.is_empty()
        && !matches!(value, "." | "..")
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
}

fn gitee_asset_url(repository_base: &Url, asset: &VelopackAsset) -> Result<Url, VelopackError> {
    validate_asset_name(&asset.FileName)?;
    // Latest is a cross-platform index only. Resolve payloads from their immutable
    // Windows tag, never from an Android release or a moving "latest" URL.
    let version = Version::parse(&asset.Version)?;
    let mut url = repository_base.clone();
    url.path_segments_mut()
        .map_err(|_| VelopackError::Other("Invalid Gitee download URL".into()))?
        .pop_if_empty()
        .push(&format!("v{version}"))
        .push(&asset.FileName);
    Ok(url)
}

fn cnb_asset_url(repository_base: &Url, asset: &VelopackAsset) -> Result<Url, VelopackError> {
    validate_asset_name(&asset.FileName)?;
    let version = Version::parse(&asset.Version)?;
    let mut url = repository_base.clone();
    url.path_segments_mut()
        .map_err(|_| VelopackError::Other("Invalid CNB download URL".into()))?
        .pop_if_empty()
        .push("download")
        .push(&format!("v{version}"))
        .push(&asset.FileName);
    Ok(url)
}

impl UpdateSource for ConfiguredWebSource {
    fn get_release_feed(
        &self,
        channel: &str,
        app: &Manifest,
        staged_user_id: &str,
    ) -> Result<VelopackAssetFeed, VelopackError> {
        let feed_name = format!("releases.{channel}.json");
        validate_asset_name(&feed_name)?;
        let json = match &self.kind {
            WebSourceKind::Github { download_base } => self.get_text(
                download_base.join(&feed_name)?.as_str(),
                "application/octet-stream",
            )?,
            WebSourceKind::Gitee { repository_base } => self.get_text(
                repository_base
                    .join(&format!("latest/{feed_name}"))?
                    .as_str(),
                "application/json",
            )?,
            WebSourceKind::Cnb { repository_base } => self.get_text(
                repository_base
                    .join(&format!("latest/download/{feed_name}"))?
                    .as_str(),
                "application/json",
            )?,
            WebSourceKind::Static { base_url } => {
                let mut url = base_url.join(&feed_name)?;
                let local_version = app.version.to_string();
                url.query_pairs_mut()
                    .append_pair("localVersion", &local_version)
                    .append_pair("id", &app.id)
                    .append_pair("stagingId", staged_user_id);
                self.get_text(url.as_str(), "application/json")?
            }
        };
        let feed: VelopackAssetFeed = serde_json::from_str(&json)?;
        if matches!(self.kind, WebSourceKind::Gitee { .. }) && feed.Assets.is_empty() {
            return Err(VelopackError::Other("Gitee release has no Windows update assets; cannot confirm whether this is the latest version".into()));
        }
        if matches!(self.kind, WebSourceKind::Cnb { .. }) && feed.Assets.is_empty() {
            return Err(VelopackError::Other("CNB release has no Windows update assets; cannot confirm whether this is the latest version".into()));
        }
        Ok(feed)
    }

    fn download_release_entry(
        &self,
        asset: &VelopackAsset,
        local_file: &Path,
        progress_sender: Option<mpsc::Sender<i16>>,
    ) -> Result<(), VelopackError> {
        validate_asset_name(&asset.FileName)?;
        let url = match &self.kind {
            WebSourceKind::Github { download_base } => {
                download_base.join(&asset.FileName)?.to_string()
            }
            WebSourceKind::Static { base_url } => base_url.join(&asset.FileName)?.to_string(),
            WebSourceKind::Gitee { repository_base } => {
                gitee_asset_url(repository_base, asset)?.to_string()
            }
            WebSourceKind::Cnb { repository_base } => {
                cnb_asset_url(repository_base, asset)?.to_string()
            }
        };
        self.download_to_file(&url, local_file, progress_sender, asset.Size)
    }
}

fn web_error(context: &str, error: ureq::Error) -> VelopackError {
    VelopackError::Other(format!("{context}: {error}"))
}

fn normalize_proxy_address(proxy: Option<&str>) -> Result<Option<String>, String> {
    let Some(proxy) = proxy else {
        return Ok(None);
    };
    let proxy = proxy.trim();
    if proxy.is_empty() {
        return Err("Proxy is enabled but no proxy address was provided".to_string());
    }
    let candidate = if proxy.contains("://") {
        proxy.to_string()
    } else {
        format!("http://{proxy}")
    };
    let parsed =
        Url::parse(&candidate).map_err(|error| format!("Invalid proxy address: {error}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS proxies are supported".to_string());
    }
    if parsed.host_str().is_none() {
        return Err("Proxy address must include a host".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Proxy authentication in the address is not supported".to_string());
    }
    Ok(Some(candidate))
}

fn build_http_agent(
    proxy: Option<&str>,
    metadata_only: bool,
) -> Result<ureq::Agent, VelopackError> {
    let mut config = ureq::Agent::config_builder()
        .user_agent(format!("RHFiles-Updater/{}", env!("CARGO_PKG_VERSION")))
        .timeout_resolve(Some(CONNECT_TIMEOUT))
        .timeout_connect(Some(CONNECT_TIMEOUT))
        .timeout_recv_response(Some(RESPONSE_TIMEOUT));
    config = if metadata_only {
        config.timeout_global(Some(FEED_REQUEST_TIMEOUT))
    } else {
        config.timeout_recv_body(Some(DOWNLOAD_BODY_TIMEOUT))
    };
    if let Some(proxy) = proxy {
        let proxy = ureq::Proxy::new(proxy)
            .map_err(|error| VelopackError::Other(format!("Invalid proxy address: {error}")))?;
        config = config.proxy(Some(proxy));
    }
    Ok(config.build().into())
}

fn effective_source(source: Option<String>) -> String {
    source
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_UPDATE_SOURCE.to_string())
}

fn parse_release_history(json: &str) -> Result<Vec<ReleaseHistoryEntry>, String> {
    if json.len() > MAX_RELEASE_HISTORY_BYTES {
        return Err("Release history exceeds the 2 MiB safety limit".to_string());
    }
    let document: ReleaseHistoryDocument =
        serde_json::from_str(json).map_err(|error| error.to_string())?;
    if document.schema_version != 1 {
        return Err(format!(
            "Unsupported release history schema: {}",
            document.schema_version
        ));
    }
    if document.releases.len() > 512 {
        return Err("Release history contains too many entries".to_string());
    }
    let mut releases = Vec::with_capacity(document.releases.len());
    for mut entry in document.releases {
        Version::parse(&entry.version)
            .map_err(|error| format!("Invalid release version {}: {error}", entry.version))?;
        if entry.notes_markdown.trim().is_empty() {
            return Err(format!("Release {} has empty notes", entry.version));
        }
        if entry.notes_markdown.len() > 256 * 1024 {
            return Err(format!("Release {} notes exceed 256 KiB", entry.version));
        }
        entry.published_at = entry.published_at.filter(|date| valid_publication_date(date));
        releases.push(entry);
    }
    Ok(releases)
}

fn valid_publication_date(value: &str) -> bool {
    if value.len() == 10 {
        chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .is_ok_and(|date| date.format("%Y-%m-%d").to_string() == value)
    } else {
        value.len() <= 40 && chrono::DateTime::parse_from_rfc3339(value).is_ok()
    }
}

fn bundled_release_history() -> Vec<ReleaseHistoryEntry> {
    parse_release_history(BUNDLED_RELEASE_HISTORY).unwrap_or_default()
}

fn read_remote_release_history(
    source: &str,
    proxy: Option<&str>,
) -> Result<Vec<ReleaseHistoryEntry>, String> {
    let text = ConfiguredWebSource::new(source, proxy)
        .and_then(|configured| configured.get_release_history_text())
        .map_err(|error| error.to_string())?;
    parse_release_history(&text)
}

fn merge_release_history(
    bundled: Vec<ReleaseHistoryEntry>,
    remote: Vec<ReleaseHistoryEntry>,
) -> Vec<ReleaseHistoryEntry> {
    let mut by_version = HashMap::new();
    for mut entry in bundled.into_iter().chain(remote) {
        if entry.published_at.is_none() {
            entry.published_at = by_version.get(&entry.version)
                .and_then(|old: &ReleaseHistoryEntry| old.published_at.clone());
        }
        by_version.insert(entry.version.clone(), entry);
    }
    let mut releases = by_version.into_values().collect::<Vec<_>>();
    releases.sort_by(|left, right| {
        let left_version = Version::parse(&left.version).ok();
        let right_version = Version::parse(&right.version).ok();
        right_version.cmp(&left_version)
    });
    releases
}

fn velopack_log_path() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|root| {
        PathBuf::from(root)
            .join("velopack")
            .join("velopack_RHFiles.log")
    })
}

fn current_install_search_path() -> Option<String> {
    let executable = std::env::current_exe().ok()?;
    let directory = executable.parent()?;
    if !directory
        .file_name()?
        .to_string_lossy()
        .eq_ignore_ascii_case("current")
    {
        return None;
    }
    Some(directory.to_string_lossy().into_owned())
}

fn read_file_tail(path: &Path, max_bytes: u64) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|error| format!("Unable to open update log {}: {error}", path.display()))?;
    let length = file
        .metadata()
        .map_err(|error| format!("Unable to inspect update log {}: {error}", path.display()))?
        .len();
    let offset = length.saturating_sub(max_bytes);
    if offset > 0 {
        file.seek(SeekFrom::Start(offset))
            .map_err(|error| format!("Unable to seek update log {}: {error}", path.display()))?;
    }
    let mut bytes = Vec::with_capacity((length - offset).min(max_bytes) as usize);
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("Unable to read update log {}: {error}", path.display()))?;
    let mut text = String::from_utf8_lossy(&bytes).into_owned();
    if offset > 0
        && let Some(newline) = text.find('\n')
    {
        text.drain(..=newline);
    }
    Ok(text)
}

fn log_message_after_level(line: &str, level: &str) -> Option<String> {
    let marker = format!("[{level}]");
    line.split_once(&marker)
        .map(|(_, message)| message.trim().to_string())
        .filter(|message| !message.is_empty())
}

fn target_version_from_update_session(session: &str) -> Option<String> {
    for line in session.lines().rev() {
        let Some(package_start) = line.rfind("RHFiles-") else {
            continue;
        };
        let package = &line[package_start + "RHFiles-".len()..];
        for suffix in ["-full.nupkg", "-delta.nupkg"] {
            let Some(version_end) = package.find(suffix) else {
                continue;
            };
            let candidate = &package[..version_end];
            if Version::parse(candidate).is_ok() {
                return Some(candidate.to_string());
            }
        }
    }
    None
}

fn update_failure_category(session: &str) -> &'static str {
    let text = session.to_lowercase();
    if text.contains("code: 32")
        || text.contains("running processes prevented")
        || text.contains("being used by another process")
        || text.contains("used by another process")
        || text.contains("另一个程序正在使用")
        || text.contains("进程无法访问")
    {
        "locked"
    } else if text.contains("code: 112")
        || text.contains("not enough space")
        || text.contains("no space left")
        || text.contains("磁盘空间不足")
    {
        "disk-space"
    } else if text.contains("checksum")
        || text.contains("data corruption")
        || text.contains("corrupt")
        || text.contains("损坏")
    {
        "package"
    } else if text.contains("access denied")
        || text.contains("permission denied")
        || text.contains("拒绝访问")
    {
        "permission"
    } else if text.contains("timed out")
        || text.contains("connection")
        || text.contains("network")
        || text.contains("dns")
    {
        "network"
    } else {
        "unknown"
    }
}

fn parse_last_update_failure(
    log: &str,
    current_version: &str,
    log_path: &Path,
    search_path: Option<String>,
) -> Option<UpdateFailureInfo> {
    let session_start = log.rfind("Starting Velopack Updater")?;
    let session = &log[session_start..];
    if !session.contains("Command: Apply") {
        return None;
    }

    let error_line = session
        .lines()
        .rev()
        .find(|line| line.contains("[ERROR] Apply error:"))
        .or_else(|| session.lines().rev().find(|line| line.contains("[ERROR]")))?;
    let message = log_message_after_level(error_line, "ERROR")?;
    let target_version = target_version_from_update_session(session);
    if let (Some(target), Ok(current)) = (
        target_version
            .as_deref()
            .and_then(|version| Version::parse(version).ok()),
        Version::parse(current_version),
    ) && target <= current
    {
        return None;
    }
    let technical_detail = session
        .lines()
        .rev()
        .find(|line| line.contains("[WARN] Retrying operation") && line.contains("error was:"))
        .and_then(|line| log_message_after_level(line, "WARN"));

    Some(UpdateFailureInfo {
        category: update_failure_category(session).to_string(),
        message,
        technical_detail,
        target_version,
        log_path: log_path.to_string_lossy().into_owned(),
        search_path,
    })
}

fn manager_for(source: &str, proxy: Option<&str>) -> Result<UpdateManager, VelopackError> {
    // No UNC/local fallback: retired home-server paths must fail before any
    // filesystem access, including calls from an old script or old backup.
    UpdateManager::new(ConfiguredWebSource::new(source, proxy)?, None, None)
}

fn unmanaged_status() -> UpdateStatus {
    UpdateStatus {
        managed: false,
        is_portable: false,
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        available_version: None,
        release_notes: String::new(),
        pending_restart: false,
    }
}

fn open_manager(source: &str, proxy: Option<&str>) -> Result<Option<UpdateManager>, String> {
    match manager_for(source, proxy) {
        Ok(manager) => Ok(Some(manager)),
        Err(VelopackError::NotInstalled(_)) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn get_last_update_failure() -> Result<Option<UpdateFailureInfo>, String> {
    let Some(log_path) = velopack_log_path() else {
        return Ok(None);
    };
    if !log_path.is_file() {
        return Ok(None);
    }
    let log = read_file_tail(&log_path, MAX_UPDATE_LOG_BYTES)?;
    Ok(parse_last_update_failure(
        &log,
        env!("CARGO_PKG_VERSION"),
        &log_path,
        current_install_search_path(),
    ))
}

#[tauri::command]
pub async fn check_updates(
    source: Option<String>,
    proxy: Option<String>,
) -> Result<UpdateStatus, String> {
    let source = effective_source(source);
    tauri::async_runtime::spawn_blocking(move || {
        let Some(manager) = open_manager(&source, proxy.as_deref())? else {
            return Ok(unmanaged_status());
        };

        let current_version = manager.get_current_version_as_string();
        let is_portable = manager.get_is_portable();
        if let Ok(Some(verified)) = crate::update_package::ready(&locator()?) {
            let pending = verified.asset;
            return Ok(UpdateStatus {
                managed: true,
                is_portable,
                current_version,
                available_version: Some(pending.Version),
                release_notes: pending.NotesMarkdown,
                pending_restart: true,
            });
        }

        match manager
            .check_for_updates()
            .map_err(|error| error.to_string())?
        {
            UpdateCheck::UpdateAvailable(update) => Ok(UpdateStatus {
                managed: true,
                is_portable,
                current_version,
                available_version: Some(update.TargetFullRelease.Version.clone()),
                release_notes: update.TargetFullRelease.NotesMarkdown.clone(),
                pending_restart: false,
            }),
            UpdateCheck::RemoteIsEmpty | UpdateCheck::NoUpdateAvailable => Ok(UpdateStatus {
                managed: true,
                is_portable,
                current_version,
                available_version: None,
                release_notes: String::new(),
                pending_restart: false,
            }),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_release_history(
    source: Option<String>,
    proxy: Option<String>,
    allow_remote: Option<bool>,
) -> Result<ReleaseHistoryResponse, String> {
    let source = effective_source(source);
    tauri::async_runtime::spawn_blocking(move || {
        let bundled = bundled_release_history();
        if allow_remote == Some(false) {
            return Ok(ReleaseHistoryResponse {
                current_version: env!("CARGO_PKG_VERSION").to_string(),
                releases: bundled,
                source: "bundled".to_string(),
                warning: None,
            });
        }
        match read_remote_release_history(&source, proxy.as_deref()) {
            Ok(remote) => Ok(ReleaseHistoryResponse {
                current_version: env!("CARGO_PKG_VERSION").to_string(),
                releases: merge_release_history(bundled, remote),
                source: "remote".to_string(),
                warning: None,
            }),
            Err(error) => Ok(ReleaseHistoryResponse {
                current_version: env!("CARGO_PKG_VERSION").to_string(),
                releases: bundled,
                source: "bundled".to_string(),
                warning: Some(error),
            }),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn download_update(
    app: tauri::AppHandle,
    source: Option<String>,
    proxy: Option<String>,
    appearance: Option<crate::update_splash::Appearance>,
    target_version: Option<String>,
) -> Result<String, String> {
    let source = effective_source(source);
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = UPDATE_OPERATION.try_lock().map_err(|_| "[update_busy] An update operation is already running")?;
        let manager = open_manager(&source, proxy.as_deref())?
            .ok_or_else(|| "This build is not managed by Velopack".to_string())?;
        let location = locator()?;
        let asset = if let Ok(Some(verified)) = crate::update_package::ready(&location) { verified.asset } else {
            match manager.check_for_updates().map_err(|e|e.to_string())? {
                UpdateCheck::UpdateAvailable(update) => update.TargetFullRelease.clone(),
                _ => return Err("No update is available".into()),
            }
        };
        let version = asset.Version.clone();
        if target_version.as_ref().is_some_and(|expected|expected != &version) { return Err("[update_package] 更新版本已变化，请重新检查 / Update target changed; check again".into()); }
        let window = crate::update_splash::launch_phase(&manager.get_current_version_as_string(), &version,
            appearance.unwrap_or_default(), manager.get_is_portable(), "verifying");
        if let Ok(mut active) = UPDATE_WINDOW.lock() { *active = window.map_err(|e|eprintln!("RHFiles update window: {e}")).ok(); }
        phase(&app,"verifying",&version,"");
        let mut web = ConfiguredWebSource::new(&source,proxy.as_deref()).map_err(|e|e.to_string())?;
        let progress_app = app.clone(); let progress_version = version.clone(); let size = asset.Size;
        web.reporter = Some(Arc::new(move |bytes,_,speed| emit_update(&progress_app,UpdateProgress {
            percentage:((bytes.saturating_mul(100)/size.max(1)).min(99)) as i16,
            phase:"downloading",version:progress_version.clone(),downloaded_bytes:bytes,total_bytes:size,speed,message:String::new(),
        })));
        let result = crate::update_package::stage(&location,&asset,|path| {
            phase(&app,"downloading",&version,"");
            web.download_release_entry(&asset,path,None).map_err(|e|e.to_string())?;
            phase(&app,"verifying",&version,""); Ok(())
        });
        if let Err(error) = result { phase(&app,"failed",&version,&error); return Err(error); }
        phase(&app,"ready",&version,""); Ok(version)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn apply_update(
    source: Option<String>,
    proxy: Option<String>,
    appearance: Option<crate::update_splash::Appearance>,
    target_version: Option<String>,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, crate::types::CancelFlag>,
) -> Result<(), String> {
    let source = effective_source(source);
    let _operation = UPDATE_OPERATION.try_lock().map_err(|_| "[update_busy] An update operation is already running")?;
    let manager = open_manager(&source, proxy.as_deref())?
        .ok_or_else(|| "This build is not managed by Velopack".to_string())?;
    let verified = crate::update_package::ready(&locator()?)?
        .ok_or("[update_package] 没有已校验的更新包，请先下载 / Download and verify the update before installing")?;
    let pending = verified.asset;
    if target_version.as_ref().is_some_and(|expected|expected != &pending.Version) { return Err("[update_package] 待安装版本与本次确认不符，请重新检查 / Pending version differs from the confirmed target".into()); }
    if let Err(error) = cancel.begin_update() { phase(&app,"failed",&pending.Version,&error); return Err(error); }
    phase(&app,"applying",&pending.Version,"");
    let existing = UPDATE_WINDOW.lock().ok().and_then(|mut value|value.take()).and_then(|mut window| {
        let usable = window.alive() && window.prepare_apply(&UpdateProgress {
        percentage:100,phase:"applying",version:pending.Version.clone(),downloaded_bytes:0,total_bytes:0,speed:0,message:String::new(),
        }); usable.then_some(window)
    });
    let transition = existing.or_else(|| crate::update_splash::launch(
        &manager.get_current_version_as_string(), &pending.Version,
        appearance.unwrap_or_default(), manager.get_is_portable(),
    ).map_err(|error| eprintln!("RHFiles update transition: {error}")).ok());
    // Only silence the native updater once our independent window is ready.
    if let Err(error) =
        manager.wait_exit_then_apply_updates(pending, transition.is_some(), true, Vec::<String>::new())
    {
        cancel.abort_update();
        if let Ok(mut window) = UPDATE_WINDOW.lock() { *window = transition; }
        phase(&app,"failed","",&error.to_string());
        return Err(error.to_string());
    }
    if let Ok(mut guard) = APPLY_FILE.lock() { *guard = Some(verified.file); }
    if let Some(transition) = transition { transition.handoff(); }
    // Unlike Velopack's convenience method, AppHandle::exit lets Tauri destroy
    // its windows and WebView2 children before Update.exe replaces `current`.
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_feed_cannot_download_outside_its_source_directory() {
        for name in [
            "",
            ".",
            "..",
            "../other.nupkg",
            "C:\\other.nupkg",
            "\\\\server\\share\\other.nupkg",
            "file:stream",
        ] {
            assert!(validate_asset_name(name).is_err(), "{name}");
        }
        assert!(validate_asset_name("RHFiles-0.1.67-full.nupkg").is_ok());
    }

    #[test]
    fn empty_source_uses_cnb() {
        assert_eq!(effective_source(None), DEFAULT_UPDATE_SOURCE);
        assert_eq!(effective_source(Some("   ".into())), DEFAULT_UPDATE_SOURCE);
    }

    #[test]
    fn gitee_repository_is_not_treated_as_a_static_directory_or_api_endpoint() {
        for url in [
            "https://gitee.com/railgunhamster/RHFiles",
            "https://gitee.com/railgunhamster/RHFiles.git/",
        ] {
            let source = ConfiguredWebSource::new(url, None).unwrap();
            match source.kind {
                WebSourceKind::Gitee { repository_base } => assert_eq!(
                    repository_base.as_str(),
                    "https://gitee.com/railgunhamster/RHFiles/releases/download/"
                ),
                _ => panic!("Wrong Gitee provider"),
            }
        }
        for url in [
            "https://gitee.com/owner",
            "https://gitee.com/owner/repo/releases",
            "http://gitee.com/owner/repo",
            "https://user:password@gitee.com/owner/repo",
            "https://gitee.com/owner/repo?token=x",
            "https://gitee.com/owner/repo#fragment",
            "https://gitee.com:444/owner/repo",
            "https://gitee.com/owner/%2Fother",
        ] {
            assert!(ConfiguredWebSource::new(url, None).is_err(), "{url}");
        }
    }

    #[test]
    fn gitee_packages_are_version_pinned_even_when_android_is_latest() {
        let base = Url::parse("https://gitee.com/example/files/releases/download/").unwrap();
        let asset = VelopackAsset {
            Version: "0.1.73".into(),
            FileName: "RHFiles-0.1.73-full.nupkg".into(),
            ..Default::default()
        };
        assert_eq!(
            gitee_asset_url(&base, &asset).unwrap().as_str(),
            "https://gitee.com/example/files/releases/download/v0.1.73/RHFiles-0.1.73-full.nupkg"
        );
        let escaped = VelopackAsset {
            FileName: "file?#%.nupkg".into(),
            ..asset.clone()
        };
        let url = gitee_asset_url(&base, &escaped).unwrap();
        assert!(url.query().is_none() && url.fragment().is_none());
        assert!(url.path().ends_with("file%3F%23%25.nupkg"));
        assert!(
            gitee_asset_url(
                &base,
                &VelopackAsset {
                    Version: "../android-v0.1.22".into(),
                    ..asset.clone()
                }
            )
            .is_err()
        );
        assert!(
            gitee_asset_url(
                &base,
                &VelopackAsset {
                    FileName: "../secret".into(),
                    ..asset
                }
            )
            .is_err()
        );
    }

    #[test]
    fn gitee_and_cnb_feed_history_and_payload_use_separate_expected_routes() {
        use std::net::TcpListener;
        for cnb in [false, true] {
            let asset = VelopackAsset {
                PackageId: "RHFiles".into(),
                Version: "0.1.73".into(),
                Type: "Full".into(),
                FileName: "RHFiles-0.1.73-full.nupkg".into(),
                Size: 3,
                ..Default::default()
            };
            let json = serde_json::to_string(&VelopackAssetFeed {
                Assets: vec![asset.clone()],
            })
            .unwrap();
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                for (route, body) in [
                    (
                        if cnb {
                            "/latest/download/releases.win.json"
                        } else {
                            "/latest/releases.win.json"
                        },
                        json,
                    ),
                    (
                        if cnb {
                            "/latest/download/release-history.json"
                        } else {
                            "/latest/release-history.json"
                        },
                        "{\"schemaVersion\":1,\"releases\":[]}".into(),
                    ),
                    (
                        if cnb {
                            "/download/v0.1.73/RHFiles-0.1.73-full.nupkg"
                        } else {
                            "/v0.1.73/RHFiles-0.1.73-full.nupkg"
                        },
                        "abc".into(),
                    ),
                ] {
                    let deadline = std::time::Instant::now() + Duration::from_secs(10);
                    let mut stream = loop {
                        match listener.accept() {
                            Ok((stream, _)) => break stream,
                            Err(error)
                                if error.kind() == std::io::ErrorKind::WouldBlock
                                    && std::time::Instant::now() < deadline =>
                            {
                                std::thread::sleep(Duration::from_millis(10))
                            }
                            Err(error) => panic!("No bounded update request: {error}"),
                        }
                    };
                    stream
                        .set_read_timeout(Some(Duration::from_secs(5)))
                        .unwrap();
                    // Winsock may retain the listener's nonblocking mode on an
                    // accepted socket. The bounded accept loop must not turn the
                    // subsequent blocking HTTP header reader into a flaky poll.
                    stream.set_nonblocking(false).unwrap();
                    let mut request = Vec::new();
                    while !request.ends_with(b"\r\n\r\n") {
                        let mut byte = [0];
                        assert_eq!(stream.read(&mut byte).unwrap(), 1);
                        request.push(byte[0]);
                        assert!(request.len() < 8192);
                    }
                    assert!(
                        String::from_utf8_lossy(&request)
                            .starts_with(&format!("GET {route} HTTP/1.1"))
                    );
                    stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).unwrap();
                }
            });
            let mut source = ConfiguredWebSource::new(&format!("http://{address}"), None).unwrap();
            // A loopback fixture only. Production Gitee sources require HTTPS.
            source.kind = if cnb {
                WebSourceKind::Cnb {
                    repository_base: Url::parse(&format!("http://{address}/")).unwrap(),
                }
            } else {
                WebSourceKind::Gitee {
                    repository_base: Url::parse(&format!("http://{address}/")).unwrap(),
                }
            };
            let feed = source
                .get_release_feed("win", &Manifest::default(), "")
                .unwrap();
            assert_eq!(feed.Assets[0].Version, "0.1.73");
            assert!(
                source
                    .get_release_history_text()
                    .unwrap()
                    .contains("schemaVersion")
            );
            let directory = crate::test_support::TestDir::new("gitee-download");
            let target = directory.0.join("update.nupkg");
            source
                .download_release_entry(&asset, &target, None)
                .unwrap();
            assert_eq!(std::fs::read(target).unwrap(), b"abc");
            server.join().unwrap();
        }
    }

    #[test]
    fn cnb_accepts_nested_public_repositories_and_pins_payloads() {
        for value in [
            "https://cnb.cool/example/sub/RHFiles",
            "https://cnb.cool/example/sub/RHFiles.git/",
        ] {
            let source = ConfiguredWebSource::new(value, None).unwrap();
            let WebSourceKind::Cnb { repository_base } = source.kind else {
                panic!("Wrong CNB provider")
            };
            assert_eq!(
                repository_base.as_str(),
                "https://cnb.cool/example/sub/RHFiles/-/releases/"
            );
            let asset = VelopackAsset {
                Version: "0.1.91".into(),
                FileName: "RHFiles-0.1.91-full.nupkg".into(),
                ..Default::default()
            };
            assert_eq!(
                cnb_asset_url(&repository_base, &asset).unwrap().as_str(),
                "https://cnb.cool/example/sub/RHFiles/-/releases/download/v0.1.91/RHFiles-0.1.91-full.nupkg"
            );
        }
        for value in [
            "http://cnb.cool/a/b",
            "https://u:p@cnb.cool/a/b",
            "https://cnb.cool/a/b?token=x",
            "https://cnb.cool/a/b#x",
            "https://cnb.cool:444/a/b",
            "https://cnb.cool/a/b/-/releases",
            "https://cnb.cool/a/../b",
            "https://cnb.cool/a/%2e/b",
            "https://cnb.cool/a/.git",
            "https://cnb.cool/a/-.git",
        ] {
            assert!(ConfiguredWebSource::new(value, None).is_err(), "{value}");
        }
    }

    #[test]
    fn retired_family_paths_are_never_read_as_update_sources() {
        for source in [
            r"\\SERVER-HOME\Public\Software\RHFiles-Releases",
            r"C:\packages",
            "file:///C:/packages",
        ] {
            assert!(ConfiguredWebSource::new(source, None).is_err());
            assert!(read_remote_release_history(source, None).is_err());
        }
    }

    #[test]
    fn local_and_remote_sources_are_preserved() {
        assert_eq!(
            effective_source(Some(
                r"\\SERVER-HOME\Public\Software\RHFiles-Releases".into()
            )),
            r"\\SERVER-HOME\Public\Software\RHFiles-Releases"
        );
        assert_eq!(
            effective_source(Some("https://example.invalid/releases".into())),
            "https://example.invalid/releases"
        );
    }

    #[test]
    fn parses_the_latest_failed_apply_session_and_prioritizes_file_locks() {
        let log = r#"
[update:10] [20:36:03] [INFO] Starting Velopack Updater (1.2.0)
[update:10] [20:36:03] [INFO] Command: Apply
[update:10] [20:36:03] [INFO] Package: Some("D:\software\RHFiles\packages\RHFiles-0.1.18-full.nupkg")
[update:10] [20:36:03] [WARN] Failed to wait for process (123) to exit (Access denied.)
[update:10] [20:36:04] [WARN] Retrying operation in 1000ms... (error was: Some(Os { code: 32, message: "The process cannot access the file because it is being used by another process." }))
[update:10] [20:36:14] [ERROR] Apply error: Unable to start the update, because one or more running processes prevented it.
[update:10] [20:36:14] [ERROR] An error has occurred: Apply error: Unable to start the update.
"#;
        let failure = parse_last_update_failure(
            log,
            "0.1.17",
            Path::new(r"C:\Users\test\AppData\Local\velopack\velopack_RHFiles.log"),
            Some(r"D:\software\RHFiles\current".to_string()),
        )
        .expect("failed apply should be reported");
        assert_eq!(failure.category, "locked");
        assert_eq!(failure.target_version.as_deref(), Some("0.1.18"));
        assert!(failure.message.contains("running processes"));
        assert!(
            failure
                .technical_detail
                .as_deref()
                .unwrap()
                .contains("code: 32")
        );
        assert_eq!(
            failure.search_path.as_deref(),
            Some(r"D:\software\RHFiles\current")
        );
    }

    #[test]
    fn ignores_stale_or_superseded_update_failures() {
        let failed = r#"
[update:10] [10:00:00] [INFO] Starting Velopack Updater (1.2.0)
[update:10] [10:00:00] [INFO] Command: Apply
[update:10] [10:00:00] [INFO] Package: Some("D:\RHFiles\packages\RHFiles-0.1.18-full.nupkg")
[update:10] [10:00:01] [ERROR] Apply error: Access denied.
"#;
        assert!(
            parse_last_update_failure(failed, "0.1.18", Path::new("update.log"), None).is_none(),
            "a failure for the installed version is stale"
        );

        let followed_by_success = format!(
            "{failed}\n[update:11] [10:05:00] [INFO] Starting Velopack Updater (1.2.0)\n\
             [update:11] [10:05:00] [INFO] Command: Apply\n\
             [update:11] [10:05:00] [INFO] Package: Some(\"D:\\RHFiles\\packages\\RHFiles-0.1.19-full.nupkg\")\n\
             [update:11] [10:05:02] [INFO] Complete: Apply package"
        );
        assert!(
            parse_last_update_failure(
                &followed_by_success,
                "0.1.17",
                Path::new("update.log"),
                None
            )
            .is_none(),
            "only the latest updater session should determine the status"
        );
    }

    #[test]
    fn categorizes_permission_failures_without_a_lock_signature() {
        let log = r#"
[update:20] [11:00:00] [INFO] Starting Velopack Updater (1.2.0)
[update:20] [11:00:00] [INFO] Command: Apply
[update:20] [11:00:00] [INFO] Package: Some("C:\RHFiles\packages\RHFiles-0.2.0-full.nupkg")
[update:20] [11:00:01] [ERROR] Apply error: Access denied while replacing RHFiles.exe.
"#;
        let failure =
            parse_last_update_failure(log, "0.1.17", Path::new("update.log"), None).unwrap();
        assert_eq!(failure.category, "permission");
    }

    #[test]
    fn proxy_address_accepts_host_port_and_http_urls() {
        assert_eq!(
            normalize_proxy_address(Some("127.0.0.1:7890")).unwrap(),
            Some("http://127.0.0.1:7890".to_string())
        );
        assert_eq!(
            normalize_proxy_address(Some("https://proxy.example:8443")).unwrap(),
            Some("https://proxy.example:8443".to_string())
        );
    }

    #[test]
    fn proxy_address_rejects_missing_and_unsupported_values() {
        assert!(normalize_proxy_address(Some("  ")).is_err());
        assert!(normalize_proxy_address(Some("socks5://127.0.0.1:1080")).is_err());
        assert!(normalize_proxy_address(Some("http://user:secret@proxy.example")).is_err());
    }

    #[test]
    fn bundled_history_contains_every_release_note() {
        let history = bundled_release_history();
        assert!(history.len() >= 10);
        assert_eq!(
            history.first().map(|entry| entry.version.as_str()),
            Some(env!("CARGO_PKG_VERSION"))
        );
        assert!(history.iter().any(|entry| entry.version == "0.1.0"));
    }

    #[test]
    fn remote_history_replaces_matching_bundled_notes_and_sorts_versions() {
        let bundled = vec![ReleaseHistoryEntry {
            version: "0.1.0".into(),
            notes_markdown: "old".into(),
            published_at: Some("2026-09-06T18:13:59Z".into()),
        }];
        let remote = vec![
            ReleaseHistoryEntry {
                version: "0.2.0".into(),
                notes_markdown: "new release".into(),
                published_at: Some("2026-11-01".into()),
            },
            ReleaseHistoryEntry {
                version: "0.1.0".into(),
                notes_markdown: "remote replacement".into(),
                published_at: None,
            },
        ];
        let merged = merge_release_history(bundled, remote);
        assert_eq!(merged[0].version, "0.2.0");
        assert_eq!(merged[1].notes_markdown, "remote replacement");
        assert_eq!(merged[1].published_at.as_deref(), Some("2026-09-06T18:13:59Z"));
    }

    #[test]
    fn publication_dates_accept_real_dates_and_offsets_without_inventing_missing_times() {
        for date in ["2026-11-01", "2026-11-01T18:25:25+08:00", "2026-11-01T10:25:25Z"] { assert!(valid_publication_date(date)); }
        for date in ["", "2026-02-30", "2026-1-1", "today", "<script>now</script>"] { assert!(!valid_publication_date(date)); }
        let parsed = parse_release_history(r#"{"schemaVersion":1,"releases":[{"version":"0.1.0","notesMarkdown":"notes","publishedAt":"bad"}]}"#).unwrap();
        assert!(parsed[0].published_at.is_none());
    }

    #[test]
    fn configured_proxy_is_used_for_http_metadata() {
        use std::net::{TcpListener, TcpStream};

        fn read_headers(stream: &mut TcpStream) -> String {
            let mut request = Vec::new();
            let mut buffer = [0_u8; 512];
            while !request.ends_with(b"\r\n\r\n") {
                let count = stream.read(&mut buffer).unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
            }
            String::from_utf8_lossy(&request).into_owned()
        }

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let connect = read_headers(&mut stream);
            assert!(
                connect.starts_with("CONNECT updates.invalid:80 HTTP/1.1"),
                "unexpected proxy tunnel request: {connect}"
            );
            stream
                .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                .unwrap();
            let request = read_headers(&mut stream);
            assert!(
                request.starts_with("GET /releases.win.json HTTP/1.1"),
                "unexpected tunneled request: {request}"
            );
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
                .unwrap();
        });

        let proxy = format!("http://{address}");
        let source = ConfiguredWebSource::new("http://updates.invalid", Some(&proxy)).unwrap();
        assert_eq!(
            source
                .get_text(
                    "http://updates.invalid/releases.win.json",
                    "application/json"
                )
                .unwrap(),
            "ok"
        );
        server.join().unwrap();
    }
}
