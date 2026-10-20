//! A process is bound to the virtual desktop on which it was launched.
//! Profiles never change underneath active file operations when a window moves.
use std::io::{Read, Write};
use std::{path::PathBuf, sync::OnceLock};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub desktop_id: String,
    pub active_desktop_id: Option<String>,
    pub data_directory: PathBuf,
    pub webview_directory: PathBuf,
    pub instance_id: String,
    pub legacy: bool,
    pub desktop_identified: bool,
}

static PROFILE: OnceLock<Profile> = OnceLock::new();
static INSTANCE_LEASE: std::sync::Mutex<Option<std::fs::File>> = std::sync::Mutex::new(None);

pub fn user_root() -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    if let Some(root) = std::env::var_os("RHFILES_TEST_PROFILE_ROOT") {
        return Ok(PathBuf::from(root));
    }
    #[cfg(target_os = "macos")]
    return std::env::var_os("HOME")
        .filter(|p| !p.is_empty())
        .map(|p| PathBuf::from(p).join("Library/Application Support/RHFiles"))
        .ok_or_else(|| "Cannot locate this macOS user's home directory".into());
    #[cfg(not(target_os = "macos"))]
    std::env::var_os("APPDATA")
        .filter(|p| !p.is_empty())
        .map(|p| PathBuf::from(p).join("RHFiles"))
        .ok_or_else(|| {
            "Cannot locate this Windows user's AppData directory; refusing shared storage".into()
        })
}

fn stable_hash(value: &str) -> u64 {
    value.bytes().fold(0xcbf29ce484222325, |hash, byte| {
        (hash ^ byte as u64).wrapping_mul(0x100000001b3)
    })
}

#[cfg(windows)]
fn guid_key(id: windows::core::GUID) -> Option<String> {
    (id != windows::core::GUID::zeroed()).then(|| format!("{id:?}").to_ascii_lowercase())
}

#[cfg(not(windows))]
pub fn current_desktop_id() -> Option<String> {
    Some("default".into())
}

#[cfg(windows)]
pub fn current_desktop_id() -> Option<String> {
    use windows::Win32::{
        System::Com::*,
        UI::{Shell::*, WindowsAndMessaging::GetForegroundWindow},
    };
    // The public Windows API avoids version-specific undocumented COM vtables.
    let result = unsafe {
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let result = (|| {
            let manager: IVirtualDesktopManager =
                CoCreateInstance(&VirtualDesktopManager, None, CLSCTX_ALL).ok()?;
            let foreground = GetForegroundWindow();
            if !manager
                .IsWindowOnCurrentVirtualDesktop(foreground)
                .ok()?
                .as_bool()
            {
                return None;
            }
            guid_key(manager.GetWindowDesktopId(foreground).ok()?)
        })();
        if initialized {
            CoUninitialize();
        }
        result
    };
    if result.is_some() {
        return result;
    }
    // Explorer records this when no ordinary foreground window is available.
    let explorer = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let mut session = 0;
    let mut keys = Vec::new();
    if unsafe {
        windows::Win32::System::RemoteDesktop::ProcessIdToSessionId(
            std::process::id(),
            &mut session,
        )
    }
    .is_ok()
    {
        // Windows 10 stores this per interactive session (including RDP).
        keys.push(format!(r"Software\Microsoft\Windows\CurrentVersion\Explorer\SessionInfo\{session}\VirtualDesktops"));
    }
    keys.push(r"Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops".into());
    keys.into_iter().find_map(|path| {
        let key = explorer.open_subkey(path).ok()?;
        key.get_raw_value("CurrentVirtualDesktop")
            .ok()
            .and_then(|raw| desktop_guid_bytes(&raw.bytes))
            // Systems using only one desktop may not have CurrentVirtualDesktop.
            // A single registered GUID is unambiguous; never guess among many.
            .or_else(|| {
                key.get_raw_value("VirtualDesktopIDs")
                    .ok()
                    .and_then(|raw| desktop_guid_bytes(&raw.bytes))
            })
    })
}

#[cfg(windows)]
fn desktop_guid_bytes(bytes: &[u8]) -> Option<String> {
    let bytes: [u8; 16] = bytes.try_into().ok()?;
    guid_key(windows::core::GUID::from_values(
        u32::from_le_bytes(bytes[0..4].try_into().ok()?),
        u16::from_le_bytes(bytes[4..6].try_into().ok()?),
        u16::from_le_bytes(bytes[6..8].try_into().ok()?),
        bytes[8..16].try_into().ok()?,
    ))
}

fn launch_desktop_id(detected: Option<String>, session: Option<u32>) -> String {
    detected.unwrap_or_else(|| {
        format!(
            "unidentified-session-{}",
            session
                .map(|id| id.to_string())
                .unwrap_or_else(|| "unknown".into())
        )
    })
}

#[cfg(windows)]
fn interactive_session_id() -> Option<u32> {
    let mut session = 0;
    unsafe {
        windows::Win32::System::RemoteDesktop::ProcessIdToSessionId(
            std::process::id(),
            &mut session,
        )
    }
    .ok()
    .map(|_| session)
}

