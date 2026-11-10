# RHFiles 命令行自动化 / Command-line automation

Windows 和 Android 使用同一套 JSON 动作协议（`apiVersion: 1.0`）。接口调用业务函数或控件原有回调，不依赖鼠标坐标、屏幕尺寸或翻译文本。动作名称和参数可在运行时查询。桌面网页动作表也适用于 macOS，但本命令行传输尚不支持 WKWebView。

PDF 阅读使用 `pdf.reader.open {path}`（Android 还需 `name`），在阅读窗口提供 `pdf.reader.state`、`page.set {page}`（从 1 开始）、`previous/next`、`zoom.set {value}`（0.1–5 或 `page-width/page-fit`）、`rotate`、`search {query}`、`search.next/previous`、`search.toggle`、`outline.toggle`、`outline.go {index}`、`password.submit {password}`、`systemOpen` 和 `close`。Windows `saveAs {destination?,overwrite?,expectedTargetRevision?}` 复用自有保存窗口；`media.preferences.set {pdfOpenWith:"rhfiles"|"system"}` 配置默认打开方式。阅读状态不返回文档密码。Windows 关闭动作保留进程内完成回执；Android 关闭阅读会释放分段读取授权。网络文档不建立文件下载任务，使用现有连接按需读取；缺少授权、服务器不支持 Range、文档改变或损坏时明确报错。

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

Windows 的 `--wait` 客户端会在提交前，显式查询 `runs.transport` 能力。启用本机 CDP 自动化时，程序按需提供只读命名管道：不开放 TCP／局域网端口，操作系统拒绝远程管道客户端，并另用本进程随机密钥鉴权。管道只能读取现有运行 ID／key，不支持执行动作；密钥不写配置、不进入状态快照或同步。读取最多 4 KiB 请求／1 MiB 应答、最多 15 个活动连接与一个监听实例，等待仍受原截止时间及 30 秒上限约束。客户端先收到普通应答或结束查询后，断开只释放读取资源，不取消已经提交的工作。

该只读查询与最多八个可信同实例界面的兼容查询竞争取得确认结果；旧版本／其他平台不提供管道能力时仍使用原链路，**两者都不重发动作**。只有匹配原动作及运行身份的回执才报告结果，不能仅凭“窗口不见了”猜测成功；缺失或过期不授权重做。手工后续 `status`／`lookup` 查询仍应选择存在的主窗口或媒体库，例如 `--window window-rhvideo lookup KEY`，而不是已经销毁的播放器。

回执仅在当前进程内保留：最多 32 个活动项、128 个完整结果，以及 4096 个用于阻止旧 key 被自动执行的淘汰标记，保留期为完成后 30 分钟。空间不足会拒绝新的脚本关闭请求，不会悄悄丢掉未过期标识再执行。参数只保存摘要，不落盘；这不是跨应用崩溃或永久的事务日志。物理点击、普通关闭及其他窗口原有的本地动作记录机制不因此改成全局任务调度器。

## 接口覆盖与测试

Windows 设备地址支持 `rh://设备名/共享名/路径`（重名时 `rh://组名@设备名/共享名/路径`）。`devices.resolve {"address":"rh://WINSERVER/D/文档"}` 只读取本机已接受的组成员信息，返回稳定的身份 `path`、`group` 和 `peer`，不进行网络探测；未知或重名时明确报错，不降级到 SMB。`navigation.open` 也接受此短地址；若指向文件则打开父目录并选中文件。`devices.list` 返回对应可读 `address`，历史和收藏仍保存稳定身份路径。

Windows 回收站提供 `recycle.open`、`recycle.list`（分页）、`recycle.filter`、`recycle.sort`、`recycle.select`、`recycle.restore`、`recycle.deleteSelected`、`recycle.empty`、`recycle.copyPaths` 等语义接口。先打开或刷新，再按不透明 `id` 选择；不要把 `id` 当成文件路径。恢复默认跳过同名项目，`keepBoth:true` 保留两份。永久删除仍须完成两次 UI 确认，清空只影响本次确认快照，不影响新进入回收站的项目。

`recycle.empty` 可以从任意位置调用，与回收站顶部按钮及左侧导航“回收站”的右键菜单相同；会重新读取完整列表，不改变当前标签页，不受筛选或选择影响。空回收站直接提示，无法完整读取时拒绝清空。

