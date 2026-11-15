//! macOS has its own release channel and verifies packages with Tauri's updater key.
use flate2::read::GzDecoder;
use serde_json::{Value, json};
use std::{
    ffi::CString, io, os::unix::ffi::OsStrExt, path::{Component, Path, PathBuf},
    process::Command, sync::Mutex, time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

const DEFAULT_SOURCE: &str = "https://cnb.cool/railgunhamster/RHFiles";
const BUNDLE_ID: &str = "com.rhfiles.app";
static OPERATION: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static STAGED: Mutex<Option<Staged>> = Mutex::new(None);
static INSTALLING: Mutex<Option<crate::lan_service::UpdateReservation>> = Mutex::new(None);
static FAILURE: Mutex<Option<Value>> = Mutex::new(None);

struct Staged {
    endpoint: Url,
    version: String,
    notes: String,
    bytes: Vec<u8>,
}

fn failure(category: &str, message: String) -> String {
    if let Ok(mut slot) = FAILURE.lock() {
        *slot = Some(json!({"category":category,"technicalDetail":message}));
    }
    message
}

fn clear_failure() {
    if let Ok(mut slot) = FAILURE.lock() {
        *slot = None;
    }
}

#[tauri::command]
pub fn get_last_update_failure() -> Option<Value> {
    FAILURE.lock().ok().and_then(|failure| failure.clone())
}

struct Channel {
    feed: Url,
    package_prefix: String,
}

fn channel(source: Option<&str>) -> Result<Channel, String> {
    let source = Url::parse(source.unwrap_or(DEFAULT_SOURCE).trim()).map_err(|e| e.to_string())?;
    if source.scheme() != "https" || !source.username().is_empty() || source.password().is_some()
        || source.port().is_some() || source.query().is_some() || source.fragment().is_some()
    {
        return Err("Use a public HTTPS CNB or GitHub repository URL".into());
    }
    let repo = source.path().trim_matches('/').trim_end_matches(".git");
    let parts: Vec<_> = repo.split('/').collect();
    if parts.len() < 2 || !parts.iter().all(|part| !part.is_empty() && *part != "." && *part != ".."
        && part.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b)))
    {
        return Err("Invalid update repository path".into());
    }
    let (feed, package_prefix) = match source.host_str() {
        Some("github.com") if parts.len() == 2 => (
            format!("https://raw.githubusercontent.com/{repo}/main/updates/macos-github.json"),
            format!("https://github.com/{repo}/releases/download/"),
        ),
        Some("cnb.cool") => (
            format!("https://cnb.cool/{repo}/-/git/raw/main/updates/macos-cnb.json"),
            format!("https://cnb.cool/{repo}/-/releases/download/"),
        ),
        _ => return Err("Use a public CNB or GitHub repository URL".into()),
    };
    Ok(Channel { feed: Url::parse(&feed).map_err(|e| e.to_string())?, package_prefix })
}

fn bundle_path(executable: &Path) -> Option<PathBuf> {
    let macos = executable.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    (macos.file_name()? == "MacOS" && contents.file_name()? == "Contents"
        && bundle.extension()? == "app").then(|| bundle.to_owned())
}

fn installed_bundle() -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let bundle = bundle_path(&executable).ok_or("Run RHFiles from the installed .app bundle")?;
    let parent = bundle.parent().ok_or("Missing application folder")?;
    let path = CString::new(parent.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
    if unsafe { libc::access(path.as_ptr(), libc::W_OK | libc::X_OK) } != 0 {
        return Err("Move RHFiles.app to a writable Applications folder and reopen it".into());
    }
    Ok(bundle)
}

async fn offer(app: &AppHandle, channel: &Channel, proxy: Option<&str>) -> Result<Option<Update>, String> {
    let mut updater = app.updater_builder()
        .endpoints(vec![channel.feed.clone()]).map_err(|e| e.to_string())?
        .timeout(Duration::from_secs(180))
        .header("Cache-Control", "no-cache").map_err(|e| e.to_string())?;
    if let Some(proxy) = proxy {
        let proxy = Url::parse(proxy).map_err(|e| e.to_string())?;
        if !matches!(proxy.scheme(), "http" | "https") || proxy.host_str().is_none()
            || !proxy.username().is_empty() || proxy.password().is_some()
            || proxy.path() != "/" || proxy.query().is_some() || proxy.fragment().is_some()
        {
            return Err("Invalid HTTP/HTTPS proxy address".into());
        }
        updater = updater.proxy(proxy);
    }
    let update = updater.build().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    if let Some(update) = &update {
        let expected = format!("{}macos-v{}/RHFiles-macos-arm64.app.tar.gz", channel.package_prefix, update.version);
        if !update.download_url.as_str().eq_ignore_ascii_case(&expected) {
            return Err("The update package does not belong to the selected Mac release".into());
        }
    }
    Ok(update)
}

