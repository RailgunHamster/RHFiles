//! Shell file objects, not HTML path strings. Never honor an external MOVE effect:
//! RHFiles' own drop workflow is the only authority for moving a source.
use serde_json::{Value, json};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};
static DRAGGING: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
mod file_only {
    // The Shell also synthesizes text filenames. Filter those formats instead
    // of letting chat applications prefer a path string over the actual files.
    use windows::{
        Win32::{Foundation::*, System::Com::*},
        core::{BOOL, HRESULT, Ref, implement},
    };
    fn blocked(format: *const FORMATETC) -> bool {
        format.is_null() || matches!(unsafe { (*format).cfFormat }, 1 | 7 | 13)
    }
    #[implement(IDataObject)]
    pub struct Files(pub IDataObject);
    #[allow(non_snake_case)]
    impl IDataObject_Impl for Files_Impl {
        fn GetData(&self, f: *const FORMATETC) -> windows::core::Result<STGMEDIUM> {
            if blocked(f) {
                return Err(DV_E_FORMATETC.into());
            }
            unsafe { self.0.GetData(f) }
        }
        fn GetDataHere(&self, f: *const FORMATETC, m: *mut STGMEDIUM) -> windows::core::Result<()> {
            if blocked(f) {
                return Err(DV_E_FORMATETC.into());
            }
            unsafe { self.0.GetDataHere(f, m) }
        }
        fn QueryGetData(&self, f: *const FORMATETC) -> HRESULT {
            if blocked(f) {
                DV_E_FORMATETC
            } else {
                unsafe { self.0.QueryGetData(f) }
            }
        }
        fn GetCanonicalFormatEtc(&self, f: *const FORMATETC, out: *mut FORMATETC) -> HRESULT {
            if blocked(f) {
                DV_E_FORMATETC
            } else {
                unsafe { self.0.GetCanonicalFormatEtc(f, out) }
            }
        }
        fn SetData(
            &self,
            f: *const FORMATETC,
            m: *const STGMEDIUM,
            release: BOOL,
        ) -> windows::core::Result<()> {
            unsafe { self.0.SetData(f, m, release.as_bool()) }
        }
        fn EnumFormatEtc(&self, direction: u32) -> windows::core::Result<IEnumFORMATETC> {
            Ok(Formats(unsafe { self.0.EnumFormatEtc(direction) }?).into())
        }
        fn DAdvise(
            &self,
            f: *const FORMATETC,
            flags: u32,
            sink: Ref<IAdviseSink>,
        ) -> windows::core::Result<u32> {
            unsafe { self.0.DAdvise(f, flags, sink.ok()?) }
        }
        fn DUnadvise(&self, id: u32) -> windows::core::Result<()> {
            unsafe { self.0.DUnadvise(id) }
        }
        fn EnumDAdvise(&self) -> windows::core::Result<IEnumSTATDATA> {
            unsafe { self.0.EnumDAdvise() }
        }
    }
    #[implement(IEnumFORMATETC)]
    struct Formats(IEnumFORMATETC);
    #[allow(non_snake_case)]
    impl IEnumFORMATETC_Impl for Formats_Impl {
        fn Next(&self, count: u32, out: *mut FORMATETC, fetched: *mut u32) -> HRESULT {
            if out.is_null() || (count != 1 && fetched.is_null()) {
                return E_POINTER;
            }
            let mut copied = 0;
            while copied < count {
                let mut value = [FORMATETC::default()];
                let mut read = 0;
                let result = unsafe { self.0.Next(&mut value, Some(&mut read)) };
                if result.is_err() || read == 0 {
                    if !fetched.is_null() {
                        unsafe {
                            *fetched = copied;
                        }
                    }
                    return if result.is_err() { result } else { S_FALSE };
                }
                if blocked(&value[0]) {
                    if !value[0].ptd.is_null() {
                        unsafe {
                            CoTaskMemFree(Some(value[0].ptd.cast()));
                        }
                    }
                    continue;
                }
                unsafe {
                    out.add(copied as usize).write(value[0]);
                }
                copied += 1;
            }
            if !fetched.is_null() {
                unsafe {
                    *fetched = copied;
                }
            }
            S_OK
        }
        fn Skip(&self, count: u32) -> windows::core::Result<()> {
            for _ in 0..count {
                let mut value = FORMATETC::default();
                let mut read = 0;
                let result = self.Next(1, &mut value, &mut read);
                result.ok()?;
                if read == 0 {
                    break;
                }
                if !value.ptd.is_null() {
                    unsafe {
                        CoTaskMemFree(Some(value.ptd.cast()));
                    }
                }
            }
            Ok(())
        }
        fn Reset(&self) -> windows::core::Result<()> {
            unsafe { self.0.Reset() }
        }
        fn Clone(&self) -> windows::core::Result<IEnumFORMATETC> {
            Ok(Formats(unsafe { self.0.Clone() }?).into())
        }
    }
}

