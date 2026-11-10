//! Native, bounded streaming between local files and identity-bound group paths.
//! Renderer code never receives server credentials or supplies an HTTP endpoint.
use crate::types::CancelFlag;
use rhfiles_service::connection::{
    file_revision, DevicePath, Download, DownloadBlock, DownloadOptions, FileLease, FileRequest, FileResponse,
};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
#[path = "device_history.rs"]
mod history;
#[path = "device_jobs.rs"]
mod jobs;
#[path = "device_work.rs"]
mod work;

const CHUNK: usize = 1024 * 1024;
const UPLOAD_CHUNK: usize = 8 * CHUNK;
static FILE_SLOTS: std::sync::LazyLock<std::sync::Arc<tokio::sync::Semaphore>> =
    std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Semaphore::new(4)));
fn field<'a>(v: &'a Value, k: &str) -> Result<&'a str, String> {
    v[k].as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("[invalid_request] 缺少 {k}"))
}
fn random() -> Result<String, String> {
    let mut v = [0; 16];
    getrandom::fill(&mut v).map_err(|_| "随机标识生成失败")?;
    Ok(v.iter().map(|b| format!("{b:02x}")).collect())
}
#[derive(Clone, Debug)]
enum Location {
    Local(PathBuf),
    Remote(DevicePath),
}
pub(crate) fn save_path(parent:&str,name:&str)->Result<String,String>{
    crate::file_ops::validate_target_name(name)?;
    Ok(Location::parse(parent)?.child(name)?.text())
}
pub(crate) fn save_parent(path:&str)->Option<String>{Location::parse(path).ok()?.parent().ok().map(|p|p.text())}
pub(crate) fn normalize_save_path(path:&str)->Result<String,String>{Ok(Location::parse(path)?.text())}
impl Location {
    fn parse(value: &str) -> Result<Self, String> {
        if value
            .get(..15)
            .is_some_and(|s| s.eq_ignore_ascii_case("rhfiles-device:"))
        {
            return DevicePath::parse(value).map(Self::Remote);
        }
        let path = PathBuf::from(value);
        if value.contains("://")
            || !path.is_absolute()
            || value.starts_with("\\\\.\\")
            || value.starts_with("\\\\?\\")
        {
            return Err("[invalid_path] 仅支持本机绝对路径或 RHFiles 设备路径".into());
        }
        if path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err("[invalid_path] 不允许上级路径段".into());
        }
        Ok(Self::Local(path))
    }
    fn text(&self) -> String {
        match self {
            Self::Local(p) => p.to_string_lossy().into_owned(),
            Self::Remote(p) => p.uri(),
        }
    }
    fn leaf(&self) -> Result<String, String> {
        match self {
            Self::Local(p) => p.file_name().and_then(|s| s.to_str()).map(str::to_owned),
            Self::Remote(p) => p
                .path
                .rsplit('/')
                .find(|s| !s.is_empty())
                .map(str::to_owned),
        }
        .ok_or("[invalid_path] 不能传输根目录".into())
    }
    fn child(&self, name: &str) -> Result<Self, String> {
        if name.is_empty() || matches!(name, "." | "..") || name.contains(['/', '\\', '\0']) {
            return Err("[invalid_path] 文件名称无效".into());
        }
        match self {
            Self::Remote(p) => p.child(name).map(Self::Remote),
            Self::Local(p) => Ok(Self::Local(p.join(name))),
        }
    }
    fn parent(&self) -> Result<Self, String> {
        match self {
            Self::Local(p) => p
                .parent()
                .map(|p| Self::Local(p.into()))
                .ok_or("Invalid parent".into()),
            Self::Remote(p) => {
                let (parent, _) = p.path.rsplit_once('/').ok_or("Invalid parent")?;
                DevicePath::new(
                    &p.group,
                    &p.peer,
                    if parent.is_empty() { "/" } else { parent },
                )
                .map(Self::Remote)
            }
        }
    }
    fn contains(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Remote(a), Self::Remote(b)) => {
                a.group == b.group
                    && a.peer == b.peer
                    && (b.path == a.path
                        || b.path
                            .to_lowercase()
                            .starts_with(&(a.path.to_lowercase() + "/")))
            }
            (Self::Local(a), Self::Local(b)) => {
                let norm = |p: &Path| {
                    p.to_string_lossy()
                        .replace('\\', "/")
                        .trim_end_matches('/')
                        .to_lowercase()
                };
                let (a, b) = (norm(a), norm(b));
                b == a || b.starts_with(&(a + "/"))
            }
            _ => false,
        }
    }
}
#[derive(Clone, Debug)]
struct Snapshot {
    directory: bool,
    size: u64,
    revision: String,
    read_revision: Option<String>,
}
fn same_identity(a: &str, b: &str) -> bool {
    let a = a.split('-').collect::<Vec<_>>();
    let b = b.split('-').collect::<Vec<_>>();
    a.len() == 7 && b.len() == 7 && [0, 1, 2, 5, 6].iter().all(|&i| a[i] == b[i])
}
async fn request(path: &DevicePath, op: FileRequest) -> Result<FileResponse, String> {
    crate::device_groups::connector()?
        .file_request(&path.group, &path.peer, op)
        .await
}
fn local_handle(path: &Path) -> Result<std::fs::File, String> {
    let mut part = PathBuf::new();
    for component in path.components() {
        part.push(component);
        if let Ok(meta) = std::fs::symlink_metadata(&part) {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err("[unsupported] 不跟随符号链接或重解析点".into());
                }
            }
            if meta.file_type().is_symlink() {
                return Err("[unsupported] 不跟随符号链接".into());
            }
        }
    }
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options
            .custom_flags(0x02000000 | 0x00200000)
            .share_mode(1 | 4);
    }
    options.open(path).map_err(|e| {
        format!(
            "[{}] {}: {e}",
            if e.kind() == std::io::ErrorKind::NotFound {
                "not_found"
            } else {
                "io_error"
            },
            path.display()
        )
    })
}
async fn snapshot(path: &Location) -> Result<Snapshot, String> {
    match path {
        Location::Local(p) => {
            let file = local_handle(p)?;
            let meta = file.metadata().map_err(|e| e.to_string())?;
            if !meta.is_dir() && !meta.is_file() {
                return Err("[unsupported] 只传输普通文件和文件夹".into());
            }
            Ok(Snapshot {
                directory: meta.is_dir(),
                size: meta.len(),
                revision: file_revision(&file)?,
                read_revision: None,
            })
        }
        Location::Remote(p) => {
            let raw = request(
                p,
                FileRequest::Stat {
                    path: p.path.clone(),
                },
            )
            .await?
            .json(65536)
            .await?;
            Ok(Snapshot {
                directory: raw["isDir"].as_bool().ok_or("Invalid remote type")?,
                size: raw["size"].as_u64().ok_or("Invalid remote size")?,
                revision: field(&raw, "revision")?.into(),
                read_revision: raw["readRevision"].as_str().map(str::to_owned),
            })
        }
    }
}
async fn optional(path: &Location) -> Result<Option<Snapshot>, String> {
    match snapshot(path).await {
        Ok(v) => Ok(Some(v)),
        Err(e) if e.starts_with("[not_found]") => Ok(None),
        Err(e) => Err(e),
    }
}
async fn children(path: &Location) -> Result<Vec<Location>, String> {
    match path {
        Location::Remote(p) => crate::device_fs::listing_fresh(p)
            .await?
            .iter()
            .map(|v| Location::parse(field(v, "path")?))
            .collect(),
        Location::Local(p) => {
            local_handle(p)?;
            let mut out = Vec::new();
            let mut dir = tokio::fs::read_dir(p).await.map_err(|e| e.to_string())?;
            while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
                if out.len() >= 100000 {
                    return Err("[too_large] 单目录超过十万项".into());
                }
                out.push(Location::Local(entry.path()));
            }
            out.sort_by_key(Location::text);
            Ok(out)
        }
    }
}
async fn checked(
    path: &DevicePath,
    to: Option<&DevicePath>,
    revision: &str,
    target: Option<&str>,
) -> Result<(), String> {
    if to.is_some_and(|p| p.group != path.group || p.peer != path.peer) {
        return Err("[invalid_path] 设备不同".into());
    }
    request(
        path,
        FileRequest::CheckedMutation {
            path: path.path.clone(),
            destination: to.map(|p| p.path.clone()),
            revision: revision.into(),
            target_revision: target.map(str::to_owned),
        },
    )
    .await?;
    Ok(())
}
async fn require_checked(path: &DevicePath, write: bool, delete: bool) -> Result<(), String> {
    let cap = request(path, FileRequest::Capabilities)
        .await?
        .json(65536)
        .await?;
    if write && cap["permissions"]["write"] != true
        || delete && cap["permissions"]["delete"] != true
    {
        return Err("[forbidden] 设备组未授予写入或删除权限".into());
    }
    if !cap["features"]
        .as_array()
        .is_some_and(|v| v.iter().any(|v| v == "checked-mutations"))
    {
        return Err(
            "[server_upgrade_required] 对方文件服务需更新后才能安全移动或替换；未删除任何原文件"
                .into(),
        );
    }
    Ok(())
}
async fn require_recycle(path: &DevicePath) -> Result<(), String> {
    let cap = request(path, FileRequest::Capabilities).await?.json(65536).await?;
    if cap["permissions"]["delete"] != true {
        return Err("[forbidden] 设备组未授予删除权限".into());
    }
    if cap["recycleBin"] != true {
        return Err("[recycle_unavailable] 对方文件服务尚不支持回收站，请更新目标电脑的 RHFiles。文件已保留".into());
    }
    Ok(())
}
struct Progress<'a> {
    app: &'a tauri::AppHandle,
    cancel: &'a CancelFlag,
    leases: Vec<FileLease>,
    id: String,
    operation: String,
    src: String,
    dest: String,
    total: u64,
    bytes: u64,
    items: u64,
    done: u64,
    started: Instant,
    last: Instant,
    history: bool,
    exclusive_target: bool,
    history_sources: Option<std::collections::HashMap<String, String>>,
    download_options: DownloadOptions,
    shared_bytes: Option<std::sync::Arc<std::sync::atomic::AtomicU64>>,
    silent: bool,
    saving: bool,
}
impl Progress<'_> {
    fn check(&self) -> Result<(), String> {
        for lease in &self.leases {
            lease.check()?;
        }
        if self.cancel.is_cancelled(Some(&self.id))? {
            Err("Cancelled".into())
        } else {
            Ok(())
        }
    }
    fn emit(&mut self, status: &str, current: &Location, force: bool) {
        if self.silent { return; }
        if !force && self.last.elapsed() < Duration::from_millis(100) {
            return;
        }
        self.last = Instant::now();
        let elapsed = self.started.elapsed().as_secs_f64();
        let percentage = if status == "complete" {
            100.0
        } else if self.total > 0 {
            (self.bytes as f64 / self.total as f64 * 100.0).min(99.0)
        } else {
            (self.done as f64 / self.items.max(1) as f64 * 100.0).min(99.0)
        };
        let shown=if self.saving{Location::parse(&self.dest).unwrap_or_else(|_|current.clone())}else{current.clone()};
        let _=self.app.emit("op-progress",json!({"operationId":self.id,"operation":self.operation,"src":self.src,"dest":self.dest,"currentPath":shown.text(),"currentName":shown.leaf().unwrap_or_default(),"bytesTransferred":self.bytes,"totalBytes":self.total,"entriesCompleted":self.done,"totalEntries":self.items,"percentage":percentage.round() as u32,"speed":if elapsed>0.0{(self.bytes as f64/elapsed) as u64}else{0},"elapsedSeconds":elapsed,"status":status}));
    }
    fn advance(&mut self, bytes: u64) {
        self.bytes += bytes;
        if let Some(shared) = &self.shared_bytes { shared.fetch_add(bytes, std::sync::atomic::Ordering::Relaxed); }
    }
    fn fork(&self, bytes: std::sync::Arc<std::sync::atomic::AtomicU64>) -> Self {
        Self { saving:self.saving, app:self.app, cancel:self.cancel, leases:self.leases.clone(), id:self.id.clone(), operation:self.operation.clone(),
            src:self.src.clone(), dest:self.dest.clone(), total:self.total, bytes:0, items:self.items, done:0,
            started:self.started, last:self.last, history:self.history, exclusive_target:self.exclusive_target,
            history_sources:None, download_options:self.download_options, shared_bytes:Some(bytes), silent:true }
    }
}
enum Reader {
    Local(tokio::fs::File),
    Remote {
        response: FileResponse,
        pending: Vec<u8>,
        offset: usize,
    },
    Ranges { reader: Download, pending: Option<DownloadBlock>, offset: usize },
}
impl Reader {
    async fn open(path: &Location, stamp: &Snapshot, options: DownloadOptions) -> Result<Self, String> {
        match path {
            Location::Local(p) => {
                let file = local_handle(p)?;
                if file_revision(&file)? != stamp.revision {
                    return Err("[conflict] 源文件已变化".into());
                }
                Ok(Self::Local(tokio::fs::File::from_std(file)))
            }
            Location::Remote(p) => {
                let connector = crate::device_groups::connector()?;
                let cap = request(p, FileRequest::Capabilities).await?.json(65536).await?;
                if stamp.size > 0 && stamp.read_revision.is_some() && cap["features"].as_array().is_some_and(|v| v.iter().any(|f| f == "versioned-ranges-sha256")) {
                    let revision=stamp.read_revision.clone().expect("checked read revision");
                    return Ok(Self::Ranges { reader: Download::open(connector, p.clone(), stamp.size, revision, options).await?, pending: None, offset: 0 });
                }
                // Older peers retain the continuous stream path; never pretend
                // they support version-bound parallelism or selective repair.
                Ok(Self::Remote {
                response: request(
                    p,
                    FileRequest::Content {
                        path: p.path.clone(),
                        range: None,
                    },
                )
                .await?,
                pending: Vec::new(),
                offset: 0,
                })
            },
        }
    }
    async fn next(&mut self, p: &Progress<'_>) -> Result<Vec<u8>, String> {
        self.next_sized(p, CHUNK).await
    }
    async fn next_sized(&mut self, p: &Progress<'_>, limit: usize) -> Result<Vec<u8>, String> {
        p.check()?;
        match self {
            Self::Ranges { reader, pending, offset } => {
                if pending.as_ref().is_none_or(|v| *offset >= v.bytes.len()) {
                    *pending = None; // Release buffer permits before awaiting more.
                    loop {
                        p.check()?;
                        tokio::select! {
                            block = reader.next() => { *pending = block?; break; }
                            _ = tokio::time::sleep(Duration::from_millis(100)) => {}
                        }
                    }
                    *offset = 0;
                }
                let Some(block) = pending else { return Ok(Vec::new()); };
                let end = (*offset + limit).min(block.bytes.len());
                let bytes = block.bytes.slice(*offset..end).to_vec();
                *offset = end;
                Ok(bytes)
            }
            Self::Local(file) => {
                let mut data = vec![0; limit];
                let n = file.read(&mut data).await.map_err(|e| e.to_string())?;
                data.truncate(n);
                Ok(data)
            }
            Self::Remote {
                response,
                pending,
                offset,
            } => {
                if *offset >= pending.len() {
                    let read = async {
                        loop {
                            p.check()?;
                            tokio::select! {result=response.chunk()=>return result,_=tokio::time::sleep(Duration::from_millis(100))=>{}}
                        }
                    };
                    let chunk = tokio::time::timeout(Duration::from_secs(30), read)
                        .await
                        .map_err(|_| "[timed_out] 读取 30 秒没有数据，已停止，未重放")??;
                    *pending = chunk.map(|v| v.to_vec()).unwrap_or_default();
                    *offset = 0;
                    if pending.len() > 8 * CHUNK {
                        return Err("[too_large] 远端单块超过安全上限".into());
                    }
                }
                let end = (*offset + limit).min(pending.len());
                let data = pending[*offset..end].to_vec();
                *offset = end;
                Ok(data)
            }
        }
    }
    async fn upload_chunk(&mut self, p: &Progress<'_>, remaining: u64) -> Result<Vec<u8>, String> {
        // Network frames are not upload records. Coalesce tiny TLS frames into
        // one durable 8 MiB tus acknowledgement, without changing its contract.
        let capacity=remaining.min(UPLOAD_CHUNK as u64) as usize;
        let mut buffer = Vec::with_capacity(capacity);
        while buffer.len() < capacity {
            let data = self.next_sized(p, (capacity - buffer.len()).min(CHUNK)).await?;
            if data.is_empty() { break; }
            buffer.extend_from_slice(&data);
        }
        Ok(buffer)
    }
    async fn open_checked(path: &Location, stamp: &Snapshot, p: &Progress<'_>) -> Result<Self, String> {
        let opening = Self::open(path, stamp, p.download_options);
        tokio::pin!(opening);
        loop {
            p.check()?;
            tokio::select! {
                result = &mut opening => return result,
                _ = tokio::time::sleep(Duration::from_millis(100)) => {}
            }
        }
    }
}
async fn verify_source(source: &Location, stamp: &Snapshot) -> Result<(), String> {
    let current = snapshot(source).await?;
    if current.revision != stamp.revision || stamp.read_revision.is_some() && current.read_revision != stamp.read_revision {
        Err("[conflict] 传输过程中源文件已变化；未删除源文件".into())
    } else {
        Ok(())
    }
}
async fn copy_file(
    source: &Location,
    target: &Location,
    stamp: &Snapshot,
    existing: Option<&Snapshot>,
    progress: &mut Progress<'_>,
) -> Result<Option<Snapshot>, String> {
    let waiting = FILE_SLOTS.clone().acquire_owned();
    tokio::pin!(waiting);
    let _slot = loop {
        progress.check()?;
        tokio::select! {
            slot = &mut waiting => break slot.map_err(|_| "[busy] 文件传输队列已关闭")?,
            _ = tokio::time::sleep(Duration::from_millis(100)) => {}
        }
    };
    let mut input = Reader::open_checked(source, stamp, progress).await?;
    let committed;
    match target {
        Location::Local(path) => {
            let parent = path.parent().ok_or("Invalid target parent")?;
            local_handle(parent)?;
            let staged = tempfile::Builder::new()
                .prefix(&format!(".rhfiles-download-{}-", random()?))
                .tempfile_in(parent)
                .map_err(|e| e.to_string())?;
            let (file, temp) = staged.into_parts();
            let mut output = tokio::fs::File::from_std(file);
            let mut count = 0u64;
            loop {
                let data = input.next(progress).await?;
                if data.is_empty() {
                    break;
                }
                count += data.len() as u64;
                if count > stamp.size {
                    return Err("[conflict] 源文件长度已变化".into());
                }
                output.write_all(&data).await.map_err(|e| e.to_string())?;
                progress.advance(data.len() as u64);
                progress.emit("running", source, false);
            }
            if count != stamp.size {
                return Err("[response_interrupted] 文件长度不完整，未发布目标".into());
            }
            verify_source(source, stamp).await?;
            progress.check()?;
            output.sync_all().await.map_err(|e| e.to_string())?;
            let output = output.into_std().await;
            crate::file_ops::commit_remote_download(
                progress.app,
                &source.text(),
                &temp,
                path,
                existing.map(|s| s.revision.as_str()),
                &format!("remote-{}", random()?),
            )?;
            committed = Some(Snapshot {
                directory: false,
                size: count,
                revision: file_revision(&output)?,
                read_revision: None,
            });
        }
        Location::Remote(final_path) => {
            if existing.is_some() {
                require_checked(final_path, true, true).await?;
            }
            let actual = if existing.is_some() {
                match target
                    .parent()?
                    .child(&format!("RHFiles-transfer-{}.partial", random()?))?
                {
                    Location::Remote(p) => p,
                    _ => unreachable!(),
                }
            } else {
                final_path.clone()
            };
            let created = request(
                &actual,
                FileRequest::UploadCreate {
                    path: actual.path.clone(),
                    length: stamp.size,
                },
            )
            .await?;
            let mut revision = created
                .response
                .headers()
                .get("Upload-Revision")
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned);
            let location = created
                .response
                .headers()
                .get("Location")
                .and_then(|v| v.to_str().ok())
                .ok_or("[invalid_response] 缺少上传标识")?;
            let id = location
                .strip_prefix("/api/v1/uploads/")
                .filter(|v| {
                    !v.is_empty()
                        && v.len() <= 128
                        && v.bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
                })
                .ok_or("[invalid_response] 上传标识越界")?
                .to_string();
            let mut uploaded_revision = None;
            let result = async {
                let mut count = 0u64;
                let mut prepared = Some(input.upload_chunk(progress, stamp.size).await?);
                loop {
                    let data = prepared.take().unwrap_or_default();
                    if data.is_empty() {
                        break;
                    }
                    let next = count + data.len() as u64;
                    if next > stamp.size {
                        return Err("[conflict] 源文件长度已变化".to_string());
                    }
                    if next == stamp.size {
                        if !input.next(progress).await?.is_empty() {
                            return Err("[conflict] 源文件长度增加，未提交".into());
                        }
                        verify_source(source, stamp).await?;
                    }
                    progress.check()?;
                    let sending = request(
                        &actual,
                        FileRequest::UploadAppend {
                            id: id.clone(),
                            offset: count,
                            bytes: data,
                        },
                    );
                    // Exactly one lookahead buffer. Reading overlaps sending,
                    // but tus writes remain sequential and are never replayed.
                    let (response, lookahead) = tokio::join!(sending, async {
                        if next < stamp.size { input.upload_chunk(progress, stamp.size-next).await.map(Some) } else { Ok(None) }
                    });
                    let response = response?;
                    prepared = lookahead?;
                    if next == stamp.size {
                        revision = response
                            .response
                            .headers()
                            .get("Upload-Revision")
                            .and_then(|v| v.to_str().ok())
                            .map(str::to_owned);
                    }
                    if response
                        .response
                        .headers()
                        .get("Upload-Offset")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse::<u64>().ok())
                        != Some(next)
                    {
                        return Err("[invalid_response] 上传偏移不一致，未重放".into());
                    }
                    progress.advance(next - count);
                    count = next;
                    progress.emit("running", source, false);
                }
                if count != stamp.size {
                    return Err("[response_interrupted] 源数据不完整".into());
                }
                verify_source(source, stamp).await?;
                progress.check()?;
                if let Some(previous) = existing {
                    let written = if let Some(revision) = &revision {
                        Snapshot {
                            directory: false,
                            size: stamp.size,
                            revision: revision.clone(),
                            read_revision: None,
                        }
                    } else {
                        snapshot(&Location::Remote(actual.clone())).await?
                    };
                    uploaded_revision = Some(written.revision.clone());
                    checked(
                        &actual,
                        Some(final_path),
                        &written.revision,
                        Some(&previous.revision),
                    )
                    .await?;
                }
                Ok::<(), String>(())
            }
            .await;
            // Cancelling this upload never deletes a published destination.
            let cleanup = if progress.leases.iter().any(|lease| lease.check().is_err()) {
                Err("[authorization_revoked] 已停止，未再用新的授权清理旧任务".into())
            } else {
                request(&actual, FileRequest::UploadCancel { id }).await
            };
            if let Err(mut error) = result {
                if let Some(revision) = uploaded_revision
                    .filter(|_| progress.leases.iter().all(|lease| lease.check().is_ok()))
                {
                    if let Err(e) = checked(&actual, None, &revision, None).await {
                        if !e.starts_with("[not_found]") {
                            error =
                                format!("{error}; 完整暂存副本可能保留于 {}: {e}", actual.uri());
                        }
                    }
                } else if existing.is_some() {
                    error = format!("{error}; 若有完整暂存副本，其路径为 {}", actual.uri());
                }
                return Err(match cleanup {
                    Ok(_) => error,
                    Err(cleanup) => format!("{error}; 上传暂存清理失败：{cleanup}"),
                });
            }
            if let Err(cleanup) = cleanup {
                return Err(format!("目标文件已完成，但上传记录清理失败：{cleanup}"));
            }
            committed = revision.map(|revision| Snapshot {
                directory: false,
                size: stamp.size,
                revision,
                read_revision: None,
            });
        }
    }
    Ok(committed)
}
async fn remove_source(
    path: &Location,
    stamp: &Snapshot,
    progress: &mut Progress<'_>,
) -> Result<(), String> {
    progress.check()?;
    match path {
        Location::Remote(p) => checked(p, None, &stamp.revision, None).await,
        Location::Local(p) => crate::file_ops::remove_local_transferred_file(
            progress.app,
            p,
            &stamp.revision,
            &format!("remote-{}", random()?),
            stamp.directory,
        ),
    }
}
async fn transfer(
    source: Location,
    target: Location,
    moving: bool,
    overwrite: bool,
    expected_target: Option<&str>,
    expected_source: Option<&str>,
    progress: &mut Progress<'_>,
) -> Result<Value, String> {
    progress.src = source.text();
    progress.dest = target.text();
    if source.contains(&target) || target.contains(&source) {
        return Err("[invalid_path] Source and destination are the same or nested".into());
    }
    for path in [&source, &target] {
        if let Location::Remote(path) = path {
            progress
                .leases
                .push(crate::device_groups::connector()?.file_lease(&path.group, &path.peer)?);
        }
    }
    if let Location::Remote(path) = &target {
        if path.path.trim_matches('/').split('/').count() < 2 {
            return Err("[invalid_path] 请先进入设备内的某个共享文件夹".into());
        }
    }
    expected(&snapshot(&source).await?, expected_source)?;
    // Renaming/moving within one share is a checked server-side operation,
    // not download + upload + delete (including case-only renames).
    if moving {
        if let (Location::Remote(from), Location::Remote(to)) = (&source, &target) {
            if from.group == to.group
                && from.peer == to.peer
                && from.path.split('/').nth(1) == to.path.split('/').nth(1)
            {
                let stamp = snapshot(&source).await?;
                let old = optional(&target).await?;
                let same = old
                    .as_ref()
                    .is_some_and(|v| same_identity(&v.revision, &stamp.revision));
                if old.is_none()
                    || same
                    || overwrite && !stamp.directory && old.as_ref().is_some_and(|v| !v.directory)
                {
                    if expected_target
                        .is_some_and(|r| old.as_ref().map(|v| v.revision.as_str()) != Some(r))
                    {
                        return Err("[conflict] 确认期间目标已变化，未覆盖".into());
                    }
                    let replacing = old.as_ref().filter(|_| !same).map(|v| v.revision.as_str());
                    rename_checked(&source, &target, &stamp, replacing, progress).await?;
                    progress.total = stamp.size;
                    progress.bytes = stamp.size;
                    progress.items = 1;
                    progress.done = 1;
                    let current = snapshot(&target).await?;
                    let history = if progress.history
                        && replacing.is_none()
                        && same_identity(&current.revision, &stamp.revision)
                    {
                        history::record_move(
                            source.clone(),
                            target.clone(),
                            current.revision.clone(),
                            progress,
                        )
                    } else {
                        None
                    };
                    return Ok(
                        json!({"source":source.text(),"target":target.text(),"sourceRemoved":true,"serverSide":true,"revision":current.revision,"historyId":history,"undoSupported":history.is_some()}),
                    );
                }
            }
        }
    }
    if moving {
        if let Location::Remote(path) = &source {
            if path.path.trim_matches('/').split('/').count() < 2 {
                return Err("[invalid_path] 不能移动共享根目录".into());
            }
            require_checked(path, false, true).await?;
        }
    }
    let mut plan = Vec::new();
    let mut queue = std::collections::VecDeque::from([(source.clone(), target.clone(), 0usize)]);
    progress.emit("calculating", &source, true);
    while let Some((src, dest, depth)) = queue.pop_front() {
        progress.check()?;
        if depth > 256 || plan.len() >= 100000 {
            return Err("[too_large] 传输超过十万项或 256 层，未写入目标".into());
        }
        let stamp = snapshot(&src).await?;
        if let Some(expected) = &progress.history_sources {
            let revision = expected
                .get(&src.text())
                .ok_or("[conflict] 原源文件夹出现新项目，未重做")?;
            if revision != &stamp.revision {
                return Err("[conflict] 原源文件已变化，未重做".into());
            }
        }
        if stamp.directory {
            for child in children(&src).await? {
                if queue.len() + plan.len() >= 100000 {
                    return Err("[too_large] 传输超过十万项，未写入目标".into());
                }
                let next = dest.child(&child.leaf()?)?;
                queue.push_back((child, next, depth + 1));
            }
        } else {
            progress.total = progress
                .total
                .checked_add(stamp.size)
                .ok_or("[too_large] 文件总大小溢出")?;
        }
        plan.push((src, dest, stamp));
        progress.emit("calculating", &source, false);
    }
    progress.items = plan.len() as u64;
    // Preflight every conflict before publishing anything. Directories merge,
    // never replace, even when overwrite=true was chosen for regular files.
    let mut targets = Vec::new();
    for (_, target, stamp) in &plan {
        let old = optional(target).await?;
        if progress.exclusive_target && old.is_some() {
            return Err("[conflict] 撤销或重做的目标已出现新对象，未合并或覆盖".into());
        }
        if target.text() == progress.dest
            && expected_target.is_some_and(|v| old.as_ref().map(|s| s.revision.as_str()) != Some(v))
        {
            return Err("[conflict] 确认期间目标已变化或移走，未覆盖".into());
        }
        if let Some(old) = &old {
            if old.directory != stamp.directory || !old.directory && !overwrite {
                return Err("[conflict] 目标已存在，未覆盖；请选择替换文件、跳过或保留两者".into());
            }
            if !old.directory {
                if let Location::Remote(path) = target {
                    require_checked(path, true, true).await?;
                }
            }
        }
        targets.push(old);
    }
    progress.emit("preparing", &source, true);
    let mut output_stamps = Vec::new();
    let mut index = 0;
    while index < plan.len() {
        let (src, dest, stamp) = &plan[index];
        progress.check()?;
        if index + 1 < plan.len() && !stamp.directory && stamp.size <= 4 * CHUNK as u64 && targets[index].is_none()
            && !plan[index+1].2.directory && plan[index+1].2.size <= 4 * CHUNK as u64 && targets[index+1].is_none() {
            // Only independent new small files run together. All directory
            // creation, conflict decisions, cleanup and history stay ordered.
            let shared = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
            let base = progress.bytes;
            let mut first = progress.fork(shared.clone());
            let mut second = progress.fork(shared.clone());
            let (src2, dest2, stamp2) = &plan[index+1];
            let copies = async { tokio::join!(copy_file(src,dest,stamp,None,&mut first),copy_file(src2,dest2,stamp2,None,&mut second)) };
            tokio::pin!(copies);
            let results = loop {
                tokio::select! {
                    result = &mut copies => break result,
                    _ = tokio::time::sleep(Duration::from_millis(100)) => {
                        progress.bytes = base + shared.load(std::sync::atomic::Ordering::Relaxed);
                        progress.emit("running", src, false);
                    }
                }
            };
            progress.bytes = base + shared.load(std::sync::atomic::Ordering::Relaxed);
            output_stamps.push(results.0?); output_stamps.push(results.1?);
            progress.done += 2; progress.emit("running", src2, false); index += 2;
            continue;
        }
        if stamp.directory {
            if targets[index].is_none() {
                match dest {
                    Location::Local(p) => {
                        local_handle(p.parent().ok_or("Invalid parent")?)?;
                        tokio::fs::create_dir(p).await.map_err(|e| e.to_string())?;
                    }
                    Location::Remote(p) => {
                        request(
                            p,
                            FileRequest::Mkdir {
                                path: p.path.clone(),
                            },
                        )
                        .await?;
                    }
                }
            }
            output_stamps.push(if progress.history && targets[index].is_none() {
                Some(snapshot(dest).await?)
            } else {
                None
            });
        } else {
            output_stamps
                .push(copy_file(src, dest, stamp, targets[index].as_ref(), progress).await?);
        }
        progress.done += 1;
        progress.emit("running", src, false);
        index += 1;
    }
    if moving {
        // Check all source files before removing the first one. On partial
        // cleanup failure keep every committed destination; never roll it back.
        for (src, _, stamp) in &plan {
            if !stamp.directory {
                verify_source(src, stamp).await?;
            }
        }
        progress.emit("cleaning", &source, true);
        for (src, _, stamp) in plan.iter().rev() {
            let fresh;
            if stamp.directory {
                fresh = snapshot(src).await?;
                if !same_identity(&fresh.revision, &stamp.revision) {
                    return Err("[conflict] 源文件夹已被替换，未删除".into());
                }
                remove_source(src, &fresh, progress).await?;
            } else {
                remove_source(src, stamp, progress).await?;
            }
        }
    }
    let observed = snapshot(&target).await?;
    let current = match output_stamps.first().and_then(Option::as_ref) {
        Some(written) if !written.directory => written.clone(),
        Some(written) if !same_identity(&observed.revision, &written.revision) => written.clone(),
        _ => observed,
    };
    let mut history_id = None;
    if progress.history && targets.iter().all(Option::is_none) {
        if moving && output_stamps.first().is_some_and(Option::is_some) {
            history_id = history::record_move(
                source.clone(),
                target.clone(),
                current.revision.clone(),
                progress,
            );
        } else if output_stamps.iter().all(Option::is_some) {
            let mut entries = Vec::new();
            let mut valid = true;
            for ((src, dest, original), written) in plan.iter().zip(output_stamps) {
                let written = written.unwrap();
                let now = snapshot(dest).await?;
                if if written.directory {
                    !same_identity(&now.revision, &written.revision)
                } else {
                    now.revision != written.revision
                } {
                    valid = false;
                    break;
                }
                entries.push((src.clone(), dest.clone(), original.clone(), now));
            }
            if valid {
                history_id = history::record_copy(entries, progress);
            }
        }
    }
    Ok(
        json!({"source":source.text(),"target":target.text(),"sourceRemoved":moving,"bytes":progress.bytes,"entries":plan.len(),"revision":current.revision,"historyId":history_id,"undoSupported":history_id.is_some()}),
    )
}

