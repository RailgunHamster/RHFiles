# Shell Context Menu Implementation

## How Files App Does It

Reference: `D:\git\Files\src\Files.App\`

### Architecture Overview

Files uses a 3-layer architecture for shell context menus:

1. **UI Layer**: XAML `CommandBarFlyout` with `RightTapped` handlers
2. **Bridge Layer**: `ContextMenuFlyoutItemViewModel` + factory helpers
3. **Native COM Layer**: `ContextMenu` class wrapping Win32 `IContextMenu`

### The Critical Piece: `ThreadWithMessageQueue`

**File**: `src/Files.App/Utils/Shell/ThreadWithMessageQueue.cs`

This is the key to making COM work. `IContextMenu::QueryContextMenu` MUST run on an STA thread
with a Windows message pump. Without the message pump, shell extensions crash with
"shared memory failed" or similar errors.

```csharp
public sealed partial class ThreadWithMessageQueue : Disposable
{
    private readonly BlockingCollection<Internal> messageQueue;
    private readonly Thread thread;

    public ThreadWithMessageQueue()
    {
        messageQueue = new BlockingCollection<Internal>(new ConcurrentQueue<Internal>());
        thread = new Thread(new ThreadStart(() =>
        {
            foreach (var message in messageQueue.GetConsumingEnumerable())
            {
                var res = message.payload();
                message.tcs.SetResult(res);
            }
        }));
        thread.SetApartmentState(ApartmentState.STA);  // REQUIRED for COM
        thread.IsBackground = true;
        thread.Start();
    }

    public async Task<V> PostMethod<V>(Func<object> payload)
    {
        var message = new Internal(payload);
        messageQueue.TryAdd(message);
        return (V)await message.tcs.Task;
    }
}
```

**Key points:**
- `ApartmentState.STA` — COM apartment threading model
- `IsBackground = true` — won't block app shutdown
- Message pump via `BlockingCollection.GetConsumingEnumerable()` — processes one work item at a time
- Each `GetContextMenuForFiles` call creates a new `ThreadWithMessageQueue` instance

### COM IContextMenu Flow

**File**: `src/Files.App/Utils/Shell/ContextMenu.cs`

```csharp
public async static Task<ContextMenu?> GetContextMenuForFiles(
    string[] filePathList, uint flags, Func<string, bool>? itemFilter = null)
{
    var owningThread = new ThreadWithMessageQueue();  // Create STA thread

    return await owningThread.PostMethod<ContextMenu>(() =>
    {
        var shellItems = new List<ShellItem>();
        try
        {
            foreach (var filePathItem in filePathList)
                shellItems.Add(ShellFolderExtensions.GetShellItemFromPathOrPIDL(filePathItem));
            return GetContextMenuForFiles([.. shellItems], flags, owningThread, itemFilter);
        }
        catch { return null; }
        finally
        {
            foreach (var item in shellItems) item.Dispose();
        }
    });
}

private static ContextMenu? GetContextMenuForFiles(...)
{
    using var sf = shellItems[0].Parent;
    Shell32.IContextMenu menu = sf.GetChildrenUIObjects<Shell32.IContextMenu>(default, shellItems);
    var hMenu = User32.CreatePopupMenu();
    menu.QueryContextMenu(hMenu, 0, 1, 0x7FFF, (Shell32.CMF)flags);
    var contextMenu = new ContextMenu(menu, hMenu, ..., owningThread, itemFilter);
    contextMenu.EnumMenuItems(hMenu, contextMenu.Items);
    return contextMenu;
}
```

### CMF_EXTENDEDVERBS for Shift+Right-Click

Files passes `CMF_EXTENDEDVERBS` when Shift is held:

```csharp
var contextMenu = await ContextMenu.GetContextMenuForFiles(filePaths,
    shiftPressed ? PInvoke.CMF_EXTENDEDVERBS : PInvoke.CMF_NORMAL, ...);
