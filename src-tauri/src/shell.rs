


unsafe extern "system" {
    fn SetErrorMode(uMode: u32) -> u32;
}
const SEM_FAILCRITICALERRORS: u32 = 0x0001;
const SEM_NOGPFAULTERRORBOX: u32 = 0x0002;
const SEM_NOOPENFILEERRORBOX: u32 = 0x8000;

/// Resolve MUI indirect strings like `@shell32.dll,-5376` to human-readable text.
/// Falls back to raw string if resolution fails.
fn resolve_mui_string(raw: &str) -> String {
    if !raw.starts_with('@') {
        return raw.to_string();
    }
    // Format: @path,-resourceId or @path,resourceId
    let inner = &raw[1..];
    let comma_pos = inner.rfind(',').unwrap_or(inner.len());
    let dll_path = &inner[..comma_pos];

    // Expand %SystemRoot% etc.
    let expanded_path = if dll_path.to_lowercase().starts_with("%systemroot%") {
        if let Ok(windir) = std::env::var("SystemRoot") {
            windir + &dll_path[12..]
        } else {
            dll_path.to_string()
        }
    } else {
        dll_path.to_string()
    };

    let wide_path: Vec<u16> = expanded_path.encode_utf16().chain(std::iter::once(0)).collect();
    let mut buf = vec![0u16; 512];
    let hr_result = unsafe {
        windows::Win32::UI::Shell::SHLoadIndirectString(
            windows::core::PCWSTR(wide_path.as_ptr()),
            buf.as_mut_slice(),
            None,
        )
    };
    if hr_result.is_ok() {
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let resolved = String::from_utf16_lossy(&buf[..end]);
        // SHLoadIndirectString may include tab-separated fallback values; take the first
        let resolved = resolved.split('\t').next().unwrap_or(&resolved).to_string();
        if !resolved.is_empty() && !resolved.starts_with('@') {
            return resolved;
        }
    }
    raw.to_string()
}

/// Check whether a label looks like a raw file path, DLL/EXE name, or other garbage
/// that shouldn't appear in a user-facing context menu.
fn is_garbage_label(label: &str) -> bool {
    if label.is_empty() {
        return true;
    }
    let lower = label.to_lowercase();
    // File paths with drive letter or UNC
    if lower.contains(":\\") || lower.starts_with("\\\\") {
        return true;
    }
    // Known system file extensions used as verb labels (not user-facing)
    let system_exts = [".dll", ".exe", ".cpl", ".ocx", ".ax", ".sys", ".drv", ".scr", ".mui"];
    for ext in &system_exts {
        if lower.ends_with(ext) {
            if !label.contains(' ') {
                return true;
            }
        }
    }
    // Raw verb names that leak as standalone menu items (should have proper display labels)
    let raw_verbs = ["open", "explore", "find", "print", "edit", "openas", "runas", "properties"];
    for verb in &raw_verbs {
        if lower == *verb {
            return true;
        }
    }
    // Labels that are purely GUIDs
    if lower.starts_with('{') && lower.ends_with('}') && lower.len() > 30 {
        return true;
    }
    false
}

/// Check whether a shell verb should be shown in the regular context menu.
/// Filters out: Extended (Shift-only), HideBasedOnVelocityId, ProgrammaticAccessOnly.
fn should_include_verb(verb_key: &winreg::RegKey) -> bool {
    use winreg::enums::*;
    // Extended verbs: only shown on Shift+right-click in Explorer — skip
    if verb_key.open_subkey_with_flags("Extended", KEY_READ).is_ok() {
        return false;
    }
    // HideBasedOnVelocityId: Microsoft's feature rollout gating — skip
    if verb_key.open_subkey_with_flags("HideBasedOnVelocityId", KEY_READ).is_ok() {
        return false;
    }
    // Check the "ProgrammaticAccessOnly" value
    let prog: String = verb_key.get_value("ProgrammaticAccessOnly").unwrap_or_default();
    if !prog.is_empty() {
        return false;
    }
    // Check the "NeverDefault" value
    let never: String = verb_key.get_value("NeverDefault").unwrap_or_default();
    if !never.is_empty() {
        return false;
    }
    true
}

/// Try to open a registry key from HKCR or HKLM\SOFTWARE\Classes (fallback).
fn open_class_key(hkcr: &winreg::RegKey, class: &str) -> Option<winreg::RegKey> {
    use winreg::enums::*;
    use winreg::RegKey;
    // Try HKCR first
    if let Ok(k) = hkcr.open_subkey_with_flags(class, KEY_READ) {
        return Some(k);
    }
    // Fallback to HKLM\SOFTWARE\Classes (machine-wide)
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(k) = hklm.open_subkey_with_flags(&format!("SOFTWARE\\Classes\\{}", class), KEY_READ) {
        return Some(k);
    }
    None
}

