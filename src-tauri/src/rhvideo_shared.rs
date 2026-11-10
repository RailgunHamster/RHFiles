//! Adapter for the canonical RHVideo frontend. No UI/queue/favorite logic here.
use super::*;

fn operation(method: &str, raw: &str) -> Result<(reqwest::Method, String), String> {
    if raw.len() > 8192
        || !raw.starts_with('/')
        || raw.starts_with("//")
        || raw.chars().any(|c| c.is_control() || c == '\\' || c == '#')
    {
        return Err("媒体接口路径无效".into());
    }
    let (path, _) = raw.split_once('?').unwrap_or((raw, ""));
    let decoded = percent_encoding::percent_decode_str(path)
        .decode_utf8()
        .map_err(|_| "媒体接口编码无效")?;
    if decoded.contains('%') || decoded.split('/').any(|s| s == "." || s == "..") {
        return Err("媒体接口路径无效".into());
    }
    if method == "GET" && path == "/openapi.json" {
        return Ok((reqwest::Method::GET, raw.trim_start_matches('/').into()));
    }
    // Authentication and media streaming have separate, narrower adapters.
    if path.starts_with("/api/v1/auth/") && path != "/api/v1/auth/me" {
        return Err("请使用受保护的登录接口".into());
    }
    let manifest: Value = serde_json::from_str(include_str!(
        "../../src/vendor/rhvideo/frontend/static/operation-contract.json"
    ))
    .map_err(|_| "前端接口清单无效")?;
    let admitted = manifest["business_operations"]
        .as_array()
        .ok_or("前端接口清单无效")?
        .iter()
        .any(|entry| {
            let Some((verb, pattern)) = entry["id"].as_str().and_then(|s| s.split_once(' ')) else {
                return false;
            };
            if verb != method || !pattern.starts_with("/api/v1/") {
                return false;
            }
            let a: Vec<_> = pattern.split('/').collect();
            let b: Vec<_> = path.split('/').collect();
            a.len() == b.len()
                && a.iter().zip(&b).all(|(a, b)| {
                    if a.starts_with('{') && a.ends_with('}') {
                        !b.is_empty() && !b.contains('%')
                    } else {
                        a == b
                    }
                })
        });
    if !admitted {
        return Err("接口未包含在共享前端契约中".into());
    }
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "媒体接口方法无效")?;
    Ok((method, raw.trim_start_matches('/').into()))
}

pub(super) fn media_path(raw: &str) -> Result<(String, bool), String> {
    if raw.starts_with("api/v1/videos/") {
        let (path, query) = raw.split_once('?').unwrap_or((raw, ""));
        if let Some(id) = path
            .strip_prefix("api/v1/videos/")
            .and_then(|s| s.strip_suffix("/play"))
        {
            identifier(id)?;
            if !["", "super=true", "quality=lowest"].contains(&query) {
                return Err("视频参数无效".into());
            }
            return Ok((raw.into(), false));
        }
    }
    Ok((safe_image_path(raw)?, true))
}

