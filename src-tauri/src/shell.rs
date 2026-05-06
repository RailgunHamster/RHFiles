


unsafe extern "system" {
    fn SetErrorMode(uMode: u32) -> u32;
}
const SEM_FAILCRITICALERRORS: u32 = 0x0001;
const SEM_NOGPFAULTERRORBOX: u32 = 0x0002;
const SEM_NOOPENFILEERRORBOX: u32 = 0x8000;

fn get_shell_verbs_registry(path: &str) -> Vec<serde_json::Value> {
    use winreg::enums::*;
    use winreg::RegKey;
    let is_dir = std::path::Path::new(path).is_dir();
    let ext = std::path::Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mut verbs = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);

    let class_keys: Vec<String> = if is_dir {
        vec!["Directory".into(), "Folder".into()]
    } else if ext.is_empty() {
        vec!["*".into()]
    } else {
        let ext_dot = if ext.starts_with('.') { ext.clone() } else { format!(".{}", ext) };
        match hkcr.open_subkey_with_flags(&ext_dot, KEY_READ) {
            Ok(ext_key) => {
                let prog_id: String = ext_key.get_value("").unwrap_or_default();
                if prog_id.is_empty() { vec![format!("SystemFileAssociations\\{}", ext_dot)] }
                else { vec![prog_id] }
            }
            Err(_) => vec![]
        }
    };

    for class in &class_keys {
        let shell_path = format!("{}\\shell", class);
        let shell_key = match hkcr.open_subkey_with_flags(&shell_path, KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };
        for verb_name in shell_key.enum_keys().filter_map(|v| v.ok()) {
            if seen.contains(&verb_name) { continue; }
            let verb_key = match shell_key.open_subkey_with_flags(&verb_name, KEY_READ) { Ok(k) => k, Err(_) => continue };
            if verb_key.open_subkey_with_flags("command", KEY_READ).is_err() { continue; }
            let label: String = verb_key.get_value("").unwrap_or_else(|_| verb_name.clone());
            seen.insert(verb_name.clone());
            verbs.push(serde_json::json!({"verb": verb_name, "label": label}));
        }
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
