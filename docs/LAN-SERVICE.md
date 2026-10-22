# RHFiles LAN file service / 局域网文件服务（首版）

本功能使用直接 HTTPS 连接，不调用 Windows SMB、WebClient、盘符映射或 SMB 凭据。电脑只共享明确添加的本机目录；原有 SMB、附近互传和 WebDAV 配置同步是独立功能，不受影响。

## 使用

1. 电脑打开「设置 → 局域网文件服务」，填写共享名称与本机文件夹完整路径；Windows 可点「改为全部本机磁盘」批量填入本机固定/可移动盘，仍需点启动才开放。不会加入网络映射盘。默认端口 `39128`，`0` 表示自动分配。自动启动默认关闭，不修改防火墙。
2. 点击「启动文件服务」。同一 Wi-Fi 的手机打开「网络位置 → 添加网络位置」，协议选「RHFiles 电脑文件服务」。
3. 电脑生成配对码，手机点「扫码连接电脑」扫描二维码并确认，最后点「保存连接」。也可点「发现局域网电脑」，核对电脑显示的 12 位身份标识后填写 10 位配对码；或复制完整 `rhfiles-connect:v1:…` 文本粘贴。配对码两分钟内有效、仅能成功使用一次，八次错误尝试后必须重新生成。
4. 默认只读。生成配对信息时可勾选写入权限；永久删除是独立权限。已配对设备在电脑端各自的卡片中修改「允许写入、重命名」「允许永久删除」，点击「保存设备权限」，无需撤销或重新配对。旧请求授权失效，下一次请求使用新权限；手机连接名称可以自定。
5. 配对后，连接出现在抽屉的存储位置和网络位置，可浏览、收藏子目录、直接看图片/播放视频，或通过现有后台文件任务复制、移动文件夹。移动来源删除仍需相应端的删除权限。
6. 暂停共享点「停止共享」。隐藏电脑窗口不停止服务；退出 RHFiles 会关闭连接。
7. 自动启动设置可分别选择「启动 RHFiles 时恢复文件服务」和「Windows 登录后在托盘自动启动」，点击保存。必须先成功启动一次以保存共享范围。两项默认关闭；后者必须同时启用前者。登录启动绑定当前账号和选定的虚拟桌面配置，升级时使用稳定的 `current` 程序路径；便携版移动后需要重新保存。停止共享只停止本次运行，不会关掉下次自动启动；禁用请取消开关并保存。启动失败原因会留在设置中，不阻塞文件管理界面。

这是 Windows **用户登录启动**，不是无需用户登录也能运行的 Windows 系统服务。使用 [HKCU Run 登录项](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys)，无需管理员权限。不同虚拟桌面的配置保持独立；若同时开启多个文件服务实例，应设置不同端口。不要在两台电脑之间复制服务私钥或设备授权文件，各自配对。

首版手机配对信息可以通过你自己的可信渠道传递；不要公开二维码、短期配对码或 WebDAV 密码。手机将每台电脑的证书 SHA-256 指纹固定为设备身份，证书变化时拒绝连接，不会关闭 TLS 校验。连接密码沿用 Android Keystore 加密存储，不放进 URL、日志或网页存储。

扫码使用 CameraX 与 ZXing-C++，只在本机解码，不上传画面、不需要 Google 服务。相机权限只在扫码时请求；拒绝或无相机的设备仍可粘贴配对。扫描普通网页二维码不会打开网页或发出网络请求。

发现采用标准 DNS-SD/mDNS `_rhfiles._tcp.local.`，电脑仅在主动启动服务时广播公开协议版本、HTTPS 端口和证书指纹，不广播配对码、账号、共享名称或本机路径；停止服务即撤销广播。手机只在用户点击后发现八秒，可中止，离开配对表单会停止。**发现的名称和指纹尚未可信，必须与电脑屏幕核对身份一致后才输入配对码**；不一致时取消并改用电脑屏幕上的二维码。网络隔离、防火墙或多播被禁用时可能发现不到，可扫码/粘贴直连。不会修改防火墙或发起公网扫描。

## WebDAV 兼容入口

- 相同 HTTPS 地址下的 `/dav/`，例如 `https://192.168.0.10:39128/dav/`。
- 在电脑创建单独的「WebDAV 专用账号」，分别选择写入/删除权限。密码只显示一次，可单独撤销。**不要使用 Windows 登录密码。**
- 第三方客户端需要信任电脑的自签名公共证书。电脑提供「复制 HTTPS 公共证书」，可保存为 `.pem` 后按客户端的信任证书流程导入。不要导出 `identity.json`，其中含私钥。
- 创建证书时包含当时的本机 IP；电脑 IP 后续变化时，第三方客户端还需正确的证书主机名/证书配置。RHFiles 原生客户端按已配对指纹验证身份。
- 支持基础 `PROPFIND`（Depth 0/1）、GET/HEAD、HTTP Range/ETag、PUT、MKCOL、COPY/MOVE、DELETE、LOCK/UNLOCK。JSON API 写入同样遵守 WebDAV 锁；锁是内存状态，服务重启后客户端需要重新获取。
- **所有协议首版都不替换已有目标。** 即使客户端发送 `Overwrite: T` 也不覆盖。PUT 不支持覆盖/追加；重命名目标必须不存在。原生删除文件夹要求为空，手机文件任务会逐项处理，不将未知的新文件一并递归删除。

