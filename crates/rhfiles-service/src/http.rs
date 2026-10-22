use crate::locks::Locks;
use crate::{
    auth::{Access, Auth},
    dav::DavFs,
    model::*,
    storage::Storage,
    uploads::{MAX_UPLOAD, Uploads},
};
use axum::{
    Json,
    body::{Body, to_bytes},
    extract::{Request, State as AxumState},
    http::{HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
};
use base64::Engine;
use dav_server::{DavHandler, davpath::DavPath, ls::DavLockSystem};
use futures_util::StreamExt;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

type Cached = HashMap<String, (Instant, String, Arc<Vec<Entry>>)>;
pub struct State {
    pub auth: Auth,
    pub uploads: Uploads,
    pub storage: Arc<Storage>,
    dav: DavHandler<Access>,
    locks: Box<Locks>,
    mutations: tokio::sync::RwLock<()>,
    requests: Arc<tokio::sync::Semaphore>,
    thumbnails: Arc<tokio::sync::Semaphore>,
    cache: Mutex<Cached>,
}
impl State {
    pub fn new(data: &Path, storage: Arc<Storage>) -> Result<Self> {
        let uploads = Uploads::new(data)?;
        uploads.reap(&storage);
        let locks = Locks::new();
        let dav = DavHandler::builder()
            .strip_prefix("/dav")
            .filesystem(Box::new(DavFs {
                storage: storage.clone(),
            }))
            .locksystem(locks.clone())
            .build_handler();
        Ok(Self {
            auth: Auth::new(data)?,
            uploads,
            storage,
            dav,
            locks,
            mutations: tokio::sync::RwLock::new(()),
            requests: Arc::new(tokio::sync::Semaphore::new(64)),
            thumbnails: Arc::new(tokio::sync::Semaphore::new(3)),
            cache: Mutex::new(HashMap::new()),
        })
    }
    async fn unlocked(&self, path: &str, a: &Access) -> Result<()> {
        let encoded = encode_path(path);
        let path = DavPath::new(&encoded).map_err(|_| Error::new("invalid_path", "无效路径"))?;
        self.locks
            .check(&path, Some(&a.id), false, true, &[])
            .await
            .map_err(|_| Error::new("locked", "文件被 WebDAV 客户端锁定，请先解锁"))
    }
    fn invalidate(&self) {
        self.cache.lock().unwrap().clear();
    }
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let status = match self.code {
            "unauthorized" => 401,
            "forbidden" | "invalid_path" => 403,
            "not_found" => 404,
            "conflict" | "offset_mismatch" => 409,
            "locked" => 423,
            "too_large" => 413,
            "expired" => 410,
            "busy" => 429,
            "timeout" => 408,
            "invalid_request" => 400,
            "unsupported" => 501,
            _ => 500,
        };
        let mut response = (
            StatusCode::from_u16(status).unwrap(),
            Json(serde_json::json!({"error":{"code":self.code,"message":self.message}})),
        )
            .into_response();
        if status == 401 {
            response.headers_mut().insert(
                "WWW-Authenticate",
                HeaderValue::from_static("Basic realm=\"RHFiles\", charset=\"UTF-8\""),
            );
        }
        response
    }
}
fn encode_path(path: &str) -> String {
    path.split('/')
        .map(|s| {
            percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC).to_string()
        })
        .collect::<Vec<_>>()
        .join("/")
}
fn bad(message: &str) -> Error {
    Error::new("invalid_request", message)
}
fn query<T: serde::de::DeserializeOwned>(request: &Request) -> Result<T> {
    axum::extract::Query::<T>::try_from_uri(request.uri())
        .map(|q| q.0)
        .map_err(|_| bad("参数无效"))
}
async fn json<T: serde::de::DeserializeOwned>(request: Request) -> Result<T> {
    let bytes = tokio::time::timeout(
        Duration::from_secs(15),
        to_bytes(request.into_body(), 16384),
    )
    .await
    .map_err(|_| Error::new("timeout", "请求正文超时"))?
    .map_err(|_| bad("请求过大或不完整"))?;
    serde_json::from_slice(&bytes).map_err(|_| bad("JSON 参数无效"))
}
fn header<'a>(request: &'a Request, name: &str) -> Option<&'a str> {
    request.headers().get(name).and_then(|v| v.to_str().ok())
}
fn number(request: &Request, name: &str) -> Result<u64> {
    header(request, name)
        .ok_or_else(|| bad("缺少上传长度或偏移"))?
        .parse()
        .map_err(|_| bad("无效上传长度或偏移"))
}
fn tus(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert("Tus-Resumable", HeaderValue::from_static("1.0.0"));
    response
        .headers_mut()
        .insert("Cache-Control", HeaderValue::from_static("no-store"));
    response
}
fn idle_limited(body: Body) -> Body {
    Body::from_stream(futures_util::stream::unfold(
        Some(body.into_data_stream()),
        |state| async move {
            let mut stream = state?;
            match tokio::time::timeout(Duration::from_secs(45), stream.next()).await {
                Ok(Some(Ok(bytes))) => Some((Ok(bytes), Some(stream))),
                Ok(Some(Err(error))) => Some((Err(std::io::Error::other(error)), None)),
                Ok(None) => None,
                Err(_) => Some((
                    Err(std::io::Error::new(
                        std::io::ErrorKind::TimedOut,
                        "upload idle timeout",
                    )),
                    None,
                )),
            }
        },
    ))
}

