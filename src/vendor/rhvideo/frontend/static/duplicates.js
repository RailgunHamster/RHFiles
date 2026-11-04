/* Explicit scans and confirmed review jobs are owned by the backend, including after refresh. */
(() => {
    'use strict';
    let config,visible=false,generation=0,timer,controller,kind='all',page=1,pages=1,groups=[],state=null,listSignature='',jobSignature='',busy=false,pendingScan;
    let reviewId='',reviewPage=1,reviewPages=1,statusTicket=0,listTicket=0,actionError='',listError='',listController,statusController,sort='similarity';
    const choices=new Map(),choiceMeta=new Map(),saving=new Set(),pending=new Map(),submitting=new Set(),favoriting=new Set(),previews=new Map();
    let batchBusy=false,pendingBatch=null,choicesPage=1,choicesPages=1,reviewMode='single',reviewParent=null,viewMode='scroll',nextCursor=null,feedReady=false,feedLoading=false,feedTotal=0,knownVersion=null,selectionChanged=false,backendMismatch=false;
    const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const active=job=>['queued','running'].includes(job?.status);
    const bytes=value=>{let n=Number(value||0),i=0;while(n>=1024&&i<4){n/=1024;i++;}return n.toFixed(i?1:0)+' '+['B','KB','MB','GB','TB'][i];};
    const labels={rejected:'需重新选择',queued:'排队中',running:'处理中',completed:'已完成',partial:'部分完成',failed:'未完成',cancelled:'已取消',pending:'等待',done:'已暂存'};
    const backendMessage='服务更新尚未完成，请重启服务后再使用多项保留和新的检测规则；已保存的选择和后台任务会保留。';
    function backendReady() {return !backendMismatch&&typeof state?.selection_summary?.keep_total==='number';}
    function requireBackend() {if(backendReady())return true;actionError=backendMessage;error();return false;}
    function uuid() {const a=crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;const h=[...a].map(v=>v.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
    async function request(path='',method='GET',body,signal) {
        const token=config.getToken(),ticket=generation;
        const local=new AbortController(),parents=[controller?.signal,signal].filter(Boolean),abort=()=>local.abort();let timedOut=false;
        for(const parent of parents){parent.addEventListener('abort',abort,{once:true});if(parent.aborted)local.abort();}
        const timeout=setTimeout(()=>{timedOut=true;local.abort();},10000);
        try {
            const response=await fetch(config.base+'/duplicates'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:local.signal,cache:'no-store'});
            let data;
            try {data=await response.json();}catch(e){if(local.signal.aborted)throw e;data={};}
            if(ticket!==generation||token!==config.getToken())throw new DOMException('Session changed','AbortError');
            if(!response.ok){
                const issues=data.details||data.detail;
                if(response.status===422&&body?.keeper_keys&&Array.isArray(issues)&&issues.some(i=>i.loc?.includes('keeper_key'))){backendMismatch=true;throw Error(backendMessage);}
                const message=typeof data.detail==='string'?data.detail:response.status===422?'提交参数未通过校验，请刷新页面后重试':typeof data.message==='string'?data.message:`请求失败（HTTP ${response.status}），请稍后重试`;
                throw Error(response.status===404&&message==='Not Found'?'疑似重复接口需要更新后端后启用':message);
            }
            return data;
        } catch(e) {
            if(ticket!==generation||parents.some(parent=>parent.aborted)||token!==config.getToken())throw new DOMException('Session changed','AbortError');
            if(timedOut)throw Error(path.startsWith('/groups')?'列表加载超时，请重试；已保存选择和后台任务不受影响':'连接超时，正在重新读取进度；页面超时不会取消后台任务');
            throw e;
        } finally {clearTimeout(timeout);for(const parent of parents)parent.removeEventListener('abort',abort);}
    }
    function error(value='') {$('dup-error').textContent=value||listError||(state&&!backendReady()?backendMessage:'');}
    function actionFailure(e) {if(e.name!=='AbortError'){actionError=e.message;error(actionError);}}
    function controls() {
        $('dup-sort').disabled=!state?.features?.sorting;
        $('dup-scan').disabled=!backendReady()||busy||active(state?.scan)||state?.reviews?.some(active)||state?.batches?.some(active);
        $('dup-scan').textContent=busy?'提交中…':state?.scan?'更新检测':'开始检测';
        $('dup-cancel-scan').classList.toggle('hidden',!state?.scan?.can_cancel);
        $('dup-cancel-scan').disabled=busy||state?.scan?.cancel_requested;
        $('dup-prev').disabled=page<=1;$('dup-next').disabled=page>=pages;
        feedControls();selectionControls();error(actionError);
        document.querySelectorAll('[data-dup-kind]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.dupKind===kind)));
    }
    function selectionControls() {
        const summary=state?.selection_summary||{},ready=Number(summary.ready||0),total=Number(summary.total||0);
        $('dup-choice-bar').classList.toggle('hidden',!total&&!saving.size&&!batchBusy);
        $('dup-choice-count').textContent=`已保存 ${total} 组选择`;
        $('dup-choice-description').textContent=`本次保留 ${Number(summary.keep_total??ready)} 项，其余 ${Number(summary.remove_total||0)} 项移入 30 天暂存区`+(summary.reserved?` · ${summary.reserved} 组已提交后台`:'')+(summary.stale?` · ${summary.stale} 组结果已更新，需重新选择`:'');
        $('dup-choice-saving').textContent=saving.size?`正在保存 ${saving.size} 组…`:batchBusy?'正在提交…':selectionChanged?'选择已在其他页面变化，请重新载入':'选择已保存';
        $('dup-confirm-all').disabled=!backendReady()||!ready||!!saving.size||batchBusy||selectionChanged||active(state?.scan);
        $('dup-confirm-all').textContent=batchBusy?'提交中…':`统一确认 ${ready} 组`;
    }
    function renderState() {
        const scan=state?.scan,p=scan?.progress||{},percent=p.total?Math.min(100,p.done/p.total*100):0;
        const phases={preparing:'准备检测列表',indexing:'检测文件',validating:'核对文件变更',grouping:'比对画面特征',publishing:'保存分组结果'};
        const staged=p.phase&&p.phase!=='indexing'&&active(scan),done=staged?p.phase_done:p.done,total=staged?p.phase_total:p.total;
        const count=total?` · ${Number(done||0)} / ${Number(total)} 项`:staged?` · ${p.phase==='preparing'?'已准备':p.phase==='validating'?'已核对':'已处理'} ${Number(done||0)} 项`:'';
        const progressValue=staged?(total?Math.min(100,(done||0)/total*100):null):percent;
        $('dup-scan-state').innerHTML=!scan?'<span class="dup-idle-dot"></span><div><strong>建立画面指纹，找出极高相似项</strong><p>首次检测在后台运行，之后更新会复用未变动文件的指纹。</p></div>':`<div class="dup-scan-copy"><strong>${esc(scan.cancel_requested&&active(scan)?'正在取消':labels[scan.status]||scan.status)}${active(scan)&&phases[p.phase]?' · '+phases[p.phase]:''}${esc(count)}</strong><p>${esc(p.current||p.error||(p.phase==='completed'?`新建指纹 ${p.indexed||0} · 复用 ${p.reused||0} · 跳过 ${p.skipped||0}`:'关闭页面后仍由后台继续'))}</p>${active(scan)?`<progress max="100" ${progressValue!==null?`value="${progressValue}"`:''} aria-label="检测进度"></progress>`:''}${p.skipped?'<small>处理中、不可读或纯色黑屏首帧会跳过，可稍后更新检测。</small>':''}</div>`;
        const signature=JSON.stringify([state?.reviews||[],state?.batches||[]]);
        if(signature!==jobSignature){jobSignature=signature;$('dup-review-jobs').innerHTML=(state?.batches||[]).map(job=>`<button type="button" class="dup-review-job dup-batch-job" data-dup-batch-review="${esc(job.id)}"><span class="dup-job-dot ${active(job)?'is-active':''}"></span><span><strong>批量保留 · ${job.total} 组</strong><small>${esc(labels[job.status]||job.status)} · 已处理 ${job.done} / ${job.total} 组${job.failed?' · 未完成 '+job.failed+' 组':''}</small></span><span class="dup-job-open">查看批量结果 ↗</span></button>`).join('')+(state?.reviews||[]).map(job=>`<button type="button" class="dup-review-job" data-dup-review="${esc(job.id)}"><span class="dup-job-dot ${active(job)?'is-active':''}"></span><span><strong>保留 ${Number(job.keeper_count||1)} 项 · 暂存 ${Number(job.total)} 项</strong><small>${esc(labels[job.status]||job.status)} · 已暂存 ${Number(job.done)}${job.failed?' · 未完成 '+Number(job.failed):''}</small></span><span class="dup-job-open">查看结果 ↗</span></button>`).join('');}
        $('dup-review-history').classList.toggle('hidden',!state?.reviews?.length&&!state?.batches?.length);controls();
    }
    const selectedKeys=value=>value?.keeper_keys||(value?.keeper_key?[value.keeper_key]:[]);
    function groupKeys(group) {return choiceMeta.get(group.id)?.scan_id&&choiceMeta.get(group.id).scan_id!==group.scan_id?[]:choices.get(group.id)||[];}
    function keeperLabel(value) {const keepers=value?.keepers||[{key:value?.keeper_key,filename:value?.filename||''}],names=keepers.slice(0,3).map(k=>k.filename).filter(Boolean);return (keepers.length>1?keepers.length+' 项：':'')+names.join('、')+(keepers.length>3?' 等':'');}
    function memberMarkup(group,item) {
        const keepers=groupKeys(group),chosen=keepers.includes(item.key),deleting=keepers.length&&!chosen;
        return `<article class="dup-member${chosen?' is-keeper':deleting?' is-delete':''}"><button type="button" class="dup-preview" data-image-preview data-preview-title="${esc(item.filename)}" aria-label="放大预览 ${esc(item.filename)}"><img data-dup-preview="${esc(item.preview_url)}" alt="${esc(item.filename)}" loading="lazy" decoding="async"><span>${group.media_type==='video'?'首帧':'图片'}${chosen?' · 保留':deleting?' · 待暂存':''}</span></button>
            <div class="dup-member-body"><div class="dup-member-title"><strong title="${esc(item.filename)}">${esc(item.filename)}</strong><button type="button" class="dup-favorite${item.favorite?' is-favorite':''}" data-dup-favorite="${esc(item.key)}" aria-pressed="${!!item.favorite}" aria-label="${item.favorite?'取消收藏':'收藏'} ${esc(item.filename)}" title="${item.favorite?'取消收藏':'收藏'}" ${favoriting.has(item.key)?'disabled':''}>${item.favorite?'★':'☆'}</button></div><p title="${esc(item.source_path||item.folder_label)}">${esc(item.folder_label||item.source_path||'未分类')}</p><div class="dup-facts"><span>${bytes(item.size)}</span>${item.modified_at?`<span title="文件时间：${esc(new Date(item.modified_at).toLocaleString())}">${esc(new Date(item.modified_at).toLocaleDateString())}</span>`:''}<span>${esc(item.resolution||'')}</span>${item.duration_seconds!=null?`<span>${Math.round(item.duration_seconds)} 秒</span>`:''}</div>
            ${item.busy?'<small class="dup-busy">正在处理 / 已排队替换</small>':''}<div class="dup-member-actions"><button type="button" class="btn btn-secondary" data-dup-keep="${esc(item.key)}" data-dup-group="${group.id}" aria-pressed="${chosen}" ${!backendReady()||group.stale||batchBusy||saving.has(group.id)||group.review_pending||submitting.has(group.id)||state?.reviews?.some(j=>j.group_id===group.id&&active(j))?'disabled':''}>${chosen?'✓ 已选保留':'保留此项'}</button>${item.media_type==='video'?`<button type="button" class="dup-play" data-dup-play="${esc(item.id)}">播放核对</button>`:''}</div></div></article>`;
    }
    function renderGroups() {
        $('dup-groups').innerHTML=groups.length?groups.map((group,index)=>{
            const selected=groupKeys(group),chosen=selected.length?choiceMeta.get(group.id):null,removeCount=Math.max(0,group.member_count-selected.length),locked=batchBusy||saving.has(group.id)||group.review_pending||submitting.has(group.id)||state?.reviews?.some(j=>j.group_id===group.id&&active(j));
            return `<section class="dup-group" data-dup-id="${group.id}"><header><span class="dup-group-mark">${String(viewMode==='scroll'?index+1:(page-1)*6+index+1).padStart(2,'0')}</span><div><h3>${group.media_type==='video'?'视频画面与时长相似':'图片相似'} <span>${group.member_count} 项${group.total_size!=null?' · 共 '+bytes(group.total_size):''}</span></h3><p>${group.media_type==='video'?(group.metrics?.method==='frame_duration_v1'?'首帧画面 80% ＋ 时长 20%；同封面、同长度仍可能是不同内容':'早期结果仅比较首帧，请更新检测以计入时长'):'支持尺寸、压缩格式不同的近似画面'}</p></div><span class="dup-similarity">${Number(group.similarity).toFixed(1)}<small>% 匹配</small></span></header>
                ${group.media_type==='video'&&group.metrics?.method==='frame_duration_v1'?`<div class="dup-evidence"><span>首帧相似 <b>${Number(group.metrics.visual_similarity).toFixed(1)}%</b></span><span>时长相似 <b>${group.metrics.duration_similarity==null?'未完整读取':Number(group.metrics.duration_similarity).toFixed(1)+'%'}</b></span>${group.metrics.duration_max!=null?`<span>${group.metrics.duration_complete?'':'已知时长 '}${Number(group.metrics.duration_min).toFixed(1)}–${Number(group.metrics.duration_max).toFixed(1)} 秒</span>`:''}${!group.metrics.duration_complete?'<span>部分时长缺失，评分已限制为 98.5%</span>':''}</div>`:''}${group.stale?'<p class="dup-stale">文件或分组内容已变化，请更新检测后再复核。</p>':''}<div class="dup-members">${group.members.items.map(item=>memberMarkup(group,item)).join('')}</div>
                <div class="dup-group-tools">${group.members.items.length<group.member_count?`<button type="button" class="dup-more" data-dup-more="${group.id}">查看更多（还有 ${group.member_count-group.members.items.length} 项）</button>`:''}<button type="button" class="dup-ignore" data-dup-ignore="${group.id}" ${locked?'disabled':''}>确认不是重复，以后忽略</button></div>
                ${chosen?`<footer class="dup-confirm"><div><strong>保留 ${esc(keeperLabel(chosen))}</strong><span>${removeCount?`其余 ${removeCount} 项移入暂存区，30 天内可恢复。`:'全部保留，不移动任何文件。'}</span></div><button type="button" class="dup-cancel-choice" data-dup-unchoose="${group.id}" ${locked?'disabled':''}>取消选择</button><button type="button" class="btn" data-dup-confirm="${group.id}" ${!backendReady()||locked||group.stale?'disabled':''}>${!backendReady()?'等待服务更新':locked?'后台处理中…':removeCount?'确认暂存其余 '+removeCount+' 项':'确认全部保留'}</button></footer>`:''}</section>`;
        }).join(''):`<div class="dup-empty"><span>◇</span><strong>${state?.scan?.status==='completed'?'当前没有待复核的高相似组':'开始检测后，在这里复核疑似重复项'}</strong><p>按图片或视频首帧比对；选择保留项后，再确认暂存其余项。</p></div>`;
        loadPreviews();controls();
    }
    const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);previewQueue.push(entry.target);}pumpPreviews();},{rootMargin:'150px'});
    const previewQueue=[];let previewRunning=0;
    function loadPreviews() {observer.disconnect();previewQueue.length=0;document.querySelectorAll('#dup-groups img[data-dup-preview],#dup-rules-dialog[open] img[data-dup-preview]').forEach(img=>{const cached=previews.get(img.dataset.dupPreview);if(cached)img.src=cached;else observer.observe(img);});}
    function pumpPreviews() {
        while(previewRunning<4&&previewQueue.length){
            const img=previewQueue.shift();if(!img.isConnected||!visible)continue;
            const path=img.dataset.dupPreview,token=config.getToken(),ticket=generation;previewRunning++;
            fetch(path,{headers:{Authorization:'Bearer '+token},signal:controller?.signal}).then(response=>{if(!response.ok)throw Error();return response.blob();}).then(blob=>{
                if(ticket!==generation||token!==config.getToken()||!visible)return;
                const url=previews.get(path)||URL.createObjectURL(blob);previews.set(path,url);if(img.isConnected)img.src=url;
                while(previews.size>128){const [key,value]=previews.entries().next().value;URL.revokeObjectURL(value);previews.delete(key);}
            }).catch(()=>{}).finally(()=>{previewRunning--;pumpPreviews();});
        }
    }
    function modeKey() {
        try {const payload=config.getToken().split('.')[1];const sub=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/'))).sub;return typeof sub==='string'&&sub?'rhvideo.duplicate-mode.'+sub:null;}catch(_){return null;}
    }
    function resetFeed() {listTicket++;listController?.abort();listError='';feedReady=false;feedLoading=false;nextCursor=null;page=1;listSignature='';groups=[];}
    function feedControls() {
        $('dup-groups').dataset.viewMode=viewMode;
        $('dup-pagination').classList.toggle('hidden',viewMode!=='pages');$('dup-scroll-loader').classList.toggle('hidden',viewMode!=='scroll');
        document.querySelectorAll('[data-dup-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.dupMode===viewMode)));
        $('dup-load-more').disabled=feedLoading||!nextCursor;
        $('dup-load-more').classList.toggle('hidden',feedReady&&!nextCursor);
        $('dup-scroll-status').textContent=feedLoading?'正在加载…':feedReady?`已加载 ${groups.length} / ${feedTotal} 组`+(nextCursor?' · 向下滚动继续':' · 已全部载入'):'';
    }
    async function setMode(mode) {
        if(!['scroll','pages'].includes(mode)||mode===viewMode)return;
        viewMode=mode;try{const key=modeKey();if(key)RHVideoHost.storage.setItem(key,mode);}catch(_){}
        resetFeed();feedControls();await loadGroups();
    }
    async function setSort(value) {
        if(!state?.features?.sorting){actionError='排序功能需要更新后端后启用';error();return;}
        if(!['similarity','time_asc','time_desc','size_asc','size_desc'].includes(value))return;
        sort=value;$('dup-sort').value=value;try{const key=modeKey();if(key)RHVideoHost.storage.setItem(key+'.sort',value);}catch(_){}
        resetFeed();feedControls();await loadGroups();
    }
    async function loadGroups(append=false) {
        if(append&&(feedLoading||!nextCursor||viewMode!=='scroll'))return;
        listController?.abort();const list=new AbortController();listController=list;
        const ticket=++listTicket,params=new URLSearchParams({kind,page:viewMode==='scroll'?1:page,limit:6,sort});
        if(append)params.set('after',nextCursor);
        feedLoading=true;feedControls();
        try {
            const data=await request('/groups?'+params,'GET',undefined,list.signal);
            if(ticket!==listTicket)return;
            listError='';
            page=data.page;pages=data.pages;feedTotal=data.total;nextCursor=data.next_cursor||null;feedReady=true;
            $('dup-page').textContent=`${page} / ${pages}`;$('dup-total').textContent=data.total+' 组疑似重复';
            const signature=JSON.stringify(data);
            if(append||signature!==listSignature){listSignature=signature;
                const incoming=data.items||[];
                for(const group of incoming)if(!saving.has(group.id)){
                    if(group.selection){choices.set(group.id,selectedKeys(group.selection));choiceMeta.set(group.id,group.selection);}
                    else{choices.delete(group.id);choiceMeta.delete(group.id);}
                }
                if(append){const seen=new Set(groups.map(g=>g.id));groups.push(...incoming.filter(g=>!seen.has(g.id)));}else groups=incoming;
                renderGroups();
            }
        }catch(e){if(ticket===listTicket&&e.name!=='AbortError'){listError=e.message;error(actionError);}}
        finally{if(ticket===listTicket){feedLoading=false;feedControls();controls();}}
    }
    function loadMore() {return loadGroups(true);}
    async function ignore(groupId) {
        const group=groups.find(g=>g.id===groupId);if(!group||group.review_pending)return;
        try{await request('/groups/'+groupId+'/ignore','POST',{scan_id:group.scan_id});choices.delete(groupId);choiceMeta.delete(groupId);await reloadGroups();window.RHDuplicateRules?.refresh();}
        catch(e){actionFailure(e);}
    }
    function reloadGroups() {actionError='';error();knownVersion=null;selectionChanged=false;resetFeed();feedControls();return refresh();}
    const feedObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&visible&&viewMode==='scroll'&&feedReady&&nextCursor&&!feedLoading)loadMore();},{rootMargin:'300px'});
    function play(id) {const item=groups.flatMap(g=>g.members.items).find(i=>i.media_type==='video'&&i.id===id);if(item)config.play(item);}
    async function refresh() {
        if(!visible||document.hidden)return;
        clearTimeout(timer);
        statusController?.abort();const poll=new AbortController();statusController=poll;
        const ticket=++statusTicket;
        try {
            const wasReady=backendReady(),previous=state?.scan,value=await request('','GET',undefined,poll.signal);if(ticket!==statusTicket)return;state=value;backendMismatch=typeof value.selection_summary?.keep_total!=='number';if(backendReady()&&actionError===backendMessage)actionError='';if(knownVersion&&knownVersion!==value.selection_summary?.version)selectionChanged=true;if(!knownVersion)knownVersion=value.selection_summary?.version;renderState();if(wasReady!==backendReady())renderGroups();
            if(value.scan?.status==='completed'&&(previous?.id!==value.scan.id||previous?.status!=='completed'))resetFeed();
            if((viewMode==='pages'||!feedReady)&&!feedLoading)await loadGroups();
            error(actionError);
        }
        catch(e){if(ticket===statusTicket&&e.name!=='AbortError')error(e.message);}
        finally{if(ticket===statusTicket&&visible&&!document.hidden)timer=setTimeout(refresh,active(state?.scan)||state?.reviews?.some(active)||state?.batches?.some(active)?1000:10000);}
    }
    async function scan() {
        if(!requireBackend()||busy)return;busy=true;controls();pendingScan=pendingScan||uuid();actionError='';
        try {const scan=await request('/scans','POST',{request_id:pendingScan});statusTicket++;state={...state,scan};pendingScan=null;renderState();error();}
        catch(e){actionFailure(e);}
        finally{busy=false;controls();refresh();}
    }
    async function cancelScan() {if(!state?.scan?.can_cancel)return;try{state.scan=await request('/scans/'+state.scan.id,'DELETE');renderState();}catch(e){if(e.name!=='AbortError')error(e.message);}}
    async function choose(groupId,key) {
        if(!requireBackend())return;
        const group=groups.find(g=>g.id===groupId),member=group?.members.items.find(i=>i.key===key);
        if(!group||!member||group.stale||saving.has(groupId)||batchBusy||group.review_pending)return;
        const previous=choices.get(groupId),meta=choiceMeta.get(groupId);
        const selected=groupKeys(group),next=selected.includes(key)?selected.filter(k=>k!==key):[...selected,key];if(!next.length)return unchoose(groupId);
        const known=new Map([...(meta?.keepers||[]),...group.members.items].map(m=>[m.key,m.filename]));
        choices.set(groupId,next);choiceMeta.set(groupId,{keeper_keys:next,keepers:next.map(k=>({key:k,filename:known.get(k)||k})),scan_id:group.scan_id});saving.add(groupId);actionError='';error();renderGroups();
        try {
            const data=await request('/choices/'+groupId,'PUT',{scan_id:group.scan_id,keeper_keys:next});
            statusTicket++;state.selection_summary=data.summary;knownVersion=data.summary.version;selectionChanged=false;choiceMeta.set(groupId,data.selection);choices.set(groupId,selectedKeys(data.selection));pending.delete(groupId);pendingBatch=null;
        } catch(e) {
            if(e.name!=='AbortError'){if(previous)choices.set(groupId,previous);else choices.delete(groupId);if(meta)choiceMeta.set(groupId,meta);else choiceMeta.delete(groupId);actionFailure(e);}
        } finally {saving.delete(groupId);renderGroups();refresh();}
    }
    async function unchoose(groupId) {
        if(saving.has(groupId)||batchBusy)return;saving.add(groupId);selectionControls();
        try {const data=await request('/choices/'+groupId,'DELETE');statusTicket++;state.selection_summary=data.summary;knownVersion=data.summary.version;selectionChanged=false;choices.delete(groupId);choiceMeta.delete(groupId);pending.delete(groupId);pendingBatch=null;actionError='';error();if($('dup-choices-dialog').open)await manageChoices();}
        catch(e){actionFailure(e);}finally{saving.delete(groupId);renderGroups();refresh();}
    }
    async function manageChoices(delta=0) {
        choicesPage=Math.max(1,choicesPage+delta);
        try {const data=await request('/choices?page='+choicesPage);choicesPage=data.page;choicesPages=data.pages;state.selection_summary=data.summary;selectionControls();
            $('dup-choices-items').innerHTML=data.items.map(item=>`<article><div><strong>保留 ${esc(keeperLabel(item))}</strong><p>同组其余 ${Math.max(0,item.member_count-(item.keeper_count||1))} 项${item.reserved?' · 已提交后台':item.stale?' · 分组已更新，请重新选择':' · 已保存，等待统一确认'}</p></div><button type="button" class="dup-cancel-choice" data-dup-remove-choice="${esc(item.group_id)}" ${item.reserved?'disabled':''}>移除选择</button></article>`).join('')||'<p class="dup-choice-empty">还没有保存的选择</p>';
            $('dup-choices-page').textContent=choicesPage+' / '+choicesPages;$('dup-choices-prev').disabled=choicesPage<=1;$('dup-choices-next').disabled=choicesPage>=choicesPages;
            if(!$('dup-choices-dialog').open)$('dup-choices-dialog').showModal();
        }catch(e){actionFailure(e);}
    }
    async function confirmAll() {
        if(!requireBackend())return;
        const summary=state?.selection_summary;
        if(batchBusy||saving.size||selectionChanged||!summary?.ready||active(state?.scan))return;
        if(!pendingBatch||pendingBatch.selection_version!==summary.version)pendingBatch={request_id:uuid(),selection_version:summary.version};
        batchBusy=true;renderGroups();actionError='';error();
        try {const job=await request('/review-batches','POST',pendingBatch);pendingBatch=null;knownVersion=null;selectionChanged=false;statusTicket++;state.batches=[job,...(state.batches||[]).filter(b=>b.id!==job.id)].slice(0,10);renderState();if(viewMode==='scroll'){groups=groups.filter(g=>!choices.has(g.id));renderGroups();}await refresh();if(viewMode==='pages')await loadGroups();}
        catch(e){actionFailure(e);}finally{batchBusy=false;renderGroups();refresh();}
    }
    async function confirm(groupId) {
        if(!requireBackend())return;
        const group=groups.find(g=>g.id===groupId),keys=group&&groupKeys(group);if(!group||!keys?.length||group.stale||saving.has(groupId)||batchBusy||group.review_pending||submitting.has(groupId))return;
        const body=pending.get(groupId)||{request_id:uuid(),group_id:groupId,scan_id:group.scan_id,keeper_keys:keys};pending.set(groupId,body);submitting.add(groupId);renderGroups();
        try {const job=await request('/reviews','POST',body);statusTicket++;knownVersion=null;selectionChanged=false;pending.delete(groupId);choices.delete(groupId);choiceMeta.delete(groupId);if(viewMode==='scroll')groups=groups.filter(g=>g.id!==groupId);state.reviews=[job,...(state.reviews||[]).filter(j=>j.id!==job.id)].slice(0,10);actionError='';renderState();error();}
        catch(e){actionFailure(e);}
        finally{submitting.delete(groupId);renderGroups();refresh();}
    }
    function favoriteChanged(type,id,active) {let changed=false;for(const group of groups)for(const item of group.members.items)if(item.media_type===type&&item.id===String(id)&&item.favorite!==active){item.favorite=active;changed=true;}if(changed&&visible)renderGroups();}
    async function favorite(key) {
        const item=groups.flatMap(g=>g.members.items).find(i=>i.key===key);if(!item||favoriting.has(key))return;
        const ticket=generation;favoriting.add(key);renderGroups();
        try {const active=await config.favorite(item,!item.favorite);if(ticket===generation)favoriteChanged(item.media_type,item.id,active);}
        catch(e){actionFailure(e);}finally{if(ticket===generation){favoriting.delete(key);if(visible)renderGroups();}}
    }
    async function more(groupId) {const group=groups.find(g=>g.id===groupId);if(!group)return;try{const next=(group.morePage||0)+1,data=await request('/groups/'+groupId+'/members?page='+next+'&limit=12&sort='+sort);group.morePage=next;const seen=new Set(group.members.items.map(i=>i.key));group.members.items.push(...data.items.filter(i=>!seen.has(i.key)));group.stale=group.stale||data.items.some(i=>i.stale);renderGroups();}catch(e){if(e.name!=='AbortError')error(e.message);}}
    async function review(id=reviewId,delta=0,mode=reviewMode) {
        reviewMode=mode;reviewPage=id===reviewId?Math.max(1,reviewPage+delta):1;reviewId=id;
        try {const data=await request((reviewMode==='batch'?'/review-batches/':'/reviews/')+id+'?page='+reviewPage);reviewPages=data.pages;$('dup-restore-batch').classList.toggle('hidden',reviewMode!=='batch'||active(data));$('dup-restore-batch').dataset.batchId=reviewMode==='batch'?id:'';$('dup-review-title').textContent=(reviewMode==='batch'?'批量复核结果 · ':'复核结果 · ')+(labels[data.status]||data.status);$('dup-review-items').innerHTML=(reviewParent&&reviewMode==='single'?'<button type="button" class="dup-review-back" data-dup-review-back>← 返回批量结果</button>':'')+data.items.map(item=>`<div><span><strong>${esc(reviewMode==='batch'?'保留 '+keeperLabel(item):item.filename||item.key)}</strong><small>${esc(item.message||labels[item.status]||item.status)}</small>${reviewMode==='batch'&&item.review_id?`<button type="button" class="dup-review-child" data-dup-child-review="${esc(item.review_id)}">查看该组结果 →</button>`:''}</span><b>${esc(labels[item.status]||item.status)}</b></div>`).join('');$('dup-review-page').textContent=reviewPage+' / '+reviewPages;$('dup-review-prev').disabled=reviewPage<=1;$('dup-review-next').disabled=reviewPage>=reviewPages;if(!$('dup-review-dialog').open)$('dup-review-dialog').showModal();}catch(e){if(e.name!=='AbortError')error(e.message);}
    }
    function show() {if(visible)return;visible=true;generation++;controller=new AbortController();try{viewMode=RHVideoHost.storage.getItem(modeKey())==='pages'?'pages':'scroll';}catch(_){viewMode='scroll';}knownVersion=null;selectionChanged=false;try{const key=modeKey(),value=key&&RHVideoHost.storage.getItem(key+'.sort');sort=['time_asc','time_desc','size_asc','size_desc'].includes(value)?value:'similarity';}catch(_){sort='similarity';}$('dup-sort').value=sort;resetFeed();feedControls();feedObserver.observe($('dup-scroll-loader'));refresh();window.RHDuplicateRules?.show();}
    function hide() {window.RHDuplicateRules?.hide();visible=false;generation++;clearTimeout(timer);controller?.abort();observer.disconnect();feedObserver.disconnect();previewQueue.length=0;previews.forEach(url=>URL.revokeObjectURL(url));previews.clear();listSignature='';$('dup-review-dialog').close();$('dup-choices-dialog').close();}
    function init(options) {
        config=options;$('dup-sort').addEventListener('change',event=>setSort(event.target.value));$('tab-duplicates').addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
            if(b.id==='dup-scan')return scan();if(b.id==='dup-cancel-scan')return cancelScan();
            if(b.dataset.dupKind){kind=b.dataset.dupKind;resetFeed();return refresh();}
            if(b.dataset.dupMode)return setMode(b.dataset.dupMode);if(b.id==='dup-load-more')return loadMore();if(b.id==='dup-reload')return reloadGroups();
            if(b.id==='dup-rules-open')return RHDuplicateRules.open();if(b.dataset.dupIgnore)return ignore(b.dataset.dupIgnore);if(b.dataset.dupFavorite)return favorite(b.dataset.dupFavorite);
            if(b.dataset.dupKeep)return choose(b.dataset.dupGroup,b.dataset.dupKeep);
            if(b.dataset.dupUnchoose)return unchoose(b.dataset.dupUnchoose);
            if(b.id==='dup-manage-choices')return manageChoices();if(b.id==='dup-confirm-all')return confirmAll();
            if(b.dataset.dupConfirm)return confirm(b.dataset.dupConfirm);
            if(b.dataset.dupMore)return more(b.dataset.dupMore);
            if(b.dataset.dupPlay)return play(b.dataset.dupPlay);
            if(b.dataset.dupReview){reviewParent=null;return review(b.dataset.dupReview,0,'single');}
            if(b.dataset.dupBatchReview){reviewParent=null;return review(b.dataset.dupBatchReview,0,'batch');}
            if(b.id==='dup-prev'||b.id==='dup-next'){page+=b.id==='dup-next'?1:-1;return loadGroups().catch(e=>error(e.message));}
        });
        $('dup-choices-dialog').addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.id==='dup-choices-close')return $('dup-choices-dialog').close();if(b.dataset.dupRemoveChoice)return unchoose(b.dataset.dupRemoveChoice);if(b.id==='dup-choices-prev'||b.id==='dup-choices-next')return manageChoices(b.id==='dup-choices-prev'?-1:1);});
        $('dup-review-dialog').addEventListener('click',event=>{if(event.target.closest('#dup-restore-batch'))return RHDuplicateRules.restoreBatch($('dup-restore-batch').dataset.batchId);const child=event.target.closest('[data-dup-child-review]');if(child){reviewParent=reviewId;return review(child.dataset.dupChildReview,0,'single');}if(event.target.closest('[data-dup-review-back]')){const parent=reviewParent;reviewParent=null;return review(parent,0,'batch');}if(event.target.closest('[data-dup-review-close]'))$('dup-review-dialog').close();if(event.target.closest('#dup-review-prev'))review(reviewId,-1);if(event.target.closest('#dup-review-next'))review(reviewId,1);});
        document.addEventListener('visibilitychange',()=>{if(!document.hidden&&visible)refresh();else clearTimeout(timer);});
    }
    window.RHDuplicates={init,show,hide,refresh,scan,cancelScan,choose,unchoose,confirm,confirmAll,manageChoices,setMode,setSort,ignore,loadPreviews,loadMore,reloadGroups,play,favorite,favoriteChanged,more,review,reset(){hide();window.RHDuplicateRules?.reset();state=null;groups=[];choices.clear();choiceMeta.clear();saving.clear();favoriting.clear();pending.clear();pendingBatch=null;batchBusy=false;pendingScan=null;jobSignature='';$('dup-groups').textContent='';$('dup-review-jobs').textContent='';}};
})();
