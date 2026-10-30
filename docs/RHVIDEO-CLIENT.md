# RHVideo 内置客户端（Windows / Android）

这是 RHFiles 内的 RHVideo 客户端，不附带 RHVideo 服务，不直接读取 SQLite 文件，也不加载 RHVideo 网站。

## 使用

1. 在 RHFiles 左侧点击 RHVideo，打开应用自己的媒体库窗口。
2. 点击“连接 RHVideo”，填写已有服务器地址、用户名和密码。
3. 浏览视频、图片、小说、收藏；支持中文/拼音/首字母混合搜索、八种双向排序及嵌套标签规则。
4. 单击视频播放当前文件，截图内可按时间定位。分段连播沿用截图集合及当前位置；列表顺序连播按视频列表的完整筛选、排序结果跨页播放，不是同一个取池流程。多视频可同屏播放并切换上一组/下一组。
5. 图片支持全列表前后切换、随机、缩放、横/竖向虚拟条带和自动放映；小说支持目录搜索、章节/滚动进度、主题/字号/行距及分章速览。
6. “服务器”内管理监控目录、处理队列、原片替换、30 天暂存、存储统计及服务状态。删除和替换先预览、再确认，不在本机直接操作服务器文件。

单击视频只打开点击的文件，不受连播的多选、竖屏或分段条件影响。只有显式启动连播才准备完整队列。“循环”指当前视频或片段，不是回绕整个队列。Windows 的结束切换/循环由原生控制器推进，界面只读取状态，不依赖 WebView 定时器；失败在 `player.state.automationError` 中可见，不自动重放失败切换。播放器的返回入口不会停止独立的同屏播放。

开发代码已分开各分类的操作入口：视频列表顺序连播、截图库分段连播／同屏、图片／收藏连续浏览与放映。普通浏览不显示复选框；进入多选后，封面和标题用于选中／取消选中，退出多选清空选择。`rhvideo.selection.mode` 可传 `{enabled:true/false}` 明确开关，也保留无参数切换。注册使用 `rhvideo.account.register`，只创建账户并提示登录，不自动连接，不切换已有登录；不再需要额外填写邮箱，脚本仍可选传 `email`。这些修正尚未发布，实际验收状态以对齐文档为准。

当前开发版的 Windows 发包脚本已附带 64 位 libVLC 3.0.24，无需另装 VLC；须完整解压并保留程序旁的 `vlc/`。匹配版本的插件索引在构建时生成，运行时直接读取，避免 Velopack 的统一 ZIP 时间戳引发再次扫描。不启动 vlc.exe，没有 HTML video 或网页播放器兜底。仍支持兼容的系统／自定义 VLC 3.x；修改插件后可重新生成索引，或移除 `vlc/RHFiles-libVLC.json` 恢复普通扫描，不限制替换 LGPL 动态库。内核缺失时，浏览、图片和阅读仍可使用，播放会明确提示修复。此分发改动尚未正式发布，实际验收范围见对齐清单。

Windows `player.state`／同屏各格状态新增实际加载的 `engineVersion`、`pluginIndexMode` 和 `decodedAudioBlocks`；后者是解码器统计，不代表扬声器已发声。原有播放／队列接口与业务语义不变。许可证、源代码获取方式和动态替换说明随包保留在 `vlc/COPYING.LIB` 与 `vlc/RHFiles-NOTICE.txt`。

普通 Windows 桌面采用原生硬件自动解码/输出，不经过网页像素传输或 1080p 帧缓冲限制。RDP 或显式兼容模式保留有界 GDI 画布。仅在确实收到显示帧之间插值进度；无帧、暂停或缓冲时不凭墙钟伪造进度。4K/HDR、设备间性能比较仍需独立实测，不能仅因启用原生模式就认定性能达标。

Android 从侧栏 RHVideo 打开，使用适配手机和平板的同一套媒体库与服务器管理。视频使用 Media3，无需安装 VLC；原生菜单与内置中文界面一致，不改变系统语言。完整大队列只向原生播放器交付附近最多 21 项，避免过大的 Binder 参数。系统返回先关闭当前图片、阅读器或对话框，然后回到文件管理器。开发版放映页已适配整页深色布局，保留原有全部操作与接口；最新运行验收范围见对齐清单，并非已发布版本的说明。

