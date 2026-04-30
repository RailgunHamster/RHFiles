slint::include_modules!();

use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Mutex;

use rhfiles_core::enumerator;
use rhfiles_core::config;
use rhfiles_core::FileEntry;
use slint::ModelRc;

static CLIPBOARD_SRC: Mutex<Option<(String, String)>> = Mutex::new(None); // (path, op: "copy"|"cut")

fn to_file_row(entry: &FileEntry, selected_index: i32, idx: usize) -> FileRow {
    let modified = entry.modified;
    let datetime = if let Ok(dur) = modified.duration_since(std::time::UNIX_EPOCH) {
        let secs = dur.as_secs();
        let days = secs / 86400;
        let time = secs % 86400;
        let hours = time / 3600;
        let mins = (time % 3600) / 60;
        if days > 365 * 2 {
            let years = days / 365;
            format!("{years} years ago")
        } else if days > 60 {
            let months = days / 30;
            format!("{months} months ago")
        } else if days > 1 {
            format!("{days} days ago")
        } else if days == 1 {
            "Yesterday".into()
        } else {
            format!("{hours:02}:{mins:02}")
        }
    } else {
        String::new()
    };

    FileRow {
        name: entry.name.clone().into(),
        size: entry.display_size().into(),
        modified: datetime.into(),
        type_: if entry.is_dir {
            "Folder".into()
        } else {
            entry.extension.clone().into()
        },
        is_dir: entry.is_dir,
        is_selected: idx as i32 == selected_index,
        path: entry.path.to_string_lossy().into_owned().into(),
    }
}

fn build_file_rows(entries: &[FileEntry], selected_index: i32) -> Vec<FileRow> {
    entries
        .iter()
        .enumerate()
        .map(|(i, e)| to_file_row(e, selected_index, i))
        .collect()
}

fn set_file_rows(ui: &MainWindow, entries: &[FileEntry], selected_index: i32) {
    let rows = build_file_rows(entries, selected_index);
    ui.set_file_rows(ModelRc::from(rows.as_slice()));
}

fn set_drive_rows(ui: &MainWindow, drives: &[rhfiles_core::DriveInfo]) {
    let drive_rows: Vec<DriveRow> = drives
        .iter()
        .map(|d| DriveRow {
            letter: d.letter.clone().into(),
            label: if d.label.is_empty() {
                "Local Disk".into()
            } else {
                d.label.clone().into()
            },
            free: format!(
                "{:.1} GB free / {:.1} GB",
                d.free_bytes as f64 / (1024.0 * 1024.0 * 1024.0),
                d.total_bytes as f64 / (1024.0 * 1024.0 * 1024.0),
            )
            .into(),
            icon: "HD".into(),
            path: format!("{}\\", d.letter).into(),
        })
        .collect();
    ui.set_drive_rows(ModelRc::from(drive_rows.as_slice()));
}

fn navigate_dir(ui: &MainWindow, path: &std::path::Path, filter: &str) {
    let entries = match enumerator::list_dir(path) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    let filtered: Vec<FileEntry> = if filter.is_empty() {
        entries
    } else {
        let lower = filter.to_lowercase();
        entries
            .into_iter()
            .filter(|e| e.name.to_lowercase().contains(&lower))
            .collect()
    };

    ui.set_current_path(path.to_string_lossy().into_owned().into());
    set_file_rows(ui, &filtered, -1);
    ui.set_selected_index(-1);
    ui.set_status_text(format!("{} items", filtered.len()).into());
}

