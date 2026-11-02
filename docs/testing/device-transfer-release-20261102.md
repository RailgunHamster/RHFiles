# Device transfer release acceptance — 2026-11-02

Source: `a56e24cd7b4a306566f074f59fee7e69d33162ab` (transfer implementation
`d74cdf2c7854828915b6ecb76c5ef7c9ec4ff315`). Windows 0.1.97 and Android
0.1.41 / installation code 1041 have independent immutable release identities.
Both CNB and GitHub were published from these exact staged bytes. Windows keeps
GitHub Latest; the legacy Android sidecar on that release resolves to 0.1.41.
CNB Latest retains both platform feeds and the Windows cumulative history.

## Product artifacts

- Windows extracted ordinary Velopack portable executable SHA-256:
  `4a676f6a42adaa3ed36a460fa657c28b41bb0a025b122ec5855f694e87dde6a6`.
- Android production ARM64 APK SHA-256:
  `e76960d959de744f37ce4ab0f2fbd82763df31ca0ca7798c73df464331cd4433`.
- Android normal, minified x86_64 emulator APK SHA-256:
  `b981685428cd8be8f03a88dc86b265cf1cb4f32a5fa968c036421ab41d355059`.
- Both APKs retain the existing installation certificate:
  `42f3ddee0997f1e9ad09bf968ad283c66ebae87f84288de90795626756491975`.
  No update-probe version, codec/audio/surface experiment or debug runtime was
  promoted to production.

## Checks

- Shared Rust service: 97 passed; one existing LAN multicast test ignored.
- Android transfer/settings/group/file-task/backup JVM tests: 54 passed.
  Shared service also cross-checks for `aarch64-linux-android`.
- Frontend/business tests: 1774 passed against the pinned, source-only RHVideo
  reference. No real RHVideo database or media was used.
- Final Windows portable: six real-window tests passed for group browsing,
  ordinary remote operations, copy/cut/paste, conflicts/ABA, cancellation/live
  revocation, settings/scripting and actual public update/proxy routes.
- An unchanged published 0.1.96 portable's native updater discovered and
  downloaded CNB 0.1.97, checked the exact package SHA-256 and reached
  `pendingRestart=true`. No installed user instance was updated or restarted.
- Actual Android release preview workflow passed with default codec, audio
  and compositor settings. The unchanged reviewed instrumentation source hash
  was checked before reusing its separately signed test APK. Ordinary Download
  navigation, native local playback and one-Back return also passed. The exact
  installed normal APK bytes and system application version were checked.

The first Android admission attempt stopped before installing the new APK,
because the test emulator's System UI displayed a startup ANR. That failed
admission record was retained. After recovering the owned test environment and
passing the same system admission, the product workflow ran. Previous 0.1.39
decoder failures remain evidence, not a resolved root-cause claim. Physical
Android throughput, sustained multi-video playback and full RHVideo parity
are not established by this release's socket/JVM/emulator tests.

## LAN throughput scope

Two Windows hosts, WINSERVER and RAILGUNHAMSTER, explicit direct-LAN HTTPS,
synthetic 64 MiB files, isolated profiles and disposable authorized groups.
Every new output was SHA-256 verified. Remote-path relay used two physical
hosts: remote source to client to a second logical remote endpoint on the
client host, **not** three physical hosts. Results are scenario measurements,
not a guarantee for every network, disk, file size or phone.

| Operation | Published old baseline, MB/s | New two-stream rounds, MB/s |
| --- | ---: | ---: |
| LAN upload | 32.61 | 65.01 / 65.02 |
| LAN download | 43.57 | 72.36 / 72.30 |
| Remote-path relay | 12.33 | 59.34 / 58.97 |

One-stream download: 65.03 MB/s; four streams: 81.32 MB/s. Final benchmark
binary was the pre-release transfer build (SHA-256
`0bd9c185b1a1c0132a917dcbaffdf1fb35a66ba8f267dd22fd0ff569fad1b1d8`),
before the version-only release bump. Published package functionality was
then tested separately as described above. Reproduction harness:
`scripts/testing/device-throughput.mjs`, explicit executable plus
`RHFILES_REMOTE_WINDOWS_QA=1`. No production profiles, real files, SMB/DNS
settings or phone installations were involved.

Range repair is finite and confined to an active same-version read; it is not
crash-persistent job resurrection or automatic mutation replay. Media streaming
stays separate from the bounded bulk-copy scheduler. The Windows fallback
which opens a complete managed working copy in a path-only external program
still exists; this release does not claim universal download-free external
playback.
