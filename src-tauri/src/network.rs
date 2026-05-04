use crate::types::*;


#[tauri::command]
pub async fn ftp_list(host: String, path: String, user: String, pass: String) -> Result<Vec<FileInfo>, String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') {
        host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21)
    } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    let remote_path = if path.is_empty() || path == "/" { "." } else { &path };
    ftp.cwd(remote_path).map_err(|e| format!("CWD: {}", e))?;
    let list = ftp.list(None).map_err(|e| format!("LIST: {}", e))?;
    ftp.quit().ok();
    parse_ftp_list(&list, &host, &path)
}

fn parse_ftp_list(list: &[String], host: &str, path: &str) -> Result<Vec<FileInfo>, String> {
    let mut entries = Vec::new();
    for line in list {
        let line_str = line.to_string();
        let parts: Vec<&str> = line_str.split_whitespace().collect();
        if parts.len() < 9 { continue; }
        let perms = parts[0];
        let is_dir = perms.starts_with('d') || perms.starts_with('l');
        let name = parts[8..].join(" ");
        if name == "." || name == ".." { continue; }
        let size: u64 = parts[4].parse().unwrap_or(0);
        let modified = format!("{} {} {}", parts[5], parts[6], parts[7]);
        let ftp_path = format!("ftp://{}/{}{}", host, path.trim_end_matches('/'), if path.ends_with('/') || path == "/" { "" } else { "/" });
        entries.push(FileInfo {
            name: name.clone(),
            path: ftp_path + &name,
            extension: if is_dir { String::new() } else { name.rsplit('.').next().unwrap_or("").to_string() },
            is_dir,
            is_hidden: name.starts_with('.'),
            size,
            size_display: if size > 0 { format_size(size) } else { String::new() },
            modified,
            created: String::new(),
            modified_ts: 0,
            created_ts: 0,
            folder_size: None,
        });
    }
    Ok(entries)
}

#[tauri::command]
pub async fn ftp_download(host: String, remote_path: String, local_path: String, user: String, pass: String) -> Result<(), String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') { host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21) } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    let remote_dir = std::path::Path::new(&remote_path).parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or("/".to_string());
    let filename = std::path::Path::new(&remote_path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    ftp.cwd(&remote_dir).map_err(|e| format!("CWD: {}", e))?;
    let mut reader = ftp.retr_as_stream(&filename).map_err(|e| format!("RETR: {}", e))?;
    let mut file = std::fs::File::create(&local_path).map_err(|e| format!("Create file: {}", e))?;
    std::io::copy(&mut reader, &mut file).map_err(|e| format!("Download: {}", e))?;
    ftp.finalize_retr_stream(reader).map_err(|e| format!("Finalize: {}", e))?;
    ftp.quit().ok();
    Ok(())
}

#[tauri::command]
pub async fn ftp_upload(host: String, local_path: String, remote_dir: String, user: String, pass: String) -> Result<(), String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') {
        host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21)
    } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    ftp.cwd(&remote_dir).map_err(|e| format!("CWD: {}", e))?;
    let filename = std::path::Path::new(&local_path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mut file = std::fs::File::open(&local_path).map_err(|e| format!("Open file: {}", e))?;
    ftp.put_file(&filename, &mut file).map_err(|e| format!("STOR: {}", e))?;
    ftp.quit().ok();
    Ok(())
}

#[tauri::command]
pub async fn ftp_delete(host: String, remote_path: String, is_dir: bool, user: String, pass: String) -> Result<(), String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') {
        host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21)
    } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    if is_dir {
        ftp.rmdir(&remote_path).map_err(|e| format!("RMD: {}", e))?;
    } else {
        ftp.rm(&remote_path).map_err(|e| format!("DELE: {}", e))?;
    }
    ftp.quit().ok();
    Ok(())
}

#[tauri::command]
pub async fn ftp_mkdir(host: String, remote_path: String, user: String, pass: String) -> Result<(), String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') { host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21) } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    ftp.mkdir(&remote_path).map_err(|e| format!("MKD: {}", e))?;
    ftp.quit().ok();
    Ok(())
}

#[tauri::command]
pub async fn ftp_rename(host: String, old_path: String, new_name: String, user: String, pass: String) -> Result<(), String> {
    use suppaftp::FtpStream;
    let port: u16 = if host.contains(':') { host.split(':').last().and_then(|p| p.parse().ok()).unwrap_or(21) } else { 21 };
    let host_only = host.split(':').next().unwrap_or(&host);
    let mut ftp = FtpStream::connect((host_only, port)).map_err(|e| format!("FTP connect: {}", e))?;
    ftp.login(&user, &pass).map_err(|e| format!("FTP login: {}", e))?;
    let parent = std::path::Path::new(&old_path).parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or("/".to_string());
    let new_path = if parent.ends_with('/') { format!("{}{}", parent, new_name) } else { format!("{}\\{}", parent, new_name) };
    ftp.rename(&old_path, &new_path).map_err(|e| format!("RNFR/RNTO: {}", e))?;
    ftp.quit().ok();
    Ok(())
}

