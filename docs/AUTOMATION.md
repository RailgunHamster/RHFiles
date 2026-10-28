# RHFiles 命令行自动化 / Command-line automation

Windows 和 Android 使用同一套 JSON 动作协议（`apiVersion: 1.0`）。接口调用业务函数或控件原有回调，不依赖鼠标坐标、屏幕尺寸或翻译文本。动作名称和参数可在运行时查询。桌面网页动作表也适用于 macOS，但本命令行传输尚不支持 WKWebView。

### RHVideo 配置备份动作（开发版）

媒体库窗口提供 `rhvideo.configuration.export`、`rhvideo.configuration.preview`、`rhvideo.configuration.restore` 和只读 `rhvideo.configuration.state`。导出／预览可省略 `path` 使用原生选择器；脚本也可直接指定 Windows 本机完整文件路径，或 Android 已获授权的 `content://` 文档 URI。Windows 脚本导出不会覆盖已有文件。备份正文不经过命令行参数或 Android 消息桥，最多读取 20 MiB。

```powershell
node scripts/rhfiles-api.mjs --window window-rhvideo --wait run rhvideo.configuration.export '{"path":"D:\\Backups\\RHVideo.json"}'
node scripts/rhfiles-api.mjs --window window-rhvideo --wait run rhvideo.configuration.preview '{"path":"D:\\Backups\\RHVideo.json"}'
# 先检查 preview 中的匹配／冲突，再使用这次返回的 ticket 确认合并。
node scripts/rhfiles-api.mjs --window window-rhvideo --wait run rhvideo.configuration.restore '{"ticket":"本次预览返回的标识"}'
```

Android 选择器可能返回 `requested: true`；应读取 `configuration.state` 的 `busy`、`waiting` 和 `message` 获取最终结果，不要重复提交。预览不会修改服务器记录，恢复确认只消费一次；已经合并但偏好保存或列表刷新失败时返回 `applied: true` 和 `clientWarning`，不能把它当成尚未执行的写操作自动重试。以上接口不提供任意 URL、SQL 或服务器文件路径代理。

## 开启与调用

需要 Node.js 22 或更新版本。默认没有自动化网络监听器；调试接口仅供受信任的本机脚本使用。调试本身拥有很高权限，不能向局域网转发端口，也不要给不可信网页或程序访问。

Windows PowerShell：

```powershell
$env:RHFILES_CDP_PORT='9222'
& 'C:\path\to\RHFiles.exe'
node scripts/rhfiles-api.mjs --port 9222 info
node scripts/rhfiles-api.mjs --port 9222 list
node scripts/rhfiles-api.mjs describe navigation.open
node scripts/rhfiles-api.mjs --wait run navigation.open '{"path":"D:\\Data"}'
node scripts/rhfiles-api.mjs --wait run files.list '{"limit":100}'
```

关闭应用并移除变量后恢复正常启动。已运行的实例不会因为再启动一次而自动开放调试端口。

Android：在“设置 → 关于与诊断”开启“ADB 自动化”，授权自己的电脑连接 ADB，并保持 RHFiles 已打开。这个开关默认关闭，既不进入配置备份也不参与 WebDAV 同步。

```powershell
node scripts/rhfiles-api.mjs --android emulator-5584 info
node scripts/rhfiles-api.mjs --android emulator-5584 --pane left --wait run files.list '{}'
node scripts/rhfiles-api.mjs --android emulator-5584 --pane host --wait run panes.layout '{"mode":"rows"}'
node scripts/rhfiles-api.mjs --android emulator-5584 --wait run native.media.state '{}'
node scripts/rhfiles-api.mjs --android emulator-5584 --scope reader state
```

客户端只转发指定设备的 WebView 调试 socket，退出后删除自己创建的转发。它不安装 APK、不启动手机应用、不操作手机屏幕。播放器在主进程中，通过 `native.media.*` 调用；电子书有独立的受限 `reader` scope，不向书籍内容提供文件管理器权限。

