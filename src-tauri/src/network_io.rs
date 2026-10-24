//! Windows UNC reads may remain inside the redirector after a UI timeout.
//! Run bounded, read-only operations in a headless child, not an abandoned thread.
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use std::os::windows::{io::AsRawHandle, process::CommandExt};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    process::{Child, Command, Stdio},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use windows::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
        SetInformationJobObject,
    },
};

const WORKER_FLAG: &str = "--rhfiles-network-worker";
const TIMEOUT: Duration = Duration::from_secs(6);
const COOLDOWN: Duration = Duration::from_secs(30);
const MAX_RESPONSE: usize = 64 * 1024 * 1024;
const MAX_WORKERS: usize = 4;

#[derive(Debug, Serialize, Deserialize)]
pub enum Request {
    ListDir(String),
    FileInfo(String),
    Tree(String),
    Exists(String),
    Shares(String),
    Browse,
    ReadText {
        path: String,
        limit: usize,
    },
    CopyUpdate {
        source: String,
        destination: String,
    },
    #[cfg(debug_assertions)]
    TestWait(u64),
}

#[derive(Serialize, Deserialize)]
enum Reply {
    Done(Result<Value, String>),
    Progress { bytes: u64, total: u64 },
}

#[derive(Default)]
struct Gate {
    active: usize,
    failed: HashMap<String, Instant>,
}
static GATE: OnceLock<Mutex<Gate>> = OnceLock::new();

impl Gate {
    fn enter(&mut self, host: &str, now: Instant) -> Result<(), String> {
        self.failed.retain(|_, until| *until > now);
        if self.failed.contains_key(host) {
            return Err(format!(
                "[network_cooldown] Network access to {host} recently timed out; retry in 30 seconds."
            ));
        }
        if self.active >= MAX_WORKERS {
            return Err("[network_busy] Network requests are busy; retry shortly.".into());
        }
        self.active += 1;
        Ok(())
    }
}

struct Lease;
impl Drop for Lease {
    fn drop(&mut self) {
        if let Ok(mut gate) = GATE.get_or_init(Default::default).lock() {
            gate.active = gate.active.saturating_sub(1);
        }
    }
}

pub fn network_key(path: &str) -> Option<String> {
    let normalized = path.replace('/', "\\");
    let unc = if normalized
        .get(..8)
        .is_some_and(|p| p.eq_ignore_ascii_case("\\\\?\\UNC\\"))
    {
        &normalized[8..]
    } else if normalized.starts_with("\\\\.\\") {
        return None;
    } else if let Some(unc) = normalized
        .strip_prefix("\\\\")
        .filter(|_| !normalized.starts_with("\\\\?\\"))
    {
        unc
    } else {
        let drive = normalized
            .strip_prefix("\\\\?\\")
            .unwrap_or(&normalized)
            .as_bytes();
        if drive.len() >= 2 && drive[0].is_ascii_alphabetic() && drive[1] == b':' {
            let root = [
                drive[0].to_ascii_uppercase() as u16,
                b':' as u16,
                b'\\' as u16,
                0,
            ];
            if unsafe { GetDriveTypeW(root.as_ptr()) } == 4 {
                return Some(format!(
                    "mapped-drive:{}",
                    drive[0].to_ascii_uppercase() as char
                ));
            }
        }
        return None;
    };
    let host = unc.split('\\').next()?;
    (!host.is_empty()).then(|| host.to_lowercase())
}

pub fn remote<T: DeserializeOwned>(path: &str, request: Request) -> Option<Result<T, String>> {
    network_key(path).map(|host| execute(&host, request, TIMEOUT, None))
}

pub fn read_text(path: &Path, limit: usize) -> Result<String, String> {
    let path = path.to_string_lossy().into_owned();
    if let Some(result) = remote(
        &path,
        Request::ReadText {
            path: path.clone(),
            limit,
        },
    ) {
        return result;
    }
    read_text_direct(&path, limit)
}

fn read_text_direct(path: &str, limit: usize) -> Result<String, String> {
    let limit = limit.min(MAX_RESPONSE / 2);
    let mut text = String::new();
    std::fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(limit as u64 + 1)
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;
    if text.len() > limit {
        return Err(format!("Metadata exceeds the {limit}-byte safety limit"));
    }
    Ok(text)
}