```

### Deferred Submenu Loading

Instead of eagerly loading all submenu items (triggering slow `WM_INITMENUPOPUP`),

Files defers submenu loading to hover time:

```csharp
menuLayoutSubItem.LoadSubMenuAction = async () =>
{
    if (await contextMenu.LoadSubMenu(menuFlyoutItem.SubItems))
        LoadMenuFlyoutItem(menuLayoutSubItem.Items, contextMenu,
            menuFlyoutItem.SubItems, cancellationToken, showIcons);
};
```

### Cancellation Support

A `CancellationTokenSource` is cancelled on each new flyout open, preventing stale work:

```csharp
shellContextMenuItemCancellationToken?.Cancel();
shellContextMenuItemCancellationToken = new CancellationTokenSource();
```

### Safety Guards

- `GetCommandString` offset guard: `if (offset > 5000) return null;` — prevents
  `AccessViolationException` from buggy shell extensions (e.g. NVIDIA "Run with graphics processor")
- Known-item filtering: removes items already handled by the app (Copy, Cut, Paste, etc.)

---

## RHFiles Implementation History

### Attempt 1: Registry Scan Only (original)

**File**: `src-tauri/src/shell.rs` → `get_shell_verbs_registry()`

Scanned `HKCR\Directory\shell`, `HKCR\Folder\shell`, `HKCR\AllFilesystemObjects\shell` etc.

**Problems:**
- Showed raw DLL paths (`shell32.dll`, `efscore.dll`) as menu items
- Missing COM-based shell extensions (TortoiseGit, 7-Zip, WinRAR)
- Couldn't show "Open in Terminal", "Open with Code", etc.

### Attempt 2: COM on Main Thread

**Changes**: `showComContextMenu` called `query_context_menu` (COM) directly.

**Problem**: `IContextMenu::QueryContextMenu` loads all shell extensions synchronously.
On the Tauri async thread, this blocks the IPC, causing UI freeze. Some shell extensions
also crash without a message pump → "shared memory failed".

### Attempt 3: COM on Background Thread (no message pump)

**Changes**: `query_context_menu` spawned `std::thread` + `CoInitializeEx`.

**Problem**: Same as Attempt 2 — no Windows message pump on the spawned thread.
Shell extensions that require message processing crash.

### Attempt 4: COM + Message Pump on STA Thread (current)

**Changes**: `query_context_menu` + `invoke_context_menu_command` each spawn a dedicated
STA thread with a Windows message pump:

```rust
std::thread::Builder::new()
    .name("com-sta-thread")
    .spawn(move || {
        // Initialize COM on this thread
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE).ok(); }
        unsafe { SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX); }

        // Do COM work
        let result = query_context_menu_com(&path);
        let _ = tx.send(result);

        // Drain message queue (critical — processes pending window messages from shell extensions)
        let mut msg = std::mem::zeroed::<MSG>();
        while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        CoUninitialize();
    })?;

match rx.recv_timeout(Duration::from_secs(5)) {
    Ok(result) => result,
    Err(Timeout) => Err("COM context menu timed out (5s)".into()),
    Err(Disconnected) => Err("COM context menu thread crashed".into()),
}
```

**Status**: Compiles, needs testing on real hardware.

### Garbage Label Filtering

**File**: `src-tauri/src/shell.rs` → `is_garbage_label()`

Filters registry scan results:
- File paths (`:\\\\`)
- System file extensions (`.dll`, `.exe`, `.cpl`, etc.) unless they contain spaces
- Raw verb names (`open`, `explore`, `find`, `print`, `edit`, `openas`, `runas`, `properties`)
- GUID strings (`{...}`)

---

## Current Strategy

| Trigger | Source | Rationale |
|---------|--------|-----------|
| Normal right-click | Registry scan (`get_shell_verbs`) | Fast (<100ms), reliable, filtered |
| Shift+right-click | COM `IContextMenu` → Registry fallback | Full Explorer menu, STA thread with 5s timeout |
| Empty area right-click | Registry → Built-in menu fallback | Same as file row |
| Shift+right-click empty | COM → Registry fallback | Same as file row Shift+click |

### JS Call Chain

```
filelist.js (right-click on row)
  ├─ no Shift → showComContextMenu(path) → get_shell_verbs → built-in fallback
  └─ Shift    → showShellVerbsMenu(path) → query_context_menu (COM) → get_shell_verbs fallback

main.js (right-click on empty area)
  ├─ no Shift → showComContextMenu(path)
  └─ Shift    → showShellVerbsMenu(path)
```

### Rust Commands

| Command | Purpose | Thread |
|---------|---------|--------|
| `get_shell_verbs` | Registry scan | Main thread (fast) |
| `invoke_shell_verb` | Execute via ShellExecuteW or COM fallback | Main thread |
| `query_context_menu` | COM IContextMenu::QueryContextMenu | STA thread + message pump |
| `invoke_context_menu_command` | COM IContextMenu::InvokeCommand | STA thread + message pump |

### Completely Removed from Current Code

- `*.sys`, `*.drv` — these are now caught by `is_garbage_label`

---

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/shell.rs` | All shell/COM logic: registry scan, garbage filtering, STA thread COM, verb invocation |
| `src/js/ops.js` | Menu rendering: `showComContextMenu`, `showShellVerbsMenu`, `showContextMenu`, `buildItems` |
| `src/js/filelist.js` | Right-click handlers for file rows (details/icons/cards/columns layouts) |
| `src/js/main.js` | Document-level right-click handler for empty areas |
| `src/js/common.js` | Tauri `call()` wrapper + mock data for offline testing |

