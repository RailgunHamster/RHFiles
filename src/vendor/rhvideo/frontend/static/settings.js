/* Settings commands submit durable backend requests; the browser only observes. */
(() => {
    'use strict';
    let config, opened=false, timer, controller, generation=0, lastFocus, pending, busy=false, state, signature='';
    const $=id=>document.getElementById(id);
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const active=new Set(['created','preparing','waiting','restarting','verifying']);
    const modeLabel=mode=>({all:'等待全部任务完成',immediate:'直接重启',replacement:'本次原片替换后重启',current:'当前处理项后重启'}[mode]||'服务重启');
    function controls() {
        const blocked=busy||!state?.supported||!state?.can_manage||active.has(state?.restart?.phase);
        document.querySelectorAll('[data-restart-mode]').forEach(el=>el.disabled=blocked);
        const cancelButton=$('settings-cancel-restart');
        if(cancelButton)cancelButton.disabled=busy;
    }
    function render(data) {
        state=data;controls();
        $('settings-connection').textContent='已连接';$('settings-connection').classList.remove('is-error');
        $('settings-error').textContent=!data.can_manage?'仅管理员或初始账户可管理服务':!data.supported?'当前运行方式不支持网页重启':'';
        const item=data.restart, key=JSON.stringify(item);
        if(key===signature)return;
        const focused=document.activeElement?.hasAttribute('data-restart-cancel');
        signature=key;
        if(!item){$('settings-restart-status').innerHTML='<span class="settings-idle-dot"></span><div><strong>服务正常运行</strong><p>目前没有重启安排</p></div>';return;}
        const counts=item.queue_counts;
        $('settings-restart-status').innerHTML=`<span class="settings-state-icon ${item.phase==='completed'?'is-done':''}">${item.phase==='completed'?'✓':active.has(item.phase)?'↻':'·'}</span><div><strong>${esc(modeLabel(item.mode))}</strong><p>${esc(item.message)}</p>
            ${counts?`<div class="settings-queue-counts"><span>默认压缩 <b>${Number(counts.default_pending||0)+Number(counts.default_running||0)}</b></span><span>原片替换 <b>${Number(counts.replacement_pending||0)+Number(counts.replacement_running||0)}</b></span>${'export_pending' in counts?`<span>喜爱导出 <b>${Number(counts.export_pending||0)+Number(counts.export_running||0)}</b></span>`:''}${'duplicate_scan_pending' in counts?`<span>重复检测 / 复核 <b>${['duplicate_scan_pending','duplicate_scan_running','duplicate_review_pending','duplicate_review_running','duplicate_batch_pending','duplicate_batch_running'].reduce((sum,key)=>sum+Number(counts[key]||0),0)}</b></span>`:''}</div>`:''}</div>
            ${item.can_cancel&&data.can_manage?'<button id="settings-cancel-restart" type="button" class="btn btn-secondary" data-restart-cancel>取消安排</button>':''}`;
        controls();
        if(focused)$('settings-restart-status').querySelector('[data-restart-cancel]')?.focus({preventScroll:true});
        if(pending?.request_id===item.request_id)pending=null;
    }
    async function request(method='GET',body) {
        controller?.abort();controller=new AbortController();
        const ticket=++generation,token=config.getToken();
        const response=await fetch(config.base+'/system/restart'+(method==='DELETE'?'/'+encodeURIComponent(state.restart.id):''),{
            method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
            body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store',
        });
        if(ticket!==generation||!opened||config.getToken()!==token)throw new DOMException('Session changed','AbortError');
        if(!response.ok){const detail=await response.json().catch(()=>({}));throw Error(response.status===404?'设置接口将在本次服务更新后启用':detail.detail||'服务暂时无法连接');}
        return await response.json();
    }
    function schedule() {clearTimeout(timer);if(opened&&!document.hidden)timer=setTimeout(refresh,active.has(state?.restart?.phase)?1500:5000);}
    async function refresh() {
        if(!opened||busy||document.hidden)return;
        try {render(await request());}
        catch(error){if(error.name!=='AbortError'){$('settings-connection').textContent='正在重连';$('settings-connection').classList.add('is-error');$('settings-error').textContent=error.message;}}
        finally{schedule();}
    }
    async function submit(mode) {
        if(busy)return;
        clearTimeout(timer);busy=true;controls();
        pending=pending?.mode===mode?pending:{mode,request_id:crypto.randomUUID()};
        try {render(await request('POST',pending));}
        catch(error){if(error.name!=='AbortError'){$('settings-error').textContent=error.message+'；重连后可查看提交结果';$('settings-connection').textContent='正在确认';}}
        finally{busy=false;controls();schedule();}
    }
    async function cancel() {
        if(busy||!state?.restart?.can_cancel)return;
        clearTimeout(timer);busy=true;controls();
        try {render(await request('DELETE'));}
        catch(error){if(error.name!=='AbortError')$('settings-error').textContent=error.message+'；取消尚未确认，请重连后查看安排状态';}
        finally{busy=false;controls();schedule();}
    }
    function close() {
        opened=false;generation++;clearTimeout(timer);controller?.abort();busy=false;
        $('settings-modal').classList.remove('show');document.body.classList.remove('settings-open');
        if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
    }
    function open() {
        lastFocus=document.activeElement;opened=true;
        $('settings-modal').classList.add('show');document.body.classList.add('settings-open');
        $('settings-modal').querySelector('[data-settings-close]').focus();controls();refresh();
    }
    function init(options) {
        config=options;
        $('settings-modal').addEventListener('click',event=>{
            const button=event.target.closest('button');
            if(event.target===$('settings-modal')||button?.hasAttribute('data-settings-close'))return close();
            if(button?.dataset.restartMode)return submit(button.dataset.restartMode);
            if(button?.hasAttribute('data-restart-cancel'))return cancel();
        });
        document.addEventListener('keydown',event=>{
            if(!opened)return;
            if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}
            if(event.key==='Tab'){
                const nodes=[...$('settings-modal').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(el=>el.offsetParent!==null),first=nodes[0],last=nodes.at(-1);
                if(event.shiftKey&&(document.activeElement===first||!nodes.includes(document.activeElement))){event.preventDefault();last?.focus();}
                else if(!event.shiftKey&&(document.activeElement===last||!nodes.includes(document.activeElement))){event.preventDefault();first?.focus();}
            }
        },true);
        document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);controller?.abort();}else if(opened)refresh();});
    }
    window.RHSettings={init,open,close,refresh,submit,cancel,reset(){close();state=null;signature='';pending=null;$('settings-restart-status').textContent='';$('settings-error').textContent='';}};
})();
