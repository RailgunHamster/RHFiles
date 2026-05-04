use crate::types::*;

use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub fn find_es_exe() -> Option<String> {
    let candidates = [
        r"C:\Program Files\Everything\es.exe",
        r"C:\Program Files (x86)\Everything\es.exe",
    ];
    for c in &candidates {
        if Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("where")
        .arg("es.exe")
        .creation_flags(0x08000000)
        .output()
        .ok();
    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("which")
        .arg("es.exe")
        .output()
        .ok();
    output.and_then(|o| {
        if o.status.success() {
            String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
        } else {
            None
        }
    })
}

#[tauri::command]
pub fn is_everything_available() -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::FindWindowW;
        let class_name: Vec<u16> = "EVERYTHING_TASKBAR_NOTIFICATION\0".encode_utf16().collect();
        let hwnd = unsafe { FindWindowW(windows::core::PCWSTR(class_name.as_ptr()), None) };
        if hwnd.is_ok() { return true; }
        find_es_exe().is_some()
    }
    #[cfg(not(target_os = "windows"))]
    {
        find_es_exe().is_some()
    }
}

#[derive(Default)]
pub struct SearchFilters {
    pub query_text: String,
    pub ext_filter: Option<Vec<String>>,
    pub type_filter: Option<String>,
    pub size_min: Option<u64>,
    pub size_max: Option<u64>,
    pub files_only: bool,
    pub folders_only: bool,
    pub use_regex: bool,
    pub use_wildcards: bool,
}

pub fn parse_size_value(s: &str) -> Option<u64> {
    let s = s.trim();
    if s == "empty" { return Some(0); }
    let lower = s.to_lowercase();
    let (num_part, multiplier) = if lower.ends_with("gb") {
        (&lower[..lower.len()-2], 1073741824u64)
    } else if lower.ends_with("mb") {
        (&lower[..lower.len()-2], 1048576u64)
    } else if lower.ends_with("kb") {
        (&lower[..lower.len()-2], 1024u64)
    } else {
        (lower.as_str(), 1u64)
    };
    num_part.trim().parse::<f64>().ok().map(|v| (v * multiplier as f64) as u64)
}

