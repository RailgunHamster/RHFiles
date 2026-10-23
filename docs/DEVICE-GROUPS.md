# 设备组 / Device groups

需要 Windows 0.1.77、Android 0.1.26 或更新版本。组没有中心服务器，也不复制同一份私钥。

## 第一次加入

1. 建议先在一台电脑「设置 → 局域网文件服务 → 设备组」填写设备/组名称，创建一个组；选择共享目录并启动文件服务。组名称相同不代表同一个组，请不要在每台设备各建一个同名组。
2. 新设备打开设备组（手机在「设置 → 存储与权限」），填写自己的名称，点「生成本机入组请求」。
3. 已有邀请权限的成员扫描或粘贴请求，核对来源后批准。默认不授予新成员邀请权；如需让它继续接纳成员，明确勾选允许邀请。
4. 把批准二维码/完整文本交回请求设备，核对来源并确认加入。请求与该设备的公钥、随机数绑定，别的设备不能拿批准加入；重新生成请求会使之前尚未使用的批准失效。
5. 手机加入后会增加已知成员电脑的网络位置，按「刷新组设备」可连接已知电脑并学习新成员的签名信息。普通文件访问也会在建立会话时交换证明。

批准信息可能超过二维码容量；此时完整复制文本，不要截图/截断文本。信息不含私钥、密码或本机移除记录，但包含组名称、设备名、公开身份和局域网地址，请只在可信渠道交换。二维码内没有自动打开网页的指令。

如果由手机先创建组，再批准电脑加入：电脑启动文件服务后「显示组公开信息」，在手机粘贴到入组区并确认，可更新该电脑签名的服务地址。不需要重新配对。地址全部变化时也可使用这一方式恢复连接。

## 设备名称

设备名称输入框默认读取本机名称：Windows 使用计算机名，其他桌面系统使用本机主机名；Android 优先读取系统设置中的设备名称，不可读取时使用厂商/型号。可在创建组或申请入组前手动修改。默认名称不会自动重命名已有成员，也不改变公钥身份或本机移除记录。

脚本可从 `groups.state` 返回的 `defaultDeviceName` 读取同一默认值。

## 离线传播

A 先授权 B 可以邀请，B 后来接纳 C 时 A 离线。C 保存根证明、B 的授权和 B 签发的 C 成员证明；C 连接 A 时带上这些公开签名，A 可以直接核验，B 不必在线。电脑自身不能邀请则无法签发有效新成员介绍。已接受的权限不会被来自其他成员的同名记录悄悄提升。

首次建立信任仍需人工核对：签名能证明后续介绍的来源，不能替你判断第一次扫码的设备是否可信。请勿批准陌生请求。

## 移除与恢复

- 「本机移除」按公钥身份保存本机拒绝标记，适用于本机全部组；不是给全组发全局踢出通知。别的设备仍有权自行决定是否信任它。
- 组信息刷新、旧/新证明、更晚的时间、改名/换 IP、程序重启/更新都不清除拒绝标记。恢复只允许本机管理接口在明确确认后执行。
- 移除有邀请权限的成员后，不再接受其新的介绍。此前已独立接受的其他成员不被连带删除。
- 手机删除自动生成的组网络位置，也会留下本机移除记录，防止下次刷新悄悄重新出现。在设备组中手动恢复，再刷新即可回来。
- 丢失设备请在每台文件服务端分别移除。离线设备不会收到“立即全局撤销”的承诺；若不希望其继续介绍新成员，也应在相关设备上移除其身份。
- 清除应用数据/卸载、手动删除配置和私钥属于重建设备身份，不等于普通更新/同步。不要克隆私钥或还原旧服务配置覆盖当前拒绝记录。

时间仅用于显示审计记录，不作为信任冲突的裁决。记录有单调增加的本机操作序号；磁盘保存失败则操作不生效，不会在内存中假装已保存。

## 删除整个本机设备组

在组卡片底部点「删除本机设备组」并确认：本机的该组成员证明、服务地址和组权限会删除，组从 UI 消失，不留下“恢复”条目。手机还会清理该组生成的网络位置及对应快捷访问。其他客户端、其他组、实际文件、独立配对/WebDAV 账号和本机私钥不受影响；对其他设备的本机拒绝记录仍保留。删除会立即使旧组会话失效，之后重新加入也不会复活这些旧会话。

重启、刷新或旧证明不能自动加回。以后需要恢复时，在本机重新生成入组请求，交给仍保留此组且有邀请权限的客户端批准，然后在本机核对并确认加入；原创建者也能按此流程重新加入。若之前移除了本机身份，这次明确入组只恢复该组中的本机身份，不恢复其他已退出的组或已移除的其他设备。不要另建同名组代替原组。

