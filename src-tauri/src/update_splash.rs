//! Best-effort, out-of-installation update transition. Velopack remains the
//! installer and source of failure diagnostics. No timers advance fake percentages.
use serde::Deserialize;
use std::{fs, io::Write, os::windows::{fs::MetadataExt, process::CommandExt}, path::{Path, PathBuf},
    process::{Child, Command, Stdio}, sync::mpsc::{self, SyncSender}, time::{Duration, Instant}};

const HELPER: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/RHFiles.UpdateSplash.exe"));
const LOGO: &[u8] = include_bytes!("../icons/rhfiles-icon-v4-256.png");

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Appearance {
    theme: String, language: String,
    bg: String, card: String, text: String, accent: String, border: String,
}

fn color(value: &str) -> Option<&str> {
    (value.len() == 7 && value.starts_with('#') && value.as_bytes()[1..].iter()
        .all(u8::is_ascii_hexdigit)).then_some(value)
}

fn root(exe: &Path) -> Option<&Path> {
    let parent = exe.parent()?;
    parent.file_name()?.eq_ignore_ascii_case("current").then(|| parent.parent()).flatten()
}

/// An unsuccessful launch/apply drops this guard: terminate the helper and clean
/// only our randomly-created directory. No orphaned 'updating' window on errors.
pub struct Session { child: Option<Child>, directory: Option<tempfile::TempDir>, writer: SyncSender<Vec<u8>> }
impl Session {
    pub fn alive(&mut self) -> bool { self.child.as_mut().is_some_and(|child| matches!(child.try_wait(), Ok(None))) }
    pub fn send(&self, value: &impl serde::Serialize) -> bool {
        let Ok(mut line) = serde_json::to_vec(value) else { return false; };
        if line.len() > 8192 { return false; } line.push(b'\n');
        self.writer.try_send(line).is_ok()
    }
    pub fn handoff(mut self) {
        self.child.take(); // Child drop does not terminate the independent helper.
        if let Some(dir) = self.directory.take() { let _ = dir.keep(); }
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        if let Some(child) = &mut self.child { let _ = child.kill(); let _ = child.wait(); }
    }
}

fn cleanup_stale(parent: &Path) {
    let Ok(entries) = fs::read_dir(parent) else { return; };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else { continue; };
        if !entry.file_name().to_string_lossy().starts_with("session-") || !meta.is_dir()
            || meta.file_attributes() & 0x400 != 0 || meta.modified().ok().and_then(|t| t.elapsed().ok())
                .is_none_or(|age| age < Duration::from_secs(7 * 86400)) { continue; }
        // Never follow links or recursively remove an arbitrary directory.
        for name in ["RHFiles.UpdateSplash.exe", "logo.png", "ready"] {
            let _ = fs::remove_file(path.join(name));
        }
        let _ = fs::remove_dir(path);
    }
}

pub fn launch(from: &str, to: &str, appearance: Appearance, portable: bool) -> Result<Session, String> {
    launch_phase(from, to, appearance, portable, "applying")
}

pub fn launch_phase(from: &str, to: &str, appearance: Appearance, portable: bool, phase: &str) -> Result<Session, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let installation = root(&exe).ok_or("Update splash requires a managed installation")?;
    let local = std::env::var_os("LOCALAPPDATA").ok_or("No local application data directory")?;
    let base = PathBuf::from(local).join("RHFiles/update-splash");
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    cleanup_stale(&base);
    let dir = tempfile::Builder::new().prefix("session-").tempdir_in(base).map_err(|e| e.to_string())?;
    for (name, bytes) in [("RHFiles.UpdateSplash.exe", HELPER), ("logo.png", LOGO)] {
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(dir.path().join(name))
            .map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
    }
    let ready = dir.path().join("ready");
    let theme = match appearance.theme.as_str() { "dark"|"sand"|"mist"|"forest"|"slate" => &appearance.theme, _ => "light" };
    let mut cmd = Command::new(dir.path().join("RHFiles.UpdateSplash.exe"));
    cmd.current_dir(dir.path()).creation_flags(0x08000000).stdin(Stdio::piped())
        .args(["--from-version", from, "--to-version", to, "--theme", theme,
            "--phase", phase, "--controlled", "true",
            "--language", if appearance.language.starts_with("zh") {"zh"} else {"en"},
            "--mode", if portable {"portable"} else {"installed"},
            "--wait-pid", &std::process::id().to_string()])
        .arg("--root-dir").arg(installation).arg("--logo").arg(dir.path().join("logo.png"))
        .arg("--ready-file").arg(&ready);
    for (flag, value) in [("--bg", &appearance.bg), ("--card", &appearance.card),
        ("--text", &appearance.text), ("--accent", &appearance.accent), ("--border", &appearance.border)] {
        if let Some(value) = color(value) { cmd.args([flag, value]); }
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let mut input = child.stdin.take().ok_or("No update progress channel")?;
    let (writer, receiver) = mpsc::sync_channel::<Vec<u8>>(16);
    // Bounded IPC: a stalled helper cannot block downloading or applying.
    std::thread::spawn(move || { while let Ok(line) = receiver.recv() { if input.write_all(&line).and_then(|_| input.flush()).is_err() { break; } } });
    let mut session = Session { child: Some(child), directory: Some(dir), writer };
    let deadline = Instant::now() + Duration::from_secs(4);
    while Instant::now() < deadline {
        if ready.is_file() { return Ok(session); }
        if session.child.as_mut().unwrap().try_wait().map_err(|e| e.to_string())?.is_some() { break; }
        std::thread::sleep(Duration::from_millis(25));
    }
    Err("Update transition did not become ready; retaining Velopack's native progress window".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn theme_arguments_are_colors_not_commands() {
        for v in ["#abcdef", "#012ABC"] { assert_eq!(color(v), Some(v)); }
        for v in ["red", "#fff", "#gggggg", "#123456 --demo-ms 1", "#123456\0"] { assert!(color(v).is_none()); }
    }
    #[test] fn managed_root_does_not_guess_an_unmanaged_directory() {
        assert_eq!(root(Path::new(r"C:\Apps\RHFiles\current\RHFiles.exe")), Some(Path::new(r"C:\Apps\RHFiles")));
        assert!(root(Path::new(r"C:\Downloads\RHFiles.exe")).is_none());
        assert!(HELPER.starts_with(b"MZ")); assert!(LOGO.starts_with(b"\x89PNG"));
    }
    #[test] fn appearance_is_optional_for_existing_scripts() {
        let a: Appearance = serde_json::from_str("{}").unwrap(); assert!(a.theme.is_empty());
    }
}
