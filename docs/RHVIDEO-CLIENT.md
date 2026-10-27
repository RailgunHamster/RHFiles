# RHVideo 内置客户端（Windows / Android）

这是 RHFiles 内的 RHVideo 客户端，不附带 RHVideo 服务，不直接读取 SQLite 文件，也不加载 RHVideo 网站。

## 使用

1. 在 RHFiles 左侧点击 RHVideo，打开应用自己的媒体库窗口。
2. 点击“连接 RHVideo”，填写已有服务器地址、用户名和密码。
3. 浏览视频、图片、小说、收藏；支持中文/拼音/首字母混合搜索、八种双向排序及嵌套标签规则。
4. 视频直接播放，或从关键帧时间轴定位。连播使用完整筛选队列，不限当前页；可以选择分段、全长、竖屏、低带宽版本、循环和断点记忆。多视频可同屏播放并切换上一组/下一组。
5. 图片支持全列表前后切换、随机、缩放、横/竖向虚拟条带和自动放映；小说支持目录搜索、章节/滚动进度、主题/字号/行距及分章速览。
6. “服务器”内管理监控目录、处理队列、原片替换、30 天暂存、存储统计及服务状态。删除和替换先预览、再确认，不在本机直接操作服务器文件。

单击视频只打开点击的文件，不受连播的多选、竖屏或分段条件影响。只有显式启动连播才准备完整队列。“循环”指当前视频或片段，不是回绕整个队列。Windows 的结束切换/循环由原生控制器推进，界面只读取状态，不依赖 WebView 定时器；失败在 `player.state.automationError` 中可见，不自动重放失败切换。播放器的返回入口不会停止独立的同屏播放。

当前 Windows 原生播放使用 64 位 VLC 3.x 的 libVLC。自动检测系统安装目录或程序旁的 vlc/ 目录。不启动 vlc.exe，没有 HTML video 或网页播放器兜底。未安装内核时，浏览、图片和阅读仍可使用，播放会明确提示缺失。

普通 Windows 桌面采用原生硬件自动解码/输出，不经过网页像素传输或 1080p 帧缓冲限制。RDP 或显式兼容模式保留有界 GDI 画布。仅在确实收到显示帧之间插值进度；无帧、暂停或缓冲时不凭墙钟伪造进度。4K/HDR、设备间性能比较仍需独立实测，不能仅因启用原生模式就认定性能达标。

Android 从侧栏 RHVideo 打开，使用适配手机和平板的同一套媒体库与服务器管理。视频使用 Media3，无需安装 VLC；完整大队列只向原生播放器交付附近最多 21 项，避免过大的 Binder 参数。系统返回先关闭当前图片、阅读器或对话框，然后回到文件管理器。

实现和验收状态逐项记录在 [RHVideo 功能对齐清单](RHVIDEO-PARITY.md)。没有完成的性能比较、真实手机或服务重启验收不会用模拟结果冒充。

## 数据与边界

- 登录、媒体清单、收藏、章节、阅读进度、关键帧使用 RHVideo 现有 HTTP API。
- 增加收藏使用 PUT /api/v1/favorites/{type}/{id}，取消使用 DELETE。
- 服务器写入只通过固定业务接口。源文件暂存、原片替换、清理和重启会明确显示影响；不提供任意 URL/SQL/服务器路径执行代理。
- 本地只保存服务器地址和用户名；密码不保存，令牌仅存在原生内存。重启后需要重新登录。
- HTTP 登录没有传输加密，跨公网请使用 HTTPS 或可信 VPN。
- Windows 媒体通过仅绑定 127.0.0.1 的临时通道；Android 图片使用原生拦截的应用内资源路径，视频通过原生 Media3 DataSource 读取。两端都只允许登记的随机媒体标识；令牌不进入网页、播放器参数或磁盘。
- 禁止重定向转发登录信息，校验 TLS 证书。退出后旧媒体链接失效，正在读取的流也会终止。
- 缩略图懒加载，卡片分页；原生视频按流读取，不把整个电影下载到内存。
- 窗口复用主窗口的真实 WebView2 环境，避免串配置和重复创建浏览器环境。

## 自动化

新增的页码跳转、摘录搜索、截图逐张浏览/原清单定位、任务图片放大、阅读器目录/收藏及统一音量，同样是公开动作，不是只能点 UI 的特殊逻辑：`rhvideo.page.jump`、`rhvideo.gallery.jump`、`rhvideo.novel.previewSearch`、`rhvideo.gallery.inspect`、`rhvideo.image.reveal`、`rhvideo.image.preview`、`rhvideo.reader.toc`、`rhvideo.reader.favorite`、`rhvideo.volume.set`。统一音量默认 20%，与单个视频的音量相乘，静音后恢复不会丢失各格音量；不修改 Windows/Android 系统音量或普通本地播放器。

