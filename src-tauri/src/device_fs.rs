//! Native device-group filesystem. Stable identity URIs never reach Windows
//! filesystem/shell APIs; server credentials remain inside Connector.
use axum::{
    Router,
    body::Body,
    extract::Path as RoutePath,
    http::{HeaderMap, Method, StatusCode},
    response::Response,
    routing::get,
};
use base64::{
    Engine,
    engine::general_purpose::{STANDARD as B64, URL_SAFE_NO_PAD},
};
use rhfiles_service::connection::{DevicePath, FileLease, FileRequest};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

fn text<'a>(args: &'a Value, key: &str) -> Result<&'a str, String> {
    args[key]
        .as_str()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| format!("[invalid_request] 缺少 {key}"))
}
fn connector() -> Result<Arc<rhfiles_service::connection::Connector>, String> {
    crate::device_groups::connector()
}
async fn request(
    path: &DevicePath,
    op: FileRequest,
) -> Result<rhfiles_service::connection::FileResponse, String> {
    connector()?.file_request(&path.group, &path.peer, op).await
}
fn info(path: &DevicePath, raw: &Value) -> Result<Value, String> {
    let name = raw["name"]
        .as_str()
        .ok_or("[invalid_response] 远端文件缺少名称")?;
    let is_dir = raw["isDir"]
        .as_bool()
        .ok_or("[invalid_response] 远端文件缺少类型")?;
    let remote = DevicePath::new(
        &path.group,
        &path.peer,
        raw["path"]
            .as_str()
            .ok_or("[invalid_response] 远端文件缺少路径")?,
    )?;
    let size = raw["size"]
        .as_u64()
        .ok_or("[invalid_response] 远端文件大小无效")?;
    let ms = raw["modifiedMs"].as_i64().unwrap_or(0);
    let extension = if is_dir {
        String::new()
    } else {
        std::path::Path::new(name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase()
    };
    Ok(
        json!({"name":name,"path":remote.uri(),"is_dir":is_dir,"extension":extension,"size":size,"size_display":crate::types::format_size(size),
        "modified_ts":ms,"created_ts":0,"modified":"","created":"","folder_size":null,"is_hidden":name.starts_with('.'),"is_system":false,"is_dot":name.starts_with('.'),
        "remote":true,"remote_revision":raw["revision"],"attributes":"RHFiles","readonly":false}),
    )
}
async fn stat(path: &DevicePath) -> Result<Value, String> {
    if path.path == "/" {
        connector()?.file_lease(&path.group, &path.peer)?.check()?;
        return Ok(
            json!({"name":"RHFiles","path":path.uri(),"is_dir":true,"extension":"","size":0,"size_display":"","modified_ts":0,"created_ts":0,"modified":"","created":"","is_hidden":false,"is_system":false,"is_dot":false,"remote":true,"attributes":"RHFiles"}),
        );
    }
    let raw = request(
        path,
        FileRequest::Stat {
            path: path.path.clone(),
        },
    )
    .await?
    .json(65536)
    .await?;
    info(path, &raw)
}
async fn listing(path: &DevicePath) -> Result<Vec<Value>, String> {
    let mut entries = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut revision = None;
    let mut total = None;
    loop {
        let raw = request(
            path,
            FileRequest::List {
                path: path.path.clone(),
                offset: entries.len(),
                limit: 2000,
                revision: revision.clone(),
            },
        )
        .await?
        .json(8 * 1024 * 1024)
        .await?;
        if raw["path"] != path.path || raw["offset"].as_u64() != Some(entries.len() as u64) {
            return Err("[invalid_response] 远端目录分页无效".into());
        }
        let count = raw["total"]
            .as_u64()
            .filter(|v| *v <= 100000)
            .ok_or("[too_large] 单目录超过十万项，未截断展示")? as usize;
        if total.is_some_and(|n| n != count) {
            return Err("[conflict] 读取过程中目录已变化，请刷新".into());
        }
        total = Some(count);
        let stamp = raw["revision"]
            .as_str()
            .filter(|v| !v.is_empty())
            .ok_or("[invalid_response] 缺少目录版本")?;
        if revision.as_deref().is_some_and(|v| v != stamp) {
            return Err("[conflict] 远端目录版本已变化，请刷新".into());
        }
        revision = Some(stamp.to_string());
        let page = raw["entries"]
            .as_array()
            .ok_or("[invalid_response] 远端目录列表无效")?;
        if page.is_empty() && entries.len() < count || entries.len() + page.len() > count {
            return Err("[invalid_response] 远端返回了不完整分页".into());
        }
        for item in page {
            let expected = path.child(
                item["name"]
                    .as_str()
                    .ok_or("[invalid_response] 缺少文件名")?,
            )?;
            if item["path"] != expected.path || !seen.insert(expected.uri()) {
                return Err("[invalid_response] 文件不在请求目录内".into());
            }
            entries.push(info(path, item)?);
        }
        if entries.len() >= count {
            break;
        }
    }
    Ok(entries)
}
#[tauri::command]
pub async fn device_fs(action: String, args: Value) -> Result<Value, String> {
    if !args.is_object() {
        return Err("[invalid_request] 参数必须是对象".into());
    }
    let path = DevicePath::parse(text(&args, "path")?)?;
    match action.as_str() {
        "list" => Ok(json!(listing(&path).await?)),
        "stat" => stat(&path).await,
        "capabilities" => {
            request(&path, FileRequest::Capabilities)
                .await?
                .json(65536)
                .await
        }
        "search" => {
            let query = text(&args, "query")?;
            if query.len() > 512 {
                return Err("[invalid_request] 搜索条件过长".into());
            }
            let regex = if let Some(pattern) = query.strip_prefix("regex:") {
                Some(
                    regex::RegexBuilder::new(pattern)
                        .case_insensitive(true)
                        .size_limit(1024 * 1024)
                        .build()
                        .map_err(|_| "[invalid_request] 正则表达式无效或过大")?,
                )
            } else if let Some(pattern) = query.strip_prefix("wildcards:") {
                let expression = regex::escape(pattern)
                    .replace("\\*", ".*")
                    .replace("\\?", ".");
                Some(
                    regex::RegexBuilder::new(&format!("^{expression}$"))
                        .case_insensitive(true)
                        .build()
                        .map_err(|_| "[invalid_request] 通配符无效")?,
                )
            } else {
                None
            };
            let needle = query.to_lowercase();
            let search = async {
                let mut queue = std::collections::VecDeque::from([path]);
                let mut found = Vec::new();
                let mut visited = 0;
                while let Some(folder) = queue.pop_front() {
                    visited += 1;
                    if visited > 500 {
                        return Err("[too_large] 搜索超过 500 个文件夹，请缩小范围".to_string());
                    }
                    for item in listing(&folder).await? {
                        let name = item["name"].as_str().unwrap_or("");
                        if regex
                            .as_ref()
                            .map(|r| r.is_match(name))
                            .unwrap_or_else(|| name.to_lowercase().contains(&needle))
                        {
                            found.push(item.clone());
                            if found.len() >= 500 {
                                return Ok(json!(found));
                            }
                        }
                        if item["is_dir"] == true {
                            queue.push_back(DevicePath::parse(
                                item["path"]
                                    .as_str()
                                    .ok_or("[invalid_response] 搜索路径无效")?,
                            )?);
                        }
                    }
                }
                Ok(json!(found))
            };
            tokio::time::timeout(Duration::from_secs(15), search)
                .await
                .map_err(|_| "[timed_out] 搜索超过 15 秒，请缩小范围；未继续后台遍历".to_string())?
        }
        "resource" => Ok(json!({"url":resource(path).await?})),
        "thumbnail" => {
            let mut source = request(
                &path,
                FileRequest::Thumbnail {
                    path: path.path.clone(),
                },
            )
            .await?;
            let mut data = Vec::new();
            while let Some(chunk) = source.chunk().await? {
                if data.len() + chunk.len() > 2 * 1024 * 1024 {
                    return Err("[too_large] 缩略图超过 2 MiB".into());
                }
                data.extend_from_slice(&chunk);
            }
            if !data.starts_with(b"\x89PNG\r\n\x1a\n") {
                return Err("[invalid_response] 缩略图不是 PNG".into());
            }
            Ok(json!(B64.encode(data)))
        }
        "preview" => {
            let detail = stat(&path).await?;
            if detail["size"] == 0 {
                return Ok(
                    json!({"preview_type":"text","text_content":"","image_data":null,"size":0}),
                );
            }
            let mut source = request(
                &path,
                FileRequest::Content {
                    path: path.path.clone(),
                    range: Some("bytes=0-131071".into()),
                },
            )
            .await?;
            let mut data = Vec::new();
            while let Some(chunk) = source.chunk().await? {
                let left = 131072usize.saturating_sub(data.len());
                data.extend_from_slice(&chunk[..chunk.len().min(left)]);
                if data.len() >= 131072 {
                    break;
                }
            }
            let is_text = crate::system::is_probably_text_content(&data);
            let text = is_text.then(|| {
                String::from_utf8_lossy(&data)
                    .chars()
                    .take(40000)
                    .collect::<String>()
            });
            Ok(
                json!({"preview_type":if is_text{"text"}else{"binary"},"text_content":text,"image_data":null,"size":detail["size"]}),
            )
        }
        _ => Err("[unsupported] 不支持的设备文件操作".into()),
    }
}
struct Asset {
    path: DevicePath,
    lease: FileLease,
    touched: Instant,
}
static ASSETS: OnceLock<Mutex<HashMap<String, Asset>>> = OnceLock::new();
static BROKER: tokio::sync::OnceCell<u16> = tokio::sync::OnceCell::const_new();
static STREAMS: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
async fn resource(path: DevicePath) -> Result<String, String> {
    let lease = connector()?.file_lease(&path.group, &path.peer)?;
    let port = *BROKER
        .get_or_try_init(|| async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
                .await
                .map_err(|_| "无法创建本机媒体通道")?;
            let port = listener
                .local_addr()
                .map_err(|_| "无法读取本机媒体端口")?
                .port();
            tauri::async_runtime::spawn(async move {
                let _ =
                    axum::serve(listener, Router::new().route("/device/{id}", get(stream))).await;
            });
            Ok::<u16, String>(port)
        })
        .await?;
    let mut random = [0u8; 32];
    getrandom::fill(&mut random).map_err(|_| "安全随机数不可用")?;
    let id = URL_SAFE_NO_PAD.encode(random);
    let mut assets = ASSETS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "媒体通道状态不可用")?;
    assets.retain(|_, a| a.touched.elapsed() < Duration::from_secs(600) && a.lease.check().is_ok());
    if assets.len() >= 512 {
        let old = assets
            .iter()
            .min_by_key(|(_, a)| a.touched)
            .map(|(k, _)| k.clone())
            .unwrap();
        assets.remove(&old);
    }
    assets.insert(
        id.clone(),
        Asset {
            path,
            lease,
            touched: Instant::now(),
        },
    );
    Ok(format!("http://127.0.0.1:{port}/device/{id}"))
}
fn mime(path: &str) -> &'static str {
    match path
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "pdf" => "application/pdf",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "flac" => "audio/flac",
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        _ => "application/octet-stream",
    }
}
async fn stream(RoutePath(id): RoutePath<String>, method: Method, headers: HeaderMap) -> Response {
    let failure = |status| {
        Response::builder()
            .status(status)
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "no-store")
            .body(Body::empty())
            .unwrap()
    };
    let Some(port) = BROKER.get() else {
        return failure(StatusCode::SERVICE_UNAVAILABLE);
    };
    if headers.get("host").and_then(|v| v.to_str().ok())
        != Some(format!("127.0.0.1:{port}").as_str())
    {
        return failure(StatusCode::FORBIDDEN);
    }
    let entry = ASSETS
        .get()
        .and_then(|m| m.lock().ok())
        .and_then(|mut map| {
            map.get_mut(&id).map(|a| {
                a.touched = Instant::now();
                (a.path.clone(), a.lease.clone())
            })
        });
    let Some((path, lease)) = entry else {
        return failure(StatusCode::NOT_FOUND);
    };
    if lease.check().is_err() {
        return failure(StatusCode::UNAUTHORIZED);
    }
    let Ok(permit) = STREAMS
        .get_or_init(|| Arc::new(tokio::sync::Semaphore::new(8)))
        .clone()
        .try_acquire_owned()
    else {
        return failure(StatusCode::SERVICE_UNAVAILABLE);
    };
    let range = headers
        .get("range")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let source = request(
        &path,
        FileRequest::Content {
            path: path.path.clone(),
            range,
        },
    )
    .await;
    let source = match source {
        Ok(source) => source,
        Err(error) => {
            return failure(if error.contains("[range_not_satisfiable]") {
                StatusCode::RANGE_NOT_SATISFIABLE
            } else if error.contains("[authorization_revoked]") || error.contains("[unauthorized]")
            {
                StatusCode::UNAUTHORIZED
            } else if error.contains("[forbidden]") {
                StatusCode::FORBIDDEN
            } else if error.contains("[not_found]") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::BAD_GATEWAY
            });
        }
    };
    let mut response = Response::builder()
        .status(source.response.status())
        .header("Content-Type", mime(&path.path))
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .header("Cache-Control", "no-store")
        .header("Access-Control-Allow-Origin", "*");
    response = response.header(
        "Access-Control-Expose-Headers",
        "Content-Range, Accept-Ranges, ETag, Last-Modified",
    );
    for key in [
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
    ] {
        if let Some(value) = source.response.headers().get(key) {
            response = response.header(key, value);
        }
    }
    if mime(&path.path) == "application/octet-stream" {
        response = response.header("Content-Disposition", "attachment");
    }
    if method == Method::HEAD {
        return response.body(Body::empty()).unwrap();
    }
    let body = futures_util::stream::try_unfold(
        (source, lease, permit),
        |(mut source, lease, permit)| async move {
            lease.check().map_err(std::io::Error::other)?;
            match source.chunk().await.map_err(std::io::Error::other)? {
                Some(bytes) => Ok::<_, std::io::Error>(Some((bytes, (source, lease, permit)))),
                None => Ok(None),
            }
        },
    );
    response.body(Body::from_stream(body)).unwrap()
}
