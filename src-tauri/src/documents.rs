//! Local Markdown -> PDF providers. Configuration is data, arguments are never a shell string.
use crate::types::CancelFlag;
use base64::Engine;
use pulldown_cmark::{html, Event, Options, Parser, Tag};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::mpsc,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Converter {
    id: String,
    name: String,
    kind: String,
    #[serde(default)]
    executable: String,
    #[serde(default)]
    arguments: Vec<String>,
    #[serde(default = "timeout")]
    timeout_seconds: u64,
}
fn timeout() -> u64 {
    120
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Registry {
    schema_version: u32,
    default: String,
    converters: Vec<Converter>,
}
impl Default for Registry {
    fn default() -> Self {
        Self {
            schema_version: 1,
            default: "builtin".into(),
            converters: vec![Converter {
                id: "builtin".into(),
                name: "RHFiles / Microsoft WebView2".into(),
                kind: "builtin".into(),
                executable: String::new(),
                arguments: vec![],
                timeout_seconds: 120,
            }],
        }
    }
}
fn read_registry(path: &Path) -> Result<Registry, String> {
    if !path.exists() {
        let bytes = serde_json::to_vec_pretty(&Registry::default()).map_err(|e| e.to_string())?;
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
        {
            Ok(mut file) => file.write_all(&bytes).map_err(|e| e.to_string())?,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e.to_string()),
        };
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(256 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 256 * 1024 {
        return Err("Converter configuration exceeds 256 KiB".into());
    }
    let registry: Registry = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Invalid document-converters.json: {e}"))?;
    validate_registry(&registry)?;
    Ok(registry)
}
fn validate_registry(r: &Registry) -> Result<(), String> {
    if r.schema_version != 1 || r.converters.is_empty() || r.converters.len() > 50 {
        return Err("Unsupported converter registry".into());
    }
    let mut ids = std::collections::HashSet::new();
    for c in &r.converters {
        if c.id.is_empty()
            || c.name.is_empty()
            || !ids.insert(&c.id)
            || !matches!(c.kind.as_str(), "builtin" | "command")
            || c.arguments.len() > 100
        {
            return Err("Invalid/duplicate converter definition".into());
        }
        if c.kind == "command"
            && (!Path::new(&c.executable).is_absolute()
                || !c.arguments.iter().any(|a| a.contains("{output}")))
        {
            return Err(
                "Command converters need an absolute executable and an {output} argument".into(),
            );
        }
    }
    if !ids.contains(&r.default) {
        return Err("Default converter ID does not exist".into());
    }
    Ok(())
}
fn config_path() -> Result<PathBuf, String> {
    let dir = crate::profile::data_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("document-converters.json"))
}
#[tauri::command(async)]
pub fn document_converters() -> Result<serde_json::Value, String> {
    let path = config_path()?;
    let r = read_registry(&path)?;
    Ok(serde_json::json!({"path":path,"default":r.default,"converters":r.converters}))
}

fn local_image(root: &Path, source: &str, budget: &mut u64) -> Option<String> {
    let root = root.canonicalize().ok()?;
    let url = url::Url::from_directory_path(&root)
        .ok()?
        .join(source)
        .ok()?;
    if url.scheme() != "file" || url.query().is_some() || url.fragment().is_some() {
        return None;
    }
    let path = url.to_file_path().ok()?.canonicalize().ok()?;
    if !path.starts_with(&root) {
        return None;
    }
    let mime = match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => return None,
    };
    let size = path.metadata().ok()?.len();
    if size > 8 * 1024 * 1024 || size > *budget {
        return None;
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .ok()?
        .take(size + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() as u64 != size {
        return None;
    }
    *budget -= size;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}
fn markdown_html(markdown: &str, root: &Path) -> String {
    let mut budget = 20 * 1024 * 1024;
    let parser = Parser::new_ext(
        markdown,
        Options::ENABLE_TABLES
            | Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_TASKLISTS
            | Options::ENABLE_FOOTNOTES,
    )
    .map(|event| match event {
        Event::Html(text) | Event::InlineHtml(text) => Event::Text(text),
        Event::Start(Tag::Image {
            link_type,
            dest_url,
            title,
            id,
        }) => Event::Start(Tag::Image {
            link_type,
            dest_url: local_image(root, &dest_url, &mut budget)
                .unwrap_or_default()
                .into(),
            title,
            id,
        }),
        Event::Start(Tag::Link {
            link_type,
            dest_url,
            title,
            id,
        }) => {
            let safe = dest_url.starts_with('#')
                || url::Url::parse(&dest_url)
                    .is_ok_and(|u| matches!(u.scheme(), "https" | "http" | "mailto"));
            Event::Start(Tag::Link {
                link_type,
                dest_url: if safe { dest_url } else { "#".into() },
                title,
                id,
            })
        }
        other => other,
    });
    let mut body = String::new();
    html::push_html(&mut body, parser);
    format!("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\"><style>{}</style></head><body><article>{body}</article></body></html>",include_str!("document-print.css"))
}
fn substitute(arguments: &[String], input: &Path, output: &Path, html: &Path) -> Vec<String> {
    // One pass: a filename containing another placeholder must remain literal.
    arguments
        .iter()
        .map(|arg| {
            let values = [
                ("{input}", input),
                ("{output}", output),
                ("{html}", html),
                ("{directory}", input.parent().unwrap_or(Path::new("."))),
            ];
            let mut result = String::new();
            let mut rest = arg.as_str();
            while !rest.is_empty() {
                if let Some((key, path)) = values.iter().find(|(key, _)| rest.starts_with(key)) {
                    result.push_str(&path.to_string_lossy());
                    rest = &rest[key.len()..]
                } else {
                    let ch = rest.chars().next().unwrap();
                    result.push(ch);
                    rest = &rest[ch.len_utf8()..]
                }
            }
            result
        })
        .collect()
}
fn verify_pdf(path: &Path) -> Result<(), String> {
    let mut header = [0; 5];
    let mut file =
        fs::File::open(path).map_err(|e| format!("Converter did not create a PDF: {e}"))?;
    file.read_exact(&mut header)
        .map_err(|_| "Converter returned an empty/incomplete PDF".to_string())?;
    if &header != b"%PDF-" || file.metadata().map_err(|e| e.to_string())?.len() > 100 * 1024 * 1024
    {
        return Err("Converter output is not a valid bounded PDF".into());
    }
    Ok(())
}
fn command_convert(
    c: &Converter,
    input: &Path,
    output: &Path,
    html: &Path,
    cancel: &CancelFlag,
    id: &str,
) -> Result<(), String> {
    use std::process::{Command, Stdio};
    let mut command = Command::new(&c.executable);
    command
        .args(substitute(&c.arguments, input, output, html))
        .current_dir(input.parent().ok_or("Input has no parent folder")?)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Unable to start converter {}: {e}", c.name))?;
    let mut stderr = child.stderr.take().unwrap();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut tail = Vec::new();
        let mut buffer = [0; 4096];
        while let Ok(n) = stderr.read(&mut buffer) {
            if n == 0 {
                break;
            }
            tail.extend_from_slice(&buffer[..n]);
            if tail.len() > 16384 {
                tail.drain(..tail.len() - 16384);
            }
        }
        let _ = tx.send(String::from_utf8_lossy(&tail).into_owned());
    });
    let deadline = Instant::now() + Duration::from_secs(c.timeout_seconds.clamp(5, 600));
    loop {
        if cancel.is_cancelled(Some(id))? || Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Conversion cancelled or timed out; no existing output was changed".into());
        }
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            if status.success() {
                return Ok(());
            }
            return Err(format!(
                "Converter exited with {status}: {}",
                rx.recv_timeout(Duration::from_millis(200))
                    .unwrap_or_default()
            ));
        }
        std::thread::sleep(Duration::from_millis(60));
    }
}
#[cfg(windows)]
fn builtin_convert(
    app: &tauri::AppHandle,
    html: &Path,
    output: &Path,
    cancel: &CancelFlag,
    id: &str,
) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment6, ICoreWebView2_7},
        PrintToPdfCompletedHandler,
    };
    use windows61::core::{Interface, HSTRING};
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let document = url::Url::from_file_path(html).map_err(|_| "Invalid print HTML path")?;
    let expected = document.clone();
    let destination = output.to_path_buf();
    let started = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let label = format!(
        "pdf-{}-{}",
        std::process::id(),
        PRINT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(document))
        .title("RHFiles PDF")
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .inner_size(900., 1100.)
        .data_directory(html.parent().unwrap().join("webview-profile"))
        .on_page_load(move |window, event| {
            if event.event() != tauri::webview::PageLoadEvent::Finished
                || event.url() != &expected
                || started.swap(true, std::sync::atomic::Ordering::Relaxed)
            {
                return;
            }
            let tx = tx.clone();
            let errors = tx.clone();
            let output = destination.clone();
            if let Err(e) = window.with_webview(move |webview| {
                let result = (|| -> Result<(), String> {
                    unsafe {
                        let core: ICoreWebView2_7 = webview
                            .controller()
                            .CoreWebView2()
                            .map_err(|e| e.to_string())?
                            .cast()
                            .map_err(|e| e.to_string())?;
                        let environment: ICoreWebView2Environment6 =
                            webview.environment().cast().map_err(|e| e.to_string())?;
                        let settings = environment
                            .CreatePrintSettings()
                            .map_err(|e| e.to_string())?;
                        settings.SetPageWidth(8.2677).map_err(|e| e.to_string())?;
                        settings.SetPageHeight(11.6929).map_err(|e| e.to_string())?;
                        settings
                            .SetShouldPrintBackgrounds(true)
                            .map_err(|e| e.to_string())?;
                        let done = tx.clone();
                        let handler =
                            PrintToPdfCompletedHandler::create(Box::new(move |result, success| {
                                let _ = done.send(if result.is_ok() && success {
                                    Ok(())
                                } else {
                                    Err(format!("WebView2 PDF printing failed: {result:?}"))
                                });
                                Ok(())
                            }));
                        core.PrintToPdf(
                            &HSTRING::from(output.to_string_lossy().as_ref()),
                            &settings,
                            &handler,
                        )
                        .map_err(|e| e.to_string())?;
                        Ok(())
                    }
                })();
                if let Err(e) = result {
                    let _ = tx.send(Err(e));
                }
            }) {
                let _ = errors.send(Err(e.to_string()));
            }
        })
        .build()
        .map_err(|e| format!("Unable to start WebView2 PDF engine: {e}"))?;
    let deadline = Instant::now() + Duration::from_secs(120);
    let result = loop {
        if cancel.is_cancelled(Some(id))? {
            break Err("Conversion cancelled".into());
        }
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(r) => break r,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                break Err("PDF engine closed unexpectedly".into())
            }
            _ => {}
        }
        if Instant::now() > deadline {
            break Err("WebView2 PDF conversion timed out".into());
        }
    };
    let _ = window.destroy();
    result
}
#[cfg(windows)]
static PRINT_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
#[cfg(not(windows))]
fn builtin_convert(
    _: &tauri::AppHandle,
    _: &Path,
    _: &Path,
    _: &CancelFlag,
    _: &str,
) -> Result<(), String> {
    Err("Built-in PDF engine is Windows-only; configure a command provider".into())
}