实现和验收状态逐项记录在 [RHVideo 功能对齐清单](RHVIDEO-PARITY.md)。没有完成的性能比较、真实手机或服务重启验收不会用模拟结果冒充。

## 标签点选与组合筛选（开发版，尚未发布）

各分类的“标签筛选”现在提供可直接点选的包含／排除、主条件 AND／OR、选择分组、添加／移除子组、完整条件表达式和清除。空分组可以继续编辑但不改变结果；同一分组的同一标签不能同时包含和排除。标签支持汉字／拼音／首字母搜索、使用次数／名称双向／最近使用排序，点击立即应用到原有媒体筛选。逗号／JSON 编辑保留在可折叠的高级区，不再作为普通操作的替代品。

截图库的次数统计按源视频而非截图张数；喜爱按当前媒体类型统计，其他分类保留零匹配的已选标签以便移除。排序、最近 30 个标签和折叠状态作为账户本地偏好保存，并通过原版 `grid_tag_prefs` 与配置备份互通。标签界面已恢复连续滚动，不再显示翻页按钮；内部仅渲染附近最多 80 行，仍可到达全部标签，支持 Home／End、PageUp／PageDown 和触摸。打开后可直接输入搜索；编辑保留列表位置与焦点，关闭重开清空搜索词但保留位置，与原版共享抽屉一致，换账户则清空。已有筛选配置损坏时仅恢复该筛选并显示原因，不阻止连接或清空其他设置；主动提交的无效筛选仍报错。完整项目的实际验收及剩余缺口见对齐清单。

脚本与按钮调用相同的 `rhvideo.rules.state`、`group.select/add/remove/mode`、`tag.toggle`、`clear/search/sort/collapse/page/refresh`。分组使用零起始 `path`，例如 `{path:[0],value:"and"}`；标签使用 `{path:[],kind:"include",label:"风景"}`。`state` 返回当前 `owner` 和递增 `revision`；自动化可带 `expectedOwner`、编辑时另带 `expectedRevision`，账户切换或移除后重建的同路径分组会拒绝迟到操作。`owner` 是本次界面／账户代次的标识，不是登录令牌，不应持久化或同步。原有 `rules.apply/save/restore/delete` 等接口继续保留。

`rhvideo.rules.scroll` 对应标签列表的滚轮、触摸和键盘操作，参数三选一：`{index:100}` 按零起始行定位，`{delta:280}` 移动逻辑 CSS 像素，或 `{top:5600}` 设置物理滚动位置，可另带 `expectedOwner`。`rules.state.viewport` 返回完整总数、可见的 `first`／`last`（后者不含）、滚动位置和缩放；`catalog.rows` 只是附近窗口，不代表总范围。极大列表物理滚动长度限制为 800 万像素，索引／逻辑移动仍能到首尾。旧 `rules.page` 保留为每次移动 80 行的脚本兼容入口，不再用分页 UI 替代连续浏览。滚动复用 Worker 中最多两份派生标签结果，不按每次滚轮重新扫描媒体库或下载清单；源清单变化会清缓存。

## 媒体库配置备份（开发版，尚未发布）

“媒体库偏好 → 配置备份与恢复”可以保存 JSON、选择文件预览、确认后合并恢复。需要服务器提供 `/api/v1/config-backups` 接口。它备份的是 RHVideo 的喜爱、监控目录、阅读进度和页面偏好，不是 RHFiles 的全部设备配置，也不包含密码、登录令牌或源文件。

恢复匹配和冲突处理由原版服务器执行：不删除已有喜爱，新监控目录默认关闭，较新的阅读进度保留；未匹配项显示在预览中。客户端使用同一份版本 1 格式，音量、阅读设置、图片放映和收藏混合放映的参数可与原版互通。文件上限为 20 MiB，预览有五分钟有效期；换账号、换文件或确认一次后不能沿用旧确认。请求失败不自动重放。

Windows 使用本机文件选择器；Android 使用系统文档选择器。手机弹出选择器并不等于已保存，最终结果会更新在同一界面。当前已验证 Windows 的真实后端收藏备份／预览／合并链路和两端参数转换；手机文件选择器的旋转／折叠场景及完整跨设备备份仍需继续验收，不能据此宣称整组功能已在全部设备验证完成。

收藏自动放映现有独立的图片停留秒数、视频停留秒数和淡化毫秒数，不再混用普通图片放映参数；总进度按实际停留时长加权，Home／End 及进度条调用同一公开接口。

