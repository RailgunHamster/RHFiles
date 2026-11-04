# RHVideo 共享前端

RHVideo 仓库的 `static/` 是媒体库 UI 和业务操作的唯一共享源码。RHFiles 的共享入口使用同一套媒体列表、搜索、筛选、收藏、阅读、任务和播放队列。Windows 用 libVLC、Android 用 Media3 解码；适配层只处理登录、请求、解码器、配置存储和系统选择器。不加载远程页面脚本、不复制数据库，视频帧也不经过 JavaScript 桥。

## 更新共享包

1. 在 RHVideo 仓库修改源码、更新操作契约并验证：`uv run python scripts/operation_contract.py`、`npm run test:frontend`。
2. `npm run build:frontend` 输出 `dist/frontend/`。生成的外部事件绑定允许客户端继续禁止内联脚本。产物只含前端资源、许可证和接口清单，不含配置、凭据或媒体。
3. 在 RHFiles 执行 `node scripts/rhvideo-frontend.mjs --import ../RHVideo/dist/frontend`。产物以内容哈希锁定；不要直接改 `src/vendor/rhvideo/frontend/`。不带参数运行该命令可以校验。
4. 网页部署可设 `RHVIDEO_FRONTEND_DIST` 指向同一产物目录；不设置时直接读取同一套源码，方便开发。Android 同步脚本与 Windows 打包均使用已导入资源，不需要读取私有后端仓库。

## 第一阶段：可选入口

先保留已安装用户当前使用的旧入口。构建后可通过本机自动化调用 `rhvideo.open` 并传 `{"shared":true}`（Windows 已有旧窗口时先关闭它）。Windows 也可在启动 RHFiles 前设置 `RHFILES_RHVIDEO_SHARED_FRONTEND=1`。登录仍读取原有受系统保护的凭据；共享前端的界面偏好单独保存，旧客户端偏好不会被覆盖。

共享入口通过 `rhvideo.shared.operations` 枚举操作与控件，`rhvideo.shared.call` 调用网页同名操作（例如 `navigation.tab`、`app.playVideoLocal`），`rhvideo.shared.control` 操作具体控件，`rhvideo.shared.api` 调用后端接口。应用的每个命名 UI 操作同时注册为 `rhvideo.ui.<原名称>`。新功能应写到 RHVideo，旧前端只保留作迁移期间的回退，不再添加功能。

默认入口切换、旧偏好迁移和旧前端移除是后续切换步骤；切换前应复测各平台原生播放、同屏、后台下载、系统选择器、窗口/旋转与登录恢复。测试只使用生成的媒体和独立配置。
