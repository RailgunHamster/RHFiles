mod archive;
mod cloud;
mod db;
mod file_ops;
mod network;
mod search;
mod shell;
mod system;
mod types;
mod vcs;
mod window;

use std::sync::Mutex;
use tauri::Emitter;
use types::CancelFlag;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CancelFlag(Mutex::new(false)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                let _ = window.show();
            }
            if args.len() > 1 {
                let mut path = args[1].clone();
                if let Some(stripped) = path.strip_prefix("rhfiles://") {
                    path = stripped.replace('/', "\\");
                }
                let _ = app.emit("navigate-to-path", path);
            }
        }))
        .setup(|app| {
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
            use tauri::Manager;
            if let Some(icon) = app.default_window_icon() {
                let _tray = TrayIconBuilder::new()
                    .icon(icon.clone())
                    .tooltip("RHFiles")
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(w) = tray.app_handle().get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            {
                let app_handle = app.handle().clone();
                let restore_result: Result<Vec<_>, String> = (|| {
                    let conn = db::get_db()?;
                    let mut stmt = conn.prepare("SELECT window_id, pos_x, pos_y, width, height, maximized, sort_order FROM window_states WHERE window_id != 'main' ORDER BY sort_order").map_err(|e| e.to_string())?;
                    let rows = stmt.query_map([], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, i32>(1)?,
                            row.get::<_, i32>(2)?,
                            row.get::<_, i32>(3)?,
                            row.get::<_, i32>(4)?,
                            row.get::<_, i32>(5)? != 0,
                            row.get::<_, i32>(6)?,
                        ))
                    }).map_err(|e| e.to_string())?;
                    Ok(rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
                })();
                if let Ok(rows) = restore_result {
                    if !rows.is_empty() {
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            for (window_id, pos_x, pos_y, width, height, _maximized, _sort_order) in rows {
                                use tauri::WebviewWindowBuilder;
                                let builder = WebviewWindowBuilder::new(
                                    &app_handle,
                                    &window_id,
                                    tauri::WebviewUrl::App("index.html".into()),
                                )
                                .title("RHFiles")
                                .inner_size(width as f64, height as f64);
                                let builder = if pos_x != 0 || pos_y != 0 {
                                    builder.position(pos_x as f64, pos_y as f64)
                                } else {
                                    builder
                                };
                                let _ = builder.build();
                            }
                        });
                    }
                }
            }

            {
                let trigger = std::path::PathBuf::from("D:\\git\\RHFiles\\rhfiles-run-tests.trigger");
                if trigger.exists() {
                    let _ = std::fs::remove_file(&trigger);
                    let app_handle = app.handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(12));
                        let _ = app_handle.emit("run-tests", ());
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            file_ops::list_dir, file_ops::get_drives, file_ops::parent_path,
            file_ops::delete_file, file_ops::delete_files, file_ops::rename_file, file_ops::new_folder,
            file_ops::copy_path, file_ops::move_path_cmd,
            file_ops::copy_with_progress, file_ops::move_with_progress,
            file_ops::cancel_operation,
            file_ops::get_env, file_ops::get_dir_tree, file_ops::batch_rename, file_ops::get_file_info,
            file_ops::create_shortcut,

            system::get_thumbnail, system::open_file, system::show_properties,
            system::read_file_preview, system::get_file_icon,
            system::get_new_file_templates, system::create_new_file, system::get_file_association,
            system::run_as_admin, system::empty_recycle_bin, system::rotate_image, system::read_shortcut,
            system::detect_ides, system::open_in_ide, system::install_font, system::set_wallpaper,
            system::set_file_readonly,
            system::list_ads, system::delete_ads, system::read_ads, system::unblock_file,
            system::quicklook, system::check_updates,
            system::rtf_to_html, system::docx_to_text,
            system::format_drive, system::install_certificate,
            system::set_compat_mode, system::get_compat_mode,
            system::log_error, system::get_error_logs,
            system::list_i18n_files, system::list_mtp_devices,
            system::run_gui_tests, system::write_test_results,

            vcs::git_status, vcs::git_branches, vcs::git_checkout,
            vcs::git_create_branch, vcs::git_init, vcs::git_clone,
            vcs::svn_status, vcs::svn_info, vcs::svn_update, vcs::svn_commit,
            vcs::svn_revert, vcs::svn_add, vcs::svn_log, vcs::svn_checkout,
            vcs::svn_cleanup, vcs::svn_resolve,

            archive::list_archive, archive::extract_archive, archive::create_archive,
            archive::extract_7z, archive::create_7z, archive::is_7z_available,

            db::db_save_tags, db::db_load_tags, db::db_load_all_tags,
            db::db_save_layout, db::db_load_layout,
            db::db_save_pinned, db::db_load_pinned,
            db::db_save_network_favorite, db::db_load_network_favorites, db::db_delete_network_favorite,
            db::db_add_recent, db::db_load_recent, db::db_remove_recent, db::db_clear_recent,
            db::db_export_all, db::db_import_all, db::db_clear_all,
            db::cleanup_stale_windows,

            search::quick_search, search::search_recursive, search::is_everything_available,

            window::toggle_pip, window::open_new_window, window::get_window_label,
            window::save_window_state, window::load_window_state,
            window::get_all_window_states, window::delete_window_state,
            window::save_current_window_geometry, window::restore_window_geometry,
            window::set_window_effect,

            cloud::get_cloud_status, cloud::get_cloud_providers,
            cloud::cloud_pin_file, cloud::cloud_unpin_file, cloud::cloud_clear_pin,
            cloud::get_cloud_file_size,

            network::ftp_list, network::ftp_download, network::ftp_upload,
            network::ftp_delete, network::ftp_mkdir, network::ftp_rename,
            network::sftp_list, network::sftp_download, network::sftp_upload,
            network::sftp_delete, network::sftp_mkdir, network::sftp_rename,
            network::browse_network, network::list_shares,

            shell::get_shell_verbs, shell::invoke_shell_verb,
            shell::get_permissions, shell::set_permission,
            shell::remove_permission, shell::inherit_permissions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
