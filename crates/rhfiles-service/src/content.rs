//! Native version-bound reads use one captured handle, not a path stat followed
//! by a second open. WebDAV remains compatible; native range clients opt in.
use crate::{auth::Access, model::*, storage::Storage};
use axum::{
    body::{Body, Bytes},
    http::{Request, StatusCode},
    response::{IntoResponse, Response},
};
use sha2::{Digest, Sha256};
use std::{io::SeekFrom, sync::Arc};
use tokio::io::{AsyncReadExt, AsyncSeekExt};

pub const SEGMENT_SIZE: usize = 8 * 1024 * 1024;
static READS: std::sync::LazyLock<tokio::sync::Semaphore> =
    std::sync::LazyLock::new(|| tokio::sync::Semaphore::new(8));

/// Read-only generation includes OS change time. Mutation revisions deliberately
/// exclude it (capture-by-rename changes it); range repair must not reuse that
/// weaker stamp after an in-place edit which restored the old mtime.
pub(crate) fn read_revision(file: &std::fs::File) -> Result<String> {
    let identity = crate::connection::file_revision(file)
        .map_err(|_| Error::new("io_error", "无法核对源文件身份"))?;
    #[cfg(windows)]
    let changed = {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Storage::FileSystem::{
            FILE_BASIC_INFO, FileBasicInfo, GetFileInformationByHandleEx,
        };
        let mut info: FILE_BASIC_INFO = unsafe { std::mem::zeroed() };
        if unsafe {
            GetFileInformationByHandleEx(
                file.as_raw_handle(),
                FileBasicInfo,
                &mut info as *mut _ as *mut _,
                std::mem::size_of::<FILE_BASIC_INFO>() as u32,
            )
        } == 0
        {
            return Err(std::io::Error::last_os_error().into());
        }
        if info.ChangeTime == 0 {
            return Err(Error::new("unsupported", "文件系统未提供读取变更时间"));
        }
        format!("{}", info.ChangeTime)
    };
    #[cfg(unix)]
    let changed = {
        use std::os::unix::fs::MetadataExt;
        let meta = file.metadata()?;
        format!("{}:{}", meta.ctime(), meta.ctime_nsec())
    };
    #[cfg(not(any(windows, unix)))]
    return Err(Error::new(
        "unsupported",
        "此平台尚不能提供可靠的源文件读取版本",
    ));
    Ok(format!(
        "read1-{:x}",
        Sha256::digest(format!("{identity}:{changed}").as_bytes())
    ))
}

pub(crate) fn authorized_revision(access: &Access, file: &std::fs::File) -> Result<String> {
    access.check(false, false)?;
    let (groups, group, peer, _, _) = access
        .group
        .as_ref()
        .ok_or_else(|| Error::new("unauthorized", "分段下载必须来自有效设备组"))?;
    let revision = read_revision(file)?;
    let grant = groups.transfer_binding(group, peer)?;
    Ok(format!(
        "read1-{:x}",
        Sha256::digest(format!("{revision}:{grant}").as_bytes())
    ))
}

fn interval(value: Option<&str>, size: u64) -> Option<(u64, u64)> {
    let Some(value) = value else {
        return Some((0, size));
    };
    let (start, end) = value.strip_prefix("bytes=")?.split_once('-')?;
    let start = start.parse::<u64>().ok()?;
    let end = end.parse::<u64>().ok()?;
    (start <= end && end < size).then(|| (start, end - start + 1))
}