/// Recursively collect shell verbs from a parent verb key.
/// Returns a flat list of nested JSON items (separators, parents with children, leaf verbs).
/// `parent_verb` is the full verb name for invocation (e.g. "WinRAR").
fn collect_verb_item(
    verb_key: &winreg::RegKey,
    verb_name: &str,
    parent_verb: &str,
    seen: &mut std::collections::HashSet<String>,
) -> Option<serde_json::Value> {
    use winreg::enums::*;

    // Check for command subkey (leaf verb) or nested shell submenu
    let has_command = verb_key.open_subkey_with_flags("command", KEY_READ).is_ok();
    let has_submenu = match verb_key.open_subkey_with_flags("shell", KEY_READ) {
        Ok(sub_shell) => sub_shell.enum_keys().filter_map(|v| v.ok()).any(|sv| {
            sub_shell.open_subkey_with_flags(&format!("{}\\command", sv), KEY_READ).is_ok()
        }),
        Err(_) => false,
    };

    if !has_command && !has_submenu {
        return None;
    }

    if !should_include_verb(verb_key) {
        return None;
    }

    let raw_label: String = verb_key.get_value("").unwrap_or_else(|_| verb_name.to_string());
    let mui_label: String = verb_key.get_value("MUIVerb").unwrap_or_default();
    let candidate = if !mui_label.is_empty() { &mui_label } else { &raw_label };
    let label = resolve_mui_string(candidate);

    // Filter out garbage labels: raw file paths, DLL/EXE filenames, internal identifiers
    if is_garbage_label(&label) {
        return None;
    }

    seen.insert(verb_name.to_string());

    if has_submenu {
        // Sub-menu: recurse into children
        let mut children = Vec::new();
        if let Ok(sub_shell) = verb_key.open_subkey_with_flags("shell", KEY_READ) {
            for child_name in sub_shell.enum_keys().filter_map(|v| v.ok()) {
                if let Ok(child_key) = sub_shell.open_subkey_with_flags(&child_name, KEY_READ) {
                    let child_parent = if parent_verb.is_empty() { verb_name.to_string() } else { format!("{}.{}", parent_verb, verb_name) };
                    if let Some(child_item) = collect_verb_item(&child_key, &child_name, &child_parent, seen) {
                        children.push(child_item);
                    }
                }
            }
        }
        if children.is_empty() {
            return None;
        }
        Some(serde_json::json!({
            "verb": verb_name,
            "label": label,
            "children": children,
        }))
    } else {
        // Leaf verb (has command)
        let verb = if parent_verb.is_empty() { verb_name.to_string() } else { format!("{}.{}", parent_verb, verb_name) };
        Some(serde_json::json!({
            "verb": verb,
            "label": label,
        }))
    }
}

/// Enumerate shell verbs from a single class registry key.
fn collect_verbs_from_class(
    hkcr: &winreg::RegKey,
    class: &str,
    seen: &mut std::collections::HashSet<String>,
    verbs: &mut Vec<serde_json::Value>,
) {
    use winreg::enums::*;
    let shell_key = match open_class_key(hkcr, &format!("{}\\shell", class)) {
        Some(k) => k,
        None => return,
    };

    for verb_name in shell_key.enum_keys().filter_map(|v| v.ok()) {
        if seen.contains(&verb_name) { continue; }
        let verb_key = match shell_key.open_subkey_with_flags(&verb_name, KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };
        if let Some(item) = collect_verb_item(&verb_key, &verb_name, "", seen) {
            verbs.push(item);
        }
    }
}

