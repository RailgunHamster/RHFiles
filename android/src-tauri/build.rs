use std::{env, fs, path::PathBuf};

fn main() {
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("failed to run the Tauri build script");
    embed_common_controls_manifest();
}

/// Embeds a Common Controls 6 activation context on Windows targets.
///
/// `tauri-build` normally provides one through its generated resource file, but
/// that resource is only linked into the *application* executable — cargo's test
/// binary does not get it, and without it `TaskDialogIndirect` cannot be
/// resolved: the IPC integration test would die at load with
/// `STATUS_ENTRYPOINT_NOT_FOUND` before a single test runs.
///
/// The manifest is therefore attached by the linker instead of through a
/// resource file, and `tauri-build` is told not to emit its own — two manifests
/// in one image make `CVTRES`/`LINK` fail with `CVT1100`/`LNK1123`.
fn embed_common_controls_manifest() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }

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
    println!(
        "cargo:rustc-link-arg=/MANIFESTINPUT:{}",
        manifest.display()
    );
}
