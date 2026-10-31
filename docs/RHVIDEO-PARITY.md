# RHVideo 功能对齐与体验验收

原对照基线是同级 RHVideo 的 `a8caab2`；2026-10-28 重新核对时其实际 HEAD 已为 `869d632`，新增了喜爱文件 ZIP 导出、配置备份／恢复及替换失败重试。以下历史测试不能自动代表这些新增功能已完成。以实际 UI 模块和 FastAPI 路由为准，不以旧 README 或仅有 API 名称的映射为准；仍遵守用户不提供失败请求重试按钮的明确要求。

目标是 Windows 和 Android 都具有 RHVideo 的全部业务能力，视频保持原生播放。不嵌套网站、不直接修改服务端数据库，也不把服务器的工作目录当成本机目录。

对齐边界：重写只允许 RHFiles 风格的视觉适配和平台必要的布局适配，不允许借机删减功能或重新设计浏览／播放流程。普通点击、截图浏览、分段连播、列表顺序播放、超压及同屏必须保留各自原有的取池、顺序、进度、返回位置和偏好语义；不能以一个媒体清单／统一模式下拉替代。接口存在、按钮存在或局部测试通过都不是完成证明。性能退化和实际画面错误同样是未完成项。

## 2026-10-31 完整安卓单视频流程与真实控制栏可见性（继续验收中）

沿用正常 **FBA3** APK、**4B1E** 测试 APK，在 emulator-5590、四个空闲自建辅助 AVD 暂停的宿主条件下，运行完整 `single`，不是前一轮四项卡片检查。结果 **失败**（`rhvideo-current-normal-android-single.log`、`rhvideo-android-single-1793434690305-release`）：已有真实播放／图片返回视频等步骤，随后设置按钮中心为 **(876,2479)**、屏幕 **1080×2400**，不满足原五秒稳定命中要求。截图 `rhvideo-native-touch-failure-qa.png` 已查看，确有生成视频、控制栏已经隐藏；不能把这是“按钮永久错位”的产品复现或已完成整条流程。

旧测试的 `revealPlayerControlsByTouch()` 只根据 `isShown` 和 alpha 判断“已经显示”，但 Media3 的收起动画期间这两项仍可能成立、内容却已被裁到屏幕外。测试驱动现补入真实屏幕位置、全栏裁剪范围、窗口可见边界和物理屏幕尺寸；仅在整个栏可见时跳过用户的显示手势。仍最多一次真实显示手势、一次稳定目标点击，不改 **3500 ms** 自动隐藏、不反复点击、不用 `performClick()`、不放宽五秒目标预算。新增边界检查先 **0/11、全失败**；改后连同已有 probe 检查 **27/27**。其中纯坐标断言执行实际 Java 比较表达式，不模拟 Android View 或声称是 JVM／实际像素验收。第一次 green 的一项测试把注释里的 `performClick()` 也计入，随后只排除注释、保留禁止实际调用的断言。完整本地 RHVideo 源码对照 **1429/1429、零失败／取消／跳过，34.952 秒**（`rhvideo-controller-visibility-full-node.tap`）。测试驱动重建及相同正常 APK 的完整复验另记，未据此宣布通过。

### 相同正常 APK 的完整 single 复验

仅测试 APK 重建 **4 分 22 秒成功**（`rhvideo-controller-visibility-test-apk-build.log`），新测试包 **`6a69315f51f237c562771d07ca706014367db7985902e74d6f2610a487eaf1df`**；canonical 与生成构建目录的 Java 均为 **989DE6E8…**。普通 **FBA3** APK 不重建、不修改，实际安装字节两次都核对一致，保持四项正常标志及原音量／线程／解码／画质／控制栏动画。生成目录因测试构建而带 probe 标志的主包不参与验收，不能再当正常主包冻结；本次使用既有独立 `rhvideo-modal-normal-android-4rIyNS/x64.apk`。

同一宿主隔离条件、同一原场景及单步预算的完整 `single` **通过**（`rhvideo-current-normal-android-single-visible-bounds.log`、`rhvideo-android-single-1793435419193-release`）：实际卡片／上下文入口、单视频控制、内容探测后的真实图片解码／拒绝 HTML、原生菜单、单项父层／不同子项身份返回、独立模式与账号状态、过滤收藏放映快照均执行。原失败处的设置按钮现在由一次显示手势后在 **(876,2321)** 稳定命中，实际记录还包含无需额外显示手势的已可见情况；没有增加点击重试。图片工具栏记录 **412×867**，标题、独立关闭按钮、触摸目标、真实横向滑动及显示空间都通过。实际 `rhvideo-single-qa.png` 和 `rhvideo-image-toolbar-end-qa.png` 已查看，确有中文倍速菜单／1.25 倍勾选和生成四标记图片，不以截图文件存在代替检查。

回执有 **155** 条动作时间记录、零丢弃，首末交付跨度 **220.425 秒**，不是用户端启动／持续 A/V 性能数据。**78** 个生成服务响应、零观察丢弃／错误类，全部响应体关闭；其中第 **32** 个视频响应在 finish 前关闭，不能称为“全部完整传输／没有中断”。运行前后 `media.resource_manager` 均在原五秒只读预算内返回，不由此宣称不存在所有 codec 泄漏或历史资源故障。四个辅助 AVD 由 finally 恢复，测试结束仅停止自建 5590 的测试进程。

事后核对 **1226／4／426** 冻结源码／工具／运行库、56F3 EXE、FBA3 主包、旧 4B1E／新 6A69 测试包、14 个干净参考文件、三份用户脏 schema，以及五台 AVD running／无遗留 RHFiles 进程（`single-visible-bounds-postcheck.json`）。canonical 相对产品快照只改了文档及 androidTest Java，新增文件也是测试；不是本轮更换播放器来通过测试。本次是完整 single 场景，不是全部 Android 模式、同屏、真机／ARM、Windows 新整轮或同质量性能对照；未正式发包，完整目标仍未完成。

### 当前 native 源码的单调时钟诊断

调试 **CCEB** 的四个 native 源文件与当前源码逐字节核对相同，只用生成 H.264 **4206d583…**；新启用既有有界 producer callback，而非将 stderr 块到达时间当成内部耗时。`rhvideo-current-monotonic-producer.log`／`rhfiles-e2e-g1LKp2/startup-measurement.json` 实际 **71 条、零丢弃**：native 请求约 **332 ms** 完成、命令约 **333 ms** 返回，前端却约 **2282 ms** 才得到应答。引擎构造约 **46 ms**、缓冲完成约 **78 ms**、D3D11 Open 约 **610 ms**、首张图片约 **1334 ms**（后几项相对输入起点）；各时钟原点不同，不可直接混算。GUI 有限排队探测约 0–8 ms，状态阶段记录均不超过一个毫秒精度。该次模块索引重读不是两秒交付尾延迟的充分解释。

已有部分命令 postMessage 候选在 2026-10-28 被实际交错对照否决，不重新采用。当前另只做一次整窗框架 fallback 诊断：发送前拒绝一次只读请求选择原框架通道，测量动作无该条 fetch，native 约 **385 ms** 已完成，前端仍约 **2313 ms** 才完成，像素上界约 **2553 ms**（`rhvideo-current-monotonic-whole-postmessage.log`、`rhfiles-e2e-3O0uKr`）。因此整条换通道也未证明解决尾延迟；未复制／替换产品 IPC 初始化脚本，不重发动作，不改安全策略、缓存、画质、线程或音量。两次皆为 debug 定位，不作正常包性能通过；五个自建 AVD 都由 finally 恢复。

## 2026-10-31 媒体卡片等单次操作的失败回执（继续验收中）

正常 **28CD** 包的实际收藏按钮反例：生成服务明确返回 HTTP 503，语义动作拒绝，但相同实际卡片的 `ui.invoke` 报成功（`rhvideo-client-controls-old-real-normalized.log`、`rhfiles-e2e-khS4Dz/client-controls-baseline.json`）。嵌入 client 哈希 **A6BA** 与旧冻结源码一致，没有替换界面处理器。首次诊断脚本只接受 Error 对象，而 native 实际拒绝字符串，脚本先失败于消息类型；原 `k83UaY` 记录保留，修正仅统一读取这两种错误，不改变产品或注入错误。

卡片打开／标题／辅助按钮、收藏、时间轴帧、分类、图片点击／键盘／滑动／滚轮、对话框取消和安卓返回现在返回原操作 Promise，错误提示单独观察，不再把底层拒绝改成成功；不改变 180 ms 滚轮节流、解码器、播放顺序、搜索合并或后台保存。直接执行实际注册处理器的新检查先 **2 通过／28 失败、零取消／跳过**，修改后连同已有工作台／播放器控件检查 **108/108、零跳过**。整套本地 RHVideo 源码对照 **1418/1418、零失败／取消／跳过，32.992 秒**（`rhvideo-client-controls-final-node.tap`）；前一轮的两项失败为旧 binding 单元夹具未载入新 helper，补入实际 helper 后重新完成整套，没有删除断言。新增同一个 Windows／Android 生成夹具流程，检查真实 HTTP 收藏失败、三种图片卡片入口的真实解码失败及后续有效操作。此处尚未宣称新正常包双端流程通过，不是完整功能或性能验收。

正常 Windows release **3 分 29 秒**，EXE **`56f3ca00c62da2ff2a30e5b4edc7a46ddce898f44d99dd6c4a1fa89aad3d5c44`**；冻结 `rhvideo-pipe-full-I7ydCP`，未改 libVLC 3.0.24 及画质／音量／缓存设置。卡片新场景、已有手写控件、实际图片加载／超时回归 **3/3、零失败／取消／跳过，37.596 秒**（`rhvideo-client-controls-new-windows.tap`）；新场景回执 `rhfiles-e2e-otzIdS/client-controls.json` 中四项实际 UI 拒绝与各自语义错误一致，之后实际有效图片正常打开。这不是新包全部 Windows 整轮或视频性能验收；此前 28CD 的 132 项结果不自动转移到 56F3。

安卓第一次 Gradle 在编译前失败，栈为 JDK 的 AF_UNIX wakeup pipe `connect: Invalid argument`。独立的同 JDK `Selector.open()` 在默认临时目录失败、任务专用短目录成功（`rhvideo-gradle-pipe-{default,short}.log`）；只给构建 JVM 指定 `jdk.net.unixdomain.tmpdir`，未改系统 TEMP、驱动、网络或 APK。该对照说明目录相关，不独自证明唯一系统根因。原失败日志保留。随后正常 release **1 分 48 秒成功**，四项正常 BuildConfig、当前 **ECCE** client、既有 **FC52** workbench、未变 **1F90** JNI 均核对；只同步生成构建目录中的 client 资源，没有修改另一 checkout 的产品源码或重编未变 JNI。QA **x86_64** APK **`fba30a64b9317d9bf39997ad2bdff8e285bb7f808b78cffadb0478ea5685b71a`**（`rhvideo-modal-normal-android-4rIyNS`），不是 ARM 正式包。

该 APK 仅覆盖自建 emulator-5590，并核对实际安装字节；同一个卡片流程 **通过**（`rhvideo-client-controls-new-android.log`、`rhvideo-image-decode-android-6PIjg4/receipt.json`），四项失败及后续有效图片均实际执行，未替换 native 接口或 DOM 处理器。宿主控制总耗时 **43.630 秒**，**startupAccepted:false**，不作启动／冷缓存性能数据；四个辅助自建 AVD 临时暂停后由 finally 恢复。事后 **1226／4／426** 冻结输入、EXE／APK、14 个参考文件、三份用户脏 schema 和五台 AVD running／无遗留 RHFiles 测试进程核对通过（`rhvideo-pipe-full-I7ydCP/client-controls-postcheck.json`）。源码已推送 GitHub／Gitee 独立工作分支，无实体手机操作、无真实媒体／数据库、未正式发包；完整双端功能与性能目标仍未完成。

### 同进程关闭／重开基线

当前 debug **CCEB**、生成 H.264 **4206d583…** 的两次显式打开／关闭中，实际四标记分别在约 **2784／2484 ms** 读到；两次关闭均实际销毁窗口、清空队列并结束媒体响应，旧输入读取被拒绝（`rhvideo-reopen-observed-baseline.log`、`rhfiles-e2e-gyqeDd/reopen-baseline.json`）。两次各构造一个引擎、共载入两次模块库／索引，证明确有重复初始化，但没有证明保活能解决首次慢启动，因此尚未加入保活。

原 `a0C6T4` 诊断在显示统计首次大于零后只读一次 BMP，第二次为黑；保留原失败及黑图。诊断改成原有 **15 秒**固定视觉观察并记录所有样本，而非拿显示计数代替像素。新诊断第一次也有 **2456 ms** 的阴性样本，随后四标记完整；不能从一次黑色读回认定持续黑屏，也不能据此宣布普通发行包无黑屏。该诊断有 verbose／stdio 观察，不作正常性能数据。

## 2026-10-31 正常包同尺寸首画面对照与当前源码初始化诊断

此前正常包两端的实际画面约为 932×524 和 1030×579，不能当等几何验收。`91f3aac` 仅扩展测试工具：只能调整同一测试父进程新建、路径／创建时间核对过的唯一 RHFiles 主窗口客户区，不能传 HWND、窗口选择器、位置或路径，不激活窗口。尺寸范围与一次提交／一秒确认均有限制。实际编译的拒绝外部目标与客户区尺寸检查 **2/2、零跳过，6.824 秒**；本地 RHVideo 源码对照 **1388/1388、零失败／取消／跳过，32.221 秒**。这不是新的发行代码优化。

正常 **28CD** EXE、libVLC 3.0.24、全字节生成 H.264 **4206d583…**、1920×1080／AAC、实际有效音量 20% 不变。只在计时前将原版的自有主窗口客户区调整为 1200×678，未改原版 DOM／CSS／播放函数；原生仍使用普通 1100×524 视频客户区。实际正画面的尺寸分别为 **931.5556×524** 与 **931.5469×523.9951**，一物理像素以内，且四标记实际 BMP 已查看。窗口／控件仍不同，只匹配了视频画面的物理大小。

在五个空闲自建 AVD 暂停的同一宿主上，预先固定四个全新进程的顺序，全部原样保留（`rhvideo-matched-output-abba.log`、`rhvideo-matched-output-Gvmbr5/receipt.json`、冻结 `rhvideo-pipe-full-EZnrSS`）：

| 固定顺序 | 外部自有客户区首画面区间 |
| --- | --- |
| 原生 1 | 6099–6858 ms |
| 原版 1 | 1899–2765 ms |
| 原版 2 | 3216–3908 ms |
| 原生 2 | 965–1893 ms |

这说明波动仍存在，**不是性能已修复**；没有追加测量直到通过，也没有删除慢样本。它不是 OS／磁盘冷缓存或物理显示器计时。原生各自的引擎首帧记录为 **5825／1406 ms**，确有解码／呈现准备差异；原版自身 rVFC 为 **1679／1559 ms**，第二次与外部读回之间又有明显差距。各记录时钟／起点不同，不能直接相减作唯一耗时归因。首个原生样本另有 **2133 ms** 的外部采样包络，不能把整段都说成解码器耗时。

为核对准备步骤，当前源码另编译 debug **3 分 45 秒**，EXE SHA-256 **`cceb569d7bbeba24c94b56dc940f0cfdef63ea49b7fb49f4908ef0df03958dc0`**，冻结 `rhvideo-pipe-full-E3dAo2`；仅一次生成输入、正常硬件／缓冲／音量设置、verbose 日志和 stdio 诊断，直到统计有显示帧后才读取图片（`rhvideo-current-producer-verbose.log`、`rhfiles-e2e-fvbn5H/startup-measurement.json`）。实际布局 **2 ms**、native 准备约 **1454 ms**、引擎首帧 **6523 ms**。模块选择顺序包含 avcodec、freetype、Direct3D11、d3d11va；stderr 按块到达，不能把接收块的时间直接当作每个模块的精确 producer 时间。该次 EOF 探测是正常的 **206／最后一个字节**，响应约 4 ms 结束后仍有约 2.16 秒才出现下一读取，不能把这类等待一概归因于 416。它不是正常发行包性能验收。

源码另确认本端每次 Engine 释放都会销毁自己的 VLC 实例；[同版本的上游模块库代码](https://raw.githubusercontent.com/videolan/vlc/3.0.24/src/modules/bank.c) 在最后一个实例释放后清空模块表。下一步需实际验证有界模块保活是否有助于重复打开，不能据此就宣称首播根因是 DLL 缓存，也不能为此保留媒体连接或混用音量、旋转、账号、解码输入。此处尚未实施该优化。

两份新冻结快照的各 **1223／4／426** 输入、28CD／CCEB 包、14 个参考文件、三份用户脏 schema 与未改的 Android **C11** APK 事后核对一致（`rhvideo-matched-output-Gvmbr5/postcheck.json`）；五个自建 AVD 均已恢复。全程仅生成媒体／隔离配置，没有读取真实媒体、生产数据库或 `.env`，没有修改显卡、输入服务、安全软件或系统网络设置。本轮未修改发行播放逻辑、未重建 APK、未正式发包；既有 28CD 的 Windows 132 项功能回归不替代当前缺失的性能和 Android 整轮验收，完整目标仍未完成。

## 2026-10-31 原生播放器界面动作的真实完成回执与 Windows 整轮

在旧正常 **A0B** 包实测同文件 A→B→A 后提交原进度拖动：后端明确拒绝“播放输入已改变，旧操作未执行”，相同实际控件的 `ui.set` 却报告 `succeeded:true／updated:true`（`rhvideo-player-controls-old-real.tap`：**0/1、零跳过，13.111 秒**；`rhvideo-pipe-full-dDNcBv` 的 `rhfiles-e2e-kUCTmN/player-controls.json`）。没有替换 UI 处理器或 native API、没有伪造后端响应；这是正常包的实际反例。

`26b258d` 把错误通知与动作完成分开：按钮、四类进度／音量提交、选项、键盘和滚轮返回原动作 Promise，通知只观察其失败，不能把拒绝改成成功。静音／旋转的语义接口也不再吞掉控制失败；未初始化／已经取消的物理拖动明确失败且不写入 native。原输入身份、同文件 ABA、不可变队列版本和拖动起点时长均保留。没有加入失败重试／取消按钮，没有把连续事件改成串行等待，**180 ms** 滚轮节流不变。

新增完整执行实际播放器脚本和注册处理器的检查：最初 **16 通过／31 失败**，后续纠正测试夹具的物理取消事件身份和初始进度值，不放宽产品断言；最终新增 **47/47**，连同既有原输入、按键语义和就绪门禁 **73/73**。补强真实成功结果断言后，显式设置本地 RHVideo 源码的完整本地检查 **1380/1380、零失败／取消／跳过，33.909 秒**（`rhvideo-native-controls-final-node.tap`）；UI 绑定门禁 79 个文件无遗漏。它不是所有界面或平台的业务验收。

正常 Windows release **2 分 30 秒**；EXE SHA-256 **`28cd27f2b6b93bb0426b7326feddd78e9ac795eb1ce5acd52962a8f64d7d6b1b`**。`rhvideo-pipe-full-fxCdK5` 冻结 **1221** 个源码、**4** 个工具、**426** 个运行库。新增实际场景 **1/1、零跳过，17.708 秒**（`rhvideo-player-controls-normal-real.tap`、`rhfiles-e2e-cPzjyg/player-controls.json`）：进度／音量的同文件 ABA、整队列替换、真实 HTTP 503 收藏拒绝均与语义接口返回同一失败，后者一次显式 UI 操作只有一次请求；之后新的音量 37 操作成功，实际播放器 UI 无缺失 API。该场景只涵盖这些实际控件，不把 47 项单元检查说成全部真实窗口操作。

同一封存正常包的完整串行 Windows RHVideo 回归现已结束：**132/132、零失败／取消／跳过，1180.031 秒**（`rhvideo-native-controls-full-windows.tap`、`rhvideo-windows-5o4cf9/receipt.json`）。包含本轮原生控件、上一轮缓存／完整图片导航、原生单路／同屏、五万项和真实 RHVideo FastAPI／临时 SQLite／实际 ZIP 字节等用例；不是把先前失败的整轮与定向通过相加。整轮内同一个实际控件场景也通过，四种拒绝回执在 `rhfiles-e2e-DmFUSU/player-controls.json`。

结束后新 **28CD** 与旧反例 **A0B** 两份冻结包的各 **1221／4／426** 输入均逐项核对不变；14 个参考文件、外部观察器、EXE、未改的 Android **C11** APK 及三份用户脏 schema 也再次核对（`rhvideo-pipe-full-fxCdK5/native-controls-postcheck.json`）。五个辅助自建 AVD 全部恢复 running、均无 RHFiles 进程；5590 的实际安装字节仍为 C11。只使用生成媒体和临时数据库，未读生产 `.env`／媒体／数据库、未操作正式实例或实体手机。

此轮改变的是 Windows 专用 `rhvideo-player.js`，未重建 Android APK，也没有把它说成 Android 原生控制已验收。主媒体卡片还有吞掉失败的注册处理器；准备期 RPC 关闭的即时性、原生启播性能、Android 持续 A/V、完整平台验收与发布仍未完成。本节整轮全绿不等于全部 RHVideo 功能／性能已经对齐，未正式发包。

## 2026-10-31 准备中关闭窗口、Windows 整轮结果与双端修复回归

先区分真实窗口销毁和“发送了关闭命令”。第一次通用 Tauri 关闭命令被 ACL 拒绝，不能当产品复现；随后两个正常包观察都在首个流请求之后才提交关闭，另一次关闭后 1 秒内窗口仍存活，也不能证明准备中关闭。相关失败观察保留在 `rhvideo-close-preparation-old-*.log`，没有放宽时限或将其改记通过。

隔离 debug 构建 **2E1D**、同一 libVLC 3.0.24 与生成的 H.264，真正复现（`rhvideo-close-startup-producer-debug.log`、`rhfiles-e2e-Ynp7Vt/app.log`）：原生根窗口最迟 **568 ms** 已销毁，工作线程的构造却到 **854 ms** 才返回，**855 ms** 继续调用 `play`，接口仍成功返回 `opened:true`。最终停止不能消除这个错误回执；该次 0 个上游流请求也不能反证没有执行旧输入启动。此处是时序诊断，不拿 debug 耗时作发行性能对比。

`b373381` 为每次播放器窗口加入单调身份及关闭态：Destroyed 回调先立即撤销准备，再排队清理；在 GUI／构造返回、旋转重开、预加载接管及启动前后复核同一窗口与 HWND。昂贵构造不可能被中途安全强停，但其返回后不能继续使用已关闭的窗口。旧销毁事件不能撤销后来重开的同标签窗口，清理仍能识别自己的已关闭窗口。未改变缓存时长、音量、画质或解码策略。

真实生产模块的原子状态／关闭后构造返回／旧关闭与新窗口隔离 **3/3** 通过；本地完整源码检查 **1330/1330**、零失败／取消／跳过、30.974 秒（`rhvideo-window-lifecycle-node.tap`），外部工具相关检查 **16/16**。新增测试工具仍只允许同一父 Node 的新 RHFiles 子进程、精确路径及创建时间、唯一可见原生播放器根窗口，一次 WM_CLOSE；没有任意 HWND／选择器、全局钩子、系统服务修改或产品权限扩张。

正常 Windows release **2 分 16 秒**，EXE SHA-256 **`78e088941b811582478c2661148e62563e8c6beaf012a2e90082d1145640017f`**，冻结 `rhvideo-pipe-full-dErY0x` 的 **1219** 个源码、**4** 个工具、**426** 个运行库。实测编译后拒绝外部目标与关闭／重开 **2/2**、零跳过、19.837 秒（`rhvideo-window-lifecycle-normal-focused.tap`）：`rhfiles-e2e-sdD2KV/window-close.json` 的准备返回“播放器窗口已关闭”，**0 次**媒体请求；再次显式打开 video-1，真实四标记像素、10 个显示帧、166 个音频块、非零有效音量均成立，之后第二个实际窗口也已销毁。重开是新的用户操作，不是重放失败请求。它不是持续音频／物理扬声器或首帧性能已经达标的证明。

整套串行 Windows RHVideo 已在同一封存正常包上结束（`rhvideo-window-lifecycle-full-windows.tap`、冻结目录 `rhvideo-windows-NFnkfr`）：**131 项、129 通过、2 失败、零取消／跳过，1197.665 秒**。独立 40 分钟总预算内没有修改该包、重建或并行跑另一条 UI 验收；五个空闲自建 AVD 在 finally 全部恢复。事后 **1219／4／426** 冻结输入及 78E EXE 哈希不变，原 RHVideo 源码与观察工具指纹核对一致（`rhvideo-pipe-full-dErY0x/full-regression-postcheck.json`）。这套结果不是全绿。

第一项失败是实际封面缓存回归：8 张可见封面共 12.8 MB，返回搜索后其中一张重读。`b831cea` 补入移除列表前的可见区域快照，因为持续相交不会产生新的 IntersectionObserver 边界事件；保持 **72 项／16 MiB** 原预算，没有扩大内存换通过。实际函数单元红测 **5 通过／3 失败**，修复后的相关检查 **10/10**。第二项在按键操作前就失败：关闭图片的精确 JSON 断言还缺少先前已添加的 error／caption／requested／failed／status 字段。`961a1d2` 更新完整预期结构，保留所有后续进度条、Home／End、改键、滚轮、滑动及页外收藏断言；它不是发现或修复了键盘逻辑问题，也不消除先前未定位的间歇物理 End 交付问题。

两个修复之后重新构建正常 Windows release，**2 分 44 秒**；EXE SHA-256 **`a0b444b41bd26b7edce8ed31f0762c2e755ce9ea772d658145fd0de0bb0b2bde`**。`6cec030` 的 `rhvideo-pipe-full-V6hVWz` 冻结 **1220** 个源码、**4** 个工具、**426** 个运行库。有明确名称过滤的相关实际回归 **5/5、零跳过，58.104 秒**（`rhvideo-post-full-fixes-normal-windows.tap`）：收藏后的缓存卡片更新、实际可见封面保留、真实图片解码、上述完整图片导航及实际标题栏关闭／重开均通过。1280×800 下 8 张可见图片的 DOM 与已解码 image 均保持同一对象，缩略图请求 **8→8**（`rhfiles-e2e-mAfPkQ/visible-card-cache.json`）；准备中关闭的新回执在 `rhfiles-e2e-KbTINB/window-close.json`。这是五项定向回归，**不是重跑全部 131 项**。

正常 Android release 同步新的共用客户端后重新打包，**2 分 24 秒**；APK SHA-256 **`c11e09d3f1d9b21e373239854dd4feddcaa164690ff29b5f6207442a0c451107`**（`rhvideo-modal-normal-android-dGsrwc`）。复用未改动且核对过的 JNI **1F90**，没有宣称重编译 Rust；共用客户端 **A6BAA7**、工作台 **FC5264**、四个正常构建开关、唯一 x86_64 ABI 与实际安装字节均核对。`6cec030` 抽出同一套实际 DOM／解码／HTTP 检查供双端使用，Android 不伪造 Windows 视口。在自建 API36 模拟器实际 **412×867** 下通过：4 张可见图片共 6.4 MB、同一 DOM／image、无替换，缩略图请求 **4→4**，夹具总请求 **104**、零传输错误（`rhvideo-post-full-fixes-normal-android.log`、`rhvideo-image-decode-android-ZcAoZ1/receipt.json`）。普通单次启动后 5.404 秒满足前台前提，只附着既有 PID，**startupAccepted:false**；不是冷启动、持续 A/V、ARM 手机或完整 Android 验收。辅助 AVD 均恢复，测试应用由 finally 停止。

最后在共用双端测试助手修改后重新执行本地 RHVideo 源码对照检查：**1333/1333、零失败／取消／跳过，31.787 秒**（`rhvideo-post-full-final-node.tap`）。双端事后核对 **1220／4／426** 冻结输入及 A0B／C11 包哈希不变，三份用户脏 schema 仍为原哈希（`rhvideo-pipe-full-V6hVWz/post-full-fixes-postcheck.json`）。仅操作生成媒体、临时服务／数据库、隔离配置与自建模拟器，不触碰真实数据、正式实例或实体手机；当前只有 QA 候选，未正式发包。

另查到微软旧版运行时的[Windows Server 焦点卡顿报告](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5590)，作者确认 151.0.4129.59 已修复；本次私有测试进程实际为 **Edg/156.0.4314.50**，不能直接把相似症状认作同一根因。没有停触摸／输入服务、关闭无障碍、降级运行时或改系统设置。原生启播偏慢、部分关闭消息处理延迟和完整目标仍未完成，未正式发布新包。

## 2026-10-31 正常包首像素对照与显式控件回执（继续验收中）

按用户要求，仅使用 WINSERVER `D:/git/RHVideo` 的源码（`3d6aaeb`）、生成的 H.264／HEVC 媒体和隔离配置。未读取真实数据库、生产媒体或上传 RHVideo 私有源码，也未增加 GitHub 部署密钥。

新增外部单源画布观察器，严格限制为同一测试 Node 父进程启动的 RHFiles 子进程、已核对路径和创建时间、唯一可见主窗口／播放器客户区。不提供任意 HWND／路径、桌面截屏或产品读取端点；有界采样、文件身份和清理均有测试。它不轮询 UI 状态，也不宣称输入租约身份；原逐输入读取器仍保留前后 inputId／renderer／rotation 校验。C++ 工具编译与真实拒绝外部目标检查通过，正常 1EA 包的主客户区读取实测为 1200×800。

在同一正常 **1EA** EXE、libVLC **3.0.24**、硬件自动输出及音频开启的条件下顺序测量；原版直接服务真实 `static/index.html` 字节，调用其 `playVideoLocal`。所有输入均为完整同字节生成文件，音量两边实际均为 20%。临时 pause/resume 五个空闲自建 AVD，finally 全部恢复，不重启或改画质／缓存／解码器。测量为外部 PrintWindow 客户区四标记的观察区间，**不是物理屏幕时间、OS 冷缓存或相同输出几何的最终验收**。

| 输入 | RHFiles 首像素区间 | 参考页面首像素区间 |
| --- | --- | --- |
| 1080p H.264（SHA 4206d583…） | 6165–6880 ms | 1426–2114 ms（rVFC 1066 ms） |
| 4K HEVC（SHA bb9988e3…） | 2991–3722 ms | **失败**：原 15 秒观察内无四标记像素 |

记录在 `rhvideo-release-startup-h264-isolated.log`、`rhvideo-release-startup-hevc-isolated.log` 及 `rhfiles-e2e-ntiexK`／`YOMnFx`／`IFqzNs`／`jH8YTG` 的 `release-startup.json`。参考 HEVC 失败未采到原生 media.error，不能直接认定不支持编码，更不能当成 RHFiles 比参考快的证据。脚本现补充失败后的只读错误码／readyState／networkState，并记录 canPlayType；该补充不能反填历史记录。1080p 有约 2.1 秒的 EOF 416 后空档，但 HEVC 同类 416 后约 24 ms 即读取媒体，旧 producer trace 也显示解码器／D3D 初始化占时；**尚未证实是 HTTP 协议问题，不修改正确的 416 为伪造的 206**。Windows 启播性能仍未达标。

同时补出 11 类显式 UI 事件吞掉失败或不返回动作 Promise：文件勾选、设置数值、快捷键、任务批次展开、浏览速度／两种进度条／可视缩略地图、图片选择／放大、主音量。保留 UI 错误通知但返回原 Promise，不重试，不把连续 wheel／动画调度机械改为串行。实际注册处理器的新红测为前 8 类 16 项失败、其余 3 类 6 项失败；修复后 **31/31**，零跳过。完整本地检查 **1329/1329**、零失败／取消／跳过、32.849 秒（`rhvideo-explicit-controls-full-node.tap`）。不能据此称全部手写控件或完整目标已完成。

正常 Windows release 构建 **2 分 33 秒**，EXE SHA-256 **`899298f37358d10663e7733f9573a9e117fd8d87ebf6524f548392140c26f179`**。冻结 `rhvideo-pipe-full-Zuw5oD` 的 **1217** 个源码、**4** 个工具、**426** 个运行库，实际窗口检查 **1/1**、零跳过、6.819 秒（`rhvideo-explicit-controls-normal-windows.tap`、`rhfiles-e2e-6HRRUt/handwritten-controls.json`）：两处过长搜索、非法字号及非法快捷键的 UI 调用均保留语义动作的拒绝，随后合法修改成功。此单项不是 11 类控件的整窗重跑或完整 Windows 回归。

正常压缩 Android release 重新打包 **1 分 41 秒**，复用未改动且哈希核对过的 JNI **1F90**，只同步本轮工作台资源；未宣称重新编译 Rust。APK SHA-256 **`bc2f342e54eb2ca02fda03e66f8cbac2729374bbfc8e90e322bb1d77fc6c3da5`**，工作台 **FC5264**、正常构建的四个 QA 开关、唯一 x86_64 ABI 及实际安装字节均已核对。自建 API36 模拟器的同一场景通过（`rhvideo-explicit-controls-normal-android.log`、`rhvideo-image-decode-android-H0UUQB/receipt.json`），10 次测试服务请求；四个辅助 AVD 临时暂停后已逐一恢复，整项控制 42.923 秒。普通单次启动后 4.985 秒满足前台前提，仍记录 `startupAccepted:false`，不将它作为冷启动性能验收。

结束后重新逐项核对全部冻结输入及 EXE／APK，三份用户脏 schema 保持原哈希（`rhvideo-pipe-full-Zuw5oD/explicit-controls-postcheck.json`）。源码已推送独立工作分支，不更换正式运行实例、未操作真机、未正式发包。原生性能／完整流程及双端整轮验收仍未完成。

补入正常包的实际字号／快捷键场景后，最终本地源码对照再次 **1329/1329**、零失败／取消／跳过、**32.237 秒**（`rhvideo-explicit-controls-final-node.tap`）。已打开查看正常 H.264 两端的 `first-pixels.bmp`：均为生成的四标记画面；参考首像素图仍带缓冲圈，这项观察不代表持续播放或无卡顿验收。

## 2026-10-31 继续浏览不再等待整页缩略图（继续验收中）

原实现仍先等待 `loadGallery()` 完整解析整页缩略图地址，再创建目标查看器。直接执行实际生产函数，新增元数据页挂起、期间关闭／打开设置和弹窗父层顺序检查；原版 `resumeBrowse()` 不等待图片加载已另有实际源码测试。背景对话框还会失效较新确认、暂停后来视频或重新打开已关闭父层。最终红测 **6 通过／6 失败**（`rhvideo-gallery-page-focus-final-red.tap`），不是实际窗口性能反例，也不代表此前安卓全部延迟都由这一处造成。

提交 `cea1efc` 从 Worker 的实际 `located.item` 取得目标；没有精确定位时只读取回退索引的一项，不依赖尚未画出的页面数组。先准备弹窗父层、打开目标并开始真实解码，再并行重绘底层页；同时观察并保留图片失败，页读取失败后也不留下未处理的迟到解码拒绝。背景 `dialog(..., false)` 不抢焦点、不取消较新确认、不暂停后来视频。稳定 URL／视频／索引回退、顺序、保存位置及普通对话框行为不变。提交 `e128f8a` 增加主页面／弹窗图库两条相同实际流程，弹窗额外核对返回后父层和焦点；相关完整源码检查 **1303/1303，零失败／取消／跳过，35.915 秒**（`rhvideo-gallery-page-focus-shared-final-node.tap`）。

正常 Windows release **2 分 54 秒**，EXE SHA-256 **`1ea8770566f163e6fa2cc818467a2205bec06e139a1d07a4cf8233d3a9e43587`**，冻结 `rhvideo-pipe-full-pETRwb`。实际图库、两条继续浏览、普通图片、叠放和暂存回归 **15/15，零失败／取消／跳过，201.553 秒**（`rhvideo-gallery-page-focus-final-windows.tap`）。主图库／弹窗回执 `rhfiles-e2e-HAkFfo`／`rhfiles-e2e-9bzqrN` 都有真实加载／错误／关闭／设置不抢焦点；弹窗最终 open=true、focus=wb-gallery，返回 PNG 已查看。夹具故意损坏／挂起的 4、5 号缩略图不是实际媒体损坏。此组不含原生视频或全部 Windows 整轮。

正常 Android release **33 秒**，APK **`8e39693ab91962c90f62df5ec0369ff08e0de88ad60c5cb04802f8c550aa48ca`**（`rhvideo-modal-normal-android-WjLHlP`），工作台 **DBD9**／JNI **1F90**、四项正常 BuildConfig 和实际安装字节已核对。专用 emulator-5590 只安装一次；下面所述宿主隔离条件下，原主图库 Continue 全流程 **通过**（`rhvideo-gallery-page-focus-isolated-android.log`、`rhvideo-image-decode-android-IIyhro/receipt.json`）。仅附着 PID 25737，**startupAccepted:false**，生成夹具 307 次请求、零 transport error；实际行按钮、解码后目标、设置不抢焦点、旧加载关闭返回 stale、损坏图、原 25 秒观察内的超时均通过。超时操作为“图片加载超时”，同一 Web 时钟从源设置到撤销约 **20052.5 ms**，动作约 **21475.7 ms**；这次确有原 20 秒 DOM watchdog 证据，不是之前的普通 Native 图片错误。结束后才只读采集最多四项动作时间与原有源观察；不是物理输入、首个可见像素或冷启动计时。`android-iYCD1i` 的 ready／timeout PNG 已查看，分别确有实际图片及错误提示，不再用文件名代替视觉核对。

双端结束后 **1215** 个冻结源码、**4** 个工具、**426** 个运行库及 1EA／8E3 包哈希再次核对一致；三份用户脏 schema 哈希仍为原值。补入场景结束后的只读时间采集后，最终本地 RHVideo 源码对照 **1303/1303，零失败／取消／跳过，43.410 秒**（`rhvideo-gallery-page-focus-observed-final-node.tap`）。此处只有 Android 主图库，不是安卓弹窗入口、真机、持续 A/V、全部功能或同质量性能验收；工具条仍显拥挤，完整目标未完成，未正式发包。

### 初始化慢的宿主对照，不能冒充应用修复

同一正常 **5292** APK 的新观测先后停在主页 frontend ready、RHVideo 库目标可见性的原观察，均 0 次媒体服务请求（`rhvideo-static-bootstrap-observed-android.log`、`rhvideo-static-bootstrap-main-ready-android.log`）。未重启的 PID 24998 后来完成主页；直接只读读取其 PerformanceEntry，loadEventEnd **64856.8 ms**、DOMContentLoaded **64176.5 ms**，多份本地 JS/CSS 的完成记录约 **25–27 秒**（`rhvideo-main-bootstrap-readonly-corrected.log`）。早先内联观测器自身有表达式语法错误，保留日志，不算产品失败。不能从这些数据归咎媒体服务器、文件损坏或已证明某个脚本执行慢。

只读核对宿主为 24 逻辑核、128 GiB 内存，约 23 GiB 空闲、无该次采样换页，WHPX 可用；这项任务的 5 个模拟器各配 6 vCPU，4 个辅助机没有 RHFiles 进程、也没有其他本地 RHVideo 测试进程在跑。为做资源隔离对照，使用控制台 **pause/resume** 临时暂停这 4 个自建空闲机，未重启、清数据、改解码／音量／画质或业务预算。**同一个 5292 包** 的两个实际搜索字段检查随后通过，10 次请求（`rhvideo-isolated-host-control-admitted-android.log`、`rhvideo-image-decode-android-mlhlX3/receipt.json`），整项控制 128.976 秒。首次控制在处理 CRCRLF 名称前提时拒绝，尚未暂停任何虚拟机；修正名称 trim 后才执行。宿主 CPU 两次点采样为隔离前 74%／隔离中 50%，不是完整性能剖面或因果定论。

**8E3** 的继续浏览验收也采用这一明确条件，整项控制 122.914 秒。两次都由 finally 逐一恢复辅助机，结束再次实查四台均 running；没有用重置模拟器、静音、软解、降低画质或放宽业务超时换取通过。一次隔离通过不能认定所有间歇初始化延迟根因已修复，也不能用与此前不同宿主负载的结果宣称本次修改更快。原生关闭证据、持续 A/V、同质量首帧、完整双端整轮及最终发布仍待完成。

## 2026-10-31 手写界面事件的失败回执（继续验收中）

按钮／下拉工厂已有保护，但图库跳页提交、章节速览搜索、阅读器章节搜索仍分别返回 undefined 或 `.catch(notice)` 的已消化 Promise。新增直接执行实际注册处理器的六项红测均失败，原三项工厂检查通过（`rhvideo-handwritten-controls-red.tap`：3 通过／6 失败）。正常 D607 实际窗口另 **0/1，失败，6.259 秒**（`rhvideo-handwritten-controls-old-real.tap`、`rhfiles-e2e-dGyOnW/handwritten-controls.json`）：速览输入 257 字符，底层拒绝，`ui.set` 却报告成功。这不是模拟 HTTP 故障或重新实现业务逻辑。

提交 `ec31722` 保留通知原行为，但返回原动作 Promise，脚本等待真实完成、保留同一个失败，不自动重试。Windows／Android 共用新的实际场景，直接比较语义动作和真实字段 `ui.set` 对过长输入的错误码及消息，再验证有效查询仍可完成。只用生成小说和临时测试服务。本地 RHVideo 源码对照完整检查 **1288/1288，零失败／取消／跳过，29.246 秒**（`rhvideo-handwritten-controls-shared-final-node.tap`）；后续只读 startedAt／settledAt 诊断补充后相关检查 **16/16、零跳过**（`rhvideo-handwritten-controls-and-observer-final-local-reference.tap`）。此前未指定参考目录的一次定向检查为 15 通过／1 跳过，保留记录，不冒充全部通过。

正常 Windows release **3 分 39 秒**，EXE SHA-256 **`989bb1fb92fb5b4fd131405c64b196dc7d8d6597b31c153d539a0c600ba0de74`**，冻结 `rhvideo-pipe-full-idgvT0` 的 1213 个源码、4 个工具及 426 个运行库。实际新场景与图库／继续浏览回归 **10/10，零失败／取消／跳过，70.806 秒**（`rhvideo-handwritten-controls-final-windows.tap`）：两个实际搜索字段与语义动作均返回相同 `INVALID_PARAMS`／`$.query has an invalid length`，有效查询和既有精确位置恢复仍通过。它不是完整 Windows、所有手写事件或性能验收。

正常 Android release **24 秒**，APK **`52929ec5e6816f88ea276419d47254544819c21ffd7d6a3be4700393512dc6e3`**（`rhvideo-modal-normal-android-OTvp9Z`），工作台 **773E**／JNI **1F90**、四项正常构建开关与安装字节已核对。第一次附着 **失败、0 次服务请求**（`rhvideo-handwritten-controls-final-android.log`、`rhvideo-image-decode-android-tF6cP3/receipt.json`）：系统收到启动请求约 14 秒后才创建 PID 24613，调用前提检查更早读不到进程，清理又停止了刚创建的进程。`exit-info` 和 ActivityManager 记录是测试的 force-stop，不是本次应用崩溃。随后单次普通启动加原 20 秒只读前台前提观察，16.071 秒确认 PID 24709；没有重装、重启 AVD 或改预算，**startupAccepted:false**。

前提成立后的同包业务检查仍 **失败、0 次服务请求**（`rhvideo-handwritten-controls-after-startup-android.log`、`rhvideo-image-decode-android-BiqMcL/receipt.json`）：原 20 秒 API 注册观察到期，页面 visible／ready=loading，只有 7 项通用 UI API，workbench 尚未定义，HTML 解析到任务优先级脚本。实际静态 client／workbench 哈希仍正确、唯一库页面 attached。它未进入两个搜索场景，不能用 Windows 的通过替代安卓验收。

测试清理已加所有权保护：没有成功取得附着会话就不 force-stop；实际清理代码红测 3 通过／1 失败，修复后 **4/4**。后续失败观察补充同源打包静态资源的 PerformanceEntry 耗时，最多 32 项，过滤媒体、外部地址、查询串／片段和任意条目属性；不增加原场景调用、重载、请求或时限。源码最终 **1294/1294，零失败／取消／跳过，28.054 秒**（`rhvideo-handwritten-controls-final-diagnostics-node.tap`）；新静态耗时采集尚未设备验证。没有动正式实例、实体手机或真实媒体，没有发布新正式版本。安卓初始化／继续浏览超时、原生视频性能和完整目标仍未完成。

## 2026-10-31 同页图库图片复用（继续验收中）

旧正常 A435 实际窗口的同页跳转检查 **0/1，失败**（`rhvideo-gallery-reuse-old-real.tap`、`rhfiles-e2e-sSkFgy/gallery-reuse.json`）：URL 未变且已经完成 800px 解码，却换掉了图片节点。前后服务请求均为 36，故这只证明节点重建，不能声称已证明额外下载、解码或安卓超时根因。提交 `aa8aabd`／`d893e8c` 仅在当前页、同账号、同清单修订、相同 URL 下复用已加载节点；刷新、账号切换、地址变化、错误或未加载图片不复用，重复条目也不共用一个节点。局部 Map 最多一页，WeakMap 不强持有旧页，没有全库图片缓存。

本地实际 RHVideo `3d6aaeb` 源码对照的完整检查 **1282/1282，零失败／取消／跳过，28.070 秒**（`rhvideo-gallery-reuse-observer-final-node.tap`）。正常 Windows release **2 分 43 秒**，EXE SHA-256 **`d607d9b4b811acc617fa620809dd533833efc3724ae59712890859238e23b11f`**，冻结 `rhvideo-pipe-full-pPca6r`。同一普通 EXE 实际图库、继续浏览、普通图片、叠放及暂存图片回归 **14/14，零失败／取消／跳过，135.380 秒**（`rhvideo-gallery-reuse-final-windows.tap`）；新增同页节点确实相同、complete=true、宽 800，显式刷新和登录后节点不同；继续浏览实际就绪 PNG 已查看。这不是完整 Windows 平台、原生视频或性能验收。

此前同一正常 C24D APK 的阶段诊断已终止，仍 **失败**（`rhvideo-gallery-resume-phase-diagnostic-android.log`、`rhvideo-image-decode-android-AstqIU/receipt.json`）。这次经过 held／设置不抢焦点／Close 返回 stale／损坏图，最后卡在 index 5 未放行响应的原 25 秒观察，不能将局部成功算整轮通过。随后增加只读 DOM 源变更时间观测，最多 16 项、不保存 URL；区分宿主时间与 WebView 时间，明确不是精确解码起点。不改原业务时限、解码或请求，不自动重放。

正常 Android release **26 秒**，APK **`dd0ee9fad26f414a41641c00967918c507bdd7d01813c983a798856b008bf54d`**（`rhvideo-modal-normal-android-pe3GKF`），工作台 **54D8**／JNI **1F90**、四项正常 BuildConfig 与安装字节已核对。仅附着一次普通启动后的 PID 24057，**startupAccepted:false**；最终仍在未放行响应的原 25 秒观察 **失败**（`rhvideo-gallery-reuse-observed-android.log`、`rhvideo-image-decode-android-5P3xg4/receipt.json`）。失败后只读状态显示 timeout 动作已终止为普通图片错误、loading=false、src 已移除；该 URI 的唯一服务请求在约 25.121 秒关闭，未完整写完。DOM 记录最后一次 source 从设置到移除约 15.189 秒，不能把较早的缩略图请求当作全图解码起点，也不能称原 20 秒 DOM watchdog 已验收。宿主／Web 观察区间约 213.528／212.884 秒，没有明显的倍速时钟差，但跨边界采样不精确，仍未定位实际延迟环节。另补入原动作同一 Web 时钟的 startedAt／settledAt，未改业务预算或重放动作；该补充尚未再次设备运行。

实际加载 PNG 是可关闭的“正在加载”；名为 ready 的 Android PNG 仍显示设置面板，不能拿文件名当作图片已可见的证明。两张已查看。1211 个冻结源码、4 个工具、426 个运行库及 D607／DD0 候选在这一轮后再次核对一致。完整目标、手写 UI 错误回执、持续 A/V、原生关闭和同质量性能仍未完成；没有正式发包或触碰真实数据。

## 2026-10-31 继续浏览的首次图片窗口（继续验收中）

实际本地 RHVideo `3d6aaeb` 的 `resumeBrowse()` 调用渲染后立即显示 viewer，不等待图片下载。新增直接执行参考函数的测试已核对这一点；本端 `resumeGallery` 却在真实解码后才 openDialog。四项本端生产函数红测先 **0/4**（`rhvideo-gallery-resume-red.tap`），覆盖首次加载、较新设置、错误及关闭后的迟到完成。

首个实际夹具重用原地址，未观察到新的挂起下载而失败（`rhvideo-gallery-resume-old-real.tap`），不能算产品反例，原因未确定。随后通过真实的“保存位置 → 浏览别页 → 服务端重生成截图 → 刷新 → 继续浏览”流程产生未缓存新地址，按原有源视频回退语义保留位置。正常旧 **01FD** 实际 **0/1，失败**（`rhvideo-gallery-resume-old-rescan-real.tap`、`rhfiles-e2e-1Zzk1O/gallery-resume.json`）：请求确已挂起，index=2、loading=true、current=null，却 opened=false，无法关闭这次加载。没有关闭缓存、替换界面响应或使用真实媒体。

提交 `bec62a5` 已推送 GitHub／Gitee：从实际定位后的目录页提供初始标题，在等待解码前打开可关闭的窗口，完成时不再 openDialog 覆盖较新设置；稳定 URL、视频／索引回退、命名顺序和保存位置语义不变。完整检查先 **1274/1275**，旧持久化单测夹具没有提供真实页面数组；现由实际 Catalog 查询填入，并新增 pending／current 目标 ID 一致断言，没有把生产代码改成静默忽略缺失页面。修正后 **1275/1275，零失败／取消／跳过，47.069 秒**；后续只读诊断补充后的同规模检查 **31.709 秒**（`rhvideo-gallery-resume-diagnostic-final-node.tap`）。

正常 Windows release **2 分 47 秒**，EXE SHA-256 **`a43524375795c481547b4f4bcada47853da68a9cc66641f6f1b1e1d3a4c67d9b`**，冻结 `rhvideo-pipe-full-p8WkDs`。新增实际场景 **1/1，零失败／取消／跳过，33.576 秒**（`rhvideo-gallery-resume-real-windows.tap`、`rhfiles-e2e-GgydGb/gallery-resume.json`）；实际行按钮在挂起时 opened=true／current=null，完成不抢走设置，关闭在旧响应放行前返回 stale，错误保留可关闭窗口。就绪图确有实际图片，加载／就绪／错误 PNG 已查看。未放行响应最终为普通图片加载失败，**不是独立的 20 秒 DOM watchdog 通过**。同一 EXE 相关图库／普通图片／叠放预览／暂存图片回归 **12/12、零跳过，113.707 秒**（`rhvideo-gallery-resume-windows-related.tap`），包含既有精确 URL 插帧恢复；与新增场景合计 13 项，不是完整 Windows 或原生视频性能验收。

正常 Android x86_64 release **33 秒**，APK SHA-256 **`c24d1d8d88fe1053b1d5c6418c04fe090b1d9358b51d7419cbc8304249bce30b`**（`rhvideo-modal-normal-android-lYn9p0`），工作台 **AD0B**／JNI **1F90**，正常 BuildConfig 与实际安装字节核对。单次普通启动后附着 PID 23444、`startupAccepted:false` 的新 `--gallery-resume` 场景 **失败**（`rhvideo-gallery-resume-real-android.log`、`rhvideo-image-decode-android-5ZWuQE/receipt.json`）：一个调用的 30 秒观察超时，没有自动重放。清理前页面 ready=complete／visible、288 个 API 已注册，唯一选中的库页面可见且 attached，实际 workbench／client 哈希正确；`android-xEgac5/image-failure.png` 已查看，仍在图库页。118 次测试服务请求全部 200／完整写完，服务端最长约 **3.234 ms**；没有重生成 URI 请求，也尚未记录 held。不能归咎于旧脚本或已证明网络慢，更不能算安卓恢复场景通过。

原失败没保存具体调用阶段，现补入不含参数／密码的阶段和最后动作记录、失败后只读 image／gallery／公开动作状态采集；不改调用时限、不重载或重发动作。补充后源码检查通过，但这项新阶段采集尚未在后续设备运行验证，当前安卓超时根因未定位。冻结 **1208** 个源码、**4** 个工具、**426** 个运行库、A435／C24D 候选已有哈希核对；三份用户脏 schema 原哈希未变。完整目标、手写 UI 错误回执、关闭证据、持续 A/V、同质量首帧和最终发布仍未完成；未发布新正式包、未操作实体手机或正式实例。

## 2026-10-31 暂存图片预览的解码与会话归属（继续验收中）

对照本地 RHVideo `openTrashPreview`／`closeTrashPreview`，保留从暂存条目打开、关闭图片的流程，不读取真实暂存文件。正常旧 **D73C** 实际界面先 **0/1，失败**（`rhvideo-trash-preview-old-real.tap`、`rhfiles-e2e-kczH0Q/trash-preview.json`）：生成图片的 HTTP 响应仍被挂起，`opened=true`、`loading=false`，却已有 current、没有 requested 或错误。初始八项生产函数红测修正未被旧代码使用的模拟 decode Promise 的测试侧未处理拒绝后，仍 **0/8、八失败**（`rhvideo-trash-preview-clean-red.tap`），不是把测试警告当作产品反例。

提交 `06a627e` 让单张暂存预览复用真实 DOM 解码器及原 20 秒 watchdog，先打开可关闭的加载界面，解码后才提交 current。关闭、换图、换账号由代次和实际会话所有权拒绝迟到成功／失败；解码完成不重新打开窗口，不覆盖较新的设置。没有自身已解码目标时隐藏残留旧源，不伪装成新文件；失败状态保留本次标题，禁用没有目录身份的定位、隐藏无队列的排序操作。没有增加重试按钮、自动重发或文件暂存操作。

本轮第一次完整源码检查 **1268/1268**；补齐测试脚本后第二轮为 **1267/1268**，失败来自回执流测试只睡 30 ms 就中止、却假定服务器已收到查询。现等待实际请求到达事件，保留原一秒读取期限和“一次查询、不得重放操作”断言，不扩大产品预算。另补入迟到 connect 的事件级红测 **0/2**，在读取已经中止／超时后禁止再写查询；定向 **14/14**。提交 `817260e` 已推送，回执通道仍只读，不新增操作取消或重试。最终本地实际 RHVideo 源码对照 **1270/1270，零失败／取消／跳过，36.402 秒**（`rhvideo-trash-and-receipts-final-node.tap`）。旧失败日志保留，不能用第一次通过掩盖它。

正常 Windows release **2 分 41 秒**，EXE SHA-256 **`01fd48f210f3f852574011dca2266c3da38ea10d7cc04c41207f03b89ca18c34`**，冻结 `rhvideo-pipe-full-g0GYXB`。新增实际暂存图片场景 **1/1，零失败／取消／跳过，27.996 秒**（`rhvideo-trash-preview-real-windows.tap`、`rhfiles-e2e-oZgGDo/trash-preview.json`）：真实行按钮在响应挂起时保持 loading／current=null，实际解码 800×500 后才就绪；损坏／超时各只请求一次，关闭／换图／账号切换在旧响应放行前已返回 stale，未抢走设置焦点，暂存条目未改变、无暂存写请求。加载／就绪／超时 PNG 已查看。相关整组及 Android 实际结果另记，不以单项通过替代。

正常 Android x86_64 release **26 秒**，APK SHA-256 **`f26593d7a93bbc8d584a46fffa726c58b4c60eb47aca1776b0a8354c655c0ce3`**（`rhvideo-modal-normal-android-DhMOvJ`），工作台 **F647**／JNI **1F90**；正常 BuildConfig 和实际安装字节已核对，未改变解码、音量或画质。测试入口新增显式 `--trash-preview` 场景选择，默认原图片／叠放预览场景不变，仍只允许自有模拟器与已准入正常 APK，不操作手机。

上述同一正常 **01FD** 的相关实际回归随后 **30/30，零失败／取消／跳过，263.170 秒**（`rhvideo-trash-preview-windows-related.tap`），包括原图片解码／标题、叠放预览标记／页外收藏、截图主界面、五万项、真实 RHVideo FastAPI／临时 SQLite／导出字节以及实际原生四路／1080p H.264／4K HEVC。与新增暂存场景合计 31 项，但不是完整 Windows 平台整轮。实际两个编码首帧约 **3645／4978 ms**，仍不能声称已达到原版同质量性能，也不能用本次 End 通过消除先前未定位的间歇失败。

正常 **F265** APK 的暂存场景实际 **通过**（`rhvideo-trash-preview-real-android.log`、`rhvideo-image-decode-android-Bc8v7j/receipt.json`），单次普通启动后仅附着 PID 23041，回执 **startupAccepted:false**。实际行按钮、隐藏旧源、真实 800×500 解码、损坏／超时各一次请求、关闭／替换／账号切换拒绝旧结果和设置焦点均通过，生成夹具 **23** 次请求、无暂存写入。`android-Fsu8Ys` 的就绪／超时真实截图已查看。它只证明这条附着图片场景，不是冷启动、持续播放、完整 Android 或 ARM 真机验收；未调整显示、音量、解码、画质或默认启动预算。

双端测试后冻结 **1205** 个源码、**4** 个工具、**426** 个运行库与 01FD／F265 候选哈希再次一致（`rhvideo-pipe-full-g0GYXB/image-decode-postcheck.json`）；三份原有用户脏 schema 的哈希仍保持不变。完整目标仍未完成：截图继续浏览的首次加载窗口还需核验，手写 UI 监听器错误回执、原生关闭证据、持续 A/V、同质量首帧和全平台整轮等缺口不因本节消失。没有发布正式新包或替换正式实例。

## 2026-10-31 叠放预览的标记、页外收藏与 UI 失败回执（继续验收中）

继续只读对照 WINSERVER 本地 RHVideo `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`，只使用生成图片、隔离配置和临时服务，不要求私有仓库密钥，不读取真实数据库／媒体或操作实体手机。

源码探测后在正常 **B6FD** EXE 的实际界面复现：底下放映 picture-0、上面单图 picture-7，点击上层单图的公开 UI 控件却把 **picture-0** 加入暂存标记。实际回归 **0/1，失败**（`rhvideo-preview-owner-old-real.tap`、`rhfiles-e2e-wlIiin/preview-owner.json`）；六项源码用例先 **2/6、四失败**，并非只有 API 名称的反例。标记在测试结束前清除，实际暂存请求为零，未移动文件。

提交 `e73d4e5` 改为以实际最上层预览为标记所有者，拒绝加载中／被设置遮盖的当前项目动作和被遮盖的旧放映工具条，保留当前放映及截图到源视频的标记。正常 **0963** 新包上的这项实际回归通过；同轮扩展的页外图片收藏失败，整轮为 **1/2**（`rhvideo-preview-owner-and-favorite-old-real.tap`），不能把单项通过当作整组通过。

进一步发现 `previewTarget` 仍优先取底下放映窗口，导致上层翻到第 80 张、卡片页中不存在的 picture-77 无法收藏。另有按钮／下拉的 `.catch(notice)` 将真实动作拒绝转为成功回执；对应源码用例分别先 **2/5、三失败**和 **1/3、两失败**。提交 `78e819a` 用可见预览解析收藏目标，并让共用按钮／下拉控件显示原错误、同时把原 Promise 的失败交给自动化；不是重发请求或新增失败重试按钮，也不表示其余所有手写事件监听器已经完成审计。

上述提交均已推送 GitHub／Gitee。本地实际 RHVideo 源码对照最终 **1256/1256，零失败／取消／跳过，35.858 秒**（`rhvideo-preview-target-controls-final-source-node.tap`）。正常 Windows release **2 分 43 秒**，EXE SHA-256 **`d73cf15d09aedd77f27e39e4fd24198c9189cdee9abe387174c9aed93d427d27`**，冻结 `rhvideo-pipe-full-UsrOaT`；实际相关回归 **30/30，零失败／取消／跳过，276.404 秒**（`rhvideo-preview-target-controls-real-windows.tap`）。上层单图标记、隐藏预览拒绝、实际页外图片收藏／取消，以及服务器 HTTP 503 拒绝时 UI 接口失败均通过；成功收藏只有显式两次写入，失败请求只有一次、没有重试，暂存请求为零。还含真实 RHVideo FastAPI／临时 SQLite、章节／导出实际字节、五万项、实际原生四路及 1080p H.264／4K HEVC；后两者首帧约 **4288／5314 ms**，不是同质量原版性能已达标的证明。

先前正常 Android **871F** 的媒体库初始化超时仍保留；后续正常 **F1AD** APK 的附着图片场景通过，98 次生成夹具请求，真实首次加载／超时 PNG 已查看，标题与计数已正确。它没有复现先前初始化失败，不能据此认定初始化问题已修复。当前正常 x86_64 APK **`14eb108872594368887ec33f4cfc6a9567a0a6b90882867bec96a7c3e22304c6`**（`rhvideo-modal-normal-android-0Hi6mS`）构建 **39 秒**，工作台 **E6D8**、JNI **1F90**，正常 BuildConfig、实际安装字节均核对；保留原默认解码／音量／画质。其附着运行增加了与 Windows 相同的叠放预览、页外收藏和明确服务器拒绝检查，实际结果另记；附着回执始终 `startupAccepted:false`，不代表冷启动或实体手机验收。

上述正常 **14EB** APK 的扩展附着场景实际 **通过**（`rhvideo-preview-target-controls-real-android.log`、`rhvideo-image-decode-android-gE62Np/receipt.json`），实际安装 PID 22605／`startupAccepted:false`：生成夹具 **105** 次请求，包含原图片解码／错误／取消／超时／标题检查；底下 picture-0 放映保持打开、上层 picture-99 不在卡片页内，真实上层按钮只标记 picture-99。页外收藏／取消仅有显式两次成功写入，HTTP 503 拒绝正确使 UI 接口失败且只有一次请求，清理后零标记、零暂存请求。真实设备 `android-knm6j8/preview-owner.png` 已查看。未改变模拟器、解码／音量／画质或启动预算，不把这条附着组件通过说成冷启动、持续播放、完整 Android 或 ARM 手机验收。

冻结 **1201** 个源码、**4** 个工具、**426** 个运行库与上述 D73C／14EB 候选在双端测试后再次哈希核对一致（`rhvideo-pipe-full-UsrOaT/image-decode-postcheck.json`）。原有三份用户脏 schema 的哈希保持不变。暂存图片预览的真实解码／关闭／账号边界、播放器关闭证据、持续 A/V 与首帧性能、完整平台整轮及先前间歇 End 交付仍未完成；本轮 End 用例通过不能消除未定位的旧失败。没有发布正式新包或替换正式实例。

## 2026-10-31 图片请求、显示与失败目标的标题／进度（继续验收中）

接着上一轮真实截图的标题残留继续核对原版：实际 RHVideo `renderMediaItem` 在图片 load 之前就写本次目标标题与计数。新增直接执行参考函数及本端生产函数的用例先 **1/6、五失败**（`rhvideo-image-caption-red.tap`），其中唯一通过的是原版行为对照，不把它算成本端通过。再用原正常 **AB49** EXE／冻结的旧前端实测：先看 picture-95、关闭，再打开被真实 HTTP 挂起的 picture-35，界面 opened=true／loading=true、current=null，却仍为 **095.webp／96**（`rhvideo-image-caption-old-real.log`、旧冻结 `rhfiles-e2e-O6TzJE/caption-negative.json`）。这是实际界面反例，不是仅检查接口名称。

现把标题／计数／替代文本绘制从设置图片 src 中分离。首次加载时没有已解码内容就显示本次请求目标；首次失败显示失败目标；已有上一张有效图片时，其标题与文件操作继续指向实际保留的图片，而状态提示明确写出失败文件与位置，不把上一张冒充失败目标。原 current／index 的解码后提交条件、错误返回、关闭和代次取消不变；没有图片 src 的元数据绘制也不会重复发起网络读取。进度条正在拖动时不由刷新改写它的值，沿用参考进度条对活动控件的保护。

公开 `image.state` 保留原字段，增补 `caption`、`requested`、`failed`、`status`，分别说明可见标题来源、正在请求的目标、失败目标和同一 UI 提示文本；返回的是有限原始值副本，不含图片能力 URL／路径／令牌，也不能通过修改返回对象修改会话。关闭／空状态不会伪造图片身份；没有实际图片时，定位／标记等相关控件禁用。原有图片／截图／收藏图片入口共用同一实现，收藏视频仍是原生播放。

补齐空状态、异常嵌套字段及实际 stepImage 的 pending／failed 身份检查后，本地实际 RHVideo 源码对照 Node **1236/1236，零失败／取消／跳过，43.990 秒**（`rhvideo-image-caption-full-node.tap`）；最初相关 34 项定向检查也全部通过。真实双端场景已增加界面标题、计数、alt、状态文本与公开读回逐项对应的断言；两端正常候选正在构建，实际运行结果另记，不以源码测试替代整包验收。

标题修复提交 `60c6e35` 已推送 GitHub／Gitee。新正常 Windows release 用时 **2 分 22 秒**，EXE SHA-256 **`b6fd9efb29f3019a9de7a66c748b44dd215accad60e75d7a6618bc3e480da13f`**，冻结 `rhvideo-pipe-full-xuoYyD`；相关实际界面／原生回归 **23/23，零失败／取消／跳过，225.899 秒**（`rhvideo-image-caption-real-windows.tap`）。图片用例 **31.852 秒**，逐项核对 DOM 标题、计数、alt、状态与公开 requested／failed／caption；已查看首次加载及超时 PNG，分别准确显示 **035／36** 与 **034／35**，不再残留上一张。其余用例含真实本地 RHVideo FastAPI／临时 SQLite、导出字节、五万项与实际原生四路／1080p／4K 输入。首帧仍约 **3785／5045 ms**，这些功能通过不表示同质量性能对照已经达标。

新正常 Android x86_64 APK SHA-256 **`871f0287019735096c6a57eb8bf3169bafd6b40ed95f4724250aba3115214010`**（`rhvideo-modal-normal-android-noVVNZ`），正常 BuildConfig 与实际安装字节已核对。显式一次普通启动后确认 PID 21870 的 MainActivity 前台，再附着执行；结果 **失败**：媒体库 `rhvideo.image.seek` API 在原 20 秒预算内未就绪（`rhvideo-image-caption-real-android.log`、`rhvideo-image-decode-android-jqA6p9/receipt.json`），夹具 **0 次请求**，图片场景尚未开始。它不是图片功能通过或冷启动通过；没有重试安装／重启 AVD／放宽预算，清理后只停止测试应用。原失败未保存完整初始化状态，现补入仅在失败后读取模块类型、实际静态脚本哈希、已选／可见 CDP 页面及截图的诊断，不重载或重新提交动作；这项采集尚未在新设备运行中验证，不能倒推本次根因。

加入三项只读诊断测试后，完整本地源码对照 **1239/1239，零失败／取消／跳过，31.192 秒**（`rhvideo-image-caption-final-source-node.tap`）。冻结的 **1194** 个源码、**4** 个工具、**426** 个运行库、上述 EXE／APK 事后哈希均匹配（`rhvideo-pipe-full-xuoYyD/image-decode-postcheck.json`）。源码函数探测另提示叠放预览的标记对象及暂存图片预览的解码／代次边界仍可能有缺口，尚未算作实际 UI 复现或修复。

完整目标仍包括首播与持续播放性能、原生关闭证据、全功能整轮及未解的真实按键交付；这次标题修复不是完成全部 RHVideo 前端的证明，也未发布正式包。仅使用生成媒体／临时数据库，不动真实数据或实体手机。

## 2026-10-31 图片预览的真实解码与错误状态（继续验收中）

对照当前本地 RHVideo 的普通图片／截图浏览流程，发现本端 `stepImage` 只等待查询及图片地址，随后就更新 index／current、保存位置并取消 loading。真正的图像下载和解码还在之后；原有 error 监听虽然能写一条文字，公开状态却仍可能像成功。新增直接执行实际生产函数的五项反例先 **0/5**（`rhvideo-image-decode-red.tap`），覆盖加载中不得提交、损坏图片、快速切换、关闭及实际 DOM 解码器。

现在共用客户端的真实 `full-image.decode()`，验证当前源、完成状态和非零尺寸后才提交元数据／位置；不创建另一张预加载图片、不 fetch／缓存整张图片到 JS、不更换源或重发失败请求。解码等待有限 20 秒，并非延长已有播放器预算。失败拒绝原动作，在 `image.state.error` 和预览状态提示中保留原因；旧解码完成或失败只能返回 stale，不能覆盖新图或清除其 loading。共享路径覆盖 Windows 和 Android 的图片、截图与收藏图片，收藏视频仍走原生播放器。

首次图片／截图会先打开可关闭的加载界面，而不是解码后才弹出；解码完成也不再次 openDialog 抢到较新的设置面板上面。新增这项反例先 **5/6、一失败**（`rhvideo-image-initial-decode-red.tap`），修复后完整本地 RHVideo 源码对照 **1225/1225，零失败／取消／跳过，37.191 秒**（`rhvideo-image-decode-final-full-node.tap`）。原“旧结果不能重开窗口”检查仍保留，现同时检查仅最初的加载界面打开一次；不是移除迟到意图保护。

真实界面测试使用一百张生成图片，原生 HTTP 延迟响应、带 SVG 前缀但内容损坏的响应、快速切图、加载中关闭，以及首次加载时打开设置；每次操作只提交一次，核对实际图片尺寸和 UI/API 状态。不能据此宣称已修复所有图片加载故障或达到原版性能。未使用真实媒体、数据库、实体手机或正式 Windows 实例。

正常 Windows **ABDE** 冻结 `rhvideo-pipe-full-vO21rM` 的首次实际场景 **0/1、失败，21.843 秒**（`rhvideo-image-decode-final-windows.tap`）。`rhfiles-e2e-Io8qL7/image-decode.json` 确认等待时 index 仍为 0、loading=true；放行后真实 800×500 图解码才到 index 99；损坏图片只请求一次、返回错误并保留 index 99；快速切图后保持 picture-95、零错误。已查看中间错误提示 PNG。失败在加载中关闭：移除 src 后浏览器旧 decode Promise 没有及时结束，原 15 秒观察失败，未执行首次加载／设置面板的后续检查。**不是通过**，也没有把等待改成 20 秒求绿。

后续补入明确的取消 Promise：关闭、下一次切换和连接／退出清理会立即返回旧操作 stale，清理仅属于自己那次加载的计时器和源；同一 URL 的新加载不受旧 finally 影响。失败／超时撤销当前源，不能在已报告失败后继续挂着下载或迟到显示；没有重试失败请求。新增永不完成的浏览器解码及同 URL 代次交错测试，并让原账号清理用例执行实际 cancelImageDecode、验证确实调用一次及清空引用。第一次完整检查 **1225/1226、一失败** 是原缓存隔离夹具没有载入这个新增函数；补齐真实上下文后最终 **1226/1226，零失败／取消／跳过，32.211 秒**（`rhvideo-image-cancel-final-full-node.tap`）。新正常候选正在构建，之后重验同一业务场景；另新增一项真实图像超时撤销源的检查，其独立 25 秒观察包含原 20 秒解码 watchdog，不改变原关闭用例的 15 秒门槛或产品 watchdog。

取消修复后的正常 Windows release **2 分 27 秒**、EXE **`ab492e8b8ce9fec01892a4c3013c6bd36483f1c7555cbbc47a94317606cba8b6`**，冻结 `rhvideo-pipe-full-v2u0bE`；正常 Android x86_64 release **33 秒**、APK **`6b96a5314f2f825ef32d259d31ac1e3705143b0a4fffb7ba27c6d996ae9a5252`**，冻结 `rhvideo-modal-normal-android-r0O9cv`，工作台 **3BBD**／JNI **1F90**，正常 BuildConfig 四项均核对。只有前端资源变更，未把诊断 APK 当主 APK、未改变解码／音量／画质；这些仍为 QA 候选，不是 ARM 真机包或正式发版。

新 **AB49** 的同一真实图片场景 **1/1，零失败／取消／跳过，27.685 秒**（`rhvideo-image-cancel-real-windows.tap`、`rhfiles-e2e-djYfyl/image-decode.json`）。这次加载中关闭实际及时完成，首次加载仍 opened=true／loading=true、current=null，完成后没有抢走设置焦点；真实超时返回错误并清空 src，损坏图仍只请求一次。随后同一 EXE 的截图／目标页／面板／综合用例 **22/22，零失败／取消／跳过，199.226 秒**（`rhvideo-image-cancel-windows-related.tap`），含真实本地 RHVideo FastAPI／临时 SQLite、源文件与导出字节、五万项、原生 MP4／四路和实际 1080p／4K 输入。首帧仍约 **4021／6795 ms**，不能说已经达到同质量原版性能，也不代替此前完整 Windows 整轮及 End 丢事件问题的核验。

Android 第一次默认启动方式在 `am start -W` **30 秒**超时，**失败**（`rhvideo-image-decode-android-s4jaZa/receipt.json`），当时夹具 **0** 次请求，图片场景根本没有开始；清理后已确认没有残留应用进程。没有重启 AVD、静音或重复安装。之后显式一次普通 start，请求返回 0，核对 PID **21443** 的 MainActivity 已在前台、安装字节确为 **6B96**，再用新增 `--attach` 模式只附着该现有前台实例，不安装、停止或再次启动。默认 session 的单次 `-W` 行为和时间上限不变；附着拒绝无进程／多个 PID／后台界面／改显示和权限，并在回执明确 **startupAccepted:false**，绝不覆盖冷启动失败。

该已启动普通 APK 的图片组件场景实际 **通过**（`rhvideo-image-decode-android-V6I3s8/receipt.json`）：与 Windows 同样的 loading／current／错误、旧解码拒绝、关闭、设置焦点和超时清空源检查均成立；98 次生成夹具请求，损坏图只有一次。`android-Lk32qV` 的真实设备 ready／initial／timeout PNG 已查看，确实是媒体库图片界面，而非后台 DOM。运行时一条只读查询也曾暂未返回，最终在清理后正常结束；不能仅凭该次观察等待推断 ADB 或应用故障的根因。附着运行通过不是启动速度、持续播放或整套 Android 功能通过。

查看真实 PNG 还确认了待修界面问题：首次请求 picture-35 时标题／计数仍为上一张 **095／96**，超时 picture-34 时仍残留 **035／36**；公开 current=null 正确，但界面没有准确描述待加载／失败目标。下一步须把请求目标、已解码目标和错误目标分别表达并通过公开状态读取，不能以本次通过掩盖这一点。手机横向工具条也仍显拥挤。新增附着策略检查后的当前完整本地源码对照 **1229/1229，零失败／取消／跳过，27.194 秒**（`rhvideo-image-final-source-node.tap`）；冻结的 **1192** 个源码、**4** 个工具、**426** 个运行库及 6B96 APK 事后哈希全部匹配（`rhvideo-pipe-full-v2u0bE/image-decode-postcheck.json`）。产品提交 **747f3fb／01c629d** 已推送 GitHub／Gitee；完整目标保持未完成，未发正式新包，用户原三份脏 schema、正式 PID 45696、真实数据和实体手机均未动。

## 2026-10-31 全可见缩略图与播放器关闭的分阶段证据（继续验收中）

继续只读对照 WINSERVER `D:\git\RHVideo` 的 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`，不要求私有仓库密钥，也不读取或修改真实数据库／媒体。以下均为隔离配置、生成的媒体与临时服务；没有操作实体手机或正式 Windows 实例。

为上次相邻 picture-93 的占位截图新增严格观察：按封面矩形与视口的实际交集检查每张可见封面，包括局部露出的封面；必须有源、连接在文档内、完成解码、有效尺寸、loaded 状态、透明度至少 .98、可见且没有占位元素。观察不调用 decode、不改 src、不滚动／聚焦／重载帮助它完成，20 秒预算也没有替换为等待某个单一目标通过。

同一正常 Android **5AD1** APK 的这条新断言通过：`rhvideo-presentation-reveal-android-jIrw4T/receipt.json` 第一次读取约 **256.912 ms** 时，picture-77／81／85／89／93／97 共六张可见封面均为 800×500、已加载且完全不透明，实际 PNG 已查看。没有复现持续缺图，不由此编造一项图片产品修复，也不能倒推上次截图当时的中间状态。

同一正常 Windows **7224** EXE 的相同严格用例 **1/1，零失败／取消／跳过，6.313 秒**（`rhvideo-all-visible-normal-windows.tap`）。`rhfiles-e2e-sC9AUG/media-reveal.json` 只读取一个最终页；四张可见封面在约 **221.207 ms** 内满足全部条件，PNG 已查看。热定位动作本次 **116.610 ms**、Android 本次 **2474.676 ms**，只是不同平台的单次样本，不当作基准、P50/P95 或性能已相同的证明。

另用正常 **5AD1** APK／测试 APK **8A79** 执行有限原生关闭诊断，结果为 **失败**：`rhvideo-android-player-close-latency-1793405215007-release` 达到整轮 **180000 ms** 预算，没有最终原生销毁回执。不能把整轮耗时写成关闭耗时：主机记录到 close 指令约在第 **166.424 秒**，Android 同一进程的表达式记录显示该次指令 **5540 ms** 返回，其中 WebView 回调等待合计 **4903 ms**。这些是测试传递／执行的观测，不是纯播放器释放耗时。

同一 run／PID 的六次有限线程采样保留：关闭后约 1.05 秒主线程在自有 surface 的输出分离等待，约 2.12 秒在 ExoPlayer.release 等待，后续进入绘制／窗口事务；解码线程还出现 AudioTrack.pause 与 MediaCodec.release，系统 PCM 写错误也存在。已用该正常 APK 自己的 R8 mapping 识别方法，但尚不足以认定唯一根因、确认销毁，或把此前持续播放停滞归咎于一个组件。没有降低音量／画质、换软解、重启模拟器或放大预算求绿。

测试保存此前仅在 finally 写最终文件，整轮终止时可能丢掉中间证据；现补为动作前、应答后保存明确未完成的回执，生命周期仅记录固定字段日志（UI 线程不写文件），主机在失败清理中也收集当前随机 run 的分阶段事件。局部事件绝不能替代严格 completed／destroyed／libraryResumed 的通过条件，也不会重放 close。新增及相关测试后的完整 Node 源码对照 **1219/1219，零失败／取消／跳过，33.559 秒**（`rhvideo-close-events-full-node.tap`）。新诊断测试包另行构建验证中，不能以源码测试代替已安装验证。

分阶段诊断测试包随后 **33 秒构建成功**，冻结 **4B1E**（Java 源 DC8C），在自有 API 36 AVD 安装并核对实际字节，正常主 APK 仍为 **5AD1**。该新模式仍 **失败**（`rhvideo-android-player-close-latency-1793405866661-release`）：准备占用整轮大部分时间，主机约第 **176.304 秒**才收到 close 阶段，最终达到原 **180000 ms** 上限。不能把它说成原生 close 自己超时 180 秒，也不以“再延长一点”改为通过。

本次成功保存了当前 run／PID 20930 的 **completed:false**、inputId **2**、实际 **3** 个渲染帧的动作前回执，独立事件收集也仅有 started、零拒绝／丢弃；没有 ack／stopped／destroyed／finished，不通过严格验证。日志同时保留旧 run，事件解析按新随机 nonce 排除，不能拿上次的应答或采样填补本次缺失。新 run 的有限线程采样约 2.33 秒在输出分离等待、4.78 秒在 finishActivity、7.31 秒时主线程进入消息循环；仍不能代替 Activity 销毁和应答证据。证明的是失败时能保留有效的未完成证据，而不是产品关闭已修复。没有重复运行未改场景、提高预算或重启环境；下一步需隔离准备成本与原生关闭本身。

本轮产品 JS／Kotlin 与正常发行候选未变；完整两端功能、同质量性能、持续播放和关闭等待仍未验收完成，不发正式新包。测试／文档提交 `2e3db82` 已推送 GitHub 与 Gitee。

## 2026-10-31 定位目标页的整库回传与重复绘制（继续验收中）

沿实际耗时继续检查，确认 `image.reveal → media.reveal` 先调用普通 category 加载第一页，再请求 `allKeys` 全队列定位，最后重新加载目标页。正常 47FB 候选的真实第 3 页图片场景 **0/1，一失败，4.085 秒**：观察真实 catalog 边界得到两次完整页读取（`rhfiles-e2e-evOln0/media-reveal.json`），没有伪造返回或替换网络。单次热场景定位动作耗时 **190.756 ms**，不是完整浏览耗时或统计基准。

现与普通分类共用 `loadCategory` 的重置／文件夹选项逻辑，由原 load 的 loading／inert／错误状态包住定位过程；先在 Worker 已有有序索引内以精确 key 定位，再只解析、绘制最后目标页。不向界面传完整顺序，也不先解析／绘制第一页。原标签规则找不到目标时的清理行为保留；不存在的目标报告错误、普通失败保留原预览。公开 UI/API 参数不变。

除账号、导航、清单版本外，定位也捕获原图片会话和递增 imageToken，覆盖校验账号、读取目标页、等待原生预览关闭及面板关闭的异步边界。校验中换账号的反例先 **13/14、一失败**；等待原生关闭期间新页面／图片的反例先 **14/15、一失败**，不能因后者最终又关闭而把状态视作原会话。修复后当前完整本地 RHVideo 源码对照 Node **1212/1212，零失败／取消／跳过，33.215 秒**（`rhvideo-reveal-final-full-node.tap`）。十万项实际索引函数用例只返回一个 locator 和一页；普通页面缓存、失效授权、失败／过时定位及共享分类行为均继续检查。

中间单元用例的夹具漏写 `state.view`，导致预期的等待钩子未触发；仅终止了已确认属于这次单元运行的 Node 子进程，未把该中间日志记为通过。补齐真实上下文并将测试等待钩子设为有限次数断言后继续，没有修改产品等待预算、重启模拟器或重复业务写入。

初版优化 EXE **7AB84** 的 Windows 22 项串行相关回归全部通过、零跳过，**209.981 秒**（`rhvideo-reveal-page-real-regression.tap`），含图库、账户隔离、真实原生同屏／1080p／4K、五万项及真实 RHVideo 独立临时 SQLite／导出。第三页定位只有一次 28 项最终页读取，目标封面实际 **800×500**、滚到可见区并高亮；`rhfiles-e2e-xN7m9Q/target-revealed.png` 已查看。该单次动作 **23.210 ms** 与上述旧候选的同热场景记录分开保留；不由两个样本承诺倍数提速、P95 或冷加载。原生首帧仍为秒级，不能归功于本次界面优化而称已达原版性能。

补齐两个异步边界后已重编最终候选：正常 Windows release **2 分 29 秒**，EXE **`72241c59a8bf5c23064133f12e4c07ae4a38982261adda62f60a914a7610ca64`**，冻结 `rhvideo-pipe-full-NsiDXq`；正常 Android x86_64 release **28 秒**，APK **`5ad1b7deffd965f1f62769be2cb9dbe1e19e639d8fab9f7b3237a5ee7d5c78b5`**，冻结 `rhvideo-modal-normal-android-I2bLsm`，工作台 B5585／JNI 1F90 与正常 BuildConfig 均验证。仅为 QA 候选，非 ARM 真机发行。最终 Windows 重验和 Android 第三页实测尚在进行，不以中间候选的通过替代最终结果；本节不发布新包或宣称完整目标完成。

最终 **7224** 冻结的上述 **22/22** 串行回归实际通过，零失败／取消／跳过，**190.731 秒**（`rhvideo-reveal-final-real-regression.tap`）。`rhfiles-e2e-qsjxR5/media-reveal.json` 仍仅一次 28 项最终页读取、offset **72**，目标 picture-97 的 **800×500** 封面位于可见区且实际高亮；PNG 已查看。该热场景动作单次 **19.793 ms**，不将中间与最终样本当成 P50/P95 或跨平台性能保证。真实 RHVideo 临时库／导出、账户边界及原生 1080p／4K 也在这轮通过；它仍不是此前完整 Windows 整轮的替代。

Android 安装命令先于业务测试 30 秒超时（`rhvideo-presentation-reveal-android-WlGvMo`），未记为通过或再次安装。随后只读核对实际 `/data/app/.../base.apk` SHA-256 已为上述 **5AD1**，版本仍是独立 QA 的 0.1.38／1038；以显式 `--installed --reveal` 执行第一次业务场景，实际 **通过**（`rhvideo-presentation-reveal-android-RCKFZL/receipt.json`）。同一目标、offset 72、一次 28 项最终页读取、关闭预览和实际可见 **800×500** 封面均通过；83 个夹具 HTTP 全部 200、完整且零传输错误／丢弃，`android-HIIEHx/off-page-target-revealed.png` 已查看。该动作宿主时间 **4822 ms**，仍慢，且不是此前 3 张图片测量的同工作量对照，不能声称 Android 整体提速或响应已达标。

截图中相邻 picture-93 此时仍是占位图，最后一个对应 HTTP 200 已完整结束；尚不清楚是暂未完成解码／绘制还是其他问题。保留此证据，下一轮须读实际可见卡片的完成／解码／透明度状态并观察是否自行完成。本用例只证明目标封面正确，不能把它扩充为全部可见封面质量通过，也不凭单张截图宣布另一个故障已定位。

最终冻结 **1184** 个源码、**4** 个工具、**426** 个运行库文件及 5AD1 APK 的事后哈希全部匹配（`rhvideo-reveal-final-postcheck.json`）。生产修改 **86e47ec** 已推送 GitHub／Gitee；用户原三份脏 schema、正式 PID 45696、RHVideo 正式数据及实体手机均未动。整体目标仍未完成：原生冷首播、持续播放、关闭长等待、全可见封面与其余完整整轮／同质量比较继续保留，不发布新包。

## 2026-10-31 隐藏视频的继续播放入口（继续验收中）

上轮只保护了迟到首帧、面板关闭及投影；实际 `viewer.toggle`、`visibilitychange` 和显式 `viewer.mediaControl resume` 仍可绕过面板归属。Windows 正常候选 **1558** 的真实原生场景新增两次意图切换后，实际 **0/1，一失败，10.814 秒**：设置仍打开、视频层仍隐藏，但真实控制应答后解码状态变为播放（`rhfiles-e2e-6ePv3r/presentation-modal.json`）。这是已复现的隐藏解码资源消耗，不是启动或持续播放慢的唯一根因。

现于统一 `presentationRequest` 入口约束 resume：文档隐藏或其他面板在最上层时，向同一已捕获输入发送 pause；不改写查看器的独立 running 意图，关闭面板后才按原意图恢复。显式旧输入仍由原生身份检查拒绝。测试直接执行生产的控制／toggle／visibilitychange 函数，不另造业务实现；两个新增反例先失败，修复后连同真实可见恢复、旧输入保护通过。带本地 RHVideo `3d6aaeb` 源码对照的完整 Node 为 **1196/1196，零失败／取消／跳过，38.469 秒**（`rhvideo-hidden-resume-full-reference-node.tap`）；未提供参考路径的先前一轮明确跳过 46 项，不能用它声称源码对照全通过。

Windows 正常 release 构建 **2 分 42 秒**，EXE **`47fb44614f407af233568d5070f99b57edb104fe60610461d24a4ff84952dfb3`**；冻结 `rhvideo-pipe-full-eomiCT` 的输入／面板／完整放映文件为 **7/7，零跳过，67.387 秒**。`rhfiles-e2e-LvICC9/presentation-modal.json` 两种原播放意图下均明确零可见自有视频平面；每次切换都等待真实原生应答，不能用旧暂停快照蒙混。关闭面板后保持原 inputId、alpha 255 和正确四色；保存并查看 `running-restored.png`。真实 Home/End 本次通过，不据此宣布此前间歇输入丢失已修复，也不是 Windows 全功能整轮通过。

Android 正常 x86_64 QA release 构建 **1 分 51 秒**，冻结 `rhvideo-modal-normal-android-NpAPQu/x64.apk`，SHA-256 **`6262867382a45d1502b2155f2676051c5bbfac0c5c75e1605c48b94e484ef9a2`**。所有声明 ABI 的 Rust 运行库检查通过，正常 BuildConfig，工作台 **4E548**、JNI **1F90** 均逐字节核对；这不是 ARM 真机发行包。实际安装到自有 API 36 AVD 后，同一场景 **通过**（`rhvideo-presentation-modal-android-neOdq4/receipt.json`），两种意图、四次隐藏期间切换、关闭后的同一输入和真实四色均通过；`android-8jGvgB/running-restored.png` 已查看。未操作实体手机或正式 Windows 实例。

另新增只读延迟诊断，把宿主往返与页面内执行时钟、前台与后台库页面分开，不改生产超时／音量／编解码／画质。第一份 F9D2 包的运行在首页就绪 **55037 ms** 后，库就绪原 20 秒诊断预算超时，**没有业务样本／HTTP 请求**（`rhvideo-android-ui-latency-RMiB1u/receipt.json`）；保留失败，不能由空样本推断性能已改善。新入口补有固定元数据失败快照及独立 180 秒总上限，不重载、重装或重放操作。两端整轮、原生冷首播、Android 连续播放和同质量参考性能仍未完成；本节不发布新版本。

6262 正常包的第二次只读诊断在原 **180 秒总预算内完成**，26 条操作／校准记录、32 个夹具 HTTP 应答完整且无错误／丢弃（`rhvideo-android-ui-latency-MuyvPs/receipt.json`）。首页／库就绪宿主时间为 **37851／11228 ms**。前台常量的宿主中位 **102 ms**、页面内 **0.2 ms**；后台库常量为 **276／0.4 ms**，三个样本不足以证明普遍更快或更慢。图片定位 **3375 ms** 宿主、**3224 ms** 页面内，图片切换 **1776／1525 ms**；这部分真实前端操作也慢，不能全部归为 Java 测试回调。

原生播放器关闭请求为 **9433／8827 ms**，随后一次纯状态读取为 **3682／0.2 ms**。后者支持交付／调度尾延迟确实存在，但没有定位它内部的唯一原因。关闭后的首个常量仍 `hidden=true`，其余恢复为 false；原记录误将该阶段命名为 `foreground-library-restored`，不能据此把三个样本都算作前台。保留原记录及实际布尔值，诊断脚本后续改用中性的 `after-player-close`，不改写记录或重跑直到好看。上述均非同设备原版配对性能验收，也不代表 Android 连续播放已修复。

Windows 冻结 **1181** 个源码、**4** 个工具、**426** 个运行库文件及 6262 APK 的事后哈希全部未变（`rhvideo-hidden-resume-postcheck.json`）。修复提交 **7b11e92** 已推送 GitHub／Gitee 工作分支，没有合并或发布，也没有变更正式实例和用户脏 schema 文件。

## 2026-10-31 迟到视频应答盖住设置面板（继续验收中）

实际冻结 9331 旧候选，在真实原生打开已完成／已有帧、但应答尚未送回前端时打开设置，再放回应答。旧逻辑随后把原生子窗口重新设为可见，盖住 WebView 设置面板。`rhvideo-pipe-full-8XXSyG/RHFiles/test-artifacts/rhfiles-e2e-Pq8Uga` 实际 **0/1、一失败，19.589 秒**；外部观察器读到 alpha **255**，保存的四色 BMP 已转换并查看。更早 UdyK7v 因测试误填不支持的 fade=0 而被参数校验拒绝，失败保留，不计为此反例；实际用例改为合法的 100 ms，未关闭产品动画或修改默认偏好。

前端现于实际投影调用时重新核对最上层面板；非查看器所属面板使原生层隐藏，迟到的首帧处理会暂停原生视频，但保留用户原来的播放意图。关闭面板的 bounds 应答回来后也重新检查最上层归属，不能恢复另一面板仍要求暂停的视频。执行实际生产函数的定向测试先 **11/14、三失败**，修复后 **14/14**（`rhvideo-modal-native-functions-{red,green}.tap`），没有用重写的测试函数代替实现。

Windows release 构建 **2 分 39 秒**，EXE **`155895bc7e284d132a221e0650925928932b547db102bfd05fc84de3380b87d5`**。独立冻结 pIDIbS 的输入／面板／完整放映文件共 **7/7、零跳过，66.214 秒**：暂停与运行两种意图下均观测到设置打开时不存在可见的自有原生平面；关闭设置后，实际同一 inputId 仍能显示四个正确角标并保持原来的暂停／继续状态（`rhfiles-e2e-y58gDR/presentation-modal.json`）。此前 End 间歇失事件本次也未复现，但这不是 121 项完整整轮或输入交付根因已修复。

Android 第一份正常配置 QA 包 **5B66** 在自有 API 36 实际通过同一面板场景，26 条夹具请求；`rhvideo-presentation-modal-android-lGkF7M/receipt.json` 和 `android-kADz6w/{running-settings,running-restored}.png` 均已检查。两次同一输入前后恢复的颜色为 **[255,0,0]／[0,254,1]／[1,0,255]／[255,255,1]**。但随后整轮准入发现此 QA 打包命令漏传 ABI 过滤属性，混入未配齐 Rust JNI 的其他架构，已在新整轮的设备访问之前拒绝；**此包不是可发布的完整多架构包**，该 x86_64 场景通过不能支持其他架构。原包／失败日志保留，正在以 `abiList=archList=targetList=x86_64` 重建，冻结工具也补全全部架构／JNI 准入，不放宽原检查。没有安装到实体手机或发布。

同时仅对独立测试探针补上首页／媒体库启动就绪的已有评估计时，固定协议 **3** 区分读取检查与业务动作交付，不把首次 readiness read 当成业务 dispatch；仍为原先的 15 秒单次回调、45 秒就绪、500 ms 间隔、512 条记录上限，不增加 evaluate、动作或准备点击。新日志只含固定阶段及数字，不记录表达式、结果、地址或凭据。主包正常编译 **1 分 15 秒**，原 JNI **1F90** 字节验证不变；探针编译 **3 分 18 秒**，Java 手维护／实际生成输入同为 **A700C837…824868**，独立 APK **`6b3456e011b35e8f9e7b7a72a48dcc8603620dac01dfcba5865176b73291c06b`**，DEX 验证包含新固定字段。正常包与探针分开保存，不用探针配置包代替正常包。计时检查 **9/9**，全部本地源码对照 Node **1185/1185、零跳过，31.594 秒**；尚待修正 ABI 的实包启动计时，不能提前称已修好启动超时。

本轮只覆盖以上明确的异步边界，不声称所有同一输入的原生请求重排或所有后台／前台恢复条件都已由此解决。原生冷首播、Android 连续播放、完整流程与同质量参考性能仍未完成。全程仍只用生成媒体／临时库，没有修改正式实例、重启 AVD／服务、操作手机或发布候选。

随后补严原生观察器：明确区分 **零个**可见自有平面与**多个**可见平面，不能用两者原先共用的错误消息证明隐藏。新工具 EXE **`522cc5ae5ceaf3ebc6585ab6607ffadede88189f4266494703d265704047bf26`**／C++ **`418c4eb5348c2589e5c5028ae1583d406150e1d1c8e00c1f7658f98630ccaf9d`**，相关定向 **15/15**。独立冻结 dUwfci 的同一实际面板场景 **1/1、零跳过，21.959 秒**（`rhfiles-e2e-pon5It/presentation-modal.json`），两种状态均明确零可见平面，恢复时 alpha 255／同一输入及四色仍正确；原先较弱观察版本与记录不覆盖或删除。

ABI 修正构建成功 **3 分 22 秒**；新冻结 `rhvideo-modal-normal-android-FXiB3X/x64.apk` SHA-256 **`f9d239e91411c4c3ca1e7a9fe5d3890665c3601af30d2f85c514558a2e2cdd08`**，完整 APK 只声明 x86_64，正常 BuildConfig、4B58 工作台资源和 1F90 JNI 均逐字节准入通过。应用架构检查提为两种 Android 验收入口共用的纯逻辑，并实测拒绝“x86_64 完整却混有缺少 Rust 的 armeabi-v7a”及纯第三方 JNI 包，未取消原检查。启动探针仍为上述 **6B34**，未混用由探针标志构建的主包。新包实际面板复验及启动计时尚在进行，不提前记为通过。

最终当前源码的完整本地对照 Node **1189/1189、零失败／取消／跳过，30.690 秒**（`rhvideo-modal-bootstrap-zero-final-node.tap`），包括三个架构准入反例和零／多平面的区分。上述已通过项目均不是 Android 完整流程、全部平台／架构或同质量性能的完成证明。

正确架构 **F9D2** 包随后实际通过同一面板场景（`rhvideo-presentation-modal-android-akB1ut/receipt.json`），26 个夹具请求，安装字节再次核对。暂停／运行两种状态下，设置画面均无四个原生角标；关闭设置后仍为原 inputId 1／2，并恢复同样的四色及原播放意图。`android-fYxuup/running-restored.png` 已查看。它与先前不完整多 ABI 包的结果分别保留，不互相替代。

F9D2 正常包／6B34 探针的原六分钟整轮这次 **失败**（`rhvideo-android-1793400071718-release`）：到 **360594 ms** 交付最后一条 `rhvideo.preferences.set`，没有观察到它完成或后续同屏场景通过。已输出 172 条 STEP 行，其中结构化命令时间线为 168 条，不能将它们冒称完整流程完成。没有增加预算、重复提交操作、清数据或重启。混合视频暂停画面已生成并拉回，但不替代未完成项目。

新协议 3 实际读到：首页就绪 **15174 ms／7 次读取**，主线程排队累计 **1180 ms**、WebView 评估回调累计 **10090 ms**、首次检查 **182 ms**；媒体库就绪 **10605 ms／12 次读取**，对应 **1011／3768／429 ms**。两阶段这次没有丢失回调；仍然很慢，也没有复现／解释前一次单次 15 秒无回调。这里是就绪读取与交付，不是原生 API 执行、解码耗时或同质量性能通过。

结束日志保留序号 28–174 的 147 条，明确缺失前 27 条。在运行中的一次只读标签日志快照保留序号 1–60；对重叠的 33 条逐字段一致校验后，得到 **1–174 连续的 174 条已完成记录**（`merged-timing-analysis.json`），没有虚构尚未记录完成的最后一个动作。累计 elapsed **295108 ms**，其中主线程排队 **46844 ms**、WebView 回调 **217973 ms**、轮询休眠 **24363 ms**，`callbackMissing=0`；它们不代表找到回调内部的唯一根因。最慢的 `image.reveal` **20180 ms**、`viewer.step` **11300 ms**，应继续区分渲染器／交付与实际业务耗时。271 个夹具 HTTP 应答全部完整、零传输错误／丢弃，不据此断言所有外部网络或所有其他条件都没有问题。

两份 Windows 冻结的源码／工具／运行库分别 **1177+4+426** 与 **1179+4+426** 个输入再次逐项匹配，F9D2／6B34 文件哈希亦未变（`rhvideo-modal-postcheck.json`）。本轮修复已提交到工作分支，但未发布候选；整体目标继续保持未完成。

## 2026-10-31 放映输入身份与迟到应答（继续验收中）

旧查看器的 `presentation.open` 应答迟到后，原逻辑会执行全局关闭，误关后来已解码的新视频；同一查看器快速 Next 也缺少打开尝试的身份检查。现在前端保存实际原生 `inputId`，对查看器、切换和打开尝试分别核对；控制、投影和关闭携带 `expectedInput`。Windows 在真正执行排队的 Win32 边界操作时再次核对输入和窗口，过期关闭不推进当前打开的 epoch。Android 的输入标识跨 Activity 实例唯一，旧播放器首帧、尺寸和错误回调不能覆盖替代播放器；无效播放参数先验证，不先关掉当前输入。该修复不等于所有尚未进入原生层的旧 open 意图都已有跨端预留／排序协议。

新增生产函数测试实际 **0/6 通过**后修复为 **6/6**，原暂停透明度的 **5** 项保留；完整本地源码对照 Node **1178/1178、零跳过，31.492 秒**（`rhvideo-presentation-input-scenario-node.tap`）。Rust 输入定向 **8/8**，Android 完整 JVM **485/485、73 份 XML、零失败／跳过**。Windows release 构建 **4 分 18 秒**，正常 Android release **4 分 38 秒**；均非发布版本。

真实 Windows 反例冻结 `rhvideo-presentation-input-old-3JUiBq` 的完整旧生产源码／F52A EXE，只覆盖测试文件和外部观察器。旧包在 **16.585 秒**失败：输入 2 已有 **5** 帧，释放输入 1 的真实迟到应答后，输入 2 变为关闭（`rhfiles-e2e-KbhvHf/presentation-input.json`）。更早 H3aByU 的挂接启动失败也保留，不计为此反例；测试先等初始页面就绪、启用 Page 域再挂接重载，未替换原生结果或重放动作。

新冻结 `rhvideo-pipe-full-eBo0MT`／EXE **`93314f46b725894aca71b7b802f3c835b75fc41a4105913d34b6625b28e6f98a`** 实际 **1/1、零跳过，23.019 秒**。关闭后重开与同一查看器竞态均通过；实际旧 state／volume／隐藏缩小 bounds／close 全部拒绝，新输入身份、音量及查看器位置保持。每一阶段的实际硬件原生窗口 alpha **255**，四色均为 **[239,5,0]／[13,246,0]／[3,4,255]／[252,251,0]**；最后 BMP 转 PNG 已查看，不用帧计数代替可见画面。记录位于 `rhfiles-e2e-7g2CUk`。这不是完整 Windows 整轮或连续播放性能通过。

Android 正常候选 **`a66220dde70fb5f403fb951455cfb08824b3f0808966e768888b6e26707e45b4`** 保持 LOCAL_CLOCK=false、AUDIO_START_MS=0、CODEC_MODE=default、SURFACE_MODE=compositor，在自有 API 36 AVD 的同一真实输入／应答／画面场景 **通过**（`rhvideo-presentation-input-android-jGIaKV/receipt.json`）。两种竞态均保持输入 2／4 和音量不变，8 项旧输入操作均拒绝；原生合成截图在固定四点前后均为 **[255,0,0]／[0,254,1]／[1,0,255]／[255,255,1]**，`android-GFy4zN/same-viewer-after-stale-operations.png` 已查看；30 条夹具请求。第一次安装命令 30 秒超时的失败保留于 `rhvideo-presentation-input-android-9pzSz4`；随后只读 SHA-256 确认安装已完成，以显式 `--installed` 验证同一字节，不盲目重装或改变等待预算。正常 APK 没有重新构建或用探针包替代，没有操作实体手机、正式 PID 45696 或真实媒体数据。完整 Windows 串行回归已在该 eBo0MT 冻结副本开始，结果仍待返回，不预先计为通过。

持续播放问题仍开放：上轮 **8761** 正常包改用 emulator-host 直接夹具链路后仍失败（`rhvideo-pipe-full-W3rt1h/RHFiles/test-artifacts/rhvideo-android-grid-1793393280828-release`）：实际 **6494 ms** 内三路位置仅推进 **498／466／630 ms**、新增 **3／2／3** 帧；失败后恢复 WebView 计时器的控制观察也未恢复实时推进。因此不能将阻塞归因于 adb-reverse，也不以静音、降低画质、重启 AVD 或延长门禁冒充修复。

随后该 eBo0MT 冻结的完整 Windows 串行回归实际 **119/120、一失败、零取消／跳过，23 分 33.275 秒**（`rhvideo-windows-URHYPY/receipt.json`），不是全绿。唯一失败为第 85 项收藏幻灯片真实 Windows End 输入：`rhfiles-e2e-wiKgrK/slideshow-end-failure.json` 中 Windows 接受 2 个虚拟键事件，但媒体库及主窗口均没有 DOM keydown／keyup，放映保持 index 0；原 15 秒等待超时。输入前后媒体库的 foreground／active／inputFocus 为真、DOM hasFocus 为真，Tauri isFocused 为假；后一个现象在后续通过样本也存在，不能直接认定它就是原因。未改成 DOM 事件、激活窗口、准备点击、延长截止时间或循环直到通过。此处更正运行中局部进度不能代表总结果的判断；此前原失败日志保持。

这轮旧兼容回执场景通过，仍不能证明之前间歇交付延迟根因已修复。普通硬件输出的 1080p H.264／4K HEVC 均实际解码正确尺寸，动作到可查询首帧 **4896／7091 ms**、native open 到统计帧 **4321／6501 ms**；统计更新时间仍不等于独立的首次可见像素计时，更不等于已达参考性能。结束后额外逐项重算 **1175** 个源码、**4** 个工具、**426** 个运行库文件、**14** 个参考文件，共 **1619** 个输入完全匹配（`rhvideo-input-owner-snapshot-postcheck.json`）。因此不能把失败归因于测试期间混入另一份源码／EXE。

增加仅自有兄弟窗口的焦点目标固定分类／可见／启用观察，不激活窗口、不增加按键、不记录 HWND／标题／地址；嵌入的跨进程子窗口只标为 `embedded-process-child`，不读取其类名。外部工具最终编译 SHA-256 **`658c7c70676f21f28ba83e7ded400057c42cdf2b5d129a044a4b414e98d7d819`**、C++ **`61053590f0885f6a2a13e73dfe5ad7f9a187eb170c2230dffe024e61c4cd77a3`**，定向工具检查 **11/11**；当前完整本地对照 Node **1179/1179、零跳过，31.114 秒**（`rhvideo-focus-kind-final-node.tap`）。此前未区分嵌入进程的观察版本在独立 5T2Qbi 副本同一真实按键用例 **1/1、7.295 秒**，仍只是未复现，不能覆盖完整回归的失败；输入焦点／事件交付继续调查。

最终观察器的独立 MrKJe3 副本同一按键用例又实际 **1/1、零跳过，8.064 秒**（`rhfiles-e2e-CaU2SN/slideshow-keyboard.json`），固定分类确认焦点位于可见、启用的嵌入进程子窗口；两种真实编码的 down/up 及主窗口零泄漏均通过。没有改变应用、准备点击或强行聚焦。它仍不解释此前一次无事件，不能将两份独立未复现当成完整整轮也通过。

Android 同一 A662／407C 安装字节核对后，完整基础流程本次 **失败**（`rhvideo-android-1793397585267-release`）：首页 `ready(main,"api")` 阶段的一次 JavaScript evaluation 在原 15 秒内没有回调，尚无任何 STEP 或夹具 HTTP 请求；缺少该阶段逐次计时，不能断言这是第一次 evaluation。主线程快照在 `MessageQueue.nativePollOnce`，不能直接称作 ExoPlayer 或网络阻塞；日志有首页跳帧／GC 以及先前系统搜索进程 ANR，但均非唯一根因证明。没有重新安装、清数据、重启模拟器／服务或增加等待。它不否定上面的独立真实放映输入／像素场景通过，也不能由该独立通过宣称完整 APK 流程通过。

另只读采集同一 API 36 的三段五秒 `/proc/uptime` 对照，guest 分别推进 **5360／5250／5570 ms**，均处在宿主前后读取的不确定区间内（`rhvideo-api36-guest-clock.json`），未观察到整台模拟器持续只有约十分之一速度；采样不在播放中，不据此排除音频时钟或证明卡顿根因已找到。正式 Windows 实例、真实媒体与实体手机仍未改动，未发布候选包，完整目标保持未完成。

## 2026-10-31 暂停视频透明与 Android 观察协议（继续验收中）

直接对照本地 RHVideo `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`，只使用生成媒体／临时数据库，不需要私有仓库部署密钥，也不读取真实媒体数据。新增测试执行实际 `slide()`：暂停时切到视频，旧实现将窗口透明度设为零，却没有运行淡入时钟；恢复时还会使已显示帧重新变暗。现仅让运行中的过渡执行淡入，暂停帧保持不透明；首帧／边界应答返回时重新核对查看器和切换身份，旧视图不再继续投影或暂停替代视图。这是具体 JavaScript 异步边界保护，不等于原生层所有排队命令已有身份租约。

新增生产函数测试先实际 **1/5 通过、4 失败**，修改后 **5/5**，分别保留 `rhvideo-paused-native-opacity-stale-red.log`／`rhvideo-paused-native-opacity-green.log`。当前完整本地源码对照 Node **1167/1167、零跳过，36.268 秒**（`rhvideo-paused-native-opacity-full-node-diagnostic.tap`）。前一次聚合运行有一个 `browser-loopback.test.mjs` 整文件退出失败，其单文件随后 **4/4**；本次 TAP 完整重跑通过不代表已找到那个工作进程退出的根因，原失败日志保留。

修复前 Android 正常主包 **094ed005…39f**／计时探针 **d10ab764…939a** 在健康的自有 API 36 模拟器实际运行失败于混合放映测试：先加入图片、再加入视频的最新优先队列是视频→图片，测试却在 Next 到图片后断言有原生视频。新增真实 HTTP 夹具＋生产 Catalog 用例证明该顺序；探针改为核对目标、从图片回到视频、保留原生首帧／Activity／关闭释放检查，并保存暂停视频截图，不重排产品队列。原失败和 **159** 条实际协议 1 计时保留于 `rhvideo-android-1793388468294-release`；计时包含 WebView 回调／主线程／轮询等待，不能称作原生 API 执行耗时。

探针协议 2 将独立 reset／dispatch 合为一次原生 `evaluateJavascript`，仍用 Java 独立 UUID 和页面写入检查拒绝迟到应答；不使用 eval／Function 绕过 CSP，不增加业务动作，不延长原 15 秒 eval／45 秒表达式／360 秒整轮预算。修复后的 Windows release 构建成功 **3 分 32 秒**，冻结 EXE **`c70017794f0cf2a306dd910855dff467f40d170f2cedb0f9009fb5b8ee7d8b69`**；Android 正常主包 **`d9fb978c8104c49c84424d1d3a9da976c40fa193b71e7910144c145d60086b8c`**、独立探针 **`407cd2e61074280a21090dae46111a3b94b173af422495e89a27c7cea1e93b2c`** 已冻结。正常主包构建时 LOCAL_CLOCK=false、AUDIO_START_MS=0、CODEC_MODE=default、SURFACE_MODE=compositor；独立探针构建成功 **4 分 10 秒**。新实包仍需实际整轮和画面检查，不能沿用旧包结论。

Windows 外部观察器另补固定媒体库范围的原生窗口 alpha 与像素检查，仍只允许同一夹具启动的兄弟 RHFiles 进程和精确窗口标题／表面类，不抓桌面、不增加正式诊断接口，不用“已解码”替代“可见”。原独立播放器范围不变。新工具编译成功，SHA-256 **`275f749b5defff1a61ddc544bcc9f495f66e5ef3eb2b064a5f538985a01b4699`**，对应 C++ **`deea84bfe7e0c76d8387c0d82e950cb45edceb18a35ac9ba5bb6a0f7d086682d`**。新增范围／alpha／拒绝应答清理检查 **9/9**，共享 Node **1168/1168、零跳过，30.308 秒**（`rhvideo-presentation-observer-full-node.tap`）。

冻结 `rhvideo-pipe-full-CI8EHM` 的上述 C700 实包放映文件 **5/5、零跳过，34.531 秒**，实际 `native-hardware-auto`，原生暂停视频 alpha **255**，四色采样 **[239,5,0]／[13,246,0]／[3,4,255]／[252,251,0]**（`rhfiles-e2e-7aNVfC/paused-native-video.{bmp,json}`）。转换截图已查看。另四项包括图片暂停像素、真实 Home/End 两种编码、进度和收藏源语义。前一份 FTW3Hy 的新用例曾漏切图片分类就对图片发起收藏，被当前列表身份保护正确拒绝，**4/5** 的原失败保留；现通过真实分类／收藏动作建立队列，不绕过保护或预先篡改收藏池。这不是 119 项完整 Windows 整轮，也没有解决下节旧兼容回执的间歇交付问题。

Android 上述 D9FB／407C 实包在自有 API 36 的整条流程仍 **失败**（`rhvideo-android-1793390381654-release`）：已通过混合放映／原生首帧／图片切换释放，`rhvideo-mixed-video-paused-qa.png` 已查看，暂停合成视频实际可见；随后四路网格的一路 **ERROR_CODE_TIMEOUT**、0 个输出帧，其他格也未正常持续推进。不能以 `rendered:true` 或已提交一帧冒称成功。**289** 个夹具 HTTP 响应均完整、零传输错误／未完成；日志另有 Codec2 bufferpool 获取失败，但尚不能据此确定唯一根因。协议 2 的 **139** 条可读计时是序号 **58–196**，前 57 条已不在末尾日志缓冲中，不视为完整计时记录。整轮在约 292 秒走到最后状态读，非六分钟总预算超时，不延长播放器等待／降低音画条件。后续需补充播放器具体超时操作的有限、无地址／凭据的诊断。

未发新包、未替换正式实例、未操作实体手机；Android 四路／生命周期、旧兼容回执交付失败及全目标性能仍开放。

后续独立反例 `rhvideo-pipe-full-50j5bu` 保留旧 **F52A** EXE，并仅让新测试的工作台源码门禁匹配旧冻结副本的 **D7E0** 字节（来源／SHA-256 明列于 `admission.json`，没有修改旧资源或跳过资源门禁）。同一新测试在旧实包确实 **0/1、一失败，14.850 秒**：已有实际原生帧，外部 Win32 观察得到 alpha **0**，断言要求 **255**（`rhvideo-paused-native-old-window-red.log`）。因此上面新实包的 alpha／像素通过有真实旧版本反例，不只依据函数测试或帧计数。

Android 继续补充现有可选输入诊断：保留最近一次实际 `PlaybackException` 的错误码、最多五层原因类型，以及具体 `ExoTimeoutException.timeoutOperation`；不保留 Throwable、消息、堆栈、地址／头或事件队列，不更改播放器操作、超时或重放行为。真实 Media3 类的 JVM／Robolectric 检查 **9/9、零失败／跳过**（`rhvideo-playback-timeout-diagnostics-jvm.log`，Gradle **2 分 44 秒**），包括禁用时不采时钟、具体超时操作、深／环状原因链、有界大小和敏感消息不落盘。这只是诊断可用，不是四路播放已修复。

测试计时读取另显式返回 `missingSequences`，防止末尾日志截断后仍被误读为完整覆盖。新增断口测试 **7/7**，完整 Node **1169/1169、零跳过，39.874 秒**（`rhvideo-timeout-and-timing-coverage-full-node.tap`；与编译并行，不是性能样本）。对原 Android 失败日志重新只读解析为 139 条、序号 58–196、**57** 条缺失，不覆盖原证据；新的正常 APK 仍在构建，需实际捕获超时操作再定位。

随后正常 x86_64 APK 构建成功 **4 分 13 秒**，冻结 `rhvideo-timeout-diagnostics-android-bb78d8ca1a4744549980ec455a59c0a5/x64.apk`，SHA-256 **`876126f7f695bfda87e07e2a50d5f69ed4c06dfdb2a6ccb16c2261bd6bff643f`**，继续使用原 **407C** 探针。正常 BuildConfig 保持上述四个默认值；Kotlin 诊断源码／生成编译输入同为 **`e1334edae9d491dd9bf6ae1afb99424836d8dd6111aaa7c97432049f39fbd29e`**，JNI 仍是 **1F90**，逐字节验证未变。此 QA 包没有发布为另一份同版本文件。

同一 API 36 的基础整轮这次 **通过**（`rhvideo-android-1793391765084-release`）：191 个交付步骤，最后约 **270.781 秒**，291 个完整 HTTP 应答、零传输错误；列表、原生单视频／混合暂停视频及四路截图已查看。131 条可读计时为序号 66–196，明确缺失 65 条。此次只有诊断差异，不能因一次通过就声称旧四路超时或播放性能已修复。

同一包紧接着运行更严格的三路持续播放 **失败**（`rhvideo-android-grid-1793392343265-release`）：第一次无 WebView 计时器／不读取状态的实际 **7075 ms**，三路只推进 **427／623／374 ms**，各新增 **2／1／2** 帧；恢复计时器的失败后控制观察 **11068 ms**，位置变化 **0／0／448 ms**，没有重新播放或把后者当成第二次通过机会。三路 `lastPlaybackError` 均为空，并未复现 timeout 异常；原生状态显示播放中也不能代表流畅。实时抓到 AudioTrack 反复 underrun／spurious timestamp，两个播放线程在 `MediaCodec.native_queueInputBuffer`、一个在 `releaseOutputBuffer`，同刻 ranchu 音频 HAL 有 `pcm_writei ... I/O error`。这是进一步区分系统音频／解码和本端链路的线索，不是唯一根因的结论；未重启 AVD／音频服务、静音音轨或放宽五秒时间／60 帧门禁。

Windows 继续增加可选、最多 100 ms 的固定媒体库 `WM_NULL` 只读响应探测，仅允许同一夹具启动的兄弟进程，不激活窗口、不发送业务动作。原生采样 Unix 毫秒与单调耗时、宿主排队／完成时刻分开记录，不能用工具启动前时刻冒充实际采样。整轮普通验收显式拒绝此诊断开关。最终编译工具 **`e7b855a194acdff69b30eae46858d619eaf96af89f3d1ec630887f483c6e87b9`**／C++ **`821c2fe84e9e3e1edf637bcd6819cd630d2b85015ddcdb6b00d65bc1d5987396`**，最终定向检查 **17/17**；增加时间锚点前共享 Node **1170/1170、零跳过，35.254 秒**。独立冻结 `rhvideo-pipe-full-W3rt1h` 的旧回执场景本次 **1/1**：真实关闭 829 ms，CLI 约 1.35 秒返回；五次探测的实际采样均在宿主排队／完成区间内，应答 0–31 ms（`rhfiles-e2e-pYeCvr/receipt-held-status-timing.json`）。本次未复现旧 4.2 秒交付间隔，不能用这次通过或点采样认定间歇延迟已修复，也不能证明整个间隔的 UI 主线程始终可响应。

随后在同一 API 36／同一已验证 **8761** APK 的独立 WebView 中实际执行本地 RHVideo 原始前端，没有将它接作产品播放后端。原版三路 AAC 控制也 **失败**：实际 **5398 ms** 内位置分别推进 **1339／1494／1054 ms**，仅新增 **3／1／2** 个回调帧（`rhvideo-android-reference-clock-oSJNAX/receipt.json`，截图 `android-1ohgdN/reference-grid-clock.png` 已查看）。音轨未静音、音量 0.2、倍速 1；竖屏媒体 SHA-256 **98C8699E…c24bc** 与本端相应源一致，25 个 HTTP 应答零错误／零写入，14 个参考文件前后未变。

此独立控制只能说明原版在当前环境也无法实时播放，不能用来宣称本端没有额外卡顿或已经性能等价：本端这轮为 adb-reverse、混合横竖输入／参考为 emulator-host、三路竖屏，布局亦不同，不是逐格同工作负载的成对吞吐样本。音频 HAL I/O 错误、时间戳与原生线程证据仍是进一步排查线索，没有唯一内部根因或完成结论。未修改全机音频／网络设置，没有重启任何 AVD／服务、替换正式实例或发布候选包。

最终时间锚点源码的完整本地对照 Node 再次 **1170/1170、零失败／取消／跳过，33.058 秒**（`rhvideo-owned-native-clock-final-node.tap`）。不将它当作上述持续播放或旧交付问题已经通过；完整功能／性能目标保持未完成。

## 2026-10-31 最新发行构建整轮 117/118 与旧回执交付（仍未通过）

账户清理修复的 Windows release 构建成功 **2 分 33 秒**。冻结 `f71027b`／EXE **`f52a858ac4c834fd44ef075ee62acb3431f2903434a3c543067ce966cc5ef31a`** 的完整串行场景已终止：**117/118、一失败、零取消／跳过，21 分 53.697 秒**（`rhvideo-pipe-full-8QwC2B/RHFiles/test-artifacts/rhvideo-windows-WgGO9A/receipt.json`）。回执确认原参考／EXE／外部工具未变，结束后额外逐项重算 **1165** 个源码、**4** 个工具、**426** 个运行文件及 **14** 个参考模块，共 **1609** 个输入全部匹配。源切换实际像素、暂停旋转像素、幻灯片两种真实按键及其他 114 项通过，不能覆盖第 40 项兼容回执失败。正式 PID 45696、手机及 AVD 未重启或重置，未发布新包。

第 40 项显式禁用生产者的新独立回执发现，保留真实关闭／账本，以“主窗口先回 running 后丢失 wait、媒体库暂扣已开始的 status”验证旧链路。新增只读阶段记录后，同一 EXE 先独立通过一次，随后三个新配置／新媒体实例的有界试验 **2/3、一失败**，没有循环到成功为止（`rhvideo-legacy-receipt-delivery-timing.log`、`rhvideo-legacy-receipt-phases-{1,2,3}.log`）。失败 `rhfiles-e2e-u1qTj5/receipt-held-status-timing.json` 的真实关闭 **1104 ms** 已完成，随后界面读应答又迟了 **4217 ms**；测试直到 CLI 原五秒截止后才释放暂扣响应。成功样本也有约 2.2 秒交付间隔。此证据把失败范围收窄到完成后交付，不证明原关闭未执行，也不证明已经找到唯一内部根因；没有重放、延长五秒或减少真实播放器。

微软文档明确 [WebView2 回调必须使用 UI 线程，不能通过阻塞消息泵等待异步结果](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/threading-model)，并说明 [Controller.Close 是同步清理](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2controller?view=webview2-winrt-1.0.1462.37)。这只是后续核对窗口销毁／应答排队的约束与线索，尚无这次延迟期间的原生堆栈，不能据此直接宣称 WebView2 是唯一原因或修改底层依赖。新独立进程回执场景实际通过，但旧链路与整体性能仍需处理。

干净的 Windows CI 增加在 E2E 前编译外部观察器，避免依赖本机残留 EXE；新增脚本检查顺序与 pwsh。Android 新的可选测试探针计时只记录固定命令名及 Android `elapsedRealtime` 的 UI 排队／WebView 回调／轮询等待等数字，上限 512，带独立运行身份，缺失回调不能记成零耗时成功，不记录参数／结果／凭据；它不等于原生 API 执行时间。原两段执行／nonce 防 ABA、15 秒 eval、45 秒动作及原场景预算不变；没有增加 evaluate 调用、轮询或生产配置开关。相关检查 **21/21**，当前本地源码对照全套 **1158/1158**、零失败／取消／跳过（`rhvideo-expression-timing-full-node.log`）。这些不等于 Android Java 已编译或实包已运行；新的主包／探针需独立验收。

随后正常 x86_64 release 主包构建成功 **1 分 40 秒**，冻结 `rhvideo-account-reset-android-4fc3246e8c834e62b5bf8cf5924b83d8/x64.apk`，SHA-256 **`094ed0050d957537751030e35f293d7fe286eb9eea96a6b6281ffe785242e39f`**。打包 client **`f12eb2f1be5137ac3b8d2e9e156273e7208dcd0ee316ba47569165ad0889da49`** 与实际源码一致；JNI 仍为原 **1f90b647…e244a**，逐字节验证，不冒计 Rust 重编。构建时实际 BuildConfig 是 LOCAL_CLOCK=false、AUDIO_START_MS=0、CODEC_MODE=default、SURFACE_MODE=compositor；系统包 0.1.38／1038、原证书 **42f3ddee…1975** 验证通过。只冻结 QA 副本，不发布另一份同号不同内容文件。

计时 Java 的手维护源码／生成编译输入 SHA-256 均为 **`c513202511331b70e28f54be66cd5aff4d7fb14697cac4a5d602c9e4240ef862`**，独立探针构建成功 **3 分 39 秒**，同目录 `probe.apk` 为 **`d10ab7645d4f7edd5b4ba7f6c7e43ef0a04f385301d28d2d3ca2bf98034d939a`**。探针构建所需 QA BuildConfig 不可替代上面先冻结的正常主包；仍需实际安装／运行，不能由 Java 编译成功推断桥接或播放器已通过。

本机最初两次构建均在 Gradle 开始编译前失败（原 `rhvideo-account-reset-android-build{,-ipv4}.log`）。堆栈明确来自 JDK 21 的 NIO Selector 内部 Unix-domain socket `connect`／Invalid argument，不是 IPv4 网络或应用编译错误；本地 JDK `src.zip` 证实 `jdk.net.unixdomain.tmpdir` 的选择规则。独立 Selector 探测在原临时目录失败，指定短路径 QA 内 `test-artifacts/java-uds` 后成功，随后两次真实构建也成功（`...-build-uds.log`、`rhvideo-expression-timing-probe-build.log`）。参数只加在本次 Java 子进程，不重启／停止系统服务、不改系统网络或全局临时目录；这定位到默认临时目录的 Unix socket 路径，不进一步猜测其系统内部原因。

## 2026-10-31 普通发行版的外部像素／真实按键验证（该阶段整轮待重跑）

冻结 `8d218a9`／EXE `7745af1fa0255a28b9601fd7783c7b2fc26e8cdcbd9d26eb5c0d40aefcc45ca4` 的完整 Windows 场景已终止：**114/117、三失败、零取消／跳过，21 分 39 秒**，不是绿色验收（`rhvideo-pipe-full-u6eHgs/RHFiles/test-artifacts/rhvideo-windows-XuNsNl/receipt.json`）。结束后重新逐项核对 1160 个冻结源码、两个工具、426 个运行文件及 14 个参考模块，共 **1602** 个输入全部不变；正式程序 PID 45696 未重启或替换。

其中两个失败是源切换／暂停旋转的像素断言调用了发行版明确禁用的 `player.diagnosticFrame`；第三个是幻灯片在未登录时调用只在 debug 编译的 `diagnostics.libraryKey`，收到“请先连接并登录”。不能删掉像素、真实按键或焦点断言，也不能为了测试将截图／注入接口加进普通发行包。

新增只位于脚本目录的外部 C++ 观察器：目标 PID 必须是同一 Node 测试父进程的子进程，创建时间、精确 EXE 路径与 `rhfiles.exe` 名称均需匹配。像素只读取唯一可见播放器内的 `RHFilesNativeVideoSurface`，不读取桌面或其他应用；尺寸最多 4096×4096，仅写工作目录下新建随机 BMP，前后核对当前播放输入／旋转，仍使用原来的 25 秒就绪预算。常规硬件输出保持 PrintWindow，原 GDI 兼容输出才使用子窗口 BitBlt，不切换实际解码器。Home／End 仅在本测试媒体库已经拥有真实 Win32 焦点且无修饰键时单次发送，部分 DOWN 只补释放、不重新按；主窗口切换仅在本测试进程已处于前台时允许。观察器不随客户端打包，不新增生产端口或 API。

观察器在本机 MSVC 实际编译成功；准入核对其源码和 EXE 的 SHA-256，缺少、改动或链接到测试目录外即失败。实际父进程、错误 EXE 身份及非 RHFiles 的兄弟进程拒绝控制 **1/1**，不读取外部应用、没有生成截图。源码脚本全套在显式 `RHVIDEO_SOURCE=D:\git\RHVideo` 下 **1151/1151**、零失败／取消／跳过，32.996 秒（`rhvideo-release-observer-reference-node.log`）；首次没有设置该位置的运行是 **1105/1151、46 跳过**，保留日志，不能算成完整通过。

相同未修改发行版的定向实际场景已分别通过：红色横屏→蓝色竖屏→红色横屏的实际像素、暂停旋转的四角标像素／时间／倍速／账户偏好，以及幻灯片两种 Windows 按键编码的真实 down/up 与主窗口零泄漏。旋转截图 `rhfiles-e2e-ClfBQw/rhvideo-rotation-on.png` 已查看；幻灯片 `rhfiles-e2e-larwkZ/slideshow-keyboard.json` 保留前后台布尔状态及拒绝结果，不记录其他应用句柄／标题。最终工具 EXE `dc25479896c1a836d77787b88ed30dee8835379099f10f630e791b81aa1c6820` 的组合串行回归 **4/4、零失败／跳过，64.894 秒**（`rhvideo-release-observer-window.log`）。仍需冻结新整轮，不能以这几项通过覆盖上面的 114/117。Android 持续播放／生命周期及整体同质量性能目标仍未完成；仍只用生成媒体／临时 SQLite，未读取实际用户媒体或正式数据库。

继续检查发现账户重连／退出所用 `clearMediaViews` 仍有一份只清 Map／src 的旧实现，没有调用会 disconnect 观察器的 `clearCards`。新增提取实际生产函数的回归先复现 **4/5、一失败**（`rhvideo-account-observer-reset-red.log`），现复用统一清理，避免旧账户节点继续被引用；原 token／loading／DOM 清理均保留。与收藏就地重绘控制合跑 **7/7**、零失败／跳过（`rhvideo-account-observer-reset-green.log`）；显式本地 RHVideo 对照的源码全套 **1152/1152**、零失败／取消／跳过，40.679 秒（`rhvideo-account-observer-reset-node.log`，与编译并行，不作为性能样本）。它是引用清理修复，不声称已经测出长期内存或首帧时间收益；需重新编译候选，不能沿用上面的 7745 实包结果。

## 2026-10-31 全可见封面解码与视口缓存优先级（完整目标仍未完成）

新的 `visible-covers-v2` 对照使用同一只读函数，按两端实际封面容器与视口的相交关系计算预期数量；缺失／被隐藏或移除的图片不能缩小工作量。冷目录和 21 次搜索共 **22** 个检查点都等待所有可见图片解码，再交付两帧，固定十秒解码上限；每端都保持 1280×800、36 个逻辑卡片和相同五万条生成数据。不同布局下实际可见封面是参考 **4** 张、本端 **8** 张，不据此声称两端像素工作量完全相同，也不与原先只要求一张解码的 v1 时间混算。失败也写入独立回执，不能作为可比较成功。新增检查覆盖缺失、隐藏、零尺寸、解码失败、超时、背景与脱离节点，完整脚本 **1141/1141**，零失败／跳过，27.789 秒（`rhvideo-card-visibility-cache-node.log`）。

该测量暴露原卡片缓存按创建顺序淘汰的问题：先创建的可见顶行比刚创建但从未看见的底行更早被移除。新实现以原生 IntersectionObserver 的实际视口事件记录最近可见顺序，淘汰未见／更早见过的离屏卡片，保持原来的 72 项目标和离屏解码图像 **16 MiB 估计**上限，不淘汰当前附着卡片，不降低图片分辨率。回调核对同 key 的确切节点身份，背景／脱离节点不更新，替换／淘汰解绑，账户／卡片重置断开观察；不增加后台轮询。原逻辑的定向测试 **1/4**、三失败，修正后与收藏重绘控制 **6/6**，日志保留 `rhvideo-card-visibility-cache-{red,controls}.log`。

实际旧 **0A3** 程序在明确匹配旧 client／workbench 字节后复现：8 张原可见封面约 **12.8 MB**、在原预算内，切换另一查询再返回，卡片／图片身份丢失，上游读取 **8→16**，不是源码 mock 的推断（`rhfiles-e2e-2UcxzW/visible-card-cache.json`）。新优化构建成功 **2 分 30 秒**，冻结 EXE **`7745af1fa0255a28b9601fd7783c7b2fc26e8cdcbd9d26eb5c0d40aefcc45ca4`**、client **`2afc98dfdb3cdd14fc117da47275fd798ee348ea3e41926aa349eadd754cf0b5`**；相同实窗口用例 **1/1**，原卡片／图片仍在，实际解码且读取 **8→8**（`rhfiles-e2e-4OO7s8/`）。没有通过扩大内存或减少原 480 条测试数据避开淘汰。

使用 v2 的配对正常运行：旧 0A3 的参考／本端热搜索 P50 **61.8／154.8 ms**、P95 **150.8／188.5 ms**（`rhvideo-reference-comparison-2j9Tyz/`）；新 7745 为 **86.9／104.6 ms**、P95 **236.3／156.0 ms**（`...-BH9Pqh/`）。整体上游缩略图读取本端仍是 **419／452**，未证明总带宽下降；可见封面复用已由真实身份和 HTTP 单独证明，但主机波动、离屏预取与绘制等待仍在，不能把一轮时间变化当作同质量性能全部达标。完整 Windows 场景仍需在冻结输入上重跑，不沿用上一 15 项组合或旧 114 项包的成功。

Android 正常 x86_64 候选构建成功 **2 分 01 秒**，包 **`41560d371bf0ad232475a218ecf13d59d3b1a2f3c7f5142123a9989a0e1d38ed`** 含相同 client；原 JNI 逐字节不变、原签名／0.1.38／1038 验证通过，没有 QA BuildConfig 标记。未安装实体手机或据此声称 Android 整轮／持续播放已通过；未发布另一份同版本文件，正式实例和五台自有模拟器未停止或重置。本地 RHVideo 仍只运行生成媒体与临时数据库，不添加云端读取密钥。

完整 Windows 回归的首份 `rhvideo-pipe-full-TgScz4/` 冻结了 1160 个源码、两个工具、426 个运行库文件和 25 个场景文件，但在原 **30 秒**准入阶段实际超时退出，业务场景尚未开始，不是绿色整轮。随后独立执行原验证器明确报插件时间变化：此候选复制自正式便携包，插件是已知 DOS 1980 时间，而入口误用了源码时间策略。改为现有的 `velopack` 策略，仍核对全部文件／固定哈希／许可证／插件清单，并只容许清单原时间或已知 DOS epoch；没有放宽任意时间、跳过哈希或延长预算。同一实际冻结运行库按正确策略 **999 ms** 完整准入成功。入口增加带路径引号的定向测试，原合成策略检查继续拒绝 1981 等任意改时；全套脚本 **1142/1142**、零失败／跳过、30.310 秒（`rhvideo-visibility-admission-node.log`）。需另建包含入口修复的新快照重跑，旧快照与失败日志保持不变。

## 2026-10-31 有界列表页缓存与实际等待分段（完整目标仍未完成）

继续使用 WINSERVER 的本地参考 `D:\git\RHVideo`，实际 HEAD 仍为 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`。只运行生成媒体／临时 SQLite；不添加云端 RHVideo 密钥，不读取正式数据库或真实媒体。

新 opt-in 计时只记录固定动作名和主页面单调时间，不保存参数、URL、结果或异常内容。实际发行版的 Tauri 传输函数不可写；首次诊断明确失败，现保持受保护函数不变，报告 **`nativeObserved:false`**，不能将未观测的原生边界解释成零耗时。观察器有 4096 条记录和每 worker 128 个等待身份上限，原 receiver／参数／返回值不变；对照退出后实际等待 app.closed，不让上一客户端残留到下一客户端。`rhvideo-reference-comparison-SEHssZ/` 显示热查询仍重复跨 worker，往返含调度／消息交付，不是 worker CPU 时间。

共享 workbench 现在仅对普通列表缓存当前账户／清单修订下的查询结果页：最多 **8** 页，每页最多 **100** 项、序列化最多 **262144** 个 UTF-16 code unit，key 最多 32768；账户／worker 更换、刷新及清单修改清空。命中前仍确认账户和原始清单就绪；陈旧结果、队列／全量顺序、定位和超大结果不缓存。播放、导出、图库／章节队列仍走原查询，不在界面线程执行大清单筛选排序。首次完整脚本为 **1130/1131**，唯一失败是原隔离 worker 测试没有提供新增的缓存依赖；补齐真实依赖并新增旧页必须清空的断言后，完整 **1131/1131**，零失败／跳过，29.318 秒（`rhvideo-page-query-cache-{first-node-failure,node}.log`）。

Windows 优化构建成功 **2 分 25 秒**，冻结 EXE **`0a3bb7b5f9e420abe7d50b1cda5647062bd48acf4bc91c0957a3ff4fd103aeee`**，实际 workbench 字节 **`d7e0c6d501dfa2152e7cee42c881179dea91c99913b5699017954b02028964ec`**。新增实窗口用例最终独立 **1/1**：首个搜索 1 次 worker 查询，重复搜索仍为 1；真实暂存／恢复／刷新立刻改变或恢复总数，翻页后回到缓存页不增加查询，每个写入只有一次，实际封面解码且截图已查看（`rhfiles-e2e-jm3z98/`）。前两轮组合回归均为 **14/15**、零跳过，分别捕获新用例忘选视频分类、在未连接状态假设切分类会直接返回快照；保留 `rhvideo-page-query-cache-{first,second}-window-failure.log` 和实际失败截图，不修改产品默认截图首页或放宽断言。

最终同一 EXE 的四文件串行回归 **15/15**、零失败／取消／跳过，**144.246 秒**（`rhvideo-page-query-cache-final-window-regression.log`）。包括实际缓存／暂存恢复、活动图片不重复刷新、账户／凭据边界、原生四路、1080p H264／4K HEVC、五万图片条带及真实参考 FastAPI／SQLite 的 ZIP 保存和源数据不变；实际 libVLC **3.0.24**、`prebuilt-no-scan`、`native-hardware-auto` 验证通过。当前组合的缓存截图 `rhfiles-e2e-StpU9r/page-cache-list.png` 已查看。它不是所有 Windows E2E 文件或 Android／同质量性能全部通过。

新的无额外计时／采样对照 `rhvideo-reference-comparison-mwPfgv/`，参考／本端热搜索总耗时 P50 **59.1／72.8 ms**、P95 **88.0／100.8 ms**；接口 P50 **25.5／8.4 ms**。额外诊断 `...-UpHRGw/` 进行 21 次搜索，含初始目录在内的整个记录只有 **4** 次 worker 查询，但总耗时仍没有达到参考水平。实际解码图片数分别 **18／10**；当前测量只要求部分封面解码，尚未保证每轮所有可见封面全部就绪，不能以缓存命中或 API 变快宣布同质量性能完成。需补严可见封面就绪条件后重新建立双端基线；旧结果保留，不与新工作负载混算。

Android 正常 x86_64 候选包 **`a894725b1ce160d234259d80470a1f95004bb85f05e55da95debe3dc1f005ff3`** 编译／签名验证成功，**1 分 56 秒**，包含相同 D7E workbench，原始 JNI **`1f90b647a251fd555e474ed8e196eec39d4af35e9a7f6ebcb2dc0a69bb6e244a`** 逐字节不变，没有 QA BuildConfig 标记。它尚未安装／验收，不能沿用之前 APK 的成功或失败。之前 B3EE 候选与 AEC51 探针的宿主直连整轮 **132** 个有界 stdout 步骤、原六分钟超时失败：第一个动作输出约 **43.169 秒**；连接→分类、分类→翻页输出间隔分别 **29.424／27.370 秒**，并非原生执行计时或唯一死锁证明。实际首视频／音量／定位、返回截图后再次播放通过，仍在上一项／关闭阶段耗尽整轮预算（`rhvideo-android-1793379235376-release/instrumentation-steps.json`）；未延长时间或降低音画条件。

所有候选均为独立 QA 副本，没有替换正式 Windows 实例、操作实体手机、重置五台自有模拟器或发布另一份同版本文件。Android 持续播放／生命周期、整轮等待、全可见封面就绪与同质量性能仍开放，完整 1:1 目标保持未完成。

## 2026-10-31 缓存卡片与活动预览的重复刷新（完整目标仍未完成）

当前本地参考仍为 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`；只使用生成媒体／临时数据库。重新核对 **185** 个参考控件、**14** 个模块与 **30** 组功能映射，缺失控件、接口和未映射模块均为零；这不是实际业务或性能全部通过的证明。

实际客户端在复用每张缓存卡片时调用全局 `paintFavorite`，既重复扫描逐渐增大的列表，也重复更新活动图片和放映控件。新实现只局部更新卡片的收藏状态、忙碌状态与无障碍标签；真正的收藏操作仍同步预览和阅读器。新增生产声明测试先失败：36 张缓存卡片触发 36 次全局刷新。修正后完整 Node **1116/1116**、零失败／跳过（`rhvideo-card-favorite-node.log`）。

优化 Windows 构建 **4 分 41 秒成功**，冻结 EXE **`6d3c27e1fc5ba8f94836f1a808cc712be9574fef2437afc6ca9889fbd79e7f93`**，客户端源码 SHA-256 **`dc31ddfbaf1d55880cc8c83ac9ea23ff66473beac0cc6d2062341d13414f8b9b`**。相同实窗口用例在旧 **A042** 包（显式匹配原源码快照）确实失败：8 张原 DOM 卡片造成当前图片预览 8 次重绘；新构建为 **0** 次，仍是原 8 张卡片，图片身份／位置不变，真实收藏只提交一个 PUT，预览和列表同时更新。证据 `rhfiles-e2e-{RrbaoU,jSnYPX}/cached-card-render.json`，新包截图已查看。不是仅以 mock 调用次数宣布修复。

同一新构建的现有 RHVideo 文件及新增窗口用例串行 **13/13**、零失败／跳过，**150.96 秒**（`rhvideo-card-favorite-window-regression.log`）：实际图片、小说、账户边界、四路原生画面、1080p H264／4K HEVC、五万图片条带及真实参考 FastAPI／SQLite 的 ZIP 保存和源数据不变。这不是全部 Windows 文件的第二轮重跑，也不是 Android 或同质量性能验收。

五万条视频对照增加真实打包 index／search／tag 字节校验，没有换数据或绕过公开 API。旧 A042 的参考／本端热搜索 P50 **54.2／97.8 ms**、P95 **131.6／224.7 ms**（`rhvideo-reference-comparison-n3pSDB/`）；新 6D3 的参考／本端 P50 **63.3／110.9 ms**、P95 **97.5／234.3 ms**（`rhvideo-reference-comparison-wZdSih/`）。两轮结果计数相同、1280×800、可见且实际解码封面，非采样诊断；**没有显示整体搜索速度改善**，不能把减少预览重绘当作性能目标已达标或宣称唯一根因。每轮都有独立记录，旧结果未覆盖。

Android 正常发行测试包 **038397** 与新的 **AEC51** 探针保持实际安装字节校验。修正全页截图计数及诊断 JSON 类型后，ADB reverse 整轮停在放大任务图片的原十秒等待，媒体日志另有响应读取长等待；原包的宿主直连对照越过图片，并确认弹窗 **32** 项、隐藏主页缓存 **32** 项，但仍在原生上一项／父层返回阶段达到原六分钟整轮上限。日志 `rhvideo-typed-scope-smoke{,-host}.log` 均保留，**两轮都没有整体验收通过**；不因此延长等待、换音频／画质或将部分成功改报绿色。宿主新增有界、无参数／凭据的现有步骤 stdout 到达时间观察器，并非原生执行耗时或新的成功回执；该观察器尚须下一次原生运行采证。

本轮修改没有替换正式 Windows 实例、操作实体手机、重置模拟器或发布另一个同版本包。Android 持续同屏／生命周期、整轮等待和同质量性能仍开放，完整 1:1 目标保持未完成。

## 2026-10-30 独立进程回执后的 Windows 完整回归

冻结 **`faeb082 / 83f35d2a0715ee2ba0ce90eb0666afe9745e0e483f97aff92812af7409166768`** 的整轮已终止：**114/114，通过；零失败、取消、跳过及 todo，25 分 21 秒**。使用实际 app-local libVLC **3.0.24** 和 **native-hardware-auto**，串行执行全部 22 个 RHVideo E2E 文件，没有混入回执／播放诊断参数、并行构建或其他播放验收。终态回执位于 `rhvideo-pipe-full-t70ase/RHFiles/test-artifacts/rhvideo-windows-pDKaCx/receipt.json`；终止后逐项复核 **1145** 个冻结输入、**14** 个参考模块及 EXE 均未改变，记录在该冻结目录的 `post-run-fingerprints.json`。

包括此前失败的“首个界面暂停、重新发现不可用、原 wait 回复丢失”的关闭场景，也包括所有存活 WebView 完成回复丢失时经鉴权只读进程账本确认成功、错误密钥被拒绝，以及旧能力缺失时的恢复。保留原五秒、真实原生帧、唯一动作提交和销毁／播放器释放检查，没有靠重放或延长截止通过。旧 **111/112** 失败作为历史证据保留，本轮才是新程序的完整重跑结果。

该结果属于上述冻结版本，不自动覆盖随后新增的设备组二维码／可复制文本界面或新的发行构建。Android 新 APK、同屏持续播放／生命周期、实体设备输入和同质量性能仍须独立验收；114 项通过不代表整个 1:1 目标已经完成，也没有替换正式运行实例。

## 2026-10-30 已接受动作的独立进程回执（实现与定向验证）

不靠延长五秒、延迟销毁窗口或重发动作来避开下面的主线程排队。Windows 在显式本机 CDP 自动化开启、`--wait` 客户端查询 `runs.transport` 能力后，按需建立每进程随机命名的只读管道：操作系统拒绝远程客户端，另有独立随机密钥，只接收有界的运行 ID／key 查询。没有 TCP／局域网监听，不写磁盘或设置，不同步密钥。普通启动不创建该管道，其他平台／旧版没有能力时保留原界面查询。动作提交仍走同一语义接口，原生读与最多八个界面只读查询竞争确认结果；原动作从不重发。

服务端限制 4 KiB 请求、1 MiB 应答、15 个活动连接和一个监听实例，读取报文、写应答和账本等待各有上限；等待仍使用原截止时间。客户端断开即终止只读等待并释放槽，不会取消真实操作。原生登记略迟于 JS accepted 时可等待原身份出现，缺失／过期不重新执行；返回仍核对动作、运行 ID、完成状态与结果结构。共享核心为这个可选只读能力增加方法，Android 源码镜像保持逐字节一致，移动端不注册 Windows 管道提供器；本节没有据此声称 Android 新 APK 已通过。

首轮真实流测试 **27/29、两失败**（`rhvideo-process-receipts-first-controls.log`）捕获客户端 half-close 使延迟应答提前断线，现改成只以换行界定请求、保持双向连接直到完成／取消／截止。原生新增测试也曾因新增测试代码的声明语法错误未编译，错误日志保留，修正后实际命名管道／鉴权／非法字段／迟到登记／断开释放共 **12/12**，零失败／忽略（`rhvideo-process-receipts-native-cancellation.log`）。相关 JS 回执控制 **39/39**、最终共享源码全套 **1090/1090**，均零跳过（`rhvideo-process-receipts-final-controls.log`、`rhvideo-process-receipts-final-node.log`）。这些不是 Android JVM 或完整 Windows 场景数。

第一次实窗口中 CLI 已在原生完成后 **16 ms** 得到真实 succeeded，仍被旧的“必须由存活界面交付”断言判失败（`rhvideo-process-receipts-first-window.log`）；未把窗口消失当作完成。现改为更直接地要求已认证进程账本成功，保留原五秒、实际原生帧、单次提交、关闭后播放器释放及真正销毁 WebView 的断言。兼容场景仅显式关闭新能力发现，仍检验原界面回执竞争和不重放。

最终 debug EXE **`83f35d2a0715ee2ba0ce90eb0666afe9745e0e483f97aff92812af7409166768`** 包含断开释放修复，编译后复制到独立快照。**四项实窗口回归 4/4**、零失败／跳过（`rhvideo-process-receipts-final-window.log`）：原窗口自关闭、另一个视图暂停且重新发现不可用、所有存活 WebView 完成回复都丢失，以及无新能力时的旧链路。新增场景还用错误密钥实际请求管道，确认 UNAUTHORIZED、仍有两路原生播放器；随后正常关闭只提交一次，并真正销毁窗口。证据 `rhfiles-e2e-gBZqvV/native-receipt-only.json` 不保存管道密钥。此前一次三项试跑与 Rust 编译重叠，保留但不作为性能对照；最终四项在编译结束后串行运行。

这修复的是已接受关闭动作的回执交付依赖，不证明 WebView2 controller Close 的内部排队已消除，也不是视频首帧／持续播放性能达标。旧 **111/112** 完整失败仍保留，必须冻结新输入重跑后才能判断新 Windows 整体验收；Android 同屏／生命周期与同质量性能等缺口仍然开放。没有替换生产实例、操作真机或发布新包。

## 2026-10-30 回执交付的主线程排队对照（独立回执修复的前置证据）

保持实际两路原生画面、同一临时媒体／独立配置、生产者 wait 应答丢失、目标重新发现失败、单次提交及原五秒预算，比较是否暂停另一视图。先用 **CA229** 观测：暂停时 native-return → RPC 应答 **2197 ms**，但媒体库内有界 50 ms 定时采样最大间隔只有 **52 ms**，不能将其误判为该页面 JS 整体停止。正常关闭的首个对照由未暂停的主窗口赢得恢复，媒体库没有执行 wait，故公开 RPC 时间差明确记为 null，不制造一个数值。

于是给 opt-in debug 原生读取加入排队到主线程的时间戳；客户端 trace 同时保留单调时间并加本机墙钟，便于同一机器跨进程关联。新 EXE **`0d8d8d20d909c3f0367d29d326ca8c816c00f2a3e735d5f7a3aea62d72cc9df0`** 构建并冻结后，两条独立对照均完成，退出码为 0：

| 单次对照 | 原生等待 | 原生返回后主线程任务排队 | 原生返回后 CLI 收到应答 | 媒体库定时采样最大间隔 |
| --- | ---: | ---: | ---: | ---: |
| 未暂停其他视图 | 956 ms | 135 ms | 154 ms | 53 ms |
| 暂停首个视图 | 1213 ms | 2180 ms | 2199 ms | 52 ms |

日志为 `rhvideo-receipt-ui-turn-{unpaused,paused}.log`；完整输入／原生时间戳／唯一提交 trace 在 `rhfiles-e2e-{2xmtD5,rVq76K}/receipt-delivery.json` 和 `app.log`。该对照只观测排队，不延长五秒、不重发关闭，也不轮询账本；定时采样仅记页面时钟，不请求原生状态。实际媒体／配置均为本次生成，不接触生产实例。

这说明在该故障条件下，界面主线程的排队与跨界面回执应答的额外约两秒一致，不能再归因于媒体库 JS 被完全暂停、账本未完成或原生 wait 的 25 ms 检查。它仍没有单独证明 WebView2 内部 controller Close 的具体阻塞位置，也不是普通播放性能的验收。下一步是消除命令行读取进程完成回执对界面线程的依赖，保留身份校验、仅本机读取、截止时间与不重放约束；不是在前端延长等待掩盖旧失败。

相关回执控制 **27/27**（`rhvideo-receipt-timestamp-controls.log`），最终共享全套 **1078/1078**（`rhvideo-receipt-ui-turn-final-node.log`），均零失败／跳过；新增用例核对 opt-in trace 的两种时间戳与不记录请求参数。未冒计 Rust 全套或 Android 新包，旧 **111/112** 整轮失败仍保留。正式程序和五台自有模拟器未被停止或替换。

## 2026-10-30 最新冻结整轮 111/112（未通过，回执恢复待修）

**`777425a / 7e710c24e9fbd3cca05cb4f7bcc52ebddba803d143d790de189275364cf3d140`** 的完整串行 Windows 场景现已终止：**111/112、一失败、零取消／跳过，测试时间 26 分 12 秒**（`rhvideo-video-order-full-kfQAd4/RHFiles/test-artifacts/rhvideo-windows-1XB7X6/receipt.json`）。唯一失败是第 **34** 项：首个存活视图 debugger-paused、目标重新发现不可用、生产者 wait 回复丢失时，同屏关闭的命令行回执恢复未在原五秒预算内完成。其他所有项通过也不能将该整轮记为绿色。

`rhfiles-e2e-jRcIQZ/grid-close-recovery-failure.json` 的进程账本在暂停期间及恢复后均确认同一关闭已成功，`finishedAt-startedAt = 990 ms`；CLI 读到另一路 running 后，两个读取最终都超时。说明关闭与调用者及时取得完成结果是不同的要求，不能把窗口消失当成功，也不能把 CLI 错误直接判作播放器没有关闭。当前证据不足以判定唯一恢复根因；未重发关闭、延长原预算或用后续单项通过覆盖失败。终止后逐项复核 **1138** 个冻结输入、**14** 个参考模块及 EXE，全部未变（冻结目录的 `post-run-fingerprints.json`）。本节仍不包含下面的新确认上下文修复。

后续在健康视图附加最多 32 条公开 RPC 开始／原始 Promise 应答时间，不在五秒期间轮询、不改变 Promise、不添加重发。**65F4** 的定向观测通过（`rhvideo-close-receipt-public-boundary-window.log`、`rhfiles-e2e-hBIPpN/grid-close-recovery-observation.json`）：账本关闭用时 **1342 ms**，公开 wait 的实际应答仍约 **3477 ms**，存在完成与交付间隔，唯一根因尚未定位。早一版观测曾尝试改写只读的 Tauri 导出，准入断言明确失败、未执行关闭；现只观测可验证的公开 RPC，不把它称为原生 IPC 内部计时。此次 1/1 不覆盖旧整轮失败，也未将原预算放宽。

继续增加仅 debug 构建且显式 `RHFILES_RECEIPT_TRACE=1` 才记录的原生读取入口／正常返回时间。记录本机读取序号、等待上限、时间及状态，不含请求 key、run ID、参数、结果或凭据；不新增监听器、重试或业务行为。新 EXE **`ca2293083926f63bdcb5ba5e418041ff518c0776a3d25bcc8c688869559aa287`** 编译成功并复制为独立运行快照；同一五秒故障场景 **1/1** 通过（`rhvideo-close-receipt-native-timing-window.log`、`rhfiles-e2e-DQwWm5/`）。这一轮只作分阶段诊断，不冒充完整重跑。

这次账本在 **1793367340628** 完成，原生 wait 在 **1793367340646** 返回 succeeded（只迟 **18 ms**，原生等待 **1168 ms**），公开 RPC 到 **1793367342780** 才兑现，原生返回后又隔 **2134 ms**。这将本次迟延范围缩到原生返回之后，不能再把本次间隔归因于账本仍 running、25 ms 等待循环或被持有的账本互斥锁。实际锁定依赖为 Tauri **2.11.6**／Wry **0.55.1**；其本地源码表明自定义协议应答会派发到主线程，WebView 销毁也调用 controller Close。这是下一步核对主线程／窗口销毁与应答交付的线索，**尚未证明具体阻塞点或修复旧超时**。

## 2026-10-30 迟到确认的完整界面上下文（两端实包定向通过）

冻结的 **`777425a / 7e710c24…cf3d140`** 整套独立运行期间，在本工作区继续检查，未改它的 **1138** 个输入。`replacement.selected` 已有较新选择／显式关闭 info、confirm 的 intent，却漏了复用 info／打开其他工作台面板：八项实际 action 与 dialog AST 用例先全部失败（`rhvideo-replacement-dialog-intent-red.log`）。只修工作台后，普通登录／图片／阅读器／时间轴的另一个弹窗入口又有八项全部失败（`rhvideo-replacement-client-modal-red.log`），不是同一个接口已存在就算覆盖。关闭设置、规则及四个客户端面板还另有十项失败（`rhvideo-confirm-close-context-red.log`）。

继续沿提交链确认：通用 `confirm.begin` 在状态／操作契约读取阶段、`selection.stage` 在已选元数据读取阶段仍可迟到创建 UI；新增八项中 **2/8、六失败**（`rhvideo-confirm-all-stages-red.log`）。现将未提交确认准备统一为单调的 `confirmationIntent`：显式新确认请求、普通／工作台面板打开、复用和关闭都会使旧准备失效；状态、契约或元数据每个 await 后均核对，账户 epoch／generation 检查仍独立保留。过期状态读取不再接着等操作契约。**不删除已创建的确认票据、不撤销已发送批次、不自动重试服务器动作**；正常创建／两次推进／一次性提交继续保留。

相关控制检查 **94/94、零失败／跳过**（`rhvideo-confirm-context-complete-controls.log`）；其中生产声明的受控用例不是第二份业务实现。两端共用真实 HTTP 场景 `rhvideo-replacement-intent.mjs`：服务器阻塞实际视频清单，随后复用 info、创建另一确认、打开／关闭普通连接面板、关闭设置和批量暂存父面板，响应完成后核对旧结果 stale、新 UI 不变且零写入；最后正常两次确认只提交一个批次，之后开关设置不得取消或重发。测试 gate 自身还有真实 HTTP、幂等释放及旧 gate 不释放新操作的回归。这些是实际界面／语义 API 与原生 HTTP 业务验证，不声称物理鼠标／触摸或原生播放验收。

旧程序对照已另行实际运行并失败：`rhvideo-old-confirmation-baseline-MmIIbL/RHFiles/test-artifacts/rhvideo-replacement-intent-old-window-red.log`。这个独立副本保留同一 **7E71** EXE 和原 **777425a** 的 **111** 个前端文件（逐项对照冻结指纹），只加入新回归脚本；没有改旧前端或绕过脚本内的资源 SHA-256 门禁。实际延迟响应完成后，第一种“复用 info”已得到一个旧选择的确认 ticket、`confirmationOpen:true`，而非 stale；`rhfiles-e2e-e1H8ak/replacement-intent-failure.png` 已查看，确认确实覆盖新面板。这是实窗口反例，不只是 VM 预期。

最新产品源码的共享全套 **1077/1077、零失败／跳过**（`rhvideo-confirm-context-full-node.log`，最终 `npm test` 再核对为 `rhvideo-confirm-context-final-node.log`）。旧整轮终止及上述对照结束后才开始 Windows／Android 新构建。Windows debug EXE **`65f49c5e2eb4b8bbc2b6d271268888b159c36652eb20fa1b3e68b67313b445d4`** 编译成功并冻结后，实际迟到确认、搜索字段、视频排序／完整选择三个场景 **3/3** 通过（`rhvideo-confirm-context-windows-window.log`），不是完整 Windows 整轮重新通过。

Android 只同步两份共享 JS，显式排除未变 Rust 构建，Gradle 主包／探针成功；新主 APK **`d7493e81dc274e33f8c1c2200c5cc6a82a9db4d1d2f5df1866afd68b4c30609d`** 已单次覆盖安装到自有 **5588**，真实 `base.apk` 哈希核对一致。22 份打包资源与当前源码一致；与上次实际通过的 **2C0C** APK 比较，排除签名后 **1234** 个成员只有 client／workbench 两份 JS 改变，主界面、DEX、资源及两套 JNI 未变，不冒计新的 JNI／JVM 验证。

第一次新包业务验证在媒体库控件注册前超时，服务器 **0** 请求（`rhvideo-android-replacement-intent-f5ybPb/receipt.json`）；后续诊断另遇主界面桥接就绪超时，均保留，不能宣称根因已修复。于是绕过业务就绪断言，仅观测早期真实页面：主界面与媒体库先后完成加载，媒体库由 0／7 个基础 action 到 **288** 个、进入 `mobile-client`；没有 JS 异常，另有不影响功能的 favicon 403。实际截图已查看。日志／资源／异常在 `rhvideo-bootstrap-observe-usSYeZ/` 和 `rhvideo-library-bootstrap-yuAKih/`。未延长原业务就绪预算、重装 APK、重置模拟器或清除登录。

完成上述阶段观测、确认进程终止后，同一 **D749** 实包运行六个延迟确认场景全部通过，正常两次推进恰好提交一个批次、零其他写入；**40** 个 HTTP 响应完成，零 transport error／丢弃（`rhvideo-android-replacement-intent-1ACvyQ/receipt.json`，`rhvideo-confirm-context-android-observed-business.log`）。随后搜索字段／拼音九项及真实输入回归也通过，**19** 响应、零错误／写入（`rhvideo-android-search-fields-WAQAWP/receipt.json`）。保存并查看 `android-c5KssT/replacement-intent.png` 和 `android-tUbAI7/search-fields.png`；它们不能替代 Android 原生播放、生命周期或触摸验收。

回执恢复的 **111/112** 失败、上述间歇启动超时、Android 同屏／生命周期及同质量性能仍未验收；定向通过不抹去这些失败，也未发布正式包、操作真机或替换正式 Windows 实例。

## 2026-10-30 冻结 Windows 整轮终态及新排序构建（继续验收，未发包）

搜索字段版的冻结完整验收现已终止：**111/111、零失败／取消／跳过，26 分 49 秒**。回执为 `rhvideo-search-fields-full-u777Fq/RHFiles/test-artifacts/rhvideo-windows-HK1qZv/receipt.json`，包含普通／同屏原生播放、1080p H.264／4K HEVC 真实帧、图像条带、语义输入、图片加载、服务器任务及真实 FastAPI／SQLite。终止后再次逐项核对 **1132** 个冻结工作区文件、**14** 个实际参考模块及 EXE **`ca17e05e…75e017a`**，没有变化（同一冻结目录的 `post-run-fingerprints.json`）。原先的失败记录保留，不能据本轮绿色宣称以前的间歇失败从未发生；这也是调试版功能验收，不是同质量性能或 Android 完整通过。

本轮属于冻结 **`1ae80a8`**，**不包含**下一节 `8a369ae` 的视频排序／已选替换修复。后者重新执行共享全套 **1028/1028、零失败／跳过**（`rhvideo-video-order-full-node.log`），随后独立构建 Windows **2 分 31 秒成功**（`rhvideo-video-order-windows-build.log`），新快照 `rhvideo-video-order-runtime-c8f5f28751b74cc7ab10331909a5f86c/` 的 EXE 为 **`7e710c24e9fbd3cca05cb4f7bcc52ebddba803d143d790de189275364cf3d140`**，app-local libVLC 3.0.24 校验通过。没有拿旧 CA17 程序运行新资源用例。

Android 仅同步已改变的共享 JS，再明确排除未变 Rust task，增量组包 **1 分 51 秒成功**（短路径 QA 的 `rhvideo-video-order-android-build.log`）。新快照 `rhvideo-video-order-apk-FzFkBX/` 主包 **`4eddcab6d45e2855fcd89e3f4e985af45559c1dda7d09f556cf8a365ffc9bb73`**，探针仍为 **`4b372563…bc5ac`**，mapping／完整资源及 JNI 哈希保存。二十份共享资源逐项与当前源码一致，两套 JNI 与上一包相同，不冒计新的 JNI／JVM 全套。自有 **5588** 先通过所有者、启动、无错误弹窗／无在途播放器准入，再单次覆盖安装；客户端明确返回 Success，读取系统真实 `base.apk` 的 SHA-256 也确认为 **4EDD**。未操作实体手机。

两端共用的新排序场景已加严到两页的实际 DOM 卡片顺序，不仅比较 API；结束时恢复真实非空首页供平台截图核对。新 **7E71** 的 Windows 搜索与排序／已选替换窗口场景 **2/2、零跳过**（`rhvideo-video-order-windows-final-window.log`、`rhfiles-e2e-{2V2aPa,XQmBxi}/`），实际窗口截图已查看。最初 **4EDD** APK 的完整排序／已选替换也通过（`rhvideo-android-video-order-FTVFoH/receipt.json`）：五种参考排序、52 个 ID 的两页实际卡片、跨过滤完整选择、两次确认只提交一次、缺失 ID 的关闭和 API 契约；**171** 个响应完成，零 transport error／丢弃、只有一次显式批次写入。不能由这些场景推定新 EXE 整套或 Android 原生播放已通过。

### 窄屏工具区与可见封面

实际 Android 截图确认控制区挤占内容。新增实际 DOM 几何门禁后，同一 **4EDD** 在 **412×867 CSS px** 中第一张卡片 top **675.14**、音量标签与滑块纵排，两条工具区高 **81.62／95.52**，部分按钮只有 **34 px**，明确失败（`rhvideo-mobile-catalog-layout-red.log`）。不是以 CSS 字符串或截图主观判断代替几何。窄屏 CSS 改为横向可滚动工具行并保留所有命令、API 和至少 **44 px** 的触控目标；对话框与平板布局不改。第一版 **FDED** 仍为 top **545.52**，未满足原门禁，失败保留（`rhvideo-mobile-catalog-layout-android-window.log`），没有放宽比例断言。

之后只收起没有筛选时重复的“全部视频”摘要行；“标签筛选”原入口仍在，有条件时仍显示摘要、标签和清除。仅重新组 Android 资源，**1 分 24 秒成功**（短路径 QA 的 `rhvideo-mobile-catalog-summary-android-build.log`）；最终快照 `rhvideo-mobile-catalog-summary-apk-mtezq8/` 的主包 **`2c0c50da45d32e9397a3d012ce900d0d5d5ab534ce778796d3729b4e6f63bdcf`**，探针／两套 JNI 没变，**22** 份共享及移动资源逐项校验，系统真实安装文件哈希一致。

同一 **2C0C** 的完整排序与真实布局／触摸场景通过（`rhvideo-android-video-order-7g4CDI/receipt.json`）：第一张卡片 top **483.52**，两行工具高 **48／61.52**，全部操作目标至少 **44×44**；WebView CDP 触摸两行分别滚动 **262.86／23.24 px**，**零 click**，没有替换按钮 handler 或直接赋 scrollLeft。它是实际 WebView 触摸输入，不冒称实体手机或系统层物理触摸。实际启用城市观察规则时摘要、标签和清除入口仍可见，完整 **13** 个筛选 ID 顺序正确，清除后恢复 **52** 项。该新增检查的首轮曾错用后台 `folder_label` 而非公开状态的 `folder`（`rhvideo-mobile-catalog-summary-android-window.log`）；核对实际 `snapshot()` 投影和 13 项记录后修正测试字段，并加严完整 ID 断言；没有为测试改公开状态或重装同一 APK。最终 **188** 个响应完成、零错误／丢弃，仍仅一次批次写入。搜索同一安装另通过 **9** 组（`rhvideo-android-search-fields-5TLoen/receipt.json`），**19** 个响应、零错误或意外写入。

查看实际截图又发现清除筛选后抓图过早：卡片已创建，但封面还在异步载入。新增可见封面门禁，按可见**卡片容器**取样，缺失／失败／隐藏 IMG 不能退出样本从而蒙混过关；要求真实尺寸、loaded、非零几何及完成透明度过渡，才保存视觉回执。首次补充运行在 **`Runtime.enable`** 就明确超时（`rhvideo-mobile-catalog-covers-final-android-window.log`、`rhvideo-android-video-order-pWlIGh/receipt.json`），还没进入新场景，不能记为封面通过。系统窗口／logcat／crash 现场另保存；当前无错误弹窗，缓冲中的旧 crash 早于该轮，不认定为当前崩溃原因。入口现会在连接初始化失败时、原有自有应用清理前保存诊断，不重开视图、重试握手或延长其预算。

最终共享检查 **1036/1036、零失败／跳过**（`rhvideo-catalog-visibility-final-node.log`），新增八项几何／可见封面门禁测试直接执行同一取样函数，覆盖缺图、失败、隐藏、未完成淡入及屏外项，不用另一份业务实现当证明。等待该检查终止后，同一 **2C0C** 安装再次完整串行执行排序／替换／布局／触摸／筛选及可见封面，明确通过（`rhvideo-mobile-catalog-visible-covers-android-window.log`、`rhvideo-android-video-order-RtH0bA/receipt.json`）：**四**张真实可见封面均为 **800×500**、已解码并结束透明度过渡，`android-b5XobV/video-order.png` 已人工查看；**190** 个响应全部完成、零错误／丢弃、仍只有一个显式批次写入。没有再次安装、静音、改码率或调整视频等待预算；这次通过不证明先前的调试握手超时已被修复，也不替代原生视频或性能验收。

正式 Windows PID 45696 和实体手机均未操作，未发布。上述两端局部业务与布局不替代 Android 同屏／生命周期、同质量性能、完整对照及发行验收，完整目标保持未完成。

## 2026-10-30 视频排序及批量替换顺序（源码修复）

在上一轮冻结的 Windows 整套仍运行时，只在本开发工作区继续核对业务，没有改它的 1132 个冻结输入或 EXE。实际参考 `applyVideoSort` 使用原始文件名的 `localeCompare(..., 'zh')`、原始 `original_filesize`，相同键保留服务器顺序。本端此前使用显示标题／自然数字排序、原始大小为零时回退派生大小，并以媒体 ID 打破相同键，改变了列表及连播快照。最初十四项 **1/14、13 失败**（`rhvideo-video-sort-red.log`）；现在仅修正视频分类的原始名称／大小与稳定相等项，不改变截图顺序、收藏日期规则或已有随机排列。新增第十五项直接比较原版函数的 **150** 个完整队列 ID 及全部分页；旧测试中“2 比 10 靠前”的两条预期同步改为真实参考规则，不是放宽字典序／原始字段断言。

同一检查还确认 `replacement.selected` 原先按选择 Set 的点击顺序创建确认，参考 `showBatchReplaceModal` 却按完整视频列表顺序排队，而且保留已不在最新索引的选中 ID。十二项初始回归 **0/12、全部失败**（`rhvideo-selected-replacement-red.log`），这表示确认内容／账户边界不对，不表示测试真的向用户服务器写入过数据。现于点击时冻结视频 ID 和排序，忽略当前页、搜索、标签与竖屏筛选，读取有序元数据后再创建确认；已知 ID 按完整列表排序，未知 ID 仍按选择顺序排在末尾交给后端校验。查询前后都验证账户 epoch，迟到读取不能把旧选择带入新账户；读取失败不按旧点击顺序兜底，也不自动重发。空／非视频选择拒绝，1000 项边界与保留原生随机列表顺序另有回归。

引入有序元数据读取后，另外四项受控并发用例先 **0/4、全部失败**（`rhvideo-replacement-intent-red.log`）：旧读取会在新请求或面板关闭后迟到创建确认。现加本次选择请求的 intent，较新请求或关闭 `wb-info`／`wb-confirm` 使未提交的旧确认失效；账户 epoch 仍单独校验，不用 intent 代替账户隔离。不是取消已发送的服务器批次，也不增加重试。

当前排序／替换／自有设备准入定向共 **40/40、零失败／跳过**（`rhvideo-video-order-final-controls.log`），执行实际生产 action AST 与两个实际参考函数，不复制一份产品实现当作证明。新增 `rhvideo-video-order.mjs` 的两端共用打包场景：五种参考排序的实际两页卡片、过滤后保留完整已选名单、两次确认只发一个批次、确认后更换选择不改已冻结批次、缺失 ID 的确认／关闭及 UI 契约；Android 沿用已有严格设备／APK 准入，最终 HTTP 门禁另拒绝重复批次和搜索写入。

本节写下时新打包场景尚未运行，完整验收仍属于搜索字段修复的冻结 **`1ae80a8 / ca17e05e…75e017a`**。该轮随后 **111/111** 终止，新 EXE／APK 及独立场景结果见上节；不把旧轮任何通过冒充本节新排序／批次程序通过，也未在该旧轮运行时并行启动新播放或编译。

## 2026-10-30 清单搜索字段、优化构建对照及新版模拟器（继续验收，未发包）

实际参考仍是干净的 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`。本轮继续逐项比较业务，而不是把控件清单当作完成证明：参考视频搜索还匹配 `original_resolution`、`original_duration`、`original_filesize`、`status`，收藏匹配 `title` **及** `filename`。旧索引只搜显示标题、标签和归一化分辨率／codec，既漏结果，也把原版不搜索的字段加进结果。新差分从实际参考 `searchCatalog` 调用的 AST 提取字段，并执行实际参考 `search-core.js` 和同一词典；最初十二项 **1/12、11 失败**（`rhvideo-search-fields-red.log`）。

共享 worker 索引现按视频／图片／小说／收藏各自的原始字段构建；不把显示用的 `×→x` 或标题兜底替代搜索数据。小说／收藏的原始标题使用 WeakMap，既不污染导出及原生解析载荷，也不因调用者后来修改输入对象而变化。更新清单仍使索引失效。测试夹具补上实际后端收藏响应已有的 `title`／`filename`，没有用不存在的后端字段来制造对齐。新增原始字段、空／零值、技术字段排除、中文／混合拼音／首字母、更新与原始标题隔离用例；连同两端共用场景及准入检查，定向 **24/24、零失败／跳过**（`rhvideo-search-fields-controls.log`）。

Windows 增量编译 **5 分 33 秒成功**，冻结副本 `rhvideo-search-fields-runtime-773ea3286e7c43b8a1b2eef921463b8c/` 的 EXE SHA-256 **`ca17e05e09fc0d03991aaa70ee722be2c85626572479fa5d88a20fa0c75e017a`**；app-local libVLC 3.0.24 校验通过。实际打包窗口的搜索场景 **1/1、零跳过**（`rhvideo-search-fields-window.log`、`rhfiles-e2e-164px7/search-fields.json`）：先核对真正服务的索引字节，随后经过原生 HTTP／worker／语义 API 核对结果和实际卡片，还派发 input 事件经过真实输入监听器与防抖；它不是物理键盘输入试验。收藏的独立文件名可由中文／拼音找到，实际截图已查看，UI 契约缺失为零。

Android 首次直接 Gradle 构建因 Tauri CLI 选项通道不存在而明确失败（短路径 QA 的 `rhvideo-search-fields-android-build.log`，**40 秒失败**），未使用旧输出冒充新包。核对 arm64／x86_64 两份 JNI 与原 88D4 APK 逐字节相同后，正常同步新共享资源、明确排除未变化的 Rust task，增量组包 **2 分 26 秒成功**（`rhvideo-search-fields-android-asset-build.log`），本次没有另外重编 JNI 或冒计 JVM 全套。冻结 `rhvideo-search-fields-apk-b168228cef7d4145aa744c70a681942d/`：主包 **`5537c72ac3e75b9bb52074370266d137f6f0fb332422f0f83277f04fb5d50cb9`**、探针仍 **`4b372563…bc5ac`**，mapping 保存；APK 内真实索引 SHA-256 **`07c51b28…9a6c1e5`** 与当前源码相符。安装客户端曾在二十秒观察上限终止，但随后读取设备真实包路径及 SHA-256 确认已成功装入 **5537**；没有因观察超时重复安装。

同一安装的第一轮 `rhvideo-android-search-fields-YWiynj/receipt.json` 已明确失败：还在自动恢复旧夹具地址的登录，尚未执行搜索。等待循环保留了早期的 application 未注册异常，最终现场实际上已有 API、`restoring=true`；不能把报错文字当成索引或 JS 语法错误。新入口改为在控件注册后显式连接本次服务器，符合用户随时更换服务器的正常操作；不等无关旧地址恢复，也不延长搜索预算。场景结束仍要求已连接、恢复状态结束、实际服务器身份为本次地址，旧状态不能冒充当前连接。

随后相同 **5537** 包、没有重新安装或变更媒体参数，实际 Android 场景 **通过**（`rhvideo-search-fields-android-explicit-login.log`、`rhvideo-android-search-fields-YTfdcO/receipt.json`）。两端执行同一 helper：**9** 组视频／图片／收藏查询、真实 input 监听器／防抖、卡片 ID、连接身份及 UI 契约缺失为零；非物理键盘／触摸试验。**19** 个夹具响应均完成、零 transport error／丢弃、零意外写入；`android-1HGjiw/search-fields.png` 的实际设备画面已查看。没有操作实体手机。这是共享索引的真实 APK 业务通过，不是原生视频或 Android 整套已通过。

共享业务全套 **993/993、零失败／跳过**（`rhvideo-search-fields-final-node.log`）；之后仅调整上述 Android 测试入口以显式连接而非等待旧服务器，产品索引字节未变。最终 helper 的 Windows 窗口场景再次 **1/1**（`rhvideo-search-fields-final-window.log`、`rhfiles-e2e-0M7UPv/`），核对同一最终连接身份断言；准入与差分定向另行复核，不用一项通过替代完整 Windows 或 Android 验收。

### 五万条真实封面负载与 CPU 采样

另完成优化 Windows 构建，**9 分 11 秒成功**（`rhvideo-current-release-build.log`），冻结 `rhvideo-release-metadata-runtime-49f1ee93f80f444386f0b8a7db3b74c7/`，EXE **`f6ea4c8f9047cf8f4e53f9567dbfa7cdda8e147f0725e7fcc896f9d44ac0de9b`**。两个实际图片／原生视频业务场景 **2/2、零跳过**（`rhvideo-current-release-functional.log`），不是整套 107/109 的替代回执，也不是物理扬声器或正式发行验收。

最初 metadata 基准中参考页面实际 **0 张图片解码**，本端为 28 张；该轮 `rhvideo-current-library-compare.log` **不可比较**。参考 `<img>` 没有夹具要求的认证头；现在仅给生成的本地参考夹具加认证，保留原版渲染／搜索函数和源 URL。准入要求两端均为五万条、1280×800、可见、真实封面解码且每个搜索计数相同；五项准入测试通过，每轮使用独立目录，`comparable:true` 仅表示负载可比较，**不是速度合格**。

修正后的优化构建对照 `rhvideo-reference-comparison-oGd5N9/comparison.json`：参考／本端初次清单 **1894／836 ms**，首次拼音 **2655.6／2953.6 ms**，热搜索中位数 **56／94.7 ms**、P95 **100.6／172 ms**；均真正显示封面并匹配相同计数。调试构建的另一轮为 **768／2467 ms**，说明不能把未优化构建直接当发布性能；也不能据一次时序受宿主负载影响的样本宣布性能已达标或优化有因果效果。

显式 `RHFILES_QA_SEARCH_PROFILE=1` 另采两端真实 CDP CPU profile（`rhvideo-reference-comparison-y7RSCG/`，两个 `*-search.cpuprofile`），结果标为 `diagnosticSampling:true`，不与普通计时混算。该轮主线程采样没有证明唯一性能根因；未据此改变原生解码、线程／音频、媒体质量或削减字段。该优化 EXE 与这些对照均在本节搜索字段修复之前生成，不能当作新索引的打包验收。

### 独立 emulator 37 的实际启动状态

上一节准备的 37.2.13 副本现已真正创建／启动 **`emulator-5592 / RHFilesRhVideoQA20261030Modern`**，没有更新全局 SDK、重置／重启／停止既有 AVD。私有目录 `D:\git\RHFiles-connection-QA-20261025\test-artifacts\avd-modern-37-fd6afdef23de4399baad1e739f6aac3f/`；launcher **45228**／qemu **92736**，**18:09:04** 启动，**18:41:29** 首次观察到 boot completed（不是精确完成时刻）。同一进程始终存活，API 34／host-GPU／6 核／6144 MiB，镜像指纹及 WebView 113 与原 API 34 对照相同。

**尚未安装 RHFiles** 就有 system、System UI、输入法 ANR；随后当前实际画面为 Bluetooth keeps stopping，crash buffer 是 `com.google.android.bluetooth` 的 stack startup assertion，而非 RHFiles。截图 `rhvideo-modern-system-{boot,current}.png`、实际窗口／crash 日志与更新后的 runtime `admission.json` 均保留；UIAutomator 也曾返回 null root。未关闭系统服务、绕过错误窗口门禁、安装应用后冒称新环境播放通过，亦不以这台环境故障证明产品播放器无错。已有自有 5588 在新包安装前重新通过无错误弹窗／无在途应用或 stagefright 的准入，另行执行新索引的打包业务测试。

本轮继续保留完整 Windows **107/109** 的历史失败及 Android 同屏／生命周期、同质量性能与正式发行缺口，不把搜索修复、优化构建局部通过或模拟器准入当成完整还原。正式 Windows PID 45696 和实体手机均未动，目标保持未完成。

## 2026-10-30 播放器／同屏语义键与 API 36 独立对照（继续验收，未发包）

继续执行实际参考 `playlistKeyHandler`／`gridKeyHandler`，发现 Home／End 修复之前只覆盖了媒体库放映，Windows 播放器和同屏的 DOM 快捷键仍按物理 `code` 导航。新增从两个实际生产监听器 AST 提取的十七项测试，包含与上述参考函数的差分；旧实现 **3/17、14 失败**（`rhvideo-native-keyboard-red.log`）。现优先使用可识别的语义 key，将空格正常映射到暂停／继续，只有没有语义信息才回退 code；数字小键盘的数字及重映射的普通键不能误当 Home／End／箭头。保留收藏父层定位、非队列限制、编辑框、Delete 修饰键／重复和同屏输入实例边界。修复后 **17/17**；全套共享检查 **950/950、零失败／跳过**（`rhvideo-native-semantic-shortcuts-node.log`）。

新 Windows 编译 **2 分 14 秒成功**（`rhvideo-native-semantic-keyboard-build.log`）；独立快照 `rhvideo-native-semantics-runtime-c9fd7f1fddfa40b4bc5cf052e951bff9/` 的 EXE **`eb9ac0f8a950043a940bf7aa1bc5e2558ea2aad7bd64b497d4f3eb31a8ba7c87`**，app-local 3.0.24 清单重新验证。新增实际窗口用例向打包页面派发语义 DOM 键事件，随后核对队列／同屏首尾源身份和真实解码帧、数字不误跳及 UI/API 契约；它不是物理键盘输入试验，不能冒充 SendInput。最初终止失败的 `rhvideo-native-semantic-keyboard-window.log` 实际已通过播放器首尾，但夹具仍用默认四视频图库却断言三组，得到 **2≠3**；失败源码／回执保留于 `rhfiles-e2e-iV2yW5/`。显式提供六视频／每视频一帧并加严总数断言后，本例完整通过：`rhfiles-e2e-ThXJyC/native-dom-navigation.json` 确认播放器 **5→0**、同屏 **2→0**，分别显示实际 `video-5`／`video-0` 和 **4,5→0,1** 的解码帧；未修改分组算法或放宽首尾断言。

既有 CB26 程序的最新完整 Windows 轮次已终止 **107/109、2 失败、零跳过，30 分 25 秒**：冻结目录 `rhvideo-semantic-navigation-full-e108d555765145dfa1d65915d7087de6/` 的日志 `test-artifacts/rhvideo-semantic-navigation-full-windows.log`／回执 `rhvideo-windows-iaWeCF/receipt.json`。两个失败为缩略图就绪、原生 MP4 实时推进；后者原二十五秒预算内一直 **1 个解码帧／0 呈现帧／0 音频块／位置 0**。之前的 End／条带请求归属／缩略图重排用例均通过，但不能抵消这两项失败。终止后逐项回核 **1124** 文件、**14** 参考模块和 EXE `cb26dc18…8ed6f7`，均未变（`post-run-fingerprints.json`）。它在两个 DOM 入口修复之前已开始，**不包含新语义键用例／EB9A 程序**，不将该失败整轮改写为绿色。

原两个超时位置现在只在既有断言失败后补取本进程的真实窗口焦点／可见性、图片完成／几何、匿名 Resource Timing、服务端传输完成和实际 native BMP；不重试／聚焦／继续播放，也不延长原就绪预算。同一 EB9A 的新增键盘加原两项场景定向 **3/3、零跳过，2 分 26 秒**（`rhvideo-native-semantic-keyboard-fixture-fixed.log`），包含原实际四格、预载、定位、返回、图片和 HTTP 权限断言。**图片／播放实现未改；该次通过不能证明间歇超时已修复**，新增失败取证在这次通过中未触发，不能虚构失败现场窗口数据。

Android 新对照只使用已安装的 API 36 镜像，另建自有 **`emulator-5590 / RHFilesRhVideoQA20261030Api36`**，没有重置／停止已有 AVD 或改变系统驱动／音频服务。镜像 Android **16 / API 36**，指纹 `google/sdk_gphone64_x86_64/emu64xa:16/BE2A.250530.026.D1/13818094:user/release-keys`；x86_64，1080×2400／420 DPI，WebView **133.0.6943.137**，原 emulator **36.1.9.0**、WHPX／host-GPU、6 核／6144 MiB。四个准确 AVD 名加入同一准入白名单，物理设备、相似后缀名称继续拒绝；相关 **21/21** 检查通过。

新 AVD 首次启动约十分钟后才完成；**尚未安装 RHFiles 就出现 system／System UI 无响应弹窗**。首次 grid 命令在安装前被现有门禁拒绝（`rhvideo-grid-api36-control.log`），不是 RHFiles 同屏解码失败，也没有跳过门禁。已分别在两个实际系统弹窗选择“等待”，未关闭／重启系统进程，截图 `rhvideo-api36-boot-screen.png`、`rhvideo-api36-ui-dialog.png` 保留。弹窗消失后的同一 **88D4 主包／4B37 探针**均实际安装并逐字节核对；`rhvideo-grid-api36-after-boot.log`／`rhvideo-android-grid-1793353746021-release/` 已终止失败，停在 `rhvideo.category` 的 JavaScript 求值，**没有走到 grid.open 或同屏时钟断言**。随后原版对照也在主 Activity 启动的 ADB 等待超时（`rhvideo-reference-grid-api36.log`、`rhvideo-android-reference-clock-bMNWYw/receipt.json`，零参考 HTTP 请求），尚未加载原版，不把它算成原版解码失败。

### 同一 API 34 的真实参考页面对照

新增 `rhvideo-android-reference-clock.mjs` 只在准确自有 AVD、已安装 APK 字节相符、没有已有 RHFiles／stagefright 播放或错误弹窗时执行；不安装 APK、不改音频／codec／驱动／服务。不改变参考的分组、取流和播放函数，实际运行其 HTML，使用同一 **360×640 / H.264 / AAC / 20 秒**文件 **`98c8699e…c24bc`**、三路非静音 **20%** 音量、正常速度，观察 `requestVideoFrameCallback` 和原始时间，不以轮询请求驱动播放，也不是产品网页后备路径。十九项准入／判定测试拒绝少流、换输入、静音、低速、少帧及超时；全套共享检查 **969/969、零失败／跳过**（`rhvideo-reference-control-node.log`）。

在既有 host-GPU **5588** 上、上述全部 Windows／API 36 运行终止后，该对照实际到达三路就绪，但五秒时钟失败（`rhvideo-reference-grid-host-api34.log`、`rhvideo-android-reference-clock-U2wyv2/receipt.json`）。原始 **5181 ms** 内三路位置仅增加 **953／940／1310 ms**，实际呈现帧 **2／3／5**；三路均非暂停／非静音、20% 音量、1×、无媒体错误、原尺寸，输入身份没有改变。全部 **25** 个服务端响应完成、零错误／丢弃，服务器 finish 仍不代表客户端解码。实际原版三格画面已查看（`android-o6GAlR/reference-grid-clock.png`），源内烧录时间也与低呈现时间一致；现场 AudioFlinger 含本次 PID **16843** 的活动 track **106**。这支持“迟滞不只出现在 RHFiles 的 Media3 集成中”，**不证明唯一平台根因、原生实现无额外开销或 Android 验收已通过**。

下一对照已准备独立新版 emulator，而不是重启已有 AVD：官方 [更新记录](https://developer.android.com/studio/releases/emulator) 列出旧 36.1.9 之后的 Intel GPU／OpenGL 资源修复，不能直接当成本次根因。从 [官方 SDK 元数据](https://dl.google.com/android/repository/repository2-3.xml) 核对稳定 **37.2.13**、Windows 归档 `emulator-windows_x64-16740729.zip`、**455344678** 字节及 SHA-1 **`4d7268aa7787c640ad892844e6c9a5f159e91ad3`** 后，独立目录 `emulator-37.2.13-d437b07ddaf04dbcbb5f8367508f7b2c/` 下载／校验／路径和符号链接检查／解压均成功；实际归档 SHA-256 **`625276a1d3ac6b15d00f8aad5e233e7dc3a7cb71435f97d64e3be298399e171d`**。`-version` 确认 **37.2.13.0 / build 16740729**，`source.properties` 相符；准入记录 `admission.json` 保存。未更新全局 SDK，也尚未用这个副本创建／启动 AVD，不能称新环境已通过播放。

最终共享检查仍为 **969/969、零失败／跳过**（`rhvideo-reference-control-final-node.log`）；上述定向三例与参考对照不替代完整 Windows 失败或 Android 同屏／生命周期、同性能和正式发行验收。

本节未改变媒体质量、内核、音频输出参数或原生进度／重试逻辑；未替换正式 Windows 安装、操作实体手机或发包。Android 同屏／生命周期、同质量性能与完整发行验收仍未完成。

## 2026-10-30 Home／End 语义导航与原生输入验收（继续验收，未发包）

将上一节 End 失败分成两条证据，而不是把未收到的 CDP 按键直接算成跳转函数有错。A196 的定向条带／放映仍为 **17/18**；失败时 DOM／Win32 焦点正常，但两个页面都未收到 CDP 键事件。随后用只接受 Home／End 的隔离 Windows 调试适配器，实际旧程序 **`bb3a0566ea4b6bcfa92ad6d845478e8cd8643336fee5df5f6baca1230f4a5934`** 收到系统 End 的 down/up，`key="End"`、`code=""`，依然停在索引 0（`rhvideo-slideshow-windows-keys.log`、`rhfiles-e2e-rz4giF/slideshow-end-failure.json`）。这是与“事件没有送达”不同的产品差异：参考 `favshowKeyHandler` 使用语义 key，而本端只识别物理 code。

新增从实际生产源码 AST 提取键盘监听器的十三项测试，覆盖普通／空／Unidentified／数字小键盘 code、NumLock 数字不误作导航、编辑和确认框、修饰键、旧 code-only 输入及原有按物理位置配置的快捷键；其中直接执行当前参考的 `favshowKeyHandler` 作差分。修改前 **5/13、8 失败**（`rhvideo-semantic-navigation-red.log`），修改后与输入准入用例合计 **15/15**（`rhvideo-semantic-navigation-unit-green.log`）。Home／End 现优先使用可识别的语义 key，无语义信息才沿用 code，其他自定义物理快捷键不变；它们仍调用同一 `viewer.seek` 结构化动作，不直接修改位置或伪造成功。

物理输入验收改用 Windows 输入链路；CDP 控制保留为显式 `RHFILES_QA_SLIDESHOW_KEYS=cdp` 对照，不在失败后自动换路重发。新适配器仅 Windows **debug**／显式 QA 环境存在，固定本进程媒体库窗口和 Home／End 两键，验证真实前台／输入焦点、拒绝按下的修饰键、拒绝任意键／编码／扫描码；不替发送动作抢焦点。分别发送虚拟键和映射出的扩展扫描码；一次提交不完整时最多补一条 KEYUP，不重按。负例的固定主窗口切换只在本进程已拥有前台时可用，并只在全部正向业务验收后执行；未增加正式 Tauri `allow-set-focus` 权限或任意窗口输入接口。

最终隔离 Windows 快照 `rhvideo-navigation-scan-runtime-8739a7ded43f4936adba873654c8ac53/` 的 EXE **`cb26dc181d553cda69f4daa252cbbf2c012fdbbe9abd66eeb40e4403408ed6f7`**，app-local 3.0.24 不变。实际定向 **1/1、零跳过**（`rhvideo-navigation-native-scan-verified.log`、`rhfiles-e2e-37FICZ/slideshow-keyboard.json`）：虚拟键的四个事件 code 确为空，扫描码的四个事件 code 分别为 Home／End，两种方式均真正跳到末图／首图并完成解码；End 后保持末图，主文件浏览器收到零键。非法键／编码、媒体库不存在、切到本进程主窗口后的发键请求均被拒绝，主窗口仍收到零键。原范围控件、UI 接口契约等断言保留，不调用导航 API 代替发键，也不在发键前点击／抢焦点制造成功。

过程中的 `rhvideo-semantic-navigation-native-green.log`（导航已正确，但旧测试仍按 code 验证）、`rhvideo-semantic-navigation-native-verified.log`（额外切窗口被正式权限拒绝）和 `rhvideo-semantic-navigation-native-guard-verified.log`（新建的另一窗口未取得焦点）均保留失败。它们不是完整通过，也没有放宽正式权限、删掉焦点负例或把仍失败的旧整轮覆写为绿色。

最终共享检查 **933/933、零失败／跳过**（`rhvideo-semantic-navigation-final-node.log`），全部 RHVideo Rust **69/69、零忽略**（`rhvideo-semantic-navigation-rust-all.log`）；输入／焦点测试适配器的三项静态准入包含在其中，但静态检查不替代上述真实发键验收。共享 Home／End 变更也已重组 Android APK（短路径 QA 的 `rhvideo-semantic-navigation-apk-build.log` **1 分 31 秒成功**，未重编 JNI），快照 `rhvideo-semantic-navigation-apk-fb79498306194b698abe00730928a60b/` 的主包 **`88d46c8ca91bf3f9c80b11c55dd0349a74887f2092ad5e28cbb0d0b4aee18699`**、探针仍为 **`4b372563…bc5ac`**。新 APK 的实际运行结果另记，不把前一 ED3 包的条带结果套到它。

同一最终程序的 Windows 条带／放映整组现已终止 **18/18、零失败／跳过，2 分 18 秒**（`rhvideo-semantic-navigation-window-suite.log`），包括真实系统按键的两种编码及完整焦点负例，不是仅重跑一例后覆盖旧结果；原 **108/109** 的完整整轮失败仍保留。Android 同屏实时推进、生命周期、Windows 同质量启动性能及其余完整目标没有因此完成，未发正式包或替换用户安装。

`54c9ddd`／`7c90730` 已推送两个开发远端。随后先确认全部 Windows 测试／Node／Rust／构建均终止，三台自有 AVD 均无 RHFiles／stagefright 进程，本机仅有未操作的正式 RHFiles PID 45696，再在 host-GPU AVD 独立安装上述 **88D4 主包／4B37 探针**并核对字节。默认三路 **grid 仍失败**：`rhvideo-grid-quiet-host-final.log`／`rhvideo-android-grid-1793346207437-release/`。原三十秒就绪门槛下，位置分别 **2877／3012／0 ms**、实际帧 **41／53／1**；都已有 20000 ms 缓冲、20% 非静音音量、选中的音视频轨、零加载错误。不是因为没有运行到测试，也没有放宽门槛后才通过。

本次 **59** 条服务器响应均完成／零 transport error／零丢弃，首字节约 **533–796 ms**；服务端 finish 不等于客户端已经解码，不能据此宣称网络或代码无问题。失败现场确已捕获 PID **15982** 的 AudioFlinger：两轨实际消费，第三轨 session **1729**／track **103** 仍填充，`Server=0`、`FrmRdy=11264`／`FrmCnt=24000`、零 underrun，48000 Hz。第三格 AAC 输出只有 12 个 buffer，前两格为 141／146；这只进一步定位到供给／启动阶段，不是根因定论。此次已排除了“只有并行 Windows 测试负载才会发生”的说法，原先独立系统 AAC 迟滞和 PCM 可推进的反例继续保留；后续需要独立环境／平台解码对照，不盲调应用参数或反复重跑同一失败。

## 2026-10-30 条带星标对齐与旋转后的真实像素（继续验收，未发包）

上一节的 `rhvideo-strip-consumer-frozen-6063e480e2834d73b0d7ba85a29d6e44/` 已终止：**108/109、1 失败、零跳过，25 分 27 秒**，回执 `rhvideo-windows-EIyIbQ/receipt.json`；冻结 **1120** 文件、**14** 参考文件及 9BF0 程序再次逐项核对，均未变。本轮图片失败／延迟卡片两项通过，唯一失败为收藏放映的实际 End 键：最初 DOM／Win32 均拥有输入焦点，发键后两个 RHFiles 窗口均无焦点、没有收到键，最终仍在索引 0。未证明是放映跳转函数失败，也未查明失焦来源；保留整轮失败，不以一次后续通过算作修复。测试新增同步按键／focus、blur 等记录及 JSON 回执，去掉可能携带媒体通道的 outerHTML；不强制抢回焦点、不换成模拟焦点、不放宽原断言。

在另一现有自有 `emulator-5586 / RHFilesRhVideoQA20261030Audio`（启动参数 `swiftshader_indirect`、无在途播放器）运行相同 C951 主包／A874 探针的图片对照，`rhvideo-strip-pixels-software-control.log`／`rhvideo-android-strip-1793341815055-release/` **实际失败**。失败截图清楚显示两行完整图片，绿色采样却为 `0c541a`，正落在收藏按钮上，不是没有绘制图片。没有因其为软件渲染就当作目标环境通过。

同一截图还确认了一个产品偏差：参考 `.pic-strip-item .fav-star` 默认透明且不拦截点击，选中才显示；本端每张图都常驻星标，在窄横屏中挡住大量画面。共享 CSS 现按选中显示，另外保留 `:focus-within` 的键盘访问；未删收藏按钮、源身份保护或 API。实际条带测试新增未选择时星标不遮挡／不拦截的断言，原物理点击选择 → 点击星标 → 核对一次正确服务器写入的测试仍保留，并校验真正打包的 CSS 指纹。

探针几何改为同一份只读测试 APK asset：对实际图片内容／tile／行／视口求交，再减去控件及两像素边缘，保持每行四个真实源色采样；不隐藏控件、不改截图、不放宽 RGB 颜色。额外覆盖遮挡、整图被遮挡的负例及超大裁片只能看到一个源象限的情况。宿主在访问设备前核对测试 APK 内这份几何的 SHA-256，并仍要求三条本次 instrumentation 像素通过步骤，旧探针／旧截图不能通过。共享检查 **917/917、零跳过**（`rhvideo-strip-star-occlusion-node.log`）。

Windows 只因共享界面变更重编，**1 分 03 秒成功**；快照 `rhvideo-strip-star-runtime-e3301cb0da904b4a9b96305515aa4540/` 的 EXE **`a1961cf5b27d610fb28e3c5a84eba03f3156e7cb39e9cefd3fca4c6b7488d057`**，app-local 3.0.24 保留。条带／放映实际窗口 **17/18、1 失败、零跳过**（`rhvideo-strip-star-slideshow-window.log`）：全部十四项条带通过，包括新的 CSS 指纹／星标遮挡断言及原实际收藏写入。仍失败的是 End，新的同步回执 `rhfiles-e2e-vC2iyO/slideshow-end-failure.json` 在失败时也保持 DOM／Win32 输入焦点，没有失焦或按键事件。因此不能将此重复失败简单归因于外部失焦；也不能把上述旧程序整轮或新条带通过写成全部窗口验收已绿。

Android 增量组包 **2 分 11 秒成功**（短路径 QA 的 `rhvideo-strip-occlusion-apk-build.log`），仅共享 CSS／测试探针和资源变化，没有重编未改动的两套 JNI，也没有冒记新的 JVM 全套。快照 `rhvideo-strip-occlusion-runtime-075cf0cfc812438682d21cb9f4eb316e/` 保存主包 **`ed3d9442911bd501b553208d91faaedbebb004cc9b5954d33578d13399137972`**、探针 **`4b372563254a31bcae405e79be81f4a9054df2e12cd015ce0c2ed438f30bc5ac`**、精确测试源码／几何和 mapping；几何 SHA-256 **`d8fd7d0473b7587e4651b89103c6008006b5369b0276e84ac2e9472e6c9be9ce`**。

等 Windows 原生测试／构建结束后，使用同一 `emulator-5588 / RHFilesRhVideoQA20261030HostGpu`、默认参数、逐字节核对安装，完整 **strip 通过**（`rhvideo-strip-pixels-host-isolated.log`／`rhvideo-android-strip-1793343016770-release/`）。旋转前／横屏／旋回竖屏两行真实源色全部通过，等待约 **1042／710／543 ms**；这是功能就绪观察，不是启动性能基准。还验证真实触摸、收藏、放大、两行联动、保存／恢复实际 ID 顺序与位置、一次性标记提交及旧 viewer 隔离；横竖屏截图已查看。原 host-GPU 的间歇 JavaScript／native 帧调度超时仍保留，不能仅因本次独立运行通过认定星标 CSS 就修好了该停顿或证明唯一环境根因。

普通产品未改变音频／codec／compositor、分辨率、格数或等待门槛；未重启任何 AVD／服务、替换正式 Windows 实例、操作实体手机或发包。完整性能、Android 同屏／生命周期及整体验收仍未完成。

## 2026-10-30 整轮终态、图片请求归属与独立音频对照（继续验收，未发包）

前节冻结的 `rhvideo-task-image-frozen-ee0148824b7848b080b69786694f26ca/` 已有终态：**107/108、1 失败、零跳过，25 分 57 秒**，回执 `rhvideo-windows-tQvmC1/receipt.json`。本次又逐项核对 **1120** 个冻结文件、**14** 个参考文件及 EXE `9bf04e51e836fa8f0ce567eedab9c2cc8fb0b2c71173e9cba586b0be93395b1f`，全部与运行前清单一致。任务详情滚动及两项真实分段 PNG 用例均通过；唯一失败转为条带图片错误测试的请求计数 **1 → 2**。不能将前节 7 项通过写成完整验收已绿。

新增只读的图片错误事件／Resource Timing 与服务端 requestIndex 时序，不记录媒体通道 URL、凭据或响应正文。一次独立观察 `rhfiles-e2e-PaPUtL/strip-image-timing.json` 分别捕获卡片与条带错误：约 **2548／2623 ms**，请求开始约 **2529／2612 ms**，缓存布局重建后不再新增请求。更重要的是新增受控反例：仅暂时隐藏后台卡片，保留真实浏览器 lazy 图片／HTTP；条带先失败时请求为 1，随后显示卡片才变为 2，再重建条带仍为 2（`rhfiles-e2e-wUc9wq/delayed-card-vs-strip.json`）。这证明全局按路径计数不能区分后台卡片与条带消费者；原失败没有保存这一归属的时序，不能事后声称已确认其第二个请求的具体来源。

原测试现在先等待既有卡片请求真正失败，再打开独立条带；增加恰为一个卡片请求、一个条带请求的断言，保留后续逐帧／布局重建零新增请求和实际可见失败提示的原断言。**未修改产品的图片加载代码**。完整条带实际窗口回归 **14/14**（`rhvideo-strip-consumer-regression.log`）；追加严格初始计数后的两项实际窗口回归 **2/2**（`rhvideo-strip-consumer-final-targeted.log`），均零跳过。它们不是原整轮失败已被覆盖或新整轮完整通过的证明。

Android 同一主包 `c9512f55064e412fb757d243bdbd8c27d6039261035cddbd64e98b1525503067` 与探针 `8adf5531d127e638ecbd21383abe21206915f8521cd80518b45496634b6145af` 的完整默认同屏仍失败：`rhvideo-datasource-full-grid-native.log`／`rhvideo-android-grid-1793338598304-release/`。原 **30 秒**就绪预算下，一格位置 0／1 帧，另两格约 1947／2096 ms、22／30 帧；三格均有选中的音视频轨、bufferedPosition=20000、无加载错误。对应 AudioFlinger 一轨仍填充、其余轨断供。没有静音、减少格数、改 codec／compositor 或放宽原门槛，不能把它当作播放通过。

将独立 PCM 诊断复用到精确准入的 host-GPU 自有 AVD，补充准入测试及宿主总耗时；不安装 APK，不停止其他播放，不改全局音频／服务。`rhvideo-host-gpu-platform-pcm.log`／`rhvideo-pcm-clock-8Kg739/receipt.json` 的单轨 **5023 ms → 4760 ms**、三轨 **5299 ms → 4941／4896／4851 ms** 音频，均零 underrun。它是 shell UID 2000、持续预供给的无声 PCM／默认增益，不等同于 RHFiles UID／Media3、AAC 解码、同时视频或 20% 增益的验收。

相同 AVD、相同 AAC/H264 源字节 `98c8699e…c24bc` 的独立系统播放器仍迟滞：`rhvideo-system-audio-vaMqKr/receipt.json` 的实际音频消费 **2473 ms**，墙钟范围 **5101–5882 ms**，速率 **0.420–0.485**；30 秒 guest 预算终止 code 124，并确认进程已退出。此前一次 boot 属性读取超时的尝试未创建播放器／回执，原失败日志 `rhvideo-host-gpu-system-aac-paired.log` 保留。PCM 可以前进、AAC 路径迟滞使排查范围更明确，但尚不能认定唯一根因，不能据此改产品时钟或声称音频输出整体故障。

共享检查 **908/908、零失败／跳过**（`rhvideo-strip-audio-shared-node.log`）。同一 Android 包的完整条带业务流程也终止通过（`rhvideo-strip-current-android.log`／`rhvideo-android-strip-1793340438738-release/`），放大图真实四块像素已核对；但人工查看旋转后截图发现图片区空白，而原门禁只检查重排尺寸，未证明当时两行图像都已呈现。现继续补旋转前／横屏／旋回后的真实截图像素门禁，不能以流程通过代替这一视觉验收。Windows 首帧、Android 同屏／生命周期及完整目标均未完成；未发包、未替换正式实例或操作真机。

加严后的 Android 探针逐行选择真正可见的图片内容，与 tile／行／视口求交，分别处理 contain 留白及超长图切片，再按实际屏幕坐标核对红绿蓝黄源像素；旋转前、横屏和旋回后都必须通过。新增四项测试从实际 Java 中提取同一几何表达式，验证留白、切片、两行独立可见项及未解码／缺图不能通过；这四项本身不是设备视觉证明。共享检查 **912/912、零跳过**（`rhvideo-strip-pixels-shared-node.log`）。

首版新探针增量构建 **1 分 33 秒成功**，仅重编测试 APK，不重编主包／JNI；快照 `rhvideo-strip-pixels-probe-9fa6827d6cc3476d824f6f4a8bb5ee8c/` 保留主包 C951、探针 **`bfd2c0d1b6adc5804214260d2bd55aa0e9810847136d12faf4538446b413986f`** 和精确探针源码。实际安装字节逐项一致，`rhvideo-strip-pixels-current-android.log`／`rhvideo-android-strip-1793340991951-release/` **终止失败**：旋转前两行的八个源色采样全部通过，用时 **1625 ms**，实际截图已查看；随后旋转的 JavaScript 求值等待 **15 秒**超时，未完成横屏／旋回后的像素检查。补取的旋转前 PNG／几何 JSON 的设备写入时间与本次 PID 14802 的 native-logcat 记录一致，不采用旧照片代替。

失败现场主线程在 WebView `ExternalBeginFrameSourceAndroid.doFrame` 的 native 调度中，系统窗口／UI 线程也有停顿，尚无唯一根因结论。本轮与新 Windows 原生整套验收并行，存在共享 GPU／宿主负载的干扰可能，不能当作已隔离的稳定性能对照；下一次完整旋转验证须等 Windows 终止后独立运行，不增加原等待预算、不重启 AVD／音频／网络。后续将像素通过记录改成 instrumentation 的结构化步骤，并要求三条本次通过记录，旧探针或残留截图不能通过新版宿主门禁；改动后四项探针几何／准入测试再次通过。

带结构化步骤的新探针另经 **57 秒**增量编译成功（短路径 QA 的 `rhvideo-strip-pixels-guard-probe-build.log`）；快照 `rhvideo-strip-pixels-guard-ee7af518bac74321b0ecad7a51f86550/` 的主包仍为 C951，探针 **`a8749ae92cea55d0418351da80bb809d8f07a3ef7a94484a893d54bcb0cd14fc`**，精确测试源码 SHA-256 **`41b776066eb2891e5f0fcd644ad4f10fca92e7581ac967005ef0b0d43435947f`**。这是为独立后续验证准备的探针，不是已安装／通过的新版主包或新的 JVM 全套结果。

新 Windows 整套已在 `rhvideo-strip-consumer-frozen-6063e480e2834d73b0d7ba85a29d6e44/` 启动：冻结 **1120** 个源码／测试文件、同一 9BF0 程序及 app-local 3.0.24，十九个文件含新增的延迟卡片反例（其 `test-artifacts/rhvideo-strip-consumer-full-windows.log`）。该运行尚未终止；不以截至目前的子项通过宣称整套成功，也不因观察超时启动替代运行。

## 2026-10-30 Android 可中断取流及任务缩略图布局（继续验收，未发包）

在前节账户边界修复后，又用真实 MockWebServer 复现两个 Android DataSource 问题（`rhvideo-datasource-contract-red.log`／`rhvideo-datasource-contract-red-results/`，**2/2 失败**）：Media3 loader 在等待响应头时被中断，仍等到网络读取超时；精确等于资源长度的 EOF 探测则被当成普通 HTTP 416 错误。这里不是用慢网猜测播放卡顿的唯一根因。

参照固定 [Media3 1.11.1 OkHttpDataSource](https://raw.githubusercontent.com/androidx/media/1.11.1/libraries/datasource_okhttp/src/main/java/androidx/media3/datasource/okhttp/OkHttpDataSource.java) 的中断等待及精确 EOF 语义，只将原生视频的响应头等待改成可中断等待：中断会取消原 Call，不重发请求；迟到的未消费响应关闭。图片／元数据仍走原路径，未改变解码器、音轨、缓冲或画质。416 只在经过有界数字／溢出校验的总长恰等于当前读取位置时成为空输入，不返回错误正文；显式请求长度仍读立即 EOF。新增五项用例覆盖这两个问题、显式长度、错误／非法范围及预先中断时零 GET。

短路径 QA 的 `rhvideo-datasource-contract-full-build.log` **6 分 42 秒成功，477/477 JVM、72 XML、零失败／错误／跳过**；重编 Kotlin／R8，不重编未修改的两套 JNI。一次遗漏 ABI 过滤的较早 APK 被既有安装前门禁拒绝（`rhvideo-revoked-account-apk-single.log`，缺少 32 位 RHFiles 库），未安装或绕过校验。之后明确使用 arm64／x86_64，与已编译 JNI 匹配。有效快照 `rhvideo-datasource-runtime-2522910851464a7d8b034df8c0a9c2cd/` 的主包 **`d37ec4877d6f5cd2da8e02a0a810041f0e48e0592503be37d4317c946543b55f`**、探针 **`8adf5531d127e638ecbd21383abe21206915f8521cd80518b45496634b6145af`** 已逐字节核对安装到自有 `emulator-5588`。完整 **Single 通过**（`rhvideo-datasource-single-native.log`、`rhvideo-android-single-1793337290515-release/`），包括真实原生播放／速度菜单、父层与各子身份、账户／模式隔离、图片内容探测／HTML 拒绝和收藏放映；已查看实际中文速度菜单与画面。它不证明 Android 同屏持续速度已达标。

Windows 前节被冻结的 B261 程序整轮终态为 **105/106、1 失败、零跳过，26 分 29 秒**，不是全绿（`rhvideo-range-frozen-fe06684c962847eba10c5db919b8a153/test-artifacts/rhvideo-range-full-windows.log`，回执 `rhvideo-windows-q8wZQs/`）。1118 个冻结文件、程序与全部参考文件的前后 SHA-256 再次核对未变，唯一失败是任务详情刷新前后 scrollTop **393 → 321**。旧实现随后三次独立复测均通过（`rhvideo-task-center-reading-{1,2,3}.log`），**不能据此当作修复**。

新增受控真实 PNG 分段响应，分别延迟响应头与 IEND，实际观测图片已取得 800×500 尺寸、但尚未触发 load 的阶段；没有伪造图片尺寸或改浏览器事件。旧程序稳定复现：缩略图高度 **91 → 203.5 → 131.5 px**，scrollTop **280 → 393 → 321**（`rhvideo-task-image-layout-red.log`、`rhfiles-e2e-TEi0BS/task-thumbnail-layout.json`）。图片取得尺寸后与仍显示的 **72 px** 占位块各占一行，load 隐藏占位块又移除一行；浏览器当时实际上在补偿正文位置，仅有半像素舍入差，因此不是详情节点被重建或选区丢失。原测试现在仅增加失败布局／截图诊断，未放宽断言。

将任务图片／占位图叠在同一个固定比例框内，保留放大命令、加载／失败反馈和原图片比例，不关闭滚动锚定、不拉伸图片。新 Windows EXE **`9bf04e51e836fa8f0ce567eedab9c2cc8fb0b2c71173e9cba586b0be93395b1f`** 编译 **46 秒成功**，相关实际窗口 **7/7、零跳过**（`rhvideo-task-image-focused.log`），包括原任务中心、单位／状态展示及三项范围／账户回归。新 1100px／412px 两个视口均在三个加载阶段保持 **131.5 px／scrollTop 280**，各步骤坐标完全一致（`rhfiles-e2e-{oNj7DG,97pJ5f}/task-thumbnail-layout.json`）。两种视口的控制流是实打包 WebView2 验证，不冒称 Android 原生设备测试。

同样两份共享界面资源已重新打入 Android QA 包（`rhvideo-task-image-apk-build.log` **1 分 16 秒成功**，本次不另冒计 JVM），主包 **`c9512f55064e412fb757d243bdbd8c27d6039261035cddbd64e98b1525503067`**、相同探针及 mapping 保存在 `rhvideo-task-image-apk-5518e6f80bde4f63a906152c9fd5a347/`。同一自有 AVD 的完整 **task-center 通过**（`rhvideo-task-image-android-center.log`、`rhvideo-android-task-center-1793337829039-release/`），包括列表／详情、单位、未知进度、筛选、保留阅读节点和三个实际自动读取失败后的显式恢复；安装包字节及全部资源逐项校验，实际缩略图截图已查看。这是受控任务记录的真实 APK 流程，不是实际编码性能或新包完整 Single 的替代证明。

最终共享检查 **907/907、零失败／跳过**（`rhvideo-task-image-final-node.log`）。新的完整 Windows 回归仍须使用这次源码／测试／程序重新冻结运行；不能把 7 项通过改写为前一整轮全绿。Windows 同质量首帧、Android 完整同屏／生命周期及其余整体验收仍未完成，没有正式发布或替换用户安装。

`908cea1`／`9a30408` 已推送两个开发远端。随后确已建立 `rhvideo-task-image-frozen-ee0148824b7848b080b69786694f26ca/`：1120 个源码／测试文件、9BF0 程序、app-local 3.0.24 及 SHA-256 清单，十九个测试文件的完整串行验收已启动（其 `test-artifacts/rhvideo-task-image-full-windows.log`）。这是进行中的运行，不是终态或完整通过；后续须读取同一运行的回执，不因观察超时重启测试。

## 2026-10-30 原生 EOF 元数据和媒体响应的账户边界（继续验收，未发包）

实际 Windows 窗口复现了两个独立问题：上游合法的 HTTP 416 `Content-Range: bytes */长度` 被通用错误处理丢弃；退出账户时已发出的请求仍可能返回旧账户的响应状态／元数据。新增 `rhvideo-range-proxy.test.mjs` 三项真实实例测试，旧冻结程序 `10fe10bc…` 为 **0/3**（`rhvideo-range-proxy-red-all.log`）：长度为 null 而非 `bytes */0`，已注销的挂起范围请求返回 416 而非 401，图片探测中的注销导致连接关闭而非明确的 401。第三项旧结果是 socket 错误，不作为已证明图片正文泄露的证据。

代理现仅在 416 转发经过长度／十进制／溢出校验的资源总长和已知 Accept-Ranges 值，不转发错误正文、Cookie、认证头或其他上游私有字段；保留 no-store。上游响应头到达后、图片前缀探测完成后均重新核对账户 generation，失效则空正文 401。正常媒体流仍逐块校验账户，不缓存整部视频、不更换引擎或解码／画质／音轨／缓冲设置。参考：[RFC 9110 §14.4](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.4)。

重新编译成功（`rhvideo-range-proxy-build.log`），独立快照 EXE SHA-256 **`b261d10360be21073df8e73fd92911682209ffa91b37bf59d82cb894b967927f`**，配套原有 app-local libVLC 3.0.24。相同三项真实窗口测试 **3/3、零跳过**（`rhvideo-range-proxy-green.log`），包括 u64 边界／溢出／带私有文本的非法字段、404 不误带范围长度、退出时两处异步间隙及请求只发送一次。共享检查 **907/907**（`rhvideo-range-proxy-node.log`）、全部 RHVideo Rust **69/69**（`rhvideo-range-proxy-rust-all.log`），均零失败／跳过；不是完整 Windows／Android 功能与性能通过。

在相同 1920×1080 H264/AAC 文件（SHA-256 `4206d583658a64f9cb490339638f0fe67cb4229f21cef1310ceb1d090e775a7e`）、默认硬件输出／默认缓冲、相同观察方法下，交替运行旧／新程序两轮，每轮启动新进程与播放器，媒体库先就绪。旧版都重复一次 EOF 请求，新版均只有一次，正常起点读取随后仍完成。真实显示计数首次观察如下，不是独占机器基准或精确的 compositor 首帧时刻：

| 指标 | 旧版两轮 | 新版两轮 |
|---|---|---|
| 首次显示计数观测 | 4450／4658 ms | 7967／4854 ms |
| 同次 EOF 请求数 | 2／2 | 1／1 |
| 四标记实际像素已出现的上界 | 4502／4731 ms | 8031／4933 ms |

证据为 `rhvideo-range-startup-{old,new}-{1,2}.log` 及各自 `startup-measurement.json`；已查看新版实际四标记画面。新增服务端请求索引／finish 时序仅记录有界元数据，finish 代表交给传输层，**不代表客户端已收到／解码**；首次 206 被后续寻址取代不能直接算传输失败。额外生产端 trace（`rhvideo-range-startup-producer.log`／`rhfiles-e2e-81Blzb/`）记录 codec 约 44 ms、缓冲结束约 82 ms、D3D11 资源约 1014 ms、收到第一张解码画面约 2738 ms；这是启用诊断的一轮，不与普通计时混算或据此推定唯一根因。

因此 EOF 修复有实际协议效果，**没有证明启动性能改善**。已冻结本次 1118 个源码／测试文件及程序到 `rhvideo-range-frozen-fe06684c962847eba10c5db919b8a153/`，完整串行 Windows 回归正在另外执行，终态另记。该 Windows 快照早于下面的 Kotlin 修复，不能拿它证明 Android 包已验证。

Android 实际客户端也存在图片探测之后缺少账户复核、阻塞读取之后缺少复核的问题。新增五项 JVM 回归，在真实 MockWebServer 响应的网络读取边界注销账号：图片 MIME 探测、视频单字节／批量读取、清单单字节／批量读取。用测试内网络拦截器确定触发时刻，不靠 sleep 或给产品加入注入开关；这是客户端网络边界单测，不是 Activity／画面验收。原实现 **5/5 失败**，分别确实返回旧 MIME／长度或旧读取字节（短路径 QA 的 `rhvideo-media-revoke-red.log`、`rhvideo-media-revoke-red-results/`）。现于探测结束和每次阻塞读取返回后复核账户，失效即拒绝返回并向调用方报错，保持无重发。

修改后短路径 QA 的全部 JVM **472/472、71 XML、零失败／错误／跳过**，构建 **3 分 18 秒成功**（`rhvideo-media-revoke-jvm-all.log`）；五个新增用例均实际执行通过。编译前后的客户端源码／手维护 QA 镜像／生成编译输入三者 SHA-256 同为 `440863636dcb68c7909529398370b41abaafaade3926bea764bd34dba2617bd0`。只跑 Kotlin／JVM，未重编 JNI 或生成新 APK，也未操作实体手机。未替换正式安装或发布新包，完整目标保持未完成。

## 2026-10-30 同 UID 本地解码与系统 PCM 对照（继续定位，未发包）

实际参考仓库此时为干净的 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`。新增的本地对照不是替代播放器：仅显式 QA 构建及已开启自动化时可用，只在 MainActivity 中叠加普通 PlayerView，固定一或三路、本应用新建夹具目录及 16 MiB 文件上限。没有 RHVideo HTTP、队列或旋转合成层，不改 codec、缓冲、音频时钟、音量或帧率；每路 1 倍、音量 20、音视频轨选中，同为原 20 秒 H264/AAC 字节。UUID、Activity、路径和真实输入身份防止使用上次运行的回执。

短路径 QA 构建 `rhvideo-local-grid-build.log` **6 分 42 秒成功，467/467 JVM、71 XML、零失败／错误／跳过**。本轮 Rust 内嵌主文件页没变，复用已重新编译的两套 JNI，不称为完整新原生发行构建。快照 `rhvideo-local-grid-runtime-80230bc73b004b0583770788ad1d4a01` 保留实际主包 **`5f053eee761eaee0376b9208ce45fca02c696475a37dbfab00d37c8bf31ac1fb`**、探针 **`8adf5531d127e638ecbd21383abe21206915f8521cd80518b45496634b6145af`** 及 mapping；自有 `emulator-5588` 实际安装字节和 QA 镜像源再次核对一致。

本地 **三路仍失败**（`rhvideo-local-three-native.log`、`rhvideo-local-grid-mkRnnp/`）：三路先真实就绪，暂停 WebView 计时器、五秒不读状态后的实际 **5596 ms** 仅推进 **914／889／932 ms**、新增 **14／16／18 帧**，视频 PTS 增量 **666／1209／875 ms**。同一 helper／APK／音量的一路对照 **也失败**（`rhvideo-local-one-native.log`、`rhvideo-local-grid-0yxjM5/`）：**5112 ms** 仅推进 **3131 ms／60 帧／3416 ms PTS**。没有寻址／重开／关闭音频，也没有放宽原四秒媒体时间、60 帧或五秒观察门槛；失败当时 audio／gfxinfo 已实际捕获。这些不是有效的实时播放通过，更不能只归因于 RHVideo 多路、取流或旋转层。

继续以系统自带 `stagefright -a -o` 读取相同文件，RHFiles 没有运行，另用 `rhvideo-system-audio.mjs` 关联精确 PID／命令行及 AudioFlinger 轨 ID，读实际 PCM 消费帧而非只看整段命令耗时。首轮 `rhvideo-system-audio-PMAVcG` 的起始消费帧为零，混入冷启动，不作为稳定时钟证据。探针随后收紧为先实际消费两秒、且未接近源结尾，才做无中途观察的五秒测量；新增回归明确拒绝零帧／冷启动样本。

收紧后 `rhvideo-system-audio-steady-native.log`／`rhvideo-system-audio-D4MrSU/receipt.json` 仍观测迟滞：PID **12277**、同一轨 **87**、**48000 Hz**，起止消费帧 **106820 → 265960**，即 **3315.42 ms** 音频；计入两次读取的不确定范围，墙钟为 **5101.39–5571.28 ms**，消费速率仅为 **0.595–0.650**。underrun 计数 **93372 → 179032**。这证明迟滞也存在于本测试环境的独立系统音频路径，不证明唯一根因或与 Media3 同 UID／音量的严格性能排名。命令最终被既定 **30 秒** guest 上限终止（code **124**），已确认 guest 进程退出；回执保留失败，不把得到观测值称作系统播放成功。

宿主解析／上下界、旧输入／重置计数拒绝及 QA 准入测试通过；最终全部共享测试 **894/894、零失败／跳过**（`rhvideo-system-audio-final-node.log`）。普通产品仍保留默认音频／codec／compositor，没有根据外部系统迟滞塞入未证实的产品内核参数或静音／降质措施。未重启模拟器、系统音频或网络服务，未操作实体手机或正式 Windows PID 45696。Windows 同质量首帧、Android 完整同屏／生命周期和其余真实业务验收仍未完成，没有发布新包。

随后将主线 `4c0aa5e` 的完整轻按 Ctrl 判定及两轮多选回归合入本开发分支；文档／新增测试的合并冲突保留双方记录和随机属性用例。合入后共享检查 **906/906、零失败／跳过**（`rhvideo-main-selection-integration-node.log`），三个已有脏 schema 的字节未变。这不是新的 Windows 原生整套实测；前述冻结 EXE 的 103 项结果仍只属于当时的源码／程序配对，也没有把主线的未提交 Android／后端改动带入。

## 2026-10-30 手机图片预览工具栏与传输阶段验证（继续验收，未发包）

实际失败截图显示图片预览顶部所有文字操作挤在一起，关闭被挤到下一行。只修改手机适配 CSS：标题单独一行、关闭固定于右上角，操作保留在有间隔／边框的单行横向滚动条内，触摸目标至少 44 CSS px；图片区按剩余高度伸展。不删除命令、不改按钮处理器／语义接口、不影响 Windows 界面或解码器。

新探针检查实际标题／关闭的屏内几何、触摸目标和图片区比例；通过真实输入滑动操作栏，要求 `scrollLeft` 前进、没有 click 事件、同一 previewId／index 保留且关闭仍可命中，没有写入 scrollLeft 或用 `performClick()` 代替手势。专项检查及全部共享回归最终 **885/885、零跳过**（`rhvideo-image-toolbar-final-node.log`）；短路径 QA 增量构建 **3 分 52 秒成功，464/464 JVM、70 XML、零失败／错误／跳过**（`rhvideo-image-toolbar-build.log`）。Rust 内嵌主文件页未改，继续复用本轮已重新编译的两套 JNI，不冒充完整新原生发行构建。

快照 `rhvideo-image-toolbar-b8392ad8bda642949ce097974ec25a30` 保存主 APK **`71743c73eebc95d06109ce94252c45640a34a4bf0a669593ac1861a8e99ffc00`**、探针 **`d8f95905b3715dc351bad2b9c9ba8d1a81d8992373b75c642822440bb2542eed`** 及精确 mapping。自有 `emulator-5588` 安装后逐字节核对，并显式使用 `emulator-host`／默认 audio、codec、compositor。实际工具栏子项通过：视口 **412×867 CSS px**，图片区高 **706 px**，真实横滑前后标题、关闭、目标尺寸及点击隔离均通过；`rhvideo-android-single-1793328817091-release/rhvideo-image-toolbar-{start,end}-qa.png` 已查看。起始截图只有工具栏、图片尚未绘制，**不是图片像素就绪证明**；滑动后的截图才显示完整四块测试色图。该轮随后 **完整 Single 终止成功**（`rhvideo-image-toolbar-direct-single.log`），包括真实内容像素／HTML 拒绝、原生速度菜单的实际勾选、单项父层返回／旧子身份、模式／账户隔离、上下文控件和独立收藏放映；不是只把工具栏子项通过当成整轮通过。

此前旧 APK 加入服务端记录后的 Single **完整通过**（`rhvideo-host-gpu-single-transport.log`、`rhvideo-android-single-1793328075722-release/`）：103 个响应均 `writableFinished=true`、无丢弃，图片服务端 finish 最长约 **24.76 ms**。这一轮使用 ADB reverse，未改产品行为；因此不是此前图片失败已修好或已证明 ADB 是唯一原因。新的直连模式与有界时序是定位工具，不是失败后自动换路重发。

同一新 APK 的 `emulator-host` 完整 **grid 仍失败**（`rhvideo-image-toolbar-direct-grid.log`、`rhvideo-android-grid-1793329100595-release/`）：三格全部位置 0／1 帧，第二格进入 BUFFERING，但都显示 bufferedPosition=20000、音视频轨选中，未改变数量、音频、codec、表面或原三十秒就绪预算。故不能仅按 ADB 转发解释多路首帧停滞，后续继续核对媒体推进／音频启动及实际解码器。完整目标未完成、未发布；正式 Windows PID 45696 和实体手机未动。

随后只在本地候选中调用 Media3 1.11.1 的 [`enablePerStreamMediaProgression(true)`](https://raw.githubusercontent.com/androidx/media/1.11.1/libraries/exoplayer/src/main/java/androidx/media3/exoplayer/ExoPlayer.java)，不改动态调度、缓冲容量、codec／音频启动、分辨率／格数或速率。官方将其标为 experimental 且默认 false；上游短片段的改善报告不能证明它解决本例。候选构建 **4 分 05 秒成功**（短路径 QA 的 `rhvideo-per-stream-candidate-build.log`），保存源码差异／mapping／实际主包 **`a9f730f28ce062daac701affbc93ab9fedbf6ba351efba336b78a68d0665fe08`** 于 `rhvideo-per-stream-candidate-69ed565163874666965de7b436ed08fb`，探针仍为 `d8f95905…`；本次没有另跑完整 JVM，不冒用前一构建的 464 项。

候选在同一自有 AVD、相同直连／素材下 **仍失败**（`rhvideo-per-stream-candidate-native.log`、`rhvideo-android-grid-1793329550269-release/`）：三路这次先进入播放，但原五秒观察实际耗时 **6617 ms**，只推进 **107／128／166 ms**、新增 **2／3／5 帧**，视频 PTS 仅推进 **83／667／667 ms**。恢复 WebView 计时器后的独立 **5351 ms** 对照三路位置及帧增量都为零。59 个服务端响应全部正常交出，无记录丢弃；仍不把服务端 finish 误说成客户端解码完成。该结果不足以采用设置或证明起播差异的因果关系。

已用精确 patch **撤回候选**，核对 `RhVideoGridActivity.kt` 与已提交默认版本无差异；短路径 QA 的两份手写／生成源也恢复。自有 `emulator-5588` 安装前先确认名字／qemu 标识及确实运行该候选包，再一次覆盖恢复主 APK **`71743c73…`**，重新读取实际已安装包 SHA-256 匹配；仅停止自有模拟器的本应用，未重置模拟器或主机服务。候选／失败材料保留，不进入发布包。后续仍需普通本地三路解码对照，而不是以单路通过或采用未证实的内核参数宣告完成。

## 2026-10-30 独立 host-GPU 环境的首个单路计时结果（继续验收，未发包）

新自有 AVD 在 **安装 RHFiles 之前**发生 System UI 与 `system` 两个无响应弹窗，已保存 `rhvideo-host-gpu-startup/` 的窗口、事件日志、截图及实际节点 XML。核对对应窗口后各选择一次“等待”，未关闭／重启系统进程、未重置模拟器；随后实际观察到 `sys.boot_completed=1`、bootanim `stopped`、窗口无 ANR／Error，包管理器仍查不到 RHFiles，才开始安装。启动系统本身出过问题的事实不因后续测试通过而抹去，也不跳过验收前后的错误窗口检查。

`rhvideo-host-gpu-single-clock-native.log` 已终止成功，材料为 `rhvideo-android-single-clock-1793323697610-release/`。实际安装的默认主包仍为 **`9dbe624e…`**、探针 **`2d85c5ce…`**，均逐字节核对；默认音频／codec／compositor 未修改，H.264／AAC 竖屏源 SHA-256 仍为 `98c8699e…`。真实全长进度 **506／506 ms、end=-1**；五秒不中途查询、不定位／重开且暂停 WebView 计时器的区间，实际 **5109 ms 推进 4897 ms、输出 117 个新帧、同一 input**，原门槛通过。日志明确只表示单路时钟诊断通过，不是全产品验收。

这与旧两个自有 AVD 上的失败构成新的环境证据，下一步可执行完整同屏、Single、旋转／生命周期及实际画面回归；不能因此删除旧失败、宣布所有迟滞已修复或仅归因为 GPU。新环境的 userdata 和 GPU 同时不同，普通本地 PlayerView 对照也尚未在这个环境执行。正式 Windows／实体手机未动，未发包；完整还原及性能目标保持未完成。

随后的完整默认 **grid 失败**（`rhvideo-host-gpu-grid-native.log`、`rhvideo-android-grid-1793323913230-release/`）：原三十秒内第一格输出 114 帧、位置 6869 ms；第二／三格都只有 1 帧、位置 0，虽标为 READY／playing、音视频均选中且 bufferedPosition 为 20000 ms。失败时三路 session 分别 1345／1353／1361；实际系统音频快照中后两路尚未 active，仅 2048 PCM 帧待取，第一路有 104 次 underrun。故单路时钟通过并不证明多路正常；这也不等于已经确认唯一根因，未改成只给一格音频、减少数量或放宽等待。

第一轮完整 **Single 也失败**（`rhvideo-host-gpu-single-native.log`、`rhvideo-android-single-1793327816347-release/`）：首次图片打开后，关闭再继续浏览的同一图片仍未解码，实际 IMG `complete=false`／naturalWidth=0。原生 HTTP 诊断在这段有请求头发出却没有响应头完成，也有 adbd flush 超时日志；仅据此不能断言是客户端、服务器或 ADB 的唯一错误。原失败保留，不将下一次通过当作修复。

为区别以上网络阶段，契约夹具增加最多 4096 条、不记录 URL／请求头／正文的服务端响应观察：请求索引、单调开始／finish／close 时间、状态与 `writableFinished`；finish 只表示 Node 已交给传输层，**不表示 Android 已收到／解码**。真实分段响应及客户端主动断开、容量／隐私和独立快照都有测试。宿主保存 `fixture-transport.json`，失败源另存，不改变现有请求／响应或自动重发。另加显式 `RHFILES_QA_FIXTURE_TRANSPORT=emulator-host`，仅将自有模拟器的固定夹具端口经 **10.0.2.2** 访问宿主；默认仍 ADB reverse，两个模式均记录实际地址，只监听宿主 loopback，不准任意地址、不改变网络设置或产品策略。该地址映射依据 [Android 官方模拟器网络说明](https://developer.android.com/studio/run/emulator-networking-address)。相关宿主／探针／夹具策略 **43/43、零跳过**；新探针的构建及直连运行结果仍须另验。

## 2026-10-30 普通视频进度映射修复与本地路径对照（继续定位，未发包）

先用 Robolectric 直接调用原 `PlaybackActivity.rhQueuePosition`，没有复制一份测试公式：新增六项中 **四项红测**（`rhvideo-open-ended-timeline-red.log`、`rhvideo-open-ended-timeline-red.xml`），例如期望 3929 却得到 0、期望 20672 却只有前序时间 17500。默认全长的 `end=-1` 被夹成零跨度是直接原因。现对已知片段继续使用原计划边界；未知终点仅在报告进度时读取已知解码时长，时长也未知时保留已经观察到的位置；不改队列、不加裁剪终点、不定位／重开。API 的物理位置和队列位置共用同一次位置读取，避免两个 getter 时间不同。

六项测试覆盖真实位置、前序累计、已知／未知时长、源时长与目录估计不同、片段边界及真正零长度；假 engine 只允许读 duration，任何 seek／control 均报错。完整增量 QA 构建 **5 分 13 秒成功，464/464 JVM、70 份 XML、零失败／错误／跳过**（短路径 QA 的 `rhvideo-open-ended-timeline-green-build.log`）。这里产品 Kotlin 和探针有变化，Rust 内嵌页面未变，复用本轮先前已重新编译的两套 JNI，不是完整新原生发行构建。

独立快照 `rhvideo-open-ended-timeline-e6440d34365a4fa0ac6c82b507d9de7b` 保存主 APK SHA-256 `9dbe624e56829a413073aab3621e3e15abed237ef0db12b5692e698bee5cf8fe`、探针 `2d85c5ce40964584d306375179060fac649434b746eca4e2b997e07c9473b97f` 和配套 mapping。自有 `emulator-5586` 实际安装核对后，真实接口断言得到 **positionMs=650／queuePositionMs=650／segmentEndMs=-1**（`rhvideo-open-ended-timeline-native.log`、`rhvideo-android-single-clock-1793322676132-release`）；进度修复没有将全长变成截断。该轮持续播放仍 **失败**：**5415 ms** 仅推进 **1184 ms／28 帧**，原五秒门槛没有放宽。这是字段修复的原生证据，不是整个单播放器验收通过或速度问题已修复。

另外新增 `scripts/testing/rhvideo-local-clock.mjs`，只诊断，不安装 APK、不选真机：校验自有 AVD 和已安装 APK 精确字节，将相同 20 秒竖屏 H.264／AAC 夹具推到本应用新建目录，实际调用 `navigation.open`／`files.open`／`native.media.state`；普通 PlayerView 没有 RHVideo 会话或旋转合成层，也没有网络／媒体库取流。观察区间冻结主 WebView、五秒中不读状态，随后一次读取真实时间／帧，未静音／改速／降低画质或重新播放。失败诊断在关闭播放器前捕获，原生成样本保留；只停止自有 AVD 的本应用，不停止系统服务。

修复前的同一默认主 APK `515a5f43…` 在该本地对照 **仍失败**（`rhvideo-local-clock-native-baseline.log`、`rhvideo-local-clock-81zN29/receipt.json`）：**5615.67 ms** 推进 **2537 ms／52 帧**，同一 input、1 倍、音视频轨选中，无错误／抑制，实际音量 100。素材 SHA-256 与前节 RHVideo 单／多路控制完全相同。Main／本地播放器整段累计 89 个界面帧中 84 个 janky；这仍非视频帧时序。两种独立路径都慢，不能只按 RHVideo HTTP、旋转合成层或多路竞争解释，但音量／时钟观测途径等条件并不完全相同，不能当成严格单变量性能排名。

本轮全部共享测试 **879/879、零失败／跳过**（`rhvideo-open-ended-timeline-full-node.log`）；原生探针／宿主／本地对照专项另 **37/37、零跳过**。新增策略检查同一快照位置、未知 end 不被制造为裁剪上界、自有 AVD 精确名称及复制名称拒绝。它们不覆盖上述未通过的持续播放。

为进一步区别测试环境影响，新建 **RHFilesRhVideoQA20261030HostGpu／emulator-5588**，独立数据目录为短路径 QA 的 `test-artifacts/rhvideo-avd-hostgpu-20261030`，不复制旧 userdata、不重启／重置两台现有 AVD，不更新共享 SDK／驱动／Hyper-V 配置。同为 Android 14／x86_64／Pixel 7、1080×2400／420 dpi、启动参数 6 核／6144 MiB、默认音频，显式 `-gpu host`。已确认新进程存活、WHPX operational、实际 OpenGL Renderer 为 **Intel Arc B580**；创建／启动日志为 `rhvideo-host-gpu-{avd-create,emulator-stdout,emulator-stderr}.log`。ADB 已从 offline 进入 device，但 `sys.boot_completed` 仍为空、bootanim 仍 running、provisioned／user_setup 为 0；实际 logcat 在执行系统包 `first-boot` dex2oat，具体 qemu PID **93764**（父进程 **47056**）持续存活并有 CPU 前进。未安装 RHFiles 或运行播放测试，不能将 online、创建成功或 GPU 名称当成环境已健康。新 userdata 和 GPU 同时不同，因此未来结果也不能单独证明 GPU 是唯一原因；两台旧 AVD 的失败继续保留。宿主只增加该精确自有名字的白名单，未放宽到任意 AVD 或手机。

这符合 [Android 官方图形加速说明](https://developer.android.com/studio/run/emulator-acceleration)允许用独立 AVD／命令行选择 host GPU 的方式，但不采用“换环境即可宣称产品已修好”的结论。正式 Windows／实体手机未动，没有发包，完整目标仍未完成。

## 2026-10-30 单视频持续播放及有界系统时序（仍失败，未发包）

单路探针首次构建 **3 分 15 秒成功**，但原生运行在探针自己的 `waitView("PlaybackActivity")` 出错（`rhvideo-single-clock-native.log`、`rhvideo-android-single-clock-1793321016581-release`）：Activity 已经是 PlaybackActivity，该帮助函数却要求其中含有 WebView，纯原生播放器不会满足。这不是有效的播放时钟失败。探针改为在原 **20 秒**上限内核对真实 Activity／精确 ID 和公开原生状态，不再等待不存在的 WebView；不改播放、不延长等待。新增策略防止重新误用该帮助函数，修正探针构建 **50 秒成功**（短路径 QA 的 `rhvideo-single-clock-native-readiness-build.log`）。

两轮都复用已验证默认主 APK `515a5f43…` 及其原 mapping，只换探针；最终探针 SHA-256 为 `c492a4e215c511d06d77877ab4e1b5b289eee78dcf608921af1c3196cf5e61db`，快照 `rhvideo-single-clock-native-ready-10b869f3d67145c0b3f2fb7f5000afb1`。没有将探针重编译称作完整新原生 APK 构建。有效的单路实测 **失败**（`rhvideo-single-clock-native-ready.log`、`rhvideo-android-single-clock-1793321250451-release`）：**5294 ms** 推进 **3172 ms／71 帧**，同一个 input／path，实际 1 倍、非静音、音视频轨选中、默认 compositor／原生层附着、无错误／抑制；没有 EOF 回绕或定位。与前节三路使用相同媒体字节，不能只按三路争用解释；仍不满足原四秒媒体时间门槛。

失败当时 PID **13714** 的 audio／power／display／gfxinfo 均成功捕获，设备 Awake、显示 ON／60 Hz、非 idle。应用整段启动以来共 94 个界面帧，91 个 janky、P95 为 1800 ms；这是**包含启动和 UI 的累计统计，不是原生视频帧时间**，不能直接当作视频 GPU 耗时或唯一根因。线程快照在 `MediaCodec.releaseOutputBuffer`，也不能仅凭一次栈判断其整个区间都卡在同一调用。

因此增加宿主的显式 `RHFILES_QA_PERFETTO=1`，仅准入 `single-clock` 诊断，不进入普通业务验收或产品。只有已校验自有 AVD、真实单路已出帧后才异步启动一次系统自带 Perfetto：**12 秒、16 MiB 环缓冲／32 MiB 文件上限、25 秒命令及 10 秒拉取上限**，采集 sched／binder／gfx／view／audio／video；不重启服务、不记录媒体内容、不阻塞夹具 HTTP、不放宽原有播放断言。相关策略 **41/41、零跳过**（`rhvideo-single-clock-perfetto-host-tests.log`），涵盖错误环境／模式拒绝、采集失败／拉取失败／空文件／超限及成功回执。要求 trace 时，缺失 trace 不能凭普通模式 PASS 蒙混成功。

实际诊断 **仍失败**（`rhvideo-single-clock-perfetto-native.log`、`rhvideo-android-single-clock-1793321493316-release`）：**6034 ms** 推进 **1549 ms／34 帧**。它有采集开销，不能将这组比未采集时更慢的数字直接作为产品回退或根因证明。12 秒轨迹实际取回 **4,336,691 字节**，SHA-256 `b4b8fa9af0c7bba7ea228998ee80f432520c75dbca26266660432a65630cbd21`；捕获回执为 true，没有丢失／overrun／error 统计项。失败断言和两个未通过样本均保留，不能以成功拿到轨迹当作播放通过。

仅在测试材料目录下载 [Perfetto 官方预置工具清单](https://get.perfetto.dev/trace_processor) 中固定的 Windows v59.1 processor，核对 **15,872,000 字节／SHA-256 `3acc5aca1c764541033a82ba3bb0a47524b5c3c0aa194eea8d9a7b0cdb346bdc`** 后离线分析，没有安装或打包进产品。可复用只读查询为 `scripts/testing/rhvideo-playback-trace.sql`，结果 `rhvideo-single-clock-perfetto-analysis.log`。该完整轨迹包含播放及失败结束阶段；PID **14087** 的播放线程 47 次 `releaseOutputBuffer` 总 elapsed 为 **1290.56 ms**，重叠线程状态中睡眠 **821.81 ms**、Runnable **375.82 ms**、实际运行 **92.92 ms**。因此下一步须区分 codec 输出等待、界面绘制及虚拟机调度，不能把所有 elapsed 当作解码 CPU、网络耗时或已确认死锁，更不能盲目修改线程优先级／重启模拟器来取得通过。

加入上述采集及原生就绪修正后，在当前实际 RHVideo 参考源码下，全部共享测试最终 **875/875、零失败／跳过**（`rhvideo-single-clock-perfetto-full-node.log`）；离线 SQL 在实际轨迹执行返回 0。它们不能替代失败的原生持续播放验收。结束后再次核对自有 AVD 名称，仅停止其本应用，没有重置 AVD／音频／主机；正式 Windows PID 45696 仍存活。

另外从有效单路状态发现一项独立接口问题：物理位置已经推进，`queuePositionMs` 却始终为 0；当前计算把普通全长输入的 `segmentEndMs=-1` 当成零长度上界。该时间映射须修复并补测试，但不能通过给全长媒体强制裁剪终点来修。它不是播放变慢的根因结论。此次未改变播放器产品代码、未操作真机／正式安装，没有发包，完整目标保持未完成。

## 2026-10-30 关闭阶段实测与同屏输出对照（继续定位，未发包）

带阶段诊断的默认 APK 构建 **6 分 08 秒成功，458/458 JVM、零失败／错误／跳过**（短路径 QA 的 `rhvideo-library-close-timing-build.log`）。主 APK SHA-256 `515a5f43bde219a1e8ac76b56fac4174b3595e28e458f0514b2ff35b087b2220`、探针 `02236e48eb83c08ae8424c99356a62756322b7803364be5586361e516dae3d10` 在自有正常音频 AVD `emulator-5586` 安装、核对字节，原生 `close-receipt` 此轮通过：语义 Back 完整取回 **4233 ms**，实际 UI 按钮 Back **1858 ms**，真实销毁及重开后旧 key 不重复关闭的后续步骤也完成（`rhvideo-library-close-timing-native.log`）。前轮超过五秒的失败仍保留；加入计时日志后重跑通过**不是延迟问题已修复的证据**。

语义关闭阶段中，桥接接收到后台进入仅 **2 ms**，finish 入队到调用 **308 ms**，finish 调用到开始销毁 **1841 ms**，WebView 实际 `destroy()` **64 ms**，随后发布成功。宿主观察的 `lookupMs` 包括探针的多次 JavaScript 求值及轮询，不是回执存储读取本身耗时。此证据不支持将这次慢关闭归因于 IO 线程池排队或 `WebView.destroy()` 长阻塞；剩余 UI／桥接／转场调度仍需核对。

随后完成同素材、同默认音频和 codec 的 compositor／普通 SurfaceView 对照，均使用真实选中音视频轨、1 倍速及原五秒 **4000 ms／60 帧**门槛，不 seek／静音／降低画质。默认合成层在 **5685 ms** 只推进 **1110／1148／1128 ms**、**22／28／26 帧**（`rhvideo-compositor-surface-control-native.log`）；direct QA 在 **5460 ms** 只推进 **733／733／768 ms**、**16／18／18 帧**（`rhvideo-direct-surface-control-native.log`）。恢复 WebView 计时器后的独立失败对照也仍慢。实际回执分别确认 `surface-compositor`／附着原生层与 `surface-view-direct-probe`／未附着；两次夹具文件 SHA-256 一致，不能将只改输出层解释为有效修复，**不采用 direct 为产品默认值**。

direct 主 APK `52e201344405045a222b07eedcd8e5d82ffad867e1de20c7edb2ac4125b3b96c`／探针 `33a85267e7bab68b71e42a6d54b53d13e165cb775efd197542576fd80dff6834` 及 mapping 保留于独立快照；实验后已在 `emulator-5586` 覆盖恢复上述默认 `515a…／0223…`，并只停止两台自有 AVD 的本应用。没有重置模拟器／音频服务或操作真机。之后只读查看该 AVD 为 Awake、显示 ON／60 Hz、低电量模式 0；这不是失败时刻的电源状态，后续失败将有界异步记录 power／display／应用帧和原音频快照。

新增 `single-clock` 诊断用同一竖屏素材和普通单视频路径区分单路与并发瓶颈，保留实际音频、原生合成层、倍速及五秒输出门槛；它不运行文件写操作、不在观察区间查询／推动播放器，且不能借其他模式的 PASS 或历史截图通过。相关宿主／策略 **35/35、零跳过**，探针编译及实际单路结果仍待执行。首次策略断言误匹配错误消息里的“seek/reset”，已改为检出实际调用形式，未移除“不定位／不重开”的行为约束。

Windows 已重新编译 `bind()` 修正后的 EXE，SHA-256 `10fe10bcbb97e621b05ec1718b0a7b52a797b60a9ec96d2bfea63c720a2f1512`（`rhvideo-bind-awaited-windows-build.log`，**43.75 秒成功**），并与源码／测试一起冻结于 `rhvideo-frozen-6191956-96f55bfb`。完整串行原生验收最终 **103/103、零失败／跳过／取消，23 分 48 秒**（冻结树的 `rhvideo-bind-awaited-full-windows.log`、`rhvideo-windows-AERH1h/receipt.json`），使用应用内 VLC 3.0.24、实际默认硬件输出。receipt 确认退出 0、17 个测试文件、EXE 及 14 个原版模块前后字节一致；不是用正在变化的工作区验收旧 EXE。H.264 1080p／HEVC 4K 实际输出尺寸保持，native open 到首帧仍为 **4122／5124 ms**，不能把功能全绿当成性能已达标。整轮结束、测试进程实际退出后才开始 Android 探针编译；正式 Windows PID 45696 未动。

补齐单路诊断后，以实际 RHVideo `3d6aaeb8…` 明确设置 `RHVIDEO_SOURCE` 的全部共享测试 **869/869、零跳过**（`rhvideo-single-clock-current-reference-node.log`）。之前首次未设置该路径，独立工作树旁没有参考仓库，结果为 **837 通过／32 跳过**（`rhvideo-single-clock-full-node.log`），不将其记作完整参考测试通过。

另查阅上游 [Media3 #3210](https://github.com/androidx/media/issues/3210) 的维护者说明及已提交修正：微小音频 underrun 可能影响 ready 判断，默认 PCM 缓冲已转为固定 500 ms。这里 A/B 现场实际为 **24000 帧／48000 Hz，即 500 ms**，不符合仅凭“旧默认 250 ms”解释问题的前提。[AOSP AudioTrack 源码](https://android.googlesource.com/platform/frameworks/av/+/c4f284266f4efeae20fae84f82d4776266b0adc5/media/libaudioclient/AudioTrack.cpp) 中的时间戳修正日志表示输出管线当时空闲，不提供唯一上游原因。这些是排查依据而非本项目修复证明，未据此盲目改成数秒 PCM 缓冲、换内核或降低画质。完整目标仍未完成，没有发包或替换正式 Windows 安装。

## 2026-10-30 按钮异步结果与 Android 实际关闭超时（验证继续，未发包）

又发现媒体库通用 `bind()` 发起异步操作却不返回 Promise，泛用 `ui.invoke` 可能在操作结束前报告完成。现将正常界面报错订阅与返回值分开：实际点击仍显示 notice，自动化拿到原操作的 Promise／失败，不再被 `.catch(notice)` 转为成功。新增两个直接执行生产 `bind()` 的回归，验证未完成时不提前完成、失败既显示又向接口传递。共享业务 **865/865、零跳过**（`rhvideo-library-close-bind-final-node.log`）；后续计时诊断的相关策略 **17/17** 通过，原门槛和断言保留。

arm64＋x86_64 的完整 Android CLI 构建已返回 **0**，重新构建了内嵌主文件页的 Rust／JNI；探针另构建 **51 秒成功**。完成 CLI 后遗留的空闲 Gradle daemon 占着输出管道，已核对具体 PID／启动时间／空闲栈，只清理本轮自己的该进程，未动 RHFiles、主机或模拟器服务。随后仅更新 RHVideo assets 的重打包 **1 分 20 秒成功**（短路径 QA 的 `rhvideo-library-close-full-android-build.log`、`rhvideo-library-close-probe-build.log`、`rhvideo-library-close-bind-apk-build.log`），复用的是本轮新编译、主页面未再变更的两套 JNI，并非前轮旧库。

主 APK `0b6df848b05b9e732692a3fc86a90cefec0a25cd002500487405b4392ff307e9`／探针 `74cc445d36031d06cbd149867f63d4c9a234537183674cd7100eadd47fb563ff` 在自有 `emulator-5586` 实际安装核对；ZIP 内 `rhvideo-client.js` 也与生产源码逐字节匹配（SHA-256 `22960ef47484683be8ca1bec551c840aa4cb054811c877abd5463a8264ac0380`）。原生 `close-receipt` **失败**（`rhvideo-library-close-native.log`、`rhvideo-android-close-receipt-1793317096573-release`）：主页面确实取回 `rhvideo.back` 的成功终态，`startedAt` 到 `finishedAt` 为 **4377 ms**，但完整取回超过原五秒预算。**不算通过；UI 按钮关闭／旧 key 后续步骤因此未执行。** 实际包／mapping 保留于 `rhvideo-library-close-baseline-bc86d85882df4382a7ca315fe6db9284`。

现补入只在 ADB 自动化开启时记录的原生桥接接收、后台进入、finish 入队／调用、WebView 销毁、Activity 销毁及回执发布阶段；仅静态阶段名和单调时间，无参数／URL／密码，日志失败不改变关闭结果。探针另汇总查询次数和耗时，原五秒门槛不变，不 seek／重开／重复关闭。带诊断的构建仍在运行，尚无定位或修复结论。前节 `b09d4232…` Windows 冻结对早于此次 `bind()` 修正，不能为新按钮语义背书；后续须重新编译并冻结新对再完整验收。没有发布新包，完整目标仍未完成。

## 2026-10-30 Android 页面关闭回执及验收源码隔离（验证继续，未发包）

Android 媒体库的 `close` 原先排队 `finish()` 后，仍向即将销毁的 WebView 回应，生产者可能先消失。现为命令行 `rhvideo.back`／实际 Back 按钮的 `ui.invoke` 保留进程内关闭回执，主文件页及分屏宿主页可经原 `runs.lookup/status/wait` 只读查询。只有媒体清理、WebView 销毁及 `super.onDestroy()` 均完成，且不是配置重建，才确认成功；排队／窗口消失不能代替确认。等待查询在后台，不占用 UI 线程；无操作重发、失败重试或新监听端口。普通子面板／图片 Back 仍先关闭原子层，不提前关闭整库。

存储仅保留有界元信息／指纹 SHA-256、小型结果，不保留原参数、密码、Activity 或磁盘数据；最多 128 个记录／16 个活动请求，淘汰的完成标识在 30 分钟内另保留最多 4096 个防重放墓碑。每次执行还有独立 ticket 版本，旧 ticket 不能完成过期后新建立的同名请求。重复成功只返回原结果，不关闭后来打开的页面；重复失败／仍在处理／已淘汰的请求拒绝再执行。新增九项 JVM 规则测试及只作用于自有模拟器的 `close-receipt` 原生模式，后者须通过真实主界面 RPC 取回语义关闭和 UI 按钮关闭，观察实际 Activity 销毁，并检查旧 key 不关闭新页面；期限保持五秒，**编译／原生结果仍须单独核对**。

随后 Kotlin／JVM 构建 **3 分 59 秒成功，458/458、零失败／错误／跳过**（短路径 QA 的 `rhvideo-library-close-jvm.log`），包含九项回执存储用例及两项真实 View 的 direct／默认隔离用例。一次只读 JVM 栈显示当时在 Robolectric 的加密 provider 初始化，不是回执条件锁死锁；未终止／重启测试进程。它不是压缩 APK 或设备关闭回执已通过的证明。已启动 Tauri 官方 CLI 的 arm64＋x86_64 完整 Android 构建，重新内嵌主页面脚本；其结果及后续探针另记。

共享业务最终 **863/863、零跳过**（`rhvideo-library-close-final-node.log`）。初轮 861 项中 8 项失败于两个旧 mock 缺少 `provideRunLookup` 及 runner 模式夹具未声明新增模式，保留失败日志，补齐实际接口和新模式独立回执检查后重跑；没有给生产代码加入绕过接口的可选分支，也没有删除断言。Android 本轮修改了主文件页的脚本，必须重新构建内嵌资源的 Rust／JNI 库，不能沿用此前仅 Kotlin／RHVideo assets 改动时复用库的验证方式。

前节 EXE `9be25ff8…` 的完整串行 Windows 回归已终止：**90/103 通过、13 失败、零跳过**，21 分 53 秒（`rhvideo-grid-close-blocking-full-windows.log`、`rhvideo-windows-1Lb2m0`）。十三项均在 `rhvideo-client.js` 源码／内嵌资源 SHA-256 一致性断言终止：运行期间修改了安卓共用脚本，测试随后读取的新文件与冻结 EXE 不同。不能把未执行到的业务称为通过，也不放宽或移除一致性断言；后续须将**测试源码与程序一起冻结**，而不是只复制 EXE。原先的存活页暂停／发现故障关闭场景本轮通过，但这不是完整回归全绿。当前没有完整新源码验收或发包结论，正式 Windows 和真机均未操作。

`a5673a5` 已推送 GitHub／Gitee 开发分支。新 Windows dev 构建 **53.72 秒成功**（`rhvideo-library-close-windows-build.log`），EXE SHA-256 `b09d423258334ee86d7c4cc73d133377a9c1be3aef4f3488639d66338cc80465`。已建立独立源码＋测试树 `test-artifacts/rhvideo-frozen-a5673a5-25509988`：Git 快照后，将已跟踪的 `src/`、`scripts/` 按实际工作文件字节复制，保留构建输入的 CRLF；逐一核对关键脚本 SHA-256，再置入真实 EXE／已校验的 VLC 3.0.24 bundle，目录不使用链接。其完整验收尚未启动，须等 Android 重编译终止，不能将新构建或复制成功算作业务通过。

## 2026-10-30 关闭释放隔离与 codec 对照（验证继续，未发包）

Windows `grid.close` 的同步 VLC 释放现移到阻塞工作线程；仍先校验会话／输入、撤销队列，等待真实释放和原生窗口关闭后，才开始一次性暂存提交并发布完成，不将已发送命令或消失的 WebView 当作成功。新增派发顺序策略检查，RHVideo Rust **67/67** 通过，开发 EXE 构建成功（`rhvideo-grid-close-blocking-rust.log`、`rhvideo-grid-close-blocking-build.log`）。独立私有快照 EXE SHA-256 为 `9be25ff8c6c4e46d3dc2a817d04b827700e9530ef930a24171e5cf96682c7d35`，使用已校验的应用内 VLC 3.0.24；实际关闭／存活页恢复四项定向回归 **4/4、零跳过**，原 5000 ms 期限不变（`rhvideo-grid-close-blocking-focused.log`）。这只证明该轮路径可用，**未证明先前完整回归的间歇关闭超时已根治**，新 EXE 的完整串行回归仍需单独执行。

Android 新增仅 QA 可选的同步 codec 队列对照，使用 Media3 1.11.1 公开 `forceDisableMediaCodecAsynchronousQueueing()` 与工厂覆写，不反射私有成员、不改变音频水位、不允许两种实验混用。每路须记录实际音频／视频 adapter 类型，宿主、BuildConfig 和每格回执都一致才接受实验结果；默认构建仍走原有工厂。新增四项 JVM 检查，保证配置和 adapter 原样传递、工厂只调用一次，失败不重放，不记不存在的完成。

同步实验 QA 构建 **6 分 14 秒成功，447/447 JVM、零失败／错误／跳过**（短路径 QA 的 `rhvideo-sync-codec-build.log`）。主 APK SHA-256 `afab043f209ed0a7a306e94e1ce3ecd822cb1f71c0dec6df7dd0b518a7bd9a5f`、探针 `5d78f62c5573edbc22897f4dcac5f1157bc43c5b4e3901187993ad5c8978c074` 在自有 `emulator-5586` 安装核对；三路实际均为同步 adapter，但严格 grid **仍失败**：5.419 秒只推进 **1011／891／1442 ms**、新增 **16／14／20 帧**（`rhvideo-sync-codec-grid.log`、`rhvideo-android-grid-1793313463612-release`）。这不是实质改善，**不采用为产品默认值**。

共享业务当前 **854/854、零跳过**（`rhvideo-codec-close-final-node.log`）。随后恢复默认 codec、音频实验值 0，并增加仅失败时、计时器恢复后的五秒只读采样；原先暂停 WebView 计时器的五秒判定不变，后续采样不能把失败改成通过，不 seek／重开／重试。默认构建 **7 分 3 秒成功，447/447 JVM、零失败／错误／跳过**（短路径 QA 的 `rhvideo-default-codec-control-build.log`），主 APK `2ccd46ded8bd6f502a2ba7bb506d5b96a36df0c3e4b56c44e81c9de97b4026d8`、探针 `dc34138dc63b0b2bca51495df6f71e2777a0197afb388de66cfd5a53bd222bf4` 实际安装核对；BuildConfig 确认 `default`／`0`。

默认原生回归仍 **失败**（`rhvideo-default-codec-active-control-grid.log`、`rhvideo-android-grid-1793314232760-release`）：原 5.620 秒推进 **390／414／448 ms**、新增 **7／8／10 帧**；恢复计时器后的 5.218 秒推进 **997／1015／1045 ms**、新增 **16／14／23 帧**，同输入未更换。因此暂停 WebView 计时器不能单独解释这次停滞，后一次采样也未达正常速度。继续检查解码输出／供给，不将默认恢复或小幅推进当作修复。新 Windows EXE 的完整串行原生验收已启动，日志 `rhvideo-grid-close-blocking-full-windows.log`、材料目录 `rhvideo-windows-1Lb2m0`；未终止前不计完整通过。正式 Windows 实例、实体手机、主机／模拟器／音频服务均未重启或替换；没有发布新包，完整目标仍未完成。

下一轮已准备仅改变视频输出表面的对照：`-PrhfilesRhVideoSurfaceMode=direct` 必须同时启用 RHVideo probe，且禁止 codec／音频水位实验；默认仍是 compositor，普通单视频不切换。宿主只允许 `grid-surface-probe` 使用 direct，原生每格须证实真实 SurfaceView、未挂载自建子层、无旋转／effects 管线；随后执行相同三路／五秒／60 帧严格判定，不 seek、静音、降低源质量、替换失败样本或执行服务器写操作。结果明确标注仅诊断，不能冒充完整产品验收；compositor 也可跑同一诊断模式作为配对基线。相关宿主／源策略 **18/18、零跳过**；两个新增 JVM View 用例、APK 编译和原生 A/B 运行**尚未执行**，须等待冻结快照的 Windows 回归终止后再构建，避免并行重编译污染关闭期限／播放测量。这里没有输出表面根因或修复结论。

## 2026-10-30 最新完整 Windows 失败与 Android 原生控件（验证继续，未发包）

前轮仍在运行的最新 EXE `22b5e6d9f107e3c9a208f03ae42d41f6b3711bb84610b48265a0aad269c1ebbd` 完整串行验收现已终止：**102/103 通过、1 失败、零跳过**，24 分 45 秒（`rhvideo-client-capture-full-windows.log`，`rhvideo-windows-UGmf58`）。唯一失败是同屏自身关闭、首个存活 WebView 被 debugger 暂停且重新发现不可用的真实故障场景：命令只发送一次，健康的媒体库页已返回 running，但原有 5000 ms 内未取回终态。不借旧 EXE 的 103/103 为新 EXE 背书，也不放宽时限或重复关闭。

故障场景新增仅失败时读取原生进程回执的诊断，分别在恢复无关主窗口前后读取、每次最多 1500 ms；这不改变原命令期限或失败断言。相同 EXE 的独立复测及随后三轮均通过（`rhvideo-grid-close-paused-ledger.log`、`rhvideo-grid-close-paused-ledger-{1,2,3}.log`），真实完成约 0.96–1.05 秒、CLI 取回约 1.23–3.30 秒。**这不是间歇超时已修复的证明**；保留完整失败及下一次可区分执行／回执传递的诊断。

Android 原生媒体 Activity 改用专属深色主题，不修改文件浏览器／系统夜间偏好；统一同屏按钮、目标选择、滑块，补充分组、时间／时长、音量／静音和速度读数。拖动只预览读数，松手仍走原先捕获输入身份的命令；轮询不覆盖正在拖动的值。新 helper 不拥有播放器、网络、设置或命令派发。新增八项 Robolectric 原生绘制／触摸／主题范围／可读性测试，实际 NATIVE 控件 PNG 已检查中文、轨道及按钮；它是**控件组件预览，不是解码视频或完整 Activity 验收**。

共享业务 **849/849、零跳过**（`rhvideo-media-chrome-node.log`，实际参考仍干净且为 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`）；Android QA 构建 **6 分 22 秒成功**，JVM **441/441、零失败／错误／跳过**，包括打包及发行静态检查。它复用未改的 Rust ABI 库，不是完整正式构建。主 APK SHA-256 为 `0056517ae8062856501ba4f339208f0b741009e466ca4bcaa8f8b9b98c9ad639`，探针仍为 `29c6e6eb59fd9c8a6682dc84775cf04ac0b0f10ce4e8fecf33a80e60e92a0cbf`。日志及控件预览位于短路径 QA 的 `rhvideo-media-chrome-native-build.log`、`rhvideo-media-chrome-native-preview/`；不能把编译通过当成新 APK 已通过播放。

自有新 AVD 在 RHFiles 尚未安装时遗留两个开机期系统 ANR，已分别保存截图／层级并只对明确的 System UI 与 Process system 对话框各选择一次“等待”；没有关闭系统进程、重启／重置模拟器或修改安全设置。随后两次窗口读取已无错误弹窗，但仍须按原安装／运行 gate 验证，不能把消失的旧对话框当成绘制／音频健康证明。正式 Windows 实例和实体手机均未操作；没有发布新包，完整目标未完成。

随后同一 `0056517a…` 主 APK／`29c6e6eb…` 探针在 **emulator-5586 / RHFilesRhVideoQA20261030Audio** 安装并逐字节核对成功；默认音频实验值 **0** 的**完整 grid 通过**（`rhvideo-media-chrome-default-audio-grid.log`，`rhvideo-android-grid-1793310622638-release`）。包括真实收藏／取消收藏／暂存触摸、持指 A→B→A 后拒绝旧 decoder 操作、暂停 5 秒帧恢复、循环、精确组重开、一次性暂存提交、账户关闭与 HTTP 失败。横屏 **2400×514** → 竖屏 **1080×1834** 的 canvas 已实际确认，输入始终为 **7／8／9**，均有实际帧；两张原生截图已经检查。这验证了普通旋转不重建解码器的修改，但不证明旧环境的唯一根因是 `-no-audio`、真实声音质量或持续播放性能已经完成。

截图还暴露横屏三排控制占高过大的问题。后续已改为按可用宽度／字体大小自动单行或多行，只更改同一批 View 的测量参数，不重建父子关系／事件／播放器；新增实际原生测量及大字体测试。另收紧 grid：禁止中途状态读取，在暂停 WebView 计时器的五秒实时时间内，每路须保留同输入、媒体／帧时间推进至少四秒，并输出至少 60 帧，不能以首帧或 READY 代替；失败仍保留现场音频。此前完整通过**没有这一项新门槛**，新构建和原生结果另记。新增策略后共享业务 **850/850、零跳过**（`rhvideo-compact-controls-node.log`），此时 Android 构建仍在运行。

随后紧凑布局的 QA 构建 **6 分 10 秒成功，443/443 JVM、零失败／错误／跳过**（短路径 QA 的 `rhvideo-compact-controls-native-build.log`）。主 APK `2079fded3e5da44c7ab4edfbea4f0c33c194ffed9a4ed572adaa660a5c553fec`／初版探针 `500cd6952c839cb12c7ea5e57716adc0b4dabae18f4ca3822f0efe040ea6b22d` 实际安装字节已核对。新的完整 grid **失败**（`rhvideo-compact-controls-continuity-grid.log`，`rhvideo-android-grid-1793311415164-release`）：5.892 秒只推进 **256／234／256 ms**，只新增 **5／0／4 帧**，不是五秒正常播放。三路已缓冲约 19–20 秒、读取 4.36–4.86 MB、无 loadError，仍有音频 underrun，不能只凭缓冲量把唯一根因定为音频或排除所有读取性能问题。

同一主 APK 的独立 **grid-rotation 通过**（`rhvideo-compact-controls-rotation-pixels.log`，`rhvideo-android-grid-rotation-1793311744104-release`），验证真实 0/90/180/270 度像素及暂停时间／音量／速度、翻组恢复；此场景不是屏幕横竖切换，**不能冒充紧凑横屏布局的实际整窗验收或持续播放通过**。横屏单行目前只有原生组件测量通过，完整实窗需在持续播放问题处理后继续核验。

为进一步保留失败栈，探针单独重编译 **58 秒成功**（`rhvideo-continuity-stack-probe-build.log`），哈希 `22bf61a201bcb9ca4e16b54bf3696e62fbc28bf342e373fb07ec5152413d1e20`，主包不变。复测仍 **失败**（`rhvideo-continuity-stack-grid.log`，`rhvideo-android-grid-1793312260984-release`）：5.254 秒推进 **1218／1392／1166 ms**，新增 **22／28／29 帧**。已用对应产品 mapping 还原 234 行现场栈；三条 ExoPlayer Playback 线程当时都在 `MediaCodec.releaseOutputBuffer`，一条视频、两条音频，另有异步音频入队。**单次栈不是阻塞时长或死锁证明**，但下一步应核对 codec 供给／缓冲释放路径，不应继续靠降低音频水位掩盖问题。

新增独立 `scripts/testing/rhvideo-audio-clock.mjs`＋公开 [AudioTrack API](https://developer.android.com/reference/android/media/AudioTrack) 的 PCM 对照，不安装／访问 RHFiles、没有 Media3／网络／解码器，不改音量、起播水位或系统服务；明确只允许两个自有 AVD。保持 48 kHz、双声道 PCM16、24000 帧容量与默认 24000 帧起播水位。有效轮次单路／三路均在约五秒推进约 **242624–244800 帧**、零 underrun，进程正常退出（`rhvideo-platform-pcm-clock-explicit-exit.log`，`rhvideo-pcm-clock-2F64nv/receipt.json`）。首轮虽然采样正常，但诊断 VM 返回 main 后没有及时退出、被 15 秒 guest timeout 终止，未记作通过；已改为**仅在释放所有自建音轨后退出此 VM**，不重置其他进程。该对照 UID 为 shell **2000**，不是 RHFiles 的 app UID，也没有同时解码视频，所以只证明平台在此负载／身份下可正常供给 PCM，不能扩展为整个平台无问题或产品播放已修好。

新增独立诊断准入测试后，共享业务最终 **852/852、零跳过**（`rhvideo-compact-controls-audio-node.log`）。主题／控件提交 `768f4e3` 已推送两端开发分支；本节其余源码与结果继续保存。未降低五秒门槛、默认化音频实验、重启音频／模拟器／主机、操作真机或替换正式 Windows；没有发布新包，目标仍未完成。

## 2026-10-30 起播水位对照与旋转冷恢复（验证继续，未发包）

首先以公开的 Media3 AudioOutputProvider／AudioTrack API 构建独立 QA 实验，默认构建仍为 0、不改变平台水位；不使用 deprecated provider、私有反射、静音、删音轨、缩小缓冲或重试。实验参数只能搭配 probe 构建，宿主／每格 snapshot／实际水位回执均须一致，不允许实验包冒充默认 gate。新构建 **6 分钟成功，433/433 JVM**（`rhvideo-audio-start-experiment-build.log`）；共享业务含真实参考对照先 **843/843**（`rhvideo-audio-start-node-reference.log`），第一次未指定参考路径的 811 通过／32 跳过另存，不记为完整通过。

主包 `4bc49c677cca4b90092902b6c3f19edd1bc442d504d1ac5c4fd616043d5a3f2d`，初版探针 `fb1a33d341e75a1ed9478aba1d4ed686246df618bc886de5acf68f7d339f2261`。完整 grid 实验 **失败**（`rhvideo-audio-start-experiment-grid.log`，`rhvideo-android-grid-1793305649982-release`）：三路实际起播阈值由 24000 改为 960 帧，容量／bufferSize 均保留 24000；三路分别推进约 298／417／256 ms、6／12／6 帧，但仍有 12／14／11 次音频 underrun。实际收藏／取消收藏／标记触摸及翻组通过，不将它们算作整轮通过。旋转后 input 13／14 仍无帧，15 有帧；因此 **降低水位不是已通过的正式修复**，没有修改产品默认值。

进一步核对系统配置时间线，发现旧探针只 sleep 1200 ms 后就把旧竖屏的 READY 状态当成横屏完成，立即反向旋转，排入两次框架重建。改为原有 30 秒预算内要求真实对应画布尺寸／帧，再发相反方向，并核对系统接受请求；没有加长预算。探针单独构建 **48 秒成功**（`rhvideo-grid-rotation-settle-probe-build.log`），哈希 `9f6ec905b2db37c4c40b3a024b29f7391b362f3d3c5cc61bb0bdf0bb0cef2a9d`，产品 APK 不变。

这轮严格方向重跑仍 **失败**（`rhvideo-audio-start-orientation-verified-grid.log`，`rhvideo-android-grid-1793306146183-release`）：实际横屏画布 **2264×549**、新 input **10／11／12**，不是旧画面误放行；第一格 5 秒、queued 99／skipped 94、零渲染帧，另两格各有一帧，真实 H.264／AAC 均已初始化。失败现场音频匹配 PID **22752**。两轮生成源逐字节相同：横屏 SHA-256 `97cf3a48b50aaa677ee66fd9debca20786021ffbda51d286ebfa5a2aea86bddb`，竖屏 `98c8699ed412be73efb519aa2c8388d56e68c71b5c8edd014fa17d8cd32c24bc`，前轮生成文件已保留在专属 artifact。不能把旧探针竞态当成全部产品根因，也不能将水位改动的起播通过扩展为恢复／流畅性完成。

当前产品修改只让普通方向／窗口大小变更更新网格和调节面板高度，保留实际解码器，避免三路重新下载并从旧关键帧解码；语言／主题／密度等仍走系统正常重建。真实后台停止、关闭及强制 Activity.recreate 继续释放和恢复，既有 ViewModel 轨道记忆不移除。按 [Android 配置变更规则](https://developer.android.com/guide/topics/resources/runtime-changes)自行适配布局，不锁定屏幕方向。新增验收须核对横竖几何、同一 inputId 以及实际截图；**此时原生新包尚在构建，不能写成该修改已通过运行验证**。共享业务最终 **846/846、零跳过**（`rhvideo-grid-inplace-node.log`），不代替原生运行。未重启系统／音频／模拟器，未操作真机、替换正式程序或发包。

随后该包 **5 分 39 秒构建成功、433/433 JVM**（`rhvideo-grid-inplace-experiment-build.log`），主包 `05ea517d739e9c72f0f3783acc1cb94eb65363291324793a52dda0b61bf36b30`／探针 `3b955892369c3bf26cae1b37afb0b49a275e62b19d52fa41ba0d07e0e0061bc3`。251 项 canonical Android 输入比较仅未打包的测试夹具不同，产品／原生源码相符，宿主另逐字节核对已打包的共享 UI。**运行失败，尚未进入网格**（`rhvideo-grid-inplace-experiment-full-grid.log`，`rhvideo-android-grid-1793306827441-release`）：分类 JavaScript evaluation 超时，夹具已经收到清单及 28 张封面请求；PID **23422** 主线程栈停在 `HardwareRenderer.nSyncAndDrawFrame`，media.resource_manager 读取也超时。没有创建本轮播放器，不能将它算成旋转修改的运行失败或成功，也不能仅凭堆栈断言整个系统的唯一根因。

核对旧 QA 实例实际启动命令，含 `-no-audio`，且仍在运行。为排除测试环境干扰，未重启或重置它。SDK 的只读多实例启动被当前版本拒绝，进程已退出、日志保留；随后单独创建 **RHFilesRhVideoQA20261030Audio／emulator-5586**，同为 Android 14／Pixel 7／软件 GPU／6 核／6144 MiB，保留正常音频，首次启动还在等待。旧 **emulator-5584** 未动。宿主只放行这两个明确自有 AVD 名称，物理设备仍被拒绝；另重编译默认水位 **0** 的对照包，不把 20 ms 实验默认化。此阶段新实例尚无播放验证，不能宣称新环境或产品旋转修改已修好；新一轮结果另记。

默认水位包随后 **6 分 29 秒构建成功，433/433 JVM、零失败／错误／跳过**（`rhvideo-grid-inplace-default-build.log`），主包 SHA-256 `69295a1f6707a7c2119924f3254ae23590981a9fb946ec8880c450e1f854748c`，探针 `29c6e6eb59fd9c8a6682dc84775cf04ac0b0f10ce4e8fecf33a80e60e92a0cbf`。实际 BuildConfig 为 **0**，R8 usage 显示实验 provider／companion／API outline 已移除。`apksigner verify --verbose` 成功，v2 签名有效、一名签名者。新增精确 AVD 白名单 guard 后，共享测试 **847/847、零跳过**（`rhvideo-grid-inplace-final-node.log`）；代码提交 `6c5de98` 已推送两端开发分支。

新 AVD 保留了默认系统安全设置，没有禁用任何签名／完整性检查。启动完成后，第一轮 **安装阶段失败**（`rhvideo-grid-inplace-default-audio-fresh-grid.log`，`rhvideo-android-grid-1793307829288-release`）：PackageManager 返回 `INSTALL_FAILED_VERIFICATION_FAILURE: Integrity verification timed out`，未创建 RHFiles 进程。确认启动动画停止、GMS 进程已启动、签名有效，且 `pm path` 仍没有 RHFiles 后，新一轮在 **安装前环境 gate** 即失败（`rhvideo-grid-inplace-default-audio-settled-grid.log`）：窗口系统明确存在 **`Application Not Responding: com.android.systemui`**；当时 RHFiles 仍未安装。新实例的 media.resource_manager 能正常读出，但不代表绘制环境已健康。没有关闭／忽略该 ANR、改安全设置、放宽 gate 或再次盲目安装。

因此这轮**未验证到修改后的真实旋转／后台恢复，持续播放问题也未修复**。不能将编译／单测／环境隔离进展说成产品原生验收通过；必须在健康的自有 QA 环境补上完整默认水位 grid、真实横竖截图和独立 lifecycle，并继续核验 Windows 同质量性能等原定缺口。新旧 AVD 均保留现场，没有重启／重置任何现有模拟器、操作真机或替换正式实例；未发布新包。

## 2026-10-30 同屏停滞的逐输入和现场音频证据（未修复、未发包）

给每次原生解码器 incarnation 增加独立、定长、可关闭的诊断：实际 H.264／AAC 解码器名、生产者初始化时间与主线程收到回调的时间、真实 Media3 counters、传输字节／首末字节时间、音频会话 ID、underrun 和读取错误数。只有 debug 或显式启用原生自动化时采集；不记录地址、令牌、文件名、异常正文或事件队列，不改变播放／重试策略。缺失阶段返回 null，`droppedTotal` 按 [Media3 DecoderCounters](https://developer.android.com/reference/androidx/media3/exoplayer/DecoderCounters#droppedBufferCount) 表示输入与输出丢帧总计，不误称只有输出。

中间包 `c0f51ac43a23679b83fb7dcaa4ba739f3bc03d02ab3b7b0693bf86b01d0cb668`／探针 `0776576abf01b6e0d427e5041b5716fbfa3efebb0357209627eee31e3799fa58` 的完整 grid 在初始三路推进断言失败（`rhvideo-input-diagnostics-grid-first.log`）：两格仅一帧／0 秒，另一格约 1.39 秒／20 帧。三路已初始化真实 H.264／AAC 解码器、读取数 MB，无 Media3 loadError；不能据此排除慢读取或断言唯一音频根因。该中间诊断的 `droppedOutput` 实际映射总计，随后已更正键名。

最终增量 QA 构建 **5 分 25 秒成功，429/429 JVM，零失败／错误／跳过**（`rhvideo-input-diagnostics-final-build.log`）；Node **841/841、零跳过**（`rhvideo-input-diagnostics-final-node.log`）。主包 SHA-256 `6d3b3658f9a0b4545ea5d855906891d34e8af741137c4a4701fd3ec57b196220`，探针 `02a47e1f5a2e43fb2370852399aa4af71a80c8b6e12e98570b47ca8003759136`。308 项 Android 输入逐一比较，仅未打包的测试夹具不同；产品／原生／新增测试相符。参考 RHVideo 仍干净且为 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`，模块指纹审计通过，不把库存当成功能验收。

最终完整 grid 仍失败（`rhvideo-input-diagnostics-live-grid.log`，`rhvideo-android-grid-1793304380628-release`）：三格 READY／playing、0 秒／1 帧，视频各 queuedInput 20，音频 renderedOutput 11／4／4。每路均为 `c2.goldfish.h264.decoder`＋`c2.android.aac.decoder`，读取约 4.08／3.30／3.22 MB，未报 loadError。音频 renderedOutput 仅表示解码输出已提交，不等于声音已经输出。

本次在失败仍存活时异步读取 AudioFlinger，有 10 秒／4 MiB 上限，不阻塞夹具 HTTP。回执匹配 PID **21632**，会话 **3377／3385／3393** 与三格状态一致；三条音轨 server frame count 均零、active 均 no，flags 均 `0x008`，队列仅 10240／3072／3072 帧，缓冲容量 24000。它将下一步缩小到音频起播／补缓冲与真实播放时钟的关系，但**尚不能认定唯一根因或已修复**；需用同一媒体和完整流程做独立对照，不删音轨、伪造时钟或放宽帧预算。

grid 收藏／标记探针现要求真实可见、可命中、稳定的原生按钮 down/up，不再只调用 native.ui.invoke；但最终运行在初始播放就失败，**未执行到这些按钮，不能记作物理触摸通过**。没有重启模拟器／系统音频／电脑、操作真机或替换正式 Windows；未发布新包。以上改变是诊断进展，不是完整目标完成。

## 2026-10-30 Android 真实后台／重建时的字幕选择丢失（单播放器已验证，同屏仍有失败）

继续前一轮的 Android 原生验收，而非用 Windows 结果代替。未修改前的 QA 主 APK `d3939c10907da93f380490ccf2bedebe8e23b32823295670f8d304ca619846e5` 在完整 `grid` 中失败（短路径 QA 的 `rhvideo-current-android-full-grid.log`，`rhvideo-android-grid-1793298500860-release`）：三格都报告 READY／playing、20 秒已缓冲且没有错误，但两格时间为零、只渲染一帧，另一格约 1.2 秒／19 帧。线程栈和音频日志已保留，包含 underrun 和时间戳修正；这**没有证明单一网络／音频／合成层根因，也没有修好持续播放停滞**。同主包的旧 `single` 通过（`rhvideo-current-android-single.log`），但当时只要求首帧，不把它描述成持续播放通过。

新增 `lifecycle` 使用同一真实 H.264／AAC 源，仅 remux 加入真实 `mov_text` 字幕；视频／音频字节流保留。第一次探针错误地向不接受 subtitles 的共享 player.control 提交，因 schema 拒绝而失败（`rhvideo-lifecycle-before-fix.log`），不是产品缺陷。改为现有公开的 `native.media.control` 后，在原主 APK 上实际 HOME → onStop → 返回同一个 Activity，确定复现 **“after background: explicitly disabled subtitles must not silently turn back on”**（`rhvideo-lifecycle-before-fix-2.log`）。该断言前的暂停源、5 秒位置、1.25 倍、循环与本地音量 37 均保持。

产品修复是当前 viewer 专属的 ViewModel，只保留不可变的完整 TrackSelectionParameters；停止／保存／旋转重建前记忆，在新解码器准备前恢复。不写入全局／账户配置，不把 TrackGroup 或大队列塞进 Bundle，也不承诺进程死亡后的媒体票据恢复。四项 JVM 用例验证完整轨道 override／字幕关闭、最新选择覆盖和独立窗口隔离。全部 Android JVM **418/418、零失败／错误／跳过**（`rhvideo-lifecycle-fix-android-build.log`），共享 Node 先 **836/836**，增加物理控制栏探测策略后为 **837/837、零跳过**（`rhvideo-grid-lifecycle-node.log`）。实际产品仍为1.11.1；[官方当前稳定版本](https://developer.android.com/jetpack/androidx/releases/media3)与此一致。另核对 [#3407](https://github.com/androidx/media/issues/3407) 的 AC-3 passthrough／BUFFERING 场景与本次 PCM／READY 不同，未据相似日志盲目升级 alpha 或套用其 workaround。

新主 APK `16d054007d61b10576719f2d3594816ad8a2464fc993a2416776dab4673d7571`、探针 `df7fbc345a4dc201d807b61b950de0510a8361a0d0e345a92f69f76c7ad0fce2`，安装后逐字节核对，仅在 `RHFilesRhVideoQA20261027`／`emulator-5584` 上通过了**当时单播放器生命周期整条场景**（`rhvideo-lifecycle-after-fix.log`，`rhvideo-android-lifecycle-1793300337647-release`）：真实 HOME／stop／返回，以及框架 Activity.recreate，均保留上述值和字幕关闭；viewer lease 保留、解码器 ID 换代，旧 ID 控制明确被拒绝。已查看实际 5 秒暂停画面的截图。此处暂停恢复通过不等于音频输出质量、同屏或持续播放已经通过。

随后原生播放就绪条件收紧为时间大于 250 ms 且实际帧数大于一。普通 `single` 在实际 Next 按钮处失败（`rhvideo-lifecycle-fixed-single.log`，`rhvideo-android-single-1793300489604-release`）：后台 WebView 的 controls.show 回执耗时约 4590 ms，超过产品 3500 ms 自动隐藏间隔，按钮的祖先实际 alpha 已为零。没有移除实际按钮／严格命中断言或延长产品隐藏时间。探针现在等待窗口焦点恢复，必要时只发一次真实画面触摸唤出控制栏，再按原有透明度／裁剪／屏幕／稳定中心条件注入目标按钮触摸；不调用 View.performClick。该失败和接口延迟保留，后续物理流程结果另记，不能称作产品性能根因已修好。

同一主包与新探针 `e9a17c0008264c8c9a80e791372448c82e7991b9f17c6b127009db2c206a3ead` 的扩展生命周期先再次通过单播放器，再在三格初始化阶段失败（`rhvideo-grid-lifecycle-before-fix.log`，`rhvideo-android-lifecycle-1793300801586-release`）：前两格 c2.android.aac.decoder 报 allocate 超时／Released state，`ERROR_CODE_DECODER_INIT_FAILED`，第三格有真实暂停帧。**尚未走到同屏轨道恢复断言**，不把此轮称为已经复现或修复同屏字幕丢失。当时该包的同屏 capture 未保留轨道参数；后续开发代码已按同一 viewer 的视频 ID 保存／恢复，新增四项独立格子、重排、最新选择及新 lease／新窗口隔离用例，实际同屏生命周期结果仍须另验。扩展入口明确拒绝旧的仅单播放器成功回执，不拿旧通过覆盖新失败。

同主包／探针的下一轮 `single` 又在冷点击前置夹具处失败（`rhvideo-lifecycle-fixed-single-physical.log`）：它在登录后先跑图片检查，故意等待首个视频读取才放行的图库 HTTP 已超过原有读取超时；这轮**尚未走到修改后的物理控制栏逻辑**。探针将原有“登录后立即点第一个视频”流程移到无关图片检查之前，图片内容探测、菜单、父层、上下文和收藏放映断言全部保留，不加长 HTTP 超时或隐藏间隔。相关宿主策略含此顺序检查，共享 Node 随后 **838/838、零跳过**（`rhvideo-track-memory-final-node.log`）；它不是该轮原生 single 已通过的证明。

加入同屏记忆后的整包构建 **5 分 45 秒成功**（`rhvideo-grid-track-memory-build.log`），全部 JVM **422/422、零失败／错误／跳过**；新主包为 `3d0ab192438a0b9568265a2ef5082526a1c31fad0941b20c8eb70190ecb0b0e4`，探针为 `f725c84fc9d5039bd3d5657f3346813ce4fcd3f50eca8bbd8646e4b332552568`。canonical 到短路径 QA 共核对 306 项 Android 输入，文本按 LF、其他文件按精确字节计算 SHA-256，只有未打包的 `android/web/tests/browser-fixture.mjs` 不同；所有产品／原生与新测试输入相符。参考仍为干净的 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`，14 个模块指纹和接口库存检查通过（`rhvideo-track-memory-reference-audit.json`），不将库存通过当作行为完成。提交后完整共享 Node 再次 **838/838、零跳过**（`rhvideo-track-memory-node-verified.log`）。

新主包已通过**完整单播放器＋三格同屏 lifecycle**（`rhvideo-grid-track-memory-lifecycle.log`，`rhvideo-android-lifecycle-1793301727365-release`）。两种 viewer 都实际 HOME／stop／返回同一 Activity，再由框架重建；同屏真实暂停定位元数据与位置均约 5 秒，保留选中格的 1.25 倍、循环、37 音量及字幕关闭，另外两格未被串改，新 viewer 恢复默认，旧解码器控制被拒绝。已分别查看两张原生截图，同屏有三格实际像素，底格显示 5 秒帧，非接口／缓存成功假象。此轮没有出现上轮 AAC allocate 失败，**并不能据此证明该间歇初始化故障或播放时钟停滞根因已经修好**。截图中的同屏浅灰控件／系统栏仍有视觉统一欠缺，不把业务通过称为视觉体验完成。

随后同包完整 `single` **通过**（`rhvideo-track-memory-single-final.log`，`rhvideo-android-single-1793301960655-release`），宿主明确收到两轮退出码均为零。包含收紧后的时间／多帧要求、首个视频不等图库、默认／保存／混合图库顺序、真实 Next／设置／关闭触摸、原生速度选中项、单项父层与逐次返回、模式／账户隔离、实际 PNG 内容探测与 HTML 错误拒绝、上下文操作和收藏放映实际像素。已查看本轮 Single 截图：画面约 5.292 秒、中文菜单确有 1.25 倍勾选。没有把 Readiness 返回当成持续播放，也没有延长 HTTP／隐藏／逐帧预算。

同包接着跑完整 `grid` **失败**（`rhvideo-track-memory-full-grid.log`，`rhvideo-android-grid-1793302261433-release`，退出码 1）：本轮通过多路实际时间／帧前进、收藏／暂存控件调用、分组切换和实际 held slider 的 A → B → A／旧解码器输入拒绝；但横屏框架重建后的第一格停在 BUFFERING，5 秒位置、已缓冲 20 秒，却没有渲染帧、输出尺寸为零，另外两格已有暂停帧。当前没有对应终态 error，也没有足够证据归因于网络、音频或合成层中的唯一一项。实际重建输入为 10／11／12；状态、网络请求、native-logcat 与 media.resource_manager 均保留。该次未走到后续近 EOF、重新打开、最终暂存提交与错误源断言，**不能把这几项算通过**。生命周期 green 不覆盖这一更长的旋转／资源竞争场景；下一步需要给每个输入补独立的解码／加载阶段观测，不能拿一份无输入归属的全线程栈直接认定根因。

这轮增量 QA 构建复用未改的 Rust ABI 库，不是完整重编译的正式 APK。没有删除音轨、伪造时钟、增加逐帧预算、自动重试播放，亦未重启模拟器／系统音频或操作实体手机。Windows 正式实例未替换、没有发包；持续播放、同屏生命周期、最终发行和稳定同性能等完整目标仍未完成。

## 2026-10-30 最新 Windows 103 项完整回归与客户区取图修正（完整目标仍未完成）

上轮启动的 `rhvideo-task-refresh-all-windows.log` 最终为 **54 通过／1 失败／48 跳过**，共 103 项：调用遗漏 `RHFILES_NATIVE_PLAYER_QA=1`，原生场景被跳过；放映 End 按键也没有送达。当时仅 DOM 焦点为 true，没有启用原生输入归属诊断，不能把这一轮当成完整通过或直接归因播放器逻辑。失败原样保留，不重写旧结论。

新增 `scripts/testing/rhvideo-windows.mjs` 作为完整串行入口，强制真实原生标志及 `native-hardware-auto`，验证独立 `test-artifacts/` EXE 快照与 app-local 3.0.24 清单／插件索引，拒绝正式安装、链接、兼容输出和性能实验混入。最终 TAP 的失败、跳过、取消、待办或缺失汇总都算失败；有 40 分钟／8 MiB 上限，异常只结束本入口创建的进程树。入口后续另补了参考模块字节及 EXE 的前后回核、UTF-8 日志分包处理，相关策略以实际函数测试，不把入口存在当成验收成功。

**有效完整轮次为 103/103、零跳过，22 分 01 秒**（`rhvideo-task-refresh-strict-windows.log`，汇总及 TAP 在 `rhvideo-windows-qXtb0d`）。它使用同一 EXE `a1caf3f1176c153c96983cf6255117c740b41a35d2ec3b2f67167de34602a3e1`、实际 **3.0.24 / prebuilt-no-scan**；17 个测试文件包括真实 H.264／4K HEVC／AAC、换源／同屏、五万项跨进程顺序、临时标记、真实 FastAPI／SQLite／重复项／导出／队列置顶，以及任务中心的三次实际读取失败后手动恢复。放映场景记录媒体库的 foreground／active／inputFocus 均为 true，End／Home 实际送达且不泄漏至主窗口；这轮通过不证明过去的间歇焦点故障根因已修复。该次入口尚未加入后续的模块字节回核字段，不能把新字段倒写进旧 receipt；前后参考 HEAD 均为干净的 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`，事后另外核对 14 个 `sha256-utf8-lf` 指纹全部相符（不能将 CRLF 原始字节直接拿来与 LF 指纹比较）。

性能对照新增 `RHFILES_REFERENCE_NATIVE_PIXELS=1`：在原版实际页面播放相同字节时，使用本进程私有 stdin 的 `main.frame`，按真实视频矩形、contain 留白及设备比例取四角像素；同样保留前置负画面、每次几何／耗时、首次正画面及原版 rVFC 回调，不使用桌面截图或外部 HWND。最初两个轮次失败（`rhvideo-reference-owned-pixels-h264-{first,geometry}.log`）实际已经播放：自有 BMP 把原生标题栏／边框画进客户区大小的缓冲，导致采样错位，而不是原版解码失败。

只在 debug 编译的取图函数现按 [PrintWindow 的客户区选项](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-printwindow)显式组合 `PW_CLIENTONLY` 与原有全内容取图标志，使 GetClientRect、位图与坐标一致；`main.frame` 明确返回 `canvas=client`，探测拒绝旧版错误范围。首次编译发现 SDK 的标志包装类型不实现 BitOr，流水线在编译失败处停止，未启动旧 EXE 冒充新构建；改为组合其整数位后，RHVideo Rust **67/67、零忽略**（`rhvideo-client-capture-rust-final.log`）。共享 Node **834/834、零跳过**（`rhvideo-strict-runner-and-client-pixels-node.log`），含新入口五项及参考像素三项，拒绝不完整汇总、源文件漂移／越界、非客户区几何、错误 DPI／字节格式和缺失标记。

随后新 debug EXE `22b5e6d9f107e3c9a208f03ae42d41f6b3711bb84610b48265a0aad269c1ebbd` 在另一份已验证的独立 3.0.24 快照上，原版客户区四角真实通过（`rhvideo-reference-owned-pixels-h264-client-fixed.log`，`rhfiles-e2e-aZ54zC`）；本端同字节原生像素通过（`rhvideo-native-owned-pixels-h264-client-fixed.log`，`rhfiles-e2e-EBnJ61`）。本端可见取样区间 **3.370–3.658 s**，原版 **5.464–5.786 s**，但原版 rVFC 早在 **2.704 s**：回调、DWM／PrintWindow 读回及实际屏幕呈现不能混称同一首帧，单对样本也不能证明稳定优化。两侧前台／遮挡条件尚须进一步明确和配对复测，**不作“本端更快”的结论**。新 EXE 的换源及放映专项 **5/5、零跳过**（`rhvideo-client-capture-native-regression.log`）；103 项仍归属于前述旧 EXE，不冒用为新诊断构建的全量结果。

本轮产品播放流程、内核、缓存、线程、画质及音轨默认值未改；客户区修正是 debug 私有观测，不进入 release。未替换正式实例、未操作实体手机、未发新包。完整 Android 生命周期、最新正式分发及稳定同质量性能等缺口继续保留，完整目标不因 103 项功能回归通过而标记完成。

## 2026-10-30 独立 libmpv 对照及运行库测量纠偏（未替换产品内核）

新增 `scripts/testing/{prepare-mpv-probe.ps1,build-mpv-probe.ps1,native-mpv-probe.cpp,rhvideo-mpv-probe.mjs}`，只用于独立 Win32 自有窗口／进程的有界实验，不打包进 RHFiles、不装系统组件。候选来自 [mpv 官网列出的 Windows 第三方构建](https://mpv.io/installation/)之一；固定为 `zhongfly/mpv-winbuild` 的 `2026-10-29-cf764c61d1` / `mpv-dev-lgpl-x86_64-20261029-git-cf764c61d1.7z`，下载资产 SHA-256 `f62fd6192e7310397a8b4288330e8f2f838fe85a8d1e5a0f242940fae940f04d`，加载前另核对 DLL 与 API 头文件字节。构建／解压路径不得穿过 junction 或符号链接，只提取指定两个文件。该构建名称不是许可合规结论；[构建者的许可说明](https://github.com/zhongfly/mpv-winbuild#readme)也要求检查依赖，未作为产品依赖准入。

探针按 [原生窗口嵌入接口](https://mpv.io/manual/master/#options-wid)使用自己创建的 HWND；读取画面前核对本进程／父子窗口关系。配置／脚本／恢复记录关闭，音轨保留，源尺寸不降级。只接受自己生成的同字节文件副本或数值回环地址，拒绝任意远程 URL、非固定路径、目录／重解析点和无效 GPU 参数。进程内 15 秒、宿主 20 秒上限，结束阶段继续泵送自有窗口消息并给销毁 3 秒预算。负画面及四角标记正画面、原分辨率／音轨、真实暂停保持、4 秒定位、1.25 倍恢复后时间前进、实际销毁均分别断言；不以打开窗口或命令返回代替。

最终独立探针 `e25e23a4127e012649674a7cc3a5c3787f4590060ec7c1030eeb3f80f9b28536` 的 H.264 HTTP／本地、HEVC HTTP 三轮均完成上述断言，源码加载→正像素观测分别约 **4.640／3.798／4.531 s**（`mpv-final-{h264-http,h264-file,hevc-http}.log`）。九种无效源／选项另在创建窗口前被拒绝（`mpv-admission-final.log`）。但最终轮次仍出现音频 underrun 或 A/V 失同步告警，未测量实际声音／同步质量；早期同源本地轮次还在完成控制后超过 3 秒销毁预算（`mpv-h264-file-first.log`），后续通过不证明该间歇问题已修复。不能拿最好的一轮称作稳定加速，更不能把没有 WebView／RHFiles IPC 的独立程序当成同口径整机性能胜出。

另外发现直接运行开发 EXE 会回退到系统 **3.0.23**（`rhvideo-mpv-matched-h264-current.log`）。测量脚本现保存实际 `engineVersion`／`pluginIndexMode`，并可用 `RHFILES_EXPECT_ENGINE_VERSION` 硬性拒绝错库。共享 `target` 是通向主工作区的 junction，首次暂存尝试被既有路径门禁拒绝；没有绕过门禁，而在新建的 `test-artifacts/rhvideo-runtime-324-58ba5af62bed403c813cbd3c9b80cd95` 中复制同一 EXE 并逐项验证 app-local **3.0.24 / prebuilt-no-scan**。没有修改系统 VLC 或共享构建目录。

此独立快照 EXE 为 `a1caf3f1176c153c96983cf6255117c740b41a35d2ec3b2f67167de34602a3e1`。同字节 H.264／HEVC 的实际 RHFiles HTTP 流程，正像素上界为 **4.124／5.494 s**，前端返回约 **0.310／2.297 s**（`rhvideo-mpv-matched-{h264,hevc}-bundle324.log`）；after-stats 模式没有早期负采样，不能当成精确首帧。生产 trace 中 H.264 约 0.298 秒命令返回，D3D11 设备／纹理池及首次图片仍晚于输入请求，尚不能认定某个单一根因。以上新增证据**不支持现在替换产品播放内核或宣称性能目标完成**；保持现有业务语义、参数和画质，继续真实平台与发行验收。

## 2026-10-30 任务详情手动刷新后的读取恢复（完整目标仍未完成）

修复上轮保留的读取恢复缺口：自动读取连续三次失败并停止后，当前任务详情的显式“刷新”只有真正收到并绘制同一任务、同一账户／面板代次的有效回执，才重置失败预算并恢复有界自动读取。自动刷新不自行重置预算；失败、任务 ID 不符、切换筛选／所选任务、关闭面板或旧代次的迟到回执均不得恢复另一上下文。这里恢复的是只读轮询，不重放失败写请求，也没有新增失败任务的重试／取消按钮。

新增单元测试从实际生产源码 AST 提取详情读取函数，覆盖手动／自动、失败／ID 不符、关闭／代次／选中／筛选变化和新旧并发读取；夹具另验证三次实际 HTTP 失败后，确实需要详情读取及后续列表请求，而非仅修改本地状态。显式使用当前干净参考 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae` 的全部 Node 回归 **826/826，零跳过**（`rhvideo-task-refresh-final-node.log`）。

Windows 当前 debug EXE `a1caf3f1176c153c96983cf6255117c740b41a35d2ec3b2f67167de34602a3e1` 的任务中心／流程展示／置顶回归 **3/3，零跳过**（`rhvideo-task-refresh-recovery-windows.log`）。实际窗口先经历三次定时 503、确认停止且不继续请求，再物理点击详情刷新，核对随后实际列表请求到达并清除错误。对应任务中心目录为 `rhfiles-e2e-WSyWPq`，不冒用旧构建的 16 或 97 项结果。

Android 在自有 `emulator-5584 / RHFilesRhVideoQA20261027` 的混淆 APK 上同样通过此流程，宿主保存的 `read-recovery.json` 为 `failureCount=3, manualRecovered=true, recoveryLists=1, armed=false`。短路径 QA 镜像日志为 `rhvideo-task-refresh-android-acceptance.log`，目录为 `rhvideo-android-task-center-1793293191816-release`；安装后核对 APK SHA-256 `d3939c10907da93f380490ccf2bedebe8e23b32823295670f8d304ca619846e5`，探针 `860929b4483d143a4e6499366edfeeab6031cd8dfaa96473fa4f41bc7c506668`。本轮 Kotlin 产品代码与 Rust 库未修改，QA 包复用已验证原生库；未操作实体手机、正式实例，未发布增量 QA 包。

这只完成任务中心的读取恢复，不证明原生启动性能、全部生命周期、所有功能与发行验收已完成；完整目标仍进行中。

## 2026-10-30 同面板任务中心与真实处理流程（完整目标仍未完成）

继续对照干净的 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`，不改变 RHVideo 后端、不直接读取其数据库。任务中心现在在同一面板内呈现列表和所选任务的流程：运行／失败视图自动选择首项，等待／历史视图由用户选择；桌面左右布局，窄屏上下布局。原有独立任务详情接口仍可调用，但不再是列表唯一的入口。替换批次保留独立折叠区，其展开状态不会被读取刷新重置。

共享详情模型把步骤、耗时、计划参数、真实输出、编码速度、帧率、预计剩余及替换节省量转换为可读指标，不再输出原始属性表；零值保留，未知百分比为不定进度，读取中断／心跳过期／停滞不会继续冒充实时 ETA。归档、旧摘要及未记录步骤明确说明，不构造虚假的完成过程。保持用户要求：没有失败任务的重试／取消按钮，没有自动重发写请求。

列表和静态详情分别比较数据签名，只有进度变化时不重建整个流程。真实窗口核对了滚动、文本选择、输入焦点和节点身份；手动刷新也保留阅读位置。输入搜索防抖 250 ms，组合输入结束才提交；隐藏时不启动待提交搜索，恢复可见后处理一次，关闭则丢弃。旧筛选／旧账户／已关闭面板的迟到响应不可回填当前界面。历史筛选只在历史视图出现，默认处理没有跳过／已停止结果；API 同样拒绝无效组合，切回默认队列会规范化不适用的状态。

新增语义接口为 `rhvideo.task.centerState`、`task.select`、`task.refreshSelection`、`task.detailState`、`task.batchesVisibility`，与原有 `server.*`、任务置顶和批次操作共用实际 UI 处理器。可见控件契约没有缺项。源码审计扩大到两个新模块，仍核对原参考的 185 个 inline 控件、14 个文件哈希；增加任务模块接口清单后为 30 个粗粒度功能组。这是源码／接口证据，不能代替完整行为和性能验收。

本轮证据：

- 共享 Node **816/816，零跳过**，显式设置实际参考路径（`rhvideo-task-center-final-source-node.log`）；独立参考审计在 `rhvideo-task-center-reference-audit.log`。
- 冻结源码后，Windows **16/16，零跳过**（`rhvideo-task-center-windows-frozen.log`），包括四项任务中心／详情／受控置顶／真实队列测试，以及原有真实原生 H.264、4K HEVC、四播放器、五万项图片可达性和实际 FastAPI/SQLite／喜爱导出等回归。调试 EXE SHA-256 为 `d4c541a1ac34d55624b54f813eb865e2e27755773cfb8691ceb023e1dac11ada`；最后任务中心截图／断言位于 `rhfiles-e2e-Y6f66l`，实际队列位于 `rhfiles-e2e-9EsGq3`。早期运行碰到新折叠控件缺少语义接口，另一次运行因测试中修改源码被指纹门禁拒绝；未放宽门禁，以上为最终同一构建的完整重跑结果，不冒用中间结果。
- Android JVM 最终 **414/414，零跳过／失败**（短路径 QA 镜像的 `rhvideo-task-center-android-final.log`）。首轮有两个未修改的设备组连接用例失败，原 XML 保留在 `rhvideo-task-center-initial-unit-results`；单独原测试类 18/18、最终完整重跑 414/414。只增加失败诊断文字，没有改变连接实现或削弱断言，尚不能据此宣布间歇问题的根因已修复。
- Android 混淆 APK 在自有 `emulator-5584 / RHFilesRhVideoQA20261027` 分别通过 **task-center** 和 **task-priority**。前者用明确受控的进度记录验证真实打包 UI、物理选择、六步指标、未知进度、分页、历史筛选、节点／滚动保持及接口；不是实际编码性能测试。后者使用真正 RHVideo 服务和生成数据库，验证跨页置顶、原始入队时间、暂停状态，以及真实工作线程下一次领取顺序，未中断正在执行的尝试或重试失败记录。日志为 `rhvideo-task-center-android-{acceptance,actual-queues}.log`；目录分别为 `rhvideo-android-task-center-1793291685257-release` 和 `rhvideo-android-task-priority-1793291875137-release`。安装后逐字节核对产品 APK `d7b4f06edcdb085eb51c732e367deaa2fabd04ce7577eb115e6e5cbcd6f4efc9`、探针 `bf35cf2d6ab3ade985bcd6470a5cb4cf00341ed2bd8943fedb0e08813ac0a74b`；JS/CSS 资源逐项校验，未操作实体手机。QA 复用未修改的预编译 Rust 库，不是全量新原生发行构建。

**完整目标保持进行中**：以上不是旧 97 项在最新构建上全量重跑，也不是正式发布验收。当前 H.264／HEVC 的 native-open→显示仍约 **5.059／6.623 s**，没有播放性能优化结论。任务详情的手动刷新在自动读取连续失败耗尽后恢复自动刷新这一分支，还需补齐显式循环重置及失败→恢复测试；其他原生播放、完整生命周期与发行缺口继续保留。正式实例 PID 45696、主线之外的既有未提交内容均未在本轮替换；未发布此 QA 包。

## 2026-10-29 等待任务置顶及队列上下文修复（完整目标仍未完成）

对照来源更新到干净的 `3d6aaeb8943f2bfb79eca08205b560812e02f6ae`：默认处理与原片替换的**等待任务**支持从列表和详情置顶，跨页操作返回同一筛选下的第一页，保留原始入队时间；正在运行的任务不被中断，失败记录不重新入队，暂停／被其他队列阻塞的任务仅改变未来的领取顺序。界面说明阻塞原因，不偷偷恢复暂停队列。依用户要求，仍无失败请求重试／取消按钮。

共享控制器提供 `rhvideo.task.priorityState`、`rhvideo.task.prioritize`（`kind`、`id`、`expectedRevision`），并新增 `rhvideo.server.state` 读取实际队列、筛选和加载状态。优先检查当前账户／进程及任务仍为 pending，再提交一个固定的 `POST /processing-tasks/{kind}/{entry_id}/prioritize`；旧快照、并发点击、正在运行／失败／其他账号任务均不提交写请求。写入回执未确认时明确提示核对结果，不重放；写入成功但列表刷新失败则保留成功回执和刷新警告。账户变化、筛选变化、关闭后重新打开的面板不被旧回执跳页、重开或覆盖。

同时修复原片替换页切换“默认处理”仍显示替换队列，以及替换队列无法查看失败记录。任务缩略图在实际解码前不可放大，失败显示占位且不弹循环错误；同一任务／阶段保留现有图片节点，不在每次状态刷新重新请求已失败图片。这里修复的是控件和读取行为，**其他任务详情目前仍有通用字段表，尚不代表与参考工程完整的流程／指标展示体验等价**。

独立控制器、筛选与脚本回执测试覆盖关闭／账户代次、重复请求、错误路径、历史任务、整数溢出、未确认写入和仅刷新失败。Node 完整回归 **782/782、零跳过**（`rhvideo-task-priority-full-node-first.log`），Rust RHVideo **66/66、零忽略**（`rhvideo-task-priority-rust-full.log`）。Windows 当前 debug EXE SHA-256 为 `85d3fc1c0bd145807f89be76a319481e717f4d0f00109ff8ae561f58d3658735`；真实控件／受控故障与真实后端用例 **2/2**（`rhvideo-task-priority-ui-real-framed.log`），分别为 `rhfiles-e2e-Ss9xtf` 与 `rhfiles-e2e-U7ihRX`。Android JVM 构建测试 **414/414、无失败或跳过**；压缩 APK 的模拟器实测仍单独记录。

真实 API 用例只创建新数据库与样本：70 个默认等待任务、跨页替换队列、运行／失败记录、暂停与其他账号的批次。为稳定检查 UI 与持久化次序，**仅该 fixture 暂停自己的自动编码 worker**；之后另外调用源码中实际的 `_claim_next()`／`_claim()` 证明领取顺序为 `queue-068`、`queue-069` 和替换项 `60`，暂停项 `101` 保留、既有运行和失败记录不变，所有样本源字节一致。这是实际领取逻辑和状态约束验收，不是宣称真实编码进程的性能测试。测试脚本最初直接解析含源项目日志的 stdout 而失败，改用唯一有边界的 JSON 回执并保留日志；没有重发同一测试数据库中的置顶操作来凑通过。

最终同一 EXE 的基础媒体流程、重复项及置顶串行 Windows 回归为 **16/16、零跳过**（`rhvideo-task-priority-windows-regression.log`），含真实原生四格、H.264／HEVC、五万项可达性及真实导出文件字节。该轮 H.264／HEVC 原生打开至显示统计仍约 **5.06／5.94 秒**，不是首帧性能修复；共享主机还在运行其他构建／模拟器任务，不将该轮用作独占性能对比。

Android release 实测在自有 `emulator-5584 / RHFilesRhVideoQA20261027` 通过（短路径镜像 `rhvideo-task-priority-android-first.log`，证据 `rhvideo-android-task-priority-1793287065708-release`）。已核验物理按钮、默认／替换页三到页一、失败记录、原始入队时间、暂停原因、其他账号拒绝及 UI 契约；服务器只接受四次置顶，未收到任何 retry／resume／pause／cancel 请求。独立实际 worker 领取与 Windows 得到相同结果，原始样本哈希保持不变。APK SHA-256 为 `7312f942b237f8d321d70a33d8729de79103be517cb5b9f6cf0de6568a79b661`，探针为 `f42c219651be7568b3438db8324a1dd45f815049a1da7c4958537312a464c9d2`；这仍是复用未改动 Rust 原生库的增量 QA 包，未发版、未替换正式实例或操作实体手机。

完整目标继续保留：任务步骤／指标应从通用字段表改为完整的可读流程；默认队列不应提供仅替换队列适用的历史筛选，未变化的详情刷新也应避免重建控件。原生播放冷启动／卡顿、完整最终分发与所有旧边界仍需继续验收，以上通过不代表全部 UI／性能已经等价。

## 2026-10-29 疑似重复流程接入与真实后端验收（完整目标仍未完成）

对照工程已从 `869d632` 前进到 `11f8d0a81f540d62763f484244b6dbf91e726c22`，新增的疑似重复功能现在接入共享前端及 Windows / Android 原生会话。显式扫描由 RHVideo 后端持久处理；支持图片画面和视频首帧分组、类型过滤、组分页、继续加载成员、鉴权 WebP 预览、原生视频核对、保留一项并明确确认暂存其余项、最近复核任务和每项结果分页。未加入失败写操作的重试入口，也不自动重发扫描／暂存请求。

新增 15 个 `rhvideo.duplicates.*` 界面 API、7 个固定 JSON 后端操作及独立受限的图片 GET 路径；界面复核提交必须提供当前进程／账户／扫描／分组修订和保留项，旧快照、迟到的账户响应、重复提交及不可信预览地址均被拒绝。只读刷新按页面可见性、任务活跃程度和失败次数有界暂停；关闭界面不取消服务器上已接受的任务。旧后端返回 404 时明确提示更新后端，不把不存在的功能显示为成功。

实际 Windows 使用新建 FastAPI / SQLite fixture 扫描 **30 个有效源文件**，得到 28 张图片的一组和两段视频的一组；视频由现有原生解码器实际播放。确认保留一张后，27 张进入真实 30 天暂存区，逐项结果以 25 + 2 分页返回；随后通过真实恢复接口逐个恢复，27 个原始 PNG 和保留项、视频、小说均核对 SHA-256。测试不使用生产数据库或真实媒体文件。最后构建的 debug EXE 为 `8b530135034363746dd8cc7485d97643cfe6ed6241f1008b1f5739c6eb9dea8b`；完整本轮结果以下述最终日志为准。

新控制器独立回归 **15/15**，含迟到读取、跨账户／进程状态、成员分页不前进、未加载保留项、显式失败且不重放，以及完成任务触发一次媒体缓存刷新。更新到当前参考源码后的 Node 回归 **766/766、零跳过**（`rhvideo-duplicates-current-reference-node.log`），Rust RHVideo 回归 **65/65、零忽略**（`rhvideo-duplicates-rust-full.log`）。源码审计现纳入外部模块自己的 API，而非仅依赖 185 个 inline 控件；14 个源模块无未登记项，**不代表完整体验与性能已完成**。

保留首轮失败证据：真实后端测试曾过早调用未就绪的界面 API；后续最终构建的合并回归又在扫描刚结束、分组读取尚未返回时断言组数，得到 0 而非 2。测试现在分别等待界面 API、扫描完成和分组投影加载完成，不延长实际解码时限、不伪造扫描结果。Android 首次直接 Gradle 构建缺少 Tauri CLI 构建会话，后续复用未修改的已验证 Rust 库重建 Kotlin／资源；安装前 ABI 检查又拒绝了含 32 位第三方库却无对应 RHFiles 库的 QA 包，未安装／发布该包，按实际 `arm64-v8a,x86_64` 库限制 QA 打包架构。

上述最终 EXE 的 Windows 重复项、真实后端、喜爱、主截图页及标签规则串行回归为 **16/16、零跳过**（`rhvideo-duplicates-windows-settled-regression.log`），实际后端证据在 `rhfiles-e2e-SUvzcD`，控件验收在 `rhfiles-e2e-C8I1ek`。它是本轮相关功能回归，不替代旧章节不同构建的 97 项完整验收。Android JVM 回归为 **413/413、零跳过／失败**；真实模拟器结果继续单独记录，不能用 JVM 绿灯代替原生 APK。

Android 压缩 APK 在自有 `emulator-5584 / RHFilesRhVideoQA20261027` 连续两轮完成真实扫描、物理点击、Media3 出帧、320px 鉴权 WebP 预览、28 个成员可达、一次复核、25 + 2 项结果、27 次恢复及全部原始源字节核对；公开 UI 契约无缺项。第二轮另外验证保留卡片的可见高亮／文字，并在绘制后截图，不把输入注入已返回当成高亮已经出现。产品 APK SHA-256 为 `331c12a8e543b3d59563c3c2a883a00cadcae0308528e8880f25cafd2e6f7bfd`，最终探针为 `6ff67366ff956de3b93100fea4f6909597c0a917e2e28b902d3bf43b8fc74087`；日志在短路径 QA 镜像的 `rhvideo-duplicates-android-{abi-verified,painted-final}.log`，最终截图／请求／原生日志为 `rhvideo-android-duplicates-1793284763100-release`。未操作实体手机、正式实例，未发布这份增量 QA 包。

此后对照工程又出现**尚未提交的任务置顶修改**（`static/index.html`、`static/task-center.js` 及实际处理队列 API／服务）。显式重跑当前源码审计在 `rhvideo-duplicates-final-harness-explicit-reference.log` 正确失败；没有更新这些哈希来掩盖未实现的功能。上面的 766 项全通过对应先前核对的 `11f8d0a` 来源，不代表这一轮后来的工作区变化已经验收。下一项继续对齐任务置顶；原生播放冷启动、完整发布与其他历史未完成项仍未完成，完整目标保持进行中。

## 2026-10-29 系统原生接口的实际对照与新增外部模块缺口（完整目标未完成）

新增独立 C++ 对照使用微软 [MediaEngine / DirectComposition 接口](https://learn.microsoft.com/en-us/windows/win32/api/mfmediaengine/nf-mfmediaengine-imfmediaengineex-enablewindowlessswapchainmode)，不是 HTML video、嵌套网站或替换当前产品后端。`scripts/testing/build-mf-probe.ps1` 只在本地生成测试程序，`rhvideo-mf-probe.mjs` 只用自身的回环 HTTP 源／固定本地副本、自有窗口和临时目录。进程内 15 秒上限、宿主 20 秒兜底；仅在显示统计后读取自有窗口，不读其他窗口、不装解码器或改变系统／正式实例。回调在销毁窗口前解除绑定，释放媒体引擎及 COM 后才结束。源码不进入发行目录。

最终对照程序 SHA-256 为 `97e8b0ee5927962bc08e7c872d8f57da1f43c9a2c414e4907c37cb6dd607e540`。同字节 1080p H.264／AAC 的本地文件与 HTTP 轮次均通过实际窗口四角像素、原分辨率、音轨存在、暂停、定位、倍率及恢复后时间确实继续前进的检查；不是只看方法返回成功。日志分别为 `rhvideo-mf-final-h264-file.log`／`rhvideo-mf-final-h264-http.log`。显示统计首次观测为 **5.303／2.799 s**，正像素取图的上界为 **6.006／3.096 s**；取图本身分别占约 703／297 ms。没有早期负像素样本，不能把统计时间冒充精确首帧。更早同源 HTTP／本地轮次还观测过约 4.98／4.49 s，不能挑选最快一轮称作稳定优化。独立程序没有 WebView／RHVideo 代理，因此也不能把它直接当成与完整客户端同口径的胜出基准。AAC 流未删除，未测量实际声音输出。

同一最终程序的 4K HEVC／AAC 对照**失败**（`rhvideo-mf-final-hevc-http.log`）：约 0.778 秒收到 `0xC00D5212 / MF_E_TOPO_CODEC_NOT_FOUND`，本机当前系统管线没有找到该源的解码器，随后正常释放结束。没有自动安装系统组件，也没有降分辨率、删音轨或以 H.264 通过代替 HEVC。当前证据不支持用此系统内核直接替换现有 libVLC；产品播放流程／内核／参数未因此更改，启动性能仍未解决。

另一项新的权威差异来自正在修改的 `D:\git\RHVideo`：HEAD 仍是 `869d632`，但未提交工作目录已增加 `static/duplicates.js`、疑似重复 UI 和 8 个 duplicates 路由，并改变设置／契约。**RHFiles 尚未实现该新增功能组**，不更新映射哈希来把它伪装成已完成。当前审计原始报告是 `rhvideo-current-reference-drift-with-modules.log`。

原来的 inline 控件总数仍为 185，因为新按钮复用了 `switchTab`；只数 inline 回调会漏掉整个外部功能模块。新增红测 `rhvideo-external-module-inventory-red.log` 后，审计现合并 HTML script、契约 `sources` 和 `script_order`，明确报告没有清单的外部文件；旧基线另外补齐配置备份、自动化适配和搜索客户端／Worker 的实际文件哈希。固定参考版本共 13 个文件均核对，新增模块不能靠更新 index 指纹蒙混通过。当前工作目录的结果明确包含 `unmappedModules: ["static/duplicates.js"]` 及 index／settings／operation-contract 的变化，审计保持失败。

固定提交的独立参考副本下，共享 Node **749/749、零跳过**（`rhvideo-mf-module-node-regression.log`）；这不意味着当前正在改动的 RHVideo 已全量对齐，也不是 97 项 Windows 回归／Android 发行验收在新内核上的通过。此轮没有发布或操作真机。后续仍须补入当前缺失业务，并继续解决原生首帧、应答等待以及下文保留的实际生命周期验收缺口。

## 2026-10-29 应答延迟的继续定位（没有性能修复结论）

正式运行实例和手机未动，后续改动仍限隔离调试观测及测试脚本。主窗口焦点模拟 0／1／1／0 四轮均有约 1.96 秒的“播放分支末尾→网页收到”间隔；媒体库自己的焦点模拟对照也没有稳定消除它。原始记录为 `h264-host-focus-{1..4}-*.log` 和 `h264-library-focus-{1..4}-*.log`，报告另存是否启用了主窗口／媒体库焦点模拟，不把仿真结果冒充真实输入归属。

新增有界浏览器网络时间记录只接受当前自有调试端口上的 page 目标，不拦截请求、不改缓存或网络设置，只跟踪最多 4 个播放请求、64 条数值阶段；不把请求参数、请求／响应头、URL 或正文写入报告。对应收集器验证敏感字段丢弃、上限、未知请求及拒绝远程主机／其他端口／带凭据地址。`rhfiles-e2e-v1jPyx/startup-measurement.json` 记录分支结束／UI 排队标记均约 0.366 秒，而浏览器约 2.303 秒收到响应头，正文仅 925 字节；前端约 2.311 秒返回。跨源资源时序中不可见的字段明确保留 null，CDP 未提供的阶段为 -1，不能将它们当成实测零耗时。

后续同时观测本应用外层 HWND 与 WebView2 自有容器，并发出 5 个有限 UI 排队检查，不请求激活窗口或记录键值。构建 `dc634729d57950c4fba300492de6ca88734acf540e0780a98e3c0a07c27b4768` 的实测中，分支约 0.303 秒结束、网页约 2.255 秒返回，而五个 UI 队列等待均小于 1 ms（`h264-container-dispatch-1.log`、`rhfiles-e2e-p9e8S4/startup-measurement.json`），没有观测到相应的长窗口消息处理。不能将之前一次立即排队通过过度解释为整段 UI 都空闲，也不能将现在的结果直接归因于 Windows DNS／DPI／RDP。

为排除分支末尾之后的作用域释放，再在最外层命令返回前加标记。构建 `b7710b1d7c6c4b73e89c51013974deb0c7c0fd34695a84368e5064f135b7f738` 通过 RHVideo Rust **63/63**（`rhvideo-command-return-rust-tests.log`），实际探测分支 0.609020 秒、命令返回标记 0.609199 秒，五个 UI 排队等待仍小于 1 ms，浏览器约 2.528 秒收到头、前端约 2.545 秒返回（`h264-command-return-1.log`、`rhfiles-e2e-aUQ216/startup-measurement.json`）。这进一步划清应用命令处理与后续应答边界，**不是已找到框架根因或修复了卡顿**。没有私改 SDK／IPC，也没有改画质、音轨、缓存默认值或业务流程。

共享 Node 最终 **735/735、零跳过**（`rhvideo-command-network-node-final.log`）。这些新增诊断构建并未重新运行完整 97 项；下节的 97 项及最终 release 的 13 项仍按各自 EXE 哈希保留，不能挪用为最新 debug 的整轮结果。

系统原生播放接口目前只核对了微软 MediaEngine／DirectComposition 的资料与本机组件是否存在；还没有实现／集成或验证替代内核，不能拿它当成已完成的优化。现有播放器保留，任何后端对照均须保持取池、队列、控制、返回位置及实际画面验收。

## 2026-10-29 最终只读取图构建的完整业务回归（性能仍未完成）

原样运行 `ecf876045d20992d863be7d3d27d5d2fec7c780a96b3031357522b53f57622d7` 对应的开发构建及真实 ZIP 中的 3.0.24 运行库，全部 Windows RHVideo 用例串行为 **97/97、零跳过**，耗时约 19 分 50 秒（`rhvideo-owned-readback-windows-regression.log`）。本轮正常用例未启用新的 stdin 取图通道；实际图片、源切换、原生物理输入／返回关系、连播／同屏、五万项可达性及真实 FastAPI／SQLite 均经过检查。该结果不抹除上一轮 95/97 的失败，也不将观测就绪条件的修正称作产品间歇故障根因修复。

本轮 H.264／HEVC 专项从原生输入打开到显示计数分别约 **4.14／6.73 s**，仍有明显启动开销；这不是无干扰独占性能基准，更不是已达到原版性能的证据。测试使用开发 EXE 与发行运行库的组合，不是最新 release ZIP 的整包验收。界面、接口与业务回归不能代替性能及最终分发验收，完整目标仍未完成，正式实例未替换、未发新包。

## 2026-10-29 冷启动测量边界与自有进程只读取图（完整目标未完成）

后续增加仅隔离 Windows debug 生效的 `player.trace` 只读诊断：VLC 回调只复制有界的模块名／未展开的启动阶段格式模板并记录生产时单调时钟，不读取 `va_list`、不保存 URL／令牌参数、不在回调中做 I/O。每个输入最多 96 条、12 秒，32 KiB 应答上限；换源先等待旧输入结束再重置，销毁引擎先卸载回调并等待在途调用结束。另有最多 128 条进程级 Rust 启动阶段，可在 VLC 保持 quiet、完全不装日志回调的情况下读取。正式构建不编译这些模块，也没有新网络监听。

新增协议用例包含预期输入与禁止修改诊断设置；共享 Node **731/731**（`rhvideo-producer-trace-node-regression.log`）、RHVideo Rust **63/63**（`rhvideo-producer-trace-rust-final-2.log`）均通过，零跳过。首个实际 trace 构建为 `a857614d63d3daa90cbcd79739b09d28f07e6c8681ad202d492797b6fb47b5c8`；H.264 首轮显示计数观测约 6.19 秒、同构建复测 2.42 秒，HEVC 3.62 秒；关闭回调的 H.264 为 2.21 秒。生产阶段记录显示模块加载、D3D11 创建设备／纹理池和首图准备都占时间，**没有足够证据把波动归因于其中唯一一项或称作优化完成**。完整原始回执及模板在对应 `startup-measurement.json`，不能用主机 stderr 的批量收到时间替代。

后续 host-only 构建 `0bbcbfab70cbb9dd0118f7b11a25b80e272ec8a812f0ecf0ddf6664730ee1d34` 在完全 quiet 下分别于 0.260／0.308 秒结束后端播放请求，前端约 0.271／0.316 秒返回，但 H.264／HEVC 的显示计数仍晚至约 4.36／9.58 秒（`h264-host-quiet-after-stats.log`、`hevc-host-quiet-after-stats.log`）。输入读取已较早开始，不能将返回快说成出画快。两轮通过实际公开关闭入口释放原生播放器后才结束进程；这些时间均为共享主机上的观测，不是独占 GPU 对照。慢结果之后的只读采样确有其他进程占用 GPU，但不能据后来的采样推定此前卡顿根因。没有更改解码、画质、缓存或音轨默认值，性能目标继续未完成。

同一最终 debug 的真实生命周期探测已通过（`h264-producer-trace-lifecycle.log`、`rhfiles-e2e-ZScVIp/startup-measurement.json`）：同源重开输入从 1 变为 2，旧输入的 trace 读取被拒绝，新输入有 45 条实际阶段，公开关闭后确认播放器未打开，才结束进程。此轮又复现后端 0.300 秒完成、前端 2.256 秒才接收的间隔；不是将前端等待记成原生打开本身耗时。仅在测量前让一条未发送的安全读取选用框架已有 fallback 后，对照 postMessage 的前端两轮为 **2.261／0.337 s**，默认传输复测 **0.375 s**（`h264-host-ipc-{1,2}-postmessage.log`、`h264-host-ipc-3-default.log`）；两条路径都可能快慢，不能据此替换正式 IPC 或说传输根因已找到。没有重发已送出的写操作。

最终分发验收另复现了 Windows PowerShell 5.1 缺少 `Path.GetRelativePath`／`Dictionary.TryAdd` 的兼容问题（`rhvideo-final-readback-velopack.log`、新增红测 `rhvideo-libvlc-powershell51-red.log`）。清单现用经过边界检查的字面子路径及单线程 ContainsKey／Add，保留大小写／重复／junction／字节校验；新测试还验证中文、空格、# 和 % 文件名。重复项夹具保持总文件数不变，确保真正进入重复键检查，而非被数量不符提前拒绝。策略 **18/18**（`rhvideo-libvlc-powershell51-policy-final.log`）、全部 Node **732/732、零跳过**（`rhvideo-final-readback-node-regression.log`）。兼容修复 `e95e0fb` 已推送两个远端。

随后 Windows PowerShell 5.1 真正打包与压缩后便携／完整更新包校验通过（`rhvideo-final-readback-velopack-final.log`）。输出只在本机 `dist/rhvideo-native-velopack-20261029-final-readback/`；full nupkg SHA-256 为 `459c94aa3d5a7c8128002b4119176c15663b9c0e4927c3a20e3905ceb32b6e8f`。从实际 ZIP 提取的 release EXE 为 `a60c0fd747888d9baa8d308d18790a56a7a1cc87950d0bf097f4d3e2e851b3de`，整包 **13/13、零跳过**（`rhvideo-final-readback-portable-release-e2e.log`），实际默认硬件输出、3.0.24／索引／AAC、真实服务写入及 ZIP 下载均包括。此轮 H.264／HEVC 统计首帧约 **2.81／5.13 s**，仍不代表同性能。实际该 release 拒绝私有读取通道，debug 自有主窗口实际取图通过（`rhvideo-producer-trace-actual-smoke.log`）。没有正式发布或替换正式实例，完整目标未完成。

保持原带 AAC 的同字节 H.264 1080p／HEVC 4K、默认线程及实际硬件输出，随包 3.0.24 下再串行对照 1000／300 ms 缓冲。H.264 默认第一轮像素只有 **[0,2.526 s] 上界**，300 ms 为 **2.306–2.618 s**、默认复测 **2.767–3.155 s**；HEVC 默认 **4.384–4.706 s**、300 ms **4.663–4.990 s**、默认复测 **5.238–5.557 s**。每轮实际版本／索引模式和 AAC 解码块均核对；没有稳定加速证据，**发行默认仍为 1000 ms**。原始日志在配对目录的 `*-prebuilt-cache*-{a,b}.log`，不能把改变缓存参数本身当成性能修复。

为分开页面接口就绪与原生画面，新增仅 Windows debug、显式 QA 标志／测试配置目录／随机 nonce 都具备时才启用的**自有子进程 stdin/stdout** 通道。不监听端口，不接受播放／文件操作、外部窗口句柄或输出路径；只固定读取本应用状态／窗口／画面。单次请求限制 4 KiB、每进程 512 次，宿主最多一个在途请求，超时即关闭、不自动重试。回复匹配 nonce／请求 ID，正确处理分包、中文 UTF-8、超大日志行和进程结束。PrintWindow 取图放到自有界面事务执行，避免工作线程持有播放锁再同步请求界面绘制。正常测试不启用此通道，正式构建不编译它。

新增宿主协议用例 **6/6**；本机当前参考源码下全部 Node **730/730、零跳过**（`rhvideo-owned-readback-node-regression.log`），RHVideo Rust **59/59**（`rhvideo-owned-readback-rust-regression.log`）。最终 debug EXE SHA-256 `ecf876045d20992d863be7d3d27d5d2fec7c780a96b3031357522b53f57622d7`，release 为 `ccda951d746310aff2ea007a865c1e4bd859ef15835df4ae2e4a5b3ace0584c9`。实际进程冒烟验证了 1200×800 自有主窗口非空画面、没有播放器时明确失败、不能提交播放命令，以及**新正式构建拒绝该通道**（`rhvideo-owned-readback-actual-smoke.log`）；没有操作正式安装或物理手机。

独立早期取图并不自动等于无干扰基准。首个 stdio／PrintWindow H.264 为 **6.243–6.581 s**，首次取图调用本身约 **1695 ms**；后续仅在显示计数后取图只有 **[0,3.500 s] 上界**，再一次早期轮询为 **2.839–3.141 s**，不能据首轮就归因正常播放器慢 6 秒。直接 DC 读取的候选（EXE `c1b967cf860b0deb41fbc04e5a7ec07720121872cf5ed0bd4e5c7bd296824ce4`）在有显示帧时仍未取得四个颜色标记，已从源代码撤回，不拿黑图声称播放失败。证据为 `h264-prebuilt-early-stdio-*.log`；保留实际 BMP／统计／媒体请求，不把它们当成完全同口径的浏览器首帧比较。完整 97 项及最终包运行仍须重验，启动性能目标未解决，没有正式发布。

## 2026-10-29 手机原生菜单的稳定反馈与语言（本轮通过，完整目标未完成）

先用原主 APK `d1acf6a9829738805459541066d26a53184dac94c6891abe9a849abd346c6657` 和新探测 APK `c8a8d2d8ed00fa92df97b71d8515bbfc4164866a2ed719a15aade3def70e235b` 在自有模拟器跑完整 Single，通过（短路径 QA 的 `rhvideo-menu-stable-native-android-single.log`、`rhvideo-android-single-1793267913912-release/`）。倍率设置后等待真实设置／弹窗消失，再重新打开菜单核对选中项与旧项取消；截图实际勾选 **1.25×**，不是仅靠下一次 API 读取代替视觉反馈。未修改主包、未重启模拟器或操作物理手机。

该图仍显示英文 `Normal`。新的真实资源单测先红（`rhvideo-native-labels-red.log`，预期“速度”、实际 `Speed`）；开发代码现只给 `RhVideoPlayerView` 传入与内置中文页面一致的局部资源上下文，保留原主题，不修改 Activity／系统语言或播放引擎。Android 全部 JVM **411/411、62 份 XML、零失败／错误／跳过**（`rhvideo-mobile-chrome-android-build.log`），包含原有播放、旋转与队列测试。手机放映窗另外只改 CSS：全屏深色控件、弹性剩余画布，不改变操作顺序、按钮与接口；运行截图仍须核对。

新主 APK SHA-256 `4694a6422bb5da65764ecb4f9042024d801efb7a4d9bccce7421728b53074b72`，首轮探测 `d3b76f63ace367772b665979f38c82823aba7b193fcf6770c2f5808711084489` 的实际 Single **失败**（`rhvideo-mobile-chrome-native-android-single.log`、`rhvideo-android-single-1793268839315-release/`）：视频已有帧，但在一个截图父层视频中，显示控制栏后通过后台页面反复读取 fully-visible 状态，未能在自动隐藏前进入真实按钮点击。没有删该断言或改隐藏时长。后续探测只发一次原有 `controls.show`，记录其应答耗时，直接使用已有的原生 alpha／裁剪／屏幕／焦点／稳定位置条件观测并点击；不反复显示、不用 performClick 代替实际触摸，总等待预算也没有增加。主包不变，仅探测 APK 改为 `23462d825868e4c44ffc25051c3c2eaf66a8fc915c7585c4ea59d25e1dfce5c9`。

第二轮 **Single 完整通过**（`rhvideo-mobile-chrome-native-android-single-2.log`、`rhvideo-android-single-1793269347887-release/`），包含原有分类／真实卡片选择、原生播放／菜单、单项父层／逐次返回、账户与模式隔离、内容探测图片／拒绝 HTML、收藏放映。已查看新的原生播放器与放映实际截图：中文“正常／1.25 倍”且勾选 1.25，所有原有放映按钮保留、图片确有像素、白色按钮／圆角弹窗已改为整页深色布局。应答记录中可见 fullyVisible=false 后真实按钮于后续稳定位置可点击，不将应答当成已绘制。运行前后 `media.resource_manager` 在 5 秒内返回（`rhvideo-native-hit-target-{before,after}-media-resources.txt`）；没有重启或重置模拟器，也不据此宣称旧媒体资源分配间歇故障已经定位。主包版本仍为本地开发构建，没有正式发布或物理手机安装，完整功能与性能目标仍未完成。

## 2026-10-29 实际发行包的原生内核与插件索引（完整目标未完成）

Windows 发包现准备官方非 GPL `VideoLAN.LibVLC.Windows 3.0.24`，固定来源／SHA-256，构建时生成匹配的插件索引，附带 LGPL、来源／源码链接和动态替换说明。GPL cachegen 仅作隔离构建工具，不进入运行目录；不安装或修改系统 VLC。准备脚本拒绝无效旧目录、越界路径和链接，不在失败时覆盖已有目录。清单记录精确文件集合／大小／哈希，stage、实际便携 ZIP 和实际完整更新包均校验；不是仅验证压缩前目录。

第一次实际 Velopack 打包被新门禁正确拒绝（`rhvideo-libvlc-real-velopack-build.log`）：所有插件解压时间变成了 DOS 1980，尽管字节不变，也会让 VLC 将索引视为过期。现按 [VLC 3.0.24 的模块加载实现](https://github.com/videolan/vlc/blob/3.0.24/src/modules/bank.c)，仅在匹配运行版本、显式随包标记和完整索引存在时启用 `--plugins-cache --no-plugins-scan`；其他运行库仍正常扫描。发包门禁只额外接受 Velopack 已知的确定性时间，不允许任意改时间／漏文件／改字节。应用不重写安装文件、不在运行时强制哈希，因此用户仍能替换动态库；自定义插件应重建索引或删除标记。

新打包策略用例 **17/17**（含时间／越界／junction／篡改的反向用例，`rhvideo-libvlc-zip-epoch-policy.log`）；本机实际参考源码下 Node 全部 **724/724、零跳过**（`rhvideo-libvlc-prebuilt-node.log`）；Windows RHVideo Rust **57/57**（`rhvideo-prebuilt-rust-regression.log`）。新 debug EXE SHA-256 为 `5034359d817b9e76171f12898f12bff93ab8936ca40bfdccc6a5110954d8cd7e`。模拟 Velopack 时间戳的独立副本实际解码 H.264 和静音 AAC，证明实际加载 3.0.24、索引模式、视频帧／音频块均存在，verbose 日志确认没有递归扫描或 stale cache（`rhvideo-prebuilt-native-debug.log`）；这不是物理声音测量。

随后真实 Velopack 构建与两种包解压校验都通过（`rhvideo-libvlc-prebuilt-velopack-build.log`），仅输出本机 `dist/rhvideo-native-velopack-20261029-prebuilt/`，没有发布。release EXE SHA-256 为 `dfaea9543991b193c7e6defac499f62cd7418ba11c17773cc69e95675a282332`；完整更新包 SHA-256 为 `2ac82dcb4b107fd01f856137a6edf8b02508b109c5f5c175a69cfae48f7053ce`。从真实 portable 解压出的 release 程序通过 **13/13、零跳过**（`rhvideo-prebuilt-portable-release-e2e.log`），包含随包内核／AAC、同屏、定位／暂停／翻组、实际 FastAPI／隔离 SQLite、配置合并和 ZIP 下载。不是只运行工作目录的 EXE，也没有把系统 VLC 的通过结果转记为随包版本。

完整 **97 项** Windows RHVideo 回归在独立副本串行结束为 **95 通过、2 失败、零跳过**，耗时约 22 分钟（`rhvideo-prebuilt-bundled-windows-regression.log`）：使用实际 ZIP 的运行库和新 debug EXE，以保留仅 debug 开放的实际像素观测。不能将此构建称为原字节的 release 程序；上述 13 项才是实际 release 程序结果。失败是换源时单次抓图为黑色，以及收藏放映 Home／End 没有到达页面。后续换源／放映专项 **4/5**（`rhvideo-prebuilt-switch-slideshow-focused-1.log`）：三次真实红横屏→蓝竖屏→红横屏通过，但键盘失败再次出现，不能称为两项已修复。没有焦点模拟的键盘复测仍失败（`rhvideo-prebuilt-slideshow-real-focus-1.log`）；移除新窗口重复焦点调用的候选 EXE `ccbb7173c4c83527b855c2b2181796be74c1a02509c77c61a69bcb0e8776a932` 也失败，候选产品改动已撤回。随后两个诊断读取顺序均曾通过，尚不能归因为读取顺序；继续检查实际原生输入归属，不以偶然一次通过抵消失败。

换源验收现将实际 RGB 与尺寸／帧统计放在**原有同一个 25 秒**就绪预算内，同时保留首／末 BMP 和有界读数；解码器显示计数不等于 DWM 抓图完成。错误颜色持续、旧输入／旧时间线、无新帧仍失败，不通过延长预算、丢音轨或降低分辨率解决。完整回归的 H.264／HEVC 内核统计首帧仍约 **3.69／5.08 s**，因此分发与索引修复不等于播放性能已解决。Android 原包／原生回归仍按前节记录，当前没有新 APK 或物理手机安装，没有改变正式实例，完整目标继续保持未完成。

后续增加仅 Windows debug 且显式 `RHFILES_NATIVE_PLAYER_QA=1` 可用的 `diagnostics.windows`：在自有 UI 线程只读取本应用各窗口的前台／活动／子孙输入焦点布尔值，不返回外部窗口句柄或内容、不安装钩子、不请求激活。EXE SHA-256 为 `83baf677970e4032f1f7ccbf6a96e2eeced1f01bd7545349ec2283ba27208859`。实际媒体库这三项为 true 时，旧 `Window.isFocused()` 仍为 false，因此不能将那个缓存值当成原生输入丢失证明。键盘验收不用焦点模拟、不注入 DOM 事件、不先点击，现等待真正的输入归属；换源／放映 **5/5**（`rhvideo-native-readiness-focused-final.log`）及随后两个独立进程的键盘专项各 **1/1**（`rhvideo-native-input-ownership-repeat-{1,2}.log`）通过。共享 Node 再次 **724/724**，RHVideo Rust **57/57**（`rhvideo-native-window-{node,rust}-regression.log`）。这证明新增观测与有界就绪条件本轮通过，不证明既往间歇故障根因已完全消除，也不把原 **95/97** 改写成完整通过；整轮仍须再运行。

## 2026-10-29 备份规则入站校验与 SDK 后续验证（完整目标未完成）

此前的读取兜底未覆盖配置备份：`media_tag_filter` 是合法 JSON 对象但 `include` 是字符串时，导入仍可能覆盖可用规则。新增红测已复现。共享恢复入口现在先执行同一套标签规则语义校验；无效字段不覆盖当前设置，其余有效字段继续合并。界面与 `configuration.restore` 应答同时说明“已忽略无效页面偏好：标签筛选”，应答另含 `ignoredPreferences`。已完成的服务端合并仍是 `applied:true`，确认票据不可重放，不把客户端警告改成可再次提交的失败。

新 Windows 开发 EXE `5d40e6ac7c7b07d86051996b8a95aca0aa15e91d01240dbfc2d1fd3af5e93d35` 已通过实际 RHVideo FastAPI／隔离 SQLite 的完整用例（`rhvideo-sdk-actual-backend.log`）：真实原生解码、备份预览／恢复、损坏规则保留、音量 31、实际面板警告、确认不可重放，以及原有喜爱 ZIP／后台下载均检查了。失败规则导入后的截图已查看。共享 Node 全部 **707/707、零跳过**，本机使用当前 `RHVIDEO_SOURCE`，不是缺少参考源码的 CI 结果。该测试不代替 Android 安装包验证或下面仍未解决的播放性能。

Windows 原锁定 2.10.3、Android 原锁定 2.11.5 都在官方 [GHSA-w28w-mhc8-qvjv](https://github.com/tauri-apps/tauri/security/advisories/GHSA-w28w-mhc8-qvjv) 范围内。两端及 Android 测试 SDK 现统一精确锁定 **Tauri 2.11.6**，配套 runtime/runtime-wry 为 2.11.3／2.11.4，utils 为 2.9.3，保留现有 WebView2 COM 接口版本。新增版本下限／锁文件／两端一致性门禁。实际 SDK 的 channel 队列按 WebView 隔离，并在读取／销毁时使用窗口身份；没有修改应用自己的 IPC 传输实现。尝试在本工作区直接运行外部 tauri 的单测未成功（`rhvideo-sdk-upstream-channel-tests.log`），不能声称已运行上游隔离测试或完成全部安全证明。Windows 应用自己的 RHVideo Rust 测试 **38/38** 通过；完整多窗口回归结果另记。

该新 SDK Windows EXE 的全部 RHVideo 窗口回归随后完整串行通过 **96/96、零跳过**，耗时约 22 分钟（`rhvideo-sdk-windows-regression.log`）。实际默认硬件输出、原生 CLI 关闭回执、窗口物理输入、暂停旋转、连播／同屏、图片／标签和真实服务写入／ZIP 都包含在内；原生专项 H.264／HEVC 统计首帧约 **3.40／5.23 s**，并非启动性能已达标。本轮最初与 Android 交叉构建有重叠，不能把总耗时当成独占性能基准；上述独立首帧对照未与构建重叠。Android 宿主 Rust／IPC／启动测试另为 **45+8+3=56 项**，全部通过（短路径 QA 的 `rhvideo-sdk-android-rust-tests.log`），不冒充真机或 Media3 运行验收。

Android 通过正常 Tauri Android 构建重新生成 2.11.6 的 Gradle 依赖及 **ARM64、x86_64** 原生库，不是只替换共享 JS 后沿用旧内核。原生构建日志为短路径 QA 的 `rhvideo-sdk-android-native-build.log`；后续 JVM／探测构建 `rhvideo-sdk-android-jvm-probe-build.log` 成功，新生成的 62 份 XML 共 **410/410、零失败／错误／跳过**。主 APK SHA-256 为 `d1acf6a9829738805459541066d26a53184dac94c6891abe9a849abd346c6657`，探测仍为 `f053e3317f7046c4e9d73a91622d728c966940308bbcb73c94b15078cc9c6f81`。此字节组合已在同一自有模拟器通过标签整条场景（`rhvideo-sdk-native-android-rules.log`），包含损坏已保存偏好重连、搜索焦点和连续触摸浏览；不是新的播放器通过结果，也未安装到真机或正式发布。

等 Windows 解码回归结束、所有构建停止后，此相同 APK／探测组合的 **Single 整条也通过**（`rhvideo-sdk-native-android-single.log`，`rhvideo-android-single-1793261846426-release/`）。包括真实带音轨视频、内容探测图片、实际原生菜单、单项父层／不同子身份返回、普通视频控制记忆与独立连播／账户、过滤后的收藏放映。设置按钮实际触摸点 `(876,2321)` 在 `1080×2400` 屏幕内，使用既有稳定几何 guard，没有重复点击或改 hide timeout。这轮运行前后 `media.resource_manager` 都在 5 s 预算内返回（`rhvideo-sdk-single-{before,after}-media-resources.txt`）；没有重启／重置模拟器，也没有修改播放器 Kotlin 来掩盖旧分配失败。此前超时尚未定位，**这一次通过不证明间歇故障已经修复**。

新 Single 的三张实际截图已查看。视频／图片确有像素，收藏放映工具条仍密集；倍速截图在刚点击 1.25 后仍拍到了待消失的菜单和旧 1.5 勾选，而随后不同入口重开读取到的记忆值已是 1.25。当前探测尚不能据此声明菜单的稳定视觉状态已验收，需补实际设置落地／弹窗消失的有界观测，不能拿瞬时截图或后来的 API 值互相替代。该模拟器英文系统下 Media3 还显示 `Normal`，也不是中文界面已完整汉化的证明。

保持同一带 AAC 样本、分辨率、默认缓存和硬件输出，增加仅 debug 生效的 `RHFILES_VLC_DECODE_THREADS`（1–32）诊断参数；探测回执记录“请求的参数”，不把它冒充引擎实际选择。六轮安静串行对照的 H.264 像素区间分别为 auto **3.466–3.815 s**／1 线程 **2.902–3.320 s**／2 线程 **3.677–4.043 s**，HEVC 分别为 **5.797–6.115 s**／**3.958–4.361 s**／**5.230–5.634 s**。后续带日志的反向对照中，1 线程 HEVC 反而为 **5.917–6.274 s**、auto 为 **5.149–5.592 s**。日志确认池从 48 降至 30 个 surface，但没有稳定更快的证据；发行默认线程／缓存／画质／声音均不改变。新 SDK 后仍有约 2.3 s 的页面应答，因此也不能将 SDK 升级说成启动卡顿已修复。所有日志位于已有配对目录的 `*-sdk2116-*`／`hevc-sdk2116-*-verbose.log`，debug EXE 哈希同上；详细日志的主机接收时刻不能当成每行的 VLC 生产时刻。

另外确认 Windows 发包脚本尚未附带 libVLC，现有检测会使用系统 VLC 或程序旁 `vlc/`。当前装有 VLC 3.0.23 的机器通过，不代表全新电脑也能播放；这是正式发布前必须补上的分发验收缺口。已核对 [VideoLAN 官方 3.0.24 发布目录](https://download.videolan.org/pub/videolan/vlc/3.0.24/) 和其非 GPL 的 `VideoLAN.LibVLC.Windows` NuGet 分包方式，不能直接把带 GPL 插件的完整 VLC 播放器复制进来。3.0.24 官方 NuGet 已下载到隔离的 `temp/vlc-3.0.24-inspection/`，SHA-256 `3da3f37ee2b2b10e5c788d830a3b513658c36521ea1b0f966ed86eb69f41ef3c`，`dotnet nuget verify --all` 成功（`rhvideo-libvlc-nuget-verify.log`）；尚未纳入发包或运行验收，未替换系统 VLC 或正在测试的播放内核。后续需保留许可证／源代码获取说明，在屏蔽系统 VLC 回退的隔离副本上验证真实视频／音轨／旋转／同屏及完整包。

后续只在 `test-artifacts/rhvideo-libvlc324-owned-app/` 复制同一 EXE 与 NuGet 的 `build/x64` 非 GPL 运行库，未修改 `target/debug` 或正式实例。最初屏蔽系统回退时临时重定向了子进程的 ProgramFiles／ProgramW6432：安静 H.264 超时且无媒体请求，下一次 verbose 出现真实像素但初始化达 6754 ms、像素区间 9.887–10.228 s（`h264-1080-libvlc324-private-no-system.log`、`h264-libvlc324-private-initialization-verbose.log`）。日志明确缺少 `plugins/plugins.dat` 并扫描 433 个模块，但环境改动和首次加载也有影响，不能把这两次直接当成无干扰的性能基准或正式包通过。

用官方匹配版本的 cachegen **仅在构建阶段**生成索引：官方 3.0.24 win64 7z SHA-256 `1ed59c09152e78aff84663fa76efab26057716576db74332858810e5ef54ae1f` 与发布校验文件一致；从中取 GPL 的 `vlc-cache-gen.exe` 放在隔离 `temp/.../cachegen-tools/`，配 NuGet 的两个 DLL，不放进应用运行目录。隔离 APPDATA 下生成耗时 630 ms，缓存 260709 字节。后续不再重定向 ProgramFiles，日志确认使用程序旁的 **3.0.24**、接受该索引，实例初始化降至 **46 ms**，AAC 使用 avcodec。这是新的分发构建线索，不是给应用增加每次启动扫描／后台播放。

该带索引私有副本的安静 H.264 首次取图已可见，只有 **[0,2.448 s] 上界**（观察器 2.344 s 才就绪），不能写成准确首帧；HEVC 像素区间 **3.173–3.548 s**。verbose H.264 为 **2.359–2.695 s**。日志为配对目录的 `*-libvlc324-cached-private*`，相同带 AAC 源字节／分辨率、默认线程和缓存、实际硬件输出；没有与其他 GUI 解码或构建并行。需要继续同条件重复、ZIP 解压后的索引有效性、真实音轨／旋转／同屏和全部功能回归。**上面的 96/96 使用系统 3.0.23，不能冒充此 3.0.24 副本已通过整轮**；正式 prepare／stage／许可证及来源说明尚未实现，完整目标仍未完成，没有发布新包。

## 2026-10-29 已保存规则恢复、初始搜索焦点与启动性能对照（完整目标未完成）

实际窗口红测 `rhvideo-rules-recovery-red.log` 复现两处行为退化：标签打开后打字没有进入搜索框；已保存的 `rule.include` 损坏后，重新连接在 `Editor.sync → updateConnection` 抛错，正常媒体也无法浏览。现按实际参考 `loadMediaTagFilter` 的兜底行为，仅在**读取已有偏好**时规范化规则，损坏时恢复全部内容并说明原因，不清空音量、排序、收藏规则等其他设置，也不修改传入对象。用户/API 主动提交的无效规则仍拒绝，不能用兜底掩盖失败。标签打开后立即聚焦搜索；编辑和滚动不反复抢焦点。旧 `rules.page` 在关闭时给出明确错误；返回有效缓存窗口不再残留其他窗口读取失败的提示。

模型另和实际参考加载函数做有效／损坏偏好的差分。真实窗口用例同时检查直接输入拼音、重新连接后的全部八个真实媒体卡片、其他偏好保留、无效主动编辑不改变现有条件，以及关闭后的旧 API 错误。Android 原生探测同样加入损坏偏好重连和实际搜索焦点，不将共享 JS 单测当成 APK 验收。最终构建／运行结果在本节后续补记。

源码对照门禁也发现旧问题：映射单测只检查旧清单自身，真正对当前参考运行审计仍退出失败（`rhvideo-rules-recovery-reference-inventory.log`），漏掉 `RHFavoriteExports.open` 且多个模块哈希已变。现在明确锁定实际 `869d632` 的 185 个索引页处理项（182 项业务映射、3 项帮助逻辑）和 9 个参考模块，扫描补入独立标签／导出模块；新单测必须核对当前参考提交、未映射项及模块变化。标签映射不再把 JSON 当成点选界面的替代。此门禁只是源码清单一致性，不能把原生选择器、后台下载和所有动态 JS 流程也称为已验收。

提交前另核对了九个参考模块的 Git blob 与工作区字节，发现三个文件因 Windows CRLF 检出而哈希不同。门禁现明确使用 `sha256-utf8-lf`，只规范化 CRLF，仍检测实际内容变化；新增 LF／CRLF 与真实源码变动的反向用例，避免把本机原始字节哈希直接带进其他平台 CI。当前 CI 没有提供 RHVideo 源码时，相关参考用例仍会明确跳过；本机零跳过结果不能冒充 CI 已完成同样的对照。

播放性能调查保留了字节一致、带 AAC 的 H.264 1080p／HEVC 4K 样本（`test-artifacts/rhvideo-startup-pair-1793251613695/`），通过实际 `native-hardware-auto` 输出与参考原页面对照。当前机器 Intel Arc B580，普通桌面没有改成 GDI、降分辨率或关闭声音。默认缓存仍为 1000 ms；新 `RHFILES_VLC_NETWORK_CACHE_MS` 只在 debug 构建接受 100–10000 ms 的有界诊断值，发行构建忽略。探测回执记录请求的诊断参数；请求参数不冒充已生效的发行配置。

旧 EXE `4560245e…` 的安静 H.264 首次标记像素区间为 **2.760–3.068 s**，HEVC 为 **4.652–4.958 s**；此前带调试输出的 H.264 区间为 **3.298–3.653 s**。同字节参考 H.264 `requestVideoFrameCallback` 为 **3.339 s**，这是浏览器回调而非同一种物理首次呈现测量，不能据此宣称性能等价。参考 HEVC 未产生回调，原记录为超时；探测现补存实际媒体错误／尺寸／就绪状态和失败截图，不把它当成原版的首帧耗时。`after-stats` 仅给像素首次观察上界，不能把该时刻当成真实首次显示。

300 ms 缓存试验有 HEVC 约 3.3 s 和 6.7 s 的相反结果，未采用为正式默认值。另试过向实际调用窗口发送一次性播放的最终完成事件：受控延迟响应和同票重发测试通过，但普通四轮对照仍有约 2.25 s 的页面应答，未证明稳定改善；相关桥接代码**已撤回**，不是保留一条未经证明有效的新播放路径。仍须继续定位原生首帧与页面完成延迟，不能把网络读完、控件可用或统计更新等同于画面已显示。

下一项尚未验证的线索：4K 日志实际分配 48 个 DX11 surface；VLC 3 的 [解码器初始化](https://raw.githubusercontent.com/videolan/vlc/3.0.x/modules/codec/avcodec/video.c) 将帧线程数量计入额外图片缓冲，[DirectX 解码池](https://raw.githubusercontent.com/videolan/vlc/3.0.x/modules/codec/avcodec/directx_va.c) 也计入线程相关 surface。应以有界 debug 线程配置做同画质对照，并覆盖软件解码吞吐，不能仅因缓冲数下降就修改发行默认值或称根因已确认。

发布前还须处理当前锁定 Tauri 2.10.3 的官方 [GHSA-w28w-mhc8-qvjv](https://github.com/tauri-apps/tauri/security/advisories/GHSA-w28w-mhc8-qvjv)（修复版至少 2.11.6），并验证 Windows／Android 原生依赖与多窗口隔离。此轮没有升级或声称该风险已修复，不发布正式包。

最终 Windows EXE SHA-256 为 **`a821b4e7277b352ce3215a2cb131b76eb98c4259465047063682bc0dc4aee297`**。当前仓库的 RHVideo Windows 测试完整串行为 **96/96、零跳过**（`rhvideo-rules-recovery-windows-regression.log`），不再只跑之前的 38 项子集；新增损坏偏好重连／直接打字、两万标签连续浏览、实际单视频／连播／同屏、图片／收藏／条带、原生 CLI 关闭回执、登录恢复及真实 FastAPI／SQLite ZIP 下载均包括在内。`native-hardware-auto` 的视频专项为完整分辨率实际显示帧，H.264／HEVC 的统计首帧约 2.49／4.03 s；专项样本没有 AAC，不能与上面的带音频配对样本混用。

同一最终 EXE 的带 AAC 配对补测：H.264 实际标记像素区间 **2.944–3.285 s**，参考页面回调 **1.777 s**；另一次无早期图像读回的 `after-stats` 上界为 4.184 s。两种计量仍不等同，但也没有稳定同性能的证据。参考 HEVC 仍未产生视频回调，失败诊断保存了 `readyState=4 / paused=true / videoWidth=0 / error=null` 及截图，不能虚构为明确解码器错误或可用的性能基线。日志为配对目录的 `h264-final-*`、`h264-reference-final-diagnostic.log`、`hevc-reference-final-diagnostic.log`。

共享源码在 LF／CRLF 回归补齐后最终 **702/702、零跳过**（`rhvideo-rules-recovery-node-final-lf.log`），当前参考源码审计也通过。前一轮默认报告器有一次收藏夹具文件级失败（`rhvideo-rules-recovery-node-accepted.log`，700/701）；没有保留可归因的具体堆栈。该文件单跑以及两次完整 TAP 重跑（701/701、702/702）均通过，但这不是间歇失败已修复的证明，失败记录保留。Android 本轮压缩 APK 验收见下文，不能引用上一包的通过结果。

Android 新共享资源构建通过，JVM **410/410、62 份 XML、零失败／错误／跳过**（短路径 QA 的 `rhvideo-rules-recovery-android-build.log`）。主 APK SHA-256 为 **`c9c418be7074aa5d43fab9f66cae075944462e7a3f6d720130c4917e0001ce4e`**，首次探测包为 `071a8f824b459d2a219484c5503788793c6862902c0edc2e179de304e16933c9`。该字节组合的标签整条回归通过（`rhvideo-rules-recovery-native-android.log`，`rhvideo-android-rules-1793255865873-release/`），包括新增损坏配置重连／保留音量／提示原因／初始搜索焦点，以及原有真实手势、规则、跨分类和 Back。实际截图已检查；手机面板仍偏长，这不代表整体布局易用性已完成。

同一包的 Single 回归**失败**（`rhvideo-rules-recovery-native-android-single.log`，`rhvideo-android-single-1793255951072-release/`）：设置按钮注入点 `(876,2473)` 超出真实 `1080×2400` 屏幕，InputDispatcher 明确记录无目标窗口。失败截图已从自有模拟器补取并查看，视频仍有真实画面；不能由此推断菜单／布局没有问题。旧探测仅凭 `controls` 和 `isShown()` 判定，现增加同一 Activity／窗口、物理屏幕边界、全局裁剪、祖先透明度和连续两次稳定位置的有界等待。仍只发一次真实触摸、不重复显示／点击、不延长隐藏时间或用 `performClick()` 代替。探测同时保留通用失败截图和位置诊断，所有模式都必须验证自有 AVD 名称。**这只是修正无效输入判定与取证，不是已证明修复播放器或旧 ANR**；新探测重编译后的结果另记。

第一轮几何 guard 自身又混用了根视图坐标和物理屏幕坐标（`...single-guarded.log`）：设备根视图受切口偏移 136 px，导致有效箭头被拒绝，等待期间控制条自然隐藏；该失败也保留。已将裁剪范围转换到物理屏幕，再与实际点击点比较。最终探测 APK 为 **`f053e3317f7046c4e9d73a91622d728c966940308bbcb73c94b15078cc9c6f81`**；实际下一项按钮在约 379 ms 后达到稳定可见位置并触摸成功，不是放宽屏幕边界。

该最终探测的完整 Single 仍**失败**（短路径 QA 的 `rhvideo-rules-recovery-native-android-single-coordinates.log`，`rhvideo-android-single-1793257043336-release/`）：后续视频 `inputId=6` 出现 `ERROR_CODE_DECODER_INIT_FAILED`。原生日志显示 goldfish H.264 和软件 AVC 的分配调用都超时，`media.resource_manager` 的 dump 也在 10 s 超时。仍须区分模拟器系统服务异常与应用资源释放／重开问题，不能只归咎于模拟器，也没有通过重启后重跑把失败当作已修复。没有再次触摸菜单，所以旧菜单问题也不能据此宣称全部通过；串行命令已在失败处停止，后续新探测的标签场景没有执行，不冒充同一探测包的整轮通过。

这些提交没有修改正式 Windows 实例或真机，没有发布正式包，完整目标仍未完成。下一轮优先处理 SDK 安全修复、保持音频／分辨率的原生启动对照（本机已确认 libVLC 3.0.23）和 Android 解码资源／菜单可用性；上述系统超时仍保留原状态供诊断。配置备份的规则入站语义校验也仍需补齐，不能把已有偏好的加载兜底说成所有损坏备份导入都已处理。

## 2026-10-29 恢复连续标签浏览与位置语义（开发分支，完整目标未完成）

参考仍为实际 `869d632` 的 `renderGridTagDrawer` 和 `openGridTagDrawer`：原版连续滚动、重绘保留列表位置／标签焦点，打开时清空搜索但不主动归零滚动位置。此前新增点选功能仍用每页 80 项替代连续列表，属于操作差异。实际 Windows 红测 `rhvideo-rules-continuous-native-red.log` 在仍有翻页按钮处失败；不是仅修改说明或依据新 API 自证完成。

开发代码移除标签分页 UI，恢复一个连续滚动区域、滚轮／触摸和 Home／End／PageUp／PageDown。内部至多 80 行，按完整索引定位，极大范围沿用 800 万物理像素上限；编辑不归零、不丢当前标签焦点，关闭重开先得到新清单长度再恢复位置，换账户清理。公开 `rules.scroll` 与控件共用实现，旧 `rules.page` 保留兼容。原版空组、AND／OR／NOT、搜索和排序的语义不改，折叠后列表自然回到开始；搜索／排序重绘只按新范围夹紧位置。

性能红测另确认：5000 个源项每切一个窗口又重扫 5000 项，数次移动从初始 10000 次访问涨到 40000（`rhvideo-rules-continuous-red.log`）。现最多缓存两份完整派生标签结果，纯滚动只切片，来源／筛选／排序／搜索变化使用独立键，源清单更新清缓存，过时查询不占用新窗口。真实共享 UI 函数的受控异步红测又复现“滚远后立即回旧窗口仍忙碌”（`rhvideo-rules-continuous-stale-red.log`），已修复；同窗请求合并，迟到结果不覆盖后来的窗口，关闭／换账户丢弃旧结果，不增加重试循环。搜索／统计仍由 Worker 处理，不把虚拟 DOM 的数量限制误当成清单范围限制。

几何与并发测试覆盖一万次随机窗口、百万行的物理上限／首尾映射、快速反向移动、结果缩小、重开位置和清单失效；这是模型证据，不冒充百万项真机验收。新增实际 Windows 场景使用两万个标签、实际滚轮和 Home／End，核对最后一行的可见几何、80 行 DOM、焦点／位置及不重复请求源清单；Android 探测增加一次实际竖向手势跨过原 80 项边界和重开位置检查。最终构建后的运行结果另记，既有播放器首帧慢、间歇原生输入／Android ANR、ZIP 进度等未完成项不因本节而消失。

追加的实际 ResizeObserver 回调红测 `rhvideo-rules-continuous-resize-red.log` 复现初次布局在新占位区绘制前消费旧位置；现恢复完成前不让尺寸回调改写滚动意图，真正的新用户滚动仍可取代旧恢复。最后共享源码 **694/694、零跳过**（`rhvideo-rules-continuous-final-node-4.log`）；Android JVM **410/410、62 份 XML、零失败／错误／跳过**（短路径 QA 的 `rhvideo-rules-continuous-final-android-build.log`），后续仅重建更新后的资源／探测包。最终 EXE SHA-256 **`4560245e2a2b2a2d41083acc9fa3076996f993ad360540b86b039b76d5e0d49a`**，主 APK **`85303bcd3e247827520394655ff6a6fa82e996a4d911d82b6130eb09fbab235f`**，探测 APK **`c0f1eeffd265379c7e1b635a00d7e56bccae5ce1af45aeb471228934416a012f`**。下述原生结果必须对应这些字节，不能复用修改前的专项通过记录。

最终 Windows **38/38、零跳过**（`rhvideo-rules-continuous-final-windows-regression.log`），包含两万个真实标签记录、实际滚轮／Home／End、关闭重开／清搜索保位置、嵌套规则、登录、图片与收藏、放映／条带、实际 H.264／4K HEVC 解码及真实 FastAPI／SQLite 导出。末项截图已复查（`rhfiles-e2e-vfSJOf/native-continuous-tags-end.png`），实际显示到 `目录19999`、没有标签分页按钮。另用实际 CSS／浏览器几何核对压缩滚动末端的溢出裁切，额外滚动长度为 0；该检查使用百万行的计算几何，不是百万个真实源项或真机性能测试。首轮两项专项属于之前的构建，只作过程记录，不复用其哈希。

Android 标签专项完整命令通过（短路径 QA 的 `rhvideo-rules-continuous-final-native-android.log`，`rhvideo-android-rules-1793250938046-release/`），主包／探测包安装字节分别与本节 `85303bcd…`／`c0f1eeff…` 一致。实际触摸滑动跨过第 80 项、定位第 237 个筛选标签、保留旧脚本入口但移除分页按钮、重开清搜索保位置、原生 Back、跨分类全局筛选和 UI 接口契约均执行通过，截图已检查。通过回执仍保留旧的 `bounded paging` 文案，实际测试同时验证的是连续手势与旧 API 兼容，不以那一句摘要代替测试源码／步骤。未操作真机、未替换正式 Windows 实例或发布正式包；当前主包的既有 Single 播放／图片流程还需另做回归，不能由标签专项替代。

随后同一主包／探测包的 Single 完整回归也通过（`rhvideo-rules-continuous-final-native-android-single.log`，`rhvideo-android-single-1793251107058-release/`），两项 Android 场景与 Windows／构建完全串行。包含实际原生单文件菜单、父截图返回、模式／账户记忆隔离、真实封面多选、图像内容探测／拒绝 HTML 和筛选后的收藏放映；截图已查看。本轮未复现旧菜单失败／ANR，但没有修改对应播放实现或证明根因消失，仍保留既有失败及即时菜单绘制核验缺口。`9d5a408` 已推送 GitHub／Gitee 开发分支；本次只是推进连续标签这一功能组，不代表整个 RHVideo 前端／性能验收完成，也没有正式发版。

## 2026-10-29 点选标签、嵌套分组与实际打包准入（完整目标未完成）

按当前参考 `869d632` 的 `renderMediaRuleTree`、`renderGridTagDrawer`、`gridTagRows` 还原点选包含／排除、主条件／子分组 AND／OR、编辑目标、添加／删除子组、完整表达式、即时应用和清除；空分组保留编辑位置但不参与匹配。旧逗号／JSON 表单移至折叠的高级区，不能再以它替代普通标签操作。所有新增控件与脚本共用语义接口，旧 `rules.*` 动作保留。设置映射到原版 `grid_tag_prefs`，账户切换清理本次界面状态，进程标识／账户代次及递增修订号防止旧分组点击、移除重建的同路径和旧脚本请求污染新结果。

标签清单在 Worker 中统计、汉字／拼音／首字母索引和排序，源清单变更清缓存；截图库按源视频计数，不按截图帧数，喜爱按当前媒体类型投影，已选但不存在的标签保持零计数。查询结果每批最多 80 项；元数据读取与普通媒体读取分开取消，过时的准备工作在进入 Worker 前也要检查所属请求。普通条件立即发布，只合并 150 ms 内的读取，不重放服务端写入。

真实原生测试已经找到并保留以下失败证据，而不把 API 存在当成完成：Windows 初轮“完成”按钮不能关闭新面板（`rhvideo-rules-native-windows-1.log`），实际 `panel.close` 枚举漏了 `wb-rules`；后续实际下拉显示与脚本排序不一致（`rhvideo-rules-sort-native-red.log`），已增加真实选择器值断言并同步控件。Android 首轮主 APK 虽包含两个新脚本，Activity 的资源白名单却未授权，导致界面半初始化、`rulesEditor` 为空（短路径 QA 的 `rhvideo-rules-native-android-1.log`）；现明确添加两个路径，测试从真实 HTML 推导脚本清单逐项核对，不放宽成任意路径允许。Android 每次原生验收先核对包内资源与已安装 APK 的字节。

共享源码的 300 次连续编辑与五类来源／四种排序已和参考实际函数做差分；最终 Node **680/680、零跳过**（`rhvideo-rules-final-node-5.log`），Android 全部 JVM **410/410、62 份 XML、零失败／错误／跳过**（短路径 QA 的 `rhvideo-rules-android-build-3.log`）。Windows 整套原生回归 **37/37、零跳过**（`rhvideo-rules-final-windows-regression.log`），包含新标签、实际进程重启／旧 owner 拒绝、登录、收藏、放映、条带、原生播放器与真实服务，最终 EXE SHA-256 **`e6ded573e025a2e755b529c5826e064735bf4f1df7b0c04b7de83c8b728534ca`**；实际标签截图已检查。本轮 1080p H.264／4K HEVC 首帧约 **3.39／6.49 秒**，只证明真实同分辨率解码，不是性能等价或性能修复的证明。

Android 第二、三轮实际点选、嵌套 NOT、拼音、设置反馈、跨分类、原生 Back 都执行通过，但外围测试先误套用播放／阅读断言、又写错完整图片目录端点，命令仍失败，不能记作整条通过。外围已分开标签只读场景与播放场景，标签必须实际读取经认证的视频／完整图片／截图库且不修改服务端媒体，原播放及阅读写入断言不删除。最终第 4 轮**完整命令通过**（短路径 QA 的 `rhvideo-rules-native-android-4.log`，`rhvideo-android-rules-1793246969410-release/`），实际截图已检查；主 APK SHA-256 **`e8e7dc8dd04af6453d7dffebaf46768264496717135f178a70eef7866f5fff55`**、探测 APK **`5d69e481bd7e6d81d2ac124a5cd8c6610ab011b9d2ef340818cbea7cbb72b4ea`**，已安装字节一致。既有 Single／登录进程流程还要在同一包上回归，不由标签专项替代。

本节没有发布。该阶段构建仍是批次翻页，不是参考的连续滚动，完整标签浏览体验尚未对齐；后续改进见本文连续标签一节，也没有借此消除已有首帧性能、原生按键间歇丢失、ZIP 进度和设备生命周期缺口。Windows／Android 全功能与性能目标保持不变。

同一主 APK 的后续 Single 首两轮**失败**：`rhvideo-rules-final-native-android-single.log` 在循环菜单之后找不到原生速度菜单，失败截图只有视频、无控制条。既可能是测试在弹出窗口关闭前注入点击，也可能有控制条实际问题，现有证据不能定因。测试新增等待实际窗口焦点与点击坐标／时序记录，保持一次触摸、不改自动隐藏时长、不增加重放；仅重建探测 APK。该轮 `single-2.log` 更早在首次原生视频 Activity 切换时触发系统 `FocusEvent(hasFocus=false)` 五秒 ANR，还没有执行到新增焦点检查，不能把它归因于该检查或宣称菜单已修复。系统对测试进程直接终止、未留下本次 ANR 栈，探测现增加打开时最多三次只读线程快照，另在每轮前清理并在对应失败后收集本轮菜单诊断截图；不是无限监控或自动重试。外围显式拒绝 ANR 文案，即使 adb 返回 0 或先前阶段输出过 PASS 也不能通过；最终 Node **681/681、零跳过**（`rhvideo-rules-final-node-8.log`）。

随后 Single 第 3 轮**完整命令通过**（短路径 QA 的 `rhvideo-rules-final-native-android-single-3.log`，`rhvideo-android-single-1793247977350-release/`），主包仍为本节同一 `e8e7dc8…`，探测包为 **`7cec8412f3a24826ab8355f196da82bea54a4b25fb85f4ba820fd88f857734ab`**。实际返回、模式／账户隔离、多选、内容探测和拒绝 HTML、收藏放映均执行，截图已查看；实际速度按钮焦点等待仅 1–6 ms，不能证明先前失败必由弹窗焦点竞态引起。打开快照覆盖系统 Activity 暂停 Binder、解码器配置等位置，未复现的 ANR 没有对应栈，根因仍未确定。本次倍率截图也仍抓到关闭前的旧菜单勾选，后续状态／重新打开证明新倍率保存，不将旧截帧冒充即时菜单绘制已验证。完整命令通过不取消两轮真实失败及未完成项，更不等同全项目可发版。

同一主包／最终探测包另完成实际 RHVideo 服务的 `login` 三个独立进程阶段（`rhvideo-rules-final-native-android-login-3.log`，`rhvideo-android-login-1793248407556-release/`），注册不自动登录、恢复不重放密码登录、退出后不访问旧服务及实际封面像素核对均通过。恢复截图已检查，没有以已解码但未绘制的空白画面验收。未安装物理手机、未替换生产 Windows 实例、未发正式包；本节仅提交到开发分支，完整目标继续进行。

## 2026-10-29 分类入口、多选与注册流程（开发分支验证，完整目标未完成）

当前参考 `869d632` 的视频列表提供整文件顺序连播／超压顺序连播，分段连播和同屏则属于截图库；图片有独立的连续浏览，小说不应出现视频播放操作。此前客户端把这些按钮同时放在所有分类，并用一个模式下拉合并不同流程，是功能／上下文差异而非单纯风格。开发代码改成分类独立的直接入口；保留原有公开动作，不通过删掉接口掩盖缺口。截图库继续使用自己的分段连播、同屏、顺序、进度及放映入口；图片／喜爱保留连续浏览与放映，小说不显示无关的媒体播放按钮。

另查到“多选”原先仅开关工具条，绘制时又按已选数把它隐藏，复选框却始终显示，封面依然打开播放器。现多选状态与已选集合分离，零选中也保留操作条；仅进入多选才显示复选框，点击封面／标题选择或取消选择，退出多选清空集合。公开 `selection.mode` 可用可选 `enabled` 明确设置，旧的无参数切换继续可用；脚本选择和本页全选进入同一个状态。普通打开与单项播放接口的语义不变。

注册恢复参考 `register()` 的“注册成功，请登录”，不再自动连接、关闭登录框、重置媒体库、改写已有账户或保存注册密码。UI 默认邮箱按参考生成，旧接口可选的显式邮箱仍接受。Windows 与 Android 原生注册分离于登录，Android Activity 也不能把注册误当账户切换而关闭播放器／文档导出。注册只提交一次；未收到明确账户 ID 则提示核对，不自动重发。实际服务注册、既有登录密文不变和重复注册失败、实际封面选择与分类切换已加入原生验收，结果待本节最终构建后记录。

本节构建并不代表界面流程全部还原。当时继续对照确认的缺口包括：原版 `renderMediaRuleTree`／`renderGridTagDrawer` 用可点击标签、分组选择、AND／OR 和子组按钮编辑嵌套条件，该构建的 `rules.open` 却仍要求输入逗号标签／JSON。即使底层匹配算法和 `rules.apply` 接口存在，也不能把这种替换判为操作等价；后续还原见本文点选标签一节。既有首帧性能、间歇原生输入、导出进度及设备生命周期缺口仍保留。

最终共享源码 Node **654/654、零跳过**（`rhvideo-login-context-final-node-4.log`），Rust **261 通过、10 项原有忽略、零失败**（`rhvideo-login-context-final-rust.log`），Android 全部 JVM **410/410、零失败／错误／跳过**（62 份 XML，短路径 QA 的 `rhvideo-login-context-android-build.log`）。Windows 整套登录／收藏／放映／条带／原生解码与真实服务回归 **36/36、零跳过**（`rhvideo-login-context-final-windows-regression.log`，EXE `381c3cb060e495da1c3a48e61ab0d1d6394133872b8fdd00be9429d96c98cb79`）；实际页面截图已复查，图片页无视频播放按钮，普通浏览无常驻复选框。

随后单独补到注册校验在 `try` 外抛错、信息落在对话框背后的问题。`rhvideo-register-modal-validation-red.log` 先复现错误框为空，移入原有错误处理后通过；未改注册业务或播放器代码。重建后的四项账户／分类／多选原生专项 **4/4、零跳过**（`rhvideo-login-context-final-windows-login.log`，EXE `44419cc27892024767ed9ef974514059a83bdf85be9d7df388538b54409df303`），另验证错误在弹窗内、有效注册仍须手动登录、成功和失败注册都不改变既有密文。36 项完整套件属于前一个构建，不冒充最新哈希的全部重跑。

36 项中的 End／Home 本轮收到并通过，但此前间歇收不到原生按键的原因仍未确定，不以这次通过宣称已修复。此次原生 1080p H.264／4K HEVC 打开至首帧约 **3.71／5.20 秒**（内核计时 3.32／4.83 秒），只能证明同分辨率的实际解码，不代表与原版性能等价，更不是性能修复结果。旧配置用例日志的“no credential persistence”摘要文案也已更正为“renderer or ordinary-configuration credentials”；未删除原有无明文配置断言，也不把该断言误写成不允许系统保护的登录连续性。

Android 新增分类检查的首轮 Single 在“默认首页应是截图库”断言失败（`rhvideo-login-context-final-native-android-single.log`）：新增检查先切换了分类，污染既有初始条件。保留原断言，把新增检查放到既有默认／单视频检查之后，而不是强行重置页面来掩盖错误。登录轮次的原生进程断言虽通过，截图仍有封面空白，`naturalWidth` 不能证明已经显示；探测包现须等待真实不透明度并在系统截图中核对实际 WebP 夹具两点 RGB，按 `object-fit:cover` 计算裁剪，不以 CSS 背景色或延长固定睡眠代替验收。该后续只修改测试／回执，正式主 APK 未改；结果须按下一轮记录。

后续 Android 真实服务注册／三个独立进程登录生命周期及封面实际像素均通过（`rhvideo-login-context-native-android-login-2.log`，`rhvideo-android-login-1793239100536-release/`，PID 31543 → 31741，回执 `coverPixelsVerified:true`）。主 APK SHA-256 **`e600c513292bf68faf7215f3bc997b53cb63ff65ed9b1ed2aa7c209bce774047`**、探测 APK **`9348980f06ab3f580b8727cc1a780f6292a04b2b15ba9686e5a3dc4c684a34be`**，安装字节核对一致。恢复图像与正常退出画面已复查；这证明最终实际绘制，不将原先未等像素的空白截帧称为已修复所有图片加载问题。

同一主包／探测包的第二轮 Single 全部原生断言通过，外围脚本却仍匹配旧成功文案而退出 1（`rhvideo-login-context-native-android-single-2.log`）。两个真实脚本源用例先红，修正成功回执匹配，并让所有模式每轮使用独立证据目录，避免失败轮次混入旧成功截图。最终 **Single 完整命令通过**（`rhvideo-login-context-native-android-single-3.log`，`rhvideo-android-single-1793239577835-release/`），包含原默认首页断言、真实封面／标题多选、图片／小说／视频分类入口、原生 Media3 菜单与播放、内容探测和拒绝 HTML、单项父层返回、独立模式／账户及收藏放映；与登录验收串行运行，没有并行构建干扰。实际图片像素和播放器画面已检查，但倍率菜单截图仍停留在先前 1.5× 勾选，后续原生状态证明 1.25× 已记忆；该画面的菜单重绘／时序尚须明确验证，不冒充全部 UI 反馈同步已验收。

本节没有正式发布、替换正式 Windows 实例或安装到物理手机。上列局部通过不消除点选标签分组、同画质播放性能、既有间歇输入／ZIP 进度及完整设备生命周期等剩余要求；目标保持完整，不以此缩减为只接通接口。

## 2026-10-29 登录连续性与原生进程验收

当前参考 `869d632` 的 `static/index.html` 在启动时读取 `rhvideo_token`（1480 行），登录成功后保存它（1790 行），退出时删除（1753 行）。因此刷新／重启后继续登录是原有功能，不是可随意删掉的视觉差异。发现问题时，RHFiles Windows／Android 都只在原生进程内保存会话，状态明确返回 `credentialsPersisted:false`，**该行为不等同原版**。既有“不在网页／普通偏好 JSON 中保存凭据”测试不构成删除登录连续性的依据。

验收要求是操作系统保护的原生会话存储：不保存密码、不向 WebView 暴露令牌，不进入配置备份或跨设备同步；恢复、退出、失效授权和旧账户迟到结果都要核验。证据应包括两端实际进程重启后恢复同一账户、退出／401 撤销、普通配置无明文令牌，以及账户／用户／配置分区隔离；仅增加“记住登录”的按钮或测试自己的内存状态不算完成。

后续开发代码现已接入 [Windows 当前用户 DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata) 和 [Android Keystore](https://developer.android.com/privacy-and-security/keystore)，不是把 Bearer 写回网页。Windows 的密文另绑定配置目录的规范路径，复制到另一个虚拟桌面／测试配置不能解密；Android 的 AES-GCM 使用 Keystore 密钥，记录位于 no-backup 私有目录并绑定应用／目录。密码不保存，普通配置与备份／同步不新增登录凭据；不支持系统保护时显示保存失败，不退化成明文。

公开 `connection.restore` 接受可选 `fresh` 布尔值，`state` 返回 `restoring`、`credentialsPersisted`、`loginWarning`，不返回令牌。每次打开媒体库可触发一次验证，重复并发调用合并；失败不循环。网络错误保留密文，用户点原有刷新按钮可明确发起新的只读验证；没有新增失败任务的重试按钮，也不重放文件写入。退出先移除本机记录，401 撤销当前会话；旧恢复／刷新／401 只可作用于匹配代次。Windows 短暂的账户切换和播放器释放按同一准入锁串行，HTTP 不占据该锁，旧登录不能在新账户发布后又停止其播放器。界面失败时重新核对原生状态，而不是直接假定所有登录失败都已断开旧会话。

系统存储的实际 DPAPI 往返、密文非明文、复制配置分区拒绝、篡改／过大／普通 JSON 拒绝已有 Rust 用例。Android JVM 使用真实 AES-GCM、可控测试密钥验证新客户端恢复、备份排除、网络失败不循环、显式新验证、401 撤销、刷新替换和迟到结果隔离；它不能替代发行 APK 内实际 Keystore 验收。Windows 四场景与 Android `login` 三阶段最终原生结果及哈希见前节，Android 另以实际 Keystore 解密核对非导出密钥和无明文配置；不是凭内存模型或仅凭构建宣称登录连续性已验证。

实际 Windows 首轮登录四场景为 **3/4**，并非全绿：恢复已连接后立即切图片，迟到的初始化又使该分类返回失效。真实共享源上的两项红测确认启动准备／收藏读取会覆盖新导航；现元数据请求先等待同代准备，初始加载不得覆盖更新的用户读取。第二轮四场景 **4/4、零跳过**（`rhvideo-login-native-windows-2.log`），但它仍是登录阶段构建，不能替代随后分类／注册修正后的最终整套回归。

Android 登录首轮虽然三个进程断言通过，截图却显示未登录首页误报“媒体账户已改变”。已保留该失败画面；两项真实源码红测定位到未登录的原生代次被当成已认证上下文、`application.ready` 又早于原生启动钩子。现未认证时不发送账户上下文，真正钩子错误仍可见，准备全部完成才声明 ready。第二轮三个真实进程阶段及同一包的既有 Single 原生回归均通过（短路径 QA 的 `rhvideo-login-native-android-2.log`、`rhvideo-login-native-android-single.log`）。未登录截图已复查，无伪错误；该阶段主 APK `35939c25f6c02c5efd9984236f24b2c5afe65733db22a5a17cb347c492f189d9`、探测 APK `a1ed67515cc6680a477f54b9587c84f2be4f6d50c5a9a56238c3206d87fdb59e`，两者安装字节一致。新增分类／注册修正后须另记最终 APK 哈希，不复用本轮证明整项目完成。

## 2026-10-29 喜爱 ZIP 导出界面与后台保存（完整目标仍未完成）

新的 Android `exports` 原生场景不使用伪 ZIP：运行当前参考 FastAPI／隔离 SQLite，实际 UI 提交小说筛选／全部三类收藏、系统保存、后台通知、同路径并发无覆盖、已有文件保留，另分两个真实进程验证中断终态和不重放。失败证据保留在短路径 QA 的 `rhvideo-export-native-android-1..8.log` 及各次独立的 `rhvideo-android-exports-*-release` 目录；不把过程中的局部成功当成整条通过。

由它查到的第一个产品问题是保存选择后 ZIP HTTP 借用了旧缩略图连接：失败轮次服务端没有收到 `/download`，原生 trace 无 `connect-start`，且复用了十多秒前的相同连接，随后 EOF。新回归先以 `expected:0 but was:1` 的连接序号失败（`rhvideo-export-fresh-socket-red.log/.xml`）；现 ZIP 使用独立零闲置连接池，仍不重放失败流，不改变普通图片／视频的读连接策略。该阶段全部 JVM **397/397** 与 Node **626/626** 通过，实际原生后续轮次也已能传输到关闭界面的阶段，不再把 EOF 隐藏为自动重试。

第二个产品问题已在原生第 5 轮复现：窗口关闭、通知返回和任务保存成功后，重新读刚保存文档被系统拒绝。只保留临时 URI 授权不足以支撑此生命周期。开发代码现按 [Android 文档授权规则](https://developer.android.com/training/data-storage/shared/documents-files#persist-permissions) 保留用户选定文档的持久权限，只记录本次新增的读／写位；失败清理释放本次授权，64 项历史淘汰时最后一个引用才释放，不删除已保存文件。授权位放在原生私有记录，不是服务器令牌或可跨设备同步的配置。此前已有的权限不由下载清理撤销；提供方拒绝持久授权时有可见警告。最终压缩发行包的实际授权／关闭窗口／进程重启后读取已由下面第 10 轮验证；不支持持久授权的提供方和选择器本身的旋转／进程死亡仍未验收。

系统 UI 测试本身也纠正了两个错误：真实 DocumentsUI 的文件名框为 `android:id/title`，改按实际可编辑的 ZIP 名称识别，而非硬编码另一个布局的 ID；返回键显式使用 Android uptime，原来的简写构造事件因时间戳被 InputDispatcher 作为 stale 丢弃。保留失败日志，仍必须实际返回主界面、点通知并比较已保存 ZIP 的字节，未删掉这些断言。

文档授权修正后的第 6 轮已实际通过窗口关闭、通知返回和保存文件重新读取，但第二次系统选择器取消后界面仍停在选择中。根因是 Android `rhvideo-mobile.js` 的事件白名单没有注册新增的 ZIP 进度／选择结果／通知跳转，连已有旋转偏好事件也遗漏；以前测试直接给模块传入永远接受事件的模拟订阅器，不能覆盖真实桥接。新增 `rhvideo-mobile-events.test.mjs` 先在实际桥脚本上 **4/4 红测**，补齐四类事件后通过，并仍拒绝未注册事件；它从真实共享消费者推导订阅清单，另核对取消、账户隔离、完成进度和现有 Activity 的通知入口。原生用例也改为读取无副作用的 `exports.state` 验证界面已收到结果／实时进度，不再用会合并原生状态的 `exports.downloads` 掩盖丢事件。

第 7 轮已到达真实进程恢复，但测试把输入的 `/data/user/0/...` 与底层准入后的规范路径 `/data/data/...` 直接比较而失败。现记录准入时的目标并在中断前核对其确实等于请求的规范路径；恢复继续要求同一任务、同一已准入目标。第 8 轮另遇到 **10 秒内界面下载字节一直为 0**（busy 已解除、state 为 downloading）；当时缺少原生同步快照／线程和服务端发包时刻，尚不能确定在传输、文档提供方还是事件投递阶段。后续通过不证明它已修复。测试只在原断言失败后补读原生诊断，另记录无凭据的服务端 ZIP 发送时刻，未增加自动重放、放宽等待或删除进度断言。

第 9 轮的 ZIP 字节／通知／进程恢复断言通过，但截图显示的是底层截图页而不是导出面板，不能当作完整 UI 验收。系统取消助手原来按固定 150 ms 决定是否再按一次 Back；现仅在确实观察到输入法消失时才允许第二次 Back，并要求取消后及截图时导出面板仍打开。**第 10 轮完整通过**（`rhvideo-export-native-android-10.log`，`rhvideo-android-exports-1793232902905-release/`），截图已检查。它验证真实选择器的保存／取消、前台进度与通知点击、关闭媒体库后完成、两次同路径并发恰好一项 saved／一项 failed、已有文件不截断、完成后拒绝旧取消，以及新进程内未完成任务成为可见失败、已保存 URI 仍可读且没有追加下载请求。服务端、原生回执和拉回 ZIP 的 SHA-256 一致（`e6c473d1f2b1a5214dc78082394a77b0b6fc806dd7ddd738ac726e248c0d6b4e`），CRC 通过，清单包含视频／图片／小说，三个源文件逐字节未变。

本阶段最终 Node **630/630、零跳过**（`rhvideo-export-lifecycle-final-node.log`）；全部 Android JVM **400/400、零失败／错误／跳过**（61 份 XML，`rhvideo-export-document-grant-android-build.log`）。第 10 轮实际安装的主包 SHA-256 `71c2e6e6f7e402bb92b952bd063f58c1fb9089a7b837ef365c0dc13185f1fb28`，探测包 `ff942383b0920f9db33ec4c93e4e9293438a068f20f39661c0112b8e0130ea94`。同一主包／探测包的既有完整 Single 原生回归也通过（`rhvideo-export-lifecycle-native-android-single.log`），覆盖实际图片探测／HTML 拒绝、Media3 菜单、单项父层返回、单视频状态与独立收藏放映；与导出套件串行运行，不以新功能通过替代原播放回归。仍非整项目完成：第 8 轮进度间歇失败、选择器 Activity 旋转／进程死亡、Windows 系统保存选择器、登录连续性、Windows 输入与同质量首帧性能等缺口保留；没有正式发布、替换正式程序或操作真机。

后续代码复查另补入 Android 一次性保存准备：系统选择器返回后只消费原生内存票据、立即交给前台下载服务，不再次等待元数据 GET。票据最多四个、有效五分钟，绑定账户代次／进程和任务 ID，取消、重复、过期、旧账户或旧进程均不能发起下载。活动传输再核对下载的实际 HTTP 状态和 ZIP 字节，不自动重放。显示名在已经进入服务的后台工作中读取，不阻塞服务启动，也不将编码的 URI 当成用户选定文件名。新增专项七项 JVM 用例通过（`rhvideo-downloads-picker-preparation-unit-1.log`）；其中 HTTP 请求次数证明只读一次元数据，不依赖单纯源码匹配。最终显示名修正后的整包和完整 JVM 验证须另行记录，不能复用下面上一构建的 APK 哈希。

该后续修正最终已完成压缩发行构建及全部 JVM **396/396、零失败／错误／跳过**（61 份 Gradle XML，`rhvideo-downloads-picker-final-android-build.log`）。最终 APK SHA-256 为 `eedb14fec393cfd0611dc430a75686eccefe994e50980b9216cddb4412f9c54e`，测试 APK 为 `841de36962d74149454b29deae6834c8c23a8db1cf039d7cd7f5b93e3a64a6a1`；两者实际安装字节已核对。自有模拟器上的现有单视频／图片／原生菜单／单项父层／独立账户状态／收藏放映整条回归通过（`rhvideo-downloads-picker-native-android-single.log`），仍不能替代 ZIP 真实系统选择器、通知点击及进程恢复专项。未正式发布或安装到真机。

放映输入另加入页面焦点、实际 Tauri 窗口焦点、keydown／keyup 的诊断。定向运行 `rhvideo-slideshow-input-focus-diagnostic-1.log` 虽通过，但观察到页面自报有焦点时实际两个原生窗口都没有焦点；**不把该通过当作原生键盘焦点问题已修复**。完整回归的 31/32 失败记录继续保留，没有用强制前置点击、重复按键或放宽断言替换。

随后用 computer-use 在一次性私有测试实例发出实际 End 和 Tab，辅助功能状态仍为外层窗格焦点和 1/4；截图同时报 Windows.Graphics.Capture 的 GPU 设备挂起 `0x887A0005`，图形点击因坐标几何不可用被拒绝。因此仍须区分桌面／输入注入环境与应用控制器，未冒称确定根因或增加抢焦点循环。该实例已关闭，正式实例未动；记录在 `rhvideo-native-slideshow-input-observation.md`，重跑入口为 `rhvideo-input-probe.mjs --slideshow`。

在上一节任务协议上补入原版的独立“打包导出”入口：打开时刷新全部收藏，冻结当时完整筛选快照（含小说、不限当前页），允许切换本次筛选／全部收藏，展示服务端打包进度、逐项计数、过期及失败原因。只有活动任务可取消，没有失败后自动重试或复用旧请求意图。面板可见时活动任务每秒读取、空闲每十秒读取；隐藏／关闭暂停读取，连续三次失败停止，手动刷新才重置预算。关闭走公共 `panel.close`，与按钮／返回的预览恢复语义一致。

Windows 原生后台线程与 Android 前台下载服务直接用原生账户会话流式保存 ZIP，界面不接触 Bearer 或整包字节。固定下载路由，核对所属任务、MIME、ZIP 文件头和精确字节数；最多两个本机活动下载。Windows 在目标目录写临时文件，完整后原子无覆盖提交；Android 的系统创建文档和显式本地路径分开处理，本地路径用 `O_EXCL` 拒绝覆盖。关闭媒体库不取消下载；进程中断只记录失败，不恢复旧写入。私有下载记录不存凭据，按服务地址和账户隔离；递增版本避免迟到的排队应答或旧清单把已完成任务改回进行中。Android 通知可打开导出面板；服务超时停止且不重放，界面／通知发布异常不能把已经保存的文件改成失败并清理。

现有公开脚本接口之外，新增 `rhvideo.exports.open/close/scope/refresh/download/downloads/download.cancel`；面板操作都走同一业务动作，原生选择器仍由系统管理。`download` 返回排队任务或选择器已打开，不代表文件已保存，须检查任务的 `state: saved`。终态任务不显示取消或重试按钮。Android 选择器回调绑定进程身份、账户代次和独立选择标识，不把旧 Activity 的选择结果交给新账户。

最终开发源码的 Node **626/626**、RHVideo 相关 Rust **54/54**、Android 全部 JVM **393/393** 均通过、零跳过。Windows `rhvideo-downloads-actual-windows-2.log` 在实际参考 FastAPI、隔离 SQLite 及真实视频／图片／小说上通过：从真实 UI 提交筛选／全部打包，检查 ZIP 内容和源文件不变；证明下载正在进行时关闭面板，后台完成后比较服务端 ZIP 的 SHA-256 并运行 CRC 检查；已有目标保留且拒绝终态取消，退出重连仍能查询服务端任务。下载夹具有界增加发送延迟，只用于验证后台生命周期，不是吞吐基准。

Windows debug EXE SHA-256 为 `26d490d4b3e1d2a83865a0d608c0177a78914094a37805fb79d5f3ecccd72c84`。Android 最终压缩 APK 的现有单视频原生回归在自有 `emulator-5584` 通过（短路径 QA 的 `rhvideo-downloads-native-android-single.log`），核对安装字节并检查真实画面，**不代表 ZIP 系统选择器和通知跳转已经原生验收**。Android 新保存流程的实际文档选择、慢元数据／前后台交接、进程恢复、选定显示名及文件提供方权限仍须进一步检查；Windows 系统保存选择器也未由此显式路径下载用例覆盖。全目标的返回关系、间歇输入、同质量首帧性能等历史缺口保留。未发布正式包、未替换正式程序、未操作真机。

同一 EXE 的四套完整 Windows 原生回归为 **31/32、零跳过**（`rhvideo-downloads-windows-regression-1.log`），不是全绿。失败仍为放映 End 输入：页面自报有焦点，但媒体库和主窗口的按键观察器都未收到该键，不能据此宣称已确定为放映取整错误，焦点／原生输入原因须继续定位。上轮解码失败计数用例本轮通过，**不等于上轮间歇失败已被修复**。实际 1080p H.264／4K HEVC 原生 open 到首帧约 3.92／5.91 秒，仍不代表同画质性能达标。Android 此次实际安装的主 APK SHA-256 为 `24e123f79b5a99c9caaf9a1d1066ae7cfaf533ad78cbaaaa371742631440c0a1`，测试 APK 为 `841de36962d74149454b29deae6834c8c23a8db1cf039d7cd7f5b93e3a64a6a1`，61 份 JVM XML 汇总为 393 项、零失败／错误／跳过。

## 2026-10-29 喜爱 ZIP 导出任务协议（上一阶段记录）

按当前参考 `869d632` 的 `favorite-exports.js`、FastAPI 路由和服务实现接入，而不是把既有“导出所选 JSON”改名成 ZIP。Windows／Android 原生均支持固定的创建、最近任务、逐项查询和取消路由，使用原生内存中的当前账户 Bearer；任务由服务端持久化，取消导出不使媒体清单失效、不调用暂存或删除源文件。创建和查询响应核对请求／任务身份、状态、日期、计数和实际进度，不把任意成功状态码当成打包成功。

开发分支的公开动作是 `rhvideo.exports.create/list/get/cancel/state`。筛选导出在读取前固定完整筛选条件，重新读取收藏以免遗漏其他客户端的修改，再获取所有页，包含小说；全部导出不读取或套用当前筛选。最多 50000 项，通过每次 200 项的原生分段准备，避免 Android 256 KiB 消息上限；草稿有五分钟时限、账户隔离、顺序／重复校验和总量上限。在发送创建请求前一次性消费，不自动重放失败写请求；结果不明确时提示查看最近任务核对。新的一次用户操作产生新的请求标识，不复用隔了很久的旧意图。Android 保留服务端冲突、过期等具体错误，不只显示 HTTP 代码。

当前仅完成任务协议和脚本入口，**原生流式 ZIP 下载／保存、导出对话框、可见进度、后台下载及其生命周期验收仍须继续**；没有发布这项功能，不将脚本／任务协议测试当成完整 UI 验收。原版完整控件审计也尚未因此消除 ZIP 缺口。

最新 Node 622/622（`rhvideo-exports-protocol-verified-node.log`），RHVideo 相关 Rust 52/52（`rhvideo-exports-protocol-verified-rust.log`），Android 全部 JVM 389/389、零失败／跳过（短路径 QA 的 `rhvideo-exports-protocol-bound-android-unit.log`，以最终 60 份 Gradle XML 汇总）。新用例覆盖 50000 项、完整筛选与小说、草稿失败原子性、换账户／超时、重复提交、错误服务端身份及不重放。直接执行参考的实际 `getSelection` 回调作差分；第一次差分夹具未加载真实拼音词典而失败，补齐词典后保留原有中文搜索断言，没有删掉搜索以换取通过。

Windows debug EXE SHA-256 `e265021e2b97ac395b24766bc5c0334c1705056d9f0d978563fb4d5badd61b4b` 的真实后端专项已通过（`rhvideo-exports-protocol-actual-windows-1.log`）：运行参考项目的 FastAPI、隔离 SQLite 和真实源文件，生成单类型／三类型 ZIP，读取服务端私有压缩包清单验证内容、核对进度／源文件不变及退出重连后任务仍在。只证明任务协议和真实打包，不是客户端下载保存验收。本轮中间 APK 构建成功，但之后又修改了身份核对与共享脚本；不能将中间 APK 当成最终源码的 Android 原生 UI 验收，未安装手机或替换正式 Windows 实例。

同一 EXE 的四份 Windows 原生回归本轮为 **30/31**（`rhvideo-exports-protocol-windows-regression-1.log`），不是全绿：失败图片切换条带行数期间，服务端 GET 计数从 1 增至 2。失败提示在切换前后都确实可见，缓存失败的占位也保留；尚未证明第二次请求的根因。随后调试插桩仅在通过轮捕捉到一个卡片请求与一个条带请求，不能用该轮通过证明失败轮只是测试时序，更不能宣布自动重发已修复。保留 `rhvideo-exports-strip-failure-trace-[1-3].log`（第一份诊断选择器转义有误），临时插桩已撤掉，原失败断言未放宽。新增真实场景验证先等卡片确实失败、服务器恢复后再由用户显式打开条带，图片可以重新加载（`rhvideo-exports-strip-recovered-source-1.log`）；它不代替原有并发情境，也不代表上述间歇问题消失。1080p／4K 原生首帧本轮仍约 3.90／5.33 秒，性能比较仍未完成。

## 2026-10-28 继续补业务功能与放映语义（整体仍未完成）

实际源版本检查发现新旧清单漂移：`rhvideo-reference-audit.mjs` 仍固定在旧基线，当前参考源码有 185 个被扫描的控件调用，明确缺少 `RHFavoriteExports.open`，且多个源文件哈希不再匹配（`rhvideo-current-reference-inventory-gaps.log`）。没有把哈希直接更新成“通过”，也不把普通 Node 单测绿色当作最新版全部功能已经相同。**喜爱源文件 ZIP 打包导出仍须继续实现**。

Windows／Android 现接入原版的配置备份 API，并增加媒体库偏好内的保存、选择备份预览、确认合并及四类匹配统计 UI。它与 RHFiles 全量配置导入／WebDAV 同步是不同功能。版本 1 元数据文档上限 20 MiB，不把正文塞进命令行参数或 Android 消息桥；服务器决定匹配、冲突和合并规则。偏好以原版十六个名称／字符串格式互通，未在本客户端呈现的标签抽屉偏好仍保留，不导出密码／令牌或源文件。预览由随机标识绑定账户，五分钟有效、换文件替换旧标识、确认只消费一次；退出／重连撤销旧预览，错误或异常服务器结果不制造成功。

手机保存／选择采用原生文档选择器；`requested` 不代表已经保存，界面继续等待实际结果，取消或错误后解除忙碌，旧账户回调不能修改新界面。已有合并得到服务器确认、但偏好保存或列表刷新失败时保留 `applied: true` 和明确警告，不诱导重放写操作。相关原生缓存、固定路由／Bearer、一次性确认、JavaScript 选择器忙碌和刷新失败都有独立测试。脚本有 `configuration.export/preview/restore/state`，提供本机路径或已授权文档 URI 可不经过选择器；未指定路径则走 UI 的同一选择器。

放映的旧实现确有业务混用：收藏混合放映共用了普通图片放映的停留／淡化参数，集合定位按文件数量等分，放映里还出现了无效的条带方向／列数按钮。现按原版分别保留图片秒数、视频秒数和淡化毫秒数，收藏放映不套 Ken Burns；以每项停留时长构造累计时间轴，增加真实进度控件，Home／End 与控件共用公开动作。新差分直接运行原版 `favshowProgressCommit`，还拦住了新增实现把 End 放到最后一项的结束点、立即绕回首项的错误；修正为最后一项开头。关闭条带控制没有删除条带功能，仅不在不适用的放映模式显示／执行。

最终完整 Node **559/559、零跳过／失败**（`rhvideo-config-final-all-node.log`）；桌面 Rust **249 通过、10 个原有忽略项**（`rhvideo-config-slideshow-rust-final.log`）；Android JVM **376/376、零跳过／失败**，由最终 Gradle XML 统计，日志为短路径 QA 的 `rhvideo-configuration-final-android-build.log`。Windows EXE SHA-256 `e048aa9f4fed3f07a526babed4eb65b800f83de635e49b8d42106dfba2b31e37`，实际界面／后端专项 **2/2**（`rhvideo-config-final-assets-windows-e2e.log`）：真实 RHVideo／隔离 SQLite 中导出、移除收藏、预览不写入、合并恢复、即时刷新及旧确认拒绝；另用真正键盘 Home／End、实际范围控件及解码图片验证放映参数／进度，截图已检查。首次使用过时 EXE 被字节检查拒绝，新增断言中的字符串转义错误也保留在中间失败日志；没有删除断言或把它们冒充产品通过。

Android 新压缩 APK 首次直接复用 Rust ABI 时误带了没有应用运行库的第三方 32 位 ABI；严格安装前检查拒绝了它。改为已完成编译的 ARM64／x86_64 后，又拦住了旧 CSS 与当前源不一致，失败证据为 `rhvideo-configuration-android-single-regression.log`、`rhvideo-configuration-supported-android-single.log`。之后完整同步共享资源，主包 `0618bcf0…` 的原完整 Single 场景已实际通过（`rhvideo-configuration-all-assets-android-single.log`），核对实际安装字节，只用自有模拟器。前两次不能仅凭 Gradle 成功算作安装通过。Java 的本机管道构建故障使用本次 QA 独立临时目录解决，没有修改系统 DNS、代理、安全配置或重启机器。

### 同轮继续：不能以公共组件改变原版业务

新的 Windows 实际红测确认“仅视频”收藏筛选下仍返回 43 项，重新打开放映又续到第 42 项，而不是从首项开始；证据 `rhvideo-slideshow-filter-snapshot-red.log`、`rhvideo-slideshow-reopen-red.log`。已保留当前类型筛选，计数排除小说；直接使用开启时的轻量队列快照，不再切换时重新查询可能已变化的收藏清单。新增放映内收藏／取消收藏，跨当前卡片页也有效；图库截图收藏其源视频，不启动视频。显示项目仅在解码完成且切换身份仍有效后提交，切换期间拒绝收藏／标记。通过 `viewer.favorite` 与 UI 同一动作验证，重新开启仅收藏放映从首项开始，普通图片的进度记忆不变。

直接执行原版 `openFavSlideshow`、`favshowProgressCommit`、`updateKenburnsFadeCfg`、`picStripAutoTick`，不仅用本项目模型自证。新差分还复现备份把速度倍率当每秒像素、把百分比当 0..1 的单位错误（`rhvideo-backup-reference-units-red.log`）。现明确按 200 px/s 基准／百分数双向转换；设置支持原版 60 秒淡化上限、2000 px/s 的速度，新安装默认值按原版 2 倍速，已有设置不被重置。合法原版值的恢复及实际滚动位移均做差分断言；不把客户端扩展边界值视为原版 UI 已支持的值。

配置恢复的真实服务器红测还发现：被拒绝的旧账户 logout 会清空当前预览（`rhvideo-configuration-stale-logout-red.log`）；清理现位于会话校验通过之后。新的四项真实界面／隔离后端专项通过（`rhvideo-configuration-generation-slideshow-green.log`），包含 42 张跨页图片、一次点击一次写入、取消收藏后回访、截图源视频收藏及旧账户不能撤销当前预览。第一次新放映整轮仍发生一次 End 键超时；保留 `rhvideo-slideshow-filter-snapshot-green.log` 中的失败，追加被动键盘／焦点诊断后连续五轮两项通过（`rhvideo-slideshow-snapshot-repeat-[1-5].log`），**不据此断言间歇焦点问题的根因已修复**。

最新完整 Node **561/561、零跳过／失败**（`rhvideo-reference-business-final-node.log`）；桌面 Rust **249 通过、10 个原有忽略项**（`rhvideo-configuration-snapshot-final-rust.log`）；Android JVM **376/376**，最终 Gradle XML 统计，构建 `rhvideo-configuration-snapshot-probe-final-apk.log`。另有常规 Windows 媒体库 **12 通过、3 跳过**（`rhvideo-slideshow-snapshot-final-e2e.log`）；两项原生视频分支和未提供路径时的真实后端跳过不算通过，真实后端随后在上述四项中指定实际路径独立执行。

单位修正阶段曾生成 Windows EXE `fc26b0c4…`、主 APK `fd6a3146…`、探测 APK `cc918a7b…`。该安卓包的解码／接口场景虽然通过（`rhvideo-favorite-snapshot-units-android-single.log`），随后实际检查截图却发现暂停后切图仍是黑屏；**该轮不能作为可见画面验收通过**。

### 2026-10-29 实际像素发现“已解码但黑屏”

保留失败截图 `rhvideo-slideshow-paused-black-android.png`。新增 Windows 像素红测同样捕捉四个采样点全为背景 `[13,18,29]`（`rhvideo-slideshow-paused-pixels-red.log`）；不是只看 `naturalWidth`／状态。原因是 `.paused *` 连新图层的淡入动画也暂停在 opacity 0。现只暂停 Ken Burns 图片运动，手动切换的可见性过渡继续，不改变暂停状态或自动前进计时。Windows 像素专项已通过并检查截图 `rhfiles-e2e-26ORHf/paused-slideshow-pixels.png`；当前图层必须达到可见 opacity，随后四个真实像素都匹配，不能拿正在退出的旧图层冒充新图。

Android 同样加入实际截图、contain 内容区域换算、当前图层 opacity 及四个颜色标记检查。第一轮新断言误把仍为旧插画的 5/6/7 号测试文件当标记图（`rhvideo-slideshow-paused-pixels-android-final.log` 记录真实插画颜色）；没有删除断言，而是将这三个专用夹具也统一为分段传输标记 PNG。**同一产品主 APK** `6acb73fdbf073fe2f309736fc48a060929446bbfa560eb38b7d8436af1e00a51`、最终探测包 `2c9e58c5015e5a35395db4fdedfd0f0fcb795eef62e168716bba6f15ed6e1e3f` 的完整 Single 场景已通过（`rhvideo-slideshow-marker-pixels-android-final.log`）：含旧原生视频／菜单／返回／账号用例和新增收藏筛选、小说排除、独立参数、暂停切换、队列快照、UI/API 收藏及重开首项。安装字节核对一致，仅自有模拟器；修复后的真实截图已检查。最新完整 Node **561/561、零跳过／失败**（`rhvideo-business-pixels-final-node.log`）。

Windows 当前 EXE 为 `c8b551601fa2802e67ca9b86acbc5c101c4014b38c623e82772e5a1c628b958f`。该 EXE 的五项专项曾 **4 通过、1 失败**（`rhvideo-business-pixels-final-windows.log`），失败仍为 End：页面自己报告焦点正常，但窗口级被动观察没有收到键。等待自然焦点没有修好它。后续将测试键包补齐为现有原生键盘测试同样的 `nativeVirtualKeyCode`，并观察主窗／媒体库两边实际输入；不以主动聚焦、点击或直接调用业务接口代替按键，也不将这次字段修正未经实测就算作产品焦点修复。

补齐键包后首轮五项 **5/5**（`rhvideo-slideshow-complete-native-key-packet-final.log`），随后追加投递目标断言的连续验证第一轮仍失败（`rhvideo-native-key-packet-repeat-1.log`）：主窗口／媒体库窗口均未捕获 End，自然焦点已就绪，放映计时持续正常。**完整键包不是根因修复**，三轮计划在首个失败后终止，没有声称重复三轮通过。最新完整 Node 仍为 **561/561、零跳过／失败**（`rhvideo-business-pixels-verified-node.log`）。已修复的像素／收藏用例与这一未解决输入问题分别记录，不用单测数或一轮绿色覆盖实际失败。

仍须继续：新 ZIP 导出、普通收藏点击浏览与原版 `openFavBrowse` 混合图片／视频队列的对应、连续条带的竖向末端停止／横向无缝循环及按键／滚轮倍率、其余全量功能／参数边界核对、手机文档选择器的旋转／折叠／页面销毁、Android 媒体库自身关闭回执、最新版完整原生回归和同质量性能等。此前完整原生 67/68 的间歇失败、4–5 秒首帧没有被本轮参数／备份修复证明已消失。尚未发布新包，也未替换正式 Windows 实例或操作真机。

普通收藏浏览的后续实际红测已建立：`rhvideo-favorites.test.mjs` 中两张图片、两个视频、一本小说，主页面五项，但点击图片后的浏览总数实际为 2，原版应为 4（`rhvideo-favorite-mixed-browse-red.log`）；直接执行当前参考 `openFavBrowse` 的混合队列差分通过（`rhvideo-favorite-mixed-browse-reference.log`）。不是只缺一个按钮或总数显示。实现时须保留开启时的完整筛选快照、排除小说，图片和原生视频相互切换／回访，取消收藏不破坏正在浏览的队列；收藏视频的上一项／下一项和集合进度应指向该快照，不借用已加载的截图库。普通返回应回到收藏列表，不能伪称“返回截图”，也不能返回同一视频后立即重新打开。现有截图子播放器的返回能力、输入身份和账户边界仍须保留，两个平台都需实际原生验证。**不能仅将返回总数改为 4 就把红测当作全部功能已修好。**

### 2026-10-29 普通收藏浏览的混合队列与真实控件

当前参考仍是 `869d632`。直接执行其 `renderFavorites` 与 `openFavBrowse`，确认图片和视频卡片都进入同一个混合查看器，小说仍进入阅读器；收藏页的“连续浏览”也不是图片库长卷。此次修复这两种入口，共用打开时的完整筛选快照，排除小说，取消收藏不截断正在浏览的队列。图片与原生视频可相互切换；视频上的集合进度、上一项／下一项属于该混合队列，不借用截图父层或视频时间。返回关闭普通收藏查看器并回到列表，截图播放原有的返回语义另行保留。新增公开 `favorite.browse`、`player.seekParent`，原 `browse.mode`／`viewer.open` 的收藏连续浏览也进入同一实现。

默认收藏排序此前错误地使用源媒体创建时间；新的两个红测还发现毫秒精度丢失后会按媒体 ID 重排服务端顺序。现使用 `favorited_at`，同毫秒保留服务端已按收藏时间／收藏 ID 排好的先后，升序反转该先后；普通媒体日期不变。正在浏览的收藏快照不提供假随机排序，返回列表调整排序后再开启。无效父层位置先校验，不能提前消耗当前子播放返回身份；桌面准备票据也校验收藏总数、位置及父／子身份，拒绝无效新准备不能影响活动解码器。

迟到准备／播放与关闭另以精确预览及子播放身份隔离，原生 `player.closeParent` 只静默释放匹配的输入，不发送另一个导航事件或提前提交暂存。Android 排队启动还核验票据的活动 lease，关闭或替换后的旧 UI 消息不能重新打开它；JVM 用例覆盖关闭再复用同名票据而 lease 不同的情况。**这不等于所有预览暂存已完成隔离**：账户级 pending 在异步关闭与新预览并发时的消费范围仍须继续核验，不能用解码器身份测试替代。

Windows 新专项不是只改总数：实际拖动原生播放器页的收藏范围控件，检查默认硬件输出的真实显示帧，并从真正屏幕截图核对四个图片颜色标记。还验证取消收藏后回访、直接视频卡片、返回、迟到旧关闭和无效准备；另回归截图返回位置、同图重复播放和父层关闭。Android 新 `favorites` 模式操作真正的原生 SeekBar，检查 Media3 实际输出帧、四个图片像素、原生收藏取消、返回和旧父关闭，并核对 UI/API 无缺失。

首轮 Android 原生场景在第二次视频打开时失败于 AAC 初始化，保留 `rhvideo-favorite-mixed-first-android-native.log`、`rhvideo-favorite-mixed-android-codec-logcat.log` 及 `rhvideo-android-favorites-first-failure/`。日志中旧 ExoPlayer 已先执行释放，随后系统多线程有长停顿、Codec2 分配超过超时；当时也有 Rust 测试构建。停止构建后**同一主包／测试包**的整条重测通过（`rhvideo-favorite-mixed-second-android-native.log`），但这不是根因已定位或修复的证明，没有更换无音轨素材、放宽单次等待或添加隐式重试。测试器现保存有界原生日志及媒体资源诊断，失败也留下证据。首轮 JVM 的同名票据测试错误地重写仍活动的不可变计划，已改为先关闭再复用，未放松产品的活动票据规则。

当前完整 Node **570/570、零跳过／失败**（`rhvideo-favorite-entry-final-node-tests.log`）；Rust **252 通过、10 个原有忽略项**（`rhvideo-favorite-complete-rust-tests.log`）；Android JVM **379/379、零跳过／失败**，来自 `rhvideo-favorite-mixed-final-android-build.log` 和 Gradle XML。新增入口一度暴露测试夹具按源码字符串切片误包含动作注册；已改为解析实际函数的 AST 范围，原十一项播放竞争断言全部保留。Windows 最新六项默认硬件原生专项 **6/6、零跳过／失败**（`rhvideo-favorite-entry-verified-windows-native.log`），逐文件核对嵌入 JS 字节；它仍不是全部原生回归，也没有证明此前按键投递或首帧延迟已修复。

最新压缩 Android APK 的整条 `favorites` 原生场景通过（`rhvideo-favorite-entry-final-android-native.log`），新增收藏连续浏览入口也验证为混合查看器而非纯图片长卷，UI/API 对应无缺失；实际截图已检查，手机工具栏拥挤仍保留为界面缺口。测试只用自有 `emulator-5584`，安装字节核对一致。最终主 APK SHA-256 `9f92a18b100252ea05c6c87331799677b1d707fff15ecb7d6a18addc1116f829`，探测 APK `9c144c674f9e6dbe764aaaaf4c03e7e96ebf085aad327cebff52ee6860e0da6e`，上述六项所用 Windows debug EXE `8357929fcf6ca50e92e89e57fd235e5ffbb49a177d91c0c64b02cc993f428ddc`。这不是新正式版本的发布记录。

整体仍未完成：新 ZIP 打包导出、图片长卷的竖向末端停止／横向无缝循环／输入倍率、间歇按键与解码失败、完整原生和同质量性能、Android 图片工具栏的拥挤以及前述生命周期边界继续保留为缺口。未更新参考清单哈希掩盖未实现项，未发布正式包、未更换运行中的 Windows 程序、未操作真机。

### 2026-10-29 图片长卷：几何、输入和选择操作

直接运行当前参考的 `psBuildCells`、`psTailCellCount`、`picStripAutoTick`、滚轮和按键函数。三个布局红测及真实 Windows 竖卷红测分别复现：长图只剩任意少量片段、双行被改成瀑布流、竖卷仍有两列，以及到达底部后跳回开头。日志 `rhvideo-strip-layout-red.log`、`rhvideo-strip-vertical-red.log`。现横向按参考的接近 3:4 规则保留每一段，连续排列且不加改变阅读坐标的间隙；双行分别使用有序池的前／后半，不按哪一行短就放哪一行。竖卷始终为全宽单列、不切割原图，抵达真实底部停止。方向／行数在同一个快照内重建，竖卷隐藏并拒绝不适用的双行操作。

两条横向行各有独立滚动坐标、循环点和有界首部副本。自动时每行按同一像素速度独立绕回，手动滚轮／触摸则暂停并按各自最大滚动距离成比例联动。键盘箭头恢复原版的 `窗口宽 × 0.8 × 倍率`，滚轮使用同一倍率，不再固定移动 500 px；工具条增加速度控件，调用现有偏好 API。首部副本到循环点时直接复用已解码 DOM 节点，在异步资源解析前移动到新坐标，不能只把 scrollLeft 清零、等下一次请求才补图片。真实窗口实测包含节点身份及接缝图片像素，不把纯模型通过视作实际显示通过。

每次仅保留附近最多 80 个图块，原始完整顺序与副本分离；完整池和每行坐标仍可到达。每行延续八百万物理滚动上限／逻辑坐标映射，URL 与终态失败缓存各最多 512 项，首部副本最多 4000 段。恶意极长几何在创建超出预算的片段前报错，不默默丢掉合法长图下半部分。新增固定种子的 100 组属性差分验证长宽比、片段顺序和坐标；竖向五万项不再为凑分段数量而切碎图片。旧大库用例也改为检查真正滚动行的宽度，不以外层不再滚动的容器冒充几何已受控。

长卷之前缺失的选择、收藏和双击放大已接入：图片及片段点击后明确选择同一个源，星标不改变另一个选中项；选中后标记暂存，关闭整个长卷才提交一次，放大层关闭不提交。`viewer.select/inspect/scroll` 及扩充的 `viewer.favorite`、`selection.markCurrent` 和所有控件保持公开接口；UI 传入查看器身份，旧窗口的迟到选择／收藏／标记不得操作新窗口。放大在 await 前捕获源 ID，不因其间切换选择而显示另一张图片。旋转／尺寸变化保留同一快照和选中项：横向按比例恢复，竖向保持原逻辑位置。终态图像失败显示占位并在 `viewer.state.errors` 可查，不在动画帧中无限重发；重建布局／关闭后返回的旧图像不能回填新布局。

首轮扩大回归为 **23/25**（`rhvideo-strip-final-windows-regression.log`），没有将它记为全通过。一处是本轮把空筛选误改为抛错，破坏旧放映接口；已恢复明确的 `opened:false,total:0`，同时新增断言确保不打开空窗口、不播放隐藏类型、不替换已准入的快照。另一处发生在混合放映的预期类型：夹具一直按“视频、图片、小说”的媒体类型拼接，未提供真实服务器的收藏时间顺序。新的夹具红测复现了该差异（`rhvideo-fixture-favorite-order-red.log`）；现模拟真实的最新收藏优先、稳定时间、幂等 PUT、删除后重加及小说 ID，不把产品恢复成错误的类型顺序来迎合测试。真实 RHVideo `favorites.py` 按 `Favorite.created_at DESC, Favorite.id DESC` 的实现已复核。此后 Native 场景还显式检查先图片、下一项视频，避免用二十秒“未出帧”掩盖其实已跳到图片的错误假设。

后续第二轮 Windows 为 **24/25**（`rhvideo-strip-contract-preserved-windows-regression.log`）：空筛选与真实收藏顺序回归均通过，仍有此前已记录的 End 按键未到达任何窗口监听器的问题，不能把这一轮说成全部成功。检查安卓截图又发现速度滑块的真实指针与倍率标签不一致；真实控件红测读取到 100，而已保存配置为 400 px/s（`rhvideo-strip-speed-control-red.log`）。原因是给 range 赋值时还没有设置 max，浏览器按默认 0–100 夹住了数值；现在先设范围再赋值，并同步设置/API/导入改变后的控件、倍率和原始速度提示。保留合法的 0 与小数，不用新的整数范围破坏旧配置。

修正速度后的完整 Node **588/588**（`rhvideo-strip-speed-final-node-tests.log`），Windows **25/26**（`rhvideo-strip-speed-final-windows-regression.log`，EXE SHA-256 `500da762f2bc3b7a364542a915458efabff01083d653f732d40c8b9557369aef`）。七个长卷实际窗口场景均通过，双行、选中边框与循环图片截图已检查；真正的 RHVideo／隔离 SQLite、原生混合放映、四个独立视频画面及五万图的末端可达也通过。五万图窗口保留 4 个图块、物理宽度 8001135，快速定位产生 35 个图片请求。1080p H.264／4K HEVC 首帧约 3.94／5.82 秒，这只是实际出帧，**不是性能已对齐**。此轮 End 虽通过，也不能据此宣称间歇按键问题已消失。

该轮唯一失败是收藏子播放器窗口刚载入时返回文案仍为“返回媒体库”。完整执行真实播放器脚本的两个红测进一步确认：首份原生状态尚未返回，接口已宣告 ready，源操作控件也未禁用（`rhvideo-player-startup-ready-red.log`）。现由第一份有效原生状态决定 ready，准备中禁用源操作、保留返回，新账户通知使其再次未就绪；初始返回文案保持中性。窗口测试等待这个真实状态，而不是延时猜测、调用额外 state 强制绘制或删除“返回收藏”断言。

最终 EXE SHA-256 `5648a71a8f8ad08fae841068981dd4abaec2a7aa6b6c01e45bdcb159903b608a`，包含参考差分的完整 Node **590/590，零跳过／失败**（`rhvideo-strip-player-ready-reference-node-tests.log`）。遗漏参考路径的一次 Node 运行有 23 项跳过，单独保留在 `rhvideo-strip-player-ready-node-tests.log`，未将其当作参考全量已验证。新 EXE 的扩大回归 **24/26**（`rhvideo-strip-player-ready-windows-regression.log`）：收藏混合浏览完整流程通过，但 End 间歇丢键再次复现；另一个失败是图片错误提示断言限定了 `.wb-strip-error`，而从缓存失败重建的节点使用居中占位文字，并非该覆盖层。没有改产品来迎合 DOM 断言，改为验证屏幕内有面积的失败图块及明确失败文字，并增加重建布局后的同样验证、实际截图和网络请求数量不增长。后续专项 **10/10**（`rhvideo-strip-final-visible-error-favorites.log`）直接记录了两种节点、同一失败源仅 1 次请求，重建后截图已检查；同时再验证收藏原生视频、真实集合拖动、返回列表与七项长卷场景。**这不使先前 24/26 自动变成整轮通过，也没有解决 End 丢键。** 该扩大回归的 1080p／4K 首帧为 2.56／7.19 秒，仍不作同质量性能通过声明。

Android 压缩主包 SHA-256 `fb883cdfe950ef57a523a19cc0a1cd2e57b3856504c43dd1cbe9f32713cb2145`，探测包 `85345da3264186129ee02bc770e127eaad8e09e39b89287c4f441c1cad9a8092`。`rhvideo-strip-speed-final-android-native.log` 与 `rhvideo-strip-speed-final-android-single.log` 均实际通过：长卷的底部停止、触摸联动、选中与星标、放大后四块真实图像像素、物理旋转后的两个滚动行几何、同一查看器身份和选中项保留、关闭一次提交及旧身份拒绝；速度滑块真实读数与 API 改速同步也有断言。原 Single 场景同时验证 Media3、实际菜单、图片内容探测／HTML 拒绝、截图子播放器返回、收藏放映筛选和快照。核对了安装包字节，只用自有模拟器，无构建与另一原生套件并发；截图已检查，但拥挤的手机工具栏仍不是最终视觉验收。

本节仍不是全目标完成。长卷随机顺序／恢复与新增图片追加的完整记忆、所有极端生命周期／输入设备，以及先前的 ZIP 打包导出、间歇回执／按键／解码问题和同画质性能等仍须继续对照。没有发布新正式包，未替换正式运行实例，未操作真机。

### 2026-10-29 图片顺序：实际 ID、共享放映池与持久化

对照仍为实际参考 `869d632` 的 `buildPicStripOrder`、`shufflePicStrip`、`restorePicStripOrder`、`picStripHashIds`，没有用列表随机种子冒充保存的图片排列。图片连续浏览与图片 Ken Burns 都从服务器原顺序取池，再按已保存 ID 排列；被筛选掉或已删除的 ID 跳过，新增 ID 按源顺序追加。打乱使用原版 Fisher–Yates，保留选中源而不是旧索引，暂停并从头显示。原版“恢复顺序”使用完整 `allPictures`，并不是只还原当前筛选池：本客户端保留该行为，卡片筛选本身不改，重新打开连续浏览时再次应用筛选。连续浏览恢复为默认暂停，由用户启动自动滚动，图片放映仍自动开始。

新增真实的随机／还原按钮和公开 `viewer.order`（含旧查看器身份校验）、有界分页 `viewer.items`。图片排序独立于卡片的 sort／seed，不因改变卡片排序而丢失排列。关闭与手动滚动记住实际位置，恢复时按两行各自最大距离联动；签名包含标签、搜索、目录、方向、行数及原版顺序签名。正常顺序的签名随源总数变化，已有随机顺序追加新图则保持原签名，不能用一个全局比例覆盖所有这些边界。

完整参考差分及业务测试最初 **600/600**，第一轮扩大 Windows 为 **28/31**（`rhvideo-picture-order-windows-regression.log`），不能当作完成：竖卷到了底部而 running 仍为 true，失败图片重建后出现 2 次 GET，以及五万图立即结束进程后排列丢失。专门诊断确认重开使用完全相同的 dataDirectory／webviewDirectory，旧 localStorage 排列却不在了（`rhvideo-picture-order-three-failure-diagnostic.log`）；仅关闭弹层再打开通过，不是进程持久化证明。未删除重启断言、缩小五万项数量或靠等待浏览器后台刷盘制造成功。

现改为独立、按服务器和用户名隔离的 IndexedDB ID 数组，不塞入 256 KiB 的普通偏好，也不把 ID 截短来凑限制。读写有界超时，无自动重试；写事务请求 strict durability，等待 transaction complete 才发布成功的排列，保存／清除失败保留正在显示的原队列。关闭查看器、换账号及后续排序会中止仍未提交的所属事务，迟到结果不能改替代窗口。损坏的已存记录显示警告并临时按默认顺序浏览，不自动覆盖原记录。这里只存媒体 ID，不存登录令牌或密码。

另补首帧时钟负 delta 防护，使用实际 tick 函数的确定性边界测试；它不是“已证明所有竖卷失败都由时钟造成”的声明。实际竖卷用例改为从底部前 200 px 由真实按钮启动，等待自动移动到末端并停止，不再靠固定 250 ms 或直接定位终点来证明动画工作。图块退休／布局重建／关闭时撤销未完成 IMG 源，失败后撤销同源其他副本并显示一致错误占位；错误层之上的收藏按钮仍可操作。旧实现只移除 DOM，未取消图像请求，这项资源边界也有独立业务测试。重新构建后的原生验证尚须继续，不能从 Node 绿色推断三个失败都已消失。

事务存储版本的扩大 Windows 为 **30/31**（`rhvideo-picture-order-durable-windows-regression.log`，EXE `0acc138183321782c064922cfe6af18513da2af45be2689d87c85f6766a51dfc`）。此前三个失败场景均通过：五万项、788891 字节、无重复 ID，在同一 WebView 数据目录中立即结束并重开进程，首尾各一百项与存储计数完整保留；竖卷实际走完最后 200 px 并停止；错误提示和布局重建后请求数量不增长。失败源的初始并发副本可能已产生 2 次 GET，测试验证的是进入终态后不再增加，不把结果说成“任何时候严格只读源一次”。这一轮 End 通过也不是它的间歇丢键已修好的证据。

唯一剩余失败为“点击真实星标写入所点图片”超时。检查确认连续浏览原先会在选中时把隐藏的收藏按钮插入工具栏；新增控件红测捕获 hidden 切换，现为禁用但保留的位置，收藏／取消收藏有固定最小宽度，避免选中时工具栏重排。没有把实际鼠标用例换成直接收藏 API 或添加预先聚焦。另一个确定性红测发现每次记住滚动位置都重新扫描整个 ID 排列（1000 次调用重算 1000 次，`rhvideo-picture-order-scroll-hash-red.log`）；现仅在打开／排序时算一次签名，滚动用已准备的值，与原版缓存的 `picStripOrderSigValue` 对应。

最终完整 Node **608/608，零跳过／失败**（`rhvideo-picture-order-cached-final-node.log`）。新 EXE `8fbee9f4c551b4bf9054e74cc7b1c1d77a30de1a92830ed9adeb82186403664c` 的十二个实际窗口专项 **12/12**（`rhvideo-picture-order-cached-windows-strip.log`），包含真实点击星标与双击放大、一次性暂存、错误占位、原版恢复全池、换账号隔离、存储失败保留旧队列、共用放映顺序、新图追加以及再次立即重启的五万项验证。此证据证明本节场景，不把旧 30/31 自动改写成最新版全套通过。

安卓首次扩展触摸验收未通过（`rhvideo-picture-order-cached-android-strip.log`），没有把 Windows 专项的绿色推及手机。增加只读诊断后确认相同 ID 顺序仍在，但记录位置 1000 px 被恢复成约 840.38 px，当前最大距离 1645 px，不是超过末端的合法截断（`rhvideo-picture-order-android-resume-diagnostic.log`）。实际 opener 的执行红测复现：先测量图片布局，再向工具栏添加位置滑块、向弹层添加导航 canvas；初始较大的布局恢复位置后，ResizeObserver 又按新尺寸成比例缩放。现控件和导航准备完成后才测量，切换方向时也先设置影响尺寸的可见性，校验失败则还原这些可见性。安卓断言仍检查原位置，只允许原版明确的 `min(保存位置, 新最大距离)` 截断；该次 1000→840 的失败不会被此修正掩盖。

另一个执行红测验证了持久化 await 期间尺寸变化会提交旧测量结果（`rhvideo-picture-order-async-layout-red.log`）。现写事务结束后重读当前尺寸／方向／行数，仅在变化时重建几何；若磁盘已提交而新尺寸布局失败，返回明确的 `saved:true,displayed:false` 警告并保留旧可见队列，不能假装保存未发生或偷偷重放。最新完整 Node **611/611，零跳过／失败**（`rhvideo-picture-order-final-geometry-node.log`）。两次中间单测错误来自新增 opener 模拟环境漏了 notice／tick，分别补齐后才记绿色，不把它们归为产品错误。

最终几何版本 Windows 扩大回归 **31/31，零跳过／失败**（`rhvideo-picture-order-final-geometry-windows-regression.log`），EXE SHA-256 `a0bf6f11aa36933ddd199f0f4f2d21e2a255545b196e00cf9ccf118deedef409`。十二项图片专项和其余收藏混合浏览、原生四画面／切换、账户边界、五万图末端、真实 RHVideo／隔离 SQLite 均经过实际窗口与后端验证，截图已检查。1080p H.264／4K HEVC 首帧约 4.25／5.64 秒，**仍不是性能已对齐**；本轮 End 通过仍不能证明此前的间歇丢键根因已消失。

Android 主包 SHA-256 `aa904459b5ce96df953b99994747c9b741a713244b7225f8b46e05886dd9c249`，探测包 `841de36962d74149454b29deae6834c8c23a8db1cf039d7cd7f5b93e3a64a6a1`。`rhvideo-picture-order-final-geometry-android-strip.log` 与 `rhvideo-picture-order-final-geometry-android-single.log` 均实际通过：真实触摸星标／打乱／还原、末端前 200 px 的自动滚动与停止、旋转后的同一快照和选择、关闭长卷→同序图片放映→返回长卷后的原位置、一致的公共接口、旧身份拒绝及一次性暂存；Single 同时保留 Media3、真实菜单、内容探测／HTML 拒绝、截图子播放器返回、放映类型筛选及打开时快照。只在自有模拟器安装并核对实际字节，无构建或另一原生套件并发，截图已检查。Windows 五万项的立即结束／重开证明不能自动推广为所有安卓设备的杀进程恢复，手机工具栏的拥挤也仍不是最终视觉验收。

本节仍非完整目标验收：喜爱源文件 ZIP 打包导出、图片／截图放映全部续播索引边界、既有间歇键盘／回执／解码问题、同质量性能与手机生命周期仍保留。未发布新正式包，未替换正式实例或操作真机。

## 2026-10-28 回执读取的串行饥饿（专项通过，整轮仍有失败）

新增红测实际复现：暂停的首个视图先花掉健康视图需要的时间，后者即使可以在总预算内响应，也来不及得到结果。现在最多八个可信视图同时进行只读状态查询，共享同一截止时间；每批只有首个匹配的运行中来源进行长等待，取得确认结果或结束后关闭其他读取。连接握手也可被中止，完成结果不能以 `undefined` 冒充已确认结果。没有增加业务操作重试、取消按钮或放宽五秒验收预算。

三个新增单元测试先全部失败、修复后通过；当时完整 Node **551/551、零跳过／失败**（`rhvideo-parallel-all-node.log`）。实际原生故障专项 **1/1**（`rhvideo-parallel-first-native.log`）：两个真实视频显示后，确实暂停首个窗口、丢弃生产者等待回复、阻断后续枚举，仍从另一个真实窗口取得完成回执；核对只提交一次关闭动作，播放器释放、窗口销毁。五份完整默认硬件输出回归为 **67/68、零跳过**（`rhvideo-parallel-full-native.log`）；该故障场景通过，单视频自身返回却仍丢失已接受的回执。独立重跑及随后连续五次通过并不抹去整轮失败（`rhvideo-self-back-sequence-[1-5].log`），也不能据此断言其底层原因已修复。

后续新增红测复现另一缺口：首个状态只是“运行中”，客户端却立即取消其他状态读取；若此来源后续等待无应答，会丢掉另一路稍后实际完成的结果。现在保留已开始的读取，并将其确认结果与那一次长等待竞争，不另开等待或重放动作。四个新增测试及完整 Node **552/552、零跳过／失败** 已通过（`rhvideo-late-completion-all-node.log`）。默认原生输出专项 **4/4**（`rhvideo-late-completion-native.log`），含自身关闭／返回／UI 返回、同屏关闭、暂停首个视图及新增真实迟到完成场景。新场景确实丢弃生产者与首个状态来源的等待回复，仍在原五秒预算内读到另一视图的实际完成结果并销毁窗口；不是仅用假回执验收。最新版完整 69 项尚未重跑通过。

产品 EXE 仍为 `cfd558a1…`，上述修复仅命令行与测试脚本。首帧诊断另增加从实际播放器视图观察的选项，不主动聚焦／仿真该视图，也不改变正常默认调用路径。使用同一字节的 H.264/1080p 夹具，前台播放器观察到真实标记像素的区间分别约 **4.01–4.40 秒、4.78–5.17 秒**，主窗口观察约 **3.91–4.32 秒**；不能归因于只有后台观察窗口延迟。证据 `rhvideo-foreground-observer-[1-3].log`。原版也已支持复用同一夹具并记录执行文件／内容哈希，本次 compositor 回调约 **5.84 秒**（`rhvideo-byte-identical-reference-startup.log`）；两者视口和像素观察机制仍不同，单次结果不能用来宣称原生已更快或同质量性能验收通过。没有借此修改缓存、画质或播放流程，未发布新包。

## 2026-10-28 Windows 打开应答分段（定位有进展，延迟尚未修复）

此前约两秒的打开应答尾延迟不是已经修好。新增仅在 debug 构建且 `RHFILES_VLC_DEBUG` 开启时记录的内核状态、请求收尾、窗口布局／消息及主线程排队计时，不记录业务参数。已有状态读取、播放选项、事件发送、队列保存及预加载顺序均未改变。

已复现内核状态在约 358 ms 读完、后端约 329 ms 完成（不同轮样本），前端却约 2266 ms 才收到结果。为排除诊断通道，探测同时记录页面自己的 `performance.now()`：慢样本的 CDP 额外传递仅约 5–12 ms，延迟确实存在于前端收到应答之前，不是把观察者等待误算为业务耗时。`fetch` 包装只记录 `play` 应答头／正文到达时间，不改请求、响应数据或重放；长任务观察没有捕捉到 50 ms 以上 JavaScript 工作。证据为 `rhvideo-state-stages-probe-*`、`rhvideo-request-stages-probe-*`、`rhvideo-frontend-reply-probe-*`、`rhvideo-window-message-probe-*`。

曾做一个只将三种媒体窗口的小型交互命令改走框架已有 postMessage 通道的候选。原来三次全通道 fallback 对照都很快，但不能据此采纳：随后使用同一个 H.264/1080p 文件，SHA-256 `4206d583658a64f9cb490339638f0fe67cb4229f21cef1310ceb1d090e775a7e`，两份可执行文件交错各三次，旧版前端打开应答为约 **329／2218／2245 ms**，候选仍为 **317／2264／2249 ms**。候选确认没有走该条 fetch，依然出现等待，故没有证明它是修复。其 16 项单元测试通过不替代实际效果；候选已从产品入口及正式测试集合撤下，实验源码／二进制只保留在忽略的 `test-artifacts/rhvideo-ipc-rejected-candidate*`、`rhvideo-startup-ipc-scoped-candidate/`，正式 IPC、安全策略和业务行为保持原样。证据 `rhvideo-scoped-ipc-ab-[1-6]-*`。

回撤后的诊断 EXE SHA-256 `cfd558a1e0aa97b427464ba842d522d6e0aabd1bce80b5533cbfd9e3c5334c31`，三个实际原生样本均显示四块标记；慢样本前端约 2256 ms 收到结果，而应答头约 2251 ms、正文约 2251 ms，后端约 313 ms 已完成。主线程探测在排入后约 0–1 ms 被处理（414／815／1315／1815／2315 ms 一带），没有两秒连续阻塞；布局真实排队边界约 0–2 ms。不能继续归因于 VLC 状态 getter、队列保存或播放业务持续卡死 GUI。下一步须继续区分 WebView2 应答交付、后台／遮挡状态与 IPC 调度，不因此降低画质、放宽等待或关闭系统安全功能。`rhvideo-gui-queue-verified-[1-3].log` 是新 EXE 的有效记录；较早误在编译失败后启动的 `rhvideo-gui-queue-probe-*` 实际仍为旧候选字节，已排除，不作新诊断证据。

`rhvideo-startup-probe.mjs` 新支持 `RHFILES_STARTUP_MEDIA`：先核对视频尺寸／编码，再复制进本次自有临时目录使用，跨二进制可比较完全相同的字节；不会删除提供的源文件。第四个位置参数 `postmessage` 仅供隔离实验，通过在发送前拒绝一次只读调用选择框架现有 fallback，不能用来重放已发送操作，也不是产品默认。原生像素取样与显示统计仍各自记录，`after-stats` 的像素时间下界仍为 0，不将统计更新时间当成精确首帧。暂未完成与原版同质量的发行包性能验收，未发包／替换正式实例。

回撤后的本轮验证：完整 Node **548/548、零跳过**，桌面 Rust lib **246 通过、10 个原有忽略项**，实际普通 GUI **234/234**，命令行／文件生命周期／侧栏真实操作 **14/14**。原生焦点／关闭专项则是 **4/5**，不是全绿：最后的暂停首个视图＋丢失生产者回复用例再次返回 `CONNECTION_LOST`，首个视图约 2.5 秒耗尽切片后，真实媒体库查询又等满剩余约 2.5 秒。此前三次通过不证明所有情况下已恢复。失败断言和原五秒预算保留，不能从测试进程退出／窗口消失推断操作已完成；下一步必须检查串行读取者是否使健康来源错过全局预算，并保留不重放动作的约束。证据 `rhvideo-response-phases-final-node.log`、`rhvideo-response-phases-final-rust.log`、`rhvideo-response-phases-gui.log`、`rhvideo-response-phases-file-business.log`、`rhvideo-response-phases-native.log`。

## 2026-10-28 Windows 取流前的重复焦点阻塞（原整轮 66/67，回执恢复继续修正）

先排除测量方式：原生像素探测使用同步 [PrintWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-printwindow)，新增 `rhvideo-startup-probe.mjs SCENARIO after-stats` 模式，在显示计数出现前不取画面，之后仍核对实际红绿蓝黄标记。这个模式没有前置负像素样本，因此像素时间下界保持 0；不能把周期性统计的零值当作尚未显示。原 `poll` 模式保留作干扰对照。

交错样本再次出现：窗口约 256 ms 创建好，视口读取却到 2294 ms。将激活／读取合入一次 GUI 调用后，进一步抓到 **native-focus-ready 287 ms → window-focused 2298 ms**，确认约两秒发生在显式 WebView `MoveFocus`，而非尺寸计算；只合并调用并没有修好。所锁定的 Wry 0.54.4 已在创建 WebView 时请求焦点，并处理父窗口 `WM_SETFOCUS`。现在单视频和同屏去掉重复 COM 调用，保留正常窗口激活及键盘焦点机制。

同一 H.264/1080p、源 SHA-256 `4206d583658a64f9cb490339638f0fe67cb4229f21cef1310ceb1d090e775a7e`，旧 EXE `6cfc3d8d…` 与单视频修正 EXE `6d4b5ec6…` 交错各三次。各次是新进程／播放器、媒体库已就绪，不是冷系统／磁盘测试；均为实际 `native-hardware-auto`，没有更改内核、缓存、输出质量或分辨率：

| 指标（ms，按各自运行顺序） | 旧版 | 修正后 |
|---|---|---|
| 上游首次取流 | 2361／4502／366 | 372／354／297 |
| 首次观测到显示计数 | 5496／8002／3860 | 4119／3826／4247 |

这说明移除了一处可重现的取流前阻塞，**不是整体首帧均更快或已经等同原版**。统计按内核周期发布，窗口负载也有波动，三次样本不是发行版 P50/P95。最终 EXE SHA-256 `6291fd7835594be3a4e3c6a4d15c74e39f0d495770d0a4b030d1d4ae9970a444` 又测得首次取流 384 ms、首次显示统计 3702 ms；打开接口应答仍在 2325 ms，不能将应答等待也宣称已经消除。日志为 `rhvideo-startup-capture-*`、`rhvideo-startup-activation-*`、`rhvideo-startup-focus-[1-6]-*`、`rhvideo-native-focus-final-startup.log`。

最终新单视频／同屏焦点用例 **2/2** 通过：没有 `Page.bringToFront`、焦点仿真、DOM `focus()` 或预先点击，检查实际 `document.hasFocus()`、空格暂停／继续、Tab 进入控制条、切源保留当前控件，以及 Esc 真正释放两格并销毁窗口。该轮 Node **535/535**，桌面 Rust lib **246 通过、10 个原有忽略项**。五份完整默认原生回归在上述最终 EXE 已结束，**66/67、零跳过**，唯一失败为下述同屏自身关闭 CLI 回执。不能记整轮成功；未发包、未替换正式实例。解码／显示等待、应答尾延迟和先前其他未验证项继续保留。

整轮的 `grid-owned close returns its completed CLI receipt` 返回 `CONNECTION_LOST`，已含接受的 run ID；后续独立重现记录约 3.1 秒断线时仍余约 2 秒，但未进入回执查询。不能将其简单归因于动作尚未提交，或断言只有单个慢视图占满预算。原断言／五秒预算未放宽，失败日志 `rhvideo-native-focus-full-default-regression.log`、`rhvideo-native-grid-close-recovery-1.log` 保留。

恢复链路原来必须重新读取 `/json/list`，然后每个视图又可独占全部剩余时间；这两处依赖均有缺口。只缓存视图之后，连续验收又抓到新握手超时；保留连接之后仍抓到原窗口不及时发断线通知、等满五秒，来不及查进程回执。失败记录分别保留在 `rhvideo-recovery-focused-native.log`、`rhvideo-recovery-reserved-transport-native.log`。

现在等待型客户端在提交前最多保留八条可信存活视图连接；接受操作后，并行等待原窗口和读取存活窗口的同一进程回执，而非等断线才恢复。每个探测共享剩余预算，必要时至多补一次发现，已访问视图不重复，总计不超过八个。匹配正在运行的回执只等待一次，不重放操作，也不把窗口消失当成功。某一路已完成时中止另一路未完成的读取、退出时关闭所有连接，不取消已接受的业务操作。可选 `RHFILES_CLI_TRACE=1` 记录阶段／预算／状态，不记录操作参数或凭据。

新增实际原生故障场景：两个真实视频均已显示后，由同屏窗口自身提交关闭；首个主视图用调试器暂停，重新发现接口在首次读取后设为 503。首次采用 lifecycle freeze 的测试未能证明整个关闭期间维持暂停，断言失败，没有当作产品通过；改用 debugger pause 的独立场景曾通过（`rhvideo-native-grid-close-paused-recovery.log`），但连续验收仍有上述失败。并行读取后又出现原窗口先正常回复、回执来自存活窗口的断言未成立，不能当成恢复路径通过。因此进一步只丢弃生产者的 `runs.wait` 回复来明确注入传输故障，真实关闭动作、进程回执及存活窗口接口不替换；五秒预算、真实播放器释放和窗口销毁断言保留。此为故障注入验证，不宣称先前间歇失败的底层 WebView 枚举原因已全部查明。

最新完整 Node **548/548、零失败／跳过**（`rhvideo-recovery-final-all-node.log`）；新增十三个恢复预算／缓存视图／传输生命周期用例，含先失败后通过的断言、总量／URL 边界、精确过期错误、无断线事件、不中断正在等待的完成回执，以及读取结束后的连接释放。实际默认硬件输出专项 **5/5、零跳过**（`rhvideo-recovery-actual-survivor-native.log`），包括真实焦点、单视频关闭／返回／UI 返回、同屏自身关闭及上述故障注入；故障注入又连续三次通过（`rhvideo-recovery-final-fault-[1-3].log`），每次均核对存活窗口取得真实完成结果、一次动作提交、无目标列表重读，以及实际清空播放器／销毁窗口。

这不是性能验收：专项中仍有一条完成结果在约 4.9 秒才返回，而原生记录的动作完成约 0.8 秒，额外等待尚需继续分段。产品 EXE 仍为上述 `6291fd78…`，本轮回执修正只有命令行脚本，没有借此改变播放业务或内核。新增原生用例未纳入之前 67 项原整轮的数字，没有重跑最新版全部 68 项，也没有替换正式程序或发包。

## 2026-10-28 Android 同屏实际画面旋转（本轮原生回归通过，整体目标仍未完成）

新增红测先复现手动角度被迟到的媒体尺寸回调从 90° 改回 0°。压缩发行 APK `e9da2ee0…` 的实际截图测试又复现：90° 后 SurfaceView 的屏幕横坐标成为 1439，超出 1080 像素屏幕，接口仍报告暂停、定位及播放正常。日志为短路径 QA 的 `rhvideo-grid-manual-rotation-jvm-red.log`、`rhvideo-grid-pixels-isolated-red-native.log`；不是只从源码猜测裁切。

现在同屏使用既有的原生画面图层变换，不旋转控件／控制条。每格角度属于其当前会话，迟到格式信息不重置；普通单视频的原有智能旋转规则不改变。Android 10 及以上不重开解码器、不复制视频像素；更早系统以 Media3 effects 重建该格，保留逻辑输入、暂停／进度／速度／增益及轨道选择，不重启其他格。资源解绑仍在释放播放器前完成，旧帧回调只持有其所属的计数器。

最终压缩发行主 APK SHA-256 `490d008e55ec6221dd89ca8005ff48039c102d0fc70402d93d7c975017a0fd96`、探测 APK `8a9a2474be99e8f0cf316e9870c12e0f6c2456d23d0bcfa617c784e99607a401`，仅安装到自有模拟器，已核对安装字节及构建输入。JVM **372/372、零跳过／失败**，其中固定角度政策在 API 28／34 验证，旧系统 effects 初始化及普通单视频未改变也有独立用例；这不等于旧系统实际像素验收。最终原生 `grid-rotation` 场景通过：四个方向的红绿蓝黄真实标记像素、暂停位置、输入身份、速度／音量、翻组回访及非整数角度拒绝。日志 `rhvideo-grid-native-rotation-final-build.log`、`rhvideo-grid-rotation-final-native.log`，截图已检查。

像素专项采用固定两格，原自动三格完整场景没有删减。首次尝试在进入旋转前第三格的 `c2.android.aac.decoder` 初始化超时，属于尚未解决的间歇解码资源问题，不能算旋转红测，也不能宣称此次画面修复解决了它；证据 `rhvideo-grid-pixels-red-native.log`、`rhvideo-grid-rotation-first-red-logcat.log` 保留。

随后同一最终主 APK、探测包 `8a9a2474…` 的完整 `grid` 和 `single` 场景均通过，日志为 `rhvideo-grid-rotation-final-full-grid.log`、`rhvideo-grid-rotation-final-single.log`。三格场景仍检查真实视频帧、DOWN/MOVE/UP 跨 A→B→A 的旧输入拒绝、收藏及暂存、旋转／定位／EOF、正常关闭只提交一次、账户切换丢弃旧标记、HTTP 503 终态不产生流量循环。单视频场景仍含真实图片像素／HTML 错误拒绝、实际原生菜单、单项父截图、逐次返回身份、控制状态及账户隔离。实际三格及错误截图已检查；原有灰色按钮／紫色状态栏和较长错误码排版仍未作为易用性验收通过。

另直接执行原版 `applyVideoRotate` 的 resize 回调，确认窗口变化只重新适配已有角度，不重新执行 `shouldRotate`；没有以“更智能”为由改写这一流程。新增原生测试实际切换宽／窄视口，逐次检查相同暂停输入、位置、速度、角度及真实标记像素。仅探测包重编译为 `765c83ff9756aa5db2efce17c445f65743069840e283993c290ed73da95fa39b`，产品 APK 字节仍为上述 `490d008e…`；完整智能旋转场景通过（`rhvideo-rotation-viewport-final-native.log`），保留原菜单、后续源、旧输入／旧设置拒绝及账户偏好断言。最新完整 Node **535/535、零跳过／失败**，包括真实参考源码的尺寸变化规则，日志 `rhvideo-grid-rotation-fidelity-final-node.log`。

未发新包，不把本项修复当作全部 RHVideo 前端功能／性能已还原。旧 Android 实际像素、长时／低资源和前述间歇解码问题、Android 自身页面关闭回执、Windows 同质量首帧以及其他尚未验证项继续保留。

## 2026-10-28 播放器关闭接口的结果丢失（默认原生整轮已通过，整体目标未完成）

新用真正命令行 `--window window-rhvideo-player --wait` 的红测复现：视频窗口实际关闭，但运行结果随该 WebView 消失，客户端只得到 `CONNECTION_LOST`。此前从主窗口代为关闭，漏测了这个调用边界。现将关闭操作的完成回执保存在当前应用进程中，命令行断线后只查回执，不重放动作、不把窗口消失当作成功，也不保留隐藏播放器。回执有容量、完成后过期、淘汰标记及重复 key 保护，参数仅保留摘要；回执作用域不是跨崩溃事务。原生窗口关闭失败不再静默吞掉。

Node **530/530**、回执 Rust 专项 **8/8** 已通过；完整桌面 Rust lib 是 **246 通过、10 个原有忽略项**，不是零跳过。真实原生输出专项 EXE `22e9dfe5…` 通过关闭／返回／UI 接口返回三种调用，还验证重新打开另一视频后重复旧 key 不会关闭新输入，窗口确实被销毁。随后最终 EXE SHA-256 `01a8b18ecf2ad2dd8190c5e1662822358472a56a41a07609b4b1c368cbe80220` 的五份完整默认硬件输出回归已结束，**65/65、零失败／跳过**，逐窗确认 `native-hardware-auto`，没有以兼容输出替代。日志为 `rhvideo-self-close-cli-red.log`、`rhvideo-self-close-cli-green.log`、`rhvideo-close-receipts-full-default-native.log`。

完整 Node 中曾出现已有播放意图用例“固定 30 次 setImmediate 后准备未到达”的失败，实际前置步骤使用异步 WebCrypto。现在该用例等待真实准备节点，若旧操作提前结束／失败立即报错，整例仍有五秒上限；原先“旧播放不能覆盖新点击”的断言保留，没有延长产品播放等待。共享协议的 Android 两份镜像同步后，已重新构建两个原生 ABI 及压缩发行 APK；主 APK SHA-256 `e9da2ee0122354eaa0cf2fd38407fa4a8cd1e081693313af17813e1dafccb13f`、探测 APK `c1505c41455ea2ef7e9ce2aa3002e5ef98082bd11bba55e1b5354de2926d4c8c`。JVM **368/368**，相同新主 APK 的完整 `single` 与 `grid` 原生场景均通过，安装字节核对一致，只使用自有模拟器。日志为短路径 QA 的 `rhvideo-close-receipts-android-target-build.log`、`rhvideo-close-receipts-android-probe-unit.log`、`rhvideo-close-receipts-android-single.log`、`rhvideo-close-receipts-android-grid.log`。这只证明共享协议没有破坏这些场景；Android 媒体库自身销毁时的脚本回执尚未独立验收，不能套用 Windows 的进程回执结论。

此项不等于首帧性能或全部交互已经等价，也没有发布新包。Windows 原生冷首帧、长期后台／低资源，以及 Android 实际同屏媒体旋转等前述未完成项继续保留。

### 同轮普通文件界面回归与首帧分段

普通文件界面回归首次 **233/234**，查出回收站及设备组侧栏仍使用内联回调，违反原有监听注册断言；改为登记同一业务回调后，完整 GUI **234/234**（`rhvideo-sidebar-bindings-full-gui.log`）。未修改回收站／设备组导航语义，也没有删掉失败断言。随后真实 CDP 鼠标测试进一步复现中键只有 down/up、没有 auxclick，回收站没有打开新标签；在中键按下时阻止 WebView 默认自动滚动后，普通、Ctrl、中键及 UI 接口场景通过，日志 `rhvideo-sidebar-middle-default-prevented.log`。专用单元测试也保留 Meta 行为及按下时不能提前导航的断言。

最终相关 debug EXE SHA-256 `6cfc3d8d063dc109c12586f69887d7ad7edd257daf8e04543a7f54451fb3b4ff`，相对上述 65 项整轮只增加侧栏监听修正及三个调试阶段时间戳，**不是在这份 EXE 上又跑完 65 项**。完整 Node 在提供真实 `RHVIDEO_SOURCE` 后 **534/534、零跳过**（`rhvideo-sidebar-final-with-reference-node.log`）；首次忘记提供该路径时有 12 个差分用例跳过，不将那次记录当作完整通过。

同一新 EXE 的 H.264/1080p 首帧探测确认仍为默认硬件输出，实际红绿蓝黄标记画面出现在 **5.040–5.417 秒**区间，打开应答约 **0.699 秒**；并非打开应答就已有画面。新增阶段显示窗口就绪 459 ms、视口 570 ms、预加载锁 570 ms、主线程画布 575–595 ms、输入启动 675 ms。本次没有复现上一轮主线程前约两秒的间隙，但首帧仍慢，不能把它算成已修复。流缓冲日志为 1250 ms 内容在 31 ms 读完，硬件解码准备仍有长等待；缓冲读取快也不证明时钟缓存与显示调度没有贡献，更不能据此修改驱动或盲目缩短缓存。证据为 `rhvideo-startup-stage-boundaries.log`、`rhfiles-e2e-cwM8HI/startup-measurement.json`。这是一次开发构建诊断，不是同质量、相同视口的发行版 P50/P95 对照，性能目标继续未完成。

## 2026-10-28 图片类型兼容与原生失败诊断（仍未完成整体验收）

Android 曾只相信上游的 `Content-Type`：两条新增集成测试首先全部失败，分别复现有效 WebP 被 `application/octet-stream` 标签拒绝，以及 HTML 错误页被 `image/png` 标签接受。现与 Windows 一样检查内容：最多探测 64 字节前缀、五秒探测上限，不消费流中的字节、不先下载整图，仍保留 32 MiB 图片上限和账号失效检查；已知栅格签名决定 MIME，SVG 还须匹配显式 MIME 与 XML/SVG 开头。图片响应附加受限 CSP。完整 Android JVM **368/368**、Node **521/521**，零失败／跳过。原生单视频场景新增实际加载分段传输、错标类型 PNG 的断言及错误页面可见失败断言，不能用单元测试替代真实解码。

完整同屏仍未通过。原主 APK `82b7826a…` 配合探测包 `5805ff6e…` 在失败诊断中又触发 `NoSuchFieldError: Companion`，是独立编译的探测包直接引用了发行 APK 被 R8 优化的 Kotlin 成员；已移除这条直接引用，保留公开 API 失败断言，诊断改为界面附着状态及媒体库自身公开 `grid.state`。随后同一产品 APK／探测包 `3d19538e…` 真正报告首组两格 `ERROR_CODE_DECODER_INIT_FAILED`，日志明确是 `c2.android.aac.decoder` 分配超时，不是图片或假成功状态。证据为短路径 QA 的 `rhvideo-grid-state-public-diagnostic-native.log`、`rhvideo-grid-state-public-failure-logcat.log`；不能据此解释此前有画面但主接口回执超时的全部现象。

专用模拟器随后在没有启动 RHFiles 时也出现 SystemUI／系统服务 ANR，启动检查正确拒绝验收。仅重启自己创建的 `RHFilesRhVideoQA20261027`，随后用 6 GiB／6 vCPU 启动仍遇到系统级迟滞，说明不能把原因定为低内存；启动日志、原配置和失败保留。未修改生产 Windows 实例或真机。新图片修复 APK `03cb45a311bf5468550730f1de757bcd82b1ccff6aae5d68719f6c83363af7fc` 还须完成原生验收，不发布更新源、不将重建环境算成产品性能修复。

在专用模拟器恢复无 ANR 状态后，同一主 APK、探测 APK `c1505c41455ea2ef7e9ce2aa3002e5ef98082bd11bba55e1b5354de2926d4c8c` 的完整单视频场景通过，日志为 `rhvideo-image-content-pixels-single-native.log`：错标类型／分段传输的 PNG 不仅 `naturalWidth` 正确，还逐次截图核对红绿蓝黄四块真实显示像素；HTML 错误正文必须显示失败。第一次新增用例错误地把含标题／关闭按钮的整个弹窗与正文作精确比较，保留失败记录后改查 `.wb-content`，没有删除失败提示要求。最初仅看 DOM 后立即截到旧界面的事实也保留，新截图 `rhvideo-image-content-actual-pixels.png` 已查看，实际包含完整图片弹窗；不再将解码尺寸当成已经显示。相同场景继续通过原生视频帧、菜单、单项父层、重复启动、临时控制状态及账号边界。完整同屏仍须独立通过，不能把本条结果扩写成全目标验收。

随后同一主／探测 APK 的完整 `grid` 原生场景也通过，日志 `rhvideo-image-content-complete-grid-native.log`、对应 `-trace.log`／`-requests.json`。除真实三格视频、实际 DOWN/MOVE/UP、暂停回访／旋转／EOF 外，还通过原先失败处的关闭暂存、重开两格、活跃窗口退出账号、旧标记丢弃及终态 HTTP 503 不产生请求循环。服务器写次数断言保留，实际同屏／失败截图已查看。**这是一轮在恢复后测试环境中的通过，不是间歇问题根因已经解决**：本次产品差异主要是图片内容探测，不能据此将先前音频解码器分配失败／主接口超时算成生产修复。长时后台、低资源、同质量首帧及实际媒体旋转等仍须继续；原生工具条也仍有默认灰按钮、紫色状态栏和错误码换行，不把功能断言通过当成易用性完整合格。

另已核实正式主分支 `1a2e1a9` 的 Windows CI **40641064216**、macOS CI **40641064209** 均完成且 success；这不代表后续开发分支的 Android 验收已绿。

## 2026-10-28 Android 同屏操作与输入边界（新增 APK 验收尚未通过）

开发代码补入每格原生收藏／暂存标记按钮，与共享 `grid.favorite`／`grid.mark`、`native.grid.control` 的同名命令使用同一业务入口。状态包括收藏忙碌／错误及暂存标记；正常关闭先释放播放器再一次性提交暂存，重复关闭不重放，切换账号的强制关闭不提交。切账号时按离开的 generation 关闭旧 Activity，迟到关闭不能作用于新账号。旧播放器回调也不能给替换后的格子添加首次画面／错误。另按实际原版 `toggleFavorite` 纠偏：过期输入须在接受操作前拒绝；已接受的收藏绑定固定媒体 ID，普通导航不能撤销它，后台仍校验账号有效性。

组号／会话不足以拒绝 `A → B → A`：新增 `expectedInput`、`inputTarget` 和整组 `expectedInputs`。按钮／滑杆在按下时捕获目标，不在松手时改成后来选中的目标；取消手势不执行。新增实际原生 DOWN/MOVE/UP 场景，还要求手势在整个翻组过程中确实保持，避免用意外取消冒充通过。原生 Media3 的逐项帧、暂停位置／音量／速度、旋转、循环、重开、收藏服务器写入／失败、一次性暂存、活跃窗口退出账号及终态 HTTP 错误均纳入整轮，而不是只验证 API 存在。

当前 Windows 共享前端 EXE SHA-256 `05053c6a49a178b48ca0f5d7aa7ffb84f12543bb666149aa2f6348e285f67529`，图库真实窗口 **8/8**、原生输入／完整同屏专项 **2/2**，新增工作台与控制器共享收藏／显式暂存状态的定向回归另 **1/1**；日志为 `rhvideo-mobile-grid-windows-gallery.log`、`rhvideo-mobile-grid-windows-native.log`、`rhvideo-mobile-grid-shared-actions-native.log`。不是 Windows 全部原生场景重新验收。Android 原生／嵌入前端已重新编译 arm64 和 x86_64；先前 359 项 JVM 通过，但后续收藏接受语义的新源码仍须以新测试结果为准。

后续源码的完整 Node **521/521**、Android JVM **361/361** 已通过，均零跳过／失败；包括实际执行原版收藏函数、接受后固定目标、接受前旧输入拒绝、账号撤销、一次性关闭及输入数组。证据 `rhvideo-grid-admission-full-node.log`、短路径 QA 的 `rhvideo-grid-admission-build.log` 及 Gradle XML。新增原生阶段／超时线程栈的压缩发行主 APK SHA-256 `82b7826ac3a3793da40af1f01a17a49ba0e8824571972e9e1f0accf3e9110b2e`、探测 APK `3722d8cb019b0c1d2cdef9012510d8989c2b13d100c4b4893b1f1f9b51bbfd5b` 仍在定向诊断，不能提前记为原生通过。开发源码保存在 `codex/rhvideo-startup-pixels`，暂不推进正式 main／更新源。

相同 APK 后续通过一次独立 `grid-restore` 定向场景：实际原生收藏／取消、显式暂存／取消、三格实际播放与暂停、保持手势翻组 `A → B → A`、新旧解码输入区分、松手拒绝旧输入且保存的音量／位置／静音／速度不被修改。`rhvideo-grid-admission-diagnostic-native.log` 有明确的实际手势释放断言，安装哈希也核对；`rhvideo-android-grid-restore-release/rhvideo-grid-restore-qa.png` 已查看，包含三个真实彩条视频及原生按钮、旧输入拒绝提示。原生创建／prepare 返回约在一秒内，首次三格帧约 5.5／8.0／9.0 秒。这只是一次通过，不解释前面的间歇失败、不证明性能合格；同一 APK 的完整同屏场景继续独立运行，不能把定向通过倒写成此前整轮成功。

**Android 新整轮没有通过。** APK `698d52cc…` 的首轮在新增账号场景前达到脚本六分钟总预算，被终止，不能算成功。只扩大新增整套业务场景的预算，不改变单格帧／seek／EOF 超时后，同一产品 APK、加强手势的探测 APK `cd874d0a…` 又实际复现暂停组回访失败：三格仍在 BUFFERING、出帧为零，约 27 秒后才建立解码器。随后只加本机 opt-in 网络计时的 APK `6782487e…` 在首次同屏打开遇到 JavaScript 回执超时。日志 `rhvideo-mobile-grid-native.log`、`rhvideo-mobile-grid-held-gesture-native.log`、`rhvideo-grid-restore-trace-native.log`（均在短路径 QA 目录），以及 `rhvideo-mobile-grid-stall-logcat.log`、`rhvideo-grid-restore-network-trace.log` 保留失败事实。后者已有连接复用失败／重连及明显等待，但还不足以断言唯一根因。主机仍有约 52 GiB 可用内存，普通 ADB shell 约 137 ms，不能泛称内存不足。

继续增加不含 URL、文件名、令牌的原生创建／准备阶段和超时线程栈，缩短到同一暂停回访场景诊断；这不是删除原有验收。当前不发布正式包，不把新增入口、Windows 通过、旧 Android 包或旧 JVM 结果当作 Android 整轮已通过；首帧性能、其他业务组与完整目标仍未完成。

## 2026-10-28 服务器图库顺序、种子与继续浏览纠偏（整轮验收中）

实际执行参考 `loadGrid` 及最后生效的 `applySeedGridOrder`，再次发现业务差异：本端把图库套用了视频清单排序，把混入图片追加在视频后，种子按媒体 ID 而不是原版的图片 ID／视频 ID+截图 URL 排名。新增五项最初全部红测。现默认保持服务器视频/截图顺序，默认混合池为图片目录顺序在前；首次混合仍自动选取种子，显式“还原顺序”回到默认。新种子按原版 UTF-16 FNV 排名及源序号处理碰撞，插入新项目不改变旧项目的相对次序；旧数字种子继续沿用原算法。图库展开改在 Worker 内完成，避免前台建大数组及大数组参数展开。

命名顺序按原版标签规则/是否混入图片分区，不随每视频截图数量变化而消失；恢复命名顺序回到第一页，独立于浏览页码。普通重新登录恢复图库页码与种子。“继续浏览”则真正打开上次图片：优先用视频 ID+截图 URL，缺失时退回同一视频首张或有效位置，不只是跳回一页。关闭、换账号/筛选/种子/页面后的迟到定位不会重新打开旧图。保存/删除命名顺序等待原生存储应答，写失败回滚相应内存记录、不自动重试；旧格式名称/数字种子迁入当前分区，不用偏好对象覆盖活动请求状态。图库卡片与预览另恢复截图时间点/时长信息。

队列合并只针对显式的过时 UI 绘制，播放/导出/保存快照及目标定位不能被后来的翻页静默取消。当前完整 Node **519/519**、零跳过，包含实际参考函数的默认/混合/种子/复杂标签分区差分，以及十五万图片构造、精确位置、存储错误和异步归属用例；既有变异检查 **7/7**、自动化 UI 检查 **29/29** 也通过。Windows 新 EXE SHA-256 `b8275a85da42c547c92a6621f472697bdfbcf8b5595a536a5f1c61a71535e7c7` 的八项图库真实窗口用例 **8/8**，包括 native 偏好落盘、跨登录、命名顺序与浏览记录分离、插入后原图索引 `36 → 37`。相同 EXE 的完整五份兼容输出回归 **63/63**、零跳过，包含图库服务器顺序的实际片段/多视频原生帧、生成 H.264/HEVC、五万图片及实际兄弟 RHVideo FastAPI/SQLite 服务。日志 `rhvideo-gallery-order-ready-node.log`、`rhvideo-gallery-order-ui.log`、`rhvideo-gallery-order-full-gdi.log`。不将兼容输出结果当作全部默认硬件/同质量性能验收。

Android 当前压缩发行主 APK SHA-256 `2fc6676ad0dd3ad75f83fc1a16a371107c98659f2dd2cff1d6543a5abbbb1367`，探测 APK 为 `367ef91270dddeba7435917d1287e59d79626aa11b3d18763c72ccff7aafc08e`。只安装到自有 `emulator-5584`，安装字节/共享前端与源码逐一核对；短路径构建缓存的 173 个受跟踪 Android/core 原生文本输入与干净工作树一致（仅规范化行尾），JVM **348/348**、零失败/跳过。完整 single 场景通过，包含原生实际帧、首次混合/显式默认顺序、命名种子保存/分区恢复、继续浏览实际图片及原先单项父层、菜单、逐次返回、账号隔离断言。日志 `D:/git/RHFiles-connection-QA-20261025/test-artifacts/rhvideo-gallery-order-android-single.log`；实际首页截图仍能看到过密工具按钮，未把美观/易用性判为通过。当前没有 Android 全部原生场景或真机验收，没有正式发包，完整功能与性能目标保持未完成。

### 默认原生输出与等待分段（性能仍未达标）

在 debug-only 启动诊断增加不含地址/媒体身份的打开阶段，区分内核查找、WebView 窗口、焦点、原生画布、工作线程与发出播放；发行版不开启。仅该诊断变更后的 EXE SHA-256 `2214c8111728a109311db308d32f036e4ec45cc42b8379665a9ecebbb2500526`，默认 `native-hardware-auto` 四项定向实际播放 **4/4**、零跳过，包含主图库父层返回、服务器顺序片段/同屏、缓存父图及迟到点击。相关 Rust 单元 **41/41**、零忽略（另 207 项被名称过滤，不是整份 Rust 集通过）。日志 `rhvideo-gallery-order-default-native.log`、`rhvideo-startup-stages-rust.log`。

相同 1080p H.264 生成文件的单次新进程测量：窗口就绪约 **985 ms**、原生画布 **1040 ms**、内核准备 **1090 ms**、动作应答 **1111 ms**，首个实际四角可见画面区间仍为 **4.70–5.05 秒**。不是仅靠预加载计数或显示统计；解码前窗口等待与随后原生呈现等待都存在，不能再把全部时间归于读取全图库。主机有 Arc B580 与虚拟显示适配器，结果不能外推为所有 Windows 机器的显卡根因。单次缓存/调度波动不构成相对旧测量的加速结论，也没有同几何/同质量参考性能通过。证据 `rhvideo-startup-stages-native.log`、`rhfiles-e2e-HhwsfW/startup-measurement.json`。

## 2026-10-28 修正阻断 Windows CI 的冷却测试

`1736bd2` 的 Windows CI `40634883532` 最终为 failure，macOS `40634883298` success。Windows 失败在服务连接恢复集成测试，未进入 GUI 阶段：`manual_retry_can_recover_while_automatic_calls_are_cooling_down` 在观察两秒冷却后才重启 TLS 服务，CI 上启动耗时使冷却先到期，却仍断言必须记录绕过冷却。现预先准备真实 TLS 服务及签名地址，通过 TCP 门控制造连接失败；观察自动请求仍为 cooldown/零尝试后，同步开放已有通道，再要求手动请求完成真实身份验证并保留 `manual_retry_allowed` 断言。没有改生产重试/授权逻辑、延长冷却期或删除断言。

本地完整连接恢复 **11/11**、零跳过，并连续 **8 次**通过该真实 TLS 冷却用例。证据为 `ci-1736bd2-windows.log`、`ci-cooldown-gate-tests.log` 及 `ci-cooldown-gate-1.log` 至 `-8.log`。随后已独立核对 `9df01c9` 的 Windows CI `40639263385`、macOS CI `40639263378` 均为 **success**；Windows 已实际执行文件系统/恢复、构建、GUI 和 PDF 步骤，不只是排队或通过前半段。这个结果不代替之后新提交的远端结果。

## 2026-10-28 恢复默认一级截图浏览（仍非完整对齐）

再次对照参考的 `tab-btn-grid`、`tab-grid` 和 `showApp`，确认默认主视图应为截图浏览，而不是视频清单及附属截图弹窗。两端共享前端已恢复一级截图入口及默认主页面，视频清单仍独立存在；显式旧弹窗动作继续兼容。主截图页使用原有筛选、分段连播、同屏、顺序保存/恢复、分页和图片预览动作，不是另建一条只有样式相似的流程。`gallery.show` 及 `state.view` 公开给脚本。慢读取可以切走，旧结果只完成后台快照，不得强制跳回或弹出模态层。

新 Windows 真实窗口红测先复现默认入口错误，修复后截图相关 **7/7**、完整 Node **503/503**，零跳过。实际鼠标点击截图/视频导航、跨页预览返回、截图页码保留、搜索、慢网离开及全部 UI/API 绑定均有检查，截图文件为 `test-artifacts/rhfiles-e2e-7r86H5/primary-gallery.png`（生成测试素材，不是生产库）。原有清单工作流现在先显式导航到视频清单，不再假定它是默认可见页面；默认行为由独立用例验收，而非隐藏测试入口强行维持旧假设。

Windows 本次 EXE SHA-256 `45de9facc38f0cdefec8fb5d47638646fe681a46315628e2e1a09b423acaa673`，最终完整兼容输出回归 **61/61**、零跳过，日志 `rhvideo-primary-full-gdi.log`。其中主截图页“指定时间点原生实播 → 返回同一图片 → 关闭后仍在原页”也经过真实帧检查。随后清除兼容标志，逐窗确认 `native-hardware-auto`，主截图实播、冷点击、缓存父层及迟到真实点击 **4/4**、零跳过，日志 `rhvideo-primary-focused-native.log`；不是完整 61 项硬件输出重跑，也不证明冷首帧已达到参考性能。

Android 新压缩构建及 **348/348** JVM 通过；218 个相关 Android/共享文本输入与干净工作树一致，仅排除未打入 APK 的桌面播放器/网格脚本。仅在自有 `emulator-5584` 上覆盖测试包、核对安装字节后，完整单视频原生场景通过，日志为隔离 QA 的 `rhvideo-primary-android-single.log`。包含默认主截图页、实际图片解码、主页面筛选/清空、切去视频后冷实播不被后台图库阻塞，以及其后的父预览、原生菜单、单项返回、模式/账号隔离。主 APK SHA-256 `90e1dda1f0e5acf28052690be0aeaf02755f54a7ca00f70be25787e512761006`，测试 APK `435034b0414b3047d58787b219a02c8a031cc169916eb311b6269d86cc769a27`。已查看 `rhvideo-primary-gallery-qa.png`，手机主页面工具区仍偏密集，不把行为通过称为全部交互已经美观好用。

变异检查 **7/7**、自动化 UI 检查 **29/29**。源码 `1736bd2` 已分别推送 GitHub/Gitee；macOS CI `40634883298` success，Windows `40634883532` 最后核对仍 in_progress，不能称整体 CI 已绿。更早 `6e02475` 的 Windows 运行后来因新推送取消，不是成功。未发正式包、未替换生产实例或操作真机，前述性能、图库默认顺序/恢复细节和 Android 缺口仍未全部完成。

## 2026-10-28 单项定位不再搬运全库（仍非完整验收）

普通视频借用首个父截图、打开图片和检查截图，改为在 Worker 的同一筛选/排序快照内返回准确索引与一个目标，不再把完整队列复制到界面线程后再查找。不改变父层顺序、总数、跨页导航或随机种子。精确目标不存在时明确报错，不再错误打开第一张无关图片。后来的分页绘制不会取消用户点击的定位；关闭图库、换账号、换目标或更新快照后，迟到的截图查询/解析不能重开旧预览。

新增八项定位测试和一项 Worker 归属测试，旧定位实现的最初七项全部红测；当前完整 Node **501/501**、零跳过。十万项索引核对相同顺序与有界响应；实际 WebView2 的五万截图池从最后一项回绕到第一项，单目标 Worker 应答 **574 字节**，没有全队列字段或额外全库读取。Windows EXE SHA-256 `16cb1ff3eb64a5ea8fc3e9a92be60c90bec7e6f439d974364b07332d60393049`，兼容输出相关专项 **6/6**，默认硬件输出冷点击/缓存父层/迟到真实点击专项 **3/3**。首次完整回归 **56/58**；两项失败分别是新用例误调用不存在的 `image.next`，以及旧延迟拦截仍匹配已去掉的 `allKeys`。修正为实际 `image.step` 和目标定位消息后，上述专项保持原行为断言通过，不将其写成完整 58 项重跑。日志前缀 `rhvideo-locate-`。Android 的共享资源已经构建，最终原生场景仍须另验收。

另确认入口仍有重要偏差：参考默认显示截图浏览，而本端把它放在弹窗、默认显示视频清单。必须继续恢复一级浏览上下文；本节定位优化不等于这项或已记录的首帧/移动端缺口已修好。没有发布正式包。

## 2026-10-28 登录准备、截图库异步归属与暂停意图（仍在验收）

继续执行真实 `showApp` 验证：原版登录会发起 `loadGrid(false)`，但不等待它才读取视频列表。现恢复这种后台元数据准备；普通点击视频仍不等待未完成的截图库。进入截图库与后台准备共用同一在途读取，旧账号、旧筛选/设置和旧刷新结果不能写入当前索引或给当前数据贴上“已加载”。用户主动进入时有可关闭的加载面板；关闭后迟到的索引/图片地址不会把它重新打开。后台失败既可用 `gallery.state` 查询，也在工具栏持续显示，不会因刷新视频列表消失或自动循环重试。

截图库工具按钮改为随宽度换行的工具栏，不再一项占一整行。筛选变化更新已打开的截图库，清空时明确显示无匹配项；翻页/跳页的禁用和范围与数据一致。注册、登录及初始化偏好的迟到结果也增加归属检查。新的读取/刷新/关闭延迟用例直接执行打包函数，旧代码的五条核心断言均曾失败；现相关单元测试 10/10。真实窗口另验证后台不挡卡片、单次读取、真实图片解码、关闭、错误常驻、同账号旧刷新隔离、已打开图库筛选及 800/360 像素布局，不是仅查接口存在。

也核实了上一源码 `214fb62` 的 Windows CI `40626287172` **失败**，macOS `40626287258` 成功。失败并非“暂停恢复再多等一会”：41 次后台维护后有一格 `state=3`、无恢复计划，说明立即翻组时把尚未执行的“全部暂停”丢了。现在保存已接受的 `pauseRequested`，不以解码器滞后的状态决定翻组快照；同样保护刚接受的继续播放。旋转、定位、播放按钮/原生快捷键及连播监视遵循这个意图，真实解码状态另行保留。没有增加原有 2.5 秒兼容输出检查或 12 秒硬件输出检查的等待预算。

相关 Rust **41/41**，无失败/跳过。Windows debug EXE SHA-256 `b14f7ffb93024de045e7ff1381f753bf31da51a148136c3ac2a5974e3e04453a`：默认硬件输出专项 **5/5**，兼容输出的四项图库及关闭/同屏专项 **6/6**。首次整轮 57 项为 56 通过、1 失败：旧测试把“播放结束必须自动打开图库”当成已有上下文；这恰好来自以前的额外弹窗副作用。断言没有删除，改为分别从普通列表和已打开图库进入，要求结束后准确保留各自的弹窗集合。相同 EXE 的最终完整兼容回归 **57/57**、零跳过，记录于 `test-artifacts/rhvideo-gallery-pause-final-full-gdi.log`；不是 57 项默认硬件输出的完整重跑。

Android 最终压缩 APK 的真实原生单视频场景也通过：首次视频 HTTP 读取才释放后台图库，证明冷池不阻塞播放；后台完成不弹窗，主动打开后更改筛选得到空集合、清空后恢复，同一场景继续核对父截图及原生控制。仅使用自有模拟器，主 APK SHA-256 `b656c935b7f419fbb3e3aed1c7e9554e4b80d0f83ff786d3b2e5884a2515d5b9`，测试 APK `29aa1d9a71ff649d5593ecccc076a5148bb01fc12fe7e49285f9915967030178`；实际安装字节一致。日志在隔离 QA 的 `rhvideo-gallery-filter-android-final-single.log`，不冒充真机及所有 Android 场景验收。

随后 Node 完整重跑出现 **487/488**：HTTP 夹具随机分配到 Fetch 禁止的端口，登录请求在发送前即报 `bad port`。本机动态端口范围从 1024 开始，因此不是账号错误，也不能靠重跑隐藏。测试服务与 CDP 现在只公布浏览器/Fetch 允许的回环端口，最多尝试 16 次，真正的绑定错误直接返回；不改系统设置、不关闭浏览器端口保护。新增四项实际端口/错误预算测试后完整 Node **492/492**、变异检查 **7/7**、自动化 UI 检查 **29/29**，零跳过。生产 Windows HTTP 通道原本已有 Chromium 端口过滤，本项属于测试设施修复。

首帧延迟、剩余功能/物理交互及已记录的 Android 缺口没有因此完成。本节没有正式发包或替换正式实例。

## 2026-10-28 普通点击与非预加载换源纠偏（尚未完整对齐）

继续直接执行参考源码发现：`playVideoLocal` 是同步函数，只查已有的 `gridMedia`；此前 RHFiles 却在冷池点击视频时等待整份截图库请求。现在不再由普通点击发起这个额外读取，已加载的父截图及返回位置仍保留。新增差分测试分别执行原函数与实际打包脚本；旧实现的冷池断言确实失败，修正后通过。Windows 实际播放另验收冷池无截图请求、已有池返回首个匹配截图，以及单项父集合的原生按钮返回。这里验证的是这两个点击分支，**不是登录全流程已经完全相同**：该轮当时仍是按需加载，参考登录会后台读取截图库；这项后续恢复见上节，不倒改为当时也已完成。

原生换源不再在 `set_media` 前额外 `stop`、销毁输出，又无条件重建 DirectSound。按 libVLC 3 的实际实现，`set_media` 结束旧输入、保留可复用输出；旧输入结束后才清零本次帧/时钟。音频明确选择独立的 `directsound,none`，已有输出不重置；若显式停止后输出已释放，仍在播放前初始化并设定正确增益，不回退共享系统会话音量。调试阶段计时不含地址或凭据，发行构建不开启。

新增真实像素换源验收：红色 640×360 → 蓝色 180×320 → 红色 640×360，每项都先在旧输入暂停、定位，再验证新源的尺寸、实际中心像素、独立起点与旧输入拒绝。不是只验证 ID 或显示计数。Windows debug EXE SHA-256 `edb510aa472bfb2343d9a2c73618c32f5ca5bcb90a3122edeca3da449263271f`：原三份完整兼容输出回归 **52/52**，新增像素换源另 **1/1**；默认 `native-hardware-auto` 的点击、父层、换源、循环、预加载、独立音量、智能旋转和拖动专项 **9/9**，均无跳过。Node **476/476**、相关 Rust **40/40**、7 类既有变异检查也通过。这不是默认硬件输出全套业务验收。

性能没有宣布修好。新增有界的原生四角像素探测，分别记录首次实际画面区间、显示统计与操作回执；退出测试进程后等待输出管道排空，避免截断日志误判解码器。相同 1080p H.264/AAC 夹具 SHA-256 `4206d583…`，本次原生实际首帧区间仍为 **6.90–7.28 秒**，操作回执约 4.39 秒，内核创建约 64 ms，发出播放约 1 ms；仍有进入内核前和开始解码后的等待。实际原版页面在同一 WebView2 引擎独立运行，首次视频合成回调约 **2.41 秒**，之后截图确认画面可见。两者窗口/画布大小及计时手段不同，只有一次样本，不能当作严格同画质性能比较，更不能称为加速已达标。比较脚本只用于隔离测试，不是产品的网页播放回退。

Android 共用前端与更新后的原生单视频探测已在专用 API 34 `emulator-5584` 通过：冷池无父层、已有单项父层、原生菜单/返回、逐次子输入身份、播放模式独立记忆及账号隔离（`rhvideo-cached-parent-android-single.log`）。主 APK SHA-256 `a983b5d43ccfa98bccba868bc4027849364b9516686870ff116105eabac91b47`、探测 APK `7edb14a8c864bcf797e087a8359a924b2926dd0e5d986751481395e3886a6e81`，安装后核对实际字节。该包使用既有短路径构建目录的原生缓存；213 个相关已跟踪 Android/core 输入与干净工作树对比一致（仅规范化 CRLF/LF），本轮两项修改再明确同步，打包资产由运行器逐字节检查。JVM **348/348**，没有跳过。不是其他 Android 场景、真机或整份主工作区验收；截图中的既有拥挤控件及菜单英文也不算修好。

源码 `214fb62` 已同步 GitHub / Gitee，两处发布仍分开处理。没有替换正式 Windows 实例、操作真机或发布正式更新包。所有功能组与性能目标仍未完成。

## 2026-10-28 智能旋转继续纠偏，仍非完整体验验收

原版 `toggleMediaRotate` 是持久的智能开关，不是 0/90/180/270 度循环。现在两端保留按媒体库账号记忆的开关，每个新视频重新比较原方向与旋转方向的适屏程度，仅在改善超过 5% 时旋转 90°。直接执行原版 `shouldRotate` 的 56 组源画面／窗口比例组合，与 RHFiles 的纯逻辑比较；方形、未知尺寸及关闭状态不自动旋转。旧数值偏好可迁移，但显式布尔开关优先。公开 `rhvideo.rotation.state`、`rhvideo.rotation.set` 及播放器控制接口与界面走同一状态，迟到的整份设置保存不能覆盖较新的旋转选择。

验证不再只读角度字段。生成带四个不同颜色角标的视频，读取实际原生画布，检查方向、完整适屏、再次点击关闭、暂停时间、倍速、下一源、重新登录及旧输入拒绝。Windows 调试诊断只读取应用自己的视频子窗口、只写随机命名的隔离文件；发行构建禁止，不能提供任意 HWND、桌面或输出路径。GDI 画布直接读取 DC，默认 GPU 输出读取完整窗口合成内容，两种方式不能混为同一截图路径。早期整轮为 50/51，失败的 GDI 采集得到全黑；修正采集后的定向回归另行记录，不能倒改为先前整轮也通过。

Windows 兼容输出在解码器直接写入的原生 DIB 上呈现旋转，没有每帧额外 CPU 像素复制；离屏真实像素测试覆盖四种显式角度及 1/2/3 倍尺寸。默认输出另修正旋转后的显示比例：VLC 3 交互滤镜会转换回输入尺寸，单看其 PNG 的原始尺寸不等于实际窗口没有旋转。**此路径仍有额外转换／重采样，不能称为与原版同画质、同性能**；方向元数据、非方形像素及 HDR 仍须继续核对，冷首帧偏慢也没有因此解决。

首帧性能仍是未关闭缺陷。默认输出的 `firstFrameMs` 依赖 VLC 显示统计更新，不是独立的首次可见像素计时；后续须直接验证首次可见画面，再区分读取、解码与呈现，不能把统计更新时间直接等同于用户等待，或全部归因于显卡初始化。

Android 实际角标检查先后抓到 View 角度变化但像素未转、给已准备好的渲染器临时加效果后暂停画面丢失，以及重建渲染器被误判为换文件。Media3 效果方案的 APK `638e4d37…` 在相同 8 秒像素等待预算下两次失败：旧引擎释放约 355 ms，新解码器却到约 8.5 秒才创建；没有延长等待、换无声夹具或重启模拟器。Android 10+ 改为公开 SurfaceControl 子图层路径，保持原生 SurfaceView，只操作应用自己创建的子图层，不修改 SurfaceView 所有的父图层，不重建解码器或复制每帧像素。原型又被真实像素检查抓到单位尺寸缩成几个像素、镜像和旋转后整体移出屏幕；SurfaceFlinger 的实际矩阵/位置证明了错误，不能用 READY 和递增计数代替可见画面。现在分别在单位正方形上旋转、在父层缩放定位，同时纠正原生几何方法的矩阵/平移组合；独立四角坐标测试与原生角标检查共同约束。

API 34 的专用 `emulator-5584` 最终通过完整旋转场景：未旋转画面基准、实际 90° 像素、继续播放产生新帧且仍保持方向、再次暂停定位、触摸原生菜单关闭、下一个竖/横源、旧输入/迟到整份设置、同账号重新登录及不同账号隔离（`rhvideo-smart-rotation-compositor-actual-final-native.log`）。主 APK SHA-256 `2f3a73a6257caa9b7badf786771325aa483df0d6acabf62e1a91e4ae1acc8bd3`，探测 APK `b0be1df28467930ddaba89bf244f7f5901f26b8d01057223024a0ca70ab3d840`，实际安装字节也分别核对。保持原来 8 秒像素预算。早期整轮因测试误用未公开的 `play` 命令而失败，改为既有 `resume` 后重跑，而非删除继续播放断言；新增契约测试从实际公开 schema 验证原生场景的命令，并故意注入错误别名确认能捕获。

相同 APK 另通过普通单视频完整场景：原生菜单、单项父截图返回、逐次子输入返回身份、普通播放与连播的独立记忆、退出账号后的状态隔离（`rhvideo-smart-rotation-final-single-native.log`）。

随后相同 APK 又通过连续预览场景：父层返回栈、原生收藏/暂存标记、一次性暂存及逐项结果、独立准备票据、迟到准备及账号隔离（`rhvideo-smart-rotation-final-preview-native.log`）。三条原生场景顺序执行，未同时施加解码负载；仍为原始 1080×2400 / 420 dpi。截图仍有顶栏拥挤、错误文本过长等已记录的 UI 缺口，这些业务场景通过不替代美观/可用性或所有媒体类型验收。

这不是所有 Android 版本或真机验收：Android 9 及更早版本仍有未验收的效果回退，API 34 以外的版本、方向元数据/非方形像素/HDR 等仍须另验收；同屏播放器仍直接设置 SurfaceView.rotation，尚未获得真实像素旋转验收，不能继承单播放器本轮通过结论。后台释放先移除监听及输出，迟到的设置消息不能调用已释放或已替换的播放器。一次 ADB 流式安装 120 秒超时后，只读哈希确认系统已安装新包；该次不记为播放通过，工具改为先推送再安装，仍保持原安装时限、安装后核对字节，无自动重试。

Windows 最终 debug EXE SHA-256 为 `31f1f0b6d518aca48f63658878dde740b6fdff4a476cacb0201f14850e940ae6`。相同 EXE 的完整兼容输出回归 **51/51、零跳过**（`rhvideo-smart-rotation-final-complete-windows.log`）；默认 `native-hardware-auto` 另通过智能旋转的实际画面专项 **1/1**（`rhvideo-smart-rotation-final-focused-native.log`），不是完整 51 项硬件输出验收。当前测试输入同步后 Node **472/472**（`rhvideo-smart-rotation-current-tests-final-node.log`）、相关 Rust **25/25**、Android JVM **348/348**，均零失败/跳过；另有 UI 绑定检查与 7 类既有变异检查通过。旧测试目录错配与缺少发布测试依赖的失败日志保留，不并入通过结果；产品/界面与测试输入分别比对，未执行正式发布脚本。

以上只是已发现的业务偏差和呈现错误的持续修复，不代表其余功能组、物理交互、移动设备或性能已经完整对齐。没有发布新的正式包，也没有替换正式 Windows 实例或操作真实手机。

源码 `aaebfdc` 已同步 GitHub / Gitee。最初核对时 macOS CI `40616587011` 为 success，Windows CI `40616587138` 仍为 in_progress；后续已核对两者均为 success，不把这个结果移用于之后的新提交。此次只提交 24 个本轮 RHVideo 文件，其他文件管理器/网络/设置的既有工作区改动保持原样。

## 2026-10-28 对齐原则与当前缺口

重写只允许改变呈现方式，不能把原有业务缩减成另一个播放器。单视频点击、截图时间点播放、截图父层返回、分段连播、列表顺序连播和超压连播都是独立流程，不能用“当前页视频列表”代替。旧实现曾存在该降级回退；现在工作台未就绪会明确报错，不再静默启动另一种播放模式。

本轮纠正以下已复现的问题：

- 较早的卡片/图片/历史读取或分片准备晚返回时，不得抢走用户后来选中的视频及其截图父层。关闭、时间轴播放、小说打开也会使旧播放准备失效。
- 单视频进度/音量拖动绑定开始时的原生输入；连播总进度绑定整条时间与顺序计划。前者不能误作用于下一段，后者允许正常自动切片，但在重新建队列或修改分段时拒绝旧拖动。
- 两端准备队列采用独立票据，不再由另一份准备覆盖。最多八份、合计十万项、五分钟无操作后按需失效；启用后消费票据，失败/过时准备只释放自己，无自动重试。
- Android 的原生单播放器替换应先退出旧页面、释放旧解码器，而不是把旧播放器堆在返回栈中。旧包已由实际原生 Activity 回归复现；这项生命周期修正不单独证明所有缓冲失败已解决。
- Windows 明确跟踪打包前端目录；验收核对实际加载脚本哈希，不接受用过时内嵌前端测试新源码。

测试自身也做了纠正：Windows 后台媒体用真实页面冻结/恢复验证，而不是把虚拟时间的 `advance` 当成恢复正常时钟；Android 每次异步探测独立编号，语法错误或旧 Promise 不能复用上一条成功回执。

**仍未完整对齐，不发布为“1:1 完成”：** Windows 旋转的方向元数据/非方形像素/画质与同画质冷首帧延迟，以及自关闭播放器窗口的脚本回执；Android 同屏收藏/暂存入口、同组重新打开后的输入隔离、图片内容探测及密集控制布局。Android 原生回归还曾出现有效 SVG 未解码和连续播放 AAC 解码器初始化超时，需分别跟踪，不能靠增加等待时间或降低画质宣布修好。上述“已复现/修正”不代表整套媒体库的所有交互和性能已经验收。

本轮基础验证为 467 项 Node、21 项相关 Rust、341 项 Android JVM，均无失败/跳过。Android 发行构建只安装在专用 `emulator-5584`，最终验证恢复原始 1080×2400 / 420 dpi，未更换无音轨夹具或延长首帧等待。独立票据/原生页面替换专项，以及连续预览、父层返回、收藏、暂存一次性提交、迟到准备和账户隔离整条流程通过，分别记录于隔离构建目录的 `rhvideo-native-player-lifetime-green.log` 与 `rhvideo-native-lifetime-final-preview.log`。APK SHA-256 为 `98cd0da30c4cf01a3a1ef0d8b870f90793f9e1f0b682a1cac56ac7ea4f7d3d80`，探测 APK 为 `e319edef2fc5af1a8a9484a273f94b4bb3275867168abd7ad0eb9074e109ccd3`，安装后再次核对实际文件字节。旧包 `f279ad90…` 在同一原生页面替换断言上失败（`rhvideo-native-player-lifetime-red.log`）。这是一次通过记录，不是实机/性能保证或对先前解码器超时的全面归因。

实际截图仍显示 Android 截图查看器顶栏按钮拥挤、播放器菜单错误信息截断；虽能由 API 调用或 Toast 读到，不作为交互验收通过。未操作生产 RHFiles、真实手机或原媒体库，也没有发布正式更新包。

Windows 最终 debug 程序 SHA-256 为 `f74ff88913b9bd7426f357aa9be69b58b285b9fee705d2a0f9143f1d1f7ea660`。三份 RHVideo E2E 合计 50/50 通过、无跳过（`rhvideo-queue-plan-final-full-windows.log`，GDI 兼容输出），包含同级真实 FastAPI/隔离 SQLite、图片并发/内容探测、原生片段/连播和真实鼠标操作；随后清除兼容输出环境变量，在实际 `native-hardware-auto` 输出下另验收旧点击隔离、单视频拖动、总进度拖动及独立票据四项，4/4 通过（`rhvideo-queue-plan-final-hardware-windows.log`）。两端原生回归顺序执行，未同时施加视频负载。页面冻结验证观察到计数 `2 → 2 → 3`，恢复约 413 ms，不是加速虚拟时钟。

本轮源码提交 `18a2482` 已同步两处远端；对应 GitHub Windows/macOS 工作流分别为 `40596849327` / `40596849282`，首次核对时仍在运行，2026-10-28 后续核对均为 success；这不是本节之后新源码的 CI 结果。测试使用隔离构建快照并核对本轮运行时源码，未纳入主工作区其他未提交改动，不冒充整个工作区或正式发行包验收。通过这些场景后仍以上文缺口为准，尤其不能把 25 秒以内出现测试帧当作原版同画质流畅度已经达标。

## 2026-10-27 体验验收更正

Windows 0.1.86 **不满足“完整复刻、体验已验收”的结论**。控件到接口的映射只能防止漏入口；不能证明播放语义、失败恢复、资源竞争和真实交互正确。此前用生成 SVG、短视频和少量数据通过的流程外推整体体验，验收范围不足。

用户反馈后，已在原始发行包上复现：第 13 个并发媒体读取被客户端直接拒绝为 503（同一服务直连全部 200）；选中 A 后点击 B 却播放 A；当前视频首帧前抢先预加载下一项；循环不能正确重复当前项；关闭单视频停止了独立同屏播放；两格音量设置不同却变成相同的底层实际音量。失败证据位于 `test-artifacts/rhvideo-0.1.86-*-red.log`。

这些场景由 `scripts/e2e/rhvideo-media-pressure.test.mjs` 验证真实原生播放器/媒体通道，并覆盖暂停控制界面的虚拟时钟。Windows CI 原先没有开启原生测试开关，相关用例会跳过；现在必须准备 VLC/FFmpeg 并执行，CI 的 GDI 兼容输出仅作为功能验证，不作真实 GPU/性能保证。没有音频端点时只明确跳过音频输出断言，不将它报告为音频已验证。

隔离的真实 RHVideo 服务另发现：有效 WebP 直连返回 200，媒体通道却因上游非 `image/*` 的 MIME 标签返回 415。现在使用有界文件头探测，并校验多段到达的字节无损、错误 HTML 仍被拒绝。真实服务测试需要同级 RHVideo 源码与 uv 环境；公共 CI 没有该私有仓库，不把这个本地实测算作 CI 已覆盖。CI 另有可公开运行的真实 WebP 解码及错误 MIME 回归。

首播性能单独记录操作到首帧的总时间与原生 `firstFrameMs`。修复版 debug 在当前共享 Windows 测试环境的 1080p／4K 总首帧约 5–6 秒，不能仅凭实际帧出现便称为流畅，也没有以不同数据、设备或构建模式对比参考网页的速度。

2026-10-27 的 0.1.87 **实际解压便携包**已通过两份 RHVideo E2E 的 22 项用例，零跳过（`test-artifacts/rhvideo-0.1.87-portable-acceptance.log`）；另外 431 项前端测试和 17 项相关 Rust 测试通过。便携 ZIP SHA-256：`d88d19849fa201f96b0656627660d9c17ff73a0181614508fa58188246e4d054`，实际 `current/RHFiles.exe` SHA-256：`6f9025fa328cd93bc25d19e000e9833570f979422bc115e25be9909849941efb`。测试检查真实显示帧及实际音量，不代表已完成同库流畅度对比。

另做了同输入的诊断对照：当前测试机（Arc B580，另有虚拟显示驱动）D3D11VA／Direct3D11 路径原生 open 到首帧为 4221／6229 ms，兼容回调输出为 386／291 ms。硬件日志确认实际使用 D3D11VA，并出现迟帧；网络缓冲只耗约 19／24 ms。这个结果把剩余首播问题缩小到解码／输出初始化链路，但兼容输出会限制画布尺寸，不能拿它与完整硬件画质作等价性能宣称，更不能据此默认降级所有用户。日志为 `rhvideo-native-startup-verbose.log` 和 `rhvideo-gdi-startup-comparison.log`，未修改系统显示或显卡设置。

下表的旧“已实现”描述代表代码与入口范围，不再作为 1:1 行为、流畅度或全部体验通过的证明。修复后的发行包和同库体验仍需分别验收，不能仅凭本表宣布完成。

## 2026-10-27 播放语义纠正

0.1.87 的“开始连播”仍把截图库分段连播、列表顺序连播和超压顺序连播混在同一模式中，且旧测试把末段暂停、图片边界停留当作正确结果。这些期望已撤回；接口能枚举不等于行为一致。

Windows 0.1.88 的代码将三种队列与位置记录分开；图库按当前浏览位置去重视频，列表按完整筛选顺序取 ready/processing 项；手动回绕、自动末项关闭、固定片段循环、整队列进度、截图父栈、收藏、预览关闭时一次性暂存分别测试。普通点击的视频也保留首张对应截图作为父层，不预先弹出图库或解码其全部图片。预览暂存失败不会重放，连播读取失败则仅向后跳过未播放项，不循环坏文件。

`scripts/tests/rhvideo-playback-reference.test.mjs` 从实际 `static/index.html` 解析并执行 `collectListOrderVideoIds`、`collectPlaylistVideoIds`、`buildPlaylistEntries`、`playlistNav`、`playlistProgressCommit` 等函数，以相同输入比较结果。没有私有 RHVideo 源码时明确跳过差分部分，不把本地对照冒充公共 CI；其余静态边界测试照常执行。`scripts/e2e/rhvideo-playback-behavior.test.mjs` 另验证实际原生帧、父层图片位置、服务器请求次数和暂存结果，而非仅比对接口名称。

仍需继续对照的差异包括播放器内即时切换竖屏池（目前在媒体库设置）、复杂返回栈和参考站点的全部交互细节。不同显卡的原生首帧延迟也尚未完成同质量对比。本次不发布或宣称 Android 已获得相同修正，不把本节当作完整 1:1 的证明。

最终 Windows 0.1.88 便携 ZIP 已解压实际运行，三份 RHVideo E2E 共 **30/30 通过，零跳过**（`test-artifacts/rhvideo-0.1.88-portable-acceptance.log`）；另有 433 项 Node、20 项相关 Rust 测试通过，7 类故意注入的旧业务错误均被测试捕获。源码提交 `faa3191098320106e4f0a1f51b16eeda164c243a`；ZIP SHA-256 `6b1342deba371ab5ac3510a680dc5e52274e57b37eba350226ecd5b7b01661d9`；实际 `current/RHFiles.exe` SHA-256 `f24db7271ea19a7dac28b693a97687c7a4dc940e80d4dcb056b79de202c0da9a`。该包在本机原生硬件输出下的 1080p／4K open 到首帧仍约 3.9／6.2 秒；行为修正不等于这个性能问题已经解决。

## 0.1.89 开发中：继续还原，不代表全目标完成

主线补入播放器内竖屏开关及不可变原队列，关闭筛选可以恢复全部顺序；不足两个可播放竖屏项时不改变输入、游标或设置。初次筛选保留前端提交的片段计划，运行时切换才重新建立计划；已保存的“仅竖屏＋分段播放”组合不会被强制改成全长。设置请求带队列版本，拒绝相同视频 ID 的迟到旧操作。

`mediaProgressCommit` 实际定位的是图片／截图集合，之前错误映射成视频 seek；现在以独立 `image.seek`、集合滑杆、Home/End、滚轮和触摸操作还原。点击截图本体从头播放源视频，`image.playFrame` 则独立保留时间点跳转。预览收藏允许当前完整队列里、不在当前卡片页上的媒体；截图收藏作用于源视频。

关闭父截图会停止其子视频，返回事件带独立 `parentPreview` 标识，旧事件不能作用于后来重开的同一张图。服务器切换后，复用的播放器窗口接收新的会话版本；旧状态不能回填，旧收藏不会投向新服务器。窗口焦点与内容控制器焦点分别处理。

输入验收等待实际图片解码和渲染帧，再发送真实 CDP 指针／按键／触摸事件；不使用 DOM 直接调用替代事件断言。360×800 与 800×550 的预览控件边界和截图另行检查。没有发布 0.1.89 的完整包之前，不能将开发版结果称为安装包已验收。

图片快捷键改绑不再落入旧方向键绑定；图片状态接口在关闭、普通图片及任务图片中都返回有效 JSON。缺失时长的全长队列以参考的 86400 秒保护值准备和重建，不误用三秒片段；真实解码结束仍由原生驱动处理。

仍需完成的明确事项至少包括：Android 原生队列／截图时间点／父预览生命周期与上述 Windows 语义同步，播放器原生视频表面的鼠标／滚轮操作核对，以及原生首帧性能的同质量对照。其余功能组仍需按原版实际行为逐组审计，不能用“入口都有了”或下表替代完整完成审查。

进一步核对后，顺序／超压顺序的新启动已经改回原版的取消竖屏筛选、全长、300 秒片段设置；速度／循环及图库模式的独立记忆保留。差分测试执行实际 `startPlaylist`，在它应用完恢复设置后截取状态，不只检查接口或硬编码函数名。原版运行时竖屏重启从截图库取池，本端仍保留完整来源池，避免丢掉顺序列表项目；不把这项容错处理称为逐句复刻。

开发源码 `07bcd7e12a3aefd70d2a7c303fcadedf59990a18` 已在干净隔离快照构建并完成三份 Windows RHVideo E2E，**37/37 通过，零跳过**（`test-artifacts/rhvideo-0.1.89-development-verified.log`）；另有 433 项 Node、22 项相关 Rust 测试通过。16 个产品／测试输入文件逐一核对与提交源码一致。实际测试的是 debug EXE，SHA-256 `c219d761d87769429d032f55e145c887778fd7fabbc850e756a57c46b764b7b3`，不是已发布安装包；没有停止或替换正式 RHFiles。

本次真实原生硬件输出记录中，1080p H.264／4K HEVC 的 native open 到显示帧仍约 3.15／4.73 秒，客户端动作到可查询首帧约 5.53／7.35 秒。上述通过证明这些生成流能实际解码，不证明性能已达到 RHVideo 同质量水平。切换会话只失效旧身份，不另起一条重复的周期轮询链；普通图片、任务放大面板与暂存图片的状态分别验收。

### 继续核对原生输入与 CI 时序

原生画布补入滚轮、媒体按键、双击的宿主路由，调用可枚举的 `player.input`／`grid.input`；同一媒体重开也换 `inputId`，旧事件不重放到新输入。多视频补入分组滑杆、首尾定位及展开时 Esc 先恢复。这里没有添加全局输入钩子或透明截图覆盖层。VLC 3 的 [Win32 事件实现](https://github.com/videolan/vlc/blob/3.0.x/modules/video_output/win32/events.c) 在禁用内建键鼠后将渲染子窗设为 disabled，按 [Windows 子窗口规则](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features#messages) 交回宿主处理；宿主原先只处理绘制，因此 WebView 中的输入通过不代表画布已接通。

源码提交 `07bcd7e` 的 Windows CI `40507580002` 实际失败于切换竖屏后立即改片段，解码时长暂为 0，被误报跳转越界；macOS 同提交通过。新增由服务器闸门确定性阻塞媒体头的用例，在与 CI 相同的 GDI 兼容模式复现，再验收实例绑定的单次延迟 seek、15 秒预算和终态错误，不增加网络重试。

Computer Use 的真实窗口捕获连续两次失败，错误为 `Direct3D11CaptureFramePool.CreateFreeThreaded / 0x887A0005`。新构建的隔离实例另通过不截图的辅助功能树读到了宿主画布及 disabled 的 VLC Direct3D11 子窗，但真实画布点击仍报 `coordinate input geometry is unavailable`，未获有效输入结果。因此不能宣称物理鼠标／键盘已通过；可验证的是输入解码单元测试、公开 API 的实例边界、WebView 控件输入和实际原生帧。专用 `scripts/testing/rhvideo-input-probe.mjs` 只创建隔离配置、生成媒体和本机夹具，供后续物理输入验收，不读取正式媒体库。两次 probe 的独立实例均已关闭，正式实例未停止或替换。

继续审计中还确认了多视频的待补范围：原版 `startGridPlay` 从图库的截图顺序去重取池，而本端仍从视频清单／多选取池；原版每格默认均未静音，当前本端只给首格声音。同一次网格浏览内，原版 `gridCaptureVisibleVideoStates` 会保留各视频进度／音量／速度／暂停状态；关闭再重开时 `restoreGridPlayGroup` 恢复分组，但 `gridPlayControlStates` 重置为默认，不应误做成永久保存每格状态。当前原生翻组重建播放器，上述记忆语义尚未等价实现，快速关闭／重开后的异步销毁实例边界也须补测。分组导航、实际解码通过不证明这些语义已完成。它们与 Android 对齐、原生画面物理输入和同质量首帧性能一起保留在后续验收范围内。

本轮源码 `ff0ddd2d9dbb20435ba682594b425eee69a3a510` 的相同 debug EXE，在 GDI 兼容模式及 `native-hardware-auto` 输出模式下，三份 RHVideo E2E **各 39/39 通过、零跳过**（`test-artifacts/rhvideo-input-complete-compat.log`、`test-artifacts/rhvideo-input-complete-native.log`）。另有 433 项 Node、26 项相关 Rust 测试通过；10 个变更的运行时／测试输入文件与提交源码逐一核对一致。EXE SHA-256 为 `e9d2b898652cfc09a7604d09e0e5434a550666ab37e09a7141e7280362e18170`。这不是发行包验收；没有发布 0.1.89，也未将本轮结果视为全目标完成。新提交 macOS CI `40513435959` 已通过，Windows `40513435993` 尚在运行，不能把本地通过写成云端已通过。

### 多视频取池、布局与状态范围恢复

源码 `1a93d18` 将 Windows 同屏播放改回图库顺序去重取池，不受列表多选或截图浏览游标影响；默认按原版的比例评分分成 2–4 项并布局，各格均默认有声音。翻组保留逐项时间、暂停、静音、音量与速度；关闭重开只恢复有序 ID 完全匹配的组，逐项控制重置。正常结束在同一 VLC 输入内循环，坏流不自动重试；收藏、暂存标记、独立关闭、迟到输入及窗口销毁另有边界保护。旧实现固定数量的 1–9 项手动模式仍可选择，但不作为默认。

新增差分测试执行实际 `startGridPlay`、`buildGroups`、`scoreGroup`、`calcGridLayout`、`gridVideoState` 和 `gridBindVideoControls`，覆盖 512 组数量/顺序/比例组合、默认声音及暂停位置限制。当前 436 项 Node、29 项相关 Rust 测试通过。完整 GDI 回归 41/41 通过；随后针对迟到标记加固的最终 debug EXE 又通过 GDI 4 项定向回归和默认原生输出完整 41/41，均零跳过。最终 EXE SHA-256 为 `5a7013f27fbfe0f15173f54c7d552eec399062888357bdef9378996e62272aa2`；行为用例逐窗核对实际运行脚本与源码哈希。

原生输出结果以 `rhvideo-grid-hardware-unset.log` 的 `renderer: native-hardware-auto` 为准；兼容标志设为 `0` 的中间轮仍实际使用 GDI，不计入原生输出结果。以上日志在隔离 QA 的 `test-artifacts` 中。当前原生 1080p／4K open 到首帧约 2.92／5.07 秒，动作到首帧约 5.29／7.50 秒，性能问题依然存在。没有发布 0.1.89 安装包，没有替换正式实例，也没有将这些结果当作 Android、物理窗口输入或全目标验收完成。

源码 `1a93d18` 的 macOS CI `40523027274`、Windows CI `40523027166` 都已通过；这不能代替后续加严画面断言或新改动的验收。

随后将“暂停后恢复”加严为必须有实际显示帧，在上述构建的 GDI 与默认原生输出中都复现了黑屏：暂停、位置、已解码帧正确，但 `renderedFrames` 始终为 0。另发现同输入循环后的显示时钟仍会停在上次结尾。因此前面的 41 项通过不能证明暂停画面或循环进度正确；这两条增加实际帧／显示位置断言后必须重新验收。

修复使用有界的原生暂停画面恢复阶段，静音、隐藏中间帧，初始化画面后再定位和暂停；15 秒后终止，不进行网络重试。显式 seek／resume 接管原有目标，状态接口暴露恢复进度及目标；快速翻组保存用户的暂停意图。循环使用独立的回绕时钟，暂停位置不再被解码预读时间覆盖。新增测试实际暂停控制窗口的虚拟时钟，仅在等待结束后读取一次原生结果，检查恢复不是靠 UI 轮询偶然完成。

这轮还定位到一个真实的原生输出停顿原因：内部预备阶段设成 0.25 倍速时，VLC 的 1 秒网络缓存会形成 4 秒时钟延迟，实际日志出现 `Timestamp conversion failed (delay 4000000, buffering 400000, bound 3000000)`。最终准备阶段保持正常速度，完成后才恢复用户速度；尝试改变窗口透明度没有修好这一问题，未作为解决方案保留。

2026-10-28 最终开发构建 SHA-256 为 `5bdb19f0149ab59a8f5cbf3bd9c1af925ad973881cfa7a7105a3cd7db2c9eda3`。436 项 Node、32 项相关 Rust 测试通过；完整兼容输出回归 41/41 通过，默认原生输出的输入绑定、默认网格／后台暂停画面、同输入循环三项定向回归 3/3 通过，均零跳过。默认输出测试确认为 `native-hardware-auto`，没有设置兼容标志；三格均暂停、控制界面计时器暂停且不轮询后，原生结果分别有 8／21／6 个实际显示帧，仍保持暂停。该用例还核对较新的 seek／resume 能接管旧恢复目标。日志为隔离 QA `test-artifacts/rhvideo-grid-accepted-compat.log`、`rhvideo-grid-accepted-native.log`、`rhvideo-grid-normal-clock-rust.log` 及主工作区 `rhvideo-grid-model-full.log`。

上述最后一轮不是默认输出完整 41 项重跑，也不是物理鼠标或 Android 验收。正式实例未替换，0.1.89 尚未发包；首帧性能、Android 对齐及其余参考行为仍须继续核验，不能据此宣称完整 1:1。

## 功能清单

### 2026-10-28 Android 同屏播放继续对齐（开发中）

原生层先前忽略共享前端的分组／比例计划，固定数量均匀布局，只给第一项声音，并在翻组时丢弃暂停、进度和音量。现接收和验证相同的布局计划，以真实原生子视图实现跨列布局；默认自动分组，各项均有声音，逐项控制仅在同次浏览中保存。分组定位、调节面板和静音都有公开 API；调节可收起，横屏不必长期被滑杆占满。

网格持有独立于单视频准备区的快照和会话标识，防止打开其他媒体后翻组失效；本地只保存有序组 ID，重新打开不恢复旧静音／暂停。恢复与当前账户、会话及计划匹配，读取失败使用零次重放的加载策略。新增 JVM 用例覆盖布局／边界校验、独立队列和精确组恢复；新增专用 `rhvideo-android.mjs ... grid` 需要用压缩发行 APK 在自有模拟器检查原生帧、真实子窗位置、逐项状态、展开返回、旋转、循环和重开。结果未记录前仍是待验收，不代表已发布 APK。Android 网格收藏／暂存、单视频和图片返回语义、Windows 旋转偏好及首帧性能仍是未完成范围。

本轮最终结果：436 项 Node、316 项 Android JVM 测试通过；Windows 兼容输出完整回归 41/41、零跳过（`rhvideo-grid-shared-windows-accepted.log`），debug EXE SHA-256 为 `570ee2b71d8c7d463211587347be2767404ccb7adddcac879548da4c3471e626`。首轮中有一次第二隔离实例启动超时，尚未进入媒体请求，不是已证实的 EOF 故障；定向回归及之后完整 41 项均通过，不能据此宣称所有环境启动问题已经解决。上一批源码 `a0c704f` 的 Windows CI `40540471049`、macOS CI `40540470911` 也已通过；不是本轮新源码的 CI 结果。

Android 压缩发行构建仅装到自有 `emulator-5584`，安装前后均核对 APK 字节哈希。主 APK SHA-256 为 `7de9d6ea792b3e517a3d930977ec9f6418d8410840faa019b5dce2d4a29184e4`，测试 APK 为 `de61bf2fdd2ef2e2928062b1e2ba0d19819d392d4209b65214271ddc83c5a2c3`。`rhvideo-grid-android-final-accepted.log` 通过：六项图库池而非 52 项清单、自动三项分组及实际跨列子窗、各格默认声音、全部格真实推进、暂停定位／音量／静音／速度翻组恢复、独立准备队列、旋转、展开返回、正常 EOF 同一输入循环、精确组重开及重开控制重置。另接入独立 HTTP 503 夹具，验证两项终态错误、可见原因以及之后不持续重试。正常／错误截图均检查了原生界面；10 个产品／测试输入与主工作区哈希一致。

中间测试把旋转后尚未出首帧的输入直接当成 EOF 循环失败；增加状态诊断后发现它仍在准备 19.5 秒定位，并未到结尾。最终用例先等待旋转和真实暂停定位就绪，再独立检查循环；还要求播放中的每格实际推进、原生输出计数超过一帧，不用“发出播放指令”当作已经播放。恢复时长限制仅在首次就绪应用，不在正常状态变化时反复定位。首屏／媒体库接口就绪本轮记录约 3.0／8.0 秒，只是模拟器功能验收，不是同质量性能对照，也不是快启动保证。

该 APK 仍使用开发基线的版本标签，未当作新正式版本发布，没有覆盖真机或正式 Windows 实例。以上不替代 Android 其他播放／返回功能、网格收藏／暂存、真实手机、物理 Windows 输入和整体性能验收。

继续审计的明确缺口还包括 Android `playbackWindow` 的片段起止仍按本地规则重建，没有完整消费共享前端传入的显式片段计划；网格位置／会话校验也不能代替同一组重开后的输入版本校验。这些不属于本轮已通过的同屏范围，不能因接口存在而标为完成。

“部分”不等于完成；必须补齐该行全部子功能并通过验收，才能标为完整。

| 功能组 | RHVideo 的对齐范围 | 当前 RHFiles |
|---|---|---|
| 账户 | 注册、登录、退出、登录失效、令牌刷新、权限错误 | 已实现原生会话与刷新；密码/令牌不进入网页或偏好文件 |
| 视频清单 | 搜索、双向排序、筛选、跨页播放顺序、多选、信息、导出 | 已实现八种双向排序、多选快照、跨分类选择、信息与导出；按 UTF-8 限制 32 MiB，Android 分片顺序/重放边界已验收 |
| 搜索 | 中文、拼音、首字母、混合输入；大库异步索引与账户隔离 | 已复用参考项目的搜索/标签语义与拼音词典；Worker 索引、串行构建与过时查询丢弃 |
| 标签 | AND/OR、排除、嵌套分组、保存规则；各媒体分类一致 | 已实现，可命名保存/恢复/移除 |
| 截图库 | 全库关键帧、数量设置、混入图片、分页、随机、命名顺序保存/恢复、继续浏览、清理多余帧 | 已实现，兼容实际服务端紧凑元数据格式 |
| 单视频 | 进度跳转、音量/静音、速度、循环、旋转、全屏、源版本/超压版本 | 两端均为原生引擎；有结构化控制与实际帧状态 |
| 连播 | 全列表跨页顺序、分段时长/全长、竖屏筛选、循环、预加载、断点记忆、超压连播 | 已实现；Windows 仅预加载一个真实解码后暂停的原生下一项，5 秒超时，无重试；切换/关闭会失效旧预加载 |
| 多视频 | 网格同屏、单格展开、独立播放/进度/音量/速度、统一控制 | 部分：两端开发代码已还原图库取池、按比例分组/布局、每格默认有声、同次逐项状态及重开组恢复，并接入收藏/暂存标记。Android 34 已通过单格实际旋转像素及自动三格完整原生场景；解码器分配／回执间歇超时未确定根因，长时／低资源、旧 Android 实际像素、物理设备/窗口、完整输入边界与正式发行包不能由本轮替代 |
| 图片 | 上/下一张、缩放、图片间切换、连续浏览、随机/还原 | 已实现完整筛选快照队列，不再限当前卡片页 |
| 连续条带 | 横向/竖向、单/双列、超长图分段、自动滚动、速度、迷你地图、虚拟化 | 已实现；可见区最多 80 个图片节点，二分定位，缩略地图不额外下载原图 |
| 自动放映 | 图片/截图/收藏、Ken Burns、停留时长、重叠及比例/上下限、暂停续播、平滑手动切换 | 已实现；两端验收收藏中的同区域原生视频，不跳到另一播放器或嵌套网页 |
| 小说阅读 | 目录搜索、章节跳转、字号、行距、日间/护眼/夜间、章节/滚动进度 | 已实现；串行进度写入且账户切换后不再写旧任务 |
| 小说速览 | 章节摘要分页、列表/连续试读、章节跳转、上一/下一本 | 已实现，每次只读取 40 章摘要，不全量读取正文 |
| 收藏 | 三类独立 ID、分类/搜索/标签、跨页连续浏览、混合放映 | 类型隔离、搜索/规则/跨页已实现；混合放映见上行 |
| 自动监控 | 添加/移除/启停监控目录、立即扫描、扫描结果、队列反馈 | 已实现服务器面板及同名 API |
| 默认处理队列 | 运行/排队/失败/历史、筛选/搜索/明细、步骤进度 | 已实现；失败不附加自动重放按钮 |
| 原片替换 | 参数、预估、备份/节省空间、逐项和批量提交、停止剩余、历史/明细 | 已实现；写操作必须显式提交，危险操作使用两步确认 |
| 暂存与删除 | 分步确认、预览/标记删除、30 天暂存、恢复、过期清理 | 已实现单项/跨分类批量暂存、预览标记、逐项结果与一次性确认；两端缓存即时失效，旧读取不能复活已删除项目 |
| 清理缺失源 | 预览、核对数量、分步确认清理；不误删源文件 | 已实现实际接口，客户端不直接删除服务器路径 |
| 存储 | 全库占用、监控目录占用/刷新、原片替换节省、扫描状态和异常 | 已实现三类独立查询、重新扫描、运行状态刷新与异常展示；仅可见面板读取，连续三次失败后停止 |
| 服务设置 | 状态、权限、立即/等待队列后重启、取消重启计划 | 已实现，尊重服务器 supported/can_manage/can_cancel；真实服务重启不在自动测试中执行 |
| 原位置操作 | 调用服务器的打开源文件/源文件夹功能，明确操作发生在哪台设备 | 已实现，按钮明确标为“在服务器打开” |
| 本地偏好 | 顺序、浏览/播放设置、恢复与重置、快捷键、不同账户隔离 | 已实现账户分区、本地媒体快捷键、重置、命名规则/顺序 |
| 自动化 | 每个可操作 UI 对应结构化接口及业务测试 | 已接入可枚举控件／参数、原生命令和固定服务器操作清单；Windows 播放器自身关闭回执已验收，Android 销毁自身页面时的回执仍待查。契约枚举不能代替每条业务路径的真实验收 |

## 性能验收

### 对照源码的控件审计

`scripts/testing/rhvideo-control-map.json` 逐项记录当前参考源码的 181 个业务事件处理入口，分成 27 组，关联 RHFiles 可枚举的动作；另有 3 个非业务语法/转义辅助项明确排除。`scripts/testing/rhvideo-reference-audit.mjs D:/git/RHVideo` 检查实际提交号、8 个参考模块的 SHA-256、新增/遗留控件和 API 注册。当前 `a8caab2` 没有未映射入口或只存在于文档的 API 名称。

该清单用于防止漏功能，不等于每个硬件/网络场景都通过。真实两端回归仍须调用公开动作并检查文件、服务器请求或实际原生帧。此次审计补出了跳页、摘录搜索、阅读器目录/收藏、任务图片放大、统一音量、截图逐张查看/清单定位及批量停止后续提交；不能拿此前的“已实现”表格代替这些检查。

本轮新增入口已在 Windows 隔离实例和 Android 压缩发行 APK 的专用模拟器中调用公开接口验收：包括真实图片解码、83 章速览翻页搜索、收藏与目录、实际带音轨视频的主音量乘法、网格/混合放映及返回栈。421 项 Node 测试、310 项 Android JVM 测试通过。Windows 完整回归中的 11 项通过，余下一项原生媒体回归修正无音轨夹具后独立重跑通过；Android 发行 APK 整条联调通过并核对安装文件哈希。它们不代替下文的跨硬件性能验收，也不代表尚未发布的新版本已经可下载。

后续最终包验收：Windows 0.1.86 从生成的便携 ZIP 提取实际 `current/RHFiles.exe`，13 项整包回归全部通过，包含真实 RHVideo FastAPI/SQLite、原生连播预加载、主音量、四路播放、1080p H.264／4K HEVC 实际帧及五万项图片可达性。Android 0.1.37（1037）发行 APK 的媒体库与原生 Media3、手机组服务端两条联调均通过；另有 425 项 Node、312 项 Android JVM、226 项界面流程断言通过。APK 安装字节哈希与签名已核对，未操作真机。

不能把“使用原生播放器”当作性能已经达标。

- 使用同一服务器、同一批媒体、相同网络和解码设置，对比 RHVideo 与两个 RHFiles 客户端；冷启动、热缓存分开记录。
- 大库至少覆盖 1 万与 5 万条元数据；记录首次打开、翻页、搜索 P50/P95、内存峰值、实际传输字节。不能只测几十条夹具。
- 长图片库检查 DOM/已解码图片数量、内存和滚动帧耗时，不能把全部原图预加载进内存。
- 视频覆盖 1080p/4K、H.264/HEVC、跳转、连播、多个同时播放；记录首帧、CPU/GPU、内存、掉帧和实测吞吐。普通 Windows 桌面已改为 libVLC 原生硬件自动解码/输出，不再经过 GDI 像素拷贝或 1080p 输出限制；RDP/显式兼容模式保留有界 GDI 输出。选择原生模式不等于性能验收已完成。
- 移动端覆盖真实手机，折叠/旋转、前后台、慢网、断线、失效授权，以及媒体队列的有界取消和资源释放。

本轮已实现的性能改进：

1. Windows 和 Android 视频摘要使用 ETag 条件校验；304 复用现有清单，正常分页使用 30 秒内存缓存。
2. Windows 以共享只读引用复用整库 JSON，避免每次翻页/输入都深拷贝整库；Android 直接单次遍历截取一页，避免构建两份全量中间列表。
3. 收藏只更新对应按钮，不销毁和重新解码全部缩略图。

4. 5 万条元数据已覆盖冷索引、真实拼音构建、热查询及内存记录；这只是 Node 元数据基准，不是两端整机性能对比。
5. Windows 已测真实 libVLC 流媒体、四路实际显示帧及独立/统一控制；Android 已测压缩发行 APK 的真实 Media3 帧，不用假时钟或 HTML 视频通过验收。
6. Android 大播放队列保留完整元数据，但只把附近最多 21 项交给 Media3，避免十万项 Binder/播放器对象。

两端功能回归已覆盖混合放映、网格分组、全部服务器管理页面的真实 UI/API 对应关系、暂存/恢复、返回栈及导出桥接边界。Windows 还通过实际 RHVideo FastAPI/隔离 SQLite 核对写操作，不只依赖模拟接口。

性能目标仍需独立复核：`scripts/testing/rhvideo-compare.mjs` 在同一 WebView2 引擎、同一五万条数据上运行 RHVideo 原始界面与 RHFiles，核对搜索命中一致，并记录冷加载/拼音及热搜索 P50/P95。输出必须标注开发或发行构建；不能把未优化 Rust 构建的开销代表发行包。真实手机、HDR、不同网络/设备的全面比较不在目前结果之内，不能将功能回归通过说成所有场景性能达标。

### 2026-10-27 发行构建记录

Windows 0.1.85 与 RHVideo `a8caab2` 的真实列表界面，在同一 WebView2、1280×800 视口、相同本机 HTTP 夹具和五万条生成元数据下运行。全部查询命中数一致。

| 指标 | RHVideo | RHFiles |
|---|---:|---:|
| 清单冷加载（单次） | 1269 ms | 444 ms |
| 热搜索 API P50 | 17.7 ms | 9.7 ms |
| 热搜索 API P95 | 39.4 ms | 62.4 ms |

热查询为两组中英/拼音条件交替，检验重复筛选与翻页缓存；不代表所有新关键词。RHFiles 另解码了 28 张封面，参考列表没有解码封面。测试运行于共享桌面，包含双动画帧等待的延迟存在约一秒的窗口调度波动，不能据此承诺帧率或“任何场景都更快”。P95 仍有较高尾延迟，应保留原始报告继续观察。报告由脚本写入 `test-artifacts/rhvideo-reference-comparison.json`，不是生产媒体的吞吐/内存或真实手机对比。

性能实现另包括：清单直达 Worker、可撤销资源、独立元数据并发预算、最多 72 个卡片/16 MiB 脱离文档的已解码图像估算、有界媒体解析缓存，以及命中筛选顺序缓存后不再重复扫描搜索索引。写操作、失效授权和账号切换均有对应失效边界。

0.1.86 复测为两个真实窗口统一设置焦点仿真，避免仅主窗口设置造成不对称。相同五万项夹具下，清单冷加载为参考 1058 ms／RHFiles 394 ms，热查询 API P50 为 11.4／9.2 ms，P95 为 28／83.5 ms。RHFiles 的卡片还解码封面，参考清单不显示封面；UI 双帧等待仍有明显桌面调度尾延迟。这是混合结果，不能宣称全部性能指标都优于参考项目，也不能把生成 SVG 夹具当作真实手机或媒体库的性能保证。

## 2026-10-28 Android 连播计划与原生控制器

两条新增红测实际复现了原生层重新抽取片段起点、以及后来准备另一条队列使活动播放失效。现在固定前端提交的起止计划和独立会话快照；整文件时间轴不再裁剪为片段相对时间。原生时间消息驱动片段推进，循环当前片段，手动导航在完整队列回绕，自动末项关闭。21 项仅为解码窗口。

分段／顺序／超压顺序分别记忆设置、签名和游标；竖屏投影保留完整池，不足两项时不改变原计划。倍速、循环、片段、全长和仅竖屏通过公开接口与原生菜单共用实现。Media3 内建控制器的前后按钮、进度及倍速也接入该适配器，避免只有工作台接口正确、原生控件另走一套逻辑。截图“播放此刻”的显式秒数优先使用，不再被队列默认位置吞掉。

Windows 的默认原生输出回归先出现 40/41；失败发生在暂停冷恢复的单次观测：测试未设置可选的预期渲染器时，误用兼容输出的 2.5 秒预算，而实际硬件输出冷启动需更久。等待预算改从实际 `renderer` 选择后，该原生输出定向回归通过；三格在 WebView 计时器暂停、不轮询的区间后都有显示帧且维持暂停。它不是硬件首帧延迟已经修复的证据，不能用兼容输出更快来冒充同画质性能。

本轮仍不代表完整 1:1 完成：Android 父截图返回栈、收藏／预览暂存及网格输入版本仍需对齐；无效新队列目标须在替换活动会话前原子校验；Windows 智能旋转及同质量首帧性能、物理窗口输入和其他功能组仍需继续核验。未发布新的 Windows 或 Android 正式包，也没有替换运行中的正式实例。

最终验证为 436 项 Node、324 项 Android JVM、Windows 完整兼容输出 41/41，以及默认硬件输出的上述定向用例 1/1，均零跳过。最终压缩 APK 另在自有模拟器实际解码通过：触摸原生前后按钮跨 21 项窗口回绕，从真实设置菜单选择 1.25 倍速后重开仍记忆，拒绝旧输入控制，关闭再开保留竖屏设置且仍能恢复完整池，非零截图时间点生效。片段循环在 WebView 全部计时器暂停且不读取状态的 8 秒内完成，再检查实际播放状态；此前 4 秒观测仍处于冷定位缓冲，不能把它称为已恢复画面，也不能将延长功能验证预算当作性能优化。

最终 APK SHA-256 为 `48db8dea2f651cc1e46b9dfce20c923e902754c1e5720c8173f6911d23286a07`，测试 APK 为 `ea1626cd1e69a413d76829a485a8335b3f607fed80faed218ef3f675e2c05002`，Windows debug EXE 为 `c737dd3fdb2cf21eb009ef5643929215b33b05b8d62676c27cadd086634bcaa6`。日志在隔离 QA 的 `test-artifacts/rhvideo-playlist-ui-accepted.log`、`rhvideo-playlist-windows-accepted-compat.log`、`rhvideo-playlist-windows-native-grid.log`。中间测试包直接调用被 R8 优化掉的 Media3 接口曾报 `NoSuchMethodError`；最终改为操作真实菜单，并非给正式包保留测试专用 SDK 接口。实际安装包与本地字节哈希一致，未触碰真机或正式 RHFiles。

## 2026-10-28 继续纠正业务流程，不重设计原版功能

重写界面不授权改变播放对象、取池顺序、返回层级或默认动作。验收以参考源码的实际流程为准，不能只依据后端契约或控件枚举。前一节源码 `ec92602` 的 Windows／macOS CI 均已通过；本节后续更改仍须独立验证。

又发现普通点击默认开启自动续播，而原版 `playVideoLocal` 从头播放。现在自动续播默认关闭，仍保留用户显式设置和独立播放记录／继续播放入口，不删除已有偏好。截图切换此前提前写入新索引、却保留旧内容，快速点击可能播放或标记旧目标；现在将已显示索引与目标一起提交，单独公开 `loading`／`requestedIndex`，连续按键累加待定位位置，过时结果不回填。读取期间拒绝播放、收藏、标记和定位，关闭／换账号／换图后也不会执行迟到的播放准备。

Windows 最终 debug EXE SHA-256 为 `0651681619cc37ab90d95ee2c9f375219d353a968a4a8a7a3f7a64935fd7dc11`。兼容输出完整回归 **43/43**；默认硬件输出的截图返回、普通点击从头播放、延迟截图目标及实际截图时间点四项定向回归 **4/4**，均零跳过。日志分别为隔离 QA 的 `rhvideo-preview-window-ready-final.log`、`rhvideo-preview-verified-renderer-native.log`；定向用例逐窗断言实际 `renderer`，不是只检查环境变量。默认输出不是完整 43 项重跑，也不能用这四个行为用例声称首帧性能已达到原版。

Android 原生层本轮补入父截图返回、上下项弹回父截图集合、收藏／暂存标记按钮及公开动作、一次性预览暂存结果和账户边界。标记不是文件列表多选；返回父层暂不执行，整层关闭才消费。关闭先释放视频流，再提交暂存；失败不重新入队，也不因其他预览关闭而自动重放。无效新播放目标和秒数先校验，不替换正在使用的原生会话。自动放映的独立播放器不再覆盖单视频队列。原生自动化 Back 先交给焦点菜单／对话框，不能直接关闭底下的视频。

Android 联调中实际发现了收藏请求 EOF 和图片偶发读取失败，未将中间构建记为通过。非重放写操作使用独立的零空闲连接池并禁用连接失败重试；安全 GET 与媒体读取保留连接恢复能力。新增单元用例区分两种策略，并验证服务器收到写入但响应丢失后不会重复提交。请求方法／路径的测试证据在失败时也会保存，不保存令牌或密码。

后续联调又抓到原生菜单命令没有进入公开接口的枚举，以及接口使用全屏画面作为弹出菜单锚点、没有走实际 More 按钮的问题；现以显示控制条后的同一按钮布局／点击路径处理，并丢弃旧输入的迟到弹出操作。一次并行构建期间还出现系统 AAC 解码器分配超时，日志有系统线程长时间停顿，不将它冒充播放通过。Windows 截图用例也曾在原生返回事件尚未完成图片解析时立即再次播放，被新目标保护拒绝；用例改为等待父图就绪、并检查真实显示帧，不移除保护或把接口返回当成画面已经可用。

最终有 **441 项 Node、335 项 Android JVM** 通过，均零跳过。Android 压缩 APK 的父预览及连播两条原生联调均通过，日志为隔离 QA 的 `rhvideo-preview-anchor-accepted-native.log`、`rhvideo-preview-playlist-settled.log`。前者实际触摸原生收藏／标记／关闭按钮、验证父截图、持久失败结果、菜单可见及菜单 Back 不关闭视频，并按服务端请求次数检查不重放；后者另外核对手动切换保存 5 秒断点、真实暂停定位帧、跨解码窗口回绕和原生控制器菜单。循环在八秒无 WebView 计时器／无状态读取后检查实际回绕，再独立要求同输入恢复播放并有新的输出帧；中间构建在该时刻仍缓冲的事实保留，分开验证不代表冷定位速度已经优化。历史读取的中间失败来自测试漏读公开返回的 `items` 层，没有为迎合断言改变业务接口。

两条联调实际安装的主 APK 字节一致，SHA-256 为 `338780aa07033aad5e4efcd67e44ddb2441a041d9c6c20c035f033d6a40c8e8c`；父预览测试 APK 为 `9743313fdb3245878dc6ef73c56bb612eec7f1e24029b8759ba1e75d5b2facac`，最终连播测试 APK 为 `8b2bcc81c3d8eaeb402575b28dde2171ede736bee94e101ba265b2f720f795a7`。实测截图已查看，手机父图工具条仍过密，菜单长错误会截断；不能把行为用例通过当成这些界面已达到易用性验收。

本节仍不是全目标验收：Android 网格收藏／暂存及同组重开输入版本、图片内容探测及上述工具条，Windows 智能旋转／物理画布输入、同质量首帧性能，以及其余功能组均须继续核对。也须进一步核对单视频控制状态记忆、仅一项父集合的箭头返回及同一父图多次启动的迟到事件边界。没有发布 0.1.89 或新 Android 正式包，没有操作真机，也没有替换正式 Windows 实例。

## 2026-10-28 单视频状态与返回关系的后续纠偏

界面重写只能改变呈现，不得把普通点击、图库播放、顺序连播、返回父层合并成另一种播放流程。对照基线仍为 RHVideo `a8caab27009a0458ff6be12ddd39a88341eeb0fa`，不是 RHFiles 自己的接口定义；控件映射和测试数量不能替代业务相同、实际可用的验收。

此次直接执行原版 `toggleMediaLoop`、`cycleMediaSpeed`、`renderMediaItem`、`navMedia` 和 `popMediaViewer`，确认普通视频的循环与速度是查看器级临时状态：切换文件、关闭后重开仍沿用；与分段／顺序／超压顺序各自的设置独立。此前 RHFiles 的新文件默认值覆盖了这两个状态，新增红测复现后，两端已改为仅给未显式指定的单视频选项补上当前状态。Android 原生速度菜单与循环菜单也经过同一设置路径，非参考连播、没有父截图的视频不能漏掉适配。RHFiles 仍以本身的账户会话为隔离边界，重新登录会清空临时控制状态；原版的页面级变量不在其 `logout()` 中复位，不能把账户隔离测试冒充这一点也完全相同。

原版父截图集合即使只有一项，视频箭头也会返回父层，而不是禁用箭头。两端现支持该行为。每次从同一父图启动视频另有独立的 `parentPlayback`，返回只消费一次；旧视频的迟到返回不能关闭新视频或再次导航。准备中的尝试另用 `playAttempt`，不提前覆盖仍在播放的返回关系：新增红测确实复现了连续两次准备失败后留下错误子身份，修复后保留原活动子身份。图片切换／关闭／换账户仍拒绝迟到播放。

Windows 原生状态与队列身份现从同一播放事务中读取，避免同时切换输入时混合两者。控件接口可显式传入 `expectedInput`，普通控制条回调也带当前输入；这不是完整的拖动开始时身份捕获，不能据此宣称所有跨输入手势已验收。

后续又用实际控制应答复现了倍速已改变、但同一次返回的 `queue.options.rate` 仍为旧值。现在更新队列后再取应答快照，新增界面联调断言同时检查实际倍速与队列设置，而非依赖下一次轮询掩盖不一致。

上一提交 `6e74443` 的 macOS CI 成功；Windows CI 的前端阶段失败在测试对多行源码的 LF 固定匹配。运行菜单逻辑没有因此失败，测试现对 LF／CRLF 都执行相同契约检查，保留而非跳过断言。Android 新联调中先后发现单项夹具仍沿用 52 项计数断言、以及 AppCompat 弹出菜单行未声明可点击祖先导致测试没有点击；分别修正夹具计数与真实触摸方式，失败日志和当时菜单截图保留，不能把中间构建记为通过。

最终源码已有 444 项 Node、18 项 RHVideo Rust、336 项 Android JVM 测试通过，均零跳过。Windows 完整兼容回归曾为 46/46；加入连续准备失败修复后的整轮为 **45/46**，唯一失败是暂停恢复后关闭并重开网格，新的控件页无法进入可用状态，主窗口诊断读取也超时。最后的倍速应答修复重编译后，单视频状态、单项父层、重复启动及网格四项定向回归为 4/4；**重跑通过不等于这次间歇超时已修复**。测试还使用合成时钟的 `advance`，按 [Chromium 官方协议定义](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Emulation.pdl)，它不是恢复实时时钟，须继续排除测试调度副作用并核对真实关闭／重开。新增阶段诊断没有放宽原断言。最终此时 debug EXE SHA-256 为 `f7af0c04073872461b21fbe93868c486a8396b2caf17c173dbc8c0c75438ba79`。

Android 压缩发行 APK 的新单视频原生联调已通过：实际触摸循环行和 Media3 倍速菜单、一个父截图的箭头返回、同图重复播放的旧返回拒绝、无父层新文件的状态继承、独立连播及登录边界。触摸前现在要求原生控制器完成显现；此前一次箭头没有触发预期返回的失败仍保留，不能只因后续通过就据此断言所有触摸时序问题已经定位。主 APK SHA-256 为 `d0f462f05ecf36e1c8eade8707faf07aef285d6abae72026c7b1207eaaab3512`，实际测试 APK 为 `6d62a33cd5173b82760e1008fa37465fc891afdbd6914a61a47f2ae056cef488`。日志为隔离 QA 的 `rhvideo-single-stable-touch-native.log`，安装字节已核对。同一 APK／测试 APK 的父预览整条回归随后也通过，包含实际收藏／标记／关闭、终态失败不重放、菜单 Back 和账户边界，日志为 `rhvideo-single-preview-regression-native.log`。

最终同一 Windows EXE 另以实际 `native-hardware-auto` 输出通过上述四项定向回归，逐窗核对真实渲染器，日志为 `rhvideo-single-final-focused-hardware.log`。硬件整条网格用例耗时约 75 秒，不能将功能通过说成首帧或冷恢复速度已经达标。`9b7ae72` 已推送 GitHub／Gitee；GitHub 的 Windows 前端阶段现已成功，证明 CRLF 修复也经过真实 CI 检出。Windows／macOS 整体 CI 此时仍运行，不能宣称整体已绿。

此节并非完整 1:1 验收，也未发新包。智能旋转、Windows 同质量首帧性能和物理画布输入、Android 网格及预览工具条等前述缺口不因本节修复而消失。播放器自身关闭时的自动化应答、跨不同播放入口的迟到准备，以及拖动开始后切换输入的保护也仍须核验，不能用本节同一截图内的准备隔离代替。未替换正式 Windows 实例，未操作真机。
