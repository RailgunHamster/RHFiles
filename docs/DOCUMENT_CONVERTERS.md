# Markdown → PDF（Windows）

选中一个 `.md` / `.markdown` 文件，右键选择“生成为 → PDF”。默认在原目录生成同名 PDF，可修改输出文件名和转换器。默认引擎是本地 Markdown 渲染 + Windows WebView2 PDF 打印，不上传内容、不需要另外安装 Office。

转换的 HTML、暂存 PDF 位于当前实例数据目录的 `cache/document-conversions/job-*`，不放在原文件旁。成功、失败、取消后自动清理；异常退出的任务下次启动时回收，正在转换的任务通过锁保护。WebView2 使用实例自身的浏览器缓存，不再为每次转换创建临时浏览器配置。旧版本在用户文件夹留下的未知 `.rhfiles-pdf-*` 不会自动删除，以免误删。

支持 UTF-8 中文、表格、任务列表、代码块、分页和同目录及子目录中的图片。原始 HTML 作为文字显示，网络图片不会下载，图片不能越出 Markdown 所在目录。内置限制：Markdown 16 MiB、单张图片 8 MiB、图片合计 20 MiB、PDF 100 MiB。已有 PDF 不会被覆盖；请改名后再转换。

## 不重新编译，接入其他本地转换器

在转换窗口展开“本地转换器配置”可看到当前实例的 `document-converters.json` 路径；也可以在“设置 → 文件”点击“编辑转换器配置”。保存后重新打开转换窗口即可生效，配置随 Windows 用户/虚拟桌面实例隔离。

例如已经自行安装 WeasyPrint，可将配置改为（路径要替换成真实路径）：

```json
{
  "schemaVersion": 1,
  "default": "builtin",
  "converters": [
    { "id": "builtin", "name": "RHFiles / Microsoft WebView2", "kind": "builtin" },
    {
      "id": "weasyprint",
      "name": "WeasyPrint（本机）",
      "kind": "command",
      "executable": "C:\\Tools\\WeasyPrint\\weasyprint.exe",
      "arguments": ["{html}", "{output}"],
      "timeoutSeconds": 120
    }
  ]
}
```

`executable` 必须是绝对路径；`arguments` 是独立参数数组，不是 CMD / PowerShell 命令行。不自动下载安装转换器。

| 占位符 | 值 |
| --- | --- |
| `{input}` | 原 Markdown 完整路径 |
| `{output}` | 临时 PDF 输出路径（必须写出 PDF，校验后 RHFiles 发布到最终文件名） |
| `{html}` | RHFiles 生成的安全 HTML，包含打印 CSS 和内嵌本地图片 |
| `{directory}` | Markdown 所在目录，也是转换器工作目录 |

占位符只扫描一次，文件名中的占位符不会二次展开。也支持直接读取 `{input}` 的转换器，例如 Pandoc；其 PDF 引擎和依赖需自行配置。修改 `default` 可更换默认转换器，`id` 必须唯一并与默认 ID 对应。

任务面板显示转换状态（内置引擎没有逐页百分比），支持取消和超时。错误包含退出码及有长度上限的标准错误输出。只运行用户明确配置的本地程序，切勿使用不可信的配置或程序；第三方转换器读取原文件时，其安全策略由该程序决定。

## English

Windows: right-click a single Markdown file → **Generate as → PDF**. The default local renderer uses WebView2, with no document upload. Existing output files are never overwritten. Staging is private to the instance cache and cleaned after success, failure or cancellation; startup recovers marked abandoned jobs without deleting active tasks or unknown files in user folders.

Edit the per-profile `document-converters.json` from Settings → Files or the conversion dialog. Command providers use an absolute executable and an argument array, not shell concatenation. `{input}`, `{output}`, `{html}` and `{directory}` are substituted once; output is staged, checked for a bounded PDF header, then published with exclusive creation. Dependencies for custom converters are user-managed.
