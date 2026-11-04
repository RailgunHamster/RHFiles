/* Paginated task inspection. Closed panels make no requests. */
(() => {
    'use strict';
    const labels = { processing:'处理中', running:'处理中', pending:'等待', succeeded:'已完成', failed:'失败',
        interrupted:'已中断', skipped:'已跳过', cancelled:'已取消', done:'完成', warning:'有警告', not_run:'未执行', unrecorded:'未记录' };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const time = value => value ? new Date(value).toLocaleString('zh-CN', { year:new Date(value).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined, month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '—';
    const $ = id => document.getElementById(id);
    const number = value => Number(value).toLocaleString('zh-CN', {maximumFractionDigits:2});
    function duration(value) {
        const seconds = Number(value);
        if (seconds < 60) return number(seconds) + ' 秒';
        return (seconds >= 3600 ? Math.floor(seconds/3600) + ' 小时 ' : '')
            + Math.floor(seconds/60)%60 + ' 分 ' + Math.floor(seconds%60) + ' 秒';
    }
    function metricValue(item) {
        const value = item.value, n = Number(value);
        if (item.format === 'bytes') {
            const units = ['B','KiB','MiB','GiB','TiB'];
            const index = n > 0 ? Math.min(4, Math.floor(Math.log(n)/Math.log(1024))) : 0;
            return number(n / 1024**Math.max(0,index)) + ' ' + units[Math.max(0,index)];
        }
        if (item.format === 'duration') return duration(n);
        if (item.format === 'bitrate') return number(n/(n>=1000000?1000000:1000)) + (n>=1000000?' Mbps':' kbps');
        if (item.format === 'datetime') return time(value);
        const suffix = {percent:'%',fps:' fps',speed:'×',count:' 个',frames:' 帧'}[item.format];
        return suffix !== undefined ? number(n) + suffix : typeof value === 'number' ? number(value) : String(value);
    }
    function metricsMarkup(metrics, extraClass = '') {
        const items = (Array.isArray(metrics) ? metrics : []).filter(item => item && item.value !== null && item.value !== undefined && item.value !== ''
            && ['string','number','boolean'].includes(typeof item.value) && (typeof item.value !== 'number' || Number.isFinite(item.value)));
        return items.length ? `<dl class="tc-step-metrics ${extraClass}">${items.slice(0,24).map(item =>
            `<div><dt>${esc(item.label)}</dt><dd>${esc(metricValue(item))}</dd></div>`).join('')}</dl>` : '';
    }
    function renderStep(step, index) {
        const metrics = metricsMarkup(step.metrics);
        const elapsed = Number.isFinite(step.elapsed_seconds) ? step.elapsed_seconds : step.started_at && step.finished_at
            ? Math.max(0,(Date.parse(step.finished_at)-Date.parse(step.started_at))/1000) : null;
        return `<li class="tc-step is-${esc(step.status)}" data-step="${esc(step.key)}"><span class="tc-step-mark">${step.status === 'done' ? '✓' : step.status === 'skipped' ? '−' : index+1}</span>
            <div class="tc-step-body"><div class="tc-step-title"><strong>${esc(step.label)}</strong>
            <span class="tc-step-duration">${Number.isFinite(elapsed) ? '耗时 ' + esc(duration(elapsed)) : ''}</span>
            <span class="tc-step-status">${esc(labels[step.status] || step.status)}</span></div>
            ${step.message ? `<p>${esc(step.message)}</p>` : ''}${metrics}
            ${!metrics && !step.message ? `<p class="tc-step-note">${step.status === 'pending' ? '执行后显示结果' : step.status === 'running' ? '正在获取数据' : '本次未记录更多数据'}</p>` : ''}
            <div class="tc-step-live hidden" aria-live="off"></div></div></li>`;
    }
    let config, opened = false, kind = 'default', view = 'running', page = 1, pages = 1, selected = '', detail = null;
    let listController, detailController, generation = 0, timer, debounce, lastFocus, lastList = '', lastDetail = '', progress = {};
    let loading = false, panelSession = 0;
    const retrying = new Set(), retryErrors = new Map();
    const prioritizing = new Set();

    function badge(status) { return `<span class="tc-badge is-${esc(status)}">${esc(labels[status] || status)}</span>`; }
    function prioritizeButton(item, large = false) {
        return `<button type="button" class="tc-prioritize" data-tc-prioritize="${esc(item.id)}" data-tc-prioritize-kind="${kind}" aria-label="置顶：${esc(item.filename)}" title="移到等待队列最前面，当前任务继续处理"><span aria-hidden="true">↑</span><span>${large ? '置顶此项' : '置顶'}</span></button>`;
    }
    function notice(message = '', error = false) {
        const el = $('tc-action-notice');
        el.textContent = message; el.classList.toggle('hidden', !message); el.classList.toggle('is-error', error);
        el.setAttribute('role', error ? 'alert' : 'status');
    }
    function taskKind(item) { return item.kind === 'legacy' ? '历史处理摘要' : item.kind === 'rebuild' ? '原片替换后重建' : item.kind === 'replacement' ? '原片替换' : '默认处理'; }
    function thumbnail(item, index, large = false) {
        const tag = large ? 'button' : 'span';
        return `<${tag} class="tc-thumbnail${large ? ' tc-detail-preview' : ''}" data-image-preview data-preview-title="${esc(item.filename)}" ${large ? `type="button" disabled aria-label="${esc('放大预览：' + item.filename)}"` : 'aria-hidden="true"'}><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="m10 9 5 3-5 3V9Z"></path></svg>
            ${item.video_id ? `<img src="${esc(config.base + '/videos/' + encodeURIComponent(item.video_id) + '/thumbnail')}" width="192" height="108" loading="lazy" decoding="async" fetchpriority="low" alt="" data-rh-load="h307" data-rh-a-h307="${RHVideoBindings.encode([null])}" data-rh-error="h308" data-rh-a-h308="${RHVideoBindings.encode([null])}">` : ''}
            ${large ? '<span class="tc-preview-hint">点击放大 ↗</span>' : `<span class="tc-item-number">${String((page-1)*25+index+1).padStart(2,'0')}</span>`}</${tag}>`;
    }
    function empty(message) { return `<div class="tc-empty"><span aria-hidden="true">◇</span><strong>${esc(message)}</strong><small>处理由后端持续执行，关闭面板不影响队列</small></div>`; }
    function syncControls() {
        $('replacement-tasks-modal').dataset.kind = kind;
        document.querySelectorAll('[data-tc-kind]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.tcKind === kind)));
        document.querySelectorAll('[data-tc-view]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.tcView === view)));
        $('tc-history-filters').classList.toggle('hidden', view !== 'history');
        document.querySelector('[data-tc-view="failed"]').classList.remove('hidden');
        for (const option of $('tc-status').options) option.hidden = kind === 'default' && ['skipped','cancelled'].includes(option.value);
        if (kind === 'default' && ['skipped','cancelled'].includes($('tc-status').value)) $('tc-status').value = 'all';
    }
    function resetSelection() {
        detailController?.abort(); selected = ''; detail = null; lastDetail = '';
        $('tc-detail').innerHTML = empty('选择一个任务查看流程');
    }
    function reschedule() {
        clearTimeout(timer);
        if (opened && !document.hidden) timer = setTimeout(() => loadList(false), view === 'history' ? 15000 : 4000);
    }
    async function request(url, controller) {
        const userToken = config.getToken();
        const response = await fetch(config.base + url, { headers: { Authorization:'Bearer ' + userToken }, cache:'no-store', signal:controller.signal });
        if (!response.ok) throw Error(response.status === 422 && view === 'failed' ? '失败列表需更新后端，重启服务后即可使用' : response.status === 404 ? '任务详情服务尚未启用，请重启后端后查看' : '任务详情暂时无法连接，正在自动重试');
        const result = await response.json();
        if (!opened || config.getToken() !== userToken) throw new DOMException('Session changed', 'AbortError');
        return result;
    }
    async function loadList(changed = false, force = false) {
        if (!opened || document.hidden || loading && !changed && !force) return;
        listController?.abort(); listController = new AbortController();
        const controller = listController, ticket = ++generation;
        loading = true; $('tc-list').setAttribute('aria-busy', 'true');
        if (changed) { resetSelection(); $('tc-list').innerHTML = '<div class="tc-loading"><span class="spinner"></span>读取任务…</div>'; lastList = ''; }
        const params = new URLSearchParams({kind,view,page,limit:25,days:$('tc-days').value,status:$('tc-status').value,q:$('tc-search').value.trim()});
        try {
            const data = await request('/processing-tasks?' + params, controller);
            if (ticket !== generation) return;
            $('tc-error').classList.add('hidden'); $('tc-connection').textContent = '自动更新'; $('tc-connection').classList.remove('offline');
            document.querySelectorAll('[data-tc-view]').forEach(el => el.querySelector('strong').textContent = Number(data.counts?.[el.dataset.tcView] || 0).toLocaleString());
            page = data.page; pages = data.pages;
            $('tc-total').textContent = `共 ${Number(data.total).toLocaleString()} 项`;
            $('tc-page').textContent = `${page} / ${pages}`;
            $('tc-prev').disabled = page <= 1; $('tc-next').disabled = page >= pages;
            const items = data.items || [];
            const signature = JSON.stringify([kind,view,page,items]);
            if (signature !== lastList) {
                const list = $('tc-list'), scroll = list.scrollTop;
                const focused = document.activeElement?.closest('[data-tc-entry]')?.dataset.tcEntry;
                const focusedPin = document.activeElement?.closest('[data-tc-prioritize]')?.dataset.tcPrioritize;
                list.innerHTML = items.map((item, index) => {
                    const failed = view === 'failed', retryId = kind === 'replacement' ? item.id : item.video_id;
                    const entry = `<button type="button" class="tc-item" data-tc-entry="${esc(item.id)}" aria-pressed="${item.id === selected}">
                    ${thumbnail(item, index)}<span class="tc-item-content"><strong title="${esc(item.filename)}">${esc(item.filename)}</strong>
                    <span class="tc-item-meta">${item.prioritized ? '<span class="tc-prioritized">↑ 优先处理</span>' : ''}${esc(taskKind(item))}<span>·</span>${esc(time(item.finished_at || item.started_at || item.queued_at))}</span>
                    ${failed && item.message ? `<span class="tc-failure-message" title="${esc(item.message)}">${esc(item.message)}</span>` : ''}
                    ${failed ? `<span class="tc-retry-error hidden" data-tc-retry-error="${esc(retryId)}" data-tc-retry-kind="${kind}"></span>` : ''}
                    ${item.blocked ? '<span class="tc-wait-note">等待原片替换完成后处理</span>' : ''}</span>${badge(item.status)}</button>`;
                    return failed ? `<div class="tc-failed-row">${entry}<button type="button" class="tc-retry" data-tc-retry="${esc(retryId)}" data-tc-retry-kind="${kind}" aria-label="重试：${esc(item.filename)}">重试</button></div>`
                        : view === 'queued' && item.can_prioritize ? `<div class="tc-queued-row">${entry}${prioritizeButton(item)}</div>` : entry;
                }).join('') || empty($('tc-search').value.trim() ? '没有匹配的任务' : view === 'failed' ? '当前没有失败的任务' : view === 'history' ? '此范围内没有历史结果' : view === 'queued' ? '暂时没有等待任务' : '当前没有正在处理的任务');
                list.scrollTop = scroll;
                if (focused) [...list.querySelectorAll('[data-tc-entry]')].find(el => el.dataset.tcEntry === focused)?.focus({preventScroll:true});
                if (focusedPin) [...list.querySelectorAll('[data-tc-prioritize]')].find(el => el.dataset.tcPrioritize === focusedPin)?.focus({preventScroll:true});
                lastList = signature;
            }
            if (selected && !items.some(item => item.id === selected)) resetSelection();
            retryState();
            priorityState();
            if (!selected && items.length && ['running','failed'].includes(view)) await select(items[0].id);
            else if (selected && view !== 'history') await loadDetail();
        } catch (error) {
            if (error.name !== 'AbortError' && ticket === generation) {
                $('tc-error').textContent = error.message; $('tc-error').classList.remove('hidden');
                $('tc-connection').textContent = '连接中断 · 自动重试'; $('tc-connection').classList.add('offline');
                if (!lastList) $('tc-list').innerHTML = empty('暂时无法读取任务');
            }
        } finally {
            if (ticket === generation) { loading = false; $('tc-list').setAttribute('aria-busy','false'); reschedule(); }
        }
    }
    async function select(id) {
        if (selected !== id) { resetSelection(); selected = id; $('tc-detail').innerHTML = '<div class="tc-loading"><span class="spinner"></span>读取处理流程…</div>'; }
        document.querySelectorAll('[data-tc-entry]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.tcEntry === id)));
        await loadDetail();
    }
    async function loadDetail() {
        if (!opened || !selected) return;
        detailController?.abort(); detailController = new AbortController();
        const controller = detailController, id = selected, requestKind = kind, ticket = generation;
        try {
            const value = await request('/processing-tasks/' + kind + '/' + encodeURIComponent(id), controller);
            if (id !== selected || requestKind !== kind || ticket !== generation) return;
            detail = value; renderDetail();
        } catch (error) {
            if (error.name !== 'AbortError' && id === selected && opened && requestKind === kind && ticket === generation) {
                $('tc-detail').innerHTML = empty(error.message); lastDetail = '';
            }
        }
    }
    function renderDetail() {
        if (!detail) return;
        const signature = JSON.stringify({...detail,progress:null});
        if (signature !== lastDetail) {
            const scroll = $('tc-detail').scrollTop;
            const result = detail.legacy ? '历史摘要 · 当时未记录分步信息' : detail.details_archived ? '此记录已超过 90 天，详细步骤已归档为摘要' : detail.steps_provisional && detail.live ? '该任务开始时未记录分步数据，当前步骤来自实时进度' : view === 'queued' ? '下方为计划参数，实际执行时记录结果' : '按实际执行情况记录，参数与结果随任务留存';
            const summary = kind === 'replacement' ? [
                {label:'替换前',value:detail.before_size > 0 ? detail.before_size : null,format:'bytes'},
                {label:'替换后',value:detail.after_size > 0 ? detail.after_size : null,format:'bytes'},
                {label:'节省空间',value:detail.status === 'succeeded' && detail.before_size > 0 && detail.after_size > 0 ? detail.before_size-detail.after_size : null,format:'bytes'},
            ] : [];
            $('tc-detail').innerHTML = `<div class="tc-detail-overview">${thumbnail(detail, 0, true)}<div><div class="tc-detail-heading"><span class="tc-eyebrow">${esc(taskKind(detail))}</span>${badge(detail.status)}<h4>${esc(detail.filename)}</h4></div>
                <div class="tc-dates">${detail.kind === 'legacy' ? `<span>记录时间<strong>${esc(time(detail.finished_at))}</strong></span>` : `<span>${detail.started_at ? '开始' : '入队'}<strong>${esc(time(detail.started_at || detail.queued_at))}</strong></span><span>结束<strong>${esc(time(detail.finished_at))}</strong></span>`}</div></div></div>
                ${metricsMarkup(summary, 'tc-summary-metrics')}<div id="tc-live" class="tc-live hidden"></div>
                ${detail.message ? `<div class="tc-result ${['failed','interrupted'].includes(detail.status) ? 'is-error' : ''}">${esc(detail.message)}</div>` : ''}
                ${detail.can_retry ? `<div class="tc-retry-action"><button type="button" class="tc-retry" data-tc-retry="${esc(kind==='replacement'?detail.id:detail.video_id)}" data-tc-retry-kind="${kind}">重试此项</button><span>${kind==='replacement'?'沿用原分辨率上限和 CRF，保留本次失败记录':'重新加入默认压缩队列'}</span></div><p class="tc-retry-error hidden" data-tc-retry-error="${esc(kind==='replacement'?detail.id:detail.video_id)}" data-tc-retry-kind="${kind}"></p>` : ''}
                ${detail.can_prioritize ? `<div class="tc-priority-action">${prioritizeButton(detail, true)}<span>${detail.blocked ? '原片替换完成后优先处理' : '移到等待队列最前面，当前任务继续处理'}</span></div>` : ''}
                <div class="tc-flow-heading"><strong>处理流程</strong><span>${esc(result)}</span></div>
                <ol class="tc-steps">${(detail.steps || []).map(renderStep).join('')}</ol>
                ${!(detail.steps || []).length ? '<div class="tc-archive-note">' + esc(result) + '</div>' : ''}
                ${kind === 'replacement' ? '<div class="tc-archive-note">替换成功后，压缩版重建会进入默认压缩队列。</div>' : ''}
                ${kind === 'replacement' && ['running','pending'].includes(detail.status) ? '<button type="button" class="btn btn-secondary tc-stop" data-tc-stop>停止此批次剩余任务</button>' : ''}`;
            $('tc-detail').scrollTop = scroll;
            lastDetail = signature;
        }
        retryState();
        priorityState();
        renderLive();
    }
    function priorityState() {
        document.querySelectorAll('[data-tc-prioritize]').forEach(el => {
            const busy = prioritizing.has(el.dataset.tcPrioritizeKind + ':' + el.dataset.tcPrioritize);
            el.disabled = busy;
            el.lastElementChild.textContent = busy ? '提交中…' : el.closest('#tc-detail') ? '置顶此项' : '置顶';
        });
    }
    async function prioritize(entryId, queueKind = 'default') {
        const key = queueKind + ':' + entryId;
        if (prioritizing.has(key)) return;
        const userToken = config.getToken(), session = panelSession, requestPage = page, search = $('tc-search').value;
        prioritizing.add(key); priorityState();
        if (opened && kind === queueKind) notice();
        try {
            const response = await fetch(config.base + '/processing-tasks/' + queueKind + '/' + encodeURIComponent(entryId) + '/prioritize', {
                method:'POST', headers:{Authorization:'Bearer '+userToken}, cache:'no-store',
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw Error(response.status === 404 || response.status === 405
                ? data.detail || '置顶功能需更新后端，重启服务后即可使用' : data.detail || '置顶失败，请稍后重试');
            if (config.getToken() !== userToken || !opened || session !== panelSession || kind !== queueKind) return;
            const blocked = {replacement:'等待原片替换完成后优先处理', default:'等待默认压缩完成后优先处理', paused:'队列恢复后优先处理'}[data.blocked_by];
            notice('已置顶，' + (blocked || '当前任务结束后优先处理'));
            if (view === 'queued') {
                const showFirst = page === requestPage && $('tc-search').value === search;
                if (showFirst) page = 1;
                await loadList(false, true);
                if (showFirst && page === 1 && $('tc-search').value === search && opened && session === panelSession && kind === queueKind && view === 'queued') $('tc-list').scrollTop = 0;
            }
        } catch (error) {
            if (config.getToken() === userToken && opened && session === panelSession && kind === queueKind) notice(error.message, true);
        } finally { prioritizing.delete(key); priorityState(); }
    }
    function retryState() {
        document.querySelectorAll('[data-tc-retry]').forEach(el => {
            el.disabled = retrying.has((el.dataset.tcRetryKind||'default')+':'+el.dataset.tcRetry);
            el.textContent = el.disabled ? '入队中…' : el.closest('#tc-detail') ? '重试此项' : '重试';
        });
        document.querySelectorAll('[data-tc-retry-error]').forEach(el => {
            el.textContent = retryErrors.get((el.dataset.tcRetryKind||'default')+':'+el.dataset.tcRetryError) || '';
            el.classList.toggle('hidden', !el.textContent);
        });
    }
    async function retry(videoId, retryKind='default') {
        const retryKey=retryKind+':'+videoId,entryId=retryKind==='replacement'?videoId:'video:'+videoId;
        if (retrying.has(retryKey)) return;
        const userToken = config.getToken();
        retrying.add(retryKey); retryErrors.delete(retryKey); retryState();
        try {
            const response = await fetch(config.base + '/processing-tasks/'+retryKind+'/' + encodeURIComponent(entryId) + '/retry', {
                method:'POST', headers:{Authorization:'Bearer '+userToken}, cache:'no-store',
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw Error(response.status === 404 || response.status === 405 ? '逐项重试需更新后端，重启服务后即可使用' : data.detail || '重试提交失败');
            if (config.getToken() !== userToken) return;
            if(retryKind==='default')config.onRetryQueued?.(videoId, data.status);
            if (opened) await loadList(false);
        } catch (error) {
            if (config.getToken() === userToken) {
                retryErrors.set(retryKey, error.message);
                if (retryErrors.size > 200) retryErrors.delete(retryErrors.keys().next().value);
            }
        } finally {retrying.delete(retryKey);retryState();}
    }
    function renderLive() {
        if (!opened || !detail || !['processing','running'].includes(detail.status)) return;
        const actual = (progress[kind] || []).find(item => item.video_id === detail.video_id);
        const metric = actual?.progress || detail.progress;
        const container = $('tc-live'); if (!container) return;
        container.classList.remove('hidden');
        config.renderProgress(container, {kind,progress:metric,filename:detail.filename});
        document.querySelectorAll('#tc-detail .tc-step').forEach(el => {
            const live = el.querySelector('.tc-step-live'), active = metric && el.dataset.step === metric.stage;
            const values = active ? [
                {label:'已处理时长',value:metric.processed_seconds,format:'duration'},
                {label:'当前输出',value:metric.output_bytes,format:'bytes'},
                {label:'处理帧数',value:metric.frame,format:'frames'},
                {label:'处理帧率',value:metric.fps,format:'fps'},
                {label:'编码速度',value:metric.speed,format:'speed'},
                {label:'当前编码器',value:metric.encoder},
            ] : [];
            live.innerHTML = metricsMarkup(values);
            live.classList.toggle('hidden', !live.innerHTML);
            if (active && Number.isFinite(metric.stage_elapsed_seconds)) el.querySelector('.tc-step-duration').textContent = '已用 ' + duration(metric.stage_elapsed_seconds);
        });
    }
    function close() {
        if (!config) return;
        opened = false; generation++; panelSession++; clearTimeout(timer); clearTimeout(debounce);
        listController?.abort(); detailController?.abort(); loading = false;
        $('replacement-tasks-modal').classList.remove('show'); document.body.classList.remove('task-center-open');
        resetSelection(); $('tc-list').textContent = ''; lastList = '';
        if (lastFocus?.isConnected) lastFocus.focus({preventScroll:true});
    }
    function open(value, initialView = 'running') {
        lastFocus = document.activeElement; kind = value; view = initialView === 'failed' ? 'failed' : 'running'; page = 1; opened = true; loading = false; panelSession++; notice();
        $('tc-search').value = ''; $('tc-status').value = 'all'; $('tc-days').value = '7';
        $('replacement-tasks-modal').classList.add('show'); document.body.classList.add('task-center-open');
        syncControls(); loadList(true); $('replacement-tasks-modal').querySelector('[data-tc-close]').focus();
    }
    function init(options) {
        config = options;
        $('replacement-tasks-modal').addEventListener('click', event => {
            const el = event.target.closest('button');
            if (event.target === $('replacement-tasks-modal') || el?.hasAttribute('data-tc-close')) return close();
            if (el?.dataset.tcKind) { kind = el.dataset.tcKind; view = 'running'; page = 1; notice(); syncControls(); return loadList(true); }
            if (el?.dataset.tcView) { view = el.dataset.tcView; page = 1; syncControls(); return loadList(true); }
            if (el?.dataset.tcRetry) return retry(el.dataset.tcRetry,el.dataset.tcRetryKind||'default');
            if (el?.dataset.tcPrioritize) return prioritize(el.dataset.tcPrioritize,el.dataset.tcPrioritizeKind);
            if (el?.dataset.tcEntry) return select(el.dataset.tcEntry).then(() => {
                if (innerWidth <= 700 && opened) $('tc-detail').scrollIntoView({block:'start',behavior:'smooth'});
            });
            if (el?.id === 'tc-prev' || el?.id === 'tc-next') { page += el.id === 'tc-next' ? 1 : -1; return loadList(true); }
            if (el?.hasAttribute('data-tc-stop')) config.stopBatch(detail.batch_id).then(() => loadList(false));
        });
        for (const id of ['tc-days','tc-status']) $(id).addEventListener('change', () => { page = 1; loadList(true); });
        const search = event => { if (event.isComposing) return; clearTimeout(debounce); debounce = setTimeout(() => {page=1;loadList(true);},250); };
        $('tc-search').addEventListener('input', search); $('tc-search').addEventListener('compositionend', search);
        document.addEventListener('visibilitychange', () => { if (opened && !document.hidden) loadList(false); else clearTimeout(timer); });
        document.addEventListener('keydown', event => {
            if (!opened) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); return close(); }
            if (event.key === 'Tab') {
                const nodes = [...$('replacement-tasks-modal').querySelectorAll('button:not(:disabled),input,select')].filter(el => el.offsetParent !== null);
                const first = nodes[0], last = nodes.at(-1);
                if (event.shiftKey && (document.activeElement === first || !nodes.includes(document.activeElement))) {event.preventDefault();last?.focus();}
                else if (!event.shiftKey && (document.activeElement === last || !nodes.includes(document.activeElement))) {event.preventDefault();first?.focus();}
            }
        }, true);
    }
    window.RHTaskCenter = {init,open,close,retry,prioritize,updateProgress(value){progress=value;if(opened)renderLive();}};
})();
