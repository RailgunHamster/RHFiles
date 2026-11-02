//! tus 1.0 creation / HEAD / PATCH / termination. Durable offsets advance only
//! after the staged file is synced. Visibility requires a no-replace commit.
use crate::{
    auth::Access,
    model::*,
    storage::{Staged, Storage, valid_name},
};
use axum::body::Body;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use std::{
    collections::HashMap,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
pub const MAX_UPLOAD: u64 = 1024 * 1024 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Upload {
    pub id: String,
    pub owner: String,
    pub path: String,
    pub staging: String,
    pub length: u64,
    #[serde(default)]
    pub offset: u64,
    pub expires_ms: u64,
    pub completed: bool,
    #[serde(default)]
    pub digest: Option<String>,
    #[serde(default)]
    pub revision: Option<String>,
}
pub struct Uploads {
    directory: PathBuf,
    items: Mutex<HashMap<String, Arc<tokio::sync::Mutex<Upload>>>>,
}
impl Uploads {
    pub fn new(data: &Path) -> Result<Self> {
        let directory = data.join("uploads");
        std::fs::create_dir_all(&directory)?;
        let mut items = HashMap::new();
        for file in std::fs::read_dir(&directory)? {
            let file = file?;
            if file.path().extension().and_then(|v| v.to_str()) != Some("json") {
                continue;
            }
            if file.metadata()?.len() > 16384 {
                continue;
            }
            if let Ok(upload) = serde_json::from_slice::<Upload>(&std::fs::read(file.path())?) {
                if valid_name(&upload.id).is_ok() {
                    items.insert(upload.id.clone(), Arc::new(tokio::sync::Mutex::new(upload)));
                }
            }
            if items.len() >= 256 {
                break;
            }
        }
        Ok(Self {
            directory,
            items: Mutex::new(items),
        })
    }
    fn save(&self, u: &Upload) -> Result<()> {
        let destination = self.directory.join(format!("{}.json", u.id));
        let tmp = self.directory.join(format!("{}.tmp", u.id));
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&tmp)?;
        file.write_all(
            &serde_json::to_vec(u).map_err(|_| Error::new("internal", "无法保存上传状态"))?,
        )?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(tmp, destination)?;
        Ok(())
    }
    pub fn count(&self) -> usize {
        self.items.lock().unwrap().len()
    }
    pub fn reap(&self, storage: &Storage) {
        let records = self
            .items
            .lock()
            .unwrap()
            .values()
            .cloned()
            .collect::<Vec<_>>();
        for item in records {
            if let Ok(u) = item.try_lock() {
                if u.expires_ms >= now_ms() {
                    continue;
                }
                if !u.completed {
                    if let Ok(node) = storage.node(&u.path) {
                        if let Ok(staging) = node.root.staging() {
                            let _ = staging.remove_file(&u.staging);
                        }
                    }
                }
                self.items.lock().unwrap().remove(&u.id);
                let _ = std::fs::remove_file(self.directory.join(format!("{}.json", u.id)));
            }
        }
    }
    pub fn create(
        &self,
        storage: &Storage,
        access: &Access,
        path: String,
        length: u64,
    ) -> Result<Upload> {
        access.check(true, false)?;
        if length > MAX_UPLOAD {
            return Err(Error::new("too_large", "文件超过上传上限"));
        }
        self.reap(storage);
        if self.items.lock().unwrap().len() >= 256 {
            return Err(Error::new("busy", "上传任务过多，请结束或清理旧任务"));
        }
        let node = storage.node(&path)?;
        let mut staged = node.stage()?;
        staged.retain = true;
        let mut upload = Upload {
            id: random()?,
            owner: access.id.clone(),
            path,
            staging: staged.name.clone(),
            length,
            offset: 0,
            expires_ms: now_ms() + 86400000,
            completed: false,
            digest: None,
            revision: None,
        };
        if length == 0 {
            staged.commit()?;
            upload.completed = true;
            upload.revision=Some(crate::connection::file_revision(&staged.file).map_err(|_|Error::new("io_error","无法核对上传文件身份"))?);
        }
        if let Err(e) = self.save(&upload) {
            staged.retain = false;
            return Err(e);
        }
        self.items.lock().unwrap().insert(
            upload.id.clone(),
            Arc::new(tokio::sync::Mutex::new(upload.clone())),
        );
        Ok(upload)
    }
    pub fn get(&self, id: &str) -> Result<Arc<tokio::sync::Mutex<Upload>>> {
        self.items
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| Error::new("not_found", "上传任务不存在"))
    }
    pub fn authorize(&self, u: &Upload, a: &Access) -> Result<()> {
        a.check(true, false)?;
        if u.owner != a.id {
            return Err(Error::new("not_found", "上传任务不存在"));
        }
        if now_ms() > u.expires_ms {
            return Err(Error::new("expired", "上传任务已过期，请取消后重新上传"));
        }
        Ok(())
    }
    pub fn offset(&self, storage: &Storage, u: &Upload) -> Result<u64> {
        if u.completed {
            return Ok(u.length);
        }
        match Staged::reopen(storage.node(&u.path)?, u.staging.clone()) {
            Ok(staged) => {
                let offset = staged.file.metadata()?.len();
                if offset < u.offset {
                    return Err(Error::new(
                        "interrupted",
                        "临时上传数据不完整，请取消后重试",
                    ));
                }
                // Discard only an unacknowledged tail of our private staging
                // file after an interrupted request/process. The durable
                // journal advances only after sync_all, never on allocation.
                if offset > u.offset {
                    staged.file.set_len(u.offset)?;
                    staged.file.sync_all()?;
                }
                if u.offset == u.length {
                    return Err(Error::new(
                        "conflict",
                        "数据尚未发布，目标可能出现冲突，请取消任务后重新上传",
                    ));
                }
                Ok(u.offset)
            }
            Err(error) => {
                // Commit and journal update cannot be one filesystem atomic
                // transaction. A pre-commit durable digest disambiguates a
                // crash after publish; never confuse an unrelated same-size
                // destination with a completed upload.
                if let Some(expected) = &u.digest {
                    let mut file = storage.node(&u.path)?.open_read()?;
                    if file.metadata()?.len() == u.length && digest(&mut file)? == *expected {
                        return Ok(u.length);
                    }
                }
                Err(error)
            }
        }
    }
    pub async fn append(
        &self,
        storage: &Storage,
        a: &Access,
        u: &mut Upload,
        offset: u64,
        body: Body,
    ) -> Result<u64> {
        self.authorize(u, a)?;
        if u.completed {
            return Err(Error::new("conflict", "上传已经完成"));
        }
        let mut staged = Staged::reopen(storage.node(&u.path)?, u.staging.clone())?;
        if staged.file.metadata()?.len() != offset {
            return Err(Error::new(
                "offset_mismatch",
                "上传偏移已变化，请重新读取服务器进度",
            ));
        }
        staged.file.seek(SeekFrom::Start(offset))?;
        // Keep tiny HTTP/TLS frames out of the blocking filesystem path.
        // Acknowledgements still mean file + journal are durably synced.
        let mut output = tokio::io::BufWriter::with_capacity(1024 * 1024,
            tokio::fs::File::from_std(staged.file.try_clone()?));
        let mut written = offset;
        let mut stream = body.into_data_stream();
        while let Some(chunk) =
            tokio::time::timeout(std::time::Duration::from_secs(45), stream.next())
                .await
                .map_err(|_| Error::new("timeout", "上传连接长时间没有数据"))?
        {
            a.check(true, false)?;
            let chunk =
                chunk.map_err(|_| Error::new("interrupted", "上传已中断，可查询进度后续传"))?;
            if written.saturating_add(chunk.len() as u64) > u.length {
                return Err(Error::new("too_large", "上传内容超过声明长度"));
            }
            output.write_all(&chunk).await?;
            written += chunk.len() as u64;
        }
        output.flush().await?;
        output.get_ref().sync_all().await?;
        drop(output);
        a.check(true, false)?;
        let mut checkpoint = u.clone();
        checkpoint.offset = written;
        self.save(&checkpoint)?;
        // A failed journal write cannot make HEAD claim an offset which would
        // disappear after restart. Unacknowledged staging tails are discarded.
        *u = checkpoint;
        if written == u.length {
            a.check(true, false)?;
            let mut file = staged.file.try_clone()?;
            let access = a.clone();
            u.digest = Some(tokio::task::spawn_blocking(move || {
                access.check(true, false)?;
                digest(&mut file)
            }).await.map_err(|_| Error::new("internal", "上传摘要计算失败"))??);
            self.save(u)?;
            a.check(true, false)?;
            staged.commit()?;
            u.completed = true;
            u.revision=Some(crate::connection::file_revision(&staged.file).map_err(|_|Error::new("io_error","无法核对上传文件身份"))?);
            self.save(u)?;
        }
        Ok(written)
    }
    pub fn cancel(&self, storage: &Storage, a: &Access, u: &Upload) -> Result<()> {
        a.check(true, false)?;
        if a.id != u.owner {
            return Err(Error::new("not_found", "上传任务不存在"));
        }
        if !u.completed {
            let node = storage.node(&u.path)?;
            match node.root.staging()?.remove_file(&u.staging) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            }
        }
        self.items.lock().unwrap().remove(&u.id);
        let _ = std::fs::remove_file(self.directory.join(format!("{}.json", u.id)));
        Ok(())
    }
}
fn digest(file: &mut std::fs::File) -> Result<String> {
    use sha2::{Digest, Sha256};
    file.seek(SeekFrom::Start(0))?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

#[cfg(test)] mod tests {
    use super::*;
    #[tokio::test]
    async fn failed_checkpoint_never_advances_head_past_the_durable_journal() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().canonicalize().unwrap(); let files = base.join("files"); let data = base.join("state");
        std::fs::create_dir(&files).unwrap(); std::fs::create_dir(&data).unwrap();
        let storage = Storage::protected(&[ShareConfig { name: "Files".into(), path: files.clone() }], &data, &[]).unwrap();
        let groups = Arc::new(crate::groups::Groups::open(&data).unwrap());
        let group = groups.create("Checkpoint QA", "Host", Permissions { write: true, delete: true }).unwrap();
        let auth = crate::auth::Auth::new(&data).unwrap();
        let credentials = auth.group_session(groups.clone(), &group, &groups.device_id()).unwrap();
        let access = auth.authenticate(Some(&format!("Bearer {}:{}", credentials["username"].as_str().unwrap(), credentials["password"].as_str().unwrap())), "PATCH").unwrap();
        let uploads = Uploads::new(&data).unwrap();
        let mut upload = uploads.create(&storage, &access, "/Files/new.bin".into(), 10).unwrap();
        let blocked = data.join("uploads").join(format!("{}.tmp", upload.id));
        std::fs::create_dir(&blocked).unwrap();
        assert!(uploads.append(&storage, &access, &mut upload, 0, Body::from("first")).await.is_err());
        assert_eq!(upload.offset, 0);
        assert_eq!(uploads.offset(&storage, &upload).unwrap(), 0);
        let restored = Uploads::new(&data).unwrap();
        assert_eq!(restored.get(&upload.id).unwrap().lock().await.offset, 0);
        assert!(!files.join("new.bin").exists());
        std::fs::remove_dir(&blocked).unwrap();
        assert_eq!(uploads.append(&storage, &access, &mut upload, 0, Body::from("0123456789")).await.unwrap(), 10);
        assert_eq!(std::fs::read(files.join("new.bin")).unwrap(), b"0123456789");
        assert!(upload.completed);
    }
}
