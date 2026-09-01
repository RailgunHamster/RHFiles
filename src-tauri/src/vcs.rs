
use rhfiles_core::enumerator;
use std::collections::HashMap;
use std::path::PathBuf;

#[tauri::command(async)]
pub fn git_status(path: String) -> Result<HashMap<String, String>, String> {
    enumerator::get_git_status(&PathBuf::from(&path))
}

#[tauri::command]
pub fn git_branches(path: String) -> Result<Vec<enumerator::GitBranch>, String> {
    enumerator::git_branches(&PathBuf::from(&path))
}

#[tauri::command]
pub fn git_checkout(path: String, branch: String) -> Result<(), String> {
    enumerator::git_checkout(&PathBuf::from(&path), &branch)
}

#[tauri::command]
pub fn git_create_branch(path: String, name: String) -> Result<(), String> {
    enumerator::git_create_branch(&PathBuf::from(&path), &name)
}

#[tauri::command]
pub fn git_init(path: String) -> Result<(), String> {
    enumerator::git_init(&PathBuf::from(&path))
}

#[tauri::command(async)]
pub fn svn_status(path: String) -> Result<HashMap<String, String>, String> {
    enumerator::get_svn_status(&PathBuf::from(&path))
}

#[tauri::command]
pub fn svn_info(path: String) -> Result<enumerator::SvnInfo, String> {
    enumerator::get_svn_info(&PathBuf::from(&path))
}

#[tauri::command]
pub fn svn_update(path: String) -> Result<String, String> {
    enumerator::svn_update(&PathBuf::from(&path))
}

#[tauri::command]
pub fn svn_commit(path: String, message: String) -> Result<String, String> {
    enumerator::svn_commit(&PathBuf::from(&path), &message)
}

#[tauri::command]
pub fn svn_revert(path: String, targets: Vec<String>) -> Result<(), String> {
    enumerator::svn_revert(&PathBuf::from(&path), targets)
}

#[tauri::command]
pub fn svn_add(path: String, targets: Vec<String>) -> Result<(), String> {
    enumerator::svn_add(&PathBuf::from(&path), targets)
}

#[tauri::command]
pub fn svn_log(path: String, limit: u32) -> Result<Vec<enumerator::SvnLogEntry>, String> {
    enumerator::get_svn_log(&PathBuf::from(&path), limit)
}

#[tauri::command]
pub fn svn_checkout(url: String, dest: String) -> Result<String, String> {
    enumerator::svn_checkout(&url, &dest)
}

#[tauri::command]
pub fn svn_cleanup(path: String) -> Result<(), String> {
    enumerator::svn_cleanup(&PathBuf::from(&path))
}

#[tauri::command]
pub fn svn_resolve(path: String, targets: Vec<String>) -> Result<(), String> {
    enumerator::svn_resolve(&PathBuf::from(&path), targets)
}

#[tauri::command]
pub async fn git_clone(url: String, dest: String) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(["clone", &url, &dest])
        .output()
        .map_err(|e| format!("git not found: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.to_string());
    }
    Ok(dest)
}
