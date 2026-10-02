//! Built-in HTTP server: the phone as a file source for a PC or tablet.
//!
//! This replaces the ads-and-uploads "Wi-Fi transfer" of mainstream Android file
//! managers with a plain local endpoint: browse, stream (with Range support, so
//! video seeking works), upload with `PUT`, and trigger an index rebuild.
//! `std::net` only — no HTTP framework in the mobile binary.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;

const DEFAULT_PORT: u16 = 8765;
const READ_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReverseServerStatus {
    pub enabled: bool,
    pub running: bool,
    pub port: u16,
    pub urls: Vec<String>,
    pub root: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartServerRequest {
    pub port: Option<u16>,
    pub root: Option<String>,
}

/// Live state of the embedded file server.
///
/// Not `Debug`: it holds a boxed reindex callback.
pub struct ServerState {
    running: AtomicBool,
    port: AtomicU16,
    root: RwLock<String>,
    error: RwLock<Option<String>>,
    stop: AtomicBool,
    /// Lets the embedded server trigger an index rebuild (`POST /__index`)
    /// without going through the command layer. A boxed callback instead of an
    /// `AppHandle` so the HTTP thread — and `ServerState` itself — stay free of
    /// a runtime type parameter.
    reindex: RwLock<Option<Box<dyn Fn() + Send + Sync>>>,
}

pub type SharedServer = Arc<ServerState>;

/// Local IPv4 addresses that a device on the same Wi-Fi can reach.
pub fn lan_addresses() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(text) = std::fs::read_to_string("/proc/net/fib_trie") {
        for line in text.lines() {
            let trimmed = line.trim();
            let Some(candidate) = trimmed.strip_prefix("|-- ") else {
                continue;
            };
            let candidate = candidate.trim();
            if candidate.starts_with("127.") || candidate.contains('/') || candidate.is_empty() {
                continue;
            }
            let parts: Vec<&str> = candidate.split('.').collect();
            if parts.len() != 4 || parts.iter().any(|part| part.parse::<u8>().is_err()) {
                continue;
            }
            // Link-local and loopback are useless to a peer device.
            if candidate.starts_with("169.254.") || candidate.starts_with("0.") {
                continue;
            }
            if !out.contains(&candidate.to_string()) {
                out.push(candidate.to_string());
            }
        }
    }
    out
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(byte) => {
                        out.push(byte);
                        index += 3;
                    }
                    Err(_) => {
                        out.push(bytes[index]);
                        index += 1;
                    }
                }
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                out.push(*byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// Resolve a request path inside `root`, refusing traversal.
fn resolve(root: &Path, request_path: &str) -> Option<PathBuf> {
    let decoded = percent_decode(request_path);
    let mut target = root.to_path_buf();
    for segment in decoded.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return None;
        }
        target.push(segment);
    }
    Some(target)
}

fn mime_for(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "txt" | "log" | "md" | "ini" | "cfg" | "toml" | "csv" => "text/plain; charset=utf-8",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "heic" | "heif" => "image/heic",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "mov" => "video/quicktime",
        "3gp" => "video/3gpp",
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "ogg" | "opus" => "audio/ogg",
        "m4a" | "aac" => "audio/mp4",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "apk" => "application/vnd.android.package-archive",
        _ => "application/octet-stream",
    }
}

fn human_size(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

struct Request {
    prefetched_body: Vec<u8>,
    method: String,
    path: String,
    range: Option<String>,
    content_length: u64,
    is_index_post: bool,
}

fn read_request(stream: &mut TcpStream) -> std::io::Result<Request> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let target = parts.next().unwrap_or("/").to_string();

    let mut range = None;
    let mut content_length = 0u64;
    let mut content_type = String::new();
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header)? == 0 {
            break;
        }
        let trimmed = header.trim_end();
        if trimmed.is_empty() {
            break;
        }
        let Some((key, value)) = trimmed.split_once(':') else {
            continue;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim().to_string();
        match key.as_str() {
            "range" => range = Some(value),
            "content-length" => content_length = value.parse().unwrap_or(0),
            "content-type" => content_type = value,
            _ => {}
        }
    }

    let (path, is_index_post) = match target.as_str() {
        "/__index" => ("/__index".to_string(), true),
        other => (other.split('?').next().unwrap_or("/").to_string(), false),
    };
    let _ = content_type;
    Ok(Request {
        prefetched_body: reader.buffer().to_vec(),
        method,
        path,
        range,
        content_length,
        is_index_post,
    })
}

