use crate::types::*;
use rhfiles_core::enumerator;

use std::io::Read;
use std::path::{Path, PathBuf};
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

fn explorer_target(
    path: &std::path::Path,
    is_directory: Option<bool>,
) -> Result<(PathBuf, bool), String> {
    if let Some(is_directory) = is_directory {
        return Ok((path.to_path_buf(), is_directory));
    }
    let metadata = std::fs::metadata(path)
        .map_err(|error| format!("Cannot access {}: {error}", path.display()))?;
    Ok((path.to_path_buf(), metadata.is_dir()))
}

#[cfg(target_os = "windows")]
fn open_explorer_folder(path: &std::path::Path) -> Result<(), String> {
    let mut command = std::process::Command::new("explorer.exe");
    command.arg(path).creation_flags(0x0800_0000);
    command.spawn().map_err(|error| {
        format!(
            "Failed to open {} in Windows File Explorer: {error}",
            path.display()
        )
    })?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn reveal_file_in_explorer(path: PathBuf) -> Result<(), String> {
    std::thread::spawn(move || {
        use windows::Win32::System::Com::{
            COINIT_APARTMENTTHREADED, CoInitializeEx, CoUninitialize,
        };
        use windows::Win32::UI::Shell::{ILCreateFromPathW, ILFree, SHOpenFolderAndSelectItems};
        use windows::core::HSTRING;

        struct ComGuard;
        impl Drop for ComGuard {
            fn drop(&mut self) {
                unsafe { CoUninitialize() };
            }
        }

        struct PidlGuard(*const windows::Win32::UI::Shell::Common::ITEMIDLIST);
        impl Drop for PidlGuard {
            fn drop(&mut self) {
                unsafe { ILFree(Some(self.0)) };
            }
        }

        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(|error| format!("Cannot initialize Windows Explorer access: {error}"))?;
            let _com_guard = ComGuard;
            let encoded_path = HSTRING::from(path.as_path());
            let item = ILCreateFromPathW(&encoded_path);
            if item.is_null() {
                return Err(format!(
                    "Windows Explorer cannot resolve {}",
                    path.display()
                ));
            }
            let _pidl_guard = PidlGuard(item);
            SHOpenFolderAndSelectItems(item, None, 0).map_err(|error| {
                format!("Windows Explorer cannot reveal {}: {error}", path.display())
            })
        }
    })
    .join()
    .map_err(|_| "Windows Explorer worker stopped unexpectedly".to_string())?
}

