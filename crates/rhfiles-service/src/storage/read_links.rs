use super::{
    Entry, Error, Node, Root, Storage, components, entry_for, metadata_revision, object_id,
    scan_entries, valid_name, within,
};
use crate::model::Result;
#[cfg(windows)]
use cap_fs_ext::OsMetadataExt;
use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::fs::{Dir, Metadata, OpenOptions};
use std::{
    collections::{HashSet, VecDeque},
    ffi::OsString,
    path::{Component, Path, PathBuf},
    sync::Arc,
};

const MAX_LINKS: usize = 32;

fn blocked() -> Error {
    Error::new("forbidden", "符号链接的目标不在可读取的共享范围内")
}

fn check_path(root: &Root, relative: &Path) -> Result<()> {
    if root
        .excluded
        .iter()
        .any(|private| within(relative, private))
    {
        return Err(blocked());
    }
    Ok(())
}

fn check_identity(root: &Root, meta: &Metadata) -> Result<()> {
    if root.excluded_ids.contains(&object_id(meta)) {
        return Err(blocked());
    }
    Ok(())
}

fn check_ordinary(root: &Root, meta: &Metadata) -> Result<()> {
    check_identity(root, meta)?;
    #[cfg(windows)]
    if meta.file_attributes() & 0x400 != 0 {
        return Err(blocked());
    }
    if !meta.is_file() && !meta.is_dir() {
        return Err(blocked());
    }
    Ok(())
}

fn check_directory(root: &Root, meta: &Metadata) -> Result<()> {
    check_ordinary(root, meta)?;
    if !meta.is_dir() {
        return Err(blocked());
    }
    // A Windows alternate (8.3) name must not authorize the staging directory.
    #[cfg(windows)]
    if root
        .dir
        .symlink_metadata(".rhfiles-service-staging")
        .is_ok_and(|stage| object_id(&stage) == object_id(meta))
    {
        return Err(blocked());
    }
    Ok(())
}

#[cfg(windows)]
fn drive_form(path: &Path) -> Result<&Path> {
    use std::path::Prefix;
    match path.components().next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            Prefix::Disk(_) => Ok(path),
            Prefix::VerbatimDisk(_) => path
                .to_str()
                .and_then(|value| value.get(4..))
                .map(Path::new)
                .ok_or_else(blocked),
            _ => Err(blocked()),
        },
        _ => Err(blocked()),
    }
}

#[cfg(windows)]
pub(super) fn short_path(path: &Path) -> Option<PathBuf> {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use windows_sys::Win32::Storage::FileSystem::GetShortPathNameW;
    let input: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let size = unsafe { GetShortPathNameW(input.as_ptr(), std::ptr::null_mut(), 0) };
    if size == 0 || size > 32768 {
        return None;
    }
    let mut buffer = vec![0u16; size as usize];
    let len = unsafe { GetShortPathNameW(input.as_ptr(), buffer.as_mut_ptr(), size) };
    if len == 0 || len >= size {
        return None;
    }
    Some(PathBuf::from(OsString::from_wide(&buffer[..len as usize])))
}

#[cfg(windows)]
fn matches_root_alias(target: &Path, long: &Path, short: Option<&Path>) -> bool {
    let Some(short) = short.and_then(|path| drive_form(path).ok()) else {
        return false;
    };
    let count = long.components().count();
    if short.components().count() != count || target.components().count() < count {
        return false;
    }
    // A path may mix the long and short spelling of individual directories.
    // Both spellings come from the already-verified share root.
    target
        .components()
        .zip(long.components().zip(short.components()))
        .all(|(candidate, (long, short))| {
            let folded = |part: Component<'_>| part.as_os_str().to_string_lossy().to_lowercase();
            let candidate = folded(candidate);
            candidate == folded(long) || candidate == folded(short)
        })
}

// Interpret the stored link as components under the same open share. An
// absolute Windows drive path is compared without the optional verbatim prefix.
// Never hand a raw link target to an ambient filesystem API.
fn link_components(root: &Root, target: &Path) -> Result<(bool, Vec<OsString>)> {
    let absolute = target.is_absolute();
    let mut parts = if absolute {
        #[cfg(windows)]
        let (physical, target) = (drive_form(&root.host_path)?, drive_form(target)?);
        #[cfg(not(windows))]
        let physical = root.host_path.as_path();
        #[cfg(windows)]
        let aliased = matches_root_alias(target, physical, root.short_host_path.as_deref());
        #[cfg(not(windows))]
        let aliased = false;
        if !within(target, physical) && !aliased {
            return Err(blocked());
        }
        let mut parts = target.components();
        for _ in physical.components() {
            parts.next();
        }
        parts
    } else {
        target.components()
    };
    let parts = parts.try_fold(Vec::new(), |mut result, part| -> Result<_> {
        match part {
            Component::CurDir => (),
            Component::ParentDir => result.push("..".into()),
            Component::Normal(name) => {
                valid_name(name.to_str().ok_or_else(blocked)?).map_err(|_| blocked())?;
                result.push(name.to_owned());
            }
            _ => return Err(blocked()),
        }
        Ok(result)
    })?;
    Ok((absolute, parts))
}

