//! Opt-in, current-user Windows login startup. No elevation, system service,
//! firewall changes, or coupling to a different virtual desktop's profile.
use std::path::Path;

const FLAG: &str = "--lan-service-startup=";

pub(crate) fn parse_profile(args: &[String]) -> Option<String> {
    if args.len() != 2 {
        return None;
    }
    let id = args[1].strip_prefix(FLAG)?;
    let guid = id.len() == 36
        && id.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        });
    let fallback = id.strip_prefix("unidentified-session-").is_some_and(|s| {
        s == "unknown" || (!s.is_empty() && s.len() <= 10 && s.bytes().all(|b| b.is_ascii_digit()))
    });
    (guid || fallback || id == "default").then(|| id.to_ascii_lowercase())
}

pub(crate) fn requested_profile() -> Option<String> {
    parse_profile(&std::env::args().collect::<Vec<_>>())
}

fn command(executable: &Path, profile: &str) -> Result<String, String> {
    let path = executable
        .to_str()
        .ok_or("启动程序路径不是有效文本 / Invalid executable path")?;
    if !executable.is_absolute() || path.contains(['"', '\r', '\n']) || path.starts_with(r"\\") {
        return Err("自动启动需要本机程序的完整路径 / Startup requires a local executable".into());
    }
    let arg = format!("{FLAG}{profile}");
    if parse_profile(&["RHFiles".into(), arg.clone()]).is_none() {
        return Err("无效的桌面配置 / Invalid desktop profile".into());
    }
    let value = format!("\"{path}\" {arg}");
    if value.encode_utf16().count() > 260 {
        return Err(
            "程序路径过长，无法注册登录启动 / Executable path too long for login startup".into(),
        );
    }
    Ok(value)
}

pub(crate) fn supported() -> bool {
    cfg!(windows)
}

// E2E fixtures must never register a real Windows login task.
#[cfg(debug_assertions)]
fn isolated_file() -> Option<std::path::PathBuf> {
    std::env::var_os("RHFILES_TEST_PROFILE_ROOT")
        .map(|root| std::path::PathBuf::from(root).join(format!("lan-login-{}.json", profile_id())))
}

fn profile_id() -> String {
    crate::profile::initialize()
        .map(|p| p.desktop_id.clone())
        .unwrap_or_default()
}

pub(crate) fn entry() -> Result<Option<String>, String> {
    #[cfg(debug_assertions)]
    if let Some(path) = isolated_file() {
        return match std::fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| e.to_string()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        };
    }
    #[cfg(windows)]
    {
        use winreg::{RegKey, enums::*};
        let key = match RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_READ)
        {
            Ok(key) => key,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.to_string()),
        };
        match key.get_value::<String, _>(format!("RHFiles LAN - {}", profile_id())) {
            Ok(value) => Ok(Some(value)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(not(windows))]
    Ok(None)
}

pub(crate) fn write_entry(value: Option<&str>) -> Result<(), String> {
    #[cfg(debug_assertions)]
    if let Some(path) = isolated_file() {
        return std::fs::write(path, serde_json::to_vec(&value).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string());
    }
    #[cfg(windows)]
    {
        use winreg::{RegKey, enums::*};
        // Disabling a nonexistent entry must not create or change any key.
        if value.is_none() && entry()?.is_none() {
            return Ok(());
        }
        let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
            .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
            .map_err(|e| e.to_string())?;
        let name = format!("RHFiles LAN - {}", profile_id());
        match value {
            Some(value) => key.set_value(name, &value),
            None => key.delete_value(name),
        }
        .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    if value.is_some() {
        Err("当前平台尚不支持登录自动启动 / Login startup is not supported on this platform".into())
    } else {
        Ok(())
    }
}

pub(crate) fn desired_entry() -> Result<String, String> {
    command(
        &std::env::current_exe().map_err(|e| e.to_string())?,
        &profile_id(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn login_argument_only_accepts_a_single_safe_profile() {
        for id in [
            "default",
            "unidentified-session-2",
            "12345678-1234-5678-90ab-cdef12345678",
        ] {
            assert_eq!(
                parse_profile(&["app".into(), format!("{FLAG}{id}")]),
                Some(id.into())
            );
        }
        for id in [
            "../other",
            r"..\other",
            "",
            "default --evil",
            "a/../../../",
            "unidentified-session-",
            "unidentified-session-1x",
        ] {
            assert!(parse_profile(&["app".into(), format!("{FLAG}{id}")]).is_none());
        }
        assert!(parse_profile(&["app".into(), format!("{FLAG}default"), "extra".into()]).is_none());
        assert!(parse_profile(&["app".into(), "file.txt".into()]).is_none());
    }
    #[test]
    fn quotes_local_executable_and_rejects_command_injection_and_long_paths() {
        let path = std::env::current_exe().unwrap();
        assert_eq!(
            command(&path, "default").unwrap(),
            format!("\"{}\" {FLAG}default", path.display())
        );
        assert!(command(Path::new("relative.exe"), "default").is_err());
        assert!(command(&path, "../other").is_err());
        assert!(command(&path, "default\" & echo bad").is_err());
        assert!(
            command(
                &path.with_file_name(format!("{}.exe", "a".repeat(270))),
                "default"
            )
            .is_err()
        );
    }
}
