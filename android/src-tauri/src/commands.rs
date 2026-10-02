//! Blocking filesystem work stays off Android's UI/IPC thread. The synchronous
//! implementation remains directly testable, while the shipping handlers await
//! Tauri's blocking pool. No task percentages are invented by the frontend.
use crate::{device, fs_ops, thumbnail};

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<fs_ops::DirListing, String> {
    blocking(move || fs_ops::list_dir(path)).await
}
#[tauri::command]
pub async fn copy_entries(sources: Vec<String>, destination: String) -> Result<fs_ops::TransferReport, String> {
    blocking(move || fs_ops::copy_entries(sources, destination)).await
}
#[tauri::command]
pub async fn move_entries(sources: Vec<String>, destination: String) -> Result<fs_ops::TransferReport, String> {
    blocking(move || fs_ops::move_entries(sources, destination)).await
}
#[tauri::command]
pub async fn delete_entries(paths: Vec<String>, permanent: bool) -> Result<fs_ops::DeleteReport, String> {
    blocking(move || fs_ops::delete_entries(paths, permanent)).await
}
#[tauri::command]
pub async fn read_text_preview(path: String, max_bytes: Option<u64>) -> Result<fs_ops::TextPreview, String> {
    blocking(move || fs_ops::read_text_preview(path, max_bytes)).await
}
#[tauri::command]
pub async fn file_hash(path: String, algorithm: Option<String>) -> Result<String, String> {
    blocking(move || fs_ops::file_hash(path, algorithm)).await
}
#[tauri::command]
pub async fn read_thumbnail(path: String, max_edge: Option<u32>) -> Result<thumbnail::Thumbnail, String> {
    blocking(move || thumbnail::read_thumbnail(path, max_edge)).await
}
#[tauri::command]
pub async fn scan_storage_sizes(root: String, max_entries: Option<u64>) -> Result<device::StorageSizeReport, String> {
    blocking(move || device::scan_storage_sizes(root, max_entries)).await
}
