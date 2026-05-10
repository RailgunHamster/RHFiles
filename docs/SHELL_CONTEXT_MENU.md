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