fn resolve_profile(root: PathBuf, local: PathBuf, desktop_id: String) -> Result<Profile, String> {
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let identified = !desktop_id.starts_with("unidentified-session-");
    let legacy = if identified {
        let mut owner = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(root.join("legacy-desktop.txt"))
            .map_err(|e| e.to_string())?;
        owner.lock().map_err(|e| e.to_string())?;
        let mut first = String::new();
        owner
            .read_to_string(&mut first)
            .map_err(|e| e.to_string())?;
        if first.trim().is_empty() {
            owner
                .write_all(desktop_id.as_bytes())
                .map_err(|e| e.to_string())?;
            owner.sync_all().map_err(|e| e.to_string())?;
            first = desktop_id.clone();
        }
        first.trim() == desktop_id
    } else {
        // Unknown desktop identity must neither claim nor reuse the legacy
        // profile. Keep prior desktop data and WebView storage untouched.
        false
    };
    let data_directory = if legacy {
        root.clone()
    } else {
        root.join("desktops").join(&desktop_id)
    };
    let webview_directory = if legacy {
        local.join("com.rhfiles.app")
    } else {
        local
            .join("RHFiles")
            .join("desktops")
            .join(&desktop_id)
            .join("WebView2")
    };
    let account = stable_hash(&if cfg!(windows) {
        root.to_string_lossy().to_lowercase()
    } else {
        root.to_string_lossy().into_owned()
    });
    Ok(Profile {
        instance_id: format!(
            "com.rhfiles.app.u{account:x}.d{}",
            desktop_id.replace('-', "")
        ),
        desktop_id,
        active_desktop_id: None,
        data_directory,
        webview_directory,
        legacy,
        desktop_identified: identified,
    })
}

pub fn initialize() -> Result<&'static Profile, String> {
    if let Some(profile) = PROFILE.get() {
        return Ok(profile);
    }
    let root = user_root()?;
    #[cfg(target_os = "macos")]
    let mut local = root.join("WebKit");
    #[cfg(not(target_os = "macos"))]
    let mut local = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or("LOCALAPPDATA is unavailable")?;
    let mut desktop = current_desktop_id();
    #[cfg(debug_assertions)]
    if std::env::var_os("RHFILES_TEST_PROFILE_ROOT").is_some() {
        local = root.join("test-webview");
        if let Ok(override_id) = std::env::var("RHFILES_TEST_DESKTOP_ID") {
            desktop = if override_id == "unavailable" {
                None
            } else {
                Some(override_id)
            };
        }
    }
    #[cfg(windows)]
    let desktop = launch_desktop_id(desktop, interactive_session_id());
    #[cfg(not(windows))]
    let desktop = launch_desktop_id(desktop, None);
    let profile = resolve_profile(root, local, desktop)?;
    let gate = coordination_file("instance-gate.lock")?;
    gate.lock().map_err(|e| e.to_string())?;
    let lease = coordination_file("instances.lock")?;
    lease.try_lock_shared().map_err(
        |_| "RHFiles is applying an update. Please reopen it after the update finishes.",
    )?;
    *INSTANCE_LEASE.lock().map_err(|e| e.to_string())? = Some(lease);
    let _ = PROFILE.set(profile);
    Ok(PROFILE.get().expect("profile initialized"))
}

pub fn data_dir() -> Result<PathBuf, String> {
    match PROFILE.get() {
        Some(profile) => Ok(profile.data_directory.clone()),
        None => user_root(),
    }
}

pub fn webview_dir() -> Option<PathBuf> {
    PROFILE.get().map(|p| p.webview_directory.clone())
}

pub fn owns_current_desktop() -> bool {
    PROFILE.get().is_none_or(|p| {
        p.desktop_identified && current_desktop_id().as_deref() == Some(&p.desktop_id)
    })
}

pub fn journal_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    return Ok(data_dir()?.join("operation-journal"));
    if PROFILE.get().is_some_and(|p| p.legacy) {
        return Ok(user_root()?
            .parent()
            .ok_or("Missing AppData parent")?
            .join("com.rhfiles.app")
            .join("operation-journal"));
    }
    Ok(data_dir()?.join("operation-journal"))
}

pub fn coordination_file(name: &str) -> Result<std::fs::File, String> {
    let root = user_root()?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(root.join(name))
        .map_err(|e| e.to_string())
}

pub fn reserve_update() -> Result<(), String> {
    let mut slot = INSTANCE_LEASE.lock().map_err(|e| e.to_string())?;
    // Serialize shared -> exclusive upgrades: two instances must not both
    // release their shared leases and let one update underneath the other.
    let gate = coordination_file("instance-gate.lock")?;
    gate.try_lock().map_err(
        |_| "[update_busy] Another instance is checking whether it can install an update",
    )?;
    if let Some(lease) = slot.as_ref() {
        lease.unlock().map_err(|e| e.to_string())?;
    }
    let lease = coordination_file("instances.lock")?;
    if lease.try_lock().is_err() {
        if let Some(own) = slot.as_ref() {
            let _ = own.try_lock_shared();
        }
        return Err("[update_other_instances] Close RHFiles on other virtual desktops before installing an update.".into());
    }
    *slot = Some(lease);
    Ok(())
}