侧栏整组排序使用 `sidebar.order.get` 获取分组 ID、名称、是否存在和当前可见性。`sidebar.order.set` 接受 `{ "order": ["recycle", "devices", "favorites", "quickAccess"] }`，未列出的分组按默认顺序追加；重复或未知 ID 会被拒绝。`sidebar.groups.move` 接受 `{ "id": "recycle", "target": "devices", "after": false }`，移动整组并保留组内项目和当前导航状态；`sidebar.order.reset` 恢复默认，`sidebar.customize` 打开设置中的顺序配置。它们与拖动手柄、设置箭头共用实现，修改立即保存到 `rhfiles-settings.sidebarSectionOrder`，包含在完整配置备份中。暂时隐藏的云盘、WSL 等分组也保留顺序。

Android 文本查看提供 `preview.text.read {path,maxBytes?}`（默认 256 KiB，最多 1 MiB）、`preview.text.open {path,name}`、`preview.text.state` 与 `preview.text.control {command}`。本地、文档提供器、网络位置和 RHFiles 设备共用内容探测与有限读取，不创建下载任务；JSON、Markdown、日志、CSV、XML、YAML、INI 和常见源码扩展名点击即预览，未知扩展名可从更多菜单选择文本预览。控制命令包括 `source`、`reading`（Markdown）、`formatted`（JSON）、`more`、`previousPart`、`nextPart`、`copy`、`close`。`state` 返回读取／错误状态、编码、截断标记及当前分段，长文本不会一次铺满界面；关闭会取消本次读取与排版。

Android 图片通过 `gallery.mode.set {mode:"paged"|"continuous"}` 切换逐张翻页与自由连续横向滚动，也可在查看器和浏览与显示设置中修改。默认 `paged`；`continuous` 的 `gallery.state.position` 可以是小数，松手后不吸附。`gallery.control {command}` 支持 `previous`、`next`、`zoomIn`、`zoomOut`、`fit`、`rotate`。模式会进入完整配置备份。

Windows 的 `media.preferences.get/set` 分别读取／修改 `imageOpenWith`、`videoOpenWith`（`rhfiles` 或 `system`）和 `imageBrowseMode`（`paged` 或 `continuous`）；设置 → 预览使用相同接口，默认使用内置查看器和逐张翻页。`media.viewer.open {path,pane?}` 显式打开内置查看器，按指定窗格当前排序和筛选后的同类文件组成队列。本地、UNC／SMB 和稳定身份的 RHFiles 设备路径均可使用；图片和设备视频按需读取，不创建远端工作副本。

独立查看器使用 `--window window-file-viewer`：`media.viewer.state` 返回当前文件、队列、图片小数位置、缩放与视频内核状态；`media.viewer.previous/next`、`zoomIn/zoomOut/fit/rotate`、`mode.set {mode}`、`fullscreen`、`systemOpen`、`close` 对应实际控件。`media.viewer.video.control {command,value?}` 支持 `pause/resume/seek/volume/rate`，其中 seek 为毫秒、volume 为 0–100；视频切换后旧输入操作会被拒绝。查看器关闭沿用进程内完成回执及本机查询传输，可通过存活的主窗口查询结果，不会因查看器已关闭而重复执行。

远程单个 APK 的 `files.cacheApk {path}` 立即返回 `jobId`，通过 `tasks.list` 读取缓存进度与最终状态。它使用应用私有工作缓存，最多 2 GiB，校验完整性与 APK 格式后才提供输出；缓存按七天有效期及总预算清理。仅在任务 `completed` 后调用 `files.installCachedApk {jobId}` 打开系统安装确认，缓存失效或任务失败会明确报错。正常点击远程 APK 使用相同后台缓存路径，留在前台时自动交接系统安装器；离开界面后可从已完成任务点击安装。接口不绕过 Android 的未知来源授权或安装确认。

回收站也是普通标签页中的虚拟位置 `recycle://`：支持地址栏、标签页复制、前进/后退，以及左右窗格。`recycle.open` 的 `pane` 指定窗格，`newTab:true` 新建标签页；筛选、排序和选择分别保存在每个标签页。通用的导航、标签页和选择接口也适用于这个位置。项目的 `path` 为只读标识 `recycle://<id>`，不能用于文件系统读写、预览、终端、粘贴或拖拽操作；需先恢复到真实路径。

`npm test` 先检查第一方网页 UI 绑定是否全部使用动作表，再跑业务测试。新增按钮、快捷键、菜单和手势须通过 `RHFilesUI.listen/assign` 接入，不能直接另写未登记的监听器。HTML 内联回调在查询时登记；第三方组件、系统 UI、生命周期通知不机械改写。

