# RHFiles for Android

A separate, self-contained Android application. It shares the *ideas* of the
desktop project — fast enumeration, search-first navigation, no ads, no
telemetry — but not its code: the desktop backend is Win32/COM bound.

## Status

Work in progress. See [`../docs/ANDROID.md`](../docs/ANDROID.md) for the feature
boundary, permission model and milestones.

## Requirements

- Android SDK (`ANDROID_HOME`) with platform 34+ and build-tools 34+
- Android NDK 27+ (`ANDROID_NDK_ROOT` / `NDK_HOME`)
- JDK 17+ (`JAVA_HOME`)
- Rust Android targets: `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android`
- `cargo install tauri-cli --version "^2"` (provides `cargo tauri`)

## Commands

Run the tests/build helpers from the repository root. See docs/ANDROID.md for
current functionality, limitations and device acceptance steps.

```powershell
cargo test --manifest-path android/src-tauri/Cargo.toml --lib --tests
node --test android/web/tests/format.test.js
node android/web/tests/ui-check.mjs
pwsh -File scripts/android-build.ps1 -Target aarch64
```

The APK is written to `android/src-tauri/gen/android/app/build/outputs/apk/`
and verified before copying to `android/dist/`.

## Layout

```
android/
  src-tauri/        Rust backend (this crate) + tauri.conf.json
    src/            commands, indexer, reverse server
  web/              Mobile-first frontend: plain HTML/CSS/JS, no bundler
  src-tauri/gen/android/  Generated Gradle project (not committed)
  gradle/           Canonical Kotlin activity and build configuration
  manifest/         Permissions and FileProvider scope
```