这不是 Nextcloud、SFTPGo 或 Dufs 的完整功能集，也没有声称通过完整 WebDAV Litmus 兼容性认证。

## 原生 JSON / 传输接口

两种入口共用 capability-relative 文件核心、设备授权、锁和无覆盖发布逻辑，原生接口**不通过网络转发到 WebDAV**。文件下载复用经过测试的 Range/ETag 响应处理器。

所有远端路径都是 `/共享名/相对路径`，永远不是 `C:\…`。除短期 `POST /api/v1/pair` 外都需要 HTTPS Basic 或 `Bearer <device-id>:<secret>`；不接受查询参数中的凭据，不跟随重定向，不提供 CORS。

| 接口 | 行为 |
| --- | --- |
| `GET /api/v1/capabilities` | 协议版本、设备权限、功能和上限 |
| `GET /api/v1/list?path=/Files&offset=0&limit=200` | 目录快照分页（最多 2000 项/页），返回 revision；后续页传入 revision，目录变化返回 409 |
| `GET /api/v1/stat?path=…` | 文件元数据与修订标识 |
| `GET/HEAD /api/v1/content?path=…` | 原始文件、分段视频、断点下载 |
| `GET /api/v1/thumbnail?path=…` | JPEG/PNG/WebP/GIF/BMP 等图片的服务端缩略图；最多 320px，输入 32MiB、解码内存 64MiB，上限明确报错 |
| `POST /api/v1/mkdir` | JSON `{ "path": "/Files/new" }` |
| `POST /api/v1/rename` | JSON `{ "path": "/Files/old", "destination": "/Files/new" }` |
| `POST /api/v1/copy` | 同上，服务端单文件复制；目录复制由手机后台任务递归处理 |
| `POST /api/v1/delete` | JSON `{ "path": "/Files/name" }`；永久删除，文件夹必须为空 |
| `POST/OPTIONS /api/v1/uploads` | tus 1.0 creation；`Upload-Length`、`Upload-Metadata: path <base64(UTF-8虚拟路径)>` |
| `HEAD/PATCH/DELETE /api/v1/uploads/{id}` | tus 查询实际偏移、续传、取消；只有任务所属设备可访问 |

tus 请求携带 `Tus-Resumable: 1.0.0`；PATCH 为 `application/offset+octet-stream`，携带 `Upload-Offset`。Android 每块最多 1MiB，遇到传输中断先 HEAD 确认偏移，再重传尚未确认的部分。后台任务仍由 Android 文件任务服务负责通知和进度，不占用页面执行循环。

未完成上传保存在对应共享内的 `.rhfiles-service-staging`，不会被远程列出；完成后同步磁盘并以系统级 **no-replace** 操作发布。同名目标即使在最后一刻才出现也不会被覆盖。偏移与授权跨服务重启保留；上传任务保留 24 小时，启动服务或创建新上传时清理过期临时文件。单个声明上传上限 1TiB，最多 256 个保留任务。取消已完成 tus 任务只清理协议记录，不删除发布后的文件。手机后台任务的进程重启恢复仍遵循现有任务策略，不承诺所有任务跨崩溃自动续跑。

电脑本机管理操作（选择共享、启动/停止、生成配对、创建账号、修改权限、撤销授权、设置自动启动）不暴露在网络上。对应命令行自动化操作：`server.state`、`server.start`、`server.stop`、`server.pair`、`server.credential`、`server.permissions`、`server.revoke`、`server.startup`、`server.localDrives`；通过现有 [CLI](AUTOMATION.md) 调用，参数可 `describe` 枚举。不要把含临时配对信息或密码的 CLI 输出提交到仓库。

Android 对应 `connections.scan`（打开扫码页，确认后返回信息，不自动配对）、`connections.describe`（仅校验数据）、`connections.compose`（明确确认已核对身份后组装配对数据）、`connections.pair`，以及 `connections.discover.start/state/stop`。原生扫码页的按钮和滚动区域也可通过 `native.ui.*` 操作；系统相机权限仍由用户决定。正式压缩版的接受测试通过实际公开桥接接口操作，不依赖会被 R8 优化掉的私有构造函数。

## 安全边界与限制

