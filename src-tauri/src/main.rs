#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn managed_install_root(executable: &std::path::Path) -> Option<std::path::PathBuf> {
    let version_directory = executable.parent()?;
    if !version_directory
        .file_name()?
        .to_string_lossy()
        .eq_ignore_ascii_case("current")
    {
        return None;
    }
    version_directory.parent().map(std::path::Path::to_path_buf)
}

fn move_working_directory_out_of_version_folder() {
    let Some(root) = std::env::current_exe()
        .ok()
        .as_deref()
        .and_then(managed_install_root)
    else {
        return;
    };
    // Child processes inherit their parent's working directory. Keeping RHFiles
    // inside Velopack's versioned `current` folder lets an unrelated program
    // opened from the file manager prevent that folder from being replaced.
    let _ = std::env::set_current_dir(root);
}

fn main() {
    // Velopack must handle install/update lifecycle arguments before Tauri starts.
    velopack::VelopackApp::build().run();
    move_working_directory_out_of_version_folder();
    rhfiles_tauri_lib::run()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_only_velopack_current_directories() {
        assert_eq!(
            managed_install_root(std::path::Path::new(
                r"D:\software\RHFiles\current\RHFiles.exe"
            )),
            Some(std::path::PathBuf::from(r"D:\software\RHFiles"))
        );
        assert_eq!(
            managed_install_root(std::path::Path::new(r"D:\build\release\RHFiles.exe")),
            None
        );
    }
}
