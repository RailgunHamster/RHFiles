//! Shared state, command registration and application bootstrap.

pub mod device;
pub mod commands;
pub mod fs_ops;
pub mod index;
pub mod log;
pub mod server;
pub mod thumbnail;

use serde::Serialize;
use std::path::PathBuf;

pub use index::{SearchHit, SharedIndex};

/// Process-wide state handed to every command through Tauri's managed state.
pub struct AppState {
    pub index: SharedIndex,
    pub server: server::SharedServer,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: &'static str,
    pub platform: &'static str,
    pub android_api: Option<u32>,
}

/// Command module for the build identity.
///
/// Kept out of the crate root on purpose: `#[tauri::command]` exports a helper
/// macro named after the function, and a `macro_export` macro defined directly
/// in the crate root collides with its own re-export there.
pub mod app {
    #[tauri::command]
    pub fn app_info() -> super::AppInfo {
        super::AppInfo {
            version: env!("CARGO_PKG_VERSION"),
            platform: std::env::consts::OS,
            android_api: super::device::android_api_level(),
        }
    }
}

/// Absolute path of the application-private data directory, as reported by
/// Tauri. Used for the search index database and logs.
pub fn app_data_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("/data/local/tmp/rhfiles"))
}

/// A build failed: the error text is the message sent to the frontend.
pub type CommandResult<T> = Result<T, String>;

/// Assembles the application: managed state, setup hook and the command table.
///
/// Generic over the runtime so the IPC integration tests can drive the *same*
/// registration list through `tauri::test::MockRuntime` instead of keeping a
/// second copy of it in sync.
pub fn build_app_generic<R: tauri::Runtime>() -> tauri::Builder<R> {
    tauri::Builder::<R>::new()
        .manage(AppState {
            index: std::sync::Arc::new(index::IndexState::default()),
            server: std::sync::Arc::new(server::ServerState::default()),
        })
        .setup(move |app| {
            use tauri::Manager;
            let handle = app.handle().clone();
            let data_dir = app_data_dir(&handle);
            let _ = std::fs::create_dir_all(&data_dir);
            // Mirror diagnostics to a file before anything else logs, so an
            // acceptance run can read the session back over adb.
            let mirrored = log::init_file_log(&data_dir);

            let index = std::sync::Arc::clone(&app.state::<AppState>().index);
            match index::IndexStore::open(data_dir.join("index.bin")) {
                Some(store) => {
                    let entries = store.entries.len();
                    index::load_into(&index, store);
                    log::info("index", format!("restored {entries} names from disk"));
                }
                None => log::info("index", "no usable index on disk yet"),
            }
            log::info(
                "app",
                format!(
                    "RHFiles {} starting on {} (log file: {})",
                    env!("CARGO_PKG_VERSION"),
                    std::env::consts::OS,
                    mirrored
                        .as_deref()
                        .map(|path| path.display().to_string())
                        .unwrap_or_else(|| "unavailable".into())
                ),
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app::app_info,
            device::get_storage_roots,
            device::get_permission_status,
            commands::scan_storage_sizes,
            server::get_reverse_server_status,
            server::start_reverse_server,
            server::stop_reverse_server,
            commands::list_dir,
            fs_ops::create_directory,
            fs_ops::create_file,
            fs_ops::rename_entry,
            commands::delete_entries,
            commands::copy_entries,
            commands::move_entries,
            fs_ops::entry_exists,
            commands::read_text_preview,
            commands::file_hash,
            commands::read_thumbnail,
            index::index_status,
            index::index_start,
            index::index_stop,
            index::index_clear,
            index::search_files,
            index::browse_library,
            log::get_logs,
            log::clear_logs,
            log::debug_note,
        ])
}

/// Context built from `tauri.conf.json`, with the frontend assets embedded.
pub fn app_context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    build_app_generic::<tauri::Wry>()
        .run(app_context())
        .expect("error while running RHFiles for Android");
}
