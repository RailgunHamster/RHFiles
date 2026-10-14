use crate::types::ArchiveEntry;
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveConflict {
    pub entry_path: String,
    pub target_path: String,
    pub protected_input: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionInspection {
    pub password_entry: Option<String>,
    pub conflicts: Vec<ArchiveConflict>,
}

fn relative_name(name: &str) -> Result<String, String> {
    let name = name.replace('\\', "/");
    if name.starts_with('/') || name.as_bytes().get(1) == Some(&b':') {
        return Err(format!("Unsafe archive entry path: {name}"));
    }
    let mut parts = Vec::new();
    for part in name.split('/') {
        if part == ".." {
            return Err(format!("Unsafe archive entry path: {name}"));
        }
        if !part.is_empty() && part != "." {
            #[cfg(windows)]
            if part.contains(':') {
                return Err(format!("Unsafe archive entry path: {name}"));
            }
            parts.push(part);
        }
    }
    Ok(parts.join("/"))
}

pub fn selected_entries<'a>(
    entries: &'a [ArchiveEntry],
    entry: Option<&str>,
) -> Result<Vec<&'a ArchiveEntry>, String> {
    let filter = entry.map(relative_name).transpose()?;
    let mut selected = Vec::new();
    for item in entries {
        let name = relative_name(&item.path)?;
        if name.is_empty() {
            if item.is_dir {
                continue;
            }
            return Err("Empty archive entry name".into());
        }
        if filter
            .as_ref()
            .is_none_or(|filter| name == *filter || name.starts_with(&(filter.clone() + "/")))
        {
            selected.push(item);
        }
    }
    if selected.is_empty() {
        return Err("No matching archive entries".into());
    }
    Ok(selected)
}

