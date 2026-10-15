# RHFiles Android

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

自动化测试包括 Rust 业务/真实注册表 IPC、浏览器桩 IPC、JVM/Robolectric 原生业务，
以及真实临时目录、回环 FTP 服务器和 WebDAV 测试服务器。不是全都用空返回 mock。

2026-10-02 验证：Rust 单元 43 + 注册表 IPC 8、原生 JVM/Robolectric 31、
浏览器交互断言 94、前端格式/排序单元 11，全部通过。
FTP 测试包含真实登录/下载/上传、匿名和错误密码拒绝、并发连接上限、
真实越界文件、禁止覆盖/删除，以及延迟的旧服务清理不得停止新服务。
浏览器交互使用模拟 IPC；原生协议测试使用本机回环服务，不代表真实 NAS 兼容性。

**本机 adb 没有设备连接，尚未做本次 APK 的真机验收**：
SAF/OTG 厂商差异、真实网盘提供者、Keystore、系统分享/安装/卸载、前台通知、
Android 杀进程/系统超时、SMB NAS、真实 FTPS 服务器、媒体硬解码需设备验证。
JVM 测试、编译成功和浏览器截图不能替代这些验收。

目前仍使用开发签名用于覆盖侧载，不是公开商店发行的生产签名方案。
未完成独立网盘 OAuth、多语言体系、原生电视/平板专门交互和多窗格。
完整对照及外部前提见 [ANDROID-PARITY.md](ANDROID-PARITY.md)。

## 测试和构建

在仓库根目录：

~~~powershell
cargo test --manifest-path android/src-tauri/Cargo.toml --lib --tests
node --test android/web/tests/format.test.js
node android/web/tests/ui-check.mjs
pwsh -File scripts/android-sync.ps1
android/src-tauri/gen/android/gradlew.bat --project-dir android/src-tauri/gen/android :app:testUniversalReleaseUnitTest
pwsh -File scripts/android-build.ps1 -Target aarch64
~~~

UI 截图输出在 `android/web/tests/__screenshots__/`（忽略）；浏览器测试缺运行时会失败，不静默跳过。
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
