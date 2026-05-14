# RHFiles Custom Context Menu Plan

Pure Rust/JS implementation. No Win32 shell COM menus.

## Architecture

- `showContextMenu(x, y, isRight)` in `ops.js` builds and displays an HTML context menu
- Menu items call Tauri commands (`call("cmd", { args })`) which invoke Rust handlers
- Rust handlers use `std::process::Command` to launch external programs
- Submenus implemented as nested HTML `<div>` elements

## Context-Sensitive Visibility

Items appear/disappear based on state:

| Condition | How to detect |
|---|---|
| Git repo | `git_status` returns valid result for current path |
| SVN repo | `svn_info` returns valid result for current path |
| Recycle Bin | path is `C:\$Recycle.Bin` or `X:\$Recycle.Bin` or starts with `\\?\X:\$Recycle.Bin` |
| Cloud path | `isCloudPath(isRight)` already exists |
| Image file | extension check |
| Archive file | extension check |
| Directory | `sel[0].is_dir` |
| Single file | `sel.length === 1 && !sel[0].is_dir` |

Git/SVN items should be **detected lazily** (check on menu open) and cached for the current directory session.

## Menu Structure

### File (single selection)

```
Open                    Enter
Open With >             → submenu (see below)
─────────────────
Cut                     Ctrl+X
Copy                    Ctrl+C
Paste                   Ctrl+V
─────────────────
Rename                  F2
Delete                  Del
─────────────────
Share >                 → submenu
  QQ
  WeChat (微信)
  Feishu (飞书)
  Windows Share
─────────────────
Copy File Path          Ctrl+Shift+C
Compress >              → submenu
  ZIP (built-in)
  7-Zip (.7z)
  Bandizip (.zip)
  WinRAR (.rar)
─────────────────
[existing: image rotate, archive extract, font install, etc.]
─────────────────
Properties              Alt+Enter
Permissions
```

### Directory (single selection)

```
Open                    Enter
Open With >             → submenu
  VSCode
  Visual Studio
  CMD
  PowerShell
  Git Bash
  VLC (play folder)
  ─────────
  New Window
  New Tab
  ─────────
  Windows "Open With"
─────────────────
Cut                     Ctrl+X
Copy                    Ctrl+C
Paste                   Ctrl+V
─────────────────
Rename                  F2
Delete                  Del
─────────────────
Share >                 → submenu
─────────────────
Copy File Path          Ctrl+Shift+C
Compress >              → submenu
─────────────────
Properties              Alt+Enter
Permissions
─────────────────
Git >                   [only if inside git repo]
  Git Log...
  Git Branch...
  Git Commit...
  Git Stash...
  Git Pull
  Git Push
SVN >                   [only if inside svn repo]
  SVN Update
  SVN Commit...
  SVN Revert
  SVN Add
  SVN Log...
  SVN Cleanup
```

### Media file (single selection — audio/video)

```
Open                    Enter
Open With >             → submenu
  VSCode
  Visual Studio
  CMD                   [opens containing dir]
  PowerShell            [opens containing dir]
  Git Bash              [opens containing dir]
  ─────────
  VLC (play)
  PotPlayer (play)
  ─────────
  Windows "Open With"
...rest same as file...
```

### Multiple selection

```
Cut                     Ctrl+X
Copy                    Ctrl+C
─────────────────
Delete                  Del
─────────────────
Compress >              → submenu
─────────────────
[git/svn items if in repo]
─────────────────
Properties              Alt+Enter
```

### Empty area right-click

```
New File                Ctrl+Shift+N
New Folder              F7
─────────────────
Paste                   Ctrl+V
─────────────────
Refresh                 F5
Select All              Ctrl+A
Invert Selection        Ctrl+I
─────────────────
Show/Hide Hidden Files
Open in Terminal
─────────────────
Properties
─────────────────
Git >                   [only if inside git repo]
SVN >                   [only if inside svn repo]
─────────────────
Empty Recycle Bin       [only if current path is Recycle Bin]
```

## Open With Submenu (full structure)

```
Open With >
  VS Code                [always show, grey if not installed]
  Visual Studio          [show if .sln/.csproj or if installed]
  ─────────
  CMD
  PowerShell
  Git Bash               [grey if not installed]
  ─────────
  VLC (play)             [only for media files]
  VLC (play folder)      [only for directories]
  PotPlayer (play)       [only for media files]
  ─────────
  New Window             [only for directories]
  New Tab                [only for directories]
  ─────────
  Windows "Open With"... [system dialog, always show]
```

## Rust Commands to Implement