struct ReadNode {
    root: Arc<Root>,
    parent: Dir,
    leaf: OsString,
    relative: PathBuf,
    metadata: Option<Metadata>,
    link_revision: Option<String>,
}

impl ReadNode {
    #[cfg(windows)]
    fn use_long_file_name(&mut self) -> Result<()> {
        use cap_std::fs::OpenOptionsExt;
        use std::os::windows::{ffi::OsStringExt, io::AsRawHandle};
        use windows_sys::Win32::Storage::FileSystem::{
            FILE_READ_ATTRIBUTES, GetFinalPathNameByHandleW,
        };
        let before = self.metadata()?;
        if !before.is_file() {
            return Err(blocked());
        }
        let mut options = OpenOptions::new();
        options
            .access_mode(FILE_READ_ATTRIBUTES)
            .follow(FollowSymlinks::No);
        let file = self.parent.open_with(&self.leaf, &options)?;
        let current = file.metadata()?;
        check_ordinary(&self.root, &current)?;
        if object_id(before) != object_id(&current) {
            return Err(Error::new("conflict", "编辑文件身份已变化"));
        }
        let handle = file.as_raw_handle();
        let size = unsafe { GetFinalPathNameByHandleW(handle, std::ptr::null_mut(), 0, 0) };
        if size == 0 || size > 32768 {
            return Err(Error::new("io_error", "无法读取编辑目标的正式文件名"));
        }
        let mut buffer = vec![0u16; size as usize];
        let len = unsafe { GetFinalPathNameByHandleW(handle, buffer.as_mut_ptr(), size, 0) };
        if len == 0 || len >= size {
            return Err(Error::new("io_error", "无法读取编辑目标的正式文件名"));
        }
        let path = PathBuf::from(OsString::from_wide(&buffer[..len as usize]));
        let name = path.file_name().ok_or_else(blocked)?.to_owned();
        valid_name(name.to_str().ok_or_else(blocked)?)?;
        // A replace must republish the actual long name. Using a DOS alias as
        // the new filename after moving the original aside would rename it.
        self.relative.set_file_name(&name);
        self.leaf = name;
        Ok(())
    }

    fn metadata(&self) -> Result<&Metadata> {
        self.metadata
            .as_ref()
            .ok_or_else(|| Error::new("not_found", "文件或文件夹不存在"))
    }

    fn open_file(&self) -> Result<std::fs::File> {
        if !self.metadata()?.is_file() {
            return Err(Error::new("forbidden", "只能读取普通文件"));
        }
        let mut options = OpenOptions::new();
        options.read(true).follow(FollowSymlinks::No);
        #[cfg(unix)]
        {
            // A racing replacement with a FIFO must not block a service worker.
            use cap_std::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NONBLOCK);
        }
        let file = self.parent.open_with(&self.leaf, &options)?;
        let meta = file.metadata()?;
        check_ordinary(&self.root, &meta)?;
        if !meta.is_file() {
            return Err(blocked());
        }
        Ok(file.into_std())
    }

    fn open_dir(&self) -> Result<Dir> {
        let dir = self.parent.open_dir_nofollow(&self.leaf)?;
        check_directory(&self.root, &dir.dir_metadata()?)?;
        Ok(dir)
    }
}

impl Storage {
    fn read_node(&self, path: &str) -> Result<ReadNode> {
        self.resolve_node(path, true, false)
    }

    pub(crate) fn mutation_node(
        &self,
        path: &str,
        follow_final: bool,
        legacy: bool,
    ) -> Result<Node> {
        if legacy {
            return self.node(path);
        }
        let resolved = self.resolve_node(path, follow_final, !follow_final)?;
        #[cfg(windows)]
        let resolved = if follow_final {
            let mut resolved = resolved;
            resolved.use_long_file_name()?;
            resolved
        } else {
            resolved
        };
        // A link to the shared root must not acquire the capability to move,
        // replace or remove the root itself.
        let node = Node {
            root: resolved.root,
            relative: resolved.relative,
            virtual_path: path.into(),
            parent: Some((Arc::new(resolved.parent), resolved.leaf)),
        };
        node.require_child()?;
        Ok(node)
    }

