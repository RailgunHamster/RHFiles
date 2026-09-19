# RHFiles 待办与已知问题

> 记录已确认但暂缓的问题。每条都写清现象、已完成的前期调研结论和可选方案，避免重复调查。

## 1. 拖拽文件到微信 / QQ 只得到文本，而不是文件

**状态**: 暂缓（用户决定先记录）。
**现象**: 从 RHFiles 把文件拖到微信（4.x）或 QQ（QQNT）窗口，对方收到的是文本（文件路径），而不是文件附件。资源管理器拖同样的文件则正常。

**调研结论（已核实，无需重查）**:

- RHFiles 的拖拽全部由 HTML5 拖放实现，拖拽数据只有 `RHFILES_FILE_DRAG_MIME` 与 `text/plain`（见 `src/js/common.js` 的 `setRhfilesFileDragData`）。因此外部程序只能看到文本——这就是微信粘贴出文本的原因。
- 微信 4.x（`C:\Program Files\Tencent\Weixin\Weixin.dll`）与 QQNT 都是 Chromium/Electron 内核，接受标准 Windows 拖放格式：**文件附件必须走 `CF_HDROP`**，纯文本走 `CF_UNICODETEXT`。静态证据：QQ 的 `qq_shell_extension_64.dll` / `GF.dll` 引用 `DragQueryFile`；微信 `Weixin.dll` 引用 `RegisterDragDrop`、`OleSetClipboard`、`CF_UNICODETEXT`、`text/uri-list`。
- **HTML5 拖拽在原理上无法提供 `CF_HDROP`**：WebView2/Chromium 只在拖拽数据包含原生文件路径时才填充该格式，而网页无法伪造本地路径。给 `text/uri-list` 塞 `file:///…` 也不会被当成附件。

**可选方案（二选一，均为原生拖出）**:

1. **修饰键方案（推荐先做）**：按住 Alt 拖拽时启动原生 OLE 拖拽（真实 `CF_HDROP`），普通拖拽保持现有窗格/标签/侧边栏行为不变，零回归风险。
2. **全量原生拖拽**：所有文件拖拽都走原生 OLE。需要自己实现拖拽循环与光标命中测试来接管现有 HTML5 拖放（跨窗格、标签页、侧边栏、悬浮跳转、多选拖拽、拖拽预览图），体验最接近资源管理器，但工作量大、回归面广。

**实现要点**:

- 依赖 [drag-rs](https://github.com/crabnebula-dev/drag-rs)（crate 名 `drag`，MIT/Apache-2.0，官方测试覆盖 Tauri v2 窗口）。只需 Rust 侧依赖，不必引入 NPM 包。
- 用法：`drag::start_drag(&window, drag::DragItem::Files(paths), drag::Image::Raw(png_bytes))`；`tauri::WebviewWindow` 已实现 `HasWindowHandle`。
- `start_drag` 会阻塞到拖放结束，需要放在独立线程并先以 STA 初始化 COM；前端在 `dragstart` 里按住修饰键时 `preventDefault()` 再调用后端命令启动原生拖拽（drag-rs 示例即为此模式）。
