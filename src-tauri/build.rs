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

fn enable_common_controls_for_all_windows_targets() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }

    // Tauri embeds this activation context in the application executable, but
    // Cargo's unit-test executable does not receive Tauri's app resources. A
    // generic linker dependency keeps native dialogs available in both targets
    // and prevents the test process from failing to load TaskDialogIndirect.
    let output = PathBuf::from(env::var("OUT_DIR").expect("build output directory"));
    let manifest = output.join("common-controls.manifest");
    fs::write(
        &manifest,
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*" />
    </dependentAssembly>
  </dependency>
</assembly>
"#,
    )
    .expect("write common-controls manifest");
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}

fn main() {
    enable_common_controls_for_all_windows_targets();
    generate_release_history();
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("failed to run Tauri build script");
}
