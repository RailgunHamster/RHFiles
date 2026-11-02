use semver::Version;
use serde_json::json;
use std::{env, fs, path::PathBuf};

fn generate_release_history() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest directory"));
    let notes_dir = manifest_dir.join("..").join("docs").join("release-notes");
    println!("cargo:rerun-if-changed={}", notes_dir.display());
    let dates_path = notes_dir.join("published-at.json");
    println!("cargo:rerun-if-changed={}", dates_path.display());
    let dates: std::collections::BTreeMap<String,String> = serde_json::from_str(
        &fs::read_to_string(&dates_path).expect("read release publication metadata")
    ).expect("parse release publication metadata");

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
            "publishedAt": dates.get(&version.to_string()),
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
  <!-- Layered native child video surfaces require a Windows 8+ activation context. -->
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <supportedOS Id="{4a2f28e3-53b9-4441-ba9c-d69d4a4a6e38}" />
      <supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}" />
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}" />
    </application>
  </compatibility>
</assembly>
"#,
    )
    .expect("write common-controls manifest");
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}

fn main() {
    // The packaged interface is frontendDist=../src. Track it explicitly so
    // changing only JS/CSS/HTML cannot leave an old interface in a new binary.
    println!("cargo:rerun-if-changed=../src");
    println!("cargo:rerun-if-changed=../src/css");
    println!("cargo:rerun-if-changed=../src/js");
    build_update_splash();
    enable_common_controls_for_all_windows_targets();
    generate_release_history();
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("failed to run Tauri build script");
}

fn build_update_splash() {
    println!("cargo:rerun-if-changed=src/RHFilesUpdateSplash.cs");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") { return; }
    // Build from reviewed source, never compile on the user's machine or trust
    // a pre-existing executable in a predictable writable temporary directory.
    let system = PathBuf::from(env::var_os("SystemRoot").expect("Windows system directory"));
    let compiler = ["Framework64", "Framework"].into_iter()
        .map(|arch| system.join("Microsoft.NET").join(arch).join("v4.0.30319/csc.exe"))
        .find(|path| path.is_file()).expect(".NET Framework C# compiler for update splash");
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("RHFiles.UpdateSplash.exe");
    let result = std::process::Command::new(compiler)
        .args(["/nologo", "/optimize+", "/target:winexe", "/platform:anycpu", "/utf8output",
            "/r:System.dll", "/r:System.Core.dll", "/r:System.Drawing.dll", "/r:System.Windows.Forms.dll"])
        .arg(format!("/out:{}", output.display()))
        .arg(PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap()).join("src").join("RHFilesUpdateSplash.cs"))
        .output().expect("compile update splash");
    assert!(result.status.success(), "update splash compiler: {} {}",
        String::from_utf8_lossy(&result.stdout), String::from_utf8_lossy(&result.stderr));
}
