# 调试与验证 RHFiles

## 为什么需要这份文档

RHFiles 的界面跑在 WebView2 里。**应用内置的 GUI 测试套件需要一块可见桌面**：`scripts/test-gui.ps1` 以隐藏窗口启动时，WebView 在无交互桌面的会话里根本不会初始化，结果文件永远不出现，看起来就像"测试没跑"。这正是"界面问题没被测出来"的根源。

现在有两条可用的通道：

| 通道 | 需要可见桌面 | 能做什么 |
| --- | --- | --- |
| `scripts/test-gui.ps1`（默认） | 是 | 跑内置 231 项套件 |
| `scripts/test-gui.ps1 -CdpPort 9222` | **否** | 同上，走 DevTools 协议驱动 |
| `scripts/cdp-window.mjs` | **否** | 直接看/驱动真实窗口：求值、DOM、截图 |

## 打开 DevTools 端口

```powershell
$env:RHFILES_CDP_PORT = '9222'
.\target\debug\rhfiles.exe
```

启动后 stderr 会打印 `RHFiles: WebView2 DevTools port enabled (RHFILES_CDP_PORT)`，端口监听在 `127.0.0.1`。**不设置该环境变量时行为完全不变，也不会打开任何端口。**

### 为什么 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 没用

这是排查了很久的坑，记下来避免重走：

- wry **总是**调用 `CoreWebView2EnvironmentOptions::AdditionalBrowserArguments`：没有自定义参数时，它会写入自己的默认值（`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`）。
- WebView2 的规则是：**一旦该属性被程序化设置，`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 环境变量就被忽略**。
- 所以导出那个环境变量永远不会开端口，`chrome://inspect` 与 DevTools 协议都连不上。

因此 RHFiles 把端口通过 wry 用的同一条通道转发：`requested_browser_args()`（`src-tauri/src/window.rs`）在 `Builder::build` 之前写进内存里的窗口配置；手工创建的窗口（伴随选择器、恢复的额外窗口）用 `with_browser_args()` 包装。
另外注意：**同一个用户数据目录下所有 WebView2 环境的选项必须一致**，所以进程内所有窗口都套用同一份参数。

## 用 CDP 驱动窗口

```powershell
node scripts/cdp-window.mjs targets                                  # 列出窗口
node scripts/cdp-window.mjs eval "getTab().path"                     # 求值（支持 Promise）
node scripts/cdp-window.mjs dom                                      # 打印 DOM 大纲（含尺寸与隐藏标记）
node scripts/cdp-window.mjs shot "$env:TEMP\rhfiles.png"             # 截图（可配合读图直接看界面）
```

`dom` 会输出元素尺寸，适合判断布局；`shot` 在没有桌面的机器上同样可用。

## 跑内置测试套件

```powershell
# 有桌面的机器
.\scripts\test-gui.ps1

# 无桌面 / 远程会话（推荐）
.\scripts\test-gui.ps1 -CdpPort 9222
```

`-CdpPort` 模式会以正常窗口启动应用、打开端口；若结果文件没有出现，它自动改用 CDP 调用 `window.__runTests()` 并读取返回值。也可以在应用运行时手动触发：

```powershell
node scripts/cdp-window.mjs eval "window.__runTests().then(r => JSON.stringify({total:r.total, failed:r.failed}))"
```

## 前端专项检查（无需启动应用）

```powershell
node scripts/verify-file-choice-picker.mjs   # 选择器确认栏：逻辑 + 真实 DOM/CSS 几何
node scripts/verify-ui-fixes.mjs             # 图标、预览音量、缓存键、弹窗居中等契约
```

这两个脚本用无头 Edge 加载**真实的** DOM 与样式表，因此能抓住布局问题——`verify-file-choice-picker.mjs` 曾经只检查 `position/display`，所以漏掉了"确认栏变成半屏空列"这类问题，现在它断言整宽、位于窗格之下、是细条、窗格未被压缩。
