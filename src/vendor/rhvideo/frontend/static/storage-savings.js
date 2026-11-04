/* Metadata-only cumulative statistics. Poll only while the storage page is visible. */
(() => {
    'use strict';
    let config, timer, controller, generation = 0, busy = false, loaded = false;
    const $ = id => document.getElementById(id);
    const count = value => Math.max(0, Number(value) || 0).toLocaleString('zh-CN');
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const visible = () => config && config.getToken() && !document.hidden && !$('tab-storage').classList.contains('hidden');
    function stop() {
        clearTimeout(timer); controller?.abort(); generation++; busy = false;
    }
    function render(data) {
        const percent = Math.max(0, Math.min(100, Number(data.savings_percent) || 0));
        $('replacement-savings-content').innerHTML = `<div class="storage-savings-total"><span>累计原片体积减少</span>
            <strong>${esc(config.formatBytes(data.saved_bytes))}</strong><p>${count(data.successful_count)} 次成功替换 · ${count(data.video_count)} 个视频</p></div>
            <div class="storage-savings-comparison"><div class="storage-savings-sizes"><span>替换前累计<strong>${esc(config.formatBytes(data.before_bytes))}</strong></span><i aria-hidden="true">→</i><span>替换后累计<strong>${esc(config.formatBytes(data.after_bytes))}</strong></span></div>
            <progress max="100" value="${percent}" aria-label="累计原片体积缩减比例"></progress><p>累计缩减 <strong>${percent.toFixed(1)}%</strong><span>按 ${count(data.measured_count)} 次有完整大小的记录计算</span></p></div>`;
        const notes = [];
        if (data.unmeasured_count > 0) notes.push(`${count(data.unmeasured_count)} 条成功记录缺少完整大小，未计入节省空间`);
        $('replacement-savings-coverage').textContent = notes.join('；');
        const date = data.generated_at ? new Date(data.generated_at) : null;
        $('replacement-savings-state').textContent = date && Number.isFinite(date.getTime())
            ? '更新于 ' + date.toLocaleTimeString('zh-CN', {hour12:false}) : '自动更新';
        $('replacement-savings-state').classList.remove('is-error');
        loaded = true;
    }
    async function load() {
        if (!visible() || busy) return;
        clearTimeout(timer); busy = true;
        controller = new AbortController();
        const request = ++generation, userToken = config.getToken();
        let failed = false;
        if (!loaded) $('replacement-savings-content').innerHTML = '<p class="storage-savings-empty">正在读取累计替换记录…</p>';
        try {
            const response = await fetch(config.base + '/system/replacement-savings', {
                headers: {Authorization:'Bearer ' + userToken}, cache:'no-store', signal:controller.signal,
            });
            if (!response.ok) throw Error(response.status === 404 ? '累计统计需下次重启服务后启用' : '暂时无法读取累计替换记录');
            const data = await response.json();
            if (request !== generation || config.getToken() !== userToken) return;
            render(data);
        } catch (error) {
            if (error.name === 'AbortError' || request !== generation || config.getToken() !== userToken) return;
            failed = true;
            $('replacement-savings-state').textContent = loaded ? '连接中断 · 显示上次统计' : '暂不可用';
            $('replacement-savings-state').classList.add('is-error');
            if (!loaded) $('replacement-savings-content').innerHTML = `<p class="storage-savings-empty">${esc(error.message)}</p>`;
        } finally {
            if (request === generation) {
                busy = false;
                if (visible()) timer = setTimeout(load, failed ? 60000 : 15000);
            }
        }
    }
    function reset() {
        stop(); loaded = false;
        for (const id of ['replacement-savings-content','replacement-savings-state','replacement-savings-coverage']) $(id).textContent = '';
        $('replacement-savings-state').classList.remove('is-error');
    }
    window.RHStorageSavings = {load, stop, reset, init(options) {
        config = options;
        document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (visible()) load(); });
    }};
})();
