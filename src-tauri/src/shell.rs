

#[tauri::command]
pub fn get_shell_verbs(path: String) -> Result<Vec<serde_json::Value>, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext.is_empty() {
        return Ok(Vec::new());
    }

    let ext_with_dot = if ext.starts_with('.') { ext.clone() } else { format!(".{}", ext) };

    let mut verbs = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let hives = [
        (HKEY_LOCAL_MACHINE, "HKLM"),
        (HKEY_CURRENT_USER, "HKCU"),
    ];

    for (hive, _hive_name) in &hives {
        let root = RegKey::predef(*hive);
        let ext_key = match root.open_subkey_with_flags(format!("Software\\Classes\\{}", ext_with_dot), KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };
        let prog_id: String = match ext_key.get_value("") {
            Ok(v) => v,
            Err(_) => continue,
        };
        if prog_id.is_empty() {
            continue;
        }
        let shell_key = match root.open_subkey_with_flags(format!("Software\\Classes\\{}\\shell", prog_id), KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };
        for subkey_result in shell_key.enum_keys() {
            let verb_name = match subkey_result {
                Ok(v) => v,
                Err(_) => continue,
            };
            if seen.contains(&verb_name) {
                continue;
            }
            let verb_key = match shell_key.open_subkey_with_flags(&verb_name, KEY_READ) {
                Ok(k) => k,
                Err(_) => continue,
            };
            let cmd_key = match verb_key.open_subkey_with_flags("command", KEY_READ) {
                Ok(k) => k,
                Err(_) => continue,
            };
            let _command: String = match cmd_key.get_value("") {
                Ok(v) => v,
                Err(_) => continue,
            };
            let label: String = verb_key.get_value("").unwrap_or_else(|_| verb_name.clone());
            seen.insert(verb_name.clone());
            verbs.push(serde_json::json!({
                "verb": verb_name,
                "label": label,
            }));
        }
    }

    Ok(verbs)
}

#[tauri::command]
pub fn invoke_shell_verb(path: String, verb: String) -> Result<(), String> {
    let ps = format!(
        r#"$shell = New-Object -ComObject Shell.Application;
        $folder = $shell.Namespace((Split-Path '{}'));
        $item = $folder.ParseName((Split-Path '{}' -Leaf));
        $item.InvokeVerb('{}')"#,
        path.replace("'", "''"), path.replace("'", "''"), verb
    );

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn show_native_context_menu(path: String, x: i32, y: i32) -> Result<(), String> {
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::*;
    use windows::Win32::UI::Shell::Common::*;
    use windows::Win32::UI::WindowsAndMessaging::*;
    use windows::Win32::Foundation::*;

    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)
            .ok().map_err(|e| e.to_string())?;

        let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
        SHParseDisplayName(
            &windows::core::HSTRING::from(&path),
            None,
            &mut pidl,
            0,
            None,
        ).map_err(|e| e.to_string())?;

        let mut pidl_last: *mut ITEMIDLIST = std::ptr::null_mut();
        let parent_folder: IShellFolder = SHBindToParent(
            pidl,
            Some(&mut pidl_last),
        ).map_err(|e| e.to_string())?;

        let pcm: IContextMenu = parent_folder.GetUIObjectOf(
            HWND::default(),
            &[pidl_last],
            None,
        ).map_err(|e| e.to_string())?;

        let hmenu = CreatePopupMenu().map_err(|e| e.to_string())?;

        let hr = pcm.QueryContextMenu(
            hmenu,
            0,
            1,
            0x7FFF,
            CMF_NORMAL | CMF_EXTENDEDVERBS,
        );
        if hr.is_err() {
            return Err(format!("QueryContextMenu failed: {:08x}", hr.0 as u32));
        }

        let result = TrackPopupMenu(
            hmenu,
            TPM_RETURNCMD | TPM_LEFTALIGN | TPM_TOPALIGN,
            x,
            y,
            None,
            HWND::default(),
            None,
        );

        if result.0 != 0 {
            let cmd_id = result.0 - 1;
            let cmd_str = format!("{}\0", cmd_id);
            let mut cmd = CMINVOKECOMMANDINFO::default();
            cmd.cbSize = std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32;
            cmd.fMask = SEE_MASK_UNICODE;
            cmd.lpVerb = windows::core::PCSTR::from_raw(cmd_str.as_ptr());
            cmd.nShow = SW_SHOWNORMAL.0 as i32;
            pcm.InvokeCommand(&raw const cmd).map_err(|e| e.to_string())?;
        }

        let _ = DestroyMenu(hmenu);
        CoTaskMemFree(Some(pidl as *const _));
        CoUninitialize();
    }
    Ok(())
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