async fn merge_plan(
    src: Location,
    dest: Location,
    progress: &mut Progress<'_>,
) -> Result<Value, String> {
    if !snapshot(&src).await?.directory || !optional(&dest).await?.is_some_and(|s| s.directory) {
        return Ok(Value::Null);
    }
    if src.contains(&dest) || dest.contains(&src) {
        return Err("[invalid_path] 不能合并自身或互相包含的目录".into());
    }
    let mut queue = vec![(src, dest, 0)];
    let mut entries = Vec::new();
    let mut dirs = Vec::new();
    while let Some((source, target, depth)) = queue.pop() {
        progress.check()?;
        if depth > 256 || entries.len() + dirs.len() > 100000 {
            return Err("[too_large] 合并规划超过安全上限".into());
        }
        if snapshot(&source).await?.directory
            && optional(&target).await?.is_some_and(|s| s.directory)
        {
            dirs.push(source.text());
            for child in children(&source).await? {
                if queue.len() + entries.len() + dirs.len() >= 100000 {
                    return Err("[too_large] 合并规划超过十万项".into());
                }
                let dest = target.child(&child.leaf()?)?;
                queue.push((child, dest, depth + 1));
            }
        } else {
            entries.push(json!({"src":source.text(),"dest":target.text()}));
        }
        progress.emit("calculating", &source, false);
    }
    Ok(json!({"entries":entries,"sourceDirectories":dirs}))
}

