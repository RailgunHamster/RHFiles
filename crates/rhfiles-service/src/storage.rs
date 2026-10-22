//! Capability-relative I/O. Neither protocol is allowed to construct ambient
//! host paths or follow a symlink/junction out of a shared root.
use crate::model::*;
#[cfg(windows)]
use cap_fs_ext::OsMetadataExt;
use cap_std::fs::{Dir, OpenOptions};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::UNIX_EPOCH,
};

pub const PRIVATE_PREFIX: &str = ".rhfiles-service-";

pub fn valid_name(name: &str) -> Result<()> {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if name.is_empty()
        || name.len() > 240
        || name == "."
        || name == ".."
        || name.ends_with(['.', ' '])
        || name
            .chars()
            .any(|c| c.is_control() || "/\\:*?\"<>|".contains(c))
        || name.to_ascii_lowercase().starts_with(PRIVATE_PREFIX)
        || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
    {
        return Err(Error::new(
            "invalid_path",
            "名称包含保留字符或不是有效文件名",
        ));
    }
    Ok(())
}
pub fn components(path: &str) -> Result<Vec<&str>> {
    if path.len() > 8192 || !path.starts_with('/') || path.contains('\\') || path.contains('\0') {
        return Err(Error::new("invalid_path", "必须使用共享内的绝对虚拟路径"));
    }
    let mut parts = Vec::new();
    for part in path.trim_matches('/').split('/') {
        if part.is_empty() {
            continue;
        }
        valid_name(part)?;
        parts.push(part);
    }
    Ok(parts)
}

#[derive(Debug)]
pub struct Root {
    pub dir: Dir,
}
#[derive(Debug)]
pub struct Storage {
    pub roots: HashMap<String, Arc<Root>>,
    pub mutation: Mutex<()>,
}
#[derive(Clone, Debug)]
pub struct Node {
    pub root: Arc<Root>,
    pub relative: PathBuf,
    pub virtual_path: String,
}

fn local_root(path: &Path) -> Result<PathBuf> {
    let value = path.to_string_lossy();
    if !path.is_absolute() || value.starts_with("\\\\") || value.starts_with("//") {
        return Err(Error::new(
            "invalid_root",
            "首版仅共享本机磁盘目录，不接受 SMB、映射网络盘或设备路径",
        ));
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let mut root = path
            .components()
            .take(2)
            .collect::<PathBuf>()
            .as_os_str()
            .encode_wide()
            .collect::<Vec<_>>();
        root.push(0);
        let kind = unsafe { windows_sys::Win32::Storage::FileSystem::GetDriveTypeW(root.as_ptr()) };
        if kind != 2 && kind != 3 {
            return Err(Error::new("invalid_root", "仅允许本机固定或可移动磁盘目录"));
        }
    }
    // Reject reparse points before canonicalization, so a local-looking UNC
    // junction cannot hang the service while opening a root.
    let mut current = PathBuf::new();
    for part in path.components() {
        current.push(part);
        let metadata = std::fs::symlink_metadata(&current)?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(Error::new("invalid_root", "共享目录及其上级不能是重解析点"));
            }
        }
        if metadata.file_type().is_symlink() {
            return Err(Error::new("invalid_root", "共享目录及其上级不能是符号链接"));
        }
    }
    Ok(path.canonicalize()?)
}