## Unresolved

- COM still may timeout (>5s) on systems with many/heavy shell extensions
- No `CMF_EXTENDEDVERBS` flag being passed to `QueryContextMenu` for Shift+right-click
- No deferred submenu loading (all submenus loaded eagerly)
- No cancellation token support for in-flight COM calls

---

## Attempt 5: Permanent STA Thread + Native TrackPopupMenuEx (current)

### Design Doc

See `docs/SHELL_DESIGN.md` — the core principle is:

```
IContextMenu → HMENU → TrackPopupMenuEx → InvokeCommand
```

No JSON. No HTML. No JS rendering. The menu is entirely handled by Windows Shell.

### Architecture

```
Tauri (WebView)
    ↓ IPC invoke("show_native_context_menu", { path, x, y, shift })
Rust (Tauri command thread)
    ↓ mpsc::channel + PostMessageW(WM_SHELL_REQUEST)
Permanent Shell STA Thread (singleton)
    ↓ GetMessageW → DispatchMessageW (real Win32 message loop)
    Hidden HWND (message sink + menu owner)
    ↓ SHParseDisplayName → SHBindToParent → GetUIObjectOf → IContextMenu
    ↓ QueryContextMenu → TrackPopupMenuEx → InvokeCommand
```

### Why This Works

| Requirement | How It's Satisfied |
|---|---|
| Long-lived COM apartment | `OnceLock<ShellThread>` — thread never exits |
| Real Win32 message loop | `GetMessageW` + `DispatchMessageW`, not `PeekMessageW` drain hack |
| Same thread for Query/Track/Invoke | All three run inside the WndProc → single STA thread |
| Hidden HWND owner | `CreateWindowExW` with empty style — stable, always valid |
| Shell extension compatibility | `SetErrorMode(SEM_FAILCRITICALERRORS \| SEM_NOGPFAULTERRORBOX)` |
| Shift+right-click | `CMF_EXTENDEDVERBS` (0x100) flag passed to `QueryContextMenu` |

### Key Data Structures

```rust
struct ShellThread {
    tx: Sender<ShellRequest>,       // channel to send requests
    hwnd: SendHwnd,                 // hidden window handle (Send wrapper)
}

enum ShellRequest {
    ShowMenu { path, x, y, shift, tx: Sender<Result<(), String>> }
}

thread_local! {
    SHELL_RX: RefCell<Option<Receiver<ShellRequest>>>,  // STA thread reads requests here
    SELECTED_CMD: Cell<u32>,                            // WM_COMMAND stores cmd ID
    MENU_ACTIVE: Cell<bool>,                            // prevents reentrant menu
    CTX_MENU2: RefCell<Option<IContextMenu2>>,          // live during menu lifecycle
    CTX_MENU3: RefCell<Option<IContextMenu3>>,          // live during menu lifecycle
}
```

### Communication Flow

1. JS calls `invoke("show_native_context_menu", { path, x: screenX, y: screenY, shift })`
2. Rust `show_native_context_menu()` sends `ShellRequest::ShowMenu` through channel
3. `PostMessageW(hwnd, WM_SHELL_REQUEST)` wakes up the STA thread's `GetMessageW` loop
4. `shell_wnd_proc` receives `WM_SHELL_REQUEST`, reads from channel, calls `do_show_native_menu`
5. `do_show_native_menu`:
   - Gets `IContextMenu` via COM
   - Casts to `IContextMenu2` / `IContextMenu3`, stores in thread-locals `CTX_MENU2` / `CTX_MENU3`
   - `QueryContextMenu` populates an `HMENU`
   - `TrackPopupMenuEx` shows the native menu (blocks until dismissed)
   - During menu display, `shell_wnd_proc` forwards `WM_INITMENUPOPUP`, `WM_DRAWITEM`, `WM_MEASUREITEM`, `WM_MENUCHAR` to `HandleMenuMsg` / `HandleMenuMsg2`
   - On selection, Windows sends `WM_COMMAND` → window proc stores `cmd_id` in `SELECTED_CMD`
   - After menu closes, reads `cmd_id` and calls `InvokeCommand`
   - Clears `CTX_MENU2` / `CTX_MENU3` (COM objects released)
