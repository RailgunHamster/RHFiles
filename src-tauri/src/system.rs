use crate::types::*;
use rhfiles_core::enumerator;

use std::io::Read;
use std::path::PathBuf;
use tauri::{Emitter, Listener};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const PREVIEW_SNIFF_BYTES: u64 = 16 * 1024;

fn find_dust_executable() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current_exe) = std::env::current_exe()
        && let Some(exe_dir) = current_exe.parent()
    {
        candidates.push(exe_dir.join("dust.exe"));
        candidates.push(exe_dir.join("resources").join("dust.exe"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("thirdparty")
            .join("dust.exe"),
    );
    if let Some(on_path) = which("dust.exe").or_else(|| which("dust")) {
        candidates.push(on_path);
    }
    candidates.into_iter().find(|path| path.is_file())
}

#[tauri::command(async)]
pub fn analyze_disk_usage(
    path: String,
    depth: u8,
    max_entries: u16,
) -> Result<serde_json::Value, String> {
    let target = PathBuf::from(&path);
    if !target.is_dir() {
        return Err(format!("Not a folder: {path}"));
    }
    let dust =
        find_dust_executable().ok_or_else(|| "Bundled dust.exe was not found".to_string())?;
    let depth = depth.clamp(1, 4).to_string();
    let max_entries = max_entries.clamp(20, 500).to_string();
    let mut command = std::process::Command::new(dust);
    command
        .args(["-j", "-P", "-d", &depth, "-n", &max_entries])
        .arg(&target);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000u32);
    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if error.is_empty() {
            format!("dust exited with status {}", output.status)
        } else {
            error
        });
    }
    let mut result: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Invalid dust JSON: {error}"))?;
    annotate_dust_nodes(&mut result);
    Ok(result)
}

fn annotate_dust_nodes(value: &mut serde_json::Value) {
    if let Some(object) = value.as_object_mut() {
        let is_dir = object
            .get("name")
            .and_then(serde_json::Value::as_str)
            .map(PathBuf::from)
            .is_some_and(|path| path.is_dir());
        object.insert("is_dir".to_string(), serde_json::Value::Bool(is_dir));
        if let Some(children) = object
            .get_mut("children")
            .and_then(serde_json::Value::as_array_mut)
        {
            children.iter_mut().for_each(annotate_dust_nodes);
        }
    }
}

#[cfg(test)]
mod dust_tests {
    use super::*;

    #[test]
    fn bundled_dust_returns_json_for_a_small_folder() {
        let result = analyze_disk_usage(env!("CARGO_MANIFEST_DIR").to_string(), 1, 20)
            .expect("bundled dust should analyze the Tauri source folder");
        assert!(
            result
                .get("name")
                .and_then(|value| value.as_str())
                .is_some()
        );
        assert!(result.get("size").is_some());
    }
}

fn has_known_binary_signature(bytes: &[u8]) -> bool {
    const SIGNATURES: &[&[u8]] = &[
        b"MZ",                               // Windows executable / DLL
        b"PK\x03\x04",                       // ZIP / JAR / Office document
        b"PK\x05\x06",                       // Empty ZIP archive
        b"PK\x07\x08",                       // Spanned ZIP archive
        b"\x7fELF",                          // ELF executable
        b"%PDF-",                            // PDF document
        b"\x89PNG\r\n\x1a\n",                // PNG image
        b"\xff\xd8\xff",                     // JPEG image
        b"GIF87a",                           // GIF image
        b"GIF89a",                           // GIF image
        b"\x1f\x8b",                         // Gzip archive
        b"7z\xbc\xaf\x27\x1c",               // 7-Zip archive
        b"Rar!\x1a\x07",                     // RAR archive
        b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", // OLE compound document
        b"SQLite format 3\0",                // SQLite database
        b"\0asm",                            // WebAssembly module
        b"\xca\xfe\xba\xbe",                 // Java class / Mach-O universal binary
        b"\xfe\xed\xfa\xce",                 // Mach-O binary
        b"\xfe\xed\xfa\xcf",                 // 64-bit Mach-O binary
        b"\xce\xfa\xed\xfe",                 // Little-endian Mach-O binary
        b"\xcf\xfa\xed\xfe",                 // Little-endian 64-bit Mach-O binary
    ];

    SIGNATURES
        .iter()
        .any(|signature| bytes.starts_with(signature))
}