收藏放映使用当前筛选后的完整队列，排除小说，返回的总数为实际可放映项目数。放映内的收藏／取消收藏不重建这次队列，跨页项目同样可操作；截图放映收藏其源视频，不启动视频。重新打开收藏放映从第一项开始，与普通图片放映的进度记忆分开。备份数值另按原版单位转换：淡化比例是百分数，条带速度是以 200 px/s 为基准的倍率；有效的原版 60 秒淡化上限可导入并在设置中修改。

## 数据与边界

- 登录、媒体清单、收藏、章节、阅读进度、关键帧使用 RHVideo 现有 HTTP API。
- 增加收藏使用 PUT /api/v1/favorites/{type}/{id}，取消使用 DELETE。
- 服务器写入只通过固定业务接口。源文件暂存、原片替换、清理和重启会明确显示影响；不提供任意 URL/SQL/服务器路径执行代理。
- 当前开发分支不保存密码；服务器地址和用户名仍是普通设置，登录令牌另由本机系统保护，用于启动时恢复登录，不进入网页、配置备份或同步。正式安装版未必包含该开发功能；最新实际验收状态见功能对齐清单。
- HTTP 登录没有传输加密，跨公网请使用 HTTPS 或可信 VPN。
- Windows 媒体通过仅绑定 127.0.0.1 的临时通道；Android 图片使用原生拦截的应用内资源路径，视频通过原生 Media3 DataSource 读取。两端都只允许登记的随机媒体标识；令牌不进入网页、播放器参数、普通配置或同步，本机持久登录只使用系统保护的原生记录。
- 禁止重定向转发登录信息，校验 TLS 证书。退出后旧媒体链接失效，正在读取的流也会终止。
- 缩略图懒加载，卡片分页；原生视频按流读取，不把整个电影下载到内存。
- 窗口复用主窗口的真实 WebView2 环境，避免串配置和重复创建浏览器环境。

## 自动化

开发分支的 `rhvideo.connection.restore` 不接受密码、令牌或任意服务器参数，只使用当前本机受保护的记录。默认读取本次已尝试的结果；可显式传 `{"fresh":true}` 进行一次新验证，并发进行中的验证仍合并。打开媒体库和未连接时点击原有刷新按钮使用同一动作；不是循环重试或恢复旧文件写入。`rhvideo.state` 中的 `restoring`、`credentialsPersisted`、`loginWarning` 可用于诊断：存在受保护记录不等于服务器已确认登录有效，须检查 `connected`。退出会移除保存的登录；暂时断网不会自动忘记它。Windows 各用户／虚拟桌面配置和 Android 各用户的本机记录不跨设备同步；新的配置分区不能直接复制 Windows 密文来登录。

开发分支新增喜爱源文件 ZIP 的脚本动作：`rhvideo.exports.create`（`scope: "filtered"` 或 `"all"`）、`rhvideo.exports.list`（可选 `limit: 1..100`）、`rhvideo.exports.get`／`rhvideo.exports.cancel`（`id`）和 `rhvideo.exports.state`。`filtered` 重新读取服务端收藏，使用操作开始时的筛选条件，涵盖所有页、视频、图片与小说；不是多选卡片的 JSON 元数据导出。创建是服务端持久化后台任务，退出登录不会删除任务；取消只处理这个 ZIP 任务，不删除媒体源文件。

开发分支的收藏页另有“打包导出”面板，对应 `rhvideo.exports.open/close`；`rhvideo.exports.scope {"value":"filtered"}`／`{"value":"all"}` 选择打开时完整筛选快照或全部收藏，`refresh` 手动读取任务。关闭／隐藏面板不继续定时读取，也不取消服务端任务或本机下载。活动打包每秒、空闲每十秒读取，连续三次失败停止；只对活动任务提供取消，不自动重发失败创建请求。结果不明确时先查询最近导出核对。

`rhvideo.exports.download {"id":"导出 UUID"}` 启动系统保存选择，脚本可额外传完整 `path` 跳过选择器。返回排队下载或 Android 的 `requested/pickId` **不等于已经保存**；`rhvideo.exports.downloads` 返回当前账户的本机记录及警告，只有任务 `state: "saved"` 表示已完整保存。`rhvideo.exports.download.cancel {"taskId":"本机下载 UUID"}` 只接受活动下载，提交文件或终态拒绝旧取消。记录包含字节、总量、速度、位置、失败原因和递增 `revision`，不是服务端打包任务本身。没有失败后“重试”按钮，新的保存必须是新的显式操作。