6. Result sent back through channel, Tauri command returns to JS

### Shell Menu Message Forwarding

The `shell_wnd_proc` handles critical menu messages that shell extensions depend on:

| Message | Forwarded to | Purpose |
|---|---|---|
| `WM_INITMENUPOPUP` | `IContextMenu3::HandleMenuMsg2` → `IContextMenu2::HandleMenuMsg` | Lazy submenu population (7-Zip, WinRAR) |
| `WM_DRAWITEM` | `IContextMenu3::HandleMenuMsg2` → `IContextMenu2::HandleMenuMsg` | Owner-draw icons (TortoiseGit, NVIDIA) |
| `WM_MEASUREITEM` | `IContextMenu3::HandleMenuMsg2` → `IContextMenu2::HandleMenuMsg` | Custom item sizing |
| `WM_MENUCHAR` | `IContextMenu3::HandleMenuMsg2` | Keyboard accelerator handling |

Priority: `IContextMenu3` is tried first, falls back to `IContextMenu2`.

### COM Object Lifecycle

```
do_show_native_menu() {
    pcm = GetUIObjectOf::<IContextMenu>()      // acquired
    ctx2 = pcm.cast::<IContextMenu2>()          // QI for IContextMenu2
    ctx3 = pcm.cast::<IContextMenu3>()          // QI for IContextMenu3
    CTX_MENU2 = ctx2                            // stored in thread-local
    CTX_MENU3 = ctx3                            // stored in thread-local
    QueryContextMenu(hmenu)
    TrackPopupMenuEx(hmenu)                     // blocks — WM_* messages forwarded via CTX_MENU2/3
    InvokeCommand(...)                          // if user selected item
    DestroyMenu(hmenu)
    CTX_MENU2 = None                            // released
    CTX_MENU3 = None                            // released
    // pcm, ctx2, ctx3 dropped here
}
```

All COM objects live on the same STA thread, covering the entire lifecycle from `QueryContextMenu` through `TrackPopupMenuEx` to `InvokeCommand`.

### Why WM_COMMAND Instead of TPM_RETURNCMD

`windows-rs` 0.62 wraps `TrackPopupMenuEx` to return `Result<()>` (converting the BOOL).
With `TPM_RETURNCMD`, the command ID would be the raw return value, which gets lost.

Instead, we use `TrackPopupMenuEx` without `TPM_RETURNCMD`. Windows sends `WM_COMMAND`
to the owner HWND with the selected item's ID in `LOWORD(wParam)`. Our window proc
captures this in the `SELECTED_CMD` thread-local, then reads it after the menu closes.

### JS Changes

| Before | After |
|---|---|
| `showComContextMenu(path, clientX, clientY)` → HTML menu from registry verbs | `showComContextMenu(path, screenX, screenY)` → `call("show_native_context_menu")` |
| `showShellVerbsMenu(path, clientX, clientY)` → HTML menu + COM fallback | `showShellVerbsMenu(path, screenX, screenY)` → `call("show_native_context_menu", shift: true)` |
| `renderShellItems()` → DOM rendering | Removed entirely |
| Coordinates: `e.clientX, e.clientY` (viewport) | Coordinates: `e.screenX, e.screenY` (screen — needed by `TrackPopupMenuEx`) |

### Rust Files

| File | Change |
|---|---|
| `src-tauri/src/shell.rs` | Added: `ShellThread`, `SendHwnd`, `shell_wnd_proc`, `sta_thread_proc`, `do_show_native_menu`, `show_native_context_menu` command |
| `src-tauri/Cargo.toml` | Added `Win32_System_LibraryLoader` feature for `GetModuleHandleW` |
| `src-tauri/src/lib.rs` | Registered `shell::show_native_context_menu` in invoke handler |

### Old Commands (kept for compatibility)

The previous commands are still registered but no longer called from JS:

- `get_shell_verbs` — registry scan
- `invoke_shell_verb` — ShellExecuteW / COM fallback
- `query_context_menu` — COM IContextMenu → walk HMENU → JSON
- `invoke_context_menu_command` — COM InvokeCommand on ephemeral STA thread

These can be removed in a future cleanup.

### Known Limitations

- No multi-file selection support — only single path passed to `GetUIObjectOf`
- Menu blocks the calling Tauri async task until dismissed (acceptable — Tauri uses a thread pool)
- No timeout protection on `TrackPopupMenuEx` (user must dismiss the menu manually)
- `IContextMenu2`/`IContextMenu3` message forwarding is now implemented ✓
