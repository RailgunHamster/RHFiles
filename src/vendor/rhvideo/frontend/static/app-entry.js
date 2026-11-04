/* Delay the same classic script until a native host has restored its session.
 * Keeping it classic preserves named UI/automation operations and inline events. */
RHVideoHost.ready.then(() => {
    if (RHVideoHost.media) {
        const native = document.createElement('script'); native.src = RHVideoHost.staticURL('host-media.js');
        native.onload = loadApplication; native.onerror = () => showStartupError('原生播放适配器加载失败'); document.body.append(native);
        const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = RHVideoHost.staticURL('host-media.css'); document.head.append(css);
    } else loadApplication();
}).catch(error => showStartupError('媒体库启动失败：' + error.message));
function loadApplication() {
    const script = document.createElement('script');
    script.src = RHVideoHost.staticURL('app.js');
    script.onload = () => window.dispatchEvent(new Event('rhvideo-ready'));
    script.onerror = () => showStartupError('媒体库界面加载失败，请重新打开');
    document.body.append(script);
}
function showStartupError(message) {
    const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.textContent = message;
    document.body.prepend(error);
}