## 查找与调用操作

- `list` / `describe ACTION`：列出动作及 JSON 参数 schema。
- `state`：窗口、窗格、当前位置、选择状态，以及当前可见弹窗；密码类字段不返回明文。
- `run ACTION JSON`：返回运行 ID。耗时任务继续执行；`status ID` / `wait ID` 查询结果。
- `ui`：列出当前控件，包括 `controlId`、程序 ID、目标路径、事件、启用状态和来源绑定。动态控件要在当前界面重新查询，旧 ID 不可跨重启保存。
- `batch`：从标准输入逐行读取 JSON-RPC 2.0 请求，每行输出一个响应。

常见语义动作：`navigation.*`、`selection.*`、`files.*`；桌面还有 `tabs.*`、`command.*`、`tasks.*`，Android 的双窗格使用 `--pane`。具体平台支持的名称以 `list` 为准，不存在的动作返回错误，不会悄悄当作成功。

界面层：`ui.invoke` 直接调用控件已登记的事件回调；`ui.set` 设置字段并走输入/变更处理；`ui.scroll`、`ui.focus`、`ui.media` 对应滚动、聚焦和播放控件。原生 Android 窗口使用 `native.ui.*`。第三方 3D 相机提供 `preview3d.camera`（预览打开后可查询）。CSS 子菜单可通过 `ui.submenu` 展开。

系统自己的安装器、权限授权、文件选择器、分享目标窗口不属于 RHFiles 接口，不会绕过系统授权。Android 7–9 的原生枚举仅覆盖 Activity；Android 10+ 也可枚举本应用进程的弹窗。接口不注入其他应用。

“回调结束”不总等于文件任务结束：某些 UI 按钮仅打开弹窗或提交后台任务。生产脚本优先使用语义动作，并核对返回的状态、文件任务结果及最终目录，不能把 `accepted: true` 当成复制成功。

## 确认、超时与错误

复制/移动/重命名沿用应用的文件夹合并、冲突和确认流程。删除不跳过正常确认。永久删除按钮还要求本次 `ui` 返回的 `confirmationToken` 和 `acknowledge:true`；令牌一次性使用。

调用 `run` 时建议指定业务唯一 `--key`。同一应用实例中，同一个 key 和参数只执行一次；相同 key 不同参数报冲突。已过期结果不会自动重做。key 只在当前进程保留，不能作为跨崩溃的事务保证。

若提交时断线、没有拿到运行 ID，可用 `lookup KEY` 查询当前实例中的记录；客户端提交失败会在错误详情中附上 key，不包含原始参数。

```powershell
node scripts/rhfiles-api.mjs --key my-copy-20261022 run files.transfer '{"paths":["D:\\Data\\a.txt"],"destination":"D:\\Backup","operation":"copy"}'
node scripts/rhfiles-api.mjs status 'INSTANCE:RUN'
```

JSON 输出包含 `result` 或结构化 `error`，失败返回非零退出码。`--wait` 最多等一次 30 秒；仍在运行就继续查询运行 ID。客户端断线或超时不会取消已经提交的工作，更不能自动重复写操作。多窗口必须用 `--target` 或桌面的 `--window` 明确选择，避免修改错误窗口。

### 会关闭自身的 RHVideo 窗口

Windows 播放器的 `rhvideo.player.close`／`back` 和同屏窗口的 `rhvideo.grid.close` 会真正销毁对应窗口、释放原生播放器，不保留隐藏 WebView 来维持脚本连接。这些通过 `run` 发起的操作把完成回执保存在应用进程里；`ui.invoke` 点击返回按钮仍返回原来的 `{controlId,event}` 格式。

若该请求因为窗口消失而断开，命令行在剩余超时预算内、最多检查八个可信的同实例界面，只查询运行 ID／key 和完成状态，**不重发动作**。只有查到匹配动作的回执才报告结果，不能仅凭“窗口不见了”猜测成功；没有记录仍报未确认。后续查询应选择仍存在的主窗口或媒体库，例如 `--window window-rhvideo lookup KEY`，而不是已经销毁的播放器。