fn get_shell_verbs_registry(path: &str) -> Vec<serde_json::Value> {
    use winreg::enums::*;
    use winreg::RegKey;
    let is_dir = std::path::Path::new(path).is_dir();
    let ext = std::path::Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mut verbs = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);

    // Build class key list in Windows Explorer priority order
    let mut class_keys: Vec<String> = Vec::new();

    if is_dir {
        class_keys.push("Directory".into());
        class_keys.push("Folder".into());
    } else if ext.is_empty() {
        class_keys.push("*".into());
    } else {
        let ext_dot = if ext.starts_with('.') { ext.clone() } else { format!(".{}", ext) };
        // 1. ProgID from extension
        if let Ok(ext_key) = hkcr.open_subkey_with_flags(&ext_dot, KEY_READ) {
            let prog_id: String = ext_key.get_value("").unwrap_or_default();
            if !prog_id.is_empty() {
                class_keys.push(prog_id);
            }
        }
        // 2. SystemFileAssociations (perceived type)
        class_keys.push(format!("SystemFileAssociations\\{}", ext_dot));
        // 3. * wildcard (all files)
        class_keys.push("*".into());
    }

    // Also add AllFilesystemObjects (global system verbs) — applies to both files and dirs
    class_keys.push("AllFilesystemObjects".into());

    for class in &class_keys {
        collect_verbs_from_class(&hkcr, class, &mut seen, &mut verbs);
    }

    verbs
}

#[tauri::command]
pub fn get_shell_verbs(path: String) -> Result<Vec<serde_json::Value>, String> {
    Ok(get_shell_verbs_registry(&path))
}

#[tauri::command]
pub fn invoke_shell_verb(path: String, verb: String) -> Result<(), String> {
    let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let wide_verb: Vec<u16> = verb.encode_utf16().chain(std::iter::once(0)).collect();
    let result = unsafe {
        ShellExecuteW(
            None,
            windows::core::PCWSTR(wide_verb.as_ptr()),
            windows::core::PCWSTR(wide_path.as_ptr()),
            None, None,
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    let inst = result.0 as isize;
    if inst > 32 {
        return Ok(());
    }

    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;
    use windows::Win32::UI::Shell::Common::*;
    use windows::Win32::UI::WindowsAndMessaging::*;

    unsafe { SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX); }
    let init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };

    if init.is_ok() {
        let result = unsafe {
            let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
            if SHParseDisplayName(&windows::core::HSTRING::from(&path), None, &mut pidl, 0, None).is_err() { None }
            else {
                let mut pidl_last: *mut ITEMIDLIST = std::ptr::null_mut();
                match SHBindToParent::<IShellFolder>(pidl, Some(&mut pidl_last)) {
                    Ok(parent) => match parent.GetUIObjectOf::<IContextMenu>(windows::Win32::Foundation::HWND::default(), &[pidl_last], None) {
                        Ok(pcm) => {
                            let verb_cstr = format!("{}\0", verb);
                            let mut cmd = CMINVOKECOMMANDINFO::default();
                            cmd.cbSize = std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32;
                            cmd.fMask = SEE_MASK_UNICODE;
                            cmd.lpVerb = windows::core::PCSTR::from_raw(verb_cstr.as_ptr());
                            cmd.nShow = SW_SHOWNORMAL.0 as i32;
                            let _ = pcm.InvokeCommand(&raw const cmd);
                            CoTaskMemFree(Some(pidl as *const _));
                            Some(())
                        },
                        Err(_) => { CoTaskMemFree(Some(pidl as *const _)); None }
                    },
                    Err(_) => { CoTaskMemFree(Some(pidl as *const _)); None }
                }
            }
        };
        unsafe { CoUninitialize(); }
        if result.is_some() { return Ok(()); }
    }

    Err(format!("Could not invoke verb '{}' on '{}'", verb, path))
}

/// Query the COM IContextMenu for a file/directory and return all menu items.
/// Runs on a dedicated STA thread with a Windows message pump (required by COM).
/// Uses a 5-second timeout to prevent hangs from slow shell extensions.
/// Returns a hierarchical structure: [{id, label, separator, children: [...]}, ...]
#[tauri::command]
pub fn query_context_menu(path: String) -> Result<Vec<serde_json::Value>, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::Builder::new()
        .name("com-sta-thread".into())
        .spawn(move || {
            unsafe { windows::Win32::System::Com::CoInitializeEx(None::<*const core::ffi::c_void>, windows::Win32::System::Com::COINIT_APARTMENTTHREADED | windows::Win32::System::Com::COINIT_DISABLE_OLE1DDE).ok(); }
            unsafe { let _ = SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX); }

            // Do COM work, send result back
            let result = query_context_menu_com(&path);
            let _ = tx.send(result);

            // Drain remaining messages before cleanup
            let mut msg = unsafe { std::mem::zeroed::<windows::Win32::UI::WindowsAndMessaging::MSG>() };
            while unsafe { windows::Win32::UI::WindowsAndMessaging::PeekMessageW(&mut msg, None, 0, 0, windows::Win32::UI::WindowsAndMessaging::PM_REMOVE) }.as_bool() {
                unsafe {
                    windows::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
                    windows::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
                }
            }
            unsafe { windows::Win32::System::Com::CoUninitialize(); }
        })
        .map_err(|e| format!("Failed to spawn COM thread: {}", e))?;

    match rx.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(result) => result,
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            Err("COM context menu timed out (5s)".into())
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            Err("COM context menu thread crashed".into())
        }
    }
}