fn main() -> Result<(), slint::PlatformError> {
    let ui = MainWindow::new()?;
    let ui_weak = ui.as_weak();

    let config_path = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    let config = config::load_config(&config_path.join("rhfiles.conf"));

    if let Some(first_tab) = config.startup_tabs.first() {
        navigate_dir(&ui, first_tab, "");
    }

    // Load drives
    {
        let ui = ui_weak.clone();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let drives = enumerator::get_drives().unwrap_or_default();
            let _ = tx.send(drives);
        });
        if let Ok(drives) = rx.recv() {
            set_drive_rows(&ui.unwrap(), &drives);
        }
    }

    // ─── Callbacks ───

    // Open path (navigate into directory)
    let ui_h = ui_weak.clone();
    ui.on_open_path(move |path_str| {
        if let Some(ui) = ui_h.upgrade() {
            let path = PathBuf::from(path_str.as_str());
            let filter = ui.get_filter_text();
            navigate_dir(&ui, &path, filter.as_str());
        }
    });

    // Go up to parent
    let ui_h = ui_weak.clone();
    ui.on_go_up(move || {
        if let Some(ui) = ui_h.upgrade() {
            let current = ui.get_current_path();
            let path = PathBuf::from(current.as_str());
            if let Some(parent) = path.parent() {
                navigate_dir(&ui, parent, "");
            }
        }
    });

    // Refresh
    let ui_h = ui_weak.clone();
    ui.on_refresh(move || {
        if let Some(ui) = ui_h.upgrade() {
            let current = ui.get_current_path();
            let path = PathBuf::from(current.as_str());
            let filter = ui.get_filter_text();
            navigate_dir(&ui, &path, filter.as_str());
        }
    });

    // Select file by path
    let ui_h = ui_weak.clone();
    ui.on_select_file(move |path_str| {
        if let Some(ui) = ui_h.upgrade() {
            let current = ui.get_current_path();
            let dir_path = PathBuf::from(current.as_str());
            if let Ok(entries) = enumerator::list_dir(&dir_path) {
                if let Some(idx) = entries.iter().position(|e| e.path.to_string_lossy() == path_str.as_str()) {
                    set_file_rows(&ui, &entries, idx as i32);
                    ui.set_selected_index(idx as i32);
                }
            }
        }
    });

    // Delete selected
    let ui_h = ui_weak.clone();
    ui.on_delete_selected(move || {
        if let Some(ui) = ui_h.upgrade() {
            let si = ui.get_selected_index();
            if si >= 0 {
                let current = ui.get_current_path();
                let path = PathBuf::from(current.as_str());
                if let Ok(entries) = enumerator::list_dir(&path) {
                    if let Some(entry) = entries.get(si as usize) {
                        // Delete via shell (recycle bin on Windows)
                        match enumerator::delete_to_recycle_bin(&entry.path) {
                            Ok(_) => {
                                navigate_dir(&ui, &path, "");
                            }
                            Err(e) => {
                                ui.set_status_text(format!("Delete failed: {e}").into());
                            }
                        }
                    }
                }
            }
        }
    });

    // Rename selected
    let ui_h = ui_weak.clone();
    ui.on_rename_selected(move || {
        if let Some(ui) = ui_h.upgrade() {
            let si = ui.get_selected_index();
            if si >= 0 {
                let current = ui.get_current_path();
                let path = PathBuf::from(current.as_str());
                if let Ok(entries) = enumerator::list_dir(&path) {
                    if let Some(entry) = entries.get(si as usize) {
                        // Simple rename: append _renamed
                        let new_name = format!("{}_renamed", entry.name);
                        let new_path = entry.path.parent().unwrap_or(&entry.path).join(&new_name);
                        match std::fs::rename(&entry.path, &new_path) {
                            Ok(_) => {
                                navigate_dir(&ui, &path, "");
                            }
                            Err(e) => {
                                ui.set_status_text(format!("Rename failed: {e}").into());
                            }
                        }
                    }
                }
            }
        }
    });

    // New folder
    let ui_h = ui_weak.clone();
    ui.on_new_folder(move || {
        if let Some(ui) = ui_h.upgrade() {
            let current = ui.get_current_path();
            let path = PathBuf::from(current.as_str());
            let mut new_path = path.join("New Folder");
            let mut counter = 1;
            while new_path.exists() {
                new_path = path.join(format!("New Folder ({counter})"));
                counter += 1;
            }
            match std::fs::create_dir(&new_path) {
                Ok(_) => {
                    navigate_dir(&ui, &path, "");
                }
                Err(e) => {
                    ui.set_status_text(format!("Failed: {e}").into());
                }
            }
        }
    });

    // Copy selected
    let ui_h = ui_weak.clone();
    ui.on_copy_selected(move || {
        if let Some(ui) = ui_h.upgrade() {
            let si = ui.get_selected_index();
            let current = ui.get_current_path();
            let path = PathBuf::from(current.as_str());
            if let Ok(entries) = enumerator::list_dir(&path) {
                if let Some(entry) = entries.get(si as usize) {
                    // Store path in clipboard-like state (simple approach)
                    *CLIPBOARD_SRC.lock().unwrap() = Some((entry.path.to_string_lossy().into_owned(), "copy".into()));
                    ui.set_status_text(format!("Copied: {}", entry.name).into());
                }
            }
        }
    });

    // Cut selected
    let ui_h = ui_weak.clone();
    ui.on_cut_selected(move || {
        if let Some(ui) = ui_h.upgrade() {
            let si = ui.get_selected_index();
            let current = ui.get_current_path();
            let path = PathBuf::from(current.as_str());
            if let Ok(entries) = enumerator::list_dir(&path) {
                if let Some(entry) = entries.get(si as usize) {
                    *CLIPBOARD_SRC.lock().unwrap() = Some((entry.path.to_string_lossy().into_owned(), "cut".into()));
                    ui.set_status_text(format!("Cut: {}", entry.name).into());
                }
            }
        }
    });

    // Paste
    let ui_h = ui_weak.clone();
    ui.on_paste(move || {
        if let Some(ui) = ui_h.upgrade() {
            let current = ui.get_current_path();
            let dest = PathBuf::from(current.as_str());
            let clipboard = CLIPBOARD_SRC.lock().unwrap().take();
            if let Some((src_str, op)) = clipboard {
                let src = PathBuf::from(&src_str);
                let result = if op == "cut" {
                    enumerator::move_path(&src, &dest)
                } else {
                    enumerator::copy_path(&src, &dest)
                };
                match result {
                    Ok(_) => {
                        navigate_dir(&ui, &dest, "");
                    }
                    Err(e) => {
                        ui.set_status_text(format!("Paste failed: {e}").into());
                    }
                }
            }
        }
    });

    // Back / forward (placeholder)
    ui.on_go_back(|| {});
    ui.on_go_forward(|| {});

    ui.run()
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var("APPDATA")
        .ok()
        .map(|s| PathBuf::from(s).join("RHFiles"))
}
