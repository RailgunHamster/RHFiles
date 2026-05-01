# RHFiles 开发进度

> 最后更新: 2026-05-01
> 总提交: 7 次 (91da221 → ed824f7)

## 项目概述

RHFiles 是一个基于 Rust/Tauri v2 的 Windows 文件管理器，目标对标 [Files](https://github.com/files-community/Files) (C#/WinUI 3)。

**代码规模**: Rust 后端 ~1500 行 (lib.rs + enumerator.rs) + JS 前端 ~2800 行 (16 模块) + CSS ~400 行 (8 模块)

## 已完成工作

### Phase 1: MVP 功能实现

将原有单体 `app.js` (639行) 和 `style.css` (234行) 拆分为模块化架构：

**CSS 模块化** (8个文件):
- `variables.css` — CSS 变量/主题定义
- `base.css` — 基础重置样式
- `header.css` — 工具栏/地址栏
- `sidebar.css` — 侧边栏/目录树
- `filelist.css` — 文件列表/详情视图
- `layouts.css` — 图标/卡片/列视图布局
- `panes.css` — 双面板/预览面板
- `overlays.css` — 对话框/覆盖层

**JS 模块化** (16个文件):
- `common.js` — 全局状态 (G对象)、i18n (中/英)、API 调用、持久化、文件监视
- `theme.js` — 暗色/亮色主题切换
- `tabs.js` — 多标签页、面包屑导航、前进/后退/上级、深层搜索
- `sidebar.js` — 目录树、驱动器列表、标签列表、固定文件夹、WSL/库检测
- `icons.js` — 文件图标 SVG、类型标签
- `filelist.js` — 虚拟列表、4种布局渲染、排序、选择
- `ops.js` — 文件操作 (复制/剪切/粘贴/删除/重命名)、右键菜单、拖拽
- `keyboard.js` — 键盘快捷键、命令面板
- `pane.js` — 预览面板 (文本/图片/二进制+语法高亮)、双面板、Markdown渲染
- `dialogs.js` — 批量重命名、属性对话框、设置、新建文件对话框
- `git.js` — Git 状态显示、分支管理、初始化
- `undoredo.js` — 文件操作撤销/重做栈
- `grouping.js` — 按日期/大小/类型/扩展名分组显示
- `selection.js` — 鼠标矩形框选
- `conflict.js` — 文件冲突解决对话框
- `main.js` — 初始化、事件绑定

**已实现的核心功能 (30+)**:
- 多标签页 (新建/关闭/切换/中键关闭)
- 面包屑导航 (分段点击/下拉/编辑路径)
- 四种布局 (详情/图标/卡片/列视图)
- 虚拟列表滚动优化
- 排序 (名称/日期/类型/大小)
- 分组显示 (按日期/大小/类型/扩展名)
- 搜索 (实时过滤 + 递归搜索)
- 选择 (单选/Ctrl多选/Shift范围/全选/反选/矩形框选)
- 拖拽移动文件
- 双面板 (水平分割独立导航)
- 预览面板 (文本/图片/二进制/Markdown/文件夹/快捷方式 + 语法高亮)
- 文件操作 (复制/剪切/粘贴/删除到回收站/重命名/新建文件夹/新建文件)
- 批量重命名 (查找替换 + 正则/大小写 + 预览)
- 压缩包浏览 (ZIP 浏览 + 解压 + 创建 ZIP)
- 文件冲突解决对话框 (替换/跳过/保留两者)
- 撤销/重做文件操作
- 侧边栏 (固定文件夹/快速访问/目录树/驱动器/标签)
- 文件标签 (添加/移除 + JSON 持久化 + 侧边栏显示)
- Git 集成 (状态显示/列显示/分支管理/初始化)
- 命令面板 (Ctrl+Shift+P, 30+ 命令)
- 暗色/亮色主题
- i18n (中/英文)
- 文件监视 (3秒轮询自动刷新)
- 标签持久化 (localStorage)
- 打开文件 (默认程序)
- 属性对话框 (基本信息 + 文件哈希)
- 缩略图 (图片缩略图)
- 终端集成 (CMD/PowerShell/Windows Terminal)
- 以管理员运行
- 全屏模式 (F11)
- 右键菜单 (终端/管理员/压缩/旋转/壁纸/字体/IDE等)

### Phase 2: Bug 修复 (24个)

审计并修复了所有已实现功能中的 Bug：

**致命 (2)**:
- BUG-1: `tabOrPane`/`listId` 超出作用域导致所有行点击崩溃
- BUG-2: 双击触发多个冲突处理程序

**严重 (6)**:
- BUG-3: 预览面板始终读取左面板
- BUG-4: 右面板历史记录未初始化
- BUG-5: 右面板 Go Up 在根目录产生无效路径
- BUG-6: `bigFileIcon` 破坏 SVG viewBox
- BUG-7: 压缩包面包屑路径含 [Archive] 后缀
- BUG-8: 图标/卡片布局右键菜单 null listId

**中等 (7)**:
- BUG-9: 侧边栏永远不高亮当前目录
- BUG-10: 目录树只加载一次不更新
- BUG-11: 右面板面包屑下拉出现在左面板
- BUG-12: 剪切/复制视觉反馈只在左面板
- BUG-13: 切换布局丢失右面板选择
- BUG-14: Rust `format_time` 日期不准确 → 改用 chrono
- BUG-15: 命令面板属性操作无路径参数

**轻微 (9)**:
- BUG-16: Fallback 模式缺少 21 个命令处理 → 已补全
- BUG-17: UTF-8 文本预览可能截断
- BUG-18: 压缩包内目录双击导航到无效路径
- BUG-19: 无法用键盘切换到右面板 → 已添加 Tab 键
- BUG-20: `scrollToVisible` 只对详情布局正确 → 已修复
- BUG-21: 图标/卡片布局无拖拽数据 → 已添加 dragstart
- BUG-22: 列视图右面板不显示父级列
- BUG-23: 侧边栏标签点击导航到文件路径 → 已修复
- BUG-24: `operations.rs` 空 stub

### Phase 3: 功能扩展

**Rust 后端 — 新增 18 个 Tauri 命令**:

| 命令 | 功能 |
|------|------|
| `folder_size` | 文件夹递归大小计算 |
| `compute_hash` | MD5/SHA1/SHA256/SHA512 哈希 |
| `open_terminal` | 打开 CMD/PowerShell/WT |
| `get_file_icon` | SHGetFileInfo 文件图标提取 |
| `get_new_file_templates` | 新建文件模板列表 |
| `create_new_file` | 从模板创建文件 |
| `get_file_association` | 文件关联查询 (默认打开方式) |
| `run_as_admin` | 以管理员运行 |
| `empty_recycle_bin` | 清空回收站 |
| `rotate_image` | 图片旋转 (90/180/270) |
| `read_shortcut` | .lnk 快捷方式目标读取 |
| `detect_ides` | IDE 检测 (VS Code/Cursor/JetBrains等) |
| `open_in_ide` | 在 IDE 中打开目录 |
| `install_font` | 字体安装 |
| `set_wallpaper` | 设为壁纸 |
| `create_archive` | 创建 ZIP 压缩包 |
| `git_branches/checkout/create_branch/init` | Git 分支管理 |
| `set_file_readonly` | 文件只读属性修改 |

**新增依赖**:
- `chrono` — 正确的日期时间格式化
- `md-5` / `sha1` / `sha2` / `digest` — 哈希计算
- `Win32_Graphics_Gdi` — 文件图标提取

---

## 未完成功能 (对比 Files)

以下功能尚未实现，按优先级排列：

### 仍需实现 (高难度/外部依赖)

| # | 功能 | 难度 | 说明 |
|---|------|------|------|
| 1 | **Shell 原生右键菜单** | ⭐⭐⭐⭐ | COM IContextMenu2 集成，需要 unsafe Rust COM 编程 |
| 2 | **云存储同步状态** | ⭐⭐⭐ | OneDrive/Google Drive 同步图标 |
| 3 | **NTFS 权限编辑** | ⭐⭐⭐⭐ | ACL 权限编辑器 |
| 4 | **MTP 设备浏览** | ⭐⭐⭐⭐ | 手机/相机 MTP 协议 |
| 5 | **FTP 连接** | ⭐⭐⭐ | FTP/FTPS 文件浏览 |
| 6 | **SMB 网络浏览** | ⭐⭐⭐ | 局域网共享 |
| 7 | **7z 压缩** | ⭐⭐ | 7z 格式支持 |
| 8 | **Rich Text 预览** | ⭐⭐⭐ | RTF/DOCX 渲染 |
| 9 | **画中画模式** | ⭐⭐ | 小窗口置顶 (CompactOverlay) |
| 10 | **Git Clone (含 GitHub OAuth)** | ⭐⭐⭐ | 克隆仓库 |
| 11 | **Sentry 错误上报** | ⭐⭐ | 崩溃报告 |
| 12 | **自定义主题上传** | ⭐⭐ | 用户上传主题文件 |
| 13 | **工具栏按钮自定义** | ⭐⭐ | 拖拽排序工具栏按钮 |
| 14 | **格式化驱动器** | ⭐⭐ | 磁盘格式化 |
| 15 | **证书安装** | ⭐⭐ | X509 证书安装 |
| 16 | **EXE 兼容性设置** | ⭐⭐ | 兼容模式设置 |
| 17 | **协议激活 (files://)** | ⭐ | URL 协议注册 |

### P3 — 架构/质量

| # | 功能 |
|---|------|
| 18 | SQLite 替代 JSON 持久化 |
| 19 | DI 容器 / Action 命令系统 |
| 20 | 自然排序 (数字感知) |
| 21 | ADS (NTFS 备用数据流) 标签 |
| 22 | MSIX 打包 |

---

## 文件结构

```
RHFiles/
├── crates/rhfiles-core/
│   ├── Cargo.toml          # 核心库依赖
│   └── src/
│       ├── lib.rs           # FileEntry, DriveInfo 定义
│       ├── enumerator.rs    # 文件系统操作 (30+ 函数)
│       ├── config.rs        # 配置
│       └── operations.rs    # (空 stub)
├── src-tauri/
│   ├── Cargo.toml           # Tauri 应用依赖
│   └── src/
│       └── lib.rs           # 40+ Tauri IPC 命令
├── src/
│   ├── index.html           # 完整 UI 结构
│   ├── css/                 # 8 个 CSS 模块
│   └── js/                  # 16 个 JS 模块
├── BUG_AUDIT.md             # Bug 审计报告
├── FEATURE_COMPARISON.md    # 功能对比分析
└── PROGRESS.md              # 本文件
```
