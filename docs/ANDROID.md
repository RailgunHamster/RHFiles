# RHFiles Android

## 0.1.14：折叠屏内外屏独立布局记忆

内屏、外屏分别保存自动、单窗格、左右、上下布局，折叠/展开后恢复对应屏幕的选择。原生 Jetpack WindowManager 的最大窗口边界（不减状态栏/导航栏）按长短边归一化，作为当前屏幕配置键；不按 WebView/单个窗格宽度猜测内外屏，避免旋转、软键盘和普通窗口缩放误切配置。半开铰链仍沿用原有避让规则，布局方向仍可手动选择。

`rhfiles.panes.screens` 保存版本化屏幕映射；旧全局选择只迁移到首次使用的屏幕，其他未配置屏幕使用自动布局。折叠只改变显示/隐藏，不销毁窗格，两边浏览位置和正在运行的任务保留。屏幕改变时关闭过时的布局选择面板；启动查询的晚响应不能覆盖更新的屏幕事件。

屏幕映射纳入前端/原生配置校验和加密导入导出，最多 32 组；旧备份无需新字段仍可导入。自动布局仍按当前可用空间推荐，任何屏幕均可手动选择分屏。

验证：31 项前端单元、34 项原有双窗格流程、15 项屏幕记忆专项、158 项原有交互及独立双指触摸通过；Debug / Release 各 107 项 JVM 测试通过。屏幕专项覆盖全部布局组合、升级迁移、重启、配置备份、旋转/键盘/窗口缩放不切配置、反复折叠保留窗格及晚到的启动响应。

原生专项 `node android/web/tests/fold-native-check.mjs` 仅接受指定 Android 模拟器（默认 `emulator-5582`，先检查 `ro.kernel.qemu=1`），通过实际触摸打开布局菜单，使用原生 `window.layout` 读取配置。此处 API 36 通用 7.6 英寸镜像虽然上报 CLOSED，却未自动切到外屏尺寸，原始 fold-only 用例未通过，**不记作实体折叠屏验收**。显式设置 `RHFILES_TEST_FOLD_GEOMETRY=884x2208,1768x2208` 后，以 Android `wm size` 切换系统显示几何，5 项原生集成断言通过：两个真实原生屏幕键、各自布局、反复切换保留目录、修改内屏不覆盖外屏以及持久化；结束恢复尺寸覆盖。结果记录 `geometryOverride`，没有用 JavaScript 伪造屏幕事件或标识。证据：`test-artifacts/android-tZHnvE/`。未操作用户手机或其他模拟器。

正式 arm64 APK：12,972,975 字节，SHA-256 `41c1d597180a7a567419017f6eb97fb46ed0e90285f54794f2359f143670c4ca`；版本码 1014，原签名不变，运行代码提交 `c1ac408`。

## 0.1.13：Gitee 更新、独立多指双窗格、本地加密配置备份

更新源新增 Gitee，默认仓库为 `https://gitee.com/railgunhamster/RHFiles`。新安装或此前没有保存过来源时默认使用 Gitee；已有明确保存的 GitHub/家庭服务器选择不覆盖。设置 → 更新与网络可切换三个来源、修改仓库、保存 HTTP 代理；关闭自动检查后启动/进入设置/每小时都不会联网检查，手动检查仍可用。

客户端不保存或分发 Gitee 发布令牌；直接读取公开 v5 正式发行列表和 `releases.android.json`，每页 100 条、最多 5 页，按 Android versionCode 取最高兼容包。源代码归档不是 APK，草稿/预发布不参与；缺清单、错误 JSON、请求失败、重名附件、版本冲突、目录截断均明确失败。Gitee 下载复用现有后台任务与大小/SHA-256/包名/版本/ABI/签名校验，用户确认后才交给系统安装。

发布使用 `scripts/publish-android-gitee.ps1`，从仓库外 Windows DPAPI 加密文件读取令牌；先上传不可变 APK，再上传该版不可变清单，匿名下载逐字节校验，最后从预发布转正式。脚本不会替换同版本不同内容。项目原创代码采用标准 Apache-2.0，打包 LICENSE / NOTICE 并在关于页离线展示；第三方许可证不变。

分隔轨道缩到 8 CSS px，把手仍居中；移除整圈活动窗格描边。“活动”只记录系统 Back 的去向，不作为另一窗格的输入许可。Chromium 的 iframe touch-active document 会丢弃另一文档中的触点，仅在 JavaScript 里监听两边不够；Android `MotionEvent` 中继在过滤前保留全部 pointer ID 和坐标，滚动分别绑定起始容器。第二触点点击通过命中的可信窗格控件分发；单窗格保留原生滚动，预览缩放不经过此路由。多指移动会取消长按计时，惯性有速度上限和衰减。