`npm run test:automation-ui` 在真实浏览器中核对接口/物理点击的回调一致性、顺序、输入校验、禁用/隐藏状态、一次性监听、动态控件失效和删除确认。Android 原生入口另有 JVM/模拟器验证。

---

放映的当前项目通过 `rhvideo.viewer.state` 的 `current`、`favorite`、`loading` 查询；`rhvideo.viewer.favorite` 与界面收藏按钮调用同一动作。截图收藏作用于源视频，不会播放视频。切换未完成时拒绝收藏／标记，不把新索引误当作已经显示的内容。收藏放映的队列取自开启时的完整筛选结果，取消收藏不改变正在播放的快照；重新开启收藏放映从第一项开始。普通图片放映的进度记忆独立保留。

Android 文件列表提供 `files.scroll.state`（是否可滚动、当前位置与比例）和 `files.scroll.to {ratio:0..1}`。拖动右侧触控滑块与接口使用同一滚动逻辑，保持虚拟列表；单屏列表自动隐藏滑块。

连续图片自动滚动：Android 使用 `gallery.auto.start/pause/toggle`、`gallery.auto.speed.set {speed}`；Windows 使用 `media.viewer.auto.start/pause/toggle`、`media.viewer.auto.speed.set {speed}`。速度范围为 10–6000 像素／秒，状态随图片查看器一起查询，按当前队列首尾循环；单张图片不启动滚动，隐藏或关闭查看器时暂停。空格切换开始／暂停，输入框和按键重复不会触发。模式使用双按钮切换。

Windows 图片菜单：`media.viewer.context.open {index?}` / `context.close`；`media.viewer.saveAs {index?,destination?,overwrite?,expectedTargetRevision?}`；`media.viewer.copyPath {index?}`；`media.viewer.systemOpen {index?}`。省略保存位置时打开 RHFiles 保存窗口；脚本位置可用本地／SMB 完整路径或 RHFiles 设备身份 URI，已有文件默认拒绝覆盖。文件以临时暂存和版本校验后提交，保留源文件；RHFiles 设备图片同样可另存到本地。`media.viewer.state` 返回 `caption`（鼠标、菜单或当前位置来源）、`contextMenu` 和 `saveTask`。保存进度同时显示在查看器和主窗口任务中心，`media.viewer.save.dismiss` 只收起提示，不取消文件传输。

Windows 共用保存窗口：`save.dialog.choose {name,directory?}` 可单独选择保存位置，返回 `{picked,target}`，不写入目标文件。图片另存为、RHVideo JSON 配置和 ZIP 导出均使用同一个 RHFiles 窗口，支持本地、UNC/SMB 与 RHFiles 设备；图片 `destination` 及配置/ZIP `path` 参数同样接受设备身份 URI。

在 `--window window-save-dialog` 上调用 `save.dialog.state`、`navigate {path}`、`up/back/forward/refresh`、`entries {offset?,limit?}`、`select/activate {path}`、`name.set {name}`、`type.set {type:"original"|"all"}`、`filter.set {query}`、`hidden.set {visible}`、`folder.open/cancel/create {name}`、`confirm`、`replace.confirm/cancel`、`cancel`。`confirm` 遇到同名文件返回冲突及版本；`replace.confirm` 只批准该版本，文件再次变化时重新显示冲突。确认／取消使用持久完成回执，CLI `--wait run` 可在窗口关闭后取得结果。关闭发起窗口会取消选择；不会自动重放保存操作。

图片定位：Windows `media.viewer.seek {index}`、Android `gallery.seek {index}`（零基序号）。拖动进度条只预览，提交后定位，使用当前队列原有排序；查看器首尾循环。Windows `media.viewer.window.state` 可核对最大化／全屏状态。

Android `files.createDirectory {name}` 和 `files.createFile {name}` 在当前实际目录中创建，UI 与 API 共用同一路径、权限和冲突规则；远程创建失败不会自动重放。

Windows `updates.readiness` 返回本机活动文件任务数、文件服务器活动请求数、阻塞原因和建议等待时间。自动安装等待复制、移动等任务、WebDAV／设备协议传输及后台变更结束，再持续空闲 30 秒；分块间隙不会视为已空闲。仅在有待处理更新时检查本机活动状态，沿用已检查的版本与已校验的包，不重复请求更新源。安装交接与服务器请求接收互斥，失败会解除暂停；历史 tus 上传回执不会永久阻止更新。`updates.autoInstall.set {enabled:false}` 同时清除待更新计时器。

