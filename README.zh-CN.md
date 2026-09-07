<p align="center">
  <img src="src-tauri/icons/rhfiles-icon-v4-128.png" width="96" height="96" alt="RHFiles 图标">
</p>

<h1 align="center">RHFiles</h1>

<p align="center">使用 Rust、Tauri 与 WebView2 构建的 Windows 文件管理器。</p>

<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong></p>

RHFiles 在熟悉的 Windows 文件操作之上加入了标签页、双窗格、丰富预览、Everything 全局搜索、中文拼音匹配、空间占用分析和 portable 原地更新，主要面向 Windows 10 与 Windows 11。

## 主要功能

- 带历史记录的标签页、左右独立标签的双窗格、可配置快捷键和多选操作。
- 详细、卡片、缩略图和分栏布局，并可显示 Windows 默认打开程序的关联图标。
- 当前文件夹搜索带有限时、限量的内置兜底；全局搜索使用随包提供的 Everything。
- 支持中文汉字、完整拼音、拼音首字母以及文件名中段匹配。
- 可预览文件夹、图片、文本与源码、Markdown、PDF、音频、视频、RTF、DOCX 文本和 Windows 快捷方式。
- 文本预览带语法配色和严格的读取/渲染上限，超长文件不会拖死界面。
- 使用 `dust` 分析文件夹占用，可直接操作分析结果；它与预览互斥地使用同一检查器区域。
- 删除、重命名和不覆盖移动操作支持撤销。
- 支持 Git/SVN 状态、收藏、标签、压缩包、SMB 路径、FTP/SFTP 和云文件状态。
- 使用 Velopack 从 GitHub Releases 或可配置的家庭服务器源进行 portable 自更新，并支持 HTTP/HTTPS 代理。
- 内置多套配色，也可从配置目录加载用户主题包，无需重新编译。

## 下载

请从 [GitHub Releases](https://github.com/RailgunHamster/RHFiles/releases/latest) 下载最新版 portable 压缩包或安装程序。

portable 版本需要完整解压，然后运行解压目录中的 `RHFiles.exe`。请保留同目录下的 `Everything.exe`、`Everything64.dll`、`dust.exe` 等文件。首次使用 Velopack portable 版本后，后续版本可以在软件内下载、覆盖并重启。

当前构建尚未进行代码签名，因此 Windows 可能显示“未知发布者”。

## 搜索方式

搜索默认限定在当前活动文件夹。点击范围按钮或使用可配置快捷键可以切换全局搜索。

- Everything 不可用时，文件夹搜索会自动改用有限时和数量上限的内置递归搜索。
- 全局搜索使用 Everything 索引，以快速搜索整台电脑。
- 普通查询可匹配文件名任意位置，并支持汉字、完整拼音和拼音首字母。
- 搜索工具栏可以切换正则表达式与通配符模式。

标准 Windows 用户若要让 Everything 索引全部 NTFS 磁盘，可能需要启用其服务。RHFiles 会明确提示 IPC 或索引状态，不会让搜索界面无限等待。

## 预览与空间占用

预览和空间占用共用一个检查器区域，并且互斥：打开其中一个会替换另一个。可以在设置中让预览默认打开，也可以将检查器放大到全屏。

音视频是否能直接播放取决于本机 WebView2/Windows 媒体组件支持的编解码器。DOCX 和 RTF 当前提供安全的文本型预览，不会完整还原原始页面排版。

## 主题

RHFiles 内置纸白、深色、暖沙、薄雾、森林和石板主题。用户主题包是放在以下目录中的 JSON 文件：

```text
%APPDATA%\RHFiles\themes\*.json
```

设置界面可以打开主题目录，并立即重新扫描修改后的文件。主题包由亮/暗基础主题和经过校验的 CSS 变量组成；另外仍保留独立的“高级 CSS 覆盖”，供确实需要任意样式修改的用户使用。格式说明见[主题包文档](docs/THEMES.md)。

## 更新与版本历史

自动更新会在启动后、打开设置时以及软件持续运行期间每小时检查一次。关闭自动检查后，这些联网行为不会执行，但仍可手动检查。客户端可从 GitHub 或家庭服务器更新源读取累计版本日志；离线时仍会显示随当前版本内置的历史记录。

## 开发

需要：

- Windows 10/11
- `rust-toolchain.toml` 指定的 Rust 工具链
- Microsoft WebView2 Runtime
- 发布打包需要 .NET 8 与 Velopack CLI 1.2.0

```powershell
cargo check --workspace
cargo test --workspace --locked
./scripts/test-gui.ps1 -Timeout 120
```

构建 release：

```powershell
cargo build --release --locked --package rhfiles-tauri
```

生成 portable 与更新源：

```powershell
./scripts/package-velopack.ps1
```

版本号、标签、GitHub Release 与局域网发布方式见[发布说明](docs/RELEASING.md)。

## 第三方组件

portable 包中包含 Everything 与 `dust`，分发时应保留它们的配套文件和许可证。其他 Rust/JavaScript 依赖记录在 `Cargo.lock` 与源码目录中。
