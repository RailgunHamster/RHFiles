//! Bounded, ordered, version-bound range downloads. Dropping a reader aborts
//! its worker; failed/finished jobs never restart themselves in the background.
use super::*;
use bytes::Bytes;
use futures_util::{StreamExt, stream::FuturesOrdered};
use sha2::Digest;
use std::sync::{
    LazyLock, Weak,
    atomic::{AtomicUsize, Ordering},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc};

pub const SEGMENT_BYTES: usize = crate::content::SEGMENT_SIZE;
// Includes completed out-of-order buffers, not just active HTTP requests.
static SEGMENTS: LazyLock<Arc<Semaphore>> = LazyLock::new(|| Arc::new(Semaphore::new(8)));
static JOBS: LazyLock<Arc<Semaphore>> = LazyLock::new(|| Arc::new(Semaphore::new(2)));
static PEERS: LazyLock<Mutex<HashMap<String, Weak<Semaphore>>>> = LazyLock::new(Default::default);

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DownloadOptions {
    /// Per-file streams; an additional per-device limit of four always applies.
    pub parallelism: usize,
    /// Zero means uncapped. Shared across the streams of this file.
    pub bytes_per_second: u64,
}
impl Default for DownloadOptions {
    fn default() -> Self {
        Self {
            parallelism: 2,
            bytes_per_second: 0,
        }
    }
}
impl DownloadOptions {
    pub fn validate(self) -> Result<Self, String> {
        if !(1..=4).contains(&self.parallelism) || self.bytes_per_second > 10_000_000_000 {
            return Err("[invalid_request] 下载并发必须为 1–4，限速不得超过 10 GB/s".into());
        }
        Ok(self)
    }
}

