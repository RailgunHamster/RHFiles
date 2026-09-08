use semver::Version;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::mpsc,
    time::Duration,
};
use tauri::Emitter;
use url::Url;
use velopack::{
    Error as VelopackError, UpdateCheck, UpdateManager, VelopackAsset, VelopackAssetFeed,
    bundle::Manifest,
    sources::{AutoSource, UpdateSource},
};

const DEFAULT_UPDATE_SOURCE: &str = "https://github.com/RailgunHamster/RHFiles";
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
        })
    }

    fn get_text(&self, url: &str, accept: &str) -> Result<String, VelopackError> {
        let mut response = self
            .feed_agent
            .get(url)
            .header("Accept", accept)
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
        };
        self.get_text(url.as_str(), "application/json")
    }

    fn download_to_file(
        &self,
        url: &str,
        local_file: &Path,
        progress_sender: Option<mpsc::Sender<i16>>,
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
        let mut reader = body.into_reader();
        let mut output = File::create(local_file)?;
        let mut buffer = vec![0_u8; 2 * 1024 * 1024];
        let mut downloaded = 0_u64;
        let mut last_progress = -1_i16;

        loop {
            let count = reader.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            output.write_all(&buffer[..count])?;
            downloaded += count as u64;
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

        if let Some(sender) = &progress_sender {
            let _ = sender.send(100);
        }
        Ok(())
    }
}

impl UpdateSource for ConfiguredWebSource {
    fn get_release_feed(
        &self,
        channel: &str,
        app: &Manifest,
        staged_user_id: &str,
    ) -> Result<VelopackAssetFeed, VelopackError> {
        let feed_name = format!("releases.{channel}.json");
        let json = match &self.kind {
            WebSourceKind::Github { download_base } => self.get_text(
                download_base.join(&feed_name)?.as_str(),
                "application/octet-stream",
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
        serde_json::from_str(&json).map_err(VelopackError::from)
    }

    fn download_release_entry(
        &self,
        asset: &VelopackAsset,
        local_file: &Path,
        progress_sender: Option<mpsc::Sender<i16>>,
    ) -> Result<(), VelopackError> {
        let url = match &self.kind {
            WebSourceKind::Github { download_base } => {
                download_base.join(&asset.FileName)?.to_string()
            }
            WebSourceKind::Static { base_url } => base_url.join(&asset.FileName)?.to_string(),
        };
        self.download_to_file(&url, local_file, progress_sender)
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
    for entry in document.releases {
        Version::parse(&entry.version)
            .map_err(|error| format!("Invalid release version {}: {error}", entry.version))?;
        if entry.notes_markdown.trim().is_empty() {
            return Err(format!("Release {} has empty notes", entry.version));
        }
        if entry.notes_markdown.len() > 256 * 1024 {
            return Err(format!("Release {} notes exceed 256 KiB", entry.version));
        }
        releases.push(entry);
    }
    Ok(releases)
}

fn bundled_release_history() -> Vec<ReleaseHistoryEntry> {
    parse_release_history(BUNDLED_RELEASE_HISTORY).unwrap_or_default()
}

fn read_remote_release_history(
    source: &str,
    proxy: Option<&str>,
) -> Result<Vec<ReleaseHistoryEntry>, String> {
    let text = if Url::parse(source)
        .ok()
        .is_some_and(|url| matches!(url.scheme(), "http" | "https"))
    {
        ConfiguredWebSource::new(source, proxy)
            .and_then(|configured| configured.get_release_history_text())
            .map_err(|error| error.to_string())?
    } else {
        let path = PathBuf::from(source).join("release-history.json");
        std::fs::read_to_string(&path)
            .map_err(|error| format!("Unable to read {}: {error}", path.display()))?
    };
    parse_release_history(&text)
}

fn merge_release_history(
    bundled: Vec<ReleaseHistoryEntry>,
    remote: Vec<ReleaseHistoryEntry>,
) -> Vec<ReleaseHistoryEntry> {
    let mut by_version = HashMap::new();
    for entry in bundled.into_iter().chain(remote) {
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
    let source_url = Url::parse(source).ok();
    if source_url
        .as_ref()
        .is_some_and(|url| matches!(url.scheme(), "http" | "https"))
    {
        return UpdateManager::new(ConfiguredWebSource::new(source, proxy)?, None, None);
    }
    UpdateManager::new(AutoSource::new(source), None, None)
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
        if let Some(pending) = manager.get_update_pending_restart() {
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
) -> Result<String, String> {
    let source = effective_source(source);
    tauri::async_runtime::spawn_blocking(move || {
        let manager = open_manager(&source, proxy.as_deref())?
            .ok_or_else(|| "This build is not managed by Velopack".to_string())?;

        if let Some(pending) = manager.get_update_pending_restart() {
            let _ = app.emit("update-progress", UpdateProgress { percentage: 100 });
            return Ok(pending.Version);
        }

        let update = match manager
            .check_for_updates()
            .map_err(|error| error.to_string())?
        {
            UpdateCheck::UpdateAvailable(update) => update,
            UpdateCheck::RemoteIsEmpty | UpdateCheck::NoUpdateAvailable => {
                return Err("No update is available".to_string());
            }
        };
        let version = update.TargetFullRelease.Version.clone();
        let (sender, receiver) = mpsc::channel::<i16>();
        let progress_app = app.clone();
        let progress_thread = std::thread::spawn(move || {
            while let Ok(percentage) = receiver.recv() {
                let _ = progress_app.emit(
                    "update-progress",
                    UpdateProgress {
                        percentage: percentage.clamp(0, 100),
                    },
                );
            }
        });

        let result = manager
            .download_updates(&update, Some(sender))
            .map_err(|error| error.to_string());
        let _ = progress_thread.join();
        result?;
        let _ = app.emit("update-progress", UpdateProgress { percentage: 100 });
        Ok(version)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn apply_update(
    source: Option<String>,
    proxy: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let source = effective_source(source);
    let manager = open_manager(&source, proxy.as_deref())?
        .ok_or_else(|| "This build is not managed by Velopack".to_string())?;
    let pending = manager
        .get_update_pending_restart()
        .ok_or_else(|| "No downloaded update is waiting to be applied".to_string())?;
    manager
        .wait_exit_then_apply_updates(pending, false, true, Vec::<String>::new())
        .map_err(|error| error.to_string())?;
    // Unlike Velopack's convenience method, AppHandle::exit lets Tauri destroy
    // its windows and WebView2 children before Update.exe replaces `current`.
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_source_uses_github() {
        assert_eq!(effective_source(None), DEFAULT_UPDATE_SOURCE);
        assert_eq!(effective_source(Some("   ".into())), DEFAULT_UPDATE_SOURCE);
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
        }];
        let remote = vec![
            ReleaseHistoryEntry {
                version: "0.2.0".into(),
                notes_markdown: "new release".into(),
            },
            ReleaseHistoryEntry {
                version: "0.1.0".into(),
                notes_markdown: "remote replacement".into(),
            },
        ];
        let merged = merge_release_history(bundled, remote);
        assert_eq!(merged[0].version, "0.2.0");
        assert_eq!(merged[1].notes_markdown, "remote replacement");
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