章节速览每页 40 章、每章最多 720 字，搜索标题和摘录，支持拼音；界面明确显示“本页”范围，可以继续翻页查找，不无限拉取整本正文。截图浏览支持完整筛选队列的前后切换、“播放此刻”以及定位到源视频所在的清单页。

批量暂存执行中可用 `rhvideo.selection.progress` 查看进度，或带本次 `ticket` 调用 `rhvideo.selection.stop`，只停止尚未发送的项目；不撤销已经提交的请求，旧 ticket 不控制后来的任务。完成/失败后停止按钮移除，失败项不自动重试。

所有界面操作使用 RHFilesAPI 注册动作。不是另写一套“测试专用操作”：UI 与脚本调用相同处理函数。`list` 返回参数 schema、风险级别，`rhvideo.ui.contract` 逐个枚举真实控件并报告没有接口的控件（包括尚未标注的新按钮，不会只检查已标注按钮）。输入框也可通过通用 `ui.set` 填写，再调用对应提交操作。

固定远程操作清单在 `src/rhvideo-operations.json`，两端原生层校验方法、路径、参数、上限和危险确认。网页拿不到登录令牌，也不能自行指定任意远程接口。

现有本机 CLI 可选择窗口调用：

    node scripts/rhfiles-api.mjs --port 9222 --window main run rhvideo.open --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo list
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo run rhvideo.category '{"kind":"picture"}' --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo run rhvideo.sort '{"value":"dateAsc"}' --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo run rhvideo.ui.contract --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo run rhvideo.server.open '{"page":"tasks"}' --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo-player run rhvideo.player.next --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo-grid run rhvideo.grid.page '{"direction":1}' --wait

Android 开启设置中的“ADB 自动化”后，可通过已授权的 ADB 连接调用同一组界面动作，例如：

    node scripts/rhfiles-api.mjs --android SERIAL run rhvideo.open --wait
    node scripts/rhfiles-api.mjs --android SERIAL --window window-rhvideo list

接口仅在用户显式启用本机自动化后可调用。不要把真实密码写进命令行历史，可使用 CLI 的 JSON 行输入。UI 与脚本走同一原生接口。

批量暂存使用 `selection.toggle` → `selection.snapshot` → `selection.stage`，最后返回一次性 ticket，须显式调用两次 `confirm.advance`。ticket 与账户、当前会话、选中快照绑定并在提交前消费，2 分钟后失效；失败只返回逐项结果，不自动重试。`selection.result` 可查询本次结果。正常复制/移动等文件任务的终态规则不受媒体库功能影响。

Windows 0.1.88 的播放行为单独对齐参考源码：`playlist.start` 是截图浏览位置开始的去重分段队列，`playlist.sequential` 是当前过滤后完整视频列表的顺序队列，传 `{ "super": true }` 使用独立的超压顺序队列；不再把它们合并到一个模式下拉中。三者分别保存位置和设置，只有 ID 与顺序完全一致才恢复游标。`player.seekQueue` 以 `ratio: 0..1` 定位整个队列，普通 `player.control` 的 seek 仍按当前视频的毫秒数定位。

`player.back` 返回父截图，`player.next/previous` 在截图打开的单视频中返回父队列并移动一张；`player.close`／Esc 才关闭整层预览。连播的手动前后切换回绕，自动结束不回绕。`player.favorite`、`player.mark` 分别收藏和标记暂存当前视频。预览标记与列表多选不同，`preview.pending` 查看标记，关闭预览后仅提交一次；`preview.state` 只读查询结果，`preview.result` 打开逐项结果 UI。失败不重新放回标记池，后续关闭不会重放旧写入。

Windows 0.1.89 开发分支增加 `player.options {"portraitOnly":true}`，在不可变的完整原队列上投影竖屏项；取消后恢复顺序，少于两项时拒绝操作、保留当前播放。各模式分别保存筛选、速度、位置和全长选择。播放器窗口的该动作以读取到的 ID／队列版本发起原生请求，拒绝迟到的旧目标设置。切换服务器后窗口同步新的 `generation`。

