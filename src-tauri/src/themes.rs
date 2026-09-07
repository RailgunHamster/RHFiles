use serde::Serialize;
use std::path::{Path, PathBuf};

const MAX_THEME_FILE_BYTES: u64 = 256 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserThemeFile {
    file_name: String,
    path: String,
    content: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeDiscovery {
    directory: String,
    themes: Vec<UserThemeFile>,
    errors: Vec<String>,
}

fn theme_directory() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("RHFiles")
        .join("themes")
}

fn is_theme_file(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
}

#[tauri::command(async)]
pub fn list_user_themes() -> Result<ThemeDiscovery, String> {
    let directory = theme_directory();
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let mut paths = std::fs::read_dir(&directory)
        .map_err(|error| error.to_string())?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_theme_file(path))
        .collect::<Vec<_>>();
    paths.sort_by_key(|path| path.file_name().map(|name| name.to_ascii_lowercase()));

    let mut themes = Vec::new();
    let mut errors = Vec::new();
    for path in paths.into_iter().take(128) {
        let file_name = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let metadata = match std::fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => {
                errors.push(format!("{file_name}: {error}"));
                continue;
            }
        };
        if metadata.len() > MAX_THEME_FILE_BYTES {
            errors.push(format!("{file_name}: theme file exceeds 256 KiB"));
            continue;
        }
        match std::fs::read_to_string(&path) {
            Ok(content) => themes.push(UserThemeFile {
                file_name,
                path: path.to_string_lossy().into_owned(),
                content,
            }),
            Err(error) => errors.push(format!("{file_name}: {error}")),
        }
    }

    Ok(ThemeDiscovery {
        directory: directory.to_string_lossy().into_owned(),
        themes,
        errors,
    })
}

#[tauri::command]
pub fn open_theme_folder() -> Result<String, String> {
    let directory = theme_directory();
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    std::process::Command::new("explorer.exe")
        .arg(&directory)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(directory.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::is_theme_file;
    use std::path::Path;

    #[test]
    fn only_json_files_are_theme_candidates() {
        assert!(is_theme_file(Path::new("calm.json")));
        assert!(is_theme_file(Path::new("CALM.JSON")));
        assert!(!is_theme_file(Path::new("theme.css")));
    }
}
