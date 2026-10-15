use crate::{failure, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

pub const MAX_FILES: usize = 10_000;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

pub fn relative(value: &str) -> Result<PathBuf> {
    if value.is_empty() || value.len() > 2048 || value.contains('\\') {
        return Err("无效的传输相对路径".into());
    }
    let mut path = PathBuf::new();
    for part in value.split('/') {
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.chars().count() > 240
            || part.ends_with([' ', '.'])
            || part.chars().any(|c| c < ' ' || "<>:\"|?*".contains(c))
        {
            return Err("不安全或不跨平台的文件名".into());
        }
        let stem = part.split('.').next().unwrap_or("").to_ascii_lowercase();
        if ["con", "prn", "aux", "nul"].contains(&stem.as_str())
            || (stem.len() == 4
                && (stem.starts_with("com") || stem.starts_with("lpt"))
                && matches!(stem.as_bytes()[3], b'1'..=b'9'))
        {
            return Err("Windows 保留文件名不能传输".into());
        }
        path.push(part);
    }
    if path.components().count() > 64 {
        return Err("文件夹层级超过 64 层".into());
    }
    Ok(path)
}
pub fn validate(entries: &[Entry]) -> Result<u64> {
    if entries.is_empty() || entries.len() > MAX_FILES {
        return Err("每次选择 1 至 10,000 个文件和文件夹条目".into());
    }
    let mut names = HashMap::new();
    let mut total = 0u64;
    for entry in entries {
        relative(&entry.path)?;
        let name = entry.path.to_lowercase();
        if names.insert(name, entry.is_dir).is_some() {
            return Err("传输清单存在重名或大小写冲突".into());
        }
        if entry.is_dir && entry.size != 0 {
            return Err("无效的文件夹大小".into());
        }
        total = total.checked_add(entry.size).ok_or("传输大小溢出")?;
        if total > 1024u64.pow(4) {
            return Err("单次传输超过 1 TB 安全上限".into());
        }
    }
    for name in names.keys() {
        let mut parent = name.as_str();
        while let Some((p, _)) = parent.rsplit_once('/') {
            if names.get(p) == Some(&false) {
                return Err("文件与子目录路径冲突".into());
            }
            parent = p;
        }
    }
    Ok(total)
}
pub(crate) struct Sources {
    pub entries: Vec<Entry>,
    pub paths: Vec<PathBuf>,
}
pub(crate) fn scan(paths: &[PathBuf], canceled: &AtomicBool) -> Result<Sources> {
    let mut sources = Sources {
        entries: vec![],
        paths: vec![],
    };
    let mut names = HashSet::new();
    fn walk(path: &Path, name: String, out: &mut Sources, canceled: &AtomicBool) -> Result<()> {
        if canceled.load(Ordering::Relaxed) {
            return Err("传输已取消".into());
        }
        relative(&name)?;
        let meta = fs::symlink_metadata(path).map_err(failure)?;
        if meta.file_type().is_symlink() || (!meta.is_dir() && !meta.is_file()) {
            return Err("首版互传不跟随符号链接或特殊文件".into());
        }
        if out.entries.len() >= MAX_FILES {
            return Err("超过 10,000 个条目上限".into());
        }
        out.entries.push(Entry {
            path: name.clone(),
            is_dir: meta.is_dir(),
            size: if meta.is_dir() { 0 } else { meta.len() },
        });
        out.paths.push(path.to_path_buf());
        if meta.is_dir() {
            // Do not first allocate every entry in a huge directory just to
            // discover later that the manifest exceeds the transfer limit.
            let remaining = MAX_FILES - out.entries.len();
            let mut children = fs::read_dir(path)
                .map_err(failure)?
                .take(remaining + 1)
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(failure)?;
            if children.len() > remaining {
                return Err("超过 10,000 个条目上限".into());
            }
            children.sort_by_key(|entry| entry.file_name());
            for child in children {
                let child_name = child
                    .file_name()
                    .into_string()
                    .map_err(|_| "文件名不是有效 Unicode")?;
                walk(&child.path(), format!("{name}/{child_name}"), out, canceled)?
            }
        }
        Ok(())
    }
    for path in paths {
        if !path.is_absolute() {
            return Err("请选择本机文件或文件夹的绝对路径".into());
        }
        let original = path
            .file_name()
            .and_then(|v| v.to_str())
            .ok_or("不能发送磁盘或存储根目录")?;
        let mut name = original.to_string();
        let mut suffix = 1;
        while !names.insert(name.to_lowercase()) {
            name = format!("{original} ({suffix})");
            suffix += 1;
        }
        walk(path, name, &mut sources, canceled)?;
    }
    validate(&sources.entries)?;
    Ok(sources)
}

pub(crate) struct Staging {
    pub path: PathBuf,
    parent: PathBuf,
    journal: PathBuf,
    published: bool,
}
impl Staging {
    pub fn new(parent: &Path, data: &Path, id: &str) -> Result<Self> {
        let parent = parent.canonicalize().map_err(failure)?;
        if !parent.is_dir() {
            return Err("接收位置不是文件夹".into());
        }
        let path = parent.join(format!(".rhfiles-receive-{id}.part"));
        fs::create_dir_all(data).map_err(failure)?;
        let journal = data.join(format!("{id}.json"));
        let record = serde_json::json!({"id":id,"path":path,"parent":parent});
        let mut options = fs::OpenOptions::new();
        options.create_new(true).write(true);
        use std::io::Write;
        let mut log = options.open(&journal).map_err(failure)?;
        log.write_all(record.to_string().as_bytes())
            .map_err(failure)?;
        log.sync_all().map_err(failure)?;
        if let Err(error) = fs::create_dir(&path) {
            let _ = fs::remove_file(&journal);
            return Err(failure(error));
        }
        Ok(Self {
            path,
            parent,
            journal,
            published: false,
        })
    }
    pub fn child(&self, name: &str) -> Result<PathBuf> {
        Ok(self.path.join(relative(name)?))
    }
    pub fn publish(mut self, id: &str) -> Result<PathBuf> {
        // Each batch has its own newly-created directory; existing files are not
        // touched. No REPLACE_EXISTING, and never publish a partially read batch.
        let target = self
            .parent
            .join(format!("RHFiles-Received-{}-{id}", crate::now_ms()));
        if target.exists() {
            return Err("接收目录已存在；未覆盖".into());
        }
        publish_no_replace(&self.path, &target)?;
        self.published = true;
        let _ = fs::remove_file(&self.journal);
        Ok(target)
    }
}
impl Drop for Staging {
    fn drop(&mut self) {
        if self.published {
            return;
        }
        // Only this transfer's fresh staging node is owned here. A directory
        // replacing it with a link is not traversed or recursively cleaned.
        if fs::symlink_metadata(&self.path).is_ok_and(|m| m.is_dir() && !m.file_type().is_symlink())
        {
            let _ = fs::remove_dir_all(&self.path);
        }
        if !self.path.exists() {
            let _ = fs::remove_file(&self.journal);
        }
    }
}
fn publish_no_replace(source: &Path, target: &Path) -> Result<()> {
    #[cfg(any(target_os = "android", target_os = "linux"))]
    {
        rustix::fs::renameat_with(
            rustix::fs::CWD,
            source,
            rustix::fs::CWD,
            target,
            rustix::fs::RenameFlags::NOREPLACE,
        )
        .map_err(failure)
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let source = source
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<_>>();
        let target = target
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<_>>();
        if unsafe {
            windows_sys::Win32::Storage::FileSystem::MoveFileW(source.as_ptr(), target.as_ptr())
        } == 0
        {
            Err(failure(std::io::Error::last_os_error()))
        } else {
            Ok(())
        }
    }
    #[cfg(not(any(windows, target_os = "android", target_os = "linux")))]
    {
        let _ = (source, target);
        Err("首版互传的安全接收仅支持 Windows / Android".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn oversized_directory_scan_is_bounded_and_does_not_modify_sources() {
        let root = tempfile::tempdir().unwrap();
        for index in 0..MAX_FILES {
            fs::File::create(root.path().join(format!("entry-{index}"))).unwrap();
        }
        let result = scan(&[root.path().to_path_buf()], &AtomicBool::new(false));
        assert!(result.err().unwrap().contains("10,000"));
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), MAX_FILES);
    }
    #[test]
    fn publishing_never_replaces_even_an_existing_empty_directory() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let target = root.path().join("target");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&target).unwrap();
        assert!(publish_no_replace(&source, &target).is_err());
        assert!(source.exists());
        assert!(target.exists());
        fs::write(target.join("keep"), "old").unwrap();
        assert!(publish_no_replace(&source, &target).is_err());
        assert_eq!(fs::read_to_string(target.join("keep")).unwrap(), "old");
    }
}
