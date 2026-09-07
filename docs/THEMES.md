# RHFiles theme packs / RHFiles 主题包

[English](#english) · [简体中文](#简体中文)

## English

User themes live in `%APPDATA%\RHFiles\themes\*.json`. Open **Settings → Appearance → Open theme folder**, create or edit a JSON file, then choose **Reload themes**. No RHFiles rebuild or restart is required.

Each file contains one theme. The `id` must be unique among user themes; RHFiles exposes it internally as `user:<id>`, so it cannot replace a built-in theme. `base` selects the complete light or dark default variable set. `variables` only contains the values that the theme wants to override.

```json
{
  "$schema": "https://raw.githubusercontent.com/RailgunHamster/RHFiles/main/docs/theme.schema.json",
  "schemaVersion": 1,
  "id": "ocean-calm",
  "name": {
    "en": "Ocean Calm",
    "zh-CN": "静海"
  },
  "base": "dark",
  "variables": {
    "--bg": "#132027",
    "--bg-card": "#1b2b34",
    "--text": "#edf6f7",
    "--accent": "#62c6c8",
    "--accent-light": "rgba(98,198,200,.18)"
  }
}
```

Files are limited to 256 KiB. Unknown variables, CSS statement delimiters, invalid IDs, and unsupported schema versions are rejected. Errors are shown in Settings and do not stop valid themes from loading.

Theme packs are the recommended way to change a coherent color system. The **Advanced CSS override** is loaded after the selected theme and is intentionally unrestricted; use it for layout or component-level experiments that cannot be represented by theme variables.

## 简体中文

用户主题放在 `%APPDATA%\RHFiles\themes\*.json`。进入**设置 → 外观 → 打开主题文件夹**，新建或修改 JSON 后点击**重新加载主题**，不需要重新编译或重启 RHFiles。

每个文件只定义一套主题。`id` 必须在用户主题中唯一；RHFiles 内部会使用 `user:<id>`，因此用户文件不会覆盖内置主题。`base` 选择完整的亮色或暗色基础变量，`variables` 只填写这套主题需要覆盖的值。

配置示例见上方。主题文件最大为 256 KiB。未知变量、CSS 语句分隔符、非法 ID 和不支持的格式版本会被拒绝；设置界面会显示错误，但其他有效主题仍可正常加载。

主题包适合修改完整、协调的配色系统。“高级 CSS 覆盖”会在主题包之后加载，并且刻意不做限制；只有需要修改布局或具体组件、主题变量无法表达时才建议使用。

The machine-readable schema is available at [`theme.schema.json`](theme.schema.json).
