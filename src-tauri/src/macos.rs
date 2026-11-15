use std::path::{Path, PathBuf};
pub(crate) mod credentials;
#[tauri::command]
pub fn read_macos_file_clipboard() -> Result<serde_json::Value, String> {
    let info = rhfiles_core::macos::request(serde_json::json!({"action":"clipboard.read"}))?;
    if info["paths"]
        .as_array()
        .is_some_and(|paths| paths.len() > 10_000)
    {
        return Err("Clipboard file count exceeds 10,000".into());
    }
    Ok(info)
}
#[tauri::command(async)]
pub fn connect_macos_share(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "smb" || parsed.host_str().is_none() || parsed.password().is_some() {
        return Err(
            "Use smb://server/share without a password; the system dialog requests credentials."
                .into(),
        );
    }
    let status = std::process::Command::new("/usr/bin/open")
        .arg(&url)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("Could not open SMB connection: {status}"))
    }
}

pub fn open_saved_share(config: &serde_json::Value, relative: &str) -> Result<serde_json::Value, String> {
    let host = config["host"].as_str().ok_or("Missing SMB host")?;
    let mut url = url::Url::parse("smb://localhost/").map_err(|e| e.to_string())?;
    url.set_host(Some(host)).map_err(|_| "Invalid SMB host")?;
    if let Some(port) = config["port"].as_u64() {
        url.set_port(Some(port.try_into().map_err(|_| "Invalid SMB port")?))
            .map_err(|_| "Invalid SMB port")?;
    }
    if let Some(user) = config["username"].as_str().filter(|user| !user.is_empty()) {
        let account = match config["domain"].as_str().filter(|domain| !domain.is_empty()) {
            Some(domain) => format!("{domain};{user}"),
            None => user.into(),
        };
        url.set_username(&account).map_err(|_| "Invalid SMB username")?;
    }
    let mut parts = relative.split('/').filter(|part| !part.is_empty());
    if let Some(share) = config["share"].as_str().filter(|share| !share.is_empty()).or_else(|| parts.next()) {
        url.path_segments_mut().map_err(|_| "Invalid SMB URL")?.push(share);
    }
    let mounted = rhfiles_core::macos::request(serde_json::json!({"action":"smb.mounted","url":url.as_str()}))?;
    if let Some(root) = mounted.as_str() {
        let mut path = PathBuf::from(root);
        path.extend(parts);
        return Ok(serde_json::json!({"path": path}));
    }
    connect_macos_share(url.into())?;
    Ok(serde_json::json!({"path":"/Volumes","connecting":true}))
}
pub fn executable(name: &str) -> Option<PathBuf> {
    let mut dirs = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .unwrap_or_default();
    // Finder-launched applications do not inherit the user's shell PATH.
    dirs.extend(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].map(PathBuf::from));
    dirs.into_iter().map(|d| d.join(name)).find(|p| p.is_file())
}

pub fn archive_tool() -> Option<PathBuf> {
    if let Ok(executable) = std::env::current_exe() {
        if let Some(contents) = executable.parent().and_then(Path::parent) {
            let bundled = contents.join("Resources/7zip/7zz");
            if bundled.is_file() {
                return Some(bundled);
            }
        }
    }
    #[cfg(debug_assertions)]
    {
        let staged = Path::new(env!("CARGO_MANIFEST_DIR")).join("thirdparty/7zip-macos/7zz");
        if staged.is_file() {
            return Some(staged);
        }
    }
    executable("7zz").or_else(|| executable("7z"))
}
pub fn open_with(path: &Path, program: &str) -> Result<(), String> {
    if matches!(
        program,
        "terminal" | "iterm" | "cmd" | "powershell" | "wt" | "gitbash"
    ) {
        return rhfiles_core::enumerator::open_terminal(
            path,
            if program == "iterm" {
                "iterm"
            } else {
                "terminal"
            },
        );
    }
    let app = match program {
        "vscode" => "Visual Studio Code",
        "cursor" => "Cursor",
        "sublime" => "Sublime Text",
        "vlc" => "VLC",
        "textedit" | "notepad" => "TextEdit",
        "preview" => "Preview",
        _ if program.ends_with(".app") => program,
        _ => return Err(format!("Application is not supported on macOS: {program}")),
    };
    let status = std::process::Command::new("/usr/bin/open")
        .args(["-a", app, "--"])
        .arg(path)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("Could not open {app}: {status}"))
    }
}