设置 → 配置备份，通过系统文件选择器导出/导入 `.rhconfig`。覆盖目前持久化的 Android 设置：主题、视图、排序、隐藏项、收藏、分屏偏好、互传设备名、更新源/自动检查/代理、网络连接/账号密码、阅读偏好/书签/位置。阅读器仍使用独立进程和来源，只新增限定阅读配置键的存储桥；导出前在阅读进程迁移旧 localStorage。原文件内容、索引/缩略图缓存、下载的 APK、文件任务、待粘贴列表不是配置，不备份；Android/SAF 权限不能跨设备复制，必须重新授权。

密码只在原生对话框内输入；PBKDF2-HMAC-SHA1（1,300,000 次，兼容 Android 7+）、随机 16 字节盐、随机 12 字节 IV、AES-256-GCM，至少 8 字符。网络凭据由原设备密钥解密后装入加密备份，在目标设备重新加密，保留连接 UUID，避免收藏和更新认证引用断裂。密码与明文凭据不进入前端配置。错误密码/篡改/未知字段/无效连接引用在写入前拒绝。

导入需要二次确认，文件任务和更新任务进行中不能替换配置。事务日志保留旧原生设置和旧前端配置，直到前端持久化完成并确认才提交；中断或前端写入失败会恢复旧配置。成功后重新加载并回到主页，不恢复文件操作。

验证：26 项前端单元、34 项双窗格流程、153 项原有交互、15 项真实格式阅读、88 项 JVM 测试通过。Chromium 多指用例记录了修复前两边不滚动；修复后使用模拟原生中继验证独立滚动。签名且混淆的正式 arm64 APK 又在 Android 16 专用模拟器注入真实两触点，验证同时滚动、抬起一个后另一边继续、无误多选、8 px 分隔条。配置专项使用真实原生密码/确认对话框，SAF Intent Monitor 代选本次测试在 Downloads provider 创建的 URI，验证真实内容读写、密文、错误密码不变更、导入及前端确认；未操作用户手机。

0.1.13 已发布到 Gitee、GitHub 与家庭服务器，正式 APK 为 12,981,051 字节，SHA-256 `fa1c3820c8ff9372497259b7f45330d7a9aab6e7a8a9d166f6769bbb57b29f55`，原签名不变。源码为 `acb7fdb`；Windows Latest 仍是 v0.1.72，家庭服务器 Windows 清单哈希未改变。

本轮验证：104 项 JVM、26 项移动前端单元、158 项移动浏览器交互、34 项双窗格流程及并行触摸专项通过；桌面 196 项 JavaScript 单元通过。正式 minified arm64 运行时另构建仅用于模拟器的低 manifest 版本号包（`rhfilesReleaseProbe` + `rhfilesUpdateProbeCode=1000`，版本名含 `-update-probe`，发布器会拒绝），不修改运行时校验逻辑。在专用 Android 16 模拟器实际从公开 Gitee 分别完整下载 0.1.12 和 0.1.13，达到 `ready` 并通过大小、哈希、包名、ABI、版本与原签名校验；安装实际正式 0.1.13 后再检查返回 `latest`。正式 APK 的关于页也已验证加载包内完整 Apache-2.0 / NOTICE。没有操作用户手机。

这些移动端验收不代表仓库全部 CI 通过：`acb7fdb` 的 GitHub 桌面工作流仍在 macOS 互传平台支持断言、Windows 分卷浏览状态时序、PDF 隐藏子菜单点击处失败；另观察到同一提交两组 push 运行，重复事件来源尚未确认。相关失败不应被改名为编译失败或忽略。本次移动发布不改这些工作流与用例。

## 0.1.12：分屏控件融入常规界面

每个窗格右上角“更多 → 分屏布局”选择自动、左右、上下或单窗格。取消悬浮“分屏”按钮，不再盖住文件内容；分屏后点中间分隔条也可打开同一个底部面板。面板沿用其他菜单的主题、线条图标和间距，勾选当前偏好，点空白或系统返回只关闭面板，不退出当前目录。

分隔条为独立 24 CSS px 布局轨道，整条可点击；细把手在两个轴向都严格居中且不溢出窗格。原先 12 px 轨道里放 44 px 圆按钮造成偏移和遮挡。布局面板避让四边系统安全区域。所有手机仍可手动选择两个方向，导航、待粘贴文件和活动窗格保持原有独立/共享规则。

验证：22 项前端单元、34 项双窗格流程（含居中/不覆盖窗格、工具栏入口、当前项、明暗主题、空白/返回/Escape 关闭、键盘焦点循环与触控焦点区分、四边安全区域）、153 项原有交互、82 项原生 JVM 测试通过。Android 16 普通手机宽度模拟器安装签名正式 arm64 APK，真实触摸从“更多”打开面板并切换上下/左右/单窗格，检查独立目录、把手坐标并保存截图；未操作用户手机。

