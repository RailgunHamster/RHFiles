use serde::Serialize;
use std::sync::mpsc;
use tauri::{AppHandle, Emitter};
use velopack::{Error as VelopackError, UpdateCheck, UpdateManager, sources::AutoSource};

const DEFAULT_UPDATE_SOURCE: &str = "https://github.com/RailgunHamster/RHFiles";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    managed: bool,
    is_portable: bool,
    current_version: String,
    available_version: Option<String>,
    release_notes: String,
    pending_restart: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    percentage: i16,
}

fn effective_source(source: Option<String>) -> String {
    source
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_UPDATE_SOURCE.to_string())
}

fn manager_for(source: &str) -> Result<UpdateManager, VelopackError> {
    UpdateManager::new(AutoSource::new(source), None, None)
}

fn unmanaged_status() -> UpdateStatus {
    UpdateStatus {
        managed: false,
        is_portable: false,
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        available_version: None,
        release_notes: String::new(),
        pending_restart: false,
    }
}

fn open_manager(source: &str) -> Result<Option<UpdateManager>, String> {
    match manager_for(source) {
        Ok(manager) => Ok(Some(manager)),
        Err(VelopackError::NotInstalled(_)) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub async fn check_updates(source: Option<String>) -> Result<UpdateStatus, String> {
    let source = effective_source(source);
    tauri::async_runtime::spawn_blocking(move || {
        let Some(manager) = open_manager(&source)? else {
            return Ok(unmanaged_status());
        };

        let current_version = manager.get_current_version_as_string();
        let is_portable = manager.get_is_portable();
        if let Some(pending) = manager.get_update_pending_restart() {
            return Ok(UpdateStatus {
                managed: true,
                is_portable,
                current_version,
                available_version: Some(pending.Version),
                release_notes: pending.NotesMarkdown,
                pending_restart: true,
            });
        }

        match manager
            .check_for_updates()
            .map_err(|error| error.to_string())?
        {
            UpdateCheck::UpdateAvailable(update) => Ok(UpdateStatus {
                managed: true,
                is_portable,
                current_version,
                available_version: Some(update.TargetFullRelease.Version.clone()),
                release_notes: update.TargetFullRelease.NotesMarkdown.clone(),
                pending_restart: false,
            }),
            UpdateCheck::RemoteIsEmpty | UpdateCheck::NoUpdateAvailable => Ok(UpdateStatus {
                managed: true,
                is_portable,
                current_version,
                available_version: None,
                release_notes: String::new(),
                pending_restart: false,
            }),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn download_update(app: AppHandle, source: Option<String>) -> Result<String, String> {
    let source = effective_source(source);
    tauri::async_runtime::spawn_blocking(move || {
        let manager = open_manager(&source)?
            .ok_or_else(|| "This build is not managed by Velopack".to_string())?;

        if let Some(pending) = manager.get_update_pending_restart() {
            let _ = app.emit("update-progress", UpdateProgress { percentage: 100 });
            return Ok(pending.Version);
        }

        let update = match manager
            .check_for_updates()
            .map_err(|error| error.to_string())?
        {
            UpdateCheck::UpdateAvailable(update) => update,
            UpdateCheck::RemoteIsEmpty | UpdateCheck::NoUpdateAvailable => {
                return Err("No update is available".to_string());
            }
        };
        let version = update.TargetFullRelease.Version.clone();
        let (sender, receiver) = mpsc::channel::<i16>();
        let progress_app = app.clone();
        let progress_thread = std::thread::spawn(move || {
            while let Ok(percentage) = receiver.recv() {
                let _ = progress_app.emit(
                    "update-progress",
                    UpdateProgress {
                        percentage: percentage.clamp(0, 100),
                    },
                );
            }
        });

        let result = manager
            .download_updates(&update, Some(sender))
            .map_err(|error| error.to_string());
        let _ = progress_thread.join();
        result?;
        let _ = app.emit("update-progress", UpdateProgress { percentage: 100 });
        Ok(version)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn apply_update(source: Option<String>) -> Result<(), String> {
    let source = effective_source(source);
    let manager = open_manager(&source)?
        .ok_or_else(|| "This build is not managed by Velopack".to_string())?;
    let pending = manager
        .get_update_pending_restart()
        .ok_or_else(|| "No downloaded update is waiting to be applied".to_string())?;
    manager
        .apply_updates_and_restart(pending)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_source_uses_github() {
        assert_eq!(effective_source(None), DEFAULT_UPDATE_SOURCE);
        assert_eq!(effective_source(Some("   ".into())), DEFAULT_UPDATE_SOURCE);
    }

    #[test]
    fn local_and_remote_sources_are_preserved() {
        assert_eq!(
            effective_source(Some(
                r"\\SERVER-HOME\Public\Software\RHFiles-Releases".into()
            )),
            r"\\SERVER-HOME\Public\Software\RHFiles-Releases"
        );
        assert_eq!(
            effective_source(Some("https://example.invalid/releases".into())),
            "https://example.invalid/releases"
        );
    }
}