pub(super) async fn stream(
    Path((cap, raw)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    let failure = || {
        Response::builder()
            .status(StatusCode::FORBIDDEN)
            .body(Body::empty())
            .unwrap()
    };
    let Ok(session) = current() else {
        return failure();
    };
    if cap != session.capability {
        return failure();
    }
    let Ok((path, image)) = media_path(&raw) else {
        return failure();
    };
    let Ok(url) = session.asset(path, image) else {
        return failure();
    };
    let Some(id) = url.rsplit('/').next() else {
        return failure();
    };
    stream_asset(Path((cap, id.into())), headers).await
}

pub(super) async fn request(app: AppHandle, action: &str, args: Value) -> Result<Value, String> {
    let session = current()?;
    match action {
        "shared.state" => {
            let mut result = state();
            result["hostProtocol"] = json!(1);
            result["mediaBase"] = json!(format!(
                "http://127.0.0.1:{}/{}/shared/",
                session.port, session.capability
            ));
            result["preferences"] = native_preferences(&session, None, None)?;
            Ok(result)
        }
        "shared.request" => {
            let (method, path) = operation(text(&args, "method", 12)?, text(&args, "path", 8192)?)?;
            let body = args.get("body").filter(|v| !v.is_null());
            if body
                .is_some_and(|v| serde_json::to_vec(v).map_or(true, |v| v.len() > 20 * 1024 * 1024))
            {
                return Err("媒体接口内容超过 20 MB".into());
            }
            let mut request = session
                .client
                .request(method.clone(), session.endpoint(&path)?)
                .bearer_auth(session.access_token().await?);
            if let Some(body) = body {
                request = request.json(body);
            }
            // Never replay a write after a timeout or uncertain response.
            let mut response = request.send().await.map_err(network_error)?;
            let status = response.status().as_u16();
            if response.status() == StatusCode::UNAUTHORIZED {
                expire_login(&session);
                #[cfg(windows)]
                {
                    let generation = session.generation;
                    tauri::async_runtime::spawn_blocking(move || {
                        crate::rhvideo_player::shared_media::stop_generation(generation)
                    });
                }
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(network_error)? {
                if bytes.len() + chunk.len() > JSON_LIMIT {
                    return Err("媒体接口响应过大".into());
                }
                bytes.extend_from_slice(&chunk);
            }
            if status != 401 && current()?.generation != session.generation {
                return Err("媒体账户已改变，旧响应未交付".into());
            }
            let body = if bytes.is_empty() {
                Value::Null
            } else {
                serde_json::from_slice(&bytes).map_err(|_| "媒体接口未返回 JSON")?
            };
            if method != reqwest::Method::GET {
                *session.videos.lock().await = None;
            }
            Ok(json!({"status":status,"body":body}))
        }
        "shared.preferences" => {
            let mut value = native_preferences(&session, None, None)?;
            let entries = args
                .get("value")
                .filter(|v| v.is_object())
                .ok_or("界面偏好无效")?;
            if entries.as_object().unwrap().iter().any(|(key, value)| {
                !(key.starts_with("rhvideo_") || key.starts_with("rhvideo."))
                    || key.to_lowercase().contains("token")
                    || !value.is_string()
            }) {
                return Err("界面偏好包含受保护字段".into());
            }
            value["sharedUI"] = entries.clone();
            native_preferences(&session, Some(&value), None)
        }
        "shared.save" => {
            let document = args.get("document").ok_or("缺少配置备份")?;
            configuration::document(document)?;
            let text = serde_json::to_string_pretty(document).map_err(|_| "备份无效")?;
            #[cfg(windows)]
            {
                export_dialog_named(&app,&text,"RHVideo-configuration.json",&args,session.generation).await
            }
            #[cfg(not(windows))]
            {
                let _ = (app, text);
                Err("此平台尚未接入系统保存对话框".into())
            }
        }
        value if value.starts_with("shared.media.") => {
            #[cfg(windows)]
            {
                let url = if value == "shared.media.open" {
                    let (path, image) =
                        media_path(text(&args, "path", 8192)?.trim_start_matches('/'))?;
                    if image {
                        return Err("播放器只接受视频播放接口".into());
                    }
                    Some(session.asset(path, false)?)
                } else {
                    None
                };
                crate::rhvideo_player::shared_media::request(
                    app,
                    value,
                    args,
                    url,
                    session.generation,
                )
                .await
            }
            #[cfg(not(windows))]
            {
                let _ = app;
                Err("此平台尚未接入共享前端的原生解码器".into())
            }
        }
        _ => Err("不支持的共享前端操作".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn routes_are_method_bound_and_never_arbitrary_urls() {
        assert!(operation("GET", "/api/v1/videos?summary=true").is_ok());
        assert!(operation("PUT", "/api/v1/favorites/video/test-1").is_ok());
        for p in [
            "https://evil/api/v1/videos",
            "//evil/api/v1/videos",
            "/api/v1/../videos",
            "/api/v1/%2e%2e/videos",
            "/api/v1/auth/refresh",
            "/api/v1/videos/abc%2Fdef",
        ] {
            assert!(operation("POST", p).is_err(), "{p}");
        }
        assert!(operation("TRACE", "/api/v1/videos").is_err());
    }
    #[test]
    fn media_proxy_does_not_accept_api_writes_or_external_sources() {
        assert!(media_path("api/v1/videos/id/play?quality=lowest").is_ok());
        assert!(media_path("api/v1/videos/id/thumbnail").is_ok());
        for p in [
            "api/v1/auth/me",
            "api/v1/system/restart",
            "https://evil/movie",
            "storage/../secret",
            "api/v1/videos/id/play?url=https://evil",
        ] {
            assert!(media_path(p).is_err(), "{p}");
        }
    }
}
