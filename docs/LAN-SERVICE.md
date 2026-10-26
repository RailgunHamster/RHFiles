# RHFiles LAN file service / 局域网文件服务

RHFiles 设备之间只使用[设备组](DEVICE-GROUPS.md)授权。Windows 0.1.82 / Android 0.1.33 已移除独立配对、专用密码账号及旧授权；JSON、上传和 WebDAV 都检查当前设备组成员及本机权限，删组或本机移除后不能靠旧凭据继续访问。普通 SMB、FTP、第三方 WebDAV 网络位置不受影响。

## 扫码加入

1. 电脑打开「设置 → 局域网文件服务」，添加本机共享目录并启动文件服务。默认端口 39128；0 为自动分配。不会自动修改防火墙。
2. 创建或选择已有设备组，点「邀请新设备（扫码加入）」。邀请有效两分钟，仅能用于一个成员；不要公开二维码或完整邀请文本。
3. 手机从侧栏右上角三点、侧栏设置下方“扫码”或桌面长按图标打开独立扫码页，核对来源并确认加入。手机设备名称使用本机系统名称。
4. 电脑组卡片中分别设置写入/重命名、永久删除权限，开关自动保存。权限属于此设备组，不会创建旁路授权。默认只读。
5. 手机在存储位置打开该电脑，可浏览、收藏子目录、查看图片和播放支持的媒体，以及通过后台任务复制/移动文件。移动来源仍需要相应端的删除权限。

“组公开信息”仅供已有成员交换签名证明，不是对任意新设备的批准。也可使用离线方式：手机生成本机入组请求 → 有邀请权的成员批准 → 手机核对并导入返回的批准。批准绑定手机公钥与当前请求，不能转给另一台设备使用。

独立扫码页使用 CameraX 与 ZXing-C++ 本地识别，不上传画面、不依赖 Google 服务。普通二维码只显示内容和复制按钮，不自动打开网址或执行文本。相机权限仅在扫码时申请。

## 网络与恢复

### 当前电脑客户端的边界

当前 Windows 的“连接设备”只进行设备组身份验证和连接诊断，尚未把远端目录接入 Windows 文件列表，不能当成“打开远端文件夹”。已实现的专用协议文件浏览方向是 Android 客户端访问 Windows 文件服务。Android 尚不提供同一专用协议的文件服务，因此电脑目前也不能用它浏览手机。

临时访问手机可在 Android “从电脑访问”中启动 FTP，再从 Windows RHFiles 顶部 FTP 入口填写手机显示的地址、端口和账号；这不是 RHFiles 专用协议，FTP 明文只应在可信局域网或可信加密 VPN 内使用。不需要重新创建独立配对。不要将文件服务 HTTPS 地址按 SMB 路径输入，也不要为通用 WebDAV 客户端另建绕过设备组的密码授权。

后续完整双向访问应让 Windows 网络位置直接列出组成员，远端路径与本地文件列表共用浏览/复制/移动交互，并增加 Android 同协议服务；组身份验证不能替代缺失的文件系统客户端/服务端实现。

服务不依赖 Windows SMB、WebClient、盘符映射或 SMB 凭据。监听与来源检查仅允许 localhost、局域网、Tailscale 网段，不能用公网 IP 直连；网段限制不能替代设备组签名认证。不要复制设备私钥到其他电脑。

连接按需恢复：优先已验证成功地址和签名地址，再尝试在线组成员交换、mDNS 等。每轮限时 15 秒、最多 6 次验证，不持续扫描或在无访问需求时重试。诊断显示尝试、跳过原因、冷却与成功路线。发现本身不建立信任；证书或设备公钥不符、权限拒绝立即停止，不盲目重放结果不明的写入。

服务启动时广播 DNS-SD/mDNS 的公开版本、端口、证书指纹，不广播邀请码、登录会话、共享名称或本机路径；停止服务撤销广播。当前原生地址支持私网 IPv4，不支持直接填写 MagicDNS 主机名。防火墙或多播隔离会影响发现，可用可信邀请/手动私网地址恢复。

## WebDAV 与文件接口

原生 JSON /api/v1/ 与 WebDAV /dav/ 共用相同的目录边界、设备组授权、锁、无覆盖发布逻辑。WebDAV 接受有效设备组会话的 Basic 凭据，不再提供独立 app-password 账号。通用第三方 WebDAV 客户端若不实现设备组握手，不能直接登录此服务；客户端访问其他 WebDAV 服务仍然支持普通账号。

支持目录分页、元数据、文件内容、Range/ETag、受限图片缩略图、mkdir/rename/copy/delete、tus 分块上传，以及 WebDAV 的 PROPFIND（Depth 0/1）、GET/HEAD、PUT、MKCOL、COPY/MOVE、DELETE、LOCK/UNLOCK。远端路径是 /共享名/相对路径，永远不是电脑绝对路径。目标存在时不覆盖；未知新文件不会被隐式递归删除。未完成 tus 上传暂存并按已有规则过期回收。

建立会话使用 /api/v1/groups/challenge 和 /api/v1/groups/session；扫码邀请只通过 /api/v1/groups/invitations/redeem 引入组成员，不发放永久独立凭据。旧 /api/v1/pair 返回不存在。接口不支持跨站 Origin 请求，不在查询参数放凭据，不跟随认证重定向。

## 启动与范围

隐藏窗口后文件服务继续，退出 RHFiles 则停止。「启动 RHFiles 时恢复文件服务」和「Windows 登录后在托盘自动启动」为可选项，开关自动保存，必须先成功启动一次保存共享范围。登录启动不是无人登录时运行的系统服务；不同实例使用不同端口。便携版移动后需重新设置登录启动。

共享整个本机磁盘需明确选择；RHFiles 配置、私钥和内部暂存始终排除，受保护目录的祖先不能移动。仅能访问运行用户已有权限可访问的文件。当前不提供公网反向代理部署、网络盘作为共享根、视频服务端缩略图或完整 WebDAV Litmus 认证保证。

## English

RHFiles peers use device groups exclusively. Start the computer's file service, generate a one-use two-minute invitation in its group, then scan and explicitly confirm on the phone. The standalone QR reader is available in the drawer overflow, below Settings, and via the launcher long-press shortcut. Other QR contents are copy-only; links never open automatically.

Offline request/approval exchange remains available. Public group data is for existing members, not an invitation for an unapproved phone. Independent pairings, app passwords and their stored grants are retired. JSON, tus and WebDAV requests all require a current group session and live local membership/permissions. Generic WebDAV clients without the group handshake cannot directly authenticate to this service; connections to other SMB/FTP/WebDAV servers remain unchanged.

Only explicitly shared local roots are exposed. Listeners and peer scope allow localhost, LAN and Tailscale addresses, not public IP access. Signed identity and pinned TLS remain mandatory. Recovery is lazy and bounded; diagnostics explain attempts and results, while ambiguous writes are not replayed. Startup is opt-in after user login, not a pre-login daemon. Existing destinations are never overwritten.
