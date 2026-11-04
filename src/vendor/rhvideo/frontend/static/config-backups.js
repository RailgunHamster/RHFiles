/* Configuration JSON contains identities and preferences, never source files or credentials. */
(() => {
    'use strict';
    let config, backup=null, busy=false, controller, generation=0;
    const $=id=>document.getElementById(id);
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function controls() {
        $('config-backup-export').disabled=busy;
        $('config-backup-file').disabled=busy;
        $('config-backup-restore').disabled=busy||!backup;
    }
    async function request(action,body) {
        const token=config.getToken(),ticket=generation;controller=new AbortController();
        const response=await fetch(config.base+'/config-backups/'+action,{method:'POST',
            headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),
            cache:'no-store',signal:controller.signal});
        if(ticket!==generation||config.getToken()!==token)throw new DOMException('Session changed','AbortError');
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw Error(response.status===404?'配置备份接口需要更新后端后启用':typeof data.detail==='string'?data.detail:'备份格式无效或请求失败，请检查文件版本');
        return data;
    }
    function message(text,error=false) {
        $('config-backup-message').textContent=text;$('config-backup-message').classList.toggle('is-error',error);
    }
    function render(result) {
        const f=result.favorites,w=result.watch_folders,r=result.reading_progress;
        $('config-backup-preview').classList.remove('hidden');
        $('config-backup-preview').innerHTML=`<div class="bkp-summary"><div><span>喜爱记录</span><strong>${f.add}</strong><small>${result.applied?'已新增':'将新增'} · 已有 ${f.existing} · 未匹配 ${f.unmatched}</small></div>
            <div><span>监控目录</span><strong>${w.add}</strong><small>${result.applied?'已新增':'将新增'}（关闭监控）· 已有 ${w.existing}${w.skipped?' · 冲突 '+w.skipped:''}</small></div>
            <div><span>阅读进度</span><strong>${r.update}</strong><small>${result.applied?'已恢复':'可恢复'} · 保留较新 ${r.kept} · 未匹配 ${r.unmatched}</small></div><div><span>页面偏好</span><strong>${result.preferences}</strong><small>${result.applied?'已恢复':'可恢复'} 项</small></div></div>
            ${result.issues?.length?`<details class="bkp-issues"><summary>查看未匹配与冲突（最多显示 50 项）</summary><ul>${result.issues.map(item=>`<li><span>${esc(item.title)}</span><small>${esc(({ambiguous:'存在同名条目，未自动匹配',missing:'媒体库中尚未找到',overlap:'与已有监控目录重叠'})[item.reason]||item.reason)}</small></li>`).join('')}</ul></details><p class="bkp-note">未匹配项未写入。可在媒体导入完成后，再次用同一备份恢复；已有喜爱不会重复添加。</p>`:''}`;
    }
    async function download() {
        if(busy)return;
        busy=true;controls();const ticket=generation;message('正在整理配置记录…');
        try {
            const document=await request('export',{ui_preferences:config.getPreferences()});
            if (RHVideoHost.native) {
                const result=await RHVideoHost.saveFile(document);
                message(result.saved?'配置备份已保存。':result.requested?'已打开系统保存对话框。':'已取消保存。'); return;
            }
            const blob=new Blob([JSON.stringify(document,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob);
            const link=window.document.createElement('a');link.href=url;link.download='RHVideo-配置备份-'+new Date().toISOString().slice(0,10)+'.json';window.document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
            message(`备份已下载：${document.favorites.length} 条喜爱、${document.watch_folders.length} 个监控目录、${document.reading_progress.length} 条阅读进度。`);
        } catch(error){if(error.name!=='AbortError')message(error.message,true);}
        finally{if(ticket===generation){busy=false;controls();}}
    }
    async function preview(file=$('config-backup-file').files[0]) {
        if(busy||!file)return;
        busy=true;backup=null;controls();const ticket=generation;message('正在核对备份…');
        $('config-backup-preview').classList.add('hidden');
        try {
            if(file.size>20*1024*1024)throw Error('配置备份不能超过 20 MB，请确认选择的是 JSON 配置文件');
            const parsed=JSON.parse(await file.text());
            if(ticket!==generation)throw new DOMException('Session changed','AbortError');
            const result=await request('preview',parsed);
            backup=parsed;render(result);message('预览完成，尚未修改任何记录。确认后合并恢复。');
        } catch(error){if(error.name!=='AbortError')message(error instanceof SyntaxError?'文件不是有效的 JSON 配置备份':error.message,true);}
        finally{if(ticket===generation){busy=false;controls();}}
    }
    async function restore() {
        if(busy||!backup)return;
        busy=true;controls();const ticket=generation;message('正在恢复配置记录…');
        try {
            const result=await request('restore',backup);
            let preferencesSaved=true;
            try {config.applyPreferences(result.ui_preferences||{});} catch(_){preferencesSaved=false;}
            config.onRestored?.();render(result);backup=null;
            message(preferencesSaved?'恢复完成。现有喜爱已保留；新增监控目录需手动开启，阅读器偏好下次打开时应用。':'记录已恢复，但浏览器未能保存全部页面偏好，请检查浏览器存储空间。',!preferencesSaved);
        } catch(error){if(error.name!=='AbortError')message(error.message,true);}
        finally{if(ticket===generation){busy=false;controls();}}
    }
    function reset() {
        generation++;controller?.abort();backup=null;busy=false;$('config-backup-file').value='';
        $('config-backup-preview').textContent='';$('config-backup-preview').classList.add('hidden');message('');controls();
    }
    function init(options) {
        config=options;$('config-backup-export').addEventListener('click',download);
        $('config-backup-file').addEventListener('change',()=>preview());
        $('config-backup-restore').addEventListener('click',restore);controls();
    }
    window.RHConfigBackups={init,download,preview,restore,reset};
})();
