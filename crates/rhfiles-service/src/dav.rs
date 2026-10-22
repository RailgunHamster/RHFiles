use crate::{
    auth::Access,
    model::*,
    storage::{Staged, Storage},
};
use axum::body::Bytes;
use dav_server::{davpath::DavPath, fs::*};
use futures_util::stream;
use std::{
    io::{Read, Seek, SeekFrom, Write},
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub(crate) fn fs_error(e: Error) -> FsError {
    match e.code {
        "not_found" => FsError::NotFound,
        "conflict" => FsError::Exists,
        "forbidden" | "unauthorized" | "invalid_path" => FsError::Forbidden,
        "too_large" => FsError::TooLarge,
        _ => FsError::GeneralFailure,
    }
}
fn path(path: &DavPath) -> FsResult<String> {
    String::from_utf8(path.as_bytes().to_vec()).map_err(|_| FsError::Forbidden)
}
#[derive(Clone)]
pub struct DavFs {
    pub storage: Arc<Storage>,
}

#[derive(Debug, Clone)]
pub struct Meta(pub Entry);
impl DavMetaData for Meta {
    fn len(&self) -> u64 {
        self.0.size
    }
    fn is_dir(&self) -> bool {
        self.0.is_dir
    }
    fn modified(&self) -> FsResult<SystemTime> {
        Ok(UNIX_EPOCH + Duration::from_millis(self.0.modified_ms))
    }
    fn etag(&self) -> Option<String> {
        Some(self.0.revision.clone())
    }
}
struct DirEntry(Entry);
impl DavDirEntry for DirEntry {
    fn name(&self) -> Vec<u8> {
        self.0.name.as_bytes().to_vec()
    }
    fn metadata(&self) -> FsFuture<'_, Box<dyn DavMetaData>> {
        Box::pin(async { Ok(Box::new(Meta(self.0.clone())) as _) })
    }
}
#[derive(Debug)]
struct File {
    file: std::fs::File,
    staged: Option<Staged>,
    entry: Entry,
    access: Access,
}
impl DavFile for File {
    fn metadata(&mut self) -> FsFuture<'_, Box<dyn DavMetaData>> {
        Box::pin(async {
            self.access.check(false, false).map_err(fs_error)?;
            let mut entry = self.entry.clone();
            entry.size = self.file.metadata().map_err(|e| fs_error(e.into()))?.len();
            Ok(Box::new(Meta(entry)) as _)
        })
    }
    fn read_bytes(&mut self, count: usize) -> FsFuture<'_, Bytes> {
        Box::pin(async move {
            self.access.check(false, false).map_err(fs_error)?;
            let mut bytes = vec![0u8; count.min(256 * 1024)];
            let n = self.file.read(&mut bytes).map_err(|e| fs_error(e.into()))?;
            bytes.truncate(n);
            Ok(bytes.into())
        })
    }
    fn write_bytes(&mut self, bytes: Bytes) -> FsFuture<'_, ()> {
        Box::pin(async move {
            self.access.check(true, false).map_err(fs_error)?;
            if self
                .file
                .stream_position()
                .map_err(|e| fs_error(e.into()))?
                .saturating_add(bytes.len() as u64)
                > crate::uploads::MAX_UPLOAD
            {
                return Err(FsError::TooLarge);
            }
            self.file
                .write_all(&bytes)
                .map_err(|e| fs_error(e.into()))?;
            Ok(())
        })
    }
    fn write_buf(&mut self, mut buf: Box<dyn bytes::Buf + Send>) -> FsFuture<'_, ()> {
        Box::pin(async move {
            self.access.check(true, false).map_err(fs_error)?;
            if self
                .file
                .stream_position()
                .map_err(|e| fs_error(e.into()))?
                .saturating_add(buf.remaining() as u64)
                > crate::uploads::MAX_UPLOAD
            {
                return Err(FsError::TooLarge);
            }
            while buf.has_remaining() {
                let data = buf.chunk();
                self.file.write_all(data).map_err(|e| fs_error(e.into()))?;
                let n = data.len();
                buf.advance(n);
            }
            Ok(())
        })
    }
    fn seek(&mut self, pos: SeekFrom) -> FsFuture<'_, u64> {
        Box::pin(async move { self.file.seek(pos).map_err(|e| fs_error(e.into())) })
    }
    fn flush(&mut self) -> FsFuture<'_, ()> {
        Box::pin(async {
            self.access
                .check(self.staged.is_some(), false)
                .map_err(fs_error)?;
            self.file.sync_all().map_err(|e| fs_error(e.into()))?;
            if let Some(staged) = &mut self.staged {
                staged.commit().map_err(fs_error)?;
                self.entry = staged.node.stat().map_err(fs_error)?;
            }
            Ok(())
        })
    }
}

