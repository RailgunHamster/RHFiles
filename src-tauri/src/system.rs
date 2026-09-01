use crate::types::*;
use rhfiles_core::enumerator;

use std::path::PathBuf;
use tauri::{Emitter, Listener};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command(async)]
pub fn get_thumbnail(path: String, size: u32) -> Result<String, String> {
    enumerator::generate_thumbnail(&PathBuf::from(&path), size)
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    enumerator::open_file(&PathBuf::from(&path))
}

#[tauri::command]
pub fn show_properties(path: String) -> Result<(), String> {
    enumerator::show_properties(&PathBuf::from(&path))
}

#[tauri::command(async)]
pub fn read_file_preview(path: String) -> Result<FilePreview, String> {
    let p = PathBuf::from(&path);
    let metadata = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let ext = p.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default().to_lowercase();
    let is_image = matches!(ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "ico" | "tiff" | "tif");
    let is_text = matches!(ext.as_str(),
        "txt" | "md" | "rs" | "js" | "ts" | "json" | "toml" | "yaml" | "yml" | "xml"
            | "html" | "css" | "scss" | "py" | "c" | "cpp" | "h" | "hpp" | "java" | "go"
            | "sh" | "bat" | "ps1" | "ini" | "cfg" | "log" | "csv" | "sql" | "rb" | "php"
            | "swift" | "kt" | "lua" | "vim" | "dockerfile" | "makefile" | "gitignore"
            | "env" | "lock" | "svg");
    if is_image {
        let thumb_b64 = enumerator::generate_thumbnail(&p, 400).ok();
        Ok(FilePreview { preview_type: "image".to_string(), text_content: None, image_data: thumb_b64, size: metadata.len() })
    } else if is_text || metadata.len() < 500_000 {
        let text = enumerator::read_file_text(&p, 100_000)?;
        Ok(FilePreview { preview_type: "text".to_string(), text_content: Some(text), image_data: None, size: metadata.len() })
    } else {
        Ok(FilePreview { preview_type: "binary".to_string(), text_content: None, image_data: None, size: metadata.len() })
    }
}

#[tauri::command]
pub fn get_file_icon(path: String, size: u32) -> Result<String, String> {
    enumerator::extract_file_icon(&PathBuf::from(&path), size)
}

#[tauri::command]
pub fn get_new_file_templates() -> Result<Vec<enumerator::NewFileTemplate>, String> {
    enumerator::get_new_file_templates()
}

#[tauri::command]
pub fn create_new_file(parent: String, template: String, name: String) -> Result<(), String> {
    enumerator::create_new_file(&PathBuf::from(&parent), &template, &name)
}

#[tauri::command]
pub fn get_file_association(extension: String) -> Result<String, String> {
    enumerator::get_file_association(&extension)
}

#[tauri::command]
pub fn run_as_admin(path: String) -> Result<(), String> {
    enumerator::run_as_admin(&PathBuf::from(&path))
}

#[tauri::command]
pub fn empty_recycle_bin() -> Result<(), String> {
    enumerator::empty_recycle_bin()
}

#[tauri::command]
pub fn rotate_image(path: String, degrees: i32) -> Result<(), String> {
    enumerator::rotate_image(&PathBuf::from(&path), degrees)
}

#[tauri::command]
pub fn read_shortcut(path: String) -> Result<enumerator::ShortcutInfo, String> {
    enumerator::read_shortcut_target(&PathBuf::from(&path))
}

#[tauri::command]
pub fn detect_ides() -> Vec<enumerator::IDEInfo> {
    enumerator::detect_ides()
}

#[tauri::command]
pub fn open_in_ide(ide_cmd: String, path: String) -> Result<(), String> {
    enumerator::open_in_ide(&ide_cmd, &PathBuf::from(&path))
}

#[tauri::command]
pub fn install_font(path: String) -> Result<(), String> {
    enumerator::install_font(&PathBuf::from(&path))
}

#[tauri::command]
pub fn set_wallpaper(path: String) -> Result<(), String> {
    enumerator::set_wallpaper(&PathBuf::from(&path))
}

#[tauri::command]
pub fn set_file_readonly(path: String, readonly: bool) -> Result<(), String> {
    enumerator::set_file_readonly(&PathBuf::from(&path), readonly)
}