fn validate(paths: &[String]) -> Result<(), String> {
    if paths.is_empty()
        || paths.len() > 10000
        || paths.iter().any(|p| {
            p.contains('\0') || p.contains("://") || !std::path::Path::new(p).is_absolute()
        })
    {
        return Err("[invalid_path] Native dragging requires absolute local/UNC paths".into());
    }
    Ok(())
}

#[cfg(windows)]
unsafe fn shell_object(
    paths: &[String],
) -> Result<windows::Win32::System::Com::IDataObject, String> {
    use windows::{Win32::UI::Shell::*, core::HSTRING};
    struct Items(Vec<*mut Common::ITEMIDLIST>);
    impl Drop for Items {
        fn drop(&mut self) {
            for p in &self.0 {
                unsafe {
                    ILFree(Some(*p));
                }
            }
        }
    }
    let mut items = Items(Vec::new());
    for path in paths {
        let item = unsafe { ILCreateFromPathW(&HSTRING::from(path)) };
        if item.is_null() {
            return Err(format!("[not_found] Windows cannot prepare {path}"));
        }
        items.0.push(item);
    }
    let list: Vec<*const Common::ITEMIDLIST> = items.0.iter().map(|p| p.cast_const()).collect();
    let array = unsafe { SHCreateShellItemArrayFromIDLists(&list) }.map_err(|e| e.to_string())?;
    let original =
        unsafe { array.BindToHandler(None, &BHID_DataObject) }.map_err(|e| e.to_string())?;
    Ok(file_only::Files(original).into())
}
#[cfg(windows)]
unsafe fn shell_drag(
    paths: &[String],
    hwnd: windows::Win32::Foundation::HWND,
) -> Result<Value, String> {
    use windows::Win32::{
        System::Ole::{DROPEFFECT_COPY, IDropSource},
        UI::{Input::KeyboardAndMouse::*, Shell::*},
    };
    if unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } >= 0 {
        return Ok(json!({"status":"released","effect":"none"}));
    }
    let object = unsafe { shell_object(paths) }?;
    // No CF_UNICODETEXT: chat clients otherwise paste a path instead of files.
    // The Shell object supplies CF_HDROP, Shell ID lists and file descriptors.
    let effect =
        unsafe { SHDoDragDrop(Some(hwnd), &object, None::<&IDropSource>, DROPEFFECT_COPY) }
            .map_err(|e| format!("[drag_failed] {e}"))?;
    Ok(
        json!({"status":if effect.0==0{"cancelled"}else{"dropped"},"effect":if effect.0==0{"none"}else{"copy"}}),
    )
}