## 权限与边界

电脑每个组可独立开启/关闭文件服务访问、写入重命名、永久删除，默认只读；共享根目录由电脑单独设置。普通成员和可邀请成员的文件访问权限相同，邀请权不是管理员远程修改共享权限的能力。

文件服务里的权限、设备组访问和自动启动开关点选后立即保存，不需要另点保存按钮。保存中/已保存/失败原因会显示在对应选项旁，失败会恢复最后一次成功保存的值，不刷新整页或清空其他输入。开启登录启动会同时开启服务恢复；关闭服务恢复会同时关闭登录启动。

「新配对设备的默认权限」只用于之后生成的配对码和 WebDAV 专用账号；已有账号、已有配对码和设备组权限不会被批量修改。默认仍为只读；默认权限独立保存在本机服务配置中，刷新、重启和重新启动监听都保留。脚本可使用 `server.defaults` 修改，使用 `server.state` 读取 `config.newDevicePermissions`。

设备组使用 P-256/SHA-256 签名、60 秒单次随机挑战、固定 HTTPS 证书和最多 30 分钟的内存会话。每个文件请求/流还会实时检查本机拒绝和权限，移除不会等到会话过期才生效。只有 localhost、局域网、Tailscale 私有地址；不接受公网地址、不信任转发来源头、不跟随重定向、不通过代理发送组认证。

手机私钥留在 Android Keystore。桌面私钥放在当前用户/虚拟桌面的私密服务数据目录，受共享路径保护。设备组身份、拒绝记录、会话凭据和自动生成连接不参加手机配置备份或 WebDAV 同步；新设备必须自己加入，不能继承另一台的身份。

## 自动化

本机 JSON 命令：`groups.state/create/request/approve/join/export/remove/restore/forget/configure`；手机还提供 `groups.refresh`。使用现有 `scripts/rhfiles-api.mjs` 命令行入口枚举动作及参数。`join`、`restore`、`forget` 必须明确传 `confirmed: true`；`forget` 参数为 `{ "id": "组 ID", "confirmed": true }`，属于破坏性的本机配置操作，不删除文件。没有网络端的删除组/恢复/权限管理 API。二维码渲染属于公开数据处理，手机 Rust 命令为 `device_group_qr`。

## English

The device-name field defaults to the local computer/host name, or Android's configured device name with a manufacturer/model fallback. It remains editable before creating a group or requesting membership. Defaults never rename existing members or change cryptographic identities/local refusals.

Create a group on one computer; on a new device generate a request, have an invite-capable member approve it, then explicitly accept the returned approval on the requesting device. Phone settings live under Storage & permissions; computer settings under LAN file service. Refresh group devices on the phone to exchange signed introductions and learn other member computers. Long public proofs use complete text instead of truncated QR codes.

Each device has its own P-256 private key. Signed introductions can be carried by a member while its introducer is offline. Local file roots and grants never travel in those proofs. Removing a device creates a persistent local public-key refusal across local groups; no incoming proof, timestamp, refresh or update can clear it. Only explicit local restoration can. Removing an introducer blocks new introductions, not previously accepted peers. Removal is local, not instantaneous global revocation: remove a lost device on each file server.

“Delete group from this device” forgets the entire local group after confirmation, without a restore stub. Android also removes its generated connections and favorites. Files, other clients/groups, independent credentials, private identity and refusals for other devices remain intact. Old sessions stay invalid even after rejoining. Restart, refresh and old packets cannot bring a forgotten group back. Generate a fresh join request, have a remaining invite-capable member approve it, then explicitly accept it locally—even if you originally created the group. This restores only your membership in that group, not blocked peers or other self-removed groups. The local-only destructive automation action is `groups.forget` with `{ "id": "group ID", "confirmed": true }`.

Local permission and startup switches save immediately with inline progress/errors and rollback to the last saved state on failure, without rebuilding the form. New-device defaults persist independently and affect only future pairing codes and WebDAV credentials, never existing devices, codes or groups. Use `server.defaults` and `server.state` (`config.newDevicePermissions`) for scripting. Enabling login startup also enables service restore; disabling restore disables login startup.

Android keys remain in Keystore; group sessions are short lived and memory-only. Identities/refusals/generated connections do not participate in backup or WebDAV configuration sync. Requests and streams check current local authorization. Local/LAN/Tailscale endpoints only; HTTPS certificate pinning, one-use challenges, no redirects/public endpoints/forwarded-IP trust. Existing individual pairing and third-party WebDAV credentials remain independent options.
