<p align="center">
  <img src="src-tauri/icons/rhfiles-icon-v4-128.png" width="96" height="96" alt="RHFiles icon">
</p>

<h1 align="center">RHFiles</h1>

<p align="center">A fast, Windows-native file manager built with Rust, Tauri, and WebView2.</p>

<p align="center"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>

RHFiles combines familiar Windows file operations with tabs, dual panes, rich previews, Everything-powered global search, Pinyin matching, disk-usage analysis, and portable in-place updates. It is designed primarily for Windows 10 and Windows 11.

## Highlights

- Tabs with history, independent dual-pane tabs, configurable shortcuts, and multi-selection.
- Details, Cards, Thumbnails, and Columns layouts with Windows file-association icons.
- Current-folder search with a bounded built-in fallback; global search powered by the bundled Everything engine.
- Chinese Pinyin and initial-letter matching, including matches inside a filename.
- Preview inspector for folders, images, text/source code, Markdown, PDF, audio, video, RTF, DOCX text, Windows shortcuts, and common 3D models.
- Syntax-aware colors with strict preview limits so unusually large files do not freeze the UI.
- `dust`-powered folder-size analysis with actionable results in the same inspector area as Preview.
- Reversible delete, rename, and non-overwriting move operations.
- Git/SVN status, favorites, tags, archives, SMB paths, FTP/SFTP, and cloud-file states.
- Context-menu actions can open a folder—or reveal a selected file—in Windows File Explorer.
- Velopack portable updates from GitHub Releases or a configurable home-server feed, with optional HTTP/HTTPS proxy support.
- Multiple built-in color themes plus reloadable user theme packs—no recompilation required.

## Download

Download the latest portable archive or installer from [GitHub Releases](https://github.com/RailgunHamster/RHFiles/releases/latest).

For the portable build, extract the complete ZIP and launch `RHFiles.exe` from the extracted directory. Keep `Everything.exe`, `Everything64.dll`, `dust.exe`, and the other bundled files beside it. A Velopack portable installation can download, replace, and restart itself for later updates.

Windows may show an “Unknown publisher” warning because current builds are not code-signed.

## Search behavior

Search starts in the active folder. Use the scope button or the configurable shortcut to switch to global search.

- Folder scope keeps working when Everything is unavailable by using a time- and result-bounded filesystem search.
- Global scope uses Everything's index for fast machine-wide results.
- Plain queries match any part of a filename and support Chinese text, full Pinyin, and Pinyin initials.
- Regex and wildcard modes are available from the search toolbar.

Everything may need its service enabled on a standard Windows account before it can index all NTFS volumes. RHFiles reports IPC and index readiness failures instead of leaving the search UI waiting indefinitely.

## Preview and disk usage

Preview and Disk usage share one inspector surface and are mutually exclusive: opening one replaces the other. Preview can be opened by default from Settings and can be expanded to fullscreen.

Media playback depends on codecs supported by the installed WebView2/Windows media stack. DOCX and RTF currently use safe text-oriented previews rather than reproducing the original page layout.

The offline 3D viewer supports glTF/GLB (including Draco and Meshopt compression), OBJ/MTL, FBX, STL, PLY, and 3MF. It provides orbit, zoom, pan, reset, wireframe, automatic rotation, and animation playback. Automatic preview is capped at 128 MiB and three million triangles; CAD formats are intentionally outside the current scope.

## Themes

RHFiles includes Paper, Dark, Sand, Mist, Forest, and Slate themes. User theme packs are JSON files placed in:

```text
%APPDATA%\RHFiles\themes\*.json
```

Settings can open this folder and reload changed themes immediately. Theme packs define a light/dark base and a validated set of CSS variables; an independent advanced-CSS override remains available for users who deliberately need unrestricted styling. See [Theme packs](docs/THEMES.md).

## Updates and release history

Automatic checks run after startup, when Settings is opened, and hourly while the app remains open. Disabling automatic checks prevents those requests; manual checks still work. The client can display cumulative release notes from either GitHub or the selected home-server feed and retains bundled notes for offline use.

## Development

Prerequisites:

- Windows 10/11
- Rust toolchain specified by `rust-toolchain.toml`
- Microsoft WebView2 Runtime
- .NET 8 and Velopack CLI 1.2.0 for release packaging

```powershell
cargo check --workspace
cargo test --workspace --locked
./scripts/test-gui.ps1 -Timeout 120
```

Build a release executable:

```powershell
cargo build --release --locked --package rhfiles-tauri
```

Create the portable/update feed:

```powershell
./scripts/package-velopack.ps1
```

See [Release process](docs/RELEASING.md) for versioning, tags, GitHub Releases, and LAN publishing.

## Third-party components

Portable packages bundle Everything and `dust`. Their accompanying files and licenses must remain with the distribution. The offline 3D viewer vendors a pinned subset of Three.js 0.185.1 under its MIT license. RHFiles also uses the Rust and JavaScript dependencies recorded in `Cargo.lock` and the source tree.