#[tauri::command]
pub async fn sftp_list(host: String, port: u16, path: String, user: String, pass: String) -> Result<Vec<FileInfo>, String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP connect: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH session: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("SSH handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("SSH auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP init: {}", e))?;
    let dir_path = std::path::Path::new(&path);
    let dir = sftp.readdir(dir_path).map_err(|e| format!("SFTP readdir: {}", e))?;
    let mut entries = Vec::new();
    for (entry_path, stat) in dir {
        let name = entry_path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if name == "." || name == ".." { continue; }
        let is_dir = stat.is_dir();
        let size = stat.size.unwrap_or(0);
        let mtime = stat.mtime.map(|t| {
            chrono::DateTime::from_timestamp(t as i64, 0)
                .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
                .unwrap_or_default()
        }).unwrap_or_default();
        let sftp_path = format!("sftp://{}:{}{}", host, port, entry_path.to_string_lossy());
        entries.push(FileInfo {
            name: name.clone(),
            path: sftp_path,
            extension: if is_dir { String::new() } else { name.rsplit('.').next().unwrap_or("").to_string() },
            is_dir,
            is_hidden: name.starts_with('.'),
            size,
            size_display: if size > 0 { format_size(size) } else { String::new() },
            modified: mtime,
            created: String::new(),
            modified_ts: stat.mtime.map(|t| t as i64 * 1000).unwrap_or(0),
            created_ts: 0,
            folder_size: None,
        });
    }
    sess.disconnect(None, "bye", None).ok();
    Ok(entries)
}

#[tauri::command]
pub async fn sftp_download(host: String, port: u16, remote_path: String, local_path: String, user: String, pass: String) -> Result<(), String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("Auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {}", e))?;
    let remote = std::path::Path::new(&remote_path);
    let mut remote_file = sftp.open(remote).map_err(|e| format!("Open remote: {}", e))?;
    let mut local_file = std::fs::File::create(&local_path).map_err(|e| format!("Create local: {}", e))?;
    std::io::copy(&mut remote_file, &mut local_file).map_err(|e| format!("Download: {}", e))?;
    sess.disconnect(None, "bye", None).ok();
    Ok(())
}

#[tauri::command]
pub async fn sftp_upload(host: String, port: u16, local_path: String, remote_path: String, user: String, pass: String) -> Result<(), String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("Auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {}", e))?;
    let remote = std::path::Path::new(&remote_path);
    let mut remote_file = sftp.create(remote).map_err(|e| format!("Create remote: {}", e))?;
    let mut local_file = std::fs::File::open(&local_path).map_err(|e| format!("Open local: {}", e))?;
    std::io::copy(&mut local_file, &mut remote_file).map_err(|e| format!("Upload: {}", e))?;
    sess.disconnect(None, "bye", None).ok();
    Ok(())
}

#[tauri::command]
pub async fn sftp_delete(host: String, port: u16, remote_path: String, is_dir: bool, user: String, pass: String) -> Result<(), String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("Auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {}", e))?;
    let path = std::path::Path::new(&remote_path);
    if is_dir {
        sftp.rmdir(path).map_err(|e| format!("RMDIR: {}", e))?;
    } else {
        sftp.unlink(path).map_err(|e| format!("UNLINK: {}", e))?;
    }
    sess.disconnect(None, "bye", None).ok();
    Ok(())
}

#[tauri::command]
pub async fn sftp_mkdir(host: String, port: u16, remote_path: String, user: String, pass: String) -> Result<(), String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("Auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {}", e))?;
    sftp.mkdir(std::path::Path::new(&remote_path), 0o755).map_err(|e| format!("MKDIR: {}", e))?;
    sess.disconnect(None, "bye", None).ok();
    Ok(())
}

