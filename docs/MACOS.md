# macOS preview / Mac 预览版

RHFiles shares its desktop UI and Rust file-operation engine between Windows and macOS. On Mac it uses WKWebView, AppKit and Foundation, not WebView2, Windows executables or a compatibility layer.

## Download and build / 下载与构建

The `macOS build and file business tests` workflow builds separate Apple Silicon (`macos-15`, arm64) and Intel (`macos-15-intel`, x86_64) artifacts. Download from a successful run: an application ZIP and a DMG. Put `RHFiles.app` in Applications. Minimum deployment target: macOS 12.

目前是开发预览构建：只有 ad-hoc 签名，没有 Developer ID / Apple 公证。Gatekeeper 可能阻止首次运行；仅在核实来源后使用系统的“隐私与安全性 → 仍要打开”。不要关闭系统全局安全检查。正式公证发行和签名自动更新需要另外配置 Apple 开发者证书。

Build on a Mac with Xcode Command Line Tools, Rust and Node.js 22+:

```sh
npm ci --ignore-scripts
cargo test --workspace --locked
bash scripts/build-macos.sh
```

The script generates the current icon's ICNS representation and builds `target/release/bundle/`. Windows cannot perform the native Cocoa link or run the Mac app.

## Platform behavior / 平台行为

- Tabs, independent dual panes, layouts, favorites, tags, themes, previews, tasks and undo use the shared UI.
- POSIX paths, `~/`, Unicode and `file:///` are accepted. Addressing a file opens its parent and selects it. Path comparison preserves case for case-sensitive volumes.
- Finder reveal/open, Terminal/iTerm, VS Code, system Open With, Quick Look and system sharing use macOS services. Application bundles open as applications on double-click/keyboard activation; their context menu can still browse their contents.
- File clipboard uses NSPasteboard file URLs and interoperates with Finder. RHFiles cut uses its own cut marker; Finder itself normally copies files. Finder drops into a pane, folder, sidebar or tab use the same copy/move confirmation. Cross-RHFiles HTML dragging remains available.
- Normal deletion uses the system Trash, never an implicit permanent-delete fallback. Undo records the actual Trash location and refuses to overwrite a new occupant. Permanent deletion keeps the existing two-confirmation workflow.
- Copy preserves POSIX permissions, timestamps, ACLs and extended attributes using Apple's metadata-copy API. Symbolic links are copied as links, including dangling links; directory cycles are not traversed. Unsupported filesystem operations report an error rather than silently dropping metadata.
- Mounted volumes, iCloud Drive and File Provider directories appear as locations. Enter `smb://server/share` to open the system connection dialog, then browse the mounted share under `/Volumes` (refresh after connecting). Authentication is handled by macOS; do not embed passwords in URLs.
- Current-folder search uses the built-in Pinyin/initials/wildcard/regex engine. Global scope currently means the user's home folder, not a Spotlight-wide index. Scanning is bounded to five seconds / 100,000 visited entries and may return partial results.
- Use Command for copy/paste, tabs, settings and undo. Delete: Command+Backspace; permanently delete: Command+Option+Backspace. Control+Tab still cycles tabs; Alt+[ / Alt+] cycle typed-search matches. Bindings remain configurable.

## Dependencies and limitations / 依赖与边界

Windows-only Everything, Explorer/Open-Save companion, NTFS stream tools, Windows ACL UI, Bandizip/WinRAR integration and Velopack feeds are not used on Mac. No Windows binaries are bundled in the Mac application.

ZIP creation and standard previews are built in. Additional archive browsing/extraction, media conversion and disk usage analysis need native tools:

```sh
brew install sevenzip ffmpeg dust
```

Executable discovery includes `/opt/homebrew/bin` and `/usr/local/bin`, so Finder launches do not depend on shell startup files. FFmpeg and 7-Zip paths/arguments can also be configured in Settings. Media codecs remain subject to the system WebView's capabilities.

The SFTP engine statically links its OpenSSL dependency on Mac; it does not require the build machine's Homebrew libraries at runtime. The package includes OpenSSL's license, and packaging verifies the application signature and checks for external absolute dylib dependencies.

Updates are **manual** for now: quit RHFiles, replace the `.app`, reopen. Never run Windows `Update.exe` or use a Windows portable feed. Bundled version history remains readable offline. The Mac settings link opens the build downloads.

用户数据保存在 `~/Library/Application Support/RHFiles`，与其他 macOS 账号独立；系统 WebKit 缓存由 WebKit 管理。当前不按 macOS Spaces 自动拆分数据，也不调用非公开 Spaces 接口。

文件夹打不开时，先检查“系统设置 → 隐私与安全性 → 文件与文件夹”的授权。系统受保护位置可能需要用户自行授予完全磁盘访问权限；RHFiles 不提权、不修改权限以绕过保护。Finder 属性窗口可能请求自动化授权。

## Verification / 验证

CI runs the shipped frontend functions plus native Mac filesystem tests on both architectures: non-overwriting rename, case-only rename, batch rollback, byte-exact copies, tree copies, interrupted-transfer recovery, links, extended attributes, Trash/undo and permission preservation. The clipboard protocol test uses a private named pasteboard, never the user's system clipboard. Test fixtures are isolated; the Trash test trashes and restores only its own uniquely named file.

Passing build/unit tests is not GUI certification. On a real Mac, still verify first-launch permissions, Finder clipboard/dragging, tab-hover switching, Retina drop coordinates, system Share/Open With, network mounts, playback and multi-monitor/Dock restore. SMB, cloud accounts and other third-party apps require the user's environment and are not claimed covered by CI.