回执仅在当前进程内保留：最多 32 个活动项、128 个完整结果，以及 4096 个用于阻止旧 key 被自动执行的淘汰标记，保留期为完成后 30 分钟。空间不足会拒绝新的脚本关闭请求，不会悄悄丢掉未过期标识再执行。参数只保存摘要，不落盘；这不是跨应用崩溃或永久的事务日志。物理点击、普通关闭及其他窗口原有的本地动作记录机制不因此改成全局任务调度器。

## 接口覆盖与测试

Windows 回收站提供 `recycle.open`、`recycle.list`（分页）、`recycle.filter`、`recycle.sort`、`recycle.select`、`recycle.restore`、`recycle.deleteSelected`、`recycle.empty`、`recycle.copyPaths` 等语义接口。先打开或刷新，再按不透明 `id` 选择；不要把 `id` 当成文件路径。恢复默认跳过同名项目，`keepBoth:true` 保留两份。永久删除仍须完成两次 UI 确认，清空只影响本次确认快照，不影响新进入回收站的项目。

回收站也是普通标签页中的虚拟位置 `recycle://`：支持地址栏、标签页复制、前进/后退，以及左右窗格。`recycle.open` 的 `pane` 指定窗格，`newTab:true` 新建标签页；筛选、排序和选择分别保存在每个标签页。通用的导航、标签页和选择接口也适用于这个位置。项目的 `path` 为只读标识 `recycle://<id>`，不能用于文件系统读写、预览、终端、粘贴或拖拽操作；需先恢复到真实路径。

`npm test` 先检查第一方网页 UI 绑定是否全部使用动作表，再跑业务测试。新增按钮、快捷键、菜单和手势须通过 `RHFilesUI.listen/assign` 接入，不能直接另写未登记的监听器。HTML 内联回调在查询时登记；第三方组件、系统 UI、生命周期通知不机械改写。

`npm run test:automation-ui` 在真实浏览器中核对接口/物理点击的回调一致性、顺序、输入校验、禁用/隐藏状态、一次性监听、动态控件失效和删除确认。Android 原生入口另有 JVM/模拟器验证。

---

放映的当前项目通过 `rhvideo.viewer.state` 的 `current`、`favorite`、`loading` 查询；`rhvideo.viewer.favorite` 与界面收藏按钮调用同一动作。截图收藏作用于源视频，不会播放视频。切换未完成时拒绝收藏／标记，不把新索引误当作已经显示的内容。收藏放映的队列取自开启时的完整筛选结果，取消收藏不改变正在播放的快照；重新开启收藏放映从第一项开始。普通图片放映的进度记忆独立保留。

## English

RHFiles exposes a versioned JSON action registry for desktop and Android. Use Node.js 22+ and `scripts/rhfiles-api.mjs`; discover available actions and parameter schemas with `list` and `describe`.

Desktop requires an explicit `RHFILES_CDP_PORT` launch environment variable. Android requires the device-local ADB automation setting and an authorized, explicitly selected ADB device. No LAN listener is added. Treat debugging access as highly privileged; never expose it to untrusted programs.

Actions call existing business functions or registered UI callbacks, not coordinate-based clicking. Long operations return run IDs. Query their results instead of retrying writes after a timeout. Idempotency keys prevent duplicate submission only within the current app process, not across crashes.

Use semantic actions for production scripts. UI callback completion may only mean that a dialog opened or a background job was submitted. Confirm task results and filesystem state. Destructive confirmations remain in place; system-owned permission, installer and chooser windows cannot be bypassed.

Windows RHVideo player/grid self-close runs retain bounded process-owned completion receipts. If the producer disappears, the CLI only reads matching run/key status from remaining trusted app views; it never resubmits the action or assumes disappearance means success. Select a surviving main/library window for later lookups. Receipts are memory-only and do not provide a cross-crash transaction guarantee.