pub fn copy_update(
    source: &Path,
    destination: &Path,
    progress: Option<std::sync::mpsc::Sender<i16>>,
) -> Result<(), String> {
    let source = source.to_string_lossy().into_owned();
    // Destination is Velopack's local staging file; never allow another network
    // write to hold up the parent or silently truncate an existing user file.
    if network_key(&destination.to_string_lossy()).is_some() {
        return Err("Update staging directory must be local".into());
    }
    let host = network_key(&source).ok_or("Expected a network update source")?;
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let staging = destination.with_extension(format!(
        "rhfiles-partial-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    let mut callback = |bytes: u64, total: u64| {
        if let Some(sender) = &progress {
            let _ = sender.send(if total == 0 {
                0
            } else {
                (bytes.saturating_mul(100) / total).min(100) as i16
            });
        }
    };
    let result = execute::<()>(
        &host,
        Request::CopyUpdate {
            source,
            destination: staging.to_string_lossy().into_owned(),
        },
        Duration::from_secs(30),
        Some(&mut callback),
    );
    let result =
        result.and_then(|()| std::fs::rename(&staging, destination).map_err(|e| e.to_string()));
    if result.is_err() {
        let _ = std::fs::remove_file(&staging);
    }
    result
}

struct Worker(Child, HANDLE);
impl Drop for Worker {
    fn drop(&mut self) {
        // Never wait() on a potentially stuck kernel I/O during error cleanup.
        if !matches!(self.0.try_wait(), Ok(Some(_))) {
            let _ = self.0.kill();
        }
        unsafe {
            let _ = CloseHandle(self.1);
        }
        let until = Instant::now() + Duration::from_millis(200);
        while matches!(self.0.try_wait(), Ok(None)) && Instant::now() < until {
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

fn spawn_worker(command: &mut Command) -> Result<Worker, String> {
    let job = unsafe { CreateJobObjectW(None, None) }.map_err(|e| e.to_string())?;
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if let Err(error) = unsafe {
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &limits as *const _ as *const std::ffi::c_void,
            std::mem::size_of_val(&limits) as u32,
        )
    } {
        unsafe {
            let _ = CloseHandle(job);
        }
        return Err(error.to_string());
    }
    let child = match command
        .creation_flags(0x08000000)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            unsafe {
                let _ = CloseHandle(job);
            }
            return Err(error.to_string());
        }
    };
    let worker = Worker(child, job);
    unsafe { AssignProcessToJobObject(job, HANDLE(worker.0.as_raw_handle())) }
        .map_err(|e| e.to_string())?;
    Ok(worker)
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetDriveTypeW(root: *const u16) -> u32;
    fn PeekNamedPipe(
        pipe: *mut std::ffi::c_void,
        buffer: *mut std::ffi::c_void,
        size: u32,
        read: *mut u32,
        available: *mut u32,
        left: *mut u32,
    ) -> i32;
}

fn read_available(child: &mut Child, pending: &mut Vec<u8>) -> Result<bool, String> {
    let stdout = child
        .stdout
        .as_mut()
        .ok_or("Missing network worker output")?;
    let mut available = 0;
    if unsafe {
        PeekNamedPipe(
            stdout.as_raw_handle(),
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            &mut available,
            std::ptr::null_mut(),
        )
    } == 0
    {
        let error = std::io::Error::last_os_error();
        return if error.raw_os_error() == Some(109) {
            Ok(false)
        } else {
            Err(error.to_string())
        };
    }
    if available > 0 {
        let mut bytes = [0u8; 32 * 1024];
        let count = stdout
            .read(&mut bytes[..(available as usize).min(32 * 1024)])
            .map_err(|e| e.to_string())?;
        if pending.len() + count > MAX_RESPONSE {
            return Err("Network response exceeds the 64 MiB safety limit".into());
        }
        pending.extend_from_slice(&bytes[..count]);
    }
    Ok(available > 0)
}

fn run_child<T: DeserializeOwned>(
    mut child: Worker,
    timeout: Duration,
    mut progress: Option<&mut dyn FnMut(u64, u64)>,
) -> Result<T, String> {
    let start = Instant::now();
    let mut last_progress = start;
    let mut pending = Vec::new();
    let mut scanned = 0;
    loop {
        if last_progress.elapsed() >= timeout || start.elapsed() >= Duration::from_secs(30 * 60) {
            return Err("[timed_out] Network operation timed out; its isolated worker was terminated. Check the server and DNS, or try its full host name.".into());
        }
        let read = read_available(&mut child.0, &mut pending)?;
        while let Some(offset) = pending[scanned..].iter().position(|b| *b == b'\n') {
            let end = scanned + offset;
            let line: Vec<_> = pending.drain(..=end).collect();
            scanned = 0;
            let reply: Reply = serde_json::from_slice(&line)
                .map_err(|e| format!("Invalid network worker response: {e}"))?;
            match reply {
                Reply::Done(result) => {
                    return serde_json::from_value(result?).map_err(|e| e.to_string());
                }
                Reply::Progress { bytes, total } => {
                    last_progress = Instant::now();
                    if let Some(callback) = progress.as_mut() {
                        callback(bytes, total);
                    }
                }
            }
        }
        scanned = pending.len();
        if !read {
            if let Some(status) = child.0.try_wait().map_err(|e| e.to_string())? {
                return Err(format!(
                    "Network worker exited without a complete response: {status}"
                ));
            }
            std::thread::sleep(Duration::from_millis(15));
        }
    }
}

pub fn execute<T: DeserializeOwned>(
    host: &str,
    request: Request,
    timeout: Duration,
    progress: Option<&mut dyn FnMut(u64, u64)>,
) -> Result<T, String> {
    let gate = GATE.get_or_init(Default::default);
    gate.lock()
        .map_err(|e| e.to_string())?
        .enter(host, Instant::now())?;
    let _lease = Lease;
    let mut command = Command::new(std::env::current_exe().map_err(|e| e.to_string())?);
    command
        .arg(WORKER_FLAG)
        .arg(serde_json::to_string(&request).map_err(|e| e.to_string())?);
    let child = spawn_worker(&mut command)
        .map_err(|e| format!("Cannot launch isolated network worker: {e}"))?;
    let result = run_child(child, timeout, progress);
    if result.as_ref().is_err_and(|e| e.starts_with("[timed_out]")) {
        if let Ok(mut gate) = gate.lock() {
            gate.failed
                .insert(host.to_string(), Instant::now() + COOLDOWN);
        }
    }
    result
}

fn send(reply: Reply) -> Result<(), String> {
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    serde_json::to_writer(&mut out, &reply).map_err(|e| e.to_string())?;
    out.write_all(b"\n")
        .and_then(|_| out.flush())
        .map_err(|e| e.to_string())
}

fn dispatch(request: Request) -> Result<Value, String> {
    match request {
        Request::ListDir(path) => serde_json::to_value(crate::file_ops::list_dir_direct(path)?),
        Request::FileInfo(path) => {
            serde_json::to_value(crate::file_ops::get_file_info_direct(path)?)
        }
        Request::Tree(path) => serde_json::to_value(crate::file_ops::get_dir_tree_direct(path)?),
        Request::Exists(path) => serde_json::to_value(crate::file_ops::path_exists_direct(&path)?),
        Request::Shares(server) => {
            serde_json::to_value(crate::network::list_shares_direct(server)?)
        }
        Request::Browse => serde_json::to_value(crate::network::browse_network_direct()?),
        Request::ReadText { path, limit } => serde_json::to_value(read_text_direct(&path, limit)?),
        Request::CopyUpdate {
            source,
            destination,
        } => {
            let mut input = std::fs::File::open(source).map_err(|e| e.to_string())?;
            let total = input.metadata().map_err(|e| e.to_string())?.len();
            let mut output = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(destination)
                .map_err(|e| e.to_string())?;
            let mut buffer = vec![0u8; 1024 * 1024];
            let mut copied = 0;
            loop {
                let count = input.read(&mut buffer).map_err(|e| e.to_string())?;
                if count == 0 {
                    break;
                }
                output
                    .write_all(&buffer[..count])
                    .map_err(|e| e.to_string())?;
                copied += count as u64;
                send(Reply::Progress {
                    bytes: copied,
                    total,
                })?;
            }
            output.flush().map_err(|e| e.to_string())?;
            if copied != total {
                return Err("Update package changed or was truncated during download".into());
            }
            Ok(Value::Null)
        }
        #[cfg(debug_assertions)]
        Request::TestWait(ms) => {
            std::thread::sleep(Duration::from_millis(ms));
            Ok(Value::Null)
        }
    }
    .map_err(|e| e.to_string())
}

/// Called before Velopack, profile initialization, single-instance handling or UI.
pub fn run_if_requested() -> bool {
    let mut args = std::env::args().skip(1);
    let flag = args.next();
    #[cfg(debug_assertions)]
    if flag.as_deref() == Some("--rhfiles-network-probe") {
        // Test the real parent/child protocol without inducing an OS DNS hang.
        #[derive(Deserialize)]
        struct Probe {
            request: Request,
            timeout_ms: u64,
            #[serde(default)]
            repeat: bool,
            #[serde(default)]
            commit_update: bool,
        }
        let result = (|| -> Result<Value, String> {
            let probe: Probe = serde_json::from_str(&args.next().ok_or("Missing probe")?)
                .map_err(|e| e.to_string())?;
            let timeout = Duration::from_millis(probe.timeout_ms);
            let first = if probe.commit_update {
                match probe.request {
                    Request::CopyUpdate {
                        source,
                        destination,
                    } => copy_update(Path::new(&source), Path::new(&destination), None)
                        .map(|()| Value::Null),
                    _ => Err("Expected CopyUpdate".into()),
                }
            } else {
                execute::<Value>("test-host", probe.request, timeout, None)
            };
            let second = probe
                .repeat
                .then(|| execute::<Value>("test-host", Request::TestWait(0), timeout, None));
            let independent = probe.repeat.then(|| {
                execute::<Value>(
                    "other-host",
                    Request::TestWait(0),
                    Duration::from_secs(5),
                    None,
                )
            });
            Ok(serde_json::json!({"first":first,"second":second,"independent":independent}))
        })();
        let _ = send(Reply::Done(result));
        return true;
    }
    if flag.as_deref() != Some(WORKER_FLAG) {
        return false;
    }
    let result = args
        .next()
        .ok_or_else(|| "Missing worker request".to_string())
        .and_then(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
        .and_then(dispatch);
    let _ = send(Reply::Done(result));
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    // These fixtures start the full Windows PowerShell/.NET interpreter,
    // unlike production's lightweight worker entry point. Hosted CI can take
    // over ten seconds to cold-start several interpreters concurrently. Keep
    // fixture startup serialized/bounded; do not change the real 6 s timeout
    // or the separate 150 ms kill/cleanup assertion below.
    static SHELL_FIXTURE: Mutex<()> = Mutex::new(());
    const SHELL_REPLY_TIMEOUT: Duration = Duration::from_secs(30);
    #[test]
    fn unc_identity_is_normalized_without_resolving_or_changing_hosts() {
        for path in [
            r"\\SERVER\share\a",
            "//server/share/a",
            r"\\?\UNC\Server\share",
        ] {
            assert_eq!(network_key(path).as_deref(), Some("server"));
        }
        for path in [
            r"C:\files",
            r"\\?\C:\files",
            r"\\.\pipe\local",
            "https://server/file",
        ] {
            assert_eq!(network_key(path), None);
        }
        assert_ne!(
            network_key(r"\\server\share"),
            network_key(r"\\server.local\share")
        );
    }
    #[test]
    fn cooldown_expires_and_does_not_block_other_hosts() {
        let mut gate = Gate::default();
        let now = Instant::now();
        gate.failed.insert("server".into(), now + COOLDOWN);
        assert!(
            gate.enter("server", now)
                .unwrap_err()
                .contains("network_cooldown")
        );
        gate.enter("another", now).unwrap();
        gate.enter("server", now + COOLDOWN).unwrap();
        assert_eq!(gate.active, 2);
    }
    #[test]
    fn network_concurrency_is_bounded() {
        let mut gate = Gate::default();
        for _ in 0..MAX_WORKERS {
            gate.enter("server", Instant::now()).unwrap();
        }
        assert!(gate.enter("server", Instant::now()).is_err());
    }
    #[test]
    fn truncated_and_oversized_metadata_is_rejected() {
        let path =
            std::env::temp_dir().join(format!("rhfiles-network-meta-{}.json", std::process::id()));
        std::fs::write(&path, "123456").unwrap();
        assert!(read_text_direct(path.to_str().unwrap(), 5).is_err());
        assert_eq!(
            read_text_direct(path.to_str().unwrap(), 6).unwrap(),
            "123456"
        );
        std::fs::remove_file(path).unwrap();
    }

    fn test_child(script: &str) -> Worker {
        let exe = std::env::var_os("SystemRoot")
            .map(std::path::PathBuf::from)
            .unwrap()
            .join("System32/WindowsPowerShell/v1.0/powershell.exe");
        let mut command = Command::new(exe);
        command.args(["-NoProfile", "-NonInteractive", "-Command", script]);
        spawn_worker(&mut command).unwrap()
    }

    #[test]
    fn silent_worker_is_actually_terminated_without_blocking_parent() {
        let _fixture = SHELL_FIXTURE.lock().unwrap_or_else(|e| e.into_inner());
        let child = test_child("Start-Sleep -Seconds 60");
        let pid = child.0.id();
        let start = Instant::now();
        let result = run_child::<Value>(child, Duration::from_millis(150), None);
        assert!(result.unwrap_err().contains("[timed_out]"));
        assert!(start.elapsed() < Duration::from_secs(3));
        let output = Command::new("tasklist.exe")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .output()
            .unwrap();
        assert!(!String::from_utf8_lossy(&output.stdout).contains(&format!("\"{pid}\"")));
    }

    #[test]
    fn worker_reply_preserves_false_and_original_errors() {
        let _fixture = SHELL_FIXTURE.lock().unwrap_or_else(|e| e.into_inner());
        let timeout = SHELL_REPLY_TIMEOUT;
        assert!(
            !run_child::<bool>(
                test_child("[Console]::WriteLine('{\"Done\":{\"Ok\":false}}')"),
                timeout,
                None
            )
            .unwrap()
        );
        assert_eq!(
            run_child::<Value>(
                test_child("[Console]::WriteLine('{\"Done\":{\"Err\":\"permission denied\"}}')"),
                timeout,
                None
            )
            .unwrap_err(),
            "permission denied"
        );
    }

    #[test]
    fn invalid_and_truncated_worker_replies_fail_safely() {
        let _fixture = SHELL_FIXTURE.lock().unwrap_or_else(|e| e.into_inner());
        for script in [
            "[Console]::WriteLine('broken-json')",
            "[Console]::Write('{\"Done\":')",
            "exit 3",
        ] {
            let error =
                run_child::<Value>(test_child(script), SHELL_REPLY_TIMEOUT, None).unwrap_err();
            assert!(
                !error.contains("[timed_out]"),
                "Malformed-output test did not reach its parser: {error}"
            );
        }
    }

    #[test]
    fn a_reply_larger_than_a_pipe_buffer_is_drained_without_deadlock() {
        let _fixture = SHELL_FIXTURE.lock().unwrap_or_else(|e| e.into_inner());
        let result: String = run_child(
            test_child("[Console]::WriteLine('{\"Done\":{\"Ok\":\"' + ('x' * 200000) + '\"}}')"),
            SHELL_REPLY_TIMEOUT,
            None,
        )
        .unwrap();
        assert_eq!(result.len(), 200000);
    }

    #[test]
    fn copy_worker_refuses_to_overwrite_an_existing_file() {
        let path =
            std::env::temp_dir().join(format!("rhfiles-network-copy-{}", std::process::id()));
        std::fs::write(&path, "original").unwrap();
        assert!(
            dispatch(Request::CopyUpdate {
                source: path.to_string_lossy().into_owned(),
                destination: path.to_string_lossy().into_owned()
            })
            .is_err()
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "original");
        std::fs::remove_file(path).unwrap();
    }
}