#[tauri::command]
pub async fn native_drag_start(
    window: tauri::WebviewWindow,
    paths: Vec<String>,
    payload: Value,
) -> Result<Value, String> {
    validate(&paths)?;
    if payload["kind"] != "rhfiles-file-drag"
        || payload["paths"].as_array().map(Vec::len) != Some(paths.len())
        || payload.to_string().len() > 2_000_000
    {
        return Err("[invalid_request] Invalid file drag session".into());
    }
    #[cfg(windows)]
    {
        if DRAGGING.swap(true, Ordering::AcqRel) {
            return Err("[busy] Another native drag is active".into());
        }
        let app = window.app_handle().clone();
        let hwnd = window
            .hwnd()
            .map_err(|e| {
                DRAGGING.store(false, Ordering::Release);
                e.to_string()
            })?
            .0 as usize;
        let (send, recv) = tokio::sync::oneshot::channel();
        window
            .run_on_main_thread(move || {
                struct Guard(tauri::AppHandle);
                impl Drop for Guard {
                    fn drop(&mut self) {
                        let _ = self.0.emit("native-file-drag", json!({"active":false}));
                        DRAGGING.store(false, Ordering::Release);
                    }
                }
                let _guard = Guard(app.clone());
                // This app-only event preserves internal spring-loaded tabs without
                // exposing private URLs as text to other programs.
                let _ = app.emit("native-file-drag", json!({"active":true,"payload":payload}));
                let result =
                    unsafe { shell_drag(&paths, windows::Win32::Foundation::HWND(hwnd as *mut _)) };
                let _ = send.send(result);
            })
            .map_err(|e| {
                DRAGGING.store(false, Ordering::Release);
                e.to_string()
            })?;
        recv.await
            .map_err(|_| "Native drag worker stopped".to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (window, payload);
        Err("Native Windows dragging is not available on this platform".into())
    }
}

#[tauri::command(async)]
pub fn native_drag_cache() -> Result<Value, String> {
    let root = crate::profile::data_dir()?.join("external-drag-copies");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let dir = tempfile::Builder::new()
        .prefix("export-")
        .tempdir_in(root)
        .map_err(|e| e.to_string())?
        .keep();
    // Retain until explicit cleanup, never on drag completion: recipients can
    // read CF_HDROP asynchronously, after the drop handler has returned.
    Ok(json!({"directory":dir,"retained":true}))
}
#[tauri::command(async)]
pub fn native_drag_cache_list() -> Result<Value, String> {
    let root = crate::profile::data_dir()?.join("external-drag-copies");
    let entries = match std::fs::read_dir(&root) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(json!({"directory":root,"items":[]}));
        }
        Err(e) => return Err(e.to_string()),
    };
    let mut items = Vec::new();
    for entry in entries.take(128) {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            items.push(json!({"path":entry.path(),"name":entry.file_name()}));
        }
    }
    Ok(json!({"directory":root,"items":items}))
}

