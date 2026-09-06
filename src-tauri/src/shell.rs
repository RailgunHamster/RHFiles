use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const ICACLS_TIMEOUT: Duration = Duration::from_secs(10);

fn run_icacls(args: &[String]) -> Result<Output, String> {
    let mut command = Command::new("icacls");
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);

    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let started = Instant::now();
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(_) => return child.wait_with_output().map_err(|e| e.to_string()),
            None if started.elapsed() >= ICACLS_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait_with_output();
                return Err("Permission operation timed out after 10 seconds".to_string());
            }
            None => std::thread::sleep(Duration::from_millis(25)),
        }
    }
}

#[tauri::command(async)]
pub fn get_permissions(path: String) -> Result<Vec<serde_json::Value>, String> {
    let output = run_icacls(&[path])?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut perms = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.ends_with(':') {
            continue;
        }
        if line.contains(":(") {
            let parts: Vec<&str> = line.splitn(2, ":(").collect();
            if parts.len() == 2 {
                let account = parts[0].trim().to_string();
                let access = format!("({}", parts[1].trim_end_matches(','));
                let access_display = access
                    .replace("(F)", " Full Control")
                    .replace("(M)", " Modify")
                    .replace("(RX)", " Read & Execute")
                    .replace("(R)", " Read")
                    .replace("(W)", " Write")
                    .replace("(X)", " Execute")
                    .replace("(OI)", " [Files]")
                    .replace("(CI)", " [Subfolders]")
                    .replace("(IO)", " [Inherit Only]")
                    .replace("(NP)", " [No Inherit]");

                perms.push(serde_json::json!({
                    "account": account,
                    "access": access,
                    "display": access_display
                }));
            }
        }
    }

    Ok(perms)
}

#[tauri::command(async)]
pub fn set_permission(path: String, account: String, permission: String) -> Result<(), String> {
    let perm_arg = format!("{}:{}", account, permission);
    let output = run_icacls(&[path, "/grant".to_string(), perm_arg])?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command(async)]
pub fn remove_permission(path: String, account: String) -> Result<(), String> {
    let output = run_icacls(&[path, "/remove".to_string(), account])?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command(async)]
pub fn inherit_permissions(path: String, enable: bool) -> Result<(), String> {
    let arg = if enable {
        "/inheritance:e"
    } else {
        "/inheritance:d"
    };
    let output = run_icacls(&[path, arg.to_string()])?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}
