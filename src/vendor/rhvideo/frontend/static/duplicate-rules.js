/* Rules and previews are persisted backend jobs; this panel only submits actions. */
(() => {
    'use strict';
    const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const labels={queued:'排队中',running:'后台核对中',ready:'方案已就绪',confirming:'正在提交后台',submitted:'已提交后台',cancelled:'已取消',failed:'未完成',completed:'已完成',partial:'部分完成'};
    const active=p=>['queued','running','confirming'].includes(p?.status);
    let config,controller,visible=false,generation=0,timer,ticket=0,detailTicket=0,pane='rules',data={},plan=null,planId='',page=1,pages=1,filter='all',busy=false,dirty=false,supported=false,ignorePage=1,ignorePages=1,restoreId='',restorePage=1,restorePages=1,restoreTicket=0,pendingPlan=null;
    const pendingConfirms=new Map(),pendingRestores=new Map();
    const uuid=()=>{const a=crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;const h=[...a].map(v=>v.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
    const bytes=value=>{let n=Number(value||0),i=0;while(n>=1024&&i<4){n/=1024;i++;}return n.toFixed(i?1:0)+' '+['B','KB','MB','GB','TB'][i];};
    function feedback(message='',tone='error'){$('dup-rules-error').textContent=message;$('dup-rules-error').dataset.tone=tone;}
    async function request(path,method='GET',body){
        const token=config.getToken(),session=generation,parent=controller?.signal,local=new AbortController(),abort=()=>local.abort();let timedOut=false;
        parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)local.abort();const timeout=setTimeout(()=>{timedOut=true;local.abort();},15000);
        try{
            const response=await fetch(config.base+'/duplicates'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:local.signal,cache:'no-store'});
            const result=await response.json();
            if(session!==generation||token!==config.getToken())throw new DOMException('Session changed','AbortError');
            if(!response.ok)throw Error(response.status===404?'规则整理接口需要更新后端后启用':typeof result.detail==='string'?result.detail:response.status===422?'请检查目录路径及提交参数':'请求失败，请重试');
            return result;
        }catch(e){if(session!==generation||parent?.aborted||token!==config.getToken())throw new DOMException('Session changed','AbortError');if(timedOut)throw Error('请求超时，后台任务仍会继续；可重新打开查看，重复提交不会重复执行');throw e;}
        finally{clearTimeout(timeout);parent?.removeEventListener('abort',abort);}
    }
    function failure(e){if(e.name!=='AbortError')feedback(e.message);}
    function rules(){const lines=id=>$(id).value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);return {priority_paths:lines('dup-rule-priority'),protected_paths:lines('dup-rule-protected'),removal_paths:lines('dup-rule-removal')};}
    function fillRules(){const r=data.rules||{};for(const [id,key] of [['dup-rule-priority','priority_paths'],['dup-rule-protected','protected_paths'],['dup-rule-removal','removal_paths']])$(id).value=(r[key]||[]).join('\n');dirty=false;}
    function controls(){
        $('dup-rule-save').disabled=busy||!supported;$('dup-rule-generate').disabled=busy||!supported||(data.plans||[]).some(active);
        $('dup-plan-confirm').disabled=busy||plan?.status!=='ready'||!plan?.progress?.ready;
        $('dup-plan-confirm').textContent=plan?.status==='submitted'?'已提交后台':`确认整理 ${plan?.progress?.ready||0} 组`;
        $('dup-plan-cancel').disabled=busy||!plan||['confirming','submitted','cancelled','failed'].includes(plan.status);
        $('dup-plan-prev').disabled=page<=1||busy;$('dup-plan-next').disabled=page>=pages||busy;
    }
    function renderHistory(){
        $('dup-plan-history').innerHTML=(data.plans||[]).map(p=>`<option value="${esc(p.id)}" ${p.id===planId?'selected':''}>${esc(labels[p.status]||p.status)} · ${esc(new Date(p.created_at).toLocaleString('zh-CN'))}</option>`).join('')||'<option value="">尚无方案</option>';
        $('dup-restore-history').innerHTML=(data.restores||[]).map(r=>`<button type="button" class="dup-restore-record" data-restore-id="${esc(r.id)}"><strong>${esc(labels[r.status]||r.status)} · 批次恢复</strong><span>已恢复 ${r.done} / ${r.total}${r.failed?' · 未完成 '+r.failed:''}</span></button>`).join('')||'<p class="dup-rule-note">尚无批次恢复记录。</p>';
        const current=(data.plans||[]).find(active),restore=(data.restores||[]).find(active);
        $('dup-rules-summary').textContent=!supported?'更新服务后可启用目录规则、方案预览与批次恢复。':current?`${labels[current.status]} · 已核对 ${current.progress?.done||0} 组${current.progress?.current?' · '+current.progress.current:''}`:restore?`后台正在恢复 ${restore.done} / ${restore.total} 项`:'收藏与保护目录优先保留，先预览，再确认。';
        controls();
    }
    function mergeMembers(incoming,previous){if(previous?.members?.length>incoming.members.length){const current=new Map(incoming.members.map(m=>[m.key,m]));incoming.members=previous.members.map(m=>current.get(m.key)||m);incoming.member_page=previous.member_page;}return incoming;}
    function renderPlan(){
        const p=plan?.progress||{};
        $('dup-plan-summary').innerHTML=!plan?'<p>尚未生成方案。先设置优先保留目录。</p>':`<div class="dup-plan-phase"><strong>${esc(labels[plan.status]||plan.status)}</strong><span>${esc(p.current||p.error||`已核对 ${p.done||0} 组`)}</span></div><div class="dup-plan-stats"><div><b>${p.ready||0}</b><span>推荐处理组</span></div><div><b>${p.keep||0}</b><span>保留文件</span></div><div><b>${p.remove||0}</b><span>待暂存文件</span></div><div><b>${p.skipped||0}</b><span>跳过组</span></div></div>${plan.status==='ready'||plan.status==='submitted'?`<p>以下仅是方案，确认前不会移动文件。方案使用生成时的目录规则，修改规则后请重新生成。待暂存体积约 ${bytes(p.bytes)}，30 天内可恢复，暂存仍占空间。${plan.batch_id?'已进入后台复核队列，可在最近任务查看并按批次恢复。':''}</p>`:'<p>后台生成方案，关闭面板或刷新网页不会取消。确认前不会移动文件。</p>'}`;
        $('dup-plan-items').innerHTML=(plan?.items||[]).map(item=>`<article class="dup-plan-item" data-plan-status="${item.status}"><header><div><strong>${item.status==='ready'?`保留 ${item.keep_count} 项 · 暂存 ${item.remove_count} 项`:'已跳过'}</strong><p>${esc(item.reason)}</p></div>${plan.status==='ready'&&item.status==='ready'?`<button type="button" class="dup-cancel-choice" data-plan-skip="${item.group_id}">跳过本组</button>`:''}</header><div class="dup-plan-members">${item.members.map(m=>`<div class="dup-plan-member${item.keeper_keys.includes(m.key)?' is-kept':''}"><button type="button" class="dup-plan-preview" data-image-preview data-preview-title="${esc(m.filename)}" aria-label="放大预览 ${esc(m.filename)}"><img data-dup-preview="${esc(m.preview_url)}" alt="${esc(m.filename)}" loading="lazy" decoding="async"></button><div><strong title="${esc(m.filename)}">${esc(m.filename)}</strong><small title="${esc(m.source_path)}">${esc(m.source_path)}</small><span>${bytes(m.size)}${m.protected?' · 保护项':''}</span></div><button type="button" class="dup-plan-keep" data-plan-toggle="${esc(m.key)}" data-plan-group="${item.group_id}" aria-pressed="${item.keeper_keys.includes(m.key)}" ${busy||plan.status!=='ready'||item.status!=='ready'||m.protected?'disabled':''}>${item.status!=='ready'?'不处理':item.keeper_keys.includes(m.key)?'✓ 保留':'待暂存'}</button></div>`).join('')}</div>${item.members.length<item.member_count?`<button type="button" class="dup-more" data-plan-more="${item.group_id}">查看更多文件（${item.members.length} / ${item.member_count}）</button>`:''}</article>`).join('');
        $('dup-plan-page').textContent=`${page} / ${pages}`;controls();window.RHDuplicates?.loadPreviews();
    }
    async function loadPlan(id=planId,newPage=page){
        if(!id){plan=null;renderPlan();return;}
        const current=++detailTicket,previous=plan;planId=id;
        try{const value=await request('/plans/'+id+'?page='+newPage+'&status='+filter);if(current!==detailTicket)return;
            if(previous?.id===id)for(const item of value.items){const old=previous.items?.find(i=>i.group_id===item.group_id);mergeMembers(item,old);}
            plan=value;page=value.page;pages=value.pages;renderPlan();
        }catch(e){failure(e);}
    }
    async function refresh(){
        if(!visible||document.hidden)return;clearTimeout(timer);const current=++ticket;
        try{const value=await request('/rules');if(current!==ticket)return;data=value;supported=!!value.rules;
            if(!planId)planId=value.plans?.[0]?.id||'';renderHistory();
            if($('dup-rules-dialog').open&&!busy){if(pane==='plan')await loadPlan();if(pane==='restores'&&restoreId)await showRestore(restoreId);}
        }catch(e){if($('dup-rules-dialog').open)failure(e);}
        finally{if(current===ticket&&visible)timer=setTimeout(refresh,(data.plans||[]).some(active)||(data.restores||[]).some(active)?2000:10000);}
    }
    async function open(tab='rules'){
        if(!visible)show();feedback();if(!$('dup-rules-dialog').open)$('dup-rules-dialog').showModal();
        await refresh();if(!dirty)fillRules();await setPane(tab);
    }
    async function setPane(tab){if(!['rules','plan','ignored','restores'].includes(tab))return;pane=tab;
        for(const name of ['rules','plan','ignored','restores'])$('dup-rule-pane-'+name).classList.toggle('hidden',name!==tab);
        document.querySelectorAll('[data-rule-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ruleTab===tab)));
        if(tab==='plan')await loadPlan();if(tab==='ignored')await ignores();if(tab==='restores'&&restoreId)await showRestore(restoreId);
    }
    async function save(){if(busy||!supported)return;busy=true;controls();feedback();try{const value=await request('/rules','PUT',rules());data.rules=value.rules;dirty=false;feedback('规则已保存','success');}catch(e){failure(e);}finally{busy=false;controls();}}
    async function generate(){
        if(busy||!supported)return;const body={kind:$('dup-rule-kind').value,rules:rules()};if(!body.rules.priority_paths.length){feedback('请至少填写一个优先保留目录');return;}
        if(!pendingPlan||JSON.stringify(pendingPlan.body)!==JSON.stringify(body))pendingPlan={body,request_id:uuid()};
        busy=true;controls();feedback();
        try{await request('/rules','PUT',body.rules);dirty=false;const value=await request('/plans','POST',{...body,request_id:pendingPlan.request_id});pendingPlan=null;planId=value.id;plan=value;page=1;filter='all';$('dup-plan-filter').value='all';await setPane('plan');}
        catch(e){failure(e);}finally{busy=false;controls();refresh();}
    }
    async function edit(groupId,key,skip=false){
        const item=plan?.items?.find(i=>i.group_id===groupId);if(!item||busy||plan.status!=='ready')return;
        const keys=new Set(item.keeper_keys);if(key){if(keys.has(key))keys.delete(key);else keys.add(key);}
        if(!skip&&!keys.size){feedback('每组至少保留一项');return;}
        busy=true;controls();feedback();
        try{const value=await request('/plans/'+planId+'/items/'+groupId,'PUT',{keeper_keys:[...keys],skip});Object.assign(item,mergeMembers(value.item,item));plan.progress=value.plan.progress;renderPlan();}
        catch(e){failure(e);}finally{busy=false;renderPlan();}
    }
    async function more(groupId){const item=plan?.items?.find(i=>i.group_id===groupId);if(!item||busy)return;
        try{const value=await request('/plans/'+planId+'/items/'+groupId+'?page='+((item.member_page||0)+1));const keys=new Set(item.members.map(m=>m.key));item.members.push(...value.members.filter(m=>!keys.has(m.key)));item.member_page=value.member_page;renderPlan();}catch(e){failure(e);}
    }
    async function confirm(){if(busy||plan?.status!=='ready')return;busy=true;controls();feedback();if(!pendingConfirms.has(planId))pendingConfirms.set(planId,uuid());
        try{const value=await request('/plans/'+planId+'/confirm','POST',{request_id:pendingConfirms.get(planId)});plan={...plan,...value};renderPlan();window.RHDuplicates?.refresh();}
        catch(e){failure(e);}finally{busy=false;controls();refresh();}
    }
    async function cancel(){if(!plan||busy)return;busy=true;controls();try{plan={...plan,...await request('/plans/'+planId,'DELETE')};renderPlan();}catch(e){failure(e);}finally{busy=false;controls();refresh();}}
    async function ignores(delta=0){ignorePage=Math.max(1,ignorePage+delta);
        try{const value=await request('/ignores?page='+ignorePage);ignorePages=value.pages;$('dup-ignore-items').innerHTML=value.items.map(i=>`<article class="dup-ignore-record"><div><strong>${esc(i.label)}</strong><small>${esc(new Date(i.created_at).toLocaleString('zh-CN'))}</small></div><button type="button" class="btn btn-secondary" data-rule-unignore="${esc(i.signature)}">取消忽略</button></article>`).join('')||'<p class="dup-rule-note">尚无已忽略分组。</p>';$('dup-ignore-page').textContent=ignorePage+' / '+ignorePages;$('dup-ignore-prev').disabled=ignorePage<=1;$('dup-ignore-next').disabled=ignorePage>=ignorePages;}
        catch(e){failure(e);}
    }
    async function unignore(signature){try{await request('/ignores/'+signature,'DELETE');await ignores();window.RHDuplicates?.reloadGroups();refresh();}catch(e){failure(e);}}
    async function restoreBatch(batchId){
        if(!batchId||busy)return;busy=true;if(!pendingRestores.has(batchId))pendingRestores.set(batchId,uuid());
        try{const value=await request('/review-batches/'+batchId+'/restore','POST',{request_id:pendingRestores.get(batchId)});restoreId=value.id;restorePage=1;pendingRestores.delete(batchId);$('dup-review-dialog').close();await open('restores');await showRestore(restoreId);}
        catch(e){if(e.name==='AbortError')return;if(!$('dup-rules-dialog').open){$('dup-review-dialog').close();await open('restores');}failure(e);}finally{busy=false;controls();refresh();}
    }
    async function showRestore(id,newPage){const current=++restoreTicket;restorePage=id!==restoreId?1:newPage??restorePage;restoreId=id;try{const value=await request('/restores/'+id+'?page='+restorePage);if(current!==restoreTicket)return;restorePages=value.pages;restorePage=value.page;$('dup-restore-page').textContent=restorePage+' / '+restorePages;$('dup-restore-prev').disabled=restorePage<=1;$('dup-restore-next').disabled=restorePage>=restorePages;$('dup-restore-result').innerHTML=`<div class="dup-plan-summary"><strong>${esc(labels[value.status]||value.status)}</strong><p>已恢复 ${value.done} / ${value.total} 项，未完成 ${value.failed} 项。恢复的文件可在原列表查看；更新检测后重新分组。</p></div>`+value.items.map(i=>`<p class="dup-rule-note">${esc(i.key)} · ${esc(i.message||labels[i.status]||i.status)}</p>`).join('');}catch(e){failure(e);}}
    function show(){if(visible)return;visible=true;generation++;controller=new AbortController();refresh();}
    function hide(){visible=false;generation++;clearTimeout(timer);controller?.abort();$('dup-rules-dialog').close();}
    function reset(){hide();data={};plan=null;planId='';restoreId='';pendingPlan=null;pendingConfirms.clear();pendingRestores.clear();dirty=false;busy=false;feedback();fillRules();$('dup-plan-items').textContent='';$('dup-restore-result').textContent='';$('dup-ignore-items').textContent='';$('dup-restore-history').textContent='';$('dup-plan-summary').textContent='';$('dup-plan-history').textContent='';$('dup-rules-summary').textContent='收藏与保护目录优先保留，先预览，再确认。';}
    function init(options){config=options;
        for(const id of ['dup-rule-priority','dup-rule-protected','dup-rule-removal'])$(id).addEventListener('input',()=>{dirty=true;});
        $('dup-plan-history').addEventListener('change',e=>loadPlan(e.target.value,1));$('dup-plan-filter').addEventListener('change',e=>{filter=e.target.value;loadPlan(planId,1);});
        $('dup-rules-dialog').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
            if(b.id==='dup-rules-close')return $('dup-rules-dialog').close();if(b.dataset.ruleTab)return setPane(b.dataset.ruleTab);
            if(b.id==='dup-rule-save')return save();if(b.id==='dup-rule-generate')return generate();if(b.id==='dup-plan-confirm')return confirm();if(b.id==='dup-plan-cancel')return cancel();
            if(b.dataset.planToggle)return edit(b.dataset.planGroup,b.dataset.planToggle);if(b.dataset.planSkip)return edit(b.dataset.planSkip,null,true);if(b.dataset.planMore)return more(b.dataset.planMore);
            if(b.id==='dup-plan-prev'||b.id==='dup-plan-next')return loadPlan(planId,page+(b.id==='dup-plan-next'?1:-1));
            if(b.id==='dup-ignore-prev'||b.id==='dup-ignore-next')return ignores(b.id==='dup-ignore-next'?1:-1);if(b.dataset.ruleUnignore)return unignore(b.dataset.ruleUnignore);
            if(b.id==='dup-restore-prev'||b.id==='dup-restore-next')return showRestore(restoreId,restorePage+(b.id==='dup-restore-next'?1:-1));if(b.dataset.restoreId)return showRestore(b.dataset.restoreId);
        });
        document.addEventListener('visibilitychange',()=>{if(visible&&!document.hidden)refresh();else clearTimeout(timer);});
    }
    window.RHDuplicateRules={init,show,hide,reset,open,setPane,refresh,save,generate,loadPlan,edit,more,confirm,cancel,ignores,unignore,restoreBatch,showRestore};
})();
