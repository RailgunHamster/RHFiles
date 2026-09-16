use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsFileClipboardInfo {
    pub sequence: u32,
    pub has_files: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsFilePasteResult {
    pub aborted: bool,
    pub moved: bool,
}

#[cfg(target_os = "windows")]
mod native {
    use super::{WindowsFileClipboardInfo, WindowsFilePasteResult};
    use crate::types::CancelFlag;
    use std::{
        os::windows::ffi::OsStrExt,
        path::{Path, PathBuf},
        ptr,
        sync::Mutex,
        thread,
        time::{Duration, Instant},
    };
    use tauri::{Emitter, Manager};
    use windows::{
        Win32::{
            Foundation::{E_ABORT, GlobalFree, HANDLE, HGLOBAL, HWND, POINT},
            System::{
                Com::{
                    CLSCTX_INPROC_SERVER, CoCreateInstance, CoTaskMemFree, DVASPECT_CONTENT,
                    FORMATETC, TYMED_HGLOBAL, TYMED_ISTREAM,
                },
                DataExchange::{
                    CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber,
                    IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW,
                    SetClipboardData,
                },
                Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock},
                Ole::{
                    CF_HDROP, DROPEFFECT_MOVE, OleGetClipboard, OleInitialize,
                    OleUninitialize, ReleaseStgMedium,
                },
            },
            UI::Shell::{
                FILEDESCRIPTORW, FILEOPERATION_FLAGS, FOF_ALLOWUNDO,
                FOF_NOCONFIRMMKDIR, FOF_RENAMEONCOLLISION, FOFX_ADDUNDORECORD,
                FOFX_SHOWELEVATIONPROMPT, FileOperation, IFileOperation, IOperationsProgressDialog,
                IOperationsProgressDialog_Impl, IShellItem,
                PropertiesSystem::{PDOPS_CANCELLED, PDOPS_PAUSED, PDOPS_RUNNING, PDOPSTATUS},
                SHCreateItemFromParsingName, SIGDN, SIGDN_FILESYSPATH, SIGDN_NORMALDISPLAY,
                SPACTION,
            },
        },
        Win32::Storage::FileSystem::FILE_ATTRIBUTE_DIRECTORY,
        core::{HSTRING, IUnknown, Interface, Ref, implement},
    };

    const FILE_DESCRIPTOR_W: &str = "FileGroupDescriptorW";
    const FILE_DESCRIPTOR_A: &str = "FileGroupDescriptor";
    const SHELL_ID_LIST: &str = "Shell IDList Array";
    const FILE_CONTENTS: &str = "FileContents";

    /// Decodes the wide, null-terminated `cFileName` of a file descriptor.
    /// The descriptor struct is packed, so field access goes through raw
    /// pointers instead of references.
    fn descriptor_file_name(descriptor: &FILEDESCRIPTORW) -> String {
        let base = unsafe { ptr::addr_of!((*descriptor).cFileName) as *const u16 };
        let mut units = Vec::with_capacity(260);
        unsafe {
            for index in 0..260 {
                let unit = base.add(index).read_unaligned();
                if unit == 0 {
                    break;
                }
                units.push(unit);
            }
        }
        String::from_utf16_lossy(&units)
    }

    /// Builds a collision-free target path, appending " (n)" before the
    /// extension like Explorer does when both files must be kept.
    fn unique_destination_path(destination: &Path, name: &str) -> PathBuf {
        let cleaned = name.replace(['/', '\\'], "_");
        let direct = destination.join(&cleaned);
        if !direct.exists() {
            return direct;
        }
        let dot = cleaned.rfind('.').filter(|index| *index > 0);
        let (base, extension) = match dot {
            Some(index) => (cleaned[..index].to_string(), cleaned[index..].to_string()),
            None => (cleaned.clone(), String::new()),
        };
        for index in 1u32.. {
            let candidate = destination.join(format!("{base} ({index}){extension}"));
            if !candidate.exists() {
                return candidate;
            }
        }
        direct
    }

    /// Streams one virtual clipboard file into `target` through the
    /// FileContents format exposed by Remote Desktop and similar hosts.
    unsafe fn write_descriptor_stream(
        data_object: &windows::Win32::System::Com::IDataObject,
        contents_format: u32,
        index: i32,
        target: &Path,
    ) -> Result<(), String> {
        let request = FORMATETC {
            cfFormat: contents_format as u16,
            ptd: ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0 as u32,
            lindex: index,
            tymed: TYMED_ISTREAM.0 as u32,
        };
        let mut medium = unsafe { data_object.GetData(&request) }
            .map_err(|error| format!("Unable to open the remote file stream: {error}"))?;
        if medium.tymed != TYMED_ISTREAM.0 as u32 || (*medium.u.pstm).is_none() {
            unsafe { ReleaseStgMedium(&mut medium) };
            return Err("The remote clipboard did not provide file contents".to_string());
        }
        let stream = (*medium.u.pstm).clone()
            .ok_or_else(|| "The remote clipboard did not provide file contents".to_string())?;
        let outcome = (|| -> Result<(), String> {
            use std::io::Write;
            let mut file = std::fs::File::create(target)
                .map_err(|error| format!("Cannot create {}: {error}", target.display()))?;
            let mut buffer = vec![0u8; 1024 * 512];
            loop {
                let mut read = 0u32;
                let status =
                    unsafe { stream.Read(buffer.as_mut_ptr().cast(), buffer.len() as u32, Some(&mut read)) };
                if status.is_err() {
                    return Err(format!("Unable to read the remote file: {status}"));
                }
                if read == 0 {
                    break;
                }
                file.write_all(&buffer[..read as usize])
                    .map_err(|error| format!("Cannot write {}: {error}", target.display()))?;
            }
            Ok(())
        })();
        drop(stream);
        unsafe { ReleaseStgMedium(&mut medium) };
        outcome
    }

    /// Pastes a Remote Desktop (or otherwise virtual) clipboard that only
    /// offers FileGroupDescriptorW + FileContents instead of CF_HDROP.
    /// Returns how many items were written.
    pub fn paste_file_group_descriptors(
        data_object: &windows::Win32::System::Com::IDataObject,
        destination: &str,
    ) -> Result<usize, String> {
        let descriptor_format = register_format(FILE_DESCRIPTOR_W);
        let contents_format = register_format(FILE_CONTENTS);
        if descriptor_format == 0 || contents_format == 0 {
            return Err("The remote clipboard did not expose its file transfer formats".to_string());
        }
        let request = FORMATETC {
            cfFormat: descriptor_format as u16,
            ptd: ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0 as u32,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let mut medium = unsafe { data_object.GetData(&request) }
            .map_err(|error| format!("Unable to read the remote file list: {error}"))?;
        if medium.tymed != TYMED_HGLOBAL.0 as u32 || unsafe { medium.u.hGlobal.is_invalid() } {
            unsafe { ReleaseStgMedium(&mut medium) };
            return Err("The remote clipboard file list was empty".to_string());
        }
        let memory = unsafe { medium.u.hGlobal };
        let pointer = unsafe { GlobalLock(memory) };
        if pointer.is_null() {
            unsafe { ReleaseStgMedium(&mut medium) };
            return Err("Unable to read the remote clipboard file list".to_string());
        }
        let descriptors: Vec<FILEDESCRIPTORW> = unsafe {
            let count = *(pointer.cast::<u32>());
            let stride = std::mem::size_of::<FILEDESCRIPTORW>();
            let array_base = pointer.cast::<u8>().add(std::mem::size_of::<u32>());
            let usable = GlobalSize(memory).saturating_sub(std::mem::size_of::<u32>());
            let count = (count as usize).min(usable / stride.max(1));
            (0..count)
                .map(|index| ptr::read_unaligned(array_base.add(index * stride).cast()))
                .collect()
        };
        unsafe {
            let _ = GlobalUnlock(memory);
            ReleaseStgMedium(&mut medium);
        }

        let destination_path = PathBuf::from(destination);
        if !destination_path.is_dir() {
            return Err(format!(
                "Destination folder does not exist: {}",
                destination_path.display()
            ));
        }
        let mut pasted = 0usize;
        for (index, descriptor) in descriptors.iter().enumerate() {
            let name = descriptor_file_name(descriptor);
            if name.trim().is_empty() || name.contains("..") {
                continue;
            }
            let target = unique_destination_path(&destination_path, &name);
            if descriptor.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY.0 != 0 {
                std::fs::create_dir_all(&target)
                    .map_err(|error| format!("Cannot create {name}: {error}"))?;
                pasted += 1;
                continue;
            }
            unsafe { write_descriptor_stream(data_object, contents_format, index as i32, &target)? };
            pasted += 1;
        }
        if pasted == 0 {
            return Err("The remote clipboard did not contain any files".to_string());
        }
        Ok(pasted)
    }
    const PREFERRED_DROP_EFFECT: &str = "Preferred DropEffect";

    fn progress_percentage(
        points_current: u64,
        points_total: u64,
        bytes_current: u64,
        bytes_total: u64,
        items_current: u64,
        items_total: u64,
    ) -> u32 {
        let ratio = if bytes_total > 0 {
            bytes_current as f64 / bytes_total as f64
        } else if points_total > 0 {
            points_current as f64 / points_total as f64
        } else if items_total > 0 {
            items_current as f64 / items_total as f64
        } else {
            0.0
        };
        (ratio.clamp(0.0, 1.0) * 100.0).round() as u32
    }

    struct ClipboardProgressState {
        started: Instant,
        last_emit: Instant,
        last_bytes: u64,
        smoothed_speed: f64,
        current_name: String,
        current_path: String,
        paused: bool,
    }

    #[implement(IOperationsProgressDialog)]
    struct ClipboardProgressDialog {
        app: tauri::AppHandle,
        operation_id: String,
        operation: &'static str,
        destination: String,
        state: Mutex<ClipboardProgressState>,
    }

    impl ClipboardProgressDialog {
        fn new(
            app: tauri::AppHandle,
            operation_id: String,
            operation: &'static str,
            destination: String,
        ) -> Self {
            let now = Instant::now();
            Self {
                app,
                operation_id,
                operation,
                destination: destination.clone(),
                state: Mutex::new(ClipboardProgressState {
                    started: now,
                    last_emit: now,
                    last_bytes: 0,
                    smoothed_speed: 0.0,
                    current_name: String::new(),
                    current_path: destination,
                    paused: false,
                }),
            }
        }
    }

    impl ClipboardProgressDialog_Impl {
        fn cancelled(&self) -> bool {
            self.app
                .try_state::<CancelFlag>()
                .and_then(|cancel| cancel.is_cancelled(Some(&self.operation_id)).ok())
                .unwrap_or(false)
        }

        fn ensure_not_cancelled(&self) -> windows::core::Result<()> {
            if self.cancelled() {
                Err(E_ABORT.into())
            } else {
                Ok(())
            }
        }

        fn emit_progress(
            &self,
            points_current: u64,
            points_total: u64,
            bytes_current: u64,
            bytes_total: u64,
            items_current: u64,
            items_total: u64,
        ) {
            let Ok(mut state) = self.state.lock() else {
                return;
            };
            let now = Instant::now();
            let interval = now.duration_since(state.last_emit).as_secs_f64();
            let complete = (bytes_total > 0 && bytes_current >= bytes_total)
                || (points_total > 0 && points_current >= points_total)
                || (items_total > 0 && items_current >= items_total);
            if !complete && interval < 0.1 {
                return;
            }
            if interval > 0.0 && bytes_current >= state.last_bytes {
                let sample = bytes_current.saturating_sub(state.last_bytes) as f64 / interval;
                state.smoothed_speed = if state.smoothed_speed > 0.0 {
                    state.smoothed_speed * 0.72 + sample * 0.28
                } else {
                    sample
                };
            }
            state.last_emit = now;
            state.last_bytes = bytes_current;
            let elapsed_seconds = now.duration_since(state.started).as_secs_f64();
            let percentage = progress_percentage(
                points_current,
                points_total,
                bytes_current,
                bytes_total,
                items_current,
                items_total,
            );
            let _ = self.app.emit(
                "op-progress",
                serde_json::json!({
                    "operationId": self.operation_id,
                    "operation": self.operation,
                    "src": "windows-clipboard",
                    "dest": self.destination,
                    "currentPath": state.current_path,
                    "currentName": state.current_name,
                    "bytesTransferred": bytes_current,
                    "totalBytes": bytes_total,
                    "entriesCompleted": items_current,
                    "totalEntries": items_total,
                    "percentage": percentage,
                    "speed": state.smoothed_speed.max(0.0) as u64,
                    "elapsedSeconds": elapsed_seconds,
                    "status": "progress",
                }),
            );
        }

        fn update_current_item(&self, item: Ref<'_, IShellItem>) {
            let Some(item) = item.as_ref() else {
                return;
            };
            let full_path = shell_item_name(item, SIGDN_FILESYSPATH);
            let display_name = shell_item_name(item, SIGDN_NORMALDISPLAY);
            let Ok(mut state) = self.state.lock() else {
                return;
            };
            if let Some(path) = full_path {
                state.current_name = Path::new(&path)
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_else(|| path.clone());
                state.current_path = path;
            } else if let Some(name) = display_name {
                state.current_path = Path::new(&self.destination)
                    .join(&name)
                    .to_string_lossy()
                    .into_owned();
                state.current_name = name;
            }
        }
    }

    fn shell_item_name(item: &IShellItem, kind: SIGDN) -> Option<String> {
        unsafe {
            let value = item.GetDisplayName(kind).ok()?;
            let result = value.to_string().ok();
            CoTaskMemFree(Some(value.0.cast()));
            result
        }
    }

    #[allow(non_snake_case)]
    impl IOperationsProgressDialog_Impl for ClipboardProgressDialog_Impl {
        fn StartProgressDialog(&self, _hwndowner: HWND, _flags: u32) -> windows::core::Result<()> {
            self.ensure_not_cancelled()
        }

        fn StopProgressDialog(&self) -> windows::core::Result<()> {
            Ok(())
        }

        fn SetOperation(&self, _action: SPACTION) -> windows::core::Result<()> {
            self.ensure_not_cancelled()
        }

        fn SetMode(&self, _mode: u32) -> windows::core::Result<()> {
            self.ensure_not_cancelled()
        }

        fn UpdateProgress(
            &self,
            points_current: u64,
            points_total: u64,
            bytes_current: u64,
            bytes_total: u64,
            items_current: u64,
            items_total: u64,
        ) -> windows::core::Result<()> {
            self.ensure_not_cancelled()?;
            self.emit_progress(
                points_current,
                points_total,
                bytes_current,
                bytes_total,
                items_current,
                items_total,
            );
            Ok(())
        }

        fn UpdateLocations(
            &self,
            _source: Ref<'_, IShellItem>,
            _target: Ref<'_, IShellItem>,
            item: Ref<'_, IShellItem>,
        ) -> windows::core::Result<()> {
            self.ensure_not_cancelled()?;
            self.update_current_item(item);
            Ok(())
        }

        fn ResetTimer(&self) -> windows::core::Result<()> {
            let now = Instant::now();
            if let Ok(mut state) = self.state.lock() {
                state.started = now;
                state.last_emit = now;
                state.last_bytes = 0;
                state.smoothed_speed = 0.0;
            }
            Ok(())
        }

        fn PauseTimer(&self) -> windows::core::Result<()> {
            if let Ok(mut state) = self.state.lock() {
                state.paused = true;
            }
            Ok(())
        }

        fn ResumeTimer(&self) -> windows::core::Result<()> {
            if let Ok(mut state) = self.state.lock() {
                state.paused = false;
                state.last_emit = Instant::now();
            }
            self.ensure_not_cancelled()
        }

        fn GetMilliseconds(
            &self,
            elapsed: *mut u64,
            remaining: *mut u64,
        ) -> windows::core::Result<()> {
            let elapsed_ms = self
                .state
                .lock()
                .map(|state| state.started.elapsed().as_millis() as u64)
                .unwrap_or(0);
            unsafe {
                if !elapsed.is_null() {
                    elapsed.write(elapsed_ms);
                }
                if !remaining.is_null() {
                    remaining.write(0);
                }
            }
            Ok(())
        }

        fn GetOperationStatus(&self) -> windows::core::Result<PDOPSTATUS> {
            if self.cancelled() {
                return Ok(PDOPS_CANCELLED);
            }
            let paused = self.state.lock().map(|state| state.paused).unwrap_or(false);
            Ok(if paused { PDOPS_PAUSED } else { PDOPS_RUNNING })
        }
    }

    struct OleApartment;

    struct ClipboardGuard;

    impl OleApartment {
        fn initialize() -> Result<Self, String> {
            unsafe { OleInitialize(None) }
                .map(|_| Self)
                .map_err(|error| format!("Unable to initialize Windows OLE: {error}"))
        }
    }

    impl Drop for OleApartment {
        fn drop(&mut self) {
            unsafe { OleUninitialize() };
        }
    }

    impl ClipboardGuard {
        fn open() -> Result<Self, String> {
            let mut last_error = None;
            for _ in 0..20 {
                match unsafe { OpenClipboard(None) } {
                    Ok(()) => return Ok(Self),
                    Err(error) => last_error = Some(error),
                }
                thread::sleep(Duration::from_millis(2));
            }
            Err(format!(
                "Unable to open the Windows clipboard: {}",
                last_error
                    .map(|error| error.to_string())
                    .unwrap_or_else(|| "unknown error".to_string())
            ))
        }
    }

    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            let _ = unsafe { CloseClipboard() };
        }
    }

    fn register_format(name: &str) -> u32 {
        unsafe { RegisterClipboardFormatW(&HSTRING::from(name)) }
    }

    fn registered_format_available(name: &str) -> bool {
        let format = register_format(name);
        format != 0 && unsafe { IsClipboardFormatAvailable(format) }.is_ok()
    }

    pub fn clipboard_info() -> WindowsFileClipboardInfo {
        let has_files = unsafe { IsClipboardFormatAvailable(CF_HDROP.0 as u32) }.is_ok()
            || registered_format_available(FILE_DESCRIPTOR_W)
            || registered_format_available(FILE_DESCRIPTOR_A)
            || registered_format_available(SHELL_ID_LIST);
        WindowsFileClipboardInfo {
            sequence: unsafe { GetClipboardSequenceNumber() },
            has_files,
        }
    }

    fn preferred_drop_effect() -> u32 {
        let format = register_format(PREFERRED_DROP_EFFECT);
        if format == 0 {
            return 0;
        }
        let Ok(_clipboard) = ClipboardGuard::open() else {
            return 0;
        };
        let Ok(handle) = (unsafe { GetClipboardData(format) }) else {
            return 0;
        };
        let memory = HGLOBAL(handle.0);
        if unsafe { GlobalSize(memory) } < 4 {
            return 0;
        }
        let pointer = unsafe { GlobalLock(memory) };
        if pointer.is_null() {
            return 0;
        }
        let mut bytes = [0u8; 4];
        unsafe {
            ptr::copy_nonoverlapping(pointer.cast::<u8>(), bytes.as_mut_ptr(), bytes.len());
            let _ = GlobalUnlock(memory);
        }
        u32::from_le_bytes(bytes)
    }

    unsafe fn set_global_clipboard_data(format: u32, bytes: &[u8]) -> Result<(), String> {
        let memory = unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes.len()) }
            .map_err(|error| format!("Unable to allocate clipboard memory: {error}"))?;
        let pointer = unsafe { GlobalLock(memory) };
        if pointer.is_null() {
            let _ = unsafe { GlobalFree(Some(memory)) };
            return Err("Unable to lock clipboard memory".to_string());
        }
        unsafe {
            ptr::copy_nonoverlapping(bytes.as_ptr(), pointer.cast::<u8>(), bytes.len());
            let _ = GlobalUnlock(memory);
        }
        match unsafe { SetClipboardData(format, Some(HANDLE(memory.0))) } {
            Ok(_) => Ok(()),
            Err(error) => {
                let _ = unsafe { GlobalFree(Some(memory)) };
                Err(format!("Unable to publish clipboard data: {error}"))
            }
        }
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct DropFiles {
        p_files: u32,
        point: POINT,
        non_client: i32,
        wide: i32,
    }

    fn file_drop_bytes(paths: &[String]) -> Vec<u8> {
        let mut names = Vec::<u16>::new();
        for path in paths {
            names.extend(Path::new(path).as_os_str().encode_wide());
            names.push(0);
        }
        names.push(0);

        let header = DropFiles {
            p_files: std::mem::size_of::<DropFiles>() as u32,
            point: POINT { x: 0, y: 0 },
            non_client: 0,
            wide: 1,
        };
        let header_size = std::mem::size_of::<DropFiles>();
        let mut bytes = vec![0u8; header_size + names.len() * std::mem::size_of::<u16>()];
        unsafe {
            ptr::write_unaligned(bytes.as_mut_ptr().cast::<DropFiles>(), header);
            ptr::copy_nonoverlapping(
                names.as_ptr().cast::<u8>(),
                bytes.as_mut_ptr().add(header_size),
                names.len() * std::mem::size_of::<u16>(),
            );
        }
        bytes
    }

    pub fn set_file_clipboard(paths: Vec<String>, cut: bool) -> Result<u32, String> {
        if paths.is_empty() {
            return Err("No files were selected".to_string());
        }
        if paths
            .iter()
            .any(|path| path.is_empty() || path.contains('\0'))
        {
            return Err("The file selection contains an invalid path".to_string());
        }

        let _clipboard = ClipboardGuard::open()?;
        unsafe { EmptyClipboard() }
            .map_err(|error| format!("Unable to clear the Windows clipboard: {error}"))?;
        unsafe { set_global_clipboard_data(CF_HDROP.0 as u32, &file_drop_bytes(&paths)) }?;

        // Only file formats are published. Adding CF_UNICODETEXT here made
        // chat apps (WeChat, QQ) and similar targets paste a path string
        // instead of the files themselves; copying a path is a separate
        // command that writes the text clipboard explicitly.
        let format = register_format(PREFERRED_DROP_EFFECT);
        if format != 0 {
            let effect = if cut { DROPEFFECT_MOVE.0 } else { 1 };
            let _ = unsafe { set_global_clipboard_data(format, &effect.to_le_bytes()) };
        }

        Ok(unsafe { GetClipboardSequenceNumber() })
    }

    pub fn clear_file_clipboard(expected_sequence: u32) -> Result<bool, String> {
        if expected_sequence == 0 || clipboard_info().sequence != expected_sequence {
            return Ok(false);
        }
        let _clipboard = ClipboardGuard::open()?;
        if unsafe { GetClipboardSequenceNumber() } != expected_sequence {
            return Ok(false);
        }
        unsafe { EmptyClipboard() }
            .map_err(|error| format!("Unable to clear the Windows clipboard: {error}"))?;
        Ok(true)
    }

    fn paste_failure_message(error: &windows::core::Error) -> String {
        error.message().to_ascii_lowercase()
    }

    fn is_same_path_paste_failure(error: &windows::core::Error) -> bool {
        matches!(error.code().0 as u32, 0x8027_000C | 0x8027_000D)
            || {
                let lower = paste_failure_message(error);
                lower.contains("same as the source")
                    || lower.contains("same file")
                    || lower.contains("destination are the same")
            }
    }

    fn is_benign_paste_failure(error: &windows::core::Error) -> bool {
        let code = error.code().0 as u32;
        is_same_path_paste_failure(error)
            || matches!(
                code,
                0x8000_4004 | // E_ABORT
                0x8007_04C7 | // ERROR_CANCELLED
                0x8027_0000 | // COPYENGINE_E_USER_CANCELLED
                0x8027_0001
            )
            || {
                let lower = paste_failure_message(error);
                lower.contains("cancel") || lower.contains("abort")
            }
    }

    pub fn paste_file_clipboard(
        destination: String,
        operation_id: String,
        app: tauri::AppHandle,
    ) -> Result<WindowsFilePasteResult, String> {
        if destination.is_empty() || destination == "home://" || destination.contains('\0') {
            return Err("Choose a filesystem folder before pasting".to_string());
        }
        if !clipboard_info().has_files {
            return Err("The Windows clipboard does not contain files".to_string());
        }

        let moved = preferred_drop_effect() & DROPEFFECT_MOVE.0 != 0;
        let _apartment = OleApartment::initialize()?;
        let data_object = unsafe { OleGetClipboard() }
            .map_err(|error| format!("Unable to read files from the Windows clipboard: {error}"))?;

        // Remote Desktop and other virtualized clipboards transfer files as
        // FileGroupDescriptorW + FileContents streams instead of CF_HDROP.
        // IFileOperation cannot consume them, so stream them manually.
        let hdrop_probe = FORMATETC {
            cfFormat: CF_HDROP.0 as u16,
            ptd: ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0 as u32,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let has_hdrop = unsafe { data_object.QueryGetData(&hdrop_probe) }.is_ok();
        if !has_hdrop && registered_format_available(FILE_DESCRIPTOR_W) {
            paste_file_group_descriptors(&data_object, &destination)?;
            return Ok(WindowsFilePasteResult {
                aborted: false,
                moved: false,
            });
        }

        let source: IUnknown = data_object
            .cast()
            .map_err(|error| format!("Invalid Windows clipboard file object: {error}"))?;
        let destination_path = HSTRING::from(destination.as_str());
        let destination_item: IShellItem =
            unsafe { SHCreateItemFromParsingName(&destination_path, None) }
                .map_err(|error| format!("Unable to open the paste destination: {error}"))?;
        let operation: IFileOperation =
            unsafe { CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER) }
                .map_err(|error| format!("Unable to create the Windows file operation: {error}"))?;
        let flags = FILEOPERATION_FLAGS(
            FOF_ALLOWUNDO.0
                | FOF_NOCONFIRMMKDIR.0
                | FOF_RENAMEONCOLLISION.0
                | FOFX_ADDUNDORECORD.0
                | FOFX_SHOWELEVATIONPROMPT.0,
        );
        let progress_dialog: IOperationsProgressDialog = ClipboardProgressDialog::new(
            app.clone(),
            operation_id.clone(),
            if moved { "move" } else { "copy" },
            destination.clone(),
        )
        .into();
        unsafe {
            operation.SetOperationFlags(flags).map_err(|error| {
                format!("Unable to configure the Windows paste operation: {error}")
            })?;
            operation
                .SetProgressDialog(&progress_dialog)
                .map_err(|error| format!("Unable to monitor Windows paste progress: {error}"))?;
            if moved {
                operation
                    .MoveItems(&source, &destination_item)
                    .map_err(|error| {
                        format!("Unable to queue files from the Windows clipboard: {error}")
                    })?;
            } else {
                operation
                    .CopyItems(&source, &destination_item)
                    .map_err(|error| {
                        format!("Unable to queue files from the Windows clipboard: {error}")
                    })?;
            }
            let perform_result = operation.PerformOperations();
            let cancelled = app
                .try_state::<CancelFlag>()
                .and_then(|cancel| cancel.is_cancelled(Some(&operation_id)).ok())
                .unwrap_or(false);
            if cancelled {
                return Ok(WindowsFilePasteResult {
                    aborted: true,
                    moved,
                });
            }
            if let Err(error) = perform_result {
                if is_benign_paste_failure(&error) {
                    return Ok(WindowsFilePasteResult {
                        aborted: !is_same_path_paste_failure(&error),
                        moved,
                    });
                }
                return Err(format!(
                    "Windows could not paste the clipboard files: {error}"
                ));
            }
        }
        let aborted = unsafe { operation.GetAnyOperationsAborted() }
            .map_err(|error| format!("Unable to read the Windows paste result: {error}"))?
            .as_bool();
        Ok(WindowsFilePasteResult { aborted, moved })
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn preferred_drop_effect_parser_requires_four_bytes() {
            fn parse(bytes: &[u8]) -> u32 {
                bytes
                    .get(..4)
                    .and_then(|slice| slice.try_into().ok())
                    .map(u32::from_le_bytes)
                    .unwrap_or(0)
            }

            assert_eq!(parse(&[2, 0, 0, 0]), DROPEFFECT_MOVE.0);
            assert_eq!(parse(&[2, 0, 0]), 0);
        }

        #[test]
        fn file_drop_payload_is_wide_and_double_null_terminated() {
            let bytes = file_drop_bytes(&["C:\\alpha.txt".to_string(), "D:\\中文.txt".to_string()]);
            let offset = u32::from_le_bytes(bytes[0..4].try_into().unwrap()) as usize;
            assert_eq!(offset, std::mem::size_of::<DropFiles>());
            let names: Vec<u16> = bytes[offset..]
                .chunks_exact(2)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                .collect();
            assert!(names.ends_with(&[0, 0]));
            let decoded: Vec<String> = names[..names.len() - 1]
                .split(|unit| *unit == 0)
                .filter(|name| !name.is_empty())
                .map(String::from_utf16_lossy)
                .collect();
            assert_eq!(decoded, ["C:\\alpha.txt", "D:\\中文.txt"]);
        }

        #[test]
        fn progress_prefers_bytes_then_work_points_then_items() {
            assert_eq!(progress_percentage(1, 4, 50, 100, 1, 8), 50);
            assert_eq!(progress_percentage(1, 4, 0, 0, 1, 8), 25);
            assert_eq!(progress_percentage(0, 0, 0, 0, 1, 8), 13);
            assert_eq!(progress_percentage(0, 0, 150, 100, 0, 0), 100);
        }

        #[test]
        fn same_path_and_cancel_paste_errors_are_benign() {
            let cancel = windows::core::Error::from(E_ABORT);
            assert!(is_benign_paste_failure(&cancel));
        }

        #[test]
        fn copying_files_publishes_only_file_formats() {
            use windows::Win32::System::DataExchange::IsClipboardFormatAvailable;
            use windows::Win32::System::Ole::CF_UNICODETEXT;

            let paths = vec![r"C:\Windows\notepad.exe".to_string()];
            set_file_clipboard(paths, false).expect("copy files to the clipboard");

            let has_files = unsafe { IsClipboardFormatAvailable(CF_HDROP.0 as u32) }.is_ok();
            let has_text = unsafe { IsClipboardFormatAvailable(CF_UNICODETEXT.0 as u32) }.is_ok();
            assert!(has_files, "copying files must publish CF_HDROP");
            assert!(
                !has_text,
                "copying files must not publish a text format: chat apps then paste a path string instead of the files",
            );
        }

        #[test]
        fn descriptor_names_decode_and_targets_avoid_collisions() {
            use windows::Win32::UI::Shell::FILEDESCRIPTORW;
            let mut descriptor = FILEDESCRIPTORW::default();
            let name_units: [u16; 5] = [b'r' as u16, b'e' as u16, b'm' as u16, b'o' as u16, b't' as u16];
            let name_slot = unsafe { ptr::addr_of_mut!(descriptor.cFileName) };
            unsafe {
                for (index, unit) in name_units.iter().enumerate() {
                    name_slot.cast::<u16>().add(index).write_unaligned(*unit);
                }
                name_slot.cast::<u16>().add(name_units.len()).write_unaligned(0);
            }
            assert_eq!(descriptor_file_name(&descriptor), "remot");

            let root = std::env::temp_dir().join(format!(
                "rhfiles-descriptor-targets-{}",
                std::process::id()
            ));
            std::fs::create_dir_all(&root).expect("create descriptor test root");
            let existing = root.join("file.txt");
            std::fs::write(&existing, b"x").expect("seed collision");
            let unique = unique_destination_path(&root, "file.txt");
            assert_ne!(unique, existing, "unique target collided with an existing file");
            assert!(unique.to_string_lossy().contains("file (1).txt"));
            let _ = std::fs::remove_dir_all(root);
        }
    }
}