#[tauri::command(async)]
pub fn convert_markdown_pdf(
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
    input_path: String,
    output_path: String,
    converter_id: Option<String>,
    operation_id: String,
) -> Result<String, String> {
    cancel.reset(Some(&operation_id))?;
    struct Guard<'a>(&'a CancelFlag, &'a str);
    impl Drop for Guard<'_> {
        fn drop(&mut self) {
            self.0.clear(Some(self.1))
        }
    }
    let _guard = Guard(&cancel, &operation_id);
    let input = PathBuf::from(input_path);
    let output = PathBuf::from(output_path);
    if !input.is_file()
        || !input.extension().is_some_and(|e| {
            matches!(
                e.to_string_lossy().to_ascii_lowercase().as_str(),
                "md" | "markdown"
            )
        })
    {
        return Err("Choose a Markdown file (.md / .markdown)".into());
    }
    if output
        .extension()
        .is_none_or(|e| !e.eq_ignore_ascii_case("pdf"))
        || output.exists()
    {
        return Err("Output must be a new .pdf file; existing files are never overwritten".into());
    }
    let registry = read_registry(&config_path()?)?;
    let selected = converter_id.as_deref().unwrap_or(&registry.default);
    let provider = registry
        .converters
        .iter()
        .find(|c| c.id == selected)
        .ok_or("Converter no longer exists; reload the dialog")?;
    let mut bytes = Vec::new();
    fs::File::open(&input)
        .map_err(|e| e.to_string())?
        .take(16 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("Markdown exceeds 16 MiB".into());
    }
    let markdown = String::from_utf8(bytes).map_err(|_| "Markdown must be UTF-8")?;
    let folder = output.parent().ok_or("Output needs a parent directory")?;
    let temporary = tempfile::Builder::new()
        .prefix(".rhfiles-pdf-")
        .tempdir_in(folder)
        .map_err(|e| e.to_string())?;
    let html = temporary.path().join("document.html");
    let pdf = temporary.path().join("document.pdf");
    fs::write(
        &html,
        markdown_html(
            markdown.trim_start_matches('\u{feff}'),
            input.parent().unwrap(),
        ),
    )
    .map_err(|e| e.to_string())?;
    if provider.kind == "builtin" {
        builtin_convert(&app, &html, &pdf, &cancel, &operation_id)?
    } else {
        command_convert(provider, &input, &pdf, &html, &cancel, &operation_id)?
    }
    if cancel.is_cancelled(Some(&operation_id))? {
        return Err("Conversion cancelled".into());
    }
    verify_pdf(&pdf)?;
    // create_new is the final race check, even if another task created the name
    // while the converter was running. Never replace or truncate an existing PDF.
    let mut destination = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output)
        .map_err(|e| format!("Unable to create output without overwriting: {e}"))?;
    let published = std::io::copy(
        &mut fs::File::open(&pdf).map_err(|e| e.to_string())?,
        &mut destination,
    )
    .and_then(|_| destination.sync_all());
    if let Err(e) = published {
        drop(destination);
        let _ = fs::remove_file(&output);
        return Err(e.to_string());
    }
    Ok(output.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scripts_and_remote_resources_are_not_executed() {
        let html=markdown_html("# 中文\n<script>alert(1)</script>\n![remote](https://evil.invalid/x.png)\n[bad](javascript:alert(1))",Path::new("."));
        assert!(!html.contains("<script>"));
        assert!(!html.contains("src=\"https://"));
        assert!(!html.contains("href=\"javascript:"));
        assert!(html.contains("&lt;script&gt;"));
    }
    #[test]
    fn tables_and_multiline_code_render() {
        let html = markdown_html(
            "| A | B |\n|---|---|\n| 中文 | ok |\n\n```rs\nfn main() {}\n```",
            Path::new("."),
        );
        assert!(html.contains("<table>"));
        assert!(html.contains("language-rs"));
        assert!(html.contains("中文"));
    }
    #[test]
    fn substitution_does_not_reinterpret_filenames() {
        let args = vec!["{input}".into(), "--output={output}".into()];
        let result = substitute(
            &args,
            Path::new("a {output} 中文.md"),
            Path::new("b.pdf"),
            Path::new("a.html"),
        );
        assert_eq!(result, vec!["a {output} 中文.md", "--output=b.pdf"]);
    }
    #[test]
    fn config_rejects_duplicates_missing_default_and_shell_string() {
        let mut r = Registry::default();
        r.converters.push(r.converters[0].clone());
        assert!(validate_registry(&r).is_err());
        let mut r = Registry::default();
        r.default = "missing".into();
        assert!(validate_registry(&r).is_err());
        let mut r = Registry::default();
        r.converters[0].kind = "command".into();
        r.converters[0].executable = "pandoc --pdf".into();
        assert!(validate_registry(&r).is_err());
    }
    #[test]
    fn invalid_pdf_is_not_a_success() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("x.pdf");
        fs::write(&file, "not a PDF").unwrap();
        assert!(verify_pdf(&file).is_err());
    }
}