ZIP 字节直接由原生会话流式写入，不经过渲染器，不覆盖已有本地文件；进程中断不自动恢复下载。Windows 后台线程、Android 前台服务不依赖导出界面是否打开，Android 通知可回到导出面板。记录按服务器和账户隔离、不存令牌。此功能尚未正式发包：Windows 真实后端 UI／显式路径后台保存，以及 Android 自有模拟器的真实 ZIP 系统保存／取消、通知返回、关闭界面后台完成、并发无覆盖和进程重启后原文档读取已通过；**一次 0 字节进度间歇失败、选择器自身的旋转／进程死亡、Windows 系统保存选择器仍待核验**，不是整项目全部功能／性能已验收。见 `RHVIDEO-PARITY.md` 的具体证据及剩余缺口。

Android 保存选择器使用原生内存中的一次性准备票据（最多四个、五分钟有效）；选择器返回后不再进行第二次元数据请求才启动服务。选择耗时太久、账户／进程变化时明确失败，重新操作会创建新的保存意图，不重放过时选择。传输任务的 `name` 在后台读取实际保存位置的显示名，界面不需要解析 `content:` URI。

Android 的 ZIP 流不借用闲置的图片／元数据连接，也不自动重放中断流。系统文档授权只保留本次保存新增的权限位；它留在本机原生记录，不进入导出配置或同步。失败清理、历史超过 64 项淘汰最后一个文档引用时释放本次权限，不删除已保存文件、不撤销原先已有的权限。提供方不支持持久访问时，`exports.downloads.warning` 会说明限制。真实系统保存／后台通知／进程恢复场景可用 `rhvideo-android.mjs ... exports` 运行，仅允许自有 QA 模拟器；最新验收状态看功能对齐文档，不能用 JVM 通过代替实际存储权限验证。

新增的页码跳转、摘录搜索、截图逐张浏览/原清单定位、任务图片放大、阅读器目录/收藏及统一音量，同样是公开动作，不是只能点 UI 的特殊逻辑：`rhvideo.page.jump`、`rhvideo.gallery.jump`、`rhvideo.novel.previewSearch`、`rhvideo.gallery.inspect`、`rhvideo.image.reveal`、`rhvideo.image.preview`、`rhvideo.reader.toc`、`rhvideo.reader.favorite`、`rhvideo.volume.set`。统一音量默认 20%，与单个视频的音量相乘，静音后恢复不会丢失各格音量；不修改 Windows/Android 系统音量或普通本地播放器。

章节速览每页 40 章、每章最多 720 字，搜索标题和摘录，支持拼音；界面明确显示“本页”范围，可以继续翻页查找，不无限拉取整本正文。截图浏览支持完整筛选队列的前后切换、“播放此刻”以及定位到源视频所在的清单页。

`rhvideo.image.reveal` 与 `rhvideo.media.reveal {"kind":"picture","id":"…"}` 使用同一清单定位流程：在索引内查目标，再只解析和绘制目标所在页，不先绘制第一页，也不传回完整顺序。成功后关闭原预览、滚动到目标并短暂高亮；目标缺失等普通定位失败保留预览，账户失效仍按退出规则清理。等待期间若导航、预览或账户已被替换，旧定位不会关闭或高亮新的界面。公开参数和普通分类切换行为不变。

批量暂存执行中可用 `rhvideo.selection.progress` 查看进度，或带本次 `ticket` 调用 `rhvideo.selection.stop`，只停止尚未发送的项目；不撤销已经提交的请求，旧 ticket 不控制后来的任务。完成/失败后停止按钮移除，失败项不自动重试。

所有界面操作使用 RHFilesAPI 注册动作。不是另写一套“测试专用操作”：UI 与脚本调用相同处理函数。`list` 返回参数 schema、风险级别，`rhvideo.ui.contract` 逐个枚举真实控件并报告没有接口的控件（包括尚未标注的新按钮，不会只检查已标注按钮）。输入框也可通过通用 `ui.set` 填写，再调用对应提交操作。

固定远程操作清单在 `src/rhvideo-operations.json`，两端原生层校验方法、路径、参数、上限和危险确认。网页拿不到登录令牌，也不能自行指定任意远程接口。

