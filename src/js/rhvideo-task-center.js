/* Packaged list/detail task workspace. Reads only; queue writes use their own
 * guarded semantic actions. Neither a refresh nor a failed read replays a write. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHVideoTaskCenter=value;})(globalThis,()=>{
  'use strict';
  const views={running:'运行中',queued:'排队中',failed:'失败',history:'历史'};
  const statuses=[['all','所有结果'],['succeeded','成功'],['issues','失败/中断'],['skipped','跳过'],['cancelled','已停止']];
  const statusOptions=kind=>statuses.filter(([id])=>kind==='replacement'||!['skipped','cancelled'].includes(id));
  const filterKeys=['queue','view','q','days','status','pageNumber'];
  const contextKey=value=>JSON.stringify(filterKeys.map(key=>value[key]));
  function validatePage(value){
    if(!value||!Array.isArray(value.items)||value.items.length>25||!Number.isSafeInteger(value.page)||value.page<1||!Number.isSafeInteger(value.pages)||value.pages<value.page||!Number.isSafeInteger(value.total)||value.total<0)throw Error('任务列表分页格式无效');
    const ids=new Set();for(const item of value.items){if(!item||typeof item.id!=='string'||!item.id||item.id.length>160||ids.has(item.id)||typeof item.filename!=='string'||typeof item.status!=='string')throw Error('任务列表条目格式无效');ids.add(item.id);}return value;
  }
  function install(ctx){
    const {el,button,select,listen,action,object}=ctx;
    let root=null,nodes=null,config=null,items=[],selected='',detail=null,error='',detailError='',signature='',listTicket=0,detailTicket=0,generation=0,loading=false,detailLoading=false,searchTimer=null,observer=null,promotionSelection=null;
    const current=()=>!!root?.isConnected&&ctx.opened()&&config?.identity===ctx.identity();
    const snapshot=()=>({opened:current(),loading,detailLoading,kind:config?.queue||null,view:config?.view||null,selected,items:JSON.parse(JSON.stringify(items)),detail:current()&&selected?ctx.presentation.snapshot(nodes.detail):null,batchesVisible:current()&&!!root.closest('dialog')?.querySelector('.rv-task-batches:not([hidden])')?.open,error,detailError});
    function resetSelection(){detailTicket++;selected='';detail=null;detailError='';detailLoading=false;if(nodes){nodes.detail.replaceChildren(el('p','选择一个任务查看流程','rv-task-empty'));nodes.detail.scrollTop=0;}paintSelection();}
    function paintSelection(){root?.querySelectorAll('[data-api-action="rhvideo.task.select"]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.taskSelection===selected)));}
    function closed(){generation++;listTicket++;detailTicket++;clearTimeout(searchTimer);searchTimer=null;observer?.disconnect();observer=null;root=nodes=config=null;items=[];selected='';detail=promotionSelection=null;error=detailError=signature='';loading=detailLoading=false;}
    function mount(target){
      if(root===target&&nodes&&target.contains(nodes.filters))return;
      closed();root=target;root.replaceChildren();
      const filters=el('div',undefined,'wb-filters rv-task-filters'),queue=select([['default','默认处理'],['replacement','原片替换']],'server.filter',value=>({key:'queue',value}),'default'),view=select(Object.entries(views),'server.filter',value=>({key:'view',value}),'running');
      queue.setAttribute('aria-label','处理队列');view.setAttribute('aria-label','任务视图');
      const search=el('input');search.type='search';search.maxLength=200;search.placeholder='搜索文件名';search.setAttribute('aria-label','搜索任务文件名');search.dataset.apiAction='rhvideo.server.filter';
      const days=select([[7,'7 天'],[30,'30 天'],[90,'90 天'],[0,'全部时间']],'server.filter',value=>({key:'days',value:Number(value)}),7),status=select(statusOptions('default'),'server.filter',value=>({key:'status',value}),'all'),history=el('div',undefined,'rv-task-history-filters');days.setAttribute('aria-label','历史范围');status.setAttribute('aria-label','历史结果');history.append(days,status);filters.append(queue,view,search,history);
      const counts=el('div',undefined,'rv-task-counts'),countNodes={};for(const [key,label]of Object.entries(views)){const value=button(label,'server.filter',{key:'view',value:key});value.dataset.taskView=key;value.replaceChildren(el('span',label),countNodes[key]=el('strong','0'));counts.append(value);}
      const problem=el('p',undefined,'rv-task-center-error wb-error');problem.setAttribute('role','alert');problem.hidden=true;
      const workspace=el('div',undefined,'rv-task-workspace'),list=el('div',undefined,'rv-task-list'),detailRoot=el('section',undefined,'rv-task-inline-detail');list.setAttribute('aria-label','任务列表');detailRoot.setAttribute('aria-label','所选任务流程');workspace.append(list,detailRoot);
      const pagination=el('footer',undefined,'rv-task-pagination'),previous=button('上一页','server.filter',()=>({key:'pageNumber',value:Math.max(1,(config?.pageNumber||1)-1)})),next=button('下一页','server.filter',()=>({key:'pageNumber',value:(config?.pageNumber||1)+1})),page=el('span'),total=el('span');pagination.append(total,previous,page,next);
      root.append(ctx.priorityMessage('default'),filters,counts,problem,workspace,pagination);nodes={filters,queue,view,search,history,days,status,countNodes,problem,list,detail:detailRoot,previous,next,page,total};resetSelection();
      let composing=false;
      const schedule=event=>{clearTimeout(searchTimer);searchTimer=null;if(composing||event?.isComposing)return;const version=generation;searchTimer=setTimeout(()=>{searchTimer=null;if(version!==generation||!current()||document.hidden)return;void ctx.invoke('server.filter',{key:'q',value:search.value.trim()}).catch(ctx.notice);},250);};
      listen(search,'compositionstart',()=>{composing=true;clearTimeout(searchTimer);searchTimer=null;},'tasks.search.composition');listen(search,'compositionend',event=>{composing=false;schedule(event);},'tasks.search.end');listen(search,'input',schedule,'tasks.search.input');
    }
    function syncControls(value){
      nodes.queue.value=value.queue;nodes.view.value=value.view;nodes.days.value=String(value.days);nodes.history.hidden=value.view!=='history';
      if(!config||config.queue!==value.queue){nodes.status.replaceChildren(...statusOptions(value.queue).map(([id,label])=>new Option(label,id)));}
      nodes.status.value=value.status;if(!config||config.q!==value.q)nodes.search.value=value.q;
      root.querySelectorAll('[data-task-view]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.taskView===value.view)));
      const message=root.querySelector('.wb-task-priority-message');message.dataset.queue=value.queue;
    }
    function paintList(data){
      const nextSignature=JSON.stringify([config.queue,config.view,data.page,data.items]);
      for(const [key,node]of Object.entries(nodes.countNodes)){const count=data.counts?.[key];node.textContent=Number.isSafeInteger(count)&&count>=0?count.toLocaleString('zh-CN'):'0';}
      nodes.previous.disabled=data.page<=1;nodes.next.disabled=data.page>=data.pages;nodes.page.textContent=data.page+' / '+data.pages;nodes.total.textContent='共 '+data.total.toLocaleString('zh-CN')+' 项';
      if(signature===nextSignature)return;
      const scroll=nodes.list.scrollTop,focused=document.activeElement?.closest('[data-task-id]'),focusId=focused?.dataset.taskId,focusAction=document.activeElement?.dataset.apiAction;
      const thumbnails=new Map([...nodes.list.querySelectorAll('[data-task-id]')].map(row=>[row.dataset.taskId,row.querySelector('.wb-thumbnail-preview')]));observer?.disconnect();
      nodes.list.replaceChildren();observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer?.unobserve(entry.target);const item=entry.target._task;if(current()&&entry.target.isConnected&&nodes.list.contains(entry.target)&&item)ctx.thumbnail(entry.target,item,thumbnails.get(item.id));}},{root:nodes.list,rootMargin:'80px'}):null;
      for(const item of data.items){
        const row=el('section',undefined,'wb-row rv-task-list-row');row.dataset.taskId=item.id;row.dataset.queue=config.queue;
        const cover=el('div',undefined,'rv-task-list-cover');if(item.video_id){cover._task=item;row.append(cover);}
        const choose=button('','task.select',{kind:config.queue,id:item.id},'button secondary rv-task-select');choose.dataset.taskSelection=item.id;choose.setAttribute('aria-pressed',String(item.id===selected));choose.append(el('strong',item.filename));
        const meta=el('span',undefined,'rv-task-list-meta');meta.append(el('span',ctx.P.kindLabel(item,config.queue)),el('span',ctx.P.date(item.finished_at||item.started_at||item.queued_at)));choose.append(meta);
        const known=Object.hasOwn(ctx.P.labels,item.status),status=el('span',known?ctx.P.labels[item.status]:item.status,'rv-task-badge');status.dataset.status=known?item.status:'unknown';choose.append(status);if(item.prioritized)choose.append(el('span','↑ 优先处理','rv-task-pinned'));if(item.blocked)choose.append(el('small','等待原片替换完成后处理'));if(config.view==='failed'&&item.message)choose.append(el('small',item.message,'rv-task-failure'));row.append(choose);
        if(item.can_prioritize===true&&item.status==='pending')row.append(ctx.priorityButton(item,config.queue));nodes.list.append(row);
        if(item.video_id){if(observer)observer.observe(cover);else ctx.thumbnail(cover,item,thumbnails.get(item.id));}
      }
      if(!data.items.length)nodes.list.append(el('p',config.q?'没有匹配的任务':config.view==='failed'?'当前没有失败的任务':config.view==='queued'?'暂时没有等待任务':config.view==='history'?'此范围内没有历史结果':'当前没有正在处理的任务','rv-task-empty'));
      signature=nextSignature;nodes.list.scrollTop=scroll;
      if(focusId&&focusAction)for(const row of nodes.list.querySelectorAll('[data-task-id]'))if(row.dataset.taskId===focusId){row.querySelector('[data-api-action="'+focusAction+'"]')?.focus({preventScroll:true});break;}
    }
    function detailProblem(failure){detailError=String(failure.message||failure);let node=nodes.detail.querySelector('.rv-task-read-error');if(!node){node=el('p',undefined,'rv-task-read-error wb-error');node.setAttribute('role','alert');nodes.detail.prepend(node);}node.textContent='读取任务失败：'+detailError;ctx.presentation.connection(detailError);}
    async function readDetail(){
      if(!current()||!selected)return null;const ticket=++detailTicket,version=generation,key=contextKey(config),id=selected,kind=config.queue;detailLoading=true;nodes.detail.setAttribute('aria-busy','true');
      const valid=()=>current()&&version===generation&&ticket===detailTicket&&key===contextKey(config)&&id===selected;
      try{const value=await ctx.remote('tasks.detail',{params:{queue:kind,entry:id}});if(!valid())return {stale:true};if(value?.id!==id)throw Error('任务详情回执与所选任务不一致');ctx.presentation.paint(nodes.detail,value,kind);detail=value;detailError='';ctx.detailFooter(nodes.detail,kind,id,'task.refreshSelection');return value;}
      catch(failure){if(!valid())return {stale:true};detailProblem(failure);throw failure;}
      finally{if(valid()){detailLoading=false;nodes.detail.setAttribute('aria-busy','false');}}
    }
    async function selectTask(kind,id,fromUser=false){
      if(!current()||kind!==config.queue||!items.some(item=>item.id===id))throw Error('请选择当前列表中的任务');
      if(selected!==id){resetSelection();selected=id;nodes.detail.textContent='正在读取处理流程…';paintSelection();}
      const value=await readDetail();if(fromUser&&!value?.stale&&current()&&selected===id&&globalThis.innerWidth<=700)nodes.detail.scrollIntoView({block:'start',behavior:'smooth'});return value;
    }
    async function render(target,value,guard){
      mount(target);value={...value,identity:ctx.identity()};syncControls(value);const changed=!config||config.identity!==value.identity||contextKey(config)!==contextKey(value);config=value;
      if(changed){clearTimeout(searchTimer);searchTimer=null;if(!promotionSelection||promotionSelection.id!==selected||promotionSelection.identity!==value.identity||promotionSelection.key!==contextKey(value))resetSelection();signature='';nodes.list.replaceChildren(el('p','正在读取任务…','rv-task-empty'));nodes.list.scrollTop=0;}promotionSelection=null;
      const ticket=++listTicket,version=generation,key=contextKey(config);loading=true;nodes.list.setAttribute('aria-busy','true');
      const valid=()=>current()&&version===generation&&ticket===listTicket&&key===contextKey(config)&&guard();let data;
      try{data=validatePage(await ctx.remote('tasks.list',{query:{kind:config.queue,view:config.view,page:config.pageNumber,limit:25,days:config.days,status:config.status,q:config.q}}));if(!valid())return {stale:true};error='';nodes.problem.hidden=true;items=data.items;ctx.page(data.page);config.pageNumber=data.page;paintList(data);}
      catch(failure){if(!valid())return {stale:true};error=String(failure.message||failure);nodes.problem.textContent='读取任务列表失败：'+error;nodes.problem.hidden=false;if(!signature)nodes.list.replaceChildren(el('p','暂时无法读取任务','rv-task-empty'));throw failure;}
      finally{if(current()&&ticket===listTicket){loading=false;nodes.list.setAttribute('aria-busy','false');}}
      if(selected&&!items.some(item=>item.id===selected))resetSelection();
      if(!selected&&items.length&&['running','failed'].includes(config.view))await selectTask(config.queue,items[0].id);
      else if(selected&&config.view!=='history')await readDetail();
      ctx.changed?.();return {active:ctx.hasLiveWork(data)||ctx.hasLiveWork(detail)};
    }
    action('task.centerState',object(),snapshot,'read');
    action('task.select',object({kind:{type:'string',enum:['default','replacement']},id:{type:'string',minLength:1,maxLength:160}},['kind','id']),({kind,id})=>selectTask(kind,id,true),'read');
    action('task.refreshSelection',object(),()=>readDetail(),'read');
    listen(document,'visibilitychange',()=>{if(document.hidden){clearTimeout(searchTimer);searchTimer=null;}else if(current()&&nodes.search.value.trim()!==config.q){clearTimeout(searchTimer);const version=generation;searchTimer=setTimeout(()=>{searchTimer=null;if(version===generation&&current()&&!document.hidden)void ctx.invoke('server.filter',{key:'q',value:nodes.search.value.trim()}).catch(ctx.notice);},250);}},'tasks.visibility');
    return {render,closed,reset:closed,state:snapshot,retainSelection(kind,id){if(current()&&config.queue===kind&&selected===id)promotionSelection={id,identity:config.identity,key:contextKey({...config,pageNumber:1})};}};
  }
  return {install,views,statusOptions,contextKey,validatePage};
});
