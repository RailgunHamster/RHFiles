use std::path::{Path,PathBuf};
#[tauri::command(async)]
pub fn connect_macos_share(url: String) -> Result<(),String> {
    let parsed=url::Url::parse(&url).map_err(|e|e.to_string())?;
    if parsed.scheme() != "smb" || parsed.host_str().is_none() || parsed.password().is_some() {
        return Err("Use smb://server/share without a password; the system dialog requests credentials.".into());
    }
    let status=std::process::Command::new("/usr/bin/open").arg(&url).status().map_err(|e|e.to_string())?;
    if status.success(){Ok(())}else{Err(format!("Could not open SMB connection: {status}"))}
}
pub fn executable(name:&str)->Option<PathBuf> {
    let mut dirs=std::env::var_os("PATH").map(|p|std::env::split_paths(&p).collect::<Vec<_>>()).unwrap_or_default();
    // Finder-launched applications do not inherit the user's shell PATH.
    dirs.extend(["/opt/homebrew/bin","/usr/local/bin","/usr/bin","/bin"].map(PathBuf::from));
    dirs.into_iter().map(|d|d.join(name)).find(|p|p.is_file())
}
pub fn open_with(path:&Path,program:&str)->Result<(),String> {
    if matches!(program,"terminal"|"iterm"|"cmd"|"powershell"|"wt"|"gitbash") {
        return rhfiles_core::enumerator::open_terminal(path,if program=="iterm"{"iterm"}else{"terminal"});
    }
    let app=match program {
        "vscode"=>"Visual Studio Code", "cursor"=>"Cursor", "sublime"=>"Sublime Text", "vlc"=>"VLC", "textedit"|"notepad"=>"TextEdit",
        "preview"=>"Preview", _ if program.ends_with(".app")=>program,
        _=>return Err(format!("Application is not supported on macOS: {program}")),
    };
    let status=std::process::Command::new("/usr/bin/open").args(["-a",app,"--"]).arg(path).status().map_err(|e|e.to_string())?;
    if status.success(){Ok(())}else{Err(format!("Could not open {app}: {status}"))}
}
