// Scenario mapping and platform limitations: docs/TESTING.md.
use super::*;
use crate::test_support::TestDir;
use std::{fs, os::windows::fs::OpenOptionsExt};

#[test]
fn rename_never_replaces_an_existing_file() {
    let temp = TestDir::new("rename-conflict");
    let source = temp.0.join("source.txt");
    let target = temp.0.join("target.txt");
    fs::write(&source, b"source").unwrap();
    fs::write(&target, b"target").unwrap();
    assert!(rename_file(source.to_string_lossy().into(), "target.txt".into()).is_err());
    assert_eq!(fs::read(source).unwrap(), b"source");
    assert_eq!(fs::read(target).unwrap(), b"target");
}

#[test]
fn rename_accepts_case_only_change_and_unicode() {
    let temp = TestDir::new("rename-case");
    let source = temp.0.join("note.txt");
    fs::write(&source, b"bytes").unwrap();
    rename_file(source.to_string_lossy().into(), "NOTE.txt".into()).unwrap();
    assert_eq!(
        fs::read_dir(&temp.0)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .file_name(),
        "NOTE.txt"
    );
    rename_file(
        temp.0.join("NOTE.txt").to_string_lossy().into(),
        "中文 📁.txt".into(),
    )
    .unwrap();
    assert_eq!(fs::read(temp.0.join("中文 📁.txt")).unwrap(), b"bytes");
}

#[test]
fn rename_rejects_path_traversal_and_windows_ambiguous_names_before_touching_disk() {
    let temp = TestDir::new("rename-invalid");
    fs::create_dir(temp.0.join("inner")).unwrap();
    let source = temp.0.join("inner/source.txt");
    fs::write(&source, b"keep").unwrap();
    for name in [
        "../escaped",
        "..\\escaped",
        "C:\\absolute",
        "",
        ".",
        "..",
        "CON",
        "NUL.txt",
        "LPT1",
        "COM1.dat",
        "CONIN$",
        "CONOUT$",
        "a.",
        "a ",
        "a:b",
        "a\0b",
        "a\nb",
    ] {
        assert!(
            rename_file(source.to_string_lossy().into(), name.into()).is_err(),
            "invalid name accepted: {name:?}"
        );
        assert_eq!(fs::read(&source).unwrap(), b"keep");
        assert!(!temp.0.join("escaped").exists());
    }
}

fn copy_bytes(size: usize) {
    let temp = TestDir::new("copy-bytes");
    let source = temp.0.join("源文件 📁.bin");
    let target = temp.0.join("destination.bin");
    let data: Vec<u8> = (0..size).map(|i| (i % 251) as u8).collect();
    fs::write(&source, &data).unwrap();
    copy_path_to_exact(&source, &target).unwrap();
    assert_eq!(fs::read(&target).unwrap(), data);
    assert_eq!(fs::read(&source).unwrap(), data, "copy must retain source");
}
macro_rules! byte_case {
    ($name:ident, $size:expr) => {
        #[test]
        fn $name() {
            copy_bytes($size);
        }
    };
}
byte_case!(copy_empty_file, 0);
byte_case!(copy_single_byte, 1);
byte_case!(copy_buffer_minus_one, TRANSFER_BUFFER_SIZE - 1);
byte_case!(copy_buffer_exact, TRANSFER_BUFFER_SIZE);
byte_case!(copy_buffer_plus_one, TRANSFER_BUFFER_SIZE + 1);
byte_case!(copy_several_buffers, TRANSFER_BUFFER_SIZE * 3 + 17);

#[test]
fn copy_tree_preserves_empty_directories_names_content_and_dates() {
    let temp = TestDir::new("tree");
    let source = temp.0.join("source");
    let target = temp.0.join("copy");
    fs::create_dir_all(source.join("empty/nested")).unwrap();
    fs::create_dir_all(source.join("内容")).unwrap();
    for name in [
        ".gitignore",
        "a..b",
        "résumé.txt",
        "e\u{301}.txt",
        "图 #1%+.png",
        "O'Brien.txt",
    ] {
        let path = source.join("内容").join(name);
        fs::write(&path, name.as_bytes()).unwrap();
        fs::File::options()
            .write(true)
            .open(path)
            .unwrap()
            .set_times(
                fs::FileTimes::new()
                    .set_modified(UNIX_EPOCH + std::time::Duration::from_secs(1_000_000_000)),
            )
            .unwrap();
    }
    copy_path_to_exact(&source, &target).unwrap();
    assert!(target.join("empty/nested").is_dir());
    assert_eq!(fs::read_dir(target.join("内容")).unwrap().count(), 6);
    for entry in fs::read_dir(source.join("内容")).unwrap() {
        let entry = entry.unwrap();
        let dest = target.join("内容").join(entry.file_name());
        assert_eq!(fs::read(entry.path()).unwrap(), fs::read(&dest).unwrap());
        assert_eq!(
            entry.metadata().unwrap().modified().unwrap(),
            fs::metadata(dest).unwrap().modified().unwrap()
        );
    }
}

