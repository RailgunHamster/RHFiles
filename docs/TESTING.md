# 文件管理器业务测试 / File-manager business testing

重点是文件管理器的用户行为及数据安全，不是单纯增加函数调用次数。测试分三层：实际生产 JavaScript 的业务规则、Rust 真实临时文件系统、真实 RHFiles/WebView2 流程。模拟调用测试不等于真实磁盘或 Windows Shell 集成测试。

## 同类产品的场景来源

2026-10-02 查阅以下项目的实际测试及官方行为说明。借鉴的是场景与不变量，测试代码针对 RHFiles 重新编写，没有复制上游实现。不同产品的操作约定并不完全相同，例如 RHFiles 的永久删除要求两次确认。

| 参考 | 上游场景 | RHFiles 对应检查 |
| --- | --- | --- |
| [KDE KIO JobTest](https://github.com/KDE/kio/blob/18617991223072189c409466ac7169c3633f4b9c/autotests/jobtest.cpp) | `copyFileDestAlreadyExists`、`copyDirectoryToExistingDirectory`、`moveDirectoryIntoItself`、`moveFileNoPermissions`、复制元数据及操作取消 | 文件/目录四种冲突组合；复制/移动不静默覆盖；目录不能进入自身；Windows 独占文件锁；时间戳、只读属性；中途失败与取消 |
| [Dolphin 选择管理器测试](https://github.com/KDE/dolphin/blob/4ae02cf8afa3a2c0ec79f74ddb7398fc93e04d23/src/tests/kitemlistselectionmanagertest.cpp) | `testItemsInserted`、`testItemsRemoved`、`testAnchoredSelectionAfterMovingItems` | 排序、插入、删除及刷新后，按文件路径保持选择和焦点，不沿用旧行号 |
| [Dolphin 键盘搜索测试](https://github.com/KDE/dolphin/blob/4ae02cf8afa3a2c0ec79f74ddb7398fc93e04d23/src/tests/kitemlistkeyboardsearchmanagertest.cpp) | 持续键入、重复导航、反向搜索 | 中间匹配、前后循环、首尾回绕、双窗格隔离；增加 RHFiles 的拼音、首字母、全角及迟到拼音响应 |
| [Files 文件夹交互测试](https://github.com/files-community/Files/blob/0e3c17ca44d143fb656be27eacf2b25c22a62043/tests/Files.InteractionTests/Tests/FolderTests.cs) | 导航 → 新建 → 重命名 → 复制粘贴 → 删除 | 真实实例中导航和选中、创建/重命名、复制移动及多选永久删除；分别断言实际磁盘结果 |
| [Files 压缩包交互测试](https://github.com/files-community/Files/blob/0e3c17ca44d143fb656be27eacf2b25c22a62043/tests/Files.InteractionTests/Tests/ArchiveTests.cs) | ZIP/7z 压缩解压往返 | Unicode、空目录、成员字节、重复名称、输出冲突及失败清理；真实 IPC 压缩/浏览/解压 |
| [Double Commander 复制移动说明](https://doublecmd.github.io/doc/en/copymove.html)、[拖放说明](https://doublecmd.github.io/doc/en/help.html) | 同名选择、批量选择、目标窗格/标签页 | 覆盖/保留两者/跳过/取消、应用到全部、每项进度；真实 WebView2 跨标签拖放、悬停切页与目标选择 |
| [Windows 文件命名规则](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) | 保留设备名称、非法字符、大小写、Unicode | 拒绝路径穿越、控制字符、尾随点/空格、保留名称；允许只改大小写及中文名 |

## 已自动化的业务矩阵

2026-10-15 新增：`scripts/markdown-pdf-regression.mjs` 使用独立配置的真实 Windows 实例，覆盖中文多页内置打印、同名输出保护、外部命令提供器、工作目录/Unicode 参数、失败退出和无效 PDF 不发布。`src-tauri/src/documents.rs` 另有安全渲染、配置校验和单次占位符替换测试。默认排版用 Poppler 渲染检查，不把 PDF 文件存在视为排版正确。

`scripts/android-gesture-media-regression.mjs` 只接受专用模拟器，验证松手前抽屉中间位置、取消手势、2,000 文件上下滑动稳定性、回收行长按不误选、真实 H.264/AAC 首帧、图片控件、无效视频错误。先准备 `/sdcard/RHFiles-Scroll-QA` 中 2,000 个文件、`/sdcard/Download/sample-h264-aac.mp4` 和 `rhfiles-sample.png`。它不是手机测试，也不代表所有设备/编码都通过。测试会重启该模拟器中的 RHFiles（不清空数据），避免误连到旧后台 WebView。`android/web/tests/flow-check.mjs` 的 IPC 模拟断言与此分开计数。

| 业务 | 测试位置 | 核心断言 |
| --- | --- | --- |
| 地址栏和路径 | `scripts/tests/file-browser.test.mjs` | file URI、本地/UNC、空格/中文/emoji/#/%/+、只解码一次、规范化幂等 |
| 排序、网格、选择 | 同上 | 五字段 × 两方向，文件夹优先，选中/焦点不漂移；自然数字排序；网格左右和上下移动边界 |
| Shift 连续多选 | `scripts/tests/keyboard-range.test.mjs`；`scripts/e2e/keyboard-range.test.mjs` | 扩展/反向收缩/越过锚点、无初始选择、边界、Ctrl＋Shift保留离散选择；外部选中/排序/路径变更重置锚点；真实按键覆盖左右窗格的详情/卡片/缩略图 |
| 多选快捷键 | `scripts/tests/multi-selection-shortcuts.test.mjs`；`scripts/e2e/multi-selection-shortcuts.test.mjs` | 左右窗格 × 详情/卡片/缩略图/Columns；Ctrl/Shift 点击、Ctrl+A、Ctrl+C/X、Ctrl+Shift+C、Delete 数量和两次确认后的真实 Shift+Delete；排序保留选区、框选松手前未提交的动画帧、迟到拼音结果不得覆盖手动多选；Columns 子目录复制/剪切/反选/箭头和后台刷新不丢选区，祖先被移走则关闭失效列 |
| 标签页 | 同上；`scripts/e2e/file-lifecycle.test.mjs` | 拖动排序无丢失、固定分界不越界、关闭保护；实际文件拖到另一个标签后复制成功 |
| 目录刷新 | `scripts/tests/navigation-search.test.mjs` | 乱序成功/失败不能覆盖新结果；离开目录作废旧请求；插入/删除后的选择；滚动保持；后台标签不能改变当前目录树 |
| 键入搜索 | 同上；`src-tauri/src/search.rs` | 子串、拼音/首字母/多音字、全角、中文高亮；循环、无匹配、异步过期；递归搜索范围、结果上限、通配符/正则错误 |
| 复制/移动冲突 | `scripts/tests/file-operations.test.mjs` | 四种冲突选择 × 复制/移动、同目录行为、批量应用、目标名称分配、覆盖不进入撤销、部分失败和取消 |
| 撤销/重做 | 同上 | 复制/移动/重命名/批量重命名/删除；失败可重试、刷新失败不重复操作、串行执行、后续操作使重做失效、随机历史与独立模型对照 |
| 删除 | `scripts/tests/deletion.test.mjs` | 多选完整传递、取消、两次永久删除确认、禁用普通确认不绕过永久确认、部分成功和取消、压缩包只读、UNC/FTP 不承诺回收站撤销 |
| 磁盘文件操作 | `src-tauri/src/file_ops_business_tests.rs` | 0/1 字节及 1 MiB 边界、完整内容、空目录/Unicode、元数据、文件锁、八种复制移动冲突、同路径/目录自身、重命名不覆盖及非法名称 |
| 异常中断恢复 | 同上 | 11 个复制/移动持久化边界：临时写入、写完、备份前后、提交后、源删除后；恢复时验证新旧文件字节，重复恢复不破坏数据 |
| 压缩包 | `src-tauri/src/archive_business_tests.rs`；`archive_inspection.rs`；`scripts/e2e/archive-volumes.test.mjs`、`archive-conflicts.test.mjs` | 成员及目录保留、输出不可覆盖/位于自身内部、缺少源/重复成员失败清理；分卷、密码；实际输出冲突与无关文件区分；替换/跳过/保留两者/取消、成员解压、加密头、输入分卷与目录类型保护 |
| 收藏持久化 | `src-tauri/src/db_business_tests.rs` | 失败事务恢复旧列表；顺序/Unicode/清空/重启；不同配置数据库不串数据 |
| 窗口恢复 | `src-tauri/src/window.rs`；端到端流程 | 全新配置首次保存可再次读取；保留排序、兼容旧 NULL 排序值 |
| 有界预览 | `scripts/tests/file-browser.test.mjs`；原 `system.rs` 测试 | 超长单行、多行、CRLF 有界输出；原有二进制内容探测用例继续执行 |

所有新 Rust 磁盘用例在 `rhfiles-business-*` 临时目录执行；成功清理，失败保留定位材料。中断恢复测试重建持久化边界，**不等于**已经模拟真实断电、磁盘掉线或硬件写缓存故障。

### 2026-10-29 多选快捷键回归

先在真实窗口复现 Columns 的 Ctrl 多选退化为单选，以及迟到拼音结果覆盖新选区；另用受控动画帧验证框选松手丢失末帧。真实窗口还捕获到后台根目录刷新关闭子 Columns 的调用栈，修复后增加主动刷新及祖先目录移走的用例。

- 新旧业务单测共 747 项通过，零跳过（`multi-selection-pinned-node-verified.log`）。RHVideo 参考使用固定提交 `869d63244300222750751c1175aab4ce855302dd` 的独立副本；直接使用当时正在修改的 RHVideo 工作目录时，746/747 通过，唯一失败是参考文件指纹变化，未改动或忽略该断言。
- 真实文件管理、键盘范围和多选快捷键共 34 项通过，零跳过（`multi-selection-business-verified.log`）；旧界面回归另有 234 项通过，零跳过（`multi-selection-legacy-gui.log`）。复制路径只替换剪贴板写入边界，实际键盘/选区/删除确认逻辑不替换；永久删除在本次实例生成的临时文件上核对磁盘结果。
- 使用独立配置的 Windows 调试程序，SHA-256 `875883c728279f3af924f177942334f04e75aaa2c3f10d675a6678d8df2f20d1`；这些结果不是正式发布包或现有安装已更新的证明。日志位于本地 `test-artifacts/`。

### 2026-10-30 主线合入复核

- 将多选修复独立合入主线，不带入仍在开发的 RHVideo 功能；合入前后的 51 个已有未提交文件逐一核对 SHA-256，内容未变。
- 相关业务测试 99 项通过，零跳过（`multi-selection-main-business-unit.log`），包括新增的 250 组随机 Ctrl/Shift 点击与选区 Set 替换序列，逐步核对完整路径和焦点。
- 相同前端修复在独立 Windows 调试实例中通过 22 项实际窗口测试，零跳过（开发工作树的 `multi-selection-current-e2e.log`）；五个相关生产脚本与主线逐一比较无差异。覆盖两侧窗格、四种布局、快速框选、迟到拼音响应和两次确认后的真实多文件永久删除。复制路径只截获剪贴板写入边界，不修改用户剪贴板。
- 本次未更新正在运行的安装，也未发布安装包；测试不代表正式发布包已通过验收。

### 2026-10-30 连续 Ctrl 导致多选快捷键失效

- 在上述修复之后仍复现：Ctrl+点击多选，马上松开并再次按 Ctrl 进行复制路径或删除，
  被 `initDoubleCtrlSearch` 误认成双击 Ctrl，在第二次按下时把焦点移到 `filter-input`。
  原程序左右窗格均仍有两个选中文件，但复制路径未分发、Delete 没有确认框；
  证据为 `selection-modifier-red.log`、`rhfiles-e2e-JJii53/*-copy.json`。
- 现在只在第二次完整、未用于鼠标或组合键的左 Ctrl 轻按释放时打开搜索；
  长按、重复事件、鼠标按下、其他键和窗口失焦都会取消识别，右 Ctrl 留给原有菜单操作。
  新增 11 项手势测试，旧实现 9 项失败、修复后全部通过。
- 重新编译的隔离测试 EXE SHA-256 为
  `5d4c4e99729ae119c4141e75a8d1c478aaaea389ec6d8b349e3f77f0529b16c8`，
  40 项 WebView2 窗口交互测试通过、零失败／跳过（`selection-modifier-visible-e2e.log`）。
  新序列覆盖左右窗格四种布局；已有套件同时核验快速框选、分栏子目录、迟到拼音、
  Ctrl+C/X 和两次确认后的真实多文件永久删除。复制路径仅截获剪贴板边界。
- 首轮扩展用例在右侧窄窗格因卡片未滚入可见区而出现两个鼠标命中超时；
  补齐测试脚本的 `scrollIntoView` 后重新跑完整的 40 项，没有修改产品断言。
- 相关业务测试 126 项通过；使用 `RHVIDEO_SOURCE=D:\git\RHVideo` 的常规 `npm test`
  与串行全套均为 543 项通过、零跳过（`selection-modifier-npm-final.log`、
  `selection-modifier-node-serial.log`）。编译期间的首轮并行检查曾在既有 RHVideo
  准备等待测试超时；该项单独和上述最终两轮均通过，本轮未修改该测试或媒体逻辑。
- 测试没有替换本机正在运行的 0.1.88，也未发布安装包。

## 运行

多选快捷键的回归不能只在 `Input.dispatchKeyEvent` 上设置 Ctrl 修饰位：也必须发送
`ControlLeft` 的按下、Ctrl+鼠标点击、抬起、第二次按下和快捷键字符的完整事件序列。
否则测不到“双击 Ctrl 搜索”在第二次按下时抢走焦点的问题。新增
`scripts/e2e/selection-modifier-focus.test.mjs` 覆盖左右窗格、四种布局下的这个序列，
核对完整路径、列表焦点和多文件删除确认；取消确认后检查文件和选区仍然完整。
`scripts/tests/double-ctrl-search.test.mjs` 另验证纯双击 Ctrl、长按、自动重复、窗口失焦、
右 Ctrl、其他修饰键和鼠标中断。右 Ctrl 的单击菜单不与左 Ctrl 双击搜索混用。

需要 Windows、Rust、Node.js 22+。仓库含 7-Zip 引擎；WebView2 端到端测试需要已安装 WebView2 Runtime。

```powershell
npm ci --ignore-scripts
npm test
cargo test --workspace --locked
npm run test:mutations

cargo build -p rhfiles-tauri --locked
Copy-Item -LiteralPath src-tauri/thirdparty/7z.exe, src-tauri/thirdparty/7z.dll -Destination target/debug
npm run test:e2e
# 可选：旧的综合 UI 套件也使用独立实例，默认不接受任何 SKIP
npm run test:gui
```

`npm test` 读取实际产品 JS 声明，不维护一份测试专用业务实现。随机属性测试默认每项 250 次，失败输出 seed 和缩减后的 path，可精确重放：

```powershell
$env:FC_SEED = '失败输出中的 seed'
$env:FC_PATH = '失败输出中的 path'
node --test --test-name-pattern '失败用例名' scripts/tests/file-browser.test.mjs
Remove-Item Env:FC_SEED, Env:FC_PATH
# 扩大随机输入：
$env:FC_RUNS = '2000'
npm test
Remove-Item Env:FC_RUNS
```

变异检查只修改临时源码副本，故意破坏七处业务保障。先要求正常版本全通过，再要求每个变异产生断言失败；语法错误或引用错误不算有效检出。它是测试有效性的抽样验证，不是全量变异覆盖率。[fast-check 重放与配置说明](https://fast-check.dev/docs/configuration/)

端到端测试固定使用 `target/debug/rhfiles.exe`，分配随机端口及独立 profile，核验应用返回的数据目录确实位于本次临时根内后才执行操作。它不连接、关闭或覆盖用户正在使用的 RHFiles，不使用真实用户文件。测试只终止自己启动的进程树。使用 WebView2 输入协议的拖放验证了应用内实际拖拽处理，但不能替代 Explorer/OLE、跨进程或 RDP 的物理交互验证。

端到端每个步骤保存结果到 `test-artifacts/rhfiles-e2e-*/business-results.json`，失败附截图、应用日志及页面事件。临时 profile/样本保留在输出的 `%TEMP%/rhfiles-e2e-*` 路径便于检查；确认不再需要后可以按该次确切路径删除。不要按进程名关闭所有 RHFiles，也不要删除用户 profile。

## 跳过、CI 与尚未覆盖的环境

`.github/workflows/test.yml` 在 main push、PR、手动执行时运行前端、变异、Rust 和实际 WebView2 流程；发布工作流也会检查前端业务测试。CI 没有得到实际成功结果之前，不能把“已配置”说成“远端已通过”。

旧 GUI harness 现在把 `SKIP` 单独计数，不再伪装成 `PASS`。旧 harness 的机器相关场景不作为新独立 fixture 测试的替代。7-Zip 用例缺少引擎会失败而不是直接 return；Bandizip 用例显式 `ignored`，可以在已安装的机器单独执行：

```powershell
cargo test -p rhfiles-tauri bandizip -- --ignored
```

仍需专门环境验证的项目，不能因本地单元测试通过就声称完成：

- 真实 SMB 断线/重连、账号鉴权、服务器 ACL、映射网络盘和异机权限；现有 UNC 测试验证的是路径和业务决策。
- 跨物理卷移动、磁盘满、突然结束进程/断电、可移动盘移除。恢复状态矩阵和独占文件锁只是其中一部分。
- OneDrive 在线占位符、同步冲突、云端回收站。
- RDP 虚拟文件剪贴板、Explorer ↔ RHFiles OLE 拖放、跨应用/窗口拖放；本轮真实拖放是 RHFiles 同窗口跨标签。
- NTFS 硬链接/junction/符号链接、超长路径、大小写敏感目录、保留名称的扩展路径访问。
- 实际 Windows 虚拟桌面切换和不同 Windows 用户登录；数据库隔离测试不等于真实账号/桌面切换已经验收。
- 大型图片/视频/3D 模型解码压力、无障碍、不同 DPI/语言组合、磁盘占用取消等完整验收。

后续扩展优先补这些环境下可复现的业务夹具；每个缺陷先写出会失败的场景，再修复并保留回归用例。

## RHVideo 疑似重复的真实文件验收

`rhvideo-duplicates.test.mjs` 验证实际 Windows 控件与受控响应；`rhvideo-duplicates-real.test.mjs` 另外启动同级 RHVideo 的真实 FastAPI／SQLite，在全新测试目录生成 28 张重复图片、两段同源视频和一部无关小说。必须检查实际扫描、原生播放、25 + 2 逐项结果分页、30 天暂存、保留源不变，以及恢复后所有原始字节一致。测试不连接现有 RHVideo 服务／数据库；缺少实际源码或 ffmpeg 时直接失败，不跳过。

```powershell
$env:RHVIDEO_SOURCE = 'D:/git/RHVideo'
node --test --test-concurrency=1 scripts/e2e/rhvideo-duplicates.test.mjs scripts/e2e/rhvideo-duplicates-real.test.mjs
```

Android 在已压缩的 release APK 上使用同一真实服务验收，入口为 `node scripts/testing/rhvideo-android.mjs emulator-5584 <APK绝对路径> <探针APK绝对路径> duplicates`。执行前严格验证设备为 `RHFilesRhVideoQA20261027` 模拟器、每个打包 ABI 都有 RHFiles 原生库、包内共享资源与当前源码一致，以及安装后的 APK 字节；不会因为 ABI 不全而自动跳过安装前检查。QA 构建的 `-PabiList` 应与实际已完成的 Rust 架构一致；复用旧原生库的增量 QA 包不作为完整重编译的正式发布包。界面操作使用真实触摸，视频必须产生原生帧；扫描、暂存、恢复均由真实后端执行，最终校验全部恢复源文件的 SHA-256 和恰好一次提交。

测试结果同时保留失败轮次。扫描结束、列表投影到达、图片解码和实际播放分别判断；不得因为“任务 completed”就假定界面和文件已经正确，也不得将本节通过扩大成全部 RHVideo 功能、无网络／硬件边界或性能等价的证明。

## RHVideo 任务置顶与实际队列领取

`rhvideo-task-priority.test.mjs` 通过独立实际窗口验证列表／详情按钮、切换队列、替换失败记录、缩略图占位／重复读取抑制、旧面板回执隔离和无写请求重放；`rhvideo-task-priority-real.test.mjs` 使用实际 FastAPI／SQLite 和两个真实队列的领取实现。所有输入仅为本轮生成的测试记录，带单独 marker 的 fixture 才允许运行 `rhvideo-real-task-check.py`；不读取用户数据库，不启动视频编码、不修改实际媒体。

```powershell
$env:RHVIDEO_SOURCE = 'D:/git/RHVideo'
node --test --test-concurrency=1 scripts/e2e/rhvideo-task-priority.test.mjs scripts/e2e/rhvideo-task-priority-real.test.mjs
```

Android release 验收使用同一个受限模拟器入口，将模式改为 `task-priority`。除了真实触摸和公开 API，它还检查服务器恰好接受四次置顶，未发生 retry／resume／pause／cancel 请求；随后独立核对实际默认／替换 worker 的领取顺序、暂停和运行中记录、失败记录及源文件哈希。任务只调整元数据：该 fixture 中停止自动 worker 是保持样本稳定的测试条件，不得把此轮当成编码任务不停顿、低内存或后台生命周期的完整验收。

## RHVideo Android 播放生命周期验收

`node scripts/testing/rhvideo-android.mjs emulator-5584 <APK绝对路径> <探针APK绝对路径> lifecycle` 同样只接受自有 QA 模拟器及逐字节核对的压缩 release 包。入口为实际 H.264／AAC 源另加入真实 `mov_text` 字幕，保留原视频、音频，不用空轨道开关冒充字幕恢复。

单播放器和三格同屏分别验证实际 HOME → onStop → 返回同一 Activity，以及框架 `Activity.recreate()`。必须保留真实暂停画面、位置、倍速、循环、逐格音量和字幕关闭状态；保留同一 viewer lease，但释放后解码输入必须换代，旧输入控制被拒绝。格子之间和重新打开的独立 viewer 不得继承其他格子／旧窗口的选择。这是**暂停生命周期**验收，不代替 `single`／`grid` 的持续播放：播放就绪同时要求时间大于 250 ms、实际渲染帧数大于一，不能只看 READY 或 isPlaying。

原生按钮测试先等待弹窗真正退出并恢复焦点，必要时通过一次真实画面触摸唤出控制栏，然后核对透明度、裁剪、屏幕坐标、稳定中心和窗口归属再注入按钮触摸。不依赖后台 WebView 的显示控制栏回执、不延长自动隐藏时间、不以 `performClick()` 代替实际触摸；公开控制接口的其他行为测试保留。模式成功回执和截图必须匹配本次场景，旧的仅单播放器生命周期成功不能通过扩展后的同屏验收。错误模式在访问 SDK 或安装任何包前失败，失败日志保留。

Android 同屏 `grid.state`／`native.grid.state` 的每格 `diagnostics` 仅在 debug 或已显式开启 ADB 自动化时采集。它属于本次解码器 incarnation（`epoch`），不复用共享 BandwidthMeter 的其他播放器计数；保留实际读取字节／范围起点、解码器初始化时间与回调到达时间、音视频 DecoderCounters、音频会话 ID 和 underrun 数。缺失阶段是 null，不伪造零；无事件队列、媒体 URI、请求头或异常正文。`droppedTotal` 按 [Media3 的真实定义](https://github.com/androidx/media/blob/1.11.1/libraries/exoplayer/src/main/java/androidx/media3/exoplayer/DecoderCounters.java)包含 droppedInput，不能误称为仅输出端丢帧。

同屏就绪阶段写入探针 stream，失败则保留原断言状态和线程栈。在既有失败诊断期间，宿主收到明确 PID 标记后最多启动一次异步只读 `dumpsys media.audio_flinger`，10 秒／4 MiB 上限，退出前等待该读取结束；不会阻塞 Node 夹具继续供流、扩大逐帧等待或重启音频服务。快照及其 captured／failed receipt 单独保存；必须核对相同 PID／audioSessionId，不能把进程已退出后的空输出当成失败当时的音频状态。同屏收藏与暂存现也通过可见、裁剪、透明度、焦点及稳定中心校验后的真实触摸验证，不再用 `native.ui.invoke` 冒充手指操作。

### 同屏起播水位对照与真实旋转

默认构建的 `RHVIDEO_QA_AUDIO_START_MS` 为 0，仍用原版 DefaultRenderersFactory／平台默认音频输出。仅 `-PrhfilesRhVideoProbe -PrhfilesRhVideoAudioStartMs=20` 才能构建实验包（范围 1–100 ms，需 Android 12+／PCM）；使用 [Media3 公开 AudioTrack](https://github.com/androidx/media/blob/1.11.1/libraries/exoplayer/src/main/java/androidx/media3/exoplayer/audio/AudioTrackAudioOutput.java) 与 [Android 起播阈值 API](https://developer.android.com/reference/android/media/AudioTrack#setStartThresholdInFrames(int))，不通过私有字段、减小 PCM 容量、删音轨、伪造时钟或重试来通过测试。宿主还需显式 `RHFILES_QA_AUDIO_START_MS=20`；每个 checkpoint 的实际配置、每路实际水位／容量都须匹配，实验结果不能通过默认 gate。`qa-parameters.json` 标识实验，`fixture-media.json` 记录生成视频的精确字节哈希，便于对照而非假设每次编码相同。

旋转验收不能用固定 sleep 后旧方向的 READY 状态放行。仍在原有 30 秒预算内，要求对应横／竖画布真实尺寸及所有原生帧就绪，再发下一次旋转；检查配置请求被系统接受。普通尺寸变更应原地调整网格及调节面板高度，不销毁解码器／重取前一个关键帧；核对同一 inputId 并保留横竖屏原生截图。独立的 HOME／onStop 与强制 Activity.recreate 验收仍须保留，不能因普通旋转避免重建就漏测真实释放／恢复。

## RHVideo 完整 Windows 原生验收入口

不要把漏设环境标志后跳过的原生用例计入完整验收。`rhvideo-windows.mjs` 强制启用实际原生用例，串行运行全部 `rhvideo*.test.mjs`，核对随包 3.0.24 的文件清单、哈希和预建插件索引，并要求最终 TAP 全部通过且没有跳过、取消或待办。40 分钟及 8 MiB 日志上限只限制自有测试进程树，不重启测试来抹掉失败。

先将已核验的 EXE 和 `vlc/` 复制到本工作树新建、无链接的 `test-artifacts/` 快照目录，保持源文件和二进制冻结；不能指向正式安装、共享 `target` 或 junction。运行示例：

```powershell
$env:RHVIDEO_SOURCE = 'D:/git/RHVideo'
$env:RHFILES_TEST_EXECUTABLE = '本工作树/test-artifacts/本轮独立快照/rhfiles.exe'
node scripts/testing/rhvideo-windows.mjs
```

入口拒绝混用兼容输出、缓存／解码线程对照和私有诊断选项；普通硬件输出必须通过实际状态断言。每轮保留 `suite.tap`、`receipt.json` 和各用例自己的截图／请求／临时样本；记录 EXE 和参考模块的 SHA-256，结束时再核对，不能用运行中被替换的输入声明成功。尚未通过完整一轮的代码不能因入口存在或单元测试通过而标记为完整验收。