pub fn release_update() {
    if let Ok(slot) = INSTANCE_LEASE.lock() {
        if let Some(lease) = slot.as_ref() {
            let _ = lease.unlock();
            let _ = lease.try_lock_shared();
        }
    }
}

#[tauri::command]
pub fn get_instance_profile() -> Result<Profile, String> {
    let mut profile = initialize()?.clone();
    profile.active_desktop_id = current_desktop_id();
    Ok(profile)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn registry_guid_is_little_endian_and_rejects_empty_or_invalid_ids() {
        assert_eq!(
            desktop_guid_bytes(&[
                0x78, 0x56, 0x34, 0x12, 0x34, 0x12, 0x78, 0x56, 0x90, 0xab, 0xcd, 0xef, 0x12, 0x34,
                0x56, 0x78
            ])
            .as_deref(),
            Some("12345678-1234-5678-90ab-cdef12345678")
        );
        assert_eq!(desktop_guid_bytes(&[0; 16]), None);
        assert_eq!(desktop_guid_bytes(&[1; 15]), None);
    }
    #[test]
    fn profiles_are_stable_isolated_and_preserve_legacy() {
        let root = std::env::temp_dir().join(format!(
            "rhfiles-profile-test-{}-{}",
            std::process::id(),
            stable_hash(&format!("{:?}", std::time::SystemTime::now()))
        ));
        let user1 = root.join("user1");
        let a = resolve_profile(user1.clone(), root.join("local1"), "desktop-a".into()).unwrap();
        let b = resolve_profile(user1.clone(), root.join("local1"), "desktop-b".into()).unwrap();
        let again =
            resolve_profile(user1.clone(), root.join("local1"), "desktop-a".into()).unwrap();
        let other =
            resolve_profile(root.join("user2"), root.join("local2"), "desktop-a".into()).unwrap();
        assert_eq!(a.data_directory, user1);
        assert_eq!(a.data_directory, again.data_directory);
        assert_ne!(a.data_directory, b.data_directory);
        assert_ne!(a.webview_directory, b.webview_directory);
        assert_ne!(a.instance_id, b.instance_id);
        assert_ne!(a.instance_id, other.instance_id);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_desktop_uses_stable_session_fallback_not_a_startup_error() {
        assert_eq!(launch_desktop_id(None, Some(3)), "unidentified-session-3");
        assert_eq!(
            launch_desktop_id(None, None),
            "unidentified-session-unknown"
        );
        assert_eq!(
            launch_desktop_id(Some("desktop-a".into()), Some(3)),
            "desktop-a"
        );
    }

    #[test]
    fn fallback_never_claims_legacy_or_mixes_other_desktops_sessions_and_accounts() {
        let root = std::env::temp_dir().join(format!(
            "rhfiles-fallback-{}-{:x}",
            std::process::id(),
            stable_hash(&format!("{:?}", std::time::SystemTime::now()))
        ));
        let user = root.join("user");
        let local = root.join("local");
        let fallback = resolve_profile(
            user.clone(),
            local.clone(),
            launch_desktop_id(None, Some(1)),
        )
        .unwrap();
        assert!(!user.join("legacy-desktop.txt").exists());
        assert!(!fallback.legacy && !fallback.desktop_identified);
        assert!(fallback.data_directory.starts_with(user.join("desktops")));
        let desktop = resolve_profile(user.clone(), local.clone(), "desktop-a".into()).unwrap();
        assert!(desktop.legacy && desktop.desktop_identified);
        std::fs::write(user.join("settings-sentinel"), "original").unwrap();
        let again = resolve_profile(
            user.clone(),
            local.clone(),
            launch_desktop_id(None, Some(1)),
        )
        .unwrap();
        let other = resolve_profile(
            user.clone(),
            local.clone(),
            launch_desktop_id(None, Some(2)),
        )
        .unwrap();
        let account = resolve_profile(
            root.join("other-user"),
            root.join("other-local"),
            launch_desktop_id(None, Some(1)),
        )
        .unwrap();
        assert_eq!(fallback.data_directory, again.data_directory);
        assert_eq!(fallback.instance_id, again.instance_id);
        assert_ne!(fallback.data_directory, desktop.data_directory);
        assert_ne!(fallback.webview_directory, other.webview_directory);
        assert_ne!(fallback.instance_id, other.instance_id);
        assert_ne!(fallback.instance_id, account.instance_id);
        assert_eq!(
            std::fs::read_to_string(user.join("legacy-desktop.txt")).unwrap(),
            "desktop-a"
        );
        assert_eq!(
            std::fs::read_to_string(user.join("settings-sentinel")).unwrap(),
            "original"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