现有本机 CLI 可选择窗口调用：

    node scripts/rhfiles-api.mjs --port 9222 --window main run rhvideo.open --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo list
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo run rhvideo.category '{"kind":"picture"}' --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo run rhvideo.sort '{"value":"dateAsc"}' --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo run rhvideo.ui.contract --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo run rhvideo.gallery.state --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo run rhvideo.server.open '{"page":"tasks"}' --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo-player run rhvideo.player.next --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo-grid run rhvideo.grid.page '{"direction":1}' --wait

Android 开启设置中的“ADB 自动化”后，可通过已授权的 ADB 连接调用同一组界面动作，例如：

    node scripts/rhfiles-api.mjs --android SERIAL run rhvideo.open --wait
    node scripts/rhfiles-api.mjs --android SERIAL --window window-rhvideo list

接口仅在用户显式启用本机自动化后可调用。不要把真实密码写进命令行历史，可使用 CLI 的 JSON 行输入。UI 与脚本走同一原生接口。

默认主页面是与 RHVideo 对应的“截图浏览”，视频清单保留独立入口。`rhvideo.gallery.show` 切回主截图页面，不弹出窗口、不清空截图页码；`rhvideo.category` 切换视频/图片/小说/收藏清单。`rhvideo.state.view` 区分 `gallery` 与 `catalog`，`kind` 仍表示清单类别。两种呈现共用已有的 `gallery.page/jump/inspect`、筛选和播放动作，均可从命令行调用。旧的 `gallery.open` 在清单页仍可显式打开截图弹窗；主截图页调用时直接更新当前页。

登录后的截图库元数据会在后台准备，不等待它才读取视频清单，也不自动弹出截图库。默认主截图页显示加载状态，但可随时切去其他分类。`gallery.state` 返回 `loaded`、`loading`、`error`、缓存项数 `count`、当前浏览结果数 `total` 及数据 `revision`；这些不是原图解码进度。相同条件的进入操作共用在途读取，刷新/筛选/账号变化会使旧响应失效。失败显示在当前截图页/工具栏，且不自动重试；明确点击进入/重新读取才会再读。切走主截图页或关闭显式弹窗，不会被迟到结果重新打开。

Windows 原生 `player.state`／`grid.state.cells` 的 `pauseRequested` 表示已接受的暂停意图，`state` 仍表示解码器实际状态。暂停/继续是异步的，翻组快照和快捷键遵循前者；验证真正暂停仍应检查 `state===4`、暂停画面恢复结束及当前 `inputId`，不能拿“已接受暂停”冒充解码器已完成。Android 原生状态沿用 Media3 的 `playWhenReady`。

图库与视频清单的排序独立：默认保留服务器的截图顺序，混合池默认图片在前；首次混合自动打乱，也可显式还原。`gallery.state` 另返回 `offset`、`limit`、`seed`、`orderScope` 和当前分区的命名 `orders`。新种子为八位十六进制字符串，旧数字种子仍可恢复；按原版的视频 ID+截图 URL／图片 ID 排名，新增内容不改变已有项目的相对次序。

`gallery.save {"name":"名称"}` 保存当前标签/混合图片分区的顺序，等原生存储完成才应答；同名会更新。`gallery.resume {"name":"名称"}` 恢复顺序并回到第一页。**不传 name 的 `gallery.resume` 是继续浏览，会打开上次那张图**，优先精确匹配原截图 URL，找不到时退回同视频首张或有效索引。图库页码/种子另行记忆，不再由普通翻页覆盖图片书签。命名顺序不受每视频截图数量影响；旧名称与数字种子会迁入当前分区。Windows/Android 共用这些前端语义与公开接口。

批量暂存使用 `selection.toggle` → `selection.snapshot` → `selection.stage`，最后返回一次性 ticket，须显式调用两次 `confirm.advance`。ticket 与账户、当前会话、选中快照绑定并在提交前消费，2 分钟后失效；失败只返回逐项结果，不自动重试。`selection.result` 可查询本次结果。正常复制/移动等文件任务的终态规则不受媒体库功能影响。

Windows 0.1.88 的播放行为单独对齐参考源码：`playlist.start` 是截图浏览位置开始的去重分段队列，`playlist.sequential` 是当前过滤后完整视频列表的顺序队列，传 `{ "super": true }` 使用独立的超压顺序队列；不再把它们合并到一个模式下拉中。三者分别保存位置和设置，只有 ID 与顺序完全一致才恢复游标。`player.seekQueue` 以 `ratio: 0..1` 定位整个队列，普通 `player.control` 的 seek 仍按当前视频的毫秒数定位。