pub struct DownloadBlock {
    pub bytes: Bytes,
    _global: OwnedSemaphorePermit,
    _peer: OwnedSemaphorePermit,
}
pub struct Download {
    receive: mpsc::Receiver<Result<DownloadBlock, String>>,
    worker: tokio::task::JoinHandle<()>,
    lease: FileLease,
    _job: OwnedSemaphorePermit,
    done: bool,
}
impl Drop for Download {
    fn drop(&mut self) {
        self.worker.abort();
    }
}
impl Download {
    /// Caller must inspect capabilities before opting into versioned ranges.
    pub async fn open(
        connector: Arc<Connector>,
        path: DevicePath,
        size: u64,
        revision: String,
        options: DownloadOptions,
    ) -> Result<Self, String> {
        let options = options.validate()?;
        if size == 0 || size > 1_099_511_627_776 {
            return Err("[invalid_request] 分段下载长度无效".into());
        }
        let lease = connector.file_lease(&path.group, &path.peer)?;
        let job = JOBS
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| "[busy] 下载队列已关闭")?;
        lease.check()?;
        let key = format!("{}:{}", path.group, path.peer);
        let peer = {
            let mut peers = PEERS.lock().map_err(|_| "[busy] 下载队列不可用")?;
            peers.retain(|_, v| v.strong_count() > 0);
            if let Some(peer) = peers.get(&key).and_then(Weak::upgrade) {
                peer
            } else {
                let peer = Arc::new(Semaphore::new(4));
                peers.insert(key, Arc::downgrade(&peer));
                peer
            }
        };
        let (send, receive) = mpsc::channel(1);
        let worker_lease = lease.clone();
        let worker = tokio::spawn(async move {
            let repairs = Arc::new(AtomicUsize::new(0));
            let start = Instant::now();
            let mut offset = 0;
            let mut pending = FuturesOrdered::new();
            let mut sent = 0u64;
            let mut pacer = Pacer::new(options.bytes_per_second);
            let result = async {
                loop {
                    worker_lease.check()?;
                    while pending.len() < options.parallelism && offset < size {
                        let length = (size - offset).min(SEGMENT_BYTES as u64);
                        pending.push_back(segment(
                            connector.clone(),
                            path.clone(),
                            revision.clone(),
                            size,
                            offset,
                            length,
                            peer.clone(),
                            worker_lease.clone(),
                            repairs.clone(),
                        ));
                        offset += length;
                    }
                    let Some(block) = pending.next().await else {
                        break;
                    };
                    let block = block?;
                    worker_lease.check()?;
                    sent += block.bytes.len() as u64;
                    pacer.wait(block.bytes.len() as u64).await;
                    worker_lease.check()?;
                    send.send(Ok(block))
                        .await
                        .map_err(|_| "[cancelled] 下载接收端已关闭")?;
                }
                if sent != size {
                    return Err("[response_interrupted] 下载长度不完整".into());
                }
                let current = connector
                    .file_request(
                        &path.group,
                        &path.peer,
                        FileRequest::Stat {
                            path: path.path.clone(),
                        },
                    )
                    .await?
                    .json(65536)
                    .await?;
                if current["readRevision"].as_str() != Some(revision.as_str())
                    || current["size"].as_u64() != Some(size)
                {
                    return Err("[conflict] 源文件版本已变化，未发布目标".into());
                }
                worker_lease.check()?;
                Ok::<(), String>(())
            }
            .await;
            let repaired = repairs.load(Ordering::Relaxed);
            connector.record(Report {
                group: path.group,
                peer: path.peer,
                trigger: "file.download".into(),
                started_at: now_ms().saturating_sub(start.elapsed().as_millis() as u64),
                duration_ms: start.elapsed().as_millis() as u64,
                outcome: if result.is_ok() {
                    "completed"
                } else {
                    "request_failed"
                }
                .into(),
                certainty: "confirmed".into(),
                endpoint: None,
                steps: vec![Step {
                    method: "versioned_ranges_sha256".into(),
                    endpoint: None,
                    outcome: if result.is_ok() {
                        "succeeded"
                    } else {
                        "failed"
                    }
                    .into(),
                    code: format!("streams_{}_repairs_{repaired}", options.parallelism),
                    duration_ms: start.elapsed().as_millis() as u64,
                }],
                attempts: repaired,
                remaining_ms: 0,
                retry_after_ms: 0,
                route_type: None,
            });
            if let Err(error) = result {
                let _ = send.send(Err(error)).await;
            }
        });
        Ok(Self {
            receive,
            worker,
            lease,
            _job: job,
            done: false,
        })
    }
    pub async fn next(&mut self) -> Result<Option<DownloadBlock>, String> {
        self.lease.check()?;
        if self.done {
            return Ok(None);
        }
        let value = self.receive.recv().await;
        self.lease.check()?;
        match value {
            Some(value) => value.map(Some),
            None => {
                // A panic must not masquerade as a clean EOF.
                (&mut self.worker)
                    .await
                    .map_err(|_| "[response_interrupted] 下载工作进程意外结束")?;
                self.done = true;
                Ok(None)
            }
        }
    }
}

