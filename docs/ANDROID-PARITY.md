# Android 功能补齐跟踪

目标：补齐与 File Manager Plus 对照时发现的缺口，而不是只增加入口。
不复制其商标、图标或实现。官方参照：https://play.google.com/store/apps/details?id=com.alphainventor.filemanager

## 实现与验收清单

- [x] ZIP 创建，ZIP/TAR/GZ/XZ 内容查看和安全解压（支持边界见 ANDROID.md）
- [x] UTF-8 文本编辑，防止保存覆盖外部修改或截断大文件
- [x] 全屏图片查看、缩放、旋转、前后切换；媒体播放控制
- [x] SAF 外置存储/系统网盘提供者，持久授权、撤销和失效提示
- [x] 接收系统分享，用户选择目标后才导入
- [x] 应用列表、启动、系统详情/卸载、APK 备份（含 split APK）
- [x] SMB2/3、FTP/FTPS、WebDAV：目录和文件操作、上传下载、安全保存凭据
- [x] 文件任务：进度/速度、暂停取消、前台通知、持久记录、中断后显式重试
- [x] 自动刷新媒体分类、真实容量和授权后的应用空间统计
- [x] 带认证的 HTTP 电脑访问
- [x] 带随机密码、目录限制和只读默认值的 FTP 服务端
- [x] 本卷回收站及恢复
- [x] 业务/协议/界面回归测试
- [ ] 独立网盘 OAuth 登录（需开发者应用配置；系统提供者不等同于独立登录）
- [ ] 真机 / NAS / 真实网盘与 FTPS / 系统后台限制验收
- [ ] 专门的电视 / 平板交互、多语言支持

勾选表示代码与入口已接通，不表示已在所有 Android 设备和服务端验证。

## 外部前提

网盘先通过 Android DocumentsProvider 接入，需设备安装对应提供者并登录；
这不等于在 RHFiles 内实现 Google/Microsoft 等厂商的独立 OAuth 登录。
独立登录需要开发者应用注册/重定向配置，不能编造凭据或替用户创建账号。
SAF 提供者的目录授权、写入和删除能力由提供者决定。

Android 15+ dataSync 前台服务仍受系统时限约束；用户强制停止不能被绕过。
中断任务必须明确显示并让用户选择重试，不能偷偷再次执行移动/删除。

参考实现依据：
- https://developer.android.com/training/data-storage/shared/documents-files
- https://developer.android.com/develop/background-work/services/fgs/timeout
- https://commons.apache.org/proper/commons-compress/examples.html
- https://github.com/hierynomus/smbj
