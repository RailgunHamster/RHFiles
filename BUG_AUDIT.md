# RHFiles 已实现功能 Bug 审计

> 审计日期: 2026-05-01
> 审计范围: 已实现功能中的遗漏、Bug、不完整实现

---

## 致命 Bug（应用无法正常交互）

### BUG-1: `tabOrPane` / `listId` 超出作用域 — 所有行点击崩溃

**文件**: `src/js/filelist.js`
**位置**: `renderDetailsLayout`, `renderIconLayout`, `renderCardLayout`

这三个渲染函数只接收 `(list, entries, sel, isRight)`，但内部事件处理闭包引用了 `tabOrPane` 和 `listId`，这两个变量不在参数列表中。

**影响**: 点击文件行 → `ReferenceError: tabOrPane is not defined` → 应用完全不可交互。

**修复**: 将 `tabOrPane` 和 `listId` 作为额外参数传入这三个函数。

---

### BUG-2: 双击文件触发多个冲突处理程序

**文件**: `src/js/filelist.js`, `src/js/main.js`

`renderDetailsLayout` 的 dblclick 处理程序和 `main.js` 的 click(detail===2) 处理程序同时触发。
- 双击 .zip: 同时在外部打开 AND 进入压缩包浏览模式
- 双击压缩包内文件: 同时尝试 `openFileHandler` 和 `extractArchiveEntry`

**修复**: 移除 `renderDetailsLayout` 中的 dblclick 处理程序，统一由 `main.js` 管理。

---

## 严重 Bug（功能明显损坏）

### BUG-3: 预览面板始终读取左面板选择

**文件**: `src/js/pane.js`
**位置**: `updatePreviewForSelection()` 硬编码 `getSelectedPaths(false)`

**修复**: 追踪最后交互的面板，传递正确的 `isRight` 参数。

---

### BUG-4: 右面板历史记录未初始化，永远无法后退

**文件**: `src/js/common.js`, `src/js/pane.js`

`G.rp` 初始 `history: [], histIdx: -1`。首次激活时 `pushHistory=false` 导致历史为空。之后导航一次后 `histIdx=0`，`paneGoBack` 检查 `>0` 失败。

**修复**: 初始化为 `history: ["C:\\"], histIdx: 0`，或在 `toggleDualPane` 中初始化。

---

### BUG-5: 右面板"上级目录"在根目录产生无效路径

**文件**: `src/js/pane.js`
**位置**: `paneGoUp()` 使用字符串分割

`"C:\\".split("\\").slice(0,-1).join("\\")` → `"C:"` (相对路径，非根目录)。

**修复**: 使用 `call("parent_path", ...)` 替代字符串操作。

---

### BUG-6: `bigFileIcon()` 破坏 SVG viewBox

**文件**: `src/js/icons.js`
**位置**: `bigFileIcon()` 的 `.replace('16"','48"')`

将 `viewBox="0 0 16 16"` 变成 `viewBox="0 0 16 48"`，图标纵向拉伸。

**修复**: `.replace('viewBox="0 0 16 16"', 'viewBox="0 0 48 48"')`

---

### BUG-7: `openArchive` 在面包屑中附加 "[Archive]" 后缀

**文件**: `src/js/git.js`
**位置**: `renderBreadcrumb(path + " [Archive]")`

路径变成 `"C:\\archive.zip [Archive]"`，点击面包屑导航到不存在的路径。

**修复**: 使用 archive-header 显示标签，保持面包屑路径干净。

---

### BUG-8: 图标/卡片布局右键菜单传 null listId 导致崩溃

**文件**: `src/js/filelist.js`

`renderIconLayout` 和 `renderCardLayout` 的 contextmenu 处理程序调用 `renderFiles(tabOrPane, null, ...)` → `document.getElementById(null)` → 崩溃。

**修复**: 传递正确的 `listId` 参数。

---

## 中等 Bug（行为不正确）

### BUG-9: 侧边栏永远不高亮当前目录