pub fn parse_search_query(raw: &str) -> SearchFilters {
    let mut f = SearchFilters::default();
    let mut text_parts: Vec<String> = Vec::new();
    let tokens = raw.split_whitespace().collect::<Vec<_>>();
    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i];
        let lower = token.to_lowercase();
        if lower.starts_with("regex:") {
            f.use_regex = true;
            let rest = &token[6..];
            if !rest.is_empty() { text_parts.push(rest.to_string()); }
        } else if lower.starts_with("wildcards:") {
            f.use_wildcards = true;
            let rest = &token[10..];
            if !rest.is_empty() { text_parts.push(rest.to_string()); }
        } else if lower.starts_with("ext:") {
            let exts: Vec<String> = token[4..].split(';').map(|e| e.trim().to_lowercase()).filter(|e| !e.is_empty()).collect();
            if !exts.is_empty() { f.ext_filter = Some(exts); }
        } else if lower.starts_with("size:") {
            let val = &token[5..];
            if let Some(range) = val.find("..") {
                f.size_min = parse_size_value(&val[..range]);
                f.size_max = parse_size_value(&val[range+2..]);
            } else if val.starts_with('>') {
                f.size_min = parse_size_value(&val[1..]).map(|v| v + 1);
            } else if val.starts_with('<') {
                f.size_max = parse_size_value(&val[1..]).map(|v| if v > 0 { v - 1 } else { 0 });
            } else if val.starts_with(">=") {
                f.size_min = parse_size_value(&val[2..]);
            } else if val.starts_with("<=") {
                f.size_max = parse_size_value(&val[2..]);
            } else {
                let exact = parse_size_value(val);
                if let Some(s) = exact {
                    f.size_min = Some(s);
                    f.size_max = Some(s);
                }
            }
        } else if lower == "file:" || lower == "files:" {
            f.files_only = true;
        } else if lower == "folder:" || lower == "folders:" {
            f.folders_only = true;
        } else if lower == "audio:" {
            f.ext_filter = Some(vec!["mp3".into(),"wav".into(),"flac".into(),"aac".into(),"ogg".into(),"wma".into(),"m4a".into(),"opus".into()]);
        } else if lower == "video:" {
            f.ext_filter = Some(vec!["mp4".into(),"avi".into(),"mkv".into(),"mov".into(),"wmv".into(),"flv".into(),"webm".into(),"m4v".into()]);
        } else if lower == "pic:" {
            f.ext_filter = Some(vec!["jpg".into(),"jpeg".into(),"png".into(),"gif".into(),"bmp".into(),"svg".into(),"webp".into(),"ico".into(),"tiff".into(),"tif".into()]);
        } else if lower == "doc:" {
            f.ext_filter = Some(vec!["pdf".into(),"doc".into(),"docx".into(),"xls".into(),"xlsx".into(),"ppt".into(),"pptx".into(),"txt".into(),"rtf".into(),"odt".into()]);
        } else if lower == "exe:" {
            f.ext_filter = Some(vec!["exe".into(),"msi".into(),"bat".into(),"cmd".into(),"ps1".into()]);
        } else if lower == "zip:" {
            f.ext_filter = Some(vec!["zip".into(),"rar".into(),"7z".into(),"tar".into(),"gz".into(),"bz2".into()]);
        } else if lower.starts_with("type:") {
            f.type_filter = Some(token[5..].to_lowercase());
        } else {
            text_parts.push(token.to_string());
        }
        i += 1;
    }
    f.query_text = text_parts.join(" ");
    if f.ext_filter.is_none() {
        if let Some(ref tf) = f.type_filter {
            match tf.as_str() {
                "audio" => f.ext_filter = Some(vec!["mp3".into(),"wav".into(),"flac".into(),"aac".into(),"ogg".into(),"m4a".into()]),
                "video" => f.ext_filter = Some(vec!["mp4".into(),"avi".into(),"mkv".into(),"mov".into(),"wmv".into(),"webm".into()]),
                "image" | "picture" | "pic" => f.ext_filter = Some(vec!["jpg".into(),"jpeg".into(),"png".into(),"gif".into(),"bmp".into(),"svg".into(),"webp".into()]),
                "document" | "doc" => f.ext_filter = Some(vec!["pdf".into(),"doc".into(),"docx".into(),"txt".into(),"rtf".into()]),
                "archive" | "zip" => f.ext_filter = Some(vec!["zip".into(),"rar".into(),"7z".into(),"tar".into(),"gz".into()]),
                _ => {}
            }
        }
    }
    f
}

pub fn matches_builtin_filter(name: &str, extension: &str, is_dir: bool, size: u64, filters: &SearchFilters) -> bool {
    if filters.files_only && is_dir { return false; }
    if filters.folders_only && !is_dir { return false; }
    if !is_dir {
        if let Some(ref exts) = filters.ext_filter {
            let ext_lower = extension.to_lowercase();
            if !exts.iter().any(|e| e == &ext_lower) { return false; }
        }
    }
    if let Some(min) = filters.size_min {
        if size < min { return false; }
    }
    if let Some(max) = filters.size_max {
        if size > max { return false; }
    }
    if !filters.query_text.is_empty() {
        let name_lower = name.to_lowercase();
        let query_lower = filters.query_text.to_lowercase();
        if filters.use_regex {
            if let Ok(re) = regex::Regex::new(&filters.query_text) {
                if !re.is_match(name) { return false; }
            } else { return false; }
        } else if filters.use_wildcards {
            let pattern = query_lower.replace('*', ".*").replace('?', ".");
            if let Ok(re) = regex::Regex::new(&format!("^{}$", pattern)) {
                if !re.is_match(&name_lower) { return false; }
            } else { return false; }
        } else {
            let words: Vec<&str> = query_lower.split('|').collect();
            let has_or = query_lower.contains('|');
            if has_or {
                if !words.iter().any(|w| name_lower.contains(w.trim())) { return false; }
            } else {
                for word in query_lower.split_whitespace() {
                    if word.starts_with('!') || word.starts_with('-') {
                        if name_lower.contains(&word[1..]) { return false; }
                    } else if !name_lower.contains(word) { return false; }
                }
            }
        }
    }
    true
}