fn query_context_menu_com(path: &str) -> Result<Vec<serde_json::Value>, String> {
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;
    use windows::Win32::UI::Shell::Common::*;
    use windows::Win32::UI::WindowsAndMessaging::*;

    /// Walk an HMENU recursively, returning structured items.
    unsafe fn walk_menu(hmenu: HMENU, id_offset: u32) -> Vec<serde_json::Value> {
        let count = unsafe { GetMenuItemCount(Some(hmenu)) } as u32;
        let mut items = Vec::with_capacity(count as usize);

        for pos in 0..count {
            let mut info = MENUITEMINFOW::default();
            info.cbSize = std::mem::size_of::<MENUITEMINFOW>() as u32;
            info.fMask = MIIM_FTYPE | MIIM_ID | MIIM_STRING | MIIM_SUBMENU;

            if unsafe { GetMenuItemInfoW(hmenu, pos, true, &mut info) }.is_err() {
                continue;
            }

            if info.fType.0 & MFT_SEPARATOR.0 != 0 {
                items.push(serde_json::json!({"separator": true}));
                continue;
            }

            let mut buf = vec![0u16; (info.cch + 1) as usize];
            info.dwTypeData = windows::core::PWSTR(buf.as_mut_ptr());
            info.cch += 1;

            if unsafe { GetMenuItemInfoW(hmenu, pos, true, &mut info) }.is_err() {
                continue;
            }

            let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            let label = String::from_utf16_lossy(&buf[..end]);

            let has_submenu = !info.hSubMenu.is_invalid();
            let raw_id = info.wID;

            let cmd_id = if raw_id >= id_offset && raw_id <= id_offset + 0x7FFE {
                (raw_id - id_offset) as u32
            } else {
                raw_id
            };

            let mut item = serde_json::json!({
                "id": cmd_id,
                "label": label,
            });

            if has_submenu {
                let children = unsafe { walk_menu(info.hSubMenu, id_offset) };
                item["children"] = serde_json::Value::Array(children);
            }

            items.push(item);
        }
        items
    }

    unsafe {
        let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
        if SHParseDisplayName(&windows::core::HSTRING::from(path), None, &mut pidl, 0, None).is_err() {
            return Err("SHParseDisplayName failed".into());
        }

        let mut pidl_last: *mut ITEMIDLIST = std::ptr::null_mut();
        let parent = match SHBindToParent::<IShellFolder>(pidl, Some(&mut pidl_last)) {
            Ok(p) => p,
            Err(_) => { CoTaskMemFree(Some(pidl as *const _)); return Err("SHBindToParent failed".into()); }
        };

        let pcm: IContextMenu = match parent.GetUIObjectOf::<IContextMenu>(
            windows::Win32::Foundation::HWND::default(), &[pidl_last], None)
        {
            Ok(p) => p,
            Err(_) => { CoTaskMemFree(Some(pidl as *const _)); return Err("GetUIObjectOf failed".into()); }
        };

        let hmenu = match CreatePopupMenu() {
            Ok(h) => h,
            Err(_) => { CoTaskMemFree(Some(pidl as *const _)); return Err("CreatePopupMenu failed".into()); }
        };

        const ID_CMD_FIRST: u32 = 1;
        const ID_CMD_LAST: u32 = 0x7FFF;
        let _ = pcm.QueryContextMenu(hmenu, 0, ID_CMD_FIRST, ID_CMD_LAST, 0u32);

        let result = walk_menu(hmenu, ID_CMD_FIRST);

        DestroyMenu(hmenu).ok();
        CoTaskMemFree(Some(pidl as *const _));
        Ok(result)
    }
}