`image.seek {"ratio":0.5}` 定位完整图片／截图集合，使用 `round(ratio * (count - 1))`，不是视频时间轴。`image.favorite` 收藏当前预览（截图收藏源视频），不受当前卡片页限制。`image.playVideo` 从头播放截图源视频，`image.playFrame` 跳到截图时间点；返回事件必须同时匹配 `generation`、`parentKey` 和独立的 `parentPreview`。`image.state` 的缺失字段用 `null` 返回，关闭状态及非媒体库任务图片也保持有效 JSON。自定义图片快捷键取代旧键，不叠加隐藏的默认绑定。

全长播放缺少时长元数据时，沿用参考客户端的 86400 秒保护长度，而非三秒片段；原生解码器正常的结束事件仍会前进或关闭。上述开发改动尚未发布为 0.1.89 完整安装包，也不代表 Android 原生控制已同步。

处理队列、任务/批次详情及存储扫描通过 `rhvideo.server.liveRefresh` 只读更新，`rhvideo.server.refreshState` 返回刷新是否启用、暂停、进行中及失败原因。仅可见且仍运行的任务定期读取；后台、关闭、被其他弹窗覆盖或编辑输入时暂停。连续三次读取失败后停止，手动刷新才重置失败预算，不会重放服务器写操作。

成功写入会立即失效相关清单缓存；比写入更早发出的旧清单不能覆盖新索引。若写入成功但刷新失败，接口仍返回成功结果，并附 `clientWarning`；请核对或手动刷新，不要据此重复写入。导出在提交系统保存窗口前按 UTF-8 检查 32 MiB 上限。

`rhvideo.state` 返回当前 `generation`。面向具体媒体 ID 的自动化可将它作为远程操作的 `expectedGeneration`；切换服务器、重新登录后旧版本请求会在执行前被拒绝。确认票据与批量操作也固定到发起时的会话，不把未完成项目自动迁移到新账号。连接状态最多复用 5 秒，显式刷新立即复核；后端每次操作仍核对会话版本。

Android 原生播放界面的控件通过 `native.media.state/control`、网格通过 `native.grid.state/control` 调用。`track.select`、`track.auto`、`subtitles` 分别选择实际轨道、恢复自动选择和控制字幕；状态返回实际格式、语言、支持及选中信息。单视频可传 `expectedPath`、网格可传 `expectedOffset`，拒绝迟到的旧目标控制。系统返回、旋转属于生命周期行为，不伪装成重复的远程写操作。

清单由可撤销的只读临时资源直接交给 Worker，避免全量 JSON 在界面桥接中来回复制；缩略图卡片与已解析媒体都有容量/字节上限。显式刷新、失效授权和账号切换会清空相关缓存。

## 验证

    node --test scripts/tests/rhvideo.test.mjs
    node --test scripts/tests/rhvideo-workbench.test.mjs
    cargo test -p rhfiles-tauri --locked rhvideo::
    cargo test --manifest-path android/src-tauri/Cargo.toml --locked --test webview_startup
    node --test --test-concurrency=1 scripts/e2e/rhvideo.test.mjs
    node --test --test-concurrency=1 scripts/e2e/rhvideo-media-pressure.test.mjs
    node --test scripts/tests/rhvideo-playback-reference.test.mjs
    node --test --test-concurrency=1 scripts/e2e/rhvideo-playback-behavior.test.mjs

Windows E2E 使用隔离配置，不操作已安装的 RHFiles。设置 RHFILES_NATIVE_PLAYER_QA=1 可启用真实 libVLC 播放验收，需要已安装 64 位 VLC 和 FFmpeg。测试生成专用 MP4，检查真实进度、暂停、跳转、前后切换，不以模拟播放代替。

同级有 RHVideo 源码时，还会通过它的 uv 环境启动真实 FastAPI，使用独立临时 SQLite、生成的媒体及测试账号核对 API 契约。测试工作目录不含生产 .env，不连接或写入正式媒体库。

体验回归另外覆盖慢请求并发、错误 MIME 与真实 WebP 解码、点击目标、多播放器关闭隔离、实际独立音量和控制界面虚拟时钟暂停后的连播／循环。`player.state.firstFrameMs` 为原生 open 到首次观测显示帧的毫秒数（未显示时为 0），用于与窗口／接口总耗时区分，不是网络吞吐或跨设备性能保证。

Android 的 RhVideoClientTest/RhVideoContractTest 覆盖账户偏好/断点隔离、固定 API 契约、缓存、路径安全、原生 Range 跳转、21 项播放窗口、9 项同屏分组和退出撤销。scripts/testing/rhvideo-android.mjs 仅接受模拟器，核对已安装 APK 字节哈希，使用临时服务器与生成的视频验收；开机尚未完成、系统/应用错误弹窗、解码失败都不能算通过。它不会连接真机或正式媒体库。
