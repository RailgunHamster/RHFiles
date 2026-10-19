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
node --test android/web/tests/*.test.cjs android/web/tests/format.test.js
node android/web/tests/ui-check.mjs
node android/web/tests/flow-check.mjs
node android/web/tests/network-check.mjs
node android/web/tests/media-check.mjs
node android/web/tests/config-sync-check.mjs
node android/web/tests/transfer-display-check.mjs
pwsh -File scripts/android-build.ps1 -Target aarch64
```

The APK is written to `android/src-tauri/gen/android/app/build/outputs/apk/`
and verified before copying to `android/dist/`.

Browser suites mock IPC; they do not establish that a device can decode or stream
media. The transfer-display suite checks readable Chinese in move/task UI while
asserting backend destinations remain byte-for-byte original URIs. Instrumentation
mode `wallpaper` validates a real image snapshot, FileProvider MIME and the system
crop intent in the minified APK, intercepting launch so no wallpaper is changed.
`SmbUpdateInstrumentation` mode `media` exercises the minified release APK
against the read-only loopback fixture (`scripts/testing/smb-server`, port 1445),
including distinct package icons, SMB image decoding, repeated folder reads,
decoded local/SMB video frames, initially hidden controls, seeking and Next. Run
only on an owned emulator, with `adb -s <serial> reverse tcp:1445 tcp:1445` and the
owned `RHFiles-Media-QA-1.mp4` / `RHFiles-Media-QA-2.mp4` fixtures in Downloads.
`scripts/testing/prepare-android-media.ps1 -EmulatorSerial emulator-5582` creates
these synthetic fixtures with ffmpeg and transfers them only after verifying an
emulator. Start the read-only .NET fixture server with its printed directory.
The second video is blue rather than the first test pattern, so preserving an old
surface frame cannot pass the Next test. The image fixtures include EXIF rotation.
Build the test APK with `-PrhfilesReleaseProbe` and require both `pass=true` and
`INSTRUMENTATION_CODE: -1`; an adb exit code alone is not success.

Network image previews are memory-only, capped at 24 MiB and downsampled to a
maximum 1920-pixel edge (192 for list thumbnails). Device image codecs apply;
animated images currently show a still frame. Remote videos/audio stream through
Media3 with SMB positional reads, FTP REST or WebDAV HTTP Range. A server without
range support reports a seek error rather than silently downloading from byte 0.
Manual download remains available. Read-only SMB browsing reuses bounded idle
sessions but never caches directory contents or changes write-task close rules.

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