/// Invoke a specific command from the IContextMenu for a file/directory.
/// `cmd_id` is the zero-based offset returned by query_context_menu.
/// Runs on a dedicated STA thread for COM safety.
#[tauri::command]
pub fn invoke_context_menu_command(path: String, cmd_id: u32) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::Builder::new()
        .name("com-sta-invoke".into())
        .spawn(move || {
            unsafe { windows::Win32::System::Com::CoInitializeEx(None::<*const core::ffi::c_void>, windows::Win32::System::Com::COINIT_APARTMENTTHREADED | windows::Win32::System::Com::COINIT_DISABLE_OLE1DDE).ok(); }
            unsafe { let _ = SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX); }

            let result = invoke_context_menu_com(&path, cmd_id);
            let _ = tx.send(result);

            let mut msg = unsafe { std::mem::zeroed::<windows::Win32::UI::WindowsAndMessaging::MSG>() };
            while unsafe { windows::Win32::UI::WindowsAndMessaging::PeekMessageW(&mut msg, None, 0, 0, windows::Win32::UI::WindowsAndMessaging::PM_REMOVE) }.as_bool() {
                unsafe {
                    windows::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
                    windows::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
                }
            }
            unsafe { windows::Win32::System::Com::CoUninitialize(); }
        })
        .map_err(|e| format!("Failed to spawn COM thread: {}", e))?;

    match rx.recv_timeout(std::time::Duration::from_secs(10)) {
        Ok(result) => result,
        Err(_) => Err("COM invoke timed out".into()),
    }
}

fn invoke_context_menu_com(path: &str, cmd_id: u32) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;
    use windows::Win32::UI::Shell::Common::*;
    use windows::Win32::UI::WindowsAndMessaging::*;

    unsafe fn int_resource(id: usize) -> *const u8 { id as *const u8 }

    unsafe {
        let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
        if SHParseDisplayName(&windows::core::HSTRING::from(path), None, &mut pidl, 0, None).is_err() {
            return Err("SHParseDisplayName failed".into());
        }

        let mut pidl_last: *mut ITEMIDLIST = std::ptr::null_mut();
        let parent = match SHBindToParent::<IShellFolder>(pidl, Some(&mut pidl_last)) {
            Ok(p) => p,
            Err(_) => { CoTaskMemFree(Some(pidl as *const _)); return Err("SHBindToParent failed".into()); }
        };

        let pcm: IContextMenu = match parent.GetUIObjectOf::<IContextMenu>(
            HWND::default(), &[pidl_last], None)
        {
            Ok(p) => p,
            Err(_) => { CoTaskMemFree(Some(pidl as *const _)); return Err("GetUIObjectOf failed".into()); }
        };

        let mut cmd_info = CMINVOKECOMMANDINFO::default();
        cmd_info.cbSize = std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32;
        cmd_info.lpVerb = windows::core::PCSTR::from_raw(int_resource(cmd_id as usize));
        cmd_info.nShow = SW_SHOWNORMAL.0 as i32;

        let ok = pcm.InvokeCommand(&cmd_info).is_ok();
        CoTaskMemFree(Some(pidl as *const _));
        if ok { Ok(()) } else { Err("InvokeCommand failed".into()) }
    }
}

#[tauri::command]
pub fn get_permissions(path: String) -> Result<Vec<serde_json::Value>, String> {
    let output = std::process::Command::new("icacls")
        .arg(&path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut perms = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.ends_with(':') {
            continue;
        }
        if line.contains(":(") {
            let parts: Vec<&str> = line.splitn(2, ":(").collect();
            if parts.len() == 2 {
                let account = parts[0].trim().to_string();
                let access = format!("({}", parts[1].trim_end_matches(','));
                let access_display = access.replace("(F)", " Full Control")
                    .replace("(M)", " Modify")
                    .replace("(RX)", " Read & Execute")
                    .replace("(R)", " Read")
                    .replace("(W)", " Write")
                    .replace("(X)", " Execute")
                    .replace("(OI)", " [Files]")
                    .replace("(CI)", " [Subfolders]")
                    .replace("(IO)", " [Inherit Only]")
                    .replace("(NP)", " [No Inherit]");

                perms.push(serde_json::json!({
                    "account": account,
                    "access": access,
                    "display": access_display
                }));
            }
        }
    }

    Ok(perms)
}

#[tauri::command]
pub fn set_permission(path: String, account: String, permission: String) -> Result<(), String> {
    let perm_arg = format!("{}:{}", account, permission);
    let output = std::process::Command::new("icacls")
        .args([&path, "/grant", &perm_arg])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn remove_permission(path: String, account: String) -> Result<(), String> {
    let output = std::process::Command::new("icacls")
        .args([&path, "/remove", &account])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn inherit_permissions(path: String, enable: bool) -> Result<(), String> {
    let arg = if enable { "/inheritance:e" } else { "/inheritance:d" };
    let output = std::process::Command::new("icacls")
        .args([&path, arg])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}
