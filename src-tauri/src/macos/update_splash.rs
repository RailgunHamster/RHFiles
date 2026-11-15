//! Run the AppKit update window outside the bundle being replaced.
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

const HELPER: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/RHFiles.UpdateWindow"));
const LOGO: &[u8] = include_bytes!("../../icons/rhfiles-icon-v4-256.png");
const SESSION_FILES: &[&str] = &[
    "RHFiles.UpdateWindow", "logo.png", "config.json", "progress.jsonl",
    "ready", "displayed.json", "restart.json", "started",
];

#[derive(Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Appearance {
    theme: String,
    language: String,
    bg: String,
    card: String,
    text: String,
    accent: String,
    border: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Config<'a> {
    from: &'a str,
    to: &'a str,
    phase: &'a str,
    parent_pid: u32,
    appearance: Appearance,
}

#[derive(Serialize, Deserialize)]
struct Restart {
    executable: PathBuf,
    version: String,
    previous_pid: u32,
}

pub struct Session {
    child: Option<Child>,
    directory: Option<tempfile::TempDir>,
    progress: File,
    version: String,
}

impl Session {
    pub fn shows(&mut self, version: &str) -> bool {
        self.version == version
            && self.child.as_mut().is_some_and(|child| matches!(child.try_wait(), Ok(None)))
    }

    pub fn send(&mut self, value: &impl Serialize) -> Result<(), String> {
        let mut line = serde_json::to_vec(value).map_err(|e| e.to_string())?;
        line.push(b'\n');
        if line.len() > 8192 {
            return Err("Update progress message is too long".into());
        }
        self.progress.write_all(&line).map_err(|e| e.to_string())
    }

    pub fn handoff(mut self, executable: PathBuf) -> Result<(), String> {
        let restart = Restart { executable, version: self.version.clone(), previous_pid: std::process::id() };
        let path = self.directory.as_ref().ok_or("Missing update window directory")?.path();
        let data = serde_json::to_vec(&restart).map_err(|e| e.to_string())?;
        write_new(&path.join("restart.json"), &data, 0o600)?;
        self.send(&serde_json::json!({"phase":"restarting"}))?;
        self.child.take();
        if let Some(dir) = self.directory.take() {
            let _ = dir.keep();
        }
        Ok(())
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        if let Some(child) = &mut self.child {
            if matches!(child.try_wait(), Ok(None)) {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn base() -> Result<PathBuf, String> {
    Ok(crate::profile::data_dir()?.join("update-splash"))
}

fn write_new(path: &Path, bytes: &[u8], mode: u32) -> Result<(), String> {
    OpenOptions::new().create_new(true).write(true).mode(mode).open(path)
        .and_then(|mut file| file.write_all(bytes)).map_err(|e| e.to_string())
}

fn sessions(base: &Path) -> impl Iterator<Item = PathBuf> {
    fs::read_dir(base).into_iter().flatten().filter_map(Result::ok).take(128)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("session-")
            && entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
}

fn cleanup_stale(base: &Path) {
    for path in sessions(base) {
        let stale = fs::metadata(&path).and_then(|meta| meta.modified()).ok()
            .and_then(|time| time.elapsed().ok()).is_some_and(|age| age > Duration::from_secs(7 * 86400));
        if stale {
            for name in SESSION_FILES { let _ = fs::remove_file(path.join(name)); }
            let _ = fs::remove_dir(path);
        }
    }
}

pub fn launch(from: &str, to: &str, phase: &str, appearance: Appearance) -> Result<Session, String> {
    let base = base()?;
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    cleanup_stale(&base);
    let dir = tempfile::Builder::new().prefix("session-").tempdir_in(&base).map_err(|e| e.to_string())?;
    let path = dir.path();
    let config = Config { from, to, phase, parent_pid: std::process::id(), appearance };
    let config = serde_json::to_vec(&config).map_err(|e| e.to_string())?;
    write_new(&path.join("RHFiles.UpdateWindow"), HELPER, 0o700)?;
    write_new(&path.join("logo.png"), LOGO, 0o600)?;
    write_new(&path.join("config.json"), &config, 0o600)?;
    let progress = OpenOptions::new().create_new(true).append(true).mode(0o600)
        .open(path.join("progress.jsonl")).map_err(|e| e.to_string())?;
    let ready = path.join("ready");
    let child = Command::new(path.join("RHFiles.UpdateWindow")).arg(path)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn().map_err(|e| e.to_string())?;
    let mut session = Session { child: Some(child), directory: Some(dir), progress, version: to.into() };
    let deadline = Instant::now() + Duration::from_secs(4);
    while Instant::now() < deadline && session.shows(to) {
        if ready.is_file() { return Ok(session); }
        std::thread::sleep(Duration::from_millis(25));
    }
    Err("The independent update window did not become visible".into())
}

fn mark_ready_at(base: &Path, executable: &Path, version: &str, pid: u32) {
    for path in sessions(base) {
        let receipt = File::open(path.join("restart.json")).ok().and_then(|file| {
            let mut bytes = Vec::new();
            file.take(16_385).read_to_end(&mut bytes).ok()?;
            (bytes.len() <= 16_384).then(|| serde_json::from_slice::<Restart>(&bytes).ok()).flatten()
        });
        if receipt.is_some_and(|receipt| receipt.version == version && receipt.executable == executable
            && receipt.previous_pid != pid)
        {
            let _ = write_new(&path.join("started"), pid.to_string().as_bytes(), 0o600);
        }
    }
}

pub fn mark_ready(version: &str) -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    mark_ready_at(&base()?, &executable, version, std::process::id());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_restarted_matching_application_acknowledges_update_completion() {
        let base = tempfile::tempdir().unwrap();
        let session = base.path().join("session-test");
        fs::create_dir(&session).unwrap();
        let executable = PathBuf::from("/Applications/RHFiles.app/Contents/MacOS/rhfiles");
        let receipt = Restart { executable: executable.clone(), version: "0.1.132".into(), previous_pid: 10 };
        fs::write(session.join("restart.json"), serde_json::to_vec(&receipt).unwrap()).unwrap();
        mark_ready_at(base.path(), &executable, "0.1.131", 11);
        mark_ready_at(base.path(), &executable, "0.1.132", 10);
        mark_ready_at(base.path(), Path::new("/tmp/other"), "0.1.132", 11);
        assert!(!session.join("started").exists());
        mark_ready_at(base.path(), &executable, "0.1.132", 11);
        assert_eq!(fs::read_to_string(session.join("started")).unwrap(), "11");
    }
}
