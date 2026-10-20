# Platform versions / 平台版本维护

Windows/desktop and Android have independent release numbers. A fix on one
platform does not consume or require a release on the other. macOS currently
shares the desktop sources/version, but its Apple Silicon preview builds are
CI artifacts, not a stable Windows update feed.

Windows/桌面端与 Android 独立编号，不为了数字一致而发布没有改动的平台。
macOS 当前与桌面源码共用版本，但 Apple Silicon 预览构建仍从 CI 下载，不冒充 Windows 正式更新。

| Channel / 平台 | Version authority / 版本来源 | Git tag | Update manifest / 更新清单 |
| --- | --- | --- | --- |
| Windows / desktop | `src-tauri/tauri.conf.json` + matching `Cargo.toml` | `v<version>` | `releases.win.json` |
| Android | `android/src-tauri/tauri.conf.json` + matching `Cargo.toml` | `android-v<version>` | `releases.android.json` |

Keep existing tags. The GitHub **Latest** marker belongs to stable Windows
releases because existing desktop clients use that route. Android publishing
must use `make_latest=false`; Android clients select Android feed entries, not
the repository-wide Latest version. README provides separate platform download
entries. The Android feed mirrored on Windows Latest exists only for older
Android clients; it must not replace or alter `releases.win.json`.

保留已有标签。GitHub **Latest** 留给 Windows，避免旧版桌面更新地址失效；
Android 发布不得抢占它。Android 客户端读取自己的清单，不比较桌面版本号。
Windows Latest 中的 Android 清单/附件只是兼容旧手机版，不能混入 Windows 更新清单。

## Release checklist / 发布检查

1. Bump only the affected platform's stable `major.minor.patch` version. Update
   its Cargo package/lock entry and Tauri configuration together; add its own
   release notes. Before 1.0, patches remain sequential; meaningful incompatible
   changes may advance minor, without resetting Android's installation counter.
2. Android explicitly stores `bundle.android.versionCode` (currently 1022) in
   its Tauri configuration. Increment this integer for every new published APK
   version. Do not derive it from the desktop version, dates or a developer's
   local build count. All ABIs for one release share the same version/code/key.
3. Build from the intended commit. `android-build.ps1` checks APK package ID,
   versionName, versionCode, ABI, build freshness and signing identity.
   `publish-android.ps1` rejects source/APK mismatches and conflicting or
   decreasing history. Production publishing rejects update-probe packages.
4. Publish packages before their feed. Verify anonymous downloads and hashes
   from both Gitee and GitHub, including the exact feed route used by clients.
   Preserve the Windows Latest marker when publishing Android.
5. Never overwrite a published version's APK/package bytes or move its tag.
   A correction gets a new version and Android code. A retry of the same
   immutable bytes is allowed; an incomplete/draft release is not a stable
   update. Never automatically delete drafts containing potentially useful
   assets. Investigate/confirm cleanup separately.

只递增受影响的平台；Android 安装码独立且严格递增。正式版本一旦发布，
安装包内容和标签不可覆盖，修复使用新版本。草稿不是正式更新，不自动发布或删除。
测试包、开发构建及内部安装探针不能上传正式渠道。

Read-only preflight / 只读检查：

```powershell
. ./scripts/platform-version.ps1
Get-RHFilesPlatformVersion Desktop
Get-RHFilesPlatformVersion Android
```

