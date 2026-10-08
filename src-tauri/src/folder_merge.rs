//! Plan a directory merge without replacing either directory. Each planned
//! entry uses the normal journaled transfer engine; existing parents are never
//! submitted to whole-directory replacement or whole-directory undo.
use serde::Serialize;
use std::{fs, io::ErrorKind, path::Path};
use tauri::Emitter;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeEntry {
    pub src: String,
    pub dest: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePlan {
    pub entries: Vec<MergeEntry>,
    pub source_directories: Vec<String>,
}

fn is_real_directory(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(metadata.is_dir() && !metadata.file_type().is_symlink()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("Cannot inspect {}: {error}", path.display())),
    }
}

fn plan_merge_checked(
    src: &Path,
    dest: &Path,
    check: &impl Fn(&Path) -> Result<(), String>,
) -> Result<Option<MergePlan>, String> {
    if !is_real_directory(src)? || !is_real_directory(dest)? {
        return Ok(None);
    }
    let source_real = fs::canonicalize(src).map_err(|error| error.to_string())?;
    let target_real = fs::canonicalize(dest).map_err(|error| error.to_string())?;
    if source_real.starts_with(&target_real) || target_real.starts_with(&source_real) {
        return Err("A folder cannot be merged into itself, its parent or its descendant".into());
    }
    let mut plan = MergePlan {
        entries: Vec::new(),
        source_directories: Vec::new(),
    };
    fn visit(
        src: &Path,
        dest: &Path,
        plan: &mut MergePlan,
        depth: usize,
        check: &impl Fn(&Path) -> Result<(), String>,
    ) -> Result<(), String> {
        check(src)?;
        if depth > 256 {
            return Err("Folder nesting is too deep to merge".into());
        }
        if is_real_directory(src)? && is_real_directory(dest)? {
            plan.source_directories
                .push(src.to_string_lossy().into_owned());
            let mut children = fs::read_dir(src)
                .map_err(|error| format!("Cannot read {}: {error}", src.display()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?;
            children.sort_by_key(|entry| entry.file_name());
            for child in children {
                visit(
                    &child.path(),
                    &dest.join(child.file_name()),
                    plan,
                    depth + 1,
                    check,
                )?;
            }
        } else {
            // Keep absent subtrees whole so empty directories, permissions and
            // timestamps are preserved by the existing transfer engine.
            plan.entries.push(MergeEntry {
                src: src.to_string_lossy().into_owned(),
                dest: dest.to_string_lossy().into_owned(),
            });
        }
        Ok(())
    }
    visit(src, dest, &mut plan, 0, check)?;
    Ok(Some(plan))
}

#[tauri::command(async)]
pub fn plan_folder_merge(
    src: String,
    dest: String,
    operation: String,
    operation_id: String,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, crate::types::CancelFlag>,
) -> Result<Option<MergePlan>, String> {
    cancel.reset(Some(&operation_id))?;
    let last_emit =
        std::cell::Cell::new(std::time::Instant::now() - std::time::Duration::from_secs(1));
    let result = plan_merge_checked(Path::new(&src), Path::new(&dest), &|path| {
        if cancel.is_cancelled(Some(&operation_id))? {
            return Err("Cancelled".into());
        }
        if last_emit.get().elapsed() >= std::time::Duration::from_millis(150) {
            last_emit.set(std::time::Instant::now());
            let _ = app.emit(
                "op-progress",
                serde_json::json!({"operationId":operation_id,"operation":operation,
                "src":src,"dest":dest,"currentPath":path,"status":"calculating"}),
            );
        }
        Ok(())
    });
    cancel.clear(Some(&operation_id));
    result
}

#[derive(Debug, Serialize)]
pub struct EmptyFolderCleanup {
    pub removed: Vec<String>,
    pub errors: Vec<String>,
}

fn remove_empty(paths: Vec<String>) -> EmptyFolderCleanup {
    let mut paths = paths;
    paths.sort_by_key(|path| std::cmp::Reverse(Path::new(path).components().count()));
    paths.dedup();
    let mut result = EmptyFolderCleanup {
        removed: Vec::new(),
        errors: Vec::new(),
    };
    for path in paths {
        // remove_dir removes only an empty directory, never its descendants.
        match fs::remove_dir(&path) {
            Ok(()) => result.removed.push(path),
            Err(error)
                if matches!(
                    error.kind(),
                    ErrorKind::NotFound | ErrorKind::DirectoryNotEmpty
                ) => {}
            Err(error) => result.errors.push(format!("{path}: {error}")),
        }
    }
    result
}

#[tauri::command(async)]
pub fn remove_empty_merge_folders(
    paths: Vec<String>,
    cancel: tauri::State<'_, crate::types::CancelFlag>,
) -> Result<EmptyFolderCleanup, String> {
    let _operation = cancel.begin("merge-cleanup")?;
    Ok(remove_empty(paths))
}

#[tauri::command(async)]
pub fn ensure_merge_folder(
    path: String,
    cancel: tauri::State<'_, crate::types::CancelFlag>,
) -> Result<(), String> {
    let _operation = cancel.begin("merge-undo")?;
    if is_real_directory(Path::new(&path))? {
        return Ok(());
    }
    fs::create_dir(&path).map_err(|error| format!("Cannot restore folder {path}: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestDir;
    fn plan_merge(src: &Path, dest: &Path) -> Result<Option<MergePlan>, String> {
        plan_merge_checked(src, dest, &|_| Ok(()))
    }

    #[test]
    fn cancelling_merge_planning_never_changes_either_tree() {
        let temp = TestDir::new("merge-cancel");
        let source = temp.0.join("source");
        let target = temp.0.join("target");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&target).unwrap();
        fs::write(source.join("file"), b"source").unwrap();
        fs::write(target.join("file"), b"target").unwrap();
        assert_eq!(
            plan_merge_checked(&source, &target, &|_| Err("Cancelled".into())).unwrap_err(),
            "Cancelled"
        );
        assert_eq!(fs::read(source.join("file")).unwrap(), b"source");
        assert_eq!(fs::read(target.join("file")).unwrap(), b"target");
    }

    #[test]
    fn merge_plan_keeps_existing_parents_and_includes_hidden_files_empty_and_nested_trees() {
        let temp = TestDir::new("merge-plan");
        let source = temp.0.join("source");
        let target = temp.0.join("target");
        fs::create_dir_all(source.join("shared/deep")).unwrap();
        fs::create_dir_all(target.join("shared/deep")).unwrap();
        fs::create_dir_all(source.join("new/empty")).unwrap();
        for name in ["same.txt", ".hidden", "中文.txt"] {
            fs::write(source.join("shared/deep").join(name), name).unwrap();
        }
        fs::write(target.join("keep.txt"), b"keep").unwrap();
        fs::write(target.join("shared/deep/same.txt"), b"old").unwrap();
        let plan = plan_merge(&source, &target).unwrap().unwrap();
        assert_eq!(plan.entries.len(), 4);
        assert_eq!(plan.source_directories.len(), 3);
        assert!(
            plan.entries
                .iter()
                .any(|entry| Path::new(&entry.src) == source.join("new")
                    && Path::new(&entry.dest) == target.join("new"))
        );
        for name in ["same.txt", ".hidden", "中文.txt"] {
            assert!(
                plan.entries
                    .iter()
                    .any(|entry| Path::new(&entry.dest) == target.join("shared/deep").join(name))
            );
        }
        assert_eq!(fs::read(target.join("keep.txt")).unwrap(), b"keep");
        assert_eq!(
            fs::read(target.join("shared/deep/same.txt")).unwrap(),
            b"old"
        );
    }

    #[test]
    fn only_two_real_directories_merge_and_type_collisions_remain_explicit() {
        let temp = TestDir::new("merge-types");
        let source = temp.0.join("source");
        let target = temp.0.join("target");
        fs::create_dir_all(source.join("child")).unwrap();
        fs::create_dir(&target).unwrap();
        fs::write(target.join("child"), b"file instead of folder").unwrap();
        let plan = plan_merge(&source, &target).unwrap().unwrap();
        assert_eq!(plan.entries.len(), 1);
        assert_eq!(plan.entries[0].dest, target.join("child").to_string_lossy());
        assert!(
            plan_merge(&source, &target.join("child"))
                .unwrap()
                .is_none()
        );
        assert!(
            plan_merge(&source, &temp.0.join("missing"))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn merge_refuses_same_ancestor_and_descendant_folders() {
        let temp = TestDir::new("merge-recursion");
        let child = temp.0.join("child");
        fs::create_dir(&child).unwrap();
        assert!(plan_merge(&temp.0, &temp.0).is_err());
        assert!(plan_merge(&temp.0, &child).is_err());
        assert!(plan_merge(&child, &temp.0).is_err());
    }

    #[test]
    fn move_cleanup_preserves_skipped_or_failed_files_and_removes_only_empty_parents() {
        let temp = TestDir::new("merge-cleanup");
        let source = temp.0.join("source");
        let empty = source.join("empty");
        fs::create_dir_all(&empty).unwrap();
        fs::write(source.join("skipped.txt"), b"keep").unwrap();
        let result = remove_empty(vec![
            source.to_string_lossy().into(),
            empty.to_string_lossy().into(),
        ]);
        assert_eq!(result.removed, vec![empty.to_string_lossy()]);
        assert!(result.errors.is_empty());
        assert_eq!(fs::read(source.join("skipped.txt")).unwrap(), b"keep");
        fs::remove_file(source.join("skipped.txt")).unwrap();
        assert_eq!(
            remove_empty(vec![source.to_string_lossy().into()])
                .removed
                .len(),
            1
        );
    }

    #[cfg(unix)]
    #[test]
    fn directory_links_are_not_followed_or_merged() {
        let temp = TestDir::new("merge-links");
        let source = temp.0.join("source");
        let target = temp.0.join("target");
        let outside = temp.0.join("outside");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&target).unwrap();
        fs::create_dir(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, source.join("link")).unwrap();
        fs::create_dir(target.join("link")).unwrap();
        let plan = plan_merge(&source, &target).unwrap().unwrap();
        assert_eq!(plan.entries.len(), 1);
        std::os::unix::fs::symlink(&outside, temp.0.join("alias")).unwrap();
        assert!(
            plan_merge(&source, &temp.0.join("alias"))
                .unwrap()
                .is_none()
        );
    }
}