## 0.1.11：所有手机手动分屏、GitHub 更新版本选择修复

此版本引入单窗格右上方“分屏”按钮（0.1.12 起改为“更多 → 分屏布局”），所有尺寸都允许手动选择“左右分屏 / 上下分屏”，不隐藏、不禁用。手动方向会保存，旋转和窗口变化不强制回单窗格；只有“自动布局”仍按可用空间推荐。窄窗格增加紧凑标题栏、两列首页和文件操作区布局。

GitHub 发行列表并不保证按 Android 版本号排列。旧版遇到第一份清单后即返回，在 0.1.9 排于 0.1.10 前面时会错误显示“最新”。现在扫描正式发行并按 Android `versionCode` 取最高兼容版本；每页 100 条，最多 5 页，整体检查有时限。列表截断、读取失败或同版本元数据冲突均报错，不能据此显示“已是最新”。

发布脚本在 Windows Latest 中维护独立的 Android 清单/APK 兼容入口，旧 APK 不用手动安装即可接到修复。仅此镜像清单可随版本递增替换，旧清单改名留存以便回滚；Android 正式发行资源和 APK 均不可覆盖，Windows 资源及 Latest 指向保持不变。

本轮通过：22 项前端单元、22 项双窗格流程、153 项原有交互、82 项原生 JVM 测试（含 11 项 GitHub 顺序/分页/兼容性/异常回归）。Android 16 专用模拟器的正式 arm64 APK 在普通手机宽度下实际触摸选择上下、左右、单窗格，并检查两个窗格的独立位置。旧版 0.1.9 通过真实 GitHub 检测到 0.1.10，完整下载并通过包名、版本、签名与哈希校验；新版另通过真实 GitHub 检查。

`scripts/android-github-update-regression.ps1` 只接受明确的模拟器，使用已安装的正式 APK，不确认安装、不操作真机。本机直连 Android 测试网络出现连接重置，现有代理出口 API 匿名额度又已用完，因此该次网络验收使用 `scripts/testing/github-update-proxy.mjs` 的回环 CONNECT 转发：API 走主机直连、公开下载走现有 7890 代理；TLS 仍端到端，不解密、不放入 GitHub 凭据、不伪造响应，不随 APK 发布。关闭测试后清理转发。

## 0.1.10：Windows / Android 附近互传第一版

首页“附近互传”，或本机文件长按多选 → 更多 → 发送到附近设备。两端显式开启后选设备，核对接收码，接收端确认目标路径。支持嵌套文件夹、空目录与零字节文件，显示进度/平均速度/错误、拒绝与取消。Android 前台通知可停止网络监听；关闭界面不会自动结束进行中的传输。

不共享整块磁盘，不开机监听，不接云中转，不经过更新 HTTP 代理；每批单独新目录，不覆盖已有内容，不删除来源。暂不直接发送 SMB/SAF/网盘/符号链接，不做断点续传或自动重传。详细协议、安全边界与测试见 [NEARBY.md](NEARBY.md)。

## 0.1.9：独立双窗格与电子书

- 自动模式按可用窗口尺寸（不是设备型号）选择左右或上下双窗格。每边保留独立主页、目录、选择和滚动；中间 44 px 触摸按钮切换布局，手动偏好保存在 `rhfiles.panes`。普通窄手机在自动模式保持单窗格；0.1.11 起可在任何尺寸手动选择两种方向，折叠/缩窗不会销毁另一边状态。
- 多选底部直接提供“复制到另一窗格 / 移动到另一窗格”，确认时固定显示目标；目标还在主页时不猜测目录。共享待粘贴列表可跨窗格使用。原生文件任务继续负责递归合并、拒绝静默覆盖、进度、取消和逐项失败；不依赖手机拖拽。
- 两个可信应用 iframe 由主页面代理 IPC，主页面验证调用方窗口身份；系统 Back 只作用于活动窗格。设置/凭据是全应用共享，文件浏览状态分别保存。自动更新、首次索引和外部分享导入只由主窗格触发一次。
- 阅读器使用单独 `:ebook` 进程、WebView 数据目录及 HTTPS 本地资源域名；不装入 Tauri/文件管理 IPC。仅能读取用户选中的书；禁用书内脚本、表单、外部链接和网络资源，不解压到用户目录。SAF 临时副本位于私有缓存，关闭阅读器清理，异常残留按时清理。
- EPUB/CBZ 使用受限原生 ZIP 资源流，MOBI/AZW3/FB2 使用固定版本 foliate-js 解析。支持字号、目录、翻页/滚动、明暗/护眼、每书书签和 CFI 位置恢复。64 MB 文件、20 MB 资源、8 MB 文本、256 MB 展开总量、5,000 条目是首版明确上限；拒绝 DRM，PDF 继续用系统阅读器。
- 第三方来源/许可证和补丁见 `android/reader/vendor/UPSTREAM.txt`；固定 foliate-js `78914aef4466eb960965702401634c2cb348e9b1`，MIT。其 API 不稳定，升级必须重跑阅读器安全与真实格式测试，不盲目跟随 latest。

