//! RHVideo client, not a bundled server or a direct database connection.
//! Passwords are used once; bearer tokens stay in native process memory.
use axum::{
    Router,
    body::Body,
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};
use url::Url;

const JSON_LIMIT: usize = 32 * 1024 * 1024;
static GENERATION: AtomicU64 = AtomicU64::new(0);
static SESSION: Mutex<Option<Arc<Session>>> = Mutex::new(None);
static BROKER: tokio::sync::OnceCell<u16> = tokio::sync::OnceCell::const_new();
static CAPACITY: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
static PLAYBACK: Mutex<Option<Playback>> = Mutex::new(None);
static PLAY_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
struct Playback {
    generation: u64,
    items: Vec<(String, String)>,
    index: usize,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    server: String,
    username: String,
}
struct Asset {
    path: String,
    image: bool,
}
struct Session {
    base: Url,
    username: String,
    token: String,
    capability: String,
    port: u16,
    generation: u64,
    client: reqwest::Client,
    assets: Mutex<HashMap<String, Asset>>,
    next_asset: AtomicU64,
    videos: Mutex<Option<(Instant, Value)>>,
}
fn current() -> Result<Arc<Session>, String> {
    SESSION
        .lock()
        .map_err(|_| "媒体库状态不可用")?
        .clone()
        .ok_or_else(|| "请先连接并登录 RHVideo".into())
}
fn config_path() -> Result<std::path::PathBuf, String> {
    Ok(crate::profile::data_dir()?.join("rhvideo-client.json"))
}
fn read_config() -> Config {
    config_path()
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .read_timeout(Duration::from_secs(20))
        .no_proxy()
        .user_agent("RHFiles/RHVideo-client")
        .build()
        .map_err(|_| "无法初始化媒体库连接".into())
}
fn base_url(input: &str) -> Result<Url, String> {
    let mut url =
        Url::parse(input.trim()).map_err(|_| "请填写完整的 http:// 或 https:// 服务器地址")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("服务器地址不能包含账号、密码、查询参数或片段".into());
    }
    let path = url.path().trim_end_matches('/').to_owned();
    let path = path
        .strip_suffix("/static/index.html")
        .or_else(|| path.strip_suffix("/api/v1"))
        .unwrap_or(&path);
    let path = format!("{}/", path.trim_end_matches('/'));
    url.set_path(&path);
    Ok(url)
}
fn identifier(value: &str) -> Result<&str, String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
    {
        return Err("媒体 ID 无效".into());
    }
    Ok(value)
}
fn text<'a>(args: &'a Value, key: &str, max: usize) -> Result<&'a str, String> {
    let value = args
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("缺少参数：{key}"))?;
    if value.len() > max || value.chars().any(|c| c == '\0') {
        return Err(format!("参数过长或无效：{key}"));
    }
    Ok(value)
}
fn number(args: &Value, key: &str, default: u64, max: u64) -> Result<u64, String> {
    match args.get(key) {
        None => Ok(default),
        Some(v) => v
            .as_u64()
            .filter(|v| *v <= max)
            .ok_or_else(|| format!("参数超出范围：{key}")),
    }
}
fn kind(args: &Value) -> Result<&str, String> {
    let value = text(args, "kind", 16)?;
    if !matches!(value, "video" | "picture" | "novel" | "favorite") {
        return Err("未知媒体类型".into());
    }
    Ok(value)
}
fn safe_storage_path(path: &str) -> Result<String, String> {
    let decoded = percent_encoding::percent_decode_str(path)
        .decode_utf8()
        .map_err(|_| "媒体路径编码无效")?;
    let decoded = decoded.strip_prefix('/').unwrap_or(&decoded);
    if !decoded.starts_with("storage/")
        || decoded.len() > 4096
        || decoded
            .chars()
            .any(|c| c.is_control() || "\\?#%".contains(c))
        || decoded
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == "..")
    {
        return Err("服务器返回了不安全的媒体路径".into());
    }
    // Encode each segment, including literal spaces/#/? in legitimate filenames.
    let mut url = Url::parse("http://local/").unwrap();
    {
        let mut segments = url.path_segments_mut().unwrap();
        segments.clear();
        for part in decoded.split('/') {
            segments.push(part);
        }
    }
    Ok(url.path().trim_start_matches('/').to_owned())
}
fn upstream_error(status: reqwest::StatusCode, body: &[u8]) -> String {
    let detail = serde_json::from_slice::<Value>(body)
        .ok()
        .and_then(|v| v.get("detail").and_then(Value::as_str).map(str::to_owned));
    match status.as_u16() {
        401 | 403 => format!(
            "登录已失效或没有权限，请重新登录（HTTP {}）",
            status.as_u16()
        ),
        300..=399 => {
            "服务器返回了重定向；请直接填写最终的 RHVideo 地址，未向新地址转发登录信息".into()
        }
        _ => format!(
            "RHVideo 请求失败（HTTP {}）{}",
            status.as_u16(),
            detail
                .map(|s| format!("：{}", s.chars().take(300).collect::<String>()))
                .unwrap_or_default()
        ),
    }
}
fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "RHVideo 响应超时，请检查地址和网络".into()
    } else if error.is_connect() {
        "无法连接 RHVideo，请检查服务器是否运行、地址与端口是否正确".into()
    } else {
        "RHVideo 网络请求失败；连接或响应数据不完整".into()
    }
}
async fn json_response(mut response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if bytes.len() + chunk.len() > JSON_LIMIT {
            return Err("媒体库响应超过 32 MB，请缩小服务器媒体范围".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if !status.is_success() {
        return Err(upstream_error(status, &bytes));
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| "RHVideo 没有返回有效 JSON；请检查地址是否指向 RHVideo 服务".into())
}
impl Session {
    fn endpoint(&self, path: &str) -> Result<Url, String> {
        self.base
            .join(path.trim_start_matches('/'))
            .map_err(|_| "接口路径无效".into())
    }
    async fn request(
        &self,
        method: reqwest::Method,
        path: &str,
        query: &[(&str, String)],
        body: Option<Value>,
    ) -> Result<Value, String> {
        let mut request = self
            .client
            .request(method, self.endpoint(path)?)
            .bearer_auth(&self.token)
            .query(query)
            .timeout(Duration::from_secs(25));
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request.send().await.map_err(network_error)?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            let mut slot = SESSION.lock().map_err(|_| "媒体库状态不可用")?;
            if slot
                .as_ref()
                .is_some_and(|s| s.generation == self.generation)
            {
                slot.take();
            }
        }
        json_response(response).await
    }
    fn asset(&self, path: String, image: bool) -> Result<String, String> {
        let mut assets = self.assets.lock().map_err(|_| "媒体缓存状态不可用")?;
        if let Some((id, _)) = assets
            .iter()
            .find(|(_, a)| a.path == path && a.image == image)
        {
            return Ok(format!(
                "http://127.0.0.1:{}/{}/{}",
                self.port, self.capability, id
            ));
        }
        if assets.len() >= 4096 {
            // Old pages are no longer mounted. Keep a bounded recent-link cache
            // instead of forcing a fresh login after browsing a large library.
            let oldest = assets
                .iter()
                .filter(|(_, a)| a.image)
                .min_by_key(|(id, _)| id.parse::<u64>().unwrap_or(0))
                .map(|(id, _)| id.clone());
            if let Some(id) = oldest {
                assets.remove(&id);
            } else {
                return Err("本机媒体通道繁忙，请稍后重试".into());
            }
        }
        let id = self.next_asset.fetch_add(1, Ordering::Relaxed).to_string();
        assets.insert(id.clone(), Asset { path, image });
        Ok(format!(
            "http://127.0.0.1:{}/{}/{}",
            self.port, self.capability, id
        ))
    }
    fn media(&self, raw: &Value, fallback: &str) -> Result<Value, String> {
        let media_kind = raw.get("type").and_then(Value::as_str).unwrap_or(fallback);
        if !matches!(media_kind, "video" | "picture" | "novel") {
            return Err("服务器返回未知媒体类型".into());
        }
        let id = identifier(raw.get("id").and_then(Value::as_str).ok_or("媒体缺少 ID")?)?;
        let cover = match media_kind {
            "video" => Some(self.asset(format!("api/v1/videos/{id}/thumbnail"), true)?),
            "picture" => raw
                .get("webp_path")
                .or_else(|| raw.get("thumbnail_url"))
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(|p| {
                    let p = if p.trim_start_matches('/').starts_with("storage/") {
                        p.to_owned()
                    } else {
                        format!("storage/{p}")
                    };
                    self.asset(safe_storage_path(&p)?, true)
                })
                .transpose()?,
            _ => None,
        };
        Ok(json!({
            "id":id,"kind":media_kind,
            "title":raw.get("title").or_else(||raw.get("original_filename")).or_else(||raw.get("filename")).and_then(Value::as_str).unwrap_or(id),
            "folder":raw.get("folder_label").and_then(Value::as_str).unwrap_or(""),
            "cover":cover,"duration":raw.get("duration_seconds").or_else(||raw.get("original_duration")),
            "resolution":raw.get("resolution").or_else(||raw.get("original_resolution")),
            "status":raw.get("status"),"progress":raw.get("progress"),
            "wordCount":raw.get("word_count"),"chapters":raw.get("chapter_count")
        }))
    }
}
async fn broker() -> Result<u16, String> {
    BROKER
        .get_or_try_init(|| async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
                .await
                .map_err(|_| "无法启动本机媒体通道")?;
            let port = listener
                .local_addr()
                .map_err(|_| "无法读取本机媒体端口")?
                .port();
            tauri::async_runtime::spawn(async move {
                let _ = axum::serve(
                    listener,
                    Router::new().route("/{cap}/{id}", get(stream_asset)),
                )
                .await;
            });
            Ok(port)
        })
        .await
        .copied()
}
async fn stream_asset(Path((cap, id)): Path<(String, String)>, headers: HeaderMap) -> Response {
    let failure = |status| {
        Response::builder()
            .status(status)
            .body(Body::empty())
            .unwrap()
    };
    let Ok(session) = current() else {
        return failure(StatusCode::UNAUTHORIZED);
    };
    if cap.len() != session.capability.len()
        || cap
            .bytes()
            .zip(session.capability.bytes())
            .fold(0u8, |a, (b, c)| a | (b ^ c))
            != 0
    {
        return failure(StatusCode::UNAUTHORIZED);
    }
    if headers.get("host").and_then(|h| h.to_str().ok())
        != Some(format!("127.0.0.1:{}", session.port).as_str())
    {
        return failure(StatusCode::FORBIDDEN);
    }
    let Some((path, image)) = session
        .assets
        .lock()
        .ok()
        .and_then(|a| a.get(&id).map(|a| (a.path.clone(), a.image)))
    else {
        return failure(StatusCode::NOT_FOUND);
    };
    let semaphore = CAPACITY.get_or_init(|| Arc::new(tokio::sync::Semaphore::new(12)));
    let Ok(permit) = semaphore.clone().try_acquire_owned() else {
        return failure(StatusCode::SERVICE_UNAVAILABLE);
    };
    let Ok(url) = session.endpoint(&path) else {
        return failure(StatusCode::BAD_REQUEST);
    };
    let mut request = session.client.get(url).bearer_auth(&session.token);
    if let Some(range) = headers.get("range") {
        let valid = range.to_str().ok().is_some_and(|s| {
            s.len() < 80
                && s.starts_with("bytes=")
                && s[6..].bytes().all(|b| b.is_ascii_digit() || b == b'-')
                && s[6..].bytes().filter(|b| *b == b'-').count() == 1
        });
        if !valid {
            return failure(StatusCode::RANGE_NOT_SATISFIABLE);
        }
        request = request.header("range", range);
    }
    let Ok(response) = request.send().await else {
        return failure(StatusCode::BAD_GATEWAY);
    };
    if !response.status().is_success() {
        return failure(
            StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
        );
    }
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|s| s.to_str().ok())
        .unwrap_or("application/octet-stream");
    if image && !content_type.starts_with("image/") {
        return failure(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }
    let mut output = Response::builder()
        .status(response.status())
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "private, no-store");
    for name in [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
    ] {
        if let Some(value) = response.headers().get(name) {
            output = output.header(name, value);
        }
    }
    // The permit lives as long as the stream, with no buffering of the whole movie.
    use futures_util::StreamExt;
    let stream = response.bytes_stream().map(move |chunk| {
        let _keep_permit = &permit;
        let live = SESSION.lock().ok().is_some_and(|s| {
            s.as_ref()
                .is_some_and(|s| s.generation == session.generation)
        });
        if live {
            chunk.map_err(std::io::Error::other)
        } else {
            Err(std::io::Error::other("RHVideo session ended"))
        }
    });
    output.body(Body::from_stream(stream)).unwrap()
}
fn state() -> Value {
    let config = read_config();
    let session = SESSION.lock().ok().and_then(|s| s.clone());
    json!({"server":session.as_ref().map(|s|s.base.as_str()).unwrap_or(&config.server),
        "username":session.as_ref().map(|s|s.username.as_str()).unwrap_or(&config.username),
        "connected":session.is_some(),"nativePlayback":native_available(),"credentialsPersisted":false})
}
fn native_available() -> bool {
    #[cfg(windows)]
    {
        crate::rhvideo_player::available()
    }
    #[cfg(not(windows))]
    {
        false
    }
}
pub(crate) async fn client_window(
    app: AppHandle,
    label: &'static str,
    url: &'static str,
    title: &'static str,
    size: (f64, f64),
    minimum: (f64, f64),
) -> Result<tauri::WebviewWindow, String> {
    #[cfg(windows)]
    {
        // Reuse the actual controller environment, not merely a nominal data
        // directory. Otherwise WebView2 can spawn a second browser process for
        // a dynamic window, breaking profile isolation and CLI target discovery.
        let main = app.get_webview_window("main").ok_or("主窗口不可用")?;
        let (tx, rx) = tokio::sync::oneshot::channel();
        main.with_webview(move |platform| {
            let result = crate::window::with_browser_args(
                tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App(url.into()))
                    .title(title)
                    .inner_size(size.0, size.1)
                    .min_inner_size(minimum.0, minimum.1)
                    .with_environment(platform.environment()),
            )
            .build()
            .map_err(|e| e.to_string());
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
        rx.await.map_err(|_| "创建媒体库窗口失败".to_owned())?
    }
    #[cfg(not(windows))]
    {
        crate::window::with_browser_args(
            tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App(url.into()))
                .title(title)
                .inner_size(size.0, size.1)
                .min_inner_size(minimum.0, minimum.1),
        )
        .build()
        .map_err(|e| e.to_string())
    }
}
fn queue_info() -> Value {
    PLAYBACK.lock().ok().and_then(|q|q.as_ref().map(|q|json!({"id":q.items[q.index].0,"index":q.index,"total":q.items.len(),"hasPrevious":q.index>0,"hasNext":q.index+1<q.items.len()}))).unwrap_or(Value::Null)
}
async fn native_play(
    app: AppHandle,
    session: &Session,
    id: &str,
    title: String,
    seconds: f64,
    low_bandwidth: bool,
) -> Result<Value, String> {
    let path = format!(
        "api/v1/videos/{id}/play{}",
        if low_bandwidth { "?super=true" } else { "" }
    );
    let url = session.asset(path, false)?;
    #[cfg(windows)]
    {
        crate::rhvideo_player::play(app, url, title, seconds).await
    }
    #[cfg(not(windows))]
    {
        let _ = (app, url, title, seconds);
        Err("此体验版的原生 RHVideo 播放暂仅支持 Windows".into())
    }
}
#[tauri::command]
pub async fn rhvideo_open(app: AppHandle) -> Result<Value, String> {
    if let Some(window) = app.get_webview_window("window-rhvideo") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        client_window(
            app,
            "window-rhvideo",
            "rhvideo.html",
            "RHFiles · RHVideo",
            (1200., 820.),
            (800., 550.),
        )
        .await?;
    }
    Ok(json!({"opened":true}))
}
#[tauri::command]
pub async fn rhvideo_request(app: AppHandle, action: String, args: Value) -> Result<Value, String> {
    if !args.is_object() {
        return Err("参数必须是 JSON 对象".into());
    }
    match action.as_str() {
        "state" => return Ok(state()),
        "player.fullscreen" => {
            let window = app
                .get_webview_window("window-rhvideo-player")
                .ok_or("播放器尚未打开")?;
            let fullscreen = !window.is_fullscreen().map_err(|e| e.to_string())?;
            window
                .set_fullscreen(fullscreen)
                .map_err(|e| e.to_string())?;
            return Ok(json!({"fullscreen":fullscreen}));
        }
        "logout" => {
            GENERATION.fetch_add(1, Ordering::SeqCst);
            SESSION.lock().map_err(|_| "媒体库状态不可用")?.take();
            PLAYBACK.lock().map_err(|_| "播放队列状态不可用")?.take();
            #[cfg(windows)]
            crate::rhvideo_player::stop();
            return Ok(state());
        }
        "connect" => {
            let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
            let base = base_url(text(&args, "server", 4096)?)?;
            let username = text(&args, "username", 256)?.trim().to_owned();
            let password = text(&args, "password", 4096)?;
            if username.is_empty() || password.is_empty() {
                return Err("请填写 RHVideo 用户名和密码".into());
            }
            let client = client()?;
            let response = client
                .post(
                    base.join("api/v1/auth/login")
                        .map_err(|_| "服务器地址无效")?,
                )
                .json(&json!({"username":username,"password":password}))
                .timeout(Duration::from_secs(20))
                .send()
                .await
                .map_err(network_error)?;
            if response.status() == reqwest::StatusCode::UNAUTHORIZED {
                return Err("RHVideo 用户名或密码错误（HTTP 401）".into());
            }
            let login = json_response(response).await?;
            let token = login
                .get("access_token")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty() && s.len() < 32768)
                .ok_or("服务器未返回有效登录令牌")?
                .to_owned();
            let mut bytes = [0u8; 32];
            getrandom::fill(&mut bytes).map_err(|_| "无法生成安全的本机媒体通道")?;
            let session = Arc::new(Session {
                base,
                username: username.clone(),
                token,
                capability: bytes.iter().map(|b| format!("{b:02x}")).collect(),
                port: broker().await?,
                generation,
                client,
                assets: Mutex::new(HashMap::new()),
                next_asset: AtomicU64::new(1),
                videos: Mutex::new(None),
            });
            session
                .request(reqwest::Method::GET, "api/v1/auth/me", &[], None)
                .await?;
            if GENERATION.load(Ordering::SeqCst) != generation {
                return Err("此登录请求已被新的操作取消".into());
            }
            let config = Config {
                server: session.base.to_string(),
                username,
            };
            let path = config_path()?;
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|_| "无法保存媒体库地址")?;
            }
            std::fs::write(&path, serde_json::to_vec(&config).map_err(|_| "配置无效")?)
                .map_err(|_| "无法保存媒体库地址")?;
            #[cfg(windows)]
            crate::rhvideo_player::stop();
            PLAYBACK.lock().map_err(|_| "播放队列状态不可用")?.take();
            *SESSION.lock().map_err(|_| "媒体库状态不可用")? = Some(session);
            return Ok(state());
        }
        _ => {}
    }
    let session = current()?;
    match action.as_str() {
        "catalog" => {
            let kind = kind(&args)?;
            let offset = number(&args, "offset", 0, 1_000_000)?;
            let limit = number(&args, "limit", 36, 72)?.max(1);
            let search = args
                .get("search")
                .map(|_| text(&args, "search", 256))
                .transpose()?
                .unwrap_or("");
            let folder = args
                .get("folder")
                .map(|_| text(&args, "folder", 1024))
                .transpose()?
                .unwrap_or("");
            let (rows, total) = if kind == "video" {
                let cached = if args.get("refresh").and_then(Value::as_bool) == Some(true) {
                    None
                } else {
                    session
                        .videos
                        .lock()
                        .map_err(|_| "媒体列表状态不可用")?
                        .as_ref()
                        .filter(|(at, _)| at.elapsed() < Duration::from_secs(30))
                        .map(|(_, v)| v.clone())
                };
                let value = if let Some(value) = cached {
                    value
                } else {
                    let value = session
                        .request(
                            reqwest::Method::GET,
                            "api/v1/videos",
                            &[("summary", "true".into())],
                            None,
                        )
                        .await?;
                    *session.videos.lock().map_err(|_| "媒体列表状态不可用")? =
                        Some((Instant::now(), value.clone()));
                    value
                };
                let rows = value.as_array().ok_or("RHVideo 视频列表格式不兼容")?;
                let search = search.to_lowercase();
                let rows: Vec<_> = rows
                    .iter()
                    .filter(|v| {
                        let label = v.get("folder_label").and_then(Value::as_str).unwrap_or("");
                        let title = v
                            .get("original_filename")
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        (folder.is_empty() || label.split(',').any(|s| s.trim() == folder))
                            && (search.is_empty()
                                || format!("{title} {label}").to_lowercase().contains(&search))
                    })
                    .collect();
                (
                    rows.iter()
                        .skip(offset as usize)
                        .take(limit as usize)
                        .map(|v| (*v).clone())
                        .collect::<Vec<_>>(),
                    rows.len() as u64,
                )
            } else {
                let path = match kind {
                    "picture" => "api/v1/pictures",
                    "novel" => "api/v1/novels",
                    _ => "api/v1/favorites",
                };
                let mut query = vec![("skip", offset.to_string()), ("limit", limit.to_string())];
                if !search.is_empty() {
                    query.push(("search", search.into()));
                }
                if !folder.is_empty() && kind != "favorite" {
                    query.push(("folder", folder.into()));
                }
                let value = session
                    .request(reqwest::Method::GET, path, &query, None)
                    .await?;
                (
                    value
                        .get("items")
                        .and_then(Value::as_array)
                        .ok_or("RHVideo 媒体列表格式不兼容")?
                        .clone(),
                    value
                        .get("total")
                        .and_then(Value::as_u64)
                        .ok_or("媒体列表缺少总数")?,
                )
            };
            let items = rows
                .iter()
                .map(|v| session.media(v, kind))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(
                json!({"items":items,"total":total,"offset":offset,"limit":limit,"generation":session.generation}),
            )
        }
        "folders" => {
            let path = match kind(&args)? {
                "video" => "api/v1/videos/folders",
                "picture" => "api/v1/pictures/folders",
                "novel" => "api/v1/novels/folders",
                _ => return Ok(json!([])),
            };
            session.request(reqwest::Method::GET, path, &[], None).await
        }
        "favorites" => {
            session
                .request(reqwest::Method::GET, "api/v1/favorites/ids", &[], None)
                .await
        }
        "favorite" => {
            let kind = kind(&args)?;
            if kind == "favorite" {
                return Err("收藏类型无效".into());
            }
            let id = identifier(text(&args, "id", 128)?)?;
            let enabled = args
                .get("enabled")
                .and_then(Value::as_bool)
                .ok_or("缺少收藏状态")?;
            session
                .request(
                    if enabled {
                        reqwest::Method::PUT
                    } else {
                        reqwest::Method::DELETE
                    },
                    &format!("api/v1/favorites/{kind}/{id}"),
                    &[],
                    None,
                )
                .await
        }
        "novel" | "chapter" | "progress" => {
            let id = identifier(text(&args, "id", 128)?)?;
            let path = format!("api/v1/novels/{id}");
            if action == "novel" {
                session
                    .request(reqwest::Method::GET, &path, &[], None)
                    .await
            } else {
                let chapter = number(&args, "chapter", 0, 100000)?;
                if action == "chapter" {
                    session
                        .request(
                            reqwest::Method::GET,
                            &format!("{path}/chapters/{chapter}"),
                            &[],
                            None,
                        )
                        .await
                } else {
                    let ratio = args
                        .get("ratio")
                        .and_then(Value::as_f64)
                        .filter(|v| v.is_finite() && (0.0..=1.0).contains(v))
                        .ok_or("阅读进度无效")?;
                    session
                        .request(
                            reqwest::Method::PUT,
                            &format!("{path}/progress"),
                            &[],
                            Some(json!({"chapter_index":chapter,"scroll_ratio":ratio})),
                        )
                        .await
                }
            }
        }
        "frames" => {
            let id = identifier(text(&args, "id", 128)?)?;
            let value = session
                .request(
                    reqwest::Method::GET,
                    &format!("api/v1/screenshots/video/{id}"),
                    &[("per_video", "40".into())],
                    None,
                )
                .await?;
            let mut frames = Vec::new();
            for frame in value
                .get("screenshots")
                .and_then(Value::as_array)
                .ok_or("时间轴数据格式不兼容")?
                .iter()
                .take(100)
            {
                let path = safe_storage_path(
                    frame
                        .get("url")
                        .and_then(Value::as_str)
                        .ok_or("关键帧缺少路径")?,
                )?;
                frames.push(json!({"url":session.asset(path,true)?,"seconds":frame.get("time_seconds").and_then(Value::as_f64).unwrap_or(0.0)}));
            }
            Ok(json!({"frames":frames}))
        }
        "play" => {
            let _play = PLAY_LOCK.lock().await;
            let id = identifier(text(&args, "id", 128)?)?;
            let title = text(&args, "title", 1024)?.to_owned();
            let seconds = args.get("seconds").and_then(Value::as_f64).unwrap_or(0.0);
            if !seconds.is_finite() || !(0.0..=604800.0).contains(&seconds) {
                return Err("播放位置无效".into());
            }
            let items = if let Some(queue) = args.get("queue") {
                let queue = queue
                    .as_array()
                    .filter(|q| !q.is_empty() && q.len() <= 500)
                    .ok_or("播放队列必须包含 1–500 项")?;
                queue
                    .iter()
                    .map(|item| {
                        Ok((
                            identifier(text(item, "id", 128)?)?.to_owned(),
                            text(item, "title", 1024)?.to_owned(),
                        ))
                    })
                    .collect::<Result<Vec<_>, String>>()?
            } else {
                vec![(id.to_owned(), title.clone())]
            };
            let index = items
                .iter()
                .position(|(item, _)| item == id)
                .ok_or("当前视频不在播放队列中")?;
            let result = native_play(
                app,
                &session,
                id,
                title,
                seconds,
                args.get("super").and_then(Value::as_bool) == Some(true),
            )
            .await?;
            *PLAYBACK.lock().map_err(|_| "播放队列状态不可用")? = Some(Playback {
                generation: session.generation,
                items,
                index,
            });
            Ok(result)
        }
        "player.next" | "player.previous" => {
            let _play = PLAY_LOCK.lock().await;
            let (id, title, index) = {
                let queue = PLAYBACK.lock().map_err(|_| "播放队列状态不可用")?;
                let queue = queue
                    .as_ref()
                    .filter(|q| q.generation == session.generation)
                    .ok_or("播放队列已失效")?;
                let index = if action == "player.next" {
                    queue
                        .index
                        .checked_add(1)
                        .filter(|v| *v < queue.items.len())
                } else {
                    queue.index.checked_sub(1)
                }
                .ok_or("已经到达播放队列边界")?;
                (
                    queue.items[index].0.clone(),
                    queue.items[index].1.clone(),
                    index,
                )
            };
            let result = native_play(app, &session, &id, title, 0.0, false).await?;
            if let Some(queue) = PLAYBACK.lock().map_err(|_| "播放队列状态不可用")?.as_mut()
            {
                if queue.generation == session.generation {
                    queue.index = index;
                }
            }
            Ok(result)
        }
        "player.state" | "player.control" => {
            #[cfg(windows)]
            {
                let mut value = crate::rhvideo_player::command(&action, &args)?;
                value["queue"] = queue_info();
                Ok(value)
            }
            #[cfg(not(windows))]
            {
                Err("此平台暂未接入原生播放器".into())
            }
        }
        _ => Err(format!("不支持的 RHVideo 操作：{action}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn base_address_is_not_a_credential_or_arbitrary_protocol() {
        for bad in [
            "file:///C:/data",
            "ftp://server/",
            "http://u:p@server/",
            "https://server/?token=abc",
            "https://server/#x",
        ] {
            assert!(base_url(bad).is_err(), "{bad}");
        }
        assert_eq!(
            base_url("http://server:8000/static/index.html")
                .unwrap()
                .as_str(),
            "http://server:8000/"
        );
        assert_eq!(
            base_url("https://server/prefix/").unwrap().as_str(),
            "https://server/prefix/"
        );
    }
    #[test]
    fn media_paths_cannot_escape_the_storage_provider() {
        for bad in [
            "/api/v1/auth/me",
            "https://evil/image.jpg",
            "//evil/image",
            "/storage/../.env",
            "/storage/%2e%2e/.env",
            "/storage/%2F..%2F.env",
            "/storage/a\\x",
            "/storage/a%00.jpg",
        ] {
            assert!(safe_storage_path(bad).is_err(), "{bad}");
        }
        assert_eq!(
            safe_storage_path("/storage/pictures/中文 图.webp").unwrap(),
            "storage/pictures/%E4%B8%AD%E6%96%87%20%E5%9B%BE.webp"
        );
    }
    #[test]
    fn identifiers_never_become_paths_or_queries() {
        for bad in ["../config", "id?super=true", "a/b", "", "a%2fb", "中文"] {
            assert!(identifier(bad).is_err());
        }
        assert!(identifier("e3fa-123_a").is_ok());
    }
    #[test]
    fn limits_and_boolean_values_are_strict() {
        assert!(number(&json!({"limit":73}), "limit", 36, 72).is_err());
        assert!(number(&json!({"offset":-1}), "offset", 0, 1_000_000).is_err());
        assert!(number(&json!({"limit":"48"}), "limit", 36, 72).is_err());
        assert!(kind(&json!({"kind":"../../auth"})).is_err());
    }
    #[test]
    fn network_errors_do_not_disclose_tokens_or_html() {
        let body = br#"{"detail":"token=private"}"#;
        assert!(!upstream_error(reqwest::StatusCode::UNAUTHORIZED, body).contains("private"));
        assert!(!upstream_error(reqwest::StatusCode::FOUND, body).contains("private"));
        assert!(
            !upstream_error(
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                b"<html>secret</html>"
            )
            .contains("secret")
        );
        let config = serde_json::to_string(&Config {
            server: "http://local/".into(),
            username: "name".into(),
        })
        .unwrap();
        assert!(!config.contains("token") && !config.contains("password"));
    }
}