pub fn builtin_search(filters: &SearchFilters, max_results: usize) -> Vec<FileInfo> {
    let mut results = Vec::new();
    for drive in ['C', 'D', 'E', 'F', 'G', 'H'] {
        let root = format!("{}:\\", drive);
        if !Path::new(&root).exists() { continue; }
        builtin_search_dir(&PathBuf::from(&root), filters, &mut results, max_results);
        if results.len() >= max_results { break; }
    }
    results
}

pub fn builtin_search_dir(dir: &Path, filters: &SearchFilters, results: &mut Vec<FileInfo>, max: usize) {
    if results.len() >= max { return; }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        if results.len() >= max { return; }
        let name = entry.file_name().to_string_lossy().into_owned();
        if let Ok(metadata) = entry.metadata() {
            let is_dir = metadata.is_dir();
            let size = metadata.len();
            let extension = if is_dir { String::new() }
                else { Path::new(&name).extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default() };
            if matches_builtin_filter(&name, &extension, is_dir, size, filters) {
                results.push(FileInfo {
                    name, path: entry.path().to_string_lossy().into_owned(), extension,
                    is_dir, is_hidden: false, size,
                    size_display: format_size(size),
                    modified: metadata.modified().ok().map(|t| format_time(t)).unwrap_or_default(),
                    created: String::new(),
                    modified_ts: metadata.modified().ok().and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0),
                    created_ts: 0,
                    folder_size: None,
                });
            }
            if is_dir { builtin_search_dir(&entry.path(), filters, results, max); }
        }
    }
}

#[tauri::command]
pub fn quick_search(query: String, max_results: usize, engine: String) -> Result<Vec<FileInfo>, String> {
    let use_everything = engine == "everything" || (engine == "auto" && is_everything_available());

    if use_everything {
        if let Some(es) = find_es_exe() {
            let output = std::process::Command::new(&es)
                .args(["-n", &max_results.to_string(), &query])
                .creation_flags(0x08000000)
                .output()
                .map_err(|e| e.to_string())?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut results = Vec::new();
                for line in stdout.lines() {
                    let line = line.trim();
                    if line.is_empty() { continue; }
                    let path = PathBuf::from(line);
                    if let Some(name) = path.file_name().map(|n| n.to_string_lossy().into_owned()) {
                        let metadata = std::fs::metadata(&path).ok();
                        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                        let extension = if is_dir { String::new() }
                            else { path.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default() };
                        results.push(FileInfo {
                            name, path: line.to_string(), extension,
                            is_dir, is_hidden: false, size,
                            size_display: format_size(size),
                            modified: metadata.as_ref().and_then(|m| m.modified().ok()).map(|t| format_time(t)).unwrap_or_default(),
                            created: String::new(),
                            modified_ts: metadata.as_ref().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0),
                            created_ts: 0,
                            folder_size: None,
                        });
                    }
                    if results.len() >= max_results { break; }
                }
                return Ok(results);
            }
        }
        if engine == "everything" {
            return Err("Everything is not installed. Download from voidtools.com".to_string());
        }
    }

    let filters = parse_search_query(&query);
    Ok(builtin_search(&filters, max_results))
}

#[tauri::command]
pub fn search_recursive(path: String, query: String, max_results: usize) -> Result<Vec<FileInfo>, String> {
    let filters = parse_search_query(&query);
    let mut results = Vec::new();
    builtin_search_dir(&PathBuf::from(&path), &filters, &mut results, max_results);
    Ok(results)
}