fn remote_child(path: &Location) -> Result<&DevicePath, String> {
    match path {
        Location::Remote(p) if p.path.trim_matches('/').split('/').count() >= 2 => Ok(p),
        _ => Err("[forbidden] 不能修改设备或共享根目录".into()),
    }
}
fn hold(path: &Location, progress: &mut Progress<'_>) -> Result<(), String> {
    if let Location::Remote(p) = path {
        progress
            .leases
            .push(crate::device_groups::connector()?.file_lease(&p.group, &p.peer)?);
    }
    progress.check()
}
fn expected(stamp: &Snapshot, revision: Option<&str>) -> Result<(), String> {
    if revision.is_some_and(|r| r != stamp.revision) {
        Err("[conflict] 选中的文件已变化，未执行操作；请刷新后重新选择".into())
    } else {
        Ok(())
    }
}
async fn rename_target(
    path: &Location,
    name: &str,
) -> Result<(Location, Snapshot, Option<Snapshot>), String> {
    remote_child(path)?;
    let target = path.parent()?.child(name)?;
    let source = snapshot(path).await?;
    let old = optional(&target).await?;
    Ok((target, source, old))
}
async fn rename_checked(
    source: &Location,
    target: &Location,
    stamp: &Snapshot,
    target_revision: Option<&str>,
    progress: &mut Progress<'_>,
) -> Result<(), String> {
    let from = remote_child(source)?;
    let to = remote_child(target)?;
    hold(source, progress)?;
    if source.text() != target.text() && (source.contains(target) || target.contains(source)) {
        return Err("[invalid_path] 不能把目录移动到自身或其子目录".into());
    }
    if from.group != to.group
        || from.peer != to.peer
        || from.path.split('/').nth(1) != to.path.split('/').nth(1)
    {
        return Err("[invalid_path] 重命名必须在同一共享中".into());
    }
    require_checked(from, true, target_revision.is_some()).await?;
    progress.check()?;
    if source.text() == target.text() {
        return verify_source(source, stamp).await;
    }
    checked(from, Some(to), &stamp.revision, target_revision).await
}
// Snapshot the complete operation before the first mutation. Bounded traversal
// rejects overly large requests instead of silently deleting a partial tree.
async fn scan(
    path: Location,
    progress: &mut Progress<'_>,
) -> Result<Vec<(Location, Snapshot)>, String> {
    let mut queue = std::collections::VecDeque::from([(path, 0usize)]);
    let mut plan = Vec::new();
    while let Some((path, depth)) = queue.pop_front() {
        progress.check()?;
        if depth > 256 || plan.len() + queue.len() >= 100000 {
            return Err("[too_large] 超过十万项或 256 层；请缩小操作范围".into());
        }
        let stamp = snapshot(&path).await?;
        if stamp.directory {
            for child in children(&path).await? {
                queue.push_back((child, depth + 1));
            }
        } else {
            progress.total = progress
                .total
                .checked_add(stamp.size)
                .ok_or("[too_large] 大小溢出")?;
        }
        progress.emit("calculating", &path, false);
        plan.push((path, stamp));
    }
    progress.items = plan.len() as u64;
    Ok(plan)
}
async fn mutations(
    action: &str,
    args: &Value,
    progress: &mut Progress<'_>,
) -> Result<Value, String> {
    match action {
        "undo_transfer" | "redo_transfer" => history::execute(action, args, progress).await,
        #[cfg(windows)]
        "windows_disconnect" => {
            if args["confirmed"] != true {
                return Err("[confirmation_required] 请确认断开本机的 Windows 程序连接".into());
            }
            crate::windows_device_access::disconnect(&DevicePath::parse(field(args, "path")?)?)
                .await
        }
        #[cfg(windows)]
        "windows_path" => {
            let source = DevicePath::parse(field(args, "path")?)?;
            progress
                .leases
                .push(crate::device_groups::connector()?.file_lease(&source.group, &source.peer)?);
            progress.check()?;
            let path = crate::windows_device_access::resolve(&source).await?;
            progress.check()?;
            Ok(json!({"path":path,"live":true}))
        }
        "inspect_rename" => {
            let path = Location::parse(field(args, "path")?)?;
            hold(&path, progress)?;
            let (target, source, old) = rename_target(&path, field(args, "newName")?).await?;
            Ok(json!({"path":target.text(),"exists":old.is_some(),
                "sameEntry":old.as_ref().is_some_and(|v|same_identity(&v.revision,&source.revision)),
                "canMerge":source.directory&&old.as_ref().is_some_and(|v|v.directory),
                "isDirectory":old.as_ref().is_some_and(|v|v.directory),
                "sourceRevision":source.revision,"targetRevision":old.map(|v|v.revision)}))
        }
        "rename" => {
            let path = Location::parse(field(args, "path")?)?;
            hold(&path, progress)?;
            let (target, source, old) = rename_target(&path, field(args, "newName")?).await?;
            expected(&source, args["expectedSourceRevision"].as_str())?;
            if old
                .as_ref()
                .is_some_and(|v| !same_identity(&v.revision, &source.revision))
            {
                return Err("[conflict] 目标已存在，未覆盖；请合并、保留两者或明确替换文件".into());
            }
            rename_checked(&path, &target, &source, None, progress).await?;
            Ok(json!({"path":target.text(),"revision":snapshot(&target).await?.revision}))
        }
        "new_folder" | "create" | "ensure_folder" => {
            let parent = Location::parse(field(args, "parent")?)?;
            hold(&parent, progress)?;
            let name = if action == "new_folder" {
                "New Folder"
            } else {
                field(args, "name")?
            };
            let folder = action != "create" || args["template"] == "folder";
            for index in 0..10000 {
                let candidate = if index == 0 {
                    name.into()
                } else {
                    format!("{name} ({index})")
                };
                let target = parent.child(&candidate)?;
                let remote = remote_child(&target)?;
                progress.check()?;
                let result = if folder {
                    request(
                        remote,
                        FileRequest::Mkdir {
                            path: remote.path.clone(),
                        },
                    )
                    .await
                    .map(|_| ())
                } else {
                    // The normal built-in templates run in a private empty
                    // directory, never on a remote URI or an existing file.
                    let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
                    rhfiles_core::enumerator::create_new_file(
                        temp.path(),
                        args["template"].as_str().unwrap_or("txt"),
                        &candidate,
                    )?;
                    let source = Location::Local(temp.path().join(&candidate));
                    let stamp = snapshot(&source).await?;
                    copy_file(&source, &target, &stamp, None, progress)
                        .await
                        .map(|_| ())
                };
                match result {
                    Ok(()) => return Ok(json!(target.text())),
                    Err(e) if e.starts_with("[conflict]") && action == "new_folder" => continue,
                    Err(e)
                        if e.starts_with("[conflict]")
                            && action == "ensure_folder"
                            && optional(&target).await?.is_some_and(|s| s.directory) =>
                    {
                        return Ok(json!(target.text()));
                    }
                    Err(e) => return Err(e),
                }
            }
            Err("[conflict] 无法分配新文件夹名称".into())
        }
        "delete" => {
            progress.operation = "delete".into();
            let permanent = match args.get("permanent") {
                None => false,
                Some(value) => value.as_bool().ok_or("[invalid_request] permanent 必须是布尔值")?,
            };
            let paths = args["paths"]
                .as_array()
                .ok_or("[invalid_request] 缺少 paths")?;
            if paths.is_empty() || paths.len() > 10000 {
                return Err("[invalid_request] 删除数量无效".into());
            }
            let mut plans = Vec::new();
            for raw in paths {
                let path = Location::parse(raw.as_str().ok_or("Invalid path")?)?;
                let remote = remote_child(&path)?;
                hold(&path, progress)?;
                let plan = if permanent {
                    require_checked(remote, false, true).await?;
                    scan(path.clone(), progress).await?
                } else {
                    require_recycle(remote).await?;
                    vec![(path.clone(), snapshot(&path).await?)]
                };
                expected(&plan[0].1, args["revisions"][path.text()].as_str())?;
                plans.push((path, plan));
            }
            progress.items = plans.iter().map(|(_, p)| p.len() as u64).sum();
            let mut deleted = Vec::new();
            let mut errors = Vec::new();
            let mut recycled = Vec::new();
            for (root, plan) in plans {
                let result = async {
                    for (path, stamp) in plan.iter().rev() {
                        progress.check()?;
                        if !permanent {
                            let remote = remote_child(path)?;
                            let result = request(remote, FileRequest::Recycle { path:remote.path.clone(), revision:stamp.revision.clone() }).await?.json(65536).await?;
                            recycled.push((remote.clone(),field(&result,"receipt")?.to_string()));
                            progress.done += 1;
                            progress.emit("running", path, false);
                            continue;
                        }
                        let fresh;
                        let stamp = if stamp.directory {
                            fresh = snapshot(path).await?;
                            if !same_identity(&fresh.revision, &stamp.revision) {
                                return Err("[conflict] 文件夹已被替换，未删除".into());
                            }
                            &fresh
                        } else {
                            stamp
                        };
                        remove_source(path, stamp, progress).await?;
                        progress.done += 1;
                        if !stamp.directory {
                            progress.bytes += stamp.size;
                        }
                        progress.emit("running", path, false);
                    }
                    Ok::<(), String>(())
                }
                .await;
                match result {
                    Ok(()) => deleted.push(root.text()),
                    Err(e) => errors.push(format!("{}: {e}", root.text())),
                }
                if progress.cancel.is_cancelled(Some(&progress.id))? {
                    break;
                }
            }
            let cancelled = progress.cancel.is_cancelled(Some(&progress.id))?;
            if let Some(path) = paths.first().and_then(Value::as_str) {
                progress.emit(
                    if cancelled {
                        "cancelled"
                    } else if errors.is_empty() {
                        "complete"
                    } else {
                        "failed"
                    },
                    &Location::parse(path)?,
                    true,
                );
            }
            let history_id = history::record_recycle(recycled, progress);
            Ok(json!({"deleted":deleted,"errors":errors,"cancelled":cancelled,"undoSupported":history_id.is_some(),"historyId":history_id}))
        }
        "size" => {
            let path = Location::parse(field(args, "path")?)?;
            hold(&path, progress)?;
            scan(path, progress).await?;
            Ok(json!(progress.total))
        }
        "hash" => {
            use sha2::Digest;
            let path = Location::parse(field(args, "path")?)?;
            hold(&path, progress)?;
            let stamp = snapshot(&path).await?;
            if stamp.directory {
                return Err("[invalid_path] 只能校验普通文件".into());
            }
            let algorithm = field(args, "algo")?;
            if !["md5", "sha256"].contains(&algorithm) {
                return Err("[invalid_request] 请选择 MD5 或 SHA256".into());
            }
            let mut md5 = md5::Md5::new();
            let mut sha = sha2::Sha256::new();
            let mut reader = Reader::open_checked(&path, &stamp, progress).await?;
            progress.total = stamp.size;
            loop {
                let data = reader.next(progress).await?;
                if data.is_empty() {
                    break;
                }
                progress.bytes += data.len() as u64;
                if progress.bytes > stamp.size {
                    return Err("[conflict] 校验过程中文件已变化".into());
                }
                if algorithm == "md5" {
                    md5.update(&data);
                } else {
                    sha.update(&data);
                }
                progress.emit("running", &path, false);
            }
            if progress.bytes != stamp.size {
                return Err("[response_interrupted] 校验数据不完整".into());
            }
            verify_source(&path, &stamp).await?;
            Ok(json!(if algorithm == "md5" {
                format!("{:x}", md5.finalize())
            } else {
                format!("{:x}", sha.finalize())
            }))
        }
        "batch_rename" | "batch_move_exact" => {
            batch_rename(args, progress, action == "batch_move_exact").await
        }
        "usage" => {
            let root = Location::parse(field(args, "path")?)?;
            hold(&root, progress)?;
            let plan = scan(root.clone(), progress).await?;
            let mut nodes = std::collections::HashMap::<String, Value>::new();
            let depth = args["depth"].as_u64().unwrap_or(3).clamp(1, 20) as usize;
            for (path, stamp) in plan.iter().rev() {
                let mut children = nodes
                    .remove(&path.text())
                    .and_then(|v| v.as_array().cloned())
                    .unwrap_or_default();
                let size = if stamp.directory {
                    children
                        .iter()
                        .map(|v| v["bytes"].as_u64().unwrap_or(0))
                        .sum()
                } else {
                    stamp.size
                };
                children.sort_by_key(|v| std::cmp::Reverse(v["bytes"].as_u64().unwrap_or(0)));
                let mut node = json!({"name":path.text(),"size":crate::types::format_size(size),"bytes":size,"is_dir":stamp.directory,"children":children});
                let relative_depth = path
                    .text()
                    .matches('/')
                    .count()
                    .saturating_sub(root.text().matches('/').count());
                if relative_depth >= depth {
                    node["children"] = json!([]);
                }
                if path.text() == root.text() {
                    return Ok(node);
                }
                nodes
                    .entry(path.parent()?.text())
                    .or_insert(json!([]))
                    .as_array_mut()
                    .unwrap()
                    .push(node);
            }
            Err("[not_found] 目录不存在".into())
        }
        "stage" | "release_stage" | "validate_stage" | "plan_output" | "inspect_stage"
        | "publish_stage" => jobs::execute(action, args, progress).await,
        _ => work::execute(action, args, progress).await,
    }
}