`player.back` 返回父截图，`player.next/previous` 在截图打开的单视频中返回父队列并移动一张；`player.close`／Esc 才关闭整层预览。连播的手动前后切换回绕，自动结束不回绕。`player.favorite`、`player.mark` 分别收藏和标记暂存当前视频。预览标记与列表多选不同，`preview.pending` 查看标记，关闭预览后仅提交一次；`preview.state` 只读查询结果，`preview.result` 打开逐项结果 UI。失败不重新放回标记池，后续关闭不会重放旧写入。

Windows 0.1.89 开发分支增加 `player.options {"portraitOnly":true}`，在不可变的完整原队列上投影竖屏项；取消后恢复顺序，少于两项时拒绝操作、保留当前播放。图库连播保存筛选、片段选择和位置；重新启动顺序／超压顺序模式按原版取消竖屏筛选、恢复全长，速度和循环仍分别记忆。播放器窗口的该动作以读取到的 ID／队列版本发起原生请求，拒绝迟到的旧目标设置。切换服务器后窗口同步新的 `generation`。

原生画布使用同一组 `player.input {"inputId":...,"intent":"next"}`／`grid.input {"inputId":...,"target":0,"intent":"expand"}` 结构化动作；`inputId` 来自最新的播放器／格子状态，每次重开解码输入都更换，不能仅凭相同视频 ID 重放。支持媒体导航、暂停、返回、组首尾定位；双击格子切换展开，展开时 Esc 先恢复网格。`grid.seekGroup {"ratio":0.5}` 对完整分组集合取整定位，不是单格的视频秒数；定位当前组不重启解码器。原生画布不安装全局键鼠钩子。

Windows 多视频默认 `gridCount:0`，按参考客户端的画面比例评分自动分成每组 2–4 项；1–9 为可选的手动数量。队列从完整图库顺序去重取视频，不取当前清单多选，也不从当前截图旋转起点。`grid.state` 返回 `groupIndex`／`groupTotal`、每格 `id`／`rect`／`inputId`、独立音量／静音／倍速及收藏／暂存标记。`grid.control` 的 `mute` 与 `volume` 独立；默认每格均有声音，再乘页面总音量。

同一次打开中翻组保留逐项位置、暂停、音量、静音和速度；关闭重开只恢复完全匹配的有序组 ID，逐项控制重置。恢复位置按实际媒体时长限制，不把过期位置无限排队。正常结束循环使用同一个 VLC 输入，失败不循环重试。`grid.favorite {"target":0}` 和 `grid.mark {"target":0}` 操作单格，原生画布 Delete 使用相同标记动作，关闭时只提交一次暂存；不是永久删除。复用窗口时更新会话，旧解码输入和旧窗口销毁事件不能控制替代项。这部分为 Windows 开发实现，不能当作 Android 已同步或发行包已发布。

Android 开发实现也接收共享模型的 `gridRect`／`gridEnd`，默认 `gridCount:0`，不再丢弃布局并按固定数量重排。`grid.seekGroup {"ratio":0.5}` 定位分组；原生 `native.grid.control` 的 `seekGroup`／`controls` 分别对应分组定位和展开调节。状态返回实际子画布的 `surfaceBounds`、`visible`、`canvasWidth/Height`，以及会话 `lease`；`expectedLease` 与已有 `expectedOffset` 可拒绝旧会话／旧组操作。各格默认均有声音，翻组保留状态；普通结束由 Media3 的单项循环处理，读取失败不自动重放。独立网格快照不受后来准备的单视频队列覆盖，关闭重开只恢复相同的有序组。现另补入每格原生收藏／暂存标记按钮，对应共享 `grid.favorite`／`grid.mark` 和 `native.grid.control` 的同名命令；`grid.mark` 可传显式 `enabled`。正常关闭先释放播放器，再消费一次待暂存标记；退出／切换账号的关闭不提交。收藏在有界原生写队列执行，状态返回 `favorite`／`favoriteBusy`／`favoriteError`／`favoriteOperation`，失败不重放、不假改成功状态。完整范围与本轮 APK 实测结果须分别看 `RHVIDEO-PARITY.md`，不代表已经正式发布或全部功能完成。