fn respond(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    extra_headers: &[String],
    body: &[u8],
) -> std::io::Result<()> {
    let mut head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for header in extra_headers {
        head.push_str(header);
        head.push_str("\r\n");
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()
}

fn respond_text(stream: &mut TcpStream, status: &str, text: &str) -> std::io::Result<()> {
    respond(
        stream,
        status,
        "text/plain; charset=utf-8",
        &[],
        text.as_bytes(),
    )
}

fn file_entry_rows(dir: &Path) -> String {
    let Ok(reader) = std::fs::read_dir(dir) else {
        return "<tr><td colspan=\"3\">Cannot read this folder.</td></tr>".to_string();
    };
    let mut dirs: Vec<(String, u64, bool)> = Vec::new();
    let mut files: Vec<(String, u64, bool)> = Vec::new();
    for item in reader.flatten() {
        let name = item.file_name().to_string_lossy().to_string();
        let Ok(meta) = item.metadata() else { continue };
        if meta.is_dir() {
            dirs.push((name, 0, true));
        } else {
            files.push((name, meta.len(), false));
        }
    }
    dirs.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    files.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));

    let mut rows = String::new();
    for (name, _, is_dir) in dirs.into_iter().chain(files.into_iter()) {
        let href = format!("./{}{}", percent_encode(&name), if is_dir { "/" } else { "" });
        let label = html_escape(&name);
        if is_dir {
            rows.push_str(&format!(
                "<tr><td class=\"i\">&#128193;</td><td><a href=\"{href}\">{label}/</a></td><td class=\"s\"></td></tr>"
            ));
        } else {
            let size = human_size(_size_of(&dir.join(&name)));
            rows.push_str(&format!(
                "<tr><td class=\"i\">&#128196;</td><td><a href=\"{href}\">{label}</a></td><td class=\"s\">{size}</td></tr>"
            ));
        }
    }
    if rows.is_empty() {
        rows.push_str("<tr><td colspan=\"3\">This folder is empty.</td></tr>");
    }
    rows
}

fn _size_of(path: &Path) -> u64 {
    std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0)
}

