use super::*;
use crate::test_support::TestDir;
use std::fs;

#[test]
fn zip_preserves_several_directory_levels_duplicate_names_and_empty_directories() {
    let temp = TestDir::new("zip-nested");
    let a = temp.0.join("资料 A"); let b = temp.0.join("B");
    fs::create_dir_all(a.join("one/two/empty")).unwrap(); fs::create_dir_all(b.join("one/two")).unwrap();
    fs::write(a.join("one/two/same.txt"), b"A nested").unwrap(); fs::write(b.join("one/two/same.txt"), b"B nested").unwrap();
    fs::write(a.join("same.txt"), b"A root").unwrap();
    let output = temp.0.join("tree.zip");
    write_archive(vec![a.to_string_lossy().into(), b.to_string_lossy().into()], output.to_string_lossy().into()).unwrap();
    let mut zip = zip::ZipArchive::new(fs::File::open(output).unwrap()).unwrap();
    let actual: std::collections::BTreeSet<_> = zip.file_names().map(str::to_owned).collect();
    let expected: std::collections::BTreeSet<_> = ["资料 A/", "资料 A/one/", "资料 A/one/two/", "资料 A/one/two/empty/",
        "资料 A/one/two/same.txt", "资料 A/same.txt", "B/", "B/one/", "B/one/two/", "B/one/two/same.txt"].map(str::to_owned).into();
    assert_eq!(actual, expected);
    for (path, expected) in [("资料 A/one/two/same.txt", &b"A nested"[..]), ("B/one/two/same.txt", &b"B nested"[..]), ("资料 A/same.txt", &b"A root"[..])] {
        let mut bytes = Vec::new(); zip.by_name(path).unwrap().read_to_end(&mut bytes).unwrap(); assert_eq!(bytes, expected);
    }
    assert!(zip.by_name("same.txt").is_err());
}

#[test]
fn selecting_a_folder_and_its_descendants_never_adds_the_children_at_zip_root() {
    let temp = TestDir::new("zip-overlap"); let source = temp.0.join("source");
    fs::create_dir_all(source.join("nested/deeper")).unwrap(); let child = source.join("nested/deeper/file.txt");
    fs::write(&child, b"once").unwrap();
    for reverse in [false, true] {
        let mut sources = vec![source.to_string_lossy().into(), source.join("nested").to_string_lossy().into(), child.to_string_lossy().into(), source.to_string_lossy().into()];
        if reverse { sources.reverse(); }
        let output = temp.0.join(format!("overlap-{reverse}.zip")); write_archive(sources, output.to_string_lossy().into()).unwrap();
        let mut zip = zip::ZipArchive::new(fs::File::open(output).unwrap()).unwrap(); assert_eq!(zip.len(), 4);
        assert!(zip.by_name("source/nested/deeper/file.txt").is_ok()); assert!(zip.by_name("file.txt").is_err()); assert!(zip.by_name("nested/").is_err());
    }
}

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