#[tauri::command(async)]
pub fn open_in_windows_explorer(path: String, is_directory: Option<bool>) -> Result<(), String> {
    let (target, is_directory) = explorer_target(std::path::Path::new(&path), is_directory)?;

    #[cfg(target_os = "windows")]
    {
        if is_directory {
            open_explorer_folder(&target)
        } else {
            // Use the Shell API so paths containing spaces, commas, Unicode, or
            // UNC components do not depend on explorer.exe command-line parsing.
            let reveal_result = reveal_file_in_explorer(target.clone());
            if reveal_result.is_ok() {
                return Ok(());
            }

            // Selection can fail for some shell namespaces or offline cloud
            // placeholders. Opening the parent still fulfils the core action.
            let parent = target
                .parent()
                .filter(|parent| !parent.as_os_str().is_empty())
                .ok_or_else(|| format!("No containing folder for {}", target.display()))?;
            open_explorer_folder(parent).map_err(|fallback_error| {
                format!(
                    "{}; fallback also failed: {fallback_error}",
                    reveal_result.unwrap_err()
                )
            })
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (target, is_directory);
        Err("Windows File Explorer is only available on Windows".to_string())
    }
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

#[cfg(test)]
mod windows_explorer_tests {
    use super::explorer_target;

    #[test]
    fn explorer_target_preserves_the_path_and_directory_kind() {
        let root = std::env::temp_dir().join(format!(
            "rhfiles-explorer-target-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).expect("create Explorer test folder");
        let file = root.join("a file.txt");
        std::fs::write(&file, b"test").expect("create Explorer test file");

        assert_eq!(explorer_target(&root, None).unwrap(), (root.clone(), true));
        assert_eq!(explorer_target(&file, None).unwrap(), (file.clone(), false));
        assert_eq!(
            explorer_target(&root, Some(true)).unwrap(),
            (root.clone(), true)
        );
        assert_eq!(
            explorer_target(&file, Some(false)).unwrap(),
            (file.clone(), false)
        );

        std::fs::remove_file(file).ok();
        std::fs::remove_dir(root).ok();
    }

    #[test]
    fn explicit_hint_preserves_an_unc_path_without_probing_it() {
        let path = std::path::PathBuf::from(r"\\SERVER-HOME\Public\Software\example file.zip");
        assert_eq!(explorer_target(&path, Some(false)).unwrap(), (path, false));
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
    let p = PathBuf::from(&path);
    let dir = terminal_working_directory(&p)
        .to_string_lossy()
        .into_owned();

    match program.as_str() {
        "vscode" => {
            let exe = find_vscode_executable().ok_or_else(|| {
                "Visual Studio Code was not found. Install VS Code or enable its command-line launcher."
                    .to_string()
            })?;
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
            let command = format!("pushd \"{}\"", dir);
            std::process::Command::new("cmd")
                .args(["/d", "/k", &command])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        "powershell" => {
            let exe = powershell_executable();
            let command = format!("Set-Location -LiteralPath '{}'", dir.replace('\'', "''"));
            std::process::Command::new(&exe)
                .args(["-NoLogo", "-NoExit", "-Command", &command])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        "git_bash" => {
            let exe = find_git_bash_executable().ok_or_else(|| {
                "Git Bash was not found. Install Git for Windows or configure its path in PATH."
                    .to_string()
            })?;
            std::process::Command::new(&exe)
                .arg(git_bash_directory_argument(&dir))
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

fn terminal_working_directory(path: &Path) -> PathBuf {
    if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or(path)
            .to_path_buf()
    }
}

fn git_bash_directory_argument(directory: &str) -> String {
    format!("--cd={directory}")
}

#[cfg(target_os = "windows")]
fn git_for_windows_registry_candidates() -> Vec<PathBuf> {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

    let mut candidates = Vec::new();
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let root = RegKey::predef(root);
        for key_path in [
            r"SOFTWARE\GitForWindows",
            r"SOFTWARE\WOW6432Node\GitForWindows",
        ] {
            let Ok(key) = root.open_subkey(key_path) else {
                continue;
            };
            let Ok(install_path) = key.get_value::<String, _>("InstallPath") else {
                continue;
            };
            candidates.push(PathBuf::from(install_path).join("git-bash.exe"));
        }
    }
    candidates
}

#[cfg(not(target_os = "windows"))]
fn git_for_windows_registry_candidates() -> Vec<PathBuf> {
    Vec::new()
}

fn find_git_bash_executable() -> Option<PathBuf> {
    let mut candidates = git_for_windows_registry_candidates();
    for variable in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(variable) {
            candidates.push(PathBuf::from(root).join("Git").join("git-bash.exe"));
        }
    }
    candidates.push(PathBuf::from(r"C:\Program Files\Git\git-bash.exe"));
    candidates.push(PathBuf::from(r"C:\Program Files (x86)\Git\git-bash.exe"));
    if let Some(path) = which("git-bash.exe") {
        candidates.push(path);
    }

    let mut command = std::process::Command::new("git");
    command.arg("--exec-path");
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    if let Ok(output) = command.output()
        && output.status.success()
    {
        let exec_path = PathBuf::from(String::from_utf8_lossy(&output.stdout).trim());
        candidates.extend(
            exec_path
                .ancestors()
                .map(|ancestor| ancestor.join("git-bash.exe")),
        );
    }

    candidates.into_iter().find(|candidate| candidate.is_file())
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

fn executable_from_command_value(value: &str) -> Option<std::path::PathBuf> {
    let value = value.trim();
    if let Some(quoted) = value.strip_prefix('"') {
        let end = quoted.find('"')?;
        return Some(std::path::PathBuf::from(&quoted[..end]));
    }
    let lower = value.to_ascii_lowercase();
    let end = lower.find(".exe")? + 4;
    Some(std::path::PathBuf::from(value[..end].trim()))
}

#[cfg(target_os = "windows")]
fn vscode_registry_candidates() -> Vec<std::path::PathBuf> {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

    let mut candidates = Vec::new();
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let root = RegKey::predef(root);
        for key_path in [
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Code.exe",
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Code - Insiders.exe",
            r"SOFTWARE\Classes\Applications\Code.exe\shell\open\command",
            r"SOFTWARE\Classes\Applications\Code - Insiders.exe\shell\open\command",
        ] {
            let Ok(key) = root.open_subkey(key_path) else {
                continue;
            };
            let Ok(value) = key.get_value::<String, _>("") else {
                continue;
            };
            if let Some(path) = executable_from_command_value(&value) {
                candidates.push(path);
            }
        }
    }
    candidates
}

#[cfg(not(target_os = "windows"))]
fn vscode_registry_candidates() -> Vec<std::path::PathBuf> {
    Vec::new()
}

fn find_vscode_executable() -> Option<std::path::PathBuf> {
    let mut candidates = Vec::new();
    let add_install_root = |candidates: &mut Vec<std::path::PathBuf>, variable: &str| {
        let Ok(root) = std::env::var(variable) else {
            return;
        };
        let root = std::path::PathBuf::from(root);
        candidates.push(root.join("Microsoft VS Code").join("Code.exe"));
        candidates.push(
            root.join("Microsoft VS Code Insiders")
                .join("Code - Insiders.exe"),
        );
    };

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let programs = std::path::PathBuf::from(local_app_data).join("Programs");
        candidates.push(programs.join("Microsoft VS Code").join("Code.exe"));
        candidates.push(
            programs
                .join("Microsoft VS Code Insiders")
                .join("Code - Insiders.exe"),
        );
    }
    add_install_root(&mut candidates, "ProgramFiles");
    add_install_root(&mut candidates, "ProgramW6432");
    add_install_root(&mut candidates, "ProgramFiles(x86)");
    candidates.extend(vscode_registry_candidates());

    for launcher_name in [
        "Code.exe",
        "code-insiders.exe",
        "code.cmd",
        "code-insiders.cmd",
    ] {
        let Some(launcher) = which(launcher_name) else {
            continue;
        };
        if launcher
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
        {
            candidates.push(launcher.clone());
        }
        if let Some(bin_dir) = launcher.parent()
            && let Some(install_dir) = bin_dir.parent()
        {
            candidates.push(install_dir.join("Code.exe"));
            candidates.push(install_dir.join("Code - Insiders.exe"));
        }
    }

    candidates.into_iter().find(|candidate| candidate.is_file())
}

#[cfg(test)]
mod program_discovery_tests {
    use super::*;

    #[test]
    fn extracts_quoted_executable_from_registry_command() {
        let parsed =
            executable_from_command_value(r#""C:\Program Files\Microsoft VS Code\Code.exe" "%1""#);
        assert_eq!(
            parsed,
            Some(std::path::PathBuf::from(
                r"C:\Program Files\Microsoft VS Code\Code.exe"
            ))
        );
    }

    #[test]
    fn extracts_unquoted_executable_without_arguments() {
        let parsed = executable_from_command_value(r"C:\Tools\Code.exe --reuse-window");
        assert_eq!(parsed, Some(std::path::PathBuf::from(r"C:\Tools\Code.exe")));
    }

    #[test]
    fn terminal_actions_on_a_file_use_its_containing_directory() {
        let path = std::path::Path::new(r"C:\Projects\demo\notes.txt");
        assert_eq!(
            terminal_working_directory(path),
            std::path::PathBuf::from(r"C:\Projects\demo")
        );
    }

    #[test]
    fn git_bash_receives_cd_and_directory_as_one_argument() {
        assert_eq!(
            git_bash_directory_argument(r"C:\Projects\demo folder"),
            r"--cd=C:\Projects\demo folder"
        );
    }
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
        _ => {
            let directory = terminal_working_directory(&PathBuf::from(path));
            enumerator::open_terminal(&directory, &terminal)
        }
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
pub fn compress_with(
    sources: Vec<String>,
    dest: String,
    tool: String,
    executable: Option<String>,
    arguments: Option<Vec<String>>,
) -> Result<(), String> {
    if sources.is_empty() {
        return Err("No files were selected for compression".to_string());
    }
    let exe = resolve_compression_executable(&tool, executable.as_deref())?;
    let args = expand_compression_arguments(&tool, &sources, &dest, arguments.as_deref())?;
    run_compression_command(&tool, &exe, &args)
}

fn default_compression_arguments(tool: &str) -> Option<Vec<String>> {
    let values: &[&str] = match tool {
        "7zip" => &["a", "-y", "{dest}", "{sources}"],
        "bandizip" => &["c", "-y", "-r", "{dest}", "{sources}"],
        "winrar" => &["a", "-r", "-y", "{dest}", "{sources}"],
        _ => return None,
    };
    Some(values.iter().map(|value| (*value).to_string()).collect())
}

fn expand_compression_arguments(
    tool: &str,
    sources: &[String],
    destination: &str,
    configured: Option<&[String]>,
) -> Result<Vec<String>, String> {
    let templates = configured
        .filter(|values| !values.is_empty())
        .map(|values| values.to_vec())
        .or_else(|| default_compression_arguments(tool))
        .ok_or_else(|| format!("Unknown compression tool: {tool}"))?;
    let mut saw_destination = false;
    let mut saw_sources = false;
    let mut args = Vec::new();
    for template in templates {
        if template == "{sources}" {
            saw_sources = true;
            args.extend(sources.iter().cloned());
            continue;
        }
        if template.contains("{sources}") {
            return Err(
                "{sources} must be on its own line because it expands to multiple arguments"
                    .to_string(),
            );
        }
        if template.contains("{dest}") {
            saw_destination = true;
        }
        args.push(template.replace("{dest}", destination));
    }
    if !saw_destination {
        return Err("Compression arguments must contain {dest}".to_string());
    }
    if !saw_sources {
        return Err("Compression arguments must contain {sources} on its own line".to_string());
    }
    Ok(args)
}

fn resolve_compression_executable(tool: &str, configured: Option<&str>) -> Result<PathBuf, String> {
    if let Some(value) = configured.map(str::trim).filter(|value| !value.is_empty()) {
        let candidate = PathBuf::from(value.trim_matches('"'));
        if candidate.is_file() {
            return Ok(candidate);
        }
        return Err(format!(
            "Configured {} executable does not exist: {}",
            compression_tool_name(tool),
            candidate.display()
        ));
    }

    let mut candidates = Vec::new();
    let (names, relative_paths): (&[&str], &[&str]) = match tool {
        "7zip" => (&["7z.exe"], &[r"7-Zip\7z.exe"]),
        "bandizip" => (
            &["bz.exe", "Bandizip.exe"],
            &[r"Bandizip\bz.exe", r"Bandizip\Bandizip.exe"],
        ),
        "winrar" => (
            &["Rar.exe", "WinRAR.exe"],
            &[r"WinRAR\Rar.exe", r"WinRAR\WinRAR.exe"],
        ),
        _ => return Err(format!("Unknown compression tool: {tool}")),
    };
    for variable in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(variable) {
            for relative in relative_paths {
                candidates.push(PathBuf::from(&root).join(relative));
            }
        }
    }
    candidates.extend(windows_app_path_candidates(names));
    for name in names {
        if let Some(path) = which(name) {
            candidates.push(path);
        }
    }
    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            format!(
                "{} was not found. Configure the executable path in Settings > Files & layout.",
                compression_tool_name(tool)
            )
        })
}

fn compression_tool_name(tool: &str) -> &str {
    match tool {
        "7zip" => "7-Zip",
        "bandizip" => "Bandizip",
        "winrar" => "WinRAR",
        _ => tool,
    }
}

#[cfg(target_os = "windows")]
fn windows_app_path_candidates(names: &[&str]) -> Vec<PathBuf> {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

    let mut candidates = Vec::new();
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let root = RegKey::predef(root);
        for name in names {
            for key_path in [
                format!(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{name}"),
                format!(r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\{name}"),
            ] {
                let Ok(key) = root.open_subkey(key_path) else {
                    continue;
                };
                let Ok(value) = key.get_value::<String, _>("") else {
                    continue;
                };
                if let Some(path) = executable_from_command_value(&value) {
                    candidates.push(path);
                } else {
                    candidates.push(PathBuf::from(value.trim_matches('"')));
                }
            }
        }
    }
    candidates
}

#[cfg(not(target_os = "windows"))]
fn windows_app_path_candidates(_names: &[&str]) -> Vec<PathBuf> {
    Vec::new()
}

fn run_compression_command(tool: &str, executable: &Path, args: &[String]) -> Result<(), String> {
    let mut command = std::process::Command::new(executable);
    command.args(args);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let output = command.output().map_err(|error| {
        format!(
            "Failed to start {} ({}): {error}",
            compression_tool_name(tool),
            executable.display()
        )
    })?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };
    Err(if detail.is_empty() {
        format!(
            "{} exited with status {} (executable: {})",
            compression_tool_name(tool),
            output.status,
            executable.display()
        )
    } else {
        format!(
            "{} exited with status {}: {}",
            compression_tool_name(tool),
            output.status,
            detail
        )
    })
}

#[cfg(test)]
mod compression_tests {
    use super::*;

    #[test]
    fn bandizip_defaults_expand_to_one_argument_per_source() {
        let sources = vec![
            r"C:\Input folder\one.txt".to_string(),
            r"C:\Input folder\two.txt".to_string(),
        ];
        let args = expand_compression_arguments(
            "bandizip",
            &sources,
            r"C:\Output folder\archive.zip",
            None,
        )
        .expect("expand Bandizip defaults");
        assert_eq!(
            args,
            vec![
                "c",
                "-y",
                "-r",
                r"C:\Output folder\archive.zip",
                r"C:\Input folder\one.txt",
                r"C:\Input folder\two.txt",
            ]
        );
    }

    #[test]
    fn custom_compression_arguments_expand_placeholders_without_shell_quoting() {
        let templates = vec![
            "a".to_string(),
            "-mx=9".to_string(),
            "-o:{dest}".to_string(),
            "{sources}".to_string(),
        ];
        let args = expand_compression_arguments(
            "7zip",
            &[r"C:\source with spaces".to_string()],
            r"D:\archive.7z",
            Some(&templates),
        )
        .expect("expand custom arguments");
        assert_eq!(
            args,
            vec!["a", "-mx=9", r"-o:D:\archive.7z", r"C:\source with spaces",]
        );
    }

    #[test]
    fn sources_placeholder_must_be_an_independent_argument() {
        let templates = vec![
            "c".to_string(),
            "{dest}".to_string(),
            "--inputs={sources}".to_string(),
        ];
        let error = expand_compression_arguments(
            "bandizip",
            &[r"C:\one.txt".to_string()],
            r"C:\out.zip",
            Some(&templates),
        )
        .expect_err("embedded sources placeholder should be rejected");
        assert!(error.contains("own line"));
    }

    #[test]
    fn installed_bandizip_can_create_an_archive_with_the_default_template() {
        let Ok(executable) = resolve_compression_executable("bandizip", None) else {
            return;
        };
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock after Unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "rhfiles-bandizip-smoke-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&directory).expect("create Bandizip test directory");
        let source = directory.join("source file.txt");
        let destination = directory.join("result.zip");
        std::fs::write(&source, "RHFiles Bandizip probe").expect("write Bandizip source");
        let args = expand_compression_arguments(
            "bandizip",
            &[source.to_string_lossy().into_owned()],
            &destination.to_string_lossy(),
            None,
        )
        .expect("expand Bandizip command");
        let result = run_compression_command("bandizip", &executable, &args);
        assert!(result.is_ok(), "Bandizip command failed: {result:?}");
        assert!(destination.is_file(), "Bandizip did not create the archive");
        let _ = std::fs::remove_dir_all(directory);
    }
}

fn validate_share_paths(paths: &[String]) -> Result<Vec<(PathBuf, bool)>, String> {
    if paths.is_empty() {
        return Err("No files or folders were selected for sharing".to_string());
    }
    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::with_capacity(paths.len());
    for value in paths {
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        let path = PathBuf::from(value);
        let key = value.replace('/', "\\").to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        let metadata = std::fs::metadata(&path)
            .map_err(|error| format!("Cannot share {}: {error}", path.display()))?;
        items.push((path, metadata.is_dir()));
    }
    if items.is_empty() {
        return Err("No valid files or folders were selected for sharing".to_string());
    }
    Ok(items)
}

#[cfg(target_os = "windows")]
fn show_windows_share_ui(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<(), String> {
    use std::sync::mpsc;
    use std::time::Duration;
    use windows::ApplicationModel::DataTransfer::{DataRequestedEventArgs, DataTransferManager};
    use windows::Foundation::TypedEventHandler;
    use windows::Storage::{IStorageItem, StorageFile, StorageFolder};
    use windows::Win32::System::WinRT::{
        RO_INIT_SINGLETHREADED, RoGetActivationFactory, RoInitialize,
    };
    use windows::Win32::UI::Shell::IDataTransferManagerInterop;
    use windows::core::{HSTRING, Interface};
    use windows_collections::IIterable;

    let items = validate_share_paths(&paths)?;
    let tauri_hwnd = window
        .hwnd()
        .map_err(|error| format!("Could not obtain the RHFiles window handle: {error}"))?;
    // Tauri currently exposes HWND through windows 0.61 while RHFiles uses
    // windows 0.62 directly. Re-wrap the same native pointer at the boundary.
    let hwnd = windows::Win32::Foundation::HWND(tauri_hwnd.0);
    // The command can run on a thread whose apartment was already initialized.
    // Either successful initialization or an existing apartment is sufficient.
    let _ = unsafe { RoInitialize(RO_INIT_SINGLETHREADED) };
    let class = HSTRING::from("Windows.ApplicationModel.DataTransfer.DataTransferManager");
    let interop: IDataTransferManagerInterop = unsafe { RoGetActivationFactory(&class) }
        .map_err(|error| format!("Windows sharing is unavailable: {error}"))?;
    let manager: DataTransferManager = unsafe { interop.GetForWindow(hwnd) }
        .map_err(|error| format!("Windows sharing is unavailable for this window: {error}"))?;

    let (setup_tx, setup_rx) = mpsc::channel::<Result<(), String>>();
    let (complete_tx, complete_rx) = mpsc::channel::<bool>();
    let title = if items.len() == 1 {
        items[0]
            .0
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "RHFiles".to_string())
    } else {
        format!("{} items from RHFiles", items.len())
    };

    let handler: TypedEventHandler<DataTransferManager, DataRequestedEventArgs> =
        TypedEventHandler::new(
            move |_, args: windows::core::Ref<'_, DataRequestedEventArgs>| {
                let result = (|| -> windows::core::Result<()> {
                    let Some(args) = args.as_ref() else {
                        return Ok(());
                    };
                    let data = args.Request()?.Data()?;
                    let properties = data.Properties()?;
                    let title = HSTRING::from(&title);
                    properties.SetTitle(&title)?;
                    properties.SetDescription(&HSTRING::from("Shared from RHFiles"))?;

                    let mut storage_items = Vec::with_capacity(items.len());
                    for (path, is_directory) in &items {
                        let path = HSTRING::from(path.to_string_lossy().as_ref());
                        let item = if *is_directory {
                            StorageFolder::GetFolderFromPathAsync(&path)?
                                .join()?
                                .cast::<IStorageItem>()?
                        } else {
                            StorageFile::GetFileFromPathAsync(&path)?
                                .join()?
                                .cast::<IStorageItem>()?
                        };
                        storage_items.push(Some(item));
                    }
                    let storage_items: IIterable<IStorageItem> = storage_items.into();
                    data.SetStorageItemsReadOnly(&storage_items)?;

                    let completed = complete_tx.clone();
                    data.ShareCompleted(&TypedEventHandler::new(move |_, _| {
                        let _ = completed.send(true);
                        Ok(())
                    }))?;
                    let cancelled = complete_tx.clone();
                    data.ShareCanceled(&TypedEventHandler::new(move |_, _| {
                        let _ = cancelled.send(false);
                        Ok(())
                    }))?;
                    Ok(())
                })();
                let _ = setup_tx.send(result.map_err(|error| error.to_string()));
                Ok(())
            },
        );
    let token = manager
        .DataRequested(&handler)
        .map_err(|error| format!("Could not prepare the Windows share data: {error}"))?;
    if let Err(error) = unsafe { interop.ShowShareUIForWindow(hwnd) } {
        let _ = manager.RemoveDataRequested(token);
        return Err(format!("Could not open the Windows share panel: {error}"));
    }

    let setup = setup_rx
        .recv_timeout(Duration::from_secs(15))
        .map_err(|error| format!("Windows did not request the share data: {error}"))?;
    if let Err(error) = setup {
        let _ = manager.RemoveDataRequested(token);
        return Err(format!(
            "Could not prepare the selected items for sharing: {error}"
        ));
    }
    // Keep DataTransferManager and its event handler alive while the system UI
    // owns the operation. Closing the share sheet is a normal, successful exit.
    let _ = complete_rx.recv_timeout(Duration::from_secs(300));
    let _ = manager.RemoveDataRequested(token);
    Ok(())
}

#[tauri::command]
pub async fn share_files(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(move || show_windows_share_ui(window, paths))
            .await
            .map_err(|error| format!("Windows sharing task failed: {error}"))?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        let _ = paths;
        Err("The Windows share panel is only available on Windows".to_string())
    }
}

#[cfg(test)]
mod share_tests {
    use super::*;

    #[test]
    fn share_path_validation_keeps_files_and_folders_and_removes_duplicates() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock after Unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "rhfiles-share-validation-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&directory).expect("create share test directory");
        let file = directory.join("share.txt");
        std::fs::write(&file, "share").expect("write share test file");
        let values = vec![
            file.to_string_lossy().into_owned(),
            directory.to_string_lossy().into_owned(),
            file.to_string_lossy().into_owned(),
        ];
        let items = validate_share_paths(&values).expect("validate share paths");
        assert_eq!(items.len(), 2);
        assert!(!items[0].1);
        assert!(items[1].1);
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn share_path_validation_reports_missing_items() {
        let path = std::env::temp_dir().join("rhfiles-share-item-that-does-not-exist");
        let error = validate_share_paths(&[path.to_string_lossy().into_owned()])
            .expect_err("missing share path should fail");
        assert!(error.contains("Cannot share"));
    }
}