    fn resolve_node(
        &self,
        path: &str,
        follow_final: bool,
        allow_missing: bool,
    ) -> Result<ReadNode> {
        let mut parts = components(path)?.into_iter();
        let share = parts
            .next()
            .ok_or_else(|| Error::new("forbidden", "只能读取共享中的普通文件"))?;
        let root = self
            .roots
            .get(share)
            .ok_or_else(|| Error::new("not_found", "共享不存在"))?
            .clone();
        let mut pending = parts.map(OsString::from).collect::<VecDeque<_>>();
        let mut directories = vec![root.dir.try_clone()?];
        let mut relative = PathBuf::new();
        let mut links = HashSet::new();
        let mut link_revision = None;
        while let Some(name) = pending.pop_front() {
            if name == ".." {
                if directories.len() == 1 {
                    return Err(blocked());
                }
                directories.pop();
                relative.pop();
                continue;
            }
            let parent = directories.last().unwrap();
            let child = relative.join(&name);
            check_path(&root, &child)?;
            let meta = match parent.symlink_metadata(&name) {
                Ok(meta) => meta,
                Err(error)
                    if pending.is_empty()
                        && allow_missing
                        && error.kind() == std::io::ErrorKind::NotFound =>
                {
                    return Ok(ReadNode {
                        root,
                        parent: directories.pop().unwrap(),
                        leaf: name,
                        relative: child,
                        metadata: None,
                        link_revision,
                    });
                }
                Err(error) => return Err(error.into()),
            };
            check_identity(&root, &meta)?;
            if meta.file_type().is_symlink() {
                if pending.is_empty() {
                    if !follow_final {
                        return Ok(ReadNode {
                            root,
                            parent: directories.pop().unwrap(),
                            leaf: name,
                            relative: child,
                            metadata: Some(meta),
                            link_revision,
                        });
                    }
                    link_revision.get_or_insert_with(|| metadata_revision(&meta));
                }
                if !links.insert(object_id(&meta)) || links.len() > MAX_LINKS {
                    return Err(Error::new("forbidden", "符号链接循环或层级过多"));
                }
                let target = parent.read_link_contents(&name)?;
                let (absolute, parts) = link_components(&root, &target)?;
                if absolute {
                    directories.truncate(1);
                    relative.clear();
                }
                for part in parts.into_iter().rev() {
                    pending.push_front(part);
                }
                continue;
            }
            check_ordinary(&root, &meta)?;
            if pending.is_empty() {
                if meta.is_dir() {
                    check_directory(&root, &meta)?;
                }
                return Ok(ReadNode {
                    root,
                    parent: directories.pop().unwrap(),
                    leaf: name,
                    relative: child,
                    metadata: Some(meta),
                    link_revision,
                });
            }
            let dir = parent.open_dir_nofollow(&name)?;
            check_directory(&root, &dir.dir_metadata()?)?;
            directories.push(dir);
            relative = child;
        }
        let parent = directories.pop().unwrap();
        let metadata = parent.dir_metadata()?;
        check_directory(&root, &metadata)?;
        Ok(ReadNode {
            root,
            parent,
            leaf: ".".into(),
            relative,
            metadata: Some(metadata),
            link_revision,
        })
    }

    pub(crate) fn device_stat(&self, path: &str) -> Result<Entry> {
        let parts = components(path)?;
        if parts.len() < 2 {
            return self.stat(path);
        }
        let virtual_path = format!("/{}", parts.join("/"));
        let node = match self.read_node(path) {
            Ok(node) => node,
            Err(error) => {
                // Keep the link addressable if it is dangling or its target is
                // forbidden. All content reads still resolve the target afresh.
                let node = self
                    .resolve_node(path, false, false)
                    .map_err(|_| error.clone())?;
                let meta = node.metadata()?;
                if !meta.file_type().is_symlink() {
                    return Err(error);
                }
                let mut entry = entry_for(meta, &virtual_path, None, true);
                #[cfg(windows)]
                {
                    entry.is_dir = meta.file_attributes() & 0x10 != 0;
                }
                entry.size = 0;
                entry.link_revision = Some(entry.revision.clone());
                entry.link_target_available = Some(false);
                return Ok(entry);
            }
        };
        let mut entry = entry_for(node.metadata()?, &virtual_path, None, false);
        entry.link_revision = node.link_revision;
        Ok(entry)
    }

    pub(crate) fn device_open_read(&self, path: &str) -> Result<std::fs::File> {
        self.read_node(path)?.open_file()
    }

