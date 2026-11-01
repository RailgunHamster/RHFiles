//! Native, bounded streaming between local files and identity-bound group paths.
//! Renderer code never receives server credentials or supplies an HTTP endpoint.
use crate::types::CancelFlag;
use rhfiles_service::connection::{
    DevicePath, FileLease, FileRequest, FileResponse, file_revision,
};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const CHUNK: usize = 1024 * 1024;
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
                    && (b.path == a.path || b.path.starts_with(&(a.path.clone() + "/")))
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
        Location::Remote(p) => crate::device_fs::listing(p)
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
        let _=self.app.emit("op-progress",json!({"operationId":self.id,"operation":self.operation,"src":self.src,"dest":self.dest,"currentPath":current.text(),"currentName":current.leaf().unwrap_or_default(),"bytesTransferred":self.bytes,"totalBytes":self.total,"entriesCompleted":self.done,"totalEntries":self.items,"percentage":percentage.round() as u32,"speed":if elapsed>0.0{(self.bytes as f64/elapsed) as u64}else{0},"elapsedSeconds":elapsed,"status":status}));
    }
}
enum Reader {
    Local(tokio::fs::File),
    Remote {
        response: FileResponse,
        pending: Vec<u8>,
        offset: usize,
    },
}
impl Reader {
    async fn open(path: &Location, stamp: &Snapshot) -> Result<Self, String> {
        match path {
            Location::Local(p) => {
                let file = local_handle(p)?;
                if file_revision(&file)? != stamp.revision {
                    return Err("[conflict] 源文件已变化".into());
                }
                Ok(Self::Local(tokio::fs::File::from_std(file)))
            }
            Location::Remote(p) => Ok(Self::Remote {
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
            }),
        }
    }
    async fn next(&mut self, p: &Progress<'_>) -> Result<Vec<u8>, String> {
        p.check()?;
        match self {
            Self::Local(file) => {
                let mut data = vec![0; CHUNK];
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
                let end = (*offset + CHUNK).min(pending.len());
                let data = pending[*offset..end].to_vec();
                *offset = end;
                Ok(data)
            }
        }
    }
}
async fn verify_source(source: &Location, stamp: &Snapshot) -> Result<(), String> {
    if snapshot(source).await?.revision != stamp.revision {
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
) -> Result<(), String> {
    let mut input = Reader::open(source, stamp).await?;
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
                progress.bytes += data.len() as u64;
                progress.emit("running", source, false);
            }
            if count != stamp.size {
                return Err("[response_interrupted] 文件长度不完整，未发布目标".into());
            }
            verify_source(source, stamp).await?;
            progress.check()?;
            output.sync_all().await.map_err(|e| e.to_string())?;
            drop(output);
            crate::file_ops::commit_remote_download(
                progress.app,
                &source.text(),
                &temp,
                path,
                existing.map(|s| s.revision.as_str()),
                &format!("remote-{}", random()?),
            )?;
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
                loop {
                    let data = input.next(progress).await?;
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
                    let response = request(
                        &actual,
                        FileRequest::UploadAppend {
                            id: id.clone(),
                            offset: count,
                            bytes: data,
                        },
                    )
                    .await?;
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
                    progress.bytes += next - count;
                    count = next;
                    progress.emit("running", source, false);
                }
                if count != stamp.size {
                    return Err("[response_interrupted] 源数据不完整".into());
                }
                verify_source(source, stamp).await?;
                progress.check()?;
                if let Some(previous) = existing {
                    let written = snapshot(&Location::Remote(actual.clone())).await?;
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
        }
    }
    Ok(())
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
    progress: &mut Progress<'_>,
) -> Result<Value, String> {
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
    for (index, (src, dest, stamp)) in plan.iter().enumerate() {
        progress.check()?;
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
        } else {
            copy_file(src, dest, stamp, targets[index].as_ref(), progress).await?;
        }
        progress.done += 1;
        progress.emit("running", src, false);
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
    Ok(
        json!({"source":source.text(),"target":target.text(),"sourceRemoved":moving,"bytes":progress.bytes,"entries":plan.len(),"undoSupported":false}),
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
    };
    match action.as_str() {
        "copy" | "move" | "copy_exact" | "move_exact" => {
            let source = Location::parse(field(&args, "src")?)?;
            let destination = Location::parse(field(&args, "dest")?)?;
            if !matches!(source, Location::Remote(_)) && !matches!(destination, Location::Remote(_))
            {
                return Err("[invalid_request] 此接口至少包含一个 RHFiles 设备路径".into());
            }
            let target = if action.ends_with("_exact") {
                destination
            } else {
                destination.child(args["targetName"].as_str().unwrap_or(&source.leaf()?))?
            };
            let moving = action.starts_with("move");
            progress.dest = target.text();
            progress.operation = if moving { "move" } else { "copy" }.into();
            let result = transfer(
                source.clone(),
                target.clone(),
                moving,
                args["overwrite"].as_bool().unwrap_or(false),
                args["expectedTargetRevision"].as_str(),
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
        _ => Err("[unsupported] 不支持的远端传输操作".into()),
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
        let source = temp.path().join("source");
        std::fs::write(&source, b"same").unwrap();
        let file = std::fs::File::open(&source).unwrap();
        let first = file_revision(&file).unwrap();
        let modified = file.metadata().unwrap().modified().unwrap();
        std::fs::rename(&source, temp.path().join("original")).unwrap();
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
