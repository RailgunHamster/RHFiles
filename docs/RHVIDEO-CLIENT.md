# RHVideo 内置客户端（Windows / Android）

这是 RHFiles 内的 RHVideo 客户端，不附带 RHVideo 服务，不直接读取 SQLite 文件，也不加载 RHVideo 网站。

## 使用

1. 在 RHFiles 左侧点击 RHVideo，打开应用自己的媒体库窗口。
2. 点击“连接 RHVideo”，填写已有服务器地址、用户名和密码。
3. 浏览视频、图片、小说、收藏；搜索和文件夹筛选在当前分类中进行。
4. 视频可以直接播放，或在关键帧时间轴中从指定位置播放。播放队列沿用当前页的视频。
5. 图片可前后切换和缩放；小说支持目录、字号、继续阅读和向服务器保存进度。

当前 Windows 原生播放使用 64 位 VLC 3.x 的 libVLC。自动检测系统安装目录或程序旁的 vlc/ 目录。不启动 vlc.exe，没有 HTML video 或网页播放器兜底。未安装内核时，浏览、图片和阅读仍可使用，播放会明确提示缺失。

体验版采用兼容性优先的软件解码与原生 GDI 画布，帧缓冲上限为 1920×1080，适用于先验证操作和接入方式；并不代表已经完成 4K/HDR、硬件加速和最终播放性能优化。原生输入时间戳较粗时，仅在确实收到显示帧之间插值进度；无帧、暂停或缓冲时不凭墙钟伪造进度。

Android 从侧栏 RHVideo 打开，使用适配手机和平板的同一套分类、图片、小说和收藏操作。视频复用 Media3 原生播放器，无需安装 VLC；支持当前页播放队列、时间轴定位、暂停、跳转和速度。系统返回先关闭当前图片、阅读器或对话框，然后回到文件管理器。

这是第一版，不代表已经迁移全部功能：尚未包含连续图片条带、自动放映、多视频同屏、复杂标签规则、转码任务和服务器管理。

## 数据与边界

- 登录、媒体清单、收藏、章节、阅读进度、关键帧使用 RHVideo 现有 HTTP API。
- 增加收藏使用 PUT /api/v1/favorites/{type}/{id}，取消使用 DELETE。
- 不修改源文件，不提供服务器媒体删除、数据库修改或任意 URL 代理。
- 本地只保存服务器地址和用户名；密码不保存，令牌仅存在原生内存。重启后需要重新登录。
- HTTP 登录没有传输加密，跨公网请使用 HTTPS 或可信 VPN。
- Windows 媒体通过仅绑定 127.0.0.1 的临时通道；Android 图片使用原生拦截的应用内资源路径，视频通过原生 Media3 DataSource 读取。两端都只允许登记的随机媒体标识；令牌不进入网页、播放器参数或磁盘。
- 禁止重定向转发登录信息，校验 TLS 证书。退出后旧媒体链接失效，正在读取的流也会终止。
- 缩略图懒加载，卡片分页；原生视频按流读取，不把整个电影下载到内存。
- 窗口复用主窗口的真实 WebView2 环境，避免串配置和重复创建浏览器环境。

## 自动化

所有界面操作使用 RHFilesAPI 注册动作。现有本机 CLI 可选择窗口调用：

    node scripts/rhfiles-api.mjs --port 9222 --window main run rhvideo.open --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo list
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo run rhvideo.category '{"kind":"picture"}' --wait
    node scripts/rhfiles-api.mjs --port 9222 --window window-rhvideo-player run rhvideo.player.next --wait

接口仅在用户显式启用本机自动化后可调用。不要把真实密码写进命令行历史，可使用 CLI 的 JSON 行输入。UI 与脚本走同一原生接口。

## 验证

    node --test scripts/tests/rhvideo.test.mjs
    cargo test -p rhfiles-tauri --locked rhvideo::tests
    node --test --test-concurrency=1 scripts/e2e/rhvideo.test.mjs

Windows E2E 使用隔离配置，不操作已安装的 RHFiles。设置 RHFILES_NATIVE_PLAYER_QA=1 可启用真实 libVLC 播放验收，需要已安装 64 位 VLC 和 FFmpeg。测试生成专用 MP4，检查真实进度、暂停、跳转、前后切换，不以模拟播放代替。

同级有 RHVideo 源码时，还会通过它的 uv 环境启动真实 FastAPI，使用独立临时 SQLite、生成的媒体及测试账号核对 API 契约。测试工作目录不含生产 .env，不连接或写入正式媒体库。
