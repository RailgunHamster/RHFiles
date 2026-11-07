//! Recycle on the computer hosting the share, preserving its original location.
//! Never fall back to permanent deletion when the OS cannot recycle an item.
use crate::{model::*, storage::Node};

#[derive(Clone, Debug)]
pub(crate) struct Recycled {
    pub revision: String,
    pub path: std::path::PathBuf,
    pub pidl: Vec<u8>,
}

#[cfg(not(windows))]
pub(crate) fn put(
    _node: Node,
    _revision: String,
    _check: impl Fn() -> Result<()> + Send + Sync + 'static,
) -> Result<Recycled> {
    Err(Error::new(
        "recycle_unavailable",
        "此电脑的文件服务暂不支持回收站，文件已保留",
    ))
}

#[cfg(windows)]
pub(crate) use windows_bin::{put, restore_to};

#[cfg(not(windows))]
pub(crate) fn restore_to(
    _: &Recycled,
    _: &Node,
    _: &std::path::Path,
    _: impl Fn() -> Result<()> + Send + Sync + 'static,
) -> Result<()> {
    Err(Error::new(
        "recycle_unavailable",
        "此电脑暂不支持回收站还原",
    ))
}

#[cfg(windows)]
mod windows_bin {
    use super::*;
    use cap_fs_ext::{FollowSymlinks, MetadataExt, OpenOptionsFollowExt};
    use cap_std::fs::{OpenOptions, OpenOptionsExt};
    use std::{
        fs::File,
        os::windows::fs::{MetadataExt as _, OpenOptionsExt as _},
        sync::{Arc, Mutex},
    };
    use windows::{
        Win32::{
            Foundation::{E_ABORT, RPC_E_CHANGED_MODE},
            System::Com::{
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
                CoTaskMemFree, CoUninitialize,
            },
            UI::Shell::*,
        },
        core::{HRESULT, HSTRING, PCWSTR, Ref, implement},
    };
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
        FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
    };

    fn failure(error: windows::core::Error) -> Error {
        Error::new(
            "recycle_unavailable",
            format!(
                "Windows 未完成移入回收站操作（0x{:08X}），请检查目标电脑的回收站和权限",
                error.code().0 as u32
            ),
        )
    }

    // The Shell requires an absolute path. Pin every parent against rename,
    // reject reparse points, and verify it still names the configured capability.
    fn pin_parents(node: &Node) -> Result<Vec<File>> {
        use std::os::windows::fs::OpenOptionsExt as _;
        let path = node.root.host_path.join(&node.relative);
        let mut guards = Vec::new();
        for parent in path
            .parent()
            .unwrap()
            .ancestors()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
        {
            if !parent.is_absolute() {
                continue;
            }
            let file = std::fs::OpenOptions::new()
                .access_mode(FILE_READ_ATTRIBUTES)
                .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
                .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
                .open(parent)?;
            if file.metadata()?.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                return Err(Error::new("forbidden", "回收站操作不能经过重解析点"));
            }
            if parent == node.root.host_path {
                let pinned = cap_std::fs::Metadata::from_file(&file)?;
                let configured = node.root.dir.dir_metadata()?;
                if pinned.dev() != configured.dev() || pinned.ino() != configured.ino() {
                    return Err(Error::new("conflict", "共享位置已变化，文件已保留"));
                }
            }
            guards.push(file);
        }
        Ok(guards)
    }

    fn capture(item: &IShellItem) -> Result<Recycled> {
        unsafe {
            let text = item.GetDisplayName(SIGDN_FILESYSPATH).map_err(failure)?;
            let path = text
                .to_string()
                .map(std::path::PathBuf::from)
                .map_err(|_| Error::new("invalid_path", "回收站路径编码无效"));
            CoTaskMemFree(Some(text.0.cast()));
            let path = path?;
            let file = std::fs::OpenOptions::new()
                .access_mode(FILE_READ_ATTRIBUTES)
                .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
                .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
                .open(&path)?;
            let revision = crate::connection::file_revision(&file)
                .map_err(|_| Error::new("io_error", "无法核对回收站项目身份"))?;
            let id = SHGetIDListFromObject(item).map_err(failure)?;
            let size = ILGetSize(Some(id)) as usize;
            let pidl = if (2..=65536).contains(&size) {
                Some(std::slice::from_raw_parts(id.cast::<u8>(), size).to_vec())
            } else {
                None
            };
            CoTaskMemFree(Some(id.cast()));
            Ok(Recycled {
                revision,
                path,
                pidl: pidl
                    .ok_or_else(|| Error::new("recycle_unavailable", "回收站项目标识无效"))?,
            })
        }
    }
    type Receipt = Arc<Mutex<Option<Result<Recycled>>>>;
    #[implement(IFileOperationProgressSink)]
    struct Observer {
        check: Box<dyn Fn() -> Result<()> + Send + Sync>,
        receipt: Receipt,
        restoring: bool,
    }
    impl IFileOperationProgressSink_Impl for Observer_Impl {
        fn PreDeleteItem(&self, flags: u32, _: Ref<'_, IShellItem>) -> windows::core::Result<()> {
            let result = if flags & TSF_DELETE_RECYCLE_IF_POSSIBLE.0 as u32 == 0 {
                Err(Error::new(
                    "recycle_unavailable",
                    "目标电脑无法回收此项目，文件已保留",
                ))
            } else {
                (self.check)()
            };
            if let Err(error) = result {
                *self.receipt.lock().unwrap() = Some(Err(error));
                return Err(E_ABORT.into());
            }
            Ok(())
        }
        fn PostDeleteItem(
            &self,
            _: u32,
            _: Ref<'_, IShellItem>,
            result: HRESULT,
            item: Ref<'_, IShellItem>,
        ) -> windows::core::Result<()> {
            let mut receipt = self.receipt.lock().unwrap();
            if receipt.is_none() {
                *receipt = Some(result.ok().map_err(failure).and_then(|_| {
                    if let Some(item) = item.as_ref() {
                        capture(item)
                    } else {
                        Err(Error::new(
                            "recycle_unavailable",
                            "Windows 未返回回收站项目，请在目标电脑检查操作结果",
                        ))
                    }
                }));
            }
            Ok(())
        }
        fn StartOperations(&self) -> windows::core::Result<()> {
            Ok(())
        }
        fn FinishOperations(&self, _: HRESULT) -> windows::core::Result<()> {
            Ok(())
        }
        fn PreRenameItem(
            &self,
            _: u32,
            _: Ref<'_, IShellItem>,
            _: &PCWSTR,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PostRenameItem(
            &self,
            _: u32,
            _: Ref<'_, IShellItem>,
            _: &PCWSTR,
            _: HRESULT,
            _: Ref<'_, IShellItem>,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PreMoveItem(
            &self,
            _: u32,
            _: Ref<'_, IShellItem>,
            _: Ref<'_, IShellItem>,
            _: &PCWSTR,
        ) -> windows::core::Result<()> {
            (self.check)().map_err(|_| E_ABORT.into())
        }
        fn PostMoveItem(
            &self,
            _: u32,
            _: Ref<'_, IShellItem>,
            _: Ref<'_, IShellItem>,
            _: &PCWSTR,
            result: HRESULT,
            item: Ref<'_, IShellItem>,
        ) -> windows::core::Result<()> {
            if self.restoring {
                *self.receipt.lock().unwrap() = Some(result.ok().map_err(failure).and_then(|_| {
                    item.as_ref()
                        .ok_or_else(|| Error::new("recycle_unavailable", "Windows 未确认还原项目"))
                        .and_then(capture)
                }));
            }
            Ok(())
        }
        fn PreCopyItem(
            &self,
            _: u32,
            _: Ref<'_, IShellItem>,
            _: Ref<'_, IShellItem>,
            _: &PCWSTR,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PostCopyItem(
            &self,
            _: u32,
            _: Ref<'_, IShellItem>,
            _: Ref<'_, IShellItem>,
            _: &PCWSTR,
            _: HRESULT,
            _: Ref<'_, IShellItem>,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PreNewItem(
            &self,
            _: u32,
            _: Ref<'_, IShellItem>,
            _: &PCWSTR,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PostNewItem(
            &self,
            _: u32,
            _: Ref<'_, IShellItem>,
            _: &PCWSTR,
            _: &PCWSTR,
            _: u32,
            _: HRESULT,
            _: Ref<'_, IShellItem>,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn UpdateProgress(&self, _: u32, _: u32) -> windows::core::Result<()> {
            Ok(())
        }
        fn ResetTimer(&self) -> windows::core::Result<()> {
            Ok(())
        }
        fn PauseTimer(&self) -> windows::core::Result<()> {
            Ok(())
        }
        fn ResumeTimer(&self) -> windows::core::Result<()> {
            Ok(())
        }
    }

    pub(crate) fn put(
        node: Node,
        revision: String,
        check: impl Fn() -> Result<()> + Send + Sync + 'static,
    ) -> Result<Recycled> {
        let _parents = pin_parents(&node)?;
        let mut options = OpenOptions::new();
        options
            .access_mode(FILE_READ_ATTRIBUTES)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_DELETE)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .follow(FollowSymlinks::No);
        let source = node.root.dir.open_with(&node.relative, &options)?;
        let path = node.root.host_path.join(&node.relative);
        let validate = move || {
            check()?;
            if crate::storage::metadata_revision(&source.metadata()?) != revision
                || node.stat()?.revision != revision
            {
                return Err(Error::new("conflict", "源文件已变化，未移入回收站"));
            }
            Ok(())
        };
        validate()?;
        // Keep the original path so Windows records the original name and parent.
        let text = path
            .to_str()
            .ok_or_else(|| Error::new("invalid_path", "路径编码无效"))?;
        let text = text.strip_prefix("\\\\?\\").unwrap_or(text);
        let apartment = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        if apartment.is_err() && apartment != RPC_E_CHANGED_MODE {
            return Err(failure(windows::core::Error::from_hresult(apartment)));
        }
        let result = (|| unsafe {
            let operation: IFileOperation =
                CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER).map_err(failure)?;
            operation
                .SetOperationFlags(FILEOPERATION_FLAGS(
                    FOF_SILENT.0
                        | FOF_NOCONFIRMATION.0
                        | FOF_NOERRORUI.0
                        | FOFX_RECYCLEONDELETE.0
                        | FOFX_EARLYFAILURE.0,
                ))
                .map_err(failure)?;
            let item: IShellItem =
                SHCreateItemFromParsingName(&HSTRING::from(text), None).map_err(failure)?;
            let receipt: Receipt = Arc::new(Mutex::new(None));
            let observer: IFileOperationProgressSink = Observer {
                check: Box::new(validate),
                receipt: receipt.clone(),
                restoring: false,
            }
            .into();
            operation.DeleteItem(&item, &observer).map_err(failure)?;
            let performed = operation.PerformOperations();
            let recycled = if let Some(outcome) = receipt.lock().unwrap().take() {
                outcome?
            } else {
                return Err(Error::new(
                    "recycle_unavailable",
                    "Windows 未确认回收站操作，请在目标电脑检查操作结果",
                ));
            };
            performed.map_err(failure)?;
            if operation
                .GetAnyOperationsAborted()
                .map_err(failure)?
                .as_bool()
            {
                return Err(Error::new(
                    "recycle_unavailable",
                    "移入回收站已中止，请检查目标电脑的回收站",
                ));
            }
            Ok(recycled)
        })();
        if apartment.is_ok() {
            unsafe { CoUninitialize() };
        }
        result
    }

    pub(crate) fn restore_to(
        recycled: &Recycled,
        node: &Node,
        destination: &std::path::Path,
        check: impl Fn() -> Result<()> + Send + Sync + 'static,
    ) -> Result<()> {
        let _parents = pin_parents(node)?;
        use std::os::windows::fs::OpenOptionsExt as _;
        let source = std::fs::OpenOptions::new()
            .access_mode(FILE_READ_ATTRIBUTES)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_DELETE)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(&recycled.path)?;
        let revision = recycled.revision.clone();
        let validate = move || {
            check()?;
            if crate::connection::file_revision(&source)
                .map_err(|_| Error::new("io_error", "无法核对回收站项目"))?
                != revision
            {
                return Err(Error::new("conflict", "回收站项目已变化，未还原"));
            }
            Ok(())
        };
        validate()?;
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(failure)?;
        }
        struct Apartment;
        impl Drop for Apartment {
            fn drop(&mut self) {
                unsafe { CoUninitialize() };
            }
        }
        let _apartment = Apartment;
        unsafe {
            let item: IShellItem =
                SHCreateItemFromIDList(recycled.pidl.as_ptr().cast()).map_err(failure)?;
            let parent: IShellItem = SHCreateItemFromParsingName(
                &HSTRING::from(
                    destination
                        .parent()
                        .unwrap()
                        .to_string_lossy()
                        .trim_start_matches("\\\\?\\"),
                ),
                None,
            )
            .map_err(failure)?;
            let operation: IFileOperation =
                CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER).map_err(failure)?;
            operation
                .SetOperationFlags(FILEOPERATION_FLAGS(
                    FOF_SILENT.0
                        | FOF_NOCONFIRMATION.0
                        | FOF_NOERRORUI.0
                        | FOF_RENAMEONCOLLISION.0
                        | FOFX_EARLYFAILURE.0,
                ))
                .map_err(failure)?;
            let receipt: Receipt = Arc::new(Mutex::new(None));
            let observer: IFileOperationProgressSink = Observer {
                check: Box::new(validate),
                receipt: receipt.clone(),
                restoring: true,
            }
            .into();
            operation
                .MoveItem(
                    &item,
                    &parent,
                    &HSTRING::from(destination.file_name().unwrap().to_string_lossy().as_ref()),
                    &observer,
                )
                .map_err(failure)?;
            operation.PerformOperations().map_err(failure)?;
            let restored = receipt
                .lock()
                .unwrap()
                .take()
                .ok_or_else(|| Error::new("recycle_unavailable", "Windows 未确认还原操作"))??;
            if restored.path.canonicalize()? != destination.canonicalize()?
                || operation
                    .GetAnyOperationsAborted()
                    .map_err(failure)?
                    .as_bool()
            {
                return Err(Error::new(
                    "recovery_required",
                    "回收站还原未完成，数据保留在共享私有暂存区",
                ));
            }
            Ok(())
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn shell_cannot_fall_back_to_permanent_deletion() {
            let receipt: Receipt = Arc::new(Mutex::new(None));
            let observer: IFileOperationProgressSink = Observer {
                check: Box::new(|| panic!("A non-recyclable operation must be rejected first")),
                receipt: receipt.clone(),
                restoring: false,
            }
            .into();
            let result = unsafe { observer.PreDeleteItem(0, None::<&IShellItem>) };
            assert_eq!(result.unwrap_err().code(), E_ABORT);
            assert_eq!(
                receipt.lock().unwrap().take().unwrap().unwrap_err().code,
                "recycle_unavailable"
            );
        }
    }
}