impl GuardedFileSystem<Access> for DavFs {
    fn metadata<'a>(&'a self, p: &'a DavPath, a: &'a Access) -> FsFuture<'a, Box<dyn DavMetaData>> {
        Box::pin(async move {
            a.check(false, false).map_err(fs_error)?;
            Ok(Box::new(Meta(self.storage.stat(&path(p)?).map_err(fs_error)?)) as _)
        })
    }
    fn read_dir<'a>(
        &'a self,
        p: &'a DavPath,
        _meta: ReadDirMeta,
        a: &'a Access,
    ) -> FsFuture<'a, FsStream<Box<dyn DavDirEntry>>> {
        Box::pin(async move {
            a.check(false, false).map_err(fs_error)?;
            let entries = self.storage.list(&path(p)?).map_err(fs_error)?;
            Ok(Box::pin(stream::iter(
                entries
                    .into_iter()
                    .map(|entry| Ok(Box::new(DirEntry(entry)) as Box<dyn DavDirEntry>)),
            )) as _)
        })
    }
    fn open<'a>(
        &'a self,
        p: &'a DavPath,
        options: OpenOptions,
        a: &'a Access,
    ) -> FsFuture<'a, Box<dyn DavFile>> {
        Box::pin(async move {
            let write = options.write
                || options.append
                || options.truncate
                || options.create
                || options.create_new;
            a.check(write, false).map_err(fs_error)?;
            let path = path(p)?;
            let node = self.storage.node(&path).map_err(fs_error)?;
            if write {
                if options.append {
                    return Err(FsError::NotImplemented);
                }
                let staged = node.stage().map_err(fs_error)?;
                let file = staged.file.try_clone().map_err(|e| fs_error(e.into()))?;
                let entry = Entry {
                    name: path.rsplit('/').next().unwrap_or("").into(),
                    path,
                    is_dir: false,
                    size: 0,
                    modified_ms: now_ms(),
                    revision: random().map_err(fs_error)?,
                };
                Ok(Box::new(File {
                    file,
                    staged: Some(staged),
                    entry,
                    access: a.clone(),
                }) as _)
            } else {
                let entry = node.stat().map_err(fs_error)?;
                let file = node.open_read().map_err(fs_error)?;
                Ok(Box::new(File {
                    file,
                    staged: None,
                    entry,
                    access: a.clone(),
                }) as _)
            }
        })
    }
    fn create_dir<'a>(&'a self, p: &'a DavPath, a: &'a Access) -> FsFuture<'a, ()> {
        Box::pin(async move {
            a.check(true, false).map_err(fs_error)?;
            self.storage.mkdir(&path(p)?).map_err(fs_error)
        })
    }
    fn remove_dir<'a>(&'a self, p: &'a DavPath, a: &'a Access) -> FsFuture<'a, ()> {
        Box::pin(async move {
            // dav-server may remove the destination before COPY/MOVE. Those calls
            // must never turn a racing destination into implicit replacement.
            if a.method == "COPY" || a.method == "MOVE" {
                return Err(FsError::Exists);
            }
            a.check(false, true).map_err(fs_error)?;
            self.storage.remove(&path(p)?, true).map_err(fs_error)
        })
    }
    fn remove_file<'a>(&'a self, p: &'a DavPath, a: &'a Access) -> FsFuture<'a, ()> {
        Box::pin(async move {
            if a.method == "COPY" || a.method == "MOVE" {
                return Err(FsError::Exists);
            }
            a.check(false, true).map_err(fs_error)?;
            self.storage.remove(&path(p)?, false).map_err(fs_error)
        })
    }
    fn rename<'a>(&'a self, from: &'a DavPath, to: &'a DavPath, a: &'a Access) -> FsFuture<'a, ()> {
        Box::pin(async move {
            a.check(true, false).map_err(fs_error)?;
            self.storage
                .rename(&path(from)?, &path(to)?)
                .map_err(fs_error)
        })
    }
    fn copy<'a>(&'a self, from: &'a DavPath, to: &'a DavPath, a: &'a Access) -> FsFuture<'a, ()> {
        Box::pin(async move {
            a.check(true, false).map_err(fs_error)?;
            self.storage
                .copy_file(&path(from)?, &path(to)?, || a.check(true, false))
                .map_err(fs_error)
        })
    }
}
