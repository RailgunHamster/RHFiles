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
2. Android explicitly stores `bundle.android.versionCode` (initial explicit baseline: 1022) in
   its Tauri configuration. Increment this integer for every new published APK
   version. Do not derive it from the desktop version, dates or a developer's
   local build count. All ABIs for one release share the same version/code/key.
3. Build from the intended commit. `android-build.ps1` checks APK package ID,
   versionName, versionCode, ABI, build freshness and signing identity.
   `publish-android.ps1` rejects source/APK mismatches and conflicting or
   decreasing history. Production publishing rejects update-probe packages.
4. Publish packages before their feed. Verify anonymous downloads and hashes
   from CNB and GitHub, including the exact feed route used by clients.
   Preserve GitHub's Windows Latest marker when publishing Android. CNB's
   repository-wide latest must retain both platform feeds and Windows history.
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
Velopack is Windows-only; Android uses its separate APK feed. Family-server
update sources have been retired; ordinary SMB/WebDAV file shares are unrelated.

## Local portable package

From the repository root:

```powershell
.\scripts\package-velopack.ps1
```

Stage the package locally, then publish with the CNB/GitHub scripts below. Do
not publish an update directory to a family-server UNC path. Old local archive
copies are not update sources and do not need to be deleted.

The script reads the version from `src-tauri/Cargo.toml`, builds `target\release\rhfiles.exe`, stages the bundled Everything, dust, FFmpeg, and 7-Zip (`prepare-ffmpeg.ps1` / `prepare-7zip.ps1` download and verify pinned copies into `src-tauri\thirdparty`), downloads the previous GitHub release when available, and runs `vpk pack`. The resulting `releases.win.json`, `release-history.json`, and NuGet packages must stay beside each other in the update feed. `release-history.json` is generated from every semantic-versioned file in `docs/release-notes`; packaging fails if the current version has no notes.

The packaging machine needs .NET 8 and Velopack CLI 1.2.0:

```powershell
dotnet tool install --global vpk --version 1.2.0
```

## GitHub release

Keep the version in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` aligned, add `docs/release-notes/<version>.md`, then push an annotated `v<version>` tag. `.github/workflows/release.yml` packages and publishes the release, including the cumulative history asset used by the Settings client. It downloads the previous package first so Velopack can generate a delta when possible.

Local publishing and the CI fallback both use `scripts/publish-windows-github.ps1`. Before a new Windows draft becomes repository-wide Latest, the publisher stages the newest stable Android feed **and its verified APKs** so older Android clients can still update. It rejects corrupt/mismatched payloads, uses semantic version ordering and rechecks the Android snapshot before promotion; a concurrent Android release leaves the Windows release as a draft. Windows payloads remain immutable. Only an older Android index in an unpublished draft can be replaced, with a recovery rename/rollback. CNB publishing remains local and separate.

本地和 CI 的 GitHub 发布统一走上述脚本：先带上已核验的安卓清单和 APK，再切换 Windows Latest，避免安卓检查更新 404。若安卓在上传期间又发布了新版本，Windows 保持草稿，刷新清单后再提交；不覆盖已发布的安装包。该流程不使用 Gitee 账号或令牌。

The first Velopack portable build is a bootstrap release: users of the old hand-made ZIP must replace it once. Every Velopack release after that can update itself.

## CNB updates / CNB 更新（默认）

New clients use `https://cnb.cool/railgunhamster/RHFiles` by default, with GitHub
as the other selectable source. Retired Gitee/family-server update settings and
addresses are migrated away, including old imported backups. Disabled automatic
checks, proxy settings and explicit GitHub choices are preserved. No ordinary
SMB/WebDAV connection or device group is removed by this migration.

按用户选择，CNB 与 GitHub 分开处理；CNB 的发布令牌只留在本机，不添加到
GitHub Actions，也不打入客户端。首次在 Windows 本机交互式保存令牌：

```powershell
pwsh -NoProfile -File ./scripts/set-cnb-token.ps1
```