#[tauri::command]
pub async fn sftp_rename(host: String, port: u16, old_path: String, new_path: String, user: String, pass: String) -> Result<(), String> {
    let tcp = std::net::TcpStream::connect((host.as_str(), port)).map_err(|e| format!("TCP: {}", e))?;
    let mut sess = ssh2::Session::new().map_err(|e| format!("SSH: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake: {}", e))?;
    sess.userauth_password(&user, &pass).map_err(|e| format!("Auth: {}", e))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {}", e))?;
    sftp.rename(std::path::Path::new(&old_path), std::path::Path::new(&new_path), None).map_err(|e| format!("RENAME: {}", e))?;
    sess.disconnect(None, "bye", None).ok();
    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn browse_network() -> Result<Vec<FileInfo>, String> {
    use windows::Win32::NetworkManagement::WNet::{
        WNetOpenEnumA, WNetEnumResourceA, WNetCloseEnum,
        RESOURCE_GLOBALNET, RESOURCETYPE_ANY, RESOURCEUSAGE_CONTAINER, WNET_OPEN_ENUM_USAGE,
    };
    use windows::Win32::NetworkManagement::WNet::NETRESOURCEA;
    use windows::Win32::Foundation::HANDLE;
    let mut net_resource = NETRESOURCEA::default();
    net_resource.dwScope = RESOURCE_GLOBALNET;
    net_resource.dwType = RESOURCETYPE_ANY;
    net_resource.dwUsage = RESOURCEUSAGE_CONTAINER.0;
    let mut handle: HANDLE = HANDLE::default();
    unsafe {
        let result = WNetOpenEnumA(
            RESOURCE_GLOBALNET,
            RESOURCETYPE_ANY,
            WNET_OPEN_ENUM_USAGE(0),
            Some(&net_resource),
            &mut handle,
        );
        if result.0 != 0 {
            let _ = WNetCloseEnum(handle);
            return Err(format!("WNetOpenEnum error: {}", result.0));
        }
        let mut servers = Vec::new();
        let mut buf_size: u32 = 16384;
        let mut buf = vec![0u8; buf_size as usize];
        let mut count = u32::MAX;
        loop {
            let enum_result = WNetEnumResourceA(handle, &mut count, buf.as_mut_ptr() as *mut _, &mut buf_size);
            if enum_result == windows::Win32::Foundation::ERROR_NO_MORE_ITEMS { break; }
            if enum_result.0 != 0 { break; }
            let resources = std::slice::from_raw_parts(buf.as_ptr() as *const NETRESOURCEA, count as usize);
            for res in resources {
                let name_ptr = res.lpRemoteName;
                if name_ptr.is_null() { continue; }
                let cstr = std::ffi::CStr::from_ptr(name_ptr.0 as *const i8);
                let name_str = cstr.to_string_lossy().to_string();
                let display_name = name_str.trim_start_matches('\\');
                if display_name.is_empty() { continue; }
                servers.push(FileInfo {
                    name: display_name.to_string(),
                    path: name_str.clone(),
                    extension: String::new(),
                    is_dir: true,
                    is_hidden: false,
                    size: 0,
                    size_display: String::new(),
                    modified: String::new(),
                    created: String::new(),
                    modified_ts: 0,
                    created_ts: 0,
                    folder_size: None,
                });
            }
            count = u32::MAX;
        }
        let _ = WNetCloseEnum(handle);
        Ok(servers)
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn browse_network() -> Result<Vec<FileInfo>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub fn list_shares(server: String) -> Result<Vec<FileInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::NetworkManagement::WNet::{
            WNetOpenEnumA, WNetEnumResourceA, WNetCloseEnum,
            RESOURCE_GLOBALNET, RESOURCETYPE_ANY, RESOURCEUSAGE_CONTAINER, WNET_OPEN_ENUM_USAGE,
        };
        use windows::Win32::NetworkManagement::WNet::NETRESOURCEA;
        use windows::Win32::Foundation::HANDLE;
        use windows::core::PSTR;
        let server_bytes = format!("{}\0", server);
        let mut net_resource = NETRESOURCEA::default();
        net_resource.dwScope = RESOURCE_GLOBALNET;
        net_resource.dwType = RESOURCETYPE_ANY;
        net_resource.dwUsage = RESOURCEUSAGE_CONTAINER.0;
        net_resource.lpRemoteName = PSTR(server_bytes.as_ptr() as *mut _);
        let mut handle: HANDLE = HANDLE::default();
        unsafe {
            let result = WNetOpenEnumA(
                RESOURCE_GLOBALNET,
                RESOURCETYPE_ANY,
                WNET_OPEN_ENUM_USAGE(0),
                Some(&net_resource),
                &mut handle,
            );
            if result.0 != 0 {
                let _ = WNetCloseEnum(handle);
                return Err(format!("WNetOpenEnum error: {}", result.0));
            }
            let mut shares = Vec::new();
            let mut buf_size: u32 = 16384;
            let mut buf = vec![0u8; buf_size as usize];
            let mut count = u32::MAX;
            loop {
                let enum_result = WNetEnumResourceA(handle, &mut count, buf.as_mut_ptr() as *mut _, &mut buf_size);
                if enum_result == windows::Win32::Foundation::ERROR_NO_MORE_ITEMS { break; }
                if enum_result.0 != 0 { break; }
                let resources = std::slice::from_raw_parts(buf.as_ptr() as *const NETRESOURCEA, count as usize);
                for res in resources {
                    let name_ptr = res.lpRemoteName;
                    if name_ptr.is_null() { continue; }
                    let cstr = std::ffi::CStr::from_ptr(name_ptr.0 as *const i8);
                    let name_str = cstr.to_string_lossy().to_string();
                    let display = name_str.trim_start_matches('\\').split('\\').last().unwrap_or("").to_string();
                    if display.is_empty() { continue; }
                    shares.push(FileInfo {
                        name: display,
                        path: name_str,
                        extension: String::new(),
                        is_dir: true,
                        is_hidden: false,
                        size: 0,
                        size_display: String::new(),
                        modified: String::new(),
                        created: String::new(),
                        modified_ts: 0,
                        created_ts: 0,
                        folder_size: None,
                    });
                }
                count = u32::MAX;
            }
            let _ = WNetCloseEnum(handle);
            Ok(shares)
        }
    }
    #[cfg(not(target_os = "windows"))]
    { Ok(Vec::new()) }
}