fn conflict(source_dir: bool, target_dir: bool, moving: bool) {
    let temp = TestDir::new("conflict");
    let source = temp.0.join("source");
    let target = temp.0.join("target");
    for (path, is_dir, bytes) in [
        (&source, source_dir, b"source"),
        (&target, target_dir, b"target"),
    ] {
        if is_dir {
            fs::create_dir(path).unwrap();
            fs::write(path.join("sentinel"), bytes).unwrap();
        } else {
            fs::write(path, bytes).unwrap();
        }
    }
    let result = if moving {
        move_path_to_exact(&source, &target)
    } else {
        copy_path_to_exact(&source, &target)
    };
    assert!(
        result.is_err(),
        "existing destination must not be replaced implicitly"
    );
    assert_eq!(
        fs::read(if source_dir {
            source.join("sentinel")
        } else {
            source
        })
        .unwrap(),
        b"source"
    );
    assert_eq!(
        fs::read(if target_dir {
            target.join("sentinel")
        } else {
            target
        })
        .unwrap(),
        b"target"
    );
}
macro_rules! conflict_case {
    ($name:ident, $s:expr, $t:expr, $m:expr) => {
        #[test]
        fn $name() {
            conflict($s, $t, $m);
        }
    };
}
conflict_case!(copy_file_over_file_refused, false, false, false);
conflict_case!(copy_file_over_directory_refused, false, true, false);
conflict_case!(copy_directory_over_file_refused, true, false, false);
conflict_case!(copy_directory_over_directory_refused, true, true, false);
conflict_case!(move_file_over_file_refused, false, false, true);
conflict_case!(move_file_over_directory_refused, false, true, true);
conflict_case!(move_directory_over_file_refused, true, false, true);
conflict_case!(move_directory_over_directory_refused, true, true, true);

#[test]
fn directory_cannot_be_copied_or_moved_into_itself() {
    let temp = TestDir::new("recursive");
    let source = temp.0.join("source");
    fs::create_dir(&source).unwrap();
    fs::write(source.join("keep"), b"keep").unwrap();
    for moving in [false, true] {
        let target = source.join("child");
        let result = if moving {
            move_path_to_exact(&source, &target)
        } else {
            copy_path_to_exact(&source, &target)
        };
        assert!(result.is_err());
        assert!(!target.exists());
        assert_eq!(fs::read(source.join("keep")).unwrap(), b"keep");
    }
}

#[test]
fn same_file_and_missing_parent_are_non_destructive_errors() {
    let temp = TestDir::new("invalid-target");
    let source = temp.0.join("MixedCase.txt");
    fs::write(&source, b"keep").unwrap();
    for target in [
        source.clone(),
        temp.0.join("MIXEDCASE.TXT"),
        temp.0.join("missing/child"),
    ] {
        assert!(copy_path_to_exact(&source, &target).is_err());
        assert!(move_path_to_exact(&source, &target).is_err());
        assert_eq!(fs::read(&source).unwrap(), b"keep");
    }
}

#[test]
fn locked_source_removes_partial_copy_and_never_loses_source() {
    let temp = TestDir::new("locked");
    let source = temp.0.join("source");
    let target = temp.0.join("target");
    fs::write(&source, b"keep").unwrap();
    let lock = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&source)
        .unwrap();
    assert!(copy_path_to_exact(&source, &target).is_err());
    assert!(!target.exists());
    assert!(move_path_to_exact(&source, &target).is_err());
    assert!(!target.exists());
    drop(lock);
    assert_eq!(fs::read(source).unwrap(), b"keep");
}

#[test]
fn locked_child_rolls_back_whole_directory_copy() {
    let temp = TestDir::new("locked-child");
    let source = temp.0.join("source");
    let target = temp.0.join("target");
    fs::create_dir(&source).unwrap();
    fs::write(source.join("a-ok"), b"ok").unwrap();
    fs::write(source.join("z-locked"), b"locked").unwrap();
    let lock = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(source.join("z-locked"))
        .unwrap();
    assert!(copy_path_to_exact(&source, &target).is_err());
    assert!(
        !target.exists(),
        "partial tree must not masquerade as a complete copy"
    );
    drop(lock);
    assert_eq!(fs::read(source.join("z-locked")).unwrap(), b"locked");
}