#[tauri::command]
pub fn get_windows_file_clipboard_info() -> WindowsFileClipboardInfo {
    #[cfg(target_os = "windows")]
    {
        native::clipboard_info()
    }
    #[cfg(not(target_os = "windows"))]
    {
        WindowsFileClipboardInfo {
            sequence: 0,
            has_files: false,
        }
    }
}

#[tauri::command]
pub fn set_windows_file_clipboard(paths: Vec<String>, cut: bool) -> Result<u32, String> {
    #[cfg(target_os = "windows")]
    {
        native::set_file_clipboard(paths, cut)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (paths, cut);
        Err("The native file clipboard is only available on Windows".to_string())
    }
}

#[tauri::command]
pub fn clear_windows_file_clipboard(expected_sequence: u32) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        native::clear_file_clipboard(expected_sequence)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = expected_sequence;
        Ok(false)
    }
}

#[tauri::command]
pub async fn paste_windows_file_clipboard(
    destination: String,
    operation_id: Option<String>,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, crate::types::CancelFlag>,
) -> Result<WindowsFilePasteResult, String> {
    #[cfg(target_os = "windows")]
    {
        let operation_id = operation_id
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "windows-clipboard".to_string());
        cancel.reset(Some(&operation_id))?;
        let worker_id = operation_id.clone();
        let worker_app = app.clone();
        let result = match tauri::async_runtime::spawn_blocking(move || {
            let worker = std::thread::Builder::new()
                .name("rhfiles-ole-clipboard".to_string())
                .spawn(move || native::paste_file_clipboard(destination, worker_id, worker_app))
                .map_err(|error| {
                    format!("Unable to start the Windows clipboard worker: {error}")
                })?;
            worker
                .join()
                .map_err(|_| "The Windows clipboard worker stopped unexpectedly".to_string())?
        })
        .await
        {
            Ok(result) => result,
            Err(error) => Err(format!("The Windows clipboard task failed: {error}")),
        };
        cancel.clear(Some(&operation_id));
        result
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (destination, operation_id, app, cancel);
        Err("The native file clipboard is only available on Windows".to_string())
    }
}
