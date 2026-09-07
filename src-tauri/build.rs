use semver::Version;
use serde_json::json;
use std::{env, fs, path::PathBuf};

fn generate_release_history() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest directory"));
    let notes_dir = manifest_dir.join("..").join("docs").join("release-notes");
    println!("cargo:rerun-if-changed={}", notes_dir.display());

    let mut releases = Vec::new();
    for entry in fs::read_dir(&notes_dir).expect("read release notes directory") {
        let entry = entry.expect("read release note entry");
        let path = entry.path();
        if !path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
        {
            continue;
        }
        let version_text = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or_else(|| panic!("release note has a non-Unicode name: {}", path.display()));
        let version = Version::parse(version_text).unwrap_or_else(|error| {
            panic!(
                "release note must use a semantic-version file name ({}): {error}",
                path.display()
            )
        });
        println!("cargo:rerun-if-changed={}", path.display());
        let notes = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("read release note {}: {error}", path.display()));
        assert!(
            !notes.trim().is_empty(),
            "release note is empty: {}",
            path.display()
        );
        releases.push((version, notes));
    }
    assert!(!releases.is_empty(), "no release notes were found");
    releases.sort_by(|left, right| right.0.cmp(&left.0));
    let package_version = Version::parse(&env::var("CARGO_PKG_VERSION").expect("package version"))
        .expect("package version must be semantic");
    assert!(
        releases
            .iter()
            .any(|(version, _)| version == &package_version),
        "release notes are missing for package version {package_version}"
    );

    let document = json!({
        "schemaVersion": 1,
        "releases": releases.into_iter().map(|(version, notes)| json!({
            "version": version.to_string(),
            "notesMarkdown": notes,
        })).collect::<Vec<_>>(),
    });
    let output = PathBuf::from(env::var("OUT_DIR").expect("build output directory"))
        .join("release-history.json");
    fs::write(
        output,
        serde_json::to_vec(&document).expect("serialize release history"),
    )
    .expect("write embedded release history");
}

fn main() {
    generate_release_history();
    tauri_build::build()
}