async fn batch_rename(
    args: &Value,
    progress: &mut Progress<'_>,
    exact: bool,
) -> Result<Value, String> {
    let pairs = args[if exact { "moves" } else { "renames" }]
        .as_array()
        .ok_or("[invalid_request] 缺少 renames/moves")?;
    if pairs.is_empty() || pairs.len() > 10000 {
        return Err("[invalid_request] 批量重命名数量无效".into());
    }
    let mut plan = Vec::new();
    let mut sources = std::collections::HashSet::new();
    let mut targets = std::collections::HashSet::new();
    for pair in pairs {
        let pair = pair
            .as_array()
            .filter(|p| p.len() == 2)
            .ok_or("[invalid_request] 重命名参数无效")?;
        let source = Location::parse(pair[0].as_str().ok_or("Invalid source")?)?;
        let from = remote_child(&source)?;
        hold(&source, progress)?;
        require_checked(from, true, false).await?;
        let (target, stamp) = if exact {
            (
                Location::parse(pair[1].as_str().ok_or("Invalid target")?)?,
                snapshot(&source).await?,
            )
        } else {
            let (t, s, _) = rename_target(&source, pair[1].as_str().ok_or("Invalid name")?).await?;
            (t, s)
        };
        let to = remote_child(&target)?;
        if from.group != to.group
            || from.peer != to.peer
            || from.path.split('/').nth(1) != to.path.split('/').nth(1)
        {
            return Err("[invalid_path] 批量改名仅限同一共享".into());
        }
        // Reject duplicate Windows-compatible names even when a Linux server
        // could distinguish them; never accidentally merge two selected items.
        if !sources.insert(source.text().to_lowercase())
            || !targets.insert(target.text().to_lowercase())
        {
            return Err("[conflict] 批量名称重复，未重命名".into());
        }
        expected(&stamp, args["revisions"][source.text()].as_str())?;
        let temporary = source
            .parent()?
            .child(&format!("RHFiles-rename-{}.partial", random()?))?;
        plan.push((source, target, temporary, stamp));
    }
    for (source, target, _, _) in &plan {
        if plan.iter().any(|(other, _, _, _)| {
            source.text() != other.text() && (source.contains(other) || other.contains(source))
        }) {
            return Err("[invalid_path] 不能同时重命名文件夹和其内部项目".into());
        }
        if source.text() != target.text()
            && optional(target).await?.is_some()
            && !sources.contains(&target.text().to_lowercase())
        {
            return Err("[conflict] 批量目标已被其他文件占用，未重命名".into());
        }
    }
    // A durable local recovery record describes every private temporary name.
    // It is never auto-replayed: an old request cannot rename a newer occupant.
    let dir = crate::profile::data_dir()?.join("device-operation-recovery");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let journal = dir.join(format!("rename-{}.json", random()?));
    let record = json!({"operation":"batch_rename","entries":plan.iter().map(|(a,b,c,s)|json!({"source":a.text(),"target":b.text(),"temporary":c.text(),"revision":s.revision})).collect::<Vec<_>>()});
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&journal)
        .map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec(&record).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    let mut current = plan
        .iter()
        .map(|(s, _, _, stamp)| (s.clone(), stamp.clone()))
        .collect::<Vec<_>>();
    let result = async {
        for (index, (source, _, temporary, stamp)) in plan.iter().enumerate() {
            rename_checked(source, temporary, stamp, None, progress).await?;
            current[index] = (temporary.clone(), stamp.clone());
            current[index] = (temporary.clone(), snapshot(temporary).await?);
        }
        for (index, (_, target, temporary, _)) in plan.iter().enumerate() {
            rename_checked(temporary, target, &current[index].1, None, progress).await?;
            current[index].0 = target.clone();
            current[index] = (target.clone(), snapshot(target).await?);
            progress.done += 1;
            progress.emit("running", target, false);
        }
        Ok::<(), String>(())
    }
    .await;
    if let Err(error) = result {
        // Vacate committed target names first, then restore originals. On
        // revoked access or an external collision retain the recovery record.
        let mut rollback = Vec::new();
        for (index, (_, _, temporary, _)) in plan.iter().enumerate().rev() {
            if current[index].0.text() == temporary.text()
                || current[index].0.text() == plan[index].0.text()
            {
                continue;
            }
            match rename_checked(
                &current[index].0,
                temporary,
                &current[index].1,
                None,
                progress,
            )
            .await
            {
                Ok(()) => current[index] = (temporary.clone(), snapshot(temporary).await?),
                Err(e) => rollback.push(e),
            }
        }
        for (index, (source, _, _, _)) in plan.iter().enumerate().rev() {
            if current[index].0.text() == source.text() {
                continue;
            }
            if let Err(e) =
                rename_checked(&current[index].0, source, &current[index].1, None, progress).await
            {
                rollback.push(e);
            }
        }
        if rollback.is_empty() {
            let _ = std::fs::remove_file(&journal);
            return Err(error);
        }
        return Err(format!(
            "{error}; [recovery_required] 原数据未覆盖，恢复记录：{}；{}",
            journal.display(),
            rollback.join("; ")
        ));
    }
    std::fs::remove_file(journal).map_err(|e| format!("重命名已完成，但恢复记录清理失败：{e}"))?;
    Ok(
        json!({"renamed":plan.len(),"entries":plan.iter().zip(current).map(|((source,target,_,_),(_,stamp))|json!({"source":source.text(),"target":target.text(),"revision":stamp.revision})).collect::<Vec<_>>()}),
    )
}