pub(crate) async fn response(
    storage: Arc<Storage>,
    access: Access,
    request: Request<Body>,
    path: String,
    revision: String,
) -> Result<Response> {
    if revision.is_empty()
        || revision.len() > 256
        || !revision
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err(Error::new("invalid_request", "文件版本无效"));
    }
    access.check(false, false)?;
    let expected = revision.clone();
    let node = storage.node(&path)?;
    let initial_access = access.clone();
    let file = tokio::task::spawn_blocking(move || -> Result<std::fs::File> {
        let file = node.open_read()?;
        if authorized_revision(&initial_access, &file)? != expected {
            return Err(Error::new(
                "precondition_failed",
                "源文件版本已变化，未混用分段",
            ));
        }
        Ok(file)
    })
    .await
    .map_err(|_| Error::new("internal", "无法打开源文件"))??;
    let size = file.metadata()?.len();
    let etag = format!("\"{revision}\"");
    if request
        .headers()
        .get("If-Match")
        .and_then(|v| v.to_str().ok())
        != Some(etag.as_str())
    {
        return Err(Error::new("precondition_failed", "缺少匹配的源文件版本"));
    }
    let range = request.headers().get("Range").and_then(|v| v.to_str().ok());
    let Some((start, length)) = interval(range, size) else {
        return Ok((
            StatusCode::RANGE_NOT_SATISFIABLE,
            [("Content-Range", format!("bytes */{size}"))],
        )
            .into_response());
    };
    // A native segment has a digest of the actual bytes returned, not a second
    // read of the pathname. Small bounded buffers permit selective repair.
    let mut chunk_hash = None;
    let body = if range.is_some() && request.method() != axum::http::Method::HEAD {
        if length > SEGMENT_SIZE as u64 {
            return Err(Error::new("too_large", "原生下载分段不能超过 8 MiB"));
        }
        let permit = READS
            .acquire()
            .await
            .map_err(|_| Error::new("busy", "分段读取队列已停止"))?;
        let expected = revision.clone();
        let checked = access.clone();
        let mut file = tokio::fs::File::from_std(file);
        file.seek(SeekFrom::Start(start)).await?;
        let mut data = vec![0; length as usize];
        for piece in data.chunks_mut(256 * 1024) {
            access.check(false, false)?;
            file.read_exact(piece).await?;
        }
        let file = file.into_std().await;
        let data = Bytes::from(data);
        let hashed = data.clone();
        let hash = tokio::task::spawn_blocking(move || -> Result<String> {
            checked.check(false, false)?;
            if authorized_revision(&checked, &file)? != expected
                || authorized_revision(&checked, &storage.node(&path)?.open_read()?)? != expected
            {
                return Err(Error::new("precondition_failed", "源文件版本已变化"));
            }
            Ok(format!("{:x}", Sha256::digest(&hashed)))
        })
        .await
        .map_err(|_| Error::new("internal", "分段校验失败"))??;
        chunk_hash = Some(
            hash.parse()
                .map_err(|_| Error::new("internal", "分段校验头无效"))?,
        );
        Body::from_stream(futures_util::stream::try_unfold(
            (data, 0usize, access, permit),
            |(data, offset, access, permit)| async move {
                access.check(false, false).map_err(std::io::Error::other)?;
                if offset == data.len() {
                    return Ok::<_, std::io::Error>(None);
                }
                let end = (offset + 256 * 1024).min(data.len());
                Ok(Some((data.slice(offset..end), (data, end, access, permit))))
            },
        ))
    } else {
        let proof = file.try_clone()?;
        let mut file = tokio::fs::File::from_std(file);
        file.seek(SeekFrom::Start(start)).await?;
        let is_head = request.method() == axum::http::Method::HEAD;
        if is_head {
            Body::empty()
        } else {
            Body::from_stream(futures_util::stream::try_unfold(
                (file, proof, length, access, revision, storage, path),
                |(mut file, proof, left, access, revision, storage, path)| async move {
                    access.check(false, false).map_err(std::io::Error::other)?;
                    if left == 0 {
                        return Ok::<_, std::io::Error>(None);
                    }
                    let mut data = vec![0; left.min(256 * 1024) as usize];
                    let n = file.read(&mut data).await?;
                    if n == 0 {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::UnexpectedEof,
                            "source changed",
                        ));
                    }
                    access.check(false, false).map_err(std::io::Error::other)?;
                    let left = left - n as u64;
                    if left == 0 {
                        // Also check the pathname: moving/recreating it cannot
                        // silently splice an old captured object into new ranges.
                        let checked = access.clone();
                        let (proof, storage, path, revision) =
                            tokio::task::spawn_blocking(move || {
                                let actual = authorized_revision(&checked, &proof)
                                    .map_err(std::io::Error::other)?;
                                let current = storage
                                    .node(&path)
                                    .and_then(|node| node.open_read())
                                    .and_then(|file| authorized_revision(&checked, &file))
                                    .map_err(std::io::Error::other)?;
                                if actual != revision || current != revision {
                                    return Err(std::io::Error::other("source version changed"));
                                }
                                Ok((proof, storage, path, revision))
                            })
                            .await
                            .map_err(std::io::Error::other)??;
                        data.truncate(n);
                        return Ok(Some((
                            Bytes::from(data),
                            (file, proof, left, access, revision, storage, path),
                        )));
                    }
                    data.truncate(n);
                    Ok(Some((
                        Bytes::from(data),
                        (file, proof, left, access, revision, storage, path),
                    )))
                },
            ))
        }
    };
    let mut response = Response::new(body);
    *response.status_mut() = if range.is_some() {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    for (key, value) in [
        ("Content-Length", length.to_string()),
        ("ETag", etag),
        ("Accept-Ranges", "bytes".into()),
        ("Cache-Control", "no-store".into()),
        ("Content-Type", "application/octet-stream".into()),
    ] {
        response.headers_mut().insert(
            key,
            value
                .parse()
                .map_err(|_| Error::new("internal", "响应头无效"))?,
        );
    }
    if range.is_some() {
        response.headers_mut().insert(
            "Content-Range",
            format!("bytes {start}-{}/{size}", start + length - 1)
                .parse()
                .unwrap(),
        );
    }
    if let Some(hash) = chunk_hash.take() {
        response
            .headers_mut()
            .insert("X-RHFiles-Chunk-SHA256", hash);
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_exact_in_bounds_intervals_are_accepted() {
        assert_eq!(interval(None, 0), Some((0, 0)));
        assert_eq!(interval(Some("bytes=0-0"), 1), Some((0, 1)));
        assert_eq!(interval(Some("bytes=2-9"), 10), Some((2, 8)));
        for value in [
            "bytes=0-",
            "bytes=-1",
            "bytes=9-8",
            "bytes=0-10",
            "bytes=0-1,3-4",
            "bytes=0-18446744073709551615",
        ] {
            assert_eq!(interval(Some(value), 10), None, "{value}");
        }
        assert_eq!(interval(Some("bytes=0-0"), 0), None);
    }
}