Android 网格状态另有 `inputId`、`playbackState`、`isLoading`、`bufferedPositionMs` 与 `suppressionReason`。`renderedFrames` 读取 Media3 的 [DecoderCounters](https://developer.android.com/reference/androidx/media3/exoplayer/DecoderCounters) 并进行跨线程可见性同步；`submittedFrames`／`frameTimeMs` 是独立的送显元数据回调计数／时间，不冒充实际输出帧数。`rendered` 表示该原生表面已收到首次渲染事件。定位使用 `positionMs`，而不是帧诊断时间。旋转通过显式创建的 ViewModel 保留同次逐项状态，不向系统 Bundle 写入随长时间浏览而不断增大的状态表；关闭后创建新会话仍重置逐项控制。`expectedOffset`／`expectedLease` 只校验位置／会话；单格可另传 `expectedInput`（默认检查 `target`，也可显式 `inputTarget`），统一控制／分组手势可传按当前顺序排列的 `expectedInputs` 数组，拒绝同组回访或旋转后重建的旧输入。原生滑杆和按钮在按下时捕获目标与输入，不在松手时换成后来选中的目标；`dragging` 返回当前滑杆手势。取消手势不执行；明确发出的失败操作不自动重试。

暂停画面恢复通过原生控制器完成：先静音、隐藏过渡帧，建立画面后定位并保持暂停；`restoringPausedFrame` 和 `restoreTargetMs` 分别返回进行状态和目标毫秒数，最多等待 15 秒，失败写入 `seekError` 且不自动重试。控制界面后台／暂停计时器时仍处理已接受的恢复。用户新的 seek 或 resume 可接管旧恢复意图；快速离开时保存请求的暂停状态，而不是把内部预备解码当成用户已开始播放。显示时间与实际输入的循环一起归零，暂停时不使用解码器的预读时间改写显示位置。

视频尚未报告实际时长时，显式 seek 最多等待当前解码输入就绪 15 秒，消费一次。新输入会丢弃旧计划；`pendingSeekMs`、`seekError` 可分别查询等待位置和终态原因，失败不会重新排队。该行为修复了 CI 兼容渲染下切换后立即改片段造成的“跳转越界”。接口／原生解码测试与真实窗口物理鼠标验收分开记录。

`image.seek {"ratio":0.5}` 定位完整图片／截图集合，使用 `round(ratio * (count - 1))`，不是视频时间轴。`image.favorite` 收藏当前预览（截图收藏源视频），不受当前卡片页限制。`image.playVideo` 从头播放截图源视频，`image.playFrame` 跳到截图时间点；返回事件必须同时匹配 `generation`、`parentKey` 和独立的 `parentPreview`。`image.state` 的缺失字段用 `null` 返回，关闭状态及非媒体库任务图片也保持有效 JSON。自定义图片快捷键取代旧键，不叠加隐藏的默认绑定。

全长播放缺少时长元数据时，沿用参考客户端的 86400 秒保护长度，而非三秒片段；原生解码器正常的结束事件仍会前进或关闭。上述开发改动尚未发布为 0.1.89 完整安装包，也不代表 Android 原生控制已同步。

处理队列、任务/批次详情及存储扫描通过 `rhvideo.server.liveRefresh` 只读更新，`rhvideo.server.refreshState` 返回刷新是否启用、暂停、进行中及失败原因。仅可见且仍运行的任务定期读取；后台、关闭、被其他弹窗覆盖或编辑输入时暂停。连续三次读取失败后停止，手动刷新才重置失败预算，不会重放服务器写操作。

成功写入会立即失效相关清单缓存；比写入更早发出的旧清单不能覆盖新索引。若写入成功但刷新失败，接口仍返回成功结果，并附 `clientWarning`；请核对或手动刷新，不要据此重复写入。导出在提交系统保存窗口前按 UTF-8 检查 32 MiB 上限。

`rhvideo.state` 返回当前 `generation`。面向具体媒体 ID 的自动化可将它作为远程操作的 `expectedGeneration`；切换服务器、重新登录后旧版本请求会在执行前被拒绝。确认票据与批量操作也固定到发起时的会话，不把未完成项目自动迁移到新账号。连接状态最多复用 5 秒，显式刷新立即复核；后端每次操作仍核对会话版本。

Android 原生播放界面的控件通过 `native.media.state/control`、网格通过 `native.grid.state/control` 调用。`track.select`、`track.auto`、`subtitles` 分别选择实际轨道、恢复自动选择和控制字幕；状态返回实际格式、语言、支持及选中信息。单视频可传 `expectedPath`、网格可传 `expectedOffset`，拒绝迟到的旧目标控制。系统返回、旋转属于生命周期行为，不伪装成重复的远程写操作。

Android 连播开发实现不再重算前端提交的 `segmentStart`／`segmentLength`，也不再用 Media3 裁剪时间轴冒充整文件进度。[原生时间消息](https://developer.android.com/reference/androidx/media3/exoplayer/PlayerMessage)处理片段结束，循环当前片段；手动前后切换在完整队列回绕，自动末项结束关闭连播。附近最多 21 项只是解码窗口，不是播放队列的范围。活动队列有独立快照和 `lease`，后来准备网格或单视频队列不使它失效。

`rhvideo.player.seekQueue {"ratio":0.5}` 定位加权的整个队列；`ratio:1` 与参考客户端一致，选中末项起点。`rhvideo.player.options` 接收 `fullLength`、`segment`（1–300 秒）、`portraitOnly`、`loop`、`rate`，与原生选项菜单使用同一实现。仅竖屏保留完整原池，取消后恢复全部项目，不足两项时拒绝且不改变播放。分段／顺序／超压顺序各自记忆设置、队列签名和游标，顺序模式的新启动仍恢复全长及完整池。

本机 `native.media.control` 对应 `seekQueue`／`playlist.options`，可带 `expectedInputId` 拒绝迟到的输入。状态中的 `positionMs`／`durationMs` 是整视频时间；`segmentStartMs`／`segmentEndMs` 是片段边界，`queuePositionMs`／`queueDurationMs` 是整队列时间。`id`、`lease`、`inputId` 与实际输出帧计数用于核对原生媒体，不把创建了播放器当作已出现画面。该范围尚不含 Android 完整父预览返回栈、收藏／暂存标记，也不是发行包已通过全部验收的声明。

清单由可撤销的只读临时资源直接交给 Worker，避免全量 JSON 在界面桥接中来回复制；缩略图卡片与已解析媒体都有容量/字节上限。显式刷新、失效授权和账号切换会清空相关缓存。

## 验证

    node --test scripts/tests/rhvideo.test.mjs
    node --test scripts/tests/rhvideo-workbench.test.mjs
    cargo test -p rhfiles-tauri --locked rhvideo::
    cargo test --manifest-path android/src-tauri/Cargo.toml --locked --test webview_startup
    node --test --test-concurrency=1 scripts/e2e/rhvideo.test.mjs
    node --test --test-concurrency=1 scripts/e2e/rhvideo-media-pressure.test.mjs
    node --test scripts/tests/rhvideo-playback-reference.test.mjs
    node --test scripts/tests/rhvideo-grid-reference.test.mjs
    node --test --test-concurrency=1 scripts/e2e/rhvideo-playback-behavior.test.mjs

Windows E2E 使用隔离配置，不操作已安装的 RHFiles。设置 RHFILES_NATIVE_PLAYER_QA=1 可启用真实 libVLC 播放验收，需要已安装 64 位 VLC 和 FFmpeg。测试生成专用 MP4，检查真实进度、暂停、跳转、前后切换，不以模拟播放代替。

同级有 RHVideo 源码时，还会通过它的 uv 环境启动真实 FastAPI，使用独立临时 SQLite、生成的媒体及测试账号核对 API 契约。测试工作目录不含生产 .env，不连接或写入正式媒体库。

体验回归另外覆盖慢请求并发、错误 MIME 与真实 WebP 解码、点击目标、多播放器关闭隔离、实际独立音量和控制界面虚拟时钟暂停后的连播／循环。`player.state.firstFrameMs` 为原生 open 到首次观测显示帧的毫秒数（未显示时为 0），用于与窗口／接口总耗时区分，不是网络吞吐或跨设备性能保证。

Android 的 RhVideoClientTest/RhVideoContractTest 覆盖账户偏好/断点隔离、固定 API 契约、缓存、路径安全、原生 Range 跳转、21 项播放窗口、9 项同屏分组和退出撤销。scripts/testing/rhvideo-android.mjs 仅接受模拟器，核对已安装 APK 字节哈希，使用临时服务器与生成的视频验收；开机尚未完成、系统/应用错误弹窗、解码失败都不能算通过。它不会连接真机或正式媒体库。