    pub(crate) fn device_list(&self, path: &str) -> Result<Vec<Entry>> {
        let parts = components(path)?;
        if parts.is_empty() {
            return self.list(path);
        }
        let node = self.read_node(path)?;
        let directory = node.open_dir()?;
        scan_entries(
            &directory,
            &format!("/{}", parts.join("/")),
            |name, child| {
                check_path(&node.root, &node.relative.join(name))?;
                let meta = directory.symlink_metadata(name)?;
                if meta.file_type().is_symlink() {
                    return self.device_stat(child);
                }
                check_ordinary(&node.root, &meta)?;
                Ok(entry_for(&meta, child, None, false))
            },
        )
    }
}

#[cfg(all(test, any(unix, windows)))]
mod tests {
    use super::*;
    use crate::ShareConfig;
    #[cfg(unix)]
    use std::os::unix::fs::symlink as symlink_dir;
    #[cfg(windows)]
    use std::os::windows::fs::symlink_dir;

    #[cfg(windows)]
    #[test]
    fn windows_links_can_mix_known_short_and_long_root_components() {
        let long = Path::new(r"D:\Long User\Published models");
        let short = Path::new(r"\\?\D:\LONGUS~1\PUBLIS~1");
        assert!(matches_root_alias(
            Path::new(r"d:\LONGUS~1\Published models\data.json"),
            long,
            Some(short)
        ));
        assert!(!matches_root_alias(
            Path::new(r"D:\LONGUS~1\PUBLIS~2\data.json"),
            long,
            Some(short)
        ));
        assert!(!matches_root_alias(
            Path::new(r"D:\LONGUS~1"),
            long,
            Some(short)
        ));
    }

    #[cfg(windows)]
    #[test]
    fn editing_a_dos_alias_republishes_the_original_long_name() {
        use std::os::windows::fs::symlink_file;
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path().canonicalize().unwrap();
        let share = base.join("shared");
        let state = base.join("state");
        std::fs::create_dir(&share).unwrap();
        std::fs::create_dir(&state).unwrap();
        let original = share.join("long model settings.json");
        std::fs::write(&original, b"original").unwrap();
        let short = short_path(&original).unwrap_or_else(|| original.clone());
        symlink_file(short.file_name().unwrap(), share.join("model-link")).unwrap();
        let storage = Storage::protected(
            &[ShareConfig {
                name: "Files".into(),
                path: share.clone(),
            }],
            &state,
            &[],
        )
        .unwrap();
        let target = storage
            .mutation_node("/Files/model-link", true, false)
            .unwrap();
        assert_eq!(target.relative, Path::new("long model settings.json"));
        let stamp = target.stat().unwrap().revision;
        let mut staged = target.stage_edit(&stamp).unwrap();
        std::io::Write::write_all(&mut staged.file, b"edited").unwrap();
        storage.commit_edit(&mut staged, &stamp).unwrap();
        assert_eq!(std::fs::read(original).unwrap(), b"edited");
        assert!(
            std::fs::symlink_metadata(share.join("model-link"))
                .unwrap()
                .file_type()
                .is_symlink()
        );
    }

    #[test]
    fn link_resolution_cannot_enter_protected_ancestry_or_private_staging() {
        let tmp = tempfile::tempdir().unwrap();
        let share = tmp.path().canonicalize().unwrap();
        let private = share.join("service-state");
        let keys = private.join("keys");
        std::fs::create_dir_all(&keys).unwrap();
        std::fs::write(keys.join("test.txt"), b"fixture").unwrap();
        let storage = Storage::protected(
            &[ShareConfig {
                name: "Files".into(),
                path: share.clone(),
            }],
            &private,
            &[],
        )
        .unwrap();
        symlink_dir(Path::new("service-state/keys"), share.join("alias")).unwrap();
        assert_eq!(
            storage
                .device_open_read("/Files/alias/test.txt")
                .unwrap_err()
                .code,
            "forbidden"
        );

        let stage = storage.roots["Files"].staging().unwrap();
        stage.write("test.txt", b"staged fixture").unwrap();
        symlink_dir(
            Path::new(".rhfiles-service-staging"),
            share.join("stage-link"),
        )
        .unwrap();
        assert_eq!(
            storage
                .device_open_read("/Files/stage-link/test.txt")
                .unwrap_err()
                .code,
            "forbidden"
        );
        let entries = storage.device_list("/Files").unwrap();
        assert_eq!(entries.len(), 2);
        assert!(
            entries
                .iter()
                .all(|entry| entry.link_target_available == Some(false))
        );
    }
}
