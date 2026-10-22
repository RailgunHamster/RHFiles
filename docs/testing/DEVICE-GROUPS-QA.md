# Device groups release QA — Windows 0.1.77 / Android 0.1.26

This release uses a clean export of the staged source. Unrelated working-tree
Android task/history changes are not included. Tests use private temporary
profiles and an RHFiles-owned Android 14 x86_64 AVD, never physical phones or
the four production computers' file-service settings.

## Coverage

- Rust workspace business/regression suite, followed by the final service
  suite: 14 unit tests + 1 real TLS group integration test + 18 protocol tests.
  The existing multicast-dependent test remains opt-in, not counted as passed.
- JavaScript business/automation suite: 328 passed; registered UI bindings gate.
- Final Android JVM suite: 231 passed, zero failures/errors.
- Real desktop WebView2 UI/HTTPS/WebDAV/startup/group E2E: 4 passed.
- Minified release APK through the public native bridge: Android Keystore P-256
  requests/authentication verified by Rust; Rust certificates and mutual server
  proof verified on Android; offline B introduces C to A without B online;
  real shared-folder listing; existing credential denied after server-local
  removal; explicit restore; service restart while the client retains its
  cached credential; client-local removal survives process restart; refresh
  cannot add it back; false confirmation rejected and true confirmation restores.
- Actual settings page member DOM is awaited before visual inspection. The AVD
  launcher produced unrelated ANR overlays under parallel build load; those are
  not app UI. Initial overloaded WebView provider startup also exceeded a Wry
  version-query timeout; after the emulator settled, fresh-app-data release
  integration completed successfully. No claim of physical-device coverage.

## Security/regression cases

Persistent local refusal across all existing/future local groups; newer server
advertisements, repeated packets and rejoin cannot clear it; removal of an
introducer blocks new introductions but retains independently accepted peers;
ordinary members cannot invite; request nonce/own-key binding; corrupt metadata
or missing private key fails closed; failed persistence does not change live
state; signature/payload tampering rejected; no private key/password/refusal/
file grant in public packets; source-IP and Origin guards remain enforced;
one-use challenge replay rejected; certificate pin + signed server identity
prevents address aliases; canonical public-key encoding prevents alternate
spellings; local grants cannot be raised by incoming certificates.

Rotating short-lived credentials retain stable tus/WebDAV ownership. New HTTP
requests reject expired sessions; already authorized large streams retain live
local-removal/grant checks instead of failing solely at credential rollover.
Service stop invalidates even old stream handles. Android retries a replayable
request only once after an authentication 401, acquiring a fresh signed session;
it never retries an arbitrary failed write or a one-shot/duplex body.

Generated group connections and their favorites are excluded from portable
configuration sync/backup. Private identity and local refusal data remain local.

## Reproduce

```powershell
cargo test --workspace --locked
npm test
cargo build -p rhfiles-tauri --locked
node --test --test-concurrency=1 scripts/e2e/device-groups.test.mjs scripts/e2e/lan-service.test.mjs
# Build signed x86_64 release and release instrumentation APK, then:
node scripts/testing/android-groups-probe.mjs emulator-N APP.apk TEST.apk
```

The Android probe checks the AVD name and qemu identity before installation and
clears only that owned emulator's RHFiles fixture data. Never target a phone.
Release ARM64 APK additionally requires package/version/code/signing certificate,
ABI and 16-KiB zip alignment verification; no Intel macOS package is produced.