### 1. `open_with_program`

```rust
#[tauri::command]
fn open_with_program(path: String, program: String) -> Result<(), String>
```

`program` values: `"vscode"`, `"visual_studio"`, `"cmd"`, `"powershell"`, `"git_bash"`, `"vlc"`, `"vlc_folder"`, `"potplayer"`

Detection logic:
- **VSCode**: `code` from PATH, fallback: `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`
- **Visual Studio**: `devenv` from PATH, or query VS Where: `C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe`
- **CMD**: `cmd.exe /K "cd /D <dir>"`
- **PowerShell**: `pwsh` or `powershell` with `-NoExit -Command "cd '<dir>'"`
- **Git Bash**: `git-bash.exe` from `git --exec-path`, or `C:\Program Files\Git\git-bash.exe`
- **VLC**: `vlc` from PATH, fallback: `C:\Program Files\VideoLAN\VLC\vlc.exe`
- **PotPlayer**: `C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe`

### 2. `share_file`

```rust
#[tauri::command]
fn share_file(path: String, target: String) -> Result<(), String>
```

`target` values: `"qq"`, `"wechat"`, `"feishu"`, `"windows"`

- **QQ**: `C:\Program Files (x86)\Tencent\QQ\Bin\QQ.exe` with share protocol, or use `tencent://` URI
- **WeChat**: `C:\Program Files (x86)\Tencent\WeChat\WeChat.exe` — may need to copy path to clipboard + notify user
- **Feishu**: `C:\Users\<user>\AppData\Local\Feishu\Feishu.exe` — similar approach
- **Windows Share**: Use Windows `ShowShareUIForWindow` API (UWP) or invoke the system share dialog

Note: Most Chinese IM apps don't have proper CLI share APIs. Practical approach:
1. Copy file path to clipboard
2. Open the target app
3. User pastes manually

### 3. `compress_with`

```rust
#[tauri::command]
fn compress_with(sources: Vec<String>, dest: String, tool: String) -> Result<(), String>
```

`tool` values: `"7zip"`, `"bandizip"`, `"winrar"`

Detection:
- **7-Zip**: `C:\Program Files\7-Zip\7z.exe` — `7z a -t<fmt> <archive> <files>`
- **Bandizip**: `C:\Program Files\Bandizip\Bandizip.exe` — `Bandizip a <archive> <files>`
- **WinRAR**: `C:\Program Files\WinRAR\WinRAR.exe` — `WinRAR a <archive> <files>`

### 4. `copy_file_path`

```rust
#[tauri::command]
fn copy_file_path(path: String) -> Result<(), String>
```

Copies the path string to Windows clipboard.

### 5. `show_open_with_dialog`

```rust
#[tauri::command]
fn show_open_with_dialog(path: String) -> Result<(), String>
```

Invokes Windows "Open With" dialog via `SHOpenWithDialog` or `rundll32.exe shell32.dll,OpenAs_RunDLL <path>`.

### 6. `detect_vcs`

```rust
#[tauri::command]
fn detect_vcs(path: String) -> Result<Option<String>, String>
```

Returns `"git"`, `"svn"`, or `null` based on whether the path is inside a git/svn working copy. Used by JS to decide whether to show git/svn menu items.

### 7. Existing commands (no changes needed)

- `open_file` — default open
- `detect_ides` / `open_in_ide` — IDE detection
- `open_terminal` — terminal launch (already works)
- `create_archive` / `create_7z` / `extract_archive` — built-in archive
- `show_properties` — Windows properties dialog
- `git_status` / `git_branches` / `git_checkout` / `git_create_branch` / `git_init` / `git_clone` — existing git
- `svn_status` / `svn_info` / `svn_update` / `svn_commit` / `svn_revert` / `svn_add` / `svn_log` / `svn_checkout` / `svn_cleanup` / `svn_resolve` — existing svn
- `empty_recycle_bin` — existing

## JS Changes

### `showContextMenu` in `ops.js`

Replace the flat item list with grouped items and submenus.

Add submenu helper:

```js
function addSubmenu(parent, label, items) {
  // Creates a menu item with ">" arrow and nested div
  // Items can be { label, action, disabled, shortcut }
  // On hover/click, shows nested div
}
```

### VCS detection (async, cached)

```js
// Cache VCS state per directory, re-check on directory change
let _vcsCache = {}; // path -> "git" | "svn" | null

async function detectVcs(path) {
  if (_vcsCache[path] !== undefined) return _vcsCache[path];
  try {
    const vcs = await call("detect_vcs", { path });
    _vcsCache[path] = vcs; // "git", "svn", or null
    return vcs;
  } catch { return null; }
}
```

