use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::SystemTime;
use tokio::sync::mpsc;

pub mod config;
pub mod enumerator;
pub mod operations;

#[derive(Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: PathBuf,
    pub extension: String,
    pub is_dir: bool,
    pub is_hidden: bool,
    pub size: u64,
    pub modified: SystemTime,
    pub created: SystemTime,
}

impl FileEntry {
    pub fn display_size(&self) -> String {
        if self.is_dir {
            return String::new();
        }
        let bytes = self.size as f64;
        if bytes < 1024.0 {
            format!("{} B", bytes)
        } else if bytes < 1024.0 * 1024.0 {
            format!("{:.1} KB", bytes / 1024.0)
        } else if bytes < 1024.0 * 1024.0 * 1024.0 {
            format!("{:.1} MB", bytes / (1024.0 * 1024.0))
        } else {
            format!("{:.1} GB", bytes / (1024.0 * 1024.0 * 1024.0))
        }
    }
}

#[allow(dead_code)]
pub enum AppCommand {
    EnumerateDir {
        path: PathBuf,
        response: mpsc::Sender<Vec<FileEntry>>,
    },
    GetParentDir {
        path: PathBuf,
        response: mpsc::Sender<Option<PathBuf>>,
    },
    GetDrives {
        response: mpsc::Sender<Vec<DriveInfo>>,
    },
    CreateDir {
        path: PathBuf,
        response: mpsc::Sender<Result<(), String>>,
    },
    DeleteFiles {
        paths: Vec<PathBuf>,
        permanently: bool,
        response: mpsc::Sender<Result<(), String>>,
    },
    Rename {
        from: PathBuf,
        to: PathBuf,
        response: mpsc::Sender<Result<(), String>>,
    },
    CopyFiles {
        sources: Vec<PathBuf>,
        dest: PathBuf,
        response: mpsc::Sender<Result<(), String>>,
    },
    MoveFiles {
        sources: Vec<PathBuf>,
        dest: PathBuf,
        response: mpsc::Sender<Result<(), String>>,
    },
    Shutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveInfo {
    pub letter: String,
    pub label: String,
    pub fs_type: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
}

#[allow(dead_code)]
pub async fn run_backend(mut rx: mpsc::Receiver<AppCommand>) {
    let _pool = rayon::ThreadPoolBuilder::new()
        .num_threads(std::thread::available_parallelism().map(|n| n.get()).unwrap_or(8))
        .build()
        .unwrap();

    while let Some(cmd) = rx.recv().await {
        match cmd {
            AppCommand::EnumerateDir { path, response } => {
                let entries = enumerator::list_dir(&path).unwrap_or_default();
                let _ = response.send(entries).await;
            }
            AppCommand::GetParentDir { path, response } => {
                let parent = path.parent().map(|p| p.to_path_buf());
                let _ = response.send(parent).await;
            }
            AppCommand::GetDrives { response } => {
                let drives = match enumerator::get_drives() {
                    Ok(d) => d,
                    Err(e) => {
                        eprintln!("Drive enumeration error: {e}");
                        Vec::new()
                    }
                };
                let _ = response.send(drives).await;
            }
            AppCommand::Shutdown => break,
            _ => {}
        }
    }
}