fn is_probably_text_content(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return true;
    }

    if has_known_binary_signature(bytes) {
        return false;
    }

    // UTF-16/UTF-32 cannot currently be rendered correctly by read_file_text.
    if bytes.starts_with(&[0xff, 0xfe])
        || bytes.starts_with(&[0xfe, 0xff])
        || bytes.starts_with(&[0x00, 0x00, 0xfe, 0xff])
        || bytes.starts_with(&[0xff, 0xfe, 0x00, 0x00])
    {
        return false;
    }

    let content = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    if content.contains(&0) {
        return false;
    }

    let suspicious_controls = content
        .iter()
        .filter(|byte| {
            **byte < 0x20 && !matches!(**byte, b'\t' | b'\n' | b'\x0c' | b'\r' | b'\x1b')
        })
        .count();

    // ANSI escape bytes are valid in logs. Other controls are accepted only
    // when they make up no more than roughly two percent of the sample.
    suspicious_controls == 0 || suspicious_controls * 50 <= content.len()
}

fn is_probably_text_file(path: &std::path::Path) -> Result<bool, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut sample = Vec::with_capacity(PREVIEW_SNIFF_BYTES as usize);
    file.take(PREVIEW_SNIFF_BYTES)
        .read_to_end(&mut sample)
        .map_err(|e| e.to_string())?;
    Ok(is_probably_text_content(&sample))
}

#[tauri::command(async)]
pub fn get_thumbnail(path: String, size: u32) -> Result<String, String> {
    enumerator::generate_thumbnail(&PathBuf::from(&path), size)
}

#[tauri::command(async)]
pub fn open_file(path: String) -> Result<(), String> {
    enumerator::open_file(&PathBuf::from(&path))
}

#[tauri::command(async)]
pub fn show_properties(path: String) -> Result<(), String> {
    enumerator::show_properties(&PathBuf::from(&path))
}

#[tauri::command(async)]
pub fn read_file_preview(path: String) -> Result<FilePreview, String> {
    let p = PathBuf::from(&path);
    let metadata = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_default()
        .to_lowercase();
    let is_image = matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "ico" | "tiff" | "tif"
    );
    let is_text = matches!(
        ext.as_str(),
        "txt"
            | "md"
            | "rs"
            | "js"
            | "ts"
            | "json"
            | "toml"
            | "yaml"
            | "yml"
            | "xml"
            | "html"
            | "css"
            | "scss"
            | "py"
            | "c"
            | "cpp"
            | "h"
            | "hpp"
            | "java"
            | "go"
            | "sh"
            | "bat"
            | "ps1"
            | "ini"
            | "cfg"
            | "log"
            | "csv"
            | "sql"
            | "rb"
            | "php"
            | "swift"
            | "kt"
            | "lua"
            | "vim"
            | "dockerfile"
            | "makefile"
            | "gitignore"
            | "env"
            | "lock"
            | "svg"
    );
    if is_image {
        let thumb_b64 = enumerator::generate_thumbnail(&p, 400).ok();
        Ok(FilePreview {
            preview_type: "image".to_string(),
            text_content: None,
            image_data: thumb_b64,
            size: metadata.len(),
        })
    } else if (is_text || metadata.len() < 500_000) && is_probably_text_file(&p)? {
        // The preview is intentionally bounded. The UI applies a second,
        // smaller rendering limit before syntax highlighting, so unusually
        // large/minified files cannot monopolize the WebView thread.
        let text = enumerator::read_file_text(&p, 65_536)?;
        Ok(FilePreview {
            preview_type: "text".to_string(),
            text_content: Some(text),
            image_data: None,
            size: metadata.len(),
        })
    } else {
        Ok(FilePreview {
            preview_type: "binary".to_string(),
            text_content: None,
            image_data: None,
            size: metadata.len(),
        })
    }
}

