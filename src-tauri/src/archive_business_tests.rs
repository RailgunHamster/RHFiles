use super::*;
use crate::test_support::TestDir;
use std::fs;

#[test]
fn selecting_any_archive_volume_resolves_to_its_existing_entry_without_touching_sources() {
    for (selected, first) in [
        ("资料.7z.002", "资料.7z.001"), ("a.zip.003", "a.zip.001"),
        ("a.7z.1000", "a.7z.001"), ("a.7z.0002", "a.7z.0001"), ("generic.002", "generic.001"),
        ("a.z01", "a.zip"), ("a.Z02", "a.ZIP"),
        ("a.part2.rar", "a.part1.rar"), ("a.part002.rar", "a.part001.rar"),
        ("a.PART02.RAR", "a.part01.rar"), ("a.r00", "a.rar"), ("a.s01", "a.rar"),
    ] {
        let temp = TestDir::new("archive-volume-name");
        fs::write(temp.0.join(selected), b"selected part").unwrap();
        fs::write(temp.0.join(first), b"entry part").unwrap();
        let resolved = resolve_archive_volume(&temp.0.join(selected)).unwrap();
        assert_eq!(fs::canonicalize(&resolved).unwrap(), fs::canonicalize(temp.0.join(first)).unwrap());
        assert_eq!(fs::read(resolved).unwrap(), b"entry part");
        assert_eq!(fs::read(temp.0.join(selected)).unwrap(), b"selected part");
        assert_eq!(fs::read(temp.0.join(first)).unwrap(), b"entry part");
    }
}

#[test]
fn missing_entry_volume_is_explicit_and_does_not_create_a_replacement() {
    let temp = TestDir::new("missing-archive-volume");
    let path = temp.0.join("a.7z.002"); fs::write(&path, b"second part").unwrap();
    let error = resolve_archive_volume(&path).unwrap_err();
    assert!(error.starts_with("ARCHIVE_VOLUME_MISSING|"));
    assert!(error.ends_with("a.7z.001"));
    assert_eq!(fs::read_dir(&temp.0).unwrap().count(), 1);
    assert_eq!(fs::read(path).unwrap(), b"second part");
    for name in ["ordinary.zip", "notes.2026", "zero.000"] {
        let path = temp.0.join(name);
        assert_eq!(resolve_archive_volume(&path).unwrap(), path);
    }
}

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