```powershell
node --test android/web/tests/*.test.*
node android/web/tests/flow-check.mjs
node android/web/tests/panes-check.mjs
node android/reader/tests/reader-check.mjs
# Install debug APK on the dedicated emulator first. Never select a phone:
$env:RHFILES_TEST_EMULATOR='emulator-5582'
node scripts/android-dualpane-ebook-regression.mjs
```

浏览器用例模拟文件管理桥，但阅读器调用真实 vendored 解析器；模拟器用例另行验证原生文件字节、文件夹合并和独立阅读进程。物理折叠铰链、特定书籍/字体/DRM、手机厂商 WebView 仍需真机验证。

本版已通过：153 项原有浏览器业务、18 项双窗格流程、22 项列表/格式/布局单元测试、15 项真实解析器阅读、安全与损坏文件用例；71 项 JVM/Robolectric；专用 Android 16 模拟器 13 项实际文件字节与独立阅读进程验证。模拟器使用原生 x86_64 调试构建避免 ARM 转译的冷启动开销；发布 APK 仍为 arm64-v8a，不发布模拟器包。正式版另用 Android instrumentation / 无障碍文本检查真实阅读页面。

## 0.1.6：跟手手势、稳定滚动和原生播放器

- 抽屉在松手前实时显示中间位置，按距离/速度平滑吸附，取消手势恢复原状态。
- 长列表使用固定滚动总高度，移除滚动锚定反馈；滚动、拖动、取消和行回收都会撤销长按，不会误入多选。
- Media3 1.11.1 原生视频/音频播放器；沉浸式图片查看器，275 CSS px 窄屏工具栏保持一行；首页索引卡片改版。
- 本轮验证：手机前端模拟 IPC 131 项、格式/列表 12 项、原生 JVM 53 项、桌面 JS 191 项、PDF Rust 5 项；真实模拟器专项 14 项和导航/刷新 10 项通过。
- 正式 APK（非调试包，R8 开启）也在专用模拟器通过安装、下载目录导航、视频画面和一次返回验收。没有安装或操作用户手机。
- Windows PDF 的真实独立实例流程覆盖内置中文五页打印、右键/对话框、自定义命令、失败退出、无效输出和拒绝覆盖；五页均经渲染目检。视频验证使用 H.264/AAC 夹具，不代表所有设备、MP4 内部编码都兼容。

## 0.1.5：首次更新器发布与首页手势回归修复

- 包含下方 0.1.4 更新器；0.1.4 已写入家庭服务器后发现首页刷新仍可能打断手势，因此不覆盖已发布字节，增加 Android 版本至 0.1.5。
- 容量、收藏数量和索引通知只更新首页相应文字，不替换整张卡片/图标；后台容量和索引状态变化不再移除正在接收滑动的触摸目标。
- 安装授权意图保存在应用私有配置；Android/OEM 在授权过程中回收进程时，完整 APK 和待安装状态仍能恢复。
- 验证：浏览器交互 123 项（模拟 IPC）、格式/列表 12 项、原生 JVM 53 项、桌面回归 191 项通过；Android 16 独立模拟器的导航/刷新 10 项和真实更新 15 项通过。
- 真实更新用 0.1.4 debug 基线更新到发布的 0.1.5 release APK，经过真实 HTTP 下载、大小/哈希/版本/不同签名拒绝、取消重试、系统未知来源授权、系统确认和 PackageManager 版本核对；不是仅启动 adb 安装来冒充应用内更新。测试只接受 `emulator-*` 且验证 `ro.kernel.qemu=1`，没有操作用户手机。

## 0.1.4：应用内更新（2026-10-15）