#[tauri::command]
pub fn list_ads(path: String) -> Result<Vec<String>, String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &format!(
            "Get-Item -LiteralPath '{}' -Stream * | Where-Object {{ $_.Stream -ne ':$DATA' }} | Select-Object -ExpandProperty Stream",
            path.replace("'", "''")
        )])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
}

#[tauri::command]
pub fn delete_ads(path: String, stream: String) -> Result<(), String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &format!(
            "Remove-Item -LiteralPath \"{}:{}\" -Force -ErrorAction Stop",
            path.replace('"', "\"\""), stream.replace('"', "\"\"")
        )])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(err.to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn read_ads(path: String, stream: String) -> Result<String, String> {
    let full_path = format!("{}:{}", path, stream);
    std::fs::read_to_string(&full_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unblock_file(path: String) -> Result<(), String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &format!(
            "Unblock-File -LiteralPath '{}'",
            path.replace("'", "''")
        )])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(err.to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn quicklook(path: String) -> Result<(), String> {
    let output = std::process::Command::new("cmd")
        .args(["/C", "where", "QuickLook.exe"])
        .output();
    match output {
        Ok(o) if o.status.success() => {
            let exe = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !exe.is_empty() {
                let _ = std::process::Command::new(&exe).arg(&path).spawn();
            }
            Ok(())
        }
        _ => {
            let seer = std::process::Command::new("cmd")
                .args(["/C", "where", "Seer.exe"])
                .output();
            match seer {
                Ok(s) if s.status.success() => {
                    let exe = String::from_utf8_lossy(&s.stdout).trim().to_string();
                    if !exe.is_empty() {
                        let _ = std::process::Command::new(&exe).arg(&path).spawn();
                    }
                    Ok(())
                }
                _ => Err("QuickLook or Seer Pro not found. Install QuickLook for file previews.".to_string()),
            }
        }
    }
}

#[tauri::command]
pub async fn check_updates() -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let resp = client.get("https://api.github.com/repos/RailgunHamster/RHFiles/releases/latest")
        .header("User-Agent", "RHFiles")
        .send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let latest = body.get("tag_name").and_then(|v| v.as_str()).unwrap_or("");
    let current = env!("CARGO_PKG_VERSION");
    if !latest.is_empty() && latest != current {
        let url = body.get("html_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
        Ok(Some(format!("{}|{}", latest, url)))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn rtf_to_html(path: String) -> Result<String, String> {
    let ps = format!(
        r#"$rtb = New-Object System.Windows.Forms.RichTextBox;
        $rtb.Rtf = [System.IO.File]::ReadAllText('{}');
        $rtb.Text"#,
        path.replace("'", "''")
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-STA", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    Ok(format!("<pre style='white-space:pre-wrap'>{}</pre>", escaped))
}

#[tauri::command]
pub fn docx_to_text(path: String) -> Result<String, String> {
    let ps = format!(
        r#"Add-Type -AssemblyName 'System.IO.Compression.FileSystem';
        $zip = [System.IO.Compression.ZipFile]::OpenRead('{}');
        $entry = $zip.GetEntry('word/document.xml');
        if ($entry) {{
            $stream = $entry.Open();
            $reader = New-Object System.IO.StreamReader($stream);
            $xml = [xml]$reader.ReadToEnd();
            $reader.Close();
            $zip.Dispose();
            $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable);
            $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
            $paragraphs = $xml.SelectNodes('//w:p', $ns);
            ($paragraphs | ForEach-Object {{ 
                $_.SelectNodes('.//w:t', $ns) | ForEach-Object {{ $_.'#text' }}
            }}) -join ' '
        }} else {{
            $zip.Dispose();
            'No document content found'
        }}"#,
        path.replace("'", "''")
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    Ok(format!("<pre style='white-space:pre-wrap'>{}</pre>", escaped))
}

#[tauri::command]
pub async fn format_drive(drive: String, label: String, fs: String, quick: bool) -> Result<(), String> {
    let drive_letter = drive.chars().next().unwrap_or('C');
    let mut args: Vec<String> = vec![
        format!("{}:", drive_letter),
        format!("/fs:{}", fs),
        format!("/v:{}", label),
    ];
    if quick {
        args.push("/q".to_string());
    }
    args.push("/y".to_string());
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("format.com")
        .args(&args)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("format.com")
        .args(&args)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn install_certificate(path: String) -> Result<(), String> {
    let output = std::process::Command::new("certutil")
        .args(["-addstore", "TrustedPublisher", &path])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn set_compat_mode(path: String, mode: String) -> Result<(), String> {
    let ps = if mode.is_empty() {
        format!(
            "Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' -Name '{}' -ErrorAction SilentlyContinue",
            path.replace("'", "''")
        )
    } else {
        format!(
            "if (-not (Test-Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers')) {{ New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' -Force | Out-Null }}; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' -Name '{}' -Value '~ {}' -Force",
            path.replace("'", "''"), mode
        )
    };
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn get_compat_mode(path: String) -> Result<String, String> {
    let escaped = path.replace("'", "''");
    let ps = format!(
        "try {{ (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' -Name '{}' -ErrorAction Stop).'{}' }} catch {{ '' }}",
        escaped, escaped
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;
    let val = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(val.strip_prefix("~ ").unwrap_or(&val).to_string())
}

#[tauri::command]
pub fn log_error(message: String, source: Option<String>, stack: Option<String>) -> Result<(), String> {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let entry = format!("[{}] {} (source: {})\n{}",
        timestamp,
        message,
        source.unwrap_or_default(),
        stack.unwrap_or_default()
    );
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let log_dir = std::path::PathBuf::from(app_data).join("RHFiles").join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log_path = log_dir.join(format!("error-{}.log", chrono::Local::now().format("%Y-%m-%d")));
    use std::io::Write;
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut f| writeln!(f, "{}", entry))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_error_logs() -> Result<Vec<String>, String> {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let log_dir = std::path::PathBuf::from(app_data).join("RHFiles").join("logs");
    if !log_dir.exists() {
        return Ok(Vec::new());
    }
    let mut logs = Vec::new();
    for entry in std::fs::read_dir(&log_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if let Some(name) = path.to_str() {
            if name.ends_with(".log") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    logs.push(content);
                }
            }
        }
    }
    Ok(logs)
}

#[tauri::command]
pub fn list_i18n_files(_app: tauri::AppHandle) -> Result<Vec<I18nFileInfo>, String> {
    let mut result = Vec::new();
    if let Ok(dir) = std::path::PathBuf::from("../src/i18n").canonicalize() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    let code = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
                    if code.is_empty() { continue; }
                    let url = format!("/i18n/{}.json", code);
                    result.push(I18nFileInfo {
                        code: code.clone(),
                        name: code.clone(),
                        url,
                    });
                }
            }
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn list_mtp_devices() -> Result<Vec<FileInfo>, String> {
    let ps = r#"
        try {
            $shell = New-Object -ComObject Shell.Application
            $devices = $shell.NameSpace(17)
            $results = @()
            foreach ($item in $devices.Items()) {
                $path = $item.Path
                if ($path -match '^::\{') {
                    $name = $item.Name
                    if ($name -and $name -notmatch '^[A-Z]:$') {
                        $results += @{
                            name = $name
                            path = $path
                            is_dir = $true
                        }
                    }
                }
            }
            $results | ConvertTo-Json -Compress
        } catch {
            '[]'
        }
    "#;

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-STA", "-Command", ps])
        .output().map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let raw: Vec<serde_json::Value> = serde_json::from_str(&stdout).unwrap_or_default();

    let mut devices = Vec::new();
    for item in raw {
        devices.push(FileInfo {
            name: item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            path: item.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            extension: String::new(),
            is_dir: true,
            is_hidden: false,
            size: 0,
            size_display: String::new(),
            modified: String::new(),
            created: String::new(),
            modified_ts: 0,
            created_ts: 0,
            folder_size: None,
        });
    }

    Ok(devices)
}

#[tauri::command]
pub async fn run_gui_tests(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use std::sync::mpsc;
    let (tx, rx): (mpsc::Sender<String>, mpsc::Receiver<String>) = mpsc::channel();
    let tx = std::sync::Mutex::new(Some(tx));

    let listener = app.listen("test-results", move |event| {
        if let Some(tx) = tx.lock().unwrap().take() {
            let payload = event.payload().to_string();
            let _ = tx.send(payload);
        }
    });

    app.emit("run-tests", ()).map_err(|e| e.to_string())?;

    let result = rx.recv_timeout(std::time::Duration::from_secs(60));
    app.unlisten(listener);

    match result {
        Ok(json_str) => {
            let val: serde_json::Value = serde_json::from_str(&json_str).unwrap_or_else(|_| {
                serde_json::json!({ "error": "Failed to parse test results", "raw": json_str })
            });
            Ok(val)
        }
        Err(_) => Ok(serde_json::json!({ "error": "Test runner timed out after 60s" })),
    }
}

#[tauri::command]
pub fn write_test_results(results: String) -> Result<(), String> {
    let tmp = std::env::var("TEMP").unwrap_or_else(|_| ".".to_string());
    let path = std::path::PathBuf::from(tmp).join("rhfiles-test-results.json");
    std::fs::write(&path, &results).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_with_program(path: String, program: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;
    let p = std::path::PathBuf::from(&path);
    let is_dir = p.is_dir();
    let dir = if is_dir { path.clone() } else { p.parent().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default() };

    match program.as_str() {
        "vscode" => {
            let local = std::path::PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join("Programs").join("Microsoft VS Code").join("Code.exe");
            let exe = which("code").unwrap_or(if local.exists() { local } else { std::path::PathBuf::from("code") });
            #[cfg(target_os = "windows")] { std::process::Command::new(&exe).arg(&path).creation_flags(0).spawn().map_err(|e| e.to_string())?; }
            #[cfg(not(target_os = "windows"))] { std::process::Command::new(&exe).arg(&path).spawn().map_err(|e| e.to_string())?; }
        }
        "visual_studio" => {
            let vswhere = std::path::PathBuf::from("C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe");
            let devenv = if vswhere.exists() {
                std::process::Command::new(&vswhere).args(["-latest", "-property", "installationPath"]).output().ok()
                    .and_then(|o| { let s = String::from_utf8_lossy(&o.stdout).trim().to_string(); if s.is_empty() { None } else { Some(std::path::PathBuf::from(s).join("Common7").join("IDE").join("devenv.exe")) } })
            } else { None };
            let exe = devenv.unwrap_or_else(|| std::path::PathBuf::from("devenv"));
            #[cfg(target_os = "windows")] { std::process::Command::new(&exe).arg(&path).creation_flags(0).spawn().map_err(|e| e.to_string())?; }
            #[cfg(not(target_os = "windows"))] { std::process::Command::new(&exe).arg(&path).spawn().map_err(|e| e.to_string())?; }
        }
        "cmd" => {
            std::process::Command::new("cmd").args(["/k", &format!("cd /d \"{}\"", dir)]).spawn().map_err(|e| e.to_string())?;
        }
        "powershell" => {
            let exe = which("pwsh").unwrap_or(std::path::PathBuf::from("powershell"));
            std::process::Command::new(&exe).args(["-NoExit", "-Command", &format!("cd '{}'", dir)]).spawn().map_err(|e| e.to_string())?;
        }
        "git_bash" => {
            let exe = std::process::Command::new("git").arg("--exec-path").output().ok()
                .and_then(|o| { let s = String::from_utf8_lossy(&o.stdout).trim().to_string(); Some(std::path::PathBuf::from(s).join("..").join("git-bash.exe")) });
            let exe = exe.filter(|e| e.exists()).unwrap_or_else(|| std::path::PathBuf::from("C:\\Program Files\\Git\\git-bash.exe"));
            std::process::Command::new(&exe).arg("--cd=").arg(&dir).spawn().map_err(|e| e.to_string())?;
        }
        "vlc" => {
            let fallback = std::path::PathBuf::from("C:\\Program Files\\VideoLAN\\VLC\\vlc.exe");
            let exe = which("vlc").unwrap_or(if fallback.exists() { fallback } else { std::path::PathBuf::from("vlc") });
            #[cfg(target_os = "windows")] { std::process::Command::new(&exe).arg(&path).creation_flags(0x08000000).spawn().map_err(|e| e.to_string())?; }
            #[cfg(not(target_os = "windows"))] { std::process::Command::new(&exe).arg(&path).spawn().map_err(|e| e.to_string())?; }
        }
        "vlc_folder" => {
            let fallback = std::path::PathBuf::from("C:\\Program Files\\VideoLAN\\VLC\\vlc.exe");
            let exe = which("vlc").unwrap_or(if fallback.exists() { fallback } else { std::path::PathBuf::from("vlc") });
            #[cfg(target_os = "windows")] { std::process::Command::new(&exe).args(["--recursive=expand", &format!("{}\\", path)]).creation_flags(0x08000000).spawn().map_err(|e| e.to_string())?; }
            #[cfg(not(target_os = "windows"))] { std::process::Command::new(&exe).args(["--recursive=expand", &format!("{}/", path)]).spawn().map_err(|e| e.to_string())?; }
        }
        "potplayer" => {
            let exe64 = std::path::PathBuf::from("C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe");
            let exe32 = std::path::PathBuf::from("C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini.exe");
            let exe = if exe64.exists() { exe64 } else { exe32 };
            #[cfg(target_os = "windows")] { std::process::Command::new(&exe).arg(&path).creation_flags(0x08000000).spawn().map_err(|e| e.to_string())?; }
            #[cfg(not(target_os = "windows"))] { std::process::Command::new(&exe).arg(&path).spawn().map_err(|e| e.to_string())?; }
        }
        _ => return Err(format!("Unknown program: {}", program)),
    }
    Ok(())
}

fn which(name: &str) -> Option<std::path::PathBuf> {
    std::process::Command::new("where").arg(name).output().ok().and_then(|o| {
        let s = String::from_utf8_lossy(&o.stdout);
        let line = s.lines().next()?.trim();
        if line.is_empty() { None } else { Some(std::path::PathBuf::from(line)) }
    })
}

#[tauri::command]
pub fn copy_file_path(path: String) -> Result<(), String> {
    let script = format!("Set-Clipboard -Value '{}'", path.replace('\'', "''"));
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .creation_flags(0x08000000u32)
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn show_open_with_dialog(path: String) -> Result<(), String> {
    std::process::Command::new("rundll32.exe")
        .args(["shell32.dll,OpenAs_RunDLL", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn compress_with(sources: Vec<String>, dest: String, tool: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;
    match tool.as_str() {
        "7zip" => {
            let exe = std::path::PathBuf::from("C:\\Program Files\\7-Zip\\7z.exe");
            if !exe.exists() { return Err("7-Zip not found".into()); }
            #[cfg(target_os = "windows")] { std::process::Command::new(&exe).args(["a", &dest]).args(sources.iter()).creation_flags(0x08000000).spawn().map_err(|e| e.to_string())?; }
            #[cfg(not(target_os = "windows"))] { std::process::Command::new(&exe).args(["a", &dest]).args(sources.iter()).spawn().map_err(|e| e.to_string())?; }
        }
        "bandizip" => {
            let exe = std::path::PathBuf::from("C:\\Program Files\\Bandizip\\Bandizip.exe");
            if !exe.exists() { return Err("Bandizip not found".into()); }
            std::process::Command::new(&exe).args(["a", &dest]).args(sources.iter()).spawn().map_err(|e| e.to_string())?;
        }
        "winrar" => {
            let exe = std::path::PathBuf::from("C:\\Program Files\\WinRAR\\WinRAR.exe");
            if !exe.exists() { return Err("WinRAR not found".into()); }
            std::process::Command::new(&exe).args(["a", &dest]).args(sources.iter()).spawn().map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Unknown compression tool: {}", tool)),
    }
    Ok(())
}

#[tauri::command]
pub fn share_file(path: String, target: String) -> Result<(), String> {
    let _ = copy_file_path(path.clone());
    match target.as_str() {
        "qq" => {
            let exe = find_app(&[
                "C:\\Program Files (x86)\\Tencent\\QQ\\Bin\\QQ.exe",
                "C:\\Program Files\\Tencent\\QQ\\Bin\\QQ.exe",
            ]);
            if let Some(exe) = exe { std::process::Command::new(&exe).spawn().map_err(|e| e.to_string())?; }
        }
        "wechat" => {
            let exe = find_app(&[
                "C:\\Program Files (x86)\\Tencent\\WeChat\\WeChat.exe",
                "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe",
            ]);
            if let Some(exe) = exe { std::process::Command::new(&exe).spawn().map_err(|e| e.to_string())?; }
        }
        "feishu" => {
            let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
            let exe = find_app(&[
                &format!("{}\\Feishu\\Feishu.exe", local),
                "C:\\Program Files\\Lark\\Lark.exe",
            ]);
            if let Some(exe) = exe { std::process::Command::new(&exe).spawn().map_err(|e| e.to_string())?; }
        }
        "windows" => {}
        _ => return Err(format!("Unknown share target: {}", target)),
    }
    Ok(())
}

fn find_app(paths: &[&str]) -> Option<std::path::PathBuf> {
    paths.iter().find(|p| std::path::Path::new(p).exists()).map(|p| std::path::PathBuf::from(p))
}
