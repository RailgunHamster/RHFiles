# RHFiles Android

## 当前方向（0.1.1，2026-10）

按用户要求，以 [File Manager Plus 的官方商店页面与截图](https://play.google.com/store/apps/details?id=com.alphainventor.filemanager)作为信息架构和操作流程参考：
三列分类首页、独立路径栏、紧凑文件列表、长按多选、明确的复制/移动目标操作栏。
RHFiles 自行实现，未复制第三方图标、商标、源代码或宣传素材。

本轮是现有 Android 应用的 UI/交互重构，**不是 Compose 原生 UI 迁移**。
当前架构为 Tauri 2 + WebView + Rust；Kotlin 接入 Android 系统能力。
未来可以用 Compose 替换 UI，通过 JNI/其他 FFI 继续复用合适的 Rust 代码；
“Compose 必须放弃 Rust”不是技术限制。

Android 是独立 crate，根 Cargo workspace 用 exclude 隔离。Windows 界面不改动。

## 已实现

- 默认明亮，可切深色；中文主界面。
- 首页：内部/外部存储、下载、图片、音频、视频、文档、压缩包、最近修改、
  收藏、从电脑访问、空间分析、设置。仅展示已接通的功能，不放虚假的网盘/应用管理入口。
- 可用容量由存储接口返回；无法取得时显示位置说明，不编造占用数字。
- 目录标题使用“内部存储”等名称；可点路径面包屑、首页和上一级。
- 列表与网格均虚拟化，选中项用完整路径标识；返回目录恢复滚动位置。
- 长按选择，选择状态下点选/全选；操作栏提供复制、移动、重命名、删除、复制路径。
- 复制/移动后常驻目标栏；跨目录、回首页、返回都不会丢失待处理来源。
- 操作中的任务状态不随导航消失；完成后不会把用户拉回原目标目录。
- 单次任务串行，部分失败列明每个文件的原因，并保留失败来源供重试。
- 永久删除前明确确认；返回/点遮罩取消，不执行删除。
- 分类查询使用现有文件名索引，单次返回最多 2,000 条，同时返回总数和截断状态；
  隐藏目录内的文件默认不进入分类。最近修改按时间排序。
- 目录搜索默认只过滤当前文件夹，显式切换到全局索引搜索。首次索引提供建立入口。
- 收藏存入应用私有 WebView localStorage，重新打开后保留。
- 图片/音视频使用 asset 协议预览，文本限制前 256 KB。预览不支持的格式明确报错。
- Kotlin 原生桥提供打开方式、分享文件、精确权限设置入口、真实权限查询、状态栏配色。
  PDF 等非文本文件优先交给 Android 的打开方式选择器，不当作文本读取。
- 设置、局域网文件服务、空间分析分别为独立页面；诊断日志折叠在设置内。
- 文件枚举、复制、移动、删除、文本读取、摘要、缩略图、空间分析在阻塞线程池执行。
- 目录/搜索/预览使用请求代次，迟到响应不会覆盖新页面。
- 写权限探针使用唯一名称和 create_new，不覆盖已有同名文件。

## 原生桥与权限边界

MainActivity 在 onWebViewCreate 注册 AndroidX WebKit WebMessageListener，
只允许 http://tauri.localhost 与 https://tauri.localhost，且只处理主 frame。
不使用任意来源 JavascriptInterface，不把系统能力暴露给预览文件或网络页面。

打开/分享先 canonicalize 路径，仅允许共享存储中的可读普通文件。
FileProvider 生成 content URI，仅为此次 Intent 授予读权限；分享最终由系统选择器和用户完成。
旧 WebView 不支持桥时不显示相应菜单，并保留内置预览。

Android 11+ 原生查询 Environment.isExternalStorageManager。
Rust 的可读/可写探测仍用于路径诊断，不能等同于正式权限状态。
MANAGE_EXTERNAL_STORAGE 不赋予其他应用私有数据的任意访问能力；
Android/data、Android/obb、不同厂商的 SD/OTG 行为仍需设备测试。
目前未接入 SAF 文档提供者，因此不能声称支持所有 content URI 或云端位置。

## 尚未完成 / 不能保证的部分

- 本轮没有连接真机；浏览器 UI 断言使用桩 IPC，不等同于 APK 真机验收。
- 当前不是完整 File Manager Plus 功能替代品：SMB/网盘、归档内容浏览与解压、
  已安装应用管理、接收其他应用分享、SAF、回收站、前台服务仍未完成。
- 后台任务仅保证应用进程存活期间执行；强制结束或系统杀进程后不会自动恢复。
  当前只有任务状态，没有逐字节进度、速度、暂停或取消。
- 图片/视频解码依赖设备 WebView；没有实现全屏画廊手势和自有音视频解码器。
- 分类来自索引快照，外部变更需更新索引。索引主动跳过部分缓存与受限目录。
- 前端当前以中文为主，尚未有完整多语言资源体系。
- 标签页、平板双窗格等是后续产品选择，不能以“手机用户不需要”为理由永久排除。
- 局域网 HTTP 服务当前没有认证，开启前提示同网设备的读写风险；只在可信网络使用。
- 当前沿用开发签名供侧载迭代，不应当作正式公开发行的生产签名方案。

## 开发与验证

在仓库根目录执行：

~~~powershell
cargo test --manifest-path android/src-tauri/Cargo.toml --lib --tests
node --test android/web/tests/format.test.js
node android/web/tests/ui-check.mjs
~~~

UI 测试入口转到 flow-check.mjs，覆盖首页/列表/网格、长按多选、复制/移动失败与重试、
删除确认、重命名、新建、收藏持久化、局部/全局搜索、排序后选择、
大目录滚动恢复、过期响应、任务过程中导航、权限拒绝/恢复、320/360/800 px 布局、
主题与原生桥前端契约。原生桥在此仍是 mock，设备级 Intent 必须单独验收。

测试截图在 android/web/tests/__screenshots__/，不提交 Git。
所有浏览器测试必须实际运行；缺 Playwright 会失败，不静默算通过。

2026-10-02 本轮验证：40 个 Rust 单元用例、8 个真实注册表 IPC 用例、
11 个格式化用例、71 项浏览器交互/布局断言通过；arm64 release APK 编译及验签通过。
APK 中的原生库 SHA-256 与本次生成的原生库一致。当前 adb 无连接设备，
以下设备清单尚未执行；不能将上述结果表述为真机测试通过。

真实 IPC 测试使用 Tauri MockRuntime 驱动生产命令注册表；
Rust 文件操作测试在临时测试目录执行，不接触用户文件。

### 设备验收清单（本轮待完成）

1. 从旧版本覆盖安装，确认收藏/主题保留，首次授权可直达系统权限页。
2. 系统返回手势：预览 → 关闭；多选 → 取消选择；目录 → 原位置并恢复滚动。
3. 真文件跨目录复制/移动、同名冲突、部分失败、删除取消/确认。
4. 图片/视频/音频预览；PDF 打开方式；微信等系统分享目标实际收到 content URI。
5. 明暗主题下状态栏、手势导航栏、键盘弹出、横竖屏和字体缩放。
6. SD 卡/OTG 授权与拔出、大目录、应用切后台、存储空间不足。
7. 在可信局域网启动/停止文件服务，电脑端读写范围正确。

## 构建

JDK 17+、Android SDK/NDK、Rust Android targets 与 cargo-tauri 必须已安装。
正常路径：

~~~powershell
pwsh -File scripts/android-sync.ps1
pwsh -File scripts/android-build.ps1 -Target aarch64
~~~

生成工程在 android/src-tauri/gen/android/，不提交。
权威输入是 android/gradle/、android/manifest/、tauri.conf.json 和 Rust/Web 源码。
重新 tauri android init 后必须运行同步脚本恢复 MainActivity、权限和 FileProvider roots。

本机 Java 曾在 Unix domain socket 的临时路径上报 Unable to establish loopback connection。
使用已安装的 Android JDK 21.0.8 和独立短路径的 jdk.net.unixdomain.tmpdir 后，
Gradle 编译恢复。这是构建环境设置，不修改系统网络/防火墙。

发布脚本现在同时要求：
成功退出、APK 写入时间不早于本次构建、正确包名/版本/单 ABI，以及签名有效。
-SkipBuild 只用于已经明确成功的手工构建，不会绕过版本/ABI/签名检查。
不能因为目录里存在一个旧 APK 就报告新版本构建成功。

输出：android/dist/rhfiles-android-arm64-v8a-release.apk。