输入不回显；默认文件为 `%LOCALAPPDATA%\RHFiles-Publishing\cnb-token.xml`，
由当前 Windows 用户的 DPAPI 加密。不能拷贝给另一个账号直接解密。
`cnb-git-credential.ps1` 仅响应 `https://cnb.cool` 的 Git 凭据管道；不要手动
执行它来打印凭据。Git remote 只存普通仓库 URL，不放令牌。

Verified, signed/ordinary packages are published separately from building. Pass
the **full original build commit**, including when mirroring an existing stable
release; never silently rebuild under an already published version number:

```powershell
pwsh -NoProfile -File ./scripts/publish-cnb.ps1 -Platform Windows -Directory ./dist/production-<version> -Commit <full-build-sha>
pwsh -NoProfile -File ./scripts/publish-cnb.ps1 -Platform Android -Directory <verified-apk-staging> -Commit <full-build-sha>
```

CNB 的 repository-wide latest 由两端共用。每次新发行都保留另一端清单及
Windows 累计日志，安装包始终走各自的不可变版本标签，不复制到另一端的
发行版。脚本先暂存 prerelease，再匿名下载核验字节数及 SHA-256，确认上传
期间最新清单没有变化后才晋升；最后核验客户端实际使用的 latest 地址。
同一台机器使用本地发布锁，不同机器也应避免并发发布。

- Indexes: `/-/releases/latest/download/releases.win.json`,
  `releases.android.json`, `release-history.json`.
- Payloads: `/-/releases/download/v<desktop-version>/<file>` and
  `/-/releases/download/android-v<android-version>/<file>`.
- Redirected/signed object-storage URLs are never persisted in a feed. Each
  request starts at the stable CNB URL. Downloads carry **no API credential**.
- Uploads use `overwrite=false`, `ttl=0` (permanent); confirmation is POST per
  the [official OpenAPI](https://docs.cnb.cool/zh/develops/openapi.html). Requests
  with uncertain write outcomes stop instead of automatically replaying them.
- A rerun re-reads and verifies existing immutable attachments. Conflicts,
  channel races or incomplete stable releases stop without overwriting or
  deleting anything. Verification files are retained for diagnosis.

Older released clients still show their old sources until a new client is
installed; mirroring a package does not change the code inside it. Legacy Gitee
publishing scripts are retained only for recovering old releases, not as the
normal/default publication path. This does not enable CNB CI or a paid budget.

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

## Android: CNB and GitHub

Android uses a separate version and `releases.android.json`, not the Windows
Velopack feed. Build with `scripts/android-build.ps1`, then stage the signed APK
with `scripts/publish-android.ps1 -OutputDirectory <local-staging>` and
`-NotesFile android/release-notes.txt`. Seed staging with the existing cumulative
Android feed to preserve history. The publisher verifies package/ABI/version and
the existing signing certificate, publishes the APK first and the feed last.

Push the release source commit to the intended remotes, then publish the same bytes:

```powershell
./scripts/publish-cnb.ps1 -Platform Android -Directory <local-staging> -Commit <full-sha>
./scripts/publish-android-github.ps1 -Directory <local-staging> -Commit <full-sha>
```

CNB defaults to the public `railgunhamster/RHFiles` repository; credentials and
publication checks are described above. GitHub retains its older-client
compatibility sidecar on Windows Latest without modifying Windows packages.

New Android installations default to CNB. Explicit GitHub choices are preserved;
retired Gitee/family-server choices migrate to CNB. Both selectable sources
require no publishing token on the phone. All released distributions must
retain project LICENSE/NOTICE and the separate third-party notices.

For slow simultaneous platform uploads, `publish-android-github.ps1 -StageOnly`
may prepare verified Android draft assets without publishing or changing Latest.
After Windows publishing completes, invoke it normally to verify/reuse those
same bytes, publish Android, and update the compatibility sidecar on the current
Windows Latest. Do not run the two final promotion steps concurrently.