## English

Windows `updates.readiness` reports active local file tasks, active file-server requests, blocking reasons and a suggested delay. Automatic installation waits for local tasks, WebDAV/device transfers and detached mutations, then for 30 idle seconds across chunk gaps. Pending updates check local activity only and reuse their exact checked version and verified package. Final installation reserves request admission atomically; failure releases it. Durable completed tus receipts do not keep the server busy. Disabling auto-install also clears its deferred timer.

Image seeking uses `media.viewer.seek {index}` on Windows or `gallery.seek {index}` on Android. The zero-based index follows the current queue order, with circular navigation. Windows exposes `media.viewer.window.state` to verify maximized/fullscreen state. Android exposes `files.createDirectory {name}` and `files.createFile {name}` in the current directory, using the same permission and conflict checks as its UI without replaying failed writes.

Android exposes `files.scroll.state` and `files.scroll.to {ratio:0..1}` for the same virtualized list scroll used by its touch handle. Continuous image auto-scrolling exposes `gallery.auto.start/pause/toggle` and `gallery.auto.speed.set {speed}` on Android, or `media.viewer.auto.start/pause/toggle` and `media.viewer.auto.speed.set {speed}` on Windows. Speed is 10–6000 pixels/second; Space toggles playback outside editable fields, without repeated toggles when held. It follows the circular queue, stays stopped for one image, and pauses when the viewer is hidden or closed.

Windows image menus expose `media.viewer.context.open {index?}`, `context.close`, `saveAs {index?,destination?,overwrite?,expectedTargetRevision?}`, `copyPath {index?}`, and `systemOpen {index?}`. Save As uses the shared RHFiles picker unless a local/UNC path or device identity URI is specified. It refuses implicit overwrites, checks revisions, and atomically commits the copy without changing its source. Both local files and RHFiles devices can be save destinations. Viewer state includes the pointer/menu/position-based `caption`, `contextMenu`, and `saveTask`; dismissing its progress card with `media.viewer.save.dismiss` does not cancel the transfer.

RHFiles exposes a versioned JSON action registry for desktop and Android. Use Node.js 22+ and `scripts/rhfiles-api.mjs`; discover available actions and parameter schemas with `list` and `describe`.

Desktop requires an explicit `RHFILES_CDP_PORT` launch environment variable. Android requires the device-local ADB automation setting and an authorized, explicitly selected ADB device. No LAN listener is added. Treat debugging access as highly privileged; never expose it to untrusted programs.

Actions call existing business functions or registered UI callbacks, not coordinate-based clicking. Long operations return run IDs. Query their results instead of retrying writes after a timeout. Idempotency keys prevent duplicate submission only within the current app process, not across crashes.

Use semantic actions for production scripts. UI callback completion may only mean that a dialog opened or a background job was submitted. Confirm task results and filesystem state. Destructive confirmations remain in place; system-owned permission, installer and chooser windows cannot be bypassed.

Windows RHVideo player/grid self-close runs retain bounded process-owned completion receipts. If the producer disappears, the CLI only reads matching run/key status from remaining trusted app views; it never resubmits the action or assumes disappearance means success. Select a surviving main/library window for later lookups. Receipts are memory-only and do not provide a cross-crash transaction guarantee.

Windows file-video playback exposes `media.viewer.video.skip {seconds}` (signed, up to 600 seconds), `media.viewer.video.control {command:"volume",value:0..100}` and `media.viewer.fullscreen.set {fullscreen}`. The live slider and mouse wheel use the same coalescing volume path. `media.preferences.set {videoSeekSeconds:1..600}` configures arrow-key seeking, default 5 seconds. F toggles true full-video fullscreen, Escape exits fullscreen before closing, and pointer movement reveals controls without changing video geometry. State includes `fullscreen`, `controlsVisible` and `videoSeekSeconds`.

Windows focused image viewing exposes `media.viewer.focus.enter {index?}`, `.state`, `.zoom {scale,x?,y?}`, `.pan {x,y}`, `.fit` and `.exit`. Double-clicking a rendered image uses these same actions. Zoom is 0.1–16 relative to fit; optional pointer coordinates keep that image point anchored. Left dragging pans independently of the original strip, and Escape exits the context menu first, then focused viewing. Exiting preserves the original mode/position and leaves automatic scrolling paused. The usual image Save As/copy-path context menu remains available.