#[cfg(all(windows, debug_assertions))]
pub mod qa {
    //! Owned acceptance fixture only. The target consumes exactly the same OLE
    //! CF_HDROP contract as an external native application. Never ships in release.
    use super::*;
    use std::sync::Mutex;
    use windows::{
        Win32::{
            Foundation::*,
            System::{Com::*, Ole::*, SystemServices::*},
            UI::{Shell::*, WindowsAndMessaging::*},
        },
        core::{Ref, implement, w},
    };
    static DROPS: Mutex<Vec<Value>> = Mutex::new(Vec::new());
    #[implement(IDropTarget)]
    struct Target;
    #[allow(non_snake_case)]
    impl IDropTarget_Impl for Target_Impl {
        fn DragEnter(
            &self,
            _: Ref<IDataObject>,
            _: MODIFIERKEYS_FLAGS,
            _: &POINTL,
            e: *mut DROPEFFECT,
        ) -> windows::core::Result<()> {
            unsafe {
                *e = DROPEFFECT_COPY;
            }
            Ok(())
        }
        fn DragOver(
            &self,
            _: MODIFIERKEYS_FLAGS,
            _: &POINTL,
            e: *mut DROPEFFECT,
        ) -> windows::core::Result<()> {
            unsafe {
                *e = DROPEFFECT_COPY;
            }
            Ok(())
        }
        fn DragLeave(&self) -> windows::core::Result<()> {
            Ok(())
        }
        fn Drop(
            &self,
            data: Ref<IDataObject>,
            _: MODIFIERKEYS_FLAGS,
            _: &POINTL,
            e: *mut DROPEFFECT,
        ) -> windows::core::Result<()> {
            let data = data.ok()?;
            let f = FORMATETC {
                cfFormat: CF_HDROP.0,
                dwAspect: DVASPECT_CONTENT.0,
                lindex: -1,
                tymed: TYMED_HGLOBAL.0 as u32,
                ..Default::default()
            };
            let mut medium = unsafe { data.GetData(&f) }?;
            let mut paths = Vec::new();
            unsafe {
                let drop = HDROP(medium.u.hGlobal.0);
                let count = DragQueryFileW(drop, u32::MAX, None);
                for index in 0..count {
                    let len = DragQueryFileW(drop, index, None);
                    let mut chars = vec![0; len as usize + 1];
                    DragQueryFileW(drop, index, Some(&mut chars));
                    paths.push(String::from_utf16_lossy(&chars[..len as usize]));
                }
                ReleaseStgMedium(&mut medium);
                *e = DROPEFFECT_COPY;
            }
            DROPS
                .lock()
                .unwrap()
                .push(json!({"paths":paths,"format":"CF_HDROP"}));
            Ok(())
        }
    }
    #[tauri::command]
    pub async fn native_drag_test_target(window: tauri::WebviewWindow) -> Result<Value, String> {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as usize;
        let (tx, rx) = tokio::sync::oneshot::channel();
        window
            .run_on_main_thread(move || {
                let result = (|| unsafe {
                    let child = CreateWindowExW(
                        WINDOW_EX_STYLE::default(),
                        w!("STATIC"),
                        w!("Native CF_HDROP acceptance target"),
                        WS_CHILD | WS_VISIBLE | WS_BORDER,
                        850,
                        180,
                        290,
                        210,
                        Some(HWND(hwnd as *mut _)),
                        None,
                        None,
                        None,
                    )
                    .map_err(|e| e.to_string())?;
                    let target: IDropTarget = Target.into();
                    RegisterDragDrop(child, &target).map_err(|e| e.to_string())?;
                    Ok(json!({"created":true}))
                })();
                let _ = tx.send(result);
            })
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub fn native_drag_test_drops() -> Value {
        json!(*DROPS.lock().unwrap())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_uris_empty_and_relative_selections() {
        assert!(validate(&[]).is_err());
        for path in [
            "rhfiles-device://a/b",
            "ftp://host/file",
            "relative",
            "C:\\a\0b",
        ] {
            assert!(validate(&[path.into()]).is_err());
        }
        #[cfg(windows)]
        assert!(validate(&[r"C:\测试 文件.txt".into(), r"\\host\share\folder".into()]).is_ok());
    }
    #[cfg(windows)]
    #[test]
    fn native_shell_object_exposes_all_unicode_files_and_folders_without_path_text() {
        use windows::Win32::{
            System::{Com::*, Ole::*},
            UI::Shell::*,
        };
        let temp = tempfile::tempdir().unwrap();
        let folder = temp.path().join("文件夹");
        let file = temp.path().join("外拖 a & b.txt");
        std::fs::create_dir(&folder).unwrap();
        std::fs::write(&file, b"owned-test").unwrap();
        let paths = vec![
            file.to_string_lossy().into_owned(),
            folder.to_string_lossy().into_owned(),
        ];
        unsafe {
            OleInitialize(None).unwrap();
            let object = shell_object(&paths).unwrap();
            let format = FORMATETC {
                cfFormat: CF_HDROP.0,
                dwAspect: DVASPECT_CONTENT.0,
                lindex: -1,
                tymed: TYMED_HGLOBAL.0 as u32,
                ..Default::default()
            };
            let mut medium = object.GetData(&format).unwrap();
            let hdrop = HDROP(medium.u.hGlobal.0);
            assert_eq!(DragQueryFileW(hdrop, u32::MAX, None), 2);
            for (index, path) in paths.iter().enumerate() {
                let len = DragQueryFileW(hdrop, index as u32, None);
                let mut chars = vec![0; len as usize + 1];
                DragQueryFileW(hdrop, index as u32, Some(&mut chars));
                let actual = String::from_utf16_lossy(&chars[..len as usize]);
                assert_eq!(
                    std::fs::canonicalize(actual).unwrap(),
                    std::fs::canonicalize(path).unwrap()
                );
            }
            ReleaseStgMedium(&mut medium);
            let text = FORMATETC {
                cfFormat: CF_UNICODETEXT.0,
                ..format
            };
            assert!(object.QueryGetData(&text).is_err());
            drop(object);
            OleUninitialize();
        }
        assert!(file.exists() && folder.exists());
    }
}