#[test]
fn copied_read_only_file_retains_its_attribute() {
    let temp = TestDir::new("readonly");
    let source = temp.0.join("source");
    let target = temp.0.join("target");
    fs::write(&source, b"readonly").unwrap();
    let writable = fs::metadata(&source).unwrap().permissions();
    let mut readonly = writable.clone();
    readonly.set_readonly(true);
    fs::set_permissions(&source, readonly).unwrap();
    let result = copy_path_to_exact(&source, &target);
    let copied_readonly = fs::metadata(&target).is_ok_and(|m| m.permissions().readonly());
    fs::set_permissions(&source, writable.clone()).unwrap();
    if target.exists() {
        fs::set_permissions(&target, writable).unwrap();
    }
    result.unwrap();
    assert!(copied_readonly);
    assert_eq!(fs::read(target).unwrap(), b"readonly");
}

#[test]
fn move_tree_and_inverse_restore_exact_content() {
    let temp = TestDir::new("move-undo");
    let source = temp.0.join("old");
    let target = temp.0.join("new");
    fs::create_dir_all(source.join("空文件夹")).unwrap();
    fs::write(source.join("中文.txt"), b"original").unwrap();
    move_path_to_exact(&source, &target).unwrap();
    assert!(!source.exists());
    move_path_to_exact(&target, &source).unwrap();
    assert!(!target.exists());
    assert!(source.join("空文件夹").is_dir());
    assert_eq!(fs::read(source.join("中文.txt")).unwrap(), b"original");
}

// Model each durable crash boundary with real source/target/staging/backup bytes.
fn recover(phase: &str, moving: bool) {
    let temp = TestDir::new("recovery");
    let source = temp.0.join("source");
    let target = temp.0.join("target");
    let staging = temp.0.join("staging");
    let backup = temp.0.join("backup");
    let journal_path = temp.0.join("journal.json");
    let committed = matches!(phase, "targetCommitted" | "sourceRemoved");
    let backed_up = matches!(
        phase,
        "targetBackedUp" | "targetCommitted" | "sourceRemoved"
    );
    if !(moving && phase == "sourceRemoved") {
        fs::write(&source, b"new").unwrap();
    }
    if committed {
        fs::write(&target, b"new").unwrap();
    } else {
        fs::write(&staging, if phase == "copying" { b"par" } else { b"new" }).unwrap();
    }
    if backed_up {
        fs::write(&backup, b"old").unwrap();
    } else {
        fs::write(&target, b"old").unwrap();
    }
    let journal = TransferJournal {
        schema_version: 1,
        operation_id: "test".into(),
        operation: if moving { "move" } else { "copy" }.into(),
        source: source.to_string_lossy().into(),
        target: target.to_string_lossy().into(),
        staging: staging.to_string_lossy().into(),
        backup: Some(backup.to_string_lossy().into()),
        phase: phase.into(),
    };
    fs::write(&journal_path, serde_json::to_vec(&journal).unwrap()).unwrap();
    let report = recover_transfer_journal(&journal_path, &journal);
    assert_eq!(
        report.outcome,
        if !committed {
            "partialRemoved"
        } else if moving && source.exists() {
            "moveKeptBoth"
        } else {
            "completedAfterRestart"
        }
    );
    assert_eq!(
        fs::read(&target).unwrap(),
        if committed { b"new" } else { b"old" }
    );
    assert_eq!(source.exists(), !(moving && phase == "sourceRemoved"));
    if source.exists() {
        assert_eq!(fs::read(&source).unwrap(), b"new");
    }
    assert!(!staging.exists());
    assert!(!backup.exists());
    assert!(!journal_path.exists());
    // Recovery retry can alter its explanatory status, but never surviving bytes.
    recover_transfer_journal(&journal_path, &journal);
    assert_eq!(
        fs::read(target).unwrap(),
        if committed { b"new" } else { b"old" }
    );
}
macro_rules! recovery_case {
    ($name:ident, $phase:expr, $moving:expr) => {
        #[test]
        fn $name() {
            recover($phase, $moving);
        }
    };
}
recovery_case!(copy_crash_during_stream, "copying", false);
recovery_case!(copy_crash_staging_ready, "stagingReady", false);
recovery_case!(copy_crash_before_backup, "backingUpTarget", false);
recovery_case!(copy_crash_after_backup, "targetBackedUp", false);
recovery_case!(copy_crash_after_commit, "targetCommitted", false);
recovery_case!(move_crash_during_stream, "copying", true);
recovery_case!(move_crash_staging_ready, "stagingReady", true);
recovery_case!(move_crash_before_backup, "backingUpTarget", true);
recovery_case!(move_crash_after_backup, "targetBackedUp", true);
recovery_case!(move_crash_after_commit_keeps_both, "targetCommitted", true);
recovery_case!(move_crash_after_source_removed, "sourceRemoved", true);
