use serde_json::{Value, json};
use std::{
    ffi::{CStr, CString, c_char},
    path::{Path, PathBuf},
};

unsafe extern "C" {
    fn rhfiles_macos_request(input: *const c_char) -> *mut c_char;
    fn rhfiles_macos_free(value: *mut c_char);
}

pub fn request(value: Value) -> Result<Value, String> {
    let input = CString::new(value.to_string()).map_err(|e| e.to_string())?;
    unsafe {
        let raw = rhfiles_macos_request(input.as_ptr());
        if raw.is_null() {
            return Err("macOS service returned no response".into());
        }
        let data = CStr::from_ptr(raw).to_bytes().to_vec();
        rhfiles_macos_free(raw);
        let response: Value = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
        if let Some(error) = response.get("error").and_then(Value::as_str) {
            return Err(error.into());
        }
        Ok(response["value"].clone())
    }
}

pub fn rename_exclusive(source: &Path, target: &Path) -> Result<(), String> {
    request(json!({"action":"rename", "path":source, "target":target})).map(|_| ())
}

fn trash_journal(path: &Path) -> Result<PathBuf, String> {
    use sha2::{Digest, Sha256};
    let root = PathBuf::from(std::env::var_os("HOME").ok_or("HOME unavailable")?)
        .join("Library/Application Support/RHFiles/trash");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root.join(format!(
        "{:x}.json",
        Sha256::digest(path.as_os_str().as_encoded_bytes())
    )))
}

pub fn trash(path: &Path) -> Result<(), String> {
    static TRASH_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = TRASH_LOCK.lock().map_err(|e| e.to_string())?;
    if !path.is_absolute() || path.parent().is_none() {
        return Err("Cannot trash a filesystem root".into());
    }
    let journal = trash_journal(path)?;
    // Secure a writable recovery record before asking the OS to move anything.
    let staged = journal.with_extension(format!("{}.pending", std::process::id()));
    let mut record = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&staged)
        .map_err(|e| e.to_string())?;
    let trashed = match request(json!({"action":"trash", "path":path})) {
        Ok(value) => value,
        Err(error) => {
            let _ = std::fs::remove_file(staged);
            return Err(error);
        }
    };
    use std::io::Write;
    record
        .write_all(
            json!({"original":path,"trashed":trashed})
                .to_string()
                .as_bytes(),
        )
        .map_err(|e| format!("File is in Trash, but recovery record could not be saved: {e}"))?;
    record.sync_all().map_err(|e| e.to_string())?;
    std::fs::rename(staged, journal)
        .map_err(|e| format!("File is in Trash; recovery record publication failed: {e}"))
}

pub fn restore(path: &Path) -> Result<(), String> {
    let journal = trash_journal(path)?;
    let record: Value =
        serde_json::from_slice(&std::fs::read(&journal).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if record["original"].as_str() != path.to_str() {
        return Err("Trash record does not match the requested path".into());
    }
    let source = PathBuf::from(record["trashed"].as_str().ok_or("Missing Trash location")?);
    if !source
        .components()
        .any(|part| part.as_os_str() == ".Trash" || part.as_os_str() == ".Trashes")
    {
        return Err("Recovery source is not a Trash location".into());
    }
    rename_exclusive(&source, path)?;
    std::fs::remove_file(journal).map_err(|e| e.to_string())
}

pub fn open(path: &Path) -> Result<(), String> {
    let status = std::process::Command::new("/usr/bin/open")
        .arg("--")
        .arg(path)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("macOS could not open {}: {status}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let unique = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "rhfiles-mac-{}-{unique}-{}",
                std::process::id(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn exclusive_rename_never_overwrites_a_file_directory_or_dangling_link() {
        let f = Fixture::new();
        let source = f.0.join("中文 source.txt");
        let target = f.0.join("target");
        std::fs::write(&source, b"source").unwrap();
        std::fs::write(&target, b"keep").unwrap();
        assert!(rename_exclusive(&source, &target).is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"keep");
        std::fs::remove_file(&target).unwrap();
        std::fs::create_dir(&target).unwrap();
        assert!(rename_exclusive(&source, &target).is_err());
        std::fs::remove_dir(&target).unwrap();
        std::os::unix::fs::symlink(f.0.join("missing"), &target).unwrap();
        assert!(rename_exclusive(&source, &target).is_err());
        assert!(source.is_file());
        std::fs::remove_file(&target).unwrap();
        rename_exclusive(&source, &target).unwrap();
        assert!(!source.exists());
        assert_eq!(std::fs::read(&target).unwrap(), b"source");
    }
    #[test]
    fn trash_restore_preserves_data_and_refuses_collision() {
        let f = Fixture::new();
        let source = f.0.join("recover 中文.txt");
        std::fs::write(&source, b"recover me").unwrap();
        trash(&source).unwrap();
        assert!(!source.exists());
        // A failed second delete must not erase the first successful undo record.
        assert!(trash(&source).is_err());
        std::fs::write(&source, b"new occupant").unwrap();
        assert!(restore(&source).is_err());
        assert_eq!(std::fs::read(&source).unwrap(), b"new occupant");
        std::fs::remove_file(&source).unwrap();
        restore(&source).unwrap();
        assert_eq!(std::fs::read(&source).unwrap(), b"recover me");
        assert!(!trash_journal(&source).unwrap().exists());
    }
    #[test]
    fn roots_and_relative_paths_are_never_trashed() {
        assert!(trash(Path::new("/")).is_err());
        assert!(trash(Path::new("relative")).is_err());
    }
    #[test]
    fn clipboard_file_urls_cut_marker_and_sequence_guard_use_an_isolated_pasteboard() {
        let f = Fixture::new();
        let board = format!(
            "com.rhfiles.test.{}",
            f.0.file_name().unwrap().to_string_lossy()
        );
        let paths = vec![f.0.join("中文 #%.txt"), f.0.join("folder")];
        std::fs::write(&paths[0], b"test").unwrap();
        std::fs::create_dir(&paths[1]).unwrap();
        for cut in [true, false] {
            let seq = request(
                json!({"action":"clipboard.write","paths":paths,"cut":cut,"testPasteboard":board}),
            )
            .unwrap();
            let info = request(json!({"action":"clipboard.read","testPasteboard":board})).unwrap();
            assert_eq!(info["paths"], json!(paths));
            assert_eq!(info["hasFiles"], true);
            assert_eq!(info["cut"], cut);
            assert_eq!(info["sequence"], seq);
            assert_eq!(
                request(json!({"action":"clipboard.clear","sequence":-1,"testPasteboard":board}))
                    .unwrap(),
                false
            );
            assert_eq!(
                request(json!({"action":"clipboard.clear","sequence":seq,"testPasteboard":board}))
                    .unwrap(),
                true
            );
        }
        assert_eq!(
            request(json!({"action":"clipboard.text","text":"copied path","testPasteboard":board}))
                .unwrap(),
            true
        );
        assert_eq!(
            request(json!({"action":"clipboard.read","testPasteboard":board})).unwrap()["hasFiles"],
            false
        );
        request(json!({"action":"clipboard.release-test","testPasteboard":board})).unwrap();
    }
    #[test]
    fn clearing_readonly_does_not_grant_write_to_other_users() {
        use std::os::unix::fs::PermissionsExt;
        let f = Fixture::new();
        let source = f.0.join("private");
        std::fs::write(&source, b"secret").unwrap();
        std::fs::set_permissions(&source, std::fs::Permissions::from_mode(0o400)).unwrap();
        crate::enumerator::set_file_readonly(&source, false).unwrap();
        assert_eq!(
            std::fs::metadata(source).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}