impl Storage {
    pub fn new(shares: &[ShareConfig], data: &Path) -> Result<Self> {
        if shares.is_empty() || shares.len() > 32 {
            return Err(Error::new("invalid_config", "请选择 1–32 个本机共享文件夹"));
        }
        let mut roots = HashMap::new();
        let data = data.canonicalize()?;
        let mut seen = std::collections::HashSet::new();
        let mut locations = Vec::<PathBuf>::new();
        for share in shares {
            valid_name(&share.name)?;
            if !seen.insert(share.name.to_lowercase()) {
                return Err(Error::new("invalid_config", "共享名称不能重复"));
            }
            let path = local_root(&share.path)?;
            if locations
                .iter()
                .any(|other| path.starts_with(other) || other.starts_with(&path))
            {
                return Err(Error::new(
                    "invalid_root",
                    "共享目录不能互相重叠，避免同一文件出现多个权限或锁别名",
                ));
            }
            locations.push(path.clone());
            if path.starts_with(&data) || data.starts_with(&path) {
                return Err(Error::new(
                    "invalid_root",
                    "共享不能包含文件服务的私钥、授权或配置目录，请选择更具体的文件夹",
                ));
            }
            let dir = Dir::open_ambient_dir(path, cap_std::ambient_authority())?;
            roots.insert(share.name.clone(), Arc::new(Root { dir }));
        }
        Ok(Self {
            roots,
            mutation: Mutex::new(()),
        })
    }
    pub fn node(&self, path: &str) -> Result<Node> {
        let parts = components(path)?;
        let first = parts
            .first()
            .ok_or_else(|| Error::new("forbidden", "不能修改共享列表根目录"))?;
        let root = self
            .roots
            .get(*first)
            .ok_or_else(|| Error::new("not_found", "共享不存在"))?
            .clone();
        let relative = parts.iter().skip(1).collect::<PathBuf>();
        let mut partial = PathBuf::new();
        for part in parts.iter().skip(1) {
            partial.push(part);
            match root.dir.symlink_metadata(&partial) {
                Ok(meta) => {
                    #[cfg(windows)]
                    if meta.file_attributes() & 0x400 != 0 {
                        return Err(Error::new("forbidden", "不允许访问重解析点"));
                    }
                    if meta.file_type().is_symlink() {
                        return Err(Error::new("forbidden", "不允许访问符号链接"));
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => break,
                Err(e) => return Err(e.into()),
            }
        }
        Ok(Node {
            root,
            relative,
            virtual_path: format!("/{}", parts.join("/")),
        })
    }
    pub fn stat(&self, path: &str) -> Result<Entry> {
        if components(path)?.is_empty() {
            return Ok(Entry {
                name: String::new(),
                path: "/".into(),
                is_dir: true,
                size: 0,
                modified_ms: 0,
                revision: "root".into(),
            });
        }
        self.node(path)?.stat()
    }
    pub fn list(&self, path: &str) -> Result<Vec<Entry>> {
        if components(path)?.is_empty() {
            let mut items = self
                .roots
                .keys()
                .map(|name| self.stat(&format!("/{name}")))
                .collect::<Result<Vec<_>>>()?;
            items.sort_by(|a, b| a.name.cmp(&b.name));
            return Ok(items);
        }
        let node = self.node(path)?;
        let mut entries = Vec::new();
        let mut bytes = 0usize;
        for item in node.root.dir.read_dir(node.relative_or_dot())? {
            let item = item?;
            let Some(name) = item.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if valid_name(&name).is_err() {
                continue;
            }
            let child = format!("{}/{}", node.virtual_path, name);
            if let Ok(entry) = self.stat(&child) {
                bytes += entry.path.len() + entry.name.len() + entry.revision.len() + 128;
                if bytes > 32 * 1024 * 1024 {
                    return Err(Error::new(
                        "too_large",
                        "目录元数据超过 32 MiB，请缩小共享范围",
                    ));
                }
                entries.push(entry);
            }
            if entries.len() > 100000 {
                return Err(Error::new("too_large", "目录超过十万项，请缩小共享范围"));
            }
        }
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(entries)
    }
    pub fn mkdir(&self, path: &str) -> Result<()> {
        let node = self.node(path)?;
        node.require_child()?;
        let _guard = self.mutation.lock().unwrap();
        node.root.dir.create_dir(&node.relative)?;
        Ok(())
    }
    pub fn remove(&self, path: &str, directory: bool) -> Result<()> {
        let node = self.node(path)?;
        node.require_child()?;
        let _guard = self.mutation.lock().unwrap();
        if directory {
            node.root.dir.remove_dir(&node.relative)?;
        } else {
            node.root.dir.remove_file(&node.relative)?;
        }
        Ok(())
    }
    pub fn rename(&self, from: &str, to: &str) -> Result<()> {
        let from = self.node(from)?;
        let to = self.node(to)?;
        from.require_child()?;
        to.require_child()?;
        let _guard = self.mutation.lock().unwrap();
        rename_noreplace(&from.root.dir, &from.relative, &to.root.dir, &to.relative)?;
        Ok(())
    }
    pub fn copy_file(&self, from: &str, to: &str, check: impl Fn() -> Result<()>) -> Result<()> {
        let source = self.node(from)?;
        let destination = self.node(to)?;
        destination.require_child()?;
        let mut input = source.open_read()?;
        let mut staged = destination.stage()?;
        use std::io::{Read, Write};
        let mut buffer = [0u8; 65536];
        loop {
            check()?;
            let n = input.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            staged.file.write_all(&buffer[..n])?;
        }
        check()?;
        staged.commit()?;
        Ok(())
    }
}
impl Node {
    pub fn relative_or_dot(&self) -> &Path {
        if self.relative.as_os_str().is_empty() {
            Path::new(".")
        } else {
            &self.relative
        }
    }
    pub fn require_child(&self) -> Result<()> {
        if self.relative.as_os_str().is_empty() {
            Err(Error::new("forbidden", "不能修改共享根目录"))
        } else {
            Ok(())
        }
    }
    pub fn stat(&self) -> Result<Entry> {
        let meta = self.root.dir.metadata(self.relative_or_dot())?;
        let modified = meta
            .modified()
            .ok()
            .and_then(|v| v.into_std().duration_since(UNIX_EPOCH).ok())
            .unwrap_or_default();
        Ok(Entry {
            name: self.virtual_path.rsplit('/').next().unwrap_or("").into(),
            path: self.virtual_path.clone(),
            is_dir: meta.is_dir(),
            size: meta.len(),
            modified_ms: modified.as_millis() as u64,
            revision: format!(
                "{:x}-{:x}-{}",
                meta.len(),
                modified.as_nanos(),
                meta.is_dir() as u8
            ),
        })
    }
    pub fn open_read(&self) -> Result<std::fs::File> {
        let file = self.root.dir.open(&self.relative)?;
        if !file.metadata()?.is_file() {
            return Err(Error::new("forbidden", "只能读取普通文件"));
        }
        Ok(file.into_std())
    }
    pub fn stage(&self) -> Result<Staged> {
        self.require_child()?;
        if self.root.dir.symlink_metadata(&self.relative).is_ok() {
            return Err(Error::new("conflict", "目标已存在，未覆盖"));
        }
        let name = random()?;
        let file = self
            .root
            .staging()?
            .open_with(
                &name,
                OpenOptions::new().create_new(true).read(true).write(true),
            )?
            .into_std();
        Ok(Staged {
            node: self.clone(),
            name,
            file,
            committed: false,
            retain: false,
        })
    }
}
impl Root {
    pub fn staging(&self) -> Result<Dir> {
        let private = format!("{PRIVATE_PREFIX}staging");
        if let Ok(meta) = self.dir.symlink_metadata(&private) {
            #[cfg(windows)]
            if meta.file_attributes() & 0x400 != 0 {
                return Err(Error::new("forbidden", "临时目录不能是重解析点"));
            }
            if meta.file_type().is_symlink() {
                return Err(Error::new("forbidden", "临时目录不能是符号链接"));
            }
        }
        match self.dir.create_dir(&private) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e.into()),
        }
        Ok(self.dir.open_dir(&private)?)
    }
}
#[derive(Debug)]
pub struct Staged {
    pub node: Node,
    pub name: String,
    pub file: std::fs::File,
    pub committed: bool,
    pub retain: bool,
}
impl Staged {
    pub fn reopen(node: Node, name: String) -> Result<Self> {
        valid_name(&name)?;
        let file = node
            .root
            .staging()?
            .open_with(&name, OpenOptions::new().read(true).write(true))?
            .into_std();
        Ok(Self {
            node,
            name,
            file,
            committed: false,
            retain: true,
        })
    }
    pub fn commit(&mut self) -> Result<()> {
        if self.committed {
            return Ok(());
        }
        self.file.sync_all()?;
        rename_noreplace(
            &self.node.root.staging()?,
            Path::new(&self.name),
            &self.node.root.dir,
            &self.node.relative,
        )?;
        self.committed = true;
        Ok(())
    }
}
impl Drop for Staged {
    fn drop(&mut self) {
        if !self.committed && !self.retain {
            if let Ok(staging) = self.node.root.staging() {
                let _ = staging.remove_file(&self.name);
            }
        }
    }
}