#[tauri::command]
pub async fn check_updates(app: AppHandle, source: Option<String>, proxy: Option<String>) -> Result<Value, String> {
    let current = app.package_info().version.to_string();
    let mut value = json!({"managed":installed_bundle().is_ok(),"isPortable":false,
        "currentVersion":current,"availableVersion":null,"releaseNotes":"","pendingRestart":false});
    if value["managed"] != true {
        return Ok(value);
    }
    let channel = channel(source.as_deref())?;
    if let Some(staged) = STAGED.lock().map_err(|e| e.to_string())?.as_ref()
        .filter(|staged| staged.endpoint == channel.feed)
    {
        value["availableVersion"] = json!(staged.version);
        value["releaseNotes"] = json!(staged.notes);
        value["pendingRestart"] = json!(true);
        return Ok(value);
    }
    if let Some(update) = offer(&app, &channel, proxy.as_deref()).await.map_err(|e| failure("network", e))? {
        value["availableVersion"] = json!(update.version);
        value["releaseNotes"] = json!(update.body);
    }
    clear_failure();
    Ok(value)
}

fn progress(app: &AppHandle, phase: &str, version: &str, bytes: u64, total: u64, speed: u64) {
    let percentage = if phase == "downloading" {
        bytes.saturating_mul(100).checked_div(total).unwrap_or(0).min(99)
    } else { 100 };
    let _ = app.emit("update-progress", json!({"phase":phase,"version":version,"percentage":percentage,
        "downloadedBytes":bytes,"totalBytes":total,"speed":speed}));
}

#[tauri::command]
pub async fn download_update(
    app: AppHandle, source: Option<String>, proxy: Option<String>, target_version: Option<String>,
) -> Result<String, String> {
    let _operation = OPERATION.try_lock().map_err(|_| "[update_busy] Another update is running")?;
    installed_bundle()?;
    let channel = channel(source.as_deref())?;
    let update = offer(&app, &channel, proxy.as_deref()).await.map_err(|e| failure("network", e))?
        .filter(|update| target_version.as_ref().is_none_or(|v| v == &update.version))
        .ok_or("The selected update changed. Check again before downloading.")?;
    let mut bytes = 0u64;
    let mut last = Instant::now();
    let started = last;
    // Tauri verifies the downloaded archive against the embedded minisign key.
    let archive = update.download(|chunk, total| {
        bytes += chunk as u64;
        if last.elapsed() >= Duration::from_millis(150) {
            last = Instant::now();
            let rate = bytes.saturating_mul(1000) / (started.elapsed().as_millis() as u64).max(1);
            progress(&app, "downloading", &update.version, bytes, total.unwrap_or(0), rate);
        }
    }, || progress(&app, "verifying", &update.version, 0, 0, 0)).await
    .map_err(|e| failure("package", e.to_string()))?;
    *STAGED.lock().map_err(|e| e.to_string())? = Some(Staged { endpoint:channel.feed,
        version:update.version.clone(), notes:update.body.unwrap_or_default(), bytes:archive });
    clear_failure();
    progress(&app, "ready", &update.version, bytes, bytes, 0);
    Ok(update.version)
}

fn extract_bundle(bytes: &[u8], root: &Path) -> Result<PathBuf, String> {
    let mut archive = tar::Archive::new(GzDecoder::new(bytes));
    let mut unpacked = 0u64;
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?;
        if !path.starts_with("RHFiles.app") || path.components().any(|c| !matches!(c, Component::Normal(_)))
            || !(entry.header().entry_type().is_file() || entry.header().entry_type().is_dir())
        {
            return Err("The Mac update contains an invalid bundle path or link".into());
        }
        unpacked = unpacked.saturating_add(entry.size());
        if unpacked > 1024 * 1024 * 1024 {
            return Err("Mac update exceeds the extracted size limit".into());
        }
        if !entry.unpack_in(root).map_err(|e| e.to_string())? {
            return Err("The Mac update contains a path outside the application bundle".into());
        }
    }
    Ok(root.join("RHFiles.app"))
}

fn validate_bundle(bundle: &Path, version: &str) -> Result<(), String> {
    let info = plist::Value::from_file(bundle.join("Contents/Info.plist")).map_err(|e| e.to_string())?;
    let info = info.as_dictionary().ok_or("Invalid application metadata")?;
    let get = |key| info.get(key).and_then(plist::Value::as_string);
    if get("CFBundleIdentifier") != Some(BUNDLE_ID) || get("CFBundleShortVersionString") != Some(version)
        || get("CFBundleExecutable") != Some("rhfiles")
        || !bundle.join("Contents/MacOS/rhfiles").is_file()
    {
        return Err("The downloaded application identifier or version does not match the update".into());
    }
    let verify = Command::new("/usr/bin/codesign").args(["--verify", "--deep", "--strict"])
        .arg(bundle).output().map_err(|e| e.to_string())?;
    if !verify.status.success() {
        return Err(format!("Invalid macOS bundle signature: {}", String::from_utf8_lossy(&verify.stderr)));
    }
    Ok(())
}

