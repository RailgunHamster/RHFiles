use super::*;
use crate::test_support::TestDir;
use std::fs;

#[test]
fn archive_round_trip_preserves_unicode_names_and_exact_member_bytes() {
    let temp = TestDir::new("zip-content");
    let source = temp.0.join("资料 📁");
    fs::create_dir_all(source.join("empty")).unwrap();
    let names = [
        "中文.txt",
        "#percent%+.txt",
        "e\u{301}.json",
        "O'Brien",
        ".gitignore",
    ];
    for name in names {
        fs::write(source.join(name), name.as_bytes()).unwrap();
    }
    let archive = temp.0.join("out.zip");
    write_archive(
        vec![source.to_string_lossy().into()],
        archive.to_string_lossy().into(),
    )
    .unwrap();
    let mut zip = zip::ZipArchive::new(fs::File::open(archive).unwrap()).unwrap();
    assert_eq!(zip.len(), 7);
    assert!(zip.by_name("资料 📁/empty/").unwrap().is_dir());
    for name in names {
        let mut bytes = Vec::new();
        zip.by_name(&format!("资料 📁/{name}"))
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        assert_eq!(bytes, name.as_bytes());
    }
}

#[test]
fn archive_refuses_existing_output_and_output_inside_source() {
    let temp = TestDir::new("zip-conflict");
    let source = temp.0.join("source");
    fs::create_dir(&source).unwrap();
    fs::write(source.join("keep"), b"keep").unwrap();
    let existing = temp.0.join("old.zip");
    fs::write(&existing, b"old archive").unwrap();
    assert!(
        write_archive(
            vec![source.to_string_lossy().into()],
            existing.to_string_lossy().into()
        )
        .is_err()
    );
    assert_eq!(fs::read(existing).unwrap(), b"old archive");
    let nested = source.join("self.zip");
    assert!(
        write_archive(
            vec![source.to_string_lossy().into()],
            nested.to_string_lossy().into()
        )
        .is_err()
    );
    assert!(!nested.exists());
    assert_eq!(fs::read(source.join("keep")).unwrap(), b"keep");
}

#[test]
fn missing_archive_input_removes_incomplete_output_not_other_files() {
    let temp = TestDir::new("zip-missing");
    let valid = temp.0.join("valid.txt");
    let archive = temp.0.join("out.zip");
    fs::write(&valid, b"safe").unwrap();
    assert!(
        write_archive(
            vec![
                valid.to_string_lossy().into(),
                temp.0.join("missing").to_string_lossy().into()
            ],
            archive.to_string_lossy().into()
        )
        .is_err()
    );
    assert!(!archive.exists());
    assert_eq!(fs::read(valid).unwrap(), b"safe");
}

#[test]
fn archive_with_duplicate_top_level_names_reports_error_and_leaves_no_partial_zip() {
    let temp = TestDir::new("zip-duplicate");
    let mut sources = Vec::new();
    for dir in ["a", "b"] {
        fs::create_dir(temp.0.join(dir)).unwrap();
        let path = temp.0.join(dir).join("same.txt");
        fs::write(&path, dir).unwrap();
        sources.push(path.to_string_lossy().into());
    }
    let archive = temp.0.join("out.zip");
    assert!(write_archive(sources, archive.to_string_lossy().into()).is_err());
    assert!(!archive.exists());
    assert_eq!(fs::read(temp.0.join("a/same.txt")).unwrap(), b"a");
    assert_eq!(fs::read(temp.0.join("b/same.txt")).unwrap(), b"b");
}