References: [Tauri Android versionCode](https://v2.tauri.app/reference/config/#androidconfig),
[Android versioning](https://developer.android.com/studio/publish/versioning).

## Packaging and publishing / 打包与发布

The platform policy above supplements these existing operational instructions.
Velopack and its LAN feed are Windows-only; Android uses its separate APK feed.

## Local portable package

From the repository root:

```powershell
.\scripts\package-velopack.ps1
```

To package and publish the portable archive plus update feed to the home server's `RHFiles-Releases` directory:

```powershell
.\scripts\package-velopack.ps1 -PublishDirectory '\\SERVER-HOME\Public\Software'
```

Use `-PortableName` when a particular versioned archive name must be preserved inside the feed, for example `-PortableName 'RHFiles-0.1.0-portable-x64-r2.zip'`. Publishing does not create a duplicate portable archive in the parent `Software` directory.

The script reads the version from `src-tauri/Cargo.toml`, builds `target\release\rhfiles.exe`, stages the bundled Everything, dust, FFmpeg, and 7-Zip (`prepare-ffmpeg.ps1` / `prepare-7zip.ps1` download and verify pinned copies into `src-tauri\thirdparty`), downloads the previous GitHub release when available, and runs `vpk pack`. The resulting `releases.win.json`, `release-history.json`, and NuGet packages must stay beside each other in the update feed. `release-history.json` is generated from every semantic-versioned file in `docs/release-notes`; packaging fails if the current version has no notes.

The packaging machine needs .NET 8 and Velopack CLI 1.2.0:

```powershell
dotnet tool install --global vpk --version 1.2.0
```

## GitHub release

Keep the version in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` aligned, add `docs/release-notes/<version>.md`, then push an annotated `v<version>` tag. `.github/workflows/release.yml` packages and publishes the release, including the cumulative history asset used by the Settings client. It downloads the previous package first so Velopack can generate a delta when possible.

The first Velopack portable build is a bootstrap release: users of the old hand-made ZIP must replace it once. Every Velopack release after that can update itself.

### CI reruns and packaging validation

`Velopack release` can be run manually against `main` to test the complete
Windows build/package path. Manual runs **never publish or change a tag**;
artifacts are marked `validation-only` and must not be used to replace an
already-published version with different bytes. Tag pushes still publish new
versions normally. Before rebuilding an existing tag, a read-only gate verifies
the stable release, required assets and full-package hash/size against its feed;
a complete release is a successful no-op. An incomplete/conflicting release
stops for explicit recovery rather than overwriting existing user downloads.

Previous packages download to a separate cache. Only a strictly older full
package can seed a delta; an equal/newer download is never placed into `vpk pack`
input, so rerunning packaging does not collide with the version being built.
Windows/macOS business workflows use per-ref concurrency to cancel superseded
runs, record public trigger identifiers, and ignore mobile-only/docs-only
changes that do not affect the desktop applications.

## Android: Gitee, GitHub and LAN

Android uses a separate version and `releases.android.json`, not the Windows
Velopack feed. Build with `scripts/android-build.ps1`, then stage the signed APK
with `scripts/publish-android.ps1 -OutputDirectory <local-staging>` and
`-NotesFile android/release-notes.txt`. Seed staging with the existing cumulative
Android feed to preserve history. The publisher verifies package/ABI/version and
the existing signing certificate, publishes the APK first and the feed last.

Push the release source commit to both remotes, then publish the same bytes:

```powershell
./scripts/publish-android-gitee.ps1 -Directory <local-staging> -Commit <full-sha>
./scripts/publish-android-github.ps1 -Directory <local-staging> -Commit <full-sha>
./scripts/publish-android.ps1 -OutputDirectory '\\SERVER-HOME\Public\Software\RHFiles-Releases' -NotesFile android/release-notes.txt
```

Gitee defaults to `railgunhamster/RHFiles`; its repository must be public.
Store the publishing token outside the repository, encrypted with Windows
DPAPI, at `%USERPROFILE%\.rhfiles-gitee-token.xml` (a PowerShell SecureString
export). The script never puts it in client code or download URLs. Gitee
publishing uses a temporary prerelease, immutable APK/feed attachments and
anonymous download/hash checks before promoting to stable. A failed upload can
be retried; do not overwrite same-version bytes. GitHub retains its older-client
compatibility sidecar on Windows Latest without modifying Windows packages.

New/unconfigured Android installations default to Gitee. Explicitly saved source
choices are preserved. The three sources can be changed in Android Settings;
none requires a publishing token on the phone. All released distributions must
retain project LICENSE/NOTICE and the separate third-party notices.

