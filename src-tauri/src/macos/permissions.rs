use std::os::unix::fs::{MetadataExt, PermissionsExt};
#[tauri::command(async)]
pub fn get_permissions(path: String) -> Result<Vec<serde_json::Value>, String> {
    let m=std::fs::metadata(path).map_err(|e| e.to_string())?;
    Ok(vec![serde_json::json!({"account":format!("uid={} gid={}",m.uid(),m.gid()),"access":format!("{:o}",m.mode()&0o777),"display":format!("POSIX {:o} · ACL: Finder → Get Info",m.mode()&0o777)})])
}
#[tauri::command(async)]
pub fn set_permission(path: String, account: String, permission: String) -> Result<(), String> {
    if account!="mode" || permission.len()!=3 || !permission.bytes().all(|b| (b'0'..=b'7').contains(&b)) { return Err("Use a three-digit POSIX mode (for example 644); ACL editing is available in Finder".into()); }
    let mode=u32::from_str_radix(&permission,8).map_err(|e|e.to_string())?;
    if std::fs::symlink_metadata(&path).map_err(|e|e.to_string())?.file_type().is_symlink(){return Err("Refusing permission changes through a symbolic link".into());}
    std::fs::set_permissions(path,std::fs::Permissions::from_mode(mode)).map_err(|e|e.to_string())
}
#[tauri::command]
pub fn remove_permission() -> Result<(), String> { Err("Manage macOS ACL entries in Finder → Get Info".into()) }
#[tauri::command]
pub fn inherit_permissions() -> Result<(), String> { remove_permission() }
