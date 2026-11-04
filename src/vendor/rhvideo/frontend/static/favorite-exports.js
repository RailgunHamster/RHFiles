/* Favorite export jobs belong to the backend. Closing this dialog only stops polling. */
(() => {
    'use strict';
    let config, dialog, timer, generation=0, controller, busy=false, loading=false, pending, selection=[], jobs=[];
    const $=id=>document.getElementById(id);
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const active=job=>['queued','running'].includes(job.status);
    const bytes=value=>{let n=Number(value||0),u=0;while(n>=1024&&u<4){n/=1024;u++;}return n.toFixed(u?1:0)+' '+['B','KB','MB','GB','TB'][u];};
    function requestId() {
        // randomUUID is unavailable on plain-HTTP tailnet hostnames.
        if(crypto.randomUUID)return crypto.randomUUID();
        const value=crypto.getRandomValues(new Uint8Array(16));value[6]=(value[6]&15)|64;value[8]=(value[8]&63)|128;
        const hex=[...value].map(byte=>byte.toString(16).padStart(2,'0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }
    function controls() {
        $('favorite-export-submit').disabled=busy||loading||($('favorite-export-filtered').checked&&!selection.length);
        $('favorite-export-all').disabled=busy||loading;
        $('favorite-export-filtered').disabled=busy||loading;
        dialog.querySelectorAll('[data-export-cancel],[data-export-download]').forEach(button=>button.disabled=busy||(button.hasAttribute('data-export-cancel')&&jobs.find(job=>job.id===button.closest('[data-export-id]').dataset.exportId)?.cancel_requested));
    }
    async function request(path='',method='GET',body) {
        const token=config.getToken(),ticket=generation;
        const response=await fetch(config.base+'/favorite-exports'+path,{
            method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
            body:body?JSON.stringify(body):undefined,cache:'no-store',signal:controller.signal,
        });
        if(ticket!==generation||config.getToken()!==token||!dialog.open)throw new DOMException('Session changed','AbortError');
        if(!response.ok){const result=await response.json().catch(()=>({}));throw Error(response.status===404?'导出接口需要更新后端后启用':typeof result.detail==='string'?result.detail:'导出请求失败，请稍后重试');}
        return await response.json();
    }
    function render() {
        // Avoid replacing focused action buttons every second while a job progresses.
        const focus=document.activeElement,focusId=focus?.closest('[data-export-id]')?.dataset.exportId;
        const action=focus?.hasAttribute('data-export-download')?'download':focus?.hasAttribute('data-export-cancel')?'cancel':null;
        $('favorite-export-jobs').innerHTML=jobs.length?jobs.map(job=>{
            const p=job.progress||{},percent=Math.min(100,Math.max(0,Number(p.percent)||0));
            const label=job.cancel_requested&&active(job)?'正在取消':({queued:'等待打包',running:'正在打包',completed:'可以下载',failed:'导出失败',cancelled:'已取消',expired:'已过期'}[job.status]||job.status);
            const date=new Date(job.created_at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
            return `<article class="fe-job" data-export-id="${esc(job.id)}"><div class="fe-job-top"><span class="fe-file-icon">ZIP</span><div class="fe-job-title"><strong>喜爱文件 · ${Number(job.total)||0} 项</strong><span>${esc(date)} · ${esc(label)}</span></div><div class="fe-job-actions">
                ${job.can_download?`<button type="button" class="btn" data-export-download>下载 ${bytes(job.archive_bytes)}</button>`:active(job)?`<button type="button" class="btn btn-secondary" data-export-cancel ${job.cancel_requested?'disabled':''}>取消</button>`:''}</div></div>
                ${job.status==='running'?`<div class="fe-progress"><progress value="${percent}" max="100" aria-label="打包进度"></progress><b>${percent.toFixed(1)}%</b></div><div class="fe-current" title="${esc(p.current)}">${esc(p.current||'正在准备文件…')}</div>`:''}
                <div class="fe-job-info">${job.status==='running'?`${bytes(p.bytes_done)} / ${bytes(p.bytes_total)} · 已检查 ${Number(p.done)||0}/${Number(job.total)||0} 项`:job.status==='completed'?`已打包 ${Number(p.included)||0} 项${p.skipped?' · 缺失跳过 '+Number(p.skipped)+' 项（详见包内清单）':''} · 保留至 ${esc(new Date(job.expires_at).toLocaleString('zh-CN'))}`:job.status==='expired'?'临时压缩包已自动清理，可重新导出':job.status==='queued'?'在后台独立排队，关闭或刷新页面后仍会继续':''}</div>
                ${job.error_message?`<p class="fe-job-error">${esc(job.error_message)}</p>`:''}</article>`;
        }).join(''):'<div class="fe-empty">还没有导出任务<br><span>选择范围后，即可在后台生成 ZIP 压缩包</span></div>';
        if(action&&focusId)dialog.querySelector(`[data-export-id="${CSS.escape(focusId)}"] [data-export-${action}]`)?.focus({preventScroll:true});
        controls();
    }
    function schedule() {
        clearTimeout(timer);
        if(dialog.open&&!document.hidden)timer=setTimeout(refresh,jobs.some(active)?1000:10000);
    }
    async function refresh() {
        if(busy||!dialog.open||document.hidden)return;
        try {jobs=(await request()).items||[];render();$('favorite-export-error').textContent='';}
        catch(error){if(error.name!=='AbortError')$('favorite-export-error').textContent=error.message;}
        finally{schedule();}
    }
    async function submit() {
        if(busy||$('favorite-export-submit').disabled)return;
        const selected=$('favorite-export-filtered').checked?selection:null;
        const key=JSON.stringify(selected);
        pending=pending?.key===key?pending:{key,body:{request_id:requestId(),...(selected?{selection:selected}:{})}};
        clearTimeout(timer);busy=true;controls();
        const ticket=generation;
        try {
            const job=await request('','POST',pending.body);
            jobs=[job,...jobs.filter(item=>item.id!==job.id)].slice(0,20);pending=null;render();
            $('favorite-export-error').textContent='';
        } catch(error){if(error.name!=='AbortError')$('favorite-export-error').textContent=error.message+'；可重新提交确认，同一请求不会重复打包';}
        finally {if(ticket===generation){busy=false;controls();schedule();}}
    }
    async function cancel(id) {
        if(busy)return;
        clearTimeout(timer);busy=true;controls();const ticket=generation;
        try {const job=await request('/'+encodeURIComponent(id),'DELETE');jobs=jobs.map(item=>item.id===id?job:item);render();$('favorite-export-error').textContent='';}
        catch(error){if(error.name!=='AbortError')$('favorite-export-error').textContent=error.message;}
        finally{if(ticket===generation){busy=false;controls();schedule();}}
    }
    async function download(id) {
        if(busy)return;
        busy=true;controls();const ticket=generation;
        try {
            if (RHVideoHost.native) { await RHVideoHost.download(id); return; }
            const grant=await request('/'+encodeURIComponent(id)+'/download-ticket','POST');
            // Native navigation streams to disk; fetch(...).blob() would buffer huge videos.
            const url=new URL(grant.url,location.href);
            if(url.origin!==location.origin)throw Error('下载地址无效');
            const link=document.createElement('a');link.href=url.href;link.download='';document.body.append(link);link.click();link.remove();
            $('favorite-export-error').textContent='';
        } catch(error){if(error.name!=='AbortError')$('favorite-export-error').textContent=error.message;}
        finally{if(ticket===generation){busy=false;controls();schedule();}}
    }
    async function open() {
        if(dialog.open)return;
        generation++;controller=new AbortController();busy=false;loading=true;const ticket=generation;
        dialog.showModal();controls();$('favorite-export-error').textContent='';
        try {const items=await config.getSelection();if(ticket!==generation)return;selection=items;}
        catch(error){if(ticket!==generation)return;selection=[];$('favorite-export-error').textContent=error.message;}
        if(!dialog.open||ticket!==generation)return;
        loading=false;
        $('favorite-export-count').textContent=selection.length+' 项，包含所有页';
        $('favorite-export-filtered').checked=!!selection.length;
        $('favorite-export-all').checked=!selection.length;
        controls();refresh();
    }
    function close() {
        generation++;clearTimeout(timer);controller?.abort();busy=false;loading=false;dialog.close();
    }
    function init(options) {
        config=options;dialog=$('favorite-export-dialog');
        dialog.addEventListener('click',event=>{
            const button=event.target.closest('button'),id=button?.closest('[data-export-id]')?.dataset.exportId;
            if(button?.hasAttribute('data-export-close'))return close();
            if(button?.hasAttribute('data-export-submit'))return submit();
            if(button?.hasAttribute('data-export-cancel'))return cancel(id);
            if(button?.hasAttribute('data-export-download'))return download(id);
            if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}
        });
        dialog.addEventListener('change',controls);
        dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
        document.addEventListener('keydown',event=>{if(dialog.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}},true);
        document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else if(dialog.open)refresh();});
    }
    window.RHFavoriteExports={init,open,close,refresh,submit,cancel,download,reset(){close();pending=null;jobs=[];selection=[];$('favorite-export-jobs').textContent='';}};
})();