fn listing_page(dir: &Path, relative: &str, status: &ReverseServerStatus) -> String {
    let title = if relative.is_empty() {
        "RHFiles".to_string()
    } else {
        relative.to_string()
    };
    let parent = if relative.is_empty() {
        String::new()
    } else {
        let mut trimmed = relative.trim_end_matches('/').to_string();
        if let Some(index) = trimmed.rfind('/') {
            trimmed.truncate(index);
        } else {
            trimmed.clear();
        }
        format!(
            "<a class=\"up\" href=\"/{}\">&#8593; Up</a>",
            percent_encode(&trimmed)
        )
    };
    format!(
        r#"<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · RHFiles</title>
<style>
:root {{ color-scheme: dark; }}
body {{ margin:0; background:#141414; color:#e6e6e6; font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }}
header {{ position:sticky; top:0; background:#1c1c1c; border-bottom:1px solid #2e2e2e; padding:14px 16px; }}
h1 {{ margin:0; font-size:16px; font-weight:600; word-break:break-all; }}
.sub {{ color:#8f8f8f; font-size:12px; margin-top:4px; }}
a {{ color:#63b3ff; text-decoration:none; }}
a:hover {{ text-decoration:underline; }}
.up {{ display:inline-block; margin-top:8px; }}
table {{ width:100%; border-collapse:collapse; }}
td {{ padding:10px 14px; border-bottom:1px solid #232323; }}
td.i {{ width:28px; opacity:.7; }}
td.s {{ width:96px; text-align:right; color:#8f8f8f; font-variant-numeric:tabular-nums; }}
form {{ padding:16px; border-top:1px solid #2e2e2e; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }}
input[type=file] {{ color:#e6e6e6; }}
button {{ background:#2f6df6; color:#fff; border:0; border-radius:8px; padding:9px 16px; font-size:14px; cursor:pointer; }}
button.ghost {{ background:#2a2a2a; }}
</style></head>
<body>
<header>
  <h1>{title}</h1>
  <div class="sub">RHFiles · {root} · port {port}</div>
  {parent}
</header>
<table>{rows}</table>
<form method="post" action="/__upload" enctype="multipart/form-data">
  <input type="file" name="file" multiple>
  <button type="submit">Upload</button>
  <button class="ghost" type="button" onclick="fetch('/__index',{{method:'POST'}}).then(()=>alert('Reindex started'))">Rebuild index</button>
</form>
<script>
document.querySelector('form').addEventListener('submit', async (event) => {{
  event.preventDefault();
  const input = document.querySelector('input[type=file]');
  if (!input.files.length) return;
  for (const file of input.files) {{
    const response = await fetch('{upload_base}' + encodeURIComponent(file.name), {{ method:'PUT', body:file }});
    if (!response.ok) {{ alert(await response.text()); return; }}
  }}
  location.reload();
}});
</script>
</body></html>"#,
        title = html_escape(&title),
        root = html_escape(&status.root),
        port = status.port,
        parent = parent,
        rows = file_entry_rows(dir),
        upload_base = upload_base(relative),
    )
}

fn upload_base(relative: &str) -> String {
    let segments = relative.split('/').filter(|s| !s.is_empty()).map(percent_encode).collect::<Vec<_>>();
    if segments.is_empty() { "/".into() } else { format!("/{}/", segments.join("/")) }
}

fn handle_get(stream: &mut TcpStream, path: &Path, relative: &str, range: Option<String>, status: &ReverseServerStatus) -> std::io::Result<()> {
    if path.is_dir() {
        let body = listing_page(path, relative, status);
        return respond(stream, "200 OK", "text/html; charset=utf-8", &[], body.as_bytes());
    }
    if !path.is_file() {
        return respond_text(stream, "404 Not Found", "not found");
    }
    let meta = std::fs::metadata(path)?;
    let total = meta.len();
    let mime = mime_for(path);

    if let Some(range_header) = range {
        if let Some(spec) = range_header.strip_prefix("bytes=") {
            let mut parts = spec.splitn(2, '-');
            let start = parts.next().unwrap_or("0").trim().parse::<u64>().unwrap_or(0);
            let end = parts
                .next()
                .and_then(|value| value.trim().parse::<u64>().ok())
                .unwrap_or(total.saturating_sub(1))
                .min(total.saturating_sub(1));
            if start <= end {
                let length = end - start + 1;
                let mut file = std::fs::File::open(path)?;
                file.seek(SeekFrom::Start(start))?;
                let head = format!(
                    "HTTP/1.1 206 Partial Content\r\nContent-Type: {mime}\r\nContent-Length: {length}\r\nContent-Range: bytes {start}-{end}/{total}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n"
                );
                stream.write_all(head.as_bytes())?;
                let mut remaining = length;
                let mut buffer = vec![0u8; 256 * 1024];
                while remaining > 0 {
                    let take = buffer.len().min(remaining as usize);
                    let read = file.read(&mut buffer[..take])?;
                    if read == 0 {
                        break;
                    }
                    stream.write_all(&buffer[..read])?;
                    remaining -= read as u64;
                }
                stream.flush()?;
                return Ok(());
            }
        }
    }

    let mut file = std::fs::File::open(path)?;
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {total}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(head.as_bytes())?;
    std::io::copy(&mut file, stream)?;
    stream.flush()
}

fn handle_put(stream: &mut TcpStream, path: &Path, request: &Request) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // A failed upload must not truncate an existing user file or leave a partial one.
    let mut file = std::fs::OpenOptions::new().create_new(true).write(true).open(path)?;
    let result = (|| -> std::io::Result<()> {
        let buffered = request.prefetched_body.len().min(request.content_length as usize);
        file.write_all(&request.prefetched_body[..buffered])?;
        let mut remaining = request.content_length - buffered as u64;
        let mut buffer = vec![0u8; 256 * 1024];
        while remaining > 0 {
            let take = buffer.len().min(remaining as usize);
            stream.read_exact(&mut buffer[..take])?;
            file.write_all(&buffer[..take])?;
            remaining -= take as u64;
        }
        file.sync_all()
    })();
    drop(file);
    if let Err(error) = result {
        let _ = std::fs::remove_file(path);
        return Err(error);
    }
    respond_text(stream, "200 OK", "stored")
}

fn handle_connection(mut stream: TcpStream, state: SharedServer) {
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let _ = stream.set_write_timeout(Some(READ_TIMEOUT));
    let root = PathBuf::from(state.root.read().map(|v| v.clone()).unwrap_or_default());
    let status = status_of(&state);

    let Ok(request) = read_request(&mut stream) else {
        return;
    };

    if request.is_index_post {
        state.trigger_reindex();
        let _ = respond_text(&mut stream, "200 OK", "reindex started");
        return;
    }

    if request.method == "PUT" {
        let Some(target) = resolve(&root, &request.path) else {
            let _ = respond_text(&mut stream, "400 Bad Request", "bad path");
            return;
        };
        if let Err(error) = handle_put(&mut stream, &target, &request) {
            let status = if error.kind() == std::io::ErrorKind::AlreadyExists { "409 Conflict" } else { "400 Bad Request" };
            let _ = respond_text(&mut stream, status, &error.to_string());
        }
        return;
    }

    if request.method != "GET" && request.method != "HEAD" {
        let _ = respond_text(&mut stream, "405 Method Not Allowed", "unsupported");
        return;
    }

    let Some(target) = resolve(&root, &request.path) else {
        let _ = respond_text(&mut stream, "400 Bad Request", "bad path");
        return;
    };
    let relative = request.path.trim_matches('/').to_string();
    let _ = handle_get(&mut stream, &target, &relative, request.range, &status);
}

impl ServerState {
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    pub fn set_reindex_callback(&self, callback: Box<dyn Fn() + Send + Sync>) {
        if let Ok(mut guard) = self.reindex.write() {
            *guard = Some(callback);
        }
    }

    fn trigger_reindex(&self) {
        if let Ok(guard) = self.reindex.read() {
            if let Some(callback) = guard.as_ref() {
                callback();
            }
        }
    }
}

impl Default for ServerState {
    fn default() -> Self {
        Self {
            running: AtomicBool::new(false),
            port: AtomicU16::new(0),
            root: RwLock::new(crate::device::SHARED_STORAGE.to_string()),
            error: RwLock::new(None),
            stop: AtomicBool::new(false),
            reindex: RwLock::new(None),
        }
    }
}

pub fn status_of(state: &ServerState) -> ReverseServerStatus {
    let port = state.port.load(Ordering::Relaxed);
    let running = state.running.load(Ordering::Relaxed);
    let urls = if running && port > 0 {
        lan_addresses()
            .into_iter()
            .map(|address| format!("http://{address}:{port}/"))
            .collect()
    } else {
        Vec::new()
    };
    ReverseServerStatus {
        enabled: running,
        running,
        port,
        urls,
        root: state.root.read().map(|v| v.clone()).unwrap_or_default(),
        error: state
            .error
            .read()
            .map(|value| value.clone())
            .unwrap_or(None),
    }
}

#[tauri::command]
pub fn get_reverse_server_status(state: tauri::State<'_, crate::AppState>) -> ReverseServerStatus {
    status_of(&state.server)
}

#[tauri::command]
pub fn start_reverse_server<R: tauri::Runtime>(
    state: tauri::State<'_, crate::AppState>,
    app: tauri::AppHandle<R>,
    options: Option<StartServerRequest>,
) -> Result<ReverseServerStatus, String> {
    let server = Arc::clone(&state.server);
    if server.is_running() {
        return Ok(status_of(&server));
    }
    let options = options.unwrap_or(StartServerRequest {
        port: None,
        root: None,
    });
    let mut port = options.port.unwrap_or(DEFAULT_PORT);
    let root = PathBuf::from(
        options
            .root
            .unwrap_or_else(|| crate::device::SHARED_STORAGE.to_string()),
    );
    if !root.is_dir() {
        return Err(format!("root is not a directory: {}", root.display()));
    }

    // Try the requested port, then the next few, so a second instance or a busy
    // port does not turn into a dead button.
    let mut listener = None;
    let mut last_error = String::new();
    for candidate in port..port.saturating_add(10) {
        match TcpListener::bind(("0.0.0.0", candidate)) {
            Ok(bound) => {
                listener = Some(bound);
                port = candidate;
                break;
            }
            Err(error) => last_error = error.to_string(),
        }
    }
    let Some(listener) = listener else {
        *server.error.write().unwrap_or_else(|e| e.into_inner()) = Some(last_error.clone());
        crate::log::error("server", format!("could not bind a port: {last_error}"));
        return Err(format!("could not bind a port: {last_error}"));
    };

    *server.root.write().unwrap_or_else(|e| e.into_inner()) = root.to_string_lossy().to_string();
    *server.error.write().unwrap_or_else(|e| e.into_inner()) = None;
    server.port.store(port, Ordering::Relaxed);
    server.stop.store(false, Ordering::SeqCst);
    server.running.store(true, Ordering::SeqCst);
    crate::log::info(
        "server",
        format!("file server listening on 0.0.0.0:{port} serving {}", root.display()),
    );
    server.set_reindex_callback(Box::new(move || {
        let _ = crate::index::index_start_for_handle(app.clone());
    }));

    let thread_state = Arc::clone(&server);
    std::thread::spawn(move || {
        for incoming in listener.incoming() {
            if thread_state.stop.load(Ordering::SeqCst) {
                break;
            }
            match incoming {
                Ok(stream) => {
                    let per_connection = Arc::clone(&thread_state);
                    std::thread::spawn(move || handle_connection(stream, per_connection));
                }
                Err(_) => continue,
            }
        }
        thread_state.running.store(false, Ordering::SeqCst);
    });

    Ok(status_of(&server))
}

#[tauri::command]
pub fn stop_reverse_server(state: tauri::State<'_, crate::AppState>) -> ReverseServerStatus {
    let server = &state.server;
    if server.is_running() {
        crate::log::info("server", "file server stopped");
    }
    server.stop.store(true, Ordering::SeqCst);
    server.running.store(false, Ordering::SeqCst);
    // Nudge the accept loop so it observes `stop` without waiting for traffic.
    let port = server.port.load(Ordering::Relaxed);
    if port > 0 {
        let _ = TcpStream::connect(("127.0.0.1", port));
    }
    server.port.store(0, Ordering::Relaxed);
    status_of(server)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upload_urls_stay_on_the_phone_and_in_the_selected_folder() {
        assert_eq!(upload_base(""), "/");
        assert_eq!(upload_base("/Pictures/"), "/Pictures/");
        assert_eq!(upload_base("/a b/child"), "/a%20b/child/");
    }

    #[test]
    fn buffered_put_body_is_preserved_and_existing_file_is_not_truncated() {
        let root = std::env::temp_dir().join(format!("rhfiles-upload-test-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&root).unwrap();
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let client = std::thread::spawn(move || {
            let mut stream = TcpStream::connect(address).unwrap();
            stream.write_all(b"PUT /file.txt HTTP/1.1\r\nContent-Length: 11\r\n\r\nhello world").unwrap();
            stream.shutdown(std::net::Shutdown::Write).unwrap();
            let mut response = String::new(); stream.read_to_string(&mut response).unwrap();
            assert!(response.contains("200 OK"));
        });
        let (mut stream, _) = listener.accept().unwrap();
        let request = read_request(&mut stream).unwrap();
        let target = root.join("file.txt");
        handle_put(&mut stream, &target, &request).unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"hello world");
        assert_eq!(handle_put(&mut stream, &target, &request).unwrap_err().kind(), std::io::ErrorKind::AlreadyExists);
        assert_eq!(std::fs::read(&target).unwrap(), b"hello world");
        drop(stream); client.join().unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resolve_keeps_requests_inside_the_root() {
        let root = Path::new("/storage/emulated/0");
        assert_eq!(
            resolve(root, "/DCIM/Camera/"),
            Some(PathBuf::from("/storage/emulated/0/DCIM/Camera"))
        );
        assert_eq!(resolve(root, "/"), Some(root.to_path_buf()));
        assert_eq!(resolve(root, "//DCIM//a.jpg"), Some(PathBuf::from("/storage/emulated/0/DCIM/a.jpg")));
    }

    #[test]
    fn resolve_refuses_traversal_in_any_encoding() {
        let root = Path::new("/storage/emulated/0");
        assert_eq!(resolve(root, "/../etc/passwd"), None);
        assert_eq!(resolve(root, "/DCIM/../../etc/passwd"), None);
        // %2e%2e%2f = "../"
        assert_eq!(resolve(root, "/%2e%2e/%2e%2e/etc/passwd"), None);
        assert_eq!(resolve(root, "/DCIM/%2E%2E/%2E%2E/%2E%2E/data"), None);
    }

    #[test]
    fn percent_helpers_round_trip_non_ascii_names() {
        for name in ["照片 2024.jpg", "a b&c.txt", "emoji-😀.png", "plain.txt"] {
            let encoded = percent_encode(name);
            assert!(!encoded.contains(' '));
            assert_eq!(percent_decode(&encoded), name);
        }
    }

    #[test]
    fn mime_lookup_covers_the_formats_the_app_opens() {
        assert_eq!(mime_for(Path::new("x.jpg")), "image/jpeg");
        assert_eq!(mime_for(Path::new("x.MP4")), "video/mp4");
        assert_eq!(mime_for(Path::new("x.md")), "text/plain; charset=utf-8");
        assert_eq!(mime_for(Path::new("x.unknownext")), "application/octet-stream");
    }

    #[test]
    fn sizes_are_human_readable() {
        assert_eq!(human_size(512), "512 B");
        assert_eq!(human_size(2048), "2.0 KB");
        assert_eq!(human_size(5 * 1024 * 1024 * 1024), "5.0 GB");
    }

    #[test]
    fn html_escaping_blocks_markup_in_file_names() {
        assert_eq!(html_escape("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;");
    }

    #[test]
    fn request_line_headers_and_range_are_parsed() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind loopback");
        let port = listener.local_addr().unwrap().port();
        let client = std::thread::spawn(move || {
            let mut socket = TcpStream::connect(("127.0.0.1", port)).unwrap();
            socket
                .write_all(
                    b"GET /DCIM/video.mp4?x=1 HTTP/1.1\r\nHost: phone\r\nRange: bytes=100-199\r\n\r\n",
                )
                .unwrap();
            socket.flush().unwrap();
            // Hold the connection open until the server has answered.
            std::thread::sleep(Duration::from_millis(120));
        });

        let (mut server_side, _) = listener.accept().unwrap();
        let request = read_request(&mut server_side).unwrap();
        assert_eq!(request.method, "GET");
        assert_eq!(request.path, "/DCIM/video.mp4", "the query string is stripped");
        assert_eq!(request.range.as_deref(), Some("bytes=100-199"));
        assert!(!request.is_index_post);
        client.join().unwrap();
    }
}