// Inspect only actual output paths. Existing directories merge; unrelated
// files (including the archive's own volumes) do not constitute a conflict.
pub fn inspect_targets(
    archive: &Path,
    dest: &Path,
    entries: &[&ArchiveEntry],
    replace: bool,
) -> Result<Vec<ArchiveConflict>, String> {
    let archive_real = fs::canonicalize(archive).map_err(|e| e.to_string())?;
    let root_exists = match fs::metadata(dest) {
        Ok(metadata) if metadata.is_dir() => true,
        Ok(_) => return Err(format!("ARCHIVE_TYPE_CONFLICT|{}", dest.display())),
        Err(e) if e.kind() == ErrorKind::NotFound => false,
        Err(e) => return Err(e.to_string()),
    };
    let mut cache: HashMap<PathBuf, Option<bool>> = HashMap::new();
    let mut conflicts = Vec::new();
    for entry in entries {
        let name = relative_name(&entry.path)?;
        if !root_exists {
            continue;
        }
        let components: Vec<_> = name.split('/').collect();
        let mut target = dest.to_path_buf();
        let mut missing_parent = false;
        for (index, component) in components.iter().enumerate() {
            target.push(component);
            let should_be_dir = index + 1 < components.len() || entry.is_dir;
            if missing_parent {
                continue;
            }
            let kind = if let Some(kind) = cache.get(&target) {
                *kind
            } else {
                let kind = match fs::symlink_metadata(&target) {
                    Ok(metadata) if metadata.file_type().is_symlink() => {
                        return Err(format!("ARCHIVE_TYPE_CONFLICT|{}", target.display()));
                    }
                    Ok(metadata) => Some(metadata.is_dir()),
                    Err(e) if e.kind() == ErrorKind::NotFound => None,
                    Err(e) => return Err(e.to_string()),
                };
                cache.insert(target.clone(), kind);
                kind
            };
            match kind {
                None => missing_parent = true,
                Some(is_dir) if is_dir != should_be_dir => {
                    return Err(format!("ARCHIVE_TYPE_CONFLICT|{}", target.display()));
                }
                Some(false) if !should_be_dir => {
                    let target_real = fs::canonicalize(&target).map_err(|e| e.to_string())?;
                    let protected_input = target_real == archive_real
                        || (target_real.parent() == archive_real.parent()
                            && super::resolve_archive_volume(&target)
                                .ok()
                                .and_then(|p| fs::canonicalize(p).ok())
                                .as_ref()
                                == Some(&archive_real));
                    if protected_input && replace {
                        return Err(format!("ARCHIVE_SOURCE_CONFLICT|{}", target.display()));
                    }
                    conflicts.push(ArchiveConflict {
                        entry_path: entry.path.clone(),
                        target_path: target.to_string_lossy().into(),
                        protected_input,
                    });
                }
                _ => {}
            }
        }
    }
    Ok(conflicts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestDir;
    fn entry(path: &str, dir: bool) -> ArchiveEntry {
        ArchiveEntry {
            name: path.into(),
            path: path.into(),
            is_dir: dir,
            size: 1,
            modified: String::new(),
            encrypted: false,
        }
    }
    #[test]
    fn unrelated_files_and_existing_directories_are_not_conflicts() {
        let temp = TestDir::new("archive-unrelated");
        let archive = temp.0.join("source.7z.001");
        fs::write(&archive, b"volume").unwrap();
        fs::write(temp.0.join("source.7z.002"), b"volume").unwrap();
        fs::write(temp.0.join("other.txt"), b"keep").unwrap();
        fs::create_dir(temp.0.join("folder")).unwrap();
        let items = [entry("folder", true), entry("folder/new.txt", false)];
        assert!(
            inspect_targets(&archive, &temp.0, &items.iter().collect::<Vec<_>>(), false)
                .unwrap()
                .is_empty()
        );
        assert_eq!(fs::read(temp.0.join("other.txt")).unwrap(), b"keep");
    }
    #[test]
    fn conflicts_show_full_nested_output_paths_and_respect_member_selection() {
        let temp = TestDir::new("archive-real-conflicts");
        let archive = temp.0.join("source.zip");
        fs::write(&archive, b"archive").unwrap();
        fs::create_dir(temp.0.join("folder")).unwrap();
        fs::write(temp.0.join("folder/same.txt"), b"old").unwrap();
        fs::write(temp.0.join("other.txt"), b"old").unwrap();
        let items = [
            entry("folder", true),
            entry("folder/same.txt", false),
            entry("other.txt", false),
        ];
        let selected = selected_entries(&items, Some("folder/same.txt")).unwrap();
        let result = inspect_targets(&archive, &temp.0, &selected, false).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].entry_path, "folder/same.txt");
        assert_eq!(
            Path::new(&result[0].target_path),
            temp.0.join("folder/same.txt")
        );
    }
    #[test]
    fn file_directory_type_conflicts_never_replace_existing_content() {
        let temp = TestDir::new("archive-type-conflict");
        let archive = temp.0.join("source.zip");
        fs::write(&archive, b"archive").unwrap();
        fs::create_dir(temp.0.join("folder")).unwrap();
        fs::write(temp.0.join("folder/keep.txt"), b"keep").unwrap();
        let items = [entry("folder", false)];
        assert!(
            inspect_targets(&archive, &temp.0, &items.iter().collect::<Vec<_>>(), true)
                .unwrap_err()
                .starts_with("ARCHIVE_TYPE_CONFLICT|")
        );
        fs::write(temp.0.join("blocked"), b"existing file").unwrap();
        let items = [entry("blocked/new.txt", false)];
        assert!(
            inspect_targets(&archive, &temp.0, &items.iter().collect::<Vec<_>>(), false).is_err()
        );
        assert_eq!(fs::read(temp.0.join("folder/keep.txt")).unwrap(), b"keep");
    }
    #[test]
    fn replacing_an_input_volume_is_rejected_but_keep_both_remains_possible() {
        let temp = TestDir::new("archive-source-conflict");
        let archive = temp.0.join("source.7z.001");
        fs::write(&archive, b"first").unwrap();
        fs::write(temp.0.join("source.7z.002"), b"second").unwrap();
        let items = [entry("source.7z.002", false)];
        let selected = items.iter().collect::<Vec<_>>();
        assert!(inspect_targets(&archive, &temp.0, &selected, false).unwrap()[0].protected_input);
        assert!(
            inspect_targets(&archive, &temp.0, &selected, true)
                .unwrap_err()
                .starts_with("ARCHIVE_SOURCE_CONFLICT|")
        );
        assert_eq!(fs::read(temp.0.join("source.7z.002")).unwrap(), b"second");
    }
    #[test]
    fn archive_entries_cannot_escape_the_selected_destination() {
        for name in [
            "../outside.txt",
            "folder/../../outside.txt",
            "/absolute.txt",
            r"C:\absolute.txt",
            r"\\server\share\file",
        ] {
            assert!(relative_name(name).is_err(), "{name}");
        }
        assert_eq!(
            relative_name("./folder\\file.txt").unwrap(),
            "folder/file.txt"
        );
    }
}
