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

| 业务 | 测试位置 | 核心断言 |
| --- | --- | --- |
| 地址栏和路径 | `scripts/tests/file-browser.test.mjs` | file URI、本地/UNC、空格/中文/emoji/#/%/+、只解码一次、规范化幂等 |
| 排序、网格、选择 | 同上 | 五字段 × 两方向，文件夹优先，选中/焦点不漂移；自然数字排序；网格左右和上下移动边界 |
| 标签页 | 同上；`scripts/e2e/file-lifecycle.test.mjs` | 拖动排序无丢失、固定分界不越界、关闭保护；实际文件拖到另一个标签后复制成功 |
| 目录刷新 | `scripts/tests/navigation-search.test.mjs` | 乱序成功/失败不能覆盖新结果；离开目录作废旧请求；插入/删除后的选择；滚动保持；后台标签不能改变当前目录树 |
| 键入搜索 | 同上；`src-tauri/src/search.rs` | 子串、拼音/首字母/多音字、全角、中文高亮；循环、无匹配、异步过期；递归搜索范围、结果上限、通配符/正则错误 |
| 复制/移动冲突 | `scripts/tests/file-operations.test.mjs` | 四种冲突选择 × 复制/移动、同目录行为、批量应用、目标名称分配、覆盖不进入撤销、部分失败和取消 |
| 撤销/重做 | 同上 | 复制/移动/重命名/批量重命名/删除；失败可重试、刷新失败不重复操作、串行执行、后续操作使重做失效、随机历史与独立模型对照 |
| 删除 | `scripts/tests/deletion.test.mjs` | 多选完整传递、取消、两次永久删除确认、禁用普通确认不绕过永久确认、部分成功和取消、压缩包只读、UNC/FTP 不承诺回收站撤销 |
| 磁盘文件操作 | `src-tauri/src/file_ops_business_tests.rs` | 0/1 字节及 1 MiB 边界、完整内容、空目录/Unicode、元数据、文件锁、八种复制移动冲突、同路径/目录自身、重命名不覆盖及非法名称 |
| 异常中断恢复 | 同上 | 11 个复制/移动持久化边界：临时写入、写完、备份前后、提交后、源删除后；恢复时验证新旧文件字节，重复恢复不破坏数据 |
| 压缩包 | `src-tauri/src/archive_business_tests.rs`；原 `archive.rs` 测试 | 成员及目录保留、输出不可覆盖/位于自身内部、缺少源/重复成员失败清理；7-Zip、分卷、密码、保留原文件 |
| 收藏持久化 | `src-tauri/src/db_business_tests.rs` | 失败事务恢复旧列表；顺序/Unicode/清空/重启；不同配置数据库不串数据 |
| 窗口恢复 | `src-tauri/src/window.rs`；端到端流程 | 全新配置首次保存可再次读取；保留排序、兼容旧 NULL 排序值 |
| 有界预览 | `scripts/tests/file-browser.test.mjs`；原 `system.rs` 测试 | 超长单行、多行、CRLF 有界输出；原有二进制内容探测用例继续执行 |

所有新 Rust 磁盘用例在 `rhfiles-business-*` 临时目录执行；成功清理，失败保留定位材料。中断恢复测试重建持久化边界，**不等于**已经模拟真实断电、磁盘掉线或硬件写缓存故障。

## 运行

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