#[cfg(test)]
mod preview_detection_tests {
    use super::is_probably_text_content;

    #[test]
    fn accepts_plain_and_utf8_text() {
        assert!(is_probably_text_content(b"hello\r\nworld\t42"));
        assert!(is_probably_text_content("中文预览内容".as_bytes()));
        assert!(is_probably_text_content(b"\xef\xbb\xbfUTF-8 with BOM"));
    }

    #[test]
    fn accepts_empty_content() {
        assert!(is_probably_text_content(b""));
    }

    #[test]
    fn rejects_jar_and_dll_signatures() {
        assert!(!is_probably_text_content(b"PK\x03\x04jar payload"));
        assert!(!is_probably_text_content(b"MZfake dll payload"));
    }

    #[test]
    fn rejects_binary_content_even_without_a_known_signature() {
        assert!(!is_probably_text_content(b"header\0payload"));
        assert!(!is_probably_text_content(&[
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0e, 0x0f, 0x10,
        ]));
    }

    #[test]
    fn allows_a_few_controls_in_a_log_sample() {
        assert!(is_probably_text_content(
            b"line one\n\x1b[31mred text\x1b[0m\n"
        ));
    }
}

#[tauri::command(async)]
pub fn get_file_icon(path: String, size: u32) -> Result<String, String> {
    enumerator::extract_file_icon(&PathBuf::from(&path), size)
}

#[tauri::command(async)]
pub fn get_new_file_templates() -> Result<Vec<enumerator::NewFileTemplate>, String> {
    enumerator::get_new_file_templates()
}

#[tauri::command(async)]
pub fn create_new_file(parent: String, template: String, name: String) -> Result<(), String> {
    enumerator::create_new_file(&PathBuf::from(&parent), &template, &name)
}

#[tauri::command(async)]
pub fn get_file_association(extension: String) -> Result<String, String> {
    enumerator::get_file_association(&extension)
}

#[tauri::command(async)]
pub fn run_as_admin(path: String) -> Result<(), String> {
    enumerator::run_as_admin(&PathBuf::from(&path))
}

#[tauri::command]
pub fn empty_recycle_bin() -> Result<(), String> {
    enumerator::empty_recycle_bin()
}

#[tauri::command(async)]
pub fn rotate_image(path: String, degrees: i32) -> Result<(), String> {
    enumerator::rotate_image(&PathBuf::from(&path), degrees)
}

#[tauri::command(async)]
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

#[tauri::command(async)]
pub fn install_font(path: String) -> Result<(), String> {
    enumerator::install_font(&PathBuf::from(&path))
}

#[tauri::command(async)]
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
    Ok(stdout
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect())
}

#[tauri::command]
pub fn delete_ads(path: String, stream: String) -> Result<(), String> {
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "Remove-Item -LiteralPath \"{}:{}\" -Force -ErrorAction Stop",
                path.replace('"', "\"\""),
                stream.replace('"', "\"\"")
            ),
        ])
        .output()
        .map_err(|e| e.to_string())?;
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
        .args([
            "-NoProfile",
            "-Command",
            &format!("Unblock-File -LiteralPath '{}'", path.replace("'", "''")),
        ])
        .output()
        .map_err(|e| e.to_string())?;
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
                _ => Err(
                    "QuickLook or Seer Pro not found. Install QuickLook for file previews."
                        .to_string(),
                ),
            }
        }
    }
}

#[tauri::command(async)]
pub fn rtf_to_html(path: String) -> Result<String, String> {
    let ps = format!(
        r#"$rtb = New-Object System.Windows.Forms.RichTextBox;
        $rtb.Rtf = [System.IO.File]::ReadAllText('{}');
        $rtb.Text"#,
        path.replace("'", "''")
    );
    let mut command = std::process::Command::new("powershell");
    command.args(["-NoProfile", "-STA", "-Command", &ps]);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);
    let output = command.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let escaped = text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;");
    Ok(format!(
        "<pre style='white-space:pre-wrap'>{}</pre>",
        escaped
    ))
}