#[tauri::command]
pub async fn device_transfer(
    action: String,
    args: Value,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
) -> Result<Value, String> {
    if !args.is_object() {
        return Err("[invalid_request] 参数必须是对象".into());
    }
    let operation_id = args["operationId"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or(format!("device-{}", random()?));
    let _guard = cancel.begin_named(&operation_id)?;
    let mut progress = Progress {
        app: &app,
        cancel: &cancel,
        leases: Vec::new(),
        id: operation_id,
        operation: if action == "move" { "move" } else { "copy" }.into(),
        src: args["src"].as_str().unwrap_or_default().into(),
        dest: args["dest"].as_str().unwrap_or_default().into(),
        total: 0,
        bytes: 0,
        items: 0,
        done: 0,
        started: Instant::now(),
        last: Instant::now(),
        history: false,
        exclusive_target: false,
        history_sources: None,
        download_options: if let Some(options) = args.get("downloadOptions") {
            serde_json::from_value::<DownloadOptions>(options.clone()).map_err(|_| "[invalid_request] 下载配置格式无效")?.validate()?
        } else { DownloadOptions::default() },
        shared_bytes: None,
        silent: false,
        saving: action=="save_copy",
    };
    match action.as_str() {
        "copy" | "move" | "copy_exact" | "move_exact" | "save_copy" => {
            let source = Location::parse(field(&args, "src")?)?;
            let destination = Location::parse(field(&args, "dest")?)?;
            if action!="save_copy"&&!matches!(source, Location::Remote(_)) && !matches!(destination, Location::Remote(_))
            {
                return Err("[invalid_request] 此接口至少包含一个 RHFiles 设备路径".into());
            }
            if action=="save_copy"&&snapshot(&source).await?.directory{return Err("[invalid_path] 另存为仅支持单个文件".into());}
            let target = if action.ends_with("_exact")||action=="save_copy" {
                destination
            } else {
                destination.child(args["targetName"].as_str().unwrap_or(&source.leaf()?))?
            };
            let moving = action.starts_with("move");
            progress.history = args["recordHistory"].as_bool().unwrap_or(true)
                && !args["overwrite"].as_bool().unwrap_or(false);
            progress.dest = target.text();
            progress.operation = if moving { "move" } else { "copy" }.into();
            let result = transfer(
                source.clone(),
                target.clone(),
                moving,
                args["overwrite"].as_bool().unwrap_or(false),
                args["expectedTargetRevision"].as_str(),
                args["expectedSourceRevision"].as_str(),
                &mut progress,
            )
            .await;
            progress.emit(
                if result.is_ok() {
                    "complete"
                } else if cancel.is_cancelled(Some(&progress.id))? {
                    "cancelled"
                } else {
                    "failed"
                },
                &target,
                true,
            );
            result
        }
        "plan_merge" => {
            merge_plan(
                Location::parse(field(&args, "src")?)?,
                Location::parse(field(&args, "dest")?)?,
                &mut progress,
            )
            .await
        }
        "inspect" => {
            let path = Location::parse(field(&args, "path")?)?;
            let value = snapshot(&path).await?;
            Ok(json!({"revision":value.revision,"isDirectory":value.directory,"size":value.size}))
        }
        "remove_empty" => {
            let mut removed = Vec::new();
            let mut errors = Vec::new();
            let paths = args["paths"].as_array().ok_or("Missing paths")?;
            if paths.len() > 100000 {
                return Err("[too_large] Too many folders".into());
            }
            let mut parsed = paths
                .iter()
                .map(|v| Location::parse(v.as_str().ok_or("Invalid path")?))
                .collect::<Result<Vec<_>, String>>()?;
            parsed.sort_by_key(|p| std::cmp::Reverse(p.text().len()));
            for path in parsed {
                let result = async {
                    if let Some(stamp) = optional(&path).await? {
                        if let Some(identity) = args["identities"][path.text()].as_str() {
                            if !same_identity(&stamp.revision, identity) {
                                return Err("[conflict] 原空文件夹已被替换，未清理".into());
                            }
                        }
                        if !stamp.directory {
                            return Err("[invalid_path] 仅清理空文件夹".into());
                        }
                        if !children(&path).await?.is_empty() {
                            return Ok(false);
                        }
                        remove_source(&path, &stamp, &mut progress).await?;
                        return Ok(true);
                    }
                    Ok::<bool, String>(false)
                }
                .await;
                match result {
                    Ok(true) => removed.push(path.text()),
                    Ok(false) => {}
                    Err(e) => errors.push(format!("{}: {e}", path.text())),
                }
            }
            Ok(json!({"removed":removed,"errors":errors}))
        }
        _ => mutations(&action, &args, &mut progress).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_identity_paths_or_absolute_files_can_enter_the_transfer_engine() {
        for value in [
            "relative/file",
            "ftp://host/file",
            "https://host/file",
            "rhfiles-device://bad/path",
            "C:\\x\\..\\y",
            r"\\.\PIPE\something",
            r"\\?\GLOBALROOT\Device\HarddiskVolume1",
        ] {
            assert!(Location::parse(value).is_err(), "{value}");
        }
        let root = DevicePath::new(&"a".repeat(64), &"b".repeat(64), "/Files/中文 %").unwrap();
        let location = Location::parse(&root.uri()).unwrap();
        assert_eq!(location.leaf().unwrap(), "中文 %");
        assert_eq!(
            location.child("A.txt").unwrap().parent().unwrap().text(),
            location.text()
        );
        assert!(location.contains(&location.child("A.txt").unwrap()));
        assert!(!location.contains(&Location::Remote(
            DevicePath::new(&"a".repeat(64), &"c".repeat(64), "/Files/中文 %/A.txt").unwrap()
        )));
    }
    #[test]
    fn changed_size_and_timestamp_do_not_change_object_identity_but_recreation_does() {
        assert!(same_identity("v2-a-b-c-d-e-1", "v2-a-b-cc-dd-e-1"));
        assert!(!same_identity("v2-a-b-c-d-e-1", "v2-a-f-c-d-e-1"));
        assert!(!same_identity("v2-a-b-c-d-e-1", "v2-a-b-c-d-f-1"));
        assert!(!same_identity("legacy", "legacy"));
    }
    #[tokio::test]
    async fn replacing_a_local_file_with_identical_bytes_and_timestamp_changes_its_revision() {
        let temp = tempfile::tempdir().unwrap();
        // macOS /var is a system symlink. The production no-symlink guard is
        // intentional; normalize this private fixture, not the file guard.
        let root = temp.path().canonicalize().unwrap();
        let source = root.join("source");
        std::fs::write(&source, b"same").unwrap();
        let file = std::fs::File::open(&source).unwrap();
        let first = file_revision(&file).unwrap();
        let modified = file.metadata().unwrap().modified().unwrap();
        std::fs::rename(&source, root.join("original")).unwrap();
        std::fs::write(&source, b"same").unwrap();
        std::fs::File::options()
            .write(true)
            .open(&source)
            .unwrap()
            .set_modified(modified)
            .unwrap();
        let changed = snapshot(&Location::Local(source)).await.unwrap();
        assert_ne!(changed.revision, first);
        assert!(!same_identity(&changed.revision, &first));
    }
}