fn exchange(current: &Path, next: &Path) -> io::Result<()> {
    let current = CString::new(current.as_os_str().as_bytes())?;
    let next = CString::new(next.as_os_str().as_bytes())?;
    // Both bundles are on the same volume. The original remains intact if the swap fails.
    if unsafe { libc::renameatx_np(libc::AT_FDCWD, current.as_ptr(), libc::AT_FDCWD, next.as_ptr(), libc::RENAME_SWAP) } != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

#[tauri::command]
pub async fn apply_update(
    app: AppHandle, source: Option<String>, target_version: Option<String>, cancel: State<'_, crate::types::CancelFlag>,
) -> Result<(), String> {
    let _operation = OPERATION.try_lock().map_err(|_| "[update_busy] Another update is running")?;
    let current = installed_bundle()?;
    let channel = channel(source.as_deref())?;
    let install = tauri::async_runtime::spawn_blocking(move || {
        let choice = STAGED.lock().map_err(|e| e.to_string())?;
        let staged = choice.as_ref().filter(|s| s.endpoint == channel.feed
            && target_version.as_ref().is_none_or(|v| v == &s.version))
            .ok_or("Download and verify this update before installing it")?;
        let workspace = tempfile::tempdir_in(current.parent().ok_or("Missing application folder")?)
            .map_err(|e| failure("permission", e.to_string()))?;
        let replacement = extract_bundle(&staged.bytes, workspace.path()).map_err(|e| failure("package", e))?;
        validate_bundle(&replacement, &staged.version).map_err(|e| failure("package", e))?;
        Ok::<_, String>((workspace, current, replacement, staged.version.clone()))
    }).await.map_err(|e| e.to_string())??;
    let (_workspace, current, replacement, version) = install;
    let mut installing = INSTALLING.lock().map_err(|e| e.to_string())?;
    let reservation = crate::lan_service::reserve_update(Duration::ZERO)?;
    cancel.begin_update()?;
    progress(&app, "applying", &version, 0, 0, 0);
    if let Err(error) = exchange(&current, &replacement) {
        cancel.abort_update();
        return Err(failure("permission", format!("Could not replace RHFiles.app: {error}")));
    }
    *installing = Some(reservation);
    clear_failure();
    app.request_restart();
    Ok(())
}

#[tauri::command]
pub fn defer_update() {}

pub(crate) fn release_restart_lock(cancel: &crate::types::CancelFlag) {
    if INSTALLING.lock().is_ok_and(|state| state.is_some()) {
        // Tauri spawns the next process immediately before exiting. Permit its
        // shared profile lease while the departing service still refuses work.
        cancel.abort_update();
    }
}

#[tauri::command]
pub fn get_release_history(app: AppHandle) -> Result<Value, String> {
    let history: Value = serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/release-history.json")))
        .map_err(|error| error.to_string())?;
    Ok(json!({"currentVersion":app.package_info().version.to_string(),
        "releases":history["releases"],"source":"bundled","warning":null}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn mac_channels_are_independent_from_the_repository_latest_release() {
        assert_eq!(channel(None).unwrap().feed.as_str(),
            "https://cnb.cool/railgunhamster/RHFiles/-/git/raw/main/updates/macos-cnb.json");
        assert_eq!(channel(Some("https://github.com/RailgunHamster/RHFiles.git")).unwrap().feed.as_str(),
            "https://raw.githubusercontent.com/RailgunHamster/RHFiles/main/updates/macos-github.json");
        for invalid in ["http://github.com/a/b", "https://x@y.example/a/b", "https://github.com/a/b?x=1"] {
            assert!(channel(Some(invalid)).is_err());
        }
    }

    #[test]
    fn app_bundle_exchange_is_atomic_and_supports_spaces_and_quotes() {
        let root = tempfile::tempdir().unwrap();
        let current = root.path().join("Old ' Mac.app");
        let replacement = root.path().join("New Mac.app");
        fs::create_dir(&current).unwrap();
        fs::create_dir(&replacement).unwrap();
        fs::write(current.join("version"), "old").unwrap();
        fs::write(replacement.join("version"), "new").unwrap();
        assert!(exchange(&current, &root.path().join("missing")).is_err());
        assert_eq!(fs::read_to_string(current.join("version")).unwrap(), "old");
        exchange(&current, &replacement).unwrap();
        assert_eq!(fs::read_to_string(current.join("version")).unwrap(), "new");
        assert_eq!(fs::read_to_string(replacement.join("version")).unwrap(), "old");
    }
}