pub async fn dispatch(AxumState(state): AxumState<Arc<State>>, request: Request) -> Response {
    if let Some(peer) = request
        .extensions()
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
    {
        let local = match peer.0.ip() {
            std::net::IpAddr::V4(ip) => ip.is_loopback() || ip.is_private() || ip.is_link_local(),
            std::net::IpAddr::V6(ip) => {
                ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local()
            }
        };
        if !local {
            return Error::new("forbidden", "仅接受本机或局域网连接").into_response();
        }
    } else {
        return Error::new("forbidden", "缺少连接来源").into_response();
    }
    let permit = match state.requests.clone().try_acquire_owned() {
        Ok(p) => p,
        Err(_) => return Error::new("busy", "连接过多，请稍后重试").into_response(),
    };
    let upload = request.uri().path().starts_with("/api/v1/uploads");
    let mut response = match handle(state, request).await {
        Ok(r) => r,
        Err(e) => e.into_response(),
    };
    if upload {
        response = tus(response);
    }
    response.headers_mut().insert(
        "X-Content-Type-Options",
        HeaderValue::from_static("nosniff"),
    );
    response
        .headers_mut()
        .insert("Referrer-Policy", HeaderValue::from_static("no-referrer"));
    response
        .headers_mut()
        .insert("Cache-Control", HeaderValue::from_static("no-store"));
    // Hold the request permit until a streamed download finishes, not merely
    // until its headers are emitted. Credentials are never accepted in URLs.
    let (parts, body) = response.into_parts();
    let mut stream = body.into_data_stream();
    let guarded = async_stream_body(permit, &mut stream);
    Response::from_parts(parts, guarded)
}
fn async_stream_body(
    permit: tokio::sync::OwnedSemaphorePermit,
    stream: &mut axum::body::BodyDataStream,
) -> Body {
    // Move the stream out so the response owns both stream and permit.
    let stream = std::mem::replace(stream, Body::empty().into_data_stream());
    Body::from_stream(futures_util::stream::unfold(
        (stream, permit),
        |(mut stream, permit)| async move { stream.next().await.map(|item| (item, (stream, permit))) },
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PairRequest {
    code: String,
    name: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PathQuery {
    path: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ListQuery {
    #[serde(default = "root")]
    path: String,
    #[serde(default)]
    offset: usize,
    #[serde(default = "limit")]
    limit: usize,
    revision: Option<String>,
}
fn root() -> String {
    "/".into()
}
fn limit() -> usize {
    200
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Mutation {
    path: String,
    destination: Option<String>,
}

async fn handle(s: Arc<State>, mut r: Request) -> Result<Response> {
    let path = r.uri().path().to_owned();
    let method = r.method().clone();
    // Refuse browser cross-origin writes, including Basic-authenticated ones.
    // Native clients and normal WebDAV clients omit Origin. There is no CORS.
    if r.headers().contains_key("Origin") {
        return Err(Error::new("forbidden", "不接受跨站请求"));
    }
    if path == "/api/v1/pair" && method == Method::POST {
        let p: PairRequest = json(r).await?;
        return Ok(Json(s.auth.pair(&p.code, &p.name)?).into_response());
    }
    let a = s
        .auth
        .authenticate(header(&r, "Authorization"), method.as_str())?;
    let writing = !matches!(method, Method::GET | Method::HEAD | Method::OPTIONS)
        && method.as_str() != "PROPFIND";
    let locking = matches!(method.as_str(), "LOCK" | "UNLOCK");
    let _exclusive = if locking {
        Some(s.mutations.write().await)
    } else {
        None
    };
    let _mutation = if writing && !locking {
        Some(s.mutations.read().await)
    } else {
        None
    };
    if writing {
        s.invalidate();
    }
    if path == "/dav" || path.starts_with("/dav/") {
        let raw = path.strip_prefix("/dav").unwrap();
        let raw = if raw.is_empty() { "/" } else { raw };
        let decoded = percent_encoding::percent_decode_str(raw)
            .decode_utf8()
            .map_err(|_| Error::new("invalid_path", "路径不是 UTF-8"))?;
        crate::storage::components(&decoded)?;
        if decoded.contains("//")
            || raw.to_ascii_lowercase().contains("%2f")
            || raw.to_ascii_lowercase().contains("%5c")
        {
            return Err(Error::new("invalid_path", "不接受路径分隔符别名"));
        }
        if method == Method::DELETE {
            a.check(false, true)?;
            s.storage.node(&decoded)?.require_child()?;
        } else if writing {
            a.check(true, false)?;
        }
        if method.as_str() == "MOVE" {
            s.storage.node(&decoded)?.require_child()?;
        }
        // Infinity PROPFIND is unbounded; clients can enumerate one level at a
        // time. PUT is streamed by dav-server and staged atomically by DavFs.
        if method.as_str() == "PROPFIND"
            && header(&r, "Depth").unwrap_or("infinity") != "0"
            && header(&r, "Depth") != Some("1")
        {
            return Err(bad("PROPFIND 仅支持 Depth 0 或 1"));
        }
        if matches!(method.as_str(), "PROPFIND" | "PROPPATCH" | "LOCK") {
            let (parts, body) = r.into_parts();
            let bytes = tokio::time::timeout(Duration::from_secs(15), to_bytes(body, 65536))
                .await
                .map_err(|_| Error::new("timeout", "WebDAV 请求正文超时"))?
                .map_err(|_| bad("WebDAV XML 请求过大"))?;
            r = Request::from_parts(parts, Body::from(bytes));
        }
        if matches!(method.as_str(), "COPY" | "MOVE") {
            let destination = header(&r, "Destination")
                .ok_or_else(|| bad("缺少目标路径"))?
                .parse::<axum::http::Uri>()
                .map_err(|_| bad("目标地址无效"))?;
            if destination.authority().is_some()
                && destination.authority().map(|a| a.as_str()) != header(&r, "Host")
            {
                return Err(Error::new("forbidden", "不允许跨服务器目标地址"));
            }
            let target = destination
                .path()
                .strip_prefix("/dav/")
                .map(|v| format!("/{v}"))
                .ok_or_else(|| Error::new("invalid_path", "目标必须位于 WebDAV 共享内"))?;
            let target = percent_encoding::percent_decode_str(&target)
                .decode_utf8()
                .map_err(|_| Error::new("invalid_path", "目标路径不是 UTF-8"))?;
            if destination.path().to_ascii_lowercase().contains("%2f")
                || destination.path().to_ascii_lowercase().contains("%5c")
            {
                return Err(Error::new("invalid_path", "不接受目标路径分隔符别名"));
            }
            s.storage.node(&target)?.require_child()?;
            let source_key = crate::locks::resource_key(&decoded);
            let target_key = crate::locks::resource_key(&target);
            if s.storage.stat(&decoded)?.is_dir
                && (target_key == source_key || target_key.starts_with(&format!("{source_key}/")))
            {
                return Err(Error::new(
                    "forbidden",
                    "不能把文件夹复制或移动到自身或其子目录",
                ));
            }
            // Overwrite:F is unconditional in v1, even if a third-party client
            // sends Overwrite:T. The filesystem additionally enforces it.
            r.headers_mut()
                .insert("Overwrite", HeaderValue::from_static("F"));
        }
        if method == Method::PUT {
            if header(&r, "Content-Length")
                .and_then(|v| v.parse::<u64>().ok())
                .is_some_and(|n| n > MAX_UPLOAD)
            {
                return Err(Error::new("too_large", "文件超过上传上限"));
            }
            let (parts, body) = r.into_parts();
            r = Request::from_parts(parts, idle_limited(body));
        }
        let principal = a.id.clone();
        let response = s.dav.handle_guarded(r, principal, a).await;
        return Ok(response.map(Body::new));
    }
    match (method.as_str(),path.as_str()) {
        ("GET","/api/v1/capabilities")=>Ok(Json(serde_json::json!({"protocol":1,"name":"RHFiles","permissions":a.permissions,"features":["list","stat","range","mkdir","rename","delete","tus","webdav","image-thumbnails"],"overwrite":false,"webdav":"/dav/","uploads":"/api/v1/uploads","maxUpload":MAX_UPLOAD})).into_response()),
        ("GET","/api/v1/list")=>{
            let q:ListQuery=query(&r)?;if q.limit==0||q.limit>2000{return Err(bad("limit 必须在 1–2000 之间"));}
            let cached=s.cache.lock().unwrap().get(&q.path).filter(|c|c.0.elapsed()<Duration::from_secs(2)).cloned();
            let (_,revision,entries)=if let Some(c)=cached{c}else{
                let storage=s.storage.clone();let path=q.path.clone();let entries=tokio::task::spawn_blocking(move||storage.list(&path)).await.map_err(|_|Error::new("internal","读取目录失败"))??;
                a.check(false,false)?;
                let revision=format!("{:x}",Sha256::digest(serde_json::to_vec(&entries).unwrap()));let c=(Instant::now(),revision,Arc::new(entries));
                let mut cache=s.cache.lock().unwrap();let bytes=|entries:&Vec<Entry>|entries.iter().map(|e|e.path.len()+e.name.len()+e.revision.len()+128).sum::<usize>();
                if cache.len()>=64||cache.values().map(|v|bytes(&v.2)).sum::<usize>()+bytes(&c.2)>64*1024*1024{cache.clear();}cache.insert(q.path.clone(),c.clone());c
            };
            if q.revision.is_some_and(|v|v!=revision){return Err(Error::new("conflict","目录已变化，请从第一页重新读取"));}
            let total=entries.len();let entries=entries.iter().skip(q.offset).take(q.limit).cloned().collect();a.check(false,false)?;Ok(Json(Listing{path:q.path,offset:q.offset,total,revision,entries}).into_response())
        },
        ("GET","/api/v1/stat")=>{let q:PathQuery=query(&r)?;Ok(Json(s.storage.stat(&q.path)?).into_response())},
        ("GET"|"HEAD","/api/v1/content")=>{
            let q:PathQuery=query(&r)?;s.storage.node(&q.path)?.open_read()?;
            *r.uri_mut()=format!("/dav{}",encode_path(&q.path)).parse().map_err(|_|bad("路径无效"))?;
            let principal=a.id.clone();Ok(s.dav.handle_guarded(r,principal,a).await.map(Body::new))
        },
        ("GET","/api/v1/thumbnail")=>{
            let _permit=tokio::time::timeout(Duration::from_secs(10),s.thumbnails.clone().acquire_owned()).await.map_err(|_|Error::new("busy","缩略图队列繁忙，请稍后重试"))?.map_err(|_|Error::new("busy","服务正在停止"))?;
            let q:PathQuery=query(&r)?;let node=s.storage.node(&q.path)?;
            let bytes=tokio::task::spawn_blocking(move||->Result<Vec<u8>>{
                let file=node.open_read()?;if file.metadata()?.len()>32*1024*1024{return Err(Error::new("too_large","图片过大，请直接预览"));}
                let mut reader=image::ImageReader::new(std::io::BufReader::new(file)).with_guessed_format()?;
                let mut limits=image::Limits::default();limits.max_alloc=Some(64*1024*1024);limits.max_image_width=Some(32768);limits.max_image_height=Some(32768);reader.limits(limits);
                let image=reader.decode().map_err(|_|Error::new("unsupported","暂不支持此图片缩略图"))?.thumbnail(320,320);
                let mut output=std::io::Cursor::new(Vec::new());image.write_to(&mut output,image::ImageFormat::Png).map_err(|_|Error::new("internal","缩略图生成失败"))?;Ok(output.into_inner())
            }).await.map_err(|_|Error::new("internal","缩略图生成失败"))??;
            a.check(false,false)?;Ok(([("Content-Type","image/png")],bytes).into_response())
        },
        ("POST","/api/v1/mkdir"|"/api/v1/rename"|"/api/v1/copy"|"/api/v1/delete")=>{
            let m:Mutation=json(r).await?;let deleting=path.ends_with("/delete");a.check(!deleting,deleting)?;s.unlocked(&m.path,&a).await?;
            if let Some(to)=&m.destination{s.unlocked(to,&a).await?;}
            let storage=s.storage.clone();tokio::task::spawn_blocking(move||->Result<()>{a.check(!deleting,deleting)?;match path.as_str(){"/api/v1/mkdir"=>storage.mkdir(&m.path),"/api/v1/rename"=>storage.rename(&m.path,m.destination.as_deref().ok_or_else(||bad("缺少目标路径"))?),"/api/v1/copy"=>storage.copy_file(&m.path,m.destination.as_deref().ok_or_else(||bad("缺少目标路径"))?,||a.check(true,false)),_=>{let entry=storage.stat(&m.path)?;storage.remove(&m.path,entry.is_dir)}}}).await.map_err(|_|Error::new("internal","文件操作失败"))??;
            Ok(StatusCode::NO_CONTENT.into_response())
        },
        ("OPTIONS","/api/v1/uploads")=>Ok((StatusCode::NO_CONTENT,[("Tus-Version","1.0.0"),("Tus-Extension","creation,termination"),("Tus-Max-Size","1099511627776")]).into_response()),
        ("POST","/api/v1/uploads")=>{
            if header(&r,"Tus-Resumable")!=Some("1.0.0"){return Ok(StatusCode::PRECONDITION_FAILED.into_response());}
            let length=number(&r,"Upload-Length")?;
            let metadata=header(&r,"Upload-Metadata").ok_or_else(||bad("缺少 path 上传元数据"))?;
            let encoded=metadata.split(',').find_map(|v|v.trim().strip_prefix("path ")).ok_or_else(||bad("缺少 path 上传元数据"))?;
            let target=String::from_utf8(base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|_|bad("无效 path 编码"))?).map_err(|_|bad("path 必须是 UTF-8"))?;
            s.unlocked(&target,&a).await?;let u=s.uploads.create(&s.storage,&a,target,length)?;
            Ok((StatusCode::CREATED,[("Location",format!("/api/v1/uploads/{}",u.id)),("Upload-Offset","0".into())]).into_response())
        },
        ("HEAD"|"PATCH"|"DELETE",_)if path.starts_with("/api/v1/uploads/")=>{
            if header(&r,"Tus-Resumable")!=Some("1.0.0"){return Ok(StatusCode::PRECONDITION_FAILED.into_response());}
            let id=path.strip_prefix("/api/v1/uploads/").unwrap();let upload=s.uploads.get(id)?;let mut u=upload.lock().await;
            if method==Method::DELETE{s.uploads.cancel(&s.storage,&a,&u)?;return Ok(StatusCode::NO_CONTENT.into_response());}
            s.uploads.authorize(&u,&a)?;
            if method==Method::HEAD{let offset=s.uploads.offset(&s.storage,&u)?;return Ok((StatusCode::OK,[("Upload-Length",u.length.to_string()),("Upload-Offset",offset.to_string())]).into_response());}
            s.unlocked(&u.path,&a).await?;
            if header(&r,"Content-Type")!=Some("application/offset+octet-stream"){return Ok(StatusCode::UNSUPPORTED_MEDIA_TYPE.into_response());}
            let offset=number(&r,"Upload-Offset")?;let actual=s.uploads.offset(&s.storage,&u)?;
            if actual!=offset{return Ok((StatusCode::CONFLICT,[("Upload-Offset",actual.to_string())]).into_response());}
            let offset=s.uploads.append(&s.storage,&a,&mut u,offset,r.into_body()).await?;s.invalidate();Ok((StatusCode::NO_CONTENT,[("Upload-Offset",offset.to_string())]).into_response())
        },
        _=>Err(Error::new("not_found","接口不存在")),
    }
}
