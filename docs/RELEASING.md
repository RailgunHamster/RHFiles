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
