# Nearby Transfer v1

Windows：选择文件/文件夹，点工具栏双设备箭头按钮。Android：首页“附近互传”；发送时在文件列表长按多选 → 更多 → 发送到附近设备。

两端主动开启后可发现设备；发现失败时输入接收端显示的 `IP:端口`。发送前比较接收端的完整十二位接收码（证书 SHA-256 前 48 位），不是仅比较名称。名称没有身份认证，局域网其他设备可以伪造。

每批必须由接收端选择本机文件夹并确认。接收成功时创建独立的 `RHFiles-Received-时间-随机ID` 子文件夹；不覆盖已有内容，不删除来源，不解压或执行收到的文件。Windows 如出现防火墙提示，仅允许可信的专用网络；应用不会改防火墙规则。

## 实现与边界

- 共享 Rust 库 `crates/rhfiles-transfer`；两个客户端使用同一套业务、安全规则与 IPC。参考 [LocalSend 的流程](https://github.com/localsend/protocol)，但当前采用 RHFiles 自有协议，**不宣称兼容 LocalSend**。
- 仅显式开启后创建 TCP/UDP 监听。UDP `224.0.0.168:54435`、TTL 1 公布协议版本、设备名、证书指纹和 TCP 端口，不公布文件列表；默认 TCP 54435，被占用则分配空闲端口。单机多个桌面实例仍使用各自的数据/身份。
- TCP 仅接受本地/私有/链路本地来源；手动地址也限定这些范围。无公网服务器、云中转、HTTP 代理或明文降级。路由/AP 隔离、防火墙和 VPN 可能阻止发现；保留手动地址。
- rustls + ring TLS；设备自签身份保存在当前用户/实例私有 `nearby-v1/identity.json`。初次手动发现只读公共设备信息，后续请求固定完整 SHA-256 证书，仍验证 TLS 握手签名。接收码用于首次人工核对，不是短 PIN 认证，也不信任 UDP 中的名字。
- 发送端先提交元数据，接收端确认后才允许上传；每批使用 256 位随机令牌，不进入 WebView、日志或发现消息。未确认/伪造令牌不能写文件。等待两分钟过期；最多四个并行连接/任务。
- 消息有 4 MB 上限，清单最多 10,000 条目、64 层、1 TB。拒绝路径穿越、绝对路径、反斜杠、ADS、Windows 保留名、文件/目录冲突、大小写重名和符号链接。来源只读，64 KiB 有界流，逐文件 SHA-256；保留空目录和零字节文件，不承诺保留时间戳/ACL。
- 接收到本次新建的 `.rhfiles-receive-ID.part` 目录；校验完才以 Windows `MoveFileW` / Linux-Android `renameat2(NOREPLACE)` 发布为独立批次，拒绝覆盖。错误/取消只清理本次暂存目录。异常进程退出不自动重传，私有接收日志会在下次开启时列出未完成路径供用户检查，不遍历删除未知目录。
- Android 独立 `dataSync` 前台服务/通知持有 Wi-Fi MulticastLock 和有期限的 WakeLock；关闭、通知“停止”、系统超时都会通过保留的 JNI 入口停止 Rust 监听，不依赖 WebView 定时器续命；不自动重启任务。
- 当前支持 Windows / Android **本机普通文件**；不直接发送 SMB、SAF、网盘、符号链接，不做移动/删除和断点续传。macOS 的安全接收尚未实现，不能当作已支持的平台。

## 验证

```powershell
cargo test -p rhfiles-transfer -- --test-threads=1
node android/web/tests/nearby-check.mjs
# Build Windows debug and emulator x86_64 debug APK; install only on emulator:
node scripts/nearby-cross-platform-regression.mjs
```

核心测试使用两个真实 TLS 节点，不把 mock 当实际网络。UI 流程测试模拟 IPC，覆盖启用/发送/接收确认、取消、错误、路径固定和触摸目标稳定。跨平台脚本另外验证 Windows ↔ Android 模拟器的原生 IPC 和实际文件字节；模拟器 NAT 使用手动地址，不替代物理 Wi-Fi 多播、折叠屏或用户手机验收。