- 设置 → 应用更新：GitHub 仓库 / 家庭服务器目录；Android 使用独立的 `releases.android.json`，不会使用 Velopack/Windows 版本。
- GitHub 查找带 Android 清单的正式发行，跳过更新的 Windows-only 发行；不使用桌面的 latest 版本号来判断 Android 更新。
- 家庭服务器支持 `\\SERVER-HOME\Public\Software\RHFiles-Releases`、`smb://server/share/path`，或 HTTP/HTTPS 目录。需要认证时先在“网络位置”添加相同主机/共享的 SMB 登录配置，再在更新设置中选择；凭据继续由 Keystore 加密，不进入清单、URL 或 WebView 持久存储。
- HTTP 更新支持独立代理配置；手机上的 `127.0.0.1` 是手机自身，电脑代理应填写电脑的局域网 IP。SMB 不经过 HTTP 代理。
- 自动检查（默认开启）：启动、进入设置、每小时；关闭后上述自动入口都不发网络请求，手动检查仍有效。自动检查绝不自动下载。
- 点击“下载并安装”：独立前台下载服务/通知，显示大小、平均速度，可取消；不会抢占文件任务的通知。APK 保存在应用私有 `files/updates` 下，不需要所有文件权限。
- 发布前验证签名；下载检查大小和 SHA-256；安装前再次校验包名、严格递增的 Android versionCode、versionName、最低系统版本、真实 APK 架构与现有签名。同名但不兼容/签名不同的 APK 不会卸载现有安装。
- 首次跳转系统“允许安装未知应用”；授权返回后继续唤起系统 APK 安装确认，不绕过确认。未安装的完整 APK 可继续安装；下载中进程被杀只丢弃本次 `.part`，不把残包当成功，不自动重做。
- 第一版更新器仍需要一次覆盖安装；此前的 APK 没有应用内更新入口，不能凭空更新自身。覆盖安装保留应用数据。

### 发布 Android 更新

构建同签名 APK 后执行：

```powershell
./scripts/publish-android.ps1 -NotesFile ./android/release-notes.txt
./scripts/publish-android.ps1 -NotesFile ./android/release-notes.txt -OutputDirectory '\\SERVER-HOME\Public\Software\RHFiles-Releases'
```

将输出的 APK 和 `releases.android.json` 一起上传为 GitHub 正式发行附件（例如 `android-v0.1.4`）。
创建 Android 发行时必须设置 GitHub 的 `make_latest: "false"`，保留 Windows 发行的 latest 指向，避免桌面端取不到 `releases.win.json`。不要标成 prerelease（客户端默认只读取正式发行）。
可用 `scripts/publish-android-github.ps1 -Directory <清单和APK所在目录>` 自动完成：从 Git 凭据管理器读取现有登录、创建非 latest 正式发行、上传并校验 GitHub SHA-256、确认 Windows latest 未改变；可通过 `-Proxy http://127.0.0.1:7890` 指定发布机代理。脚本不替换已有的不同字节附件。
家庭服务器中先提交 APK、最后原子替换 Android 清单；不改 `releases.win.json`。不同 CPU 架构可逐个发布到同一清单；同版本/架构不能悄悄替换不同字节的 APK，需增加版本号。

```json
{
  "schemaVersion": 1,
  "packageId": "com.railgunhamster.rhfiles",
  "releases": [{
    "version": "0.1.4", "versionCode": 1004, "minSdk": 24,
    "notes": "更新日志\n支持多行",
    "assets": [{
      "abi": "arm64-v8a", "fileName": "RHFiles-Android-0.1.4-arm64-v8a.apk",
      "size": 123456, "sha256": "填写实际 APK 的 64 位 SHA-256"
    }]
  }]
}
```

## 0.1.3：触屏导航与闪烁修复（2026-10-15）

- APK 同步桌面版橙绿文件夹图标，包含传统、圆形与自适应启动图标；资源成为受版本控制的构建输入，重新生成 Gradle 工程后也会恢复。
- 首页向右滑打开导航抽屉；抽屉内向左滑关闭。纵向滚动、多指操作和文件列表滑动不会误触发。
- MediaStore/存储变更通知不再重复执行会创建测试文件的权限探测，避免探测自身触发通知循环；真实恢复前台时仍检查权限。
- 后台目录刷新不再清空页面：合并并发通知，内容不变时保留 DOM，有变化时保留滚动和仍存在的选中路径，迟到结果不能覆盖新目录。
- AndroidX 原生返回回调接管系统按键/侧滑，优先关闭弹层、抽屉和多选，再逐级返回目录；从首页返回才将应用移至后台。原生模式不再依赖 WebView 的占位历史条目。
- 自动化验证：格式/列表单元 12，浏览器交互 110（模拟 IPC），Rust 业务/注册表 IPC 43+8，原生 JVM 34；Android 16 独立模拟器中完成真实 APK 的抽屉手势、连续变更不闪烁、目录层级、设置、抽屉关闭和首页退出等 10 项回归。
- 模拟器测试入口 `node scripts/android-regression.mjs` 强制验证 `emulator-*` 与 `ro.kernel.qemu=1`，拒绝连接真机。需要预先安装匹配 ABI 的 debug APK；`--baseline` 仅记录旧版问题，不计作通过。
- 这轮未在用户正在使用的摩托罗拉上安装或测试；真机覆盖安装留待用户方便时进行。签名不变，无需卸载或清空已有数据。

## 0.1.2：功能补齐（2026-10-02）

