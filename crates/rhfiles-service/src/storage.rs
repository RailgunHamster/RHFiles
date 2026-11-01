//! Capability-relative I/O. Neither protocol is allowed to construct ambient
//! host paths or follow a symlink/junction out of a shared root.
use crate::model::*;
#[cfg(windows)]
use cap_fs_ext::OsMetadataExt;
use cap_std::fs::{Dir, OpenOptions};
use cap_fs_ext::MetadataExt as IdentityMetadataExt;
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
        || name.eq_ignore_ascii_case("lan-service-v1")
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
    if path.len() > 8192
        || !path.starts_with('/')
        || path.contains("//")
        || path.contains('\\')
        || path.contains('\0')
    {
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
    excluded: Vec<PathBuf>,
}
#[derive(Debug)]
pub struct Storage {
    pub roots: HashMap<String, Arc<Root>>,
    pub mutation: Mutex<()>,
    pub recovery_warnings: Mutex<Vec<String>>,
}
#[derive(Clone, Debug)]
pub struct Node {
    pub root: Arc<Root>,
    pub relative: PathBuf,
    pub virtual_path: String,
}

fn local_root(path: &Path) -> Result<PathBuf> {
    // Rust canonicalize() returns the extended local-drive form on Windows.
    // Accept only VerbatimDisk (\\?\C:\…), never VerbatimUNC, DeviceNS or
    // arbitrary volume/device namespaces. Re-run all normal local-root checks.
    #[cfg(windows)]
    if matches!(path.components().next(),Some(std::path::Component::Prefix(prefix)) if matches!(prefix.kind(),std::path::Prefix::VerbatimDisk(_)))
    {
        let text = path
            .to_str()
            .ok_or_else(|| Error::new("invalid_root", "共享路径不是有效 Unicode"))?;
        return local_root(Path::new(&text[4..]));
    }
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
        if let std::path::Component::Normal(name) = part {
            let name = name.to_string_lossy();
            if name.eq_ignore_ascii_case("lan-service-v1")
                || name.to_ascii_lowercase().starts_with(PRIVATE_PREFIX)
            {
                return Err(Error::new("invalid_root", "不能直接共享服务内部目录"));
            }
        }
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
    pub fn protected(shares: &[ShareConfig], data: &Path, protected: &[PathBuf]) -> Result<Self> {
        if shares.is_empty() || shares.len() > 32 {
            return Err(Error::new("invalid_config", "请选择 1–32 个本机共享文件夹"));
        }
        let mut roots = HashMap::new();
        let data = data.canonicalize()?;
        let mut exclusions = vec![data];
        for path in protected {
            exclusions.push(path.canonicalize()?);
        }
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
                .any(|other| within(&path, other) || within(other, &path))
            {
                return Err(Error::new(
                    "invalid_root",
                    "共享目录不能互相重叠，避免同一文件出现多个权限或锁别名",
                ));
            }
            locations.push(path.clone());
            let mut excluded = Vec::new();
            for private in &exclusions {
                if within(&path, private) {
                    return Err(Error::new(
                        "invalid_root",
                        "不能直接共享服务的私钥、授权或配置目录",
                    ));
                }
                if within(private, &path) {
                    excluded.push(
                        private
                            .components()
                            .skip(path.components().count())
                            .collect(),
                    );
                }
            }
            let dir = Dir::open_ambient_dir(path, cap_std::ambient_authority())?;
            roots.insert(share.name.clone(), Arc::new(Root { dir, excluded }));
        }
        let storage=Self {
            roots,
            mutation: Mutex::new(()),
            recovery_warnings: Mutex::new(Vec::new()),
        };
        storage.recover_checked()?;
        Ok(storage)
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
        if root
            .excluded
            .iter()
            .any(|private| within(&relative, private))
        {
            return Err(Error::new(
                "forbidden",
                "不允许访问服务的私钥、授权或配置目录",
            ));
        }
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
    /// Capture by no-replace rename before checking identity. A path which was
    /// replaced since selection is restored, never removed as the old object.
    pub fn checked_mutation(&self, from: &str, to: Option<&str>, revision: &str, target_revision: Option<&str>) -> Result<()> {
        let source = self.node(from)?;
        source.require_child()?;
        let destination = to.map(|path| self.node(path)).transpose()?;
        if let Some(target) = &destination {
            target.require_child()?;
            if !Arc::ptr_eq(&source.root, &target.root) || source.relative == target.relative
                || target.relative.starts_with(&source.relative) || source.relative.starts_with(&target.relative) {
                return Err(Error::new("invalid_path", "条件移动必须在同一共享内，且不能互相包含"));
            }
        }
        let _guard = self.mutation.lock().unwrap();
        if source.stat()?.revision != revision { return Err(Error::new("conflict", "源文件已变化，未修改")); }
        let lock_file=|node:&Node|->Result<Option<cap_std::fs::File>>{if node.stat()?.is_dir{return Ok(None);}let mut options=OpenOptions::new();options.read(true);
            #[cfg(windows)]{use cap_std::fs::OpenOptionsExt;options.share_mode(1|4);}
            Ok(Some(node.root.dir.open_with(&node.relative,&options)?))};
        let _source_lock=lock_file(&source)?;
        let stage = source.root.staging()?;
        let id = random()?;
        let captured = format!("capture-{id}");
        let backup = format!("backup-{id}");
        let record = format!("mutation-{id}.json");
        let target = destination.as_ref().map(|n| n.relative.to_string_lossy().into_owned());
        let state = serde_json::json!({"source":source.relative.to_string_lossy(),"target":target,
            "captured":captured,"backup":backup,"sourceRevision":revision,"targetRevision":target_revision});
        let mut log = stage.open_with(&record, OpenOptions::new().write(true).create_new(true))?;
        use std::io::Write;
        log.write_all(&serde_json::to_vec(&state).map_err(|_| Error::new("internal", "无法记录移动状态"))?)?;
        log.sync_all()?;
        drop(log);
        let result = (|| -> Result<()> {
            let mut _target_lock=None;
            rename_noreplace(&source.root.dir, &source.relative, &stage, Path::new(&captured))?;
            if metadata_revision(&stage.metadata(&captured)?) != revision {
                return Err(Error::new("conflict", "源文件身份已变化，未删除或覆盖"));
            }
            if let Some(target) = &destination {
                match target.stat() {
                    Ok(entry) => {
                        if entry.is_dir || target_revision != Some(entry.revision.as_str()) {
                            return Err(Error::new("conflict", "目标已变化或是文件夹，未覆盖"));
                        }
                        _target_lock=lock_file(target)?;
                        rename_noreplace(&target.root.dir, &target.relative, &stage, Path::new(&backup))?;
                        if metadata_revision(&stage.metadata(&backup)?) != entry.revision {
                            return Err(Error::new("conflict", "目标文件身份已变化，未覆盖"));
                        }
                    }
                    Err(e) if e.code == "not_found" && target_revision.is_none() => {}
                    Err(e) if e.code == "not_found" => return Err(Error::new("conflict", "原目标已移走，未覆盖")),
                    Err(e) => return Err(e),
                }
                rename_noreplace(&stage, Path::new(&captured), &target.root.dir, &target.relative)?;
                if stage.symlink_metadata(&backup).is_ok() { stage.remove_file(&backup)?; }
            } else {
                // Never recursively delete a directory: a newly created child
                // must survive an already accepted move/removal.
                if stage.metadata(&captured)?.is_dir() { stage.remove_dir(&captured)?; }
                else { stage.remove_file(&captured)?; }
            }
            Ok(())
        })();
        if let Err(error) = result {
            let rollback = self.restore_checked(&source.root, &state);
            return Err(match rollback { Ok(()) => {let _=stage.remove_file(&record);error}, Err(_) => {let message=format!("条件操作未完成：{record}。原数据保留在共享私有暂存区，未覆盖现有文件。");let mut warnings=self.recovery_warnings.lock().unwrap();if warnings.len()<256{warnings.push(message.clone());}Error::new("recovery_required", message)} });
        }
        stage.remove_file(&record)?;
        Ok(())
    }
    fn restore_checked(&self, root: &Arc<Root>, state: &serde_json::Value) -> Result<()> {
        let stage = root.staging()?;
        let get = |key| state[key].as_str().ok_or_else(|| Error::new("invalid_config", "移动恢复记录无效"));
        let source = Path::new(get("source")?);
        let captured = get("captured")?;
        let backup = get("backup")?;
        for name in [captured, backup] { valid_name(name)?; }
        if source.is_absolute() || source.components().any(|p| !matches!(p, std::path::Component::Normal(_))) {
            return Err(Error::new("invalid_config", "恢复路径越界"));
        }
        if stage.symlink_metadata(captured).is_ok() {
            rename_noreplace(&stage, Path::new(captured), &root.dir, source)?;
        }
        if stage.symlink_metadata(backup).is_ok() {
            let target = Path::new(get("target")?);
            if target.is_absolute() || target.components().any(|p| !matches!(p,std::path::Component::Normal(_))) {
                return Err(Error::new("invalid_config", "恢复目标越界"));
            }
            rename_noreplace(&stage, Path::new(backup), &root.dir, target)?;
        }
        Ok(())
    }
    fn recover_checked(&self)->Result<()> {
        for root in self.roots.values(){
            let private=format!("{PRIVATE_PREFIX}staging");
            if root.dir.symlink_metadata(&private).is_err(){continue;}
            let stage=root.staging()?;
            let mut count=0;
            for item in stage.entries()? {
                let item=item?;let name=item.file_name();let Some(name)=name.to_str() else{continue};
                if !name.starts_with("mutation-")||!name.ends_with(".json"){continue;}
                count+=1;if count>256{self.recovery_warnings.lock().unwrap().push("待恢复操作超过 256 项，剩余记录已保留，未继续自动处理".into());break;}
                let file=stage.open(name)?;
                use std::io::Read;let mut bytes=Vec::new();file.take(16385).read_to_end(&mut bytes)?;
                let state:serde_json::Value=match serde_json::from_slice(&bytes){Ok(value)if bytes.len()<=16384=>value,_=>{let mut warnings=self.recovery_warnings.lock().unwrap();if warnings.len()<256{warnings.push(format!("恢复记录 {name} 无效或过大，已保留，未执行文件操作。"));}continue;}};
                if let (Some(target),Some(captured),Some(backup),Some(expected),Some(previous))=(state["target"].as_str(),state["captured"].as_str(),state["backup"].as_str(),state["sourceRevision"].as_str(),state["targetRevision"].as_str()) {
                    valid_name(captured)?;valid_name(backup)?;
                    let target_path=Path::new(target);
                    if target_path.is_absolute()||target_path.components().any(|v|!matches!(v,std::path::Component::Normal(_))){return Err(Error::new("invalid_config","恢复目标越界"));}
                    if stage.symlink_metadata(captured).is_err()&&root.dir.metadata(target_path).ok().is_some_and(|m|metadata_revision(&m)==expected)
                        &&stage.metadata(backup).ok().is_some_and(|m|!m.is_dir()&&metadata_revision(&m)==previous){
                        stage.remove_file(backup)?;stage.remove_file(name)?;continue;
                    }
                }
                // Recovery only restores captured originals into vacant names.
                // It never replays a move/delete or overwrites a new file.
                if self.restore_checked(root,&state).is_err(){
                    let mut warnings=self.recovery_warnings.lock().unwrap();if warnings.len()<256{warnings.push(format!("未完成操作 {name}：原数据保留在私有暂存区；路径已被占用，未覆盖、删除或重放。"));}
                    continue;
                }
                stage.remove_file(name)?;
            }
        }
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
        } else if self
            .root
            .excluded
            .iter()
            .any(|private| within(private, &self.relative))
        {
            // Renaming an ancestor would move keys outside the exclusion and
            // make them reachable. The same guard covers all mutation protocols.
            Err(Error::new("forbidden", "不能修改包含服务配置的目录"))
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
            revision: metadata_revision(&meta),
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

pub(crate) fn metadata_revision(meta: &cap_std::fs::Metadata) -> String {
    let stamp = |time: Option<cap_std::time::SystemTime>| time.and_then(|v|v.into_std().duration_since(UNIX_EPOCH).ok()).unwrap_or_default().as_nanos();
    format!("v2-{:x}-{:x}-{:x}-{:x}-{:x}-{}",meta.dev(),meta.ino(),meta.len(),stamp(meta.modified().ok()),stamp(meta.created().ok()),meta.is_dir() as u8)
}

#[cfg(test)]
mod checked_tests{
    use super::*;
    fn make()->(tempfile::TempDir,PathBuf,PathBuf,Vec<ShareConfig>,Storage){
        let temp=tempfile::tempdir().unwrap();let base=temp.path().canonicalize().unwrap();let files=base.join("files");let data=base.join("data");std::fs::create_dir(&files).unwrap();std::fs::create_dir(&data).unwrap();
        let shares=vec![ShareConfig{name:"Files".into(),path:files.clone()}];let storage=Storage::protected(&shares,&data,&[]).unwrap();(temp,files,data,shares,storage)
    }
    fn pending(files:&Path,storage:&Storage,with_backup:bool)->serde_json::Value{
        std::fs::write(files.join("source"),b"new data").unwrap();std::fs::write(files.join("target"),b"old data").unwrap();
        let source=storage.stat("/Files/source").unwrap();let target=storage.stat("/Files/target").unwrap();
        let root=&storage.roots["Files"];let stage=root.staging().unwrap();
        let record=serde_json::json!({"source":"source","target":"target","captured":"capture-fixture","backup":"backup-fixture","sourceRevision":source.revision,"targetRevision":if with_backup{Some(target.revision)}else{None}});
        std::fs::write(files.join(format!("{PRIVATE_PREFIX}staging/mutation-fixture.json")),record.to_string()).unwrap();
        rename_noreplace(&root.dir,Path::new("source"),&stage,Path::new("capture-fixture")).unwrap();
        if with_backup{rename_noreplace(&root.dir,Path::new("target"),&stage,Path::new("backup-fixture")).unwrap();}
        record
    }
    #[test]
    fn interrupted_capture_restores_source_and_never_replays_a_rename(){
        let(_temp,files,data,shares,storage)=make();pending(&files,&storage,false);drop(storage);
        let recovered=Storage::protected(&shares,&data,&[]).unwrap();assert!(recovered.recovery_warnings.lock().unwrap().is_empty());assert_eq!(std::fs::read(files.join("source")).unwrap(),b"new data");assert_eq!(std::fs::read(files.join("target")).unwrap(),b"old data");assert!(!files.join(format!("{PRIVATE_PREFIX}staging/mutation-fixture.json")).exists());
    }
    #[test]
    fn committed_replace_is_proved_by_identity_before_old_backup_cleanup(){
        let(_temp,files,data,shares,storage)=make();let record=pending(&files,&storage,true);let root=&storage.roots["Files"];let stage=root.staging().unwrap();rename_noreplace(&stage,Path::new("capture-fixture"),&root.dir,Path::new("target")).unwrap();
        // NTFS creation-time tunneling can change the published stamp. In that
        // case recovery must keep the old backup rather than weaken its proof.
        let proved=storage.stat("/Files/target").unwrap().revision==record["sourceRevision"].as_str().unwrap();drop(storage);
        let recovered=Storage::protected(&shares,&data,&[]).unwrap();assert_eq!(std::fs::read(files.join("target")).unwrap(),b"new data");assert!(!files.join("source").exists());
        let backup=files.join(format!("{PRIVATE_PREFIX}staging/backup-fixture"));
        if proved {assert!(recovered.recovery_warnings.lock().unwrap().is_empty());assert!(!backup.exists());}
        else {assert_eq!(recovered.recovery_warnings.lock().unwrap().len(),1);assert_eq!(std::fs::read(backup).unwrap(),b"old data");}
    }
    #[test]
    fn a_racing_creator_is_not_overwritten_and_recovery_warning_does_not_disable_unrelated_reads(){
        let(_temp,files,data,shares,storage)=make();pending(&files,&storage,false);std::fs::write(files.join("source"),b"external").unwrap();drop(storage);
        let recovered=Storage::protected(&shares,&data,&[]).unwrap();assert_eq!(recovered.recovery_warnings.lock().unwrap().len(),1);assert!(recovered.stat("/Files/target").is_ok());assert_eq!(std::fs::read(files.join("source")).unwrap(),b"external");assert_eq!(std::fs::read(files.join(format!("{PRIVATE_PREFIX}staging/capture-fixture"))).unwrap(),b"new data");
    }
    #[test]
    fn a_torn_preparation_journal_never_runs_or_disables_the_service(){
        let(_temp,files,data,shares,storage)=make();let _=storage.roots["Files"].staging().unwrap();std::fs::write(files.join(format!("{PRIVATE_PREFIX}staging/mutation-torn.json")),b"{\"source\":").unwrap();drop(storage);
        let recovered=Storage::protected(&shares,&data,&[]).unwrap();assert_eq!(recovered.recovery_warnings.lock().unwrap().len(),1);assert!(recovered.list("/Files").is_ok());
    }
}
fn within(path: &Path, parent: &Path) -> bool {
    #[cfg(windows)]
    {
        let path = path
            .components()
            .map(|p| p.as_os_str().to_string_lossy().to_lowercase())
            .collect::<Vec<_>>();
        let parent = parent
            .components()
            .map(|p| p.as_os_str().to_string_lossy().to_lowercase())
            .collect::<Vec<_>>();
        path.starts_with(&parent)
    }
    #[cfg(not(windows))]
    path.starts_with(parent)
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
    #[cfg(any(target_os = "linux", target_os = "android"))]
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
    #[cfg(not(any(target_os = "linux", target_os = "android", target_os = "macos")))]
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