**文件**: `src/js/sidebar.js`
**位置**: `updateSidebarSelection()` 只移除 selected，从不添加。

---

### BUG-10: 目录树只加载一次，导航后不更新

**文件**: `src/js/main.js`
**位置**: `loadTree()` 只在初始化调用，`navigateTo` 中无调用。

---

### BUG-11: 右面板面包屑下拉出现在左面板

**文件**: `src/js/pane.js`
**位置**: `renderBreadcrumb(path, "right-breadcrumb", null, ...)` → dropdownId 为 null → 默认 "bc-dropdown"（在左面板）。

**修复**: 右面板 HTML 需要自己的下拉元素。

---

### BUG-12: 剪切/复制视觉反馈只在左面板生效

**文件**: `src/js/ops.js`
**位置**: `copySelected`/`cutSelected` 总是 `renderFiles(getTab(), ...)` 不区分面板。

---

### BUG-13: 切换布局丢失右面板选择状态

**文件**: `src/js/tabs.js`
**位置**: `setLayout()` 中 `renderFiles({entries:G.rp.entries}, ...)` 创建临时对象无 sel。

**修复**: 传递 `G.rp` 而非临时对象。

---

### BUG-14: Rust `format_time` 日期计算不准确

**文件**: `src-tauri/src/lib.rs`
**位置**: `format_time()` 不处理闰年、月份天数不固定、UTC 非本地时间。

**修复**: 使用 `chrono` crate。

---

### BUG-15: 命令面板"属性"操作无路径参数

**文件**: `src/js/keyboard.js`

`showPropertiesDialog` 从命令面板调用时无参数，`{ path: undefined }` 导致失败。

**修复**: 包装为 `() => showPropertiesDialog(getSelectedPaths()[0]?.path)`

---

## 轻微问题

### BUG-16: Fallback 模式缺少 13 个命令处理

**文件**: `src/js/common.js`
缺失: `delete_file`, `rename_file`, `new_folder`, `copy_path`, `move_path_cmd`, `open_file`, `show_properties`, `list_archive`, `extract_archive`, `batch_rename`, `save_file_tags`, `search_recursive`, `create_shortcut`

---

### BUG-17: UTF-8 文本预览可能截断多字节字符

**文件**: `crates/rhfiles-core/src/enumerator.rs`
`read_file_text` 按固定字节截断，可能切在 UTF-8 中间字符。

---

### BUG-18: 双击压缩包内目录导航到无效路径

**文件**: `src/js/filelist.js`
`renderDetailsLayout` 的 dblclick 不检查 `archive_entry`。

---

### BUG-19: 无法用键盘切换到右面板

**文件**: `src/js/keyboard.js`
所有键盘快捷键只操作左面板。

---

### BUG-20: `scrollToVisible` 只对详情布局正确

**文件**: `src/js/keyboard.js`
使用固定 `ROW_H=24px`，在图标/卡片/列布局中高度不匹配。

---

### BUG-21: 图标/卡片布局无拖拽数据

**文件**: `src/js/filelist.js`
`renderIconLayout` 设置 `draggable=true` 但未附加 `dragstart` 处理程序。

---

### BUG-22: 列视图布局右面板不显示父级列

**文件**: `src/js/filelist.js`
`renderColumnLayout` 中 `if (!isRight)` 跳过右面板的父级列构建。

---

### BUG-23: 侧边栏标签点击导航到文件路径（报错）

**文件**: `src/js/sidebar.js`
标签点击 `navigateTo(文件路径)` 应导航到文件所在目录。

---

### BUG-24: `operations.rs` 是空 stub

**文件**: `crates/rhfiles-core/src/operations.rs`
空文件，功能全部在 `lib.rs` 和 `enumerator.rs` 中实现。

---

## 修复优先级

1. **立即修复**: BUG-1, BUG-2 (致命，应用不可用)
2. **其次修复**: BUG-3~8 (严重，核心功能损坏)
3. **逐步修复**: BUG-9~15 (中等，体验问题)
4. **有空修复**: BUG-16~24 (轻微)