/// OS no-replace rename with both parents held as directory capabilities.
/// The destination can never be silently removed, including a racing creator.
#[cfg(windows)]
fn rename_noreplace(
    from: &Dir,
    source: &Path,
    to: &Dir,
    destination: &Path,
) -> std::io::Result<()> {
    use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
    use cap_std::fs::OpenOptionsExt;
    use std::os::windows::{ffi::OsStrExt, io::AsRawHandle};
    use windows_sys::Wdk::Storage::FileSystem::{
        FILE_RENAME_INFORMATION, FileRenameInformation, NtSetInformationFile,
    };
    use windows_sys::Win32::Storage::FileSystem::*;
    let mut options = OpenOptions::new();
    options
        .access_mode(DELETE | SYNCHRONIZE | FILE_READ_ATTRIBUTES)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .follow(FollowSymlinks::No);
    let source = from.open_with(source, &options)?;
    let parent = to.open_dir(
        destination
            .parent()
            .filter(|v| !v.as_os_str().is_empty())
            .unwrap_or(Path::new(".")),
    )?;
    let name: Vec<u16> = destination
        .file_name()
        .ok_or_else(|| std::io::Error::from(std::io::ErrorKind::InvalidInput))?
        .encode_wide()
        .collect();
    let offset = std::mem::offset_of!(FILE_RENAME_INFORMATION, FileName);
    let length = offset + name.len() * 2;
    let mut buffer = vec![0usize; (length + 7) / 8];
    let info = buffer.as_mut_ptr() as *mut FILE_RENAME_INFORMATION;
    // Zeroed union means ReplaceIfExists=false; no FILE_RENAME_REPLACE_IF_EXISTS.
    unsafe {
        (*info).RootDirectory = parent.as_raw_handle();
        (*info).FileNameLength = (name.len() * 2) as u32;
        std::ptr::copy_nonoverlapping(name.as_ptr(), (*info).FileName.as_mut_ptr(), name.len());
        let mut result = std::mem::zeroed();
        let status = NtSetInformationFile(
            source.as_raw_handle(),
            &mut result,
            info.cast(),
            length as u32,
            FileRenameInformation,
        );
        if status < 0 {
            return Err(std::io::Error::from_raw_os_error(
                windows_sys::Win32::Foundation::RtlNtStatusToDosError(status) as i32,
            ));
        }
    }
    Ok(())
}
#[cfg(not(windows))]
fn rename_noreplace(
    from: &Dir,
    source: &Path,
    to: &Dir,
    destination: &Path,
) -> std::io::Result<()> {
    #[cfg(target_os = "linux")]
    {
        return rustix::fs::renameat_with(
            from,
            source,
            to,
            destination,
            rustix::fs::RenameFlags::NOREPLACE,
        )
        .map_err(Into::into);
    }
    #[cfg(target_os = "macos")]
    {
        use std::os::{fd::AsRawFd, unix::ffi::OsStrExt};
        let source = std::ffi::CString::new(source.as_os_str().as_bytes())?;
        let destination = std::ffi::CString::new(destination.as_os_str().as_bytes())?;
        if unsafe {
            libc::renameatx_np(
                from.as_raw_fd(),
                source.as_ptr(),
                to.as_raw_fd(),
                destination.as_ptr(),
                libc::RENAME_EXCL,
            )
        } != 0
        {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        // macOS support is deliberately no-overwrite: files can be published
        // with an atomic hard-link; directory moves require platform support.
        if from.metadata(source)?.is_dir() {
            return Err(std::io::Error::from(std::io::ErrorKind::Unsupported));
        }
        from.hard_link(source, to, destination)?;
        from.remove_file(source)
    }
}
