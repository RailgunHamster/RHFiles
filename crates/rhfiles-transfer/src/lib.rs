//! RHFiles Nearby v1: explicit opt-in, TLS-pinned streams and receiver approval.
//! Inspired by LocalSend's UX, not a claim of LocalSend protocol compatibility.
pub mod files;
mod tls;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
pub type Result<T> = std::result::Result<T, String>;
fn failure(error: impl std::fmt::Display) -> String {
    error.to_string()
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn random() -> Result<String> {
    let mut bytes = [0; 16];
    getrandom::fill(&mut bytes).map_err(failure)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
pub const PORT: u16 = 54435;
const GROUP: Ipv4Addr = Ipv4Addr::new(224, 0, 0, 168);
pub fn lan_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => v.is_private() || v.is_loopback() || v.is_link_local(),
        IpAddr::V6(v) => v.is_unique_local() || v.is_unicast_link_local() || v.is_loopback(),
    }
}
fn label(value: &str) -> String {
    value.chars().filter(|c| !c.is_control()).take(80).collect()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub alias: String,
    pub address: String,
    pub code: String,
    pub manual: bool,
    pub seen: u64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transfer {
    pub id: String,
    pub direction: String,
    pub peer: String,
    pub address: String,
    pub state: String,
    pub bytes: u64,
    pub total: u64,
    pub count: usize,
    pub preview: Vec<String>,
    pub current: String,
    pub message: String,
    pub output: String,
    pub started: u64,
}
struct Job {
    view: Mutex<Transfer>,
    entries: Vec<files::Entry>,
    token: String,
    canceled: AtomicBool,
    destination: Mutex<Option<PathBuf>>,
}
impl Job {
    fn update(&self, change: impl FnOnce(&mut Transfer)) {
        change(&mut self.view.lock().unwrap());
    }
    fn state(&self) -> String {
        self.view.lock().unwrap().state.clone()
    }
    fn check(&self, core: &Core) -> Result<()> {
        if self.canceled.load(Ordering::Relaxed) || core.stopped.load(Ordering::Relaxed) {
            Err("传输已取消；来源未删除".into())
        } else {
            Ok(())
        }
    }
}
fn active(state: &str) -> bool {
    matches!(
        state,
        "scanning" | "waiting" | "accepted" | "sending" | "receiving" | "verifying"
    )
}
struct Core {
    id: String,
    alias: String,
    port: u16,
    addresses: Vec<String>,
    data: PathBuf,
    tls: Arc<rustls::ServerConfig>,
    stopped: AtomicBool,
    connections: AtomicUsize,
    peers: Mutex<HashMap<String, Peer>>,
    jobs: Mutex<HashMap<String, Arc<Job>>>,
    discovery_error: Mutex<String>,
}
#[derive(Clone)]
pub struct Service(Arc<Core>);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub running: bool,
    pub id: String,
    pub alias: String,
    pub code: String,
    pub addresses: Vec<String>,
    pub port: u16,
    pub peers: Vec<Peer>,
    pub transfers: Vec<Transfer>,
    pub discovery_error: String,
    pub interrupted: Vec<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum Request {
    Info,
    Offer {
        version: u32,
        alias: String,
        entries: Vec<files::Entry>,
    },
    Check {
        id: String,
        token: String,
    },
    Upload {
        id: String,
        token: String,
    },
}
impl Service {
    pub fn start(data: PathBuf, alias: String, port: u16, discovery: bool) -> Result<Self> {
        let (id, tls) = tls::identity(&data)?;
        let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, port))
            .or_else(|error| {
                if error.kind() == std::io::ErrorKind::AddrInUse {
                    TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0))
                } else {
                    Err(error)
                }
            })
            .map_err(failure)?;
        listener.set_nonblocking(true).map_err(failure)?;
        let port = listener.local_addr().map_err(failure)?.port();
        let mut addresses = vec![];
        if let Ok(socket) = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)) {
            if socket.connect((GROUP, PORT)).is_ok() {
                if let Ok(addr) = socket.local_addr() {
                    if lan_address(addr.ip()) && !addr.ip().is_loopback() {
                        addresses.push(format!("{}:{port}", addr.ip()));
                    }
                }
            }
        }
        let core = Arc::new(Core {
            id,
            alias: label(&alias),
            port,
            addresses,
            data,
            tls,
            stopped: AtomicBool::new(false),
            connections: AtomicUsize::new(0),
            peers: Mutex::new(HashMap::new()),
            jobs: Mutex::new(HashMap::new()),
            discovery_error: Mutex::new(String::new()),
        });
        let server = core.clone();
        std::thread::spawn(move || {
            while !server.stopped.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, address)) => {
                        if !lan_address(address.ip())
                            || server.connections.fetch_add(1, Ordering::Relaxed) >= 4
                        {
                            if lan_address(address.ip()) {
                                server.connections.fetch_sub(1, Ordering::Relaxed);
                            }
                            drop(stream);
                            continue;
                        }
                        let core = server.clone();
                        std::thread::spawn(move || {
                            let _ = handle(&core, stream, address);
                            core.connections.fetch_sub(1, Ordering::Relaxed);
                        });
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(50))
                    }
                    Err(_) => break,
                }
            }
        });
        if discovery {
            let core = core.clone();
            std::thread::spawn(move || {
                if let Err(error) = discover(&core) {
                    *core.discovery_error.lock().unwrap() = error;
                }
            });
        }
        Ok(Self(core))
    }
    pub fn stop(&self) {
        self.0.stopped.store(true, Ordering::Relaxed);
        for job in self.0.jobs.lock().unwrap().values() {
            if active(&job.state()) {
                job.canceled.store(true, Ordering::Relaxed);
                job.update(|v| {
                    v.state = "canceled".into();
                    v.message = "互传已关闭；来源未删除".into()
                });
            }
        }
    }
    pub fn status(&self) -> Status {
        let core = &self.0;
        let now = now_ms();
        let mut peers = core.peers.lock().unwrap();
        peers.retain(|_, peer| peer.manual || now.saturating_sub(peer.seen) < 15000);
        let mut jobs = core.jobs.lock().unwrap();
        for job in jobs.values() {
            let mut view = job.view.lock().unwrap();
            if matches!(view.state.as_str(), "waiting" | "accepted")
                && now.saturating_sub(view.started) > 120000
            {
                job.canceled.store(true, Ordering::Relaxed);
                view.state = "expired".into();
                view.message = "等待接收超过两分钟，请重试".into();
            }
        }
        if jobs.len() > 30 {
            let mut completed = jobs
                .values()
                .filter_map(|job| {
                    let v = job.view.lock().unwrap();
                    (!active(&v.state)).then(|| (v.started, v.id.clone()))
                })
                .collect::<Vec<_>>();
            completed.sort();
            for (_, id) in completed.into_iter().take(jobs.len() - 30) {
                jobs.remove(&id);
            }
        }
        let mut transfers = jobs
            .values()
            .map(|j| j.view.lock().unwrap().clone())
            .collect::<Vec<_>>();
        transfers.sort_by_key(|j| std::cmp::Reverse(j.started));
        let interrupted = fs::read_dir(core.data.join("receipts"))
            .into_iter()
            .flatten()
            .filter_map(|entry| entry.ok())
            .take(100)
            .filter_map(|entry| {
                let bytes = fs::read(entry.path()).ok()?;
                if bytes.len() > 8192 {
                    return None;
                }
                let value: Value = serde_json::from_slice(&bytes).ok()?;
                let id = value["id"].as_str()?;
                if jobs.contains_key(id) {
                    return None;
                }
                Some(value["path"].as_str()?.to_string())
            })
            .collect();
        Status {
            running: !core.stopped.load(Ordering::Relaxed),
            id: core.id.clone(),
            alias: core.alias.clone(),
            code: core.id[..12].to_string(),
            addresses: core.addresses.clone(),
            port: core.port,
            peers: peers.values().cloned().collect(),
            transfers,
            discovery_error: core.discovery_error.lock().unwrap().clone(),
            interrupted,
        }
    }
    pub fn probe(&self, address: &str) -> Result<Peer> {
        if self.0.stopped.load(Ordering::Relaxed) {
            return Err("请先开启附近互传".into());
        }
        let address: SocketAddr = address
            .trim()
            .parse()
            .map_err(|_| "请输入 IP:端口，例如 192.168.1.10:54435")?;
        let (mut stream, id) = tls::client(address, None)?;
        tls::write_json(&mut stream, &Request::Info)?;
        let info: Value = tls::read_json(&mut stream)?;
        if info["id"].as_str() != Some(&id) || info["version"] != 1 || id == self.0.id {
            return Err("不是另一台 RHFiles 互传设备".into());
        }
        let peer = Peer {
            id: id.clone(),
            alias: label(info["alias"].as_str().unwrap_or("RHFiles")),
            address: address.to_string(),
            code: id[..12].to_string(),
            seen: now_ms(),
            manual: true,
        };
        self.0.peers.lock().unwrap().insert(id, peer.clone());
        Ok(peer)
    }
    pub fn accept(&self, id: &str, destination: PathBuf) -> Result<()> {
        let job = self
            .0
            .jobs
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or("接收请求已失效")?;
        job.check(&self.0)?;
        let path = destination.canonicalize().map_err(failure)?;
        if !path.is_dir() {
            return Err("请先选择接收文件夹".into());
        }
        let mut view = job.view.lock().unwrap();
        if view.direction != "receive"
            || view.state != "waiting"
            || now_ms().saturating_sub(view.started) > 120000
        {
            return Err("接收请求已失效".into());
        }
        *job.destination.lock().unwrap() = Some(path);
        view.state = "accepted".into();
        Ok(())
    }
    pub fn cancel(&self, id: &str) -> Result<()> {
        let job = self
            .0
            .jobs
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or("传输不存在")?;
        job.canceled.store(true, Ordering::Relaxed);
        job.update(|v| {
            if active(&v.state) {
                v.state = "canceled".into();
                v.message = "用户取消；来源未删除".into()
            }
        });
        Ok(())
    }
    pub fn send(
        &self,
        peer_id: &str,
        confirmed_fingerprint: &str,
        sources: Vec<PathBuf>,
    ) -> Result<String> {
        if self.0.stopped.load(Ordering::Relaxed) {
            return Err("请先开启附近互传".into());
        }
        let peer = self
            .0
            .peers
            .lock()
            .unwrap()
            .get(peer_id)
            .cloned()
            .ok_or("设备已离线，请刷新或输入地址")?;
        if peer.id != confirmed_fingerprint {
            return Err("请核对接收端的十二位接收码".into());
        }
        if self
            .0
            .jobs
            .lock()
            .unwrap()
            .values()
            .filter(|job| active(&job.state()))
            .count()
            >= 4
        {
            return Err("最多同时进行四个传输".into());
        }
        let id = random()?;
        let job = Arc::new(Job {
            view: Mutex::new(Transfer {
                id: id.clone(),
                direction: "send".into(),
                peer: peer.alias.clone(),
                address: peer.address.clone(),
                state: "scanning".into(),
                bytes: 0,
                total: 0,
                count: 0,
                preview: vec![],
                current: String::new(),
                message: String::new(),
                output: String::new(),
                started: now_ms(),
            }),
            entries: vec![],
            token: String::new(),
            canceled: AtomicBool::new(false),
            destination: Mutex::new(None),
        });
        self.0.jobs.lock().unwrap().insert(id.clone(), job.clone());
        let core = self.0.clone();
        std::thread::spawn(move || {
            if let Err(error) = send(&core, &job, &peer, sources) {
                job.update(|v| {
                    v.state = if job.canceled.load(Ordering::Relaxed)
                        || core.stopped.load(Ordering::Relaxed)
                    {
                        "canceled"
                    } else {
                        "failed"
                    }
                    .into();
                    v.message = error;
                })
            }
        });
        Ok(id)
    }
}
fn authentication(core: &Core, id: &str, token: &str) -> Result<Arc<Job>> {
    let job = core
        .jobs
        .lock()
        .unwrap()
        .get(id)
        .cloned()
        .ok_or("传输请求不存在")?;
    let expected = job.token.as_bytes();
    let given = token.as_bytes();
    let mut difference = expected.len() ^ given.len();
    for (i, b) in expected.iter().enumerate() {
        difference |= (b ^ given.get(i).copied().unwrap_or(0)) as usize;
    }
    if difference != 0 || expected.is_empty() {
        return Err("传输授权无效".into());
    }
    job.check(core)?;
    {
        let view = job.view.lock().unwrap();
        if matches!(view.state.as_str(), "waiting" | "accepted")
            && now_ms().saturating_sub(view.started) > 120000
        {
            return Err("接收请求已超时".into());
        }
    }
    Ok(job)
}
fn handle(core: &Arc<Core>, socket: TcpStream, address: SocketAddr) -> Result<()> {
    // Winsock may inherit nonblocking mode from the listening socket.
    socket.set_nonblocking(false).map_err(failure)?;
    socket
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(failure)?;
    socket
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(failure)?;
    let connection = rustls::ServerConnection::new(core.tls.clone()).map_err(failure)?;
    let mut stream = rustls::StreamOwned::new(connection, socket);
    let request: Request = tls::read_json(&mut stream)?;
    let result = (|| match request {
        Request::Info => tls::write_json(
            &mut stream,
            &json!({"version":1,"id":core.id,"alias":core.alias,"port":core.port}),
        ),
        Request::Offer {
            version,
            alias,
            entries,
        } => {
            if version != 1 {
                return Err("不支持的互传协议".into());
            }
            let total = files::validate(&entries)?;
            let mut jobs = core.jobs.lock().unwrap();
            if jobs.values().filter(|j| active(&j.state())).count() >= 4 {
                return Err("接收端传输队列已满".into());
            }
            let id = random()?;
            let token = format!("{}{}", random()?, random()?);
            let job = Arc::new(Job {
                view: Mutex::new(Transfer {
                    id: id.clone(),
                    direction: "receive".into(),
                    peer: label(&alias),
                    address: address.ip().to_string(),
                    state: "waiting".into(),
                    bytes: 0,
                    total,
                    count: entries.len(),
                    preview: entries.iter().take(8).map(|e| e.path.clone()).collect(),
                    current: String::new(),
                    message: String::new(),
                    output: String::new(),
                    started: now_ms(),
                }),
                entries,
                token: token.clone(),
                canceled: AtomicBool::new(false),
                destination: Mutex::new(None),
            });
            jobs.insert(id.clone(), job);
            drop(jobs);
            tls::write_json(
                &mut stream,
                &json!({"state":"waiting","id":id,"token":token}),
            )
        }
        Request::Check { id, token } => {
            let job = authentication(core, &id, &token)?;
            let view = job.view.lock().unwrap();
            if now_ms().saturating_sub(view.started) > 120000 {
                return Err("接收请求已超时".into());
            }
            tls::write_json(&mut stream, &json!({"state":view.state}))
        }
        Request::Upload { id, token } => {
            let job = authentication(core, &id, &token)?;
            {
                let mut view = job.view.lock().unwrap();
                if view.state != "accepted" || view.direction != "receive" {
                    return Err("接收端尚未同意或传输已开始".into());
                }
                view.state = "receiving".into();
                view.started = now_ms();
            }
            let received = receive(core, &job, &id, &mut stream);
            if let Err(error) = &received {
                job.update(|v| {
                    if v.state == "completed" {
                        v.message = "副本已完整保存，但发送端确认可能失败".into()
                    } else {
                        v.state = if job.canceled.load(Ordering::Relaxed) {
                            "canceled"
                        } else {
                            "failed"
                        }
                        .into();
                        v.message = error.clone()
                    }
                });
            }
            received
        }
    })();
    if let Err(error) = &result {
        let _ = tls::write_json(&mut stream, &json!({"state":"error","message":error}));
    }
    result
}
fn receive(core: &Core, job: &Job, id: &str, stream: &mut (impl Read + Write)) -> Result<()> {
    let destination = job
        .destination
        .lock()
        .unwrap()
        .clone()
        .ok_or("未选择接收文件夹")?;
    let stage = files::Staging::new(&destination, &core.data.join("receipts"), id)?;
    let mut buffer = vec![0; 64 * 1024];
    for entry in &job.entries {
        job.check(core)?;
        job.update(|v| v.current = entry.path.clone());
        let path = stage.child(&entry.path)?;
        if entry.is_dir {
            fs::create_dir_all(&path).map_err(failure)?;
            continue;
        }
        fs::create_dir_all(path.parent().ok_or("无效的接收路径")?).map_err(failure)?;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(failure)?;
        let mut remaining = entry.size;
        let mut hash = Sha256::new();
        while remaining > 0 {
            job.check(core)?;
            let count = buffer.len().min(remaining as usize);
            stream.read_exact(&mut buffer[..count]).map_err(failure)?;
            file.write_all(&buffer[..count]).map_err(failure)?;
            hash.update(&buffer[..count]);
            remaining -= count as u64;
            job.update(|v| v.bytes += count as u64);
        }
        let mut expected = [0; 32];
        stream.read_exact(&mut expected).map_err(failure)?;
        if hash.finalize().as_slice() != expected {
            return Err("传输校验失败；未保存为完成的文件".into());
        }
        file.sync_all().map_err(failure)?;
    }
    let done: Value = tls::read_json(stream)?;
    if done["done"] != true {
        return Err("接收的数据不完整".into());
    }
    job.check(core)?;
    job.update(|v| v.state = "verifying".into());
    let output = stage.publish(id)?;
    job.update(|v| {
        v.state = "completed".into();
        v.output = output.to_string_lossy().into_owned();
    });
    // A lost final acknowledgement may leave the sender uncertain, but it can
    // never cause source deletion or overwrite a previously received batch.
    tls::write_json(stream, &json!({"state":"completed"}))
}
fn send(core: &Core, job: &Job, peer: &Peer, paths: Vec<PathBuf>) -> Result<()> {
    let sources = files::scan(&paths, &job.canceled)?;
    job.check(core)?;
    let total = files::validate(&sources.entries)?;
    job.update(|v| {
        v.state = "waiting".into();
        v.total = total;
        v.count = sources.entries.len();
        v.preview = sources
            .entries
            .iter()
            .take(8)
            .map(|e| e.path.clone())
            .collect();
    });
    let address: SocketAddr = peer.address.parse().map_err(failure)?;
    let (mut stream, _) = tls::client(address, Some(peer.id.clone()))?;
    tls::write_json(
        &mut stream,
        &Request::Offer {
            version: 1,
            alias: core.alias.clone(),
            entries: sources.entries.clone(),
        },
    )?;
    let reply: Value = tls::read_json(&mut stream)?;
    drop(stream);
    let id = reply["id"]
        .as_str()
        .ok_or_else(|| {
            reply["message"]
                .as_str()
                .unwrap_or("对端未接受发送请求")
                .to_string()
        })?
        .to_string();
    let token = reply["token"]
        .as_str()
        .ok_or("对端未提供传输授权")?
        .to_string();
    let deadline = now_ms() + 120000;
    loop {
        job.check(core)?;
        if now_ms() > deadline {
            return Err("等待接收超时，未删除来源".into());
        }
        let (mut stream, _) = tls::client(address, Some(peer.id.clone()))?;
        tls::write_json(
            &mut stream,
            &Request::Check {
                id: id.clone(),
                token: token.clone(),
            },
        )?;
        let reply: Value = tls::read_json(&mut stream)?;
        match reply["state"].as_str() {
            Some("accepted") => break,
            Some("waiting") => {}
            _ => {
                return Err(reply["message"]
                    .as_str()
                    .unwrap_or("对方取消或拒绝接收")
                    .into())
            }
        }
        for _ in 0..10 {
            job.check(core)?;
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    job.check(core)?;
    let (mut stream, _) = tls::client(address, Some(peer.id.clone()))?;
    tls::write_json(&mut stream, &Request::Upload { id, token })?;
    job.update(|v| {
        v.state = "sending".into();
        v.started = now_ms();
    });
    let mut buffer = vec![0; 64 * 1024];
    for (entry, path) in sources.entries.iter().zip(&sources.paths) {
        job.check(core)?;
        job.update(|v| v.current = entry.path.clone());
        if entry.is_dir {
            continue;
        }
        let before = fs::symlink_metadata(path).map_err(failure)?;
        if before.file_type().is_symlink() || !before.is_file() || before.len() != entry.size {
            return Err("来源在扫描后发生变化，已停止".into());
        }
        let mut file = fs::File::open(path).map_err(failure)?;
        let mut remaining = entry.size;
        let mut hash = Sha256::new();
        while remaining > 0 {
            job.check(core)?;
            let count = buffer.len().min(remaining as usize);
            file.read_exact(&mut buffer[..count]).map_err(failure)?;
            stream.write_all(&buffer[..count]).map_err(failure)?;
            hash.update(&buffer[..count]);
            remaining -= count as u64;
            job.update(|v| v.bytes += count as u64);
        }
        if file.metadata().map_err(failure)?.modified().ok() != before.modified().ok()
            || fs::metadata(path).map_err(failure)?.len() != entry.size
        {
            return Err("发送期间来源发生变化，接收端会丢弃未完成副本".into());
        }
        stream.write_all(&hash.finalize()).map_err(failure)?;
    }
    tls::write_json(&mut stream, &json!({"done":true}))?;
    job.update(|v| v.state = "verifying".into());
    let reply: Value = tls::read_json(&mut stream)?;
    if reply["state"] != "completed" {
        return Err(reply["message"]
            .as_str()
            .unwrap_or("接收端未确认保存成功")
            .into());
    }
    job.update(|v| v.state = "completed".into());
    Ok(())
}
#[derive(Deserialize, Serialize)]
struct Announcement {
    protocol: String,
    id: String,
    alias: String,
    port: u16,
    announce: bool,
}
fn discover(core: &Arc<Core>) -> Result<()> {
    let socket = socket2::Socket::new(
        socket2::Domain::IPV4,
        socket2::Type::DGRAM,
        Some(socket2::Protocol::UDP),
    )
    .map_err(failure)?;
    socket.set_reuse_address(true).map_err(failure)?;
    socket
        .bind(&SocketAddr::from((Ipv4Addr::UNSPECIFIED, PORT)).into())
        .map_err(failure)?;
    let socket: UdpSocket = socket.into();
    socket
        .join_multicast_v4(&GROUP, &Ipv4Addr::UNSPECIFIED)
        .map_err(failure)?;
    socket.set_multicast_ttl_v4(1).map_err(failure)?;
    socket
        .set_read_timeout(Some(Duration::from_millis(300)))
        .map_err(failure)?;
    let packet = |announce| {
        serde_json::to_vec(&Announcement {
            protocol: "rhfiles-nearby/1".into(),
            id: core.id.clone(),
            alias: core.alias.clone(),
            port: core.port,
            announce,
        })
        .map_err(failure)
    };
    let mut last = 0;
    let mut buffer = [0; 8192];
    while !core.stopped.load(Ordering::Relaxed) {
        if now_ms().saturating_sub(last) > 3000 {
            socket
                .send_to(&packet(true)?, (GROUP, PORT))
                .map_err(failure)?;
            last = now_ms();
        }
        if let Ok((count, address)) = socket.recv_from(&mut buffer) {
            if !lan_address(address.ip()) {
                continue;
            }
            let Ok(peer) = serde_json::from_slice::<Announcement>(&buffer[..count]) else {
                continue;
            };
            if peer.protocol != "rhfiles-nearby/1"
                || peer.id == core.id
                || peer.id.len() != 64
                || !peer.id.bytes().all(|b| b.is_ascii_hexdigit())
                || peer.port == 0
            {
                continue;
            }
            let mut peers = core.peers.lock().unwrap();
            if peers.len() < 64 || peers.contains_key(&peer.id) {
                peers.insert(
                    peer.id.clone(),
                    Peer {
                        id: peer.id.clone(),
                        code: peer.id[..12].into(),
                        alias: label(&peer.alias),
                        address: SocketAddr::new(address.ip(), peer.port).to_string(),
                        seen: now_ms(),
                        manual: false,
                    },
                );
            }
            drop(peers);
            if peer.announce {
                let _ = socket.send_to(&packet(false)?, address);
            }
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests;