#[tauri::command(async)]
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
    let mut command = std::process::Command::new("powershell");
    command.args(["-NoProfile", "-Command", &ps]);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);
    let output = command.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let escaped = text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;");
    Ok(format!(
        "<pre style='white-space:pre-wrap'>{}</pre>",
        escaped
    ))
}

#[tauri::command(async)]
pub fn format_drive(drive: String, label: String, fs: String, quick: bool) -> Result<(), String> {
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

#[tauri::command(async)]
pub fn install_certificate(path: String) -> Result<(), String> {
    let output = std::process::Command::new("certutil")
        .args(["-addstore", "TrustedPublisher", &path])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| e.to_string())?;
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
            path.replace("'", "''"),
            mode
        )
    };
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output()
        .map_err(|e| e.to_string())?;
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
        .output()
        .map_err(|e| e.to_string())?;
    let val = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(val.strip_prefix("~ ").unwrap_or(&val).to_string())
}

#[tauri::command]
pub fn log_error(
    message: String,
    source: Option<String>,
    stack: Option<String>,
) -> Result<(), String> {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let entry = format!(
        "[{}] {} (source: {})\n{}",
        timestamp,
        message,
        source.unwrap_or_default(),
        stack.unwrap_or_default()
    );
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let log_dir = std::path::PathBuf::from(app_data)
        .join("RHFiles")
        .join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log_path = log_dir.join(format!(
        "error-{}.log",
        chrono::Local::now().format("%Y-%m-%d")
    ));
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
    let log_dir = std::path::PathBuf::from(app_data)
        .join("RHFiles")
        .join("logs");
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
                    let code = path
                        .file_stem()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    if code.is_empty() {
                        continue;
                    }
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

#[tauri::command(async)]
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

    let mut command = std::process::Command::new("powershell");
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);
    let output = command
        .args(["-NoProfile", "-STA", "-Command", ps])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let raw: Vec<serde_json::Value> = serde_json::from_str(&stdout).unwrap_or_default();

    let mut devices = Vec::new();
    for item in raw {
        devices.push(FileInfo {
            name: item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            path: item
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
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
            let val: serde_json::Value = serde_json::from_str(&json_str).unwrap_or_else(
                |_| serde_json::json!({ "error": "Failed to parse test results", "raw": json_str }),
            );
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

#[tauri::command(async)]
pub fn open_with_program(path: String, program: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;
    let p = std::path::PathBuf::from(&path);
    let is_dir = p.is_dir();
    let dir = if is_dir {
        path.clone()
    } else {
        p.parent()
            .map(|x| x.to_string_lossy().into_owned())
            .unwrap_or_default()
    };

    match program.as_str() {
        "vscode" => {
            let local = std::path::PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default())
                .join("Programs")
                .join("Microsoft VS Code")
                .join("Code.exe");
            let exe = if local.exists() {
                local
            } else {
                which("code").unwrap_or_else(|| std::path::PathBuf::from("code"))
            };
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new(&exe)
                    .arg(&path)
                    .creation_flags(0)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                std::process::Command::new(&exe)
                    .arg(&path)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
        "visual_studio" => {
            let vswhere = std::path::PathBuf::from(
                "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe",
            );
            let devenv = if vswhere.exists() {
                let mut command = std::process::Command::new(&vswhere);
                command.args(["-latest", "-property", "installationPath"]);
                #[cfg(target_os = "windows")]
                command.creation_flags(0x08000000);
                command.output().ok().and_then(|o| {
                    let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    if s.is_empty() {
                        None
                    } else {
                        Some(
                            std::path::PathBuf::from(s)
                                .join("Common7")
                                .join("IDE")
                                .join("devenv.exe"),
                        )
                    }
                })
            } else {
                None
            };
            let exe = devenv.unwrap_or_else(|| std::path::PathBuf::from("devenv"));
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new(&exe)
                    .arg(&path)
                    .creation_flags(0)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                std::process::Command::new(&exe)
                    .arg(&path)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
        "cmd" => {
            std::process::Command::new("cmd")
                .args(["/k", &format!("cd /d \"{}\"", dir)])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        "powershell" => {
            let exe = powershell_executable();
            std::process::Command::new(&exe)
                .args(["-NoLogo", "-NoExit"])
                .current_dir(&dir)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        "git_bash" => {
            let standard = std::path::PathBuf::from("C:\\Program Files\\Git\\git-bash.exe");
            let exe = if standard.exists() {
                standard
            } else {
                let mut command = std::process::Command::new("git");
                command.arg("--exec-path");
                #[cfg(target_os = "windows")]
                command.creation_flags(0x08000000);
                command
                    .output()
                    .ok()
                    .and_then(|o| {
                        let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                        Some(std::path::PathBuf::from(s).join("..").join("git-bash.exe"))
                    })
                    .filter(|e| e.exists())
                    .unwrap_or_else(|| std::path::PathBuf::from("git-bash.exe"))
            };
            std::process::Command::new(&exe)
                .arg("--cd=")
                .arg(&dir)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        "vlc" => {
            let fallback = std::path::PathBuf::from("C:\\Program Files\\VideoLAN\\VLC\\vlc.exe");
            let exe = if fallback.exists() {
                fallback
            } else {
                which("vlc").unwrap_or_else(|| std::path::PathBuf::from("vlc"))
            };
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new(&exe)
                    .arg(&path)
                    .creation_flags(0x08000000)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                std::process::Command::new(&exe)
                    .arg(&path)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
        "vlc_folder" => {
            let fallback = std::path::PathBuf::from("C:\\Program Files\\VideoLAN\\VLC\\vlc.exe");
            let exe = if fallback.exists() {
                fallback
            } else {
                which("vlc").unwrap_or_else(|| std::path::PathBuf::from("vlc"))
            };
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new(&exe)
                    .args(["--recursive=expand", &format!("{}\\", path)])
                    .creation_flags(0x08000000)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                std::process::Command::new(&exe)
                    .args(["--recursive=expand", &format!("{}/", path)])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
        "potplayer" => {
            let exe64 =
                std::path::PathBuf::from("C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe");
            let exe32 = std::path::PathBuf::from(
                "C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini.exe",
            );
            let exe = if exe64.exists() { exe64 } else { exe32 };
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new(&exe)
                    .arg(&path)
                    .creation_flags(0x08000000)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                std::process::Command::new(&exe)
                    .arg(&path)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
        _ => return Err(format!("Unknown program: {}", program)),
    }
    Ok(())
}

fn which(name: &str) -> Option<std::path::PathBuf> {
    let mut command = std::process::Command::new("where");
    command.arg(name);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    command.output().ok().and_then(|o| {
        let s = String::from_utf8_lossy(&o.stdout);
        let line = s.lines().next()?.trim();
        if line.is_empty() {
            None
        } else {
            Some(std::path::PathBuf::from(line))
        }
    })
}

fn powershell_executable() -> std::path::PathBuf {
    static POWERSHELL_EXE: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

    POWERSHELL_EXE
        .get_or_init(|| {
            if let Some(program_files) = std::env::var_os("ProgramFiles") {
                let standard_path = std::path::PathBuf::from(program_files)
                    .join("PowerShell")
                    .join("7")
                    .join("pwsh.exe");
                if standard_path.is_file() {
                    return standard_path;
                }
            }
            which("pwsh").unwrap_or_else(|| std::path::PathBuf::from("powershell.exe"))
        })
        .clone()
}

#[tauri::command(async)]
pub fn open_terminal(path: String, terminal: String) -> Result<(), String> {
    match terminal.as_str() {
        "powershell" | "cmd" => open_with_program(path, terminal),
        _ => enumerator::open_terminal(&std::path::PathBuf::from(path), &terminal),
    }
}

#[tauri::command(async)]
pub fn copy_file_path(path: String) -> Result<(), String> {
    let script = format!("Set-Clipboard -Value '{}'", path.replace('\'', "''"));
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .creation_flags(0x08000000u32)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!(
            "PowerShell clipboard command exited with status {status}"
        ));
    }
    Ok(())
}

#[tauri::command(async)]
pub fn show_open_with_dialog(path: String) -> Result<(), String> {
    std::process::Command::new("rundll32.exe")
        .args(["shell32.dll,OpenAs_RunDLL", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
pub fn compress_with(sources: Vec<String>, dest: String, tool: String) -> Result<(), String> {
    match tool.as_str() {
        "7zip" => {
            let exe = find_app(&[
                "C:\\Program Files\\7-Zip\\7z.exe",
                "C:\\Program Files (x86)\\7-Zip\\7z.exe",
            ])
            .or_else(|| which("7z.exe"))
            .ok_or("7-Zip not found")?;
            #[cfg(target_os = "windows")]
            {
                let status = std::process::Command::new(&exe)
                    .args(["a", "-y", &dest])
                    .args(sources.iter())
                    .creation_flags(0x08000000)
                    .status()
                    .map_err(|e| e.to_string())?;
                if !status.success() {
                    return Err(format!("7-Zip exited with status {status}"));
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                let status = std::process::Command::new(&exe)
                    .args(["a", "-y", &dest])
                    .args(sources.iter())
                    .status()
                    .map_err(|e| e.to_string())?;
                if !status.success() {
                    return Err(format!("7-Zip exited with status {status}"));
                }
            }
        }
        "bandizip" => {
            let exe = find_app(&[
                "C:\\Program Files\\Bandizip\\bz.exe",
                "C:\\Program Files (x86)\\Bandizip\\bz.exe",
            ])
            .ok_or("Bandizip console tool not found")?;
            let status = std::process::Command::new(&exe)
                .args(["c", "-y", "-r", &dest])
                .args(sources.iter())
                .creation_flags(0x08000000)
                .status()
                .map_err(|e| e.to_string())?;
            if !status.success() {
                return Err(format!("Bandizip exited with status {status}"));
            }
        }
        "winrar" => {
            let exe = find_app(&[
                "C:\\Program Files\\WinRAR\\Rar.exe",
                "C:\\Program Files (x86)\\WinRAR\\Rar.exe",
            ])
            .ok_or("WinRAR console tool not found")?;
            let status = std::process::Command::new(&exe)
                .args(["a", "-r", "-y", &dest])
                .args(sources.iter())
                .creation_flags(0x08000000)
                .status()
                .map_err(|e| e.to_string())?;
            if !status.success() {
                return Err(format!("WinRAR exited with status {status}"));
            }
        }
        _ => return Err(format!("Unknown compression tool: {}", tool)),
    }
    Ok(())
}

#[tauri::command(async)]
pub fn share_file(path: String, target: String) -> Result<(), String> {
    let _ = copy_file_path(path.clone());
    match target.as_str() {
        "qq" => {
            let exe = find_app(&[
                "C:\\Program Files (x86)\\Tencent\\QQ\\Bin\\QQ.exe",
                "C:\\Program Files\\Tencent\\QQ\\Bin\\QQ.exe",
            ]);
            if let Some(exe) = exe {
                std::process::Command::new(&exe)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
        "wechat" => {
            let exe = find_app(&[
                "C:\\Program Files (x86)\\Tencent\\WeChat\\WeChat.exe",
                "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe",
            ]);
            if let Some(exe) = exe {
                std::process::Command::new(&exe)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
        "feishu" => {
            let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
            let exe = find_app(&[
                &format!("{}\\Feishu\\Feishu.exe", local),
                "C:\\Program Files\\Lark\\Lark.exe",
            ]);
            if let Some(exe) = exe {
                std::process::Command::new(&exe)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
        "windows" => {}
        _ => return Err(format!("Unknown share target: {}", target)),
    }
    Ok(())
}

fn find_app(paths: &[&str]) -> Option<std::path::PathBuf> {
    paths
        .iter()
        .find(|p| std::path::Path::new(p).exists())
        .map(|p| std::path::PathBuf::from(p))
}