/// Cumulative pacing, so fast chunks cannot reset their allowance. No busy wait.
struct Pacer {
    rate: u64,
    started: Instant,
    bytes: u64,
}
impl Pacer {
    fn new(rate: u64) -> Self {
        Self {
            rate,
            started: Instant::now(),
            bytes: 0,
        }
    }
    async fn wait(&mut self, bytes: u64) {
        self.bytes = self.bytes.saturating_add(bytes);
        if self.rate > 0 {
            let target = Duration::from_secs_f64(self.bytes as f64 / self.rate as f64);
            tokio::time::sleep(target.saturating_sub(self.started.elapsed())).await;
        }
    }
}
fn repairable(error: &str) -> bool {
    [
        "[response_interrupted]",
        "[transport_error]",
        "[response_slow]",
        "[timed_out]",
        "[checksum_mismatch]",
    ]
    .iter()
    .any(|p| error.starts_with(p))
}
async fn segment(
    connector: Arc<Connector>,
    path: DevicePath,
    revision: String,
    size: u64,
    start: u64,
    length: u64,
    peer: Arc<Semaphore>,
    lease: FileLease,
    repairs: Arc<AtomicUsize>,
) -> Result<DownloadBlock, String> {
    let peer = peer
        .acquire_owned()
        .await
        .map_err(|_| "[busy] 设备下载队列已关闭")?;
    let global = SEGMENTS
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "[busy] 下载队列已关闭")?;
    for attempt in 0..=2 {
        lease.check()?;
        let result = read_segment(&connector, &path, &revision, size, start, length).await;
        lease.check()?;
        match result {
            Ok(bytes) => {
                return Ok(DownloadBlock {
                    bytes,
                    _global: global,
                    _peer: peer,
                });
            }
            Err(error)
                if attempt < 2
                    && repairable(&error)
                    && repairs
                        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| {
                            (n < 8).then_some(n + 1)
                        })
                        .is_ok() =>
            {
                let now = Instant::now();
                let mut report = Report {
                    group: path.group.clone(),
                    peer: path.peer.clone(),
                    trigger: "file.download.repair".into(),
                    started_at: now_ms(),
                    duration_ms: 0,
                    outcome: "repairing_segment".into(),
                    certainty: "confirmed".into(),
                    endpoint: None,
                    steps: vec![],
                    attempts: attempt + 1,
                    remaining_ms: 0,
                    retry_after_ms: 0,
                    route_type: None,
                };
                let code = error
                    .split(']')
                    .next()
                    .unwrap_or("[response_interrupted")
                    .trim_start_matches('[');
                report.step("range_repair", None, "failed", code, now);
                connector.record(report);
                tokio::time::sleep(Duration::from_millis(100 * (attempt as u64 + 1))).await;
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!()
}
async fn read_segment(
    connector: &Connector,
    path: &DevicePath,
    revision: &str,
    size: u64,
    start: u64,
    length: u64,
) -> Result<Bytes, String> {
    let end = start + length - 1;
    let mut response = connector
        .file_request(
            &path.group,
            &path.peer,
            FileRequest::ContentChecked {
                path: path.path.clone(),
                range: Some(format!("bytes={start}-{end}")),
                revision: revision.into(),
            },
        )
        .await?;
    let expected_range = format!("bytes {start}-{end}/{size}");
    let headers = response.response.headers();
    if response.response.status().as_u16() != 206
        || headers.get("Content-Range").and_then(|v| v.to_str().ok())
            != Some(expected_range.as_str())
        || headers.get("ETag").and_then(|v| v.to_str().ok())
            != Some(format!("\"{revision}\"").as_str())
        || headers
            .get("Content-Encoding")
            .is_some_and(|v| v != "identity")
        || headers
            .get("Content-Length")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            != Some(length)
    {
        return Err("[invalid_response] 分段范围、版本、编码或长度不一致，未拼接".into());
    }
    let digest = headers
        .get("X-RHFiles-Chunk-SHA256")
        .and_then(|v| v.to_str().ok())
        .filter(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or("[invalid_response] 分段缺少 SHA-256 校验值")?
        .to_ascii_lowercase();
    let mut data = Vec::with_capacity(length as usize);
    loop {
        let chunk = tokio::time::timeout(Duration::from_secs(30), response.chunk())
            .await
            .map_err(|_| "[timed_out] 分段读取 30 秒没有数据")??;
        let Some(chunk) = chunk else {
            break;
        };
        if data.len().saturating_add(chunk.len()) > length as usize {
            return Err("[invalid_response] 分段超过请求长度".into());
        }
        data.extend_from_slice(&chunk);
    }
    if data.len() != length as usize {
        return Err("[response_interrupted] 分段长度不完整".into());
    }
    if format!("{:x}", Sha256::digest(&data)) != digest {
        return Err("[checksum_mismatch] 分段 SHA-256 校验失败".into());
    }
    Ok(data.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn options_and_repair_policy_are_bounded_and_never_retry_authority_or_revision_errors() {
        for n in [0, 5, usize::MAX] {
            assert!(
                DownloadOptions {
                    parallelism: n,
                    ..Default::default()
                }
                .validate()
                .is_err()
            );
        }
        for n in 1..=4 {
            assert!(
                DownloadOptions {
                    parallelism: n,
                    ..Default::default()
                }
                .validate()
                .is_ok()
            );
        }
        for error in [
            "[authorization_revoked]",
            "[forbidden]",
            "[unauthorized]",
            "[conflict]",
            "[range_not_satisfiable]",
            "[identity_mismatch]",
            "[invalid_response]",
            "Cancelled",
        ] {
            assert!(!repairable(error));
        }
        assert!(repairable("[response_interrupted] EOF"));
        assert!(repairable("[checksum_mismatch] invalid"));
    }
}
