# Release-only Android SMB updater regression

This is a real, read-only SMB2 server, not a mock of the updater. It listens only
on loopback port 1445, shares only a dedicated `test-artifacts` folder, and uses
synthetic `qa` / `qa-pass` credentials. No Windows accounts, services, firewall,
SMB configuration or real user credentials are modified. .NET 10 is required.

1. Prepare a directory under `test-artifacts` containing `update.apk` and an
   Android feed (`releases.android.json`, schema 1). Advertise version 0.1.8,
   versionCode 1008, but use the real signed 0.1.7 APK as the asset. Set its
   exact size and SHA-256. This tests download and identity rejection without
   opening the package installer. Never publish this synthetic feed.
2. `dotnet build scripts/testing/smb-server/SmbFixture.csproj -c Release`
3. Run `dotnet scripts/testing/smb-server/bin/Release/net10.0/SmbFixture.dll ABSOLUTE_FIXTURE_DIRECTORY`.
4. On an emulator only: `adb -s SERIAL reverse tcp:1445 tcp:1445`.
5. Build the instrumentation APK using the generated Android Gradle project:
   `:app:assembleUniversalReleaseAndroidTest -PrhfilesReleaseProbe=true -PabiList=arm64-v8a`
   (run `scripts/android-sync.ps1` first; skip the four Rust build tasks when a
   verified main APK was already built).
6. Install the actual signed/minified release APK and the instrumentation APK.
   Run `adb -s SERIAL shell am instrument -w -r com.railgunhamster.rhfiles.test/com.railgunhamster.rhfiles.SmbUpdateInstrumentation`.
   Require **pass=true** and **INSTRUMENTATION_CODE: -1**, not just shell exit 0.
   The runner rejects physical devices. It changes only the emulator app's
   connection and updater settings.
7. Baseline: install released 0.1.6 and add `-e expect constructor` to reproduce
   the reflection-constructor failure. Then cover-install 0.1.7 and run normally.
8. Stop only this fixture server and remove the emulator port reverse afterward.

Verified 2026-10-15: 0.1.6 reproduces the reported constructor error; 0.1.7 reads
the feed, transfers all 11,466,495 bytes, verifies SHA-256 and rejects the
deliberate APK version mismatch. Release unit suite: 53 tests, 0 failures.