以 [File Manager Plus 的官方介绍](https://play.google.com/store/apps/details?id=com.alphainventor.filemanager)
为功能和信息架构参照，自行实现；不复制图标、商标、素材或源码。
仍是 **Tauri 2 + WebView + Rust + Kotlin**，不是 Compose 迁移，不宣称完整功能等价。
Android crate 与 Windows workspace 隔离；本次不修改桌面实现。

## 功能

### 本机文件与存储

- 明暗主题、三列分类首页、列表/网格虚拟化、排序、隐藏文件、收藏、长按多选。
- 新建、重命名、复制/移动、当前目录搜索和全局索引搜索；粘贴目标栏跨导航保留。
- Kotlin `StatFs` 返回真实容量，无法读取时不编造数字。
- SAF：授权 SD/USB/系统文件提供者的目录，持久权限、浏览/创建/重命名/复制/删除、撤销授权。
- 系统文件选择器导入；接收 ACTION_SEND / SEND_MULTIPLE，用户选择目标后才复制。
- 不把 content URI 猜成文件路径；文件提供者的权限、离线和不支持操作错误会显示出来。
- 插拔存储广播、恢复前台、MediaStore 内容变化触发刷新；媒体分类使用系统实时查询。
- 文档/归档/全局名称仍使用 Rust 索引；启动时过期自动更新，本应用任务完成后更新。
  不是全盘实时监控；分类单页最多 2,000 项，目录最多 50,000 项，标明截断。
- 系统打开方式/多文件分享；APK 安装和应用卸载始终经过 Android 确认。

### 压缩与文本

- ZIP 创建，可选 0/1/6/9 级；ZIP（Stored/Deflate）、TAR、GZ、XZ、TGZ、TXZ 浏览/解压。
- 解压到新建文件夹，不合并/覆盖已有目标；拒绝路径越界、链接/设备节点、重复路径和 CRC 损坏。
- 提交前使用独立临时目录/文件；取消或失败只清理本任务的临时内容。
- 安全上限：解压 8 GiB / 100,000 条目；目录预览 2,000 条目 / 扫描 256 MiB；XZ 内存 64 MiB。
- 暂不支持加密归档、RAR、7z、ZIP 中的其他压缩算法；错误明确显示，不声称支持。
- UTF-8 文本编辑最大 1 MiB；保留 BOM/换行，拒绝二进制/非法编码和超限文件。
- 保存用 SHA-256 修订校验，拒绝覆盖外部修改；临时文件写入后替换；退出未保存修改要确认。
- 原有只读预览仍限制 256 KiB，截断预览不能直接当完整文件保存。

### 图片与媒体

- 全屏查看区域、图片上一张/下一张、双击/双指/滚轮缩放、平移、旋转、适应窗口。
- 音视频系统 WebView 控件，额外提供 ±10 秒、倍速和循环。
- 关闭时释放媒体和事件监听；解码依赖设备 WebView。不支持的格式可交给系统应用。
- 网络文件先下载，SAF 文件可交给原生打开方式；不是所有位置都内置流式预览。

### 网络与网盘

- SMB2/3（用户名/密码 NTLM）、FTP、显式 FTPS、WebDAV/HTTPS。
- 目录、上传/下载、新建、重命名、删除与本地共用文件任务；复制/移动可跨位置。
- 网络密码使用 Android Keystore AES-GCM 加密，保存在应用私有配置中；不进入 URL、WebView localStorage 或任务日志。
- FTPS/HTTPS 校验证书，不提供忽略证书开关。明文 FTP/HTTP 必须在添加连接时显式允许。
- WebDAV 不跟随重定向，XML 禁用外部实体；SMB 不支持 SMB1 或 Kerberos。
- **网盘目前通过 Android DocumentsProvider**：依赖设备中已安装并登录的提供者。
  有的提供者不提供目录授权，只能选择文件导入。
  **未内置 Google Drive/OneDrive/Dropbox 等独立 OAuth 登录**；这需要注册应用配置。

### 应用管理和空间

- 应用名/包名搜索、用户/系统应用切换、启动、系统详情/权限、系统卸载确认。
- 单 APK 备份为 APK；分包应用备份所有 APK 为 ZIP，不能把此 ZIP 当单 APK 直接安装。
- 默认显示安装包占用。用户在系统设置授予用量访问后，通过 StorageStats 查询应用、数据与缓存。
- 文件分类空间扫描与应用占用查看都已提供；不是重复文件清理器，也不擅自删除缓存。

### 任务与恢复

- 原生 dataSync 前台服务和通知，串行队列（最多 20 个活动任务）、真实字节进度、平均速度、暂停/继续/取消。
- 暂停/取消在读写检查点生效，网络连接/读取超时后也会返回；不能强行中断不响应的外部文档提供者。
- 独立任务页面；返回或切换目录不会丢失任务。任务参数、成功来源、输出位置和逐项失败存到私有日志。
- 同名文件另存，不覆盖。复制先使用独立临时目标，完成后发布。
- 移动在副本发布后重新核验来源摘要，再逐项删除已复制的路径，不递归删除后来新出现的文件。
- 本机删除默认移入本卷 `.rhfiles-trash`；记录原位置，支持恢复；恢复冲突停止。
- SAF/网络删除为永久删除且明确确认；回收站永久删除需要两次确认。
- 进程被终止后显示“上次运行中断”；只允许用户显式重试，不自动重放移动/删除。
  不提供逐字节断点续传。崩溃可能留下 `.rhfiles-part-*` 临时内容，来源不因此自动删除。
- Android 15+ 前台服务有系统时限；onTimeout 取消并停止服务，不绕过系统限制。

### 电脑访问

- HTTP 浏览/下载/Range/上传服务，每次启动产生随机密码，用户名 `rhfiles`，默认只读。
- 可显式允许上传新文件，不覆盖已有文件；身份验证失败 401，只读写请求 403。
- 路径限制在所选目录，拒绝越界及符号链接逃逸；文件页面带 sandbox CSP。
- FTP 服务端：被动模式，每次启动随机密码、默认只读；可指定目录和端口，最多 4 个登录连接。
- 可显式允许 FTP 上传新文件/创建目录，禁止覆盖、删除、重命名现有内容和断点追加；拒绝匿名登录。
- FTP 运行期间保留前台通知，通知中可停止；受 Android 前台服务时限约束，不自动重启。
- FTP 上传中断可能留下不完整的新文件，需客户端重新传输；不会覆盖已有文件。
- **HTTP / FTP 均不加密**；仅用于可信局域网，不应暴露到公网。启动 FTP 需明确确认。

## 验证与限制

Android 0.1.8 新增：分类按真实父目录分组，图片/视频文件夹取修改时间最新的媒体作封面；视频缩略图由系统媒体接口生成，不把整段视频传给 WebView。列表滚动复用可见行，缩略图请求去重、限流并有容量上限。首页下载有独立导航边界，不改动实际路径或文件权限；从内部存储进入 Download 的父级仍是内部存储。抽屉开关慢拖阈值均为约五分之一。

设置分成浏览显示、搜索索引、存储权限、更新网络、关于诊断。宽屏有常驻导航，折叠窗口通过 Jetpack WindowManager 读取铰链信息；0.1.9 起可在尺寸允许时使用独立双窗格，支持上下或左右排列。物理折叠屏仍需真机验证。

SMB 更新可直接保存账号密码，也可选择已有连接。`域\\用户名` 会拆成对应的登录字段；密码仍由 Android Keystore 加密保存，不写进更新配置或复制诊断。短主机名先走系统 DNS，再尝试 `.local` 和本地网段 NBNS；不修改系统 DNS 或共享权限。无法仅凭旧版“更新失败”确定手机故障，新版会显示异常链与针对性提示。

自动化测试包括 Rust 业务/真实注册表 IPC、浏览器桩 IPC、JVM/Robolectric 原生业务，
以及真实临时目录、回环 FTP 服务器和 WebDAV 测试服务器。不是全都用空返回 mock。

2026-10-16 验证：Rust 单元 44 + 注册表 IPC 8、原生 JVM/Robolectric 57、
浏览器交互断言 153、前端格式/排序/列表单元 18，全部通过。
独立 Android 模拟器实际 APK 回归 16 项通过（缩略图、最新分类封面、滚动与手势、下载边界、设置分类、窗口变化及恢复）；铰链部分使用合成几何。开启 R8 混淆的正式 APK 通过回环 SMB 服务的域账号登录、更新清单读取与完整 APK 下载，故意不匹配的版本元数据在安装前被拒绝。
FTP 测试包含真实登录/下载/上传、匿名和错误密码拒绝、并发连接上限、
真实越界文件、禁止覆盖/删除，以及延迟的旧服务清理不得停止新服务。
浏览器交互使用模拟 IPC；原生协议测试使用本机回环服务，不代表真实 NAS 兼容性。

**日常验收优先使用独立模拟器，不操作用户正在使用的手机；本轮尚未做真机验收**：
SAF/OTG 厂商差异、真实网盘提供者、Keystore、系统分享/安装/卸载、前台通知、
Android 杀进程/系统超时、SMB NAS、真实 FTPS 服务器、媒体硬解码需设备验证。
JVM 测试、编译成功和浏览器截图不能替代这些验收。

目前仍使用开发签名用于覆盖侧载，不是公开商店发行的生产签名方案。
未完成独立网盘 OAuth、多语言体系和原生电视专门交互；独立双窗格及电子书阅读见本页 0.1.9 部分，附近互传见 0.1.10 部分。
完整对照及外部前提见 [ANDROID-PARITY.md](ANDROID-PARITY.md)。

## 测试和构建

在仓库根目录：

~~~powershell
cargo test --manifest-path android/src-tauri/Cargo.toml --lib --tests
node --test android/web/tests/*.test.cjs android/web/tests/format.test.js
node android/web/tests/flow-check.mjs
node android/web/tests/ui-check.mjs
pwsh -File scripts/android-sync.ps1
android/src-tauri/gen/android/gradlew.bat --project-dir android/src-tauri/gen/android :app:testUniversalReleaseUnitTest
pwsh -File scripts/android-build.ps1 -Target aarch64
~~~

UI 截图输出在 `android/web/tests/__screenshots__/`（忽略）；浏览器测试缺运行时会失败，不静默跳过。
`scripts/android-thumbnails-layout-regression.mjs` 仅接受明确的模拟器序列号（默认 emulator-5582），检查真实图片/视频缩略图、最新分类封面、滚动中的图片保留、下载导航边界、五分之一抽屉手势和窗口缩放。运行前在模拟器 Download 中准备 `rhfiles-sample.png` 和 `sample-h264-aac.mp4`；会在专用 QA 目录创建媒体并在退出时恢复窗口尺寸和密度。模拟的铰链数据只能验证布局几何，不能代替真实折叠屏硬件。
原生权威输入在 `android/gradle/` 和 `android/manifest/`，同步脚本恢复 Kotlin、测试、R8 规则、权限与 Gradle 配置。
Tauri 生成目录 `android/src-tauri/gen/android/` 不提交。

构建需 JDK、Android SDK/NDK、Rust Android target、cargo-tauri。
本机 JDK 临时 Unix socket 路径需设置：

~~~powershell
$env:JAVA_HOME='C:\Program Files\Android\openjdk\jdk-21.0.8'
$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=D:/git/RHFiles/temp/java-sockets -Djava.net.preferIPv4Stack=true'
$env:ANDROID_HOME='C:\Users\Administrator\AppData\Local\Android\Sdk'
~~~

以上只是本机进程环境，不修改全局 Java/网络配置。
发布脚本要求构建成功、输出新鲜、包名/版本/单 ABI 正确并验签，才复制到：
`android/dist/rhfiles-android-arm64-v8a-release.apk`。
失败不会把目录里旧 APK 当作新发布物。

## 实现依据和依赖

Android 0.1.6：本机/SAF 视频和音频使用未导出的 `PlaybackActivity` + Media3 `PlayerView`，不再通过 WebView 文件协议播放；支持图标控制、横屏、倍速、适应/裁切、循环与失败后的外部播放器入口。仅在前台播放，离开即释放播放器，返回保留位置。MP4 是容器，实际可播放编码仍受设备解码器限制，不能承诺任何 MP4 都可播放；不捆绑停止维护的播放库或未知来源解码器。

图片使用沉浸式查看器；长列表使用固定总高度和绝对定位窗口，禁用浏览器滚动锚定，触摸滚动取消委托式长按，避免回收行计时器误选。主页抽屉按触点位置更新 transform/scrim，结束后吸附。内置索引操作改为中性卡片。

- [Android Media3 1.11.1](https://developer.android.com/jetpack/androidx/releases/media3)、[PlayerView](https://developer.android.com/media/media3/ui/playerview)、[支持的容器与编码](https://developer.android.com/media/media3/exoplayer/supported-formats)，Apache-2.0。Gradle Kotlin 插件更新为 2.2.10 以兼容其 Kotlin 元数据。
- [Jetpack WindowManager 1.5.1](https://developer.android.com/jetpack/androidx/releases/window)，Apache-2.0；使用窗口布局信息读取分隔铰链，不以设备型号猜测折叠状态。

- [SAF 与持久授权](https://developer.android.com/training/data-storage/shared/documents-files)
- [前台服务时限](https://developer.android.com/develop/background-work/services/fgs/timeout)
- [Apache Commons Compress](https://commons.apache.org/proper/commons-compress/) 1.28.0，Apache-2.0
- [XZ for Java](https://tukaani.org/xz/java.html) 1.10，0BSD
- [Apache Commons Net](https://commons.apache.org/proper/commons-net/) 3.13.0，Apache-2.0
- [Apache FtpServer](https://mina.apache.org/ftpserver-project/) 1.2.1，Apache-2.0
- [SMBJ](https://github.com/hierynomus/smbj) 0.14.0，Apache-2.0；Bouncy Castle 显式更新为 1.83
- [OkHttp](https://square.github.io/okhttp/) 4.12.0，Apache-2.0

保留依赖许可证/NOTICE 资源；只排除 Android 不使用的重复 OSGi 元数据。
R8 只忽略已明确不使用的 JGSS/EL/Zstd 可选依赖，保留 SMB 事件订阅注解及方法。