### New menu items to add

```js
// After "Open":
{ label: t('ctx.openWith'), submenu: [
  { label: "VS Code", action: () => call("open_with_program", { path, program: "vscode" }) },
  { label: "Visual Studio", action: () => call("open_with_program", { path, program: "visual_studio" }) },
  "-",
  { label: "CMD", action: () => call("open_with_program", { path, program: "cmd" }) },
  { label: "PowerShell", action: () => call("open_with_program", { path, program: "powershell" }) },
  { label: "Git Bash", action: () => call("open_with_program", { path, program: "git_bash" }) },
  "-",
  { label: "VLC", action: () => call("open_with_program", { path, program: "vlc" }), hidden: isDir },
  { label: "VLC (folder)", action: () => call("open_with_program", { path, program: "vlc_folder" }), hidden: !isDir },
  { label: "PotPlayer", action: () => call("open_with_program", { path, program: "potplayer" }), hidden: isDir },
  "-",
  { label: t('ctx.openWithDialog'), action: () => call("show_open_with_dialog", { path }) },
  { label: t('ctx.newWindow'), action: () => call("open_new_window", { path }), hidden: !isDir },
  { label: t('ctx.newTab'), action: () => addTab(path), hidden: !isDir },
]},

// Share submenu:
{ label: t('ctx.share'), submenu: [
  { label: "QQ", action: () => call("share_file", { path, target: "qq" }) },
  { label: "微信", action: () => call("share_file", { path, target: "wechat" }) },
  { label: "飞书", action: () => call("share_file", { path, target: "feishu" }) },
  "-",
  { label: t('ctx.windowsShare'), action: () => call("share_file", { path, target: "windows" }) },
]},

// Compress submenu:
{ label: t('ctx.compress'), submenu: [
  { label: "ZIP (built-in)", action: /* existing */ },
  { label: "7-Zip (.7z)", action: () => call("compress_with", { sources, dest, tool: "7zip" }) },
  { label: "Bandizip", action: () => call("compress_with", { sources, dest, tool: "bandizip" }) },
  { label: "WinRAR (.rar)", action: () => call("compress_with", { sources, dest, tool: "winrar" }) },
]},

// Copy path:
{ label: t('ctx.copyPath'), shortcut: "Ctrl+Shift+C", action: () => call("copy_file_path", { path }) },

// Git submenu (only when in git repo):
{ label: "Git", submenu: [...], hidden: vcs !== "git" },

// SVN submenu (only when in svn repo):
{ label: "SVN", submenu: [...], hidden: vcs !== "svn" },
```

## i18n Keys Needed

```json
{
  "ctx.openWith": "Open With",
  "ctx.openWithDialog": "Choose App...",
  "ctx.share": "Share",
  "ctx.windowsShare": "Windows Share",
  "ctx.compress": "Compress",
  "ctx.copyPath": "Copy File Path",
  "ctx.newWindow": "Open in New Window",
  "ctx.newTab": "Open in New Tab",
  "ctx.emptyRecycleBin": "Empty Recycle Bin"
}
```

## Implementation Order

1. **Submenu support in HTML context menu** (JS only)
2. **`open_with_program`** — VSCode, VS, CMD, PowerShell, Git Bash, VLC, PotPlayer
3. **`copy_file_path`** — clipboard
4. **`show_open_with_dialog`** — Windows Open With
5. **`compress_with`** — 7-Zip, Bandizip, WinRAR detection + invocation
6. **`share_file`** — QQ, WeChat, Feishu, Windows Share
7. **`detect_vcs`** + Git/SVN context menus (context-sensitive)
8. **Empty Recycle Bin** — show only when path is Recycle Bin
9. **New Window / New Tab** — wire up existing commands
10. **i18n** — add translation keys
11. **Hide/show logic** — context-sensitive items based on file type, selection count, VCS state

## Open Questions

- [ ] QQ/WeChat/Feishu share: is copy-to-clipboard + open app acceptable? Or do we need protocol handlers?
- [ ] VLC folder play: should it add all files in folder, or just media files?
- [ ] Bandizip/WinRAR: should we detect portable installations too?
- [ ] Git Bash: should we detect via `git --exec-path` or just check known paths?
- [ ] Should "Open With" submenu items show only detected (installed) programs?
- [ ] Git submenu: should we show full log/branch dialogs, or just quick actions (commit, push, pull)?
- [ ] Should VCS detection be cached per-directory or per-session?