- 仅接受 localhost、局域网或 Tailscale IPv4 (`100.64.0.0/10`) 来源；拒绝公网 IP 直接访问，不信任 `X-Forwarded-For`。自动选择时仅绑定这些本机接口及回环，不绑定 `0.0.0.0`/公网接口；不做端口映射或支持公网反向代理。没有实现公网例外授权模式。Tailscale 地址段不是设备身份；HTTPS、配对与设备认证仍必需。跨 Tailscale 通常不能 mDNS 发现，可粘贴含 Tailscale 地址的电脑配对信息。手机优先尝试自身直连子网中的端点，避免未启用 Tailscale 时先等待 VPN 或虚拟网卡地址超时。
- 可以明确共享整盘，但服务配置目录、全部本账号 RHFiles 虚拟桌面配置及其私钥始终从列表、下载和所有写入接口排除，包含它们的祖先目录也禁止重命名/移动。系统权限不绕过，整盘会暴露当前账号有权读取的其他文件，请只向可信设备授权。不接受 UNC、映射网络盘、符号链接、Windows junction/reparse point、路径穿越、设备名或 ADS。
- 请求、XML、图片解码与目录规模有限制；列表短暂缓存两秒。远程调用只获得共享内的虚拟路径，出错不返回主机绝对路径。
- Windows、Linux 和 macOS 使用各自的无覆盖重命名；跨卷 MOVE 不是原子操作，失败会保留来源。目录合并由客户端逐项处理。
- 当前视频可流式播放/拖动进度；**视频服务端缩略图、服务端索引搜索、跨设备回收站和无人登录的系统服务尚未实现**。图片 EXIF 方向处理尚需扩展服务端缩略图路径。
- LAN/磁盘速度、Wi-Fi 隔离与防火墙仍会影响连接，专用协议不会消除断网或磁盘故障。

## 选型依据（2026-10-22 核实）

实际嵌入 [Axum](https://github.com/tokio-rs/axum)（约 2.8 万星）与 [dav-server-rs](https://github.com/messense/dav-server-rs)，后者规模较小，但仍在维护、可嵌入 Rust 且采用 Apache-2.0。参考 [Dufs](https://github.com/sigoden/dufs)（约 1.1 万星）的共享/权限与流式传输实践，及 [tusd](https://github.com/tus/tusd) 的 [tus 1.0 协议](https://tus.io/protocols/resumable-upload)；没有直接捆绑 Go 服务。Nextcloud 的 [WebDAV](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/WebDAV/basic.html) 与 [独立客户端授权](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/LoginFlow/index.html) 是双接口与按设备撤销的产品参考。

发现使用 [mdns-sd](https://github.com/keepsimple1/mdns-sd) 0.21.6 与 Android [NsdManager](https://developer.android.com/develop/connectivity/wifi/use-nsd)。扫码使用 [CameraX](https://developer.android.com/jetpack/androidx/releases/camera) 1.5.3 与持续维护的 [ZXing-C++ Android](https://github.com/zxing-cpp/zxing-cpp/tree/v3.1.1/wrappers/android) 3.1.1；不是停止维护的 Java ZXing 扫码界面，也不包含云端识别或 GMS 模型下载。

## English

An opt-in desktop HTTPS service exposes the native JSON API at `/api/v1/` and a WebDAV compatibility endpoint at `/dav/`. Both use one confined local filesystem and authorization core; neither depends on SMB. Android stores per-device credentials using Android Keystore and verifies the explicitly paired SHA-256 certificate identity.

Desktop: **Settings → LAN file service**. Add local folders, start the service, generate a short-lived pairing payload. Android: **Network locations → Add → RHFiles computer file service**, scan the QR offline, discover the computer and verify its identity before entering the code, or paste the payload. Confirm and save the connection; discovery/scanning never automatically grants trust. Read-only by default; write/rename and permanent deletion are separate grants. WebDAV clients use independently revocable app credentials and must trust the exported public HTTPS certificate. Private keys never leave the host.

Includes paginated browsing, direct image/video reads, HTTP Range, bounded image thumbnails, basic WebDAV, tus uploads, offline QR pairing and mDNS discovery. Existing device grants can be edited locally without re-pairing. Whole-drive sharing is explicit; RHFiles profiles/keys/staging remain excluded and their ancestors cannot be moved. Both application-start service restore and Windows login startup are opt-in; login launch stays in the tray, restores the selected profile and reports failures in settings. This is not a pre-login system daemon. Listeners and source validation allow only localhost, LAN and Tailscale addresses, not public-IP access; network scope never replaces authentication. Existing destinations are never overwritten. Incomplete uploads expire after 24 hours. Current limitations include no service-side video thumbnails/index search, network-backed share roots or public reverse-proxy deployment. E2E covers real settings, live grants, service restore, hidden login startup and disabling it; fixtures never register real login entries.
